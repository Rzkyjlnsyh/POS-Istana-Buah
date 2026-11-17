import { z } from 'zod';
import { STOCK_MOVEMENT_TYPES, STOCK_OPNAME_STATUSES } from '../constants/enums';
import { rangeBoundarySchema } from './date-range';
import { paginationQuerySchema } from './pagination';

export const receiveStockItemSchema = z.object({
  productId: z.string().uuid('ID produk tidak valid'),
  quantity: z.number().finite().positive('Kuantitas penerimaan harus lebih dari 0'),
  unitCost: z.number().finite().min(0, 'Harga beli satuan tidak boleh negatif').nullish(),
});

export type ReceiveStockItemInput = z.infer<typeof receiveStockItemSchema>;

export const receiveStockSchema = z.object({
  purchaseOrderId: z.string().uuid('ID Purchase Order tidak valid').nullish(),
  supplierId: z.string().uuid('ID supplier tidak valid').nullish(),
  items: z
    .array(receiveStockItemSchema)
    .min(1, 'Penerimaan barang minimal memiliki satu item')
    .max(200, 'Maksimal 200 item per penerimaan'),
  notes: z.string().trim().max(500, 'Catatan maksimal 500 karakter').nullish(),
});

export type ReceiveStockInput = z.infer<typeof receiveStockSchema>;

export const stockOpnameItemInputSchema = z.object({
  productId: z.string().uuid('ID produk tidak valid'),
  physicalQty: z.number().finite().min(0, 'Kuantitas fisik tidak boleh negatif'),
  notes: z.string().trim().max(255, 'Catatan item maksimal 255 karakter').nullish(),
});

export type StockOpnameItemInput = z.infer<typeof stockOpnameItemInputSchema>;

export const createStockOpnameSchema = z
  .object({
    items: z
      .array(stockOpnameItemInputSchema)
      .min(1, 'Stok opname minimal memiliki satu item')
      .max(500, 'Maksimal 500 item per dokumen opname'),
    notes: z.string().trim().max(500, 'Catatan opname maksimal 500 karakter').nullish(),
    finalize: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    data.items.forEach((item, index) => {
      if (seen.has(item.productId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'productId'],
          message: 'Produk duplikat tidak diizinkan dalam satu stok opname',
        });
      }
      seen.add(item.productId);
    });
  });

export type CreateStockOpnameInput = z.infer<typeof createStockOpnameSchema>;

export const stockOpnameIdParamSchema = z.object({
  id: z.string().uuid('ID stok opname tidak valid'),
});

export type StockOpnameIdParam = z.infer<typeof stockOpnameIdParamSchema>;

export const stockOpnameListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(STOCK_OPNAME_STATUSES).optional(),
  startDate: rangeBoundarySchema,
  endDate: rangeBoundarySchema,
  search: z.string().trim().max(100).optional(),
});

export type StockOpnameListQuery = z.infer<typeof stockOpnameListQuerySchema>;

export const stockMovementListQuerySchema = paginationQuerySchema.extend({
  productId: z.string().uuid('ID produk tidak valid').optional(),
  type: z.enum(STOCK_MOVEMENT_TYPES).optional(),
  startDate: rangeBoundarySchema,
  endDate: rangeBoundarySchema,
  search: z.string().trim().max(100).optional(),
});

export type StockMovementListQuery = z.infer<typeof stockMovementListQuerySchema>;

export const lowStockAlertQuerySchema = paginationQuerySchema.extend({
  categoryId: z.string().uuid('ID kategori filter tidak valid').optional(),
  search: z.string().trim().max(100).optional(),
});

export type LowStockAlertQuery = z.infer<typeof lowStockAlertQuerySchema>;
