-- EDUXFAC v44.4: formatos de impresión permitidos.
-- A4 se guarda como 210 mm para conservar una única unidad de almacenamiento.
ALTER TABLE empresa_config
  DROP CONSTRAINT IF EXISTS empresa_config_impresion_ancho_mm_check;

ALTER TABLE empresa_config
  ADD CONSTRAINT empresa_config_impresion_ancho_mm_check
  CHECK (impresion_ancho_mm IN (58, 80, 210));
