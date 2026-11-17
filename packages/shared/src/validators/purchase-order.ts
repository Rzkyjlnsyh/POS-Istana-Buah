import { z } from 'zod';
import { PURCHASE_ORDER_STATUSES } from '../constants/enums';
import { rangeBoundarySchema } from './date-range';
import { paginationQuerySchema } from './pagination';

export const createPurchaseOrderItemSchema = z.object({
  productId: z.string().uuid('ID produk tidak valid'),
  quantity: z.number().finite().positive('Kuantitas pembelian harus lebih dari 0'),
  unitCost: z.number().finite().min(0, 'Harga beli satuan tidak boleh negatif'),
});

export type CreatePurchaseOrderItemInput = z.infer<typeof createPurchaseOrderItemSchema>;

export const createPurchaseOrderSchema = z
  .object({
    supplierId: z.string().uuid('ID supplier tidak valid'),
    items: z
      .array(createPurchaseOrderItemSchema)
      .min(1, 'Purchase Order minimal memiliki satu item')
      .max(200, 'Maksimal 200 item per Purchase Order'),
    paidAmount: z
      .number()
      .finite()
      .min(0, 'Nominal pembayaran awal tidak boleh negatif')
      .optional(),
    notes: z.string().trim().max(500, 'Catatan maksimal 500 karakter').nullish(),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    let computedTotal = 0;

    data.items.forEach((item, index) => {
      if (seen.has(item.productId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'productId'],
          message: 'Produk duplikat tidak diizinkan dalam satu Purchase Order',
        });
      }
      seen.add(item.productId);
      computedTotal += item.quantity * item.unitCost;
    });

    if (data.paidAmount !== undefined && data.paidAmount > computedTotal + 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['paidAmount'],
        message: 'Pembayaran awal tidak boleh melebihi total nilai Purchase Order',
      });
    }
  });

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

export const payPurchaseOrderSchema = z.object({
  amount: z.number().finite().positive('Nominal pelunasan harus lebih besar dari 0'),
  notes: z.string().trim().max(255, 'Catatan pembayaran maksimal 255 karakter').nullish(),
});

export type PayPurchaseOrderInput = z.infer<typeof payPurchaseOrderSchema>;

export const purchaseOrderIdParamSchema = z.object({
  id: z.string().uuid('ID Purchase Order tidak valid'),
});

export type PurchaseOrderIdParam = z.infer<typeof purchaseOrderIdParamSchema>;

export const purchaseOrderListQuerySchema = paginationQuerySchema.extend({
  supplierId: z.string().uuid('ID supplier tidak valid').optional(),
  status: z.enum(PURCHASE_ORDER_STATUSES).optional(),
  unpaidOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  startDate: rangeBoundarySchema,
  endDate: rangeBoundarySchema,
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export type PurchaseOrderListQuery = z.infer<typeof purchaseOrderListQuerySchema>;
