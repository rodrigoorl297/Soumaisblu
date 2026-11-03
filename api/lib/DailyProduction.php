<?php
declare(strict_types=1);

/** Daily production rules. Dates and the deadline always use Brasilia time. */
final class DailyProductionRules
{
    public const DEADLINE = '16:40';
    public const MANAGERS = ['master','fundador','desenvolvedor','admin','gerente','gerencia','diretoria','rh','financeiro','financial','supervisor','sup_backoffice','parceiro'];
    public const GLOBAL_MANAGERS = ['master','fundador','desenvolvedor','admin','gerente','gerencia','diretoria','rh','financeiro','financial'];

    public static function now(): DateTimeImmutable { return new DateTimeImmutable('now',new DateTimeZone('America/Sao_Paulo')); }
    public static function date(string $date): DateTimeImmutable {
        $value=DateTimeImmutable::createFromFormat('!Y-m-d',$date,new DateTimeZone('America/Sao_Paulo'));
        if(!$value || $value->format('Y-m-d')!==$date)throw new RuntimeException('Data inválida.',400);
        return $value;
    }
    public static function workdays(string $from,string $to): array {
        $first=self::date($from);$last=self::date($to);$dates=[];
        for($day=$first;$day<=$last;$day=$day->modify('+1 day'))if((int)$day->format('N')<=5)$dates[]=$day->format('Y-m-d');
        return $dates;
    }
    public static function pending(string $start,array $submitted,DateTimeImmutable $now): array {
        $now=$now->setTimezone(new DateTimeZone('America/Sao_Paulo'));
        $last=$now->format('H:i')>=self::DEADLINE?$now->format('Y-m-d'):$now->modify('-1 day')->format('Y-m-d');
        $done=array_fill_keys($submitted,true);
        return array_values(array_filter(self::workdays($start,$last),fn($date)=>!isset($done[$date])));
    }
    public static function validate(array $data): array {
        $out=[];
        foreach(['boletos_solicitados','propostas_digitadas','contratos_pagos'] as $key) {
            $value=$data[$key] ?? null;
            if((!is_int($value) && !(is_string($value)&&preg_match('/^\d+$/D',$value))) || (float)$value<0 || (float)$value>1000000)throw new RuntimeException('Informe as três quantidades como números inteiros de 0 a 1000000.',400);
            $out[$key]=(int)$value;
        }
        foreach(['boletos_solicitados'=>'justificativa_boletos','propostas_digitadas'=>'justificativa_propostas'] as $metric=>$field) {
            $text=trim((string)($data[$field] ?? ''));
            if(strlen($text)>8000 || preg_match_all('/./us',$text)>2000)throw new RuntimeException('A justificativa deve ter até 2000 caracteres.',400);
            if($out[$metric]===0 && !preg_match('/\S/u',$text))throw new RuntimeException($metric==='boletos_solicitados'?'Justifique por que não houve boletos solicitados.':'Justifique por que não houve propostas digitadas.',400);
            $out[$field]=$out[$metric]===0?$text:'';
        }
        foreach(['boletos_solicitados'=>'detalhes_boletos','propostas_digitadas'=>'detalhes_propostas'] as $metric=>$field) {
            $text=trim((string)($data[$field] ?? ''));
            if(strlen($text)>8000 || preg_match_all('/./us',$text)>2000)throw new RuntimeException('Os detalhes devem ter até 2000 caracteres por campo.',400);
            $out[$field]=$out[$metric]>0?$text:'';
        }
        return $out;
    }
}

final class DailyProductionStore
{
    public function __construct(private PDO $pdo) {}

