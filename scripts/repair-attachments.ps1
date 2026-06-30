# Repara URLs de anexos das propostas no MySQL (Locaweb).
# Rode no PowerShell do Windows - chama o site em producao.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File .\scripts\repair-attachments.ps1 -DryRun -All
#   powershell -ExecutionPolicy Bypass -File .\scripts\repair-attachments.ps1 -All
#   powershell -ExecutionPolicy Bypass -File .\scripts\repair-attachments.ps1 -All -BatchSize 25

param(
    [string]$Site = 'https://www.soumaisblu.com.br',
    [string]$ApiKey = 'soublu_api_52e8c7a6b3df4019',
    [int]$BatchSize = 100,
    [switch]$DryRun,
    [switch]$All
)

$Site = $Site.TrimEnd('/')
$offset = 0
$round = 0

Write-Host 'SOU+BLU - repair-proposal-attachments' -ForegroundColor Cyan
Write-Host ('Site: ' + $Site)
if ($DryRun) {
    Write-Host 'Modo: SIMULACAO (dry_run)' -ForegroundColor Yellow
} else {
    Write-Host 'Modo: GRAVAR no MySQL' -ForegroundColor Yellow
}
Write-Host ''

do {
    $round++
    $qs = 'limit=' + $BatchSize + '&offset=' + $offset
    if ($All) { $qs = $qs + '&all=1' }
    if ($DryRun) {
        $qs = $qs + '&dry_run=1'
    }

    $url = $Site + '/api/repair-proposal-attachments.php?' + $qs
    Write-Host ('[' + $round + '] GET offset=' + $offset + ' ...') -ForegroundColor Yellow

    $raw = curl.exe -s $url -H ('X-API-Key: ' + $ApiKey)
    if ($raw -match 'File not found' -or $raw -match '<!DOCTYPE') {
        Write-Host 'ERRO: script nao encontrado no servidor.' -ForegroundColor Red
        Write-Host 'Envie para a Locaweb: api/repair-proposal-attachments.php, api/lib/FileStorage.php, config.supabase.local.php'
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
    Write-Host ('  total_matching=' + $json.total_matching + ' processed=' + $json.batch.processed + ' next=' + $json.next_offset)
    Write-Host ('  ok=' + $s.ok + ' fixed=' + $s.fixed + ' migrated=' + $s.migrated + ' missing=' + $s.missing + ' broken=' + $s.broken + ' inline=' + $s.inline + ' skipped=' + $s.skipped)
    Write-Host ('  service_key legado: ' + $json.service_key_configured)

    $offset = [int]$json.next_offset
    $hasMore = [bool]$json.has_more
} while ($hasMore)

Write-Host ''
if ($DryRun) {
    Write-Host 'Simulacao OK. Para gravar, rode sem -DryRun.' -ForegroundColor Green
} else {
    Write-Host 'Concluido. Atualize o navegador com Ctrl+F5.' -ForegroundColor Green
}
