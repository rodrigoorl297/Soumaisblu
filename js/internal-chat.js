/* Chat interno 1-a-1 — só entre usuários logados (sem WhatsApp/número). */
(function (g) {
  'use strict';

  const POLL_MS_IDLE = 5000;
  const POLL_MS_OPEN = 2500;
  /** Horário do chat interno: sempre America/Sao_Paulo. */
  const TZ = 'America/Sao_Paulo';
  let _me = null;
  let _users = [];
  let _threads = [];
  let _activeThread = null;
  let _activePeer = null;
  let _tab = 'chats';
  let _pollTimer = null;
  let _unread = 0;
  /** fingerprint last_message_at|preview por thread — detecta msg nova */
  let _threadFp = Object.create(null);

  function _esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _id(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function _initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function _pairKey(a, b) {
    const x = String(a);
    const y = String(b);
    return x < y ? `${x}__${y}` : `${y}__${x}`;
  }

  /**
   * DATETIME para o chat.
   * Grava parede America/Sao_Paulo (−03:00; Brasil sem DST desde 2019).
   */
  function _nowSpMysql() {
    const parts = {};
    for (const p of new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date())) {
      if (p.type !== 'literal') parts[p.type] = p.value;
    }
    const hour = parts.hour === '24' ? '00' : parts.hour;
    return `${parts.year}-${parts.month}-${parts.day} ${hour}:${parts.minute}:${parts.second}`;
  }

  /**
   * Parse DATETIME do chat como América/São Paulo (−03:00).
   * Legado toISOString()-sem-Z era UTC: escolhe a interpretação mais próxima
   * de "agora" (UTC vs SP), o que corrige msgs antigas e novas.
   */
  function _parseChatDt(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    const normalized = s.includes('T') ? s : s.replace(' ', 'T');
    if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(normalized)) {
      const d = new Date(normalized);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(normalized)) {
      const d = new Date(normalized);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const asSp = new Date(`${normalized}-03:00`);
    const asUtc = new Date(`${normalized}Z`);
    if (Number.isNaN(asSp.getTime()) && Number.isNaN(asUtc.getTime())) return null;
    if (Number.isNaN(asSp.getTime())) return asUtc;
    if (Number.isNaN(asUtc.getTime())) return asSp;
    const now = Date.now();
    return Math.abs(asUtc.getTime() - now) < Math.abs(asSp.getTime() - now) ? asUtc : asSp;
  }

  function _fmtTime(raw) {
    if (!raw) return '';
    try {
      const d = _parseChatDt(raw);
      if (!d) return '';
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: TZ,
      });
    } catch (_) {
      return '';
    }
  }

  function _sessionUser() {
    try {
      if (typeof Auth !== 'undefined' && Auth.getSession) return Auth.getSession();
    } catch (_) { /* noop */ }
    return null;
  }

  function _isUserActive(u) {
    const a = u?.active;
    if (a === false || a === 0 || a === '0' || a === 'false' || a === 'inativo') return false;
    return true;
  }

  async function _loadUsers() {
    let list = [];
    try {
      if (typeof DB !== 'undefined' && typeof DB.getAllUsers === 'function') {
        list = await DB.getAllUsers(true).catch(() => null);
      }
      if (!Array.isArray(list) && typeof DB !== 'undefined' && typeof DB.getUsers === 'function') {
        list = await DB.getUsers().catch(() => null);
      }
      if (!Array.isArray(list) && typeof supaReq === 'function') {
        list = await supaReq(
          'GET',
          'users',
          null,
          '?select=id,name,email,role,active,department,photo_url&order=name.asc&limit=1000'
        ).catch(() => []);
      }
    } catch (e) {
      console.warn('[InternalChat] load users:', e?.message || e);
      list = [];
    }
    if (!Array.isArray(list)) list = [];
    const meId = String(_me?.id || '');
    _users = list.filter((u) => {
      if (!u?.id) return false;
      if (meId && String(u.id) === meId) return false;
      if (!_isUserActive(u)) return false;
      const name = String(u.name || '').trim();
      return !!name;
    });
    _users.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
  }

  async function _loadThreads() {
    if (!_me?.id || typeof supaReq !== 'function') {
      _threads = [];
      return 0;
    }
    const uid = encodeURIComponent(_me.id);
    const [a, b] = await Promise.all([
      supaReq('GET', 'internal_chat_threads', null, `?user_a_id=eq.${uid}&order=last_message_at.desc&limit=100`).catch(() => []),
      supaReq('GET', 'internal_chat_threads', null, `?user_b_id=eq.${uid}&order=last_message_at.desc&limit=100`).catch(() => []),
    ]);
    const map = new Map();
    [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].forEach((t) => {
      if (t?.id) map.set(t.id, t);
    });
    _threads = [...map.values()].sort((x, y) => {
      const tx = _parseChatDt(x.last_message_at || x.updated_at)?.getTime() || 0;
      const ty = _parseChatDt(y.last_message_at || y.updated_at)?.getTime() || 0;
      return ty - tx;
    });

    let arrived = 0;
    const nextFp = Object.create(null);
    for (const t of _threads) {
      const fp = `${t.last_message_at || ''}|${t.last_preview || ''}`;
      nextFp[t.id] = fp;
      const prev = _threadFp[t.id];
      if (prev && prev !== fp && String(_activeThread?.id) !== String(t.id)) {
        arrived += 1;
      }
    }
    _threadFp = nextFp;
    if (arrived > 0) _setUnread(_unread + arrived);
    return arrived;
  }

  function _peerFromThread(t) {
    if (!t || !_me) return { id: '', name: '—' };
    if (String(t.user_a_id) === String(_me.id)) {
      return { id: t.user_b_id, name: t.user_b_name || 'Colega' };
    }
    return { id: t.user_a_id, name: t.user_a_name || 'Colega' };
  }

  function _ensureDom() {
    if (document.getElementById('ichatPanel')) return;
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'ichatFab';
    fab.className = 'ichat-fab';
    fab.title = 'Chat interno';
    fab.setAttribute('aria-label', 'Abrir chat interno');
    const chatIcon = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 18.5V7.8A2.8 2.8 0 0 1 7.8 5h8.4A2.8 2.8 0 0 1 19 7.8v6.4A2.8 2.8 0 0 1 16.2 17H9.2L5 19.8V18.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 10h6M9 13h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    fab.innerHTML = `${chatIcon}<span class="ichat-fab__badge" id="ichatBadge">0</span>`;
    fab.addEventListener('click', () => InternalChat.toggle());

    const panel = document.createElement('div');
    panel.id = 'ichatPanel';
    panel.className = 'ichat-panel';
    panel.innerHTML = `
      <div class="ichat-head">
        <div class="ichat-head__brand">
          <div class="ichat-head__mark">${chatIcon}</div>
          <div class="ichat-head__copy">
            <h3>Chat interno</h3>
          </div>
        </div>
        <button type="button" class="ichat-head__close" id="ichatClose" aria-label="Fechar">×</button>
      </div>
      <div class="ichat-tabs">
        <button type="button" class="is-active" data-ichat-tab="chats">Conversas</button>
        <button type="button" data-ichat-tab="people">Pessoas</button>
      </div>
      <div class="ichat-body" id="ichatHome">
        <input type="search" class="ichat-search" id="ichatSearch" placeholder="Buscar por nome…" autocomplete="off"/>
        <div class="ichat-list" id="ichatList"></div>
      </div>
      <div class="ichat-thread" id="ichatThread">
        <div class="ichat-thread__bar">
          <button type="button" class="ichat-thread__back" id="ichatBack" aria-label="Voltar">←</button>
          <div class="ichat-thread__peer">
            <div class="ichat-avatar" id="ichatThreadAvatar">?</div>
            <div>
              <div class="ichat-thread__title" id="ichatThreadTitle">Conversa</div>
              <div class="ichat-thread__status">Conversa privada</div>
            </div>
          </div>
        </div>
        <div class="ichat-msgs" id="ichatMsgs"></div>
        <form class="ichat-compose" id="ichatForm">
          <input type="text" id="ichatInput" maxlength="2000" placeholder="Escreva uma mensagem…" autocomplete="off"/>
          <button type="submit">Enviar</button>
        </form>
      </div>
    `;
    document.body.appendChild(fab);
    document.body.appendChild(panel);

    document.getElementById('ichatClose')?.addEventListener('click', () => InternalChat.close());
    document.getElementById('ichatBack')?.addEventListener('click', () => InternalChat.showHome());
    document.getElementById('ichatSearch')?.addEventListener('input', () => InternalChat.renderList());
    document.getElementById('ichatForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      InternalChat.send();
    });
    panel.querySelectorAll('[data-ichat-tab]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        _tab = btn.getAttribute('data-ichat-tab') || 'chats';
        panel.querySelectorAll('[data-ichat-tab]').forEach((b) => b.classList.toggle('is-active', b === btn));
        if (_tab === 'people' && !_users.length) {
          const listEl = document.getElementById('ichatList');
          if (listEl) listEl.innerHTML = '<div class="ichat-empty">Carregando pessoas…</div>';
          await _loadUsers();
        }
        InternalChat.renderList();
      });
    });
  }

  function _injectSidebar() {
    const nav = document.querySelector('.sidebar-nav');
    if (!nav || nav.querySelector('.ichat-nav-item')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-item ichat-nav-item';
    btn.innerHTML = '<span class="nav-icon">💬</span><span class="nav-label">Chat interno</span>';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      InternalChat.open();
    });
    const wa = document.getElementById('navWhatsApp');
    if (wa && wa.parentElement === nav) {
      wa.insertAdjacentElement('afterend', btn);
    } else {
      nav.appendChild(btn);
    }
  }

  function _setUnread(n) {
    _unread = Math.max(0, n | 0);
    const badge = document.getElementById('ichatBadge');
    if (!badge) return;
    if (_unread > 0) {
      badge.style.display = 'block';
      badge.textContent = String(_unread > 99 ? '99+' : _unread);
    } else {
      badge.style.display = 'none';
    }
  }

  const InternalChat = {
    async init() {
      _me = _sessionUser();
      if (!_me?.id) return;
      if (!document.getElementById('ichatCss')) {
        const link = document.createElement('link');
        link.id = 'ichatCss';
        link.rel = 'stylesheet';
        const base = (document.querySelector('script[src*="internal-chat.js"]')?.getAttribute('src') || '')
          .replace(/[^/]+$/, '')
          .replace(/\/js\/?$/, '/css/') || '../css/';
        link.href = (base.includes('css') ? base : '../css/') + 'internal-chat.css?v=ichat5';
        if (!/internal-chat\.css/.test(link.href)) link.href = '../css/internal-chat.css?v=ichat5';
        document.head.appendChild(link);
      }
      _ensureDom();
      _injectSidebar();
      await Promise.all([_loadUsers(), _loadThreads()]);
      this.renderList();
      this._startPoll();
    },

    async open() {
      const panel = document.getElementById('ichatPanel');
      if (!panel) return;
      panel.classList.add('is-open');
      _me = _sessionUser() || _me;
      if (!_users.length) {
        const listEl = document.getElementById('ichatList');
        if (_tab === 'people' && listEl) listEl.innerHTML = '<div class="ichat-empty">Carregando pessoas…</div>';
        await _loadUsers();
      }
      await this.refresh();
    },

    close() {
      document.getElementById('ichatPanel')?.classList.remove('is-open');
    },

    toggle() {
      const panel = document.getElementById('ichatPanel');
      if (!panel) return;
      if (panel.classList.contains('is-open')) this.close();
      else this.open();
    },

    showHome() {
      _activeThread = null;
      _activePeer = null;
      document.getElementById('ichatThread')?.classList.remove('is-open');
      document.getElementById('ichatHome')?.style && (document.getElementById('ichatHome').style.display = 'flex');
      const tabs = document.querySelector('.ichat-tabs');
      if (tabs) tabs.style.display = 'flex';
      this.renderList();
    },

    async refresh() {
      await Promise.all([_loadUsers(), _loadThreads()]);
      if (_activeThread?.id) {
        await this.openThread(_activeThread.id, _activePeer);
      } else {
        this.renderList();
      }
    },

    renderList() {
      const list = document.getElementById('ichatList');
      if (!list) return;
      const q = String(document.getElementById('ichatSearch')?.value || '').trim().toLowerCase();
      if (_tab === 'people') {
        const people = _users.filter((u) => !q || String(u.name || '').toLowerCase().includes(q)
          || String(u.department || '').toLowerCase().includes(q));
        if (!people.length) {
          list.innerHTML = _users.length
            ? '<div class="ichat-empty">Nenhuma pessoa com esse nome.</div>'
            : '<div class="ichat-empty">Não foi possível carregar a lista.<br/>Atualize a página (Ctrl+F5) e tente de novo.</div>';
          return;
        }
        list.innerHTML = people.map((u) => `
          <button type="button" class="ichat-row" data-peer-id="${_esc(u.id)}" data-peer-name="${_esc(u.name || '')}">
            <div class="ichat-avatar">${_esc(_initials(u.name))}</div>
            <div class="ichat-row__meta">
              <div class="ichat-row__name">${_esc(u.name || 'Sem nome')}</div>
              <div class="ichat-row__sub">${_esc(u.department || u.role || '')}</div>
            </div>
          </button>
        `).join('');
        list.querySelectorAll('[data-peer-id]').forEach((btn) => {
          btn.addEventListener('click', () => {
            this.startWith(btn.getAttribute('data-peer-id'), btn.getAttribute('data-peer-name'));
          });
        });
        return;
      }

      let rows = _threads;
      if (q) {
        rows = rows.filter((t) => {
          const peer = _peerFromThread(t);
          return String(peer.name || '').toLowerCase().includes(q)
            || String(t.last_preview || '').toLowerCase().includes(q);
        });
      }
      if (!rows.length) {
        list.innerHTML = '<div class="ichat-empty">Nenhuma conversa ainda.<br/>Abra a aba Pessoas para iniciar.</div>';
        return;
      }
      list.innerHTML = rows.map((t) => {
        const peer = _peerFromThread(t);
        return `
          <button type="button" class="ichat-row" data-thread-id="${_esc(t.id)}" data-peer-id="${_esc(peer.id)}" data-peer-name="${_esc(peer.name)}">
            <div class="ichat-avatar">${_esc(_initials(peer.name))}</div>
            <div class="ichat-row__meta">
              <div class="ichat-row__name">${_esc(peer.name)}</div>
              <div class="ichat-row__sub">${_esc(t.last_preview || 'Sem mensagens')} · ${_esc(_fmtTime(t.last_message_at))}</div>
            </div>
          </button>
        `;
      }).join('');
      list.querySelectorAll('[data-thread-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.openThread(
            btn.getAttribute('data-thread-id'),
            { id: btn.getAttribute('data-peer-id'), name: btn.getAttribute('data-peer-name') }
          );
        });
      });
    },

    async startWith(peerId, peerName) {
      if (!_me?.id || !peerId || String(peerId) === String(_me.id)) return;
      const key = _pairKey(_me.id, peerId);
      let thread = _threads.find((t) => t.pair_key === key);
      if (!thread) {
        const existing = await supaReq('GET', 'internal_chat_threads', null,
          `?pair_key=eq.${encodeURIComponent(key)}&limit=1`).catch(() => []);
        thread = Array.isArray(existing) && existing[0] ? existing[0] : null;
      }
      if (!thread) {
        const aFirst = String(_me.id) < String(peerId);
        const payload = {
          id: _id('ich_th_'),
          pair_key: key,
          user_a_id: aFirst ? _me.id : peerId,
          user_b_id: aFirst ? peerId : _me.id,
          user_a_name: aFirst ? (_me.name || '') : (peerName || ''),
          user_b_name: aFirst ? (peerName || '') : (_me.name || ''),
          last_message_at: null,
          last_preview: '',
        };
        const created = await supaReq('POST', 'internal_chat_threads', payload);
        thread = Array.isArray(created) ? created[0] : created;
        if (!thread?.id) thread = payload;
        await _loadThreads();
      }
      await this.openThread(thread.id, { id: peerId, name: peerName || 'Colega' });
    },

    async openThread(threadId, peer) {
      if (!threadId) return;
      _activeThread = _threads.find((t) => String(t.id) === String(threadId)) || { id: threadId };
      _activePeer = peer || _peerFromThread(_activeThread);
      const home = document.getElementById('ichatHome');
      const threadEl = document.getElementById('ichatThread');
      const tabs = document.querySelector('.ichat-tabs');
      if (home) home.style.display = 'none';
      if (tabs) tabs.style.display = 'none';
      threadEl?.classList.add('is-open');
      const title = document.getElementById('ichatThreadTitle');
      if (title) title.textContent = _activePeer?.name || 'Conversa';
      const av = document.getElementById('ichatThreadAvatar');
      if (av) av.textContent = _initials(_activePeer?.name || '?');
      await this.loadMessages();
      document.getElementById('ichatInput')?.focus();
    },

    async loadMessages() {
      const box = document.getElementById('ichatMsgs');
      if (!box || !_activeThread?.id) return;
      const rows = await supaReq('GET', 'internal_chat_messages', null,
        `?thread_id=eq.${encodeURIComponent(_activeThread.id)}&order=created_at.asc&limit=200`).catch(() => []);
      const msgs = Array.isArray(rows) ? rows : [];
      if (!msgs.length) {
        box.innerHTML = '<div class="ichat-empty">Digite a primeira mensagem.</div>';
        return;
      }
      box.innerHTML = msgs.map((m) => {
        const mine = String(m.sender_id) === String(_me.id);
        return `<div class="ichat-bubble ${mine ? 'ichat-bubble--me' : 'ichat-bubble--them'}">${_esc(m.body)}<span class="ichat-bubble__time">${_esc(_fmtTime(m.created_at))}</span></div>`;
      }).join('');
      box.scrollTop = box.scrollHeight;

      // marca como lidas as mensagens do outro
      const unread = msgs.filter((m) => String(m.sender_id) !== String(_me.id) && !m.read_at);
      for (const m of unread.slice(0, 40)) {
        try {
          await supaReq('PATCH', 'internal_chat_messages', {
            read_at: _nowSpMysql(),
          }, `?id=eq.${encodeURIComponent(m.id)}`);
        } catch (_) { /* noop */ }
      }
      _setUnread(0);
    },

    async send() {
      const input = document.getElementById('ichatInput');
      const body = String(input?.value || '').trim();
      if (!body || !_activeThread?.id || !_me?.id) return;
      input.value = '';
      const now = _nowSpMysql();
      const msg = {
        id: _id('ich_msg_'),
        thread_id: _activeThread.id,
        sender_id: _me.id,
        sender_name: _me.name || '',
        body: body.slice(0, 2000),
        created_at: now,
      };
      try {
        await supaReq('POST', 'internal_chat_messages', msg);
        await supaReq('PATCH', 'internal_chat_threads', {
          last_message_at: now,
          last_preview: body.slice(0, 180),
        }, `?id=eq.${encodeURIComponent(_activeThread.id)}`);
        await _loadThreads();
        await this.loadMessages();
      } catch (e) {
        alert('Não foi possível enviar: ' + (e.message || e));
        input.value = body;
      }
    },

    _startPoll() {
      if (_pollTimer) clearTimeout(_pollTimer);
      const tick = async () => {
        if (document.hidden) {
          _pollTimer = setTimeout(tick, POLL_MS_IDLE);
          return;
        }
        const panel = document.getElementById('ichatPanel');
        const open = !!panel?.classList.contains('is-open');
        try {
          await _loadThreads();
          if (open && _activeThread?.id) {
            await this.loadMessages();
          } else if (open) {
            this.renderList();
          }
        } catch (_) { /* noop */ }
        const ms = open ? POLL_MS_OPEN : POLL_MS_IDLE;
        _pollTimer = setTimeout(tick, ms);
      };
      _pollTimer = setTimeout(tick, 800);
    },
  };

  g.InternalChat = InternalChat;

  function boot() {
    const tryInit = () => {
      const s = _sessionUser();
      if (!s?.id) {
        setTimeout(tryInit, 600);
        return;
      }
      InternalChat.init().catch((e) => console.warn('[InternalChat]', e));
    };
    tryInit();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
