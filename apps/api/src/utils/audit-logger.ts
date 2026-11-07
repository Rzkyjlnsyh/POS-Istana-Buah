import type { Prisma, PrismaClient } from '@prisma/client';

type AuditPrismaExecutor = PrismaClient | Prisma.TransactionClient;

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'currentpassword',
  'newpassword',
  'confirmpassword',
  'accesstoken',
  'refreshtoken',
  'tokenhash',
]);

/**
 * Menyaring field sensitif secara rekursif agar tidak pernah tersimpan di audit_logs (Bagian 14.5).
 */
export function sanitizeAuditPayload(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value as Prisma.InputJsonValue;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditPayload(item) ?? null) as Prisma.InputJsonArray;
  }
  if (typeof value === 'object') {
    const sanitized: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeAuditPayload(entryValue) ?? null;
      }
    }
    return sanitized as Prisma.InputJsonObject;
  }
  return String(value);
}

export interface RecordAuditLogInput {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function recordAuditLog(
  db: AuditPrismaExecutor,
  input: RecordAuditLogInput,
): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      oldValues: sanitizeAuditPayload(input.oldValues),
      newValues: sanitizeAuditPayload(input.newValues),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}
