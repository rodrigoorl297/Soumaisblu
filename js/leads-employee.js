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
/** Meta diária em memória — contador otimista ao Ligar (antes da resposta do banco). */
let _dailyTarget = 0;

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

    // Show app — esconde loader de verdade (leads.css força display:flex; senão bloqueia cliques)
    _hideGlobalLoader();
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
/** _hideGlobalLoader — tira o overlay inicial da frente (pointer-events + display). */
function _hideGlobalLoader() {
  const loader = document.getElementById('globalLoader');
  if (!loader) return;
  loader.classList.add('is-hidden');
  loader.style.display = 'none';
  loader.style.pointerEvents = 'none';
  loader.setAttribute('aria-hidden', 'true');
}

async function showLockedScreen() {
  _hideGlobalLoader();
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
function _patchLocalLeadStatus(leadId, status, notes = '') {
  const idx = (_todayLeads || []).findIndex((l) => String(l.id) === String(leadId));
  if (idx === -1) return;
  _todayLeads[idx].status = status;
  if (notes) _todayLeads[idx].notes = notes;
  if (LeadsDB.isWorkedStatus(status)) {
    _todayLeads[idx].completed_at = new Date().toISOString();
  } else if (status === 'pending') {
    _todayLeads[idx].completed_at = null;
  }
}

/**
 * _countWorkedTodayLocal — quantos da mesa local contam como feitos hoje.
 */
function _countWorkedTodayLocal() {
  const today = LeadsDB.getCurrentDateStr();
  return (_todayLeads || []).filter((l) => {
    if (!LeadsDB.isWorkedStatus(l.status || 'pending')) return false;
    if (!l.completed_at) return true;
    const d = LeadsDB._normDate(l.completed_at) || LeadsDB._toLocalDateStr(new Date(l.completed_at));
    return d === today;
  }).length;
}

/**
 * _paintCountersNow — pinta 1/51 e Leads (N) na hora (sem esperar API).
 * Leads (N) = pendentes na mesa (não “faltam pra meta”).
 */
function _paintCountersNow(worked, target) {
  const dailyTarget = Math.max(1, Number(target) || _dailyTarget || 1);
  const done = Math.max(0, Number(worked) || 0);
  _dailyTarget = dailyTarget;

  const doneEl = document.getElementById('todayDone');
  const targetEl = document.getElementById('todayTarget');
  const countEl = document.getElementById('leadsCount');
  const progressBar = document.getElementById('todayProgressBar');
  const statusEl = document.getElementById('todayStatus');
  if (doneEl) doneEl.textContent = String(done);
  if (targetEl) targetEl.textContent = String(dailyTarget);
  const pendingOnDesk = (_todayLeads || []).filter((l) => (l.status || 'pending') === 'pending').length;
  if (countEl) countEl.textContent = String(pendingOnDesk);

  const pct = dailyTarget > 0 ? Math.min(100, Math.round((done / dailyTarget) * 100)) : 0;
  if (progressBar) {
    progressBar.style.width = `${pct}%`;
    progressBar.className = `progress-fill ${pct < 50 ? 'danger' : ''}`;
  }
  if (statusEl) {
    if (done >= dailyTarget && dailyTarget > 0) {
      statusEl.className = 'badge badge-success';
      statusEl.textContent = '✅ Meta Batida!';
    } else if (pct >= 75) {
      statusEl.className = 'badge badge-info';
      statusEl.textContent = `${pct}% — Quase lá!`;
    } else {
      statusEl.className = 'badge badge-warning';
      statusEl.textContent = `${pct}% — Faltam ${Math.max(0, dailyTarget - done)}`;
    }
  }
}

async function _refreshTodayCounters() {
  const today = LeadsDB.getCurrentDateStr();
  // Pintura imediata com a mesa local (botão → contador sem atraso)
  _paintCountersNow(_countWorkedTodayLocal(), _dailyTarget || undefined);

  const stats = await LeadsDB.computeEmployeeDailyStats(_userId, today, _todayLeads);
  const dailyTarget = stats.target;
  const worked = stats.worked;
  _dailyTarget = dailyTarget;
  _paintCountersNow(worked, dailyTarget);

  await LeadsDB.upsertDailyProgress(_userId, today, dailyTarget, worked);
}

/**
 * _markDialedLead — marca pendente como nao_atende e sobe contagem na hora do clique.
 */
async function _markDialedLead(leadId) {
  if (!leadId) return;
  const lead = _findLead(leadId);
  if (!lead || (lead.status || 'pending') !== 'pending') return;
  // Otimista: UI sobe antes do PATCH (contagem acompanha o botão)
  _patchLocalLeadStatus(lead.id, 'nao_atende', 'Discagem registrada');
  _paintCountersNow(_countWorkedTodayLocal(), _dailyTarget);
  renderLeads();
  try {
    await LeadsDB.markLeadTouchedOnCall(lead.id);
    await _refreshTodayCounters();
  } catch (e) {
    console.warn('[leads] mark on dial', leadId, e);
    // Mantém UI otimista; próximo loadTodayData reconcilia
  }
}

async function loadTodayData() {
  const today = LeadsDB.getCurrentDateStr();

  // Mesa: leads de hoje + pendentes atrasados (com fallback se semana estiver inconsistente)
  _todayLeads = _sortLeadsDeskOrder(
    await LeadsDB.getEmployeeTodayLeads(_userId, today)
  );

  document.getElementById('todayDate').textContent = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  await _refreshTodayCounters();

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
    const safeId = _escAttr(lead.id);

    const leadScore = lead.score || lead.extra_data?.score;
    const phone2 = _leadPhone2(lead);
    return `
      <div class="lead-card ${cardClass}" id="lead-${safeId}">
        <div class="lead-info">
          <div class="lead-name">${_esc(lead.name || 'Sem nome')}</div>
          <div class="lead-details">
            ${lead.phone ? `<span>📞 ${_esc(lead.phone)} <button type="button" class="btn btn-success btn-sm le-btn-ligar" data-le-action="call" data-lead-id="${safeId}" data-phone-field="phone" title="Ligar para este número">Ligar</button></span>` : ''}
            ${phone2 ? `<span>📞 ${_esc(phone2)} <button type="button" class="btn btn-success btn-sm le-btn-ligar" data-le-action="call" data-lead-id="${safeId}" data-phone-field="phone2" title="Ligar para este número">Ligar</button></span>` : ''}
            ${lead.orgao ? `<span>🏢 ${_esc(lead.orgao)}</span>` : ''}
            ${lead.cpf ? `<span>📄 ${_maskCPF(lead.cpf)}</span>` : ''}
            ${leadScore ? `<span style="font-weight:800;color:var(--color-primary);">⭐ Score: ${_esc(leadScore)}</span>` : ''}
          </div>
          ${lead.notes ? `<div style="font-size:12px;color:var(--color-text-muted);margin-top:4px;">📝 ${_esc(lead.notes)}</div>` : ''}
        </div>
        <div class="lead-actions">
          ${isWorked
            ? `<span class="badge badge-${statusInfo.color}">${statusInfo.icon} ${statusInfo.label}</span>
               <button type="button" class="btn btn-outline-secondary btn-sm" data-le-action="open" data-lead-id="${safeId}" title="Editar">✏️</button>`
            : `<button type="button" class="btn btn-primary btn-sm" data-le-action="open" data-lead-id="${safeId}">Atender</button>`
          }
        </div>
      </div>
    `;
  }).join('');

  _bindLeadCardButtons(grid);
}

