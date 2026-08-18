/* =============================================
   Gerenciador de Leads – Employee Controller
   Interface do funcionário (Atendimento de Leads)
   ============================================= */

/* ── State ── */
let _userId = null;
let _todayLeads = [];
let _weekProgress = [];
let _currentLeadId = null;
let _currentFilter = 'all';
let _massCallRunning = false;
let _modalTags = [];
const LEAD_TAG_PRESETS = ['Lead', 'Quente', 'Retornar', 'WhatsApp', 'Não atende'];
const HIDDEN_EXTRA_KEYS = new Set(['calls', 'etiquetas', 'tags', 'phone2']);

/* ── Init ── */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (typeof DB === 'undefined' || !DB.init) {
      await _waitForDB();
    }
    await DB.init();

    // Evita mesa com leads fantasmas vindos de cache antigo
    try {
      Object.keys(sessionStorage).forEach((k) => {
        if (k && k.startsWith('supa_cache_leads')) sessionStorage.removeItem(k);
      });
    } catch (_) { /* ignore */ }

    // Auth check
    if (typeof Auth !== 'undefined') {
      const loggedIn = await Auth.isLoggedIn();
      if (!loggedIn) {
        window.location.replace(Auth.loginPageHref ? Auth.loginPageHref() : '../index.html');
        return;
      }
      await Auth.syncSessionFromDb();
      const session = Auth.getSession();
      _userId = session?.id;

      // Update UI
      const name = session?.name || 'Funcionário';
      const initial = (name || '?')[0].toUpperCase();
      document.getElementById('topbarUserName').textContent = name;
      document.getElementById('topbarAvatar').textContent = initial;
      const sideName = document.getElementById('sideUserName');
      const sideAv = document.getElementById('sideAvatar');
      if (sideName) sideName.textContent = name;
      if (sideAv) sideAv.textContent = initial;
    }

    if (!_userId) {
      document.querySelector('.loader-text').textContent = 'Erro: usuário não identificado.';
      return;
    }

    // Check soft-lock
    const isLocked = await LeadsDB.isUserLocked(_userId);
    if (isLocked) {
      showLockedScreen();
      return;
    }

    // Load data
    await loadTodayData();
    await loadWeekOverview();
    renderDialHistory();

    // Show app
    document.getElementById('globalLoader').style.display = 'none';
    const app = document.getElementById('appLayout');
    app.style.display = 'flex';
    app.classList.add('is-ready');

    // Setup responsive
    _setupResponsive();

  } catch (e) {
    console.error('[LeadsEmployee] Init error:', e);
    document.querySelector('.loader-text').textContent = 'Erro ao carregar. Recarregue a página.';
  }
});

function _waitForDB() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = setInterval(() => {
      if (typeof DB !== 'undefined' && DB.init) { clearInterval(check); resolve(); }
      else if (++attempts > 60) { clearInterval(check); reject(new Error('DB timeout')); }
    }, 100);
  });
}

/* ── Locked Screen ── */
async function showLockedScreen() {
  document.getElementById('globalLoader').style.display = 'none';
  const app = document.getElementById('appLayout');
  if (app) {
    app.classList.remove('is-ready');
    app.style.display = 'none';
  }
  document.getElementById('lockedScreen').style.display = 'flex';

  const user = await DB.getUser(_userId);
  if (user) {
    document.getElementById('lockDate').textContent = user.lead_locked_at
      ? new Date(user.lead_locked_at).toLocaleString('pt-BR')
      : '—';
    document.getElementById('lockReason').textContent = user.lead_lock_reason || 'Meta diária não atingida';
  }
}

/* ── Load Today's Data ── */
async function loadTodayData() {
  const today = LeadsDB.getCurrentDateStr();

  // Mesa: leads de hoje + pendentes atrasados (com fallback se semana estiver inconsistente)
  _todayLeads = _sortLeadsDeskOrder(
    await LeadsDB.getEmployeeTodayLeads(_userId, today)
  );

  // A meta real de hoje é tudo o que está acumulado na mesa do vendedor (hoje + atrasados)
  const dailyTarget = _todayLeads.length;

  const worked = _todayLeads.filter(l => LeadsDB.isWorkedStatus(l.status)).length;

  // Update daily progress widget
  document.getElementById('todayDone').textContent = worked;
  document.getElementById('todayTarget').textContent = dailyTarget;
  document.getElementById('todayDate').textContent = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  const pct = dailyTarget > 0 ? Math.min(100, Math.round((worked / dailyTarget) * 100)) : 0;
  const progressBar = document.getElementById('todayProgressBar');
  progressBar.style.width = `${pct}%`;
  progressBar.className = `progress-fill ${pct < 50 ? 'danger' : ''}`;

  // Status badge
  const statusEl = document.getElementById('todayStatus');
  if (worked >= dailyTarget && dailyTarget > 0) {
    statusEl.className = 'badge badge-success';
    statusEl.textContent = '✅ Meta Batida!';
  } else if (pct >= 75) {
    statusEl.className = 'badge badge-info';
    statusEl.textContent = `${pct}% — Quase lá!`;
  } else {
    statusEl.className = 'badge badge-warning';
    statusEl.textContent = `${pct}% — Faltam ${dailyTarget - worked}`;
  }

  // Update progress in DB
  await LeadsDB.upsertDailyProgress(_userId, today, dailyTarget, worked);

  // Update leads count
  document.getElementById('leadsCount').textContent = _todayLeads.length;

  // Render leads + metrics
  renderLeads();
  renderMetrics();
}

