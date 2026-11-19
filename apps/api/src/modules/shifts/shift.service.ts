import {
  ERROR_CODES,
  type PaginationMeta,
  type PaymentMethod,
  type TransactionStatus,
  type UserRole,
} from '@istana-buah/shared';
import { Prisma, type PrismaClient, type Shift as PrismaShift } from '@prisma/client';
import { CACHE_NAMESPACES, InMemoryCacheStore, type CacheStore } from '../../lib/cache';
import { AppError } from '../../utils/app-error';
import { recordAuditLog } from '../../utils/audit-logger';
import {
  buildNextDailyReference,
  formatYmdInTimeZone,
  parseRangeBoundary,
} from '../../utils/date-helpers';
import type {
  CloseShiftInput,
  OpenShiftInput,
  ShiftActorContext,
  ShiftDto,
  ShiftListQuery,
  ShiftListResult,
  ShiftPaymentSummaryDto,
} from './shift.dto';

const SHIFT_ENTITY = 'shifts';

type ShiftWithRelations = PrismaShift & {
  user: { id: string; fullName: string };
  transactions: Array<{
    status: TransactionStatus;
    paymentMethod: PaymentMethod;
    totalAmount: Prisma.Decimal;
  }>;
};

const SHIFT_INCLUDE = {
  user: { select: { id: true, fullName: true } },
  transactions: {
    select: {
      status: true,
      paymentMethod: true,
      totalAmount: true,
    },
  },
} satisfies Prisma.ShiftInclude;

interface ComputedShiftMetrics {
  summary: ShiftPaymentSummaryDto;
  totalSales: Prisma.Decimal;
  completedTransactions: number;
  expectedCash: Prisma.Decimal;
}

function computeShiftMetrics(shift: ShiftWithRelations): ComputedShiftMetrics {
  let cashSales = new Prisma.Decimal(0);
  let qrisSales = new Prisma.Decimal(0);
  let bankTransferSales = new Prisma.Decimal(0);
  let mixedSales = new Prisma.Decimal(0);
  let totalSales = new Prisma.Decimal(0);
  let completedTransactions = 0;
  let voidedTransactions = 0;

  for (const tx of shift.transactions) {
    if (tx.status === 'VOIDED') {
      voidedTransactions += 1;
      continue;
    }
    if (tx.status !== 'COMPLETED') {
      continue;
    }
    completedTransactions += 1;
    totalSales = totalSales.plus(tx.totalAmount);

    if (tx.paymentMethod === 'CASH') {
      cashSales = cashSales.plus(tx.totalAmount);
    } else if (tx.paymentMethod === 'QRIS') {
      qrisSales = qrisSales.plus(tx.totalAmount);
    } else if (tx.paymentMethod === 'BANK_TRANSFER') {
      bankTransferSales = bankTransferSales.plus(tx.totalAmount);
    } else if (tx.paymentMethod === 'MIXED') {
      mixedSales = mixedSales.plus(tx.totalAmount);
    }
  }

  return {
    totalSales,
    completedTransactions,
    expectedCash: shift.openingCash.plus(cashSales),
    summary: {
      cashSales: cashSales.toFixed(2),
      qrisSales: qrisSales.toFixed(2),
      bankTransferSales: bankTransferSales.toFixed(2),
      mixedSales: mixedSales.toFixed(2),
      completedTransactions,
      voidedTransactions,
    },
  };
}

