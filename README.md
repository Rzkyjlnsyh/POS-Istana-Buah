# Istana Buah POS — Sistem Kasir & Manajemen Operasional

Aplikasi Point of Sale (POS) & Manajemen Operasional **Offline-First** (PWA) untuk **Istana Buah Semarang**.

## Struktur Monorepo

- `apps/web` — Frontend PWA (React 18, Vite 5, TypeScript, Zustand, TanStack Query, Dexie.js)
- `apps/api` — Backend REST API (Node.js 20+, Express 4, TypeScript, Prisma ORM, PostgreSQL 16, Redis)
- `packages/shared` — Shared TypeScript types, konstanta domain, dan skema validasi Zod
- `docker` — Dockerfile, Nginx reverse proxy, dan Docker Compose production
- `scripts` — Utilitas development, seed database, backup, dan deployment
- `docs/PROJECT_DOCUMENTATION.md` — Spesifikasi lengkap (PRD, SRS, ERD, API, UI/UX, WBS, Security, Testing)

## Persiapan Development Lokal

```bash
# 1. Instal seluruh dependensi workspace
pnpm install

# 2. Salin konfigurasi environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 3. Nyalakan PostgreSQL 16 + Redis lokal (di terminal terpisah bila belum ada service aktif)
pnpm dev:services

# 4. Jalankan migrasi & seed data awal
pnpm db:migrate
pnpm db:seed

# 5. Jalankan API & Web bersamaan
pnpm dev
```

## Pengujian & Kualitas Kode

```bash
pnpm lint          # ESLint seluruh workspace
pnpm format:check  # Pemeriksaan format Prettier
pnpm typecheck     # TypeScript strict check
pnpm test          # Unit + Integration test (dengan coverage gate)
pnpm build         # Build seluruh paket produksi
```
