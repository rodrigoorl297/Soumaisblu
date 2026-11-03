<?php
declare(strict_types=1);
require_once __DIR__.'/../api/lib/DailyProduction.php';
function check(bool $value,string $message):void{if(!$value)throw new RuntimeException($message);}
function invalid(callable $fn):void{try{$fn();}catch(RuntimeException $e){check($e->getCode()===400,'erro de validação');return;}throw new RuntimeException('Validação ausente');}
$start='2026-11-03';
check(DailyProductionRules::pending($start,[],new DateTimeImmutable('2026-11-03T19:39:59Z'))===[],'não bloqueia antes de 16h40');
check(DailyProductionRules::pending($start,[],new DateTimeImmutable('2026-11-03T19:40:00Z'))===[$start],'bloqueia às 16h40 em Brasília');
check(DailyProductionRules::pending($start,[],new DateTimeImmutable('2026-11-09T15:00:00-03:00'))===['2026-11-03','2026-11-04','2026-11-05','2026-11-06'],'pendências mantidas após fim de semana');
check(DailyProductionRules::pending($start,['2026-11-03','2026-11-04','2026-11-05','2026-11-06'],new DateTimeImmutable('2026-11-08T17:00:00-03:00'))===[],'fim de semana sem obrigação nova');
check(DailyProductionRules::pending('2026-11-10',[],new DateTimeImmutable('2026-11-03T17:00:00-03:00'))===[],'sem cobrança anterior à adesão');
$valid=['boletos_solicitados'=>1,'propostas_digitadas'=>2,'contratos_pagos'=>0];check(DailyProductionRules::validate($valid)['contratos_pagos']===0,'contratos sem justificativa obrigatória');
invalid(fn()=>DailyProductionRules::validate([...$valid,'boletos_solicitados'=>0]));invalid(fn()=>DailyProductionRules::validate([...$valid,'propostas_digitadas'=>0]));
invalid(fn()=>DailyProductionRules::validate([...$valid,'boletos_solicitados'=>-1]));invalid(fn()=>DailyProductionRules::validate([...$valid,'boletos_solicitados'=>1.5]));invalid(fn()=>DailyProductionRules::validate([...$valid,'boletos_solicitados'=>'']));
$zero=DailyProductionRules::validate(['boletos_solicitados'=>0,'propostas_digitadas'=>0,'contratos_pagos'=>0,'justificativa_boletos'=>'Sem retorno dos bancos','justificativa_propostas'=>'Aguardando documentos']);check($zero['justificativa_propostas']!=='','aceita justificativas separadas');
invalid(fn()=>DailyProductionRules::date('2026-02-30'));
class DailyMemoryPDO extends PDO {
 public array $users,$reports=[],$history=[],$enroll=['u1'=>'2026-11-03','u2'=>'2026-11-03'];public bool $fail=false;private bool $tx=false;private array $before=[];
 public function __construct(){ $this->users=[['id'=>'u1','name'=>'Vendedor um','role'=>'vendedor','active'=>1,'admin_id'=>'s1','partner_root_id'=>null],['id'=>'u2','name'=>'Vendedor dois','role'=>'vendedor','active'=>1,'admin_id'=>'s2','partner_root_id'=>null],['id'=>'s1','name'=>'Supervisor um','role'=>'supervisor','active'=>1,'admin_id'=>null,'partner_root_id'=>null],['id'=>'s2','name'=>'Supervisor dois','role'=>'supervisor','active'=>1,'admin_id'=>null,'partner_root_id'=>null],['id'=>'partner','name'=>'Gestor parceiro','role'=>'parceiro','active'=>1,'admin_id'=>null,'partner_root_id'=>'partner']]; }
 public function prepare(string $query,array $options=[]):PDOStatement|false{return new DailyMemoryStatement($this,$query);}
 public function query(string $query,?int $fetchMode=null,mixed ...$args):PDOStatement|false{$st=new DailyMemoryStatement($this,$query);$st->execute();return $st;}
 public function beginTransaction():bool{$this->before=[$this->reports,$this->history];$this->tx=true;return true;}
 public function commit():bool{$this->tx=false;return true;}
 public function rollBack():bool{[$this->reports,$this->history]=$this->before;$this->tx=false;return true;}
 public function inTransaction():bool{return $this->tx;}
}
class DailyMemoryStatement extends PDOStatement {
 private array $rows=[];
 public function __construct(private DailyMemoryPDO $db,private string $sql){}
 public function execute(?array $params=null):bool{
 $a=$params??[];$q=$this->sql;
 if(str_starts_with($q,'SELECT id,name,role'))$this->rows=$this->db->users;
 elseif(str_starts_with($q,'SELECT user_id,start_date'))foreach($this->db->enroll as $id=>$date)$this->rows[]=[$id,$date];
 elseif(str_starts_with($q,'INSERT IGNORE INTO daily_production_enrollments'))$this->db->enroll[$a[0]]??=$a[1];
 elseif(str_starts_with($q,'SELECT start_date'))$this->rows=[[$this->db->enroll[$a[0]]]];
 elseif(str_starts_with($q,'SELECT user_id FROM'))$this->rows=[[$a[0]]];
 elseif(str_starts_with($q,'SELECT work_date FROM'))$this->rows=array_map(fn($r)=>[$r['work_date']],array_values(array_filter($this->db->reports,fn($r)=>$r['user_id']===$a[0]&&$r['work_date']>=$a[1])));
 elseif(str_starts_with($q,'SELECT * FROM daily_production_reports WHERE user_id'))$this->rows=isset($this->db->reports[$a[0].'|'.$a[1]])?[$this->db->reports[$a[0].'|'.$a[1]]]:[];
 elseif(str_starts_with($q,'SELECT * FROM daily_production_reports WHERE work_date'))$this->rows=array_values(array_filter($this->db->reports,fn($r)=>$r['work_date']>=$a[0]&&$r['work_date']<=$a[1]));
 elseif(str_starts_with($q,'INSERT INTO daily_production_reports')){preg_match('/\(`([^)]*)`\) VALUES/',$q,$match);$fields=explode('`,`',$match[1]);$data=array_combine($fields,$a);$this->db->reports[$data['user_id'].'|'.$data['work_date']]=$data;}
 elseif(str_starts_with($q,'DELETE FROM daily_production_reports'))unset($this->db->reports[$a[0].'|'.$a[1]]);
 elseif(str_starts_with($q,'INSERT INTO daily_production_history')){if($this->db->fail)throw new RuntimeException('Falha simulada');$this->db->history[]=$a;}
 else throw new RuntimeException('SQL inesperado: '.$q);
 return true;
 }
 public function fetch(int $mode=PDO::FETCH_DEFAULT,int $cursorOrientation=PDO::FETCH_ORI_NEXT,int $cursorOffset=0):mixed{return $this->rows[0]??false;}
 public function fetchColumn(int $column=0):mixed{return $this->rows[0][$column]??false;}
 public function fetchAll(int $mode=PDO::FETCH_DEFAULT,mixed ...$args):array{if($mode===PDO::FETCH_KEY_PAIR)return array_column($this->rows,1,0);if($mode===PDO::FETCH_COLUMN)return array_column($this->rows,0);return $this->rows;}
}
$db=new DailyMemoryPDO();$store=new DailyProductionStore($db);$u1=$db->users[0];$u2=$db->users[1];
$body=[...$valid,'work_date'=>'2026-11-03','supervisor_id'=>'s1','user_id'=>'u2','user_name'=>'Nome adulterado'];
$record=$store->save($u1,$body);check($record['user_id']==='u1'&&$record['user_name']==='Vendedor um','identidade vem do servidor');check(count($db->history)===1,'auditoria gravada');
$store->save($u1,[...$body,'boletos_solicitados'=>3]);check(count($db->reports)===1&&count($db->history)===2,'um registro por pessoa e dia, revisões auditadas');
$store->save($u2,[...$body,'supervisor_id'=>'s2']);
$report=$store->report($db->users[2],['month'=>'2026-11','from'=>'2026-11-03','to'=>'2026-11-03']);check(count($report['rows'])===1&&$report['rows'][0]['user_id']==='u1','supervisor vê apenas seu escopo');
$self=$store->report($u1,['month'=>'2026-11','from'=>'2026-11-03','to'=>'2026-11-03','user_id'=>'u2']);check(count($self['rows'])===0,'vendedor não consulta outra pessoa');
invalid(fn()=>$store->save($u1,[...$body,'supervisor_id'=>'partner']));
$before=$db->reports;$db->fail=true;try{$store->save($u1,[...$body,'boletos_solicitados'=>5]);throw new RuntimeException('Não falhou');}catch(RuntimeException $e){check($db->reports===$before,'falha na auditoria reverte atualização');}
$db->fail=false;
invalid(fn()=>DailyProductionRules::validate([...$valid,'detalhes_boletos'=>str_repeat('a',2001)]));
$detailBody=[...$body,'detalhes_boletos'=>'B-123 — Maria','detalhes_propostas'=>'P-987 — José'];
$withDetails=$store->save($u1,$detailBody);check($withDetails['detalhes_boletos']==='B-123 — Maria','salva detalhes do boleto');
$legacy=$store->save($u1,$body);check($legacy['detalhes_propostas']==='P-987 — José','cliente antigo não apaga detalhes existentes');
$withZero=$store->save($u1,[...$body,'boletos_solicitados'=>0,'justificativa_boletos'=>'Sem retorno']);check($withZero['detalhes_boletos']==='','zero não mantém detalhe antigo de produção positiva');
$db->fail=true;
try{$store->deleteRecord($u1,['work_date'=>'2026-11-03']);throw new RuntimeException('Não falhou');}catch(RuntimeException $e){check(isset($db->reports['u1|2026-11-03']),'falha de auditoria não remove registro');}
$db->fail=false;
try{$store->deleteRecord($db->users[2],['work_date'=>'2026-11-03']);throw new RuntimeException('Gestor excluiu registro');}catch(RuntimeException $e){check($e->getCode()===403,'gestor não exclui registro pelo vendedor');}
try{$store->deleteRecord($u1,['work_date'=>'2026-11-03','expected_updated_at'=>'outra-versao']);throw new RuntimeException('Excluiu versão alterada');}catch(RuntimeException $e){check($e->getCode()===409,'protege registro atualizado');}
$store->deleteRecord($u1,['work_date'=>'2026-11-03','user_id'=>'u2']);
check(!isset($db->reports['u1|2026-11-03'])&&isset($db->reports['u2|2026-11-03']),'exclui apenas o próprio registro mesmo com identidade adulterada');
check(json_decode($db->history[count($db->history)-1][4],true)['deleted']===true,'audita exclusão');
echo "PASS: prazo 16h40, dias úteis, justificativas, identidade, supervisores, escopo, revisão e rollback (PDO simulado).\n";
