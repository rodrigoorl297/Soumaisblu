<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli-server' || !in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) {
    http_response_code(404);
    exit;
}
?>
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SOU+BLU · Crédito Pessoal Mercantil</title>
  <style>
    *{box-sizing:border-box}body{margin:0;display:grid;grid-template-columns:250px minmax(0,1fr);min-height:100vh;font:15px/1.5 system-ui,sans-serif;color:#142746;background:#f4f6fa}
    aside{background:#0c234b;color:#fff;padding:24px 14px}.brand{font-size:22px;font-weight:800;padding:0 10px}.nav-group{margin:24px 10px 8px;color:#a9bad8;font-size:12px;font-weight:700}
    .sidebar-nav{display:grid;gap:4px}.nav-item{border:0;border-radius:8px;background:none;color:#fff;text-align:left;padding:11px 10px;display:flex;align-items:center;gap:8px;font:inherit;cursor:pointer}
    .nav-icon{display:flex}.nav-item:hover,.nav-item.active{background:#25477e}.nav-item:focus-visible{outline:2px solid #fdbb63;outline-offset:2px}
    header{background:#fff;border-bottom:1px solid #dce4f0;padding:17px 24px;font-weight:700}.section{display:none}.section.active{display:block}.credit-home{margin:24px}.credit-home p{color:#445674}
    @media(max-width:700px){body{grid-template-columns:1fr}aside{padding:14px}.nav-group{margin-top:12px}.sidebar-nav{grid-template-columns:repeat(2,minmax(0,1fr))}.nav-group{grid-column:1/-1}}
  </style>
</head>
<body>
  <aside><div class="brand">SOU + BLU</div>
    <nav class="sidebar-nav" aria-label="Gestão">
      <div class="nav-group">GESTÃO</div>
      <button type="button" class="nav-item" id="navGestaoCredito" data-section="secCreditoLocal"><span class="nav-label">Gestão de Crédito</span></button>
    </nav>
  </aside>
  <div id="mainArea">
    <header id="topbarTitle">Gestão de Crédito</header>
    <main class="page-content">
      <section id="secCreditoLocal" class="section credit-home">
        <h1>Gestão de Crédito</h1>
        <p>Selecione Crédito Pessoal Mercantil no menu para abrir a demonstração.</p>
      </section>
    </main>
  </div>
  <script src="/?asset=esteira"></script>
  <script>
    window.SoubluMercantilPreviewUrl = '/?flow=1';
    window.EsteiraCompraDivida.mountMercantilPreview();
    document.getElementById('navGestaoCredito').addEventListener('click', () => {
      document.querySelectorAll('.section,.nav-item').forEach(element => {
        element.classList.toggle('active', ['secCreditoLocal','navGestaoCredito'].includes(element.id));
      });
      document.getElementById('topbarTitle').textContent = 'Gestão de Crédito';
    });
    document.getElementById('navMercantilCredito').click();
  </script>
</body>
</html>
