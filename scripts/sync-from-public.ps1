# Copia arquivos do WhatsApp CRM de Public2026-06-19 para public_ht_REMONTADO
$src = "C:\Users\bluno\OneDrive\Desktop\Public2026-06-19"
$dst = Split-Path $PSScriptRoot -Parent

if (!(Test-Path $src)) {
    Write-Error "Pasta origem nao encontrada: $src"
    exit 1
}

$files = @(
    "pages\whatsapp.html",
    "js\whatsapp-kanban.js",
    "js\whatsapp-chat.js",
    "css\whatsapp-chat.css",
    "api\whatsapp_api.php",
    "api\migrate-whatsapp.php"
)

foreach ($f in $files) {
    $s = Join-Path $src $f
    $d = Join-Path $dst $f
    if (!(Test-Path $s)) { Write-Warning "Ausente na origem: $f"; continue }
    $dir = Split-Path $d -Parent
    if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Copy-Item -Force $s $d
    Write-Host "OK $f"
}

Write-Host "Concluido. Reinicie o servidor local e use Ctrl+F5 no navegador."
