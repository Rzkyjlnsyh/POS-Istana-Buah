import { z } from 'zod';
import { PAYMENT_METHODS, TRANSACTION_STATUSES } from '../constants/enums';
import { paginationQuerySchema } from './pagination';

export const createTransactionItemSchema = z.object({
  productId: z.string().uuid('ID produk tidak valid'),
  quantity: z.number().positive('Jumlah / berat barang harus lebih besar dari 0'),
  unitPrice: z.number().positive('Harga satuan harus lebih besar dari 0'),
  discountAmount: z.number().min(0, 'Diskon item tidak boleh negatif').nullish(),
});

export type CreateTransactionItemInput = z.infer<typeof createTransactionItemSchema>;

export const createTransactionSchema = z
  .object({
    clientId: z
      .string()
      .trim()
      .min(3, 'Client ID minimal 3 karakter')
      .max(100, 'Client ID maksimal 100 karakter')
      .nullish(),
    shiftId: z.string().uuid('ID shift tidak valid').nullish(),
    items: z
      .array(createTransactionItemSchema)
      .min(1, 'Transaksi minimal harus memiliki satu item belanja')
      .max(200, 'Maksimal 200 item per transaksi'),
    discountAmount: z.number().min(0, 'Diskon total tidak boleh negatif').nullish(),
    paymentMethod: z.enum(PAYMENT_METHODS),
    amountPaid: z.number().min(0, 'Nominal pembayaran tidak boleh negatif'),
    notes: z.string().trim().max(500, 'Catatan maksimal 500 karakter').nullish(),
    transactedAt: z
      .string()
      .datetime({ offset: true, message: 'Format waktu transactedAt harus ISO 8601' })
      .optional(),
  })
  .superRefine((data, ctx) => {
    const rawSubtotal = data.items.reduce((sum, item) => {
      const line = item.quantity * item.unitPrice - (item.discountAmount ?? 0);
      return sum + Math.max(0, line);
    }, 0);

    const totalPayable = Math.max(0, rawSubtotal - (data.discountAmount ?? 0));

    // Jika tunai, pembayaran tidak boleh kurang dari total belanja
    if (data.paymentMethod === 'CASH' && data.amountPaid < totalPayable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amountPaid'],
        message: `Uang tunai dibayarkan (${String(data.amountPaid)}) kurang dari total belanja (${String(totalPayable)})`,
      });
    }
  });

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const voidTransactionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Alasan pembatalan minimal 3 karakter')
    .max(255, 'Alasan pembatalan maksimal 255 karakter'),
});

export type VoidTransactionInput = z.infer<typeof voidTransactionSchema>;

export const transactionIdParamSchema = z.object({
  id: z.string().uuid('ID transaksi tidak valid'),
});

export type TransactionIdParam = z.infer<typeof transactionIdParamSchema>;

export const transactionListQuerySchema = paginationQuerySchema.extend({
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  cashierId: z.string().uuid('ID kasir filter tidak valid').optional(),
  shiftId: z.string().uuid('ID shift filter tidak valid').optional(),
  status: z.enum(TRANSACTION_STATUSES).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  search: z.string().trim().max(100).optional(),
});

export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;
