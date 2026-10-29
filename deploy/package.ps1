# ============================================================================
# Builds the upload zip used for BOTH parts of the assignment:
#   - Part I:  copy it to the EC2 instance with scp
#   - Part II: upload it to S3, then point Elastic Beanstalk at it
#
# Run from PowerShell in the aws-portal folder:
#     powershell -ExecutionPolicy Bypass -File deploy\package.ps1
#
# The zip has package.json at its root (Elastic Beanstalk requires that) and
# leaves out node_modules, .env and tests. Uses Windows' built-in tar.exe,
# which writes forward-slash paths that Linux can unzip correctly.
# ============================================================================
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
New-Item -ItemType Directory -Force -Path (Join-Path $root 'dist') | Out-Null
$out = Join-Path $root "dist\lexalys-portal-$stamp.zip"

$items = @('package.json', 'package-lock.json', 'Procfile', '.env.example', 'src', 'views', 'public', 'db', 'deploy/ec2', 'docs')
foreach ($i in $items) { if (-not (Test-Path $i)) { throw "Missing $i - run this from the aws-portal folder." } }

tar.exe -a -c -f $out @items
if ($LASTEXITCODE -ne 0) { throw 'tar.exe failed to build the zip.' }

$size = [math]::Round((Get-Item $out).Length / 1KB)
Write-Host ''
Write-Host "Built $out ($size KB)" -ForegroundColor Green
Write-Host 'Contents:'
tar.exe -t -f $out | Select-Object -First 12
Write-Host '...'
