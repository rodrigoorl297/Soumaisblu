/**
 * partner-comissao-view — tabela de comissão visível no painel do parceiro (somente leitura).
 */
(function () {
  function esc(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function isPartnerOrg() {
    if (window.PARTNER_ROOT_ID || window.IS_PARCEIRO) return true;
    try {
      var s = window.Auth && Auth.getSession && Auth.getSession();
      return !!(s && String(s.role || '').toLowerCase() === 'parceiro');
    } catch (_) { return false; }
  }

  function tableHtml(rows) {
    if (!rows.length) {
      return '<p class="text-muted" style="margin:0;">Ainda não há planilha de comissão. O master importa o Excel no cadastro do parceiro.</p>';
    }
    var body = rows.map(function (r) {
      var pct = r.rate ? (Math.round(r.rate * 1000) / 10) + '%' : esc(r.comissionamento);
      return '<tr><td>' + esc(r.id) + '</td><td>' + esc(r.banco) + '</td><td>' + esc(r.prazo) +
        '</td><td>' + esc(r.tabela) + '</td><td>' + esc(r.orgao) + '</td><td><strong>' + pct +
        '</strong></td><td>' + esc(r.bonus) + '</td><td>' + esc(r.vigencia) + '</td></tr>';
    }).join('');
    return '<div style="overflow:auto;max-height:70vh;"><table class="table" style="width:100%;font-size:12px;">' +
      '<thead><tr><th>ID</th><th>Banco</th><th>Prazo</th><th>Tabela</th><th>Órgão</th><th>%</th><th>Bônus</th><th>Vigência</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
  }

  /** loadPack — planilha gravada em partners.meta.comissao_tabela deste parceiro. */
  async function loadPack() {
    var root = window.PARTNER_ROOT_ID;
    if (!root && window.Auth && Auth.getSession) {
      var s = Auth.getSession();
      if (s && String(s.role || '').toLowerCase() === 'parceiro') root = s.id;
    }
    if (!root || !window.DB || typeof DB.getPartnerByUserId !== 'function') {
      return { rows: [], title: '' };
    }
    var p = await DB.getPartnerByUserId(root).catch(function () { return null; });
    var meta = p && p.meta;
    if (typeof meta === 'string') {
      try { meta = JSON.parse(meta); } catch (_) { meta = {}; }
    }
    var t = (meta && meta.comissao_tabela) || {};
    return {
      rows: Array.isArray(t.rows) ? t.rows : [],
      title: (p && (p.razao_social || p.name)) || '',
      file: t.filename || ''
    };
  }

  function ensureUi() {
    if (!isPartnerOrg()) return false;
    if (!document.getElementById('secDashboard') && !document.querySelector('.sidebar-nav')) return false;
    if (!document.getElementById('secMinhaComissao')) {
      var dash = document.getElementById('secDashboard');
      if (dash && dash.parentNode) {
        var sec = document.createElement('section');
        sec.id = 'secMinhaComissao';
        sec.className = 'section';
        sec.innerHTML = '<div class="page-header"><div class="page-header-text"><h2>Tabela de comissão</h2>' +
          '<p id="partnerComissaoViewSub">Banco, prazo, tabela, órgão e percentual do seu contrato.</p></div></div>' +
          '<div class="card card-padded"><div id="partnerComissaoViewBody">Carregando…</div></div>';
        dash.parentNode.insertBefore(sec, dash.nextSibling);
      }
    }
    if (!document.getElementById('navMinhaComissao')) {
      var dashNav = document.querySelector('.sidebar-nav [data-section="secDashboard"]');
      if (dashNav && dashNav.parentNode) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-item';
        btn.id = 'navMinhaComissao';
        btn.setAttribute('data-section', 'secMinhaComissao');
        btn.innerHTML = '<span class="nav-label">Comissão</span>';
        dashNav.parentNode.insertBefore(btn, dashNav.nextSibling);
        if (typeof wireNavButton === 'function') wireNavButton(btn);
      }
    }
    return !!(document.getElementById('secMinhaComissao') || document.getElementById('navMinhaComissao'));
  }

  async function paint() {
    var body = document.getElementById('partnerComissaoViewBody');
    if (!body) return;
    var d = await loadPack();
    var sub = document.getElementById('partnerComissaoViewSub');
    if (sub && d.title) sub.textContent = d.title + (d.file ? ' — ' + d.file : '');
    body.innerHTML = tableHtml(d.rows);
    var dash = document.getElementById('secDashboard');
    if (dash && isPartnerOrg()) {
      var card = document.getElementById('partnerComissaoDashCard');
      if (!card) {
        card = document.createElement('div');
        card.id = 'partnerComissaoDashCard';
        card.className = 'card card-padded';
        card.style.marginTop = '16px';
        dash.appendChild(card);
      }
      var prev = d.rows.slice(0, 8);
      card.innerHTML = '<h3 style="margin:0 0 8px;">Sua tabela de comissão</h3>' +
        tableHtml(prev) +
        (d.rows.length > 8
          ? '<button type="button" class="btn btn-outline btn-sm" style="margin-top:8px;" id="partnerComissaoVerTudo">Ver tabela completa</button>'
          : '');
      var more = document.getElementById('partnerComissaoVerTudo');
      if (more) {
        more.onclick = function () {
          if (typeof navigateTo === 'function') navigateTo('secMinhaComissao');
        };
      }
    }
  }

  function boot() {
    if (!isPartnerOrg()) return false;
    if (!ensureUi()) return false;
    paint();
    return true;
  }

  var n = 0;
  var t = setInterval(function () {
    n += 1;
    boot();
    if (n > 50) clearInterval(t);
  }, 400);
  document.addEventListener('DOMContentLoaded', boot);
  window.addEventListener('load', boot);
})();
