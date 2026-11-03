<?php
declare(strict_types=1);
require_once __DIR__.'/bootstrap.php';
require_once __DIR__.'/lib/FinanceSession.php';
require_once __DIR__.'/lib/FinanceWorkbookMysqlSchema.php';
require_once __DIR__.'/lib/FinanceSchedule.php';
header('Cache-Control: no-store');
function finance_reply(array $data,int $status=200): never { http_response_code($status);header('Content-Type: application/json; charset=utf-8');echo json_encode($data,JSON_UNESCAPED_UNICODE);exit; }
function finance_invoice_dir(): string { return defined('FINANCE_PRIVATE_DIR') ? (string)FINANCE_PRIVATE_DIR : dirname(__DIR__,2).'/soublu-private/provider-invoices'; }
function finance_send_invoice(string $id,?array $data): never {
    if(!$data || !preg_match('/^[a-f0-9]{32}$/',$id) || !in_array($data['extension'] ?? '',['pdf','png','jpg'],true))throw new RuntimeException('Arquivo não encontrado.',404);
    $path=finance_invoice_dir().'/'.$id.'.'.$data['extension'];if(!is_file($path))throw new RuntimeException('Arquivo não encontrado.',404);
    header('Content-Type: '.$data['mime']);header('X-Content-Type-Options: nosniff');header('Content-Disposition: attachment; filename="nota-fiscal.'.$data['extension'].'"');readfile($path);exit;
}
try {
    soublu_finance_session_start();
    $action=(string)($_GET['action'] ?? 'session');$method=$_SERVER['REQUEST_METHOD'] ?? 'GET';
    if($method==='POST' && isset($_SERVER['HTTP_ORIGIN'])) {
        $origin=parse_url($_SERVER['HTTP_ORIGIN']);
        if(strcasecmp((string)($origin['host'] ?? '').(isset($origin['port'])?':'.$origin['port']:''),(string)($_SERVER['HTTP_HOST'] ?? ''))!==0) throw new RuntimeException('Origem inválida.',403);
    }
    if($action==='logout') { $_SESSION=[];session_destroy();finance_reply(['ok'=>true]); }
    $body=$method==='POST' && empty($_FILES)?json_decode(file_get_contents('php://input'),true):[];
    $pdo=soublu_pdo();
    if($action==='login' && $method==='POST') {
        if((int)($_SESSION['finance_attempts'] ?? 0)>=8 && time()<(int)($_SESSION['finance_retry'] ?? 0)) throw new RuntimeException('Aguarde alguns minutos antes de tentar novamente.',429);
        $st=$pdo->prepare('SELECT id,password,role,active FROM users WHERE id=?');$st->execute([(string)($body['id'] ?? '')]);$user=$st->fetch();
        $password=(string)($body['password'] ?? '');$stored=(string)($user['password'] ?? '');
        $valid=$password!=='' && $stored!=='' && (password_get_info($stored)['algo']!==null ? password_verify($password,$stored):hash_equals($stored,$password));
        if(!$user || !$valid || !(int)$user['active']) { $_SESSION['finance_attempts']=(int)($_SESSION['finance_attempts'] ?? 0)+1;$_SESSION['finance_retry']=time()+300;throw new RuntimeException('Login ou senha inválidos.',401); }
        if(!in_array(strtolower((string)$user['role']),['master','fundador','financeiro','financial','prestador'],true)) throw new RuntimeException('Sem acesso a este módulo.',403);
        session_regenerate_id(true);$_SESSION['finance_attempts']=0;$_SESSION['finance_user']=$user['id'];$_SESSION['finance_until']=time()+28800;$_SESSION['finance_csrf']=bin2hex(random_bytes(32));
        finance_reply(['ok'=>true,'csrf'=>$_SESSION['finance_csrf'],'user_id'=>$user['id']]);
    }
    $internal=in_array($action,['schedule_save','schedule_run','queue','review','finance_record','invoice_file_finance','supplier_link','supplier_account'],true);
    $user=soublu_finance_user($pdo,$internal);
    if($method==='POST') soublu_finance_csrf();
    soublu_ensure_finance_workbook($pdo);
    if($action==='session') finance_reply(['ok'=>true,'user_id'=>$user['id'],'csrf'=>$_SESSION['finance_csrf']]);
    if($action==='schedule_run' && $method==='POST') finance_reply(['ok'=>true,'results'=>soublu_run_finance_schedules($pdo)]);
    if($action==='schedule_save' && $method==='POST') {
        $id=(string)($body['id'] ?? '');$data=$body['data'] ?? [];
        if(!preg_match('/^[a-zA-Z0-9_-]{1,64}$/',$id) || !is_array($data)) throw new RuntimeException('Registro inválido.',400);
        $amount=soublu_finance_schedule_amount($data);
        $st=$pdo->prepare('SELECT * FROM users WHERE id=?');$st->execute([(string)($data['usuario'] ?? '')]);$target=$st->fetch();if(!$target || !(int)$target['active']) throw new RuntimeException('Destinatário inativo ou inexistente.',400);
        if(!soublu_schedule_money_wallet($pdo,$target) && $amount%100!==0)throw new RuntimeException('A carteira deste usuário usa pontos inteiros. Ajuste o valor.',400);
        $pdo->beginTransaction();
        $st=$pdo->prepare('SELECT data,kind FROM finance_workbook WHERE id=? FOR UPDATE');$st->execute([$id]);$old=$st->fetch();
        if($old && ($old['kind']!=='futuro' || (json_decode($old['data'],true)['status'] ?? '')!=='programado')) throw new RuntimeException('Este lançamento não pode ser alterado.',409);
        $data=array_intersect_key($data,array_flip(['usuario','data','tipo','valor','descricao','status']));
        $data['status']=($data['status'] ?? '')==='cancelado'?'cancelado':'programado';$data['actor']=$user['id'];
        $st=$pdo->prepare($old?'UPDATE finance_workbook SET data=?,updated_at=NOW() WHERE id=?':"INSERT INTO finance_workbook(data,id,kind) VALUES (?,?,'futuro')");$st->execute([json_encode($data),$id]);$pdo->commit();
        finance_reply(['ok'=>true,'record'=>['id'=>$id,'kind'=>'futuro','data'=>$data]]);
    }
    if($action==='finance_record' && $method==='POST') {
        $id=(string)($body['id'] ?? '');$kind=(string)($body['kind'] ?? '');$data=$body['data'] ?? [];
        if(!preg_match('/^[a-zA-Z0-9_-]{1,64}$/',$id) || !in_array($kind,['comissao','enquadramento','clube','fechamento','settings'],true) || !is_array($data))throw new RuntimeException('Cadastro inválido.',400);
        $data['actor']=$user['id'];
        if($kind==='settings' && (!isset($data['irpf']) || !is_numeric($data['irpf']) || $data['irpf']<0 || $data['irpf']>1))throw new RuntimeException('IRPF inválido.',400);
        $pdo->beginTransaction();
        $st=$pdo->prepare('SELECT kind FROM finance_workbook WHERE id=? FOR UPDATE');$st->execute([$id]);$old=$st->fetchColumn();
        if($old && ($old!==$kind || $kind==='fechamento'))throw new RuntimeException('Registro já existente ou encerrado.',409);
        if($kind==='clube') {
            $st=$pdo->prepare('SELECT id FROM finance_workbook WHERE id=? FOR UPDATE');$st->execute(['clube-'.($data['mes'] ?? '').'-'.($data['usuario'] ?? '')]);if($st->fetch())throw new RuntimeException('Mês já fechado.',409);
        }
        $st=$pdo->prepare($old?'UPDATE finance_workbook SET data=?,updated_at=NOW() WHERE id=?':"INSERT INTO finance_workbook(data,id,kind) VALUES (?,?,?)");
        $st->execute($old?[json_encode($data),$id]:[json_encode($data),$id,$kind]);$pdo->commit();finance_reply(['ok'=>true,'record'=>['id'=>$id,'kind'=>$kind,'data'=>$data]]);
    }
    if($action==='supplier_account' && $method==='POST') {
        $supplierId=(string)($body['supplier_id'] ?? '');$email=strtolower(trim((string)($body['email'] ?? '')));$password=(string)($body['password'] ?? '');
        if(!filter_var($email,FILTER_VALIDATE_EMAIL) || strlen($password)<8 || strlen($password)>128)throw new RuntimeException('Informe e-mail válido e senha de 8 a 128 caracteres.',400);
        $pdo->beginTransaction();$st=$pdo->prepare('SELECT * FROM finance_suppliers WHERE id=? FOR UPDATE');$st->execute([$supplierId]);$supplier=$st->fetch();
        if(!$supplier || !empty($supplier['linked_user_id']))throw new RuntimeException('Prestador inexistente ou já vinculado.',409);
        $st=$pdo->prepare('SELECT id FROM users WHERE LOWER(email)=?');$st->execute([$email]);if($st->fetch())throw new RuntimeException('E-mail já cadastrado. Vincule o login existente.',409);
        $id='psu-'.bin2hex(random_bytes(12));$st=$pdo->prepare("INSERT INTO users(id,name,email,password,matricula,department,role,balance,points,active,created_at) VALUES (?,?,?,?,?,'Serviços','prestador',0,0,1,NOW())");$st->execute([$id,$supplier['name'],$email,password_hash($password,PASSWORD_DEFAULT),'PS'.bin2hex(random_bytes(5))]);
        $st=$pdo->prepare('UPDATE finance_suppliers SET linked_user_id=? WHERE id=?');$st->execute([$id,$supplierId]);$pdo->commit();finance_reply(['ok'=>true,'user_id'=>$id]);
    }
    if($action==='supplier_link' && $method==='POST') {
        $pdo->beginTransaction();
        $supplierId=(string)($body['supplier_id'] ?? '');$linked=(string)($body['user_id'] ?? '');
        if($linked!=='') {
            $st=$pdo->prepare("SELECT id FROM users WHERE id=? AND active=1 AND role='prestador' FOR UPDATE");$st->execute([$linked]);if(!$st->fetch())throw new RuntimeException('Selecione um login ativo com perfil prestador.',400);
            $st=$pdo->prepare('SELECT id FROM finance_suppliers WHERE linked_user_id=? AND id<>?');$st->execute([$linked,$supplierId]);if($st->fetch())throw new RuntimeException('Este login já está vinculado a outro prestador.',409);
        }
        $st=$pdo->prepare('UPDATE finance_suppliers SET linked_user_id=? WHERE id=?');$st->execute([$linked?:null,$supplierId]);$pdo->commit();finance_reply(['ok'=>true]);
    }
    if($action==='queue') {
        $st=$pdo->query("SELECT id,kind,data,created_at FROM finance_workbook WHERE kind IN ('nota_fiscal','chamado_prestador') ORDER BY created_at DESC LIMIT 500");$rows=$st->fetchAll();foreach($rows as &$r)$r['data']=json_decode($r['data'],true);unset($r);finance_reply(['ok'=>true,'records'=>$rows]);
    }
    if($action==='review' && $method==='POST') {
        $status=(string)($body['status'] ?? '');$response=trim((string)($body['response'] ?? ''));
        if(!in_array($status,['em_analise','concluido','devolvido'],true) || strlen($response)>20000)throw new RuntimeException('Resposta inválida.',400);
        $pdo->beginTransaction();$st=$pdo->prepare("SELECT data FROM finance_workbook WHERE id=? AND kind IN ('nota_fiscal','chamado_prestador') FOR UPDATE");$st->execute([(string)($body['id'] ?? '')]);$raw=$st->fetchColumn();if(!$raw)throw new RuntimeException('Registro não encontrado.',404);
        $data=json_decode($raw,true);$data['status']=$status;$data['response']=$response;$data['reviewed_by']=$user['id'];$data['reviewed_at']=date(DATE_ATOM);
        $st=$pdo->prepare('UPDATE finance_workbook SET data=?,updated_at=NOW() WHERE id=?');$st->execute([json_encode($data),$body['id']]);$pdo->commit();finance_reply(['ok'=>true]);
    }
    if($action==='invoice_file_finance') {
        $st=$pdo->prepare("SELECT data FROM finance_workbook WHERE id=? AND kind='nota_fiscal'");$st->execute([(string)($_GET['id'] ?? '')]);$data=json_decode((string)$st->fetchColumn(),true);$id=(string)($_GET['id'] ?? '');
        finance_send_invoice($id,$data);
    }
    $supplier=soublu_finance_supplier($pdo,$user);
    if($action==='portal') {
        $st=$pdo->prepare("SELECT id,kind,data,created_at FROM finance_workbook WHERE kind IN ('nota_fiscal','chamado_prestador') AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.supplier_id'))=? ORDER BY created_at DESC LIMIT 200");$st->execute([$supplier['id']]);$documents=$st->fetchAll();foreach($documents as &$row)$row['data']=json_decode($row['data'],true);unset($row);
        $st=$pdo->prepare('SELECT id,type,amount,reason,created_at FROM transactions WHERE employee_id=? ORDER BY created_at DESC LIMIT 120');$st->execute([$user['id']]);$lines=$st->fetchAll();
        $st=$pdo->prepare("SELECT id,amount,status,created_at FROM withdrawals WHERE JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(notes),notes,'{}'),'$.supplier_id'))=? ORDER BY created_at DESC LIMIT 120");$st->execute([$supplier['id']]);
        finance_reply(['ok'=>true,'supplier'=>['id'=>$supplier['id'],'name'=>$supplier['name']],'balance'=>(float)($user['points'] ?? $user['balance'] ?? 0),'lines'=>$lines,'payments'=>$st->fetchAll(),'records'=>$documents]);
    }
    if($action==='ticket' && $method==='POST') {
        $subject=trim((string)($body['subject'] ?? ''));$message=trim((string)($body['message'] ?? ''));
        if($subject==='' || $message==='' || strlen($subject)>800 || strlen($message)>40000) throw new RuntimeException('Informe assunto e mensagem dentro do limite.',400);
        $data=['supplier_id'=>$supplier['id'],'supplier_name'=>$supplier['name'],'user_id'=>$user['id'],'subject'=>$subject,'message'=>$message,'status'=>'aberto','department'=>'Financeiro'];
        $st=$pdo->prepare("INSERT INTO finance_workbook(id,kind,data) VALUES (?,'chamado_prestador',?)");$st->execute([bin2hex(random_bytes(16)),json_encode($data)]);finance_reply(['ok'=>true]);
    }
    if($action==='invoice' && $method==='POST') {
        $file=$_FILES['file'] ?? null;$month=(string)($_POST['month'] ?? '');
        if(!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/',$month) || !$file || $file['error']!==UPLOAD_ERR_OK || $file['size']>10*1024*1024) throw new RuntimeException('Envie uma nota fiscal de até 10 MB e informe o mês.',400);
        $mime=(new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);$ext=['application/pdf'=>'pdf','image/png'=>'png','image/jpeg'=>'jpg'][$mime] ?? null;if(!$ext) throw new RuntimeException('Use PDF, PNG ou JPG.',400);
        $id=bin2hex(random_bytes(16));$dir=finance_invoice_dir();if(!is_dir($dir) && !mkdir($dir,0700,true)) throw new RuntimeException('Armazenamento indisponível.');
        $path=$dir.'/'.$id.'.'.$ext;if(!move_uploaded_file($file['tmp_name'],$path)) throw new RuntimeException('Falha ao guardar nota fiscal.');
        $data=['supplier_id'=>$supplier['id'],'supplier_name'=>$supplier['name'],'user_id'=>$user['id'],'month'=>$month,'file_name'=>basename($file['name']),'extension'=>$ext,'mime'=>$mime,'status'=>'enviada'];
        try { $st=$pdo->prepare("INSERT INTO finance_workbook(id,kind,data) VALUES (?,'nota_fiscal',?)");$st->execute([$id,json_encode($data)]); } catch(Throwable $e) {unlink($path);throw $e;}
        finance_reply(['ok'=>true]);
    }
    if($action==='invoice_file') {
        $st=$pdo->prepare("SELECT data FROM finance_workbook WHERE id=? AND kind='nota_fiscal'");$st->execute([(string)($_GET['id'] ?? '')]);$data=json_decode((string)$st->fetchColumn(),true);
        if(!$data || $data['supplier_id']!==$supplier['id']) throw new RuntimeException('Arquivo não encontrado.',404);
        finance_send_invoice((string)$_GET['id'],$data);
    }
    throw new RuntimeException('Ação inválida.',400);
} catch(Throwable $e) { if(isset($pdo) && $pdo->inTransaction())$pdo->rollBack();$code=in_array($e->getCode(),[400,401,403,404,409,429],true)?$e->getCode():503;finance_reply(['ok'=>false,'message'=>$code===503?'Módulo indisponível. Verifique a configuração MySQL do servidor.':$e->getMessage()],$code); }
