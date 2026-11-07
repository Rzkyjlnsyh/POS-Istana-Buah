import { ERROR_CODES, type UserRole } from '@istana-buah/shared';
import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import type { AuthConfig } from '../../config/auth.config';
import { AppError } from '../../utils/app-error';
import { recordAuditLog } from '../../utils/audit-logger';
import { hashToken, type JwtTokenService } from '../../utils/jwt';
import type {
  AuthUser,
  ChangePasswordInput,
  LoginInput,
  LoginResponseData,
  LogoutInput,
  RefreshTokenInput,
  RefreshTokenResponseData,
  RequestClientMeta,
} from './auth.dto';

export class AuthService {
  private dummyPasswordHashPromise: Promise<string> | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwtService: JwtTokenService,
    private readonly config: AuthConfig,
  ) {}

  private getDummyPasswordHash(): Promise<string> {
    if (!this.dummyPasswordHashPromise) {
      this.dummyPasswordHashPromise = bcrypt.hash(
        '__istana_buah_constant_time_dummy__',
        this.config.bcryptRounds,
      );
    }
    return this.dummyPasswordHashPromise;
  }

  async login(input: LoginInput, meta: RequestClientMeta): Promise<LoginResponseData> {
    const now = new Date();
    const user = await this.prisma.user.findFirst({
      where: {
        username: input.username,
        deletedAt: null,
      },
    });

    if (!user) {
      await bcrypt.compare(input.password, await this.getDummyPasswordHash());
      await recordAuditLog(this.prisma, {
        action: 'AUTH_LOGIN_FAILED',
        entity: 'users',
        newValues: { username: input.username, reason: 'USER_NOT_FOUND' },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Username atau password salah', 401);
    }

    if (!user.isActive) {
      await recordAuditLog(this.prisma, {
        userId: user.id,
        action: 'AUTH_LOGIN_DENIED_INACTIVE',
        entity: 'users',
        entityId: user.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new AppError(
        ERROR_CODES.ACCOUNT_INACTIVE,
        'Akun Anda sedang dinonaktifkan, silakan hubungi administrator',
        403,
      );
    }

    if (user.lockedUntil && user.lockedUntil > now) {
      await recordAuditLog(this.prisma, {
        userId: user.id,
        action: 'AUTH_LOGIN_BLOCKED_LOCKED',
        entity: 'users',
        entityId: user.id,
        newValues: { lockedUntil: user.lockedUntil.toISOString() },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new AppError(
        ERROR_CODES.ACCOUNT_LOCKED,
        'Akun terkunci sementara karena terlalu banyak percobaan login gagal',
        401,
        { lockedUntil: user.lockedUntil.toISOString() },
      );
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isPasswordValid) {
      const baseAttempts = user.lockedUntil && user.lockedUntil <= now ? 0 : user.loginAttempts;
      const nextAttempts = baseAttempts + 1;
      const shouldLock = nextAttempts >= this.config.maxLoginAttempts;
      const lockedUntil = shouldLock
        ? new Date(now.getTime() + this.config.lockoutMinutes * 60_000)
        : null;

      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            loginAttempts: nextAttempts,
            lockedUntil,
          },
        });

        await recordAuditLog(tx, {
          userId: user.id,
          action: shouldLock ? 'AUTH_ACCOUNT_LOCKED' : 'AUTH_LOGIN_FAILED',
          entity: 'users',
          entityId: user.id,
          newValues: {
            loginAttempts: nextAttempts,
            lockedUntil: lockedUntil ? lockedUntil.toISOString() : null,
          },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });
      });

      if (shouldLock && lockedUntil) {
        throw new AppError(
          ERROR_CODES.ACCOUNT_LOCKED,
          'Akun dikunci otomatis karena melebihi batas percobaan login gagal',
          401,
          { lockedUntil: lockedUntil.toISOString(), loginAttempts: nextAttempts },
        );
      }

      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Username atau password salah', 401);
    }

    const role = user.role as UserRole;
    const accessToken = await this.jwtService.signAccessToken({ id: user.id, role });
    const { token: refreshToken, expiresAt } = await this.jwtService.signRefreshToken({
      id: user.id,
      role,
    });
    const refreshHash = hashToken(refreshToken);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          loginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: now,
        },
      });

      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: refreshHash,
          deviceInfo: meta.userAgent,
          expiresAt,
        },
      });

      await recordAuditLog(tx, {
        userId: user.id,
        action: 'AUTH_LOGIN_SUCCESS',
        entity: 'users',
        entityId: user.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role,
      },
    };
  }

  async refresh(
    input: RefreshTokenInput,
    meta: RequestClientMeta,
  ): Promise<RefreshTokenResponseData> {
    await this.jwtService.verifyRefreshToken(input.refreshToken);

    const now = new Date();
    const tokenHash = hashToken(input.refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored) {
      throw new AppError(ERROR_CODES.TOKEN_INVALID, 'Refresh token tidak dikenali', 401);
    }

    if (stored.revokedAt !== null) {
      await this.prisma.$transaction(async (tx) => {
        await tx.refreshToken.updateMany({
          where: { userId: stored.userId, revokedAt: null },
          data: { revokedAt: now },
        });
        await recordAuditLog(tx, {
          userId: stored.userId,
          action: 'AUTH_REFRESH_REUSE_DETECTED',
          entity: 'refresh_tokens',
          entityId: stored.id,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });
      });

      throw new AppError(
        ERROR_CODES.REFRESH_TOKEN_REVOKED,
        'Refresh token sudah dicabut, seluruh sesi diamankan ulang',
        401,
      );
    }

    if (stored.expiresAt <= now) {
      throw new AppError(
        ERROR_CODES.TOKEN_EXPIRED,
        'Refresh token telah berakhir, silakan login kembali',
        401,
      );
    }

    if (!stored.user.isActive || stored.user.deletedAt !== null) {
      throw new AppError(
        ERROR_CODES.ACCOUNT_INACTIVE,
        'Akun pengguna tidak aktif, akses ditolak',
        403,
      );
    }

    const role = stored.user.role as UserRole;
    const nextAccessToken = await this.jwtService.signAccessToken({ id: stored.user.id, role });
    const { token: nextRefreshToken, expiresAt } = await this.jwtService.signRefreshToken({
      id: stored.user.id,
      role,
    });
    const nextRefreshHash = hashToken(nextRefreshToken);

    await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: now },
      });

      if (revoked.count === 0) {
        throw new AppError(
          ERROR_CODES.REFRESH_TOKEN_REVOKED,
          'Refresh token sedang atau telah digunakan oleh permintaan lain',
          401,
        );
      }

      await tx.refreshToken.create({
        data: {
          userId: stored.user.id,
          tokenHash: nextRefreshHash,
          deviceInfo: meta.userAgent ?? stored.deviceInfo,
          expiresAt,
        },
      });
    });

    return {
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
    };
  }

  async logout(userId: string, input: LogoutInput, meta: RequestClientMeta): Promise<void> {
    const now = new Date();
    const tokenHash = hashToken(input.refreshToken);

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.updateMany({
        where: {
          userId,
          tokenHash,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });

      await recordAuditLog(tx, {
        userId,
        action: 'AUTH_LOGOUT',
        entity: 'users',
        entityId: userId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    });
  }

  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    meta: RequestClientMeta,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
    });

    if (!user || !user.isActive) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Pengguna tidak valid atau tidak aktif', 401);
    }

    const isCurrentValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      await recordAuditLog(this.prisma, {
        userId,
        action: 'AUTH_CHANGE_PASSWORD_FAILED',
        entity: 'users',
        entityId: userId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new AppError(
        ERROR_CODES.INVALID_CURRENT_PASSWORD,
        'Password saat ini tidak sesuai',
        400,
      );
    }

    const nextPasswordHash = await bcrypt.hash(input.newPassword, this.config.bcryptRounds);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: nextPasswordHash },
      });

      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });

      await recordAuditLog(tx, {
        userId,
        action: 'AUTH_CHANGE_PASSWORD',
        entity: 'users',
        entityId: userId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    });
  }

  async getProfile(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
    });

    if (!user || !user.isActive) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Sesi pengguna sudah tidak berlaku', 401);
    }

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role as UserRole,
    };
  }
}
