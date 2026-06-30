/* =============================================
   SOU + BLU – Gerenciador de RH
   pages/rh-manager.html
   ============================================= */

'use strict';

/* ══ ESTADO GLOBAL ══ */
var currentUser = null;
let _allCompanies = [];
let _allResumes = [];
let _allJobs = [];
window._allEmployees = window._allEmployees || [];

function _rhEmpSortKey(row) {
  return String(row?.nome || row?.name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR');
}

function _sortRhEmpByName(rows) {
  return (rows || []).slice().sort((a, b) =>
    _rhEmpSortKey(a).localeCompare(_rhEmpSortKey(b), 'pt-BR', { sensitivity: 'base' })
  );
}

let _editingCvId = null;
let _editingJobId = null;

const _RH_ALLOWED_ROLES = [
  'master', 'fundador', 'desenvolvedor', 'rh', 'gerente',
  'juridico', 'gerencia', 'financeiro', 'diretoria',
];

const _RH_TAB_TITLES = {
  sonhos: 'Painel dos Sonhos',
  conta: 'Minha Conta',
  kanban: 'Esteira Seletiva',
  empresa: 'Empresas Parceiras',
  curriculo: 'Currículos / Candidatos',
  cargo: 'Cargos',
  funcionario: 'Cadastrar Funcionário',
  feedback: 'Feedbacks',
  justificativa: 'Justificativa de Falta',
  punicao: 'Registro Punição',
  demissao: 'Demissão',
  folha: 'Gerar Folha de Pagamento',
  relatorios: 'Relatórios',
  ranking: 'Ranking Vendas',
  parceiro: 'Cadastrar Parceiros',
};

const _RH_ROLE_LABELS = {
  master: 'Master',
  fundador: 'Fundador',
  desenvolvedor: 'Desenvolvimento / TI',
  rh: 'RH',
  gerente: 'Gerente',
  gerencia: 'Gerência',
  financeiro: 'Financeiro',
  financial: 'Financeiro',
  juridico: 'Jurídico',
  diretoria: 'Diretoria',
  vendedor: 'Vendedor',
  backoffice: 'Backoffice',
  supervisor: 'Supervisor',
};

const _PERM_CHECKBOX_IDS = [
  'canMasterPanel', 'canSaques', 'canCadFunc', 'canProposta', 'canClientes',
  'canPartnerOpsHub', 'canRanking', 'canLoja', 'canSimulacao', 'canChamados',
  'canSupervisorPanel', 'canPartnerDashboard', 'canLeadsManager', 'canTreinamentos',
  'canTimIndicacao', 'canTimEsteira', 'canContestacao', 'canFiscalParceiro',
  'canMarketplaceBlu', 'canFornecedorFinanceiro', 'canContaCorrente',
];

/* ══ HELPERS ══ */
function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _digits(v) {
  return String(v ?? '').replace(/\D/g, '');
}

function _fmtCnpj(v) {
  const d = _digits(v);
  if (d.length !== 14) return v || '';
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function _fmtCpf(v) {
  const d = _digits(v);
  if (d.length !== 11) return v || '';
  return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
}

const _lastRhFonteBundle = { cv: null, emp: null };

function _fonteDateToInput(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return '';
}

function _fmtPis(digits) {
  const d = _digits(digits);
  if (d.length !== 11) return digits || '';
  return d.replace(/^(\d{3})(\d{5})(\d{2})$/, '$1.$2.$3-$4');
}

function _rhMetaFromRow(row) {
  let meta = row?.fontedata_meta;
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta); } catch { meta = null; }
  }
  return meta && typeof meta === 'object' ? meta : null;
}

function _renderRhFonteInfo(prefix, bundle) {
  const el = document.getElementById(`${prefix}_fontedata_info`);
  if (!el) return;
  const html = (typeof FonteData !== 'undefined' && FonteData.formatRhConsultaSummary)
    ? FonteData.formatRhConsultaSummary(bundle)
    : '';
  if (!html) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = '';
  el.innerHTML = html;
}

function _applyRhFonteBundle(prefix, bundle) {
  _lastRhFonteBundle[prefix] = bundle;
  const nomeId = prefix === 'emp' ? 'emp_nome' : 'cv_nome';

  if (bundle?.basico?.ok && bundle.basico.client) {
    const c = bundle.basico.client;
    if (c.name) _set(nomeId, c.name);
    if (prefix === 'cv') {
      if (c.phone1) _set('cv_contato', c.phone1);
      if (c.email) _set('cv_email', c.email);
    } else {
      if (c.phone1) _set('emp_contato', c.phone1);
      if (c.email) _set('emp_email_pessoal', c.email);
    }
    const bd = _fonteDateToInput(c.birthDate);
    if (bd && !_val(`${prefix}_data_nascimento`)) _set(`${prefix}_data_nascimento`, bd);
  }

  if (bundle?.receita?.ok && bundle.receita.receita) {
    const r = bundle.receita.receita;
    if (r.nome) _set(nomeId, r.nome);
    const dn = _fonteDateToInput(r.data_nascimento);
    if (dn) _set(`${prefix}_data_nascimento`, dn);
    _set(`${prefix}_situacao_rf`, r.situacao_cadastral || '');
  }

  if (bundle?.pis?.ok && bundle.pis.pis) {
    const p = bundle.pis.pis;
    if (p.pis) _set(`${prefix}_pis`, _fmtPis(p.pis));
  }

  _renderRhFonteInfo(prefix, bundle);
}

function _fonteMetaForSave(prefix) {
  const bundle = _lastRhFonteBundle[prefix];
  if (!bundle) return null;
  return {
    consultado_em: new Date().toISOString(),
    receita: bundle.receita?.ok ? bundle.receita.receita : (bundle.receita?.error || null),
    pis: bundle.pis?.ok ? bundle.pis.pis : (bundle.pis?.error || null),
    basico: bundle.basico?.ok ? bundle.basico.client : (bundle.basico?.error || null),
  };
}

async function _consultarFonteDataRh(prefix) {
  const cpfId = prefix === 'emp' ? 'emp_cpf' : 'cv_cpf';
  const cpf = _digits(_val(cpfId));
  if (cpf.length !== 11) {
    showToast('Informe um CPF válido (11 dígitos).', 'warning');
    return null;
  }
  if (typeof FonteData === 'undefined' || typeof FonteData.lookupRhPerson !== 'function') {
    showToast('API FonteData não disponível. Recarregue a página.', 'error');
    return null;
  }

  const dataNasc = _val(`${prefix}_data_nascimento`);
  showLoading('Consultando Receita Federal, PIS e cadastro...');
  try {
    const bundle = await FonteData.lookupRhPerson(cpf, dataNasc);
    if (!bundle.ok) {
      _renderRhFonteInfo(prefix, bundle);
      showToast(bundle.error || 'Nenhuma consulta retornou dados.', 'warning');
      return bundle;
    }
    _applyRhFonteBundle(prefix, bundle);
    const parts = [];
    if (bundle.receita?.ok) parts.push('Receita Federal');
    if (bundle.pis?.ok) parts.push('PIS');
    if (bundle.basico?.ok) parts.push('cadastro');
    showToast(`Consultas concluídas: ${parts.join(', ') || 'dados carregados'}.`, 'success');
    return bundle;
  } catch (e) {
    console.error('[RH] _consultarFonteDataRh:', e);
    showToast('Falha nas consultas FonteData.', 'error');
    return null;
  } finally {
    hideLoading();
  }
}

