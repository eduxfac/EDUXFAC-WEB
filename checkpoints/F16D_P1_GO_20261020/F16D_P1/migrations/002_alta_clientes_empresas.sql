-- FASE 2. Aplicar explícitamente DESPUÉS de 001_empresa_acceso; nunca en arranque.
BEGIN;
CREATE TABLE IF NOT EXISTS clientes_admin (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cliente_panel_id uuid NOT NULL UNIQUE,
 nombre varchar(120) NOT NULL, tipo_documento varchar(16) NOT NULL,
 numero_documento varchar(11), telefono varchar(40), correo varchar(120),
 CHECK (tipo_documento='SIN_DOCUMENTO' OR numero_documento IS NOT NULL),
 estado varchar(12) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((tipo_documento='DNI' AND numero_documento ~ '^[0-9]{8}$') OR (tipo_documento='RUC' AND numero_documento ~ '^[0-9]{11}$') OR (tipo_documento='SIN_DOCUMENTO' AND numero_documento IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_admin_documento ON clientes_admin(tipo_documento,numero_documento) WHERE numero_documento IS NOT NULL;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS cliente_admin_id uuid REFERENCES clientes_admin(id);
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS es_principal boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sucursal_principal_empresa ON sucursales(empresa_id) WHERE es_principal;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS es_administrador_inicial boolean NOT NULL DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS debe_cambiar_password boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_empresa_nombre_normalizado ON usuarios(empresa_id,lower(btrim(usuario)));
CREATE UNIQUE INDEX IF NOT EXISTS uq_administrador_inicial_empresa ON usuarios(empresa_id) WHERE es_administrador_inicial;
ALTER TABLE acciones_admin ALTER COLUMN empresa_id DROP NOT NULL;
ALTER TABLE acciones_admin DROP CONSTRAINT IF EXISTS acciones_admin_accion_check;
ALTER TABLE acciones_admin ADD CONSTRAINT acciones_admin_accion_check CHECK(accion IN ('SUSPENDER','REACTIVAR','CREAR_CLIENTE','CREAR_EMPRESA','CREAR_SUCURSAL_PRINCIPAL','CREAR_ADMIN_INICIAL','ACTIVAR'));
INSERT INTO web_schema_migrations(version) VALUES ('002_alta_clientes_empresas') ON CONFLICT DO NOTHING;
COMMIT;
