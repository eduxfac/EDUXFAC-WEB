#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT=/var/www/eduxfac
OUTPUT=${1:-"$PWD/F16D_P0_WEB_PRODUCTION_READONLY.txt"}

if [ "$(id -u)" -eq 0 ]; then echo 'ERROR: ejecutar como usuario sin sudo.' >&2; exit 10; fi
if [ "$ROOT" != '/var/www/eduxfac' ] || [ ! -d "$ROOT" ]; then echo 'ERROR: ruta productiva esperada ausente.' >&2; exit 11; fi
if [ -e "$OUTPUT" ]; then echo 'ERROR: el archivo de evidencia ya existe; no se sobrescribió.' >&2; exit 12; fi
for COMMAND in find grep awk sed sha256sum stat node; do
  command -v "$COMMAND" >/dev/null 2>&1 || { echo "ERROR: dependencia ausente: $COMMAND" >&2; exit 13; }
done

exec > >(tee "$OUTPUT") 2>&1
echo 'F16D_P0_AUDIT=READ_ONLY'
echo "TIMESTAMP_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "ROOT=$ROOT"
echo "ROOT_REALPATH=$(readlink -f -- "$ROOT")"
echo "ROOT_MODE_OWNER=$(stat -c '%a %U:%G' "$ROOT")"

echo '=== EXPECTED_ADMIN_FILES ==='
FILES=(
  server/src/app.js
  server/src/admin-service-api.js
  server/src/onboarding-api.js
  server/src/service-auth.js
  server/src/commercial-api.js
  server/src/subscription-api.js
  server/src/operations-api.js
  server/src/company-access.js
  package.json
  package-lock.json
)
for REL in "${FILES[@]}"; do
  if [ -f "$ROOT/$REL" ] && [ ! -L "$ROOT/$REL" ]; then
    printf 'IMPLEMENTADO\t%s\t%s\n' "$REL" "$(sha256sum "$ROOT/$REL" | awk '{print $1}')"
  elif [ -L "$ROOT/$REL" ]; then
    printf 'PARCIAL\t%s\tSYMLINK_REQUIERE_REVISION\n' "$REL"
  else
    printf 'FALTA\t%s\n' "$REL"
  fi
done

echo '=== ENDPOINT_REGISTRATION ==='
check_route(){
  local label=$1 file=$2 pattern=$3
  if [ -f "$ROOT/$file" ] && grep -Fq -- "$pattern" "$ROOT/$file"; then
    printf 'IMPLEMENTADO\t%s\t%s\n' "$label" "$file"
  elif [ -f "$ROOT/$file" ]; then
    printf 'PARCIAL\t%s\tARCHIVO_PRESENTE_RUTA_NO_ENCONTRADA\n' "$label"
  else
    printf 'FALTA\t%s\tARCHIVO_AUSENTE\n' "$label"
  fi
}
check_route '/api/internal/admin/v1 mount' 'server/src/app.js' "app.use('/api/internal/admin/v1'"
check_route 'POST /clientes' 'server/src/onboarding-api.js' "router.post('/clientes'"
check_route 'POST /empresas' 'server/src/onboarding-api.js' "router.post('/empresas'"
check_route 'PUT /empresas/:id/plan' 'server/src/commercial-api.js' "['plan','ASIGNAR_PLAN']"
check_route 'POST /empresas/:id/sucursal-principal' 'server/src/onboarding-api.js' "router.post('/empresas/:id/sucursal-principal'"
check_route 'POST /empresas/:id/administrador-inicial' 'server/src/onboarding-api.js' "router.post('/empresas/:id/administrador-inicial'"
check_route 'PUT /empresas/:id/suscripcion' 'server/src/subscription-api.js' "['put','suscripcion','SUSCRIPCION']"
check_route 'POST /empresas/:id/activar' 'server/src/onboarding-api.js' "router.post('/empresas/:id/activar'"
check_route 'GET /empresas/:id/operacion' 'server/src/operations-api.js' "router.get('/empresas/:id/operacion'"

echo '=== PACKAGE_METADATA ==='
node - "$ROOT/package.json" <<'NODE'
const fs=require('node:fs');
const file=process.argv[2];
if(!fs.existsSync(file)){console.log('PACKAGE_JSON=FALTA');process.exit(0);}
const p=JSON.parse(fs.readFileSync(file,'utf8'));
console.log('PACKAGE_NAME='+(p.name||''));
console.log('PACKAGE_VERSION='+(p.version||''));
for(const section of ['engines','dependencies','devDependencies'])for(const [name,version] of Object.entries(p[section]||{}).sort())console.log(`${section}\t${name}\t${version}`);
NODE

echo '=== ENVIRONMENT_VARIABLE_NAMES_ONLY ==='
if [ -f "$ROOT/.env" ]; then
  awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/{print $1"=[SECRETO_OCULTO]"}' "$ROOT/.env" | sort -u
else
  echo 'ENV_FILE=ABSENT'
fi
if [ -f "$ROOT/.env.example" ]; then
  awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/{print $1"=[SECRETO_OCULTO]"}' "$ROOT/.env.example" | sort -u | sed 's/^/EXAMPLE_/'
fi

echo '=== CODE_VERSION_READONLY ==='
if [ -d "$ROOT/.git" ] && command -v git >/dev/null 2>&1; then
  echo "GIT_HEAD=$(git -C "$ROOT" rev-parse --verify HEAD 2>/dev/null || echo UNAVAILABLE)"
  echo "GIT_STATUS_COUNT=$(git -C "$ROOT" status --porcelain 2>/dev/null | wc -l)"
else
  echo 'GIT_HEAD=NOT_A_GIT_CHECKOUT'
fi
echo 'F16D_P0_AUDIT_RESULT=EVIDENCE_CREATED_READ_ONLY'
