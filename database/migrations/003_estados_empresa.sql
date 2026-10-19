-- Aplicación explícita después de Fase 2. Nunca ejecutar automáticamente al iniciar.
BEGIN;
ALTER TABLE acciones_admin DROP CONSTRAINT IF EXISTS acciones_admin_accion_check;
ALTER TABLE acciones_admin ADD CONSTRAINT acciones_admin_accion_check CHECK(accion IN (
 'SUSPENDER','REACTIVAR','CANCELAR','VENCER','CREAR_CLIENTE','CREAR_EMPRESA',
 'CREAR_SUCURSAL_PRINCIPAL','CREAR_ADMIN_INICIAL','ACTIVAR'));
CREATE TABLE IF NOT EXISTS acciones_admin_intentos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), command_id uuid NOT NULL,
 empresa_id uuid NOT NULL REFERENCES empresas(id), accion varchar(30) NOT NULL,
 administrador varchar(120) NOT NULL, motivo varchar(500) NOT NULL,
 estado_anterior varchar(12), estado_nuevo varchar(12),
 resultado varchar(12) NOT NULL CHECK(resultado='ERROR'), error varchar(80) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS acciones_admin_empresa_fecha ON acciones_admin(empresa_id,created_at DESC);
CREATE INDEX IF NOT EXISTS acciones_admin_intentos_empresa_fecha ON acciones_admin_intentos(empresa_id,created_at DESC);
INSERT INTO web_schema_migrations(version) VALUES('003_estados_empresa') ON CONFLICT DO NOTHING;
COMMIT;
