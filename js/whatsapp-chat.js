/* SOU+BLU — Painel WhatsApp (Evolution API, estilo WhatsApp Web) */
const WhatsAppChat = (() => {
  /* Polls conservadores — msgs só com chat aberto; chats mais lentos sem thread. */
  const POLL_CONNECT_MS = 12000;
  const POLL_MSG_MS = 20000;
  const POLL_CHATS_MS = 60000;
  const POLL_CHATS_IDLE_MS = 90000;
  const POLL_EVENTS_MS = 20000;
  const EVENTS_CHATS_MIN_GAP_MS = 15000;
  const AVATAR_WARM_MAX = 6;
  const AVATAR_WARM_GAP_MS = 350;
  const AVATAR_IO_MARGIN = '120px';
  const AVATAR_FETCH_PARALLEL = 3;
  /** Repair sob demanda: poucos em paralelo para não saturar Evolution/PHP. */
  const MEDIA_REPAIR_MAX = 5;
  const MEDIA_REPAIR_GAP_MS = 280;
  const RECORD_TIMESLICE_MS = 250;
  const MIN_RECORD_MS = 400;

  let _configured = null;
  let _provider = 'evolution';
  let _syncEnabled = false;
  let _contactsMax = 30;
  let _status = 'close';
  let _phone = null;
  let _rebindRequired = false;
  let _chats = [];
  let _chatFilter = '';
  let _listFilter = 'all';
  let _activeChatId = null;
  const CRM_SHELL_VER = '10';
  const THREAD_SHELL_VER = '10';
  let _messages = [];
  let _msgFingerprint = '';
  let _pollConnect = null;
  let _pollMsg = null;
  let _pollChats = null;
  let _pollEvents = null;
  let _eventsSince = 0;
  let _connectPollN = 0;
  let _connectPollStarted = 0;
  let _lastEventsChatsLoad = 0;
  let _userId = null;
  let _qr = null;
  let _syncing = false;
  let _emojiOpen = false;
  let _emojiPickerLoading = false;
  let _kanbanMode = false;
  function getKanbanStages() {
    try {
      const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
      const key = 'wa_cols_v3_' + ((session && session.id) || 'x');
      const r = localStorage.getItem(key);
      if (r) {
        const parsed = JSON.parse(r);
        if (parsed && Array.isArray(parsed) && parsed.length >= 2) {
          return parsed;
        }
      }
    } catch(e) {}
    return [
      { id: 'novo',         name: 'Novo contato',  color: '#8696a0' },
      { id: 'em_contato',   name: 'Em contato',    color: '#2f81f7' },
      { id: 'apresentacao', name: 'Apresentação',  color: '#a371f7' },
      { id: 'negociacao',   name: 'Negociação',    color: '#e3b341' },
      { id: 'ganho',        name: 'Ganho',         color: '#3fb950' },
      { id: 'perdido',      name: 'Perdido',       color: '#f85149' }
    ];
  }
  let _kanbanStages = getKanbanStages();
  let _monitorUserId = '';
  let _waRecorder = null;
  let _recording = false;
  let _recordStarting = false;
  let _recordStopRequested = false;
  let _recordStartedAt = 0;
  let _recordMode = 'idle';
  let _recordCancelled = false;
  let _recordTimerId = null;
  let _pendingAudioBlob = null;
  let _pendingAudioMime = '';
  let _previewObjectUrl = null;
  let _previewAudioEl = null;
  let _previewPlaying = false;
  let _audioContext = null;
  let _analyserNode = null;
  let _waveAnimId = null;
  let _micClickTs = 0;
  let _mirrorMode = true;
  let _connectInFlight = null;
  let _qrFetchPromise = null;
  let _lastConnectError = '';
  let _profilePic = null;
  let _profileName = '';
  let _profileLoadPromise = null;
  let _profilePicRequested = false;
  let _sessionLive = false;
  let _serverChatsCount = 0;
  let _lastSendAt = 0;
  /** Etapas salvas localmente aguardando confirmação do servidor (race refresh/poll). */
  let _pendingKanbanStages = {};
  const KANBAN_PENDING_MS = 45000;

  function insertEmojiAtCursor(emoji) {
    const input = document.getElementById('waMsgInput');
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const val = input.value;
    input.value = val.slice(0, start) + emoji + val.slice(end);
    const pos = start + emoji.length;
    input.selectionStart = pos;
    input.selectionEnd = pos;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }

  function closeEmojiPanel() {
    _emojiOpen = false;
    document.getElementById('waEmojiPanel')?.classList.remove('is-open');
    document.getElementById('waEmojiBtn')?.classList.remove('is-active');
  }

  async function ensureEmojiPicker() {
    const mount = document.getElementById('waEmojiMount');
    if (!mount || mount.dataset.mounted === '1') return;
    if (_emojiPickerLoading) return;
    _emojiPickerLoading = true;
    const t0 = Date.now();
    try {
      if (!window.WaEmojiMart?.mount) {
        await new Promise((resolve, reject) => {
          const existing = document.querySelector('script[data-wa-emoji-mart]');
          if (existing) {
            existing.addEventListener('load', resolve, { once: true });
            existing.addEventListener('error', reject, { once: true });
            return;
          }
          const s = document.createElement('script');
          s.type = 'module';
          s.src = '../js/wa-emoji-mart.js';
          s.dataset.waEmojiMart = '1';
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
        let tries = 0;
        while (!window.WaEmojiMart?.mount && tries < 40) {
          await new Promise((r) => setTimeout(r, 50));
          tries++;
        }
      }
      if (!window.WaEmojiMart?.mount) throw new Error('Emoji Mart indisponível');
      const dark = document.documentElement.classList.contains('dark')
        || window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
      await window.WaEmojiMart.mount(mount, {
        theme: dark ? 'dark' : 'light',
        onSelect: (native) => insertEmojiAtCursor(native),
      });
      mount.dataset.mounted = '1';
      if (typeof window._dbgSessionLog === 'function') {
        window._dbgSessionLog('whatsapp-chat.js:ensureEmojiPicker', 'emoji mart loaded', {
          ms: Date.now() - t0,
        }, 'H-emoji-mart');
      }
    } finally {
      _emojiPickerLoading = false;
    }
  }

  async function toggleEmojiPanel() {
    const panel = document.getElementById('waEmojiPanel');
    const btn = document.getElementById('waEmojiBtn');
    if (!panel) return;
    _emojiOpen = !_emojiOpen;
    panel.classList.toggle('is-open', _emojiOpen);
    btn?.classList.toggle('is-active', _emojiOpen);
    if (_emojiOpen) {
      try {
        await ensureEmojiPicker();
      } catch (e) {
        if (typeof showToast === 'function') showToast('Não foi possível carregar emojis.', 'error');
        closeEmojiPanel();
      }
    }
  }

  let _twemojiPromise = null;
  function ensureTwemoji() {
    if (window.twemoji) return Promise.resolve(window.twemoji);
    if (!_twemojiPromise) {
      _twemojiPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/twemoji@14.0.2/dist/twemoji.min.js';
        s.crossOrigin = 'anonymous';
        s.onload = () => resolve(window.twemoji);
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    return _twemojiPromise;
  }

  function applyTwemoji(root) {
    if (!root) return;
    ensureTwemoji().then((tw) => {
      tw.parse(root, { folder: 'svg', ext: '.svg', className: 'wa-twemoji' });
    }).catch(() => { /* noop */ });
  }

  function bindEmojiEvents() {
    const btn = document.getElementById('waEmojiBtn');
    const panel = document.getElementById('waEmojiPanel');
    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleEmojiPanel();
    });
    document.addEventListener('click', (e) => {
      if (!_emojiOpen) return;
      if (e.target.closest('#waEmojiPanel') || e.target.closest('#waEmojiBtn')) return;
      closeEmojiPanel();
    });
    panel?.addEventListener('click', (e) => e.stopPropagation());
  }

  function kanbanStageId(chat) {
    const raw = chat?.kanban_stage || 'novo';
    const legacy = {
      'novo_contato': 'novo',
      'atendimento': 'em_contato',
      'em_atendimento': 'em_contato',
      'proposta': 'negociacao',
      'negociacao': 'negociacao',
      'contrato': 'ganho',
      'cancelado': 'perdido',
      'finalizado': 'perdido'
    };
    return legacy[raw] || raw;
  }

  function normalizeKanbanStage(stage) {
    return kanbanStageId({ kanban_stage: stage || 'novo' });
  }

  function prunePendingKanbanStages() {
    const now = Date.now();
    Object.keys(_pendingKanbanStages).forEach((id) => {
      if (now - (_pendingKanbanStages[id]?.ts || 0) > KANBAN_PENDING_MS) {
        delete _pendingKanbanStages[id];
      }
    });
  }

  function setPendingKanbanStage(chatId, stage) {
    if (!chatId) return;
    _pendingKanbanStages[chatId] = { stage: normalizeKanbanStage(stage), ts: Date.now() };
  }

  function clearPendingKanbanStage(chatId, serverStage) {
    const pending = _pendingKanbanStages[chatId];
    if (!pending) return;
    if (!serverStage || normalizeKanbanStage(serverStage) === pending.stage) {
      delete _pendingKanbanStages[chatId];
    }
  }

  function resolveKanbanStage(chatId, serverStage, prevStage) {
    prunePendingKanbanStages();
    const server = normalizeKanbanStage(serverStage || 'novo');
    const pending = _pendingKanbanStages[chatId];
    if (pending) {
      if (server === pending.stage) {
        delete _pendingKanbanStages[chatId];
        return server;
      }
      return pending.stage;
    }
    const prev = normalizeKanbanStage(prevStage || 'novo');
    if (prev !== server && prev !== 'novo') {
      return prev;
    }
    return server;
  }

  function applyIncomingChats(prevChats, incoming) {
    const inc = incoming || [];
    if (!inc.length) return prevChats || [];
    const prevById = {};
    (prevChats || []).forEach((c) => {
      if (c?.id) prevById[c.id] = c;
    });
    return inc.map((c) => {
      if (!c?.id) return c;
      const prev = prevById[c.id];
      const stage = resolveKanbanStage(c.id, c.kanban_stage, prev?.kanban_stage);
      if (stage === normalizeKanbanStage(c.kanban_stage || 'novo')) {
        return c;
      }
      return { ...c, kanban_stage: stage };
    });
  }

  function mergeChatsList(prevChats, incoming) {
    const inc = incoming || [];
    if (!inc.length && (prevChats || []).length) return prevChats;
    const prevById = {};
    (prevChats || []).forEach((c) => {
      if (c?.id) prevById[c.id] = c;
    });
    return (incoming || []).map((c) => {
      if (!c?.id) return c;
      const prev = prevById[c.id];
      const stage = resolveKanbanStage(c.id, c.kanban_stage, prev?.kanban_stage);
      if (stage === normalizeKanbanStage(c.kanban_stage || 'novo')) {
        return c;
      }
      return { ...c, kanban_stage: stage };
    });
  }

  function hardResetLocalState() {
    stopPollers();
    _chats = [];
    _messages = [];
    _msgFingerprint = '';
    _activeChatId = null;
    _qr = null;
    _status = 'close';
    _phone = null;
    _rebindRequired = false;
    _syncing = false;
    _sessionLive = false;
    _serverChatsCount = 0;
    _pendingKanbanStages = {};
    _profilePic = null;
    _profileName = null;
    _profilePicRequested = false;
    try {
      _avatarLoadedIds.clear();
      _avatarMissingIds.clear();
      _avatarFetchQueue.length = 0;
      _avatarFetchInflight = 0;
    } catch (_) { /* sets podem ainda não existir no boot */ }
    try { window._waContactCache = {}; } catch (_) { /* noop */ }
  }

  function isComposeConnected() {
    return isEffectivelyOpen();
  }

  function isEffectivelyOpen() {
    if (_rebindRequired) return false;
    if (_status === 'connecting') return false;
    return _status === 'open' && _sessionLive;
  }

  function canLoadWaChats() {
    return isEffectivelyOpen() || _status === 'connecting';
  }

  function bindSessionUser() {
    const uid = typeof Auth !== 'undefined' ? Auth.getSession()?.id : null;
    if (!uid) return false;
    const prev = sessionStorage.getItem('soublu_wa_active_uid');
    if (prev && prev !== uid) {
      hardResetLocalState();
      _rebindRequired = true;
      stopPollers();
      if (typeof showToast === 'function') {
        showToast('Sessão trocada. Conecte o WhatsApp deste usuário.', 'info');
      }
    }
    if (_userId && _userId !== uid) {
      hardResetLocalState();
      _rebindRequired = true;
      stopPollers();
    }
    sessionStorage.setItem('soublu_wa_active_uid', uid);
    _userId = uid;
    _monitorUserId = '';
    return true;
  }

  function assertResponseUser(data) {
    if (!data || data.user_id == null || data.user_id === '') return true;
    const sid = _userId || (typeof Auth !== 'undefined' ? Auth.getSession()?.id : null);
    if (!sid) return true;
    if (String(data.user_id) !== String(sid)) {
      hardResetLocalState();
      _rebindRequired = true;
      if (typeof showToast === 'function') {
        showToast('Sessão trocou. Recarregue a página.', 'warning');
      }
      try { location.reload(); } catch (_) { /* noop */ }
      return false;
    }
    return true;
  }

  async function resetSession(clearData = true) {
    if (typeof showLoading === 'function') showLoading('Reiniciando WhatsApp...');
    try {
      await api('reset_session', { method: 'POST', body: { clear_data: !!clearData } });
      hardResetLocalState();
      _rebindRequired = true;
      notifyKanbanState();
      if (typeof showToast === 'function') {
        showToast(clearData ? 'WhatsApp reiniciado. Escaneie o QR com seu número.' : 'Sessão WhatsApp encerrada.', 'success');
      }
    } catch (e) {
      if (typeof showToast === 'function') showToast(e.message || 'Erro ao reiniciar.', 'error');
      throw e;
    } finally {
      if (typeof hideLoading === 'function') hideLoading();
    }
  }

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function cfg() {
    return window.SOUBLU_CONFIG || {};
  }

  function apiBase() {
    const c = cfg();
    return String(c.API_BASE_URL || c.SITE_URL || (typeof location !== 'undefined' ? location.origin : '')).replace(/\/+$/, '');
  }

  function apiUrl(action, params = {}) {
    const q = new URLSearchParams({ action, ...params });
    return `${apiBase()}/api/whatsapp_api.php?${q.toString()}`;
  }

  async function api(action, opts = {}) {
    const c = cfg();
    const key = c.API_KEY || '';
    const userId = opts.userId || _userId || Auth.getSession()?.id;
    if (!userId) throw new Error('Sessão inválida.');

    const method = opts.method || 'GET';
    const headers = {
      'X-API-Key': key,
      apikey: key,
      'Content-Type': 'application/json',
    };

    // apikey também vai na URL: alguns servidores (Apache/Locaweb) removem
    // o header X-API-Key antes do PHP, causando "Não autorizado".
    const baseParams = { user_id: userId, apikey: key };
    const url = apiUrl(action, { ...baseParams, ...(opts.query || {}) });
    const init = { method, headers };

    if (method !== 'GET' && opts.body) {
      init.body = JSON.stringify({ user_id: userId, ...opts.body });
    } else if (method !== 'GET') {
      init.body = JSON.stringify({ user_id: userId });
    }

    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `Erro HTTP ${res.status}`);
    }
    if (!assertResponseUser(data)) {
      throw new Error('Sessão trocou. Recarregue a página.');
    }
    return data;
  }

  function canAccess() {
    const s = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    if (!s?.id) return false;
    if (typeof window !== 'undefined' && window.PARTNER_ROOT_ID) {
      return typeof partnerOrgCan === 'function' && partnerOrgCan('chat_whatsapp');
    }
    return true;
  }

  async function ensureSchema() {
    const schemaVer = 'wa85';
    if (sessionStorage.getItem(`soublu_wa_schema_${schemaVer}`) === '1') return;
    const c = cfg();
    try {
      await fetch(`${apiBase()}/api/migrate-whatsapp.php?force=1&apikey=${encodeURIComponent(c.API_KEY || '')}`, {
        headers: { 'X-API-Key': c.API_KEY || '', apikey: c.API_KEY || '' },
      });
      sessionStorage.setItem(`soublu_wa_schema_${schemaVer}`, '1');
    } catch (_) { /* noop */ }
  }

  function fmtTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    } catch (_) {
      return iso;
    }
  }

  function fmtPhone(p) {
    const d = String(p || '').replace(/\D/g, '');
    if (d.length === 13 && d.startsWith('55')) {
      return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
    }
    if (d.length === 12 && d.startsWith('55')) {
      return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
    }
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return p || '—';
  }

  function isPlausiblePhone(digits) {
    const d = String(digits || '').replace(/\D/g, '');
    return d.length >= 10 && d.length <= 13;
  }

  function _normStr(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function _lookupContactName(phone) {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    if (!digits) return '';
    // Tenta cruzar com clientes do sistema (DB)
    try {
      if (typeof DB !== 'undefined') {
        const cached = window._waContactCache || (window._waContactCache = {});
        if (cached[digits] !== undefined) return cached[digits];
        // Busca síncrona no localStorage (clientes)
        const clientsRaw = localStorage.getItem('soublu_clients');
        if (clientsRaw) {
          const clients = JSON.parse(clientsRaw);
          const match = (clients || []).find(c => {
            const cp = String(c.cpf || c.phone1 || c.phone2 || '').replace(/\D/g, '');
            const p1 = String(c.phone1 || '').replace(/\D/g, '');
            const p2 = String(c.phone2 || '').replace(/\D/g, '');
            return p1 === digits || p2 === digits ||
              p1.slice(-9) === digits.slice(-9) || p2.slice(-9) === digits.slice(-9);
          });
          if (match) { cached[digits] = match.name || ''; return cached[digits]; }
        }
      }
    } catch (_) { /* noop */ }
    return '';
  }

  function displayContactName(chat) {
    const name = String(chat?.contact_name || '').trim();
    const phone = String(chat?.contact_phone || '').replace(/\D/g, '');
    const lower = name.toLowerCase();
    if (['você', 'voce', 'you', 'contato', 'contact'].includes(lower)) {
      // nome genérico do WhatsApp — tentar outras fontes
    } else if (name.length >= 3 && !/^\d{10,}$/.test(name.replace(/\D/g, ''))) {
      return name;
    }
    // Tenta cruzar com base de clientes/leads do sistema
    const fromBase = _lookupContactName(phone);
    if (fromBase) return fromBase;
    // Fallback: número formatado
    if (isPlausiblePhone(phone)) return fmtPhone(phone);
    return 'Contato';
  }

  function priorityMeta(dealTags) {
    const raw = String(dealTags || '').toLowerCase();
    if (raw.includes('urgente') || raw.includes('urgent')) {
      return { priority: 'Urgente', priorityClass: 'priority-urgente' };
    }
    if (raw.includes('alta') || raw.includes('high')) {
      return { priority: 'Alta', priorityClass: 'priority-alta' };
    }
    if (raw.includes('baixa') || raw.includes('low')) {
      return { priority: 'Baixa', priorityClass: 'priority-baixa' };
    }
    if (raw.includes('média') || raw.includes('media') || raw.includes('medium')) {
      return { priority: 'Média', priorityClass: 'priority-media' };
    }
    return { priority: 'Média', priorityClass: 'priority-media' };
  }

  function chatDedupePhoneTail(digits) {
    let d = String(digits || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    if (d.length >= 11) return d.slice(-11);
    return d.length >= 10 ? d : '';
  }

  function chatDedupeKey(chat) {
    let phone = String(chat?.contact_phone || '').replace(/\D/g, '');
    if (phone.length < 10) {
      const m = String(chat?.remote_jid || '').toLowerCase().match(/^(\d{10,15})@/);
      if (m) phone = m[1];
    }
    const tail = chatDedupePhoneTail(phone);
    if (tail) return `p:${tail}`;
    const name = String(chat?.contact_name || '').trim().toLowerCase();
    if (name.length >= 3 && !/^\d{10,}$/.test(name.replace(/\D/g, ''))) {
      return `n:${name}`;
    }
    return `id:${chat?.id || ''}`;
  }

  function chatDedupeKeys(chat) {
    const keys = [chatDedupeKey(chat)];
    let phone = String(chat?.contact_phone || '').replace(/\D/g, '');
    if (phone.length < 10) {
      const m = String(chat?.remote_jid || '').toLowerCase().match(/^(\d{10,15})@/);
      if (m) phone = m[1];
    }
    const tail = chatDedupePhoneTail(phone);
    if (tail) keys.push(`p:${tail}`);
    const name = String(chat?.contact_name || '').trim().toLowerCase();
    if (name.length >= 3 && !/^\d{10,}$/.test(name.replace(/\D/g, ''))) {
      keys.push(`n:${name}`);
    }
    return [...new Set(keys)];
  }

  function chatDedupeScore(chat) {
    let score = 0;
    const phone = String(chat?.contact_phone || '').replace(/\D/g, '');
    if (phone.length >= 10) score += 8;
    const jid = String(chat?.remote_jid || '').toLowerCase();
    if (jid && !jid.endsWith('@lid')) score += 4;
    const name = String(chat?.contact_name || '').trim();
    if (name.length >= 3 && !/^\d{10,}$/.test(name.replace(/\D/g, ''))) score += 2;
    score += (Date.parse(chat?.last_message_at || chat?.created_at || '') || 0) / 1e12;
    return score;
  }

  function dedupeChatsByPhone(chats) {
    const byCanon = new Map();
    const keyToCanon = new Map();
    (chats || []).forEach((c) => {
      if (!c?.id) return;
      const keys = chatDedupeKeys(c);
      let canon = null;
      for (const k of keys) {
        if (keyToCanon.has(k)) {
          canon = keyToCanon.get(k);
          break;
        }
      }
      if (!canon) canon = keys[0];
      keys.forEach((k) => keyToCanon.set(k, canon));
      const existing = byCanon.get(canon);
      if (!existing || chatDedupeScore(c) >= chatDedupeScore(existing)) {
        byCanon.set(canon, c);
      }
    });
    return Array.from(byCanon.values());
  }

  async function loadOwnProfile(force = false) {
    if (!force && _profilePic) {
      return { name: _profileName, pictureUrl: _profilePic };
    }
    if (_profileLoadPromise && !force) return _profileLoadPromise;
    const run = (async () => {
      try {
        const prof = await withTimeout(
          api('fetch_profile', { query: { quick: '1' } }),
          15000,
          'Carregar perfil'
        );
        const name = String(prof?.profile?.name || '').trim();
        const pic = String(prof?.profile?.pictureUrl || '').trim();
        if (name) _profileName = name;
        if (pic) _profilePic = pic;
        notifyKanbanState();
        return { name: _profileName, pictureUrl: _profilePic };
      } catch (_) {
        return { name: _profileName, pictureUrl: _profilePic };
      } finally {
        _profileLoadPromise = null;
      }
    })();
    _profileLoadPromise = run;
    return run;
  }

  function humanPreview(preview) {
    const s = String(preview || '').trim();
    const map = {
      '[Imagem]': 'Foto',
      '[Áudio]': 'Áudio',
      '[Audio]': 'Áudio',
      '[Figurinha]': 'Figurinha',
      '[Vídeo]': 'Vídeo',
      '[Video]': 'Vídeo',
      '[Documento]': 'Documento',
      '[Mídia]': 'Mídia',
    };
    return map[s] || s;
  }

  function initials(name, phone) {
    const n = String(name || '').trim();
    if (n.length >= 2 && !/^\d{10,}$/.test(n.replace(/\D/g, ''))) {
      const p = n.split(/\s+/).filter(Boolean);
      return (p.length > 1 ? (p[0][0] + p[1][0]) : p[0].slice(0, 2)).toUpperCase();
    }
    const d = String(phone || '').replace(/\D/g, '');
    if (isPlausiblePhone(d)) return d.slice(-2);
    return '?';
  }

  function avatarProxyUrl(chatId) {
    if (!chatId) return '';
    const c = cfg();
    const uid = _userId || (typeof Auth !== 'undefined' ? Auth.getSession()?.id : '') || '';
    if (!uid) return '';
    const key = encodeURIComponent(c.API_KEY || '');
    return `${apiBase()}/api/whatsapp_api.php?action=avatar_image&chat_id=${encodeURIComponent(chatId)}&user_id=${encodeURIComponent(uid)}&apikey=${key}`;
  }

  function avatarSrc(chat) {
    const chatId = chat?.id;
    if (chatId) return avatarProxyUrl(chatId);
    const u = chat?.contact_avatar_url;
    if (!u) return '';
    return mediaSrc(u);
  }

  let _avatarObserver = null;
  let _avatarFetchInflight = 0;
  const _avatarFetchQueue = [];
  const _avatarLoadedIds = new Set();
  const _avatarMissingIds = new Set();

  function avatarHtml(chat, className) {
    const cls = className || 'wa-avatar';
    const label = displayContactName(chat);
    const init = initials(label, chat?.contact_phone);
    const chatId = chat?.id || '';
    if (!chatId || _avatarMissingIds.has(chatId)) {
      return `<span class="${cls} wa-avatar-fallback">${esc(init)}</span>`;
    }
    const proxy = avatarProxyUrl(chatId);
    return `<span class="${cls} wa-avatar-wrap wa-avatar-lazy" data-chat-id="${esc(chatId)}">` +
      `<img class="wa-avatar-img wa-avatar-img--pending" alt="" width="40" height="40" loading="lazy" decoding="async" data-avatar-src="${esc(proxy)}"/>` +
      `<span class="wa-avatar-fallback">${esc(init)}</span></span>`;
  }
  function ensureAvatarObserver() {
    if (_avatarObserver || typeof IntersectionObserver === 'undefined') return _avatarObserver;
    const root = document.getElementById('waInboxList')
      || document.getElementById('waChatList')
      || null;
    _avatarObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const wrap = entry.target;
        _avatarObserver?.unobserve(wrap);
        queueAvatarElementLoad(wrap);
      });
    }, { root, rootMargin: AVATAR_IO_MARGIN, threshold: 0.01 });
    return _avatarObserver;
  }

  function queueAvatarElementLoad(wrap) {
    if (!wrap || wrap.dataset.avatarLoaded === '1') return;
    _avatarFetchQueue.push(wrap);
    drainAvatarFetchQueue();
  }

  function drainAvatarFetchQueue() {
    while (_avatarFetchInflight < AVATAR_FETCH_PARALLEL && _avatarFetchQueue.length) {
      const wrap = _avatarFetchQueue.shift();
      if (wrap) loadAvatarElement(wrap);
    }
  }

  function loadAvatarElement(wrap, immediate) {
    if (!wrap || wrap.dataset.avatarLoaded === '1') return;
    const chatId = wrap.dataset.chatId || '';
    if (chatId && _avatarMissingIds.has(chatId)) {
      wrap.classList.add('wa-avatar-wrap--fallback');
      wrap.dataset.avatarLoaded = '1';
      return;
    }
    const img = wrap.querySelector('.wa-avatar-img');
    if (!img) return;
    const src = img.dataset.avatarSrc || img.getAttribute('data-avatar-src') || '';
    if (!src) {
      wrap.classList.add('wa-avatar-wrap--fallback');
      wrap.dataset.avatarLoaded = '1';
      if (chatId) _avatarMissingIds.add(chatId);
      return;
    }
    if (img.src && img.src === src) return;
    if (chatId && _avatarLoadedIds.has(chatId) && img.complete && img.naturalWidth > 1) {
      wrap.classList.add('wa-avatar-wrap--loaded');
      wrap.dataset.avatarLoaded = '1';
      return;
    }
    _avatarFetchInflight++;
    const markMissing = () => {
      wrap.classList.add('wa-avatar-wrap--fallback');
      wrap.dataset.avatarLoaded = '1';
      if (chatId) _avatarMissingIds.add(chatId);
      try { img.removeAttribute('src'); } catch (_) { /* noop */ }
    };
    const done = () => {
      _avatarFetchInflight = Math.max(0, _avatarFetchInflight - 1);
      drainAvatarFetchQueue();
    };
    img.addEventListener('load', () => {
      // Placeholder 1x1 do backend = sem foto real.
      if (!img.naturalWidth || img.naturalWidth <= 1) {
        markMissing();
        done();
        return;
      }
      img.classList.remove('wa-avatar-img--pending');
      wrap.classList.add('wa-avatar-wrap--loaded');
      wrap.dataset.avatarLoaded = '1';
      if (chatId) {
        _avatarLoadedIds.add(chatId);
        _avatarMissingIds.delete(chatId);
      }
      done();
    }, { once: true });
    img.addEventListener('error', () => {
      markMissing();
      done();
    }, { once: true });
    img.src = src;
    if (immediate && typeof img.decode === 'function') {
      img.decode().catch(() => {});
    }
  }

  function bindLazyAvatars(root) {
    const scope = root || document;
    const nodes = scope.querySelectorAll?.('.wa-avatar-lazy:not([data-avatar-bound])') || [];
    if (!nodes.length) return;
    const obs = ensureAvatarObserver();
    let bound = 0;
    nodes.forEach((el) => {
      el.dataset.avatarBound = '1';
      bound++;
      if (obs) obs.observe(el);
      else queueAvatarElementLoad(el);
    });
    if (bound && typeof window._dbgSessionLog === 'function') {
      window._dbgSessionLog('whatsapp-chat.js:bindLazyAvatars', 'avatars queued', {
        bound,
        hasObserver: !!obs,
      }, 'H-avatar-lazy');
    }
  }

  function loadThreadAvatarNow(chat) {
    const avatar = document.getElementById('waThreadAvatar');
    if (!avatar || !chat?.id) return;
    const init = initials(displayContactName(chat), chat?.contact_phone);
    avatar.className = 'wa-thread-avatar wa-avatar-wrap wa-avatar-lazy';
    avatar.dataset.chatId = chat.id;
    avatar.dataset.avatarBound = '1';
    avatar.innerHTML =
      `<img class="wa-avatar-img wa-avatar-img--pending" alt="" width="40" height="40" decoding="async" data-avatar-src="${esc(avatarProxyUrl(chat.id))}"/>` +
      `<span class="wa-avatar-fallback">${esc(init)}</span>`;
    loadAvatarElement(avatar, true);
  }

  function openMediaLightbox(src) {
    if (!src) return;
    let overlay = document.getElementById('waMediaLightbox');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'waMediaLightbox';
      overlay.className = 'wa-media-lightbox';
      overlay.innerHTML = '<button type="button" class="wa-media-lightbox__close" aria-label="Fechar">✕</button><img class="wa-media-lightbox__img" alt=""/><a class="wa-media-lightbox__dl" download target="_blank" rel="noopener">Baixar</a>';
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('.wa-media-lightbox__close')) {
          overlay.classList.remove('is-open');
        }
      });
      document.body.appendChild(overlay);
    }
    const img = overlay.querySelector('.wa-media-lightbox__img');
    const dl = overlay.querySelector('.wa-media-lightbox__dl');
    if (img) img.src = src;
    if (dl) {
      dl.href = src;
      dl.download = src.split('/').pop() || 'midia';
    }
    overlay.classList.add('is-open');
  }

  function bindMediaEvents() {
    const box = document.getElementById('waMessages');
    if (!box || box.dataset.mediaBound === '1') return;
    box.dataset.mediaBound = '1';
    box.addEventListener('click', (e) => {
      const delBtn = e.target.closest('[data-delete-msg]');
      if (delBtn?.dataset?.deleteMsg) {
        e.preventDefault();
        e.stopPropagation();
        deleteMessage(delBtn.dataset.deleteMsg);
        return;
      }
      const img = e.target.closest('.wa-bubble__img');
      if (img?.src) {
        e.preventDefault();
        openMediaLightbox(img.src);
        return;
      }
      const dlBtn = e.target.closest('[data-download-media]');
      if (dlBtn?.dataset?.src) {
        e.preventDefault();
        const a = document.createElement('a');
        a.href = dlBtn.dataset.src;
        a.download = dlBtn.dataset.name || 'midia';
        a.target = '_blank';
        a.rel = 'noopener';
        a.click();
      }
    });
  }

  function formatRecordTime(ms) {
    const sec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function dbgAudioLog(location, message, data, hypothesisId) {
    if (typeof window._dbgSessionLog === 'function') {
      window._dbgSessionLog(location, message, data, hypothesisId || 'H-audio-rec');
    }
  }

  function pickAudioMimeType() {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/ogg;codecs=opus',
      'audio/webm',
      'audio/ogg',
      'audio/mp4',
    ];
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
      return '';
    }
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) return c;
    }
    return '';
  }

  function normalizeAudioMime(type, fileName) {
    let mime = String(type || '').split(';')[0].trim().toLowerCase();
    if (!mime.startsWith('audio/')) mime = mimeFromName(fileName || '');
    if (!mime.startsWith('audio/')) return 'audio/webm';
    return mime;
  }

  function audioExtFromMime(mime) {
    const m = normalizeAudioMime(mime, '');
    if (m.includes('ogg')) return 'ogg';
    if (m.includes('mpeg') || m === 'audio/mp3') return 'mp3';
    if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
    if (m.includes('wav')) return 'wav';
    return 'webm';
  }

  function cleanupRecordStream() {
    try {
      if (_waRecorder) _waRecorder.destroy();
    } catch (_) { /* noop */ }
    _waRecorder = null;
    stopWaveform();
    try {
      if (_audioContext && _audioContext.state !== 'closed') _audioContext.close();
    } catch (_) { /* noop */ }
    _audioContext = null;
    _analyserNode = null;
  }

  function stopWaveform() {
    if (_waveAnimId) {
      cancelAnimationFrame(_waveAnimId);
      _waveAnimId = null;
    }
    const wave = document.getElementById('waRecordWave');
    if (wave) wave.innerHTML = '';
  }

  function startWaveform(stream) {
    stopWaveform();
    const wave = document.getElementById('waRecordWave');
    if (!wave || typeof window.AudioContext === 'undefined' && typeof window.webkitAudioContext === 'undefined') return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      _audioContext = new Ctx();
      const source = _audioContext.createMediaStreamSource(stream);
      _analyserNode = _audioContext.createAnalyser();
      _analyserNode.fftSize = 32;
      source.connect(_analyserNode);
      const bars = 12;
      wave.innerHTML = Array.from({ length: bars }, () => '<span class="wa-record-wave__bar"></span>').join('');
      const barEls = wave.querySelectorAll('.wa-record-wave__bar');
      const buf = new Uint8Array(_analyserNode.frequencyBinCount);
      const tick = () => {
        if (!_recording || !_analyserNode) return;
        _analyserNode.getByteFrequencyData(buf);
        barEls.forEach((el, i) => {
          const v = buf[i] || 0;
          const h = Math.max(4, Math.round((v / 255) * 28));
          el.style.height = `${h}px`;
        });
        _waveAnimId = requestAnimationFrame(tick);
      };
      tick();
    } catch (_) { /* noop */ }
  }

  function stopRecordTimer() {
    if (_recordTimerId) {
      clearInterval(_recordTimerId);
      _recordTimerId = null;
    }
  }

  function updateRecordTimerUi() {
    const el = document.getElementById('waRecordTimer');
    if (!el || !_recordStartedAt) return;
    el.textContent = formatRecordTime(Date.now() - _recordStartedAt);
  }

  function startRecordTimer() {
    stopRecordTimer();
    updateRecordTimerUi();
    _recordTimerId = setInterval(updateRecordTimerUi, 200);
  }

  function setRecordPanelMode(mode) {
    _recordMode = mode;
    const panel = document.getElementById('waRecordPanel');
    const bar = document.getElementById('waComposeBar');
    const live = document.getElementById('waRecordLive');
    const preview = document.getElementById('waRecordPreview');
    if (panel) panel.classList.toggle('is-hidden', mode === 'idle');
    if (bar) bar.classList.toggle('is-hidden-when-rec', mode !== 'idle');
    if (live) live.classList.toggle('is-hidden', mode !== 'recording');
    if (preview) preview.classList.toggle('is-hidden', mode !== 'preview');
    updateComposeMode();
  }

  function cleanupPreviewAudio() {
    try {
      if (_previewAudioEl) {
        _previewAudioEl.pause();
        _previewAudioEl.src = '';
      }
    } catch (_) { /* noop */ }
    _previewAudioEl = null;
    _previewPlaying = false;
    if (_previewObjectUrl) {
      try { URL.revokeObjectURL(_previewObjectUrl); } catch (_) { /* noop */ }
    }
    _previewObjectUrl = null;
    _pendingAudioBlob = null;
    _pendingAudioMime = '';
    const playBtn = document.getElementById('waRecordPlay');
    if (playBtn) playBtn.classList.remove('is-playing');
  }

  function finishRecordingUi() {
    _recording = false;
    _recordStarting = false;
    _recordStartedAt = 0;
    stopRecordTimer();
    document.getElementById('waMicBtn')?.classList.remove('is-recording');
    if (_recordMode === 'recording') setRecordPanelMode('idle');
    updateComposeMode();
  }

  function cancelAudioRecord() {
    _recordCancelled = true;
    _recordStopRequested = true;
    cleanupPreviewAudio();
    try { _waRecorder?.cancel(); } catch (_) { /* noop */ }
    finishRecordingUi();
    cleanupRecordStream();
    setRecordPanelMode('idle');
    dbgAudioLog('whatsapp-chat.js:cancelAudioRecord', 'recording cancelled', {}, 'H-audio-cancel');
  }

  function discardPendingAudio() {
    cleanupPreviewAudio();
    setRecordPanelMode('idle');
    dbgAudioLog('whatsapp-chat.js:discardPendingAudio', 'preview discarded', {}, 'H-audio-discard');
  }

  async function sendPendingAudio() {
    if (!_pendingAudioBlob || !_pendingAudioBlob.size) {
      if (typeof showToast === 'function') showToast('Nenhum áudio para enviar.', 'warning');
      return;
    }
    if (_pendingAudioBlob.size < 200) {
      if (typeof showToast === 'function') showToast('Áudio vazio. Grave pelo menos 1 segundo.', 'warning');
      return;
    }
    const mime = normalizeAudioMime(_pendingAudioMime, '');
    const ext = audioExtFromMime(mime);
    const file = new File([_pendingAudioBlob], `audio-${Date.now()}.${ext}`, { type: mime });
    const blobSize = _pendingAudioBlob.size;
    dbgAudioLog('whatsapp-chat.js:sendPendingAudio', 'sending audio', { bytes: blobSize, mime, ext }, 'H-audio-send');
    try {
      await sendMedia(file);
      cleanupPreviewAudio();
      setRecordPanelMode('idle');
      if (typeof showToast === 'function') showToast('Áudio enviado.', 'success');
    } catch (e) {
      // Mantém o preview para o usuário tentar de novo.
      if (typeof showToast === 'function') showToast(e?.message || 'Falha ao enviar áudio gravado.', 'error');
    }
  }

  function togglePreviewPlayback() {
    if (!_pendingAudioBlob) return;
    if (!_previewAudioEl) {
      _previewObjectUrl = URL.createObjectURL(_pendingAudioBlob);
      _previewAudioEl = new Audio(_previewObjectUrl);
      _previewAudioEl.onended = () => {
        _previewPlaying = false;
        document.getElementById('waRecordPlay')?.classList.remove('is-playing');
      };
    }
    const playBtn = document.getElementById('waRecordPlay');
    if (_previewPlaying) {
      _previewAudioEl.pause();
      _previewPlaying = false;
      playBtn?.classList.remove('is-playing');
      return;
    }
    _previewAudioEl.play().then(() => {
      _previewPlaying = true;
      playBtn?.classList.add('is-playing');
    }).catch(() => {
      if (typeof showToast === 'function') showToast('Não foi possível reproduzir o áudio.', 'error');
    });
  }

  function showAudioPreview(blob, mime, elapsedMs) {
    _pendingAudioBlob = blob;
    _pendingAudioMime = mime;
    const dur = elapsedMs || (_recordStartedAt ? Date.now() - _recordStartedAt : 0);
    _recordStartedAt = 0;
    const durEl = document.getElementById('waPreviewDur');
    if (durEl) durEl.textContent = formatRecordTime(dur);
    setRecordPanelMode('preview');
    try {
      const tmpUrl = URL.createObjectURL(blob);
      const tmp = new Audio(tmpUrl);
      tmp.onloadedmetadata = () => {
        if (durEl && Number.isFinite(tmp.duration) && tmp.duration > 0) {
          durEl.textContent = formatRecordTime(tmp.duration * 1000);
        }
        URL.revokeObjectURL(tmpUrl);
      };
      tmp.onerror = () => URL.revokeObjectURL(tmpUrl);
    } catch (_) { /* noop */ }
    dbgAudioLog('whatsapp-chat.js:showAudioPreview', 'preview ready', { bytes: blob.size, mime, dur }, 'H-audio-preview');
  }

  function requestStopAudioRecord() {
    _recordStopRequested = true;
    if (_recording || _recordStarting) stopAudioRecord();
  }

  async function stopAudioRecord() {
    if (!_recording && !_recordStarting) return;
    if (!_waRecorder) {
      finishRecordingUi();
      return;
    }
    try {
      const result = await _waRecorder.stop();
      _waRecorder = null;
      _recording = false;
      _recordStarting = false;
      document.getElementById('waMicBtn')?.classList.remove('is-recording');
      stopRecordTimer();
      stopWaveform();
      const cancelled = _recordCancelled;
      _recordCancelled = false;
      dbgAudioLog('whatsapp-chat.js:onstop', 'recorder stopped', {
        bytes: result.blob?.size || 0,
        elapsed: result.elapsed,
        cancelled,
        mime: result.mime,
      }, 'H-audio-stop');
      if (cancelled) {
        finishRecordingUi();
        return;
      }
      if (!result.blob?.size) {
        finishRecordingUi();
        if (typeof showToast === 'function') showToast('Áudio vazio. Grave pelo menos 1 segundo.', 'warning');
        return;
      }
      if (result.elapsed < MIN_RECORD_MS) {
        finishRecordingUi();
        if (typeof showToast === 'function') showToast('Gravação muito curta. Tente novamente.', 'warning');
        return;
      }
      showAudioPreview(result.blob, result.mime, result.elapsed);
    } catch (e) {
      finishRecordingUi();
      cleanupRecordStream();
      if (typeof showToast === 'function') showToast('Não foi possível finalizar a gravação.', 'error');
    }
  }

  async function startAudioRecord() {
    if (_recording || _recordStarting) {
      if (_recordStarting && typeof showToast === 'function') {
        showToast('Aguarde, solicitando acesso ao microfone…', 'info');
      }
      return;
    }
    if (!isEffectivelyOpen()) {
      if (typeof showToast === 'function') showToast('Conecte o WhatsApp antes de gravar áudio.', 'warning');
      return;
    }
    if (!_activeChatId) {
      if (typeof showToast === 'function') showToast('Selecione uma conversa primeiro.', 'warning');
      return;
    }
    if (!window.isSecureContext) {
      if (typeof showToast === 'function') showToast('Microfone exige HTTPS. Abra o site com https://', 'error');
      return;
    }
    if (typeof window.WaAudioRecorder !== 'function') {
      if (typeof showToast === 'function') showToast('Módulo de áudio não carregou. Recarregue com Ctrl+F5.', 'error');
      return;
    }
    _recordStopRequested = false;
    _recordCancelled = false;
    _recordStarting = true;
    document.getElementById('waMicBtn')?.classList.add('is-recording');
    setRecordPanelMode('recording');
    const timerEl = document.getElementById('waRecordTimer');
    if (timerEl) timerEl.textContent = '0:00';
    try {
      _waRecorder = new window.WaAudioRecorder();
      const started = await _waRecorder.start();
      if (_recordStopRequested || _recordCancelled) {
        try { _waRecorder.cancel(); } catch (_) { /* noop */ }
        cleanupRecordStream();
        _recordStarting = false;
        finishRecordingUi();
        return;
      }
      _recordStartedAt = Date.now();
      _recording = true;
      _recordStarting = false;
      startRecordTimer();
      if (started.stream) startWaveform(started.stream);
      dbgAudioLog('whatsapp-chat.js:startAudioRecord', 'recording started', {
        mime: started.mime || 'default',
        recordRtc: typeof window.RecordRTC === 'function',
      }, 'H-audio-start');
      if (_recordStopRequested) await stopAudioRecord();
    } catch (e) {
      finishRecordingUi();
      cleanupRecordStream();
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError');
      if (typeof showToast === 'function') {
        showToast(
          denied ? 'Permissão do microfone negada. Libere nas configurações do navegador.' : (e?.message || 'Não foi possível acessar o microfone.'),
          'error'
        );
      }
    }
  }

  function micUnavailableReason() {
    if (!isEffectivelyOpen()) return 'Conecte o WhatsApp antes de gravar áudio.';
    if (!_activeChatId) return 'Selecione uma conversa primeiro.';
    return '';
  }

  function onMicClick(ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    const now = Date.now();
    if (now - _micClickTs < 150) return;
    _micClickTs = now;
    const reason = micUnavailableReason();
    if (reason) {
      if (typeof showToast === 'function') showToast(reason, 'warning');
      return;
    }
    dbgAudioLog('whatsapp-chat.js:onMicClick', 'toggle audio record', {
      recording: _recording,
      recordStarting: _recordStarting,
      recordMode: _recordMode,
    }, 'H-mic-click');
    toggleAudioRecord();
  }

  function toggleAudioRecord() {
    if (_recordMode === 'preview') {
      if (typeof showToast === 'function') showToast('Envie ou descarte o áudio gravado antes de gravar de novo.', 'info');
      return;
    }
    if (_recording || _recordStarting) requestStopAudioRecord();
    else startAudioRecord();
  }

  async function loadChatAvatar(chatId, silent) {
    if (!chatId || !isEffectivelyOpen()) return;
    const chat = _chats.find((c) => c.id === chatId);
    if (_activeChatId === chatId) loadThreadAvatarNow(chat || { id: chatId });
    try {
      const data = await api('contact_avatar', { method: 'POST', body: { chat_id: chatId } });
      if (data.chats) {
        _chats = data.chats;
        renderChatList();
        notifyKanbanState();
        bindLazyAvatars(document.getElementById('waChatList'));
        bindLazyAvatars(document.getElementById('waInboxList'));
      }
      if (_activeChatId === chatId) {
        const updated = _chats.find((c) => c.id === chatId);
        if (updated) loadThreadAvatarNow(updated);
      }
      if (!silent && data.avatar_url && typeof showToast === 'function') {
        showToast('Foto do contato atualizada.', 'success');
      }
    } catch (_) { /* noop */ }
  }

  /** @deprecated — substituído por Intersection Observer + avatar_image sob demanda */
  function warmMissingAvatars(_chatsIgnored) {
    /* noop */
  }

  function msgFingerprint(msgs) {
    return (msgs || []).map(m => `${m.id}:${m.message_type}:${m.media_url || ''}:${m.body}`).join('|');
  }

  function mediaSrc(mediaUrl) {
    if (!mediaUrl) return '';
    const u = String(mediaUrl);
    if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:') || u.startsWith('blob:')) return u;
    const path = u.replace(/^\/+/, '').replace(/^uploads\//, '');
    return `${apiBase()}/api/file.php?path=${encodeURIComponent(path)}`;
  }

  async function repairMessageMedia(messageId) {
    if (!messageId) return '';
    try {
      const data = await api('repair_media', { method: 'POST', body: { message_id: messageId } });
      return data.media_url || '';
    } catch (_) {
      return '';
    }
  }

  function mimeFromName(name) {
    const ext = String(name || '').split('.').pop()?.toLowerCase() || '';
    const map = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
      mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', webm: 'audio/webm',
    };
    return map[ext] || 'application/octet-stream';
  }

  function mimeFromMediaUrl(url) {
    const s = String(url || '');
    try {
      const u = new URL(s, typeof location !== 'undefined' ? location.origin : 'http://localhost');
      const path = u.searchParams.get('path') || u.pathname;
      const mime = mimeFromName(path);
      return mime.startsWith('audio/') ? mime : 'audio/ogg';
    } catch (_) {
      const mime = mimeFromName(s);
      return mime.startsWith('audio/') ? mime : 'audio/ogg';
    }
  }

  async function onAudioError(audioEl) {
    if (!audioEl || audioEl.dataset.repairTried === '1') return;
    audioEl.dataset.repairTried = '1';
    const msgId = audioEl.dataset.msgId || '';
    const repaired = await repairMessageMedia(msgId);
    if (repaired) {
      audioEl.src = mediaSrc(repaired);
      audioEl.load();
      const idx = _messages.findIndex((x) => String(x.id) === String(msgId));
      if (idx >= 0) _messages[idx] = { ..._messages[idx], media_url: repaired };
    }
  }

  async function onMediaImgError(imgEl) {
    if (!imgEl || imgEl.dataset.repairTried === '1') return;
    imgEl.dataset.repairTried = '1';
    const msgId = imgEl.dataset.msgId || '';
    const repaired = await repairMessageMedia(msgId);
    if (repaired) {
      imgEl.src = mediaSrc(repaired);
      const idx = _messages.findIndex((x) => String(x.id) === String(msgId));
      if (idx >= 0) {
        _messages[idx] = { ..._messages[idx], media_url: repaired };
      }
    } else {
      imgEl.replaceWith(Object.assign(document.createElement('span'), {
        className: 'wa-bubble__text',
        textContent: imgEl.alt === 'Figurinha' ? '[Figurinha]' : '[Imagem]',
      }));
    }
  }

  /** Queue leve de repair — serializado com gap (protege pool PHP). */
  let _repairQueue = Promise.resolve();
  function enqueueMediaRepair(messageId) {
    return new Promise((resolve) => {
      _repairQueue = _repairQueue.then(async () => {
        await new Promise((r) => setTimeout(r, MEDIA_REPAIR_GAP_MS));
        const url = await repairMessageMedia(messageId);
        resolve(url);
      }).catch(() => resolve(''));
    });
  }

  function scheduleThreadMediaRepair() {
    const repairTypes = new Set(['sticker', 'audio', 'video', 'image']);
    const missingMedia = _messages.filter((m) => {
      const type = String(m.message_type || '').toLowerCase();
      return repairTypes.has(type) && !m.media_url && m.id && !m._pending;
    });
    if (!missingMedia.length) return;
    Promise.all(missingMedia.slice(0, MEDIA_REPAIR_MAX).map((m) => enqueueMediaRepair(m.id))).then((urls) => {
      let patched = false;
      urls.forEach((url, i) => {
        if (!url) return;
        const msg = missingMedia[i];
        const idx = _messages.findIndex((x) => x.id === msg.id);
        if (idx >= 0) {
          _messages[idx] = { ..._messages[idx], media_url: url };
          patched = true;
        }
      });
      if (patched) {
        _msgFingerprint = msgFingerprint(_messages);
        renderMessages();
      }
    }).catch(() => {});
  }

  function addOptimisticBubble(body, messageType, mediaUrl) {
    const pendingId = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const msg = {
      id: pendingId,
      direction: 'out',
      message_type: messageType || 'text',
      body: body || '',
      media_url: mediaUrl || null,
      created_at: new Date().toISOString(),
      _pending: true,
    };
    _messages.push(msg);
    _msgFingerprint = msgFingerprint(_messages);
    renderMessages();
    return pendingId;
  }

  function mergeSentMessage(apiMsg, pendingId) {
    if (!apiMsg) return false;
    const idx = _messages.findIndex((m) => m.id === pendingId);
    if (idx >= 0) {
      _messages[idx] = { ...apiMsg };
    } else {
      _messages.push(apiMsg);
    }
    _msgFingerprint = msgFingerprint(_messages);
    renderMessages();
    return true;
  }

  function removeOptimisticBubble(pendingId) {
    _messages = _messages.filter((m) => m.id !== pendingId);
    _msgFingerprint = msgFingerprint(_messages);
    renderMessages();
  }

  async function uploadMedia(file) {
    const c = cfg();
    const fd = new FormData();
    fd.append('file', file);
    let res;
    try {
      res = await fetch(`${apiBase()}/api/upload.php?bucket=whatsapp-media&apikey=${encodeURIComponent(c.API_KEY || '')}`, {
        method: 'POST',
        headers: { 'X-API-Key': c.API_KEY || '', apikey: c.API_KEY || '' },
        body: fd,
      });
    } catch (netErr) {
      throw new Error(`Falha no upload do áudio: ${netErr?.message || 'sem conexão'}`);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `Upload falhou (HTTP ${res.status})`);
    }
    if (!data.path && !data.caminho) {
      throw new Error('Upload concluído sem caminho do arquivo.');
    }
    return data;
  }

  function isUserTyping() {
    const input = document.getElementById('waMsgInput');
    if (!input) return false;
    return document.activeElement === input || String(input.value || '').length > 0;
  }

  function applyProfilePicFromStatus(data) {
    if (!data?.profile_pic) return;
    const pic = String(data.profile_pic);
    if (!/^https?:\/\//i.test(pic)) return;
    if (!pic.includes('whatsapp_api.php')) {
      const c = cfg();
      const uid = _userId || (typeof Auth !== 'undefined' ? Auth.getSession()?.id : '') || '';
      _profilePic = `${apiBase()}/api/whatsapp_api.php?action=profile_image&user_id=${encodeURIComponent(uid)}&apikey=${encodeURIComponent(c.API_KEY || '')}`;
    } else {
      _profilePic = pic;
    }
    notifyKanbanState();
  }

  function notifyKanbanState(extra = {}) {
    try {
      window.dispatchEvent(new CustomEvent('wa:state-changed', {
        detail: {
          status: _status,
          hasQr: !!_qr,
          configured: _configured,
          error: _lastConnectError || extra.error || '',
          rebindRequired: _rebindRequired,
          connecting: !!_connectInFlight,
          profilePic: _profilePic,
          profileName: _profileName,
          ...extra,
        },
      }));
    } catch (_) { /* noop */ }
  }

  function withTimeout(promise, ms, label) {
    const lim = Math.max(5000, parseInt(ms, 10) || 55000);
    const tag = label || 'operação';
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Tempo esgotado (${tag}). Verifique a internet e tente novamente.`)), lim);
      }),
    ]);
  }

  function stopPollers() {
    if (_pollConnect) { clearInterval(_pollConnect); _pollConnect = null; }
    if (_pollMsg) { clearInterval(_pollMsg); _pollMsg = null; }
    if (_pollChats) { clearInterval(_pollChats); _pollChats = null; }
    if (_pollEvents) { clearInterval(_pollEvents); _pollEvents = null; }
    _connectPollN = 0;
    _connectPollStarted = 0;
  }

  function stopMsgPoll() {
    if (_pollMsg) { clearInterval(_pollMsg); _pollMsg = null; }
  }

  function startMsgPoll() {
    stopMsgPoll();
    if (!_activeChatId || !_sessionLive) return;
    _pollMsg = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (!_activeChatId || isUserTyping()) return;
      loadMessages(_activeChatId, true).catch(() => {});
    }, POLL_MSG_MS);
  }

  function startEventsPoll() {
    if (_pollEvents) clearInterval(_pollEvents);
    if (!_sessionLive) return;
    _eventsSince = 0;
    _pollEvents = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (!_sessionLive || !isEffectivelyOpen()) return;
      api('events', { query: { since: String(_eventsSince) } }).then(async (data) => {
        if (!data || !data.changed) return;
        _eventsSince = Number(data.ts) || Date.now();
        if (Date.now() - _lastSendAt < 3000) return;
        if (Date.now() - _lastEventsChatsLoad < EVENTS_CHATS_MIN_GAP_MS) return;
        _lastEventsChatsLoad = Date.now();
        await loadChats(true, { force: false });
        if (_activeChatId && !isUserTyping()) {
          await loadMessages(_activeChatId, true);
        }
        notifyKanbanState();
      }).catch(() => {});
    }, POLL_EVENTS_MS);
  }

  async function pullChats(silent, force) {
    if (!canLoadWaChats() || (_status !== 'open' && !_phone)) return;
    try {
      await loadChats(!!silent, { force: !!force });
      if (force && _syncEnabled && _chats.length === 0) {
        await loadContacts(!!silent, true);
      }
      notifyKanbanState();
    } catch (e) {
      console.error('[WhatsAppChat.pullChats]', e);
      if (!silent && typeof showToast === 'function') {
        showToast(e.message || 'Erro ao carregar conversas.', 'warning');
      }
    }
  }

  function startConnectPoll() {
    if (_pollConnect) clearInterval(_pollConnect);
    _connectPollN = 0;
    _connectPollStarted = Date.now();
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      _connectPollN += 1;
      
      // Enquanto o QR não estiver em tela, ocasionalmente permita que /status devolva o QR.
      // skip_qr=1 impede buscar/devolver QR no servidor; por isso usamos a cada ~18s.
      const wantQr = !_qr;
      const fetchQrThisTick = wantQr && (_connectPollN === 1 || _connectPollN % 3 === 0);
      refreshStatus({ skipQr: !fetchQrThisTick, refreshQr: false }).then(async () => {
        if (_status === 'open' && _sessionLive) {
          if (_pollConnect) { clearInterval(_pollConnect); _pollConnect = null; }
          _qr = null;
          // Fecha o QR imediatamente — pullChats pode demorar e deixava o modal aberto.
          if (typeof window.WA !== 'undefined' && WA.closeQrModal) WA.closeQrModal();
          notifyKanbanState({ connecting: false });
          if (typeof showToast === 'function') {
            showToast('WhatsApp conectado! Carregando conversas…', 'success');
          }
          await loadOwnProfile(true);
          startChatsPoll();
          startEventsPoll();
          await pullChats(true, false);
          notifyKanbanState();
          if (_chats.length > 0 && typeof showToast === 'function') {
            showToast(`${_chats.length} conversa(s) carregada(s).`, 'success');
          }
          return;
        }
        if (_status !== 'connecting') return;
        const elapsed = Date.now() - _connectPollStarted;
        const qrStale = !_qr || elapsed > 120000;
        if (_connectPollN >= 36 && elapsed > 180000 && qrStale) {
          _connectPollN = 0;
          _connectPollStarted = Date.now();
          try {
            await api('disconnect', { method: 'POST' });
            _status = 'close';
            _qr = null;
            notifyKanbanState();
            await connect();
          } catch (_) { /* noop */ }
        }
      }).catch((e) => {
        console.error('[WhatsAppChat.connectPoll]', e);
      });
    };
    tick();
    _pollConnect = setInterval(tick, POLL_CONNECT_MS);
  }

  function startChatsPoll() {
    if (_pollChats) clearInterval(_pollChats);
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (!isEffectivelyOpen()) return;
      // Sem force_sync no tick — mirror/enrich só no load inicial / pull forçado.
      loadChats(true, { force: false }).catch(() => {});
    };
    tick();
    const gap = _activeChatId ? POLL_CHATS_MS : POLL_CHATS_IDLE_MS;
    _pollChats = setInterval(tick, gap);
  }

  function updateComposeMode() {
    const input = document.getElementById('waMsgInput');
    const sendBtn = document.getElementById('waSendBtn');
    const micBtn = document.getElementById('waMicBtn');
    const hasText = !!(input?.value || '').trim();
    const connected = isEffectivelyOpen();
    const chatOpen = !!_activeChatId;
    const showMic = chatOpen && connected && (_recordMode === 'idle' ? !hasText : true);
    sendBtn?.classList.toggle('is-hidden', !hasText || _recordMode !== 'idle');
    if (micBtn) {
      if (showMic && _recordMode === 'idle') micBtn.classList.remove('is-hidden');
      else if (_recordMode === 'idle') micBtn.classList.add('is-hidden');
      const unavailable = !connected || !chatOpen;
      micBtn.classList.toggle('is-unavailable', unavailable);
      micBtn.setAttribute('aria-disabled', unavailable ? 'true' : 'false');
      micBtn.removeAttribute('disabled');
    }
  }

  function bindComposeDelegation() {
    const compose = document.getElementById('waCompose');
    if (!compose || compose.dataset.delegateBound === '1') return;
    compose.dataset.delegateBound = '1';

    compose.addEventListener('click', (e) => {
      if (e.target.closest('#waRecordCancel')) {
        e.preventDefault();
        cancelAudioRecord();
        return;
      }
      if (e.target.closest('#waRecordStop')) {
        e.preventDefault();
        requestStopAudioRecord();
        return;
      }
      if (e.target.closest('#waRecordDiscard')) {
        e.preventDefault();
        discardPendingAudio();
        return;
      }
      if (e.target.closest('#waRecordPlay')) {
        e.preventDefault();
        togglePreviewPlayback();
        return;
      }
      if (e.target.closest('#waRecordSend')) {
        e.preventDefault();
        sendPendingAudio();
        return;
      }
    });
  }

  function bindMicEvents() {
    bindComposeDelegation();
  }

  function bindRecordPanelEvents() {
    bindComposeDelegation();
  }

  function bindComposeEvents() {
    const input = document.getElementById('waMsgInput');
    const btn = document.getElementById('waSendBtn');
    bindComposeDelegation();
    bindMicEvents();
    if (!input || input.dataset.bound === '1') {
      updateComposeMode();
      return;
    }
    input.dataset.bound = '1';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        WhatsAppChat.sendMessage();
      }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 100)}px`;
      updateComposeMode();
    });
    btn?.addEventListener('click', () => WhatsAppChat.sendMessage());
    const attachBtn = document.getElementById('waAttachBtn');
    const fileInput = document.getElementById('waFileInput');
    attachBtn?.addEventListener('click', () => {
      closeEmojiPanel();
      fileInput?.click();
    });
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (file) {
        Promise.resolve(WhatsAppChat.sendMedia(file)).catch(() => { /* toast já exibido */ });
      }
    });
    bindEmojiEvents();
    updateComposeMode();
  }

  function bindFilterEvents() {
    const filters = document.getElementById('waChatFilters');
    if (!filters || filters.dataset.bound === '1') return;
    filters.dataset.bound = '1';
    filters.addEventListener('click', (e) => {
      const pill = e.target.closest('.wa-filter-pill');
      if (!pill?.dataset.filter) return;
      _listFilter = pill.dataset.filter;
      filters.querySelectorAll('.wa-filter-pill').forEach(p => {
        p.classList.toggle('is-active', p.dataset.filter === _listFilter);
      });
      renderChatList();
    });
  }

  function bindSidebarEvents() {
    const newBtn = document.getElementById('waNewChatBtn');
    const newBlock = document.getElementById('waNewChatBlock');
    const search = document.getElementById('waChatSearch');
    if (newBtn && newBlock && newBtn.dataset.bound !== '1') {
      newBtn.dataset.bound = '1';
      newBtn.addEventListener('click', () => {
        newBlock.classList.toggle('is-open');
        if (newBlock.classList.contains('is-open')) {
          document.getElementById('waNewPhone')?.focus();
        }
      });
    }
    if (search && search.dataset.bound !== '1') {
      search.dataset.bound = '1';
      search.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const q = (search.value || '').trim();
        const digits = q.replace(/\D/g, '');
        if (digits.length >= 10) {
          e.preventDefault();
          WhatsAppChat.openChatByPhone(q, '');
        }
      });
    }
    bindFilterEvents();
  }

  function isKanbanEmbed() {
    return !!document.getElementById('waInboxList');
  }

  function composeFooterHtml() {
    return `
            <footer id="waCompose" class="wa-compose is-hidden">
              <div id="waEmojiPanel" class="wa-emoji-panel" role="dialog" aria-label="Emojis">
                <div id="waEmojiMount" class="wa-emoji-mount"></div>
              </div>
              <div class="wa-compose__bar" id="waComposeBar" style="position: relative; display: flex; align-items: center; gap: 8px;">
                <button type="button" id="waEmojiBtn" class="wa-compose-icon-btn wa-emoji-btn" title="Emoji" aria-label="Emoji">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                </button>
                
                <button type="button" id="waAttachBtn" class="wa-compose-icon-btn" title="Anexar" aria-label="Anexar">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                </button>
                <input type="file" id="waFileInput" class="wa-file-input" accept="image/jpeg,image/png,image/gif,image/webp,audio/mpeg,audio/ogg,audio/mp4,audio/aac,audio/wav,audio/webm,.webp,.mp3,.ogg,.m4a,.aac,.wav,.webm" hidden/>
                
                <div class="wa-compose__input-wrap" style="flex: 1;">
                  <textarea id="waMsgInput" rows="1" placeholder="Digite uma mensagem"></textarea>
                </div>
                
                <button type="button" id="waMicBtn" class="wa-compose-icon-btn wa-mic-btn" title="Mensagem de voz" aria-label="Mensagem de voz" onclick="WhatsAppChat.onMicClick(event)">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/></svg>
                </button>
                <button type="button" id="waSendBtn" class="wa-send-btn is-hidden" title="Enviar" aria-label="Enviar">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
              </div>
              <div id="waRecordPanel" class="wa-record-panel is-hidden" aria-live="polite">
                <div id="waRecordLive" class="wa-record-live">
                  <button type="button" id="waRecordCancel" class="wa-record-btn wa-record-btn--cancel" title="Cancelar gravação" aria-label="Cancelar">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                  <span class="wa-record-dot" aria-hidden="true"></span>
                  <span id="waRecordTimer" class="wa-record-timer">0:00</span>
                  <div id="waRecordWave" class="wa-record-wave" aria-hidden="true"></div>
                  <button type="button" id="waRecordStop" class="wa-record-btn wa-record-btn--stop" title="Parar gravação" aria-label="Parar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                  </button>
                </div>
                <div id="waRecordPreview" class="wa-record-preview is-hidden">
                  <button type="button" id="waRecordDiscard" class="wa-record-btn wa-record-btn--cancel" title="Descartar" aria-label="Descartar">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                  </button>
                  <button type="button" id="waRecordPlay" class="wa-record-preview__play" title="Ouvir" aria-label="Ouvir gravação">
                    <svg class="wa-record-play-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    <svg class="wa-record-pause-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>
                    <span id="waPreviewDur" class="wa-record-preview__dur">0:00</span>
                  </button>
                  <button type="button" id="waRecordSend" class="wa-send-btn wa-record-preview__send" title="Enviar áudio" aria-label="Enviar áudio">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                  </button>
                </div>
              </div>
            </footer>`;
  }

  function threadShellHtml() {
    return `
        <div id="waCrmThreadWrap" class="wa-crm__thread-wrap">
          <header class="wa-thread-header" id="waThreadHeader">
            <button type="button" class="wa-thread-back" onclick="WhatsAppChat.backToList()" title="Voltar">←</button>
            <button type="button" class="wa-thread-close" onclick="(window.WA&&WA.closeChat)?WA.closeChat():WhatsAppChat.backToList()" title="Fechar" aria-label="Fechar">✕</button>
            <div class="wa-thread-avatar" id="waThreadAvatar">?</div>
            <div class="wa-thread-header__info">
              <strong id="waThreadTitle">WhatsApp</strong>
              <span id="waThreadSubtitle" class="wa-thread-subtitle"></span>
            </div>
          </header>
          <div id="waThreadBody" class="wa-thread-body" style="position: relative;">
            <div id="waWelcome" class="wa-welcome is-hidden"></div>
            <div id="waMessages" class="wa-messages is-hidden"></div>
            ${composeFooterHtml()}
          </div>
        </div>`;
  }

  function ensureThreadShell() {
    const root = document.getElementById('waChatRoot');
    if (!root) return;
    if (root.dataset.thread === THREAD_SHELL_VER) {
      bindComposeEvents();
      return;
    }
    root.className = 'wa-thread-only';
    root.dataset.thread = THREAD_SHELL_VER;
    delete root.dataset.crm;
    root.innerHTML = threadShellHtml();
    bindComposeEvents();
  }

  function ensureCrmShell() {
    const root = document.getElementById('waChatRoot');
    if (!root) return;
    if (isKanbanEmbed()) {
      _kanbanMode = true;
      ensureThreadShell();
      return;
    }
    if (root.dataset.crm === CRM_SHELL_VER) {
      bindComposeEvents();
      bindSidebarEvents();
      return;
    }

    const connectPanel = document.getElementById('waConnectPanel');
    if (connectPanel) connectPanel.style.display = 'none';

    root.className = 'wa-crm';
    root.dataset.crm = CRM_SHELL_VER;
    root.innerHTML = `
      <aside class="wa-crm__sidebar">
        <header class="wa-crm__sidebar-head">
          <strong>WhatsApp</strong>
          <div class="wa-crm__head-actions" id="waHeadActions">
            <button type="button" class="wa-crm__icon-btn" id="waNewChatBtn" title="Nova conversa" aria-label="Nova conversa">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19.005 3.175H4.674C3.642 3.175 3 3.789 3 4.821V21.02l3.544-3.548h12.461c1.033 0 2.064-1.06 2.064-2.093V4.821c0-1.032-1.032-1.646-2.064-1.646zm-9.97 8.378h3.128v3.128h-3.128v-3.128zm0-4.255h3.128v3.129h-3.128V7.298zm4.255 4.255h3.129v3.128h-3.129v-3.128zm0-4.255h3.129v3.129h-3.129V7.298z"/></svg>
            </button>
          </div>
        </header>
        <div class="wa-crm__search-wrap">
          <div class="wa-crm__search">
            <span class="wa-crm__search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15.9 14.3H15l-.3-.3c1-1.1 1.6-2.7 1.6-4.3 0-3.7-3-6.7-6.7-6.7S3 6 3 9.7s3 6.7 6.7 6.7c1.6 0 3.2-.6 4.3-1.6l.3.3v.8l5.1 5.1 1.5-1.5-5-5.2zm-6.2 0c-2.6 0-4.6-2.1-4.6-4.6s2.1-4.6 4.6-4.6 4.6 2.1 4.6 4.6-2 4.6-4.6 4.6z"/></svg>
            </span>
            <input type="search" id="waChatSearch" placeholder="Pesquisar ou começar uma nova conversa" oninput="WhatsAppChat.filterChats(this.value)"/>
          </div>
        </div>
        <div class="wa-crm__filters" id="waChatFilters">
          <button type="button" class="wa-filter-pill is-active" data-filter="all">Tudo</button>
          <button type="button" class="wa-filter-pill" data-filter="unread">Não lidas</button>
        </div>
        <div class="wa-crm__new" id="waNewChatBlock">
          <label>Nova conversa</label>
          <div class="wa-crm__new-row">
            <input type="text" id="waNewPhone" placeholder="(62) 99999-9999"/>
            <input type="text" id="waNewName" placeholder="Nome"/>
            <button type="button" class="btn btn-primary btn-sm" onclick="WhatsAppChat.openNewChat()">Abrir</button>
          </div>
        </div>
        <div id="waChatList" class="wa-crm__chats"></div>
      </aside>
      <main class="wa-crm__main">
        <div id="waCrmQrScreen" class="wa-crm__qr-screen"></div>
        <div id="waCrmThreadWrap" class="wa-crm__thread-wrap is-hidden">
          <header class="wa-thread-header" id="waThreadHeader">
            <button type="button" class="wa-thread-back" onclick="WhatsAppChat.backToList()" title="Voltar">←</button>
            <div class="wa-thread-avatar" id="waThreadAvatar">?</div>
            <div class="wa-thread-header__info">
              <strong id="waThreadTitle">WhatsApp</strong>
              <span id="waThreadSubtitle" class="wa-thread-subtitle"></span>
            </div>
            <div class="wa-thread-header__actions">
              <button type="button" class="wa-thread-icon-btn" title="Pesquisar na conversa" aria-hidden="true" tabindex="-1">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.9 14.3H15l-.3-.3c1-1.1 1.6-2.7 1.6-4.3 0-3.7-3-6.7-6.7-6.7S3 6 3 9.7s3 6.7 6.7 6.7c1.6 0 3.2-.6 4.3-1.6l.3.3v.8l5.1 5.1 1.5-1.5-5-5.2zm-6.2 0c-2.6 0-4.6-2.1-4.6-4.6s2.1-4.6 4.6-4.6 4.6 2.1 4.6 4.6-2 4.6-4.6 4.6z"/></svg>
              </button>
              <button type="button" class="wa-thread-icon-btn" title="Chamada de vídeo" aria-hidden="true" tabindex="-1">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
              </button>
            </div>
          </header>
          <div id="waThreadBody" class="wa-thread-body">
            <div id="waWelcome" class="wa-welcome">
              <div class="wa-welcome__logo">
                <svg viewBox="0 0 24 24" width="72" height="72" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
              </div>
              <h4>WhatsApp Web</h4>
              <p>Envie e receba mensagens sem manter seu celular conectado.<br/>Selecione um contato à esquerda para conversar.</p>
            </div>
            <div id="waMessages" class="wa-messages is-hidden"></div>
            ${composeFooterHtml()}
          </div>
        </div>
      </main>`;
    bindComposeEvents();
    bindSidebarEvents();
  }

  function setCrmMode() {
    const root = document.getElementById('waChatRoot');
    if (!root) return;

    if (_kanbanMode) {
      const threadWrap = document.getElementById('waCrmThreadWrap');
      const showThread = isEffectivelyOpen() && !!_activeChatId;
      threadWrap?.classList.toggle('is-hidden', !showThread);
      root.classList.toggle('wa-thread-only--active', showThread);
      return;
    }

    root.classList.toggle('wa-crm--connected', isEffectivelyOpen());
    root.classList.toggle('wa-crm--chat-open', !!_activeChatId);
  }

  function activeChat() {
    return _chats.find(c => c.id === _activeChatId) || null;
  }

  async function promptRenameContact(chat) {
    if (!chat || !chat.id) return;
    const current = displayContactName(chat);
    const input = window.prompt('Novo nome para este contato:', current);
    if (input === null) return; // cancelou
    const newName = input.trim();
    if (newName === '' || newName === current) return;
    try {
      const data = await api('update_contact', { method: 'POST', body: { chat_id: chat.id, name: newName } });
      const idx = _chats.findIndex(c => String(c.id) === String(chat.id));
      if (idx >= 0) _chats[idx] = { ..._chats[idx], contact_name: data.contact_name || newName };
      if (Array.isArray(data.chats)) _chats = data.chats;
      renderChatList();
      renderThreadHeader();
      if (typeof showToast === 'function') showToast('Contato renomeado.', 'success');
    } catch (e) {
      if (typeof showToast === 'function') showToast(e.message || 'Erro ao renomear.', 'error');
    }
  }

  function renderThreadHeader() {
    const title = document.getElementById('waThreadTitle');
    const subtitle = document.getElementById('waThreadSubtitle');
    const avatar = document.getElementById('waThreadAvatar');
    const chat = activeChat();

    if (!chat || !_activeChatId) {
      if (title) title.textContent = 'WhatsApp';
      if (subtitle) subtitle.textContent = '';
      if (avatar) avatar.textContent = 'W';
      return;
    }

    const name = displayContactName(chat);
    if (title) {
      title.textContent = name;
      title.title = 'Clique para renomear o contato';
      title.style.cursor = 'pointer';
      title.onclick = () => promptRenameContact(chat);
    }
    if (subtitle) {
      let subText = isPlausiblePhone(chat.contact_phone) ? fmtPhone(chat.contact_phone) : '';
      const stageId = kanbanStageId(chat);
      
      let optionsHtml = '';
      _kanbanStages.forEach(s => {
        const sel = s.id === stageId ? ' selected' : '';
        optionsHtml += `<option value="${s.id}"${sel}>${esc(s.name)}</option>`;
      });

      subtitle.innerHTML = `
        <span style="display:inline-flex; align-items:center; gap: 8px; flex-wrap: wrap;">
          <span>${esc(subText)}</span>
          <span style="display:inline-flex; align-items:center; gap: 4px; background: rgba(47,129,247,0.15); border: 1px solid rgba(47,129,247,0.3); border-radius: 6px; padding: 2px 8px; font-size: 11px; font-weight: 600; color: #2f81f7;">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:2px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
            <select onchange="WhatsAppChat.updateChatStage('${esc(chat.id)}', this.value)" style="background:none; border:none; color:inherit; font-family:inherit; font-size:inherit; font-weight:inherit; padding:0; margin:0; outline:none; cursor:pointer;">
              ${optionsHtml}
            </select>
          </span>
          <button type="button" class="wa-action-icon" title="Etiquetas" onclick="event.stopPropagation();WhatsAppCRM.editDealTags('${esc(chat.id)}', '${esc(chat.deal_tags||'')}', event)">🏷️</button>
        </span>
      `;
    }
    if (avatar) {
      const chat = _chats.find(c => c.id === _activeChatId);
      if (chat) loadThreadAvatarNow(chat);
      else {
        avatar.className = 'wa-thread-avatar wa-avatar-fallback';
        avatar.textContent = '?';
      }
    }
  }

  function bubbleDeleteBtn(m) {
    if (m.direction !== 'out' || !m.id) return '';
    return `<button type="button" class="wa-msg-delete" data-delete-msg="${esc(m.id)}" title="Apagar mensagem" aria-label="Apagar mensagem">×</button>`;
  }

  function renderMessages() {
    const box = document.getElementById('waMessages');
    const welcome = document.getElementById('waWelcome');
    const compose = document.getElementById('waCompose');
    if (!box) return;

    if (!_activeChatId || !isEffectivelyOpen()) {
      if (!_kanbanMode) welcome?.classList.remove('is-hidden');
      box.classList.add('is-hidden');
      compose?.classList.add('is-hidden');
      return;
    }

    welcome?.classList.add('is-hidden');
    box.classList.remove('is-hidden');
    compose?.classList.remove('is-hidden');
    updateComposeMode();

    const prevScrollTop = box.scrollTop;
    const prevScrollHeight = box.scrollHeight;
    const wasNearBottom = !prevScrollHeight || (prevScrollHeight - prevScrollTop - box.clientHeight) < 80;

    let html = '';
    if (!_messages.length) {
      html = `<div class="wa-chat-start"><span>Mensagens protegidas com criptografia de ponta a ponta. Envie a primeira mensagem.</span></div>`;
    } else {
      _messages.forEach(m => {
        const type = String(m.message_type || 'text').toLowerCase();
        const src = mediaSrc(m.media_url);
        const mid = esc(m.id || '');
        if (type === 'sticker' && src) {
          const cls = m.direction === 'out' ? 'wa-bubble wa-bubble--out wa-bubble--sticker' : 'wa-bubble wa-bubble--in wa-bubble--sticker';
          html += `<div class="${cls}">${bubbleDeleteBtn(m)}<img class="wa-bubble__sticker" src="${esc(src)}" alt="Figurinha" loading="lazy" data-msg-id="${mid}" onerror="WhatsAppChat._onMediaImgError(this)"/><span class="wa-bubble__time wa-bubble__time--sticker">${esc(fmtTime(m.created_at))}</span></div>`;
          return;
        }
        const clsBase = m.direction === 'out' ? 'wa-bubble wa-bubble--out' : 'wa-bubble wa-bubble--in';
        const cls = clsBase + (m._pending ? ' wa-bubble--pending' : '');
        let content = '';
        if (type === 'sticker') {
          content = `<span class="wa-bubble__text wa-bubble__pending-media" data-msg-id="${mid}">${esc(m.body || '[Figurinha]')}</span>`;
        } else if (type === 'image' && src) {
          const dlName = `imagem-${m.id || Date.now()}.jpg`;
          content = `<div class="wa-bubble__media"><img class="wa-bubble__img" src="${esc(src)}" alt="Imagem" loading="lazy" data-msg-id="${mid}" onerror="WhatsAppChat._onMediaImgError(this)"/><button type="button" class="wa-media-dl" data-download-media data-src="${esc(src)}" data-name="${esc(dlName)}" title="Baixar">↓</button></div>`;
          if (m.body && m.body !== '[Imagem]') {
            content += `<span class="wa-bubble__text">${esc(m.body)}</span>`;
          }
        } else if (type === 'image') {
          content = `<span class="wa-bubble__text wa-bubble__pending-media" data-msg-id="${mid}">${esc(m.body || '[Imagem]')}</span>`;
        } else if (type === 'video' && src) {
          content = `<div class="wa-bubble__media"><video class="wa-bubble__video" controls preload="metadata" src="${esc(src)}"></video><button type="button" class="wa-media-dl" data-download-media data-src="${esc(src)}" data-name="video-${esc(m.id || 'msg')}.mp4" title="Baixar">↓</button></div>`;
          if (m.body && m.body !== '[Vídeo]') {
            content += `<span class="wa-bubble__text">${esc(m.body)}</span>`;
          }
        } else if (type === 'video') {
          content = `<span class="wa-bubble__text">${esc(m.body || '[Vídeo]')}</span>`;
        } else if (type === 'audio' && src) {
          const mime = mimeFromMediaUrl(src);
          const dlName = `audio-${m.id || Date.now()}.${(mime || '').includes('ogg') ? 'ogg' : 'webm'}`;
          content = `<div class="wa-bubble__media"><audio class="wa-bubble__audio" controls preload="metadata" src="${esc(src)}"${mime && mime.startsWith('audio/') ? ` type="${esc(mime)}"` : ''} data-msg-id="${mid}" onerror="WhatsAppChat._onAudioError(this)"></audio><button type="button" class="wa-media-dl" data-download-media data-src="${esc(src)}" data-name="${esc(dlName)}" title="Baixar">↓</button></div>`;
        } else if (type === 'audio') {
          content = `<span class="wa-bubble__text wa-bubble__pending-media" data-msg-id="${mid}">${esc(m.body || '[Áudio]')}</span>`;
        } else {
          content = `<span class="wa-bubble__text">${esc(m.body || '')}</span>`;
        }
        html += `<div class="${cls}">${bubbleDeleteBtn(m)}<div class="wa-bubble__inner">${content}<span class="wa-bubble__time">${esc(fmtTime(m.created_at))}</span></div></div>`;
      });
    }
    box.innerHTML = html;
    applyTwemoji(box);
    if (wasNearBottom) {
      box.scrollTop = box.scrollHeight;
    } else {
      box.scrollTop = Math.max(0, prevScrollTop + (box.scrollHeight - prevScrollHeight));
    }
    bindMediaEvents();
    scheduleThreadMediaRepair();
  }

  function renderThread() {
    renderThreadHeader();
    renderMessages();
  }

  async function refreshStatus(opts = {}) {
    const skipQr = !!opts.skipQr;
    const refreshQr = !!opts.refreshQr;
    const skipSideEffects = !!opts.skipSideEffects;
    const wantProfile = !!opts.wantProfile || (!_profilePic && !_profilePicRequested);
    const query = {};
    if (skipQr) query.skip_qr = '1';
    if (refreshQr) query.refresh_qr = '1';
    if (wantProfile) {
      query.profile_pic = '1';
      _profilePicRequested = true;
    }
    const data = await api('status', { query });
    _configured = !!data.configured;
    const prev = _status;
    const incomingStatus = data.status || 'close';
    if (_qr && incomingStatus === 'open' && !data.session_live) {
      _status = 'connecting';
    } else {
      _status = incomingStatus;
    }
    _phone = data.phone || null;
    _sessionLive = !!data.session_live;
    _serverChatsCount = Number(data.chats_count) || 0;
applyProfilePicFromStatus(data);
    const serverLocked = !!(data.rebind_required || data.disconnected || data.session_locked);
    if (_status === 'open' && !serverLocked) {
      _rebindRequired = false;
    } else {
      _rebindRequired = serverLocked;
      if (_rebindRequired) {
        _status = 'close';
        _qr = null;
      }
    }
    if (_rebindRequired || (_status !== 'open' && serverLocked)) {
      _chats = [];
      _messages = [];
      _msgFingerprint = '';
      _activeChatId = null;
    }
    if (data.qr) {
      _qr = data.qr;
    } else if (refreshQr) {
      if (data.status === 'open' && _sessionLive) _qr = null;
    } else if (!skipQr && data.status !== 'connecting' && _status !== 'connecting') {
      _qr = null;
    }
    if (!skipSideEffects && isEffectivelyOpen() && prev !== 'open' && _syncEnabled) {
      await loadContacts(true, true);
    }

    if (!skipSideEffects) {
      renderHeadActions();
      renderQrScreen();
      renderChatList();
      if (!isUserTyping()) renderThread();
      setCrmMode();
      updateComposeMode();
    }

    if (!skipSideEffects && isEffectivelyOpen()) {
      if (_pollConnect) { clearInterval(_pollConnect); _pollConnect = null; }
      _connectPollN = 0;
      _connectPollStarted = 0;
      const justOpened = prev !== 'open';
      await pullChats(true, justOpened && _serverChatsCount === 0);
      startChatsPoll();
      startMsgPoll();
      startEventsPoll();
    } else if (!skipSideEffects && _phone && !_rebindRequired && _configured) {
      await pullChats(true, _chats.length === 0);
      startChatsPoll();
    } else if (!skipSideEffects) {
      stopPollers();
      if (_status === 'connecting') startConnectPoll();
    }
    notifyKanbanState();
    return data;
  }

  async function loadChats(silent, opts = {}) {
    if (!canLoadWaChats()) {
      if (!isEffectivelyOpen() && _status !== 'connecting') {
        _chats = [];
        if (!silent) {
          renderChatList();
          notifyKanbanState();
        }
        return;
      }
    }
    const query = {};
    // MySQL-first: mirror leve só se servidor vazio; force_sync só no refresh manual (evita prune destrutivo).
    if (opts.force) {
      query.mirror = '1';
      query.force_sync = '1';
      query.enrich = '1';
    } else if (_serverChatsCount === 0 && (_status === 'open' || _phone)) {
      query.mirror = '1';
    }
    const data = await api('chats', { query });
    if (data.user_id && data.user_id !== _userId) {
      hardResetLocalState();
      throw new Error('Sessão trocou. Recarregue a página.');
    }
    if (data.rebind_required || data.disconnected || data.session_locked) {
      _rebindRequired = true;
      _status = 'close';
      _chats = [];
      stopPollers();
      render();
      notifyKanbanState();
      return;
    }
    _chats = dedupeChatsByPhone(applyIncomingChats(_chats, data.chats || []));
    const _dedupedCount = _chats.length;
    if (typeof window._dbgSessionLog === 'function' && data.chats?.length) {
      window._dbgSessionLog('whatsapp-chat.js:loadChats', 'chats deduped', {
        raw: data.chats.length,
        deduped: _dedupedCount,
        removed: Math.max(0, data.chats.length - _dedupedCount),
      }, 'H-dedupe-ui');
    }
    _serverChatsCount = _chats.length;
    if (!silent) {
      window._waContactCache = {};
    }
    renderChatList();
    notifyKanbanState();
  }

  async function loadContacts(silent, force) {
    if (_syncing || !isEffectivelyOpen() || !_syncEnabled) return;
    _syncing = true;
    try {
      const data = await api('sync_contacts', { method: 'POST', body: force ? { force: true } : {} });
      _chats = dedupeChatsByPhone(applyIncomingChats(_chats, data.chats || []));
      window._waContactCache = {};
      renderChatList();
      notifyKanbanState();
      if (!silent && data.synced > 0 && typeof showToast === 'function') {
        showToast(`${data.synced} conversa(s) espelhada(s) do WhatsApp.`, 'success');
      } else if (!silent && data.skipped && typeof showToast === 'function') {
        showToast('Lista já sincronizada recentemente.', 'info');
      }
    } catch (e) {
      if (!silent && typeof showToast === 'function') {
        showToast(e.message || 'Erro ao carregar contatos.', 'warning');
      }
    } finally {
      _syncing = false;
    }
  }

  async function loadMessages(chatId, silent) {
    const query = { chat_id: chatId };
    // Mirror de mensagens só na abertura do chat (não no poll silencioso).
    if (!silent && isEffectivelyOpen() && _mirrorMode) query.mirror = '1';
    const data = await api('messages', { query });
    const newMsgs = data.messages || [];
    if (data.chat?.id) {
      const idx = _chats.findIndex(c => c.id === data.chat.id);
      if (idx >= 0) {
        const merged = { ..._chats[idx], ...data.chat };
        merged.kanban_stage = resolveKanbanStage(
          data.chat.id,
          data.chat.kanban_stage,
          _chats[idx].kanban_stage
        );
        _chats[idx] = merged;
      }
    }
    const fp = msgFingerprint(newMsgs);
    const changed = fp !== _msgFingerprint;
    _messages = newMsgs;
    _msgFingerprint = fp;
    if (!silent) _activeChatId = chatId;
    setCrmMode();
    if (!silent || (changed && !isUserTyping())) {
      renderThread();
    } else if (!silent) {
      renderThreadHeader();
    }
  }

  async function connect(opts = {}) {
    const force = !!opts.force;
    if (_connectInFlight && !force) return _connectInFlight;
    _lastConnectError = '';
    notifyKanbanState({ connecting: true });
    const useOverlay = !_kanbanMode && !opts.silent;
    if (useOverlay && typeof showLoading === 'function') showLoading('Gerando QR Code...');
    const run = (async () => {
      try {
        if (_configured === false) {
          throw new Error('WhatsApp não configurado no servidor. Peça ao administrador para configurar a Evolution API.');
        }
        // Após reset/rebind, força QR limpo (não reaproveitar sessão fantasma).
        const forceQr = force || !!_rebindRequired || _status === 'close' || !_sessionLive;
const data = await withTimeout(api('connect', { method: 'POST', body: { force_qr: !!forceQr } }), 90000, 'Gerar QR Code');
_rebindRequired = false;
        _status = data.status || 'connecting';
        if (data.phone) _phone = data.phone;
        if (data.qr) _qr = data.qr;
        renderHeadActions();
        if (_status === 'open') {
          _qr = null;
          renderQrScreen();
          stopPollers();
          await refreshStatus({ skipQr: true });
          notifyKanbanState();
          if (typeof showToast === 'function' && !_kanbanMode) showToast('WhatsApp conectado.', 'success');
          return { ok: true, qr: null, status: 'open' };
        }
        renderQrScreen();
        startConnectPoll();
        notifyKanbanState();
        if (!data.qr) {
          _lastConnectError = '';
          try {
            // Não usar skip_qr aqui: se a Evolution ainda não devolveu o QR no /connect,
            // precisamos permitir que o /status busque/devolva o QR (cache ou servidor).
            const st = await withTimeout(refreshStatus({ refreshQr: false, skipQr: false }), 45000, 'Buscar QR');
            if (st?.qr) _qr = st.qr;
            notifyKanbanState();
          } catch (_) { /* status poll continua em background */ }
        }
        if (!data.qr && !_qr && typeof showToast === 'function' && !_kanbanMode) {
          showToast('QR ainda não retornou. Aguarde ou clique em Gerar QR Code novamente.', 'warning');
        } else if (data.qr && typeof showToast === 'function' && !_kanbanMode) {
          showToast('Escaneie o QR Code no celular.', 'info');
        }
        return { ok: true, qr: _qr || data.qr || null, status: _status };
      } catch (e) {
        console.error('[WhatsAppChat.connect]', e);
        _lastConnectError = e.message || 'Erro ao conectar.';
        const el = document.getElementById('waCrmQrScreen');
        if (el && !_kanbanMode) {
          el.classList.remove('is-hidden');
          el.innerHTML = `<div class="wa-crm__qr-card"><div class="wa-alert">${esc(_lastConnectError)}</div><button type="button" class="btn btn-primary" onclick="WhatsAppChat.connect()">Tentar novamente</button></div>`;
        }
        if (typeof showToast === 'function' && !_kanbanMode) showToast(_lastConnectError, 'error');
        notifyKanbanState({ error: _lastConnectError });
        return { ok: false, error: _lastConnectError };
      } finally {
        _connectInFlight = null;
        if (useOverlay && typeof hideLoading === 'function') hideLoading();
        notifyKanbanState({ connecting: false });
      }
    })();
    _connectInFlight = run;
    return run;
  }

  /** Busca QR — freshReset só em "Reiniciar meu WhatsApp". Uma requisição por vez. */
  async function fetchQrForModal(force, opts = {}) {
    if (_qrFetchPromise && !opts.freshReset) {
      return _qrFetchPromise;
    }
    if (opts.freshReset && _qrFetchPromise) {
      try { await _qrFetchPromise; } catch (_) { /* noop */ }
      _qrFetchPromise = null;
    }
    const run = (async () => {
    const freshReset = !!opts.freshReset;
    _lastConnectError = '';
    notifyKanbanState({ connecting: true });
    const QR_TIMEOUT_MS = 120000;
    try {
      if (_configured === false) {
        throw new Error('WhatsApp não configurado no servidor.');
      }
      if (_configured === null) {
        const cfg = await api('config');
        _configured = !!cfg.configured;
        if (!_configured) throw new Error('WhatsApp não configurado no servidor.');
      }
      if (freshReset) {
        await api('reset_session', { method: 'POST', body: { clear_data: true } });
        hardResetLocalState();
        _rebindRequired = true;
        notifyKanbanState();
      }
      const tryQr = async (label) => {
        const data = await withTimeout(
          api('qr', { method: 'POST', body: { force_qr: !!force } }),
          QR_TIMEOUT_MS,
          label
        );
        if (data.status === 'open' && !data.qr && data.session_live) {
          _sessionLive = true;
          _status = 'open';
          _qr = null;
          stopPollers();
          await refreshStatus({ skipQr: true });
          await pullChats(true, false);
          notifyKanbanState({ connecting: false });
          return { ok: true, status: 'open', alreadyConnected: true };
        }
        const qr = data.qr || null;
        if (qr) {
          _qr = qr;
          _status = data.status || 'connecting';
          _rebindRequired = false;
          startConnectPoll();
          notifyKanbanState({ connecting: false });
          return { ok: true, qr, status: _status };
        }
        return null;
      };
      if (!freshReset && !force && _qr) {
        startConnectPoll();
        notifyKanbanState({ connecting: false });
        return { ok: true, qr: _qr, status: _status || 'connecting' };
      }
      let hit = await tryQr('Gerar QR');
      if (hit) return hit;
      if (!force) {
        hit = await tryQr('Gerar QR (retry)');
        if (hit) return hit;
      }
      const data = await withTimeout(
        api('connect', { method: 'POST', body: { force_qr: !!force } }),
        QR_TIMEOUT_MS,
        'Conectar'
      );
      _rebindRequired = false;
      _status = data.status || 'connecting';
      if (data.qr) _qr = data.qr;
      if (data.status === 'open' && !data.qr) {
        _sessionLive = true;
        _qr = null;
        stopPollers();
        await refreshStatus({ skipQr: true });
        await pullChats(true, false);
        notifyKanbanState({ connecting: false });
        return { ok: true, status: 'open', alreadyConnected: true };
      }
      startConnectPoll();
      const qr = data.qr || _qr;
      if (qr) {
        notifyKanbanState({ connecting: false });
        return { ok: true, qr, status: _status };
      }
      const st = await withTimeout(refreshStatus({ refreshQr: true, skipSideEffects: true }), QR_TIMEOUT_MS, 'Buscar QR');
      const qr2 = st?.qr || _qr || null;
      notifyKanbanState({ connecting: false });
      if (qr2) return { ok: true, qr: qr2, status: st?.status || _status };
      return { ok: false, error: 'QR não retornou. Clique em Recarregar QR Code ou reinicie a sessão.' };
    } catch (e) {
      _lastConnectError = e.message || 'Erro ao gerar QR Code.';
      notifyKanbanState({ connecting: false, error: _lastConnectError });
      return { ok: false, error: _lastConnectError };
    }
    })();
    _qrFetchPromise = run.finally(() => { _qrFetchPromise = null; });
    return _qrFetchPromise;
  }

  async function simulateScan() {
    try {
      const data = await api('simulate_scan', { method: 'POST' });
      if (data.ok) {
        _status = 'open';
        _qr = null;
        await refreshStatus();
      }
    } catch (e) {
      console.error('[WhatsAppChat.simulateScan]', e);
    }
  }

  async function disconnect() {
    if (typeof showLoading === 'function') showLoading('Desconectando...');
    try {
      await api('disconnect', { method: 'POST' });
      hardResetLocalState();
      _rebindRequired = true;
      stopPollers();
      notifyKanbanState();
      render();
      await refreshStatus({ skipQr: true }).catch(() => {});
      if (typeof showToast === 'function') showToast('WhatsApp desconectado com sucesso.', 'success');
    } catch (e) {
      if (typeof showToast === 'function') showToast('Erro ao desconectar.', 'error');
    } finally {
      if (typeof hideLoading === 'function') hideLoading();
    }
  }

  async function deleteMessage(messageId) {
    if (!messageId || !_activeChatId) return;
    if (!confirm('Apagar esta mensagem?\n\nEla será removida do painel e, quando possível, também no WhatsApp do destinatário.')) return;
    try {
      const data = await api('delete_message', { method: 'POST', body: { message_id: messageId } });
      _messages = _messages.filter((m) => m.id !== messageId);
      _msgFingerprint = msgFingerprint(_messages);
      renderMessages();
      await loadChats(true);
      if (typeof showToast === 'function') {
        showToast(data.revoked_whatsapp ? 'Mensagem apagada no WhatsApp.' : 'Mensagem removida do painel.', 'success');
      }
    } catch (e) {
      if (typeof showToast === 'function') showToast(e.message || 'Erro ao apagar mensagem.', 'error');
    }
  }

  async function sendMessage() {
    const input = document.getElementById('waMsgInput');
    const text = (input?.value || '').trim();
    if (!text || !_activeChatId) return;
    closeEmojiPanel();
    input.value = '';
    input.style.height = 'auto';
    updateComposeMode();
    const chatId = _activeChatId;
    _lastSendAt = Date.now();
    const pendingId = addOptimisticBubble(text, 'text');
    let retried = false;
    const doSend = async () => {
      const data = await api('send', { method: 'POST', body: { chat_id: chatId, text } });
      if (data.message) {
        mergeSentMessage(data.message, pendingId);
      } else {
        removeOptimisticBubble(pendingId);
        await loadMessages(chatId, true);
      }
    };
    try {
      await doSend();
    } catch (e) {
      removeOptimisticBubble(pendingId);
      const msg = String(e.message || '');
      if (!retried && /desconectad|disconnected|rebind|qr code/i.test(msg)) {
        retried = true;
        try {
          await refreshStatus({ skipQr: true });
          if (_status === 'open') {
            _lastSendAt = Date.now();
            const retryPendingId = addOptimisticBubble(text, 'text');
            try {
              const data = await api('send', { method: 'POST', body: { chat_id: chatId, text } });
              if (data.message) {
                mergeSentMessage(data.message, retryPendingId);
              } else {
                removeOptimisticBubble(retryPendingId);
                await loadMessages(chatId, true);
              }
            } catch (retryErr) {
              removeOptimisticBubble(retryPendingId);
              throw retryErr;
            }
            return;
          }
        } catch (_) { /* falhou novamente */ }
      }
      input.value = text;
      updateComposeMode();
      if (typeof showToast === 'function') showToast(msg || 'Erro ao enviar.', 'error');
    }
  }

  async function sendMedia(file) {
    if (!isEffectivelyOpen()) {
      if (typeof showToast === 'function') showToast('Conecte o WhatsApp antes de enviar arquivos.', 'warning');
      throw new Error('WhatsApp desconectado.');
    }
    if (!_activeChatId || !file) {
      throw new Error('Selecione uma conversa e um arquivo.');
    }
    const name = file.name || '';
    const isSticker = (file.type === 'image/webp' || /\.webp$/i.test(name));
    const isImage = !isSticker && (file.type || '').startsWith('image/');
    const isAudio = (file.type || '').startsWith('audio/') || /\.(webm|ogg|m4a|aac|mp3|wav)$/i.test(name);
    if (!isSticker && !isImage && !isAudio) {
      if (typeof showToast === 'function') showToast('Envie imagem (JPG, PNG…), figurinha (WEBP) ou áudio.', 'warning');
      throw new Error('Tipo de arquivo não suportado.');
    }
    if (isAudio && (!file.size || file.size < 200)) {
      if (typeof showToast === 'function') showToast('Áudio vazio. Grave pelo menos 1 segundo.', 'warning');
      throw new Error('Áudio vazio.');
    }
    const audioMime = isAudio ? normalizeAudioMime(file.type, file.name) : '';
    const chatId = _activeChatId;
    const caption = !isSticker ? (document.getElementById('waMsgInput')?.value || '').trim() : '';
    const previewBody = isSticker ? '[Figurinha]' : (isImage ? (caption || '[Imagem]') : '[Áudio]');
    const previewType = isSticker ? 'sticker' : (isImage ? 'image' : 'audio');
    if (typeof showLoading === 'function') showLoading(isSticker ? 'Enviando figurinha...' : (isAudio ? 'Enviando áudio...' : 'Enviando arquivo...'));
    let retried = false;
    let pendingId = '';
    const doSend = async (uploaded) => {
      const mediaPath = String(uploaded.path || '').replace(/^\/uploads\//, '').replace(/^\//, '');
      const mediaType = isSticker ? 'sticker' : (isImage ? 'image' : 'audio');
      const data = await api('send', {
        method: 'POST',
        body: {
          chat_id: chatId,
          media_type: mediaType,
          media_url: mediaPath,
          mimetype: isAudio ? audioMime : (file.type || mimeFromName(file.name)),
          file_name: file.name,
          caption,
          text: caption,
        },
      });
      const input = document.getElementById('waMsgInput');
      if (input) { input.value = ''; input.style.height = 'auto'; updateComposeMode(); }
      if (data.message) {
        mergeSentMessage(data.message, pendingId);
      } else {
        removeOptimisticBubble(pendingId);
        await loadMessages(chatId, true);
      }
    };
    try {
      _lastSendAt = Date.now();
      pendingId = addOptimisticBubble(previewBody, previewType);
      const uploaded = await uploadMedia(file);
      try {
        await doSend(uploaded);
      } catch (e) {
        const msg = String(e.message || '');
        if (!retried && /desconectad|disconnected/i.test(msg)) {
          retried = true;
          await refreshStatus({ skipQr: true });
          if (_status === 'open') {
            await doSend(uploaded);
            return;
          }
        }
        throw e;
      }
    } catch (e) {
      if (pendingId) removeOptimisticBubble(pendingId);
      if (typeof showToast === 'function') {
        const msg = String(e.message || '');
        const hint = /audio|campo|property|ogg|webm/i.test(msg)
          ? (msg || 'Falha ao enviar áudio. Verifique microfone e conexão.')
          : (msg || 'Erro ao enviar arquivo.');
        showToast(hint, 'error');
      }
      throw e;
    } finally {
      if (typeof hideLoading === 'function') hideLoading();
    }
  }

  async function openChatByPhone(phone, name, firstMessage) {
    if (!isEffectivelyOpen()) {
      throw new Error('Conecte o WhatsApp antes de iniciar uma conversa.');
    }
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length < 10) {
      throw new Error('Informe um telefone válido com DDD.');
    }
    const data = await api('open_chat', { method: 'POST', body: { phone: digits, name: name || '' } });
    if (data.chat?.id) {
      const idx = _chats.findIndex((c) => String(c.id) === String(data.chat.id));
      if (idx >= 0) _chats[idx] = { ..._chats[idx], ...data.chat };
      else _chats.unshift(data.chat);
    }
    await pullChats(true, false);
    const chatId = data.chat?.id;
    if (!chatId) return data;
    const msg = String(firstMessage || '').trim();
    if (msg) {
      await api('send', { method: 'POST', body: { chat_id: chatId, text: msg } });
      await loadMessages(chatId, true);
      await pullChats(true, false);
    }
    if (_kanbanMode && window.WA?.openChat) {
      WA.openChat(chatId);
      notifyKanbanState();
      return data;
    }
    _activeChatId = chatId;
    await loadMessages(chatId, false);
    startMsgPoll();
    setCrmMode();
    renderChatList();
    notifyKanbanState();
    return data;
  }

  function renderHeadActions() {
    const el = document.getElementById('waHeadActions');
    if (!el) return;

    const newBtn = `<button type="button" class="wa-crm__icon-btn" id="waNewChatBtn" title="Nova conversa" aria-label="Nova conversa">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19.005 3.175H4.674C3.642 3.175 3 3.789 3 4.821V21.02l3.544-3.548h12.461c1.033 0 2.064-1.06 2.064-2.093V4.821c0-1.032-1.032-1.646-2.064-1.646zm-9.97 8.378h3.128v3.128h-3.128v-3.128zm0-4.255h3.128v3.129h-3.128V7.298zm4.255 4.255h3.129v3.128h-3.129v-3.128zm0-4.255h3.129v3.129h-3.129V7.298z"/></svg>
    </button>`;

    let statusHtml = '';
    if (_configured === false) {
      statusHtml = '<span class="wa-crm__status-pill wa-crm__status-pill--off"><span class="wa-crm__status-dot"></span>Off</span>';
    } else if (isEffectivelyOpen()) {
      statusHtml = `
        <span class="wa-crm__status-pill"><span class="wa-crm__status-dot"></span>Conectado</span>
        ${_syncEnabled ? `<button type="button" class="btn btn-ghost btn-sm" title="Espelhar conversas do WhatsApp (até ${_contactsMax})" onclick="WhatsAppChat.loadContacts(false,true)">↻</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" onclick="WhatsAppChat.disconnect()">Sair</button>`;
    } else {
      statusHtml = `
        <span class="wa-crm__status-pill wa-crm__status-pill--off"><span class="wa-crm__status-dot"></span>Desconectado</span>
        <button type="button" class="btn btn-primary btn-sm" onclick="WhatsAppChat.connect()">Conectar</button>`;
    }

    el.innerHTML = newBtn + statusHtml;
    const newChatBtn = document.getElementById('waNewChatBtn');
    if (newChatBtn) {
      newChatBtn.dataset.bound = '';
      bindSidebarEvents();
    }
  }

  function renderQrScreen() {
    const el = document.getElementById('waCrmQrScreen');
    const threadWrap = document.getElementById('waCrmThreadWrap');
    if (!el) return;

    if (isEffectivelyOpen()) {
      el.classList.add('is-hidden');
      threadWrap?.classList.remove('is-hidden');
      return;
    }

    threadWrap?.classList.add('is-hidden');
    el.classList.remove('is-hidden');

    if (_configured === false) {
      el.innerHTML = `<div class="wa-crm__qr-card"><h3>WhatsApp não configurado</h3><p>Crie <code>config.${_provider === 'whaticket' ? 'whaticket' : 'evolution'}.local.php</code> no servidor.</p></div>`;
      return;
    }

    const qrHint = _provider === 'whaticket'
      ? '<p class="text-muted" style="font-size:12px;margin-top:8px">Motor WhaTicket: o QR pode levar alguns segundos via bridge Socket.IO.</p>'
      : '';
    const qr = _qr || '';
    el.innerHTML = `
      <div class="wa-crm__qr-card">
        <h3>Use o WhatsApp no SOU+BLU</h3>
        <p>Escaneie o QR Code para conectar seu número.</p>
        <div class="wa-qr-wrap">${qr ? `<img src="${esc(qr)}" alt="QR Code" class="wa-qr-img"/>` : '<p class="text-muted">Gerando QR...</p>'}</div>
        ${qrHint}
        <button type="button" class="btn btn-primary" onclick="WhatsAppChat.connect()">Atualizar QR Code</button>
      </div>`;
  }

  function filteredChats() {
    let list = dedupeChatsByPhone(_chats);
    if (_listFilter === 'unread') {
      list = list.filter(c => Number(c.unread_count) > 0);
    }
    const q = _normStr(_chatFilter);
    if (!q) return list;
    return list.filter(c => {
      const name = _normStr(displayContactName(c));
      const phone = String(c.contact_phone || '').replace(/\D/g, '');
      const preview = _normStr(c.last_message_preview || '');
      return name.includes(q) || phone.includes(q) || preview.includes(q);
    });
  }

  
  async function updateChatStage(chatId, stageId) {
    const norm = normalizeKanbanStage(stageId);
    setPendingKanbanStage(chatId, norm);
    const c = _chats.find(x => x.id === chatId);
    if (c) c.kanban_stage = norm;
    renderChatList();
    renderThreadHeader();
    notifyKanbanState();
    try {
      const data = await api('update_stage', {
        method: 'POST',
        body: { chat_id: chatId, stage: norm },
      });
      const saved = normalizeKanbanStage(data?.kanban_stage || data?.stage || norm);
      clearPendingKanbanStage(chatId, saved);
      const row = _chats.find(x => x.id === chatId);
      if (row) row.kanban_stage = saved;
      renderChatList();
      renderThreadHeader();
      notifyKanbanState();
    } catch (e) {
      console.error('[updateChatStage]', e);
      if (typeof showToast === 'function') showToast('Erro ao salvar etapa do funil.', 'error');
    }
  }

  window.WhatsAppChatDrop = function(ev, stageId) {
    ev.preventDefault();
    const chatId = ev.dataTransfer.getData("text/plain");
    updateChatStage(chatId, stageId);
  };
  
  window.WhatsAppChatDragOver = function(ev) {
    ev.preventDefault();
  };

  window.WhatsAppChatDragStart = function(ev, chatId) {
    ev.dataTransfer.setData("text/plain", chatId);
  };

    function renderChatList() {
    const el = document.getElementById('waChatList');
    const newBlock = document.getElementById('waNewChatBlock');
    if (!el) return;

    if (newBlock && !isEffectivelyOpen()) newBlock.classList.remove('is-open');

    if (!isEffectivelyOpen()) {
      el.innerHTML = '<div class="wa-crm__empty">Conecte o WhatsApp para ver seus contatos.</div>';
      return;
    }

    const list = filteredChats();
    
    if (_kanbanMode) {
      let html = '<div class="wa-kanban">';
      _kanbanStages.forEach(stage => {
        const stageChats = list.filter(c => kanbanStageId(c) === stage.id);
        html += `<div class="wa-kanban-col" ondrop="WhatsAppChatDrop(event, '${stage.id}')" ondragover="WhatsAppChatDragOver(event)">
          <div class="wa-kanban-col__head">
            ${stage.name} <span class="wa-kanban-col__count">${stageChats.length}</span>
          </div>
          <div class="wa-kanban-col__body">`;
          
          stageChats.forEach(c => {
          const unreadN = Number(c.unread_count) || 0;
          const hasUnread = unreadN > 0;
          const unreadCls = hasUnread ? ' wa-chat-item--has-unread' : '';
          const unread = hasUnread ? `<span class="wa-unread">${unreadN}</span>` : '';
          const preview = c.last_message_preview ? esc(humanPreview(c.last_message_preview)) : '<span class="wa-chat-item__phone">Toque para conversar</span>';
          
          let dealValHTML = '';
          if (c.deal_value && Number(c.deal_value) > 0) {
              dealValHTML = `<div class="wa-deal-val" onclick="WhatsAppCRM.editDealValue('${esc(c.id)}', '${c.deal_value}')" title="Clique para editar valor">💰 R$ ${Number(c.deal_value).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>`;
          }
          
          let dealTagsHTML = '';
          const tagList = (window.WATags && WATags.parse) ? WATags.parse(c.deal_tags || '') : String(c.deal_tags || '').split(',').map(t => t.trim()).filter(Boolean);
          if (tagList.length) {
              const tagChips = tagList.map((t) => (window.WATags && WATags.chipHtml) ? WATags.chipHtml(t) : `<span class="wa-tag-chip">${esc(t)}</span>`).join('');
              dealTagsHTML = `<div class="wa-deal-tags" onclick="event.stopPropagation();WhatsAppCRM.editDealTags('${esc(c.id)}', this.dataset.tags, event)" data-tags="${esc(c.deal_tags || '')}">${tagChips}</div>`;
          }
          
          let nextActionHTML = '';
          if (c.next_action_at) {
              const d = new Date(c.next_action_at);
              if (!isNaN(d)) {
                 nextActionHTML = `<div class="wa-deal-date" onclick="WhatsAppCRM.editNextAction('${esc(c.id)}', '${esc(c.next_action_at)}')">📅 ${d.toLocaleDateString('pt-BR')}</div>`;
              }
          }

          html += `
              <div class="wa-chat-item${unreadCls} wa-kanban-card" draggable="true" ondragstart="WhatsAppChatDragStart(event, '${esc(c.id)}')">
                <div class="wa-chat-item__content-wrap" onclick="WhatsAppChat.selectChat('${esc(c.id)}')">
                  ${avatarHtml(c, 'wa-chat-item__avatar')}
                  <div class="wa-chat-item__body">
                    <div class="wa-chat-item__top">
                      <strong>${esc(displayContactName(c))}</strong>
                      <span class="wa-chat-item__time">${esc(fmtTime(c.last_message_at))}</span>
                    </div>
                    <div class="wa-chat-item__bottom">
                      <span class="wa-chat-item__preview">${preview}</span>
                      ${unread}
                    </div>
                  </div>
                </div>
                
                ${(dealValHTML || dealTagsHTML || nextActionHTML) ? `
                <div class="wa-deal-info-wrap">
                    ${dealValHTML}
                    ${dealTagsHTML}
                    ${nextActionHTML}
                </div>
                ` : ''}

                <div class="wa-chat-item__actions wa-deal-actions">
                  <button type="button" class="wa-action-icon" title="Definir Valor (R$)" onclick="WhatsAppCRM.editDealValue('${esc(c.id)}', '${c.deal_value||''}')">💰</button>
                  <button type="button" class="wa-action-icon" title="Etiquetas" onclick="event.stopPropagation();WhatsAppCRM.editDealTags('${esc(c.id)}', '${esc(c.deal_tags||'')}', event)">🏷️</button>
                  <button type="button" class="wa-action-icon" title="Agendar Retorno" onclick="WhatsAppCRM.editNextAction('${esc(c.id)}', '${esc(c.next_action_at||'')}')">📅</button>
                  <button type="button" class="wa-action-icon" title="Abrir conversa" onclick="WhatsAppChat.selectChat('${esc(c.id)}')">💬</button>
                </div>
              </div>`;
        });
        
        html += `</div></div>`;
      });
      html += '</div>';
      el.innerHTML = html;
      bindLazyAvatars(el);
      return;
    }
    if (!list.length) {
      const hint = _listFilter === 'unread'
        ? 'Nenhuma conversa não lida.'
        : `Carregamos até ${_contactsMax} contatos ao conectar. Clique ↻ ou use Nova conversa.`;
      el.innerHTML = `<div class="wa-crm__empty"><p><strong>Nenhum contato</strong></p><p style="margin-top:8px;font-size:13px;">${hint}</p></div>`;
      return;
    }

    let html = '';
    list.forEach(c => {
      const unreadN = Number(c.unread_count) || 0;
      const hasUnread = unreadN > 0;
      const active = c.id === _activeChatId ? ' wa-chat-item--active' : '';
      const unreadCls = hasUnread ? ' wa-chat-item--has-unread' : '';
      const unread = hasUnread ? `<span class="wa-unread">${unreadN}</span>` : '';
      const rawPreview = c.last_message_preview ? humanPreview(c.last_message_preview) : '';
      const previewHtml = rawPreview
        ? `<span class="wa-chat-item__preview">${esc(rawPreview)}</span>`
        : `<span class="wa-chat-item__preview wa-chat-item__preview--muted">Toque para conversar</span>`;
        
      const stageId = kanbanStageId(c);
      const stage = _kanbanStages.find(s => s.id === stageId) || _kanbanStages[0];
      
      let optionsHtml = '';
      _kanbanStages.forEach(s => {
        const sel = s.id === stageId ? ' selected' : '';
        optionsHtml += `<option value="${s.id}"${sel}>${esc(s.name)}</option>`;
      });
      
      const tagHtml = `<div class="wa-chat-item__tags" style="margin-top: 6px;">
        <select class="wa-kanban-tag" style="background-color: ${stage.color}15; color: ${stage.color}; border: 1px solid ${stage.color}40; border-radius: 4px; padding: 2px 4px; font-size: 11px; font-weight: 500; cursor: pointer; height: auto;" onclick="event.stopPropagation()" onchange="WhatsAppChat.updateChatStage('${esc(c.id)}', this.value)">
          ${optionsHtml}
        </select>
      </div>`;
      const prio = priorityMeta(c.deal_tags);

      html += `
        <button type="button" class="wa-chat-item wa-chat-item--has-priority${active}${unreadCls}" onclick="WhatsAppChat.selectChat('${esc(c.id)}')">
          <span class="wa-chat-item__priority-bar ${prio.priorityClass}" title="Prioridade: ${esc(prio.priority)}"></span>
          ${avatarHtml(c, 'wa-chat-item__avatar')}
          <div class="wa-chat-item__body">
            <div class="wa-chat-item__top">
              <strong>${esc(displayContactName(c))}</strong>
              <span class="wa-chat-item__time">${esc(fmtTime(c.last_message_at))}</span>
            </div>
            <div class="wa-chat-item__bottom">
              ${previewHtml}
              ${unread}
            </div>
            ${tagHtml}
          </div>
        </button>`;
    });
    el.innerHTML = html;
    bindLazyAvatars(el);
  }

  function render() {
    ensureCrmShell();
    setCrmMode();
    if (!_kanbanMode) {
      renderHeadActions();
      renderQrScreen();
      renderChatList();
    }
    if (!isUserTyping()) renderThread();
  }

  async function init() {
    if (!canAccess()) return;
    if (!bindSessionUser()) return;

    ensureCrmShell();
    await ensureSchema();
    try {
      const cfgData = await api('config');
      _configured = !!cfgData.configured;
      _provider = String(cfgData.provider || 'evolution');
      _syncEnabled = !!cfgData.sync_enabled;
      _mirrorMode = cfgData.mirror_mode !== false;
      _contactsMax = Number(cfgData.contacts_max) || (_mirrorMode ? 60 : 500);
      await refreshStatus({ wantProfile: true });
      // Confiar só no servidor: NÃO forçar _sessionLive com dados locais stale.
      if (_status === 'open' && !_sessionLive) {
        _status = 'close';
      }
      if (_qr && _status !== 'open' && !_rebindRequired) {
        _status = 'connecting';
      }
      if (_rebindRequired) {
        stopPollers();
        _chats = [];
        _messages = [];
        _phone = null;
        _sessionLive = false;
        _status = 'close';
      }
      if (isEffectivelyOpen()) {
        loadOwnProfile(false).catch(() => {});
        startMsgPoll();
        startChatsPoll();
        startEventsPoll();
        await pullChats(true, _chats.length === 0);
      } else if (_status === 'connecting') {
        startConnectPoll();
      }
      notifyKanbanState();
    } catch (e) {
      console.error('[WhatsAppChat]', e);
      notifyKanbanState();
      if (_kanbanMode) {
        var modal = document.getElementById('waQrModal');
        var st = document.getElementById('waQrStatus');
        var box = document.getElementById('waQrBox');
        if (box) box.style.display = 'none';
        if (st) st.textContent = e.message || 'Erro ao carregar WhatsApp.';
        if (modal) modal.classList.add('open');
        var desc = document.querySelector('.wa-connect__desc');
        if (desc) desc.textContent = e.message || 'Erro de conexão. Recarregue com Ctrl+F5.';
      } else {
        const el = document.getElementById('waCrmQrScreen');
        if (el) {
          el.classList.remove('is-hidden');
          el.innerHTML = `<div class="wa-crm__qr-card"><div class="wa-alert">${esc(e.message || 'Erro ao carregar.')}</div></div>`;
        }
      }
    }
  }

  return {
    init,
    canAccess,
    connect,
    fetchQrForModal,
    simulateScan,
    disconnect,
    resetSession,
    hardResetLocalState,
    refreshStatus,
    isEffectivelyOpen,
    pullChats,
    loadChats: pullChats,
    loadContacts: async (silent, force) => {
      if (!_syncEnabled) {
        if (typeof showToast === 'function') showToast('Importação desativada no servidor.', 'info');
        return;
      }
      if (!silent && typeof showLoading === 'function') showLoading('Carregando contatos...');
      try {
        await loadContacts(!!silent, !!force);
      } finally {
        if (!silent && typeof hideLoading === 'function') hideLoading();
      }
    },
    syncChats: (s, f) => WhatsAppChat.loadContacts(s, f),
    filterChats: (q) => { _chatFilter = q || ''; renderChatList(); },
    setListFilter: (f) => { _listFilter = f || 'all'; renderChatList(); },
    backToList: () => {
      if (_kanbanMode && window.WA?.closeChat) {
        WA.closeChat();
        return;
      }
      _activeChatId = null;
      _messages = [];
      _msgFingerprint = '';
      stopMsgPoll();
      startChatsPoll();
      setCrmMode();
      renderChatList();
      renderThread();
    },
    selectChat: async (id) => {
      _activeChatId = id;
      setCrmMode();
      renderChatList();
      renderThreadHeader();
      await loadMessages(id, false);
      bindMicEvents();
      updateComposeMode();
      scheduleThreadMediaRepair();
      startMsgPoll();
      startChatsPoll();
      const chat = _chats.find(c => c.id === id);
      if (chat) loadThreadAvatarNow(chat);
    },
    openNewChat: async () => {
      const phone = document.getElementById('waNewPhone')?.value || '';
      const name = document.getElementById('waNewName')?.value || '';
      if (!phone.trim()) {
        if (typeof showToast === 'function') showToast('Informe o telefone.', 'warning');
        return;
      }
      await openChatByPhone(phone, name);
      document.getElementById('waNewChatBlock')?.classList.remove('is-open');
      document.getElementById('waNewPhone').value = '';
      document.getElementById('waNewName').value = '';
    },
    openChatByPhone,
    sendMessage,
    fetchProfile: function() {
      return withTimeout(api('fetch_profile', { query: { quick: '1' } }), 15000, 'Carregar perfil');
    },
    updateProfile: function(data) {
      return api('update_profile', { method: 'POST', body: data });
    },
    updateContactName: async function(chatId, name) {
      const data = await api('update_contact', { method: 'POST', body: { chat_id: chatId, name } });
      if (data && data.ok) {
        const idx = _chats.findIndex(c => String(c.id) === String(chatId));
        if (idx >= 0) _chats[idx] = { ..._chats[idx], contact_name: data.contact_name };
        if (Array.isArray(data.chats)) _chats = data.chats;
        renderChatList();
        renderThreadHeader();
      }
      return data;
    },
    sendMedia,
    onMicClick,
    toggleAudioRecord,
    startAudioRecord,
    stopAudioRecord,
    avatarHtml,
    displayContactName,
    dedupeChatsByPhone,
    loadOwnProfile,
    humanPreview,
    fmtPhone,
    loadChatAvatar,
    bindLazyAvatars,
    avatarProxyUrl,
    _onAudioError: onAudioError,
    _onMediaImgError: onMediaImgError,
    initKanbanMode: () => {
      _kanbanMode = true;
      ensureThreadShell();
      setCrmMode();
    },
    updateChatStage,
    applyNavVisibility() {
      const btn = document.getElementById('navWhatsApp');
      if (btn) btn.style.display = canAccess() ? '' : 'none';
    },
    _kanbanClose: () => {
      _activeChatId = null;
      _messages = [];
      _msgFingerprint = '';
      setCrmMode();
    },
    _getState() {
      return {
        status: _status,
        sessionLive: _sessionLive,
        serverChatsCount: _serverChatsCount,
        chats: _chats,
        qr: _qr,
        userId: _userId,
        configured: _configured,
        phone: _phone,
        rebindRequired: _rebindRequired,
        profilePic: _profilePic,
        profileName: _profileName,
        connectError: _lastConnectError,
        connecting: !!_connectInFlight,
      };
    },
  };
})();

