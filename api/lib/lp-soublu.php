<?php
declare(strict_types=1);

/**
 * lpSoubluCreateParceiro — cria ou vincula user (role=parceiro) + partners.
 * Se o e-mail já existir, reaproveita a conta (não gera senha nova).
 */
function lpSoubluCreateParceiro(PDO $pdo, array $record): array
{
    $email = strtolower(trim((string) ($record['commercial_email'] ?? '')));
    if ($email === '') {
        throw new RuntimeException('Cadastro sem e-mail comercial — não é possível criar o acesso.');
    }

    $st = $pdo->prepare('SELECT id, role, active FROM users WHERE LOWER(email) = ? LIMIT 1');
    $st->execute([$email]);
    $existing = $st->fetch(PDO::FETCH_ASSOC);
    // Só reaproveita se a linha em users ainda existir (ID fantasma no lp_parceiros não conta).
    if ($existing && !lpSoubluUserExists($pdo, (string) $existing['id'])) {
        $existing = false;
    }

    $digits = preg_replace('/\D/', '', (string) ($record['document'] ?? '')) ?? '';
    $now = date('Y-m-d H:i:s');

    if ($existing) {
        $userId = (string) $existing['id'];
        try {
            $pdo->prepare('UPDATE users SET active = 1 WHERE id = ?')->execute([$userId]);
        } catch (Throwable $e) {
            // segue a vinculação mesmo se o UPDATE falhar
        }
        lpSoubluEnsurePartner($pdo, $userId, $record, $digits, $now);
        $emailSent = lpSendExistingAccessEmail($record, $email);
        return [
            'user_id' => $userId,
            'temp_password' => '',
            'email_sent' => $emailSent,
            'already_linked' => true,
        ];
    }

    $tempPassword = lpSoubluTempPassword();
    $preferId = trim((string) ($record['soublu_user_id'] ?? ''));
    // Reusa o id já gravado no kanban/partners se a conta sumiu — evita órfão.
    $userId = ($preferId !== '' && !lpSoubluUserExists($pdo, $preferId))
        ? $preferId
        : lpSoubluGenId('u');
    $matricula = 'F' . (string) random_int(10000, 99999);

    $insUser = $pdo->prepare(
        'INSERT INTO users (id, name, email, password, matricula, department, role, balance, points, active, created_at)
         VALUES (:id, :name, :email, :password, :matricula, :department, :role, 0, 0, 1, :created)'
    );
    $insUser->execute([
        ':id' => $userId,
        ':name' => (string) ($record['name'] ?? ''),
        ':email' => $email,
        ':password' => $tempPassword,
        ':matricula' => $matricula,
        ':department' => 'Parceiro',
        ':role' => 'parceiro',
        ':created' => $now,
    ]);

    // Campos extras se existirem na tabela users (não bloqueia a aprovação se faltar).
    try {
        $extra = $pdo->prepare('UPDATE users SET cpf = :cpf, phone = :phone, partner_root_id = :root WHERE id = :id');
        $extra->execute([
            ':cpf' => strlen($digits) === 11 ? $digits : null,
            ':phone' => (string) ($record['commercial_phone'] ?? ''),
            ':root' => $userId,
            ':id' => $userId,
        ]);
    } catch (Throwable $e) {
        // ambiente sem coluna cpf/phone/partner_root_id
    }

    lpSoubluEnsurePartner($pdo, $userId, $record, $digits, $now);
    $emailSent = lpSendApprovalEmail($record, $email, $tempPassword);

    return [
        'user_id' => $userId,
        'temp_password' => $tempPassword,
        'email_sent' => $emailSent,
        'already_linked' => false,
    ];
}

/**
 * lpSoubluUserExists — confere se o id ainda tem linha em users.
 * lp_parceiros pode guardar um soublu_user_id de conta já apagada.
 */
function lpSoubluUserExists(PDO $pdo, string $userId): bool
{
    $userId = trim($userId);
    if ($userId === '') {
        return false;
    }
    $st = $pdo->prepare('SELECT id FROM users WHERE id = ? LIMIT 1');
    $st->execute([$userId]);
    return (bool) $st->fetch(PDO::FETCH_ASSOC);
}

