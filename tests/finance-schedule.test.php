<?php
declare(strict_types=1);
require_once __DIR__.'/../api/lib/FinanceSchedule.php';
class MemoryPDO extends PDO {
 public array $rows;public array $users;public array $tx=[];public bool $fail=false;private bool $inside=false;private array $backup=[];
 public function __construct(){ $this->rows=['s1'=>['id'=>'s1','kind'=>'futuro','data'=>json_encode(['usuario'=>'u1','actor'=>'fin','data'=>'2026-10-06','tipo'=>'credito','valor'=>'10.25','status'=>'programado'])]];$this->users=['u1'=>['id'=>'u1','active'=>1,'role'=>'parceiro','points'=>'100.00','balance'=>'100.00'],'fin'=>['id'=>'fin','active'=>1,'role'=>'financeiro']]; }
 public function beginTransaction():bool{$this->backup=[$this->rows,$this->users,$this->tx];$this->inside=true;return true;}
 public function commit():bool{$this->inside=false;return true;}
 public function rollBack():bool{[$this->rows,$this->users,$this->tx]=$this->backup;$this->inside=false;return true;}
 public function inTransaction():bool{return $this->inside;}
 public function prepare(string $query,array $options=[]):PDOStatement|false{return new MemoryStatement($this,$query);}
}
class MemoryStatement extends PDOStatement {
 private mixed $result=false;
 public function __construct(private MemoryPDO $db,private string $sql){}
 public function execute(?array $params=null):bool{
  $a=$params??[];$q=$this->sql;
  if(str_starts_with($q,'SELECT * FROM finance_workbook'))$this->result=$this->db->rows[$a[0]]??false;
  elseif(str_starts_with($q,'SELECT role,active')||str_starts_with($q,'SELECT * FROM users'))$this->result=$this->db->users[$a[0]]??false;
  elseif(str_starts_with($q,'INSERT INTO transactions')){if(isset($this->db->tx[$a[0]]))throw new RuntimeException('Duplicado');$this->db->tx[$a[0]]=$a;}
  elseif(str_starts_with($q,'UPDATE users')){$this->db->users[$a[2]]['balance']=$a[0];$this->db->users[$a[2]]['points']=$a[1];}
  elseif(str_starts_with($q,'UPDATE finance_workbook')){if($this->db->fail)throw new RuntimeException('Falha simulada');$this->db->rows[$a[1]]['data']=$a[0];}
  else throw new RuntimeException('SQL inesperado: '.$q);
  return true;
 }
 public function fetch(int $mode=PDO::FETCH_DEFAULT,int $cursorOrientation=PDO::FETCH_ORI_NEXT,int $cursorOffset=0):mixed{return $this->result;}
}
function check(bool $condition,string $message):void{if(!$condition)throw new RuntimeException($message);}
$db=new MemoryPDO();$r=soublu_execute_finance_schedule($db,'s1','2026-10-06');check($r['status']==='executado','executou');check($db->users['u1']['points']===110.25,'saldo exato');check(count($db->tx)===1,'extrato único');
$r=soublu_execute_finance_schedule($db,'s1','2026-10-06');check($r['status']==='ja_executado'&&count($db->tx)===1&&$db->users['u1']['points']===110.25,'idempotência');
$db=new MemoryPDO();$db->fail=true;try{soublu_execute_finance_schedule($db,'s1','2026-10-06');throw new RuntimeException('não falhou');}catch(RuntimeException $e){check($db->users['u1']['points']==='100.00'&&count($db->tx)===0,'rollback de saldo e extrato');}
$db=new MemoryPDO();$d=json_decode($db->rows['s1']['data'],true);$d['tipo']='debito';$d['valor']='200.00';$db->rows['s1']['data']=json_encode($d);$r=soublu_execute_finance_schedule($db,'s1','2026-10-06');check($r['status']==='saldo_insuficiente'&&count($db->tx)===0,'não faz débito parcial');
$db=new MemoryPDO();$r=soublu_execute_finance_schedule($db,'s1','2026-10-05');check($r['status']==='nao_vencido'&&count($db->tx)===0,'respeita data');
$db=new MemoryPDO();$db->users['fin']['role']='prestador';try{soublu_execute_finance_schedule($db,'s1','2026-10-06');throw new RuntimeException('autorizou indevidamente');}catch(RuntimeException $e){check(str_contains($e->getMessage(),'autorização'),'exige autor financeiro');check(count($db->tx)===0,'não credita');}
echo "PASS: lançamento, idempotência, rollback, saldo insuficiente, data e autorização (PDO simulado).\n";
