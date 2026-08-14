$ErrorActionPreference = "Stop"
$tokenPath = Join-Path $env:USERPROFILE ".opencodex\admission-token.txt"
$token = (Get-Content -Raw $tokenPath).Trim()
$env:OPENCODEX_API_AUTH_TOKEN = $token

# Prefer ngrok if available; else herd expose
$ngrok = Get-Command ngrok -ErrorAction SilentlyContinue
$logDir = Join-Path $env:USERPROFILE ".opencodex"
$ngrokLog = Join-Path $logDir "ngrok.log"
$exposeLog = Join-Path $logDir "expose.log"

function Wait-PublicUrl {
  param([int]$Seconds = 25)
  for ($i = 0; $i -lt $Seconds; $i++) {
    try {
      $api = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2
      $https = $api.tunnels | Where-Object { $_.public_url -like "https://*" } | Select-Object -First 1
      if ($https) { return $https.public_url }
    } catch {}
    Start-Sleep -Seconds 1
  }
  return $null
}

if ($ngrok) {
  # Kill prior ngrok if any
  Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  $ngrokErr = Join-Path $logDir "ngrok.err.log"
  Start-Process -FilePath $ngrok.Source -ArgumentList @("http","10100","--log=stdout") -RedirectStandardOutput $ngrokLog -RedirectStandardError $ngrokErr -WindowStyle Hidden
  Write-Output "tunnel=ngrok"
  $url = Wait-PublicUrl -Seconds 30
  if ($url) {
    Write-Output "public_url=$url"
  } else {
    Write-Output "public_url=pending"
    Write-Output "ngrok_log=$ngrokLog"
    if (Test-Path $ngrokLog) { Get-Content $ngrokLog -Tail 40 -ErrorAction SilentlyContinue }
    if (Test-Path $ngrokErr) { Get-Content $ngrokErr -Tail 40 -ErrorAction SilentlyContinue }
  }
} else {
  $expose = Join-Path $env:USERPROFILE ".config\herd\bin\expose.bat"
  if (-not (Test-Path $expose)) { throw "Neither ngrok nor herd expose found" }
  Start-Process -FilePath $expose -ArgumentList @("10100") -RedirectStandardOutput $exposeLog -RedirectStandardError $exposeLog -WindowStyle Hidden
  Write-Output "tunnel=herd-expose"
  Write-Output "expose_log=$exposeLog"
  Start-Sleep -Seconds 5
  Get-Content $exposeLog -Tail 40 -ErrorAction SilentlyContinue
}

Write-Output "auth_header=x-opencodex-api-key: <from %USERPROFILE%\\.opencodex\\admission-token.txt>"
Write-Output "token_file=$tokenPath"
