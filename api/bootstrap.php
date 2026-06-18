<?php
declare(strict_types=1);

/** Carrega config Hostinger (MySQL + chaves). */
$root = dirname(__DIR__);
foreach (['config.db.local.php', 'config.pix.local.php'] as $file) {
    $path = $root . '/' . $file;
    if (is_file($path)) {
        require_once $path;
    }
}

function soublu_pdo(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    if (!defined('DB_HOST') || !defined('DB_NAME') || !defined('DB_USER')) {
        throw new RuntimeException('config.db.local.php ausente ou incompleto.');
    }
    $charset = defined('DB_CHARSET') ? DB_CHARSET : 'utf8mb4';
    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . $charset;
    $pdo = new PDO($dsn, DB_USER, defined('DB_PASS') ? DB_PASS : '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('SET NAMES ' . (preg_match('/^[a-z0-9_]+$/', $charset) ? $charset : 'utf8mb4'));
    return $pdo;
}

function soublu_api_auth_ok(): bool
{
    $expected = defined('API_INTERNAL_KEY') ? (string) API_INTERNAL_KEY : '';
    if ($expected === '') {
        return false;
    }
    $token = $_SERVER['HTTP_X_API_KEY'] ?? '';
    if ($token === '' && function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) {
            if (strtolower((string) $k) === 'x-api-key') {
                $token = (string) $v;
                break;
            }
        }
    }
    return hash_equals($expected, (string) $token);
}

function soublu_json(array $data, int $code = 200): void
{
    if (!headers_sent()) {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Headers: Content-Type, X-API-Key, Authorization, Prefer');
        header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}
