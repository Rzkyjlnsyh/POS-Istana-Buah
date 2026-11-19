import { ERROR_CODES } from '@istana-buah/shared';
import type { Request, Response } from 'express';
import { AppError } from '../../utils/app-error';
import { extractClientMeta } from '../../utils/request-meta';
import type {
  AddProductBarcode,
  BatchImportProductsInput,
  CreateProductInput,
  GenerateBarcodeQuery,
  ProductActorContext,
  ProductBarcodeIdParam,
  ProductBarcodeParam,
  ProductIdParam,
  ProductListQuery,
  UpdateProductInput,
} from './product.dto';
import type { ProductService } from './product.service';

function buildActor(req: Request): ProductActorContext {
  if (!req.authUser) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Autentikasi diperlukan', 401);
  }
  return {
    userId: req.authUser.id,
    role: req.authUser.role,
    ...extractClientMeta(req),
  };
}

export class ProductController {
  constructor(private readonly productService: ProductService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const role = req.authUser?.role ?? 'CASHIER';
    const result = await this.productService.list(req.validatedQuery as ProductListQuery, role);
    res.status(200).json({ success: true, data: result.items, meta: result.meta });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const role = req.authUser?.role ?? 'CASHIER';
    const { id } = req.params as unknown as ProductIdParam;
    const data = await this.productService.getById(id, role);
    res.status(200).json({ success: true, data });
  };

  getByBarcode = async (req: Request, res: Response): Promise<void> => {
    const role = req.authUser?.role ?? 'CASHIER';
    const { barcode } = req.params as unknown as ProductBarcodeParam;
    const data = await this.productService.getByBarcode(barcode, role);
    res.status(200).json({ success: true, data });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const data = await this.productService.create(req.body as CreateProductInput, buildActor(req));
    res.status(201).json({ success: true, data, message: 'Produk berhasil dibuat' });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as ProductIdParam;
    const data = await this.productService.update(
      id,
      req.body as UpdateProductInput,
      buildActor(req),
    );
    res.status(200).json({ success: true, data, message: 'Produk berhasil diperbarui' });
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as ProductIdParam;
    await this.productService.remove(id, buildActor(req));
    res.status(200).json({ success: true, message: 'Produk berhasil dihapus' });
  };

  generateBarcode = async (req: Request, res: Response): Promise<void> => {
    const query = (req.validatedQuery ?? {}) as GenerateBarcodeQuery;
    const data = await this.productService.generateBarcode(query.prefix);
    res.status(200).json({ success: true, data });
  };

  generateAndAttachBarcode = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as ProductIdParam;
    const query = (req.validatedQuery ?? {}) as GenerateBarcodeQuery;
    const isPrimary = (req.body as { isPrimary?: boolean })?.isPrimary;
    const data = await this.productService.generateAndAttachBarcode(
      id,
      query.prefix,
      isPrimary,
      buildActor(req),
    );
    res.status(201).json({
      success: true,
      data,
      message: 'Barcode berhasil di-generate dan dipasangkan',
    });
  };

  addBarcode = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as ProductIdParam;
    const data = await this.productService.addBarcode(
      id,
      req.body as AddProductBarcode,
      buildActor(req),
    );
    res.status(201).json({ success: true, data, message: 'Barcode berhasil ditambahkan' });
  };

  removeBarcode = async (req: Request, res: Response): Promise<void> => {
    const { id, barcodeId } = req.params as unknown as ProductBarcodeIdParam;
    await this.productService.removeBarcode(id, barcodeId, buildActor(req));
    res.status(200).json({ success: true, message: 'Barcode berhasil dihapus' });
  };

  setPrimaryBarcode = async (req: Request, res: Response): Promise<void> => {
    const { id, barcodeId } = req.params as unknown as ProductBarcodeIdParam;
    const data = await this.productService.setPrimaryBarcode(id, barcodeId, buildActor(req));
    res.status(200).json({ success: true, data, message: 'Barcode utama berhasil diperbarui' });
  };

  batchImport = async (req: Request, res: Response): Promise<void> => {
    const data = await this.productService.batchImport(
      req.body as BatchImportProductsInput,
      buildActor(req),
    );
    res.status(200).json({
      success: true,
      data,
      message: `Impor selesai: ${String(data.importedCount)} berhasil, ${String(data.failedCount)} gagal`,
    });
  };
}
