try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5500/?admin' -UseBasicParsing -TimeoutSec 8
    Write-Output ("STATUS:" + $r.StatusCode)
    $c = $r.Content
    $snippet = $c.Substring(0, [Math]::Min(1600, $c.Length))
    Write-Output '---SNIPPET---'
    Write-Output $snippet
} catch {
    Write-Output 'ERR: ' + $_.Exception.Message
}
