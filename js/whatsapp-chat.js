/* SOU+BLU — Painel WhatsApp (Evolution API, estilo WhatsApp Web) */
const WhatsAppChat = (() => {
  const POLL_CONNECT_MS = 12000;
  const POLL_MSG_MS = 15000;
  const POLL_CHATS_MS = 25000;

  let _configured = null;
  let _syncEnabled = false;
  let _contactsMax = 30;
  let _status = 'close';
  let _phone = null;
  let _rebindRequired = false;
  let _chats = [];
  let _chatFilter = '';
  let _listFilter = 'all';
  let _activeChatId = null;
  const CRM_SHELL_VER = '9';
  const THREAD_SHELL_VER = '2';
  let _messages = [];
  let _msgFingerprint = '';
  let _pollConnect = null;
  let _pollMsg = null;
  let _pollChats = null;
  let _connectPollN = 0;
  let _connectPollStarted = 0;
  let _userId = null;
  let _qr = null;
  let _syncing = false;
  let _emojiOpen = false;
  let _emojiCategory = 'smileys';
  let _kanbanMode = false;
  let _kanbanStages = [
    { id: 'novo', name: 'Novo Contato' },
    { id: 'atendimento', name: 'Atendimento' },
    { id: 'proposta', name: 'Proposta' },
    { id: 'contrato', name: 'Contrato' },
    { id: 'cancelado', name: 'Cancelado' },
  ];
  let _monitorUserId = '';
  let _mediaRecorder = null;
  let _audioChunks = [];
  let _recording = false;
  let _recordStream = null;
  let _mirrorMode = true;

  const EMOJI_RECENT_KEY = 'soublu_wa_recent_emoji';
  const EMOJI_CATEGORIES = [
    { id: 'recent', icon: '🕐', title: 'Recentes' },
    { id: 'smileys', icon: '😀', title: 'Rostos e pessoas' },
    { id: 'gestures', icon: '👋', title: 'Gestos' },
    { id: 'hearts', icon: '❤️', title: 'Corações' },
    { id: 'animals', icon: '🐶', title: 'Animais' },
    { id: 'food', icon: '🍕', title: 'Comida' },
    { id: 'objects', icon: '⚽', title: 'Objetos' },
    { id: 'symbols', icon: '✅', title: 'Símbolos' },
  ];
  const EMOJI_SETS = {
    smileys: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'],
    gestures: ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄','💋','🫦'],
    hearts: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️','🫶','💑','💏','👩‍❤️‍👨','👨‍❤️‍👨','👩‍❤️‍👩'],
    animals: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪰','🪲','🪳','🦟','🦗','🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈','🐈‍⬛','🪶','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊️','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔'],
    food: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🦴','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','☕','🫖','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾','🧊'],
    objects: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️','🤼','🤸','⛹️','🤺','🤾','🏌️','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️','🎪','🤹','🎭','🩰','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🪗','🎸','🪕','🎻','🎲','♟️','🎯','🎳','🎮','🎰','🧩'],
    symbols: ['✅','❌','❓','❗','‼️','⁉️','💯','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔶','🔷','🔸','🔹','🔺','🔻','💠','🔘','🔳','🔲','▪️','▫️','◾','◽','◼️','◻️','🟥','🟧','🟨','🟩','🟦','🟪','⬛','⬜','🟫','🔈','🔇','🔉','🔊','🔔','🔕','📣','📢','💤','💢','💬','💭','🗯️','♨️','💈','🛑','🚫','⛔','📛','☢️','☣️','⚠️','🚸','🔱','⚜️','🔰','♻️','✳️','❇️','©️','®️','™️','#️⃣','*️⃣','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔠','🔡','🔢','🔣','🔤','🅰️','🆎','🅱️','🆑','🆒','🆓','ℹ️','🆔','Ⓜ️','🆕','🆖','🅾️','🆗','🅿️','🆘','🆙','🆚','🈁','🈂️','🈷️','🈶','🈯','🉐','🈹','🈚','🈲','🉑','🈸','🈴','🈳','㊗️','㊙️','🈺','🈵'],
  };

  function kanbanStageId(chat) {
    const raw = chat?.kanban_stage || 'novo';
    const legacy = {
      novo_contato: 'novo',
      em_atendimento: 'atendimento',
      negociacao: 'proposta',
      finalizado: 'cancelado',
    };
    return legacy[raw] || raw;
  }

  function getRecentEmojis() {
    try {
      const raw = localStorage.getItem(EMOJI_RECENT_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.slice(0, 24) : [];
    } catch (_) {
      return [];
    }
  }

  function pushRecentEmoji(emoji) {
    const list = getRecentEmojis().filter(e => e !== emoji);
    list.unshift(emoji);
    try {
      localStorage.setItem(EMOJI_RECENT_KEY, JSON.stringify(list.slice(0, 24)));
    } catch (_) { /* noop */ }
  }

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
    pushRecentEmoji(emoji);
    renderEmojiPanel();
  }

  function closeEmojiPanel() {
    _emojiOpen = false;
    document.getElementById('waEmojiPanel')?.classList.remove('is-open');
    document.getElementById('waEmojiBtn')?.classList.remove('is-active');
  }

  function toggleEmojiPanel() {
    const panel = document.getElementById('waEmojiPanel');
    const btn = document.getElementById('waEmojiBtn');
    if (!panel) return;
    _emojiOpen = !_emojiOpen;
    panel.classList.toggle('is-open', _emojiOpen);
    btn?.classList.toggle('is-active', _emojiOpen);
    if (_emojiOpen) {
      if (!panel.dataset.rendered) {
        renderEmojiPanel();
        panel.dataset.rendered = '1';
      } else {
        renderEmojiPanel();
      }
    }
  }

  function renderEmojiPanel() {
    const grid = document.getElementById('waEmojiGrid');
    const title = document.getElementById('waEmojiTitle');
    if (!grid) return;
    const recent = getRecentEmojis();
    if (_emojiCategory === 'recent' && !recent.length) {
      _emojiCategory = 'smileys';
    }
    const cat = EMOJI_CATEGORIES.find(c => c.id === _emojiCategory) || EMOJI_CATEGORIES[1];
    if (title) title.textContent = cat.title;
    const emojis = _emojiCategory === 'recent' ? recent : (EMOJI_SETS[_emojiCategory] || []);
    grid.innerHTML = emojis.map(e =>
      `<button type="button" class="wa-emoji-item" data-emoji="${esc(e)}" title="${esc(e)}">${e}</button>`
    ).join('');
    document.querySelectorAll('.wa-emoji-tab').forEach(tab => {
      tab.classList.toggle('is-active', tab.dataset.cat === _emojiCategory);
    });
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
    panel?.addEventListener('click', (e) => {
      const item = e.target.closest('.wa-emoji-item');
      if (item?.dataset.emoji) {
        insertEmojiAtCursor(item.dataset.emoji);
        return;
      }
      const tab = e.target.closest('.wa-emoji-tab');
      if (tab?.dataset.cat) {
        _emojiCategory = tab.dataset.cat;
        renderEmojiPanel();
      }
    });
    document.addEventListener('click', (e) => {
      if (!_emojiOpen) return;
      if (e.target.closest('#waEmojiPanel') || e.target.closest('#waEmojiBtn')) return;
      closeEmojiPanel();
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
  }

  function isEffectivelyOpen() {
    return _status === 'open' && !_rebindRequired;
  }

  function bindSessionUser() {
    const uid = typeof Auth !== 'undefined' ? Auth.getSession()?.id : null;
    if (!uid) return false;
    const prev = sessionStorage.getItem('soublu_wa_active_uid');
    if (prev && prev !== uid) {
      hardResetLocalState();
    }
    sessionStorage.setItem('soublu_wa_active_uid', uid);
    _userId = uid;
    return true;
  }

  async function resetSession(clearData = true) {
    if (typeof showLoading === 'function') showLoading('Reiniciando WhatsApp...');
    try {
      await api('reset_session', { method: 'POST', body: { clear_data: !!clearData } });
      hardResetLocalState();
      _rebindRequired = true;
      notifyKanbanState();
      // #region agent log
      try {
        fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '97c411' }, body: JSON.stringify({ sessionId: '97c411', location: 'whatsapp-chat.js:resetSession', message: 'reset session done', data: { clearData: !!clearData, rebindRequired: true }, timestamp: Date.now(), hypothesisId: 'isolate' }) }).catch(() => {});
      } catch (_) {}
      // #endregion
      await refreshStatus({ refreshQr: true });
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

    const url = apiUrl(action, method === 'GET' ? { user_id: userId, ...(opts.query || {}) } : { user_id: userId });
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
    if (sessionStorage.getItem('soublu_wa_schema') === '1') return;
    const c = cfg();
    try {
      await fetch(`${apiBase()}/api/migrate-whatsapp.php`, {
        headers: { 'X-API-Key': c.API_KEY || '', apikey: c.API_KEY || '' },
      });
      sessionStorage.setItem('soublu_wa_schema', '1');
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

  function displayContactName(chat) {
    const name = String(chat?.contact_name || '').trim();
    if (name.length >= 3 && !/^\d{10,}$/.test(name.replace(/\D/g, ''))) {
      return name;
    }
    const phone = String(chat?.contact_phone || '').replace(/\D/g, '');
    if (isPlausiblePhone(phone)) return fmtPhone(phone);
    return 'Contato';
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

  function avatarSrc(chat) {
    const u = chat?.contact_avatar_url;
    return u ? mediaSrc(u) : '';
  }

  function avatarHtml(chat, className) {
    const cls = className || 'wa-avatar';
    const init = initials(chat?.contact_name, chat?.contact_phone);
    const src = avatarSrc(chat);
    if (!src) {
      return `<span class="${cls} wa-avatar-fallback">${esc(init)}</span>`;
    }
    return `<span class="${cls} wa-avatar-wrap"><img class="wa-avatar-img" src="${esc(src)}" alt="" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('wa-avatar-wrap--fallback');"/><span class="wa-avatar-fallback">${esc(init)}</span></span>`;
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

  async function stopAudioRecord() {
    if (!_mediaRecorder || _mediaRecorder.state === 'inactive') return;
    _mediaRecorder.stop();
  }

  async function toggleAudioRecord() {
    if (_recording) {
      await stopAudioRecord();
      return;
    }
    if (!_activeChatId) {
      if (typeof showToast === 'function') showToast('Selecione uma conversa primeiro.', 'warning');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      if (typeof showToast === 'function') showToast('Microfone não suportado neste navegador.', 'error');
      return;
    }
    try {
      _recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' : '');
      _mediaRecorder = mime ? new MediaRecorder(_recordStream, { mimeType: mime }) : new MediaRecorder(_recordStream);
      _audioChunks = [];
      _mediaRecorder.ondataavailable = (ev) => { if (ev.data?.size) _audioChunks.push(ev.data); };
      _mediaRecorder.onstop = async () => {
        try {
          if (_recordStream) _recordStream.getTracks().forEach((t) => t.stop());
        } catch (_) { /* noop */ }
        _recordStream = null;
        _recording = false;
        document.getElementById('waMicBtn')?.classList.remove('is-recording');
        updateComposeMode();
        const blob = new Blob(_audioChunks, { type: _mediaRecorder?.mimeType || 'audio/webm' });
        if (!blob.size) return;
        const ext = (blob.type || '').includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: blob.type || 'audio/webm' });
        await sendMedia(file);
      };
      _mediaRecorder.start();
      _recording = true;
      document.getElementById('waMicBtn')?.classList.add('is-recording');
      if (typeof showToast === 'function') showToast('Gravando áudio… Toque no microfone para enviar.', 'info');
    } catch (e) {
      _recording = false;
      if (typeof showToast === 'function') showToast('Não foi possível acessar o microfone.', 'error');
    }
  }

  async function loadChatAvatar(chatId, silent) {
    if (!chatId || _status !== 'open') return;
    try {
      const data = await api('contact_avatar', { method: 'POST', body: { chat_id: chatId } });
      if (data.chats) {
        _chats = data.chats;
        renderChatList();
        notifyKanbanState();
        if (_activeChatId === chatId) renderThreadHeader();
      }
      if (!silent && data.avatar_url && typeof showToast === 'function') {
        showToast('Foto do contato atualizada.', 'success');
      }
    } catch (_) { /* noop */ }
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
      audioEl.src = repaired;
      audioEl.load();
    }
  }

  async function uploadMedia(file) {
    const c = cfg();
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${apiBase()}/api/upload.php?bucket=whatsapp-media`, {
      method: 'POST',
      headers: { 'X-API-Key': c.API_KEY || '', apikey: c.API_KEY || '' },
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `Erro HTTP ${res.status}`);
    }
    return data;
  }

  function isUserTyping() {
    const input = document.getElementById('waMsgInput');
    if (!input) return false;
    return document.activeElement === input || String(input.value || '').length > 0;
  }

  function notifyKanbanState() {
    try {
      window.dispatchEvent(new CustomEvent('wa:state-changed', {
        detail: { status: _status, hasQr: !!_qr },
      }));
    } catch (_) { /* noop */ }
  }

  function stopPollers() {
    if (_pollConnect) { clearInterval(_pollConnect); _pollConnect = null; }
    if (_pollMsg) { clearInterval(_pollMsg); _pollMsg = null; }
    if (_pollChats) { clearInterval(_pollChats); _pollChats = null; }
    _connectPollN = 0;
    _connectPollStarted = 0;
  }

  function startConnectPoll() {
    if (_pollConnect) clearInterval(_pollConnect);
    _connectPollN = 0;
    _connectPollStarted = Date.now();
    _pollConnect = setInterval(() => {
      _connectPollN += 1;
      const needQr = _connectPollN === 1 || !_qr || (_connectPollN % 6 === 0);
      refreshStatus({ skipQr: true, refreshQr: needQr }).then(async (data) => {
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
      }).catch(() => {});
    }, POLL_CONNECT_MS);
  }

  function startMsgPoll() {
    if (_pollMsg) clearInterval(_pollMsg);
    _pollMsg = setInterval(() => {
      if (_activeChatId && !isUserTyping()) {
        loadMessages(_activeChatId, true).catch(() => {});
      }
    }, POLL_MSG_MS);
  }

  function startChatsPoll() {
    if (_pollChats) clearInterval(_pollChats);
    _pollChats = setInterval(() => loadChats(true).catch(() => {}), POLL_CHATS_MS);
  }

  function updateComposeMode() {
    const input = document.getElementById('waMsgInput');
    const sendBtn = document.getElementById('waSendBtn');
    const micBtn = document.getElementById('waMicBtn');
    const hasText = !!(input?.value || '').trim();
    sendBtn?.classList.toggle('is-hidden', !hasText);
    micBtn?.classList.toggle('is-hidden', hasText);
  }

  function bindComposeEvents() {
    const input = document.getElementById('waMsgInput');
    const btn = document.getElementById('waSendBtn');
    if (!input || input.dataset.bound === '1') return;
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
    document.getElementById('waMicBtn')?.addEventListener('click', () => {
      toggleAudioRecord();
    });
    const attachBtn = document.getElementById('waAttachBtn');
    const fileInput = document.getElementById('waFileInput');
    attachBtn?.addEventListener('click', () => {
      closeEmojiPanel();
      fileInput?.click();
    });
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (file) WhatsAppChat.sendMedia(file);
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
                <div class="wa-emoji-panel__tabs">
                  ${EMOJI_CATEGORIES.map(c => `<button type="button" class="wa-emoji-tab${c.id === 'smileys' ? ' is-active' : ''}" data-cat="${c.id}" title="${esc(c.title)}">${c.icon}</button>`).join('')}
                </div>
                <div class="wa-emoji-panel__head"><span id="waEmojiTitle">Rostos e pessoas</span></div>
                <div id="waEmojiGrid" class="wa-emoji-panel__grid"></div>
              </div>
              <div class="wa-compose__bar">
                <button type="button" id="waAttachBtn" class="wa-compose-icon-btn" title="Anexar" aria-label="Anexar">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                </button>
                <input type="file" id="waFileInput" class="wa-file-input" accept="image/jpeg,image/png,image/gif,image/webp,audio/mpeg,audio/ogg,audio/mp4,audio/aac,audio/wav,audio/webm,.webp,.mp3,.ogg,.m4a,.aac,.wav,.webm" hidden/>
                <div class="wa-compose__input-wrap">
                  <textarea id="waMsgInput" rows="1" placeholder="Digite uma mensagem"></textarea>
                </div>
                <button type="button" id="waEmojiBtn" class="wa-compose-icon-btn wa-emoji-btn" title="Emoji" aria-label="Emoji">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                </button>
                <button type="button" id="waMicBtn" class="wa-compose-icon-btn wa-mic-btn" title="Mensagem de voz" aria-label="Mensagem de voz">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/></svg>
                </button>
                <button type="button" id="waSendBtn" class="wa-send-btn is-hidden" title="Enviar" aria-label="Enviar">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
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
          <div id="waThreadBody" class="wa-thread-body">
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
      const showThread = _status === 'open' && !!_activeChatId;
      threadWrap?.classList.toggle('is-hidden', !showThread);
      root.classList.toggle('wa-thread-only--active', showThread);
      return;
    }

    root.classList.toggle('wa-crm--connected', _status === 'open');
    root.classList.toggle('wa-crm--chat-open', !!_activeChatId);
  }

  function activeChat() {
    return _chats.find(c => c.id === _activeChatId) || null;
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
    if (title) title.textContent = name;
    if (subtitle) subtitle.textContent = isPlausiblePhone(chat.contact_phone) ? fmtPhone(chat.contact_phone) : '';
    if (avatar) {
      const chat = _chats.find(c => c.id === _activeChatId);
      const src = chat ? avatarSrc(chat) : '';
      if (src) {
        avatar.className = 'wa-thread-avatar wa-avatar-wrap';
        avatar.innerHTML = `<img class="wa-avatar-img" src="${esc(src)}" alt="" onerror="this.style.display='none';this.parentElement.classList.add('wa-avatar-wrap--fallback');"/><span class="wa-avatar-fallback">${esc(initials(chat?.contact_name, chat?.contact_phone))}</span>`;
      } else {
        avatar.className = 'wa-thread-avatar wa-avatar-fallback';
        avatar.textContent = initials(chat?.contact_name, chat?.contact_phone);
      }
    }
  }

  function renderMessages() {
    const box = document.getElementById('waMessages');
    const welcome = document.getElementById('waWelcome');
    const compose = document.getElementById('waCompose');
    if (!box) return;

    if (!_activeChatId || _status !== 'open') {
      if (!_kanbanMode) welcome?.classList.remove('is-hidden');
      box.classList.add('is-hidden');
      compose?.classList.add('is-hidden');
      return;
    }

    welcome?.classList.add('is-hidden');
    box.classList.remove('is-hidden');
    compose?.classList.remove('is-hidden');

    let html = '';
    if (!_messages.length) {
      html = `<div class="wa-chat-start"><span>Mensagens protegidas com criptografia de ponta a ponta. Envie a primeira mensagem.</span></div>`;
    } else {
      _messages.forEach(m => {
        const type = String(m.message_type || 'text').toLowerCase();
        const src = mediaSrc(m.media_url);
        if (type === 'sticker' && src) {
          const cls = m.direction === 'out' ? 'wa-bubble wa-bubble--out wa-bubble--sticker' : 'wa-bubble wa-bubble--in wa-bubble--sticker';
          html += `<div class="${cls}"><img class="wa-bubble__sticker" src="${esc(src)}" alt="Figurinha" loading="lazy"/><span class="wa-bubble__time wa-bubble__time--sticker">${esc(fmtTime(m.created_at))}</span></div>`;
          return;
        }
        const cls = m.direction === 'out' ? 'wa-bubble wa-bubble--out' : 'wa-bubble wa-bubble--in';
        let content = '';
        if (type === 'sticker') {
          content = `<span class="wa-bubble__text">${esc(m.body || '[Figurinha]')}</span>`;
        } else if (type === 'image' && src) {
          const dlName = `imagem-${m.id || Date.now()}.jpg`;
          content = `<div class="wa-bubble__media"><img class="wa-bubble__img" src="${esc(src)}" alt="Imagem" loading="lazy"/><button type="button" class="wa-media-dl" data-download-media data-src="${esc(src)}" data-name="${esc(dlName)}" title="Baixar">↓</button></div>`;
          if (m.body && m.body !== '[Imagem]') {
            content += `<span class="wa-bubble__text">${esc(m.body)}</span>`;
          }
        } else if (type === 'image') {
          content = `<span class="wa-bubble__text">${esc(m.body || '[Imagem]')}</span>`;
        } else if (type === 'video' && src) {
          content = `<div class="wa-bubble__media"><video class="wa-bubble__video" controls preload="metadata" src="${esc(src)}"></video><button type="button" class="wa-media-dl" data-download-media data-src="${esc(src)}" data-name="video-${esc(m.id || 'msg')}.mp4" title="Baixar">↓</button></div>`;
          if (m.body && m.body !== '[Vídeo]') {
            content += `<span class="wa-bubble__text">${esc(m.body)}</span>`;
          }
        } else if (type === 'video') {
          content = `<span class="wa-bubble__text">${esc(m.body || '[Vídeo]')}</span>`;
        } else if (type === 'audio' && src) {
          const mime = mimeFromMediaUrl(src);
          const mid = esc(m.id);
          const dlName = `audio-${m.id || Date.now()}.${(mime || '').includes('ogg') ? 'ogg' : 'webm'}`;
          content = `<div class="wa-bubble__media"><audio class="wa-bubble__audio" controls preload="metadata" src="${esc(src)}"${mime && mime.startsWith('audio/') ? ` type="${esc(mime)}"` : ''} data-msg-id="${mid}" onerror="WhatsAppChat._onAudioError(this)"></audio><button type="button" class="wa-media-dl" data-download-media data-src="${esc(src)}" data-name="${esc(dlName)}" title="Baixar">↓</button></div>`;
        } else if (type === 'audio') {
          content = `<span class="wa-bubble__text">${esc(m.body || '[Áudio]')}</span>`;
        } else {
          content = `<span class="wa-bubble__text">${esc(m.body || '')}</span>`;
        }
        html += `<div class="${cls}"><div class="wa-bubble__inner">${content}<span class="wa-bubble__time">${esc(fmtTime(m.created_at))}</span></div></div>`;
      });
    }
    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
    bindMediaEvents();
    // Lazy-repair media missing from Evolution mirror (stickers, audio, video)
    const repairTypes = new Set(['sticker', 'audio', 'video']);
    const missingMedia = _messages.filter(m => repairTypes.has(String(m.message_type || '').toLowerCase()) && !m.media_url && m.id);
    if (missingMedia.length) {
      Promise.all(missingMedia.slice(0, 8).map(m => repairMessageMedia(m.id))).then((urls) => {
        let patched = false;
        urls.forEach((url, i) => {
          if (!url) return;
          const msg = missingMedia[i];
          const idx = _messages.findIndex(x => x.id === msg.id);
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
  }

  function renderThread() {
    renderThreadHeader();
    renderMessages();
  }

  async function refreshStatus(opts = {}) {
    const skipQr = !!opts.skipQr;
    const refreshQr = !!opts.refreshQr;
    const query = {};
    if (skipQr) query.skip_qr = '1';
    if (refreshQr) query.refresh_qr = '1';
    const data = await api('status', { query });
    _configured = !!data.configured;
    const prev = _status;
    _status = data.status || 'close';
    _phone = data.phone || null;
    _rebindRequired = !!data.rebind_required;
    if (data.qr) {
      _qr = data.qr;
    } else if (refreshQr || !skipQr) {
      _qr = null;
    }

    if (isEffectivelyOpen() && prev !== 'open' && _syncEnabled) {
      await loadContacts(true, true);
    }

    renderHeadActions();
    renderQrScreen();
    renderChatList();
    if (!isUserTyping()) renderThread();
    setCrmMode();

    if (isEffectivelyOpen()) {
      if (_pollConnect) { clearInterval(_pollConnect); _pollConnect = null; }
      _connectPollN = 0;
      _connectPollStarted = 0;
      const justOpened = prev !== 'open';
      await loadChats(true, justOpened ? { force: true } : {});
      startChatsPoll();
    }
    notifyKanbanState();
    return data;
  }

  async function loadChats(silent, opts = {}) {
    const query = { monitor_user_id: _monitorUserId };
    if (_status === 'open' && !_rebindRequired) {
      query.mirror = '1';
      if (opts.force) query.force_sync = '1';
    }
    const data = await api('chats', { query });
    if (data.user_id && data.user_id !== _userId) {
      hardResetLocalState();
      throw new Error('Sessão trocou. Recarregue a página.');
    }
    _chats = data.chats || [];
    renderChatList();
    notifyKanbanState();
    // #region agent log
    if (!silent) {
      try {
        const samples = (_chats || []).slice(0, 8).map(c => ({
          idTail: String(c.id || '').slice(-8),
          name: c.contact_name || null,
          phoneTail: String(c.contact_phone || '').slice(-4),
          hasAvatar: !!c.contact_avatar_url,
          jidTail: String(c.remote_jid || '').slice(-15),
        }));
        fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '97c411' }, body: JSON.stringify({ sessionId: '97c411', location: 'whatsapp-chat.js:loadChats', message: 'chats loaded', data: { count: (_chats || []).length, mirror: !!query.mirror, status: _status, rebindRequired: _rebindRequired, force: !!opts.force, samples }, timestamp: Date.now(), hypothesisId: 'H4-client-names' }) }).catch(() => {});
        fetch(`${apiBase()}/api/credito_api.php?action=client_log`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: '97c411', location: 'whatsapp-chat.js:loadChats', message: 'chats loaded', data: { count: (_chats || []).length, mirror: !!query.mirror, status: _status, rebindRequired: _rebindRequired }, timestamp: Date.now(), hypothesisId: 'mirror-rt', runId: 'mirror-rt' }) }).catch(() => {});
      } catch (_) {}
    }
    // #endregion
  }

  async function loadContacts(silent, force) {
    if (_syncing || !isEffectivelyOpen() || !_syncEnabled) return;
    _syncing = true;
    try {
      const data = await api('sync_contacts', { method: 'POST', body: force ? { force: true } : {} });
      _chats = data.chats || [];
      renderChatList();
      notifyKanbanState();
      // #region agent log
      try {
        fetch(`${apiBase()}/api/credito_api.php?action=client_log`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: '97c411', location: 'whatsapp-chat.js:loadContacts', message: 'sync contacts', data: { synced: data.synced, skipped: data.skipped, total: (_chats || []).length, force: !!force, error: data.error || null }, timestamp: Date.now(), hypothesisId: 'wa-sync', runId: 'phase2-sync' }) }).catch(() => {});
      } catch (_) {}
      // #endregion
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
    const query = { chat_id: chatId, monitor_user_id: _monitorUserId };
    if (isEffectivelyOpen() && _mirrorMode) query.mirror = '1';
    const data = await api('messages', { query });
    const newMsgs = data.messages || [];
    if (data.chat?.id) {
      const idx = _chats.findIndex(c => c.id === data.chat.id);
      if (idx >= 0) {
        _chats[idx] = { ..._chats[idx], ...data.chat };
      }
    }
    const fp = msgFingerprint(newMsgs);
    const changed = fp !== _msgFingerprint;
    _messages = newMsgs;
    _msgFingerprint = fp;
    // #region agent log
    try {
      const dirs = { in: 0, out: 0 };
      const stickers = { withMedia: 0, missing: 0 };
      (newMsgs || []).forEach(m => {
        if (m.direction === 'out') dirs.out += 1;
        else dirs.in += 1;
        if (String(m.message_type || '').toLowerCase() === 'sticker') {
          if (m.media_url) stickers.withMedia += 1;
          else stickers.missing += 1;
        }
      });
      fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '97c411' }, body: JSON.stringify({ sessionId: '97c411', location: 'whatsapp-chat.js:loadMessages', message: 'messages loaded', data: { chatId, count: newMsgs.length, dirs, stickers, contactName: data.chat?.contact_name || null, changed }, timestamp: Date.now(), hypothesisId: 'fromMe-mirror' }) }).catch(() => {});
    } catch (_) {}
    // #endregion
    if (!silent) _activeChatId = chatId;
    setCrmMode();
    if (!silent || (changed && !isUserTyping())) {
      renderThread();
    } else if (!silent) {
      renderThreadHeader();
    }
  }

  async function connect() {
    if (typeof showLoading === 'function') showLoading('Gerando QR Code...');
    try {
      const data = await api('connect', { method: 'POST' });
      _status = data.status || 'connecting';
      if (data.qr) _qr = data.qr;
      renderHeadActions();
      renderQrScreen();
      startConnectPoll();
      notifyKanbanState();
      if (!data.qr && typeof showToast === 'function') {
        showToast('QR não retornou. Clique em Atualizar QR.', 'warning');
      } else if (typeof showToast === 'function') {
        showToast('Escaneie o QR Code no celular.', 'info');
      }
    } catch (e) {
      console.error('[WhatsAppChat.connect]', e);
      const el = document.getElementById('waCrmQrScreen');
      if (el) {
        el.classList.remove('is-hidden');
        el.innerHTML = `<div class="wa-crm__qr-card"><div class="wa-alert">${esc(e.message || 'Erro ao conectar.')}</div><button type="button" class="btn btn-primary" onclick="WhatsAppChat.connect()">Tentar novamente</button></div>`;
      }
      if (typeof showToast === 'function') showToast(e.message || 'Erro ao gerar QR.', 'error');
    } finally {
      if (typeof hideLoading === 'function') hideLoading();
    }
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
    await api('disconnect', { method: 'POST' });
    _status = 'close';
    _chats = [];
    _messages = [];
    _msgFingerprint = '';
    _activeChatId = null;
    _qr = null;
    stopPollers();
    render();
    if (typeof showToast === 'function') showToast('WhatsApp desconectado.', 'success');
  }

  async function sendMessage() {
    const input = document.getElementById('waMsgInput');
    const text = (input?.value || '').trim();
    if (!text || !_activeChatId) return;
    closeEmojiPanel();
    input.value = '';
    input.style.height = 'auto';
    updateComposeMode();
    try {
      await api('send', { method: 'POST', body: { chat_id: _activeChatId, text } });
      await loadMessages(_activeChatId, true);
      await loadChats(true);
      // #region agent log
      try {
        fetch(`${apiBase()}/api/credito_api.php?action=client_log`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: '97c411', location: 'whatsapp-chat.js:sendMessage', message: 'wa send ok', data: { chatId: _activeChatId, textLen: text.length }, timestamp: Date.now(), hypothesisId: 'wa-p1', runId: 'phase1' }) }).catch(() => {});
      } catch (_) {}
      // #endregion
    } catch (e) {
      input.value = text;
      updateComposeMode();
      if (typeof showToast === 'function') showToast(e.message || 'Erro ao enviar.', 'error');
    }
  }

  async function sendMedia(file) {
    if (!_activeChatId || !file) return;
    const name = file.name || '';
    const isSticker = (file.type === 'image/webp' || /\.webp$/i.test(name));
    const isImage = !isSticker && (file.type || '').startsWith('image/');
    const isAudio = (file.type || '').startsWith('audio/');
    if (!isSticker && !isImage && !isAudio) {
      if (typeof showToast === 'function') showToast('Envie imagem (JPG, PNG…), figurinha (WEBP) ou áudio.', 'warning');
      return;
    }
    const caption = !isSticker ? (document.getElementById('waMsgInput')?.value || '').trim() : '';
    if (typeof showLoading === 'function') showLoading(isSticker ? 'Enviando figurinha...' : 'Enviando arquivo...');
    try {
      const uploaded = await uploadMedia(file);
      const mediaPath = String(uploaded.path || '').replace(/^\/uploads\//, '').replace(/^\//, '');
      const mediaType = isSticker ? 'sticker' : (isImage ? 'image' : 'audio');
      await api('send', {
        method: 'POST',
        body: {
          chat_id: _activeChatId,
          media_type: mediaType,
          media_url: mediaPath,
          mimetype: file.type || mimeFromName(file.name),
          file_name: file.name,
          caption,
          text: caption,
        },
      });
      const input = document.getElementById('waMsgInput');
      if (input) { input.value = ''; input.style.height = 'auto'; updateComposeMode(); }
      await loadMessages(_activeChatId, true);
      await loadChats(true);
      // #region agent log
      fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '97c411' }, body: JSON.stringify({ sessionId: '97c411', location: 'whatsapp-chat.js:sendMedia', message: 'send media ok', data: { mediaType, fileType: file.type || '', size: file.size || 0, chatId: _activeChatId }, timestamp: Date.now(), hypothesisId: 'media-send' }) }).catch(() => {});
      // #endregion
    } catch (e) {
      if (typeof showToast === 'function') {
        const msg = String(e.message || '');
        const hint = /audio|campo|property/i.test(msg)
          ? (msg.includes('audio') ? 'Falha ao enviar áudio. Verifique microfone e conexão.' : msg)
          : (msg || 'Erro ao enviar arquivo.');
        showToast(hint, 'error');
      }
    } finally {
      if (typeof hideLoading === 'function') hideLoading();
    }
  }

  async function openChatByPhone(phone, name) {
    const data = await api('open_chat', { method: 'POST', body: { phone, name: name || '' } });
    await loadChats(true);
    if (data.chat?.id) {
      if (_kanbanMode && window.WA?.openChat) {
        WA.openChat(data.chat.id);
        return;
      }
      _activeChatId = data.chat.id;
      await loadMessages(data.chat.id, false);
      startMsgPoll();
      setCrmMode();
      renderChatList();
    }
  }

  function renderHeadActions() {
    const el = document.getElementById('waHeadActions');
    if (!el) return;

    const newBtn = `<button type="button" class="wa-crm__icon-btn" id="waNewChatBtn" title="Nova conversa" aria-label="Nova conversa">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19.005 3.175H4.674C3.642 3.175 3 3.789 3 4.821V21.02l3.544-3.548h12.461c1.033 0 2.064-1.06 2.064-2.093V4.821c0-1.032-1.032-1.646-2.064-1.646zm-9.97 8.378h3.128v3.128h-3.128v-3.128zm0-4.255h3.128v3.129h-3.128V7.298zm4.255 4.255h3.129v3.128h-3.129v-3.128zm0-4.255h3.129v3.129h-3.129V7.298z"/></svg>
    </button>`;

    let statusHtml = '';
    if (!_configured) {
      statusHtml = '<span class="wa-crm__status-pill wa-crm__status-pill--off"><span class="wa-crm__status-dot"></span>Off</span>';
    } else if (_status === 'open') {
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

    if (_status === 'open') {
      el.classList.add('is-hidden');
      threadWrap?.classList.remove('is-hidden');
      return;
    }

    threadWrap?.classList.add('is-hidden');
    el.classList.remove('is-hidden');

    if (!_configured) {
      el.innerHTML = `<div class="wa-crm__qr-card"><h3>WhatsApp não configurado</h3><p>Crie <code>config.evolution.local.php</code> no servidor.</p></div>`;
      return;
    }

    const qr = _qr || '';
    el.innerHTML = `
      <div class="wa-crm__qr-card">
        <h3>Use o WhatsApp no SOU+BLU</h3>
        <p>Escaneie o QR Code para conectar seu número.</p>
        <div class="wa-qr-wrap">${qr ? `<img src="${esc(qr)}" alt="QR Code" class="wa-qr-img"/>` : '<p class="text-muted">Gerando QR...</p>'}</div>
        <button type="button" class="btn btn-primary" onclick="WhatsAppChat.connect()">Atualizar QR Code</button>
      </div>`;
  }

  function filteredChats() {
    let list = _chats;
    if (_listFilter === 'unread') {
      list = list.filter(c => Number(c.unread_count) > 0);
    }
    const q = _chatFilter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(c => {
      const name = String(c.contact_name || '').toLowerCase();
      const phone = String(c.contact_phone || '').toLowerCase();
      const preview = String(c.last_message_preview || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || preview.includes(q);
    });
  }

  
  async function updateChatStage(chatId, stageId) {
    const c = _chats.find(x => x.id === chatId);
    if(c) c.kanban_stage = stageId;
    renderChatList();
    try {
      await api('update_stage', { method: 'POST', body: { chat_id: chatId, stage: stageId, monitor_user_id: _monitorUserId } });
    } catch(e) {
      console.error(e);
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

    if (newBlock && _status !== 'open') newBlock.classList.remove('is-open');

    if (_status !== 'open') {
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
          html += `
              <div class="wa-chat-item${unreadCls}" draggable="true" ondragstart="WhatsAppChatDragStart(event, '${esc(c.id)}')">
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
                <div class="wa-chat-item__actions">
                  <button type="button" class="wa-action-icon ico-note" title="Anotações" onclick="if(typeof showToast==='function') showToast('Anotações em breve', 'info')">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                  </button>
                  <button type="button" class="wa-action-icon ico-sched" title="Agendamentos" onclick="if(typeof showToast==='function') showToast('Agendamentos em breve', 'info')">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="12" cy="16" r="2" fill="currentColor" opacity=".4"/></svg>
                  </button>
                  <button type="button" class="wa-action-icon ico-chat" title="Abrir conversa" onclick="WhatsAppChat.selectChat('${esc(c.id)}')">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  </button>
                  <button type="button" class="wa-action-icon ico-deal" title="Proposta / Venda" onclick="if(typeof showToast==='function') showToast('Propostas em breve', 'info')">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                  </button>
                </div>
              </div>`;
        });
        
        html += `</div></div>`;
      });
      html += '</div>';
      el.innerHTML = html;
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
      const preview = c.last_message_preview ? esc(humanPreview(c.last_message_preview)) : '<span class="wa-chat-item__phone">Toque para conversar</span>';
      html += `
        <button type="button" class="wa-chat-item${active}${unreadCls}" onclick="WhatsAppChat.selectChat('${esc(c.id)}')">
          ${avatarHtml(c, 'wa-chat-item__avatar')}
          <div class="wa-chat-item__body">
            <div class="wa-chat-item__top">
              <strong>${esc(displayContactName(c))}</strong>
              <span class="wa-chat-item__time">${esc(fmtTime(c.last_message_at))}</span>
            </div>
            <div class="wa-chat-item__bottom">
              <span class="wa-chat-item__preview">${esc(humanPreview(c.last_message_preview))}</span>
              ${unread}
            </div>
          </div>
        </button>`;
    });
    el.innerHTML = html;
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
      _syncEnabled = !!cfgData.sync_enabled;
      _mirrorMode = cfgData.mirror_mode !== false;
      _contactsMax = Number(cfgData.contacts_max) || (_mirrorMode ? 150 : 500);
      await refreshStatus();
      if (_configured && _status !== 'open') {
        if (!_qr) await refreshStatus({ refreshQr: true });
        if (!_qr) await connect();
      } else if (_qr && _status !== 'open') {
        _status = 'connecting';
      }
      if (isEffectivelyOpen()) {
        startMsgPoll();
        startChatsPoll();
        if (_syncEnabled) {
          await loadContacts(true, true);
          await loadChats(true, { force: true });
        }
      } else if (_status === 'connecting') startConnectPoll();
      notifyKanbanState();
      // #region agent log
      try {
        fetch(`${apiBase()}/api/credito_api.php?action=client_log`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: '97c411', location: 'whatsapp-chat.js:init', message: 'wa init ok', data: { configured: _configured, status: _status, hasQr: !!_qr, chats: (_chats || []).length, syncEnabled: _syncEnabled }, timestamp: Date.now(), hypothesisId: 'wa-p1', runId: 'phase1' }) }).catch(() => {});
      } catch (_) {}
      // #endregion
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
    simulateScan,
    disconnect,
    resetSession,
    refreshStatus,
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
      startMsgPoll();
      const chat = _chats.find(c => c.id === id);
      if (chat && !chat.contact_avatar_url) {
        loadChatAvatar(id, true).catch(() => {});
      }
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
    sendMedia,
    avatarHtml,
    displayContactName,
    humanPreview,
    fmtPhone,
    loadChatAvatar,
    _onAudioError: onAudioError,
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
      return { status: _status, chats: _chats, qr: _qr, userId: _userId, configured: _configured, phone: _phone, rebindRequired: _rebindRequired };
    },
  };
})();

window.WhatsAppChat = WhatsAppChat;
window.openClientWhatsApp = (phone, name) => {
  if (typeof navigateTo === 'function') navigateTo('secWhatsApp');
  return WhatsAppChat.openChatByPhone(phone, name);
};
