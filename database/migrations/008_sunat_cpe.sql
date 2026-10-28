BEGIN;
CREATE TABLE IF NOT EXISTS sunat_sucursales (
 empresa_id uuid NOT NULL REFERENCES empresas(id), sucursal_id uuid PRIMARY KEY REFERENCES sucursales(id),
 ambiente text NOT NULL CHECK(ambiente IN ('beta','produccion')), habilitado boolean NOT NULL DEFAULT false,
 serie_factura text NOT NULL DEFAULT 'F001', serie_boleta text NOT NULL DEFAULT 'B001', fiscal_json jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sunat_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id),
 sucursal_id uuid NOT NULL REFERENCES sucursales(id), venta_id uuid NOT NULL REFERENCES ventas(id),
 payload_json jsonb NOT NULL, documento_id uuid, estado text NOT NULL DEFAULT 'PENDIENTE',
 intentos integer NOT NULL DEFAULT 0, error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(empresa_id,venta_id)
);
CREATE INDEX IF NOT EXISTS sunat_outbox_empresa ON sunat_outbox(empresa_id,sucursal_id,created_at DESC);
INSERT INTO web_schema_migrations(version) VALUES('008_sunat_cpe') ON CONFLICT DO NOTHING;
COMMIT;
