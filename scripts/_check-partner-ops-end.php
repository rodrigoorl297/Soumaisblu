<?php
$c = file_get_contents('https://www.soumaisblu.com.br/js/partner-ops.js?v=4');
echo substr($c, -400);
