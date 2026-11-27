<?php
declare(strict_types=1);

// Prévia isolada. Executar com php -S 127.0.0.1:8766 -t tools/mercantil-preview.
if (PHP_SAPI !== 'cli-server' || !in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) {
    http_response_code(404);
    exit;
}
header('Cache-Control: no-store');
if (($_GET['asset'] ?? '') === 'esteira') {
    header('Content-Type: application/javascript; charset=utf-8');
    readfile(__DIR__ . '/../../js/esteira-compra-divida.js');
    exit;
}
if (!isset($_GET['flow'])) {
    require __DIR__ . '/panel.php';
    exit;
}
require_once __DIR__ . '/../../api/lib/MercantilCreditWorkflow.php';
session_name('soublu_mercantil_preview');
session_start();

const DEMO_PROSPECT = '00000000-0000-4000-8000-000000000001';
const DEMO_OFFERS = [
    ['id'=>'12m', 'amount'=>1500, 'installments'=>12, 'payment'=>168],
    ['id'=>'18m', 'amount'=>1500, 'installments'=>18, 'payment'=>124],
];
$stages = ['Pré-simulação', 'Autorização', 'Ofertas', 'Formalização', 'Andamento'];
$state = $_SESSION['proposal'] ?? [];
$stage = (int) ($state['stage'] ?? 0);
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['reset'])) {
        unset($_SESSION['proposal']);
    } elseif (($_POST['stage'] ?? '') === (string) $stage && $stage < 4) {
        $transport = static fn($method, $url) => ['code'=>200, 'json'=>match (true) {
            str_contains($url, '/oauth/') => ['access_token'=>'demo', 'expires_in'=>3600],
            str_contains($url, '/IniciarPreSimulacao') => ['Id'=>DEMO_PROSPECT],
            str_contains($url, '/IniciarOperacao') => ['StatusProposta'=>'AguardandoAutorizacao'],
            str_contains($url, '/ValorEmprestimo') => ['Condicoes'=>DEMO_OFFERS],
            str_contains($url, '/Finalizacao') => ['NumeroOperacao'=>'DEMO-001'],
            default => throw new LogicException('Rota de demonstração não prevista.'),
        }];
        $client = new MercantilCreditClient('demo', 'demo', 'hml', $transport);
        $selection = null;
        foreach (DEMO_OFFERS as $offer) {
            if ($offer['id'] === ($_POST['offer'] ?? '')) $selection = $offer;
        }
        if ($stage !== 2 || $selection !== null) {
            $response = match ($stage) {
                0 => (new MercantilCreditWorkflow($client))->startPreSimulation('012.345.678-90'),
                1 => $client->execute('iniciar_operacao', ['Id'=>DEMO_PROSPECT, 'CpfCliente'=>1234567890]),
                2 => $client->execute('simular_emprestimo', ['Id'=>DEMO_PROSPECT, 'ValorEmprestimo'=>$selection['amount']]),
                3 => $client->execute('finalizar', ['Id'=>DEMO_PROSPECT]),
            };
            $_SESSION['proposal'] = [
                ...$state, 'stage'=>$stage + 1, 'results'=>[...($state['results'] ?? []), $response],
                'offer'=>$selection ?? ($state['offer'] ?? null),
            ];
        }
    }
    header('Location: /?flow=1', true, 303);
    exit;
}
function h(string $text): string { return htmlspecialchars($text, ENT_QUOTES, 'UTF-8'); }
function reais(int $amount): string { return 'R$ ' . number_format($amount, 2, ',', '.'); }
?>
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Crédito Pessoal Mercantil · SOU+BLU</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f6fa;color:#142746;font:15px/1.5 system-ui,sans-serif}header{background:#0c234b;color:white;padding:18px 5%;font-weight:750}main{max-width:990px;margin:32px auto;padding:0 20px}h1{font-size:clamp(26px,5vw,38px);line-height:1.15;margin:0}h2{font-size:20px;margin:0 0 12px}p{color:#445674}.notice{color:#754312;background:#fff2d9;border-radius:8px;padding:11px 14px}.layout{display:grid;grid-template-columns:210px 1fr;gap:18px}section,ol{background:white;border:1px solid #dce4f0;border-radius:12px;padding:20px;margin:0}ol{list-style-position:inside}li{padding:9px 0;color:#596982}li[aria-current]{color:#174b9b;font-weight:750}li.done{color:#166344}.choices{display:grid;gap:8px;padding:0;border:0;margin:0 0 14px}.choices label{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid #cdd9ed;border-radius:8px}button{font:inherit;font-weight:650;padding:9px 14px;border:0;border-radius:8px;background:#174b9b;color:white;cursor:pointer}button:focus-visible{outline:3px solid #da791e;outline-offset:3px}.reset{background:#e9eff9;color:#173d77;margin-top:14px}dt{font-weight:650}dd{margin:0 0 9px}details{margin-top:14px;color:#294c82}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f5fb;padding:12px}@media(max-width:620px){.layout{grid-template-columns:1fr}ol{display:flex;flex-wrap:wrap;gap:0 12px;padding:10px 16px}}
</style>
</head>
<body>
<main>
<h1>Crédito Pessoal Mercantil</h1>
<p class="notice">Demonstração local com dados fictícios. Nenhuma chamada é enviada ao banco.</p>
<div class="layout">
<ol aria-label="Etapas da proposta">
<?php foreach ($stages as $i => $label): ?>
  <li<?= $i === $stage ? ' aria-current="step"' : ($i < $stage ? ' class="done"' : '') ?>><?= h($label) ?></li>
