# Heybat — Design System

Dokumen ini WAJIB dirujuk setiap membangun/ubah UI apapun di Heybat. Tujuan: konsistensi visual di semua modul, dan mencegah tampilan generic/template-AI.

Arah desain: **minimalis-disiplin**. Tidak ada font custom, tidak ada dekorasi berlebih. Kekuatan visual datang dari kontras warna yang tegas, spacing yang konsisten, dan hierarki yang jelas — bukan dari ornamen.

---

## 1. Warna

Dark mode adalah satu-satunya mode (bukan toggle).


| Token              | Hex       | Dipakai untuk                                                                   |
| ------------------ | --------- | ------------------------------------------------------------------------------- |
| `bg-base`          | `#29282D` | Background halaman utama                                                        |
| `bg-surface`       | `#33323A` | Background card, modal, input — 1 level lebih terang dari base supaya ada depth |
| `bg-surface-hover` | `#3D3C45` | Hover state untuk card/list item yang bisa diklik                               |
| `accent-yellow`    | `#FFD500` | Aksen utama brand: badge, ikon aktif, highlight, teks penting, border fokus     |
| `accent-navy`      | `#12266E` | Tombol primary, elemen aksen sekunder (bukan dominan di background)             |
| `text-primary`     | `#F5F5F7` | Teks utama (judul, isi penting)                                                 |
| `text-secondary`   | `#A8A8B3` | Teks sekunder (deskripsi, label)                                                |
| `text-muted`       | `#6E6E7A` | Placeholder, teks tidak aktif, caption kecil                                    |
| `border-subtle`    | `#454550` | Border tipis pemisah antar elemen (card, divider, input)                        |
| `state-success`    | `#2ECC71` | Notifikasi berhasil, badge status "matched"/"selesai"                           |
| `state-warning`    | `#F5A623` | Peringatan, status "menunggu verifikasi"                                        |
| `state-error`      | `#E5484D` | Error, validasi gagal, status "unmatch"                                         |


**Aturan pemakaian:**

- Background halaman SELALU `bg-base`. Card/modal/input SELALU `bg-surface` — jangan pernah keduanya sama persis (ini penyebab tampilan "flat" di screenshot Data Supplier kemarin).
- Kuning HANYA untuk aksen kecil (badge, ikon, teks penting, border saat fokus) — jangan dipakai sebagai warna background besar atau tombol solid besar (terlalu menyilaukan di dark mode).
- Navy dipakai untuk tombol primary (Simpan, Tambah, dll) — bukan warna dominan halaman.
- Jangan gunakan warna abu-abu default Tailwind (`gray-800`, `gray-900`, dst) langsung — selalu pakai token di atas supaya konsisten.

---

## 2. Tipografi

Font sistem saja (`font-sans` bawaan Tailwind: -apple-system, Segoe UI, Roboto, dst). Tidak ada custom font/Google Fonts.

Arah: **padat ala Tokopedia**, bukan lega/besar. Hierarki dibentuk lewat bobot (weight) dan warna, bukan cuma ukuran — harga/angka penting boleh bold tanpa harus jauh lebih besar dari teks sekitarnya.


| Level           | Ukuran                                | Berat    | Dipakai untuk                                                                                               |
| --------------- | ------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `text-eyebrow`  | 11px, uppercase, letter-spacing lebar | Bold     | Label kecil di atas judul halaman (contoh: "HEYBAT" di atas "Data Supplier") — SELALU pakai `accent-yellow` |
| `heading-1`     | 22px                                  | Bold     | Judul halaman                                                                                               |
| `heading-2`     | 16px                                  | Semibold | Judul section/card besar                                                                                    |
| `body`          | 13px                                  | Regular  | Isi teks umum, label form                                                                                   |
| `body-emphasis` | 14px                                  | Bold     | Data penting dalam card (harga, angka kunci) — beda dari `body` lewat bobot bukan ukuran jauh               |
| `caption`       | 11px                                  | Regular  | Deskripsi kecil, helper text, placeholder                                                                   |
| `badge`         | 10px                                  | Semibold | Teks di dalam badge/pill                                                                                    |


Line-height rapat (1.35 untuk body, 1.2 untuk heading) — bukan longgar. Tujuannya info padat termuat tanpa terasa sesak, mengikuti pola Tokopedia.

---

## 3. Spacing & Radius

