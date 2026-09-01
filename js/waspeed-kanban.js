/**
 * SOU+BLU · WaSpeed Kanban Controller v1
 * Substitui whatsapp-kanban.js com layout estilo waspeed
 *
 * Elementos HTML esperados:
 *   #waInboxList, #waConnDot, #waConnLabel, #waConnBtn, #waConnBtnLabel
 *   #wsInboxCount, #wsConnPill
 *   #wsChatPanel, #wsChatAvatar, #wsChatName, #wsChatStatus
 *   #wsChatMessages, #wsMain, #wsWelcomeScreen, #waConnectScreen
 *   #waQrModal, #waQrBox, #waQrImg, #waQrStatus, #waQrGenBtn, #waQrSimBtn
 *   #waNewChatModal, #waNewChatPhone, #waNewChatName
 *   #wsMsgInput, #wsSendBtn, #wsMicBtn, #wsAttachBtn, #wsFileInput
 *   #wsEmojiBtn, #wsEmojiPanel, #wsEmojiTabs, #wsEmojiGrid
 */
;(function () {
  'use strict';

  /* ── STATE ── */
  var _session  = null;
  var _chats    = [];
  var _status   = 'close';
  var _qr       = null;
  var _activeId = null;
  var _filterQ  = '';
  var _filter   = 'all'; // all | unread | open
  var _messages = [];
  var _poll     = null;
  var _emojiOpen = false;
  var _emojiCategory = 'smileys';
  var _msgPollTimer  = null;

  /* ── AVATAR COLORS (para variar por initial) ── */
  var AVATAR_GRADIENTS = [
    'linear-gradient(135deg,#667eea,#764ba2)',
    'linear-gradient(135deg,#f093fb,#f5576c)',
    'linear-gradient(135deg,#4facfe,#00f2fe)',
    'linear-gradient(135deg,#43e97b,#38f9d7)',
    'linear-gradient(135deg,#fa709a,#fee140)',
    'linear-gradient(135deg,#a18cd1,#fbc2eb)',
    'linear-gradient(135deg,#ffecd2,#fcb69f)',
    'linear-gradient(135deg,#a1c4fd,#c2e9fb)',
    'linear-gradient(135deg,#fd7043,#ff8a65)',
    'linear-gradient(135deg,#26a69a,#00897b)',
  ];

  /* ── EMOJI DATA (compartilha com whatsapp-chat.js se disponível) ── */
  var EMOJI_CATEGORIES = [
    { id:'smileys',  icon:'😀', title:'Rostos' },
    { id:'gestures', icon:'👋', title:'Gestos' },
    { id:'hearts',   icon:'❤️', title:'Corações' },
    { id:'animals',  icon:'🐶', title:'Animais' },
    { id:'food',     icon:'🍕', title:'Comida' },
    { id:'symbols',  icon:'✅', title:'Símbolos' },
  ];
  var EMOJI_SETS = {
    smileys:  ['😀','😃','😄','😁','😅','🤣','😂','🙂','😉','😊','😇','🥰','😍','🤩','😘','😋','😛','😜','🤪','😝','🤑','🤗','🤔','🤐','😐','😑','😶','😏','😒','🙄','😬','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤠','🥳','😎','😈','👿','💩','🤡','👻'],
    gestures: ['👋','🤚','🖐️','✋','👌','🤌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','🤝','🙏','💅','💪','👀','👅','👄'],
    hearts:   ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','🫶'],
    animals:  ['🐶','🐱','🐭','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🦆','🦅','🦉','🐺','🐴','🦄','🐝','🦋','🐌','🐞','🐜','🐢','🐍','🦎','🦖','🐙','🐬','🐳','🐋','🦈'],
    food:     ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥦','🥕','🍕','🍔','🍟','🌭','🥪','🥗','🍝','🍜','🍣','🍱','🍩','🍪','🎂','🍫','🍬','☕','🍵','🥤','🧋','🍺','🥂'],
    symbols:  ['✅','❌','❓','❗','💯','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🔶','🔷','🔸','🔹','🔔','🔕','💤','💢','💬','💭','🗯️','⚠️','🚫','⛔','📛','♻️','🔱','❇️','©️','®️','™️'],
  };

  /* ── HELPERS ── */
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function initials(name, phone) {
    var n = String(name || '').trim();
    if (n) {
      var parts = n.split(/\s+/);
      return (parts.length > 1 ? parts[0][0] + parts[1][0] : n.slice(0,2)).toUpperCase();
    }
    return (String(phone||'').replace(/\D/g,'').slice(-2) || '??');
  }

  function avatarGradient(name, phone) {
    var key = String((name || phone || '?').charCodeAt(0) || 0);
    return AVATAR_GRADIENTS[key % AVATAR_GRADIENTS.length];
  }

  function _parseBrDate(dt) {
    if (!dt) return null;
    if (typeof dt === 'number') return new Date(dt * 1000);
    const s = String(dt).trim();
    if (!s) return null;
    if (/Z$/i.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
      const d = new Date(s);
      return isNaN(d) ? null : d;
    }
    const norm = s.includes('T') ? s : s.replace(' ', 'T');
    const d = new Date(norm + '-03:00');
    return isNaN(d) ? null : d;
  }

  function fmtTime(dt) {
    var d = _parseBrDate(dt);
    if (!d) return '';
    var now = new Date();
    var tz = { timeZone: 'America/Sao_Paulo' };
    var dKey = d.toLocaleDateString('en-CA', tz);
    var nKey = now.toLocaleDateString('en-CA', tz);
    if (dKey === nKey) {
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    }
    var diff = (now - d) / 86400000;
    if (diff < 2) return 'Ontem';
    return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
  }

  function fmtPhone(p) {
    var d = String(p || '').replace(/\D/g,'');
    if (d.length === 11) return '('+d.slice(0,2)+') '+d.slice(2,7)+'-'+d.slice(7);
    if (d.length === 10) return '('+d.slice(0,2)+') '+d.slice(2,6)+'-'+d.slice(6);
    return p || '';
  }

  function previewIcon(chat) {
    var type = String(chat.last_message_type || '').toLowerCase();
    if (type === 'audio')  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="color:#8696a0"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/></svg> Áudio';
    if (type === 'image')  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8696a0" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> Imagem';
    if (type === 'sticker') return '🎉 Figurinha';
    return esc((chat.last_message_preview || '').slice(0, 50) || 'Toque para conversar');
  }

  function filtered() {
    var q = _filterQ.trim().toLowerCase();
    var list = _chats.slice();
    if (q) {
      list = list.filter(function(c){
        return (c.contact_name||'').toLowerCase().includes(q) ||
               (c.contact_phone||'').toLowerCase().includes(q) ||
               (c.last_message_preview||'').toLowerCase().includes(q);
      });
    }
    if (_filter === 'unread') list = list.filter(function(c){ return Number(c.unread_count) > 0; });
    return list;
  }

  /* ══════════════════════════════════════
     RENDER: INBOX
  ══════════════════════════════════════ */
  function renderInbox() {
    var el = document.getElementById('waInboxList');
    var cnt = document.getElementById('wsInboxCount');
    if (!el) return;

    var list = filtered();
    if (cnt) cnt.textContent = list.length;

    if (_status !== 'open' || !list.length) {
      el.innerHTML = '<div class="ws-inbox__empty"><strong>' +
        (_status !== 'open' ? 'WhatsApp desconectado' : 'Nenhuma conversa') +
        '</strong>' +
        (_status !== 'open'
          ? 'Use o botão abaixo para conectar o WhatsApp.'
          : 'Use o botão + para iniciar uma conversa.') +
        '</div>';
      return;
    }

    el.innerHTML = list.map(function(c) {
      var unread  = Number(c.unread_count) || 0;
      var active  = c.id === _activeId ? ' active' : '';
      var grad    = avatarGradient(c.contact_name, c.contact_phone);
      var inits   = initials(c.contact_name, c.contact_phone);
      var name    = esc(c.contact_name || c.contact_phone || c.id);
      var time    = fmtTime(c.last_message_at);
      var preview = previewIcon(c);
      var timeClass = unread ? ' has-unread' : '';

      return '<div class="ws-contact' + active + '" data-id="' + esc(c.id) + '" onclick="WA.openChat(\'' + esc(c.id) + '\')">' +

        /* Main row */
        '<div class="ws-contact__main">' +
          '<div class="ws-contact__avatar" style="background:' + grad + '">' + inits + '</div>' +
          '<div class="ws-contact__body">' +
            '<div class="ws-contact__name">' + name + '</div>' +
            '<div class="ws-contact__preview">' + preview + '</div>' +
          '</div>' +
          '<div class="ws-contact__meta">' +
            '<span class="ws-contact__time' + timeClass + '">' + time + '</span>' +
            (unread ? '<span class="ws-contact__badge">' + (unread > 99 ? '99+' : unread) + '</span>' : '') +
          '</div>' +
        '</div>' +

        /* Action icons row (os 4 ícones do waspeed) */
        '<div class="ws-contact__actions" onclick="event.stopPropagation()">' +

          /* Anotações */
          '<button class="ws-contact__action-btn ico-note" title="Anotações" onclick="WA.openNotes(\'' + esc(c.id) + '\')">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
              '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
              '<polyline points="14 2 14 8 20 8"/>' +
              '<line x1="16" y1="13" x2="8" y2="13"/>' +
              '<line x1="16" y1="17" x2="8" y2="17"/>' +
              '<polyline points="10 9 9 9 8 9"/>' +
            '</svg>' +
          '</button>' +

          /* Agendamento */
          '<button class="ws-contact__action-btn ico-sched" title="Agendamentos" onclick="WA.openSchedule(\'' + esc(c.id) + '\')">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
              '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>' +
              '<line x1="16" y1="2" x2="16" y2="6"/>' +
              '<line x1="8" y1="2" x2="8" y2="6"/>' +
              '<line x1="3" y1="10" x2="21" y2="10"/>' +
              '<circle cx="12" cy="16" r="2" fill="currentColor" opacity=".4"/>' +
            '</svg>' +
          '</button>' +

          /* WhatsApp (abrir chat) */
          '<button class="ws-contact__action-btn ico-chat" title="Abrir conversa" onclick="WA.openChat(\'' + esc(c.id) + '\')">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
              '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
            '</svg>' +
          '</button>' +

          /* Proposta / Venda */
          '<button class="ws-contact__action-btn ico-deal" title="Proposta / Venda" onclick="WA.openDeal(\'' + esc(c.id) + '\')">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
              '<line x1="12" y1="1" x2="12" y2="23"/>' +
              '<path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' +
            '</svg>' +
          '</button>' +

        '</div>' +

      '</div>';
    }).join('');
  }

  /* ══════════════════════════════════════
     RENDER: CHAT HEADER
  ══════════════════════════════════════ */
  function renderChatHeader() {
    var chat = _chats.find(function(c){ return c.id === _activeId; });
    var avatar = document.getElementById('wsChatAvatar');
    var nameEl = document.getElementById('wsChatName');
    var statusEl = document.getElementById('wsChatStatus');
    if (!chat) {
      if (avatar) avatar.textContent = '?';
      if (nameEl) nameEl.textContent = 'Contato';
      return;
    }
    if (avatar) {
      var grad = avatarGradient(chat.contact_name, chat.contact_phone);
      var inits = initials(chat.contact_name, chat.contact_phone);
      avatar.style.background = grad;
      avatar.textContent = inits;
    }
    if (nameEl) nameEl.textContent = chat.contact_name || fmtPhone(chat.contact_phone) || chat.id;
    if (statusEl) statusEl.textContent = fmtPhone(chat.contact_phone) || 'clique para ver perfil';
  }

  /* ══════════════════════════════════════
     RENDER: MESSAGES
  ══════════════════════════════════════ */
  function renderMessages() {
    var box = document.getElementById('wsChatMessages');
    if (!box) return;

    if (!_messages.length) {
      box.innerHTML = '<div class="ws-msg-sys">🔒 Mensagens protegidas com criptografia de ponta a ponta. Envie a primeira mensagem.</div>';
      return;
    }

    var html = '';
    var lastDate = '';

    _messages.forEach(function(m) {
      // Date separator
      var d = _parseBrDate(m.created_at || '');
      var dateStr = isNaN(d) ? '' : d.toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
      if (dateStr && dateStr !== lastDate) {
        html += '<div class="ws-date-sep">' + esc(dateStr) + '</div>';
        lastDate = dateStr;
      }

      var dir  = m.direction === 'out' ? 'out' : 'in';
      var type = String(m.message_type || 'text').toLowerCase();
      var time = isNaN(d) ? '' : d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      var check = dir === 'out' ? '<span class="ws-bubble__check">✓✓</span>' : '';

      // Sticker
      if (type === 'sticker' && m.media_url) {
        var src = buildMediaSrc(m.media_url);
        html += '<div class="ws-bubble ws-bubble--' + dir + ' ws-fade-in">' +
          '<img class="ws-bubble__sticker" src="' + esc(src) + '" alt="Figurinha" loading="lazy"/>' +
          '</div>';
        return;
      }

      var inner = '';

      if (type === 'image' && m.media_url) {
        var src = buildMediaSrc(m.media_url);
        inner += '<img class="ws-bubble__img" src="' + esc(src) + '" alt="Imagem" loading="lazy"/>';
        if (m.body && m.body !== '[Imagem]') {
          inner += '<div class="ws-bubble__text">' + esc(m.body) + '</div>';
        }
      } else if (type === 'audio' && m.media_url) {
        var src = buildMediaSrc(m.media_url);
        inner += '<div class="ws-bubble__audio">' +
          '<button class="ws-audio-play" onclick="this.nextElementSibling.querySelector(\'audio\').play()">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>' +
          '</button>' +
          '<div class="ws-audio-wave"><audio controls preload="metadata" src="' + esc(src) + '"></audio></div>' +
          '</div>';
      } else {
        inner += '<span class="ws-bubble__text">' + esc(m.body || '') + '</span>';
      }

      html += '<div class="ws-bubble ws-bubble--' + dir + ' ws-fade-in">' +
        '<div class="ws-bubble__wrap">' +
          inner +
          '<div class="ws-bubble__meta">' +
            '<span class="ws-bubble__time">' + time + '</span>' +
            check +
          '</div>' +
        '</div>' +
        '</div>';
    });

    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
  }

  function buildMediaSrc(mediaUrl) {
    if (!mediaUrl) return '';
    var u = String(mediaUrl);
    if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:') || u.startsWith('blob:')) return u;
    var cfg = window.SOUBLU_CONFIG || {};
    var base = String(cfg.API_BASE_URL || cfg.SITE_URL || location.origin).replace(/\/+$/,'');
    var path = u.replace(/^\/+/,'').replace(/^uploads\//,'');
    return base + '/api/file.php?path=' + encodeURIComponent(path);
  }

  /* ══════════════════════════════════════
     RENDER: CONNECTION BAR
  ══════════════════════════════════════ */
  function updateConnBar() {
    var dot    = document.getElementById('waConnDot');
    var label  = document.getElementById('waConnLabel');
    var btn    = document.getElementById('waConnBtn');
    var btnLbl = document.getElementById('waConnBtnLabel');
    var pill   = document.getElementById('wsConnPill');

    if (_status === 'open') {
      if (dot)    { dot.className = 'ws-conn-dot connected'; }
      if (label)  label.textContent = 'Conectado';
      if (btnLbl) btnLbl.textContent = 'Desconectar';
      if (btn)    btn.classList.add('connected');
      if (pill)   { pill.textContent = '● Online'; pill.style.color = '#a7f3d0'; }
    } else if (_status === 'connecting') {
      if (dot)    { dot.className = 'ws-conn-dot connecting'; }
      if (label)  label.textContent = 'Conectando…';
      if (btnLbl) btnLbl.textContent = 'Conectando…';
      if (btn)    btn.classList.remove('connected');
      if (pill)   { pill.textContent = '◌ Conectando…'; pill.style.color = '#fde68a'; }
    } else {
      if (dot)    { dot.className = 'ws-conn-dot'; }
      if (label)  label.textContent = 'Desconectado';
      if (btnLbl) btnLbl.textContent = 'Conectar WhatsApp';
      if (btn)    btn.classList.remove('connected');
      if (pill)   { pill.textContent = '○ Desconectado'; pill.style.color = 'rgba(255,255,255,.7)'; }
    }

    // Close QR modal when connected
    var modal = document.getElementById('waQrModal');
    if (modal && modal.classList.contains('open') && _status === 'open') {
      var st = document.getElementById('waQrStatus');
      if (st) st.textContent = '✓ WhatsApp conectado com sucesso!';
      setTimeout(function(){ WA.closeQrModal(); }, 1500);
    }

    // Update QR if available
    if (modal && modal.classList.contains('open') && _qr) {
      var box = document.getElementById('waQrBox');
      var img = document.getElementById('waQrImg');
      if (box) box.style.display = 'block';
      if (img && img.src !== _qr) img.src = _qr;
      var simBtn = document.getElementById('waQrSimBtn');
      var genBtn = document.getElementById('waQrGenBtn');
      if (simBtn) simBtn.style.display = 'inline-flex';
      if (genBtn) genBtn.style.display = 'none';
    }
  }

  /* ══════════════════════════════════════
     RENDER: SCREENS
  ══════════════════════════════════════ */
  function renderScreens() {
    var welcome = document.getElementById('wsWelcomeScreen');
    var connect = document.getElementById('waConnectScreen');
    var chatPanel = document.getElementById('wsChatPanel');

    if (_status === 'open') {
      if (connect) connect.style.display = 'none';
      if (_activeId) {
        if (welcome) welcome.style.display = 'none';
        if (chatPanel) { chatPanel.style.display = 'flex'; chatPanel.classList.add('ws-slide-in'); }
      } else {
        if (welcome) welcome.style.display = '';
        if (chatPanel) chatPanel.style.display = 'none';
      }
    } else {
      if (welcome) welcome.style.display = 'none';
      if (chatPanel) chatPanel.style.display = 'none';
      if (connect) connect.style.display = '';
    }
  }

  /* ── Full render ── */
  function render() {
    renderInbox();
    updateConnBar();
    renderScreens();
    if (_activeId && _status === 'open') {
      renderChatHeader();
    }
  }

  /* ══════════════════════════════════════
     EMOJI PANEL
  ══════════════════════════════════════ */
  function renderEmojiPanel() {
    var tabs = document.getElementById('wsEmojiTabs');
    var grid = document.getElementById('wsEmojiGrid');
    if (!tabs || !grid) return;

    if (!tabs.dataset.rendered) {
      tabs.innerHTML = EMOJI_CATEGORIES.map(function(cat) {
        return '<button type="button" class="ws-emoji-tab" data-cat="' + cat.id + '" title="' + esc(cat.title) + '">' + cat.icon + '</button>';
      }).join('');
      tabs.dataset.rendered = '1';
      tabs.addEventListener('click', function(e) {
        var btn = e.target.closest('.ws-emoji-tab');
        if (!btn) return;
        _emojiCategory = btn.dataset.cat;
        tabs.querySelectorAll('.ws-emoji-tab').forEach(function(t){ t.classList.toggle('active', t.dataset.cat === _emojiCategory); });
        renderEmojiGrid();
      });
    }

    renderEmojiGrid();
  }

  function renderEmojiGrid() {
    var grid = document.getElementById('wsEmojiGrid');
    if (!grid) return;
    var emojis = EMOJI_SETS[_emojiCategory] || [];
    grid.innerHTML = emojis.map(function(e) {
      return '<button type="button" class="ws-emoji-item" data-emoji="' + esc(e) + '">' + e + '</button>';
    }).join('');
    grid.addEventListener('click', function handler(ev) {
      var item = ev.target.closest('.ws-emoji-item');
      if (!item) return;
      insertEmoji(item.dataset.emoji);
      grid.removeEventListener('click', handler);
      renderEmojiGrid(); // rebind
    }, { once: false });
  }

  function insertEmoji(emoji) {
    var input = document.getElementById('wsMsgInput');
    if (!input) return;
    var start = input.selectionStart || 0;
    var end   = input.selectionEnd   || 0;
    input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
    var pos = start + emoji.length;
    input.selectionStart = input.selectionEnd = pos;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }

  function toggleEmoji() {
    var panel = document.getElementById('wsEmojiPanel');
    var btn   = document.getElementById('wsEmojiBtn');
    if (!panel) return;
    _emojiOpen = !_emojiOpen;
    panel.classList.toggle('open', _emojiOpen);
    if (btn) btn.classList.toggle('active', _emojiOpen);
    if (_emojiOpen) renderEmojiPanel();
  }

  /* ══════════════════════════════════════
     COMPOSE EVENTS
  ══════════════════════════════════════ */
  function bindCompose() {
    var input    = document.getElementById('wsMsgInput');
    var sendBtn  = document.getElementById('wsSendBtn');
    var micBtn   = document.getElementById('wsMicBtn');
    var attachBtn = document.getElementById('wsAttachBtn');
    var fileInput = document.getElementById('wsFileInput');
    var emojiBtn  = document.getElementById('wsEmojiBtn');

    if (!input || input.dataset.wsBound === '1') return;
    input.dataset.wsBound = '1';

    function updateMode() {
      var hasText = !!(input.value || '').trim();
      if (sendBtn) sendBtn.classList.toggle('hidden', !hasText);
      if (micBtn)  micBtn.classList.toggle('hidden', hasText);
    }

    input.addEventListener('input', function() {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
      updateMode();
    });

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        WA.sendMessage();
      }
    });

    if (sendBtn) sendBtn.addEventListener('click', function(){ WA.sendMessage(); });

    if (micBtn) micBtn.addEventListener('click', function(){
      if (typeof showToast === 'function') showToast('Gravação de áudio em breve. Use o clipe para enviar arquivo de áudio.', 'info');
    });

    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', function(){ fileInput.click(); });
      fileInput.addEventListener('change', function() {
        var file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (file) WA.sendMediaFile(file);
      });
    }

    if (emojiBtn) {
      emojiBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleEmoji();
      });
    }

    // Close emoji on outside click
    document.addEventListener('click', function(e) {
      if (!_emojiOpen) return;
      if (e.target.closest('#wsEmojiPanel') || e.target.closest('#wsEmojiBtn')) return;
      var panel = document.getElementById('wsEmojiPanel');
      if (panel) panel.classList.remove('open');
      var btn = document.getElementById('wsEmojiBtn');
      if (btn) btn.classList.remove('active');
      _emojiOpen = false;
    });

    updateMode();
  }

  /* ══════════════════════════════════════
     POLL LOOP
  ══════════════════════════════════════ */
  function startPoll() {
    if (_poll) clearInterval(_poll);
    _poll = setInterval(function() {
      if (typeof WhatsAppChat === 'undefined' || !WhatsAppChat._getState) return;
      var st = WhatsAppChat._getState();
      var changed = st.status !== _status || st.chats.length !== _chats.length || st.qr !== _qr;
      _status = st.status;
      _chats  = st.chats  || [];
      _qr     = st.qr     || null;
      if (changed) render();
      else updateConnBar();
    }, 1400);
  }

  function startMsgPoll() {
    if (_msgPollTimer) clearInterval(_msgPollTimer);
    _msgPollTimer = setInterval(function(){
      if (!_activeId || typeof WhatsAppChat === 'undefined') return;
      WhatsAppChat._fetchMessages && WhatsAppChat._fetchMessages(_activeId, true).then(function(msgs){
        if (!msgs) return;
        _messages = msgs;
        renderMessages();
      }).catch(function(){});
    }, 8000);
  }

  /* ══════════════════════════════════════
     PUBLIC API (window.WA)
  ══════════════════════════════════════ */
  window.WA = {

    boot: function(session) {
      _session = session;
      render();
      if (typeof WhatsAppChat !== 'undefined') {
        var p = WhatsAppChat.init && WhatsAppChat.init();
        if (p && typeof p.then === 'function') {
          p.then(function(){
            WhatsAppChat.initKanbanMode && WhatsAppChat.initKanbanMode();
          });
        } else {
          WhatsAppChat.initKanbanMode && WhatsAppChat.initKanbanMode();
        }
      }
      startPoll();
      bindCompose();
    },

    /* ─ Open chat ─ */
    openChat: function(chatId) {
      _activeId = chatId;

      // Mark active in list
      document.querySelectorAll('.ws-contact').forEach(function(el){
        el.classList.toggle('active', el.dataset.id === chatId);
      });

      renderScreens();
      renderChatHeader();

      // Load messages
      if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.selectChat) {
        WhatsAppChat.selectChat(chatId);
      }

      // Fetch & render messages
      if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat._fetchMessages) {
        WhatsAppChat._fetchMessages(chatId, false).then(function(msgs){
          _messages = msgs || [];
          renderMessages();
        }).catch(function(){});
      }

      startMsgPoll();
    },

    /* ─ Close chat ─ */
    closeChat: function() {
      _activeId = null;
      if (_msgPollTimer) { clearInterval(_msgPollTimer); _msgPollTimer = null; }
      document.querySelectorAll('.ws-contact').forEach(function(el){ el.classList.remove('active'); });
      renderScreens();
      if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat._kanbanClose) {
        WhatsAppChat._kanbanClose();
      }
    },

    /* ─ Send message ─ */
    sendMessage: function() {
      var input = document.getElementById('wsMsgInput');
      var text  = (input && input.value || '').trim();
      if (!text || !_activeId) return;
      if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.sendMessage) {
        input.value = '';
        input.style.height = 'auto';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        WhatsAppChat.sendMessage(text, _activeId);
        setTimeout(function(){
          if (typeof WhatsAppChat._fetchMessages === 'function') {
            WhatsAppChat._fetchMessages(_activeId, true).then(function(msgs){
              _messages = msgs || [];
              renderMessages();
            });
          }
        }, 1000);
      }
    },

    /* ─ Send media ─ */
    sendMediaFile: function(file) {
      if (!_activeId) return;
      if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.sendMedia) {
        WhatsAppChat.sendMedia(file, _activeId);
      }
    },

    /* ─ Filter ─ */
    filterInbox: function(q) {
      _filterQ = q || '';
      renderInbox();
    },

    setFilter: function(btn, filter) {
      _filter = filter;
      document.querySelectorAll('.ws-filter-pill').forEach(function(b){ b.classList.remove('active'); });
      if (btn) btn.classList.add('active');
      renderInbox();
    },

    /* ─ Refresh ─ */
    refresh: function() {
      if (typeof WhatsAppChat === 'undefined') return;
      WhatsAppChat.refreshStatus && WhatsAppChat.refreshStatus();
    },

    /* ─ Connect / Disconnect ─ */
    toggleConnect: function() {
      if (_status === 'open') {
        if (confirm('Desconectar o WhatsApp? As conversas salvas serão mantidas.')) {
          if (typeof WhatsAppChat !== 'undefined') WhatsAppChat.disconnect && WhatsAppChat.disconnect();
        }
      } else {
        WA.openQrModal();
      }
    },

    /* ─ QR Modal ─ */
    openQrModal: function() {
      var modal = document.getElementById('waQrModal');
      if (modal) modal.classList.add('open');
      var box = document.getElementById('waQrBox');
      var st  = document.getElementById('waQrStatus');
      var simBtn = document.getElementById('waQrSimBtn');
      var genBtn = document.getElementById('waQrGenBtn');
      if (_qr) {
        var img = document.getElementById('waQrImg');
        if (box) box.style.display = 'block';
        if (img) img.src = _qr;
        if (simBtn) simBtn.style.display = 'inline-flex';
        if (genBtn) genBtn.style.display = 'none';
        if (st) st.textContent = 'Escaneie o QR Code com o WhatsApp do seu celular';
      } else {
        if (box) box.style.display = 'none';
        if (simBtn) simBtn.style.display = 'none';
        if (genBtn) genBtn.style.display = 'inline-flex';
        if (st) st.textContent = 'Gerando QR Code…';
        // Auto-gerar
        if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.connect) {
          WhatsAppChat.connect();
        }
      }
    },

    closeQrModal: function() {
      var modal = document.getElementById('waQrModal');
      if (modal) modal.classList.remove('open');
    },

    generateQr: function() {
      var st  = document.getElementById('waQrStatus');
      var btn = document.getElementById('waQrGenBtn');
      if (st) st.textContent = 'Gerando QR Code…';
      if (btn) btn.disabled = true;
      if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.connect) WhatsAppChat.connect();
      setTimeout(function(){ if (btn) btn.disabled = false; }, 4000);
    },

    simulateScan: function() {
      var btn = document.getElementById('waQrSimBtn');
      if (btn) btn.disabled = true;
      if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.simulateScan) WhatsAppChat.simulateScan();
    },

    /* ─ New Chat Modal ─ */
    openNewChat: function() {
      var modal = document.getElementById('waNewChatModal');
      var phoneEl = document.getElementById('waNewChatPhone');
      var nameEl  = document.getElementById('waNewChatName');
      if (phoneEl) phoneEl.value = '';
      if (nameEl)  nameEl.value  = '';
      if (modal)   modal.classList.add('open');
      if (phoneEl) setTimeout(function(){ phoneEl.focus(); }, 80);
    },

    closeNewChatModal: function() {
      var modal = document.getElementById('waNewChatModal');
      if (modal) modal.classList.remove('open');
    },

    submitNewChat: function() {
      var phone = (document.getElementById('waNewChatPhone') && document.getElementById('waNewChatPhone').value || '').trim();
      var name  = (document.getElementById('waNewChatName')  && document.getElementById('waNewChatName').value  || '').trim();
      if (!phone) {
        if (typeof showToast === 'function') showToast('Digite um número de telefone.', 'error');
        return;
      }
      WA.closeNewChatModal();
      if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.openChatByPhone) {
        WhatsAppChat.openChatByPhone(phone.replace(/\D/g,''), name);
      }
    },

    /* ─ Action shortcuts ─ */
    openNotes: function(chatId) {
      if (typeof showToast === 'function') showToast('Anotações: em breve!', 'info');
    },

    openSchedule: function(chatId) {
      if (typeof showToast === 'function') showToast('Agendamentos: em breve!', 'info');
    },

    openDeal: function(chatId) {
      if (typeof showToast === 'function') showToast('Propostas/Vendas: em breve!', 'info');
    },

    /* ─ Expose for WhatsApp chat engine ─ */
    _updateState: function(status, chats, qr) {
      _status = status;
      _chats  = chats || [];
      _qr     = qr || null;
      render();
    },

    _pushMessages: function(msgs) {
      _messages = msgs || [];
      renderMessages();
    },
  };

  // Close modals on backdrop click
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('ws-backdrop')) {
      e.target.classList.remove('open');
    }
  });

})();
