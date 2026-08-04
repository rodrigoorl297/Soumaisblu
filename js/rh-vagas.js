/* SOU+BLU RH — Módulo Vagas (requisição → aprovação Paulo → processo seletivo) */
(function () {
  'use strict';

  /** Aprovador exclusivo: PAULO ROBERTO COELHO (prod users query 2026-07-24). */
  const VAGAS_APPROVER_IDS = ['master01'];
  const VAGAS_APPROVER_EMAILS = ['paulo@blupromotora.com.br'];

  const STATUS = {
    requisicao_aberta: 'Requisição Aberta',
    aguardando_aprovacao: 'Aguardando Aprovação',
    vaga_liberada: 'Vaga Liberada',
    em_divulgacao: 'Em Divulgação',
    entrevista_inicial: 'Entrevista Inicial',
    entrevista_gestor: 'Entrevista com Gestor',
    etapa_final: 'Etapa Final',
    vaga_preenchida: 'Vaga Preenchida',
    vaga_cancelada: 'Vaga Cancelada',
  };

  const STATUS_FLOW = [
    'aguardando_aprovacao',
    'vaga_liberada',
    'em_divulgacao',
    'entrevista_inicial',
    'entrevista_gestor',
    'etapa_final',
    'vaga_preenchida',
  ];

  const CAND_STATUS = {
    triagem: 'Triagem',
    entrevista_inicial: 'Entrevista Inicial',
    entrevista_gestor: 'Entrevista Gestor',
    etapa_final: 'Etapa Final',
    aprovado: 'Aprovado',
    recusado: 'Recusado',
  };

  const TIPO_LABEL = { substituicao: 'Substituição', aumento_quadro: 'Aumento de Quadro' };
  const PRIO_LABEL = { normal: 'Normal', urgente: 'Urgente' };

  let _vagas = [];
  let _candidatosByVaga = {};
  let _jobs = [];
  let _editingId = null;
  let _detailId = null;
  let _candEditId = null;
  let _filters = { status: '', prioridade: '', q: '' };

  function _esc(s) {
    if (typeof window._esc === 'function') return window._esc(s);
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _user() {
    return (typeof Auth !== 'undefined' && Auth.getSession && Auth.getSession())
      || window.currentUser
      || null;
  }

  function _role() {
    return String(_user()?.role || '').toLowerCase();
  }

  function _normEmail(e) {
    return String(e || '').trim().toLowerCase();
  }

  function _isPauloApprover(u) {
    if (!u) return false;
    const id = String(u.id || '');
    const email = _normEmail(u.email);
    if (VAGAS_APPROVER_IDS.includes(id)) return true;
    if (email && VAGAS_APPROVER_EMAILS.includes(email)) return true;
    return false;
  }

  function _pauloExistsInSessionOrKnown() {
    return VAGAS_APPROVER_IDS.length > 0 || VAGAS_APPROVER_EMAILS.length > 0;
  }

  function canApprove() {
    const u = _user();
    if (_isPauloApprover(u)) return true;
    if (!_pauloExistsInSessionOrKnown()) {
      return !!(typeof Auth !== 'undefined' && (
        (Auth.isMaster && Auth.isMaster()) || (Auth.isFundador && Auth.isFundador())
      ));
    }
    return false;
  }

  function canCreate() {
    const r = _role();
    if (r === 'supervisor' || r === 'sup_backoffice') return true;
    if (typeof Auth !== 'undefined' && Auth.isMaster && Auth.isMaster()) return true;
    if (r === 'fundador' || r === 'desenvolvedor') return true;
    return false;
  }

  function canManageProcess() {
    const r = _role();
    if (['rh', 'master', 'fundador', 'desenvolvedor'].includes(r)) return true;
    if (typeof Auth !== 'undefined' && Auth.isMaster && Auth.isMaster()) return true;
    return false;
  }

  function canView() {
    const r = _role();
    return ['supervisor', 'sup_backoffice', 'rh', 'master', 'fundador', 'desenvolvedor', 'gerente', 'gerencia', 'diretoria'].includes(r)
      || (typeof Auth !== 'undefined' && Auth.isMaster && Auth.isMaster());
  }

  function canAddCandidates(vaga) {
    if (!canManageProcess() || !vaga) return false;
    const st = String(vaga.status || '');
    if (st === 'aguardando_aprovacao' || st === 'requisicao_aberta' || st === 'vaga_cancelada' || st === 'vaga_preenchida') {
      return false;
    }
    const idx = STATUS_FLOW.indexOf(st);
    return idx >= STATUS_FLOW.indexOf('vaga_liberada');
  }

  function statusLabel(key) {
    return STATUS[key] || key || '—';
  }

  function candStatusLabel(key) {
    return CAND_STATUS[key] || key || '—';
  }

  function parseHistory(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string' && raw.trim()) {
      try {
        const p = JSON.parse(raw);
        return Array.isArray(p) ? p : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  function pushHistory(row, action, fromStatus, toStatus, note) {
    const u = _user() || {};
    const hist = parseHistory(row.history);
    hist.push({
      at: new Date().toISOString(),
      by_id: u.id || null,
      by_name: u.name || u.nome || '—',
      action: action || 'update',
      from_status: fromStatus || null,
      to_status: toStatus || null,
      note: note || '',
    });
    row.history = hist;
    return row;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
      return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    } catch {
      return String(iso);
    }
  }

  function toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type || 'info');
    else alert(msg);
  }

  function openModal(id) {
    if (typeof openModalRH === 'function') openModalRH(id);
    else if (typeof window.openModal === 'function') window.openModal(id);
    else document.getElementById(id)?.classList.add('open');
  }

  function closeModal(id) {
    if (typeof closeModalRH === 'function') closeModalRH(id);
    else document.getElementById(id)?.classList.remove('open');
  }

  function ensureModals() {
    if (document.getElementById('vagaRequestModal')) return;
    const wrap = document.createElement('div');
    wrap.id = 'rhVagasModalsHost';
    wrap.innerHTML = `
<div class="modal-overlay" id="vagaRequestModal">
  <div class="modal rh-modal--wide">
    <div class="modal-header">
      <h3 id="vagaRequestTitle">Nova requisição de vaga</h3>
      <button type="button" class="modal-close" onclick="RhVagas.closeRequestModal()"></button>
    </div>
    <div class="modal-body rh-modal-body--scroll">
      <form id="vagaRequestForm" onsubmit="return RhVagas.submitRequest(event)">
        <input type="hidden" id="vaga_edit_id" />
        <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group" style="grid-column:1/-1;">
            <label for="vaga_titulo">Título da vaga *</label>
            <input class="form-control" id="vaga_titulo" required maxlength="255" />
          </div>
          <div class="form-group">
            <label for="vaga_departamento">Departamento</label>
            <input class="form-control" id="vaga_departamento" maxlength="128" />
          </div>
          <div class="form-group">
            <label for="vaga_quantidade">Quantidade *</label>
            <input class="form-control" type="number" id="vaga_quantidade" min="1" value="1" required />
          </div>
          <div class="form-group">
            <label for="vaga_cargo_id">Cargo (cadastro)</label>
            <select class="form-control" id="vaga_cargo_id"></select>
          </div>
          <div class="form-group">
            <label for="vaga_cargo">Cargo (texto)</label>
            <input class="form-control" id="vaga_cargo" maxlength="255" placeholder="Livre se não houver no cadastro" />
          </div>
          <div class="form-group">
            <label for="vaga_tipo">Tipo *</label>
            <select class="form-control" id="vaga_tipo" required>
              <option value="">Selecione...</option>
              <option value="substituicao">Substituição</option>
              <option value="aumento_quadro">Aumento de Quadro</option>
            </select>
          </div>
          <div class="form-group">
            <label for="vaga_prioridade">Prioridade</label>
            <select class="form-control" id="vaga_prioridade">
              <option value="normal">Normal</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>
          <div class="form-group" style="grid-column:1/-1;">
            <label for="vaga_justificativa">Justificativa / Observação *</label>
            <textarea class="form-control" id="vaga_justificativa" rows="4" required></textarea>
          </div>
        </div>
        <div class="flex gap-md mt-lg" style="display:flex;gap:10px;margin-top:16px;">
          <button type="button" class="btn btn-outline" onclick="RhVagas.closeRequestModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary btn-full" id="vaga_request_submit">Enviar para aprovação</button>
        </div>
      </form>
    </div>
  </div>
</div>

<div class="modal-overlay" id="vagaDetailModal">
  <div class="modal" style="max-width:920px;">
    <div class="modal-header">
      <h3 id="vagaDetailTitle">Detalhe da vaga</h3>
      <button type="button" class="modal-close" onclick="RhVagas.closeDetailModal()"></button>
    </div>
    <div class="modal-body rh-modal-body--scroll" id="vagaDetailBody"></div>
  </div>
</div>

<div class="modal-overlay" id="vagaCandModal">
  <div class="modal" style="max-width:640px;">
    <div class="modal-header">
      <h3 id="vagaCandTitle">Candidato</h3>
      <button type="button" class="modal-close" onclick="RhVagas.closeCandModal()"></button>
    </div>
    <div class="modal-body">
      <form id="vagaCandForm" onsubmit="return RhVagas.submitCandidate(event)">
        <input type="hidden" id="vaga_cand_id" />
        <input type="hidden" id="vaga_cand_vaga_id" />
        <div class="form-group">
          <label for="vaga_cand_nome">Nome *</label>
          <input class="form-control" id="vaga_cand_nome" required maxlength="255" />
        </div>
        <div class="form-group">
          <label for="vaga_cand_contato">Contato</label>
          <input class="form-control" id="vaga_cand_contato" maxlength="128" />
        </div>
        <div class="form-group">
          <label for="vaga_cand_curriculo">Currículo (URL)</label>
          <input class="form-control" id="vaga_cand_curriculo" maxlength="512" placeholder="https://..." />
        </div>
        <div class="form-group">
          <label for="vaga_cand_resume_id">Vincular currículo RH (opcional)</label>
          <select class="form-control" id="vaga_cand_resume_id"><option value="">—</option></select>
        </div>
        <div class="form-group">
          <label for="vaga_cand_status">Status no processo</label>
          <select class="form-control" id="vaga_cand_status"></select>
          <span class="rh-field-hint">Triagem → Entrevista Inicial → Entrevista Gestor → Etapa Final → Aprovado / Recusado</span>
        </div>
        <div class="form-group">
          <label for="vaga_cand_obs">Observações RH</label>
          <textarea class="form-control" id="vaga_cand_obs" rows="3"></textarea>
        </div>
        <div class="flex gap-md" style="display:flex;gap:10px;margin-top:12px;">
          <button type="button" class="btn btn-outline" onclick="RhVagas.closeCandModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary btn-full">Salvar candidato</button>
        </div>
      </form>
    </div>
  </div>
</div>`;
    document.body.appendChild(wrap);

    const candSel = document.getElementById('vaga_cand_status');
    if (candSel) {
      candSel.innerHTML = Object.entries(CAND_STATUS)
        .map(([k, lab]) => `<option value="${k}">${_esc(lab)}</option>`)
        .join('');
    }
  }

  async function loadJobs() {
    try {
      _jobs = (typeof DB !== 'undefined' && DB.getRhJobs) ? (await DB.getRhJobs()) || [] : [];
    } catch {
      _jobs = [];
    }
  }

  function fillCargoSelect(selectedId) {
    const sel = document.getElementById('vaga_cargo_id');
    if (!sel) return;
    const opts = ['<option value="">— Livre / sem vínculo —</option>']
      .concat((_jobs || []).map(j => {
        const lab = j.cargo || j.titulo || j.id;
        const selAttr = selectedId && String(j.id) === String(selectedId) ? ' selected' : '';
        return `<option value="${_esc(j.id)}"${selAttr}>${_esc(lab)}</option>`;
      }));
    sel.innerHTML = opts.join('');
  }

  async function loadData() {
    if (typeof DB !== 'undefined' && DB.ensureRhTablesOnline) {
      await DB.ensureRhTablesOnline().catch(() => {});
    }
    const [vagas, allCand] = await Promise.all([
      DB.getRhVagas(),
      DB.getRhVagaCandidatos(),
    ]);
    _vagas = Array.isArray(vagas) ? vagas.filter(v => v && v.active !== false && v.active !== 0) : [];
    _candidatosByVaga = {};
    (allCand || []).forEach(c => {
      const vid = String(c.vaga_id || '');
      if (!vid) return;
      if (!_candidatosByVaga[vid]) _candidatosByVaga[vid] = [];
      _candidatosByVaga[vid].push(c);
    });
  }

  function candCount(vagaId) {
    return (_candidatosByVaga[String(vagaId)] || []).length;
  }

  function kpis() {
    const closed = new Set(['vaga_preenchida', 'vaga_cancelada']);
    let abertas = 0;
    let aguardando = 0;
    let divulgacao = 0;
    let finalizadas = 0;
    let candidatos = 0;
    _vagas.forEach(v => {
      const st = String(v.status || '');
      if (!closed.has(st)) abertas += 1;
      if (st === 'aguardando_aprovacao') aguardando += 1;
      if (st === 'em_divulgacao') divulgacao += 1;
      if (st === 'vaga_preenchida') finalizadas += 1;
      candidatos += candCount(v.id);
    });
    return { abertas, aguardando, divulgacao, finalizadas, candidatos };
  }

  function filteredVagas() {
    const q = String(_filters.q || '').trim().toLowerCase();
    return _vagas.filter(v => {
      if (_filters.status && String(v.status) !== _filters.status) return false;
      if (_filters.prioridade && String(v.prioridade) !== _filters.prioridade) return false;
      if (!q) return true;
      const blob = [v.titulo, v.departamento, v.cargo, v.solicitante_nome, statusLabel(v.status)]
        .join(' ').toLowerCase();
      return blob.includes(q);
    });
  }

  function badgeClass(status) {
    if (status === 'aguardando_aprovacao') return 'rh-vaga-badge rh-vaga-badge--warn';
    if (status === 'vaga_liberada' || status === 'em_divulgacao') return 'rh-vaga-badge rh-vaga-badge--info';
    if (status === 'vaga_preenchida') return 'rh-vaga-badge rh-vaga-badge--ok';
    if (status === 'vaga_cancelada') return 'rh-vaga-badge rh-vaga-badge--muted';
    if (String(status).includes('entrevista') || status === 'etapa_final') return 'rh-vaga-badge rh-vaga-badge--accent';
    return 'rh-vaga-badge';
  }

  function renderShell() {
    const root = document.getElementById('rhVagasRoot');
    if (!root) return;
    const k = kpis();
    const statusOpts = Object.entries(STATUS)
      .map(([k0, lab]) => `<option value="${k0}"${_filters.status === k0 ? ' selected' : ''}>${_esc(lab)}</option>`)
      .join('');
    root.innerHTML = `
      <div class="rh-vagas-kpis">
        <div class="rh-vaga-kpi"><div class="rh-vaga-kpi__val">${k.abertas}</div><div class="rh-vaga-kpi__lab">Vagas abertas</div></div>
        <div class="rh-vaga-kpi rh-vaga-kpi--warn"><div class="rh-vaga-kpi__val">${k.aguardando}</div><div class="rh-vaga-kpi__lab">Aguardando aprovação</div></div>
        <div class="rh-vaga-kpi rh-vaga-kpi--info"><div class="rh-vaga-kpi__val">${k.divulgacao}</div><div class="rh-vaga-kpi__lab">Em divulgação</div></div>
        <div class="rh-vaga-kpi rh-vaga-kpi--ok"><div class="rh-vaga-kpi__val">${k.finalizadas}</div><div class="rh-vaga-kpi__lab">Finalizadas</div></div>
        <div class="rh-vaga-kpi"><div class="rh-vaga-kpi__val">${k.candidatos}</div><div class="rh-vaga-kpi__lab">Total candidatos</div></div>
      </div>
      <div class="rh-vagas-toolbar">
        <div class="rh-vagas-filters">
          <select id="vagaFilterStatus" class="form-control form-control-sm">
            <option value="">Todos os status</option>${statusOpts}
          </select>
          <select id="vagaFilterPrio" class="form-control form-control-sm">
            <option value="">Prioridade</option>
            <option value="normal"${_filters.prioridade === 'normal' ? ' selected' : ''}>Normal</option>
            <option value="urgente"${_filters.prioridade === 'urgente' ? ' selected' : ''}>Urgente</option>
          </select>
          <input id="vagaFilterQ" class="form-control form-control-sm" placeholder="Buscar título, cargo, solicitante..." value="${_esc(_filters.q)}" />
        </div>
        ${canCreate() ? '<button type="button" class="btn btn-primary btn-sm" id="vagaBtnNova">+ Nova requisição</button>' : ''}
      </div>
      <div class="card">
        <div class="table-wrap">
          <table class="data-table" id="vagasTable">
            <thead>
              <tr>
                <th>Título</th><th>Depto</th><th>Cargo</th><th>Qtd</th><th>Tipo</th>
                <th>Prioridade</th><th>Status</th><th>Candidatos</th><th>Solicitante</th><th></th>
              </tr>
            </thead>
            <tbody id="vagas_list_body"></tbody>
          </table>
        </div>
      </div>
      <p class="rh-field-hint" style="margin-top:10px;">
        Fluxo: Supervisor solicita → Paulo aprova → RH conduz divulgação e entrevistas.
        Candidatos só após <strong>Vaga Liberada</strong>. Status de candidato: Triagem, Entrevista Inicial, Entrevista Gestor, Etapa Final, Aprovado, Recusado.
      </p>`;

    document.getElementById('vagaFilterStatus')?.addEventListener('change', (e) => {
      _filters.status = e.target.value;
      renderTable();
    });
    document.getElementById('vagaFilterPrio')?.addEventListener('change', (e) => {
      _filters.prioridade = e.target.value;
      renderTable();
    });
    document.getElementById('vagaFilterQ')?.addEventListener('input', (e) => {
      _filters.q = e.target.value;
      renderTable();
    });
    document.getElementById('vagaBtnNova')?.addEventListener('click', () => openRequestModal());
    renderTable();
  }

  function renderTable() {
    const tbody = document.getElementById('vagas_list_body');
    if (!tbody) return;
    const rows = filteredVagas();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">Nenhuma vaga encontrada.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(v => {
      const st = String(v.status || '');
      return `<tr>
        <td><strong>${_esc(v.titulo || '—')}</strong></td>
        <td>${_esc(v.departamento || '—')}</td>
        <td>${_esc(v.cargo || '—')}</td>
        <td>${_esc(v.quantidade ?? 1)}</td>
        <td>${_esc(TIPO_LABEL[v.tipo] || v.tipo || '—')}</td>
        <td>${v.prioridade === 'urgente' ? '<span class="rh-vaga-badge rh-vaga-badge--warn">Urgente</span>' : 'Normal'}</td>
        <td><span class="${badgeClass(st)}">${_esc(statusLabel(st))}</span></td>
        <td>${candCount(v.id)}</td>
        <td>${_esc(v.solicitante_nome || '—')}</td>
        <td><button type="button" class="btn btn-outline btn-sm" data-vaga-open="${_esc(v.id)}">Abrir</button></td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-vaga-open]').forEach(btn => {
      btn.addEventListener('click', () => openDetail(btn.getAttribute('data-vaga-open')));
    });
  }

  async function render() {
    if (!canView()) {
      const root = document.getElementById('rhVagasRoot');
      if (root) root.innerHTML = '<div class="text-muted" style="padding:24px;">Sem permissão para visualizar vagas.</div>';
      return;
    }
    ensureModals();
    const root = document.getElementById('rhVagasRoot');
    if (root) root.innerHTML = '<div class="text-muted text-center" style="padding:24px;">Carregando vagas...</div>';
    try {
      await loadJobs();
      await loadData();
      renderShell();
    } catch (e) {
      console.error('[RhVagas] render:', e);
      if (root) root.innerHTML = `<div class="text-danger" style="padding:24px;">Erro ao carregar vagas: ${_esc(e.message || e)}</div>`;
    }
  }

  async function openRequestModal(id) {
    if (!canCreate()) {
      toast('Apenas supervisores podem solicitar vagas.', 'error');
      return;
    }
    ensureModals();
    await loadJobs();
    _editingId = id || null;
    document.getElementById('vagaRequestTitle').textContent = id ? 'Editar requisição' : 'Nova requisição de vaga';
    document.getElementById('vaga_edit_id').value = id || '';
    document.getElementById('vaga_titulo').value = '';
    document.getElementById('vaga_departamento').value = '';
    document.getElementById('vaga_quantidade').value = '1';
    document.getElementById('vaga_cargo').value = '';
    document.getElementById('vaga_tipo').value = '';
    document.getElementById('vaga_prioridade').value = 'normal';
    document.getElementById('vaga_justificativa').value = '';
    fillCargoSelect('');

    if (id) {
      const v = _vagas.find(x => String(x.id) === String(id));
      if (v) {
        document.getElementById('vaga_titulo').value = v.titulo || '';
        document.getElementById('vaga_departamento').value = v.departamento || '';
        document.getElementById('vaga_quantidade').value = String(v.quantidade || 1);
        document.getElementById('vaga_cargo').value = v.cargo || '';
        document.getElementById('vaga_tipo').value = v.tipo || '';
        document.getElementById('vaga_prioridade').value = v.prioridade || 'normal';
        document.getElementById('vaga_justificativa').value = v.justificativa || '';
        fillCargoSelect(v.cargo_id || '');
      }
    }

    const cargoSel = document.getElementById('vaga_cargo_id');
    if (cargoSel && !cargoSel.dataset.wired) {
      cargoSel.dataset.wired = '1';
      cargoSel.addEventListener('change', () => {
        const job = _jobs.find(j => String(j.id) === String(cargoSel.value));
        const cargoEl = document.getElementById('vaga_cargo');
        if (job && cargoEl && !cargoEl.value) cargoEl.value = job.cargo || job.titulo || '';
      });
    }
    openModal('vagaRequestModal');
  }

  function closeRequestModal() {
    closeModal('vagaRequestModal');
    _editingId = null;
  }

  async function submitRequest(ev) {
    ev.preventDefault();
    if (!canCreate()) {
      toast('Sem permissão para criar requisição.', 'error');
      return false;
    }
    const titulo = String(document.getElementById('vaga_titulo')?.value || '').trim();
    const tipo = String(document.getElementById('vaga_tipo')?.value || '').trim();
    const justificativa = String(document.getElementById('vaga_justificativa')?.value || '').trim();
    const quantidade = Math.max(1, parseInt(document.getElementById('vaga_quantidade')?.value, 10) || 1);
    if (!titulo || !tipo || !justificativa) {
      toast('Título, tipo e justificativa são obrigatórios.', 'error');
      return false;
    }
    const u = _user() || {};
    const cargoId = document.getElementById('vaga_cargo_id')?.value || null;
    let cargo = String(document.getElementById('vaga_cargo')?.value || '').trim();
    if (!cargo && cargoId) {
      const job = _jobs.find(j => String(j.id) === String(cargoId));
      cargo = job?.cargo || job?.titulo || '';
    }
    const editId = document.getElementById('vaga_edit_id')?.value || _editingId;
    let row = editId ? (_vagas.find(v => String(v.id) === String(editId)) || { id: editId }) : {};
    const prevStatus = row.status || null;
    row = {
      ...row,
      titulo,
      departamento: String(document.getElementById('vaga_departamento')?.value || '').trim(),
      cargo,
      cargo_id: cargoId || null,
      quantidade,
      tipo,
      justificativa,
      prioridade: document.getElementById('vaga_prioridade')?.value || 'normal',
      status: row.status && editId ? row.status : 'aguardando_aprovacao',
      solicitante_id: row.solicitante_id || u.id || null,
      solicitante_nome: row.solicitante_nome || u.name || u.nome || '—',
      active: 1,
    };
    if (!editId) {
      pushHistory(row, 'create', null, 'aguardando_aprovacao', 'Requisição enviada para aprovação');
    } else {
      pushHistory(row, 'edit', prevStatus, row.status, 'Requisição editada');
    }
    try {
      await DB.saveRhVaga(row);
      toast(editId ? 'Requisição atualizada.' : 'Requisição enviada — Aguardando Aprovação.', 'success');
      closeRequestModal();
      await render();
    } catch (e) {
      toast(e.message || 'Erro ao salvar.', 'error');
    }
    return false;
  }

  function historyHtml(hist) {
    const list = parseHistory(hist).slice().reverse();
    if (!list.length) return '<p class="text-muted" style="font-size:13px;">Sem histórico.</p>';
    return `<ul class="rh-vaga-history">${list.map(h => `
      <li>
        <strong>${_esc(h.action || 'update')}</strong>
        ${h.from_status || h.to_status ? ` — ${_esc(statusLabel(h.from_status) || '—')} → ${_esc(statusLabel(h.to_status) || candStatusLabel(h.to_status) || '—')}` : ''}
        <br/><span class="text-muted">${_esc(fmtDate(h.at))} · ${_esc(h.by_name || '—')}</span>
        ${h.note ? `<br/>${_esc(h.note)}` : ''}
      </li>`).join('')}</ul>`;
  }

  async function openDetail(id) {
    ensureModals();
    _detailId = id;
    const v = _vagas.find(x => String(x.id) === String(id));
    if (!v) {
      toast('Vaga não encontrada.', 'error');
      return;
    }
    const cands = _candidatosByVaga[String(id)] || [];
    const st = String(v.status || '');
    const canAdv = canManageProcess() && !['aguardando_aprovacao', 'requisicao_aberta', 'vaga_preenchida', 'vaga_cancelada'].includes(st);
    const nextIdx = STATUS_FLOW.indexOf(st);
    const nextStatus = nextIdx >= 0 && nextIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[nextIdx + 1] : null;

    let actions = '';
    if (canApprove() && st === 'aguardando_aprovacao') {
      actions += `
        <div class="rh-vaga-actions">
          <button type="button" class="btn btn-primary btn-sm" data-act="approve">Aprovar abertura</button>
          <button type="button" class="btn btn-outline btn-sm" data-act="reject">Reprovar</button>
        </div>`;
    }
    if (canAdv && nextStatus && nextStatus !== 'vaga_preenchida') {
      actions += `<button type="button" class="btn btn-primary btn-sm" data-act="advance" data-to="${_esc(nextStatus)}">Avançar → ${_esc(statusLabel(nextStatus))}</button>`;
    }
    if (canAdv && nextStatus === 'vaga_preenchida') {
      actions += `<button type="button" class="btn btn-primary btn-sm" data-act="advance" data-to="vaga_preenchida">Marcar como Preenchida</button>`;
    }
    if (canManageProcess() && st !== 'vaga_cancelada' && st !== 'vaga_preenchida') {
      actions += `<button type="button" class="btn btn-outline btn-sm" data-act="cancel">Cancelar vaga</button>`;
    }
    if (
      canManageProcess()
      && STATUS_FLOW.indexOf(st) >= STATUS_FLOW.indexOf('vaga_liberada')
      && st !== 'vaga_cancelada'
    ) {
      actions += `
        <div class="form-group" style="margin-top:8px;max-width:320px;">
          <label for="vaga_resp_nome">Responsável RH</label>
          <input class="form-control form-control-sm" id="vaga_resp_nome" value="${_esc(v.responsavel_nome || '')}" placeholder="Nome do responsável" />
          <button type="button" class="btn btn-outline btn-sm" style="margin-top:6px;" data-act="save-resp">Salvar responsável</button>
        </div>`;
    }

    const candRows = cands.length
      ? cands.map(c => `<tr>
          <td>${_esc(c.nome)}</td>
          <td>${_esc(c.contato || '—')}</td>
          <td>${c.curriculo_url ? `<a href="${_esc(c.curriculo_url)}" target="_blank" rel="noopener">Link</a>` : (c.resume_id ? `CV ${_esc(c.resume_id)}` : '—')}</td>
          <td>${_esc(fmtDate(c.data_candidatura || c.created_at))}</td>
          <td><span class="rh-vaga-badge">${_esc(candStatusLabel(c.status))}</span></td>
          <td><button type="button" class="btn btn-outline btn-sm" data-cand-edit="${_esc(c.id)}">Editar</button></td>
        </tr>`).join('')
      : '<tr><td colspan="6" class="text-muted text-center">Nenhum candidato.</td></tr>';

    document.getElementById('vagaDetailTitle').textContent = v.titulo || 'Detalhe da vaga';
    document.getElementById('vagaDetailBody').innerHTML = `
      <div class="rh-vaga-detail-grid">
        <div><span class="text-muted">Status</span><div><span class="${badgeClass(st)}">${_esc(statusLabel(st))}</span></div></div>
        <div><span class="text-muted">Prioridade</span><div>${_esc(PRIO_LABEL[v.prioridade] || v.prioridade || '—')}</div></div>
        <div><span class="text-muted">Tipo</span><div>${_esc(TIPO_LABEL[v.tipo] || v.tipo || '—')}</div></div>
        <div><span class="text-muted">Quantidade</span><div>${_esc(v.quantidade ?? 1)}</div></div>
        <div><span class="text-muted">Departamento</span><div>${_esc(v.departamento || '—')}</div></div>
        <div><span class="text-muted">Cargo</span><div>${_esc(v.cargo || '—')}</div></div>
        <div><span class="text-muted">Solicitante</span><div>${_esc(v.solicitante_nome || '—')}</div></div>
        <div><span class="text-muted">Data solicitação</span><div>${_esc(fmtDate(v.created_at))}</div></div>
        <div><span class="text-muted">Responsável RH</span><div>${_esc(v.responsavel_nome || '—')}</div></div>
        <div><span class="text-muted">Aprovado por</span><div>${_esc(v.aprovado_por_nome || '—')}</div></div>
        <div><span class="text-muted">Data aprovação</span><div>${_esc(fmtDate(v.aprovado_em))}</div></div>
        <div><span class="text-muted">Candidatos</span><div>${cands.length}</div></div>
      </div>
      <div class="rh-justif-panel" style="margin-top:14px;">
        <div class="rh-justif-panel__title">Justificativa</div>
        <p style="margin:0;white-space:pre-wrap;">${_esc(v.justificativa || '—')}</p>
        ${v.reprovado_motivo ? `<p class="text-danger" style="margin-top:8px;"><strong>Motivo reprovação:</strong> ${_esc(v.reprovado_motivo)}</p>` : ''}
      </div>
      <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;">${actions}</div>
      <div style="margin-top:20px;display:flex;justify-content:space-between;align-items:center;">
        <h4 style="margin:0;font-size:15px;font-weight:800;">Candidatos</h4>
        ${canAddCandidates(v) ? '<button type="button" class="btn btn-primary btn-sm" data-act="add-cand">+ Candidato</button>' : '<span class="rh-field-hint">Candidatos liberados após aprovação (Vaga Liberada).</span>'}
      </div>
      <div class="card" style="margin-top:10px;">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Nome</th><th>Contato</th><th>Currículo</th><th>Data</th><th>Status</th><th></th></tr></thead>
            <tbody>${candRows}</tbody>
          </table>
        </div>
      </div>
      <div style="margin-top:18px;">
        <h4 style="font-size:15px;font-weight:800;">Histórico de movimentações</h4>
        ${historyHtml(v.history)}
      </div>`;

    const body = document.getElementById('vagaDetailBody');
    body.querySelector('[data-act="approve"]')?.addEventListener('click', () => approveVaga(id));
    body.querySelector('[data-act="reject"]')?.addEventListener('click', () => rejectVaga(id));
    body.querySelector('[data-act="cancel"]')?.addEventListener('click', () => setStatus(id, 'vaga_cancelada', 'Vaga cancelada'));
    body.querySelector('[data-act="advance"]')?.addEventListener('click', (e) => {
      const to = e.currentTarget.getAttribute('data-to');
      setStatus(id, to, `Status avançado para ${statusLabel(to)}`);
    });
    body.querySelector('[data-act="add-cand"]')?.addEventListener('click', () => openCandModal(id));
    body.querySelector('[data-act="save-resp"]')?.addEventListener('click', () => saveResponsavel(id));
    body.querySelectorAll('[data-cand-edit]').forEach(btn => {
      btn.addEventListener('click', () => openCandModal(id, btn.getAttribute('data-cand-edit')));
    });
    openModal('vagaDetailModal');
  }

  function closeDetailModal() {
    closeModal('vagaDetailModal');
    _detailId = null;
  }

  async function approveVaga(id) {
    if (!canApprove()) {
      toast('Somente Paulo pode aprovar a abertura da vaga.', 'error');
      return;
    }
    const v = _vagas.find(x => String(x.id) === String(id));
    if (!v || v.status !== 'aguardando_aprovacao') return;
    const u = _user() || {};
    const from = v.status;
    v.status = 'vaga_liberada';
    v.aprovado_por_id = u.id || null;
    v.aprovado_por_nome = u.name || u.nome || 'Paulo';
    v.aprovado_em = new Date().toISOString().slice(0, 19).replace('T', ' ');
    v.reprovado_motivo = null;
    pushHistory(v, 'approve', from, 'vaga_liberada', 'Abertura aprovada');
    try {
      await DB.saveRhVaga(v);
      toast('Vaga liberada.', 'success');
      await loadData();
      await openDetail(id);
      renderShell();
    } catch (e) {
      toast(e.message || 'Erro ao aprovar.', 'error');
    }
  }

  async function rejectVaga(id) {
    if (!canApprove()) {
      toast('Somente Paulo pode reprovar.', 'error');
      return;
    }
    const motivo = prompt('Motivo da reprovação (obrigatório):');
    if (motivo == null) return;
    if (!String(motivo).trim()) {
      toast('Informe o motivo.', 'error');
      return;
    }
    const v = _vagas.find(x => String(x.id) === String(id));
    if (!v) return;
    const from = v.status;
    v.status = 'vaga_cancelada';
    v.reprovado_motivo = String(motivo).trim();
    pushHistory(v, 'reject', from, 'vaga_cancelada', v.reprovado_motivo);
    try {
      await DB.saveRhVaga(v);
      toast('Requisição reprovada.', 'success');
      await loadData();
      await openDetail(id);
      renderShell();
    } catch (e) {
      toast(e.message || 'Erro ao reprovar.', 'error');
    }
  }

  async function setStatus(id, toStatus, note) {
    if (!canManageProcess()) {
      toast('Sem permissão para alterar status.', 'error');
      return;
    }
    const v = _vagas.find(x => String(x.id) === String(id));
    if (!v) return;
    const from = v.status;
    v.status = toStatus;
    pushHistory(v, 'status', from, toStatus, note || '');
    try {
      await DB.saveRhVaga(v);
      toast(`Status: ${statusLabel(toStatus)}`, 'success');
      await loadData();
      await openDetail(id);
      renderShell();
    } catch (e) {
      toast(e.message || 'Erro ao atualizar status.', 'error');
    }
  }

  async function saveResponsavel(id) {
    if (!canManageProcess()) return;
    const v = _vagas.find(x => String(x.id) === String(id));
    if (!v) return;
    const nome = String(document.getElementById('vaga_resp_nome')?.value || '').trim();
    const u = _user() || {};
    v.responsavel_nome = nome;
    v.responsavel_id = u.id || v.responsavel_id || null;
    pushHistory(v, 'assign', v.status, v.status, `Responsável RH: ${nome || '—'}`);
    try {
      await DB.saveRhVaga(v);
      toast('Responsável atualizado.', 'success');
      await loadData();
      await openDetail(id);
    } catch (e) {
      toast(e.message || 'Erro ao salvar.', 'error');
    }
  }

  async function openCandModal(vagaId, candId) {
    ensureModals();
    const v = _vagas.find(x => String(x.id) === String(vagaId));
    if (!canAddCandidates(v) && !candId) {
      toast('Não é possível adicionar candidatos neste status.', 'error');
      return;
    }
    _candEditId = candId || null;
    document.getElementById('vaga_cand_vaga_id').value = vagaId;
    document.getElementById('vaga_cand_id').value = candId || '';
    document.getElementById('vaga_cand_nome').value = '';
    document.getElementById('vaga_cand_contato').value = '';
    document.getElementById('vaga_cand_curriculo').value = '';
    document.getElementById('vaga_cand_status').value = 'triagem';
    document.getElementById('vaga_cand_obs').value = '';
    document.getElementById('vagaCandTitle').textContent = candId ? 'Editar candidato' : 'Novo candidato';

    const resumeSel = document.getElementById('vaga_cand_resume_id');
    try {
      const resumes = (await DB.getRhResumes()) || [];
      resumeSel.innerHTML = '<option value="">— Sem vínculo —</option>' + resumes
        .slice(0, 200)
        .map(r => `<option value="${_esc(r.id)}">${_esc(r.nome || r.name || r.id)}</option>`)
        .join('');
    } catch {
      resumeSel.innerHTML = '<option value="">—</option>';
    }

    if (candId) {
      const c = (_candidatosByVaga[String(vagaId)] || []).find(x => String(x.id) === String(candId));
      if (c) {
        document.getElementById('vaga_cand_nome').value = c.nome || '';
        document.getElementById('vaga_cand_contato').value = c.contato || '';
        document.getElementById('vaga_cand_curriculo').value = c.curriculo_url || '';
        document.getElementById('vaga_cand_status').value = c.status || 'triagem';
        document.getElementById('vaga_cand_obs').value = c.obs_rh || '';
        if (c.resume_id) resumeSel.value = c.resume_id;
      }
    }
    openModal('vagaCandModal');
  }

  function closeCandModal() {
    closeModal('vagaCandModal');
    _candEditId = null;
  }

  async function submitCandidate(ev) {
    ev.preventDefault();
    const vagaId = document.getElementById('vaga_cand_vaga_id')?.value;
    const v = _vagas.find(x => String(x.id) === String(vagaId));
    const editId = document.getElementById('vaga_cand_id')?.value || _candEditId;
    if (!editId && !canAddCandidates(v)) {
      toast('Vaga ainda não liberada para candidatos.', 'error');
      return false;
    }
    if (!canManageProcess()) {
      toast('Sem permissão.', 'error');
      return false;
    }
    const nome = String(document.getElementById('vaga_cand_nome')?.value || '').trim();
    if (!nome) {
      toast('Nome obrigatório.', 'error');
      return false;
    }
    const u = _user() || {};
    let row = editId
      ? ((_candidatosByVaga[String(vagaId)] || []).find(c => String(c.id) === String(editId)) || { id: editId })
      : {};
    const from = row.status || null;
    const to = document.getElementById('vaga_cand_status')?.value || 'triagem';
    row = {
      ...row,
      vaga_id: vagaId,
      nome,
      contato: String(document.getElementById('vaga_cand_contato')?.value || '').trim(),
      curriculo_url: String(document.getElementById('vaga_cand_curriculo')?.value || '').trim() || null,
      resume_id: document.getElementById('vaga_cand_resume_id')?.value || null,
      data_candidatura: row.data_candidatura || new Date().toISOString().slice(0, 19).replace('T', ' '),
      status: to,
      obs_rh: String(document.getElementById('vaga_cand_obs')?.value || '').trim(),
      created_by: row.created_by || u.id || null,
      active: 1,
    };
    pushHistory(row, editId ? 'edit' : 'create', from, to, editId ? 'Candidato atualizado' : 'Candidato incluído');
    try {
      await DB.saveRhVagaCandidato(row);
      toast('Candidato salvo.', 'success');
      closeCandModal();
      await loadData();
      await openDetail(vagaId);
      renderShell();
    } catch (e) {
      toast(e.message || 'Erro ao salvar candidato.', 'error');
    }
    return false;
  }

  window.RhVagas = {
    render,
    openRequestModal,
    closeRequestModal,
    submitRequest,
    openDetail,
    closeDetailModal,
    openCandModal,
    closeCandModal,
    submitCandidate,
    canCreate,
    canApprove,
    canView,
    VAGAS_APPROVER_IDS,
    VAGAS_APPROVER_EMAILS,
    STATUS,
    CAND_STATUS,
  };
})();