/**
 * _bindLeadCardButtons — amarra Ligar/Atender direto no botão após o innerHTML.
 * Reforço além da delegação (capture), para o clique nunca “morrer”.
 */
function _bindLeadCardButtons(grid) {
  if (!grid) return;
  grid.querySelectorAll('[data-le-action]').forEach((btn) => {
    if (btn.dataset.leBound === '1') return;
    btn.dataset.leBound = '1';
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const action = btn.getAttribute('data-le-action');
      const leadId = btn.getAttribute('data-lead-id') || '';
      const phoneField = btn.getAttribute('data-phone-field') || 'phone';
      if (action === 'call') callLeadPhone(leadId, phoneField);
      else if (action === 'open') openLeadModal(leadId);
    });
  });
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

/* ── Lead Modal ── */
/**
 * openLeadModal — abre ficha do lead na mesa.
 * Usa String(id) e força estilo no overlay (Bootstrap .modal escondia o diálogo).
 */
function openLeadModal(leadId) {
  const lead = _findLead(leadId);
  if (!lead) {
    alert('Lead não encontrado na mesa. Recarregue a página (Ctrl+Shift+R).');
    return;
  }
  _currentLeadId = String(lead.id);

  document.getElementById('modalLeadName').textContent = lead.name || 'Lead';
  document.getElementById('modalNotes').value = lead.notes || '';

  // Details
  const details = document.getElementById('modalLeadDetails');
  details.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px;">
      ${_detailItemCall('📞 Telefone 1', lead.phone, lead.id, 'phone')}
      ${_detailItemCall('📞 Telefone 2', _leadPhone2(lead), lead.id, 'phone2')}
      ${_detailItem('🏢 Órgão', lead.orgao)}
      ${_detailItem('📄 CPF', lead.cpf ? _maskCPF(lead.cpf) : '')}
      ${_detailItem('⭐ Score', lead.score || lead.extra_data?.score)}
      ${_detailItem('👩 Nome da Mãe', lead.mother_name)}
    </div>
    ${Object.keys(lead.extra_data || {}).length ? `
      <details style="margin-top:8px;">
        <summary style="cursor:pointer;font-size:13px;font-weight:700;color:var(--color-text-secondary);">
          Dados Extras (${Object.keys(lead.extra_data).length})
        </summary>
        <div style="margin-top:8px;padding:12px;background:var(--color-surface-2);border-radius:var(--radius-sm);font-size:13px;">
          ${Object.entries(lead.extra_data).map(([k, v]) =>
            `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--color-border);">
              <span class="text-muted">${_esc(k)}</span>
              <span style="font-weight:600;">${_esc(String(v))}</span>
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

  const modal = document.getElementById('leadModal');
  if (!modal) return;
  modal.classList.add('open');
  modal.style.display = 'flex';
  modal.style.opacity = '1';
  modal.style.visibility = 'visible';
  modal.style.pointerEvents = 'auto';
}

