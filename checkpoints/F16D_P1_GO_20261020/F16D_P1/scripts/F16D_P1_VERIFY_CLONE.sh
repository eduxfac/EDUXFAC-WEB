#!/usr/bin/env bash
set -euo pipefail
umask 077
source "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/F16D_P1_COMMON.sh"

[ "${F16D_P1_ACK:-}" = 'VERIFY_CLONE_ONLY' ] || die 'falta F16D_P1_ACK=VERIFY_CLONE_ONLY.'
require_non_root
require_commands sudo psql sha256sum diff find
assert_clone_target_literal
assert_safe_local_paths
verify_bundle_manifest
assert_source_databases
assert_phase_marker
[ -f "$WORK_ROOT/backup/eduxfac.dump" ] && [ ! -L "$WORK_ROOT/backup/eduxfac.dump" ] || die 'backup ausente o symlink.'
[ -f "$WORK_ROOT/backup/eduxfac.dump.sha256" ] && [ ! -L "$WORK_ROOT/backup/eduxfac.dump.sha256" ] || die 'checksum del backup ausente o symlink.'
[ "$(cat "$WORK_ROOT/APPLY_STATUS")" = 'ADMIN_MIGRATIONS_001_005_APPLIED' ] || die 'migraciones administrativas del clon no verificadas.'
assert_clone
sha256sum -c "$WORK_ROOT/backup/eduxfac.dump.sha256"

business_snapshot "$PRODUCTION_DATABASE" "$WORK_ROOT/evidence/production_business_verify.tsv"
diff -u "$WORK_ROOT/evidence/production_business_before.tsv" "$WORK_ROOT/evidence/production_business_verify.tsv" >/dev/null || die 'producción cambió desde la creación del clon; revisar antes de continuar.'
printf '%s' "$(database_marker "$PILOT_DATABASE")" | sha256sum >"$WORK_ROOT/evidence/pilot_marker_verify.sha256"
diff -u "$WORK_ROOT/evidence/pilot_marker_before.sha256" "$WORK_ROOT/evidence/pilot_marker_verify.sha256" >/dev/null || die 'el marcador piloto cambió.'
business_snapshot "$PILOT_DATABASE" "$WORK_ROOT/evidence/pilot_business_verify.tsv"
diff -u "$WORK_ROOT/evidence/pilot_business_before.tsv" "$WORK_ROOT/evidence/pilot_business_verify.tsv" >/dev/null || die 'la base piloto cambió desde la creación del clon.'

sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d "$CLONE_DATABASE" >"$WORK_ROOT/evidence/admin_schema_verify.txt" <<'SQL'
SET default_transaction_read_only=on;
BEGIN TRANSACTION READ ONLY;
DO $verify_schema$
DECLARE versions text; unexpected integer; enabled integer;
BEGIN
 IF current_database()<>'eduxfac_f16dp1_clone' THEN RAISE EXCEPTION 'CLONE_ONLY_REQUIRED'; END IF;
 SELECT string_agg(version,',' ORDER BY version) INTO versions FROM web_schema_migrations;
 IF versions<>'001_empresa_acceso,002_alta_clientes_empresas,003_estados_empresa,004_planes_limites,005_suscripciones_vigencia' THEN RAISE EXCEPTION 'MIGRATION_SET_INVALID: %',versions; END IF;
 IF to_regclass('public.empresa_acceso') IS NULL OR to_regclass('public.acciones_admin') IS NULL OR to_regclass('public.clientes_admin') IS NULL OR to_regclass('public.acciones_admin_intentos') IS NULL OR to_regclass('public.eventos_comerciales') IS NULL OR to_regclass('public.suscripcion_eventos') IS NULL THEN RAISE EXCEPTION 'EXPECTED_ADMIN_TABLE_MISSING'; END IF;
 IF to_regclass('public.operacion_workers') IS NOT NULL THEN RAISE EXCEPTION 'MIGRATION_006_PRESENT'; END IF;
 SELECT count(*) INTO unexpected FROM web_schema_migrations WHERE version NOT IN ('001_empresa_acceso','002_alta_clientes_empresas','003_estados_empresa','004_planes_limites','005_suscripciones_vigencia');
 IF unexpected<>0 THEN RAISE EXCEPTION 'UNEXPECTED_MIGRATION_PRESENT'; END IF;
 SELECT count(*) INTO unexpected FROM (VALUES
  ('empresas','empresa_codigo'),('empresas','cliente_admin_id'),('sucursales','es_principal'),('usuarios','es_administrador_inicial'),('usuarios','debe_cambiar_password'),
  ('empresa_acceso','plan_codigo'),('empresa_acceso','multisucursal'),('empresa_acceso','condiciones_version'),('empresa_acceso','suscripcion_requerida'),('empresa_acceso','suscripcion_id'),('empresa_acceso','estado_suscripcion'),('empresa_acceso','version_suscripcion')
 ) expected(tab,col) WHERE NOT EXISTS(SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=expected.tab AND c.column_name=expected.col);
 IF unexpected<>0 THEN RAISE EXCEPTION 'EXPECTED_COLUMN_MISSING'; END IF;
 SELECT count(*) INTO unexpected FROM (VALUES
  ('uq_empresas_codigo_normalizado'),('uq_empresas_ruc_normalizado'),('uq_clientes_admin_documento'),('uq_sucursal_principal_empresa'),('uq_usuarios_empresa_nombre_normalizado'),('uq_administrador_inicial_empresa')
 ) expected(name) WHERE to_regclass('public.'||expected.name) IS NULL;
 IF unexpected<>0 THEN RAISE EXCEPTION 'EXPECTED_INDEX_MISSING'; END IF;
 SELECT count(*) INTO unexpected FROM (VALUES('empresa_condiciones_validas'),('suscripcion_acceso_valida')) expected(name) WHERE NOT EXISTS(SELECT 1 FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND con.conname=expected.name);
 IF unexpected<>0 THEN RAISE EXCEPTION 'EXPECTED_CONSTRAINT_MISSING'; END IF;
 SELECT count(*) INTO unexpected FROM (VALUES('cuota_sucursales'),('cuota_usuarios'),('suscripcion_historial_inmutable')) expected(name) WHERE NOT EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND t.tgname=expected.name AND NOT t.tgisinternal);
 IF unexpected<>0 THEN RAISE EXCEPTION 'EXPECTED_TRIGGER_MISSING'; END IF;
 SELECT count(*) INTO enabled FROM pg_class WHERE oid=ANY(ARRAY['public.empresa_acceso'::regclass,'public.acciones_admin'::regclass,'public.clientes_admin'::regclass,'public.acciones_admin_intentos'::regclass,'public.eventos_comerciales'::regclass,'public.suscripcion_eventos'::regclass]) AND (relrowsecurity OR relforcerowsecurity);
 IF enabled<>0 THEN RAISE EXCEPTION 'UNEXPECTED_RLS_ON_ADMIN_TABLES'; END IF;
 SELECT count(*) INTO unexpected FROM pg_policies WHERE schemaname='public' AND tablename IN ('empresa_acceso','acciones_admin','clientes_admin','acciones_admin_intentos','eventos_comerciales','suscripcion_eventos');
 IF unexpected<>0 THEN RAISE EXCEPTION 'UNEXPECTED_POLICY_ON_ADMIN_TABLES'; END IF;
END $verify_schema$;
SELECT 'ADMIN_SCHEMA_VERIFY=OK';
COMMIT;
SQL

sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d "$CLONE_DATABASE" >"$WORK_ROOT/evidence/onboarding_fictitious_test.txt" <<'SQL'
BEGIN;
DO $verify$
DECLARE admin_role bigint; n integer;
BEGIN
 IF current_database()<>'eduxfac_f16dp1_clone' THEN RAISE EXCEPTION 'CLONE_ONLY_REQUIRED'; END IF;
 IF coalesce(shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database'),'')<>'{"eduxfac_data_mode":"DEMO","purpose":"F16D-P1_CLONE_ONLY"}' THEN RAISE EXCEPTION 'CLONE_MARKER_REQUIRED'; END IF;

 INSERT INTO clientes_admin(id,cliente_panel_id,nombre,tipo_documento,numero_documento,estado)
 VALUES('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000111','F16D-P1 CLIENTE FICTICIO','RUC','00000000000','ACTIVO');
 INSERT INTO empresas(id,ruc,razon_social,nombre_comercial,activo,empresa_codigo,cliente_admin_id)
 VALUES('00000000-0000-4000-8000-000000000102','00000000000','F16D-P1 EMPRESA FICTICIA — CLON','SOLO CLON',false,'F16DP1-CLONE-ONLY','00000000-0000-4000-8000-000000000101');
 INSERT INTO empresa_acceso(empresa_id) VALUES('00000000-0000-4000-8000-000000000102');
 UPDATE empresa_acceso SET plan_codigo='BASICO',limite_sucursales=1,limite_usuarios=3,multisucursal=false,condiciones_version=1,condiciones_updated_at=now()
 WHERE empresa_id='00000000-0000-4000-8000-000000000102';
 INSERT INTO sucursales(id,empresa_id,codigo,nombre,activo,es_principal)
 VALUES('00000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000102','PRINCIPAL','Sucursal ficticia',true,true);
 SELECT id INTO admin_role FROM roles WHERE nombre='Administrador';
 IF admin_role IS NULL THEN RAISE EXCEPTION 'ADMIN_ROLE_MISSING'; END IF;
 INSERT INTO usuarios(id,empresa_id,nombre,usuario,password_hash,activo,es_administrador_inicial,debe_cambiar_password)
 VALUES('00000000-0000-4000-8000-000000000104','00000000-0000-4000-8000-000000000102','Administrador ficticio','f16dp1_admin','F16DP1_NOT_A_REAL_PASSWORD_HASH',true,true,true);
 INSERT INTO usuario_sucursal(usuario_id,sucursal_id,rol_id)
 VALUES('00000000-0000-4000-8000-000000000104','00000000-0000-4000-8000-000000000103',admin_role);
 UPDATE empresa_acceso SET suscripcion_id='00000000-0000-4000-8000-000000000105',estado_suscripcion='PENDIENTE',version_suscripcion=1,
 fecha_inicio=now(),fecha_vencimiento=now()+interval '1 month' WHERE empresa_id='00000000-0000-4000-8000-000000000102';
 UPDATE empresa_acceso SET estado='ACTIVO',estado_suscripcion='ACTIVA',auth_version=auth_version+1 WHERE empresa_id='00000000-0000-4000-8000-000000000102';
 UPDATE empresas SET activo=true WHERE id='00000000-0000-4000-8000-000000000102';
 INSERT INTO acciones_admin(command_id,empresa_id,accion,motivo,estado_anterior,estado_nuevo,resultado,request_hash,actor_servicio)
 VALUES('00000000-0000-4000-8000-000000000106','00000000-0000-4000-8000-000000000102','ACTIVAR','Ensayo exclusivo del clon','PENDIENTE','ACTIVO','{"ok":true}'::jsonb,repeat('0',64),'f16dp1-clone');
 INSERT INTO acciones_admin(command_id,empresa_id,accion,motivo,estado_anterior,estado_nuevo,resultado,request_hash,actor_servicio)
 VALUES('00000000-0000-4000-8000-000000000106','00000000-0000-4000-8000-000000000102','ACTIVAR','Ensayo exclusivo del clon','PENDIENTE','ACTIVO','{"ok":true}'::jsonb,repeat('0',64),'f16dp1-clone') ON CONFLICT(command_id) DO NOTHING;
 SELECT count(*) INTO n FROM acciones_admin WHERE command_id='00000000-0000-4000-8000-000000000106';
 IF n<>1 THEN RAISE EXCEPTION 'IDEMPOTENCY_UNIQUE_FAILED'; END IF;
 SELECT count(*) INTO n FROM empresas e JOIN empresa_acceso a ON a.empresa_id=e.id JOIN sucursales s ON s.empresa_id=e.id AND s.es_principal JOIN usuarios u ON u.empresa_id=e.id AND u.es_administrador_inicial JOIN usuario_sucursal us ON us.usuario_id=u.id AND us.sucursal_id=s.id WHERE e.id='00000000-0000-4000-8000-000000000102' AND e.activo AND a.estado='ACTIVO' AND a.estado_suscripcion='ACTIVA';
 IF n<>1 THEN RAISE EXCEPTION 'ONBOARDING_RELATIONS_INVALID'; END IF;
END $verify$;
ROLLBACK;
SQL

ABSENT=$(sudo -u postgres psql -X -qAt -v ON_ERROR_STOP=1 -d "$CLONE_DATABASE" <<'SQL'
SET default_transaction_read_only=on;
BEGIN TRANSACTION READ ONLY;
SELECT count(*) FROM empresas WHERE ruc='00000000000' OR empresa_codigo='F16DP1-CLONE-ONLY';
COMMIT;
SQL
)
[ "$ABSENT" = '0' ] || die 'la empresa ficticia no fue revertida.'
diff -u "$WORK_ROOT/evidence/clone_business_before_admin.tsv" "$WORK_ROOT/evidence/clone_business_after_admin.tsv" >/dev/null || die 'integridad comercial del clon no coincide.'
diff -u "$WORK_ROOT/evidence/clone_rls_before_admin.tsv" "$WORK_ROOT/evidence/clone_rls_after_admin.tsv" >/dev/null || die 'RLS cambió durante la Etapa A.'

echo 'F16D_P1_VERIFY_RESULT=GO_CLONE_ADMIN_SCHEMA_AND_RELATIONAL_FLOW'
echo 'HTTP_JWT_IDEMPOTENCY=REQUIRES_CODE_CANDIDATE_EXECUTION_IN_A_LATER_AUTHORIZED_STEP'
echo 'RLS_TENANT_ENFORCEMENT=NOT_APPLIED_IN_STAGE_A'
echo 'SUNAT_PSE_CONTACTS=0'
