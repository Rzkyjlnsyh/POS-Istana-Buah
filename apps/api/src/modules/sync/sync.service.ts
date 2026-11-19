import { ERROR_CODES, type UserRole } from '@istana-buah/shared';
import type { PrismaClient } from '@prisma/client';
import { AppError } from '../../utils/app-error';
import { WITH_PRODUCT_COUNT, toCategoryDto } from '../categories/category.service';
import { PRODUCT_INCLUDE, toProductDto } from '../products/product.service';
import type { TransactionService } from '../transactions/transaction.service';
import type {
  SyncActorContext,
  SyncBatchBodyInput,
  SyncBatchConflictItemDto,
  SyncBatchErrorItemDto,
  SyncBatchResponseDto,
  SyncBatchSuccessItemDto,
  SyncPullQueryInput,
  SyncPullResponseDto,
} from './sync.dto';

const CONFLICT_ERROR_CODES = new Set<string>([
  ERROR_CODES.INSUFFICIENT_STOCK,
  ERROR_CODES.PRODUCT_NOT_FOUND,
  ERROR_CODES.INSUFFICIENT_PAYMENT,
]);

/**
 * Layanan sinkronisasi transaksi offline batch & delta pull katalog (M11-002 / Bagian 7.8).
 * - Deduplikasi idempotency via clientId mengandalkan TransactionService ($transaction + advisory lock).
 * - Error stok / produk bisnis dilaporkan per operasi sebagai conflict untuk resolusi manual kasir/manajer.
 */
export class SyncService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly transactionService: TransactionService,
  ) {}

  async processBatch(
    input: SyncBatchBodyInput,
    actor: SyncActorContext,
  ): Promise<SyncBatchResponseDto> {
    const success: SyncBatchSuccessItemDto[] = [];
    const conflicts: SyncBatchConflictItemDto[] = [];
    const errors: SyncBatchErrorItemDto[] = [];

    for (const op of input.operations) {
      try {
        const created = await this.transactionService.create(
          {
            ...op.data,
            clientId: op.clientId,
            transactedAt: op.timestamp,
          },
          actor,
        );

        await this.prisma.transaction.updateMany({
          where: { id: created.id, syncedAt: null },
          data: { syncedAt: new Date() },
        });

        success.push({
          clientId: op.clientId,
          serverId: created.id,
          transactionNo: created.transactionNo,
        });
      } catch (err: unknown) {
        if (err instanceof AppError) {
          if (
            CONFLICT_ERROR_CODES.has(err.code) ||
            err.statusCode === 409 ||
            err.statusCode === 422
          ) {
            conflicts.push({
              clientId: op.clientId,
              reason: err.message,
              code: err.code,
            });
          } else {
            errors.push({
              clientId: op.clientId,
              message: err.message,
              code: err.code,
            });
          }
          continue;
        }

        const fallbackMessage =
          err instanceof Error ? err.message : 'Gagal menyinkronkan operasi transaksi';
        errors.push({
          clientId: op.clientId,
          message: fallbackMessage,
          code: ERROR_CODES.INTERNAL_ERROR,
        });
      }
    }

    return {
      processed: input.operations.length,
      success,
      conflicts,
      errors,
    };
  }

  async pullUpdates(query: SyncPullQueryInput, role: UserRole): Promise<SyncPullResponseDto> {
    const sinceDate = query.since ? new Date(query.since) : null;
    if (sinceDate && Number.isNaN(sinceDate.getTime())) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Timestamp since tidak valid', 400);
    }

    const requestedTypes = new Set(query.types);
    const updatedAtFilter = sinceDate ? { updatedAt: { gte: sinceDate } } : {};

    const [categoriesRows, productRows] = await Promise.all([
      requestedTypes.has('categories')
        ? this.prisma.category.findMany({
            where: { deletedAt: null, ...updatedAtFilter },
            include: WITH_PRODUCT_COUNT,
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          })
        : Promise.resolve([]),
      requestedTypes.has('products')
        ? this.prisma.product.findMany({
            where: { deletedAt: null, ...updatedAtFilter },
            include: PRODUCT_INCLUDE,
            orderBy: [{ updatedAt: 'asc' }, { name: 'asc' }],
          })
        : Promise.resolve([]),
    ]);

    return {
      serverTime: new Date().toISOString(),
      products: productRows.map((row) => toProductDto(row, role)),
      categories: categoriesRows.map((row) => toCategoryDto(row)),
    };
  }
}
