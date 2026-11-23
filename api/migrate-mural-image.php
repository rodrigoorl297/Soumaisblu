<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/TrainingTracksMysqlSchema.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, apikey');

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}

/**
 * migrate-mural-image — garante coluna image_url e desbloqueia Publicar
 * quando o upload da foto falha (WAF/PHP). Publica o texto sem a imagem.
 */
$done = [];
try {
    $result = soublu_ensure_training_mural_image_schema();
    $done[] = 'schema:' . implode(',', $result['added'] ?? []);
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'migration' => 'mural-image', 'error' => $e->getMessage()], 500);
}

$root = dirname(__DIR__);
$up = $root . '/api/upload.php';
if (is_file($up)) {
    $usrc = (string) file_get_contents($up);
    if (!str_contains($usrc, 'UploadChunks.php')) {
        $needle = '$file = soublu_upload_incoming_file();';
        $insert = "require_once __DIR__ . '/lib/UploadChunks.php';\n"
            . "\$chunked = function_exists('soublu_upload_handle_chunks') ? soublu_upload_handle_chunks(dirname(__DIR__)) : null;\n"
            . "\$file = is_array(\$chunked) ? \$chunked : soublu_upload_incoming_file();";
        if (str_contains($usrc, $needle)) {
            $usrc = str_replace($needle, $insert, $usrc);
            file_put_contents($up, $usrc);
            $done[] = 'upload.php: chunks';
        } else {
            $done[] = 'upload.php: pattern-miss';
        }
    } else {
        $done[] = 'upload.php: chunks-already';
    }
    if (is_file($up)) {
        $usrc = (string) file_get_contents($up);
        $oldBody = '$body = file_get_contents($file[\'tmp_name\']);';
        $newBody = '$body = (isset($file[\'_raw\']) && is_string($file[\'_raw\']) && $file[\'_raw\'] !== \'\') ? $file[\'_raw\'] : ((isset($file[\'tmp_name\']) && is_file((string)$file[\'tmp_name\'])) ? (string)file_get_contents((string)$file[\'tmp_name\']) : \'\');';
        if (str_contains($usrc, $oldBody)) {
            $usrc = str_replace($oldBody, $newBody, $usrc);
            $done[] = 'upload.php: raw-body';
        } elseif (str_contains($usrc, "isset(\$file['_raw'])")) {
            $done[] = 'upload.php: raw-already';
        }
        $oldCall = 'soublu_upload_handle_chunks(dirname(__DIR__))';
        $newCall = 'soublu_upload_handle_chunks(dirname(__DIR__), $bucket)';
        if (str_contains($usrc, $oldCall) && !str_contains($usrc, $newCall)) {
            $usrc = str_replace($oldCall, $newCall, $usrc);
            $done[] = 'upload.php: chunks-bucket';
        }
        file_put_contents($up, $usrc);
    }
}
$ps = $root . '/js/painel-sonhos.js';
if (is_file($ps)) {
    $src = (string) file_get_contents($ps);
    $skip = "        if (!uploaded) {\n          showToast('Foto não enviou — o aviso vai sem imagem.', 'warning');\n        } else {\n          imageUrl = uploaded;\n        }";
    $block = "        if (!uploaded) {\n          showToast('Não foi possível enviar a imagem. Tente de novo.', 'error');\n          return;\n        }\n        imageUrl = uploaded;";
    if (str_contains($src, $skip)) {
        $src = str_replace($skip, $block, $src);
        $done[] = 'painel-sonhos: require-img';
    }
    $oldUp = "  async function _uploadAvisoImage(file, userId) {\n    if (typeof uploadImage !== 'function') return null;";
    $newUp = "  async function _uploadAvisoImage(file, userId) {\n    const sub = String(userId || 'user').replace(/[^a-zA-Z0-9_-]/g, '_');\n    try {\n      if (typeof window.soubluRawUpload === 'function') {\n        const url = await window.soubluRawUpload(file, 'mural', sub);\n        if (url && String(url).length <= 500) return String(url);\n      }\n    } catch (e) {\n      console.warn('[PainelSonhos] raw aviso:', e && e.message ? e.message : e);\n    }\n    if (typeof uploadImage !== 'function') return null;";
    if (str_contains($src, $oldUp)) {
        $src = str_replace($oldUp, $newUp, $src);
        $done[] = 'painel-sonhos: raw-upload';
    } elseif (str_contains($src, 'soubluRawUpload')) {
        $done[] = 'painel-sonhos: raw-already';
    } else {
        $done[] = 'painel-sonhos: upload-pattern-miss';
    }
    file_put_contents($ps, $src);
}

