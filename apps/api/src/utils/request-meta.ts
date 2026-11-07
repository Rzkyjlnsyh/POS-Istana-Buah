import type { Request } from 'express';

export interface RequestClientMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

/** Mengambil IP & user-agent klien untuk audit log (header proxy diprioritaskan). */
export function extractClientMeta(req: Request): RequestClientMeta {
  const forwarded = req.headers['x-forwarded-for'];
  const ipFromHeader =
    typeof forwarded === 'string' && forwarded.trim().length > 0
      ? (forwarded.split(',')[0]?.trim() ?? null)
      : null;

  return {
    ipAddress: ipFromHeader ?? req.ip ?? req.socket.remoteAddress ?? null,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
  };
}
