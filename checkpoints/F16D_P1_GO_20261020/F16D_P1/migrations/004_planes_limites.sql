-- FASE 4: aplicación explícita después de 003. No aplica planes automáticamente.
BEGIN;
ALTER TABLE empresa_acceso ADD COLUMN IF NOT EXISTS plan_codigo varchar(30);
ALTER TABLE empresa_acceso ADD COLUMN IF NOT EXISTS multisucursal boolean NOT NULL DEFAULT false;
ALTER TABLE empresa_acceso ADD COLUMN IF NOT EXISTS condiciones_version bigint NOT NULL DEFAULT 0;
ALTER TABLE empresa_acceso ADD COLUMN IF NOT EXISTS condiciones_updated_at timestamptz;
ALTER TABLE empresa_acceso ADD COLUMN IF NOT EXISTS cuota_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE empresa_acceso DROP CONSTRAINT IF EXISTS empresa_condiciones_validas;
ALTER TABLE empresa_acceso ADD CONSTRAINT empresa_condiciones_validas CHECK (
 (plan_codigo IS NULL AND condiciones_version=0) OR
 (plan_codigo IN ('BASICO','PROFESIONAL','EMPRESA') AND condiciones_version>0 AND limite_usuarios>0
 AND limite_usuarios IS NOT NULL AND ((multisucursal AND limite_sucursales IS NULL)
 OR (NOT multisucursal AND limite_sucursales IS NOT NULL AND limite_sucursales>0))));
CREATE TABLE IF NOT EXISTS eventos_comerciales (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), command_id uuid NOT NULL,
 empresa_id uuid NOT NULL REFERENCES empresas(id), accion varchar(40) NOT NULL,
 administrador varchar(120) NOT NULL, motivo varchar(500) NOT NULL,
 anterior jsonb, nuevo jsonb, resultado varchar(12) NOT NULL CHECK(resultado IN ('APLICADO','ERROR')),
 error varchar(80), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eventos_comerciales_empresa_fecha ON eventos_comerciales(empresa_id,created_at DESC);
ALTER TABLE acciones_admin DROP CONSTRAINT IF EXISTS acciones_admin_accion_check;
ALTER TABLE acciones_admin ADD CONSTRAINT acciones_admin_accion_check CHECK(accion IN (
 'SUSPENDER','REACTIVAR','CANCELAR','VENCER','CREAR_CLIENTE','CREAR_EMPRESA',
 'CREAR_SUCURSAL_PRINCIPAL','CREAR_ADMIN_INICIAL','ACTIVAR','ASIGNAR_PLAN','AJUSTAR_LIMITES'));
CREATE OR REPLACE FUNCTION verificar_cuota_empresa() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE acceso empresa_acceso%ROWTYPE; usados integer; limite integer; tipo text; detalle json;
BEGIN
 IF TG_OP='UPDATE' AND NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
  RAISE EXCEPTION 'No se permite trasladar usuarios o sucursales entre empresas.';
 END IF;
 -- Desactivar/editar sin aumentar usuarios activos no consume cupo.
 IF NOT NEW.activo OR (TG_OP='UPDATE' AND OLD.activo) THEN RETURN NEW; END IF;
 -- UPDATE físico común: serializa altas y cambios de condiciones. Evita lecturas
 -- obsoletas incluso en REPEATABLE READ (la segunda operación aborta por conflicto).
 UPDATE empresa_acceso SET cuota_revision=cuota_revision+1 WHERE empresa_id=NEW.empresa_id RETURNING * INTO acceso;
 IF NOT FOUND THEN RAISE EXCEPTION 'Empresa sin configuración de acceso.'; END IF;
 IF acceso.plan_codigo IS NULL THEN
  IF acceso.estado='PENDIENTE' THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'La empresa necesita condiciones comerciales asignadas.' USING ERRCODE='P4002';
 END IF;
 IF TG_TABLE_NAME='sucursales' THEN
  tipo:='SUCURSALES';limite:=acceso.limite_sucursales;
  SELECT count(*) INTO usados FROM sucursales WHERE empresa_id=NEW.empresa_id AND activo=true AND id<>NEW.id;
 ELSE
  tipo:='USUARIOS';limite:=acceso.limite_usuarios;
  SELECT count(*) INTO usados FROM usuarios WHERE empresa_id=NEW.empresa_id AND activo=true AND id<>NEW.id;
 END IF;
 IF limite IS NOT NULL AND usados>=limite THEN
  detalle:=json_build_object('empresa_id',NEW.empresa_id,'tipo',tipo,'usados',usados,'limite',limite);
  IF tipo='SUCURSALES' THEN
   RAISE EXCEPTION 'Has alcanzado el límite de sucursales permitido por tu plan.' USING ERRCODE='P4001',DETAIL=detalle::text;
  ELSE
   RAISE EXCEPTION 'Has alcanzado el límite de usuarios permitido por tu plan.' USING ERRCODE='P4001',DETAIL=detalle::text;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cuota_sucursales ON sucursales;
CREATE TRIGGER cuota_sucursales BEFORE INSERT OR UPDATE OF activo,empresa_id ON sucursales FOR EACH ROW EXECUTE FUNCTION verificar_cuota_empresa();
DROP TRIGGER IF EXISTS cuota_usuarios ON usuarios;
CREATE TRIGGER cuota_usuarios BEFORE INSERT OR UPDATE OF activo,empresa_id ON usuarios FOR EACH ROW EXECUTE FUNCTION verificar_cuota_empresa();
INSERT INTO web_schema_migrations(version) VALUES('004_planes_limites') ON CONFLICT DO NOTHING;
COMMIT;