/* ── Render Leads ── */
function renderLeads() {
  const grid = document.getElementById('leadsGrid');

  let filtered = _todayLeads;
  if (_currentFilter === 'pending') {
    filtered = _todayLeads.filter(l => l.status === 'pending');
  } else if (_currentFilter === 'worked') {
    filtered = _todayLeads.filter(l => LeadsDB.isWorkedStatus(l.status));
  }

  // Update filter buttons (tabs)
  document.querySelectorAll('.le-filter-tabs .nav-link').forEach((btn) => btn.classList.remove('active'));
  const activeFilter = document.getElementById(`filter${_currentFilter.charAt(0).toUpperCase() + _currentFilter.slice(1)}`);
  if (activeFilter) activeFilter.classList.add('active');

  if (!filtered.length) {
    const msg = _currentFilter === 'pending'
      ? 'Todos os leads foram trabalhados! 🎉'
      : _currentFilter === 'worked'
      ? 'Nenhum lead trabalhado ainda.'
      : 'Nenhum lead para hoje.';
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${_currentFilter === 'pending' ? '🎉' : '📭'}</div>
        <h3>${msg}</h3>
        <p class="text-muted" style="margin-top:8px;font-size:13px;">Aguarde a distribuição do seu gerente.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(lead => {
    const statusInfo = LeadsDB.LEAD_STATUSES[lead.status] || LeadsDB.LEAD_STATUSES.pending;
    const isWorked = LeadsDB.isWorkedStatus(lead.status);
    const cardClass = isWorked ? (lead.status === 'venda_fechada' ? 'completed' : lead.status === 'sem_interesse' ? 'failed' : 'no-answer') : '';
    const safeId = String(lead.id || '').replace(/'/g, "\\'");
    const hasPhone = !!(lead.phone || lead.phone2);

    const leadScore = lead.score || lead.extra_data?.score;
    return `
      <div class="lead-card ${cardClass}${_massaDialedIds.has(String(lead.id)) ? ' le-massa-dialed' : ''}" id="lead-${lead.id}"${_massaDialedIds.has(String(lead.id)) ? ' style="background:rgba(34,197,94,0.14);border-color:#22c55e;box-shadow:inset 4px 0 0 #22c55e;"' : ''}>
        <div class="lead-info">
          <div class="lead-name">${_esc(lead.name || 'Sem nome')}${_massaDialedIds.has(String(lead.id)) ? ' <span style="color:#16a34a;font-size:12px;font-weight:700;">● discado</span>' : ''}</div>
          <div class="lead-details">
            ${lead.phone ? `<span>📞 ${_esc(lead.phone)}</span>` : ''}
            ${lead.phone2 ? `<span>📞 ${_esc(lead.phone2)}</span>` : ''}
            ${lead.orgao ? `<span>🏢 ${_esc(lead.orgao)}</span>` : ''}
            ${lead.cpf ? `<span>📄 ${_maskCPF(lead.cpf)}</span>` : ''}
            ${leadScore ? `<span style="font-weight:800;color:var(--color-primary);">⭐ Score: ${_esc(leadScore)}</span>` : ''}
          </div>
            ${_leadTagsHtml(lead)}
            ${lead.notes ? `<div style="font-size:12px;color:var(--color-text-muted);margin-top:4px;">📝 ${_esc(lead.notes)}</div>` : ''}
            ${_lastCallHtml(lead)}
        </div>
        <div class="lead-actions">
          ${hasPhone ? `
            <button type="button" class="btn btn-success btn-sm le-btn-ligar" onclick="event.stopPropagation();callLeadPhone('${safeId}','${lead.phone ? 'phone' : 'phone2'}')" title="Ligar agora">
              📞 Ligar
            </button>
          ` : ''}
          ${isWorked
            ? `<span class="badge badge-${statusInfo.color}">${statusInfo.icon} ${statusInfo.label}</span>
               <button class="btn btn-ghost btn-sm" onclick="openLeadModal('${safeId}')" title="Editar">✏️</button>`
            : `<button class="btn btn-accent btn-sm" onclick="openLeadModal('${safeId}')">Atender</button>`
          }
        </div>
      </div>
    `;
  }).join('');
}

function filterLeads(filter) {
  _currentFilter = filter;
  renderLeads();
}

function switchLeadsTab(tab) {
  const panels = {
    hoje: document.getElementById('tabPanelHoje'),
    semana: document.getElementById('tabPanelSemana'),
    metricas: document.getElementById('tabPanelMetricas'),
  };
  const buttons = {
    hoje: document.getElementById('tabBtnHoje'),
    semana: document.getElementById('tabBtnSemana'),
    metricas: document.getElementById('tabBtnMetricas'),
  };
  const navs = {
    hoje: document.getElementById('navMeusLeads'),
    metricas: document.getElementById('navMetricas'),
  };

  const key = ['hoje', 'semana', 'metricas'].includes(tab) ? tab : 'hoje';

  Object.keys(panels).forEach((k) => {
    if (panels[k]) panels[k].classList.toggle('d-none', k !== key);
  });
  Object.keys(buttons).forEach((k) => {
    if (!buttons[k]) return;
    const on = k === key;
    buttons[k].classList.toggle('active', on);
    buttons[k].setAttribute('aria-selected', on ? 'true' : 'false');
  });
  if (navs.hoje) navs.hoje.classList.toggle('active', key === 'hoje' || key === 'semana');
  if (navs.metricas) navs.metricas.classList.toggle('active', key === 'metricas');

  if (key === 'metricas') renderMetrics();
}

function renderMetrics() {
  const cardsEl = document.getElementById('metricsCards');
  const weekEl = document.getElementById('metricsWeekCards');
  const barsEl = document.getElementById('metricsStatusBars');
  if (!cardsEl || !barsEl) return;

  const leads = _todayLeads || [];
  const total = leads.length;
  const pending = leads.filter((l) => (l.status || 'pending') === 'pending').length;
  const worked = leads.filter((l) => LeadsDB.isWorkedStatus(l.status)).length;
  const vendas = leads.filter((l) => l.status === 'venda_fechada').length;
  const negociacao = leads.filter((l) => l.status === 'em_negociacao').length;
  const whatsapp = leads.filter((l) => l.status === 'whatsapp').length;
  const taxa = total > 0 ? Math.round((worked / total) * 100) : 0;
  const taxaVenda = total > 0 ? Math.round((vendas / total) * 100) : 0;

  const card = (label, value, hint) => `
    <div class="le-metric-card">
      <div class="le-metric-label">${label}</div>
      <div class="le-metric-value">${value}</div>
      ${hint ? `<div class="le-metric-hint">${hint}</div>` : ''}
    </div>
  `;

  cardsEl.innerHTML = [
    card('Total na mesa', total, 'Hoje + pendentes'),
    card('Pendentes', pending, 'Ainda não trabalhados'),
    card('Trabalhados', worked, `${taxa}% da mesa`),
    card('Vendas', vendas, `${taxaVenda}% conversão`),
    card('Em negociação', negociacao, ''),
    card('WhatsApp', whatsapp, ''),
  ].join('');

  if (weekEl) {
    const week = _weekProgress || [];
    const weekTarget = week.reduce((s, d) => s + (Number(d.target) || 0), 0);
    const weekDone = week.reduce((s, d) => s + (Number(d.completed) || 0), 0);
    const daysMet = week.filter((d) => (Number(d.target) || 0) > 0 && (Number(d.completed) || 0) >= (Number(d.target) || 0)).length;
    const weekPct = weekTarget > 0 ? Math.round((weekDone / weekTarget) * 100) : 0;
    weekEl.innerHTML = [
      card('Semana · meta', weekTarget, 'Leads da semana'),
      card('Semana · feitos', weekDone, `${weekPct}% concluído`),
      card('Dias no alvo', `${daysMet}/${week.length || 5}`, 'Meta diária batida'),
    ].join('');
  }

  const order = ['pending', 'nao_atende', 'sem_interesse', 'em_negociacao', 'whatsapp', 'venda_fechada'];
  const colors = {
    pending: '#94a3b8',
    nao_atende: '#f59e0b',
    sem_interesse: '#ef4444',
    em_negociacao: '#3b82f6',
    whatsapp: '#22c55e',
    venda_fechada: '#16a34a',
  };

  barsEl.innerHTML = order.map((status) => {
    const info = LeadsDB.LEAD_STATUSES[status] || { label: status, icon: '' };
    const count = leads.filter((l) => (l.status || 'pending') === status).length;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return `
      <div class="le-status-row">
        <div class="le-status-name">${info.icon || ''} ${info.label}</div>
        <div class="le-status-bar"><span style="width:${pct}%;background:${colors[status] || '#f97316'}"></span></div>
        <div class="le-status-count">${count}</div>
      </div>
    `;
  }).join('') || '<p class="text-muted mb-0">Sem dados ainda.</p>';
}

window.switchLeadsTab = switchLeadsTab;

function _leadExtra(lead) {
  return (typeof LeadsDB !== 'undefined' && LeadsDB._parseExtraData)
    ? LeadsDB._parseExtraData(lead?.extra_data)
    : (lead?.extra_data && typeof lead.extra_data === 'object' ? lead.extra_data : {});
}

function _leadTagsList(lead) {
  if (typeof LeadsDB !== 'undefined' && LeadsDB.leadTags) return LeadsDB.leadTags(lead);
  const extra = _leadExtra(lead);
  const raw = extra.etiquetas || extra.tags || [];
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  return String(raw).split(',').map((t) => t.trim()).filter(Boolean);
}

function _lastCallHtml(lead) {
  const call = (typeof LeadsDB !== 'undefined' && LeadsDB.leadLastCall) ? LeadsDB.leadLastCall(lead) : null;
  if (!call || !call.phone) return '';
  return `<div style="font-size:12px;color:#166534;margin-top:4px;font-weight:600;">📞 ${_esc(call.phone)}${call.at ? ` · ${_esc(_fmtCallWhen(call.at))}` : ''}</div>`;
}

function _leadTagsHtml(lead) {
  const tags = _leadTagsList(lead);
  if (!tags.length) return '';
  return `<div class="le-tag-row">${tags.map((t) => `<span class="le-tag-chip">${_esc(t)}</span>`).join('')}</div>`;
}

function _fmtExtraVal(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v)) {
      return v.map((x) => (x && typeof x === 'object' ? (x.phone || JSON.stringify(x)) : String(x))).join(', ');
    }
    return JSON.stringify(v);
  }
  return String(v);
}

