-- Fase 5; aplicación explícita después de 004. No inventa suscripciones.
BEGIN;
ALTER TABLE empresa_acceso ADD COLUMN IF NOT EXISTS suscripcion_requerida boolean NOT NULL DEFAULT true;
ALTER TABLE empresa_acceso ADD COLUMN IF NOT EXISTS suscripcion_id uuid UNIQUE;
ALTER TABLE empresa_acceso ADD COLUMN IF NOT EXISTS estado_suscripcion varchar(12) NOT NULL DEFAULT 'PENDIENTE';
ALTER TABLE empresa_acceso ADD COLUMN IF NOT EXISTS version_suscripcion bigint NOT NULL DEFAULT 0;
ALTER TABLE empresa_acceso DROP CONSTRAINT IF EXISTS suscripcion_acceso_valida;
ALTER TABLE empresa_acceso ADD CONSTRAINT suscripcion_acceso_valida CHECK (
 estado_suscripcion IN ('PENDIENTE','ACTIVA','VENCIDA','SUSPENDIDA','CANCELADA') AND version_suscripcion>=0
 AND (suscripcion_id IS NULL OR (version_suscripcion>0 AND fecha_inicio IS NOT NULL AND fecha_vencimiento IS NOT NULL)));
CREATE TABLE IF NOT EXISTS suscripcion_eventos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id),
 suscripcion_id uuid NOT NULL, evento varchar(40) NOT NULL, command_id uuid NOT NULL,
 administrador varchar(120) NOT NULL, motivo varchar(500) NOT NULL,
 estado_anterior varchar(12),estado_nuevo varchar(12),fecha_vencimiento_anterior timestamptz,
 fecha_vencimiento_nueva timestamptz,meses_renovados integer NOT NULL DEFAULT 0,
 intervalo_vencido_inicio timestamptz,intervalo_vencido_fin timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(command_id,evento)
);
CREATE OR REPLACE FUNCTION historial_suscripcion_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'El historial de suscripción es inmutable.'; END $$;
DROP TRIGGER IF EXISTS suscripcion_historial_inmutable ON suscripcion_eventos;
CREATE TRIGGER suscripcion_historial_inmutable BEFORE UPDATE OR DELETE ON suscripcion_eventos FOR EACH ROW EXECUTE FUNCTION historial_suscripcion_inmutable();
ALTER TABLE acciones_admin DROP CONSTRAINT IF EXISTS acciones_admin_accion_check;
ALTER TABLE acciones_admin ADD CONSTRAINT acciones_admin_accion_check CHECK(accion IN (
 'SUSPENDER','REACTIVAR','CANCELAR','VENCER','CREAR_CLIENTE','CREAR_EMPRESA','CREAR_SUCURSAL_PRINCIPAL',
 'CREAR_ADMIN_INICIAL','ACTIVAR','ASIGNAR_PLAN','AJUSTAR_LIMITES','SUSCRIPCION','RENOVAR','VENCIMIENTO_AUTO'));
INSERT INTO web_schema_migrations(version) VALUES('005_suscripciones_vigencia') ON CONFLICT DO NOTHING;
COMMIT;
