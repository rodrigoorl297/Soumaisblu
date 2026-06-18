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
    try { return new Date(iso).toLocaleString('pt-BR'); } catch { return '—'; }
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
.cc-extrato__head { padding: 14px 18px; background: var(--color-surface-2); font-weight: 700; font-size: 14px; border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; }
.cc-extrato__title { font-weight: 700; }
.cc-extrato__count { font-size: 12px; color: var(--color-text-muted); font-weight: 500; }

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
      if (document.getElementById('contaCorrenteMovModal')) return;
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

    _renderLinesGrouped(lines, user, money) {
      if (!lines.length) {
        return '<div class="text-muted text-center" style="padding:24px;">Nenhuma movimentação no período.</div>';
      }
      const groups = groupLinesByDate(lines);
      const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
      
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
          const advDetail = isAdv ? adiantamentoDetail(ln) : '';
          const extraParts = [advDetail, kind, ln.status].filter(Boolean);
          const extra = extraParts.join(' · ');
          return `<div class="cc-line">
            <div class="cc-line__icon ${cls}">${icon}</div>
            <div class="cc-line__body">
              <div class="cc-line__title">${esc(ln.reason)}</div>
              <div class="cc-line__meta">${fmtDt(ln.created_at)}${extra ? ' <span class="cc-line__dot"></span> ' + esc(extra) : ''}</div>
            </div>
            <div class="cc-line__amt ${cls}">${sign}${amt}</div>
          </div>`;
        }).join('');
        return dateHeader + itemsHtml;
      }).join('');
    },

    async renderGestao() {
      this.ensureUi();
      const root = document.getElementById('contaCorrenteGestaoRoot');
      if (!root || !canManageMovements()) return;

      const s = Auth.getSession();
      let employees = [];
      if (window.PARTNER_ROOT_ID) {
        employees = await DB.getEmployeesByAdmin(window.PARTNER_ROOT_ID);
      } else if (s?.role === 'master' || s?.role === 'fundador') {
        employees = await DB.getUsers();
      } else {
        employees = await DB.getEmployeesByAdmin(s?.id);
      }
      employees = (employees || []).filter(u => u && u.active !== false);

      const selId = this.gestaoUserId || employees[0]?.id || '';
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
                  return `<option value="${esc(e.id)}" ${e.id === selId ? 'selected' : ''}>${esc(nm)} (${esc(e.role)})</option>`;
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
      await this._renderGestaoPreview(id);
    },

    async _renderGestaoPreview(empId) {
      const box = document.getElementById('ccGestaoPreview');
      if (!box) return;
      const stmt = await DB.buildContaCorrenteStatement(empId, 30);
      const u = stmt.user;
      if (!u) { box.innerHTML = ''; return; }
      const neg = Number(stmt.balance) < 0;
      box.innerHTML = `
        <div class="cc-card ${neg ? 'negative' : ''}" style="margin-bottom:12px;">
          <div class="cc-card__top"><span>Prévia</span><span>${esc(typeof fixMojibake === 'function' ? fixMojibake(u.name) : u.name)}</span></div>
          <div class="cc-card__balance">${fmtBal(stmt.balance, stmt.money, u)}</div>
        </div>
        <div class="cc-extrato">${this._renderLines(stmt.lines.slice(0, 15), u, stmt.money)}</div>`;
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
