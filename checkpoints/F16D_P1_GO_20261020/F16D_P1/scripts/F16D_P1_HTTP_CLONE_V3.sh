#!/usr/bin/env bash
set -euo pipefail
umask 077
shopt -s nullglob

[ "${F16D_P1_ACK:-}" = 'RUN_HTTP_CLONE_ONLY' ] || { echo 'ERROR: falta F16D_P1_ACK=RUN_HTTP_CLONE_ONLY.' >&2; exit 2; }
[ "$(id -u)" -ne 0 ] || { echo 'ERROR: ejecutar como eduxadmin, no root.' >&2; exit 3; }

BUNDLE='/home/eduxadmin/F16D_P1_20261019_233711'
SOURCE='/var/www/eduxfac'
BASE='/var/tmp/eduxfac-f16dp1-http-v2'
STAGING_BASE="$BASE/staging"
RUNTIME_BASE="$BASE/runtime"
EVIDENCE_ROOT='/home/eduxadmin/F16D_P1_HTTP_EVIDENCE'
EVIDENCE_BASE="$EVIDENCE_ROOT/http"
CLONE_DATABASE='eduxfac_f16dp1_clone'
EXPECTED_MARKER='{"eduxfac_data_mode":"DEMO","purpose":"F16D-P1_CLONE_ONLY"}'
COMMON_SHA='2EA5674C6AF4460C5244F0D50B58A8C3C9418331CC7130C3F13714F971CAFAC8'
APPLY_SHA='C5224930764CD1D8911A87DFB396AB94D7C5E7D58558091AEC1B7E65D1B52834'

for command in sudo psql sha256sum find stat ss node openssl python3 awk grep curl diff seq tar ln mkdir ps basename sleep date tr rmdir sort install chmod tee rm cp readlink id cat; do
 command -v "$command" >/dev/null || { echo "ERROR: falta $command." >&2; exit 4; }
done
for path in "$BUNDLE" "$SOURCE"; do [ -d "$path" ] && [ ! -L "$path" ] || { echo "ERROR: ruta ausente o symlink: $path" >&2; exit 5; }; done
[ -d "$SOURCE/node_modules" ] && [ ! -L "$SOURCE/node_modules" ] || { echo 'ERROR: node_modules productivo ausente o symlink.' >&2; exit 6; }

cd "$BUNDLE"
sha256sum --strict -c MANIFEST_SHA256.txt >/dev/null
actual_common=$(sha256sum scripts/F16D_P1_COMMON.sh | awk '{print toupper($1)}')
actual_apply=$(sha256sum scripts/F16D_P1_APPLY_ADMIN_MIGRATIONS_CLONE.sh | awk '{print toupper($1)}')
[ "$actual_common" = "$COMMON_SHA" ] || { echo 'ERROR: COMMON corregido no coincide.' >&2; exit 7; }
[ "$actual_apply" = "$APPLY_SHA" ] || { echo 'ERROR: APPLY corregido no coincide.' >&2; exit 7; }
if find "$BUNDLE/candidate" "$BUNDLE/tests" -type l -print -quit | grep -q .; then echo 'ERROR: candidate/tests contiene symlinks.' >&2; exit 8; fi
unsafe_source_symlink=$(find "$SOURCE" -path "$SOURCE/node_modules" -prune -o -type l -print -quit)
[ -z "$unsafe_source_symlink" ] || { echo "ERROR: symlink productivo fuera de node_modules: $unsafe_source_symlink" >&2; exit 9; }

database_name=$(sudo -u postgres psql -X -qAt -v ON_ERROR_STOP=1 -d "$CLONE_DATABASE" -c 'select current_database()')
[ "$database_name" = "$CLONE_DATABASE" ] || { echo 'ERROR: base objetivo no es el clon literal.' >&2; exit 10; }
marker=$(sudo -u postgres psql -X -qAt -v ON_ERROR_STOP=1 -d postgres -c "select coalesce(shobj_description(oid,'pg_database'),'') from pg_database where datname='eduxfac_f16dp1_clone'")
[ "$marker" = "$EXPECTED_MARKER" ] || { echo 'ERROR: marcador de clon inválido.' >&2; exit 11; }
for protected in eduxfac eduxfac_web_piloto; do [ "$CLONE_DATABASE" != "$protected" ] || { echo 'ERROR: intento sobre base protegida.' >&2; exit 12; }; done
versions=$(sudo -u postgres psql -X -qAt -v ON_ERROR_STOP=1 -d "$CLONE_DATABASE" -c "set default_transaction_read_only=on; select string_agg(version,',' order by version) from web_schema_migrations")
[ "$versions" = '001_empresa_acceso,002_alta_clientes_empresas,003_estados_empresa,004_planes_limites,005_suscripciones_vigencia' ] || { echo 'ERROR: migraciones del clon inesperadas.' >&2; exit 13; }

