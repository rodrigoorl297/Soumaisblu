/**
 * partner-comissao-tabela — planilha de comissão por parceiro (Excel).
 * Colunas: ID, BANCO, PRAZO, TABELA, ORGÃO, COMISSIONAMENTO, BÔNUS, VIGÊNCIA.
 * Grava em partners.meta.comissao_tabela — cada parceiro tem a sua (não altera código).
 */
(function () {
  var ALIAS = {
    id: ['id'],
    banco: ['banco'],
    prazo: ['prazo'],
    tabela: ['tabela'],
    orgao: ['orgao', 'órgão', 'orgao/convenio', 'convenio'],
    comissionamento: ['comissionamento', 'comissao', 'comissão', '%', 'percentual'],
    bonus: ['bonus', 'bônus', 'bonificacao'],
    vigencia: ['vigencia', 'vigência', 'vigencia']
  };
  var pending = null;

  function norm(s) {
    return String(s || '').toLowerCase().trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  /** pctCell — "30,00" / "30%" / 0,3 → taxa 0–1. */
  function pctCell(v) {
    var s = String(v == null ? '' : v).trim().replace('%', '').replace(/\s/g, '');
    if (!s) return 0;
    s = s.replace(',', '.');
    var n = parseFloat(s);
    if (!isFinite(n) || n < 0) return 0;
    if (n > 1) n = n / 100;
    return Math.round(n * 10000) / 10000;
  }

  function mapHeader(h) {
    var n = norm(h);
    for (var k in ALIAS) {
      if (ALIAS[k].some(function (a) { return n === a || n.indexOf(a) >= 0; })) return k;
    }
    return '';
  }

  function parseRows(rawRows) {
    if (!rawRows || !rawRows.length) return [];
    var headers = Object.keys(rawRows[0] || {});
    var map = {};
    headers.forEach(function (h) {
      var k = mapHeader(h);
      if (k && !map[k]) map[k] = h;
    });
    var out = [];
    rawRows.forEach(function (row, i) {
      var get = function (k) {
        var h = map[k];
        return h ? String(row[h] == null ? '' : row[h]).trim() : '';
      };
      var rate = pctCell(get('comissionamento'));
      var banco = get('banco');
      var tabela = get('tabela');
      if (!banco && !tabela && !rate) return;
      out.push({
        id: get('id') || String(i + 1),
        banco: banco,
        prazo: get('prazo'),
        tabela: tabela,
        orgao: get('orgao'),
        comissionamento: get('comissionamento'),
        rate: rate,
        bonus: get('bonus'),
        vigencia: get('vigencia')
      });
    });
    return out;
  }

  function parseVig(s) {
    var t = String(s || '').trim();
    if (!t) return 0;
    var m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (m) {
      var y = m[3].length === 2 ? '20' + m[3] : m[3];
      return Date.UTC(Number(y), Number(m[2]) - 1, Number(m[1]));
    }
    var d = Date.parse(t);
    return isNaN(d) ? 0 : d;
  }

  function vigenciaOk(row) {
    var ts = parseVig(row && row.vigencia);
    if (!ts) return true;
    return Date.now() >= ts;
  }

  function scoreRow(row, p) {
    if (!p) return 0;
    var tab = norm(p.tabela || '');
    var banco = norm(p.bancoComprado || p.banco_comprado || p.bancoDigitado || p.banco_digitado || '');
    var orgao = norm(p.convenio || p.entidade || p.orgao || '');
    var prazo = norm(p.prazo || '');
    var s = 0;
    if (row.tabela && tab && (tab === norm(row.tabela) || tab.indexOf(norm(row.tabela)) >= 0 || norm(row.tabela).indexOf(tab) >= 0)) s += 8;
    if (row.banco && banco && (banco === norm(row.banco) || banco.indexOf(norm(row.banco)) >= 0)) s += 4;
    if (row.orgao && orgao && (orgao === norm(row.orgao) || orgao.indexOf(norm(row.orgao)) >= 0)) s += 3;
    if (row.prazo && (prazo === norm(row.prazo) || tab.indexOf(norm(row.prazo)) >= 0)) s += 2;
    return s;
  }

  /**
   * lookup — escolhe a linha da planilha do parceiro para uma proposta.
   */
  function lookup(partner, proposal) {
    var meta = {};
    if (partner && typeof partner === 'object') {
      meta = partner.meta;
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch (_) { meta = {}; }
      }
    }
    var pack = meta && meta.comissao_tabela;
    var rows = pack && Array.isArray(pack.rows) ? pack.rows : [];
    if (!rows.length || !proposal) return null;
    var best = null;
    var bestS = 0;
    rows.forEach(function (r) {
      if (!vigenciaOk(r) || !r.rate) return;
      var s = scoreRow(r, proposal);
      if (s > bestS) { bestS = s; best = r; }
    });
    return bestS >= 4 ? best : null;
  }

  function ensureBox() {
    if (document.getElementById('partnerComissaoTabelaBox')) return;
    var sel = document.getElementById('partnerCommissionTier');
    if (!sel) return;
    var group = sel.closest('.form-group') || sel.parentElement;
    if (!group) return;
    sel.style.display = 'none';
    var hint = document.getElementById('partnerCommissionTierHint');
    if (hint) hint.style.display = 'none';
    var lab = group.querySelector('label');
    if (lab) lab.textContent = 'Tabela de comissão (Excel)';
    var box = document.createElement('div');
    box.id = 'partnerComissaoTabelaBox';
    box.innerHTML =
      '<input type="file" id="partnerComissaoXlsx" accept=".xlsx,.xls,.csv" style="font-size:13px;"/>' +
      '<div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">' +
      '<button type="button" class="btn btn-outline btn-sm" id="partnerComissaoModelo">Baixar modelo</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="partnerComissaoLimpar">Limpar planilha</button>' +
      '</div>' +
      '<small id="partnerComissaoTabelaHint" style="display:block;font-size:12px;margin-top:6px;color:var(--color-text-muted);">Importe a planilha deste parceiro (banco, prazo, tabela, órgão, %).</small>' +
      '<div id="partnerComissaoPreview" style="margin-top:8px;max-height:160px;overflow:auto;font-size:11px;"></div>';
    group.appendChild(box);
    document.getElementById('partnerComissaoXlsx').addEventListener('change', onFile);
    document.getElementById('partnerComissaoModelo').addEventListener('click', downloadModelo);
    document.getElementById('partnerComissaoLimpar').addEventListener('click', function () {
      pending = { rows: [], filename: '', imported_at: new Date().toISOString() };
      renderPreview(pending);
    });
  }

  function renderPreview(pack) {
    var el = document.getElementById('partnerComissaoPreview');
    var hint = document.getElementById('partnerComissaoTabelaHint');
    if (!el) return;
    var rows = pack && Array.isArray(pack.rows) ? pack.rows : [];
    if (hint) {
      hint.textContent = rows.length
        ? (rows.length + ' linha(s) — ' + (pack.filename || 'planilha') + '. Cada parceiro tem a sua.')
        : 'Importe a planilha deste parceiro (ID, banco, prazo, tabela, órgão, comissionamento, bônus, vigência).';
    }
    if (!rows.length) { el.innerHTML = ''; return; }
    var head = '<tr><th>Banco</th><th>Prazo</th><th>Tabela</th><th>Órgão</th><th>%</th><th>Bônus</th><th>Vigência</th></tr>';
    var body = rows.slice(0, 12).map(function (r) {
      return '<tr><td>' + esc(r.banco) + '</td><td>' + esc(r.prazo) + '</td><td>' + esc(r.tabela) + '</td><td>' +
        esc(r.orgao) + '</td><td>' + (r.rate ? Math.round(r.rate * 1000) / 10 : '') + '%</td><td>' +
        esc(r.bonus) + '</td><td>' + esc(r.vigencia) + '</td></tr>';
    }).join('');
    el.innerHTML = '<table class="table" style="width:100%;">' + head + body + '</table>' +
      (rows.length > 12 ? '<div style="color:var(--color-text-muted);">… +' + (rows.length - 12) + '</div>' : '');
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function downloadModelo() {
    var csv = '\uFEFFID,BANCO,PRAZO,TABELA,ORGÃO,COMISSIONAMENTO,BÔNUS,VIGÊNCIA\n' +
      '1,FUTURO,96,NCDT_096-419_428248,SIAPE,30,0,01/09/2026\n';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'modelo-comissao-parceiro.csv';
    a.click();
  }

  function loadXlsx() {
    if (typeof XLSX !== 'undefined') return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = '../js/vendor/xlsx.full.min.js';
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Planilha: recarregue a página (Ctrl+F5).')); };
      document.head.appendChild(s);
    });
  }

  function onFile(ev) {
    var file = ev.target && ev.target.files && ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      loadXlsx().then(function () {
        var data = new Uint8Array(e.target.result);
        var wb = XLSX.read(data, { type: 'array', cellDates: false, raw: false });
        var sheet = wb.Sheets[wb.SheetNames[0]];
        var raw = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
        var rows = parseRows(raw);
        if (!rows.length) {
          if (typeof showToast === 'function') showToast('Planilha sem linhas válidas.', 'warning');
          else alert('Planilha sem linhas válidas.');
          return;
        }
        pending = { rows: rows, filename: file.name, imported_at: new Date().toISOString() };
        renderPreview(pending);
        if (typeof showToast === 'function') showToast(rows.length + ' linhas importadas. Clique em Salvar parceiro.', 'success');
      }).catch(function (err) {
        alert(err.message || err);
      });
    };
    reader.readAsArrayBuffer(file);
  }

  function install() {
    var P = window.PartnerPerms;
    if (!P || P.__comissaoTabela) return !!P;
    P.__comissaoTabela = true;
    var origFill = P.fillCommissionTierForm && P.fillCommissionTierForm.bind(P);
    var origRead = P.readCommissionTierMeta && P.readCommissionTierMeta.bind(P);
    var origCalc = P.calcPartnerCommission && P.calcPartnerCommission.bind(P);

    P.fillCommissionTierForm = function (meta) {
      if (origFill) origFill(meta);
      ensureBox();
      pending = (meta && meta.comissao_tabela) ? meta.comissao_tabela : { rows: [], filename: '', imported_at: '' };
      renderPreview(pending);
    };

    P.readCommissionTierMeta = function (existingMeta) {
      var base = origRead ? origRead(existingMeta) : {};
      var pack = pending && pending.rows ? pending : (existingMeta && existingMeta.comissao_tabela);
      if (pack) base.comissao_tabela = pack;
      return base;
    };

    /**
     * calcPartnerCommission — usa a planilha do parceiro se casar banco/tabela/órgão.
     * Sem match, cai na faixa antiga (bronze/gold).
     */
    P.calcPartnerCommission = function (valorBruto, partnerOrTier, proposal) {
      var hit = lookup(partnerOrTier, proposal || P._comissaoProposal);
      if (hit && hit.rate > 0) {
        var v = parseFloat(valorBruto) || 0;
        return Math.round(v * hit.rate * 100) / 100;
      }
      return origCalc ? origCalc(valorBruto, partnerOrTier) : 0;
    };
    P.lookupComissaoTabela = lookup;

    var FP = window.FinPropostas;
    if (FP && FP._preencherBaixaComissao && !FP.__comissaoTabela) {
      FP.__comissaoTabela = true;
      var origP = FP._preencherBaixaComissao.bind(FP);
      FP._preencherBaixaComissao = function (proposal, prefix) {
        P._comissaoProposal = proposal;
        var r = origP(proposal, prefix);
        if (r && typeof r.then === 'function') {
          return r.finally(function () { P._comissaoProposal = null; });
        }
        P._comissaoProposal = null;
        return r;
      };
    }
    return true;
  }

  function boot() { return install(); }
  if (!boot()) {
    document.addEventListener('DOMContentLoaded', boot);
    window.addEventListener('load', boot);
    var n = 0;
    var t = setInterval(function () {
      n += 1;
      if (boot() || n > 40) clearInterval(t);
    }, 250);
  }
})();
