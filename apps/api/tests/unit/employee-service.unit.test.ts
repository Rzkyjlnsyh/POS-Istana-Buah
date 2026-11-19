import { ERROR_CODES } from '@istana-buah/shared';
import type { PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import { authConfig } from '../../src/config/auth.config';
import { EmployeeController } from '../../src/modules/employees/employee.controller';
import type { EmployeeActorContext } from '../../src/modules/employees/employee.dto';
import { EmployeeService } from '../../src/modules/employees/employee.service';
import type { ShiftService } from '../../src/modules/shifts/shift.service';

describe('M10-001 Unit: EmployeeService & EmployeeController', () => {
  const actor: EmployeeActorContext = {
    userId: 'u-owner-1',
    ipAddress: '127.0.0.1',
    userAgent: 'emp-unit',
  };

  const sampleUser = {
    id: 'u-kasir-1',
    username: 'kasir_pagi',
    passwordHash: 'secret-bcrypt-hash',
    fullName: 'Dewi Sartika',
    role: 'CASHIER' as const,
    phoneNumber: '08123456789',
    isActive: true,
    loginAttempts: 5,
    lockedUntil: new Date(Date.now() + 600_000),
    lastLoginAt: null,
    createdAt: new Date('2026-11-10T00:00:00Z'),
    updatedAt: new Date('2026-11-19T00:00:00Z'),
    deletedAt: null,
    _count: { shifts: 4 },
  };

  const mockShiftService = {
    list: jest.fn().mockResolvedValue({ items: [], meta: { page: 1, limit: 20, total: 0 } }),
  } as unknown as ShiftService;

  it('list, getById & listShifts mengembalikan EmployeeDto tanpa passwordHash', async () => {
    const prisma = {
      user: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([sampleUser]),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(sampleUser)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(sampleUser),
      },
    } as unknown as PrismaClient;

    const service = new EmployeeService(prisma, authConfig, mockShiftService);
    const listed = await service.list({ page: 1, limit: 20, search: 'Dewi' });

    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]?.shiftCount).toBe(4);
    expect(listed.items[0]?.isLocked).toBe(true);
    expect((listed.items[0] as unknown as Record<string, unknown>).passwordHash).toBeUndefined();

    const detail = await service.getById('u-kasir-1');
    expect(detail.username).toBe('kasir_pagi');
    await expect(service.getById('u-missing')).rejects.toMatchObject({
      code: ERROR_CODES.USER_NOT_FOUND,
      statusCode: 404,
    });

    await service.listShifts('u-kasir-1', { page: 1, limit: 20 });
    expect(mockShiftService.list).toHaveBeenCalledWith(
      { page: 1, limit: 20, userId: 'u-kasir-1' },
      'OWNER',
      'u-kasir-1',
    );
  });

  it('create menghash password, mencatat audit log & menolak DUPLICATE_USERNAME (409)', async () => {
    const tx = {
      user: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'existing' }),
        create: jest.fn().mockResolvedValue(sampleUser),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    } as unknown as PrismaClient;

    const fastAuthCfg = { ...authConfig, bcryptRounds: 4 };
    const service = new EmployeeService(prisma, fastAuthCfg, mockShiftService);

    const created = await service.create(
      {
        username: 'kasir_pagi',
        fullName: 'Dewi Sartika',
        password: 'ValidPass123',
        role: 'CASHIER',
        phoneNumber: '08123456789',
        isActive: true,
      },
      actor,
    );
    expect(created.id).toBe('u-kasir-1');
    expect(tx.auditLog.create).toHaveBeenCalled();

    await expect(
      service.create(
        {
          username: 'kasir_pagi',
          fullName: 'Dup',
          password: 'ValidPass123',
          role: 'CASHIER',
          isActive: true,
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.DUPLICATE_USERNAME, statusCode: 409 });
  });

  it('update melindungi owner dari self-deactivation/downgrade, membuka kunci & mencabut refresh token', async () => {
    const ownerUser = { ...sampleUser, id: actor.userId, role: 'OWNER' as const };
    const tx = {
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(ownerUser)
          .mockResolvedValueOnce(ownerUser)
          .mockResolvedValueOnce(sampleUser),
        update: jest.fn().mockResolvedValue({
          ...sampleUser,
          isActive: false,
          loginAttempts: 0,
          lockedUntil: null,
        }),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    } as unknown as PrismaClient;

    const service = new EmployeeService(
      prisma,
      { ...authConfig, bcryptRounds: 4 },
      mockShiftService,
    );

    // Self-deactivation ditolak
    await expect(service.update(actor.userId, { isActive: false }, actor)).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_ERROR,
      statusCode: 400,
    });

    // Self-role-change ditolak
    await expect(service.update(actor.userId, { role: 'CASHIER' }, actor)).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_ERROR,
      statusCode: 400,
    });

    // Update pegawai lain: unlockAccount + nonaktifkan -> refreshToken dicabut
    const updated = await service.update(
      'u-kasir-1',
      { isActive: false, unlockAccount: true },
      actor,
    );
    expect(updated.isLocked).toBe(false);
    expect(tx.refreshToken.updateMany).toHaveBeenCalled();
  });

  it('remove menolak hapus diri sendiri & menolak pegawai yang masih punya shift OPEN', async () => {
    const txConflict = {
      user: { findFirst: jest.fn().mockResolvedValue(sampleUser) },
      shift: { findFirst: jest.fn().mockResolvedValue({ id: 'sh-open', shiftNo: 'SHIFT-001' }) },
    };
    const serviceConflict = new EmployeeService(
      {
        $transaction: jest.fn(async (cb: (t: typeof txConflict) => Promise<unknown>) =>
          cb(txConflict),
        ),
      } as unknown as PrismaClient,
      authConfig,
      mockShiftService,
    );

    await expect(serviceConflict.remove(actor.userId, actor)).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_ERROR,
      statusCode: 400,
    });
    await expect(serviceConflict.remove('u-kasir-1', actor)).rejects.toMatchObject({
      code: ERROR_CODES.CONFLICT,
      statusCode: 409,
    });

    const txOk = {
      user: { findFirst: jest.fn().mockResolvedValue(sampleUser), update: jest.fn() },
      shift: { findFirst: jest.fn().mockResolvedValue(null) },
      refreshToken: { updateMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const serviceOk = new EmployeeService(
      {
        $transaction: jest.fn(async (cb: (t: typeof txOk) => Promise<unknown>) => cb(txOk)),
      } as unknown as PrismaClient,
      authConfig,
      mockShiftService,
    );
    await serviceOk.remove('u-kasir-1', actor);
    expect(txOk.user.update).toHaveBeenCalled();
    expect(txOk.refreshToken.updateMany).toHaveBeenCalled();
  });

  it('EmployeeController mengirim seluruh respons HTTP dengan benar', async () => {
    const fakeService = {
      list: jest.fn().mockResolvedValue({ items: [], meta: { page: 1, limit: 20, total: 0 } }),
      getById: jest.fn().mockResolvedValue({ id: 'u-1' }),
      create: jest.fn().mockResolvedValue({ id: 'u-1' }),
      update: jest.fn().mockResolvedValue({ id: 'u-1' }),
      remove: jest.fn().mockResolvedValue(undefined),
      listShifts: jest
        .fn()
        .mockResolvedValue({ items: [], meta: { page: 1, limit: 20, total: 0 } }),
    } as unknown as EmployeeService;

    const controller = new EmployeeController(fakeService);
    const makeRes = () =>
      ({
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      }) as unknown as Response;

    const reqBase = {
      authUser: { id: actor.userId },
      params: { id: 'u-1' },
      body: {},
      validatedQuery: { page: 1, limit: 20 },
      headers: {},
      ip: '127.0.0.1',
    } as unknown as Request;

    const r1 = makeRes();
    await controller.list(reqBase, r1);
    expect(r1.status).toHaveBeenCalledWith(200);

    const r2 = makeRes();
    await controller.getById(reqBase, r2);
    expect(r2.status).toHaveBeenCalledWith(200);

    const r3 = makeRes();
    await controller.create(reqBase, r3);
    expect(r3.status).toHaveBeenCalledWith(201);

    const r4 = makeRes();
    await controller.update(reqBase, r4);
    expect(r4.status).toHaveBeenCalledWith(200);

    const r5 = makeRes();
    await controller.remove(reqBase, r5);
    expect(r5.status).toHaveBeenCalledWith(200);

    const r6 = makeRes();
    await controller.listShifts(reqBase, r6);
    expect(r6.status).toHaveBeenCalledWith(200);
  });
});
