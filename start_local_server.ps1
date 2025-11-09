param(
  [int]$Port = 5500,
  [string]$Dir = (Get-Location).Path
)

Write-Host "Starting local dev server on port $Port (dir: $Dir)" -ForegroundColor Cyan
$python = Get-Command py -ErrorAction SilentlyContinue
if (-not $python) { $python = Get-Command python -ErrorAction SilentlyContinue }
if (-not $python) { Write-Error "Python not found. Please install Python 3 and ensure 'py' or 'python' is on PATH."; exit 1 }

& $python.Path "$PSScriptRoot\dev_server.py" $Port $Dir
