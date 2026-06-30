<?php
$f = fopen($argv[1] ?? '', 'r');
if (!$f) { fwrite(STDERR, "usage: php inspect-proposals-csv.php path.csv\n"); exit(1); }
$h = fgetcsv($f, 0, ';');
echo "Cols: " . count($h) . "\n";
foreach ($h as $i => $c) {
    echo "$i: $c\n";
}
$row = fgetcsv($f, 0, ';');
if ($row) {
    $attIdx = array_search('attachments', $h, true);
    if ($attIdx !== false && isset($row[$attIdx])) {
        echo "\nSample attachments (first 400 chars):\n" . substr($row[$attIdx], 0, 400) . "\n";
    }
}
fclose($f);
