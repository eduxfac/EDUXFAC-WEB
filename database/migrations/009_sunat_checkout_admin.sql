BEGIN;
ALTER TABLE sunat_sucursales ADD COLUMN IF NOT EXISTS envio_automatico boolean NOT NULL DEFAULT false;
INSERT INTO web_schema_migrations(version) VALUES('009_sunat_checkout_admin') ON CONFLICT DO NOTHING;
COMMIT;
