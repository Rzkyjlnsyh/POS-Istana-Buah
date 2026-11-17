import { z } from 'zod';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Batas rentang waktu filter: `YYYY-MM-DD` (hari UTC) atau ISO-8601 datetime berzona
 * (cth. `2026-11-17T00:00:00+07:00`) agar batas tanggal zona waktu toko akurat.
 */
export const rangeBoundarySchema = z
  .string()
  .trim()
  .refine(
    (value) =>
      DATE_ONLY_PATTERN.test(value)
        ? !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
        : !Number.isNaN(Date.parse(value)),
    'Format tanggal tidak valid (gunakan YYYY-MM-DD atau ISO-8601)',
  )
  .optional();
