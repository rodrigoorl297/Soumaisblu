/* Ranking de vendas — classificação (faixas) + filtros Status e Fase */

window.SalesRanking = {
  _cache: { proposals: null, at: 0 },
  // Padrão alinhado ao dashboard: Este mês + Fatura Total + valor final.
  _filters: { period: 'month', status: '', fase: '', billing: 'total' },

  BILLING_OPTIONS: [
    { v: 'total', l: 'Fatura Total' },
    { v: 'pagas', l: 'Pagas' },
    { v: 'digitadas', l: 'Digitadas' },
    { v: 'canceladas', l: 'Canceladas' },
  ],

  STATUS_OPTIONS: [
    'Em Andamento', 'AG. BOLETO', 'Digitação', 'PROPOSTA DIGITADA', 'AG. ASS TERMO',
    'AG. VÍDEO', 'AG. DOCS GARANTIA', 'AG. ASS PROPOSTA', 'BOLETO VALIDADO', 'AG. QUITAÇÃO', 'BOLETO QUITADO',
    'AG. LIBERAÇÃO MARGEM', 'AVERBADO', 'PAGO', 'Pendenciado', 'Cancelado',
  ],

  FASE_OPTIONS: (window.Proposals && Proposals._VENDOR_SITUACOES)
    ? Proposals._VENDOR_SITUACOES.map(o => o.v)
    : [
        'Em Andamento', 'Digitação', 'AG. BOLETO', 'PROPOSTA DIGITADA', 'AG. ASS TERMO',
        'AG. VÍDEO', 'AG. DOCS GARANTIA', 'AG. ASS PROPOSTA', 'BOLETO VALIDADO', 'AG. QUITAÇÃO', 'BOLETO QUITADO',
        'AG. LIBERAÇÃO MARGEM', 'AVERBADO', 'PAGO', 'Pendenciado', 'Cancelado',
      ],

  _norm(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  },

  _proposalStatus(p) {
    return String(p.status || '').trim();
  },

  _proposalFase(p) {
    return String(p.statusOp || p.status_op || '').trim();
  },

  _matchesFilter(fieldVal, want) {
    if (window.Proposals && typeof Proposals._matchesStatusFilter === 'function') {
      return Proposals._matchesStatusFilter({ status: fieldVal, statusOp: fieldVal }, want);
    }
    const wantNorm = this._norm(want);
    if (!wantNorm || wantNorm === 'todos') return true;
    const val = this._norm(fieldVal);
    if (!val) return false;
    if (val === wantNorm) return true;
    if (wantNorm === 'ag. boleto' && (val === 'ag. boleto' || val.includes('aguardando boleto'))) return true;
    if (wantNorm === 'ag. ass termo' && val.includes('ass termo')) return true;
    if (wantNorm === 'ag. video' && (val.includes('video') || val.includes('vídeo'))) return true;
    if (wantNorm === 'ag. ass proposta' && val.includes('ass proposta')) return true;
    if (wantNorm === 'ag. quitacao' && (val.includes('quitacao') || val.includes('quitação'))) return true;
    if (wantNorm === 'ag. liberacao margem' && val.includes('liberacao') && val.includes('margem')) return true;
    if (wantNorm === 'digitacao' && (val === 'digitacao' || val === 'digitação')) return true;
    if (wantNorm === 'pendenciado' && (val === 'pendenciado' || val === 'pendente')) return true;
    return false;
  },

  _periodRange(periodKey) {
    const now = new Date();
    if (periodKey === 'all') return { start: null, end: null };
    if (periodKey === 'last_month') {
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        end: new Date(now.getFullYear(), now.getMonth(), 1),
      };
    }
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  },

  _periodLabel(periodKey) {
    return { month: 'Este mês', last_month: 'Mês anterior', all: 'Todo o período' }[periodKey] || 'Período';
  },

  _billingLabel(billingKey) {
    const hit = (this.BILLING_OPTIONS || []).find((o) => o.v === billingKey);
    return hit?.l || 'Fatura Total';
  },

  _matchesBillingStatus(p, billingKey) {
    if (typeof DB !== 'undefined' && typeof DB.proposalMatchesBillingStatus === 'function') {
      return DB.proposalMatchesBillingStatus(p, billingKey || 'total');
    }
    const f = billingKey || 'total';
    if (f === 'total') return true;
    if (f === 'pagas') return this._isPaidProposal(p);
    if (f === 'canceladas') return this._isCancelledProposal(p);
    if (f === 'digitadas') return !this._isPaidProposal(p) && !this._isCancelledProposal(p);
    return true;
  },

  _proposalBillingDate(p) {
    if (typeof DB !== 'undefined' && typeof DB.proposalBillingDate === 'function') {
      return DB.proposalBillingDate(p);
    }
    const raw = p.updatedAt || p.updated_at || p.createdAt || p.created_at;
    const d = raw ? new Date(raw) : new Date(0);
    return Number.isNaN(d.getTime()) ? new Date(0) : d;
  },

  _proposalDate(p) {
    if (typeof DB !== 'undefined' && typeof DB.proposalDate === 'function') {
      return DB.proposalDate(p);
    }
    const raw = p.updatedAt || p.updated_at || p.createdAt || p.created_at;
    const d = raw ? new Date(raw) : new Date(0);
    return Number.isNaN(d.getTime()) ? new Date(0) : d;
  },

  _proposalAmount(p) {
    if (typeof DB !== 'undefined' && typeof DB.proposalAmount === 'function') {
      return DB.proposalAmount(p);
    }
    const vf = parseFloat(p?.valorFinal ?? p?.valor_final ?? 0);
    const v = parseFloat(p?.valor ?? 0);
    if (Number.isFinite(vf) && vf > 0) return vf;
    if (Number.isFinite(v) && v > 0) return v;
    return 0;
  },

  _proposalGrossAmount(p) {
    if (typeof DB !== 'undefined' && typeof DB.proposalGrossAmount === 'function') {
      return DB.proposalGrossAmount(p);
    }
    const v = parseFloat(p?.valor ?? 0);
    return Number.isFinite(v) && v > 0 ? v : 0;
  },

  _proposalChartAmount(p, billingKey) {
    const billing = billingKey || this._filters.billing || 'total';
    if (typeof DB !== 'undefined' && typeof DB.proposalChartBillingAmount === 'function') {
      return DB.proposalChartBillingAmount(p, billing);
    }
    return billing === 'pagas' ? this._proposalAmount(p) : this._proposalGrossAmount(p);
  },

  _vendorId(p) {
    if (typeof DB !== 'undefined' && typeof DB.proposalVendorId === 'function') {
      return DB.proposalVendorId(p);
    }
    return String(p.vendorId || p.vendor_id || p.employee_id || '').trim();
  },

  _buildVendorIndex(users) {
    const byId = new Map();
    const byName = new Map();
    (users || []).forEach((u) => {
      if (u?.id) byId.set(String(u.id), String(u.id));
      const n = this._norm(u.name);
      if (n) byName.set(n, String(u.id));
    });
    return { byId, byName };
  },

  async _getUsersByVendorName() {
    if (this._vendorNameMap) return this._vendorNameMap;
    let users = [];
    try { users = await DB.getAllUsers(); } catch (_) { /* noop */ }
    const map = {};
    (users || []).forEach((u) => {
      const n = this._norm(u.name);
      if (n && u?.id) map[n] = String(u.id);
    });
    this._vendorNameMap = map;
    return map;
  },

  _resolveVendorId(p, vendorIndex, usersByName, masterMode = false) {
    if (!masterMode) {
      const id = this._vendorId(p);
      if (id && vendorIndex?.byId?.has(id)) return id;
      if (!vendorIndex) return id || '';
      const vn = this._norm(p.vendorName || p.vendor_name);
      if (vn && vendorIndex.byName.has(vn)) return vendorIndex.byName.get(vn);
      return '';
    }
    const nameMap = usersByName
      || (vendorIndex?.byName ? Object.fromEntries(vendorIndex.byName) : null);
    if (typeof DB !== 'undefined' && typeof DB.resolveProposalVendorId === 'function') {
      return DB.resolveProposalVendorId(p, nameMap || {});
    }
    const id = this._vendorId(p);
    if (id) return id;
    if (!vendorIndex) return '';
    const vn = this._norm(p.vendorName || p.vendor_name);
    if (vn && vendorIndex.byName.has(vn)) return vendorIndex.byName.get(vn);
    return '';
  },

  async _loadProposals(opts = {}) {
    const force = !!opts.force;
    const ttl = 45000;
    if (!force && this._cache.proposals && Date.now() - this._cache.at < ttl) {
      return this._cache.proposals;
    }
    if (!force && !opts.skipDashCache && Array.isArray(window._dashProposalsCache) && window._dashProposalsCache.length) {
      const fromDash = (window.Proposals && Proposals._normProposal)
        ? window._dashProposalsCache.map((p) => Proposals._normProposal(p))
        : window._dashProposalsCache;
      this._cache.proposals = fromDash;
      this._cache.at = Date.now();
      return fromDash;
    }
    if (force && typeof DB !== 'undefined' && typeof DB._invalidateProposalsCache === 'function') {
      try { DB._invalidateProposalsCache(); } catch (_) { /* noop */ }
    }
    let rows = [];
    try {
      if (opts.fullList && typeof DB.listProposals === 'function') {
        rows = await DB.listProposals();
      } else if (typeof DB.listProposalsLite === 'function') {
        // Mesma base do dashboard (listProposalsLite) para os totais baterem no relatório.
        rows = await DB.listProposalsLite({ all: true });
      } else if (typeof DB.listProposals === 'function') rows = await DB.listProposals();
      else if (typeof DB.list === 'function') rows = await DB.list('proposals');
      else if (typeof DB.getProposals === 'function') rows = await DB.getProposals();
    } catch (e) {
      console.warn('[SalesRanking] propostas:', e);
    }
    const norm = (window.Proposals && Proposals._normProposal)
      ? (rows || []).map(p => Proposals._normProposal(p))
      : rows || [];
    this._cache.proposals = norm;
    this._cache.at = Date.now();
    return norm;
  },

  invalidateCache() {
    this._cache.proposals = null;
    this._cache.at = 0;
    if (typeof DB !== 'undefined' && typeof DB._invalidateProposalsCache === 'function') {
      try { DB._invalidateProposalsCache(); } catch (_) { /* noop */ }
    }
  },

  _scopeProposals(proposals, userIds, vendorIndex, usersByName, masterMode = false) {
    const set = new Set((userIds || []).map(String));
    if (!set.size) return proposals || [];
    return (proposals || []).filter((p) => {
      const vid = this._resolveVendorId(p, vendorIndex, usersByName, masterMode);
      return vid && set.has(String(vid));
    });
  },

  _isCancelledProposal(p) {
    if (typeof DB !== 'undefined' && typeof DB.isCancelledProposal === 'function') {
      return DB.isCancelledProposal(p);
    }
    const st = this._norm(this._proposalStatus(p));
    const fase = this._norm(this._proposalFase(p));
    return st.includes('cancel') || fase.includes('cancel');
  },

  _funnelBucket(p) {
    if (typeof DB !== 'undefined' && typeof DB.proposalFunnelBucket === 'function') {
      return DB.proposalFunnelBucket(p);
    }
    if (this._isCancelledProposal(p)) return 'cancelado';
    if (this._isPaidProposal(p)) return 'efetivado';
    return 'cobranca';
  },

  /** Funil por período (sem Status/Fase): bruto / efetivado / cobrança / cancelado. */
  _aggregateFunnel(users, proposals, vendorIndex, usersByName, masterMode = true) {
    const byVendor = {};
    (proposals || []).forEach((p) => {
      const vid = this._resolveVendorId(p, vendorIndex, usersByName, masterMode);
      if (!vid) return;
      if (!byVendor[vid]) {
        byVendor[vid] = { count: 0, bruto: 0, efetivado: 0, cobranca: 0, cancelado: 0 };
      }
      const amtFinal = this._proposalAmount(p);
      const amtGross = this._proposalGrossAmount(p);
      byVendor[vid].count += 1;
      byVendor[vid].bruto += amtGross;
      const bucket = this._funnelBucket(p);
      byVendor[vid][bucket] += amtFinal;
    });
    const map = {};
    (users || []).forEach((u) => {
      map[u.id] = byVendor[u.id] || { count: 0, bruto: 0, efetivado: 0, cobranca: 0, cancelado: 0 };
    });
    return map;
  },

  _filterByPeriodOnly(proposals) {
    const { start, end } = this._periodRange(this._filters.period);
    return (proposals || []).filter((p) => {
      if (!p || !p.id) return false;
      const d = this._proposalBillingDate(p);
      if (start && d < start) return false;
      if (end && d >= end) return false;
      return true;
    });
  },

  _fmtMoneyPlain(v) {
    return (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  _escHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  _downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 800);
  },

  _reportStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  },

  _filtersSubtitle() {
    const parts = [this._periodLabel(this._filters.period)];
    parts.push(this._billingLabel(this._filters.billing || 'total'));
    if (this._filters.status) parts.push(`Status: ${this._filters.status}`);
    if (this._filters.fase) parts.push(`Fase: ${this._filters.fase}`);
    return parts.join(' · ');
  },

  async _buildReportRows(viewer) {
    if (!this._canViewSalesAmount(viewer)) {
      throw new Error('Sem permissão para baixar valores do ranking.');
    }
    const users = await this._loadAllRankingVendors();
    const usersByName = await this._getUsersByVendorName();
    const vendorIndex = this._buildVendorIndex(users);
    const { filtered, scoped, rows, dashTotal, rankedTotal } = await this._prepareRankingData({ force: true });
    const funnel = this._aggregateFunnel(users, scoped, vendorIndex, usersByName);
    const reportTotal = dashTotal;
    const orphanRow = this._buildOrphanReportRow(filtered, users, vendorIndex, usersByName);
    // #region agent log
    fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'rank-sync3',hypothesisId:'H4',location:'sales-ranking.js:report',message:'ranking report totals',data:{period:this._filters.period,billing:this._filters.billing||'total',propCount:filtered.length,reportTotal,rankedTotal,orphanTotal:orphanRow?.faturamento??0,dashCachedTotal:window._dashBillingTotal??null,vendors:rows.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const reportRows = rows.map((row, i) => {
      const f = funnel[row.user.id] || { count: 0, bruto: 0, efetivado: 0, cobranca: 0, cancelado: 0 };
      return {
        pos: i + 1,
        name: row.user.name || '—',
        department: row.user.department || '—',
        matricula: row.user.matricula || '—',
        tier: row.tier?.label || 'Abaixo FAIXA1',
        qtd: row.count || 0,
        faturamento: row.total || 0,
        qtdPeriodo: f.count,
        bruto: f.bruto,
        efetivado: f.efetivado,
        cobranca: f.cobranca,
        cancelado: f.cancelado,
      };
    });
    if (orphanRow) {
      orphanRow.pos = reportRows.length + 1;
      reportRows.push(orphanRow);
    }
    reportRows._meta = { reportTotal, rankedTotal, filters: this._filtersSubtitle() };
    return reportRows;
  },

  _buildReportHtml(reportRows) {
    const generated = new Date().toLocaleString('pt-BR');
    const meta = reportRows?._meta || {};
    const filters = meta.filters || this._filtersSubtitle();
    const reportTotal = meta.reportTotal ?? (reportRows || []).reduce((s, r) => s + (r.faturamento || 0), 0);
    const totalQtd = (reportRows || []).reduce((s, r) => s + (r.qtd || 0), 0);
    const totalBruto = (reportRows || []).reduce((s, r) => s + (r.bruto || 0), 0);
    const totalEfet = (reportRows || []).reduce((s, r) => s + (r.efetivado || 0), 0);
    const totalCob = (reportRows || []).reduce((s, r) => s + (r.cobranca || 0), 0);
    const totalCanc = (reportRows || []).reduce((s, r) => s + (r.cancelado || 0), 0);
    const body = (reportRows || []).filter((r) => !r._meta).map((r) => `<tr>
      <td style="text-align:center">${r.pos}</td>
      <td>${this._escHtml(r.name)}</td>
      <td style="text-align:center">${this._escHtml(r.tier)}</td>
      <td>${r.qtd}</td>
      <td class="efetivado">${this._fmtMoneyPlain(r.faturamento)}</td>
      <td>${this._fmtMoneyPlain(r.bruto)}</td>
      <td class="efetivado">${this._fmtMoneyPlain(r.efetivado)}</td>
      <td class="cobranca">${this._fmtMoneyPlain(r.cobranca)}</td>
      <td class="cancelado">${this._fmtMoneyPlain(r.cancelado)}</td>
    </tr>`).join('\n');

    return `<!DOCTYPE html>
<html lang='pt-BR'>
<head>
<meta charset='UTF-8'>
<title>Relatório Ranking de Vendas</title>
<style>
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #fff; color: #333; padding: 40px; }
  h1 { text-align: center; color: #1a73e8; margin-bottom: 8px; }
  .meta { text-align: center; color: #555; font-size: 13px; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
  th, td { border: 1px solid #ddd; padding: 10px; text-align: right; }
  th { background-color: #f1f3f4; color: #333; font-weight: 600; text-align: center; }
  td:nth-child(2) { text-align: left; font-weight: 500; }
  .efetivado { color: #0d652d; font-weight: bold; }
  .cobranca { color: #b06000; }
  .cancelado { color: #c5221f; }
  .footer { margin-top: 30px; font-size: 12px; color: #777; text-align: center; }
  .hint { font-size: 12px; color: #666; text-align: center; max-width: 820px; margin: 0 auto 12px; }
  @media print {
    body { padding: 0; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <div class='no-print' style='background: #e8f0fe; padding: 15px; text-align: center; margin-bottom: 20px; border-radius: 8px;'>
    <strong>Dica:</strong> Para salvar como PDF, pressione <code>Ctrl + P</code> e escolha 'Salvar como PDF'.
  </div>
  <h1>Ranking de Vendas — Relatório</h1>
  <div class='meta'>Filtros: ${this._escHtml(filters)}</div>
  <p class='hint'>
    <strong>Faturamento</strong> = valor final · mesmos filtros do dashboard
    (<strong>período + Fatura Total / Pagas / Digitadas / Canceladas</strong>).
    Todas as colunas usam o <strong>mesmo conjunto de propostas</strong> do Painel Master.
  </p>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Vendedor</th>
        <th>Classificação</th>
        <th>Qtd (filtros)</th>
        <th>Faturamento (R$)</th>
        <th>Valor Bruto (R$)</th>
        <th>Efetivado / Faturado (R$)</th>
        <th>Em Cobrança (R$)</th>
        <th>Cancelado (R$)</th>
      </tr>
    </thead>
    <tbody>
${body || '<tr><td colspan="9" style="text-align:center">Nenhum dado</td></tr>'}
    </tbody>
    <tfoot>
      <tr style="font-weight:800;background:#f8fafc;">
        <td colspan="3" style="text-align:left">TOTAL GERAL</td>
        <td>${totalQtd}</td>
        <td class="efetivado">${this._fmtMoneyPlain(reportTotal)}</td>
        <td>${this._fmtMoneyPlain(totalBruto)}</td>
        <td class="efetivado">${this._fmtMoneyPlain(totalEfet)}</td>
        <td class="cobranca">${this._fmtMoneyPlain(totalCob)}</td>
        <td class="cancelado">${this._fmtMoneyPlain(totalCanc)}</td>
      </tr>
    </tfoot>
  </table>
  <div class='footer'>Gerado em: ${this._escHtml(generated)} · SOU + BLU</div>
</body>
</html>`;
  },

  _buildReportAoA(reportRows) {
    const headers = [
      '#', 'Vendedor', 'Departamento', 'Matrícula', 'Classificação',
      'Qtd (filtros)', 'Faturamento (R$)',
      'Qtd período', 'Valor Bruto (R$)', 'Efetivado / Faturado (R$)',
      'Em Cobrança (R$)', 'Cancelado (R$)',
    ];
    const rows = (reportRows || []).filter((r) => r && !r._meta);
    const data = rows.map((r) => [
      r.pos, r.name, r.department, r.matricula, r.tier,
      r.qtd, Number(r.faturamento) || 0,
      r.qtdPeriodo, Number(r.bruto) || 0, Number(r.efetivado) || 0,
      Number(r.cobranca) || 0, Number(r.cancelado) || 0,
    ]);
    const meta = reportRows?._meta || {};
    const reportTotal = meta.reportTotal ?? rows.reduce((s, r) => s + (Number(r.faturamento) || 0), 0);
    const totalRow = [
      '', 'TOTAL GERAL', '', '', '',
      rows.reduce((s, r) => s + (r.qtd || 0), 0),
      reportTotal,
      rows.reduce((s, r) => s + (r.qtdPeriodo || 0), 0),
      rows.reduce((s, r) => s + (Number(r.bruto) || 0), 0),
      rows.reduce((s, r) => s + (Number(r.efetivado) || 0), 0),
      rows.reduce((s, r) => s + (Number(r.cobranca) || 0), 0),
      rows.reduce((s, r) => s + (Number(r.cancelado) || 0), 0),
    ];
    return [headers, ...data, totalRow];
  },

  async exportReport(format, opts = {}) {
    const viewer = opts.viewer
      || (typeof Auth !== 'undefined' ? Auth.getSession() : null)
      || window.currentUser
      || null;
    if (!this._canViewSalesAmount(viewer)) {
      if (typeof showToast === 'function') showToast('Sem permissão para baixar o relatório de valores.', 'error');
      return;
    }
    const prefix = opts.prefix || 'Admin';
    this._readFilters(prefix);
    if (typeof showToast === 'function') showToast('Gerando relatório…', 'info');
    let reportRows;
    try {
      reportRows = await this._buildReportRows(viewer);
    } catch (e) {
      console.warn('[SalesRanking] export:', e);
      if (typeof showToast === 'function') showToast(e.message || 'Falha ao gerar relatório.', 'error');
      return;
    }
    if (!reportRows.length) {
      if (typeof showToast === 'function') showToast('Nenhum vendedor neste filtro para exportar.', 'warning');
      return;
    }
    const stamp = this._reportStamp();
    const base = `Relatorio_Ranking_${stamp}`;
    try {
      if (format === 'html') {
        const html = this._buildReportHtml(reportRows);
        this._downloadBlob(`${base}.html`, new Blob([html], { type: 'text/html;charset=utf-8' }));
      } else if (format === 'csv') {
        const aoa = this._buildReportAoA(reportRows);
        const lines = aoa.map((row) => row.map((c) => {
          if (typeof c === 'number') {
            return String(c).replace('.', ',');
          }
          return `"${String(c ?? '').replace(/"/g, '""')}"`;
        }).join(';'));
        this._downloadBlob(
          `${base}.csv`,
          new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
        );
      } else if (format === 'xlsx') {
        if (typeof window.ensureXlsx === 'function') {
          await window.ensureXlsx();
        } else if (typeof XLSX === 'undefined') {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Falha ao carregar SheetJS'));
            document.head.appendChild(s);
          });
        }
        if (typeof XLSX === 'undefined') throw new Error('Excel (SheetJS) não carregou.');
        const aoa = this._buildReportAoA(reportRows);
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Ranking');
        XLSX.writeFile(wb, `${base}.xlsx`);
      } else {
        throw new Error('Formato inválido.');
      }
      if (typeof showToast === 'function') showToast('Relatório baixado.', 'success');
    } catch (e) {
      console.warn('[SalesRanking] download:', e);
      if (typeof showToast === 'function') showToast(e.message || 'Falha no download.', 'error');
    }
  },

  _filterProposals(proposals) {
    const { start, end } = this._periodRange(this._filters.period);
    const statusWant = this._filters.status;
    const faseWant = this._filters.fase;
    const billingWant = this._filters.billing || 'total';

    return (proposals || []).filter(p => {
      if (!p || !p.id) return false;

      const d = this._proposalBillingDate(p);
      if (start && d < start) return false;
      if (end && d >= end) return false;

      if (!this._matchesBillingStatus(p, billingWant)) return false;

      const st = this._proposalStatus(p);
      const fase = this._proposalFase(p);

      if (statusWant) {
        const stHit = this._matchesFilter(st, statusWant);
        const fallbackHit = !st && this._matchesFilter(fase, statusWant);
        if (!stHit && !fallbackHit) return false;
      }
      if (faseWant && !this._matchesFilter(fase, faseWant)) return false;
      return true;
    });
  },

  /** Mesmo filtro do gráfico do dashboard (período + faturamento), quando não há Status/Fase extra. */
  _filterForDashboardSync(proposals) {
    const period = this._filters.period || 'month';
    const billing = this._filters.billing || 'total';
    const hasExtra = !!(this._filters.status || this._filters.fase);
    const dashFilter = typeof window._dashBillingFilter === 'string' ? window._dashBillingFilter : null;
    const dashBilling = typeof window._dashBillingStatusFilter === 'string' ? window._dashBillingStatusFilter : null;
    const filterKey = (!hasExtra && dashFilter && dashBilling === billing) ? dashFilter : period;
    if (!hasExtra && typeof window._filterPropsForTeamBilling === 'function'
      && (filterKey === 'month' || filterKey === 'all' || filterKey === 'custom' || filterKey === 'day' || filterKey === 'year')) {
      return window._filterPropsForTeamBilling(proposals, filterKey, billing);
    }
    return this._filterProposals(proposals);
  },

  async _prepareRankingData(opts = {}) {
    const users = await this._loadAllRankingVendors();
    const usersByName = await this._getUsersByVendorName();
    const vendorIndex = this._buildVendorIndex(users);
    const userIds = users.map((u) => u.id);
    const rawProps = await this._loadProposals(opts);
    const filtered = this._filterForDashboardSync(rawProps);
    const scoped = this._scopeProposals(filtered, userIds, vendorIndex, usersByName, true);
    const rows = this._aggregate(users, scoped, vendorIndex, usersByName, true);
    const dashTotal = filtered.reduce((s, p) => s + this._proposalChartAmount(p), 0);
    const dashTotalBruto = filtered.reduce((s, p) => s + this._proposalGrossAmount(p), 0);
    const rankedTotal = rows.reduce((s, r) => s + (r.total || 0), 0);
    const rankedIds = new Set(userIds.map(String));
    let orphanCount = 0;
    let orphanTotal = 0;
    filtered.forEach((p) => {
      const vid = this._resolveVendorId(p, vendorIndex, usersByName, true);
      if (!vid || !rankedIds.has(String(vid))) {
        orphanCount += 1;
        orphanTotal += this._proposalChartAmount(p);
      }
    });
    // #region agent log
    fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'rank-sync3',hypothesisId:'H4-H5',location:'sales-ranking.js:prepare',message:'ranking vs dashboard totals',data:{period:this._filters.period,billing:this._filters.billing||'total',rawCount:rawProps.length,filteredCount:filtered.length,dashTotal,rankedTotal,orphanCount,orphanTotal,dashCachedTotal:window._dashBillingTotal??null,dashCachedCount:window._dashPropCount??null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return { users, vendorIndex, usersByName, userIds, rawProps, filtered, scoped, rows, dashTotal, dashTotalBruto, rankedTotal, orphanCount, orphanTotal };
  },

  _buildOrphanReportRow(filtered, users, vendorIndex, usersByName) {
    const rankedIds = new Set((users || []).map((u) => String(u.id)));
    let count = 0;
    let total = 0;
    let bruto = 0;
    let efetivado = 0;
    let cobranca = 0;
    let cancelado = 0;
    (filtered || []).forEach((p) => {
      const vid = this._resolveVendorId(p, vendorIndex, usersByName, true);
      if (vid && rankedIds.has(String(vid))) return;
      count += 1;
      const amt = this._proposalChartAmount(p);
      total += amt;
      bruto += this._proposalGrossAmount(p);
      const bucket = this._funnelBucket(p);
      if (bucket === 'efetivado') efetivado += amt;
      else if (bucket === 'cancelado') cancelado += amt;
      else cobranca += amt;
    });
    if (!count) return null;
    return {
      pos: 0,
      name: 'Parceiros / Sem vendedor',
      department: '—',
      matricula: '—',
      tier: '—',
      qtd: count,
      faturamento: total,
      qtdPeriodo: count,
      bruto,
      efetivado,
      cobranca,
      cancelado,
      _orphan: true,
    };
  },

  /** Ranking dos funcionários (employee.html) — sem filtros master nem valores em R$. */
  async _renderPublicRanking(listId, opts = {}) {
    const users = await this._loadAllRankingVendors();
    const vendorIndex = this._buildVendorIndex(users);
    const userIds = users.map((u) => u.id);
    const rawProps = await this._loadProposals({ force: true, skipDashCache: true, fullList: true });
    const allProps = this._scopeProposals(rawProps, userIds, vendorIndex, null, false);
    const rows = this._aggregateByPaidAndProposals(users, allProps, vendorIndex, null, false);
    // #region agent log
    fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'rank-emp-fix',hypothesisId:'H-public',location:'sales-ranking.js:public-rank',message:'public ranking rendered',data:{listId,vendors:users.length,rows:rows.length,props:allProps.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    this._renderList(listId, rows, {
      viewerId: opts.viewerId || '',
      viewer: opts.viewer || null,
      showSalesAmount: false,
      rankMode: 'public',
      allowAddPoints: false,
    });
    return { users, rows, allProps };
  },

  _tierForSales(total) {
    if (typeof VendorTierPoints !== 'undefined' && VendorTierPoints.tierForSales) {
      return VendorTierPoints.tierForSales(total);
    }
    return null;
  },

  _canViewSalesAmount(viewer) {
    return typeof canViewRankingSalesValues === 'function'
      ? canViewRankingSalesValues(viewer)
      : false;
  },

  /** Master/fundador/gerência: filtros + faturamento. Demais: lista global por pagas e propostas. */
  _isMasterRankingMode(viewer) {
    return this._canViewSalesAmount(viewer);
  },

  _rankingToolbarCard(filtersId, summaryId) {
    const filters = document.getElementById(filtersId);
    const summary = document.getElementById(summaryId);
    return filters?.closest('.card') || summary?.closest('.card') || null;
  },

  _showRankingToolbar(filtersId, summaryId) {
    const card = this._rankingToolbarCard(filtersId, summaryId);
    if (card) card.style.display = '';
    const filters = document.getElementById(filtersId);
    const summary = document.getElementById(summaryId);
    if (filters) filters.style.display = '';
    if (summary) summary.style.display = '';
  },

  /** Esconde filtros/resumo e o card vazio (barra branca) para quem não é master. */
  _hideRankingToolbar(filtersId, summaryId) {
    const filters = document.getElementById(filtersId);
    const summary = document.getElementById(summaryId);
    if (filters) {
      filters.innerHTML = '';
      filters.style.display = 'none';
    }
    if (summary) {
      summary.textContent = '';
      summary.style.display = 'none';
    }
    const card = this._rankingToolbarCard(filtersId, summaryId);
    if (card) card.style.display = 'none';
  },

  async _loadAllRankingVendors() {
    let users = [];
    try {
      users = await DB.getAllUsers();
    } catch (e) {
      console.warn('[SalesRanking] users:', e);
    }
    return (users || [])
      .filter(u => typeof isRankingParticipant === 'function' && isRankingParticipant(u))
      .filter(u => typeof isUserInPartnerNetworkSync !== 'function' || !isUserInPartnerNetworkSync(u));
  },

  _isPaidProposal(p) {
    if (typeof DB !== 'undefined' && typeof DB.isPaidProposal === 'function') {
      return DB.isPaidProposal(p);
    }
    const st = this._norm(this._proposalStatus(p));
    const fase = this._norm(this._proposalFase(p));
    return st === 'pago' || st.includes('pago') || fase === 'pago' || fase.includes('pago');
  },

  _fmtSales(v) {
    if (typeof VendorTierPoints !== 'undefined' && VendorTierPoints.fmtSales) {
      return VendorTierPoints.fmtSales(v);
    }
    return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  _aggregate(users, proposals, vendorIndex, usersByName, masterMode = true) {
    const billing = this._filters.billing || 'total';
    const byVendor = {};
    let _dbgAmt = null;
    proposals.forEach(p => {
      const vid = this._resolveVendorId(p, vendorIndex, usersByName, masterMode);
      if (!vid) return;
      if (!byVendor[vid]) byVendor[vid] = { total: 0, bruto: 0, count: 0 };
      const amt = this._proposalChartAmount(p, billing);
      const bruto = this._proposalGrossAmount(p);
      if (!_dbgAmt && amt > 0) {
        _dbgAmt = {
          id: p.id || p.numero,
          valor: p.valor,
          valorFinal: p.valorFinal ?? p.valor_final,
          used: amt,
          bruto,
          billing,
          created: p.createdAt || p.created_at,
        };
      }
      byVendor[vid].total += amt;
      byVendor[vid].bruto += bruto;
      byVendor[vid].count += 1;
    });
    // #region agent log
    if (_dbgAmt) {
      fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'rank-final',hypothesisId:'amt-date',location:'sales-ranking.js:aggregate',message:'ranking amount sample',data:_dbgAmt,timestamp:Date.now()})}).catch(()=>{});
    }
    // #endregion

    return (users || [])
      .map(u => {
        const agg = byVendor[u.id] || { total: 0, bruto: 0, count: 0 };
        return {
          user: u,
          total: agg.total,
          bruto: agg.bruto,
          count: agg.count,
          paidCount: 0,
          tier: this._tierForSales(agg.total),
        };
      })
      .filter(r => r.count > 0)
      .sort((a, b) => b.total - a.total || b.count - a.count);
  },

  /** Ranking público: pagas + total de propostas (sem R$, pontos ou faixas). */
  _aggregateByPaidAndProposals(users, proposals, vendorIndex, usersByName, masterMode = false) {
    const byVendor = {};
    (proposals || []).forEach(p => {
      const vid = this._resolveVendorId(p, vendorIndex, usersByName, masterMode);
      if (!vid) return;
      if (!byVendor[vid]) byVendor[vid] = { paidCount: 0, count: 0 };
      byVendor[vid].count += 1;
      if (this._isPaidProposal(p)) byVendor[vid].paidCount += 1;
    });

    return (users || [])
      .map(u => {
        const agg = byVendor[u.id] || { paidCount: 0, count: 0 };
        return {
          user: u,
          total: 0,
          count: agg.count,
          paidCount: agg.paidCount,
          tier: null,
        };
      })
      .filter(r => r.count > 0)
      .sort((a, b) => b.paidCount - a.paidCount || b.count - a.count);
  },

  _prefixForList(listId) {
    return listId === 'adminRankingList' ? 'Admin' : 'Emp';
  },

  _readFilters(prefix) {
    this._filters.period = document.getElementById(`salesRankPeriod${prefix}`)?.value || this._filters.period;
    this._filters.billing = document.getElementById(`salesRankBilling${prefix}`)?.value || this._filters.billing || 'total';
    this._filters.status = document.getElementById(`salesRankStatus${prefix}`)?.value || '';
    this._filters.fase = document.getElementById(`salesRankFase${prefix}`)?.value || '';
  },

  _renderFiltersUI(containerId, listId, opts = {}) {
    const box = document.getElementById(containerId);
    if (!box) return;
    const viewer = opts.viewer || (typeof Auth !== 'undefined' ? Auth.getSession() : null);
    const showMasterDetails = this._canViewSalesAmount(viewer);
    const prefix = this._prefixForList(listId);
    const period = this._filters.period || 'month';
    const billing = this._filters.billing || 'total';
    const status = this._filters.status || '';
    const fase = this._filters.fase || '';

    const sel = (opts, cur) => opts.map(o => {
      const v = typeof o === 'string' ? o : o.v;
      const label = typeof o === 'string' ? o : (o.l || o.v);
      return `<option value="${v}"${v === cur ? ' selected' : ''}>${label}</option>`;
    }).join('');

    const billingOpts = sel(this.BILLING_OPTIONS, billing);
    const statusOpts = sel([{ v: '', l: 'Todos os status' }, ...this.STATUS_OPTIONS.map(s => ({ v: s, l: s }))], status);
    const faseOpts = sel([{ v: '', l: 'Todas as fases' }, ...this.FASE_OPTIONS.map(s => ({ v: s, l: s }))], fase);

    box.innerHTML = `
<div class="sales-ranking-toolbar">
  <div class="sales-ranking-filter-group">
    <span class="sales-ranking-filter-label">PERÍODO</span>
    <select id="salesRankPeriod${prefix}" class="form-control sales-ranking-select">
      <option value="month"${period === 'month' ? ' selected' : ''}>Este mês</option>
      <option value="last_month"${period === 'last_month' ? ' selected' : ''}>Mês anterior</option>
      <option value="all"${period === 'all' ? ' selected' : ''}>Todo o período</option>
    </select>
  </div>
  <div class="sales-ranking-filter-group">
    <span class="sales-ranking-filter-label">FATURAMENTO</span>
    <select id="salesRankBilling${prefix}" class="form-control sales-ranking-select">${billingOpts}</select>
  </div>
  <div class="sales-ranking-filter-group">
    <span class="sales-ranking-filter-label">STATUS</span>
    <select id="salesRankStatus${prefix}" class="form-control sales-ranking-select">${statusOpts}</select>
  </div>
  <div class="sales-ranking-filter-group">
    <span class="sales-ranking-filter-label">FASE</span>
    <select id="salesRankFase${prefix}" class="form-control sales-ranking-select">${faseOpts}</select>
  </div>
  ${showMasterDetails ? `<div class="sales-ranking-filter-group sales-ranking-export-group">
    <span class="sales-ranking-filter-label">RELATÓRIO</span>
    <div class="sales-ranking-export-btns">
      <button type="button" class="btn btn-primary btn-sm" id="salesRankExportHtml${prefix}" title="Baixar HTML (como Relatorio_Vendedores)">Gerar relatório</button>
      <button type="button" class="btn btn-outline btn-sm" id="salesRankExportCsv${prefix}">CSV</button>
      <button type="button" class="btn btn-outline btn-sm" id="salesRankExportXlsx${prefix}">Excel</button>
    </div>
  </div>` : ''}
</div>
${showMasterDetails ? `<p class="form-hint" style="margin:12px 0 0;font-size:12px;">
  <strong>Faturamento</strong> = mesmo filtro do dashboard (valor final · data de criação).
  Padrão: <strong>Este mês + Fatura Total</strong> — o total geral bate com o Painel Master.
  <strong>Status/Fase</strong> refinam além do faturamento. Classificação <strong>FAIXA1–FAIXA18</strong> pelo total filtrado.
  Use <strong>Gerar relatório</strong> para baixar com os mesmos números exibidos aqui.
</p>` : ''}`;

    const rerender = () => {
      this._readFilters(prefix);
      if (listId === 'adminRankingList' && typeof renderAdminRanking === 'function') {
        renderAdminRanking();
      } else if (listId === 'rankingList' && typeof renderRanking === 'function') {
        renderRanking();
      }
    };

    [`salesRankPeriod${prefix}`, `salesRankBilling${prefix}`, `salesRankStatus${prefix}`, `salesRankFase${prefix}`].forEach(id => {
      document.getElementById(id)?.addEventListener('change', rerender);
    });

    if (showMasterDetails) {
      const exportOpts = { viewer, prefix };
      document.getElementById(`salesRankExportHtml${prefix}`)?.addEventListener('click', () => {
        this.exportReport('html', exportOpts);
      });
      document.getElementById(`salesRankExportCsv${prefix}`)?.addEventListener('click', () => {
        this.exportReport('csv', exportOpts);
      });
      document.getElementById(`salesRankExportXlsx${prefix}`)?.addEventListener('click', () => {
        this.exportReport('xlsx', exportOpts);
      });
    }
  },

  _renderSummary(summaryId, rows, proposals, opts = {}) {
    const el = document.getElementById(summaryId);
    if (!el) return;
    const showMasterDetails = opts.showSalesAmount !== false && this._canViewSalesAmount(opts.viewer);
    if (!showMasterDetails) {
      el.textContent = '';
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    const billing = this._filters.billing || 'total';
    const isPagas = billing === 'pagas';
    const totalBilling = proposals.reduce((s, p) => s + this._proposalChartAmount(p, billing), 0);
    const totalBruto = proposals.reduce((s, p) => s + this._proposalGrossAmount(p), 0);
    const rankedBilling = rows.reduce((s, r) => s + (r.total || 0), 0);
    const rankedBruto = rows.reduce((s, r) => s + (r.bruto || 0), 0);
    const rankedCount = rows.reduce((s, r) => s + (r.count || 0), 0);
    const vendorIndex = opts.vendorIndex;
    const unassigned = vendorIndex
      ? (proposals || []).filter((p) => !this._resolveVendorId(p, vendorIndex, opts.usersByName)).length
      : 0;
    const parts = [
      this._periodLabel(this._filters.period),
      this._billingLabel(billing),
      `${rows.length} no ranking`,
      `${proposals.length} proposta(s)`,
      `Bruto: ${this._fmtSales(totalBruto)}`,
    ];
    if (isPagas) parts.push(`Pago (final): ${this._fmtSales(totalBilling)}`);
    else parts.push(`Faturamento: ${this._fmtSales(totalBilling)}`);
    if (Math.abs(rankedBilling - totalBilling) > 0.01) {
      parts.push(`Atribuído: ${this._fmtSales(rankedBilling)} (${rankedCount} prop.)`);
    }
    if (isPagas && Math.abs(rankedBruto - totalBruto) > 0.01) {
      parts.push(`Bruto atribuído: ${this._fmtSales(rankedBruto)}`);
    }
    if (unassigned > 0) parts.push(`${unassigned} sem vendedor`);
    if (this._filters.status) parts.push(`Status: ${this._filters.status}`);
    if (this._filters.fase) parts.push(`Fase: ${this._filters.fase}`);
    el.textContent = parts.join(' · ');
  },

  _renderList(listId, rows, opts = {}) {
    const box = document.getElementById(listId);
    if (!box) return;
    const medals = ['#1', '#2', '#3'];
    const cls = ['gold', 'silver', 'bronze'];
    const viewerId = opts.viewerId || '';
    const publicRank = opts.rankMode === 'public';
    const showSales = !publicRank && opts.showSalesAmount !== false && this._canViewSalesAmount(opts.viewer);
    const showMasterDetails = showSales;
    const billing = this._filters.billing || 'total';
    const isPagasBilling = billing === 'pagas';

    if (!rows.length) {
      box.innerHTML = publicRank
        ? `<div class="text-muted text-center" style="padding:28px 16px;">Nenhum vendedor com propostas registradas.</div>`
        : `<div class="text-muted text-center" style="padding:28px 16px;">
        Nenhum vendedor com propostas neste filtro.<br>
        <span style="font-size:12px;">Tente <strong>Todo o período</strong> ou limpe Status/Fase.</span>
      </div>`;
      return;
    }

    box.innerHTML = rows.map((row, i) => {
      const e = row.user;
      const isMe = viewerId && e.id === viewerId;
      const tier = row.tier;
      const pos = i + 1;
      const tierBadge = tier
        ? `<span class="badge badge-primary sales-ranking-tier" title="Classificação por faturamento no período">${tier.label}</span>`
        : `<span class="badge badge-muted sales-ranking-tier">Abaixo FAIXA1</span>`;
      const showAdd = !publicRank && opts.allowAddPoints
        && (typeof canSouBluManagePoints !== 'function' || canSouBluManagePoints(e));
      const addBtn = showAdd
        ? `<button type="button" class="btn btn-outline btn-sm" onclick="navigateTo('secBalance');setTimeout(function(){var el=document.getElementById('balanceEmployee');if(el)el.value='${e.id}'},100)">+ Pontos</button>`
        : '';
      const statsHtml = publicRank
        ? `<span class="ranking-item__count"><strong>${row.paidCount || 0}</strong> paga(s) · <strong>${row.count || 0}</strong> proposta(s)</span>`
        : `${showMasterDetails ? `<span class="ranking-item__classif-label">Classificação</span>${tierBadge}` : ''}
            ${showSales ? `<span class="ranking-item__sales">${isPagasBilling && row.bruto > 0 && Math.abs(row.bruto - row.total) > 0.01
              ? `${this._fmtSales(row.total)} <span style="font-size:11px;color:var(--color-text-muted);">(bruto ${this._fmtSales(row.bruto)})</span>`
              : this._fmtSales(row.total)}</span>` : ''}
            <span class="ranking-item__count">${row.count} proposta(s)</span>`;

      return `<div class="ranking-item${isMe ? ' ranking-item--me' : ''}">
        <div class="ranking-pos ${cls[i] || ''}">${i < 3 ? medals[i] : '#' + pos}</div>
        ${typeof avatarHtml === 'function' ? avatarHtml(e.name, 'avatar-sm', e.photo_url || '') : ''}
        <div class="ranking-item__body">
          <div class="ranking-name">${e.name}${isMe ? ' <span class="badge badge-primary">Você</span>' : ''}</div>
          <div class="ranking-dept">${e.department || '—'} · ${e.matricula || '—'}</div>
          <div class="ranking-item__stats">${statsHtml}</div>
        </div>
        ${addBtn}
      </div>`;
    }).join('');
  },

  async renderAdmin() {
    const listId = 'adminRankingList';
    const prefix = this._prefixForList(listId);
    const viewer = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    const masterMode = this._isMasterRankingMode(viewer);
    const showSalesAmount = masterMode;
    const box = document.getElementById(listId);
    if (box) {
      box.innerHTML = '<div class="text-muted text-center" style="padding:24px;">Carregando ranking...</div>';
    }

    if (masterMode) {
      this._showRankingToolbar('salesRankingFiltersAdmin', 'salesRankingSummaryAdmin');
      this._renderFiltersUI('salesRankingFiltersAdmin', listId, { viewer, showSalesAmount });
      this._readFilters(prefix);
      const { filtered, rows, vendorIndex, usersByName } = await this._prepareRankingData({ force: true });
      this._renderSummary('salesRankingSummaryAdmin', rows, filtered, { viewer, showSalesAmount, vendorIndex, usersByName });
      const allowAddPoints = typeof IS_SUPERVISOR !== 'undefined' && typeof CAN_EMPLOYEES_PANEL !== 'undefined'
        && !IS_SUPERVISOR && CAN_EMPLOYEES_PANEL;
      this._renderList(listId, rows, {
        allowAddPoints,
        viewer,
        showSalesAmount,
        rankMode: 'master',
      });
      return;
    }

    this._filters = { period: 'all', status: '', fase: '', billing: 'total' };
    this._hideRankingToolbar('salesRankingFiltersAdmin', 'salesRankingSummaryAdmin');
    await this._renderPublicRanking(listId, { viewer });
  },

  async renderEmployee(viewer) {
    const listId = 'rankingList';
    const prefix = this._prefixForList(listId);
    const cu = viewer || window.currentUser || {};
    const masterMode = this._isMasterRankingMode(cu);
    const showSalesAmount = masterMode;
    const box = document.getElementById(listId);
    if (box) {
      box.innerHTML = '<div class="text-muted text-center" style="padding:24px;">Carregando ranking...</div>';
    }

    if (masterMode) {
      this._showRankingToolbar('salesRankingFiltersEmployee', 'salesRankingSummaryEmployee');
      this._renderFiltersUI('salesRankingFiltersEmployee', listId, { viewer: cu, showSalesAmount });
      this._readFilters(prefix);
      const { filtered, rows, vendorIndex, usersByName } = await this._prepareRankingData({ force: true });
      this._renderSummary('salesRankingSummaryEmployee', rows, filtered, { viewer: cu, showSalesAmount, vendorIndex, usersByName });
      this._renderList(listId, rows, {
        viewerId: cu.id,
        viewer: cu,
        showSalesAmount,
        rankMode: 'master',
      });
      return;
    }

    this._filters = { period: 'all', status: '', fase: '', billing: 'total' };
    this._hideRankingToolbar('salesRankingFiltersEmployee', 'salesRankingSummaryEmployee');
    await this._renderPublicRanking(listId, { viewerId: cu.id, viewer: cu });
  },
};
