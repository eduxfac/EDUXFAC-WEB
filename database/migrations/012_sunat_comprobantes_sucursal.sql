BEGIN;
ALTER TABLE sunat_sucursales ADD COLUMN IF NOT EXISTS comprobantes_habilitados jsonb NOT NULL DEFAULT '["01","03","07","08"]'::jsonb;
INSERT INTO web_schema_migrations(version) VALUES('012_sunat_comprobantes_sucursal') ON CONFLICT DO NOTHING;
COMMIT;
