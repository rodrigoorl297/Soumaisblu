import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const rhPath = path.join(root, 'pages', 'rh-manager.html');
const embedPath = path.join(root, 'pages', 'folha-embed.html');

let embed = fs.readFileSync(embedPath, 'utf8');
embed = embed.replace('class="rh-folha-inline" hidden', 'class="rh-folha-inline"');
const embedIndented = embed.split('\n').map(l => '              ' + l).join('\n');

let rh = fs.readFileSync(rhPath, 'utf8');

const stackRe = /(<div class="card card-padded" id="rhRelatorioPanel" aria-live="polite">\s*<div class="rh-relatorio-stack">\s*)<div id="rhRelatorioContent" class="rh-relatorio-content"><\/div>(\s*<\/div>\s*<\/div>)/;
if (!stackRe.test(rh)) {
  console.error('Stack marker not found');
  process.exit(1);
}
rh = rh.replace(
  stackRe,
  `$1\n${embedIndented}\n              <div id="rhRelatorioContent" class="rh-relatorio-content" hidden></div>$2`
);

if (!rh.includes('folha-pagamento.css')) {
  rh = rh.replace(
    '<link rel="stylesheet" href="../css/painel-sonhos.css?v=6"/>',
    '<link rel="stylesheet" href="../css/painel-sonhos.css?v=6"/>\n  <link rel="stylesheet" href="../css/folha-pagamento.css?v=1"/>'
  );
}
if (!rh.includes('xlsx.full.min.js')) {
  rh = rh.replace(
    '<link rel="stylesheet" href="../css/folha-pagamento.css?v=1"/>',
    '<link rel="stylesheet" href="../css/folha-pagamento.css?v=1"/>\n  <script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>'
  );
}

rh = rh.replace(
  '<strong>Folha de Pagamento</strong>\n              <span>Gere a folha mensal e exporte em planilha</span>',
  '<strong>Gerar Folha Funcionário</strong>\n              <span>Protocolo automático, empresa, mês, funcionários com PIX — salvar e exportar Excel</span>'
);

rh = rh.replace(
  `.rh-folha-embed-wrap {
      width: 100%;
      min-height: 780px;
      background: var(--color-bg, #f8fafc);
    }
    .rh-folha-iframe {
      display: block;
      width: 100%;
      min-height: 780px;
      height: 82vh;
      border: 0;
      background: #fff;
    }`,
  `.rh-folha-inline { width: 100%; }
    #rhFolhaEmbedRoot[hidden],
    #rhRelatorioContent[hidden] { display: none !important; }`
);

if (!rh.includes('folha-pagamento.js')) {
  rh = rh.replace(
    '<script charset="UTF-8" src="../js/rh-relatorios.js?v=6"></script>',
    '<script charset="UTF-8" src="../js/folha-pagamento.js?v=7"></script>\n  <script charset="UTF-8" src="../js/rh-relatorios.js?v=7"></script>'
  );
} else {
  rh = rh.replace(/rh-relatorios\.js\?v=\d+/g, 'rh-relatorios.js?v=7');
  rh = rh.replace(/folha-pagamento\.js\?v=\d+/g, 'folha-pagamento.js?v=7');
}

fs.writeFileSync(rhPath, rh);
console.log('rh-manager.html updated');
