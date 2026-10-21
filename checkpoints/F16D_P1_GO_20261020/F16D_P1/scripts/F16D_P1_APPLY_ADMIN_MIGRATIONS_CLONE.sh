#!/usr/bin/env bash
set -euo pipefail
umask 077
source "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/F16D_P1_COMMON.sh"

[ "${F16D_P1_ACK:-}" = 'APPLY_TO_CLONE_ONLY' ] || die 'falta F16D_P1_ACK=APPLY_TO_CLONE_ONLY.'
require_non_root
require_commands sudo psql sha256sum diff mktemp awk grep find
assert_clone_target_literal
assert_safe_local_paths
verify_bundle_manifest
assert_source_databases
assert_phase_marker
[ -f "$WORK_ROOT/backup/eduxfac.dump" ] && [ ! -L "$WORK_ROOT/backup/eduxfac.dump" ] || die 'backup ausente o symlink.'
[ -f "$WORK_ROOT/backup/eduxfac.dump.sha256" ] && [ ! -L "$WORK_ROOT/backup/eduxfac.dump.sha256" ] || die 'checksum del backup ausente o symlink.'
[ "$(cat "$WORK_ROOT/CREATE_STATUS")" = 'CLONE_CREATED_AND_RESTORE_VERIFIED' ] || die 'creación/restauración del clon no verificada.'
assert_clone
sha256sum -c "$WORK_ROOT/backup/eduxfac.dump.sha256"

MIGRATIONS=(001_empresa_acceso.sql 002_alta_clientes_empresas.sql 003_estados_empresa.sql 004_planes_limites.sql 005_suscripciones_vigencia.sql)
for migration in "${MIGRATIONS[@]}"; do
  [ -f "$MIGRATIONS_DIR/$migration" ] && [ ! -L "$MIGRATIONS_DIR/$migration" ] || die "migración ausente o enlace: $migration"
  [ "$(grep -Ec '^[[:space:]]*BEGIN;[[:space:]]*$' "$MIGRATIONS_DIR/$migration")" -eq 1 ] || die "BEGIN inesperado en $migration"
  [ "$(grep -Ec '^[[:space:]]*COMMIT;[[:space:]]*$' "$MIGRATIONS_DIR/$migration")" -eq 1 ] || die "COMMIT inesperado en $migration"
done

business_snapshot "$CLONE_DATABASE" "$WORK_ROOT/evidence/clone_business_before_admin.tsv"
schema_snapshot "$CLONE_DATABASE" "$WORK_ROOT/evidence/clone_schema_before_admin.tsv"
rls_snapshot "$CLONE_DATABASE" "$WORK_ROOT/evidence/clone_rls_before_admin.tsv"
roles_snapshot "$WORK_ROOT/evidence/cluster_roles_before_admin.tsv"

COMBINED_SQL=$(mktemp "$WORK_ROOT/.f16dp1-admin-migrations.XXXXXXXX.sql")
cleanup_apply(){ rm -f -- "$COMBINED_SQL"; }
trap cleanup_apply EXIT
{
  echo 'BEGIN;'
  for migration in "${MIGRATIONS[@]}"; do
    assert_clone
    cat <<'SQL'
DO $f16dp1_identity$
BEGIN
 IF current_database()<>'eduxfac_f16dp1_clone' THEN RAISE EXCEPTION 'F16D_P1_CLONE_ONLY_REQUIRED'; END IF;
 IF coalesce(shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database'),'')<>'{"eduxfac_data_mode":"DEMO","purpose":"F16D-P1_CLONE_ONLY"}' THEN RAISE EXCEPTION 'F16D_P1_CLONE_MARKER_REQUIRED'; END IF;
END $f16dp1_identity$;
SQL
    awk '!/^[[:space:]]*BEGIN;[[:space:]]*$/ && !/^[[:space:]]*COMMIT;[[:space:]]*$/' "$MIGRATIONS_DIR/$migration"
  done
  echo 'COMMIT;'
} >"$COMBINED_SQL"
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d "$CLONE_DATABASE" <"$COMBINED_SQL"
cleanup_apply
trap - EXIT

ACTUAL=$(sudo -u postgres psql -X -qAt -v ON_ERROR_STOP=1 -d "$CLONE_DATABASE" <<'SQL'
SET default_transaction_read_only=on;
BEGIN TRANSACTION READ ONLY;
SELECT string_agg(version,',' ORDER BY version) FROM web_schema_migrations;
COMMIT;
SQL
)
[ "$ACTUAL" = '001_empresa_acceso,002_alta_clientes_empresas,003_estados_empresa,004_planes_limites,005_suscripciones_vigencia' ] || die "conjunto de migraciones inesperado: $ACTUAL"

business_snapshot "$CLONE_DATABASE" "$WORK_ROOT/evidence/clone_business_after_admin.tsv"
schema_snapshot "$CLONE_DATABASE" "$WORK_ROOT/evidence/clone_schema_after_admin.tsv"
rls_snapshot "$CLONE_DATABASE" "$WORK_ROOT/evidence/clone_rls_after_admin.tsv"
roles_snapshot "$WORK_ROOT/evidence/cluster_roles_after_admin.tsv"
diff -u "$WORK_ROOT/evidence/clone_business_before_admin.tsv" "$WORK_ROOT/evidence/clone_business_after_admin.tsv" >"$WORK_ROOT/evidence/admin_business.diff" || die 'las filas comerciales preexistentes cambiaron.'
diff -u "$WORK_ROOT/evidence/clone_rls_before_admin.tsv" "$WORK_ROOT/evidence/clone_rls_after_admin.tsv" >"$WORK_ROOT/evidence/admin_rls.diff" || die 'RLS o policies preexistentes cambiaron.'
diff -u "$WORK_ROOT/evidence/cluster_roles_before_admin.tsv" "$WORK_ROOT/evidence/cluster_roles_after_admin.tsv" >/dev/null || die 'los roles del clúster cambiaron.'

printf '%s\n' 'ADMIN_MIGRATIONS_001_005_APPLIED' >"$WORK_ROOT/APPLY_STATUS"
echo 'F16D_P1_APPLY_RESULT=ADMIN_MIGRATIONS_001_005_APPLIED_TO_CLONE_ONLY'
