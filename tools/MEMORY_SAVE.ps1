param(
  [string]$Phase,
  [string]$Goal,
  [string]$Facts,
  [string]$Blocked,
  [string]$Status,
  [string]$NextAction,
  [string]$Location = "윈도우 파워셀(작업용 창)",
  [string]$SuccessCriteria
)

function Ask([string]$q) {
  Write-Host ""
  return Read-Host $q
}

function NormalizePhase([string]$p) {
  if (-not $p) { return "" }
  $x = $p.Trim()

  switch -Regex ($x) {
    "^(cleanup|클린업|정리)$"   { return "Cleanup" }
    "^(check|체크|확인)$"       { return "Check" }
    "^(proceed|진행)$"          { return "Proceed" }
    "^(finalize|피날|마무리|정리완료)$" { return "Finalize" }
    default { return $x } # 그대로 두되, 아래에서 최종 검증
  }
}

# --- 입력 (없으면 물어봄) ---
if (-not $Phase)          { $Phase = Ask "현재 Phase (정리/Cleanup, 확인/Check, 진행/Proceed, 마무리/Finalize)" }
$Phase = NormalizePhase $Phase

# Phase 최종 강제 (모르면 Check로)
if ($Phase -notin @("Cleanup","Check","Proceed","Finalize")) { $Phase = "Check" }

if (-not $Goal)           { $Goal  = Ask "현재 작업 목표 (한 줄)" }
if (-not $Facts)          { $Facts = Ask "오늘 확정된 사실 (여러개면 ; 로 구분)" }
if (-not $Blocked)        { $Blocked = Ask "현재 막힌 포인트 (없으면 '없음')" }
if (-not $Status)         { $Status = Ask "현재 상태 (정상/주의/막힘 등 한 단어)" }
if (-not $NextAction)     { $NextAction = Ask "다음 1단계 작업 (딱 1개, 한 줄)" }
if (-not $SuccessCriteria){ $SuccessCriteria = Ask "성공 기준 (한 줄)" }

$ts   = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")

# --- 파일 경로 ---
$csFile  = "MEMORY\20_CURRENT_STATE.md"
$naFile  = "MEMORY\40_NEXT_ACTION.md"
$logFile = "MEMORY\SESSION_LOG.md"

New-Item -ItemType File -Force -Path $csFile,$naFile,$logFile | Out-Null

# --- CURRENT_STATE (통째 생성) ---
$cs = @()
$cs += "# Current State"
$cs += ""
$cs += "## 현재 Phase"
$cs += $Phase
$cs += ""
$cs += "## 현재 작업 목표"
$cs += $Goal
$cs += ""
$cs += "## 오늘 확정된 사실"
$factsList = ($Facts -split "\s*;\s*" | Where-Object { $_ -and $_.Trim() -ne "" })
if ($factsList.Count -eq 0) { $factsList = @("정보 없음") }
$cs += ("- " + ($factsList -join "`r`n- "))
$cs += ""
$cs += "## 현재 막힌 포인트"
$cs += $Blocked
$cs += ""
$cs += "## 현재 상태"
$cs += $Status
$csText = ($cs -join "`r`n")
Set-Content -Path $csFile -Value $csText -Encoding UTF8

# --- NEXT_ACTION (통째 생성 / 1단계만) ---
$na = @()
$na += "# Next Action"
$na += ""
$na += "## 다음 1단계 작업"
$na += $NextAction
$na += ""
$na += "## 실행 위치"
$na += $Location
$na += ""
$na += "## 성공 기준"
$na += $SuccessCriteria
$naText = ($na -join "`r`n")
Set-Content -Path $naFile -Value $naText -Encoding UTF8

# --- SESSION_LOG 자동 기록 ---
$bt = [char]96
$fence = ($bt.ToString() * 3)

$log = @()
$log += ""
$log += "---"
$log += ""
$log += "## MEMORY_SAVE $ts"
$log += $fence
$log += "Phase: $Phase"
$log += "Goal: $Goal"
$log += "Facts: $Facts"
$log += "Blocked: $Blocked"
$log += "Status: $Status"
$log += "NextAction: $NextAction"
$log += "SuccessCriteria: $SuccessCriteria"
$log += $fence
Add-Content -Path $logFile -Value ($log -join "`r`n") -Encoding UTF8

# --- MEMORY_PACK 갱신 + 클립보드 복사 ---
if (Test-Path "tools\MEMORY_LOAD.ps1") {
  powershell -ExecutionPolicy Bypass -File "tools\MEMORY_LOAD.ps1" | Out-Null
  Write-Host "OK: CURRENT_STATE + NEXT_ACTION + SESSION_LOG + MEMORY_PACK 갱신 완료"
} else {
  Write-Host "WARN: tools\MEMORY_LOAD.ps1 없음 (MEMORY_PACK 갱신 스킵)"
  Write-Host "OK: CURRENT_STATE + NEXT_ACTION + SESSION_LOG 갱신 완료"
}
