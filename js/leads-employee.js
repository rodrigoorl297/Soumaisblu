/* =============================================
   Gerenciador de Leads – Employee Controller
   Interface do funcionário (Atendimento de Leads)
   ============================================= */

/* ── State ── */
let _userId = null;
let _todayLeads = [];
let _currentLeadId = null;
let _currentFilter = 'all';

/* ── Init ── */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (typeof DB === 'undefined' || !DB.init) {
      await _waitForDB();
    }
    await DB.init();

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
      document.getElementById('topbarUserName').textContent = session?.name || 'Funcionário';
      document.getElementById('topbarAvatar').textContent = (session?.name || '?')[0].toUpperCase();
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

    // Show app
    document.getElementById('globalLoader').style.display = 'none';
    document.getElementById('appLayout').style.display = 'flex';

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
  document.getElementById('appLayout').style.display = 'none';
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
  const { week, year } = LeadsDB.getCurrentWeekAndYear();
  
  // Buscar todos os leads da semana para este usuário
  const weekLeads = await LeadsDB.getLeadsByUserAndWeek(_userId, week, year);
  
  // Considerar como "Leads de Hoje": 
  // 1. Leads designados para hoje
  // 2. Leads pendentes do passado
  // 3. Leads do passado que foram concluídos HOJE
  _todayLeads = weekLeads.filter(l => {
    if (l.assigned_date === today) return true;
    if (l.assigned_date < today && !LeadsDB.isWorkedStatus(l.status)) return true;
    if (l.assigned_date < today && LeadsDB.isWorkedStatus(l.status) && l.completed_at && l.completed_at.startsWith(today)) return true;
    return false;
  });

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

  // Render leads
  renderLeads();
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

  // Update filter buttons
  document.querySelectorAll('[id^="filter"]').forEach(btn => btn.classList.remove('btn-accent'));
  const activeFilter = document.getElementById(`filter${_currentFilter.charAt(0).toUpperCase() + _currentFilter.slice(1)}`);
  if (activeFilter) {
    activeFilter.classList.remove('btn-ghost');
    activeFilter.classList.add('btn-accent');
  }

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
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(lead => {
    const statusInfo = LeadsDB.LEAD_STATUSES[lead.status] || LeadsDB.LEAD_STATUSES.pending;
    const isWorked = LeadsDB.isWorkedStatus(lead.status);
    const cardClass = isWorked ? (lead.status === 'venda_fechada' ? 'completed' : lead.status === 'sem_interesse' ? 'failed' : 'no-answer') : '';

    return `
      <div class="lead-card ${cardClass}" id="lead-${lead.id}">
        <div class="lead-info">
          <div class="lead-name">${_esc(lead.name || 'Sem nome')}</div>
          <div class="lead-details">
            ${lead.phone ? `<span>📞 ${_esc(lead.phone)}</span>` : ''}
            ${lead.phone2 ? `<span>📞 ${_esc(lead.phone2)}</span>` : ''}
            ${lead.orgao ? `<span>🏢 ${_esc(lead.orgao)}</span>` : ''}
            ${lead.cpf ? `<span>📄 ${_maskCPF(lead.cpf)}</span>` : ''}
          </div>
          ${lead.notes ? `<div style="font-size:12px;color:var(--color-text-muted);margin-top:4px;">📝 ${_esc(lead.notes)}</div>` : ''}
        </div>
        <div class="lead-actions">
          ${isWorked
            ? `<span class="badge badge-${statusInfo.color}">${statusInfo.icon} ${statusInfo.label}</span>
               <button class="btn btn-ghost btn-sm" onclick="openLeadModal('${lead.id}')" title="Editar">✏️</button>`
            : `<button class="btn btn-accent btn-sm" onclick="openLeadModal('${lead.id}')">Atender</button>`
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

/* ── Lead Modal ── */
function openLeadModal(leadId) {
  _currentLeadId = leadId;
  const lead = _todayLeads.find(l => l.id === leadId);
  if (!lead) return;

  document.getElementById('modalLeadName').textContent = lead.name || 'Lead';
  document.getElementById('modalNotes').value = lead.notes || '';

  // Details
  const details = document.getElementById('modalLeadDetails');
  details.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px;">
      ${_detailItem('📞 Telefone 1', lead.phone)}
      ${_detailItem('📞 Telefone 2', lead.phone2)}
      ${_detailItem('🏢 Órgão', lead.orgao)}
      ${_detailItem('📄 CPF', lead.cpf ? _maskCPF(lead.cpf) : '')}
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

  document.getElementById('leadModal').classList.add('open');
}

function closeLeadModal() {
  document.getElementById('leadModal').classList.remove('open');
  _currentLeadId = null;
}

async function setLeadStatus(status) {
  if (!_currentLeadId) return;

  const notes = document.getElementById('modalNotes').value.trim();

  try {
    await LeadsDB.markLeadAs(_currentLeadId, status, notes);

    // Update local state
    const idx = _todayLeads.findIndex(l => l.id === _currentLeadId);
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
  const check = () => {
    if (window.innerWidth <= 768) {
      toggle.style.display = 'block';
      document.querySelector('.main-content').style.marginLeft = '0';
      document.getElementById('sidebar').style.width = '68px';
      document.getElementById('sidebar').style.transform = 'translateX(-100%)';
    } else {
      toggle.style.display = 'none';
      document.querySelector('.main-content').style.marginLeft = '68px';
      document.getElementById('sidebar').style.transform = '';
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
