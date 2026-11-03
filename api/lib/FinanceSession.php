<?php
declare(strict_types=1);
function soublu_finance_session_start(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    session_name('soublu_finance');
    session_set_cookie_params(['httponly'=>true,'samesite'=>'Strict','secure'=>!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS']!=='off','path'=>'/']);
    session_start();
}
function soublu_finance_user(PDO $pdo, bool $internal = false): array {
    soublu_finance_session_start();
    $id=$_SESSION['finance_user'] ?? '';
    if (!$id || time() > (int)($_SESSION['finance_until'] ?? 0)) throw new RuntimeException('Entre novamente para acessar o Financeiro.',401);
    $st=$pdo->prepare('SELECT * FROM users WHERE id=?');$st->execute([$id]);$user=$st->fetch();
    if (!$user || !(int)($user['active'] ?? 0)) throw new RuntimeException('Conta inativa.',403);
    $roles=['master','fundador','financeiro','financial'];
    if ($internal && !in_array(strtolower((string)$user['role']),$roles,true)) throw new RuntimeException('Sem permissão financeira.',403);
    return $user;
}
function soublu_finance_csrf(): void {
    soublu_finance_session_start();
    if (empty($_SESSION['finance_csrf']) || !hash_equals($_SESSION['finance_csrf'],(string)($_SERVER['HTTP_X_FINANCE_CSRF'] ?? ''))) throw new RuntimeException('Sessão inválida. Atualize a página.',403);
}
function soublu_finance_supplier(PDO $pdo,array $user): array {
    if(strtolower((string)$user['role'])!=='prestador') throw new RuntimeException('Acesso exclusivo de prestadores.',403);
    $st=$pdo->prepare('SELECT * FROM finance_suppliers WHERE linked_user_id=?');$st->execute([$user['id']]);$rows=$st->fetchAll();
    if(count($rows)!==1 || !(int)($rows[0]['active'] ?? 0)) throw new RuntimeException('O Financeiro precisa vincular este login a um único prestador ativo.',403);
    return $rows[0];
}
