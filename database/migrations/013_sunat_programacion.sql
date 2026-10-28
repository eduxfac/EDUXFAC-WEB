BEGIN;
ALTER TABLE sunat_sucursales ADD COLUMN IF NOT EXISTS envio_modo text CHECK(envio_modo IN ('inmediato','programado','manual'));
ALTER TABLE sunat_sucursales ADD COLUMN IF NOT EXISTS envio_hora time NOT NULL DEFAULT '23:00';
INSERT INTO web_schema_migrations(version) VALUES('013_sunat_programacion') ON CONFLICT DO NOTHING;
COMMIT;
