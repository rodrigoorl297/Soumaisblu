<?php
declare(strict_types=1);

/**
 * lp-admin.php — helpers do kanban/landing (token, tabela lp_parceiros, sync).
 * Separado de parceiros.php para o deploy na Locaweb não barrar arquivo grande.
 */

/** lpAdminToken — senha do kanban. LP_ADMIN_TOKEN ou API_INTERNAL_KEY. */
function lpAdminToken(): string
{
    if (defined('LP_ADMIN_TOKEN') && trim((string) LP_ADMIN_TOKEN) !== '') {
        return (string) LP_ADMIN_TOKEN;
    }
    return defined('API_INTERNAL_KEY') ? (string) API_INTERNAL_KEY : '';
}

/**
 * lpIncomingToken — lê o token por header, Bearer ou ?token=.
 * CGI da Locaweb costuma apagar X-Admin-Token.
 */
function lpIncomingToken(): string
{
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $fromHeader = static function (array $headers, string $name): string {
        foreach ($headers as $key => $value) {
            if (strtolower((string) $key) === $name) {
                return trim((string) $value);
            }
        }
        return '';
    };

    $token = $fromHeader($headers, 'x-admin-token');
    if ($token === '') {
        $token = $fromHeader($headers, 'x-api-key');
    }
    if ($token === '') {
        $token = trim((string) ($_SERVER['HTTP_X_ADMIN_TOKEN'] ?? $_SERVER['REDIRECT_HTTP_X_ADMIN_TOKEN'] ?? ''));
    }
    if ($token === '') {
        $token = trim((string) ($_SERVER['HTTP_X_API_KEY'] ?? $_SERVER['REDIRECT_HTTP_X_API_KEY'] ?? ''));
    }
    if ($token === '') {
        $auth = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        if (preg_match('/Bearer\s+(\S+)/i', $auth, $m)) {
            $token = trim($m[1]);
        }
    }
    if ($token === '') {
        $token = trim((string) ($_GET['token'] ?? $_GET['apikey'] ?? ''));
    }
    return $token;
}

/** lpRequireAdmin — 401 se o token não bater (hash_equals). */
function lpRequireAdmin(): void
{
    $expected = trim(lpAdminToken());
    $token = lpIncomingToken();
    if ($expected === '' || $token === '' || !hash_equals($expected, $token)) {
        soublu_json(['ok' => false, 'error' => 'Não autorizado.'], 401);
    }
}

