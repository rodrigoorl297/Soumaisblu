# SOU+BLU — Deploy ZIP para Locaweb (public_html)
# Uso: powershell -ExecutionPolicy Bypass -File scripts/deploy-locaweb.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Date = Get-Date -Format "yyyy-MM-dd"
$ZipName = "SOUBLU_deploy_$Date.zip"
$ZipPath = Join-Path $Root $ZipName

$ExcludeDirs = @('.git', 'node_modules', 'storage\fontedata_cache', 'uploads', 'terminals')
$ExcludeFiles = @(
    'config.db.local.php',
    'config.pix.local.php',
    'config.evolution.local.php',
    'config.supabase.local.php',
    '*.p12', '*.pem', '.env', '.env.*',
    'SOUBLU_deploy_*.zip',
    '_extract_wa.py',
    'patch_financeiro.py'
)

Write-Host "Gerando $ZipName ..."

if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }

$items = Get-ChildItem -Path $Root -Recurse -File | Where-Object {
    $rel = $_.FullName.Substring($Root.Length + 1)
    foreach ($d in $ExcludeDirs) {
        if ($rel -like "$d*") { return $false }
    }
    foreach ($pat in $ExcludeFiles) {
        if ($_.Name -like $pat) { return $false }
    }
    return $true
}

$tempDir = Join-Path $env:TEMP "soublu-deploy-$Date"
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Path $tempDir | Out-Null

foreach ($f in $items) {
    $rel = $f.FullName.Substring($Root.Length + 1)
    $dest = Join-Path $tempDir $rel
    $destDir = Split-Path $dest -Parent
    if (!(Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    Copy-Item $f.FullName $dest
}

Compress-Archive -Path (Join-Path $tempDir '*') -DestinationPath $ZipPath -Force
Remove-Item $tempDir -Recurse -Force

Write-Host "OK: $ZipPath"
Write-Host ""
Write-Host "No servidor (public_html), crie manualmente:"
Write-Host "  config.db.local.php"
Write-Host "  config.pix.local.php"
Write-Host "  config.evolution.local.php"
Write-Host "  config.supabase.local.php"
Write-Host ""
Write-Host "Depois do upload, teste:"
Write-Host "  GET https://www.soumaisblu.com.br/api/setup-stack.php?action=status"
Write-Host "  Header: X-API-Key: (API_INTERNAL_KEY)"
