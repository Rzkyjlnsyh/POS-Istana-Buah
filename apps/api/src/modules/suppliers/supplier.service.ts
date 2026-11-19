import { ERROR_CODES, type PaginationMeta, type PurchaseOrderStatus } from '@istana-buah/shared';
import { Prisma, type PrismaClient, type Supplier as PrismaSupplier } from '@prisma/client';
import type { CacheConfig } from '../../config/cache.config';
import { CACHE_NAMESPACES, type CacheStore } from '../../lib/cache';
import { AppError } from '../../utils/app-error';
import { recordAuditLog } from '../../utils/audit-logger';
import type {
  CreateSupplierInput,
  SupplierActorContext,
  SupplierDetailDto,
  SupplierDto,
  SupplierListQuery,
  SupplierListResult,
  UpdateSupplierInput,
} from './supplier.dto';

export const SUPPLIER_CACHE_NAMESPACE = CACHE_NAMESPACES.SUPPLIERS;
const SUPPLIER_ENTITY = 'suppliers';

interface PurchaseOrderAggregateInput {
  id: string;
  referenceNo: string | null;
  status: string;
  totalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  deliveredAt: Date | null;
  createdAt: Date;
}

function summarizeOrders(
  orders: Array<{ totalAmount: Prisma.Decimal; paidAmount: Prisma.Decimal }>,
) {
  let totalPurchase = new Prisma.Decimal(0);
  let outstandingDebt = new Prisma.Decimal(0);

  for (const po of orders) {
    totalPurchase = totalPurchase.plus(po.totalAmount);
    const diff = po.totalAmount.minus(po.paidAmount);
    if (diff.gt(0)) {
      outstandingDebt = outstandingDebt.plus(diff);
    }
  }

  return {
    purchaseOrderCount: orders.length,
    totalPurchaseAmount: totalPurchase.toFixed(2),
    outstandingDebt: outstandingDebt.toFixed(2),
  };
}

