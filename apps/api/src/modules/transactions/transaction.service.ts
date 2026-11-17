import { ERROR_CODES, type PaginationMeta, type UserRole } from '@istana-buah/shared';
import {
  Prisma,
  type PrismaClient,
  type Transaction as PrismaTransaction,
  type TransactionItem as PrismaTransactionItem,
} from '@prisma/client';
import { CACHE_NAMESPACES, type CacheStore } from '../../lib/cache';
import { AppError } from '../../utils/app-error';
import { recordAuditLog } from '../../utils/audit-logger';
import { formatYmdInTimeZone, parseRangeBoundary } from '../../utils/date-helpers';
import { PRODUCT_CACHE_NAMESPACE } from '../products/product.service';
import type {
  CreateTransactionInput,
  ReceiptDataDto,
  TransactionActorContext,
  TransactionDto,
  TransactionItemDto,
  TransactionListQuery,
  TransactionListResponse,
  VoidTransactionInput,
} from './transaction.dto';

const TRANSACTION_ENTITY = 'transactions';
const STORE_NAME = 'Istana Buah Semarang';
const STORE_ADDRESS = 'Jl. Pandanaran No. 88, Semarang';
const STORE_PHONE = '024-8412345';
const RECEIPT_FOOTER = 'Terima kasih atas kunjungan Anda! Buah Segar Pilihan Keluarga.';

type FullTransactionPayload = PrismaTransaction & {
  cashier: { id: string; fullName: string };
  items: Array<
    PrismaTransactionItem & {
      product?: { costPerKg: Prisma.Decimal | null; costPerUnit: Prisma.Decimal | null } | null;
    }
  >;
};

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function buildReceiptData(tx: FullTransactionPayload): ReceiptDataDto {
  return {
    storeName: STORE_NAME,
    storeAddress: STORE_ADDRESS,
    storePhone: STORE_PHONE,
    transactionNo: tx.transactionNo,
    cashierName: tx.cashier.fullName,
    transactedAt: tx.transactedAt.toISOString(),
    paymentMethod: tx.paymentMethod,
    items: tx.items.map((it) => ({
      name: it.productName,
      quantity: it.quantity.toString(),
      productType: it.productType,
      unitPrice: it.unitPrice.toString(),
      lineTotal: it.lineTotal.toString(),
    })),
    subtotal: tx.subtotal.toString(),
    discountAmount: tx.discountAmount.toString(),
    taxAmount: tx.taxAmount.toString(),
    totalAmount: tx.totalAmount.toString(),
    amountPaid: tx.amountPaid.toString(),
    changeAmount: tx.changeAmount.toString(),
    footerMessage: RECEIPT_FOOTER,
  };
}

function toTransactionDto(tx: FullTransactionPayload, role: UserRole): TransactionDto {
  const canSeeCost = role === 'OWNER' || role === 'MANAGER';

  const items: TransactionItemDto[] = tx.items.map((item) => ({
    id: item.id,
    transactionId: item.transactionId,
    productId: item.productId,
    productName: item.productName,
    productType: item.productType,
    quantity: item.quantity.toString(),
    unitPrice: item.unitPrice.toString(),
    unitCost: canSeeCost ? item.unitCost.toString() : null,
    discountAmount: item.discountAmount.toString(),
    lineTotal: item.lineTotal.toString(),
    createdAt: item.createdAt.toISOString(),
  }));

  return {
    id: tx.id,
    transactionNo: tx.transactionNo,
    shiftId: tx.shiftId,
    cashierId: tx.cashierId,
    cashierName: tx.cashier.fullName,
    status: tx.status,
    subtotal: tx.subtotal.toString(),
    discountAmount: tx.discountAmount.toString(),
    taxAmount: tx.taxAmount.toString(),
    totalAmount: tx.totalAmount.toString(),
    paymentMethod: tx.paymentMethod,
    amountPaid: tx.amountPaid.toString(),
    changeAmount: tx.changeAmount.toString(),
    notes: tx.notes,
    voidedBy: tx.voidedBy,
    voidedAt: tx.voidedAt ? tx.voidedAt.toISOString() : null,
    voidReason: tx.voidReason,
    clientId: tx.clientId,
    syncedAt: tx.syncedAt ? tx.syncedAt.toISOString() : null,
    transactedAt: tx.transactedAt.toISOString(),
    createdAt: tx.createdAt.toISOString(),
    updatedAt: tx.updatedAt.toISOString(),
    items,
    receiptData: buildReceiptData(tx),
  };
}

