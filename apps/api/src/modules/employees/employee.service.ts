import { ERROR_CODES, type EmployeeDto, type PaginationMeta } from '@istana-buah/shared';
import type { Prisma, PrismaClient, User as PrismaUser } from '@prisma/client';
import bcrypt from 'bcrypt';
import type { AuthConfig } from '../../config/auth.config';
import { AppError } from '../../utils/app-error';
import { recordAuditLog } from '../../utils/audit-logger';
import type { ShiftListQuery, ShiftListResult } from '../shifts/shift.dto';
import type { ShiftService } from '../shifts/shift.service';
import type {
  CreateEmployeeInput,
  EmployeeActorContext,
  EmployeeListServiceQuery,
  UpdateEmployeeInput,
} from './employee.dto';

const EMPLOYEE_ENTITY = 'users';

type EmployeeWithCount = PrismaUser & {
  _count?: {
    shifts: number;
  };
};

function toEmployeeDto(row: EmployeeWithCount): EmployeeDto {
  const now = Date.now();
  const isLocked = row.lockedUntil !== null && row.lockedUntil.getTime() > now;

  return {
    id: row.id,
    username: row.username,
    fullName: row.fullName,
    role: row.role,
    phoneNumber: row.phoneNumber,
    isActive: row.isActive,
    isLocked,
    lockedUntil: row.lockedUntil ? row.lockedUntil.toISOString() : null,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    shiftCount: row._count?.shifts ?? 0,
  };
}

export interface EmployeeListResult {
  items: EmployeeDto[];
  meta: PaginationMeta;
}

/**
 * Layanan Manajemen Pegawai & Hak Akses Akun (M10-001).
 * Hanya dapat diakses OWNER; menjamin tidak ada `passwordHash` bocor ke respons,
 * mencabut sesi refresh token saat akun dinonaktifkan/dihapus/direset password,
 * serta mencegah OWNER menghapus atau menonaktifkan dirinya sendiri.
 */
