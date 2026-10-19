-- Identidad única del catálogo por empresa. Los índices de expresión protegen
-- también inserciones concurrentes y cualquier futuro punto de escritura.
CREATE UNIQUE INDEX IF NOT EXISTS uq_productos_empresa_codigo_interno_normalizado
  ON productos(empresa_id,btrim(codigo_interno));

CREATE UNIQUE INDEX IF NOT EXISTS uq_productos_empresa_barcode_normalizado
  ON productos(empresa_id,btrim(codigo_barras))
  WHERE nullif(btrim(coalesce(codigo_barras,'')),'') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_productos_empresa_nombre_normalizado
  ON productos(empresa_id,lower(regexp_replace(btrim(nombre),'\s+',' ','g')));
