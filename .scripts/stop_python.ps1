try {
    $ps = Get-Process -Name python,py -ErrorAction SilentlyContinue
    if ($ps) {
        foreach ($p in $ps) {
            Write-Output "Stopping process $($p.Id) $($p.ProcessName)"
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        }
    } else {
        Write-Output "No python/py processes found"
    }
} catch {
    Write-Output "Error stopping processes: $($_.Exception.Message)"
}