- **Radius seragam di semua elemen:** `4px` (card, modal, input, button, badge — semua sama, nyaris kotak, sangat tegas). Jangan campur radius berbeda antar komponen.
- Spacing pakai kelipatan 4px: 4, 8, 12, 16, 24, 32.
- Padding standar card: `10-12px` (padat maksimal — jarak antar baris teks di dalam card dimepetkan, jangan ada whitespace kosong berlebih). Padding standar input/button: `8px vertikal, 12px horizontal`.
- Gap antar card dalam grid: `6-8px` (rapat).
- Top bar: tinggi ringkas (~48-52px), jangan terlalu tinggi — logo+judul dipepetkan vertikal, bukan diberi padding lega.
- Shadow card: tipis saja, `shadow-sm` dengan opacity rendah (kesan "mengambang" bukan "menonjol") — jangan shadow tebal/gelap pekat.

---

## 4. Komponen Dasar

**Bottom Nav circle loader:**

- Collapsed control (kanan-bawah): kotak `rounded-[4px]` (bukan full circle) + logo Heybat saat idle.
- Saat `navLoading`: logo fade-out (~180ms), lalu Morph Loader (bentuk SVG morph + wave) terus berputar.
- Saat loading selesai: tunggu titik siklus morph (event `animationiteration`) baru logo fade-in — jangan potong animasi di tengah bentuk.
- Warna morph: `accent-yellow` di atas circle `bg-surface` saat busy (circle idle tetap kuning + logo).

**Button:**

- Primary: background `accent-navy`, teks putih, radius 4px, padding 8px/12px. Hover: sedikit lebih terang.
- Secondary: transparan, border `border-subtle`, teks `text-primary`. Hover: `bg-surface-hover`.
- Danger (hapus, dll): background `state-error` versi redup/outline, bukan solid penuh kecuali konfirmasi akhir.

**Input field:**

- Background `bg-surface`, border `border-subtle` (1px), radius 4px.
- Saat fokus: border berubah jadi `accent-yellow` (bukan biru default browser).
- Placeholder pakai `text-muted`.
- Padding rapat: ~6px vertikal, 12px horizontal (bukan gemuk/tinggi).

**Modal:**

- Background `bg-surface`, radius 4px, muncul di tengah untuk desktop.
- **Mobile: WAJIB jadi bottom-sheet** (slide dari bawah, full-width, radius hanya di 2 sudut atas) — bukan modal mengambang kecil di tengah layar HP kecil.
- Header modal (baik mode lihat/detail maupun mode edit): tampilkan identitas data yang sedang dibuka (misal nama + badge inisial), BUKAN judul generik seperti "Detail X" / "Edit X" — konsisten sama antara mode lihat dan mode edit.
- Body modal yang bisa discroll: scrollbar disembunyikan secara visual (lihat aturan Scrollbar di bawah), fungsi scroll tetap jalan normal.
- Danger Zone (hapus data, dsb): ditempatkan terpisah jelas di bagian bawah modal, pakai aksen `state-error` di border/judul, dan mewajibkan konfirmasi mengetik ulang nama data sebelum tombol hapus final aktif — bukan cuma dialog OK/Cancel bawaan browser.

**Card:**

- Background `bg-surface`, radius 8px, shadow tipis, padding 12-14px (padat).
- **1 card = 1 unit informasi** — jangan jejalkan banyak data tidak berkaitan dalam 1 card.
- Grid rapat: gap antar card 8px, di mobile bisa 2 kolom kalau kontennya ringkas (bukan otomatis 1 kolom lebar) — sesuaikan dengan jumlah data yang ditampilkan per card.
- Badge kecil (status, inisial PBF, dll) pakai `accent-yellow` background dengan teks gelap (`bg-base` atau hitam pekat) supaya kontras kuat — BUKAN teks kuning di atas background gelap (kurang solid sebagai badge).

**Top bar:**

- Fixed/sticky di atas, tinggi ringkas (~48-52px).
- TANPA border-bottom tegas — gaya menyatu dengan background: gradient halus dari `bg-surface` ke `bg-base` lalu ke transparan, dikombinasikan `backdrop-blur` tipis, supaya konten yang discroll di baliknya terasa depth tanpa garis keras.
- Kiri: logo Heybat (kecil) + nama menu aktif. Kanan: slot kosong reusable untuk tombol search/filter/titik-tiga (diisi sesuai kebutuhan tiap modul).

**Bottom nav:**

