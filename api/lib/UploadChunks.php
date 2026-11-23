<?php
declare(strict_types=1);

/**
 * soublu_upload_handle_chunks — junta pedaços de até ~16KB.
 * Documentos de proposta/RH passam de 4MB; o mural continua no limite menor.
 */
function soublu_upload_handle_chunks(string $siteRoot, string $bucket = 'misc'): ?array
{
    $chunks = (int) ($_GET['chunks'] ?? 0);
    $chunk = (int) ($_GET['chunk'] ?? -1);
    $id = preg_replace('/[^a-f0-9]/', '', strtolower((string) ($_GET['upload_id'] ?? ''))) ?? '';
    $docBuckets = [
        'proposal-attachments', 'partner-docs', 'tim-docs', 'contestacao-docs',
        'finance-docs', 'ticket-docs', 'rh-docs', 'rh-justificativa', 'rh-demissao',
        'docs', 'trainings', 'trainings-media',
    ];
    $maxChunks = in_array($bucket, $docBuckets, true) ? 4500 : 400;
    if ($chunks < 2 || $chunk < 0 || $chunk >= $chunks || strlen($id) < 16 || $chunks > $maxChunks) {
        return null;
    }
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        soublu_json(['ok' => false, 'error' => 'Chunk vazio.', 'chunk' => $chunk], 400);
    }
    if (strlen($raw) > 20000) {
        soublu_json(['ok' => false, 'error' => 'Chunk grande demais.'], 400);
    }
    $dir = rtrim(str_replace('\\', '/', $siteRoot), '/') . '/uploads/_chunks/' . $id;
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        soublu_json(['ok' => false, 'error' => 'Falha ao criar pasta de chunks.'], 500);
    }
    $part = $dir . '/' . str_pad((string) $chunk, 4, '0', STR_PAD_LEFT) . '.part';
    if (file_put_contents($part, $raw) === false) {
        soublu_json(['ok' => false, 'error' => 'Falha ao gravar chunk.'], 500);
    }
    if ($chunk !== $chunks - 1) {
        soublu_json(['ok' => true, 'chunk' => $chunk, 'pending' => true]);
    }
    $buf = '';
    for ($i = 0; $i < $chunks; $i++) {
        $p = $dir . '/' . str_pad((string) $i, 4, '0', STR_PAD_LEFT) . '.part';
        if (!is_file($p)) {
            soublu_json(['ok' => false, 'error' => 'Chunk faltando: ' . $i], 400);
        }
        $buf .= (string) file_get_contents($p);
    }
    $maxBytes = match (true) {
        $bucket === 'proposal-attachments' => 50 * 1024 * 1024,
        in_array($bucket, $docBuckets, true) => 25 * 1024 * 1024,
        default => 4 * 1024 * 1024,
    };
    if (strlen($buf) > $maxBytes) {
        soublu_json(['ok' => false, 'error' => 'Arquivo maior que o permitido no upload fatiado.'], 400);
    }
    foreach (glob($dir . '/*.part') ?: [] as $old) {
        @unlink($old);
    }
    @rmdir($dir);
    $name = rawurldecode((string) ($_GET['filename'] ?? $_SERVER['HTTP_X_FILE_NAME'] ?? 'foto.png'));
    $name = preg_replace('/[^\w.\- ()]+/u', '_', $name) ?: 'upload.bin';
    $ct = strtolower(trim(explode(';', (string) ($_SERVER['CONTENT_TYPE'] ?? ''), 2)[0]));
    return [
        'name' => $name,
        'type' => $ct !== '' ? $ct : 'application/octet-stream',
        'tmp_name' => '',
        'error' => UPLOAD_ERR_OK,
        'size' => strlen($buf),
        '_raw' => $buf,
    ];
}
