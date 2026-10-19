param([Parameter(Mandatory=$true)][string]$Source)
$ErrorActionPreference='Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'ExcelQaSession.cs')
$sourcePath=(Resolve-Path -LiteralPath $Source).Path
$hash=(Get-FileHash -LiteralPath $sourcePath).Hash
$dir=Join-Path ([IO.Path]::GetPathRoot($sourcePath)) ('ExcelQA\'+[Guid]::NewGuid().ToString('N').Substring(0,12));New-Item -ItemType Directory -Path $dir|Out-Null
$copy=Join-Path $dir 'export.xlsx';Copy-Item -LiteralPath $sourcePath -Destination $copy
Start-Sleep -Milliseconds 500
if((Get-FileHash -LiteralPath $copy).Hash -ne $hash){throw 'READONLY_COPY_MISMATCH'}
$existing=@(Get-CimInstance Win32_Process -Filter "Name = 'EXCEL.EXE'"|Select-Object -ExpandProperty ProcessId);$s=$null;$pidOwn=$null;$passed=0;$errorDetail=$null;$closed=$false
try{
 $s=[ExcelQaSession]::new([int[]]$existing);$pidOwn=$s.Pid;$s.Open($copy)
 if($s.Columns() -ne 12 -or $s.Cell('A1') -ne 'Código interno' -or $s.Cell('L1') -ne 'Valorizado' -or $s.Info() -ne 'EDUXFAC_CONTEO_V1'){throw 'EXPORTED_WORKBOOK_HEADERS_INVALID'};$passed++
 for($r=2;$r -le $s.Rows();$r++){
  if(-not $s.Protected() -or $s.Locked('E'+$r) -or -not $s.Locked('J'+$r) -or -not $s.Locked('K'+$r)){throw 'EXPORTED_PROTECTION_INVALID'}
  foreach($c in @('F','G','H','I','L')){if(-not $s.Formula($c+$r).StartsWith('=') -or [string]$s.Cell($c+$r) -ne ''){throw 'EXPORTED_RECALC_EMPTY_INVALID'}}
  foreach($c in @('H','I','J','K','L')){if(-not $s.Format($c+$r).Contains('S/')){throw 'EXPORTED_CURRENCY_INVALID'}}
 };$passed++
} catch{$e=$_.Exception;while($e.InnerException){$e=$e.InnerException};if(-not $pidOwn){$pidOwn=[ExcelQaSession]::LastOwnedPid};$errorDetail=@{type=$e.GetType().FullName;message=$e.Message;hresult=('0x'+$e.HResult.ToString('X8'))};throw}
finally{
 if($s){$s.Dispose()};[GC]::Collect();[GC]::WaitForPendingFinalizers()
 if($pidOwn){$p=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$pidOwn);if($p -and $p.Name -eq 'EXCEL.EXE' -and $pidOwn -notin $existing -and $p.CommandLine -match '/automation -Embedding'){Stop-Process -Id $pidOwn -Force -ErrorAction SilentlyContinue};$closed=(-not (Get-Process -Id $pidOwn -ErrorAction SilentlyContinue))}
 @{source=$sourcePath;source_sha256=$hash;copy=$copy;passed=$passed;failed=if($errorDetail){1}else{0};error=$errorDetail;private_pid=$pidOwn;closed=$closed;events=if($s){$s.Events}else{@()};original_file_unchanged=((Get-FileHash -LiteralPath $sourcePath).Hash -eq $hash);existing_processes_untouched=$existing}|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'READONLY_COPY_RESULT.json') -Encoding utf8
}
Get-Content -LiteralPath (Join-Path $PSScriptRoot 'READONLY_COPY_RESULT.json') -Raw|ConvertFrom-Json|Select-Object passed,failed,closed,original_file_unchanged|ConvertTo-Json
