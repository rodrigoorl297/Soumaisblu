/* SOU+BLU RH — Trilha de Carreira (MySQL, sem login extra / sem Supabase) */
(function () {
  'use strict';

  const CRITERIA = [
    { id: 1, title: 'Tempo mínimo', subtitle: 'Mínimo de 12 Meses', desc: 'Completos no nível vigente.', icon: 'calendar' },
    { id: 2, title: 'Desempenho', subtitle: 'Resultado Satisfatório', desc: 'Nas avaliações formais de desempenho.', icon: 'chart' },
    { id: 3, title: 'Desenvolvimento', subtitle: 'Trilhas de Aprendizagem', desc: 'Conclusão de treinamentos obrigatórios.', icon: 'grad' },
    { id: 4, title: 'Competências', subtitle: 'Evolução Consistente', desc: 'Competências técnicas e comportamentais.', icon: 'brain' },
    { id: 5, title: 'Conduta', subtitle: 'Alinhamento Cultural', desc: 'Postura alinhada aos valores e normas da Blu.', icon: 'heart' },
  ];

  const IMPEDIMENTS = [
    'Não cumprir o tempo mínimo exigido no nível',
    'Desempenho abaixo do esperado nas avaliações',
    'Medidas disciplinares vigentes no prontuário',
    'Não concluir trilhas de aprendizagem obrigatórias',
    'Não atender aos requisitos do próximo nível/cargo',
  ];

  const ICON_OPTIONS = [
    { id: 'target', label: 'Alvo' },
    { id: 'code', label: 'Código' },
    { id: 'headset', label: 'Headset' },
    { id: 'users', label: 'Pessoas' },
    { id: 'file', label: 'Documento' },
  ];

  const DEFAULT_ROLES = [
    {
      id: 'consultor',
      titulo: 'Consultor de Vendas',
      icone: 'target',
      descricao: 'Atuação comercial focada em prospecção, atendimento ao cliente e fechamento de contratos de crédito.',
      niveis: [
        { name: 'Nível I', desc: 'Atendimento inicial, prospecção básica e aprendizado das linhas de crédito.' },
        { name: 'Nível II', desc: 'Domínio das linhas de crédito, meta contínua atingida e suporte a novos consultores.' },
        { name: 'Nível III', desc: 'Alta performance de vendas, liderança técnica comercial e parcerias estratégicas.' },
      ],
      sort_order: 10,
    },
    {
      id: 'dev',
      titulo: 'Assistente de Desenvolvimento de Sistemas',
      icone: 'code',
      descricao: 'Desenvolvimento e manutenção de software, automações e sistemas internos.',
      niveis: [
        { name: 'Nível I', desc: 'Suporte a código existente, correção de bugs simples e testes de qualidade.' },
        { name: 'Nível II', desc: 'Desenvolvimento de novas funcionalidades, APIs e integração com parceiros.' },
      ],
      sort_order: 20,
    },
    {
      id: 'supervisor',
      titulo: 'Supervisor de Teleatendimento',
      icone: 'headset',
      descricao: 'Supervisão de equipe de atendimento remoto, monitoramento de métricas e qualidade de operação.',
      niveis: [
        { name: 'Nível I', desc: 'Gestão direta de equipe de teleatendimento e acompanhamento de metas diárias.' },
        { name: 'Nível II', desc: 'Gestão sênior da operação de atendimento, otimização de scripts e treinamento avançado.' },
      ],
      sort_order: 30,
    },
    {
      id: 'rh',
      titulo: 'Analista de Recursos Humanos',
      icone: 'users',
      descricao: 'Gestão de pessoas, recrutamento, treinamento, clima organizacional e avaliação de desempenho.',
      niveis: [
        { name: 'Nível I', desc: 'Execução de processos seletivos, integração de novos colaboradores e suporte a RH.' },
        { name: 'Nível II', desc: 'Gestão de programas de desenvolvimento, avaliação de desempenho e subsistemas de RH.' },
      ],
      sort_order: 40,
    },
    {
      id: 'backoffice',
      titulo: 'Analista de Backoffice',
      icone: 'file',
      descricao: 'Conferência documental, digitação de propostas de crédito e esteira operacional de contratação.',
      niveis: [
        { name: 'Nível I', desc: 'Análise de documentos básicos e digitação de propostas de menor complexidade.' },
        { name: 'Nível II', desc: 'Análise avançada de risco documental, tratamento de pendências complexas e esteira.' },
      ],
      sort_order: 50,
    },
  ];

  const ICONS = {
    target: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    code: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    headset: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm18 0h-3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-5Z"/><path d="M21 16v2a4 4 0 0 1-4 4h-5"/><path d="M3 11a9 9 0 0 1 18 0"/></svg>',
    users: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    file: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    calendar: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    chart: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 16v-5"/><path d="M12 16V8"/><path d="M17 16v-9"/></svg>',
    grad: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>',
    brain: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M12 5v13"/></svg>',
    heart: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
    award: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>',
    trend: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
    merge: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>',
    clip: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>',
    calc: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="16" y1="18" x2="16" y2="18.01"/><line x1="12" y1="18" x2="12" y2="18.01"/><line x1="8" y1="18" x2="8" y2="18.01"/></svg>',
    shield: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>',
    check: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
    slash: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>',
    users2: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  };

  let _roles = [];
  let _section = 'trilhas';
  let _selectedId = '';
  let _sim = { role: '', level: 1, months: 12, perf: 'ok', train: 'yes', disc: 'none' };
  let _loaded = false;

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

  function canEdit() {
    const r = String(_user()?.role || '').toLowerCase();
    if (['rh', 'master', 'fundador', 'desenvolvedor'].includes(r)) return true;
    return !!(typeof Auth !== 'undefined' && Auth.isMaster && Auth.isMaster());
  }

  function iconSvg(name) {
    return ICONS[String(name || '').toLowerCase()] || ICONS.target;
  }

  function parseNiveis(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string' && raw) {
      try {
        const p = JSON.parse(raw);
        return Array.isArray(p) ? p : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  function normalizeRole(row) {
    if (!row) return null;
    const niveis = parseNiveis(row.niveis).map((n) => ({
      name: String(n.name || n.nome || '').trim() || 'Nível',
      desc: String(n.desc || n.descricao || '').trim(),
    })).filter((n) => n.name);
    return {
      id: String(row.id || ''),
      titulo: String(row.titulo || row.title || '').trim(),
      icone: String(row.icone || row.iconName || 'target').toLowerCase(),
      descricao: String(row.descricao || row.description || '').trim(),
      niveis,
      sort_order: Number(row.sort_order || 0),
      active: row.active !== false && row.active !== 0,
    };
  }

  function selectedRole() {
    return _roles.find((r) => r.id === _selectedId) || _roles[0] || null;
  }

  function eligibility() {
    const level = Number(_sim.level || 1);
    if (level === 3) {
      return {
        type: 'max',
        title: '🏆 Você já está no Nível Máximo do Cargo (Nível III)',
        message: 'Para continuar crescendo na Blu, confira as opções de Processo Seletivo Interno ou Promoção por Mérito para outros cargos!',
      };
    }
    const reasons = [];
    const months = Number(_sim.months || 0);
    if (months < 12) reasons.push(`Tempo mínimo no nível vigente não atingido (faltam ${12 - months} meses).`);
    if (_sim.perf === 'low') reasons.push('Resultado na avaliação de desempenho está abaixo do esperado.');
    if (_sim.train === 'no') reasons.push('Trilhas de aprendizagem e treinamentos obrigatórios estão pendentes.');
    if (_sim.disc === 'active') reasons.push('Existe medida disciplinar vigente no registro.');
    if (!reasons.length) {
      return {
        type: 'eligible',
        title: '✅ ELEGÍVEL PARA AVALIAÇÃO DO COMITÊ DE PESSOAS!',
        message: `Você atende aos 5 critérios obrigatórios para a progressão para o Nível ${level + 1}. Fale com seu gestor imediato para inclusão na pauta do comitê!`,
      };
    }
    return { type: 'pending', title: '⚠️ EM PROGRESSO (PONTOS DE ATENÇÃO)', reasons };
  }

  function openModal(id) {
    if (typeof openModalRH === 'function') openModalRH(id);
    else document.getElementById(id)?.classList.add('open');
  }

  function closeModal(id) {
    if (typeof closeModalRH === 'function') closeModalRH(id);
    else document.getElementById(id)?.classList.remove('open');
  }

  function ensureModal() {
    if (document.getElementById('rhCarreiraModal')) return;
    const wrap = document.createElement('div');
    wrap.id = 'rhCarreiraModalsHost';
    wrap.innerHTML = `
<div class="modal-overlay" id="rhCarreiraModal">
  <div class="modal rh-modal--wide">
    <div class="modal-header">
      <h3 id="rhCarreiraModalTitle">Cargo da trilha</h3>
      <button type="button" class="modal-close" onclick="RhCarreira.closeEdit()"></button>
    </div>
    <div class="modal-body rh-modal-body--scroll">
      <form id="rhCarreiraForm" onsubmit="return RhCarreira.submitEdit(event)">
        <input type="hidden" id="carreira_edit_id" />
        <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group" style="grid-column:1/-1;">
            <label for="carreira_titulo">Título do cargo *</label>
            <input class="form-control" id="carreira_titulo" required maxlength="255" />
          </div>
          <div class="form-group">
            <label for="carreira_icone">Ícone</label>
            <select class="form-control" id="carreira_icone">${ICON_OPTIONS.map((i) => `<option value="${i.id}">${_esc(i.label)}</option>`).join('')}</select>
          </div>
          <div class="form-group">
            <label for="carreira_sort">Ordem</label>
            <input class="form-control" id="carreira_sort" type="number" min="0" step="1" value="60" />
          </div>
          <div class="form-group" style="grid-column:1/-1;">
            <label for="carreira_desc">Descrição</label>
            <textarea class="form-control" id="carreira_desc" rows="3"></textarea>
          </div>
        </div>
        <div class="rh-carreira-niveis-edit">
          <div class="rh-carreira-niveis-edit__head">
            <strong>Níveis</strong>
            <button type="button" class="btn btn-outline btn-sm" onclick="RhCarreira.addNivelRow()">+ Nível</button>
          </div>
          <div id="carreiraNiveisRows"></div>
        </div>
        <div class="flex gap-md mt-lg">
          <button type="button" class="btn btn-outline" onclick="RhCarreira.closeEdit()">Cancelar</button>
          <button type="submit" class="btn btn-accent">Salvar cargo</button>
        </div>
      </form>
    </div>
  </div>
</div>`;
    document.body.appendChild(wrap);
  }

  function nivelRowHtml(n, idx) {
    return `<div class="rh-carreira-nivel-row" data-idx="${idx}">
      <input class="form-control" data-field="name" placeholder="Nome (ex: Nível I)" value="${_esc(n.name || '')}" />
      <textarea class="form-control" data-field="desc" rows="2" placeholder="Descrição">${_esc(n.desc || '')}</textarea>
      <button type="button" class="btn btn-outline btn-sm" onclick="RhCarreira.removeNivelRow(${idx})">Remover</button>
    </div>`;
  }

  function collectNivelRows() {
    return Array.from(document.querySelectorAll('#carreiraNiveisRows .rh-carreira-nivel-row')).map((row) => ({
      name: String(row.querySelector('[data-field="name"]')?.value || '').trim(),
      desc: String(row.querySelector('[data-field="desc"]')?.value || '').trim(),
    })).filter((n) => n.name);
  }

  function renderNivelRows(niveis) {
    const host = document.getElementById('carreiraNiveisRows');
    if (!host) return;
    const list = (niveis && niveis.length) ? niveis : [{ name: 'Nível I', desc: '' }];
    host.innerHTML = list.map((n, i) => nivelRowHtml(n, i)).join('');
  }

  function slugify(title) {
    return String(title || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || ('cargo-' + Date.now().toString(36));
  }

  async function loadRoles() {
    if (typeof DB !== 'undefined' && DB.ensureRhTablesOnline) {
      await DB.ensureRhTablesOnline().catch(() => {});
    }
    let rows = [];
    if (typeof DB !== 'undefined' && DB.getRhTrilhasCargos) {
      rows = await DB.getRhTrilhasCargos().catch(() => []);
    }
    _roles = (rows || []).map(normalizeRole).filter((r) => r && r.id && r.active && r.titulo);
    _roles.sort((a, b) => (a.sort_order - b.sort_order) || a.titulo.localeCompare(b.titulo, 'pt-BR'));
    if (!_roles.length) _roles = DEFAULT_ROLES.map(normalizeRole);
    if (!_selectedId || !_roles.some((r) => r.id === _selectedId)) _selectedId = _roles[0]?.id || '';
    if (!_sim.role || !_roles.some((r) => r.id === _sim.role)) _sim.role = _selectedId;
    _loaded = true;
  }

  function renderTabs() {
    const items = [
      { id: 'trilhas', label: 'Trilhas de Cargo', icon: 'target' },
      { id: 'formas', label: 'Formas de Crescimento', icon: 'merge' },
      { id: 'criterios', label: 'Critérios & Impedimentos', icon: 'clip' },
      { id: 'simulador', label: 'Simulador de Elegibilidade', icon: 'calc', sim: true },
    ];
    return `<div class="rh-carreira-tabs"><div class="rh-carreira-wrap"><div class="rh-carreira-tabs-inner">${items.map((it) =>
      `<button type="button" class="rh-carreira-tab${it.sim ? ' rh-carreira-tab--sim' : ''}${_section === it.id ? ' is-active' : ''}" data-section="${it.id}">${iconSvg(it.icon)}<span>${_esc(it.label)}</span></button>`
    ).join('')}</div></div></div>`;
  }

  function renderTrilhas() {
    const role = selectedRole();
    if (!role) return '<p class="text-muted">Nenhum cargo cadastrado.</p>';
    const chips = _roles.map((r) =>
      `<button type="button" class="rh-carreira-chip${r.id === role.id ? ' is-active' : ''}" data-role="${_esc(r.id)}">
        ${iconSvg(r.icone)}
        <span>${_esc(r.titulo)}</span>
      </button>`
    ).join('');
    const levels = (role.niveis || []).map((lvl, idx) =>
      `<div class="rh-carreira-level">
        <div class="rh-carreira-level__top">
          <span class="rh-carreira-level-name">${_esc(lvl.name)}</span>
          <span class="rh-carreira-level-meta${idx ? ' is-next' : ''}">${idx ? 'Requer +12 Meses' : 'Nível Inicial'}</span>
        </div>
        <p>${_esc(lvl.desc)}</p>
      </div>`
    ).join('');
    const edit = canEdit()
      ? `<div class="rh-carreira-editbar">
           <button type="button" class="btn btn-outline btn-sm" onclick="RhCarreira.openEdit()">Editar cargo</button>
           <button type="button" class="btn btn-primary btn-sm" onclick="RhCarreira.openEdit(true)">+ Novo cargo</button>
         </div>`
      : '';
    return `
      <div class="rh-carreira-section-head">
        <div>
          <span class="rh-carreira-kicker">Mapeamento de Funções</span>
          <h2>Trilhas de Cargo</h2>
          <p>Evolua dentro do seu cargo e conquiste novos níveis na Blu Promotora.</p>
        </div>
        <div>
          ${edit}
          <div class="rh-carreira-hint">Selecione um cargo para filtrar a linha do tempo</div>
        </div>
      </div>
      <div class="rh-carreira-chips">${chips}</div>
      <div class="rh-carreira-panel">
        <div class="rh-carreira-panel-head">
          <div class="rh-carreira-iconbox">${iconSvg(role.icone)}</div>
          <div>
            <h3>${_esc(role.titulo)}</h3>
            <p>${_esc(role.descricao)}</p>
          </div>
        </div>
        <h4 class="rh-carreira-levels-label">Níveis de Progressão Horizontal</h4>
        <div class="rh-carreira-levels">${levels || '<p>Sem níveis cadastrados.</p>'}</div>
      </div>`;
  }

  function renderFormas() {
    const cards = [
      { n: '1', cls: '', title: 'PROGRESSÃO HORIZONTAL', text: 'Evolução por níveis dentro do mesmo cargo (ex: Nível I → Nível II → Nível III).', lab: 'Requisito de Tempo:', box: 'Após <strong>12 meses</strong> no nível vigente, atendendo a todos os critérios de progressão.' },
      { n: '2', cls: ' is-2', title: 'PROCESSO SELETIVO INTERNO', text: 'Participe de oportunidades e processos seletivos internos para mudar de cargo.', lab: 'Requisito de Tempo:', box: 'Após a conclusão do período de experiência (<strong>90 dias</strong>), você pode se candidatar às vagas disponíveis.' },
      { n: '3', cls: ' is-3', title: 'PROMOÇÃO POR MÉRITO', text: 'Reconhecimento e promoção a partir do seu desempenho excepcional e potencial elevado.', lab: 'Condição de Aprovação:', box: 'A empresa pode promover para cargo de maior responsabilidade conforme necessidade organizacional e avaliação da liderança.' },
    ];
    return `
      <div class="rh-carreira-section-head">
        <div>
          <span class="rh-carreira-kicker">Caminhos de Carreira</span>
          <h2>Formas de Crescimento na Blu</h2>
          <p>Existem diferentes caminhos para você evoluir na nossa empresa.</p>
        </div>
      </div>
      <div class="rh-carreira-grid3">${cards.map((c) =>
        `<div class="rh-carreira-growth${c.cls}">
          <div class="rh-carreira-num">${c.n}</div>
          <div>
            <h3>${c.title}</h3>
            <p>${c.text}</p>
          </div>
          <div class="rh-carreira-note"><span>${c.lab}</span><p>${c.box}</p></div>
        </div>`
      ).join('')}</div>`;
  }

  function renderCriterios() {
    return `
      <div class="rh-carreira-section-head">
        <div>
          <span class="rh-carreira-kicker">Regras & Requisitos</span>
          <h2>Critérios para Progressão</h2>
          <p>Para evoluir na sua carreira, todos os critérios abaixo devem ser atendidos de forma conjunta.</p>
        </div>
      </div>
      <div class="rh-carreira-grid5">${CRITERIA.map((c) =>
        `<div class="rh-carreira-crit">
          <div class="rh-carreira-iconbox">${iconSvg(c.icon)}</div>
          <span class="rh-carreira-kicker">${c.id}. ${ _esc(c.title).toUpperCase() }</span>
          <h4>${_esc(c.subtitle)}</h4>
          <p>${_esc(c.desc)}</p>
        </div>`
      ).join('')}</div>
      <div class="rh-carreira-split">
        <div class="rh-carreira-info">
          <h3>${iconSvg('shield')}Avisos Importantes sobre a Política</h3>
          <ul>
            <li>${iconSvg('check')}<span>O atendimento aos critérios não garante a progressão. A progressão não constitui direito adquirido.</span></li>
            <li>${iconSvg('check')}<span>A progressão depende da aprovação do Comitê de Pessoas e da disponibilidade orçamentária vigente.</span></li>
          </ul>
        </div>
        <div class="rh-carreira-warn">
          <h3>${iconSvg('slash')}Impedimentos para Progressão</h3>
          <ul>${IMPEDIMENTS.map((i) => `<li><span class="rh-carreira-x">✘</span> ${_esc(i)}</li>`).join('')}</ul>
        </div>
      </div>`;
  }

  function renderSimulador() {
    const roleOpts = _roles.map((r) =>
      `<option value="${_esc(r.id)}"${_sim.role === r.id ? ' selected' : ''}>${_esc(r.titulo)}</option>`
    ).join('');
    const st = eligibility();
    const boxClass = st.type === 'max' ? 'is-max' : (st.type === 'eligible' ? 'is-ok' : 'is-warn');
    return `
      <div class="rh-carreira-panel rh-carreira-sim-wrap">
        <div class="rh-carreira-sim-title">
          <span class="rh-carreira-kicker rh-carreira-kicker--amber">Ferramenta Interativa</span>
          <h2>Simulador de Elegibilidade</h2>
          <p>Preencha seus dados atuais e verifique seu status para a próxima progressão de nível.</p>
        </div>
        <div class="rh-carreira-sim-grid">
          <div class="rh-carreira-field">
            <label for="carreira_sim_role">Seu Cargo Atual</label>
            <select id="carreira_sim_role">${roleOpts}</select>
          </div>
          <div class="rh-carreira-field">
            <label for="carreira_sim_level">Seu Nível Atual</label>
            <select id="carreira_sim_level">
              <option value="1"${Number(_sim.level) === 1 ? ' selected' : ''}>Nível I</option>
              <option value="2"${Number(_sim.level) === 2 ? ' selected' : ''}>Nível II</option>
              <option value="3"${Number(_sim.level) === 3 ? ' selected' : ''}>Nível III (Máximo)</option>
            </select>
          </div>
          <div class="rh-carreira-field">
            <div class="rh-carreira-range-lab">
              <label for="carreira_sim_months">Tempo no Nível Vigente</label>
              <span id="carreira_sim_months_val">${Number(_sim.months)} Meses</span>
            </div>
            <input id="carreira_sim_months" type="range" min="0" max="24" value="${Number(_sim.months)}" />
          </div>
          <div class="rh-carreira-field">
            <label for="carreira_sim_perf">Avaliação de Desempenho</label>
            <select id="carreira_sim_perf">
              <option value="ok"${_sim.perf === 'ok' ? ' selected' : ''}>Satisfatório / Excede Expectativas</option>
              <option value="low"${_sim.perf === 'low' ? ' selected' : ''}>Abaixo do Esperado</option>
            </select>
          </div>
          <div class="rh-carreira-field">
            <label for="carreira_sim_train">Trilhas de Treinamento</label>
            <select id="carreira_sim_train">
              <option value="yes"${_sim.train === 'yes' ? ' selected' : ''}>Concluídas 100%</option>
              <option value="no"${_sim.train === 'no' ? ' selected' : ''}>Incompletas / Pendentes</option>
            </select>
          </div>
          <div class="rh-carreira-field">
            <label for="carreira_sim_disc">Medidas Disciplinares</label>
            <select id="carreira_sim_disc">
              <option value="none"${_sim.disc === 'none' ? ' selected' : ''}>Nenhuma medida vigente</option>
              <option value="active"${_sim.disc === 'active' ? ' selected' : ''}>Com advertência / medida vigente</option>
            </select>
          </div>
        </div>
        <div class="rh-carreira-result ${boxClass}">
          <strong>${_esc(st.title)}</strong>
          ${st.message ? `<p>${_esc(st.message)}</p>` : ''}
          ${st.reasons ? `<ul>${st.reasons.map((r) => `<li>${_esc(r)}</li>`).join('')}</ul>` : ''}
        </div>
      </div>`;
  }

  function renderCommittee() {
    return `<section class="rh-carreira-committee">
      <div class="rh-carreira-committee-head">
        <div class="rh-carreira-committee-brand">
          <div class="rh-carreira-iconbox">${iconSvg('users2')}</div>
          <div>
            <span class="rh-carreira-kicker">Governança da Política</span>
            <h3>Comitê de Pessoas</h3>
          </div>
        </div>
        <p>A progressão depende do atendimento de todos os critérios da política, da aprovação do Comitê de Pessoas e da disponibilidade orçamentária vigente.</p>
      </div>
      <div class="rh-carreira-committee-grid">
        <div><span>1. Gestor Imediato</span><p>Avalia o desempenho do colaborador e faz a recomendação fundamentada.</p></div>
        <div><span>2. Recursos Humanos</span><p>Valida o cumprimento dos prazos, treinamentos e ausência de impedimentos.</p></div>
        <div><span>3. Diretoria</span><p>Delibera sobre as movimentações com base no orçamento e diretrizes.</p></div>
      </div>
    </section>`;
  }

  function bind() {
    const root = document.getElementById('rhCarreiraRoot');
    if (!root) return;
    root.querySelectorAll('[data-section]').forEach((btn) => {
      btn.addEventListener('click', () => {
        _section = btn.getAttribute('data-section') || 'trilhas';
        paint();
      });
    });
    root.querySelectorAll('[data-role]').forEach((btn) => {
      btn.addEventListener('click', () => {
        _selectedId = btn.getAttribute('data-role') || _selectedId;
        paint();
      });
    });
    const simRole = document.getElementById('carreira_sim_role');
    const simLevel = document.getElementById('carreira_sim_level');
    const simMonths = document.getElementById('carreira_sim_months');
    const simPerf = document.getElementById('carreira_sim_perf');
    const simTrain = document.getElementById('carreira_sim_train');
    const simDisc = document.getElementById('carreira_sim_disc');
    if (simRole) simRole.onchange = () => { _sim.role = simRole.value; _sim.level = 1; paint(); };
    if (simLevel) simLevel.onchange = () => { _sim.level = Number(simLevel.value || 1); paint(); };
    if (simMonths) {
      simMonths.oninput = () => {
        _sim.months = Number(simMonths.value || 0);
        const lab = document.getElementById('carreira_sim_months_val');
        if (lab) lab.textContent = `${_sim.months} Meses`;
      };
      simMonths.onchange = () => { _sim.months = Number(simMonths.value || 0); paint(); };
    }
    if (simPerf) simPerf.onchange = () => { _sim.perf = simPerf.value; paint(); };
    if (simTrain) simTrain.onchange = () => { _sim.train = simTrain.value; paint(); };
    if (simDisc) simDisc.onchange = () => { _sim.disc = simDisc.value; paint(); };
  }

  function paint() {
    const root = document.getElementById('rhCarreiraRoot');
    if (!root) return;
    let body = '';
    if (_section === 'formas') body = renderFormas();
    else if (_section === 'criterios') body = renderCriterios();
    else if (_section === 'simulador') body = renderSimulador();
    else body = renderTrilhas();
    root.innerHTML = `<div class="rh-carreira">
      ${renderTabs()}
      <main class="rh-carreira-main">
        ${body}
        ${renderCommittee()}
      </main>
    </div>`;
    bind();
  }

  async function render() {
    const root = document.getElementById('rhCarreiraRoot');
    if (!root) return;
    if (!_loaded) {
      root.innerHTML = '<div class="text-muted text-center" style="padding:24px;">Carregando trilha de carreira...</div>';
      await loadRoles();
    }
    ensureModal();
    paint();
  }

  function openEdit(isNew) {
    if (!canEdit()) return;
    ensureModal();
    const role = isNew ? null : selectedRole();
    document.getElementById('rhCarreiraModalTitle').textContent = isNew ? 'Novo cargo da trilha' : 'Editar cargo';
    document.getElementById('carreira_edit_id').value = isNew ? '' : (role?.id || '');
    document.getElementById('carreira_titulo').value = isNew ? '' : (role?.titulo || '');
    document.getElementById('carreira_icone').value = isNew ? 'target' : (role?.icone || 'target');
    document.getElementById('carreira_sort').value = isNew ? String((_roles.length + 1) * 10) : String(role?.sort_order || 0);
    document.getElementById('carreira_desc').value = isNew ? '' : (role?.descricao || '');
    renderNivelRows(isNew ? [{ name: 'Nível I', desc: '' }, { name: 'Nível II', desc: '' }] : (role?.niveis || []));
    openModal('rhCarreiraModal');
  }

  async function submitEdit(ev) {
    ev.preventDefault();
    if (!canEdit()) return false;
    const titulo = String(document.getElementById('carreira_titulo')?.value || '').trim();
    if (!titulo) return false;
    const niveis = collectNivelRows();
    if (!niveis.length) {
      alert('Informe ao menos um nível.');
      return false;
    }
    const existingId = String(document.getElementById('carreira_edit_id')?.value || '').trim();
    const row = {
      id: existingId || slugify(titulo),
      titulo,
      icone: String(document.getElementById('carreira_icone')?.value || 'target'),
      descricao: String(document.getElementById('carreira_desc')?.value || '').trim(),
      niveis,
      sort_order: Number(document.getElementById('carreira_sort')?.value || 0),
      active: 1,
    };
    try {
      if (typeof DB !== 'undefined' && DB.saveRhTrilhaCargo) {
        await DB.saveRhTrilhaCargo(row);
      }
      closeModal('rhCarreiraModal');
      _loaded = false;
      _selectedId = row.id;
      await render();
    } catch (e) {
      alert(e?.message || 'Não foi possível salvar o cargo.');
    }
    return false;
  }

  window.RhCarreira = {
    render,
    openEdit,
    closeEdit() { closeModal('rhCarreiraModal'); },
    submitEdit,
    addNivelRow() {
      const current = collectNivelRows();
      current.push({ name: `Nível ${current.length + 1}`, desc: '' });
      renderNivelRows(current);
    },
    removeNivelRow(idx) {
      const current = collectNivelRows();
      current.splice(idx, 1);
      renderNivelRows(current);
    },
  };
})();
