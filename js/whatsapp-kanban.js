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
    { id: 'novo',        name: 'Novo contato',    color: '#3b82f6' },
    { id: 'em_contato',  name: 'Em contato',      color: '#f59e0b' },
    { id: 'apresentacao',name: 'Apresentação',    color: '#8b5cf6' },
    { id: 'negociacao',  name: 'Negociação',      color: '#0ea5e9' },
    { id: 'ganho',       name: 'Ganho',           color: '#10b981' },
    { id: 'perdido',     name: 'Perdido',         color: '#ef4444' }
  ];

  /* ── State ── */
  var _session   = null;
  var _chats     = [];
  var _status    = 'close';
  var _phone     = null;
  var _qr        = null;
  var _inboxFilter = 'all';
  var _filterQ   = '';
  var _activeId  = null;
  var _ctxColId  = null;
  var _selColor  = '#2f81f7';
  var _profileAvatarBase64 = '';
  var _inboxProfilePic = '';
  var _inboxProfileName = '';
  var _inboxProfileLoading = false;
  var _qrPairing = false;
  var _qrShownInModal = false;
  var _qrDismissed = false;
  var _qrFetching = false;
  var _pendingQrUi = null;
  var _poll      = null;
  var _chatsFp   = '';
  var _activeTab = 'whatsapp';
  var _newChatStageId = '';
  var _sortField = 'date';
  var _sortOrder = 'desc';

  function syncFromChat() {
    if (typeof WhatsAppChat === 'undefined' || !WhatsAppChat._getState) return false;
    var st = WhatsAppChat._getState();
    var locked = !!(st.rebindRequired);
    var chats = locked ? [] : (st.chats || []);
    var fp = String(st.userId || '') + '|' + chats.map(function (c) {
      return String(c.id) + ':' + String(c.last_message_preview || '') + ':' + String(c.kanban_stage || '') + ':' + String(c.unread_count || 0) + ':' + String(c.deal_tags || '');
    }).join('|');
    var changed = st.status !== _status || st.qr !== _qr || st.phone !== _phone || fp !== _chatsFp || locked;
    _status = locked ? 'close' : st.status;
    _phone = st.phone || null;
    _chats = chats;
    _qr = locked ? null : (st.qr || null);
    if (!locked && st.profilePic) {
      _inboxProfilePic = st.profilePic;
    }
    if (!locked && st.profileName) {
      _inboxProfileName = st.profileName;
    }
    _chatsFp = fp;
    return changed;
  }

  var _emptyChatsPullStarted = false;

  function maybePullEmptyChats() {
    if (_emptyChatsPullStarted || !isEffectivelyOpen()) return;
    if ((_chats || []).length > 0) return;
    if (typeof WhatsAppChat === 'undefined' || !WhatsAppChat.pullChats) return;
    _emptyChatsPullStarted = true;
    WhatsAppChat.pullChats(true, true).then(function() {
      syncFromChat();
      render();
    }).catch(function() {
      _emptyChatsPullStarted = false;
    });
  }

  function onChatStateChanged() {
    var changed = syncFromChat();
    var modal = document.getElementById('waQrModal');
    var modalOpen = modal && modal.classList.contains('open');
    if (changed) {
      render();
      if (modalOpen && resolveQr()) {
        applyQrModalUi({ qr: _qr });
      } else if (_status === 'connecting' && _qr && !modalOpen && !_qrDismissed) {
        WA.openQrModal();
      }
      if (isEffectivelyOpen()) {
        refreshInboxProfilePic(false);
        maybePullEmptyChats();
      }
    } else {
      updateConnBar();
    }
  }

  /* ── Column storage ── */
  function colKey() { return 'wa_cols_v3_' + ((_session && _session.id) || 'x'); }
  function loadCols() {
    try {
      var r = localStorage.getItem(colKey());
      if (r) {
        var parsed = JSON.parse(r);
        if (parsed && Array.isArray(parsed) && parsed.length > 0) {
          if (parsed.length < 2) {
            return JSON.parse(JSON.stringify(DEFAULTS));
          }
          var defaultIds = DEFAULTS.map(function (d) { return d.id; });
          var hasCore = parsed.some(function (c) { return defaultIds.indexOf(c.id) >= 0; });
          if (!hasCore) {
            return JSON.parse(JSON.stringify(DEFAULTS));
          }
          return parsed;
        }
      }
    } catch (e) {}
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
  function _normStr(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function chatStage(c) {
    var raw = c.kanban_stage || 'novo';
    var legacy = {
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
  function filtered() {
    var q = _normStr(_filterQ);
    var res = _chats;
    if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.dedupeChatsByPhone) {
      res = WhatsAppChat.dedupeChatsByPhone(res);
    }
    if (_inboxFilter === 'unread') {
      res = res.filter(function(c) { return Number(c.unread_count) > 0; });
    }
    if (q) {
      res = res.filter(function(c){
        var label = _normStr(contactLabel(c));
        var phone = String(c.contact_phone||'').replace(/\D/g,'');
        var preview = _normStr(c.last_message_preview||'');
        return label.includes(q) || phone.includes(q) || preview.includes(q);
      });
    }
    return res.slice().sort(function(a, b) {
      var valA, valB;
      if (_sortField === 'name') {
        valA = contactLabel(a).toLowerCase();
        valB = contactLabel(b).toLowerCase();
      } else if (_sortField === 'value') {
        valA = Number(a.deal_value || 0);
        valB = Number(b.deal_value || 0);
      } else {
        valA = new Date(a.last_message_at || a.created_at || 0).getTime();
        valB = new Date(b.last_message_at || b.created_at || 0).getTime();
      }
      if (valA < valB) return _sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return _sortOrder === 'asc' ? 1 : -1;
      return 0;
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
  var TAG_COLORS = {
    urgente:'#b91c1c', urgent:'#b91c1c', alta:'#ea0038', high:'#ea0038',
    'média':'#f59e0b', media:'#f59e0b', medium:'#f59e0b',
    baixa:'#25d366', low:'#25d366',
    lead:'#2563eb', hot:'#dc2626', vip:'#9333ea', follow:'#d97706', closed:'#16a34a'
  };
  function tagColor(t) {
    if (typeof WATags !== 'undefined' && WATags.getColor) return WATags.getColor(t);
    return TAG_COLORS[String(t||'').toLowerCase()] || '#3b4a54';
  }
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
    // fallback local
    var name = String(c.contact_name || '').trim();
    if (name.length >= 3 && !/^\d{10,}$/.test(name.replace(/\D/g,''))) return name;
    var phone = String(c.contact_phone || '').replace(/\D/g,'');
    if (phone.length >= 10) {
      // Formata
      if (phone.length === 13 && phone.startsWith('55')) return '+55 (' + phone.slice(2,4) + ') ' + phone.slice(4,9) + '-' + phone.slice(9);
      if (phone.length === 11) return '(' + phone.slice(0,2) + ') ' + phone.slice(2,7) + '-' + phone.slice(7);
      return phone;
    }
    return c.id || 'Contato';
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

  function inboxTagsHtml(c) {
    if (typeof WATags !== 'undefined' && WATags.inboxHtml) {
      return WATags.inboxHtml(c.id, c.deal_tags || '');
    }
    var tags = parseTags(c.deal_tags);
    if (!tags.length) return '';
    var chips = tags.map(function(t) {
      return '<span class="wa-tag-chip" style="--tag-color:' + esc(tagColor(t)) + '">' + esc(t) + '</span>';
    }).join('');
    return '<div class="wa-contact__tags">' + chips + '</div>';
  }

  function renderInbox() {
    var el = document.getElementById('waInboxList');
    if (!el) return;
    var list = filtered();

    if (!isEffectivelyOpen() || !list.length) {
      el.innerHTML = '<div class="wa-inbox__empty"><strong>' +
        (!isEffectivelyOpen() ? 'WhatsApp desconectado' : 'Nenhuma conversa') +
        '</strong><p style="margin:8px 0 0;font-size:13px;color:#667781;">' +
        (!isEffectivelyOpen()
          ? 'Conecte o WhatsApp para ver suas conversas.'
          : 'Use os ícones acima para atualizar ou iniciar uma conversa.') +
        '</p></div>';
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
          '<div class="wa-contact__top-row">' +
            '<div class="wa-contact__name">' + esc(contactLabel(c)) + '</div>' +
            '<span class="wa-contact__time">' + fmtTime(c.last_message_at) + '</span>' +
          '</div>' +
          inboxTagsHtml(c) +
          '<div class="wa-contact__bottom-row">' +
            '<div class="wa-contact__preview">' + esc(previewLabel(c)) + '</div>' +
            (unread ? '<span class="wa-contact__badge">' + unread + '</span>' : '') +
          '</div>' +
        '</div>' +
        '</div>';
    }).join('');
    if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.bindLazyAvatars) {
      WhatsAppChat.bindLazyAvatars(el);
    }
  }

  /* ══════════════════════════════════════
     RENDER: KANBAN
  ══════════════════════════════════════ */
  function renderKanban() {
    var cols  = document.getElementById('waBoardCols');
    if (!cols) return;

    if (!isEffectivelyOpen()) {
      cols.innerHTML = '';
      return;
    }

    var list = filtered();
    var defs = loadCols();

    cols.innerHTML = defs.map(function(col) {
      var colChats = list.filter(function(c){ return chatStage(c) === col.id; });
      var count = colChats.length;

      var totalValueSum = colChats.reduce(function(sum, c) {
        return sum + Number(c.deal_value || 0);
      }, 0);
      var totalValueStr = totalValueSum.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

      var cards = colChats.map(function(c) {
        var active  = c.id === _activeId ? ' active' : '';
        var name = esc(contactLabel(c));
        var tags = parseTags(c.tags);

        var priority = 'Média';
        var priorityClass = 'priority-media';
        if (c.deal_tags) {
          var lowtags = c.deal_tags.toLowerCase();
          if (lowtags.includes('urgente') || lowtags.includes('urgent')) {
            priority = 'Urgente';
            priorityClass = 'priority-urgente';
          } else if (lowtags.includes('alta') || lowtags.includes('high')) {
            priority = 'Alta';
            priorityClass = 'priority-alta';
          } else if (lowtags.includes('baixa') || lowtags.includes('low')) {
            priority = 'Baixa';
            priorityClass = 'priority-baixa';
          } else if (lowtags.includes('média') || lowtags.includes('media') || lowtags.includes('medium')) {
            priority = 'Média';
            priorityClass = 'priority-media';
          }
        }

        var obs = esc(previewLabel(c) || 'Sem mensagens');
        var value = Number(c.deal_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        var initials = name.split(' ').map(function(n){return n[0];}).join('').slice(0, 2).toUpperCase() || 'C';

        var currentStage = chatStage(c);
        var stageOpts = defs.map(function(co){
          return '<option value="' + esc(co.id) + '"' + (co.id === currentStage ? ' selected' : '') + '>' + esc(co.name) + '</option>';
        }).join('');

        return '<div class="wa-kcard' + active + '" draggable="true"' +
          ' ondragstart="WA.dragStart(event,\'' + esc(c.id) + '\')"' +
          ' onclick="WA.openChat(\'' + esc(c.id) + '\')">' +

          '<div class="wa-kcard__hover-actions" onclick="event.stopPropagation()">' +
            '<button type="button" class="wa-kcard__action-btn" title="Definir Valor (R$)" onclick="WhatsAppCRM.editDealValue(\'' + esc(c.id) + '\', \'' + (c.deal_value||'') + '\')">💰</button>' +
            '<button type="button" class="wa-kcard__action-btn" title="Agendar Retorno" onclick="WhatsAppCRM.editNextAction(\'' + esc(c.id) + '\', \'' + esc(c.next_action_at||'') + '\')">📅</button>' +
            '<select class="wa-kcard__stage" onchange="WA.moveCard(\'' + esc(c.id) + '\',this.value)">' + stageOpts + '</select>' +
          '</div>' +

          '<div class="wa-kcard__grid">' +
            '<div class="wa-kcard__grid-item">' +
              '<span class="wa-kcard__grid-label">Contato</span>' +
              '<span class="wa-kcard__grid-val">' + name + '</span>' +
            '</div>' +
            '<div class="wa-kcard__grid-item">' +
              '<span class="wa-kcard__grid-label">Prioridade</span>' +
              '<span class="wa-kcard__grid-val ' + priorityClass + '">' + priority + '</span>' +
            '</div>' +
          '</div>' +

          '<div class="wa-kcard__obs">' +
            '<span class="wa-kcard__obs-label">Observação</span>' +
            '<span class="wa-kcard__obs-val">' + obs + '</span>' +
          '</div>' +

          '<div class="wa-kcard__footer">' +
            '<span class="wa-kcard__value">R$ ' + value + '</span>' +
            '<div class="wa-kcard__avatar-badge">' + initials + '</div>' +
          '</div>' +

          '</div>';
      }).join('');

      var empty = !colChats.length
        ? '<div class="wa-col-empty">' + ICO.empty +
          '<p>Arraste contatos ou adicione novos registros</p></div>'
        : '';

      return '<div class="wa-kanban-col-wrapper" style="background: #f3f4f6; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; min-width: 300px;">' +
        '<div class="wa-kanban-col-header" style="padding: 0; margin-bottom: 12px;">' +
          '<div class="wa-kanban-col-header__top" style="display: flex; justify-content: space-between; align-items: flex-start;">' +
            '<div class="wa-kanban-col-header__title-group" style="display:flex; align-items:center; gap:8px;">' +
              '<span class="wa-kanban-col-header__title" style="font-size: 14px; font-weight: 700; color: #334155;">' + esc(col.name) + '</span>' +
              '<span class="wa-kanban-col-header__count" style="background: #a8aebb; color: #fff; padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;">' + count + '</span>' +
            '</div>' +
            '<div style="display:flex; align-items:center; gap: 4px;">' +
              '<button class="wa-kanban-col-header__add" onclick="WA.openNewChat(\'' + esc(col.id) + '\')" title="Adicionar contato nesta etapa" style="background: #fff; border: none; border-radius: 50%; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-right: 4px;">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f26e03" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
              '</button>' +
              '<button class="wa-col-tab__more" onclick="event.stopPropagation();WA.openCtx(event,\'' + esc(col.id) + '\')" title="Opções" style="background:none; border:none; color:#64748b; cursor:pointer;">' + ICO.dots + '</button>' +
            '</div>' +
          '</div>' +
          '<div class="wa-kanban-col-header__value" style="font-size: 13px; color: #64748b; margin-top: 4px; font-weight: 500;">R$ ' + totalValueStr + '</div>' +
        '</div>' +
        
        '<div class="wa-col-body" data-col="' + esc(col.id) + '" style="flex: 1;"' +
          ' ondrop="WA.drop(event,\'' + esc(col.id) + '\')"' +
          ' ondragenter="WA.dragEnter(event)"' +
          ' ondragover="WA.dragOver(event)"' +
          ' ondragleave="WA.dragLeave(event)">' +
          cards + empty +
        '</div>' +
        
        '<button class="wa-kanban-col-add-btn" onclick="WA.openNewChat(\'' + esc(col.id) + '\')" style="background: transparent; border: 1px dashed #c0c5ce; border-radius: 8px; color: #a3aab5; font-weight: 700; font-size: 13px; padding: 12px; margin-top: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; cursor: pointer;">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>' +
          'ADICIONAR' +
        '</button>' +
        
        '</div>';
    }).join('') +
    '<div class="wa-kanban-col-wrapper" style="background: transparent; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; min-width: 300px; opacity: 0.8;">' +
      '<button class="wa-kanban-col-add-btn" onclick="WA.openAddColModal()" style="background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 8px; color: #64748b; font-weight: 600; font-size: 14px; padding: 24px; width: 100%; height: 100px; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; transition: all 0.2s;">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
        'Adicionar coluna' +
      '</button>' +
    '</div>';
    if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.bindLazyAvatars) {
      WhatsAppChat.bindLazyAvatars(cols);
    }
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
    renderKanban();
  }

  /* ══════════════════════════════════════
     CONNECTION BAR
  ══════════════════════════════════════ */
  function evolutionConfigured() {
    if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat._getState) {
      var cfg = WhatsAppChat._getState().configured;
      // null = ainda carregando config — não tratar como "não configurado"
      if (cfg === null || cfg === undefined) return true;
      return !!cfg;
    }
    return true;
  }

  function showQrSimButton() {
    // Só mostra "Simular" quando o servidor confirmou configured=false.
    if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat._getState) {
      return WhatsAppChat._getState().configured === false;
    }
    return false;
  }

  var _qrTimerInterval = null;
  function startQrTimer(duration) {
    if (_qrTimerInterval) clearInterval(_qrTimerInterval);
    var startTime = Date.now();
    var progress = document.getElementById('waQrProgress');
    var progressFill = document.getElementById('waQrProgressFill');
    var timerSec = document.getElementById('waQrTimerSec');
    
    if (progress) progress.style.display = 'block';
    
    function tick() {
      var elapsed = Math.floor((Date.now() - startTime) / 1000);
      var remaining = Math.max(0, duration - elapsed);
      if (timerSec) timerSec.textContent = remaining + 's';
      
      var percentage = Math.min(100, Math.max(0, (remaining / duration) * 100));
      if (progressFill) progressFill.style.width = percentage + '%';
      
      if (remaining <= 0) {
        clearInterval(_qrTimerInterval);
        _qrTimerInterval = null;
      }
    }
    tick();
    _qrTimerInterval = setInterval(tick, 1000);
  }

  function resolveQr(explicit) {
    syncFromChat();
    if (explicit) {
      _qr = explicit;
      return explicit;
    }
    if (_qr) return _qr;
    if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat._getState) {
      var q = WhatsAppChat._getState().qr;
      if (q) {
        _qr = q;
        return q;
      }
    }
    return null;
  }

  function isQrFetchInFlight() {
    if (_qrFetching) return true;
    if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat._getState) {
      return !!WhatsAppChat._getState().connecting;
    }
    return false;
  }

  function absorbQr(data) {
    if (data && data.qr) {
      _qr = data.qr;
      return data.qr;
    }
    syncFromChat();
    return resolveQr();
  }

  function requestQrForModal(force, opts) {
    opts = opts || {};
    var finish = function(finishOpts) {
      _qrFetching = false;
      var modal = document.getElementById('waQrModal');
      if (!modal || !modal.classList.contains('open')) {
        _pendingQrUi = finishOpts || {};
      } else {
        _pendingQrUi = null;
        applyQrModalUi(finishOpts || {});
        updateConnBar();
      }
    };
    if (_qrFetching && !force) return;
    if (typeof hideLoading === 'function') hideLoading();
    _qrFetching = true;
    applyQrModalUi({ loading: true });
    if (typeof WhatsAppChat === 'undefined') {
      _qrFetching = false;
      applyQrModalUi({ error: 'Serviço de conexão indisponível.' });
      return;
    }
    var run = WhatsAppChat.fetchQrForModal
      ? WhatsAppChat.fetchQrForModal(!!force, opts)
      : (WhatsAppChat.connect ? WhatsAppChat.connect({ force: true, silent: true }) : Promise.resolve({ ok: false }));
    run.then(function(res) {
      syncFromChat();
      if (res && res.alreadyConnected) {
        finish({});
        WA.closeQrModal();
        if (typeof showToast === 'function') showToast('WhatsApp já conectado. Carregando conversas…', 'success');
        return;
      }
      var qr = (res && res.qr) ? res.qr : absorbQr(res);
      if (qr) {
        _qr = qr;
        finish({ qr: qr });
        return;
      }
      if (res && !res.ok) {
        finish({ error: res.error || 'Não foi possível gerar o QR Code.' });
        return;
      }
      finish({ error: 'QR não retornou. Verifique sua internet e clique em Recarregar QR Code.' });
    }).catch(function(e) {
      finish({ error: (e && e.message) || 'Erro ao gerar QR Code.' });
    });
  }

  function applyQrModalUi(opts) {
    opts = opts || {};
    var modal = document.getElementById('waQrModal');
    var modalOpen = !!(modal && modal.classList.contains('open'));
    if (!modalOpen) {
      _pendingQrUi = opts;
      return;
    }
    _pendingQrUi = null;
    var st = document.getElementById('waQrStatus');
    var box = document.getElementById('waQrBox');
    var img = document.getElementById('waQrImg');
    var genBtn = document.getElementById('waQrGenBtn');
    var simBtn = document.getElementById('waQrSimBtn');
    var progress = document.getElementById('waQrProgress');
    var timerSec = document.getElementById('waQrTimerSec');
    var qr = resolveQr(opts.qr);
    var uiBranch = 'idle';
    if (opts.error) uiBranch = 'error';
    else if (qr) uiBranch = 'qr';
    else if (opts.loading || (_qrFetching && !qr) || (_status === 'connecting' && !qr && !opts.error && (isQrFetchInFlight() || _qrFetching))) uiBranch = 'loading';

    if (!evolutionConfigured()) {
      if (st) {
        st.textContent = 'WhatsApp não configurado no servidor. Peça ao administrador para configurar a Evolution API.';
        st.classList.add('is-error');
      }
      if (box) box.style.display = 'none';
      if (progress) progress.style.display = 'none';
      if (timerSec) timerSec.textContent = '';
      if (genBtn) { genBtn.style.display = 'none'; genBtn.disabled = false; }
      if (simBtn) simBtn.style.display = showQrSimButton() ? 'inline-flex' : 'none';
      return;
    }

    if (opts.error) {
      if (st) {
        st.textContent = opts.error;
        st.classList.add('is-error');
      }
      if (box) box.style.display = 'none';
      if (progress) progress.style.display = 'none';
      if (timerSec) timerSec.textContent = '';
      if (genBtn) { genBtn.style.display = 'inline-flex'; genBtn.disabled = false; }
      if (simBtn) simBtn.style.display = 'none';
      return;
    }

    if (qr) {
      if (box) box.style.display = 'block';
      if (img) {
        var nextSrc = qr;
        if (img.getAttribute('data-qr-src') !== nextSrc) {
          img.setAttribute('data-qr-src', nextSrc);
          img.src = nextSrc;
          startQrTimer(60);
        }
      }
      _qrShownInModal = true;
      if (genBtn) {
        genBtn.style.display = 'inline-flex';
        genBtn.disabled = false;
        genBtn.textContent = 'Recarregar QR Code';
      }
      if (simBtn) simBtn.style.display = showQrSimButton() ? 'inline-flex' : 'none';
      if (st) {
        st.textContent = 'Escaneie o QR Code com o WhatsApp do seu celular';
        st.classList.remove('is-error');
      }
      return;
    }

    if (opts.loading || (_qrFetching && !qr) || (_status === 'connecting' && !qr && !opts.error && (isQrFetchInFlight() || _qrFetching))) {
      if (st) {
        st.innerHTML = '<span class="wa-qr-spinner"></span> Gerando QR Code… pode levar até 2 minutos.';
        st.classList.remove('is-error');
      }
      if (box) box.style.display = 'none';
      if (progress) progress.style.display = 'none';
      if (timerSec) timerSec.textContent = '';
      if (genBtn) {
        genBtn.style.display = 'inline-flex';
        genBtn.disabled = false;
        genBtn.textContent = 'Recarregar QR Code';
      }
      if (simBtn) simBtn.style.display = 'none';
      return;
    }

    if (st) {
      st.textContent = 'Clique em "Recarregar QR Code" para começar';
      st.classList.remove('is-error');
    }
    if (box) box.style.display = 'none';
    if (progress) progress.style.display = 'none';
    if (timerSec) timerSec.textContent = '';
    if (genBtn) {
      genBtn.style.display = 'inline-flex';
      genBtn.disabled = false;
      genBtn.textContent = 'Recarregar QR Code';
    }
    if (simBtn) simBtn.style.display = 'none';
  }

  function _rebindRequired() {
    if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat._getState) {
      return !!WhatsAppChat._getState().rebindRequired;
    }
    return false;
  }

  function inboxAvatarInitials() {
    var name = _inboxProfileName
      || (typeof WhatsAppChat !== 'undefined' && WhatsAppChat._getState ? (WhatsAppChat._getState().profileName || '') : '')
      || ((_session && _session.name) ? String(_session.name) : 'US');
    return name.split(' ').map(function(n) { return n[0] || ''; }).join('').slice(0, 2).toUpperCase() || 'US';
  }

  function setInboxAvatarImage(url) {
    var img = document.getElementById('waInboxAvatarImg');
    var fb = document.getElementById('waInboxAvatarFallback');
    if (!img || !fb) return;
    if (url) {
      img.onerror = function() {
        img.removeAttribute('src');
        img.hidden = true;
        fb.style.display = '';
        fb.textContent = inboxAvatarInitials();
      };
      img.src = url;
      img.hidden = false;
      fb.style.display = 'none';
    } else {
      img.onerror = null;
      img.removeAttribute('src');
      img.hidden = true;
      fb.style.display = '';
      fb.textContent = inboxAvatarInitials();
    }
  }

  function refreshInboxProfilePic(force) {
    // Preferir sessão “efetivamente aberta”; se status=open com chats, ainda tenta (evita ficar só com iniciais).
    var openEnough = isEffectivelyOpen() || (_status === 'open' && !_rebindRequired());
    if (!openEnough) {
      _inboxProfilePic = '';
      _inboxProfileName = '';
      setInboxAvatarImage('');
      return;
    }
    if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat._getState) {
      var st = WhatsAppChat._getState();
      if (st.profileName) _inboxProfileName = st.profileName;
      if (st.profilePic) {
        _inboxProfilePic = st.profilePic;
        setInboxAvatarImage(st.profilePic);
        updateInboxAvatarTitle();
        if (!force) return;
      }
    }
    if (_inboxProfilePic && !force) {
      setInboxAvatarImage(_inboxProfilePic);
      updateInboxAvatarTitle();
      return;
    }
    if (_inboxProfileLoading || typeof WhatsAppChat === 'undefined') return;
    var loadFn = WhatsAppChat.loadOwnProfile || WhatsAppChat.fetchProfile;
    if (!loadFn) return;
    _inboxProfileLoading = true;
    var p = WhatsAppChat.loadOwnProfile ? WhatsAppChat.loadOwnProfile(!!force) : WhatsAppChat.fetchProfile();
    Promise.resolve(p).then(function(res) {
      var prof = res && res.profile ? res.profile : res;
      var pic = prof ? (prof.pictureUrl || '') : '';
      var name = prof ? (prof.name || '') : '';
      if (name) _inboxProfileName = name;
      if (pic) {
        _inboxProfilePic = pic;
        setInboxAvatarImage(pic);
      }
      updateInboxAvatarTitle();
    }).catch(function() { /* noop */ }).finally(function() {
      _inboxProfileLoading = false;
    });
  }

  function updateInboxAvatarTitle() {
    var btn = document.querySelector('.wa-inbox__avatar-btn');
    if (!btn) return;
    var label = _inboxProfileName || ((_session && _session.name) ? String(_session.name) : 'Perfil WhatsApp');
    btn.title = label + ' — Perfil e conexão WhatsApp';
  }

  function updateInboxAvatar() {
    var statusEl = document.getElementById('waInboxAvatarStatus');
    var fb = document.getElementById('waInboxAvatarFallback');
    if (fb && !_inboxProfilePic) fb.textContent = inboxAvatarInitials();
    if (statusEl) {
      statusEl.classList.remove('is-live', 'is-connecting');
      if (isUiConnected()) statusEl.classList.add('is-live');
      else if (_status === 'connecting' || _qrPairing) statusEl.classList.add('is-connecting');
    }
    if (isUiConnected() || (_status === 'open' && !_rebindRequired())) refreshInboxProfilePic(false);
    else setInboxAvatarImage('');
    updateInboxAvatarTitle();
  }

  function isEffectivelyOpen() {
    if (typeof WhatsAppChat !== 'undefined' && typeof WhatsAppChat.isEffectivelyOpen === 'function') {
      return WhatsAppChat.isEffectivelyOpen();
    }
    return _status === 'open' && !_rebindRequired();
  }

  function isUiConnected() {
    if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat._getState) {
      var st = WhatsAppChat._getState();
      return st.status === 'open' && !!st.sessionLive;
    }
    return isEffectivelyOpen();
  }

  function updateConnBar() {
    var dropdownConnect = document.getElementById('waSidebarDropdownConnect');
    var dropdownStatus = document.getElementById('waSidebarDropdownStatus');
    
    var phone = _phone;
    var fmt = (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.fmtPhone) ? WhatsAppChat.fmtPhone : null;
    var phoneFormatted = phone && fmt ? fmt(phone) : phone;

    var isConnected = isUiConnected();
    // #region agent log
    if (typeof window._dbgSessionLog === 'function') {
      var stDbg = (typeof WhatsAppChat !== 'undefined' && WhatsAppChat._getState) ? WhatsAppChat._getState() : {};
      window._dbgSessionLog('whatsapp-kanban.js:updateConnBar', 'conn UI decision', {
        isConnected: isConnected,
        uiStatusText: isConnected ? 'Conectado' : (_status === 'connecting' ? 'Conectando' : 'Desconectado'),
        localStatus: _status,
        chatStatus: stDbg.status || null,
        sessionLive: !!stDbg.sessionLive,
        rebind: !!stDbg.rebindRequired,
        hasPhone: !!phone,
        openEnoughAvatar: !!(isEffectivelyOpen() || (_status === 'open' && !_rebindRequired())),
      }, 'H-D-ui');
    }
    // #endregion
    
    if (dropdownStatus) {
      if (isConnected) {
        dropdownStatus.textContent = 'Status: Conectado' + (phoneFormatted ? ' (' + phoneFormatted + ')' : '');
        dropdownStatus.style.color = '#25d366';
      } else if (_status === 'connecting') {
        dropdownStatus.textContent = 'Status: Conectando...';
        dropdownStatus.style.color = '#f59e0b';
      } else {
        dropdownStatus.textContent = 'Status: Desconectado';
        dropdownStatus.style.color = '#ea0038';
      }
    }
    
    if (dropdownConnect) {
      dropdownConnect.textContent = isConnected ? 'Desconectar WhatsApp' : 'Conectar WhatsApp';
    }

    updateInboxAvatar();

    var dot   = document.getElementById('waConnDot');
    var label = document.getElementById('waConnLabel');
    var btn   = document.getElementById('waConnBtn');
    var btnLbl = document.getElementById('waConnBtnLabel');

    if (dot) {
      if (isConnected) {
        dot.className   = 'wa-conn-dot connected';
        if (label) label.textContent = phoneFormatted ? ('Conectado: ' + phoneFormatted) : 'Conectado';
        if (btnLbl) btnLbl.textContent = 'Desconectar';
        if (btn) btn.classList.add('is-connected');
      } else {
        dot.className   = (_status === 'connecting' || _qrPairing) ? 'wa-conn-dot connecting' : 'wa-conn-dot';
        if (label) {
          label.textContent = (_status === 'connecting' || _qrPairing)
            ? 'Aguardando leitura do QR Code...'
            : 'Desconectado';
        }
        if (btnLbl) {
          btnLbl.textContent = (_status === 'connecting' || _qrPairing)
            ? 'Ver QR Code'
            : 'Conectar WhatsApp';
        }
        if (btn) btn.classList.remove('is-connected');
      }
    }

    if ((_status === 'connecting' || _qrPairing) && !_qrDismissed) {
      var qrModal = document.getElementById('waQrModal');
      if (qrModal && !qrModal.classList.contains('open')) {
        WA.openQrModal();
      }
    }

    // Update QR modal if open
    var modal = document.getElementById('waQrModal');
    if (modal && modal.classList.contains('open')) {
      syncFromChat();
      var stLive = false;
      var stStatus = _status;
      if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat._getState) {
        var stChat = WhatsAppChat._getState();
        stLive = !!stChat.sessionLive;
        stStatus = stChat.status || stStatus;
      }
      // Fecha mesmo durante _qrPairing — era o bug que mantinha o QR após escanear.
      if ((stStatus === 'open' || _status === 'open') && !_rebindRequired() && stLive) {
        var stOpen = document.getElementById('waQrStatus');
        if (stOpen) stOpen.textContent = 'WhatsApp conectado com sucesso!';
        _qrPairing = false;
        _qrShownInModal = false;
        WA.closeQrModal();
        return;
      }
      var err = (typeof WhatsAppChat !== 'undefined' && WhatsAppChat._getState)
        ? (WhatsAppChat._getState().connectError || '')
        : '';
      var qrNow = resolveQr();
      if (qrNow) {
        applyQrModalUi({ qr: qrNow });
      } else if (err) {
        applyQrModalUi({ error: err });
      } else if ((_qrFetching || isQrFetchInFlight()) && !resolveQr()) {
        applyQrModalUi({ loading: true });
      }
    }
  }

  function clearBoardChatOverlay() {
    var board = document.getElementById('waBoard');
    if (board) board.classList.remove('wa-board--chat-open');
  }

  /* ══════════════════════════════════════
     CHAT PANEL
  ══════════════════════════════════════ */
  function openChatPanel(chatId) {
    _activeId = chatId;
    WA.switchTab('whatsapp');
    var panel = document.getElementById('waChatPanel');
    if (panel) panel.classList.add('open');
    clearBoardChatOverlay();
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
    }, 5000);
  }

  window.addEventListener('wa:state-changed', onChatStateChanged);

  /* ══════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════ */
  window.WA = {

    boot: function(session) {
      _session = session;
      if (_session) {
        var name = _session.name || 'Usuário';
        var usernameEl = document.getElementById('waSidebarUsername');
        var avatarEl = document.getElementById('waSidebarAvatar');
        if (usernameEl) usernameEl.textContent = name;
        if (avatarEl) {
          var initialsStr = name.split(' ').map(function(n){return n[0];}).join('').slice(0, 2).toUpperCase();
          avatarEl.textContent = initialsStr || 'US';
        }
      }
      render();
      if (typeof WhatsAppChat !== 'undefined') {
        var initP = WhatsAppChat.init && WhatsAppChat.init();
        var afterInit = function() {
          WhatsAppChat.initKanbanMode && WhatsAppChat.initKanbanMode();
          syncFromChat();
          render();
          var stBoot = (typeof WhatsAppChat !== 'undefined' && WhatsAppChat._getState) ? WhatsAppChat._getState() : {};
          if (!stBoot.sessionLive || !isEffectivelyOpen()) {
            WA.openQrModal();
          } else {
            maybePullEmptyChats();
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
      var searchInput = document.getElementById('waSearchInput');
      if (searchInput && searchInput.dataset.waBound !== '1') {
        searchInput.dataset.waBound = '1';
        searchInput.addEventListener('keydown', function(ev) {
          if (ev.key !== 'Enter') return;
          ev.preventDefault();
          if (WA.tryOpenChatFromSearch(searchInput.value)) return;
        });
      }
      startPoll();
    },

    refresh: function() {
      if (typeof WhatsAppChat === 'undefined') return;
      if (typeof showLoading === 'function') showLoading('Sincronizando conversas...');
      var done = function() {
        syncFromChat();
        render();
        if (typeof hideLoading === 'function') hideLoading();
        if (typeof showToast === 'function') {
          var n = (_chats || []).length;
          showToast(n ? (n + ' conversa(s) carregada(s).') : 'Nenhuma conversa encontrada. Use + para iniciar com um número.', n ? 'success' : 'info');
        }
      };
      var chain = WhatsAppChat.refreshStatus
        ? WhatsAppChat.refreshStatus({ skipQr: true })
        : Promise.resolve();
      chain.then(function() {
        if (WhatsAppChat.loadContacts) return WhatsAppChat.loadContacts(true, true);
        if (WhatsAppChat.pullChats) return WhatsAppChat.pullChats(false, true);
      }).then(done).catch(function(e) {
        console.error('[WA.refresh]', e);
        if (typeof hideLoading === 'function') hideLoading();
        if (typeof showToast === 'function') showToast(e.message || 'Erro ao atualizar.', 'error');
      });
    },

    connect: function() {
      if (typeof WhatsAppChat !== 'undefined') WhatsAppChat.connect && WhatsAppChat.connect();
    },

    toggleConnect: function() {
      if (isUiConnected()) {
        if (confirm('Desconectar o WhatsApp?\n\nAs conversas desta sessão serão apagadas do painel.')) {
          if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.disconnect) {
            WhatsAppChat.disconnect().then(function() {
              syncFromChat();
              render();
              _qrDismissed = false;
              WA.openQrModal();
            });
          }
        }
      } else {
        _qrDismissed = false;
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
        requestQrForModal(true, { freshReset: true });
      }).catch(function(e) {
        console.error('[WA] resetWhatsApp', e);
      });
    },

    openQrModal: function() {
      if (typeof hideLoading === 'function') hideLoading();
      _qrPairing = true;
      _qrShownInModal = false;
      _qrDismissed = false;
      _pendingQrUi = null;
      syncFromChat();
      var modal = document.getElementById('waQrModal');
      if (modal) modal.classList.add('open');

      var phoneEl = document.getElementById('waQrModalPhone');
      if (phoneEl) {
        phoneEl.textContent = _phone || 'sou+blu';
      }

      var oldScreen = document.getElementById('waConnectScreen');
      if (oldScreen) oldScreen.style.display = 'none';

      applyQrModalUi({ loading: true });
      if (resolveQr() && _status === 'connecting') {
        applyQrModalUi({ qr: _qr });
      } else {
        requestQrForModal(true, {});
      }
      if (_pendingQrUi) {
        applyQrModalUi(_pendingQrUi);
        _pendingQrUi = null;
      }
    },

    closeQrModal: function() {
      _qrPairing = false;
      _qrShownInModal = false;
      _qrDismissed = true;
      var modal = document.getElementById('waQrModal');
      if (modal) modal.classList.remove('open');
      if (_qrTimerInterval) {
        clearInterval(_qrTimerInterval);
        _qrTimerInterval = null;
      }
    },

    generateQr: function() {
      requestQrForModal(true);
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
      if (panel) panel.classList.remove('open');
      clearBoardChatOverlay();
      render();
    },

    _saveDealPriority: function(chatId, priority) {
      if (!chatId || !priority) return;
      var api = (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.config && WhatsAppChat.config.api) || 'api/whatsapp_api.php';
      var formData = new FormData();
      formData.append('action', 'update_deal_info');
      formData.append('chat_id', chatId);
      formData.append('deal_tags', priority);
      fetch(api, { method: 'POST', body: formData })
        .then(function(r) { return r.json(); })
        .then(function(json) {
          if (json.ok) {
            syncFromChat();
            render();
          }
        })
        .catch(function() {});
    },

    openNewChat: function(stageId) {
      _newChatStageId = stageId || '';
      var modal = document.getElementById('waNewChatModal');
      var phoneInput = document.getElementById('waNewChatPhone');
      var nameInput = document.getElementById('waNewChatName');
      var priorityInput = document.getElementById('waNewChatPriority');
      if (phoneInput) phoneInput.value = '';
      if (nameInput) nameInput.value = '';
      if (priorityInput) priorityInput.value = 'Média';
      if (modal) modal.classList.add('open');
      if (phoneInput) phoneInput.focus();
    },

    closeNewChatModal: function() {
      var modal = document.getElementById('waNewChatModal');
      if (modal) modal.classList.remove('open');
    },

    submitNewChat: function() {
      if (!isEffectivelyOpen()) {
        if (typeof showToast === 'function') showToast('Conecte o WhatsApp antes de iniciar uma conversa.', 'warning');
        WA.openQrModal();
        return;
      }
      var phoneInput = document.getElementById('waNewChatPhone');
      var nameInput = document.getElementById('waNewChatName');
      var msgInput = document.getElementById('waNewChatFirstMsg');
      var priorityInput = document.getElementById('waNewChatPriority');
      var rawPhone = phoneInput ? phoneInput.value.trim() : '';
      var name = nameInput ? nameInput.value.trim() : '';
      var firstMsg = msgInput ? msgInput.value.trim() : '';
      var priority = priorityInput ? priorityInput.value.trim() : '';

      if (!rawPhone) {
        if (typeof showToast === 'function') showToast('Digite o telefone com DDD.', 'error');
        return;
      }

      var digits = rawPhone.replace(/\D/g, '');
      if (digits.length === 10 || digits.length === 11) {
        digits = '55' + digits;
      }
      if (digits.length < 12) {
        if (typeof showToast === 'function') showToast('Telefone inválido. Digite o número completo com DDD.', 'error');
        return;
      }

      WA.closeNewChatModal();
      if (typeof showLoading === 'function') showLoading('Abrindo conversa...');
      if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.openChatByPhone) {
        WhatsAppChat.openChatByPhone(digits, name, firstMsg).then(function() {
          if (phoneInput) phoneInput.value = '';
          if (nameInput) nameInput.value = '';
          if (msgInput) msgInput.value = '';
          syncFromChat();
          render();
          if (_newChatStageId && typeof WhatsAppChat.updateChatStage === 'function') {
            setTimeout(function() {
              var list = (WhatsAppChat._getState && WhatsAppChat._getState().chats) || [];
              var createdChat = list.find(function(ch) {
                var cleanChPhone = String(ch.contact_phone || '').replace(/\D/g, '');
                return cleanChPhone.includes(digits) || digits.includes(cleanChPhone);
              });
              if (createdChat) {
                WhatsAppChat.updateChatStage(createdChat.id, _newChatStageId);
                if (priority) WA._saveDealPriority(createdChat.id, priority);
                WA.switchTab('kanban');
              }
            }, 800);
          } else if (priority) {
            setTimeout(function() {
              var list = (WhatsAppChat._getState && WhatsAppChat._getState().chats) || [];
              var createdChat = list.find(function(ch) {
                var cleanChPhone = String(ch.contact_phone || '').replace(/\D/g, '');
                return cleanChPhone.includes(digits) || digits.includes(cleanChPhone);
              });
              if (createdChat) WA._saveDealPriority(createdChat.id, priority);
            }, 800);
          }
          if (typeof showToast === 'function') showToast(firstMsg ? 'Conversa iniciada e mensagem enviada.' : 'Conversa aberta. Digite sua mensagem.', 'success');
        }).catch(function(e) {
          if (typeof showToast === 'function') showToast(e.message || 'Erro ao abrir conversa.', 'error');
        }).finally(function() {
          if (typeof hideLoading === 'function') hideLoading();
        });
      } else if (typeof hideLoading === 'function') hideLoading();
    },

    search: function(q) {
      _filterQ = _normStr(q || '');
      renderInbox();
      if (isEffectivelyOpen()) renderKanban();
    },

    filterInbox: function(q) {
      WA.search(q);
    },

    setInboxFilter: function(mode, btn) {
      _inboxFilter = (mode === 'unread') ? 'unread' : 'all';
      var wrap = document.getElementById('waInboxFilters');
      if (wrap) {
        wrap.querySelectorAll('.wa-filter-pill').forEach(function(p) {
          p.classList.toggle('active', p === btn || p.getAttribute('data-filter') === _inboxFilter);
        });
      }
      renderInbox();
    },

    openChatFunnel: function() {
      WA.switchTab('kanban');
    },

    tryOpenChatFromSearch: function(raw) {
      var q = String(raw || '').trim();
      var digits = q.replace(/\D/g, '');
      if (digits.length < 10) return false;
      if (!isEffectivelyOpen()) {
        if (typeof showToast === 'function') showToast('Conecte o WhatsApp antes de iniciar uma conversa.', 'warning');
        WA.openQrModal();
        return true;
      }
      if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
      if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.openChatByPhone) {
        WhatsAppChat.openChatByPhone(digits, '', '').then(function() {
          syncFromChat();
          render();
        }).catch(function(e) {
          if (typeof showToast === 'function') showToast(e.message || 'Erro ao abrir conversa.', 'error');
        });
      }
      return true;
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
      if (typeof WhatsAppChat !== 'undefined' && WhatsAppChat.updateChatStage) {
        WhatsAppChat.updateChatStage(chatId, colId);
      }
    },

    openSimpleContactModal: function() {
      var modal = document.getElementById('waSimpleContactModal');
      if (modal) modal.style.display = 'flex';
    },

    closeSimpleContactModal: function() {
      var modal = document.getElementById('waSimpleContactModal');
      if (modal) modal.style.display = 'none';
    },

    toggleKanbanFilter: function() {
      var popover = document.getElementById('waKanbanFilterPopover');
      if (popover) {
        if (popover.style.display === 'none' || popover.style.display === '') {
          popover.style.display = 'block';
        } else {
          popover.style.display = 'none';
        }
      }
    },

    addKanbanFilterRow: function(btn) {
      // Find an existing filter row to clone, or use a default HTML structure
      var allRows = btn.parentElement.querySelectorAll('div[style*="display: flex"]');
      var row = null;
      for (var i = 0; i < allRows.length; i++) {
        if (allRows[i].querySelector('select')) {
          row = allRows[i];
          break;
        }
      }
      
      var buscarContainer = btn.parentElement.lastElementChild;

      if (row) {
        var clone = row.cloneNode(true);
        btn.parentElement.insertBefore(clone, buscarContainer);
      } else {
        // Fallback if all rows were deleted
        var div = document.createElement('div');
        div.style = 'display: flex; align-items: center; gap: 8px; margin-bottom: 12px;';
        div.innerHTML = `
          <select style="flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; color: #334155; font-size: 14px; outline: none; cursor: pointer;">
            <option selected>Status</option>
            <option>Prioridade</option>
            <option>Valor total em centavos</option>
          </select>
          <select style="flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; color: #334155; font-size: 14px; outline: none; cursor: pointer;">
            <option selected>igual a</option>
            <option>diferente de</option>
          </select>
          <select style="flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; color: #334155; font-size: 14px; outline: none; cursor: pointer;">
            <option selected>Novo contato</option>
            <option>Em contato</option>
          </select>
          <button style="background: none; border: none; color: #ef4444; font-size: 16px; font-weight: bold; cursor: pointer; padding: 0 4px;" onclick="this.parentElement.remove()">&times;</button>
        `;
        btn.parentElement.insertBefore(div, buscarContainer);
      }
    },

    openKanbanSettings: function() {
      var board = document.getElementById('waBoard');
      var toolbar = document.querySelector('.wa-kanban-toolbar');
      var settings = document.getElementById('waKanbanSettingsView');
      if (board) board.style.display = 'none';
      if (toolbar) toolbar.style.display = 'none';
      if (settings) settings.style.display = 'flex';
    },

    closeKanbanSettings: function() {
      var board = document.getElementById('waBoard');
      var toolbar = document.querySelector('.wa-kanban-toolbar');
      var settings = document.getElementById('waKanbanSettingsView');
      if (board) board.style.display = 'flex';
      if (toolbar) toolbar.style.display = 'flex';
      if (settings) settings.style.display = 'none';
    },

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

    onInboxAvatarClick: function() {
      _qrDismissed = false;
      if (isUiConnected()) {
        WA.openProfileModal();
      } else {
        WA.openQrModal();
      }
    },

    /* ── Profile settings modal ── */
    openProfileModal: async function() {
      syncFromChat();
      var state = (typeof WhatsAppChat !== 'undefined' && WhatsAppChat._getState)
        ? WhatsAppChat._getState()
        : {};
      if (!state.status || state.status !== 'open') {
        if (typeof showToast === 'function') {
          showToast('Conecte o WhatsApp para editar foto e perfil.', 'warning');
        }
        WA.openQrModal();
        return;
      }

      var nameInput = document.getElementById('waProfileNameInput');
      var statusInput = document.getElementById('waProfileStatusInput');
      var fbName = state.profileName || (_session && _session.name ? String(_session.name).trim() : '');
      nameInput.value = fbName;
      statusInput.value = '';
      document.getElementById('waProfileAvatarPreview').style.display = 'none';
      document.getElementById('waProfileAvatarPreview').src = '';
      document.getElementById('waProfileAvatarFallback').style.display = 'flex';
      document.getElementById('waProfileImageInput').value = '';
      _profileAvatarBase64 = '';

      if (state.profilePic) {
        var preImg = document.getElementById('waProfileAvatarPreview');
        preImg.onerror = function() {
          preImg.style.display = 'none';
          document.getElementById('waProfileAvatarFallback').style.display = 'flex';
        };
        preImg.src = state.profilePic;
        preImg.style.display = 'block';
        document.getElementById('waProfileAvatarFallback').style.display = 'none';
      }

      document.getElementById('waProfileModal').classList.add('open');

      var saveBtn = document.getElementById('waProfileSaveBtn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Carregando perfil...';

      try {
        var loadFn = (typeof WhatsAppChat.loadOwnProfile === 'function')
          ? WhatsAppChat.loadOwnProfile(true)
          : WhatsAppChat.fetchProfile();
        var res = await Promise.race([
          Promise.resolve(loadFn).then(function(r) {
            return r && r.profile ? r : { ok: true, profile: r || {} };
          }),
          new Promise(function(_, reject) {
            setTimeout(function() { reject(new Error('timeout')); }, 16000);
          }),
        ]);
        if (res && res.ok !== false && res.profile) {
          if (res.profile.name) {
            nameInput.value = res.profile.name;
          } else if (!nameInput.value && state.phone && _session && _session.name) {
            nameInput.value = String(_session.name).trim();
          }
          if (res.profile.status) {
            statusInput.value = res.profile.status;
          }
          if (res.profile.pictureUrl) {
            var img = document.getElementById('waProfileAvatarPreview');
            img.onerror = function() {
              img.style.display = 'none';
              document.getElementById('waProfileAvatarFallback').style.display = 'flex';
            };
            img.src = res.profile.pictureUrl;
            img.style.display = 'block';
            document.getElementById('waProfileAvatarFallback').style.display = 'none';
          }
        }
      } catch (e) {
        console.warn('[WA] Failed to fetch profile', e);
        if (!nameInput.value && fbName) nameInput.value = fbName;
        if (typeof showToast === 'function') {
          showToast('Perfil parcial carregado. Você pode editar e salvar.', 'info');
        }
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar Alterações';
      }
    },

    closeProfileModal: function() {
      document.getElementById('waProfileModal').classList.remove('open');
    },

    handleProfileAvatarSelect: function(input) {
      if (!input.files || !input.files[0]) return;
      var file = input.files[0];
      if (file.size > 2 * 1024 * 1024) {
        alert('A imagem do avatar deve ter no máximo 2MB.');
        return;
      }
      var reader = new FileReader();
      reader.onload = function(e) {
        _profileAvatarBase64 = e.target.result;
        var img = document.getElementById('waProfileAvatarPreview');
        img.src = _profileAvatarBase64;
        img.style.display = 'block';
        document.getElementById('waProfileAvatarFallback').style.display = 'none';
      };
      reader.readAsDataURL(file);
    },

    saveProfileSettings: async function() {
      var name = (document.getElementById('waProfileNameInput').value || '').trim();
      var status = (document.getElementById('waProfileStatusInput').value || '').trim();
      
      var data = {};
      if (name) data.name = name;
      if (status) data.status = status;
      if (_profileAvatarBase64) data.picture = _profileAvatarBase64;
      
      if (!name && !status && !_profileAvatarBase64) {
        WA.closeProfileModal();
        return;
      }

      var saveBtn = document.getElementById('waProfileSaveBtn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Salvando...';

      try {
        var res = await WhatsAppChat.updateProfile(data);
        if (res && res.ok) {
          if (typeof showToast === 'function') showToast('Perfil atualizado com sucesso!', 'success');
          _inboxProfilePic = '';
          refreshInboxProfilePic(true);
          WA.closeProfileModal();
          WA.refresh();
        } else {
          alert('Erro ao atualizar perfil: ' + (res.error || 'Erro desconhecido'));
        }
      } catch (e) {
        alert('Error updating profile: ' + e.message);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar Alterações';
      }
    },

    switchTab: function(tabName) {
      _activeTab = tabName;
      if (tabName === 'kanban') clearBoardChatOverlay();
      
      var items = document.querySelectorAll('.wa-sidebar__item');
      items.forEach(function(item) {
        var isTarget = item.id.toLowerCase() === ('sbTab' + tabName).toLowerCase();
        item.classList.toggle('active', isTarget);
      });
      
      var panels = {
        'whatsapp': document.getElementById('tabPanelWhatsApp'),
        'kanban': document.getElementById('tabPanelKanban'),
        'empty': document.getElementById('tabPanelEmpty')
      };
      
      var showPanel = 'empty';
      if (tabName === 'whatsapp' || tabName === 'kanban') {
        showPanel = tabName;
      }
      
      Object.keys(panels).forEach(function(key) {
        var el = panels[key];
        if (el) {
          el.style.display = (key === showPanel) ? 'flex' : 'none';
        }
      });
      
      render();
    },
    
    toggleSidebarDropdown: function() {
      var dd = document.getElementById('waSidebarDropdown');
      if (dd) dd.classList.toggle('open');
    },
    
    openNotifications: function() {
      if (typeof showToast === 'function') {
        showToast('Você não possui novas notificações.', 'info');
      } else {
        alert('Nenhuma notificação nova.');
      }
    },

    sortKanban: function() {
      var select = document.getElementById('waKanbanSortSelect');
      if (select) {
        _sortField = select.value;
        renderKanban();
      }
    },

    toggleSortOrder: function() {
      var btn = document.getElementById('waKanbanSortOrder');
      if (btn) {
        _sortOrder = _sortOrder === 'desc' ? 'asc' : 'desc';
        btn.textContent = _sortOrder === 'desc' ? 'Desc' : 'Asc';
        renderKanban();
      }
    }
  };

})();
