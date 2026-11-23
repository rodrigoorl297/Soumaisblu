/**
 * ConsigBot — assistente de roteiros (Sou+Blu).
 * Liberado para qualquer usuário autenticado (id na sessão).
 * API via /api/consigbot.php (proxy HTTPS→VPS).
 */
(function (g) {
  'use strict';

  const API_URL = '/api/consigbot.php';
  let chatHistory = [];

  function _session() {
    try {
      if (typeof Auth !== 'undefined' && Auth.getSession) return Auth.getSession();
    } catch (_) { /* noop */ }
    return null;
  }

  /**
   * canUseConsigBot — FAB do assistente para todo mundo logado.
   * Basta ter sessão com id (qualquer cargo).
   */
  function canUseConsigBot(user) {
    if (!user) return false;
    return !!(user.id || user.email);
  }

  function _esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureCss() {
    if (document.getElementById('consigbotCss')) return;
    const link = document.createElement('link');
    link.id = 'consigbotCss';
    link.rel = 'stylesheet';
    const src = document.querySelector('script[src*="consigbot.js"]')?.getAttribute('src') || '../js/consigbot.js';
    link.href = src.replace(/js\/consigbot\.js[^?]*/, 'css/consigbot.css').replace(/(\?.*)?$/, '?v=cb-all1');
    document.head.appendChild(link);
  }

  function mount() {
    if (document.getElementById('consigbotFab')) return;
    ensureCss();

    const fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'consigbotFab';
    fab.className = 'consigbot-fab';
    fab.setAttribute('aria-label', 'Abrir Assistente de Vendas IA');
    fab.innerHTML = '<span class="consigbot-fab__icon" aria-hidden="true">💬</span><span class="consigbot-fab__label">Assistente</span>';

    const panel = document.createElement('div');
    panel.id = 'consigbotPanel';
    panel.className = 'consigbot-panel is-hidden';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Assistente de Vendas IA');
    panel.innerHTML = `
      <div class="consigbot-head">
        <h3>Assistente de Vendas IA</h3>
        <button type="button" class="consigbot-close" id="consigbotClose" aria-label="Fechar">✖</button>
      </div>
      <div class="consigbot-messages" id="consigbotMessages">
        <div class="consigbot-msg bot">Olá! Sou seu assistente de vendas. Como posso ajudar você com o roteiro hoje?</div>
      </div>
      <form class="consigbot-compose" id="consigbotForm">
        <input type="text" id="consigbotInput" maxlength="2000" placeholder="Digite sua dúvida..." autocomplete="off" />
        <button type="submit">Enviar</button>
      </form>
    `;

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    const open = () => panel.classList.remove('is-hidden');
    const close = () => panel.classList.add('is-hidden');
    fab.addEventListener('click', () => {
      if (panel.classList.contains('is-hidden')) open();
      else close();
    });
    document.getElementById('consigbotClose')?.addEventListener('click', close);
    document.getElementById('consigbotForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      sendMessage();
    });
  }

  function addMessage(text, sender) {
    const box = document.getElementById('consigbotMessages');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'consigbot-msg ' + (sender === 'user' ? 'user' : 'bot');
    el.innerHTML = _esc(text).replace(/\n/g, '<br>');
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
  }

  function addLoading() {
    const id = 'cbl-' + Date.now();
    const box = document.getElementById('consigbotMessages');
    if (!box) return id;
    const el = document.createElement('div');
    el.id = id;
    el.className = 'consigbot-loading';
    el.textContent = 'Assistente digitando…';
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
    return id;
  }

  function removeLoading(id) {
    document.getElementById(id)?.remove();
  }

  async function sendMessage() {
    const input = document.getElementById('consigbotInput');
    const text = String(input?.value || '').trim();
    if (!text) return;
    input.value = '';
    addMessage(text, 'user');
    const loadingId = addLoading();
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ message: text, history: chatHistory }),
      });
      const data = await res.json().catch(() => ({}));
      removeLoading(loadingId);
      if (data.reply) {
        addMessage(data.reply, 'bot');
        chatHistory.push({ role: 'user', parts: [{ text }] });
        chatHistory.push({ role: 'model', parts: [{ text: data.reply }] });
        if (chatHistory.length > 10) chatHistory = chatHistory.slice(-10);
      } else {
        addMessage(data.error || 'Não consegui obter resposta do assistente.', 'bot');
      }
    } catch (err) {
      removeLoading(loadingId);
      addMessage('Erro de conexão com o assistente. Tente de novo.', 'bot');
      console.warn('[ConsigBot]', err);
    }
  }

  function boot() {
    const tryInit = () => {
      const s = _session();
      if (!s?.id) {
        setTimeout(tryInit, 500);
        return;
      }
      if (!canUseConsigBot(s)) return;
      mount();
    };
    tryInit();
  }

  g.ConsigBot = { canUse: canUseConsigBot, boot, mount };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
