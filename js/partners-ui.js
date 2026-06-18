/* SOU+BLU — Parceiros UI (wrapper para página RH) */
(function () {
  'use strict';

  function _role() {
    return String(typeof Auth !== 'undefined' && Auth.getSession ? Auth.getSession()?.role : '').toLowerCase();
  }

  function canManagePartners() {
    return ['master', 'fundador', 'rh', 'gerencia', 'gerente', 'diretoria'].includes(_role());
  }

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function fmtCnpj(v) {
    const d = String(v || '').replace(/\D/g, '');
    if (d.length !== 14) return v || '';
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  function fmtCnpj(v) {
    const d = String(v || '').replace(/\D/g, '');
    if (d.length !== 14) return v || '';
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  const _PARTNER_ROLE_LABELS = {
    vendedor: 'Vendedor',
    operacional: 'Operacional',
    backoffice: 'Backoffice',
    rh: 'RH',
    financeiro: 'Financeiro',
    financial: 'Financeiro',
    employee: 'Colaborador',
  };

  function _partnerOrgIds(rootId, team) {
    const ids = new Set([String(rootId)]);
    (team || []).forEach((e) => ids.add(String(e.id)));
    return ids;
  }

  function _proposalInPartnerOrg(p, ids) {
    const primary = typeof DB.proposalVendorId === 'function'
      ? DB.proposalVendorId(p)
      : String(p?.vendorId || p?.vendor_id || p?.employee_id || '').trim();
    if (primary && ids.has(String(primary))) return true;
    if (primary) return false;
    const vidList = typeof DB._proposalVendorIds === 'function'
      ? DB._proposalVendorIds(p)
      : [p.vendorId, p.vendor_id, p.employee_id];
    return vidList.some((id) => id && ids.has(String(id)));
  }

  function _clientInPartnerOrg(c, ids) {
    const sid = c.supervisorId || c.supervisor_id;
    return sid && ids.has(String(sid));
  }

  function _partnerOrgStats(rootId, team, proposals, clients) {
    const ids = _partnerOrgIds(rootId, team);
    const props = (proposals || []).filter((p) => _proposalInPartnerOrg(p, ids));
    const clis = (clients || []).filter((c) => _clientInPartnerOrg(c, ids));
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const inMonth = (p) => (typeof DB.proposalInDateRange === 'function'
      ? DB.proposalInDateRange(p, monthStart, monthEnd)
      : (() => {
        const d = typeof DB.proposalBillingDate === 'function'
          ? DB.proposalBillingDate(p)
          : new Date(p.createdAt || p.created_at || 0);
        return d >= monthStart && d < monthEnd;
      })());
    const propsMonth = props.filter(inMonth);
    const propAmt = (p) => (typeof DB.proposalAmount === 'function' ? DB.proposalAmount(p) : 0);
    const propVid = (p) => (typeof DB.proposalVendorId === 'function'
      ? DB.proposalVendorId(p)
      : String(p?.vendorId || p?.vendor_id || p?.employee_id || '').trim());
    const fmtSum = (arr) => arr.reduce((s, p) => s + propAmt(p), 0);
    const byStatus = {};
    props.forEach((p) => {
      const st = p.status || '—';
      byStatus[st] = (byStatus[st] || 0) + 1;
    });
    const byVendor = {};
    propsMonth.forEach((p) => {
      const vid = propVid(p);
      const key = vid || '__sem_vendedor__';
      if (!byVendor[key]) {
        byVendor[key] = {
          id: key,
          name: vid ? (p.vendorName || p.vendor_name || '—') : 'Sem vendedor',
          count: 0,
          total: 0,
        };
      }
      byVendor[key].count += 1;
      byVendor[key].total += propAmt(p);
    });
    const activeTeam = (team || []).filter((e) => e.active !== false);
    return {
      team: team || [],
      activeTeam,
      rootInTeam: (team || []).find((e) => e.id === rootId),
      clients: clis,
      proposals: props,
      propsMonth,
      totalBilling: fmtSum(props),
      monthBilling: fmtSum(propsMonth),
      countPaid: props.filter((p) => String(p.status).toLowerCase() === 'pago').length,
      countOpen: props.filter((p) => !['pago', 'cancelado'].includes(String(p.status || '').toLowerCase())).length,
      byStatus,
      byVendor: Object.values(byVendor).sort((a, b) => b.total - a.total),
      recent: [...props].sort((a, b) => {
        const sortFn = typeof DB !== 'undefined' && DB.proposalSortTime
          ? (p) => DB.proposalSortTime(p)
          : (p) => new Date(p.createdAt || p.created_at || 0).getTime();
        return sortFn(b) - sortFn(a);
      }).slice(0, 5),
    };
  }

  function _renderPartnerDashboardBlock(p, u, stats) {
    const fmtR = (v) => 'R$ ' + parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const roleRows = ['vendedor', 'backoffice']
      .map((r) => {
        const n = stats.team.filter((e) => e.role === r).length;
        return n ? `<span class="badge badge-muted" style="font-size:10px;">${_PARTNER_ROLE_LABELS[r] || r}: ${n}</span>` : '';
      }).filter(Boolean).join(' ');
    const teamList = stats.activeTeam.length
      ? stats.activeTeam.map((e) => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--color-border);">
          ${typeof avatarHtml === 'function' ? avatarHtml(e.name, 'avatar-sm', e.photo_url || '') : ''}
          <div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:13px;">${esc(e.name)}</div>
          <div style="font-size:11px;color:var(--color-text-muted);">${_PARTNER_ROLE_LABELS[e.role] || e.role} · ${esc(e.department || '—')}</div></div>
          <span class="badge badge-muted" style="font-size:10px;">${typeof formatMoney === 'function' ? formatMoney(userPts(e)) : userPts(e).toLocaleString('pt-BR')}</span>
        </div>`).join('')
      : `<div class="text-muted text-center" style="padding:16px;font-size:13px;">Nenhum membro na equipe.
        <button type="button" class="btn btn-primary btn-sm" style="margin-top:8px;" onclick="openPartnerTeamManage('${esc(p.user_id)}')">Cadastrar equipe</button></div>`;
    const recentHtml = stats.recent.length
      ? stats.recent.map((pr) => {
        const st = pr.status || '—';
        const badge = st === 'Pago' ? 'badge-success' : st === 'Cancelado' ? 'badge-danger' : 'badge-warning';
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--color-border);">
          <div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:13px;">${esc(pr.numero || pr.id)} · ${esc(pr.clientName || '—')}</div>
          <div style="font-size:11px;color:var(--color-text-muted);">${esc(pr.vendorName || '—')} · ${String(pr.createdAt || pr.created_at || '').slice(0, 10)}</div></div>
          <span class="badge ${badge}" style="font-size:10px;">${esc(st)}</span>
          <strong style="font-size:12px;color:var(--color-success);white-space:nowrap;">${fmtR(typeof DB.proposalAmount === 'function' ? DB.proposalAmount(pr) : 0)}</strong></div>`;
      }).join('')
      : '<div class="text-muted text-center" style="padding:16px;font-size:13px;">Nenhuma proposta desta organização.</div>';
    const stat = typeof statCardHtml === 'function' ? statCardHtml : () => '';
    return `<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--color-border);">
      <div class="stat-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px;">${[
      stat({ icon: 'users', color: 'blue', label: 'Equipe', value: stats.activeTeam.length, sub: `${stats.team.length} cadastrados` }),
      stat({ icon: 'clients', color: 'green', label: 'Clientes', value: stats.clients.length, sub: 'da rede do parceiro' }),
      stat({ icon: 'proposals', color: 'orange', label: 'Propostas', value: stats.proposals.length, sub: `${stats.countOpen} em aberto · ${stats.countPaid} pagas` }),
      stat({ icon: 'billing', color: 'yellow', label: 'Faturamento (mês)', value: fmtR(stats.monthBilling), sub: `total ${fmtR(stats.totalBilling)}`, valueStyle: 'font-size:17px;' }),
    ].join('')}</div>
      ${roleRows ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">${roleRows}</div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="card card-padded" style="padding:14px;"><h4 style="font-weight:800;font-size:14px;margin:0 0 10px;">Equipe do parceiro</h4>${teamList}</div>
        <div class="card card-padded" style="padding:14px;"><h4 style="font-weight:800;font-size:14px;margin:0 0 10px;">Últimas propostas</h4>${recentHtml}</div>
      </div></div>`;
  }

  async function renderRhPartnersPanel() {
    const box = document.getElementById('partnersContent');
    if (!box) return;
    if (!canManagePartners()) {
      box.innerHTML = '<div class="card card-padded text-muted text-center">Sem permissão para gerenciar parceiros.</div>';
      return;
    }

    const permsEl = document.getElementById('partnerPermsCheckboxes');
    if (permsEl && typeof PartnerPerms !== 'undefined' && !permsEl.dataset.filled) {
      permsEl.innerHTML = PartnerPerms.renderCheckboxesHtml();
      permsEl.dataset.filled = '1';
    }
    if (typeof PartnerPerms !== 'undefined') PartnerPerms.ensureTeamPermsUi('partnerTeamPermsCheckboxes');

    let [partners, users, rawProps, rawClients] = await Promise.all([
      DB.getPartners().catch(() => []),
      DB.getAllUsers().catch(() => []),
      DB.getProposals().catch(() => []),
      DB.getClients({ pageSize: 800 }).catch(() => []),
    ]);

    if (partners.length && typeof DB.syncPartnerWithdrawalDebits === 'function') {
      await Promise.all(
        partners.filter((p) => p.user_id).map((p) => DB.syncPartnerWithdrawalDebits(p.user_id).catch(() => null))
      );
      users = await DB.getAllUsers().catch(() => users);
    }

    const allProposals = Array.isArray(rawProps) ? rawProps : [];
    const allClients = Array.isArray(rawClients) ? rawClients : [];

    if (!partners.length) {
      box.innerHTML = `<div class="card card-padded" style="text-align:center;padding:40px;color:var(--color-text-muted);">
        Nenhum parceiro cadastrado.<br>
        <button class="btn btn-primary btn-sm" style="margin-top:14px;" onclick="openPartnerModal()">+ Cadastrar parceiro</button></div>`;
      return;
    }

    const _partnerStatusOf = (p) => {
      const st = String(p?.meta?.status || '').trim().toLowerCase();
      if (st) return st;
      return p.active !== false ? 'ativo' : 'inativo';
    };
    const _partnerIsLive = (p, u) => {
      const st = _partnerStatusOf(p);
      return st === 'ativo' && p.active !== false && u?.active !== false;
    };

    let netProps = 0;
    let netClients = 0;
    let netBilling = 0;
    const stat = typeof statCardHtml === 'function' ? statCardHtml : () => '';

    const cardsHtml = partners.map((p) => {
      const u = users.find((x) => x.id === p.user_id);
      const team = users.filter((e) => DB.PARTNER_TEAM_ROLES.includes(e.role) && e.admin_id === p.user_id);
      const stats = _partnerOrgStats(p.user_id, team, allProposals, allClients);
      netProps += stats.proposals.length;
      netClients += stats.clients.length;
      netBilling += stats.monthBilling;

      const pStatus = _partnerStatusOf(p);
      const statusLabels = { ativo: 'Ativo', analise: 'Em análise', reprovado: 'Reprovado', inativo: 'Inativo' };
      const statusBadge = `<span class="badge ${pStatus === 'ativo' ? 'badge-success' : pStatus === 'analise' ? 'badge-warning' : 'badge-muted'}">${statusLabels[pStatus] || pStatus}</span>`;
      const live = _partnerIsLive(p, u);
      const perms = typeof PartnerPerms !== 'undefined' ? PartnerPerms.merge(p.permissions) : (p.permissions || {});
      const permTags = Object.keys(perms).filter((k) => perms[k] && k !== '_meta').slice(0, 6)
        .map((k) => `<span class="badge badge-muted" style="font-size:10px;">${esc((PartnerPerms.LABELS[k] || k).split('—')[0].trim())}</span>`).join(' ');
      const pendingHint = pStatus === 'analise'
        ? '<div style="margin-top:8px;padding:8px 10px;background:#f59e0b18;border-radius:8px;font-size:12px;color:#b45309;">Aguardando ativação — revise documentos e clique em <strong>Ativar parceiro</strong>.</div>'
        : '';
      const actionBtns = pStatus === 'analise'
        ? `<button class="btn btn-primary btn-sm" onclick="partnerActivate('${esc(p.id)}')">Ativar parceiro</button>`
        : `<button class="btn btn-primary btn-sm" onclick="openPartnerBalanceModal('${esc(p.user_id)}')" ${live ? '' : 'disabled'}>Distribuir saldo</button>
           <button class="btn btn-outline btn-sm" onclick="openPartnerTeamManage('${esc(p.user_id)}')" ${live ? '' : 'disabled'}>Cadastrar equipe</button>`;
      const toggleBtn = pStatus === 'analise'
        ? ''
        : `<button class="btn btn-ghost btn-sm" onclick="partnerToggleActive('${esc(p.id)}')">${live ? 'Desativar' : 'Ativar'}</button>`;

      return `<div class="card card-padded" style="margin-bottom:var(--space-lg);${pStatus === 'analise' ? 'border-left:4px solid #f59e0b;' : ''}">
        <div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;">
          <div style="flex:1;min-width:220px;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span style="font-size:17px;font-weight:800;">${esc(p.razao_social || u?.name || 'Parceiro')}</span>
              <span class="badge badge-info">Parceiro</span>${statusBadge}
            </div>
            <div style="font-size:13px;color:var(--color-text-muted);margin-top:6px;line-height:1.5;">
              CNPJ: <strong>${esc(fmtCnpj(p.cnpj) || '—')}</strong><br>
              ${esc(p.endereco || '—')}<br>
              Contato: ${esc(p.contato || '—')} · ${esc(p.email || u?.email || '—')}
            </div>${pendingHint}
            <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;">${permTags}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start;">
            ${actionBtns}
            <button class="btn btn-ghost btn-sm" onclick="openPartnerModal('${esc(p.id)}')">Editar</button>
            ${toggleBtn}
          </div>
        </div>
        ${pStatus === 'ativo' ? _renderPartnerDashboardBlock(p, u, stats) : '<p style="margin-top:12px;font-size:13px;color:var(--color-text-muted);">Painel operacional liberado após ativação.</p>'}
      </div>`;
    }).join('');

    const fmtR = (v) => 'R$ ' + parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    box.innerHTML = `<div class="stat-grid" style="margin-bottom:var(--space-lg);">${[
      stat({ icon: 'partners', color: 'blue', label: 'Parceiros ativos', value: partners.filter((x) => x.active !== false).length, sub: `${partners.length} cadastrados` }),
      stat({ icon: 'proposals', color: 'orange', label: 'Propostas (rede)', value: netProps, sub: 'todas as organizações' }),
      stat({ icon: 'clients', color: 'green', label: 'Clientes (rede)', value: netClients, sub: 'vinculados aos parceiros' }),
      stat({ icon: 'billing', color: 'yellow', label: 'Faturamento rede (mês)', value: fmtR(netBilling), sub: 'soma dos parceiros', valueStyle: 'font-size:17px;' }),
    ].join('')}</div>${cardsHtml}`;
  }

  async function partnerActivate(partnerId) {
    if (!canManagePartners()) return;
    const p = await DB.getPartner(partnerId);
    if (!p) { showToast('Parceiro não encontrado.', 'error'); return; }
    if (!confirm(`Ativar o parceiro "${p.razao_social || p.email}"?`)) return;
    showLoading('Ativando parceiro...');
    try {
      const meta = { ...(p.meta || {}), status: 'ativo', compliance_aprovado: true };
      await DB.savePartner({ ...p, active: true, meta });
      if (p.user_id) await DB.updateUser(p.user_id, { active: true });
      showToast('Parceiro ativado!', 'success');
      await renderRhPartnersPanel();
    } catch (e) {
      showToast('Erro ao ativar: ' + (e.message || ''), 'error');
    } finally { hideLoading(); }
  }

  async function partnerToggleActive(partnerId) {
    if (!canManagePartners()) return;
    const p = await DB.getPartner(partnerId);
    if (!p) return;
    const meta = { ...(p.meta || {}) };
    const live = meta.status === 'ativo' && p.active !== false;
    const next = !live;
    showLoading();
    try {
      await DB.savePartner({
        ...p,
        active: next,
        meta: { ...meta, status: next ? 'ativo' : 'inativo', compliance_aprovado: next ? true : !!meta.compliance_aprovado },
      });
      if (p.user_id) await DB.updateUser(p.user_id, { active: next });
      showToast(next ? 'Parceiro ativado.' : 'Parceiro desativado.', 'info');
      await renderRhPartnersPanel();
    } catch (e) {
      showToast('Erro: ' + (e.message || ''), 'error');
    } finally { hideLoading(); }
  }

  function openPartnerTeamManage(partnerUserId) {
    if (!partnerUserId || !canManagePartners()) return;
    try {
      sessionStorage.setItem('soublu_partner_team_root', String(partnerUserId));
    } catch (_) { /* noop */ }
    const base = typeof Auth !== 'undefined' && Auth.adminPageHrefFresh
      ? Auth.adminPageHrefFresh()
      : 'admin.html';
    try {
      const u = new URL(base, window.location.href);
      u.hash = 'secEmployees';
      window.location.href = u.href;
    } catch (_) {
      window.location.href = base + '#secEmployees';
    }
  }

  async function _partnerBalanceGestorRow(partnerRootId) {
    if (!partnerRootId) return null;
    const root = await DB.getUser(partnerRootId).catch(() => null);
    if (!root) return null;
    if (root.role !== 'parceiro') {
      const prt = await DB.getPartnerByUserId(partnerRootId).catch(() => null);
      if (!prt) return null;
    }
    return root;
  }

  async function populatePartnerBalanceSelect(partnerRootId) {
    const sel = document.getElementById('partnerBalanceEmployee');
    const gestorBox = document.getElementById('partnerBalanceGestorInfo');
    const row = await _partnerBalanceGestorRow(partnerRootId);
    if (!sel || !partnerRootId) return;
    if (!row) {
      sel.innerHTML = '<option value="">Gestor não encontrado</option>';
      if (gestorBox) gestorBox.innerHTML = '<div class="text-muted">Parceiro (gestor) não encontrado.</div>';
      return;
    }
    sel.innerHTML = `<option value="${row.id}" selected>${esc(row.name)}</option>`;
    if (gestorBox) {
      gestorBox.innerHTML = `<div style="font-weight:700;">${esc(row.name)}</div>
        <div style="font-size:12px;color:var(--color-text-muted);margin-top:4px;">Saldo atual <strong>${typeof formatCurrency === 'function' ? formatCurrency(userPts(row), row) : userPts(row)}</strong></div>`;
    }
  }

  async function renderPartnerBalanceHistory(partnerRootId) {
    const box = document.getElementById('partnerBalanceHistory');
    if (!box || !partnerRootId) return;
    const gestor = await _partnerBalanceGestorRow(partnerRootId);
    const txs = (await DB.getTransactions().catch(() => []))
      .filter((t) => gestor && t.employee_id === gestor.id)
      .sort((a, b) => new Date(b.created_at || b.date || 0) - new Date(a.created_at || a.date || 0))
      .slice(0, 15);
    if (!txs.length) {
      box.innerHTML = '<div class="text-muted text-center" style="padding:12px;">Nenhuma movimentação.</div>';
      return;
    }
    box.innerHTML = txs.map((t) => {
      const isCr = t.type === 'credit';
      const fmt = typeof formatCurrency === 'function' ? formatCurrency(t.amount, gestor) : t.amount;
      return `<div style="padding:8px 0;border-bottom:1px solid var(--color-border);">
        <div style="font-size:11px;color:var(--color-text-muted);">${esc(t.reason || '—')}</div>
        <div style="font-weight:800;color:${isCr ? 'var(--color-success)' : 'var(--color-danger)'};">${isCr ? '+' : '−'}${fmt}</div></div>`;
    }).join('');
  }

  async function openPartnerBalanceModal(partnerRootId) {
    if (!canManagePartners() || !partnerRootId) return;
    const p = await DB.getPartnerByUserId(partnerRootId).catch(() => null);
    const u = await DB.getUser(partnerRootId).catch(() => null);
    const title = document.getElementById('partnerBalanceModalTitle');
    const rootInp = document.getElementById('partnerBalanceRootId');
    if (rootInp) rootInp.value = partnerRootId;
    if (title) title.textContent = `Distribuir saldo — ${p?.razao_social || u?.name || 'Parceiro'}`;
    document.getElementById('partnerBalanceForm')?.reset();
    await Promise.all([
      populatePartnerBalanceSelect(partnerRootId),
      renderPartnerBalanceHistory(partnerRootId),
    ]);
    if (typeof openModal === 'function') openModal('partnerBalanceModal');
  }

  async function applyBalanceAdjustmentRh(empId, op, amt, reason, metaExtra) {
    const emp = await DB.getUser(empId);
    if (!emp) throw new Error('Usuário não encontrado.');
    const adminId = typeof Auth !== 'undefined' ? Auth.getSession()?.id : null;
    const meta = {
      kind: 'credito_manual',
      screen: metaExtra?.screen || 'distribuir_saldo_parceiro',
      valor_reais: amt,
      ...(metaExtra || {}),
    };
    if (op === 'add') {
      const nb = await DB.addBalance(empId, amt, reason, adminId, meta);
      if (nb == null) throw new Error('Não foi possível creditar o saldo.');
      return nb;
    }
    if (op === 'remove') {
      if (userPts(emp) < amt) throw new Error('Saldo insuficiente.');
      const nb = await DB.deductBalance(empId, amt, reason, adminId, meta);
      if (nb == null) throw new Error('Não foi possível debitar o saldo.');
      return nb;
    }
    if (op === 'set') {
      const nb = await DB.setBalance(empId, amt, reason, adminId, meta);
      if (nb == null) throw new Error('Não foi possível definir o saldo.');
      return nb;
    }
    throw new Error('Operação inválida.');
  }

  function _wirePartnerBalanceForm() {
    const form = document.getElementById('partnerBalanceForm');
    if (!form || form.dataset.wired === '1') return;
    form.dataset.wired = '1';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!canManagePartners()) return;
      const partnerRootId = document.getElementById('partnerBalanceRootId')?.value;
      const op = document.getElementById('partnerBalanceOperation')?.value;
      const amt = parseFloat(document.getElementById('partnerBalanceAmount')?.value || '0');
      const reason = document.getElementById('partnerBalanceReason')?.value?.trim();
      const gestor = partnerRootId ? await _partnerBalanceGestorRow(partnerRootId) : null;
      if (!partnerRootId || !gestor?.id || !reason || !amt) {
        showToast('Preencha todos os campos.', 'warning');
        return;
      }
      if (typeof applyBalanceAdjustment !== 'function' && typeof applyBalanceAdjustmentRh !== 'function') {
        showToast('Função de saldo indisponível.', 'error');
        return;
      }
      const adjust = typeof applyBalanceAdjustment === 'function' ? applyBalanceAdjustment : applyBalanceAdjustmentRh;
      showLoading('Distribuindo saldo...');
      try {
        const nb = await adjust(gestor.id, op, amt, reason, {
          screen: 'distribuir_saldo_parceiro',
          partner_root_id: partnerRootId,
        });
        document.getElementById('partnerBalanceReason').value = '';
        document.getElementById('partnerBalanceAmount').value = '';
        await Promise.all([
          populatePartnerBalanceSelect(partnerRootId),
          renderPartnerBalanceHistory(partnerRootId),
          renderRhPartnersPanel(),
        ]);
        showToast(`Saldo atualizado: ${typeof formatCurrency === 'function' ? formatCurrency(nb, gestor) : nb}`, 'success');
        if (typeof closeModal === 'function') closeModal('partnerBalanceModal');
      } catch (err) {
        showToast(err.message || 'Erro ao distribuir saldo.', 'error');
      } finally { hideLoading(); }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    _wirePartnerBalanceForm();
  });

  function _val(id) { return document.getElementById(id)?.value ?? ''; }
  function _set(id, v) { const el = document.getElementById(id); if (el) el.value = v ?? ''; }

  async function openPartnerModal(partnerId) {
    if (!canManagePartners()) {
      showToast('Sem permissão para parceiros.', 'warning');
      return;
    }
    const permsEl = document.getElementById('partnerPermsCheckboxes');
    if (permsEl && typeof PartnerPerms !== 'undefined' && !permsEl.dataset.filled) {
      permsEl.innerHTML = PartnerPerms.renderCheckboxesHtml();
      permsEl.dataset.filled = '1';
    }
    if (typeof PartnerPerms !== 'undefined') PartnerPerms.ensureTeamPermsUi('partnerTeamPermsCheckboxes');
    _set('partnerRecordId', '');
    _set('partnerUserId', '');
    _set('partnerCnpj', '');
    _set('partnerRazao', '');
    _set('partnerRepresentante', '');
    _set('partnerCpfRepresentante', '');
    _set('partnerEndereco', '');
    _set('partnerContato', '');
    _set('partnerEmail', '');
    _set('partnerSenha', 'Blu@2025');
    document.getElementById('partnerModalTitle').textContent = 'Cadastrar parceiro';
    if (partnerId) {
      const p = await DB.getPartner(partnerId).catch(() => null);
      if (!p) { alert('Parceiro não encontrado.'); return; }
      _set('partnerRecordId', p.id);
      _set('partnerUserId', p.user_id || '');
      _set('partnerCnpj', fmtCnpj(p.cnpj));
      _set('partnerRazao', p.razao_social || '');
      _set('partnerEndereco', p.endereco || '');
      _set('partnerContato', p.contato || '');
      _set('partnerEmail', p.email || '');
      if (typeof PartnerPerms !== 'undefined') PartnerPerms.fillForm('partnerPermsCheckboxes', p.permissions);
      document.getElementById('partnerModalTitle').textContent = 'Editar parceiro';
    } else if (typeof PartnerPerms !== 'undefined') {
      PartnerPerms.fillForm('partnerPermsCheckboxes', PartnerPerms.DEFAULT);
    }
    openModal('partnerModal');
  }

  async function savePartner() {
    if (!canManagePartners()) {
      showToast('Sem permissão.', 'warning');
      return;
    }
    const razao = _val('partnerRazao').trim();
    const email = _val('partnerEmail').trim().toLowerCase();
    const cnpj = _val('partnerCnpj').replace(/\D/g, '');
    if (!razao || !email) {
      alert('Preencha razão social e e-mail.');
      return;
    }
    const perms = typeof PartnerPerms !== 'undefined'
      ? PartnerPerms.readForm('partnerPermsCheckboxes')
      : {};
    const payload = {
      id: _val('partnerRecordId') || undefined,
      user_id: _val('partnerUserId') || undefined,
      cnpj,
      razao_social: razao,
      endereco: _val('partnerEndereco'),
      contato: _val('partnerContato'),
      email,
      active: true,
      permissions: perms,
      meta: {
        representante_legal: _val('partnerRepresentante'),
        cpf_representante: _val('partnerCpfRepresentante').replace(/\D/g, ''),
        status: document.getElementById('partnerStatus')?.value || 'analise',
        bank: {
          pix_key: _val('partnerPixKey'),
          pix_key_type: document.getElementById('partnerPixType')?.value || 'cnpj',
        },
      },
    };
    try {
      await DB.savePartner(payload);
      closeModal('partnerModal');
      await renderRhPartnersPanel();
      showToast('Parceiro salvo com sucesso!', 'success');
    } catch (e) {
      alert('Erro ao salvar parceiro: ' + (e.message || e));
    }
  }

  async function partnerBuscarCpfSocio() {
    const cpf = _val('partnerCpfRepresentante').replace(/\D/g, '');
    if (cpf.length !== 11) { alert('Informe um CPF válido.'); return; }
    if (typeof FonteData === 'undefined') { alert('API FonteData indisponível.'); return; }
    try {
      const res = await FonteData.lookupCpf(cpf);
      if (!res.ok) throw new Error(res.error || 'CPF não encontrado');
      if (res.client?.name) _set('partnerRepresentante', res.client.name);
      showToast('Dados do CPF carregados.', 'success');
    } catch (e) {
      alert(e.message || e);
    }
  }

  function partnerConsultaScore() { showToast('Consulta de score — use o painel Master para histórico completo.', 'info'); }
  function partnerConsultaCertidaoTj() { showToast('Consulta TJ — use o painel Master para histórico completo.', 'info'); }

  async function _partnerUploadDoc(input, key) {
    const file = input?.files?.[0];
    if (!file) return;
    const label = document.getElementById(`partnerDocLabel_${key}`);
    try {
      let url = '';
      if (typeof uploadImage === 'function') {
        url = await uploadImage(file, 'partner-docs', key);
      } else if (typeof fileToBase64 === 'function') {
        url = await fileToBase64(file);
      }
      const hidden = document.getElementById(`partnerDoc_${key}`);
      if (hidden) hidden.value = url;
      if (label) label.innerHTML = `<span style="color:var(--color-success);">${esc(file.name)}</span>`;
    } catch (e) {
      alert('Falha no upload: ' + (e.message || e));
    }
  }

  window.renderRhPartnersPanel = renderRhPartnersPanel;
  window.renderPartnersPanel = renderRhPartnersPanel;
  window.openPartnerModal = openPartnerModal;
  window.savePartner = savePartner;
  window.partnerActivate = partnerActivate;
  window.partnerToggleActive = partnerToggleActive;
  window.openPartnerTeamManage = openPartnerTeamManage;
  window.openPartnerBalanceModal = openPartnerBalanceModal;
  window.canManagePartners = canManagePartners;
  window.partnerBuscarCpfSocio = partnerBuscarCpfSocio;
  window.partnerConsultaScore = partnerConsultaScore;
  window.partnerConsultaCertidaoTj = partnerConsultaCertidaoTj;
  window._partnerUploadDoc = _partnerUploadDoc;
})();
