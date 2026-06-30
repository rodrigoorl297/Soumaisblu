# Restaura anexos de propostas a partir de backups locais (public_html, SOUBLU_deploy, etc.)
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File .\scripts\restore-missing-attachments.ps1 -Scan
#   powershell -ExecutionPolicy Bypass -File .\scripts\restore-missing-attachments.ps1 -Copy -Migrate -DryRun
#   powershell -ExecutionPolicy Bypass -File .\scripts\restore-missing-attachments.ps1 -Copy -Migrate
#
# Backup extra (opcional):
#   -BackupPath "C:\Users\bluno\Downloads\public_html (32)\public_html\uploads"

param(
    [switch]$Scan,
    [switch]$Copy,
    [switch]$Migrate,
    [switch]$DryRun,
    [string]$BackupPath = '',
    [string]$From = '2026-06-01',
    [string]$To = '',
    [switch]$LocalOnly,
    [string]$Report = 'scripts/restore-report.json'
)

$Root = Split-Path $PSScriptRoot -Parent
if (-not $To) { $To = Get-Date -Format 'yyyy-MM-dd' }

$phpArgs = @('scripts/restore-missing-attachments.php', "--from=$From", "--to=$To", "--report=$Report")
if ($BackupPath) { $phpArgs += "--backup=$BackupPath" }
if ($DryRun) { $phpArgs += '--dry-run' }
if ($LocalOnly) { $phpArgs += '--local-only' }

if ($Copy -or $Migrate) {
    if ($Copy) { $phpArgs += '--copy' }
    if ($Migrate) { $phpArgs += '--migrate' }
} else {
    # scan é o padrão
}

Write-Host 'SOU+BLU - restore-missing-attachments' -ForegroundColor Cyan
Write-Host ('Diretorio: ' + $Root)
Push-Location $Root
try {
    & php @phpArgs
    $code = $LASTEXITCODE
} finally {
    Pop-Location
}
if ($code -ne 0) { exit $code }

Write-Host ''
if (-not $Copy -and -not $Migrate) {
    Write-Host 'Scan concluido. Para restaurar: -Copy -Migrate -DryRun e depois sem -DryRun.' -ForegroundColor Green
} elseif ($DryRun) {
    Write-Host 'Simulacao OK. Rode sem -DryRun para copiar e migrar.' -ForegroundColor Green
} else {
    Write-Host 'Restauracao concluida. Atualize o painel com Ctrl+F5.' -ForegroundColor Green
}
