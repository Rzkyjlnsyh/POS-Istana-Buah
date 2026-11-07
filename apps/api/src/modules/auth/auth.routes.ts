import { ERROR_CODES } from '@istana-buah/shared';
import { Router, type RequestHandler } from 'express';
import { validateBody } from '../../middleware/validate';
import { AppError } from '../../utils/app-error';
import { asyncHandler } from '../../utils/async-handler';
import type { JwtTokenService } from '../../utils/jwt';
import { AuthController } from './auth.controller';
import { changePasswordSchema, loginSchema, logoutSchema, refreshTokenSchema } from './auth.dto';
import type { AuthService } from './auth.service';

export interface AuthRouterDependencies {
  authService: AuthService;
  jwtService: JwtTokenService;
  authRateLimiter: RequestHandler;
  authenticateMiddleware?: RequestHandler;
}

function createInlineBearerVerifier(jwtService: JwtTokenService): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Token autentikasi tidak ditemukan', 401);
    }

    const rawToken = header.slice('Bearer '.length).trim();
    if (!rawToken) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Token autentikasi kosong', 401);
    }

    const verified = await jwtService.verifyAccessToken(rawToken);
    req.authUser = {
      id: verified.sub,
      role: verified.role,
      tokenJti: verified.jti,
    };
    next();
  });
}

export function createAuthRouter(deps: AuthRouterDependencies): Router {
  const router = Router();
  const controller = new AuthController(deps.authService);
  const requireAuth = deps.authenticateMiddleware ?? createInlineBearerVerifier(deps.jwtService);

  router.post(
    '/login',
    deps.authRateLimiter,
    validateBody(loginSchema),
    asyncHandler(controller.login),
  );

  router.post(
    '/refresh',
    deps.authRateLimiter,
    validateBody(refreshTokenSchema),
    asyncHandler(controller.refresh),
  );

  router.post('/logout', requireAuth, validateBody(logoutSchema), asyncHandler(controller.logout));

  router.put(
    '/change-password',
    requireAuth,
    validateBody(changePasswordSchema),
    asyncHandler(controller.changePassword),
  );

  router.get('/me', requireAuth, asyncHandler(controller.me));

  return router;
}
