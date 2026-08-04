/**
 * Alerta de novos pedidos do Clube (restaurante) para Master e Financeiro.
 * Notas estilo "folha de anotações" no mural + toast + som (Web Audio).
 * Cada nota vale por 24h a partir da criação do pedido.
 */
(function (g) {
  'use strict';

  const POLL_MS = 15000;
  const NOTE_TTL_MS = 24 * 60 * 60 * 1000;
  const SEEN_KEY = 'soublu_pedido_alert_seen_v2';
  const ALERT_ROLES = new Set(['master', 'fundador', 'admin', 'financeiro', 'financial']);

  let timer = null;
  let started = false;
  let audioUnlocked = false;
  let audioCtx = null;
  let lastToastAt = 0;

  function _role() {
    const s = (typeof Auth !== 'undefined' && Auth.getSession) ? Auth.getSession() : null;
    return String(s?.role || '').trim().toLowerCase();
  }

  function _canReceive() {
    return ALERT_ROLES.has(_role());
  }

  function _fmtMoney(v) {
    const n = Number(v) || 0;
    try {
      return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch (_) {
      return 'R$ ' + n.toFixed(2);
    }
  }

  function _fmtHora(iso) {
    try {
      const d = new Date(String(iso).replace(' ', 'T'));
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _orderAgeMs(v) {
    const t = Date.parse(String(v?.created_at || '').replace(' ', 'T'));
    return Number.isFinite(t) ? (Date.now() - t) : 0;
  }

  function _loadSeen() {
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch (_) {
      return new Set();
    }
  }

  function _saveSeen(set) {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-300)));
    } catch (_) { /* noop */ }
  }

  /* ── Som ── */

  function unlockAudio() {
    if (audioUnlocked) return;
    try {
      const Ctx = g.AudioContext || g.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = audioCtx || new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.01);
      audioUnlocked = true;
    } catch (_) { /* noop */ }
  }

  function playAlertSound() {
    try {
      unlockAudio();
      const Ctx = g.AudioContext || g.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = audioCtx || new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime;
      [0, 0.18, 0.36].forEach((delay, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = i === 1 ? 880 : 660;
        gain.gain.setValueAtTime(0.0001, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.12, now + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.16);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 0.18);
      });
    } catch (_) { /* noop */ }
  }

  /* ── Navegação ── */

  function ordersUrl() {
    if (typeof Auth !== 'undefined' && typeof Auth.pageHref === 'function') {
      return Auth.pageHref('clube-beneficios.html') + '#controle-pedidos';
    }
    const base = (typeof getBasePath === 'function' ? getBasePath() : '') || '';
    return (base.replace(/\/?$/, '/') + 'pages/clube-beneficios.html#controle-pedidos');
  }

  /* ── Notas (folha de anotações) ── */

  function ensureNoteStyles() {
    if (document.getElementById('pedidoAlertStyles')) return;
    const style = document.createElement('style');
    style.id = 'pedidoAlertStyles';
    style.textContent = `
      .pedido-notes {
        display: flex; flex-wrap: wrap; gap: 18px;
        margin: 4px 0 18px; padding: 4px 2px;
      }
      .pedido-note {
        position: relative;
        width: 230px; min-height: 150px;
        padding: 30px 16px 14px;
        background:
          repeating-linear-gradient(180deg, transparent 0 26px, rgba(30, 64, 175, 0.14) 26px 27px),
          linear-gradient(180deg, #fefce8 0%, #fef9c3 100%);
        border: 1px solid #fde68a;
        border-radius: 3px;
        box-shadow: 0 8px 16px rgba(15, 23, 42, 0.14), 0 2px 4px rgba(15, 23, 42, 0.08);
        transform: rotate(-1.2deg);
        font-family: 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive;
        color: #1e293b;
        transition: transform 0.15s;
      }
      .pedido-note:nth-child(even) { transform: rotate(1.1deg); }
      .pedido-note:hover { transform: rotate(0deg) scale(1.03); z-index: 2; }
      .pedido-note::before {
        content: '';
        position: absolute; top: -10px; left: 50%;
        width: 92px; height: 24px;
        transform: translateX(-50%) rotate(-2deg);
        background: rgba(148, 163, 184, 0.35);
        border-left: 1px dashed rgba(100, 116, 139, 0.4);
        border-right: 1px dashed rgba(100, 116, 139, 0.4);
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.1);
      }
      .pedido-note__title {
        margin: 0 0 6px; font-size: 14px; font-weight: 700; color: #9a3412;
        display: flex; align-items: center; gap: 6px;
      }
      .pedido-note__line { margin: 0; font-size: 13px; line-height: 27px; }
      .pedido-note__line strong { color: #0f172a; }
      .pedido-note__foot {
        display: flex; align-items: center; justify-content: space-between;
        margin-top: 8px; gap: 8px;
      }
      .pedido-note__time { font-size: 11px; color: #64748b; }
      .pedido-note__btn {
        border: none; cursor: pointer; border-radius: 6px;
        background: #0f172a; color: #fff;
        font-family: 'Nunito', 'Segoe UI', sans-serif;
        font-weight: 700; font-size: 12px; padding: 6px 12px;
      }
      .pedido-note__btn:hover { background: #ea580c; }
      .pedido-notes__label {
        width: 100%; margin: 0 0 2px;
        font-family: 'Nunito', 'Segoe UI', sans-serif;
        font-size: 12px; font-weight: 800; letter-spacing: 0.06em;
        text-transform: uppercase; color: #9a3412;
        display: flex; align-items: center; gap: 6px;
      }
    `;
    document.head.appendChild(style);
  }

  function renderNotes(pending) {
    ensureNoteStyles();
    const list = Array.isArray(pending) ? pending : [];
    let box = document.getElementById('pedidoAlertNotes');
    if (!list.length) {
      if (box) box.remove();
      return;
    }

    const cards = list.slice(0, 8).map((v) => `
      <div class="pedido-note" data-order-id="${_esc(v.id)}">
        <p class="pedido-note__title">🍔 Pedido novo!</p>
        <p class="pedido-note__line"><strong>${_esc(v.voucher_no || '')}</strong></p>
        <p class="pedido-note__line">${_esc(v.employee_name || 'Colaborador')}</p>
        <p class="pedido-note__line">Valor: <strong>${_fmtMoney(v.valor)}</strong></p>
        <div class="pedido-note__foot">
          <span class="pedido-note__time">hoje às ${_fmtHora(v.created_at)}</span>
          <button type="button" class="pedido-note__btn" onclick="PedidoAlert.goToOrders()">Verificar</button>
        </div>
      </div>
    `).join('');

    const html = `
      <p class="pedido-notes__label">📌 Pedidos aguardando verificação (some em 24h)</p>
      ${cards}
    `;

    if (!box) {
      box = document.createElement('div');
      box.id = 'pedidoAlertNotes';
      box.className = 'pedido-notes';
    }
    box.innerHTML = html;

    // Preferência: dentro do Mural da Empresa, acima dos avisos publicados
    const muralList = document.getElementById('painelSonhosAvisosList');
    const muralFeed = document.getElementById('painelSonhosAvisos');
    const fallback =
      document.querySelector('#painelSonhosRoot .painel-sonhos-wrap') ||
      document.getElementById('painelSonhosRoot') ||
      document.querySelector('#secInicio .page-content') ||
      document.getElementById('secInicio');

    if (muralList) {
      if (box.parentElement !== muralList.parentElement || box.nextElementSibling !== muralList) {
        muralList.parentElement.insertBefore(box, muralList);
      }
    } else if (muralFeed) {
      if (box.parentElement !== muralFeed) muralFeed.appendChild(box);
    } else if (fallback) {
      if (box.parentElement !== fallback) fallback.insertBefore(box, fallback.firstChild);
    } else if (!box.parentElement) {
      document.body.prepend(box);
    }
  }

  function goToOrders() {
    unlockAudio();
    g.location.href = ordersUrl();
  }

  /* ── Dados ── */

  async function fetchPendingOrders() {
    if (typeof supaReq !== 'function') return [];
    try {
      // Bust do cache do supaReq — sem isso o poll fica preso na lista antiga por 5 min
      if (typeof _cacheDel === 'function') {
        try { _cacheDel('beneficios_vouchers'); } catch (_) { /* noop */ }
      }
      const rows = await supaReq(
        'GET',
        'beneficios_vouchers',
        null,
        '?status=eq.em_analise&order=created_at.desc&limit=100'
      );
      return (Array.isArray(rows) ? rows : []).filter((v) => {
        const cat = String(v?.categoria || '').toLowerCase();
        if (cat && !cat.startsWith('aliment')) return false;
        return _orderAgeMs(v) < NOTE_TTL_MS;
      });
    } catch (e) {
      console.warn('[PedidoAlert]', e?.message || e);
      return [];
    }
  }

  function notifyNew(orders) {
    if (!orders.length) return;
    const now = Date.now();
    if (now - lastToastAt < 4000) return;
    lastToastAt = now;
    playAlertSound();
    const first = orders[0];
    const msg = orders.length === 1
      ? `Novo pedido ${first.voucher_no || ''} — ${first.employee_name || ''} (${_fmtMoney(first.valor)}). Verifique no Controle de Pedidos.`
      : `${orders.length} novos pedidos no Clube Benefícios. Verifique no Controle de Pedidos.`;
    if (typeof showToast === 'function') showToast(msg, 'warning', 8000);
  }

  async function tick(isFirst) {
    if (!_canReceive()) return;
    const pending = await fetchPendingOrders();
    renderNotes(pending);
    const seen = _loadSeen();
    const fresh = pending.filter((o) => o?.id && !seen.has(String(o.id)));
    pending.forEach((o) => { if (o?.id) seen.add(String(o.id)); });
    _saveSeen(seen);
    if (fresh.length && !isFirst) notifyNew(fresh);
  }

  function start() {
    if (started || !_canReceive()) return;
    started = true;
    const unlockOnce = () => unlockAudio();
    document.addEventListener('click', unlockOnce, { once: true, passive: true });
    document.addEventListener('keydown', unlockOnce, { once: true, passive: true });
    tick(true);
    timer = setInterval(() => tick(false), POLL_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) tick(false);
    });
    console.info('[PedidoAlert] monitorando pedidos do Clube para', _role());
  }

  g.PedidoAlert = {
    start,
    tick,
    playAlertSound,
    unlockAudio,
    goToOrders,
  };

  function boot() {
    let tries = 0;
    const tryStart = () => {
      if (_canReceive()) { start(); return; }
      if (++tries < 40) setTimeout(tryStart, 1500);
    };
    tryStart();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 1200));
  } else {
    setTimeout(boot, 1200);
  }
})(typeof window !== 'undefined' ? window : globalThis);
