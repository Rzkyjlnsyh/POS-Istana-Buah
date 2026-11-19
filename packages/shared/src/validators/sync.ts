import { z } from 'zod';
import { createTransactionSchema } from './transaction';

export const SYNC_OPERATION_TYPES = ['TRANSACTION'] as const;
export const SYNC_PULL_ENTITY_TYPES = ['products', 'categories'] as const;

export const syncBatchOperationSchema = z.object({
  type: z.enum(SYNC_OPERATION_TYPES),
  clientId: z
    .string()
    .trim()
    .min(3, 'Client ID minimal 3 karakter')
    .max(100, 'Client ID maksimal 100 karakter'),
  data: createTransactionSchema,
  timestamp: z
    .string()
    .datetime({ offset: true, message: 'Format timestamp operasi harus ISO 8601' }),
});

export type SyncBatchOperationInput = z.infer<typeof syncBatchOperationSchema>;

export const syncBatchBodySchema = z.object({
  deviceId: z
    .string()
    .trim()
    .min(2, 'Device ID minimal 2 karakter')
    .max(120, 'Device ID maksimal 120 karakter'),
  operations: z
    .array(syncBatchOperationSchema)
    .min(1, 'Minimal harus terdapat satu operasi sinkronisasi')
    .max(100, 'Maksimal 100 operasi per batch sinkronisasi'),
});

export type SyncBatchBodyInput = z.infer<typeof syncBatchBodySchema>;

export const syncPullQuerySchema = z.object({
  since: z
    .string()
    .trim()
    .datetime({ offset: true, message: 'Format timestamp since harus ISO 8601' })
    .optional(),
  types: z
    .string()
    .trim()
    .optional()
    .transform((raw) => {
      if (!raw) {
        return ['products', 'categories'] as const;
      }
      return raw
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length > 0);
    })
    .refine(
      (list) =>
        list.length > 0 &&
        list.every(
          (item): item is (typeof SYNC_PULL_ENTITY_TYPES)[number] =>
            item === 'products' || item === 'categories',
        ),
      'Parameter types hanya mendukung products dan categories',
    ),
});

export type SyncPullQueryInput = z.infer<typeof syncPullQuerySchema>;