function toDto(shift: ShiftWithRelations): ShiftDto {
  const metrics = computeShiftMetrics(shift);
  const liveTotalSales = shift.status === 'CLOSED' ? shift.totalSales : metrics.totalSales;
  const liveTotalTransactions =
    shift.status === 'CLOSED' ? shift.totalTransactions : metrics.completedTransactions;
  const liveExpectedCash =
    shift.status === 'CLOSED' && shift.expectedCash !== null
      ? shift.expectedCash
      : metrics.expectedCash;

  return {
    id: shift.id,
    userId: shift.userId,
    cashierName: shift.user.fullName,
    shiftNo: shift.shiftNo,
    status: shift.status,
    openedAt: shift.openedAt.toISOString(),
    closedAt: shift.closedAt ? shift.closedAt.toISOString() : null,
    openingCash: shift.openingCash.toFixed(2),
    closingCash: shift.closingCash ? shift.closingCash.toFixed(2) : null,
    expectedCash: liveExpectedCash.toFixed(2),
    cashDifference: shift.cashDifference ? shift.cashDifference.toFixed(2) : null,
    totalSales: liveTotalSales.toFixed(2),
    totalTransactions: liveTotalTransactions,
    notes: shift.notes,
    summary: metrics.summary,
    createdAt: shift.createdAt.toISOString(),
    updatedAt: shift.updatedAt.toISOString(),
  };
}

/**
 * Layanan Manajemen Shift Kasir (M06-001).
 * Mendukung buka shift (`POST /open`) anti-double-open dengan advisory lock,
 * tutup shift (`PUT /:id/close`) dengan `FOR UPDATE` dan kalkulasi expected cash,
 * serta riwayat & ringkasan shift terisolasi per role (`CASHIER` hanya shift sendiri).
 */
