<?php
require __DIR__ . "/config.pix.local.php";
$ch = curl_init(SUPABASE_URL . "/rest/v1/finance_service_providers?limit=1");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ["apikey: ".SUPABASE_SERVICE_KEY, "Authorization: Bearer ".SUPABASE_SERVICE_KEY]);
echo curl_exec($ch);
echo "\n";
$ch2 = curl_init(SUPABASE_URL . "/rest/v1/finance_payroll?limit=1");
curl_setopt($ch2, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch2, CURLOPT_HTTPHEADER, ["apikey: ".SUPABASE_SERVICE_KEY, "Authorization: Bearer ".SUPABASE_SERVICE_KEY]);
echo curl_exec($ch2);
echo "\n";