- BUKAN full-width menempel tepi — bentuk **pill melayang** (`rounded-full`, pengecualian dari radius 4px global, sama seperti avatar/FAB), ada jarak/margin dari tepi kiri-kanan-bawah layar, shadow untuk kesan mengambang.
- Item menu disimpan sebagai array scalable di `navConfig.js` — gampang ditambah item baru seiring modul baru dibangun, jangan hardcode jumlah slot. Kalau item makin banyak, pill bisa scroll horizontal.
- Tiap item: ikon (lucide-react, konsisten dengan FAB) + label kecil di bawahnya. Item aktif diberi chip kuning sebagai indikator.
- Karena pill ini melayang di atas konten, halaman WAJIB diberi padding-bottom cukup (~`pb-28`) supaya konten paling bawah tidak tertutup pill saat discroll.
- FAB (tombol aksi utama) diposisikan naik (misal `bottom-24`) supaya tidak bertabrakan dengan pill.

**FAB (tombol aksi utama/tambah):**

- Tetap `rounded-full` (bulat penuh, bukan ikut radius 4px global).
- Ikon dari lucide-react (misal `Plus`), shadow lebih elevated dibanding card biasa.
- Posisi mengikuti aturan bottom nav di atas — jangan bertabrakan dengan pill.

**Empty state:**

- Border dashed `border-subtle`, ikon/teks di tengah, 1 kalimat singkat penjelas + 1 tombol aksi jelas. Nada bicara: ajakan bertindak, bukan sekadar informasi kosong.

**Skeleton loading:**

- Bentuk kotak meniru layout asli (card/list), warna `bg-surface-hover`, animasi pulse halus.

**Scrollbar:**

- Scrollbar HARUS disembunyikan secara visual di SEMUA elemen yang bisa discroll (modal, list, halaman, dll) — fungsi scroll tetap normal, cuma track/garis scrollbar-nya yang tidak ditampilkan.
- Terapkan sebagai utility class global (misal `.scrollbar-hide`), bukan 1-1 per komponen.

**Spinner loading (submit/fetch kecil):**

- Ring dengan gradient dari transparan ke `accent-yellow` solid, stroke round linecap, tanpa teks, putaran ~0.8-1 detik.

---

## 5. Layout & Mobile-First

- Breakpoint utama: mobile (< 640px) adalah **default yang dirancang duluan**, desktop adalah pelebaran — bukan sebaliknya.
- Grid card: 1 kolom di mobile, 2-3 kolom di tablet/desktop (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`) — atau 2 kolom di mobile kalau konten card ringkas, sesuaikan.
- Form panjang di mobile: 1 kolom field per baris (jangan paksa 2 kolom sejajar di layar sempit) — boleh 2 kolom mulai breakpoint tablet ke atas.
- **Navigasi utama (mobile):** Top bar (lihat komponen di atas) + Bottom nav pill melayang (lihat komponen di atas). Konten halaman diberi padding-bottom cukup (`pb-28` atau setara) supaya tidak tertutup pill.
- **Navigasi utama (desktop):** belum digarap, akan ditentukan menyusul — untuk sekarang fokus mobile-first saja.

---

## 6. Identitas Brand

- **Logo Heybat** — sudah tersedia (`logo_heybat.png`, ditaruh di `frontend/public/`). Pasang di header/navigasi utama dan halaman login, ukuran secukupnya (jangan besar-besar), jangan stretch/distorsi rasio.
- **Logo Yelo** — identitas apotek yang memakai aplikasi (karena Heybat berpotensi dipakai apotek lain di masa depan sebagai SaaS), ditempatkan di halaman login dan/atau dashboard sebagai penanda "apotek mana yang sedang dipakai".
- Jangan tempatkan dekorasi visual lain (pattern, ilustrasi, gradient background besar) sebagai pengganti identitas — logo adalah satu-satunya elemen signature, sisanya tetap disiplin sesuai token di atas.

---

## 7. Yang Harus Dihindari (Pelajaran dari Screenshot Sebelumnya)

- Jangan biarkan card dan background halaman punya warna gelap yang sama persis — tidak ada depth/kontras.
- Jangan pakai kuning sebagai warna judul halaman biasa tanpa fungsi (di screenshot, "HEYBAT" kuning oke sebagai eyebrow brand, tapi jangan generalisasi kuning ke semua judul).
- Jangan bikin modal desktop dipaksa tampil sama persis di mobile.
- Jangan sejajarkan banyak field form dalam kolom sempit di mobile.
- Jangan biarkan semua tombol (primary/secondary) punya bobot visual sama — harus ada hierarki jelas mana aksi utama.

