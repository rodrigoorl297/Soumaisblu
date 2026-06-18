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
    { v: 'atraso', l: 'Atraso recorrente' },
    { v: 'comunicacao', l: 'Falta de comunicação' },
    { v: 'conduta', l: 'Conduta inadequada' },
    { v: 'desempenho', l: 'Baixo desempenho' },
    { v: 'outro', l: 'Outro' },
  ],
  advertencia: [
    { v: 'atraso', l: 'Atraso / absenteísmo' },
    { v: 'desempenho', l: 'Baixo desempenho' },
    { v: 'conduta', l: 'Conduta inadequada' },
    { v: 'descumprimento', l: 'Descumprimento de normas' },
    { v: 'qualidade', l: 'Falha em qualidade / monitoria' },
    { v: 'outro', l: 'Outro' },
  ],
  suspensao: [
    { v: 'reincidencia', l: 'Reincidência disciplinar' },
    { v: 'grave', l: 'Falta grave' },
    { v: 'conduta', l: 'Conduta grave' },
    { v: 'seguranca', l: 'Risco à segurança / integridade' },
    { v: 'outro', l: 'Outro' },
  ],
  justa_causa: [
    { v: 'fraude', l: 'Fraude / má-fé' },
    { v: 'agressao', l: 'Agressão / violência' },
    { v: 'subordinacao', l: 'Insubordinação grave' },
    { v: 'abandono', l: 'Abandono de emprego' },
    { v: 'outro', l: 'Outro' },
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
  sem_aviso: 'Sem aviso prévio',
  pedido_imediato: 'Pedido de demissão imediato',
  justa_causa: 'Justa causa',
};

function _digits(v) {
  return String(v || '').replace(/\D/g, '');
}

function _rhAuthor() {
  const s = typeof Auth !== 'undefined' ? Auth.getSession() : null;
  return s?.name || 'RH';
}

function _empById(id) {
  return (window._allEmployees || []).find(e => String(e.id) === String(id));
}

function _empByCpf(cpf) {
  const d = _digits(cpf);
  if (!d) return null;
  return (window._allEmployees || []).find(e => _digits(e.cpf) === d);
}

function _activeEmployees() {
  return (window._allEmployees || []).filter(e => !e.demitido && e.status !== 'demitido');
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
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  panel.hidden = false;
  panel.innerHTML = `
    <strong>${_esc(emp.nome)}</strong><br/>
    CPF: ${_esc(emp.cpf || '—')} · Matrícula: ${_esc(emp.matricula || '—')}<br/>
    Cargo: ${_esc(emp.cargo || '—')} · Depto: ${_esc(emp.departamento || '—')}<br/>
    Supervisor: ${_esc(emp.supervisor || '—')} · Advertências: ${parseInt(emp.advertencias, 10) || 0} · Suspensões: ${parseInt(emp.suspensoes, 10) || 0}
  `;
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
  const rel = typeof Auth !== 'undefined' && Auth._isInPagesDir?.()
    ? 'folha-pagamento.html'
    : 'pages/folha-pagamento.html';
  window.location.href = typeof Auth.resolveHref === 'function' ? Auth.resolveHref(rel) : rel;
}

/* ── Kanban ── */
function _kanbanColId(stage) {
  return `col-${stage}`;
}

