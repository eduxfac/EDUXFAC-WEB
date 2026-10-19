$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$qa=$PSScriptRoot
$image='sha256:0a77b086357153cbf0092d178c66f1f4cd882538a246cfed02ce10c5a5b571e2'
$linuxRoot='/stage/EDUXFAC/EDUXFAC WEB/01_TRABAJO_ACTUAL/EDUXFAC_WEB_ACTUAL'
$container='eduxfac-requirement-lab-'+(Get-Date -Format 'yyyyMMdd-HHmmss')
$expected='d244957d7b5c6983b4e7f2a1c3037e2e99d90e8d403678a1cdf9203aa83b5656'
if((Get-FileHash -LiteralPath (Join-Path $root 'server/src/inventory-count.js')).Hash.ToLower() -ne $expected){throw 'CANDIDATE_CHANGED'}
$id=$null;$saved=$false
function Require-DockerSuccess($step){if($LASTEXITCODE -ne 0){throw $step}}
try {
 $id=(docker run -d --name $container --network none --workdir $linuxRoot $image sleep infinity).Trim();Require-DockerSuccess 'CONTAINER_CREATE_FAILED'
 @{container=$container;id=$id;image=$image;linuxRoot=$linuxRoot;network='none';user='eduxfac';candidate_sha256=$expected;utc=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $qa 'LAB_STATE.json') -Encoding utf8;$saved=$true
 docker exec --user root $container mkdir -p "$linuxRoot/tests/helpers" "$linuxRoot/operations/physical-count-excel" "$linuxRoot/operations/physical-count-lab-repair" "$linuxRoot/docs/physical_count_excel";Require-DockerSuccess 'DIRECTORY_SETUP_FAILED'
 foreach($part in @('server','public','database')){docker cp (Join-Path $root $part) "${container}:${linuxRoot}/";Require-DockerSuccess 'SOURCE_COPY_FAILED'}
 foreach($file in @('package.json','package-lock.json','tests/physical-count-excel.test.js','tests/physical-count-rls-native.test.js','tests/helpers/initial-inventory-template-fixture.js','tests/helpers/profit-native-cluster.js','operations/physical-count-excel/inventory-count.before.js','operations/physical-count-lab-repair/preflight.mjs','tests/purchase-requirement.test.js','tests/purchase-requirement-native.test.js','tests/helpers/purchase-requirement-seed.js','tests/helpers/purchase-requirement-checks.js')){docker cp (Join-Path $root $file) "${container}:${linuxRoot}/${file}";Require-DockerSuccess 'LAB_FILE_COPY_FAILED'}
 docker exec --user root $container chown -R eduxfac:eduxfac $linuxRoot;Require-DockerSuccess 'LAB_PERMISSIONS_FAILED'
 docker exec --user eduxfac --workdir $linuxRoot $container node operations/physical-count-lab-repair/preflight.mjs | Tee-Object -FilePath (Join-Path $qa 'PREFLIGHT_LINUX.json');Require-DockerSuccess 'DEPENDENCY_PREFLIGHT_FAILED_NO_TESTS_STARTED'
 docker cp (Join-Path $qa 'REMOTE_inventory-count.js') "${container}:${linuxRoot}/server/src/inventory-count.js";Require-DockerSuccess 'UNCHANGED_REMOTE_SOURCE_OVERLAY_FAILED'
 docker exec --user eduxfac --workdir $linuxRoot $container sha256sum server/src/inventory-count.js | Tee-Object -FilePath (Join-Path $qa 'UNCHANGED_REMOTE_FILE_HASH.log');Require-DockerSuccess 'REMOTE_OVERLAY_CHECK_FAILED'
 docker exec --user eduxfac $container /usr/lib/postgresql/16/bin/postgres --version | Set-Content -LiteralPath (Join-Path $qa 'POSTGRESQL_VERSION.txt');Require-DockerSuccess 'POSTGRESQL_BINARY_MISSING'
 docker exec --user eduxfac --workdir $linuxRoot $container node --test tests/purchase-requirement.test.js | Tee-Object -FilePath (Join-Path $qa 'TEST_LINUX.log');Require-DockerSuccess 'LINUX_FUNCTIONAL_FAILED'
 docker exec --user eduxfac --workdir $linuxRoot -e EDUXFAC_PROFIT_NATIVE=yes $container node --test tests/purchase-requirement-native.test.js | Tee-Object -FilePath (Join-Path $qa 'TEST_POSTGRESQL_RLS.log');Require-DockerSuccess 'POSTGRESQL_RLS_FAILED'
 if((Get-FileHash -LiteralPath (Join-Path $root 'server/src/inventory-count.js')).Hash.ToLower() -ne $expected){throw 'CANDIDATE_CHANGED_DURING_TESTS'}
 'LINUX_LAB_VALIDATION_OK'
} finally {
 if($id){$actual=(docker inspect $container --format '{{.Id}}');if($LASTEXITCODE -eq 0 -and $actual.Trim() -eq $id){docker stop -t 5 $container|Out-Null;Require-DockerSuccess 'QA_STOP_FAILED';docker rm $container|Out-Null;Require-DockerSuccess 'QA_REMOVE_FAILED';if($saved){@{id=$id;cleaned=$true;only_own_container=$true}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $qa 'LAB_CLEANUP.json')}}}
}
