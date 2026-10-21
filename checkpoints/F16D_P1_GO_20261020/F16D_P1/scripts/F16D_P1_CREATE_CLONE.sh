#!/usr/bin/env bash
set -euo pipefail
umask 077
source "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/F16D_P1_COMMON.sh"

[ "${F16D_P1_ACK:-}" = 'CREATE_CLONE_ONLY' ] || die 'falta F16D_P1_ACK=CREATE_CLONE_ONLY.'
require_non_root
require_commands sudo psql pg_dump pg_restore createdb dropdb sha256sum diff mktemp stat find
assert_clone_target_literal
assert_safe_local_paths
verify_bundle_manifest
assert_source_databases
! db_exists "$CLONE_DATABASE" || die 'el clon ya existe.'
[ ! -e "$WORK_ROOT" ] && [ ! -L "$WORK_ROOT" ] || die "directorio de trabajo ya existe o es symlink: $WORK_ROOT"
mkdir -p "$WORK_ROOT/backup" "$WORK_ROOT/evidence"
assert_no_work_symlinks
printf '%s\n' 'F16D-P1 CLONE ONLY' >"$PHASE_MARKER"
chmod 0600 "$PHASE_MARKER"

clone_created=0
on_error(){
  rc=$?
  if [ "$clone_created" -eq 1 ]; then
    if db_exists "$CLONE_DATABASE" && [ "$(database_marker "$CLONE_DATABASE" 2>/dev/null || true)" = "$EXPECTED_CLONE_MARKER" ]; then
      sudo -u postgres dropdb --if-exists "$CLONE_DATABASE" || true
    else
      echo 'F16D_P1_PARTIAL_CLONE_NOT_REMOVED_WITHOUT_VALID_MARKER=1' >&2
    fi
  fi
  echo "F16D_P1_CREATE_CLONE_FAILED=$rc" >&2
  exit "$rc"
}
trap on_error ERR

business_snapshot "$PRODUCTION_DATABASE" "$WORK_ROOT/evidence/production_business_before.tsv"
business_snapshot "$PILOT_DATABASE" "$WORK_ROOT/evidence/pilot_business_before.tsv"
schema_snapshot "$PRODUCTION_DATABASE" "$WORK_ROOT/evidence/production_schema_before.tsv"
rls_snapshot "$PRODUCTION_DATABASE" "$WORK_ROOT/evidence/production_rls_before.tsv"
roles_snapshot "$WORK_ROOT/evidence/cluster_roles_before.tsv"
printf '%s' "$(database_marker "$PILOT_DATABASE")" | sha256sum >"$WORK_ROOT/evidence/pilot_marker_before.sha256"

sudo -u postgres pg_dump -Fc --no-owner --no-acl --serializable-deferrable -d "$PRODUCTION_DATABASE" >"$WORK_ROOT/backup/eduxfac.dump"
sha256sum "$WORK_ROOT/backup/eduxfac.dump" >"$WORK_ROOT/backup/eduxfac.dump.sha256"
pg_restore --list "$WORK_ROOT/backup/eduxfac.dump" >"$WORK_ROOT/backup/eduxfac.dump.list"
[ -s "$WORK_ROOT/backup/eduxfac.dump.list" ] || die 'backup lógico sin catálogo restaurable.'
sha256sum -c "$WORK_ROOT/backup/eduxfac.dump.sha256"

sudo -u postgres createdb -T template0 "$CLONE_DATABASE"
clone_created=1
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d postgres -c "COMMENT ON DATABASE eduxfac_f16dp1_clone IS '{\"eduxfac_data_mode\":\"DEMO\",\"purpose\":\"F16D-P1_CLONE_ONLY\"}'" >/dev/null
assert_clone
sudo -u postgres pg_restore --exit-on-error --no-owner --no-acl -d "$CLONE_DATABASE" <"$WORK_ROOT/backup/eduxfac.dump"
[ "$(current_database "$CLONE_DATABASE")" = "$CLONE_DATABASE" ] || die 'restauración no apunta al clon esperado.'
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d postgres -c "COMMENT ON DATABASE eduxfac_f16dp1_clone IS '{\"eduxfac_data_mode\":\"DEMO\",\"purpose\":\"F16D-P1_CLONE_ONLY\"}'" >/dev/null
assert_clone

business_snapshot "$CLONE_DATABASE" "$WORK_ROOT/evidence/clone_business_restored.tsv"
diff -u "$WORK_ROOT/evidence/production_business_before.tsv" "$WORK_ROOT/evidence/clone_business_restored.tsv" >"$WORK_ROOT/evidence/restore_business.diff" || die 'el clon restaurado no coincide con el resumen productivo.'
printf '%s' "$(database_marker "$PILOT_DATABASE")" | sha256sum >"$WORK_ROOT/evidence/pilot_marker_after_create.sha256"
diff -u "$WORK_ROOT/evidence/pilot_marker_before.sha256" "$WORK_ROOT/evidence/pilot_marker_after_create.sha256" >/dev/null || die 'cambió el marcador piloto.'
business_snapshot "$PILOT_DATABASE" "$WORK_ROOT/evidence/pilot_business_after_create.tsv"
diff -u "$WORK_ROOT/evidence/pilot_business_before.tsv" "$WORK_ROOT/evidence/pilot_business_after_create.tsv" >/dev/null || die 'la base piloto cambió durante la creación del clon.'

printf '%s\n' 'CLONE_CREATED_AND_RESTORE_VERIFIED' >"$WORK_ROOT/CREATE_STATUS"
assert_no_work_symlinks
trap - ERR
echo 'F16D_P1_CREATE_CLONE_RESULT=CLONE_CREATED_AND_RESTORE_VERIFIED'
echo "BACKUP_SHA256=$(awk '{print $1}' "$WORK_ROOT/backup/eduxfac.dump.sha256")"
