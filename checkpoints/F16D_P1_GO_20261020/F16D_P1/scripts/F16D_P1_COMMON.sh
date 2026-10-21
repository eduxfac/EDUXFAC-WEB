#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly PRODUCTION_DATABASE=eduxfac
readonly PILOT_DATABASE=eduxfac_web_piloto
readonly CLONE_DATABASE=eduxfac_f16dp1_clone
readonly EXPECTED_CLONE_MARKER='{"eduxfac_data_mode":"DEMO","purpose":"F16D-P1_CLONE_ONLY"}'
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
BUNDLE_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
MIGRATIONS_DIR="$BUNDLE_DIR/migrations"
WORK_ROOT=${HOME}/.local/share/eduxfac/f16dp1_clone
PHASE_MARKER="$WORK_ROOT/.F16D_P1_CLONE_ONLY"

die(){ echo "ERROR: $*" >&2; exit 1; }
require_non_root(){ [ "$(id -u)" -ne 0 ] || die 'ejecutar como usuario normal con sudo, no como root.'; }
require_commands(){
  local command
  for command in "$@"; do command -v "$command" >/dev/null 2>&1 || die "dependencia ausente: $command"; done
}
assert_clone_target_literal(){
  [ "$CLONE_DATABASE" = 'eduxfac_f16dp1_clone' ] || die 'nombre literal del clon alterado.'
  case "$CLONE_DATABASE" in
    eduxfac|eduxfac_web_piloto|postgres|template0|template1) die 'base protegida usada como clon.' ;;
  esac
}
assert_safe_local_paths(){
  [ -n "${HOME:-}" ] && [ "$HOME" != '/' ] || die 'HOME inseguro.'
  [ "$WORK_ROOT" = "$HOME/.local/share/eduxfac/f16dp1_clone" ] || die 'ruta de trabajo inesperada.'
  for path in "$HOME/.local" "$HOME/.local/share" "$HOME/.local/share/eduxfac" "$BUNDLE_DIR" "$MIGRATIONS_DIR"; do
    [ ! -L "$path" ] || die "symlink no permitido: $path"
  done
  [ ! -L "$WORK_ROOT" ] || die 'WORK_ROOT no puede ser symlink.'
  [ -z "$(find "$BUNDLE_DIR" -type l -print -quit)" ] || die 'el paquete F16D-P1 contiene symlinks.'
}
assert_no_work_symlinks(){ [ ! -d "$WORK_ROOT" ] || [ -z "$(find "$WORK_ROOT" -type l -print -quit)" ] || die 'WORK_ROOT contiene symlinks.'; }
assert_new_output(){
  local output=$1
  [ ! -e "$output" ] && [ ! -L "$output" ] || die 'el archivo de evidencia ya existe o es symlink.'
}
verify_bundle_manifest(){
  [ -f "$BUNDLE_DIR/MANIFEST_SHA256.txt" ] && [ ! -L "$BUNDLE_DIR/MANIFEST_SHA256.txt" ] || die 'manifiesto ausente o symlink.'
  (cd "$BUNDLE_DIR" && sha256sum --strict -c MANIFEST_SHA256.txt >/dev/null) || die 'integridad del paquete F16D-P1 inválida.'
}
db_exists(){
  local database=$1 result
  result=$(sudo -u postgres psql -X -qAt -v ON_ERROR_STOP=1 -d postgres -v expected="$database" <<'SQL'
SET default_transaction_read_only=on;
BEGIN TRANSACTION READ ONLY;
SELECT datname FROM pg_database WHERE datname=:'expected';
COMMIT;
SQL
)
  [ "$result" = "$database" ]
}
assert_source_databases(){
  db_exists "$PRODUCTION_DATABASE" || die "base esperada ausente: $PRODUCTION_DATABASE"
  db_exists "$PILOT_DATABASE" || die "base esperada ausente: $PILOT_DATABASE"
}
current_database(){
  local database=$1
  sudo -u postgres psql -X -qAt -v ON_ERROR_STOP=1 -d "$database" <<'SQL'
SET default_transaction_read_only=on;
BEGIN TRANSACTION READ ONLY;
SELECT current_database();
COMMIT;
SQL
}
database_marker(){
  local database=$1
  sudo -u postgres psql -X -qAt -v ON_ERROR_STOP=1 -d "$database" <<'SQL'
SET default_transaction_read_only=on;
BEGIN TRANSACTION READ ONLY;
SELECT coalesce(shobj_description(oid,'pg_database'),'') FROM pg_database WHERE datname=current_database();
COMMIT;
SQL
}
assert_clone(){
  assert_clone_target_literal
  [ "$(current_database "$CLONE_DATABASE")" = "$CLONE_DATABASE" ] || die 'identidad del clon no confirmada.'
  [ "$(database_marker "$CLONE_DATABASE")" = "$EXPECTED_CLONE_MARKER" ] || die 'marcador exclusivo del clon ausente o distinto.'
}
assert_phase_marker(){
  assert_no_work_symlinks
  [ -f "$PHASE_MARKER" ] && [ ! -L "$PHASE_MARKER" ] || die 'marcador local F16D-P1 ausente.'
  [ "$(cat "$PHASE_MARKER")" = 'F16D-P1 CLONE ONLY' ] || die 'marcador local F16D-P1 inválido.'
}
business_snapshot(){
  local database=$1 destination=$2
  sudo -u postgres psql -X -qAt -v ON_ERROR_STOP=1 -F $'\t' -d "$database" >"$destination" <<'SQL'
SET default_transaction_read_only=on;
BEGIN TRANSACTION READ ONLY;
SELECT 'empresas',count(*),md5(coalesce(string_agg(md5((to_jsonb(t)-'empresa_codigo'-'cliente_admin_id')::text),'' ORDER BY id::text),'')) FROM empresas t
UNION ALL SELECT 'sucursales',count(*),md5(coalesce(string_agg(md5((to_jsonb(t)-'es_principal')::text),'' ORDER BY id::text),'')) FROM sucursales t
UNION ALL SELECT 'usuarios',count(*),md5(coalesce(string_agg(md5((to_jsonb(t)-'es_administrador_inicial'-'debe_cambiar_password')::text),'' ORDER BY id::text),'')) FROM usuarios t
UNION ALL SELECT 'productos',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id::text),'')) FROM productos t
UNION ALL SELECT 'ventas',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id::text),'')) FROM ventas t
UNION ALL SELECT 'compras',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id::text),'')) FROM compras t
ORDER BY 1;
COMMIT;
SQL
}
schema_snapshot(){
  local database=$1 destination=$2
  sudo -u postgres psql -X -qAt -v ON_ERROR_STOP=1 -F $'\t' -d "$database" >"$destination" <<'SQL'
SET default_transaction_read_only=on;
BEGIN TRANSACTION READ ONLY;
SELECT 'TABLE',table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'
UNION ALL SELECT 'COLUMN',table_name||'.'||column_name||':'||data_type||':'||is_nullable FROM information_schema.columns WHERE table_schema='public'
UNION ALL SELECT 'INDEX',tablename||'.'||indexname||':'||indexdef FROM pg_indexes WHERE schemaname='public'
UNION ALL SELECT 'CONSTRAINT',c.relname||'.'||con.conname||':'||con.contype::text||':'||pg_get_constraintdef(con.oid,true) FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
ORDER BY 1,2;
COMMIT;
SQL
}
rls_snapshot(){
  local database=$1 destination=$2
  sudo -u postgres psql -X -qAt -v ON_ERROR_STOP=1 -F $'\t' -d "$database" >"$destination" <<'SQL'
SET default_transaction_read_only=on;
BEGIN TRANSACTION READ ONLY;
SELECT 'RLS',c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') AND c.relname NOT IN ('web_schema_migrations','empresa_acceso','acciones_admin','clientes_admin','acciones_admin_intentos','eventos_comerciales','suscripcion_eventos','operacion_workers')
UNION ALL SELECT 'POLICY',tablename||'.'||policyname,false,false FROM pg_policies WHERE schemaname='public' AND tablename NOT IN ('web_schema_migrations','empresa_acceso','acciones_admin','clientes_admin','acciones_admin_intentos','eventos_comerciales','suscripcion_eventos','operacion_workers')
ORDER BY 1,2;
COMMIT;
SQL
}
roles_snapshot(){
  local destination=$1
  sudo -u postgres psql -X -qAt -v ON_ERROR_STOP=1 -F $'\t' -d postgres >"$destination" <<'SQL'
SET default_transaction_read_only=on;
BEGIN TRANSACTION READ ONLY;
SELECT md5(coalesce(string_agg(rolname||':'||rolsuper||':'||rolinherit||':'||rolcreaterole||':'||rolcreatedb||':'||rolcanlogin||':'||rolreplication||':'||rolbypassrls,'|' ORDER BY rolname),''))
FROM pg_roles WHERE rolname LIKE 'eduxfac_web_%';
COMMIT;
SQL
}
