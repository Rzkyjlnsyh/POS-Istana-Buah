# DOKUMENTASI PROYEK
# Sistem Kasir & Manajemen Operasional Istana Buah Semarang

---

> **Versi Dokumen:** 1.0.0  
> **Tanggal:** 2026-11-07  
> **Status:** Draft — Siap Review  
> **Pemilik Dokumen:** Tim Engineering Istana Buah  
> **Konfidensialitas:** Internal

---

## DAFTAR ISI

1. [Executive Summary](#1-executive-summary)
2. [Product Requirements Document (PRD)](#2-product-requirements-document-prd)
3. [Business Requirements Document (BRD)](#3-business-requirements-document-brd)
4. [Software Requirements Specification (SRS)](#4-software-requirements-specification-srs)
5. [System Architecture](#5-system-architecture)
6. [Database Design / ERD](#6-database-design--erd)
7. [API Specification](#7-api-specification)
8. [UI/UX Specification](#8-uiux-specification)
9. [User Stories](#9-user-stories)
10. [Task Breakdown / WBS](#10-task-breakdown--wbs)
11. [Development Roadmap](#11-development-roadmap)
12. [Testing Plan](#12-testing-plan)
13. [Deployment Guide](#13-deployment-guide)
14. [Security Specification](#14-security-specification)
15. [Performance & Optimization Guide](#15-performance--optimization-guide)
16. [Operational & Maintenance Guide](#16-operational--maintenance-guide)
17. [Glossary & Conventions](#17-glossary--conventions)

---

## 1. EXECUTIVE SUMMARY

### 1.1 Latar Belakang

Istana Buah Semarang adalah toko buah modern yang membutuhkan sistem informasi terintegrasi untuk menggantikan proses manual yang rentan terhadap kesalahan, kehilangan data, dan ketidakefisienan operasional. Saat ini pengelolaan transaksi, stok, pelaporan, dan manajemen pegawai dilakukan secara terpisah sehingga menyulitkan owner dalam pengambilan keputusan bisnis.

### 1.2 Tujuan Proyek

Membangun **Sistem Kasir dan Manajemen Operasional** berbasis Web App/PWA dengan arsitektur **Offline-First** yang mampu:

- Menjalankan transaksi POS (Point of Sale) dengan dukungan barcode dan printer thermal
- Mengelola produk buah berdasarkan berat (kg/gram) maupun satuan (pcs)
- Mengelola stok, supplier, penyusutan/kerusakan buah
- Mengelola pegawai, shift, dan hak akses
- Menyajikan laporan penjualan, keuntungan, dan dashboard real-time untuk owner
- Dirancang **scalable** untuk ekspansi multi-cabang di masa depan

### 1.3 Ruang Lingkup

| Modul | Deskripsi |
|-------|-----------|
| POS / Kasir | Transaksi penjualan, barcode scan, cetak struk |
| Produk & Kategori | Manajemen produk buah (berat & satuan), harga, barcode |
| Stok & Inventori | Penerimaan barang, mutasi stok, stok opname |
| Supplier | Manajemen pemasok, pembelian |
| Penyusutan | Pencatatan buah rusak, expired, susut timbang |
| Pegawai & Shift | Manajemen karyawan, jadwal, absensi shift kasir |
| Laporan | Penjualan harian/bulanan, keuntungan, stok |
| Dashboard Owner | KPI real-time, grafik, alert |
| Pengaturan Sistem | Konfigurasi toko, printer, pajak, metode bayar |

### 1.4 Stakeholder

| Peran | Nama/Grup | Kepentingan |
|-------|-----------|-------------|
| Product Owner | Pemilik Istana Buah | Profitabilitas, visibilitas bisnis |
| Manager/Admin | Staff Manajer | Kelola operasional harian |
| Kasir | Staff Kasir | Kemudahan transaksi |
| Developer | Tim Engineering | Implementasi teknis |

### 1.5 Batasan Proyek

- Sistem ini tidak mencakup e-commerce / penjualan online
- Tidak mencakup akuntansi full (hanya laporan laba rugi sederhana)
- Multi-cabang dipersiapkan arsitekturnya namun tidak diimplementasi di fase 1
- Hardware (printer, scanner) adalah tanggung jawab client

---

## 2. PRODUCT REQUIREMENTS DOCUMENT (PRD)

### 2.1 Visi Produk

> "Menghadirkan sistem operasional toko buah yang cepat, akurat, dan dapat diandalkan — bahkan tanpa koneksi internet — sehingga owner dapat fokus pada pertumbuhan bisnis."

### 2.2 Target Pengguna

#### 2.2.1 Owner / Pemilik Toko
- **Pain Points:** Tidak tahu keuntungan real-time, sulit deteksi kecurangan kasir, tidak ada laporan otomatis
- **Goals:** Dashboard bisnis lengkap, laporan otomatis, kontrol penuh dari mana saja

#### 2.2.2 Manager / Admin
- **Pain Points:** Proses stok opname manual, sulit tracking penyusutan, laporan lambat
- **Goals:** Efisiensi operasional, otomasi laporan, manajemen karyawan mudah

#### 2.2.3 Kasir
- **Pain Points:** Antrian panjang, salah hitung, sistem lambat saat internet mati
- **Goals:** Transaksi cepat, mudah digunakan, bisa bekerja offline

### 2.3 Fitur Utama (Feature Matrix)

| Fitur | Prioritas | Fase | Status |
|-------|-----------|------|--------|
| POS Transaksi (offline-first) | P0 | 1 | Planned |
| Barcode Scan (kamera & USB scanner) | P0 | 1 | Planned |
| Produk berdasarkan berat & satuan | P0 | 1 | Planned |
| Printer thermal (ESC/POS) | P0 | 1 | Planned |
| Manajemen Produk & Kategori | P0 | 1 | Planned |
| Manajemen Stok & Penerimaan Barang | P0 | 1 | Planned |
| Manajemen Supplier | P1 | 1 | Planned |
| Shift Kasir & Absensi | P1 | 1 | Planned |
| Laporan Penjualan Harian/Bulanan | P1 | 1 | Planned |
| Laporan Keuntungan | P1 | 1 | Planned |
| Pencatatan Penyusutan & Buah Rusak | P1 | 1 | Planned |
| Manajemen Pegawai & Hak Akses | P1 | 1 | Planned |
| Dashboard Owner | P1 | 1 | Planned |
| Diskon & Promosi | P2 | 2 | Planned |
| Metode Pembayaran (Cash, QRIS, Transfer) | P1 | 1 | Planned |
| PWA Installable | P1 | 1 | Planned |
| Background Sync | P1 | 1 | Planned |
| Multi-cabang | P3 | 3 | Future |
| Loyalty Program | P3 | 3 | Future |

### 2.4 Non-Functional Requirements (NFR)

| Kategori | Requirement |
|----------|-------------|
| **Performance** | Halaman load < 2 detik, transaksi commit < 500ms, API response < 300ms (p95) |
| **Availability** | Uptime 99.5%, offline mode tanpa degradasi fungsi kasir |
| **Security** | OWASP Top 10 mitigated, data encrypted at rest & in transit, audit log |
| **Scalability** | Mendukung 10+ cabang tanpa refactor arsitektur |
| **Usability** | Kasir baru bisa operasional < 30 menit training |
| **Maintainability** | Code coverage ≥ 80%, dokumentasi inline, zero hardcode config |
| **Compatibility** | Chrome/Edge/Firefox terbaru, Android PWA, min. 1366x768 |

### 2.5 Constraint & Assumption

**Constraints:**
- Budget server terbatas → gunakan VPS ekonomis yang dapat di-upgrade
- Tim developer kecil → pilih stack yang well-documented dan familiar
- Hardware existing (printer Epson TM-T82, barcode scanner USB) harus kompatibel

**Assumptions:**
- Koneksi internet tersedia sebagian besar waktu operasional
- Setiap kasir menggunakan satu perangkat dedicated (PC/tablet)
- Owner mengakses laporan via smartphone maupun desktop
- Produk memiliki satu harga jual (tidak ada harga member di fase 1)

---

## 3. BUSINESS REQUIREMENTS DOCUMENT (BRD)

### 3.1 Latar Belakang Bisnis

Istana Buah Semarang beroperasi sebagai toko buah retail dengan omset harian yang perlu dicatat dengan akurat. Permasalahan bisnis yang ada:

1. **Kebocoran pendapatan** — tidak ada kontrol real-time atas transaksi kasir
2. **Pemborosan stok** — penyusutan dan kerusakan buah tidak terdokumentasi
3. **Keputusan pembelian tidak akurat** — tidak ada data historis penjualan per produk
4. **Manajemen SDM lemah** — jam kerja dan shift kasir tidak terpantau

### 3.2 Tujuan Bisnis

| ID | Tujuan | KPI Sukses | Target |
|----|--------|------------|--------|
| BR-01 | Kurangi kesalahan transaksi | Error rate transaksi | < 0.1% |
| BR-02 | Visibilitas stok real-time | Akurasi stok vs fisik | > 98% |
| BR-03 | Efisiensi operasional kasir | Waktu per transaksi | < 90 detik |
| BR-04 | Laporan otomatis untuk keputusan | Waktu buat laporan | < 5 menit/hari |
| BR-05 | Kontrol penyusutan buah | % kerugian penyusutan | Turun 20% |
| BR-06 | Visibilitas keuntungan | Laporan laba tersedia | Harian |

### 3.3 Proses Bisnis Eksisting (As-Is)

```
[Pelanggan] → Pilih Buah → Timbang di Counter → Kasir Input Manual
           → Hitung Manual/Kalkulator → Terima Bayar → Catat Nota Kertas
           → Rekapitulasi Akhir Hari Manual → Laporan Manual Mingguan
```

### 3.4 Proses Bisnis Target (To-Be)

```
[Pelanggan] → Pilih Buah → Timbang (Terintegrasi/Manual Input Berat)
           → Kasir Scan Barcode / Pilih Produk → Sistem Hitung Otomatis
           → Pilih Metode Bayar → Print Struk Otomatis
           → Stok Terkurang Otomatis → Laporan Real-time di Dashboard
```

### 3.5 Return on Investment (ROI)

| Item | Estimasi Dampak |
|------|----------------|
| Hemat waktu laporan | 2 jam/hari × Rp 25.000 = Rp 50.000/hari |
| Kurangi kesalahan kasir | Rp 100.000–500.000/bulan |
| Kontrol stok penyusutan | 5–10% efisiensi pembelian |
| Keputusan bisnis lebih baik | Tidak terukur langsung |

### 3.6 Risiko Bisnis

| Risiko | Dampak | Probabilitas | Mitigasi |
|--------|--------|-------------|----------|
| Resistensi adopsi karyawan | Tinggi | Sedang | Training intensif, UI sederhana |
| Data hilang saat migrasi | Tinggi | Rendah | Backup & parallel run |
| Hardware tidak kompatibel | Sedang | Rendah | Test awal sebelum go-live |
| Koneksi internet putus | Sedang | Tinggi | Offline-first architecture |

---

## 4. SOFTWARE REQUIREMENTS SPECIFICATION (SRS)

### 4.1 Lingkup Sistem

Sistem ini adalah aplikasi web berbasis PWA yang berjalan di browser modern. Komponen utama:
- **Frontend PWA** — React-based, service worker, IndexedDB
- **Backend API** — RESTful API server
- **Database** — PostgreSQL (server) + IndexedDB (client/offline)
- **Background Sync** — sinkronisasi data offline ke server

### 4.2 Functional Requirements

#### 4.2.1 Modul Autentikasi & Otorisasi (AUTH)

| ID | Requirement | Prioritas |
|----|-------------|-----------|
| FR-AUTH-01 | Sistem harus mendukung login dengan username dan password | MUST |
| FR-AUTH-02 | Sistem harus mendukung role: Owner, Manager, Kasir | MUST |
| FR-AUTH-03 | Sistem harus menggunakan JWT dengan refresh token | MUST |
| FR-AUTH-04 | Sistem harus memblokir akun setelah 5 kali login gagal | MUST |
| FR-AUTH-05 | Sistem harus mencatat audit log setiap aktivitas login/logout | MUST |
| FR-AUTH-06 | Sistem harus mendukung perubahan password dengan validasi kekuatan | MUST |
| FR-AUTH-07 | Session token harus expire setelah periode inaktivitas yang dikonfigurasi | MUST |
| FR-AUTH-08 | Sistem harus mendukung PIN kasir untuk transaksi cepat di perangkat terdaftar | SHOULD |

#### 4.2.2 Modul POS / Kasir (POS)

| ID | Requirement | Prioritas |
|----|-------------|-----------|
| FR-POS-01 | Kasir harus dapat membuka sesi transaksi baru | MUST |
| FR-POS-02 | Sistem harus mendukung penambahan produk via barcode scan | MUST |
| FR-POS-03 | Sistem harus mendukung penambahan produk via pencarian nama | MUST |
| FR-POS-04 | Produk jenis "berat" harus meminta input berat dalam gram/kg | MUST |
| FR-POS-05 | Sistem harus menghitung total harga otomatis (harga × berat atau harga × qty) | MUST |
| FR-POS-06 | Kasir harus dapat menghapus/mengubah item di keranjang | MUST |
| FR-POS-07 | Sistem harus mendukung pembayaran: Tunai, QRIS, Transfer Bank | MUST |
| FR-POS-08 | Sistem harus menghitung kembalian untuk pembayaran tunai | MUST |
| FR-POS-09 | Sistem harus mencetak struk via printer thermal (ESC/POS) | MUST |
| FR-POS-10 | Transaksi harus dapat diselesaikan secara offline (data tersimpan lokal) | MUST |
| FR-POS-11 | Data offline harus tersinkronisasi ke server saat koneksi tersedia | MUST |
| FR-POS-12 | Sistem harus mendukung pembatalan/void transaksi (dengan otorisasi manager) | MUST |
| FR-POS-13 | Sistem harus mendukung input diskon per item maupun total transaksi | SHOULD |
| FR-POS-14 | Sistem harus mendukung hold/park transaksi sementara | SHOULD |
| FR-POS-15 | Sistem harus menampilkan riwayat transaksi hari ini | MUST |
| FR-POS-16 | Kasir harus dapat membuka/menutup shift dengan laporan kas | MUST |

#### 4.2.3 Modul Produk & Kategori (PROD)

| ID | Requirement | Prioritas |
|----|-------------|-----------|
| FR-PROD-01 | Admin harus dapat membuat, mengubah, menghapus (soft delete) produk | MUST |
| FR-PROD-02 | Setiap produk harus memiliki tipe: "berat" atau "satuan" | MUST |
| FR-PROD-03 | Produk "berat" harus menyimpan harga per kg | MUST |
| FR-PROD-04 | Produk "satuan" harus menyimpan harga per pcs | MUST |
| FR-PROD-05 | Sistem harus mendukung barcode per produk (generate & print) | MUST |
| FR-PROD-06 | Sistem harus mendukung multiple barcode per produk | SHOULD |
| FR-PROD-07 | Sistem harus mendukung kategori produk (Tropis, Import, Lokal, dll.) | MUST |
| FR-PROD-08 | Sistem harus mendukung gambar produk | SHOULD |
| FR-PROD-09 | Sistem harus mendukung HPP (Harga Pokok Pembelian) untuk kalkulasi margin | MUST |
| FR-PROD-10 | Sistem harus mendukung produk aktif/nonaktif | MUST |
| FR-PROD-11 | Admin harus dapat import produk dari CSV/Excel | SHOULD |
| FR-PROD-12 | Sistem harus menyimpan riwayat perubahan harga | SHOULD |

#### 4.2.4 Modul Stok & Inventori (STOCK)

| ID | Requirement | Prioritas |
|----|-------------|-----------|
| FR-STK-01 | Sistem harus mencatat penerimaan barang dari supplier | MUST |
| FR-STK-02 | Stok harus berkurang otomatis setelah setiap transaksi | MUST |
| FR-STK-03 | Sistem harus mendukung stok opname (penyesuaian stok manual) | MUST |
| FR-STK-04 | Sistem harus menampilkan peringatan stok minimum | MUST |
| FR-STK-05 | Sistem harus mencatat mutasi stok lengkap (audit trail) | MUST |
| FR-STK-06 | Sistem harus mendukung transfer stok antar lokasi (fase multi-cabang) | SHOULD |
| FR-STK-07 | Laporan stok harus dapat diexport ke PDF/Excel | MUST |
| FR-STK-08 | Sistem harus mendukung unit konversi stok (kg, gram, pcs) | MUST |

#### 4.2.5 Modul Supplier (SUPP)

| ID | Requirement | Prioritas |
|----|-------------|-----------|
| FR-SUPP-01 | Admin harus dapat membuat, mengubah, menghapus supplier | MUST |
| FR-SUPP-02 | Sistem harus mencatat pembelian/penerimaan barang per supplier | MUST |
| FR-SUPP-03 | Sistem harus mendukung hutang ke supplier dan pelunasan | SHOULD |
| FR-SUPP-04 | Sistem harus menyimpan kontak dan catatan supplier | MUST |
| FR-SUPP-05 | Laporan pembelian per supplier harus tersedia | MUST |

#### 4.2.6 Modul Penyusutan & Kerusakan (WASTE)

| ID | Requirement | Prioritas |
|----|-------------|-----------|
| FR-WST-01 | Staff harus dapat mencatat buah rusak/busuk dengan jumlah dan alasan | MUST |
| FR-WST-02 | Sistem harus mencatat penyusutan timbang (selisih timbang) | MUST |
| FR-WST-03 | Sistem harus mengurangi stok otomatis setelah pencatatan penyusutan | MUST |
| FR-WST-04 | Sistem harus menghitung kerugian nilai dari penyusutan | MUST |
| FR-WST-05 | Laporan penyusutan harian/bulanan harus tersedia | MUST |
| FR-WST-06 | Foto buah rusak dapat dilampirkan sebagai bukti | COULD |

#### 4.2.7 Modul Pegawai & Shift (HR)

| ID | Requirement | Prioritas |
|----|-------------|-----------|
| FR-HR-01 | Admin harus dapat membuat, mengubah, menonaktifkan akun pegawai | MUST |
| FR-HR-02 | Sistem harus mendukung shift kerja dengan jam masuk dan keluar | MUST |
| FR-HR-03 | Kasir harus melakukan clock-in/clock-out di awal dan akhir shift | MUST |
| FR-HR-04 | Sistem harus mencatat laporan kas per shift kasir | MUST |
| FR-HR-05 | Sistem harus mendukung jadwal shift mingguan | SHOULD |
| FR-HR-06 | Laporan absensi dan rekap shift harus tersedia | MUST |

#### 4.2.8 Modul Laporan (REPORT)

| ID | Requirement | Prioritas |
|----|-------------|-----------|
| FR-RPT-01 | Laporan penjualan harian dengan breakdown per produk | MUST |
| FR-RPT-02 | Laporan penjualan bulanan/rentang tanggal | MUST |
| FR-RPT-03 | Laporan keuntungan kotor (Penjualan - HPP - Penyusutan) | MUST |
| FR-RPT-04 | Laporan stok saat ini dan riwayat mutasi | MUST |
| FR-RPT-05 | Laporan produk terlaris (by qty dan by revenue) | MUST |
| FR-RPT-06 | Laporan penyusutan dan kerugian | MUST |
| FR-RPT-07 | Laporan per kasir dan per shift | MUST |
| FR-RPT-08 | Semua laporan dapat diexport ke PDF dan Excel | MUST |
| FR-RPT-09 | Laporan dikirim otomatis via email (opsional) | COULD |

#### 4.2.9 Modul Dashboard (DASH)

| ID | Requirement | Prioritas |
|----|-------------|-----------|
| FR-DSH-01 | Dashboard owner menampilkan omset hari ini vs kemarin | MUST |
| FR-DSH-02 | Dashboard menampilkan grafik penjualan 7/30 hari | MUST |
| FR-DSH-03 | Dashboard menampilkan produk terlaris hari ini | MUST |
| FR-DSH-04 | Dashboard menampilkan alert stok menipis | MUST |
| FR-DSH-05 | Dashboard menampilkan jumlah transaksi dan rata-rata nilai transaksi | MUST |
| FR-DSH-06 | Dashboard dapat diakses via mobile browser | MUST |

### 4.3 Non-Functional Requirements Detail

#### 4.3.1 Performance

```
NFR-PERF-01: Halaman utama POS harus load dalam < 2 detik pada koneksi 3G
NFR-PERF-02: API endpoint harus merespons dalam < 300ms untuk 95th percentile
NFR-PERF-03: Transaksi lokal (offline) harus commit dalam < 100ms
NFR-PERF-04: Sinkronisasi background tidak boleh memblokir UI
NFR-PERF-05: Aplikasi harus responsif pada perangkat dengan RAM 2GB
NFR-PERF-06: IndexedDB harus mampu menyimpan 10.000+ produk dengan performa query < 50ms
```

#### 4.3.2 Security

```
NFR-SEC-01: Semua komunikasi harus menggunakan HTTPS/TLS 1.3
NFR-SEC-02: Password harus di-hash menggunakan bcrypt (cost factor ≥ 12)
NFR-SEC-03: JWT access token expire dalam 15 menit, refresh token 7 hari
NFR-SEC-04: Semua input harus divalidasi dan disanitasi (server-side)
NFR-SEC-05: SQL injection harus dicegah dengan parameterized queries/ORM
NFR-SEC-06: XSS harus dicegah dengan Content Security Policy dan output encoding
NFR-SEC-07: CSRF protection harus diimplementasi untuk semua state-changing requests
NFR-SEC-08: Rate limiting: 100 req/menit per IP, 20 req/menit untuk auth endpoints
NFR-SEC-09: Sensitive data (harga beli, keuntungan) hanya visible untuk Owner/Manager
NFR-SEC-10: Audit log tidak dapat dihapus oleh user manapun
```

#### 4.3.3 Offline Capability

```
NFR-OFF-01: Modul POS harus berfungsi penuh tanpa koneksi internet
NFR-OFF-02: Data produk harus tersedia offline (cached di IndexedDB)
NFR-OFF-03: Transaksi offline harus tersimpan aman di IndexedDB dengan enkripsi
NFR-OFF-04: Konflik sinkronisasi harus diselesaikan dengan strategi yang terdefinisi
NFR-OFF-05: Indikator status online/offline harus selalu terlihat oleh kasir
NFR-OFF-06: Mode offline tidak boleh memblokir operasi kasir lebih dari 24 jam berturut-turut
```

---

## 5. SYSTEM ARCHITECTURE

### 5.1 Arsitektur Tingkat Tinggi (High-Level Architecture)

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  PWA (React + Vite)                                       │   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │   │
│  │  │  UI Layer   │  │ State Mgmt   │  │ Service Worker │  │   │
│  │  │  (Pages,    │  │ (Zustand +   │  │ (Workbox PWA)  │  │   │
│  │  │  Components)│  │  TanStack Q) │  │                │  │   │
│  │  └─────────────┘  └──────────────┘  └────────────────┘  │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │  Offline Layer: IndexedDB (Dexie.js) + Sync Queue   │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS / REST API
┌──────────────────────────▼──────────────────────────────────────┐
│                       SERVER LAYER                               │
│  ┌────────────┐  ┌──────────────────────────────────────────┐  │
│  │  Nginx     │  │  Node.js API Server (Express + TypeScript)│  │
│  │  (Reverse  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ │  │
│  │  Proxy +   │→ │  │ Routes   │ │Middleware│ │Services  │ │  │
│  │  Static +  │  │  │          │ │(Auth,    │ │(Business │ │  │
│  │  SSL Term) │  │  │          │ │Rate Limit│ │Logic)    │ │  │
│  └────────────┘  │  └──────────┘ └──────────┘ └──────────┘ │  │
│                  │  ┌──────────────────────────────────────┐ │  │
│                  │  │  Data Access Layer (Prisma ORM)       │ │  │
│                  │  └──────────────────────────────────────┘ │  │
│                  └──────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                      DATA LAYER                                  │
│  ┌──────────────────┐  ┌───────────────┐  ┌────────────────┐  │
│  │  PostgreSQL 16   │  │  Redis Cache  │  │  File Storage  │  │
│  │  (Primary DB)    │  │  (Sessions,   │  │  (MinIO/Local) │  │
│  │                  │  │   Rate Limit, │  │  (Gambar Prod) │  │
│  │                  │  │   Queue)      │  │                │  │
│  └──────────────────┘  └───────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Technology Stack

#### 5.2.1 Frontend

| Teknologi | Versi | Alasan Pemilihan |
|-----------|-------|-----------------|
| React | 18.x | Ekosistem besar, familiar, concurrent features |
| TypeScript | 5.x | Type safety, maintainability |
| Vite | 5.x | Build cepat, dev experience optimal |
| Zustand | 4.x | State management ringan, non-boilerplate |
| TanStack Query | 5.x | Server state, caching, background sync |
| Dexie.js | 3.x | IndexedDB wrapper yang ergonomis |
| Workbox | 7.x | Service worker, caching strategies |
| React Router | 6.x | Client-side routing |
| shadcn/ui + Tailwind | latest | Komponen UI konsisten, customizable |
| React Hook Form + Zod | latest | Form validation type-safe |
| Recharts | 2.x | Grafik laporan/dashboard |
| @zxing/library | latest | Barcode scanning via kamera |

#### 5.2.2 Backend

| Teknologi | Versi | Alasan Pemilihan |
|-----------|-------|-----------------|
| Node.js | 20 LTS | Ekosistem npm, async I/O, familiar |
| TypeScript | 5.x | Type safety end-to-end |
| Express.js | 4.x | Mature, fleksibel, luas dokumentasi |
| Prisma ORM | 5.x | Type-safe queries, migration, schema |
| PostgreSQL | 16.x | ACID compliance, JSON support, scalable |
| Redis | 7.x | Cache, rate limiting, session store |
| Zod | 3.x | Schema validation server-side |
| JWT (jose) | latest | Stateless auth, RS256 signed |
| bcrypt | latest | Password hashing |
| Winston | latest | Structured logging |
| BullMQ | latest | Queue untuk background jobs |
| Multer | latest | File upload handling |

#### 5.2.3 DevOps & Infrastructure

| Teknologi | Alasan Pemilihan |
|-----------|-----------------|
| Docker + Docker Compose | Containerisasi, environment konsisten |
| Nginx | Reverse proxy, static serve, SSL termination |
| PM2 | Node.js process manager |
| GitHub Actions | CI/CD pipeline |
| PostgreSQL Backup | pg_dump otomatis via cron |
| Certbot / Let's Encrypt | SSL certificate gratis, auto-renew |

### 5.3 Arsitektur Offline-First

```
┌──────────────────────────────────────────────────────────────┐
│                   OFFLINE-FIRST FLOW                         │
│                                                              │
│  Write Operation (Transaksi):                                │
│  UI → IndexedDB (immediate) → Sync Queue → (online?) →      │
│       Yes: POST /api/sync → Server DB                        │
│       No:  Queue persists → retry on reconnect               │
│                                                              │
│  Read Operation (Produk, dll):                               │
│  UI → IndexedDB first → (stale?) →                          │
│       No: return cached                                       │
│       Yes: fetch from server → update IndexedDB → return    │
│                                                              │
│  Conflict Resolution:                                        │
│  Server timestamp > Client timestamp → Server wins          │
│  Transaksi offline: append-only → no conflict               │
└──────────────────────────────────────────────────────────────┘
```

### 5.4 Struktur Direktori Proyek

```
istana-buah/
├── apps/
│   ├── web/                          # Frontend PWA
│   │   ├── public/
│   │   │   ├── manifest.json
│   │   │   └── icons/
│   │   ├── src/
│   │   │   ├── assets/
│   │   │   ├── components/           # Shared UI components
│   │   │   │   ├── ui/               # shadcn/ui base components
│   │   │   │   ├── common/           # App-specific reusable components
│   │   │   │   └── layout/           # Layout components
│   │   │   ├── features/             # Feature-based modules
│   │   │   │   ├── auth/
│   │   │   │   ├── pos/
│   │   │   │   ├── products/
│   │   │   │   ├── stock/
│   │   │   │   ├── suppliers/
│   │   │   │   ├── waste/
│   │   │   │   ├── employees/
│   │   │   │   ├── reports/
│   │   │   │   └── dashboard/
│   │   │   ├── hooks/                # Custom React hooks
│   │   │   ├── lib/                  # Utilities, helpers
│   │   │   │   ├── api/              # API client (axios instance)
│   │   │   │   ├── db/               # Dexie.js IndexedDB
│   │   │   │   ├── sync/             # Sync queue manager
│   │   │   │   ├── printer/          # ESC/POS printer utility
│   │   │   │   └── barcode/          # Barcode utilities
│   │   │   ├── routes/               # Route definitions
│   │   │   ├── stores/               # Zustand stores
│   │   │   ├── types/                # TypeScript types/interfaces
│   │   │   ├── config/               # App configuration (env-based)
│   │   │   ├── sw.ts                 # Service worker entry
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── .env.example
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── api/                          # Backend API
│       ├── src/
│       │   ├── config/               # Configuration (env-based)
│       │   │   ├── app.config.ts
│       │   │   ├── database.config.ts
│       │   │   └── redis.config.ts
│       │   ├── modules/              # Feature modules
│       │   │   ├── auth/
│       │   │   │   ├── auth.controller.ts
│       │   │   │   ├── auth.service.ts
│       │   │   │   ├── auth.routes.ts
│       │   │   │   └── auth.dto.ts
│       │   │   ├── products/
│       │   │   ├── transactions/
│       │   │   ├── stock/
│       │   │   ├── suppliers/
│       │   │   ├── waste/
│       │   │   ├── employees/
│       │   │   ├── shifts/
│       │   │   ├── reports/
│       │   │   └── sync/
│       │   ├── middleware/
│       │   │   ├── authenticate.ts
│       │   │   ├── authorize.ts
│       │   │   ├── rateLimiter.ts
│       │   │   ├── errorHandler.ts
│       │   │   ├── requestLogger.ts
│       │   │   └── validate.ts
│       │   ├── lib/
│       │   │   ├── prisma.ts         # Prisma client singleton
│       │   │   ├── redis.ts          # Redis client singleton
│       │   │   ├── logger.ts         # Winston logger
│       │   │   ├── queue.ts          # BullMQ queues
│       │   │   └── mailer.ts         # Email utility (optional)
│       │   ├── types/
│       │   ├── utils/
│       │   └── app.ts                # Express app setup
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/
│       ├── tests/
│       │   ├── unit/
│       │   ├── integration/
│       │   └── e2e/
│       ├── .env.example
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   └── shared/                       # Shared types & utils
│       ├── src/
│       │   ├── types/                # Shared TypeScript types
│       │   ├── constants/            # Shared constants
│       │   └── validators/           # Shared Zod schemas
│       └── package.json
│
├── docker/
│   ├── Dockerfile.web
│   ├── Dockerfile.api
│   ├── nginx.conf
│   └── docker-compose.yml
│
├── scripts/
│   ├── backup.sh
│   ├── deploy.sh
│   └── seed.ts
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
│
├── docs/                             # Dokumentasi ini
└── README.md
```

### 5.5 Module Dependency Graph

```
                    ┌──────────┐
                    │  AUTH    │
                    └────┬─────┘
                         │ depends all modules
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    ┌─────────┐    ┌──────────┐    ┌──────────┐
    │PRODUCTS │    │  STOCK   │◄───│SUPPLIERS │
    └────┬────┘    └────┬─────┘    └──────────┘
         │              │
         ▼              ▼
    ┌─────────┐    ┌──────────┐
    │  POS    │───►│  WASTE   │
    └────┬────┘    └────┬─────┘
         │              │
         └──────┬───────┘
                ▼
         ┌────────────┐
         │  REPORTS   │◄── EMPLOYEES / SHIFTS
         └─────┬──────┘
               ▼
         ┌──────────┐
         │DASHBOARD │
         └──────────┘
```

### 5.6 Data Flow — Transaksi Offline

```
Kasir membuat transaksi (OFFLINE):
1. UI input produk → Zustand cart state
2. Submit → IndexedDB transactions table (status: "pending")
3. IndexedDB stock table dikurangi secara lokal
4. Struk dicetak dari data lokal
5. SyncQueue.push({ type: "TRANSACTION", data: txn })

Ketika online:
6. SyncManager deteksi online event
7. Dequeue semua pending → POST /api/sync/batch
8. Server validate & commit ke PostgreSQL
9. Server return { success: [], conflicts: [] }
10. IndexedDB update status → "synced"
11. Konflik (jika ada) → ditampilkan ke manager untuk resolusi manual
```

---

## 6. DATABASE DESIGN / ERD

### 6.1 Konvensi Penamaan

- Tabel: `snake_case` (jamak), misal `products`, `transactions`
- Kolom: `snake_case`, misal `created_at`, `unit_price`
- Primary Key: `id` UUID v4 (kecuali tabel lookup yang menggunakan serial)
- Timestamp: Semua tabel memiliki `created_at` dan `updated_at`
- Soft delete: Kolom `deleted_at TIMESTAMPTZ NULL`

### 6.2 Schema Prisma (Definisi Database)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ═══════════════════════════════════════
// AUTHENTICATION & USERS
// ═══════════════════════════════════════

enum UserRole {
  OWNER
  MANAGER
  CASHIER
}

model User {
  id              String    @id @default(uuid())
  username        String    @unique
  passwordHash    String    @map("password_hash")
  fullName        String    @map("full_name")
  role            UserRole
  phoneNumber     String?   @map("phone_number")
  isActive        Boolean   @default(true) @map("is_active")
  loginAttempts   Int       @default(0) @map("login_attempts")
  lockedUntil     DateTime? @map("locked_until")
  lastLoginAt     DateTime? @map("last_login_at")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  deletedAt       DateTime? @map("deleted_at")

  refreshTokens   RefreshToken[]
  shifts          Shift[]
  transactions    Transaction[]
  stockOpnames    StockOpname[]
  wasteRecords    WasteRecord[]
  auditLogs       AuditLog[]

  @@map("users")
}

model RefreshToken {
  id          String    @id @default(uuid())
  userId      String    @map("user_id")
  tokenHash   String    @unique @map("token_hash")
  deviceInfo  String?   @map("device_info")
  expiresAt   DateTime  @map("expires_at")
  revokedAt   DateTime? @map("revoked_at")
  createdAt   DateTime  @default(now()) @map("created_at")

  user        User      @relation(fields: [userId], references: [id])

  @@index([userId])
  @@map("refresh_tokens")
}

// ═══════════════════════════════════════
// PRODUCTS & CATEGORIES
// ═══════════════════════════════════════

enum ProductType {
  WEIGHT   // Dijual per kg/gram
  UNIT     // Dijual per satuan/pcs
}

model Category {
  id          String    @id @default(uuid())
  name        String    @unique
  description String?
  sortOrder   Int       @default(0) @map("sort_order")
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")

  products    Product[]

  @@map("categories")
}

model Product {
  id              String      @id @default(uuid())
  categoryId      String      @map("category_id")
  name            String
  description     String?
  productType     ProductType @map("product_type")
  pricePerKg      Decimal?    @map("price_per_kg") @db.Decimal(12, 2)
  pricePerUnit    Decimal?    @map("price_per_unit") @db.Decimal(12, 2)
  costPerKg       Decimal?    @map("cost_per_kg") @db.Decimal(12, 2)   // HPP per kg
  costPerUnit     Decimal?    @map("cost_per_unit") @db.Decimal(12, 2) // HPP per pcs
  stockQty        Decimal     @default(0) @map("stock_qty") @db.Decimal(12, 3) // kg atau pcs
  minStockAlert   Decimal?    @map("min_stock_alert") @db.Decimal(12, 3)
  imageUrl        String?     @map("image_url")
  isActive        Boolean     @default(true) @map("is_active")
  createdAt       DateTime    @default(now()) @map("created_at")
  updatedAt       DateTime    @updatedAt @map("updated_at")
  deletedAt       DateTime?   @map("deleted_at")

  category        Category    @relation(fields: [categoryId], references: [id])
  barcodes        Barcode[]
  transactionItems TransactionItem[]
  stockMovements  StockMovement[]
  priceHistories  PriceHistory[]
  wasteRecords    WasteRecord[]

  @@index([categoryId])
  @@index([isActive])
  @@map("products")
}

model Barcode {
  id          String    @id @default(uuid())
  productId   String    @map("product_id")
  barcode     String    @unique
  isPrimary   Boolean   @default(false) @map("is_primary")
  createdAt   DateTime  @default(now()) @map("created_at")

  product     Product   @relation(fields: [productId], references: [id])

  @@index([barcode])
  @@index([productId])
  @@map("barcodes")
}

model PriceHistory {
  id              String    @id @default(uuid())
  productId       String    @map("product_id")
  oldPrice        Decimal   @map("old_price") @db.Decimal(12, 2)
  newPrice        Decimal   @map("new_price") @db.Decimal(12, 2)
  priceType       String    @map("price_type") // "sell_per_kg", "sell_per_unit", "cost_per_kg", etc.
  changedBy       String    @map("changed_by")
  reason          String?
  createdAt       DateTime  @default(now()) @map("created_at")

  product         Product   @relation(fields: [productId], references: [id])

  @@index([productId])
  @@map("price_histories")
}

// ═══════════════════════════════════════
// SUPPLIERS
// ═══════════════════════════════════════

model Supplier {
  id              String    @id @default(uuid())
  name            String
  contactPerson   String?   @map("contact_person")
  phoneNumber     String?   @map("phone_number")
  address         String?
  notes           String?
  isActive        Boolean   @default(true) @map("is_active")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  deletedAt       DateTime? @map("deleted_at")

  purchaseOrders  PurchaseOrder[]

  @@map("suppliers")
}

model PurchaseOrder {
  id              String              @id @default(uuid())
  supplierId      String              @map("supplier_id")
  referenceNo     String?             @map("reference_no")
  totalAmount     Decimal             @map("total_amount") @db.Decimal(14, 2)
  paidAmount      Decimal             @default(0) @map("paid_amount") @db.Decimal(14, 2)
  status          PurchaseOrderStatus @default(PENDING)
  notes           String?
  deliveredAt     DateTime?           @map("delivered_at")
  createdBy       String              @map("created_by")
  createdAt       DateTime            @default(now()) @map("created_at")
  updatedAt       DateTime            @updatedAt @map("updated_at")

  supplier        Supplier            @relation(fields: [supplierId], references: [id])
  items           PurchaseOrderItem[]

  @@index([supplierId])
  @@index([status])
  @@map("purchase_orders")
}

enum PurchaseOrderStatus {
  PENDING
  RECEIVED
  PARTIAL
  CANCELLED
}

model PurchaseOrderItem {
  id              String        @id @default(uuid())
  purchaseOrderId String        @map("purchase_order_id")
  productId       String        @map("product_id")
  quantity        Decimal       @db.Decimal(12, 3)
  unitCost        Decimal       @map("unit_cost") @db.Decimal(12, 2)
  totalCost       Decimal       @map("total_cost") @db.Decimal(14, 2)
  createdAt       DateTime      @default(now()) @map("created_at")

  purchaseOrder   PurchaseOrder @relation(fields: [purchaseOrderId], references: [id])

  @@index([purchaseOrderId])
  @@map("purchase_order_items")
}

// ═══════════════════════════════════════
// TRANSACTIONS (POS)
// ═══════════════════════════════════════

enum TransactionStatus {
  PENDING      // Belum selesai / draft
  COMPLETED    // Selesai
  VOIDED       // Dibatalkan
  PENDING_SYNC // Offline, belum sync
}

enum PaymentMethod {
  CASH
  QRIS
  BANK_TRANSFER
  MIXED
}

model Transaction {
  id              String              @id @default(uuid())
  transactionNo   String              @unique @map("transaction_no")
  shiftId         String?             @map("shift_id")
  cashierId       String              @map("cashier_id")
  status          TransactionStatus   @default(PENDING)
  subtotal        Decimal             @db.Decimal(14, 2)
  discountAmount  Decimal             @default(0) @map("discount_amount") @db.Decimal(14, 2)
  taxAmount       Decimal             @default(0) @map("tax_amount") @db.Decimal(14, 2)
  totalAmount     Decimal             @map("total_amount") @db.Decimal(14, 2)
  paymentMethod   PaymentMethod       @map("payment_method")
  amountPaid      Decimal             @map("amount_paid") @db.Decimal(14, 2)
  changeAmount    Decimal             @default(0) @map("change_amount") @db.Decimal(14, 2)
  notes           String?
  voidedBy        String?             @map("voided_by")
  voidedAt        DateTime?           @map("voided_at")
  voidReason      String?             @map("void_reason")
  clientId        String?             @map("client_id") // ID unik dari device untuk dedup offline
  syncedAt        DateTime?           @map("synced_at")
  transactedAt    DateTime            @default(now()) @map("transacted_at") // Waktu transaksi sebenarnya
  createdAt       DateTime            @default(now()) @map("created_at")
  updatedAt       DateTime            @updatedAt @map("updated_at")

  cashier         User                @relation(fields: [cashierId], references: [id])
  shift           Shift?              @relation(fields: [shiftId], references: [id])
  items           TransactionItem[]

  @@index([cashierId])
  @@index([shiftId])
  @@index([status])
  @@index([transactedAt])
  @@index([clientId]) // Untuk idempotency offline sync
  @@map("transactions")
}

model TransactionItem {
  id              String      @id @default(uuid())
  transactionId   String      @map("transaction_id")
  productId       String      @map("product_id")
  productName     String      @map("product_name")  // Snapshot nama saat transaksi
  productType     ProductType @map("product_type")
  quantity        Decimal     @db.Decimal(12, 3)    // Dalam kg atau pcs
  unitPrice       Decimal     @map("unit_price") @db.Decimal(12, 2)
  unitCost        Decimal     @default(0) @map("unit_cost") @db.Decimal(12, 2) // Snapshot HPP
  discountAmount  Decimal     @default(0) @map("discount_amount") @db.Decimal(12, 2)
  lineTotal       Decimal     @map("line_total") @db.Decimal(14, 2)
  createdAt       DateTime    @default(now()) @map("created_at")

  transaction     Transaction @relation(fields: [transactionId], references: [id])
  product         Product     @relation(fields: [productId], references: [id])

  @@index([transactionId])
  @@index([productId])
  @@map("transaction_items")
}

// ═══════════════════════════════════════
// STOCK MANAGEMENT
// ═══════════════════════════════════════

enum StockMovementType {
  PURCHASE_IN       // Barang masuk dari supplier
  SALE_OUT          // Keluar karena penjualan
  WASTE_OUT         // Keluar karena rusak/susut
  OPNAME_ADJUST     // Penyesuaian stok opname
  RETURN_IN         // Barang dikembalikan dari pelanggan
  TRANSFER_IN       // Masuk dari cabang lain (fase 2)
  TRANSFER_OUT      // Keluar ke cabang lain (fase 2)
  INITIAL           // Stok awal sistem
}

model StockMovement {
  id              String            @id @default(uuid())
  productId       String            @map("product_id")
  movementType    StockMovementType @map("movement_type")
  quantity        Decimal           @db.Decimal(12, 3)  // positif = masuk, negatif = keluar
  balanceBefore   Decimal           @map("balance_before") @db.Decimal(12, 3)
  balanceAfter    Decimal           @map("balance_after") @db.Decimal(12, 3)
  referenceId     String?           @map("reference_id")  // ID transaksi/PO/opname terkait
  referenceType   String?           @map("reference_type") // "TRANSACTION", "PURCHASE_ORDER", etc.
  notes           String?
  createdBy       String            @map("created_by")
  createdAt       DateTime          @default(now()) @map("created_at")

  product         Product           @relation(fields: [productId], references: [id])

  @@index([productId])
  @@index([movementType])
  @@index([createdAt])
  @@index([referenceId, referenceType])
  @@map("stock_movements")
}

model StockOpname {
  id              String    @id @default(uuid())
  referenceNo     String    @unique @map("reference_no")
  notes           String?
  status          String    @default("DRAFT") // DRAFT, COMPLETED
  conductedBy     String    @map("conducted_by")
  completedAt     DateTime? @map("completed_at")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  conductor       User      @relation(fields: [conductedBy], references: [id])
  items           StockOpnameItem[]

  @@map("stock_opnames")
}

model StockOpnameItem {
  id              String      @id @default(uuid())
  opnameId        String      @map("opname_id")
  productId       String      @map("product_id")
  systemQty       Decimal     @map("system_qty") @db.Decimal(12, 3)
  physicalQty     Decimal     @map("physical_qty") @db.Decimal(12, 3)
  difference      Decimal     @db.Decimal(12, 3) // physicalQty - systemQty
  notes           String?
  createdAt       DateTime    @default(now()) @map("created_at")

  opname          StockOpname @relation(fields: [opnameId], references: [id])

  @@index([opnameId])
  @@map("stock_opname_items")
}

// ═══════════════════════════════════════
// WASTE RECORDS
// ═══════════════════════════════════════

enum WasteType {
  ROTTEN      // Busuk/rusak
  EXPIRED     // Kadaluarsa
  SHRINKAGE   // Susut timbang alami
  DAMAGED     // Rusak fisik
  OTHER
}

model WasteRecord {
  id              String    @id @default(uuid())
  productId       String    @map("product_id")
  wasteType       WasteType @map("waste_type")
  quantity        Decimal   @db.Decimal(12, 3)
  estimatedCost   Decimal   @map("estimated_cost") @db.Decimal(14, 2) // Kerugian nilai
  reason          String?
  photoUrl        String?   @map("photo_url")
  recordedBy      String    @map("recorded_by")
  recordedAt      DateTime  @default(now()) @map("recorded_at")
  createdAt       DateTime  @default(now()) @map("created_at")

  product         Product   @relation(fields: [productId], references: [id])
  recorder        User      @relation(fields: [recordedBy], references: [id])

  @@index([productId])
  @@index([recordedAt])
  @@map("waste_records")
}

// ═══════════════════════════════════════
// SHIFT MANAGEMENT
// ═══════════════════════════════════════

enum ShiftStatus {
  OPEN
  CLOSED
}

model Shift {
  id                  String      @id @default(uuid())
  userId              String      @map("user_id")
  shiftNo             String      @unique @map("shift_no")
  status              ShiftStatus @default(OPEN)
  openedAt            DateTime    @default(now()) @map("opened_at")
  closedAt            DateTime?   @map("closed_at")
  openingCash         Decimal     @map("opening_cash") @db.Decimal(14, 2)
  closingCash         Decimal?    @map("closing_cash") @db.Decimal(14, 2)
  expectedCash        Decimal?    @map("expected_cash") @db.Decimal(14, 2)
  cashDifference      Decimal?    @map("cash_difference") @db.Decimal(14, 2)
  totalSales          Decimal     @default(0) @map("total_sales") @db.Decimal(14, 2)
  totalTransactions   Int         @default(0) @map("total_transactions")
  notes               String?
  createdAt           DateTime    @default(now()) @map("created_at")
  updatedAt           DateTime    @updatedAt @map("updated_at")

  user                User        @relation(fields: [userId], references: [id])
  transactions        Transaction[]

  @@index([userId])
  @@index([status])
  @@map("shifts")
}

// ═══════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════

model AppConfig {
  id          String    @id @default(uuid())
  key         String    @unique
  value       String
  description String?
  updatedBy   String?   @map("updated_by")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  @@map("app_configs")
}

// ═══════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════

model AuditLog {
  id          String    @id @default(uuid())
  userId      String?   @map("user_id")
  action      String
  entity      String
  entityId    String?   @map("entity_id")
  oldValues   Json?     @map("old_values")
  newValues   Json?     @map("new_values")
  ipAddress   String?   @map("ip_address")
  userAgent   String?   @map("user_agent")
  createdAt   DateTime  @default(now()) @map("created_at")

  user        User?     @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([entity, entityId])
  @@index([createdAt])
  @@map("audit_logs")
}
```

### 6.3 ERD Diagram (Tekstual)

```
USERS ──────────────────────────────────────────────────────
  │ 1:N RefreshTokens
  │ 1:N Shifts
  │ 1:N Transactions (sebagai cashier)
  │ 1:N StockOpnames (sebagai conductor)
  │ 1:N WasteRecords (sebagai recorder)
  │ 1:N AuditLogs
  └─────────────────────────────────────────────────────────

CATEGORIES ──────────────────────────────────────────────────
  │ 1:N Products
  └─────────────────────────────────────────────────────────

PRODUCTS ────────────────────────────────────────────────────
  │ 1:N Barcodes
  │ 1:N TransactionItems
  │ 1:N StockMovements
  │ 1:N PriceHistories
  │ 1:N WasteRecords
  │ 1:N StockOpnameItems
  └─────────────────────────────────────────────────────────

SUPPLIERS ───────────────────────────────────────────────────
  │ 1:N PurchaseOrders
  └─────────────────────────────────────────────────────────

PURCHASE_ORDERS ──────────────────────────────────────────────
  │ 1:N PurchaseOrderItems → Products

TRANSACTIONS ────────────────────────────────────────────────
  │ N:1 Users (cashier)
  │ N:1 Shifts
  │ 1:N TransactionItems → Products
  └─────────────────────────────────────────────────────────

SHIFTS ──────────────────────────────────────────────────────
  │ N:1 Users
  │ 1:N Transactions
  └─────────────────────────────────────────────────────────

STOCK_MOVEMENTS → Products (audit trail)
WASTE_RECORDS → Products, Users
STOCK_OPNAMES → Users, StockOpnameItems → Products
```

### 6.4 Indeks Database Penting

```sql
-- Performa pencarian produk
CREATE INDEX idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX idx_barcodes_barcode ON barcodes (barcode);

-- Performa laporan transaksi
CREATE INDEX idx_transactions_transacted_at ON transactions (transacted_at);
CREATE INDEX idx_transactions_cashier_date ON transactions (cashier_id, transacted_at);
CREATE INDEX idx_transaction_items_product_date
  ON transaction_items (product_id) INCLUDE (quantity, line_total);

-- Performa laporan stok
CREATE INDEX idx_stock_movements_product_date ON stock_movements (product_id, created_at);

-- Performa audit log
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity, entity_id, created_at);
```

---

## 7. API SPECIFICATION

### 7.1 Konvensi API

```
Base URL    : https://api.istanabuah.com/v1
Auth        : Bearer Token (JWT) di header Authorization
Content-Type: application/json
Encoding    : UTF-8

Response envelope:
{
  "success": true|false,
  "data": {...} | [...],
  "message": "...",
  "meta": { "page": 1, "limit": 20, "total": 100 }  // untuk list
}

Error envelope:
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Deskripsi error",
    "details": [...]  // field errors
  }
}

HTTP Status Codes:
200 OK           - Success read/update
201 Created      - Success create
204 No Content   - Success delete
400 Bad Request  - Validation error
401 Unauthorized - Tidak ter-autentikasi
403 Forbidden    - Tidak ter-otorisasi
404 Not Found    - Resource tidak ditemukan
409 Conflict     - Duplicate/conflict data
422 Unprocessable - Business logic error
429 Too Many Requests - Rate limit
500 Internal Server Error
```

### 7.2 Endpoint Autentikasi

#### POST /auth/login
```
Body:
{
  "username": "kasir01",
  "password": "password123"
}

Response 200:
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "user": {
      "id": "uuid",
      "username": "kasir01",
      "fullName": "Budi Santoso",
      "role": "CASHIER"
    }
  }
}
```

#### POST /auth/refresh
```
Body: { "refreshToken": "eyJ..." }
Response 200: { "accessToken": "eyJ..." }
```

#### POST /auth/logout
```
Auth: Bearer token
Body: { "refreshToken": "eyJ..." }
Response 200: { "success": true }
```

#### PUT /auth/change-password
```
Auth: Bearer token
Body: {
  "currentPassword": "...",
  "newPassword": "...",
  "confirmPassword": "..."
}
```

### 7.3 Endpoint Produk

#### GET /products
```
Auth: Bearer (all roles)
Query params:
  ?search=mangga     - Pencarian nama/barcode
  ?categoryId=uuid   - Filter kategori
  ?type=WEIGHT|UNIT  - Filter tipe
  ?isActive=true     - Filter status
  ?page=1&limit=20   - Paginasi
  ?lowStock=true     - Hanya produk stok menipis

Response 200:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Mangga Harum Manis",
      "category": { "id": "uuid", "name": "Tropis" },
      "productType": "WEIGHT",
      "pricePerKg": "25000.00",
      "costPerKg": "18000.00",
      "stockQty": "15.500",
      "minStockAlert": "5.000",
      "barcodes": [{ "barcode": "8991234567890", "isPrimary": true }],
      "imageUrl": null,
      "isActive": true
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 85 }
}
```

#### POST /products
```
Auth: Bearer (MANAGER, OWNER)
Body:
{
  "name": "Mangga Harum Manis",
  "categoryId": "uuid",
  "productType": "WEIGHT",
  "pricePerKg": 25000,
  "costPerKg": 18000,
  "minStockAlert": 5,
  "barcodes": ["8991234567890"],
  "isActive": true
}
```

#### GET /products/:id
#### PUT /products/:id
#### DELETE /products/:id (soft delete)

#### GET /products/barcode/:barcode
```
Auth: Bearer (all roles)
Response 200: { "success": true, "data": { ...product } }
Response 404: { "success": false, "error": { "code": "PRODUCT_NOT_FOUND" } }
```

### 7.4 Endpoint Transaksi

#### POST /transactions
```
Auth: Bearer (CASHIER, MANAGER, OWNER)
Body:
{
  "clientId": "device-uuid-txn-uuid",  // Untuk idempotency
  "shiftId": "uuid",
  "items": [
    {
      "productId": "uuid",
      "quantity": 1.5,          // kg untuk WEIGHT, pcs untuk UNIT
      "unitPrice": 25000,
      "discountAmount": 0
    }
  ],
  "discountAmount": 0,
  "paymentMethod": "CASH",
  "amountPaid": 40000,
  "notes": "",
  "transactedAt": "2026-11-07T10:30:00+07:00"  // Waktu di device
}

Response 201:
{
  "success": true,
  "data": {
    "id": "uuid",
    "transactionNo": "TRX-20261107-0001",
    "totalAmount": "37500.00",
    "changeAmount": "2500.00",
    "receiptData": { ... }  // Data untuk cetak struk
  }
}
```

#### GET /transactions
```
Query: ?startDate=2026-11-01&endDate=2026-11-07&cashierId=uuid&shiftId=uuid&page=1&limit=50
```

#### GET /transactions/:id
#### PUT /transactions/:id/void
```
Auth: Bearer (MANAGER, OWNER)
Body: { "reason": "Alasan void" }
```

### 7.5 Endpoint Shift

#### POST /shifts/open
```
Body: { "openingCash": 500000 }
Response 201: { "data": { "id": "uuid", "shiftNo": "SHIFT-20261107-001", ... } }
```

#### PUT /shifts/:id/close
```
Body: { "closingCash": 1250000, "notes": "..." }
Response 200: { "data": { ...shift, "cashDifference": "...", "summary": {...} } }
```

#### GET /shifts
#### GET /shifts/:id

### 7.6 Endpoint Stok

#### POST /stock/receive (Penerimaan Barang)
```
Auth: Bearer (MANAGER, OWNER)
Body:
{
  "purchaseOrderId": "uuid",  // opsional
  "supplierId": "uuid",
  "items": [
    { "productId": "uuid", "quantity": 50, "unitCost": 18000 }
  ],
  "notes": "Penerimaan rutin"
}
```

#### POST /stock/opname
```
Auth: Bearer (MANAGER, OWNER)
Body:
{
  "items": [
    { "productId": "uuid", "physicalQty": 14.5 }
  ],
  "notes": "Opname bulanan"
}
```

#### GET /stock/movements
```
Query: ?productId=uuid&startDate=...&endDate=...&type=SALE_OUT
```

#### GET /stock/low-alert
```
Response: Produk dengan stok di bawah minStockAlert
```

### 7.7 Endpoint Laporan

#### GET /reports/sales-summary
```
Query: ?startDate=2026-11-01&endDate=2026-11-07&groupBy=day|week|month
Response:
{
  "data": {
    "totalRevenue": "15750000.00",
    "totalTransactions": 234,
    "avgTransactionValue": "67307.69",
    "grossProfit": "4250000.00",
    "profitMargin": "26.98",
    "timeline": [
      { "date": "2026-11-01", "revenue": "2250000", "transactions": 32 }
    ]
  }
}
```

#### GET /reports/product-performance
```
Query: ?startDate=...&endDate=...&sortBy=revenue|qty&limit=10
```

#### GET /reports/waste-summary
```
Query: ?startDate=...&endDate=...
```

#### GET /reports/cashier-performance
```
Query: ?startDate=...&endDate=...
```

#### GET /reports/stock-current
```
Response: Stok semua produk saat ini dengan value
```

#### GET /reports/export/sales
```
Query: ?format=pdf|excel&startDate=...&endDate=...
Response: File download (PDF/XLSX)
```

### 7.8 Endpoint Sinkronisasi Offline

#### POST /sync/batch
```
Auth: Bearer (CASHIER, MANAGER, OWNER)
Body:
{
  "deviceId": "device-uuid",
  "operations": [
    {
      "type": "TRANSACTION",
      "clientId": "device-uuid-txn-uuid",
      "data": { ...transactionData },
      "timestamp": "2026-11-07T10:30:00Z"
    }
  ]
}

Response 200:
{
  "data": {
    "processed": 5,
    "success": [{ "clientId": "...", "serverId": "uuid" }],
    "conflicts": [{ "clientId": "...", "reason": "..." }],
    "errors": []
  }
}
```

#### GET /sync/pull
```
Query: ?since=2026-11-07T10:00:00Z&types=products,categories
Response: Data yang berubah sejak timestamp given (untuk update IndexedDB)
```

---

## 8. UI/UX SPECIFICATION

### 8.1 Design System

#### 8.1.1 Color Palette

```css
/* Primary - Green (Buah segar, alam) */
--color-primary-50:  #f0fdf4;
--color-primary-100: #dcfce7;
--color-primary-500: #22c55e;
--color-primary-600: #16a34a;  /* Primary action */
--color-primary-700: #15803d;
--color-primary-900: #14532d;

/* Semantic */
--color-success: #22c55e;
--color-warning: #f59e0b;
--color-danger:  #ef4444;
--color-info:    #3b82f6;

/* Neutral */
--color-gray-50:  #f9fafb;
--color-gray-100: #f3f4f6;
--color-gray-900: #111827;
```

#### 8.1.2 Typography

```css
font-family: 'Inter', system-ui, sans-serif;

--text-xs:   0.75rem;   /* 12px - label kecil */
--text-sm:   0.875rem;  /* 14px - body kecil */
--text-base: 1rem;      /* 16px - body default */
--text-lg:   1.125rem;  /* 18px - subheading */
--text-xl:   1.25rem;   /* 20px - heading small */
--text-2xl:  1.5rem;    /* 24px - heading */
--text-3xl:  1.875rem;  /* 30px - page title */
--text-4xl:  2.25rem;   /* 36px - hero number */
```

#### 8.1.3 Spacing & Grid

- Base unit: 4px (0.25rem)
- Container max-width: 1280px
- Grid: 12 kolom, gap 16px
- Breakpoints: sm:640px, md:768px, lg:1024px, xl:1280px

### 8.2 Layout Utama

#### 8.2.1 Layout POS (Kasir)

```
┌─────────────────────────────────────────────────────────┐
│ Header: Logo | Nama Kasir | Status Online | Waktu        │
├─────────────────────────────┬───────────────────────────┤
│                             │  KERANJANG BELANJA         │
│  PRODUK (Kiri 60%)          │  ─────────────────────── │
│  ┌────────────────────────┐ │  Item 1  Mangga 1.5kg     │
│  │ 🔍 Cari / Scan Barcode  │ │  Rp 25.000 × 1.5 = 37.500│
│  └────────────────────────┘ │                           │
│                             │  Item 2  Apel Fuji 0.5kg  │
│  [Kategori tabs]            │  Rp 45.000 × 0.5 = 22.500│
│                             │  ─────────────────────── │
│  ┌──────┐ ┌──────┐ ┌──────┐│  SUBTOTAL:    Rp 60.000  │
│  │ Prod │ │ Prod │ │ Prod ││  DISKON:      Rp 0        │
│  │ Img  │ │ Img  │ │ Img  ││  TOTAL:       Rp 60.000  │
│  │ Nama │ │ Nama │ │ Nama ││                           │
│  │ Harga│ │ Harga│ │ Harga││  [BAYAR TUNAI]            │
│  └──────┘ └──────┘ └──────┘│  [QRIS]  [TRANSFER]       │
│                             │                           │
│  (Grid produk scrollable)   │  [BATAL] [TAHAN]          │
├─────────────────────────────┴───────────────────────────┤
│ Status Bar: Shift: SHIFT-001 | Total Transaksi: 23      │
└─────────────────────────────────────────────────────────┘
```

#### 8.2.2 Layout Admin (Sidebar + Content)

```
┌────────────────────────────────────────────────────────┐
│ ☰ ISTANA BUAH     [Search...]         👤 Admin  🔔     │
├──────────────────┬─────────────────────────────────────┤
│ MENU             │                                     │
│ ─────────────    │  CONTENT AREA                       │
│ 📊 Dashboard     │                                     │
│ 🛒 Kasir         │  (Halaman aktif ditampilkan di sini) │
│ 📦 Produk        │                                     │
│ 📂 Kategori      │                                     │
│ 📋 Stok          │                                     │
│ 🚚 Supplier      │                                     │
│ 🗑 Penyusutan     │                                     │
│ 👥 Pegawai       │                                     │
│ ⏰ Shift         │                                     │
│ 📈 Laporan       │                                     │
│ ⚙ Pengaturan     │                                     │
│                  │                                     │
└──────────────────┴─────────────────────────────────────┘
```

### 8.3 Wireframe Halaman Kritis

#### 8.3.1 Halaman Login

```
┌─────────────────────────────┐
│          🍎                  │
│   ISTANA BUAH SEMARANG       │
│                              │
│  Username                    │
│  ┌────────────────────────┐  │
│  │                        │  │
│  └────────────────────────┘  │
│                              │
│  Password                    │
│  ┌────────────────────────┐  │
│  │                      👁 │  │
│  └────────────────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │       MASUK            │  │
│  └────────────────────────┘  │
│                              │
│  v1.0.0 | Istana Buah 2026   │
└─────────────────────────────┘
```

#### 8.3.2 Modal Input Berat Produk

```
┌────────────────────────────────┐
│  Mangga Harum Manis             │
│  Rp 25.000 / kg                 │
│  ───────────────────────────── │
│                                 │
│         INPUT BERAT             │
│                                 │
│  ┌─────────────────────────┐   │
│  │      0.000 kg           │   │
│  └─────────────────────────┘   │
│                                 │
│  [7] [8] [9]                    │
│  [4] [5] [6]  Total:            │
│  [1] [2] [3]  Rp 0              │
│  [.] [0] [⌫]                   │
│                                 │
│  [BATAL]  [TAMBAH KE KERANJANG] │
└────────────────────────────────┘
```

### 8.4 Interaction Design

#### 8.4.1 Alur Transaksi (Happy Path)

```
1. Kasir buka shift → input modal uang awal
2. Layar POS tampil → keranjang kosong
3. Scan barcode / cari produk
4. Jika produk WEIGHT → modal input berat
5. Produk masuk keranjang → total update
6. Ulangi langkah 3-5 untuk produk berikutnya
7. Klik [BAYAR TUNAI] → modal pembayaran
8. Input jumlah diterima → sistem hitung kembalian
9. Klik [KONFIRMASI] → transaksi tersimpan
10. Printer cetak struk otomatis
11. Modal sukses → kembalian ditampilkan besar
12. Keranjang reset → siap transaksi baru
```

#### 8.4.2 Feedback States

| State | Visual | Contoh |
|-------|--------|--------|
| Loading | Spinner + disabled | Tombol loading saat submit |
| Success | Toast hijau + ✓ | "Transaksi berhasil" |
| Error | Toast merah + ✗ | "Stok tidak mencukupi" |
| Offline | Banner kuning | "Mode offline aktif" |
| Warning | Badge oranye | "Stok menipis: 2.3 kg" |

### 8.5 Accessibility (A11y)

- Semua form harus memiliki `label` yang benar
- Keyboard navigasi penuh di semua fitur POS
- Kontras warna minimum WCAG AA (4.5:1)
- Loading state menggunakan `aria-busy`
- Error message menggunakan `aria-describedby`
- Tombol aksi besar (min. 44×44px touch target)

---

## 9. USER STORIES

### 9.1 Format User Story

```
ID: US-XXX-NNN
Sebagai [peran], saya ingin [aksi] sehingga [manfaat]

Acceptance Criteria:
- Given [konteks], When [aksi], Then [hasil]

Priority: P0/P1/P2/P3
Effort: S/M/L/XL
```

### 9.2 User Stories — Autentikasi (AUTH)

**US-AUTH-001** | P0 | S
> Sebagai kasir, saya ingin login dengan username dan password sehingga saya dapat mengakses sistem kasir.

- Given username dan password valid, When klik Login, Then diarahkan ke halaman POS
- Given username/password salah, When klik Login, Then tampil pesan error spesifik
- Given 5 kali login gagal, When klik Login, Then akun dikunci dan tampil pesan

**US-AUTH-002** | P0 | S
> Sebagai pengguna, saya ingin logout dari sistem sehingga akun saya aman saat meninggalkan perangkat.

- Given user sudah login, When klik Logout, Then session dihapus dan redirect ke login
- Given klik Logout, When konfirmasi, Then refresh token direvoke di server

### 9.3 User Stories — POS (Kasir)

**US-POS-001** | P0 | M
> Sebagai kasir, saya ingin membuka shift baru sehingga transaksi tercatat dalam sesi kerja saya.

- Given kasir login, When buka shift dengan uang awal, Then shift tercatat dan POS aktif
- Given shift sudah ada yang terbuka, Then tampil peringatan sebelum membuka shift baru

**US-POS-002** | P0 | M
> Sebagai kasir, saya ingin memindai barcode produk sehingga produk cepat ditambahkan ke keranjang.

- Given kamera aktif, When scan barcode valid, Then produk muncul di keranjang
- Given barcode tidak ditemukan, When scan, Then tampil pesan "Produk tidak ditemukan"
- Given produk WEIGHT, When scan berhasil, Then modal input berat muncul otomatis

**US-POS-003** | P0 | M
> Sebagai kasir, saya ingin menginput berat buah sehingga harga dihitung berdasarkan berat aktual.

- Given produk WEIGHT dipilih, When input 1.5 kg, Then harga = pricePerKg × 1.5
- Given input berat = 0, Then tombol tambah ke keranjang disabled
- Given input berat via numpad, When tekan angka, Then input terkonfirmasi akurat

**US-POS-004** | P0 | L
> Sebagai kasir, saya ingin memproses pembayaran tunai sehingga transaksi selesai dan kembalian dihitung.

- Given keranjang tidak kosong, When pilih bayar tunai dan input Rp 50.000, Then kembalian = total - 50.000
- Given transaksi selesai, Then printer thermal cetak struk otomatis
- Given transaksi selesai offline, Then tersimpan di IndexedDB dengan status PENDING_SYNC

**US-POS-005** | P0 | M
> Sebagai kasir, saya ingin bekerja tanpa internet sehingga operasional tidak terganggu saat koneksi putus.

- Given koneksi internet putus, When proses transaksi, Then tetap berfungsi normal
- Given banner offline muncul, When internet kembali, Then sync otomatis berjalan di background
- Given sync selesai, Then notifikasi sukses tampil dan badge jumlah pending hilang

**US-POS-006** | P1 | M
> Sebagai kasir, saya ingin membatalkan item di keranjang sehingga kesalahan dapat diperbaiki sebelum pembayaran.

- Given item di keranjang, When klik hapus item, Then item dihapus dan total recalculate
- Given keranjang dikosongkan, Then siap untuk transaksi baru

**US-POS-007** | P1 | M
> Sebagai manager, saya ingin mem-void transaksi yang sudah selesai sehingga transaksi yang salah dapat dibatalkan.

- Given transaksi hari ini, When manager void dengan alasan, Then status = VOIDED dan stok dikembalikan
- Given void, Then audit log tercatat dengan detail user, waktu, dan alasan

### 9.4 User Stories — Produk (PROD)

**US-PROD-001** | P0 | M
> Sebagai admin, saya ingin menambah produk baru sehingga produk tersedia di POS.

- Given form produk diisi lengkap, When simpan, Then produk aktif dan muncul di POS
- Given nama produk duplikat dalam kategori sama, Then tampil peringatan konfirmasi
- Given produk WEIGHT, Then field pricePerKg wajib; pricePerUnit tersembunyi

**US-PROD-002** | P1 | S
> Sebagai admin, saya ingin generate barcode untuk produk sehingga produk dapat discan di kasir.

- Given produk tanpa barcode, When generate, Then barcode EAN-13 dibuat dan tersimpan
- Given barcode digenerate, When print, Then label barcode tercetak via thermal printer

### 9.5 User Stories — Stok (STOCK)

**US-STK-001** | P0 | M
> Sebagai admin, saya ingin mencatat penerimaan barang dari supplier sehingga stok bertambah akurat.

- Given form penerimaan diisi, When simpan, Then stok produk bertambah sesuai quantity
- Given penerimaan tersimpan, Then stock movement tercatat dengan referensi PO

**US-STK-002** | P1 | L
> Sebagai manager, saya ingin melakukan stok opname sehingga stok sistem sesuai dengan fisik.

- Given opname dibuat dengan qty fisik, When finalisasi, Then stok disesuaikan dan movement tercatat
- Given perbedaan stok > 10%, Then tampil peringatan konfirmasi sebelum finalisasi

### 9.6 User Stories — Dashboard (DASH)

**US-DASH-001** | P1 | L
> Sebagai owner, saya ingin melihat dashboard real-time sehingga saya dapat memantau bisnis dari mana saja.

- Given owner login, When buka dashboard, Then omset hari ini tampil dalam < 2 detik
- Given tampil grafik 7 hari, When hover titik grafik, Then tooltip detail muncul
- Given stok menipis, Then alert merah tampil dengan nama produk dan sisa stok

---

## 10. TASK BREAKDOWN / WBS

### 10.1 Struktur Hierarki WBS

```
Proyek Istana Buah
├── FASE 0: Fondasi & Setup (2 minggu)
│   ├── ENV-001: Setup lingkungan development
│   ├── ENV-002: Inisialisasi proyek (monorepo)
│   ├── ENV-003: Setup database & migrasi awal
│   ├── ENV-004: Setup CI/CD pipeline
│   └── ENV-005: Setup infrastruktur server
│
├── FASE 1: Core MVP (10 minggu)
│   ├── M01: Autentikasi & Otorisasi
│   ├── M02: Manajemen Produk & Kategori
│   ├── M03: POS / Kasir (Core)
│   ├── M04: Manajemen Stok
│   ├── M05: Manajemen Supplier
│   ├── M06: Shift Kasir
│   └── M07: Laporan Dasar
│
├── FASE 2: Extended Features (6 minggu)
│   ├── M08: Dashboard Owner
│   ├── M09: Penyusutan & Waste
│   ├── M10: Manajemen Pegawai
│   ├── M11: Offline-First & PWA
│   └── M12: Laporan Lanjutan & Export
│
├── FASE 3: Hardening & Launch (3 minggu)
│   ├── QA: Testing komprehensif
│   ├── SEC: Security audit & penetration test
│   ├── PERF: Performance tuning
│   └── DEPLOY: Production deployment
│
└── FASE 4: Post-Launch (ongoing)
    ├── BUG: Bug fixes
    ├── OPS: Monitoring & maintenance
    └── FEAT: Feature enhancement
```

### 10.2 Detail Task Per Fase

---

#### FASE 0: Fondasi & Setup

| ID | Task | Subtask | Prioritas | Estimasi | Dependensi | Acceptance Criteria |
|----|------|---------|-----------|----------|------------|---------------------|
| ENV-001 | Setup Dev Environment | - Install Node.js 20 LTS | P0 | 0.5 hari | - | Node versi terverifikasi |
| | | - Setup VS Code + ESLint + Prettier | P0 | 0.5 hari | - | Config terkonfigurasi |
| | | - Setup Git hooks (husky + lint-staged) | P0 | 0.5 hari | - | Pre-commit lint berjalan |
| ENV-002 | Inisialisasi Monorepo | - Setup pnpm workspace | P0 | 0.5 hari | ENV-001 | Workspace terstruktur |
| | | - Inisialisasi apps/web (Vite+React+TS) | P0 | 1 hari | - | App berjalan di dev |
| | | - Inisialisasi apps/api (Express+TS) | P0 | 1 hari | - | API berjalan di dev |
| | | - Inisialisasi packages/shared | P0 | 0.5 hari | - | Shared types terimport |
| ENV-003 | Database Setup | - Install PostgreSQL + ekstensi | P0 | 0.5 hari | ENV-001 | DB berjalan |
| | | - Setup Prisma & schema awal | P0 | 1 hari | - | Schema terdefinisi |
| | | - Jalankan migrasi awal | P0 | 0.5 hari | - | Tabel terbuat |
| | | - Setup Redis | P0 | 0.5 hari | - | Redis terhubung |
| | | - Buat seed data (kategori, user admin) | P0 | 1 hari | - | Data seed tersedia |
| ENV-004 | CI/CD Setup | - GitHub Actions CI (lint, test, build) | P1 | 1 hari | ENV-002 | CI berjalan di PR |
| | | - GitHub Actions CD (deploy ke staging) | P1 | 1 hari | - | Auto deploy ke staging |
| ENV-005 | Infrastruktur Server | - Setup VPS (Ubuntu 22.04) | P0 | 0.5 hari | - | VPS accessible |
| | | - Install Docker + Docker Compose | P0 | 0.5 hari | - | Docker berjalan |
| | | - Setup Nginx + SSL (Let's Encrypt) | P0 | 1 hari | - | HTTPS berfungsi |
| | | - Setup backup otomatis PostgreSQL | P1 | 0.5 hari | - | Backup terjadwal |

**Checklist Progres FASE 0**

| ID | Status | Bukti |
|----|--------|-------|
| ENV-001 | ✅ DONE | `pnpm check:node` OK (Node 24.18 ≥ 20); `pnpm lint` & `pnpm format:check` exit 0; pre-commit (eslint) menolak file buruk (exit 1); commit-msg (commitlint) menolak pesan non-conventional (exit 1) |
| ENV-002 | ✅ DONE | pnpm workspace (apps/web, apps/api, packages/shared); `pnpm test`: shared 6, api 12, web 3 passed (coverage 100%); `pnpm build` exit 0; API `GET /health` → 200 `{"status":"ok",...}`; web dev (Vite) → 200; web & api mengimpor `@istana-buah/shared` |
| ENV-003 | ✅ DONE | PostgreSQL 16.15 + ekstensi `pg_trgm` aktif; Prisma schema 18 tabel + migrasi `20261107000000_init` (`pnpm db:migrate` exit 0) + indeks GIN/covering + trigger immutable `audit_logs`; Redis (`ioredis`) terhubung; `pnpm db:seed` exit 0 (5 kategori, 3 user bcrypt, 5 app_configs); Jest 32 passed (4 suites, 100% stmt/lines/funcs, 94.11% branches) |
| ENV-004 | ✅ DONE | `.github/workflows/ci.yml` (Node 20 LTS, PostgreSQL 16 + Redis 7 service containers, `pnpm audit --prod --audit-level=critical`, format, lint, typecheck, test, build), `.github/workflows/deploy.yml` (artifact packaging + SSH deploy ke `staging`/`production`), `.github/dependabot.yml` (OWASP A06); `pnpm audit --prod --audit-level=critical` exit 0 (0 critical), `pnpm lint` exit 0, `pnpm test` exit 0 (shared 6, api 32, web 3 passed), `pnpm build` exit 0 |
| ENV-005 | ⏳ TODO | - |

---

#### FASE 1: Core MVP

**M01 — Autentikasi & Otorisasi**

| ID | Task | Subtask | Prio | Est | Dep | AC |
|----|------|---------|------|-----|-----|----|
| M01-001 | BE: Auth Service | - Implementasi login (bcrypt + JWT) | P0 | 2h | ENV-003 | Login berhasil dengan kredensial valid |
| | | - Implementasi refresh token rotation | P0 | 2h | - | Refresh token bekerja |
| | | - Implementasi logout (revoke token) | P0 | 1h | - | Token direvoke |
| | | - Rate limiting endpoint auth | P0 | 1h | - | 20 req/menit dibatasi |
| | | - Account lockout setelah 5 gagal | P0 | 1h | - | Akun dikunci otomatis |
| M01-002 | BE: Middleware Auth | - Middleware `authenticate` (verify JWT) | P0 | 2h | M01-001 | Request tanpa token ditolak 401 |
| | | - Middleware `authorize` (role check) | P0 | 2h | - | Role tidak sesuai ditolak 403 |
| M01-003 | FE: Halaman Login | - Form login UI | P0 | 3h | - | UI sesuai wireframe |
| | | - Integrasi API login | P0 | 2h | M01-001 | Login berhasil/gagal handled |
| | | - Simpan token di memory + secure storage | P0 | 2h | - | Token tersimpan aman |
| | | - Axios interceptor refresh token | P0 | 3h | - | Auto refresh pada 401 |
| M01-004 | FE: Protected Routes | - Route guard berdasarkan auth | P0 | 2h | M01-003 | Redirect ke login jika tidak auth |
| | | - Route guard berdasarkan role | P0 | 2h | - | Kasir tidak bisa akses admin |
| M01-005 | FE: Change Password | - Form change password | P1 | 2h | M01-003 | Password berubah |
| M01-006 | Test Auth | - Unit test auth service | P0 | 3h | M01-001 | Coverage ≥ 80% |
| | | - Integration test login flow | P0 | 2h | M01-003 | End-to-end berhasil |

**M02 — Manajemen Produk & Kategori**

| ID | Task | Subtask | Prio | Est | Dep | AC |
|----|------|---------|------|-----|-----|-----|
| M02-001 | BE: Category CRUD | - GET/POST/PUT/DELETE /categories | P0 | 3h | M01-002 | CRUD berfungsi |
| M02-002 | BE: Product CRUD | - GET/POST/PUT/DELETE /products | P0 | 4h | M02-001 | CRUD berfungsi |
| | | - GET /products/barcode/:code | P0 | 1h | - | Lookup cepat < 50ms |
| | | - Validasi tipe produk (WEIGHT/UNIT) | P0 | 1h | - | Field sesuai tipe |
| M02-003 | BE: Barcode | - Generate barcode EAN-13 | P0 | 2h | M02-002 | Barcode unik terbuat |
| | | - Multiple barcode per produk | P1 | 2h | - | Semua barcode valid |
| M02-004 | FE: Category Pages | - List kategori + CRUD form | P0 | 4h | M02-001 | CRUD berfungsi di UI |
| M02-005 | FE: Product Pages | - List produk dengan filter/search | P0 | 6h | M02-002 | Search < 300ms |
| | | - Form tambah/edit produk | P0 | 6h | - | Validasi lengkap |
| | | - Upload gambar produk | P2 | 3h | - | Gambar tersimpan |
| | | - Halaman detail produk | P1 | 3h | - | Info lengkap |
| M02-006 | FE: Barcode UI | - Generate & tampil barcode di UI | P0 | 3h | M02-003 | Barcode terbaca scanner |
| | | - Print barcode label | P1 | 3h | - | Print via thermal |
| M02-007 | FE: Import Produk | - Import CSV/Excel | P2 | 6h | M02-002 | 100+ produk terimport |
| M02-008 | Test Produk | - Unit test product service | P0 | 3h | M02-002 | Coverage ≥ 80% |

**M03 — POS / Kasir (Core)**

| ID | Task | Subtask | Prio | Est | Dep | AC |
|----|------|---------|------|-----|-----|-----|
| M03-001 | BE: Transaction API | - POST /transactions | P0 | 4h | M02-002 | Transaksi tersimpan |
| | | - Validasi stok mencukupi | P0 | 2h | M04-001 | Error jika stok < qty |
| | | - Update stok otomatis | P0 | 2h | - | Stok berkurang |
| | | - Generate nomor transaksi (TRX-YYYYMMDD-NNNN) | P0 | 1h | - | No unik terbuat |
| | | - Idempotency via clientId | P0 | 2h | - | Duplikat ditolak |
| | | - GET /transactions (list + filter) | P1 | 2h | - | List tampil |
| | | - PUT /transactions/:id/void | P1 | 3h | M01-002 | Void dengan auth manager |
| M03-002 | FE: POS Layout | - Layout 2-panel (produk + keranjang) | P0 | 4h | - | Responsif, sesuai wireframe |
| | | - Tampilan status online/offline | P0 | 1h | - | Banner tampil saat offline |
| M03-003 | FE: Product Grid | - Grid produk dengan kategori tab | P0 | 4h | M02-005 | Grid render cepat |
| | | - Search produk real-time | P0 | 3h | - | Hasil < 300ms |
| | | - Lazy loading gambar | P1 | 2h | - | No jank saat scroll |
| M03-004 | FE: Barcode Scanner | - Scan via kamera (zxing) | P0 | 4h | - | Scan akurat di cahaya normal |
| | | - Input manual barcode | P0 | 2h | - | Input manual berfungsi |
| | | - Dukungan USB HID scanner | P0 | 2h | - | Scanner USB berfungsi |
| M03-005 | FE: Cart (Keranjang) | - Tambah item (dengan modal berat) | P0 | 4h | - | Modal berat akurat |
| | | - Edit/hapus item di keranjang | P0 | 3h | - | Total recalculate |
| | | - Numpad input berat | P0 | 3h | - | Input akurat 3 desimal |
| M03-006 | FE: Payment Flow | - Modal pembayaran tunai | P0 | 4h | - | Hitung kembalian benar |
| | | - Modal QRIS (tampil QR) | P1 | 3h | - | QR terbaca |
| | | - Modal transfer bank | P1 | 2h | - | Konfirmasi manual |
| M03-007 | FE: Receipt/Struk | - Generate data struk | P0 | 3h | - | Data lengkap |
| | | - Print via ESC/POS (WebUSB/Serial) | P0 | 6h | - | Struk tercetak akurat |
| | | - Print via network printer | P1 | 4h | - | Print via IP berhasil |
| M03-008 | FE: Transaction History | - List transaksi hari ini | P1 | 3h | M03-001 | List tampil |
| | | - Detail transaksi | P1 | 2h | - | Detail lengkap |
| | | - Reprint struk | P1 | 2h | - | Print ulang berhasil |
| M03-009 | Test POS | - Unit test transaction service | P0 | 4h | M03-001 | Coverage ≥ 80% |
| | | - Integration test full POS flow | P0 | 4h | M03-006 | Transaksi end-to-end berhasil |

**M04 — Manajemen Stok**

| ID | Task | Subtask | Prio | Est | Dep | AC |
|----|------|---------|------|-----|-----|-----|
| M04-001 | BE: Stock Service | - POST /stock/receive (penerimaan) | P0 | 3h | M02-002 | Stok bertambah |
| | | - POST /stock/opname | P1 | 4h | - | Stok disesuaikan |
| | | - GET /stock/movements | P1 | 2h | - | Riwayat tampil |
| | | - GET /stock/low-alert | P1 | 1h | - | Alert muncul |
| M04-002 | FE: Stock Pages | - Halaman penerimaan barang | P0 | 5h | M04-001 | Penerimaan berhasil |
| | | - Halaman stok opname | P1 | 5h | - | Opname berhasil |
| | | - Riwayat mutasi stok | P1 | 3h | - | Riwayat tampil |
| | | - Alert stok menipis | P1 | 2h | - | Notifikasi muncul |

**M05 — Manajemen Supplier**

| ID | Task | Subtask | Prio | Est | Dep | AC |
|----|------|---------|------|-----|-----|-----|
| M05-001 | BE: Supplier CRUD | - GET/POST/PUT/DELETE /suppliers | P1 | 3h | M01-002 | CRUD berfungsi |
| M05-002 | BE: Purchase Order | - POST/GET /purchase-orders | P1 | 4h | M05-001 | PO tersimpan |
| M05-003 | FE: Supplier Pages | - List & CRUD supplier | P1 | 4h | M05-001 | CRUD berfungsi |
| | | - Form Purchase Order | P1 | 5h | M05-002 | PO terbuat |

**M06 — Shift Kasir**

| ID | Task | Subtask | Prio | Est | Dep | AC |
|----|------|---------|------|-----|-----|-----|
| M06-001 | BE: Shift Service | - POST /shifts/open | P0 | 2h | M01-002 | Shift terbuka |
| | | - PUT /shifts/:id/close | P0 | 3h | - | Shift tertutup dengan summary |
| | | - GET /shifts | P1 | 1h | - | List shift |
| M06-002 | FE: Shift UI | - Modal buka shift (input kas awal) | P0 | 2h | M06-001 | Modal berfungsi |
| | | - Modal tutup shift (laporan kas) | P0 | 3h | - | Summary tampil |
| | | - Halaman riwayat shift | P1 | 3h | - | Riwayat tampil |

**M07 — Laporan Dasar**

| ID | Task | Subtask | Prio | Est | Dep | AC |
|----|------|---------|------|-----|-----|-----|
| M07-001 | BE: Report API | - GET /reports/sales-summary | P1 | 4h | M03-001 | Data akurat |
| | | - GET /reports/product-performance | P1 | 3h | - | Produk terlaris tepat |
| | | - GET /reports/stock-current | P1 | 2h | M04-001 | Stok real-time |
| M07-002 | FE: Laporan Pages | - Halaman laporan penjualan | P1 | 6h | M07-001 | Grafik + tabel tampil |
| | | - Halaman laporan stok | P1 | 4h | - | Stok lengkap |
| | | - Export PDF/Excel | P1 | 5h | - | File dapat didownload |

---

#### FASE 2: Extended Features

**M08 — Dashboard Owner**

| ID | Task | Subtask | Prio | Est | Dep | AC |
|----|------|---------|------|-----|-----|-----|
| M08-001 | BE: Dashboard API | - GET /dashboard/summary | P1 | 3h | M07-001 | KPI real-time |
| | | - GET /dashboard/charts | P1 | 3h | - | Data grafik |
| M08-002 | FE: Dashboard | - KPI cards (omset, transaksi) | P1 | 4h | M08-001 | Cards akurat |
| | | - Grafik penjualan 7/30 hari | P1 | 4h | - | Grafik interaktif |
| | | - Produk terlaris hari ini | P1 | 3h | - | List tampil |
| | | - Alert stok menipis | P1 | 2h | - | Alert merah |
| | | - Mobile responsive dashboard | P1 | 3h | - | Responsif di 375px |

**M09 — Penyusutan & Waste**

| ID | Task | Subtask | Prio | Est | Dep | AC |
|----|------|---------|------|-----|-----|-----|
| M09-001 | BE: Waste API | - POST /waste-records | P1 | 3h | M02-002 | Waste tercatat |
| | | - GET /waste-records | P1 | 2h | - | List tampil |
| | | - GET /reports/waste-summary | P1 | 2h | - | Laporan akurat |
| M09-002 | FE: Waste Pages | - Form pencatatan penyusutan | P1 | 4h | M09-001 | Form berfungsi |
| | | - Daftar penyusutan | P1 | 3h | - | List tampil |
| | | - Laporan penyusutan | P1 | 3h | - | Laporan akurat |

**M10 — Manajemen Pegawai**

| ID | Task | Subtask | Prio | Est | Dep | AC |
|----|------|---------|------|-----|-----|-----|
| M10-001 | BE: Employee API | - CRUD /users (admin only) | P1 | 3h | M01-002 | CRUD berfungsi |
| | | - GET /users/:id/shifts | P1 | 2h | M06-001 | Riwayat shift tampil |
| M10-002 | FE: Employee Pages | - List pegawai | P1 | 3h | M10-001 | List tampil |
| | | - Form tambah/edit pegawai | P1 | 4h | - | Form berfungsi |
| | | - Riwayat shift per pegawai | P1 | 3h | - | Riwayat tampil |

**M11 — Offline-First & PWA**

| ID | Task | Subtask | Prio | Est | Dep | AC |
|----|------|---------|------|-----|-----|-----|
| M11-001 | FE: IndexedDB Setup | - Setup Dexie.js schema | P0 | 3h | - | Schema terdefinisi |
| | | - Migrate produk ke IndexedDB saat login | P0 | 3h | M02-005 | 1000+ produk cached |
| | | - Transaksi offline tersimpan | P0 | 4h | M03-005 | Transaksi offline sukses |
| M11-002 | FE: Sync Manager | - Sync queue implementasi | P0 | 6h | M11-001 | Queue berfungsi |
| | | - POST /sync/batch saat online | P0 | 4h | M11-001 | Sync otomatis |
| | | - Conflict resolution | P1 | 4h | - | Konflik diselesaikan |
| | | - Retry dengan exponential backoff | P0 | 2h | - | Retry berfungsi |
| M11-003 | FE: Service Worker | - Workbox setup | P0 | 3h | - | SW terdaftar |
| | | - Cache strategy per asset type | P0 | 4h | - | App load offline |
| | | - Background sync via SW | P1 | 4h | M11-002 | Sync saat app minimize |
| M11-004 | FE: PWA Manifest | - manifest.json + icons | P1 | 2h | - | Installable di Android |
| | | - Install prompt | P1 | 2h | - | Prompt muncul |

**M12 — Laporan Lanjutan & Export**

| ID | Task | Subtask | Prio | Est | Dep | AC |
|----|------|---------|------|-----|-----|-----|
| M12-001 | BE: Advanced Reports | - Laporan keuntungan kotor | P1 | 3h | M07-001 | Profit calculation akurat |
| | | - Laporan per kasir & shift | P1 | 3h | - | Data per kasir |
| | | - Laporan pembelian per supplier | P1 | 2h | M05-002 | Data supplier |
| M12-002 | BE: Export | - Export PDF (pdfkit/puppeteer) | P1 | 4h | M07-001 | PDF terbuat |
| | | - Export Excel (exceljs) | P1 | 4h | - | Excel terbuat |
| M12-003 | FE: Laporan Lanjutan | - Halaman laporan keuntungan | P1 | 5h | M12-001 | Grafik margin |
| | | - Filter dan komparasi periode | P1 | 4h | - | Komparasi akurat |

---

#### FASE 3: Hardening & Launch

| ID | Task | Subtask | Prio | Est | Dep | AC |
|----|------|---------|------|-----|-----|-----|
| QA-001 | End-to-End Testing | - Setup Playwright | P0 | 2h | M11 | Playwright berjalan |
| | | - E2E test semua happy path | P0 | 8h | - | Semua pass |
| | | - E2E test offline scenarios | P0 | 4h | - | Offline test pass |
| QA-002 | Performance Testing | - Load test API (k6) | P0 | 3h | - | < 300ms p95 |
| | | - Lighthouse audit frontend | P0 | 2h | - | Score ≥ 90 |
| SEC-001 | Security Audit | - OWASP checklist review | P0 | 4h | - | Semua check pass |
| | | - Penetration test (manual) | P0 | 6h | - | Tidak ada critical issue |
| | | - Review secret management | P0 | 2h | - | Tidak ada secret di kode |
| PERF-001 | Performance Tuning | - Query optimization PostgreSQL | P0 | 4h | - | Query < 100ms |
| | | - Redis caching untuk reports | P0 | 3h | - | Cache hit > 80% |
| | | - Frontend bundle optimization | P0 | 3h | - | Bundle < 500KB gzip |
| DEPLOY-001 | Production Deploy | - Setup production environment | P0 | 4h | - | Prod accessible |
| | | - Database migration production | P0 | 2h | - | Migrasi sukses |
| | | - Smoke test production | P0 | 3h | - | Semua fungsi berjalan |
| | | - Training user (kasir & admin) | P0 | 4h | - | User bisa operasional |

---

## 11. DEVELOPMENT ROADMAP

### 11.1 Timeline Overview

```
November 2026
Week 1-2: FASE 0 — Fondasi & Setup
  - Dev environment, monorepo, database, CI/CD, server

Week 3-4: FASE 1a — Core Backend
  - M01: Auth, M02: Product API, M04: Stock API (backend)

Week 5-6: FASE 1b — POS Backend & Frontend Auth
  - M03: Transaction API, M06: Shift API
  - FE: Login, Protected Routes

Week 7-8: FASE 1c — POS Frontend Core
  - M03: POS UI, Barcode Scanner, Cart, Payment

Week 9-10: FASE 1d — Product & Stock Frontend
  - M02: Product/Category UI, M04: Stock UI

December 2026
Week 11-12: FASE 1e — Supplier & Basic Reports
  - M05: Supplier, M07: Basic Reports

Week 13-14: FASE 2a — Dashboard & Waste
  - M08: Dashboard, M09: Waste Records

Week 15-16: FASE 2b — Employee & Offline-First
  - M10: Employee Management, M11: Offline PWA

Week 17-18: FASE 2c — Advanced Reports & PWA
  - M12: Advanced Reports, Export, PWA install

January 2027
Week 19-20: FASE 3a — Testing & Security
  - QA: E2E Testing, Security Audit

Week 21: FASE 3b — Performance & Deploy
  - PERF: Optimization, DEPLOY: Production

Week 22: Soft Launch
  - Training, monitoring, bug fixes
```

### 11.2 Milestone Utama

| Milestone | Target | Deliverable |
|-----------|--------|-------------|
| M0: Foundation Ready | +2 minggu | Dev environment, DB, CI/CD siap |
| M1: Backend Alpha | +4 minggu | Semua API endpoint tersedia |
| M2: POS Working | +6 minggu | Transaksi kasir berfungsi (online) |
| M3: MVP Complete | +10 minggu | Semua fitur fase 1 selesai |
| M4: Extended Complete | +16 minggu | Dashboard, Offline, Reports lengkap |
| M5: Production Ready | +20 minggu | Test & security selesai |
| **M6: GO LIVE** | **+22 minggu** | **Sistem live production** |

### 11.3 Dependency Chain Kritis

```
ENV-003 → M01-001 → M02-002 → M03-001 → M04-001
                                      ↓
                               M06-001 → M07-001 → M08-001
                                              ↓
                                       M11-001 → M11-002
```

### 11.4 Resource Allocation

| Peran | Fase 0 | Fase 1 | Fase 2 | Fase 3 |
|-------|--------|--------|--------|--------|
| Backend Dev | 100% | 100% | 50% | 30% |
| Frontend Dev | 20% | 100% | 100% | 50% |
| QA | 0% | 10% | 20% | 100% |
| DevOps | 100% | 20% | 10% | 50% |

---

## 12. TESTING PLAN

### 12.1 Strategi Testing

```
Testing Pyramid:
         /\
        /E2E\         ~10% — Playwright E2E tests
       /──────\
      /Integr. \      ~30% — API integration tests (Supertest)
     /──────────\
    /  Unit Tests \   ~60% — Jest unit tests
   /______________\
```

### 12.2 Testing Tools

| Jenis | Tool | Target Coverage |
|-------|------|-----------------|
| Unit Test (Backend) | Jest + ts-jest | ≥ 80% |
| Unit Test (Frontend) | Vitest + React Testing Library | ≥ 70% |
| Integration Test | Jest + Supertest | Critical paths 100% |
| E2E Test | Playwright | Happy path + offline scenarios |
| Performance Test | k6 | Load test API endpoints |
| Security Test | OWASP ZAP (manual) | Checklist |
| Accessibility | axe-core + manual | WCAG AA |

### 12.3 Test Cases Kritis

#### TC-AUTH-001: Login Sukses
```
Input:  { username: "kasir01", password: "ValidPass123!" }
Expect: 200 OK, accessToken ada, role CASHIER
```

#### TC-AUTH-002: Login Gagal - Credentials Salah
```
Input:  { username: "kasir01", password: "wrongpassword" }
Expect: 401, error INVALID_CREDENTIALS, loginAttempts +1
```

#### TC-AUTH-003: Account Lockout
```
Precondition: loginAttempts = 4
Input: Login gagal 1x lagi
Expect: 401, error ACCOUNT_LOCKED, lockedUntil diset
```

#### TC-POS-001: Transaksi WEIGHT Berhasil
```
Precondition: Produk "Mangga" harga 25000/kg, stok 10 kg
Input: quantity 1.5 kg, payment CASH 50000
Expect: 201, total 37500, kembalian 12500, stok 8.5 kg
```

#### TC-POS-002: Transaksi Gagal - Stok Tidak Cukup
```
Precondition: Produk stok 1 kg
Input: quantity 2 kg
Expect: 422, error INSUFFICIENT_STOCK
```

#### TC-POS-003: Idempotency Offline Sync
```
Input: POST /sync/batch dengan clientId yang sama 2x
Expect: 200, kedua request berhasil (deduplicated), 1 transaksi di DB
```

#### TC-STK-001: Penerimaan Barang Update Stok
```
Precondition: Stok mangga 5 kg
Input: Receive 20 kg dari supplier
Expect: Stok mangga menjadi 25 kg, StockMovement tercatat
```

#### TC-OFFLINE-001: Transaksi Offline Tersimpan
```
Precondition: Device offline (network disabled)
Action: Proses transaksi di POS
Expect: Transaksi tersimpan IndexedDB status PENDING_SYNC
         Stok lokal berkurang
         Struk tercetak dari data lokal
```

#### TC-OFFLINE-002: Sinkronisasi Saat Online Kembali
```
Precondition: Ada 3 transaksi PENDING_SYNC di IndexedDB
Action: Device reconnect to network
Expect: SyncManager POST /sync/batch
         3 transaksi masuk ke PostgreSQL
         Status IndexedDB berubah ke SYNCED
         Badge pending hilang di UI
```

#### TC-SEC-001: SQL Injection Prevention
```
Input: username = "admin' OR '1'='1"
Expect: 401, bukan bypass auth
```

#### TC-SEC-002: Rate Limiting Auth
```
Input: 25 req/menit ke POST /auth/login dari IP sama
Expect: Req ke-21 dan seterusnya: 429 Too Many Requests
```

#### TC-SEC-003: Role-Based Access
```
Precondition: Login sebagai CASHIER
Action: GET /reports/profit-summary
Expect: 403 Forbidden
```

### 12.4 Performance Benchmarks

| Endpoint | Target p95 | Method |
|----------|-----------|--------|
| POST /auth/login | < 200ms | k6 50 VU |
| GET /products (list) | < 300ms | k6 100 VU |
| POST /transactions | < 500ms | k6 50 VU concurrent |
| GET /reports/sales-summary | < 800ms | k6 20 VU |
| IndexedDB query produk | < 50ms | Manual timing |
| App initial load (3G) | < 3s | Lighthouse |
| POS page interactive | < 2s | Lighthouse |

### 12.5 Bug Severity Classification

| Severity | Definisi | SLA Fix |
|----------|----------|---------|
| Critical | System down, data loss, security breach | 2 jam |
| High | Fungsi utama tidak berfungsi | 24 jam |
| Medium | Fungsi sekunder terganggu, workaround ada | 72 jam |
| Low | Kosmetik, minor UX | Sprint berikutnya |

---

## 13. DEPLOYMENT GUIDE

### 13.1 Environment Variables

#### Backend (.env)
```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/istanabuah"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT - WAJIB diganti dengan nilai random yang kuat
JWT_ACCESS_SECRET="<random-256-bit-secret>"
JWT_REFRESH_SECRET="<random-256-bit-secret>"
JWT_ACCESS_EXPIRES="15m"
JWT_REFRESH_EXPIRES="7d"

# Server
PORT=3000
NODE_ENV=production
CORS_ORIGIN="https://app.istanabuah.com"

# File Storage
STORAGE_TYPE="local"  # "local" atau "s3"
STORAGE_LOCAL_PATH="/var/uploads/istanabuah"

# App
APP_NAME="Istana Buah Semarang"
DEFAULT_TIMEZONE="Asia/Jakarta"
TAX_PERCENTAGE=0  # 0 jika tidak ada pajak

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=20

# Logging
LOG_LEVEL="info"
LOG_DIR="/var/log/istanabuah"
```

#### Frontend (.env)
```bash
VITE_API_BASE_URL="https://api.istanabuah.com/v1"
VITE_APP_NAME="Istana Buah Semarang"
VITE_OFFLINE_SYNC_INTERVAL=30000  # 30 detik
VITE_PRODUCT_CACHE_TTL=300000     # 5 menit
```

### 13.2 Docker Compose (Production)

```yaml
# docker/docker-compose.yml
version: '3.9'

services:
  api:
    build:
      context: ..
      dockerfile: docker/Dockerfile.api
    environment:
      - NODE_ENV=production
    env_file: ../apps/api/.env
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    volumes:
      - uploads:/var/uploads/istanabuah
      - logs:/var/log/istanabuah

  web:
    build:
      context: ..
      dockerfile: docker/Dockerfile.web
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
      - certbot_etc:/etc/letsencrypt
    depends_on:
      - api
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: istanabuah
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d istanabuah"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "--no-auth-warning", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  uploads:
  logs:
  certbot_etc:
```

### 13.3 Nginx Configuration

```nginx
# docker/nginx.conf
server {
    listen 80;
    server_name app.istanabuah.com api.istanabuah.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name app.istanabuah.com;

    ssl_certificate /etc/letsencrypt/live/app.istanabuah.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.istanabuah.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;" always;

    root /usr/share/nginx/html;
    index index.html;

    # PWA — SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Service worker — no cache
    location = /sw.js {
        expires off;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}

server {
    listen 443 ssl http2;
    server_name api.istanabuah.com;

    ssl_certificate /etc/letsencrypt/live/api.istanabuah.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.istanabuah.com/privkey.pem;

    location / {
        proxy_pass http://api:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Upload size limit
        client_max_body_size 10M;
    }
}
```

### 13.4 Deployment Steps

#### Initial Deployment

```bash
# 1. Clone repository
git clone https://github.com/istanabuah/pos-system.git
cd pos-system

# 2. Copy dan isi environment variables
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Edit kedua file dengan nilai yang sesuai

# 3. Build dan jalankan dengan Docker
cd docker
docker-compose up -d --build

# 4. Jalankan database migrations
docker-compose exec api npx prisma migrate deploy

# 5. Jalankan seed data awal
docker-compose exec api npx ts-node scripts/seed.ts

# 6. Setup SSL Certificate
docker-compose exec web certbot --nginx -d app.istanabuah.com -d api.istanabuah.com

# 7. Verifikasi semua service berjalan
docker-compose ps
# Semua service status: Up
```

#### Update Deployment

```bash
# scripts/deploy.sh
#!/bin/bash
set -e

echo "🚀 Deploying Istana Buah POS..."

# Pull latest
git pull origin main

# Build images
docker-compose build --no-cache

# Rolling update (zero downtime)
docker-compose up -d --no-deps api
sleep 10

# Check health
curl -f https://api.istanabuah.com/health || exit 1

# Update frontend
docker-compose up -d --no-deps web

# Run migrations
docker-compose exec api npx prisma migrate deploy

echo "✅ Deployment successful!"
```

### 13.5 Health Check Endpoint

```typescript
// GET /health
{
  "status": "ok",
  "timestamp": "2026-11-07T10:30:00Z",
  "version": "1.0.0",
  "services": {
    "database": "ok",
    "redis": "ok"
  },
  "uptime": 86400
}
```

### 13.6 Backup Strategy

```bash
# scripts/backup.sh (cron: 0 2 * * *)
#!/bin/bash
BACKUP_DIR="/var/backups/istanabuah"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

mkdir -p $BACKUP_DIR

# PostgreSQL backup
docker-compose exec -T postgres pg_dump \
  -U $POSTGRES_USER \
  -d istanabuah \
  --no-acl --no-owner \
  | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Uploads backup
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz /var/uploads/istanabuah

# Delete old backups
find $BACKUP_DIR -name "*.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup selesai: $DATE"
```

---

## 14. SECURITY SPECIFICATION

### 14.1 Authentication & Session Management

```typescript
// Konfigurasi JWT - TIDAK BOLEH di-hardcode
interface JwtConfig {
  accessSecret: string;    // Dari env, min 256-bit random
  refreshSecret: string;   // Dari env, min 256-bit random
  accessExpiresIn: string; // "15m"
  refreshExpiresIn: string; // "7d"
  algorithm: "HS256";      // Minimal HS256
}

// Token payload (minimal informasi)
interface JwtPayload {
  sub: string;    // User ID
  role: UserRole;
  iat: number;
  exp: number;
}

// Refresh token rotation: setiap penggunaan refresh token menghasilkan token baru
// Token lama direvoke → mencegah token theft
```

### 14.2 Password Security

```typescript
// Minimum password requirements
const PASSWORD_RULES = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: false, // Opsional untuk kemudahan kasir
};

// bcrypt cost factor
const BCRYPT_ROUNDS = 12; // Balance antara security dan performance
```

### 14.3 Input Validation & Sanitization

```typescript
// Semua input divalidasi dengan Zod schema di backend
// Contoh validasi transaksi:
const CreateTransactionSchema = z.object({
  clientId: z.string().uuid(),
  shiftId: z.string().uuid().optional(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().positive().max(9999),
    unitPrice: z.number().positive().max(99999999),
    discountAmount: z.number().min(0).max(99999999),
  })).min(1).max(100), // Max 100 item per transaksi
  paymentMethod: z.enum(["CASH", "QRIS", "BANK_TRANSFER"]),
  amountPaid: z.number().positive(),
  transactedAt: z.string().datetime(),
});
```

### 14.4 Rate Limiting Configuration

```typescript
// Rate limiting per tier
const RATE_LIMITS = {
  global: {
    windowMs: 60_000,    // 1 menit
    max: 100,            // 100 req per IP per menit
  },
  auth: {
    windowMs: 60_000,
    max: 20,             // 20 req auth per menit (login, refresh)
  },
  sync: {
    windowMs: 60_000,
    max: 30,             // 30 sync per menit
  },
  reports: {
    windowMs: 60_000,
    max: 20,             // Reports lebih berat
  },
};
```

### 14.5 Data Privacy

- **PII Protection:** Nomor HP supplier/pegawai dienkripsi di DB (AES-256)
- **Log Sanitization:** Password, token tidak pernah di-log
- **Data Retention:** Audit log disimpan minimum 1 tahun
- **Access Control:** Data keuangan (HPP, profit) hanya OWNER/MANAGER

### 14.6 Security Headers Checklist

| Header | Nilai | Tujuan |
|--------|-------|--------|
| Strict-Transport-Security | max-age=31536000 | Force HTTPS |
| X-Frame-Options | SAMEORIGIN | Prevent clickjacking |
| X-Content-Type-Options | nosniff | Prevent MIME sniff |
| Content-Security-Policy | Dikonfigurasi ketat | Prevent XSS |
| X-XSS-Protection | 1; mode=block | Browser XSS filter |
| Referrer-Policy | no-referrer-when-downgrade | Privacy |

### 14.7 OWASP Top 10 Mitigations

| OWASP | Risiko | Mitigasi |
|-------|--------|----------|
| A01: Broken Access Control | RBAC tidak konsisten | Middleware authorize wajib di semua route |
| A02: Cryptographic Failures | Password plaintext | bcrypt(12), HTTPS wajib |
| A03: Injection | SQL Injection | Prisma ORM parameterized queries |
| A04: Insecure Design | Logika bisnis celah | Business logic validation di service layer |
| A05: Security Misconfiguration | Default credentials | Seed hanya untuk dev, prod wajib ganti |
| A06: Vulnerable Components | Dependensi rentan | Dependabot + npm audit di CI |
| A07: Auth Failures | Session tidak direvoke | Refresh token rotation + revoke on logout |
| A08: Data Integrity Failures | Data dimanipulasi | Signed JWT, server-side validation |
| A09: Security Logging | Tidak ada audit trail | AuditLog model untuk semua operasi kritis |
| A10: SSRF | Request ke internal | No user-controlled URL fetch |

---

## 15. PERFORMANCE & OPTIMIZATION GUIDE

### 15.1 Database Query Optimization

```sql
-- Gunakan partial index untuk data aktif
CREATE INDEX idx_products_active_name
ON products (name)
WHERE is_active = TRUE AND deleted_at IS NULL;

-- Gunakan covering index untuk query umum
CREATE INDEX idx_transactions_summary
ON transactions (transacted_at, status)
INCLUDE (total_amount, cashier_id, shift_id)
WHERE status = 'COMPLETED';

-- Partisi tabel transactions per bulan (untuk data besar)
-- Implementasi di fase multi-cabang
```

### 15.2 Caching Strategy

```typescript
// Redis caching layers:
const CACHE_CONFIG = {
  // Dashboard data - refresh setiap 1 menit
  dashboardSummary: { ttl: 60 },

  // Laporan harian - cache 5 menit
  dailyReport: { ttl: 300 },

  // Product list - cache 5 menit, invalidate saat ada update
  productList: { ttl: 300, invalidateOn: ['product:create', 'product:update'] },

  // Session data via Redis
  session: { ttl: 7 * 24 * 60 * 60 }, // 7 hari
};

// Cache key convention:
// "cache:<entity>:<identifier>:<params_hash>"
// Contoh: "cache:dashboard:store1:summary"
//         "cache:report:sales:20261101-20261107"
```

### 15.3 Frontend Performance

```typescript
// Code splitting per route
const POSPage = lazy(() => import('./features/pos/pages/POSPage'));
const ReportsPage = lazy(() => import('./features/reports/pages/ReportsPage'));

// Virtual scrolling untuk daftar produk besar
// Menggunakan @tanstack/react-virtual

// Image lazy loading dengan IntersectionObserver
// Semua gambar produk menggunakan loading="lazy"

// IndexedDB query optimization:
// Selalu gunakan index yang terdefinisi di schema Dexie
// Hindari full table scan pada tabel besar (transactions)
```

### 15.4 API Response Optimization

```typescript
// Pagination wajib untuk semua list endpoint
// Default: limit=20, max=100

// Field selection (sparse fieldsets) untuk data besar
// GET /products?fields=id,name,pricePerKg,stockQty

// Compression
app.use(compression()); // gzip semua response > 1KB

// ETags untuk data yang jarang berubah
// Cache-Control headers sesuai tipe resource
```

### 15.5 Connection Pooling

```typescript
// Prisma connection pool
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  connectionLimit = 20  // Sesuaikan dengan RAM server
}

// Redis connection pool via ioredis
const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  lazyConnect: true,
});
```

---

## 16. OPERATIONAL & MAINTENANCE GUIDE

### 16.1 Monitoring

```bash
# Metrics yang dipantau:
# - API response time (p50, p95, p99)
# - Error rate (5xx per menit)
# - Database connection pool usage
# - Redis memory usage
# - Disk space (uploads, logs, DB)
# - Pending sync count (dari IndexedDB)

# Tools:
# - PM2 built-in monitoring untuk Node.js
# - PostgreSQL pg_stat_activity untuk query slow
# - Nginx access log → tail -f /var/log/nginx/access.log
```

### 16.2 Log Management

```typescript
// Log levels dan contoh:
// ERROR: Uncaught exception, DB connection fail
// WARN: Stok menipis, rate limit approaching
// INFO: Transaksi berhasil, user login/logout
// DEBUG: Query detail, cache hit/miss (hanya di dev)

// Rotasi log harian, retention 30 hari
// Format: JSON structured untuk kemudahan parsing
```

### 16.3 Disaster Recovery

| Scenario | RTO | RPO | Prosedur |
|----------|-----|-----|----------|
| Server restart | 2 menit | 0 | Docker restart otomatis |
| Database corruption | 2 jam | 24 jam | Restore dari backup terbaru |
| Data center down | 4 jam | 24 jam | Redeploy ke VPS lain |
| Offline tanpa batas | - | - | POS tetap berfungsi dari IndexedDB |

### 16.4 Routine Maintenance

| Frekuensi | Task |
|-----------|------|
| Harian | Review error log, cek disk space, cek backup success |
| Mingguan | Update dependencies minor, review performance metrics |
| Bulanan | Security patch, cleanup log lama, test restore backup |
| Kuartalan | Review dan update dokumentasi, capacity planning |

---

## 17. GLOSSARY & CONVENTIONS

### 17.1 Glossary

| Term | Definisi |
|------|----------|
| POS | Point of Sale — sistem kasir |
| PWA | Progressive Web App — web yang bisa diinstall |
| Offline-First | Strategi desain yang mengutamakan fungsi offline |
| IndexedDB | Database lokal di browser |
| Service Worker | Script background browser untuk cache dan sync |
| Barcode EAN-13 | Format barcode standar 13 digit |
| ESC/POS | Protocol perintah printer thermal |
| HPP | Harga Pokok Pembelian (harga beli) |
| Stok Opname | Pengecekan dan penyesuaian stok fisik vs sistem |
| Penyusutan | Berkurangnya berat/kualitas buah secara alami |
| Shift | Periode kerja kasir (pagi/sore/malam) |
| Void | Pembatalan transaksi yang sudah selesai |
| Soft Delete | Menandai record sebagai dihapus tanpa benar-benar menghapus dari DB |
| UUID | Universally Unique Identifier — ID unik format v4 |
| JWT | JSON Web Token — format token autentikasi |
| RBAC | Role-Based Access Control |
| p95 | Persentil ke-95 dari distribusi response time |

### 17.2 Konvensi Kode

```typescript
// Penamaan
// - File: kebab-case.ts (product.service.ts)
// - Class/Interface: PascalCase (ProductService)
// - Function/Method: camelCase (getProductById)
// - Konstanta: UPPER_SNAKE_CASE (MAX_RETRY_COUNT)
// - Database tabel: snake_case plural (product_items)

// Error handling — selalu gunakan custom error class:
class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 400,
    public details?: unknown
  ) { super(message); }
}

// Contoh:
throw new AppError('INSUFFICIENT_STOCK', 'Stok tidak mencukupi', 422, {
  productId, available: currentStock, requested: quantity
});
```

### 17.3 Git Workflow

```
Branch naming:
- main: production branch
- develop: integration branch
- feature/<ticket-id>-short-description
- bugfix/<ticket-id>-short-description
- hotfix/<ticket-id>-short-description

Commit message format (Conventional Commits):
feat(pos): add barcode scanning via USB HID
fix(auth): prevent session fixation on login
docs(api): update transaction endpoint spec
test(pos): add offline sync integration tests
refactor(stock): extract movement creation to service
chore(deps): update prisma to 5.7.0

PR Rules:
- Minimum 1 reviewer
- CI harus pass (lint, test, build)
- No direct push ke main/develop
```

### 17.4 ID Conventions

```
Nomor Transaksi : TRX-YYYYMMDD-NNNN  (TRX-20261107-0001)
Nomor Shift     : SHIFT-YYYYMMDD-NNN  (SHIFT-20261107-001)
Nomor PO        : PO-YYYYMMDD-NN     (PO-20261107-01)
Nomor Opname    : OPN-YYYYMMDD-NN    (OPN-20261107-01)
```

---

*Dokumen ini adalah acuan utama pengembangan Sistem Kasir Istana Buah Semarang.*  
*Setiap perubahan requirement wajib diupdate di dokumen ini dan dikomunikasikan ke seluruh tim.*  
*Versi terbaru selalu tersedia di repository: `/docs/PROJECT_DOCUMENTATION.md`*

---

**Dibuat oleh:** Tim Engineering Istana Buah  
**Tanggal:** 7 November 2026  
**Versi:** 1.0.0  
**Status:** Siap untuk Review & Development
