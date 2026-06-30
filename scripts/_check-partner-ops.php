<?php
$c = file_get_contents('https://www.soumaisblu.com.br/js/partner-ops.js?v=4');
echo 'len=' . strlen($c) . "\n";
echo 'renderPanel=' . (strpos($c, 'renderPanel') !== false ? 'yes' : 'no') . "\n";
echo 'window.PartnerOps=' . (strpos($c, 'window.PartnerOps') !== false ? 'yes' : 'no') . "\n";
$boot = file_get_contents('https://www.soumaisblu.com.br/js/financeiro-boot.js?v=97c411');
echo 'boot len=' . strlen($boot) . "\n";
echo 'boot error msg=' . (strpos($boot, 'PartnerOps') !== false ? 'yes' : 'no') . "\n";
$html = file_get_contents('https://www.soumaisblu.com.br/financeiro.html');
echo 'html has partner-ops=' . (strpos($html, 'partner-ops.js') !== false ? 'yes' : 'no') . "\n";
if (preg_match('/partner-ops\.js\?v=([^"\']+)/', $html, $m)) echo 'version=' . $m[1] . "\n";