function _fmtCallWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function renderDialHistory() {
  const el = document.getElementById('leDialHistory');
  if (!el || typeof LeadsDB === 'undefined' || !LeadsDB.getDialHistory) return;
  const hist = LeadsDB.getDialHistory(_userId, 8);
  if (!hist.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `<div class="le-dial-hist-label">Últimos números discados</div>` +
    hist.map((h) => {
      const phone = String(h.phone || '').replace(/\D/g, '');
      const when = _fmtCallWhen(h.at);
      return `<button type="button" class="le-dial-chip" onclick="fillDialNumber('${_esc(phone)}')" title="${_esc(when)}">${_esc(phone)}${when ? ` <span>${_esc(when)}</span>` : ''}</button>`;
    }).join('');
}

function fillDialNumber(phone) {
  const input = document.getElementById('leDialNumber');
  if (input) {
    input.value = String(phone || '').replace(/\D/g, '');
    input.focus();
  }
}

async function _refreshLeadExtra(leadId) {
  if (!leadId || typeof LeadsDB === 'undefined') return;
  try {
    const extra = await LeadsDB._getLeadExtra(leadId);
    const idx = (_todayLeads || []).findIndex((l) => l.id === leadId);
    if (idx !== -1) {
      _todayLeads[idx].extra_data = extra;
      renderLeads();
      const modal = document.getElementById('leadModal');
      if (_currentLeadId === leadId && modal?.classList.contains('open')) {
        openLeadModal(leadId);
      }
    }
  } catch (_) { /* ignore */ }
}

function renderModalTags() {
  const box = document.getElementById('modalLeadTags');
  if (!box) return;
  const chips = _modalTags.map((t, i) =>
    `<span class="le-tag-chip le-tag-chip--edit">${_esc(t)}<button type="button" class="le-tag-x" onclick="removeLeadTag(${i})" aria-label="Remover">×</button></span>`
  ).join('');
  const presets = LEAD_TAG_PRESETS.map((t) => {
    const on = _modalTags.some((x) => String(x).toLowerCase() === t.toLowerCase());
    return `<button type="button" class="le-tag-preset${on ? ' is-on' : ''}" onclick="toggleLeadTag('${t.replace(/'/g, "\\'")}')">${_esc(t)}</button>`;
  }).join('');
  box.innerHTML = `
    <div class="le-tag-row">${chips || '<span class="text-muted" style="font-size:12px;">Nenhuma etiqueta ainda.</span>'}</div>
    <div class="le-tag-presets">${presets}</div>
    <div class="d-flex gap-2 mt-2">
      <input type="text" class="form-control form-control-sm" id="modalTagInput" placeholder="Nova etiqueta (ex: Lead)" maxlength="32" onkeydown="if(event.key==='Enter'){event.preventDefault();addLeadTagFromInput();}">
      <button type="button" class="btn btn-outline-secondary btn-sm" onclick="addLeadTagFromInput()">Adicionar</button>
    </div>
  `;
}

function toggleLeadTag(tag) {
  const name = String(tag || '').trim();
  if (!name) return;
  const idx = _modalTags.findIndex((t) => t.toLowerCase() === name.toLowerCase());
  if (idx >= 0) _modalTags.splice(idx, 1);
  else _modalTags.push(name);
  renderModalTags();
  persistModalLeadMeta();
}

function addLeadTagFromInput() {
  const input = document.getElementById('modalTagInput');
  const name = String(input?.value || '').trim();
  if (!name) return;
  if (!_modalTags.some((t) => t.toLowerCase() === name.toLowerCase())) _modalTags.push(name);
  if (input) input.value = '';
  renderModalTags();
  persistModalLeadMeta();
}

function removeLeadTag(idx) {
  _modalTags.splice(idx, 1);
  renderModalTags();
  persistModalLeadMeta();
}

async function persistModalLeadMeta() {
  if (!_currentLeadId) return;
  const notes = document.getElementById('modalNotes')?.value?.trim() || '';
  const idx = _todayLeads.findIndex((l) => l.id === _currentLeadId);
  const lead = idx !== -1 ? _todayLeads[idx] : null;
  try {
    const saved = await LeadsDB.saveLeadNotesAndTags(_currentLeadId, notes, _modalTags.slice(), lead?.extra_data);
    if (idx !== -1) {
      _todayLeads[idx].notes = notes;
      _todayLeads[idx].extra_data = saved?.extra || _todayLeads[idx].extra_data;
    }
    renderLeads();
  } catch (e) {
    console.error('[Etiquetas]', e);
    alert('Não foi possível salvar etiquetas/observações: ' + (e.message || e));
  }
}

window.fillDialNumber = fillDialNumber;
window.toggleLeadTag = toggleLeadTag;
window.addLeadTagFromInput = addLeadTagFromInput;
window.removeLeadTag = removeLeadTag;
window.persistModalLeadMeta = persistModalLeadMeta;

/* ── Lead Modal ── */
function openLeadModal(leadId) {
  _currentLeadId = leadId;
  const lead = _todayLeads.find(l => l.id === leadId);
  if (!lead) return;

  document.getElementById('modalLeadName').textContent = lead.name || 'Lead';
  document.getElementById('modalNotes').value = lead.notes || '';
  _modalTags = _leadTagsList(lead);
  renderModalTags();

  const extra = _leadExtra(lead);
  const extraKeys = Object.keys(extra).filter((k) => !HIDDEN_EXTRA_KEYS.has(k));
  const calls = Array.isArray(extra.calls) ? extra.calls : [];

  // Details
  const details = document.getElementById('modalLeadDetails');
  details.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px;">
      ${_detailItemCall('📞 Telefone 1', lead.phone, lead.id, 'phone')}
      ${_detailItemCall('📞 Telefone 2', lead.phone2, lead.id, 'phone2')}
      ${_detailItem('🏢 Órgão', lead.orgao)}
      ${_detailItem('📄 CPF', lead.cpf ? _maskCPF(lead.cpf) : '')}
      ${_detailItem('⭐ Score', lead.score || extra.score)}
      ${_detailItem('👩 Nome da Mãe', lead.mother_name)}
    </div>
    ${calls.length ? `
      <div style="margin-top:8px;padding:10px 12px;background:var(--color-surface-2);border-radius:var(--radius-sm);">
        <div style="font-size:11px;color:var(--color-text-muted);font-weight:700;text-transform:uppercase;margin-bottom:6px;">Ligações deste lead</div>
        ${calls.slice(0, 8).map((c) =>
          `<div style="font-size:13px;display:flex;justify-content:space-between;gap:8px;padding:2px 0;">
            <span>📞 ${_esc(c.phone || '')}</span>
            <span class="text-muted">${_esc(_fmtCallWhen(c.at))}</span>
          </div>`
        ).join('')}
      </div>
    ` : ''}
    ${extraKeys.length ? `
      <details style="margin-top:8px;">
        <summary style="cursor:pointer;font-size:13px;font-weight:700;color:var(--color-text-secondary);">
          Dados Extras (${extraKeys.length})
        </summary>
        <div style="margin-top:8px;padding:12px;background:var(--color-surface-2);border-radius:var(--radius-sm);font-size:13px;">
          ${extraKeys.map((k) =>
            `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--color-border);">
              <span class="text-muted">${_esc(k)}</span>
              <span style="font-weight:600;">${_esc(_fmtExtraVal(extra[k]))}</span>
            </div>`
          ).join('')}
        </div>
      </details>
    ` : ''}
    <div style="margin-top:12px;">
      <span class="badge badge-${(LeadsDB.LEAD_STATUSES[lead.status] || {}).color || 'muted'}">
        ${(LeadsDB.LEAD_STATUSES[lead.status] || {}).icon || '⏳'} ${(LeadsDB.LEAD_STATUSES[lead.status] || {}).label || lead.status}
      </span>
    </div>
  `;

  document.getElementById('leadModal').classList.add('open');
}

function closeLeadModal() {
  document.getElementById('leadModal').classList.remove('open');
  _currentLeadId = null;
}

async function setLeadStatus(status) {
  if (!_currentLeadId) return;

  const notes = document.getElementById('modalNotes').value.trim();
  const idx = _todayLeads.findIndex(l => l.id === _currentLeadId);
  const lead = idx !== -1 ? _todayLeads[idx] : null;
  const extra = _leadExtra(lead);
  extra.etiquetas = _modalTags.slice();

  try {
    const fresh = await LeadsDB._getLeadExtra(_currentLeadId).catch(() => extra);
    const merged = { ...fresh, ...extra, etiquetas: extra.etiquetas };
    if (Array.isArray(fresh.calls) && !Array.isArray(extra.calls)) merged.calls = fresh.calls;
    await LeadsDB.markLeadAs(_currentLeadId, status, notes, merged);

    if (idx !== -1) {
      _todayLeads[idx].status = status;
      _todayLeads[idx].notes = notes;
      _todayLeads[idx].extra_data = merged;
      if (LeadsDB.isWorkedStatus(status)) {
        _todayLeads[idx].completed_at = new Date().toISOString();
      } else if (status === 'pending') {
        _todayLeads[idx].completed_at = null;
      }
    }

    closeLeadModal();
    _currentFilter = 'all';
    await loadTodayData(); // Refresh counters and cards
    await loadWeekOverview();

  } catch (e) {
    console.error('[SetStatus]', e);
    alert('Erro ao atualizar: ' + e.message);
  }
}

/* ── Week Overview ── */
async function loadWeekOverview() {
  const { week, year } = LeadsDB.getCurrentWeekAndYear();
  const progress = await LeadsDB.getWeekProgress(_userId, week, year);
  const todayStr = LeadsDB.getCurrentDateStr();
  _weekProgress = progress || [];

  const container = document.getElementById('weekOverview');
  container.innerHTML = progress.map(day => {
    const isToday = day.date === todayStr;
    const isPast = new Date(day.date + 'T23:59:59') < new Date() && !isToday;
    let cardClass = '';
    if (isToday) cardClass = 'today';
    else if (isPast && day.completed >= day.target && day.target > 0) cardClass = 'met';
    else if (isPast && day.target > 0) cardClass = 'missed';

    const dayNames = { 'seg': 'SEG', 'ter': 'TER', 'qua': 'QUA', 'qui': 'QUI', 'sex': 'SEX', 'sáb': 'SÁB', 'dom': 'DOM' };
    const shortDay = (day.dayName || '').replace('.', '').toLowerCase();

    return `
      <div class="day-card ${cardClass}">
        <div class="day-name">${dayNames[shortDay] || day.dayName?.toUpperCase() || '—'}</div>
        <div class="day-count">${day.completed}</div>
        <div class="day-target">de ${day.target}</div>
      </div>
    `;
  }).join('');

  renderMetrics();
}

/* ── Helpers ── */
function _esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function _maskCPF(cpf) {
  const c = (cpf || '').replace(/\D/g, '');
  if (c.length !== 11) return cpf;
  return `${c.slice(0,3)}.***.*${c.slice(8,9)}*-${c.slice(9)}`;
}

function _detailItem(label, value) {
  if (!value) return '';
  return `
    <div style="padding:8px 12px;background:var(--color-surface-2);border-radius:var(--radius-sm);">
      <div style="font-size:11px;color:var(--color-text-muted);font-weight:700;text-transform:uppercase;">${label}</div>
      <div style="font-size:14px;font-weight:600;margin-top:2px;">${_esc(value)}</div>
    </div>
  `;
}

function _detailItemCall(label, value, leadId, phoneField) {
  if (!value) return '';
  const safeId = String(leadId || '').replace(/'/g, "\\'");
  const field = phoneField === 'phone2' ? 'phone2' : 'phone';
  return `
    <div style="padding:8px 12px;background:var(--color-surface-2);border-radius:var(--radius-sm);">
      <div style="font-size:11px;color:var(--color-text-muted);font-weight:700;text-transform:uppercase;">${label}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:2px;">
        <div style="font-size:14px;font-weight:600;">${_esc(value)}</div>
        <button type="button" class="btn btn-success btn-sm le-btn-ligar" onclick="callLeadPhone('${safeId}','${field}')">📞 Ligar</button>
      </div>
    </div>
  `;
}

async function callLeadPhone(leadId, phoneField) {
  const lead = (_todayLeads || []).find((l) => l.id === leadId);
  const field = phoneField === 'phone2' ? 'phone2' : 'phone';
  const num = lead ? (lead[field] || lead.phone || '') : '';
  if (!num) {
    alert('Lead sem telefone.');
    return;
  }
  if (!confirm(`Ligar para ${num}?\n\nO MicroSIP deve estar Online.\nA discagem abre no softphone (headset).`)) return;
  try {
    if (typeof showLoading === 'function') showLoading('Abrindo MicroSIP…');
    const r = await LeadsDB.nextBillingClick2Call({ lead_id: leadId, phone_field: field });
    if (typeof showToast === 'function') showToast(r.message || 'Discagem enviada ao MicroSIP.', 'success');
    else alert(r.message || 'Discagem enviada ao MicroSIP.');
    renderDialHistory();
    await _refreshLeadExtra(leadId);
  } catch (e) {
    alert(e.message || 'Falha ao ligar');
  } finally {
    if (typeof hideLoading === 'function') hideLoading();
  }
}

async function callManualNumber() {
  const input = document.getElementById('leDialNumber');
  const num = String(input?.value || '').trim();
  if (!num) {
    alert('Digite o número para ligar/testar.');
    input?.focus();
    return;
  }
  if (!confirm(`Ligar para ${num}?\n\nO MicroSIP deve estar Online.\nA discagem abre no softphone (headset).`)) return;
  const btn = document.getElementById('btnLeDial');
  if (btn) { btn.disabled = true; btn.textContent = 'Ligando…'; }
  try {
    if (typeof showLoading === 'function') showLoading('Abrindo MicroSIP…');
    const r = await LeadsDB.nextBillingClick2Call({ dst: num, lead_id: _currentLeadId || undefined });
    if (typeof showToast === 'function') showToast(r.message || 'Discagem enviada ao MicroSIP.', 'success');
    else alert(r.message || 'Discagem enviada ao MicroSIP.');
    renderDialHistory();
    if (_currentLeadId) await _refreshLeadExtra(_currentLeadId);
  } catch (e) {
    alert(e.message || 'Falha ao ligar');
  } finally {
    if (typeof hideLoading === 'function') hideLoading();
    if (btn) { btn.disabled = false; btn.textContent = '📞 Ligar'; }
  }
}

/* ── Ligar em massa (fila na ordem da lista) ── */
let _massaRunning = false;
let _massaStop = false;
let _massaWaitResolve = null;
const _massaDialedIds = new Set();

/** Mesma ordem da tela: data de atribuição → criação → nome. */
function _sortLeadsDeskOrder(leads) {
  return [...(leads || [])].sort((a, b) => {
    const da = String(a?.assigned_date || '');
    const db = String(b?.assigned_date || '');
    if (da !== db) return da.localeCompare(db);
    const ca = String(a?.created_at || '');
    const cb = String(b?.created_at || '');
    if (ca !== cb) return ca.localeCompare(cb);
    return String(a?.name || '').localeCompare(String(b?.name || ''), 'pt-BR');
  });
}

function _massaMarkDialed(leadId) {
  if (!leadId) return;
  _massaDialedIds.add(String(leadId));
  const el = document.getElementById('lead-' + leadId);
  if (!el) return;
  el.classList.add('le-massa-dialed');
  el.style.background = 'rgba(34, 197, 94, 0.14)';
  el.style.borderColor = '#22c55e';
  el.style.boxShadow = 'inset 4px 0 0 #22c55e';
}

function _massaClearHighlight() {
  document.querySelectorAll('.lead-card.le-massa-active').forEach((el) => {
    el.classList.remove('le-massa-active');
    el.style.outline = '';
    el.style.outlineOffset = '';
  });
}

function _massaHighlightLead(leadId) {
  _massaClearHighlight();
  const el = document.getElementById('lead-' + leadId);
  if (!el) return;
  el.classList.add('le-massa-active');
  el.style.outline = '2px solid #16a34a';
  el.style.outlineOffset = '2px';
  try { el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) { /* ignore */ }
}

function _massaSetUi(running, text, opts = {}) {
  const btn = document.getElementById('btnLigarMassa');
  const stop = document.getElementById('btnPararMassa');
  const next = document.getElementById('btnProximoMassa');
  const skip = document.getElementById('btnPularMassa');
  const st = document.getElementById('massaStatus');
  const showNext = !!(running && opts.showNext);
  if (btn) btn.disabled = !!running;
  if (stop) stop.classList.toggle('d-none', !running);
  if (next) next.classList.toggle('d-none', !showNext);
  if (skip) skip.classList.toggle('d-none', !showNext);
  if (st) {
    st.classList.toggle('d-none', !text);
    st.textContent = text || '';
  }
}

function _massaFinishWait(action) {
  if (typeof _massaWaitResolve !== 'function') return;
  const resolve = _massaWaitResolve;
  _massaWaitResolve = null;
  resolve(action);
}

function pararLigarMassa() {
  _massaStop = true;
  _massaFinishWait('stop');
  _massaSetUi(true, 'Parando a fila…', { showNext: false });
}

function proximoLigarMassa() {
  _massaFinishWait('next');
}

function pularLigarMassa() {
  _massaFinishWait('skip');
}

function _massaWaitUserNext(statusText) {
  return new Promise((resolve) => {
    _massaWaitResolve = resolve;
    _massaSetUi(true, statusText, { showNext: true });
  });
}

async function ligarEmMassa() {
  if (_massaRunning) return;
  // Ordem = mesma da lista na tela (pendentes com telefone)
  const queue = _sortLeadsDeskOrder(_todayLeads || []).filter((l) =>
    !LeadsDB.isWorkedStatus(l.status || 'pending') && (l.phone || l.phone2)
  );
  if (!queue.length) {
    alert('Nenhum lead pendente com telefone para ligar.');
    return;
  }
  if (!confirm(
    `Ligar em massa na ordem da lista (${queue.length} lead(s))?\n\n` +
    `1º: ${queue[0].name || queue[0].phone || '—'}\n` +
    `MicroSIP Online.\nApós cada ligação, clique em Próximo para o seguinte na ordem.`
  )) return;

  _massaRunning = true;
  _massaStop = false;
  let ok = 0;
  let fail = 0;
  let skipped = 0;

  // #region agent log
  fetch('http://127.0.0.1:7585/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'massa-order',hypothesisId:'M1',location:'leads-employee.js:ligarEmMassa',message:'massa start ordered',data:{total:queue.length,first:queue[0]?.name||null,last:queue[queue.length-1]?.name||null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  try {
    for (let i = 0; i < queue.length; i++) {
      if (_massaStop) break;
      const lead = queue[i];
      const field = lead.phone ? 'phone' : 'phone2';
      const num = lead[field] || '';
      const label = `${i + 1}/${queue.length}`;
      _massaHighlightLead(lead.id);
      _massaSetUi(true, `Ordem ${label}: ligando ${lead.name || num}…`, { showNext: false });

      try {
        await LeadsDB.nextBillingClick2Call({ lead_id: lead.id, phone_field: field });
        ok++;
        _massaMarkDialed(lead.id);
        // #region agent log
        fetch('http://127.0.0.1:7585/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'massa-order',hypothesisId:'M2',location:'leads-employee.js:ligarEmMassa:ok',message:'dial ok',data:{i:i+1,total:queue.length,leadId:lead.id,name:lead.name||null},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
      } catch (e) {
        fail++;
        console.warn('[LigarMassa]', lead.id, e);
        // #region agent log
        fetch('http://127.0.0.1:7585/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'massa-order',hypothesisId:'M2',location:'leads-employee.js:ligarEmMassa:fail',message:'dial fail',data:{i:i+1,error:String(e?.message||e).slice(0,160)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
      }

      if (_massaStop || i >= queue.length - 1) break;

      const nextLead = queue[i + 1];
      const action = await _massaWaitUserNext(
        `Ordem ${label} discado (${lead.name || num}). Próximo na ordem: ${nextLead.name || nextLead.phone || '—'} — clique em Próximo.`
      );
      if (action === 'stop') break;
      if (action === 'skip') {
        // Pula o próximo da fila e discagem imediata do seguinte (gesto do clique)
        skipped += 1;
        i += 1;
      }
    }
    const msg = _massaStop
      ? `Interrompido. Ok: ${ok} · Falhas: ${fail}` + (skipped ? ` · Pulados: ${skipped}` : '')
      : `Fila na ordem concluída. Ok: ${ok} · Falhas: ${fail}` + (skipped ? ` · Pulados: ${skipped}` : '');
    _massaSetUi(false, msg, { showNext: false });
    _massaClearHighlight();
    if (typeof showToast === 'function') showToast(msg, fail ? 'warning' : 'success');
    else alert(msg);
  } finally {
    _massaRunning = false;
    _massaStop = false;
    _massaWaitResolve = null;
    _massaClearHighlight();
    _massaSetUi(false, document.getElementById('massaStatus')?.textContent || '', { showNext: false });
    const stop = document.getElementById('btnPararMassa');
    if (stop) stop.classList.add('d-none');
    const btn = document.getElementById('btnLigarMassa');
    if (btn) btn.disabled = false;
  }
}

window.callLeadPhone = callLeadPhone;
window.callManualNumber = callManualNumber;
window.ligarEmMassa = ligarEmMassa;
window.pararLigarMassa = pararLigarMassa;
window.proximoLigarMassa = proximoLigarMassa;
window.pularLigarMassa = pularLigarMassa;

function navigateBack() {
  if (typeof Auth !== 'undefined' && Auth.employeePageHref) {
    window.location.href = Auth.employeePageHref();
  } else {
    window.location.href = '../index.html';
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function _setupResponsive() {
  const toggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  if (!toggle || !sidebar) return;

  const check = () => {
    if (window.innerWidth > 768) {
      sidebar.classList.remove('open');
      sidebar.style.transform = '';
    }
  };
  check();
  window.addEventListener('resize', check);
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    closeLeadModal();
  }
});

// Close modal on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLeadModal();
});
