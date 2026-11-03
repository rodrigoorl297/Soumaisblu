<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli') { http_response_code(403);exit; }
require_once __DIR__.'/bootstrap.php';
require_once __DIR__.'/lib/FinanceWorkbookMysqlSchema.php';
require_once __DIR__.'/lib/FinanceSchedule.php';
try { $pdo=soublu_pdo();soublu_ensure_finance_workbook($pdo);$results=soublu_run_finance_schedules($pdo);echo json_encode($results,JSON_UNESCAPED_UNICODE).PHP_EOL;exit(count(array_filter($results,fn($r)=>$r['status']==='erro'))?1:0); }
catch(Throwable $e) { fwrite(STDERR,"Rotina financeira indisponível: ".$e->getMessage().PHP_EOL);exit(1); }
