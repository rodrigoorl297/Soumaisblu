<?php
declare(strict_types=1);
/**
 * Deploy Pix Automático (Efi Pay) — propostas de crédito.
 * Uso: php scripts/deploy-pix-automatico-credito.php
 */
$root = dirname(__DIR__);
$site = 'https://www.soumaisblu.com.br';
$key = getenv('SOUBLU_API_KEY') ?: 'soublu_api_52e8c7a6b3df4019';
$files = [
    'api/remote-deploy.php',
    'api/lib/EfiPayClient.php',
    'api/lib/EfiPayPixAutomatico.php',
    'api/credito_pix_auto_api.php',
    'js/pix-automatico-credito.js',
    'js/esteira-credito.js',
    'js/financeiro-credito.js',
    'js/proposta-credito.js',
    'js/financeiro-boot.js',
    'employee.html',
    'pages/employee.html',
    'financeiro.html',
    'pages/financeiro.html',
];

function deploy_one(string $site, string $key, string $local, string $rel, int $attempt = 1): bool
{
    $payload = json_encode([
        'path' => $rel,
        'content_base64' => base64_encode((string) file_get_contents($local)),
    ]);
    $ch = curl_init($site . '/api/remote-deploy.php');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-API-Key: ' . $key],
        CURLOPT_TIMEOUT => 300,
        CURLOPT_CONNECTTIMEOUT => 60,
    ]);
    $out = (string) curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    echo "$rel HTTP $code $out\n";
    if ($code === 200) {
        return true;
    }
    if ($attempt < 3) {
        sleep(2 * $attempt);
        return deploy_one($site, $key, $local, $rel, $attempt + 1);
    }
    return false;
}

foreach ($files as $rel) {
    $local = $root . '/' . str_replace('/', DIRECTORY_SEPARATOR, $rel);
    if (!is_file($local)) {
        fwrite(STDERR, "MISSING: $local\n");
        exit(1);
    }
    if (!deploy_one($site, $key, $local, $rel)) {
        exit(1);
    }
}
echo "OK pix-automatico-credito deploy\n";
