/* SOU+BLU — RH Ops: kanban, justificativa, punição, demissão, folha */

if (typeof window._esc !== 'function') {
  window._esc = function _esc(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  };
}

let _allJustificativas = [];
let _allPunicoes = [];
let _allDemissoes = [];

let _justifAtestadoPending = null;
let _justifAtestadoUrl = '';
let _justifAtestadoNome = '';

let _demAnexoPending = { aviso: null, carta: null, entrevista: null };
let _demAnexoUrls = { aviso: '', carta: '', entrevista: '' };

let _kanbanDnDReady = false;
let _dragResumeId = null;

const _KANBAN_STAGES = ['triagem', 'entrevista', 'contratado', 'recusado'];
const _RECUSADO_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const _JUSTIF_TIPO = {
  atestado: 'Atestado médico',
  justificada: 'Falta justificada',
  injustificada: 'Falta injustificada',
  abono: 'Abono / licença',
};

const _JUSTIF_SITUACAO = {
  abonada: 'Abonada',
  descontada: 'Descontada',
};

const _PUNICAO_TIPO = {
  advertencia_verbal: { label: 'Advertência verbal', cls: 'badge-muted' },
  advertencia: { label: 'Advertência', cls: 'badge-warning' },
  suspensao: { label: 'Suspensão', cls: 'badge-danger' },
  justa_causa: { label: 'Justa causa', cls: 'badge-danger' },
  observacao: { label: 'Observação', cls: 'badge-muted' },
  elogio: { label: 'Elogio', cls: 'badge-success' },
};

const _PUNICAO_MOTIVOS = {
  advertencia_verbal: [
    { v: '1', l: '1 - Faltas e atrasos' },
    { v: '3', l: '3 - Desobediência a superiores' },
    { v: '7', l: '7 - Negligência ou baixa produtividade' },
  ],
  advertencia: [
    { v: '1', l: '1 - Faltas e atrasos' },
    { v: '2', l: '2 - Descumprimento de normas internas' },
    { v: '3', l: '3 - Desobediência a superiores' },
    { v: '4', l: '4 - Comportamento inadequado' },
    { v: '5', l: '5 - Uso indevido de recursos da empresa' },
    { v: '6', l: '6 - Atos ilícitos ou antiéticos' },
    { v: '7', l: '7 - Negligência ou baixa produtividade' },
  ],
  suspensao: [
    { v: '1', l: '1 - Faltas e atrasos' },
    { v: '2', l: '2 - Descumprimento de normas internas' },
    { v: '3', l: '3 - Desobediência a superiores' },
    { v: '4', l: '4 - Comportamento inadequado' },
    { v: '5', l: '5 - Uso indevido de recursos da empresa' },
    { v: '6', l: '6 - Atos ilícitos ou antiéticos' },
    { v: '7', l: '7 - Negligência ou baixa produtividade' },
  ],
  justa_causa: [
    { v: '1', l: '1 - Ato de improbidade' },
    { v: '2', l: '2 - Incontinência de conduta ou mau procedimento' },
    { v: '3', l: '3 - Negociação habitual sem permissão' },
    { v: '4', l: '4 - Condenação criminal' },
    { v: '5', l: '5 - Desídia' },
    { v: '6', l: '6 - Embriaguez habitual ou em serviço' },
    { v: '7', l: '7 - Violação de segredo da empresa' },
    { v: '8', l: '8 - Ato de indisciplina ou insubordinação' },
    { v: '9', l: '9 - Abandono de emprego' },
    { v: '10', l: '10 - Ofensas físicas ou lesões à honra' },
    { v: '11', l: '11 - Prática constante de jogos de azar' },
    { v: '13', l: '13 - Perda de habilitação ou requisitos legais' },
    { v: '14', l: '14 - Atos atentatórios à segurança nacional' },
  ],
  observacao: [
    { v: 'orientacao', l: 'Orientação de conduta' },
    { v: 'processo', l: 'Ajuste de processo' },
    { v: 'outro', l: 'Outro' },
  ],
  elogio: [
    { v: 'desempenho', l: 'Excelente desempenho' },
    { v: 'meta', l: 'Meta atingida' },
    { v: 'colaboracao', l: 'Espírito de colaboração' },
    { v: 'outro', l: 'Outro' },
  ],
};

const _DEMISSAO_AVISO = {
  aviso_previo_trabalhado: 'Aviso prévio trabalhado',
  aviso_previo_dispensado: 'Aviso prévio dispensado',
  aviso_previo_indenizado: 'Aviso prévio indenizado',
  demissao_imediata: 'Demissão imediata',
  sem_aviso: 'Sem aviso prévio',
  pedido_imediato: 'Pedido de demissão imediato',
  justa_causa: 'Justa causa',
};

function _digits(v) {
  return String(v || '').replace(/\D/g, '');
}

/** CPF key: digits only, pad to 11 when short (numeric storage drop leading zeros). */
function _cpfKey(v) {
  const d = _digits(v);
  if (!d) return '';
  if (d.length < 11 && d.length >= 9) return d.padStart(11, '0');
  return d;
}

function _rhNotify(msg, type = 'info') {
  if (typeof showToast === 'function') showToast(msg, type);
  else alert(msg);
}

function _rhAuthor() {
  const s = typeof Auth !== 'undefined' ? Auth.getSession() : null;
  return s?.name || 'RH';
}

function _empById(id) {
  return (window._allEmployees || []).find(e => String(e.id) === String(id));
}

function _empCpfCandidates(e) {
  if (!e || typeof e !== 'object') return [];
  return [e.cpf, e.document, e.documento, e.cpf_cnpj, e.doc].filter(Boolean);
}

function _empMatchesCpf(e, key) {
  if (!key) return false;
  return _empCpfCandidates(e).some((f) => _cpfKey(f) === key);
}

function _upsertLocalEmployee(emp) {
  if (!emp) return;
  const list = window._allEmployees || (window._allEmployees = []);
  const key = _cpfKey(emp.cpf);
  const idx = list.findIndex((e) =>
    (emp.id && String(e.id) === String(emp.id))
    || (key && _empMatchesCpf(e, key))
    || (emp.user_id && e.user_id && String(e.user_id) === String(emp.user_id))
  );
  const row = (typeof window._normalizeRhEmployeeRow === 'function')
    ? window._normalizeRhEmployeeRow(emp)
    : emp;
  if (idx >= 0) list[idx] = { ...list[idx], ...row };
  else list.push(row);
}

function _empByCpf(cpf) {
  const key = _cpfKey(cpf);
  if (!key) return null;
  return (window._allEmployees || []).find((e) => _empMatchesCpf(e, key)) || null;
}

function _userToRhEmpShape(u) {
  if (!u) return null;
  return {
    id: '',
    user_id: u.id || '',
    cpf: _cpfKey(u.cpf),
    nome: u.name || u.nome || '',
    contato: u.phone || u.phone1 || '',
    email: u.email || '',
    email_pessoal: u.email || '',
    matricula: u.matricula || '',
    departamento: u.department || '',
    cargo: u.role || '',
    status: u.active === false ? 'inativo' : 'ativo',
    demitido: false,
    _fromUsersOnly: true,
  };
}

/**
 * Resolve colaborador por CPF: cache RH → API rh_employees → users.
 * Evita falso "não encontrado" por lista limitada (limit 400) ou CPF só em users.
 */
