/* SOU+BLU — Relatórios RH */

const RH_RELATORIOS = {
  folha: { label: 'Gerar Folha Funcionário', desc: 'Protocolo automático, empresa, mês, funcionários com PIX do cadastro — salvar e exportar Excel.' },
  ranking: { label: 'Ranking de Vendas', desc: 'Classificação dos vendedores por faturamento e propostas.' },
  vendas: { label: 'Relatório de Vendas', desc: 'Lista consolidada de propostas com filtros e exportação.' },
  qualidade: { label: 'Relatório de Qualidade', desc: 'Monitoria e indicadores de qualidade da equipe.' },
};

let _rhRelatorioAtual = 'folha';
let _rhRelatorioGen = 0;
let _rhVendasCache = [];
let _folhaIframeEl = null;

function _folhaPagamentoEmbedHref() {
  const rel = typeof Auth !== 'undefined' && Auth._isInPagesDir?.()
    ? 'folha-pagamento.html?embed=1'
    : 'pages/folha-pagamento.html?embed=1';
  return typeof Auth !== 'undefined' && Auth.resolveHref
    ? Auth.resolveHref(rel)
    : rel;
}

function _rhRelPanel() {
  return document.getElementById('rhRelatorioPanel');
}

function _ensureRelContent() {
  const panel = _rhRelPanel();
  if (!panel) return null;
  let content = document.getElementById('rhRelatorioContent');
  if (!content) {
    panel.innerHTML = '';
    const stack = document.createElement('div');
    stack.className = 'rh-relatorio-stack';
    content = document.createElement('div');
    content.id = 'rhRelatorioContent';
    content.className = 'rh-relatorio-content';
    stack.appendChild(content);
    panel.appendChild(stack);
  }
  return content;
}

function _rhGetEmployees() {
  if (Array.isArray(window._allEmployees)) return window._allEmployees;
  try {
    return typeof _allEmployees !== 'undefined' ? _allEmployees : [];
  } catch {
    return [];
  }
}

function _rhRelEsc(s) {
  if (typeof _esc === 'function') return _esc(s);
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _rhFmtMoney(v) {
  const n = parseFloat(v) || 0;
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _rhFmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(iso);
  }
}

function _rhNormProposal(p) {
  return {
    id: p.id,
    numero: p.numero || p.id || '',
    vendorName: p.vendor_name || p.vendorName || p.vendedor || '—',
    clientName: p.client_name || p.clientName || '—',
    clientCpf: p.client_cpf || p.clientCpf || '',
    product: p.product || p.produto || '—',
    convenio: p.convenio || '—',
    status: p.status || '—',
    valor: p.valor_final ?? p.valorFinal ?? p.valor ?? 0,
    created_at: p.created_at || p.createdAt || p.updated_at || '',
  };
}

