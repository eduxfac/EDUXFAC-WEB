#!/usr/bin/env bash
set -euo pipefail
umask 077
source "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/F16D_P1_COMMON.sh"

OUTPUT=${1:-"$PWD/F16D_P1_PRECHECK_READONLY.txt"}
require_non_root
require_commands sudo psql pg_dump pg_restore createdb dropdb sha256sum diff mktemp stat find
assert_clone_target_literal
assert_safe_local_paths
assert_new_output "$OUTPUT"
verify_bundle_manifest
assert_source_databases
! db_exists "$CLONE_DATABASE" || die 'el clon ya existe; no continuar.'

EXPECTED=(001_empresa_acceso.sql 002_alta_clientes_empresas.sql 003_estados_empresa.sql 004_planes_limites.sql 005_suscripciones_vigencia.sql)
for migration in "${EXPECTED[@]}"; do
  [ -f "$MIGRATIONS_DIR/$migration" ] && [ ! -L "$MIGRATIONS_DIR/$migration" ] || die "migración requerida ausente o enlace: $migration"
done

{
  echo 'F16D_P1_PRECHECK=READ_ONLY'
  echo "TIMESTAMP_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "PRODUCTION_DATABASE=$(current_database "$PRODUCTION_DATABASE")"
  echo "PILOT_DATABASE=$(current_database "$PILOT_DATABASE")"
  echo "CLONE_DATABASE=ABSENT"
  echo "PRODUCTION_MARKER_SHA256=$(printf '%s' "$(database_marker "$PRODUCTION_DATABASE")" | sha256sum | awk '{print $1}')"
  echo "PILOT_MARKER_SHA256=$(printf '%s' "$(database_marker "$PILOT_DATABASE")" | sha256sum | awk '{print $1}')"
  for migration in "${EXPECTED[@]}"; do sha256sum "$MIGRATIONS_DIR/$migration"; done
  echo 'MINIMUM_ADMIN_MIGRATIONS=001,002,003,004,005'
  echo 'RLS_APPLY=NO'
  echo 'FISCAL_MIGRATIONS_APPLY=NO'
  echo 'PREFLIGHT_RESULT=GO_FOR_CLONE_CREATION_ONLY'
} >"$OUTPUT"
echo "EVIDENCE_FILE=$OUTPUT"
