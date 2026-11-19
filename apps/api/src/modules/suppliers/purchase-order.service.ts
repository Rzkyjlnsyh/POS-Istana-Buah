import { ERROR_CODES, type PaginationMeta, type ProductType } from '@istana-buah/shared';
import {
  Prisma,
  type PrismaClient,
  type PurchaseOrder as PrismaPurchaseOrder,
  type PurchaseOrderItem as PrismaPurchaseOrderItem,
} from '@prisma/client';
import { CACHE_NAMESPACES, type CacheStore } from '../../lib/cache';
import { AppError } from '../../utils/app-error';
import { recordAuditLog } from '../../utils/audit-logger';
import {
  buildNextDailyReference,
  formatYmdInTimeZone,
  parseRangeBoundary,
} from '../../utils/date-helpers';
import type {
  CreatePurchaseOrderInput,
  PayPurchaseOrderInput,
  PurchaseOrderActorContext,
  PurchaseOrderDto,
  PurchaseOrderItemDto,
  PurchaseOrderListQuery,
  PurchaseOrderListResult,
} from './purchase-order.dto';

const PURCHASE_ORDER_ENTITY = 'purchase_orders';

type FullPurchaseOrderPayload = PrismaPurchaseOrder & {
  supplier: { id: string; name: string };
  items: Array<
    PrismaPurchaseOrderItem & {
      product: { id: string; name: string; productType: ProductType };
    }
  >;
};

