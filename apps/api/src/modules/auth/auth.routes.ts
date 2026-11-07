import { Router, type RequestHandler } from 'express';
import { validateBody } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { AuthController } from './auth.controller';
import { changePasswordSchema, loginSchema, logoutSchema, refreshTokenSchema } from './auth.dto';
import type { AuthService } from './auth.service';

export interface AuthRouterDependencies {
  authService: AuthService;
  authRateLimiter: RequestHandler;
  authenticate: RequestHandler;
}

export function createAuthRouter(deps: AuthRouterDependencies): Router {
  const router = Router();
  const controller = new AuthController(deps.authService);

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

  router.post(
    '/logout',
    deps.authenticate,
    validateBody(logoutSchema),
    asyncHandler(controller.logout),
  );

  router.put(
    '/change-password',
    deps.authenticate,
    validateBody(changePasswordSchema),
    asyncHandler(controller.changePassword),
  );

  router.get('/me', deps.authenticate, asyncHandler(controller.me));

  return router;
}
