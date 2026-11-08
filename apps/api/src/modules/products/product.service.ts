import { randomInt } from 'node:crypto';
import {
  ERROR_CODES,
  MAX_BARCODES_PER_PRODUCT,
  calculateEan13CheckDigit,
  type PaginationMeta,
  type UserRole,
} from '@istana-buah/shared';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { CacheConfig } from '../../config/cache.config';
import type { CacheStore } from '../../lib/cache';
import { AppError } from '../../utils/app-error';
import { recordAuditLog } from '../../utils/audit-logger';
import { CATEGORY_CACHE_NAMESPACE } from '../categories/category.service';
import type {
  AddProductBarcode,
  BatchImportProductResult,
  BatchImportProductsInput,
  BatchImportRowError,
  CreateProductInput,
  GenerateBarcodeResult,
  ProductActorContext,
  ProductBarcodeDto,
  ProductDto,
  ProductListQuery,
  UpdateProductInput,
} from './product.dto';

export const PRODUCT_CACHE_NAMESPACE = 'products';
const PRODUCT_ENTITY = 'products';
const BARCODE_ENTITY = 'barcodes';
const DEFAULT_IN_STORE_BARCODE_PREFIX = '200';
const MAX_BARCODE_COLLISION_RETRIES = 10;

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

  /**
   * Menghasilkan barcode unik bertaraf EAN-13 standar GS1 (M02-003).
   * - Format 13 digit: [Prefix 2-4 digit][Random numerik][Check digit Modulus 10]
   * - Menjamin keunikan dengan verifikasi DB dan retry loop otomatis bila terjadi tabrakan (collision).
   */
  async generateBarcode(prefix = DEFAULT_IN_STORE_BARCODE_PREFIX): Promise<GenerateBarcodeResult> {
    const cleanPrefix = prefix.trim();
    if (!/^\d{2,4}$/.test(cleanPrefix)) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        'Prefix barcode harus berupa 2-4 digit angka numerik',
        400,
        { prefix },
      );
    }

    const randomDigitsLength = 12 - cleanPrefix.length;

    for (let attempt = 0; attempt < MAX_BARCODE_COLLISION_RETRIES; attempt++) {
      let candidate12 = cleanPrefix;
      for (let i = 0; i < randomDigitsLength; i++) {
        candidate12 += String(randomInt(0, 10));
      }

      const checkDigit = calculateEan13CheckDigit(candidate12);
      const barcode = `${candidate12}${String(checkDigit)}`;

      const existing = await this.prisma.barcode.findUnique({
        where: { barcode },
      });

      if (!existing) {
        return { barcode };
      }
    }

    throw new AppError(
      ERROR_CODES.INTERNAL_ERROR,
      'Gagal menghasilkan barcode unik setelah beberapa percobaan collision',
      500,
    );
  }

  /**
   * Menghasilkan barcode baru dan langsung melekatkannya ke produk (M02-003).
   */
  async generateAndAttachBarcode(
    productId: string,
    prefix: string | undefined,
    isPrimary: boolean | undefined,
    actor: ProductActorContext,
  ): Promise<ProductBarcodeDto> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: { barcodes: true },
    });

    if (!product) {
      throw new AppError(ERROR_CODES.PRODUCT_NOT_FOUND, 'Produk tidak ditemukan', 404, {
        id: productId,
      });
    }

    if (product.barcodes.length >= MAX_BARCODES_PER_PRODUCT) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        `Maksimal ${String(MAX_BARCODES_PER_PRODUCT)} barcode per produk`,
        400,
        { productId, currentCount: product.barcodes.length },
      );
    }

    const { barcode } = await this.generateBarcode(prefix);
    const shouldBePrimary = product.barcodes.length === 0 ? true : isPrimary === true;

    const created = await this.prisma.$transaction(async (tx) => {
      if (shouldBePrimary && product.barcodes.length > 0) {
        await tx.barcode.updateMany({
          where: { productId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      const row = await tx.barcode.create({
        data: {
          productId,
          barcode,
          isPrimary: shouldBePrimary,
        },
      });

      await recordAuditLog(tx, {
        userId: actor.userId,
        action: 'BARCODE_ATTACHED',
        entity: BARCODE_ENTITY,
        entityId: row.id,
        newValues: {
          productId,
          barcode: row.barcode,
          isPrimary: row.isPrimary,
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      return row;
    });

    await this.cache.bumpVersion(PRODUCT_CACHE_NAMESPACE);

    return {
      id: created.id,
      barcode: created.barcode,
      isPrimary: created.isPrimary,
    };
  }

  /**
   * Mendaftarkan barcode yang diinput manual ke produk (M02-003).
   */
  async addBarcode(
    productId: string,
    input: AddProductBarcode,
    actor: ProductActorContext,
  ): Promise<ProductBarcodeDto> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: { barcodes: true },
    });

    if (!product) {
      throw new AppError(ERROR_CODES.PRODUCT_NOT_FOUND, 'Produk tidak ditemukan', 404, {
        id: productId,
      });
    }

    if (product.barcodes.length >= MAX_BARCODES_PER_PRODUCT) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        `Maksimal ${String(MAX_BARCODES_PER_PRODUCT)} barcode per produk`,
        400,
        { productId, currentCount: product.barcodes.length },
      );
    }

    const duplicate = await this.prisma.barcode.findUnique({
      where: { barcode: input.barcode },
    });

    if (duplicate) {
      throw new AppError(
        ERROR_CODES.DUPLICATE_BARCODE,
        'Barcode sudah terdaftar pada sistem',
        409,
        { barcode: input.barcode },
      );
    }

    const shouldBePrimary = product.barcodes.length === 0 ? true : input.isPrimary === true;

    const created = await this.prisma.$transaction(async (tx) => {
      if (shouldBePrimary && product.barcodes.length > 0) {
        await tx.barcode.updateMany({
          where: { productId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      const row = await tx.barcode.create({
        data: {
          productId,
          barcode: input.barcode,
          isPrimary: shouldBePrimary,
        },
      });

      await recordAuditLog(tx, {
        userId: actor.userId,
        action: 'BARCODE_ATTACHED',
        entity: BARCODE_ENTITY,
        entityId: row.id,
        newValues: {
          productId,
          barcode: row.barcode,
          isPrimary: row.isPrimary,
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      return row;
    });

    await this.cache.bumpVersion(PRODUCT_CACHE_NAMESPACE);

    return {
      id: created.id,
      barcode: created.barcode,
      isPrimary: created.isPrimary,
    };
  }

  /**
   * Menghapus salah satu barcode dari produk (M02-003).
   * Bila barcode yang dihapus berstatus primer dan produk masih memiliki barcode lain,
   * barcode tertua yang tersisa akan otomatis dipromosikan menjadi barcode primer.
   */
  async removeBarcode(
    productId: string,
    barcodeId: string,
    actor: ProductActorContext,
  ): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
    });

    if (!product) {
      throw new AppError(ERROR_CODES.PRODUCT_NOT_FOUND, 'Produk tidak ditemukan', 404, {
        id: productId,
      });
    }

    const existingBarcode = await this.prisma.barcode.findFirst({
      where: { id: barcodeId, productId },
    });

    if (!existingBarcode) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Barcode tidak ditemukan pada produk ini', 404, {
        barcodeId,
        productId,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.barcode.delete({
        where: { id: barcodeId },
      });

      if (existingBarcode.isPrimary) {
        const remaining = await tx.barcode.findFirst({
          where: { productId },
          orderBy: { createdAt: 'asc' },
        });

        if (remaining) {
          await tx.barcode.update({
            where: { id: remaining.id },
            data: { isPrimary: true },
          });
        }
      }

      await recordAuditLog(tx, {
        userId: actor.userId,
        action: 'BARCODE_REMOVED',
        entity: BARCODE_ENTITY,
        entityId: barcodeId,
        oldValues: {
          productId,
          barcode: existingBarcode.barcode,
          isPrimary: existingBarcode.isPrimary,
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    });

    await this.cache.bumpVersion(PRODUCT_CACHE_NAMESPACE);
  }

  /**
   * Mengatur barcode tertentu menjadi barcode primer produk (M02-003).
   */
  async setPrimaryBarcode(
    productId: string,
    barcodeId: string,
    actor: ProductActorContext,
  ): Promise<ProductBarcodeDto> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
    });

    if (!product) {
      throw new AppError(ERROR_CODES.PRODUCT_NOT_FOUND, 'Produk tidak ditemukan', 404, {
        id: productId,
      });
    }

    const existingBarcode = await this.prisma.barcode.findFirst({
      where: { id: barcodeId, productId },
    });

    if (!existingBarcode) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Barcode tidak ditemukan pada produk ini', 404, {
        barcodeId,
        productId,
      });
    }

    if (existingBarcode.isPrimary) {
      return {
        id: existingBarcode.id,
        barcode: existingBarcode.barcode,
        isPrimary: existingBarcode.isPrimary,
      };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.barcode.updateMany({
        where: { productId, isPrimary: true },
        data: { isPrimary: false },
      });

      const row = await tx.barcode.update({
        where: { id: barcodeId },
        data: { isPrimary: true },
      });

      await recordAuditLog(tx, {
        userId: actor.userId,
        action: 'BARCODE_PRIMARY_CHANGED',
        entity: BARCODE_ENTITY,
        entityId: barcodeId,
        newValues: { isPrimary: true },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      return row;
    });

    await this.cache.bumpVersion(PRODUCT_CACHE_NAMESPACE);

    return {
      id: updated.id,
      barcode: updated.barcode,
      isPrimary: updated.isPrimary,
    };
  }

  /**
   * Impor produk massal via CSV/Excel (M02-007).
   * Mampu memproses 100+ produk secara atomik dalam transaksi atau melaporkan status per baris:
   * - Menemukan atau membuat kategori berdasarkan categoryName
   * - Memvalidasi barcode unik (baik antar baris maupun terhadap DB)
   * - Menghasilkan EAN-13 GS1 otomatis bila barcode tidak diisi
   * - Menyimpan produk dan barcode primer
   * - Menginvaliasi Redis cache produk dan kategori
   * - Menghasilkan audit log sistem
   */
  async batchImport(
    input: BatchImportProductsInput,
    actor: ProductActorContext,
  ): Promise<BatchImportProductResult> {
    const errors: BatchImportRowError[] = [];
    const candidateBarcodes: string[] = [];
    const usedBarcodesInBatch = new Set<string>();

    // 1. Validasi barcode duplikat di dalam batch request itu sendiri
    input.items.forEach((item, idx) => {
      const rowNum = idx + 2; // header adalah baris 1
      if (item.barcode && item.barcode.trim().length > 0) {
        const bc = item.barcode.trim();
        if (usedBarcodesInBatch.has(bc)) {
          errors.push({
            row: rowNum,
            name: item.name,
            message: `Barcode "${bc}" duplikat di dalam data impor`,
          });
        } else {
          usedBarcodesInBatch.add(bc);
          candidateBarcodes.push(bc);
        }
      }
    });

    // 2. Periksa apakah ada barcode yang sudah digunakan di DB
    if (candidateBarcodes.length > 0) {
      const existingDbBarcodes = await this.prisma.barcode.findMany({
        where: { barcode: { in: candidateBarcodes } },
        select: { barcode: true },
      });
      const dbBarcodeSet = new Set((existingDbBarcodes ?? []).map((b) => b.barcode));

      input.items.forEach((item, idx) => {
        const rowNum = idx + 2;
        if (item.barcode && dbBarcodeSet.has(item.barcode.trim())) {
          errors.push({
            row: rowNum,
            name: item.name,
            message: `Barcode "${item.barcode}" sudah digunakan oleh produk lain di database`,
          });
        }
      });
    }

    // Jika ada error validasi barcode, kembalikan status error per baris tanpa mengubah DB
    if (errors.length > 0) {
      return {
        totalProcessed: input.items.length,
        importedCount: 0,
        failedCount: errors.length,
        errors,
        createdProductIds: [],
      };
    }

    // 3. Proses kategori: muat kategori yang ada
    const existingCategories = await this.prisma.category.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });
    const categoryMap = new Map<string, string>();
    existingCategories.forEach((cat) => {
      categoryMap.set(cat.name.toLowerCase().trim(), cat.id);
    });

    // 4. Eksekusi penyimpanan dalam $transaction atomik
    const createdProductIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      // Siapkan kategori baru jika ada yang belum terdaftar
      for (const item of input.items) {
        const normalizedCatName = item.categoryName.toLowerCase().trim();
        if (!categoryMap.has(normalizedCatName)) {
          const newCat = await tx.category.create({
            data: {
              name: item.categoryName.trim(),
              description: `Kategori ${item.categoryName.trim()} dibuat otomatis saat impor produk`,
              isActive: true,
            },
          });
          categoryMap.set(normalizedCatName, newCat.id);
        }
      }

      // Simpan setiap produk
      for (const item of input.items) {
        const categoryId = categoryMap.get(item.categoryName.toLowerCase().trim())!;

        let barcodeValue = item.barcode?.trim();
        if (!barcodeValue) {
          // Auto generate GS1 Modulo-10 barcode
          let candidate = DEFAULT_IN_STORE_BARCODE_PREFIX;
          for (let d = 0; d < 9; d++) {
            candidate += String(randomInt(0, 10));
          }
          const checkDigit = calculateEan13CheckDigit(candidate);
          barcodeValue = `${candidate}${String(checkDigit)}`;
        }

        const isWeight = item.productType === 'WEIGHT';
        const priceDecimal = new Prisma.Decimal(item.price);
        const costDecimal =
          item.cost !== undefined && item.cost !== null ? new Prisma.Decimal(item.cost) : null;
        const stockDecimal =
          item.stockQty !== undefined && item.stockQty !== null
            ? new Prisma.Decimal(item.stockQty)
            : new Prisma.Decimal(0);
        const minAlertDecimal =
          item.minStockAlert !== undefined && item.minStockAlert !== null
            ? new Prisma.Decimal(item.minStockAlert)
            : new Prisma.Decimal(10);

        const product = await tx.product.create({
          data: {
            name: item.name,
            categoryId,
            description: item.description ?? null,
            productType: item.productType,
            pricePerKg: isWeight ? priceDecimal : null,
            pricePerUnit: !isWeight ? priceDecimal : null,
            costPerKg: isWeight ? costDecimal : null,
            costPerUnit: !isWeight ? costDecimal : null,
            stockQty: stockDecimal,
            minStockAlert: minAlertDecimal,
            isActive: true,
            barcodes: {
              create: [
                {
                  barcode: barcodeValue,
                  isPrimary: true,
                },
              ],
            },
          },
        });

        // Catat riwayat harga awal
        await tx.priceHistory.create({
          data: {
            productId: product.id,
            oldPrice: new Prisma.Decimal(0),
            newPrice: priceDecimal,
            priceType: isWeight ? 'WEIGHT' : 'UNIT',
            changedBy: actor.userId,
            reason: 'Impor awal produk massal',
          },
        });

        createdProductIds.push(product.id);
      }

      // Catat log audit aktivitas impor massal
      await recordAuditLog(tx, {
        userId: actor.userId,
        action: 'PRODUCT_BATCH_IMPORT',
        entity: PRODUCT_ENTITY,
        entityId: createdProductIds[0] ?? 'batch',
        newValues: {
          importedCount: createdProductIds.length,
          itemNames: input.items.slice(0, 5).map((it) => it.name),
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    });

    // 5. Invalidate Redis Caches
    await Promise.all([
      this.cache.bumpVersion(PRODUCT_CACHE_NAMESPACE),
      this.cache.bumpVersion(CATEGORY_CACHE_NAMESPACE),
    ]);

    return {
      totalProcessed: input.items.length,
      importedCount: createdProductIds.length,
      failedCount: 0,
      errors: [],
      createdProductIds,
    };
  }
}