<?php endforeach; ?>
</ol>
<section>
<h2><?= h($stages[$stage]) ?></h2>
<?php if ($stage < 4): ?>
<form method="post">
  <input type="hidden" name="stage" value="<?= $stage ?>">
  <?php if ($stage === 0): ?>
    <dl><dt>Cliente</dt><dd>Cliente de teste</dd><dt>CPF fictício</dt><dd>012.345.678-90</dd></dl>
    <button>Iniciar pré-simulação</button>
  <?php elseif ($stage === 1): ?>
    <p>Pré-simulação registrada. Na integração real, o Mercantil envia o resultado e gera o link de autorização do cliente.</p>
    <button>Simular retorno e autorização</button>
  <?php elseif ($stage === 2): ?>
    <fieldset class="choices">
      <legend>Condições de exemplo</legend>
      <?php foreach (DEMO_OFFERS as $i => $offer): ?>
        <label><input type="radio" name="offer" value="<?= h($offer['id']) ?>"<?= $i === 0 ? ' checked' : '' ?>>
        <?= reais($offer['amount']) ?> em <?= $offer['installments'] ?> parcelas de <?= reais($offer['payment']) ?></label>
      <?php endforeach; ?>
    </fieldset>
    <button>Selecionar oferta</button>
  <?php else: ?>
    <p>Oferta escolhida de <?= reais($state['offer']['amount']) ?> em <?= $state['offer']['installments'] ?> parcelas de <?= reais($state['offer']['payment']) ?>.</p>
    <button>Gerar formalização simulada</button>
  <?php endif; ?>
</form>
<?php else: ?>
<dl><dt>Operação de exemplo</dt><dd>DEMO-001</dd><dt>Situação</dt><dd>Aguardando formalização pelo cliente</dd></dl>
<?php endif; ?>
<?php if ($stage > 0): ?>
<details><summary>Ver histórico das respostas simuladas</summary><pre><?= h(json_encode($state['results'], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) ?></pre></details>
<?php endif; ?>
</section>
</div>
<form method="post"><button class="reset" name="reset" value="1">Reiniciar demonstração</button></form>
</main>
</body>
</html>
