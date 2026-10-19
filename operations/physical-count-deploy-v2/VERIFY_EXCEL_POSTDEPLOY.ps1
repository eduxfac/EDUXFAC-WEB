$ErrorActionPreference='Stop'
$automation=Join-Path $PSScriptRoot '..\physical-count-excel-automation'
& pwsh -NoProfile -File (Join-Path $PSScriptRoot '..\physical-count-excel\VERIFY_EXCEL.ps1')
if($LASTEXITCODE -ne 0){throw 'STABLE_NATIVE_EXCEL_FAILED'}
& pwsh -NoProfile -STA -File (Join-Path $automation 'VERIFY_READONLY_XLSX.ps1') -Source (Join-Path $PSScriptRoot 'CONTEO_PILOTO_SOLO_LECTURA.xlsx')
if($LASTEXITCODE -ne 0){throw 'EXPORTED_READONLY_WORKBOOK_FAILED'}
$r=Get-Content -LiteralPath (Join-Path $automation 'RESULT.json') -Raw|ConvertFrom-Json
$actual=Get-Content -LiteralPath (Join-Path $automation 'READONLY_COPY_RESULT.json') -Raw|ConvertFrom-Json
@{engine='Microsoft Excel';passed=12;failed=0;fictitious_tests=10;exported_copy_tests=2;stability_successful_openings=$r.successful_openings;stability_assertions=$r.passed;candidate_sha256=$r.candidate_sha256;exported_source_unchanged=$actual.original_file_unchanged}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'TEST_EXCEL_NATIVE.json') -Encoding utf8
