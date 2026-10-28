BEGIN;
ALTER TABLE sunat_sucursales ADD COLUMN IF NOT EXISTS series_notas jsonb NOT NULL DEFAULT '{"07F":"FC01","07B":"BC01","08F":"FD01","08B":"BD01"}'::jsonb;
INSERT INTO web_schema_migrations(version) VALUES('011_sunat_series_notas_admin') ON CONFLICT DO NOTHING;
COMMIT;
