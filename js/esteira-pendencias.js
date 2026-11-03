/**
 * esteira-pendencias — pendências do vendedor com prazo 1 dia útil.
 * BO lança; supervisor/gerente/master desbloqueiam; banner vermelho no painel.
 * Piloto: só 3 vendedores na allowlist (PILOT_VENDOR_IDS).
 * Bloqueio (pendency_block_*) é independente do saque (account_block_*).
 */
(function () {
  'use strict';

  const TAG = '[PENDENCIAS]';
  const POLL_MS = 60000;
  const BOLETO_DAYS = 2;

  /**
   * PILOT_VENDOR_IDS — allowlist opcional.
   * PILOT_MODE=false: todos os vendedores no período de teste geral.
   */
  const PILOT_MODE = false;
  const PILOT_VENDOR_IDS = [];

  let _timer = null;
  let _booting = false;
  let _cacheUsers = null;
  let _cacheUsersAt = 0;

  function session() {
    return typeof Auth !== 'undefined' && Auth.getSession ? Auth.getSession() : null;
  }

  function roleOf(u) {
    return String(u?.role || '').toLowerCase();
  }

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  /**
   * fmtProposalRef — rótulo curto da proposta (número/protocolo/id).
   * Prioriza o que o BO cola no lançamento (proposal_id) e o numero da ficha.
   */
  function fmtProposalRef(p, prop) {
    const raw = String(
      p?.proposal_id || prop?.numero || prop?.protocolo || prop?.id || ''
    ).trim();
    return raw || '';
  }

  /**
   * clientLabel — nome do cliente na pendência (gravado ou vindo da proposta).
   */
  function clientLabel(p, prop) {
    return String(
      p?.client_name || prop?.client_name || prop?.clientName || ''
    ).trim();
  }

  /** onlyDigits — mantém só números (CPF). */
  function onlyDigits(s) {
    return String(s || '').replace(/\D+/g, '');
  }

  /**
   * fmtCpf — mascara 000.000.000-00 para exibir no card/form.
   */
  function fmtCpf(s) {
    const d = onlyDigits(s);
    if (d.length !== 11) return d || '';
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  /** cpfLabel — CPF da pendência ou da proposta vinculada. */
  function cpfLabel(p, prop) {
    return fmtCpf(p?.client_cpf || prop?.client_cpf || prop?.clientCpf || '');
  }

  /**
   * enrichPendenciasWithClients — preenche client_name a partir da proposta.
   * Persiste no banco quando achar, para o card não depender de lookup toda vez.
   */
  async function enrichPendenciasWithClients(rows) {
    if (!Array.isArray(rows) || typeof DB === 'undefined') return rows || [];
    const cache = new Map();
    for (const p of rows) {
      if (!p) continue;
      const needName = !p.client_name;
      const needCpf = !onlyDigits(p.client_cpf);
      if (!needName && !needCpf) continue;
      const ref = String(p.proposal_id || '').trim();
      if (!ref) continue;
      let prop = cache.get(ref);
      if (prop === undefined) {
        try {
          prop = await DB.findProposalByRef(ref);
        } catch {
          prop = null;
        }
        cache.set(ref, prop || null);
      }
      if (!prop) continue;
      const name = String(prop.client_name || prop.clientName || '').trim();
      const cpf = onlyDigits(prop.client_cpf || prop.clientCpf || '') || null;
      const patch = {};
      if (needName && name) { p.client_name = name; patch.client_name = name; }
      if (needCpf && cpf) { p.client_cpf = cpf; patch.client_cpf = cpf; }
      if (!Object.keys(patch).length) continue;
      try {
        await DB.updateVendorPendencia(p.id, patch);
      } catch { /* não bloqueia a tela se o PATCH falhar */ }
    }
    return rows;
  }

  function isPilotVendor(id) {
    if (!PILOT_MODE) return true;
    return PILOT_VENDOR_IDS.includes(String(id || ''));
  }

  /** canAccessEsteira — BO, supervisor, gerente, master/fundador. */
  function canAccessEsteira(u) {
    if (!u) return false;
    const r = roleOf(u);
    return [
      'backoffice', 'sup_backoffice', 'operacional', 'supervisor',
      'gerente', 'gerencia', 'master', 'fundador', 'admin', 'desenvolvedor',
    ].includes(r)
      || !!(typeof window !== 'undefined' && (window.IS_MASTER || window.IS_FUNDA || window.IS_GERENTE || window.IS_SUP_BACKOFFICE || window.IS_BACKOFFICE));
  }

  /** canLaunch — só BO (e master/fundador) lança pendência. */
  function canLaunch(u) {
    if (!u) return false;
    const r = roleOf(u);
    return ['backoffice', 'sup_backoffice', 'operacional', 'master', 'fundador', 'admin', 'desenvolvedor'].includes(r)
      || !!(window.IS_MASTER || window.IS_FUNDA || window.IS_SUP_BACKOFFICE || window.IS_BACKOFFICE);
  }

  /**
   * canUnlockVendor — supervisor do vendedor (admin_id), gerente ou master.
   * BO não desbloqueia sozinho (só lança / marca atraso).
   */
  function canUnlockVendor(actor, vendor) {
    if (!actor) return false;
    const r = roleOf(actor);
    if (['master', 'fundador', 'admin', 'desenvolvedor', 'gerente', 'gerencia'].includes(r)) return true;
    if (window.IS_MASTER || window.IS_FUNDA || window.IS_GERENTE) return true;
    if (r === 'supervisor' || r === 'estrategico') {
      return String(vendor?.admin_id || '') === String(actor.id);
    }
    return false;
  }

  function contentRoot() {
    return document.querySelector('.page-content')
      || document.querySelector('#mainArea .page-content')
      || document.querySelector('#mainArea')
      || document.querySelector('.main-content')
      || document.body;
  }

  function goSection(id) {
    const sec = document.getElementById(id);
    if (sec) sec.style.removeProperty('display');
    if (typeof navigateTo === 'function') {
      navigateTo(id);
      return;
    }
    document.querySelectorAll('.section').forEach((s) => s.classList.toggle('active', s.id === id));
  }

  function brTodayYmd() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  }

  function isBusinessDay(ymd) {
    if (typeof AttendancePenalty !== 'undefined' && typeof AttendancePenalty.isBusinessDay === 'function') {
      return AttendancePenalty.isBusinessDay(ymd);
    }
    const d = new Date(ymd + 'T12:00:00Z');
    const w = d.getUTCDay();
    if (w < 1 || w > 5) return false;
    if (typeof BrHolidays !== 'undefined' && BrHolidays.isHoliday(ymd)) return false;
    return true;
  }

  function addDaysYmd(ymd, n) {
    const d = new Date(ymd + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  /**
   * nextBusinessDayDueAt — fim do próximo dia útil (23:59:59 BRT) a partir de hoje.
   * Prazo = 1 dia útil para o vendedor tratar.
   */
  function nextBusinessDayDueAt(fromYmd) {
    let ymd = addDaysYmd(fromYmd || brTodayYmd(), 1);
    for (let i = 0; i < 14; i++) {
      if (isBusinessDay(ymd)) break;
      ymd = addDaysYmd(ymd, 1);
    }
    return `${ymd} 23:59:59`;
  }

  function parseDueMs(dueAt) {
    const s = String(dueAt || '').trim();
    if (!s) return 0;
    const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + (s.includes('-') && !/[+-]\d{2}:?\d{2}$/.test(s) && !s.endsWith('Z') ? '-03:00' : ''));
    return d.getTime() || 0;
  }

  function isOverdue(p) {
    if (!p || String(p.status) !== 'aberta') return false;
    const ms = parseDueMs(p.due_at);
    return ms > 0 && ms < Date.now();
  }

  function fmtDt(s) {
    if (!s) return '—';
    try {
      if (typeof formatDateTime === 'function') return formatDateTime(s);
      const d = new Date(String(s).replace(' ', 'T'));
      return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    } catch {
      return String(s);
    }
  }

  async function loadUsers() {
    if (_cacheUsers && Date.now() - _cacheUsersAt < 60000) return _cacheUsers;
    let list = [];
    try {
      if (typeof DB !== 'undefined' && typeof DB.getAllUsers === 'function') {
        list = await DB.getAllUsers();
      } else if (typeof DB !== 'undefined' && typeof DB.getUsers === 'function') {
        list = await DB.getUsers();
      }
    } catch (e) {
      console.warn(TAG, 'users', e);
    }
    _cacheUsers = Array.isArray(list) ? list : [];
    _cacheUsersAt = Date.now();
    return _cacheUsers;
  }

  function userById(users, id) {
    return (users || []).find((u) => String(u.id) === String(id)) || null;
  }

  /**
   * filterVisible — supervisor só vê sua equipe; BO/gerente/master vê piloto (ou todos).
   */
  function filterVisible(rows, actor, users) {
    const r = roleOf(actor);
    let list = Array.isArray(rows) ? rows.slice() : [];
    if (PILOT_MODE) {
      list = list.filter((p) => isPilotVendor(p.vendor_id));
    }
    if (r === 'supervisor' || r === 'estrategico') {
      list = list.filter((p) => {
        if (String(p.supervisor_id) === String(actor.id)) return true;
        const v = userById(users, p.vendor_id);
        return v && String(v.admin_id) === String(actor.id);
      });
    }
    return list;
  }

  function pushHistory(p, action, by, note) {
    const hist = Array.isArray(p.history) ? p.history.slice() : [];
    hist.push({
      at: (typeof nowBrazilSql === 'function' ? nowBrazilSql() : new Date().toISOString()),
      by: by || null,
      action,
      note: note || '',
    });
    return hist;
  }

  /**
   * actionLabel — rótulo PT do evento no histórico da pendência.
   */
  function actionLabel(action) {
    const map = {
      aberta: 'Aberta',
      resolvida: 'Resolvida',
      cancelada: 'Cancelada',
      bloqueio: 'Bloqueio do vendedor',
      bloqueio_auto: 'Bloqueio automático (prazo)',
      desbloqueio: 'Desbloqueio',
    };
    return map[String(action || '')] || String(action || 'evento');
  }

  /**
   * historyListHtml — lista o que aconteceu antes de resolver (timeline).
   */
  function historyListHtml(p) {
    let hist = Array.isArray(p?.history) ? p.history.slice() : [];
    if (!hist.length) {
      hist = [{
        at: p?.opened_at || p?.created_at || '',
        by: p?.opened_by_name || p?.opened_by || '',
        action: 'aberta',
        note: p?.title || '',
      }];
    }
    const items = hist.map((h) => {
      const when = fmtDt(h.at) || '—';
      const who = h.by_name || h.by || '—';
      const note = h.note ? ` — ${esc(h.note)}` : '';
      return `<li style="margin:0 0 8px;border-left:3px solid #cbd5e1;padding-left:10px;">
        <strong>${esc(actionLabel(h.action))}</strong>
        <span style="color:var(--color-text-muted);font-size:12px;"> · ${esc(when)} · ${esc(String(who))}</span>
        ${note ? `<div style="font-size:12px;margin-top:2px;">${note}</div>` : ''}
      </li>`;
    }).join('');
    return `<ol style="margin:0;padding:0;list-style:none;">${items}</ol>`;
  }

  /**
   * fetchPendencia — carrega 1 registro por id (não depende do limite da lista).
   */
  async function fetchPendencia(id) {
    if (typeof DB === 'undefined') return null;
    if (typeof DB.getVendorPendenciaById === 'function') {
      return DB.getVendorPendenciaById(id);
    }
    const rows = await DB.getVendorPendencias({ limit: 1000 });
    return (rows || []).find((x) => String(x.id) === String(id)) || null;
  }

  /**
   * ensureResolveModal — popup: resume + histórico + nota + confirmar Resolvido.
   */
  function ensureResolveModal() {
    let modal = document.getElementById('pendResolveModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'pendResolveModal';
    modal.innerHTML = `
      <div class="modal" style="max-width:560px;">
        <div class="modal-header">
          <h3 style="margin:0;">Marcar como resolvida</h3>
          <button type="button" class="modal-close" onclick="EsteiraPendencias.closeResolveModal()" aria-label="Fechar"></button>
        </div>
        <div class="modal-body" style="display:grid;gap:12px;">
          <div id="pendResolveSummary" style="font-size:13px;line-height:1.5;"></div>
          <div>
            <div style="font-weight:700;font-size:13px;margin-bottom:6px;">O que aconteceu antes</div>
            <div id="pendResolveHistory" style="max-height:220px;overflow:auto;background:var(--color-surface-2,#f8fafc);border-radius:8px;padding:10px 12px;"></div>
          </div>
          <div class="form-group" style="margin:0;">
            <label for="pendResolveNote">Nota de resolução (opcional)</label>
            <textarea id="pendResolveNote" class="form-control" rows="2" placeholder="Ex.: documentos enviados / boleto anexado"></textarea>
          </div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;">
          <button type="button" class="btn btn-outline" onclick="EsteiraPendencias.closeResolveModal()">Cancelar</button>
          <button type="button" class="btn btn-primary" id="pendResolveConfirmBtn"
            style="background:#15803d;border-color:#15803d;">Confirmar resolvido</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  /* ── Banner vermelho (vendedor) ── */

  /**
   * ensureBannerEl — faixa fixa vermelha no topo do conteúdo do painel.
   */
  function ensureBannerEl() {
    let el = document.getElementById('pendenciaAlertBanner');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'pendenciaAlertBanner';
    el.setAttribute('role', 'alert');
    el.style.cssText = [
      'display:none',
      'background:#b91c1c',
      'color:#fff',
      'padding:12px 16px',
      'margin:0 0 12px',
      'border-radius:8px',
      'box-shadow:0 2px 8px rgba(185,28,28,.35)',
      'font-size:14px',
      'line-height:1.45',
      'z-index:40',
    ].join(';');
    const root = contentRoot();
    const firstSec = root?.querySelector?.('.section') || root?.firstChild;
    if (root && firstSec) root.insertBefore(el, firstSec);
    else if (root) root.prepend(el);
    else document.body.prepend(el);
    return el;
  }

  /**
   * renderVendorBanner — lista pendências abertas/atrasadas em vermelho.
   */
  function renderVendorBanner(pendencias, blocked) {
    const el = ensureBannerEl();
    const open = (pendencias || []).filter((p) => String(p.status) === 'aberta');
    if (!open.length && !blocked) {
      el.style.display = 'none';
      el.innerHTML = '';
      return;
    }
    const items = open.map((p) => {
      const late = isOverdue(p);
      const cli = clientLabel(p);
      const propRef = fmtProposalRef(p);
      return `<li style="margin:4px 0;">
        <strong>${esc(p.title)}</strong>
        ${late ? ' <span style="background:#fff;color:#b91c1c;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:700;">ATRASADA</span>' : ''}
        — prazo ${esc(fmtDt(p.due_at))}
        <div style="opacity:.95;font-size:12px;margin-top:2px;">
          ${cli ? `Cliente: <strong>${esc(cli)}</strong>` : 'Cliente: —'}
          ${(() => { const c = cpfLabel(p); return c ? ` · CPF: <strong>${esc(c)}</strong>` : ''; })()}
          ${propRef ? ` · Proposta: <strong>${esc(propRef)}</strong>` : ''}
        </div>
        ${p.description ? `<div style="opacity:.92;font-size:13px;margin-top:2px;">${esc(p.description)}</div>` : ''}
      </li>`;
    }).join('');
    el.innerHTML = `
      <div style="display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;">
        <div style="flex:1;min-width:220px;">
          <div style="font-weight:800;letter-spacing:.02em;margin-bottom:6px;">
            ${blocked ? '⛔ CONTA BLOQUEADA POR PENDÊNCIA' : '⚠ PENDÊNCIAS EM ABERTO'}
          </div>
          <div style="font-size:13px;opacity:.95;margin-bottom:8px;">
            ${blocked
              ? 'Você não pode cadastrar nem editar propostas até o supervisor liberar. Resolva as pendências abaixo.'
              : 'Trate as pendências dentro do prazo (1 dia útil). Após o prazo a digitação de propostas será bloqueada.'}
          </div>
          <ul style="margin:0;padding-left:18px;">${items || '<li>Sem detalhe — fale com o backoffice.</li>'}</ul>
        </div>
        <button type="button" class="btn" style="background:#fff;color:#b91c1c;font-weight:700;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;"
          onclick="EsteiraPendencias.openMinhas()">Ver / tratar</button>
      </div>`;
    el.style.display = 'block';
  }

  function renderBoletoBanner(reminders) {
    let el = document.getElementById('boletoRemindBanner');
    if (!reminders?.length) {
      if (el) { el.style.display = 'none'; el.innerHTML = ''; }
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = 'boletoRemindBanner';
      el.style.cssText = 'display:none;background:#7f1d1d;color:#fff;padding:10px 14px;margin:0 0 10px;border-radius:8px;font-size:13px;';
      const pend = document.getElementById('pendenciaAlertBanner');
      if (pend?.parentNode) pend.parentNode.insertBefore(el, pend.nextSibling);
      else contentRoot()?.prepend(el);
    }
    el.innerHTML = `<strong>Lembrete — BOLETO VALIDADO</strong>
      <div style="margin-top:4px;">Mantenha contato com o cliente até a proposta ficar PAGA:</div>
      <ul style="margin:6px 0 0;padding-left:18px;">${reminders.map((r) =>
        `<li>${esc(r.client_name || 'Cliente')} · proposta ${esc(String(r.proposal_id).slice(0, 12))}…</li>`
      ).join('')}</ul>`;
    el.style.display = 'block';
  }

  /* ── UI esteira (gestão) ── */

  function ensureNav() {
    let btn = document.getElementById('navEsteiraPendencias');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nav-item';
      btn.id = 'navEsteiraPendencias';
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg><span class="nav-label">Pendências</span>`;
      const after = document.getElementById('navGestaoCredito')
        || document.getElementById('navManageProposals')
        || document.getElementById('navProposals');
      if (after?.parentNode) after.parentNode.insertBefore(btn, after.nextSibling);
      else {
        const nav = document.querySelector('.sidebar-nav');
        if (nav) nav.appendChild(btn);
      }
    }
    btn.dataset.section = 'secEsteiraPendencias';
    btn.style.display = '';
    btn.hidden = false;
    if (!btn.dataset.pendWired) {
      btn.dataset.pendWired = '1';
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        EsteiraPendencias.openEsteira();
      }, true);
    }
    return btn;
  }

  function sectionHtml() {
    const launch = canLaunch(session());
    return `
      <div class="card card-padded" style="padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
          <div>
            <h2 style="margin:0;font-size:18px;">Esteira de Pendências</h2>
            <p style="margin:4px 0 0;font-size:12px;color:var(--color-text-muted);">
              Prazo 1 dia útil · todos os vendedores · bloqueio impede digitar proposta
            </p>
          </div>
          ${launch ? `<button type="button" class="btn btn-primary" onclick="EsteiraPendencias.openLaunch()">+ Lançar pendência</button>` : ''}
        </div>
        <div id="pendCols" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;"></div>
      </div>
      <div class="modal-overlay" id="pendLaunchModal">
        <div class="modal" style="max-width:520px;">
          <div class="modal-header"><h3>Lançar pendência</h3>
            <button type="button" class="modal-close" onclick="EsteiraPendencias.closeLaunch()"></button></div>
          <div class="modal-body" style="display:grid;gap:10px;">
            <div class="form-group"><label>Vendedor</label>
              <select id="pendVendorSel" class="form-control"></select></div>
            <div class="form-group"><label>Título *</label>
              <input id="pendTitle" class="form-control" maxlength="200" placeholder="Ex.: Falta comprovante de residência"/></div>
            <div class="form-group"><label>Descrição</label>
              <textarea id="pendDesc" class="form-control" rows="3" placeholder="O que o vendedor precisa resolver"></textarea></div>
            <div class="form-group"><label>Nº / ID / protocolo da proposta</label>
              <input id="pendPropId" class="form-control" placeholder="Ex.: 20260922284962 ou PROP-..."
                onblur="EsteiraPendencias.lookupProposal()"/></div>
            <div class="form-group"><label>Nome do cliente *</label>
              <input id="pendClientName" class="form-control" maxlength="200" placeholder="Nome completo do cliente"/></div>
            <div class="form-group"><label>CPF do cliente *</label>
              <input id="pendClientCpf" class="form-control" maxlength="14" placeholder="000.000.000-00"
                inputmode="numeric" autocomplete="off"/></div>
            <div id="pendPropHint" style="font-size:11px;color:var(--color-text-muted);"></div>
            <button type="button" class="btn btn-primary" onclick="EsteiraPendencias.submitLaunch()">Salvar e notificar</button>
          </div>
        </div>
      </div>`;
  }

  function cardHtml(p, users) {
    const late = isOverdue(p);
    const vendor = userById(users, p.vendor_id);
    const blocked = !!(vendor && typeof DB !== 'undefined' && DB.isPendencyBlocked(vendor));
    const actor = session();
    const canUnlock = canUnlockVendor(actor, vendor);
    const canBlock = canAccessEsteira(actor);
    const st = String(p.status || '');
    const done = st === 'resolvida' || st === 'cancelada';
    const cli = clientLabel(p);
    const cpf = cpfLabel(p);
    const propRef = fmtProposalRef(p);
    const idAttr = esc(p.id);
    return `<div class="card" style="padding:10px 12px;border-left:4px solid ${late || blocked ? '#b91c1c' : (done ? '#15803d' : '#2563eb')};margin-bottom:8px;" data-pend-id="${idAttr}">
      <div style="font-weight:700;font-size:13px;">${esc(p.title)}</div>
      <div style="font-size:11px;margin-top:4px;line-height:1.45;">
        <div><span style="color:var(--color-text-muted);">Cliente:</span> <strong>${esc(cli || '—')}</strong></div>
        <div><span style="color:var(--color-text-muted);">CPF:</span> <strong>${esc(cpf || '—')}</strong></div>
        <div><span style="color:var(--color-text-muted);">Proposta:</span> <strong>${esc(propRef || '—')}</strong></div>
        <div style="color:var(--color-text-muted);margin-top:2px;">
          Vendedor: ${esc(p.vendor_name || vendor?.name || p.vendor_id)} · prazo ${esc(fmtDt(p.due_at))}
        </div>
      </div>
      ${p.description ? `<div style="font-size:12px;margin-top:6px;">${esc(p.description)}</div>` : ''}
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center;">
        ${st === 'aberta' ? `
          <button type="button" class="btn btn-sm btn-primary" style="font-size:12px;font-weight:700;background:#15803d;border-color:#15803d;color:#fff;"
            data-pend-id="${idAttr}" onclick="EsteiraPendencias.openResolve(this.getAttribute('data-pend-id'))">Resolvido</button>
          <button type="button" class="btn btn-sm btn-outline" style="font-size:11px;"
            data-pend-id="${idAttr}" onclick="EsteiraPendencias.openResolve(this.getAttribute('data-pend-id'), { viewOnly: true })">Ver histórico</button>
          ${canBlock && !blocked ? `<button type="button" class="btn btn-sm" style="font-size:11px;background:#b91c1c;color:#fff;border:none;"
            data-pend-id="${idAttr}" onclick="EsteiraPendencias.block(this.getAttribute('data-pend-id'))">Bloquear</button>` : ''}
          ${canUnlock && blocked ? `<button type="button" class="btn btn-sm btn-primary" style="font-size:11px;"
            data-pend-id="${idAttr}" onclick="EsteiraPendencias.unlock(this.getAttribute('data-pend-id'))">Desbloquear</button>` : ''}
        ` : `
          <span class="badge" style="font-size:11px;background:#dcfce7;color:#166534;border:none;">${esc(st === 'resolvida' ? 'Resolvida' : st)}</span>
          <button type="button" class="btn btn-sm btn-outline" style="font-size:11px;"
            data-pend-id="${idAttr}" onclick="EsteiraPendencias.openResolve(this.getAttribute('data-pend-id'), { viewOnly: true })">Ver histórico</button>
          ${canBlock && done ? `<button type="button" class="btn btn-sm" style="font-size:11px;background:#7f1d1d;color:#fff;border:none;"
            data-pend-id="${idAttr}" onclick="EsteiraPendencias.remove(this.getAttribute('data-pend-id'))">Excluir</button>` : ''}`}
      </div>
    </div>`;
  }

  async function renderEsteira() {
    const root = document.getElementById('pendCols');
    if (!root || typeof DB === 'undefined') return;
    const actor = session();
    const users = await loadUsers();
    let rows = [];
    try {
      rows = await DB.getVendorPendencias({ limit: 500 });
    } catch (e) {
      root.innerHTML = `<p style="color:#b91c1c;">Erro ao carregar: ${esc(e.message || e)}</p>`;
      return;
    }
    rows = filterVisible(rows, actor, users);
    try { await enrichPendenciasWithClients(rows); } catch { /* ignore */ }
    const abertas = rows.filter((p) => p.status === 'aberta' && !isOverdue(p));
    const atraso = rows.filter((p) => p.status === 'aberta' && isOverdue(p));
    const bloqueados = rows.filter((p) => {
      if (p.status !== 'aberta') return false;
      const v = userById(users, p.vendor_id);
      return v && DB.isPendencyBlocked(v);
    });
    const resolvidas = rows.filter((p) => p.status === 'resolvida' || p.status === 'cancelada').slice(0, 40);

    const col = (title, list, color) => `
      <div>
        <div style="font-weight:700;font-size:12px;margin-bottom:8px;color:${color};">${esc(title)} (${list.length})</div>
        <div>${list.length ? list.map((p) => cardHtml(p, users)).join('') : '<p style="font-size:12px;color:var(--color-text-muted);">Vazio</p>'}</div>
      </div>`;

    root.innerHTML = col('Abertas', abertas, '#2563eb')
      + col('Em atraso', atraso, '#b91c1c')
      + col('Bloqueados', bloqueados, '#7f1d1d')
      + col('Resolvidas', resolvidas, '#15803d');
  }

  function ensureEsteiraSection() {
    const main = contentRoot();
    if (!main) return false;
    let sec = document.getElementById('secEsteiraPendencias');
    if (!sec) {
      sec = document.createElement('section');
      sec.className = 'section';
      sec.id = 'secEsteiraPendencias';
      main.appendChild(sec);
    }
    sec.style.removeProperty('display');
    // Recria se faltar esteira ou campos Nome/CPF do lançamento (evita modal antigo em cache).
    if (!document.getElementById('pendCols')
      || !document.getElementById('pendClientName')
      || !document.getElementById('pendClientCpf')) {
      sec.innerHTML = sectionHtml();
    }
    ensureNav();
    return true;
  }

  function ensureMinhasSection() {
    const main = contentRoot();
    if (!main) return false;
    let sec = document.getElementById('secMinhasPendencias');
    if (!sec) {
      sec = document.createElement('section');
      sec.className = 'section';
      sec.id = 'secMinhasPendencias';
      main.appendChild(sec);
    }
    sec.style.removeProperty('display');
    sec.innerHTML = `
      <div class="card card-padded" style="padding:16px;">
        <h2 style="margin:0 0 8px;font-size:18px;">Minhas pendências</h2>
        <p style="font-size:13px;color:var(--color-text-muted);margin:0 0 12px;">
          Resolva antes do prazo. Em atraso, a digitação de propostas fica bloqueada até o supervisor liberar.
        </p>
        <div id="pendMinhasList"></div>
      </div>`;
    return true;
  }

  async function renderMinhas() {
    const box = document.getElementById('pendMinhasList');
    const u = session();
    if (!box || !u?.id || typeof DB === 'undefined') return;
    let rows = [];
    try {
      rows = await DB.getVendorPendencias({ vendorId: u.id, status: ['aberta', 'resolvida'], limit: 100 });
    } catch (e) {
      box.innerHTML = `<p style="color:#b91c1c;">${esc(e.message || e)}</p>`;
      return;
    }
    try { await enrichPendenciasWithClients(rows); } catch { /* ignore */ }
    const open = rows.filter((p) => p.status === 'aberta');
    const done = rows.filter((p) => p.status === 'resolvida').slice(0, 10);
    if (!open.length && !done.length) {
      box.innerHTML = '<p style="color:var(--color-text-muted);">Nenhuma pendência no momento.</p>';
      return;
    }
    box.innerHTML = open.map((p) => {
      const cli = clientLabel(p);
      const cpf = cpfLabel(p);
      const propRef = fmtProposalRef(p);
      return `
      <div class="card" style="padding:12px;margin-bottom:8px;border-left:4px solid ${isOverdue(p) ? '#b91c1c' : '#2563eb'};">
        <div style="font-weight:700;">${esc(p.title)} ${isOverdue(p) ? '<span style="color:#b91c1c;">(ATRASADA)</span>' : ''}</div>
        <div style="font-size:12px;margin-top:4px;line-height:1.45;">
          <div><span style="color:var(--color-text-muted);">Cliente:</span> <strong>${esc(cli || '—')}</strong></div>
          <div><span style="color:var(--color-text-muted);">CPF:</span> <strong>${esc(cpf || '—')}</strong></div>
          <div><span style="color:var(--color-text-muted);">Proposta:</span> <strong>${esc(propRef || '—')}</strong></div>
          <div style="color:var(--color-text-muted);">Prazo: ${esc(fmtDt(p.due_at))}</div>
        </div>
        ${p.description ? `<p style="font-size:13px;margin:8px 0;">${esc(p.description)}</p>` : ''}
        <div class="form-group" style="margin-top:8px;">
          <label>Nota da tratativa</label>
          <textarea id="pendNote_${esc(p.id)}" class="form-control" rows="2" placeholder="Descreva o que foi feito"></textarea>
        </div>
        <button type="button" class="btn btn-primary" style="margin-top:6px;" onclick="EsteiraPendencias.resolve('${esc(p.id)}', true)">Marcar como resolvida</button>
      </div>`;
    }).join('')
      + (done.length ? `<h3 style="font-size:14px;margin:16px 0 8px;">Resolvidas</h3>`
        + done.map((p) => `<div style="font-size:12px;padding:6px 0;border-bottom:1px solid var(--color-border,#eee);">${esc(p.title)} · ${esc(clientLabel(p) || '—')} · ${esc(fmtDt(p.resolved_at))}</div>`).join('')
        : '');
  }

  /* ── Ações ── */

  async function applyAutoBlocks() {
    if (typeof DB === 'undefined') return;
    const actor = session();
    if (!canAccessEsteira(actor) && roleOf(actor) !== 'employee' && roleOf(actor) !== 'vendedor') {
      /* vendedor também dispara auto-block no próprio boot */
    }
    let rows = [];
    try {
      rows = await DB.getVendorPendencias({ status: 'aberta', limit: 500 });
    } catch {
      return;
    }
    const users = await loadUsers();
    for (const p of rows) {
      if (!isOverdue(p)) continue;
      if (PILOT_MODE && !isPilotVendor(p.vendor_id)) continue;
      const vendor = userById(users, p.vendor_id);
      if (!vendor) continue;
      if (DB.isPendencyBlocked(vendor)) continue;
      try {
        await DB.setPendencyBlock(p.vendor_id, { by: 'system', pendenciaId: p.id });
        const hist = pushHistory(p, 'bloqueio_auto', 'system', 'Prazo de 1 dia útil esgotado');
        await DB.updateVendorPendencia(p.id, {
          blocked_at: (typeof nowBrazilSql === 'function' ? nowBrazilSql() : null),
          block_reason: 'Prazo de 1 dia útil esgotado',
          history: hist,
        });
        vendor.pendency_block_active = true;
        console.info(TAG, 'auto-block', p.vendor_id, p.id);
      } catch (e) {
        console.warn(TAG, 'auto-block fail', e);
      }
    }
  }

  async function refreshVendorGate() {
    const u = session();
    if (!u?.id || typeof DB === 'undefined') return;
    const r = roleOf(u);
    if (!['employee', 'vendedor', 'parceiro'].includes(r) && r !== '') {
      /* ainda mostra se for employee page */
      if (!/employee\.html/i.test(location.pathname) && r !== 'employee' && r !== 'vendedor') {
        /* gestão: só auto-block */
        await applyAutoBlocks();
        return;
      }
    }
    await applyAutoBlocks();
    let fresh = u;
    try {
      fresh = await DB.getUser(u.id, true) || u;
    } catch { /* keep session */ }
    let rows = [];
    try {
      rows = await DB.getVendorPendencias({ vendorId: u.id, status: 'aberta', limit: 50 });
      await enrichPendenciasWithClients(rows);
    } catch { /* noop */ }
    const blocked = typeof DB.isPendencyBlocked === 'function' ? DB.isPendencyBlocked(fresh) : false;
    renderVendorBanner(rows, blocked);

    /* Lembretes boleto a cada 2 dias */
    try {
      const rems = await DB.getProposalReminders({ vendorId: u.id, kind: 'boleto_validado', activeOnly: true });
      const due = [];
      const now = Date.now();
      for (const rem of rems || []) {
        const last = rem.last_reminded_at ? parseDueMs(rem.last_reminded_at) : 0;
        const created = rem.created_at ? parseDueMs(rem.created_at) : 0;
        const base = last || created;
        if (!base || (now - base) >= BOLETO_DAYS * 24 * 60 * 60 * 1000) {
          due.push(rem);
          try {
            await DB.updateProposalReminder(rem.id, {
              last_reminded_at: (typeof nowBrazilSql === 'function' ? nowBrazilSql() : null),
            });
          } catch { /* noop */ }
        }
      }
      renderBoletoBanner(due.length ? due : (rems || []).filter((r) => {
        const last = r.last_reminded_at ? parseDueMs(r.last_reminded_at) : 0;
        return last && (now - last) < 12 * 60 * 60 * 1000;
      }));
      if (due.length && typeof showToast === 'function') {
        showToast('Lembrete: mantenha contato com o cliente (boleto validado).', 'warning');
      }
    } catch (e) {
      console.warn(TAG, 'boleto remind', e);
    }
  }

  /**
   * assertCanEditProposals — usado por Proposals._assertCanCreateProposal.
   * Retorna false + alerta vermelho se bloqueado.
   */
  async function assertCanEditProposals() {
    const u = session();
    if (!u?.id || typeof DB === 'undefined') return true;
    let fresh = u;
    try { fresh = await DB.getUser(u.id, true) || u; } catch { /* noop */ }
    if (!DB.isPendencyBlocked(fresh)) return true;
    let rows = [];
    try {
      rows = await DB.getVendorPendencias({ vendorId: u.id, status: 'aberta', limit: 20 });
      await enrichPendenciasWithClients(rows);
    } catch { /* noop */ }
    renderVendorBanner(rows, true);
    const titles = (rows || []).map((p) => p.title).filter(Boolean).slice(0, 5).join('; ');
    alert('Bloqueado por pendência em atraso.\n\n'
      + (titles ? `Pendências: ${titles}\n\n` : '')
      + 'Resolva com o backoffice e peça liberação ao seu supervisor.');
    return false;
  }

  const EsteiraPendencias = {
    PILOT_VENDOR_IDS,
    PILOT_MODE,

    async init() {
      if (_booting) return;
      _booting = true;
      try {
        const u = session();
        if (canAccessEsteira(u)) {
          ensureNav();
          ensureEsteiraSection();
        }
        await refreshVendorGate();
        if (_timer) clearInterval(_timer);
        _timer = setInterval(() => { refreshVendorGate().catch(() => {}); }, POLL_MS);
      } finally {
        _booting = false;
      }
    },

    openEsteira() {
      if (!canAccessEsteira(session())) {
        alert('Sem permissão para a esteira de pendências.');
        return;
      }
      ensureEsteiraSection();
      goSection('secEsteiraPendencias');
      renderEsteira();
    },

    openMinhas() {
      ensureMinhasSection();
      goSection('secMinhasPendencias');
      renderMinhas();
    },

    async openLaunch() {
      if (!canLaunch(session())) {
        alert('Só backoffice/master lança pendência.');
        return;
      }
      // Sempre remonta o modal com Nome/CPF (evita HTML antigo preso no DOM).
      const sec = document.getElementById('secEsteiraPendencias');
      if (sec) sec.innerHTML = sectionHtml();
      else ensureEsteiraSection();
      const sel = document.getElementById('pendVendorSel');
      const users = await loadUsers();
      const pilots = users.filter((u) => {
        const r = String(u.role || '').toLowerCase();
        return isPilotVendor(u.id) && u.active !== false && ['employee', 'vendedor', 'parceiro'].includes(r);
      });
      if (sel) {
        sel.innerHTML = pilots.length
          ? pilots.map((u) => `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.email || '')})</option>`).join('')
          : '<option value="">Nenhum vendedor encontrado</option>';
      }
      renderEsteira().catch(() => {});
      if (typeof openModal === 'function') openModal('pendLaunchModal');
      else document.getElementById('pendLaunchModal')?.classList.add('open');
    },

    closeLaunch() {
      if (typeof closeModal === 'function') closeModal('pendLaunchModal');
      else document.getElementById('pendLaunchModal')?.classList.remove('open');
    },

    /**
     * lookupProposal — ao sair do campo proposta, preenche o nome do cliente.
     */
    async lookupProposal() {
      const ref = String(document.getElementById('pendPropId')?.value || '').trim();
      const hint = document.getElementById('pendPropHint');
      const nameEl = document.getElementById('pendClientName');
      const cpfEl = document.getElementById('pendClientCpf');
      if (!ref) {
        if (hint) hint.textContent = '';
        return;
      }
      if (typeof DB === 'undefined' || !DB.findProposalByRef) {
        if (hint) hint.textContent = 'Preencha nome e CPF do cliente.';
        return;
      }
      if (hint) hint.textContent = 'Buscando proposta…';
      try {
        const prop = await DB.findProposalByRef(ref);
        if (!prop) {
          if (hint) hint.textContent = 'Proposta não encontrada — preencha nome e CPF manualmente.';
          return;
        }
        const name = String(prop.client_name || prop.clientName || '').trim();
        const cpf = fmtCpf(prop.client_cpf || prop.clientCpf || '');
        if (name && nameEl) nameEl.value = name;
        if (cpf && cpfEl) cpfEl.value = cpf;
        if (hint) {
          hint.textContent = `Encontrada: ${name || 'sem nome'}${cpf ? ' · CPF ' + cpf : ''} · ${prop.product || prop.status || ''}`.trim();
        }
      } catch (e) {
        if (hint) hint.textContent = 'Falha ao buscar: preencha nome e CPF manualmente.';
      }
    },

    async submitLaunch() {
      const actor = session();
      if (!canLaunch(actor)) return;
      const vendorId = document.getElementById('pendVendorSel')?.value;
      const title = String(document.getElementById('pendTitle')?.value || '').trim();
      const description = String(document.getElementById('pendDesc')?.value || '').trim();
      const proposalId = String(document.getElementById('pendPropId')?.value || '').trim() || null;
      let clientName = String(document.getElementById('pendClientName')?.value || '').trim() || null;
      let clientCpf = onlyDigits(document.getElementById('pendClientCpf')?.value || '');
      if (!vendorId || !title) {
        alert('Selecione o vendedor e informe o título.');
        return;
      }
      if (!isPilotVendor(vendorId)) {
        alert('Este vendedor não está liberado na esteira.');
        return;
      }
      if (proposalId && typeof DB !== 'undefined' && DB.findProposalByRef) {
        try {
          const prop = await DB.findProposalByRef(proposalId);
          if (prop) {
            if (!clientName) clientName = String(prop.client_name || prop.clientName || '').trim() || null;
            if (!clientCpf) clientCpf = onlyDigits(prop.client_cpf || prop.clientCpf || '');
          }
        } catch { /* segue com o que o BO digitou */ }
      }
      if (!clientName) {
        alert('Informe o nome do cliente.');
        return;
      }
      if (clientCpf.length !== 11) {
        alert('Informe o CPF do cliente com 11 dígitos.');
        return;
      }
      const users = await loadUsers();
      const vendor = userById(users, vendorId);
      try {
        await DB.addVendorPendencia({
          vendor_id: vendorId,
          vendor_name: vendor?.name || null,
          supervisor_id: vendor?.admin_id || null,
          opened_by: actor.id,
          opened_by_name: actor.name || null,
          due_at: nextBusinessDayDueAt(brTodayYmd()),
          title,
          description,
          proposal_id: proposalId,
          client_name: clientName,
          client_cpf: clientCpf,
        });
        this.closeLaunch();
        if (typeof showToast === 'function') showToast('Pendência lançada.', 'success');
        await renderEsteira();
      } catch (e) {
        alert('Erro ao lançar: ' + (e.message || e));
      }
    },

    /**
     * remove — exclui pendência resolvida/cancelada da esteira (hard delete).
     */
    async remove(id) {
      const actor = session();
      if (!canAccessEsteira(actor) || !id) return;
      if (!confirm('Excluir esta pendência definitivamente?')) return;
      try {
        const p = await fetchPendencia(id);
        if (!p) { alert('Pendência não encontrada.'); return; }
        const st = String(p.status || '');
        if (st !== 'resolvida' && st !== 'cancelada') {
          alert('Só é possível excluir pendências resolvidas ou canceladas.');
          return;
        }
        await DB.deleteVendorPendencia(id);
        if (typeof showToast === 'function') showToast('Pendência excluída.', 'success');
        await renderEsteira();
      } catch (e) {
        alert('Erro ao excluir: ' + (e.message || e));
      }
    },

    closeResolveModal() {
      if (typeof closeModal === 'function') closeModal('pendResolveModal');
      else document.getElementById('pendResolveModal')?.classList.remove('open');
      const btn = document.getElementById('pendResolveConfirmBtn');
      if (btn) btn.onclick = null;
    },

    /**
     * openResolve — abre popup com resumo + histórico do que aconteceu.
     * viewOnly: só consulta (sem botão confirmar). Senão confirma “Resolvido”.
     */
    async openResolve(id, opts = {}) {
      const actor = session();
      if (!actor?.id || !id) return;
      const viewOnly = !!(opts && opts.viewOnly);
      const p = await fetchPendencia(id);
      if (!p) {
        alert('Pendência não encontrada.');
        return;
      }
      const modal = ensureResolveModal();
      const sum = document.getElementById('pendResolveSummary');
      const histEl = document.getElementById('pendResolveHistory');
      const noteEl = document.getElementById('pendResolveNote');
      const confBtn = document.getElementById('pendResolveConfirmBtn');
      const titleEl = modal.querySelector('.modal-header h3');
      if (titleEl) titleEl.textContent = viewOnly ? 'Histórico da pendência' : 'Marcar como resolvida';
      if (sum) {
        sum.innerHTML = `
          <div><strong>${esc(p.title)}</strong></div>
          <div style="margin-top:4px;color:var(--color-text-muted);font-size:12px;">
            Cliente: <strong style="color:var(--color-text);">${esc(clientLabel(p) || '—')}</strong>
            · CPF: <strong style="color:var(--color-text);">${esc(cpfLabel(p) || '—')}</strong>
          </div>
          <div style="margin-top:2px;color:var(--color-text-muted);font-size:12px;">
            Proposta: <strong style="color:var(--color-text);">${esc(fmtProposalRef(p) || '—')}</strong>
            · Vendedor: ${esc(p.vendor_name || p.vendor_id || '—')}
            · Prazo: ${esc(fmtDt(p.due_at))}
          </div>
          ${p.description ? `<div style="margin-top:8px;">${esc(p.description)}</div>` : ''}
          <div style="margin-top:6px;font-size:12px;">Status atual: <strong>${esc(p.status || 'aberta')}</strong></div>`;
      }
      if (histEl) histEl.innerHTML = historyListHtml(p);
      if (noteEl) {
        noteEl.value = '';
        noteEl.style.display = viewOnly || String(p.status) !== 'aberta' ? 'none' : '';
        noteEl.previousElementSibling && (noteEl.previousElementSibling.style.display = noteEl.style.display);
      }
      if (confBtn) {
        if (viewOnly || String(p.status) !== 'aberta') {
          confBtn.style.display = 'none';
        } else {
          confBtn.style.display = '';
          confBtn.onclick = () => this.confirmResolve(id, false);
        }
      }
      if (typeof openModal === 'function') openModal('pendResolveModal');
      else modal.classList.add('open');
    },

    /**
     * confirmResolve — grava status resolvida após o usuário ver o histórico.
     */
    async confirmResolve(id, fromVendor) {
      const actor = session();
      if (!actor?.id || !id) return;
      let note = '';
      if (fromVendor) {
        note = String(document.getElementById('pendNote_' + id)?.value || '').trim();
      } else {
        note = String(document.getElementById('pendResolveNote')?.value || '').trim();
      }
      try {
        const p = await fetchPendencia(id);
        if (!p) { alert('Pendência não encontrada.'); return; }
        if (String(p.status) !== 'aberta') {
          alert('Esta pendência já não está aberta.');
          return;
        }
        const hist = pushHistory(p, 'resolvida', actor.name || actor.id, note);
        await DB.updateVendorPendencia(id, {
          status: 'resolvida',
          resolved_at: (typeof nowBrazilSql === 'function' ? nowBrazilSql() : null),
          resolved_by: actor.id,
          resolved_note: note || null,
          history: hist,
        });
        this.closeResolveModal();
        if (typeof showToast === 'function') showToast('Pendência resolvida.', 'success');
        if (fromVendor) await renderMinhas();
        else await renderEsteira();
        await refreshVendorGate();
      } catch (e) {
        alert('Erro: ' + (e.message || e));
      }
    },

    /** resolve — atalho: vendedor confirma direto; BO abre popup com histórico. */
    async resolve(id, fromVendor) {
      if (fromVendor) return this.confirmResolve(id, true);
      return this.openResolve(id);
    },

    async block(id) {
      const actor = session();
      if (!canAccessEsteira(actor)) return;
      const reason = prompt('Motivo do bloqueio:', 'Pendência em atraso') || 'Bloqueio manual';
      try {
        const p = await fetchPendencia(id);
        if (!p) { alert('Pendência não encontrada.'); return; }
        await DB.setPendencyBlock(p.vendor_id, { by: actor.id, pendenciaId: p.id });
        const hist = pushHistory(p, 'bloqueio', actor.name || actor.id, reason);
        await DB.updateVendorPendencia(id, {
          blocked_at: (typeof nowBrazilSql === 'function' ? nowBrazilSql() : null),
          block_reason: reason,
          history: hist,
        });
        _cacheUsers = null;
        await renderEsteira();
        if (typeof showToast === 'function') showToast('Vendedor bloqueado.', 'warning');
      } catch (e) {
        alert('Erro ao bloquear: ' + (e.message || e));
      }
    },

    async unlock(id) {
      const actor = session();
      const users = await loadUsers();
      try {
        const p = await fetchPendencia(id);
        if (!p) { alert('Pendência não encontrada.'); return; }
        const vendor = userById(users, p.vendor_id);
        if (!canUnlockVendor(actor, vendor)) {
          alert('Só o supervisor do vendedor, gerente ou master pode desbloquear.');
          return;
        }
        const note = prompt('Motivo da liberação:', 'Pendência tratada') || 'Liberado';
        await DB.clearPendencyBlock(p.vendor_id);
        const hist = pushHistory(p, 'desbloqueio', actor.name || actor.id, note);
        await DB.updateVendorPendencia(id, {
          unlocked_at: (typeof nowBrazilSql === 'function' ? nowBrazilSql() : null),
          unlocked_by: actor.id,
          unlock_note: note,
          history: hist,
        });
        _cacheUsers = null;
        await renderEsteira();
        if (typeof showToast === 'function') showToast('Vendedor liberado.', 'success');
      } catch (e) {
        alert('Erro ao desbloquear: ' + (e.message || e));
      }
    },

    assertCanEditProposals,
    refresh: refreshVendorGate,
    applyAutoBlocks,
  };

  window.EsteiraPendencias = EsteiraPendencias;

  function boot() {
    EsteiraPendencias.init().catch((e) => console.warn(TAG, e));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 800));
  } else {
    setTimeout(boot, 800);
  }
  window.addEventListener('soublu:session-ready', () => setTimeout(boot, 200));
})();
