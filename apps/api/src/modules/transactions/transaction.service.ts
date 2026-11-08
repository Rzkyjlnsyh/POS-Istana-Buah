import { ERROR_CODES, type PaginationMeta, type UserRole } from '@istana-buah/shared';
import {
  Prisma,
  type PrismaClient,
  type Transaction as PrismaTransaction,
  type TransactionItem as PrismaTransactionItem,
} from '@prisma/client';
import type { CacheStore } from '../../lib/cache';
import { AppError } from '../../utils/app-error';
import { recordAuditLog } from '../../utils/audit-logger';
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
  ) {}

  /**
   * Menghasilkan nomor transaksi unik per hari: TRX-YYYYMMDD-NNNN (M03-001).
   */
  private async generateTransactionNo(date: Date, tx: Prisma.TransactionClient): Promise<string> {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const datePrefix = `TRX-${String(year)}${month}${day}-`;

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
   * Menangani idempotency via clientId (TC-POS-003), pengurangan stok atomik, dan mutasi stok.
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

    // 2. Eksekusi atomik dalam Prisma $transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Generate nomor transaksi berurutan
      const transactionNo = await this.generateTransactionNo(txDate, tx);

      // Muat seluruh produk yang dibeli untuk validasi stok dan harga
      const productIds = Array.from(new Set(input.items.map((it) => it.productId)));
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

      // Validasi produk & stok
      for (const item of input.items) {
        const prod = productMap.get(item.productId);
        if (!prod || prod.deletedAt !== null) {
          throw new AppError(ERROR_CODES.PRODUCT_NOT_FOUND, 'Produk tidak ditemukan', 404, {
            productId: item.productId,
          });
        }

        if (!prod.isActive) {
          throw new AppError(
            ERROR_CODES.VALIDATION_ERROR,
            `Produk "${prod.name}" sedang tidak aktif`,
            400,
            { productId: item.productId },
          );
        }

        const currentStock = Number(prod.stockQty);
        if (currentStock < item.quantity) {
          throw new AppError(
            ERROR_CODES.INSUFFICIENT_STOCK,
            `Stok produk "${prod.name}" tidak mencukupi (tersisa ${String(currentStock)}, diminta ${String(item.quantity)})`,
            422,
            {
              productId: item.productId,
              productName: prod.name,
              availableStock: currentStock,
              requestedQuantity: item.quantity,
            },
          );
        }
      }

      // Hitung item & total
      let subtotalSum = 0;
      const transactionItemsData = [];

      for (const item of input.items) {
        const prod = productMap.get(item.productId)!;
        const lineTotal = Math.max(0, item.quantity * item.unitPrice - (item.discountAmount ?? 0));
        subtotalSum += lineTotal;

        const currentStock = Number(prod.stockQty);
        const newStock = currentStock - item.quantity;
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
    });

    // Invalidate Redis product cache agar stok real-time terpantau
    await this.cache.bumpVersion(PRODUCT_CACHE_NAMESPACE);

    return toTransactionDto(result as FullTransactionPayload, actor.role);
  }

  /**
   * Mengambil daftar transaksi dengan filter dan paginasi (M03-001).
   */
  async list(query: TransactionListQuery, role: UserRole): Promise<TransactionListResponse> {
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
    if (query.cashierId) {
      where.cashierId = query.cashierId;
    }
    if (query.shiftId) {
      where.shiftId = query.shiftId;
    }

    if (query.startDate || query.endDate) {
      where.transactedAt = {};
      if (query.startDate) {
        where.transactedAt.gte = new Date(`${query.startDate}T00:00:00.000Z`);
      }
      if (query.endDate) {
        where.transactedAt.lte = new Date(`${query.endDate}T23:59:59.999Z`);
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
   */
  async getById(id: string, role: UserRole): Promise<TransactionDto> {
    const tx = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        cashier: { select: { id: true, fullName: true } },
        items: true,
      },
    });

    if (!tx) {
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

    // Invalidate product cache
    await this.cache.bumpVersion(PRODUCT_CACHE_NAMESPACE);

    return toTransactionDto(updated as FullTransactionPayload, actor.role);
  }
}
