import crypto from 'node:crypto';
import { ERROR_CODES } from '@istana-buah/shared';
import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { authConfig } from '../../src/config/auth.config';
import { AuthService } from '../../src/modules/auth/auth.service';
import { hashToken, JwtTokenService } from '../../src/utils/jwt';

describe('M01-006 Unit: AuthService isolated business logic & security edge cases', () => {
  const jwtService = new JwtTokenService(authConfig.jwt);
  const fastAuthConfig = {
    ...authConfig,
    bcryptRounds: 4, // Unit test isolasi cepat, produksi tetap memakai env BCRYPT_ROUNDS=12
    maxLoginAttempts: 5,
    lockoutMinutes: 15,
  };

  function createMockPrisma() {
    const userMock = {
      findFirst: jest.fn(),
      update: jest.fn(),
    };
    const refreshTokenMock = {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    };
    const auditLogMock = {
      create: jest.fn(),
    };

    const txMock = {
      user: userMock,
      refreshToken: refreshTokenMock,
      auditLog: auditLogMock,
    };

    const prismaMock = {
      user: userMock,
      refreshToken: refreshTokenMock,
      auditLog: auditLogMock,
      $transaction: jest.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
    } as unknown as PrismaClient;

    return { prismaMock, userMock, refreshTokenMock, auditLogMock };
  }

  it('login: menolak user tidak ditemukan secara constant-time, akun nonaktif, akun terkunci, dan mereset hitungan setelah masa kunci lewat', async () => {
    const { prismaMock, userMock, auditLogMock } = createMockPrisma();
    const service = new AuthService(prismaMock, jwtService, fastAuthConfig);
    const passwordHash = await bcrypt.hash('ValidPass123', 4);
    const meta = { ipAddress: '10.0.0.1', userAgent: 'JestUnit/1.0' };

    // 1. User tidak ditemukan
    userMock.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.login({ username: 'unknown', password: 'ValidPass123' }, meta),
    ).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_CREDENTIALS,
      statusCode: 401,
    });
    expect(auditLogMock.create).toHaveBeenCalledTimes(1);

    // 2. User nonaktif
    userMock.findFirst.mockResolvedValueOnce({
      id: 'u-inactive',
      username: 'inactive',
      passwordHash,
      fullName: 'Nonaktif',
      role: 'CASHIER',
      isActive: false,
      loginAttempts: 0,
      lockedUntil: null,
    });
    await expect(
      service.login({ username: 'inactive', password: 'ValidPass123' }, meta),
    ).rejects.toMatchObject({
      code: ERROR_CODES.ACCOUNT_INACTIVE,
      statusCode: 403,
    });

    // 3. User masih terkunci aktif
    userMock.findFirst.mockResolvedValueOnce({
      id: 'u-locked',
      username: 'locked',
      passwordHash,
      fullName: 'Terkunci',
      role: 'CASHIER',
      isActive: true,
      loginAttempts: 5,
      lockedUntil: new Date(Date.now() + 600_000),
    });
    await expect(
      service.login({ username: 'locked', password: 'ValidPass123' }, meta),
    ).rejects.toMatchObject({
      code: ERROR_CODES.ACCOUNT_LOCKED,
      statusCode: 401,
    });

    // 4. Masa kunci sudah lewat, namun password salah -> baseAttempts direset ke 0 lalu jadi 1 (tidak langsung terkunci lagi)
    userMock.findFirst.mockResolvedValueOnce({
      id: 'u-expired-lock',
      username: 'kasir01',
      passwordHash,
      fullName: 'Kasir Satu',
      role: 'CASHIER',
      isActive: true,
      loginAttempts: 5,
      lockedUntil: new Date(Date.now() - 60_000),
    });
    await expect(
      service.login({ username: 'kasir01', password: 'SalahPassword1' }, meta),
    ).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_CREDENTIALS,
      statusCode: 401,
    });
    expect(userMock.update).toHaveBeenLastCalledWith({
      where: { id: 'u-expired-lock' },
      data: { loginAttempts: 1, lockedUntil: null },
    });
  });

  it('refresh: menangani token tidak dikenal, token kedaluwarsa di DB, user nonaktif, dan race condition updateMany=0', async () => {
    const { prismaMock, refreshTokenMock } = createMockPrisma();
    const service = new AuthService(prismaMock, jwtService, fastAuthConfig);
    const userId = crypto.randomUUID();
    const { token: validRefresh } = await jwtService.signRefreshToken({
      id: userId,
      role: 'MANAGER',
    });
    const meta = { ipAddress: '10.0.0.2', userAgent: 'JestUnit/1.0' };

    // 1. Token tidak ada di tabel refresh_tokens
    refreshTokenMock.findUnique.mockResolvedValueOnce(null);
    await expect(service.refresh({ refreshToken: validRefresh }, meta)).rejects.toMatchObject({
      code: ERROR_CODES.TOKEN_INVALID,
      statusCode: 401,
    });

    // 2. Token tercatat sudah kedaluwarsa di DB
    refreshTokenMock.findUnique.mockResolvedValueOnce({
      id: 'rt-exp',
      userId,
      tokenHash: hashToken(validRefresh),
      deviceInfo: 'Tab',
      expiresAt: new Date(Date.now() - 10_000),
      revokedAt: null,
      user: { id: userId, role: 'MANAGER', isActive: true, deletedAt: null },
    });
    await expect(service.refresh({ refreshToken: validRefresh }, meta)).rejects.toMatchObject({
      code: ERROR_CODES.TOKEN_EXPIRED,
      statusCode: 401,
    });

    // 3. User pemilik refresh token sudah dinonaktifkan / soft-deleted
    refreshTokenMock.findUnique.mockResolvedValueOnce({
      id: 'rt-inact',
      userId,
      tokenHash: hashToken(validRefresh),
      deviceInfo: 'Tab',
      expiresAt: new Date(Date.now() + 600_000),
      revokedAt: null,
      user: { id: userId, role: 'MANAGER', isActive: false, deletedAt: null },
    });
    await expect(service.refresh({ refreshToken: validRefresh }, meta)).rejects.toMatchObject({
      code: ERROR_CODES.ACCOUNT_INACTIVE,
      statusCode: 403,
    });

    // 4. Race condition: revoked.count === 0 di dalam transaksi
    refreshTokenMock.findUnique.mockResolvedValueOnce({
      id: 'rt-race',
      userId,
      tokenHash: hashToken(validRefresh),
      deviceInfo: 'Tab',
      expiresAt: new Date(Date.now() + 600_000),
      revokedAt: null,
      user: { id: userId, role: 'MANAGER', isActive: true, deletedAt: null },
    });
    refreshTokenMock.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.refresh({ refreshToken: validRefresh }, meta)).rejects.toMatchObject({
      code: ERROR_CODES.REFRESH_TOKEN_REVOKED,
      statusCode: 401,
    });
  });

  it('changePassword & getProfile: menolak user tidak valid/nonaktif dan memvalidasi pencabutan seluruh refresh token', async () => {
    const { prismaMock, userMock, refreshTokenMock } = createMockPrisma();
    const service = new AuthService(prismaMock, jwtService, fastAuthConfig);
    const meta = { ipAddress: '10.0.0.3', userAgent: 'JestUnit/1.0' };

    userMock.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.changePassword(
        'u-missing',
        {
          currentPassword: 'OldPassword1',
          newPassword: 'NewPassword2',
          confirmPassword: 'NewPassword2',
        },
        meta,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
      statusCode: 401,
    });

    userMock.findFirst.mockResolvedValueOnce(null);
    await expect(service.getProfile('u-missing')).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
      statusCode: 401,
    });

    const oldHash = await bcrypt.hash('OldPassword1', 4);
    userMock.findFirst.mockResolvedValueOnce({
      id: 'u-valid',
      username: 'manajer01',
      passwordHash: oldHash,
      fullName: 'Siti Manajer',
      role: 'MANAGER',
      isActive: true,
      deletedAt: null,
    });
    refreshTokenMock.updateMany.mockResolvedValueOnce({ count: 2 });

    await service.changePassword(
      'u-valid',
      {
        currentPassword: 'OldPassword1',
        newPassword: 'NewPassword2',
        confirmPassword: 'NewPassword2',
      },
      meta,
    );

    expect(userMock.update).toHaveBeenCalledTimes(1);
    expect(refreshTokenMock.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u-valid', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
