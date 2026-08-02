$root = Join-Path $env:APPDATA 'Cursor\User\workspaceStorage'
Get-ChildItem $root -Directory | ForEach-Object {
  $wj = Join-Path $_.FullName 'workspace.json'
  if (Test-Path $wj) {
    $c = Get-Content $wj -Raw
    if ($c -match 'opencodex[/\\]pde0') {
      Write-Output $_.FullName
      Write-Output $c
      Write-Output '----'
    }
  }
}
