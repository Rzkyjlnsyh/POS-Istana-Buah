import {
  ERROR_CODES,
  type PaginationMeta,
  type ProductType,
  type WasteRecordDto,
  type WasteSummaryReportDto,
  type WasteTimelinePointDto,
  type WasteTopProductDto,
  type WasteType,
  type WasteTypeBreakdownDto,
} from '@istana-buah/shared';
import { Prisma, type PrismaClient, type WasteRecord as PrismaWasteRecord } from '@prisma/client';
import type { CacheConfig } from '../../config/cache.config';
import {
  CACHE_NAMESPACES,
  InMemoryCacheStore,
  readJsonCache,
  writeJsonCache,
  type CacheStore,
} from '../../lib/cache';
import { AppError } from '../../utils/app-error';
import { recordAuditLog } from '../../utils/audit-logger';
import {
  getCalendarYmdDashedInTimeZone,
  getMonthKeyInTimeZone,
  parseRangeBoundary,
  shiftYmdDashed,
} from '../../utils/date-helpers';
import type {
  CreateWasteRecordInput,
  WasteActorContext,
  WasteRecordListServiceQuery,
  WasteSummaryQuery,
} from './waste.dto';

export const WASTE_CACHE_NAMESPACE = CACHE_NAMESPACES.WASTE;
const WASTE_ENTITY = 'waste_records';
const DEFAULT_WASTE_SUMMARY_WINDOW_DAYS = 30;

type WasteWithRelations = PrismaWasteRecord & {
  product: {
    id: string;
    name: string;
    productType: ProductType;
    category: { name: string };
  };
  recorder: {
    id: string;
    fullName: string;
  };
};

const WASTE_INCLUDE = {
  product: {
    select: {
      id: true,
      name: true,
      productType: true,
      category: { select: { name: true } },
    },
  },
  recorder: {
    select: {
      id: true,
      fullName: true,
    },
  },
} satisfies Prisma.WasteRecordInclude;

