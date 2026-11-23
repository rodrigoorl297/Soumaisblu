<?php
declare(strict_types=1);

/**
 * server-inventory — lista arquivos do public_html e classifica lixo vs produção.
 * GET ?action=list   — inventário
 * POST ?action=purge — apaga paths da lista "junk" (confirm=1 + paths[])
 */
require_once __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado'], 401);
}

$root = realpath(dirname(__DIR__));
if ($root === false) {
    soublu_json(['ok' => false, 'error' => 'root invalido'], 500);
}

/**
 * classify — marca arquivo/pasta como keep|junk|review.
 */
function soublu_inv_classify(string $rel, bool $isDir): string
{
    $rel = str_replace('\\', '/', $rel);
    $base = basename($rel);
    $lower = strtolower($rel);

    // Produção / configs / dados — nunca sugerir purge automático
    $keepExact = [
        '.htaccess', 'index.html', 'admin.html', 'employee.html', 'financeiro.html',
        'leads-manager.html', 'leads-employee.html', 'rh-manager.html', 'whatsapp.html',
        'package.json',
    ];
    if (in_array($base, $keepExact, true)) {
        return 'keep';
    }
    // Lixo dentro de pastas de produção (antes do keep genérico).
    if ($base === 'rh-manager.pretty.html' || str_ends_with($rel, '/rh-manager.pretty.html')) {
        return 'junk';
    }
    if ($rel === 'api/migrate-rh-justificativa.php') {
        return 'junk';
    }
    // Monitoria / Clube de Benefícios — módulos nunca usados
    if (preg_match('#(^|/)(monitoria-atendimento|monitoramento)\.(html|js|css)$#i', $rel)) {
        return 'junk';
    }
    if ($rel === 'api/migrate-monitoria-atendimento.php') {
        return 'junk';
    }
    if (preg_match('#(^|/)clube-beneficios\.html$#i', $rel) || preg_match('#(^|/)beneficios\.html$#i', $rel)) {
        return 'junk';
    }

    if (preg_match('#^(api|js|css|pages|images|uploads|storage|certs)/#', $rel . ($isDir ? '/' : ''))) {
        // Dentro de api: migrações one-shot / diag = junk
        if (preg_match('#^api/(diag-|migrate-leads-|probe-|_diag|_probe)#i', $rel)) {
            return 'junk';
        }
        if (preg_match('#^api/migrate-tabelas-(fitech|futuro)\.php$#i', $rel)) {
            return 'junk';
        }
        if (preg_match('#^api/migrate-hide-teste\.php$#i', $rel)) {
            return 'junk';
        }
        return 'keep';
    }
    if (preg_match('#^config\..+\.local\.php$#i', $base)) {
        return 'keep'; // necessário runtime; htaccess já bloqueia
    }
    if ($base === '.env' || $base === 'config.php') {
        return 'keep';
    }

    // Lixo claro
    if ($base[0] === '_' || str_starts_with($base, '_')) {
        return 'junk';
    }
    if (preg_match('/\.(bak|old|tmp|log|swp)$/i', $base)) {
        return 'junk';
    }
    if (preg_match('/^(test[_-]|_verify|_prod|_live|_deploy|_export|_count|_list|_purge|_diag)/i', $base)) {
        return 'junk';
    }
    if ($base === 'router-dev.php' || $base === 'LEIAME.txt' || $base === 'SUPABASE.md') {
        return 'junk';
    }
    // Fragmentos / dumps mortos do RH
    if ($base === 'addEmployeeModal.html' || $base === 'rh-manager.pretty.html') {
        return 'junk';
    }
    if ($rel === 'api/migrate-rh-justificativa.php') {
        return 'junk';
    }
    // Pastas raiz de ferramenta/backup (com ou sem barra; Windows pode vir com \).
    if (preg_match('#^(scratch|docs|reports|_out|agent-tools|node_modules|mysql|scripts)([/\\\\]|$)#i', $rel)) {
        return 'junk';
    }
    // Backup antigo inteiro no public_html — não é runtime.
    if (preg_match('#^SOUBLU_deploy_#i', $rel)) {
        return 'junk';
    }
    if ($rel === '.cursor' || str_starts_with($rel, '.cursor/')) {
        return 'junk';
    }
    if ($rel === '.git' || str_starts_with($rel, '.git/')) {
        return 'junk';
    }
    if (preg_match('#^scripts/(diag-|verify-|deploy-|_deploy|_check|_diag|_bump|_clean|_compare|_e2e|_all-)#i', $rel)) {
        return 'junk';
    }
    // Quase todo scripts/ no servidor é ferramenta local de deploy/diag.
    if (preg_match('#^scripts/#', $rel) && !preg_match('#^scripts/README#i', $rel)) {
        return 'junk';
    }
    if (str_contains($lower, ' copia') || str_contains($lower, ' - copy')) {
        return 'junk';
    }

    return 'review';
}