function toDto(
  row: PrismaSupplier & {
    purchaseOrders?: Array<{ totalAmount: Prisma.Decimal; paidAmount: Prisma.Decimal }>;
  },
): SupplierDto {
  const stats = summarizeOrders(row.purchaseOrders ?? []);
  return {
    id: row.id,
    name: row.name,
    contactPerson: row.contactPerson,
    phoneNumber: row.phoneNumber,
    address: row.address,
    notes: row.notes,
    isActive: row.isActive,
    ...stats,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetailDto(
  row: PrismaSupplier & {
    purchaseOrders: PurchaseOrderAggregateInput[];
  },
): SupplierDetailDto {
  const nonCancelled = row.purchaseOrders.filter((po) => po.status !== 'CANCELLED');
  const stats = summarizeOrders(nonCancelled);

  return {
    id: row.id,
    name: row.name,
    contactPerson: row.contactPerson,
    phoneNumber: row.phoneNumber,
    address: row.address,
    notes: row.notes,
    isActive: row.isActive,
    ...stats,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    recentPurchaseOrders: row.purchaseOrders.slice(0, 20).map((po) => {
      const remaining = po.totalAmount.minus(po.paidAmount);
      return {
        id: po.id,
        referenceNo: po.referenceNo,
        status: po.status as PurchaseOrderStatus,
        totalAmount: po.totalAmount.toFixed(2),
        paidAmount: po.paidAmount.toFixed(2),
        remainingDebt: (remaining.gt(0) && po.status !== 'CANCELLED'
          ? remaining
          : new Prisma.Decimal(0)
        ).toFixed(2),
        deliveredAt: po.deliveredAt ? po.deliveredAt.toISOString() : null,
        createdAt: po.createdAt.toISOString(),
      };
    }),
  };
}

/**
 * Layanan CRUD Supplier & Ringkasan Hutang Pembelian (M05-001).
 * Pembacaan daftar memakai cache-aside Redis (bust on write).
 */
export class SupplierService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: CacheStore,
    private readonly cacheCfg: CacheConfig,
  ) {}

  async list(query: SupplierListQuery): Promise<SupplierListResult> {
    const version = await this.cache.getVersion(SUPPLIER_CACHE_NAMESPACE);
    const cacheKey = [
      SUPPLIER_CACHE_NAMESPACE,
      `v${String(version)}`,
      `p${String(query.page)}`,
      `l${String(query.limit)}`,
      `a${query.isActive === undefined ? '-' : String(query.isActive)}`,
      `s${encodeURIComponent((query.search ?? '').toLowerCase())}`,
    ].join(':');

    const cached = await this.cache.get(cacheKey);
    if (cached !== null) {
      try {
        return JSON.parse(cached) as SupplierListResult;
      } catch {
        // Abaikan cache korup
      }
    }

    const where: Prisma.SupplierWhereInput = {
      deletedAt: null,
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { contactPerson: { contains: query.search, mode: 'insensitive' } },
        { phoneNumber: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.supplier.count({ where }),
      this.prisma.supplier.findMany({
        where,
        include: {
          purchaseOrders: {
            where: { status: { not: 'CANCELLED' } },
            select: { totalAmount: true, paidAmount: true },
          },
        },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    const meta: PaginationMeta = {
      page: query.page,
      limit: query.limit,
      total,
    };

    const result: SupplierListResult = {
      items: rows.map(toDto),
      meta,
    };

    await this.cache.set(cacheKey, JSON.stringify(result), this.cacheCfg.categoryTtlSeconds);
    return result;
  }

  async getById(id: string): Promise<SupplierDetailDto> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null },
      include: {
        purchaseOrders: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            referenceNo: true,
            status: true,
            totalAmount: true,
            paidAmount: true,
            deliveredAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!supplier) {
      throw new AppError(ERROR_CODES.SUPPLIER_NOT_FOUND, 'Supplier tidak ditemukan', 404, { id });
    }

    return toDetailDto(supplier);
  }

  async create(input: CreateSupplierInput, actor: SupplierActorContext): Promise<SupplierDto> {
    const created = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.supplier.findFirst({
        where: {
          name: { equals: input.name, mode: 'insensitive' },
          deletedAt: null,
        },
        select: { id: true },
      });

      if (existing) {
        throw new AppError(
          ERROR_CODES.DUPLICATE_SUPPLIER,
          `Supplier dengan nama "${input.name}" sudah terdaftar`,
          409,
          { field: 'name' },
        );
      }

      const row = await tx.supplier.create({
        data: {
          name: input.name,
          contactPerson: input.contactPerson ?? null,
          phoneNumber: input.phoneNumber ?? null,
          address: input.address ?? null,
          notes: input.notes ?? null,
          isActive: input.isActive ?? true,
        },
        include: {
          purchaseOrders: {
            where: { status: { not: 'CANCELLED' } },
            select: { totalAmount: true, paidAmount: true },
          },
        },
      });

      await recordAuditLog(tx, {
        userId: actor.userId,
        action: 'SUPPLIER_CREATED',
        entity: SUPPLIER_ENTITY,
        entityId: row.id,
        newValues: { name: row.name, contactPerson: row.contactPerson, isActive: row.isActive },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      return row;
    });

    await this.cache.bumpVersion(SUPPLIER_CACHE_NAMESPACE);
    return toDto(created);
  }

  async update(
    id: string,
    input: UpdateSupplierInput,
    actor: SupplierActorContext,
  ): Promise<SupplierDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.supplier.findFirst({
        where: { id, deletedAt: null },
      });

      if (!existing) {
        throw new AppError(ERROR_CODES.SUPPLIER_NOT_FOUND, 'Supplier tidak ditemukan', 404, { id });
      }

      if (input.name && input.name.toLowerCase() !== existing.name.toLowerCase()) {
        const dup = await tx.supplier.findFirst({
          where: {
            name: { equals: input.name, mode: 'insensitive' },
            deletedAt: null,
            id: { not: id },
          },
          select: { id: true },
        });
        if (dup) {
          throw new AppError(
            ERROR_CODES.DUPLICATE_SUPPLIER,
            `Supplier dengan nama "${input.name}" sudah terdaftar`,
            409,
            { field: 'name' },
          );
        }
      }

      const row = await tx.supplier.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.contactPerson !== undefined ? { contactPerson: input.contactPerson } : {}),
          ...(input.phoneNumber !== undefined ? { phoneNumber: input.phoneNumber } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        include: {
          purchaseOrders: {
            where: { status: { not: 'CANCELLED' } },
            select: { totalAmount: true, paidAmount: true },
          },
        },
      });

      await recordAuditLog(tx, {
        userId: actor.userId,
        action: 'SUPPLIER_UPDATED',
        entity: SUPPLIER_ENTITY,
        entityId: id,
        oldValues: {
          name: existing.name,
          contactPerson: existing.contactPerson,
          isActive: existing.isActive,
        },
        newValues: {
          name: row.name,
          contactPerson: row.contactPerson,
          isActive: row.isActive,
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      return row;
    });

    await this.cache.bumpVersion(SUPPLIER_CACHE_NAMESPACE);
    return toDto(updated);
  }

  async remove(id: string, actor: SupplierActorContext): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.supplier.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, name: true },
      });

      if (!existing) {
        throw new AppError(ERROR_CODES.SUPPLIER_NOT_FOUND, 'Supplier tidak ditemukan', 404, { id });
      }

      const activePoCount = await tx.purchaseOrder.count({
        where: {
          supplierId: id,
          status: { in: ['PENDING', 'PARTIAL'] },
        },
      });

      if (activePoCount > 0) {
        throw new AppError(
          ERROR_CODES.SUPPLIER_IN_USE,
          `Supplier "${existing.name}" masih memiliki ${String(activePoCount)} Purchase Order aktif`,
          409,
          { id, activePoCount },
        );
      }

      await tx.supplier.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });

      await recordAuditLog(tx, {
        userId: actor.userId,
        action: 'SUPPLIER_DELETED',
        entity: SUPPLIER_ENTITY,
        entityId: id,
        oldValues: { name: existing.name },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    });

    await this.cache.bumpVersion(SUPPLIER_CACHE_NAMESPACE);
  }
}