/**
 * lpSoubluEnsurePartner — cria ou reativa o registro em partners para o user_id.
 * Evita duplicar parceiro quando o e-mail/usuário já existe na Sou+Blu.
 */
function lpSoubluEnsurePartner(PDO $pdo, string $userId, array $record, string $digits, string $now): void
{
    $fontedata = !empty($record['fontedata_result'])
        ? json_decode((string) $record['fontedata_result'], true)
        : null;
    $razaoSocial = is_array($fontedata) ? ($fontedata['razaoSocial'] ?? $record['name']) : $record['name'];
    $endereco = '';
    if (is_array($fontedata) && !empty($fontedata['enderecos'][0]) && is_array($fontedata['enderecos'][0])) {
        $e = $fontedata['enderecos'][0];
        $endereco = trim(implode(', ', array_filter([
            trim(($e['logradouro'] ?? '') . ' ' . ($e['numero'] ?? '')),
            $e['complemento'] ?? '',
            $e['bairro'] ?? '',
            trim(($e['cidade'] ?? '') . (!empty($e['uf']) ? '/' . $e['uf'] : '')),
            $e['cep'] ?? '',
        ])));
    }
    $email = strtolower(trim((string) ($record['commercial_email'] ?? '')));
    $cnpj = strlen($digits) === 14 ? (string) $record['document'] : '';
    $contato = (string) ($record['commercial_phone'] ?? '');
    $meta = json_encode([
        'status' => 'ativo',
        'source' => 'landing_lp',
        'compliance_aprovado' => true,
        'lp_parceiro_id' => (string) ($record['id'] ?? ''),
    ], JSON_UNESCAPED_UNICODE);

    $st = $pdo->prepare('SELECT id FROM partners WHERE user_id = ? OR email = ? LIMIT 1');
    $st->execute([$userId, $email]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if ($row) {
        $upd = $pdo->prepare(
            'UPDATE partners
             SET user_id = :user_id, cnpj = :cnpj, razao_social = :razao, endereco = :endereco,
                 contato = :contato, email = :email, meta = :meta, active = 1
             WHERE id = :id'
        );
        $upd->execute([
            ':user_id' => $userId,
            ':cnpj' => $cnpj,
            ':razao' => (string) $razaoSocial,
            ':endereco' => $endereco,
            ':contato' => $contato,
            ':email' => $email,
            ':meta' => $meta,
            ':id' => $row['id'],
        ]);
        return;
    }

    $insPrt = $pdo->prepare(
        'INSERT INTO partners
          (id, user_id, cnpj, razao_social, endereco, contato, email, permissions, meta, active, created_at)
         VALUES
          (:id, :user_id, :cnpj, :razao, :endereco, :contato, :email, :perms, :meta, 1, :created)'
    );
    $insPrt->execute([
        ':id' => lpSoubluGenId('prt'),
        ':user_id' => $userId,
        ':cnpj' => $cnpj,
        ':razao' => (string) $razaoSocial,
        ':endereco' => $endereco,
        ':contato' => $contato,
        ':email' => $email,
        ':perms' => json_encode(new stdClass(), JSON_UNESCAPED_UNICODE),
        ':meta' => $meta,
        ':created' => $now,
    ]);
}

/** lpSoubluGenId — id curto no padrão do painel (prefixo + timestamp base36 + hex). */
function lpSoubluGenId(string $prefix): string
{
    return $prefix . strtolower(base_convert((string) round(microtime(true) * 1000), 10, 36))
        . substr(bin2hex(random_bytes(4)), 0, 5);
}

/** lpSoubluTempPassword — senha de 10 chars sem 0/O/1/l para o primeiro acesso. */
function lpSoubluTempPassword(): string
{
    $chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    $password = '';
    $max = strlen($chars) - 1;
    for ($i = 0; $i < 10; $i++) {
        $password .= $chars[random_int(0, $max)];
    }
    return $password;
}
