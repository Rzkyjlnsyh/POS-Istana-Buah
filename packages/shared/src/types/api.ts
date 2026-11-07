/** Envelope response API (Bagian 7.1). */

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
  meta?: PaginationMeta;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiError {
  success: false;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/** Payload GET /health (Bagian 13.5). */
export type ServiceStatus = 'ok' | 'down';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  version: string;
  services: Record<string, ServiceStatus>;
  uptime: number;
}
