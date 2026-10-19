-- FASE 1. Aplicación explícita; nunca se ejecuta automáticamente al iniciar.
-- Revisar RUC duplicados antes de aplicar. No activa empresas existentes.
BEGIN;
CREATE TABLE IF NOT EXISTS web_schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS empresa_codigo varchar(80);
CREATE UNIQUE INDEX IF NOT EXISTS uq_empresas_codigo_normalizado ON empresas(lower(btrim(empresa_codigo))) WHERE nullif(btrim(empresa_codigo),'') IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_empresas_ruc_normalizado ON empresas(btrim(ruc)) WHERE nullif(btrim(ruc),'') IS NOT NULL;
CREATE TABLE IF NOT EXISTS empresa_acceso (
 empresa_id uuid PRIMARY KEY REFERENCES empresas(id),
 estado varchar(12) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','ACTIVO','SUSPENDIDO','VENCIDO','CANCELADO')),
 fecha_inicio timestamptz,
 fecha_vencimiento timestamptz,
 limite_sucursales integer CHECK (limite_sucursales IS NULL OR limite_sucursales>0),
 limite_usuarios integer CHECK (limite_usuarios IS NULL OR limite_usuarios>0),
 auth_version bigint NOT NULL DEFAULT 1 CHECK (auth_version>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (fecha_inicio IS NULL OR fecha_vencimiento IS NULL OR fecha_vencimiento>fecha_inicio)
);
INSERT INTO empresa_acceso(empresa_id) SELECT id FROM empresas ON CONFLICT(empresa_id) DO NOTHING;
CREATE TABLE IF NOT EXISTS acciones_admin (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 command_id uuid NOT NULL UNIQUE,
 empresa_id uuid NOT NULL REFERENCES empresas(id),
 accion varchar(30) NOT NULL CHECK (accion IN ('SUSPENDER','REACTIVAR')),
 motivo varchar(500) NOT NULL,
 estado_anterior varchar(12) NOT NULL,
 estado_nuevo varchar(12) NOT NULL,
 resultado jsonb NOT NULL,
 request_hash char(64) NOT NULL,
 actor_servicio varchar(120) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_acciones_admin_empresa_fecha ON acciones_admin(empresa_id,created_at DESC);
INSERT INTO web_schema_migrations(version) VALUES ('001_empresa_acceso') ON CONFLICT DO NOTHING;
COMMIT;