function closeLeadModal() {
  const modal = document.getElementById('leadModal');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = '';
    modal.style.opacity = '';
    modal.style.visibility = '';
    modal.style.pointerEvents = '';
  }
  _currentLeadId = null;
}

async function setLeadStatus(status) {
  if (!_currentLeadId) return;

  const notes = document.getElementById('modalNotes').value.trim();
  const leadId = String(_currentLeadId);

  try {
    await LeadsDB.markLeadAs(leadId, status, notes);

    // Update local state
    const idx = _todayLeads.findIndex(l => String(l.id) === leadId);
    if (idx !== -1) {
      _todayLeads[idx].status = status;
      _todayLeads[idx].notes = notes;
      if (LeadsDB.isWorkedStatus(status)) {
        _todayLeads[idx].completed_at = new Date().toISOString();
      }
    }

    closeLeadModal();
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
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** _escAttr — valor seguro em atributo HTML (data-lead-id etc.). */
function _escAttr(str) {
  return _esc(str).replace(/'/g, '&#39;');
}

/** _findLead — localiza lead na mesa por id (sempre compara como string). */
function _findLead(leadId) {
  const id = String(leadId || '');
  return (_todayLeads || []).find((l) => String(l.id) === id) || null;
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
  const safeId = _escAttr(leadId);
  const field = phoneField === 'phone2' ? 'phone2' : 'phone';
  return `
    <div style="padding:8px 12px;background:var(--color-surface-2);border-radius:var(--radius-sm);">
      <div style="font-size:11px;color:var(--color-text-muted);font-weight:700;text-transform:uppercase;">${label}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:2px;">
        <div style="font-size:14px;font-weight:600;">${_esc(value)}</div>
        <button type="button" class="btn btn-success btn-sm le-btn-ligar" data-le-action="call" data-lead-id="${safeId}" data-phone-field="${field}">📞 Ligar</button>
      </div>
    </div>
  `;
}

function _leadPhone2(lead) {
  if (!lead) return '';
  const extra = lead.extra_data && typeof lead.extra_data === 'object' ? lead.extra_data : {};
  return String(lead.phone2 || extra.phone2 || '').trim();
}

async function _guardSellerClick2Call() {
  const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
  let mode = 'softphone';
  try {
    // Timeout evita botão Ligar “travado” se o status demorar
    const st = await Promise.race([
      LeadsDB.nextBillingStatus(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
    ]);
    mode = st?.call_mode || 'softphone';
  } catch (_) { /* assume softphone */ }
  if (mode === 'softphone') return true;
  const ok = typeof LeadsDB.normalizeBrPhone === 'function'
    ? LeadsDB.normalizeBrPhone(session?.phone || '')
    : String(session?.phone || '').replace(/\D/g, '');
  if (!ok || String(ok).length < 10) {
    alert('Cadastre seu telefone no perfil para usar o Click2Call.');
    return false;
  }
  return true;
}

async function callLeadPhone(leadId, phoneField) {
  const lead = _findLead(leadId);
  const field = phoneField === 'phone2' ? 'phone2' : 'phone';
  const num = lead ? (field === 'phone2' ? (_leadPhone2(lead) || lead.phone) : (lead.phone || _leadPhone2(lead))) : '';
  if (!num) {
    alert('Lead sem telefone.');
    return;
  }
  if (typeof LeadsDB.normalizeBrPhone === 'function' && !LeadsDB.normalizeBrPhone(num)) {
    alert('Lead sem telefone válido (DDD + número).');
    return;
  }
  if (!(await _guardSellerClick2Call())) return;
  if (!confirm(`Ligar para ${num}?\n\nO MicroSIP vai discar este número na conta blu-209.`)) return;
  try {
    if (typeof LeadsDB.openSoftphoneDialNow === 'function') LeadsDB.openSoftphoneDialNow(num);
    if (typeof showLoading === 'function') showLoading('Abrindo o MicroSIP…');
    // Conta já na discagem — não espera o click2call (senão o contador não sobe e o lead “volta”).
    await _markDialedLead(lead?.id || leadId);
    const r = await LeadsDB.nextBillingClick2Call({ lead_id: lead?.id || leadId, phone_field: field });
    const msg = r.message || 'MicroSIP discando o número na conta registrada.';
    if (typeof showToast === 'function') showToast(msg, 'success');
    else alert(msg);
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
  if (typeof LeadsDB.normalizeBrPhone === 'function' && !LeadsDB.normalizeBrPhone(num)) {
    alert('Informe o destino com DDD (ex.: 62999999999).');
    input?.focus();
    return;
  }
  if (!(await _guardSellerClick2Call())) return;
  if (!confirm(`Ligar para ${num}?\n\nO MicroSIP vai discar este número na conta blu-209.`)) return;
  const btn = document.getElementById('btnLeDial');
  if (btn) { btn.disabled = true; btn.textContent = 'Ligando…'; }
  try {
    if (typeof LeadsDB.openSoftphoneDialNow === 'function') LeadsDB.openSoftphoneDialNow(num);
    if (typeof showLoading === 'function') showLoading('Abrindo o MicroSIP…');
    const r = await LeadsDB.nextBillingClick2Call({ dst: num });
    const msg = r.message || 'MicroSIP discando o número na conta registrada.';
    if (typeof showToast === 'function') showToast(msg, 'success');
    else alert(msg);
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
let _massaDialAt = 0;
let _massaLastAutoAt = 0;
let _massaTick = 0;
let _massaInCall = false;
let _massaWasFocused = true;
let _massaStatusBase = '';
let _massaQueue = [];
let _massaIndex = -1;
let _massaPreDialedId = '';
let _massaOk = 0;
let _massaFail = 0;

const _MASSA_SKIP_SIP_BOUNCE_MS = 3000;
const _MASSA_NO_ANSWER_MS = 9000;

function _massaClearTick() {
  if (_massaTick) {
    clearInterval(_massaTick);
    _massaTick = 0;
  }
}

function _massaCanAdvance() {
  if (!_massaRunning || typeof _massaWaitResolve !== 'function') return false;
  if (Date.now() - (_massaLastAutoAt || 0) < 800) return false;
  return Date.now() - (_massaDialAt || 0) >= _MASSA_SKIP_SIP_BOUNCE_MS;
}

function _massaHasGesture() {
  try {
    return !!(navigator.userActivation && navigator.userActivation.isActive);
  } catch (_) {
    return false;
  }
}

function _massaDialLead(lead, opts = {}) {
  if (!lead) return;
  const n = lead.phone || _leadPhone2(lead) || '';
  const field = lead.phone ? 'phone' : 'phone2';
  const originate = opts.forceOriginate === true;
  if (typeof LeadsDB.openSoftphoneDialNow === 'function') {
    LeadsDB.openSoftphoneDialNow(n);
  }
  // Marca na hora (antes do click2call) para a contagem subir e o lead não “voltar”.
  void _markDialedLead(lead.id);
  LeadsDB.nextBillingClick2Call({
    lead_id: lead.id,
    phone_field: field,
    originate: originate ? 1 : 0,
  }).then(() => {
    _massaOk += 1;
  })
    .catch((e) => { _massaFail += 1; console.warn('[LigarMassa]', lead.id, e); });
  _massaPreDialedId = String(lead.id || '');
}

/**
 * _massaCompleteCurrentLead — marca lead atual como não atende ao pular/timeout (não atendeu).
 * Se o vendedor clicou em Em ligação, não marca — ele classifica no Atender.
 */
async function _massaCompleteCurrentLead(markAsNoAnswer) {
  if (!markAsNoAnswer) return;
  const lead = _massaQueue[_massaIndex];
  if (!lead || (lead.status || 'pending') !== 'pending') return;
  await _markDialedLead(lead.id);
}

function _massaGoNext() {
  if (!_massaCanAdvance()) return false;
  _massaLastAutoAt = Date.now();
  const next = _massaQueue[_massaIndex + 1];
  if (next) _massaDialLead(next, { forceOriginate: !_massaHasGesture() });
  if (!_massaInCall) _massaCompleteCurrentLead(true);
  _massaInCall = false;
  proximoLigarMassa(true);
  return true;
}

function _massaOnReturnedToCrm() {
  if (!_massaCanAdvance()) return;
  if (_massaInCall || Date.now() - (_massaDialAt || 0) >= 6000) {
    _massaGoNext();
  }
}

function _massaPaintStatus() {
  const st = document.getElementById('massaStatus');
  if (!st || !_massaRunning) return;
  const elapsed = Date.now() - (_massaDialAt || 0);
  if (_massaInCall) {
    st.textContent = _massaStatusBase + ' Em ligação — ao encerrar, o próximo liga sozinho (ou clique em Próximo).';
    return;
  }
  const left = Math.max(0, Math.ceil((_MASSA_NO_ANSWER_MS - elapsed) / 1000));
  st.textContent = _massaStatusBase + (left > 0
    ? ` Sem atendimento: próximo em ${left}s. Atendeu? clique em Em ligação.`
    : ' Passando para o próximo…');
}

function _massaOnTick() {
  if (!_massaRunning || typeof _massaWaitResolve !== 'function') return;
  const focused = document.hasFocus();
  const elapsed = Date.now() - (_massaDialAt || 0);
  if (!focused) _massaWasFocused = false;
  else if (!_massaWasFocused && elapsed >= _MASSA_SKIP_SIP_BOUNCE_MS) {
    _massaWasFocused = true;
    _massaOnReturnedToCrm();
    return;
  } else {
    _massaWasFocused = true;
  }
  if (!_massaInCall && elapsed >= _MASSA_NO_ANSWER_MS) {
    _massaGoNext();
    return;
  }
  _massaPaintStatus();
}

window.addEventListener('focus', () => {
  if (_massaRunning) _massaOnReturnedToCrm();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && _massaRunning) _massaOnReturnedToCrm();
});

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
  const hold = document.getElementById('btnEmLigacaoMassa');
  const st = document.getElementById('massaStatus');
  const showNext = !!(running && opts.showNext);
  if (btn) btn.disabled = !!running;
  if (stop) stop.classList.toggle('d-none', !running);
  if (next) next.classList.toggle('d-none', !showNext);
  if (skip) skip.classList.toggle('d-none', !showNext);
  if (hold) hold.classList.toggle('d-none', !(showNext && opts.showHold));
  if (st) {
    st.classList.toggle('d-none', !text);
    st.textContent = text || '';
  }
}

function _massaFinishWait(action) {
  if (typeof _massaWaitResolve !== 'function') return;
  _massaClearTick();
  const resolve = _massaWaitResolve;
  _massaWaitResolve = null;
  resolve(action);
}

function pararLigarMassa() {
  _massaStop = true;
  _massaFinishWait('stop');
  _massaSetUi(true, 'Parando a fila…', { showNext: false });
}

function proximoLigarMassa(alreadyDialed) {
  if (alreadyDialed !== true) {
    const next = _massaQueue[_massaIndex + 1];
    if (next) _massaDialLead(next, { forceOriginate: !_massaHasGesture() });
    if (!_massaInCall) _massaCompleteCurrentLead(true);
  }
  _massaInCall = false;
  _massaFinishWait('next');
}

function emLigacaoMassa() {
  if (!_massaRunning || typeof _massaWaitResolve !== 'function') return;
  _massaInCall = true;
  const hold = document.getElementById('btnEmLigacaoMassa');
  if (hold) hold.classList.add('d-none');
  _massaPaintStatus();
}

document.addEventListener('keydown', (e) => {
  if (!_massaRunning || typeof _massaWaitResolve !== 'function') return;
  const tag = String(e.target && e.target.tagName || '');
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.key === 'Enter') {
    e.preventDefault();
    proximoLigarMassa();
  }
});

function pularLigarMassa() {
  _massaCompleteCurrentLead(true);
  _massaInCall = false;
  _massaFinishWait('skip');
}

function _massaWaitUserNext(statusText) {
  return new Promise((resolve) => {
    _massaWaitResolve = resolve;
    _massaStatusBase = statusText;
    _massaSetUi(true, statusText, { showNext: true, showHold: true });
  });
}

async function ligarEmMassa() {
  if (_massaRunning) return;
  // Ordem = mesma da lista na tela (pendentes com telefone)
  const queue = _sortLeadsDeskOrder(_todayLeads || []).filter((l) =>
    !LeadsDB.isWorkedStatus(l.status || 'pending') && (l.phone || _leadPhone2(l))
  );
  if (!queue.length) {
    alert('Nenhum lead pendente com telefone para ligar.');
    return;
  }
  if (!confirm(
    `Ligar em massa na ordem da lista (${queue.length} lead(s))?\n\n` +
    `1º: ${queue[0].name || queue[0].phone || '—'}\n` +
    `Não atendeu: em 9s o próximo já liga. Atendeu? clique em Em ligação.`
  )) return;

  _massaQueue = queue;
  _massaIndex = -1;
  _massaPreDialedId = '';
  _massaOk = 0;
  _massaFail = 0;
  _massaDialLead(queue[0], { forceOriginate: false });

  if (!(await _guardSellerClick2Call())) return;

  _massaRunning = true;
  _massaStop = false;
  let skipped = 0;

  try {
    for (let i = 0; i < queue.length; i++) {
      if (_massaStop) break;
      const lead = queue[i];
      const field = lead.phone ? 'phone' : 'phone2';
      const num = lead[field] || '';
      const label = `${i + 1}/${queue.length}`;
      const hasNext = i < queue.length - 1;
      const n = lead.phone || _leadPhone2(lead) || num;
      _massaIndex = i;
      _massaHighlightLead(lead.id);

      const waiter = hasNext
        ? _massaWaitUserNext(`Ordem ${label}: ligando ${lead.name || n}.`)
        : null;
      if (!waiter) {
        _massaSetUi(true, `Ordem ${label}: ${lead.name || n}. Último da fila.`, { showNext: false });
      }

      _massaDialAt = Date.now();
      _massaInCall = false;
      _massaWasFocused = document.hasFocus();
      if (waiter) {
        _massaClearTick();
        _massaTick = setInterval(_massaOnTick, 400);
        _massaPaintStatus();
      }

      try {
        if (String(lead.id) !== String(_massaPreDialedId)) {
          _massaDialLead(lead, { forceOriginate: i > 0 });
        }
      } catch (e) {
        _massaFail += 1;
        console.warn('[LigarMassa]', lead.id, e);
      }

      if (!waiter) break;
      const action = await waiter;
      _massaClearTick();
      if (action === 'stop') break;
      if (action === 'skip') {
        skipped += 1;
        i += 1;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    const msg = _massaStop
      ? `Interrompido. Ok: ${_massaOk} · Falhas: ${_massaFail}` + (skipped ? ` · Pulados: ${skipped}` : '')
      : `Fila na ordem concluída. Ok: ${_massaOk} · Falhas: ${_massaFail}` + (skipped ? ` · Pulados: ${skipped}` : '');
    _massaSetUi(false, msg, { showNext: false });
    _massaClearHighlight();
    if (typeof showToast === 'function') showToast(msg, _massaFail ? 'warning' : 'success');
    else alert(msg);
  } finally {
    _massaRunning = false;
    _massaStop = false;
    _massaWaitResolve = null;
    _massaDialAt = 0;
    _massaInCall = false;
    _massaClearTick();
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
window.emLigacaoMassa = emLigacaoMassa;
window.openLeadModal = openLeadModal;
window.closeLeadModal = closeLeadModal;
window.setLeadStatus = setLeadStatus;
window.filterLeads = filterLeads;
window.navigateBack = navigateBack;
window.toggleSidebar = toggleSidebar;

/**
 * _onLeadsUiClick — cliques Ligar/Atender/filtros via data-le-action (capture).
 * Não depende só de onclick inline (mesmo padrão que corrigiu Gestão de Propostas).
 */
function _onLeadsUiClick(e) {
  const btn = e.target && e.target.closest ? e.target.closest('[data-le-action]') : null;
  if (!btn || !document.body.contains(btn)) return;
  const action = btn.getAttribute('data-le-action');
  if (!action) return;
  const leadId = btn.getAttribute('data-lead-id') || '';
  const phoneField = btn.getAttribute('data-phone-field') || 'phone';
  const filter = btn.getAttribute('data-filter') || '';
  e.preventDefault();
  e.stopPropagation();
  if (action === 'call') {
    callLeadPhone(leadId, phoneField);
    return;
  }
  if (action === 'open') {
    openLeadModal(leadId);
    return;
  }
  if (action === 'filter') {
    filterLeads(filter);
    return;
  }
  if (action === 'dial-manual') {
    callManualNumber();
    return;
  }
  if (action === 'mass-start') {
    ligarEmMassa();
    return;
  }
}

document.addEventListener('click', _onLeadsUiClick, true);

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