/** lpEnsureTable — cria lp_parceiros e tenta AUTO_INCREMENT. */
function lpEnsureTable(PDO $pdo): void
{
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS lp_parceiros (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          created_at VARCHAR(40) NOT NULL,
          name VARCHAR(255) NOT NULL,
          document VARCHAR(32) NOT NULL,
          commercial_phone VARCHAR(32) NOT NULL,
          whatsapp_phone VARCHAR(32) DEFAULT \'\',
          commercial_email VARCHAR(255) NOT NULL,
          financial_email VARCHAR(255) DEFAULT \'\',
          city VARCHAR(255) DEFAULT \'\',
          contact_time VARCHAR(64) DEFAULT \'\',
          works_commercial VARCHAR(16) DEFAULT \'\',
          has_address VARCHAR(16) DEFAULT \'\',
          credit_experience VARCHAR(16) DEFAULT \'\',
          message TEXT,
          status VARCHAR(16) NOT NULL DEFAULT \'pendente\',
          status_updated_at VARCHAR(40) DEFAULT NULL,
          archived_at VARCHAR(40) DEFAULT NULL,
          fontedata_result LONGTEXT DEFAULT NULL,
          fontedata_consultado_em VARCHAR(40) DEFAULT NULL,
          soublu_user_id VARCHAR(64) DEFAULT NULL,
          soublu_temp_password VARCHAR(64) DEFAULT NULL,
          soublu_synced_at VARCHAR(40) DEFAULT NULL,
          soublu_error TEXT DEFAULT NULL,
          PRIMARY KEY (id),
          KEY idx_lp_status (status),
          KEY idx_lp_document (document)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    try {
        $pdo->exec('UPDATE lp_parceiros SET id = ' . (int) round(microtime(true) * 1000) . ' WHERE id = 0');
    } catch (Throwable $e) {
        // ignora se não houver linha 0
    }
    try {
        $pdo->exec('ALTER TABLE lp_parceiros MODIFY id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT');
    } catch (Throwable $e) {
        // hosting sem ALTER
    }
    // Bases antigas: adiciona archived_at se faltar (idempotente).
    try {
        $pdo->exec('ALTER TABLE lp_parceiros ADD COLUMN archived_at VARCHAR(40) DEFAULT NULL');
    } catch (Throwable $e) {
        // coluna já existe
    }
}

/** lpNewId — id em milissegundos, único na tabela. */
function lpNewId(PDO $pdo): int
{
    for ($i = 0; $i < 8; $i++) {
        $id = (int) round(microtime(true) * 1000) + $i;
        if ($id <= 0) {
            continue;
        }
        $chk = $pdo->prepare('SELECT id FROM lp_parceiros WHERE id = ? LIMIT 1');
        $chk->execute([$id]);
        if (!$chk->fetch()) {
            return $id;
        }
        usleep(1000);
    }
    return (int) (time() . (string) random_int(100, 999));
}

function lpStr($v, int $max = 255): string
{
    $s = trim(preg_replace('/[\x00-\x1F\x7F]/', '', (string) ($v ?? '')) ?? '');
    if (function_exists('mb_substr')) {
        return mb_substr($s, 0, $max);
    }
    return substr($s, 0, $max);
}

function lpRecordFromRow(array $row): array
{
    return [
        'id' => $row['id'],
        'createdAt' => $row['created_at'],
        'name' => $row['name'],
        'document' => $row['document'],
        'commercialPhone' => $row['commercial_phone'],
        'whatsappPhone' => $row['whatsapp_phone'],
        'commercialEmail' => $row['commercial_email'],
        'financialEmail' => $row['financial_email'],
        'city' => $row['city'],
        'contactTime' => $row['contact_time'],
        'worksCommercial' => $row['works_commercial'],
        'hasAddress' => $row['has_address'],
        'creditExperience' => $row['credit_experience'],
        'message' => $row['message'],
        'status' => $row['status'],
        'archivedAt' => $row['archived_at'] ?? null,
        'statusUpdatedAt' => $row['status_updated_at'] ?? null,
        'archiveDueAt' => function_exists('partnerArchiveDueAt')
            ? (partnerArchiveDueAt($row)?->format(DATE_ATOM))
            : null,
        'fontedataResult' => !empty($row['fontedata_result']) ? json_decode((string) $row['fontedata_result'], true) : null,
        'fontedataConsultadoEm' => $row['fontedata_consultado_em'],
        'soubluUserId' => $row['soublu_user_id'],
        'soubluTempPassword' => $row['soublu_temp_password'],
        'soubluSyncedAt' => $row['soublu_synced_at'],
        'soubluError' => $row['soublu_error'],
    ];
}

/**
 * lpSyncParceiroToSoublu — cria ou vincula o acesso se ainda não houver soublu_user_id.
 */
function lpSyncParceiroToSoublu(PDO $pdo, string $id): array
{
    $stmt = $pdo->prepare('SELECT * FROM lp_parceiros WHERE id = :id');
    $stmt->execute([':id' => $id]);
    $record = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$record) {
        return ['ok' => false, 'error' => 'Cadastro não encontrado ao sincronizar.'];
    }
    if (!empty($record['soublu_user_id']) && lpSoubluUserExists($pdo, (string) $record['soublu_user_id'])) {
        return ['ok' => true, 'userId' => $record['soublu_user_id'], 'alreadyLinked' => true];
    }

    try {
        $result = lpSoubluCreateParceiro($pdo, $record);
        $upd = $pdo->prepare(
            'UPDATE lp_parceiros SET soublu_user_id = :uid, soublu_temp_password = :pwd, soublu_synced_at = :synced, soublu_error = NULL WHERE id = :id'
        );
        $upd->execute([
            ':uid' => $result['user_id'],
            ':pwd' => (string) ($result['temp_password'] ?? ''),
            ':synced' => date('c'),
            ':id' => $id,
        ]);
        return [
            'ok' => true,
            'userId' => $result['user_id'],
            'tempPassword' => $result['temp_password'] ?? '',
            'emailSent' => $result['email_sent'],
            'alreadyLinked' => !empty($result['already_linked']),
        ];
    } catch (Throwable $e) {
        error_log('lpSyncParceiroToSoublu: ' . $e->getMessage());
        $upd = $pdo->prepare('UPDATE lp_parceiros SET soublu_error = :err WHERE id = :id');
        $upd->execute([':err' => $e->getMessage(), ':id' => $id]);
        return ['ok' => false, 'error' => $e->getMessage()];
    }
}
