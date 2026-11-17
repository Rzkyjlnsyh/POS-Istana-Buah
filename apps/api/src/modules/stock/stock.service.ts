import {
  ERROR_CODES,
  type PaginationMeta,
  type ProductType,
  type StockOpnameStatus,
} from '@istana-buah/shared';
import {
  Prisma,
  type PrismaClient,
  type StockMovement as PrismaStockMovement,
  type StockOpname as PrismaStockOpname,
  type StockOpnameItem as PrismaStockOpnameItem,
} from '@prisma/client';
import type { CacheConfig } from '../../config/cache.config';
import { CACHE_NAMESPACES, type CacheStore } from '../../lib/cache';
import { AppError } from '../../utils/app-error';
import { recordAuditLog } from '../../utils/audit-logger';
import { formatYmdInTimeZone, parseRangeBoundary } from '../../utils/date-helpers';
import type {
  CreateStockOpnameInput,
  LowStockAlertItemDto,
  LowStockAlertListResult,
  LowStockAlertQuery,
  ReceiveStockInput,
  StockActorContext,
  StockMovementDto,
  StockMovementListQuery,
  StockMovementListResult,
  StockOpnameDto,
  StockOpnameItemDto,
  StockOpnameListQuery,
  StockOpnameListResult,
  StockReceiveResultDto,
} from './stock.dto';

export const STOCK_CACHE_NAMESPACE = CACHE_NAMESPACES.STOCK;
const STOCK_MOVEMENT_ENTITY = 'stock_movements';
const STOCK_OPNAME_ENTITY = 'stock_opnames';

interface ProductStockSnapshot {
  id: string;
  name: string;
  productType: ProductType;
  stockQty: Prisma.Decimal;
  isActive: boolean;
  deletedAt: Date | null;
}

type MovementWithProduct = PrismaStockMovement & {
  product: { id: string; name: string; productType: ProductType };
};

type OpnameWithRelations = PrismaStockOpname & {
  conductor: { id: string; fullName: string };
  items: Array<
    PrismaStockOpnameItem & {
      product: { id: string; name: string; productType: ProductType };
    }
  >;
};

