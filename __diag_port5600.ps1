param(
  [int]$Port = 5600
)

Write-Host "Checking port $Port..."
$nc = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($nc -and $nc.Count -gt 0) {
    Write-Host "NetTCPConnection entries:"
    $nc | Format-Table -AutoSize
} else {
    Write-Host "No NetTCPConnection entries for port $Port"
}

Write-Host "\n--- Processes named python/py ---"
Get-Process -Name python,py -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,StartTime | Format-Table -AutoSize

Write-Host "\n--- Process owning port (if any) ---"
if ($nc -and $nc.Count -gt 0) {
    $pids = $nc | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $pids) {
        Get-Process -Id $procId -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,Path | Format-List
    }
} else { Write-Host "No owning process info (no connections)." }

Write-Host "\n--- HTTP GET to http://localhost:$Port ---"
if (Test-NetConnection -ComputerName localhost -Port $Port -InformationLevel Quiet) {
    try {
        $r = Invoke-WebRequest "http://localhost:$Port" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        Write-Host 'Status:' $r.StatusCode
        Write-Host 'Headers:'
        $r.Headers | Format-List
        $c = $r.Content
        Write-Host 'Content length:' ($c.Length)
        $len = [Math]::Min(800, $c.Length)
        Write-Host '---BEGIN RESPONSE PREVIEW---'
        Write-Host $c.Substring(0,$len)
        Write-Host '---END RESPONSE PREVIEW---'
    } catch {
        Write-Host 'Invoke-WebRequest failed:' $_.Exception.Message
    }
} else {
    Write-Host "Port $Port not listening from Test-NetConnection"
}