/**
 * walk — varre árvore com limite de profundidade/arquivos.
 */
function soublu_inv_walk(string $root, string $rel, int $depth, array &$out, int &$n, int $max): void
{
    if ($n >= $max || $depth > 8) {
        return;
    }
    $dir = $rel === '' ? $root : $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel);
    $entries = @scandir($dir);
    if (!is_array($entries)) {
        return;
    }
    foreach ($entries as $name) {
        if ($name === '.' || $name === '..') {
            continue;
        }
        if ($n >= $max) {
            break;
        }
        // pular pastas pesadas de runtime
        if ($rel === '' && in_array($name, ['.git', 'node_modules', 'uploads', 'storage'], true)) {
            $out[] = [
                'path' => $name,
                'dir' => true,
                'bytes' => null,
                'class' => $name === 'uploads' || $name === 'storage' ? 'keep' : 'junk',
                'skipped' => true,
            ];
            $n++;
            continue;
        }
        $childRel = str_replace('\\', '/', $rel === '' ? $name : ($rel . '/' . $name));
        $full = $dir . DIRECTORY_SEPARATOR . $name;
        $isDir = is_dir($full);
        $bytes = $isDir ? null : (@filesize($full) ?: 0);
        $mtime = @filemtime($full) ?: null;
        $class = soublu_inv_classify($childRel, $isDir);
        $out[] = [
            'path' => $childRel,
            'dir' => $isDir,
            'bytes' => $bytes,
            'mtime' => $mtime,
            'class' => $class,
        ];
        $n++;
        if ($isDir) {
            soublu_inv_walk($root, $childRel, $depth + 1, $out, $n, $max);
        }
    }
}

$action = (string) ($_GET['action'] ?? $_POST['action'] ?? 'list');

if ($action === 'debug') {
    $probe = (string) ($_GET['path'] ?? 'scripts');
    $probe = str_replace(['\\', '..'], ['/', ''], $probe);
    $full = $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $probe);
    $entries = is_dir($full) ? (@scandir($full) ?: []) : null;
    soublu_json([
        'ok' => true,
        'root' => $root,
        'probe' => $probe,
        'full' => $full,
        'exists' => file_exists($full),
        'is_dir' => is_dir($full),
        'realpath' => realpath($full),
        'entries' => is_array($entries) ? array_values(array_diff($entries, ['.', '..'])) : null,
        'entries_count' => is_array($entries) ? max(0, count($entries) - 2) : null,
    ]);
}

/**
 * raw_purge — apaga fantasmas com \ no nome (root) e *.bak* / *.old em pastas.
 */
if ($action === 'raw_purge') {
    $raw = file_get_contents('php://input') ?: '';
    $body = json_decode($raw, true);
    if (!is_array($body) || (string) ($body['confirm'] ?? '') !== '1') {
        soublu_json(['ok' => false, 'error' => 'confirm=1'], 400);
    }

    $deleted = [];
    $skipped = [];
    $errors = [];
    $bs = chr(92); // \

    // 1) Fantasmas / bak no root
    foreach (@scandir($root) ?: [] as $name) {
        if ($name === '.' || $name === '..' || $name === '.htaccess' || $name === '.env') {
            continue;
        }
        $isGhost = str_contains($name, $bs);
        $isBak = (bool) preg_match('/\.(bak|old)(-|$)/i', $name);
        if (!$isGhost && !$isBak) {
            continue;
        }
        $full = $root . DIRECTORY_SEPARATOR . $name;
        if (!file_exists($full) || is_dir($full)) {
            $skipped[] = ['name' => $name, 'reason' => 'nao existe ou e pasta'];
            continue;
        }
        if (@unlink($full)) {
            $deleted[] = $name;
        } else {
            $errors[] = ['name' => $name, 'reason' => 'unlink falhou'];
        }
    }

    // 2) Bak em pastas de produção (não desce em uploads/storage)
    $bakDirs = ['api', 'js', 'css', 'pages', 'images', 'imagens'];
    foreach ($bakDirs as $dirName) {
        $dir = $root . DIRECTORY_SEPARATOR . $dirName;
        if (!is_dir($dir)) {
            continue;
        }
        foreach (@scandir($dir) ?: [] as $name) {
            if ($name === '.' || $name === '..') {
                continue;
            }
            if (!preg_match('/\.(bak|old)(-|$)/i', $name)) {
                continue;
            }
            $full = $dir . DIRECTORY_SEPARATOR . $name;
            if (!is_file($full)) {
                continue;
            }
            $rel = $dirName . '/' . $name;
            if (@unlink($full)) {
                $deleted[] = $rel;
            } else {
                $errors[] = ['name' => $rel, 'reason' => 'unlink falhou'];
            }
        }
    }

    soublu_json([
        'ok' => true,
        'deleted_count' => count($deleted),
        'deleted_sample' => array_slice($deleted, 0, 40),
        'deleted' => $deleted,
        'skipped' => $skipped,
        'errors' => $errors,
    ]);
}