function toMovementDto(
  row: MovementWithProduct,
  userNames: ReadonlyMap<string, string>,
): StockMovementDto {
  return {
    id: row.id,
    productId: row.productId,
    productName: row.product.name,
    productType: row.product.productType,
    movementType: row.movementType,
    quantity: row.quantity.toString(),
    balanceBefore: row.balanceBefore.toString(),
    balanceAfter: row.balanceAfter.toString(),
    referenceId: row.referenceId,
    referenceType: row.referenceType,
    notes: row.notes,
    createdBy: row.createdBy,
    createdByName: userNames.get(row.createdBy) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toOpnameItemDto(item: OpnameWithRelations['items'][number]): StockOpnameItemDto {
  return {
    id: item.id,
    productId: item.productId,
    productName: item.product.name,
    productType: item.product.productType,
    systemQty: item.systemQty.toString(),
    physicalQty: item.physicalQty.toString(),
    difference: item.difference.toString(),
    notes: item.notes,
    createdAt: item.createdAt.toISOString(),
  };
}

function toOpnameDto(opname: OpnameWithRelations): StockOpnameDto {
  const adjustedItemsCount = opname.items.filter((it) => !it.difference.isZero()).length;
  return {
    id: opname.id,
    referenceNo: opname.referenceNo,
    status: opname.status as StockOpnameStatus,
    conductedBy: opname.conductedBy,
    conductorName: opname.conductor.fullName,
    notes: opname.notes,
    completedAt: opname.completedAt ? opname.completedAt.toISOString() : null,
    createdAt: opname.createdAt.toISOString(),
    updatedAt: opname.updatedAt.toISOString(),
    totalItems: opname.items.length,
    adjustedItemsCount,
    items: opname.items.map(toOpnameItemDto),
  };
}

/**
 * Layanan Manajemen Stok & Inventori (M04-001).
 * Menangani penerimaan barang (TC-STK-001), stok opname dengan locking anti-race,
 * riwayat mutasi stok, serta peringatan stok menipis ter-cache Redis.
 */
export class StockService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: CacheStore,
    private readonly cacheCfg: CacheConfig,
    private readonly timezone = 'Asia/Jakarta',
  ) {}

  private async bustInventoryCaches(): Promise<void> {
    await Promise.all([
      this.cache.bumpVersion(CACHE_NAMESPACES.PRODUCTS),
      this.cache.bumpVersion(STOCK_CACHE_NAMESPACE),
      this.cache.bumpVersion(CACHE_NAMESPACES.REPORTS),
    ]);
  }

  private async resolveUserNames(userIds: string[]): Promise<Map<string, string>> {
    const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return new Map();
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, fullName: true },
    });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }

  private async lockAndLoadProducts(
    tx: Prisma.TransactionClient,
    rawProductIds: string[],
    requireActive: boolean,
  ): Promise<Map<string, ProductStockSnapshot>> {
    const sortedIds = Array.from(new Set(rawProductIds)).sort();
    if (typeof tx.$executeRaw === 'function' && sortedIds.length > 0) {
      await tx.$executeRaw`SELECT id FROM products WHERE id IN (${Prisma.join(sortedIds)}) ORDER BY id FOR UPDATE`;
    }

    const products = await tx.product.findMany({
      where: { id: { in: sortedIds } },
      select: {
        id: true,
        name: true,
        productType: true,
        stockQty: true,
        isActive: true,
        deletedAt: true,
      },
    });

    const map = new Map(products.map((p) => [p.id, p]));
    for (const productId of sortedIds) {
      const prod = map.get(productId);
      if (!prod || prod.deletedAt !== null) {
        throw new AppError(ERROR_CODES.PRODUCT_NOT_FOUND, 'Produk tidak ditemukan', 404, {
          productId,
        });
      }
      if (requireActive && !prod.isActive) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          `Produk "${prod.name}" sedang tidak aktif`,
          400,
          { productId },
        );
      }
    }

    return map;
  }

  private async generateOpnameReferenceNo(
    date: Date,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const ymd = formatYmdInTimeZone(date, this.timezone);
    const datePrefix = `OPN-${ymd}-`;

    if (typeof tx.$executeRaw === 'function') {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${datePrefix}))`;
    }

    const existingToday = await tx.stockOpname.findMany({
      where: { referenceNo: { startsWith: datePrefix } },
      select: { referenceNo: true },
    });

    let maxSeq = 0;
    for (const row of existingToday) {
      const lastSeqStr = row.referenceNo.split('-').pop();
      const parsed = Number(lastSeqStr);
      if (!Number.isNaN(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    }

    return `${datePrefix}${String(maxSeq + 1).padStart(2, '0')}`;
  }

  private async updatePurchaseOrderStatusAfterReceive(
    tx: Prisma.TransactionClient,
    purchaseOrder: {
      id: string;
      items: Array<{ productId: string; quantity: Prisma.Decimal }>;
    },
  ): Promise<void> {
    if (purchaseOrder.items.length === 0) {
      await tx.purchaseOrder.update({
        where: { id: purchaseOrder.id },
        data: { status: 'RECEIVED', deliveredAt: new Date() },
      });
      return;
    }

    const movements = await tx.stockMovement.findMany({
      where: {
        referenceType: 'PURCHASE_ORDER',
        referenceId: purchaseOrder.id,
        movementType: 'PURCHASE_IN',
      },
      select: { productId: true, quantity: true },
    });

    const receivedByProduct = new Map<string, Prisma.Decimal>();
    for (const m of movements) {
      const prev = receivedByProduct.get(m.productId) ?? new Prisma.Decimal(0);
      receivedByProduct.set(m.productId, prev.plus(m.quantity));
    }

    const allFulfilled = purchaseOrder.items.every((poItem) => {
      const received = receivedByProduct.get(poItem.productId) ?? new Prisma.Decimal(0);
      return received.gte(poItem.quantity);
    });

    await tx.purchaseOrder.update({
      where: { id: purchaseOrder.id },
      data: allFulfilled ? { status: 'RECEIVED', deliveredAt: new Date() } : { status: 'PARTIAL' },
    });
  }

  /**
   * Mencatat penerimaan barang dari supplier atau ad-hoc (M04-001 / TC-STK-001).
   * Menambah stok secara atomik, memperbarui HPP bila dikirim, dan mencatat StockMovement `PURCHASE_IN`.
   */
  async receiveStock(
    input: ReceiveStockInput,
    actor: StockActorContext,
  ): Promise<StockReceiveResultDto> {
    const { createdMovements, resolvedSupplierId, resolvedSupplierName, purchaseOrderId } =
      await this.prisma.$transaction(async (tx) => {
        let supplierId = input.supplierId ?? null;
        let supplierName: string | null = null;
        let poRecord: {
          id: string;
          supplierId: string;
          referenceNo: string | null;
          status: string;
          items: Array<{ productId: string; quantity: Prisma.Decimal }>;
        } | null = null;

        if (input.purchaseOrderId) {
          if (typeof tx.$executeRaw === 'function') {
            await tx.$executeRaw`SELECT id FROM purchase_orders WHERE id = ${input.purchaseOrderId} FOR UPDATE`;
          }
          const po = await tx.purchaseOrder.findUnique({
            where: { id: input.purchaseOrderId },
            include: { items: { select: { productId: true, quantity: true } } },
          });
          if (!po) {
            throw new AppError(
              ERROR_CODES.PURCHASE_ORDER_NOT_FOUND,
              'Purchase Order tidak ditemukan',
              404,
              { purchaseOrderId: input.purchaseOrderId },
            );
          }
          if (po.status === 'CANCELLED' || po.status === 'RECEIVED') {
            throw new AppError(
              ERROR_CODES.VALIDATION_ERROR,
              `Purchase Order berstatus ${po.status} tidak dapat menerima barang`,
              400,
              { purchaseOrderId: po.id, status: po.status },
            );
          }
          if (supplierId && supplierId !== po.supplierId) {
            throw new AppError(
              ERROR_CODES.VALIDATION_ERROR,
              'Supplier yang dipilih tidak sesuai dengan Purchase Order',
              400,
              { supplierId, purchaseOrderSupplierId: po.supplierId },
            );
          }
          supplierId = supplierId ?? po.supplierId;
          poRecord = po;
        }

        if (supplierId) {
          const supplier = await tx.supplier.findFirst({
            where: { id: supplierId, deletedAt: null },
            select: { id: true, name: true, isActive: true },
          });
          if (!supplier) {
            throw new AppError(ERROR_CODES.SUPPLIER_NOT_FOUND, 'Supplier tidak ditemukan', 404, {
              supplierId,
            });
          }
          if (!supplier.isActive) {
            throw new AppError(
              ERROR_CODES.VALIDATION_ERROR,
              `Supplier "${supplier.name}" sedang tidak aktif`,
              400,
              { supplierId },
            );
          }
          supplierName = supplier.name;
        }

        const productMap = await this.lockAndLoadProducts(
          tx,
          input.items.map((it) => it.productId),
          true,
        );

        const runningStock = new Map<string, Prisma.Decimal>(
          Array.from(productMap.entries()).map(([id, prod]) => [
            id,
            new Prisma.Decimal(prod.stockQty),
          ]),
        );

        const referenceId = poRecord?.id ?? supplierId ?? null;
        const referenceType = poRecord
          ? 'PURCHASE_ORDER'
          : supplierId
            ? 'SUPPLIER_RECEIVE'
            : 'MANUAL_RECEIVE';

        const defaultNote = poRecord
          ? `Penerimaan PO ${poRecord.referenceNo ?? poRecord.id}`
          : supplierName
            ? `Penerimaan dari ${supplierName}`
            : 'Penerimaan stok barang';
        const effectiveNote = input.notes ? `${defaultNote}: ${input.notes}` : defaultNote;

        const movements: MovementWithProduct[] = [];
        for (const item of input.items) {
          const prod = productMap.get(item.productId)!;
          const balanceBefore = runningStock.get(item.productId)!;
          const qtyDecimal = new Prisma.Decimal(item.quantity);
          const balanceAfter = balanceBefore.plus(qtyDecimal);
          runningStock.set(item.productId, balanceAfter);

          const productUpdateData: Prisma.ProductUpdateInput = {
            stockQty: { increment: qtyDecimal },
          };
          if (item.unitCost !== undefined && item.unitCost !== null) {
            if (prod.productType === 'WEIGHT') {
              productUpdateData.costPerKg = new Prisma.Decimal(item.unitCost);
            } else {
              productUpdateData.costPerUnit = new Prisma.Decimal(item.unitCost);
            }
          }

          await tx.product.update({
            where: { id: item.productId },
            data: productUpdateData,
          });

          const createdMovement = await tx.stockMovement.create({
            data: {
              productId: item.productId,
              movementType: 'PURCHASE_IN',
              quantity: qtyDecimal,
              balanceBefore,
              balanceAfter,
              referenceId,
              referenceType,
              notes: effectiveNote,
              createdBy: actor.userId,
            },
            include: {
              product: { select: { id: true, name: true, productType: true } },
            },
          });
          movements.push(createdMovement);
        }

        if (poRecord) {
          await this.updatePurchaseOrderStatusAfterReceive(tx, poRecord);
        }

        await recordAuditLog(tx, {
          userId: actor.userId,
          action: 'STOCK_RECEIVED',
          entity: STOCK_MOVEMENT_ENTITY,
          entityId: referenceId ?? movements[0]?.id ?? null,
          newValues: {
            purchaseOrderId: poRecord?.id ?? null,
            supplierId,
            itemCount: movements.length,
            movementIds: movements.map((m) => m.id),
          },
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });

        return {
          createdMovements: movements,
          resolvedSupplierId: supplierId,
          resolvedSupplierName: supplierName,
          purchaseOrderId: poRecord?.id ?? null,
        };
      });

    await this.bustInventoryCaches();
    if (resolvedSupplierId || purchaseOrderId) {
      await this.cache.bumpVersion(CACHE_NAMESPACES.SUPPLIERS);
    }

    const userNames = await this.resolveUserNames([actor.userId]);
    return {
      purchaseOrderId,
      supplierId: resolvedSupplierId,
      supplierName: resolvedSupplierName,
      totalItems: createdMovements.length,
      movements: createdMovements.map((m) => toMovementDto(m, userNames)),
    };
  }

  /**
   * Membuat stok opname (M04-001).
   * Jika `finalize` bernilai true (default), langsung menyesuaikan `stockQty` dan mencatat `OPNAME_ADJUST`.
   */
  async createOpname(
    input: CreateStockOpnameInput,
    actor: StockActorContext,
  ): Promise<StockOpnameDto> {
    const now = new Date();
    const shouldFinalize = input.finalize ?? true;

    const created = await this.prisma.$transaction(async (tx) => {
      const productMap = await this.lockAndLoadProducts(
        tx,
        input.items.map((it) => it.productId),
        false,
      );

      const referenceNo = await this.generateOpnameReferenceNo(now, tx);

      const itemRows = input.items.map((item) => {
        const prod = productMap.get(item.productId)!;
        const systemQty = new Prisma.Decimal(prod.stockQty);
        const physicalQty = new Prisma.Decimal(item.physicalQty);
        const difference = physicalQty.minus(systemQty);
        return {
          productId: item.productId,
          systemQty,
          physicalQty,
          difference,
          notes: item.notes ?? null,
        };
      });

      const opname = await tx.stockOpname.create({
        data: {
          referenceNo,
          notes: input.notes ?? null,
          status: shouldFinalize ? 'COMPLETED' : 'DRAFT',
          conductedBy: actor.userId,
          completedAt: shouldFinalize ? now : null,
          items: { create: itemRows },
        },
        include: {
          conductor: { select: { id: true, fullName: true } },
          items: {
            include: { product: { select: { id: true, name: true, productType: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (shouldFinalize) {
        for (const row of itemRows) {
          await tx.product.update({
            where: { id: row.productId },
            data: { stockQty: row.physicalQty },
          });

          if (!row.difference.isZero()) {
            await tx.stockMovement.create({
              data: {
                productId: row.productId,
                movementType: 'OPNAME_ADJUST',
                quantity: row.difference,
                balanceBefore: row.systemQty,
                balanceAfter: row.physicalQty,
                referenceId: opname.id,
                referenceType: 'STOCK_OPNAME',
                notes: row.notes ?? input.notes ?? `Penyesuaian stok opname (${referenceNo})`,
                createdBy: actor.userId,
              },
            });
          }
        }
      }

      await recordAuditLog(tx, {
        userId: actor.userId,
        action: shouldFinalize ? 'STOCK_OPNAME_COMPLETED' : 'STOCK_OPNAME_DRAFT_CREATED',
        entity: STOCK_OPNAME_ENTITY,
        entityId: opname.id,
        newValues: {
          referenceNo,
          status: opname.status,
          totalItems: opname.items.length,
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      return opname;
    });

    if (shouldFinalize) {
      await this.bustInventoryCaches();
    }

    return toOpnameDto(created);
  }

  /**
   * Memfinalisasi dokumen stok opname DRAFT menggunakan saldo stok sistem terkini (anti-race).
   */
  async finalizeOpname(id: string, actor: StockActorContext): Promise<StockOpnameDto> {
    const completedAt = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === 'function') {
        await tx.$executeRaw`SELECT id FROM stock_opnames WHERE id = ${id} FOR UPDATE`;
      }

      const existing = await tx.stockOpname.findUnique({
        where: { id },
        include: {
          conductor: { select: { id: true, fullName: true } },
          items: {
            include: { product: { select: { id: true, name: true, productType: true } } },
          },
        },
      });

      if (!existing) {
        throw new AppError(
          ERROR_CODES.STOCK_OPNAME_NOT_FOUND,
          'Dokumen stok opname tidak ditemukan',
          404,
          { id },
        );
      }

      if (existing.status !== 'DRAFT') {
        throw new AppError(
          ERROR_CODES.STOCK_OPNAME_ALREADY_COMPLETED,
          'Stok opname ini sudah difinalisasi sebelumnya',
          400,
          { id, status: existing.status },
        );
      }

      const productMap = await this.lockAndLoadProducts(
        tx,
        existing.items.map((it) => it.productId),
        false,
      );

      for (const item of existing.items) {
        const prod = productMap.get(item.productId)!;
        const liveSystemQty = new Prisma.Decimal(prod.stockQty);
        const physicalQty = new Prisma.Decimal(item.physicalQty);
        const difference = physicalQty.minus(liveSystemQty);

        await tx.stockOpnameItem.update({
          where: { id: item.id },
          data: { systemQty: liveSystemQty, difference },
        });

        await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: physicalQty },
        });

        if (!difference.isZero()) {
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              movementType: 'OPNAME_ADJUST',
              quantity: difference,
              balanceBefore: liveSystemQty,
              balanceAfter: physicalQty,
              referenceId: existing.id,
              referenceType: 'STOCK_OPNAME',
              notes:
                item.notes ?? existing.notes ?? `Penyesuaian stok opname (${existing.referenceNo})`,
              createdBy: actor.userId,
            },
          });
        }
      }

      const finalized = await tx.stockOpname.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt },
        include: {
          conductor: { select: { id: true, fullName: true } },
          items: {
            include: { product: { select: { id: true, name: true, productType: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      await recordAuditLog(tx, {
        userId: actor.userId,
        action: 'STOCK_OPNAME_COMPLETED',
        entity: STOCK_OPNAME_ENTITY,
        entityId: id,
        oldValues: { status: 'DRAFT' },
        newValues: { status: 'COMPLETED', referenceNo: existing.referenceNo },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      return finalized;
    });

    await this.bustInventoryCaches();

    return toOpnameDto(updated);
  }

  /**
   * Mengambil daftar dokumen stok opname dengan paginasi & filter (M04-001).
   */
  async listOpnames(query: StockOpnameListQuery): Promise<StockOpnameListResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.StockOpnameWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = parseRangeBoundary(query.startDate, 'start');
      }
      if (query.endDate) {
        where.createdAt.lte = parseRangeBoundary(query.endDate, 'end');
      }
    }
    if (query.search) {
      where.OR = [
        { referenceNo: { contains: query.search, mode: 'insensitive' } },
        { notes: { contains: query.search, mode: 'insensitive' } },
        { conductor: { fullName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.stockOpname.count({ where }),
      this.prisma.stockOpname.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          conductor: { select: { id: true, fullName: true } },
          items: {
            include: { product: { select: { id: true, name: true, productType: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
    ]);

    return {
      items: rows.map(toOpnameDto),
      meta: { page, limit, total },
    };
  }

  /**
   * Mengambil detail satu dokumen stok opname berdasarkan ID (M04-001).
   */
  async getOpnameById(id: string): Promise<StockOpnameDto> {
    const opname = await this.prisma.stockOpname.findUnique({
      where: { id },
      include: {
        conductor: { select: { id: true, fullName: true } },
        items: {
          include: { product: { select: { id: true, name: true, productType: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!opname) {
      throw new AppError(
        ERROR_CODES.STOCK_OPNAME_NOT_FOUND,
        'Dokumen stok opname tidak ditemukan',
        404,
        { id },
      );
    }

    return toOpnameDto(opname);
  }

  /**
   * Mengambil riwayat mutasi stok dengan filter produk, tipe mutasi, rentang tanggal, dan paginasi (M04-001).
   */
  async listMovements(query: StockMovementListQuery): Promise<StockMovementListResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.StockMovementWhereInput = {};
    if (query.productId) {
      where.productId = query.productId;
    }
    if (query.type) {
      where.movementType = query.type;
    }
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = parseRangeBoundary(query.startDate, 'start');
      }
      if (query.endDate) {
        where.createdAt.lte = parseRangeBoundary(query.endDate, 'end');
      }
    }
    if (query.search) {
      where.OR = [
        { notes: { contains: query.search, mode: 'insensitive' } },
        { referenceId: { contains: query.search, mode: 'insensitive' } },
        { product: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.stockMovement.count({ where }),
      this.prisma.stockMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          product: { select: { id: true, name: true, productType: true } },
        },
      }),
    ]);

    const userNames = await this.resolveUserNames(rows.map((r) => r.createdBy));
    const meta: PaginationMeta = { page, limit, total };

    return {
      items: rows.map((row) => toMovementDto(row, userNames)),
      meta,
    };
  }

  /**
   * Mengambil daftar produk aktif dengan stok <= minStockAlert (M04-001).
   * Di-cache di Redis (versi namespace stock) dan bebas informasi HPP (aman untuk seluruh role).
   */
  async listLowStockAlerts(query: LowStockAlertQuery): Promise<LowStockAlertListResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const version = await this.cache.getVersion(STOCK_CACHE_NAMESPACE);
    const cacheKey = [
      STOCK_CACHE_NAMESPACE,
      'low-alert',
      `v${String(version)}`,
      `p${String(page)}`,
      `l${String(limit)}`,
      `c${query.categoryId ?? '-'}`,
      `s${encodeURIComponent((query.search ?? '').toLowerCase())}`,
    ].join(':');

    const cached = await this.cache.get(cacheKey);
    if (cached !== null) {
      try {
        return JSON.parse(cached) as LowStockAlertListResult;
      } catch {
        // Cache korup -> refresh dari DB
      }
    }

    const orderedLowRows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM products
      WHERE deleted_at IS NULL
        AND is_active = true
        AND min_stock_alert IS NOT NULL
        AND stock_qty <= min_stock_alert
      ORDER BY (min_stock_alert - stock_qty) DESC, stock_qty ASC, name ASC
    `;

    const orderedIds = orderedLowRows.map((r) => r.id);
    if (orderedIds.length === 0) {
      const emptyResult: LowStockAlertListResult = {
        items: [],
        meta: { page, limit, total: 0 },
      };
      await this.cache.set(cacheKey, JSON.stringify(emptyResult), this.cacheCfg.productTtlSeconds);
      return emptyResult;
    }

    const where: Prisma.ProductWhereInput = {
      id: { in: orderedIds },
      deletedAt: null,
      isActive: true,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const matchingProducts = await this.prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        categoryId: true,
        category: { select: { name: true } },
        productType: true,
        stockQty: true,
        minStockAlert: true,
        isActive: true,
      },
    });

    const rankMap = new Map(orderedIds.map((id, idx) => [id, idx]));
    matchingProducts.sort((a, b) => (rankMap.get(a.id) ?? 0) - (rankMap.get(b.id) ?? 0));

    const total = matchingProducts.length;
    const paged = matchingProducts.slice((page - 1) * limit, page * limit);

    const items: LowStockAlertItemDto[] = paged.map((row) => {
      const minAlert = row.minStockAlert ?? new Prisma.Decimal(0);
      const deficit = minAlert.minus(row.stockQty);
      return {
        id: row.id,
        name: row.name,
        categoryId: row.categoryId,
        categoryName: row.category.name,
        productType: row.productType,
        stockQty: row.stockQty.toString(),
        minStockAlert: minAlert.toString(),
        deficit: (deficit.isNegative() ? new Prisma.Decimal(0) : deficit).toString(),
        isActive: row.isActive,
      };
    });

    const result: LowStockAlertListResult = {
      items,
      meta: { page, limit, total },
    };

    await this.cache.set(cacheKey, JSON.stringify(result), this.cacheCfg.productTtlSeconds);
    return result;
  }
}
