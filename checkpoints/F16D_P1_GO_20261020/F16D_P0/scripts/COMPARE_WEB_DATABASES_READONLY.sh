#!/usr/bin/env bash
set -euo pipefail
umask 077

OUTPUT=${1:-"$PWD/F16D_P0_DATABASE_COMPARISON_READONLY.txt"}
PILOT_DATABASE=eduxfac_web_piloto
PRODUCTION_DATABASE=eduxfac

if [ "$(id -u)" -eq 0 ]; then echo 'ERROR: ejecutar como usuario sin sudo.' >&2; exit 10; fi
if [ -e "$OUTPUT" ]; then echo 'ERROR: el archivo de evidencia ya existe; no se sobrescribió.' >&2; exit 11; fi
for COMMAND in sudo psql diff sha256sum mktemp; do
  command -v "$COMMAND" >/dev/null 2>&1 || { echo "ERROR: dependencia ausente: $COMMAND" >&2; exit 12; }
done

PILOT_NAME=$(sudo -u postgres psql -X -qAt -v ON_ERROR_STOP=1 -d "$PILOT_DATABASE" <<'SQL'
SET default_transaction_read_only=on;
BEGIN TRANSACTION READ ONLY;
SELECT current_database();
COMMIT;
SQL
)
PRODUCTION_NAME=$(sudo -u postgres psql -X -qAt -v ON_ERROR_STOP=1 -d "$PRODUCTION_DATABASE" <<'SQL'
SET default_transaction_read_only=on;
BEGIN TRANSACTION READ ONLY;
SELECT current_database();
COMMIT;
SQL
)
[ "$PILOT_NAME" = "$PILOT_DATABASE" ] || { echo 'ERROR: no se confirmó la base piloto esperada.' >&2; exit 13; }
[ "$PRODUCTION_NAME" = "$PRODUCTION_DATABASE" ] || { echo 'ERROR: no se confirmó la base productiva esperada.' >&2; exit 14; }

WORK=$(mktemp -d -t f16dp0-db-XXXXXXXX)
cleanup(){ rm -rf -- "$WORK"; }
trap cleanup EXIT

collect_schema(){
  local DATABASE=$1 DEST=$2
  sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -At -F $'\t' -d "$DATABASE" > "$DEST" <<'SQL'
SET default_transaction_read_only=on;
BEGIN TRANSACTION READ ONLY;
SELECT 'DATABASE',current_database();
SELECT 'MARKER',coalesce(substring(coalesce(shobj_description(oid,'pg_database'),'') from '"eduxfac_data_mode"[[:space:]]*:[[:space:]]*"([^"]+)"'),'ABSENT'),md5(coalesce(shobj_description(oid,'pg_database'),'')) FROM pg_database WHERE datname=current_database();
SELECT 'TABLE',table_schema,table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name;
SELECT 'COLUMN',table_name,ordinal_position,column_name,data_type,coalesce(udt_name,''),is_nullable,coalesce(column_default,'') FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position;
SELECT 'INDEX',tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname;
SELECT 'CONSTRAINT',c.relname,con.conname,con.contype,pg_get_constraintdef(con.oid,true) FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,con.conname;
SELECT 'FUNCTION',p.proname,pg_get_function_identity_arguments(p.oid),md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.proname,pg_get_function_identity_arguments(p.oid);
SELECT 'RLS',c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') ORDER BY c.relname;
SELECT 'POLICY',schemaname,tablename,policyname,permissive,array_to_string(roles,','),cmd,coalesce(qual,''),coalesce(with_check,'') FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname;
SELECT to_regclass('public.web_schema_migrations') IS NOT NULL AS has_web_migrations \gset
\if :has_web_migrations
SELECT 'MIGRATION',version,applied_at AT TIME ZONE 'UTC' FROM web_schema_migrations ORDER BY version;
\else
SELECT 'MIGRATION_TABLE','ABSENT';
\endif
COMMIT;
SQL
}

collect_schema "$PILOT_DATABASE" "$WORK/pilot.tsv"
collect_schema "$PRODUCTION_DATABASE" "$WORK/production.tsv"
DIFF_RC=0
diff -u "$WORK/production.tsv" "$WORK/pilot.tsv" > "$WORK/production_vs_pilot.diff" || DIFF_RC=$?
[ "$DIFF_RC" -le 1 ] || { echo 'ERROR: diff no pudo comparar las evidencias.' >&2; exit 15; }

{
  echo 'F16D_P0_DATABASE_COMPARISON=READ_ONLY'
  echo "TIMESTAMP_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "PILOT_DATABASE=$PILOT_NAME"
  echo "PRODUCTION_DATABASE=$PRODUCTION_NAME"
  echo "PILOT_SCHEMA_SHA256=$(sha256sum "$WORK/pilot.tsv" | awk '{print $1}')"
  echo "PRODUCTION_SCHEMA_SHA256=$(sha256sum "$WORK/production.tsv" | awk '{print $1}')"
  echo '=== PRODUCTION_SCHEMA_METADATA ==='
  cat "$WORK/production.tsv"
  echo '=== PILOT_SCHEMA_METADATA ==='
  cat "$WORK/pilot.tsv"
  echo '=== DIFF_PRODUCTION_TO_PILOT ==='
  cat "$WORK/production_vs_pilot.diff"
  echo 'F16D_P0_DATABASE_COMPARISON_RESULT=EVIDENCE_CREATED_READ_ONLY'
} > "$OUTPUT"

echo "EVIDENCE_FILE=$OUTPUT"
echo 'BUSINESS_DATA_ROWS_READ=0'
echo 'DATABASE_WRITES=0'
