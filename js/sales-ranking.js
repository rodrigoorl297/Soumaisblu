/* Ranking de vendas — classificação (faixas) + filtros Status e Fase */

window.SalesRanking = {
  _cache: { proposals: null, at: 0 },
  _filters: { period: 'all', status: '', fase: '' },

  STATUS_OPTIONS: [
    'Em Andamento', 'AG. BOLETO', 'Digitação', 'PROPOSTA DIGITADA', 'AG. ASS TERMO',
    'AG. VÍDEO', 'AG. ASS PROPOSTA', 'BOLETO VALIDADO', 'AG. QUITAÇÃO', 'BOLETO QUITADO',
    'AG. LIBERAÇÃO MARGEM', 'AVERBADO', 'PAGO', 'Pendenciado', 'Cancelado',
  ],

  FASE_OPTIONS: (window.Proposals && Proposals._VENDOR_SITUACOES)
    ? Proposals._VENDOR_SITUACOES.map(o => o.v)
    : [
        'Em Andamento', 'Digitação', 'AG. BOLETO', 'PROPOSTA DIGITADA', 'AG. ASS TERMO',
        'AG. VÍDEO', 'AG. ASS PROPOSTA', 'BOLETO VALIDADO', 'AG. QUITAÇÃO', 'BOLETO QUITADO',
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

  _proposalBillingDate(p) {
    if (typeof DB !== 'undefined' && typeof DB.proposalBillingDate === 'function') {
      return DB.proposalBillingDate(p);
    }
    const raw = p.createdAt || p.created_at;
    const d = raw ? new Date(raw) : new Date(0);
    return Number.isNaN(d.getTime()) ? new Date(0) : d;
  },

  _proposalDate(p) {
    if (typeof DB !== 'undefined' && typeof DB.proposalDate === 'function') {
      return DB.proposalDate(p);
    }
    const raw = p.createdAt || p.created_at;
    const d = raw ? new Date(raw) : new Date(0);
    return Number.isNaN(d.getTime()) ? new Date(0) : d;
  },

  _proposalAmount(p) {
    if (typeof DB !== 'undefined' && typeof DB.proposalAmount === 'function') {
      return DB.proposalAmount(p);
    }
    return parseFloat(p?.valorFinal ?? p?.valor_final ?? p?.valor ?? 0) || 0;
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

  _resolveVendorId(p, vendorIndex) {
    const id = this._vendorId(p);
    if (id && (!vendorIndex || vendorIndex.byId.has(id))) return id;
    if (id) return id;
    if (!vendorIndex) return '';
    const vn = this._norm(p.vendorName || p.vendor_name);
    if (vn && vendorIndex.byName.has(vn)) return vendorIndex.byName.get(vn);
    return '';
  },

  async _loadProposals() {
    const ttl = 45000;
    if (this._cache.proposals && Date.now() - this._cache.at < ttl) {
      return this._cache.proposals;
    }
    let rows = [];
    try {
      if (typeof DB.listProposals === 'function') rows = await DB.listProposals();
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
  },

  _scopeProposals(proposals, userIds, vendorIndex) {
    const set = new Set((userIds || []).map(String));
    if (!set.size) return proposals || [];
    return (proposals || []).filter((p) => {
      const vid = this._resolveVendorId(p, vendorIndex);
      return vid && set.has(String(vid));
    });
  },

  _filterProposals(proposals) {
    const { start, end } = this._periodRange(this._filters.period);
    const statusWant = this._filters.status;
    const faseWant = this._filters.fase;

    return (proposals || []).filter(p => {
      const d = this._proposalBillingDate(p);
      if (start && d < start) return false;
      if (end && d >= end) return false;

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

  /** Master/fundador: filtros + faturamento. Demais: lista global por pagas e propostas. */
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
    const st = this._norm(this._proposalStatus(p));
    const fase = this._norm(this._proposalFase(p));
    return st === 'pago' || fase === 'pago';
  },

  _fmtSales(v) {
    if (typeof VendorTierPoints !== 'undefined' && VendorTierPoints.fmtSales) {
      return VendorTierPoints.fmtSales(v);
    }
    return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  _aggregate(users, proposals, vendorIndex) {
    const byVendor = {};
    proposals.forEach(p => {
      const vid = this._resolveVendorId(p, vendorIndex);
      if (!vid) return;
      if (!byVendor[vid]) byVendor[vid] = { total: 0, count: 0 };
      byVendor[vid].total += this._proposalAmount(p);
      byVendor[vid].count += 1;
    });

    return (users || [])
      .map(u => {
        const agg = byVendor[u.id] || { total: 0, count: 0 };
        return {
          user: u,
          total: agg.total,
          count: agg.count,
          paidCount: 0,
          tier: this._tierForSales(agg.total),
        };
      })
      .filter(r => r.count > 0)
      .sort((a, b) => b.total - a.total || b.count - a.count);
  },

  /** Ranking público: pagas + total de propostas (sem R$, pontos ou faixas). */
  _aggregateByPaidAndProposals(users, proposals, vendorIndex) {
    const byVendor = {};
    (proposals || []).forEach(p => {
      const vid = this._resolveVendorId(p, vendorIndex);
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
    this._filters.status = document.getElementById(`salesRankStatus${prefix}`)?.value || '';
    this._filters.fase = document.getElementById(`salesRankFase${prefix}`)?.value || '';
  },

  _renderFiltersUI(containerId, listId, opts = {}) {
    const box = document.getElementById(containerId);
    if (!box) return;
    const viewer = opts.viewer || (typeof Auth !== 'undefined' ? Auth.getSession() : null);
    const showMasterDetails = this._canViewSalesAmount(viewer);
    const prefix = this._prefixForList(listId);
    const period = this._filters.period || 'all';
    const status = this._filters.status || '';
    const fase = this._filters.fase || '';

    const sel = (opts, cur) => opts.map(o => {
      const v = typeof o === 'string' ? o : o.v;
      const label = typeof o === 'string' ? o : (o.l || o.v);
      return `<option value="${v}"${v === cur ? ' selected' : ''}>${label}</option>`;
    }).join('');

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
    <span class="sales-ranking-filter-label">STATUS</span>
    <select id="salesRankStatus${prefix}" class="form-control sales-ranking-select">${statusOpts}</select>
  </div>
  <div class="sales-ranking-filter-group">
    <span class="sales-ranking-filter-label">FASE</span>
    <select id="salesRankFase${prefix}" class="form-control sales-ranking-select">${faseOpts}</select>
  </div>
</div>
${showMasterDetails ? `<p class="form-hint" style="margin:12px 0 0;font-size:12px;">
  <strong>Status</strong> = situação operacional da proposta · <strong>Fase</strong> = etapa do vendedor (situação na proposta).
  Classificação <strong>FAIXA1–FAIXA18</strong> pelo faturamento no período (valor final das propostas).
</p>` : ''}`;

    const rerender = () => {
      this._readFilters(prefix);
      if (listId === 'adminRankingList' && typeof renderAdminRanking === 'function') {
        renderAdminRanking();
      } else if (listId === 'rankingList' && typeof renderRanking === 'function') {
        renderRanking();
      }
    };

    [`salesRankPeriod${prefix}`, `salesRankStatus${prefix}`, `salesRankFase${prefix}`].forEach(id => {
      document.getElementById(id)?.addEventListener('change', rerender);
    });
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
    const totalBilling = proposals.reduce((s, p) => s + this._proposalAmount(p), 0);
    const rankedBilling = rows.reduce((s, r) => s + (r.total || 0), 0);
    const rankedCount = rows.reduce((s, r) => s + (r.count || 0), 0);
    const vendorIndex = opts.vendorIndex;
    const unassigned = vendorIndex
      ? (proposals || []).filter((p) => !this._resolveVendorId(p, vendorIndex)).length
      : 0;
    const parts = [
      this._periodLabel(this._filters.period),
      `${rows.length} no ranking`,
      `${proposals.length} proposta(s)`,
      `Faturamento: ${this._fmtSales(totalBilling)}`,
    ];
    if (Math.abs(rankedBilling - totalBilling) > 0.01) {
      parts.push(`Atribuído: ${this._fmtSales(rankedBilling)} (${rankedCount} prop.)`);
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
            ${showSales ? `<span class="ranking-item__sales">${this._fmtSales(row.total)}</span>` : ''}
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

    if (masterMode) {
      this._showRankingToolbar('salesRankingFiltersAdmin', 'salesRankingSummaryAdmin');
      this._renderFiltersUI('salesRankingFiltersAdmin', listId, { viewer, showSalesAmount });
      this._readFilters(prefix);
    } else {
      this._filters = { period: 'all', status: '', fase: '' };
      this._hideRankingToolbar('salesRankingFiltersAdmin', 'salesRankingSummaryAdmin');
    }

    const users = await this._loadAllRankingVendors();
    const vendorIndex = this._buildVendorIndex(users);
    const userIds = users.map(u => u.id);
    const allProps = this._scopeProposals(await this._loadProposals(), userIds, vendorIndex);
    const filtered = masterMode ? this._filterProposals(allProps) : allProps;
    const rows = masterMode
      ? this._aggregate(users, filtered, vendorIndex)
      : this._aggregateByPaidAndProposals(users, filtered, vendorIndex);

    this._renderSummary('salesRankingSummaryAdmin', rows, filtered, { viewer, showSalesAmount, vendorIndex });
    const allowAddPoints = masterMode
      && typeof IS_SUPERVISOR !== 'undefined' && typeof CAN_EMPLOYEES_PANEL !== 'undefined'
      && !IS_SUPERVISOR && CAN_EMPLOYEES_PANEL;
    this._renderList(listId, rows, {
      allowAddPoints,
      viewer,
      showSalesAmount,
      rankMode: masterMode ? 'master' : 'public',
    });
  },

  async renderEmployee(viewer) {
    const listId = 'rankingList';
    const prefix = this._prefixForList(listId);
    const cu = viewer || window.currentUser || {};
    const masterMode = this._isMasterRankingMode(cu);
    const showSalesAmount = masterMode;

    if (masterMode) {
      this._showRankingToolbar('salesRankingFiltersEmployee', 'salesRankingSummaryEmployee');
      this._renderFiltersUI('salesRankingFiltersEmployee', listId, { viewer: cu, showSalesAmount });
      this._readFilters(prefix);
    } else {
      this._filters = { period: 'all', status: '', fase: '' };
      this._hideRankingToolbar('salesRankingFiltersEmployee', 'salesRankingSummaryEmployee');
    }

    const users = await this._loadAllRankingVendors();
    const vendorIndex = this._buildVendorIndex(users);
    const userIds = users.map(u => u.id);
    const allProps = this._scopeProposals(await this._loadProposals(), userIds, vendorIndex);
    const filtered = masterMode ? this._filterProposals(allProps) : allProps;
    const rows = masterMode
      ? this._aggregate(users, filtered, vendorIndex)
      : this._aggregateByPaidAndProposals(users, filtered, vendorIndex);

    this._renderSummary('salesRankingSummaryEmployee', rows, filtered, { viewer: cu, showSalesAmount, vendorIndex });
    this._renderList(listId, rows, {
      viewerId: cu.id,
      viewer: cu,
      showSalesAmount,
      rankMode: masterMode ? 'master' : 'public',
    });
  },
};
