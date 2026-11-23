<?php
declare(strict_types=1);

/**
 * lpSendApprovalEmail — e-mail de boas-vindas após aprovar cadastro da landing.
 * Usa mail() nativo (Locaweb). Nunca lança: falha só vai para o error_log.
 */
function lpSendApprovalEmail(array $record, string $email, string $tempPassword): bool
{
    try {
        $name = trim((string) ($record['name'] ?? ''));
        $loginUrl = 'https://soumaisblu.com.br/index.html';
        $from = 'SOU + BLU <naoresponda@blupromotora.com.br>';

        $subject = 'Seu acesso à Sou+Blu foi criado';
        $body = "Olá, {$name}!\n\n"
            . "Seu cadastro de parceiro foi aprovado e o acesso à plataforma Sou+Blu já está disponível.\n\n"
            . "Login: {$email}\n"
            . "Senha temporária: {$tempPassword}\n\n"
            . "Acesse em: {$loginUrl}\n\n"
            . "Por segurança, troque essa senha no primeiro acesso e nunca a compartilhe com terceiros.\n\n"
            . "Equipe SOU + BLU\n";

        $headers = "MIME-Version: 1.0\r\n"
            . "Content-Type: text/plain; charset=UTF-8\r\n"
            . "From: {$from}\r\n";

        $encodedSubject = function_exists('mb_encode_mimeheader')
            ? mb_encode_mimeheader($subject, 'UTF-8', 'B', "\r\n")
            : '=?UTF-8?B?' . base64_encode($subject) . '?=';

        $sent = @mail($email, $encodedSubject, $body, $headers);
        if (!$sent) {
            error_log('lpSendApprovalEmail: mail() recusou envio para ' . $email);
        }
        return (bool) $sent;
    } catch (Throwable $e) {
        error_log('lpSendApprovalEmail: ' . $e->getMessage());
        return false;
    }
}

/**
 * lpSendExistingAccessEmail — avisa que o e-mail já tinha login na Sou+Blu.
 * Não envia senha nova (a conta existente permanece).
 */
function lpSendExistingAccessEmail(array $record, string $email): bool
{
    try {
        $name = trim((string) ($record['name'] ?? ''));
        $loginUrl = 'https://soumaisblu.com.br/index.html';
        $from = 'SOU + BLU <naoresponda@blupromotora.com.br>';

        $subject = 'Seu cadastro de parceiro foi aprovado';
        $body = "Olá, {$name}!\n\n"
            . "Seu cadastro de parceiro foi aprovado. Este e-mail já possui acesso à plataforma Sou+Blu.\n\n"
            . "Login: {$email}\n"
            . "Use a senha que você já utiliza na plataforma.\n\n"
            . "Acesse em: {$loginUrl}\n\n"
            . "Equipe SOU + BLU\n";

        $headers = "MIME-Version: 1.0\r\n"
            . "Content-Type: text/plain; charset=UTF-8\r\n"
            . "From: {$from}\r\n";

        $encodedSubject = function_exists('mb_encode_mimeheader')
            ? mb_encode_mimeheader($subject, 'UTF-8', 'B', "\r\n")
            : '=?UTF-8?B?' . base64_encode($subject) . '?=';

        return (bool) @mail($email, $encodedSubject, $body, $headers);
    } catch (Throwable $e) {
        error_log('lpSendExistingAccessEmail: ' . $e->getMessage());
        return false;
    }
}
