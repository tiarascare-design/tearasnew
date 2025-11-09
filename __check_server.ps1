# Diagnostic script to check local dev server on port 5600
$port = 5600
Write-Host "Checking TCP connections for port $port..."
try {
    $tcp = Get-NetTCPConnection -LocalPort $port -ErrorAction Stop
    Write-Host "NetTCPConnection entries found:"
    $tcp | Format-Table -AutoSize
} catch {
    Write-Host "No NetTCPConnection entries or error: $($_.Exception.Message)"
}

Write-Host "\nListing python processes (if any)..."
try {
    $py = Get-Process -Name python -ErrorAction Stop | Select-Object Id,ProcessName,StartTime
    $py | Format-Table -AutoSize
} catch {
    Write-Host "No python processes found or error: $($_.Exception.Message)"
}

Write-Host "\nTesting HTTP GET to http://localhost:$port ..."
if (Test-NetConnection -ComputerName localhost -Port $port -WarningAction SilentlyContinue -InformationLevel Quiet) {
    try {
        $r = Invoke-WebRequest "http://localhost:$port" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        Write-Host "HTTP Status: $($r.StatusCode)"
        Write-Host "Content length: $($r.RawContent.Length)"
        $c = $r.Content
        $len = [Math]::Min(800,$c.Length)
        Write-Host "---BEGIN RESPONSE PREVIEW---"
        Write-Host $c.Substring(0,$len)
        Write-Host "---END RESPONSE PREVIEW---"
    } catch {
        Write-Host "Invoke-WebRequest failed: $($_.Exception.Message)"
    }
} else {
    Write-Host "Port $port not listening from Test-NetConnection"
}
