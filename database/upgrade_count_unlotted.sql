-- A NULL lot number represents unassigned stock, never a fabricated batch identity.
-- Existing rows and their metadata are not changed. PostgreSQL 15+.
ALTER TABLE lotes ALTER COLUMN numero_lote DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_index i ON i.indexrelid=c.conindid
    WHERE c.conrelid='lotes'::regclass AND c.conname='lotes_producto_id_sucursal_id_numero_lote_key'
      AND i.indnullsnotdistinct) THEN
    ALTER TABLE lotes DROP CONSTRAINT IF EXISTS lotes_producto_id_sucursal_id_numero_lote_key;
    ALTER TABLE lotes ADD CONSTRAINT lotes_producto_id_sucursal_id_numero_lote_key
      UNIQUE NULLS NOT DISTINCT (producto_id,sucursal_id,numero_lote);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='lotes'::regclass AND conname='stock_sin_lote_sin_vencimiento') THEN
    ALTER TABLE lotes ADD CONSTRAINT stock_sin_lote_sin_vencimiento
      CHECK (numero_lote IS NOT NULL OR fecha_vencimiento IS NULL);
  END IF;
END $$;
