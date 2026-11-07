import bcrypt from 'bcrypt';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

/**
 * Validasi kekuatan password sesuai Bagian 14.2:
 * minimal 8 karakter, huruf besar, huruf kecil, dan angka.
 */
const strongPasswordSchema = z
  .string()
  .min(8, 'Password minimal 8 karakter')
  .regex(/[A-Z]/, 'Password wajib mengandung huruf besar')
  .regex(/[a-z]/, 'Password wajib mengandung huruf kecil')
  .regex(/[0-9]/, 'Password wajib mengandung angka');

const seedEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ALLOW_PRODUCTION_SEED: z.string().optional(),
  BCRYPT_ROUNDS: z.coerce.number().int().min(12).max(16),
  APP_NAME: z.string().min(1),
  DEFAULT_TIMEZONE: z.string().min(1),
  TAX_PERCENTAGE: z.coerce.number().min(0).max(100),
  LOW_STOCK_DEFAULT_THRESHOLD: z.coerce.number().positive(),
  RECEIPT_FOOTER: z.string().min(1),
  SEED_OWNER_USERNAME: z.string().min(3).max(50),
  SEED_OWNER_PASSWORD: strongPasswordSchema,
  SEED_OWNER_FULLNAME: z.string().min(1),
  SEED_MANAGER_USERNAME: z.string().min(3).max(50),
  SEED_MANAGER_PASSWORD: strongPasswordSchema,
  SEED_MANAGER_FULLNAME: z.string().min(1),
  SEED_CASHIER_USERNAME: z.string().min(3).max(50),
  SEED_CASHIER_PASSWORD: strongPasswordSchema,
  SEED_CASHIER_FULLNAME: z.string().min(1),
});

export type SeedConfig = z.infer<typeof seedEnvSchema>;

export interface SeedResult {
  categoriesCount: number;
  usersCount: number;
  configsCount: number;
}

const DEFAULT_CATEGORIES: ReadonlyArray<{
  name: string;
  description: string;
  sortOrder: number;
}> = [
  {
    name: 'Buah Tropis',
    description: 'Mangga, pepaya, pisang, nanas, dan buah tropis segar',
    sortOrder: 1,
  },
  {
    name: 'Buah Import',
    description: 'Apel Fuji, anggur, pir, jeruk import berkualitas',
    sortOrder: 2,
  },
  {
    name: 'Buah Lokal',
    description: 'Salak, jeruk lokal, semangka, melon nusantara',
    sortOrder: 3,
  },
  {
    name: 'Buah Potong & Parsel',
    description: 'Buah potong siap saji dan parsel buah',
    sortOrder: 4,
  },
  {
    name: 'Minuman & Olahan Buah',
    description: 'Jus buah murni dan produk olahan segar',
    sortOrder: 5,
  },
];

export function buildSeedConfig(env: NodeJS.ProcessEnv): SeedConfig {
  const parsed = seedEnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Konfigurasi seed tidak valid: ${issues}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.ALLOW_PRODUCTION_SEED !== 'true') {
    throw new Error(
      'Seed diblokir pada NODE_ENV=production tanpa ALLOW_PRODUCTION_SEED=true (OWASP A05)',
    );
  }
  return parsed.data;
}

/**
 * Menjalankan seed awal secara idempotent (`upsert`) dalam satu transaksi Prisma.
 */
export async function seedDatabase(client: PrismaClient, cfg: SeedConfig): Promise<SeedResult> {
  const [ownerHash, managerHash, cashierHash] = await Promise.all([
    bcrypt.hash(cfg.SEED_OWNER_PASSWORD, cfg.BCRYPT_ROUNDS),
    bcrypt.hash(cfg.SEED_MANAGER_PASSWORD, cfg.BCRYPT_ROUNDS),
    bcrypt.hash(cfg.SEED_CASHIER_PASSWORD, cfg.BCRYPT_ROUNDS),
  ]);

  return client.$transaction(async (tx) => {
    for (const category of DEFAULT_CATEGORIES) {
      await tx.category.upsert({
        where: { name: category.name },
        update: {
          description: category.description,
          sortOrder: category.sortOrder,
          isActive: true,
        },
        create: {
          name: category.name,
          description: category.description,
          sortOrder: category.sortOrder,
          isActive: true,
        },
      });
    }

    const seedUsers = [
      {
        username: cfg.SEED_OWNER_USERNAME,
        passwordHash: ownerHash,
        fullName: cfg.SEED_OWNER_FULLNAME,
        role: 'OWNER' as const,
      },
      {
        username: cfg.SEED_MANAGER_USERNAME,
        passwordHash: managerHash,
        fullName: cfg.SEED_MANAGER_FULLNAME,
        role: 'MANAGER' as const,
      },
      {
        username: cfg.SEED_CASHIER_USERNAME,
        passwordHash: cashierHash,
        fullName: cfg.SEED_CASHIER_FULLNAME,
        role: 'CASHIER' as const,
      },
    ];

    for (const u of seedUsers) {
      await tx.user.upsert({
        where: { username: u.username },
        update: {
          passwordHash: u.passwordHash,
          fullName: u.fullName,
          role: u.role,
          isActive: true,
        },
        create: {
          username: u.username,
          passwordHash: u.passwordHash,
          fullName: u.fullName,
          role: u.role,
          isActive: true,
        },
      });
    }

    const defaultConfigs = [
      { key: 'store_name', value: cfg.APP_NAME, description: 'Nama toko pada struk & header' },
      {
        key: 'default_timezone',
        value: cfg.DEFAULT_TIMEZONE,
        description: 'Zona waktu operasional toko',
      },
      {
        key: 'tax_percentage',
        value: String(cfg.TAX_PERCENTAGE),
        description: 'Persentase pajak transaksi (%)',
      },
      {
        key: 'low_stock_default_threshold',
        value: String(cfg.LOW_STOCK_DEFAULT_THRESHOLD),
        description: 'Batas peringatan stok minimum default',
      },
      {
        key: 'receipt_footer',
        value: cfg.RECEIPT_FOOTER,
        description: 'Catatan kaki pada struk thermal',
      },
    ];

    for (const c of defaultConfigs) {
      await tx.appConfig.upsert({
        where: { key: c.key },
        update: { value: c.value, description: c.description },
        create: { key: c.key, value: c.value, description: c.description },
      });
    }

    return {
      categoriesCount: DEFAULT_CATEGORIES.length,
      usersCount: seedUsers.length,
      configsCount: defaultConfigs.length,
    };
  });
}
