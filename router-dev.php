<?php
/**
 * Router para servidor embutido do PHP (desenvolvimento local):
 *   php -S localhost:8080 router-dev.php
 */
declare(strict_types=1);

$uri = urldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');

if (preg_match('#^/api/rest/v1/([a-zA-Z0-9_]+)/?$#', $uri, $m)) {
    $_GET['table'] = $m[1];
    require __DIR__ . '/api/rest/index.php';
    return true;
}

if ($uri === '/api/rest/v1' || str_starts_with($uri, '/api/rest/v1?')) {
    $_GET['table'] = $_GET['table'] ?? '';
    require __DIR__ . '/api/rest/index.php';
    return true;
}

if ($uri === '/api/rest-v1.php' || str_starts_with($uri, '/api/rest-v1.php')) {
    require __DIR__ . '/api/rest/index.php';
    return true;
}

$path = __DIR__ . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $uri);
if ($uri !== '/' && is_file($path)) {
    if (pathinfo($path, PATHINFO_EXTENSION) === 'html') {
        header('Cache-Control: no-cache, no-store, must-revalidate');
        header('Pragma: no-cache');
        header('Expires: 0');
    }
    return false;
}

if (preg_match('#^/([a-zA-Z0-9_-]+\.html)$#', $uri, $m)) {
    $pagesPath = __DIR__ . DIRECTORY_SEPARATOR . 'pages' . DIRECTORY_SEPARATOR . $m[1];
    if (is_file($pagesPath)) {
        header('Cache-Control: no-cache, no-store, must-revalidate');
        header('Location: /pages/' . $m[1]);
        return true;
    }
}

if ($uri === '/' || $uri === '') {
    header('Location: /index.html');
    return true;
}

return false;
