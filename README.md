# Heybat

Aplikasi inventory/PBF — React + Tailwind (frontend), Express (backend), Supabase Postgres.

## Setup

### 1. Database

Jalankan SQL migrasi di Supabase SQL Editor (urut):

- `supabase/migrations/20260723000000_create_supplier.sql`
- `supabase/migrations/20260723000001_fix_supplier_function_search_path.sql`
- `supabase/migrations/20260723000002_supplier_jadwal_and_fields.sql`
- `supabase/migrations/20260723000003_pricelist_pbf.sql`

(Sudah di-apply ke project remote Heybat via MCP.)

### 2. Backend

```bash
cd backend
cp .env.example .env
# isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev
```

API: `http://localhost:3001`

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

App: `http://localhost:5173/data-supplier`

## Modul Data Supplier

- `GET/POST /api/suppliers` — list/create (include `jadwal`)
- `PUT/DELETE /api/suppliers/:id`
- `PUT /api/suppliers/:id/jadwal` — update 7 hari sekaligus
- Kolom `inisial` immutable setelah create (validasi API + trigger DB)
- Trigger DB otomatis seed 7 baris `supplier_jadwal` saat insert supplier

## Modul Pricelist PBF

- `GET/POST/PUT /api/pricelist-template/:pbfId`
- `POST /api/pricelist/preview` — parse header Excel (multipart)
- `POST /api/pricelist/upload` — insert riwayat + auto kosong
- `GET /api/pricelist?pbf_id=` — snapshot terbaru per `kode_pbf`
- Frontend: `/pricelist-pbf`
