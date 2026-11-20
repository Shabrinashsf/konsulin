# PRD — Konsulin

> _"Mau konsul ke dosen? Konsulin aja."_
> Final Project Framework Programming (individu)
> Penyusun: Shabrina Amalia Safaana (5025241157)
> Versi dokumen: 3.2 — 20 November 2026 (ORM Prisma, database Supabase free plan, frontend React + TanStack Query, storage local/R2 via env)

---

## Daftar Isi

1. [Ringkasan Produk](#1-ringkasan-produk)
2. [Latar Belakang & Masalah](#2-latar-belakang--masalah)
3. [Tujuan & Non-Tujuan](#3-tujuan--non-tujuan)
4. [Pengguna & Role](#4-pengguna--role)
5. [Tech Stack & Keputusan Teknis](#5-tech-stack--keputusan-teknis)
6. [Arsitektur](#6-arsitektur)
7. [User Stories & Acceptance Criteria](#7-user-stories--acceptance-criteria)
8. [Business Rules](#8-business-rules)
9. [Matriks Otorisasi](#9-matriks-otorisasi)
10. [Notifikasi Email](#10-notifikasi-email)
11. [ERD & Skema Database](#11-erd--skema-database)
12. [Daftar Endpoint REST API](#12-daftar-endpoint-rest-api)
13. [Kebutuhan Non-Fungsional](#13-kebutuhan-non-fungsional)
14. [Strategi Testing](#14-strategi-testing)
15. [Prioritas & Milestone](#15-prioritas--milestone)
16. [TODO Opsional](#16-todo-opsional)
17. [Pemetaan ke Requirement Final Project](#17-pemetaan-ke-requirement-final-project)
18. [Desain File Upload](#18-desain-file-upload)
19. [Catatan Implementasi (Riwayat Revisi)](#19-catatan-implementasi-riwayat-revisi)

---

## 1. Ringkasan Produk

**Konsulin** adalah aplikasi web untuk mengelola proses bimbingan (konsultasi) antara dosen dan mahasiswa — Tugas Akhir, tesis, disertasi beserta proposalnya, riset, publikasi, lomba, maupun project luar. Versi pertama dikembangkan untuk **skala satu departemen** dengan lima program studi (S1, S2, S3). Dosen membuat _project bimbingan_, mengundang mahasiswa, mengatur jadwal ketersediaan, dan memberi feedback serta checklist revisi pada setiap versi draft yang diunggah mahasiswa. Setiap bimbingan yang selesai tercatat di **logbook**, dan event penting dikirim lewat **email** (dengan undangan kalender `.ics`).

## 2. Latar Belakang & Masalah

| Masalah saat ini                                | Dampak                                          | Solusi di aplikasi                                                |
| ----------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------- |
| Draft dikirim lewat chat/email, versi tercampur | Dosen bingung versi terbaru, revisi lama hilang | Folder submission + versioning immutable (v1, v2, …)              |
| Feedback tersebar di chat                       | Mahasiswa lupa poin revisi                      | Feedback per versi + **checklist revisi** yang diverifikasi dosen |
| Jadwal bimbingan diatur manual                  | Bentrok, dosen sedang berhalangan               | Office hours mingguan, blacklist tanggal, deteksi bentrok         |
| Logbook bimbingan diisi manual                  | Sering lupa/tidak lengkap                       | Logbook otomatis dari bimbingan yang selesai                      |

## 3. Tujuan & Non-Tujuan

**Tujuan**

- G1. Satu tempat untuk siklus bimbingan: undangan → jadwal → draft → feedback → revisi → logbook.
- G2. Privasi progres: pada bimbingan tugas akhir (TA, tesis, disertasi, dan proposalnya), mahasiswa tidak dapat melihat progres teman satu kelompok bimbingan.
- G4. Mendukung jenjang S1, S2, dan S3 dalam satu departemen, dengan tipe bimbingan yang sesuai jenjangnya.
- G3. Memenuhi seluruh requirement teknis Final Project (JWT + RBAC, CRUD, file upload, search/filter/pagination, email, E2E test ≥ 70% coverage).

**Non-Tujuan (out of scope)**

- Role admin & manajemen akun dosen melalui aplikasi (akun dosen di-_seed_ langsung oleh developer).
- Co-supervisor / lebih dari satu dosen dalam satu project.
- Bimbingan kelompok (satu sesi untuk banyak mahasiswa).
- Restore, archive/unarchive, dan leave project.
- Export logbook PDF, tabel/endpoint log email, retry otomatis email gagal.
- Penentuan syarat maju sidang (didiskusikan offline).
- Integrasi Google Calendar via OAuth/API (diganti `.ics` + link).
- Chat real-time, aplikasi mobile, SSO/myITS.
- Multi-departemen / multi-fakultas (skala awal hanya satu departemen).

## 4. Pengguna & Role

| Role                      | Deskripsi                                                                                     | Cara akun dibuat         |
| ------------------------- | --------------------------------------------------------------------------------------------- | ------------------------ |
| **Mahasiswa** (`student`) | Mengikuti project lewat undangan, mengajukan bimbingan, upload draft, menindaklanjuti revisi  | Registrasi mandiri       |
| **Dosen** (`lecturer`)    | Membuat & mengelola project, mengundang mahasiswa, mengatur jadwal, memberi feedback & revisi | Di-_seed_ oleh developer |

Dalam satu project hanya ada **satu dosen** (pembuat/owner project) dan **0..n mahasiswa** anggota.

### 4.1 Program Studi (skala departemen)

Data program studi bersifat master data, di-_seed_ oleh developer, dan dipakai saat registrasi mahasiswa.

| Program Studi (`study_programs.name`) | Jenjang (diturunkan dari nama) |
| ------------------------------------- | ------------------------------ |
| S1 Teknik Informatika                 | S1                             |
| S1 Rekayasa Perangkat Lunak           | S1                             |
| S1 Rekayasa Kecerdasan Artifisial     | S1                             |
| S2 Magister Teknik Informatika        | S2                             |
| S3 Doktor Ilmu Komputer               | S3                             |

Jenjang **tidak punya kolom sendiri**: ia menyatu di awal nama prodi dan diturunkan lewat satu helper di kode, sehingga hanya ada satu sumber kebenaran.

```ts
export type Degree = "S1" | "S2" | "S3";

export function degreeOf(programName: string): Degree {
  const m = /^(S[123])\s/.exec(programName);
  if (!m)
    throw new Error(
      `Nama prodi harus diawali jenjang (S1/S2/S3): "${programName}"`,
    );
  return m[1] as Degree;
}
```

Format nama dijaga oleh CHECK di database (`name ~ '^S[123] '`) dan oleh seeder.

Dosen tidak terikat ke satu prodi — dosen dapat membimbing mahasiswa dari prodi mana pun di departemen.

### 4.2 Tipe Project Bimbingan

| Tipe (`project_type`)      | Label                                | Jenjang mahasiswa | `track_mode` |
| -------------------------- | ------------------------------------ | ----------------- | ------------ |
| `s1_thesis_proposal`       | Proposal Tugas Akhir                 | S1                | individual   |
| `s1_thesis`                | Tugas Akhir                          | S1                | individual   |
| `s2_thesis_proposal`       | Proposal Tesis                       | S2                | individual   |
| `s2_thesis`                | Tesis                                | S2                | individual   |
| `s3_dissertation_proposal` | Proposal Disertasi                   | S3                | individual   |
| `s3_dissertation`          | Disertasi                            | S3                | individual   |
| `research`                 | Riset / Penelitian                   | Semua             | shared       |
| `publication`              | Publikasi Ilmiah (jurnal/konferensi) | Semua             | shared       |
| `competition`              | Lomba                                | Semua             | shared       |
| `external_project`         | Project Luar                         | Semua             | shared       |

- Tipe dengan jenjang spesifik hanya dapat beranggotakan mahasiswa dengan jenjang prodi yang sama (BR-17).
- Pemetaan tipe → jenjang & `track_mode` disimpan sebagai konstanta di kode domain (`PROJECT_TYPE_RULES`), bukan tabel, karena jarang berubah.

## 5. Tech Stack & Keputusan Teknis

| Aspek                   | Keputusan                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend                 | NestJS (Node.js, TypeScript)                                                                                                                                                                                                                                                                                                                                                                                                      |
| Frontend                | **React 19 + Vite**, SPA murni (**client-side rendering**), React Router                                                                                                                                                                                                                                                                                                                                                          |
| Server state (frontend) | **TanStack Query v5** (`@tanstack/react-query`; nama baru dari _React Query_) — `useQuery` / `useMutation`, cache per _query key_, invalidasi setelah mutasi                                                                                                                                                                                                                                                                      |
| HTTP client (frontend)  | axios — interceptor `Authorization: Bearer`, refresh token _single-flight_, `onUploadProgress` untuk progress upload                                                                                                                                                                                                                                                                                                              |
| Form (frontend)         | React Hook Form + zod (validasi awal di client; server tetap patokan)                                                                                                                                                                                                                                                                                                                                                             |
| Package manager         | pnpm — monorepo pnpm workspace (`apps/api`, `apps/web`)                                                                                                                                                                                                                                                                                                                                                                           |
| Database                | PostgreSQL di **Supabase** (free plan) — hanya dipakai sebagai Postgres terkelola; Auth/Storage/Realtime Supabase tidak dipakai. Dev & test memakai Postgres Docker lokal                                                                                                                                                                                                                                                         |
| ORM / migrasi           | **Prisma ORM** (`@prisma/client` + driver adapter `@prisma/adapter-pg`/`pg`) + `prisma migrate`. Constraint yang belum bisa ditulis di `schema.prisma` (exclusion, CHECK, sebagian index) ditulis di migrasi SQL kustom — lihat [11.4](#114-implementasi-di-prisma)                                                                                                                                                               |
| Autentikasi             | JWT — access token 15 menit (disimpan di memory client, header `Authorization: Bearer`), refresh token 7 hari (cookie `httpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`), hash refresh token disimpan di DB, rotation. Refresh token lama yang dipakai ulang → seluruh refresh token user dicabut                                                                                                                            |
| Password hashing        | argon2id (library `argon2`); hash disimpan di kolom `users.password`                                                                                                                                                                                                                                                                                                                                                              |
| Otorisasi               | RBAC global (`@Roles('lecturer' \| 'student')`) + policy berbasis resource (owner project, anggota project, pemilik track)                                                                                                                                                                                                                                                                                                        |
| File storage            | `StoragePort` dengan dua adapter: `LocalStorageAdapter` (file system server) dan `R2StorageAdapter` (Cloudflare R2, S3-compatible via `@aws-sdk/client-s3`). Driver untuk upload baru dipilih lewat env `STORAGE_DRIVER=local\|r2` (default `local`); driver setiap file dicatat di `submission_versions.storage_driver` sehingga file lama tetap terbaca setelah driver diganti                                                  |
| Aturan file             | PDF, DOCX, ZIP; maks 50 MB (configurable via env); validasi magic bytes + ekstensi                                                                                                                                                                                                                                                                                                                                                |
| Email                   | SMTP Gmail (`smtp.gmail.com:465`, App Password) via `@nestjs-modules/mailer` (nodemailer) + template Handlebars; dikirim async via `@nestjs/event-emitter`; kegagalan dicatat di Logger dan tidak menggagalkan request                                                                                                                                                                                                            |
| Kalender                | Lampiran `.ics` (`METHOD:REQUEST` / `METHOD:CANCEL`, `UID` = `{consultationId}@konsulin` + `SEQUENCE`) + link "Tambah ke Google Calendar"                                                                                                                                                                                                                                                                                         |
| Scheduler               | `@nestjs/schedule` (`timeZone: 'Asia/Jakarta'`) untuk reminder H-1; pengiriman sekali dijamin kolom `consultations.reminder_sent_at`                                                                                                                                                                                                                                                                                              |
| Timezone                | `timestamptz` (UTC) di DB, ditampilkan Asia/Jakarta; tanggal blacklist disimpan sebagai `date` lokal WIB                                                                                                                                                                                                                                                                                                                          |
| Delete                  | Soft delete (`deleted_at`) untuk `users`, `projects`, dan `submission_folders`. Soft delete project tidak cascade — data turunan otomatis tersembunyi karena query selalu join ke project yang belum terhapus. Anggota, blacklist, dan feedback di-hard delete; bimbingan tidak dihapus (cukup `cancelled`); versi immutable. Filter `deleted_at IS NULL` diterapkan konsisten di repository (atau lewat Prisma Client Extension) |
| Validasi                | `class-validator` + `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`                                                                                                                                                                                                                                                                                                                            |
| Config                  | `@nestjs/config` + skema zod (variabel R2 wajib hanya jika `STORAGE_DRIVER=r2`)                                                                                                                                                                                                                                                                                                                                                   |
| Dokumentasi API         | Swagger / OpenAPI (`@nestjs/swagger` + CLI plugin) di `/api/docs` — dihasilkan otomatis dari decorator & DTO sehingga selalu sinkron dengan kode                                                                                                                                                                                                                                                                                  |
| Keamanan                | `helmet`, CORS whitelist origin frontend + `credentials: true`, `@nestjs/throttler` (login/register)                                                                                                                                                                                                                                                                                                                              |
| Testing                 | Jest + Supertest + `@nestjs/testing` (Postgres test via Docker lokal), `STORAGE_DRIVER=local` dengan direktori temp                                                                                                                                                                                                                                                                                                               |
| Seeder                  | `pnpm db:seed` (`prisma/seed.ts`) — prodi, akun dosen, data demo                                                                                                                                                                                                                                                                                                                                                                  |

### 5.1 Variabel Environment

**Backend (`apps/api/.env`)**

| Variabel                                                                 | Contoh                                                                                                                                                                                                            | Keterangan                                                                            |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                           | dev/test: `postgresql://postgres:postgres@localhost:5432/konsulin`; demo/produksi: string **Session pooler** Supabase (`postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres`) | Koneksi PostgreSQL. Dipakai Prisma Client (lewat driver adapter) dan `prisma migrate` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`                               | string acak ≥ 32 karakter                                                                                                                                                                                         | Secret berbeda untuk access & refresh                                                 |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL`                                     | `15m` / `7d`                                                                                                                                                                                                      | Masa berlaku token                                                                    |
| `FRONTEND_ORIGIN`                                                        | `http://localhost:5173`                                                                                                                                                                                           | Whitelist CORS                                                                        |
| `SMTP_HOST` / `SMTP_PORT`                                                | `smtp.gmail.com` / `465`                                                                                                                                                                                          | SMTP Gmail (TLS)                                                                      |
| `SMTP_USER` / `SMTP_PASS`                                                | `konsulin.app@gmail.com` / App Password                                                                                                                                                                           | App Password dari akun Google ber-2FA, bukan password akun                            |
| `MAIL_FROM`                                                              | `Konsulin <konsulin.app@gmail.com>`                                                                                                                                                                               | Nama & alamat pengirim                                                                |
| `STORAGE_DRIVER`                                                         | `local` \| `r2`                                                                                                                                                                                                   | Driver untuk upload **baru**                                                          |
| `UPLOAD_DIR` / `UPLOAD_TMP_DIR`                                          | `./uploads` / `./uploads/tmp`                                                                                                                                                                                     | Dipakai driver `local` & file sementara multer                                        |
| `MAX_UPLOAD_MB`                                                          | `50` (test: `1`)                                                                                                                                                                                                  | Batas ukuran file                                                                     |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | —                                                                                                                                                                                                                 | Wajib jika `STORAGE_DRIVER=r2` **atau** masih ada file lama ber-driver `r2`           |
| `SEED_LECTURER_PASSWORD`                                                 | —                                                                                                                                                                                                                 | Password default akun dosen hasil seed                                                |

**Frontend (`apps/web/.env`)**

| Variabel            | Contoh    | Keterangan                                                     |
| ------------------- | --------- | -------------------------------------------------------------- |
| `VITE_API_BASE_URL` | `/api/v1` | Saat dev diteruskan oleh proxy Vite ke `http://localhost:3000` |

### 5.2 Prisma ORM & Supabase (free plan)

**Prisma**

- Prisma 7 ke atas **mewajibkan driver adapter**: `PrismaClient` dibuat dengan `adapter`, tidak bisa lagi `new PrismaClient()` polos. Koneksi dan lokasi schema/migrasi diatur di `prisma.config.ts`.

```ts
// shared/prisma/prisma.service.ts
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>("DATABASE_URL"),
      }),
    });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

- Alur kerja migrasi:

| Tahap                | Perintah                                                                         | Keterangan                                                                      |
| -------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Ubah schema          | `prisma migrate dev --name <nama>`                                               | Dijalankan ke Postgres Docker lokal (sekaligus dipakai sebagai shadow database) |
| Tambah SQL kustom    | `prisma migrate dev --create-only` → edit `migration.sql` → `prisma migrate dev` | Untuk exclusion constraint, CHECK, extension, index khusus                      |
| Terapkan ke Supabase | `prisma migrate deploy` (dengan `DATABASE_URL` Supabase)                         | Tidak membuat shadow DB, aman untuk database remote                             |
| Test E2E             | `prisma migrate deploy` ke DB test lokal sebelum suite                           | Constraint kustom ikut ter-test                                                 |

**Supabase (free plan)**

- Batas free plan: 2 proyek aktif, database 500 MB per proyek, egress 5 GB, **proyek di-pause setelah 1 minggu tidak aktif** (data tetap ada, tetapi aplikasi mati sampai di-resume manual dari dashboard), dan tanpa backup otomatis. Untuk skala tugas ini cukup, dengan konsekuensi:
  - Pastikan proyek aktif (resume bila perlu) sebelum merekam demo dan sebelum presentasi/penilaian.
  - Buat backup manual (`pg_dump`) sebelum demo; seeder membuat data demo bisa dibuat ulang kapan saja.
- **Koneksi:** gunakan string **Session pooler** (port `5432`) untuk `DATABASE_URL`. Server NestJS berjalan terus-menerus, mode session mendukung transaksi interaktif dan prepared statement, dan koneksi _direct_ Supabase memerlukan IPv6 atau add-on IPv4. String Transaction pooler (port `6543`, butuh `pgbouncer=true`) hanya perlu bila nanti di-deploy serverless.
- **Extension:** `btree_gist` (exclusion constraint) dan `pg_trgm` (index pencarian) diaktifkan lewat `CREATE EXTENSION IF NOT EXISTS ...` di migrasi pertama; verifikasi ketersediaannya di dashboard (Database → Extensions) sebelum migrasi pertama ke Supabase.
- **Keamanan:** Supabase mengekspos schema `public` lewat Data API (PostgREST). Karena seluruh akses data lewat NestJS, nonaktifkan Data API atau aktifkan Row Level Security di semua tabel tanpa policy, supaya tabel tidak bisa dibaca langsung memakai anon key. Pastikan role yang dipakai Prisma tetap dapat membaca/menulis tabel (pemilik tabel / `postgres`).
- Supabase Auth, Storage, dan Realtime **tidak dipakai**: autentikasi memakai JWT sendiri, file memakai local/R2.

### 5.3 Catatan pemilihan teknologi

| Pilihan                                  | Alasan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **TanStack Query** (bukan "React Query") | Keduanya library yang sama. _React Query_ diganti nama menjadi _TanStack Query_ ketika library ini dibuat framework-agnostic; adapter React tetap dipasang sebagai `@tanstack/react-query`. Dipilih karena cache per query key, invalidasi setelah mutasi, status loading/error bawaan, dan `keepPreviousData` untuk pagination mengurangi banyak state manual (`useEffect` + `useState`).                                                                                                                                                                         |
| **Swagger / OpenAPI**                    | Standar dokumentasi API di ekosistem NestJS (`@nestjs/swagger`). Spesifikasi dihasilkan dari decorator controller dan DTO `class-validator` (dengan CLI plugin) sehingga tidak perlu menulis dokumen terpisah. Swagger UI di `/api/docs` mendukung tombol _Authorize_ untuk Bearer token, sehingga tiap endpoint bisa dicoba langsung saat demo per user story. Spesifikasi OpenAPI yang sama dapat dipakai untuk generate tipe frontend bila diperlukan. Swagger tidak diwajibkan oleh spesifikasi Final Project; ia dipilih untuk memenuhi NFR-10 (dokumentasi). |

## 6. Arsitektur

**Modular Monolith** + DDD selektif pada modul inti + Hexagonal (ports & adapters) untuk infrastruktur (storage, mail) + event-driven untuk notifikasi. Frontend adalah SPA terpisah yang hanya berbicara ke REST API.

```
konsulin/
├─ apps/
│  ├─ api/                 # NestJS
│  └─ web/                 # React + Vite (SPA)
├─ pnpm-workspace.yaml
└─ package.json
```

### 6.1 Backend (`apps/api`)

```
apps/api/src/
├─ main.ts
├─ app.module.ts
├─ config/                 # skema env (zod)
├─ prisma/                 # PrismaModule, PrismaService (driver adapter pg)
├─ shared/
│  ├─ auth/                # JwtAuthGuard, RolesGuard, @CurrentUser, @Roles, @Public
│  ├─ http/                # ResponseInterceptor, HttpExceptionFilter, PaginationQueryDto
│  ├─ storage/             # StoragePort, StorageService, LocalStorageAdapter, R2StorageAdapter
│  ├─ mail/                # MailPort, SmtpMailAdapter, FakeMailAdapter (test), templates/
│  ├─ calendar/            # IcsBuilder, GoogleCalendarLinkBuilder
│  ├─ upload/              # FileValidationPipe (magic bytes, ukuran)
│  └─ time/                # helper timezone Asia/Jakarta
└─ modules/
   ├─ identity/            # auth, users, refresh token            (layered)
   ├─ project/             # ⭐ project, member, invitation         (domain + state machine)
   ├─ schedule/            # ⭐ office hours, blacklist, slot       (domain: kalkulasi slot)
   ├─ consultation/        # ⭐ bimbingan + logbook                 (domain + state machine)
   ├─ submission/          # ⭐ folder & versi                      (domain: versioning)
   ├─ feedback/            # feedback + revision items             (domain + state machine)
   ├─ monitoring/          # query monitoring mahasiswa             (read model)
   └─ notification/        # listener event → email, cron reminder H-1
```

Di luar `src/`: `apps/api/prisma/` (`schema.prisma`, `migrations/`, `seed.ts`) dan `apps/api/prisma.config.ts`.

Struktur modul inti (contoh `consultation/`):

```
consultation/
├─ domain/            # Consultation (entity), ConsultationStatus, TimeRange (value object), errors
├─ application/       # ConsultationService (use case), events
├─ infrastructure/    # ConsultationRepository (Prisma)
└─ presentation/      # ConsultationController, LogbookController, DTO, policy
```

**Domain events**

| Event                                                                                   | Dipancarkan oleh | Didengar oleh |
| --------------------------------------------------------------------------------------- | ---------------- | ------------- |
| `InvitationCreated`                                                                     | project          | notification  |
| `ConsultationRequested`                                                                 | consultation     | notification  |
| `ConsultationStatusChanged` (approved / rejected / scheduled / rescheduled / cancelled) | consultation     | notification  |
| `SubmissionVersionUploaded`                                                             | submission       | notification  |
| `FeedbackCreated`                                                                       | feedback         | notification  |

Payload event membawa aktor dan konteks (mis. `origin: 'lecturer_scheduled'`, `cancelledBy`) sehingga template email bisa dipilih tanpa menyimpan kolom tambahan di DB.

### 6.2 Frontend (`apps/web`) — React + TanStack Query (CSR)

```
apps/web/src/
├─ main.tsx                # QueryClientProvider, RouterProvider, AuthProvider
├─ lib/
│  ├─ api.ts               # instance axios + interceptor (Bearer, refresh single-flight)
│  ├─ auth.ts              # access token di memory (variabel modul) + AuthContext (user, role)
│  ├─ query-client.ts      # QueryClient (staleTime, retry: jangan retry 4xx)
│  └─ datetime.ts          # format tanggal Asia/Jakarta (Intl.DateTimeFormat)
├─ features/               # satu folder per domain, sejajar dengan modul backend
│  ├─ auth/                # login, register, me
│  ├─ projects/
│  │  ├─ api.ts            # fungsi pemanggil endpoint
│  │  ├─ queries.ts        # projectKeys, useProjects, useProject, useCreateProject, ...
│  │  └─ components/
│  ├─ invitations/  schedule/  consultations/  submissions/  feedback/  monitoring/
├─ routes/                 # halaman + ProtectedRoute (cek login) + RoleRoute (cek role)
└─ components/ui/          # komponen UI umum
```

**Alur autentikasi di client**

1. Saat aplikasi dimuat → `POST /auth/refresh` (cookie dikirim otomatis, `withCredentials: true`) → access token disimpan di memory → `GET /auth/me` → render route sesuai role. Gagal → arahkan ke `/login`.
2. Request interceptor menambahkan `Authorization: Bearer <token>`.
3. Response interceptor: jika 401 (bukan dari `/auth/*`) → jalankan refresh **single-flight** lalu ulangi request sekali. Jika refresh gagal → hapus token, `queryClient.clear()`, arahkan ke `/login`.
4. Logout → `POST /auth/logout`, hapus token di memory, `queryClient.clear()`.

```ts
let refreshPromise: Promise<string> | null = null;

function refreshAccessToken() {
  // Banyak query bisa kena 401 bersamaan; tanpa single-flight, refresh kedua memakai
  // token yang sudah dirotasi → dianggap reuse → semua sesi user dicabut.
  refreshPromise ??= axios
    .post("/api/v1/auth/refresh", null, { withCredentials: true })
    .then((res) => {
      setAccessToken(res.data.data.accessToken);
      return res.data.data.accessToken;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}
```

Catatan: `React.StrictMode` menjalankan effect dua kali di mode dev, jadi refresh saat aplikasi dimuat juga harus lewat fungsi single-flight ini.

**Konvensi TanStack Query**

- Query key hierarkis per domain, mis. `['projects', 'list', filters]`, `['projects', 'detail', id]`, `['folders', folderId, 'versions']`.
- Mutasi meng-_invalidate_ key terkait di `onSuccess` (mis. upload versi → invalidate `['folders', folderId]`; review bimbingan → invalidate `['consultations']`).
- List ber-pagination memakai `placeholderData: keepPreviousData` agar tabel tidak berkedip saat ganti halaman.
- State search/filter/pagination disimpan di URL (`useSearchParams`) sehingga bisa di-refresh dan dibagikan.
- `retry` dimatikan untuk error 4xx (401/403/404/409 tidak perlu diulang).

**Cookie & origin**

- Dev: proxy Vite (`server.proxy['/api'] → http://localhost:3000`) sehingga frontend dan API satu origin dan cookie `SameSite=Strict` terkirim.
- Produksi: SPA (hasil `vite build`) dan API disajikan di bawah domain yang sama lewat reverse proxy (mis. `/` → static, `/api` → NestJS).

## 7. User Stories & Acceptance Criteria

### US-01 Registrasi & autentikasi

_Sebagai mahasiswa, saya ingin mendaftar dan login; sebagai dosen saya ingin login dengan akun yang sudah disediakan._

- Registrasi (khusus mahasiswa): **nama, NRP, email, password, program studi, angkatan**.
  - Nama: wajib, 3–100 karakter.
  - NRP: 10 digit angka, unik.
  - Email: format valid, unik.
  - Password: min 8 karakter, ada huruf besar, huruf kecil, dan angka.
  - Program studi: wajib, salah satu dari 5 prodi (dropdown dari `GET /study-programs`).
  - Angkatan: tahun 4 digit, antara 2000 dan tahun berjalan.
- Login mengembalikan access token + set cookie refresh token.
- Refresh token dirotasi setiap dipakai; token lama tidak bisa dipakai ulang (401).
- Logout mencabut refresh token dan menghapus cookie.

### US-02 Manajemen project bimbingan

_Sebagai dosen, saya ingin membuat dan mengelola project bimbingan._

- Field: judul, deskripsi, tipe (lihat [4.2](#42-tipe-project-bimbingan)), tanggal mulai, tanggal selesai (opsional).
- Tipe tugas akhir (proposal/TA, proposal/tesis, proposal/disertasi) → `track_mode = individual` (kelompok bimbingan; progres tiap mahasiswa privat). Tipe umum (riset, publikasi, lomba, project luar) → `track_mode = shared` (anggota melihat progres bersama).
- Tidak ada batas jumlah mahasiswa per project.
- List project (dosen: miliknya; mahasiswa: yang diikuti) dengan search judul, filter tipe, jenjang & periode, pagination & sort.
- Edit dan soft delete hanya oleh dosen pemilik.
- Dosen dapat melihat dan mengeluarkan anggota.

### US-03 Undangan project

_Sebagai dosen, saya ingin mengundang mahasiswa; sebagai mahasiswa saya ingin menerima atau menolak undangan._

- Dosen mencari mahasiswa terdaftar (search nama/NRP, filter prodi & angkatan) lalu mengirim undangan → email ke mahasiswa. Untuk tipe berjenjang, hasil pencarian otomatis hanya menampilkan mahasiswa jenjang yang sesuai.
- Mengundang mahasiswa yang jenjangnya tidak sesuai tipe project ditolak (400, `DEGREE_MISMATCH`).
- Undangan berlaku 7 hari (dicek saat diakses/direspons).
- Mahasiswa merespons dengan satu endpoint: `accept` atau `decline`.
- Dosen dapat membatalkan (revoke) undangan pending.
- Tidak boleh ada dua undangan pending untuk mahasiswa yang sama di project yang sama; anggota tidak dapat diundang lagi (409).

### US-04 Jadwal ketersediaan dosen

_Sebagai dosen, saya ingin mengatur office hours mingguan dan memblacklist tanggal tertentu._

- Office hours diatur sekaligus untuk satu minggu (`PUT` mengganti seluruh jadwal): per item hari, jam mulai–selesai, durasi slot (15/30/45/60 menit), lokasi default.
- Blacklist tanggal (per dosen) + alasan opsional; pada tanggal tersebut tidak ada bimbingan yang bisa diajukan maupun dijadwalkan.
- Mahasiswa melihat slot tersedia dosen pada rentang tanggal (slot = office hours − blacklist − bimbingan aktif).

### US-05 Pengajuan & penjadwalan bimbingan

_Sebagai mahasiswa, saya ingin mengajukan bimbingan; sebagai dosen saya ingin menyetujui/menolak, menjadwalkan, mengubah jadwal, atau membatalkan bimbingan._

- Mahasiswa memilih slot tersedia, mengisi topik, agenda, dan mode (offline/online) → email ke dosen.
- Dosen me-_review_ pengajuan dengan satu endpoint: `approve` atau `reject` (alasan wajib untuk reject) → email ke mahasiswa.
- Dosen dapat langsung menjadwalkan bimbingan untuk satu mahasiswa anggota (status langsung `approved`) → email ke mahasiswa.
- Dosen dapat me-_reschedule_; dosen maupun mahasiswa dapat membatalkan → email ke pihak lain.
- Email approve/jadwal/reschedule berisi lampiran `.ics` (`REQUEST`) + link Google Calendar; email batal berisi `.ics` (`CANCEL`).
- Bentrok jadwal dosen ditolak (409), dijamin di level database.

### US-06 Penyelesaian bimbingan & logbook

_Sebagai dosen, saya ingin menandai bimbingan selesai beserta ringkasan; sebagai mahasiswa saya ingin melihat logbook bimbingan saya._

- Bimbingan `approved` yang waktunya sudah lewat dapat ditandai `completed` dengan ringkasan (teks biasa).
- Logbook = daftar bimbingan `completed` (tanggal, topik, ringkasan), dapat difilter mahasiswa dan rentang tanggal, dengan pagination.

**Fungsi logbook**

| Untuk siapa | Kegunaan                                                                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mahasiswa   | Bukti riwayat bimbingan yang lazim diminta saat mendaftar seminar proposal/sidang (kartu/lembar asistensi), sekaligus pengingat apa yang disepakati di tiap pertemuan. |
| Dosen       | Melihat jejak pertemuan dengan tiap mahasiswa (seberapa sering, apa yang dibahas) tanpa harus mengingat atau mencatat manual.                                          |

Bedanya dengan feedback: **feedback** menempel pada dokumen draft (komentar atas versi tertentu), sedangkan **logbook** mencatat hasil **pertemuan** bimbingan (apa yang didiskusikan, keputusan, langkah berikutnya). Logbook tidak punya tabel sendiri — isinya diambil dari bimbingan berstatus `completed` beserta kolom `summary`.

### US-07 Folder submission & versi draft

_Sebagai mahasiswa, saya ingin mengumpulkan draft dalam folder dengan riwayat versi._

- Folder: judul, deskripsi, deadline opsional (hanya dosen yang dapat menetapkan deadline). Mahasiswa maupun dosen dapat membuat folder.
- Upload versi baru: file (PDF/DOCX/ZIP, ≤ 50 MB) + catatan → email ke dosen. Nomor versi auto-increment per folder (v1, v2, …); versi immutable.
- Pada `individual` track, folder milik satu mahasiswa dan hanya terlihat oleh mahasiswa tersebut + dosen.
- Download file lewat endpoint terotorisasi.
- Search folder (judul), filter (mahasiswa, ada deadline, lewat deadline), pagination.

### US-08 Feedback & checklist revisi

_Sebagai dosen, saya ingin memberi feedback beserta daftar revisi pada versi tertentu; sebagai mahasiswa saya ingin menandai revisi yang sudah saya kerjakan._

- Feedback (teks biasa) dibuat **sekaligus** dengan 0..n item revisi pada satu versi → email ke mahasiswa.
- Mahasiswa menandai item `addressed` dengan menunjuk versi yang memperbaikinya (harus versi lebih baru di folder yang sama).
- Dosen me-_review_ item dengan satu endpoint: `verify` atau `reopen`.
- Filter item revisi per status, mahasiswa, folder.

### US-09 Monitoring mahasiswa bimbingan

_Sebagai dosen, saya ingin memfilter mahasiswa bimbingan saya berdasarkan progres._

- Satu endpoint list mahasiswa lintas project milik dosen dengan: bimbingan terakhir, jumlah bimbingan selesai, jumlah revisi terbuka, deadline terdekat.
- Filter: project, tipe project, **program studi, jenjang, angkatan**, punya revisi terbuka, lewat deadline, tidak bimbingan sejak tanggal tertentu. Search nama/NRP. Pagination & sort.

### US-10 Notifikasi email

Lihat [Bagian 10](#10-notifikasi-email).

## 8. Business Rules

| ID    | Aturan                                                                                                                                                                                                                                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BR-01 | Hanya dosen yang dapat membuat project; pembuat menjadi pemilik (`projects.lecturer_id`). Satu project hanya punya satu dosen.                                                                                                                                                                                   |
| BR-02 | Mahasiswa hanya menjadi anggota project melalui undangan yang di-_accept_.                                                                                                                                                                                                                                       |
| BR-03 | Undangan kedaluwarsa 7 hari setelah dibuat; undangan pending yang lewat `expires_at` diperlakukan sebagai `expired` saat dibaca dan ditolak (409) saat direspons.                                                                                                                                                |
| BR-04 | `track_mode` dan jenjang wajib diturunkan dari tipe project lewat `PROJECT_TYPE_RULES` (tidak disimpan di DB) sesuai tabel [4.2](#42-tipe-project-bimbingan): tipe tugas akhir S1/S2/S3 → `individual`, tipe umum → `shared`. Tipe tidak dapat diubah jika project sudah memiliki anggota atau undangan pending. |
| BR-05 | Pada `individual`, mahasiswa hanya dapat mengakses bimbingan, folder, versi, feedback, revisi, dan logbook miliknya sendiri. Dosen pemilik dapat mengakses semuanya. Pada `shared`, semua anggota dapat melihat seluruh data project, tetapi aksi tulis tetap mengikuti kepemilikan.                             |
| BR-06 | Mahasiswa hanya dapat mengajukan bimbingan pada slot office hours dosen, bukan pada tanggal blacklist, minimal 1 jam dari sekarang, maksimal 60 hari ke depan. Dosen yang menjadwalkan sendiri boleh di luar office hours, tetapi tidak pada tanggal blacklist.                                                  |
| BR-07 | Rentang waktu bimbingan berstatus `requested`/`approved` milik dosen yang sama tidak boleh overlap (exclusion constraint).                                                                                                                                                                                       |
| BR-08 | Transisi status bimbingan: `requested → approved \| rejected \| cancelled`; `approved → completed \| cancelled`. Status `rejected`, `completed`, `cancelled` final. Reschedule hanya untuk `requested`/`approved`.                                                                                               |
| BR-09 | `completed` hanya dapat di-set setelah `start_at` lewat, oleh dosen pemilik project.                                                                                                                                                                                                                             |
| BR-10 | Menambah tanggal blacklist yang sudah memiliki bimbingan aktif ditolak (409).                                                                                                                                                                                                                                    |
| BR-11 | Versi submission immutable; nomor versi = `max(version_number) + 1` dalam folder, dibuat di dalam transaksi.                                                                                                                                                                                                     |
| BR-12 | Hanya dosen yang dapat menetapkan/mengubah deadline folder.                                                                                                                                                                                                                                                      |
| BR-13 | Item revisi: `open → addressed` (mahasiswa); `addressed → verified \| reopened` (dosen); `reopened → addressed` (mahasiswa). `verified` final.                                                                                                                                                                   |
| BR-14 | Saat menandai `addressed`, `addressed_in_version_id` wajib dan harus versi di folder yang sama dengan `version_number` lebih besar dari versi asal feedback.                                                                                                                                                     |
| BR-15 | Soft delete project tidak cascade; semua query data turunan selalu memfilter project dengan `deleted_at IS NULL` sehingga data turunan ikut tersembunyi.                                                                                                                                                         |
| BR-16 | Reminder H-1 hanya terkirim sekali per bimbingan: job mengklaim baris secara atomik dengan mengisi `consultations.reminder_sent_at` sebelum mengirim email.                                                                                                                                                      |
| BR-17 | Project bertipe berjenjang (`s1_*`, `s2_*`, `s3_*`) hanya dapat mengundang mahasiswa yang jenjang prodinya sama (S1/S2/S3). Jenjang mahasiswa = `degreeOf(study_programs.name)`. Tipe umum terbuka untuk semua jenjang.                                                                                          |
| BR-18 | Mahasiswa wajib memilih prodi yang terdaftar dan mengisi angkatan antara 2000 dan tahun berjalan. Prodi dan angkatan tidak dapat diubah sendiri oleh mahasiswa setelah registrasi (perubahan dilakukan developer langsung di DB).                                                                                |

## 9. Matriks Otorisasi

Keterangan: ✅ diizinkan · 🔸 bersyarat · ❌ ditolak (403)

| Aksi                                                 | Mahasiswa                                          | Dosen                       |
| ---------------------------------------------------- | -------------------------------------------------- | --------------------------- |
| Registrasi                                           | ✅                                                 | ❌ (di-seed)                |
| Buat project                                         | ❌                                                 | ✅                          |
| Lihat project                                        | 🔸 anggota                                         | 🔸 pemilik                  |
| Edit / hapus project, keluarkan anggota              | ❌                                                 | 🔸 pemilik                  |
| Kirim / revoke undangan                              | ❌                                                 | 🔸 pemilik                  |
| Respons undangan                                     | 🔸 invitee                                         | ❌                          |
| Atur office hours & blacklist                        | ❌                                                 | ✅ (milik sendiri)          |
| Lihat slot dosen                                     | 🔸 anggota project dosen tsb.                      | ✅ (milik sendiri)          |
| Ajukan bimbingan                                     | 🔸 anggota                                         | ❌                          |
| Review / jadwalkan / reschedule / complete bimbingan | ❌                                                 | 🔸 pemilik                  |
| Batalkan bimbingan                                   | 🔸 miliknya                                        | 🔸 pemilik                  |
| Buat folder                                          | 🔸 untuk track sendiri                             | 🔸 pemilik                  |
| Ubah / hapus folder                                  | 🔸 pembuat folder                                  | 🔸 pemilik                  |
| Set deadline folder                                  | ❌                                                 | 🔸 pemilik                  |
| Upload versi                                         | 🔸 folder miliknya (individual) / anggota (shared) | ❌                          |
| Lihat / download versi, feedback, logbook            | 🔸 sesuai BR-05                                    | 🔸 pemilik                  |
| Beri / ubah / hapus feedback                         | ❌                                                 | 🔸 pemilik                  |
| Tandai revisi `addressed`                            | 🔸 miliknya                                        | ❌                          |
| Review revisi (verify/reopen)                        | ❌                                                 | 🔸 pemilik                  |
| Monitoring mahasiswa                                 | ❌                                                 | ✅ (mahasiswa bimbingannya) |

Akses ke resource project yang bukan miliknya/anggotanya → **404** (tidak membocorkan keberadaan resource). Role salah untuk sebuah aksi → **403**.

## 10. Notifikasi Email

### 10.1 Email berbasis event

| #   | Event                           | Pengirim (aktor) → Penerima               | Isi                                                       | `.ics`                     |
| --- | ------------------------------- | ----------------------------------------- | --------------------------------------------------------- | -------------------------- |
| E1  | Undangan join project           | Dosen → Mahasiswa                         | Detail project, tombol buka undangan, tanggal kedaluwarsa | –                          |
| E2  | Pengajuan bimbingan baru        | Mahasiswa → Dosen                         | Nama mahasiswa, project, topik, waktu yang diajukan       | –                          |
| E3  | Bimbingan **disetujui**         | Dosen → Mahasiswa                         | Waktu, lokasi/link                                        | `REQUEST`                  |
| E4  | Bimbingan **ditolak**           | Dosen → Mahasiswa                         | Alasan penolakan                                          | –                          |
| E5  | Bimbingan **dijadwalkan** dosen | Dosen → Mahasiswa                         | Waktu, lokasi/link, topik                                 | `REQUEST`                  |
| E6  | Bimbingan **di-reschedule**     | Dosen → Mahasiswa                         | Waktu lama → waktu baru                                   | `REQUEST` (`SEQUENCE + 1`) |
| E7  | Bimbingan **dibatalkan**        | Pembatal → pihak lain (mahasiswa ↔ dosen) | Info pembatalan + alasan (opsional)                       | `CANCEL`                   |
| E8  | Reminder H-1 bimbingan          | Sistem → Mahasiswa & Dosen                | Waktu, lokasi/link, topik                                 | –                          |
| E9  | Draft / versi baru diupload     | Mahasiswa → Dosen                         | Folder, nomor versi, catatan                              | –                          |
| E10 | Feedback / revisi baru          | Dosen → Mahasiswa                         | Isi feedback + daftar item revisi                         | –                          |

E3–E7 memakai **satu template** "Update status bimbingan" dengan variasi isi per status. Semua email bimbingan memuat link "Tambah ke Google Calendar" bila relevan.

### 10.2 Reminder terjadwal

| Reminder      | Cron (Asia/Jakarta) | Kondisi                                                                                  | Penerima          | Anti-duplikat                   |
| ------------- | ------------------- | ---------------------------------------------------------------------------------------- | ----------------- | ------------------------------- |
| H-1 bimbingan | `0 8 * * *`         | Status `approved`, `start_at` jatuh pada tanggal besok (WIB), `reminder_sent_at IS NULL` | Mahasiswa & dosen | `reminder_sent_at` diisi atomik |

```sql
UPDATE consultations
SET reminder_sent_at = now()
WHERE status = 'approved'
  AND reminder_sent_at IS NULL
  AND start_at >= :besok00WIB AND start_at < :lusa00WIB
RETURNING id, project_id, student_id, lecturer_id, topic, start_at, end_at, location, mode;
```

Hanya baris yang dikembalikan `RETURNING` yang dikirimi email, sehingga walaupun job berjalan dua kali tidak ada email ganda.

### 10.3 Alur pengiriman

```
Service → emit event → NotificationListener (async, @OnEvent(..., { async: true }))
  → render template Handlebars (+ lampiran .ics bila ada)
  → MailPort.send()  — SmtpMailAdapter (Gmail) | FakeMailAdapter (test)
  → gagal → Logger.error(...), tidak dilempar ke request
```

- Kegagalan SMTP tidak menggagalkan request utama.
- Akun Gmail biasa punya batas harian pengiriman (sekitar 500 email/hari) — cukup untuk skala demo satu departemen.
- Riwayat/log email di DB dan retry otomatis tidak termasuk lingkup (lihat [TODO Opsional](#16-todo-opsional)).

## 11. ERD & Skema Database

### 11.1 Diagram ERD

```mermaid
erDiagram
    study_programs ||--o{ users : "prodi mahasiswa"
    users ||--o{ refresh_tokens : "memiliki"
    users ||--o{ projects : "dosen pemilik"
    projects ||--o{ project_members : "beranggotakan"
    users ||--o{ project_members : "mahasiswa anggota"
    projects ||--o{ project_invitations : "mengundang"
    users ||--o{ project_invitations : "mahasiswa diundang"
    users ||--o{ office_hours : "dosen mengatur"
    users ||--o{ blackout_dates : "dosen memblokir"
    projects ||--o{ consultations : "memiliki"
    users ||--o{ consultations : "mahasiswa peserta"
    projects ||--o{ submission_folders : "memiliki"
    users ||--o{ submission_folders : "track mahasiswa"
    submission_folders ||--o{ submission_versions : "berisi"
    users ||--o{ submission_versions : "mengunggah"
    submission_versions ||--o{ feedbacks : "menerima"
    feedbacks ||--o{ revision_items : "berisi"
    submission_versions ||--o{ revision_items : "diperbaiki di"

    study_programs {
        uuid id PK
        varchar name "unique; diawali jenjang, mis. S1 Teknik Informatika"
    }

    users {
        uuid id PK
        varchar email "unique (aktif), disimpan lowercase"
        varchar password "hash argon2id, bukan password mentah"
        varchar name
        enum role "student | lecturer"
        varchar nrp "unique, wajib untuk student"
        uuid study_program_id FK "wajib untuk student"
        smallint cohort_year "angkatan, wajib untuk student"
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    refresh_tokens {
        uuid id PK
        uuid user_id FK
        varchar token_hash "unique"
        timestamptz expires_at
        timestamptz revoked_at
        timestamptz created_at
    }

    projects {
        uuid id PK
        uuid lecturer_id FK
        varchar title
        text description
        enum type "10 tipe; jenjang & track_mode diturunkan di kode"
        date start_date
        date end_date
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    project_members {
        uuid project_id PK, FK
        uuid student_id PK, FK
        timestamptz joined_at
    }

    project_invitations {
        uuid id PK
        uuid project_id FK
        uuid student_id FK
        enum status "pending | accepted | declined | revoked"
        timestamptz expires_at
        timestamptz responded_at
        timestamptz created_at
    }

    office_hours {
        uuid id PK
        uuid lecturer_id FK
        smallint day_of_week "1=Senin ... 7=Minggu"
        time start_time
        time end_time
        smallint slot_minutes "15 | 30 | 45 | 60"
        varchar default_location
    }

    blackout_dates {
        uuid id PK
        uuid lecturer_id FK
        date date "tanggal lokal WIB"
        varchar reason
        timestamptz created_at
    }

    consultations {
        uuid id PK
        uuid project_id FK
        uuid lecturer_id FK "disalin dari project"
        uuid student_id FK
        enum status "requested | approved | rejected | completed | cancelled"
        enum mode "offline | online"
        varchar topic
        text agenda
        timestamptz start_at
        timestamptz end_at
        varchar location "ruangan atau link meeting"
        text status_reason "alasan reject / cancel"
        text summary "logbook, diisi saat completed"
        integer ics_sequence
        timestamptz reminder_sent_at
        timestamptz created_at
        timestamptz updated_at
    }

    submission_folders {
        uuid id PK
        uuid project_id FK
        uuid student_id FK "pemilik track; null jika shared"
        uuid created_by FK
        varchar title
        text description
        timestamptz deadline_at
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
    }

    submission_versions {
        uuid id PK
        uuid folder_id FK
        uuid uploaded_by FK
        integer version_number
        text note
        varchar original_name
        enum storage_driver "local | r2"
        varchar stored_key "projects/{pid}/folders/{fid}/{uuid}.{ext}"
        varchar mime_type
        bigint size_bytes
        timestamptz created_at
    }

    feedbacks {
        uuid id PK
        uuid version_id FK
        text content
        timestamptz created_at
        timestamptz updated_at
    }

    revision_items {
        uuid id PK
        uuid feedback_id FK "on delete cascade"
        smallint position
        text description
        enum status "open | addressed | verified | reopened"
        uuid addressed_in_version_id FK
        text addressed_note
        timestamptz created_at
        timestamptz updated_at
    }
```

**13 tabel** (12 tabel inti + `study_programs` sebagai master data). Logbook tidak memiliki tabel sendiri — logbook adalah query atas `consultations` berstatus `completed` (kolom `summary`). Metadata file disatukan ke `submission_versions` karena file hanya dipakai di sana. Versi Eraser.io tersedia di file `erd-konsulin-v3.1.txt`.

### 11.2 Constraint & index penting

Sebagian besar constraint di bawah ditulis lewat migrasi SQL kustom Prisma (lihat [11.4](#114-implementasi-di-prisma)).

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- exclusion constraint dengan kolom uuid
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- index pencarian ILIKE

-- BR-07: jadwal dosen tidak boleh overlap
ALTER TABLE consultations ADD CONSTRAINT consultations_no_overlap
  EXCLUDE USING gist (
    lecturer_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status IN ('requested', 'approved'));

ALTER TABLE consultations ADD CONSTRAINT consultations_time_valid CHECK (end_at > start_at);

ALTER TABLE office_hours ADD CONSTRAINT office_hours_valid
  CHECK (end_time > start_time AND day_of_week BETWEEN 1 AND 7);

-- Jenjang menyatu di nama prodi (tidak ada kolom degree)
ALTER TABLE study_programs ADD CONSTRAINT study_programs_name_uq UNIQUE (name);
ALTER TABLE study_programs ADD CONSTRAINT study_programs_name_degree CHECK (name ~ '^S[123] ');

-- Mahasiswa wajib punya NRP, prodi & angkatan; dosen tidak
ALTER TABLE users ADD CONSTRAINT users_student_profile CHECK (
  (role = 'student'  AND nrp IS NOT NULL AND study_program_id IS NOT NULL AND cohort_year IS NOT NULL)
  OR
  (role = 'lecturer' AND nrp IS NULL AND study_program_id IS NULL AND cohort_year IS NULL)
);
ALTER TABLE users ADD CONSTRAINT users_cohort_year_valid
  CHECK (cohort_year IS NULL OR cohort_year >= 2000);  -- batas atas (tahun berjalan) divalidasi di DTO

-- Unik parsial karena users memakai soft delete (akun terhapus tidak menghalangi pendaftaran ulang)
CREATE UNIQUE INDEX users_email_uq ON users (email) WHERE deleted_at IS NULL;                      -- email di-lowercase di DTO
CREATE UNIQUE INDEX users_nrp_uq   ON users (nrp)   WHERE nrp IS NOT NULL AND deleted_at IS NULL; -- NULL (dosen) boleh banyak
ALTER TABLE project_members ADD PRIMARY KEY (project_id, student_id);
ALTER TABLE blackout_dates ADD CONSTRAINT blackout_uq UNIQUE (lecturer_id, date);
ALTER TABLE submission_versions ADD CONSTRAINT version_number_uq UNIQUE (folder_id, version_number);
CREATE UNIQUE INDEX invitation_pending_uq ON project_invitations (project_id, student_id) WHERE status = 'pending';

-- FK dengan aksi khusus
--   refresh_tokens.user_id       ON DELETE CASCADE
--   revision_items.feedback_id   ON DELETE CASCADE   (hapus feedback → item revisi ikut terhapus)

-- Index pencarian & filter
CREATE INDEX users_program_cohort         ON users (study_program_id, cohort_year) WHERE role = 'student';
CREATE INDEX projects_title_trgm          ON projects USING gin (title gin_trgm_ops);
CREATE INDEX users_name_trgm              ON users USING gin (name gin_trgm_ops);
CREATE INDEX consultations_lecturer_start ON consultations (lecturer_id, start_at);
CREATE INDEX consultations_project_status ON consultations (project_id, status);
CREATE INDEX consultations_reminder_due   ON consultations (start_at) WHERE status = 'approved' AND reminder_sent_at IS NULL;
CREATE INDEX revision_items_status        ON revision_items (status);
```

### 11.3 Catatan desain

- **Jenjang wajib & `track_mode` tidak disimpan** — keduanya diturunkan dari `projects.type` lewat `PROJECT_TYPE_RULES` (satu sumber kebenaran). Filter `?degree=S2` diterjemahkan menjadi `type IN ('s2_thesis_proposal', 's2_thesis')`; policy privasi memakai `type = ANY(:individualTypes)`.
- **`study_programs`** dipisah sebagai tabel (bukan enum) karena dipakai sebagai dropdown registrasi, filter, dan relasi. **Jenjang menyatu di nama prodi** (mis. `S1 Teknik Informatika`) dan diturunkan lewat `degreeOf(name)`; filter `?degree=S2` diterjemahkan menjadi `study_programs.name LIKE 'S2 %'` (hanya 5 baris, tanpa index), dan CHECK `name ~ '^S[123] '` menjaga formatnya. API `GET /study-programs` tetap mengembalikan field `degree` hasil turunan.
- **`submission_folders.student_id`** menandai pemilik track pada project `individual`; pada `shared` bernilai `null` (folder milik bersama).
- **`consultations.lecturer_id`** disalin dari project agar exclusion constraint bisa dipasang langsung di tabel.
- **`consultations.status_reason`** menampung alasan reject maupun cancel (hanya satu yang mungkin terjadi karena keduanya status final). UID `.ics` tidak disimpan — cukup `{id}@konsulin`; hanya `ics_sequence` yang perlu disimpan untuk reschedule.
- **`consultations.reminder_sent_at`** menggantikan tabel `email_logs` untuk mencegah reminder ganda.
- **`submission_versions.storage_driver`** mencatat di mana file disimpan; upload baru memakai `STORAGE_DRIVER` dari env, download/hapus memakai driver yang tercatat.
- **`submission_versions`** tidak punya `deleted_at` karena versi immutable.
- **Kebijakan delete** — soft delete untuk `users`, `projects`, dan `submission_folders` (menyimpan riwayat dan file). Anggota project, blacklist, dan feedback di-hard delete; bimbingan tidak dihapus (cukup `cancelled`); versi submission immutable. Untuk `users`: tidak ada endpoint hapus akun (dilakukan developer langsung di DB); akun ber-`deleted_at` ditolak saat login/refresh, semua query user memfilter `deleted_at IS NULL`, dan unique `email`/`nrp` bersifat parsial sehingga bisa dipakai mendaftar ulang.
- **Soft delete project** hanya mengisi `projects.deleted_at`; repository semua modul turunan melakukan `INNER JOIN projects ... AND projects.deleted_at IS NULL`.

### 11.4 Implementasi di Prisma

Pemetaan ERD ke `schema.prisma`:

```prisma
model ProjectMember {
  projectId String   @map("project_id") @db.Uuid
  studentId String   @map("student_id") @db.Uuid
  joinedAt  DateTime @default(now()) @map("joined_at") @db.Timestamptz(6)

  project Project @relation(fields: [projectId], references: [id])
  student User    @relation(fields: [studentId], references: [id])

  @@id([projectId, studentId])
  @@map("project_members")
}

model Consultation {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  projectId String   @map("project_id") @db.Uuid
  startAt   DateTime @map("start_at") @db.Timestamptz(6)
  endAt     DateTime @map("end_at") @db.Timestamptz(6)
  status    ConsultationStatus
  // ...
  @@map("consultations")
}
```

| Topik                              | Keputusan                                                                                                                                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Penamaan                           | snake_case di database (`@map` / `@@map`), camelCase di TypeScript; enum didefinisikan dengan `enum` + `@@map`                                                                                                                                        |
| Tipe                               | `uuid` → `String @db.Uuid`; `timestamptz` → `DateTime @db.Timestamptz(6)`; `date` → `DateTime @db.Date`; `time` → `DateTime @db.Time(6)`                                                                                                              |
| `office_hours.start_time/end_time` | Prisma mengembalikan `Date` untuk kolom `time`; konversi ke/dari `"HH:mm"` lewat helper di `shared/time`                                                                                                                                              |
| `blackout_dates.date`              | Prisma mengembalikan `Date` UTC tengah malam; bandingkan sebagai string `YYYY-MM-DD` (tanggal WIB) agar tidak bergeser sehari                                                                                                                         |
| `ON DELETE CASCADE`                | `onDelete: Cascade` pada `@relation` `RevisionItem → Feedback` dan `RefreshToken → User`                                                                                                                                                              |
| Transaksi                          | `prisma.$transaction(async (tx) => { ... })` untuk accept undangan, nomor versi, dan feedback + item revisi                                                                                                                                           |
| Kolom `users.password`             | Selalu dikeluarkan dari hasil query (`select`/`omit`); tidak pernah masuk respons                                                                                                                                                                     |
| Pemetaan error                     | `P2002` (unique) → 409; `P2025` (data tidak ditemukan) → 404; pelanggaran exclusion constraint (SQLSTATE `23P01`) → 409 `CONSULTATION_OVERLAP` — bentuk error yang dilempar Prisma untuk kasus ini dicek saat implementasi dan dijaga dengan test E2E |

**Yang ditulis di migrasi SQL kustom** (`prisma migrate dev --create-only`, lalu edit `migration.sql`):

- `CREATE EXTENSION IF NOT EXISTS btree_gist; CREATE EXTENSION IF NOT EXISTS pg_trgm;`
- Exclusion constraint `consultations_no_overlap`.
- Seluruh CHECK constraint (`consultations_time_valid`, `office_hours_valid`, `users_student_profile`, `users_cohort_year_valid`, `study_programs_name_degree`).
- Unique parsial (`users_email_uq`, `users_nrp_uq`, `invitation_pending_uq`). Bila versi Prisma yang dipakai mendukung argumen `where:` pada `@@unique` (fitur preview `partialIndexes` sejak Prisma 7.4, ada di schema Prisma 8), ketiganya boleh ditulis di `schema.prisma`.
- Index GIN trigram (`projects_title_trgm`, `users_name_trgm`).

**Verifikasi setelah menambah SQL kustom:** jalankan `prisma migrate dev` sekali lagi dan pastikan tidak menghasilkan migrasi baru yang menghapus atau membuat ulang index/constraint tersebut (ada laporan Prisma membuat ulang unique parsial yang ditulis manual). Jika terjadi, tulis index itu di schema (bila didukung) atau abaikan migrasi tersebut.

## 12. Daftar Endpoint REST API

**Konvensi**

- Base URL: `/api/v1`. Dokumentasi Swagger: `/api/docs`.
- Autentikasi: `Authorization: Bearer <access_token>` kecuali ditandai 🌐 (publik).
- Pagination: `?page=1&limit=10` (maks 100). Sort: `?sort=createdAt&order=desc`.
- Respons sukses:
  ```json
  {
    "data": {},
    "meta": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
  }
  ```
- Respons error:
  ```json
  {
    "statusCode": 409,
    "error": "Conflict",
    "message": "Jadwal bentrok dengan bimbingan lain",
    "code": "CONSULTATION_OVERLAP"
  }
  ```
- Kode status: `200` OK · `201` Created · `204` No Content · `400` validasi/tipe file salah · `401` tidak terautentikasi · `403` role tidak berwenang · `404` tidak ditemukan/bukan anggota · `409` konflik/transisi tidak valid · `413` file terlalu besar · `429` rate limit.

Kolom **Akses**: `S` = mahasiswa, `L` = dosen, `Owner` = dosen pemilik project, `Member` = mahasiswa anggota project, `Own` = pemilik resource, `BR-05` = mengikuti aturan privasi track.

### 12.1 Auth, User & Master Data (7)

| Method | Endpoint          | Akses       | Deskripsi                                                                                                                                                                      | Status khusus |
| ------ | ----------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| GET    | `/study-programs` | 🌐          | List 5 program studi (untuk dropdown registrasi & filter). Respons `{ id, name, degree }` — `degree` diturunkan dari awalan `name`. Query: `degree` (→ `name LIKE 'S2 %'`)     | 200           |
| POST   | `/auth/register`  | 🌐          | Registrasi mahasiswa `{ name, nrp, email, password, studyProgramId, cohortYear }`                                                                                              | 201, 400, 409 |
| POST   | `/auth/login`     | 🌐          | Login → access token + cookie refresh                                                                                                                                          | 200, 401, 429 |
| POST   | `/auth/refresh`   | 🌐 (cookie) | Rotasi refresh token → access token baru                                                                                                                                       | 200, 401      |
| POST   | `/auth/logout`    | S/L         | Cabut refresh token, hapus cookie                                                                                                                                              | 204           |
| GET    | `/auth/me`        | S/L         | Profil user login                                                                                                                                                              | 200           |
| GET    | `/students`       | L           | Cari mahasiswa untuk diundang. Query: `q` (nama/NRP), `studyProgramId`, `degree`, `cohortYear`, `eligibleForProjectId` (hanya jenjang sesuai & belum anggota), `page`, `limit` | 200           |

### 12.2 Projects (7)

| Method | Endpoint                                  | Akses        | Deskripsi                                                                                                |
| ------ | ----------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------- |
| GET    | `/projects`                               | S/L          | List project saya. Query: `q` (judul), `type`, `degree`, `startFrom`, `startTo`, `page`, `limit`, `sort` |
| POST   | `/projects`                               | L            | Buat project                                                                                             |
| GET    | `/projects/:projectId`                    | Owner/Member | Detail project + ringkasan                                                                               |
| PATCH  | `/projects/:projectId`                    | Owner        | Ubah project                                                                                             |
| DELETE | `/projects/:projectId`                    | Owner        | Soft delete project                                                                                      |
| GET    | `/projects/:projectId/members`            | Owner/Member | List anggota. Query: `q`, `page`, `limit`                                                                |
| DELETE | `/projects/:projectId/members/:studentId` | Owner        | Keluarkan mahasiswa (hapus baris membership; riwayat bimbingan & folder tetap ada)                       |

### 12.3 Invitations (5)

| Method | Endpoint                                         | Akses   | Deskripsi                                               | Status khusus                          |
| ------ | ------------------------------------------------ | ------- | ------------------------------------------------------- | -------------------------------------- |
| GET    | `/projects/:projectId/invitations`               | Owner   | List undangan project. Query: `status`, `page`, `limit` | 200                                    |
| POST   | `/projects/:projectId/invitations`               | Owner   | Kirim undangan `{ studentId }` → **E1**                 | 201, 400 (`DEGREE_MISMATCH`), 404, 409 |
| DELETE | `/projects/:projectId/invitations/:invitationId` | Owner   | Revoke undangan pending                                 | 200, 409                               |
| GET    | `/invitations/me`                                | S       | Undangan saya. Query: `status`, `page`, `limit`         | 200                                    |
| POST   | `/invitations/:invitationId/respond`             | S (Own) | `{ "action": "accept" \| "decline" }`                   | 200, 400, 409                          |

### 12.4 Jadwal Dosen (6)

| Method | Endpoint                     | Akses        | Deskripsi                                                                                                    | Status khusus |
| ------ | ---------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------ | ------------- |
| GET    | `/me/office-hours`           | L            | Office hours mingguan saya                                                                                   | 200           |
| PUT    | `/me/office-hours`           | L            | Ganti seluruh jadwal mingguan `{ items: [{ dayOfWeek, startTime, endTime, slotMinutes, defaultLocation }] }` | 200, 400      |
| GET    | `/me/blackout-dates`         | L            | List blacklist. Query: `from`, `to`, `page`, `limit`                                                         | 200           |
| POST   | `/me/blackout-dates`         | L            | Tambah blacklist `{ date, reason? }`                                                                         | 201, 400, 409 |
| DELETE | `/me/blackout-dates/:id`     | L (Own)      | Hapus blacklist                                                                                              | 200           |
| GET    | `/projects/:projectId/slots` | Owner/Member | Slot tersedia dosen project. Query: `from`, `to` (maks 31 hari)                                              | 200, 400      |

### 12.5 Consultations & Logbook (10)

| Method | Endpoint                                      | Akses                | Deskripsi                                                                                                                              | Status khusus |
| ------ | --------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| GET    | `/consultations`                              | S/L                  | Bimbingan saya lintas project (kalender). Query: `status`, `from`, `to`, `projectId`, `page`, `limit`                                  | 200           |
| GET    | `/projects/:projectId/consultations`          | Owner/Member (BR-05) | List bimbingan project. Query: `q` (topik), `status`, `studentId`, `from`, `to`, `page`, `limit`, `sort`                               | 200           |
| POST   | `/projects/:projectId/consultations`          | S (Member)           | Ajukan `{ startAt, endAt, topic, agenda, mode }` → **E2**                                                                              | 201, 400, 409 |
| POST   | `/projects/:projectId/consultations/schedule` | Owner                | Jadwalkan `{ studentId, startAt, endAt, topic, agenda, mode, location }` → **E5**                                                      | 201, 400, 409 |
| GET    | `/consultations/:id`                          | Owner/Own            | Detail bimbingan                                                                                                                       | 200, 404      |
| POST   | `/consultations/:id/review`                   | Owner                | `{ "decision": "approve" \| "reject", "location"?, "reason"? }` → **E3/E4** (`reason` wajib untuk reject, disimpan di `status_reason`) | 200, 400, 409 |
| POST   | `/consultations/:id/reschedule`               | Owner                | `{ startAt, endAt, location? }` → **E6**                                                                                               | 200, 400, 409 |
| POST   | `/consultations/:id/cancel`                   | Owner/Own            | `{ reason? }` → **E7**                                                                                                                 | 200, 409      |
| POST   | `/consultations/:id/complete`                 | Owner                | `{ summary }`                                                                                                                          | 200, 400, 409 |
| GET    | `/projects/:projectId/logbook`                | Owner/Member (BR-05) | Bimbingan `completed`. Query: `studentId`, `from`, `to`, `q`, `page`, `limit`                                                          | 200           |

### 12.6 Submission Folders & Versions (8)

| Method | Endpoint                        | Akses                | Deskripsi                                                                               | Status khusus           |
| ------ | ------------------------------- | -------------------- | --------------------------------------------------------------------------------------- | ----------------------- |
| GET    | `/projects/:projectId/folders`  | Owner/Member (BR-05) | List folder. Query: `q`, `studentId`, `hasDeadline`, `overdue`, `page`, `limit`, `sort` | 200                     |
| POST   | `/projects/:projectId/folders`  | Owner/Member         | `{ title, description, studentId? (dosen, individual), deadlineAt? (dosen) }`           | 201, 400, 403           |
| GET    | `/folders/:folderId`            | Owner/Member (BR-05) | Detail folder + versi terbaru                                                           | 200, 404                |
| PATCH  | `/folders/:folderId`            | Owner/pembuat        | Ubah judul/deskripsi; `deadlineAt` hanya dosen                                          | 200, 403                |
| DELETE | `/folders/:folderId`            | Owner/pembuat        | Soft delete folder                                                                      | 200, 403                |
| GET    | `/folders/:folderId/versions`   | Owner/Member (BR-05) | List versi + jumlah feedback & revisi terbuka. Query: `page`, `limit`                   | 200                     |
| POST   | `/folders/:folderId/versions`   | S (pemilik track)    | Upload — `multipart/form-data`: `file`, `note` → **E9**                                 | 201, 400, 401, 403, 413 |
| GET    | `/versions/:versionId/download` | Owner/Member (BR-05) | Stream file dari driver yang tercatat (`local`/`r2`) dengan `Content-Disposition`       | 200, 404                |

### 12.7 Feedback & Revision Items (7)

| Method | Endpoint                              | Akses                | Deskripsi                                                                   | Status khusus |
| ------ | ------------------------------------- | -------------------- | --------------------------------------------------------------------------- | ------------- |
| GET    | `/versions/:versionId/feedbacks`      | Owner/Member (BR-05) | Feedback + item revisi pada versi                                           | 200           |
| POST   | `/versions/:versionId/feedbacks`      | Owner                | `{ content, revisionItems: [{ description }] }` → **E10**                   | 201, 400      |
| PATCH  | `/feedbacks/:feedbackId`              | Owner                | Ubah isi feedback                                                           | 200, 403      |
| DELETE | `/feedbacks/:feedbackId`              | Owner                | Hapus feedback (item revisi ikut terhapus via cascade)                      | 200, 403      |
| GET    | `/projects/:projectId/revision-items` | Owner/Member (BR-05) | List item revisi. Query: `status`, `studentId`, `folderId`, `page`, `limit` | 200           |
| POST   | `/revision-items/:itemId/address`     | S (pemilik track)    | `{ versionId, note? }`                                                      | 200, 400, 409 |
| POST   | `/revision-items/:itemId/review`      | Owner                | `{ "decision": "verify" \| "reopen" }`                                      | 200, 400, 409 |

### 12.8 Monitoring (1)

| Method | Endpoint               | Akses | Deskripsi                                                                                                                                                                                                                                                                                           |
| ------ | ---------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/monitoring/students` | L     | Mahasiswa bimbingan saya + `lastConsultationAt`, `completedConsultations`, `openRevisions`, `nearestDeadline`. Query: `q` (nama/NRP), `projectId`, `projectType`, `studyProgramId`, `degree`, `cohortYear`, `hasOpenRevisions`, `overdue`, `noConsultationSince` (tanggal), `page`, `limit`, `sort` |

**Total: 51 endpoint.**

## 13. Kebutuhan Non-Fungsional

| ID     | Kategori     | Kebutuhan                                                                                                                                                                                                                                                                                                                         |
| ------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-01 | Keamanan     | Password di-hash dengan argon2id, tidak pernah dikembalikan di respons.                                                                                                                                                                                                                                                           |
| NFR-02 | Keamanan     | Access token 15 menit di memory client (tidak di `localStorage`), refresh token 7 hari di cookie `httpOnly` + rotation; hash refresh token di DB agar bisa dicabut.                                                                                                                                                               |
| NFR-03 | Keamanan     | CORS hanya origin frontend, `credentials: true`; `helmet` aktif.                                                                                                                                                                                                                                                                  |
| NFR-04 | Keamanan     | Semua input divalidasi DTO (`whitelist`); query via Prisma Client (parameterized; `$queryRaw` hanya sebagai _tagged template_, tidak pernah konkatenasi string) → aman dari SQL injection; teks feedback/ringkasan dirender sebagai teks biasa oleh React (escape otomatis, **tanpa** `dangerouslySetInnerHTML`) → aman dari XSS. |
| NFR-05 | Keamanan     | File divalidasi magic bytes + ekstensi; nama file di storage berupa UUID; folder `uploads/` tidak di-serve statis; bucket R2 privat (tanpa akses publik); ZIP tidak diekstrak; download hanya via endpoint terotorisasi.                                                                                                          |
| NFR-06 | Keamanan     | Rate limit login & register (5 req/menit/IP).                                                                                                                                                                                                                                                                                     |
| NFR-07 | Reliabilitas | Email dikirim async; kegagalan SMTP dicatat di log dan tidak menggagalkan request.                                                                                                                                                                                                                                                |
| NFR-08 | Konsistensi  | Operasi multi-langkah (accept undangan → membership, nomor versi, feedback + item revisi) dalam transaksi.                                                                                                                                                                                                                        |
| NFR-09 | Waktu        | `timestamptz` UTC; API ISO 8601; tampilan & cron Asia/Jakarta.                                                                                                                                                                                                                                                                    |
| NFR-10 | Dokumentasi  | Semua endpoint terdokumentasi di Swagger beserta DTO & contoh respons.                                                                                                                                                                                                                                                            |
| NFR-11 | Kualitas     | Coverage backend ≥ 70% (`pnpm test:cov`); ESLint & Prettier bersih.                                                                                                                                                                                                                                                               |
| NFR-12 | Portabilitas | Driver storage dapat diganti lewat env tanpa mengubah kode; file lama tetap dapat diunduh karena driver tercatat per versi.                                                                                                                                                                                                       |
| NFR-13 | UX           | Frontend menampilkan state loading/error/kosong untuk setiap query, dan progress bar saat upload.                                                                                                                                                                                                                                 |

## 14. Strategi Testing

**Tools:** Jest + Supertest + `@nestjs/testing`. Database test terpisah (Postgres Docker lokal), `prisma migrate deploy` dijalankan sebelum suite agar constraint kustom (exclusion, CHECK, unique parsial) ikut ter-test. `MailPort` di-override dengan `FakeMailAdapter` (menyimpan email terkirim untuk di-assert), storage memakai `STORAGE_DRIVER=local` dengan `UPLOAD_DIR` di direktori temp, batas ukuran file diperkecil via env (mis. 1 MB) untuk test 413.

**Lifecycle**

- `beforeAll`: buat `TestingModule` dari `AppModule`, override `MailPort`, pasang pipe/filter/interceptor global seperti di `main.ts`, `app.init()`.
- `beforeEach`: `TRUNCATE ... RESTART IDENTITY CASCADE` (kecuali `study_programs`), seed 2 dosen + 3 mahasiswa (S1, S2, S3), generate access token masing-masing, reset `FakeMailAdapter`.
- `afterAll`: bersihkan DB, hapus direktori upload temp, `app.close()`.

**File test E2E**

| File                             | Cakupan                                                                                                                                                                                                                                                               |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/auth.e2e-spec.ts`          | list prodi, register valid / email atau NRP duplikat 409 / password lemah 400 / prodi tidak ada 400 / angkatan di luar rentang 400, login, refresh rotation, refresh token lama 401, logout, endpoint terlindungi tanpa token 401                                     |
| `test/projects.e2e-spec.ts`      | CRUD project, mahasiswa membuat project 403, search/filter/pagination, non-anggota 404, soft delete → data turunan tidak tampil, keluarkan anggota                                                                                                                    |
| `test/invitations.e2e-spec.ts`   | undang + email E1, undang mahasiswa S1 ke project `s2_thesis` 400 (`DEGREE_MISMATCH`), undang ke tipe umum lintas jenjang 201, undangan duplikat 409, respond accept/decline, respond undangan expired 409, revoke                                                    |
| `test/schedule.e2e-spec.ts`      | PUT office hours (validasi jam), blacklist + duplikat 409, blacklist di tanggal yang ada bimbingan 409, perhitungan slot                                                                                                                                              |
| `test/consultations.e2e-spec.ts` | ajukan di luar office hours 400, di tanggal blacklist 400, bentrok 409, review approve/reject + email `.ics`, schedule, reschedule (`SEQUENCE+1`), cancel (`.ics CANCEL`), complete sebelum waktunya 409, transisi tidak valid 409, privasi individual track, logbook |
| `test/submissions.e2e-spec.ts`   | buat folder, upload PDF/DOCX/ZIP 201 + email E9 + `storage_driver = local`, tipe lain 400, file palsu (ekstensi `.pdf` isi bukan PDF) 400, melebihi batas 413, tanpa token 401, folder mahasiswa lain 404, nomor versi berurutan, download                            |
| `test/feedback.e2e-spec.ts`      | feedback + item revisi + email E10, mahasiswa memberi feedback 403, address dengan versi lebih lama 400, review verify/reopen, transisi tidak valid 409                                                                                                               |
| `test/monitoring.e2e-spec.ts`    | filter `studyProgramId`, `degree`, `cohortYear`, `hasOpenRevisions`, `overdue`, `noConsultationSince`, mahasiswa akses 403                                                                                                                                            |
| `test/flows.e2e-spec.ts`         | **Alur lengkap:** dosen buat project → undang → mahasiswa accept → ajukan bimbingan → approve → complete → buat folder → upload v1 → feedback + revisi → upload v2 → address → verify → cek logbook                                                                   |

**Unit test (menaikkan coverage dengan murah):** state machine `Consultation`, `Invitation`, `RevisionItem`; `SlotCalculator`; penomoran versi; `IcsBuilder`; `ProjectAccessPolicy`; `StorageService` (memilih adapter sesuai `storage_driver`, `S3Client` di-mock untuk `R2StorageAdapter`); job reminder H-1 (klaim `reminder_sent_at`).

## 15. Prioritas & Milestone

| Prioritas               | Lingkup                                                                                                                                                                                                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0 — Inti wajib**     | Setup monorepo, Prisma + Supabase, auth JWT + refresh, RBAC, project CRUD + soft delete, undangan, bimbingan (ajukan/review/complete) + logbook, folder + versi + upload (`LocalStorageAdapter`), feedback, email E1–E5 & E9–E10 (SMTP Gmail), search/filter/pagination, Swagger, seeder, E2E ≥ 70% |
| **P1 — Fitur unggulan** | Office hours + blacklist + slot, exclusion constraint, reschedule/cancel (E6–E7), `.ics` + link Google Calendar, checklist revisi (address/review), reminder H-1 (E8)                                                                                                                               |
| **P2 — Pelengkap**      | Deadline folder + filter overdue, endpoint monitoring, `R2StorageAdapter` + `STORAGE_DRIVER=r2`                                                                                                                                                                                                     |
| **Frontend**            | React + TanStack Query: auth (login/register/refresh), dashboard dosen & mahasiswa, halaman per user story, upload dengan progress bar                                                                                                                                                              |
| **Akhir**               | Rekam video demo per user story + penjelasan kode                                                                                                                                                                                                                                                   |

Urutan kerja yang disarankan: selesaikan satu alur utama P0 dari ujung ke ujung (backend + E2E test + halaman frontend-nya), baru menambah fitur P1 satu per satu. Frontend boleh dibangun paralel per fitur setelah endpoint-nya stabil, karena kontrak API sudah terdokumentasi di Swagger.

## 16. TODO Opsional

Dikerjakan hanya jika semua P0–P2 selesai dan coverage aman:

- [ ] Cascade soft delete project (semua turunan diberi `deleted_at` yang sama dalam satu transaksi) + restore.
- [ ] Export logbook ke PDF.
- [ ] Tabel `email_logs` + retry otomatis email gagal.
- [ ] Reminder mahasiswa yang tidak bimbingan selama 14 hari.
- [ ] Script migrasi file antar driver (`local` → `r2`) yang memperbarui `storage_driver`.
- [ ] Preview PDF inline di frontend (`?inline=true`).

## 17. Pemetaan ke Requirement Final Project

| Requirement PDF                                          | Implementasi                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend framework modern                                | React 19 + Vite (SPA/CSR) + TanStack Query                                                                                                                                                                                                                                                                                             |
| Backend                                                  | NestJS                                                                                                                                                                                                                                                                                                                                 |
| User registration + validasi + hashing                   | `POST /auth/register`, DTO class-validator, argon2id                                                                                                                                                                                                                                                                                   |
| Login JWT + expiration + refresh token                   | `POST /auth/login`, `POST /auth/refresh` (rotation), access token 15 menit                                                                                                                                                                                                                                                             |
| Simpan JWT aman di client                                | Access token di memory React (bukan `localStorage`), refresh token di cookie `httpOnly`                                                                                                                                                                                                                                                |
| RBAC + guard + 401/403                                   | `RolesGuard` (`student`/`lecturer`) + `ProjectAccessPolicy` (owner/member/pemilik track); di frontend `RoleRoute`                                                                                                                                                                                                                      |
| CORS, sanitasi, SQL injection, XSS                       | NFR-03, NFR-04                                                                                                                                                                                                                                                                                                                         |
| File upload ke local storage + validasi + relasi entitas | `POST /folders/:id/versions`, `LocalStorageAdapter` (default `STORAGE_DRIVER=local`), PDF/DOCX/ZIP ≤ 50 MB, terhubung ke folder & versi; R2 sebagai driver alternatif via env                                                                                                                                                          |
| Search, filter, pagination                               | `/projects`, `/students`, `/consultations`, `/folders`, `/revision-items`, `/monitoring/students`                                                                                                                                                                                                                                      |
| CRUD RESTful                                             | Project, folder, feedback, blacklist, office hours, bimbingan                                                                                                                                                                                                                                                                          |
| Email notification                                       | Bagian 10 (E1–E10 via SMTP Gmail, termasuk reminder H-1 terjadwal)                                                                                                                                                                                                                                                                     |
| ≥ 6 user stories                                         | US-01 s.d. US-10                                                                                                                                                                                                                                                                                                                       |
| E2E test Jest + Supertest, ≥ 70% coverage                | Bagian 14                                                                                                                                                                                                                                                                                                                              |
| Dokumentasi ide, fitur, skema DB                         | Dokumen ini (PRD + ERD)                                                                                                                                                                                                                                                                                                                |
| Kompleksitas (bonus)                                     | Role global + kepemilikan per project, multi-prodi & multi-jenjang (S1/S2/S3) dengan aturan tipe bimbingan per jenjang, privasi per track, state machine (undangan, bimbingan, revisi), exclusion constraint jadwal, kalkulasi slot, versioning, checklist revisi, cron reminder, `.ics`, storage driver yang dapat diganti (local/R2) |

## 18. Desain File Upload

File upload hanya terjadi saat mahasiswa mengunggah versi draft ke folder submission.

### 18.1 Alur upload

`POST /api/v1/folders/:folderId/versions` — `multipart/form-data`: `file`, `note`

```
Request
 → JwtAuthGuard           (401 tanpa token)
 → RolesGuard             (403 bukan mahasiswa)
 → FolderOwnerGuard       (404/403 bukan pemilik track) ← dicek SEBELUM file diterima
 → FileInterceptor/multer (tulis ke folder tmp, 413 jika > batas)
 → FileValidationPipe     (ekstensi + magic bytes, 400 jika tidak cocok)
 → SubmissionService
     1. buat key: projects/{projectId}/folders/{folderId}/{uuid}.{ext}
     2. StorageService.put(key, tmpPath) → simpan via driver aktif (STORAGE_DRIVER), kembalikan nama driver
     3. prisma.$transaction: kunci baris folder (SELECT … FOR UPDATE via $queryRaw) → version_number = max + 1
        → insert submission_versions (…, storage_driver, stored_key)
     4. emit SubmissionVersionUploaded → email E9 ke dosen
 → 201 { data: version }
 (gagal di langkah mana pun → file tmp dihapus, file final dihapus lewat driver yang sama)
```

Di NestJS, guard berjalan sebelum interceptor, sehingga user yang tidak berhak ditolak sebelum mengirim file sampai 50 MB ke server.

### 18.2 Konfigurasi multer

```ts
@Post('folders/:folderId/versions')
@Roles('student')
@UseGuards(FolderOwnerGuard)
@UseInterceptors(FileInterceptor('file', {
  storage: diskStorage({ destination: env.UPLOAD_TMP_DIR }), // disk, bukan memory
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
}))
upload(
  @Param('folderId', ParseUUIDPipe) folderId: string,
  @UploadedFile(FileValidationPipe) file: Express.Multer.File,
  @Body() dto: UploadVersionDto,
  @CurrentUser() user: AuthUser,
) { /* ... */ }
```

- Disk storage agar file besar tidak ditahan di RAM.
- Error `LIMIT_FILE_SIZE` dari multer otomatis menjadi **413 Payload Too Large**.
- `MAX_UPLOAD_MB` dari env: 50 di aplikasi, 1 di test.

### 18.3 Validasi tipe file

Mimetype dari browser dan ekstensi bisa dipalsukan, jadi ekstensi **dan** isi file harus cocok:

| Ekstensi | Magic bytes                                        | Catatan         |
| -------- | -------------------------------------------------- | --------------- |
| `.pdf`   | `25 50 44 46 2D` (`%PDF-`)                         |                 |
| `.zip`   | `50 4B 03 04` (`PK..`)                             |                 |
| `.docx`  | `50 4B 03 04` + memiliki entri `word/document.xml` | DOCX adalah ZIP |

Implementasi: library `file-type` (ESM-only di versi terbaru → `await import('file-type')`), atau cek manual beberapa byte pertama + entri `word/document.xml` (lebih mudah dijelaskan di video). File `.pdf` yang isinya bukan PDF → **400**.

### 18.4 Penyimpanan (local / R2)

```ts
export type StorageDriver = "local" | "r2";

export interface StoragePort {
  put(
    key: string,
    filePath: string,
    meta: { contentType: string; size: number },
  ): Promise<void>;
  getStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}

@Injectable()
export class StorageService {
  constructor(
    private readonly config: AppConfig,
    private readonly local: LocalStorageAdapter,
    @Optional() private readonly r2?: R2StorageAdapter, // hanya diregistrasi jika env R2 lengkap
  ) {}

  get activeDriver(): StorageDriver {
    return this.config.STORAGE_DRIVER; // 'local' | 'r2'
  }

  private adapter(driver: StorageDriver): StoragePort {
    if (driver === "local") return this.local;
    if (!this.r2)
      throw new ServiceUnavailableException("R2 storage belum dikonfigurasi");
    return this.r2;
  }

  async put(
    key: string,
    filePath: string,
    meta: { contentType: string; size: number },
  ) {
    const driver = this.activeDriver;
    await this.adapter(driver).put(key, filePath, meta);
    return driver; // disimpan ke submission_versions.storage_driver
  }

  getStream(driver: StorageDriver, key: string) {
    return this.adapter(driver).getStream(key);
  }

  delete(driver: StorageDriver, key: string) {
    return this.adapter(driver).delete(key);
  }
}
```

**`LocalStorageAdapter`** — `fs.rename(tmpPath, path.join(UPLOAD_DIR, key))` (buat folder dengan `mkdir -p` lebih dulu), `fs.createReadStream`, `fs.unlink`. Path hasil gabungan dicek tetap berada di dalam `UPLOAD_DIR`.

**`R2StorageAdapter`** — Cloudflare R2 kompatibel dengan S3 API:

```ts
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

// put — ContentLength wajib saat Body berupa stream
await s3.send(
  new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
    Body: createReadStream(filePath),
    ContentLength: meta.size,
    ContentType: meta.contentType,
  }),
);
await fs.unlink(filePath); // hapus file tmp setelah terunggah

// getStream
const res = await s3.send(
  new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }),
);
return res.Body as Readable;

// delete
await s3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
```

Aturan:

- Struktur key sama untuk kedua driver: `projects/{projectId}/folders/{folderId}/{uuid}.{ext}`.
- Nama asli tidak pernah dipakai sebagai key (aman dari path traversal & bentrok); hanya disimpan di `original_name`.
- Folder `uploads/` di luar `src`, tidak di-serve statis, masuk `.gitignore`. Bucket R2 privat.
- Kolom tersimpan: `storage_driver`, `stored_key`, `original_name`, `mime_type` (hasil deteksi), `size_bytes`.
- Mengganti `STORAGE_DRIVER` hanya berlaku untuk upload baru. Selama masih ada versi ber-driver `r2`, kredensial R2 harus tetap ada di env.
- Versi immutable; file tetap disimpan walau folder di-soft-delete.

### 18.5 Download

`GET /api/v1/versions/:versionId/download`

```ts
const version = await this.service.getVersionForDownload(versionId, user); // policy BR-05
const stream = await this.storage.getStream(
  version.storageDriver,
  version.storedKey,
);
res.set({
  "Content-Type": version.mimeType,
  "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(version.originalName)}`,
  "X-Content-Type-Options": "nosniff",
});
return new StreamableFile(stream);
```

- Dikirim sebagai stream lewat backend untuk kedua driver (tidak memakai presigned URL), sehingga policy akses dan kode controller sama.
- Mahasiswa lain pada track `individual` → **404**.
- Opsional: `?inline=true` khusus PDF untuk preview di browser.

### 18.6 Frontend (React + TanStack Query)

- Validasi awal di client (ekstensi & ukuran ≤ 50 MB); server tetap jadi patokan.
- Upload memakai `useMutation` + `FormData`; progress dari `onUploadProgress` axios (axios memakai XHR di browser, jadi progres upload tersedia).
- Setelah sukses, invalidate query folder & daftar versi agar versi baru langsung tampil.
- Download memakai `axios` dengan `responseType: 'blob'` (karena endpoint butuh header Bearer), lalu dibuatkan object URL untuk diunduh.

```tsx
const qc = useQueryClient();
const [progress, setProgress] = useState(0);

const upload = useMutation({
  mutationFn: ({ file, note }: { file: File; note: string }) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("note", note);
    return api.post(`/folders/${folderId}/versions`, fd, {
      onUploadProgress: (e) =>
        setProgress(Math.round((e.loaded * 100) / (e.total ?? file.size))),
    });
  },
  onSuccess: () => qc.invalidateQueries({ queryKey: ["folders", folderId] }),
});
```

## 19. Catatan Implementasi (Riwayat Revisi)

### Revisi v3 (3 November 2026)

| #   | Perubahan                                                                                  | Dampak ke implementasi                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Nama aplikasi **Konsulin** (sebelumnya "Bimbingan Tracker")                                | Nama repo `konsulin`, workspace `@konsulin/api` & `@konsulin/web`, judul Swagger, sender name email (`Konsulin <...@gmail.com>`), title halaman frontend                                                  |
| 2   | Skala **satu departemen** dengan 5 prodi (S1 IF, S1 RPL, S1 RKA, S2 MTI, S3 Ilmu Komputer) | Tabel `study_programs` (master data, di-seed), endpoint publik `GET /study-programs`, filter prodi/jenjang/angkatan di `/students` dan `/monitoring/students`                                             |
| 3   | Registrasi mahasiswa: nama, NRP, email, password, **program studi, angkatan**              | Kolom `users.study_program_id` & `users.cohort_year`, CHECK constraint profil mahasiswa, `RegisterDto` + validasi (`@IsUUID`, `@IsInt @Min(2000) @Max(tahunBerjalan)`), seeder mahasiswa demo per jenjang |
| 4   | Tipe project menyesuaikan **S2 & S3**                                                      | Enum `project_type` 10 nilai, konstanta `PROJECT_TYPE_RULES` (tipe → `requiredDegree`, `trackMode`), BR-17 validasi jenjang saat mengundang, test `DEGREE_MISMATCH`                                       |
| 5   | **Logbook dipertahankan**                                                                  | Tetap 1 endpoint (`GET /projects/:projectId/logbook`), tanpa tabel baru; fungsi dijelaskan di US-06                                                                                                       |
| 6   | Desain file upload didokumentasikan                                                        | Lihat [Bagian 18](#18-desain-file-upload)                                                                                                                                                                 |

### Revisi v3.1 (20 November 2026)

| #   | Perubahan                                                         | Dampak ke implementasi                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7   | Frontend **React + TanStack Query** (CSR), menggantikan SvelteKit | `apps/web` berbasis Vite + React Router; struktur per fitur ([6.2](#62-frontend-appsweb--react--tanstack-query-csr)); axios interceptor dengan refresh single-flight                                                                                                                                                                                                                                                                                                                        |
| 8   | Storage **local & Cloudflare R2**, dipilih via `STORAGE_DRIVER`   | `StorageService` + `R2StorageAdapter`; kolom baru `submission_versions.storage_driver`; env R2 divalidasi kondisional ([18.4](#184-penyimpanan-local--r2))                                                                                                                                                                                                                                                                                                                                  |
| 9   | Email **SMTP Gmail** tanpa tabel log                              | Tabel `email_logs` dihapus; anti-duplikat reminder lewat `consultations.reminder_sent_at`; kegagalan dicatat di Logger                                                                                                                                                                                                                                                                                                                                                                      |
| 10  | **ERD disederhanakan** (14 → 13 tabel)                            | Dihapus: `projects.track_mode` & `required_degree` (diturunkan dari `type`), `users.nip`, `refresh_tokens.user_agent` & `ip_address`, `project_members.id` & `deleted_at` (PK komposit), `consultations.origin`, `cancelled_by`, `completed_at`, `ics_uid`, `deleted_at`, `feedbacks.lecturer_id` & `deleted_at`, `revision_items.addressed_at`, `reviewed_at`, `deleted_at`, `submission_versions.checksum_sha256`. Digabung: `rejection_reason` + `cancellation_reason` → `status_reason` |
| 11  | Kebijakan delete diperjelas                                       | Soft delete untuk `users`, `projects` & `submission_folders`; anggota, blacklist, feedback di-hard delete; field `note` pada review item revisi dihapus                                                                                                                                                                                                                                                                                                                                     |
| 12  | ERD mengikuti versi pemilik (`erd-konsulin-v3.1.txt`)             | `study_programs` hanya `id` + `name` (jenjang menyatu di nama, diturunkan via `degreeOf(name)`; tanpa `code`/`degree`); `users.password` (berisi hash argon2id) dan `users.name` menggantikan `password_hash`/`full_name`; `users.deleted_at` dipertahankan → unique `email`/`nrp` menjadi parsial `WHERE deleted_at IS NULL`                                                                                                                                                               |

### Revisi v3.2 (20 November 2026)

| #   | Perubahan                                                  | Dampak ke implementasi                                                                                                                                                                                                                                                                                                      |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13  | ORM **Prisma** menggantikan Drizzle                        | `PrismaModule`/`PrismaService` dengan driver adapter `pg`; folder `apps/api/prisma/` (`schema.prisma`, `migrations/`, `seed.ts`) + `prisma.config.ts`; repository memakai Prisma Client; `prisma.$transaction` untuk operasi multi-langkah ([5.2](#52-prisma-orm--supabase-free-plan), [11.4](#114-implementasi-di-prisma)) |
| 14  | Database **Supabase (free plan)** menggantikan Neon        | `DATABASE_URL` memakai Session pooler; dev/test memakai Postgres Docker lokal; migrasi ke Supabase lewat `prisma migrate deploy`; catatan pause 1 minggu, 500 MB, tanpa backup otomatis, dan pengamanan Data API                                                                                                            |
| 15  | Constraint kustom lewat migrasi SQL                        | Exclusion constraint, CHECK, extension, dan (bila belum didukung schema) unique parsial ditulis di `migration.sql` hasil `--create-only`; wajib diverifikasi agar `migrate dev` tidak menimpanya                                                                                                                            |
| 16  | Alasan pemilihan TanStack Query & Swagger didokumentasikan | Lihat [5.3](#53-catatan-pemilihan-teknologi)                                                                                                                                                                                                                                                                                |

**Contoh `PROJECT_TYPE_RULES`**

```ts
export const PROJECT_TYPE_RULES = {
  s1_thesis_proposal: {
    label: "Proposal Tugas Akhir",
    requiredDegree: "S1",
    trackMode: "individual",
  },
  s1_thesis: {
    label: "Tugas Akhir",
    requiredDegree: "S1",
    trackMode: "individual",
  },
  s2_thesis_proposal: {
    label: "Proposal Tesis",
    requiredDegree: "S2",
    trackMode: "individual",
  },
  s2_thesis: { label: "Tesis", requiredDegree: "S2", trackMode: "individual" },
  s3_dissertation_proposal: {
    label: "Proposal Disertasi",
    requiredDegree: "S3",
    trackMode: "individual",
  },
  s3_dissertation: {
    label: "Disertasi",
    requiredDegree: "S3",
    trackMode: "individual",
  },
  research: { label: "Riset", requiredDegree: null, trackMode: "shared" },
  publication: {
    label: "Publikasi Ilmiah",
    requiredDegree: null,
    trackMode: "shared",
  },
  competition: { label: "Lomba", requiredDegree: null, trackMode: "shared" },
  external_project: {
    label: "Project Luar",
    requiredDegree: null,
    trackMode: "shared",
  },
} as const satisfies Record<ProjectType, ProjectTypeRule>;
```

**Seeder awal (`pnpm db:seed`)**

- 5 baris `study_programs` (nama diawali jenjang: `S1 Teknik Informatika`, dst.; seeder memvalidasi dengan `degreeOf`).
- Akun dosen (nama, email, password default dari `SEED_LECTURER_PASSWORD`).
- Data demo: mahasiswa S1/S2/S3 dari beberapa prodi & angkatan, 1 project `s1_thesis` (kelompok bimbingan), 1 project `s2_thesis`, 1 project `competition` lintas jenjang, bimbingan berbagai status, folder + versi + feedback.

**Catatan opsional (tidak wajib):** angkatan bisa dicek konsistensinya dengan digit NRP (mis. digit ke-5–6 = dua digit tahun angkatan) bila format NRP departemen sudah dipastikan.
