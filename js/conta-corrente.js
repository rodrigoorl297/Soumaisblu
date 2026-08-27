/* SOU + BLU — Conta corrente (extrato estilo banco + gestão financeira) */
(function () {
  let hideBalance = localStorage.getItem('cc_hide_balance') === 'true';

  function _isSouBluAdminPanel() {
    return !window.SOUBLU_FINANCEIRO_PAGE
      && !document.getElementById('finSidebarNav')
      && !!(document.getElementById('navManageProposals') || document.getElementById('secManageProposals'));
  }

  function _isSouBluFinanceiroPage() {
    return !!window.SOUBLU_FINANCEIRO_PAGE || !!document.getElementById('finSidebarNav');
  }

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function fmtDt(iso) {
    if (!iso) return '—';
    if (typeof formatDateTime === 'function') return formatDateTime(iso);
    try {
      return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    } catch { return '—'; }
  }

  function groupLinesByDate(lines) {
    const groups = {};
    for (const ln of lines) {
      const dt = new Date(ln.created_at || ln.date);
      let dateKey = '';
      if (!isNaN(dt)) {
        dateKey = dt.toISOString().split('T')[0];
      } else {
        dateKey = 'outro';
      }
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(ln);
    }
    return groups;
  }

  function formatGroupDate(dateStr) {
    if (dateStr === 'outro') return 'Outros';
    try {
      const nowStr = new Date().toISOString().split('T')[0];
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (dateStr === nowStr) return 'Hoje';
      if (dateStr === yesterdayStr) return 'Ontem';

      const [y, m, d] = dateStr.split('-');
      const dt = new Date(Number(y), Number(m) - 1, Number(d));
      return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  window.toggleCcBalanceVisibility = function () {
    hideBalance = !hideBalance;
    localStorage.setItem('cc_hide_balance', hideBalance ? 'true' : 'false');
    const eyeBtn = document.getElementById('ccEyeBtn');
    const balEl = document.getElementById('ccBalanceVal');
    if (eyeBtn && balEl) {
      if (hideBalance) {
        balEl.textContent = '••••••';
        eyeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
      } else {
        balEl.textContent = balEl.dataset.realBal;
        eyeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
      }
    }
  };

  function hasPerm(key) {
    if (typeof window.partnerOrgCan === 'function') return window.partnerOrgCan(key);
    return typeof PartnerPerms !== 'undefined' && PartnerPerms.can(window._PARTNER_PERMS, key);
  }

  function canViewStatement() {
    const s = Auth.getSession();
    if (!s) return false;
    return ['master', 'fundador', 'gerente', 'gerencia', 'backoffice', 'operacional',
      'sup_backoffice', 'supervisor', 'vendedor', 'employee', 'rh', 'financeiro', 'financial',
      'parceiro'].includes(s.role);
  }

  function isUserActive(u) {
    const a = u?.active;
    if (a === false || a === 0 || a === '0' || a === 'false' || a === 'inativo') return false;
    return true;
  }

  function isCcMoneyActive(u) {
    if (typeof DB !== 'undefined' && typeof DB.isCcMoneyActive === 'function') {
      return DB.isCcMoneyActive(u);
    }
    const v = u?.cc_money_active;
    if (v === false || v === 0 || v === '0' || v === 'false') return false;
    return true;
  }

  function canManageMovements() {
    const s = Auth.getSession();
    if (!s) return false;
    if (!window.PARTNER_ROOT_ID) {
      return ['master', 'fundador', 'gerente', 'financeiro', 'financial', 'rh'].includes(s.role);
    }
    return hasPerm('conta_credito_proposta')
      || hasPerm('conta_debito_proposta');
  }

  function canMovementKind(kind) {
    if (!canManageMovements()) return false;
    if (!window.PARTNER_ROOT_ID) {
      return kind === 'credito_proposta' || kind === 'debito_proposta';
    }
    if (kind === 'credito_proposta') return hasPerm('conta_credito_proposta');
    if (kind === 'debito_proposta') return hasPerm('conta_debito_proposta');
    return false;
  }

  function fmtBal(n, money, user) {
    if (typeof formatMoney === 'function') return formatMoney(n);
    return 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function isAdiantamentoLine(ln) {
    return ln?.meta?.adiantamento === true
      || String(ln?.meta?.kind || '').includes('adiantamento');
  }

  function adiantamentoDetail(ln) {
    const meta = ln?.meta || {};
    const parts = [];
    const parcelas = meta.parcelas || meta.forma_pagamento || '';
    if (parcelas) parts.push(`Parcela ${parcelas}`);
    const dataDeb = meta.data_debito || '';
    if (dataDeb && /^\d{4}-\d{2}-\d{2}/.test(dataDeb)) {
      const [y, m, d] = dataDeb.split('-');
      parts.push(`Desconto a partir de ${d}/${m}/${y}`);
    } else if (dataDeb) {
      parts.push(`Desconto a partir de ${dataDeb}`);
    }
    const reason = String(ln?.reason || '');
    if (!parcelas) {
      const mp = reason.match(/Adiantamento[^()]*\((\d+X)\)/i) || reason.match(/Adiantamento\s+(\d+X)/i);
      if (mp) parts.unshift(`Parcela ${mp[1]}`);
    }
    if (!dataDeb) {
      const md = reason.match(/desconto a partir de\s+(\d{2}\/\d{2}\/\d{4})/i)
        || reason.match(/D[ée]bito em\s+(\d{2}\/\d{2}\/\d{4})/i);
      if (md) parts.push(`Desconto a partir de ${md[1]}`);
    }
    return parts.join(' · ');
  }

  function paymentSummary(user) {
    if (typeof WithdrawalRules === 'undefined') return '';
    const pay = WithdrawalRules.getSavedPayment(user);
    const pix = pay.pix || {};
    if (pix.pix_key) {
      return `<div class="cc-payment-chip"><strong>PIX salvo:</strong> ${esc((pix.pix_key_type || 'pix').toUpperCase())} — ${esc(pix.pix_key)}${pix.holder_name ? ` (${esc(pix.holder_name)})` : ''}</div>`;
    }
    return '<div class="cc-payment-chip text-muted">Nenhuma chave PIX salva. Configure em Meu Perfil ao solicitar um saque.</div>';
  }

  const ContaCorrente = {
    viewUserId: null,
    gestaoUserId: null,
    selectMode: false,
    selectedIds: new Set(),
    gestaoStmt: null,

    ensureUi() {
      const main = document.querySelector('.page-content');
      if (!main) return;

      this.ensureStyles();
      this.ensureModals();

      /* Conta corrente / gestão: só na área do colaborador; no admin e no Financeiro o menu é próprio. */
      if (_isSouBluAdminPanel() || _isSouBluFinanceiroPage()) return;

      const nav = document.querySelector('.sidebar-nav');
      if (!nav) return;

      if (!document.getElementById('navContaCorrente') && canViewStatement()) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-item conta-corrente-nav';
        btn.id = 'navContaCorrente';
        btn.dataset.section = 'secContaCorrente';
        btn.innerHTML = `${navIconHtml('bank')}<span class="nav-label">Conta corrente</span>`;
        btn.addEventListener('click', async () => {
          if (typeof navigateTo === 'function') navigateTo('secContaCorrente');
          await ContaCorrente.render();
        });
        const anchor = document.getElementById('navMyProfile') || document.querySelector('[data-section="secMyProfile"]');
        if (anchor?.parentNode) anchor.parentNode.insertBefore(btn, anchor);
        else nav.appendChild(btn);
      }

      if (!document.getElementById('secContaCorrente')) {
        const sec = document.createElement('section');
        sec.className = 'section';
        sec.id = 'secContaCorrente';
        sec.innerHTML = '<div id="contaCorrenteRoot"></div>';
        main.appendChild(sec);
      }
    },

    ensureStyles() {
      if (document.getElementById('contaCorrenteStyles')) return;
      const st = document.createElement('style');
      st.id = 'contaCorrenteStyles';
      st.textContent = `
.cc-wrap { display: grid; gap: 16px; }
.cc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 768px) { .cc-grid { grid-template-columns: 1fr; } }
.cc-card { background: linear-gradient(135deg, #0d1e3d 0%, #173d6d 55%, #082d49 100%); border-radius: 20px; padding: 22px; color: #fff; position: relative; overflow: hidden; box-shadow: 0 10px 30px rgba(13,30,61,0.25); display: flex; flex-direction: column; justify-content: space-between; height: 195px; border: 1px solid rgba(255,255,255,0.08); }
.cc-card::before { content: ""; position: absolute; top: -50%; right: -30%; width: 250px; height: 250px; background: radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 70%); border-radius: 50%; pointer-events: none; }
.cc-card__top { display: flex; justify-content: space-between; align-items: flex-start; }
.cc-card__brand { font-weight: 800; font-size: 15px; letter-spacing: 1.5px; text-shadow: 0 2px 4px rgba(0,0,0,0.2); color: #fff; }
.cc-card__chip { width: 36px; height: 26px; background: linear-gradient(135deg, #ece9e6 0%, #a7a6a4 100%); border-radius: 5px; position: relative; box-shadow: inset 0 1px 1px rgba(255,255,255,0.8), 0 2px 4px rgba(0,0,0,0.2); overflow: hidden; border: 1px solid rgba(0,0,0,0.1); }
.cc-card__chip::after { content: ""; position: absolute; width: 100%; height: 100%; border: 1px solid rgba(0,0,0,0.15); top: 0; left: 0; box-sizing: border-box; background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.04) 3px, rgba(0,0,0,0.04) 4px), repeating-linear-gradient(90deg, transparent, transparent 5px, rgba(0,0,0,0.04) 5px, rgba(0,0,0,0.04) 6px); }
.cc-card__middle { margin-top: 10px; }
.cc-card__balance-row { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
.cc-card__balance { font-size: 32px; font-weight: 800; font-family: var(--font-display, sans-serif); letter-spacing: -0.5px; line-height: 1; text-shadow: 0 2px 4px rgba(0,0,0,0.15); }
.cc-card__eye { background: none; border: none; color: rgba(255,255,255,0.65); cursor: pointer; padding: 6px; display: flex; align-items: center; justify-content: center; transition: color 0.2s, transform 0.1s; border-radius: 50%; }
.cc-card__eye:hover { color: #fff; background: rgba(255,255,255,0.08); transform: scale(1.08); }
.cc-card__eye svg { width: 20px; height: 20px; stroke: currentColor; fill: none; stroke-width: 2; }
.cc-card__label { font-size: 11px; opacity: 0.75; letter-spacing: 0.5px; text-transform: uppercase; margin: 0; font-weight: 600; }
.cc-card__bottom { display: flex; justify-content: space-between; align-items: flex-end; margin-top: auto; }
.cc-card__holder { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.9); }
.cc-card__number { font-family: 'Courier New', monospace; font-size: 12px; color: rgba(255,255,255,0.5); letter-spacing: 1px; }
.cc-card.negative .cc-card__balance { color: #ffb4b4; }
.cc-card__top-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; max-width: 70%; }
.cc-card__name { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #fff; text-align: right; line-height: 1.25; }
.cc-card__active-btn { border: 1px solid rgba(255,255,255,0.45); background: rgba(255,255,255,0.12); color: #fff; font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 999px; cursor: pointer; white-space: nowrap; }
.cc-card__active-btn:hover { background: rgba(255,255,255,0.22); }
.cc-card__active-btn.is-inactive { border-color: rgba(74,222,128,0.7); background: rgba(22,163,74,0.35); }
.cc-card__badge-off { display: inline-block; margin-left: 6px; font-size: 10px; font-weight: 800; letter-spacing: 0.04em; padding: 2px 6px; border-radius: 6px; background: rgba(239,68,68,0.35); color: #fecaca; vertical-align: middle; }
option.cc-opt-inactive { color: #b45309; }

.cc-kpi-container { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.cc-kpi-card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 16px; padding: 16px; display: flex; align-items: center; gap: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.02); transition: transform 0.2s; }
.cc-kpi-card:hover { transform: translateY(-2px); }
.cc-kpi-card__icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; font-weight: bold; }
.cc-kpi-card__icon.in { background: rgba(34,197,94,0.12); color: var(--color-success, #16a34a); }
.cc-kpi-card__icon.out { background: rgba(239,68,68,0.1); color: var(--color-danger, #dc2626); }
.cc-kpi-card__body { display: flex; flex-direction: column; }
.cc-kpi-card__label { font-size: 11px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin: 0; font-weight: 600; }
.cc-kpi-card__val { font-size: 16px; font-weight: 700; color: var(--color-text); margin-top: 2px; font-family: var(--font-display, sans-serif); }

.cc-filters { display: flex; gap: 8px; margin: 16px 0 8px; overflow-x: auto; padding-bottom: 4px; }
.cc-filter-btn { background: var(--color-surface-2); border: 1px solid var(--color-border); padding: 7px 14px; border-radius: 99px; font-size: 12px; font-weight: 700; cursor: pointer; color: var(--color-text-muted); transition: all 0.2s; white-space: nowrap; }
.cc-filter-btn:hover { background: var(--color-surface-hover); color: var(--color-text); }
.cc-filter-btn.active { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }

.cc-extrato { border: 1px solid var(--color-border); border-radius: 16px; overflow: hidden; background: var(--color-surface); box-shadow: 0 4px 16px rgba(0,0,0,0.02); }
.cc-extrato__head { padding: 14px 18px; background: var(--color-surface-2); font-weight: 700; font-size: 14px; border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.cc-extrato__title { font-weight: 700; }
.cc-extrato__count { font-size: 12px; color: var(--color-text-muted); font-weight: 500; }
.cc-extrato__head-right { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.cc-extrato__trash { background: none; border: 1px solid transparent; color: var(--color-text-muted); cursor: pointer; padding: 6px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; transition: color 0.15s, background 0.15s, border-color 0.15s; }
.cc-extrato__trash:hover { color: var(--color-danger, #dc2626); background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.2); }
.cc-extrato__trash svg { width: 16px; height: 16px; }
.cc-extrato__sel-actions { display: none; align-items: center; gap: 8px; flex-wrap: wrap; }
.cc-extrato.select-mode .cc-extrato__sel-actions { display: flex; }
.cc-extrato.select-mode .cc-extrato__trash { display: none; }
.cc-line__check { display: none; flex-shrink: 0; }
.cc-extrato.select-mode .cc-line__check { display: flex; align-items: center; }
.cc-extrato.select-mode .cc-line--selectable { cursor: pointer; }
.cc-extrato.select-mode .cc-line--selectable.selected { background: rgba(37,99,235,0.06); }
.cc-extrato.select-mode .cc-line--locked { opacity: 0.55; }
.cc-line__check input { width: 16px; height: 16px; accent-color: var(--color-primary, #2563eb); cursor: pointer; }

.cc-date-group { background: var(--color-surface-2); padding: 8px 18px; font-size: 11px; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--color-border); display: flex; align-items: center; }
.cc-line { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-bottom: 1px solid var(--color-border); transition: background 0.15s; }
.cc-line:hover { background: var(--color-surface-hover); }
.cc-line:last-child { border-bottom: none; }
.cc-line__icon { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
.cc-line__icon.in { background: rgba(34,197,94,0.12); color: var(--color-success, #16a34a); }
.cc-line__icon.out { background: rgba(239,68,68,0.08); color: var(--color-danger, #dc2626); }
.cc-line__body { flex: 1; min-width: 0; }
.cc-line__title { font-weight: 600; font-size: 14px; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-line__meta { font-size: 12px; color: var(--color-text-muted); margin-top: 1px; display: flex; align-items: center; gap: 6px; }
.cc-line__dot { width: 3px; height: 3px; background: var(--color-border); border-radius: 50%; }
.cc-line__amt { font-weight: 700; font-size: 14px; white-space: nowrap; }
.cc-line__amt.in { color: var(--color-success, #16a34a); }
.cc-line__amt.out { color: var(--color-danger, #dc2626); }
.cc-payment-chip { font-size: 13px; padding: 10px 14px; background: var(--color-surface-2); border-radius: 10px; margin-top: 8px; }
`;
      document.head.appendChild(st);
    },

    applyNavVisibility(cfg) {
      const show = cfg?.canContaCorrente !== false && canViewStatement()
        && !_isSouBluAdminPanel() && !_isSouBluFinanceiroPage();
      document.querySelectorAll('.conta-corrente-nav').forEach(el => {
        el.style.display = show ? '' : 'none';
      });
      document.querySelectorAll('.conta-corrente-gestao-nav').forEach(el => {
        el.style.display = 'none';
      });
    },

    ensureModals() {
      if (!document.getElementById('contaCorrenteMovModal')) {
        const wrap = document.createElement('div');
        wrap.innerHTML = `
<div class="modal-overlay" id="contaCorrenteMovModal">
  <div class="modal" style="max-width:480px;">
    <div class="modal-header"><h3 id="contaCorrenteMovTitle">Movimentação</h3>
      <button type="button" class="modal-close" onclick="closeModal('contaCorrenteMovModal')"></button></div>
    <div class="modal-body">
      <input type="hidden" id="ccMovKind"/>
      <input type="hidden" id="ccMovEmpId"/>
      <div class="form-group" id="ccMovAmountGroup"><label>Valor *</label>
        <input type="number" id="ccMovAmount" class="form-control" min="0.01" step="any"/></div>
      <div class="form-group" id="ccMovMotivoGroup" style="display:none;"><label>Motivo *</label>
        <input type="text" id="ccMovMotivo" class="form-control" placeholder="Ex: Termo confissão de dívida"/></div>
      <div class="form-group" id="ccMovFormaPagamentoGroup" style="display:none;"><label>Parcelas *</label>
        <select id="ccMovFormaPagamento" class="form-control">
          <option value="1X">1X</option>
          <option value="2X">2X</option>
          <option value="3X">3X</option>
          <option value="4X">4X</option>
        </select></div>
      <div class="form-group" id="ccMovDataDebitoGroup" style="display:none;"><label>Data do 1º desconto *</label>
        <input type="date" id="ccMovDataDebito" class="form-control"/></div>
      <div class="form-group" id="ccMovReasonGroup"><label>Motivo *</label>
        <input type="text" id="ccMovReason" class="form-control" placeholder="Ex: Crédito proposta #12345"/></div>
      <div class="form-group" id="ccMovProposalGroup"><label>Ref. proposta (opcional)</label>
        <input type="text" id="ccMovProposal" class="form-control"/></div>
      <p id="ccMovHint" style="font-size:12px;color:var(--color-text-muted);margin:0;"></p>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal('contaCorrenteMovModal')">Cancelar</button>
      <button type="button" class="btn btn-primary" onclick="ContaCorrente.submitMovement()">Confirmar</button>
    </div>
  </div>
</div>`;
        document.body.appendChild(wrap);
      }
      if (!document.getElementById('contaCorrenteDelModal')) {
        const del = document.createElement('div');
        del.innerHTML = `
<div class="modal-overlay" id="contaCorrenteDelModal">
  <div class="modal" style="max-width:400px;">
    <div class="modal-header"><h3>Excluir histórico</h3>
      <button type="button" class="modal-close" onclick="closeModal('contaCorrenteDelModal')"></button></div>
    <div class="modal-body">
      <p id="ccDelConfirmMsg" style="font-size:14px;color:var(--color-text-muted);line-height:1.5;margin:0;"></p>
    </div>
    <div class="modal-footer" style="gap:10px;">
      <button type="button" class="btn btn-ghost" onclick="closeModal('contaCorrenteDelModal')">Cancelar</button>
      <button type="button" class="btn btn-danger" id="ccDelConfirmBtn">Excluir</button>
    </div>
  </div>
</div>`;
        document.body.appendChild(del.firstElementChild);
      }
      if (!document.getElementById('ccAccountBlockModal')) {
        const blk = document.createElement('div');
        blk.innerHTML = `
<div class="modal-overlay" id="ccAccountBlockModal">
  <div class="modal" style="max-width:440px;">
    <div class="modal-header"><h3>Bloquear conta</h3>
      <button type="button" class="modal-close" onclick="closeModal('ccAccountBlockModal')"></button></div>
    <div class="modal-body">
      <input type="hidden" id="ccBlockEmpId"/>
      <p style="font-size:13px;color:var(--color-text-muted);margin:0 0 12px;">A pessoa não poderá cadastrar novas propostas enquanto a conta estiver bloqueada.</p>
      <div class="form-group"><label>Motivo do bloqueio *</label>
        <select id="ccBlockCode" class="form-control"></select></div>
    </div>
    <div class="modal-footer" style="gap:10px;">
      <button type="button" class="btn btn-ghost" onclick="closeModal('ccAccountBlockModal')">Cancelar</button>
      <button type="button" class="btn btn-danger" onclick="ContaCorrente.submitAccountBlock()">Confirmar bloqueio</button>
    </div>
  </div>
</div>`;
        document.body.appendChild(blk.firstElementChild);
      }
      if (document.getElementById('ccAccountUnblockModal') && !document.getElementById('ccUnblockMovementId')) {
        document.getElementById('ccAccountUnblockModal').remove();
      }
      if (!document.getElementById('ccAccountUnblockModal')) {
        const unb = document.createElement('div');
        unb.innerHTML = `
<div class="modal-overlay" id="ccAccountUnblockModal">
  <div class="modal" style="max-width:440px;">
    <div class="modal-header"><h3>Desbloquear movimentação</h3>
      <button type="button" class="modal-close" onclick="closeModal('ccAccountUnblockModal')"></button></div>
    <div class="modal-body">
      <input type="hidden" id="ccUnblockEmpId"/>
      <input type="hidden" id="ccUnblockMovementId"/>
      <p id="ccUnblockHint" style="font-size:13px;color:var(--color-text-muted);margin:0 0 12px;"></p>
      <p id="ccUnblockMovSummary" style="font-size:13px;margin:0 0 12px;padding:10px 12px;background:var(--color-surface-2);border-radius:8px;line-height:1.45;"></p>
      <div class="form-group"><label>Motivo do desbloqueio *</label>
        <select id="ccUnblockCode" class="form-control"></select></div>
      <p style="font-size:11px;color:var(--color-text-muted);margin:8px 0 0;">Ao confirmar, a conta é liberada para cadastrar propostas. Se o bloqueio for 001 (treinamentos) e ainda houver pendência, o bloqueio pode voltar no próximo login.</p>
    </div>
    <div class="modal-footer" style="gap:10px;">
      <button type="button" class="btn btn-ghost" onclick="closeModal('ccAccountUnblockModal')">Cancelar</button>
      <button type="button" class="btn btn-primary" onclick="ContaCorrente.submitMovementUnblock()">Confirmar desbloqueio</button>
    </div>
  </div>
</div>`;
        document.body.appendChild(unb.firstElementChild);
      }
      if (!document.getElementById('ccFuturosModal')) {
        const fut = document.createElement('div');
        fut.innerHTML = `
<div class="modal-overlay" id="ccFuturosModal">
  <div class="modal" style="max-width:420px;">
    <div class="modal-header"><h3>Lançamento futuro</h3>
      <button type="button" class="modal-close" onclick="closeModal('ccFuturosModal')"></button></div>
    <div class="modal-body">
      <input type="hidden" id="ccFutEmpId"/>
      <div class="form-group"><label>Data *</label>
        <input type="date" id="ccFutDate" class="form-control"/></div>
      <div class="form-group"><label>Conceito *</label>
        <select id="ccFutKind" class="form-control" onchange="ContaCorrente._onFutKindChange()">
          <option value="credit">Créditos a receber</option>
          <option value="debit">Débitos a efetuar</option>
        </select></div>
      <div class="form-group"><label>Valor (R$) *</label>
        <input type="number" id="ccFutAmount" class="form-control" min="0.01" step="0.01" placeholder="0,00"/></div>
      <div class="form-group"><label>Observação</label>
        <input type="text" id="ccFutLabel" class="form-control" placeholder="Opcional"/></div>
    </div>
    <div class="modal-footer" style="gap:10px;">
      <button type="button" class="btn btn-ghost" onclick="closeModal('ccFuturosModal')">Cancelar</button>
      <button type="button" class="btn btn-primary" onclick="ContaCorrente.submitFuturo()">Salvar</button>
    </div>
  </div>
</div>`;
        document.body.appendChild(fut.firstElementChild);
      }
    },

    async render(empId) {
      this.ensureUi();
      const root = document.getElementById('contaCorrenteRoot');
      if (!root || !canViewStatement()) return;

      const user = await Auth.getCurrentUser();
      if (!user) return;
      const targetId = empId || this.viewUserId || user.id;
      this.viewUserId = targetId;

      const stmt = await DB.buildContaCorrenteStatement(targetId);
      this.lastStmt = stmt;
      const u = stmt.user || user;
      const money = stmt.money;
      const neg = Number(stmt.balance) < 0;
      const balFmt = fmtBal(stmt.balance, money, u);

      const totalIn = stmt.lines
        .filter(ln => ln.type === 'credit' || isAdiantamentoLine(ln))
        .reduce((sum, ln) => sum + Number(ln.amount || 0), 0);
      const totalOut = stmt.lines
        .filter(ln => ln.type === 'debit' && ln.kind !== 'withdrawal' && !isAdiantamentoLine(ln))
        .reduce((sum, ln) => sum + Number(ln.amount || 0), 0);

      const totalInFmt = 'R$ ' + totalIn.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const totalOutFmt = 'R$ ' + totalOut.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      const eyeSvg = hideBalance
        ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
      const balDisp = hideBalance ? '••••••' : balFmt;

      const ccNumber = '•••• •••• •••• ' + String(u.id || '0000').slice(-4);

      root.innerHTML = `
        <div class="section-header">
          <div><h2>Conta corrente</h2>
            <p class="text-muted">Extrato e gestão financeira da sua conta digital.</p></div>
        </div>
        
        <div class="cc-wrap">
          <div class="cc-grid">
            <!-- Cartão Bancário Premium -->
            <div class="cc-card ${neg ? 'negative' : ''}">
              <div class="cc-card__top">
                <span class="cc-card__brand">SOU+BLU</span>
                <div class="cc-card__chip"></div>
              </div>
              <div class="cc-card__middle">
                <p class="cc-card__label">Saldo disponível (R$)${neg ? ' · Negativo' : ''}</p>
                <div class="cc-card__balance-row">
                  <div class="cc-card__balance" id="ccBalanceVal" data-real-bal="${esc(balFmt)}">${balDisp}</div>
                  <button type="button" class="cc-card__eye" id="ccEyeBtn" onclick="toggleCcBalanceVisibility()" title="Mostrar/Ocultar Saldo">
                    ${eyeSvg}
                  </button>
                </div>
              </div>
              <div class="cc-card__bottom">
                <span class="cc-card__holder">${esc(u.name)}</span>
                <span class="cc-card__number">${ccNumber}</span>
              </div>
            </div>

            <!-- KPIs de Resumo Financeiro -->
            <div class="cc-kpi-container">
              <div class="cc-kpi-card">
                <div class="cc-kpi-card__icon in">↓</div>
                <div class="cc-kpi-card__body">
                  <p class="cc-kpi-card__label">Entradas (Período)</p>
                  <span class="cc-kpi-card__val text-success">${totalInFmt}</span>
                </div>
              </div>
              <div class="cc-kpi-card">
                <div class="cc-kpi-card__icon out">↑</div>
                <div class="cc-kpi-card__body">
                  <p class="cc-kpi-card__label">Saídas (Período)</p>
                  <span class="cc-kpi-card__val text-danger">${totalOutFmt}</span>
                </div>
              </div>
            </div>
          </div>

          ${paymentSummary(u)}

          <!-- Filtros Rápidos do Extrato -->
          <div class="cc-filters">
            <button type="button" class="cc-filter-btn active" data-filter="all" onclick="ContaCorrente.filterLines('all')">Tudo</button>
            <button type="button" class="cc-filter-btn" data-filter="in" onclick="ContaCorrente.filterLines('in')">Entradas</button>
            <button type="button" class="cc-filter-btn" data-filter="out" onclick="ContaCorrente.filterLines('out')">Saídas</button>
            <button type="button" class="cc-filter-btn" data-filter="pix" onclick="ContaCorrente.filterLines('pix')">Saques PIX</button>
          </div>

          <!-- Extrato -->
          <div class="cc-extrato">
            <div class="cc-extrato__head">
              <span class="cc-extrato__title">Lançamentos</span>
              <span class="cc-extrato__count" id="ccExtratoCount">${stmt.lines.length} lançamento${stmt.lines.length === 1 ? '' : 's'}</span>
            </div>
            <div id="ccExtratoBody">
              ${this._renderLinesGrouped(stmt.lines, u, money)}
            </div>
          </div>
        </div>`;
    },

    filterLines(filterType) {
      if (!this.lastStmt) return;
      document.querySelectorAll('.cc-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filterType);
      });
      let filtered = this.lastStmt.lines || [];
      if (filterType === 'in') {
        filtered = filtered.filter(ln => ln.type === 'credit' || isAdiantamentoLine(ln));
      } else if (filterType === 'out') {
        filtered = filtered.filter(ln => ln.type === 'debit' && ln.kind !== 'withdrawal' && !isAdiantamentoLine(ln));
      } else if (filterType === 'pix') {
        filtered = filtered.filter(ln => ln.kind === 'withdrawal');
      }
      
      const countEl = document.getElementById('ccExtratoCount');
      if (countEl) {
        countEl.textContent = `${filtered.length} lançamento${filtered.length === 1 ? '' : 's'}`;
      }

      const bodyEl = document.getElementById('ccExtratoBody');
      if (bodyEl) {
        bodyEl.innerHTML = this._renderLinesGrouped(filtered, this.lastStmt.user, this.lastStmt.money);
      }
    },

    _renderLines(lines, user, money) {
      return this._renderLinesGrouped(lines, user, money);
    },

    _trashSvg() {
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
    },

    _renderLinesGrouped(lines, user, money, opts = {}) {
      if (!lines.length) {
        return '<div class="text-muted text-center" style="padding:24px;">Nenhuma movimentação no período.</div>';
      }
      const groups = groupLinesByDate(lines);
      const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
      const selectMode = !!this.selectMode;
      const allowUnlock = !!(opts.allowMovementUnlock && canManageMovements());

      return sortedDates.map(dateKey => {
        const dateHeader = `<div class="cc-date-group">${formatGroupDate(dateKey)}</div>`;
        const itemsHtml = groups[dateKey].map(ln => {
          const isAdv = isAdiantamentoLine(ln);
          const isCr = isAdv ? true : ln.type === 'credit';
          const icon = isCr ? '↓' : '↑';
          const cls = isCr ? 'in' : 'out';
          const sign = isCr ? '+' : '−';
          const amt = fmtBal(ln.amount, money, user);
          const kind = ln.meta?.kind ? String(ln.meta.kind).replace('conta_', '').replace(/_/g, ' ') : '';
          const openDeb = !!(ln.meta?.open_debit && ln.meta?.status !== 'settled');
          const advDetail = isAdv ? adiantamentoDetail(ln) : '';
          const unlockedBefore = !!(ln.meta?.account_unblock);
          const extraParts = [advDetail, kind, openDeb ? 'em aberto' : '', ln.status, unlockedBefore ? 'liberou bloqueio' : ''].filter(Boolean);
          const extra = extraParts.join(' · ');
          const canSelect = ln.kind === 'transaction' && !!ln.id;
          const id = String(ln.id || '');
          const checked = canSelect && this.selectedIds.has(id);
          const lineCls = [
            'cc-line',
            canSelect ? 'cc-line--selectable' : 'cc-line--locked',
            checked ? 'selected' : '',
            openDeb ? 'cc-line--open-debit' : '',
          ].filter(Boolean).join(' ');
          const checkHtml = selectMode
            ? `<label class="cc-line__check" onclick="event.stopPropagation()">
                <input type="checkbox" ${canSelect ? '' : 'disabled '}
                  ${checked ? 'checked ' : ''}
                  ${canSelect ? `onchange="ContaCorrente.toggleSelect('${esc(id)}', this.checked)"` : ''}/>
              </label>`
            : '';
          const click = canSelect && selectMode
            ? ` onclick="ContaCorrente.toggleSelect('${esc(id)}')"`
            : '';
          const unlockBtn = (allowUnlock && isCr && canSelect && !selectMode)
            ? `<button type="button" class="btn btn-outline btn-sm" style="margin-left:8px;white-space:nowrap;border-color:#15803d;color:#15803d;font-size:11px;padding:4px 8px;"
                onclick="event.stopPropagation();ContaCorrente.openMovementUnblockModal('${esc(opts.empId || '')}','${esc(id)}')">Desbloquear movimentação</button>`
            : '';
          return `<div class="${lineCls}" data-tx-id="${esc(id)}"${click}${openDeb ? ' style="background:rgba(220,38,38,.06);"' : ''}>
            ${checkHtml}
            <div class="cc-line__icon ${cls}">${icon}</div>
            <div class="cc-line__body">
              <div class="cc-line__title">${esc(ln.reason)}${openDeb ? ' <span style="color:#b91c1c;font-size:11px;font-weight:700;">(em aberto)</span>' : ''}</div>
              <div class="cc-line__meta">${fmtDt(ln.created_at)}${extra ? ' <span class="cc-line__dot"></span> ' + esc(extra) : ''}</div>
            </div>
            <div class="cc-line__amt ${cls}" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:flex-end;">${sign}${amt}${unlockBtn}</div>
          </div>`;
        }).join('');
        return dateHeader + itemsHtml;
      }).join('');
    },

    exitSelectMode() {
      this.selectMode = false;
      this.selectedIds = new Set();
      this._refreshGestaoExtratoUi();
    },

    enterSelectMode() {
      if (!canManageMovements()) return;
      this.selectMode = true;
      this.selectedIds = new Set();
      this._refreshGestaoExtratoUi();
    },

    toggleSelect(id, forceChecked) {
      if (!this.selectMode || !id) return;
      const key = String(id);
      const on = forceChecked == null ? !this.selectedIds.has(key) : !!forceChecked;
      if (on) this.selectedIds.add(key);
      else this.selectedIds.delete(key);
      this._refreshGestaoExtratoUi();
    },

    _refreshGestaoExtratoUi() {
      const box = document.getElementById('ccGestaoExtrato');
      if (!box || !this.gestaoStmt) return;
      const stmt = this.gestaoStmt;
      const lines = stmt.lines || [];
      box.classList.toggle('select-mode', !!this.selectMode);
      const countEl = document.getElementById('ccGestaoExtratoCount');
      if (countEl) {
        const n = this.selectMode ? this.selectedIds.size : lines.length;
        countEl.textContent = this.selectMode
          ? `${n} selecionado${n === 1 ? '' : 's'}`
          : `${lines.length} lançamento${lines.length === 1 ? '' : 's'}`;
      }
      const delBtn = document.getElementById('ccGestaoDelBtn');
      if (delBtn) delBtn.disabled = !this.selectedIds.size;
      const body = document.getElementById('ccGestaoExtratoBody');
      const empId = this.gestaoUserId || stmt.user?.id || '';
      const allowUnlock = !!(this._gestaoAccountBlocked && canManageMovements());
      if (body) {
        body.innerHTML = this._renderLinesGrouped(lines, stmt.user, stmt.money, {
          allowMovementUnlock: allowUnlock,
          empId,
        });
      }
    },

    requestDeleteSelected() {
      if (!canManageMovements()) {
        showToast('Sem permissão para excluir histórico.', 'warning');
        return;
      }
      const n = this.selectedIds.size;
      if (!n) {
        showToast('Selecione ao menos um lançamento.', 'warning');
        return;
      }
      this.ensureModals();
      const msg = document.getElementById('ccDelConfirmMsg');
      if (msg) {
        msg.textContent = `Excluir ${n} lançamento${n === 1 ? '' : 's'} do histórico? O saldo será ajustado e essa ação não pode ser desfeita.`;
      }
      const btn = document.getElementById('ccDelConfirmBtn');
      if (btn) {
        btn.onclick = () => ContaCorrente.confirmDeleteSelected();
      }
      openModal('contaCorrenteDelModal');
    },

    async confirmDeleteSelected() {
      closeModal('contaCorrenteDelModal');
      const empId = this.gestaoUserId || document.getElementById('ccGestaoSelect')?.value;
      const ids = [...this.selectedIds];
      if (!empId || !ids.length) return;
      if (!canManageMovements()) {
        showToast('Sem permissão para excluir histórico.', 'warning');
        return;
      }
      const s = Auth.getSession();
      if (typeof showLoading === 'function') showLoading('Excluindo...');
      try {
        const res = await DB.deleteContaCorrenteHistory(empId, ids, s?.id || 'admin');
        if (!res?.ok) {
          showToast(res?.msg || 'Falha ao excluir.', 'error');
          return;
        }
        showToast(`${res.deleted || ids.length} lançamento(s) excluído(s).`, 'success');
        if (res.skipped_saque > 0) {
          showToast('Saques PIX não foram excluídos (evita crédito indevido). Use rejeição/estorno do saque.', 'warning', 7000);
        }
        this.selectMode = false;
        this.selectedIds = new Set();
        await this._renderGestaoPreview(empId);
        if (this.viewUserId === empId) await this.render(empId);
      } catch (e) {
        console.error('[ContaCorrente] delete history', e);
        showToast('Erro ao excluir histórico.', 'error');
      } finally {
        if (typeof hideLoading === 'function') hideLoading();
      }
    },

    async _loadGestaoEmployees() {
      const s = Auth.getSession();
      const hubRoles = new Set([
        'master', 'fundador', 'gerente', 'gerencia', 'financeiro', 'financial', 'rh', 'diretoria', 'desenvolvedor',
      ]);
      const opRoles = new Set([
        'vendedor', 'employee', 'funcionario', 'supervisor', 'sup_backoffice', 'backoffice',
        'operacional', 'parceiro', 'gerente', 'gerencia',
        'master', 'fundador', 'desenvolvedor', 'financeiro', 'financial', 'rh',
      ]);
      let employees = [];
      if (window.PARTNER_ROOT_ID) {
        employees = await DB.getEmployeesByAdmin(window.PARTNER_ROOT_ID).catch(() => []);
      } else if (hubRoles.has(String(s?.role || '').toLowerCase())) {
        const all = typeof DB.getAllUsers === 'function'
          ? await DB.getAllUsers(true).catch(() => [])
          : await DB.getUsers().catch(() => []);
        employees = (all || []).filter((u) => opRoles.has(String(u?.role || '').toLowerCase()));
        if (!employees.length) employees = all || [];
      } else {
        employees = await DB.getEmployeesByAdmin(s?.id).catch(() => []);
      }
      // Inclui ativos e com conta corrente travada (marcados) — login/users.active NÃO é filtrado aqui
      return (employees || [])
        .filter((u) => u && u.id && isUserActive(u))
        .sort((a, b) => {
          const aOn = isCcMoneyActive(a) ? 0 : 1;
          const bOn = isCcMoneyActive(b) ? 0 : 1;
          if (aOn !== bOn) return aOn - bOn;
          return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
        });
    },

    async renderGestao() {
      this.ensureStyles();
      this.ensureModals();
      this.selectMode = false;
      this.selectedIds = new Set();
      const root = document.getElementById('contaCorrenteGestaoRoot');
      if (!root) {
        if (typeof showToast === 'function') showToast('Área Gestão de conta não carregou. Atualize (Ctrl+F5).', 'error');
        return;
      }
      if (!canManageMovements()) {
        root.innerHTML = `<div class="card card-padded" style="text-align:center;padding:32px;color:var(--color-text-muted);">
          Sem permissão para gestão de conta corrente.</div>`;
        return;
      }

      let employees = [];
      try {
        employees = await this._loadGestaoEmployees();
      } catch (e) {
        console.error('[ContaCorrente] renderGestao load:', e);
        root.innerHTML = `<div class="card card-padded" style="text-align:center;padding:32px;color:var(--color-danger,#dc2626);">
          Erro ao carregar usuários. Tente novamente.</div>`;
        return;
      }

      if (!employees.length) {
        root.innerHTML = `<div class="section-header"><div><h2>Gestão de conta corrente</h2>
          <p class="text-muted">Lançar crédito/débito de proposta.</p></div></div>
          <div class="card card-padded" style="text-align:center;padding:32px;color:var(--color-text-muted);">
            Nenhum colaborador encontrado para gerenciar.</div>`;
        return;
      }

      const selId = this.gestaoUserId && employees.some((e) => e.id === this.gestaoUserId)
        ? this.gestaoUserId
        : (employees[0]?.id || '');
      this.gestaoUserId = selId;

      const movBtns = [];
      if (canMovementKind('credito_proposta')) {
        movBtns.push(`<button type="button" class="btn btn-success btn-sm" onclick="ContaCorrente.openMovement('credito_proposta')">Crédito</button>`);
      }
      if (canMovementKind('debito_proposta')) {
        movBtns.push(`<button type="button" class="btn btn-ghost btn-sm" onclick="ContaCorrente.openMovement('debito_proposta')">Débito</button>`);
      }

      root.innerHTML = `
        <div class="section-header">
          <div><h2>Gestão de conta corrente</h2>
            <p class="text-muted">Lançar crédito/débito de proposta.</p></div>
        </div>
        <div class="card card-padded" style="margin-bottom:16px;">
          <div class="form-row" style="align-items:flex-end;">
            <div class="form-group" style="flex:1;">
              <label>Vendedor / parceiro</label>
              <select id="ccGestaoSelect" class="form-control" onchange="ContaCorrente.onGestaoSelect(this.value)">
                ${employees.map(e => {
                  const nm = typeof fixMojibake === 'function' ? fixMojibake(e.name) : e.name;
                  const on = isCcMoneyActive(e);
                  const label = `${nm || 'Sem nome'} (${e.role || '—'})${on ? '' : ' — CC INATIVA'}`;
                  return `<option class="${on ? '' : 'cc-opt-inactive'}" value="${esc(e.id)}" ${e.id === selId ? 'selected' : ''}>${esc(label)}</option>`;
                }).join('')}
              </select>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">${movBtns.join('')}</div>
          </div>
        </div>
        <div id="ccGestaoPreview"></div>`;

      if (selId) await this._renderGestaoPreview(selId);
    },

    async onGestaoSelect(id) {
      this.gestaoUserId = id;
      this.selectMode = false;
      this.selectedIds = new Set();
      await this._renderGestaoPreview(id);
    },

    async _renderGestaoPreview(empId) {
      const box = document.getElementById('ccGestaoPreview');
      if (!box) return;
      const stmt = await DB.buildContaCorrenteStatement(empId, 60);
      this.gestaoStmt = stmt;
      const u = stmt.user;
      if (!u) { box.innerHTML = ''; return; }
      const neg = Number(stmt.balance) < 0;
      const name = typeof fixMojibake === 'function' ? fixMojibake(u.name) : u.name;
      const lines = stmt.lines || [];
      const selCls = this.selectMode ? ' select-mode' : '';
      const countTxt = this.selectMode
        ? `${this.selectedIds.size} selecionado${this.selectedIds.size === 1 ? '' : 's'}`
        : `${lines.length} lançamento${lines.length === 1 ? '' : 's'}`;
      const active = isCcMoneyActive(u);
      const accountBlocked = (typeof DB !== 'undefined' && typeof DB.isAccountBlocked === 'function')
        ? DB.isAccountBlocked(u)
        : (u.account_block_active === true || u.account_block_active === 1 || u.account_block_active === '1'
          || u.training_block === true || u.training_block === 1 || u.training_block === '1');
      const blockCode = (typeof DB !== 'undefined' && typeof DB.getAccountBlockCode === 'function')
        ? (DB.getAccountBlockCode(u) || '')
        : String(u.account_block_code || (accountBlocked ? '001' : '') || '');
      const blockMotive = (typeof DB !== 'undefined' && typeof DB.formatAccountBlockMotive === 'function')
        ? DB.formatAccountBlockMotive(u)
        : (blockCode ? `${blockCode} - Bloqueio de conta` : '');
      const activeBtn = canManageMovements()
        ? (active
          ? `<button type="button" class="cc-card__active-btn" onclick="ContaCorrente.toggleAccountActive('${esc(empId)}', false)">Inativar conta corrente</button>`
          : `<button type="button" class="cc-card__active-btn is-inactive" onclick="ContaCorrente.toggleAccountActive('${esc(empId)}', true)">Ativar conta corrente</button>`)
        : '';
      const blockBtn = canManageMovements() && !accountBlocked
        ? `<button type="button" class="btn btn-danger btn-sm" onclick="ContaCorrente.openAccountBlockModal('${esc(empId)}')">Bloquear conta</button>`
        : '';
      const hasCredit = (lines || []).some((ln) => ln.type === 'credit' || isAdiantamentoLine(ln));
      const fallbackUnlock = (accountBlocked && canManageMovements() && !hasCredit)
        ? `<button type="button" class="btn btn-outline btn-sm" style="border-color:#15803d;color:#15803d;" onclick="ContaCorrente.openMovementUnblockModal('${esc(empId)}','')">Desbloquear movimentação</button>`
        : '';
      const blockBanner = accountBlocked
        ? `<div class="card card-padded" style="margin-bottom:12px;border:1px solid rgba(185,28,28,.45);background:rgba(220,38,38,.08);">
            <div style="font-size:13px;font-weight:800;color:#b91c1c;letter-spacing:.02em;">CONTA BLOQUEADA — ${esc(blockMotive || blockCode || '—')}</div>
            <p style="margin:6px 0 0;font-size:12px;color:var(--color-text-secondary);">Esta pessoa não pode cadastrar novas propostas. Para liberar, use <strong>Desbloquear movimentação</strong> em um crédito do histórico abaixo.</p>
            ${fallbackUnlock ? `<div style="margin-top:10px;">${fallbackUnlock}<span style="margin-left:8px;font-size:11px;color:var(--color-text-muted);">Sem créditos no histórico — liberar com motivo.</span></div>` : ''}
          </div>`
        : '';
      const blockActionRow = (blockBtn || accountBlocked)
        ? `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px;">
            ${blockBtn || ''}
            <span style="font-size:11px;color:var(--color-text-muted);">${accountBlocked
              ? 'Desbloqueio é feito na linha do crédito (histórico).'
              : 'Impede cadastrar propostas enquanto houver bloqueio.'}</span>
          </div>`
        : '';

      this._gestaoAccountBlocked = !!accountBlocked;

      let openDeb = { total: 0, itens: [] };
      let openDebHtml = '';
      try {
        openDeb = typeof DB.getOpenAccountDebitos === 'function'
          ? await DB.getOpenAccountDebitos(empId)
          : { total: 0, itens: [] };
        if (openDeb.total > 0) {
          const items = (openDeb.itens || []).slice(0, 8).map((i) =>
            `<li style="margin:2px 0;">${esc(i.label || i.voucher_no || i.id)} — <strong>${fmtBal(i.amount, stmt.money, u)}</strong></li>`
          ).join('');
          openDebHtml = `<div class="card card-padded" style="margin-bottom:12px;border:1px solid rgba(185,28,28,.35);background:rgba(220,38,38,.06);">
            <div style="font-size:13px;font-weight:700;color:#b91c1c;margin-bottom:6px;">Débitos em aberto · ${fmtBal(openDeb.total, stmt.money, u)}</div>
            <ul style="margin:0;padding-left:18px;font-size:12px;color:var(--color-text-secondary);">${items}</ul>
            <p style="margin:8px 0 0;font-size:11px;color:var(--color-text-muted);">No saque o colaborador pode optar por descontar esses valores dos pontos.</p>
          </div>`;
        }
      } catch (e) {
        console.warn('[ContaCorrente] open debits:', e);
      }

      const irpfPct = (typeof WithdrawalRules !== 'undefined' && WithdrawalRules.getIrpfRatePct)
        ? WithdrawalRules.getIrpfRatePct()
        : 1.89;
      const irpfCfgHtml = canManageMovements()
        ? `<div class="card card-padded" style="margin-bottom:12px;">
            <div style="font-size:13px;font-weight:700;margin-bottom:8px;">Parametrizar saque — IRPF funcionário</div>
            <div class="form-row" style="align-items:flex-end;gap:10px;flex-wrap:wrap;">
              <div class="form-group" style="margin:0;min-width:140px;">
                <label style="font-size:12px;">IRPF (%)</label>
                <input type="number" id="ccIrpfPct" class="form-control" min="0" max="99" step="0.01" value="${esc(String(irpfPct))}"/>
              </div>
              <button type="button" class="btn btn-primary btn-sm" onclick="ContaCorrente.saveIrpfRate()">Salvar taxa</button>
              <span style="font-size:11px;color:var(--color-text-muted);">Parceiro permanece manual (taxa/IRPJ). Default planilha: 1,89%.</span>
            </div>
          </div>`
        : '';

      let futurosDb = [];
      try {
        await this._migrateLocalFuturos(empId);
        futurosDb = typeof DB.getLancamentosFuturos === 'function'
          ? await DB.getLancamentosFuturos(empId)
          : this._loadFuturos(empId);
      } catch (e) {
        console.warn('[ContaCorrente] futuros:', e);
        futurosDb = this._loadFuturos(empId);
      }
      const futurosHtml = this._renderFuturosSection(empId, openDeb, futurosDb, stmt.money, u);

      box.innerHTML = `
        <div class="cc-card ${neg ? 'negative' : ''}" style="margin-bottom:12px;height:auto;min-height:160px;">
          <div class="cc-card__top">
            <span class="cc-card__brand">Prévia</span>
            <div class="cc-card__top-actions">
              <span class="cc-card__name">${esc(name)}${active ? '' : '<span class="cc-card__badge-off">CC INATIVA</span>'}${accountBlocked ? `<span class="cc-card__badge-off" style="background:#b91c1c;">BLOQUEIO ${esc(blockCode || '')}</span>` : ''}</span>
              ${activeBtn}
            </div>
          </div>
          <div class="cc-card__balance" style="margin-top:14px;">${fmtBal(stmt.balance, stmt.money, u)}</div>
        </div>
        ${blockActionRow}
        ${blockBanner}
        ${irpfCfgHtml}
        ${openDebHtml}
        ${futurosHtml}
        <div class="cc-extrato${selCls}" id="ccGestaoExtrato">
          <div class="cc-extrato__head">
            <span class="cc-extrato__title">Histórico</span>
            <div class="cc-extrato__head-right">
              <span class="cc-extrato__count" id="ccGestaoExtratoCount">${countTxt}</span>
              <button type="button" class="cc-extrato__trash" title="Apagar histórico"
                onclick="ContaCorrente.enterSelectMode()" aria-label="Apagar histórico">
                ${this._trashSvg()}
              </button>
              <div class="cc-extrato__sel-actions">
                <button type="button" class="btn btn-ghost btn-sm" onclick="ContaCorrente.exitSelectMode()">Cancelar</button>
                <button type="button" class="btn btn-danger btn-sm" id="ccGestaoDelBtn"
                  ${this.selectedIds.size ? '' : 'disabled '}
                  onclick="ContaCorrente.requestDeleteSelected()">Excluir</button>
              </div>
            </div>
          </div>
          <div id="ccGestaoExtratoBody">${this._renderLinesGrouped(lines, u, stmt.money, {
            allowMovementUnlock: !!accountBlocked && canManageMovements(),
            empId,
          })}</div>
        </div>`;
    },

    _fillAccountBlockSelect(selId, kind, defaultCode) {
      const sel = document.getElementById(selId);
      if (!sel || typeof DB === 'undefined' || typeof DB.getAccountBlockCatalog !== 'function') return;
      const cat = DB.getAccountBlockCatalog();
      const list = kind === 'unblock' ? cat.unblock : cat.block;
      const def = String(defaultCode || list[0]?.code || '001');
      sel.innerHTML = list.map((x) =>
        `<option value="${esc(x.code)}"${String(x.code) === def ? ' selected' : ''}>${esc(x.code)} — ${esc(x.label)}</option>`
      ).join('');
    },

    openAccountBlockModal(empId) {
      if (!canManageMovements()) {
        showToast('Sem permissão para bloquear conta.', 'warning');
        return;
      }
      if (!empId) return;
      this.ensureModals();
      const hid = document.getElementById('ccBlockEmpId');
      if (hid) hid.value = empId;
      this._fillAccountBlockSelect('ccBlockCode', 'block', '001');
      openModal('ccAccountBlockModal');
    },

    async openMovementUnblockModal(empId, movementId) {
      if (!canManageMovements()) {
        showToast('Sem permissão para desbloquear.', 'warning');
        return;
      }
      if (!empId) return;
      this.ensureModals();
      const hid = document.getElementById('ccUnblockEmpId');
      if (hid) hid.value = empId;
      const mid = document.getElementById('ccUnblockMovementId');
      if (mid) mid.value = movementId || '';

      let paired = '001';
      let motive = '';
      let movSummary = movementId
        ? 'Movimentação selecionada no histórico.'
        : 'Nenhum crédito selecionado — a conta será liberada com o motivo abaixo.';
      try {
        const u = await DB.getUser(empId, true).catch(() => null);
        paired = (typeof DB.getAccountBlockCode === 'function' ? DB.getAccountBlockCode(u) : null) || '001';
        motive = (typeof DB.formatAccountBlockMotive === 'function' ? DB.formatAccountBlockMotive(u) : '') || paired;
        if (movementId && this.gestaoStmt?.lines) {
          const ln = (this.gestaoStmt.lines || []).find((x) => String(x.id) === String(movementId));
          if (ln) {
            const amt = fmtBal(ln.amount, this.gestaoStmt.money, this.gestaoStmt.user);
            movSummary = `<strong>Crédito:</strong> ${esc(ln.reason || 'Movimentação')}<br/><strong>Valor:</strong> ${esc(amt)} · ${esc(fmtDt(ln.created_at))}`;
          }
        }
      } catch (_) { /* noop */ }
      const hint = document.getElementById('ccUnblockHint');
      if (hint) hint.textContent = `Bloqueio atual: ${motive || paired}. Escolha o motivo do desbloqueio (sugerido: ${paired}).`;
      const sum = document.getElementById('ccUnblockMovSummary');
      if (sum) sum.innerHTML = movSummary;
      this._fillAccountBlockSelect('ccUnblockCode', 'unblock', paired);
      openModal('ccAccountUnblockModal');
    },

    async submitAccountBlock() {
      if (!canManageMovements()) return;
      const empId = document.getElementById('ccBlockEmpId')?.value;
      const code = document.getElementById('ccBlockCode')?.value;
      if (!empId) return;
      if (!code) {
        showToast('Selecione o motivo do bloqueio.', 'warning');
        return;
      }
      const me = (typeof Auth !== 'undefined' && Auth.getSession) ? Auth.getSession() : null;
      if (typeof showLoading === 'function') showLoading('Bloqueando conta...');
      try {
        await DB.setAccountBlock(empId, { code, by: me?.id || null });
        closeModal('ccAccountBlockModal');
        const motive = (typeof DB.formatAccountBlockMotive === 'function')
          ? DB.formatAccountBlockMotive({ account_block_active: true, account_block_code: code })
          : code;
        showToast(`Conta bloqueada — ${motive}.`, 'warning', 7000);
        this.gestaoUserId = empId;
        await this.renderGestao();
      } catch (e) {
        console.error('[ContaCorrente] submitAccountBlock', e);
        showToast('Erro ao bloquear: ' + (e.message || e), 'error');
      } finally {
        if (typeof hideLoading === 'function') hideLoading();
      }
    },

    async submitMovementUnblock() {
      if (!canManageMovements()) return;
      const empId = document.getElementById('ccUnblockEmpId')?.value;
      const unlockCode = document.getElementById('ccUnblockCode')?.value;
      const movementId = document.getElementById('ccUnblockMovementId')?.value || '';
      if (!empId) return;
      if (!unlockCode) {
        showToast('Selecione o motivo do desbloqueio.', 'warning');
        return;
      }
      const me = (typeof Auth !== 'undefined' && Auth.getSession) ? Auth.getSession() : null;
      if (typeof showLoading === 'function') showLoading('Desbloqueando movimentação...');
      try {
        await DB.clearAccountBlock(empId, {
          unlockCode,
          by: me?.id || null,
          movementId: movementId || null,
        });
        closeModal('ccAccountUnblockModal');
        showToast(movementId
          ? 'Movimentação desbloqueada — conta liberada.'
          : 'Conta desbloqueada.', 'success', 6000);
        this.gestaoUserId = empId;
        await this.renderGestao();
      } catch (e) {
        console.error('[ContaCorrente] submitMovementUnblock', e);
        showToast('Erro ao desbloquear: ' + (e.message || e), 'error');
      } finally {
        if (typeof hideLoading === 'function') hideLoading();
      }
    },

    /** @deprecated use openMovementUnblockModal — mantido por compat */
    openAccountUnblockModal(empId) {
      return this.openMovementUnblockModal(empId, '');
    },

    /** @deprecated use submitMovementUnblock */
    submitAccountUnblock() {
      return this.submitMovementUnblock();
    },

    saveIrpfRate() {
      if (!canManageMovements()) return;
      const el = document.getElementById('ccIrpfPct');
      const raw = el?.value;
      if (typeof WithdrawalRules === 'undefined' || typeof WithdrawalRules.setIrpfRatePct !== 'function') {
        showToast('Regras de saque indisponíveis.', 'error');
        return;
      }
      try {
        const n = WithdrawalRules.setIrpfRatePct(raw);
        showToast(`IRPF funcionário atualizado para ${String(n).replace('.', ',')}%.`, 'success');
      } catch (e) {
        showToast(e.message || 'Taxa inválida.', 'warning');
      }
    },

    _futurosKey(empId) {
      return `soublu_cc_futuros_${empId}`;
    },

    _loadFuturos(empId) {
      try {
        const raw = JSON.parse(localStorage.getItem(this._futurosKey(empId)) || '[]');
        return Array.isArray(raw) ? raw : [];
      } catch (_) {
        return [];
      }
    },

    _saveFuturos(empId, list) {
      localStorage.setItem(this._futurosKey(empId), JSON.stringify(list || []));
    },

    /** Migra lista antiga (localStorage) → transactions no DB (uma vez por usuário). */
    async _migrateLocalFuturos(empId) {
      if (!empId || typeof DB.registerLancamentoFuturo !== 'function') return;
      const local = this._loadFuturos(empId);
      if (!local.length) return;
      const me = (typeof Auth !== 'undefined' && Auth.getSession) ? Auth.getSession() : null;
      let migrated = 0;
      for (const m of local) {
        const amt = Number(m.amount) || 0;
        const date = String(m.date || '').slice(0, 10);
        if (!(amt > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        try {
          await DB.registerLancamentoFuturo({
            employeeId: empId,
            kind: m.kind === 'debit' ? 'debit' : 'credit',
            amount: amt,
            date,
            reason: m.label || '',
            byUser: me?.id || 'admin',
          });
          migrated += 1;
        } catch (e) {
          console.warn('[ContaCorrente] migrate futuro:', e);
        }
      }
      if (migrated > 0) {
        try { localStorage.removeItem(this._futurosKey(empId)); } catch (_) { /* noop */ }
      }
    },

    _fmtFutDate(d) {
      if (!d) return '—';
      try {
        const [y, m, day] = String(d).split('-');
        if (y && m && day) return `${day}/${m}/${y}`;
      } catch (_) { /* noop */ }
      return String(d);
    },

    _renderFuturosSection(empId, openDeb, futurosDb, money, user) {
      const manual = Array.isArray(futurosDb) ? futurosDb : [];
      const rows = [];
      for (const i of (openDeb?.itens || [])) {
        const dt = (i.created_at || '').toString().slice(0, 10);
        rows.push({
          id: `open_${i.id}`,
          date: dt,
          tipo: 'Débitos a efetuar',
          credit: '',
          debit: Number(i.amount) || 0,
          label: i.label || i.voucher_no || i.id,
          source: 'open',
        });
      }
      for (const m of manual) {
        const isCredit = m.kind === 'credit';
        rows.push({
          id: m.id,
          date: m.date || '',
          tipo: isCredit ? 'Créditos a receber' : 'Débitos a efetuar',
          credit: isCredit ? (Number(m.amount) || 0) : '',
          debit: !isCredit ? (Number(m.amount) || 0) : '',
          label: m.label || '',
          source: m.source === 'db' ? 'db' : 'manual',
        });
      }
      rows.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

      const fmtMoney = (n) => {
        if (n === '' || n == null || !(Number(n) > 0)) return '—';
        return fmtBal(n, money, user);
      };

      const canRemove = (r) => r.source === 'db' || r.source === 'manual';

      const bodyRows = rows.length
        ? rows.map((r) => `<tr>
            <td style="padding:8px 10px;font-size:12px;">${esc(r.tipo)}</td>
            <td style="padding:8px 10px;font-size:12px;white-space:nowrap;">${esc(this._fmtFutDate(r.date))}</td>
            <td style="padding:8px 10px;font-size:12px;color:#15803d;">${r.credit !== '' ? esc(fmtMoney(r.credit)) : '—'}</td>
            <td style="padding:8px 10px;font-size:12px;color:#b91c1c;">${r.debit !== '' ? esc(fmtMoney(r.debit)) : '—'}</td>
            <td style="padding:8px 10px;font-size:11px;color:var(--color-text-muted);">${esc(r.label || '')}</td>
            <td style="padding:8px 6px;text-align:right;">${canRemove(r)
              ? `<button type="button" class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 8px;"
                  onclick="ContaCorrente.removeFuturo('${esc(empId)}','${esc(r.id)}')">Remover</button>`
              : '<span style="font-size:10px;color:var(--color-text-muted);">aberto</span>'}</td>
          </tr>`).join('')
        : `<tr><td colspan="6" style="padding:14px;text-align:center;color:var(--color-text-muted);font-size:12px;">Nenhum lançamento futuro.</td></tr>`;

      const addBtn = canManageMovements()
        ? `<button type="button" class="btn btn-outline btn-sm" onclick="ContaCorrente.openFuturoModal('${esc(empId)}')">Adicionar</button>`
        : '';

      return `<div class="card card-padded" style="margin-bottom:12px;" id="ccFuturosBox">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
          <div>
            <div style="font-size:13px;font-weight:700;">Lançamentos futuros</div>
            <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px;">Créditos a receber e débitos a efetuar com data — não alteram o saldo até lançar no histórico.</div>
          </div>
          ${addBtn}
        </div>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:var(--color-surface-2);text-align:left;">
                <th style="padding:8px 10px;font-size:11px;font-weight:700;">TIPO</th>
                <th style="padding:8px 10px;font-size:11px;font-weight:700;">DATA</th>
                <th style="padding:8px 10px;font-size:11px;font-weight:700;">CRÉDITO</th>
                <th style="padding:8px 10px;font-size:11px;font-weight:700;">DÉBITO</th>
                <th style="padding:8px 10px;font-size:11px;font-weight:700;">OBS.</th>
                <th style="padding:8px 6px;"></th>
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
      </div>`;
    },

    openFuturoModal(empId) {
      if (!canManageMovements() || !empId) return;
      this.ensureModals();
      const hid = document.getElementById('ccFutEmpId');
      if (hid) hid.value = empId;
      const d = document.getElementById('ccFutDate');
      if (d) d.value = new Date().toISOString().slice(0, 10);
      const amt = document.getElementById('ccFutAmount');
      if (amt) amt.value = '';
      const lab = document.getElementById('ccFutLabel');
      if (lab) lab.value = '';
      const kind = document.getElementById('ccFutKind');
      if (kind) kind.value = 'credit';
      openModal('ccFuturosModal');
    },

    _onFutKindChange() { /* placeholder for label hint */ },

    async submitFuturo() {
      if (!canManageMovements()) return;
      const empId = document.getElementById('ccFutEmpId')?.value;
      const date = document.getElementById('ccFutDate')?.value;
      const kind = document.getElementById('ccFutKind')?.value || 'credit';
      const amount = parseFloat(document.getElementById('ccFutAmount')?.value);
      let label = (document.getElementById('ccFutLabel')?.value || '').trim();
      if (!empId || !date) {
        showToast('Informe a data.', 'warning');
        return;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        showToast('Informe um valor válido.', 'warning');
        return;
      }
      if (!label) {
        label = kind === 'credit' ? 'Créditos a receber' : 'Débitos a efetuar';
      }
      const me = (typeof Auth !== 'undefined' && Auth.getSession) ? Auth.getSession() : null;
      if (typeof showLoading === 'function') showLoading('Salvando lançamento futuro...');
      try {
        if (typeof DB.registerLancamentoFuturo === 'function') {
          const tx = await DB.registerLancamentoFuturo({
            employeeId: empId,
            kind: kind === 'debit' ? 'debit' : 'credit',
            amount,
            date,
            reason: label,
            byUser: me?.id || 'admin',
          });
          if (!tx) {
            showToast('Não foi possível salvar o lançamento.', 'error');
            return;
          }
        } else {
          const list = this._loadFuturos(empId);
          list.push({
            id: `fut_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            date,
            kind,
            amount,
            label,
          });
          this._saveFuturos(empId, list);
        }
        closeModal('ccFuturosModal');
        showToast('Lançamento futuro salvo.', 'success');
        await this._renderGestaoPreview(empId);
      } catch (e) {
        console.error('[ContaCorrente] submitFuturo', e);
        showToast('Erro ao salvar: ' + (e.message || e), 'error');
      } finally {
        if (typeof hideLoading === 'function') hideLoading();
      }
    },

    async removeFuturo(empId, id) {
      if (!canManageMovements() || !empId || !id) return;
      if (typeof showLoading === 'function') showLoading('Removendo...');
      try {
        if (typeof DB.removeLancamentoFuturo === 'function' && !String(id).startsWith('fut_')) {
          const r = await DB.removeLancamentoFuturo(empId, id);
          if (!r?.ok) {
            showToast(r?.msg || 'Não foi possível remover.', 'warning');
            return;
          }
        } else {
          const list = this._loadFuturos(empId).filter((x) => String(x.id) !== String(id));
          this._saveFuturos(empId, list);
        }
        showToast('Removido.', 'success');
        await this._renderGestaoPreview(empId);
      } catch (e) {
        console.error('[ContaCorrente] removeFuturo', e);
        showToast('Erro ao remover: ' + (e.message || e), 'error');
      } finally {
        if (typeof hideLoading === 'function') hideLoading();
      }
    },

    async toggleAccountActive(empId, activate) {
      if (!canManageMovements()) {
        showToast('Sem permissão para alterar a conta corrente.', 'warning');
        return;
      }
      if (!empId) return;
      const wantOn = !!activate;
      const msg = wantOn
        ? 'Reativar a CONTA CORRENTE desta pessoa?\n\nO login dela já continua normal. Isso só libera saques/saldo em dinheiro de novo.'
        : 'Inativar a CONTA CORRENTE (dinheiro) desta pessoa?\n\nO login no sistema CONTINUA ativo. Só bloqueia saques da conta corrente até reativar.';
      if (!confirm(msg)) return;
      if (typeof showLoading === 'function') showLoading(wantOn ? 'Ativando conta corrente...' : 'Inativando conta corrente...');
      try {
        await DB.setCcMoneyActive(empId, wantOn);
        showToast(wantOn ? 'Conta corrente ativada.' : 'Conta corrente inativada (login permanece).', 'success');
        this.gestaoUserId = empId;
        await this.renderGestao();
      } catch (e) {
        console.error('[ContaCorrente] toggleAccountActive', e);
        showToast('Erro ao alterar conta corrente: ' + (e.message || e), 'error');
      } finally {
        if (typeof hideLoading === 'function') hideLoading();
      }
    },

    openMovement(kind) {
      const empId = document.getElementById('ccGestaoSelect')?.value || this.gestaoUserId;
      if (!empId) { showToast('Selecione um usuário.', 'warning'); return; }
      if (!canMovementKind(kind)) { showToast('Sem permissão para esta operação.', 'warning'); return; }
      this.ensureModals();
      document.getElementById('ccMovKind').value = kind;
      document.getElementById('ccMovEmpId').value = empId;
      document.getElementById('ccMovAmount').value = '';
      document.getElementById('ccMovMotivoGroup').style.display = 'none';
      document.getElementById('ccMovFormaPagamentoGroup').style.display = 'none';
      document.getElementById('ccMovDataDebitoGroup').style.display = 'none';
      document.getElementById('ccMovReasonGroup').style.display = 'block';
      document.getElementById('ccMovProposalGroup').style.display = 'block';
      document.getElementById('ccMovReason').value = '';
      document.getElementById('ccMovProposal').value = '';

      const titles = {
        credito_proposta: 'Crédito',
        debito_proposta: 'Débito',
      };
      const hints = {
        credito_proposta: 'Credita saldo vinculado a proposta aprovada/paga.',
        debito_proposta: 'Debita saldo (estorno ou ajuste de proposta).',
      };
      document.getElementById('contaCorrenteMovTitle').textContent = titles[kind] || 'Movimentação';
      document.getElementById('ccMovHint').textContent = hints[kind] || '';
      openModal('contaCorrenteMovModal');
    },

    async submitMovement() {
      const kind = document.getElementById('ccMovKind').value;
      const empId = document.getElementById('ccMovEmpId').value;
      const amount = parseFloat(document.getElementById('ccMovAmount').value);
      
      let reason = document.getElementById('ccMovReason').value.trim();
      const proposal = document.getElementById('ccMovProposal').value.trim();
      if (!reason) { showToast('Preencha o motivo.', 'warning'); return; }

      if (!empId) { showToast('Selecione um usuário.', 'warning'); return; }
      if (!Number.isFinite(amount) || amount <= 0) { showToast('Valor inválido.', 'warning'); return; }
      const s = Auth.getSession();
      const res = await DB.applyContaCorrenteMovement(empId, kind, amount, reason, s?.id || 'admin', proposal);
      if (!res?.ok) { showToast(res?.msg || 'Falha na movimentação.', 'error'); return; }
      closeModal('contaCorrenteMovModal');
      showToast('Movimentação registrada.', 'success');
      await this._renderGestaoPreview(empId);
      if (this.viewUserId === empId) await this.render(empId);
    },

    init() {
      this.ensureUi();
    },
  };

  window.ContaCorrente = ContaCorrente;
})();