function _rhDownloadCsv(filename, headers, rows) {
  const lines = [headers.join(';')];
  rows.forEach(r => {
    lines.push(r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'));
  });
  const blob = new Blob(['\ufeff' + lines.join('\
')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function switchRhRelatorio(tipo) {
  const next = tipo || 'folha';
  _rhRelatorioAtual = next;
  _rhRelatorioGen += 1;
  const gen = _rhRelatorioGen;

  document.querySelectorAll('.rh-relatorio-card').forEach(btn => {
    const on = btn.dataset.rel === next;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });

  const panel = _rhRelPanel();
  if (panel) {
    panel.classList.toggle('rh-showing-folha', next === 'folha');
  }

  const content = _ensureRelContent();
  if (!content) {
    console.warn('[rh-relatorios] #rhRelatorioPanel não encontrado');
    return;
  }

  if (next === 'folha') {
    content.hidden = true;
    content.style.display = 'none';
  } else {
    content.hidden = false;
    content.style.display = '';
  }

  if (next !== 'folha') {
    content.innerHTML = '<div class="text-muted text-center" style="padding:32px;">Carregando relatório...</div>';
  }

  const run = async () => {
    try {
      if (next === 'folha') {
        renderRhRelatorioFolha(content);
        return;
      }
      if (next === 'ranking') {
        await renderRhRelatorioRanking(content, gen);
        return;
      }
      if (next === 'vendas') {
        await renderRhRelatorioVendas(content, gen);
        return;
      }
      if (next === 'qualidade') {
        renderRhRelatorioQualidade(content);
      }
    } catch (e) {
      if (gen !== _rhRelatorioGen) return;
      console.error('[rh-relatorios] switch:', e);
      content.innerHTML = `<div class="text-muted text-center" style="padding:24px;">Erro ao abrir relatório: ${_rhRelEsc(e.message || e)}</div>`;
    }
  };

  run();

  requestAnimationFrame(() => {
    content.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

function renderRhRelatoriosHub() {
  switchRhRelatorio(_rhRelatorioAtual || 'folha');
}

function initRhRelatoriosHub() {
  const menu = document.querySelector('.rh-relatorios-menu');
  if (!menu || menu.dataset.rhWired === '1') return;
  menu.dataset.rhWired = '1';
  menu.addEventListener('click', (e) => {
    const card = e.target.closest('.rh-relatorio-card');
    if (!card?.dataset.rel) return;
    e.preventDefault();
    switchRhRelatorio(card.dataset.rel);
  });
}

function renderRhRelatorioFolha(container) {
  const host = container || _ensureRelContent();
  if (!host) return;

  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'rh-folha-embed-wrap';

  if (!_folhaIframeEl) {
    _folhaIframeEl = document.createElement('iframe');
    _folhaIframeEl.className = 'rh-folha-iframe';
    _folhaIframeEl.title = 'Folha de Pagamento';
    _folhaIframeEl.src = _folhaPagamentoEmbedHref();
  }

  wrap.appendChild(_folhaIframeEl);
  host.appendChild(wrap);
}

async function renderRhRelatorioRanking(container, gen) {
  const panel = container || _ensureRelContent();
  if (!panel) return;
  const myGen = gen ?? _rhRelatorioGen;
  const meta = RH_RELATORIOS.ranking;

  if (typeof SalesRanking === 'undefined') {
    if (myGen !== _rhRelatorioGen) return;
    panel.innerHTML = `
      <div class="rh-relatorio-panel-head"><h3>${_rhRelEsc(meta.label)}</h3></div>
      <div class="rh-relatorio-panel-body text-muted text-center" style="padding:32px;">Módulo de ranking não carregado.</div>`;
    return;
  }

  if (myGen !== _rhRelatorioGen) return;
  panel.innerHTML = `
    <div class="rh-relatorio-panel-head">
      <h3>${_rhRelEsc(meta.label)}</h3>
      <p class="text-muted">${_rhRelEsc(meta.desc)}</p>
    </div>
    <div class="rh-relatorio-panel-body">
      <div id="salesRankingFiltersAdmin"></div>
      <div id="salesRankingSummaryAdmin" class="text-muted" style="font-size:13px;margin:12px 0;"></div>
      <div id="adminRankingList"></div>
    </div>`;

  try {
    if (SalesRanking.invalidateCache) SalesRanking.invalidateCache();
    await SalesRanking.renderAdmin();
    if (myGen !== _rhRelatorioGen) return;
  } catch (e) {
    if (myGen !== _rhRelatorioGen) return;
    console.error('[rh-relatorios] ranking:', e);
    const body = panel.querySelector('.rh-relatorio-panel-body');
    if (body) {
      body.innerHTML = `<div class="text-muted text-center" style="padding:32px;">Erro ao carregar ranking: ${_rhRelEsc(e.message || e)}</div>`;
    }
  }
}

async function renderRhRelatorioVendas(container, gen) {
  const panel = container || _ensureRelContent();
  if (!panel) return;
  const myGen = gen ?? _rhRelatorioGen;
  const meta = RH_RELATORIOS.vendas;

  if (myGen !== _rhRelatorioGen) return;
  panel.innerHTML = `
    <div class="rh-relatorio-panel-head">
      <h3>${_rhRelEsc(meta.label)}</h3>
      <p class="text-muted">${_rhRelEsc(meta.desc)}</p>
    </div>
    <div class="rh-relatorio-panel-body">
    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-bottom:16px;">
      <div class="form-group" style="flex:1;min-width:200px;margin:0;">
        <label for="rhVendasBusca">Buscar</label>
        <input type="search" class="form-control" id="rhVendasBusca" placeholder="Cliente, CPF, vendedor, produto, status..."/>
      </div>
      <div class="form-group" style="min-width:160px;margin:0;">
        <label for="rhVendasStatus">Status</label>
        <select class="form-control" id="rhVendasStatus">
          <option value="">Todos</option>
          <option value="PAGO">PAGO</option>
          <option value="Em Andamento">Em Andamento</option>
          <option value="Pendenciado">Pendenciado</option>
          <option value="Cancelado">Cancelado</option>
        </select>
      </div>
      <button type="button" class="btn btn-outline" id="rhVendasFiltrar">Filtrar</button>
      <button type="button" class="btn btn-accent" id="rhVendasExportar">Exportar CSV</button>
    </div>
    <div id="rhVendasResumo" class="text-muted" style="font-size:13px;margin-bottom:12px;"></div>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Nº</th><th>Vendedor</th><th>Cliente</th><th>Produto</th><th>Convênio</th>
            <th>Valor Final</th><th>Status</th><th>Data</th>
          </tr>
        </thead>
        <tbody id="rhVendasTbody">
          <tr><td colspan="8" class="text-center text-muted">Carregando...</td></tr>
        </tbody>
      </table>
    </div>
    </div>`;

  const aplicar = () => {
    const q = (document.getElementById('rhVendasBusca')?.value || '').trim().toLowerCase();
    const st = document.getElementById('rhVendasStatus')?.value || '';
    let rows = _rhVendasCache;
    if (st) rows = rows.filter(p => String(p.status).toLowerCase() === st.toLowerCase());
    if (q) {
      rows = rows.filter(p => [p.numero, p.vendorName, p.clientName, p.clientCpf, p.product, p.convenio, p.status]
        .join(' ').toLowerCase().includes(q));
    }
    const tbody = panel.querySelector('#rhVendasTbody');
    const resumo = document.getElementById('rhVendasResumo');
    const total = rows.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
    if (resumo) {
      resumo.textContent = `${rows.length} proposta(s) · Faturamento: ${_rhFmtMoney(total)}`;
    }
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Nenhuma proposta encontrada.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.slice(0, 200).map(p => `
      <tr>
        <td><strong>${_rhRelEsc(p.numero)}</strong></td>
        <td>${_rhRelEsc(p.vendorName)}</td>
        <td>${_rhRelEsc(p.clientName)}<br><small class="text-muted">${_rhRelEsc(p.clientCpf)}</small></td>
        <td>${_rhRelEsc(p.product)}</td>
        <td>${_rhRelEsc(p.convenio)}</td>
        <td><strong>${_rhFmtMoney(p.valor)}</strong></td>
        <td>${_rhRelEsc(p.status)}</td>
        <td>${_rhFmtDate(p.created_at)}</td>
      </tr>`).join('');
    if (rows.length > 200) {
      tbody.innerHTML += `<tr><td colspan="8" class="text-center text-muted">Exibindo 200 de ${rows.length} — refine a busca ou exporte CSV.</td></tr>`;
    }
  };

  panel.querySelector('#rhVendasFiltrar')?.addEventListener('click', aplicar);
  panel.querySelector('#rhVendasBusca')?.addEventListener('input', () => {
    clearTimeout(window._rhVendasDebounce);
    window._rhVendasDebounce = setTimeout(aplicar, 300);
  });
  panel.querySelector('#rhVendasStatus')?.addEventListener('change', aplicar);
  panel.querySelector('#rhVendasExportar')?.addEventListener('click', () => {
    const q = (panel.querySelector('#rhVendasBusca')?.value || '').trim().toLowerCase();
    const st = panel.querySelector('#rhVendasStatus')?.value || '';
    let rows = _rhVendasCache;
    if (st) rows = rows.filter(p => String(p.status).toLowerCase() === st.toLowerCase());
    if (q) {
      rows = rows.filter(p => [p.numero, p.vendorName, p.clientName, p.clientCpf, p.product, p.convenio, p.status]
        .join(' ').toLowerCase().includes(q));
    }
    _rhDownloadCsv(
      `relatorio-vendas-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Nº Proposta', 'Vendedor', 'Cliente', 'CPF', 'Produto', 'Convênio', 'Valor Final', 'Status', 'Data'],
      rows.map(p => [p.numero, p.vendorName, p.clientName, p.clientCpf, p.product, p.convenio, p.valor, p.status, p.created_at])
    );
  });

  try {
    const raw = await DB.getProposals();
    if (myGen !== _rhRelatorioGen) return;
    _rhVendasCache = (Array.isArray(raw) ? raw : [])
      .map(_rhNormProposal)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    aplicar();
  } catch (e) {
    if (myGen !== _rhRelatorioGen) return;
    console.error('[rh-relatorios] vendas:', e);
    const tbody = panel.querySelector('#rhVendasTbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">Erro: ${_rhRelEsc(e.message || e)}</td></tr>`;
  }
}

function renderRhRelatorioQualidade(container) {
  const panel = container || _ensureRelContent();
  if (!panel) return;
  const meta = RH_RELATORIOS.qualidade;

  const emps = _rhGetEmployees().filter(e => !e.demitido && e.status !== 'demitido');
  const counts = { BAIXA: 0, 'MÉDIA': 0, ALTA: 0, OUTROS: 0 };
  emps.forEach(e => {
    const q = String(e.qualidade_monitoria || 'BAIXA').toUpperCase();
    if (q.includes('ALTA')) counts.ALTA += 1;
    else if (q.includes('MÉD')) counts['MÉDIA'] += 1;
    else if (q.includes('BAIX')) counts.BAIXA += 1;
    else counts.OUTROS += 1;
  });

  panel.innerHTML = `
    <div class="rh-relatorio-panel-head">
      <h3>${_rhRelEsc(meta.label)}</h3>
      <p class="text-muted">${_rhRelEsc(meta.desc)}</p>
    </div>
    <div class="rh-relatorio-panel-body">
    <div class="stat-grid" style="margin-bottom:20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">
      <div class="card card-padded" style="text-align:center;"><div class="text-muted" style="font-size:11px;font-weight:700;">BAIXA</div><div style="font-size:24px;font-weight:900;">${counts.BAIXA}</div></div>
      <div class="card card-padded" style="text-align:center;"><div class="text-muted" style="font-size:11px;font-weight:700;">MÉDIA</div><div style="font-size:24px;font-weight:900;">${counts['MÉDIA']}</div></div>
      <div class="card card-padded" style="text-align:center;"><div class="text-muted" style="font-size:11px;font-weight:700;">ALTA</div><div style="font-size:24px;font-weight:900;color:var(--color-success);">${counts.ALTA}</div></div>
      <div class="card card-padded" style="text-align:center;"><div class="text-muted" style="font-size:11px;font-weight:700;">COLABORADORES</div><div style="font-size:24px;font-weight:900;">${emps.length}</div></div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
      <button type="button" class="btn btn-outline btn-sm" id="rhQualidadeExportar">Exportar CSV</button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Funcionário</th><th>Cargo</th><th>Departamento</th><th>Qualidade Monitoria</th>
            <th>Advertências</th><th>Suspensões</th>
          </tr>
        </thead>
        <tbody id="rhQualidadeTbody"></tbody>
      </table>
    </div>
    </div>`;

  const tbody = panel.querySelector('#rhQualidadeTbody');
  if (!emps.length) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Nenhum funcionário ativo cadastrado.</td></tr>';
    return;
  }

  const badge = (q) => {
    const u = String(q || 'BAIXA').toUpperCase();
    let cls = 'badge-muted';
    if (u.includes('ALTA')) cls = 'badge-success';
    else if (u.includes('MÉD')) cls = 'badge-warning';
    return `<span class="badge ${cls}">${_rhRelEsc(q || 'BAIXA')}</span>`;
  };

  if (tbody) {
    tbody.innerHTML = emps.map(e => `
      <tr>
        <td><strong>${_rhRelEsc(e.nome)}</strong><br><small class="text-muted">${_rhRelEsc(e.cpf)}</small></td>
        <td>${_rhRelEsc(e.cargo || '—')}</td>
        <td>${_rhRelEsc(e.departamento || '—')}</td>
        <td>${badge(e.qualidade_monitoria)}</td>
        <td>${e.advertencias || 0}</td>
        <td>${e.suspensoes || 0}</td>
      </tr>`).join('');
  }

  panel.querySelector('#rhQualidadeExportar')?.addEventListener('click', () => {
    _rhDownloadCsv(
      `relatorio-qualidade-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Nome', 'CPF', 'Cargo', 'Departamento', 'Qualidade Monitoria', 'Advertências', 'Suspensões'],
      emps.map(e => [e.nome, e.cpf, e.cargo, e.departamento, e.qualidade_monitoria, e.advertencias || 0, e.suspensoes || 0])
    );
  });
}

/** Usado pelos filtros do SalesRanking no RH */
async function renderAdminRanking() {
  if (_rhRelatorioAtual === 'ranking' && typeof SalesRanking !== 'undefined' && SalesRanking.renderAdmin) {
    return SalesRanking.renderAdmin();
  }
}

window.switchRhRelatorio = switchRhRelatorio;
window.renderRhRelatoriosHub = renderRhRelatoriosHub;
window.renderAdminRanking = renderAdminRanking;
window.initRhRelatoriosHub = initRhRelatoriosHub;

document.addEventListener('DOMContentLoaded', () => {
  initRhRelatoriosHub();
});
