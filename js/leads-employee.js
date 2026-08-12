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
      <div class="lead-card ${cardClass}" id="lead-${lead.id}">
        <div class="lead-info">
          <div class="lead-name">${_esc(lead.name || 'Sem nome')}</div>
          <div class="lead-details">
            ${lead.phone ? `<span>📞 ${_esc(lead.phone)}</span>` : ''}
            ${lead.phone2 ? `<span>📞 ${_esc(lead.phone2)}</span>` : ''}
            ${lead.orgao ? `<span>🏢 ${_esc(lead.orgao)}</span>` : ''}
            ${lead.cpf ? `<span>📄 ${_maskCPF(lead.cpf)}</span>` : ''}
            ${leadScore ? `<span style="font-weight:800;color:var(--color-primary);">⭐ Score: ${_esc(leadScore)}</span>` : ''}
          </div>
          ${lead.notes ? `<div style="font-size:12px;color:var(--color-text-muted);margin-top:4px;">📝 ${_esc(lead.notes)}</div>` : ''}
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
      ${_detailItemCall('📞 Telefone 1', lead.phone, lead.id, 'phone')}
      ${_detailItemCall('📞 Telefone 2', lead.phone2, lead.id, 'phone2')}
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
    const r = await LeadsDB.nextBillingClick2Call({ dst: num });
    if (typeof showToast === 'function') showToast(r.message || 'Discagem enviada ao MicroSIP.', 'success');
    else alert(r.message || 'Discagem enviada ao MicroSIP.');
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
