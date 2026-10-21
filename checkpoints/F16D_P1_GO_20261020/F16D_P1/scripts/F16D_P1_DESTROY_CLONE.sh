#!/usr/bin/env bash
set -euo pipefail
umask 077
source "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/F16D_P1_COMMON.sh"

[ "${F16D_P1_ACK:-}" = 'DESTROY_CLONE_ONLY' ] || die 'falta F16D_P1_ACK=DESTROY_CLONE_ONLY.'
require_non_root
require_commands sudo psql dropdb sha256sum diff find
assert_clone_target_literal
assert_safe_local_paths
verify_bundle_manifest
assert_source_databases
assert_phase_marker
[ -f "$WORK_ROOT/backup/eduxfac.dump" ] && [ ! -L "$WORK_ROOT/backup/eduxfac.dump" ] || die 'backup ausente o symlink.'
[ -f "$WORK_ROOT/backup/eduxfac.dump.sha256" ] && [ ! -L "$WORK_ROOT/backup/eduxfac.dump.sha256" ] || die 'checksum del backup ausente o symlink.'
assert_clone
sha256sum -c "$WORK_ROOT/backup/eduxfac.dump.sha256"
business_snapshot "$PRODUCTION_DATABASE" "$WORK_ROOT/evidence/production_business_before_destroy.tsv"
diff -u "$WORK_ROOT/evidence/production_business_before.tsv" "$WORK_ROOT/evidence/production_business_before_destroy.tsv" >/dev/null || die 'producción cambió; detener destrucción para revisión.'
printf '%s' "$(database_marker "$PILOT_DATABASE")" | sha256sum >"$WORK_ROOT/evidence/pilot_marker_before_destroy.sha256"
diff -u "$WORK_ROOT/evidence/pilot_marker_before.sha256" "$WORK_ROOT/evidence/pilot_marker_before_destroy.sha256" >/dev/null || die 'el marcador piloto cambió.'
business_snapshot "$PILOT_DATABASE" "$WORK_ROOT/evidence/pilot_business_before_destroy.tsv"
diff -u "$WORK_ROOT/evidence/pilot_business_before.tsv" "$WORK_ROOT/evidence/pilot_business_before_destroy.tsv" >/dev/null || die 'la base piloto cambió; detener destrucción para revisión.'

for protected in eduxfac eduxfac_web_piloto postgres template0 template1; do
  [ "$CLONE_DATABASE" != "$protected" ] || die "destino protegido rechazado: $protected"
done
[ "$CLONE_DATABASE" = 'eduxfac_f16dp1_clone' ] || die 'DESTROY solo admite el clon literal F16D-P1.'

sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d postgres -v clone="$CLONE_DATABASE" <<'SQL'
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=:'clone' AND pid<>pg_backend_pid();
SQL
sudo -u postgres dropdb "$CLONE_DATABASE"
! db_exists "$CLONE_DATABASE" || die 'el clon continúa existiendo.'
printf '%s\n' 'CLONE_DESTROYED_EVIDENCE_AND_BACKUP_PRESERVED' >"$WORK_ROOT/DESTROY_STATUS"
echo 'F16D_P1_DESTROY_RESULT=CLONE_DATABASE_DESTROYED_ONLY'
echo "EVIDENCE_PRESERVED=$WORK_ROOT"
