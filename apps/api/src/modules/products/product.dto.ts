import type {
  AddProductBarcode,
  AddProductBarcodeDto,
  CreateProductInput,
  GenerateBarcodeQuery,
  GenerateBarcodeResult,
  ProductBarcodeDto,
  ProductBarcodeIdParam,
  ProductBarcodeParam,
  ProductCategoryRef,
  ProductDto,
  ProductIdParam,
  ProductListQuery,
  UpdateProductInput,
  UserRole,
} from '@istana-buah/shared';

export {
  addProductBarcodeSchema,
  createProductSchema,
  generateBarcodeQuerySchema,
  productBarcodeIdParamSchema,
  productBarcodeParamSchema,
  productIdParamSchema,
  productListQuerySchema,
  updateProductSchema,
} from '@istana-buah/shared';

export type {
  AddProductBarcode,
  AddProductBarcodeDto,
  CreateProductInput,
  GenerateBarcodeQuery,
  GenerateBarcodeResult,
  ProductBarcodeDto,
  ProductBarcodeIdParam,
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
