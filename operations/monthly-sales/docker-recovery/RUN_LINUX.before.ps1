$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$linuxRoot='/stage/EDUXFAC/EDUXFAC WEB/01_TRABAJO_ACTUAL/EDUXFAC_WEB_ACTUAL'
$image='sha256:0a77b086357153cbf0092d178c66f1f4cd882538a246cfed02ce10c5a5b571e2'
$name='eduxfac-monthly-sales-'+(Get-Date -Format 'yyyyMMdd-HHmmss');$id=$null
function Check($s){if($LASTEXITCODE -ne 0){throw $s}}
try{
$id=(docker run -d --name $name --network none --workdir $linuxRoot $image sleep infinity).Trim();Check 'CREATE'
@{id=$id;name=$name;network='none';root=$linuxRoot}|ConvertTo-Json|Set-Content "$PSScriptRoot/LAB.json"
docker exec --user root $name mkdir -p "$linuxRoot/tests/helpers" "$linuxRoot/operations/monthly-sales";Check 'MKDIR'
foreach($part in @('server','public','database')){docker cp (Join-Path $root $part) "${name}:${linuxRoot}/";Check 'COPY'}
foreach($file in @('package.json','package-lock.json','tests/monthly-sales.test.js','tests/monthly-sales-native.test.js','tests/helpers/monthly-sales-checks.js','tests/helpers/initial-inventory-template-fixture.js','tests/helpers/profit-native-cluster.js')){docker cp (Join-Path $root $file) "${name}:${linuxRoot}/${file}";Check 'COPYFILE'}
docker exec --user root $name chown -R eduxfac:eduxfac $linuxRoot;Check 'PERMISSIONS'
docker exec --user eduxfac --workdir $linuxRoot $name node -e "console.log(process.version,require.resolve('pg'))";Check 'PG_DEPENDENCY'
docker exec --user eduxfac --workdir $linuxRoot -e EDUXFAC_PROFIT_NATIVE=yes $name node --test --test-concurrency=1 tests/monthly-sales.test.js tests/monthly-sales-native.test.js | Tee-Object "$PSScriptRoot/TEST_LINUX.log";Check 'TESTS'
docker cp "${name}:${linuxRoot}/operations/monthly-sales/PERFORMANCE_PG.json" "$PSScriptRoot/PERFORMANCE_PG.json";Check 'EVIDENCE'
}finally{if($id){$actual=(docker inspect $name --format '{{.Id}}');if($LASTEXITCODE -eq 0 -and $actual.Trim() -eq $id){docker stop -t 5 $name|Out-Null;docker rm $name|Out-Null;@{cleaned=$true;id=$id}|ConvertTo-Json|Set-Content "$PSScriptRoot/CLEANUP.json"}}}
