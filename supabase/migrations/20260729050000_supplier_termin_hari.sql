-- Termin pembayaran supplier (hari) untuk hitung jatuh tempo tagihan
ALTER TABLE public.supplier
  ADD COLUMN IF NOT EXISTS termin_hari INTEGER;

ALTER TABLE public.supplier
  DROP CONSTRAINT IF EXISTS supplier_termin_hari_check;

ALTER TABLE public.supplier
  ADD CONSTRAINT supplier_termin_hari_check
  CHECK (termin_hari IS NULL OR termin_hari >= 0);

COMMENT ON COLUMN public.supplier.termin_hari IS
  'Jumlah hari termin pembayaran sejak tanggal faktur; dipakai hitung tanggal jatuh tempo tagihan';
