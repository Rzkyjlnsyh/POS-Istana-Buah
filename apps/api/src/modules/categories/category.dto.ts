export {
  categoryIdParamSchema,
  categoryListQuerySchema,
  createCategorySchema,
  updateCategorySchema,
  type CategoryDto,
  type CategoryIdParam,
  type CategoryListQuery,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from '@istana-buah/shared';

export interface CategoryActorContext {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
}
