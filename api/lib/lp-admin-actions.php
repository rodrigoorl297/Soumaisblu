<?php
declare(strict_types=1);

/**
 * lp-admin-actions — confirmação de intenção ao aprovar parceiro (código 6 dígitos).
 * Portado de landingPageBlu (admin-actions.php); usa token do kanban SOU+BLU.
 */

/** approvalSession — sessão isolada só para o desafio de aprovação. */
function approvalSession(): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_name('blu_approval');
        session_start([
            'cookie_httponly' => true,
            'cookie_samesite' => 'Strict',
            'cookie_secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
            'use_strict_mode' => true,
        ]);
    }
}

/** lpLoginUrl — link de login enviado no e-mail / desafio. */
function lpLoginUrl(): string
{
    if (defined('SOUBLU_LOGIN_URL') && trim((string) SOUBLU_LOGIN_URL) !== '') {
        return (string) SOUBLU_LOGIN_URL;
    }
    return 'https://soumaisblu.com.br/index.html';
}

/** approvalFingerprint — trava o desafio ao estado atual do cadastro. */
function approvalFingerprint(array $record): string
{
    return hash('sha256', json_encode([
        (string) $record['id'],
        $record['commercial_email'],
        $record['status'],
        $record['status_updated_at'] ?? null,
        $record['archived_at'] ?? null,
        lpLoginUrl(),
    ], JSON_UNESCAPED_UNICODE));
}

/**
 * issueApprovalChallenge — gera código de 6 dígitos (5 min, 1 uso).
 */
function issueApprovalChallenge(array $record): array
{
    approvalSession();
    $now = time();
    $challenges = array_filter(
        $_SESSION['approval_challenges'] ?? [],
        static fn($item) => ($item['expires'] ?? 0) > $now
    );
    if (count($challenges) >= 10) {
        array_shift($challenges);
    }
    $nonce = bin2hex(random_bytes(24));
    $code = (string) random_int(100000, 999999);
    $challenges[$nonce] = [
        'code' => $code,
        'expires' => $now + 300,
        'fingerprint' => approvalFingerprint($record),
        'admin' => hash('sha256', lpIncomingToken()),
    ];
    $_SESSION['approval_challenges'] = $challenges;
    session_write_close();
    return [
        'confirmationToken' => $nonce,
        'code' => $code,
        'expiresIn' => 300,
        'name' => $record['name'],
        'email' => $record['commercial_email'],
        'loginUrl' => lpLoginUrl(),
    ];
}

/**
 * consumeApprovalChallenge — valida e consome o desafio (uma tentativa).
 */
function consumeApprovalChallenge(array $record, array $input): bool
{
    approvalSession();
    $nonce = is_string($input['confirmationToken'] ?? null) ? $input['confirmationToken'] : '';
    $challenge = $_SESSION['approval_challenges'][$nonce] ?? null;
    unset($_SESSION['approval_challenges'][$nonce]);
    session_write_close();
    return $challenge
        && ($challenge['expires'] ?? 0) > time()
        && hash_equals($challenge['admin'], hash('sha256', lpIncomingToken()))
        && hash_equals($challenge['fingerprint'], approvalFingerprint($record))
        && is_string($input['confirmationCode'] ?? null)
        && hash_equals($challenge['code'], $input['confirmationCode']);
}
