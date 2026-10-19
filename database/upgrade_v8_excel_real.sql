ALTER TABLE productos ADD COLUMN IF NOT EXISTS codigo_anterior varchar(80);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_maximo numeric(14,3) NOT NULL DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS tipo_afectacion_igv varchar(160);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS favorito boolean NOT NULL DEFAULT false;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_venta_dolares numeric(14,4) NOT NULL DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS recargo_propina numeric(8,4) NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS uq_productos_empresa_codigo_anterior
  ON productos(empresa_id,codigo_anterior)
  WHERE codigo_anterior IS NOT NULL AND btrim(codigo_anterior)<>'';
