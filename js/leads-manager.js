/* =============================================
   Gerenciador de Leads – Manager Controller
   Lógica da interface do gerente
   ============================================= */

/* ── State ── */
let _currentBatch = null;
let _parsedFile = null;
let _columnMapping = {};
let _transformedLeads = [];
let _selectedEmployees = new Set();
let _allEmployeesChecked = false;

/* ── Init ── */
document.addEventListener('DOMContentLoaded', async () => {
  // #region agent log
  try {
    const navDist = Array.from(document.querySelectorAll('.nav-item')).map(el => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter(t => /Distrib|Funcion|Upload/i.test(t)).slice(0, 5);
    const uploadH3 = document.querySelector('#tab-upload h3')?.textContent || '';
    const uploadP = document.querySelector('#tab-upload p.text-muted')?.textContent || '';
    const moji = /Ã§|Ã£|Ã©|Ã¡|ðŸ|Â·|Â-/.test(navDist.join('|') + uploadH3 + uploadP);
    const good = /Distribuição|Funcionários|até/.test(navDist.join('|') + uploadH3 + uploadP);
    fetch('http://127.0.0.1:7585/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'post-fix',hypothesisId:'A',location:'leads-manager.js:DOMContentLoaded',message:'encoding probe DOM',data:{characterSet:document.characterSet,contentType:document.contentType||null,moji,good,navDist,uploadH3:uploadH3.slice(0,80),uploadPSnippet:uploadP.replace(/\s+/g,' ').trim().slice(0,120),title:document.title},timestamp:Date.now()})}).catch(()=>{});
  } catch (_) {}
  // #endregion
  try {
    // Wait for DB
    if (typeof DB === 'undefined' || !DB.init) {
      await _waitFor(() => typeof DB !== 'undefined' && DB.init, 50, 60);
    }
    await DB.init();

    // Check auth
    if (typeof Auth !== 'undefined') {
      const loggedIn = await Auth.isLoggedIn();
      if (!loggedIn) {
        window.location.replace(Auth.loginPageHref ? Auth.loginPageHref() : '../index.html');
        return;
      }
      await Auth.syncSessionFromDb();
      const session = Auth.getSession();
      if (session) {
        const role = String(session.role || '').toLowerCase();
        const canManage = ['master', 'fundador', 'supervisor', 'gerente', 'gerencia', 'admin', 'desenvolvedor',
          'financeiro', 'financial', 'rh', 'diretoria', 'sup_backoffice'].includes(role);
        if (!canManage) {
          window.location.replace(typeof Auth.employeePageHref === 'function' ? Auth.employeePageHref() : '../pages/employee.html');
          return;
        }
        _updateUserUI(session);
      }
    }

    // Load batches
    await loadBatches();

    // Load unlock badge
    await updateUnlockBadge();

    // Setup upload zone drag/drop
    _setupUploadZone();

    // Setup responsive menu toggle
    _setupResponsive();

    // Show app
    document.getElementById('globalLoader').style.display = 'none';
    document.getElementById('appLayout').style.display = 'flex';

  } catch (e) {
    console.error('[LeadsManager] Init error:', e);
    document.querySelector('.loader-text').textContent = 'Erro ao carregar. Recarregue a página.';
  }
});

function _waitFor(condFn, interval = 100, maxAttempts = 50) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = setInterval(() => {
      if (condFn()) { clearInterval(check); resolve(); }
      else if (++attempts > maxAttempts) { clearInterval(check); reject(new Error('Timeout')); }
    }, interval);
  });
}

/* ── User UI ── */
function _updateUserUI(session) {
  const nameEl = document.getElementById('userName');
  const roleEl = document.getElementById('userRole');
  const avatarEl = document.getElementById('userAvatar');
  if (nameEl) nameEl.textContent = session.name || 'Usuário';
  if (roleEl) roleEl.textContent = session.role || 'Gerente';
  if (avatarEl) avatarEl.textContent = (session.name || '?')[0].toUpperCase();
  const telBtn = document.getElementById('btnLeadsTelefonia');
  if (telBtn) telBtn.style.display = _canEditTelefonia(session) ? '' : 'none';
}

function _canEditTelefonia(session) {
  const role = String(session?.role || '').toLowerCase();
  return ['master', 'fundador', 'gerente', 'gerencia', 'desenvolvedor', 'admin'].includes(role);
}

/* ── Navigation ── */
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item[data-tab]').forEach(n => n.classList.remove('active'));

  const tab = document.getElementById(`tab-${tabId}`);
  const nav = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (tab) tab.classList.add('active');
  if (nav) nav.classList.add('active');

  const titleMap = {
    dashboard: 'Dashboard',
    upload: 'Upload de Planilha',
    distribute: 'Distribuição de Leads',
    employees: 'Funcionários',
    unlock: 'Desbloqueios',
  };
  document.getElementById('pageTitle').textContent = titleMap[tabId] || tabId;

  // Load tab-specific data
  if (tabId === 'dashboard' && _currentBatch) loadDashboard();
  if (tabId === 'distribute' && _currentBatch) loadDistributeTab();
  if (tabId === 'employees' && _currentBatch) loadEmployeesTab();
  if (tabId === 'unlock') loadUnlockRequests();

  if (!_currentBatch) {
    if (tabId === 'dashboard') resetDashboard();
    if (tabId === 'distribute') {
      const el = document.getElementById('distributeContainer');
      if (el) el.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg></div><h3>Selecione um lote</h3><p>Selecione um lote no menu superior para distribuir.</p></div>';
    }
    if (tabId === 'employees') {
      const tbody = document.querySelector('#employeesTable tbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:32px;">Selecione um lote</td></tr>';
    }
  }
}

function navigateBack() {
  if (typeof Auth !== 'undefined' && Auth.adminPageHref) {
    window.location.href = Auth.adminPageHref();
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
    } else {
      toggle.style.display = 'none';
      document.getElementById('sidebar').classList.remove('open');
    }
  };
  check();
  window.addEventListener('resize', check);
}

/* ── Batches ── */
async function loadBatches() {
  try {
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    const isMasterOrManager = session && ['master', 'fundador', 'desenvolvedor', 'gerente', 'gerencia', 'supervisor', 'diretoria', 'financial', 'rh', 'sup_backoffice'].includes(session.role);
    const managerFilterId = isMasterOrManager ? null : session?.id;
    const batches = await LeadsDB.getBatches(managerFilterId);
    const select = document.getElementById('batchSelect');

    select.innerHTML = '<option value="">Selecione um lote...</option>';
    batches.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = `${b.name} (${b.total_records.toLocaleString('pt-BR')} leads)`;
      select.appendChild(opt);
    });

    select.onchange = async () => {
      const batchId = select.value;
      if (batchId) {
        _currentBatch = await LeadsDB.getBatch(batchId);
      } else {
        _currentBatch = null;
      }
      
      const activeTab = document.querySelector('.nav-item.active[data-tab]');
      if (activeTab) {
        switchTab(activeTab.dataset.tab);
      } else {
        resetDashboard();
      }
    };
  } catch (e) {
    console.error('[Batches] Load error:', e);
  }
}