    public function ensureSchema(): void {
        try { if($this->pdo->query('SELECT id FROM daily_production_settings WHERE id=1')->fetchColumn()){ $this->ensureDetailColumns();return; } }
        catch(PDOException $error) { if(!in_array((string)$error->getCode(),['42S02','42P01'],true))throw $error; }
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS daily_production_settings (id TINYINT PRIMARY KEY,start_date DATE NOT NULL,deadline VARCHAR(5) NOT NULL DEFAULT '16:40',created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS daily_production_enrollments (user_id VARCHAR(64) PRIMARY KEY,start_date DATE NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS daily_production_reports (user_id VARCHAR(64) NOT NULL,work_date DATE NOT NULL,user_name VARCHAR(255) NOT NULL,supervisor_id VARCHAR(64) NOT NULL,supervisor_name VARCHAR(255) NOT NULL,boletos_solicitados INT NOT NULL,propostas_digitadas INT NOT NULL,contratos_pagos INT NOT NULL,justificativa_boletos TEXT NULL,justificativa_propostas TEXT NULL,detalhes_boletos TEXT NULL,detalhes_propostas TEXT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,PRIMARY KEY(user_id,work_date),KEY idx_daily_supervisor(supervisor_id,work_date),KEY idx_daily_date(work_date)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS daily_production_history (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,user_id VARCHAR(64) NOT NULL,work_date DATE NOT NULL,actor_id VARCHAR(64) NOT NULL,before_data JSON NULL,after_data JSON NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,KEY idx_daily_audit(user_id,work_date)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $this->ensureDetailColumns();
        $st=$this->pdo->prepare('INSERT IGNORE INTO daily_production_settings(id,start_date) VALUES (1,?)');$st->execute([DailyProductionRules::now()->format('Y-m-d')]);
        if($st->rowCount()>0) {
            $this->pdo->exec("INSERT IGNORE INTO daily_production_enrollments(user_id,start_date) SELECT u.id,GREATEST(COALESCE(DATE(u.created_at),s.start_date),s.start_date) FROM users u CROSS JOIN daily_production_settings s WHERE s.id=1 AND u.active=1 AND LOWER(TRIM(u.role))='vendedor'");
        }
    }
    private function ensureDetailColumns(): void {
        try { $this->pdo->query('SELECT detalhes_boletos,detalhes_propostas FROM daily_production_reports LIMIT 0');return; }
        catch(PDOException $error) { if((string)$error->getCode()!=='42S22')throw $error; }
        $columns=$this->pdo->query('SHOW COLUMNS FROM daily_production_reports')->fetchAll(PDO::FETCH_COLUMN);
        foreach(['detalhes_boletos','detalhes_propostas'] as $name)if(!in_array($name,$columns,true)){try{$this->pdo->exec("ALTER TABLE daily_production_reports ADD COLUMN `$name` TEXT NULL");}catch(PDOException $error){if((string)$error->getCode()!=='42S21')throw $error;}}
    }
    public function user(string $id): ?array { $st=$this->pdo->prepare('SELECT * FROM users WHERE id=?');$st->execute([$id]);return $st->fetch() ?: null; }
    public function allUsers(): array { return $this->pdo->query('SELECT id,name,role,active,admin_id,partner_root_id,created_at FROM users')->fetchAll(); }
    public function startFor(array $user): string {
        $st=$this->pdo->prepare('INSERT IGNORE INTO daily_production_enrollments(user_id,start_date) VALUES (?,?)');$st->execute([$user['id'],DailyProductionRules::now()->format('Y-m-d')]);
        $st=$this->pdo->prepare('SELECT start_date FROM daily_production_enrollments WHERE user_id=?');$st->execute([$user['id']]);return (string)$st->fetchColumn();
    }
    public function pending(array $user,?DateTimeImmutable $now=null): array {
        if(strtolower(trim((string)$user['role']))!=='vendedor')return [];
        $start=$this->startFor($user);$st=$this->pdo->prepare('SELECT work_date FROM daily_production_reports WHERE user_id=? AND work_date>=?');$st->execute([$user['id'],$start]);
        return DailyProductionRules::pending($start,$st->fetchAll(PDO::FETCH_COLUMN),$now ?? DailyProductionRules::now());
    }
    private function root(array $user,array $index): ?string {
        for($i=0;$i<12;$i++) {
            if(!empty($user['partner_root_id']))return (string)$user['partner_root_id'];
            if(strtolower((string)$user['role'])==='parceiro')return (string)$user['id'];
            if(empty($user['admin_id']) || !isset($index[$user['admin_id']]))return null;
            $user=$index[$user['admin_id']];
        }
        return null;
    }
    public function supervisors(array $user): array {
        $users=$this->allUsers();$index=array_column($users,null,'id');$root=$this->root($user,$index);$choices=[];$preferred='';
        $boss=$user;
        for($i=0;$i<12&&!empty($boss['admin_id']);$i++) {
            $boss=$index[$boss['admin_id']] ?? null;if(!$boss)break;
            if((int)$boss['active'] && in_array(strtolower((string)$boss['role']),['supervisor','sup_backoffice','gerente','gerencia','parceiro'],true)) { $preferred=(string)$boss['id'];break; }
        }
        foreach($users as $candidate) {
            if(!(int)$candidate['active'] || !in_array(strtolower((string)$candidate['role']),['supervisor','sup_backoffice','gerente','gerencia','parceiro'],true))continue;
            if($this->root($candidate,$index)!==$root)continue;
            $choices[]=['id'=>$candidate['id'],'name'=>$candidate['name']];
        }
        usort($choices,fn($a,$b)=>strcmp($a['name'],$b['name']));
        return ['options'=>$choices,'preferred'=>$preferred];
    }
    public function record(string $userId,string $date): ?array {
        DailyProductionRules::date($date);$st=$this->pdo->prepare('SELECT * FROM daily_production_reports WHERE user_id=? AND work_date=?');$st->execute([$userId,$date]);return $st->fetch() ?: null;
    }
    public function save(array $user,array $body): array {
        if(strtolower(trim((string)$user['role']))!=='vendedor')throw new RuntimeException('Somente vendedores preenchem a produção diária.',403);
        $date=(string)($body['work_date'] ?? '');$day=DailyProductionRules::date($date);$today=DailyProductionRules::now()->format('Y-m-d');$start=$this->startFor($user);
        if($date<$start || $date>$today || (int)$day->format('N')>5)throw new RuntimeException('Escolha um dia de segunda a sexta, a partir da ativação e até hoje.',400);
        $metrics=DailyProductionRules::validate($body);$choices=$this->supervisors($user);$supervisorId=(string)($body['supervisor_id'] ?? $choices['preferred']);$supervisor=null;
        foreach($choices['options'] as $candidate)if((string)$candidate['id']===$supervisorId)$supervisor=$candidate;
        if(!$supervisor)throw new RuntimeException('Selecione o supervisor responsável.',400);
        $data=['user_id'=>$user['id'],'work_date'=>$date,'user_name'=>$user['name'],'supervisor_id'=>$supervisor['id'],'supervisor_name'=>$supervisor['name'],...$metrics];
        $this->pdo->beginTransaction();
        try {
            $st=$this->pdo->prepare('SELECT user_id FROM daily_production_enrollments WHERE user_id=? FOR UPDATE');$st->execute([$user['id']]);$st->fetch();
            $before=$this->record($user['id'],$date);
            foreach(['boletos_solicitados'=>'detalhes_boletos','propostas_digitadas'=>'detalhes_propostas'] as $metric=>$field)if($before && !array_key_exists($field,$body) && $metrics[$metric]>0)$data[$field]=$before[$field] ?? '';

            $fields=array_keys($data);$update=implode(',',array_map(fn($f)=>"`$f`=VALUES(`$f`)",array_slice($fields,2)));
            $st=$this->pdo->prepare('INSERT INTO daily_production_reports (`'.implode('`,`',$fields).'`) VALUES ('.implode(',',array_fill(0,count($fields),'?')).') ON DUPLICATE KEY UPDATE '.$update.',updated_at=CURRENT_TIMESTAMP');$st->execute(array_values($data));
            $st=$this->pdo->prepare('INSERT INTO daily_production_history(user_id,work_date,actor_id,before_data,after_data) VALUES (?,?,?,?,?)');$st->execute([$user['id'],$date,$user['id'],$before?json_encode($before,JSON_UNESCAPED_UNICODE):null,json_encode($data,JSON_UNESCAPED_UNICODE)]);
            $this->pdo->commit();return $data;
        } catch(Throwable $e){if($this->pdo->inTransaction())$this->pdo->rollBack();throw $e;}
    }
    public function deleteRecord(array $user,array $body): void {
        if(strtolower(trim((string)$user['role']))!=='vendedor')throw new RuntimeException('Somente o vendedor pode excluir a própria produção.',403);
        $date=(string)($body['work_date'] ?? '');DailyProductionRules::date($date);$this->startFor($user);
        $this->pdo->beginTransaction();
        try {
            $st=$this->pdo->prepare('SELECT user_id FROM daily_production_enrollments WHERE user_id=? FOR UPDATE');$st->execute([$user['id']]);$st->fetch();
            $before=$this->record((string)$user['id'],$date);
            if(!$before)throw new RuntimeException('Este dia não possui produção para excluir.',404);
            if(isset($body['expected_updated_at'])&&(string)$body['expected_updated_at']!==(string)($before['updated_at'] ?? ''))throw new RuntimeException('O registro foi atualizado. Consulte novamente antes de excluir.',409);
            $after=['deleted'=>true,'reason'=>'Exclusão solicitada pelo próprio vendedor.'];
            $st=$this->pdo->prepare('INSERT INTO daily_production_history(user_id,work_date,actor_id,before_data,after_data) VALUES (?,?,?,?,?)');$st->execute([$user['id'],$date,$user['id'],json_encode($before,JSON_UNESCAPED_UNICODE),json_encode($after,JSON_UNESCAPED_UNICODE)]);
            $st=$this->pdo->prepare('DELETE FROM daily_production_reports WHERE user_id=? AND work_date=?');$st->execute([$user['id'],$date]);
            $this->pdo->commit();
        }catch(Throwable $error){if($this->pdo->inTransaction())$this->pdo->rollBack();throw $error;}
    }
    public function report(array $viewer,array $filters): array {
        $month=(string)($filters['month'] ?? DailyProductionRules::now()->format('Y-m'));
        if(!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/D',$month))throw new RuntimeException('Mês inválido.',400);
        $from=(string)($filters['from'] ?? $month.'-01');$to=(string)($filters['to'] ?? DailyProductionRules::date($month.'-01')->format('Y-m-t'));
        $first=DailyProductionRules::date($from);$last=DailyProductionRules::date($to);
        if($last<$first || $first->diff($last)->days>366)throw new RuntimeException('Selecione um período de até 12 meses.',400);
        $role=strtolower((string)$viewer['role']);$global=in_array($role,DailyProductionRules::GLOBAL_MANAGERS,true);
        if(!$global&&!in_array($role,DailyProductionRules::MANAGERS,true)&&$role!=='vendedor')throw new RuntimeException('Sem permissão para o relatório.',403);
        $users=$this->allUsers();$index=array_column($users,null,'id');$scoped=[];
        foreach($users as $u) {
            $allowed=$global || (string)$u['id']===(string)$viewer['id'];$cursor=$u;
            if($role!=='vendedor')for($depth=0;$depth<12&&!$allowed&&!empty($cursor['admin_id']);$depth++){if((string)$cursor['admin_id']===(string)$viewer['id']){$allowed=true;break;}$cursor=$index[$cursor['admin_id']] ?? [];}
            if($allowed)$scoped[(string)$u['id']]=true;
        }
        $st=$this->pdo->prepare('SELECT * FROM daily_production_reports WHERE work_date BETWEEN ? AND ? ORDER BY work_date,user_name');$st->execute([$from,$to]);$saved=[];
        foreach($st->fetchAll() as $row) {
            if(!$global&&!isset($scoped[(string)$row['user_id']]) && ($role==='vendedor'||(string)$row['supervisor_id']!==(string)$viewer['id']))continue;
            $saved[(string)$row['user_id']][$row['work_date']]=$row;
        }
        $enrolled=$this->pdo->query('SELECT user_id,start_date FROM daily_production_enrollments')->fetchAll(PDO::FETCH_KEY_PAIR);
        $now=DailyProductionRules::now();$today=$now->format('Y-m-d');$rows=[];
        $allIds=array_unique([...array_keys($saved),...array_keys($scoped)]);
        foreach($allIds as $uid) {
            $u=$index[$uid] ?? null;$start=$enrolled[$uid] ?? null;
            $days=array_keys($saved[$uid] ?? []);
            if($u && (int)$u['active'] && strtolower((string)$u['role'])==='vendedor' && $start && isset($scoped[$uid]))$days=array_unique([...$days,...DailyProductionRules::workdays(max($from,$start),min($to,$today))]);
            foreach($days as $date) {
                if(isset($saved[$uid][$date])){$row=$saved[$uid][$date];$row['status']=((int)$row['boletos_solicitados']===0 || (int)$row['propostas_digitadas']===0)?'Justificado':'Preenchido';}
                else {$boss=$index[$u['admin_id'] ?? ''] ?? null;$row=['user_id'=>$uid,'work_date'=>$date,'user_name'=>$u['name'],'supervisor_id'=>$boss['id'] ?? '','supervisor_name'=>$boss['name'] ?? 'Não vinculado','boletos_solicitados'=>null,'propostas_digitadas'=>null,'contratos_pagos'=>null,'justificativa_boletos'=>'','justificativa_propostas'=>'','detalhes_boletos'=>'','detalhes_propostas'=>'','updated_at'=>null,'status'=>$date===$today && $now->format('H:i')<DailyProductionRules::DEADLINE?'Em aberto':'Pendente'];}
                if(!empty($filters['user_id']) && (string)$row['user_id']!==(string)$filters['user_id'])continue;
                if(!empty($filters['supervisor_id']) && (string)$row['supervisor_id']!==(string)$filters['supervisor_id'])continue;
                if(!empty($filters['status']) && $row['status']!==$filters['status'])continue;
                $q=trim((string)($filters['q'] ?? ''));if($q!=='' && stripos($row['user_name'].' '.$row['supervisor_name'],$q)===false)continue;
                $rows[]=$row;
                if(count($rows)>100000)throw new RuntimeException('Relatório muito grande. Reduza o período.',400);
            }
        }
        usort($rows,fn($a,$b)=>strcmp($a['work_date'],$b['work_date'])?:strcmp($a['supervisor_name'],$b['supervisor_name'])?:strcmp($a['user_name'],$b['user_name']));
        $totals=['boletos_solicitados'=>0,'propostas_digitadas'=>0,'contratos_pagos'=>0,'pendentes'=>0,'preenchidos'=>0];$people=[];$supervisors=[];$summary=[];
        foreach($rows as $row) {
            foreach(['boletos_solicitados','propostas_digitadas','contratos_pagos'] as $key)$totals[$key]+=(int)$row[$key];
            if($row['status']==='Pendente')$totals['pendentes']++;if(in_array($row['status'],['Preenchido','Justificado'],true))$totals['preenchidos']++;
            $people[$row['user_id']]=$row['user_name'];if($row['supervisor_id'])$supervisors[$row['supervisor_id']]=$row['supervisor_name'];
            $group=$row['supervisor_id'].'|'.$row['user_id'];
            if(!isset($summary[$group]))$summary[$group]=['supervisor'=>$row['supervisor_name'],'pessoa'=>$row['user_name'],'boletos_solicitados'=>0,'propostas_digitadas'=>0,'contratos_pagos'=>0,'dias_pendentes'=>0,'dias_preenchidos'=>0];
            foreach(['boletos_solicitados','propostas_digitadas','contratos_pagos'] as $key)$summary[$group][$key]+=(int)$row[$key];
            $summary[$group]['dias_pendentes']+=($row['status']==='Pendente'?1:0);$summary[$group]['dias_preenchidos']+=(in_array($row['status'],['Preenchido','Justificado'],true)?1:0);
        }
        return ['rows'=>$rows,'totals'=>$totals,'summary'=>array_values($summary),'people'=>$people,'supervisors'=>$supervisors,'from'=>$from,'to'=>$to];
    }
}
