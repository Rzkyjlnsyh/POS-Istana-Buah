import { PrismaClient } from '@prisma/client';
import type { ServiceStatus } from '@istana-buah/shared';
import { databaseConfig } from '../config/database.config';
import { logger } from './logger';

/**
 * Prisma Client singleton (Bagian 5.4 & Bagian 15.5).
 * Dilarang menggunakan `$queryRawUnsafe` (aturan wajib keamanan SQL injection).
 */
export function createPrismaClient(url: string = databaseConfig.url): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: { url },
    },
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export interface DatabaseHealthCheckable {
  $queryRaw: (query: TemplateStringsArray) => Promise<unknown>;
}

export async function checkDatabaseHealth(
  client: DatabaseHealthCheckable = prisma,
): Promise<ServiceStatus> {
  try {
    await client.$queryRaw`SELECT 1`;
    return 'ok';
  } catch (err) {
    logger.error('Database health check failed', { err });
    return 'down';
  }
}

export async function disconnectDatabase(client: PrismaClient = prisma): Promise<void> {
  await client.$disconnect();
}
