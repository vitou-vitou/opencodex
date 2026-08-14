$ErrorActionPreference = "Continue"
$log = "D:\Projects\opencodex\.superpowers\brainstorm\start-ocx-https.log"
function L([string]$m) { Add-Content -Path $log -Value $m; Write-Output $m }
"" | Set-Content -Path $log
L "begin $(Get-Date -Format o)"
$dir = Join-Path $env:USERPROFILE ".opencodex"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$tokenPath = Join-Path $dir "admission-token.txt"
# Prefer existing token if WSL wrote under C:\Users\vitou
$alt = "C:\Users\vitou\.opencodex\admission-token.txt"
if ((Test-Path $alt) -and (-not (Test-Path $tokenPath) -or ((Get-Item $tokenPath).Length -lt 16))) {
  Copy-Item $alt $tokenPath -Force
}
if (-not (Test-Path $tokenPath) -or ((Get-Item $tokenPath).Length -lt 16)) {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $token = -join ($bytes | ForEach-Object { $_.ToString("x2") })
  Set-Content -Path $tokenPath -Value $token -NoNewline
}
$token = (Get-Content -Raw $tokenPath).Trim()
[Environment]::SetEnvironmentVariable("OPENCODEX_API_AUTH_TOKEN", $token, "User")
$env:OPENCODEX_API_AUTH_TOKEN = $token
L "token_len=$($token.Length)"
L "token_path=$tokenPath"

$up = $false
try {
  $h = Invoke-WebRequest -Uri "http://127.0.0.1:10100/healthz" -UseBasicParsing -TimeoutSec 3
  L "already_up status=$($h.StatusCode)"
  $up = $true
} catch {
  L "starting_ocx..."
  $p = Start-Process -FilePath "ocx.cmd" -ArgumentList @("start") -PassThru -Wait -NoNewWindow -RedirectStandardOutput "D:\Projects\opencodex\.superpowers\brainstorm\ocx-start.out" -RedirectStandardError "D:\Projects\opencodex\.superpowers\brainstorm\ocx-start.err"
  L "ocx_exit=$($p.ExitCode)"
  if (Test-Path "D:\Projects\opencodex\.superpowers\brainstorm\ocx-start.out") { L (Get-Content "D:\Projects\opencodex\.superpowers\brainstorm\ocx-start.out" -Raw) }
  if (Test-Path "D:\Projects\opencodex\.superpowers\brainstorm\ocx-start.err") { L (Get-Content "D:\Projects\opencodex\.superpowers\brainstorm\ocx-start.err" -Raw) }
  Start-Sleep -Seconds 2
}

try {
  $h2 = Invoke-WebRequest -Uri "http://127.0.0.1:10100/healthz" -UseBasicParsing -TimeoutSec 5
  L "health=$($h2.StatusCode)"
} catch {
  L "health_fail=$($_.Exception.Message)"
}
L "done"