function _loadRhFonteFieldsFromRow(prefix, row) {
  if (!row) return;
  const meta = _rhMetaFromRow(row);
  const dn = _fonteDateToInput(row.data_nascimento || meta?.receita?.data_nascimento || meta?.pis?.data_nascimento);
  if (dn) _set(`${prefix}_data_nascimento`, dn);
  const pis = row.pis || meta?.pis?.pis || meta?.pis?.pis_formatado;
  if (pis) _set(`${prefix}_pis`, _fmtPis(pis));
  const sit = row.situacao_cadastral || meta?.receita?.situacao_cadastral;
  if (sit) _set(`${prefix}_situacao_rf`, sit);
  if (meta) {
    _renderRhFonteInfo(prefix, {
      ok: true,
      receita: meta.receita && typeof meta.receita === 'object' && !meta.receita.error
        ? { ok: true, receita: meta.receita } : { ok: false, error: meta.receita },
      pis: meta.pis && typeof meta.pis === 'object' && !meta.pis.error
        ? { ok: true, pis: meta.pis } : { ok: false, error: meta.pis },
      basico: meta.basico && typeof meta.basico === 'object' && !meta.basico.error
        ? { ok: true, client: meta.basico } : { ok: false, error: meta.basico },
    });
  } else {
    _renderRhFonteInfo(prefix, null);
  }
  _lastRhFonteBundle[prefix] = null;
}

function _fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
}

function _val(id) {
  return document.getElementById(id)?.value ?? '';
}

function _set(id, v) {
  const el = document.getElementById(id);
  if (el) el.value = v ?? '';
}

/** Prefixo fixo — não usar _gerarProtocoloRh de rh-ops.js (carregado depois e exige prefix). */
function _gerarProtocoloRhManager(prefix = 'RH') {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const seq = String(Math.floor(1000 + Math.random() * 9000));
  return `${prefix}-${ymd}-${seq}`;
}

function gerarProtocoloCurriculo() {
  const p = _gerarProtocoloRhManager('RH');
  _set('cv_protocolo', p);
  return p;
}

function gerarProtocoloCargo() {
  const p = _gerarProtocoloRhManager('RH');
  _set('jg_protocolo', p);
  return p;
}

async function _ensureRhDatabaseReady() {
  const banner = document.getElementById('rhDbStatusBanner');
  try {
    const core = await DB.ensureRhTablesOnline();
    const c = window.SOUBLU_CONFIG || {};
    const key = c.API_KEY;
    const base = String(c.API_BASE_URL || c.SITE_URL || location.origin).replace(/\/+$/, '');
    let cbo = { ok: true, skipped: true };

    if (key && c.DB_BACKEND === 'hostinger') {
      const flag = sessionStorage.getItem('soublu_rh_cbo_migrated');
      if (flag !== '1') {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 8000);
        let res;
        try {
          res = await fetch(`${base}/api/migrate-rh-cbo.php`, {
            headers: { apikey: key, 'X-API-Key': key },
            signal: ctrl.signal,
          });
        } finally {
          clearTimeout(tid);
        }
        cbo = await res.json().catch(() => ({}));
        if (res.ok && cbo.ok) sessionStorage.setItem('soublu_rh_cbo_migrated', '1');
      }
    }

    if (banner) {
      if (core?.ok === false || cbo?.ok === false) {
        banner.style.display = '';
        banner.innerHTML = `<div class="alert alert-warning" style="margin:0;">Aviso: migração RH online incompleta. Alguns dados podem não sincronizar.</div>`;
      } else {
        banner.style.display = 'none';
      }
    }
    return { ok: true, core, cbo };
  } catch (e) {
    console.warn('[RH] _ensureRhDatabaseReady:', e);
    if (banner) {
      banner.style.display = '';
      banner.innerHTML = `<div class="alert alert-warning" style="margin:0;">Não foi possível validar tabelas RH: ${_esc(e.message || e)}</div>`;
    }
    return { ok: false, error: e.message };
  }
}

function _rhDefaultTab(role) {
  if (typeof PainelSonhos !== 'undefined' && PainelSonhos.eligible(role)) return 'sonhos';
  return 'kanban';
}

function _rhGreeting() {
  const hour = Number(new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    hour12: false,
  }).format(new Date()));
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function _updateRhFuncionarioGreeting() {
  const el = document.getElementById('rhFuncionarioGreeting');
  if (!el || !currentUser) return;
  const name = String(currentUser.name || '').trim().split(/\s+/)[0] || 'gestor';
  el.textContent = `${_rhGreeting()}, ${name}! Cadastre e atualize colaboradores com o formulário completo de RH.`;
}

function _applyRhChrome(role) {
  const r = String(role || '').toLowerCase();
  const isJuridico = r === 'juridico';
  const showSonhos = typeof PainelSonhos !== 'undefined' && PainelSonhos.eligible(r);

  document.querySelectorAll('.juridico-section-label, .juridico-nav').forEach((el) => {
    el.style.display = isJuridico ? '' : 'none';
  });
  document.querySelectorAll('.rh-mgmt-label, .rh-mgmt-only').forEach((el) => {
    el.style.display = isJuridico ? 'none' : '';
  });
  document.querySelectorAll('.juridico-only').forEach((el) => {
    el.style.display = isJuridico ? '' : 'none';
  });

  document.querySelectorAll('.nav-item[data-tab="sonhos"]').forEach((el) => {
    el.style.display = showSonhos ? '' : 'none';
  });

  document.querySelectorAll('.sidebar-nav .nav-section-label').forEach((lbl) => {
    if (lbl.textContent.trim().toLowerCase() === 'início') {
      lbl.style.display = (showSonhos || isJuridico) ? '' : 'none';
    }
  });

  const tabSonhos = document.getElementById('tab-sonhos');
  if (tabSonhos) tabSonhos.style.display = showSonhos ? '' : 'none';
}

function _renderRhSidebarUser(user) {
  const name = user?.name || 'Usuário';
  const role = _RH_ROLE_LABELS[user?.role] || user?.role || '—';
  const initials = (name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('') || '?').toUpperCase();
  const photo = typeof resolvePhotoUrl === 'function' ? resolvePhotoUrl(user?.photo_url) : (user?.photo_url || '');

  const nameEl = document.getElementById('userName');
  const roleEl = document.getElementById('userRole');
  const avatarEl = document.getElementById('userAvatar');
  const topName = document.getElementById('topbarUserName');
  const topAvatar = document.getElementById('topbarAvatar');

  if (nameEl) nameEl.textContent = name;
  if (roleEl) roleEl.textContent = role;
  if (topName) {
    topName.textContent = name;
    topName.style.display = '';
  }

  const avatarHtml = photo
    ? `<img src="${_esc(photo)}" alt=""/>`
    : initials;

  if (avatarEl) avatarEl.innerHTML = avatarHtml;
  if (topAvatar) {
    topAvatar.innerHTML = avatarHtml;
    topAvatar.style.display = '';
  }
}