function _resumeStage(r) {
  const s = String(r?.stage || 'triagem').toLowerCase();
  return _KANBAN_STAGES.includes(s) ? s : 'triagem';
}

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
      resume.stage = stage;
      resume.updated_at = new Date().toISOString();
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
        <div class="card-actions" style="margin-top:8px;display:flex;gap:6px;">
          <button type="button" class="btn btn-xs btn-outline" onclick="editCurriculo('${_esc(r.id)}')">Editar</button>
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
      link.style.display = '';
    } else {
      link.style.display = 'none';
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
  if (medico) medico.style.display = 'none';

  if (row) {
    document.getElementById('justif_id').value = row.id;
    document.getElementById('justificativaModalTitle').textContent = 'Editar Justificativa';
    document.getElementById('justif_protocolo').value = row.protocolo || gerarProtocoloJustificativa();
    document.getElementById('justif_employee').value = row.employee_id || '';
    document.getElementById('justif_situacao').value = row.situacao || 'abonada';
    document.getElementById('justif_dias').value = row.dias ?? '';
    document.getElementById('justif_protocolo_inss').value = row.protocolo_inss || '';
    document.getElementById('justif_tipo').value = row.tipo || 'justificada';
    document.getElementById('justif_motivo').value = row.motivo || row.justificativa || '';
    document.getElementById('justif_data_afastamento').value = (row.data_afastamento || '').slice(0, 10);
    document.getElementById('justif_data_retorno').value = (row.data_retorno || '').slice(0, 10);
    document.getElementById('justif_cbo_cod').value = row.cbo_cod || '';
    document.getElementById('justif_cbo_descricao').value = row.cbo_descricao || '';
    document.getElementById('justif_dias_atestado').value = row.dias_atestado ?? '';
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
  if (panel) panel.style.display = tipo === 'atestado' ? '' : 'none';
}

function onJustifDatasChange() {
  const ini = document.getElementById('justif_data_afastamento')?.value;
  const fim = document.getElementById('justif_data_retorno')?.value;
  const diasEl = document.getElementById('justif_dias');
  if (ini && fim && diasEl && !diasEl.value) {
    diasEl.value = String(_diffDays(ini, fim));
  }
  if (document.getElementById('justif_tipo')?.value === 'atestado') {
    const diasAtest = document.getElementById('justif_dias_atestado');
    if (ini && fim && diasAtest && !diasAtest.value) {
      diasAtest.value = String(_diffDays(ini, fim));
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

  const row = {
    id: id || undefined,
    protocolo,
    employee_id: emp.id,
    employee_cpf: emp.cpf,
    employee_nome: emp.nome,
    situacao: document.getElementById('justif_situacao').value,
    status: 'aprovada',
    tipo: document.getElementById('justif_tipo').value,
    dias: parseInt(document.getElementById('justif_dias').value, 10) || 0,
    protocolo_inss: document.getElementById('justif_protocolo_inss').value.trim(),
    motivo,
    justificativa: motivo,
    data_afastamento: dataAfast || null,
    data_retorno: dataRet || null,
    data_termino: document.getElementById('justif_data_termino').value || null,
    cbo_cod: document.getElementById('justif_cbo_cod').value.trim(),
    cbo_descricao: document.getElementById('justif_cbo_descricao').value.trim(),
    dias_atestado: parseInt(document.getElementById('justif_dias_atestado').value, 10) || 0,
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
      <td>${r.dias != null ? r.dias : '—'}</td>
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
  const metricaPanel = document.getElementById('punicao_metrica_panel');
  const motivoGroup = document.getElementById('punicao_motivo_group');
  const complemento = document.getElementById('punicao_complemento_group');
  const submitBtn = document.getElementById('punicao_submit_btn');

  _fillPunicaoMotivos(tipo);

  const disciplinar = ['advertencia_verbal', 'advertencia', 'suspensao', 'justa_causa'].includes(tipo);
  const precisaTest = ['advertencia', 'suspensao', 'justa_causa'].includes(tipo);

  if (suspPanel) suspPanel.style.display = tipo === 'suspensao' ? '' : 'none';
  if (testPanel) testPanel.style.display = precisaTest ? '' : 'none';
  if (inativPanel) inativPanel.style.display = tipo === 'suspensao' ? '' : 'none';
  if (motivoGroup) motivoGroup.style.display = disciplinar || tipo === 'observacao' || tipo === 'elogio' ? '' : 'none';
  if (complemento) complemento.style.display = disciplinar ? '' : 'none';

  if (metricaPanel) {
    if (disciplinar) {
      const empId = document.getElementById('punicao_employee_id')?.value;
      const nAdv = _countPunicoesEmp(empId, 'advertencia');
      const nSusp = _countPunicoesEmp(empId, 'suspensao');
      metricaPanel.style.display = '';
      const imp = document.getElementById('punicao_metrica_impacto');
      const regra = document.getElementById('punicao_metrica_regra');
      if (imp) {
        imp.textContent = tipo === 'advertencia_verbal'
          ? '1ª etapa da progressão disciplinar'
          : tipo === 'advertencia'
            ? `Advertências registradas: ${nAdv}`
            : tipo === 'suspensao'
              ? `Suspensões registradas: ${nSusp}`
              : 'Medida grave — justa causa';
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

  document.getElementById('punicao_employee_id').value = '';
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

function buscarDadosPunicao() {
  const cpf = document.getElementById('punicao_cpf')?.value;
  const emp = _empByCpf(cpf);
  if (!emp) {
    alert('Funcionário não encontrado para este CPF.');
    _renderEmpInfoPanel('punicao_emp_info', null);
    document.getElementById('punicao_employee_id').value = '';
    return;
  }
  if (emp.demitido || emp.status === 'demitido') {
    alert('Este colaborador já está desligado.');
    return;
  }
  document.getElementById('punicao_employee_id').value = emp.id;
  _renderEmpInfoPanel('punicao_emp_info', emp);
  if (!document.getElementById('punicao_monitoria').value && emp.qualidade_monitoria) {
    document.getElementById('punicao_monitoria').value = emp.qualidade_monitoria;
  }
  onPunicaoTipoChange();
  if (typeof showToast === 'function') showToast('Dados do colaborador carregados.', 'success');
}

function buscarTestemunhaPunicao(n) {
  const cpf = document.getElementById(`punicao_test${n}_cpf`)?.value;
  const emp = _empByCpf(cpf);
  const info = document.getElementById(`punicao_test${n}_info`);
  const nomeH = document.getElementById(`punicao_test${n}_nome`);
  if (!emp) {
    if (info) {
      info.hidden = false;
      info.innerHTML = '<span style="color:#dc2626;">Testemunha não encontrada no cadastro RH.</span>';
    }
    if (nomeH) nomeH.value = '';
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

  const empId = document.getElementById('punicao_employee_id').value;
  const emp = _empById(empId);
  if (!emp) { alert('Busque o CPF do colaborador antes de salvar.'); return; }

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
  const descontoPontos = tipo === 'advertencia' ? 100 : 0;

  const row = {
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
      notificar_supervisor: document.getElementById('punicao_notificar_supervisor')?.checked !== false,
      testemunha1_cpf: document.getElementById('punicao_test1_cpf')?.value || '',
      testemunha1_nome: document.getElementById('punicao_test1_nome')?.value || '',
      testemunha2_cpf: document.getElementById('punicao_test2_cpf')?.value || '',
      testemunha2_nome: document.getElementById('punicao_test2_nome')?.value || '',
      inativar_sistema: document.getElementById('punicao_inativar_sistema')?.checked !== false,
    }),
  };

  await DB.saveRhPunishment(row);

  if (tipo === 'advertencia' || tipo === 'advertencia_verbal') {
    emp.advertencias = (parseInt(emp.advertencias, 10) || 0) + 1;
    await DB.saveRhEmployee(emp);
    if (tipo === 'advertencia') await _syncPunicaoUserPoints(emp, descontoPontos, titulo);
  } else if (tipo === 'suspensao') {
    emp.suspensoes = (parseInt(emp.suspensoes, 10) || 0) + 1;
    await DB.saveRhEmployee(emp);
    if (document.getElementById('punicao_inativar_sistema')?.checked) {
      await _setUserActive(emp, false);
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
        <td><span class="text-muted" style="font-size:12px;">${_esc(r.titulo || r.motivo_codigo || '')}</span></td>
      </tr>
    `;
  }).join('');
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
    buscarDadosDemissao();
    onDemissaoAvisoChange();
    onDemissaoJustaCausaChange();
  }

  _resetDemAnexosUi();
  _openRhModal('demissaoModal');
}

function buscarDadosDemissao() {
  const emp = _empByCpf(document.getElementById('demissao_cpf')?.value);
  if (!emp) {
    alert('Funcionário não encontrado para este CPF.');
    _renderEmpInfoPanel('demissao_emp_info', null);
    document.getElementById('demissao_employee_id').value = '';
    return;
  }
  if (emp.demitido || emp.status === 'demitido') {
    alert('Este colaborador já consta como desligado.');
  }
  document.getElementById('demissao_employee_id').value = emp.id;
  _renderEmpInfoPanel('demissao_emp_info', emp);
  if (typeof showToast === 'function') showToast('Dados do colaborador carregados.', 'success');
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

  const empId = document.getElementById('demissao_employee_id').value;
  const emp = _empById(empId);
  if (!emp) { alert('Busque o CPF do colaborador antes de salvar.'); return; }

  const motivo = document.getElementById('demissao_motivo').value.trim();
  const dataSol = document.getElementById('demissao_data_solicitacao').value;
  const solicitante = document.getElementById('demissao_solicitante').value.trim();
  if (!motivo || !dataSol || !solicitante) {
    alert('Preencha motivo, data da solicitação e solicitante.');
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
  if (typeof showToast === 'function') showToast('Demissão registrada com sucesso!', 'success');
  else alert('Demissão registrada com sucesso!');
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
  buscarDadosPunicao,
  buscarTestemunhaPunicao,
  onPunicaoTipoChange,
  onPunicaoMotivoChange,
  salvarPunicao,
  renderPunicaoList,
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
