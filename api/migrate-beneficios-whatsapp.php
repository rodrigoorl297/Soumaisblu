<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/lib/BeneficiosMysqlSchema.php';

header('Content-Type: application/json; charset=utf-8');

if (!soublu_api_auth_ok()) {
    soublu_json(['ok' => false, 'error' => 'Nao autorizado.'], 401);
}

$pdo = soublu_pdo();
$applied = [];

try {
    soublu_ensure_beneficios_tables($pdo);
    $applied[] = 'ensure_tables';
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => 'ensure: ' . $e->getMessage()], 500);
}

try {
    $col = $pdo->query("SHOW COLUMNS FROM `beneficios_prestadores` LIKE 'whatsapp'")->fetch();
    if (!$col) {
        $pdo->exec('ALTER TABLE `beneficios_prestadores` ADD COLUMN `whatsapp` VARCHAR(32) NULL');
        $applied[] = 'add_whatsapp_column';
    } else {
        $applied[] = 'whatsapp_column_exists';
    }
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => 'alter: ' . $e->getMessage(), 'applied' => $applied], 500);
}

$wa = '5562991750451';
$updated = 0;
$created = false;

try {
    $st = $pdo->query("SELECT `id`, `nome_fantasia` FROM `beneficios_prestadores` WHERE `categoria` = 'Restaurante' LIMIT 20");
    $rows = $st ? $st->fetchAll(PDO::FETCH_ASSOC) : [];
    if ($rows) {
        $up = $pdo->prepare('UPDATE `beneficios_prestadores` SET `whatsapp` = ? WHERE `id` = ?');
        foreach ($rows as $row) {
            $up->execute([$wa, $row['id']]);
            $updated++;
        }
    } else {
        $id = 'ben_pre_restzs' . substr(md5((string) microtime(true)), 0, 8);
        $ins = $pdo->prepare(
            'INSERT INTO `beneficios_prestadores`
             (`id`,`codigo_parceiro`,`nome_fantasia`,`cnpj_cpf`,`chave_pix`,`dia_pagamento`,`categoria`,`pagamento_automatico`,`whatsapp`)
             VALUES (?,?,?,?,?,?,?,?,?)'
        );
        $ins->execute([
            $id,
            'PRT-RESTZS',
            'Restaurante Clube ZS Benefícios',
            '00000000000000',
            'pendente',
            5,
            'Restaurante',
            'NÃO',
            $wa,
        ]);
        $created = true;
        $updated = 1;
    }
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => 'update: ' . $e->getMessage(), 'applied' => $applied], 500);
}

soublu_json([
    'ok' => true,
    'whatsapp' => $wa,
    'updated' => $updated,
    'created' => $created,
    'applied' => $applied,
]);
