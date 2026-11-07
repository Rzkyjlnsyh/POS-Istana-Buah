import { type ApiError, ERROR_CODES } from '@istana-buah/shared';
import axios from 'axios';

export interface AuthErrorCopy {
  title: string;
  description: string;
}

export class FrontendApiError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;
  public readonly retryAfterSeconds?: number;

  constructor(params: {
    code: string;
    message: string;
    statusCode: number;
    details?: unknown;
    retryAfterSeconds?: number;
  }) {
    super(params.message);
    this.name = 'FrontendApiError';
    this.code = params.code;
    this.statusCode = params.statusCode;
    this.details = params.details;
    this.retryAfterSeconds = params.retryAfterSeconds;
  }
}

function isApiErrorEnvelope(payload: unknown): payload is ApiError {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const candidate = payload as Partial<ApiError>;
  return (
    candidate.success === false &&
    typeof candidate.error === 'object' &&
    candidate.error !== null &&
    typeof candidate.error.code === 'string' &&
    typeof candidate.error.message === 'string'
  );
}

export function normalizeApiError(error: unknown): FrontendApiError {
  if (error instanceof FrontendApiError) {
    return error;
  }

  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status ?? 0;
    const retryAfterHeader = error.response?.headers?.['retry-after'];
    const retryAfterSeconds =
      typeof retryAfterHeader === 'string' && Number.isFinite(Number(retryAfterHeader))
        ? Number(retryAfterHeader)
        : undefined;

    if (isApiErrorEnvelope(error.response?.data)) {
      const apiError = error.response.data.error;
      return new FrontendApiError({
        code: apiError.code,
        message: apiError.message,
        statusCode,
        details: apiError.details,
        retryAfterSeconds,
      });
    }

    if (error.code === 'ECONNABORTED') {
      return new FrontendApiError({
        code: 'NETWORK_TIMEOUT',
        message: 'Waktu tunggu koneksi ke server habis.',
        statusCode: 0,
      });
    }

    if (!error.response) {
      return new FrontendApiError({
        code: 'NETWORK_ERROR',
        message: 'Tidak dapat terhubung ke server Istana Buah.',
        statusCode: 0,
      });
    }

    return new FrontendApiError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Terjadi gangguan pada layanan server.',
      statusCode,
      retryAfterSeconds,
    });
  }

  return new FrontendApiError({
    code: ERROR_CODES.INTERNAL_ERROR,
    message: error instanceof Error ? error.message : 'Terjadi kesalahan tidak terduga.',
    statusCode: 0,
  });
}

function extractLockedUntilMinutes(details: unknown): number | null {
  if (typeof details !== 'object' || details === null) {
    return null;
  }
  const record = details as Record<string, unknown>;
  if (typeof record.remainingSeconds === 'number' && record.remainingSeconds > 0) {
    return Math.max(1, Math.ceil(record.remainingSeconds / 60));
  }
  if (typeof record.lockedUntil === 'string') {
    const unlockMs = Date.parse(record.lockedUntil);
    if (!Number.isNaN(unlockMs)) {
      const diffMs = unlockMs - Date.now();
      if (diffMs > 0) {
        return Math.max(1, Math.ceil(diffMs / 60_000));
      }
    }
  }
  return null;
}

export function resolveAuthErrorCopy(error: unknown): AuthErrorCopy {
  const normalized = normalizeApiError(error);

  switch (normalized.code) {
    case ERROR_CODES.INVALID_CREDENTIALS:
      return {
        title: 'Username atau password belum sesuai',
        description:
          'Periksa kembali ejaan username serta huruf besar-kecil password Anda. Setelah 5x percobaan gagal, akun dikunci 15 menit—hubungi Manajer/Owner bila lupa password.',
      };

    case ERROR_CODES.ACCOUNT_LOCKED: {
      const waitMinutes = extractLockedUntilMinutes(normalized.details);
      const durationText = waitMinutes ? `sekitar ${String(waitMinutes)} menit` : '15 menit';
      return {
        title: 'Akun dikunci sementara demi keamanan',
        description: `Terdeteksi 5 percobaan login gagal berturut-turut. Tunggu ${durationText} atau hubungi Manajer/Owner untuk bantuan pembukaan akun.`,
      };
    }

    case ERROR_CODES.ACCOUNT_INACTIVE:
      return {
        title: 'Akun pegawai sedang tidak aktif',
        description: 'Hubungi Manajer atau Owner toko untuk mengaktifkan kembali akses akun Anda.',
      };

    case ERROR_CODES.RATE_LIMITED: {
      const waitSec = normalized.retryAfterSeconds ?? 60;
      return {
        title: 'Terlalu banyak permintaan login',
        description: `Sistem membatasi percobaan masuk demi keamanan. Silakan tunggu ${String(waitSec)} detik sebelum mencoba lagi.`,
      };
    }

    case 'NETWORK_TIMEOUT':
    case 'NETWORK_ERROR':
      return {
        title: 'Koneksi ke server belum tersedia',
        description:
          'Pastikan jaringan Wi-Fi/LAN toko terhubung dan server aktif, lalu tekan tombol MASUK kembali.',
      };

    default:
      return {
        title: 'Gagal memproses autentikasi',
        description:
          normalized.message || 'Silakan ulangi beberapa saat lagi atau hubungi pengelola sistem.',
      };
  }
}
