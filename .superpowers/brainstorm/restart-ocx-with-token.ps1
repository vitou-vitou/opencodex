$ErrorActionPreference = "Continue"
$log = "D:\Projects\opencodex\.superpowers\brainstorm\restart-ocx.log"
function L([string]$m) { Add-Content -Path $log -Value $m; Write-Output $m }
"" | Set-Content $log
$tokenPath = "C:\Users\vitou\.opencodex\admission-token.txt"
$token = (Get-Content -Raw $tokenPath).Trim()
$env:OPENCODEX_API_AUTH_TOKEN = $token
[Environment]::SetEnvironmentVariable("OPENCODEX_API_AUTH_TOKEN", $token, "User")
L "token_len=$($token.Length)"
L "stopping..."
$stop = Start-Process -FilePath "C:\Users\vitou\AppData\Roaming\npm\ocx.cmd" -ArgumentList @("stop") -Wait -PassThru -NoNewWindow -RedirectStandardOutput "D:\Projects\opencodex\.superpowers\brainstorm\ocx-stop.out" -RedirectStandardError "D:\Projects\opencodex\.superpowers\brainstorm\ocx-stop.err"
L "stop_exit=$($stop.ExitCode)"
Start-Sleep -Seconds 2
L "starting with token..."
$start = Start-Process -FilePath "C:\Users\vitou\AppData\Roaming\npm\ocx.cmd" -ArgumentList @("start") -Wait -PassThru -NoNewWindow -RedirectStandardOutput "D:\Projects\opencodex\.superpowers\brainstorm\ocx-start.out" -RedirectStandardError "D:\Projects\opencodex\.superpowers\brainstorm\ocx-start.err"
L "start_exit=$($start.ExitCode)"
if (Test-Path "D:\Projects\opencodex\.superpowers\brainstorm\ocx-start.out") { L ((Get-Content "D:\Projects\opencodex\.superpowers\brainstorm\ocx-start.out" -Raw)) }
if (Test-Path "D:\Projects\opencodex\.superpowers\brainstorm\ocx-start.err") { L ((Get-Content "D:\Projects\opencodex\.superpowers\brainstorm\ocx-start.err" -Raw)) }
Start-Sleep -Seconds 2
try {
  $h = Invoke-WebRequest -Uri "http://127.0.0.1:10100/healthz" -UseBasicParsing -TimeoutSec 5
  L "health=$($h.StatusCode)"
} catch { L "health_fail=$($_.Exception.Message)" }
L "done"