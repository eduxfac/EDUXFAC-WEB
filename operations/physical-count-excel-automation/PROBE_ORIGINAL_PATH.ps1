$ErrorActionPreference='Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'ExcelQaSession.cs')
$root=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$file=Join-Path $root 'docs\physical_count_excel\Conteo_Fisico_FICTICIO_MATRIZ.xlsx'
$hash=(Get-FileHash -LiteralPath $file).Hash
$existing=@(Get-CimInstance Win32_Process -Filter "Name = 'EXCEL.EXE'"|Select-Object -ExpandProperty ProcessId)
$s=$null;$pidOwn=$null;$ok=$false
try{$s=[ExcelQaSession]::new([int[]]$existing);$pidOwn=$s.Pid;$s.Open($file);if($s.Columns() -ne 12 -or $s.Info() -ne 'EDUXFAC_CONTEO_V1'){throw 'ORIGINAL_WORKBOOK_INVALID'};$ok=$true}
finally{if($s){$s.Dispose()};if(-not $pidOwn){$pidOwn=[ExcelQaSession]::LastOwnedPid};if($pidOwn){$p=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$pidOwn);if($p -and $p.Name -eq 'EXCEL.EXE' -and $p.CommandLine -match '/automation -Embedding' -and $pidOwn -notin $existing){Stop-Process -Id $pidOwn -Force -ErrorAction SilentlyContinue}};@{opened_original_path=$ok;path=$file;length=$file.Length;original_sha256=$hash;source_unchanged=((Get-FileHash -LiteralPath $file).Hash -eq $hash);events=if($s){$s.Events}else{@()}}|ConvertTo-Json -Depth 8|Set-Content (Join-Path $PSScriptRoot 'ORIGINAL_PATH_OPEN.json')}
'ORIGINAL_PATH_OPEN_OK'