async function _resolveEmployeeByCpf(cpfRaw) {
  const key = _cpfKey(cpfRaw);
  if (key.length !== 11) {
    return { error: 'Informe um CPF válido (11 dígitos).' };
  }

  let emp = _empByCpf(key);
  if (emp) return { emp };

  const tryOnlineRh = async () => {
    if (typeof DB === 'undefined' || !DB.online || typeof supaReq !== 'function') return null;
    const variants = [key];
    const trimmed = key.replace(/^0+/, '');
    if (trimmed && trimmed !== key) variants.push(trimmed);
    const fmt = key.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    if (fmt) variants.push(fmt);
    for (const v of variants) {
      try {
        const rows = await supaReq(
          'GET',
          'rh_employees',
          null,
          `?cpf=eq.${encodeURIComponent(v)}&limit=5`
        );
        if (Array.isArray(rows) && rows[0]) return rows[0];
      } catch (_) { /* next variant */ }
    }
    return null;
  };

  try {
    const online = await tryOnlineRh();
    if (online) {
      emp = (typeof window._normalizeRhEmployeeRow === 'function')
        ? window._normalizeRhEmployeeRow(online)
        : online;
      _upsertLocalEmployee(emp);
      return { emp };
    }
  } catch (e) {
    console.warn('[rh-ops] lookup rh_employees:', e?.message || e);
  }

  try {
    if (typeof DB !== 'undefined' && typeof DB.getRhEmployees === 'function') {
      const list = await DB.getRhEmployees().catch(() => []);
      const norm = (list || []).map((r) =>
        (typeof window._normalizeRhEmployeeRow === 'function') ? window._normalizeRhEmployeeRow(r) : r
      );
      window._allEmployees = norm;
      emp = _empByCpf(key);
      if (emp) return { emp };
    }
  } catch (e) {
    console.warn('[rh-ops] refresh rh_employees:', e?.message || e);
  }

  let user = null;
  try {
    if (typeof DB !== 'undefined' && typeof DB.getUserByCpf === 'function') {
      user = await DB.getUserByCpf(key).catch(() => null);
    }
  } catch (_) { /* noop */ }

  if (!user) {
    try {
      let users = window._allSystemUsersCache || [];
      if (!users.length && typeof DB !== 'undefined' && typeof DB.getAllUsers === 'function') {
        users = await DB.getAllUsers().catch(() => []);
        window._allSystemUsersCache = users || [];
      }
      user = (users || []).find((u) => _cpfKey(u.cpf) === key) || null;
    } catch (_) { /* noop */ }
  }

  if (user) {
    emp = (window._allEmployees || []).find((e) =>
      String(e.id) === String(user.id)
      || String(e.user_id || '') === String(user.id)
      || _empMatchesCpf(e, key)
    ) || null;
    if (emp) return { emp };

    /* getUserByCpf pode devolver id de rh_employees (fallback) — não criar duplicata */
    if (user.id && typeof DB !== 'undefined' && DB.online && typeof supaReq === 'function') {
      try {
        const byId = await supaReq(
          'GET',
          'rh_employees',
          null,
          `?id=eq.${encodeURIComponent(user.id)}&limit=1`
        );
        if (Array.isArray(byId) && byId[0]) {
          emp = (typeof window._normalizeRhEmployeeRow === 'function')
            ? window._normalizeRhEmployeeRow(byId[0])
            : byId[0];
          _upsertLocalEmployee(emp);
          return { emp };
        }
      } catch (_) { /* continua */ }
    }

    const shape = _userToRhEmpShape(user);
    try {
      if (typeof DB !== 'undefined' && typeof DB.saveRhEmployee === 'function') {
        const saved = await DB.saveRhEmployee({
          cpf: key,
          nome: shape.nome,
          user_id: user.id,
          contato: shape.contato,
          email: shape.email,
          email_pessoal: shape.email_pessoal,
          matricula: shape.matricula,
          departamento: shape.departamento,
          status: 'ativo',
        });
        emp = (typeof window._normalizeRhEmployeeRow === 'function')
          ? window._normalizeRhEmployeeRow(saved)
          : saved;
        _upsertLocalEmployee(emp);
        return { emp };
      }
    } catch (e) {
      console.warn('[rh-ops] auto-create rh_employee from user:', e?.message || e);
    }
    shape.id = user.id;
    _upsertLocalEmployee(shape);
    return { emp: shape };
  }

  return { error: 'Funcionário não encontrado para este CPF.' };
}

function _activeEmployees() {
  const base = typeof window._rhCompanyEmployees === 'function'
    ? window._rhCompanyEmployees(window._allEmployees)
    : (window._allEmployees || []);
  return base.filter(e => !e.demitido && e.status !== 'demitido');
}

function _fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
}

function _openRhModal(id) {
  if (typeof openModalRH === 'function') openModalRH(id);
  else if (typeof openModal === 'function') openModal(id);
  else document.getElementById(id)?.classList.add('open');
}

function _closeRhModal(id) {
  if (typeof closeModalRH === 'function') closeModalRH(id);
  else if (typeof closeModal === 'function') closeModal(id);
  else document.getElementById(id)?.classList.remove('open');
}

function _fillEmployeeSelect(selectId, activeOnly = true) {
  const el = document.getElementById(selectId);
  if (!el) return;
  const list = activeOnly ? _activeEmployees() : (window._allEmployees || []);
  el.innerHTML = '<option value="">Selecione...</option>' + list.map(e =>
    `<option value="${_esc(e.id)}">${_esc(e.nome)} — ${_esc(e.cpf || '')}</option>`
  ).join('');
}

function _renderEmpInfoPanel(panelId, emp) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  if (!emp) {
    if (window.RhUi) RhUi.hide(panel);
    else { panel.hidden = true; panel.classList.add('d-none'); }
    panel.innerHTML = '';
    return;
  }
  panel.classList.add('alert', 'alert-secondary', 'small', 'mb-3');
  panel.innerHTML = `
    <strong>${_esc(emp.nome)}</strong><br/>
    CPF: ${_esc(emp.cpf || '—')} · Matrícula: ${_esc(emp.matricula || '—')}<br/>
    Cargo: ${_esc(emp.cargo || '—')} · Depto: ${_esc(emp.departamento || '—')}<br/>
    Supervisor: ${_esc(emp.supervisor || '—')} · Advertências: ${parseInt(emp.advertencias, 10) || 0} · Suspensões: ${parseInt(emp.suspensoes, 10) || 0}
  `;
  if (window.RhUi) RhUi.show(panel);
  else { panel.hidden = false; panel.classList.remove('d-none'); }
}

function _gerarProtocoloRh(prefix) {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = String(Date.now()).slice(-4);
  return `${prefix}-${ymd}-${seq}`;
}

function gerarProtocoloJustificativa() {
  return _gerarProtocoloRh('JF');
}

function _gerarProtocoloPunicao() {
  return _gerarProtocoloRh('PUN');
}

function _gerarProtocoloDemissao() {
  return _gerarProtocoloRh('DEM');
}

function _diffDays(start, end) {
  if (!start || !end) return 0;
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  const ms = b - a;
  if (ms < 0) return 0;
  return Math.floor(ms / 86400000) + 1;
}