function toWasteDto(row: WasteWithRelations): WasteRecordDto {
  const qty = Number(row.quantity);
  const est = Number(row.estimatedCost);
  const unitCost = qty > 0 ? est / qty : 0;

  return {
    id: row.id,
    productId: row.productId,
    productName: row.product.name,
    productType: row.product.productType,
    categoryName: row.product.category.name,
    wasteType: row.wasteType as WasteType,
    quantity: row.quantity.toString(),
    unitCost: unitCost.toFixed(2),
    estimatedCost: row.estimatedCost.toFixed(2),
    reason: row.reason,
    photoUrl: row.photoUrl,
    recordedBy: row.recordedBy,
    recorderName: row.recorder.fullName,
    recordedAt: row.recordedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export interface WasteRecordListResult {
  items: WasteRecordDto[];
  meta: PaginationMeta;
}

/**
 * Layanan Pencatatan & Laporan Penyusutan/Kerusakan Buah (M09-001).
 * Mengurangi stok produk secara atomik (`FOR UPDATE`), menghitung kerugian berdasar HPP,
 * mencatat mutasi `WASTE_OUT` + audit log, serta membust cache stok/laporan/dashboard.
 */
export class WasteService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: CacheStore = new InMemoryCacheStore(),
    private readonly cacheCfg: CacheConfig,
    private readonly timezone: string,
  ) {}

  private async bustWasteRelatedCaches(): Promise<void> {
    await Promise.all([
      this.cache.bumpVersion(WASTE_CACHE_NAMESPACE),
      this.cache.bumpVersion(CACHE_NAMESPACES.PRODUCTS),
      this.cache.bumpVersion(CACHE_NAMESPACES.STOCK),
      this.cache.bumpVersion(CACHE_NAMESPACES.REPORTS),
      this.cache.bumpVersion(CACHE_NAMESPACES.DASHBOARD),
    ]);
  }

  /**
   * Mencatat penyusutan / kerusakan stok secara atomik dengan locking baris produk (FR-WST-01..06).
   */
  async recordWaste(
    input: CreateWasteRecordInput,
    actor: WasteActorContext,
  ): Promise<WasteRecordDto> {
    const recordedAt = input.recordedAt ? new Date(input.recordedAt) : new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === 'function') {
        await tx.$executeRaw`SELECT id FROM products WHERE id = ${input.productId} FOR UPDATE`;
      }

      const product = await tx.product.findUnique({
        where: { id: input.productId },
        select: {
          id: true,
          name: true,
          productType: true,
          stockQty: true,
          costPerKg: true,
          costPerUnit: true,
          isActive: true,
          deletedAt: true,
        },
      });

      if (!product || product.deletedAt !== null) {
        throw new AppError(ERROR_CODES.PRODUCT_NOT_FOUND, 'Produk tidak ditemukan', 404, {
          productId: input.productId,
        });
      }

      if (!product.isActive) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          `Produk "${product.name}" sedang nonaktif dan tidak dapat dicatat penyusutannya`,
          400,
          { productId: product.id },
        );
      }

      if (product.productType === 'UNIT' && !Number.isInteger(input.quantity)) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          `Jumlah penyusutan produk satuan "${product.name}" harus bilangan bulat (pcs)`,
          400,
          { productId: product.id },
        );
      }

      const balanceBefore = product.stockQty;
      const qtyDec = new Prisma.Decimal(input.quantity).toDecimalPlaces(
        3,
        Prisma.Decimal.ROUND_HALF_UP,
      );

      if (balanceBefore.lt(qtyDec)) {
        throw new AppError(
          ERROR_CODES.INSUFFICIENT_STOCK,
          `Stok "${product.name}" (${balanceBefore.toString()}) lebih kecil dari jumlah penyusutan (${qtyDec.toString()})`,
          422,
          {
            productId: product.id,
            availableStock: balanceBefore.toString(),
            requestedQuantity: qtyDec.toString(),
          },
        );
      }

      const unitCostDec =
        product.productType === 'WEIGHT'
          ? (product.costPerKg ?? new Prisma.Decimal(0))
          : (product.costPerUnit ?? new Prisma.Decimal(0));

      const estimatedCostDec = qtyDec
        .mul(unitCostDec)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

      const balanceAfter = balanceBefore.minus(qtyDec);

      await tx.product.update({
        where: { id: product.id },
        data: {
          stockQty: { decrement: qtyDec },
        },
      });

      const wasteRecord = await tx.wasteRecord.create({
        data: {
          productId: product.id,
          wasteType: input.wasteType,
          quantity: qtyDec,
          estimatedCost: estimatedCostDec,
          reason: input.reason,
          photoUrl: input.photoUrl ?? null,
          recordedBy: actor.userId,
          recordedAt,
        },
        include: WASTE_INCLUDE,
      });

      await tx.stockMovement.create({
        data: {
          productId: product.id,
          movementType: 'WASTE_OUT',
          quantity: qtyDec,
          balanceBefore,
          balanceAfter,
          referenceId: wasteRecord.id,
          referenceType: 'WASTE_RECORD',
          notes: `[${input.wasteType}] ${input.reason}`,
          createdBy: actor.userId,
        },
      });

      await recordAuditLog(tx, {
        userId: actor.userId,
        action: 'WASTE_RECORDED',
        entity: WASTE_ENTITY,
        entityId: wasteRecord.id,
        newValues: {
          productId: product.id,
          wasteType: input.wasteType,
          quantity: qtyDec.toString(),
          estimatedCost: estimatedCostDec.toFixed(2),
          balanceBefore: balanceBefore.toString(),
          balanceAfter: balanceAfter.toString(),
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      return wasteRecord;
    });

    await this.bustWasteRelatedCaches();
    return toWasteDto(created as WasteWithRelations);
  }

  /**
   * Mengambil daftar catatan penyusutan dengan filter produk, tipe, rentang tanggal & pencarian.
   */
  async list(query: WasteRecordListServiceQuery): Promise<WasteRecordListResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.WasteRecordWhereInput = {};
    if (query.productId) where.productId = query.productId;
    if (query.wasteType) where.wasteType = query.wasteType;

    if (query.startDate || query.endDate) {
      where.recordedAt = {};
      if (query.startDate) where.recordedAt.gte = parseRangeBoundary(query.startDate, 'start');
      if (query.endDate) where.recordedAt.lte = parseRangeBoundary(query.endDate, 'end');
    }

    if (query.search) {
      where.OR = [
        { reason: { contains: query.search, mode: 'insensitive' } },
        { product: { name: { contains: query.search, mode: 'insensitive' } } },
        { recorder: { fullName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.wasteRecord.count({ where }),
      this.prisma.wasteRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { recordedAt: 'desc' },
        include: WASTE_INCLUDE,
      }),
    ]);

    return {
      items: rows.map((row) => toWasteDto(row as WasteWithRelations)),
      meta: { page, limit, total },
    };
  }

  /**
   * Detail satu catatan penyusutan berdasarkan ID.
   */
  async getById(id: string): Promise<WasteRecordDto> {
    const row = await this.prisma.wasteRecord.findUnique({
      where: { id },
      include: WASTE_INCLUDE,
    });

    if (!row) {
      throw new AppError(
        ERROR_CODES.WASTE_RECORD_NOT_FOUND,
        'Catatan penyusutan tidak ditemukan',
        404,
        { id },
      );
    }

    return toWasteDto(row as WasteWithRelations);
  }

  /**
   * Laporan ringkasan penyusutan & estimasi kerugian nilai per tipe, produk, dan timeline (FR-WST-05).
   */
  async getSummary(query: WasteSummaryQuery): Promise<WasteSummaryReportDto> {
    const todayYmd = getCalendarYmdDashedInTimeZone(new Date(), this.timezone);
    const defaultStartYmd = shiftYmdDashed(todayYmd, -(DEFAULT_WASTE_SUMMARY_WINDOW_DAYS - 1));

    const start = query.startDate
      ? parseRangeBoundary(query.startDate, 'start')
      : parseRangeBoundary(defaultStartYmd, 'start');
    const end = query.endDate
      ? parseRangeBoundary(query.endDate, 'end')
      : parseRangeBoundary(todayYmd, 'end');

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        'Rentang tanggal laporan penyusutan tidak valid',
        400,
      );
    }

    const groupBy = query.groupBy ?? 'day';
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const version = await this.cache.getVersion(WASTE_CACHE_NAMESPACE);
    const cacheKey = `${WASTE_CACHE_NAMESPACE}:v${version}:summary:${startIso}:${endIso}:${groupBy}`;
    const cached = await readJsonCache<WasteSummaryReportDto>(this.cache, cacheKey);
    if (cached) {
      return cached;
    }

    const rows = await this.prisma.wasteRecord.findMany({
      where: {
        recordedAt: { gte: start, lte: end },
      },
      orderBy: { recordedAt: 'asc' },
      include: WASTE_INCLUDE,
    });

    let totalQuantity = 0;
    let totalEstimatedCost = 0;

    const typeMap = new Map<WasteType, { count: number; qty: number; cost: number }>();
    const productMap = new Map<
      string,
      {
        productId: string;
        productName: string;
        productType: ProductType;
        categoryName: string;
        count: number;
        qty: number;
        cost: number;
      }
    >();
    const timelineMap = new Map<string, { count: number; qty: number; cost: number }>();

    for (const row of rows) {
      const qty = Number(row.quantity);
      const cost = Number(row.estimatedCost);
      totalQuantity += qty;
      totalEstimatedCost += cost;

      const wType = row.wasteType as WasteType;
      const tEntry = typeMap.get(wType) ?? { count: 0, qty: 0, cost: 0 };
      tEntry.count += 1;
      tEntry.qty += qty;
      tEntry.cost += cost;
      typeMap.set(wType, tEntry);

      const pEntry = productMap.get(row.productId) ?? {
        productId: row.productId,
        productName: row.product.name,
        productType: row.product.productType,
        categoryName: row.product.category.name,
        count: 0,
        qty: 0,
        cost: 0,
      };
      pEntry.count += 1;
      pEntry.qty += qty;
      pEntry.cost += cost;
      productMap.set(row.productId, pEntry);

      const dateKey =
        groupBy === 'month'
          ? getMonthKeyInTimeZone(row.recordedAt, this.timezone)
          : getCalendarYmdDashedInTimeZone(row.recordedAt, this.timezone);
      const bucket = timelineMap.get(dateKey) ?? { count: 0, qty: 0, cost: 0 };
      bucket.count += 1;
      bucket.qty += qty;
      bucket.cost += cost;
      timelineMap.set(dateKey, bucket);
    }

    const byType: WasteTypeBreakdownDto[] = Array.from(typeMap.entries())
      .map(([wasteType, stats]) => ({
        wasteType,
        count: stats.count,
        totalQuantity: Number(stats.qty.toFixed(3)).toString(),
        totalEstimatedCost: stats.cost.toFixed(2),
      }))
      .sort((a, b) => Number(b.totalEstimatedCost) - Number(a.totalEstimatedCost));

    const topProducts: WasteTopProductDto[] = Array.from(productMap.values())
      .sort((a, b) => b.cost - a.cost)
      .map((entry) => ({
        productId: entry.productId,
        productName: entry.productName,
        productType: entry.productType,
        categoryName: entry.categoryName,
        count: entry.count,
        totalQuantity: Number(entry.qty.toFixed(3)).toString(),
        totalEstimatedCost: entry.cost.toFixed(2),
      }));

    const timeline: WasteTimelinePointDto[] = Array.from(timelineMap.entries())
      .sort(([dA], [dB]) => dA.localeCompare(dB))
      .map(([date, stats]) => ({
        date,
        count: stats.count,
        totalQuantity: Number(stats.qty.toFixed(3)).toString(),
        totalEstimatedCost: stats.cost.toFixed(2),
      }));

    const result: WasteSummaryReportDto = {
      startDate: startIso,
      endDate: endIso,
      groupBy,
      totalRecords: rows.length,
      totalQuantity: Number(totalQuantity.toFixed(3)).toString(),
      totalEstimatedCost: totalEstimatedCost.toFixed(2),
      byType,
      topProducts,
      timeline,
    };

    await writeJsonCache(this.cache, cacheKey, result, this.cacheCfg.productTtlSeconds);
    return result;
  }
}
