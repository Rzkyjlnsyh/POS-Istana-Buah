import crypto from 'node:crypto';
import { ERROR_CODES } from '@istana-buah/shared';
import express from 'express';
import request from 'supertest';
import { authConfig } from '../../src/config/auth.config';
import { createAuthenticateMiddleware } from '../../src/middleware/authenticate';
import { authorize } from '../../src/middleware/authorize';
import { errorHandler } from '../../src/middleware/errorHandler';
import { JwtTokenService } from '../../src/utils/jwt';

describe('M01-002: authenticate & authorize middleware', () => {
  const jwtService = new JwtTokenService(authConfig.jwt);

  it('menolak request tanpa header Authorization atau dengan format salah (401 UNAUTHORIZED)', async () => {
    const app = express();
    app.get('/protected', createAuthenticateMiddleware({ jwtService }), (req, res) => {
      res.json({ user: req.authUser });
    });
    app.use(errorHandler);

    const noHeader = await request(app).get('/protected');
    expect(noHeader.status).toBe(401);
    expect(noHeader.body.error.code).toBe(ERROR_CODES.UNAUTHORIZED);

    const badFormat = await request(app).get('/protected').set('Authorization', 'Basic abc123');
    expect(badFormat.status).toBe(401);
    expect(badFormat.body.error.code).toBe(ERROR_CODES.UNAUTHORIZED);

    const extraSpaces = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer token1 token2');
    expect(extraSpaces.status).toBe(401);
    expect(extraSpaces.body.error.code).toBe(ERROR_CODES.UNAUTHORIZED);
  });

  it('memverifikasi status live user via lookupUser (deleted -> 401, inactive -> 403, role terbaru diterapkan)', async () => {
    const userId = crypto.randomUUID();
    const token = await jwtService.signAccessToken({ id: userId, role: 'CASHIER' });

    const deletedApp = express();
    deletedApp.get(
      '/p',
      createAuthenticateMiddleware({
        jwtService,
        lookupUser: async () => ({
          id: userId,
          role: 'CASHIER',
          isActive: true,
          deletedAt: new Date(),
        }),
      }),
      (_req, res) => res.json({ ok: true }),
    );
    deletedApp.use(errorHandler);

    const deletedRes = await request(deletedApp).get('/p').set('Authorization', `Bearer ${token}`);
    expect(deletedRes.status).toBe(401);

    const inactiveApp = express();
    inactiveApp.get(
      '/p',
      createAuthenticateMiddleware({
        jwtService,
        lookupUser: async () => ({
          id: userId,
          role: 'CASHIER',
          isActive: false,
          deletedAt: null,
        }),
      }),
      (_req, res) => res.json({ ok: true }),
    );
    inactiveApp.use(errorHandler);

    const inactiveRes = await request(inactiveApp)
      .get('/p')
      .set('Authorization', `Bearer ${token}`);
    expect(inactiveRes.status).toBe(403);
    expect(inactiveRes.body.error.code).toBe(ERROR_CODES.ACCOUNT_INACTIVE);

    // Promosi role di DB langsung tercermin di req.authUser tanpa menunggu token kedaluwarsa
    const promotedApp = express();
    promotedApp.get(
      '/p',
      createAuthenticateMiddleware({
        jwtService,
        lookupUser: async () => ({
          id: userId,
          role: 'MANAGER',
          isActive: true,
          deletedAt: null,
        }),
      }),
      authorize('MANAGER', 'OWNER'),
      (req, res) => res.json({ role: req.authUser?.role }),
    );
    promotedApp.use(errorHandler);

    const promotedRes = await request(promotedApp)
      .get('/p')
      .set('Authorization', `Bearer ${token}`);
    expect(promotedRes.status).toBe(200);
    expect(promotedRes.body.role).toBe('MANAGER');
  });

  it('TC-SEC-003: authorize menolak role tidak sesuai dengan 403 FORBIDDEN dan fail-closed tanpa authUser', async () => {
    expect(() => authorize()).toThrow(/minimal satu UserRole/);

    const unauthApp = express();
    unauthApp.get('/admin-only', authorize('OWNER'), (_req, res) => res.json({ ok: true }));
    unauthApp.use(errorHandler);

    const noAuthUser = await request(unauthApp).get('/admin-only');
    expect(noAuthUser.status).toBe(401);
    expect(noAuthUser.body.error.code).toBe(ERROR_CODES.UNAUTHORIZED);

    const rbacApp = express();
    rbacApp.get(
      '/admin-only',
      createAuthenticateMiddleware({ jwtService }),
      authorize('MANAGER', 'OWNER'),
      (_req, res) => res.json({ secret: 'laporan-keuangan' }),
    );
    rbacApp.use(errorHandler);

    const cashierToken = await jwtService.signAccessToken({
      id: crypto.randomUUID(),
      role: 'CASHIER',
    });
    const forbiddenRes = await request(rbacApp)
      .get('/admin-only')
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.error.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(forbiddenRes.body.error.details).toEqual({
      requiredRoles: ['MANAGER', 'OWNER'],
      currentRole: 'CASHIER',
    });

    const ownerToken = await jwtService.signAccessToken({
      id: crypto.randomUUID(),
      role: 'OWNER',
    });
    const allowedRes = await request(rbacApp)
      .get('/admin-only')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(allowedRes.status).toBe(200);
    expect(allowedRes.body.secret).toBe('laporan-keuangan');
  });
});