function _collectPermissoesFromForm() {
  const permissions = {};
  _PERM_CHECKBOX_IDS.forEach((key) => {
    const el = document.getElementById(`perm_${key}`);
    if (el) permissions[key] = !!el.checked;
  });
  return permissions;
}

function _fillPermissoesForm(perms) {
  const p = perms || {};
  _PERM_CHECKBOX_IDS.forEach((key) => {
    const el = document.getElementById(`perm_${key}`);
    if (el) el.checked = !!p[key];
  });
}

async function _syncRhUserFromEmployee(emp, password) {
  const email = DB.normalizeEmail(emp.email || emp.email_pessoal || '');
  if (!email) return null;

  const users = await DB.getAllUsers().catch(() => []);
  const cpf = _digits(emp.cpf);
  let u = users.find((x) =>
    (cpf && x.cpf && _digits(x.cpf) === cpf)
    || (email && x.email && String(x.email).toLowerCase() === email)
  );

  const userData = {
    name: emp.nome || emp.name || '',
    email,
    cpf: cpf || null,
    phone: emp.contato || emp.phone || null,
    matricula: emp.matricula || undefined,
    department: emp.departamento || 'Geral',
    role: emp.role || emp.system_role || 'vendedor',
    permissions: emp.permissions || _collectPermissoesFromForm(),
  };
  if (emp.supervisor_id) {
    userData.admin_id = emp.supervisor_id;
  } else if (typeof ADMIN_ID !== 'undefined') {
    userData.admin_id = ADMIN_ID;
  }

  if (password) userData.password = password;

  if (u?.id) {
    await DB.updateUser(u.id, userData);
    return u.id;
  }

  if (!password) return null;
  const created = await DB.addUser({
    ...userData,
    password,
    balance: 0,
    points: 0,
  });
  return created?.id || null;
}

/* ══ MODAIS ══ */
function openModalRH(id) {
  if (typeof openModal === 'function') openModal(id);
  else document.getElementById(id)?.classList.add('open');
}

function closeModalRH(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

/* ══ NAVEGAÇÃO ══ */
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach((t) => {
    t.classList.remove('active');
    t.style.display = 'none';
  });
  document.querySelectorAll('.nav-item[data-tab]').forEach((n) => n.classList.remove('active'));

  const tab = document.getElementById(`tab-${tabId}`);
  const nav = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (tab) {
    tab.classList.add('active');
    tab.style.display = '';
  }
  if (nav) nav.classList.add('active');

  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = _RH_TAB_TITLES[tabId] || tabId;

  if (tabId === 'curriculo') renderResumeList();
  if (tabId === 'cargo') renderJobList();
  if (tabId === 'funcionario') {
    _updateRhFuncionarioGreeting();
    renderEmployeeList();
  }
  if (tabId === 'justificativa' && typeof renderJustificativaList === 'function') {
    renderJustificativaList();
  }
  if (tabId === 'punicao' && typeof renderPunicaoList === 'function') {
    renderPunicaoList();
  }
  if (tabId === 'demissao' && typeof renderDemissaoList === 'function') {
    renderDemissaoList();
  }
  if (tabId === 'sonhos' && typeof PainelSonhos !== 'undefined') {
    PainelSonhos.render('painelSonhosRoot');
  }
  if (tabId === 'conta' && typeof renderProfile === 'function') {
    renderProfile();
    document.getElementById('tab-conta')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (tabId === 'kanban' && typeof renderKanban === 'function') {
    renderKanban();
  }
  if (tabId === 'feedback' && typeof renderRhFeedbackList === 'function') {
    renderRhFeedbackList();
  }
  if (tabId === 'relatorios') {
    if (typeof initRhRelatoriosHub === 'function') initRhRelatoriosHub();
    if (typeof renderRhRelatoriosHub === 'function') renderRhRelatoriosHub();
  }
  if (tabId === 'parceiro' && typeof renderRhPartnersPanel === 'function') {
    renderRhPartnersPanel();
  }
}

function openRhRankingTab() {
  switchTab('relatorios');
  if (typeof switchRhRelatorio === 'function') switchRhRelatorio('ranking');
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = _RH_TAB_TITLES.ranking || 'Ranking Vendas';
}

function openRhFolhaTab() {
  switchTab('relatorios');
  if (typeof switchRhRelatorio === 'function') switchRhRelatorio('folha');
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = _RH_TAB_TITLES.folha || 'Gerar Folha de Pagamento';
}

function _adminPanelHrefFresh(hash) {
  let base;
  if (typeof Auth !== 'undefined' && Auth.adminPageHrefFresh) {
    base = Auth.adminPageHrefFresh();
  } else if (typeof Auth !== 'undefined' && Auth.adminPageHref) {
    base = Auth.adminPageHref();
    const sep = base.includes('?') ? '&' : '?';
    base = `${base}${sep}_r=${Date.now().toString(36)}`;
  } else {
    base = typeof Auth !== 'undefined' && Auth.resolveHref
      ? Auth.resolveHref('admin.html')
      : 'admin.html';
  }
  if (!hash) return base;
  try {
    const u = new URL(base, window.location.href);
    u.hash = hash.startsWith('#') ? hash : `#${hash}`;
    return u.href;
  } catch (_) {
    return `${base}${hash.startsWith('#') ? hash : `#${hash}`}`;
  }
}

function navigateBack() {
  try {
    window.location.replace(_adminPanelHrefFresh());
  } catch (_) {
    window.location.replace(typeof Auth !== 'undefined' && Auth.resolveHref
      ? Auth.resolveHref('admin.html')
      : 'admin.html');
  }
}

function openJuridicoChamados() {
  const base = typeof Auth !== 'undefined' && Auth.juridicoManagerPageHrefFresh
    ? Auth.juridicoManagerPageHrefFresh()
    : (typeof Auth !== 'undefined' && Auth.resolveHref
      ? Auth.resolveHref('pages/juridico-manager.html')
      : 'pages/juridico-manager.html');
  try {
    const u = new URL(base, window.location.href);
    u.hash = 'chamados';
    window.location.replace(u.href);
  } catch (_) {
    window.location.replace(`${base}#chamados`);
  }
}

function openJuridicoContestacao() {
  const base = typeof Auth !== 'undefined' && Auth.juridicoManagerPageHrefFresh
    ? Auth.juridicoManagerPageHrefFresh()
    : (typeof Auth !== 'undefined' && Auth.resolveHref
      ? Auth.resolveHref('pages/juridico-manager.html')
      : 'pages/juridico-manager.html');
  window.location.replace(base);
}

/* ══ RENDER LISTAS ══ */
function _fillJobSelects() {
  const opts = '<option value="">Selecione...</option>' + _allJobs.map((j) =>
    `<option value="${_esc(j.id)}">${_esc(j.cargo || j.titulo || 'Cargo')}</option>`
  ).join('');
  ['cv_vaga', 'emp_cargo'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });
}

