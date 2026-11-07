import { ERROR_CODES, type PaginationMeta, type UserRole } from '@istana-buah/shared';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { CacheConfig } from '../../config/cache.config';
import type { CacheStore } from '../../lib/cache';
import { AppError } from '../../utils/app-error';
import { recordAuditLog } from '../../utils/audit-logger';
import { CATEGORY_CACHE_NAMESPACE } from '../categories/category.service';
import type {
  CreateProductInput,
  ProductActorContext,
  ProductDto,
  ProductListQuery,
  UpdateProductInput,
} from './product.dto';

export const PRODUCT_CACHE_NAMESPACE = 'products';
const PRODUCT_ENTITY = 'products';

export interface ProductListResult {
  items: ProductDto[];
  meta: PaginationMeta;
}

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: {
    category: { select: { id: true; name: true } };
    barcodes: {
      select: { id: true; barcode: true; isPrimary: true };
      orderBy: { createdAt: 'asc' };
    };
  };
}>;

const PRODUCT_INCLUDE = {
  category: { select: { id: true, name: true } },
  barcodes: {
    select: { id: true, barcode: true, isPrimary: true },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.ProductInclude;

function toDto(row: ProductWithRelations, role: UserRole): ProductDto {
  const isCashier = role === 'CASHIER';
  return {
    id: row.id,
    categoryId: row.categoryId,
    category: {
      id: row.category.id,
      name: row.category.name,
    },
    name: row.name,
    description: row.description,
    productType: row.productType,
    pricePerKg: row.pricePerKg !== null ? row.pricePerKg.toFixed(2) : null,
    pricePerUnit: row.pricePerUnit !== null ? row.pricePerUnit.toFixed(2) : null,
    costPerKg: isCashier || row.costPerKg === null ? null : row.costPerKg.toFixed(2),
    costPerUnit: isCashier || row.costPerUnit === null ? null : row.costPerUnit.toFixed(2),
    stockQty: row.stockQty.toString(),
    minStockAlert: row.minStockAlert !== null ? row.minStockAlert.toString() : null,
    imageUrl: row.imageUrl,
    isActive: row.isActive,
    barcodes: row.barcodes.map((b) => ({
      id: b.id,
      barcode: b.barcode,
      isPrimary: b.isPrimary,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Layanan CRUD & Pencarian Produk (M02-002).
 * - Sesuai NFR-SEC-09: HPP (costPerKg, costPerUnit) selalu disembunyikan dari role CASHIER.
 * - Sesuai WBS M02-002: Barcode lookup diindeks cepat (<50ms).
 * - Cache-aside berversi Redis (bust on write).
 * - Pencatatan riwayat harga (PriceHistory) otomatis saat terjadi perubahan harga.
 */
export class ProductService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: CacheStore,
    private readonly cacheCfg: CacheConfig,
  ) {}

  async list(query: ProductListQuery, role: UserRole): Promise<ProductListResult> {
    const version = await this.cache.getVersion(PRODUCT_CACHE_NAMESPACE);
    const cacheKey = [
      PRODUCT_CACHE_NAMESPACE,
      `v${String(version)}`,
      `r${role}`,
      `p${String(query.page)}`,
      `l${String(query.limit)}`,
      `c${query.categoryId ?? '-'}`,
      `t${query.type ?? '-'}`,
      `a${query.isActive === undefined ? '-' : String(query.isActive)}`,
      `w${query.lowStock === undefined ? '-' : String(query.lowStock)}`,
      `s${encodeURIComponent((query.search ?? '').toLowerCase())}`,
    ].join(':');

    const cached = await this.cache.get(cacheKey);
    if (cached !== null) {
      try {
        return JSON.parse(cached) as ProductListResult;
      } catch {
        // Cache parsing error -> refresh from DB
      }
    }

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.type ? { productType: query.type } : {}),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { barcodes: { some: { barcode: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }

    if (query.lowStock) {
      const lowStockRows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM products
        WHERE deleted_at IS NULL
          AND min_stock_alert IS NOT NULL
          AND stock_qty <= min_stock_alert
      `;
      const ids = lowStockRows.map((r) => r.id);
      where.id = { in: ids };
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: [{ name: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    const result: ProductListResult = {
      items: rows.map((row) => toDto(row, role)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
      },
    };

    await this.cache.set(cacheKey, JSON.stringify(result), this.cacheCfg.productTtlSeconds);
    return result;
  }

  async getById(id: string, role: UserRole): Promise<ProductDto> {
    const version = await this.cache.getVersion(PRODUCT_CACHE_NAMESPACE);
    const cacheKey = [PRODUCT_CACHE_NAMESPACE, `v${String(version)}`, `r${role}`, `id:${id}`].join(
      ':',
    );

    const cached = await this.cache.get(cacheKey);
    if (cached !== null) {
      try {
        return JSON.parse(cached) as ProductDto;
      } catch {
        // Cache parsing error
      }
    }

    const row = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: PRODUCT_INCLUDE,
    });

    if (!row) {
      throw new AppError(ERROR_CODES.PRODUCT_NOT_FOUND, 'Produk tidak ditemukan', 404, { id });
    }

    const dto = toDto(row, role);
    await this.cache.set(cacheKey, JSON.stringify(dto), this.cacheCfg.productTtlSeconds);
    return dto;
  }

  async getByBarcode(barcode: string, role: UserRole): Promise<ProductDto> {
    const version = await this.cache.getVersion(PRODUCT_CACHE_NAMESPACE);
    const cacheKey = [
      PRODUCT_CACHE_NAMESPACE,
      `v${String(version)}`,
      `r${role}`,
      `bc:${barcode}`,
    ].join(':');

    const cached = await this.cache.get(cacheKey);
    if (cached !== null) {
      try {
        return JSON.parse(cached) as ProductDto;
      } catch {
        // Cache parsing error
      }
    }

    const barcodeRow = await this.prisma.barcode.findUnique({
      where: { barcode },
      include: {
        product: {
          include: PRODUCT_INCLUDE,
        },
      },
    });

    if (!barcodeRow || !barcodeRow.product || barcodeRow.product.deletedAt !== null) {
      throw new AppError(
        ERROR_CODES.PRODUCT_NOT_FOUND,
        'Produk dengan barcode tersebut tidak ditemukan',
        404,
        { barcode },
      );
    }

    const dto = toDto(barcodeRow.product, role);
    await this.cache.set(cacheKey, JSON.stringify(dto), this.cacheCfg.productTtlSeconds);
    return dto;
  }

  async create(input: CreateProductInput, actor: ProductActorContext): Promise<ProductDto> {
    const category = await this.prisma.category.findFirst({
      where: { id: input.categoryId, deletedAt: null },
    });
    if (!category) {
      throw new AppError(ERROR_CODES.CATEGORY_NOT_FOUND, 'Kategori tidak ditemukan', 404, {
        categoryId: input.categoryId,
      });
    }

    if (input.barcodes && input.barcodes.length > 0) {
      const uniqueBarcodes = Array.from(new Set(input.barcodes));
      if (uniqueBarcodes.length !== input.barcodes.length) {
        throw new AppError(
          ERROR_CODES.DUPLICATE_BARCODE,
          'Terdapat barcode duplikat dalam data yang dikirim',
          409,
          { field: 'barcodes' },
        );
      }

      const existingBarcode = await this.prisma.barcode.findFirst({
        where: { barcode: { in: input.barcodes } },
        select: { barcode: true },
      });
      if (existingBarcode) {
        throw new AppError(
          ERROR_CODES.DUPLICATE_BARCODE,
          `Barcode "${existingBarcode.barcode}" sudah digunakan oleh produk lain`,
          409,
          { field: 'barcodes', barcode: existingBarcode.barcode },
        );
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name: input.name,
          categoryId: input.categoryId,
          description: input.description ?? null,
          productType: input.productType,
          pricePerKg:
            input.pricePerKg !== undefined && input.pricePerKg !== null
              ? new Prisma.Decimal(input.pricePerKg)
              : null,
          pricePerUnit:
            input.pricePerUnit !== undefined && input.pricePerUnit !== null
              ? new Prisma.Decimal(input.pricePerUnit)
              : null,
          costPerKg:
            input.costPerKg !== undefined && input.costPerKg !== null
              ? new Prisma.Decimal(input.costPerKg)
              : null,
          costPerUnit:
            input.costPerUnit !== undefined && input.costPerUnit !== null
              ? new Prisma.Decimal(input.costPerUnit)
              : null,
          minStockAlert:
            input.minStockAlert !== undefined && input.minStockAlert !== null
              ? new Prisma.Decimal(input.minStockAlert)
              : null,
          imageUrl: input.imageUrl ?? null,
          isActive: input.isActive ?? true,
          barcodes:
            input.barcodes && input.barcodes.length > 0
              ? {
                  create: input.barcodes.map((bc, idx) => ({
                    barcode: bc,
                    isPrimary: idx === 0,
                  })),
                }
              : undefined,
        },
        include: PRODUCT_INCLUDE,
      });

      await recordAuditLog(tx, {
        userId: actor.userId,
        action: 'PRODUCT_CREATED',
        entity: PRODUCT_ENTITY,
        entityId: product.id,
        newValues: {
          name: product.name,
          productType: product.productType,
          categoryId: product.categoryId,
          barcodes: input.barcodes ?? [],
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      return product;
    });

    await Promise.all([
      this.cache.bumpVersion(PRODUCT_CACHE_NAMESPACE),
      this.cache.bumpVersion(CATEGORY_CACHE_NAMESPACE),
    ]);

    return toDto(created, actor.role);
  }

  async update(
    id: string,
    input: UpdateProductInput,
    actor: ProductActorContext,
  ): Promise<ProductDto> {
    const existing = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: PRODUCT_INCLUDE,
    });

    if (!existing) {
      throw new AppError(ERROR_CODES.PRODUCT_NOT_FOUND, 'Produk tidak ditemukan', 404, { id });
    }

    if (input.categoryId && input.categoryId !== existing.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: input.categoryId, deletedAt: null },
      });
      if (!category) {
        throw new AppError(ERROR_CODES.CATEGORY_NOT_FOUND, 'Kategori tidak ditemukan', 404, {
          categoryId: input.categoryId,
        });
      }
    }

    const targetType = input.productType ?? existing.productType;
    if (targetType === 'WEIGHT') {
      const resultingPricePerKg =
        input.pricePerKg ?? (existing.pricePerKg ? Number(existing.pricePerKg) : null);
      if (resultingPricePerKg === null) {
        throw new AppError(
          ERROR_CODES.INVALID_PRODUCT_TYPE_FIELDS,
          'Produk bertipe WEIGHT wajib memiliki harga per kg (pricePerKg)',
          400,
          { field: 'pricePerKg' },
        );
      }
      if (input.pricePerUnit !== undefined && input.pricePerUnit !== null) {
        throw new AppError(
          ERROR_CODES.INVALID_PRODUCT_TYPE_FIELDS,
          'Produk bertipe WEIGHT tidak boleh memiliki harga per unit (pricePerUnit)',
          400,
          { field: 'pricePerUnit' },
        );
      }
      if (input.costPerUnit !== undefined && input.costPerUnit !== null) {
        throw new AppError(
          ERROR_CODES.INVALID_PRODUCT_TYPE_FIELDS,
          'Produk bertipe WEIGHT tidak boleh memiliki HPP per unit (costPerUnit)',
          400,
          { field: 'costPerUnit' },
        );
      }
    } else if (targetType === 'UNIT') {
      const resultingPricePerUnit =
        input.pricePerUnit ?? (existing.pricePerUnit ? Number(existing.pricePerUnit) : null);
      if (resultingPricePerUnit === null) {
        throw new AppError(
          ERROR_CODES.INVALID_PRODUCT_TYPE_FIELDS,
          'Produk bertipe UNIT wajib memiliki harga per unit (pricePerUnit)',
          400,
          { field: 'pricePerUnit' },
        );
      }
      if (input.pricePerKg !== undefined && input.pricePerKg !== null) {
        throw new AppError(
          ERROR_CODES.INVALID_PRODUCT_TYPE_FIELDS,
          'Produk bertipe UNIT tidak boleh memiliki harga per kg (pricePerKg)',
          400,
          { field: 'pricePerKg' },
        );
      }
      if (input.costPerKg !== undefined && input.costPerKg !== null) {
        throw new AppError(
          ERROR_CODES.INVALID_PRODUCT_TYPE_FIELDS,
          'Produk bertipe UNIT tidak boleh memiliki HPP per kg (costPerKg)',
          400,
          { field: 'costPerKg' },
        );
      }
    }

    if (input.barcodes !== undefined) {
      const uniqueBarcodes = Array.from(new Set(input.barcodes));
      if (uniqueBarcodes.length !== input.barcodes.length) {
        throw new AppError(
          ERROR_CODES.DUPLICATE_BARCODE,
          'Terdapat barcode duplikat dalam data yang dikirim',
          409,
          { field: 'barcodes' },
        );
      }

      if (input.barcodes.length > 0) {
        const conflictingBarcode = await this.prisma.barcode.findFirst({
          where: {
            barcode: { in: input.barcodes },
            productId: { not: id },
          },
          select: { barcode: true },
        });

        if (conflictingBarcode) {
          throw new AppError(
            ERROR_CODES.DUPLICATE_BARCODE,
            `Barcode "${conflictingBarcode.barcode}" sudah digunakan oleh produk lain`,
            409,
            { field: 'barcodes', barcode: conflictingBarcode.barcode },
          );
        }
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Periksa dan catat perubahan harga ke price_histories
      if (input.pricePerKg !== undefined && input.pricePerKg !== null) {
        const oldPriceVal = existing.pricePerKg ? Number(existing.pricePerKg) : 0;
        if (oldPriceVal !== input.pricePerKg) {
          await tx.priceHistory.create({
            data: {
              productId: id,
              oldPrice: existing.pricePerKg ?? new Prisma.Decimal(0),
              newPrice: new Prisma.Decimal(input.pricePerKg),
              priceType: 'WEIGHT',
              changedBy: actor.userId,
              reason: input.priceChangeReason ?? 'Penyesuaian harga per kg',
            },
          });
        }
      }

      if (input.pricePerUnit !== undefined && input.pricePerUnit !== null) {
        const oldPriceVal = existing.pricePerUnit ? Number(existing.pricePerUnit) : 0;
        if (oldPriceVal !== input.pricePerUnit) {
          await tx.priceHistory.create({
            data: {
              productId: id,
              oldPrice: existing.pricePerUnit ?? new Prisma.Decimal(0),
              newPrice: new Prisma.Decimal(input.pricePerUnit),
              priceType: 'UNIT',
              changedBy: actor.userId,
              reason: input.priceChangeReason ?? 'Penyesuaian harga per pcs',
            },
          });
        }
      }

      if (input.barcodes !== undefined) {
        await tx.barcode.deleteMany({ where: { productId: id } });
        if (input.barcodes.length > 0) {
          await tx.barcode.createMany({
            data: input.barcodes.map((bc, idx) => ({
              productId: id,
              barcode: bc,
              isPrimary: idx === 0,
            })),
          });
        }
      }

      const product = await tx.product.update({
        where: { id },
        data: {
          name: input.name,
          categoryId: input.categoryId,
          description: input.description,
          productType: input.productType,
          pricePerKg:
            targetType === 'UNIT'
              ? null
              : input.pricePerKg !== undefined
                ? input.pricePerKg === null
                  ? null
                  : new Prisma.Decimal(input.pricePerKg)
                : undefined,
          pricePerUnit:
            targetType === 'WEIGHT'
              ? null
              : input.pricePerUnit !== undefined
                ? input.pricePerUnit === null
                  ? null
                  : new Prisma.Decimal(input.pricePerUnit)
                : undefined,
          costPerKg:
            targetType === 'UNIT'
              ? null
              : input.costPerKg !== undefined
                ? input.costPerKg === null
                  ? null
                  : new Prisma.Decimal(input.costPerKg)
                : undefined,
          costPerUnit:
            targetType === 'WEIGHT'
              ? null
              : input.costPerUnit !== undefined
                ? input.costPerUnit === null
                  ? null
                  : new Prisma.Decimal(input.costPerUnit)
                : undefined,
          minStockAlert:
            input.minStockAlert !== undefined
              ? input.minStockAlert === null
                ? null
                : new Prisma.Decimal(input.minStockAlert)
              : undefined,
          imageUrl: input.imageUrl,
          isActive: input.isActive,
        },
        include: PRODUCT_INCLUDE,
      });

      await recordAuditLog(tx, {
        userId: actor.userId,
        action: 'PRODUCT_UPDATED',
        entity: PRODUCT_ENTITY,
        entityId: id,
        oldValues: {
          name: existing.name,
          categoryId: existing.categoryId,
          productType: existing.productType,
          pricePerKg: existing.pricePerKg ? existing.pricePerKg.toString() : null,
          pricePerUnit: existing.pricePerUnit ? existing.pricePerUnit.toString() : null,
          isActive: existing.isActive,
        },
        newValues: {
          changes: input,
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      return product;
    });

    await Promise.all([
      this.cache.bumpVersion(PRODUCT_CACHE_NAMESPACE),
      this.cache.bumpVersion(CATEGORY_CACHE_NAMESPACE),
    ]);

    return toDto(updated, actor.role);
  }

  async remove(id: string, actor: ProductActorContext): Promise<void> {
    const existing = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new AppError(ERROR_CODES.PRODUCT_NOT_FOUND, 'Produk tidak ditemukan', 404, { id });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
      });

      await recordAuditLog(tx, {
        userId: actor.userId,
        action: 'PRODUCT_DELETED',
        entity: PRODUCT_ENTITY,
        entityId: id,
        oldValues: { name: existing.name },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    });

    await Promise.all([
      this.cache.bumpVersion(PRODUCT_CACHE_NAMESPACE),
      this.cache.bumpVersion(CATEGORY_CACHE_NAMESPACE),
    ]);
  }
}
