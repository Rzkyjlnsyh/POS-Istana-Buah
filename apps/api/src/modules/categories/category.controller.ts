import { ERROR_CODES } from '@istana-buah/shared';
import type { Request, Response } from 'express';
import { AppError } from '../../utils/app-error';
import { extractClientMeta } from '../../utils/request-meta';
import type {
  CategoryActorContext,
  CategoryIdParam,
  CategoryListQuery,
  CreateCategoryInput,
  UpdateCategoryInput,
} from './category.dto';
import type { CategoryService } from './category.service';

function buildActor(req: Request): CategoryActorContext {
  if (!req.authUser) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Autentikasi diperlukan', 401);
  }
  return { userId: req.authUser.id, ...extractClientMeta(req) };
}

export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const result = await this.categoryService.list(req.validatedQuery as CategoryListQuery);
    res.status(200).json({ success: true, data: result.items, meta: result.meta });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as CategoryIdParam;
    const data = await this.categoryService.getById(id);
    res.status(200).json({ success: true, data });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const data = await this.categoryService.create(
      req.body as CreateCategoryInput,
      buildActor(req),
    );
    res.status(201).json({ success: true, data, message: 'Kategori berhasil dibuat' });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as CategoryIdParam;
    const data = await this.categoryService.update(
      id,
      req.body as UpdateCategoryInput,
      buildActor(req),
    );
    res.status(200).json({ success: true, data, message: 'Kategori berhasil diperbarui' });
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as CategoryIdParam;
    await this.categoryService.remove(id, buildActor(req));
    res.status(200).json({ success: true, message: 'Kategori berhasil dihapus' });
  };
}