async function _fillLeadersSelects() {
  try {
    if (!window._allSystemUsersCache) {
      window._allSystemUsersCache = await DB.getUsers();
    }
    // Apenas líderes (iguais ao master)
    const leaders = (window._allSystemUsersCache || []).filter(u =>
      ['supervisor', 'parceiro', 'sup_backoffice', 'diretoria', 'gerente'].includes(u.role) && u.active !== false
    );
    
    leaders.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const roleTag = (r) => ({
      parceiro: 'Parceiro',
      sup_backoffice: 'Sup. Backoffice',
      supervisor: 'Supervisor',
      diretoria: 'Diretoria',
      gerente: 'Gerente'
    }[r] || '');

    const opts = '<option value="">— Sem vínculo —</option>' + leaders.map(s => {
      const tag = roleTag(s.role);
      // Salva o ID para vincular no admin_id, mas guarda o nome no data-name
      return `<option value="${_esc(s.id)}" data-name="${_esc(s.name || s.email)}">${tag ? tag + ' — ' : ''}${_esc(s.name || s.email)} (${_esc(s.department || '—')})</option>`;
    }).join('');

    ['emp_supervisor', 'emp_responsavel_dpto', 'emp_diretor_dpto'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        // Guarda o valor atual pra não perder ao repopular
        const currentVal = el.value;
        el.innerHTML = opts;
        if (currentVal) el.value = currentVal;
      }
    });
  } catch(e) {
    console.error('Error filling leaders:', e);
  }
}


function _fillCompanySelect() {
  const el = document.getElementById('emp_cnpj_registro');
  if (!el) return;
  el.innerHTML = '<option value="">Selecione a empresa...</option>' + _allCompanies.map((c) =>
    `<option value="${_esc(c.cnpj || c.id)}">${_esc(c.razao_social || 'Empresa')} — ${_esc(_fmtCnpj(c.cnpj))}</option>`
  ).join('');
}

function _jobLabel(id) {
  const j = _allJobs.find((x) => String(x.id) === String(id));
  return j ? (j.cargo || j.titulo || '—') : '—';
}

function renderCompanyList() {
  const tbody = document.getElementById('company_list_body');
  if (!tbody) return;
  if (!_allCompanies.length) {
    tbody.innerHTML = '<tr><td colspan="2" class="text-center text-muted">Nenhum registro encontrado.</td></tr>';
    return;
  }
  tbody.innerHTML = _allCompanies.map((c) => `<tr>
    <td>${_esc(_fmtCnpj(c.cnpj))}</td>
    <td><strong>${_esc(c.razao_social)}</strong></td>
  </tr>`).join('');
}

function renderResumeList() {
  const tbody = document.getElementById('resume_list_body');
  if (!tbody) return;
  if (!_allResumes.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Nenhum registro encontrado.</td></tr>';
    return;
  }
  tbody.innerHTML = _allResumes.map((r) => `<tr>
    <td><code>${_esc(r.protocolo || '—')}</code></td>
    <td><strong>${_esc(r.nome)}</strong></td>
    <td>${_esc(_fmtCpf(r.cpf))}</td>
    <td>${_esc(_jobLabel(r.vaga_id || r.vaga))}</td>
    <td><button type="button" class="btn btn-xs btn-outline" onclick="editCurriculo('${_esc(r.id)}')">Editar</button></td>
  </tr>`).join('');
}

function renderJobList() {
  const tbody = document.getElementById('job_list_body');
  if (!tbody) return;
  if (!_allJobs.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Nenhum registro encontrado.</td></tr>';
    return;
  }
  tbody.innerHTML = _allJobs.map((j) => {
    const insalubre = String(j.trabalho_insalubre || 'NÃO').toUpperCase() === 'SIM' ? 'SIM' : 'NÃO';
    const insBadge = insalubre === 'SIM' ? 'badge-warning' : 'badge-muted';
    return `<tr>
    <td><code>${_esc(j.protocolo || '—')}</code></td>
    <td><strong>${_esc(j.cargo)}</strong></td>
    <td>${_esc(j.cbo_cod || j.cbo_codigo || '—')}</td>
    <td>${_esc(j.cbo_descricao || '—')}</td>
    <td>${_esc(j.departamento || '—')}</td>
    <td><span class="badge ${insBadge}">${insalubre}</span></td>
    <td><button type="button" class="btn btn-xs btn-outline" onclick="editCargo('${_esc(j.id)}')">Editar</button></td>
  </tr>`;
  }).join('');
}

function renderEmployeeList() {
  const tbody = document.getElementById('employee_list_body');
  if (!tbody) return;
  const raw = window._allEmployees || [];
  const list = _sortRhEmpByName(raw);
  // #region agent log
  try {
    const sample = list.slice(0, 5).map((e) => _rhEmpSortKey(e));
    const rawSample = raw.slice(0, 5).map((e) => _rhEmpSortKey(e));
    const sorted = sample.length <= 1 || sample.every((n, i, arr) => i === 0 || arr[i - 1].localeCompare(n, 'pt-BR', { sensitivity: 'base' }) <= 0);
    const dbg = { count: list.length, sorted, rawFirst: rawSample, sortedFirst: sample, scriptV: '97c411rh2' };
    window.__rhSortDbg = dbg;
    if (tbody) {
      tbody.dataset.rhSort = sorted ? '1' : '0';
      tbody.dataset.rhSortVer = '97c411rh2';
    }
    const logBody = JSON.stringify({ sessionId: '97c411', location: 'rh-manager.js:renderEmployeeList', message: 'employee list sort', data: dbg, timestamp: Date.now(), hypothesisId: 'H1-rh-sort', runId: 'post-fix' });
    fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '97c411' }, body: logBody }).catch(() => {});
  } catch (_) {}
  // #endregion
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Nenhum registro encontrado.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map((e) => {
    const adv = parseInt(e.advertencias || e.advertencia || 0, 10) || 0;
    const sus = parseInt(e.suspensoes || e.suspensao || 0, 10) || 0;
    const medidas = `${adv} adv. / ${sus} susp.`;
    return `<tr>
      <td><strong>${_esc(e.nome)}</strong><div style="font-size:12px;color:var(--color-text-muted);">${_esc(_fmtCpf(e.cpf))}</div></td>
      <td>${_esc(_jobLabel(e.cargo_id || e.cargo))}</td>
      <td>${_esc(e.departamento || '—')}</td>
      <td>${_fmtDate(e.data_admissao)}</td>
      <td>${_esc(medidas)}</td>
      <td><button type="button" class="btn btn-xs btn-outline" onclick="editFuncionario('${_esc(e.id)}')">Editar</button></td>
    </tr>`;
  }).join('');
}

function _onEmpCargoChange() {
  const jobId = _val('emp_cargo');
  const job = _allJobs.find((j) => String(j.id) === String(jobId));
  if (!job) return;
  _set('emp_cbo_cod', job.cbo_cod || job.cbo_codigo || '');
  _set('emp_cbo_descricao', job.cbo_descricao || '');
  if (!_val('emp_departamento')) _set('emp_departamento', job.departamento || '');
}

