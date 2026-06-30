<?php
/**
 * Analisa proposals.csv (export phpMyAdmin, separador ;)
 */
declare(strict_types=1);

$path = $argv[1] ?? '';
if ($path === '' || !is_file($path)) {
    fwrite(STDERR, "Uso: php analyze-proposals-csv.php proposals.csv\n");
    exit(1);
}

$f = fopen($path, 'r');
$header = fgetcsv($f, 0, ';');
$attIdx = array_search('attachments', $header, true);
$idIdx = array_search('id', $header, true);
if ($attIdx === false) {
    fwrite(STDERR, "Coluna attachments não encontrada\n");
    exit(1);
}

$stats = [
    'rows' => 0,
    'with_attachments' => 0,
    'supabase' => 0,
    'locaweb' => 0,
    'data_inline' => 0,
    'other' => 0,
    'locaweb_proposals' => [],
];

while (($row = fgetcsv($f, 0, ';')) !== false) {
    $stats['rows']++;
    if (!isset($row[$attIdx]) || trim($row[$attIdx]) === '' || trim($row[$attIdx]) === '{}') {
        continue;
    }
    $stats['with_attachments']++;
    $json = $row[$attIdx];
    $att = json_decode($json, true);
    if (!is_array($att)) {
        continue;
    }
    $id = $idIdx !== false ? ($row[$idIdx] ?? '') : '';
    $hasLocaweb = false;
    foreach ($att as $key => $val) {
        if (!is_string($key) || str_ends_with($key, '_nome') || str_ends_with($key, '_pasta') || str_ends_with($key, '_caminho')) {
            continue;
        }
        $s = is_string($val) ? $val : '';
        if ($s === '') {
            continue;
        }
        if (str_starts_with($s, 'data:')) {
            $stats['data_inline']++;
        } elseif (str_contains($s, 'supabase.co/storage')) {
            $stats['supabase']++;
        } elseif (str_contains($s, '/uploads/') || str_contains($s, 'soumaisblu.com.br')) {
            $stats['locaweb']++;
            $hasLocaweb = true;
        } else {
            $stats['other']++;
        }
    }
    if ($hasLocaweb && $id !== '') {
        $stats['locaweb_proposals'][$id] = true;
    }
}
fclose($f);

echo "=== Análise proposals.csv ===\n";
echo "Linhas: {$stats['rows']}\n";
echo "Com anexos: {$stats['with_attachments']}\n";
echo "URLs Supabase: {$stats['supabase']}\n";
echo "URLs Locaweb: {$stats['locaweb']}\n";
echo "Inline data: {$stats['data_inline']}\n";
echo "Outros: {$stats['other']}\n";
echo "Propostas com link Locaweb: " . count($stats['locaweb_proposals']) . "\n";
