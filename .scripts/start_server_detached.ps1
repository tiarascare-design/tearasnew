$exe = 'py'
try {
    Start-Process -FilePath $exe -ArgumentList '-3','-m','http.server','5500' -WindowStyle Hidden -WorkingDirectory (Get-Location)
    Write-Output 'Started detached http.server on port 5500'
} catch {
    Write-Output 'Failed to start server: ' + $_.Exception.Message
}
