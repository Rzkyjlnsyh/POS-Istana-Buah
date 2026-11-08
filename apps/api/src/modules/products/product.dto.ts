import type {
  AddProductBarcode,
  AddProductBarcodeDto,
  BatchImportProductItem,
  BatchImportProductResult,
  BatchImportProductsInput,
  BatchImportRowError,
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
  batchImportProductItemSchema,
  batchImportProductsSchema,
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
  BatchImportProductItem,
  BatchImportProductResult,
  BatchImportProductsInput,
  BatchImportRowError,
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
