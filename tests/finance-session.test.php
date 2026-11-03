<?php
declare(strict_types=1);
require_once __DIR__.'/../api/lib/FinanceSession.php';
soublu_finance_session_start();
class SessionPDO extends PDO {
 public array $users=['u1'=>['id'=>'u1','role'=>'prestador','active'=>1],'u2'=>['id'=>'u2','role'=>'prestador','active'=>1],'fin'=>['id'=>'fin','role'=>'financeiro','active'=>1]];
 public array $suppliers=[['id'=>'s1','linked_user_id'=>'u1','active'=>1],['id'=>'s2','linked_user_id'=>'u2','active'=>1]];
 public function __construct(){}
 public function prepare(string $query,array $options=[]):PDOStatement|false{return new SessionStatement($this,$query);}
}
class SessionStatement extends PDOStatement {
 private array $result=[];
 public function __construct(private SessionPDO $db,private string $sql){}
 public function execute(?array $params=null):bool{if(str_contains($this->sql,'finance_suppliers'))$this->result=array_values(array_filter($this->db->suppliers,fn($r)=>$r['linked_user_id']===$params[0]));else $this->result=isset($this->db->users[$params[0]])?[$this->db->users[$params[0]]]:[];return true;}
 public function fetch(int $mode=PDO::FETCH_DEFAULT,int $cursorOrientation=PDO::FETCH_ORI_NEXT,int $cursorOffset=0):mixed{return $this->result[0]??false;}
 public function fetchAll(int $mode=PDO::FETCH_DEFAULT,mixed ...$args):array{return $this->result;}
}
function expectFailure(callable $fn,int $code):void{try{$fn();throw new RuntimeException('Acesso indevido');}catch(RuntimeException $e){if($e->getCode()!==$code)throw $e;}}
$db=new SessionPDO();$_SESSION=[];expectFailure(fn()=>soublu_finance_user($db),401);
$_SESSION=['finance_user'=>'u1','finance_until'=>time()+100,'finance_csrf'=>'secret'];$u=soublu_finance_user($db);if(soublu_finance_supplier($db,$u)['id']!=='s1')throw new RuntimeException('Vazou prestador');expectFailure(fn()=>soublu_finance_user($db,true),403);
$db->suppliers[]=['id'=>'s3','linked_user_id'=>'u1','active'=>1];expectFailure(fn()=>soublu_finance_supplier($db,$u),403);
$db->users['u1']['active']=0;expectFailure(fn()=>soublu_finance_user($db),403);
expectFailure(fn()=>soublu_finance_csrf(),403);$_SERVER['HTTP_X_FINANCE_CSRF']='secret';soublu_finance_csrf();
$_SESSION['finance_user']='fin';if(soublu_finance_user($db,true)['id']!=='fin')throw new RuntimeException('Financeiro inválido');expectFailure(fn()=>soublu_finance_supplier($db,$db->users['fin']),403);
echo "PASS: sessão, perfil financeiro, vínculo exclusivo, conta inativa e CSRF (PDO simulado).\n";