/* ── Dashboard ── */
async function loadDashboard() {
  if (!_currentBatch) return;
  try {
    const counts = await LeadsDB.countLeadsByStatus(_currentBatch.id);
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    const isMasterOrManager = session && ['master', 'fundador', 'desenvolvedor', 'gerente', 'gerencia', 'supervisor', 'diretoria', 'financial', 'rh', 'sup_backoffice'].includes(session.role);

    let stats = await LeadsDB.getEmployeeStats(_currentBatch.id);
    
    // Filter stats to show team members
    if (!isMasterOrManager && session) {
      stats = stats.filter(s => s.user.admin_id === session.id || s.user.id === session.id);
    }

    document.getElementById('statTotalLeads').textContent = counts.total.toLocaleString('pt-BR');
    document.getElementById('statCompleted').textContent = counts.worked.toLocaleString('pt-BR');
    document.getElementById('statPending').textContent = counts.pending.toLocaleString('pt-BR');
    document.getElementById('statLocked').textContent = stats.filter(s => s.isLocked).length;
    document.getElementById('statEmployees').textContent = stats.length;

    // Render table
    const tbody = document.getElementById('employeeProgressBody');
    if (!stats.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding:32px;">Nenhum funcionário com leads neste lote</td></tr>';
      return;
    }

    tbody.innerHTML = stats.map(s => `
      <tr data-name="${(s.user.name || '').toLowerCase()}">
        <td>
          <div class="flex items-center gap-sm">
            <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--color-accent),#818CF8);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:13px;flex-shrink:0;">
              ${(s.user.name || '?')[0].toUpperCase()}
            </div>
            <div>
              <div style="font-weight:700;font-size:14px;">${_esc(s.user.name)}</div>
              <div style="font-size:12px;color:var(--color-text-muted);">${_esc(s.user.email || '')}</div>
            </div>
          </div>
        </td>
        <td>${s.total}</td>
        <td><span class="text-success" style="font-weight:700;">${s.worked}</span></td>
        <td>${s.pending}</td>
        <td><span style="font-weight:600;color:var(--color-success);">${s.vendaFechada}</span></td>
        <td>
          <div class="flex items-center gap-sm">
            <div class="progress-bar" style="width:100px;">
              <div class="progress-fill ${s.completionRate < 50 ? 'danger' : ''}" style="width:${s.completionRate}%"></div>
            </div>
            <span style="font-size:13px;font-weight:700;">${s.completionRate}%</span>
          </div>
        </td>
        <td>
          ${s.isLocked
            ? '<span class="badge badge-danger">🔒 Bloqueado</span>'
            : '<span class="badge badge-success">✅ Ativo</span>'
          }
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('[Dashboard]', e);
  }
}

function resetDashboard() {
  document.getElementById('statTotalLeads').textContent = '0';
  document.getElementById('statCompleted').textContent = '0';
  document.getElementById('statPending').textContent = '0';
  document.getElementById('statLocked').textContent = '0';
  document.getElementById('statEmployees').textContent = '0';
  document.getElementById('employeeProgressBody').innerHTML =
    '<tr><td colspan="6" class="text-center text-muted" style="padding:32px;">Selecione um lote para ver o progresso</td></tr>';
}

function filterEmployeeTable() {
  const q = document.getElementById('employeeSearch').value.toLowerCase();
  document.querySelectorAll('#employeeProgressBody tr[data-name]').forEach(tr => {
    tr.style.display = tr.dataset.name.includes(q) ? '' : 'none';
  });
}

/* ── Upload ── */
function _setupUploadZone() {
  const zone = document.getElementById('uploadZone');
  // #region agent log
  fetch('http://127.0.0.1:7585/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'upload-pre',hypothesisId:'F2',location:'leads-manager.js:_setupUploadZone',message:'upload zone setup',data:{hasZone:!!zone,hasInput:!!document.getElementById('fileInput'),hasLeadsImport:typeof LeadsImport!=='undefined',hasXLSX:typeof XLSX!=='undefined',handleOnWindow:typeof window.handleFileUpload},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const files = e.dataTransfer?.files;
    // #region agent log
    fetch('http://127.0.0.1:7585/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'upload-pre',hypothesisId:'F4',location:'leads-manager.js:drop',message:'file dropped',data:{count:files?.length||0,name:files?.[0]?.name||null,type:files?.[0]?.type||null,size:files?.[0]?.size||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (files?.length) {
      handleFileUpload({ target: { files } });
    }
  });
}

async function handleFileUpload(event) {
  const file = event.target.files?.[0];
  // #region agent log
  fetch('http://127.0.0.1:7585/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'upload-pre',hypothesisId:'F2',location:'leads-manager.js:handleFileUpload:entry',message:'upload started',data:{hasFile:!!file,name:file?.name||null,type:file?.type||null,size:file?.size||null,hasXLSX:typeof XLSX!=='undefined',hasLeadsImport:typeof LeadsImport!=='undefined'},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (!file) return;

  try {
    document.getElementById('uploadZone').style.display = 'none';
    if (typeof showLoading === 'function') showLoading('Processando planilha…');

    _parsedFile = await LeadsImport.parseFile(file);
    // #region agent log
    fetch('http://127.0.0.1:7585/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'upload-pre',hypothesisId:'F1',location:'leads-manager.js:handleFileUpload:parsed',message:'parse ok',data:{headers:(_parsedFile?.headers||[]).slice(0,12),totalRows:_parsedFile?.totalRows||0,sheetName:_parsedFile?.sheetName||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    _columnMapping = LeadsImport.autoMapColumns(_parsedFile.headers);

    // Render column mapper
    renderColumnMapper();

    // Transform and validate
    _transformedLeads = LeadsImport.transformRows(_parsedFile.rows, _columnMapping);
    const validation = LeadsImport.validateLeads(_transformedLeads);
    const duplicates = LeadsImport.findDuplicates(_transformedLeads);

    // Render preview
    renderPreview(validation, duplicates, file.name);

    // Show sections
    document.getElementById('mappingSection').classList.remove('hidden');
    document.getElementById('previewSection').classList.remove('hidden');

    // Set default batch name
    const nameInput = document.getElementById('batchName');
    if (nameInput) nameInput.value = file.name.replace(/\.(xlsx|xls|csv)$/i, '');
    // #region agent log
    fetch('http://127.0.0.1:7585/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'upload-pre',hypothesisId:'F3',location:'leads-manager.js:handleFileUpload:done',message:'upload ui ready',data:{valid:validation?.valid?.length||0,invalid:validation?.invalid?.length||0,mapped:Object.keys(_columnMapping||{})},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

  } catch (e) {
    console.error('[Upload]', e);
    // #region agent log
    fetch('http://127.0.0.1:7585/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'upload-pre',hypothesisId:'F1',location:'leads-manager.js:handleFileUpload:catch',message:'upload error',data:{error:String(e?.message||e),name:e?.name||null,hasXLSX:typeof XLSX!=='undefined'},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const msg = `Erro ao processar arquivo: ${e.message || e}`;
    _showAlert('validationAlerts', 'error', msg);
    document.getElementById('previewSection')?.classList.remove('hidden');
    document.getElementById('uploadZone').style.display = '';
    if (typeof showToast === 'function') showToast(msg, 'error');
    else alert(msg);
  } finally {
    if (typeof hideLoading === 'function') hideLoading();
  }
}

function renderColumnMapper() {
  const mapper = document.getElementById('columnMapper');
  const headers = _parsedFile.headers;

  mapper.innerHTML = Object.entries(LeadsImport.KNOWN_FIELDS).map(([key, field]) => `
    <div class="map-row" style="margin-bottom:8px;">
      <span class="field-label" style="font-size:14px; font-weight:600; display:block; margin-bottom:4px;">${field.label}</span>
      <select class="form-control" onchange="updateColumnMapping('${key}', this.value)">
        <option value="">— Não mapear —</option>
        ${headers.map(h => `
          <option value="${_esc(h)}" ${_columnMapping[key] === h ? 'selected' : ''}>${_esc(h)}</option>
        `).join('')}
      </select>
    </div>
  `).join('');
}

function updateColumnMapping(fieldKey, sourceCol) {
  if (sourceCol) {
    _columnMapping[fieldKey] = sourceCol;
  } else {
    delete _columnMapping[fieldKey];
  }
  // Re-transform
  _transformedLeads = LeadsImport.transformRows(_parsedFile.rows, _columnMapping);
  const validation = LeadsImport.validateLeads(_transformedLeads);
  const duplicates = LeadsImport.findDuplicates(_transformedLeads);
  renderPreview(validation, duplicates);
}

function renderPreview(validation, duplicates, fileName = '') {
  const { valid, invalid } = validation;

  // Stats
  document.getElementById('previewStats').innerHTML = `
    <div class="preview-stat">Total: <strong>${_parsedFile.totalRows.toLocaleString('pt-BR')}</strong></div>
    <div class="preview-stat">Válidos: <strong class="text-success">${valid.length.toLocaleString('pt-BR')}</strong></div>
    ${invalid.length ? `<div class="preview-stat">Inválidos: <strong class="text-danger">${invalid.length}</strong></div>` : ''}
    ${duplicates.length ? `<div class="preview-stat">Duplicatas: <strong class="text-warning">${duplicates.length}</strong></div>` : ''}
  `;

  // Alerts
  const alertsDiv = document.getElementById('validationAlerts');
  alertsDiv.innerHTML = '';
  if (invalid.length) {
    _showAlert('validationAlerts', 'warning',
      `${invalid.length} registro(s) com problemas serão ignorados. Exemplo: Linha ${invalid[0].row} — ${invalid[0].errors.join(', ')}`
    );
  }
  if (duplicates.length) {
    _showAlert('validationAlerts', 'warning',
      `${duplicates.length} CPF(s) duplicado(s) encontrado(s). Eles serão importados, mas considere revisar.`
    );
  }

  // Preview table (first 10 rows)
  const previewRows = valid.slice(0, 10);
  const cols = ['name', 'orgao', 'cpf', 'mother_name', 'phone', 'phone2'];
  const labels = ['Nome', 'Órgão', 'CPF', 'Nome da Mãe', 'Telefone 1', 'Telefone 2'];

  document.getElementById('previewHead').innerHTML = `<tr>${labels.map(l => `<th>${l}</th>`).join('')}</tr>`;
  document.getElementById('previewBody').innerHTML = previewRows.map(lead => `
    <tr>
      <td>${_esc(lead.name || '—')}</td>
      <td>${_esc(lead.orgao || '—')}</td>
      <td>${lead.cpf ? LeadsImport.formatCPF(lead.cpf) : '—'}</td>
      <td>${_esc(lead.mother_name || '—')}</td>
      <td>${_esc(lead.phone || '—')}</td>
      <td>${_esc(lead.phone2 || '—')}</td>
    </tr>
  `).join('');

  if (valid.length > 10) {
    document.getElementById('previewBody').innerHTML += `
      <tr><td colspan="5" class="text-center text-muted" style="padding:16px;">
        ... e mais ${(valid.length - 10).toLocaleString('pt-BR')} registros
      </td></tr>
    `;
  }
}

function resetUpload() {
  _parsedFile = null;
  _columnMapping = {};
  _transformedLeads = [];

  document.getElementById('uploadZone').style.display = '';
  document.getElementById('mappingSection').classList.add('hidden');
  document.getElementById('previewSection').classList.add('hidden');
  document.getElementById('importProgress').classList.add('hidden');
  document.getElementById('validationAlerts').innerHTML = '';
  document.getElementById('fileInput').value = '';
}

async function confirmImport() {
  if (!_transformedLeads.length) return;

  const validation = LeadsImport.validateLeads(_transformedLeads);
  const validLeads = validation.valid;
  if (!validLeads.length) {
    _showAlert('validationAlerts', 'error', 'Nenhum lead válido para importar.');
    return;
  }

  const batchName = document.getElementById('batchName').value.trim() || `Lote ${new Date().toLocaleDateString('pt-BR')}`;
  const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;

  // Show progress
  document.getElementById('previewSection').classList.add('hidden');
  document.getElementById('mappingSection').classList.add('hidden');
  document.getElementById('importProgress').classList.remove('hidden');

  // Progress callback
  window.lead_onImportProgress = (imported, total) => {
    const pct = Math.round((imported / total) * 100);
    document.getElementById('importProgressBar').style.width = `${pct}%`;
    document.getElementById('importProgressText').textContent = `${imported.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`;
  };

  try {
    const btn = document.getElementById('confirmImportBtn');
    btn.disabled = true;

    // #region agent log
    fetch('http://127.0.0.1:7585/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'import-chunk',hypothesisId:'G1',location:'leads-manager.js:confirmImport:start',message:'confirm import start',data:{valid:validLeads.length,batchName,hasMapping:!!_columnMapping},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    // Create batch
    const batch = await LeadsDB.createBatch({
      name: batchName,
      original_filename: _parsedFile.sheetName || 'planilha',
      total_records: validLeads.length,
      manager_id: session?.id,
      column_mapping: _columnMapping,
    });

    // #region agent log
    fetch('http://127.0.0.1:7585/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'import-chunk',hypothesisId:'G1',location:'leads-manager.js:confirmImport:batch',message:'batch created',data:{batchId:batch?.id||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    // Import leads
    await LeadsDB.importLeads(batch.id, validLeads);

    // Success
    document.getElementById('importProgress').innerHTML = `
      <div class="alert alert-success" style="margin-top:20px;">
        ✅ <strong>${validLeads.length.toLocaleString('pt-BR')} leads</strong> importados com sucesso no lote "${_esc(batchName)}"!
      </div>
      <div class="flex gap-md mt-lg" style="justify-content:center;">
        <button class="btn btn-outline" onclick="resetUpload(); switchTab('upload');">Novo Upload</button>
        <button class="btn btn-accent" onclick="_currentBatch={id:'${batch.id}'}; document.getElementById('batchSelect').value='${batch.id}'; switchTab('distribute'); loadDistributeTab();">
          Distribuir Leads →
        </button>
      </div>
    `;

    // Reload batches
    await loadBatches();
    document.getElementById('batchSelect').value = batch.id;
    _currentBatch = batch;

  } catch (e) {
    console.error('[Import]', e);
    document.getElementById('importProgress').innerHTML = `
      <div class="alert alert-error">❌ Erro na importação: ${_esc(e.message)}</div>
      <button class="btn btn-outline mt-md" onclick="resetUpload()">Tentar novamente</button>
    `;
  }
}

/* ── Distribution ── */
async function loadDistributeTab() {
  if (!_currentBatch) {
    document.getElementById('distNoBatch').classList.remove('hidden');
    document.getElementById('distContent').classList.add('hidden');
    return;
  }

  document.getElementById('distNoBatch').classList.add('hidden');
  document.getElementById('distContent').classList.remove('hidden');

  // Batch info
  const batch = await LeadsDB.getBatch(_currentBatch.id);
  const unassigned = await LeadsDB.getUnassignedLeads(_currentBatch.id);
  document.getElementById('distBatchInfo').innerHTML = `
    📦 <strong>${_esc(batch.name)}</strong> — ${batch.total_records.toLocaleString('pt-BR')} leads total,
    <strong>${unassigned.length.toLocaleString('pt-BR')}</strong> disponíveis para distribuir
  `;

  if (unassigned.length === 0) {
    document.getElementById('distBatchInfo').className = 'alert alert-success';
    document.getElementById('distBatchInfo').innerHTML = '✅ Todos os leads deste lote já foram distribuídos.';
    return;
  }

  // Load employees or supervisors
  const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
  const isMaster = session && (session.role === 'master' || session.role === 'fundador' || session.role === 'desenvolvedor');
  
  if (isMaster) {
    document.getElementById('distTargetToggle').classList.remove('hidden');
  } else {
    document.getElementById('distTargetToggle').classList.add('hidden');
  }

  let distTarget = 'employees';
  const radio = document.querySelector('input[name="distTarget"]:checked');
  if (radio && isMaster) {
    distTarget = radio.value;
  }

  let employees = [];
  
  if (distTarget === 'supervisors') {
    // Show only supervisors
    document.getElementById('distListTitle').textContent = 'Selecionar Supervisores';
    document.getElementById('weeksConfigGroup').classList.add('hidden');
    const allUsers = await DB.getUsers();
    employees = allUsers.filter(u => ['supervisor','gerente','gerencia'].includes(u.role));
  } else {
    // Show only SOU+BLU internal vendedores
    document.getElementById('distListTitle').textContent = 'Selecionar Vendedores SOU+BLU';
    document.getElementById('weeksConfigGroup').classList.remove('hidden');
    
    let rawEmployees = await DB.getAllEmployees().catch(() => []);
    if (!rawEmployees.length && session?.id) {
      rawEmployees = await DB.getEmployeesByAdmin(session.id).catch(() => []);
    }

    // Filtrar estritamente SOMENTE vendedores internos do SOU+BLU
    employees = rawEmployees.filter(e => {
      const r = String(e.role || '').toLowerCase();
      const isSeller = (r === 'vendedor' || r === 'employee');
      const isNotPartner = !e.partner_root_id && !r.includes('parceiro') && !(e.department && String(e.department).toLowerCase().includes('parceiro'));
      const isNotBackoffice = r !== 'backoffice' && r !== 'sup_backoffice' && r !== 'operacional' && r !== 'supervisor' && r !== 'gerente';
      const isActive = e.active !== false && String(e.active) !== '0' && e.active !== 0;
      return isSeller && isNotPartner && isNotBackoffice && isActive;
    });
  }

  const selector = document.getElementById('employeeSelector');
  selector.innerHTML = employees.map(emp => `
    <label class="employee-check" data-name="${_esc((emp.name || '').toLowerCase())}">
      <input type="checkbox" value="${emp.id}" onchange="toggleEmployee('${emp.id}', this.checked); updateDistPreview();" />
      <div>
        <div class="emp-name">${_esc(emp.name)}</div>
        <div class="emp-role">${_esc(emp.role || 'vendedor')} · ${_esc(emp.email || '')}</div>
      </div>
    </label>
  `).join('');

  if (!employees.length) {
    selector.innerHTML = '<p class="text-muted" style="padding:20px;text-align:center;">Nenhum funcionário ativo encontrado.</p>';
  }

  _selectedEmployees.clear();
  updateDistPreview();
}

function toggleEmployee(empId, checked) {
  if (checked) _selectedEmployees.add(empId);
  else _selectedEmployees.delete(empId);
}

function toggleAllEmployees() {
  _allEmployeesChecked = !_allEmployeesChecked;
  document.querySelectorAll('#employeeSelector input[type="checkbox"]').forEach(cb => {
    cb.checked = _allEmployeesChecked;
    if (_allEmployeesChecked) _selectedEmployees.add(cb.value);
    else _selectedEmployees.delete(cb.value);
  });
  updateDistPreview();
}

async function updateDistPreview() {
  const summary = document.getElementById('distSummary');
  const btn = document.getElementById('confirmDistributeBtn');

  if (!_selectedEmployees.size || !_currentBatch) {
    summary.innerHTML = '<p class="text-muted">Selecione funcionários para ver o preview</p>';
    btn.disabled = true;
    return;
  }

  const radio = document.querySelector('input[name="distTarget"]:checked');
  const isSupervisors = radio && radio.value === 'supervisors';

  try {
    const unassigned = await LeadsDB.getUnassignedLeads(_currentBatch.id);
    const empCount = _selectedEmployees.size;
    const perEmployee = Math.floor(unassigned.length / empCount);
    const remainder = unassigned.length % empCount;

    if (isSupervisors) {
      summary.innerHTML = `
        <div class="dist-summary-item"><span class="label">Leads disponíveis</span><span class="value">${unassigned.length.toLocaleString('pt-BR')}</span></div>
        <div class="dist-summary-item"><span class="label">Supervisores</span><span class="value">${empCount}</span></div>
        <div class="dist-summary-item"><span class="label">Repasse por supervisor</span><span class="value" style="color:var(--color-accent);font-size:18px;">${perEmployee.toLocaleString('pt-BR')}</span></div>
        ${remainder > 0 ? `<div class="dist-summary-item"><span class="label">Excedente (${remainder})</span><span class="value">Distribuído entre os primeiros</span></div>` : ''}
      `;
    } else {
      const weeks = parseInt(document.getElementById('weeksInput').value) || 1;
      const perWeek = Math.ceil(perEmployee / weeks);
      const perDay = Math.ceil(perWeek / 5);

      summary.innerHTML = `
        <div class="dist-summary-item"><span class="label">Leads disponíveis</span><span class="value">${unassigned.length.toLocaleString('pt-BR')}</span></div>
        <div class="dist-summary-item"><span class="label">Funcionários</span><span class="value">${empCount}</span></div>
        <div class="dist-summary-item"><span class="label">Leads por funcionário</span><span class="value">${perEmployee.toLocaleString('pt-BR')}</span></div>
        ${remainder > 0 ? `<div class="dist-summary-item"><span class="label">Excedente (${remainder})</span><span class="value">Distribuído entre os primeiros</span></div>` : ''}
        <div class="dist-summary-item"><span class="label">Semanas</span><span class="value">${weeks}</span></div>
        <div class="dist-summary-item"><span class="label">Leads por semana</span><span class="value" style="color:var(--color-accent);font-size:18px;">${perWeek.toLocaleString('pt-BR')}</span></div>
        <div class="dist-summary-item"><span class="label">Meta diária</span><span class="value" style="color:var(--color-success);font-size:18px;">${perDay}</span></div>
      `;
    }

    btn.disabled = false;
  } catch (e) {
    summary.innerHTML = `<p class="text-danger">Erro: ${_esc(e.message)}</p>`;
    btn.disabled = true;
  }
}

async function confirmDistribute() {
  if (!_currentBatch || !_selectedEmployees.size) return;

  const btn = document.getElementById('confirmDistributeBtn');
  const prevText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Processando...';

  const radio = document.querySelector('input[name="distTarget"]:checked');
  const isSupervisors = radio && radio.value === 'supervisors';

  try {
    if (isSupervisors) {
      const result = await LeadsDB.repassLeadsToSupervisors(_currentBatch.id, [..._selectedEmployees]);
      _showAlert('distBatchInfo', 'success',
        `✅ ${result.repassed.toLocaleString('pt-BR')} leads repassados para ${_selectedEmployees.size} supervisores em novos sub-lotes!`,
        true
      );
    } else {
      const weeks = parseInt(document.getElementById('weeksInput').value) || 1;
      const result = await LeadsDB.distributeLeads(
        _currentBatch.id,
        [..._selectedEmployees],
        weeks
      );
      _showAlert('distBatchInfo', 'success',
        `✅ ${result.distributed.toLocaleString('pt-BR')} leads distribuídos entre ${_selectedEmployees.size} funcionários! Meta diária: ${result.dailyTarget} leads.`,
        true
      );
    }

    btn.textContent = '✅ Concluído!';
    setTimeout(() => { btn.textContent = prevText; btn.disabled = false; }, 3000);

    // Reload dashboard
    _currentBatch = await LeadsDB.getBatch(_currentBatch.id);
    loadDashboard();

  } catch (e) {
    console.error('[Distribute]', e);
    alert('Erro na distribuição: ' + e.message);
    btn.textContent = prevText;
    btn.disabled = false;
  }
}

/* ── Employees Tab ── */
async function loadEmployeesTab() {
  if (!_currentBatch) return;

  try {
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    const isMaster = session && (session.role === 'master' || session.role === 'fundador' || session.role === 'desenvolvedor');

    let stats = await LeadsDB.getEmployeeStats(_currentBatch.id);
    
    // Filter stats to show only team members if not master
    if (!isMaster && session) {
      stats = stats.filter(s => s.user.admin_id === session.id || s.user.id === session.id);
    }

    const { week, year } = LeadsDB.getCurrentWeekAndYear();
    const today = LeadsDB.getCurrentDateStr();

    const tbody = document.getElementById('empListBody');
    if (!stats.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:32px;">Nenhum funcionário neste lote</td></tr>';
      return;
    }

    const rows = [];
    for (const s of stats) {
      const wa = await LeadsDB.getWeeklyAssignment(s.user.id, week, year);
      const todayLeads = await LeadsDB.getEmployeeTodayLeads(s.user.id, today);
      const todayDone = todayLeads.filter(l => LeadsDB.isWorkedStatus(l.status)).length;
      const todayTarget = todayLeads.length;

      rows.push(`
        <tr data-name="${_esc((s.user.name || '').toLowerCase())}">
          <td>
            <div class="flex items-center gap-sm">
              <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--color-accent),#818CF8);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:13px;flex-shrink:0;">
                ${(s.user.name || '?')[0].toUpperCase()}
              </div>
              <span style="font-weight:700;">${_esc(s.user.name)}</span>
            </div>
          </td>
          <td>${wa ? wa.total_leads : '—'}</td>
          <td>${todayTarget}</td>
          <td>
            <span style="font-weight:700;${todayDone >= todayTarget && todayTarget > 0 ? 'color:var(--color-success)' : 'color:var(--color-text)'}">
              ${todayDone}/${todayTarget}
            </span>
          </td>
          <td>
            ${s.isLocked
              ? '<span class="badge badge-danger">🔒 Bloqueado</span>'
              : '<span class="badge badge-success">✅ Ativo</span>'
            }
          </td>
          <td>
            ${s.isLocked
              ? `<button class="btn btn-success btn-sm" onclick="quickUnlock('${s.user.id}')">Desbloquear</button>`
              : `<button class="btn btn-outline btn-sm" onclick="checkDayEnd('${s.user.id}')">Verificar Meta</button>`
            }
          </td>
        </tr>
      `);
    }

    tbody.innerHTML = rows.join('');
  } catch (e) {
    console.error('[EmployeesTab]', e);
  }
}

function filterEmpList() {
  const q = document.getElementById('empListSearch').value.toLowerCase();
  document.querySelectorAll('#empListBody tr[data-name]').forEach(tr => {
    tr.style.display = tr.dataset.name.includes(q) ? '' : 'none';
  });
}

async function quickUnlock(userId) {
  if (!confirm('Confirma o desbloqueio deste funcionário?')) return;
  const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
  try {
    await LeadsDB.unlockUser(userId, session?.id);
    alert('Funcionário desbloqueado com sucesso!');
    loadEmployeesTab();
    loadDashboard();
    updateUnlockBadge();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

async function checkDayEnd(userId) {
  const today = LeadsDB.getCurrentDateStr();
  try {
    const todayLeads = await LeadsDB.getEmployeeTodayLeads(userId, today);
    const target = todayLeads.length;
    const done = todayLeads.filter(l => LeadsDB.isWorkedStatus(l.status)).length;

    await LeadsDB.upsertDailyProgress(userId, today, target, done);

    if (done < target) {
      const result = await LeadsDB.checkAndLockUser(userId, today);
      if (result?.locked) {
        alert(`Funcionário bloqueado. Fez ${done}/${target} leads hoje.`);
      }
    } else {
      alert(`Meta atingida! ${done}/${target} leads hoje. ✅`);
    }

    loadEmployeesTab();
    loadDashboard();
    updateUnlockBadge();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

/* ── Unlock Requests ── */
async function loadUnlockRequests() {
  try {
    let requests = await LeadsDB.getPendingUnlockRequests();
    
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    const isMaster = session && (session.role === 'master' || session.role === 'fundador' || session.role === 'desenvolvedor');

    if (!isMaster && session) {
      // Filter requests to only show users managed by the current session user
      const managedEmployees = await DB.getEmployeesByAdmin(session.id);
      const managedIds = managedEmployees.map(e => e.id);
      requests = requests.filter(req => managedIds.includes(req.user_id));
    }

    const list = document.getElementById('unlockList');

    if (!requests.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">✅</div>
          <h3>Nenhum pedido pendente</h3>
          <p>Todos os funcionários estão com acesso liberado.</p>
        </div>
      `;
      return;
    }

    const items = [];
    for (const req of requests) {
      const user = await DB.getUser(req.user_id);
      items.push(`
        <div class="unlock-item">
          <div class="unlock-user">
            <div class="unlock-avatar">🔒</div>
            <div class="unlock-info">
              <div class="name">${_esc(user?.name || 'Usuário desconhecido')}</div>
              <div class="detail">${_esc(req.reason || '')} · ${new Date(req.requested_at).toLocaleString('pt-BR')}</div>
            </div>
          </div>
          <div class="unlock-actions">
            <button class="btn btn-success btn-sm" onclick="approveUnlock('${req.user_id}', '${req.id}')">✅ Aprovar</button>
            <button class="btn btn-danger btn-sm" onclick="denyUnlock('${req.id}')">❌ Negar</button>
          </div>
        </div>
      `);
    }

    list.innerHTML = items.join('');
  } catch (e) {
    console.error('[Unlock]', e);
  }
}

