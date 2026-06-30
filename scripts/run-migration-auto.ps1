# Migra TODOS os anexos de propostas (junho -> hoje) sem interação.
# 1) Locaweb /uploads -> Supabase + MySQL
# 2) Reparo geral (URLs quebradas, inline, Supabase)

param(
    [string]$Site = 'https://www.soumaisblu.com.br',
    [string]$ApiKey = 'soublu_api_52e8c7a6b3df4019',
    [string]$FromDate = '2026-06-01',
    [string]$ToDate = '',
    [int]$BatchSize = 5,
    [int]$MaxRounds = 500
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ToDate)) {
    $ToDate = Get-Date -Format 'yyyy-MM-dd'
}
$Site = $Site.TrimEnd('/')

function Invoke-RepairBatch {
    param([hashtable]$Query)
    $parts = @()
    foreach ($k in $Query.Keys) {
        $parts += ($k + '=' + [uri]::EscapeDataString([string]$Query[$k]))
    }
    $url = $Site + '/api/repair-proposal-attachments.php?' + ($parts -join '&')
    $raw = curl.exe -s --max-time 120 $url -H ('X-API-Key: ' + $ApiKey)
    if ($raw -match '504 Gateway Time-out') {
        throw '504 timeout — reduza BatchSize'
    }
    if ($raw -match 'File not found' -or $raw -match '<!DOCTYPE') {
        throw ('Resposta invalida: ' + $raw.Substring(0, [Math]::Min(200, $raw.Length)))
    }
    return ($raw | ConvertFrom-Json)
}

function Run-Phase {
    param([string]$Label, [hashtable]$BaseQuery)
    Write-Host ''
    Write-Host ('=== ' + $Label + ' ===') -ForegroundColor Cyan
    $offset = 0
    $round = 0
    $totals = @{ fixed = 0; migrated = 0; missing = 0; ok = 0; skipped = 0; broken = 0 }
    do {
        $round++
        if ($round -gt $MaxRounds) { throw 'MaxRounds atingido' }
        $q = $BaseQuery.Clone()
        $q['limit'] = $BatchSize
        $q['offset'] = $offset
        Write-Host ('[' + $round + '] offset=' + $offset + ' ...') -ForegroundColor Yellow
        $json = Invoke-RepairBatch -Query $q
        if (-not $json.ok) { throw $json.error }
        $s = $json.stats
        if ($null -ne $s.fixed) { $totals.fixed += [int]$s.fixed }
        if ($null -ne $s.migrated) { $totals.migrated += [int]$s.migrated }
        if ($null -ne $s.missing) { $totals.missing += [int]$s.missing }
        if ($null -ne $s.ok) { $totals.ok += [int]$s.ok }
        if ($null -ne $s.skipped) { $totals.skipped += [int]$s.skipped }
        if ($null -ne $s.broken) { $totals.broken += [int]$s.broken }
        Write-Host ('  fixed=' + $s.fixed + ' migrated=' + $s.migrated + ' missing=' + $s.missing + ' ok=' + $s.ok + ' skipped=' + $s.skipped)
        $offset = [int]$json.next_offset
        $hasMore = [bool]$json.has_more
        Start-Sleep -Milliseconds 500
    } while ($hasMore)
    Write-Host ('Totais ' + $Label + ': fixed=' + $totals.fixed + ' migrated=' + $totals.migrated + ' missing=' + $totals.missing) -ForegroundColor Green
    return $totals
}

Write-Host 'SOU+BLU — Migracao automatica' -ForegroundColor Cyan
Write-Host ('Periodo: ' + $FromDate + ' ate ' + $ToDate)
Write-Host ('Site: ' + $Site + ' | lote=' + $BatchSize)

$common = @{
    from_date = $FromDate
    to_date   = $ToDate
}

$t1 = Run-Phase -Label 'Fase 1: Locaweb -> Supabase' -BaseQuery ($common + @{ only_locaweb = '1' })
$t2 = Run-Phase -Label 'Fase 2: Reparo geral URLs' -BaseQuery $common

Write-Host ''
Write-Host 'CONCLUIDO' -ForegroundColor Green
Write-Host ('Migrados: ' + $t1.migrated + ' | URLs corrigidas: ' + ($t1.fixed + $t2.fixed) + ' | Missing: ' + ($t1.missing + $t2.missing))
Write-Host 'Ctrl+F5 no Financeiro.'
