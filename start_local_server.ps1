param(
  [int]$Port = 5500,
  [string]$Dir = (Get-Location).Path
)

Write-Host "Starting local dev server on port $Port (dir: $Dir)" -ForegroundColor Cyan
$python = Get-Command py -ErrorAction SilentlyContinue
if (-not $python) { $python = Get-Command python -ErrorAction SilentlyContinue }
if (-not $python) { Write-Error "Python not found. Please install Python 3 and ensure 'py' or 'python' is on PATH."; exit 1 }

# Prevent accidentally serving credentials from the bundle directory.
$svcFiles = Get-ChildItem -Path $Dir -Filter "*firebase-adminsdk-*.json" -File -Recurse -ErrorAction SilentlyContinue
if ($svcFiles) {
  Write-Host "WARNING: Found Firebase service account JSON files in the served directory:" -ForegroundColor Yellow
  $svcFiles | ForEach-Object { Write-Host " - $($_.FullName)" -ForegroundColor Yellow }
  Write-Host "It's strongly recommended to move these files outside the repo and set the path using the environment variable GOOGLE_APPLICATION_CREDENTIALS." -ForegroundColor Yellow
}

Write-Host "Running dev server (use DEV_ALLOW_UNSAFE_INLINE=1 to permit legacy inline handlers)" -ForegroundColor Cyan
& $python.Path "$PSScriptRoot\dev_server.py" $Port $Dir
