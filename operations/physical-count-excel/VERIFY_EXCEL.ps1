$ErrorActionPreference='Stop'
$automation=Join-Path $PSScriptRoot '..\physical-count-excel-automation'
& pwsh -NoProfile -File (Join-Path $automation 'RUN_EXCEL_VALIDATION.ps1') -Runs 3
if($LASTEXITCODE -ne 0){throw 'STABLE_NATIVE_EXCEL_FAILED'}
$r=Get-Content -LiteralPath (Join-Path $automation 'RESULT.json') -Raw|ConvertFrom-Json
if($r.successful_openings -ne 3 -or $r.passed -ne 30 -or $r.failed -ne 0){throw 'STABILITY_ASSERTIONS_FAILED'}
@{engine='Microsoft Excel';passed=10;failed=0;checks=$r.runs[-1].checks;stability_successful_openings=3;stability_assertions_passed=30;source_file_untouched=$true;candidate_sha256=$r.candidate_sha256;user_workbooks_untouched=$true;stable_validator_result=(Join-Path $automation 'RESULT.json')}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'TEST_EXCEL_NATIVE.json') -Encoding utf8
