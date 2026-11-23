<?php
declare(strict_types=1);

/**
 * partner-cadastro.php — endpoint público da landing /cadastro (Seja Parceiro).
 * Recebe POST JSON do formulário, valida campos e grava em `partners`
 * com meta.status=analise (sem criar login ainda — master ativa depois).
 */

require_once __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    soublu_json(['ok' => false, 'error' => 'Método não permitido.'], 405);
}

$raw = file_get_contents('php://input');
$data = json_decode((string) $raw, true);
if (!is_array($data)) {
    soublu_json(['ok' => false, 'error' => 'JSON inválido.'], 400);
}

function cad_digits(string $s): string
{
    return preg_replace('/\D+/', '', $s) ?? '';
}

function cad_str($v, int $max = 200): string
{
    $s = trim(preg_replace('/[\x00-\x1F\x7F]/', '', (string) ($v ?? '')) ?? '');
    if (function_exists('mb_substr')) {
        return mb_substr($s, 0, $max);
    }
    return substr($s, 0, $max);
}

function cad_boolish($v): string
{
    $s = strtoupper(trim((string) ($v ?? '')));
    if (in_array($s, ['SIM', 'S', '1', 'TRUE', 'YES'], true)) return 'SIM';
    if (in_array($s, ['NAO', 'NÃO', 'N', '0', 'FALSE', 'NO'], true)) return 'NÃO';
    return $s !== '' ? $s : '';
}

$cnpj = cad_digits((string) ($data['cnpj'] ?? ''));
$contatoComercial = cad_str($data['contato_comercial'] ?? '', 120);
$whatsapp = cad_digits((string) ($data['contato_whatsapp'] ?? ''));
$emailComercial = strtolower(cad_str($data['email_comercial'] ?? '', 160));
$emailFinanceiro = strtolower(cad_str($data['email_financeiro'] ?? '', 160));
$horario = cad_str($data['melhor_horario'] ?? '', 80);
$trabalhaComercial = cad_boolish($data['trabalha_area_comercial'] ?? '');
$enderecoFisico = cad_boolish($data['possui_endereco_fisico'] ?? '');
$mercadoCredito = cad_boolish($data['trabalhou_mercado_credito'] ?? '');
$testemunha = cad_str($data['testemunha'] ?? '', 120);
$cpfTestemunha = cad_digits((string) ($data['cpf_testemunha'] ?? ''));
$aceitouTermos = !empty($data['aceitou_termos']);
$razao = cad_str($data['razao_social'] ?? '', 200);
$endereco = cad_str($data['endereco'] ?? '', 300);
$representante = cad_str($data['representante_legal'] ?? '', 120);
$fonteDataRaw = is_array($data['fontedata'] ?? null) ? $data['fontedata'] : null;

if (strlen($cnpj) !== 14) {
    soublu_json(['ok' => false, 'error' => 'Informe um CNPJ válido (14 dígitos).'], 400);
}
if ($contatoComercial === '') {
    soublu_json(['ok' => false, 'error' => 'Informe o contato comercial.'], 400);
}
if (strlen($whatsapp) < 10 || strlen($whatsapp) > 13) {
    soublu_json(['ok' => false, 'error' => 'Informe um WhatsApp válido com DDD.'], 400);
}
if ($emailComercial === '' || !filter_var($emailComercial, FILTER_VALIDATE_EMAIL)) {
    soublu_json(['ok' => false, 'error' => 'Informe um e-mail comercial válido.'], 400);
}
if ($emailFinanceiro !== '' && !filter_var($emailFinanceiro, FILTER_VALIDATE_EMAIL)) {
    soublu_json(['ok' => false, 'error' => 'E-mail financeiro inválido.'], 400);
}
if (!$aceitouTermos) {
    soublu_json(['ok' => false, 'error' => 'É necessário ler e aceitar os termos.'], 400);
}
if ($cpfTestemunha !== '' && strlen($cpfTestemunha) !== 11) {
    soublu_json(['ok' => false, 'error' => 'CPF da testemunha inválido.'], 400);
}

