# Migra anexos das propostas de JUNHO (dia 1 ate hoje): disco Locaweb -> Supabase.
# Grava URL nova no MySQL. Depois disso, novos anexos ja vao direto ao Supabase (db.js).
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File .\scripts\migrate-junho-locaweb-supabase.ps1 -DryRun
#   powershell -ExecutionPolicy Bypass -File .\scripts\migrate-junho-locaweb-supabase.ps1

param(
    [string]$Site = 'https://www.soumaisblu.com.br',
    [string]$ApiKey = 'soublu_api_52e8c7a6b3df4019',
    [string]$FromDate = '2026-06-01',
    [string]$ToDate = '',
    [int]$BatchSize = 5,
    [switch]$DryRun
)

if ([string]::IsNullOrWhiteSpace($ToDate)) {
    $ToDate = Get-Date -Format 'yyyy-MM-dd'
}

$Site = $Site.TrimEnd('/')
$offset = 0
$round = 0

Write-Host 'SOU+BLU - Migrar propostas Locaweb -> Supabase' -ForegroundColor Cyan
Write-Host ('Periodo: ' + $FromDate + ' ate ' + $ToDate)
Write-Host ('Site: ' + $Site)
if ($DryRun) {
    Write-Host 'Modo: SIMULACAO' -ForegroundColor Yellow
} else {
    Write-Host 'Modo: GRAVAR (upload Supabase + MySQL)' -ForegroundColor Yellow
}
Write-Host ''

do {
    $round++
    $qs = 'limit=' + $BatchSize + '&offset=' + $offset
    $qs += '&from_date=' + [uri]::EscapeDataString($FromDate)
    $qs += '&to_date=' + [uri]::EscapeDataString($ToDate)
    $qs += '&only_locaweb=1'
    if ($DryRun) { $qs += '&dry_run=1' }

    $url = $Site + '/api/repair-proposal-attachments.php?' + $qs
    Write-Host ('[' + $round + '] offset=' + $offset + ' ...') -ForegroundColor Yellow

    $raw = curl.exe -s $url -H ('X-API-Key: ' + $ApiKey)
    if ($raw -match 'File not found' -or $raw -match '<!DOCTYPE') {
        Write-Host 'ERRO: envie api/repair-proposal-attachments.php e api/lib/FileStorage.php para a Locaweb.' -ForegroundColor Red
        exit 1
    }

    try {
        $json = $raw | ConvertFrom-Json
    } catch {
        Write-Host 'Resposta invalida:' -ForegroundColor Red
        Write-Host $raw
        exit 1
    }

    if (-not $json.ok) {
        Write-Host ('ERRO: ' + $json.error) -ForegroundColor Red
        exit 1
    }

    $s = $json.stats
    Write-Host ('  fixed=' + $s.fixed + ' migrated=' + $s.migrated + ' missing=' + $s.missing + ' skipped=' + $s.skipped)
    Write-Host ('  total periodo: ' + $json.total_matching + ' | service_key: ' + $json.service_key_configured)

    $offset = [int]$json.next_offset
    $hasMore = [bool]$json.has_more
} while ($hasMore -and -not $DryRun)

Write-Host ''
if ($DryRun) {
    Write-Host 'Simulacao OK. Para migrar de verdade, rode sem -DryRun.' -ForegroundColor Green
} else {
    Write-Host 'Migracao concluida. Ctrl+F5 no painel. Novas propostas: so Supabase.' -ForegroundColor Green
}
