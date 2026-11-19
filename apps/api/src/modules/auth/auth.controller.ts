import { ERROR_CODES } from '@istana-buah/shared';
import type { Request, Response } from 'express';
import { AppError } from '../../utils/app-error';
import { extractClientMeta } from '../../utils/request-meta';
import type { ChangePasswordInput, LoginInput, LogoutInput, RefreshTokenInput } from './auth.dto';
import type { AuthService } from './auth.service';

function requireAuthenticatedUserId(req: Request): string {
  if (!req.authUser) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Autentikasi diperlukan', 401);
  }
  return req.authUser.id;
}

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  login = async (req: Request, res: Response): Promise<void> => {
    const data = await this.authService.login(req.body as LoginInput, extractClientMeta(req));
    res.status(200).json({
      success: true,
      data,
    });
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const data = await this.authService.refresh(
      req.body as RefreshTokenInput,
      extractClientMeta(req),
    );
    res.status(200).json({
      success: true,
      data,
    });
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    const userId = requireAuthenticatedUserId(req);
    await this.authService.logout(userId, req.body as LogoutInput, extractClientMeta(req));
    res.status(200).json({
      success: true,
      message: 'Berhasil logout',
    });
  };

  changePassword = async (req: Request, res: Response): Promise<void> => {
    const userId = requireAuthenticatedUserId(req);
    await this.authService.changePassword(
      userId,
      req.body as ChangePasswordInput,
      extractClientMeta(req),
    );
    res.status(200).json({
      success: true,
      message: 'Password berhasil diperbarui',
    });
  };

  me = async (req: Request, res: Response): Promise<void> => {
    const userId = requireAuthenticatedUserId(req);
    const user = await this.authService.getProfile(userId);
    res.status(200).json({
      success: true,
      data: { user },
    });
  };
}