try {
    $pdo = soublu_pdo();
} catch (Throwable $e) {
    soublu_json(['ok' => false, 'error' => 'Serviço indisponível. Tente novamente em instantes.'], 503);
}

/** Garante tabela partners (já existe no sistema; CREATE IF NOT EXISTS é seguro). */
$pdo->exec(
    "CREATE TABLE IF NOT EXISTS `partners` (
      `id` VARCHAR(64) NOT NULL,
      `user_id` VARCHAR(64) NULL,
      `cnpj` VARCHAR(32) NULL,
      `razao_social` VARCHAR(255) NULL,
      `endereco` TEXT NULL,
      `contato` VARCHAR(120) NULL,
      `email` VARCHAR(160) NULL,
      `permissions` JSON NULL,
      `meta` JSON NULL,
      `active` TINYINT(1) NOT NULL DEFAULT 0,
      `created_at` DATETIME NULL,
      PRIMARY KEY (`id`),
      KEY `idx_partners_cnpj` (`cnpj`),
      KEY `idx_partners_user` (`user_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
);

/** Rate limit simples: mesmo CNPJ a cada 2 minutos. */
$stRecent = $pdo->prepare(
    "SELECT id, created_at FROM partners
     WHERE cnpj = ? AND created_at >= (NOW() - INTERVAL 2 MINUTE)
     ORDER BY created_at DESC LIMIT 1"
);
$stRecent->execute([$cnpj]);
if ($stRecent->fetch(PDO::FETCH_ASSOC)) {
    soublu_json(['ok' => false, 'error' => 'Cadastro já enviado há pouco. Aguarde alguns minutos.'], 429);
}

$id = 'PRT-LEAD-' . date('YmdHis') . '-' . substr(bin2hex(random_bytes(4)), 0, 8);
$now = date('Y-m-d H:i:s');
$meta = [
    'status' => 'analise',
    'source' => 'landing_cadastro',
    'compliance_aprovado' => false,
    'contato_comercial' => $contatoComercial,
    'contato_whatsapp' => $whatsapp,
    'email_comercial' => $emailComercial,
    'email_financeiro' => $emailFinanceiro,
    'melhor_horario' => $horario,
    'trabalha_area_comercial' => $trabalhaComercial,
    'possui_endereco_fisico' => $enderecoFisico,
    'trabalhou_mercado_credito' => $mercadoCredito,
    'testemunha' => $testemunha,
    'cpf_testemunha' => $cpfTestemunha,
    'representante_legal' => $representante,
    'aceitou_termos_em' => $now,
    'ip' => cad_str($_SERVER['REMOTE_ADDR'] ?? '', 64),
    'user_agent' => cad_str($_SERVER['HTTP_USER_AGENT'] ?? '', 240),
];
if ($fonteDataRaw) {
    $meta['fontedata_resumo'] = [
        'razao_social' => cad_str($fonteDataRaw['razao_social'] ?? '', 200),
        'situacao' => cad_str($fonteDataRaw['situacao'] ?? '', 80),
        'consulta' => cad_str($fonteDataRaw['consulta'] ?? '', 40),
    ];
}

$ins = $pdo->prepare(
    'INSERT INTO partners
      (id, user_id, cnpj, razao_social, endereco, contato, email, permissions, meta, active, created_at)
     VALUES
      (:id, NULL, :cnpj, :razao, :endereco, :contato, :email, :perms, :meta, 0, :created)'
);

$ins->execute([
    ':id' => $id,
    ':cnpj' => $cnpj,
    ':razao' => $razao !== '' ? $razao : ('CNPJ ' . $cnpj),
    ':endereco' => $endereco,
    ':contato' => $whatsapp,
    ':email' => $emailComercial,
    ':perms' => json_encode(new stdClass(), JSON_UNESCAPED_UNICODE),
    ':meta' => json_encode($meta, JSON_UNESCAPED_UNICODE),
    ':created' => $now,
]);

soublu_json([
    'ok' => true,
    'id' => $id,
    'message' => 'Cadastro enviado! Nossa equipe entrará em contato.',
]);