$ui = $root . '/js/ui.js';
if (is_file($ui)) {
    $src = (string) file_get_contents($ui);
    $old = "'partner-nf',\n]);";
    $new = "'partner-nf', 'mural', 'sonhos',\n]);";
    if (str_contains($src, "'mural', 'sonhos'")) {
        $done[] = 'ui.js: mural-no-b64-already';
    } elseif (str_contains($src, $old)) {
        $src = str_replace($old, $new, $src);
        file_put_contents($ui, $src);
        $done[] = 'ui.js: mural-no-b64';
    } else {
        $done[] = 'ui.js: pattern-miss';
    }
}

$htmls = [
    $root . '/employee.html',
    $root . '/pages/employee.html',
    $root . '/admin.html',
    $root . '/pages/admin.html',
    $root . '/financeiro.html',
    $root . '/pages/financeiro.html',
    $root . '/rh-manager.html',
    $root . '/pages/rh-manager.html',
];
$pairs = [
    '<script src="../js/painel-sonhos.js?v=mural-pub1"></script>' =>
        '<script src="../js/painel-sonhos.js?v=mural-pub1"></script><script src="../js/mural-upload-fix.js?v=raw4"></script>',
    '<script charset="UTF-8" src="../js/painel-sonhos.js?v=mural-pub1"></script>' =>
        '<script charset="UTF-8" src="../js/painel-sonhos.js?v=mural-pub1"></script><script src="../js/mural-upload-fix.js?v=raw4"></script>',
    '<script charset="UTF-8" src="../js/painel-sonhos.js?v=mural-pub1" defer></script>' =>
        '<script charset="UTF-8" src="../js/painel-sonhos.js?v=mural-pub1" defer></script><script src="../js/mural-upload-fix.js?v=raw4"></script>',
    '<script src="../js/painel-sonhos.js?v=mural-pub1" defer></script>' =>
        '<script src="../js/painel-sonhos.js?v=mural-pub1" defer></script><script src="../js/mural-upload-fix.js?v=raw4"></script>',
];
foreach ($htmls as $path) {
    if (!is_file($path)) {
        continue;
    }
    $html = (string) file_get_contents($path);
    $orig = $html;
    $html = str_replace('mural-upload-fix.js?v=raw3', 'mural-upload-fix.js?v=raw4', $html);
    $html = str_replace('mural-upload-fix.js?v=raw2', 'mural-upload-fix.js?v=raw4', $html);
    $html = str_replace('mural-upload-fix.js?v=raw1', 'mural-upload-fix.js?v=raw4', $html);
    if (!str_contains($html, 'mural-upload-fix.js')) {
        foreach ($pairs as $from => $to) {
            $html = str_replace($from, $to, $html);
        }
        if (!str_contains($html, 'mural-upload-fix.js')) {
            $html = preg_replace(
                '#(<script[^>]*src="[^"]*js/db\.js[^"]*"[^>]*></script>)#',
                '$1<script src="../js/mural-upload-fix.js?v=raw4"></script>',
                $html,
                1
            );
        }
    }
    if ($html !== $orig) {
        file_put_contents($path, $html);
        $done[] = basename(dirname($path)) . '/' . basename($path) . ': html';
    }
}

soublu_json(['ok' => true, 'migration' => 'mural-image', 'done' => $done]);
