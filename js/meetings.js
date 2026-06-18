/* =============================================
   SOU + BLU — Reuniões / Termo de ciência da ata
   Quem agenda: supervisor e perfis equivalentes ao menu Feedbacks (master, RH, etc.)
   ============================================= */

(function () {
  const MEETING_TERM_TITLE = 'Termo de ciência e Declaração de ata de reunião';

  const MEETING_TERM_BODY_HTML = `
<p style="margin-bottom:14px;font-weight:700;">DECLARAÇÃO — Pelo presente instrumento, o Declarante afirma que:</p>
<ol style="margin:0;padding-left:20px;line-height:1.55;">
<li>Teve acesso integral ao teor da Ata de Reunião supracitada, tendo lido e compreendido todos os seus itens, deliberações e anexos, se houver;</li>
<li>Confirma a veracidade das informações nela registradas, reconhecendo que o documento reflete fielmente os fatos e as decisões ocorridas durante o ato;</li>
<li>Manifesta sua plena e irrevogável concordância com todas as cláusulas, obrigações e prazos estabelecidos na referida ata, nada tendo a opor ou ressalvar no presente momento;</li>
<li>Reconhece que as deliberações constantes na ata passam a produzir efeitos jurídicos e administrativos imediatos, vinculando as partes envolvidas conforme o acordado.</li>
</ol>
<p style="margin-top:16px;font-style:italic;">Por ser a expressão da verdade, firmo o presente termo para que produza seus efeitos legais.</p>
`;

  function meetingsScopeMaster(role) {
    const r = String(role || '');
    return ['master', 'fundador', 'gerente', 'financeiro', 'financial', 'rh', 'desenvolvedor'].includes(r);
  }
  function canScheduleMeetings(role) {
    const r = String(role || '');
    return meetingsScopeMaster(r) || ['supervisor', 'sup_backoffice', 'ouvidoria', 'gerencia', 'admin'].includes(r);
  }

  function _getMeetingUserId() {
    if (window.currentUser?.id) return String(window.currentUser.id);
    if (typeof Auth !== 'undefined' && Auth.getSession()?.id) return String(Auth.getSession().id);
    return '';
  }

  /** Badge no menu + toast quando chega convocação nova. */
  window.updateMeetingsBadge = async function updateMeetingsBadge() {
    if (!window.DB) return 0;
    const uid = _getMeetingUserId();
    if (!uid) return 0;
    let pending = 0;
    try {
      pending = await DB.countPendingMeetingInvites(uid);
    } catch (e) {
      console.warn('[Meetings] badge:', e);
      return 0;
    }
    document.querySelectorAll('#meetingsBadge, .meetings-badge').forEach(b => {
      b.textContent = pending;
      b.style.display = pending > 0 ? 'inline' : 'none';
    });
    if (pending > 0) {
      document.querySelectorAll('.meetings-nav').forEach(el => { el.style.display = ''; });
    }
    return pending;
  };

  function _toastNewMeetings(list, uid) {
    if (!list.length || typeof showToast !== 'function') return;
    const key = `soublu_meetings_seen_${uid}`;
    let seen = [];
    try { seen = JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { seen = []; }
    const seenSet = new Set(seen.map(String));
    const fresh = list.filter(m => !seenSet.has(String(m.id)));
    if (!fresh.length) return;
    fresh.slice(0, 3).forEach(m => {
      showToast(`📅 Nova convocação: ${m.subject || 'Reunião'}`, 'info', 7000);
    });
    list.forEach(m => seenSet.add(String(m.id)));
    localStorage.setItem(key, JSON.stringify([...seenSet].slice(-120)));
  }

  function ensureMeetingTermOverlay() {
    if (document.getElementById('meetingTermFullscreen')) return;

    document.body.insertAdjacentHTML(
      'beforeend',
      `
<div class="term-fullscreen" id="meetingTermFullscreen" aria-hidden="true">
  <div class="term-card" style="max-width:620px;">
    <div class="term-header">
      <h2>📜 ${MEETING_TERM_TITLE}</h2>
      <p id="meetingTermSubtitle">Leia até o final para confirmar sua ciência.</p>
    </div>
    <div class="term-progress-bar"><div class="term-progress-fill" id="meetingTermProgressFill"></div></div>
    <div class="term-scroll-area" id="meetingTermScrollArea">
      <div id="meetingTermMeetingSummary" style="margin-bottom:18px;padding:14px;border-radius:var(--radius-md);background:var(--color-surface-2);font-size:14px;line-height:1.55;"></div>
      <div id="meetingTermLegalBody" style="font-size:14px;line-height:1.55;color:var(--color-text);">${MEETING_TERM_BODY_HTML}</div>
    </div>
    <div class="term-footer">
      <div class="term-scroll-hint" id="meetingTermScrollHint"><span class="arrow">↓</span> Role até o final para habilitar a confirmação</div>
      <label class="term-checkbox-row" id="meetingTermCheckLabel">
        <input type="checkbox" id="meetingTermFinalCheck" disabled/>
        <span>Declaro que li e compreendi integralmente o termo acima e manifesto minha ciência e concordância.</span>
      </label>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
        <button type="button" class="btn btn-ghost" id="meetingTermCancelBtn">Cancelar</button>
        <button type="button" class="btn btn-primary" id="meetingTermConfirmBtn" disabled>Confirmar ciência</button>
      </div>
    </div>
  </div>
</div>`
    );

    const ov = document.getElementById('meetingTermFullscreen');
    document.getElementById('meetingTermCancelBtn').onclick = () => {
      ov.classList.remove('open');
      ov.setAttribute('aria-hidden', 'true');
      window.__meetingTermPendingId = null;
    };
  }

  let _mTGHandler = null;
  let _mChHandler = null;

  function wireMeetingTermScroll() {
    const area = document.getElementById('meetingTermScrollArea');
    const fill = document.getElementById('meetingTermProgressFill');
    const hint = document.getElementById('meetingTermScrollHint');
    const checkLbl = document.getElementById('meetingTermCheckLabel');
    const checkInp = document.getElementById('meetingTermFinalCheck');
    const confirmBtn = document.getElementById('meetingTermConfirmBtn');

    if (_mTGHandler) area.removeEventListener('scroll', _mTGHandler);
    if (_mChHandler) checkInp.removeEventListener('change', _mChHandler);

    let unlocked = false;

    _mTGHandler = function () {
      const { scrollTop, scrollHeight, clientHeight } = area;
      const scrollable = scrollHeight - clientHeight;
      const pct = scrollable <= 0 ? 100 : Math.min(100, Math.round((scrollTop / scrollable) * 100));
      fill.style.width = pct + '%';
      if (pct >= 95 && !unlocked) {
        unlocked = true;
        hint.classList.add('hidden');
        checkLbl.classList.add('unlocked');
        checkInp.disabled = false;
      }
    };

    _mChHandler = function () {
      confirmBtn.disabled = !checkInp.checked;
    };

    area.addEventListener('scroll', _mTGHandler, { passive: true });
    checkInp.addEventListener('change', _mChHandler);

    requestAnimationFrame(() => {
      const { scrollHeight, clientHeight } = area;
      if (scrollHeight <= clientHeight) {
        unlocked = true;
        hint.classList.add('hidden');
        checkLbl.classList.add('unlocked');
        checkInp.disabled = false;
      }
    });
  }

  function _normSearch(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  const MEET_ROLE_LABELS = {
    vendedor: 'Vendedor',
    employee: 'Funcionário',
    backoffice: 'Backoffice',
    sup_backoffice: 'Sup. Backoffice',
    supervisor: 'Supervisor',
    desenvolvedor: 'Desenvolvedor',
    rh: 'RH',
    gerente: 'Gerente',
    gerencia: 'Gerência',
    financeiro: 'Financeiro',
    financial: 'Financeiro',
    operacional: 'Operacional',
    juridico: 'Jurídico',
    diretoria: 'Diretoria',
    ouvidoria: 'Ouvidoria',
    master: 'Master',
    fundador: 'Fundador',
  };

  function _escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function _escapeAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function _meetingTextHtml(text) {
    return _escapeHtml(text).replace(/\n/g, '<br/>');
  }

  function _safeFileName(s) {
    return String(s || 'reuniao')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'reuniao';
  }

  function _buildMeetingAtaDocumentHtml(m, meta) {
    const when = m.scheduled_at && typeof formatDateTime === 'function'
      ? formatDateTime(m.scheduled_at)
      : (m.scheduled_at ? new Date(m.scheduled_at).toLocaleString('pt-BR') : '—');
    const creator = meta?.creatorName || m.created_by || '—';
    const participants = meta?.participantNames?.length
      ? meta.participantNames.join(', ')
      : '—';
    const ackLines = meta?.ackLines?.length
      ? meta.ackLines.map(l => `<li>${_escapeHtml(l)}</li>`).join('')
      : '<li style="color:#666;">Nenhuma ciência registrada ainda.</li>';

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Ata — ${_escapeHtml(m.ata_subject || m.subject)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 720px; margin: 40px auto; padding: 0 24px; color: #111; line-height: 1.55; }
  h1 { font-size: 22px; text-align: center; margin-bottom: 8px; text-transform: uppercase; letter-spacing: .04em; }
  h2 { font-size: 15px; margin: 24px 0 10px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  .meta { font-size: 14px; margin: 16px 0; }
  .meta div { margin: 6px 0; }
  .block { background: #f8f8f8; border: 1px solid #ddd; border-radius: 6px; padding: 14px 16px; margin: 12px 0; white-space: pre-wrap; font-size: 14px; }
  footer { margin-top: 40px; font-size: 12px; color: #666; text-align: center; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
  <h1>Ata de Reunião</h1>
  <p style="text-align:center;font-size:13px;color:#444;margin-top:0;">SOU + BLU — documento gerado em ${new Date().toLocaleString('pt-BR')}</p>

  <h2>Convocação</h2>
  <div class="meta">
    <div><strong>Assunto:</strong> ${_escapeHtml(m.subject)}</div>
    <div><strong>Data e horário:</strong> ${when}</div>
    <div><strong>Convocado por:</strong> ${_escapeHtml(creator)}</div>
    <div><strong>Participantes:</strong> ${_escapeHtml(participants)}</div>
  </div>
  <p><strong>Pauta da convocação:</strong></p>
  <div class="block">${_meetingTextHtml(m.pauta || '—')}</div>

  <h2>Ata (mesmo assunto)</h2>
  <div class="meta">
    <div><strong>Assunto da ata:</strong> ${_escapeHtml(m.ata_subject || m.subject)}</div>
  </div>
  <p><strong>Conteúdo da ata:</strong></p>
  <div class="block">${_meetingTextHtml(m.ata_pauta || m.pauta || '—')}</div>

  <h2>Ciência dos participantes</h2>
  <ul style="font-size:14px;">${ackLines}</ul>

  <footer>Documento vinculado à convocação registrada no sistema SOU + BLU.</footer>
</body>
</html>`;
  }

  async function _meetingAtaMeta(m) {
    let creatorName = m.created_by || '—';
    try {
      const ou = await DB.getUser(m.created_by);
      creatorName = ou?.name || creatorName;
    } catch (_) { /* noop */ }
    const participantNames = [];
    const ackLines = [];
    for (const pid of m.participant_ids || []) {
      let name = pid;
      try {
        const u = await DB.getUser(pid);
        name = u?.name || pid;
      } catch (_) { /* noop */ }
      participantNames.push(name);
      const ackAt = (m.acknowledgements || {})[String(pid)];
      if (ackAt) {
        const whenAck = typeof formatDateTime === 'function'
          ? formatDateTime(ackAt)
          : new Date(ackAt).toLocaleString('pt-BR');
        ackLines.push(`${name} — ciência em ${whenAck}`);
      }
    }
    return { creatorName, participantNames, ackLines };
  }

  window.downloadMeetingAta = async function downloadMeetingAta(meetingId) {
    if (!window.DB) return;
    const m = await DB.getMeeting(meetingId);
    if (!m) {
      if (typeof showToast === 'function') showToast('Reunião não encontrada.', 'error');
      return;
    }
    if (!(m.ata_subject || m.ata_pauta)) {
      if (typeof showToast === 'function') showToast('Esta reunião ainda não possui ata.', 'warning');
      return;
    }
    const meta = await _meetingAtaMeta(m);
    const html = _buildMeetingAtaDocumentHtml(m, meta);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ata-${_safeFileName(m.ata_subject || m.subject)}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    if (typeof showToast === 'function') showToast('Ata baixada. Abra o arquivo no navegador ou imprima em PDF.', 'success', 5000);
  };

  function _truncate(s, max) {
    const t = String(s || '');
    return t.length <= max ? t : t.slice(0, max - 1) + '…';
  }

  function ensureMeetingAtaModal() {
    if (document.getElementById('meetingAtaModal')) return;
    document.body.insertAdjacentHTML(
      'beforeend',
      `
<div class="modal-overlay" id="meetingAtaModal">
  <div class="modal" style="max-width:560px;">
    <div class="modal-header">
      <h3>📋 Ata de reunião</h3>
      <button type="button" class="modal-close" onclick="closeModal('meetingAtaModal')"></button>
    </div>
    <div class="modal-body">
      <input type="hidden" id="meetAtaMeetingId"/>
      <p class="form-hint" style="margin:0 0 12px;">Mesmo assunto da convocação — edite aqui após a reunião e use <strong>Baixar ata</strong> para salvar o documento.</p>
      <div class="form-group">
        <label>Assunto da ata</label>
        <input type="text" id="meetAtaSubject" class="form-control" placeholder="Título da ata"/>
      </div>
      <div class="form-group">
        <label>Conteúdo da ata</label>
        <textarea id="meetAtaPauta" class="form-control" rows="6" placeholder="Deliberações, encaminhamentos e registros da reunião…"></textarea>
      </div>
    </div>
    <div class="modal-footer" style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
      <button type="button" class="btn btn-outline btn-sm" id="meetAtaDownloadBtn">⬇ Baixar ata</button>
      <button type="button" class="btn btn-ghost" onclick="closeModal('meetingAtaModal')">Cancelar</button>
      <button type="button" class="btn btn-primary" id="meetAtaSaveBtn">Salvar ata</button>
    </div>
  </div>
</div>`
    );
    document.getElementById('meetAtaDownloadBtn').onclick = () => {
      const meetingId = document.getElementById('meetAtaMeetingId').value;
      if (meetingId) window.downloadMeetingAta(meetingId);
    };
    document.getElementById('meetAtaSaveBtn').onclick = async () => {
      const meetingId = document.getElementById('meetAtaMeetingId').value;
      const ata_subject = document.getElementById('meetAtaSubject').value.trim();
      const ata_pauta = document.getElementById('meetAtaPauta').value.trim();
      if (!meetingId) return;
      showLoading('Salvando ata…');
      try {
        await DB.updateMeetingAta(meetingId, { ata_subject, ata_pauta });
        showToast('Ata registrada.', 'success');
        if (typeof closeModal === 'function') closeModal('meetingAtaModal');
        if (typeof _cacheDel === 'function') _cacheDel('meetings');
        await renderMeetingsAdmin({ tableOnly: true });
      } catch (e) {
        showToast(e.message || 'Não foi possível salvar a ata.', 'error');
      } finally {
        hideLoading();
      }
    };
  }

  async function openMeetingAtaModal(meetingId, preset) {
    ensureMeetingAtaModal();
    document.getElementById('meetAtaMeetingId').value = meetingId;
    document.getElementById('meetAtaSubject').value = preset?.ata_subject || preset?.subject || '';
    document.getElementById('meetAtaPauta').value = preset?.ata_pauta || preset?.pauta || '';
    if (typeof openModal === 'function') openModal('meetingAtaModal');
    else document.getElementById('meetingAtaModal')?.classList.add('open');
  }

  async function loadMeetingParticipantOptions(adminId, scopeMaster) {
    if (!window.DB) return [];
    const roles = new Set(DB.MEETING_PARTICIPANT_ROLES || []);
    try {
      const list = scopeMaster
        ? await DB.getMeetingParticipants(null)
        : await DB.getMeetingParticipants(adminId);
      return (list || []).filter(u => !roles.size || roles.has(u.role));
    } catch (e) {
      console.warn('[Meetings] participantes:', e);
      return [];
    }
  }

  function _participantSearchKey(u) {
    return _normSearch([u.name, u.matricula, u.email, u.department, MEET_ROLE_LABELS[u.role] || u.role].join(' '));
  }

  function _indexMeetingParticipants(participants) {
    const idx = {};
    (participants || []).forEach((u) => {
      if (u?.id) idx[String(u.id)] = _participantSearchKey(u);
    });
    window.__meetParticipantSearchById = idx;
  }

  function _ensureMeetPartStyles() {
    if (document.getElementById('meetPartStyles')) return;
    const el = document.createElement('style');
    el.id = 'meetPartStyles';
    el.textContent = `
#meetParticipantsList .meet-part-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-bottom: 1px solid var(--color-border); cursor: pointer;
}
#meetParticipantsList .meet-part-row.is-filtered-out { display: none !important; }
#meetParticipantsList .meet-part-label { flex: 1; min-width: 0; }
#meetParticipantsList .meet-part-name { font-weight: 700; font-size: 14px; text-transform: none; letter-spacing: normal; }
`;
    document.head.appendChild(el);
  }

  function _rowParticipantSearchKey(row) {
    const idx = window.__meetParticipantSearchById || {};
    const id = row.querySelector('.meet-part-cb')?.value;
    if (id && idx[id]) return idx[id];
    return _normSearch(row.getAttribute('data-search') || '');
  }

  function _renderMeetingParticipantCheckboxes(participants) {
    if (!participants.length) {
      return `<div class="text-muted text-center" style="padding:20px;">Nenhum colaborador ativo disponível.</div>`;
    }
    return participants
      .map(v => {
        const tag = [v.matricula, v.department].filter(Boolean).join(' · ');
        const roleLbl = MEET_ROLE_LABELS[v.role] || v.role || 'Colaborador';
        const searchKey = _participantSearchKey(v);
        return `
<div class="meet-part-row" data-search="${_escapeAttr(searchKey)}">
  <input type="checkbox" class="meet-part-cb" value="${_escapeAttr(v.id)}" style="width:18px;height:18px;flex-shrink:0;"/>
  <div class="meet-part-label">
    <div class="meet-part-name">${_escapeHtml(v.name)}</div>
    ${tag ? `<div style="font-size:12px;color:var(--color-text-muted);">${_escapeHtml(tag)}</div>` : ''}
  </div>
  <span class="badge badge-muted" style="font-size:10px;">${_escapeHtml(roleLbl)}</span>
</div>`;
      })
      .join('');
  }

  function _filterMeetingParticipants() {
    const list = document.getElementById('meetParticipantsList');
    const search = document.getElementById('meetPartSearch');
    if (!list || !search) return;
    const q = _normSearch(search.value.trim());
    const tokens = q.split(/\s+/).filter(Boolean);
    const rows = list.querySelectorAll('.meet-part-row');
    let visible = 0;
    rows.forEach(row => {
      const key = _rowParticipantSearchKey(row);
      const show = !tokens.length || tokens.every(t => key.includes(t));
      row.classList.toggle('is-filtered-out', !show);
      row.hidden = !show;
      if (show) visible++;
    });
    if (tokens.length) list.scrollTop = 0;
    const empty = document.getElementById('meetPartSearchEmpty');
    if (empty) {
      empty.style.display = rows.length && tokens.length && visible === 0 ? 'block' : 'none';
    }
    const visEl = document.getElementById('meetPartVisibleCount');
    if (visEl) {
      visEl.textContent = tokens.length ? ` · ${visible} visível(is) na busca` : '';
    }
  }

  function _updateMeetPartCount() {
    const list = document.getElementById('meetParticipantsList');
    const countEl = document.getElementById('meetPartCount');
    if (!list || !countEl) return;
    const n = list.querySelectorAll('.meet-part-cb:checked').length;
    const total = list.querySelectorAll('.meet-part-cb').length;
    countEl.textContent = `${n} de ${total}`;
  }

  function _wireMeetingParticipantPicker() {
    const card = document.getElementById('meetingsConvokeCard');
    const list = document.getElementById('meetParticipantsList');
    if (!list) return;
    _ensureMeetPartStyles();

    if (card?.dataset.partPickerWired === '1') {
      _updateMeetPartCount();
      _filterMeetingParticipants();
      return;
    }
    if (card) card.dataset.partPickerWired = '1';

    list.addEventListener('change', e => {
      if (e.target?.classList?.contains('meet-part-cb')) _updateMeetPartCount();
    });

    list.addEventListener('click', e => {
      const row = e.target.closest('.meet-part-row');
      if (!row || row.classList.contains('is-filtered-out') || row.hidden) return;
      if (e.target.classList.contains('meet-part-cb')) return;
      const cb = row.querySelector('.meet-part-cb');
      if (cb) {
        cb.checked = !cb.checked;
        _updateMeetPartCount();
      }
    });

    card?.addEventListener('click', e => {
      const t = e.target;
      if (t?.id === 'meetPartSelectAll') {
        list.querySelectorAll('.meet-part-cb').forEach(cb => { cb.checked = true; });
        _updateMeetPartCount();
      } else if (t?.id === 'meetPartSelectVisible') {
        list.querySelectorAll('.meet-part-row').forEach(row => {
          if (row.classList.contains('is-filtered-out') || row.hidden) return;
          const cb = row.querySelector('.meet-part-cb');
          if (cb) cb.checked = true;
        });
        _updateMeetPartCount();
      } else if (t?.id === 'meetPartClearAll') {
        list.querySelectorAll('.meet-part-cb').forEach(cb => { cb.checked = false; });
        _updateMeetPartCount();
      }
    });

    _updateMeetPartCount();
    _filterMeetingParticipants();
  }

  if (!window.__meetPartSearchInputBound) {
    window.__meetPartSearchInputBound = true;
    document.addEventListener('input', e => {
      if (e.target?.id === 'meetPartSearch') _filterMeetingParticipants();
    });
    document.addEventListener('search', e => {
      if (e.target?.id === 'meetPartSearch') _filterMeetingParticipants();
    });
  }

  function _getSelectedMeetingParticipants() {
    const list = document.getElementById('meetParticipantsList');
    if (!list) return [];
    return Array.from(list.querySelectorAll('.meet-part-cb:checked')).map(cb => cb.value).filter(Boolean);
  }

  function _captureMeetingsFormDraft() {
    return {
      subject: document.getElementById('meetSubject')?.value ?? '',
      pauta: document.getElementById('meetPauta')?.value ?? '',
      scheduled: document.getElementById('meetScheduled')?.value ?? '',
      partSearch: document.getElementById('meetPartSearch')?.value ?? '',
      selected: _getSelectedMeetingParticipants(),
    };
  }

  function _restoreMeetingsFormDraft(draft) {
    if (!draft) return;
    const subj = document.getElementById('meetSubject');
    const pauta = document.getElementById('meetPauta');
    const sched = document.getElementById('meetScheduled');
    const search = document.getElementById('meetPartSearch');
    if (subj) subj.value = draft.subject || '';
    if (pauta) pauta.value = draft.pauta || '';
    if (sched) sched.value = draft.scheduled || '';
    if (search) search.value = draft.partSearch || '';
    const list = document.getElementById('meetParticipantsList');
    if (list) {
      const sel = new Set((draft.selected || []).map(String));
      list.querySelectorAll('.meet-part-cb').forEach((cb) => {
        cb.checked = sel.has(cb.value);
      });
    }
    _filterMeetingParticipants();
    const countEl = document.getElementById('meetPartCount');
    if (countEl && list) {
      const n = list.querySelectorAll('.meet-part-cb:checked').length;
      const total = list.querySelectorAll('.meet-part-cb').length;
      countEl.textContent = `${n} de ${total}`;
    }
  }

  function _clearMeetingsConvokeForm() {
    ['meetSubject', 'meetPauta', 'meetScheduled', 'meetPartSearch'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('meetParticipantsList')?.querySelectorAll('.meet-part-cb').forEach((cb) => {
      cb.checked = false;
    });
    _filterMeetingParticipants();
    const countEl = document.getElementById('meetPartCount');
    const list = document.getElementById('meetParticipantsList');
    if (countEl && list) {
      countEl.textContent = `0 de ${list.querySelectorAll('.meet-part-cb').length}`;
    }
  }

  function _meetingsFormShouldPreserve() {
    const ae = document.activeElement;
    const focusIds = ['meetSubject', 'meetPauta', 'meetScheduled', 'meetPartSearch'];
    if (ae && focusIds.includes(ae.id)) return true;
    const d = _captureMeetingsFormDraft();
    return !!(d.subject?.trim() || d.pauta?.trim() || d.scheduled?.trim() || d.partSearch?.trim() || d.selected?.length);
  }

  function _renderMeetingsAdminTable(meetings, usersById) {
    const tbody = document.getElementById('meetingsAdminTbody');
    if (!tbody) return;
    window.__meetingsAdminList = meetings || [];

    if (!meetings.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-muted" style="text-align:center;padding:24px;">Nenhuma reunião cadastrada.</td></tr>`;
      return;
    }

    tbody.innerHTML = meetings
      .map(m => {
        const when = m.scheduled_at ? formatDateTime(m.scheduled_at) : '—';
        const creator = usersById[m.created_by] || m.created_by || '—';
        const parts = (m.participant_ids || [])
          .map(pid => usersById[pid] || pid)
          .join(', ') || '—';
        const ack = m.acknowledgements || {};
        const total = (m.participant_ids || []).length;
        const ok = (m.participant_ids || []).filter(pid => ack[String(pid)]).length;
        const ackCell =
          total === 0
            ? '—'
            : `<strong>${ok}/${total}</strong> participante(s)<br><span style="font-size:11px;color:var(--color-text-muted);">confirmaram ciência</span>`;
        const hasAta = !!(m.ata_subject || m.ata_pauta);
        const ataCell = hasAta
          ? `<span class="badge badge-success">Vinculada à convocação</span>`
          : `<span class="badge badge-muted">Pendente</span>`;
        const midAttr = _escapeAttr(m.id);
        const ataBtns = hasAta
          ? `<button type="button" class="btn btn-outline btn-sm" data-meeting-dl="${midAttr}" style="margin-top:6px;">⬇ Baixar ata</button>
             <button type="button" class="btn btn-ghost btn-sm" data-meeting-ata="${midAttr}" style="margin-top:6px;">Editar ata</button>`
          : `<button type="button" class="btn btn-ghost btn-sm" data-meeting-ata="${midAttr}" style="margin-top:6px;">Criar ata</button>`;
        return `<tr>
<td><strong>${_escapeHtml(m.subject)}</strong></td>
<td style="max-width:200px;font-size:13px;color:var(--color-text-secondary);">${_escapeHtml(_truncate(m.pauta, 120))}</td>
<td>${when}</td>
<td>${_escapeHtml(creator)}</td>
<td style="max-width:240px;font-size:13px;">${_escapeHtml(parts)}</td>
<td>${ataCell}<br>${ataBtns}</td>
<td>${ackCell}</td>
</tr>`;
      })
      .join('');

    ensureMeetingAtaModal();
    const list = window.__meetingsAdminList || [];
    tbody.querySelectorAll('[data-meeting-ata]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-meeting-ata');
        const m = list.find(x => String(x.id) === String(id));
        openMeetingAtaModal(id, m || {});
      });
    });
    tbody.querySelectorAll('[data-meeting-dl]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-meeting-dl');
        if (id) window.downloadMeetingAta(id);
      });
    });
  }

  function _wireMeetingsCreateBtn(adminId) {
    const btn = document.getElementById('meetCreateBtn');
    if (!btn || btn.dataset.wired === '1') return;
    btn.dataset.wired = '1';
    btn.onclick = async () => {
      const subject = document.getElementById('meetSubject').value.trim();
      const pauta = document.getElementById('meetPauta').value.trim();
      const dt = document.getElementById('meetScheduled').value;
      const participant_ids = _getSelectedMeetingParticipants();

      if (!subject) {
        showToast('Informe o assunto da reunião.', 'warning');
        return;
      }
      if (!pauta) {
        showToast('Informe a pauta da reunião.', 'warning');
        return;
      }
      if (!participant_ids.length) {
        showToast('Marque pelo menos um participante.', 'warning');
        return;
      }

      showLoading('Salvando…');
      try {
        await DB.createMeeting({
          subject,
          pauta,
          scheduled_at: dt ? new Date(dt).toISOString() : new Date().toISOString(),
          participant_ids,
          created_by: adminId,
        });
        showToast('Convocação e ata inicial criadas. Use "Baixar ata" na lista quando precisar.', 'success', 6000);
        if (typeof _cacheDel === 'function') _cacheDel('meetings');
        _clearMeetingsConvokeForm();
        await renderMeetingsAdmin({ tableOnly: true });
        await updateMeetingsBadge();
      } catch (e) {
        showToast(e.message || 'Não foi possível salvar.', 'error');
      } finally {
        hideLoading();
      }
    };
  }

  /** Painel admin — convocar e listar (+ convocações recebidas no topo) */
  window.renderMeetingsAdmin = async function renderMeetingsAdmin(opts) {
    opts = opts || {};
    const root = document.getElementById('meetingsAdminRoot');
    if (!window.DB || typeof Auth === 'undefined') return;

    const session = Auth.getSession();
    const adminId = session?.id;
    const scopeMaster = meetingsScopeMaster(session?.role);
    const canSchedule = canScheduleMeetings(session?.role);

    if (typeof _cacheDel === 'function') _cacheDel('meetings');

    if (!opts.tableOnly) {
      await renderMeetingsEmployee({ rootId: 'meetingsMyInvitesRoot', userId: adminId, heading: 'Suas convocações' });
    }
    await updateMeetingsBadge();

    if (!root) return;
    if (!canSchedule) {
      root.innerHTML = '';
      return;
    }

    const participants = await loadMeetingParticipantOptions(adminId, scopeMaster);
    const meetings = await DB.listMeetingsForAdmin(adminId, scopeMaster);
    const usersById = {};
    try {
      const allNeed = new Set();
      meetings.forEach(m => {
        allNeed.add(m.created_by);
        (m.participant_ids || []).forEach(id => allNeed.add(id));
      });
      for (const id of allNeed) {
        if (!id) continue;
        const u = await DB.getUser(id);
        if (u) usersById[id] = u.name || id;
      }
    } catch (e) {
      console.warn('[Meetings] nomes:', e);
    }

    const activeParticipants = participants.filter(u => u.active !== false);
    _indexMeetingParticipants(activeParticipants);
    const partOpts = _renderMeetingParticipantCheckboxes(activeParticipants);

    const hasForm = !!document.getElementById('meetingsConvokeCard');
    const preserveForm = !opts.forceForm && hasForm && (opts.tableOnly || _meetingsFormShouldPreserve());

    if (!preserveForm) {
    const draftBefore = hasForm ? _captureMeetingsFormDraft() : null;
    root.innerHTML = `
<div class="card card-padded" id="meetingsConvokeCard" style="margin-bottom:var(--space-lg);">
  <h3 style="font-family:var(--font-display);font-weight:800;margin:0 0 8px;">Convocar reunião</h3>
  <p class="form-hint" style="margin:0 0 16px;">O assunto e a pauta abaixo geram a <strong>convocação</strong> e a <strong>ata inicial</strong> no mesmo tema. Após criar, você pode editar a ata e baixar o documento.</p>
  <div class="form-row">
    <div class="form-group" style="flex:1;">
      <label>Assunto (convocação e ata)</label>
      <input type="text" id="meetSubject" class="form-control" placeholder="Título resumido da reunião"/>
    </div>
  </div>
  <div class="form-row">
    <div class="form-group" style="flex:1;">
      <label>Pauta (convocação e ata)</label>
      <textarea id="meetPauta" class="form-control" rows="4" placeholder="Itens e temas que serão tratados na reunião…"></textarea>
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label>Data e horário</label>
      <input type="datetime-local" id="meetScheduled"/>
    </div>
    <div class="form-group" style="flex:2;">
      <label>Participantes — marque todos que devem comparecer</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;align-items:center;">
        <input type="search" id="meetPartSearch" placeholder="Buscar nome, matrícula, e-mail ou setor…" autocomplete="off"
          style="flex:1;min-width:180px;padding:8px 12px;border:1px solid var(--color-border);border-radius:var(--radius-md);"/>
        <button type="button" class="btn btn-ghost btn-sm" id="meetPartSelectAll">✓ Marcar todos</button>
        <button type="button" class="btn btn-ghost btn-sm" id="meetPartSelectVisible">✓ Marcar filtrados</button>
        <button type="button" class="btn btn-ghost btn-sm" id="meetPartClearAll">✕ Limpar</button>
      </div>
      <div id="meetParticipantsList" style="max-height:280px;overflow-y:auto;border:1.5px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);">
        ${partOpts}
        <div id="meetPartSearchEmpty" class="text-muted text-center" style="display:none;padding:16px;font-size:13px;">Nenhum participante encontrado para esta busca.</div>
      </div>
      <p class="form-hint" style="margin-top:8px;"><strong id="meetPartCount">0 de 0</strong> selecionado(s)<span id="meetPartVisibleCount" style="color:var(--color-text-muted);"></span> · Do <strong>gerente para baixo</strong>${scopeMaster ? ' (toda a empresa)' : ' (sua equipe)'}. Fundador, master, financeiro, RH e diretoria não entram na lista.</p>
    </div>
  </div>
  <button type="button" class="btn btn-primary" id="meetCreateBtn">📅 Criar convocação</button>
</div>

<div class="card card-padded">
  <h3 style="font-family:var(--font-display);font-weight:800;margin:0 0 16px;">Reuniões cadastradas</h3>
  <div class="table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th>Assunto</th>
          <th>Pauta</th>
          <th>Quando</th>
          <th>Convocado por</th>
          <th>Participantes</th>
          <th>Ata</th>
          <th>Ciência</th>
        </tr>
      </thead>
      <tbody id="meetingsAdminTbody"></tbody>
    </table>
  </div>
</div>`;

    _wireMeetingParticipantPicker();
    if (draftBefore && !opts.clearForm) _restoreMeetingsFormDraft(draftBefore);
    _wireMeetingsCreateBtn(adminId);
    } else if (hasForm) {
      _wireMeetingParticipantPicker();
    }

    _renderMeetingsAdminTable(meetings, usersById);
  };

  /** Convocações recebidas — área do funcionário e painel admin */
  window.renderMeetingsEmployee = async function renderMeetingsEmployee(opts = {}) {
    const rootId = opts.rootId || 'meetingsEmployeeRoot';
    const root = document.getElementById(rootId);
    if (!root || !window.DB) return;

    const uid = String(opts.userId || _getMeetingUserId());
    if (!uid) return;

    if (typeof _cacheDel === 'function') _cacheDel('meetings');
    const list = await DB.listMeetingsForParticipant(uid);
    _toastNewMeetings(list, uid);

    const heading = opts.heading || 'Minhas convocações';
    let html = '';
    if (!list.length) {
      if (opts.hideWhenEmpty && rootId === 'meetingsMyInvitesRoot') {
        root.innerHTML = '';
        return;
      }
      html = `<div class="empty-state" style="padding:32px;"><div class="empty-icon">📅</div><h4>Nenhuma convocação</h4><p class="text-muted">Quando você for incluído em uma reunião, ela aparecerá aqui.</p></div>`;
    } else {
      html = `<h3 style="font-family:var(--font-display);font-weight:800;margin:0 0 14px;">${heading}</h3><div style="display:flex;flex-direction:column;gap:14px;">`;
      for (const m of list) {
        let organizer = '—';
        try {
          const ou = await DB.getUser(m.created_by);
          organizer = ou?.name || m.created_by;
        } catch (_) {
          organizer = m.created_by;
        }
        const when = m.scheduled_at ? formatDateTime(m.scheduled_at) : '—';
        const ack = (m.acknowledgements || {})[uid];
        const hasAta = !!(m.ata_subject || m.ata_pauta);
        const status = ack
          ? `<span class="badge badge-success">Ciência registrada — ${formatDateTime(ack)}</span>`
          : `<span class="badge badge-warning">Aguardando sua ciência</span>`;
        const dlBtn = hasAta
          ? `<button type="button" class="btn btn-outline btn-sm" data-meeting-dl="${_escapeAttr(m.id)}">⬇ Baixar ata</button>`
          : '';
        const btn = ack
          ? dlBtn
          : `${dlBtn}<button type="button" class="btn btn-primary btn-sm" data-meeting-open="${_escapeAttr(m.id)}">Registrar ciência do termo</button>`;
        const pautaBlock = m.pauta
          ? `<div style="margin-top:10px;padding:10px 12px;border-radius:var(--radius-md);background:var(--color-surface-2);font-size:13px;"><strong>Pauta:</strong><br/>${_meetingTextHtml(m.pauta)}</div>`
          : '';
        const ataBlock = hasAta
          ? `<div style="margin-top:10px;padding:10px 12px;border-radius:var(--radius-md);border:1px solid var(--color-border);font-size:13px;">
<strong>Ata — assunto:</strong> ${_escapeHtml(m.ata_subject)}<br/>
<strong>Ata — pauta:</strong><br/>${_meetingTextHtml(m.ata_pauta)}
</div>`
          : '';

        html += `
<div class="card card-padded" style="border-left:4px solid var(--color-primary);">
  <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;align-items:flex-start;">
    <div>
      <h4 style="margin:0 0 8px;font-family:var(--font-display);">${_escapeHtml(m.subject || 'Reunião')}</h4>
      <div style="font-size:13px;color:var(--color-text-muted);line-height:1.5;">
        <div>📆 <strong>${when}</strong></div>
        <div>👤 Convocado por: <strong>${_escapeHtml(organizer)}</strong></div>
      </div>
      ${pautaBlock}
      ${ataBlock}
    </div>
    <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
      ${status}
      ${btn}
    </div>
  </div>
</div>`;
      }
      html += `</div>`;
      if (rootId === 'meetingsMyInvitesRoot') {
        html = `<div class="card card-padded" style="border-left:4px solid var(--color-warning);">${html}</div>`;
      }
    }

    root.innerHTML = html;

    root.querySelectorAll('[data-meeting-open]').forEach(btn => {
      btn.addEventListener('click', () => openMeetingTermModal(btn.getAttribute('data-meeting-open')));
    });
    root.querySelectorAll('[data-meeting-dl]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-meeting-dl');
        if (id) window.downloadMeetingAta(id);
      });
    });

    await updateMeetingsBadge();
  };

  async function openMeetingTermModal(meetingId) {
    ensureMeetingTermOverlay();
    const mtg = await DB.getMeeting(meetingId);
    if (!mtg) {
      showToast('Reunião não encontrada.', 'error');
      return;
    }
    const uid = _getMeetingUserId();
    if (!(mtg.participant_ids || []).map(String).includes(uid)) {
      showToast('Você não é participante desta reunião.', 'warning');
      return;
    }
    if ((mtg.acknowledgements || {})[uid]) {
      showToast('Ciência já registrada.', 'info');
      return;
    }

    const organizerEl = document.getElementById('meetingTermMeetingSummary');
    let organizer = mtg.created_by;
    try {
      const ou = await DB.getUser(mtg.created_by);
      organizer = ou?.name || organizer;
    } catch (_) {}
    const when = mtg.scheduled_at ? formatDateTime(mtg.scheduled_at) : '—';

    const convParts = [
      '<p style="margin:0 0 10px;font-weight:700;color:var(--color-primary);">Convocação</p>',
      `<strong>Assunto:</strong> ${_escapeHtml(mtg.subject)}`,
      mtg.pauta ? `<strong>Pauta:</strong><br/>${_meetingTextHtml(mtg.pauta)}` : '',
      `<strong>Data/hora:</strong> ${when}`,
      `<strong>Convocado por:</strong> ${_escapeHtml(organizer)}`,
    ].filter(Boolean);

    if (mtg.ata_subject || mtg.ata_pauta) {
      convParts.push(
        '<p style="margin:14px 0 10px;font-weight:700;color:var(--color-primary);">Ata de reunião</p>',
        `<strong>Assunto da ata:</strong> ${_escapeHtml(mtg.ata_subject)}`,
        mtg.ata_pauta ? `<strong>Pauta da ata:</strong><br/>${_meetingTextHtml(mtg.ata_pauta)}` : ''
      );
    }

    organizerEl.innerHTML = convParts.join('<br/>');

    const ov = document.getElementById('meetingTermFullscreen');
    const fill = document.getElementById('meetingTermProgressFill');
    const hint = document.getElementById('meetingTermScrollHint');
    const checkLbl = document.getElementById('meetingTermCheckLabel');
    const checkInp = document.getElementById('meetingTermFinalCheck');
    const confirmBtn = document.getElementById('meetingTermConfirmBtn');
    const area = document.getElementById('meetingTermScrollArea');

    fill.style.width = '0%';
    hint.classList.remove('hidden');
    checkLbl.classList.remove('unlocked');
    checkInp.checked = false;
    checkInp.disabled = true;
    confirmBtn.disabled = true;
    area.scrollTop = 0;

    window.__meetingTermPendingId = meetingId;

    ov.classList.add('open');
    ov.setAttribute('aria-hidden', 'false');

    wireMeetingTermScroll();

    confirmBtn.onclick = async () => {
      if (!checkInp.checked) return;
      const mid = window.__meetingTermPendingId;
      if (!mid) return;
      showLoading('Registrando…');
      try {
        await DB.acknowledgeMeeting(mid, uid);
        showToast('Ciência registrada com sucesso.', 'success');
        ov.classList.remove('open');
        ov.setAttribute('aria-hidden', 'true');
        window.__meetingTermPendingId = null;
        if (typeof _cacheDel === 'function') _cacheDel('meetings');
        await renderMeetingsEmployee();
        const adminInvites = document.getElementById('meetingsMyInvitesRoot');
        if (adminInvites && typeof renderMeetingsEmployee === 'function') {
          await renderMeetingsEmployee({ rootId: 'meetingsMyInvitesRoot', userId: uid, heading: 'Suas convocações' });
        }
        await updateMeetingsBadge();
      } catch (e) {
        showToast(e.message || 'Falha ao registrar.', 'error');
      } finally {
        hideLoading();
      }
    };
  }
})();