window.WhatsAppChat = WhatsAppChat;
window.openClientWhatsApp = (phone, name) => {
  if (typeof navigateTo === 'function') navigateTo('secWhatsApp');
  return WhatsAppChat.openChatByPhone(phone, name);
};

// Shared tag colors + inbox chip helpers
window.WATags = (function () {
  const PRESETS = {
    urgente: '#b91c1c',
    urgent: '#b91c1c',
    alta: '#ea0038',
    high: '#ea0038',
    'média': '#f59e0b',
    media: '#f59e0b',
    medium: '#f59e0b',
    baixa: '#25d366',
    low: '#25d366',
    lead: '#2563eb',
    led: '#2563eb',
    hot: '#dc2626',
    vip: '#9333ea',
    follow: '#d97706',
    closed: '#16a34a',
  };
  const LS_KEY = 'wa_tag_colors';

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function normKey(tag) {
    return String(tag || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function loadCustomColors() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }

  function getColor(tag) {
    const raw = String(tag || '').trim();
    if (!raw) return '#3b4a54';
    const customs = loadCustomColors();
    if (customs[raw]) return customs[raw];
    const key = normKey(raw);
    if (customs[key]) return customs[key];
    if (PRESETS[key]) return PRESETS[key];
    for (const [k, v] of Object.entries(PRESETS)) {
      if (key.includes(k)) return v;
    }
    return '#3b4a54';
  }

  function parse(raw) {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((t) => String(t).trim()).filter(Boolean);
    } catch (e) { /* comma-separated */ }
    return String(raw).split(',').map((t) => t.trim()).filter(Boolean);
  }

  function chipHtml(tag, extraClass) {
    const color = getColor(tag);
    const cls = 'wa-tag-chip' + (extraClass ? ' ' + extraClass : '');
    return '<span class="' + cls + '" style="--tag-color:' + esc(color) + '" title="' + esc(tag) + '">' + esc(tag) + '</span>';
  }

  function inboxHtml(chatId, dealTags) {
    const tags = parse(dealTags);
    if (!tags.length) return '';
    const chips = tags.map((t) => chipHtml(t)).join('');
    const cid = esc(chatId || '');
    const raw = esc(dealTags || '');
    return '<div class="wa-contact__tags" data-chat-id="' + cid + '" data-tags="' + raw + '" onclick="event.stopPropagation();WhatsAppCRM.editDealTags(this.dataset.chatId,this.dataset.tags,event)">' + chips + '</div>';
  }

  const PRESET_LABELS = ['Urgente', 'Alta', 'Média', 'Baixa', 'Lead', 'Hot', 'VIP', 'Follow'];

  function closeEditor() {
    const el = document.getElementById('waTagPopover');
    if (el) el.remove();
    document.removeEventListener('mousedown', _onDocDown, true);
  }

  function _onDocDown(ev) {
    const pop = document.getElementById('waTagPopover');
    if (!pop) return;
    if (pop.contains(ev.target)) return;
    closeEditor();
  }

  function openEditor(chatId, currentTags, anchorEl) {
    closeEditor();
    const selected = parse(currentTags);
    const pop = document.createElement('div');
    pop.className = 'wa-tag-popover';
    pop.id = 'waTagPopover';
    const r = (anchorEl && anchorEl.getBoundingClientRect) ? anchorEl.getBoundingClientRect() : { left: 24, bottom: 80, top: 80 };
    let top = r.bottom + 8;
    let left = r.left;
    if (left + 280 > window.innerWidth) left = Math.max(8, window.innerWidth - 280);
    if (top + 360 > window.innerHeight) top = Math.max(8, r.top - 360);
    pop.style.top = top + 'px';
    pop.style.left = Math.max(8, left) + 'px';

    function render() {
      const presets = PRESET_LABELS.map((label) => {
        const on = selected.some((t) => normKey(t) === normKey(label));
        return '<span class="wa-tag-chip wa-tag-popover__preset' + (on ? ' is-active' : '') + '" style="--tag-color:' + esc(getColor(label)) + '" data-tag="' + esc(label) + '">' + esc(label) + '</span>';
      }).join('');
      const chips = selected.length
        ? selected.map((t) => '<span class="wa-tag-chip" style="--tag-color:' + esc(getColor(t)) + '" data-remove="' + esc(t) + '">' + esc(t) + ' ×</span>').join('')
        : '<span class="wa-tag-popover__empty">Nenhuma etiqueta</span>';
      pop.innerHTML =
        '<div class="wa-tag-popover__title">Etiquetas</div>' +
        '<div class="wa-tag-popover__section-label">Selecionadas</div>' +
        '<div class="wa-tag-popover__selected">' + chips + '</div>' +
        '<div class="wa-tag-popover__section-label">Prontas</div>' +
        '<div class="wa-tag-popover__presets">' + presets + '</div>' +
        '<div class="wa-tag-popover__section-label">Personalizada</div>' +
        '<div class="wa-tag-popover__custom">' +
          '<input class="wa-tag-popover__input" id="waTagCustomInput" maxlength="32" placeholder="Ex: Lead, VIP, Retornar">' +
          '<button type="button" class="wa-tag-popover__add-btn" id="waTagAddBtn">Adicionar</button>' +
        '</div>' +
        '<div class="wa-tag-popover__actions">' +
          '<button type="button" class="wa-tag-popover__btn wa-tag-popover__btn--ghost" id="waTagCancel">Fechar</button>' +
          '<button type="button" class="wa-tag-popover__btn wa-tag-popover__btn--primary" id="waTagSave">Salvar</button>' +
        '</div>';
    }

    function toggleTag(name) {
      const key = normKey(name);
      if (!key) return;
      const idx = selected.findIndex((t) => normKey(t) === key);
      if (idx >= 0) selected.splice(idx, 1);
      else selected.push(String(name).trim());
      render();
    }

    pop.addEventListener('click', (ev) => {
      const preset = ev.target.closest('[data-tag]');
      if (preset && pop.contains(preset)) {
        toggleTag(preset.getAttribute('data-tag'));
        return;
      }
      const rem = ev.target.closest('[data-remove]');
      if (rem && pop.contains(rem)) {
        toggleTag(rem.getAttribute('data-remove'));
        return;
      }
      if (ev.target.id === 'waTagAddBtn') {
        const input = pop.querySelector('#waTagCustomInput');
        const val = String(input?.value || '').trim();
        if (val) toggleTag(val);
        if (input) input.value = '';
        return;
      }
      if (ev.target.id === 'waTagCancel') {
        closeEditor();
        return;
      }
      if (ev.target.id === 'waTagSave') {
        WhatsAppCRM.updateDeal(chatId, { deal_tags: selected.join(', ') });
        closeEditor();
      }
    });
    pop.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      const input = pop.querySelector('#waTagCustomInput');
      if (ev.target !== input) return;
      ev.preventDefault();
      const val = String(input.value || '').trim();
      if (val) toggleTag(val);
      input.value = '';
    });

    document.body.appendChild(pop);
    render();
    setTimeout(() => document.addEventListener('mousedown', _onDocDown, true), 0);
  }

  return {
    PRESETS,
    parse,
    getColor,
    chipHtml,
    inboxHtml,
    openEditor,
    closeEditor,
  };
})();