export class ShiftService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly timezone = 'Asia/Jakarta',
    private readonly cache: CacheStore = new InMemoryCacheStore(),
  ) {}

  private async generateShiftNo(date: Date, tx: Prisma.TransactionClient): Promise<string> {
    const ymd = formatYmdInTimeZone(date, this.timezone);
    const datePrefix = `SHIFT-${ymd}-`;

    if (typeof tx.$executeRaw === 'function') {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${datePrefix}))`;
    }

    const existingToday = await tx.shift.findMany({
      where: { shiftNo: { startsWith: datePrefix } },
      select: { shiftNo: true },
    });

    return buildNextDailyReference(
      datePrefix,
      existingToday.map((s) => s.shiftNo),
      3,
    );
  }

  async open(input: OpenShiftInput, actor: ShiftActorContext): Promise<ShiftDto> {
    const openedAt = new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === 'function') {
        const userLockKey = `shift_user_${actor.userId}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userLockKey}))`;
      }

      const activeShift = await tx.shift.findFirst({
        where: { userId: actor.userId, status: 'OPEN' },
        select: { id: true, shiftNo: true },
      });

      if (activeShift) {
        throw new AppError(
          ERROR_CODES.SHIFT_ALREADY_OPEN,
          `Anda masih memiliki shift terbuka (${activeShift.shiftNo})`,
          409,
          { shiftId: activeShift.id, shiftNo: activeShift.shiftNo },
        );
      }

      const shiftNo = await this.generateShiftNo(openedAt, tx);
      const openingCash = new Prisma.Decimal(input.openingCash).toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP,
      );

      const shift = await tx.shift.create({
        data: {
          userId: actor.userId,
          shiftNo,
          status: 'OPEN',
          openedAt,
          openingCash,
          notes: input.notes ?? null,
        },
        include: SHIFT_INCLUDE,
      });

      await recordAuditLog(tx, {
        userId: actor.userId,
        action: 'SHIFT_OPENED',
        entity: SHIFT_ENTITY,
        entityId: shift.id,
        newValues: {
          shiftNo,
          openingCash: openingCash.toFixed(2),
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      return shift;
    });

    await this.cache.bumpVersion(CACHE_NAMESPACES.DASHBOARD);
    return toDto(created as ShiftWithRelations);
  }

  async getActive(userId: string): Promise<ShiftDto | null> {
    const active = await this.prisma.shift.findFirst({
      where: { userId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
      include: SHIFT_INCLUDE,
    });

    return active ? toDto(active as ShiftWithRelations) : null;
  }

  async close(id: string, input: CloseShiftInput, actor: ShiftActorContext): Promise<ShiftDto> {
    const closedAt = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === 'function') {
        await tx.$executeRaw`SELECT id FROM shifts WHERE id = ${id} FOR UPDATE`;
      }

      const existing = await tx.shift.findUnique({
        where: { id },
        include: SHIFT_INCLUDE,
      });

      if (!existing) {
        throw new AppError(ERROR_CODES.SHIFT_NOT_FOUND, 'Shift kasir tidak ditemukan', 404, {
          id,
        });
      }

      if (actor.role === 'CASHIER' && existing.userId !== actor.userId) {
        throw new AppError(
          ERROR_CODES.FORBIDDEN,
          'Anda tidak berwenang menutup shift kasir milik pegawai lain',
          403,
        );
      }

      if (existing.status === 'CLOSED') {
        throw new AppError(
          ERROR_CODES.SHIFT_ALREADY_CLOSED,
          'Shift kasir ini sudah ditutup sebelumnya',
          400,
          { id },
        );
      }

      const metrics = computeShiftMetrics(existing as ShiftWithRelations);
      const closingCash = new Prisma.Decimal(input.closingCash).toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP,
      );
      const cashDifference = closingCash.minus(metrics.expectedCash);
      const mergedNotes = input.notes ?? existing.notes;

      const closed = await tx.shift.update({
        where: { id },
        data: {
          status: 'CLOSED',
          closedAt,
          closingCash,
          expectedCash: metrics.expectedCash,
          cashDifference,
          totalSales: metrics.totalSales,
          totalTransactions: metrics.completedTransactions,
          notes: mergedNotes,
        },
        include: SHIFT_INCLUDE,
      });

      await recordAuditLog(tx, {
        userId: actor.userId,
        action: 'SHIFT_CLOSED',
        entity: SHIFT_ENTITY,
        entityId: id,
        oldValues: { status: 'OPEN', openingCash: existing.openingCash.toFixed(2) },
        newValues: {
          status: 'CLOSED',
          closingCash: closingCash.toFixed(2),
          expectedCash: metrics.expectedCash.toFixed(2),
          cashDifference: cashDifference.toFixed(2),
          totalSales: metrics.totalSales.toFixed(2),
          totalTransactions: metrics.completedTransactions,
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      return closed;
    });

    await this.cache.bumpVersion(CACHE_NAMESPACES.DASHBOARD);
    return toDto(updated as ShiftWithRelations);
  }

  async list(query: ShiftListQuery, role: UserRole, actorUserId: string): Promise<ShiftListResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ShiftWhereInput = {};
    if (role === 'CASHIER') {
      where.userId = actorUserId;
    } else if (query.userId) {
      where.userId = query.userId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.startDate || query.endDate) {
      where.openedAt = {};
      if (query.startDate) {
        where.openedAt.gte = parseRangeBoundary(query.startDate, 'start');
      }
      if (query.endDate) {
        where.openedAt.lte = parseRangeBoundary(query.endDate, 'end');
      }
    }

    if (query.search) {
      where.OR = [
        { shiftNo: { contains: query.search, mode: 'insensitive' } },
        { notes: { contains: query.search, mode: 'insensitive' } },
        { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.shift.count({ where }),
      this.prisma.shift.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
        include: SHIFT_INCLUDE,
      }),
    ]);

    const meta: PaginationMeta = { page, limit, total };

    return {
      items: rows.map((row) => toDto(row as ShiftWithRelations)),
      meta,
    };
  }

  async getById(id: string, role: UserRole, actorUserId: string): Promise<ShiftDto> {
    const shift = await this.prisma.shift.findUnique({
      where: { id },
      include: SHIFT_INCLUDE,
    });

    if (!shift || (role === 'CASHIER' && shift.userId !== actorUserId)) {
      throw new AppError(ERROR_CODES.SHIFT_NOT_FOUND, 'Shift kasir tidak ditemukan', 404, { id });
    }

    return toDto(shift as ShiftWithRelations);
  }
}
