$t = (Get-Content -Raw "C:\Users\vitou\.opencodex\admission-token.txt").Trim()
Set-Clipboard -Value $t
Write-Output "copied_len=$($t.Length)"
