<?php
require __DIR__ . "/config.pix.local.php";
$ch = curl_init(SUPABASE_URL . "/rest/v1/withdrawals?pix_key=eq.59218219000104&status=eq.erro");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "PATCH");
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(["status" => "pago", "pix_status" => "pago", "pix_error" => "Baixado manualmente"]));
curl_setopt($ch, CURLOPT_HTTPHEADER, ["apikey: ".SUPABASE_SERVICE_KEY, "Authorization: Bearer ".SUPABASE_SERVICE_KEY, "Content-Type: application/json", "Prefer: return=representation"]);
echo curl_exec($ch);
