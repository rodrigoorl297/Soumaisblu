<?php
declare(strict_types=1);
require_once __DIR__.'/bootstrap.php';
require_once __DIR__.'/lib/DailyProduction.php';
header('Cache-Control: no-store');

function daily_reply(array $value,int $code=200): never {
    http_response_code($code);header('Content-Type: application/json; charset=utf-8');echo json_encode($value,JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE);exit;
}
function daily_session(): void {
    if(session_status()===PHP_SESSION_ACTIVE)return;
    session_name('soublu_daily');session_set_cookie_params(['httponly'=>true,'secure'=>!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off','samesite'=>'Strict','path'=>'/']);session_start();
}
function daily_status(DailyProductionStore $store,array $user): array {
    $eligible=strtolower(trim((string)$user['role']))==='vendedor';$now=DailyProductionRules::now();
    $pending=$eligible?$store->pending($user,$now):[];
    return ['ok'=>true,'user'=>['id'=>$user['id'],'name'=>$user['name'],'role'=>$user['role']],'eligible'=>$eligible,'can_report'=>$eligible||in_array(strtolower((string)$user['role']),DailyProductionRules::MANAGERS,true),'pending'=>$pending,'blocked'=>(bool)$pending,'today'=>$now->format('Y-m-d'),'server_time'=>$now->format(DATE_ATOM),'deadline'=>DailyProductionRules::DEADLINE,'start_date'=>$eligible?$store->startFor($user):null,'supervisors'=>$eligible?$store->supervisors($user):['options'=>[],'preferred'=>''],'csrf'=>$_SESSION['daily_csrf']];
}
try {
    daily_session();$action=(string)($_GET['action'] ?? 'status');$method=$_SERVER['REQUEST_METHOD'] ?? 'GET';
    if($method==='POST' && isset($_SERVER['HTTP_ORIGIN'])) {
        $origin=parse_url($_SERVER['HTTP_ORIGIN']);$host=(string)($origin['host'] ?? '').(isset($origin['port'])?':'.$origin['port']:'');
        if(strcasecmp($host,(string)($_SERVER['HTTP_HOST'] ?? ''))!==0)throw new RuntimeException('Origem inválida.',403);
    }
    if($action==='logout' && $method==='POST'){$_SESSION=[];session_destroy();daily_reply(['ok'=>true]);}
    $body=$method==='POST'?json_decode(file_get_contents('php://input'),true):[];
    if($method==='POST'&&!is_array($body))throw new RuntimeException('Dados inválidos.',400);
    $pdo=soublu_pdo();$store=new DailyProductionStore($pdo);
    // Connect the module to the same authenticated API contract used by the main app.
    if($action==='resume' && $method==='POST') {
        if(!soublu_api_auth_ok())throw new RuntimeException('Não autorizado.',401);
        $id=(string)($body['id'] ?? '');
        if($id==='' || !hash_equals($id,(string)($_SERVER['HTTP_X_DAILY_USER'] ?? '')))throw new RuntimeException('Sessão do sistema inválida.',401);
        $user=$store->user($id);
        if(!$user || !(int)$user['active'])throw new RuntimeException('Conta inativa.',403);
        if(strtolower((string)$user['role'])!=='vendedor'&&!in_array(strtolower((string)$user['role']),DailyProductionRules::MANAGERS,true))throw new RuntimeException('Seu perfil não utiliza este formulário.',403);
        session_regenerate_id(true);$_SESSION['daily_user']=$user['id'];$_SESSION['daily_until']=time()+28800;$_SESSION['daily_csrf']=bin2hex(random_bytes(32));
        $store->ensureSchema();daily_reply(daily_status($store,$user));
    }
    if($action==='login' && $method==='POST') {
        if((int)($_SESSION['daily_failures'] ?? 0)>=8 && time()<(int)($_SESSION['daily_retry'] ?? 0))throw new RuntimeException('Aguarde cinco minutos para tentar novamente.',429);
        $user=$store->user((string)($body['id'] ?? ''));$input=(string)($body['password'] ?? '');$password=(string)($user['password'] ?? '');
        $valid=$input!==''&&$password!==''&&(password_get_info($password)['algo']!==null?password_verify($input,$password):hash_equals($password,$input));
        if(!$user||!$valid||!(int)$user['active']){$_SESSION['daily_failures']=(int)($_SESSION['daily_failures'] ?? 0)+1;$_SESSION['daily_retry']=time()+300;throw new RuntimeException('Usuário ou senha inválidos.',401);}
        if(strtolower((string)$user['role'])!=='vendedor'&&!in_array(strtolower((string)$user['role']),DailyProductionRules::MANAGERS,true))throw new RuntimeException('Seu perfil não utiliza este formulário.',403);
        session_regenerate_id(true);$_SESSION['daily_user']=$user['id'];$_SESSION['daily_until']=time()+28800;$_SESSION['daily_csrf']=bin2hex(random_bytes(32));$_SESSION['daily_failures']=0;
        $store->ensureSchema();daily_reply(daily_status($store,$user));
    }
    if($action==='health') {
        if(!soublu_api_auth_ok())throw new RuntimeException('Não autorizado.',401);
        $store->ensureSchema();$settings=$pdo->query('SELECT start_date,deadline FROM daily_production_settings WHERE id=1')->fetch();daily_reply(['ok'=>true,'settings'=>$settings,'enrolled_sellers'=>(int)$pdo->query('SELECT COUNT(*) FROM daily_production_enrollments')->fetchColumn(),'reports'=>(int)$pdo->query('SELECT COUNT(*) FROM daily_production_reports')->fetchColumn()]);
    }
    if(empty($_SESSION['daily_user'])||time()>(int)($_SESSION['daily_until'] ?? 0))throw new RuntimeException('Entre no SOU+BLU para acessar a produção diária.',401);
    $user=$store->user((string)$_SESSION['daily_user']);if(!$user||!(int)$user['active'])throw new RuntimeException('Conta inativa.',403);
    if(isset($_SERVER['HTTP_X_DAILY_USER'])&&!hash_equals((string)$user['id'],(string)$_SERVER['HTTP_X_DAILY_USER']))throw new RuntimeException('Entre no SOU+BLU com o usuário atual.',401);
    if($method==='POST' && (empty($_SESSION['daily_csrf'])||!hash_equals($_SESSION['daily_csrf'],(string)($_SERVER['HTTP_X_DAILY_CSRF'] ?? ''))))throw new RuntimeException('Atualize a sessão para salvar os dados.',403);
    $store->ensureSchema();
    if($action==='status'&&$method==='GET')daily_reply(daily_status($store,$user));
    if($action==='record'&&$method==='GET')daily_reply(['ok'=>true,'record'=>$store->record((string)$user['id'],(string)($_GET['date'] ?? ''))]);
    if($action==='save'&&$method==='POST'){$saved=$store->save($user,$body);daily_reply([...daily_status($store,$user),'record'=>$saved]);}
    if($action==='delete'&&$method==='POST'){$store->deleteRecord($user,$body);daily_reply([...daily_status($store,$user),'deleted_date'=>$body['work_date']]);}
    if($action==='report'&&$method==='GET')daily_reply(['ok'=>true,...$store->report($user,$_GET)]);
    throw new RuntimeException('Ação inválida.',400);
} catch(Throwable $error) {
    if(isset($pdo)&&$pdo->inTransaction())$pdo->rollBack();
    $code=in_array($error->getCode(),[400,401,403,404,409,429],true)?$error->getCode():503;
    error_log('[DailyProduction] '.($code===503?'service unavailable':(string)$code));
    daily_reply(['ok'=>false,'message'=>$code===503?'A produção diária está indisponível. Tente novamente em instantes.':$error->getMessage()],$code);
}
