param(
  [Parameter(Mandatory=$true)][string]$Text,
  [string]$LogFile = "MEMORY\SESSION_LOG.md"
)

$ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
$header = "`r`n`r`n---`r`n`r`n## LOG $ts`r`n"

New-Item -ItemType File -Force -Path $LogFile | Out-Null

# ``` 을 직접 쓰지 않고, 백틱(문자코드 96) 3개로 생성
$bt = [char]96
$fence = ($bt.ToString() * 3)

$blockLines = @(
$fence,
$Text.TrimEnd(),
$fence,
""
)
$block = $blockLines -join "`r`n"

Add-Content -Path $LogFile -Value $header -Encoding UTF8
Add-Content -Path $LogFile -Value $block -Encoding UTF8

Write-Host ("OK: SESSION_LOG append 완료 -> {0}" -f $LogFile)
