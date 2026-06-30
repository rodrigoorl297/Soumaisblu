# SOU+BLU — servidor PHP local (uma única instância na porta 8080)
$ErrorActionPreference = 'Stop'
$Port = 8080
$Root = Split-Path $PSScriptRoot -Parent

Write-Host "Document root: $Root"

# Encerra PHP antigo na porta 8080 (evita localhost IPv6 vs 127.0.0.1 com pastas diferentes)
$listeners = netstat -ano | Select-String ":$Port\s" | ForEach-Object {
    if ($_ -match '\s+(\d+)\s*$') { $matches[1] }
} | Sort-Object -Unique

foreach ($pid in $listeners) {
    if ($pid -eq '0') { continue }
    try {
        $proc = Get-Process -Id ([int]$pid) -ErrorAction Stop
        if ($proc.ProcessName -eq 'php') {
            Write-Host "Encerrando PHP antigo PID $pid"
            Stop-Process -Id ([int]$pid) -Force
        }
    } catch {}
}

Start-Sleep -Milliseconds 400

Set-Location $Root
Write-Host "Iniciando: php -S 127.0.0.1:$Port router-dev.php"
Write-Host "Abra: http://127.0.0.1:$Port/index.html"
& php -S "127.0.0.1:$Port" router-dev.php
