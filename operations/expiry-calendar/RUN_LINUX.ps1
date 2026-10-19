$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$linuxRoot='/stage/EDUXFAC/EDUXFAC WEB/01_TRABAJO_ACTUAL/EDUXFAC_WEB_ACTUAL'
$image='sha256:0a77b086357153cbf0092d178c66f1f4cd882538a246cfed02ce10c5a5b571e2'
$name='eduxfac-expiry-calendar-'+([guid]::NewGuid().ToString('N').Substring(0,10));$id=$null
function Check($s){if($LASTEXITCODE -ne 0){throw $s}}
try{
 docker info --format '{{.ServerVersion}}';Check 'ENGINE'
 $id=(docker run -d --name $name --label eduxfac.task=expiry-calendar --network none --workdir $linuxRoot $image sleep infinity).Trim();Check 'CREATE'
 @{id=$id;name=$name;network='none'}|ConvertTo-Json|Set-Content "$PSScriptRoot/LAB.json"
 docker exec --user root $name mkdir -p "$linuxRoot/tests/helpers" "$linuxRoot/operations/expiry-calendar/before/public";Check 'MKDIR'
 foreach($part in @('server','public','database')){docker cp (Join-Path $root $part) "${name}:${linuxRoot}/";Check 'COPY'}
 foreach($file in @('package.json','package-lock.json','tests/expiry-calendar.test.js','tests/helpers/expiry-calendar-ui.js','tests/helpers/native-web-cost-fixture.js','tests/helpers/initial-inventory-template-fixture.js','tests/helpers/profit-native-cluster.js','operations/expiry-calendar/before/public/index.html')){docker cp (Join-Path $root $file) "${name}:${linuxRoot}/${file}";Check 'COPYFILE'}
 foreach($part in @('server','public','database','tests','operations')){docker exec --user root $name chown -R eduxfac:eduxfac "$linuxRoot/$part";Check 'PERMISSIONS'}
 foreach($case in @(@{zone='UTC';label='UTC'},@{zone='Etc/GMT+5';label='UTC_MINUS_5'},@{zone='Etc/GMT-1';label='UTC_PLUS_1'})){
  docker exec --user eduxfac --workdir $linuxRoot -e EDUXFAC_PROFIT_NATIVE=yes -e "TZ=$($case.zone)" $name node --test tests/expiry-calendar.test.js | Tee-Object "$PSScriptRoot/TEST_NATIVE_$($case.label).log";Check "NATIVE_$($case.label)"
 }
}finally{if($id){$actual=(docker inspect $name --format '{{.Id}}');if($LASTEXITCODE -eq 0 -and $actual.Trim() -eq $id){docker stop -t 5 $name|Out-Null;Check 'STOP';docker rm $name|Out-Null;Check 'REMOVE';@{cleaned=$true;id=$id;name=$name}|ConvertTo-Json|Set-Content "$PSScriptRoot/CLEANUP.json"}}}
