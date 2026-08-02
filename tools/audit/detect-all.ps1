param([string]$Port = "5173", [string]$Slug = "")
$routes = @("/", "/app", "/how-it-works", "/detection", "/themes", "/privacy", "/docs", "/about", "/contact", "/terms", "/risk", "/account")
if ($Slug -ne "") { $routes += "/app/theme/$Slug" }
$total = 0
foreach ($r in $routes) {
  $url = "http://localhost:$Port$r"
  $out = & npx impeccable detect --json $url 2>&1 | Out-String
  $json = $out -replace '(?s)^[^\[]*', ''
  try {
    $findings = $json | ConvertFrom-Json
    $n = @($findings).Count
    $total += $n
    if ($n -gt 0) {
      Write-Output ("{0,-22} {1} FINDINGS" -f $r, $n)
      foreach ($f in $findings) { Write-Output ("      - {0}: {1}" -f $f.rule, $f.selector) }
    } else {
      Write-Output ("{0,-22} 0" -f $r)
    }
  } catch {
    Write-Output ("{0,-22} PARSE FAILED -- raw output follows" -f $r)
    Write-Output $out.Substring(0, [Math]::Min(400, $out.Length))
  }
}
Write-Output "TOTAL FINDINGS: $total"
