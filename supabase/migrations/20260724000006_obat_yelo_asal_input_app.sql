-- Flag asal input obat Yelo + status sudah dimasukkan ke Vmedis (khusus obat dari app)

ALTER TABLE public.obat_yelo
  ADD COLUMN IF NOT EXISTS asal_input TEXT NOT NULL DEFAULT 'vmedis',
  ADD COLUMN IF NOT EXISTS sudah_ditambah_vmedis BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.obat_yelo
  DROP CONSTRAINT IF EXISTS obat_yelo_asal_input_check;

ALTER TABLE public.obat_yelo
  ADD CONSTRAINT obat_yelo_asal_input_check
  CHECK (asal_input IN ('vmedis', 'app'));

-- Pastikan data lama tetap 'vmedis'
UPDATE public.obat_yelo
SET asal_input = 'vmedis'
WHERE asal_input IS NULL OR asal_input = '';

CREATE INDEX IF NOT EXISTS idx_obat_yelo_asal_input
  ON public.obat_yelo (asal_input);

CREATE INDEX IF NOT EXISTS idx_obat_yelo_asal_app_vmedis
  ON public.obat_yelo (asal_input, sudah_ditambah_vmedis)
  WHERE asal_input = 'app';

COMMENT ON COLUMN public.obat_yelo.asal_input IS
  'Sumber input: vmedis (default/import) atau app (dibuat dari Matching + Data Obat)';
COMMENT ON COLUMN public.obat_yelo.sudah_ditambah_vmedis IS
  'Hanya relevan untuk asal_input=app: apakah staf sudah input kode ini ke Vmedis';
