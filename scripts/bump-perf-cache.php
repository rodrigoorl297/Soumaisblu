<?php
$files = [
    __DIR__ . '/../employee.html',
    __DIR__ . '/../pages/employee.html',
    __DIR__ . '/../rh-manager.html',
    __DIR__ . '/../pages/rh-manager.html',
    __DIR__ . '/../financeiro-sections.html',
    __DIR__ . '/../pages/financeiro-sections.html',
];
$repl = [
    'db.js?v=97c411dbstable2' => 'db.js?v=97c411perf1',
    'db.js?v=97c411rh2' => 'db.js?v=97c411perf1',
    'proposals.js?v=65' => 'proposals.js?v=97c411perf1',
    'profile.js?v=1781810513726' => 'profile.js?v=97c411irpj2',
    'profile.js?v=1782503100' => 'profile.js?v=97c411irpj2',
    'withdrawal-rules.js?v=97c411irpj1' => 'withdrawal-rules.js?v=97c411irpj2',
    'withdrawal-flow.js?v=97c411irpj1' => 'withdrawal-flow.js?v=97c411irpj2',
    'withdrawal-rules.js"' => 'withdrawal-rules.js?v=97c411irpj2"',
    'withdrawal-flow.js"' => 'withdrawal-flow.js?v=97c411irpj2"',
    'withdrawal-flow.js defer' => 'withdrawal-flow.js?v=97c411irpj2 defer',
];
foreach ($files as $f) {
    if (!is_file($f)) continue;
    $c = file_get_contents($f);
    $n = $c;
    foreach ($repl as $from => $to) {
        $n = str_replace($from, $to, $n);
    }
    if ($n !== $c) {
        file_put_contents($f, $n);
        echo "updated " . basename($f) . "\n";
    }
}
