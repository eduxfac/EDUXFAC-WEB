$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
[ComImport,Guid("00000016-0000-0000-C000-000000000046"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IQaOleMessageFilter {
 [PreserveSig] int HandleInComingCall(int type,IntPtr task,int tick,IntPtr info);
 [PreserveSig] int RetryRejectedCall(IntPtr task,int tick,int reject);
 [PreserveSig] int MessagePending(IntPtr task,int tick,int pending);
}
public class QaOleMessageFilter : IQaOleMessageFilter {
 public int HandleInComingCall(int type,IntPtr task,int tick,IntPtr info) { return 0; }
 public int RetryRejectedCall(IntPtr task,int tick,int reject) { return tick<15000 && (reject==1 || reject==2) ? 250 : -1; }
 public int MessagePending(IntPtr task,int tick,int pending) { return 2; }
 [DllImport("ole32.dll")] static extern int CoRegisterMessageFilter(IQaOleMessageFilter f,out IQaOleMessageFilter previous);
 public static void Register() { IQaOleMessageFilter old; int r=CoRegisterMessageFilter(new QaOleMessageFilter(),out old);if(r!=0)throw new Exception("STA_MESSAGE_FILTER_REQUIRED"); }
 public static void Revoke() { IQaOleMessageFilter old;CoRegisterMessageFilter(null,out old); }
}
"@
[QaOleMessageFilter]::Register()

$existingExcelIds=@(Get-CimInstance Win32_Process -Filter "Name = 'EXCEL.EXE'" | Select-Object -ExpandProperty ProcessId)
$qaRoot=Join-Path (Get-Location) 'operations\physical-count-excel'
$inputFile=Join-Path (Get-Location) 'docs\physical_count_excel\Conteo_Fisico_FICTICIO_MATRIZ.xlsx'
$outputFile=Join-Path (Get-Location) 'docs\physical_count_excel\Conteo_Fisico_FICTICIO_CALCULADO.xlsx'
$hash=(Get-FileHash -LiteralPath $inputFile).Hash
$rows=(Get-Content (Join-Path $qaRoot 'QA_ROWS.json') -Raw | ConvertFrom-Json).rows
$excel=$null;$book=$null;$ownPid=$null;$checks=[Collections.Generic.List[object]]::new();$failure=$null
try {
 $excel=New-Object -ComObject Excel.Application
 if ($excel.Workbooks.Count -ne 0) {throw 'PRIVATE_INSTANCE_NOT_EMPTY'}
 $created=@(Get-CimInstance Win32_Process -Filter "Name = 'EXCEL.EXE'" | Where-Object {$_.ProcessId -notin $existingExcelIds -and $_.CommandLine -match '/automation -Embedding'})
 if($created.Count -ne 1){throw 'PRIVATE_PID_NOT_UNIQUE'}
 $ownPid=$created[0].ProcessId
 @{pid=$ownPid;created=$created[0].CreationDate;source=$inputFile;existing_instances_untouched=$true}|ConvertTo-Json|Set-Content (Join-Path $qaRoot 'EXCEL_INSTANCE.json')
 $excel.Visible=$false;$excel.DisplayAlerts=$false;$excel.EnableEvents=$false;$excel.AutomationSecurity=3;$excel.AskToUpdateLinks=$false
 Start-Sleep -Seconds 2
 $book=$excel.Workbooks.Open($inputFile,0,$true)
 if($null -eq $book -and $excel.Workbooks.Count -eq 1){$book=$excel.Workbooks.Item(1)}
 if($null -eq $book -or $book.FullName -ne $inputFile){throw 'WORKBOOK_SCOPE_INVALID'}
 Start-Sleep -Seconds 2
 $sheet=$book.Worksheets.Item('Conteo físico')
 Start-Sleep -Seconds 2
 $matrix=$sheet.Range('A1:L'+$sheet.UsedRange.Rows.Count).Value2
 foreach($case in @(
  @('COUNT-LESS',@(5,0,7.85,0,149.15)),
  @('COUNT-MORE',@(0,5,0,10,210)),
  @('COUNT-EQUAL',@(0,0,0,0,100)),
  @('COUNT-DECIMAL',@(4.875,0,6.02,0,117.43)),
  @('P-A',@(5,0,8.05,0,152.95))
 )){
  $r=[int]$rows.($case[0]);$actual=@($matrix[$r,6],$matrix[$r,7],$matrix[$r,8],$matrix[$r,9],$matrix[$r,12]);$expected=$case[1]
  for($i=0;$i -lt 5;$i++){if($null -eq $actual[$i] -or [math]::Abs([double]$actual[$i]-[double]$expected[$i]) -gt 0.0000001){throw ('CALC_MISMATCH '+$case[0]+' '+$i+' actual='+$actual[$i])}}
  $checks.Add(@{case=$case[0];passed=$true;calculated=$actual})
 }
 $u=[int]$rows.'COUNT-UNKNOWN';foreach($c in @(8,9,12)){if([string]$matrix[$u,$c] -ne ''){throw 'UNKNOWN_COST_NOT_BLANK'}}
 $checks.Add(@{case='Costo desconocido no valoriza';passed=$true})
 $blankRow=0;for($r=2;$r -le $sheet.UsedRange.Rows.Count;$r++){if($null -eq $matrix[$r,5]){$blankRow=$r;break}}
 if($blankRow -eq 0){throw 'BLANK_CASE_MISSING'}
 foreach($c in @(6,7,8,9,12)){if([string]$matrix[$blankRow,$c] -ne ''){throw 'BLANK_PHYSICAL_NOT_OMITTED'}}
 $checks.Add(@{case='E vacío conserva resultados vacíos';passed=$true})
 $p=[int]$rows.'P-A';if(-not $sheet.ProtectContents -or $sheet.Range('E'+$p).Locked -or -not $sheet.Range('J'+$p).Locked -or -not $sheet.Range('K'+$p).Locked){throw 'PROTECTION_INVALID'}
 $checks.Add(@{case='Solo E editable; J/K bloqueadas';passed=$true})
 $orange=[int]$sheet.Range('F'+[int]$rows.'COUNT-LESS').FormatConditions.Item(1).Interior.Color
 $green=[int]$sheet.Range('G'+[int]$rows.'COUNT-MORE').FormatConditions.Item(1).Interior.Color
 if($orange -ne 13427967 -or $green -ne 15203548){throw ('CF_INVALID '+$orange+'/'+$green)}
 $checks.Add(@{case='Excel reconoce rellenos condicionales naranja y verde';passed=$true})
 $book.SaveCopyAs($outputFile)
 $checks.Add(@{case='Apertura y copia calculada nativa sin reparación';passed=$true})
 @{engine='Microsoft Excel';version=$excel.Version;passed=$checks.Count;failed=0;checks=$checks;read_only_source=$true;macros_disabled=$true;user_workbooks_untouched=$true;output=$outputFile}|ConvertTo-Json -Depth 6|Set-Content (Join-Path $qaRoot 'TEST_EXCEL_NATIVE.json')
}
catch {$failure=$_;@{error=$_.Exception.Message;position=$_.InvocationInfo.PositionMessage;checks_completed=$checks;private_pid=$ownPid}|ConvertTo-Json -Depth 6|Set-Content (Join-Path $qaRoot 'EXCEL_TEST_FAILURE.json')}
finally {
 if($book){try{$book.Close($false)}catch{}}
 if($excel -and $ownPid){try{$excel.Quit()}catch{}}
 [QaOleMessageFilter]::Revoke()
 if($ownPid){$remaining=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$ownPid);if($remaining -and $remaining.Name -eq 'EXCEL.EXE' -and $remaining.CommandLine -match '/automation -Embedding' -and $ownPid -notin $existingExcelIds){Stop-Process -Id $ownPid -Force}}
}
if((Get-FileHash -LiteralPath $inputFile).Hash -ne $hash){throw 'SOURCE_CHANGED'}
if($failure){throw $failure}
Get-Content (Join-Path $qaRoot 'TEST_EXCEL_NATIVE.json') -Raw
