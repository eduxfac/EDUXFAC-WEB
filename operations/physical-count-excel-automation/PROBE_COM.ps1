$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @"
using System;
using System.Reflection;
using System.Runtime.InteropServices;
public sealed class ExcelProbe {
 public object App; public object Books;
 public ExcelProbe(){App=Activator.CreateInstance(Type.GetTypeFromProgID("Excel.Application"));Books=Get(App,"Workbooks");}
 public static object Get(object o,string n){return o.GetType().InvokeMember(n,BindingFlags.GetProperty,null,o,null);}
 public void Quit(){App.GetType().InvokeMember("Quit",BindingFlags.InvokeMethod,null,App,null);Marshal.FinalReleaseComObject(Books);Marshal.FinalReleaseComObject(App);}
}
"@
$old=@(Get-CimInstance Win32_Process -Filter "Name = 'EXCEL.EXE'"|Select-Object -ExpandProperty ProcessId)
$probe=$null;$pidOwn=$null
try{
 $probe=[ExcelProbe]::new()
 $created=@(Get-CimInstance Win32_Process -Filter "Name = 'EXCEL.EXE'"|Where-Object{$_.ProcessId -notin $old -and $_.CommandLine -match '/automation -Embedding'})
 if($created.Count -ne 1){throw 'PRIVATE_INSTANCE_PID_UNCLEAR'};$pidOwn=$created[0].ProcessId
 if([ExcelProbe]::Get($probe.Books,'Count') -ne 0){throw 'PRIVATE_INSTANCE_NOT_EMPTY'}
 $raw=$probe.App
 $normal=$raw.Workbooks
 @{csharp_workbooks_null=($null -eq $probe.Books);csharp_count=[ExcelProbe]::Get($probe.Books,'Count');powershell_property_null=($null -eq $normal);powershell_property_type=if($null -eq $normal){'null'}else{$normal.GetType().FullName};private_pid=$pidOwn;existing_processes=$old}|ConvertTo-Json|Tee-Object operations/physical-count-excel-automation/COM_COLLECTION_DIAGNOSIS.json
}finally{
 if($probe){try{$probe.Quit()}catch{}}
 if($pidOwn){$p=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$pidOwn);if($p -and $p.Name -eq 'EXCEL.EXE' -and $p.CommandLine -match '/automation -Embedding' -and $pidOwn -notin $old){Stop-Process -Id $pidOwn -Force}}
}
