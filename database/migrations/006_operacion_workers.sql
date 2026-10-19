-- Fase 6. Control de ejecución del worker; ninguna modificación de migraciones previas.
BEGIN;
CREATE TABLE IF NOT EXISTS operacion_workers(
 nombre varchar(80) PRIMARY KEY,owner uuid,lease_until timestamptz,
 last_started timestamptz,last_finished timestamptz,
 resultado varchar(12) NOT NULL DEFAULT 'PENDIENTE' CHECK(resultado IN('PENDIENTE','RUNNING','OK','ERROR'))
);
INSERT INTO web_schema_migrations(version) VALUES('006_operacion_workers') ON CONFLICT DO NOTHING;
COMMIT;