for managed_path in "$BASE" "$STAGING_BASE" "$RUNTIME_BASE" "$EVIDENCE_ROOT" "$EVIDENCE_BASE"; do
 [ ! -L "$managed_path" ] || { echo "ERROR: ruta administrada es symlink: $managed_path" >&2; exit 14; }
done
mkdir -p -m 700 "$EVIDENCE_BASE"
mkdir -p -m 755 "$STAGING_BASE"
chmod 700 "$EVIDENCE_ROOT" "$EVIDENCE_BASE"
chmod 755 "$BASE" "$STAGING_BASE"
[ "$(stat -c '%U:%a' "$EVIDENCE_BASE")" = "$(id -un):700" ] || { echo 'ERROR: permisos de evidence base inválidos.' >&2; exit 14; }
[ "$(stat -c '%U:%a' "$STAGING_BASE")" = "$(id -un):755" ] || { echo 'ERROR: permisos de staging base inválidos.' >&2; exit 14; }
sudo install -d -o postgres -g postgres -m 700 "$RUNTIME_BASE"
[ "$(stat -c '%U:%G:%a' "$RUNTIME_BASE")" = 'postgres:postgres:700' ] || { echo 'ERROR: permisos de runtime base inválidos.' >&2; exit 14; }

expected_stage_marker(){ printf 'F16D-P1 HTTP CLONE V2 ONLY\nrun_id=%s\ndatabase=%s\nstage=%s\n' "$1" "$CLONE_DATABASE" "$STAGING_BASE/$1"; }
expected_runtime_marker(){ printf 'F16D-P1 HTTP CLONE V2 ONLY\nrun_id=%s\ndatabase=%s\nstage=%s\n' "$1" "$CLONE_DATABASE" "$STAGING_BASE/$1"; }
verify_process(){
 local pid=$1 stage=$2 owner args
 [[ "$pid" =~ ^[0-9]+$ ]] || return 1
 [ -d "/proc/$pid" ] || return 2
 owner=$(sudo ps -p "$pid" -o user= | awk '{$1=$1;print}') || return 1
 args=$(sudo ps -p "$pid" -o args= | awk '{$1=$1;print}') || return 1
 [ "$owner" = 'postgres' ] || return 1
 [ "$args" = "node $stage/server/src/app.js --no-migrate" ] || [ "$args" = "/usr/bin/node $stage/server/src/app.js --no-migrate" ] || return 1
}
stop_verified_process(){
 local pid=$1 stage=$2
 if verify_process "$pid" "$stage"; then
  sudo kill -TERM "$pid"
  for _ in $(seq 1 10); do [ ! -d "/proc/$pid" ] && return 0; sleep 1; done
  verify_process "$pid" "$stage" || return 0
  sudo kill -KILL "$pid"
  for _ in $(seq 1 5); do [ ! -d "/proc/$pid" ] && return 0; sleep 1; done
  return 1
 fi
 [ ! -d "/proc/$pid" ]
}
verify_stage_identity(){
 local run=$1 stage="$STAGING_BASE/$1" actual link
 [ -d "$stage" ] && [ ! -L "$stage" ] || return 1
 [ -f "$stage/.F16D_P1_HTTP_STAGE" ] && [ ! -L "$stage/.F16D_P1_HTTP_STAGE" ] || return 1
 actual=$(cat "$stage/.F16D_P1_HTTP_STAGE") || return 1
 [ "$actual" = "$(expected_stage_marker "$run")" ] || return 1
 link=$(find "$stage" -type l ! -path "$stage/node_modules" -print -quit) || return 1
 [ -z "$link" ] || return 1
 if [ -e "$stage/node_modules" ] || [ -L "$stage/node_modules" ]; then
  [ -L "$stage/node_modules" ] && [ "$(readlink "$stage/node_modules")" = "$SOURCE/node_modules" ] || return 1
 fi
}
assert_stage_directory(){
 local stage=$1 relative=$2 path="$1/$2" stage_real path_real
 [ -d "$path" ] && [ ! -L "$path" ] || { echo "ERROR: directorio requerido ausente o inválido en staging: $relative" >&2; return 1; }
 stage_real=$(readlink -f -- "$stage") || return 1
 path_real=$(readlink -f -- "$path") || return 1
 case "$path_real" in "$stage_real"|"$stage_real"/*) ;; *) echo "ERROR: directorio escapa del staging: $relative -> $path_real" >&2; return 1;; esac
}
assert_stage_file(){
 local stage=$1 relative=$2 path="$1/$2" stage_real path_real
 [ -f "$path" ] && [ ! -L "$path" ] || { echo "ERROR: archivo requerido ausente o inválido en staging: $relative" >&2; return 1; }
 stage_real=$(readlink -f -- "$stage") || return 1
 path_real=$(readlink -f -- "$path") || return 1
 case "$path_real" in "$stage_real"/*) ;; *) echo "ERROR: archivo escapa del staging: $relative -> $path_real" >&2; return 1;; esac
}
verify_stage_source_layout(){
 local stage=$1 nested
 assert_stage_directory "$stage" 'server/src' || return 1
 assert_stage_file "$stage" 'server/src/app.js' || return 1
 assert_stage_file "$stage" 'server/src/db.js' || return 1
 assert_stage_file "$stage" 'package.json' || return 1
 for nested in 'var/www/eduxfac/server/src/app.js' 'eduxfac/server/src/app.js' 'source/server/src/app.js'; do
  [ ! -e "$stage/$nested" ] && [ ! -L "$stage/$nested" ] || { echo "ERROR: nivel adicional inesperado en staging: $nested" >&2; return 1; }
 done
}
verify_stage_ready(){
 local run=$1 stage="$STAGING_BASE/$1" relative env_file
 verify_stage_identity "$run" || return 1
 [ -L "$stage/node_modules" ] && [ "$(readlink "$stage/node_modules")" = "$SOURCE/node_modules" ] || return 1
 [ "$(readlink -f -- "$stage/node_modules")" = "$(readlink -f -- "$SOURCE/node_modules")" ] || return 1
 env_file=$(find "$stage" -path "$stage/node_modules" -prune -o -type f -name '.env*' -print -quit) || return 1
 [ -z "$env_file" ] || { echo "ERROR: archivo .env detectado en staging: $env_file" >&2; return 1; }
 verify_stage_source_layout "$stage" || return 1
 for relative in \
  'server/src/admin-service-api.js' 'server/src/onboarding-api.js' 'server/src/service-auth.js' \
  'server/src/commercial-api.js' 'server/src/subscription-api.js' 'server/src/operations-api.js' \
  'server/src/company-access.js' 'server/src/company-state-policy.js' 'server/src/commercial-conditions.js' \
  'server/src/subscription-calendar.js' 'server/src/subscription-service.js' 'server/src/request-limits.js' \
  'F16D_P1_HTTP_TEST.mjs'; do
  assert_stage_file "$stage" "$relative" || return 1
 done
 sudo -u postgres test -x "$stage" || { echo 'ERROR: postgres no puede atravesar STAGE.' >&2; return 1; }
 sudo -u postgres test -x "$stage/server" || { echo 'ERROR: postgres no puede atravesar STAGE/server.' >&2; return 1; }
 sudo -u postgres test -x "$stage/server/src" || { echo 'ERROR: postgres no puede atravesar STAGE/server/src.' >&2; return 1; }
 sudo -u postgres test -r "$stage/server/src/app.js" || { echo 'ERROR: postgres no puede leer app.js del staging.' >&2; return 1; }
 sudo -u postgres test -r "$stage/server/src/db.js" || { echo 'ERROR: postgres no puede leer db.js del staging.' >&2; return 1; }
 sudo -u postgres test -r "$stage/package.json" || { echo 'ERROR: postgres no puede leer package.json del staging.' >&2; return 1; }
 sudo -u postgres test -x "$stage/node_modules" || { echo 'ERROR: postgres no puede atravesar node_modules controlado.' >&2; return 1; }
 sudo -u postgres test -r "$stage/node_modules" || { echo 'ERROR: postgres no puede leer node_modules controlado.' >&2; return 1; }
}
verify_runtime_identity(){
 local run=$1 runtime="$RUNTIME_BASE/$1" actual link
 sudo test -d "$runtime" || return 1
 if sudo test -L "$runtime"; then return 1; fi
 [ "$(sudo stat -c '%U:%G:%a' "$runtime")" = 'postgres:postgres:700' ] || return 1
 link=$(sudo find "$runtime" -type l -print -quit) || return 1
 [ -z "$link" ] || return 1
 sudo test -f "$runtime/.F16D_P1_HTTP_RUNTIME" || return 1
 if sudo test -L "$runtime/.F16D_P1_HTTP_RUNTIME"; then return 1; fi
 [ "$(sudo stat -c '%U:%G:%a' "$runtime/.F16D_P1_HTTP_RUNTIME")" = 'postgres:postgres:600' ] || return 1
 actual=$(sudo cat "$runtime/.F16D_P1_HTTP_RUNTIME") || return 1
 [ "$actual" = "$(expected_runtime_marker "$run")" ] || return 1
}
verify_runtime_initialized(){
 local run=$1 runtime="$RUNTIME_BASE/$1" unexpected
 verify_runtime_identity "$run" || return 1
 unexpected=$(sudo find "$runtime" -mindepth 1 -maxdepth 1 ! -name '.F16D_P1_HTTP_RUNTIME' -print -quit) || return 1
 [ -z "$unexpected" ] || return 1
 ! sudo test -e "$runtime/node.pid" || return 1
 ! sudo test -e "$runtime/candidate.log" || return 1
}
verify_runtime_cleanup_candidate(){
 local run=$1 runtime="$RUNTIME_BASE/$1" unexpected pid
 verify_runtime_identity "$run" || return 1
 unexpected=$(sudo find "$runtime" -mindepth 1 -maxdepth 1 -type f ! -name '.F16D_P1_HTTP_RUNTIME' ! -name 'node.pid' ! -name 'candidate.log' -print -quit) || return 1
 [ -z "$unexpected" ] || return 1
 unexpected=$(sudo find "$runtime" -mindepth 1 -maxdepth 1 ! -type f -print -quit) || return 1
 [ -z "$unexpected" ] || return 1
 if sudo test -e "$runtime/node.pid"; then
  sudo test -f "$runtime/node.pid" || return 1
  if sudo test -L "$runtime/node.pid"; then return 1; fi
  [ "$(sudo stat -c '%U:%G:%a' "$runtime/node.pid")" = 'postgres:postgres:600' ] || return 1
  pid=$(sudo cat "$runtime/node.pid") || return 1
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
 fi
 if sudo test -e "$runtime/candidate.log"; then
  sudo test -f "$runtime/candidate.log" || return 1
  if sudo test -L "$runtime/candidate.log"; then return 1; fi
  [ "$(sudo stat -c '%U:%G:%a' "$runtime/candidate.log")" = 'postgres:postgres:600' ] || return 1
 fi
}
verify_local_listener(){
 local pid=$1 port=$2 listeners address
 [[ "$pid" =~ ^[0-9]+$ ]] || return 1
 [[ "$port" =~ ^[0-9]+$ ]] && [ "$port" -ge 4321 ] && [ "$port" -le 4399 ] || return 1
 listeners=$(sudo ss -ltnpH "sport = :$port") || return 1
 [ -n "$listeners" ] || return 1
 while IFS= read -r listener; do
  address=$(awk '{print $4}' <<<"$listener")
  [ "$address" = "127.0.0.1:$port" ] || return 1
 done <<<"$listeners"
 grep -Fq "pid=$pid," <<<"$listeners"
}
verify_runtime_running(){
 local run=$1 port=$2 runtime="$RUNTIME_BASE/$1" pid
 verify_runtime_cleanup_candidate "$run" || return 1
 sudo test -s "$runtime/node.pid" || return 1
 sudo test -f "$runtime/candidate.log" || return 1
 pid=$(sudo cat "$runtime/node.pid") || return 1
 verify_process "$pid" "$STAGING_BASE/$run" || return 1
 verify_local_listener "$pid" "$port"
}
verify_runtime_cleaned(){
 local run=$1 runtime="$RUNTIME_BASE/$1"
 ! sudo test -e "$runtime"
}
cleanup_stale_managed(){
 local runtime run stage pid stale_listing
 local stale_runs=()
 local unexpected_runtime_entry
 unexpected_runtime_entry=$(sudo find "$RUNTIME_BASE" -mindepth 1 -maxdepth 1 ! -type d -print -quit) || return 1
 [ -z "$unexpected_runtime_entry" ] || { echo "ERROR: entrada residual ajena en runtime base: $unexpected_runtime_entry" >&2; return 1; }
 stale_listing=$(sudo find "$RUNTIME_BASE" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort) || return 1
 if [ -n "$stale_listing" ]; then mapfile -t stale_runs <<<"$stale_listing"; fi
 for run in "${stale_runs[@]}"; do
  runtime="$RUNTIME_BASE/$run"
  if sudo test -L "$runtime"; then echo "ERROR: runtime residual symlink: $runtime" >&2; return 1; fi
  [[ "$run" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9]+-[a-f0-9]{8}$ ]] || { echo "ERROR: RUN_ID residual inválido: $run" >&2; return 1; }
  stage="$STAGING_BASE/$run"
  verify_runtime_cleanup_candidate "$run" || { echo "ERROR: runtime residual no demostrable: $runtime" >&2; return 1; }
  verify_stage_identity "$run" || { echo "ERROR: staging residual no demostrable: $stage" >&2; return 1; }
  if sudo test -s "$runtime/node.pid"; then pid=$(sudo cat "$runtime/node.pid") || return 1; stop_verified_process "$pid" "$stage" || { echo "ERROR: proceso residual no demostrable: $pid" >&2; return 1; }; fi
  sudo rm -rf -- "$runtime"
  verify_runtime_cleaned "$run" || { echo "ERROR: runtime residual no fue eliminado: $runtime" >&2; return 1; }
  rm -rf -- "$stage"
 done
 for stage in "$STAGING_BASE"/*; do
  [ -e "$stage" ] || [ -L "$stage" ] || continue
  run=$(basename "$stage")
  ! sudo test -e "$RUNTIME_BASE/$run" || continue
  verify_stage_identity "$run" || { echo "ERROR: staging huérfano no demostrable: $stage" >&2; return 1; }
  rm -rf -- "$stage"
 done
}
cleanup_stale_managed

legacy_process=$(sudo ps -eo pid=,user=,args= | awk '$2=="postgres" && ($3=="node"||$3=="/usr/bin/node") && $4=="/var/tmp/eduxfac-f16dp1-http-20261020/server/src/app.js" && $5=="--no-migrate" {print $1;exit}')
[ -z "$legacy_process" ] || { echo "ERROR: candidato F16D-P1 legado activo sin marcador V2; no se mata automáticamente: $legacy_process" >&2; exit 15; }

RUN_ID=''
for _ in $(seq 1 10); do
 candidate_run="$(date -u +%Y%m%dT%H%M%SZ)-$$-$(openssl rand -hex 4)"
 if [ ! -e "$EVIDENCE_BASE/$candidate_run" ] && [ ! -e "$STAGING_BASE/$candidate_run" ] && ! sudo test -e "$RUNTIME_BASE/$candidate_run"; then RUN_ID=$candidate_run; break; fi
done
[ -n "$RUN_ID" ] || { echo 'ERROR: no se pudo generar RUN_ID único.' >&2; exit 16; }
STAGE="$STAGING_BASE/$RUN_ID"
RUNTIME="$RUNTIME_BASE/$RUN_ID"
EVIDENCE="$EVIDENCE_BASE/$RUN_ID"

PORT=''
listening_addresses=$(ss -ltnH | awk '{print $4}') || { echo 'ERROR: no se pudo inspeccionar puertos locales.' >&2; exit 17; }
for candidate_port in $(seq 4321 4399); do
 if ! grep -Eq "(^|:)${candidate_port}$" <<<"$listening_addresses"; then PORT=$candidate_port; break; fi
done
[ -n "$PORT" ] || { echo 'ERROR: no hay puerto temporal libre autorizado.' >&2; exit 17; }

candidate_pid=''; node_pid=''; cleanup_done=0
cleanup_current(){
 [ "$cleanup_done" -eq 0 ] || return 0
 if sudo test -e "$RUNTIME"; then
  verify_runtime_cleanup_candidate "$RUN_ID" || { echo 'ERROR: runtime cambió; cleanup abortado.' >&2; return 1; }
  if sudo test -s "$RUNTIME/node.pid"; then node_pid=$(sudo cat "$RUNTIME/node.pid") || return 1; stop_verified_process "$node_pid" "$STAGE" || { echo 'ERROR: proceso actual no demostrable; cleanup abortado.' >&2; return 1; }; fi
  if [ -n "$candidate_pid" ]; then wait "$candidate_pid" 2>/dev/null || true; fi
  if sudo test -f "$RUNTIME/candidate.log"; then sudo cp "$RUNTIME/candidate.log" "$EVIDENCE/candidate.log"; sudo chown eduxadmin:eduxadmin "$EVIDENCE/candidate.log"; chmod 600 "$EVIDENCE/candidate.log"; fi
  sudo rm -rf -- "$RUNTIME"
  verify_runtime_cleaned "$RUN_ID" || { echo 'ERROR: runtime actual no fue eliminado.' >&2; return 1; }
 fi
 if [ -e "$STAGE" ] || [ -L "$STAGE" ]; then verify_stage_identity "$RUN_ID" || { echo 'ERROR: staging cambió; cleanup abortado.' >&2; return 1; }; rm -rf -- "$STAGE"; fi
 rmdir "$STAGING_BASE" 2>/dev/null || true
 sudo rmdir "$RUNTIME_BASE" 2>/dev/null || true
 sudo rmdir "$BASE" 2>/dev/null || true
 unset PANEL_WEB_SERVICE_SECRET SESSION_SECRET
 cleanup_done=1
}
on_exit(){
 local rc=$?
 trap - EXIT
 if [ "$rc" -ne 0 ] && [ -d "$EVIDENCE" ] && [ ! -e "$EVIDENCE/FINAL_STATUS.txt" ]; then
  printf '%s\n' "RUN_ID=$RUN_ID" "PORT=${PORT:-NOT_SELECTED}" 'HTTP_JWT=FAIL' 'ONBOARDING=NOT_COMPLETED' 'IDEMPOTENCY=NOT_COMPLETED' 'REGRESSION=NOT_COMPLETED' 'SUNAT_CONTACTS=NOT_VERIFIED' 'PRODUCTION_DB_WRITES=NOT_VERIFIED' 'PILOT_DB_WRITES=NOT_VERIFIED' "EXIT_CODE=$rc" >"$EVIDENCE/FINAL_STATUS.txt"
 fi
 cleanup_current || rc=90
 if [ -d "$EVIDENCE" ]; then rm -f "$EVIDENCE/SHA256SUMS.txt"; sha256sum "$EVIDENCE"/* >"$EVIDENCE/SHA256SUMS.txt" 2>/dev/null || true; fi
 exit "$rc"
}
trap on_exit EXIT

mkdir -m 700 "$EVIDENCE"
mkdir -m 755 "$STAGE"
expected_stage_marker "$RUN_ID" >"$STAGE/.F16D_P1_HTTP_STAGE"
chmod 600 "$STAGE/.F16D_P1_HTTP_STAGE"
sudo install -d -o postgres -g postgres -m 700 "$RUNTIME"
expected_runtime_marker "$RUN_ID" | sudo -u postgres tee "$RUNTIME/.F16D_P1_HTTP_RUNTIME" >/dev/null
sudo chmod 600 "$RUNTIME/.F16D_P1_HTTP_RUNTIME"
verify_runtime_initialized "$RUN_ID" || { echo 'ERROR: runtime recién inicializado no verificable.' >&2; exit 18; }

source "$BUNDLE/scripts/F16D_P1_COMMON.sh"
business_snapshot eduxfac "$EVIDENCE/production_before.tsv"
business_snapshot eduxfac_web_piloto "$EVIDENCE/pilot_before.tsv"
sha256sum "$SOURCE/package.json" "$SOURCE/package-lock.json" "$SOURCE/server/src/app.js" "$SOURCE/server/src/db.js" >"$EVIDENCE/production_code_before.sha256"
{
 echo "RUN_ID=$RUN_ID"; echo "TIMESTAMP_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"; echo "PORT=$PORT"; echo "DATABASE=$CLONE_DATABASE"
 echo "HTTP_SCRIPT_SHA256=$(sha256sum "$BUNDLE/scripts/F16D_P1_HTTP_CLONE_V3.sh"|awk '{print toupper($1)}')"
 echo "HTTP_TEST_SHA256=$(sha256sum "$BUNDLE/tests/F16D_P1_HTTP_TEST.mjs"|awk '{print toupper($1)}')"
} >"$EVIDENCE/RUN_METADATA.txt"

tar -C "$SOURCE" --exclude='./node_modules' --exclude='./.env' --exclude='./.env.*' -cf - . | tar -C "$STAGE" --no-overwrite-dir -xf -
verify_stage_source_layout "$STAGE" || { echo 'ERROR: la copia de SOURCE no produjo la estructura directa esperada.' >&2; exit 19; }
F16D_APP="$STAGE/server/src/app.js"
cp -f "$BUNDLE"/candidate/server/src/*.js "$STAGE/server/src/"
cp -f "$BUNDLE/tests/F16D_P1_HTTP_TEST.mjs" "$STAGE/F16D_P1_HTTP_TEST.mjs"
python3 - "$F16D_APP" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); s=p.read_text(encoding='utf-8')
anchors=["import express from 'express';","app.use(backupMaintenance);","app.use(express.json({ limit: '30mb' }));"]
if any(s.count(a)!=1 for a in anchors): raise SystemExit('APP_MOUNT_ANCHOR_INVALID')
s=s.replace("import express from 'express';","import express from 'express';\nimport {adminServiceApi} from './admin-service-api.js';\nimport {requestLimits} from './request-limits.js';")
s=s.replace("app.use(backupMaintenance);","app.use(backupMaintenance);\napp.use('/api/internal/admin/v1',requestLimits({max:600}));")
s=s.replace("app.use(express.json({ limit: '30mb' }));","app.use('/api/internal/admin/v1',express.json({limit:'16kb'}),adminServiceApi);\napp.use(express.json({ limit: '30mb' }));")
p.write_text(s,encoding='utf-8')
PY
sudo chgrp -R postgres "$STAGE"
sudo chmod -R u+rwX,g+rX,o-rwx "$STAGE"
chmod 600 "$STAGE/.F16D_P1_HTTP_STAGE"
ln -s "$SOURCE/node_modules" "$STAGE/node_modules"
verify_stage_ready "$RUN_ID" || { echo 'ERROR: staging actual no verificable.' >&2; exit 19; }
grep -Fq "app.listen(port,'127.0.0.1'" "$F16D_APP" || { echo 'ERROR: candidato no está limitado a localhost.' >&2; exit 20; }
node --check "$F16D_APP"
for file in "$STAGE"/server/src/{admin-service-api,onboarding-api,service-auth,commercial-api,subscription-api,operations-api,company-access,company-state-policy,commercial-conditions,subscription-calendar,subscription-service,db,request-limits}.js "$STAGE/F16D_P1_HTTP_TEST.mjs"; do node --check "$file"; done
sha256sum "$F16D_APP" "$STAGE/server/src/db.js" "$STAGE"/server/src/{admin-service-api,onboarding-api,service-auth,commercial-api,subscription-api,operations-api,company-access}.js >"$EVIDENCE/candidate_code.sha256"

PANEL_WEB_SERVICE_SECRET=$(openssl rand -hex 32); SESSION_SECRET=$(openssl rand -hex 32)
export PANEL_WEB_SERVICE_SECRET SESSION_SECRET
export PANEL_WEB_SERVICE_ISSUER='f16dp1-local-test' PANEL_WEB_SERVICE_AUDIENCE='eduxfac-web-admin-f16dp1'
sudo -u postgres env -i \
 PATH='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' HOME='/var/lib/postgresql' NODE_ENV='production' PORT="$PORT" \
 DATABASE_URL='postgresql://postgres@%2Fvar%2Frun%2Fpostgresql/eduxfac_f16dp1_clone' SESSION_SECRET="$SESSION_SECRET" \
 PANEL_WEB_SERVICE_SECRET="$PANEL_WEB_SERVICE_SECRET" PANEL_WEB_SERVICE_ISSUER="$PANEL_WEB_SERVICE_ISSUER" PANEL_WEB_SERVICE_AUDIENCE="$PANEL_WEB_SERVICE_AUDIENCE" \
 F16D_PIDFILE="$RUNTIME/node.pid" F16D_APP="$F16D_APP" F16D_LOG="$RUNTIME/candidate.log" \
 sh -c 'umask 077; echo $$ >"$F16D_PIDFILE"; chmod 600 "$F16D_PIDFILE"; : >"$F16D_LOG"; chmod 600 "$F16D_LOG"; exec node "$F16D_APP" --no-migrate >>"$F16D_LOG" 2>&1' &
candidate_pid=$!

ready=0
for _ in $(seq 1 45); do
 if [ -z "$node_pid" ] && sudo test -s "$RUNTIME/node.pid"; then node_pid=$(sudo cat "$RUNTIME/node.pid"); fi
 if curl --silent --show-error --fail "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then ready=1; break; fi
 if ! kill -0 "$candidate_pid" 2>/dev/null; then break; fi
 sleep 1
done
[ "$ready" -eq 1 ] || { echo 'ERROR: candidato no quedó disponible.' >&2; sudo cat "$RUNTIME/candidate.log" >&2 || true; exit 21; }
verify_runtime_running "$RUN_ID" "$PORT" || { echo 'ERROR: runtime en ejecución no verificable.' >&2; exit 22; }
node_pid=$(sudo cat "$RUNTIME/node.pid")
echo "CANDIDATE_PID=$node_pid" >>"$EVIDENCE/RUN_METADATA.txt"

F16D_RUN_ID="$RUN_ID" F16D_P1_PORT="$PORT" F16D_P1_BASE_URL="http://127.0.0.1:${PORT}" F16D_P1_HTTP_EVIDENCE="$EVIDENCE/http_results.json" \
PANEL_WEB_SERVICE_SECRET="$PANEL_WEB_SERVICE_SECRET" PANEL_WEB_SERVICE_ISSUER="$PANEL_WEB_SERVICE_ISSUER" PANEL_WEB_SERVICE_AUDIENCE="$PANEL_WEB_SERVICE_AUDIENCE" \
node "$STAGE/F16D_P1_HTTP_TEST.mjs" | tee "$EVIDENCE/http_test.log"

sudo ss -ltnp | grep "127.0.0.1:${PORT}" >"$EVIDENCE/local_listener.txt"
if sudo ss -tpn | grep -F "pid=$node_pid" | grep -Ev '127\.0\.0\.1|\[::1\]' >"$EVIDENCE/external_connections.txt"; then echo 'ERROR: conexión externa detectada.' >&2; exit 23; else : >"$EVIDENCE/external_connections.txt"; fi
business_snapshot eduxfac "$EVIDENCE/production_after.tsv"
business_snapshot eduxfac_web_piloto "$EVIDENCE/pilot_after.tsv"
diff -u "$EVIDENCE/production_before.tsv" "$EVIDENCE/production_after.tsv" >"$EVIDENCE/production.diff"
diff -u "$EVIDENCE/pilot_before.tsv" "$EVIDENCE/pilot_after.tsv" >"$EVIDENCE/pilot.diff"
sha256sum "$SOURCE/package.json" "$SOURCE/package-lock.json" "$SOURCE/server/src/app.js" "$SOURCE/server/src/db.js" >"$EVIDENCE/production_code_after.sha256"
diff -u "$EVIDENCE/production_code_before.sha256" "$EVIDENCE/production_code_after.sha256" >"$EVIDENCE/production_code.diff"

printf '%s\n' "RUN_ID=$RUN_ID" "PORT=$PORT" 'HTTP_JWT=PASS' 'ONBOARDING=PASS' 'IDEMPOTENCY=PASS' 'REGRESSION=PASS' 'SUNAT_CONTACTS=0' 'PRODUCTION_DB_WRITES=0' 'PILOT_DB_WRITES=0' 'PRODUCTION_CODE_WRITES=0' 'F16D_P1_FINAL=GO' >"$EVIDENCE/FINAL_STATUS.txt"
cleanup_current
trap - EXIT
sha256sum "$EVIDENCE"/* >"$EVIDENCE/SHA256SUMS.txt"
echo "EVIDENCE_DIR=$EVIDENCE"
cat "$EVIDENCE/FINAL_STATUS.txt"
