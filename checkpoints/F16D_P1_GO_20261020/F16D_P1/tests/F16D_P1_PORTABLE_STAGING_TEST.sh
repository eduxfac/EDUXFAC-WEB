#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT=$(mktemp -d)
trap 'rm -rf -- "$ROOT"' EXIT
SOURCE="$ROOT/source"
STAGE="$ROOT/stage"

mkdir -p "$SOURCE/server/src" "$SOURCE/node_modules/demo-package" "$STAGE"
printf '%s\n' "console.log('fixture');" >"$SOURCE/server/src/app.js"
printf '%s\n' 'export const db = {};' >"$SOURCE/server/src/db.js"
printf '%s\n' '{"name":"f16dp1-staging-fixture","private":true}' >"$SOURCE/package.json"
printf '%s\n' '{"name":"demo-package"}' >"$SOURCE/node_modules/demo-package/package.json"
printf '%s\n' 'MUST_NOT_BE_COPIED=1' >"$SOURCE/.env"
printf '%s\n' 'MUST_NOT_BE_COPIED_EITHER=1' >"$SOURCE/.env.production"

tar -C "$SOURCE" --exclude='./node_modules' --exclude='./.env' --exclude='./.env.*' -cf - . | tar -C "$STAGE" --no-overwrite-dir -xf -

[ -f "$STAGE/server/src/app.js" ]
[ -f "$STAGE/server/src/db.js" ]
[ -f "$STAGE/package.json" ]
[ ! -e "$STAGE/source/server/src/app.js" ]
[ ! -e "$STAGE/var/www/eduxfac/server/src/app.js" ]
[ ! -e "$STAGE/eduxfac/server/src/app.js" ]
[ ! -e "$STAGE/node_modules" ]
[ ! -e "$STAGE/.env" ]
[ ! -e "$STAGE/.env.production" ]

ln -s "$SOURCE/node_modules" "$STAGE/node_modules"
[ -L "$STAGE/node_modules" ]
[ "$(readlink "$STAGE/node_modules")" = "$SOURCE/node_modules" ]
[ "$(readlink -f "$STAGE/node_modules")" = "$(readlink -f "$SOURCE/node_modules")" ]

printf '%s\n' \
 'STAGING_STRUCTURE=PASS' \
 'APP_PATH=PASS' \
 'NO_EXTRA_NESTING=PASS' \
 'NODE_MODULES_EXCLUDED_FROM_COPY=PASS' \
 'NODE_MODULES_CONTROLLED_LINK=PASS' \
 'ENV_EXCLUDED=PASS'
