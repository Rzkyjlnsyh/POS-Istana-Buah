import type {
  CreateProductInput,
  ProductBarcodeDto,
  ProductBarcodeParam,
  ProductCategoryRef,
  ProductDto,
  ProductIdParam,
  ProductListQuery,
  UpdateProductInput,
  UserRole,
} from '@istana-buah/shared';

export {
  createProductSchema,
  productBarcodeParamSchema,
  productIdParamSchema,
  productListQuerySchema,
  updateProductSchema,
} from '@istana-buah/shared';

export type {
  CreateProductInput,
  ProductBarcodeDto,
  ProductBarcodeParam,
  ProductCategoryRef,
  ProductDto,
  ProductIdParam,
  ProductListQuery,
  UpdateProductInput,
};

export interface ProductActorContext {
  userId: string;
  role: UserRole;
  ipAddress: string | null;
  userAgent: string | null;
}
