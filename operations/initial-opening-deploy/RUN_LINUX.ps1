$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$qa=$PSScriptRoot
$image='sha256:0a77b086357153cbf0092d178c66f1f4cd882538a246cfed02ce10c5a5b571e2'
$linuxRoot='/stage/EDUXFAC/EDUXFAC WEB/01_TRABAJO_ACTUAL/EDUXFAC_WEB_ACTUAL'
$container='eduxfac-initial-opening-lab-'+(Get-Date -Format 'yyyyMMdd-HHmmss')
$expected='d244957d7b5c6983b4e7f2a1c3037e2e99d90e8d403678a1cdf9203aa83b5656'
if((Get-FileHash -LiteralPath (Join-Path $root 'server/src/inventory-count.js')).Hash.ToLower() -ne $expected){throw 'CANDIDATE_CHANGED'}
$id=$null;$saved=$false
function Require-DockerSuccess($step){if($LASTEXITCODE -ne 0){throw $step}}
try {
 $id=(docker run -d --name $container --network none --workdir $linuxRoot $image sleep infinity).Trim();Require-DockerSuccess 'CONTAINER_CREATE_FAILED'
 @{container=$container;id=$id;image=$image;linuxRoot=$linuxRoot;network='none';user='eduxfac';candidate_sha256=$expected;utc=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $qa 'LAB_STATE.json') -Encoding utf8;$saved=$true
 docker exec --user root $container mkdir -p "$linuxRoot/tests/helpers" "$linuxRoot/operations/physical-count-excel" "$linuxRoot/operations/physical-count-lab-repair" "$linuxRoot/docs/physical_count_excel";Require-DockerSuccess 'DIRECTORY_SETUP_FAILED'
 foreach($part in @('server','public','database')){docker cp (Join-Path $root $part) "${container}:${linuxRoot}/";Require-DockerSuccess 'SOURCE_COPY_FAILED'}
 foreach($file in @('package.json','package-lock.json','operations/physical-count-excel/inventory-count.before.js','operations/physical-count-lab-repair/preflight.mjs','operations/initial-opening-fix/repair-abrilar-opening.mjs','operations/repair-costs/repair-apronax.mjs','docs/costos_consistentes_candidato_original/server/src/inventory-entry.js')){docker exec --user root $container mkdir -p ("$linuxRoot/"+(Split-Path $file -Parent).Replace('\','/'));Require-DockerSuccess 'LAB_PARENT_SETUP_FAILED';docker cp (Join-Path $root $file) "${container}:${linuxRoot}/${file}";Require-DockerSuccess 'LAB_FILE_COPY_FAILED'}
 foreach($file in @(Get-ChildItem -LiteralPath (Join-Path $root 'tests') -File -Filter '*.js')){docker cp $file.FullName "${container}:${linuxRoot}/tests/$($file.Name)";Require-DockerSuccess 'TEST_FILE_COPY_FAILED'}
 foreach($file in @(Get-ChildItem -LiteralPath (Join-Path $root 'tests/helpers') -File -Filter '*.js')){docker cp $file.FullName "${container}:${linuxRoot}/tests/helpers/$($file.Name)";Require-DockerSuccess 'TEST_HELPER_COPY_FAILED'}
 docker exec --user root $container chown -R eduxfac:eduxfac $linuxRoot;Require-DockerSuccess 'LAB_PERMISSIONS_FAILED'
 docker exec --user eduxfac --workdir $linuxRoot $container node operations/physical-count-lab-repair/preflight.mjs | Tee-Object -FilePath (Join-Path $qa 'PREFLIGHT_LINUX.json');Require-DockerSuccess 'DEPENDENCY_PREFLIGHT_FAILED_NO_TESTS_STARTED'
 docker cp (Join-Path $qa 'REMOTE_inventory-count.js') "${container}:${linuxRoot}/server/src/inventory-count.js";Require-DockerSuccess 'REMOTE_UNCHANGED_FILE_OVERLAY_FAILED'
 docker exec --user eduxfac --workdir $linuxRoot $container sha256sum server/src/initial-inventory.js server/src/inventory-count.js | Tee-Object -FilePath (Join-Path $qa 'LAB_DEPLOYED_HASHES.log');Require-DockerSuccess 'LAB_HASH_RECORD_FAILED'
 docker exec --user eduxfac $container /usr/lib/postgresql/16/bin/postgres --version | Set-Content -LiteralPath (Join-Path $qa 'POSTGRESQL_VERSION.txt');Require-DockerSuccess 'POSTGRESQL_BINARY_MISSING'
 docker exec --user eduxfac --workdir $linuxRoot -e EDUXFAC_PROFIT_NATIVE=yes -e EDUXFAC_REPAIR_LAB=yes $container node --test --test-concurrency=1 tests/initial-inventory-rls-native.test.js tests/cost-consistency-native.test.js tests/sale-profitability-native.test.js tests/sale-profitability-rls-native.test.js tests/purchase-requirement-native.test.js tests/product-required-fields.test.js | Tee-Object -FilePath (Join-Path $qa 'TEST_LINUX_NATIVE_RLS.log');Require-DockerSuccess 'NATIVE_REGRESSION_FAILED'
 if((Get-FileHash -LiteralPath (Join-Path $root 'server/src/inventory-count.js')).Hash.ToLower() -ne $expected){throw 'CANDIDATE_CHANGED_DURING_TESTS'}
 'LINUX_LAB_VALIDATION_OK'
} finally {
 if($id){$actual=(docker inspect $container --format '{{.Id}}');if($LASTEXITCODE -eq 0 -and $actual.Trim() -eq $id){docker stop -t 5 $container|Out-Null;Require-DockerSuccess 'QA_STOP_FAILED';docker rm $container|Out-Null;Require-DockerSuccess 'QA_REMOVE_FAILED';if($saved){@{id=$id;cleaned=$true;only_own_container=$true}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $qa 'LAB_CLEANUP.json')}}}
}
