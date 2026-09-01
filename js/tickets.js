window.Tickets = {
  departments: ['Financeiro', 'RH', 'Operacional', 'Supervisão', 'Gerência', 'Ouvidoria', 'Desenvolvimento', 'TI'],
  subjects: {
    'Financeiro': ['Alteração dados bancários', 'Representação de pagamentos', 'Contestação pontuação', 'Outros assuntos'],
    'RH': ['Contra cheque', 'Atestado médico', 'Alteração de dados', 'Pedido de demissão', 'Outros assuntos'],
    'Operacional': ['Dúvidas', 'Status proposta', 'Atuação proposta', 'Cancelamento proposta', 'Representação pagamento', 'Solicitação Boleto', 'Averbação proposta', 'Solicitação novo link', 'Solicitação de novo contato', 'Solicitação link chamada vídeo'],
    'Supervisão': ['Solicitação Treinamento', 'Justificativa de Falta', 'Parcial 12:00', 'Fechamento'],
    'Gerência': ['Solicitação', 'Escalonamento', 'Outros assuntos'],
    'Ouvidoria': ['Sugestão', 'Reclamação'],
    'Desenvolvimento': ['Bug ou erro na plataforma', 'Nova funcionalidade / melhoria', 'Acesso e permissões', 'Outros'],
    'TI': ['Bug ou erro na plataforma', 'Nova funcionalidade / melhoria', 'Acesso e permissões', 'Suporte técnico', 'Outros']
  },
  _attachmentViewerCache: [],
  _lastAttachmentBlobUrl: null,
  _actionsWired: false,
  _replyAudioCtx: null,
  _replyAudioUnlocked: false,

  /**
   * _unlockReplyAudio — desbloqueia Web Audio no primeiro clique (política do navegador).
   */
  _unlockReplyAudio() {
    if (this._replyAudioUnlocked) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this._replyAudioCtx = this._replyAudioCtx || new Ctx();
      if (this._replyAudioCtx.state === 'suspended') this._replyAudioCtx.resume();
      const osc = this._replyAudioCtx.createOscillator();
      const gain = this._replyAudioCtx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(this._replyAudioCtx.destination);
      osc.start();
      osc.stop(this._replyAudioCtx.currentTime + 0.01);
      this._replyAudioUnlocked = true;
    } catch (_) { /* noop */ }
  },

  /**
   * _playReplySentSound — feedback sonoro ao enviar resposta no chamado.
   */
  _playReplySentSound() {
    try {
      this._unlockReplyAudio();
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this._replyAudioCtx = this._replyAudioCtx || new Ctx();
      const ctx = this._replyAudioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;
      const notes = [523.25, 659.25];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t0 = now + i * 0.12;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.14, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.22);
      });
    } catch (_) { /* noop */ }
  },

  _ticketDbgLog(location, message, data, hypothesisId) {
    const payload = {
      sessionId: '97c411',
      location,
      message,
      data: data || {},
      timestamp: Date.now(),
      hypothesisId: hypothesisId || 'ticket-modal',
      runId: 'ticket-modal-fix-v2',
    };
const cfg = window.SOUBLU_CONFIG || {};
    const base = String(cfg.API_BASE_URL || cfg.SITE_URL || location.origin || '').replace(/\/+$/, '');
    const key = cfg.API_KEY || '';
    if (!base || !key) return;
    fetch(`${base}/api/credito_api.php?action=client_log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
      body: JSON.stringify(payload),
    }).catch(() => {});
  },

  _escAttr(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  },

  _bindTicketActions() {
    if (this._actionsWired) return;
    this._actionsWired = true;
    document.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-ticket-open]');
      if (!btn) return;
      ev.preventDefault();
      const id = btn.getAttribute('data-ticket-open');
if (id) this.openTicketDetail(id);
    }, true);
  },

  init: function() {
    // Guarda referência da UI antes de qualquer alias em Tickets.openModal.
    this._uiOpenModal = typeof window.openModal === 'function' ? window.openModal : null;
    this._uiCloseModal = typeof window.closeModal === 'function' ? window.closeModal : null;
    this._replyBusy = false;
    this.populateDepts();
    this._bindTicketActions();
    if (!this._replyAudioUnlockBound) {
      this._replyAudioUnlockBound = true;
      const unlock = () => this._unlockReplyAudio();
      document.addEventListener('click', unlock, { once: true, capture: true });
      document.addEventListener('keydown', unlock, { once: true, capture: true });
    }
  },

  /** Perfis que podem abrir chamado (não só vendedor/backoffice na área employee). */
  canOpenTickets: function() {
    const s = typeof Auth !== 'undefined' && Auth.getSession ? Auth.getSession() : null;
    if (!s) return false;
    const role = String(s.role || '').toLowerCase();
    return [
      'vendedor', 'employee', 'backoffice', 'supervisor', 'sup_backoffice',
      'gerencia', 'gerente', 'master', 'fundador', 'financeiro', 'financial',
      'rh', 'operacional', 'juridico', 'diretoria', 'ouvidoria', 'desenvolvedor', 'admin',
      'portaria', 'parceiro',
    ].includes(role);
  },

  /** Rede parceira: só chamados abertos pela própria equipe. */
  _filterTicketsForPartnerOrg: async function(tickets) {
    const rootId = typeof window !== 'undefined' ? window.PARTNER_ROOT_ID : null;
    if (!rootId || !Array.isArray(tickets)) return tickets;
    const teamIds = new Set([String(rootId)]);
    try {
      if (typeof DB.getPartnerTeamIds === 'function') {
        const set = await DB.getPartnerTeamIds(rootId);
        if (set && typeof set.forEach === 'function') {
          set.forEach((id) => teamIds.add(String(id)));
        } else if (Array.isArray(set)) {
          set.forEach((id) => teamIds.add(String(id)));
        }
      }
    } catch (_) { /* noop */ }
    return tickets.filter((t) => {
      const opener = String(t.openedById || t.employee_id || '');
      return opener && teamIds.has(opener);
    });
  },

  _isPortariaOnly: function() {
    const s = typeof Auth !== 'undefined' && Auth.getSession ? Auth.getSession() : null;
    return String(s?.role || '').toLowerCase() === 'portaria';
  },

  _canSeeAllTickets: function() {
    if (typeof Auth !== 'undefined' && typeof Auth.canSeeAllTickets === 'function') {
      return !!Auth.canSeeAllTickets();
    }
    if (typeof Auth !== 'undefined' && typeof Auth.isMaster === 'function' && Auth.isMaster()) return true;
    if (typeof Auth !== 'undefined' && typeof Auth.hasMasterPanel === 'function' && Auth.hasMasterPanel()) return true;
    const s = typeof Auth !== 'undefined' && Auth.getSession ? Auth.getSession() : null;
    const role = String(s?.role || '').toLowerCase();
    if (role === 'master' || role === 'fundador' || role === 'diretoria' || role === 'desenvolvedor'
      || role === 'financeiro' || role === 'financial' || role === 'rh') return true;
    const p = (s?.permissions && typeof s.permissions === 'object') ? s.permissions : {};
    return !!(p.canSeeAllTickets || p.canMasterPanel);
  },

  /** Formulário "Abrir chamado" dentro do admin (supervisores usam admin, não employee). */
  ensureOpenTicketPanel: function() {
    const sec = document.getElementById('secManageTickets');
    if (!sec || !this.canOpenTickets()) return;
    if (document.getElementById('ticketOpenPanel')) return;

    const panel = document.createElement('div');
    panel.id = 'ticketOpenPanel';
    panel.innerHTML = `
      <div class="card card-padded" style="margin-bottom: 20px;">
        <h3 style="margin-bottom: 15px;">Abrir Novo Chamado</h3>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px;">
          <select id="ticketDept" class="form-control" onchange="Tickets.updateSubjects()">
            <option value="">Selecione o Departamento</option>
          </select>
          <select id="ticketSubject" class="form-control">
            <option value="">Selecione o Assunto</option>
          </select>
        </div>
        <textarea id="ticketDesc" class="form-control" placeholder="Descreva o problema/solicitação..." style="margin-top:15px;"></textarea>
        <div style="margin-top:15px;">
          <label>Anexos (opcional — pode selecionar vários)</label>
          <input type="file" id="ticketFile" class="form-control" accept="*/*" multiple>
          <small style="display:block;margin-top:6px;color:var(--color-text-muted);">Máximo 10 arquivos por chamado.</small>
        </div>
        <button type="button" class="btn btn-primary" style="margin-top: 20px;" onclick="Tickets.submit()">Abrir Chamado</button>
      </div>
      <div class="card card-padded" style="margin-bottom: 20px;">
        <h3 style="margin-bottom: 15px;">Meus Chamados Abertos</h3>
        <div id="ticketsList"></div>
      </div>`;
    const tableCard = sec.querySelector('.card');
    if (tableCard) {
      sec.insertBefore(panel, tableCard);
    } else {
      sec.prepend(panel);
    }
    this.populateDepts();
  },

  populateDepts: function() {
    const deptSelect = document.getElementById('ticketDept');
    if (!deptSelect) return;

    let html = '<option value="">Selecione o Departamento</option>';
    this.departments.forEach(dept => {
      if (typeof Auth.canOpenTicketTo === 'function' && Auth.canOpenTicketTo(dept)) {
        html += '<option value="'+dept+'">'+dept+'</option>';
      } else if (typeof Auth.canOpenTicketTo !== 'function') {
        html += '<option value="'+dept+'">'+dept+'</option>';
      }
    });
    deptSelect.innerHTML = html;
  },

  updateSubjects: function() {
    const dept = document.getElementById('ticketDept').value;
    const subjectSelect = document.getElementById('ticketSubject');
    if (!subjectSelect) return;

    let html = '<option value="">Selecione o Assunto</option>';
    if (dept && this.subjects[dept]) {
      this.subjects[dept].forEach(sub => {
        html += '<option value="'+sub+'">'+sub+'</option>';
      });
    }
    subjectSelect.innerHTML = html;
  },

  readFileAsBase64: function(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  },

  _normalizeAttachments: function(msg) {
    if (!msg) return [];
    const list = [];
    const seen = new Set();
    const push = (url, name) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      list.push({ url, name: name || 'Anexo' });
    };
    if (Array.isArray(msg.attachments)) {
      msg.attachments.forEach((a) => {
        if (!a) return;
        if (typeof a === 'string') push(a, 'Anexo');
        else push(a.url || a.attachment || a.file_url, a.name || a.attachmentName || a.file_name || 'Anexo');
      });
    }
    const legacy = msg.attachment || msg.attachment_url || msg.file_url || null;
    if (legacy) push(legacy, msg.attachmentName || msg.attachment_name || msg.file_name || 'Anexo');
    return list;
  },

  _parseThread: function(raw) {
    if (!raw) return [];
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { return []; }
    }
    if (!Array.isArray(raw)) return [];
    return raw.map((m) => {
      const attachments = this._normalizeAttachments(m);
      const first = attachments[0] || null;
      return {
        ...m,
        senderName: m.senderName || m.sender_name || '—',
        senderRole: m.senderRole || m.sender_role,
        message: m.message || m.text || m.body || '',
        attachment: first?.url || null,
        attachmentName: first?.name || '',
        attachments,
        date: m.date || m.created_at || m.createdAt,
      };
    });
  },

  _normTicket: function(t) {
    if (!t) return t;
    return {
      ...t,
      openedById: t.openedById || t.opened_by_id || t.employee_id,
      openedByName: t.openedByName || t.opened_by_name || t.employee_name || '—',
      openedByDept: t.openedByDept || t.opened_by_dept || t.department || '',
      targetDept: t.targetDept || t.target_dept || t.department || '',
      createdAt: t.createdAt || t.created_at,
      updatedAt: t.updatedAt || t.updated_at,
      thread: this._parseThread(t.thread || t.messages),
    };
  },

  _isValidAttachmentUrl: function(url) {
    if (!url || typeof url !== 'string') return false;
    const u = url.trim();
    if (u.length < 12) return false;
    if (/^data:(image|application)\//i.test(u)) return u.length > 50;
    return /^https?:\/\//i.test(u) || u.startsWith('/uploads/');
  },

  _isImageUrl: function(url, name) {
    const blob = String(url || '') + ' ' + String(name || '');
    return /^data:image\//i.test(url) || /\.(jpe?g|png|gif|webp)(\?|$)/i.test(blob);
  },

  _isDownloadPreferred: function(url, name) {
    const blob = String(url || '') + ' ' + String(name || '');
    return /\.(zip|rar|7z|doc|docx|xls|xlsx|ppt|pptx)(\?|$)/i.test(blob);
  },

  _resolveAttachmentUrl: function(url) {
    if (!url) return '';
    const u = String(url).trim();
    if (u.startsWith('data:')) return u;
    if (typeof resolvePhotoUrl === 'function') return resolvePhotoUrl(u);
    if (/^https?:\/\//i.test(u)) return u;
    const base = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
    if (u.startsWith('/')) return base + u;
    return u;
  },

  _dataUrlToBlobUrl: function(dataUrl) {
    const parts = String(dataUrl).split(',');
    if (parts.length < 2) throw new Error('data URL inválida');
    // Evita travar a UI com atob síncrono em anexos grandes.
    if (parts[1].length > 180000) throw new Error('data URL grande demais');
    const mime = (parts[0].match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
    const bin = atob(parts[1]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([arr], { type: mime }));
  },

  _toDisplayUrl: function(url) {
    if (!url) return '';
    const raw = String(url);
    if (raw.startsWith('data:')) {
      // Não materializa base64 gigante na thread (congela o Chrome).
      if (raw.length > 200000) return '';
      try { return this._dataUrlToBlobUrl(raw); } catch { return ''; }
    }
    return this._resolveAttachmentUrl(url);
  },

  /** Remove base64 embutido do thread antes do PATCH (payload leve). */
  _compactThreadForSave(thread) {
    if (!Array.isArray(thread)) return [];
    return thread.map((msg) => {
      const m = { ...(msg || {}) };
      const strip = (u) => {
        const s = String(u || '');
        if (s.startsWith('data:') && s.length > 8000) return '';
        return s;
      };
      if (m.attachment) m.attachment = strip(m.attachment);
      if (m.url) m.url = strip(m.url);
      if (Array.isArray(m.attachments)) {
        m.attachments = m.attachments.map((a) => {
          if (!a || typeof a !== 'object') return a;
          return { ...a, url: strip(a.url) };
        }).filter((a) => a && a.url);
      }
      return m;
    });
  },

  _revokeAttachmentBlobUrl: function() {
    if (this._lastAttachmentBlobUrl) {
      try { URL.revokeObjectURL(this._lastAttachmentBlobUrl); } catch { /* noop */ }
      this._lastAttachmentBlobUrl = null;
    }
  },

  _cacheAttachment: function(url, name) {
    const idx = this._attachmentViewerCache.length;
    this._attachmentViewerCache.push({ url, name: name || 'Anexo' });
    return idx;
  },

  _triggerDownload: function(url, name) {
    let href = url;
    const safeName = String(name || 'anexo').replace(/[\\/:*?"<>|]/g, '_').trim() || 'anexo';
    try {
      const u = new URL(href, window.location.origin);
      if (/\/api\/file\.php$/i.test(u.pathname) || u.pathname.endsWith('/file.php')) {
        u.searchParams.set('download', '1');
        u.searchParams.set('name', safeName);
        href = u.toString();
      }
    } catch (_) { /* noop */ }
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('download', safeName);
    document.body.appendChild(a);
    a.click();
    a.remove();
  },

  openAttachment: function(cacheIdxOrUrl, nome) {
    let url = '';
    let name = nome || 'Anexo';
    if (typeof cacheIdxOrUrl === 'number') {
      const item = this._attachmentViewerCache[cacheIdxOrUrl];
      if (!item) { alert('Anexo indisponível.'); return; }
      url = item.url;
      name = item.name || name;
    } else {
      url = cacheIdxOrUrl;
    }
    if (!this._isValidAttachmentUrl(url)) {
      alert('Anexo indisponível ou corrompido. Peça ao solicitante para reenviar o arquivo.');
      return;
    }
    const displayUrl = this._toDisplayUrl(url);
    this._revokeAttachmentBlobUrl();
    if (displayUrl !== url && String(displayUrl).startsWith('blob:')) {
      this._lastAttachmentBlobUrl = displayUrl;
    }
    if (this._isDownloadPreferred(url, name) || String(url).startsWith('data:')) {
      this._triggerDownload(displayUrl, name);
      return;
    }
    const w = window.open(displayUrl, '_blank', 'noopener,noreferrer');
    if (!w) {
      this._triggerDownload(displayUrl, name);
    }
  },

  _attachmentHtml: function(url, name) {
    if (!this._isValidAttachmentUrl(url)) {
      return '<div style="margin-top:6px;font-size:12px;color:var(--color-danger);">Anexo indisponível (arquivo corrompido ou muito grande). Solicite reenvio.</div>';
    }
    const label = name || 'Anexo';
    const idx = this._cacheAttachment(url, label);
    const resolved = this._resolveAttachmentUrl(url);
    const safeLabel = this._escAttr(label);
    const isData = String(url || '').startsWith('data:');
    // Nunca injeta data:URL grande no DOM (trava o Chrome na esteira).
    const preferDownload = isData || this._isDownloadPreferred(url, label);
    const btnText = preferDownload ? 'Baixar' : 'Ver anexo';
    let preview = '';
    if (!isData && this._isImageUrl(url, label) && resolved && resolved.length < 2000) {
      const safeResolved = resolved.replace(/"/g, '&quot;');
      preview = `<div style="margin-top:8px;"><img src="${safeResolved}" alt="${safeLabel}" style="max-width:100%;max-height:220px;border-radius:8px;border:1px solid var(--color-border);cursor:pointer;object-fit:contain;" onclick="Tickets.openAttachment(${idx})" title="Clique para ampliar"/></div>`;
    }
    return `${preview}<div style="margin-top:6px;"><button type="button" class="btn btn-outline btn-sm" onclick="Tickets.openAttachment(${idx})">${btnText}${label && label !== 'Anexo' ? ': ' + safeLabel : ''}</button></div>`;
  },

  _attachmentsHtml: function(listOrMsg) {
    const list = Array.isArray(listOrMsg) ? listOrMsg : this._normalizeAttachments(listOrMsg);
    if (!list.length) return '';
    return list.map((a) => this._attachmentHtml(a.url, a.name)).join('');
  },

  async _uploadTicketAttachment(file, ticketId) {
    if (typeof uploadImage === 'function') {
      try {
        const url = await uploadImage(file, 'ticket-docs', String(ticketId).replace(/[^a-zA-Z0-9_-]/g, '_'));
        if (url) return { url, name: file.name || 'Anexo' };
      } catch (e) {
        console.warn('[Tickets] upload:', e);
      }
    }
    // Base64 no thread estoura timeout da API — só para arquivos bem pequenos.
    if (file.size <= 120000) {
      const data = await this.readFileAsBase64(file);
      return { url: data, name: file.name || 'Anexo' };
    }
    throw new Error('Não foi possível enviar o anexo (arquivo grande). Tente de novo ou use uma imagem menor.');
  },

  async _uploadTicketFiles(fileList, ticketId) {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return [];
    if (files.length > 10) {
      throw new Error('Selecione no máximo 10 arquivos.');
    }
    const out = [];
    for (const file of files) {
      const up = await this._uploadTicketAttachment(file, ticketId);
      if (up?.url) out.push(up);
    }
    return out;
  },

  submit: async function() {
    const user = Auth.getSession();
    const dept = document.getElementById('ticketDept').value;
    const subject = document.getElementById('ticketSubject').value;
    const desc = document.getElementById('ticketDesc').value;

    if (!dept || !subject || !desc) {
      alert("Preencha departamento, assunto e descrição.");
      return;
    }

    const ticketId = 'TKT-' + Date.now();
    let attachments = [];
    const fileInput = document.getElementById('ticketFile');
    if (fileInput?.files?.length) {
      try {
        attachments = await this._uploadTicketFiles(fileInput.files, ticketId);
      } catch(e) {
        alert(e.message || "Erro ao anexar arquivo.");
        return;
      }
    }
    const first = attachments[0] || null;

    const ticket = {
      id: ticketId,
      openedById: user.id,
      employee_id: user.id,
      openedByName: user.name,
      openedByDept: user.department || '',
      targetDept: dept,
      subject: subject,
      status: 'aberto',
      createdAt: nowBrazilSql(),
      created_at: nowBrazilSql(),
      updatedAt: nowBrazilSql(),
      updated_at: nowBrazilSql(),
      thread: [
        {
          senderName: user.name,
          senderRole: user.role,
          message: desc,
          attachment: first?.url || null,
          attachmentName: first?.name || '',
          attachments,
          date: nowBrazilSql()
        }
      ]
    };

    try {
      await DB.save('tickets', ticket);
alert("Chamado aberto com sucesso!");
    } catch(e) {
alert("Erro ao abrir chamado: " + e.message);
      return;
    }

    document.getElementById('ticketDept').value = '';
    document.getElementById('ticketSubject').value = '';
    document.getElementById('ticketDesc').value = '';
    document.getElementById('ticketFile').value = '';

    this.renderEmployeeList();
  },

  renderEmployeeList: async function() {
    const listEl = document.getElementById('ticketsList');
    if (!listEl) return;
    this.populateDepts();

    const user = Auth.getSession();
    const tickets = (await DB.list('tickets') || []).map((t) => this._normTicket(t));

    const myTickets = tickets.filter(t => String(t.openedById) === String(user.id));

    if (myTickets.length === 0) {
      listEl.innerHTML = '<p>Nenhum chamado aberto.</p>';
      return;
    }

    myTickets.sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    let html = '';
    myTickets.forEach(t => {
      let statusColor = '#3b82f6';
      if(t.status === 'em_andamento') statusColor = '#f59e0b';
      if(t.status === 'resolvido') statusColor = '#10b981';

      let statusText = t.status === 'em_andamento' ? 'Em Andamento' :
        t.status === 'resolvido' ? 'Resolvido' : 'Aberto';

      html += `
        <div style="border:1px solid var(--color-border); border-radius: var(--radius-md); padding: 15px; margin-bottom: 10px;">
           <div style="display:flex; justify-content: space-between; margin-bottom: 10px;">
              <strong>${t.id} - Para: ${t.targetDept}</strong>
              <span style="background:${statusColor}; color:white; padding: 2px 8px; border-radius: 12px; font-size: 12px;">${statusText}</span>
           </div>
           <div><strong>Assunto:</strong> ${t.subject}</div>
           <div style="font-size: 13px; margin-top: 8px;"><em>Última atualização: ${formatDateTime(t.updatedAt)}</em></div>
           <div style="margin-top: 10px;">
             <button type="button" class="btn btn-outline btn-sm" data-ticket-open="${this._escAttr(t.id)}">Ver Detalhes/Responder</button>
           </div>
        </div>
      `;
    });
    listEl.innerHTML = html;
  },

  renderAdminList: async function() {
    this.ensureOpenTicketPanel();
    const portariaOnly = this._isPortariaOnly();
    const navLbl = document.querySelector('#navManageTickets .nav-label');
    if (navLbl) navLbl.textContent = portariaOnly ? 'Abrir Chamado' : 'Esteira Chamados';

    const sec = document.getElementById('secManageTickets');
    if (sec) {
      const h2 = sec.querySelector('.page-header h2');
      const sub = sec.querySelector('.page-header p');
      if (h2) h2.textContent = portariaOnly ? ' Abrir Chamado' : ' Gestão de Chamados';
      if (sub) {
        sub.textContent = portariaOnly
          ? 'Abra um chamado para o departamento desejado'
          : (this._canSeeAllTickets()
            ? 'Todos os chamados da empresa'
            : 'Chamados direcionados ao seu departamento');
      }
    }

    if (this.canOpenTickets() && document.getElementById('ticketsList')) {
      await this.renderEmployeeList();
    }

    const tbody = document.getElementById('manageTicketsTbody');
    const manageCard = tbody?.closest('.card');
    if (portariaOnly) {
      if (manageCard) manageCard.style.display = 'none';
      return;
    }
    if (manageCard) manageCard.style.display = '';
    if (!tbody) return;

    const tickets = (await DB.list('tickets') || []).map((t) => this._normTicket(t));
    const seeAll = this._canSeeAllTickets();

    let filteredTickets = seeAll
      ? tickets.slice()
      : tickets.filter(t => {
          if (typeof Auth.canReplyToTicket === 'function') {
            return Auth.canReplyToTicket(t.targetDept);
          }
          return true;
        });
    if (!seeAll) {
      filteredTickets = await this._filterTicketsForPartnerOrg(filteredTickets);
    }

    filteredTickets.sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    const mobileList = (typeof window.isSoubluMobile === 'function' && window.isSoubluMobile())
      || (window.matchMedia && window.matchMedia('(max-width: 900px)').matches);
    const listLimit = mobileList ? 60 : filteredTickets.length;
    const visible = filteredTickets.slice(0, listLimit);

    const tableWrap = tbody.closest('.table-wrap') || tbody.closest('.card');
    let mobileHost = document.getElementById('manageTicketsMobileList');
    if (!mobileHost && tableWrap?.parentElement) {
      mobileHost = document.createElement('div');
      mobileHost.id = 'manageTicketsMobileList';
      mobileHost.className = 'mobile-list-cards';
      const insertBefore = tbody.closest('.table-wrap') || tbody.closest('table');
      if (insertBefore?.parentElement) insertBefore.parentElement.insertBefore(mobileHost, insertBefore);
      else tableWrap.parentElement.insertBefore(mobileHost, tableWrap);
    }
    const wrapEl = tbody.closest('.table-wrap') || tbody.closest('table');
    if (mobileHost) mobileHost.style.display = mobileList ? 'block' : 'none';
    if (wrapEl) wrapEl.style.display = mobileList ? 'none' : '';

    if (mobileList && mobileHost) {
      let cards = '';
      visible.forEach(t => {
        let statusColor = '#3b82f6';
        if (t.status === 'em_andamento') statusColor = '#f59e0b';
        if (t.status === 'resolvido') statusColor = '#10b981';
        let statusText = t.status === 'em_andamento' ? 'Em Andamento' :
          t.status === 'resolvido' ? 'Resolvido' : 'Aberto';
        cards += `
          <article class="mobile-list-card">
            <div class="mobile-list-card__head">
              <div>
                <strong>#${this._escHtml(t.id)}</strong>
                <div class="mobile-list-card__meta">${this._escHtml(t.openedByName)} (${this._escHtml(t.openedByDept || 'N/A')})</div>
              </div>
              <span style="background:${statusColor};color:#fff;padding:4px 10px;border-radius:12px;font-size:12px;font-weight:700;">${statusText}</span>
            </div>
            <div class="mobile-list-card__body">
              <div><strong>${this._escHtml(t.targetDept)}</strong> — ${this._escHtml(t.subject)}</div>
              <div class="mobile-list-card__muted">${formatDate(t.createdAt)}</div>
            </div>
            <div class="mobile-list-card__actions">
              <button type="button" class="btn btn-primary btn-sm" data-ticket-open="${this._escAttr(t.id)}" style="min-width:120px;">Tratar</button>
            </div>
          </article>`;
      });
      if (filteredTickets.length > visible.length) {
        cards += `<p class="mobile-list-card__muted" style="text-align:center;padding:8px;">Mostrando ${visible.length} de ${filteredTickets.length} chamados.</p>`;
      }
      mobileHost.innerHTML = cards;
      tbody.innerHTML = '';
      return;
    }

    let html = '';
    visible.forEach(t => {
      let statusColor = '#3b82f6';
      if(t.status === 'em_andamento') statusColor = '#f59e0b';
      if(t.status === 'resolvido') statusColor = '#10b981';

      let statusText = t.status === 'em_andamento' ? 'Em Andamento' :
        t.status === 'resolvido' ? 'Resolvido' : 'Aberto';

      html += `
        <tr>
          <td>${t.id}</td>
          <td>${t.openedByName} (${t.openedByDept || 'N/A'})</td>
          <td>${t.targetDept} - ${t.subject}</td>
          <td>${formatDate(t.createdAt)}</td>
          <td><span style="background:${statusColor}; color:white; padding: 2px 8px; border-radius: 12px; font-size: 12px;">${statusText}</span></td>
          <td>
             <button type="button" class="btn btn-outline btn-sm" data-ticket-open="${this._escAttr(t.id)}">Tratar</button>
          </td>
        </tr>
      `;
    });
    if (mobileList && filteredTickets.length > visible.length) {
      html += `<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);padding:14px;font-size:13px;">Mostrando ${visible.length} de ${filteredTickets.length} chamados (lista limitada no celular).</td></tr>`;
    }
    tbody.innerHTML = html;
  },

    openTicketDetail: async function(id) {
try {
    const raw = await DB.get('tickets', id);
    const ticket = this._normTicket(raw);
    if (!ticket) {
      alert('Chamado não encontrado.');
      return;
    }

    this._attachmentViewerCache = [];

    const idEl = document.getElementById('manageTicketId');
    if (!idEl) {
      alert('Modal de chamados não disponível nesta página.');
      return;
    }
    idEl.value = ticket.id;

    let infoHtml = `
      <strong>De:</strong> ${ticket.openedByName} (${ticket.openedByDept})<br>
      <strong>Para (Depto):</strong> ${ticket.targetDept}<br>
      <strong>Assunto:</strong> ${ticket.subject}<br>
      <strong>Criado em:</strong> ${formatDateTime(ticket.createdAt)}
    `;
    document.getElementById('manageTicketInfo').innerHTML = infoHtml;

    const attBox = document.getElementById('manageTicketAttachment');
    const firstAtt = ticket.thread?.[0];
    if (attBox) {
      const openAttHtml = this._attachmentsHtml(firstAtt);
      attBox.innerHTML = openAttHtml
        ? `<strong style="font-size:12px;">Anexo(s) da abertura:</strong>${openAttHtml}`
        : '';
    }

    const statusEl = document.getElementById('manageTicketStatus');
    if (statusEl) statusEl.value = ticket.status || 'aberto';

    const replyEl = document.getElementById('manageTicketReply');
    if (replyEl) replyEl.value = '';
    const replyFiles = document.getElementById('manageTicketFiles');
    if (replyFiles) replyFiles.value = '';

    const infoTop = document.getElementById('manageTicketInfoTop');
    if (infoTop) {
      infoTop.textContent = `${ticket.targetDept} • ${String(ticket.status || 'aberto').toUpperCase()}`;
    }

    let threadHtml = '';
    const user = Auth.getSession() || {};
    if (ticket.thread?.length) {
      ticket.thread.forEach(msg => {
        const attHtml = this._attachmentsHtml(msg);
        const isSelf = (msg.senderName === user.name);
        const align = isSelf 
          ? 'align-self: flex-end; background: #d9fdd3; border-radius: 8px 0 8px 8px; margin-left: 20%;' 
          : 'align-self: flex-start; background: #ffffff; border-radius: 0 8px 8px 8px; margin-right: 20%;';

        threadHtml += `
          <div style="padding: 8px 12px; box-shadow: 0 1px 1px rgba(0,0,0,0.05); position: relative; ${align}">
             <div style="font-size: 11px; font-weight: 600; color: ${isSelf ? '#025c4c' : 'var(--color-primary)'}; margin-bottom: 4px;">
               ${msg.senderName} ${msg.senderRole && msg.senderRole !== 'null' ? `(${msg.senderRole})` : ''}
             </div>
             <div style="font-size: 14px; color: #111; white-space: pre-wrap; line-height: 1.4;">${msg.message}</div>
             ${attHtml}
             <div style="font-size: 10px; color: #667781; text-align: right; margin-top: 4px; margin-right: -4px;">
               ${new Date(msg.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
             </div>
          </div>
        `;
      });
    }
    const threadEl = document.getElementById('manageTicketThread');
    if (threadEl) threadEl.innerHTML = threadHtml;
    
    setTimeout(() => {
      const w = document.getElementById('manageTicketThreadWrapper') || threadEl;
      if (w) w.scrollTop = w.scrollHeight;
    }, 50);

    const modal = document.getElementById('manageTicketModal');
    if (!modal) {
      alert('Modal de chamados não encontrado.');
      return;
    }
    // Abre o modal da UI diretamente — NÃO usar Tickets.openModal (evita recursão).
    const uiOpen = this._uiOpenModal
      || (typeof window.openModal === 'function' && window.openModal !== Tickets.openModal ? window.openModal : null)
      || (typeof openModal === 'function' && openModal !== Tickets.openModal ? openModal : null);
    if (uiOpen) uiOpen('manageTicketModal');
    else {
      modal.classList.add('open');
      modal.style.display = 'flex';
      modal.style.opacity = '1';
      modal.style.visibility = 'visible';
    }
} catch (err) {
      console.error('[Tickets.openTicketDetail]', err);
alert('Não foi possível abrir o chamado. Tente atualizar a página (Ctrl+Shift+R).');
    }
  },

  /** Alias seguro: só abre detalhe se receber id de chamado. */
  openModal(id) {
    if (!id || id === 'manageTicketModal') return;
    return this.openTicketDetail(id);
  },

  reply: async function() {
    if (this._replyBusy) return;
    this._replyBusy = true;

    const user = Auth.getSession();
    const id = document.getElementById('manageTicketId')?.value;
    const replyBtn = document.querySelector('#manageTicketModal button[onclick*="Tickets.reply"]');
    if (replyBtn) {
      replyBtn.disabled = true;
      replyBtn.style.opacity = '0.6';
      replyBtn.style.pointerEvents = 'none';
    }

    try {
      if (!id) {
        alert('Chamado não identificado. Feche e abra novamente.');
        return;
      }
      const ticket = this._normTicket(await DB.get('tickets', id));
      if (!ticket) {
        alert('Chamado não encontrado.');
        return;
      }

      const replyText = (document.getElementById('manageTicketReply')?.value || '').trim();
      let newStatus = ticket.status;
      if (document.getElementById('manageTicketStatus')) {
        newStatus = document.getElementById('manageTicketStatus').value;
      }
      const replyFilesEl = document.getElementById('manageTicketFiles');
      const hasFiles = !!(replyFilesEl?.files?.length);

      if (!replyText && !hasFiles && newStatus === ticket.status) {
        alert('Digite uma resposta, anexe arquivo(s) ou altere o status.');
        return;
      }

      const becameResolved = String(ticket.status || '').toLowerCase() !== 'resolvido'
        && String(newStatus || '').toLowerCase() === 'resolvido';

      ticket.status = newStatus;
      ticket.updatedAt = nowBrazilSql();
      ticket.updated_at = ticket.updatedAt;
      ticket.thread = this._compactThreadForSave(ticket.thread || []);

      if (replyText || hasFiles) {
        let attachments = [];
        if (hasFiles) {
          attachments = await this._uploadTicketFiles(replyFilesEl.files, ticket.id);
        }
        const first = attachments[0] || null;
        ticket.thread.push({
          senderName: user.name,
          senderRole: user.role,
          message: replyText || (attachments.length ? '(anexo)' : ''),
          attachment: first?.url || null,
          attachmentName: first?.name || '',
          attachments,
          date: nowBrazilSql()
        });
      }

      const savePromise = DB.save('tickets', ticket);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Tempo esgotado ao salvar. Tente novamente.')), 20000);
      });
      await Promise.race([savePromise, timeoutPromise]);

      if (replyText || hasFiles) {
        this._playReplySentSound();
      }

      // Roleta não pode travar a esteira — roda em background.
      if (becameResolved && ticket.employee_id && typeof DB.applyRouletteCriteriaReward === 'function') {
        void DB.applyRouletteCriteriaReward(ticket.employee_id, 'chamado_resolvido', {
          ticket_id: ticket.id,
          by_user: user?.id || 'sistema_chamados',
        }).catch(() => null);
      }

      if (typeof closeModal === 'function') closeModal('manageTicketModal');
      else {
        const modalEl = document.getElementById('manageTicketModal');
        if (modalEl) {
          modalEl.classList.remove('open');
          modalEl.style.display = 'none';
        }
      }
      if (typeof unlockUiOverlays === 'function') unlockUiOverlays();
      if (replyFilesEl) replyFilesEl.value = '';

      alert('Chamado atualizado!');

      // Refresh da lista fora do caminho crítico.
      void Promise.resolve().then(async () => {
        try {
          if (document.getElementById('manageTicketsTbody')) await this.renderAdminList();
          if (document.getElementById('ticketsList')) await this.renderEmployeeList();
        } catch (e) {
          console.warn('[Tickets] refresh após reply:', e);
        }
      });
    } catch (e) {
      console.error('[Tickets.reply]', e);
      alert('Erro ao salvar resposta: ' + (e.message || e));
    } finally {
      this._replyBusy = false;
      if (replyBtn) {
        replyBtn.disabled = false;
        replyBtn.style.opacity = '';
        replyBtn.style.pointerEvents = '';
      }
    }
  }
};

window.addEventListener('DOMContentLoaded', () => {
  Tickets.init();
  Tickets._bindTicketActions();
  if (document.getElementById('ticketsList')) {
    Tickets.renderEmployeeList();
  }
  if (document.getElementById('manageTicketsTbody')) {
    Tickets.renderAdminList();
  }
});
