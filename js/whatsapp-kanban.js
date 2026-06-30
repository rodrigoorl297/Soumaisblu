/**
 * SOU+BLU · WhatsApp Kanban v2
 * IDs: waInboxList, waBoardStrip, waBoardCols, waAddColBtn,
 *      waConnectScreen, waQrBox, waQrImg, waConnectStatus, waConnectBtn,
 *      waChatPanel, waChatRoot, waColModal, waCtxMenu
 */
;(function () {
  'use strict';

  /* ── Default columns ── */
  var DEFAULTS = [
    { id: 'novo',        name: 'Novo Contato',    color: '#2f81f7' },
    { id: 'atendimento', name: 'Atendimento',      color: '#d29922' },
    { id: 'proposta',    name: 'Proposta',          color: '#bc8cff' },
    { id: 'contrato',    name: 'Contrato',          color: '#3fb950' },
    { id: 'cancelado',   name: 'Cancelado',         color: '#f85149' },
  ];

  /* ── State ── */
  var _session   = null;
  var _chats     = [];
  var _status    = 'close';
  var _phone     = null;
  var _qr        = null;
  var _filterQ   = '';
  var _activeId  = null;
  var _ctxColId  = null;
  var _selColor  = '#2f81f7';
  var _poll      = null;
  var _chatsFp   = '';

  function syncFromChat() {
    if (typeof WhatsAppChat === 'undefined' || !WhatsAppChat._getState) return false;
    var st = WhatsAppChat._getState();
    var fp = String(st.userId || '') + '|' + (st.chats || []).map(function (c) {
      return String(c.id) + ':' + String(c.last_message_preview || '') + ':' + String(c.kanban_stage || '') + ':' + String(c.unread_count || 0);
    }).join('|');
    var changed = st.status !== _status || st.qr !== _qr || st.phone !== _phone || fp !== _chatsFp;
    _status = st.status;
    _phone = st.phone || null;
    _chats = st.chats || [];
    _qr = st.qr || null;
    _chatsFp = fp;
    return changed;
  }

  function onChatStateChanged() {
    var prevStatus = _status;
    var prevQr = !!_qr;
    var changed = syncFromChat();
    if (changed) {
      render();
      if (_status === 'connecting' && _qr) {
        var modal = document.getElementById('waQrModal');
        if (modal && !modal.classList.contains('open')) {
          WA.openQrModal();
        }
      }
    } else {
      updateConnBar();
    }
  }

  /* ── Column storage ── */
  function colKey() { return 'wa_cols_v2_' + ((_session && _session.id) || 'x'); }
  function loadCols() {
    try { var r = localStorage.getItem(colKey()); if (r) return JSON.parse(r); } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
  function saveCols(c) { localStorage.setItem(colKey(), JSON.stringify(c)); }

  /* ── Helpers ── */
  function esc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function initials(name, phone) {
    if (name && name.trim()) {
      var p = name.trim().split(/\s+/);
      return (p.length > 1 ? p[0][0] + p[1][0] : p[0].slice(0,2)).toUpperCase();
    }
    return (String(phone||'').replace(/\D/g,'').slice(-2) || '?');
  }
  function fmtTime(dt) {
    if (!dt) return '';
    var d = new Date(typeof dt === 'number' ? dt * 1000 : dt);
    if (isNaN(d)) return '';
    var diff = (Date.now() - d) / 1000;
    if (diff < 60)    return 'agora';
    if (diff < 3600)  return Math.floor(diff/60) + 'min';
    if (diff < 86400) return d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
  }
  function chatStage(c) {
    var raw = c.kanban_stage || 'novo';
    var legacy = { novo_contato: 'novo', em_atendimento: 'atendimento', negociacao: 'proposta', finalizado: 'cancelado' };
    return legacy[raw] || raw;
  }
  function filtered() {
    var q = _filterQ.trim().toLowerCase();
    if (!q) return _chats;
    return _chats.filter(function(c){
      return (c.contact_name||'').toLowerCase().includes(q) ||
             (c.contact_phone||'').toLowerCase().includes(q) ||
             (c.last_message_preview||'').toLowerCase().includes(q);
    });
  }

  /* ── SVG icons ── */
  var ICO = {
    clock:  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    msg:    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    move:   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>',
    dots:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>',
    empty:  '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>',
    add:    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  };

  /* ── Tag colors ── */
  var TAG_COLORS = { lead:'#2563eb',hot:'#dc2626',vip:'#9333ea',follow:'#d97706',closed:'#16a34a' };
  function tagColor(t) { return TAG_COLORS[t] || '#3b4a54'; }
  function parseTags(raw) {
    if (!raw) return [];
    try { return JSON.parse(raw); } catch(e) { return String(raw).split(',').map(function(t){return t.trim();}).filter(Boolean); }
  }

  /* ══════════════════════════════════════
     RENDER: INBOX
  ══════════════════════════════════════ */
  function contactAvatarHtml(c) {
    if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.avatarHtml) {
      return WhatsAppChat.avatarHtml(c, 'wa-contact__avatar');
    }
    return '<div class="wa-contact__avatar">' + esc(initials(c.contact_name, c.contact_phone)) + '</div>';
  }

  function contactLabel(c) {
    if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.displayContactName) {
      return WhatsAppChat.displayContactName(c);
    }
    return c.contact_name || c.contact_phone || c.id;
  }

  function previewLabel(c) {
    if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.humanPreview) {
      return WhatsAppChat.humanPreview(c.last_message_preview || '');
    }
    return (c.last_message_preview || '').slice(0, 48) || 'Toque para conversar';
  }

  function cardAvatarHtml(c) {
    if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.avatarHtml) {
      return WhatsAppChat.avatarHtml(c, 'wa-kcard__avatar');
    }
    return '<div class="wa-kcard__avatar">' + esc(initials(c.contact_name, c.contact_phone)) + '</div>';
  }

  function renderInbox() {
    var el = document.getElementById('waInboxList');
    if (!el) return;
    var list = filtered();

    if (_status !== 'open' || !list.length) {
      el.innerHTML = '<div class="wa-inbox__empty"><strong>' +
        (!isEffectivelyOpen() ? 'WhatsApp desconectado' : 'Nenhuma conversa') +
        '</strong>' +
        (!isEffectivelyOpen() ? 'Conecte abaixo para ver suas conversas.' : 'Toque em Atualizar (↻) ou inicie uma conversa com +.') +
        '</div>';
      return;
    }

    el.innerHTML = list.map(function(c) {
      var unread = Number(c.unread_count) || 0;
      var active = c.id === _activeId ? ' active' : '';
      return '<div class="wa-contact' + active + '" draggable="true"' +
        ' ondragstart="WA.dragStart(event,\'' + esc(c.id) + '\')"' +
        ' onclick="WA.openChat(\'' + esc(c.id) + '\')">' +
        contactAvatarHtml(c) +
        '<div class="wa-contact__body">' +
          '<div class="wa-contact__name">' + esc(contactLabel(c)) + '</div>' +
          '<div class="wa-contact__preview">' + esc(previewLabel(c)) + '</div>' +
        '</div>' +
        '<div class="wa-contact__meta">' +
          '<span class="wa-contact__time">' + fmtTime(c.last_message_at) + '</span>' +
          (unread ? '<span class="wa-contact__badge">' + unread + '</span>' : '') +
        '</div>' +
        '</div>';
    }).join('');
  }

  /* ══════════════════════════════════════
     RENDER: KANBAN
  ══════════════════════════════════════ */
  function renderKanban() {
    var strip = document.getElementById('waBoardStrip');
    var cols  = document.getElementById('waBoardCols');
    var addBtn = document.getElementById('waAddColBtn');
    if (!strip || !cols) return;

    var list = filtered();
    var defs = loadCols();

    /* headers */
    strip.innerHTML = defs.map(function(col) {
      var count = list.filter(function(c){ return chatStage(c) === col.id; }).length;
      return '<div class="wa-col-tab" style="--col-color:' + col.color + '">' +
        '<span class="wa-col-tab__name">' + esc(col.name) + '</span>' +
        '<span class="wa-col-tab__count">' + count + '</span>' +
        '<span class="wa-col-tab__value">R$ 0,00</span>' +
        '<button class="wa-col-tab__more" onclick="event.stopPropagation();WA.openCtx(event,\'' + esc(col.id) + '\')" title="Opções">' + ICO.dots + '</button>' +
        '</div>';
    }).join('');
    if (addBtn) strip.appendChild(addBtn);

    /* column bodies */
    cols.innerHTML = defs.map(function(col) {
      var colChats = list.filter(function(c){ return chatStage(c) === col.id; });

      var cards = colChats.map(function(c) {
        var unread  = Number(c.unread_count) || 0;
        var tags    = parseTags(c.tags);
        var active  = c.id === _activeId ? ' active' : '';
        var phone   = c.contact_phone && String(c.contact_phone).replace(/\D/g,'').length <= 13 ? esc(c.contact_phone) : '';

        var tagsHtml = tags.map(function(t){
          return '<span class="wa-kcard__tag" style="background:' + tagColor(t) + '">' + esc(t) + '</span>';
        }).join('');

        var stageOpts = defs.map(function(co){
          return '<option value="' + esc(co.id) + '"' + (co.id === col.id ? ' selected' : '') + '>' + esc(co.name) + '</option>';
        }).join('');

        return '<div class="wa-kcard' + active + '" draggable="true"' +
          ' ondragstart="WA.dragStart(event,\'' + esc(c.id) + '\')"' +
          ' onclick="WA.openChat(\'' + esc(c.id) + '\')">' +

          /* header */
          '<div class="wa-kcard__header">' +
            cardAvatarHtml(c) +
            '<div class="wa-kcard__info">' +
              '<div class="wa-kcard__name">' + esc(contactLabel(c)) + '</div>' +
              (phone ? '<div class="wa-kcard__phone">' + phone + '</div>' : '') +
            '</div>' +
            (unread ? '<span class="wa-kcard__badge">' + unread + '</span>' : '') +
          '</div>' +

          /* tags */
          (tags.length ? '<div class="wa-kcard__tags">' + tagsHtml + '</div>' : '') +

          /* preview */
          '<div class="wa-kcard__preview">' + esc(previewLabel(c) || 'Sem mensagens') + '</div>' +

          /* footer */
          '<div class="wa-kcard__footer">' +
            '<span class="wa-kcard__time">' + ICO.clock + fmtTime(c.last_message_at) + '</span>' +
            '<div class="wa-kcard__actions" onclick="event.stopPropagation()">' +
              '<select class="wa-kcard__stage" onchange="WA.moveCard(\'' + esc(c.id) + '\',this.value)">' +
                stageOpts +
              '</select>' +
            '</div>' +
          '</div>' +
          '</div>';
      }).join('');

      var empty = !colChats.length
        ? '<div class="wa-col-empty">' + ICO.empty +
          '<p>Arraste contatos ou mova usando o seletor no card</p></div>'
        : '';

      return '<div class="wa-col-body" data-col="' + esc(col.id) + '"' +
        ' ondrop="WA.drop(event,\'' + esc(col.id) + '\')"' +
        ' ondragenter="WA.dragEnter(event)"' +
        ' ondragover="WA.dragOver(event)"' +
        ' ondragleave="WA.dragLeave(event)">' +
        cards + empty +
        '</div>';
    }).join('');
  }

  /* ══════════════════════════════════════
     RENDER: CONNECT SCREEN
  ══════════════════════════════════════ */
  function renderConnect() {
    var screen = document.getElementById('waConnectScreen');
    var strip  = document.getElementById('waBoardStrip');
    var cols   = document.getElementById('waBoardCols');
    if (!screen) return;

    if (isEffectivelyOpen()) {
      screen.style.display = 'none';
      if (strip) strip.style.display = '';
      if (cols)  cols.style.display  = '';
    } else if (_status === 'connecting') {
      // Hide the big connect screen — the QR modal handles this
      screen.style.display = 'none';
      if (strip) strip.style.display = 'none';
      if (cols)  cols.style.display  = 'none';
      // Auto-open QR modal if we have a QR code
      if (_qr) {
        var modal = document.getElementById('waQrModal');
        if (modal && !modal.classList.contains('open')) {
          WA.openQrModal();
        }
      }
    } else {
      // Disconnected — show connect screen
      screen.style.display = '';
      if (strip) strip.style.display = 'none';
      if (cols)  cols.style.display  = 'none';
    }
  }

  /* ── Full render ── */
  function render() {
    renderConnect();
    renderInbox();
    updateConnBar();
    if (isEffectivelyOpen()) renderKanban();
  }

  /* ══════════════════════════════════════
     CONNECTION BAR
  ══════════════════════════════════════ */
  function evolutionConfigured() {
    if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat._getState) {
      return !!WhatsAppChat._getState().configured;
    }
    return true;
  }

  function showQrSimButton() {
    return !evolutionConfigured();
  }

  function _rebindRequired() {
    if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat._getState) {
      return !!WhatsAppChat._getState().rebindRequired;
    }
    return false;
  }

  function isEffectivelyOpen() {
    return _status === 'open' && !_rebindRequired();
  }

  function updateConnBar() {
    var dot   = document.getElementById('waConnDot');
    var label = document.getElementById('waConnLabel');
    var btn   = document.getElementById('waConnBtn');
    var btnLbl = document.getElementById('waConnBtnLabel');
    if (!dot) return;

    if (_status === 'open' && !_rebindRequired()) {
      dot.className   = 'wa-conn-dot connected';
      var phone = _phone;
      var fmt = (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.fmtPhone) ? WhatsAppChat.fmtPhone : null;
      if (label) label.textContent = phone && fmt ? ('Conectado: ' + fmt(phone)) : 'Conectado';
      if (btnLbl) btnLbl.textContent = 'Desconectar';
      if (btn) btn.classList.add('is-connected');
    } else {
      dot.className   = 'wa-conn-dot';
      if (label) label.textContent = 'Desconectado';
      if (btnLbl) btnLbl.textContent = 'Conectar WhatsApp';
      if (btn) btn.classList.remove('is-connected');
    }

    // Update QR modal if open
    var modal = document.getElementById('waQrModal');
    if (modal && modal.classList.contains('open') && _status === 'open') {
      var st = document.getElementById('waQrStatus');
      if (st) st.textContent = 'WhatsApp conectado com sucesso!';
      setTimeout(function() { WA.closeQrModal(); }, 1500);
    }
    if (modal && modal.classList.contains('open') && _qr) {
      var box = document.getElementById('waQrBox');
      var img = document.getElementById('waQrImg');
      var simBtn = document.getElementById('waQrSimBtn');
      var genBtn = document.getElementById('waQrGenBtn');
      if (box) box.style.display = 'block';
      if (img && img.src !== _qr) img.src = _qr;
      if (simBtn) simBtn.style.display = showQrSimButton() ? 'inline-flex' : 'none';
      if (genBtn) genBtn.style.display = 'none';
      var st2 = document.getElementById('waQrStatus');
      if (st2 && st2.textContent !== 'Escaneie o QR Code com o WhatsApp do seu celular') {
        st2.textContent = 'Escaneie o QR Code com o WhatsApp do seu celular';
      }
    }
  }

  /* ══════════════════════════════════════
     CHAT PANEL
  ══════════════════════════════════════ */
  function openChatPanel(chatId) {
    _activeId = chatId;
    var panel = document.getElementById('waChatPanel');
    var board = document.getElementById('waBoard');
    if (panel) panel.classList.add('open');
    if (board) board.classList.add('wa-board--chat-open');
    render();
    if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.selectChat) {
      WhatsAppChat.selectChat(chatId);
    }
  }

  /* ══════════════════════════════════════
     POLL
  ══════════════════════════════════════ */
  function startPoll() {
    if (_poll) clearInterval(_poll);
    _poll = setInterval(function() {
      if (syncFromChat()) render();
      else updateConnBar();
    }, 1500);
  }

  window.addEventListener('wa:state-changed', onChatStateChanged);

  /* ══════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════ */
  window.WA = {

    boot: function(session) {
      _session = session;
      render();
      if (typeof WhatsAppChat !== 'undefined') {
        var initP = WhatsAppChat.init && WhatsAppChat.init();
        var afterInit = function() {
          WhatsAppChat.initKanbanMode && WhatsAppChat.initKanbanMode();
          syncFromChat();
          render();
          if (_status !== 'open') {
            WA.openQrModal();
          }
          var params = new URLSearchParams(window.location.search);
          var phone = params.get('phone') || '';
          var name = params.get('name') || '';
          if (phone && WhatsAppChat.openChatByPhone) {
            WhatsAppChat.openChatByPhone(phone.replace(/\D/g, ''), name).catch(function (e) {
              console.error('[WA] openChatByPhone', e);
            });
          }
        };
        if (initP && typeof initP.then === 'function') {
          initP.then(afterInit);
        } else {
          afterInit();
        }
      }
      startPoll();
    },

    refresh: function() {
      if (typeof WhatsAppChat === 'undefined') return;
      if (WhatsAppChat.refreshStatus) WhatsAppChat.refreshStatus().then(function() {
        if (WhatsAppChat.loadContacts) WhatsAppChat.loadContacts(false, true);
      });
    },

    connect: function() {
      if (typeof WhatsAppChat !== 'undefined') WhatsAppChat.connect && WhatsAppChat.connect();
    },

    toggleConnect: function() {
      if (_status === 'open') {
        if (confirm('Desconectar o WhatsApp? As conversas salvas serão mantidas.')) {
          if (typeof WhatsAppChat !== 'undefined') WhatsAppChat.disconnect && WhatsAppChat.disconnect();
        }
      } else {
        WA.openQrModal();
      }
    },

    resetWhatsApp: function() {
      if (!confirm('Reiniciar seu WhatsApp nesta conta?\n\nIsso desconecta, apaga as conversas salvas aqui e pede um novo QR Code. Use se apareceram conversas de outra pessoa.')) {
        return;
      }
      if (typeof WhatsAppChat === 'undefined' || !WhatsAppChat.resetSession) return;
      WhatsAppChat.resetSession(true).then(function() {
        WA.closeChat();
        syncFromChat();
        render();
        WA.openQrModal();
      }).catch(function(e) {
        console.error('[WA] resetWhatsApp', e);
      });
    },

    openQrModal: function() {
      syncFromChat();
      var modal = document.getElementById('waQrModal');
      if (modal) modal.classList.add('open');
      // Hide old connect screen behind modal
      var oldScreen = document.getElementById('waConnectScreen');
      if (oldScreen) oldScreen.style.display = 'none';
      // If we already have a QR, show it immediately
      if (_qr) {
        var box = document.getElementById('waQrBox');
        var img = document.getElementById('waQrImg');
        var simBtn = document.getElementById('waQrSimBtn');
        var genBtn = document.getElementById('waQrGenBtn');
        var st  = document.getElementById('waQrStatus');
        if (box) box.style.display = 'block';
        if (img) img.src = _qr;
        if (simBtn) simBtn.style.display = showQrSimButton() ? 'inline-flex' : 'none';
        if (genBtn) genBtn.style.display = 'none';
        if (st) st.textContent = 'Escaneie o QR Code com o WhatsApp do seu celular';
      } else {
        // Auto-generate QR immediately
        var box2 = document.getElementById('waQrBox');
        var st2  = document.getElementById('waQrStatus');
        var simBtn2 = document.getElementById('waQrSimBtn');
        var genBtn2 = document.getElementById('waQrGenBtn');
        if (box2) box2.style.display = 'none';
        if (simBtn2) simBtn2.style.display = 'none';
        if (genBtn2) genBtn2.style.display = 'inline-flex';
        if (st2) st2.textContent = 'Gerando QR Code...';
        var st0 = WhatsAppChat._getState && WhatsAppChat._getState();
        if (typeof WhatsAppChat !== 'undefined') {
          if (st0 && st0.status === 'connecting' && WhatsAppChat.refreshStatus) {
            WhatsAppChat.refreshStatus({ refreshQr: true }).then(function() {
              syncFromChat();
              if (_qr) {
                var box = document.getElementById('waQrBox');
                var img = document.getElementById('waQrImg');
                if (box) box.style.display = 'block';
                if (img) img.src = _qr;
                if (st2) st2.textContent = 'Escaneie o QR Code com o WhatsApp do seu celular';
              }
            });
          } else if (WhatsAppChat.connect) {
            WhatsAppChat.connect();
          }
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
      if (st) st.textContent = 'Gerando QR Code...';
      if (btn) btn.disabled = true;
      if (typeof WhatsAppChat !== 'undefined') WhatsAppChat.connect && WhatsAppChat.connect();
      setTimeout(function() { if (btn) btn.disabled = false; }, 4000);
    },

    simulateScan: function() {
      var btn = document.getElementById('waQrSimBtn');
      if (btn) btn.disabled = true;
      if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.simulateScan) {
        WhatsAppChat.simulateScan();
      }
    },

    openChat: openChatPanel,

    closeChat: function() {
      _activeId = null;
      if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat._kanbanClose) {
        WhatsAppChat._kanbanClose();
      }
      var panel = document.getElementById('waChatPanel');
      var board = document.getElementById('waBoard');
      if (panel) panel.classList.remove('open');
      if (board) board.classList.remove('wa-board--chat-open');
      render();
    },

    openNewChat: function() {
      var modal = document.getElementById('waNewChatModal');
      var phoneInput = document.getElementById('waNewChatPhone');
      var nameInput = document.getElementById('waNewChatName');
      if (phoneInput) phoneInput.value = '';
      if (nameInput) nameInput.value = '';
      if (modal) modal.classList.add('open');
      if (phoneInput) phoneInput.focus();
    },

    closeNewChatModal: function() {
      var modal = document.getElementById('waNewChatModal');
      if (modal) modal.classList.remove('open');
    },

    submitNewChat: function() {
      var phoneInput = document.getElementById('waNewChatPhone');
      var nameInput = document.getElementById('waNewChatName');
      var phone = phoneInput ? phoneInput.value.trim() : '';
      var name = nameInput ? nameInput.value.trim() : '';
      
      if (!phone) {
        if (typeof showToast === 'function') showToast('Digite um número de telefone válido', 'error');
        return;
      }
      
      WA.closeNewChatModal();
      if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.openChatByPhone) {
        WhatsAppChat.openChatByPhone(phone.replace(/\D/g,''), name);
      }
    },

    filterInbox: function(q) {
      _filterQ = q || '';
      renderInbox();
      if (isEffectivelyOpen()) renderKanban();
    },

    /* ── Drag ── */
    dragStart: function(ev, id) {
      ev.dataTransfer.setData('text/plain', id);
      ev.dataTransfer.effectAllowed = 'move';
    },
    dragEnter: function(ev) {
      ev.preventDefault();
      ev.currentTarget.classList.add('drag-over');
    },
    dragOver: function(ev) {
      ev.preventDefault();
      ev.currentTarget.classList.add('drag-over');
    },
    dragLeave: function(ev) { ev.currentTarget.classList.remove('drag-over'); },
    drop: function(ev, colId) {
      ev.preventDefault();
      ev.currentTarget.classList.remove('drag-over');
      var id = ev.dataTransfer.getData('text/plain');
      if (id) WA.moveCard(id, colId);
    },

    moveCard: function(chatId, colId) {
      var c = _chats.find(function(x){ return x.id === chatId; });
      if (c) c.kanban_stage = colId;
      renderKanban();
      renderInbox();
      if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.updateChatStage) {
        WhatsAppChat.updateChatStage(chatId, colId);
      }
    },

    /* ── Column modal ── */
    openAddColModal: function() {
      document.getElementById('waColModalTitle').textContent = 'Nova Coluna';
      document.getElementById('waColName').value = '';
      document.getElementById('waColEditId').value = '';
      _selColor = '#2f81f7';
      document.querySelectorAll('.wa-color-dot').forEach(function(el){
        el.classList.toggle('active', el.dataset.color === _selColor);
      });
      document.getElementById('waColModal').classList.add('open');
    },

    closeColModal: function() {
      document.getElementById('waColModal').classList.remove('open');
    },

    selectColor: function(el) {
      _selColor = el.dataset.color;
      document.querySelectorAll('.wa-color-dot').forEach(function(o){ o.classList.toggle('active', o === el); });
    },

    saveColumn: function() {
      var name = (document.getElementById('waColName').value || '').trim();
      if (!name) { alert('Informe o nome da coluna.'); return; }
      var cols = loadCols();
      var editId = document.getElementById('waColEditId').value;
      if (editId) {
        var col = cols.find(function(c){ return c.id === editId; });
        if (col) { col.name = name; col.color = _selColor; }
      } else {
        cols.push({ id: 'col_' + Date.now(), name: name, color: _selColor });
      }
      saveCols(cols);
      WA.closeColModal();
      render();
    },

    /* ── Context menu ── */
    openCtx: function(ev, colId) {
      _ctxColId = colId;
      var menu = document.getElementById('waCtxMenu');
      menu.style.left = Math.min(ev.clientX, window.innerWidth - 180) + 'px';
      menu.style.top  = ev.clientY + 6 + 'px';
      menu.classList.add('open');
      setTimeout(function(){
        document.addEventListener('click', function h(){ menu.classList.remove('open'); document.removeEventListener('click',h); });
      }, 60);
    },

    editColumnCtx: function() {
      if (!_ctxColId) return;
      var col = loadCols().find(function(c){ return c.id === _ctxColId; });
      if (!col) return;
      document.getElementById('waColModalTitle').textContent = 'Renomear Coluna';
      document.getElementById('waColName').value  = col.name;
      document.getElementById('waColEditId').value = col.id;
      _selColor = col.color || '#2f81f7';
      document.querySelectorAll('.wa-color-dot').forEach(function(el){
        el.classList.toggle('active', el.dataset.color === _selColor);
      });
      document.getElementById('waColModal').classList.add('open');
      document.getElementById('waCtxMenu').classList.remove('open');
    },

    deleteColumnCtx: function() {
      if (!_ctxColId) return;
      if (!confirm('Excluir esta coluna? Os contatos voltarão para "Novo Contato".')) return;
      var cols = loadCols().filter(function(c){ return c.id !== _ctxColId; });
      _chats.forEach(function(c){
        if (c.kanban_stage === _ctxColId) {
          c.kanban_stage = 'novo';
          if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.updateChatStage) {
            WhatsAppChat.updateChatStage(c.id, 'novo');
          }
        }
      });
      saveCols(cols);
      document.getElementById('waCtxMenu').classList.remove('open');
      render();
    },
  };

})();