// Advanced Kanban CRM Logic
window.WhatsAppCRM = {
    async updateDeal(chatId, data) {
        try {
            // Monta a URL da API a partir do estado interno do módulo
            const state = WhatsAppChat._getState();
            const cfg = window.SOUBLU_CONFIG || {};
            const apiBase = (cfg.API_BASE || '').replace(/\/$/, '');
            const apiUrl = apiBase
                ? `${apiBase}/api/whatsapp_api.php`
                : '/api/whatsapp_api.php';
            const uid = state.userId || cfg.USER_ID || '';
            const key = cfg.API_KEY || '';

            const formData = new FormData();
            formData.append('action', 'update_deal_info');
            formData.append('chat_id', chatId);
            formData.append('user_id', uid);
            formData.append('apikey', key);
            if (data.deal_value !== undefined) formData.append('deal_value', data.deal_value);
            if (data.deal_tags !== undefined) formData.append('deal_tags', data.deal_tags);
            if (data.next_action_at !== undefined) formData.append('next_action_at', data.next_action_at);

            const res = await fetch(apiUrl, { method: 'POST', body: formData });
            const json = await res.json();
            if (json.ok) {
                if (typeof showToast === 'function') showToast('Salvo com sucesso!', 'success');
                WhatsAppChat.pullChats(true, false);
            } else {
                if (typeof showToast === 'function') showToast(json.error || 'Erro ao salvar', 'error');
            }
        } catch (e) {
            console.error('[WhatsAppCRM.updateDeal]', e);
            if (typeof showToast === 'function') showToast('Erro de conexão ao salvar.', 'error');
        }
    },
    
    editDealValue(chatId, currentVal) {
        const val = prompt('Digite o valor do negócio (ex: 1500.50) ou deixe em branco para remover:', currentVal || '');
        if (val !== null) {
            this.updateDeal(chatId, { deal_value: val.replace(',','.') });
        }
    },
    
    editDealTags(chatId, currentTags, ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (!chatId) return;
        if (window.WATags && typeof WATags.openEditor === 'function') {
            const anchor = ev && (ev.currentTarget || ev.target);
            WATags.openEditor(chatId, currentTags || '', anchor);
            return;
        }
        const val = prompt('Etiquetas (separadas por vírgula):', currentTags || '');
        if (val !== null) this.updateDeal(chatId, { deal_tags: val });
    },
    
    editNextAction(chatId, currentDate) {
        let def = '';
        if (currentDate) {
            def = currentDate.replace(' ', 'T').slice(0, 16);
        }
        const dt = prompt('Data de Retorno (AAAA-MM-DD HH:MM) ou deixe em branco:', def);
        if (dt !== null) {
            this.updateDeal(chatId, { next_action_at: dt.replace('T',' ') });
        }
    }
};
