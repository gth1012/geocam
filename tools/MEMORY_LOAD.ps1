# MEMORY LOAD SCRIPT v2 (SHORT/LONG)
# UTF-8 with BOM encoding

# 스크립트 위치 기준으로 프로젝트 루트 찾기
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
Set-Location $root

$shortFiles = @(
  "MEMORY\00_SYSTEM_RULES.md",
  "MEMORY\10_PROJECT_FINGERPRINT.md",
  "MEMORY\20_CURRENT_STATE.md",
  "MEMORY\40_NEXT_ACTION.md"
)

$longFiles = @(
  "MEMORY\00_SYSTEM_RULES.md",
  "MEMORY\10_PROJECT_FINGERPRINT.md",
  "MEMORY\20_CURRENT_STATE.md",
  "MEMORY\40_NEXT_ACTION.md",
  "MEMORY\30_SESSION_LOG.md"
)

# SHORT PACK 생성 (새 창 입력용)
Get-Content $shortFiles | Set-Content "MEMORY\MEMORY_PACK_SHORT.md" -Encoding UTF8

# LONG PACK 생성 (기록용)
Get-Content $longFiles | Set-Content "MEMORY\MEMORY_PACK_LONG.md" -Encoding UTF8

# 클립보드에는 SHORT만 복사
Get-Content "MEMORY\MEMORY_PACK_SHORT.md" | Set-Clipboard

Write-Host ""
Write-Host "[OK] SHORT PACK 생성 + 클립보드 복사 완료" -ForegroundColor Green
Write-Host "     - MEMORY\MEMORY_PACK_SHORT.md"
Write-Host "     - MEMORY\MEMORY_PACK_LONG.md"
Write-Host ""