/* ══ RELOAD ══ */
async function reloadAllData(opts = {}) {
  const silent = !!opts.silent;
  if (!silent) showLoading('Carregando dados de RH...');
  try {
    await _ensureRhDatabaseReady();
    const [companies, resumes, jobs, employees] = await Promise.all([
      DB.getRhCompanies().catch(() => []),
      DB.getRhResumes().catch(() => []),
      DB.getRhJobs().catch(() => []),
      DB.getRhEmployees().catch(() => []),
    ]);
    _allCompanies = companies || [];
    _allResumes = resumes || [];
    _allJobs = jobs || [];
    window._allEmployees = _sortRhEmpByName(employees || []);
    window._allCompanies = _allCompanies;
    window._allResumes = _allResumes;
    window._allJobs = _allJobs;

    _fillJobSelects();
    _fillCompanySelect();
    renderCompanyList();
    renderResumeList();
    renderJobList();
    renderEmployeeList();

    if (typeof renderKanban === 'function') renderKanban();
    if (typeof reloadRhOpsData === 'function') await reloadRhOpsData().catch((e) => {
      console.warn('[RH] reloadRhOpsData:', e);
    });
    if (typeof renderRhFeedbackList === 'function') renderRhFeedbackList();
  } catch (e) {
    console.error('[RH] reloadAllData:', e);
    if (!silent) showToast('Erro ao carregar dados de RH.', 'error');
  } finally {
    if (!silent) hideLoading();
  }
}

/* ══ EMPRESA ══ */
function openEmpresaModal() {
  const form = document.getElementById('form-empresa');
  if (form) form.reset();
  openModalRH('empresaModal');
}

async function buscarCnpj() {
  const cnpj = _digits(_val('comp_cnpj'));
  if (cnpj.length !== 14) {
    showToast('Informe um CNPJ válido (14 dígitos).', 'warning');
    return;
  }
  showLoading('Consultando CNPJ...');
  try {
    const dup = _allCompanies.find((c) => _digits(c.cnpj) === cnpj);
    if (dup) {
      showToast('Esta empresa já está cadastrada.', 'warning');
      _set('comp_razao_social', dup.razao_social);
      return;
    }
    const res = await FonteData.lookupCnpj(cnpj);
    if (!res.ok) {
      showToast(res.error || 'Não foi possível consultar o CNPJ.', 'error');
      return;
    }
    _set('comp_razao_social', res.partner?.razao_social || '');
    showToast('Dados do CNPJ carregados.', 'success');
  } catch (e) {
    console.error('[RH] buscarCnpj:', e);
    showToast('Falha na consulta do CNPJ.', 'error');
  } finally {
    hideLoading();
  }
}

async function salvarEmpresa(event) {
  if (event) event.preventDefault();
  const cnpj = _digits(_val('comp_cnpj'));
  const razao = _val('comp_razao_social').trim();
  if (cnpj.length !== 14 || !razao) {
    showToast('Preencha CNPJ e razão social.', 'warning');
    return;
  }
  if (_allCompanies.some((c) => _digits(c.cnpj) === cnpj)) {
    showToast('CNPJ já cadastrado.', 'warning');
    return;
  }
  showLoading('Salvando empresa...');
  try {
    await DB.saveRhCompany({ cnpj, razao_social: razao });
    closeModalRH('empresaModal');
    await reloadAllData();
    showToast('Empresa salva com sucesso!', 'success');
  } catch (e) {
    console.error('[RH] salvarEmpresa:', e);
    showToast('Erro ao salvar empresa.', 'error');
  } finally {
    hideLoading();
  }
}

/* ══ CURRÍCULO ══ */
function openCurriculoModal(row) {
  const form = document.getElementById('form-curriculo');
  if (form) form.reset();
  _editingCvId = null;
  _fillJobSelects();
  gerarProtocoloCurriculo();

  if (row) {
    _editingCvId = row.id;
    _set('cv_protocolo', row.protocolo || '');
    _set('cv_cpf', _fmtCpf(row.cpf));
    _set('cv_nome', row.nome || '');
    _set('cv_data_entrevista', (row.data_entrevista || '').slice(0, 10));
    _set('cv_contato', row.contato || '');
    _set('cv_email', row.email || '');
    _set('cv_contato_terceiros', row.contato_terceiros || '');
    _set('cv_nome_terceiros', row.nome_terceiros || '');
    _set('cv_unidade', row.unidade || '');
    _set('cv_vaga', row.vaga_id || row.vaga || '');
    _loadRhFonteFieldsFromRow('cv', row);
  } else {
    _loadRhFonteFieldsFromRow('cv', null);
  }

  openModalRH('curriculoModal');
}

function editCurriculo(id) {
  const row = _allResumes.find((r) => String(r.id) === String(id));
  if (row) openCurriculoModal(row);
}

async function buscarCpfCurriculo() {
  await _consultarFonteDataRh('cv');
}

async function salvarCurriculo(event) {
  if (event) event.preventDefault();
  const cpf = _digits(_val('cv_cpf'));
  const nome = _val('cv_nome').trim();
  const vagaId = _val('cv_vaga');
  if (cpf.length !== 11 || !nome || !vagaId) {
    showToast('Preencha CPF, nome e vaga.', 'warning');
    return;
  }

  const existing = _allResumes.find((r) => _digits(r.cpf) === cpf && String(r.id) !== String(_editingCvId || ''));
  if (existing) {
    showToast('Já existe currículo para este CPF.', 'warning');
    return;
  }

  const row = {
    id: _editingCvId || undefined,
    protocolo: _val('cv_protocolo') || gerarProtocoloCurriculo(),
    cpf,
    nome,
    data_entrevista: _val('cv_data_entrevista') || null,
    contato: _val('cv_contato').trim(),
    email: _val('cv_email').trim(),
    contato_terceiros: _val('cv_contato_terceiros').trim(),
    nome_terceiros: _val('cv_nome_terceiros').trim(),
    unidade: _val('cv_unidade').trim(),
    vaga_id: vagaId,
    data_nascimento: _val('cv_data_nascimento') || null,
    pis: _digits(_val('cv_pis')),
    situacao_cadastral: _val('cv_situacao_rf').trim(),
    fontedata_meta: _fonteMetaForSave('cv'),
    stage: _editingCvId
      ? (_allResumes.find((r) => String(r.id) === String(_editingCvId))?.stage || 'triagem')
      : 'triagem',
  };

  showLoading('Salvando currículo...');
  try {
    await DB.saveRhResume(row);
    closeModalRH('curriculoModal');
    await reloadAllData();
    showToast('Currículo salvo com sucesso!', 'success');
  } catch (e) {
    console.error('[RH] salvarCurriculo:', e);
    showToast('Erro ao salvar currículo.', 'error');
  } finally {
    hideLoading();
  }
}

