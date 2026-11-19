import { ERROR_CODES, type PaginationMeta } from '@istana-buah/shared';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { CacheConfig } from '../../config/cache.config';
import type { CacheStore } from '../../lib/cache';
import { AppError } from '../../utils/app-error';
import { recordAuditLog } from '../../utils/audit-logger';
import type {
  CategoryActorContext,
  CategoryDto,
  CategoryListQuery,
  CreateCategoryInput,
  UpdateCategoryInput,
} from './category.dto';

export const CATEGORY_CACHE_NAMESPACE = 'categories';
const CATEGORY_ENTITY = 'categories';

export interface CategoryListResult {
  items: CategoryDto[];
  meta: PaginationMeta;
}

type CategoryWithCount = Prisma.CategoryGetPayload<{
  include: { _count: { select: { products: true } } };
}>;

const WITH_PRODUCT_COUNT = {
  _count: { select: { products: { where: { deletedAt: null } } } },
} satisfies Prisma.CategoryInclude;

function toDto(row: CategoryWithCount): CategoryDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    productCount: row._count.products,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function duplicateError(name: string): AppError {
  return new AppError(
    ERROR_CODES.DUPLICATE_CATEGORY,
    `Kategori dengan nama "${name}" sudah ada`,
    409,
    { field: 'name' },
  );
}

/**
 * Layanan CRUD kategori (M02-001). Pembacaan memakai cache-aside Redis berversi (bust on write),
 * penulisan atomik dalam transaksi + audit log, duplikat ditangani via unique constraint (anti-race).
 */
export class CategoryService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: CacheStore,
    private readonly cacheCfg: CacheConfig,
  ) {}

  async list(query: CategoryListQuery): Promise<CategoryListResult> {
    const version = await this.cache.getVersion(CATEGORY_CACHE_NAMESPACE);
    const cacheKey = [
      CATEGORY_CACHE_NAMESPACE,
      `v${String(version)}`,
      `p${String(query.page)}`,
      `l${String(query.limit)}`,
      `a${query.isActive === undefined ? '-' : String(query.isActive)}`,
      `s${encodeURIComponent((query.search ?? '').toLowerCase())}`,
    ].join(':');

    const cached = await this.cache.get(cacheKey);
    if (cached !== null) {
      try {
        return JSON.parse(cached) as CategoryListResult;
      } catch {
        // Cache korup -> abaikan dan muat ulang dari database.
      }
    }

    const where: Prisma.CategoryWhereInput = {
      deletedAt: null,
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.category.count({ where }),
      this.prisma.category.findMany({
        where,
        include: WITH_PRODUCT_COUNT,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    const result: CategoryListResult = {
      items: rows.map(toDto),
      meta: { page: query.page, limit: query.limit, total },
    };
    await this.cache.set(cacheKey, JSON.stringify(result), this.cacheCfg.categoryTtlSeconds);
    return result;
  }

  async getById(id: string): Promise<CategoryDto> {
    const row = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      include: WITH_PRODUCT_COUNT,
    });
    if (!row) {
      throw this.notFound();
    }
    return toDto(row);
  }

  async create(input: CreateCategoryInput, actor: CategoryActorContext): Promise<CategoryDto> {
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.category.findUnique({ where: { name: input.name } });
        if (existing && existing.deletedAt === null) {
          throw duplicateError(input.name);
        }

        const data = {
          name: input.name,
          description: input.description ?? null,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
          deletedAt: null,
        };

        // Nama kategori yang pernah dihapus (soft delete) dipulihkan agar unique name tetap konsisten.
        const row = existing
          ? await tx.category.update({
              where: { id: existing.id },
              data,
              include: WITH_PRODUCT_COUNT,
            })
          : await tx.category.create({ data, include: WITH_PRODUCT_COUNT });

        await recordAuditLog(tx, {
          userId: actor.userId,
          action: existing ? 'CATEGORY_RESTORED' : 'CATEGORY_CREATED',
          entity: CATEGORY_ENTITY,
          entityId: row.id,
          newValues: data,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });
        return row;
      });

      await this.cache.bumpVersion(CATEGORY_CACHE_NAMESPACE);
      return toDto(created);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw duplicateError(input.name);
      }
      throw error;
    }
  }

  async update(
    id: string,
    input: UpdateCategoryInput,
    actor: CategoryActorContext,
  ): Promise<CategoryDto> {
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const current = await tx.category.findFirst({ where: { id, deletedAt: null } });
        if (!current) {
          throw this.notFound();
        }

        if (input.name !== undefined && input.name !== current.name) {
          const clash = await tx.category.findUnique({ where: { name: input.name } });
          if (clash && clash.id !== id) {
            throw duplicateError(input.name);
          }
        }

        const data: Prisma.CategoryUpdateInput = {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        };

        const row = await tx.category.update({
          where: { id },
          data,
          include: WITH_PRODUCT_COUNT,
        });

        await recordAuditLog(tx, {
          userId: actor.userId,
          action: 'CATEGORY_UPDATED',
          entity: CATEGORY_ENTITY,
          entityId: id,
          oldValues: {
            name: current.name,
            description: current.description,
            sortOrder: current.sortOrder,
            isActive: current.isActive,
          },
          newValues: data,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });
        return row;
      });

      await this.cache.bumpVersion(CATEGORY_CACHE_NAMESPACE);
      return toDto(updated);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw duplicateError(input.name ?? '');
      }
      throw error;
    }
  }

  async remove(id: string, actor: CategoryActorContext): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.category.findFirst({ where: { id, deletedAt: null } });
      if (!current) {
        throw this.notFound();
      }

      const productCount = await tx.product.count({
        where: { categoryId: id, deletedAt: null },
      });
      if (productCount > 0) {
        throw new AppError(
          ERROR_CODES.CATEGORY_IN_USE,
          `Kategori masih dipakai ${String(productCount)} produk aktif. Pindahkan atau hapus produknya terlebih dahulu`,
          409,
          { productCount },
        );
      }

      await tx.category.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });

      await recordAuditLog(tx, {
        userId: actor.userId,
        action: 'CATEGORY_DELETED',
        entity: CATEGORY_ENTITY,
        entityId: id,
        oldValues: { name: current.name, isActive: current.isActive },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    });

    await this.cache.bumpVersion(CATEGORY_CACHE_NAMESPACE);
  }

  private notFound(): AppError {
    return new AppError(ERROR_CODES.CATEGORY_NOT_FOUND, 'Kategori tidak ditemukan', 404);
  }
}
