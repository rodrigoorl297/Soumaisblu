# Envia arquivos: remote-deploy API (se existir) ou FTP.
param(
    [string]$Site = 'https://www.soumaisblu.com.br',
    [string]$ApiKey = 'soublu_api_52e8c7a6b3df4019'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Site = $Site.TrimEnd('/')

$files = @(
    'api/remote-deploy.php',
    'api/lib/FileStorage.php',
    'api/repair-proposal-attachments.php',
    'api/file.php',
    'api/upload.php',
    'js/proposals.js',
    'js/tickets.js',
    'js/auth.js',
    'js/admin.js',
    'js/db.js',
    'js/db-connect.js',
    'css/global.css',
    'financeiro.html',
    'pages/financeiro.html',
    'config.supabase.local.php'
)

function Push-RemoteApi {
    param([string]$RelPath)
    $local = Join-Path $Root ($RelPath -replace '/', '\')
    $bytes = [System.IO.File]::ReadAllBytes($local)
    $b64 = [Convert]::ToBase64String($bytes)
    $json = @{ path = $RelPath; content_base64 = $b64 } | ConvertTo-Json -Compress
    $tmp = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($tmp, $json, [System.Text.UTF8Encoding]::new($false))
    $out = curl.exe -s -X POST "$Site/api/remote-deploy.php" -H "X-API-Key: $ApiKey" -H "Content-Type: application/json" --data-binary "@$tmp"
    Remove-Item $tmp -Force
    return ($out | ConvertFrom-Json)
}

$probe = curl.exe -s "$Site/api/remote-deploy.php?action=list" -H "X-API-Key: $ApiKey"
$useApi = $probe -match '"ok":true'

if ($useApi) {
    Write-Host 'Deploy via API remote-deploy.php' -ForegroundColor Cyan
    foreach ($rel in $files) {
        $local = Join-Path $Root ($rel -replace '/', '\')
        if (-not (Test-Path $local)) { continue }
        Write-Host "  $rel"
        $r = Push-RemoteApi -RelPath $rel
        if (-not $r.ok) { throw $r.error }
    }
} else {
    Write-Host 'Deploy via FTP' -ForegroundColor Cyan
    & (Join-Path $Root 'scripts\deploy-anexos-ftp.ps1')
}

Write-Host ''
Write-Host 'Migracao MySQL + Supabase...' -ForegroundColor Cyan
php (Join-Path $Root 'scripts\migrate-attachments-cli.php')