/* ══ CARGO ══ */
function openCargoModal(row) {
  const form = document.getElementById('form-cargo');
  if (form) form.reset();
  _editingJobId = null;
  _set('jg_id', '');
  _set('jg_trabalho_insalubre', 'NÃO');
  gerarProtocoloCargo();

  if (row) {
    _editingJobId = row.id;
    _set('jg_id', row.id);
    _set('jg_protocolo', row.protocolo || '');
    _set('jg_cargo', row.cargo || '');
    _set('jg_cbo_cod', row.cbo_cod || row.cbo_codigo || '');
    _set('jg_cbo_descricao', row.cbo_descricao || '');
    _set('jg_hierarquia', row.hierarquia || '');
    _set('jg_departamento', row.departamento || '');
    _set('jg_trabalho_insalubre', String(row.trabalho_insalubre || 'NÃO').toUpperCase() === 'SIM' ? 'SIM' : 'NÃO');
    const search = document.getElementById('jg_cbo_search');
    if (search && row.cbo_cod) {
      search.value = `${row.cbo_cod || row.cbo_codigo} — ${row.cbo_descricao || ''}`;
    }
  }

  openModalRH('cargoModal');
}

function editCargo(id) {
  const row = _allJobs.find((j) => String(j.id) === String(id));
  if (row) openCargoModal(row);
}

async function salvarCargo(event) {
  if (event) event.preventDefault();
  const cargo = _val('jg_cargo').trim();
  const cbo = _val('jg_cbo_cod').trim();
  const desc = _val('jg_cbo_descricao').trim();
  const dept = _val('jg_departamento').trim();
  if (!cargo || !cbo || !desc || !dept) {
    showToast('Preencha cargo, CBO e departamento.', 'warning');
    return;
  }

  const row = {
    id: _editingJobId || _val('jg_id') || undefined,
    protocolo: _val('jg_protocolo') || gerarProtocoloCargo(),
    cargo,
    cbo_cod: cbo,
    cbo_descricao: desc,
    hierarquia: _val('jg_hierarquia').trim(),
    departamento: dept,
    trabalho_insalubre: _val('jg_trabalho_insalubre') === 'SIM' ? 'SIM' : 'NÃO',
  };

  showLoading('Salvando cargo...');
  try {
    await DB.saveRhJob(row);
    closeModalRH('cargoModal');
    await reloadAllData();
    showToast('Cargo salvo com sucesso!', 'success');
  } catch (e) {
    console.error('[RH] salvarCargo:', e);
    showToast('Erro ao salvar cargo.', 'error');
  } finally {
    hideLoading();
  }
}

/* ══ FUNCIONÁRIO ══ */
function limparFormFuncionario() {
  const form = document.getElementById('form-funcionario');
  if (form) form.reset();
  _set('emp_id', '');
  _set('emp_advertencia', '0');
  _set('emp_suspensao', '0');
  _fillPermissoesForm({});
  const audit = document.getElementById('emp_audit_section');
  if (audit) audit.style.display = 'none';
  const hist = document.getElementById('history_log');
  if (hist) hist.innerHTML = '';
  document.getElementById('funcModalTitle').textContent = 'Novo Funcionário';
  _loadRhFonteFieldsFromRow('emp', null);
}

async function openFuncionarioModal(row) {
  limparFormFuncionario();
  _fillJobSelects();
  _fillCompanySelect();
  await _fillLeadersSelects();

  if (row) {
    _set('emp_id', row.id);
    document.getElementById('funcModalTitle').textContent = 'Editar Funcionário';
    _set('emp_cpf', _fmtCpf(row.cpf));
    _set('emp_nome', row.nome || '');
    _set('emp_cnpj_registro', row.cnpj_registro || row.cnpj || '');
    _set('emp_matricula', row.matricula || '');
    _set('emp_contato', row.contato || '');
    _set('emp_email_pessoal', row.email || row.email_pessoal || '');
    _set('emp_protocolo_entrevista', row.protocolo_entrevista || '');
    _set('emp_data_admissao', (row.data_admissao || '').slice(0, 10));
    _set('emp_departamento', row.departamento || '');
    _set('emp_chave_pix', row.chave_pix || '');
    _set('emp_cargo', row.cargo_id || row.cargo || '');
    _set('emp_cbo_cod', row.cbo_cod || '');
    _set('emp_cbo_descricao', row.cbo_descricao || '');

    const setLeader = (idEl, valId, valName) => {
      if (valId) { _set(idEl, valId); return; }
      if (valName) {
        const el = document.getElementById(idEl);
        if (el) {
          const opt = Array.from(el.options).find(o => o.dataset.name === valName);
          if (opt) el.value = opt.value;
        }
      }
    };
    setLeader('emp_supervisor', row.supervisor_id, row.supervisor);
    setLeader('emp_responsavel_dpto', row.responsavel_dpto_id, row.responsavel_dpto);
    setLeader('emp_diretor_dpto', row.diretor_dpto_id, row.diretor_dpto);

    _set('emp_cargo_confianca', row.cargo_confianca || 'NÃO');
    _set('emp_qualidade_monitoria', row.qualidade_monitoria || 'BAIXA');
    _set('emp_advertencia', String(row.advertencias || row.advertencia || 0));
    _set('emp_suspensao', String(row.suspensoes || row.suspensao || 0));
    _set('emp_emergencia_nome_1', row.emergencia_nome_1 || '');
    _set('emp_emergencia_contato_1', row.emergencia_contato_1 || '');
    _set('emp_emergencia_nome_2', row.emergencia_nome_2 || '');
    _set('emp_emergencia_contato_2', row.emergencia_contato_2 || '');
    _set('emp_role', row.system_role || row.role || 'vendedor');
    _fillPermissoesForm(row.permissions || {});
    _loadRhFonteFieldsFromRow('emp', row);

    const audit = document.getElementById('emp_audit_section');
    if (audit) audit.style.display = '';
    const hist = document.getElementById('history_log');
    if (hist) {
      const log = Array.isArray(row.audit_log) ? row.audit_log : [];
      hist.innerHTML = log.length
        ? log.map((l) => `<div style="font-size:12px;margin-bottom:6px;"><strong>${_esc(l.data || '')}</strong> — ${_esc(l.nota || l.note || '')}</div>`).join('')
        : '<span class="text-muted">Nenhuma alteração registrada.</span>';
    }
  }

  openModalRH('funcionarioModal');
}

function editFuncionario(id) {
  const row = (window._allEmployees || []).find((e) => String(e.id) === String(id));
  if (row) openFuncionarioModal(row);
}

async function openFuncionarioFromRef(refId) {
  if (!refId) return;
  const list = window._allEmployees || [];
  let row = list.find((e) => String(e.id) === String(refId) || String(e.user_id) === String(refId));
  if (row) {
    openFuncionarioModal(row);
    return;
  }
  const u = await DB.getUser(refId, true).catch(() => null);
  if (!u) {
    showToast('Funcionário não encontrado no cadastro RH.', 'warning');
    return;
  }
  const cpf = _digits(u.cpf);
  row = list.find((e) => (cpf && _digits(e.cpf) === cpf)
    || (u.email && String(e.email || e.email_pessoal || '').toLowerCase() === String(u.email).toLowerCase()));
  if (row) {
    openFuncionarioModal(row);
    return;
  }
  openFuncionarioModal({
    id: '',
    user_id: u.id,
    cpf: u.cpf || '',
    nome: u.name || '',
    contato: u.phone || u.phone1 || '',
    email: u.email || '',
    email_pessoal: u.email || '',
    matricula: u.matricula || '',
    departamento: u.department || '',
    system_role: u.role || 'vendedor',
    role: u.role || 'vendedor',
    permissions: u.permissions || {},
  });
}