const PO_INCLUDE = {
  supplier: { select: { id: true, name: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, productType: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.PurchaseOrderInclude;

function toItemDto(item: FullPurchaseOrderPayload['items'][number]): PurchaseOrderItemDto {
  return {
    id: item.id,
    productId: item.productId,
    productName: item.product.name,
    productType: item.product.productType,
    quantity: item.quantity.toString(),
    unitCost: item.unitCost.toFixed(2),
    totalCost: item.totalCost.toFixed(2),
    createdAt: item.createdAt.toISOString(),
  };
}

function toDto(
  po: FullPurchaseOrderPayload,
  userNames: ReadonlyMap<string, string>,
): PurchaseOrderDto {
  const diff = po.totalAmount.minus(po.paidAmount);
  const remainingDebt = po.status !== 'CANCELLED' && diff.gt(0) ? diff : new Prisma.Decimal(0);

  return {
    id: po.id,
    supplierId: po.supplierId,
    supplierName: po.supplier.name,
    referenceNo: po.referenceNo,
    totalAmount: po.totalAmount.toFixed(2),
    paidAmount: po.paidAmount.toFixed(2),
    remainingDebt: remainingDebt.toFixed(2),
    status: po.status,
    notes: po.notes,
    deliveredAt: po.deliveredAt ? po.deliveredAt.toISOString() : null,
    createdBy: po.createdBy,
    createdByName: userNames.get(po.createdBy) ?? null,
    createdAt: po.createdAt.toISOString(),
    updatedAt: po.updatedAt.toISOString(),
    items: po.items.map(toItemDto),
  };
}

/**
 * Layanan Purchase Order (PO) Pembelian Supplier (M05-002).
 * Mendukung penomoran otomatis `PO-YYYYMMDD-NN` aman race-condition, tracking hutang,
 * pelunasan atomik (`FOR UPDATE`), dan pembatalan PO `PENDING`.
 */
export class PurchaseOrderService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: CacheStore,
    private readonly timezone = 'Asia/Jakarta',
  ) {}

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

  private async generateReferenceNo(date: Date, tx: Prisma.TransactionClient): Promise<string> {
    const ymd = formatYmdInTimeZone(date, this.timezone);
    const datePrefix = `PO-${ymd}-`;

    if (typeof tx.$executeRaw === 'function') {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${datePrefix}))`;
    }

    const existingToday = await tx.purchaseOrder.findMany({
      where: { referenceNo: { startsWith: datePrefix } },
      select: { referenceNo: true },
    });

    return buildNextDailyReference(
      datePrefix,
      existingToday.map((r) => r.referenceNo),
      2,
    );
  }

  async create(
    input: CreatePurchaseOrderInput,
    actor: PurchaseOrderActorContext,
  ): Promise<PurchaseOrderDto> {
    const now = new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findFirst({
        where: { id: input.supplierId, deletedAt: null },
        select: { id: true, name: true, isActive: true },
      });

      if (!supplier) {
        throw new AppError(ERROR_CODES.SUPPLIER_NOT_FOUND, 'Supplier tidak ditemukan', 404, {
          supplierId: input.supplierId,
        });
      }

      if (!supplier.isActive) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          `Supplier "${supplier.name}" sedang tidak aktif`,
          400,
          { supplierId: input.supplierId },
        );
      }

      const productIds = input.items.map((it) => it.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, isActive: true, deletedAt: true },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      for (const productId of productIds) {
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
      }

      let totalAmount = new Prisma.Decimal(0);
      const poItemsData = input.items.map((item) => {
        const qty = new Prisma.Decimal(item.quantity);
        const unitCost = new Prisma.Decimal(item.unitCost);
        const totalCost = qty.mul(unitCost).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        totalAmount = totalAmount.plus(totalCost);
        return {
          productId: item.productId,
          quantity: qty,
          unitCost,
          totalCost,
        };
      });

      const paidAmount = new Prisma.Decimal(input.paidAmount ?? 0).toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP,
      );
      if (paidAmount.gt(totalAmount)) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          'Pembayaran awal tidak boleh melebihi total nilai Purchase Order',
          400,
          { totalAmount: totalAmount.toFixed(2), paidAmount: paidAmount.toFixed(2) },
        );
      }

      const referenceNo = await this.generateReferenceNo(now, tx);

      const po = await tx.purchaseOrder.create({
        data: {
          supplierId: input.supplierId,
          referenceNo,
          totalAmount,
          paidAmount,
          status: 'PENDING',
          notes: input.notes ?? null,
          createdBy: actor.userId,
          items: { create: poItemsData },
        },
        include: PO_INCLUDE,
      });

      await recordAuditLog(tx, {
        userId: actor.userId,
        action: 'PURCHASE_ORDER_CREATED',
        entity: PURCHASE_ORDER_ENTITY,
        entityId: po.id,
        newValues: {
          referenceNo,
          supplierId: input.supplierId,
          totalAmount: totalAmount.toFixed(2),
          paidAmount: paidAmount.toFixed(2),
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      return po;
    });

    await this.cache.bumpVersion(CACHE_NAMESPACES.SUPPLIERS);

    const userNames = await this.resolveUserNames([created.createdBy]);
    return toDto(created as FullPurchaseOrderPayload, userNames);
  }

  async list(query: PurchaseOrderListQuery): Promise<PurchaseOrderListResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseOrderWhereInput = {};
    if (query.supplierId) {
      where.supplierId = query.supplierId;
    }
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
        { supplier: { name: { contains: query.search, mode: 'insensitive' } } },
        { notes: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.unpaidOnly) {
      const unpaidRows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM purchase_orders
        WHERE status <> 'CANCELLED'
          AND paid_amount < total_amount
      `;
      where.id = { in: unpaidRows.map((r) => r.id) };
    }

    const [total, rows] = await Promise.all([
      this.prisma.purchaseOrder.count({ where }),
      this.prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: PO_INCLUDE,
      }),
    ]);

    const userNames = await this.resolveUserNames(rows.map((r) => r.createdBy));
    const meta: PaginationMeta = { page, limit, total };

    return {
      items: rows.map((row) => toDto(row as FullPurchaseOrderPayload, userNames)),
      meta,
    };
  }

  async getById(id: string): Promise<PurchaseOrderDto> {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: PO_INCLUDE,
    });

    if (!po) {
      throw new AppError(
        ERROR_CODES.PURCHASE_ORDER_NOT_FOUND,
        'Purchase Order tidak ditemukan',
        404,
        { id },
      );
    }

    const userNames = await this.resolveUserNames([po.createdBy]);
    return toDto(po as FullPurchaseOrderPayload, userNames);
  }

  /**
   * Mencatat pembayaran / pelunasan hutang Purchase Order secara atomik (FR-SUPP-03).
   */
  async recordPayment(
    id: string,
    input: PayPurchaseOrderInput,
    actor: PurchaseOrderActorContext,
  ): Promise<PurchaseOrderDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === 'function') {
        await tx.$executeRaw`SELECT id FROM purchase_orders WHERE id = ${id} FOR UPDATE`;
      }

      const po = await tx.purchaseOrder.findUnique({
        where: { id },
        include: PO_INCLUDE,
      });

      if (!po) {
        throw new AppError(
          ERROR_CODES.PURCHASE_ORDER_NOT_FOUND,
          'Purchase Order tidak ditemukan',
          404,
          { id },
        );
      }

      if (po.status === 'CANCELLED') {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          'Purchase Order yang sudah dibatalkan tidak dapat dibayar',
          400,
          { id, status: po.status },
        );
      }

      const amount = new Prisma.Decimal(input.amount).toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP,
      );
      const nextPaid = po.paidAmount.plus(amount);
      if (nextPaid.gt(po.totalAmount)) {
        const remaining = po.totalAmount.minus(po.paidAmount);
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          `Nominal pembayaran melebihi sisa hutang (sisa ${remaining.toFixed(2)})`,
          400,
          { remainingDebt: remaining.toFixed(2), requestedAmount: amount.toFixed(2) },
        );
      }

      const updatedPo = await tx.purchaseOrder.update({
        where: { id },
        data: { paidAmount: nextPaid },
        include: PO_INCLUDE,
      });

      await recordAuditLog(tx, {
        userId: actor.userId,
        action: 'PURCHASE_ORDER_PAYMENT_RECORDED',
        entity: PURCHASE_ORDER_ENTITY,
        entityId: id,
        oldValues: { paidAmount: po.paidAmount.toFixed(2) },
        newValues: {
          paidAmount: nextPaid.toFixed(2),
          paymentAmount: amount.toFixed(2),
          notes: input.notes ?? null,
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      return updatedPo;
    });

    await this.cache.bumpVersion(CACHE_NAMESPACES.SUPPLIERS);

    const userNames = await this.resolveUserNames([updated.createdBy]);
    return toDto(updated as FullPurchaseOrderPayload, userNames);
  }

  /**
   * Membatalkan Purchase Order yang masih berstatus PENDING.
   */
  async cancel(id: string, actor: PurchaseOrderActorContext): Promise<PurchaseOrderDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === 'function') {
        await tx.$executeRaw`SELECT id FROM purchase_orders WHERE id = ${id} FOR UPDATE`;
      }

      const po = await tx.purchaseOrder.findUnique({
        where: { id },
        include: PO_INCLUDE,
      });

      if (!po) {
        throw new AppError(
          ERROR_CODES.PURCHASE_ORDER_NOT_FOUND,
          'Purchase Order tidak ditemukan',
          404,
          { id },
        );
      }

      if (po.status !== 'PENDING') {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          `Purchase Order berstatus ${po.status} tidak dapat dibatalkan`,
          400,
          { id, status: po.status },
        );
      }

      const cancelled = await tx.purchaseOrder.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: PO_INCLUDE,
      });

      await recordAuditLog(tx, {
        userId: actor.userId,
        action: 'PURCHASE_ORDER_CANCELLED',
        entity: PURCHASE_ORDER_ENTITY,
        entityId: id,
        oldValues: { status: po.status },
        newValues: { status: 'CANCELLED' },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      return cancelled;
    });

    await this.cache.bumpVersion(CACHE_NAMESPACES.SUPPLIERS);

    const userNames = await this.resolveUserNames([updated.createdBy]);
    return toDto(updated as FullPurchaseOrderPayload, userNames);
  }
}