function _parseJustifHoras(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

function _formatJustifHoras(n) {
  const h = _parseJustifHoras(n);
  if (!h) return '';
  return h % 1 === 0 ? String(h) : h.toFixed(1).replace(/\.0$/, '');
}

function _formatJustifDuracao(r) {
  const dias = parseInt(r?.dias, 10) || 0;
  const horas = _parseJustifHoras(r?.horas);
  const parts = [];
  if (dias > 0) parts.push(`${dias} dia${dias !== 1 ? 's' : ''}`);
  const hLabel = _formatJustifHoras(horas);
  if (hLabel) parts.push(`${hLabel}h`);
  return parts.length ? parts.join(' + ') : '—';
}

async function _findUserForEmployee(emp) {
  if (!emp) return null;
  try {
    const users = await DB.getAllUsers();
    const cpf = _digits(emp.cpf);
    const email = String(emp.email || '').trim().toLowerCase();
    return users.find(u =>
      (cpf && u.cpf && _digits(u.cpf) === cpf)
      || (email && u.email && String(u.email).trim().toLowerCase() === email)
    ) || null;
  } catch (e) {
    console.warn('[rh-ops] usuário:', e);
    return null;
  }
}

async function _setUserActive(emp, active) {
  const u = await _findUserForEmployee(emp);
  if (u?.id && typeof DB.updateUser === 'function') {
    await DB.updateUser(u.id, { active: !!active });
  }
}

async function _uploadRhFile(file, bucket, subPath) {
  if (!file) return '';
  if (typeof uploadImage === 'function') {
    try {
      const url = await uploadImage(file, bucket, subPath);
      return typeof resolvePhotoUrl === 'function' ? (resolvePhotoUrl(url) || url) : url;
    } catch (e) {
      console.warn('[rh-ops] upload:', e?.message || e);
    }
  }
  if (typeof fileToBase64 === 'function') {
    try { return await fileToBase64(file); } catch (_) { /* noop */ }
  }
  return '';
}

/* ── Dados RH Ops ── */
async function reloadRhOpsData() {
  _allJustificativas = await DB.getRhAbsenceJustifications();
  _allPunicoes = await DB.getRhPunishments();
  _allDemissoes = await DB.getRhDismissals();
  renderJustificativaList();
  renderPunicaoList();
  renderDemissaoList();
  renderKanban();
  _fillEmployeeSelect('justif_employee');
}

function openFolhaPagamento() {
  const href = typeof Auth !== 'undefined' && typeof Auth.folhaPagamentoPageHrefFresh === 'function'
    ? Auth.folhaPagamentoPageHrefFresh()
    : (typeof Auth !== 'undefined' && typeof Auth.folhaPagamentoPageHref === 'function'
      ? Auth.folhaPagamentoPageHref()
      : (typeof window.soubluPage === 'function'
        ? window.soubluPage('folha-pagamento.html')
        : (typeof Auth !== 'undefined' && Auth._isInPagesDir?.()
          ? 'folha-pagamento.html'
          : 'pages/folha-pagamento.html')));
  window.location.assign(
    typeof href === 'string' && href.indexOf('http') === 0
      ? href
      : (typeof Auth !== 'undefined' && typeof Auth.resolveHref === 'function' ? Auth.resolveHref(href) : href)
  );
}

/* ── Kanban ── */
function _kanbanColId(stage) {
  return `col-${stage}`;
}

function _resumeStage(r) {
  const s = String(r?.stage || 'triagem').toLowerCase();
  return _KANBAN_STAGES.includes(s) ? s : 'triagem';
}

function _recusadoEnteredAt(r) {
  if (_resumeStage(r) !== 'recusado') return null;
  const raw = r.recusado_at || r.updated_at || r.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function _isRecusadoExpired(r) {
  const entered = _recusadoEnteredAt(r);
  if (!entered) return false;
  return (Date.now() - entered.getTime()) >= _RECUSADO_TTL_MS;
}

function _recusadoExpiryHint(r) {
  const entered = _recusadoEnteredAt(r);
  if (!entered) return '';
  const left = _RECUSADO_TTL_MS - (Date.now() - entered.getTime());
  if (left <= 0) {
    return '<div style="font-size:11px;color:var(--color-danger);margin-top:4px;">Será removido automaticamente</div>';
  }
  const days = Math.max(1, Math.ceil(left / (24 * 60 * 60 * 1000)));
  return `<div style="font-size:11px;color:var(--color-danger);margin-top:4px;">Remove em ${days} dia(s)</div>`;
}

function _applyResumeStageChange(resume, stage) {
  const prev = _resumeStage(resume);
  const now = new Date().toISOString();
  resume.stage = stage;
  resume.updated_at = now;
  if (stage === 'recusado') {
    if (prev !== 'recusado' || !resume.recusado_at) resume.recusado_at = now;
  } else {
    resume.recusado_at = null;
  }
}

async function purgeExpiredRecusados() {
  const list = Array.isArray(window._allResumes) ? window._allResumes.slice() : [];
  const expired = list.filter(_isRecusadoExpired);
  if (!expired.length) return 0;
  for (const r of expired) {
    try {
      if (typeof DB !== 'undefined' && DB.deleteRhResume) await DB.deleteRhResume(r.id);
    } catch (e) {
      console.warn('[RH] purge recusado:', r.id, e);
    }
  }
  const gone = new Set(expired.map((r) => String(r.id)));
  const kept = list.filter((r) => !gone.has(String(r.id)));
  window._allResumes = kept;
return expired.length;
}

window.purgeExpiredRecusados = purgeExpiredRecusados;

function _bindKanbanDnD() {
  if (_kanbanDnDReady) return;
  _kanbanDnDReady = true;

  _KANBAN_STAGES.forEach(stage => {
    const col = document.getElementById(_kanbanColId(stage));
    if (!col) return;

    col.addEventListener('dragover', e => {
      e.preventDefault();
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', async e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const id = _dragResumeId || e.dataTransfer.getData('text/plain');
      if (!id) return;
      const resume = (window._allResumes || []).find(r => String(r.id) === String(id));
      if (!resume || _resumeStage(resume) === stage) return;
      _applyResumeStageChange(resume, stage);
      try {
        await DB.saveRhResume(resume);
        if (typeof showToast === 'function') showToast('Estágio atualizado.', 'success');
        renderKanban();
      } catch (err) {
        console.error('[kanban]', err);
        alert('Não foi possível salvar o estágio do candidato.');
      }
    });
  });
}

function renderKanban() {
  _bindKanbanDnD();
  const resumes = window._allResumes || [];

  _KANBAN_STAGES.forEach(stage => {
    const col = document.getElementById(_kanbanColId(stage));
    if (!col) return;
    const items = resumes.filter(r => _resumeStage(r) === stage);
    if (!items.length) {
      col.innerHTML = '<div class="text-muted" style="font-size:12px;padding:8px;">Nenhum candidato</div>';
      return;
    }
    col.innerHTML = items.map(r => `
      <div class="kanban-card stage-${stage}" draggable="true" data-id="${_esc(r.id)}">
        <div style="font-weight:800;font-size:14px;margin-bottom:4px;">${_esc(r.nome || 'Sem nome')}</div>
        <div style="font-size:12px;color:var(--color-text-muted);">${_esc(r.vaga || 'Vaga não informada')}</div>
        <div style="font-size:11px;color:var(--color-text-muted);margin-top:4px;">${_esc(r.protocolo || '')}</div>
        ${r.data_entrevista ? `<div style="font-size:11px;margin-top:4px;">Entrevista: ${_fmtDate(r.data_entrevista)}</div>` : ''}
        ${stage === 'recusado' ? _recusadoExpiryHint(r) : ''}
        <div class="card-actions" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" class="btn btn-xs btn-outline" onclick="editCurriculo('${_esc(r.id)}')">Editar</button>
          <button type="button" class="btn btn-xs btn-danger" onclick="excluirCurriculo('${_esc(r.id)}')">Excluir</button>
        </div>
      </div>
    `).join('');

    col.querySelectorAll('.kanban-card[draggable]').forEach(card => {
      card.addEventListener('dragstart', e => {
        _dragResumeId = card.dataset.id;
        e.dataTransfer.setData('text/plain', card.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('is-dragging');
      });
      card.addEventListener('dragend', () => {
        _dragResumeId = null;
        card.classList.remove('is-dragging');
      });
    });
  });
}

/* ── Justificativa ── */
function _resetJustifAtestadoUi() {
  _justifAtestadoPending = null;
  const status = document.getElementById('justif_atestado_status');
  const link = document.getElementById('justif_atestado_link');
  if (status) status.textContent = _justifAtestadoUrl ? (_justifAtestadoNome || 'Arquivo anexado') : 'Nenhum arquivo';
  if (link) {
    if (_justifAtestadoUrl) {
      link.href = _justifAtestadoUrl;
      if (window.RhUi) RhUi.show(link);
      else link.style.display = '';
    } else {
      if (window.RhUi) RhUi.hide(link);
      else link.style.display = 'none';
      link.href = '#';
    }
  }
}

function openJustificativaModal(row) {
  const form = document.getElementById('form-justificativa');
  if (form) form.reset();

  _justifAtestadoPending = null;
  _justifAtestadoUrl = '';
  _justifAtestadoNome = '';

  document.getElementById('justif_id').value = '';
  document.getElementById('justificativaModalTitle').textContent = 'Nova Justificativa de Falta';
  document.getElementById('justif_protocolo').value = gerarProtocoloJustificativa();
  _fillEmployeeSelect('justif_employee');
  _renderEmpInfoPanel('justif_emp_info', null);

  const medico = document.getElementById('justif_medico_panel');
  if (medico) {
    if (window.RhUi) RhUi.hide(medico);
    else medico.classList.add('d-none');
  }

  if (row) {
    document.getElementById('justif_id').value = row.id;
    document.getElementById('justificativaModalTitle').textContent = 'Editar Justificativa';
    document.getElementById('justif_protocolo').value = row.protocolo || gerarProtocoloJustificativa();
    document.getElementById('justif_employee').value = row.employee_id || '';
    document.getElementById('justif_situacao').value = row.situacao || 'abonada';
    document.getElementById('justif_dias').value = row.dias ?? '';
    document.getElementById('justif_horas').value = _formatJustifHoras(row.horas) || '';
    document.getElementById('justif_protocolo_inss').value = row.protocolo_inss || '';
    document.getElementById('justif_tipo').value = row.tipo || 'justificada';
    document.getElementById('justif_motivo').value = row.motivo || row.justificativa || '';
    document.getElementById('justif_data_afastamento').value = (row.data_afastamento || '').slice(0, 10);
    document.getElementById('justif_data_retorno').value = (row.data_retorno || '').slice(0, 10);
    document.getElementById('justif_cbo_cod').value = row.cbo_cod || '';
    document.getElementById('justif_cbo_descricao').value = row.cbo_descricao || '';
    document.getElementById('justif_dias_atestado').value = row.dias_atestado ?? '';
    document.getElementById('justif_horas_atestado').value = _formatJustifHoras(row.horas_atestado) || '';
    document.getElementById('justif_intercalado').value = row.atestado_intercalado ? 'sim' : 'nao';
    document.getElementById('justif_protocolo_inss_med').value = row.protocolo_inss_atestado || '';
    document.getElementById('justif_data_termino').value = (row.data_termino || '').slice(0, 10);
    document.getElementById('justif_excecao_abono').value = row.excecao_abono ? 'sim' : 'nao';
    document.getElementById('justif_gerou_advertencia').value = row.gerou_advertencia ? 'sim' : 'nao';
    document.getElementById('justif_diretoria').value = row.diretoria || '';
    _justifAtestadoUrl = row.atestado_anexo_url || '';
    _justifAtestadoNome = row.atestado_anexo_nome || '';
    onJustifEmployeeChange();
    onJustifTipoChange();
    onJustifDatasChange();
  }

  _resetJustifAtestadoUi();
  _openRhModal('justificativaModal');
}

function onJustifEmployeeChange() {
  const emp = _empById(document.getElementById('justif_employee')?.value);
  _renderEmpInfoPanel('justif_emp_info', emp);
}

function buscarDadosJustificativa() {
  onJustifEmployeeChange();
  const emp = _empById(document.getElementById('justif_employee')?.value);
  if (!emp) {
    alert('Selecione um colaborador.');
    return;
  }
  if (emp.diretor_dpto && !document.getElementById('justif_diretoria').value) {
    document.getElementById('justif_diretoria').value = emp.diretor_dpto;
  }
  if (typeof showToast === 'function') showToast('Dados do colaborador carregados.', 'success');
}

function onJustifTipoChange() {
  const tipo = document.getElementById('justif_tipo')?.value;
  const panel = document.getElementById('justif_medico_panel');
  if (!panel) return;
  if (window.RhUi) RhUi.toggle(panel, tipo === 'atestado');
  else panel.classList.toggle('d-none', tipo !== 'atestado');
}

function onJustifDatasChange() {
  const ini = document.getElementById('justif_data_afastamento')?.value;
  const fim = document.getElementById('justif_data_retorno')?.value;
  const diasEl = document.getElementById('justif_dias');
  const horasEl = document.getElementById('justif_horas');
  if (ini && fim && diasEl && diasEl.value === '') {
    diasEl.value = ini === fim ? '0' : String(_diffDays(ini, fim));
  }
  if (ini && fim && ini === fim && horasEl && horasEl.value === '') {
    horasEl.placeholder = 'Ex: 4 (período vespertino)';
  }
  if (document.getElementById('justif_tipo')?.value === 'atestado') {
    const diasAtest = document.getElementById('justif_dias_atestado');
    if (ini && fim && diasAtest && diasAtest.value === '') {
      diasAtest.value = ini === fim ? '0' : String(_diffDays(ini, fim));
    }
    const horasAtest = document.getElementById('justif_horas_atestado');
    if (ini && fim && ini === fim && horasAtest && horasAtest.value === '') {
      horasAtest.placeholder = 'Ex: 4';
    }
    const term = document.getElementById('justif_data_termino');
    if (term && fim && !term.value) term.value = fim;
  }
}

function onJustifAtestadoPick(input) {
  const file = input?.files?.[0];
  if (!file) return;
  _justifAtestadoPending = file;
  _justifAtestadoNome = file.name;
  const status = document.getElementById('justif_atestado_status');
  if (status) status.textContent = file.name;
}

async function salvarJustificativa(event) {
  if (event) event.preventDefault();

  const id = document.getElementById('justif_id').value;
  const empId = document.getElementById('justif_employee').value;
  const emp = _empById(empId);
  if (!emp) { alert('Selecione um colaborador.'); return; }

  const motivo = document.getElementById('justif_motivo').value.trim();
  if (!motivo) { alert('Preencha a justificativa.'); return; }

  const protocolo = document.getElementById('justif_protocolo').value || gerarProtocoloJustificativa();
  let atestadoUrl = _justifAtestadoUrl;
  let atestadoNome = _justifAtestadoNome;

  if (_justifAtestadoPending) {
    const sub = String(protocolo).replace(/[^a-zA-Z0-9_-]/g, '_');
    atestadoUrl = await _uploadRhFile(_justifAtestadoPending, 'rh-justificativa', `atestados/${sub}`);
    atestadoNome = _justifAtestadoPending.name;
  }

  const dataAfast = document.getElementById('justif_data_afastamento').value;
  const dataRet = document.getElementById('justif_data_retorno').value;
  const dias = parseInt(document.getElementById('justif_dias').value, 10) || 0;
  const horas = _parseJustifHoras(document.getElementById('justif_horas').value);
  if (!dias && !horas) {
    alert('Informe a duração da falta em dias e/ou horas.');
    return;
  }

  if (typeof DB.ensureRhTablesOnline === 'function') {
    await DB.ensureRhTablesOnline(true).catch(() => null);
  }

  const row = {
    id: id || undefined,
    protocolo,
    employee_id: emp.id,
    employee_cpf: emp.cpf,
    employee_nome: emp.nome,
    situacao: document.getElementById('justif_situacao').value,
    status: 'aprovada',
    tipo: document.getElementById('justif_tipo').value,
    dias,
    horas: horas || null,
    protocolo_inss: document.getElementById('justif_protocolo_inss').value.trim(),
    motivo,
    justificativa: motivo,
    data_afastamento: dataAfast || null,
    data_retorno: dataRet || null,
    data_termino: document.getElementById('justif_data_termino').value || null,
    cbo_cod: document.getElementById('justif_cbo_cod').value.trim(),
    cbo_descricao: document.getElementById('justif_cbo_descricao').value.trim(),
    dias_atestado: parseInt(document.getElementById('justif_dias_atestado').value, 10) || 0,
    horas_atestado: _parseJustifHoras(document.getElementById('justif_horas_atestado').value) || null,
    atestado_intercalado: document.getElementById('justif_intercalado').value === 'sim',
    protocolo_inss_atestado: document.getElementById('justif_protocolo_inss_med').value.trim(),
    excecao_abono: document.getElementById('justif_excecao_abono').value === 'sim',
    gerou_advertencia: document.getElementById('justif_gerou_advertencia').value === 'sim',
    diretoria: document.getElementById('justif_diretoria').value.trim(),
    atestado_anexo_url: atestadoUrl || null,
    atestado_anexo_nome: atestadoNome || null,
    registrado_por: _rhAuthor(),
  };

  await DB.saveRhAbsenceJustification(row);

  const hoje = new Date().toISOString().slice(0, 10);
  if (dataAfast && dataAfast <= hoje && (!dataRet || dataRet > hoje)) {
    await _setUserActive(emp, false);
  }
  if (dataRet && dataRet <= hoje) {
    await _setUserActive(emp, true);
  }

  _closeRhModal('justificativaModal');
  await reloadRhOpsData();
  if (typeof showToast === 'function') showToast('Justificativa salva com sucesso!', 'success');
  else alert('Justificativa salva com sucesso!');
}

function editJustificativa(id) {
  const row = _allJustificativas.find(r => r.id === id);
  if (row) openJustificativaModal(row);
}

function renderJustificativaList() {
  const tbody = document.getElementById('justificativa_list_body');
  if (!tbody) return;
  if (!_allJustificativas.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Nenhum registro encontrado.</td></tr>';
    return;
  }
  tbody.innerHTML = _allJustificativas.map(r => `
    <tr>
      <td><strong>${_esc(r.protocolo || '—')}</strong></td>
      <td>${_esc(r.employee_nome)}</td>
      <td>${_esc(_JUSTIF_SITUACAO[r.situacao] || r.situacao || '—')}</td>
      <td>${_esc(_formatJustifDuracao(r))}</td>
      <td>${_fmtDate(r.data_afastamento)}</td>
      <td>${_fmtDate(r.data_retorno)}</td>
      <td><button type="button" class="btn btn-xs btn-outline" onclick="editJustificativa('${_esc(r.id)}')">Editar</button></td>
    </tr>
  `).join('');
}

/* ── Punição ── */
function _fillPunicaoMotivos(tipo) {
  const sel = document.getElementById('punicao_motivo');
  if (!sel) return;
  const list = _PUNICAO_MOTIVOS[tipo] || [];
  sel.innerHTML = '<option value="">Selecione o motivo...</option>' +
    list.map(m => `<option value="${_esc(m.v)}">${_esc(m.l)}</option>`).join('');
}

function _punicaoMotivoLabel(tipo, cod) {
  const m = (_PUNICAO_MOTIVOS[tipo] || []).find(x => x.v === cod);
  return m?.l || cod || '—';
}

function _countPunicoesEmp(empId, tipo) {
  return _allPunicoes.filter(p =>
    String(p.employee_id) === String(empId) && (!tipo || p.tipo === tipo)
  ).length;
}

function onPunicaoTipoChange() {
  const tipo = document.getElementById('punicao_tipo')?.value;
  const suspPanel = document.getElementById('punicao_suspensao_fields');
  const testPanel = document.getElementById('punicao_testemunhas_panel');
  const inativPanel = document.getElementById('punicao_inativar_panel');
  const justaPanel = document.getElementById('punicao_justa_causa_panel');
  const metricaPanel = document.getElementById('punicao_metrica_panel');
  const motivoGroup = document.getElementById('punicao_motivo_group');
  const complemento = document.getElementById('punicao_complemento_group');
  const submitBtn = document.getElementById('punicao_submit_btn');

  _fillPunicaoMotivos(tipo);

  const disciplinar = ['advertencia_verbal', 'advertencia', 'suspensao', 'justa_causa'].includes(tipo);
  const precisaTest = ['advertencia', 'suspensao'].includes(tipo);

  if (suspPanel) suspPanel.style.display = tipo === 'suspensao' ? '' : 'none';
  if (testPanel) testPanel.style.display = precisaTest ? '' : 'none';
  if (justaPanel) justaPanel.style.display = tipo === 'justa_causa' ? '' : 'none';
  if (inativPanel) {
    inativPanel.style.display = ['suspensao', 'justa_causa'].includes(tipo) ? '' : 'none';
    const lbl = document.getElementById('punicao_inativar_label');
    if (lbl) {
      lbl.innerHTML = tipo === 'suspensao' 
        ? '<strong>Inativar sistema</strong> com status em aberto de suspensão'
        : '<strong>Inativar sistema</strong> definitivamente (Desligamento por justa causa)';
    }
  }
  if (motivoGroup) motivoGroup.style.display = disciplinar || tipo === 'observacao' || tipo === 'elogio' ? '' : 'none';
  if (complemento) complemento.style.display = disciplinar ? '' : 'none';

  if (metricaPanel) {
    if (disciplinar) {
      const empId = document.getElementById('punicao_employee')?.value;
      const nAdv = _countPunicoesEmp(empId, 'advertencia');
      const nSusp = _countPunicoesEmp(empId, 'suspensao');
      metricaPanel.style.display = '';
      const imp = document.getElementById('punicao_metrica_impacto');
      const regra = document.getElementById('punicao_metrica_regra');
      if (imp) {
        imp.textContent = tipo === 'advertencia_verbal'
          ? '1ª etapa da progressão disciplinar'
          : tipo === 'advertencia'
            ? `Advertências registradas: ${nAdv} (-10% dos pontos)`
            : tipo === 'suspensao'
              ? `Suspensões registradas: ${nSusp} (-50% dos pontos)`
              : 'Medida grave — Desligamento por justa causa';
      }
      if (regra) {
        regra.textContent = 'Progressão: verbal → advertência → suspensão → justa causa';
      }
    } else {
      metricaPanel.style.display = 'none';
    }
  }

  const hint = document.getElementById('punicao_escalacao_hint');
  if (hint) {
    hint.style.display = disciplinar ? '' : 'none';
    hint.textContent = disciplinar
      ? 'Verifique o histórico do colaborador antes de aplicar a medida.'
      : '';
  }

  if (submitBtn) {
    submitBtn.textContent = tipo === 'elogio'
      ? 'Registrar elogio no sistema SOU + BLU'
      : 'Gerar PDF e notificação no sistema SOU + BLU';
  }
}

function onPunicaoMotivoChange() {
  const tipo = document.getElementById('punicao_tipo')?.value;
  const cod = document.getElementById('punicao_motivo')?.value;
  const comp = document.getElementById('punicao_complemento_group');
  if (comp) comp.style.display = cod === 'outro' || ['advertencia', 'suspensao', 'justa_causa'].includes(tipo) ? '' : 'none';
}

function openPunicaoModal() {
  const form = document.getElementById('form-punicao');
  if (form) form.reset();

  _fillEmployeeSelect('punicao_employee');
  document.getElementById('punicao_responsavel').value = _rhAuthor();
  document.getElementById('punicao_protocolo').value = _gerarProtocoloPunicao();
  document.getElementById('punicao_data').value = new Date().toISOString().slice(0, 10);
  _renderEmpInfoPanel('punicao_emp_info', null);

  const desc = document.getElementById('punicao_descricao');
  if (desc) {
    desc.oninput = () => {
      const c = document.getElementById('punicao_descricao_count');
      if (c) c.textContent = String(desc.value.length);
    };
    desc.dispatchEvent(new Event('input'));
  }

  onPunicaoTipoChange();
  _openRhModal('punicaoModal');
}

function onPunicaoEmployeeChange() {
  const empId = document.getElementById('punicao_employee')?.value;
  const emp = _empById(empId);
  if (!emp) {
    _renderEmpInfoPanel('punicao_emp_info', null);
    onPunicaoTipoChange();
    return;
  }
  if (emp.demitido || emp.status === 'demitido') {
    alert('Este colaborador já está desligado.');
    document.getElementById('punicao_employee').value = '';
    _renderEmpInfoPanel('punicao_emp_info', null);
    onPunicaoTipoChange();
    return;
  }
  const supEl = document.getElementById('punicao_supervisor_nome');
  if (supEl) supEl.value = emp.supervisor || '';
  _renderEmpInfoPanel('punicao_emp_info', emp);
  const mon = document.getElementById('punicao_monitoria');
  if (mon && !mon.value && emp.qualidade_monitoria) mon.value = emp.qualidade_monitoria;
  onPunicaoTipoChange();
}

function buscarDadosPunicao() {
  onPunicaoEmployeeChange();
  const emp = _empById(document.getElementById('punicao_employee')?.value);
  if (!emp) {
    alert('Selecione um colaborador.');
    return;
  }
  if (typeof showToast === 'function') showToast('Dados do colaborador carregados.', 'success');
}

async function buscarTestemunhaPunicao(n) {
  const cpf = document.getElementById(`punicao_test${n}_cpf`)?.value;
  const digits = _digits(cpf);
  if (digits.length !== 11) return;

  const emp = _empByCpf(cpf);
  const info = document.getElementById(`punicao_test${n}_info`);
  const nomeH = document.getElementById(`punicao_test${n}_nome`);

  if (!emp) {
    if (typeof showLoading === 'function') showLoading('Consultando API...');
    try {
      const res = await FonteData.lookupCpf(digits);
      if (typeof hideLoading === 'function') hideLoading();
      if (res && res.ok && res.client?.name) {
        if (nomeH) nomeH.value = res.client.name;
        if (info) {
          info.hidden = false;
          info.innerHTML = `<strong>${_esc(res.client.name)}</strong> — <span class="badge badge-muted">Externa (API)</span>`;
        }
        if (typeof showToast === 'function') showToast('Testemunha externa carregada.', 'success');
      } else {
        if (info) {
          info.hidden = false;
          info.innerHTML = '<span style="color:#dc2626;">Testemunha não encontrada no RH nem na API.</span>';
        }
        if (nomeH) nomeH.value = '';
      }
    } catch(err) {
      if (typeof hideLoading === 'function') hideLoading();
      if (info) {
        info.hidden = false;
        info.innerHTML = '<span style="color:#dc2626;">Erro ao consultar API externa.</span>';
      }
    }
    return;
  }

  if (nomeH) nomeH.value = emp.nome || '';
  if (info) {
    info.hidden = false;
    info.innerHTML = `<strong>${_esc(emp.nome)}</strong> — ${_esc(emp.cargo || '—')} / ${_esc(emp.departamento || '—')}`;
  }
}

async function _syncPunicaoUserPoints(emp, pts, titulo) {
  if (!pts || pts <= 0) return;
  const u = await _findUserForEmployee(emp);
  if (u?.id && typeof DB.deductBalance === 'function') {
    const sess = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    await DB.deductBalance(u.id, pts, `Punição RH: ${titulo}`, sess?.id || 'rh');
  }
}

async function salvarPunicao(event) {
  if (event) event.preventDefault();

  const isNew = !document.getElementById('punicao_id')?.value;
  const emp = _empById(document.getElementById('punicao_employee')?.value);
  if (!emp) {
    alert('Selecione um colaborador.');
    return;
  }

  const tipo = document.getElementById('punicao_tipo').value;
  const motivoCod = document.getElementById('punicao_motivo').value;
  const descricao = document.getElementById('punicao_descricao').value.trim();
  const dataOcorrencia = document.getElementById('punicao_data').value;
  const dias = parseInt(document.getElementById('punicao_dias').value, 10) || 0;

  if (!dataOcorrencia || !descricao) {
    alert('Preencha data e descrição.');
    return;
  }
  if (['advertencia_verbal', 'advertencia', 'suspensao', 'justa_causa'].includes(tipo) && !motivoCod) {
    alert('Selecione o motivo da punição.');
    return;
  }

  const titulo = _punicaoMotivoLabel(tipo, motivoCod);
  
  // Calculate dynamic point deduction (10% or 50% of current balance)
  let descontoPontos = 0;
  const u = await _findUserForEmployee(emp);
  if (u && u.id && typeof DB.getUser === 'function' && (tipo === 'advertencia' || tipo === 'suspensao')) {
    const uData = await DB.getUser(u.id);
    const balance = parseInt(uData.balance, 10) || 0;
    if (balance > 0) {
      if (tipo === 'advertencia') descontoPontos = Math.floor(balance * 0.10);
      else if (tipo === 'suspensao') descontoPontos = Math.floor(balance * 0.50);
    }
  }

  const row = {
    id: document.getElementById('punicao_id')?.value || undefined,
    protocolo: document.getElementById('punicao_protocolo').value || _gerarProtocoloPunicao(),
    employee_id: emp.id,
    employee_cpf: emp.cpf,
    employee_nome: emp.nome,
    tipo,
    motivo_codigo: motivoCod,
    titulo,
    sub_motivo: document.getElementById('punicao_sub_motivo').value.trim(),
    descricao,
    data_ocorrencia: dataOcorrencia,
    dias_suspensao: tipo === 'suspensao' ? dias : 0,
    desconto_pontos: descontoPontos,
    status: 'registrada',
    registrado_por: document.getElementById('punicao_responsavel').value || _rhAuthor(),
    origem: JSON.stringify({
      monitoria: document.getElementById('punicao_monitoria').value.trim(),
      supervisor: document.getElementById('punicao_supervisor_nome')?.value.trim() || '',
      notificar_supervisor: document.getElementById('punicao_notificar_supervisor')?.checked !== false,
      testemunha1_cpf: document.getElementById('punicao_test1_cpf')?.value || '',
      testemunha1_nome: document.getElementById('punicao_test1_nome')?.value || '',
      testemunha2_cpf: document.getElementById('punicao_test2_cpf')?.value || '',
      testemunha2_nome: document.getElementById('punicao_test2_nome')?.value || '',
      inativar_sistema: document.getElementById('punicao_inativar_sistema')?.checked !== false,
      responsavel_juridico: document.getElementById('punicao_responsavel_juridico')?.value.trim() || '',
      notificacao_extrajudicial: document.getElementById('punicao_notificacao_extrajudicial')?.value || 'nao',
      data_notificacao: document.getElementById('punicao_data_notificacao')?.value || null,
      protocolo_cartorio: document.getElementById('punicao_protocolo_cartorio')?.value.trim() || '',
      boletim_ocorrencia: document.getElementById('punicao_boletim_ocorrencia')?.value || 'nao',
      num_boletim: document.getElementById('punicao_num_boletim')?.value.trim() || '',
      num_processo: document.getElementById('punicao_num_processo')?.value.trim() || '',
      tribunal: document.getElementById('punicao_tribunal')?.value.trim() || ''
    }),
  };

  await DB.saveRhPunishment(row);

  if (isNew) {
    if (tipo === 'advertencia' || tipo === 'advertencia_verbal') {
      emp.advertencias = (parseInt(emp.advertencias, 10) || 0) + 1;
      await DB.saveRhEmployee(emp);
      if (tipo === 'advertencia') await _syncPunicaoUserPoints(emp, descontoPontos, titulo);
    } else if (tipo === 'suspensao') {
      emp.suspensoes = (parseInt(emp.suspensoes, 10) || 0) + 1;
      await DB.saveRhEmployee(emp);
      await _syncPunicaoUserPoints(emp, descontoPontos, titulo);
      if (document.getElementById('punicao_inativar_sistema')?.checked) {
        await _setUserActive(emp, false);
      }
    } else if (tipo === 'justa_causa') {
      emp.status = 'demitido';
      emp.tipo_demissao = 'justa_causa';
      emp.motivo_demissao = descricao;
      emp.data_demissao = dataOcorrencia;
      await DB.saveRhEmployee(emp);
      if (document.getElementById('punicao_inativar_sistema')?.checked) {
        await _setUserActive(emp, false);
      }
    }
  }

  _closeRhModal('punicaoModal');
  if (typeof reloadAllData === 'function') await reloadAllData();
  await reloadRhOpsData();
  if (typeof showToast === 'function') showToast('Registro de punição salvo!', 'success');
  else alert('Registro de punição salvo!');
}

function renderPunicaoList() {
  const tbody = document.getElementById('punicao_list_body');
  if (!tbody) return;
  if (!_allPunicoes.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Nenhum registro encontrado.</td></tr>';
    return;
  }
  tbody.innerHTML = _allPunicoes.map(r => {
    const tc = _PUNICAO_TIPO[r.tipo] || { label: r.tipo, cls: 'badge-muted' };
    return `
      <tr>
        <td><strong>${_esc(r.protocolo || '—')}</strong></td>
        <td>${_esc(r.employee_nome)}</td>
        <td>${_fmtDate(r.data_ocorrencia)}</td>
        <td><span class="badge ${tc.cls}">${tc.label}</span></td>
        <td><span class="badge badge-muted">${_esc(r.status || 'registrada')}</span></td>
        <td>
          <button type="button" class="btn btn-xs btn-outline" onclick="viewPunicao('${_esc(r.id)}')">Ver/Editar</button>
          <button type="button" class="btn btn-xs btn-danger" onclick="excluirPunicao('${_esc(r.id)}')">Apagar</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function excluirPunicao(id) {
  if (!confirm('Deseja realmente apagar este registro de punição? Esta ação não pode ser desfeita.')) return;
  const p = _allPunicoes.find(x => String(x.id) === String(id));
  if (p) {
     const emp = _empById(p.employee_id) || _empByCpf(p.employee_cpf);
     if (emp) {
        if (p.tipo === 'advertencia' || p.tipo === 'advertencia_verbal') {
           emp.advertencias = Math.max(0, (parseInt(emp.advertencias, 10) || 0) - 1);
        } else if (p.tipo === 'suspensao') {
           emp.suspensoes = Math.max(0, (parseInt(emp.suspensoes, 10) || 0) - 1);
        }
        await DB.saveRhEmployee(emp);
        if (p.desconto_pontos > 0) {
           const u = await _findUserForEmployee(emp);
           if (u && typeof DB.addBalance === 'function') {
              const sess = typeof Auth !== 'undefined' ? Auth.getSession() : null;
              await DB.addBalance(u.id, p.desconto_pontos, `Estorno: ${p.titulo || 'Punição cancelada'}`, sess?.id || 'rh');
           }
        }
     }
  }
  await DB.deleteRhPunishment(id);
  await reloadRhOpsData();
  if (typeof showToast === 'function') showToast('Punição apagada.', 'success');
}

function viewPunicao(id) {
  const p = _allPunicoes.find(r => String(r.id) === String(id));
  if (!p) return;
  const form = document.getElementById('form-punicao');
  if (form) form.reset();

  _fillEmployeeSelect('punicao_employee');
  
  if (document.getElementById('punicao_id')) document.getElementById('punicao_id').value = p.id;
  const empMatch = _empById(p.employee_id) || _empByCpf(p.employee_cpf);
  const sel = document.getElementById('punicao_employee');
  if (sel) sel.value = empMatch?.id || p.employee_id || '';
  document.getElementById('punicao_protocolo').value = p.protocolo || '';
  document.getElementById('punicao_responsavel').value = p.registrado_por || '';
  document.getElementById('punicao_tipo').value = p.tipo || 'advertencia_verbal';
  document.getElementById('punicao_data').value = p.data_ocorrencia ? p.data_ocorrencia.slice(0, 10) : '';
  
  onPunicaoTipoChange();
  
  document.getElementById('punicao_motivo').value = p.motivo_codigo || '';
  document.getElementById('punicao_sub_motivo').value = p.sub_motivo || '';
  document.getElementById('punicao_descricao').value = p.descricao || '';
  document.getElementById('punicao_dias').value = p.dias_suspensao || 1;
  
  let o = {};
  try { o = JSON.parse(p.origem || '{}'); } catch(e){}
  document.getElementById('punicao_monitoria').value = o.monitoria || '';
  document.getElementById('punicao_supervisor_nome').value = o.supervisor || '';
  const chkSuper = document.getElementById('punicao_notificar_supervisor');
  if (chkSuper) chkSuper.checked = o.notificar_supervisor !== false;
  
  document.getElementById('punicao_test1_cpf').value = o.testemunha1_cpf || '';
  document.getElementById('punicao_test1_nome').value = o.testemunha1_nome || '';
  if (o.testemunha1_cpf) buscarTestemunhaPunicao(1);
  else { const i = document.getElementById('punicao_test1_info'); if (i) i.hidden = true; }
  
  document.getElementById('punicao_test2_cpf').value = o.testemunha2_cpf || '';
  document.getElementById('punicao_test2_nome').value = o.testemunha2_nome || '';
  if (o.testemunha2_cpf) buscarTestemunhaPunicao(2);
  else { const i = document.getElementById('punicao_test2_info'); if (i) i.hidden = true; }
  
  const chkInat = document.getElementById('punicao_inativar_sistema');
  if (chkInat) chkInat.checked = o.inativar_sistema !== false;
  
  document.getElementById('punicao_responsavel_juridico').value = o.responsavel_juridico || '';
  document.getElementById('punicao_notificacao_extrajudicial').value = o.notificacao_extrajudicial || 'nao';
  document.getElementById('punicao_data_notificacao').value = o.data_notificacao || '';
  document.getElementById('punicao_protocolo_cartorio').value = o.protocolo_cartorio || '';
  document.getElementById('punicao_boletim_ocorrencia').value = o.boletim_ocorrencia || 'nao';
  document.getElementById('punicao_num_boletim').value = o.num_boletim || '';
  document.getElementById('punicao_num_processo').value = o.num_processo || '';
  document.getElementById('punicao_tribunal').value = o.tribunal || '';

  onPunicaoMotivoChange();
  
  onPunicaoEmployeeChange();
  if (!empMatch && p.employee_nome) {
    const panel = document.getElementById('punicao_emp_info');
    if (panel) {
      panel.hidden = false;
      panel.innerHTML = `<strong>${_esc(p.employee_nome)}</strong> — ${_esc(p.employee_cpf || '—')}`;
    }
  }
  
  document.getElementById('punicaoModalTitle').textContent = 'Editar Registro de Punição';
  _openRhModal('punicaoModal');
}

/* ── Demissão ── */
function _resetDemAnexosUi() {
  ['aviso', 'carta', 'entrevista'].forEach(k => {
    const st = document.getElementById(`dem_anexo_${k}_status`);
    const url = _demAnexoUrls[k];
    if (st) st.textContent = url ? 'Arquivo anexado' : 'Nenhum arquivo';
  });
}

function viewDemissao(id) {
  const row = _allDemissoes.find(r => r.id === id);
  if (row) openDemissaoModal(row);
}

function openDemissaoModal(row) {
  const form = document.getElementById('form-demissao');
  if (form) form.reset();

  _demAnexoPending = { aviso: null, carta: null, entrevista: null };
  _demAnexoUrls = { aviso: '', carta: '', entrevista: '' };

  document.getElementById('demissao_id').value = '';
  document.getElementById('demissao_employee_id').value = '';
  document.getElementById('demissao_protocolo').value = _gerarProtocoloDemissao();
  document.getElementById('demissao_data_solicitacao').value = new Date().toISOString().slice(0, 10);
  document.getElementById('demissao_solicitante').value = _rhAuthor();
  _renderEmpInfoPanel('demissao_emp_info', null);
  onDemissaoAvisoChange();

  if (row) {
    document.getElementById('demissao_id').value = row.id;
    document.getElementById('demissao_protocolo').value = row.protocolo || _gerarProtocoloDemissao();
    document.getElementById('demissao_cpf').value = row.employee_cpf || '';
    document.getElementById('demissao_employee_id').value = row.employee_id || '';
    document.getElementById('demissao_motivo').value = row.motivo || '';
    document.getElementById('demissao_aviso').value = row.aviso_previo || row.tipo_demissao || 'aviso_previo_trabalhado';
    document.getElementById('demissao_data_termino_aviso').value = (row.data_termino_aviso || row.checklist?.data_termino_aviso || '').slice(0, 10);
    document.getElementById('demissao_data_solicitacao').value = (row.data_solicitacao || '').slice(0, 10);
    document.getElementById('demissao_solicitante').value = row.solicitante || '';
    const ck = row.checklist || {};
    document.getElementById('demissao_responsavel_juridico').value = ck.responsavel_juridico || '';
    document.getElementById('demissao_notificacao_extrajudicial').value = ck.notificacao_extrajudicial || 'nao';
    document.getElementById('demissao_data_notificacao').value = (ck.data_notificacao || '').slice(0, 10);
    document.getElementById('demissao_protocolo_cartorio').value = ck.protocolo_cartorio || '';
    document.getElementById('demissao_boletim_ocorrencia').value = ck.boletim_ocorrencia || 'nao';
    document.getElementById('demissao_num_boletim').value = ck.num_boletim || '';
    document.getElementById('demissao_num_processo').value = ck.num_processo || '';
    document.getElementById('demissao_tribunal').value = ck.tribunal || '';
    _demAnexoUrls = {
      aviso: ck.anexo_aviso || '',
      carta: ck.anexo_carta || '',
      entrevista: ck.anexo_entrevista || '',
    };
    buscarDadosDemissao({ quiet: true, fallbackRow: row });
    onDemissaoAvisoChange();
    onDemissaoJustaCausaChange();
  }

  _resetDemAnexosUi();
  _openRhModal('demissaoModal');
}

async function buscarDadosDemissao(opts) {
  const quiet = !!(opts && opts.quiet);
  const fallbackRow = opts && opts.fallbackRow;
  const cpfRaw = document.getElementById('demissao_cpf')?.value;
  if (typeof showLoading === 'function') showLoading('Buscando colaborador...');
  try {
    let emp = null;
    const empIdHint = document.getElementById('demissao_employee_id')?.value;
    if (empIdHint) emp = _empById(empIdHint);

    const res = emp ? { emp } : await _resolveEmployeeByCpf(cpfRaw);
    emp = res.emp || null;

    if (!emp && fallbackRow && (fallbackRow.employee_nome || fallbackRow.employee_cpf)) {
      emp = {
        id: fallbackRow.employee_id || '',
        cpf: fallbackRow.employee_cpf || cpfRaw || '',
        nome: fallbackRow.employee_nome || '—',
        matricula: '',
        cargo: '',
        departamento: '',
        supervisor: '',
        advertencias: 0,
        suspensoes: 0,
        demitido: true,
        status: 'demitido',
      };
      if (emp.id || emp.cpf) _upsertLocalEmployee(emp);
    }

    if (!emp) {
      if (!quiet) _rhNotify(res.error || 'Funcionário não encontrado para este CPF.', 'warning');
      _renderEmpInfoPanel('demissao_emp_info', null);
      const hid = document.getElementById('demissao_employee_id');
      if (hid && !fallbackRow) hid.value = '';
      return;
    }
    if (!quiet && (emp.demitido || emp.status === 'demitido')) {
      _rhNotify('Este colaborador já consta como desligado.', 'warning');
    }
    const hid = document.getElementById('demissao_employee_id');
    if (hid) hid.value = emp.id || '';
    _renderEmpInfoPanel('demissao_emp_info', emp);
    if (!quiet) _rhNotify('Dados do colaborador carregados.', 'success');
  } catch (e) {
    console.error('[rh-ops] buscarDadosDemissao:', e);
    if (!quiet) _rhNotify(e?.message || 'Falha ao buscar colaborador.', 'error');
  } finally {
    if (typeof hideLoading === 'function') hideLoading();
  }
}

function onDemissaoAvisoChange() {
  const aviso = document.getElementById('demissao_aviso')?.value;
  const termGroup = document.getElementById('demissao_termino_aviso_group');
  const justaPanel = document.getElementById('demissao_justa_causa_panel');
  const isTrab = aviso === 'aviso_previo_trabalhado';
  const isJusta = aviso === 'justa_causa';

  if (termGroup) {
    termGroup.style.opacity = isTrab ? '1' : '0.55';
    const inp = document.getElementById('demissao_data_termino_aviso');
    if (inp) inp.disabled = !isTrab;
  }
  if (justaPanel) justaPanel.style.display = isJusta ? '' : 'none';
  onDemissaoJustaCausaChange();
}

function onDemissaoJustaCausaChange() {
  const aviso = document.getElementById('demissao_aviso')?.value;
  if (aviso !== 'justa_causa') return;

  const notif = document.getElementById('demissao_notificacao_extrajudicial')?.value === 'sim';
  const dataNotif = document.getElementById('demissao_data_notificacao_group');
  if (dataNotif) dataNotif.style.opacity = notif ? '1' : '0.55';

  const temBo = document.getElementById('demissao_boletim_ocorrencia')?.value === 'sim';
  const boGroup = document.getElementById('demissao_num_boletim_group');
  const boInp = document.getElementById('demissao_num_boletim');
  if (boGroup) boGroup.style.opacity = temBo ? '1' : '0.55';
  if (boInp) boInp.disabled = !temBo;
}

function onDemissaoAnexoPick(kind, input) {
  const file = input?.files?.[0];
  if (!file) return;
  _demAnexoPending[kind] = file;
  const st = document.getElementById(`dem_anexo_${kind}_status`);
  if (st) st.textContent = file.name;
}

async function _uploadDemAnexos(protocolo) {
  const out = { ..._demAnexoUrls };
  const sub = String(protocolo || 'dem').replace(/[^a-zA-Z0-9_-]/g, '_');
  for (const kind of ['aviso', 'carta', 'entrevista']) {
    const file = _demAnexoPending[kind];
    if (!file) continue;
    out[kind] = await _uploadRhFile(file, 'rh-demissao', `${sub}/${kind}`);
  }
  return out;
}

async function salvarDemissao(event) {
  if (event) event.preventDefault();

  let empId = document.getElementById('demissao_employee_id').value;
  let emp = _empById(empId);
  if (!emp) {
    const resolved = await _resolveEmployeeByCpf(document.getElementById('demissao_cpf')?.value);
    emp = resolved.emp || null;
    if (emp?.id) {
      empId = emp.id;
      const hid = document.getElementById('demissao_employee_id');
      if (hid) hid.value = empId;
    }
  }
  if (!emp) {
    _rhNotify('Busque o CPF do colaborador antes de salvar.', 'warning');
    return;
  }

  const motivo = document.getElementById('demissao_motivo').value.trim();
  const dataSol = document.getElementById('demissao_data_solicitacao').value;
  const solicitante = document.getElementById('demissao_solicitante').value.trim();
  if (!motivo || !dataSol || !solicitante) {
    _rhNotify('Preencha motivo, data da solicitação e solicitante.', 'warning');
    return;
  }

  if (!confirm(`Confirmar demissão de ${emp.nome}?`)) return;

  const protocolo = document.getElementById('demissao_protocolo').value || _gerarProtocoloDemissao();
  const anexos = await _uploadDemAnexos(protocolo);
  const aviso = document.getElementById('demissao_aviso').value;

  const row = {
    id: document.getElementById('demissao_id').value || undefined,
    protocolo,
    employee_id: emp.id,
    employee_cpf: emp.cpf,
    employee_nome: emp.nome,
    tipo_demissao: aviso,
    aviso_previo: aviso,
    motivo,
    data_solicitacao: dataSol,
    solicitante,
    status: 'concluida',
    checklist: {
      data_termino_aviso: document.getElementById('demissao_data_termino_aviso').value || null,
      responsavel_juridico: document.getElementById('demissao_responsavel_juridico').value.trim(),
      notificacao_extrajudicial: document.getElementById('demissao_notificacao_extrajudicial').value,
      data_notificacao: document.getElementById('demissao_data_notificacao').value || null,
      protocolo_cartorio: document.getElementById('demissao_protocolo_cartorio').value.trim(),
      boletim_ocorrencia: document.getElementById('demissao_boletim_ocorrencia').value,
      num_boletim: document.getElementById('demissao_num_boletim').value.trim(),
      num_processo: document.getElementById('demissao_num_processo').value.trim(),
      tribunal: document.getElementById('demissao_tribunal').value.trim(),
      anexo_aviso: anexos.aviso || '',
      anexo_carta: anexos.carta || '',
      anexo_entrevista: anexos.entrevista || '',
    },
    registrado_por: _rhAuthor(),
  };

  await DB.saveRhDismissal(row);

  emp.demitido = true;
  emp.status = 'demitido';
  emp.data_demissao = dataSol;
  emp.motivo_demissao = motivo;
  emp.tipo_demissao = aviso;
  await DB.saveRhEmployee(emp);
  await _setUserActive(emp, false);

  _closeRhModal('demissaoModal');
  if (typeof reloadAllData === 'function') await reloadAllData();
  await reloadRhOpsData();
  _rhNotify('Demissão registrada com sucesso!', 'success');
}

function renderDemissaoList() {
  const tbody = document.getElementById('demissao_list_body');
  if (!tbody) return;
  if (!_allDemissoes.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Nenhum registro encontrado.</td></tr>';
    return;
  }
  tbody.innerHTML = _allDemissoes.map(r => `
    <tr>
      <td><strong>${_esc(r.protocolo || '—')}</strong></td>
      <td>${_esc(r.employee_nome)}</td>
      <td>${_fmtDate(r.data_solicitacao)}</td>
      <td>${_esc(_DEMISSAO_AVISO[r.aviso_previo || r.tipo_demissao] || r.aviso_previo || '—')}</td>
      <td style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${_esc(r.motivo)}">${_esc(r.motivo)}</td>
      <td><button type="button" class="btn btn-xs btn-outline" onclick="viewDemissao('${_esc(r.id)}')">Ver</button></td>
    </tr>
  `).join('');
}

/* ── Exportar para window ── */
const _rhOpsExports = {
  reloadRhOpsData,
  openFolhaPagamento,
  renderKanban,
  openJustificativaModal,
  salvarJustificativa,
  editJustificativa,
  renderJustificativaList,
  buscarDadosJustificativa,
  onJustifEmployeeChange,
  onJustifTipoChange,
  onJustifDatasChange,
  onJustifAtestadoPick,
  gerarProtocoloJustificativa,
  openPunicaoModal,
  onPunicaoEmployeeChange,
  buscarDadosPunicao,
  buscarTestemunhaPunicao,
  onPunicaoTipoChange,
  onPunicaoMotivoChange,
  salvarPunicao,
  renderPunicaoList,
  viewPunicao,
  excluirPunicao,
  openDemissaoModal,
  buscarDadosDemissao,
  onDemissaoAvisoChange,
  onDemissaoJustaCausaChange,
  onDemissaoAnexoPick,
  salvarDemissao,
  renderDemissaoList,
  viewDemissao,
};

Object.assign(window, _rhOpsExports);
