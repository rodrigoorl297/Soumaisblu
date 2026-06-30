<?php
declare(strict_types=1);
/**
 * Varredura do sistema — grava NDJSON em debug-97c411.log
 * Uso: php scripts/system-audit.php
 */
$root = dirname(__DIR__);
$logFile = $root . '/debug-97c411.log';
$sessionId = '97c411';
$baseUrl = 'http://127.0.0.1:8080';

function audit_log(string $hypothesisId, string $location, string $message, array $data = [], string $runId = 'audit-1'): void
{
    global $logFile, $sessionId;
    $entry = json_encode([
        'sessionId' => $sessionId,
        'hypothesisId' => $hypothesisId,
        'location' => $location,
        'message' => $message,
        'data' => $data,
        'timestamp' => (int) (microtime(true) * 1000),
        'runId' => $runId,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    file_put_contents($logFile, $entry . PHP_EOL, FILE_APPEND);
}

@unlink($logFile);

$issues = [];
$fixes = [];

// H-A: whatsapp_api uses Evolution (not simulation stub)
$waApi = file_get_contents($root . '/api/whatsapp_api.php') ?: '';
$isStub = str_contains($waApi, 'simulate-connect') || (str_contains($waApi, 'wa_connections') && !str_contains($waApi, 'EvolutionClient'));
$hasEvolution = str_contains($waApi, 'EvolutionClient') && str_contains($waApi, 'WhatsAppRepository');
audit_log('A', 'system-audit.php:wa', 'whatsapp_api type', [
    'is_stub' => $isStub,
    'has_evolution' => $hasEvolution,
]);
if ($isStub || !$hasEvolution) {
    $issues[] = ['id' => 'WA-API-STUB', 'severity' => 'critical', 'msg' => 'api/whatsapp_api.php não usa Evolution API'];
}

// H-B: migrate-whatsapp schema mismatch
$migrate = file_get_contents($root . '/api/migrate-whatsapp.php') ?: '';
$wrongSchema = str_contains($migrate, 'wa_connections') && !str_contains($migrate, 'whatsapp_instances');
audit_log('B', 'system-audit.php:migrate', 'migrate-whatsapp schema', [
    'uses_wa_connections' => str_contains($migrate, 'wa_connections'),
    'uses_whatsapp_instances' => str_contains($migrate, 'whatsapp_instances'),
]);
if ($wrongSchema) {
    $issues[] = ['id' => 'WA-SCHEMA', 'severity' => 'critical', 'msg' => 'migrate-whatsapp.php cria wa_* mas WhatsAppRepository usa whatsapp_*'];
}

// H-C: pages/whatsapp.html stale / monitoramento dead code
$waPage = file_get_contents($root . '/pages/whatsapp.html') ?: '';
$hasMonitor = str_contains($waPage, 'waMonitorContainer');
$oldCache = str_contains($waPage, 'whatsapp-chat.js?v=10');
audit_log('C', 'system-audit.php:wa-page', 'whatsapp.html consistency', [
    'has_monitoramento' => $hasMonitor,
    'old_cache_v10' => $oldCache,
    'has_thread_css' => str_contains($waPage, 'wa-thread-only'),
]);
if ($hasMonitor) {
    $issues[] = ['id' => 'WA-PAGE-MONITOR', 'severity' => 'medium', 'msg' => 'pages/whatsapp.html ainda referencia Monitoramento removido'];
}
if ($oldCache) {
    $issues[] = ['id' => 'WA-PAGE-CACHE', 'severity' => 'low', 'msg' => 'pages/whatsapp.html com cache antigo (v=10/v=2)'];
}

// H-D: missing JS files referenced in main HTML
$htmlFiles = ['index.html', 'admin.html', 'employee.html', 'financeiro.html', 'pages/admin.html', 'pages/employee.html', 'pages/financeiro.html', 'pages/whatsapp.html', 'pages/rh-manager.html'];
$missingJs = [];
foreach ($htmlFiles as $rel) {
    $path = $root . '/' . str_replace('/', DIRECTORY_SEPARATOR, $rel);
    if (!is_file($path)) continue;
    $html = file_get_contents($path);
    if (preg_match_all('/src=["\']([^"\']+\.js[^"\']*)["\']/', $html, $m)) {
        foreach ($m[1] as $src) {
            if (preg_match('#^https?://#', $src)) continue;
            $clean = preg_replace('/\?.*$/', '', $src);
            $resolved = $clean;
            if (str_starts_with($clean, '/')) {
                $resolved = $root . $clean;
            } else {
                $dir = dirname($path);
                $resolved = $dir . DIRECTORY_SEPARATOR . $clean;
                // HTML na raiz: ../js/ no navegador resolve para /js/ (equivalente a js/ na raiz)
                if (!is_file($resolved) && str_starts_with($clean, '../')) {
                    $alt = $root . DIRECTORY_SEPARATOR . substr($clean, 3);
                    if (is_file($alt)) {
                        $resolved = $alt;
                    }
                }
            }
            if (!is_file($resolved)) {
                $missingJs[] = ['html' => $rel, 'src' => $src];
            }
        }
    }
}
audit_log('D', 'system-audit.php:js-refs', 'missing script refs', ['count' => count($missingJs), 'samples' => array_slice($missingJs, 0, 8)]);
if ($missingJs) {
    $issues[] = ['id' => 'JS-MISSING', 'severity' => 'high', 'msg' => count($missingJs) . ' referências JS quebradas em HTML'];
}

// H-E: API JSON purity (rest index)
$ch = curl_init($baseUrl . '/api/rest/index.php');
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_HEADER => true]);
$raw = curl_exec($ch);
$code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);
$jsonOk = false;
$hasPhpWarn = false;
if ($raw !== false) {
    $parts = explode("\r\n\r\n", $raw, 2);
    $body = $parts[1] ?? $raw;
    $hasPhpWarn = str_contains($body, '<br />') || str_contains($body, 'Warning:') || str_contains($body, 'Notice:');
    $jsonOk = json_decode(trim($body)) !== null;
}
audit_log('E', 'system-audit.php:rest', 'REST API response', [
    'http' => $code,
    'curl_error' => $err ?: null,
    'json_ok' => $jsonOk,
    'php_warnings_in_body' => $hasPhpWarn,
    'server_reachable' => $raw !== false,
]);
if ($err) {
    $issues[] = ['id' => 'SERVER-DOWN', 'severity' => 'high', 'msg' => 'Servidor local não responde em :8080 — ' . $err];
}
if ($hasPhpWarn) {
    $issues[] = ['id' => 'PHP-WARN-JSON', 'severity' => 'high', 'msg' => 'API REST retorna warnings PHP no corpo (quebra JSON)'];
}

// DB methods check
$dbJs = file_get_contents($root . '/js/db.js') ?: '';
$requiredDb = ['getMonitoriaAtendimentos', 'saveMonitoriaAtendimento', 'deleteMonitoriaAtendimento'];
$missingDb = array_values(array_filter($requiredDb, fn($fn) => !str_contains($dbJs, "async $fn(") && !str_contains($dbJs, "async {$fn}(")));
audit_log('E', 'system-audit.php:db', 'db.js monitoria methods', ['missing' => $missingDb]);

// Temp clutter files
$clutter = [];
foreach (['_fetch_wa_page.html', '_fetch_wa_kanban.js', 'fix_stages.php', 'old_whatsapp.txt', 'extracted.txt'] as $f) {
    if (is_file($root . '/' . $f)) $clutter[] = $f;
}
audit_log('D', 'system-audit.php:clutter', 'temp files in root', ['files' => $clutter]);

audit_log('SUMMARY', 'system-audit.php:end', 'audit complete', [
    'issue_count' => count($issues),
    'issues' => $issues,
    'clutter_files' => $clutter,
]);

echo json_encode(['ok' => true, 'issues' => $issues, 'log' => $logFile], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