if ($action === 'list') {
    $files = [];
    $n = 0;
    soublu_inv_walk($root, '', 0, $files, $n, 8000);
    $summary = ['keep' => 0, 'junk' => 0, 'review' => 0, 'bytes_junk' => 0];
    foreach ($files as $f) {
        $c = $f['class'] ?? 'review';
        if (!isset($summary[$c])) {
            $summary[$c] = 0;
        }
        $summary[$c]++;
        if ($c === 'junk' && !empty($f['bytes'])) {
            $summary['bytes_junk'] += (int) $f['bytes'];
        }
    }
    $junk = array_values(array_filter($files, static fn($f) => ($f['class'] ?? '') === 'junk'));
    usort($junk, static fn($a, $b) => strcmp($a['path'], $b['path']));
    soublu_json([
        'ok' => true,
        'root' => $root,
        'total' => count($files),
        'summary' => $summary,
        'junk' => $junk,
        'review' => array_values(array_filter($files, static fn($f) => ($f['class'] ?? '') === 'review')),
    ]);
}

if ($action === 'purge') {
    $raw = file_get_contents('php://input') ?: '';
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        $body = $_POST;
    }
    $confirm = (string) ($body['confirm'] ?? '') === '1';
    if (!$confirm) {
        soublu_json(['ok' => false, 'error' => 'Passe confirm=1'], 400);
    }
    $paths = $body['paths'] ?? null;
    if (!is_array($paths)) {
        soublu_json(['ok' => false, 'error' => 'paths[] obrigatorio'], 400);
    }

    $deleted = [];
    $skipped = [];
    $errors = [];

    foreach ($paths as $p) {
        $rel = str_replace('\\', '/', trim((string) $p));
        $rel = ltrim($rel, '/');
        if ($rel === '' || str_contains($rel, '..')) {
            $skipped[] = ['path' => $rel, 'reason' => 'path invalido'];
            continue;
        }
        if (soublu_inv_classify($rel, false) !== 'junk' && soublu_inv_classify($rel, true) !== 'junk') {
            $skipped[] = ['path' => $rel, 'reason' => 'nao classificado como junk'];
            continue;
        }
        $full = $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel);
        $real = realpath($full);
        if ($real === false || !str_starts_with($real, $root)) {
            // pode já ter sido apagado, ou é arquivo sem realpath
            if (!file_exists($full)) {
                $skipped[] = ['path' => $rel, 'reason' => 'nao existe'];
                continue;
            }
            $real = $full;
        }
        if (is_dir($real)) {
            // só apaga dir se vazio ou só com lixo — por segurança, rmdir recursive limitado
            $ok = soublu_inv_rmdir($real, $root);
            if ($ok) {
                $deleted[] = $rel;
            } else {
                $errors[] = ['path' => $rel, 'reason' => 'falha ao remover pasta'];
            }
            continue;
        }
        if (@unlink($real)) {
            $deleted[] = $rel;
        } else {
            $errors[] = ['path' => $rel, 'reason' => 'unlink falhou'];
        }
    }

    soublu_json([
        'ok' => true,
        'deleted' => $deleted,
        'skipped' => $skipped,
        'errors' => $errors,
        'deleted_count' => count($deleted),
    ]);
}

soublu_json(['ok' => false, 'error' => 'action invalida'], 400);

/**
 * soublu_inv_rmdir — remove pasta junk recursivamente com trava de root.
 */
function soublu_inv_rmdir(string $dir, string $root): bool
{
    $real = realpath($dir);
    if ($real === false || !str_starts_with($real, $root) || $real === $root) {
        return false;
    }
    $items = @scandir($real);
    if (!is_array($items)) {
        return false;
    }
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $path = $real . DIRECTORY_SEPARATOR . $item;
        if (is_dir($path)) {
            if (!soublu_inv_rmdir($path, $root)) {
                return false;
            }
        } else {
            if (!@unlink($path)) {
                return false;
            }
        }
    }
    return @rmdir($real);
}
