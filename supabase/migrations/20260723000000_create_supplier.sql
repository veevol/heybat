-- Data Supplier foundation table for Heybat
-- Referenced later by Pricelist PBF via supplier.id / supplier.inisial

CREATE TABLE IF NOT EXISTS public.supplier (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama TEXT NOT NULL,
  inisial TEXT NOT NULL,
  no_telp_pbf TEXT,
  nama_sales TEXT,
  no_wa_sales TEXT,
  alamat TEXT,
  jadwal_kirim TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT supplier_inisial_unique UNIQUE (inisial)
);

CREATE INDEX IF NOT EXISTS idx_supplier_nama ON public.supplier (nama);

-- Keep updated_at fresh on every row update
CREATE OR REPLACE FUNCTION public.set_supplier_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_updated_at ON public.supplier;
CREATE TRIGGER trg_supplier_updated_at
  BEFORE UPDATE ON public.supplier
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_supplier_updated_at();

-- Hard stop: inisial is immutable after insert (defense in depth + app validation)
CREATE OR REPLACE FUNCTION public.prevent_supplier_inisial_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.inisial IS DISTINCT FROM OLD.inisial THEN
    RAISE EXCEPTION 'Inisial tidak bisa diubah setelah dibuat'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_inisial_immutable ON public.supplier;
CREATE TRIGGER trg_supplier_inisial_immutable
  BEFORE UPDATE ON public.supplier
  FOR EACH ROW
  EXECUTE PROCEDURE public.prevent_supplier_inisial_change();

ALTER TABLE public.supplier ENABLE ROW LEVEL SECURITY;

-- Backend uses service_role (bypasses RLS). No public policies by default.
COMMENT ON TABLE public.supplier IS 'Master data PBF/supplier; inisial is immutable after create';
COMMENT ON COLUMN public.supplier.inisial IS 'Short PBF identity code; set once at create, never updated';
