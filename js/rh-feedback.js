/* SOU+BLU — Feedbacks no módulo RH */

const RH_FB_KEY = 'soublu_feedbacks';

let _rhFbEmpUserId = null;
let _rhFbEmpName = '';

function _rhEsc(s) {
  if (typeof _esc === 'function') return _esc(s);
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _rhFbLoad() {
  try { return JSON.parse(localStorage.getItem(RH_FB_KEY) || '[]'); } catch { return []; }
}

function _rhFbSaveLocal(entry) {
  const list = _rhFbLoad();
  list.unshift(entry);
  localStorage.setItem(RH_FB_KEY, JSON.stringify(list));
}

function _rhFbId() {
  return 'fb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function _rhFindUserForEmployee(emp, users) {
  if (!emp) return null;
  const cpf = String(emp.cpf || '').replace(/\D/g, '');
  const email = String(emp.email || '').trim().toLowerCase();
  return (users || []).find(u =>
    (cpf && u.cpf && String(u.cpf).replace(/\D/g, '') === cpf)
    || (email && u.email && String(u.email).trim().toLowerCase() === email)
  ) || null;
}

async function _rhEmployeesWithLogin() {
  const users = await DB.getAllUsers();
  const companyEmps = typeof window._rhCompanyEmployees === 'function'
    ? window._rhCompanyEmployees(_allEmployees || [])
    : (_allEmployees || []).filter(e => !e.demitido && e.status !== 'demitido');
  const fromRh = companyEmps
    .filter(e => !e.demitido && e.status !== 'demitido')
    .map(emp => {
      const u = _rhFindUserForEmployee(emp, users);
      if (!u || u.active === false) return null;
      return {
        rh_id: emp.id,
        user_id: u.id,
        name: emp.nome || u.name,
        department: emp.departamento || u.department || '',
      };
    })
    .filter(Boolean);

  if (fromRh.length) return fromRh;

  if (typeof DB.getAllEmployees === 'function') {
    const all = await DB.getAllEmployees();
    return (all || [])
      .filter(u => u && u.id && u.active !== false)
      .map(u => ({
        rh_id: u.id,
        user_id: u.id,
        name: u.name || '—',
        department: u.department || '',
      }));
  }

  return users
    .filter(u => u && u.id && u.active !== false)
    .map(u => ({
      rh_id: u.id,
      user_id: u.id,
      name: u.name || '—',
      department: u.department || '',
    }));
}

function _rhResetFeedbackForm() {
  const typeEl = document.getElementById('rhFbType');
  const titleEl = document.getElementById('rhFbTitle');
  const contentEl = document.getElementById('rhFbContent');
  const privEl = document.getElementById('rhFbPrivate');
  if (typeEl) typeEl.value = 'elogio';
  if (titleEl) titleEl.value = '';
  if (contentEl) contentEl.value = '';
  if (privEl) privEl.checked = false;
  onRhFbTypeChange('elogio');
}

async function _rhFillFeedbackEmployeeSelect() {
  const sel = document.getElementById('rhFbEmpSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">Carregando funcionários...</option>';
  const emps = await _rhEmployeesWithLogin();
  if (!emps.length) {
    sel.innerHTML = '<option value="">Nenhum funcionário com login encontrado</option>';
    return;
  }
  sel.innerHTML = '<option value="">Selecione o funcionário...</option>' +
    emps.map(e => `<option value="${_rhEsc(e.user_id)}" data-name="${_rhEsc(e.name)}">${_rhEsc(e.name)} — ${_rhEsc(e.department)}</option>`).join('');
  sel.onchange = () => {
    const opt = sel.options[sel.selectedIndex];
    _rhFbEmpUserId = sel.value || null;
    _rhFbEmpName = opt?.dataset?.name || '';
  };
}

async function openRhFeedbackModal(empUserId, empName) {
  _rhResetFeedbackForm();

  const selectWrap = document.getElementById('rhFbEmpSelectWrap');
  const nameWrap = document.getElementById('rhFbEmpNameWrap');
  const nameEl = document.getElementById('rhFbEmpName');

  if (empUserId) {
    _rhFbEmpUserId = empUserId;
    _rhFbEmpName = empName || '';
    if (selectWrap) selectWrap.style.display = 'none';
    if (nameWrap) nameWrap.style.display = '';
    if (nameEl) nameEl.textContent = _rhFbEmpName;
  } else {
    _rhFbEmpUserId = null;
    _rhFbEmpName = '';
    if (selectWrap) selectWrap.style.display = '';
    if (nameWrap) nameWrap.style.display = 'none';
    if (nameEl) nameEl.textContent = '';
  }

  if (typeof openModal === 'function') {
    openModal('rhFeedbackModal');
  } else {
    const el = document.getElementById('rhFeedbackModal');
    if (el) el.classList.add('open');
  }

  if (!empUserId) {
    try {
      await _rhFillFeedbackEmployeeSelect();
    } catch (e) {
      console.error('[rh-feedback] open:', e);
      const sel = document.getElementById('rhFbEmpSelect');
      if (sel) sel.innerHTML = '<option value="">Erro ao carregar funcionários</option>';
      if (typeof showToast === 'function') {
        showToast('Erro ao carregar funcionários: ' + (e.message || e), 'error');
      }
    }
  }
}

async function openRhFeedbackForEmployee(rhEmployeeId) {
  const emp = (_allEmployees || []).find(e => String(e.id) === String(rhEmployeeId));
  if (!emp) return;
  const users = await DB.getAllUsers();
  const u = _rhFindUserForEmployee(emp, users);
  if (!u) {
    alert('Este funcionário ainda não tem usuário de login no painel. Salve o cadastro com e-mail para criar o acesso.');
    return;
  }
  await openRhFeedbackModal(u.id, emp.nome || u.name);
}

function onRhFbTypeChange(val) {
  const v = val || document.getElementById('rhFbType')?.value || 'elogio';
  const warn = document.getElementById('rhFbAdvert');
  if (warn) warn.style.display = v === 'advertencia' ? '' : 'none';
}

async function saveRhFeedback() {
  const type = document.getElementById('rhFbType')?.value || 'elogio';
  const title = document.getElementById('rhFbTitle')?.value.trim() || '';
  const content = document.getElementById('rhFbContent')?.value.trim() || '';
  const priv = document.getElementById('rhFbPrivate')?.checked || false;

  if (!_rhFbEmpUserId) {
    showToast('Selecione um funcionário.', 'warning');
    return;
  }
  if (!title || !content) {
    showToast('Preencha título e descrição.', 'warning');
    return;
  }

  const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
  const authorId = session?.id || 'rh';

  if (type === 'advertencia') {
    const emp = await DB.getUser(_rhFbEmpUserId);
    if (emp && typeof canSouBluManagePoints === 'function' && !canSouBluManagePoints(emp)) {
      showToast('Advertência com pontos só para equipe SOU+BLU interna.', 'warning');
      return;
    }
    const pts = typeof userPts === 'function' ? userPts(emp) : Number(emp?.points ?? emp?.balance ?? 0);
    const depois = pts - 100;
    const msg = `Aplicar advertência a ${_rhFbEmpName}?\
\
100 pontos serão descontados.\
Saldo atual: ${pts.toLocaleString('pt-BR')} pts → ${depois.toLocaleString('pt-BR')} pts`;
    if (!confirm(msg)) return;
  }

  if (typeof showLoading === 'function') showLoading('Registrando...');
  try {
    const entry = {
      id: _rhFbId(),
      employee_id: _rhFbEmpUserId,
      author_id: authorId,
      type,
      title,
      content,
      private: priv,
      created_at: new Date().toISOString(),
    };

    const online = typeof HOSTINGER_CONFIGURED !== 'undefined' && HOSTINGER_CONFIGURED
      || typeof SUPABASE_CONFIGURED !== 'undefined' && SUPABASE_CONFIGURED;
    if (online) {
      try {
        await supaReq('POST', 'feedbacks', entry);
      } catch {
        _rhFbSaveLocal(entry);
      }
    } else {
      _rhFbSaveLocal(entry);
    }

    if (type === 'advertencia') {
      const novoSaldo = await DB.deductBalance(_rhFbEmpUserId, 100, `Advertência: ${title}`, authorId);
      const saldoTxt = Number.isFinite(novoSaldo)
        ? ` Saldo atual: ${novoSaldo.toLocaleString('pt-BR')} pts.`
        : '';
      showToast(`Advertência registrada — 100 pts descontados de ${_rhFbEmpName}.${saldoTxt}`, 'warning', 6000);
    } else {
      const label = { elogio: 'Elogio', feedback: 'Feedback', observacao: 'Observação' }[type] || 'Registro';
      showToast(`${label} registrado!`, 'success');
    }

    if (typeof closeModalRH === 'function') closeModalRH('rhFeedbackModal');
    else if (typeof closeModal === 'function') closeModal('rhFeedbackModal');
    await renderRhFeedbackSection();
    if (type === 'advertencia' && typeof reloadAllData === 'function') await reloadAllData();
  } catch (e) {
    console.error('[rh-feedback]', e);
    showToast('Erro ao registrar feedback: ' + (e.message || e), 'error');
  } finally {
    if (typeof hideLoading === 'function') hideLoading();
  }
}

async function renderRhFeedbackSection() {
  const box = document.getElementById('rhFeedbackContent');
  if (!box) return;

  let emps = [];
  try {
    emps = await _rhEmployeesWithLogin();
  } catch (e) {
    console.error('[rh-feedback] list:', e);
    box.innerHTML = '<div class="text-muted text-center" style="padding:32px;">Erro ao carregar feedbacks.</div>';
    return;
  }

  const empIds = new Set(emps.map(e => e.user_id));
  const empCache = {};
  emps.forEach(e => { empCache[e.user_id] = e; });

  let feedbacks = [];
  const online = typeof HOSTINGER_CONFIGURED !== 'undefined' && HOSTINGER_CONFIGURED
    || typeof SUPABASE_CONFIGURED !== 'undefined' && SUPABASE_CONFIGURED;
  if (online) {
    try {
      feedbacks = await supaReq('GET', 'feedbacks', null, '?select=*&order=created_at.desc&limit=100');
    } catch {
      feedbacks = _rhFbLoad();
    }
  } else {
    feedbacks = _rhFbLoad();
  }

  feedbacks = feedbacks.filter(f => empIds.has(f.employee_id));
  if (typeof AttendancePenalty !== 'undefined' && AttendancePenalty.isAutoAttendanceFeedback) {
    feedbacks = feedbacks.filter(f => !AttendancePenalty.isAutoAttendanceFeedback(f));
  }

  if (!feedbacks.length) {
    box.innerHTML = '<div class="text-muted text-center" style="padding:32px;">Nenhum feedback registrado ainda.</div>';
    return;
  }

  const typeConfig = {
    elogio: { label: 'Elogio', color: 'var(--color-success)', bg: 'rgba(0,179,65,.07)', border: 'rgba(0,179,65,.25)' },
    feedback: { label: 'Feedback', color: '#2563eb', bg: 'rgba(37,99,235,.07)', border: 'rgba(37,99,235,.25)' },
    advertencia: { label: 'Advertência', color: 'var(--color-warning)', bg: 'rgba(245,158,11,.07)', border: 'rgba(245,158,11,.3)' },
    observacao: { label: 'Observação', color: 'var(--color-text-muted)', bg: 'var(--color-surface-2)', border: 'var(--color-border)' },
  };

  box.innerHTML = feedbacks.map(f => {
    const emp = empCache[f.employee_id];
    const tc = typeConfig[f.type] || typeConfig.observacao;
    const dt = typeof formatDateTime === 'function' ? formatDateTime(f.created_at) : (f.created_at || '');
    return `
    <div style="border-left:4px solid ${tc.border};background:${tc.bg};border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:center;gap:10px;">
          ${typeof avatarHtml === 'function' ? avatarHtml(emp?.name || '—', 'avatar-sm') : ''}
          <div>
            <span style="font-weight:700;font-size:14px;">${_rhEsc(emp?.name || '—')}</span>
            <span style="font-size:11px;color:var(--color-text-muted);margin-left:6px;">${_rhEsc(emp?.department || '')}</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="display:inline-flex;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;background:${tc.bg};color:${tc.color};border:1px solid ${tc.border};">${tc.label}</span>
          ${f.private ? '<span style="font-size:11px;color:var(--color-text-muted);">Privado</span>' : ''}
          <span style="font-size:11px;color:var(--color-text-muted);">${dt}</span>
        </div>
      </div>
      <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${_rhEsc(f.title)}</div>
      <div style="font-size:13px;color:var(--color-text-secondary);line-height:1.65;">${_rhEsc(f.content)}</div>
      ${f.type === 'advertencia' ? `<div style="margin-top:8px;font-size:12px;font-weight:700;color:var(--color-warning);">−${Number(f.points_deducted || 100).toLocaleString('pt-BR')} pontos</div>` : ''}
    </div>`;
  }).join('');
}

window.openRhFeedbackModal = openRhFeedbackModal;
window.openRhFeedbackForEmployee = openRhFeedbackForEmployee;
window.onRhFbTypeChange = onRhFbTypeChange;
window.saveRhFeedback = saveRhFeedback;
window.renderRhFeedbackSection = renderRhFeedbackSection;
window.renderRhFeedbackList = renderRhFeedbackSection;