async function buscarCpfFuncionario() {
  const cpf = _digits(_val('emp_cpf'));
  if (cpf.length !== 11) {
    showToast('Informe um CPF válido (11 dígitos).', 'warning');
    return;
  }

  const local = (window._allEmployees || []).find((e) => _digits(e.cpf) === cpf);
  if (local && !_val('emp_id')) {
    showToast('CPF já cadastrado como funcionário. Abrindo registro...', 'info');
    openFuncionarioModal(local);
    return;
  }

  const cv = _allResumes.find((r) => _digits(r.cpf) === cpf);
  if (cv) {
    if (!_val('emp_nome')) _set('emp_nome', cv.nome || '');
    if (!_val('emp_contato')) _set('emp_contato', cv.contato || '');
    if (!_val('emp_email_pessoal')) _set('emp_email_pessoal', cv.email || '');
    if (!_val('emp_protocolo_entrevista')) _set('emp_protocolo_entrevista', cv.protocolo || '');
    if (!_val('emp_cargo') && cv.vaga_id) _set('emp_cargo', cv.vaga_id);
    if (!_val('emp_data_nascimento') && cv.data_nascimento) {
      _set('emp_data_nascimento', _fonteDateToInput(cv.data_nascimento));
    }
    if (!_val('emp_pis') && cv.pis) _set('emp_pis', _fmtPis(cv.pis));
    _onEmpCargoChange();
  }

  await _consultarFonteDataRh('emp');
}

async function buscarCnpjFuncionario() {
  const cnpj = _digits(_val('emp_cnpj_registro_input'));
  if (cnpj.length !== 14) {
    showToast('Informe um CNPJ válido.', 'warning');
    return;
  }
  const found = _allCompanies.find((c) => _digits(c.cnpj) === cnpj);
  if (found) {
    _set('emp_cnpj_registro', found.cnpj);
    showToast('Empresa vinculada.', 'success');
    return;
  }
  showLoading('Consultando CNPJ...');
  try {
    const res = await FonteData.lookupCnpj(cnpj);
    if (!res.ok) {
      showToast(res.error || 'CNPJ não encontrado.', 'error');
      return;
    }
    await DB.saveRhCompany({
      cnpj,
      razao_social: res.partner?.razao_social || 'Empresa',
    });
    await reloadAllData();
    _set('emp_cnpj_registro', cnpj);
    showToast('Empresa cadastrada e vinculada.', 'success');
  } catch (e) {
    console.error('[RH] buscarCnpjFuncionario:', e);
    showToast('Erro ao buscar CNPJ.', 'error');
  } finally {
    hideLoading();
  }
}

function onEmpRoleChange() {
  const role = document.getElementById('emp_role')?.value || 'vendedor';
  const checkboxes = document.querySelectorAll('input[type="checkbox"][id^="perm_can"]');
  
  // Limpar todas primeiro
  checkboxes.forEach(cb => cb.checked = false);

  const baseVendedor = [
    'perm_canProposta', 'perm_canClientes', 'perm_canRanking', 'perm_canLoja',
    'perm_canSimulacao', 'perm_canChamados', 'perm_canLeadsManager', 
    'perm_canTreinamentos', 'perm_canPainelSonhos', 'perm_canMeuExtrato'
  ];

  const presets = {
    'vendedor': baseVendedor,
    'backoffice': [...baseVendedor, 'perm_canTimEsteira', 'perm_canContestacao'],
    'supervisor': [...baseVendedor, 'perm_canSupervisorPanel', 'perm_canRHMonitoria'],
    'rh': [
      'perm_canRHMonitoria', 'perm_canRHGestao', 'perm_canRHFolha', 
      'perm_canCadFunc', 'perm_canTreinamentos', 'perm_canChamados', 'perm_canMeuExtrato'
    ],
    'financeiro': [
      'perm_canSaques', 'perm_canFiscalParceiro', 'perm_canFornecedorFinanceiro', 
      'perm_canContaCorrente', 'perm_canChamados', 'perm_canMeuExtrato'
    ]
  };

  let toCheck = [];
  if (role === 'diretoria' || role === 'desenvolvedor') {
    // Marca tudo
    checkboxes.forEach(cb => cb.checked = true);
    return;
  } else if (role === 'gerente') {
    // Gerente tem quase tudo (Supervisor + RH + Financeiro + Marketplace)
    toCheck = [
      ...presets['supervisor'], ...presets['rh'], ...presets['financeiro'], 'perm_canMarketplaceBlu'
    ];
  } else {
    toCheck = presets[role] || [];
  }

  toCheck.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = true;
  });
}

async function salvarFuncionario(event) {
  if (event) event.preventDefault();

  const id = _val('emp_id');
  const cpf = _digits(_val('emp_cpf'));
  const nome = _val('emp_nome').trim();
  const cnpjReg = _digits(_val('emp_cnpj_registro'));
  const cargoId = _val('emp_cargo');
  const email = _val('emp_email_pessoal').trim();
  const password = _val('emp_password');
  const role = _val('emp_role') || 'vendedor';

  if (cpf.length !== 11 || !nome || !cnpjReg || !cargoId) {
    showToast('Preencha CPF, nome, empresa e cargo.', 'warning');
    return;
  }

  const dup = (window._allEmployees || []).find((e) => _digits(e.cpf) === cpf && String(e.id) !== String(id));
  if (dup) {
    showToast('CPF já cadastrado para outro funcionário.', 'warning');
    return;
  }

  const job = _allJobs.find((j) => String(j.id) === String(cargoId));
  const permissions = _collectPermissoesFromForm();
  const auditNote = _val('emp_audit_note').trim();

  const elSup = document.getElementById('emp_supervisor');
  const elResp = document.getElementById('emp_responsavel_dpto');
  const elDir = document.getElementById('emp_diretor_dpto');

  const row = {
    id: id || undefined,
    cpf,
    nome,
    cnpj_registro: cnpjReg,
    matricula: _val('emp_matricula').trim(),
    contato: _val('emp_contato').trim(),
    email,
    email_pessoal: email,
    protocolo_entrevista: _val('emp_protocolo_entrevista').trim(),
    data_admissao: _val('emp_data_admissao') || null,
    departamento: _val('emp_departamento').trim(),
    chave_pix: _val('emp_chave_pix').trim(),
    cargo_id: cargoId,
    cargo: cargoId,
    cbo_cod: _val('emp_cbo_cod').trim() || job?.cbo_cod || '',
    cbo_descricao: _val('emp_cbo_descricao').trim() || job?.cbo_descricao || '',
    supervisor: elSup.options[elSup.selectedIndex]?.dataset?.name || '',
    supervisor_id: elSup.value || null,
    responsavel_dpto: elResp.options[elResp.selectedIndex]?.dataset?.name || '',
    responsavel_dpto_id: elResp.value || null,
    diretor_dpto: elDir.options[elDir.selectedIndex]?.dataset?.name || '',
    diretor_dpto_id: elDir.value || null,
    cargo_confianca: _val('emp_cargo_confianca'),
    qualidade_monitoria: _val('emp_qualidade_monitoria'),
    advertencias: parseInt(_val('emp_advertencia'), 10) || 0,
    suspensoes: parseInt(_val('emp_suspensao'), 10) || 0,
    emergencia_nome_1: _val('emp_emergencia_nome_1').trim(),
    emergencia_contato_1: _val('emp_emergencia_contato_1').trim(),
    emergencia_nome_2: _val('emp_emergencia_nome_2').trim(),
    emergencia_contato_2: _val('emp_emergencia_contato_2').trim(),
    data_nascimento: _val('emp_data_nascimento') || null,
    pis: _digits(_val('emp_pis')),
    situacao_cadastral: _val('emp_situacao_rf').trim(),
    fontedata_meta: _fonteMetaForSave('emp'),
    system_role: role,
    role,
    permissions,
    demitido: false,
    status: 'ativo',
  };

  if (id && auditNote) {
    const prev = (window._allEmployees || []).find((e) => String(e.id) === String(id));
    const log = Array.isArray(prev?.audit_log) ? [...prev.audit_log] : [];
    const author = typeof Auth !== 'undefined' ? Auth.getSession()?.name : 'RH';
    log.unshift({
      data: new Date().toLocaleString('pt-BR'),
      nota: auditNote,
      autor: author || 'RH',
    });
    row.audit_log = log.slice(0, 50);
  }

  showLoading('Salvando funcionário...');
  try {
    if (password || email) {
      row.user_id = await _syncRhUserFromEmployee(row, password || null);
    }
    await DB.saveRhEmployee(row);
    closeModalRH('funcionarioModal');
    await reloadAllData();
    showToast(id ? 'Funcionário atualizado!' : 'Funcionário cadastrado!', 'success');
  } catch (e) {
    console.error('[RH] salvarFuncionario:', e);
    showToast(DB.formatUserDbError ? DB.formatUserDbError(e) : (e.message || 'Erro ao salvar funcionário.'), 'error');
  } finally {
    hideLoading();
  }
}

