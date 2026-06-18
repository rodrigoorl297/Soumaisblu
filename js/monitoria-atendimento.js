/* SOU+BLU — Monitoria de Atendimento (Administrativo) */
const MonitoriaAtendimento = (() => {
  const MOTIVOS = [
    { value: 'erro_atendimento', label: 'Erro atendimento' },
    { value: 'erro_tag_rotulos', label: 'Erro tag / rótulos' },
    { value: 'outro', label: 'Outro' },
  ];

  const ORIGENS = [
    'Ligação', 'Chat', 'WhatsApp', 'E-mail', 'Backoffice', 'Supervisão', 'Ouvidoria', 'Outro',
  ];

  let _tab = 'dashboard';
  let _rows = [];
  let _users = [];
  let _pendingEvidence = [];
  let _editId = null;

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function motivoLabel(v) {
    return MOTIVOS.find(m => m.value === v)?.label || v || '—';
  }

  function qualidadeFromCount(n) {
    const c = Number(n) || 0;
    if (c <= 5) return 'ALTA';
    if (c <= 10) return 'MÉDIA';
    return 'BAIXA';
  }

  function qualidadeBadge(q) {
    const v = String(q || '').toUpperCase();
    const cls = v === 'ALTA' ? 'mon-badge--alta' : (v === 'MÉDIA' ? 'mon-badge--media' : 'mon-badge--baixa');
    return `<span class="mon-badge ${cls}">${esc(v || '—')}</span>`;
  }

  function currentMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR');
    } catch (_) {
      return iso;
    }
  }

  function canAccess() {
    return typeof Auth !== 'undefined' && Auth.canAccessMonitoriaAtendimento && Auth.canAccessMonitoriaAtendimento();
  }

  async function ensureSchema() {
    if (sessionStorage.getItem('soublu_mon_schema') === '1') return;
    const cfg = window.SOUBLU_CONFIG || {};
    const url = (cfg.API_BASE_URL || cfg.SITE_URL || location.origin).replace(/\/+$/, '') + '/api/migrate-monitoria-atendimento.php';
    try {
      await fetch(url, {
        headers: { 'X-API-Key': cfg.API_KEY || '', apikey: cfg.API_KEY || '' },
      });
      sessionStorage.setItem('soublu_mon_schema', '1');
    } catch (_) { /* noop */ }
  }

  async function reload() {
    _rows = await DB.getMonitoriaAtendimentos();
    _users = await DB.getAllUsers().catch(() => []);
  }

  function countByColaboradorMonth(colabKey, month) {
    return _rows.filter(r => {
      const key = r.colaborador_id || r.colaborador_cpf || r.colaborador_nome;
      return String(key) === String(colabKey) && String(r.data_avaliacao || '').slice(0, 7) === month;
    }).length;
  }

  async function syncRhQualidade(colaboradorId, colaboradorCpf, month) {
    const key = colaboradorId || colaboradorCpf;
    if (!key) return;
    const count = countByColaboradorMonth(key, month);
    const qualidade = qualidadeFromCount(count);
    const emps = await DB.getRhEmployees().catch(() => []);
    const emp = emps.find(e =>
      (colaboradorId && String(e.id) === String(colaboradorId))
      || (colaboradorCpf && String(e.cpf || '').replace(/\D/g, '') === String(colaboradorCpf).replace(/\D/g, ''))
    );
    if (!emp) return;
    if (String(emp.qualidade_monitoria || '').toUpperCase() === qualidade) return;
    await DB.saveRhEmployee({ ...emp, qualidade_monitoria: qualidade });
  }

  function renderRulesCard() {
    return `
      <div class="mon-rules card card-padded">
        <h4 class="mon-rules__title">Regras de qualidade</h4>
        <ul class="mon-rules__list">
          <li><span class="mon-badge mon-badge--alta">ALTA</span> 0 a 5 apontamentos no mês</li>
          <li><span class="mon-badge mon-badge--media">MÉDIA</span> 6 a 10 apontamentos no mês</li>
          <li><span class="mon-badge mon-badge--baixa">BAIXA</span> 11 ou mais apontamentos no mês</li>
        </ul>
      </div>`;
  }

  function renderDashboard() {
    const month = currentMonth();
    const monthRows = _rows.filter(r => String(r.data_avaliacao || '').slice(0, 7) === month);
    const byColab = {};
    monthRows.forEach(r => {
      const key = r.colaborador_id || r.colaborador_cpf || r.colaborador_nome;
      if (!key) return;
      if (!byColab[key]) {
        byColab[key] = {
          nome: r.colaborador_nome || '—',
          id: r.colaborador_id,
          cpf: r.colaborador_cpf,
          count: 0,
        };
      }
      byColab[key].count += 1;
    });
    const stats = Object.values(byColab).sort((a, b) => b.count - a.count);
    const total = monthRows.length;

    return `
      <div class="mon-hero card">
        <div class="mon-hero__content">
          <p class="mon-hero__eyebrow">Administrativo</p>
          <h2>Monitoria de Atendimento</h2>
          <p>Registre apontamentos, anexe evidências e acompanhe a qualidade dos colaboradores.</p>
        </div>
      </div>
      <div class="mon-dash-grid">
        ${renderRulesCard()}
        <div class="card card-padded mon-stat-card">
          <div class="mon-stat-card__value">${total}</div>
          <div class="mon-stat-card__label">Apontamentos em ${fmtDate(`${month}-01`)}</div>
        </div>
        <div class="card card-padded mon-stat-card">
          <div class="mon-stat-card__value">${stats.length}</div>
          <div class="mon-stat-card__label">Colaboradores monitorados</div>
        </div>
      </div>
      <div class="card card-padded" style="margin-top:16px;">
        <div class="mon-section-head">
          <h3>Qualidade por colaborador — ${month.split('-').reverse().join('/')}</h3>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>
              <th>Colaborador</th><th>Apontamentos</th><th>Qualidade</th><th></th>
            </tr></thead>
            <tbody>
              ${stats.length ? stats.map(s => `
                <tr>
                  <td><strong>${esc(s.nome)}</strong></td>
                  <td>${s.count}</td>
                  <td>${qualidadeBadge(qualidadeFromCount(s.count))}</td>
                  <td><button type="button" class="btn btn-ghost btn-sm" onclick="MonitoriaAtendimento.filterColaborador('${esc(s.id || s.cpf || s.nome)}')">Ver registros</button></td>
                </tr>`).join('') : '<tr><td colspan="4" class="text-muted text-center">Nenhum apontamento neste mês.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  let _filterColab = '';

  function renderLista() {
    let list = [..._rows];
    if (_filterColab) {
      list = list.filter(r => {
        const key = r.colaborador_id || r.colaborador_cpf || r.colaborador_nome;
        return String(key) === String(_filterColab);
      });
    }
    return `
      <div class="page-header">
        <div class="page-header-text">
          <h2>Registros de monitoria</h2>
          <p>${_filterColab ? 'Filtrado por colaborador — ' : ''}${list.length} registro(s)</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${_filterColab ? '<button type="button" class="btn btn-ghost btn-sm" onclick="MonitoriaAtendimento.clearFilter()">Limpar filtro</button>' : ''}
          <button type="button" class="btn btn-primary" onclick="MonitoriaAtendimento.openForm()">+ Nova monitoria</button>
        </div>
      </div>
      ${renderRulesCard()}
      <div class="card card-padded">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>
              <th>Protocolo</th><th>Data</th><th>Colaborador</th><th>Motivo</th><th>Origem</th><th>Evidências</th><th></th>
            </tr></thead>
            <tbody id="monTbody">
              ${list.length ? list.map(r => `
                <tr>
                  <td><strong>${esc(r.protocolo)}</strong></td>
                  <td>${esc(fmtDate(r.data_avaliacao))}</td>
                  <td>${esc(r.colaborador_nome || '—')}</td>
                  <td>${esc(motivoLabel(r.motivo))}</td>
                  <td>${esc(r.origem || '—')}</td>
                  <td>${(r.evidence_attachments || []).length || 0}</td>
                  <td style="white-space:nowrap;">
                    <button type="button" class="btn btn-ghost btn-sm" onclick="MonitoriaAtendimento.openForm('${esc(r.id)}')">Editar</button>
                    <button type="button" class="btn btn-ghost btn-sm" onclick="MonitoriaAtendimento.remove('${esc(r.id)}')">Excluir</button>
                  </td>
                </tr>`).join('') : '<tr><td colspan="7" class="text-muted text-center">Nenhum registro. Clique em <strong>+ Nova monitoria</strong>.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function renderRegras() {
    return `
      <div class="page-header">
        <div class="page-header-text">
          <h2>Regras e referência</h2>
          <p>Critérios de classificação da qualidade de monitoria</p>
        </div>
      </div>
      ${renderRulesCard()}
      <div class="card card-padded">
        <h3 style="margin-bottom:12px;">Motivos cadastrados</h3>
        <ul class="mon-motivos-list">
          ${MOTIVOS.map(m => `<li>${esc(m.label)}</li>`).join('')}
        </ul>
        <p class="form-hint" style="margin-top:16px;">A qualidade do colaborador no cadastro RH é atualizada automaticamente ao salvar apontamentos do mês.</p>
      </div>`;
  }

  function renderTab() {
    const root = document.getElementById('monTabRoot');
    if (!root) return;
    if (_tab === 'dashboard') root.innerHTML = renderDashboard();
    else if (_tab === 'registros') root.innerHTML = renderLista();
    else root.innerHTML = renderRegras();
    const titles = { dashboard: 'Dashboard', registros: 'Registros', regras: 'Regras' };
    const titleEl = document.getElementById('monPageTitle');
    if (titleEl) titleEl.textContent = titles[_tab] || 'Monitoria';
  }

  function switchTab(tab) {
    _tab = tab || 'dashboard';
    document.querySelectorAll('.mon-app .nav-item[data-tab]').forEach(el => {
      el.classList.toggle('active', el.dataset.tab === _tab);
    });
    renderTab();
  }

  function ensureModal() {
    if (document.getElementById('monFormModal')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="modal-overlay" id="monFormModal">
        <div class="modal" style="max-width:640px;">
          <div class="modal-header mon-modal-header">
            <h3 id="monFormTitle">Nova monitoria</h3>
            <button type="button" class="modal-close" onclick="closeModal('monFormModal')"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="monFormId"/>
            <div class="mon-form-protocol">
              <span>Protocolo</span>
              <strong id="monProtocoloPreview">—</strong>
              <span class="form-hint">Gerado automaticamente</span>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="monDataAvaliacao">Data da avaliação *</label>
                <input type="date" id="monDataAvaliacao" class="form-control" required/>
              </div>
              <div class="form-group">
                <label for="monMotivo">Motivo *</label>
                <select id="monMotivo" class="form-control">
                  ${MOTIVOS.map(m => `<option value="${m.value}">${esc(m.label)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="monOrigem">Origem da monitoria</label>
                <select id="monOrigem" class="form-control">
                  <option value="">Selecione</option>
                  ${ORIGENS.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label for="monProtocoloMon">Protocolo da monitoria</label>
                <input type="text" id="monProtocoloMon" class="form-control" placeholder="Referência externa (opcional)"/>
              </div>
            </div>
            <div class="form-group">
              <label for="monColaborador">Colaborador *</label>
              <select id="monColaborador" class="form-control" required>
                <option value="">Selecione o colaborador</option>
              </select>
            </div>
            <div class="form-group">
              <label for="monObservacoes">Observações</label>
              <textarea id="monObservacoes" class="form-control" rows="3" placeholder="Detalhes do apontamento..."></textarea>
            </div>
            <div class="form-group">
              <label>Anexar evidências</label>
              <div class="mon-evidence-zone" id="monEvidenceZone">
                <input type="file" id="monEvidenceInput" accept="image/*,.pdf" multiple style="display:none" onchange="MonitoriaAtendimento.onEvidencePick(this)"/>
                <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('monEvidenceInput').click()">+ Adicionar arquivo</button>
                <div id="monEvidenceList" class="mon-evidence-list"></div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" onclick="closeModal('monFormModal')">Cancelar</button>
            <button type="button" class="btn btn-primary" onclick="MonitoriaAtendimento.save()">Salvar</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap.firstElementChild);
  }

  function paintEvidenceList() {
    const el = document.getElementById('monEvidenceList');
    if (!el) return;
    if (!_pendingEvidence.length) {
      el.innerHTML = '<p class="form-hint">Nenhum anexo ainda.</p>';
      return;
    }
    el.innerHTML = _pendingEvidence.map((f, i) => `
      <div class="mon-evidence-item">
        <span>${esc(f.name || f.url || 'Arquivo')}</span>
        <button type="button" class="btn btn-ghost btn-xs" onclick="MonitoriaAtendimento.removeEvidence(${i})">✕</button>
      </div>`).join('');
  }

  function populateColaboradoresSelect(selectedId) {
    const sel = document.getElementById('monColaborador');
    if (!sel) return;
    const internal = _users.filter(u => {
      const r = String(u.role || '').toLowerCase();
      return u.active !== false && !['master', 'fundador', 'parceiro'].includes(r);
    }).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
    sel.innerHTML = '<option value="">Selecione o colaborador</option>' + internal.map(u =>
      `<option value="${esc(u.id)}" data-cpf="${esc(u.cpf || '')}" data-name="${esc(u.name || '')}">${esc(u.name || u.id)}${u.department ? ` — ${esc(u.department)}` : ''}</option>`
    ).join('');
    if (selectedId) sel.value = selectedId;
  }

  async function openForm(id) {
    ensureModal();
    _editId = id || null;
    _pendingEvidence = [];
    const row = id ? await DB.getMonitoriaAtendimento(id) : null;
    const d = new Date();
    const proto = row?.protocolo || `MON-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;
    document.getElementById('monFormId').value = row?.id || '';
    document.getElementById('monFormTitle').textContent = row ? 'Editar monitoria' : 'Nova monitoria';
    document.getElementById('monProtocoloPreview').textContent = proto;
    document.getElementById('monDataAvaliacao').value = row?.data_avaliacao || d.toISOString().slice(0, 10);
    document.getElementById('monMotivo').value = row?.motivo || 'erro_atendimento';
    document.getElementById('monOrigem').value = row?.origem || '';
    document.getElementById('monProtocoloMon').value = row?.protocolo_monitoria || '';
    document.getElementById('monObservacoes').value = row?.observacoes || '';
    populateColaboradoresSelect(row?.colaborador_id || '');
    _pendingEvidence = [...(row?.evidence_attachments || [])];
    paintEvidenceList();
    openModal('monFormModal');
  }

  async function onEvidencePick(input) {
    const files = Array.from(input?.files || []);
    if (!files.length) return;
    showLoading('Enviando evidência...');
    try {
      for (const file of files) {
        let url = '';
        if (typeof uploadImage === 'function') {
          url = await uploadImage(file, 'monitoria-atendimento', `evidencias/${Date.now()}`);
        }
        _pendingEvidence.push({
          name: file.name,
          url: url || '',
          mime: file.type || '',
        });
      }
      paintEvidenceList();
    } catch (e) {
      showToast('Falha ao enviar evidência.', 'error');
    } finally {
      hideLoading();
      if (input) input.value = '';
    }
  }

  function removeEvidence(idx) {
    _pendingEvidence.splice(idx, 1);
    paintEvidenceList();
  }

  async function save() {
    const sel = document.getElementById('monColaborador');
    const opt = sel?.selectedOptions?.[0];
    if (!sel?.value) {
      showToast('Selecione o colaborador.', 'warning');
      return;
    }
    const session = Auth.getSession();
    const dataAval = document.getElementById('monDataAvaliacao')?.value;
    if (!dataAval) {
      showToast('Informe a data da avaliação.', 'warning');
      return;
    }
    showLoading('Salvando...');
    try {
      const protoText = document.getElementById('monProtocoloPreview')?.textContent?.trim();
      const payload = {
        id: document.getElementById('monFormId')?.value || undefined,
        protocolo: protoText,
        motivo: document.getElementById('monMotivo')?.value,
        data_avaliacao: dataAval,
        origem: document.getElementById('monOrigem')?.value?.trim() || '',
        protocolo_monitoria: document.getElementById('monProtocoloMon')?.value?.trim() || '',
        colaborador_id: sel.value,
        colaborador_nome: opt?.dataset?.name || opt?.textContent || '',
        colaborador_cpf: opt?.dataset?.cpf || '',
        observacoes: document.getElementById('monObservacoes')?.value?.trim() || '',
        evidence_attachments: _pendingEvidence,
        created_by: session?.id,
        created_by_name: session?.name,
      };
      await DB.saveMonitoriaAtendimento(payload);
      const month = String(dataAval).slice(0, 7);
      await syncRhQualidade(payload.colaborador_id, payload.colaborador_cpf, month);
      closeModal('monFormModal');
      await reload();
      renderTab();
      showToast('Monitoria salva!', 'success');
    } catch (e) {
      showToast('Erro ao salvar monitoria.', 'error');
    } finally {
      hideLoading();
    }
  }

  async function remove(id) {
    if (!id || !confirm('Excluir este registro de monitoria?')) return;
    const row = await DB.getMonitoriaAtendimento(id);
    await DB.deleteMonitoriaAtendimento(id);
    if (row) {
      const month = String(row.data_avaliacao || '').slice(0, 7);
      await syncRhQualidade(row.colaborador_id, row.colaborador_cpf, month);
    }
    await reload();
    renderTab();
    showToast('Registro excluído.', 'info');
  }

  function filterColaborador(key) {
    _filterColab = key;
    switchTab('registros');
  }

  function clearFilter() {
    _filterColab = '';
    renderTab();
  }

  async function boot() {
    if (!Auth.getSession()) {
      window.location.href = Auth.loginPageHref ? Auth.loginPageHref() : '../index.html';
      return;
    }
    if (!canAccess()) {
      showToast('Sem permissão para Monitoria de Atendimento.', 'error');
      setTimeout(() => { window.location.href = Auth.adminPageHref(); }, 1200);
      return;
    }
    showLoading('Carregando monitoria...');
    try {
      await ensureSchema();
      await reload();
      const s = Auth.getSession();
      const nameEl = document.getElementById('monUserName');
      const roleEl = document.getElementById('monUserRole');
      const avEl = document.getElementById('monUserAvatar');
      if (nameEl) nameEl.textContent = s?.name || '—';
      if (roleEl) roleEl.textContent = s?.role || '—';
      if (avEl) avEl.textContent = (s?.name || '?').charAt(0).toUpperCase();
      document.getElementById('appLayout').style.display = '';
      switchTab('dashboard');
    } finally {
      hideLoading();
    }
  }

  return {
    boot,
    switchTab,
    openForm,
    save,
    remove,
    onEvidencePick,
    removeEvidence,
    filterColaborador,
    clearFilter,
    canAccess,
    qualidadeFromCount,
  };
})();

window.MonitoriaAtendimento = MonitoriaAtendimento;

function switchTab(tab) {
  MonitoriaAtendimento.switchTab(tab);
}

function navigateBack() {
  window.location.href = typeof Auth !== 'undefined' && Auth.adminPageHref
    ? Auth.adminPageHref()
    : 'admin.html';
}

function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open');
}

document.addEventListener('DOMContentLoaded', () => MonitoriaAtendimento.boot());
