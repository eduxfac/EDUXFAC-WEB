-- BoticaWeb v4: actualización segura para bases creadas con v2/v3
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS telefono varchar(40);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS email varchar(120);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS direccion_fiscal varchar(220);

CREATE TABLE IF NOT EXISTS empresa_config (
  empresa_id uuid PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
  moneda varchar(3) NOT NULL DEFAULT 'PEN',
  impresion_ancho_mm integer NOT NULL DEFAULT 80 CHECK(impresion_ancho_mm IN (58,80,210)),
  mensaje_ticket varchar(240) NOT NULL DEFAULT 'Gracias por su compra',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auditoria (
  id bigserial PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  usuario_id uuid REFERENCES usuarios(id),
  accion varchar(60) NOT NULL,
  entidad varchar(80) NOT NULL,
  entidad_id uuid,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auditoria_empresa_fecha ON auditoria(empresa_id,created_at DESC);