async function approveUnlock(userId, requestId) {
  if (!confirm('Confirma o desbloqueio?')) return;
  const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
  try {
    await LeadsDB.unlockUser(userId, session?.id);
    loadUnlockRequests();
    updateUnlockBadge();
    loadDashboard();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

async function denyUnlock(requestId) {
  if (!confirm('Confirma a negação?')) return;
  const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
  try {
    await LeadsDB.denyUnlock(requestId, session?.id);
    loadUnlockRequests();
    updateUnlockBadge();
  } catch (e) {
    alert('Erro: ' + e.message);
  }
}

async function updateUnlockBadge() {
  try {
    let requests = await LeadsDB.getPendingUnlockRequests();
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    const isMaster = session && (session.role === 'master' || session.role === 'fundador' || session.role === 'desenvolvedor');

    if (!isMaster && session) {
      const managedEmployees = await DB.getEmployeesByAdmin(session.id);
      const managedIds = managedEmployees.map(e => e.id);
      requests = requests.filter(req => managedIds.includes(req.user_id));
    }

    const badge = document.getElementById('unlockBadge');
    if (requests.length > 0) {
      badge.textContent = requests.length;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (e) { /* silent */ }
}

/* ── Helpers ── */
function _esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function _showAlert(containerId, type, msg, replace = false) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const alertEl = document.createElement('div');
  alertEl.className = `alert alert-${type}`;
  alertEl.innerHTML = msg;
  if (replace) {
    container.innerHTML = '';
    container.className = `alert alert-${type}`;
    container.innerHTML = msg;
  } else {
    container.appendChild(alertEl);
  }
}

/* ── Telefonia / NextBilling ── */
async function openTelefoniaModal() {
  const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
  if (!_canEditTelefonia(session)) {
    alert('Apenas master, fundador ou gerente pode configurar a telefonia.');
    return;
  }
  const modal = document.getElementById('telefoniaModal');
  if (!modal) return;
  modal.classList.add('open');
  const statusBox = document.getElementById('telefoniaStatusBox');
  const deviceEl = document.getElementById('telefoniaDeviceId');
  const serverEl = document.getElementById('telefoniaServer');
  const modeEl = document.getElementById('telefoniaCallMode');
  const ramalEl = document.getElementById('telefoniaSrcRamal');
  const srcEl = document.getElementById('telefoniaTestSrc');
  const listEl = document.getElementById('telefoniaPhoneList');
  if (statusBox) statusBox.textContent = 'Carregando status…';
  try {
    const st = await LeadsDB.nextBillingStatus();
    if (deviceEl && st.device_id) deviceEl.value = st.device_id;
    if (serverEl && st.server) serverEl.value = st.server;
    if (modeEl && st.call_mode) modeEl.value = st.call_mode === 'cellphone' ? 'cellphone' : 'softphone';
    if (ramalEl && st.src_ramal) ramalEl.value = st.src_ramal;
    if (srcEl && !srcEl.value) {
      srcEl.value = st.src_ramal || (st.call_mode === 'softphone' ? '209' : (Auth.getSession()?.phone || ''));
    }
    if (statusBox) {
      const modeLabel = st.call_mode === 'cellphone' ? 'celular' : 'MicroSIP';
      if (st.configured && st.has_device) {
        statusBox.style.background = 'rgba(16,185,129,.12)';
        statusBox.innerHTML = `<strong style="color:var(--color-success);">Configurado</strong> · <code>${_esc(st.server_host || '—')}</code> · device <strong>${st.device_id}</strong> · modo <strong>${modeLabel}</strong>${st.src_ramal ? ` · ramal <strong>${_esc(String(st.src_ramal))}</strong>` : ''}`;
      } else if (st.has_tokens && !st.configured) {
        statusBox.style.background = 'rgba(245,158,11,.12)';
        statusBox.innerHTML = `<strong style="color:var(--color-warning);">Tokens OK</strong> — falta a <strong>URL do servidor</strong> NextBilling abaixo.`;
      } else if (st.configured) {
        statusBox.style.background = 'rgba(245,158,11,.12)';
        statusBox.innerHTML = `<strong style="color:var(--color-warning);">Servidor OK</strong>, mas falta <code>device_id</code>. Informe abaixo e salve.`;
      } else {
        statusBox.style.background = 'rgba(239,68,68,.1)';
        statusBox.innerHTML = `<strong style="color:var(--color-danger);">Não configurado</strong><br><span style="font-size:12px;">${_esc(st.setup_hint || 'Preencha servidor + device_id.')}</span>`;
      }
    }
    if (listEl) {
      const soft = (st.call_mode || 'softphone') !== 'cellphone';
      const users = await DB.getAllUsers(true).catch(() => []);
      const roles = new Set(['employee', 'vendedor', 'backoffice', 'supervisor']);
      const rows = (users || [])
        .filter((u) => roles.has(String(u.role || '').toLowerCase()) && (typeof DB._isUserActive !== 'function' || DB._isUserActive(u)))
        .slice(0, 40);
      listEl.innerHTML = `
        <div style="font-size:13px;font-weight:700;margin-bottom:8px;">${soft ? 'Ramais / telefones' : 'Telefones'} dos funcionários (${rows.length})</div>
        <p style="font-size:12px;color:var(--color-text-muted);margin:0 0 8px;">
          ${soft
            ? `Modo MicroSIP: o <code>src</code> é o ramal (padrão <strong>${_esc(String(st.src_ramal || '—'))}</strong>). No perfil, o telefone pode ser o ramal (ex.: 209).`
            : 'Click2Call usa o telefone do perfil como <code>src</code>.'}
        </p>
        <div style="max-height:180px;overflow:auto;font-size:12px;">
          ${rows.map((u) => {
            const phone = String(u.phone || '').trim();
            const digits = phone.replace(/\D/g, '');
            const ok = soft ? (digits.length >= 2) : (digits.length >= 10 && digits.length <= 13);
            return `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid var(--color-border);">
              <span>${_esc(u.name || u.id)}</span>
              <span style="color:${ok ? 'var(--color-text)' : 'var(--color-danger)'};font-weight:${ok ? '500' : '700'};">${ok ? _esc(phone) : '⚠ sem telefone (Click2Call não liga)'}</span>
            </div>`;
          }).join('') || '<span class="text-muted">Nenhum funcionário listado.</span>'}
        </div>`;
    }
  } catch (e) {
    if (statusBox) {
      statusBox.style.background = 'rgba(239,68,68,.1)';
      statusBox.textContent = e.message || 'Erro ao consultar telefonia';
    }
  }
}

function closeTelefoniaModal() {
  document.getElementById('telefoniaModal')?.classList.remove('open');
}

async function saveTelefoniaConfig() {
  const server = String(document.getElementById('telefoniaServer')?.value || '').trim();
  const deviceId = Number(document.getElementById('telefoniaDeviceId')?.value || 0);
  const callMode = String(document.getElementById('telefoniaCallMode')?.value || 'softphone').trim();
  const srcRamal = String(document.getElementById('telefoniaSrcRamal')?.value || '').trim();
  if (!server && !deviceId && !callMode && srcRamal === '') {
    alert('Informe a URL do servidor, device_id, modo ou ramal.');
    return;
  }
  try {
    await LeadsDB.nextBillingSaveConfig({
      server: server || undefined,
      device_id: deviceId || undefined,
      call_mode: callMode || undefined,
      src_ramal: srcRamal,
    });
    if (typeof showToast === 'function') showToast('Telefonia salva.', 'success');
    else alert('Telefonia salva.');
    await openTelefoniaModal();
  } catch (e) {
    alert(e.message || 'Falha ao salvar');
  }
}

async function saveTelefoniaDevice() {
  return saveTelefoniaConfig();
}

async function testTelefoniaCall() {
  const src = String(document.getElementById('telefoniaTestSrc')?.value || '').trim();
  const dst = String(document.getElementById('telefoniaTestDst')?.value || '').trim();
  const ramal = String(document.getElementById('telefoniaSrcRamal')?.value || '').trim();
  const mode = String(document.getElementById('telefoniaCallMode')?.value || 'softphone').trim();
  if (!dst) {
    alert('Digite o número para testar (destino), com DDD.');
    document.getElementById('telefoniaTestDst')?.focus();
    return;
  }
  const origin = src || ramal || Auth.getSession()?.phone || '';
  if (!origin && mode === 'cellphone') {
    alert('Cadastre seu telefone no perfil para usar o Click2Call.');
    return;
  }
  if (!confirm(
    mode === 'softphone'
      ? `Testar MicroSIP?\n\nDestino: ${dst}\n\nO MicroSIP vai discar este número na conta registrada (sem @IP).`
      : `Testar Click2Call?\n\nOrigem (toca primeiro): ${origin || '(perfil)'}\nDestino: ${dst}\n\nAtenda seu telefone; em seguida o destino será chamado.`
  )) return;
  const btn = document.getElementById('telefoniaTestBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Ligando…'; }
  try {
    if (mode === 'softphone' && typeof LeadsDB.openSoftphoneDialNow === 'function') {
      LeadsDB.openSoftphoneDialNow(dst);
    }
    const r = await LeadsDB.nextBillingClick2Call({ src: src || ramal || undefined, dst });
    const fallback = mode === 'softphone'
      ? 'MicroSIP discando o número na conta registrada.'
      : 'Ligando… atenda seu celular; em seguida o lead será chamado.';
    if (typeof showToast === 'function') showToast(r.message || fallback, 'success');
    else alert(r.message || 'Ligação iniciada.');
  } catch (e) {
    alert(e.message || 'Falha no Click2Call');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📞 Ligar para este número'; }
  }
}

window.openTelefoniaModal = openTelefoniaModal;
window.closeTelefoniaModal = closeTelefoniaModal;
window.saveTelefoniaDevice = saveTelefoniaDevice;
window.saveTelefoniaConfig = saveTelefoniaConfig;
window.testTelefoniaCall = testTelefoniaCall;
window.handleFileUpload = handleFileUpload;
window.resetUpload = resetUpload;
window.confirmImport = confirmImport;
window.updateColumnMapping = updateColumnMapping;

/* ── Gestão de Leads (Apagar & Trocar Vendedor) ── */
let _manageLeadsList = [];
let _selectedManageLeadIds = new Set();
let _manageSellersList = [];

async function openManageLeadsModal() {
  if (!_currentBatch) {
    alert('Selecione um lote de leads no menu superior para gerenciar seus leads.');
    return;
  }
  const modal = document.getElementById('manageLeadsModal');
  if (modal) modal.style.display = 'flex';

  // Load sellers dropdown
  const rawEmployees = await DB.getAllEmployees().catch(() => []);
  _manageSellersList = rawEmployees.filter(e => {
    const r = String(e.role || '').toLowerCase();
    return (r === 'vendedor' || r === 'employee') && !e.partner_root_id && e.active !== false;
  });

  const userFilter = document.getElementById('manageLeadUserFilter');
  const bulkReassign = document.getElementById('bulkReassignSelect');
  const optionsHtml = '<option value="unassigned">Sem Vendedor / Não Atribuído</option>' +
    _manageSellersList.map(s => `<option value="${s.id}">${_esc(s.name)} (${_esc(s.role || 'vendedor')})</option>`).join('');

  if (userFilter) userFilter.innerHTML = '<option value="">Todos os Vendedores</option>' + optionsHtml;
  if (bulkReassign) bulkReassign.innerHTML = '<option value="">Reatribuir para...</option>' + optionsHtml;

  _selectedManageLeadIds.clear();
  _updateBulkActionBar();

  const tbody = document.getElementById('manageLeadsTbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding:24px;">Carregando leads do lote...</td></tr>';

  try {
    _manageLeadsList = await LeadsDB.getLeads(_currentBatch.id, { limit: 50000 });
    renderManageLeadsTable();
  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger" style="padding:24px;">Erro ao carregar leads: ${_esc(e.message)}</td></tr>`;
  }
}

function closeManageLeadsModal() {
  const modal = document.getElementById('manageLeadsModal');
  if (modal) modal.style.display = 'none';
}

function renderManageLeadsTable() {
  const tbody = document.getElementById('manageLeadsTbody');
  if (!tbody) return;

  const q = String(document.getElementById('manageLeadSearch')?.value || '').toLowerCase().trim();
  const statusF = String(document.getElementById('manageLeadStatusFilter')?.value || '');
  const userF = String(document.getElementById('manageLeadUserFilter')?.value || '');

  const sellersMap = new Map(_manageSellersList.map(s => [s.id, s.name]));

  let filtered = _manageLeadsList.filter(l => {
    if (q) {
      const matchName = String(l.name || '').toLowerCase().includes(q);
      const matchCpf = String(l.cpf || '').includes(q);
      const matchPhone = String(l.phone || '').includes(q);
      if (!matchName && !matchCpf && !matchPhone) return false;
    }
    if (statusF && (l.status || 'pending') !== statusF) return false;
    if (userF !== '') {
      if (userF === 'unassigned') {
        if (l.assigned_to) return false;
      } else {
        if (l.assigned_to !== userF) return false;
      }
    }
    return true;
  });

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding:32px;">Nenhum lead encontrado com os filtros selecionados.</td></tr>';
    return;
  }

  const RENDER_LIMIT = 300;
  const slice = filtered.slice(0, RENDER_LIMIT);

  let rowsHtml = slice.map(lead => {
    const isChecked = _selectedManageLeadIds.has(lead.id);
    const sellerName = lead.assigned_to ? (sellersMap.get(lead.assigned_to) || 'Vendedor Desconhecido') : '<span class="badge badge-muted">Sem Vendedor</span>';
    const statusObj = LeadsDB.LEAD_STATUSES[lead.status] || { label: lead.status || 'Pendente', color: 'muted', icon: '⏳' };
    const scoreVal = lead.score || lead.extra_data?.score || '—';
    const scoreBadge = scoreVal !== '—' 
      ? `<span class="badge badge-accent" style="font-weight:800;font-size:11px;">⭐ ${_esc(scoreVal)}</span>`
      : '<span class="text-muted">—</span>';

    return `
      <tr>
        <td><input type="checkbox" value="${lead.id}" ${isChecked ? 'checked' : ''} onchange="toggleSelectManageLead('${lead.id}', this.checked)"/></td>
        <td>
          <div style="font-weight:700;">${_esc(lead.name || 'Lead sem nome')}</div>
          ${lead.orgao ? `<div style="font-size:11px;color:var(--color-text-muted);">${_esc(lead.orgao)}</div>` : ''}
        </td>
        <td>${_esc(LeadsImport.formatCPF(lead.cpf) || '—')}</td>
        <td>${scoreBadge}</td>
        <td>${_esc(lead.phone || '—')}</td>
        <td><span class="badge badge-${statusObj.color}">${statusObj.icon} ${statusObj.label}</span></td>
        <td>${sellerName}</td>
        <td style="text-align:right;">
          <button type="button" class="btn btn-ghost btn-sm" onclick="reassignSingleLead('${lead.id}', '${_esc((lead.name||'').replace(/'/g, "\\'"))}')" title="Trocar Vendedor">🔄 Trocar</button>
          <button type="button" class="btn btn-ghost btn-sm text-danger" onclick="deleteSingleLead('${lead.id}', '${_esc((lead.name||'').replace(/'/g, "\\'"))}')" title="Apagar Lead">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');

  if (filtered.length > RENDER_LIMIT) {
    rowsHtml += `
      <tr>
        <td colspan="7" class="text-center text-muted" style="padding:12px;background:var(--color-surface-2);font-weight:600;font-size:12px;">
          Exibindo os primeiros ${RENDER_LIMIT} de ${filtered.length.toLocaleString('pt-BR')} leads. Use a busca ou os filtros para visualizar qualquer lead específico.
        </td>
      </tr>
    `;
  }

  tbody.innerHTML = rowsHtml;

  _updateBulkActionBar();
}

function toggleSelectManageLead(leadId, checked) {
  if (checked) _selectedManageLeadIds.add(leadId);
  else _selectedManageLeadIds.delete(leadId);
  _updateBulkActionBar();
}

function toggleAllManageLeads(checked) {
  if (checked) {
    _manageLeadsList.forEach(l => _selectedManageLeadIds.add(l.id));
  } else {
    _selectedManageLeadIds.clear();
  }
  renderManageLeadsTable();
}

function _updateBulkActionBar() {
  const bar = document.getElementById('bulkLeadsActionBar');
  const countEl = document.getElementById('selectedLeadsCount');
  const checkAll = document.getElementById('checkAllManageLeads');

  if (countEl) countEl.textContent = `${_selectedManageLeadIds.size} leads selecionados`;
  if (bar) bar.style.display = _selectedManageLeadIds.size > 0 ? 'flex' : 'none';
  if (checkAll) checkAll.checked = _manageLeadsList.length > 0 && _selectedManageLeadIds.size === _manageLeadsList.length;
}

async function deleteSingleLead(leadId, leadName) {
  if (!confirm(`Tem certeza que deseja APAGAR permanentemente o lead "${leadName}"?`)) return;
  try {
    await LeadsDB.deleteLead(leadId);
    _manageLeadsList = _manageLeadsList.filter(l => l.id !== leadId);
    _selectedManageLeadIds.delete(leadId);
    renderManageLeadsTable();
    if (typeof loadDashboardStats === 'function') loadDashboardStats();
    if (typeof loadEmployeeProgressTable === 'function') loadEmployeeProgressTable();
    if (typeof showToast === 'function') showToast('Lead apagado com sucesso.', 'success');
  } catch (e) {
    alert('Erro ao apagar lead: ' + (e.message || e));
  }
}

async function reassignSingleLead(leadId, leadName) {
  const options = _manageSellersList.map((s, idx) => `${idx + 1}. ${s.name} (${s.role || 'vendedor'})`).join('\n');
  const promptMsg = `Trocar vendedor para o lead "${leadName}":\n\n0. Sem Vendedor (Ninguém)\n${options}\n\nDigite o número correspondente:`;
  const choice = prompt(promptMsg);
  if (choice === null) return;
  const num = parseInt(choice, 10);
  if (isNaN(num) || num < 0 || num > _manageSellersList.length) {
    alert('Opção inválida.');
    return;
  }

  const selectedSeller = num === 0 ? null : _manageSellersList[num - 1];
  const newUserId = selectedSeller ? selectedSeller.id : null;

  try {
    await LeadsDB.reassignLead(leadId, newUserId);
    const lead = _manageLeadsList.find(l => l.id === leadId);
    if (lead) {
      lead.assigned_to = newUserId;
      lead.assigned_date = newUserId ? LeadsDB.getCurrentDateStr() : null;
    }
    renderManageLeadsTable();
    if (typeof loadDashboardStats === 'function') loadDashboardStats();
    if (typeof loadEmployeeProgressTable === 'function') loadEmployeeProgressTable();
    if (typeof showToast === 'function') showToast(`Lead reatribuído para ${selectedSeller ? selectedSeller.name : 'sem vendedor'}.`, 'success');
  } catch (e) {
    alert('Erro ao trocar vendedor: ' + (e.message || e));
  }
}

async function executeBulkDelete() {
  const ids = Array.from(_selectedManageLeadIds);
  if (!ids.length) return;
  if (!confirm(`Tem certeza que deseja APAGAR ${ids.length} leads selecionados? Esta ação não pode ser desfeita.`)) return;

  try {
    await LeadsDB.deleteLeadsBulk(ids);
    _manageLeadsList = _manageLeadsList.filter(l => !_selectedManageLeadIds.has(l.id));
    _selectedManageLeadIds.clear();
    renderManageLeadsTable();
    if (typeof loadDashboardStats === 'function') loadDashboardStats();
    if (typeof loadEmployeeProgressTable === 'function') loadEmployeeProgressTable();
    if (typeof showToast === 'function') showToast(`${ids.length} leads apagados com sucesso.`, 'success');
  } catch (e) {
    alert('Erro ao apagar leads: ' + (e.message || e));
  }
}

async function executeBulkReassign() {
  const ids = Array.from(_selectedManageLeadIds);
  if (!ids.length) return;
  const targetVal = String(document.getElementById('bulkReassignSelect')?.value || '');
  const targetId = targetVal === 'unassigned' ? null : targetVal;
  const targetSeller = _manageSellersList.find(s => s.id === targetId);
  const sellerLabel = targetSeller ? targetSeller.name : 'Sem Vendedor (Não atribuído)';

  if (!confirm(`Trocar o vendedor de ${ids.length} leads para: ${sellerLabel}?`)) return;

  try {
    await LeadsDB.reassignLeadsBulk(ids, targetId);
    _manageLeadsList.forEach(l => {
      if (_selectedManageLeadIds.has(l.id)) {
        l.assigned_to = targetId;
        l.assigned_date = targetId ? LeadsDB.getCurrentDateStr() : null;
      }
    });
    _selectedManageLeadIds.clear();
    renderManageLeadsTable();
    if (typeof loadDashboardStats === 'function') loadDashboardStats();
    if (typeof loadEmployeeProgressTable === 'function') loadEmployeeProgressTable();
    if (typeof showToast === 'function') showToast(`${ids.length} leads reatribuídos para ${sellerLabel}.`, 'success');
  } catch (e) {
    alert('Erro ao reatribuir leads: ' + (e.message || e));
  }
}

window.openManageLeadsModal = openManageLeadsModal;
window.closeManageLeadsModal = closeManageLeadsModal;
window.renderManageLeadsTable = renderManageLeadsTable;
window.toggleSelectManageLead = toggleSelectManageLead;
window.toggleAllManageLeads = toggleAllManageLeads;
window.deleteSingleLead = deleteSingleLead;
window.reassignSingleLead = reassignSingleLead;
window.executeBulkDelete = executeBulkDelete;
window.executeBulkReassign = executeBulkReassign;