export class TransactionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: CacheStore,
    private readonly timezone: string = 'Asia/Jakarta',
  ) {}

  /**
   * Menghasilkan nomor transaksi unik per hari: TRX-YYYYMMDD-NNNN (M03-001).
   * Menggunakan advisory lock per hari di PostgreSQL agar nomor urut aman dari race condition.
   */
  private async generateTransactionNo(date: Date, tx: Prisma.TransactionClient): Promise<string> {
    const ymd = formatYmdInTimeZone(date, this.timezone);
    const datePrefix = `TRX-${ymd}-`;

    if (typeof tx.$executeRaw === 'function') {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${datePrefix}))`;
    }

    // Ambil transaksi terakhir pada hari yang sama
    const latestToday = await tx.transaction.findFirst({
      where: {
        transactionNo: { startsWith: datePrefix },
      },
      orderBy: { transactionNo: 'desc' },
      select: { transactionNo: true },
    });

    let nextSeq = 1;
    if (latestToday) {
      const parts = latestToday.transactionNo.split('-');
      const lastSeqStr = parts[parts.length - 1];
      const parsed = Number(lastSeqStr);
      if (!Number.isNaN(parsed) && parsed > 0) {
        nextSeq = parsed + 1;
      }
    }

    return `${datePrefix}${String(nextSeq).padStart(4, '0')}`;
  }

  /**
   * Membuat transaksi baru di kasir (M03-001).
   * Menangani idempotency via clientId (TC-POS-003), penguncian baris FOR UPDATE anti-race,
   * pengurangan stok atomik, dan mutasi stok.
   */
  async create(
    input: CreateTransactionInput,
    actor: TransactionActorContext,
  ): Promise<TransactionDto> {
    // 1. Idempotency Check: Jika clientId sudah ada, kembalikan transaksi eksis (Deduplikasi)
    if (input.clientId) {
      const existing = await this.prisma.transaction.findUnique({
        where: { clientId: input.clientId },
        include: {
          cashier: { select: { id: true, fullName: true } },
          items: true,
        },
      });

      if (existing) {
        return toTransactionDto(existing as FullTransactionPayload, actor.role);
      }
    }

    const txDate = input.transactedAt ? new Date(input.transactedAt) : new Date();

    // 2. Eksekusi atomik dalam Prisma $transaction (dengan advisory lock clientId + deduplikasi P2002)
    let result: FullTransactionPayload;
    try {
      result = (await this.prisma.$transaction(async (tx) => {
        // Serialisasi request dengan clientId identik agar sync ganda saat stok tersisa 0 tetap idempoten
        if (input.clientId) {
          if (typeof tx.$executeRaw === 'function') {
            const clientLockKey = `tx_client_${input.clientId}`;
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clientLockKey}))`;
          }
          if (typeof tx.transaction.findUnique === 'function') {
            const existingInTx = await tx.transaction.findUnique({
              where: { clientId: input.clientId },
              include: {
                cashier: { select: { id: true, fullName: true } },
                items: true,
              },
            });
            if (existingInTx) {
              return existingInTx;
            }
          }
        }

        // Muat seluruh produk terurut ID dengan row lock FOR UPDATE guna mencegah negatif stok & deadlock
        const productIds = Array.from(new Set(input.items.map((it) => it.productId))).sort();
        if (typeof tx.$executeRaw === 'function' && productIds.length > 0) {
          await tx.$executeRaw`SELECT id FROM products WHERE id IN (${Prisma.join(productIds)}) ORDER BY id FOR UPDATE`;
        }

        // Generate nomor transaksi berurutan (setelah/dengan lock urutan harian)
        const transactionNo = await this.generateTransactionNo(txDate, tx);

        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
          select: {
            id: true,
            name: true,
            productType: true,
            costPerKg: true,
            costPerUnit: true,
            stockQty: true,
            isActive: true,
            deletedAt: true,
          },
        });

        const productMap = new Map(products.map((p) => [p.id, p]));
        const requestedByProduct = new Map<string, number>();

        for (const item of input.items) {
          requestedByProduct.set(
            item.productId,
            (requestedByProduct.get(item.productId) ?? 0) + item.quantity,
          );
        }

        // Validasi produk & total permintaan kumulatif stok per produk
        for (const [productId, totalRequested] of requestedByProduct.entries()) {
          const prod = productMap.get(productId);
          if (!prod || prod.deletedAt !== null) {
            throw new AppError(ERROR_CODES.PRODUCT_NOT_FOUND, 'Produk tidak ditemukan', 404, {
              productId,
            });
          }

          if (!prod.isActive) {
            throw new AppError(
              ERROR_CODES.VALIDATION_ERROR,
              `Produk "${prod.name}" sedang tidak aktif`,
              400,
              { productId },
            );
          }

          const currentStock = Number(prod.stockQty);
          if (currentStock < totalRequested) {
            throw new AppError(
              ERROR_CODES.INSUFFICIENT_STOCK,
              `Stok produk "${prod.name}" tidak mencukupi (tersisa ${String(currentStock)}, diminta ${String(totalRequested)})`,
              422,
              {
                productId,
                productName: prod.name,
                availableStock: currentStock,
                requestedQuantity: totalRequested,
              },
            );
          }
        }

        // Hitung item, kurangi stok atomik & catat mutasi
        let subtotalSum = 0;
        const transactionItemsData = [];
        const runningStock = new Map<string, number>(
          products.map((p) => [p.id, Number(p.stockQty)]),
        );

        for (const item of input.items) {
          const prod = productMap.get(item.productId)!;
          const lineTotal = Math.max(
            0,
            item.quantity * item.unitPrice - (item.discountAmount ?? 0),
          );
          subtotalSum += lineTotal;

          const currentStock = runningStock.get(item.productId) ?? 0;
          const newStock = currentStock - item.quantity;
          runningStock.set(item.productId, newStock);

          const unitCost =
            prod.productType === 'WEIGHT'
              ? (prod.costPerKg ?? new Prisma.Decimal(0))
              : (prod.costPerUnit ?? new Prisma.Decimal(0));

          transactionItemsData.push({
            productId: item.productId,
            productName: prod.name,
            productType: prod.productType,
            quantity: new Prisma.Decimal(item.quantity),
            unitPrice: new Prisma.Decimal(item.unitPrice),
            unitCost,
            discountAmount: new Prisma.Decimal(item.discountAmount ?? 0),
            lineTotal: new Prisma.Decimal(lineTotal),
          });

          // Kurangi stok produk secara atomik
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stockQty: { decrement: new Prisma.Decimal(item.quantity) },
            },
          });

          // Catat mutasi stok SALE_OUT
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              movementType: 'SALE_OUT',
              quantity: new Prisma.Decimal(item.quantity),
              balanceBefore: new Prisma.Decimal(currentStock),
              balanceAfter: new Prisma.Decimal(newStock),
              referenceType: 'TRANSACTION',
              notes: `Penjualan kasir (${transactionNo})`,
              createdBy: actor.userId,
            },
          });
        }

        const totalDiscount = input.discountAmount ?? 0;
        const totalAmount = Math.max(0, subtotalSum - totalDiscount);
        const changeAmount =
          input.paymentMethod === 'CASH' ? Math.max(0, input.amountPaid - totalAmount) : 0;

        // Simpan transaksi
        const createdTx = await tx.transaction.create({
          data: {
            transactionNo,
            shiftId: input.shiftId ?? null,
            cashierId: actor.userId,
            status: 'COMPLETED',
            subtotal: new Prisma.Decimal(subtotalSum),
            discountAmount: new Prisma.Decimal(totalDiscount),
            taxAmount: new Prisma.Decimal(0),
            totalAmount: new Prisma.Decimal(totalAmount),
            paymentMethod: input.paymentMethod,
            amountPaid: new Prisma.Decimal(input.amountPaid),
            changeAmount: new Prisma.Decimal(changeAmount),
            notes: input.notes ?? null,
            clientId: input.clientId ?? null,
            transactedAt: txDate,
            items: {
              create: transactionItemsData,
            },
          },
          include: {
            cashier: { select: { id: true, fullName: true } },
            items: true,
          },
        });

        // Update referenceId pada mutasi stok yang baru saja dibuat
        await tx.stockMovement.updateMany({
          where: {
            notes: `Penjualan kasir (${transactionNo})`,
            referenceType: 'TRANSACTION',
            referenceId: null,
          },
          data: {
            referenceId: createdTx.id,
          },
        });

        // Catat log audit transaksi POS
        await recordAuditLog(tx, {
          userId: actor.userId,
          action: 'TRANSACTION_CREATED',
          entity: TRANSACTION_ENTITY,
          entityId: createdTx.id,
          newValues: {
            transactionNo,
            totalAmount,
            itemCount: input.items.length,
            paymentMethod: input.paymentMethod,
          },
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });

        return createdTx;
      })) as FullTransactionPayload;
    } catch (err) {
      if (input.clientId && isUniqueConstraintError(err)) {
        const winner = await this.prisma.transaction.findUnique({
          where: { clientId: input.clientId },
          include: {
            cashier: { select: { id: true, fullName: true } },
            items: true,
          },
        });
        if (winner) {
          return toTransactionDto(winner as FullTransactionPayload, actor.role);
        }
      }
      throw err;
    }

    // Invalidate Redis product & stock cache agar stok real-time terpantau
    await Promise.all([
      this.cache.bumpVersion(PRODUCT_CACHE_NAMESPACE),
      this.cache.bumpVersion(CACHE_NAMESPACES.STOCK),
    ]);

    return toTransactionDto(result as FullTransactionPayload, actor.role);
  }

  /**
   * Mengambil daftar transaksi dengan filter dan paginasi (M03-001).
   * CASHIER hanya boleh melihat transaksinya sendiri (least privilege);
   * OWNER/MANAGER dapat melihat semua serta memfilter per kasir.
   */
  async list(
    query: TransactionListQuery,
    role: UserRole,
    actorUserId: string,
  ): Promise<TransactionListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.TransactionWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }
    if (query.paymentMethod) {
      where.paymentMethod = query.paymentMethod;
    }
    if (role === 'CASHIER') {
      where.cashierId = actorUserId;
    } else if (query.cashierId) {
      where.cashierId = query.cashierId;
    }
    if (query.shiftId) {
      where.shiftId = query.shiftId;
    }

    if (query.startDate || query.endDate) {
      where.transactedAt = {};
      if (query.startDate) {
        where.transactedAt.gte = parseRangeBoundary(query.startDate, 'start');
      }
      if (query.endDate) {
        where.transactedAt.lte = parseRangeBoundary(query.endDate, 'end');
      }
    }

    if (query.search) {
      where.OR = [
        { transactionNo: { contains: query.search, mode: 'insensitive' } },
        { cashier: { fullName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { transactedAt: 'desc' },
        include: {
          cashier: { select: { id: true, fullName: true } },
          items: true,
        },
      }),
    ]);

    const meta: PaginationMeta = {
      page,
      limit,
      total,
    };

    return {
      items: rows.map((r) => toTransactionDto(r as FullTransactionPayload, role)),
      meta,
    };
  }

  /**
   * Mengambil detail satu transaksi berdasarkan ID (M03-001).
   * CASHIER hanya dapat membuka transaksinya sendiri (selain itu dijawab 404 agar tidak membocorkan keberadaan).
   */
  async getById(id: string, role: UserRole, actorUserId: string): Promise<TransactionDto> {
    const tx = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        cashier: { select: { id: true, fullName: true } },
        items: true,
      },
    });

    if (!tx || (role === 'CASHIER' && tx.cashierId !== actorUserId)) {
      throw new AppError(ERROR_CODES.TRANSACTION_NOT_FOUND, 'Transaksi tidak ditemukan', 404, {
        id,
      });
    }

    return toTransactionDto(tx as FullTransactionPayload, role);
  }

  /**
   * Membatalkan (VOID) transaksi oleh MANAGER atau OWNER (M03-001).
   * Mengembalikan stok barang dan mencatat mutasi stok RETURN_IN serta audit log.
   */
  async void(
    id: string,
    input: VoidTransactionInput,
    actor: TransactionActorContext,
  ): Promise<TransactionDto> {
    const existing = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        cashier: { select: { id: true, fullName: true } },
        items: true,
      },
    });

    if (!existing) {
      throw new AppError(ERROR_CODES.TRANSACTION_NOT_FOUND, 'Transaksi tidak ditemukan', 404, {
        id,
      });
    }

    if (existing.status === 'VOIDED') {
      throw new AppError(
        ERROR_CODES.TRANSACTION_ALREADY_VOIDED,
        'Transaksi ini sudah dibatalkan sebelumnya',
        400,
        { id },
      );
    }

    if (existing.status !== 'COMPLETED') {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        'Hanya transaksi berstatus COMPLETED yang dapat dibatalkan (void)',
        400,
        { id, status: existing.status },
      );
    }

    const voidedAt = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      // Kunci baris transaksi & produk terkait (FOR UPDATE) agar double-void paralel mustahil terjadi
      if (typeof tx.$executeRaw === 'function') {
        await tx.$executeRaw`SELECT id FROM transactions WHERE id = ${id} FOR UPDATE`;
        const sortedVoidProductIds = Array.from(
          new Set(existing.items.map((it) => it.productId)),
        ).sort();
        if (sortedVoidProductIds.length > 0) {
          await tx.$executeRaw`SELECT id FROM products WHERE id IN (${Prisma.join(sortedVoidProductIds)}) ORDER BY id FOR UPDATE`;
        }
      }

      if (typeof tx.transaction.findUnique === 'function') {
        const fresh = await tx.transaction.findUnique({
          where: { id },
          select: { status: true },
        });
        if (!fresh) {
          throw new AppError(ERROR_CODES.TRANSACTION_NOT_FOUND, 'Transaksi tidak ditemukan', 404, {
            id,
          });
        }
        if (fresh.status === 'VOIDED') {
          throw new AppError(
            ERROR_CODES.TRANSACTION_ALREADY_VOIDED,
            'Transaksi ini sudah dibatalkan sebelumnya',
            400,
            { id },
          );
        }
      }

      // 1. Update status transaksi menjadi VOIDED
      const voidedTx = await tx.transaction.update({
        where: { id },
        data: {
          status: 'VOIDED',
          voidedBy: actor.userId,
          voidedAt,
          voidReason: input.reason,
        },
        include: {
          cashier: { select: { id: true, fullName: true } },
          items: true,
        },
      });

      // 2. Kembalikan stok untuk setiap item transaksi dan catat RETURN_IN
      for (const item of existing.items) {
        const prod = await tx.product.findUnique({
          where: { id: item.productId },
          select: { stockQty: true },
        });

        const currentStock = prod ? Number(prod.stockQty) : 0;
        const newStock = currentStock + Number(item.quantity);

        await tx.product.update({
          where: { id: item.productId },
          data: {
            stockQty: { increment: item.quantity },
          },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            movementType: 'RETURN_IN',
            quantity: item.quantity,
            balanceBefore: new Prisma.Decimal(currentStock),
            balanceAfter: new Prisma.Decimal(newStock),
            referenceId: id,
            referenceType: 'TRANSACTION_VOID',
            notes: `Pembatalan transaksi ${existing.transactionNo}: ${input.reason}`,
            createdBy: actor.userId,
          },
        });
      }

      // 3. Catat audit log void
      await recordAuditLog(tx, {
        userId: actor.userId,
        action: 'TRANSACTION_VOIDED',
        entity: TRANSACTION_ENTITY,
        entityId: id,
        oldValues: { status: 'COMPLETED' },
        newValues: {
          status: 'VOIDED',
          voidedBy: actor.userId,
          voidReason: input.reason,
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      return voidedTx;
    });

    // Invalidate product & stock cache
    await Promise.all([
      this.cache.bumpVersion(PRODUCT_CACHE_NAMESPACE),
      this.cache.bumpVersion(CACHE_NAMESPACES.STOCK),
    ]);

    return toTransactionDto(updated as FullTransactionPayload, actor.role);
  }
}
