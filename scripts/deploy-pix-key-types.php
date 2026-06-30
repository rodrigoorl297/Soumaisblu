<?php
declare(strict_types=1);
/**
 * Deploy: saque PIX aceita todos os tipos de chave (CPF, CNPJ, e-mail, celular, aleatória).
 * Uso: php scripts/deploy-pix-key-types.php
 */
$root = dirname(__DIR__);
$site = rtrim((string) ($argv[1] ?? 'https://www.soumaisblu.com.br'), '/');
$apiKey = (string) ($argv[2] ?? getenv('SOUBLU_API_KEY') ?: 'soublu_api_52e8c7a6b3df4019');
$files = [
    'api/remote-deploy.php',
    'api/pix_api.php',
    'js/db.js',
    'js/withdrawal-rules.js',
    'js/withdrawal-flow.js',
    'js/profile.js',
    'index.html',
    'admin.html',
    'pages/admin.html',
    'employee.html',
    'pages/employee.html',
    'financeiro.html',
    'pages/financeiro.html',
    'financeiro-sections.html',
    'pages/financeiro-sections.html',
];
$fail = false;
foreach ($files as $rel) {
    $local = $root . '/' . str_replace('/', DIRECTORY_SEPARATOR, $rel);
    if (!is_file($local)) {
        fwrite(STDERR, "SKIP missing: $rel\n");
        continue;
    }
    $payload = json_encode([
        'path' => $rel,
        'content_base64' => base64_encode((string) file_get_contents($local)),
    ], JSON_UNESCAPED_SLASHES);
    $ch = curl_init($site . '/api/remote-deploy.php');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-API-Key: ' . $apiKey],
        CURLOPT_TIMEOUT => 300,
        CURLOPT_CONNECTTIMEOUT => 60,
    ]);
    $out = (string) curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    echo "$rel HTTP $code $out\n";
    if ($code < 200 || $code >= 300) {
        $fail = true;
    }
}
if ($fail) {
    exit(1);
}
echo "OK pix-key-types deploy\n";