/* ══ INIT ══ */
function _wireRhEvents() {
  const cargoSel = document.getElementById('emp_cargo');
  if (cargoSel && !cargoSel.dataset.rhWired) {
    cargoSel.dataset.rhWired = '1';
    cargoSel.addEventListener('change', _onEmpCargoChange);
  }
}

function _showRhApp() {
  const loader = document.getElementById('globalLoader');
  const app = document.getElementById('appLayout');
  if (loader) loader.style.display = 'none';
  if (app) app.style.display = '';
}

async function _initRhManager() {
  try {
    await Auth.requireLogin();
  } catch (e) {
    if (e?.message === 'AUTH_REDIRECT') return;
    throw e;
  }

  await DB.init();
  const session = Auth.getSession();
  const role = String(session?.role || '').toLowerCase();

  if (!session || !_RH_ALLOWED_ROLES.includes(role)) {
    _showRhApp();
    showToast('Acesso restrito ao módulo de RH.', 'error');
    setTimeout(() => { navigateBack(); }, 2000);
    return;
  }

  currentUser = await Auth.getCurrentUser().catch(() => session);
  window.currentUser = currentUser;
  _applyRhChrome(role);
  _renderRhSidebarUser(currentUser);
  _wireRhEvents();

  _showRhApp();

  const params = new URLSearchParams(window.location.search);
  const tabParam = params.get('tab') || (window.location.hash || '').replace(/^#/, '');
  const editParam = params.get('edit');

  const landSonhos = typeof PainelSonhos !== 'undefined' && PainelSonhos.eligible(role);
  const folhaDeepLink = tabParam === 'folha';
  const initialTab = folhaDeepLink ? 'relatorios' : (tabParam || _rhDefaultTab(role));
  switchTab(initialTab);
  if (folhaDeepLink && typeof switchRhRelatorio === 'function') {
    switchRhRelatorio('folha');
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = _RH_TAB_TITLES.folha || 'Gerar Folha de Pagamento';
  }

  reloadAllData({ silent: true }).then(async () => {
    if (editParam) {
      switchTab('funcionario');
      await openFuncionarioFromRef(editParam);
    }
  }).catch((e) => {
    console.warn('[RH] reloadAllData (boot):', e);
  });
}

/* ══ EXPORT WINDOW ══ */
window.currentUser = currentUser;
window._allCompanies = _allCompanies;
window._allResumes = _allResumes;
window._allJobs = _allJobs;

window._esc = _esc;
window._digits = _digits;
window._ensureRhDatabaseReady = _ensureRhDatabaseReady;
window._applyRhChrome = _applyRhChrome;

window.switchTab = switchTab;
window.openRhRankingTab = openRhRankingTab;
window.openRhFolhaTab = openRhFolhaTab;
window.reloadAllData = reloadAllData;
window.navigateBack = navigateBack;
window.closeModalRH = closeModalRH;
window.openModalRH = openModalRH;
window.openJuridicoChamados = openJuridicoChamados;
window.openJuridicoContestacao = openJuridicoContestacao;

window.openEmpresaModal = openEmpresaModal;
window.salvarEmpresa = salvarEmpresa;
window.buscarCnpj = buscarCnpj;

window.openCurriculoModal = openCurriculoModal;
window.salvarCurriculo = salvarCurriculo;
window.buscarCpfCurriculo = buscarCpfCurriculo;
window.gerarProtocoloCurriculo = gerarProtocoloCurriculo;
window.editCurriculo = editCurriculo;

window.openCargoModal = openCargoModal;
window.salvarCargo = salvarCargo;
window.editCargo = editCargo;
window.gerarProtocoloCargo = gerarProtocoloCargo;

window.openFuncionarioModal = openFuncionarioModal;
window.openFuncionarioFromRef = openFuncionarioFromRef;
window.salvarFuncionario = salvarFuncionario;
window.limparFormFuncionario = limparFormFuncionario;
window.buscarCpfFuncionario = buscarCpfFuncionario;
window.buscarCnpjFuncionario = buscarCnpjFuncionario;
window.editFuncionario = editFuncionario;
window.onEmpRoleChange = onEmpRoleChange;

document.addEventListener('DOMContentLoaded', () => {
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.has('_r')) {
      u.searchParams.delete('_r');
      const qs = u.searchParams.toString();
      history.replaceState(null, '', u.pathname + (qs ? `?${qs}` : '') + u.hash);
    }
  } catch (_) { /* noop */ }

  const BOOT_MS = 30000;
  const boot = _initRhManager();
  const timer = setTimeout(() => {
    console.error('[RH] init: timeout após', BOOT_MS, 'ms');
    _showRhApp();
    if (typeof hideLoading === 'function') hideLoading();
    showToast('Carregamento demorou demais. Verifique a conexão e recarregue (Ctrl+F5).', 'error');
  }, BOOT_MS);

  boot.catch((e) => {
    console.error('[RH] init:', e);
    showToast('Erro ao iniciar o módulo de RH.', 'error');
    _showRhApp();
  }).finally(() => {
    clearTimeout(timer);
    if (typeof hideLoading === 'function') hideLoading();
  });
});

window.addEventListener('pageshow', (ev) => {
  if (!ev.persisted) return;
  reloadAllData({ silent: true }).catch((e) => console.warn('[RH] pageshow reload:', e));
});
