param([int]$Runs=3)
$ErrorActionPreference='Stop'
$node=(Get-Command node -ErrorAction Stop).Source
& $node (Join-Path $PSScriptRoot 'GENERATE_FIXTURE.mjs')
if($LASTEXITCODE -ne 0){throw 'FICTITIOUS_FIXTURE_GENERATION_FAILED'}
& pwsh -NoProfile -STA -File (Join-Path $PSScriptRoot 'VALIDATE_EXCEL.ps1') -Runs $Runs
if($LASTEXITCODE -ne 0){throw 'MICROSOFT_EXCEL_NATIVE_VALIDATION_FAILED'}
