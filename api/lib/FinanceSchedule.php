<?php
declare(strict_types=1);
function soublu_finance_schedule_amount(array $data): int {
    $raw=(string)($data['valor'] ?? '');
    if(!preg_match('/^\d+(?:\.\d{1,2})?$/',$raw)) throw new RuntimeException('Valor inválido.');
    $cents=(int)round((float)$raw*100);
    if($cents<=0 || $cents>99999999999) throw new RuntimeException('Valor fora do limite.');
    if(!in_array($data['tipo'] ?? '',['credito','debito'],true)) throw new RuntimeException('Tipo inválido.');
    $date=DateTimeImmutable::createFromFormat('!Y-m-d',(string)($data['data'] ?? ''));
    if(!$date || $date->format('Y-m-d')!==($data['data'] ?? '')) throw new RuntimeException('Data inválida.');
    return $cents;
}
function soublu_schedule_money_wallet(PDO $pdo,array $user): bool {
    for($depth=0;$depth<10;$depth++) {
        if(!empty($user['partner_root_id']) || in_array(strtolower((string)($user['role'] ?? '')),['parceiro','prestador'],true))return true;
        if(empty($user['admin_id']) || $user['admin_id']===$user['id'])return false;
        $st=$pdo->prepare('SELECT * FROM users WHERE id=?');$st->execute([$user['admin_id']]);$user=$st->fetch();if(!$user)return false;
    }
    return false;
}
function soublu_execute_finance_schedule(PDO $pdo,string $id,string $today): array {
    $pdo->beginTransaction();
    try {
        $st=$pdo->prepare("SELECT * FROM finance_workbook WHERE id=? AND kind='futuro' FOR UPDATE");$st->execute([$id]);$row=$st->fetch();
        if(!$row) throw new RuntimeException('Agendamento inexistente.');
        $data=json_decode($row['data'],true,512,JSON_THROW_ON_ERROR);
        if(($data['status'] ?? '')==='executado') { $pdo->commit();return ['id'=>$id,'status'=>'ja_executado']; }
        if(($data['status'] ?? '')!=='programado' || ($data['data'] ?? '')>$today) { $pdo->commit();return ['id'=>$id,'status'=>'nao_vencido']; }
        $amount=soublu_finance_schedule_amount($data);
        $st=$pdo->prepare('SELECT role,active FROM users WHERE id=?');$st->execute([(string)($data['actor'] ?? '')]);$author=$st->fetch();
        if(!$author || !(int)$author['active'] || !in_array(strtolower((string)$author['role']),['master','fundador','financeiro','financial'],true))throw new RuntimeException('Agendamento sem autorização financeira válida.');
        $st=$pdo->prepare('SELECT * FROM users WHERE id=? FOR UPDATE');$st->execute([$data['usuario']]);$user=$st->fetch();
        if(!$user || !(int)($user['active'] ?? 0)) throw new RuntimeException('Destinatário inexistente ou inativo.');
        if(!soublu_schedule_money_wallet($pdo,$user) && $amount%100!==0)throw new RuntimeException('A carteira deste usuário usa pontos inteiros. Ajuste o valor.');
        $current=(int)round((float)($user['points'] ?? $user['balance'] ?? 0)*100);
        if($data['tipo']==='debito' && $current<$amount) { $pdo->commit();return ['id'=>$id,'status'=>'saldo_insuficiente']; }
        $next=$current+($data['tipo']==='credito'?$amount:-$amount);
        $txId='futuro-'.substr(hash('sha256',$id),0,48);
        $meta=['screen'=>'conta_corrente_gestao','schedule_id'=>$id,'saldo_anterior'=>$current/100,'saldo_novo'=>$next/100,'scheduled_date'=>$data['data']];
        $st=$pdo->prepare('INSERT INTO transactions (id,employee_id,type,amount,reason,by_user,meta,created_at) VALUES (?,?,?,?,?,?,?,NOW())');
        $st->execute([$txId,$user['id'],$data['tipo']==='credito'?'credit':'debit',$amount/100,$data['descricao'] ?? 'Lançamento programado',$data['actor'],json_encode($meta)]);
        $st=$pdo->prepare('UPDATE users SET balance=?, points=? WHERE id=?');$st->execute([$next/100,$next/100,$user['id']]);
        $data['status']='executado';$data['executed_at']=date(DATE_ATOM);$data['transaction_id']=$txId;
        $st=$pdo->prepare('UPDATE finance_workbook SET data=?,updated_at=NOW() WHERE id=?');$st->execute([json_encode($data),$id]);
        $pdo->commit();return ['id'=>$id,'status'=>'executado'];
    } catch(Throwable $e) { if($pdo->inTransaction())$pdo->rollBack();throw $e; }
}
function soublu_finance_assert_atomic(PDO $pdo): void {
    $st=$pdo->query("SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('users','transactions','finance_workbook')");
    $tables=$st->fetchAll();
    if(count($tables)!==3 || count(array_filter($tables,fn($t)=>strtoupper($t['ENGINE'])==='INNODB'))!==3)throw new RuntimeException('A execução exige tabelas InnoDB para garantir transações.');
}
function soublu_run_finance_schedules(PDO $pdo): array {
    soublu_finance_assert_atomic($pdo);
    $today=(new DateTimeImmutable('now',new DateTimeZone('America/Sao_Paulo')))->format('Y-m-d');
    $st=$pdo->prepare("SELECT id FROM finance_workbook WHERE kind='futuro' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.status'))='programado' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.data'))<=? ORDER BY JSON_UNQUOTE(JSON_EXTRACT(data,'$.data')),id LIMIT 500");$st->execute([$today]);$ids=$st->fetchAll(PDO::FETCH_COLUMN);$results=[];
    foreach($ids as $id) { try { $results[]=soublu_execute_finance_schedule($pdo,$id,$today); } catch(Throwable $e) { $results[]=['id'=>$id,'status'=>'erro','message'=>$e->getMessage()]; } }
    return $results;
}