export class EmployeeService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly authCfg: AuthConfig,
    private readonly shiftService: ShiftService,
  ) {}

  async list(query: EmployeeListServiceQuery): Promise<EmployeeListResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.role ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { username: { contains: query.search, mode: 'insensitive' } },
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { phoneNumber: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
        include: {
          _count: {
            select: { shifts: true },
          },
        },
      }),
    ]);

    return {
      items: rows.map((row) => toEmployeeDto(row)),
      meta: { page, limit, total },
    };
  }

  async getById(id: string): Promise<EmployeeDto> {
    const row = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: {
          select: { shifts: true },
        },
      },
    });

    if (!row) {
      throw new AppError(ERROR_CODES.USER_NOT_FOUND, 'Data pegawai tidak ditemukan', 404, { id });
    }

    return toEmployeeDto(row);
  }

  async create(input: CreateEmployeeInput, actor: EmployeeActorContext): Promise<EmployeeDto> {
    const passwordHash = await bcrypt.hash(input.password, this.authCfg.bcryptRounds);

    const created = await this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.user.findFirst({
        where: {
          username: { equals: input.username, mode: 'insensitive' },
        },
        select: { id: true },
      });

      if (duplicate) {
        throw new AppError(
          ERROR_CODES.DUPLICATE_USERNAME,
          `Username "${input.username}" sudah terdaftar`,
          409,
          { username: input.username },
        );
      }

      const user = await tx.user.create({
        data: {
          username: input.username,
          passwordHash,
          fullName: input.fullName,
          role: input.role,
          phoneNumber: input.phoneNumber ?? null,
          isActive: input.isActive,
        },
        include: {
          _count: { select: { shifts: true } },
        },
      });

      await recordAuditLog(tx, {
        userId: actor.userId,
        action: 'EMPLOYEE_CREATED',
        entity: EMPLOYEE_ENTITY,
        entityId: user.id,
        newValues: {
          username: user.username,
          fullName: user.fullName,
          role: user.role,
          isActive: user.isActive,
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      return user;
    });

    return toEmployeeDto(created);
  }

  async update(
    id: string,
    input: UpdateEmployeeInput,
    actor: EmployeeActorContext,
  ): Promise<EmployeeDto> {
    const newPasswordHash = input.password
      ? await bcrypt.hash(input.password, this.authCfg.bcryptRounds)
      : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { id, deletedAt: null },
      });

      if (!existing) {
        throw new AppError(ERROR_CODES.USER_NOT_FOUND, 'Data pegawai tidak ditemukan', 404, {
          id,
        });
      }

      const isSelf = id === actor.userId;
      if (isSelf) {
        if (input.isActive === false) {
          throw new AppError(
            ERROR_CODES.VALIDATION_ERROR,
            'Pemilik tidak dapat menonaktifkan akunnya sendiri',
            400,
          );
        }
        if (input.role && input.role !== existing.role) {
          throw new AppError(
            ERROR_CODES.VALIDATION_ERROR,
            'Pemilik tidak dapat menurunkan atau mengubah perannya sendiri',
            400,
          );
        }
      }

      const updateData: Prisma.UserUpdateInput = {};
      if (input.fullName !== undefined) updateData.fullName = input.fullName;
      if (input.role !== undefined) updateData.role = input.role;
      if (input.phoneNumber !== undefined) updateData.phoneNumber = input.phoneNumber;
      if (input.isActive !== undefined) updateData.isActive = input.isActive;
      if (newPasswordHash !== undefined) updateData.passwordHash = newPasswordHash;
      if (input.unlockAccount) {
        updateData.loginAttempts = 0;
        updateData.lockedUntil = null;
      }

      const saved = await tx.user.update({
        where: { id },
        data: updateData,
        include: {
          _count: { select: { shifts: true } },
        },
      });

      // Cabut seluruh sesi refresh token jika akun dinonaktifkan, direset password, atau berganti role
      if (
        input.isActive === false ||
        newPasswordHash !== undefined ||
        (input.role !== undefined && input.role !== existing.role)
      ) {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await recordAuditLog(tx, {
        userId: actor.userId,
        action: 'EMPLOYEE_UPDATED',
        entity: EMPLOYEE_ENTITY,
        entityId: id,
        oldValues: {
          fullName: existing.fullName,
          role: existing.role,
          isActive: existing.isActive,
          phoneNumber: existing.phoneNumber,
        },
        newValues: {
          fullName: saved.fullName,
          role: saved.role,
          isActive: saved.isActive,
          phoneNumber: saved.phoneNumber,
          passwordReset: Boolean(newPasswordHash),
          unlocked: Boolean(input.unlockAccount),
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      return saved;
    });

    return toEmployeeDto(updated);
  }

  async remove(id: string, actor: EmployeeActorContext): Promise<void> {
    if (id === actor.userId) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        'Pemilik tidak dapat menghapus akunnya sendiri',
        400,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { id, deletedAt: null },
      });

      if (!existing) {
        throw new AppError(ERROR_CODES.USER_NOT_FOUND, 'Data pegawai tidak ditemukan', 404, {
          id,
        });
      }

      const openShift = await tx.shift.findFirst({
        where: { userId: id, status: 'OPEN' },
        select: { id: true, shiftNo: true },
      });

      if (openShift) {
        throw new AppError(
          ERROR_CODES.CONFLICT,
          `Pegawai masih memiliki shift terbuka (${openShift.shiftNo}). Tutup shift terlebih dahulu.`,
          409,
          { shiftId: openShift.id, shiftNo: openShift.shiftNo },
        );
      }

      const now = new Date();
      await tx.user.update({
        where: { id },
        data: {
          isActive: false,
          deletedAt: now,
        },
      });

      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: now },
      });

      await recordAuditLog(tx, {
        userId: actor.userId,
        action: 'EMPLOYEE_DELETED',
        entity: EMPLOYEE_ENTITY,
        entityId: id,
        oldValues: {
          username: existing.username,
          fullName: existing.fullName,
          role: existing.role,
          isActive: existing.isActive,
        },
        newValues: {
          isActive: false,
          deletedAt: now.toISOString(),
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    });
  }

  /**
   * Riwayat shift kasir untuk satu pegawai (FR-HR-06 / M10-001).
   */
  async listShifts(id: string, query: Partial<ShiftListQuery>): Promise<ShiftListResult> {
    await this.getById(id);
    return this.shiftService.list(
      {
        ...query,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        search: query.search,
        userId: id,
      },
      'OWNER',
      id,
    );
  }
}
