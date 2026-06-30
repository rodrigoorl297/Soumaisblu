$Root = 'C:\Users\bluno\Downloads\leadsmanager_atualizado\public_ht_REMONTADO'
$Zip = 'C:\Users\bluno\Downloads\leadsmanager_atualizado\SOUBLU_ANEXOS_FIX.zip'
$files = @(
    'api/remote-deploy.php','api/lib/FileStorage.php','api/repair-proposal-attachments.php',
    'api/file.php','api/upload.php','js/proposals.js','js/db.js','js/db-connect.js',
    'js/tickets.js','js/auth.js','admin.html','pages/admin.html',
    'css/global.css','financeiro.html','pages/financeiro.html','config.supabase.local.php'
)
if (Test-Path $Zip) { Remove-Item $Zip -Force }
$temp = Join-Path $env:TEMP 'soublu-anexos-fix'
if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
New-Item -ItemType Directory -Path $temp | Out-Null
foreach ($rel in $files) {
    $src = Join-Path $Root $rel
    if (-not (Test-Path $src)) { continue }
    $dst = Join-Path $temp $rel
    $dd = Split-Path $dst -Parent
    if (-not (Test-Path $dd)) { New-Item -ItemType Directory -Path $dd -Force | Out-Null }
    Copy-Item $src $dst
}
Compress-Archive -Path (Join-Path $temp '*') -DestinationPath $Zip -Force
Remove-Item $temp -Recurse -Force
Write-Host "ZIP: $Zip"
