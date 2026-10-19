param([int]$Runs=3)
$ErrorActionPreference='Stop'
if([Threading.Thread]::CurrentThread.ApartmentState -ne 'STA'){throw 'RUN_WITH_PWSH_STA'}
$root=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Add-Type -Path (Join-Path $PSScriptRoot 'ExcelQaSession.cs')
$source=Join-Path $PSScriptRoot 'FICTICIO_MATRIZ.xlsx'
$map=(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'QA_ROWS.json') -Raw|ConvertFrom-Json).rows
$hash=(Get-FileHash -LiteralPath $source).Hash
$candidateHash=(Get-FileHash -LiteralPath (Join-Path $root 'server\src\inventory-count.js')).Hash
$shortBase=Join-Path ([IO.Path]::GetPathRoot($root)) ('ExcelQA\'+[Guid]::NewGuid().ToString('N').Substring(0,12))
New-Item -ItemType Directory -Path $shortBase -Force|Out-Null
$all=[Collections.Generic.List[object]]::new();$failures=[Collections.Generic.List[object]]::new()
function Assert-True($value,$name){if(-not $value){throw ('CHECK_FAILED_'+$name)}}
function Numbers($session,$row,$expected){$cols=@('F','G','H','I','L');for($i=0;$i -lt 5;$i++){$value=$session.Cell($cols[$i]+$row);Assert-True ($null -ne $value -and [math]::Abs([double]$value-[double]$expected[$i]) -lt 0.0000001) ('CALC_'+$cols[$i]+$row)}}
try {
 for($run=1;$run -le $Runs;$run++){
  $dest=Join-Path $shortBase ('count'+$run+'.xlsx');Copy-Item -LiteralPath $source -Destination $dest
  $previous=-1;$stable=0;$deadline=(Get-Date).AddSeconds(10)
  while($stable -lt 3){$file=Get-Item -LiteralPath $dest;if($file.Length -gt 0 -and $file.Length -eq $previous){$stable++}else{$stable=0};$previous=$file.Length;if((Get-Date) -gt $deadline){throw 'FILE_SIZE_NOT_STABLE'};Start-Sleep -Milliseconds 200}
  Assert-True ((Get-FileHash -LiteralPath $dest).Hash -eq $hash) 'QA_COPY_HASH'
  $existing=@(Get-CimInstance Win32_Process -Filter "Name = 'EXCEL.EXE'" | Select-Object -ExpandProperty ProcessId)
  $session=$null;$pidOwn=$null;$checks=[Collections.Generic.List[object]]::new();$cleanup=$false
  try {
   $session=[ExcelQaSession]::new([int[]]$existing);$pidOwn=$session.Pid
   Assert-True ($pidOwn -gt 0 -and $pidOwn -notin $existing) 'PRIVATE_EXCEL_PID'
   $session.Open($dest)
   $p=[int]$map.'P-A'
   Assert-True ($session.Columns() -eq 12 -and $session.Cell('A1') -eq 'Código interno' -and $session.Cell('L1') -eq 'Valorizado') 'HEADERS'
   for($r=2;$r -le $session.Rows();$r++){
    Assert-True ($session.Formula('F'+$r) -eq ('=IF(E'+$r+'="","",ROUND(MAX(D'+$r+'-E'+$r+',0),3))')) 'FORMULA_F'
    Assert-True ($session.Formula('G'+$r) -eq ('=IF(E'+$r+'="","",ROUND(MAX(E'+$r+'-D'+$r+',0),3))')) 'FORMULA_G'
    foreach($c in @('H','I','L')){Assert-True ($session.Formula($c+$r) -match 'NOT\(ISNUMBER\(J') 'MONEY_FORMULAS'}
   }
   Numbers $session ([int]$map.'COUNT-LESS') @(5,0,7.85,0,149.15);$checks.Add(@{name='100/95: Falta5, precio7.85, valorizado149.15';passed=$true})
   Numbers $session ([int]$map.'COUNT-MORE') @(0,5,0,10,210);$checks.Add(@{name='100/105: Sobra5, precio10, valorizado210';passed=$true})
   Numbers $session ([int]$map.'COUNT-EQUAL') @(0,0,0,0,100);$checks.Add(@{name='100/100: Falta0/Sobra0';passed=$true})
   Numbers $session ([int]$map.'COUNT-DECIMAL') @(4.875,0,6.02,0,117.43);$checks.Add(@{name='Milésimas y redondeo monetario';passed=$true})
   Numbers $session $p @(5,0,8.05,0,152.95);Assert-True ([math]::Abs([double]$session.Cell('J'+$p)-1.61) -lt 0.0000001) 'WEIGHTED_COST';$checks.Add(@{name='Ponderado 1.61 y cálculo';passed=$true})
   $u=[int]$map.'COUNT-UNKNOWN';foreach($c in @('H','I','L')){Assert-True ([string]$session.Cell($c+$u) -eq '') 'UNKNOWN_COST'};$checks.Add(@{name='Costo desconocido: importes vacíos';passed=$true})
   $blank=0;for($r=2;$r -le $session.Rows();$r++){if([string]$session.Cell('E'+$r) -eq ''){$blank=$r;break}};Assert-True ($blank -gt 0) 'BLANK_CASE';foreach($c in @('F','G','H','I','L')){Assert-True ([string]$session.Cell($c+$blank) -eq '') 'EMPTY_FORMULA'};$checks.Add(@{name='E vacío: fórmulas vacías';passed=$true})
   Assert-True ($session.Protected() -and -not $session.Locked('E'+$p)) 'PROTECTION'
   foreach($c in @('A','B','C','D','F','G','H','I','J','K','L')){Assert-True ($session.Locked($c+$p)) 'LOCKED_COLUMN'}
   foreach($c in @('H','I','J','K','L')){Assert-True ($session.Format($c+$p).Contains('S/')) 'CURRENCY'}
   Assert-True ($session.Info() -eq 'EDUXFAC_CONTEO_V1') 'INFORMATION'
   $checks.Add(@{name='12 columnas, fórmulas, protección, S/ e Información';passed=$true})
   Assert-True ($session.Color('F'+[int]$map.'COUNT-LESS',$true) -eq 13427967 -and $session.Color('G'+[int]$map.'COUNT-MORE',$true) -eq 15203548) 'CONDITIONAL_COLORS';$checks.Add(@{name='Falta naranja / Sobra verde';passed=$true})
   $out=Join-Path $shortBase ('calculated'+$run+'.xlsx');$session.SaveCopy($out);Assert-True ((Get-Item $out).Length -gt 0) 'SAVE_COPY';$checks.Add(@{name='Apertura, recálculo completo y copia calculada';passed=$true})
  } catch {
   $e=$_.Exception;if(-not $pidOwn){$pidOwn=[ExcelQaSession]::LastOwnedPid};while($e.InnerException){$e=$e.InnerException};$failures.Add(@{run=$run;stage=$_.InvocationInfo.PositionMessage;type=$e.GetType().FullName;hresult=('0x'+$e.HResult.ToString('X8'));message=$e.Message;pid=$pidOwn});throw
  } finally {
   if($session){$session.Dispose()};[GC]::Collect();[GC]::WaitForPendingFinalizers()
   if($pidOwn){$until=(Get-Date).AddSeconds(3);do{$process=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$pidOwn);if(-not $process){break};Start-Sleep -Milliseconds 200}while((Get-Date) -lt $until)
    if($process -and $process.Name -eq 'EXCEL.EXE' -and $pidOwn -notin $existing -and $process.CommandLine -match '/automation -Embedding'){Stop-Process -Id $pidOwn -Force -ErrorAction SilentlyContinue}
    $cleanup=(-not (Get-Process -Id $pidOwn -ErrorAction SilentlyContinue))
   }
   $all.Add(@{run=$run;private_pid=$pidOwn;path=$dest;path_length=$dest.Length;passed=$checks.Count;checks=$checks;cleanup=$cleanup;events=if($session){$session.Events}else{@()};existing_user_processes_untouched=$existing})
  }
 }
 Assert-True ((Get-FileHash -LiteralPath $source).Hash -eq $hash) 'SOURCE_UNCHANGED'
 Assert-True ((Get-FileHash -LiteralPath (Join-Path $root 'server\src\inventory-count.js')).Hash -eq $candidateHash) 'CANDIDATE_UNCHANGED'
} finally {
 @{requested_runs=$Runs;successful_openings=@($all|Where-Object{$_.passed -eq 10}).Count;passed=($all|Measure-Object -Property passed -Sum).Sum;failed=$failures.Count;runs=$all;errors=$failures;source_sha256=$hash;candidate_sha256=$candidateHash;short_directory=$shortBase;no_office_global_settings_changed=$true}|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'RESULT.json') -Encoding utf8
}
$summary=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'RESULT.json') -Raw|ConvertFrom-Json
$summary|Select-Object successful_openings,passed,failed,candidate_sha256,short_directory|ConvertTo-Json
