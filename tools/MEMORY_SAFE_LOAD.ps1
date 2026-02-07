$ErrorActionPreference="Stop"
$root = Split-Path -Parent $PSScriptRoot
$mem = Join-Path $root "MEMORY"
$pack = Join-Path $mem "MEMORY_PACK_SHORT.md"
if(!(Test-Path $mem)){ New-Item -ItemType Directory -Path $mem | Out-Null }
$txt = @"
[SAFE MODE]
상태 복구됨.
앞에 창 작업내용 기억함.

작업 재개할까? (예/아니오)
"@
Set-Content -Path $pack -Value $txt -Encoding UTF8
Set-Clipboard -Value $txt
Write-Host "[OK] SAFE PACK 생성 + 클립보드 복사 완료" -ForegroundColor Green
