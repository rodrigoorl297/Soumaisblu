# Envia arquivos de anexos/propostas para a Locaweb via FTP.
# Crie config.ftp.local.php na raiz (veja config.ftp.local.php.example).

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$cfgFile = Join-Path $Root 'config.ftp.local.php'
if (-not (Test-Path $cfgFile)) {
    Write-Host 'Crie config.ftp.local.php com FTP_HOST, FTP_USER, FTP_PASS, FTP_REMOTE_ROOT' -ForegroundColor Red
    exit 1
}

$cfg = @{}
Get-Content $cfgFile | ForEach-Object {
    if ($_ -match "define\('([^']+)',\s*'([^']*)'\)") {
        $cfg[$matches[1]] = $matches[2]
    }
}

$ftpHost = $cfg['FTP_HOST']
$user = $cfg['FTP_USER']
$pass = $cfg['FTP_PASS']
$remoteRoot = ($cfg['FTP_REMOTE_ROOT'] -replace '\\', '/').TrimEnd('/')

if (-not $ftpHost -or -not $user -or -not $pass) {
    Write-Host 'FTP_HOST, FTP_USER e FTP_PASS obrigatorios em config.ftp.local.php' -ForegroundColor Red
    exit 1
}

$files = @(
    'api/lib/FileStorage.php',
    'api/repair-proposal-attachments.php',
    'api/file.php',
    'api/upload.php',
    'js/proposals.js',
    'js/tickets.js',
    'js/auth.js',
    'admin.html',
    'pages/admin.html',
    'js/db.js',
    'js/db-connect.js',
    'css/global.css',
    'financeiro.html',
    'pages/financeiro.html',
    'config.supabase.local.php'
)

function Send-FtpFile {
    param([string]$LocalPath, [string]$RemotePath)
    $uri = "ftp://${ftpHost}/${RemotePath}"
    $req = [System.Net.FtpWebRequest]::Create($uri)
    $req.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
    $req.Credentials = New-Object System.Net.NetworkCredential($user, $pass)
    $req.UseBinary = $true
    $req.UsePassive = $true
    $bytes = [System.IO.File]::ReadAllBytes($LocalPath)
    $req.ContentLength = $bytes.Length
    $stream = $req.GetRequestStream()
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Close()
    $resp = $req.GetResponse()
    $resp.Close()
}

Write-Host 'SOU+BLU — Deploy FTP anexos' -ForegroundColor Cyan
foreach ($rel in $files) {
    $local = Join-Path $Root ($rel -replace '/', '\')
    if (-not (Test-Path $local)) {
        Write-Host "SKIP (nao existe): $rel" -ForegroundColor Yellow
        continue
    }
    $remote = $remoteRoot + '/' + ($rel -replace '\\', '/')
    $remoteDir = ($remote -replace '/[^/]+$', '')
    Write-Host "UP $rel"
    try {
        Send-FtpFile -LocalPath $local -RemotePath $remote
        Write-Host '  OK' -ForegroundColor Green
    } catch {
        Write-Host ('  ERRO: ' + $_.Exception.Message) -ForegroundColor Red
    }
}

Write-Host ''
Write-Host 'Deploy FTP concluido. Rodando migracao...' -ForegroundColor Cyan
& (Join-Path $Root 'scripts\run-migration-auto.ps1')
