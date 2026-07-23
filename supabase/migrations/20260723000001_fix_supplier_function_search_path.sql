-- Harden trigger functions search_path (security advisor)

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
