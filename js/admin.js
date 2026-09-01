/* =============================================
   SOU + BLU – Admin/Master Dashboard v3
   Master: vê tudo (todos admins, equipes, saques)
   Admin:  vê só sua equipe
   ============================================= */

const _DB_LOAD_ERROR =
  'Scripts da camada de dados não carregaram (ex.: js/db.js). Pressione F12 → Rede e Console: verifique 404 ou erros em js/db.js e js/config.js e atualize com Ctrl+F5. Abrir arquivo direto no disco exige servidor local ou publicação (ex.: soumaisblu.com.br).';

function _isMobileBoot() {
  try {
    if (typeof window.isSoubluMobile === 'function') return !!window.isSoubluMobile();
    return !!(window.matchMedia && window.matchMedia('(max-width: 900px)').matches);
  } catch (_) {
    return (window.innerWidth || 0) <= 900;
  }
}

function _peekDB() {
  if (window.DB && typeof window.DB.init === 'function') return window.DB;
  if (typeof DB !== 'undefined' && DB && typeof DB.init === 'function') {
    window.DB = DB;
    return DB;
  }
  return null;
}

async function _requireDB(maxWaitMs = 9000) {
  const deadline = Date.now() + maxWaitMs;
  let db = _peekDB();
  if (db) return db;
  while (Date.now() < deadline) {
    db = _peekDB();
    if (db) return db;
    await new Promise(r => setTimeout(r, 50));
  }
  if (typeof window._SOUBLU_injectDbIfMissing === 'function') {
    try { await window._SOUBLU_injectDbIfMissing(); } catch (e) { /* noop */ }
  }
  const d2 = Date.now() + 6000;
  while (Date.now() < d2) {
    db = _peekDB();
    if (db) return db;
    await new Promise(r => setTimeout(r, 50));
  }
  return null;
}

/** Carrega script sob demanda — evita parse/exec no boot e reduz pressão no DOM principal. */
const _scriptInflight = new Map();
function ensureScript(src) {
  const url = String(src || '');
  if (!url) return Promise.resolve();
  const abs = url.startsWith('http') || url.startsWith('/')
    ? url
    : (url.startsWith('../') ? url : '../' + url.replace(/^\//, ''));
  // Só reaproveita a mesma URL completa (?v=…). Não casar só pelo nome do arquivo.
  const existing = document.querySelector(`script[data-ensure-src="${abs}"]`)
    || document.querySelector(`script[src="${abs}"]`);
  if (existing) {
    if (existing.dataset.loaded === '1' || existing.getAttribute('data-loaded') === '1') return Promise.resolve();
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar ' + abs)), { once: true });
    });
  }
  if (_scriptInflight.has(abs)) return _scriptInflight.get(abs);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = abs.includes('?') ? abs : abs + '?v=rank-export1';
    s.defer = true;
    s.dataset.ensureSrc = abs;
    s.onload = () => { s.dataset.loaded = '1'; resolve(); };
    s.onerror = () => reject(new Error('Falha ao carregar ' + abs));
    document.head.appendChild(s);
  });
  _scriptInflight.set(abs, p);
  return p.finally(() => { /* keep resolved promise cached via dataset */ });
}
window.ensureScript = ensureScript;

async function ensureXlsx() {
  if (typeof XLSX !== 'undefined') return;
  await ensureScript('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js');
  if (typeof XLSX === 'undefined') throw new Error('SheetJS não carregou.');
}
window.ensureXlsx = ensureXlsx;

/** Scripts de seção — só entram no DOM/rede quando a nav precisa. */
async function ensureSectionScripts(sec) {
  const map = {
    secPartners: ['../js/partners.js', '../js/fontedata.js'],
    secPartnerOps: ['../js/partners.js', '../js/partner-ops.js', '../js/fontedata.js'],
    secStore: ['../js/store-shop.js'],
    secProducts: ['../js/store-shop.js'],
    secOrders: ['../js/store-shop.js'],
    secMeetings: ['../js/meetings.js?v=meet-all1'],
    secSimulacao: ['../js/simulacao.js?v=tabelas2'],
    secTimIndicacao: ['../js/tim.js'],
    secTimEsteira: ['../js/tim.js'],
    secContestacao: ['../js/contestacao.js'],
    secFiscalParceiro: ['../js/fiscal-parceiro.js'],
    secTrainings: ['../js/trainings.js?v=cadastro3'],
    secTrainingsManage: ['../js/trainings.js?v=cadastro3'],
    secTrainingsRh: ['../js/trainings.js?v=cadastro3'],
    secFornecedorFinanceiro: ['../js/fornecedor-financeiro.js'],
    secContaCorrente: ['../js/conta-corrente.js?v=futuros-db1'],
    secContaCorrenteGestao: ['../js/conta-corrente.js?v=futuros-db1'],
    secWithdrawals: ['../js/withdrawal-flow.js'],
    secRanking: ['../js/sales-ranking.js?v=bill-paid2', '../js/br-holidays.js?v=rank-export1', '../js/attendance-penalty.js?v=rank-export1', '../js/vendor-tier-points.js?v=rank-export1'],
    secCreateProposal: ['../js/masterProposal.js', '../js/fontedata.js'],
    secPartnersForm: ['../js/fontedata.js'],
  };
  const list = map[sec] || [];
  for (const src of list) {
    await ensureScript(src);
  }
}
window.ensureSectionScripts = ensureSectionScripts;

let ADMIN_ID         = null;
let IS_MASTER        = false;
let IS_GERENTE       = false; // master restrito sem financeiro
let IS_SUPERVISOR    = false;
let IS_SUP_BACKOFFICE= false; // supervisor de backoffice
let IS_FINANCIAL     = false;
let IS_RH            = false;
let IS_BACKOFFICE    = false;
let IS_OPERACIONAL   = false;
let IS_VENDEDOR_ADM  = false; // vendedor que acessa admin por privilégio
let IS_PORTARIA      = false; // recepção / setor administrativo
let IS_DIRETORIA     = false;
let IS_JURIDICO      = false;
let IS_OUVIDORIA     = false;
let IS_FUNDA         = false; // Rodrigo Orlando / fundador
let IS_DESENVOLVEDOR = false; // líder técnico do departamento Desenvolvimento
let IS_PARCEIRO      = false; // parceiro externo — supervisor limitado + equipe própria
let PARTNER_ROOT_ID  = null; // id do usuário parceiro dono da equipe
let IS_PARTNER_STAFF = false; // vendedor/rh/financeiro/operacional sob um parceiro
let CAN_EMPLOYEES_PANEL = false; // master, dev, RH, financeiro (+ sup. backoffice)
/** Master edita equipe de um parceiro específico (cadastro via Parceiros). */
let _empPartnerRootOverride = null;

/** Copia flags do financeiro-boot (window.*) para as variáveis usadas por renderWithdrawalsTable, saldo, etc. */
function syncFinanceiroRoleGlobals() {
  if (!window.SOUBLU_FINANCEIRO_PAGE) return;
  ADMIN_ID = window.ADMIN_ID ?? ADMIN_ID;
  IS_MASTER = !!window.IS_MASTER;
  IS_FUNDA = !!window.IS_FUNDA;
  IS_FINANCIAL = !!window.IS_FINANCIAL;
  IS_RH = !!window.IS_RH;
  IS_GERENTE = !!window.IS_GERENTE;
  IS_SUPERVISOR = !!window.IS_SUPERVISOR;
  IS_SUP_BACKOFFICE = !!window.IS_SUP_BACKOFFICE;
  IS_BACKOFFICE = !!window.IS_BACKOFFICE;
  IS_OPERACIONAL = !!window.IS_OPERACIONAL;
  IS_VENDEDOR_ADM = !!window.IS_VENDEDOR_ADM;
  IS_PORTARIA = !!window.IS_PORTARIA;
  IS_DIRETORIA = !!window.IS_DIRETORIA;
  IS_DESENVOLVEDOR = !!window.IS_DESENVOLVEDOR;
  IS_PARCEIRO = !!window.IS_PARCEIRO;
  PARTNER_ROOT_ID = window.PARTNER_ROOT_ID ?? null;
  IS_PARTNER_STAFF = !!window.IS_PARTNER_STAFF;
  CAN_EMPLOYEES_PANEL = !!window.CAN_EMPLOYEES_PANEL;
}
window.syncFinanceiroRoleGlobals = syncFinanceiroRoleGlobals;

function getEffectivePartnerRootId() {
  return _empPartnerRootOverride || PARTNER_ROOT_ID || null;
}

/** Funcionários SOU+BLU internos: cadastro completo só no módulo RH (não duplicar no master). */
function employeesManagedInRhHub() {
  if (PARTNER_ROOT_ID || getEffectivePartnerRootId()) return false;
  return IS_MASTER || IS_FUNDA || IS_RH || IS_FINANCIAL || IS_GERENTE
    || IS_DESENVOLVEDOR || IS_DIRETORIA || IS_SUP_BACKOFFICE;
}

/** Equipe SOU+BLU (não rede de parceiros). */
function _isCompanyInternalUser() {
  return !PARTNER_ROOT_ID && !IS_PARCEIRO;
}

/** Dashboard / visão global da empresa — todos internos, exceto parceiros e supervisores comerciais. */
function _hasCompanyWideDashboard() {
  if (!_isCompanyInternalUser()) return false;
  return IS_MASTER || IS_FUNDA || IS_GERENTE || IS_FINANCIAL || IS_RH || IS_DIRETORIA
    || IS_DESENVOLVEDOR || IS_SUP_BACKOFFICE || IS_BACKOFFICE
    || IS_OPERACIONAL || IS_VENDEDOR_ADM || IS_OUVIDORIA;
}

/** Supervisor comercial (não backoffice) — escopo da própria equipe. */
function _isCommercialSupervisor() {
  return IS_SUPERVISOR && !IS_SUP_BACKOFFICE && !PARTNER_ROOT_ID;
}

/** Rede parceira (gestor ou equipe) — nunca vê faturamento por equipe. */
function _isPartnerOrgUser() {
  if (IS_PARCEIRO) return true;
  if (PARTNER_ROOT_ID || getEffectivePartnerRootId()) return true;
  const r = String(typeof Auth !== 'undefined' && Auth.getSession ? Auth.getSession()?.role : '').toLowerCase();
  return r === 'parceiro';
}

/** Gráfico de faturamento: supervisores internos e cargos acima — nunca parceiros. */
function _canViewTeamBillingChart() {
  if (_isPartnerOrgUser()) return false;
  return IS_SUPERVISOR
    || IS_MASTER || IS_FUNDA || IS_GERENTE || IS_FINANCIAL || IS_RH
    || IS_DIRETORIA || IS_DESENVOLVEDOR;
}

/** Supervisores que representam a mesma equipe comercial (várias supervisoras, um time). */
const _SUPERVISOR_TEAM_MERGE_GROUPS = [
  {
    label: 'Ana Bela, Anabela & Viviane',
    shortLabel: 'ANA BELA / VIVIANE',
    nameKeys: ['ana bela', 'anabela', 'viviane'],
    standaloneKeys: ['ana'],
  },
];

function _normSupervisorNameKey(name) {
  return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function _supervisorMergeGroup(supName) {
  const n = _normSupervisorNameKey(supName);
  for (const g of _SUPERVISOR_TEAM_MERGE_GROUPS) {
    if (g.standaloneKeys?.some((k) => n === k)) return g;
    if (g.nameKeys.some((k) => n.includes(k))) return g;
  }
  return null;
}

function _supervisorMergeGroupLabel(supName) {
  return _supervisorMergeGroup(supName)?.label || null;
}

/** IDs das supervisoras que compartilham o mesmo time (inclui a logada). */
async function _resolveMergedSupervisorAdminIds(adminId, userName) {
  const group = _supervisorMergeGroup(userName);
  if (!group) return [adminId].filter(Boolean);
  if (!_allUsersCache?.length) {
    _allUsersCache = await DB.getAllUsers().catch(() => []);
  }
  const ids = new Set([adminId].filter(Boolean));
  (_allUsersCache || []).forEach((u) => {
    if (String(u?.role || '').toLowerCase() !== 'supervisor') return;
    if (_supervisorMergeGroup(u.name) === group) ids.add(u.id);
  });
  return [...ids];
}

/** Vendedores + supervisoras do time unificado (grupo mesclado). */
async function _getMergedTeamScopeIds() {
  const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
  const adminIds = await _resolveMergedSupervisorAdminIds(ADMIN_ID, session?.name);
  const parts = await Promise.all(adminIds.map((id) => DB.getTeamMemberIds(id).catch(() => [])));
  const ids = new Set([ADMIN_ID, window.USER_ADMIN_ID, ...adminIds].filter(Boolean));
  parts.flat().forEach((id) => ids.add(id));
  // #region agent log
  fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'sup-team-fix',hypothesisId:'H1-H3',location:'admin.js:merged-team-scope',message:'merged team scope ids',data:{adminIds,scopeSize:ids.size,userId:session?.id,userName:session?.name},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return [...ids];
}

async function _getMergedTeamMemberIds() {
  return _getMergedTeamScopeIds();
}

async function _getMergedTeamEmployees() {
  const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
  const adminIds = await _resolveMergedSupervisorAdminIds(ADMIN_ID, session?.name);
  const parts = await Promise.all(adminIds.map((id) => DB.getEmployeesByAdmin(id).catch(() => [])));
  const seen = new Set();
  const merged = [];
  parts.flat().forEach((e) => {
    if (e?.id && !seen.has(e.id)) {
      seen.add(e.id);
      merged.push(e);
    }
  });
  return merged;
}

window._isCommercialSupervisor = _isCommercialSupervisor;
window._canViewTeamBillingChart = _canViewTeamBillingChart;
window._resolveMergedSupervisorAdminIds = _resolveMergedSupervisorAdminIds;
window._getMergedTeamScopeIds = _getMergedTeamScopeIds;
window._getMergedTeamMemberIds = _getMergedTeamMemberIds;
window._getMergedTeamEmployees = _getMergedTeamEmployees;

/** RH grava objeto com todos false quando nenhuma caixa está marcada — não deve zerar perfil Admin/Master. */
function _effectiveAdminPerms(role, raw) {
  const p = raw && typeof raw === 'object' ? { ...raw } : {};
  const r = String(role || '').toLowerCase();
  const privileged = new Set([
    'master', 'fundador', 'gerente', 'gerencia', 'admin',
    'financeiro', 'financial', 'rh', 'diretoria', 'desenvolvedor',
  ]);
  if (!privileged.has(r)) return p;
  const keys = Object.keys(p);
  if (!keys.length) return {};
  if (keys.every((k) => p[k] === false)) return {};
  return p;
}

function goToRhFuncionarios(editId) {
  let href = typeof Auth !== 'undefined' && Auth.rhManagerPageHrefFresh
    ? Auth.rhManagerPageHrefFresh()
    : (typeof Auth !== 'undefined' && Auth.rhManagerPageHref
      ? Auth.rhManagerPageHref()
      : 'pages/rh-manager.html');
  href += `${href.includes('?') ? '&' : '?'}tab=funcionario`;
  if (editId) href += `&edit=${encodeURIComponent(editId)}`;
  window.location.href = href;
}
window.goToRhFuncionarios = goToRhFuncionarios;

function partnerCan(key) {
  if (!IS_PARCEIRO || typeof PartnerPerms === 'undefined') return false;
  return PartnerPerms.can(window._PARTNER_PERMS, key);
}

/** Papéis da equipe vinculada a um parceiro (não SOU+BLU interno). */
function isPartnerOrgStaffRole(role) {
  const r = String(role || '').toLowerCase();
  return ['vendedor', 'backoffice', 'operacional', 'sup_backoffice', 'rh', 'financeiro', 'financial', 'employee'].includes(r);
}

function partnerOrgCan(key) {
  if (!PARTNER_ROOT_ID) return false;
  if (typeof PartnerPerms === 'undefined') return false;
  const s = Auth.getSession();
  const r = String(s?.role || '').toLowerCase();
  if (IS_PARCEIRO) return PartnerPerms.can(window._PARTNER_PERMS, key);
  if (isPartnerOrgStaffRole(r)) return PartnerPerms.canForStaff(window._PARTNER_PERMS, r, key);
  return PartnerPerms.can(window._PARTNER_PERMS, key);
}
window.partnerOrgCan = partnerOrgCan;

/** Parceiro (gestor) ou equipe autorizada — cadastro de vendedores/backoffice do parceiro. */
function canManagePartnerTeam() {
  if (_empPartnerRootOverride && (IS_MASTER || IS_FUNDA || IS_GERENTE || IS_RH || IS_FINANCIAL)) return true;
  const root = PARTNER_ROOT_ID;
  if (!root) return false;
  if (IS_PARCEIRO) return true;
  const s = Auth.getSession();
  const r = String(s?.role || '').toLowerCase();
  if (r === 'sup_backoffice' && partnerOrgCan('cadastrar_funcionario')) return true;
  if ((r === 'operacional' || r === 'backoffice') && partnerOrgCan('cadastrar_funcionario')) return true;
  return false;
}

function _userBelongsToPartnerRoot(user, partnerRootId) {
  if (!user || !partnerRootId) return false;
  const root = String(partnerRootId);
  if (String(user.id) === root) return true;
  if (String(user.partner_root_id || '') === root) return true;
  if (String(user.admin_id || '') === root) return true;
  return false;
}

async function openPartnerTeamManage(partnerUserId) {
  if (!partnerUserId) return;
  if (!(IS_MASTER || IS_FUNDA || IS_GERENTE || IS_RH || IS_FINANCIAL || IS_PARCEIRO)) {
    showToast('Sem permissão para cadastrar equipe do parceiro.', 'error');
    return;
  }
  try {
    if (typeof ensureScript === 'function') await ensureScript('../js/partners.js');
  } catch (_) { /* PartnerPerms opcional no modal */ }

  _empPartnerRootOverride = String(partnerUserId);
  window._keepPartnerTeamOverride = true;
  const empSub = document.getElementById('empPageSubtitle');
  const prt = await DB.getPartnerByUserId(partnerUserId).catch(() => null);
  const u = await DB.getUser(partnerUserId).catch(() => null);
  if (empSub) {
    const nome = prt?.razao_social || u?.name || 'parceiro';
    empSub.textContent = `Equipe de ${nome} — vendedores, backoffice e operacional`;
  }

  // Garante a seção visível (menu Funcionários fica oculto p/ master/fundador no hub RH).
  document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
  document.getElementById('secEmployees')?.classList.add('active');
  const tb = document.getElementById('topbarTitle');
  if (tb) tb.textContent = 'Equipe do parceiro';

  await renderEmployeesTable();
  showToast('Equipe do parceiro carregada. Use Editar na lista ou + Adicionar.', 'info', 4500);
}
window.openPartnerTeamManage = openPartnerTeamManage;
window._userBelongsToPartnerRoot = _userBelongsToPartnerRoot;

function _applyPortariaNavExtras() {
  if (!IS_PORTARIA) return;
  if (window.BolaoCopa && typeof BolaoCopa.ensureDom === 'function') {
    try { BolaoCopa.ensureDom(); } catch (e) { console.warn('[admin] BolaoCopa.ensureDom', e); }
  }
  document.querySelectorAll(
    '.leads-manager-nav, #navMonitoriaAtendimento, [href*="leads-manager"], [href*="leads-employee"]'
  ).forEach((el) => {
    el.style.display = 'none';
  });
  document.querySelectorAll('.bolao-copa-nav, #navBolaoCopa').forEach((el) => {
    el.style.display = '';
  });
  const secBolao = document.getElementById('secBolaoCopa');
  if (secBolao) secBolao.style.display = '';
}

/** Aplica visibilidade do menu lateral (Gestão / Relatórios) conforme permissões calculadas no boot. */
function _wireLeadsManagerNav() {
  const href = typeof Auth !== 'undefined' && Auth.leadsManagerPageHref
    ? Auth.leadsManagerPageHref()
    : 'pages/leads-manager.html';
  document.querySelectorAll('.leads-manager-nav').forEach(el => {
    if (el.tagName === 'A') {
      el.href = href;
      return;
    }
    el.onclick = (e) => {
      e.preventDefault();
      window.location.href = href;
    };
  });
}

/** Rede SAK — única parceira autorizada a ver Clube de Benefícios. */
function _isSakPartnerNetwork() {
  const norm = (v) => String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const razao = norm(window.PARTNER_RAZAO_SOCIAL || '');
  if (razao.includes('SAK') && razao.includes('CADASTRAIS')) return true;
  const s = typeof Auth !== 'undefined' && Auth.getSession ? Auth.getSession() : null;
  const name = norm(s?.name || '');
  if (name.includes('SAK') && name.includes('CADASTRAIS')) return true;
  const email = String(s?.email || '').toLowerCase();
  if (email.includes('@sakpromotora.') || email.includes('@sakservicos.') || email.includes('@sak.')) return true;
  return false;
}
window._isSakPartnerNetwork = _isSakPartnerNetwork;

/** Clube no sidebar: interno SOU+BLU ok; parceiros só SAK. */
function _canShowClubeBeneficiosNav() {
  const s = typeof Auth !== 'undefined' && Auth.getSession ? Auth.getSession() : null;
  const role = String(s?.role || '').toLowerCase();
  if (['master', 'fundador', 'financeiro', 'financial', 'admin', 'portaria', 'rh'].includes(role) && !PARTNER_ROOT_ID) {
    return true;
  }
  if (PARTNER_ROOT_ID || role === 'parceiro') return _isSakPartnerNetwork();
  return true;
}

function _wireBeneficiosNav() {
  const session = typeof Auth !== 'undefined' && Auth.getSession ? Auth.getSession() : null;
  const canAdmin = typeof Auth !== 'undefined' && typeof Auth.canManageBeneficios === 'function'
    ? Auth.canManageBeneficios(session?.role)
    : !!(IS_MASTER || IS_FUNDA || IS_FINANCIAL);
  const canClube = _canShowClubeBeneficiosNav();
  const _absBenefHref = (filename) => {
    try {
      if (typeof Auth !== 'undefined' && Auth.pageHrefFresh) return Auth.pageHrefFresh(filename);
      if (typeof window.soubluPage === 'function') return window.soubluPage(filename);
      const name = String(filename || '').replace(/^pages\//, '');
      const inPages = /(^|\/)pages(\/|$)/i.test(String(window.location.pathname || '').replace(/\\/g, '/'));
      const rel = inPages ? name : `pages/${name}`;
      return new URL(rel, window.location.href).href;
    } catch (_) {
      return `/pages/${String(filename || '').replace(/^pages\//, '')}`;
    }
  };
  const clubeHref = _absBenefHref('clube-beneficios.html?v=' + Date.now());
  const adminHref = _absBenefHref('admin-beneficios.html');

  const wire = (el, href, target) => {
    if (!el || el.dataset.benefNavWired === '1') return;
    el.dataset.benefNavWired = '1';
    el.type = 'button';
    el.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof _navigateToHub === 'function') _navigateToHub(href);
      else window.location.replace(href);
    };
  };

  const clubeBtn = document.getElementById('navClubeBeneficios')
    || document.querySelector('.benefits-clube-nav');
  const adminBtn = document.getElementById('navGestaoBeneficios')
    || document.querySelector('.benefits-admin-nav');

  document.querySelectorAll('.benefits-clube-nav, #navClubeBeneficios').forEach((el) => {
    el.style.display = canClube ? 'flex' : 'none';
    if (!canClube) el.setAttribute('hidden', 'hidden');
    else el.removeAttribute('hidden');
  });
  // Reforço: qualquer link residual do Clube some para parceiro não-SAK
  if (!canClube) {
    document.querySelectorAll('a[href*="clube-beneficios"], button[data-section="secClubeBeneficios"]').forEach((el) => {
      el.style.display = 'none';
      el.setAttribute('hidden', 'hidden');
    });
  }
  if (clubeBtn && canClube) wire(clubeBtn, clubeHref, 'clube');
  if (adminBtn) {
    adminBtn.style.display = canAdmin ? 'flex' : 'none';
    if (canAdmin) wire(adminBtn, adminHref, 'gestao');
  }

}

function _applyAdminNavVisibility(cfg) {
  if (!cfg) return;
  if (window.SOUBLU_FINANCEIRO_PAGE) return;
  document.querySelectorAll('.master-only').forEach(el => {
    if (el.classList.contains('team-billing-dash-nav')) return;
    el.style.display = cfg.canMasterPanel ? '' : 'none';
  });
  const canBeneficiosAdmin = typeof Auth.canManageBeneficios === 'function'
    ? Auth.canManageBeneficios(Auth.getSession()?.role)
    : (IS_MASTER || IS_FUNDA || IS_FINANCIAL);
  document.querySelectorAll('.benefits-admin-nav').forEach(el => {
    el.style.display = canBeneficiosAdmin ? 'flex' : 'none';
  });
  if (typeof _wireBeneficiosNav === 'function') _wireBeneficiosNav();
  document.querySelectorAll('.partner-dash-nav').forEach(el => {
    el.style.display = (cfg.canMasterPanel || cfg.canPartnerDashboard || cfg.canTeamBillingChart) ? '' : 'none';
  });
  document.querySelectorAll('.team-billing-dash-nav').forEach(el => {
    el.style.display = (cfg.canMasterPanel || cfg.canPartnerDashboard || cfg.canTeamBillingChart) ? '' : 'none';
  });
  document.querySelectorAll('.financial-only').forEach(el => {
    el.style.display = cfg.canSaques ? '' : 'none';
  });
  document.querySelectorAll('.not-supervisor').forEach(el => {
    el.style.display = (IS_SUPERVISOR && !PARTNER_ROOT_ID) ? 'none' : '';
  });
  document.querySelectorAll('.partners-master-only').forEach(el => {
    el.style.display = 'none';
  });
  const showAdminEmployees = CAN_EMPLOYEES_PANEL;
  document.querySelectorAll('.employees-panel-only').forEach(el => {
    el.style.display = showAdminEmployees ? '' : 'none';
  });
  document.querySelectorAll('.sidebar-nav [data-section="secEmployees"]').forEach(el => {
    if (employeesManagedInRhHub()) el.style.display = 'none';
  });
  if (employeesManagedInRhHub()) {
    const secEmp = document.getElementById('secEmployees');
    if (secEmp) {
      secEmp.style.display = 'none';
      secEmp.classList.remove('active');
    }
  }
  document.querySelectorAll('.supervisor-panel-only').forEach(el => {
    el.style.display = cfg.canSupervisorPanel ? '' : 'none';
  });
  document.querySelectorAll('.meetings-nav').forEach(el => {
    el.style.display = (cfg._inPartnerOrg || cfg.canMeetings === false) ? 'none' : '';
  });
  document.querySelectorAll('.rh-financial-only').forEach(el => {
    el.style.display = (cfg.canCadFunc && !employeesManagedInRhHub()) ? '' : 'none';
  });
  document.querySelectorAll('.ranking-nav').forEach(el => {
    /* Ranking interno SOU+BLU — nunca na rede de parceiros. */
    el.style.display = cfg.canRanking ? '' : 'none';
  });
  const secRank = document.getElementById('secRanking');
  if (secRank) {
    const showRankSec = !!cfg.canRanking;
    secRank.style.display = showRankSec ? '' : 'none';
    if (!showRankSec) secRank.classList.remove('active');
  }
  const navProp = document.getElementById('navManageProposals');
  if (navProp) navProp.style.display = cfg.canProposta ? '' : 'none';
  document.querySelectorAll('.partner-ops-nav').forEach(el => {
    /* Gestão de Parceiros só no hub Financeiro — não no sidebar do Painel Master. */
    el.style.display = (window.SOUBLU_FINANCEIRO_PAGE && cfg.canPartnerOpsHub) ? '' : 'none';
  });
  const navSim = document.getElementById('navSimulacao');
  if (navSim) navSim.style.display = cfg.canSimulacao ? '' : 'none';
  const navCli = document.getElementById('navClients');
  if (navCli) navCli.style.display = cfg.canClientes ? '' : 'none';
  document.querySelectorAll('.store-shop-nav').forEach(el => {
    el.style.display = cfg.canLoja ? '' : 'none';
    if (cfg.canLoja && el.tagName === 'BUTTON') el.type = 'button';
  });
  document.querySelectorAll('.store-nav').forEach(el => {
    el.style.display = cfg.canMasterPanel ? '' : 'none';
  });
  document.querySelectorAll('.minha-conta-topbar').forEach(el => {
    el.style.display = (IS_PARCEIRO || cfg._inPartnerOrg) ? 'none' : '';
  });
  const navTkt = document.getElementById('navManageTickets');
  if (navTkt) navTkt.style.display = cfg.canChamados ? '' : 'none';
  const navWa = document.getElementById('navWhatsApp');
  if (navWa) {
    navWa.style.display = cfg.canWhatsApp ? '' : 'none';
    if (navWa.dataset.waNavWired !== '1') {
      navWa.dataset.waNavWired = '1';
      navWa.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.location.href = 'pages/whatsapp.html';
      });
    }
  }
  
  document.querySelectorAll('.leads-manager-nav').forEach(el => {
    el.style.display = (cfg.canLeadsManager && !IS_PORTARIA) ? 'flex' : 'none';
  });
  const showTreinamentos = cfg.canTreinamentos !== false;
  document.querySelectorAll('.trainings-nav, .trainings-manage-nav, .trainings-rh-nav, .trainings-collab-nav').forEach(el => {
    if (!window.SOUBLU_TREINAMENTOS_PAGE && el.closest('.sidebar-nav')) {
      const isHubOnly = el.classList.contains('trainings-manage-nav')
        || el.classList.contains('trainings-rh-nav')
        || el.classList.contains('trainings-collab-nav');
      if (isHubOnly) {
        el.style.display = 'none';
        return;
      }
    }
    el.style.display = showTreinamentos ? '' : 'none';
  });

  /* Itens financeiros (conta corrente, fiscal, fornecedor) só no hub Financeiro — exceto fiscal/comissões para rede parceira. */
  if (!window.SOUBLU_FINANCEIRO_PAGE) {
    const partnerFiscal = cfg._inPartnerOrg && cfg.canFiscalParceiro;
    if (partnerFiscal && window.FiscalParceiro && typeof FiscalParceiro.ensureUi === 'function') {
      try { FiscalParceiro.ensureUi(); } catch (e) { console.warn('[admin] FiscalParceiro.ensureUi', e); }
    } else {
      ['navContaCorrente', 'navContaCorrenteGestao', 'navFiscalParceiro', 'navFornecedorFinanceiro'].forEach((id) => {
        document.getElementById(id)?.remove();
      });
    }
  }

  /* Parceiros (cadastro/gestão): RH + hub Financeiro — não duplicar no Painel Master. */
  if (!window.SOUBLU_FINANCEIRO_PAGE) {
    document.querySelectorAll(
      '.partners-master-only, [data-section="secPartners"], .partner-ops-nav, #navPartnerOps'
    ).forEach((el) => {
      el.remove();
    });
    document.getElementById('secPartners')?.remove();
  }

  /* Feedbacks: só no hub RH — não duplicar no Painel Master. */
  document.querySelectorAll('.sidebar-nav [data-section="secFeedback"]').forEach((el) => {
    el.remove();
  });

  /* Relatório só para supervisor+ — Ranking só equipe interna (não parceiros). */
  document.querySelectorAll('[data-section="secReport"]').forEach((el) => {
    if (!el.closest('#finSidebarNav')) el.remove();
  });
  document.getElementById('secReport')?.remove();

  /* Treinamentos (gestão, notas RH, meus treinamentos) só na página treinamentos.html. */
  if (!window.SOUBLU_TREINAMENTOS_PAGE) {
    ['navTrainingsManage', 'navTrainingsRh', 'navTrainingsCollab'].forEach((id) => {
      document.getElementById(id)?.remove();
    });
    document.querySelectorAll('.trainings-manage-nav, .trainings-rh-nav, .trainings-collab-nav, .trainings-nav').forEach((el) => {
      if (!el.closest('#finSidebarNav') && el.id !== 'navTreinamentosHub') el.remove();
    });
  }

  /* ── FINANCEIRO (hub dedicado — Master + Fundador + Financeiro) ── */
  (function _injectFinanceiroHubNav() {
    const canFin = cfg.canFinanceiroHub;
    let btn = document.getElementById('navFinanceiroHub');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'navFinanceiroHub';
      btn.type = 'button';
      btn.className = 'nav-item';
      btn.innerHTML = `<span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg></span><span class="nav-label">Financeiro</span>`;
      btn.onclick = () => {
        const href = typeof Auth !== 'undefined' && Auth.financeiroPageHrefFresh
          ? Auth.financeiroPageHrefFresh()
          : (typeof Auth !== 'undefined' && Auth.financeiroPageHref
            ? Auth.financeiroPageHref()
            : 'pages/financeiro.html');
        _navigateToHub(href);
      };
      const sidebarNav = document.querySelector('.sidebar-nav');
      const reportsLabel = Array.from(sidebarNav?.querySelectorAll('.sidebar-section-label') || [])
        .find(el => el.textContent.trim().toUpperCase() === 'RELATÓRIOS');
      if (reportsLabel && sidebarNav) {
        sidebarNav.insertBefore(btn, reportsLabel);
      } else if (sidebarNav) {
        sidebarNav.appendChild(btn);
      }
    }
    btn.style.display = canFin ? '' : 'none';
  })();

  /* Folha de Pagamento: só no hub Financeiro (não duplicar no menu admin). */
  document.getElementById('navFolhaPagamento')?.remove();

  /* ── TREINAMENTOS (hub dedicado) ── */
  (function _injectTreinamentosHubNav() {
    const canTrn = cfg.canTreinamentos !== false;
    let btn = document.getElementById('navTreinamentosHub');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'navTreinamentosHub';
      btn.type = 'button';
      btn.className = 'nav-item';
      btn.innerHTML = `<span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg></span><span class="nav-label">Treinamentos</span><span class="nav-badge trainings-badge" id="trainingsBadge" style="display:none;">0</span>`;
      btn.onclick = () => {
        const href = typeof Auth !== 'undefined' && Auth.treinamentosPageHrefFresh
          ? Auth.treinamentosPageHrefFresh()
          : (typeof Auth !== 'undefined' && Auth.treinamentosPageHref
            ? Auth.treinamentosPageHref()
            : 'pages/treinamentos.html');
        _navigateToHub(href);
      };
      const sidebarNav = document.querySelector('.sidebar-nav');
      const refBtn = document.getElementById('navFinanceiroHub');
      if (refBtn && refBtn.nextSibling && sidebarNav) {
        sidebarNav.insertBefore(btn, refBtn.nextSibling);
      } else {
        const reportsLabel = Array.from(sidebarNav?.querySelectorAll('.sidebar-section-label') || [])
          .find(el => el.textContent.trim().toUpperCase() === 'RELATÓRIOS');
        if (reportsLabel && sidebarNav) {
          sidebarNav.insertBefore(btn, reportsLabel);
        } else if (sidebarNav) {
          sidebarNav.appendChild(btn);
        }
      }
    }
    btn.style.display = canTrn ? '' : 'none';
  })();

  /* ── RH MANAGER (RH + Master + Supervisor/Vagas) ── */
  (function _injectRHNav() {
    const roleLower = String(currentUser?.role || '').toLowerCase();
    const isSup = roleLower === 'supervisor' || roleLower === 'sup_backoffice';
    const canRH = (IS_RH && !window.PARTNER_ROOT_ID) || IS_MASTER || IS_FUNDA || isSup;
    let btn = document.getElementById('navRHManager');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'navRHManager';
      btn.type = 'button';
      btn.className = 'nav-item';
      btn.innerHTML = `<span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></span><span class="nav-label">${isSup ? 'Vagas' : 'RH'}</span>`;
      btn.onclick = () => {
        let href = typeof Auth !== 'undefined' && Auth.rhManagerPageHrefFresh
          ? Auth.rhManagerPageHrefFresh()
          : (typeof Auth !== 'undefined' && Auth.rhManagerPageHref
            ? Auth.rhManagerPageHref()
            : 'pages/rh-manager.html');
        if (isSup) {
          try {
            const u = new URL(href, window.location.href);
            u.searchParams.set('tab', 'vagas');
            href = u.href;
          } catch (_) {
            href += (href.includes('?') ? '&' : '?') + 'tab=vagas';
          }
        }
        _navigateToHub(href);
      };
      const sidebarNav = document.querySelector('.sidebar-nav');
      const refBtn = document.getElementById('navFinanceiroHub');
      if (refBtn && refBtn.nextSibling && sidebarNav) {
        sidebarNav.insertBefore(btn, refBtn.nextSibling);
      } else {
        const reportsLabel = Array.from(sidebarNav?.querySelectorAll('.sidebar-section-label') || [])
          .find(el => el.textContent.trim().toUpperCase() === 'RELATÓRIOS');
        if (reportsLabel && sidebarNav) {
          sidebarNav.insertBefore(btn, reportsLabel);
        } else if (sidebarNav) {
          sidebarNav.appendChild(btn);
        }
      }
    }
    btn.style.display = canRH ? '' : 'none';
  })();

  /* ── MONITORIA DE ATENDIMENTO (Administrativo) ── */
  (function _injectMonitoriaNav() {
    const canMon = cfg.canMonitoriaAtendimento;
    document.getElementById('navMonitoramentoHub')?.remove();
    let btn = document.getElementById('navMonitoriaAtendimento');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'navMonitoriaAtendimento';
      btn.type = 'button';
      btn.className = 'nav-item monitoria-atendimento-nav';
      btn.innerHTML = `<span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></span><span class="nav-label">Monitoria</span>`;
      btn.onclick = () => {
        const href = typeof Auth !== 'undefined' && Auth.monitoriaAtendimentoPageHrefFresh
          ? Auth.monitoriaAtendimentoPageHrefFresh()
          : (typeof Auth !== 'undefined' && Auth.monitoriaAtendimentoPageHref
            ? Auth.monitoriaAtendimentoPageHref()
            : 'pages/monitoria-atendimento.html');
        _navigateToHub(href);
      };
      const sidebarNav = document.querySelector('.sidebar-nav');
      const refBtn = document.getElementById('navRHManager') || document.getElementById('navFinanceiroHub');
      if (refBtn && refBtn.nextSibling && sidebarNav) {
        sidebarNav.insertBefore(btn, refBtn.nextSibling);
      } else if (sidebarNav) {
        sidebarNav.appendChild(btn);
      }
    }
    btn.style.display = canMon ? '' : 'none';
  })();

  /* ── JURÍDICO (hub rh-manager — contestação, punição, demissão, chamados) ── */
  (function _injectJuridicoHubNav() {
    const canJur = cfg.canJuridicoHub;
    let btn = document.getElementById('navJuridicoHub');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'navJuridicoHub';
      btn.type = 'button';
      btn.className = 'nav-item';
      btn.innerHTML = `<span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M5 10h14"/><path d="M5 14h14"/></svg></span><span class="nav-label">Jurídico</span>`;
      btn.onclick = () => {
        const href = typeof Auth !== 'undefined' && Auth.juridicoManagerPageHrefFresh
          ? Auth.juridicoManagerPageHrefFresh()
          : (typeof Auth !== 'undefined' && Auth.juridicoManagerPageHref
            ? Auth.juridicoManagerPageHref()
            : 'pages/rh-manager.html');
        _navigateToHub(href);
      };
      const sidebarNav = document.querySelector('.sidebar-nav');
      const refBtn = document.getElementById('navMonitoriaAtendimento') || document.getElementById('navRHManager');
      if (refBtn && refBtn.nextSibling && sidebarNav) {
        sidebarNav.insertBefore(btn, refBtn.nextSibling);
      } else if (sidebarNav) {
        sidebarNav.appendChild(btn);
      }
    }
    btn.style.display = canJur ? '' : 'none';
  })();

  if (window.Tim && typeof Tim.applyNavVisibility === 'function') Tim.applyNavVisibility(cfg);
  document.querySelectorAll('.tim-indicacao-nav, .tim-esteira-nav, #navTimIndicacao, #navTimEsteira').forEach(el => {
    el.style.display = 'none';
  });
  document.querySelectorAll('#secTimIndicacao, #secTimEsteira').forEach(el => {
    el.style.display = 'none';
  });
  if (window.Contestacao && typeof Contestacao.applyNavVisibility === 'function') Contestacao.applyNavVisibility(cfg);
  if (window.FiscalParceiro && typeof FiscalParceiro.applyNavVisibility === 'function') FiscalParceiro.applyNavVisibility(cfg);
  if (window.BolaoCopa && typeof BolaoCopa.applyNavVisibility === 'function') {
    if (IS_PORTARIA) {
      void BolaoCopa.applyNavVisibility().then(() => _applyPortariaNavExtras());
    } else {
      BolaoCopa.applyNavVisibility();
    }
  }
  if (window.Trainings && typeof Trainings.applyNavVisibility === 'function') Trainings.applyNavVisibility(cfg);
  if (window.MarketplaceBlu && typeof MarketplaceBlu.applyNavVisibility === 'function') MarketplaceBlu.applyNavVisibility(cfg);
  if (window.FornecedorFinanceiro && typeof FornecedorFinanceiro.applyNavVisibility === 'function') FornecedorFinanceiro.applyNavVisibility(cfg);
  if (window.ContaCorrente && typeof ContaCorrente.applyNavVisibility === 'function') ContaCorrente.applyNavVisibility(cfg);
  if (window.EsteiraCredito && typeof EsteiraCredito.applyNavVisibility === 'function') EsteiraCredito.applyNavVisibility(cfg);

  /* Carrega módulos de nav após first paint — só se o perfil precisar. */
  void (async () => {
    try {
      const jobs = [];
      if (cfg.canContestacao && !window.Contestacao) {
        jobs.push(ensureScript('../js/contestacao.js').then(() => window.Contestacao?.applyNavVisibility?.(cfg)));
      }
      if (cfg.canFiscalParceiro && !window.FiscalParceiro) {
        jobs.push(ensureScript('../js/fiscal-parceiro.js').then(() => {
          window.FiscalParceiro?.applyNavVisibility?.(cfg);
          try { window.FiscalParceiro?.ensureUi?.(); } catch (_) { /* noop */ }
        }));
      }
      if (cfg.canFornecedorFinanceiro && !window.FornecedorFinanceiro) {
        jobs.push(ensureScript('../js/fornecedor-financeiro.js').then(() => window.FornecedorFinanceiro?.applyNavVisibility?.(cfg)));
      }
      if (!window.Trainings) {
        jobs.push(ensureScript('../js/trainings.js?v=cadastro3').then(async () => {
          window.Trainings?.applyNavVisibility?.(cfg);
          window.Trainings?.init?.();
          try { await window.Trainings?.updateBadge?.(); } catch (_) { /* noop */ }
        }));
      }
      if ((cfg.canTimIndicacao || cfg.canTimEsteira) && !window.Tim) {
        jobs.push(ensureScript('../js/tim.js').then(() => window.Tim?.applyNavVisibility?.(cfg)));
      }
      if ((cfg.canPartnerOpsHub || cfg.canMasterPanel) && !window.PartnerOps) {
        jobs.push(ensureScript('../js/partners.js').then(() => ensureScript('../js/partner-ops.js')));
      }
      await Promise.all(jobs);
    } catch (e) {
      console.warn('[admin lazy nav modules]', e);
    }
  })();

  /* Gestão financeira duplicada no hub — ocultar do menu admin para quem tem Financeiro hub. */
  if (!window.SOUBLU_FINANCEIRO_PAGE && cfg.canFinanceiroHub) {
    const _hideFinHubDup = (sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        if (!el.closest('#finSidebarNav')) el.style.display = 'none';
      });
    };
    _hideFinHubDup('.sidebar-nav .nav-item[data-section="secBalance"]');
    _hideFinHubDup('.sidebar-nav .nav-item[data-section="secWithdrawals"]');
    _hideFinHubDup(
      '.sidebar-nav .marketplace-blu-nav, .sidebar-nav .marketplace-manage-nav, .sidebar-nav .marketplace-orders-nav'
    );
    _hideFinHubDup('#navMarketplaceBlu, #navMarketplaceManage, #navMarketplaceOrders');
  }

  const showReportsSection = Array.from(document.querySelectorAll(
    '.sidebar-nav .ranking-nav, .sidebar-nav button[data-section="secReport"]'
  )).some(el => el.style.display !== 'none');
  document.querySelectorAll('.reports-section').forEach(el => {
    el.style.display = showReportsSection ? '' : 'none';
  });
  const administrativoBtns = document.querySelectorAll(
    '.sidebar-nav .administrativo-nav, .sidebar-nav .meetings-nav, .sidebar-nav #navManageTickets'
  );
  const hasAdministrativo = Array.from(administrativoBtns).some(el => el.style.display !== 'none');
  document.querySelectorAll('.sidebar-nav .administrativo-section-label, .sidebar-nav .administrativo-section-divider').forEach(el => {
    el.style.display = hasAdministrativo ? '' : 'none';
  });
  const gestaoBtns = document.querySelectorAll(
    '.sidebar-nav .leads-manager-nav, .sidebar-nav .nav-item[data-section="secEmployees"], .sidebar-nav .nav-item[data-section="secBalance"], .sidebar-nav .nav-item[data-section="secProducts"], .sidebar-nav .nav-item[data-section="secOrders"], .sidebar-nav .store-shop-nav, .sidebar-nav .nav-item[data-section="secWithdrawals"], .sidebar-nav #navClients, .sidebar-nav #navManageProposals, .sidebar-nav #navPartnerOps, .sidebar-nav #navSimulacao, .sidebar-nav #navFinanceiroHub, .sidebar-nav #navMonitoriaAtendimento'
  );
  const hasGestao = Array.from(gestaoBtns).some(el => el.style.display !== 'none');
  document.querySelectorAll('.sidebar-nav .sidebar-section-label').forEach(lbl => {
    const t = lbl.textContent.trim().toUpperCase();
    if (t === 'GESTÃO') {
      lbl.style.display = hasGestao ? '' : 'none';
    }
  });
}

function _syncEmpDeptFromTeamRole() {
  const sel = document.getElementById('empTeamRole');
  const dept = document.getElementById('empDept');
  if (!sel || !dept || typeof PartnerPerms === 'undefined') return;
  dept.value = PartnerPerms.roleDept(sel.value);
}

function _togglePartnerTeamRoleField(show) {
  const g = document.getElementById('empTeamRoleGroup');
  if (g) g.style.display = show ? '' : 'none';
  if (show && typeof PartnerPerms !== 'undefined') {
    PartnerPerms.fillTeamRoleSelect('empTeamRole');
  }
}
let _prodImgUrl      = '';

/** Campo de quantidade conforme operações adicionar / remover / definir */
function syncBalanceAmountByOperation() {
  const opEl = document.getElementById('balanceOperation');
  const amtEl = document.getElementById('balanceAmount');
  if (!opEl || !amtEl) return;
  amtEl.removeAttribute('readonly');
  const op = opEl.value;
  if (op === 'set') {
    amtEl.min = '0';
    amtEl.step = '1';
    amtEl.placeholder = 'Saldo total em pontos';
  } else {
    amtEl.min = '1';
    amtEl.step = '1';
    amtEl.placeholder = 'Ex: 500';
  }
}

function wireBalanceOperationField() {
  const opEl = document.getElementById('balanceOperation');
  if (opEl) opEl.addEventListener('change', syncBalanceAmountByOperation);
  syncBalanceAmountByOperation();
}

/** Pontos (BLU interna) ou R$ (rede parceiro). */
function _parseBalanceFormAmount(op, rawAmt, useMoneyWallet) {
  if (useMoneyWallet) {
    const v = typeof parseMoneyAmount === 'function'
      ? parseMoneyAmount(rawAmt)
      : parseFloat(rawAmt);
    if (op === 'set') {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : NaN;
    }
    return v;
  }
  if (op === 'set') return Math.max(0, Math.floor(Number(rawAmt)));
  return Math.max(0, Math.floor(Number(rawAmt)));
}

function _balanceAmountValidationMessage(op, amt, useMoneyWallet) {
  if (!Number.isFinite(amt)) return 'Informe um valor válido.';
  if (op === 'set' && amt < 0) return 'Saldo definido não pode ser negativo.';
  if (op !== 'set' && amt <= 0) {
    return useMoneyWallet
      ? 'Informe um valor em R$ maior que zero.'
      : 'Informe pontos válidos (≥ 1).';
  }
  return null;
}

async function applyBalanceAdjustment(empId, op, amt, reason, metaExtra) {
  const emp = await DB.getUser(empId);
  if (!emp) throw new Error('Usuário não encontrado.');
  const isPartnerFlow = metaExtra?.screen === 'distribuir_saldo_parceiro' || metaExtra?.partner_root_id;
  if (!isPartnerFlow && typeof canSouBluManagePoints === 'function' && !canSouBluManagePoints(emp)) {
    throw new Error('Rede parceira não usa pontos SOU+BLU. Use RH → Cadastrar Parceiro → Distribuir saldo (R$).');
  }
  const meta = {
    kind: 'credito_manual',
    screen: metaExtra?.screen || 'gerenciar_saldo',
    valor_reais: amt,
    ...(metaExtra || {}),
  };
  if (op === 'add') {
    const nb = await DB.addBalance(empId, amt, reason, ADMIN_ID, meta);
    if (nb == null) throw new Error('Não foi possível creditar o saldo. Confirme que o gestor parceiro está ativo (role parceiro).');
    if (/elogio/i.test(String(reason || '')) && typeof DB.applyRouletteCriteriaReward === 'function') {
      const rw = await DB.applyRouletteCriteriaReward(empId, 'elogio_master', {
        event_id: `elogio_${Date.now()}_${empId}`,
        by_user: ADMIN_ID,
        reason_note: reason,
      }).catch(() => null);
      if (rw?.ok && typeof showToast === 'function') {
        showToast(`+${rw.coins} moeda(s) da roleta (elogio Master).`, 'success', 5000);
      }
    }
    return nb;
  }
  if (op === 'remove') {
    const money = typeof DB._isPartnerWalletUser === 'function' && DB._isPartnerWalletUser(emp);
    if (money && userPts(emp) < amt) throw new Error('Saldo insuficiente.');
    const nb = await DB.deductBalance(empId, amt, reason, ADMIN_ID, meta);
    if (nb == null) throw new Error('Não foi possível debitar o saldo. Verifique permissões.');
    return nb;
  }
  if (op === 'set') {
    const nb = await DB.setBalance(empId, amt, reason, ADMIN_ID, meta);
    if (nb == null) throw new Error('Não foi possível definir o saldo. Verifique permissões.');
    return nb;
  }
  throw new Error('Operação inválida.');
}

/** Rede parceira: saldo em R$ só no gestor (role parceiro), não na equipe. */
async function _partnerBalanceGestorRow(partnerRootId) {
  if (!partnerRootId) return null;
  const root = await DB.getUser(partnerRootId).catch(() => null);
  if (!root) return null;
  if (root.role !== 'parceiro') {
    const prt = await DB.getPartnerByUserId(partnerRootId).catch(() => null);
    if (!prt) return null;
  }
  return { ...root, _roleLabel: 'Parceiro (gestor)' };
}

async function populatePartnerBalanceSelect(partnerRootId) {
  const sel = document.getElementById('partnerBalanceEmployee');
  const gestorBox = document.getElementById('partnerBalanceGestorInfo');
  const destGroup = document.getElementById('partnerBalanceDestGroup');
  const row = await _partnerBalanceGestorRow(partnerRootId);
  if (!sel || !partnerRootId) return;
  if (destGroup) destGroup.style.display = 'none';
  if (!row) {
    sel.innerHTML = '<option value="">Gestor não encontrado</option>';
    if (gestorBox) gestorBox.innerHTML = '<div class="text-muted">Parceiro (gestor) não encontrado.</div>';
    return;
  }
  sel.innerHTML = `<option value="${row.id}" selected>${row.name}</option>`;
  sel.value = row.id;
  if (gestorBox) {
    gestorBox.innerHTML = `<div style="font-weight:700;font-size:14px;">${row.name}</div><div style="font-size:12px;color:var(--color-text-muted);margin-top:4px;">Parceiro (gestor) · saldo atual <strong style="color:var(--color-success);">${formatCurrency(userPts(row), row)}</strong></div>`;
  }
}

async function renderPartnerBalanceTeamList(partnerRootId) {
  const box = document.getElementById('partnerBalanceTeamList');
  if (!box) return;
  const row = await _partnerBalanceGestorRow(partnerRootId);
  if (!row) {
    box.innerHTML = '<div class="text-muted">Gestor parceiro não encontrado.</div>';
    return;
  }
  box.innerHTML = `<div class="card card-padded" style="padding:12px 14px;"><div style="font-weight:700;font-size:13px;">${row.name}</div><div style="font-size:11px;color:var(--color-text-muted);margin-top:4px;">Parceiro (gestor)</div><div style="font-weight:900;font-size:18px;color:var(--color-success);margin-top:8px;">${formatCurrency(userPts(row), row)}</div><p style="font-size:11px;color:var(--color-text-muted);margin:10px 0 0;">A equipe (vendedores e backoffice) não recebe saldo nesta rede — apenas o gestor saca via PIX no Meu Perfil.</p></div>`;
}

async function renderPartnerBalanceHistory(partnerRootId) {
  const box = document.getElementById('partnerBalanceHistory');
  if (!box || !partnerRootId) return;
  const gestor = await _partnerBalanceGestorRow(partnerRootId);
  const ids = new Set(gestor ? [gestor.id] : []);
  let txs = [];
  try {
    txs = await DB.getTransactions();
  } catch (_) { txs = []; }
  txs = (txs || [])
    .filter(t => ids.has(t.employee_id))
    .sort((a, b) => new Date(b.created_at || b.date || 0) - new Date(a.created_at || a.date || 0))
    .slice(0, 15);
  if (!txs.length) {
    box.innerHTML = '<div class="text-muted text-center" style="padding:12px;">Nenhuma movimentação nesta rede.</div>';
    return;
  }
  const byId = gestor ? { [gestor.id]: gestor } : {};
  box.innerHTML = txs.map(t => {
    const emp = byId[t.employee_id];
    const isCr = t.type === 'credit';
    const fmt = formatCurrency(t.amount, emp);
    return `<div class="tx-item" style="padding:8px 0;border-bottom:1px solid var(--color-border);"><div style="font-weight:700;font-size:12px;">${emp?.name || '–'}</div><div style="font-size:11px;color:var(--color-text-muted);">${t.reason || '—'} · ${timeAgo(t.created_at || t.date)}</div><div style="font-weight:800;font-size:12px;color:${isCr ? 'var(--color-success)' : 'var(--color-danger)'};">${isCr ? '+' : '−'}${fmt}</div></div>`;
  }).join('');
}

function prefillPartnerBalanceRecipient(userId) {
  const rootInp = document.getElementById('partnerBalanceRootId');
  const sel = document.getElementById('partnerBalanceEmployee');
  const rootId = rootInp?.value;
  if (sel && rootId && (!userId || userId === rootId)) sel.value = rootId;
}

async function openPartnerBalanceModal(partnerRootId) {
  if (!IS_MASTER && !IS_FUNDA && !IS_FINANCIAL && !IS_RH) {
    showToast('Sem permissão para distribuir saldo.', 'error');
    return;
  }
  if (!partnerRootId) return;
  const p = await DB.getPartnerByUserId(partnerRootId).catch(() => null);
  const u = await DB.getUser(partnerRootId).catch(() => null);
  const title = document.getElementById('partnerBalanceModalTitle');
  const rootInp = document.getElementById('partnerBalanceRootId');
  if (rootInp) rootInp.value = partnerRootId;
  if (title) {
    title.textContent = ` Distribuir saldo — ${p?.razao_social || u?.name || 'Parceiro'}`;
  }
  document.getElementById('partnerBalanceForm')?.reset();
  await Promise.all([
    populatePartnerBalanceSelect(partnerRootId),
    renderPartnerBalanceTeamList(partnerRootId),
    renderPartnerBalanceHistory(partnerRootId),
  ]);
  openModal('partnerBalanceModal');
}
window.openPartnerBalanceModal = openPartnerBalanceModal;
window.prefillPartnerBalanceRecipient = prefillPartnerBalanceRecipient;

let _adminPollTimer = null;
let _adminKeepaliveTimer = null;

function _stopAdminLiveRefresh() {
  if (_adminPollTimer) {
    clearInterval(_adminPollTimer);
    _adminPollTimer = null;
  }
  if (_adminKeepaliveTimer) {
    clearInterval(_adminKeepaliveTimer);
    _adminKeepaliveTimer = null;
  }
  window.__SOUBLU_ADMIN_POLL__ = false;
}

/** Sai do admin para outro módulo sem deixar polling/API travando o servidor PHP. */
function _navigateToHub(href) {
  _stopAdminLiveRefresh();
  if (typeof invalidateSouBluCaches === 'function') invalidateSouBluCaches();
  window.location.replace(href);
}

/** Remove ?_r= da URL após voltar do RH/Financeiro (só cosmético). */
function _stripNavCacheBustParam() {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has('_r')) return;
    u.searchParams.delete('_r');
    const qs = u.searchParams.toString();
    history.replaceState(null, '', u.pathname + (qs ? `?${qs}` : '') + u.hash);
  } catch (_) { /* noop */ }
}

/** Recarrega dados ao restaurar o painel do cache do navegador (bfcache). */
async function _refreshAdminAfterBfcache() {
  hideLoading();
  window.__SOUBLU_ADMIN_POLL__ = false;
  try {
    await Auth.syncSessionFromDb();
    if (!Auth.getSession()) {
      window.location.replace(Auth.loginPageHref());
      return;
    }
    _startAdminLiveRefresh();
    const sec = document.querySelector('.section.active')?.id || 'secEmployees';
    if (typeof navigateTo === 'function') navigateTo(sec);
    const jobs = [];
    if (sec === 'secDashboard') jobs.push(renderDashboard());
    if (sec === 'secEmployees' && CAN_EMPLOYEES_PANEL) jobs.push(renderEmployeesTable());
    if (sec === 'secWithdrawals') jobs.push(renderWithdrawalsTable());
    if (sec === 'secManageProposals' && window.Proposals) jobs.push(Proposals.renderAdminList());
    if (sec === 'secBalance') jobs.push(populateBalanceSelect(), renderBalanceHistory());
    await _bootSettle(jobs);
    try { updatePendingBadge(); } catch (_) { /* noop */ }
  } catch (e) {
    console.warn('[admin] bfcache refresh failed, reloading:', e);
    location.reload();
  }
}

window.addEventListener('pageshow', (ev) => {
  if (window.SOUBLU_FINANCEIRO_PAGE || window.SOUBLU_TREINAMENTOS_PAGE) return;
  if (!ev.persisted) return;
  _refreshAdminAfterBfcache();
});

/** Executa promise com timeout — evita painel branco quando API/MySQL trava. */
async function _bootRace(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label || 'operação'} demorou demais (${timeoutMs}ms)`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Executa tarefas de boot sem derrubar o painel se uma falhar (ex.: timeout Supabase). */
async function _bootSettle(tasks, timeoutMs = 120000) {
  const list = (Array.isArray(tasks) ? tasks : [tasks]).filter(Boolean);
  const wrapped = list.map((t, i) => Promise.race([
    Promise.resolve(t),
    new Promise((_, reject) => setTimeout(
      () => reject(new Error(`boot task ${i} timeout (${timeoutMs}ms)`)),
      timeoutMs,
    )),
  ]));
  const results = await Promise.allSettled(wrapped);
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.warn('[admin boot task', i, ']', r.reason);
  });
}

/** Mostra seção de destino antes de cargas pesadas (evita tela branca). */
function _bootShowLanding(sectionId) {
  if (!sectionId || typeof navigateTo !== 'function') return;
  navigateTo(sectionId);
  if (sectionId === 'secInicio') {
    const root = document.getElementById('painelSonhosRoot');
    if (root && !root.innerHTML.trim()) {
      root.innerHTML = '<div class="card card-padded text-center text-muted" style="padding:32px;">Carregando painel…</div>';
    }
  }
  if (sectionId === 'secDashboard') {
    const stats = document.getElementById('dashStats');
    if (stats && !stats.innerHTML.trim()) {
      stats.innerHTML = '<div class="text-muted text-center" style="padding:24px;">Carregando dashboard…</div>';
    }
    const dash = document.getElementById('secDashboard');
    if (dash) dash.style.display = '';
  }
  if (typeof hideLoading === 'function') hideLoading();
}

function _dashRetryHtml(msg) {
  const text = msg || 'Não foi possível carregar o resumo agora.';
  return `<div class="card card-padded text-center" style="padding:28px;margin:12px 0;">
    <p class="text-muted" style="margin-bottom:14px;">${text}</p>
    <button type="button" class="btn btn-primary btn-sm" onclick="renderDashboard()">Tentar novamente</button>
  </div>`;
}

function _ensureDashPlaceholder(msg) {
  const stats = document.getElementById('dashStats');
  if (stats && !stats.innerHTML.trim()) {
    stats.innerHTML = `<div class="text-muted text-center" style="padding:24px;">${msg || 'Carregando dashboard…'}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.SOUBLU_FINANCEIRO_PAGE || window.SOUBLU_TREINAMENTOS_PAGE) return;
  const _adminBootT0 = Date.now();
  _stripNavCacheBustParam();
  if (typeof navigateTo === 'function') _bootShowLanding('secInicio');
  showLoading('Carregando painel...');
  let landingSection = 'secInicio';
  let _explicitLanding = false;
  const _urlOpen = new URLSearchParams(window.location.search).get('open');
  if (_urlOpen === 'loja') { landingSection = 'secStore'; _explicitLanding = true; }
  if (window.location.hash) {
    const h = window.location.hash.replace(/^#/, '');
    if (h) { landingSection = h; _explicitLanding = true; }
  }
  try {
    const db = await _requireDB();
    if (!db) throw new Error(_DB_LOAD_ERROR);
    await _bootRace(db.init(), 25000, 'Inicialização do banco');
    if (typeof refreshPartnerRootIdsCache === 'function') {
      await _bootRace(refreshPartnerRootIdsCache(), 15000, 'Cache de parceiros').catch(() => {});
    }
    await Auth.requireLogin();
    Auth.requireAdmin();
    try { sessionStorage.removeItem('soublu_portaria_loop_guard'); } catch (_) {}
    await _bootRace(Auth.syncSessionFromDb(), 20000, 'Sincronização da sessão');

    const s = Auth.getSession();
    if (s) s.role = String(s.role || '').trim().toLowerCase();
    ADMIN_ID          = s.id;
    const me = await _bootRace(Auth.getCurrentUser(), 20000, 'Carregar usuário');

    IS_PARCEIRO       = (s.role === 'parceiro');
    PARTNER_ROOT_ID = await DB.getPartnerRootForUser(s.id).catch(() => null);
    if (!PARTNER_ROOT_ID && me?.partner_root_id) {
      const hinted = await DB.getUser(me.partner_root_id).catch(() => null);
      if (hinted?.role === 'parceiro') PARTNER_ROOT_ID = String(hinted.id);
    }
    if (!PARTNER_ROOT_ID && window._PARTNER_ROOT_USER_IDS?.size && typeof DB.expandPartnerOrgIds === 'function') {
      const users = await DB.getAllUsers().catch(() => []);
      for (const rid of window._PARTNER_ROOT_USER_IDS) {
        if (DB.expandPartnerOrgIds(rid, users).has(String(s.id))) {
          PARTNER_ROOT_ID = String(rid);
          break;
        }
      }
    }
    if (PARTNER_ROOT_ID) {
      let prt = await DB.getPartnerByUserId(PARTNER_ROOT_ID);
      if (prt) window.PARTNER_RAZAO_SOCIAL = prt.razao_social || prt.razaoSocial || '';
      if (prt && typeof PartnerPerms !== 'undefined' && typeof PartnerPerms.ensureTeamSacarForFundedMember === 'function') {
        const meFull = me || await DB.getUser(s.id).catch(() => null);
        if (meFull) prt = await PartnerPerms.ensureTeamSacarForFundedMember(meFull, prt);
      }
      window._PARTNER_PERMS = typeof PartnerPerms !== 'undefined'
        ? PartnerPerms.merge(prt?.permissions)
        : null;
    } else {
      window._PARTNER_PERMS = null;
    }
    IS_PARTNER_STAFF = !!PARTNER_ROOT_ID && !IS_PARCEIRO;
    window.PARTNER_ROOT_ID = PARTNER_ROOT_ID;
    window.USER_DEPT     = me?.department || '';
    window.USER_ADMIN_ID = PARTNER_ROOT_ID || me?.admin_id || s.id;

    IS_MASTER         = Auth.isMaster();
    IS_GERENTE        = ['gerente', 'gerencia', 'admin'].includes(s.role);
    IS_SUP_BACKOFFICE = (s.role === 'sup_backoffice');
    IS_SUPERVISOR     = (s.role === 'supervisor') || (IS_SUP_BACKOFFICE && !PARTNER_ROOT_ID);
    IS_FINANCIAL      = (s.role === 'financeiro' || s.role === 'financial');
    IS_RH             = (s.role === 'rh');
    IS_BACKOFFICE     = (s.role === 'backoffice');
    IS_OPERACIONAL    = (s.role === 'operacional');
    IS_VENDEDOR_ADM   = (s.role === 'vendedor');
    IS_PORTARIA       = (s.role === 'portaria');
    window.IS_PORTARIA = IS_PORTARIA;
    IS_DIRETORIA      = (s.role === 'diretoria');
    IS_JURIDICO       = (s.role === 'juridico');
    IS_OUVIDORIA      = (s.role === 'ouvidoria');
    IS_FUNDA          = (typeof Auth.isFundador === 'function' ? Auth.isFundador() : s.role === 'fundador');
    IS_DESENVOLVEDOR  = (s.role === 'desenvolvedor');

    try {
      const ptr = sessionStorage.getItem('soublu_partner_team_root');
      if (ptr && (IS_MASTER || IS_FUNDA)) {
        sessionStorage.removeItem('soublu_partner_team_root');
        _empPartnerRootOverride = String(ptr);
        if (landingSection === 'secEmployees') window._keepPartnerTeamOverride = true;
      }
    } catch (_) { /* noop */ }

    if (typeof renderAdminSidebar === 'function') renderAdminSidebar(me);
    const empSub = document.getElementById('empPageSubtitle');
    if (empSub && PARTNER_ROOT_ID) {
      const orgName = window.PARTNER_RAZAO_SOCIAL || me?.name || 'parceiro';
      empSub.textContent = `Equipe ${orgName}: vendedores, backoffice, operacional e supervisor backoffice (somente esta organização)`;
    }

    // ── Permissões por planilha ───────────────────────────────────────
    // GERENTE     = master restrito sem financeiro (não vê Gerenciar Pontos/Financeiro)
    // FINANCEIRO  = master completo
    // RH          = master (feedbacks, funcionários)
    // SUPERVISOR  = propostas, chamados, clientes, ranking, loja (sem lista global de pontos)
    // VENDEDOR    = ranking    // canMasterPanel = perfis com visão global (sem saque para gerente/RH)
    const p = _effectiveAdminPerms(s.role, {
      ...(me?.permissions && typeof me.permissions === 'object' ? me.permissions : {}),
      ...(s.permissions || {}),
    });
    const canMasterPanel = p.canMasterPanel !== undefined ? !!p.canMasterPanel
      : _hasCompanyWideDashboard();
    /** Saques: aprovação só Financeiro + Master SOU+BLU (parceiros não aprovam na rede). */
    const canSaques      = p.canSaques !== undefined ? !!p.canSaques : ((IS_MASTER || IS_FUNDA || IS_FINANCIAL || IS_RH) && !PARTNER_ROOT_ID);
    const canFinanceiro  = canSaques;
    const _globalRhFin = (IS_RH || IS_FINANCIAL) && !PARTNER_ROOT_ID;
    const canCadFunc     = p.canCadFunc !== undefined ? !!p.canCadFunc : (IS_MASTER || _globalRhFin || IS_GERENTE || IS_SUP_BACKOFFICE || IS_DIRETORIA || canManagePartnerTeam());
    const _partnerStaff = PARTNER_ROOT_ID && (IS_PARCEIRO || isPartnerOrgStaffRole(s.role));
    const _partnerProp = _partnerStaff && (
      partnerOrgCan('cadastrar_proposta')
      || partnerOrgCan('visualizar_propostas')
      // Fallback se partners.js falhar: gestor parceiro vê propostas da própria equipe.
      || (IS_PARCEIRO && typeof PartnerPerms === 'undefined')
    );
    const canProposta    = p.canProposta !== undefined ? !!p.canProposta : (
      canMasterPanel || IS_SUPERVISOR || IS_BACKOFFICE || IS_OPERACIONAL || IS_SUP_BACKOFFICE || IS_VENDEDOR_ADM
      || _partnerProp
    );
    const canClientes    = p.canClientes !== undefined ? !!p.canClientes : (canMasterPanel || IS_SUPERVISOR || IS_BACKOFFICE || IS_OPERACIONAL || IS_SUP_BACKOFFICE || IS_VENDEDOR_ADM || (_partnerStaff && (partnerOrgCan('clientes') || partnerOrgCan('cadastrar_cliente') || partnerOrgCan('visualizar_propostas'))));
    const _inPartnerOrg  = !!PARTNER_ROOT_ID;
    const canPartnerOpsHub = p.canPartnerOpsHub !== undefined ? !!p.canPartnerOpsHub : (!_inPartnerOrg && (IS_OPERACIONAL || IS_BACKOFFICE || IS_MASTER || IS_FUNDA || IS_GERENTE || IS_DESENVOLVEDOR || IS_DIRETORIA || IS_FINANCIAL || IS_RH));
    window.CAN_PARTNER_OPS_HUB = canPartnerOpsHub;
    const canRanking     = (!_inPartnerOrg && !IS_PARCEIRO)
      && (p.canRanking !== undefined ? !!p.canRanking : true);
    window.CAN_RANKING = canRanking;
    const canLoja        = p.canLoja !== undefined ? !!p.canLoja : (canProposta || (PARTNER_ROOT_ID && IS_VENDEDOR_ADM));
    const canSimulacao   = p.canSimulacao !== undefined ? !!p.canSimulacao : (canProposta && (!_inPartnerOrg || partnerOrgCan('simulador')));
    const canChamados    = p.canChamados !== undefined ? !!p.canChamados : (_inPartnerOrg ? (IS_PARCEIRO && partnerOrgCan('gestao_chamados')) || (_partnerStaff && !IS_PARCEIRO && partnerOrgCan('gestao_chamados')) : true);
    const canSupervisorPanel = p.canSupervisorPanel !== undefined ? !!p.canSupervisorPanel : (IS_MASTER || IS_FUNDA || IS_GERENTE || IS_FINANCIAL || IS_RH || IS_DESENVOLVEDOR || IS_DIRETORIA);
    CAN_EMPLOYEES_PANEL = canSupervisorPanel || IS_GERENTE || IS_SUP_BACKOFFICE || canManagePartnerTeam() || (PARTNER_ROOT_ID && IS_PARCEIRO) || (PARTNER_ROOT_ID && _partnerStaff && partnerOrgCan('cadastrar_funcionario'));
    const canPartnerDashboard = p.canPartnerDashboard !== undefined ? !!p.canPartnerDashboard : ((IS_PARCEIRO && partnerOrgCan('dashboard')) || (PARTNER_ROOT_ID && _partnerStaff && (partnerOrgCan('dashboard') || partnerOrgCan('visualizar_propostas'))));
    const canTeamBillingChart = p.canTeamBillingChart !== undefined ? !!p.canTeamBillingChart : _canViewTeamBillingChart();
    const _sakPartnerNet = _inPartnerOrg && _isSakPartnerNetwork();
    const canLeadsManager = p.canLeadsManager !== undefined ? !!p.canLeadsManager : (
      (!_inPartnerOrg && (IS_MASTER || IS_FUNDA || IS_SUPERVISOR || IS_GERENTE || IS_DESENVOLVEDOR || IS_FINANCIAL || IS_RH || IS_DIRETORIA || IS_SUP_BACKOFFICE))
      // Leads: só rede SAK entre parceiros
      || (_sakPartnerNet && partnerOrgCan('atendimento_leads'))
    );
    const canTreinamentos = p.canTreinamentos !== undefined ? !!p.canTreinamentos : (
      !_inPartnerOrg || (_sakPartnerNet && partnerOrgCan('treinamentos'))
    );
    const canTimIndicacao = false;
    const canTimEsteira = false;
    const canContestacao = p.canContestacao !== undefined ? !!p.canContestacao : (!_inPartnerOrg || (IS_PARCEIRO && partnerOrgCan('contestacao')) || (_inPartnerOrg && partnerOrgCan('contestacao')));
    const canFiscalParceiro = p.canFiscalParceiro !== undefined ? !!p.canFiscalParceiro : (!_inPartnerOrg ? (IS_MASTER || IS_FUNDA || IS_FINANCIAL || IS_RH || IS_GERENTE) : false);
    const canMarketplaceBlu = p.canMarketplaceBlu !== undefined ? !!p.canMarketplaceBlu : (
      _sakPartnerNet
        ? ((IS_PARCEIRO && partnerOrgCan('marketplace_blu'))
          || (_partnerStaff && s.role !== 'vendedor' && partnerOrgCan('marketplace_blu')))
        : false
    );
    const canFornecedorFinanceiro = p.canFornecedorFinanceiro !== undefined ? !!p.canFornecedorFinanceiro : (!_inPartnerOrg && (IS_MASTER || IS_FUNDA || IS_FINANCIAL || IS_GERENTE));
    const canContaCorrente = p.canContaCorrente !== undefined ? !!p.canContaCorrente : (!_inPartnerOrg
      ? (canProposta || IS_VENDEDOR_ADM || IS_BACKOFFICE || IS_OPERACIONAL || IS_SUPERVISOR || IS_PARCEIRO || IS_FINANCIAL || IS_RH)
      : (partnerOrgCan('conta_credito_proposta') || partnerOrgCan('conta_debito_proposta')
        || partnerOrgCan('conta_adiantamento_motivo') || IS_PARCEIRO
        || ['vendedor', 'backoffice', 'operacional', 'sup_backoffice'].includes(s.role)));
    const canFinanceiroHub = p.canFinanceiroHub !== undefined ? !!p.canFinanceiroHub
      : (!_inPartnerOrg && (IS_MASTER || IS_FUNDA || IS_FINANCIAL));
    const canMonitoriaAtendimento = p.canMonitoriaAtendimento !== undefined ? !!p.canMonitoriaAtendimento
      : (!_inPartnerOrg && typeof Auth.canAccessMonitoriaAtendimento === 'function' && Auth.canAccessMonitoriaAtendimento());
    const canJuridicoHub = p.canJuridicoHub !== undefined ? !!p.canJuridicoHub
      : (!_inPartnerOrg && typeof Auth.canAccessJuridicoHub === 'function' && Auth.canAccessJuridicoHub());
    const canWhatsApp = p.canWhatsApp !== undefined ? !!p.canWhatsApp : (
      _inPartnerOrg ? partnerOrgCan('chat_whatsapp') : true
    );
    const _adminNavCfg = {
      canMasterPanel, canSaques, canCadFunc, canProposta, canClientes, _inPartnerOrg,
      canPartnerOpsHub, canRanking, canLoja, canSimulacao, canChamados, canSupervisorPanel,
      canPartnerDashboard, canTeamBillingChart, canLeadsManager, canTreinamentos, canTimIndicacao, canTimEsteira,
      canContestacao, canFiscalParceiro, canMarketplaceBlu, canFornecedorFinanceiro, canContaCorrente,
      canFinanceiroHub, canMonitoriaAtendimento, canJuridicoHub, canWhatsApp,
      canMeetings: !_inPartnerOrg,
    };
    if (IS_PORTARIA) {
      Object.assign(_adminNavCfg, {
        canMasterPanel: false, canSaques: false, canCadFunc: false, canProposta: false,
        canClientes: false, canPartnerOpsHub: false, canRanking: false, canLoja: true,
        canSimulacao: false, canChamados: true, canSupervisorPanel: false,
        canPartnerDashboard: false, canTeamBillingChart: false, canLeadsManager: false,
        // Portaria: treinamentos só se liberado explicitamente em permissions.canTreinamentos
        canTreinamentos: p.canTreinamentos === true,
        canTimIndicacao: false, canTimEsteira: false, canContestacao: false,
        canFiscalParceiro: false, canMarketplaceBlu: false, canFornecedorFinanceiro: false,
        canContaCorrente: false, canFinanceiroHub: false, canMonitoriaAtendimento: false,
        canJuridicoHub: false, canWhatsApp: false, canMeetings: false, canBolao: true,
      });
    }
    window.__ADMIN_NAV_CFG__ = _adminNavCfg;
    // #region agent log
    fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'post-fix',hypothesisId:'H1-H5',location:'admin.js:boot-perms',message:'admin boot permissions',data:{role:s.role,userId:s.id,rawCanMasterPanel:!!(p.canMasterPanel),computedCanMasterPanel:!!canMasterPanel,companyWide:!!_hasCompanyWideDashboard(),IS_SUP_BACKOFFICE:!!IS_SUP_BACKOFFICE,IS_SUPERVISOR:!!IS_SUPERVISOR,landingSection},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    _applyAdminNavVisibility(_adminNavCfg);
    if (typeof unlockUiOverlays === 'function') unlockUiOverlays();
    if (IS_PORTARIA) _applyPortariaNavExtras();
    if (window.PainelSonhos && typeof PainelSonhos.applyAdminNav === 'function') {
      PainelSonhos.applyAdminNav(s.role);
    }
    if (!_explicitLanding) {
      if (canMasterPanel || canPartnerDashboard) {
        landingSection = 'secDashboard';
      } else if (window.PainelSonhos && PainelSonhos.shouldLandOnInicio(s.role, {
        partnerOrg: !!PARTNER_ROOT_ID,
        partnerLanding: !!PARTNER_ROOT_ID,
        canMasterPanel,
        canPartnerDashboard,
      })) {
        landingSection = 'secInicio';
      }
    }
    _bootShowLanding(landingSection);
    if (landingSection === 'secRanking' && !canRanking) {
      landingSection = _inPartnerOrg
        ? (canPartnerDashboard ? 'secDashboard' : (canProposta ? 'secManageProposals' : 'secMyProfile'))
        : 'secInicio';
      _explicitLanding = false;
    }

    if (employeesManagedInRhHub() && landingSection === 'secEmployees') {
      goToRhFuncionarios();
      return;
    }

    if (IS_JURIDICO && !window.SOUBLU_SKIP_JURIDICO_REDIRECT) {
      const hash = String(window.location.hash || '').replace(/^#/, '');
      const stayOnAdmin = ['secContestacao', 'secManageTickets', 'secMeetings', 'secMyProfile'];
      if (!hash || !stayOnAdmin.includes(hash)) {
        const jurHref = typeof Auth !== 'undefined' && Auth.juridicoManagerPageHrefFresh
          ? Auth.juridicoManagerPageHrefFresh()
          : 'pages/rh-manager.html';
        window.location.replace(jurHref);
        return;
      }
    }

    /* Financeiro mantém Painel Master no admin (hub Financeiro via nav). Sem redirect forçado. */

    const propSub = document.getElementById('manageProposalsSubtitle');
    if (propSub) {
      propSub.textContent = '';
      propSub.style.display = 'none';
      propSub.setAttribute('hidden', '');
    }

    initSidebarToggle(); initNav();
    _wireLeadsManagerNav();
    _wireBeneficiosNav();
    if (window.RouletteUI) RouletteUI.ensureRouletteDOM();

    if (canMasterPanel) {
      const mobileBoot = _isMobileBoot();
      landingSection = mobileBoot && !_explicitLanding ? 'secInicio' : 'secDashboard';
      _bootShowLanding(landingSection);
      const deferredTasks = [
        renderTeamBillingChart(),
        renderMasterPanel(),
        typeof renderMeetingsAdmin === 'function' ? renderMeetingsAdmin() : Promise.resolve(),
        renderBalanceHistory(),
        populateBalanceSelect(),
        renderProductsTable(),
        renderOrdersTable(),
      ];
      if (canSupervisorPanel) deferredTasks.push(renderFeedbackSection());
      if (canSaques) deferredTasks.push(renderWithdrawalsTable());
      if (mobileBoot) {
        /* Mobile: só a landing; dashboard/ranking/funcionários sob demanda */
        if (landingSection === 'secDashboard') {
          await _bootRace(renderDashboard(), 45000, 'Dashboard').catch(e => console.warn('[dashboard boot]', e));
        } else if (landingSection === 'secManageProposals' && window.Proposals) {
          await Proposals.renderAdminList().catch(e => console.warn('[proposals boot]', e));
        } else if (landingSection === 'secManageTickets' && window.Tickets) {
          try { Tickets.init(); } catch (_) { /* noop */ }
        }
        void _bootSettle(deferredTasks, 45000);
      } else {
        const criticalTasks = [
          _bootRace(renderDashboard(), 45000, 'Dashboard'),
          employeesManagedInRhHub() ? Promise.resolve() : _bootRace(renderEmployeesTable(), 45000, 'Funcionários'),
          _bootRace(renderAdminRanking(), 30000, 'Ranking'),
        ];
        await _bootSettle(criticalTasks, 50000);
        void _bootSettle(deferredTasks, 45000);
      }
      try { updatePendingBadge(); } catch (_) { /* noop */ }
      try { if (typeof updateMeetingsBadge === 'function') updateMeetingsBadge(); } catch (_) { /* noop */ }
      if (canSaques) { try { updateWithdrawalsBadge(); } catch (_) { /* noop */ } }
      _startAdminLiveRefresh();

    } else if (IS_PARCEIRO || IS_PARTNER_STAFF) {
      const _staffRole = s.role;
      const _canPropPartner = partnerOrgCan('visualizar_propostas') || partnerOrgCan('cadastrar_proposta');
      if (IS_PARCEIRO) {
        landingSection = _canPropPartner ? 'secManageProposals'
          : (canManagePartnerTeam() ? 'secEmployees' : (canChamados ? 'secManageTickets' : 'secMyProfile'));
      } else if (_canPropPartner) {
        landingSection = 'secManageProposals';
      } else if (canChamados) {
        landingSection = 'secManageTickets';
      } else if (CAN_EMPLOYEES_PANEL) {
        landingSection = 'secEmployees';
      } else {
        landingSection = 'secMyProfile';
      }
      const bootTasks = [];
      if (CAN_EMPLOYEES_PANEL) bootTasks.push(renderEmployeesTable());
      if (landingSection === 'secDashboard') {
        bootTasks.push(renderDashboard().catch(e => console.warn('[dashboard boot]', e)));
      }
      if (landingSection === 'secManageProposals' && window.Proposals) {
        bootTasks.push(Proposals.renderAdminList().catch(e => console.warn('[proposals boot]', e)));
      }
      if (landingSection === 'secManageTickets' && window.Tickets) {
        bootTasks.push(Promise.resolve().then(() => { try { Tickets.init(); } catch (_) { /* noop */ } }));
      }
      await _bootSettle(bootTasks);

    } else if (IS_SUPERVISOR || IS_OUVIDORIA) {
      landingSection = (IS_SUPERVISOR && !IS_SUP_BACKOFFICE) || (IS_SUP_BACKOFFICE && canProposta) ? 'secManageProposals' : 'secMeetings';
      const mobileBoot = _isMobileBoot();
      const bootTasks = [];
      if (!mobileBoot && typeof renderMeetingsAdmin === 'function') bootTasks.push(renderMeetingsAdmin());
      if (!mobileBoot && CAN_EMPLOYEES_PANEL) bootTasks.unshift(renderEmployeesTable());
      if (landingSection === 'secManageProposals' && window.Proposals) {
        bootTasks.push(Proposals.renderAdminList().catch(e => console.warn('[proposals boot]', e)));
      }
      if (!mobileBoot && canTeamBillingChart) {
        bootTasks.push(renderDashboard().catch(e => console.warn('[dashboard boot]', e)));
        bootTasks.push(renderTeamBillingChart().catch(e => console.warn('[team billing boot]', e)));
      }
      if (!mobileBoot && canRanking) {
        bootTasks.push(renderAdminRanking().catch(e => console.warn('[ranking boot]', e)));
      }
      await _bootSettle(bootTasks);
      try { if (typeof updateMeetingsBadge === 'function') updateMeetingsBadge(); } catch (_) { /* noop */ }

    } else if (IS_BACKOFFICE) {
      landingSection = 'secManageProposals';
      if (window.Proposals) await Proposals.renderAdminList().catch(e => console.warn('[proposals boot]', e));
      try { if (typeof updateMeetingsBadge === 'function') updateMeetingsBadge(); } catch (_) { /* noop */ }

    } else if (IS_OPERACIONAL) {
      landingSection = 'secManageProposals';
      if (window.Proposals) await Proposals.renderAdminList().catch(e => console.warn('[proposals boot]', e));
      try { if (typeof updateMeetingsBadge === 'function') updateMeetingsBadge(); } catch (_) { /* noop */ }

    } else if (IS_VENDEDOR_ADM) {
      landingSection = 'secManageProposals';
      await _bootSettle([renderEmployeesTable(), window.Proposals ? Proposals.renderAdminList() : Promise.resolve()]);

    } else if (IS_PORTARIA) {
      landingSection = 'secInicio';
      await _bootSettle([
        window.Tickets ? Promise.resolve().then(() => { try { Tickets.init(); } catch (_) { /* noop */ } }) : Promise.resolve(),
      ]);

    } else {
      landingSection = employeesManagedInRhHub() ? 'secDashboard' : 'secEmployees';
      _bootShowLanding(landingSection);
      const _tailTasks = [employeesManagedInRhHub() ? Promise.resolve() : renderEmployeesTable()];
      if (landingSection === 'secDashboard') _tailTasks.push(renderDashboard().catch(e => console.warn('[dashboard boot]', e)));
      await _bootSettle(_tailTasks);
    }

    try {
      await ensureScript('../js/roulette-ui.js');
      if (window.RouletteUI?.renderRoulettePage) {
        await RouletteUI.renderRoulettePage().catch(() => {});
      }
    } catch (_) { /* roleta opcional — não bloqueia boot */ }
    if (window.BolaoCopa) {
      try {
        BolaoCopa.ensureDom();
        await BolaoCopa.applyNavVisibility();
        if (IS_PORTARIA) _applyPortariaNavExtras();
      } catch (e) { console.warn('[admin boot] BolaoCopa', e); }
    }

    document.querySelectorAll('[data-section]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const sec = btn.dataset.section;
        try {
          await ensureSectionScripts(sec);
        } catch (e) {
          console.warn('[section lazy]', sec, e);
          if (typeof showToast === 'function') showToast('Não foi possível carregar este módulo.', 'error');
          return;
        }
        if (sec === 'secWhatsApp') {
          try {
            await ensureScript('../js/whatsapp-chat.js');
            if (window.WhatsAppChat?.init) await WhatsAppChat.init();
          } catch (e) {
            console.warn('[wa lazy]', e);
            if (typeof showToast === 'function') showToast('Não foi possível carregar o WhatsApp.', 'error');
          }
        }
        if (sec === 'secMarketplaceBlu' || sec === 'secMarketplaceManage' || sec === 'secMarketplaceOrders') {
          try { await ensureScript('../js/marketplace-blu.js'); } catch (e) { console.warn('[mkt lazy]', e); }
        }
        if (sec==='secInicio' && window.PainelSonhos) await PainelSonhos.render('painelSonhosRoot');
        if (sec==='secBolaoCopa' && window.BolaoCopa) await BolaoCopa.render();
        if (sec==='secEmployees') {
          if (!CAN_EMPLOYEES_PANEL) return;
          if (employeesManagedInRhHub()) {
            goToRhFuncionarios();
            return;
          }
          if ((IS_MASTER || IS_FUNDA) && !window._keepPartnerTeamOverride) {
            _empPartnerRootOverride = null;
            const empSub = document.getElementById('empPageSubtitle');
            if (empSub) empSub.textContent = 'Cadastro e gestão da equipe';
          }
          window._keepPartnerTeamOverride = false;
          await renderEmployeesTable();
        }
        if (sec==='secProducts')    await renderProductsTable();
        if (sec==='secOrders')      await renderOrdersTable();
        if (sec==='secWithdrawals') await renderWithdrawalsTable();
        if (sec==='secDashboard')   {
          await renderDashboard();
          if (_canViewTeamBillingChart()) {
            await renderTeamBillingChart();
          }
        }
        if (sec==='secRanking') {
          if (!window.__ADMIN_NAV_CFG__?.canRanking) return;
          if (typeof SalesRanking !== 'undefined' && SalesRanking.invalidateCache) SalesRanking.invalidateCache();
          await renderAdminRanking();
          return;
        }
        if (sec==='secReport') return;
        if (sec==='secFeedback') { await renderFeedbackSection(); }
        if (sec==='secBalance')     { await populateBalanceSelect(); await renderBalanceHistory(); }
        if (sec==='secMaster')      await renderMasterPanel();
        if (sec==='secPartners') {
          if (window.Partners?.render || window.Partners?.init) {
            try { await (window.Partners.render?.() || window.Partners.init?.()); } catch (_) { /* noop */ }
          }
          return;
        }
        if (sec==='secMyProfile') {
          showLoading('Carregando perfil…');
          try { await renderMyProfile(); } finally { hideLoading(); }
        }
        if (sec==='secClients')     await renderClientsTable();
        if (sec==='secGestaoBeneficios' && window.BeneficiosAdmin?.init) await BeneficiosAdmin.init();
        if (sec==='secClubeBeneficios' && window.BeneficiosClube?.init) await BeneficiosClube.init();
        if (sec==='secCreateProposal') { if(window.masterProposalManager) window.masterProposalManager.init(); }
        if (sec==='secManageProposals') { if(window.Proposals) await Proposals.renderAdminList(); }
        if (sec==='secPartnerOps') { if (window.PartnerOps) await PartnerOps.renderPanel(); }
        if (sec==='secSimulacao') { if (window.SimulacaoTroco) SimulacaoTroco.init(); }
        if (sec==='secManageTickets')   { if(window.Tickets) await Tickets.renderAdminList(); }
        if (sec==='secMeetings')       { if (typeof renderMeetingsAdmin === 'function') await renderMeetingsAdmin(); }
        if (sec==='secStore')          { if (typeof renderAdminPrizeStore === 'function') await renderAdminPrizeStore(); }
        if (sec==='secRoleta' && window.RouletteUI) await RouletteUI.renderRoulettePage();
        if (sec==='secTimIndicacao' && window.Tim) await Tim.renderIndicacao();
        if (sec==='secTimEsteira' && window.Tim) await Tim.renderEsteira();
        if (sec==='secContestacao' && window.Contestacao) await Contestacao.render();
        if (sec==='secFiscalParceiro' && window.FiscalParceiro) await FiscalParceiro.render();
        if (sec==='secTrainings' && window.Trainings) await Trainings.renderEmployee();
        if (sec==='secTrainingsManage' && window.Trainings) await Trainings.renderAdminManage();
        if (sec==='secTrainingsRh' && window.Trainings) await Trainings.renderRhReport();
        if (sec==='secMarketplaceBlu' && window.MarketplaceBlu) await MarketplaceBlu.renderShop();
        if (sec==='secMarketplaceManage' && window.MarketplaceBlu) await MarketplaceBlu.renderCatalogAdmin();
        if (sec==='secMarketplaceOrders' && window.MarketplaceBlu) await MarketplaceBlu.renderOrdersAdmin();
        if (sec==='secFornecedorFinanceiro' && window.FornecedorFinanceiro) await FornecedorFinanceiro.render();
        if (sec==='secContaCorrente' && window.ContaCorrente) await ContaCorrente.render();
        if (sec==='secContaCorrenteGestao' && window.ContaCorrente) await ContaCorrente.renderGestao();
      });
    });

    if (window.Tim && typeof Tim.init === 'function') Tim.init();
    if (window.Contestacao && typeof Contestacao.init === 'function') Contestacao.init();
    if (typeof wireNavButton === 'function') {
      document.querySelectorAll('[data-section]:not([data-nav-wired-ui])').forEach(wireNavButton);
    }
    if (window.FiscalParceiro && typeof FiscalParceiro.init === 'function') FiscalParceiro.init();
    if (window.Trainings && typeof Trainings.init === 'function') Trainings.init();
    if (window.MarketplaceBlu && typeof MarketplaceBlu.init === 'function') MarketplaceBlu.init();
    if (window.FornecedorFinanceiro && typeof FornecedorFinanceiro.init === 'function') FornecedorFinanceiro.init();
    if (window.ContaCorrente && typeof ContaCorrente.init === 'function') ContaCorrente.init();
    if (window.WhatsAppChat && typeof WhatsAppChat.applyNavVisibility === 'function') WhatsAppChat.applyNavVisibility();
    if (window.Trainings) {
      try { await Trainings.updateBadge(); } catch (_) { /* noop */ }
      try { await Trainings.checkPendingOnLogin(); } catch (_) { /* noop */ }
    }

    document.getElementById('addBalanceForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const empId  = document.getElementById('balanceEmployee').value;
      const op     = document.getElementById('balanceOperation').value;
      const rawAmt = document.getElementById('balanceAmount').value;
      const amt = _parseBalanceFormAmount(op, rawAmt, false);
      const reason = document.getElementById('balanceReason').value.trim();
      if (!empId || !reason) { showToast('Preencha todos os campos.', 'warning'); return; }
      const valMsg = _balanceAmountValidationMessage(op, amt, false);
      if (valMsg) { showToast(valMsg, 'warning'); return; }

      const emp = await DB.getUser(empId);
      if (!emp) { showToast('Funcionário não encontrado.', 'error'); return; }
      if (typeof isUserInPartnerNetworkSync === 'function' && isUserInPartnerNetworkSync(emp)) {
        showToast('Rede parceira usa saldo em R$. Use RH → Cadastrar Parceiro → Distribuir saldo.', 'warning');
        return;
      }
      if (IS_SUPERVISOR || PARTNER_ROOT_ID) { showToast('Sem permissão para alterar saldo.', 'error'); return; }
      if (!IS_MASTER && !IS_FINANCIAL && !IS_GERENTE && !IS_RH && emp.admin_id !== ADMIN_ID) {
        showToast('Acesso negado.', 'error');
        return;
      }

      showLoading('Atualizando saldo...');
      try {
        const nb = await applyBalanceAdjustment(empId, op, amt, reason, { screen: 'gerenciar_saldo' });
        invalidateSouBluCaches();
        document.getElementById('addBalanceForm').reset();
        syncBalanceAmountByOperation();
        await Promise.all([
          renderBalanceHistory(),
          renderEmployeesTable(),
          renderDashboard(),
          populateBalanceSelect(),
          renderMasterPanel(),
        ]);
        showToast(`${emp.name}: ${formatCurrency(nb, emp)}`, 'success');
      } catch (err) {
        showToast(err.message || 'Erro ao atualizar saldo.', 'error');
      } finally { hideLoading(); }
    });

    document.getElementById('partnerBalanceForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      if (!IS_MASTER && !IS_FUNDA && !IS_FINANCIAL && !IS_RH) {
        showToast('Sem permissão para distribuir saldo.', 'error');
        return;
      }
      const partnerRootId = document.getElementById('partnerBalanceRootId')?.value;
      const op = document.getElementById('partnerBalanceOperation')?.value;
      const rawAmt = document.getElementById('partnerBalanceAmount')?.value;
      const reason = document.getElementById('partnerBalanceReason')?.value?.trim();
      const amt = _parseBalanceFormAmount(op, rawAmt, true);
      const gestor = partnerRootId ? await _partnerBalanceGestorRow(partnerRootId) : null;
      const empId = gestor?.id;
      if (!partnerRootId || !empId || !reason) {
        showToast('Preencha todos os campos.', 'warning');
        return;
      }
      const valMsg = _balanceAmountValidationMessage(op, amt, true);
      if (valMsg) { showToast(valMsg, 'warning'); return; }

      showLoading('Distribuindo saldo...');
      try {
        const emp = gestor || await DB.getUser(empId);
        const nb = await applyBalanceAdjustment(empId, op, amt, reason, {
          screen: 'distribuir_saldo_parceiro',
          partner_root_id: partnerRootId,
        });
        invalidateSouBluCaches();
        document.getElementById('partnerBalanceReason').value = '';
        document.getElementById('partnerBalanceAmount').value = '';
        await Promise.all([
          populatePartnerBalanceSelect(partnerRootId),
          renderPartnerBalanceTeamList(partnerRootId),
          renderPartnerBalanceHistory(partnerRootId),
          renderPartnersPanel(),
        ]);
        showToast(`Gestor ${emp?.name || 'parceiro'}: ${formatCurrency(nb, emp)}`, 'success');
      } catch (err) {
        console.error('[partnerBalanceForm]', err);
        showToast(err.message || 'Erro ao distribuir saldo.', 'error');
      } finally { hideLoading(); }
    });

    wireBalanceOperationField();
  } catch(e) {
    if (e.message==='AUTH_REDIRECT') return;
    console.error('[SOU+BLU Boot Error]', e);
    const bootMsg = String(e.message || 'falha ao carregar');
    showToast(`Erro: ${bootMsg}`, 'error', 8000);
    if (document.getElementById('secDashboard')?.classList.contains('active')) {
      const stats = document.getElementById('dashStats');
      if (stats) stats.innerHTML = _dashRetryHtml(bootMsg);
    }
  } finally {
    if (window.__ADMIN_NAV_CFG__) {
      _applyAdminNavVisibility(window.__ADMIN_NAV_CFG__);
      if (IS_PORTARIA) _applyPortariaNavExtras();
    }
    if (Auth.getSession() && typeof navigateTo === 'function') {
      const _sess = Auth.getSession();
      if (landingSection === 'secRanking' && !window.__ADMIN_NAV_CFG__?.canRanking) {
        const _cfg = window.__ADMIN_NAV_CFG__ || {};
        landingSection = _cfg._inPartnerOrg
          ? (_cfg.canPartnerDashboard ? 'secDashboard' : (_cfg.canProposta ? 'secManageProposals' : 'secMyProfile'))
          : 'secInicio';
      }
      if (!_explicitLanding && window.PainelSonhos && PainelSonhos.shouldLandOnInicio(_sess?.role, {
        partnerOrg: !!PARTNER_ROOT_ID,
        partnerLanding: !!PARTNER_ROOT_ID,
        canMasterPanel: !!window.__ADMIN_NAV_CFG__?.canMasterPanel,
        canPartnerDashboard: !!window.__ADMIN_NAV_CFG__?.canPartnerDashboard,
      })) {
        landingSection = 'secInicio';
      }
      if (landingSection === 'secContestacao' && window.Contestacao) {
        try {
          Contestacao.ensureUi();
          await Contestacao.render();
        } catch (e) { console.warn('[contestacao boot]', e); }
      }
      if (!document.querySelector('.section.active')) {
        _bootShowLanding(landingSection || 'secInicio');
      } else {
        _bootShowLanding(landingSection);
      }
      if (landingSection === 'secInicio' && window.PainelSonhos) {
        try {
          const root = document.getElementById('painelSonhosRoot');
          if (root && !root.innerHTML.trim()) {
            root.innerHTML = '<div class="card card-padded text-center text-muted" style="padding:32px;">Carregando painel…</div>';
          }
          await Promise.race([
            PainelSonhos.render('painelSonhosRoot'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('painel timeout')), 15000)),
          ]);
        } catch (e) {
          console.warn('[inicio boot]', e);
          const root = document.getElementById('painelSonhosRoot');
          if (root && !root.querySelector('.painel-sonhos-wrap')) {
            root.innerHTML = '<div class="card card-padded text-center"><p class="text-muted">Não foi possível carregar o painel agora.</p><button type="button" class="btn btn-primary btn-sm" onclick="PainelSonhos && PainelSonhos.render(\'painelSonhosRoot\')">Tentar novamente</button></div>';
          }
        }
      }
      if (landingSection === 'secDashboard') {
        try {
          const dash = document.getElementById('secDashboard');
          const stats = document.getElementById('dashStats');
          if (dash && (!stats || !stats.innerHTML.trim())) {
            await _bootRace(renderDashboard(), 45000, 'Dashboard');
          }
          if (stats && !stats.innerHTML.trim()) {
            stats.innerHTML = _dashRetryHtml('O resumo não carregou. Verifique a conexão com o servidor.');
          }
        } catch (e) {
          console.warn('[dashboard finally]', e);
          const stats = document.getElementById('dashStats');
          if (stats && !stats.innerHTML.trim()) {
            stats.innerHTML = _dashRetryHtml(String(e.message || 'Falha ao carregar dashboard'));
          }
        }
      }
      if (landingSection === 'secManageTickets' && window.Tickets) {
        try { await Tickets.renderAdminList(); } catch (e) { console.warn('[tickets boot]', e); }
      }
    }
    hideLoading();
  }
});

/* ══════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════ */
async function _ordersForRole() {
  if (IS_MASTER || IS_GERENTE || IS_FINANCIAL || IS_RH || IS_DIRETORIA) return DB.getOrders();
  if (IS_DESENVOLVEDOR) {
    return DB.getOrdersByDepartment(ADMIN_ID, window.USER_DEPT || 'Desenvolvimento');
  }
  return DB.getOrdersByAdmin(ADMIN_ID);
}

async function _transactionsForRole() {
  if (IS_MASTER || IS_GERENTE || IS_FINANCIAL || IS_RH || IS_DIRETORIA) return DB.getTransactions();
  if (IS_DESENVOLVEDOR) {
    return DB.getTransactionsByDepartment(ADMIN_ID, window.USER_DEPT || 'Desenvolvimento');
  }
  return DB.getTransactionsByAdmin(ADMIN_ID);
}

/** Mesmo conjunto de IDs em dashboard, pedidos, pontos e perfil (sempre inclui o usuário logado). */
async function _scopedUserIds() {
  if (_hasCompanyWideDashboard() || IS_MASTER || IS_GERENTE || IS_FINANCIAL || IS_RH || IS_DIRETORIA || IS_FUNDA) {
    const all = await DB.getAllUsers().catch(() => []);
    const internal = typeof filterSouBluInternalUsers === 'function'
      ? filterSouBluInternalUsers(all)
      : all;
    return new Set(internal.map(u => u.id));
  }
  if (IS_DESENVOLVEDOR) {
    return await DB.getDepartmentTeamIds(ADMIN_ID, window.USER_DEPT || 'Desenvolvimento');
  }
  if (PARTNER_ROOT_ID) {
    const team = await DB.getPartnerTeam(PARTNER_ROOT_ID).catch(() => []);
    const ids = new Set(team.map(e => e.id));
    ids.add(PARTNER_ROOT_ID);
    return ids;
  }
  if (IS_SUPERVISOR || IS_SUP_BACKOFFICE) {
    if (_isCommercialSupervisor()) {
      const emps = await _getMergedTeamEmployees();
      const ids = new Set(emps.map((e) => e.id));
      const peerIds = await _resolveMergedSupervisorAdminIds(ADMIN_ID, Auth.getSession()?.name);
      peerIds.forEach((id) => ids.add(id));
      if (ADMIN_ID) ids.add(ADMIN_ID);
      return ids;
    }
    const emps = await DB.getEmployeesByAdmin(ADMIN_ID).catch(() => []);
    const ids = new Set(emps.map(e => e.id));
    if (ADMIN_ID) ids.add(ADMIN_ID);
    return ids;
  }
  if (IS_BACKOFFICE || IS_OPERACIONAL || IS_VENDEDOR_ADM) {
    const ids = new Set();
    if (ADMIN_ID) ids.add(ADMIN_ID);
    return ids;
  }
  const emps = await DB.getEmployeesByAdmin(ADMIN_ID).catch(() => []);
  const ids = new Set(emps.map(e => e.id));
  if (ADMIN_ID) ids.add(ADMIN_ID);
  return ids;
}

async function _employeesForRole() {
  if (_hasCompanyWideDashboard() || IS_MASTER || IS_FINANCIAL || IS_RH) return DB.getAllEmployees();
  if (IS_DESENVOLVEDOR) {
    const dept = window.USER_DEPT || 'Desenvolvimento';
    const all = await DB.getAllEmployees();
    return all.filter(e => e.role === 'desenvolvedor' || e.department === dept);
  }
  if (PARTNER_ROOT_ID) return DB.getPartnerTeam(PARTNER_ROOT_ID);
  if (_isCommercialSupervisor()) return _getMergedTeamEmployees();
  if (IS_SUPERVISOR) return DB.getEmployeesByAdmin(ADMIN_ID);
  return DB.getEmployeesByAdmin(ADMIN_ID);
}

let _dashRenderInflight = null;

async function renderDashboard() {
  if (_dashRenderInflight) return _dashRenderInflight;
  _dashRenderInflight = _renderDashboardBody();
  try {
    return await _dashRenderInflight;
  } finally {
    _dashRenderInflight = null;
  }
}

async function _renderDashboardBody() {
  const _fillDashErr = (msg) => {
    const html = _dashRetryHtml(msg);
    const _ds = document.getElementById('dashStats');
    if (_ds) _ds.innerHTML = html;
    const _dr = document.getElementById('dashRanking');
    if (_dr) _dr.innerHTML = '<div class="text-muted text-center" style="padding:20px;">Indisponível.</div>';
  };
  _ensureDashPlaceholder('Carregando dashboard…');
  try {
  const _fullOrg = _hasCompanyWideDashboard()
    || (IS_MASTER || IS_GERENTE || IS_FINANCIAL || IS_RH || IS_DIRETORIA || IS_FUNDA);
  const _isMasterLike = _fullOrg || IS_DESENVOLVEDOR;
  // #region agent log
  fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'post-fix',hypothesisId:'H2-H3',location:'admin.js:dash-start',message:'renderDashboard scope flags',data:{_fullOrg:!!_fullOrg,companyWide:!!_hasCompanyWideDashboard(),IS_SUP_BACKOFFICE:!!IS_SUP_BACKOFFICE,canMasterPanel:!!window.__ADMIN_NAV_CFG__?.canMasterPanel},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  const _globalCatalog =
    _isMasterLike ||
    IS_SUPERVISOR || PARTNER_ROOT_ID || IS_BACKOFFICE || IS_OPERACIONAL || IS_SUP_BACKOFFICE || IS_VENDEDOR_ADM;

  let scopedIds;
  let allUsersPts = null;
  if (_fullOrg) {
    if (Array.isArray(_allUsersCache) && _allUsersCache.length) {
      allUsersPts = _allUsersCache;
    } else {
      allUsersPts = await _bootRace(DB.getAllUsers(), 35000, 'Lista de usuários').catch(() => []);
      if (Array.isArray(allUsersPts) && allUsersPts.length) _allUsersCache = allUsersPts;
    }
    const internalUsers = typeof filterSouBluInternalUsers === 'function'
      ? filterSouBluInternalUsers(allUsersPts)
      : (allUsersPts || []);
    scopedIds = new Set(internalUsers.map((u) => u.id));
  } else {
    scopedIds = await _scopedUserIds();
  }

  let emps, orders, txs, prods;
  const prodProm = _globalCatalog ? DB.getCatalogProducts() : DB.getProducts(ADMIN_ID);

  let allProps = [];
  if (_fullOrg) {
    const [rEmps, rOrders, rTxs, rProds, rProps] = await Promise.allSettled([
      DB.getAllEmployees(),
      _ordersForRole(),
      _transactionsForRole(),
      prodProm,
      _loadBillingProposals(true),
    ]);
    emps = rEmps.status === 'fulfilled' ? (rEmps.value || []) : [];
    orders = rOrders.status === 'fulfilled' ? (rOrders.value || []) : [];
    txs = rTxs.status === 'fulfilled' ? (rTxs.value || []) : [];
    prods = rProds.status === 'fulfilled' ? (rProds.value || []) : [];
    allProps = rProps.status === 'fulfilled' ? (rProps.value || []) : [];
    if (rProps.status === 'rejected') console.warn('[dashboard] propostas:', rProps.reason);
    _allProposalsCache = allProps;
    window._dashProposalsCache = allProps;
    window._dashBillingFilter = _teamBillingFilter;
    window._dashBillingStatusFilter = _teamBillingStatusFilter;
  } else if (IS_DESENVOLVEDOR) {
    [emps, orders, txs, prods] = await Promise.all([
      _employeesForRole(),
      _ordersForRole(),
      _transactionsForRole(),
      prodProm,
    ]);
  } else if (IS_SUPERVISOR || PARTNER_ROOT_ID) {
    [emps, orders, txs, prods] = await Promise.all([
      _employeesForRole(),
      _ordersForRole(),
      _transactionsForRole(),
      prodProm,
    ]);
    if (_isCommercialSupervisor()) {
      const teamIds = await _getMergedTeamScopeIds();
      const teamSet = new Set(teamIds.map(String));
      if (!_allUsersCache?.length) _allUsersCache = await DB.getAllUsers().catch(() => []);
      const usersByVendorName = typeof _buildUsersByVendorName === 'function'
        ? _buildUsersByVendorName(_allUsersCache || [])
        : new Map();
      const rawProps = typeof DB._fetchProposalsForVendorIds === 'function'
        ? await DB._fetchProposalsForVendorIds(teamIds).catch(() => [])
        : (typeof DB.listProposalsLite === 'function'
          ? await DB.listProposalsLite({ all: true }).catch(() => [])
          : []);
      allProps = (rawProps || []).filter((p) => {
        const vid = typeof _resolveProposalVendorId === 'function'
          ? _resolveProposalVendorId(p, usersByVendorName)
          : String(p.vendorId || p.vendor_id || p.employee_id || '');
        return vid && teamSet.has(String(vid));
      });
      _allProposalsCache = allProps;
    }
  } else {
    [emps, orders, txs, prods] = await Promise.all([
      _employeesForRole(),
      _ordersForRole(),
      _transactionsForRole(),
      prodProm,
    ]);
  }

  orders = (orders || []).filter(o => scopedIds.has(o.employee_id));
  txs = (txs || []).filter(t => scopedIds.has(t.employee_id));

  emps = emps || [];
  orders = orders || [];
  txs = txs || [];
  prods = prods || [];
  // #region agent log
  fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'post-fix',hypothesisId:'H2-H3',location:'admin.js:dash-data',message:'renderDashboard loaded counts',data:{scopedIdsSize:scopedIds?.size||0,empsLen:emps.length,allPropsLen:(allProps||[]).length,ordersLen:orders.length,prodsLen:prods.length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  const totalD = txs.filter(t => t.type === 'credit').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const ptsPool = (_fullOrg ? (allUsersPts || []) : emps)
    .filter(e => e.active !== false && scopedIds.has(e.id));
  const totalB = ptsPool
    .filter(e => typeof isUserInPartnerNetworkSync !== 'function' || !isUserInPartnerNetworkSync(e))
    .reduce((s, e) => s + userPts(e), 0);
  if (IS_DESENVOLVEDOR && ptsPool.length === 1 && ptsPool[0]?.id === ADMIN_ID) {
    const meFresh = await DB.getUser(ADMIN_ID).catch(() => null);
    if (meFresh) ptsPool[0] = meFresh;
  }
  const empStatLabel =
    _fullOrg ? 'Total Funcionários'
      : PARTNER_ROOT_ID ? 'Equipe do parceiro'
      : IS_DESENVOLVEDOR ? 'Time Desenvolvimento' : 'Minha Equipe';

  if (_isPartnerOrgUser()) {
    const card = document.getElementById('teamBillingCard');
    if (card) card.style.display = 'none';
  }

  const _ds = document.getElementById('dashStats');

  if (PARTNER_ROOT_ID) {
    const [rawProps, rawClients] = await Promise.all([
      DB.getProposals(null, null, { partnerRootId: PARTNER_ROOT_ID }).catch(() => []),
      DB.getClients({ partnerRootId: PARTNER_ROOT_ID, pageSize: 500 }).catch(() => []),
    ]);
    const stats = _partnerOrgStats(
      PARTNER_ROOT_ID,
      emps,
      Array.isArray(rawProps) ? rawProps : [],
      Array.isArray(rawClients) ? rawClients : [],
    );
    const fmtR = v => 'R$ ' + parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    if (_ds) {
      _ds.innerHTML = [
        statCardHtml({ icon: 'users', color: 'blue', label: empStatLabel, value: stats.activeTeam.length, sub: `${stats.team.length} cadastrados` }),
        statCardHtml({ icon: 'clients', color: 'green', label: 'Clientes', value: stats.clients.length, sub: 'da sua organização' }),
        statCardHtml({ icon: 'proposals', color: 'orange', label: 'Propostas', value: stats.proposals.length, sub: `${stats.countOpen} em aberto` }),
        statCardHtml({ icon: 'billing', color: 'yellow', label: 'Faturamento (mês)', value: fmtR(stats.monthBilling), sub: `${stats.countPaid} pagas no total`, valueStyle: 'font-size:17px;' }),
      ].join('');
    }

    const _dr = document.getElementById('dashRanking');
    if (_dr) {
      const h3 = _dr.closest('.card')?.querySelector('h3');
      if (h3) h3.textContent = ' Equipe do parceiro';
      const sub = _dr.closest('.card')?.querySelector('p');
      if (sub) sub.textContent = 'Vendedores e backoffice';
      _dr.innerHTML = !stats.activeTeam.length
        ? '<div class="text-muted text-center" style="padding:20px;">Cadastre a equipe em Funcionários.</div>'
        : stats.activeTeam.map(e => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--color-border);">
            ${avatarHtml(e.name, 'avatar-sm', e.photo_url || '')}
            <div style="flex:1;"><div style="font-weight:700;font-size:13px;">${e.name}</div><div style="font-size:11px;color:var(--color-text-muted);">${_PARTNER_ROLE_LABELS[e.role] || e.role}</div></div></div>`).join('');
    }

    return;
  }

  if (!_ds) {
    _fillDashErr('Resumo indisponível nesta tela.');
    return;
  }

  const fmtR = v => 'R$ ' + parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const dashStatusKey = _teamBillingStatusFilter || 'total';
  const propAmtDash = (p) => (typeof DB.proposalChartBillingAmount === 'function'
    ? DB.proposalChartBillingAmount(p, dashStatusKey)
    : (typeof DB.proposalAmount === 'function' ? DB.proposalAmount(p) : 0));
  const propBrutoDash = (p) => (typeof DB.proposalGrossAmount === 'function' ? DB.proposalGrossAmount(p) : propAmtDash(p));
  const alignWithBillingChart = _canViewTeamBillingChart();
  const dashBillingProps = alignWithBillingChart
    ? _filterPropsForTeamBilling(allProps || [], _teamBillingFilter, _teamBillingStatusFilter)
    : (allProps || []).filter((p) => (typeof DB.isPaidProposal === 'function' ? DB.isPaidProposal(p) : false));
  const dashPropCount = alignWithBillingChart ? dashBillingProps.length : (allProps || []).length;
  const dashBillingTotal = dashBillingProps.reduce((s, p) => s + propAmtDash(p), 0);
  const dashBillingTotalBruto = dashBillingProps.reduce((s, p) => s + propBrutoDash(p), 0);
  window._dashBillingTotal = dashBillingTotal;
  window._dashBillingTotalBruto = dashBillingTotalBruto;
  window._dashPropCount = dashPropCount;
  const dashBillingSub = alignWithBillingChart
    ? (dashStatusKey === 'pagas'
      ? `Bruto: ${fmtR(dashBillingTotalBruto)} · mesmo período do gráfico`
      : 'valor bruto · mesmo período do gráfico')
    : `${dashBillingProps.filter((p) => propAmtDash(p) > 0).length} pagas com valor`;
  const dashBillingLabel = alignWithBillingChart
    ? (dashStatusKey === 'pagas'
      ? 'Faturamento Pago (final)'
      : (_TEAM_BILLING_STATUS_LABELS[dashStatusKey] || 'Faturamento Bruto'))
    : 'Faturamento (Pagas)';

  _ds.innerHTML = [
    statCardHtml({ icon: 'users', color: 'blue', label: empStatLabel, value: emps.filter(e => e.active !== false).length, sub: `${emps.length} cadastrados` }),
    statCardHtml({ icon: 'balance', color: 'green', label: 'Saldos Ativos', value: formatCurrency(totalB), sub: `${formatCurrency(totalD)} distribuídos`, valueStyle: 'font-size:20px;' }),
    statCardHtml({ icon: 'proposals', color: 'purple', label: 'Propostas', value: dashPropCount, sub: alignWithBillingChart ? 'período do gráfico' : `${dashBillingProps.filter((p) => propAmtDash(p) > 0).length} pagas com valor` }),
    statCardHtml({ icon: 'billing', color: 'teal', label: dashBillingLabel, value: fmtR(dashBillingTotal), sub: dashBillingSub, valueStyle: 'font-size:18px;' }),
    statCardHtml({ icon: 'products', color: 'orange', label: 'Produtos', value: prods.filter(p => p.active !== false).length, sub: `${prods.filter(p => p.stock === 0).length} sem estoque` }),
    statCardHtml({ icon: 'orders', color: 'yellow', label: 'Pedidos', value: orders.length, sub: `${orders.filter(o => o.status === 'pendente').length} pendentes` }),
  ].join('');

  const userNameById = new Map();
  [...(allUsersPts || []), ...emps].forEach(u => { if (u?.id) userNameById.set(u.id, u); });

  const top5 = [...ptsPool].filter(isRankingParticipant).sort((a, b) => userPts(b) - userPts(a)).slice(0, 5);
  const _dr=document.getElementById('dashRanking');
  if (_dr) {
    _dr.innerHTML = !top5.length
      ? '<div class="text-muted text-center" style="padding:20px;">Nenhum funcionário.</div>'
      : top5.map((e,i)=>`
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--color-border);"><span style="font-size:17px;font-weight:900;min-width:26px;color:${['#FFB800','#8c9aa8','#c17f5a'][i]||'var(--color-text-muted)'};">#${i+1}</span>
        ${avatarHtml(e.name,'avatar-sm',e.photo_url||'')}
        <div style="flex:1;"><div style="font-weight:700;font-size:13px;">${e.name}</div><div style="font-size:11px;color:var(--color-text-muted);">${e.department}</div></div></div>`).join('');
  }

  } catch (err) {
    console.warn('[renderDashboard]', err);
    _fillDashErr('Não foi possível carregar o resumo. Atualize a página (Ctrl+F5) ou tente novamente.');
  }
}
window.renderDashboard = renderDashboard;

/* ══════════════════════════════════════════════
   GRÁFICO DE FATURAMENTO POR EQUIPE (master only)
══════════════════════════════════════════════ */
let _teamBillingFilter = 'month';
let _teamBillingStatusFilter = 'total';
let _allProposalsCache = null;
let _allUsersCache     = null;
let _teamBillingChartInstance = null;

/** Carrega todas as propostas para faturamento/gráfico (sem teto de 800). */
async function _loadBillingProposals(force = false) {
  if (force && typeof DB !== 'undefined' && typeof DB._invalidateProposalsCache === 'function') {
    DB._invalidateProposalsCache();
  }
  // Cache legado (versão antiga limitava a 800) — força recarga completa.
  if (!force && _allProposalsCache?.length === 800) {
    force = true;
    if (typeof DB !== 'undefined' && typeof DB._invalidateProposalsCache === 'function') {
      DB._invalidateProposalsCache();
    }
  }
  if (!force && Array.isArray(_allProposalsCache) && _allProposalsCache.length > 0) {
    return _allProposalsCache;
  }
  let rows = [];
  if (typeof DB.listProposalsLite === 'function') {
    if (_isCommercialSupervisor() && typeof DB._fetchProposalsForVendorIds === 'function') {
      const teamIds = await _getMergedTeamScopeIds();
      rows = await DB._fetchProposalsForVendorIds(teamIds).catch(() => []);
    } else {
      rows = await DB.listProposalsLite({ all: true }).catch(() => []);
    }
  } else if (typeof DB.listProposals === 'function') {
    rows = await DB.listProposals().catch(() => []);
  } else if (typeof DB.list === 'function') {
    rows = await DB.list('proposals').catch(() => []);
  }
  _allProposalsCache = rows || [];
  window._dashProposalsCache = _allProposalsCache;
  return _allProposalsCache;
}

async function _ensureChartJs() {
  if (typeof Chart !== 'undefined') return;
  await ensureScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js');
  if (typeof Chart === 'undefined') throw new Error('Chart.js não carregou.');
}

function _teamBillingChartLabel(name) {
  const n = String(name || '—').trim();
  if (n === 'Parceiros') return 'PARCEIROS';
  const grp = _SUPERVISOR_TEAM_MERGE_GROUPS.find((g) => g.label === n);
  if (grp?.shortLabel) return grp.shortLabel;
  if (n.includes('&')) return n.toUpperCase();
  const short = n.split(' ')[0];
  const out = short.length > 12 ? short.slice(0, 11) + '…' : short;
  return out.toUpperCase();
}

function _teamBillingChartAmt(p, statusKey) {
  if (typeof DB.proposalChartBillingAmount === 'function') {
    return DB.proposalChartBillingAmount(p, statusKey);
  }
  if (String(statusKey || 'total').toLowerCase() === 'pagas' && typeof DB.proposalAmount === 'function') {
    return DB.proposalAmount(p);
  }
  return typeof DB.proposalGrossAmount === 'function' ? DB.proposalGrossAmount(p) : 0;
}

function _teamBillingBrutoAmt(p) {
  return typeof DB.proposalGrossAmount === 'function' ? DB.proposalGrossAmount(p) : 0;
}

function _recalcTeamBillingRowTotals(row, statusKey) {
  const props = row.props || [];
  row.count = props.length;
  row.total = props.reduce((s, p) => s + _teamBillingChartAmt(p, statusKey), 0);
  row.totalBruto = props.reduce((s, p) => s + _teamBillingBrutoAmt(p), 0);
  return row;
}

/** _TEAM_BILLING_CHART_PALETTE — cores vivas para gráfico, KPIs e destaques da tabela. */
const _TEAM_BILLING_CHART_PALETTE = ['#2563EB', '#059669', '#7C3AED', '#EA580C', '#0891B2', '#DB2777'];

/**
 * _teamBillingBarFill — cor sólida da barra (sem alpha que deixa o gráfico opaco/desbotado).
 */
function _teamBillingBarFill(hex) {
  return String(hex || '#2563EB');
}

/**
 * _teamBillingChartPalette — retorna N cores da paleta do painel por equipe.
 */
function _teamBillingChartPalette(n) {
  return Array.from({ length: n }, (_, i) => _TEAM_BILLING_CHART_PALETTE[i % _TEAM_BILLING_CHART_PALETTE.length]);
}

/** @deprecated alias — mantido para chamadas antigas */
function _teamBillingGrayPalette(n) {
  return _teamBillingChartPalette(n);
}

/**
 * _teamBillingKpiHtml — card KPI do painel com faixa de cor sutil no topo.
 */
function _teamBillingKpiHtml(label, value, sub, accentIdx) {
  const accent = _TEAM_BILLING_CHART_PALETTE[(accentIdx || 0) % _TEAM_BILLING_CHART_PALETTE.length];
  return `<div class="tb-kpi" style="--tb-kpi-accent:${accent}">
    <div class="tb-kpi__label">${label}</div>
    <div class="tb-kpi__value">${value}</div>
    ${sub ? `<div class="tb-kpi__sub">${sub}</div>` : ''}
  </div>`;
}

/** alias legado */
function _teamBillingKpiBwHtml(label, value, sub) {
  return _teamBillingKpiHtml(label, value, sub, 0);
}

/**
 * _teamBillingVendorProducingCount — vendedores distintos com ao menos 1 proposta na equipe.
 */
function _teamBillingVendorProducingCount(d) {
  const names = new Set();
  (d.props || []).forEach((p) => {
    const n = String(p.vendorName || p.vendor_name || '').trim().toLocaleLowerCase('pt-BR');
    if (n) names.add(n);
  });
  return names.size;
}

/**
 * _teamBillingRowMetrics — ticket médio, produtividade e cobertura da equipe.
 */
function _teamBillingRowMetrics(d) {
  const count = d.count || 0;
  const total = d.total || 0;
  const teamSize = (d.team || []).length;
  const producing = _teamBillingVendorProducingCount(d);
  return {
    ticketMedio: count > 0 ? total / count : 0,
    propsPerVendor: teamSize > 0 ? count / teamSize : count,
    producing,
    coberturaPct: teamSize > 0 ? Math.round((producing / teamSize) * 100) : (count > 0 ? 100 : 0),
  };
}

/**
 * _buildTeamBillingTableHtml — tabela analítica principal (P&B) com métricas por equipe.
 */
function _buildTeamBillingTableHtml(teamData, opts) {
  const { fmtR, grandTotal, grandCount, grandTotalBruto, isPagas, propAmt, propBruto, colors } = opts;
  const colSpan = isPagas ? 11 : 10;
  const avgTicket = grandCount > 0 ? grandTotal / grandCount : 0;
  const totalMembers = teamData.reduce((s, d) => s + (d.team?.length || 0), 0);
  const totalProducing = teamData.reduce((s, d) => s + _teamBillingVendorProducingCount(d), 0);

  const rows = teamData.map((d, i) => {
    const share = grandTotal > 0 ? Math.round((d.total / grandTotal) * 100) : 0;
    const m = _teamBillingRowMetrics(d);
    const supSub = d.sup._mergedFrom?.length
      ? `Supervisores: ${d.sup._mergedFrom.join(' · ')} · ${d.team.length} funcionário(s)`
      : `${d.team.length} funcionário(s)`;
    const detailHtml = _buildTeamBillingDetailHtml(d, null, fmtR, isPagas, propAmt, propBruto);
    const propsPerVend = m.propsPerVendor;
    const propsPerVendStr = propsPerVend % 1 === 0
      ? String(propsPerVend)
      : propsPerVend.toFixed(1).replace('.', ',');
    const accent = (colors || _TEAM_BILLING_CHART_PALETTE)[i % _TEAM_BILLING_CHART_PALETTE.length];
    return `
      <tr id="trow_${i}" style="--tb-accent:${accent}">
        <td><span class="tb-rank">#${i + 1}</span></td>
        <td><span class="tb-sup-name">${d.sup.name}</span><div class="tb-sup-sub">${supSub}</div></td>
        <td class="tb-num">${d.team.length}</td>
        <td class="tb-num">${m.producing}${d.team.length ? `<span class="tb-sup-sub"> / ${d.team.length}</span>` : ''}</td>
        <td class="tb-num">${d.count}</td>
        <td class="tb-money">${fmtR(d.total)}</td>
        ${isPagas ? `<td class="tb-money tb-money--muted">${fmtR(d.totalBruto || 0)}</td>` : ''}
        <td class="tb-num">${fmtR(m.ticketMedio)}</td>
        <td class="tb-num">${propsPerVendStr}</td>
        <td>
          <div class="tb-share">
            <div class="tb-share__track"><div class="tb-share__fill" style="width:${share}%;"></div></div>
            <span class="tb-share__pct">${share}%</span>
          </div>
        </td>
        <td>
          <button type="button" class="btn btn-ghost btn-sm tb-detail-toggle" data-tdetail="tdetail_${i}" onclick="_toggleTeamDetail('tdetail_${i}')">▼ Ver detalhes</button>
        </td>
      </tr>
      <tr id="tdetail_${i}" class="tb-detail-row" style="display:none;">
        <td colspan="${colSpan}" class="tb-detail-cell">${detailHtml}</td>
      </tr>`;
  }).join('');

  return `<div class="tb-analytics-head">
      <h4>Análise detalhada por equipe</h4>
      <button type="button" class="btn btn-ghost btn-sm" onclick="_exportTeamBillingCsv()">Exportar CSV</button>
    </div>
    <p class="tb-analytics-summary">Ticket médio geral: <strong>${fmtR(avgTicket)}</strong> · Vendedores com produção: <strong>${totalProducing}</strong> de <strong>${totalMembers}</strong></p>
    <div class="tb-analytics-table-wrap">
      <table class="tb-analytics-table">
        <thead><tr>
          <th>#</th>
          <th>Supervisor</th>
          <th>Equipe</th>
          <th>c/ produção</th>
          <th>Propostas</th>
          <th>${isPagas ? 'Final pago' : 'Valor bruto'}</th>
          ${isPagas ? '<th>Valor bruto</th>' : ''}
          <th>Ticket médio</th>
          <th>Prop./vend.</th>
          <th>% do total</th>
          <th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="4">TOTAL GERAL</td>
          <td class="tb-num">${grandCount}</td>
          <td class="tb-money">${fmtR(grandTotal)}</td>
          ${isPagas ? `<td class="tb-money tb-money--muted">${fmtR(grandTotalBruto)}</td>` : ''}
          <td class="tb-num">${fmtR(avgTicket)}</td>
          <td class="tb-num">—</td>
          <td class="tb-share__pct">100%</td>
          <td></td>
        </tr></tfoot>
      </table>
    </div>`;
}

/**
 * _exportTeamBillingCsv — exporta a tabela analítica atual para planilha.
 */
function _exportTeamBillingCsv() {
  const pack = window._teamBillingExportData;
  if (!pack?.rows?.length) return;
  const { rows, fmtPlain, isPagas, grandTotal, grandCount } = pack;
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = [
    'Rank', 'Supervisor', 'Tamanho equipe', 'Vendedores c/ produção',
    'Propostas', isPagas ? 'Final pago' : 'Valor bruto',
    ...(isPagas ? ['Valor bruto'] : []),
    'Ticket médio', 'Propostas/vendedor', '% do total',
  ];
  const lines = [header.map(esc).join(';')];
  rows.forEach((d, i) => {
    const m = _teamBillingRowMetrics(d);
    const share = grandTotal > 0 ? Math.round((d.total / grandTotal) * 100) : 0;
    lines.push([
      i + 1, d.sup.name, d.team.length, m.producing, d.count,
      fmtPlain(d.total),
      ...(isPagas ? [fmtPlain(d.totalBruto || 0)] : []),
      fmtPlain(m.ticketMedio),
      m.propsPerVendor.toFixed(2).replace('.', ','),
      share + '%',
    ].map(esc).join(';'));
  });
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `analise-equipes-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
window._exportTeamBillingCsv = _exportTeamBillingCsv;

function _paintTeamBillingChart(teamData, colors, fmtR, statusKey) {
  const chartHost = document.getElementById('teamBillingChart');
  if (!chartHost) return;
  chartHost.className = 'team-billing-chart-host';
  chartHost.removeAttribute('style');
  if (!teamData.length) {
    chartHost.innerHTML = '<div class="team-billing-chart-empty">Nenhuma proposta no período.</div>';
    if (_teamBillingChartInstance) {
      _teamBillingChartInstance.destroy();
      _teamBillingChartInstance = null;
    }
    return;
  }
  chartHost.innerHTML = '<div class="team-billing-chart-wrap"><canvas id="teamBillingCanvas" aria-label="Gráfico de faturamento por equipe"></canvas></div>';
  const canvas = document.getElementById('teamBillingCanvas');
  if (!canvas || typeof Chart === 'undefined') return;
  if (_teamBillingChartInstance) {
    _teamBillingChartInstance.destroy();
    _teamBillingChartInstance = null;
  }
  const labels = teamData.map((d) => _teamBillingChartLabel(d.sup.name));
  const barColors = teamData.map((_, i) => colors[i % colors.length]);
  const maxCount = Math.max(...teamData.map((d) => d.count), 1);
  const isPagas = String(statusKey || 'total').toLowerCase() === 'pagas';
  const barLabel = isPagas ? 'Valor final pago' : 'Valor bruto';
  const fmtShort = (val) => {
    if (!val) return '0';
    if (val >= 1e6) return (val / 1e6).toFixed(1).replace('.', ',') + ' mi';
    if (val >= 1e3) return (val / 1e3).toFixed(0) + ' mil';
    return String(Math.round(val));
  };
  const valueLabelPlugin = {
    id: 'teamBillingValueLabels',
    afterDatasetsDraw(chart) {
      const meta = chart.getDatasetMeta(0);
      if (!meta?.data?.length) return;
      const { ctx } = chart;
      meta.data.forEach((bar, i) => {
        const val = teamData[i]?.total;
        const bruto = teamData[i]?.totalBruto;
        if (!val && !bruto) return;
        ctx.save();
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        if (isPagas && bruto > 0 && Math.abs(bruto - val) > 0.01) {
          ctx.font = 'bold 11px Nunito, system-ui, sans-serif';
          ctx.fillStyle = '#64748b';
          ctx.fillText('bruto R$ ' + fmtShort(bruto), bar.x, Math.max(bar.y - 22, 14));
          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 12px Nunito, system-ui, sans-serif';
          ctx.fillText('R$ ' + fmtShort(val), bar.x, Math.max(bar.y - 8, 26));
        } else {
          ctx.font = 'bold 12px Nunito, system-ui, sans-serif';
          ctx.fillText('R$ ' + fmtShort(val || bruto), bar.x, Math.max(bar.y - 8, 14));
        }
        ctx.restore();
      });
    },
  };
  _teamBillingChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: barLabel,
          data: teamData.map((d) => d.total),
          backgroundColor: barColors.map(_teamBillingBarFill),
          borderColor: barColors,
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 72,
          yAxisID: 'y',
          order: 2,
        },
        {
          type: 'line',
          label: 'Propostas (qtd)',
          data: teamData.map((d) => d.count),
          borderColor: '#1D4ED8',
          backgroundColor: 'rgba(29, 78, 216, 0.08)',
          borderWidth: 3,
          pointRadius: 6,
          pointHoverRadius: 8,
          pointBackgroundColor: '#1D4ED8',
          pointBorderWidth: 2,
          pointBorderColor: '#fff',
          tension: 0.2,
          yAxisID: 'y1',
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 32, right: 12, bottom: 4, left: 8 } },
      datasets: {
        bar: { barPercentage: 0.72, categoryPercentage: 0.82 },
      },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 18,
            boxHeight: 12,
            padding: 16,
            font: { size: 14, weight: '700' },
            color: '#1e293b',
          },
        },
        tooltip: {
          backgroundColor: '#ffffff',
          titleColor: '#0f172a',
          bodyColor: '#334155',
          borderColor: '#cbd5e1',
          borderWidth: 1,
          padding: 14,
          boxPadding: 6,
          titleFont: { size: 14, weight: '700' },
          bodyFont: { size: 13, weight: '600' },
          footerFont: { size: 12 },
          displayColors: true,
          callbacks: {
            title: (items) => {
              const i = items[0]?.dataIndex ?? 0;
              return teamData[i]?.sup?.name || labels[i] || '';
            },
            label: (ctx) => {
              const i = ctx.dataIndex ?? 0;
              const row = teamData[i] || {};
              if (ctx.datasetIndex === 0) {
                const lines = [];
                if (isPagas) lines.push(`Final pago: ${fmtR(ctx.parsed.y)}`);
                else lines.push(`Bruto: ${fmtR(ctx.parsed.y)}`);
                if (row.totalBruto > 0 && (isPagas || Math.abs(row.totalBruto - ctx.parsed.y) > 0.01)) {
                  lines.push(`Bruto: ${fmtR(row.totalBruto)}`);
                }
                return lines;
              }
              return `Propostas: ${ctx.parsed.y}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 13, weight: '800' },
            color: '#1e293b',
            maxRotation: 0,
            padding: 8,
          },
        },
        y: {
          position: 'left',
          beginAtZero: true,
          grace: '12%',
          grid: { color: 'rgba(148, 163, 184, 0.35)' },
          title: {
            display: true,
            text: isPagas ? 'Valor final pago (R$)' : 'Valor bruto (R$)',
            font: { size: 13, weight: '800' },
            color: '#1e293b',
            padding: { bottom: 8 },
          },
          ticks: {
            font: { size: 12, weight: '600' },
            color: '#334155',
            padding: 6,
            callback: (v) => {
              const n = Number(v) || 0;
              if (n >= 1e6) return 'R$ ' + (n / 1e6).toFixed(1).replace('.', ',') + ' mi';
              if (n >= 1e3) return 'R$ ' + (n / 1e3).toFixed(0) + ' mil';
              return 'R$ ' + n;
            },
          },
        },
        y1: {
          position: 'right',
          beginAtZero: true,
          suggestedMax: Math.ceil(maxCount * 1.15),
          grid: { drawOnChartArea: false },
          title: {
            display: true,
            text: 'Propostas',
            font: { size: 13, weight: '800' },
            color: '#475569',
            padding: { bottom: 8 },
          },
          ticks: { font: { size: 12, weight: '600' }, color: '#334155', precision: 0, padding: 6 },
        },
      },
      onClick: (_ev, elements) => {
        if (!elements.length) return;
        _toggleTeamDetail('tdetail_' + elements[0].index);
      },
    },
    plugins: [valueLabelPlugin],
  });
}

const _TEAM_BILLING_STATUS_LABELS = {
  total: 'Fatura Total',
  cadastradas: 'Cadastradas',
  digitadas: 'Digitadas',
  pagas: 'Pagas',
  canceladas: 'Canceladas',
};

function _proposalRowKey(p) {
  return String(p?.id || p?.numero || p?.protocolo || '');
}

function _teamBillingDateRange(filterKey) {
  const now = new Date();
  const f = filterKey || _teamBillingFilter || 'month';
  if (f === 'day') {
    const dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { dateFrom, dateTo: new Date(dateFrom.getTime() + 86400000) };
  }
  if (f === 'month') {
    return {
      dateFrom: new Date(now.getFullYear(), now.getMonth(), 1),
      dateTo: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }
  if (f === 'year') {
    return {
      dateFrom: new Date(now.getFullYear(), 0, 1),
      dateTo: new Date(now.getFullYear() + 1, 0, 1),
    };
  }
  if (f === 'custom') {
    const fromVal = document.getElementById('filterDateFrom')?.value;
    const toVal = document.getElementById('filterDateTo')?.value;
    return {
      dateFrom: fromVal ? new Date(fromVal) : new Date(0),
      dateTo: toVal ? new Date(new Date(toVal).getTime() + 86400000) : new Date(9999, 0),
    };
  }
  return { dateFrom: new Date(0), dateTo: new Date(9999, 0) };
}

function _filterPropsForTeamBilling(props, filterKey, statusKey) {
  const sk = statusKey || _teamBillingStatusFilter || 'total';
  const propDate = (p) => (typeof DB.proposalBillingDate === 'function'
    ? DB.proposalBillingDate(p, sk)
    : (typeof DB.proposalCreatedDate === 'function'
      ? DB.proposalCreatedDate(p)
      : new Date(p.createdAt || p.created_at || 0)));
  const { dateFrom, dateTo } = _teamBillingDateRange(filterKey);
  let rows = (props || []).filter((p) => {
    const d = propDate(p);
    return d >= dateFrom && d < dateTo;
  });
  rows = rows.filter((p) => _proposalMatchesBillingStatus(p, sk));
  return rows;
}
window._filterPropsForTeamBilling = _filterPropsForTeamBilling;

function _isTeamVendorMember(u, supIds) {
  const r = String(u?.role || '').toLowerCase();
  const teamRoles = ['employee', 'vendedor', 'backoffice', 'sup_backoffice'];
  return teamRoles.includes(r) && supIds.has(String(u.admin_id || ''));
}

function _attachUnassignedTeamBillingProps(rows, inRange, statusKey) {
  const assignedProps = new Set();
  (rows || []).forEach((r) => (r.props || []).forEach((p) => {
    assignedProps.add(p);
  }));
  const missing = (inRange || []).filter((p) => !assignedProps.has(p));
  if (!missing.length) return rows;
  
  let parceiros = rows.find((r) => r.sup?.name === 'Parceiros');
  if (parceiros) {
    missing.forEach((p) => parceiros.props.push(p));
    _recalcTeamBillingRowTotals(parceiros, statusKey);
  } else {
    const row = {
      sup: { name: 'Parceiros', id: null },
      team: [],
      props: missing,
      total: 0,
      totalBruto: 0,
      count: missing.length,
    };
    _recalcTeamBillingRowTotals(row, statusKey);
    rows.push(row);
  }
  return rows.sort((a, b) => b.total - a.total);
}

function _buildTeamBillingData(supervisors, users, inRange, usersByVendorName, statusKey) {
  const sk = statusKey || _teamBillingStatusFilter || 'total';
  const propAmt = (p) => _teamBillingChartAmt(p, sk);
  const propBruto = (p) => _teamBillingBrutoAmt(p);
  const sumRow = (props) => ({
    total: props.reduce((s, p) => s + propAmt(p), 0),
    totalBruto: props.reduce((s, p) => s + propBruto(p), 0),
  });
  const processedSupIds = new Set();
  const rows = [];

  for (const g of _SUPERVISOR_TEAM_MERGE_GROUPS) {
    const sups = supervisors.filter((s) => _supervisorMergeGroup(s.name) === g);
    if (!sups.length) continue;
    sups.forEach((s) => processedSupIds.add(s.id));
    const supIds = new Set(sups.map((s) => String(s.id)));
    const team = users.filter((u) => _isTeamVendorMember(u, supIds));
    const scopeIds = new Set([...supIds, ...team.map((u) => String(u.id))]);
    const props = inRange.filter((p) => {
      const vid = _resolveProposalVendorId(p, usersByVendorName);
      return vid && scopeIds.has(String(vid));
    });
    rows.push({
      sup: {
        name: g.label,
        id: sups[0]?.id || null,
        _mergedFrom: sups.map((s) => s.name).filter(Boolean),
      },
      team,
      props,
      ...sumRow(props),
      count: props.length,
    });
  }

  for (const sup of supervisors) {
    if (processedSupIds.has(sup.id)) continue;
    const supIds = new Set([String(sup.id)]);
    const team = users.filter((u) => _isTeamVendorMember(u, supIds));
    const scopeIds = new Set([String(sup.id), ...team.map((u) => String(u.id))]);
    const props = inRange.filter((p) => {
      const vid = _resolveProposalVendorId(p, usersByVendorName);
      return vid && scopeIds.has(String(vid));
    });
    rows.push({
      sup,
      team,
      props,
      ...sumRow(props),
      count: props.length,
    });
  }

  const allSupIds = new Set(supervisors.map((s) => String(s.id)));
  const internalVendorIds = new Set([...allSupIds]);
  users.forEach((u) => {
    if (allSupIds.has(String(u.admin_id || ''))) internalVendorIds.add(String(u.id));
  });
  const orphanProps = inRange.filter((p) => {
    const vid = _resolveProposalVendorId(p, usersByVendorName);
    if (!vid) return true;
    return !internalVendorIds.has(String(vid));
  });
  const orphanSums = sumRow(orphanProps);
  if (orphanSums.total > 0 || orphanProps.length > 0) {
    rows.push({
      sup: { name: 'Parceiros', id: null },
      team: [],
      props: orphanProps,
      ...orphanSums,
      count: orphanProps.length,
    });
  }

  const withUnassigned = _attachUnassignedTeamBillingProps(rows, inRange, sk);
  const poolTotal = (inRange || []).reduce((s, p) => s + propAmt(p), 0);
  const teamTotal = withUnassigned.reduce((s, r) => s + (r.total || 0), 0);
  // #region agent log
  fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'dash-total-fix',hypothesisId:'H1-H2',location:'admin.js:build-team-billing',message:'team billing totals',data:{rowCount:withUnassigned.length,inRangeLen:inRange.length,poolTotal,teamTotal,poolCount:inRange.length,teamCount:withUnassigned.reduce((s,r)=>s+r.count,0)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return withUnassigned;
}

function _mergeTeamBillingRows(rows) {
  const merged = new Map();
  const passthrough = [];
  for (const row of rows || []) {
    const groupLabel = _supervisorMergeGroupLabel(row.sup?.name);
    if (!groupLabel) {
      passthrough.push(row);
      continue;
    }
    let cur = merged.get(groupLabel);
    if (!cur) {
      cur = {
        sup: { name: groupLabel, id: row.sup?.id || null, _mergedFrom: [row.sup?.name].filter(Boolean) },
        team: [...(row.team || [])],
        props: [...(row.props || [])],
        total: row.total || 0,
        count: row.count || 0,
      };
      merged.set(groupLabel, cur);
      continue;
    }
    const teamIds = new Set(cur.team.map((u) => u.id));
    (row.team || []).forEach((u) => {
      if (u?.id && !teamIds.has(u.id)) {
        cur.team.push(u);
        teamIds.add(u.id);
      }
    });
    const propKeys = new Set(cur.props.map(_proposalRowKey).filter(Boolean));
    (row.props || []).forEach((p) => {
      const k = _proposalRowKey(p);
      if (k && propKeys.has(k)) return;
      if (k) propKeys.add(k);
      cur.props.push(p);
    });
    if (row.sup?.name) cur.sup._mergedFrom.push(row.sup.name);
  }
  for (const cur of merged.values()) {
    _recalcTeamBillingRowTotals(cur, _teamBillingStatusFilter || 'total');
    cur.sup._mergedFrom = [...new Set(cur.sup._mergedFrom || [])];
    passthrough.push(cur);
  }
  return passthrough.sort((a, b) => b.total - a.total);
}

function _proposalStatusNorm(p) {
  return String(p?.statusOp || p?.status_op || p?.status || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function _proposalIsCancelled(p) {
  if (typeof DB !== 'undefined' && typeof DB.isCancelledProposal === 'function') {
    return DB.isCancelledProposal(p);
  }
  const st = String(p?.status || '').toUpperCase();
  const fase = String(p?.statusOp || p?.status_op || '').toUpperCase();
  return st.includes('CANCEL') || fase.includes('CANCEL');
}

function _proposalIsPaid(p) {
  if (typeof DB !== 'undefined' && typeof DB.isPaidProposal === 'function') {
    return DB.isPaidProposal(p);
  }
  if (_proposalIsCancelled(p)) return false;
  const s = _proposalStatusNorm(p);
  return s === 'PAGO' || s.includes('PAGO');
}

function _normVendorName(n) {
  return String(n || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function _buildUsersByVendorName(users) {
  const map = {};
  (users || []).forEach((u) => {
    const n = _normVendorName(u?.name);
    if (n && u?.id) map[n] = String(u.id);
  });
  return map;
}

function _resolveProposalVendorId(p, usersByName) {
  if (typeof DB !== 'undefined' && typeof DB.resolveProposalVendorId === 'function') {
    return DB.resolveProposalVendorId(p, usersByName);
  }
  const vid = String(p?.vendorId || p?.vendor_id || p?.employee_id || '').trim();
  if (vid) return vid;
  const vn = _normVendorName(p?.vendorName || p?.vendor_name);
  return (vn && usersByName?.[vn]) || '';
}

function _proposalMatchesBillingStatus(p, statusFilter) {
  if (typeof DB !== 'undefined' && typeof DB.proposalMatchesBillingStatus === 'function') {
    return DB.proposalMatchesBillingStatus(p, statusFilter);
  }
  const f = String(statusFilter || 'total').toLowerCase().trim();
  if (f === 'total' || f === 'todas' || f === 'all' || !f) return true;
  if (f === 'cadastradas' || f === 'cadastrada') return true;
  if (f === 'pagas' || f === 'paga' || f === 'pago') return _proposalIsPaid(p);
  if (f === 'canceladas' || f === 'cancelada') return _proposalIsCancelled(p);
  if (f === 'digitadas' || f === 'digitada') {
    if (typeof DB !== 'undefined' && typeof DB.proposalDigitacaoAt === 'function') {
      return !!DB.proposalDigitacaoAt(p);
    }
    return false;
  }
  return true;
}

/** Loja de prêmios no painel admin (implementação em store-shop.js). */
async function renderAdminPrizeStore() {
  if (window.StoreShop) return StoreShop.init();
  if (typeof resolveEmployeeUser === 'function') {
    currentUser = await resolveEmployeeUser();
  } else {
    currentUser = await Auth.getCurrentUser();
  }
  if (!currentUser) return;
  const jobs = [];
  if (typeof renderBalance === 'function') jobs.push(renderBalance());
  if (typeof renderCategories === 'function') jobs.push(renderCategories());
  if (typeof renderProducts === 'function') jobs.push(renderProducts());
  await Promise.all(jobs);
}
window.renderAdminPrizeStore = renderAdminPrizeStore;

function invalidateSouBluCaches() {
  if (typeof _cacheDel === 'function') {
    _cacheDel('users');
    _cacheDel('transactions');
    _cacheDel('withdrawals');
    _cacheDel('orders');
    _cacheDel('meetings');
  }
  _allUsersCache = null;
  if (typeof DB !== 'undefined' && typeof DB.clearAllUsersCache === 'function') {
    DB.clearAllUsersCache();
  }
  if (typeof refreshPartnerRootIdsCache === 'function') {
    refreshPartnerRootIdsCache().catch(() => {});
  }
}

function _startAdminLiveRefresh() {
  _stopAdminLiveRefresh();
  window.__SOUBLU_ADMIN_POLL__ = true;
  let pollBusy = false;
  const tick = async () => {
    if (document.hidden || pollBusy) return;
    pollBusy = true;
    try {
    const jobs = [];
    jobs.push(typeof updateMeetingsBadge === 'function' ? updateMeetingsBadge() : Promise.resolve());
    if (window.Trainings && typeof window.Trainings.updateBadge === 'function') {
      jobs.push(window.Trainings.updateBadge());
    }
    await Promise.all(jobs.map(p => p.catch(() => {})));
    } finally {
      pollBusy = false;
    }
  };
  const keepalive = async () => {
    if (document.hidden) return;
    try {
      const base = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';
      const key = typeof API_KEY !== 'undefined' ? API_KEY : '';
      await fetch(`${base}/api/rest-ping.php`, { headers: { 'X-API-Key': key } });
    } catch (e) {
    }
  };
  _adminPollTimer = setInterval(tick, 120000);
  _adminKeepaliveTimer = setInterval(keepalive, 180000);
  keepalive();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); keepalive(); } });
}

window.addEventListener('pagehide', () => { _stopAdminLiveRefresh(); });

/**
 * _buildTeamBillingDetailHtml — painel expandido da equipe no faturamento por supervisor.
 * Usa tabelas (vendedores | propostas) para leitura mais clara que cards soltos.
 */
function _buildTeamBillingDetailHtml(d, cor, fmtR, isPagas, propAmt, propBruto) {
  const vendorStats = (() => {
    const map = new Map();
    (d.props || []).forEach((p) => {
      const name = String(p.vendorName || p.vendor_name || '').trim() || 'Sem vendedor';
      const key = name.toLocaleLowerCase('pt-BR');
      const cur = map.get(key) || { name, count: 0, total: 0 };
      cur.count += 1;
      cur.total += propAmt(p) || propBruto(p) || 0;
      map.set(key, cur);
    });
    (d.team || []).forEach((u) => {
      const name = String(u.name || '').trim();
      if (!name) return;
      const key = name.toLocaleLowerCase('pt-BR');
      if (!map.has(key)) map.set(key, { name, count: 0, total: 0, idle: true });
    });
    return [...map.values()].sort((a, b) => b.total - a.total || b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));
  })();

  const vendorsSection = vendorStats.length
    ? `<div class="tb-detail-section">
        <div class="tb-detail-section__head">
          <span class="tb-detail-section__title">Vendedores da equipe</span>
          <span class="tb-detail-section__count">${vendorStats.length}</span>
        </div>
        <div class="tb-detail-table-wrap">
          <table class="tb-detail-table">
            <thead><tr>
              <th>Vendedor</th><th>Propostas</th><th>Valor</th><th>Situação</th>
            </tr></thead>
            <tbody>
              ${vendorStats.map((v) => `
                <tr class="${v.idle && !v.count ? 'tb-detail-row--idle' : ''}">
                  <td class="tb-detail-name">${v.name}</td>
                  <td>${v.count}</td>
                  <td class="tb-detail-money">${fmtR(v.total)}</td>
                  <td>${v.idle && !v.count
                    ? '<span class="tb-badge tb-badge--muted">Sem proposta</span>'
                    : (v.count
                      ? '<span class="tb-badge tb-badge--ok">Com produção</span>'
                      : '<span class="tb-badge tb-badge--muted">—</span>')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`
    : '';

  const proposalsSection = !d.props.length
    ? `<div class="tb-detail-section">
        <div class="tb-detail-section__head">
          <span class="tb-detail-section__title">Propostas</span>
          <span class="tb-detail-section__count">0</span>
        </div>
        <p class="tb-detail-empty">Nenhuma proposta neste período.</p>
      </div>`
    : `<div class="tb-detail-section">
        <div class="tb-detail-section__head">
          <span class="tb-detail-section__title">Propostas</span>
          <span class="tb-detail-section__count">${d.props.length}</span>
        </div>
        <div class="tb-detail-table-wrap tb-detail-table-wrap--scroll">
          <table class="tb-detail-table">
            <thead><tr>
              <th>Nº</th><th>Vendedor</th><th>Cliente</th><th>Convênio</th><th>Valor</th><th>Status</th>
            </tr></thead>
            <tbody>
              ${d.props.slice(0, 50).map((p) => {
                const finalV = propAmt(p);
                const brutoV = propBruto(p);
                const valCell = isPagas && brutoV > 0 && Math.abs(brutoV - finalV) > 0.01
                  ? `${fmtR(finalV)}<span class="tb-detail-sub">bruto ${fmtR(brutoV)}</span>`
                  : fmtR(finalV || brutoV);
                const st = p.statusOp || p.status || '—';
                return `<tr>
                  <td class="tb-detail-num">${p.numero || p.id}</td>
                  <td>${p.vendorName || p.vendor_name || '—'}</td>
                  <td class="tb-detail-name">${p.clientName || '—'}</td>
                  <td>${p.convenio || '—'}</td>
                  <td class="tb-detail-money">${valCell}</td>
                  <td><span class="tb-badge tb-badge--muted">${st}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          ${d.props.length > 50 ? `<p class="tb-detail-more">+${d.props.length - 50} propostas não exibidas</p>` : ''}
        </div>
      </div>`;

  return `<div class="tb-detail-panel">
    <div class="tb-detail-grid">${vendorsSection}${proposalsSection}</div>
  </div>`;
}

async function renderTeamBillingChart() {
  const card = document.getElementById('teamBillingCard');
  const canBilling = _canViewTeamBillingChart();
  // #region agent log
  fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'post-fix',hypothesisId:'H4',location:'admin.js:team-billing',message:'renderTeamBillingChart gate',data:{canBilling:!!canBilling,companyWide:!!_hasCompanyWideDashboard(),IS_SUP_BACKOFFICE:!!IS_SUP_BACKOFFICE,cardFound:!!card,propsCacheLen:(_allProposalsCache||[]).length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (!card) return;
  if (!canBilling) { card.style.display = 'none'; return; }
  card.style.display = '';
  card.classList.add('team-billing-analytics');
  const titleEl = card.querySelector('.team-billing-title');
  if (titleEl) titleEl.textContent = 'Análise de Faturamento por Equipe';

  if (!_allProposalsCache?.length) {
    await _loadBillingProposals(true);
  } else {
    await _loadBillingProposals(false);
  }

  let proposals = _allProposalsCache || [];
  if (!_allUsersCache?.length) _allUsersCache = await DB.getAllUsers().catch(() => []);
  const users = _allUsersCache || [];
  const usersByVendorName = _buildUsersByVendorName(users);
  if (_isCommercialSupervisor()) {
    const teamIds = await _getMergedTeamScopeIds();
    const teamSet = new Set(teamIds.map(String));
    const teamUsers = users.filter((u) => teamSet.has(String(u.id)));
    const mariliaHits = teamUsers.filter((u) => /maril/i.test(String(u.name || '')));
    // #region agent log
    fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'laryssa-marilia',hypothesisId:'H1-H3',location:'admin.js:team-billing-scope',message:'supervisor team scope',data:{viewerId:Auth.getSession()?.id,viewerName:Auth.getSession()?.name,teamIdsCount:teamIds.length,teamUsers:teamUsers.map(u=>({id:u.id,name:u.name,role:u.role,admin_id:u.admin_id,active:u.active})),mariliaInScope:mariliaHits.map(u=>({id:u.id,name:u.name,admin_id:u.admin_id}))},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    proposals = proposals.filter((p) => {
      const vid = _resolveProposalVendorId(p, usersByVendorName);
      return vid && teamSet.has(String(vid));
    });
  }
  const supervisors = users.filter(u => u.role === 'supervisor');
  const periodLabels = {
    day: 'Hoje', month: 'Este Mês', year: 'Este Ano', all: 'Todo o período', custom: 'Período customizado'
  };

  const f = _teamBillingFilter;
  const statusKey = _teamBillingStatusFilter || 'total';
  const statusLabel = _TEAM_BILLING_STATUS_LABELS[statusKey] || 'Fatura Total';
  const isPagas = statusKey === 'pagas';
  const propAmt = (p) => _teamBillingChartAmt(p, statusKey);
  const propBruto = (p) => _teamBillingBrutoAmt(p);

  let inRange = _filterPropsForTeamBilling(proposals, f, statusKey);
  let periodHint = '';
  if (!inRange.length && proposals.length > 0 && (f === 'month' || f === 'day')) {
    inRange = _filterPropsForTeamBilling(proposals, 'all', statusKey);
    periodHint = `<div class="tb-alert">
      Nenhuma proposta no período «${periodLabels[f] || f}». Exibindo <strong>todo o histórico</strong> (${proposals.length} proposta(s) no banco).
    </div>`;
  }

  let teamData = _buildTeamBillingData(supervisors, users, inRange, usersByVendorName, statusKey);
  if (_isCommercialSupervisor()) {
    const myGroup = _supervisorMergeGroup(Auth.getSession()?.name);
    if (myGroup) {
      teamData = teamData.filter((d) => d.sup?.name === myGroup.label || _supervisorMergeGroup(d.sup?.name) === myGroup);
    }
  }

  const fmtR = v => 'R$ ' + parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const poolTotal = inRange.reduce((s, p) => s + propAmt(p), 0);
  const poolTotalBruto = inRange.reduce((s, p) => s + propBruto(p), 0);
  const poolCount = inRange.length;
  const grandTotal = poolTotal;
  const grandTotalBruto = poolTotalBruto;
  const grandCount = poolCount;
  window._dashBillingFilter = f;
  window._dashBillingStatusFilter = statusKey;
  window._dashBillingTotal = grandTotal;
  window._dashBillingTotalBruto = grandTotalBruto;
  window._dashPropCount = grandCount;
  // #region agent log
  fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'dash-total-fix',hypothesisId:'H1',location:'admin.js:team-billing-kpi',message:'chart KPI vs pool',data:{filter:f,status:statusKey,poolTotal,poolCount,teamTotal:teamData.reduce((s,d)=>s+d.total,0),teamCount:teamData.reduce((s,d)=>s+d.count,0)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  // ── KPIs ────────────────────────────────────────────────────────────
  const periodLabel = periodHint ? 'Todo o período' : (periodLabels[f] || f);
  const periodStatusLabel = `${periodLabel} · ${statusLabel}`;
  const propKpiLabel = statusKey === 'pagas' ? 'Propostas Pagas'
    : statusKey === 'canceladas' ? 'Propostas Canceladas'
    : statusKey === 'digitadas' ? 'Propostas Digitadas'
    : statusKey === 'cadastradas' ? 'Propostas Cadastradas'
    : 'Total de Propostas';
  const billKpiLabel = isPagas ? 'Faturamento Pago (final)'
    : statusKey === 'total' ? 'Faturamento Bruto' : `Faturamento Bruto (${statusLabel})`;
  const propsLoadedHint = proposals.length
    ? `<div class="team-billing-meta">${proposals.length} proposta(s) carregadas do banco</div>`
    : '';

  const totalTeamMembers = teamData.reduce((s, d) => s + (d.team?.length || 0), 0);
  const totalProducingVendors = teamData.reduce((s, d) => s + _teamBillingVendorProducingCount(d), 0);
  const avgTicketGeral = grandCount > 0 ? grandTotal / grandCount : 0;
  const activeTeams = teamData.filter((d) => d.count > 0).length;

  const kpiCards = [
    _teamBillingKpiHtml(propKpiLabel, grandCount, statusLabel, 0),
    _teamBillingKpiHtml(
      billKpiLabel,
      fmtR(grandTotal),
      isPagas && grandTotalBruto > 0 ? `Bruto: ${fmtR(grandTotalBruto)}` : '',
      1,
    ),
    _teamBillingKpiHtml('Ticket médio', fmtR(avgTicketGeral), 'Por proposta no período', 2),
    _teamBillingKpiHtml(
      'Equipes ativas',
      `${activeTeams} / ${teamData.length}`,
      'Com ao menos 1 proposta',
      3,
    ),
    _teamBillingKpiHtml(
      'Vendedores c/ produção',
      `${totalProducingVendors} / ${totalTeamMembers}`,
      totalTeamMembers ? `${Math.round((totalProducingVendors / totalTeamMembers) * 100)}% da equipe` : '—',
      4,
    ),
    _teamBillingKpiHtml('Período', periodLabel, statusLabel, 5),
  ];
  const kpisEl = document.getElementById('teamBillingKpis');
  if (kpisEl) {
    kpisEl.innerHTML = (periodHint || '') + propsLoadedHint + kpiCards.join('');
    // #region agent log
    try {
      const cs = getComputedStyle(kpisEl);
      const kids = Array.from(kpisEl.children).map((c) => ({
        cls: c.className || c.tagName,
        display: getComputedStyle(c).display,
        flexDir: getComputedStyle(c).flexDirection,
      }));
      fetch('http://127.0.0.1:7585/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'kpi-revert1',hypothesisId:'H1',location:'admin.js:teamBillingKpis',message:'KPI revert applied',data:{build:'kpi-revert1',kpiCount:kpiCards.length,rootDisplay:cs.display,rootCols:cs.gridTemplateColumns,children:kids},timestamp:Date.now()})}).catch(()=>{});
    } catch (_) { /* noop */ }
    // #endregion
  }

  const statusSel = document.getElementById('teamBillingStatusFilter');
  if (statusSel && statusSel.value !== statusKey) statusSel.value = statusKey;

  // ── Gráfico Chart.js — paleta suave ───────
  const colors = _teamBillingChartPalette(teamData.length || 1);
  const chartEl = document.getElementById('teamBillingChart');
  if (chartEl) {
    chartEl.className = 'team-billing-chart-host';
    chartEl.removeAttribute('style');
  }
  try {
    await _ensureChartJs();
    _paintTeamBillingChart(teamData, colors, fmtR, statusKey);
  } catch (chartErr) {
    console.warn('[teamBillingChart]', chartErr);
    if (chartEl) {
      chartEl.innerHTML = '<div class="team-billing-chart-empty">Não foi possível carregar o gráfico. Atualize a página (Ctrl+F5).</div>';
    }
  }

  // ── Tabela analítica (P&B) ───────────────────────────────────────────
  const fmtPlain = (v) => parseFloat(v || 0).toFixed(2).replace('.', ',');
  window._teamBillingExportData = {
    rows: teamData,
    fmtPlain,
    isPagas,
    grandTotal,
    grandCount,
  };
  const tableEl = document.getElementById('teamBillingTable');
  if (tableEl) {
    tableEl.innerHTML = _buildTeamBillingTableHtml(teamData, {
      fmtR,
      grandTotal,
      grandCount,
      grandTotalBruto,
      isPagas,
      propAmt,
      propBruto,
      colors,
    });
  }

  _syncTeamBillingFilterUI(periodHint ? 'all' : f);
  _wireTeamBillingDatePickers();
}

function _syncTeamBillingFilterUI(activeKey) {
  const f = activeKey || _teamBillingFilter || 'month';
  ['day', 'month', 'year', 'all'].forEach((k) => {
    const btn = document.getElementById('filterBtn' + k.charAt(0).toUpperCase() + k.slice(1));
    if (!btn) return;
    btn.classList.toggle('team-billing-pill--active', f === k);
  });
  if (f !== 'custom') _fillTeamBillingPresetDates(f);
}

function _fillTeamBillingPresetDates(f) {
  const fromEl = document.getElementById('filterDateFrom');
  const toEl = document.getElementById('filterDateTo');
  if (!fromEl || !toEl) return;
  const now = new Date();
  const pad = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  if (f === 'day') {
    fromEl.value = pad(now);
    toEl.value = pad(now);
  } else if (f === 'month') {
    fromEl.value = pad(new Date(now.getFullYear(), now.getMonth(), 1));
    toEl.value = pad(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  } else if (f === 'year') {
    fromEl.value = pad(new Date(now.getFullYear(), 0, 1));
    toEl.value = pad(new Date(now.getFullYear(), 11, 31));
  } else if (f === 'all') {
    fromEl.value = '';
    toEl.value = '';
  }
}

function _wireTeamBillingDatePickers() {
  const applyCustomRange = () => {
    _teamBillingFilter = 'custom';
    ['day', 'month', 'year', 'all'].forEach((k) => {
      const btn = document.getElementById('filterBtn' + k.charAt(0).toUpperCase() + k.slice(1));
      if (btn) btn.classList.remove('team-billing-pill--active');
    });
    renderTeamBillingChart();
    if (_hasCompanyWideDashboard() || _isCommercialSupervisor()) {
      renderDashboard().catch((e) => console.warn('[dashboard date sync]', e));
    }
  };
  ['filterDateFrom', 'filterDateTo'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.pickerWired === '1') return;
    el.dataset.pickerWired = '1';
    const openPicker = (ev) => {
      try {
        if (typeof el.showPicker === 'function') {
          el.showPicker();
          return;
        }
      } catch (_) { /* ignored — browser may block without user gesture */ }
      try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
    };
    el.addEventListener('click', openPicker);
    el.addEventListener('focus', openPicker);
    el.addEventListener('change', applyCustomRange);
  });
}

function _toggleTeamDetail(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const open = el.style.display === 'none';
  el.style.display = open ? '' : 'none';
  const rowId = id.replace('tdetail_', 'trow_');
  const btn = document.querySelector(`#${rowId} .tb-detail-toggle`);
  if (btn) {
    btn.textContent = open ? '▲ Fechar detalhes' : '▼ Ver detalhes';
    btn.classList.toggle('tb-detail-toggle--open', open);
  }
}

function setTeamFilter(f) {
  _teamBillingFilter = f;
  if (f !== 'custom') _syncTeamBillingFilterUI(f);
  else {
    ['day', 'month', 'year', 'all'].forEach((k) => {
      const btn = document.getElementById('filterBtn' + k.charAt(0).toUpperCase() + k.slice(1));
      if (btn) btn.classList.remove('team-billing-pill--active');
    });
  }
  renderTeamBillingChart();
  if (_hasCompanyWideDashboard() || _isCommercialSupervisor()) {
    renderDashboard().catch((e) => console.warn('[dashboard filter sync]', e));
  }
}

function setTeamBillingStatus(v) {
  _teamBillingStatusFilter = v || 'total';
  renderTeamBillingChart();
  if (_hasCompanyWideDashboard() || _isCommercialSupervisor()) {
    renderDashboard().catch((e) => console.warn('[dashboard status sync]', e));
  }
}
window.setTeamBillingStatus = setTeamBillingStatus;

/* ══════════════════════════════════════════════
   PAINEL MASTER
   Master cria: supervisores, financeiro, funcionários
   Cada supervisor gerencia sua equipe (admin_id)
══════════════════════════════════════════════ */
async function renderMasterPanel() {
  if (!IS_MASTER && !IS_FUNDA && !IS_GERENTE && !IS_FINANCIAL && !IS_RH && !IS_DESENVOLVEDOR && !IS_DIRETORIA) return;
  const [allUsersRaw, allOrders, allWds] = await Promise.all([
    DB.getAllUsers(true).catch(() => []),
    DB.getOrders().catch(() => []),
    DB.getWithdrawals().catch(() => []),
  ]);
  /* Inativos/removidos ficam fora da lista principal (Excluir some da tela). */
  const allUsers = (allUsersRaw || []).filter((u) => _masterUserIsActive(u)
    && !(typeof DB !== 'undefined' && typeof DB._isLegacyDemoUser === 'function' && DB._isLegacyDemoUser(u)));

  const supervisors    = allUsers.filter(u => u.role === 'supervisor');
  const desenvolvedores = allUsers.filter(u => u.role === 'desenvolvedor');
  const financeiros    = allUsers.filter(u => ['financial','financeiro'].includes(u.role));
  const gerentes       = allUsers.filter(u => u.role === 'gerente');
  const rhUsers        = allUsers.filter(u => u.role === 'rh');
  const supBackoffices = allUsers.filter(u => u.role === 'sup_backoffice');
  const backoffices    = allUsers.filter(u => u.role === 'backoffice');
  const employees      = allUsers.filter((u) => ['employee', 'vendedor'].includes(u.role)
    && (typeof isSouBluInternalUser !== 'function' || isSouBluInternalUser(u)));
  const box = document.getElementById('masterContent');
  if (!box) return;

  const roleLabels = {
    fundador:       { label:' Fundador',        cls:'badge-accent'   },
    desenvolvedor:  { label:' TI',             cls:'badge-primary' },
    master:         { label:' Master',          cls:'badge-accent'   },
    supervisor:     { label:' Supervisor',      cls:'badge-info'     },
    financial:      { label:' Financeiro',      cls:'badge-success'  },
    financeiro:     { label:' Financeiro',      cls:'badge-success'  },
    rh:             { label:' RH',              cls:'badge-warning'  },
    gerente:        { label:' Gerente',          cls:'badge-accent'   },
    sup_backoffice: { label:' Sup. Backoffice', cls:'badge-info'     },
    backoffice:     { label:' Backoffice',      cls:'badge-muted'    },
    vendedor:       { label:' Vendedor',        cls:'badge-primary'  },
    employee:       { label:' Funcionário',     cls:'badge-muted'    },
  };

  const allEmpLike = allUsers.filter((u) => ['employee', 'vendedor', 'backoffice', 'sup_backoffice', 'fundador'].includes(u.role)
    && (typeof isSouBluInternalUser !== 'function' || isSouBluInternalUser(u)));
  const totalPts = (typeof filterSouBluInternalUsers === 'function' ? filterSouBluInternalUsers(allUsers) : allUsers)
    .filter((u) => _masterUserIsActive(u))
    .reduce((s, e) => s + userPts(e), 0);
  const wdPendTotal = allWds.filter(w=>['solicitado','aprovado_master','aprovado_financeiro'].includes(w.status)).length;

  let html = '';

  html += `<div class="stat-grid" style="margin-bottom:var(--space-lg);">${[
    statCardHtml({ icon: 'users', color: 'blue', label: 'Supervisores', value: supervisors.length }),
    statCardHtml({ icon: 'balance', color: 'green', label: 'Total Pontos', value: totalPts.toLocaleString('pt-BR'), valueStyle: 'font-size:18px;' }),
    statCardHtml({ icon: 'users', color: 'yellow', label: 'Funcionários', value: allEmpLike.filter((e) => _masterUserIsActive(e)).length }),
    statCardHtml({ icon: 'withdrawals', color: 'orange', label: 'Saques Pend.', value: wdPendTotal }),
  ].join('')}</div>`;

  // ── Gerentes, TI, Financeiro, RH (lista compacta ou card único) ──
  html += _renderMasterUserSection('GERENTES', gerentes, allOrders, allWds, roleLabels);
  html += _renderMasterUserSection('TI', desenvolvedores, allOrders, allWds, roleLabels);
  html += _renderMasterUserSection('FINANCEIRO', financeiros, allOrders, allWds, roleLabels);
  html += _renderMasterUserSection('RH', rhUsers, allOrders, allWds, roleLabels);

  // ── Sup. Backoffice ──
  if (supBackoffices.length) {
    html += `<h3 style="font-family:var(--font-display);font-weight:800;font-size:15px;margin:20px 0 12px;color:var(--color-text-muted);"> SUP. BACKOFFICE</h3>`;
    html += supBackoffices.map(s => {
      const team = backoffices.filter(b => b.admin_id === s.id);
      return _renderUserCard(s, team, allOrders, allWds, roleLabels);
    }).join('');
  }

  // ── Backoffice sem sup ──
  const backSemSup = backoffices.filter(b => !b.admin_id || !supBackoffices.some(s => s.id === b.admin_id));
  if (backSemSup.length) {
    html += `<h3 style="font-family:var(--font-display);font-weight:800;font-size:15px;margin:20px 0 12px;color:var(--color-text-muted);"> BACKOFFICE (sem sup.)</h3>`;
    html += `<div class="card card-padded" style="margin-bottom:var(--space-lg);"><div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${backSemSup.map(e=>`
          <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--color-surface-2);border-radius:var(--radius-md);">
            ${avatarHtml(e.name,'avatar-sm',e.photo_url||'')}
            <div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:13px;">${e.name}</div><div style="font-size:11px;color:var(--color-text-muted);">${e.department} ·  ${(e.points||e.balance||0).toLocaleString('pt-BR')}</div></div><button class="btn btn-primary btn-sm" onclick="quickAddPoints('${e.id}','${e.name.replace(/'/g,"\\'")}')">Pontos</button><button class="btn btn-ghost btn-sm" onclick="masterEditUser('${e.id}')">Editar</button><button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" onclick="masterDeleteUser('${e.id}','${e.name.replace(/'/g,"\\'")}')" title="Excluir">Excluir</button></div>`).join('')}
      </div></div>`;
  }

  // ── Equipes por supervisor ──
  html += `<h3 style="font-family:var(--font-display);font-weight:800;font-size:15px;margin:20px 0 12px;color:var(--color-text-muted);"> EQUIPES POR SUPERVISOR</h3>`;

  if (!supervisors.length) {
    html += `<div class="card card-padded" style="text-align:center;padding:32px;color:var(--color-text-muted);">
      Nenhum supervisor cadastrado ainda.<br><button class="btn btn-primary btn-sm" style="margin-top:12px;" onclick="openCreateUserModal()"> Criar primeiro supervisor</button></div>`;
  } else {
    html += supervisors.map(sup => {
      const team = employees.filter(e => e.admin_id === sup.id);
      return _renderUserCard(sup, team, allOrders, allWds, roleLabels);
    }).join('');
  }

  // ── Funcionários sem supervisor ──
  const semSup = employees.filter(e => !e.admin_id || !supervisors.some(s => s.id === e.admin_id));
  if (semSup.length) {
    html += `<h3 style="font-family:var(--font-display);font-weight:800;font-size:15px;margin:20px 0 12px;color:var(--color-text-muted);"> SEM SUPERVISOR ATRIBUÍDO</h3>`;
    html += `<div class="card card-padded" style="margin-bottom:var(--space-lg);"><div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${semSup.map(e=>`
          <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--color-surface-2);border-radius:var(--radius-md);">
            ${avatarHtml(e.name,'avatar-sm',e.photo_url||'')}
            <div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:13px;">${e.name}</div><div style="font-size:11px;color:var(--color-text-muted);">${e.department} ·  ${(e.points||e.balance||0).toLocaleString('pt-BR')}</div></div><button class="btn btn-primary btn-sm" onclick="quickAddPoints('${e.id}','${e.name.replace(/'/g,"\\'")}')">Pontos</button><button class="btn btn-ghost btn-sm" onclick="masterEditUser('${e.id}')">Editar</button><button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" onclick="masterDeleteUser('${e.id}','${e.name.replace(/'/g,"\\'")}')" title="Excluir">Excluir</button></div>`).join('')}
      </div></div>`;
  }

  box.innerHTML = html;
  _bindMasterPanelActions();
}

/* ══════════════════════════════════════════════
   PARCEIROS (Master / Fundador)
══════════════════════════════════════════════ */
function _formatCnpj(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

const _PARTNER_DOC_DEFS = [
  { key: 'termo_login', required: false },
  { key: 'contrato_social', required: false },
  { key: 'termo_compliance', required: false },
  { key: 'rg_representante', required: false },
  { key: 'termo_confissao_divida', required: false },
  { key: 'contrato_prestacao_servicos', required: false },
];
const _PARTNER_DOC_KEYS = _PARTNER_DOC_DEFS.map((d) => d.key);
const _PARTNER_DOC_REQUIRED = _PARTNER_DOC_DEFS.filter((d) => d.required).map((d) => d.key);

/** meta.attachments pode vir como [] do PHP (json_decode de {}); normaliza para objeto. */
function _partnerAttachmentsMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return { ...raw };
}

function _partnerDocDefaultLabel(key) {
  const def = _PARTNER_DOC_DEFS.find((d) => d.key === key);
  return def && !def.required
    ? '<span style="color:#999;">Opcional</span>'
    : '<span style="color:#999;">Obrigatório</span>';
}
let _partnerCnpjWired = false;
let _partnerCnpjOnOpen = '';
let _partnerAttachments = {};

function _setPartnerCnpjStatus(msg, tone) {
  const el = document.getElementById('partnerCnpjStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = tone === 'success' ? 'var(--color-success)'
    : tone === 'warning' ? 'var(--color-warning)' : 'var(--color-text-muted)';
}

function _partnerSetVal(id, val) {
  const el = document.getElementById(id);
  if (!el) return false;
  if ('value' in el) el.value = val;
  else el.textContent = val;
  return true;
}

function _applyFonteDataToPartnerForm(partner, onlyEmpty) {
  if (!partner) return;
  const map = {
    partnerCnpj: partner.cnpj,
    partnerRazao: partner.razao_social,
    partnerRepresentante: partner.representante_legal,
    partnerCpfRepresentante: partner.cpf_representante,
    partnerEndereco: partner.endereco,
    partnerContato: partner.contato,
    partnerEmail: partner.email,
  };
  Object.keys(map).forEach((id) => {
    const fld = document.getElementById(id);
    let val = map[id];
    if (!fld || val == null || String(val).trim() === '') return;
    if (id === 'partnerRepresentante') {
      const cont = document.getElementById('partnerContato')?.value?.trim();
      if (cont && String(val).trim().toLowerCase() === cont.toLowerCase()) return;
    }
    if (onlyEmpty && String(fld.value || '').trim() !== '') return;
    if (id === 'partnerCnpj') fld.value = _formatCnpj(val);
    else if (id === 'partnerCpfRepresentante') fld.value = _formatCpf(String(val).replace(/\D/g, ''));
    else fld.value = val;
  });
}

async function _onPartnerCnpjLookup(opts) {
  const silent = !!(opts && opts.silent);
  const el = document.getElementById('partnerCnpj');
  if (!el) return;
  if (typeof FonteData === 'undefined' && typeof ensureScript === 'function') {
    try { await ensureScript('../js/fontedata.js'); } catch (_) { /* noop */ }
  }
  if (typeof FonteData === 'undefined') return;
  if (typeof FonteData.lookupCnpj !== 'function') {
    _setPartnerCnpjStatus('Consulta CNPJ indisponível — recarregue a página (Ctrl+F5).', 'warning');
    return;
  }
  const cnpj = el.value.replace(/\D/g, '');
  if (cnpj.length !== 14) return;
  const recordId = document.getElementById('partnerRecordId')?.value || '';
  const onlyEmpty = !!recordId;
  const forceOnline = !!(opts && opts.forceOnline);
  const repEmptyNow = !String(document.getElementById('partnerRepresentante')?.value || '').trim();
  const cpfEmptyNow = !String(document.getElementById('partnerCpfRepresentante')?.value || '').replace(/\D/g, '').trim();
  if (onlyEmpty && !forceOnline && cnpj === _partnerCnpjOnOpen && !repEmptyNow && !cpfEmptyNow) {
    _setPartnerCnpjStatus('', '');
    return;
  }
  try {
    const all = await DB.getPartners().catch(() => []);
    const found = (all || []).find(p => String(p.cnpj || '').replace(/\D/g, '') === cnpj);
    if (found && !(recordId && found.id === recordId)) {
      _applyFonteDataToPartnerForm({
        cnpj,
        razao_social: found.razao_social,
        representante_legal: found.meta?.representante_legal,
        cpf_representante: found.meta?.cpf_representante,
        endereco: found.endereco,
        contato: found.contato,
        email: found.email,
      }, onlyEmpty);
      if (found.meta) _fillPartnerMetaForm(found.meta);
      _setPartnerCnpjStatus('CNPJ já cadastrado — dados carregados do sistema.', 'warning');
      return;
    }
    if (found && recordId && found.id === recordId) {
      const hasRep = String(found.meta?.representante_legal || document.getElementById('partnerRepresentante')?.value || '').trim();
      const hasRazao = String(found.razao_social || document.getElementById('partnerRazao')?.value || '').trim();
      if (hasRep && hasRazao) {
        _setPartnerCnpjStatus('', '');
        return;
      }
    }
  } catch (_) { /* segue */ }
  try {
    if (typeof DB.getCnpjFonteCache === 'function') {
      const cached = await DB.getCnpjFonteCache(cnpj);
      if (cached) {
        _applyFonteDataToPartnerForm(cached, onlyEmpty);
        _setPartnerCnpjStatus('Dados do CNPJ carregados do cadastro salvo (sem nova consulta).', 'success');
        return;
      }
    }
  } catch (_) { /* segue FonteData */ }
  const cnpjChanged = cnpj !== _partnerCnpjOnOpen;
  _setPartnerCnpjStatus(cnpjChanged ? 'Consultando CNPJ na FonteData…' : 'Buscando dados do CNPJ…', 'muted');
  const res = typeof FonteData.lookupCnpjPartner === 'function'
    ? await FonteData.lookupCnpjPartner(cnpj, { refresh: cnpjChanged })
    : await FonteData.lookupCnpj(cnpj);
  if (!res.ok) {
    const errMsg = res.error || 'Não foi possível consultar o CNPJ na Receita Federal.';
    const razaoJa = document.getElementById('partnerRazao')?.value?.trim();
    const repEmpty = !String(document.getElementById('partnerRepresentante')?.value || '').trim();
    if (onlyEmpty && razaoJa) {
      if (silent) {
        if (repEmpty) {
          const deployHint = /cpf inválido|trata como cpf|fontedata\.php/i.test(errMsg)
            ? 'Envie api/fontedata.php atualizado ao servidor (FTP) para buscar o sócio online.'
            : `Consulta online indisponível (${errMsg}). Preencha o representante legal manualmente.`;
          _setPartnerCnpjStatus(deployHint, 'muted');
        } else {
          _setPartnerCnpjStatus('', '');
        }
        return;
      }
      if (/não encontrad|not found|404/i.test(errMsg)) {
        _setPartnerCnpjStatus(
          repEmpty
            ? 'Dados do cadastro mantidos. Consulta online não retornou sócio — preencha o representante legal manualmente.'
            : 'Dados do cadastro mantidos.',
          'muted',
        );
        return;
      }
      const repNote = repEmpty
        ? ' Preencha o representante legal (sócio na Receita), não o contato da empresa.'
        : '';
      _setPartnerCnpjStatus(errMsg + repNote, 'warning');
      return;
    }
    _setPartnerCnpjStatus(errMsg, 'warning');
    return;
  }
  _applyFonteDataToPartnerForm(res.partner, onlyEmpty);
  const repOk = String(document.getElementById('partnerRepresentante')?.value || '').trim();
  const cpfOk = String(document.getElementById('partnerCpfRepresentante')?.value || '').replace(/\D/g, '').length === 11;
  if (!repOk) {
    _setPartnerCnpjStatus(
      'CNPJ da empresa confirmado. Representante legal não veio na consulta básica — preencha o sócio/administrador (não use o contato).',
      'success',
    );
  } else if (!cpfOk) {
    _setPartnerCnpjStatus(
      'Representante preenchido. A consulta básica (R$ 0,16) não traz CPF — preencha manualmente ou use «Buscar CPF na Receita» (≈ R$ 4,20).',
      'success',
    );
  } else if (res.cached) {
    _setPartnerCnpjStatus('Dados do CNPJ carregados do cache (sem custo FonteData). Revise antes de salvar.', 'success');
  } else {
    _setPartnerCnpjStatus('Dados do CNPJ e CPF do representante preenchidos (FonteData). Revise antes de salvar.', 'success');
  }
}

async function partnerBuscarCpfSocio() {
  const cnpj = String(document.getElementById('partnerCnpj')?.value || '').replace(/\D/g, '');
  if (cnpj.length !== 14) {
    showToast('Informe um CNPJ válido antes de buscar o CPF.', 'warning');
    return;
  }
  const cpfOk = String(document.getElementById('partnerCpfRepresentante')?.value || '').replace(/\D/g, '').length === 11;
  if (cpfOk) {
    showToast('CPF do representante já está preenchido.', 'info');
    return;
  }
  if (!confirm('Buscar CPF completo do sócio no Quadro Societário da Receita Federal?\n\nCusto estimado na FonteData: ≈ R$ 4,20 (somente esta consulta — não cobra a básica de R$ 0,16).')) return;
  if (typeof FonteData.lookupCnpjPartner !== 'function') {
    showToast('Consulta FonteData indisponível.', 'error');
    return;
  }
  _setPartnerCnpjStatus('Consultando Quadro Societário (CPF completo)…', 'muted');
  const res = await FonteData.lookupCnpjPartner(cnpj, { fullCpf: true });
  if (!res.ok) {
    _setPartnerCnpjStatus(res.error || 'Não foi possível buscar o CPF na Receita.', 'warning');
    return;
  }
  _applyFonteDataToPartnerForm(res.partner, true);
  const cpfAfter = String(document.getElementById('partnerCpfRepresentante')?.value || '').replace(/\D/g, '').length === 11;
  if (cpfAfter) {
    _setPartnerCnpjStatus('CPF do representante preenchido (Quadro Societário). Revise antes de salvar.', 'success');
  } else {
    _setPartnerCnpjStatus('Consulta realizada, mas o CPF não veio na resposta — preencha manualmente.', 'warning');
  }
}
window.partnerBuscarCpfSocio = partnerBuscarCpfSocio;

let _partnerCpfRepWired = false;

function _wirePartnerCpfRepresentante() {
  if (_partnerCpfRepWired) return;
  const el = document.getElementById('partnerCpfRepresentante');
  if (!el) return;
  _partnerCpfRepWired = true;
  el.addEventListener('input', () => {
    const d = el.value.replace(/\D/g, '').slice(0, 11);
    el.value = _formatCpf(d);
  });
}

function _wirePartnerCnpjLookup() {
  if (_partnerCnpjWired) return;
  const el = document.getElementById('partnerCnpj');
  if (!el) return;
  _partnerCnpjWired = true;
  let debounce;
  el.addEventListener('input', () => {
    const d = el.value.replace(/\D/g, '');
    el.value = _formatCnpj(d);
    clearTimeout(debounce);
    const editing = !!document.getElementById('partnerRecordId')?.value;
    if (d.length === 14) {
      const repEmpty = !String(document.getElementById('partnerRepresentante')?.value || '').trim();
      if (editing && d === _partnerCnpjOnOpen && !repEmpty) {
        _setPartnerCnpjStatus('', '');
        return;
      }
      _setPartnerCnpjStatus('CNPJ completo — buscando…', 'muted');
      debounce = setTimeout(() => _onPartnerCnpjLookup(), 450);
    } else if (!d.length) _setPartnerCnpjStatus('', '');
  });
  el.addEventListener('blur', () => {
    const d = el.value.replace(/\D/g, '');
    const editing = !!document.getElementById('partnerRecordId')?.value;
    const repEmpty = !String(document.getElementById('partnerRepresentante')?.value || '').trim();
    if (editing && d === _partnerCnpjOnOpen && !repEmpty) return;
    if (d.length === 14) _onPartnerCnpjLookup();
  });
}

async function _populatePartnerComercialSelect(selectedId) {
  const sel = document.getElementById('partnerComercial');
  if (!sel) return;
  const users = await DB.getAllUsers().catch(() => []);
  const roles = new Set(['gerente', 'gerencia', 'admin', 'supervisor', 'master', 'fundador', 'desenvolvedor']);
  const opts = (users || []).filter(u => u.active !== false && roles.has(String(u.role || '').toLowerCase()));
  sel.innerHTML = '<option value="">— Selecione o comercial —</option>' +
    opts.map(u => `<option value="${u.id}">${u.name} (${u.role})</option>`).join('');
  if (selectedId) sel.value = selectedId;
}

function _partnerMetaFromForm() {
  const attachments = {};
  _PARTNER_DOC_KEYS.forEach((k) => {
    const hid = document.getElementById(`partnerDoc_${k}`);
    if (hid?.value) attachments[k] = hid.value;
    else if (_partnerAttachments[k]) attachments[k] = _partnerAttachments[k];
  });
  const pixType = document.getElementById('partnerPixType')?.value || 'cnpj';
  const pixKey = document.getElementById('partnerPixKey')?.value?.trim() || '';
  const irpjPct = parseFloat(String(document.getElementById('partnerRetencaoIrrf')?.value || '0').replace(',', '.')) || 0;
  return {
    simples_nacional: document.getElementById('partnerSimples')?.value === 'sim',
    comercial_id: document.getElementById('partnerComercial')?.value || '',
    retencao_irpj: irpjPct,
    retencao_irrf: irpjPct,
    taxa_saque: parseFloat(document.getElementById('partnerTaxaSaque')?.value || '10') || 10,
    ...(typeof PartnerPerms !== 'undefined' ? PartnerPerms.readCommissionTierMeta() : {}),
    status: document.getElementById('partnerStatus')?.value || 'analise',
    compliance_aprovado: document.getElementById('partnerCompliance')?.value === 'sim',
    credito_habilitado: !!document.getElementById('partnerCredito')?.checked,
    funcionario_limite: parseInt(document.getElementById('partnerFuncLimite')?.value || '0', 10) || 0,
    representante_legal: document.getElementById('partnerRepresentante')?.value?.trim() || '',
    cpf_representante: String(document.getElementById('partnerCpfRepresentante')?.value || '').replace(/\D/g, ''),
    attachments,
    bank: { pix_type: pixType, pix_key: pixKey },
    consultas: { ...(_partnerAttachments._consultas || {}) },
  };
}

function _fillPartnerMetaForm(meta) {
  if (!meta || typeof meta !== 'object') return;
  const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
  set('partnerSimples', meta.simples_nacional ? 'sim' : 'nao');
  set('partnerRetencaoIrrf', meta.retencao_irpj ?? meta.retencao_irrf ?? '');
  set('partnerTaxaSaque', meta.taxa_saque ?? 10);
  if (typeof PartnerPerms !== 'undefined') PartnerPerms.fillCommissionTierForm(meta);
  set('partnerFuncLimite', meta.funcionario_limite ?? '');
  set('partnerRepresentante', meta.representante_legal ?? '');
  const cpfRep = meta.cpf_representante || '';
  set('partnerCpfRepresentante', cpfRep ? _formatCpf(cpfRep) : '');
  set('partnerStatus', meta.status || 'analise');
  set('partnerCompliance', meta.compliance_aprovado ? 'sim' : 'nao');
  const cred = document.getElementById('partnerCredito');
  if (cred) cred.checked = !!meta.credito_habilitado;
  if (meta.comercial_id) { /* preenchido em openPartnerModal */ }
  if (meta.bank) {
    set('partnerPixType', meta.bank.pix_type || 'cnpj');
    set('partnerPixKey', meta.bank.pix_key || '');
  }
  const attMap = _partnerAttachmentsMap(meta.attachments);
  _partnerAttachments = { ...attMap, _consultas: meta.consultas || {} };
  _PARTNER_DOC_KEYS.forEach((k) => {
    const lbl = document.getElementById(`partnerDocLabel_${k}`);
    const hid = document.getElementById(`partnerDoc_${k}`);
    const url = attMap[k];
    if (hid) hid.value = url || '';
    if (lbl) {
      const link = url && typeof partnerAttachmentLinkHtml === 'function'
        ? partnerAttachmentLinkHtml(url)
        : '';
      lbl.innerHTML = link || _partnerDocDefaultLabel(k);
    }
  });
  const scoreEl = document.getElementById('partnerConsultaScoreResult');
  const certEl = document.getElementById('partnerConsultaCertidaoTjResult');
  if (scoreEl && meta.consultas?.score) scoreEl.innerHTML = _partnerConsultaHtml('score', meta.consultas.score);
  const certData = meta.consultas?.certidao_tj || meta.consultas?.pgfn;
  if (certEl && certData) certEl.innerHTML = _partnerConsultaHtml('certidao', certData);
}

function _partnerConsultaEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function _partnerConsultaPick(obj, keys) {
  if (!obj || typeof obj !== 'object') return '';
  for (const k of keys) {
    const v = obj[k];
    if (v != null && v !== '' && typeof v !== 'object') return String(v);
  }
  return '';
}

function _partnerConsultaFmtBool(v) {
  if (v === true || String(v).toLowerCase() === 'true') return 'Sim';
  if (v === false || String(v).toLowerCase() === 'false') return 'Não';
  return v == null || v === '' ? '' : String(v);
}

function _partnerConsultaFmtDoc(doc) {
  const d = String(doc || '').replace(/\D/g, '');
  if (d.length === 11) return _formatCpf(d);
  if (d.length === 14) return _formatCnpj(d);
  return String(doc || '').trim();
}

function _partnerConsultaFmtProcessoNum(n) {
  const raw = String(n || '').replace(/\D/g, '');
  if (raw.length === 20) {
    return `${raw.slice(0, 7)}-${raw.slice(7, 9)}.${raw.slice(9, 13)}.${raw.slice(13, 14)}.${raw.slice(14, 16)}.${raw.slice(16, 20)}`;
  }
  return String(n || '').trim();
}

function _partnerConsultaTjFieldLabel(key) {
  const map = {
    numeroProcesso: 'Número do processo',
    numero_processo: 'Número do processo',
    instancia: 'Instância',
    justicaGratuita: 'Justiça gratuita',
    justica_gratuita: 'Justiça gratuita',
    segredoJustica: 'Segredo de justiça',
    segredo_justica: 'Segredo de justiça',
    processoDigital: 'Processo digital',
    processo_digital: 'Processo digital',
    tutelaAntecipada: 'Tutela antecipada',
    tutela_antecipada: 'Tutela antecipada',
    prioritario: 'Prioritário',
    tribunal: 'Tribunal',
    orgaoResponsavel: 'Vara / órgão julgador',
    orgao_responsavel: 'Vara / órgão julgador',
    unidadeOrigem: 'Comarca / cidade',
    unidade_origem: 'Comarca / cidade',
    uf: 'Estado (UF)',
    classe: 'Classe processual',
    assunto: 'Assunto',
    dataDistribuicao: 'Data de distribuição',
    data_distribuicao: 'Data de distribuição',
    dataAutuacao: 'Data de autuação',
    valorCausa: 'Valor da causa',
    situacao: 'Situação',
    status: 'Status',
    grau: 'Grau',
    comarca: 'Comarca',
    sistema: 'Sistema',
  };
  if (map[key]) return map[key];
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function _partnerConsultaTjFmtValue(key, val) {
  if (val == null || val === '') return '';
  if (typeof val === 'boolean') return _partnerConsultaFmtBool(val);
  const lk = String(key || '').toLowerCase();
  if (lk.includes('processo') && lk.includes('numero')) return _partnerConsultaFmtProcessoNum(val);
  if (lk === 'cpf' || lk === 'documentoconsultado' || lk === 'documento_consultado') return _partnerConsultaFmtDoc(val);
  if (/justica|segredo|digital|tutela|priorit/i.test(lk)) return _partnerConsultaFmtBool(val);
  if (typeof val === 'number' && lk === 'instancia') return `${val}ª instância`;
  return String(val).trim();
}

function _partnerConsultaTjProcessoFields(p) {
  if (!p || typeof p !== 'object') return [];
  const oj = p.orgaoJulgador || p.orgao_julgador || {};
  const rows = [
    ['numeroProcesso', p.numeroProcesso || p.numero_processo],
    ['instancia', p.instancia],
    ['tribunal', oj.tribunal],
    ['orgaoResponsavel', oj.orgaoResponsavel || oj.orgao_responsavel],
    ['unidadeOrigem', oj.unidadeOrigem || oj.unidade_origem],
    ['uf', oj.uf],
    ['classe', p.classe || p.classeProcessual || p.classe_processual],
    ['assunto', p.assunto || p.assuntoPrincipal || p.assunto_principal],
    ['dataDistribuicao', p.dataDistribuicao || p.data_distribuicao || p.dataAutuacao],
    ['valorCausa', p.valorCausa || p.valor_causa],
    ['situacao', p.situacao || p.status],
    ['justicaGratuita', p.justicaGratuita ?? p.justica_gratuita],
    ['segredoJustica', p.segredoJustica ?? p.segredo_justica],
    ['processoDigital', p.processoDigital ?? p.processo_digital],
    ['tutelaAntecipada', p.tutelaAntecipada ?? p.tutela_antecipada],
    ['prioritario', p.prioritario],
  ];
  const out = [];
  const seen = new Set();
  rows.forEach(([k, v]) => {
    const val = _partnerConsultaTjFmtValue(k, v);
    if (!val) return;
    const label = _partnerConsultaTjFieldLabel(k);
    if (seen.has(label)) return;
    seen.add(label);
    out.push([label, val]);
  });
  return out;
}

function _partnerConsultaTjHtml(d) {
  const processos = d.processos || d.Processos;
  if (!Array.isArray(processos) || !processos.length) return '';
  const doc = d.documentoConsultado || d.DocumentoConsultado || d.cpf || d.cpfCnpj || d.documento;
  const docFmt = doc ? _partnerConsultaFmtDoc(doc) : '';
  const total = processos.length;
  const cards = processos.map((p, i) => {
    const fields = _partnerConsultaTjProcessoFields(p);
    if (!fields.length) return '';
    const body = fields.map(([l, v]) =>
      `<tr><td style="padding:5px 10px 5px 0;color:var(--color-text-muted);vertical-align:top;">${_partnerConsultaEsc(l)}</td>
       <td style="padding:5px 0;font-weight:600;">${_partnerConsultaEsc(v)}</td></tr>`
    ).join('');
    return `<div style="margin-top:12px;padding:12px;border:1px solid var(--color-border);border-radius:8px;background:#fff;">
      <div style="font-weight:800;font-size:13px;margin-bottom:8px;color:var(--color-primary);">Processo ${i + 1} de ${total}</div>
      <table style="width:100%;font-size:13px;border-collapse:collapse;">${body}</table></div>`;
  }).join('');
  const header = docFmt
    ? `<p style="margin:8px 0 0;font-size:13px;"><span style="color:var(--color-text-muted);">CPF consultado:</span> <strong>${_partnerConsultaEsc(docFmt)}</strong></p>`
    : '';
  const summary = `<p style="margin:6px 0 0;font-size:12px;color:var(--color-text-muted);">${total} processo${total === 1 ? '' : 's'} encontrado${total === 1 ? '' : 's'} nos tribunais.</p>`;
  return `<div class="partner-consulta-card" style="padding:12px;background:var(--color-surface-2);border-radius:8px;">
    <div style="font-weight:800;font-size:14px;">Processos nos tribunais (consulta completa)</div>
    ${header}${summary}${cards}</div>`;
}

function _partnerConsultaFlatten(obj, prefix = '', depth = 0) {
  const rows = [];
  if (depth > 4 || obj == null) return rows;
  if (typeof obj !== 'object') {
    if (obj !== '' && prefix) rows.push([prefix, String(obj)]);
    return rows;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      if (item != null && typeof item === 'object') {
        rows.push(..._partnerConsultaFlatten(item, prefix, depth + 1));
      } else if (item != null && item !== '') {
        rows.push([prefix || `Item ${i + 1}`, String(item)]);
      }
    });
    return rows;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'api_raw' || k === 'raw') continue;
    const label = prefix
      ? `${prefix} · ${k.replace(/_/g, ' ')}`
      : k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    if (v == null || v === '') continue;
    if (typeof v === 'object') rows.push(..._partnerConsultaFlatten(v, label, depth + 1));
    else rows.push([label, typeof v === 'boolean' ? _partnerConsultaFmtBool(v) : String(v)]);
  }
  return rows;
}

function _partnerConsultaRows(kind, raw) {
  const rows = [];
  const push = (label, val) => {
    if (val == null || val === '') return;
    if (typeof val === 'object') return;
    rows.push([label, String(val)]);
  };
  const d = raw?.data ?? raw?.retorno ?? raw?.resultado ?? raw?.empresa ?? raw;
  if (!d || typeof d !== 'object') return rows;

  if (kind === 'score') {
    push('Pontuação de crédito', _partnerConsultaPick(d, ['score', 'scoreCredito', 'pontuacao', 'nota', 'valorScore', 'score_quod']));
    push('Classificação de risco', _partnerConsultaPick(d, ['rating', 'classificacao', 'faixa', 'risco', 'nivel_risco', 'classificacaoRisco']));
    push('Situação cadastral', _partnerConsultaPick(d, ['situacao', 'status', 'situacao_cadastral', 'situacaoCadastral']));
    push('Razão social', _partnerConsultaPick(d, ['razao_social', 'razaoSocial', 'nomeEmpresarial', 'nome_empresarial']));
    push('CNPJ', _partnerConsultaFmtDoc(_partnerConsultaPick(d, ['cnpj', 'ni', 'numeroInscricao'])));
    push('Observação', _partnerConsultaPick(d, ['mensagem', 'message', 'descricao', 'observacao']));
  } else {
    push('Tipo de certidão', _partnerConsultaPick(d, ['certidao', 'tipo_certidao', 'tipo', 'tipoCertidao']));
    push('Resultado', _partnerConsultaPick(d, ['resultado', 'parecer', 'situacao', 'status', 'conclusao', 'certidao_positiva', 'certidao_negativa']));
    push('Validade', _partnerConsultaPick(d, ['validade', 'data_validade', 'valido_ate', 'dataValidade', 'data_emissao']));
    push('Número / protocolo', _partnerConsultaPick(d, ['numero', 'numero_certidao', 'protocolo', 'codigoControle', 'codigo_autenticidade']));
    push('Tribunal / órgão', _partnerConsultaPick(d, ['orgao', 'tribunal', 'nomeOrgao', 'nome_orgao']));
    push('Documento consultado', _partnerConsultaFmtDoc(_partnerConsultaPick(d, ['cpf_cnpj', 'cpfCnpj', 'documento', 'cnpj', 'cpf', 'documentoConsultado'])));
    push('Observação', _partnerConsultaPick(d, ['mensagem', 'message', 'descricao']));
  }

  if (rows.length < 2) {
    const flat = _partnerConsultaFlatten(d);
    const seen = new Set(rows.map(r => r[0]));
    for (const [l, v] of flat) {
      if (seen.has(l)) continue;
      if (String(v).length > 500) continue;
      rows.push([l, v]);
      if (rows.length >= 12) break;
    }
  }
  return rows;
}

function _partnerConsultaHtml(kind, raw) {
  const d = raw?.data ?? raw?.retorno ?? raw?.resultado ?? raw;
  if (kind !== 'score' && d && typeof d === 'object' && Array.isArray(d.processos || d.Processos) && (d.processos || d.Processos).length) {
    const tjHtml = _partnerConsultaTjHtml(d);
    if (tjHtml) return tjHtml;
  }
  const rows = _partnerConsultaRows(kind, raw);
  const title = kind === 'score' ? 'Score de crédito (Quod)' : 'Certidão / processos';
  if (!rows.length) {
    return `<div class="partner-consulta-card" style="padding:10px;background:var(--color-surface-2);border-radius:8px;font-size:13px;">
      <strong>${_partnerConsultaEsc(title)}</strong><p class="text-muted" style="margin:6px 0 0;">Consulta realizada — dados recebidos sem campos legíveis na resposta.</p></div>`;
  }
  const body = rows.map(([l, v]) =>
    `<tr><td style="padding:5px 10px 5px 0;color:var(--color-text-muted);vertical-align:top;white-space:nowrap;">${_partnerConsultaEsc(l)}</td>
     <td style="padding:5px 0;font-weight:600;">${_partnerConsultaEsc(v)}</td></tr>`
  ).join('');
  return `<div class="partner-consulta-card" style="padding:12px;background:var(--color-surface-2);border-radius:8px;">
    <div style="font-weight:800;font-size:14px;margin-bottom:8px;">${_partnerConsultaEsc(title)}</div>
    <table style="width:100%;font-size:13px;border-collapse:collapse;">${body}</table></div>`;
}

function _resetPartnerAttachments() {
  _partnerAttachments = {};
  _PARTNER_DOC_KEYS.forEach((k) => {
    const inp = document.getElementById(`partnerDocFile_${k}`);
    const hid = document.getElementById(`partnerDoc_${k}`);
    const lbl = document.getElementById(`partnerDocLabel_${k}`);
    if (inp) inp.value = '';
    if (hid) hid.value = '';
    if (lbl) lbl.innerHTML = _partnerDocDefaultLabel(k);
  });
}

async function _partnerPersistAttachment(partnerId, key, url) {
  if (!partnerId || !key || !url) return;
  const p = await DB.getPartner(partnerId).catch(() => null);
  if (!p) return;
  const meta = _parsePartnerJsonField(p.meta, {});
  const att = _partnerAttachmentsMap(meta.attachments);
  att[key] = url;
  await DB.savePartner({ ...p, meta: { ...meta, attachments: att } });
}

async function _partnerUploadDoc(input, key) {
  const file = input?.files?.[0];
  if (!file) return;
  const lbl = document.getElementById(`partnerDocLabel_${key}`);
  if (lbl) lbl.textContent = 'Enviando…';
  try {
    const url = await uploadImage(file, 'partner-docs', `${key}_${Date.now()}`);
    if (!url || (typeof _isInlineAttachmentUrl === 'function' && _isInlineAttachmentUrl(url))) {
      throw new Error('O servidor não aceitou o arquivo. Use PDF/JPG/PNG.');
    }
    _partnerAttachments[key] = url;
    const hid = document.getElementById(`partnerDoc_${key}`);
    if (hid) hid.value = url;
    if (lbl) {
      const link = typeof partnerAttachmentLinkHtml === 'function'
        ? partnerAttachmentLinkHtml(url)
        : `<a href="${url}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation(); openAttachmentUrl(this.href); return false;">Ver anexo</a>`;
      lbl.innerHTML = `${link} <span style="color:var(--color-success);">(${file.name})</span>`;
    }
    const partnerId = document.getElementById('partnerRecordId')?.value || '';
    if (partnerId) {
      await _partnerPersistAttachment(partnerId, key, url);
      showToast('Documento salvo no cadastro do parceiro.', 'success');
    } else {
      showToast('Anexo enviado. Salve o parceiro para concluir.', 'success');
    }
  } catch (e) {
    if (lbl) lbl.innerHTML = '<span style="color:var(--color-danger);">Falha no upload</span>';
    showToast('Erro ao enviar anexo: ' + (e.message || ''), 'error');
  }
}

function _partnerCnpjFromForm() {
  return String(document.getElementById('partnerCnpj')?.value || '').replace(/\D/g, '');
}

function _partnerCpfRepresentanteFromForm() {
  return String(document.getElementById('partnerCpfRepresentante')?.value || '').replace(/\D/g, '');
}

const _PARTNER_FONTE_COST = {
  cnpj: '≈ R$ 0,16',
  cpfSocio: '≈ R$ 4,20',
  score: '≈ R$ 2,97',
  tj: '≈ R$ 4,95',
};

function _partnerConsultaSavedNote(kind) {
  const label = kind === 'score' ? 'score' : 'processos TJ';
  return `<p class="form-hint" style="margin:8px 0 0;">Resultado de ${label} já salvo — reabrir o parceiro não cobra de novo. Use «Atualizar» só se precisar de consulta nova.</p>`;
}

async function _partnerFonteDataConsulta(kind, opts) {
  if (typeof FonteData === 'undefined') {
    showToast('Módulo FonteData não carregado — recarregue a página (Ctrl+F5).', 'warning');
    return null;
  }
  const refresh = !!(opts && opts.refresh);
  if (kind === 'score') {
    const cnpj = _partnerCnpjFromForm();
    if (cnpj.length !== 14) {
      showToast('Informe o CNPJ completo (14 dígitos) no campo CNPJ registro.', 'warning');
      return null;
    }
    if (typeof FonteData.lookupScoreQuod === 'function') return FonteData.lookupScoreQuod(cnpj, { refresh });
    if (typeof FonteData.lookupCnpj === 'function') return FonteData.lookupCnpj(cnpj, 'score-credito-quod', { refresh });
    return { ok: false, error: 'Consulta de score indisponível — atualize js/fontedata.js no servidor.' };
  }
  const cpf = _partnerCpfRepresentanteFromForm();
  if (cpf.length !== 11) {
    showToast('Informe o CPF do representante legal (11 dígitos) para consultar processos TJ.', 'warning');
    return null;
  }
  if (typeof FonteData.lookupTjCertidao === 'function') return FonteData.lookupTjCertidao(cpf, { refresh });
  return { ok: false, error: 'Consulta TJ indisponível — atualize js/fontedata.js e api/fontedata.php no servidor.' };
}

async function partnerConsultaScore(forceRefresh) {
  const el = document.getElementById('partnerConsultaScoreResult');
  const existing = _partnerAttachments._consultas?.score;
  if (existing && !forceRefresh) {
    if (el) el.innerHTML = _partnerConsultaHtml('score', existing) + _partnerConsultaSavedNote('score');
    return;
  }
  const msg = forceRefresh
    ? `Atualizar score de crédito do CNPJ?\n\nNova cobrança FonteData: ${_PARTNER_FONTE_COST.score}`
    : `Consultar score de crédito do CNPJ?\n\nCusto FonteData: ${_PARTNER_FONTE_COST.score}`;
  if (!confirm(msg)) return;
  if (el) el.textContent = 'Consultando score de crédito (CNPJ)…';
  const res = await _partnerFonteDataConsulta('score', { refresh: !!forceRefresh });
  if (!res) { if (el) el.textContent = ''; return; }
  if (!res.ok) {
    if (el) el.textContent = res.error || 'Erro na consulta';
    return;
  }
  _partnerAttachments._consultas = _partnerAttachments._consultas || {};
  _partnerAttachments._consultas.score = res.raw;
  if (el) {
    el.innerHTML = _partnerConsultaHtml('score', res.raw)
      + (res.cached ? '<p class="form-hint" style="margin:8px 0 0;">Carregado do cache do servidor (sem nova cobrança).</p>' : '');
  }
  if (res.cached) showToast('Score carregado do cache (sem cobrança).', 'success');
}

async function partnerConsultaCertidaoTj(forceRefresh) {
  const el = document.getElementById('partnerConsultaCertidaoTjResult');
  const existing = _partnerAttachments._consultas?.certidao_tj;
  if (existing && !forceRefresh) {
    if (el) el.innerHTML = _partnerConsultaHtml('certidao', existing) + _partnerConsultaSavedNote('certidao');
    return;
  }
  const msg = forceRefresh
    ? `Atualizar processos TJ do representante?\n\nNova cobrança FonteData: ${_PARTNER_FONTE_COST.tj}`
    : `Consultar processos judiciais (TJ completo) do CPF do representante?\n\nCusto FonteData: ${_PARTNER_FONTE_COST.tj}`;
  if (!confirm(msg)) return;
  if (el) el.textContent = 'Consultando processos TJ (CPF do representante)…';
  const res = await _partnerFonteDataConsulta('certidao', { refresh: !!forceRefresh });
  if (!res) { if (el) el.textContent = ''; return; }
  if (!res.ok) {
    if (el) el.textContent = res.error || 'Erro na consulta';
    return;
  }
  _partnerAttachments._consultas = _partnerAttachments._consultas || {};
  _partnerAttachments._consultas.certidao_tj = res.raw;
  if (el) {
    el.innerHTML = _partnerConsultaHtml('certidao', res.raw)
      + (res.cached ? '<p class="form-hint" style="margin:8px 0 0;">Carregado do cache do servidor (sem nova cobrança).</p>' : '');
  }
  if (res.cached) showToast('Processos TJ carregados do cache (sem cobrança).', 'success');
}
window.partnerConsultaScore = partnerConsultaScore;
window.partnerConsultaCertidaoTj = partnerConsultaCertidaoTj;

function _formatCpf(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

let _empCpfWired = false;

function _setEmpCpfStatus(msg, tone) {
  const el = document.getElementById('empCpfStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = tone === 'success'
    ? 'var(--color-success)'
    : tone === 'warning'
      ? 'var(--color-warning)'
      : 'var(--color-text-muted)';
}

function _applyFonteDataToEmployeeForm(client, onlyEmpty) {
  if (!client) return;
  const map = {
    empCpf: client.cpf,
    empName: client.name,
    empContato: client.phone1 || client.phone2,
    empEmail: client.email,
  };
  Object.keys(map).forEach((id) => {
    const fld = document.getElementById(id);
    const val = map[id];
    if (!fld || val == null || String(val).trim() === '') return;
    if (onlyEmpty && String(fld.value || '').trim() !== '') return;
    fld.value = id === 'empCpf' ? _formatCpf(val) : val;
  });
}

async function _onEmpCpfLookup() {
  const el = document.getElementById('empCpf');
  if (!el || typeof FonteData === 'undefined') return;
  const cpf = el.value.replace(/\D/g, '');
  if (cpf.length !== 11) return;

  const empId = document.getElementById('editEmpId')?.value || '';
  const onlyEmpty = !!empId;

  try {
    const local = typeof DB.getUserByCpf === 'function'
      ? await DB.getUserByCpf(cpf).catch(() => null)
      : null;
    if (local?.name) {
      if (empId && local.id === empId) return;
      _applyFonteDataToEmployeeForm({
        cpf,
        name: local.name,
        phone1: local.phone || local.phone1,
        phone2: local.phone2,
        email: local.email,
      }, onlyEmpty);
      _setEmpCpfStatus('CPF já cadastrado para outro funcionário — dados carregados do sistema.', 'warning');
      return;
    }
  } catch (_) { /* segue FonteData */ }

  _setEmpCpfStatus('Consultando FonteData…', 'muted');
  const res = await FonteData.lookupCpf(cpf);
  if (!res.ok) {
    _setEmpCpfStatus(res.error || 'Não foi possível consultar o CPF.', 'warning');
    return;
  }
  _applyFonteDataToEmployeeForm(res.client, onlyEmpty);
  _setEmpCpfStatus('Dados preenchidos automaticamente (FonteData). Revise antes de salvar.', 'success');
  if (typeof showToast === 'function') {
    showToast('Dados do CPF carregados. Confira nome, contato e e-mail.', 'success', 5000);
  }
}

function _wireEmpCpfLookup() {
  if (_empCpfWired) return;
  const el = document.getElementById('empCpf');
  if (!el) return;
  _empCpfWired = true;
  let debounce;
  const run = () => _onEmpCpfLookup();
  el.addEventListener('input', () => {
    const d = el.value.replace(/\D/g, '');
    el.value = _formatCpf(d);
    clearTimeout(debounce);
    if (d.length === 11) {
      _setEmpCpfStatus('CPF completo — buscando dados…', 'muted');
      debounce = setTimeout(run, 450);
    } else if (!d.length) {
      _setEmpCpfStatus('', '');
    } else {
      _setEmpCpfStatus('Digite os 11 dígitos do CPF para buscar os dados.', 'muted');
    }
  });
  el.addEventListener('blur', run);
}

const _PARTNER_ROLE_LABELS = {
  vendedor: ' Vendedor',
  operacional: ' Operacional',
  backoffice: ' Backoffice',
  rh: ' RH',
  financeiro: ' Financeiro',
  financial: ' Financeiro',
  employee: ' Colaborador',
};

function _partnerOrgIds(rootId, team) {
  const ids = new Set([String(rootId)]);
  (team || []).forEach(e => ids.add(String(e.id)));
  return ids;
}

function _proposalInPartnerOrg(p, ids) {
  const primary = typeof DB.proposalVendorId === 'function'
    ? DB.proposalVendorId(p)
    : String(p?.vendorId || p?.vendor_id || p?.employee_id || '').trim();
  if (primary && ids.has(String(primary))) return true;
  if (primary) return false;
  const vidList = typeof DB._proposalVendorIds === 'function'
    ? DB._proposalVendorIds(p)
    : [p.vendorId, p.vendor_id, p.employee_id];
  return vidList.some(id => id && ids.has(String(id)));
}

function _clientInPartnerOrg(c, ids) {
  const sid = c.supervisorId || c.supervisor_id;
  return sid && ids.has(String(sid));
}

function _partnerOrgStats(rootId, team, proposals, clients) {
  const ids = _partnerOrgIds(rootId, team);
  const props = (proposals || []).filter(p => _proposalInPartnerOrg(p, ids));
  const clis = (clients || []).filter(c => _clientInPartnerOrg(c, ids));

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const inMonth = (p) => (typeof DB.proposalInDateRange === 'function'
    ? DB.proposalInDateRange(p, monthStart, monthEnd)
    : (() => {
      const d = typeof DB.proposalBillingDate === 'function'
        ? DB.proposalBillingDate(p)
        : new Date(p.createdAt || p.created_at || 0);
      return d >= monthStart && d < monthEnd;
    })());
  const propsMonth = props.filter(inMonth);

  const propAmt = (p) => (typeof DB !== 'undefined' && DB.proposalAmount
    ? DB.proposalAmount(p)
    : 0);
  const propVid = (p) => (typeof DB.proposalVendorId === 'function'
    ? DB.proposalVendorId(p)
    : String(p?.vendorId || p?.vendor_id || p?.employee_id || '').trim());
  const fmtSum = arr => arr.reduce((s, p) => s + propAmt(p), 0);
  const byStatus = {};
  props.forEach(p => {
    const st = p.status || '—';
    byStatus[st] = (byStatus[st] || 0) + 1;
  });

  const byVendor = {};
  propsMonth.forEach(p => {
    const vid = propVid(p);
    const key = vid || '__sem_vendedor__';
    if (!byVendor[key]) {
      byVendor[key] = {
        id: key,
        name: vid ? (p.vendorName || p.vendor_name || '—') : 'Sem vendedor',
        count: 0,
        total: 0,
      };
    }
    byVendor[key].count += 1;
    byVendor[key].total += propAmt(p);
  });

  const activeTeam = _sortEmpByName((team || []).filter(e => e.active !== false));
  const rootInTeam = team.find(e => e.id === rootId);

  return {
    ids,
    team: team || [],
    activeTeam,
    rootInTeam,
    clients: clis,
    proposals: props,
    propsMonth,
    totalBilling: fmtSum(props),
    monthBilling: fmtSum(propsMonth),
    countPaid: props.filter(p => (typeof DB !== 'undefined' && typeof DB.isPaidProposal === 'function'
      ? DB.isPaidProposal(p)
      : String(p.status || '').toLowerCase().includes('pago'))).length,
    countOpen: props.filter(p => {
      if (typeof DB !== 'undefined' && typeof DB.isPaidProposal === 'function' && typeof DB.isCancelledProposal === 'function') {
        return !DB.isPaidProposal(p) && !DB.isCancelledProposal(p);
      }
      return !['pago', 'cancelado'].includes(String(p.status || '').toLowerCase());
    }).length,
    byStatus,
    byVendor: Object.values(byVendor).sort((a, b) => b.total - a.total),
    recent: [...props].sort((a, b) => {
      const sortFn = typeof DB !== 'undefined' && DB.proposalSortTime ? (p) => DB.proposalSortTime(p) : (p) => new Date(p.createdAt || p.created_at || 0).getTime();
      return sortFn(b) - sortFn(a);
    }).slice(0, 5),
  };
}

function _renderPartnerDashboardBlock(p, u, stats) {
  const fmtR = v => 'R$ ' + parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const roleRows = ['vendedor', 'backoffice']
    .map(r => {
      const n = stats.team.filter(e => e.role === r).length;
      return n ? `<span class="badge badge-muted" style="font-size:10px;">${_PARTNER_ROLE_LABELS[r] || r}: ${n}</span>` : '';
    }).filter(Boolean).join(' ');

  const teamList = stats.activeTeam.length
    ? stats.activeTeam.map(e => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--color-border);">
          ${avatarHtml(e.name, 'avatar-sm', e.photo_url || '')}
          <div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:13px;">${e.name}</div><div style="font-size:11px;color:var(--color-text-muted);">${_PARTNER_ROLE_LABELS[e.role] || e.role} · ${e.department || '—'}</div></div><span class="badge badge-muted" style="font-size:10px;"> ${typeof formatMoney === 'function' ? formatMoney(userPts(e)) : userPts(e).toLocaleString('pt-BR')}</span></div>`).join('')
    : `<div class="text-muted text-center" style="padding:16px;font-size:13px;">Nenhum membro na equipe.${(IS_MASTER || IS_FUNDA) ? ` <button type="button" class="btn btn-primary btn-sm" style="margin-top:8px;" onclick="openPartnerTeamManage('${p.user_id}')">Cadastrar equipe</button>` : ' Cadastre em <strong>Funcionários</strong>.'}</div>`;

  const recentHtml = stats.recent.length
    ? stats.recent.map(pr => {
        const st = pr.status || '—';
        const badge = st === 'Pago' ? 'badge-success' : st === 'Cancelado' ? 'badge-danger' : 'badge-warning';
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--color-border);"><div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:13px;">${pr.numero || pr.id} · ${pr.clientName || '—'}</div><div style="font-size:11px;color:var(--color-text-muted);">${pr.vendorName || '—'} · ${(pr.createdAt || pr.created_at || '').slice(0, 10)}</div></div><span class="badge ${badge}" style="font-size:10px;">${st}</span><strong style="font-size:12px;color:var(--color-success);white-space:nowrap;">${fmtR(typeof DB.proposalAmount === 'function' ? DB.proposalAmount(pr) : 0)}</strong></div>`;
      }).join('')
    : '<div class="text-muted text-center" style="padding:16px;font-size:13px;">Nenhuma proposta desta organização.</div>';

  const maxV = Math.max(...stats.byVendor.map(v => v.total), 1);
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];
  const vendorBars = stats.byVendor.length
    ? stats.byVendor.slice(0, 6).map((v, i) => {
        const pct = Math.round((v.total / maxV) * 100);
        const cor = colors[i % colors.length];
        return `<div style="flex:1;min-width:64px;display:flex;flex-direction:column;align-items:center;gap:4px;"><div style="font-size:10px;font-weight:700;color:${cor};">${fmtR(v.total)}</div><div style="width:100%;height:72px;background:${cor}22;border-radius:6px 6px 0 0;display:flex;align-items:flex-end;"><div style="width:100%;height:${Math.max(pct, 4)}%;background:${cor};border-radius:6px 6px 0 0;"></div></div><div style="font-size:9px;color:var(--color-text-muted);text-align:center;max-width:72px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${v.name}">${v.name.split(' ')[0]}</div><div style="font-size:9px;color:var(--color-text-muted);">${v.count} prop.</div></div>`;
      }).join('')
    : '<div style="color:var(--color-text-muted);font-size:12px;padding:12px;">Sem propostas no mês.</div>';

  const statusTags = Object.entries(stats.byStatus).slice(0, 6)
    .map(([k, n]) => `<span class="badge badge-info" style="font-size:10px;">${k}: ${n}</span>`).join(' ');

  return `
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--color-border);"><div style="font-size:12px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px;">Dashboard da organização</div><div class="stat-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px;">${[
      statCardHtml({ icon: 'users', color: 'blue', label: 'Equipe', value: stats.activeTeam.length, sub: `${stats.team.length} cadastrados` }),
      statCardHtml({ icon: 'clients', color: 'green', label: 'Clientes', value: stats.clients.length, sub: 'da rede do parceiro' }),
      statCardHtml({ icon: 'proposals', color: 'orange', label: 'Propostas', value: stats.proposals.length, sub: `${stats.countOpen} em aberto · ${stats.countPaid} pagas` }),
      statCardHtml({ icon: 'billing', color: 'yellow', label: 'Faturamento (mês)', value: fmtR(stats.monthBilling), sub: `total ${fmtR(stats.totalBilling)}`, valueStyle: 'font-size:17px;' }),
    ].join('')}</div>
      ${roleRows ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">${roleRows}</div>` : ''}
      ${statusTags ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">${statusTags}</div>` : ''}
      <div class="card card-padded" style="margin-bottom:12px;background:var(--color-surface-2);"><h4 style="font-size:13px;font-weight:700;margin:0 0 10px;">Faturamento por vendedor — este mês</h4><div style="display:flex;align-items:flex-end;gap:8px;min-height:90px;overflow-x:auto;">${vendorBars}</div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;"><div class="card card-padded" style="padding:14px;"><h4 style="font-family:var(--font-display);font-weight:800;font-size:14px;margin:0 0 10px;"> Equipe do parceiro</h4>
          ${u && !stats.rootInTeam ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--color-border);margin-bottom:8px;"><div><div style="font-weight:700;font-size:13px;">${u.name || p.contato}</div><div style="font-size:11px;color:var(--color-text-muted);">Parceiro (gestor)</div></div><span class="badge badge-muted" style="font-size:10px;"> ${typeof formatMoney === 'function' ? formatMoney(userPts(u)) : userPts(u).toLocaleString('pt-BR')}</span></div>` : ''}
          <div>${teamList}</div></div><div class="card card-padded" style="padding:14px;"><h4 style="font-family:var(--font-display);font-weight:800;font-size:14px;margin:0 0 10px;"> Últimas propostas</h4><div>${recentHtml}</div></div></div></div>`;
}

function _parsePartnerJsonField(val, fallback) {
  if (val == null) return fallback;
  if (typeof val === 'object' && !Array.isArray(val)) return val;
  try {
    const p = JSON.parse(String(val));
    return (p && typeof p === 'object' && !Array.isArray(p)) ? p : fallback;
  } catch (_) {
    return fallback;
  }
}

async function renderPartnersPanel() {
  if (document.getElementById('tab-parceiro') && typeof window.renderRhPartnersPanel === 'function') {
    return window.renderRhPartnersPanel();
  }
  if (!_canManagePartnersHub()) return;
  const box = document.getElementById('partnersContent');
  if (!box) return;

  const permsEl = document.getElementById('partnerPermsCheckboxes');
  if (permsEl && typeof PartnerPerms !== 'undefined' && !permsEl.dataset.filled) {
    permsEl.innerHTML = PartnerPerms.renderCheckboxesHtml('partnerPermsCheckboxes');
    permsEl.dataset.filled = '1';
  }
  if (typeof PartnerPerms !== 'undefined') PartnerPerms.ensureTeamPermsUi('partnerTeamPermsCheckboxes');

  let [partners, users, rawProps, rawClients] = await Promise.all([
    DB.getPartners().catch(() => []),
    DB.getAllUsers().catch(() => []),
    DB.getProposals().catch(() => []),
    DB.getClients({ pageSize: 800 }).catch(() => []),
  ]);

  if (partners.length && typeof DB.syncPartnerWithdrawalDebits === 'function') {
    await Promise.all(
      partners.filter(p => p.user_id).map(p => DB.syncPartnerWithdrawalDebits(p.user_id).catch(() => null))
    );
    if (typeof invalidateSouBluCaches === 'function') invalidateSouBluCaches();
    users = await DB.getAllUsers().catch(() => users);
  }

  const allProposals = Array.isArray(rawProps) ? rawProps : [];
  const allClients = Array.isArray(rawClients) ? rawClients : [];

  if (!partners.length) {
    box.innerHTML = `<div class="card card-padded" style="text-align:center;padding:40px;color:var(--color-text-muted);">
      Nenhum parceiro cadastrado.<br><button class="btn btn-primary btn-sm" style="margin-top:14px;" onclick="openPartnerModal()"> Cadastrar parceiro</button></div>`;
    return;
  }

  let netProps = 0;
  let netClients = 0;
  let netBilling = 0;

  const _partnerStatusOf = (p) => {
    const st = String(p?.meta?.status || '').trim().toLowerCase();
    if (st) return st;
    return p.active !== false ? 'ativo' : 'inativo';
  };
  const _partnerIsLive = (p, u) => {
    const st = _partnerStatusOf(p);
    return st === 'ativo' && p.active !== false && u?.active !== false;
  };

  const cardsHtml = partners.map(p => {
    const u = users.find(x => x.id === p.user_id);
    const team = users.filter(e => DB.PARTNER_TEAM_ROLES.includes(e.role) && e.admin_id === p.user_id);
    const stats = _partnerOrgStats(p.user_id, team, allProposals, allClients);
    netProps += stats.proposals.length;
    netClients += stats.clients.length;
    netBilling += stats.monthBilling;

    const pStatus = _partnerStatusOf(p);
    const statusLabels = { ativo: 'Ativo', analise: 'Em análise', reprovado: 'Reprovado', inativo: 'Inativo' };
    const statusBadge = `<span class="badge ${pStatus === 'ativo' ? 'badge-success' : pStatus === 'analise' ? 'badge-warning' : 'badge-muted'}">${statusLabels[pStatus] || pStatus}</span>`;
    const live = _partnerIsLive(p, u);
    const perms = typeof PartnerPerms !== 'undefined' ? PartnerPerms.merge(p.permissions) : (p.permissions || {});
    const permTags = Object.keys(perms).filter(k => perms[k] && k !== '_meta').slice(0, 6)
      .map(k => `<span class="badge badge-muted" style="font-size:10px;">${(PartnerPerms.LABELS[k] || k).split('—')[0].trim()}</span>`).join(' ');
    const pendingHint = pStatus === 'analise'
      ? '<div style="margin-top:8px;padding:8px 10px;background:#f59e0b18;border-radius:8px;font-size:12px;color:#b45309;">Aguardando ativação — revise documentos, marque Compliance e clique em <strong>Ativar parceiro</strong>.</div>'
      : '';

    const actionBtns = pStatus === 'analise'
      ? `<button class="btn btn-primary btn-sm" onclick="partnerActivate('${p.id}')"> Ativar parceiro</button>`
      : `<button class="btn btn-primary btn-sm" onclick="openPartnerBalanceModal('${p.user_id}')" ${live ? '' : 'disabled title="Ative o parceiro primeiro"'}> Distribuir saldo</button>
         <button class="btn btn-outline btn-sm" onclick="openPartnerTeamManage('${p.user_id}')" ${live ? '' : 'disabled title="Ative o parceiro primeiro"'}> Cadastrar equipe</button>`;
    const toggleBtn = pStatus === 'analise'
      ? ''
      : `<button class="btn btn-ghost btn-sm" onclick="partnerToggleActive('${p.id}')">${live ? ' Desativar' : ' Ativar'}</button>`;

    const tierBadge = typeof PartnerPerms !== 'undefined' ? PartnerPerms.tierBadgeHtml(p) : '';
    return `<div class="card card-padded" style="margin-bottom:var(--space-lg);${pStatus === 'analise' ? 'border-left:4px solid #f59e0b;' : ''}"><div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;"><div style="flex:1;min-width:220px;"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span style="font-family:var(--font-display);font-size:17px;font-weight:800;">${p.razao_social || u?.name || 'Parceiro'}</span><span class="badge badge-info"> Parceiro</span>
            ${statusBadge}
            ${tierBadge}
            ${!live && pStatus !== 'analise' ? '<span class="badge badge-danger">Inativo</span>' : ''}
          </div><div style="font-size:13px;color:var(--color-text-muted);margin-top:6px;line-height:1.5;">
            CNPJ: <strong>${_formatCnpj(p.cnpj) || '—'}</strong><br>
            ${p.endereco || '—'}<br>
            Contato: ${p.contato || '—'} · ${p.email || u?.email || '—'}
          </div>${pendingHint}<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;">${permTags}</div></div><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start;">${actionBtns}<button class="btn btn-ghost btn-sm" onclick="openPartnerModal('${p.id}')"> Editar</button>${toggleBtn}</div></div>
      ${pStatus === 'ativo' ? _renderPartnerDashboardBlock(p, u, stats) : '<p style="margin-top:12px;font-size:13px;color:var(--color-text-muted);">Painel operacional liberado após ativação.</p>'}
    </div>`;
  }).join('');

  const fmtR = v => 'R$ ' + parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const summaryHtml = `
    <div class="stat-grid" style="margin-bottom:var(--space-lg);">${[
      statCardHtml({ icon: 'partners', color: 'blue', label: 'Parceiros ativos', value: partners.filter(x => x.active !== false).length, sub: `${partners.length} cadastrados` }),
      statCardHtml({ icon: 'proposals', color: 'orange', label: 'Propostas (rede)', value: netProps, sub: 'todas as organizações' }),
      statCardHtml({ icon: 'clients', color: 'green', label: 'Clientes (rede)', value: netClients, sub: 'vinculados aos parceiros' }),
      statCardHtml({ icon: 'billing', color: 'yellow', label: 'Faturamento rede (mês)', value: fmtR(netBilling), sub: 'soma dos parceiros', valueStyle: 'font-size:17px;' }),
    ].join('')}</div>`;

  box.innerHTML = summaryHtml + cardsHtml;
}

function _canManagePartnersHub() {
  if (window.SOUBLU_FINANCEIRO_PAGE) {
    return typeof canViewFinanceiroPartnerNav === 'function'
      ? canViewFinanceiroPartnerNav()
      : (IS_MASTER || IS_FUNDA || IS_FINANCIAL) && !PARTNER_ROOT_ID && !IS_PARCEIRO;
  }
  if (typeof canManagePartners === 'function') return canManagePartners();
  return (IS_MASTER || IS_FUNDA || IS_FINANCIAL || IS_RH) && !PARTNER_ROOT_ID && !IS_PARCEIRO;
}

async function openPartnerModal(partnerId) {
  if (!_canManagePartnersHub()) {
    showToast('Sem permissão para editar parceiros.', 'warning');
    return;
  }
  try {
    _wirePartnerCnpjLookup();
    const repPh = document.getElementById('partnerRepresentante');
    if (repPh) {
      repPh.placeholder = 'Sócio ou administrador na Receita Federal (não é o contato da empresa)';
    }
    const permsEl = document.getElementById('partnerPermsCheckboxes');
    if (permsEl && typeof PartnerPerms !== 'undefined' && !permsEl.dataset.filled) {
      permsEl.innerHTML = PartnerPerms.renderCheckboxesHtml('partnerPermsCheckboxes');
      permsEl.dataset.filled = '1';
    }
    if (typeof PartnerPerms !== 'undefined') PartnerPerms.ensureTeamPermsUi('partnerTeamPermsCheckboxes');

    _partnerSetVal('partnerRecordId', '');
    _partnerSetVal('partnerUserId', '');
    _partnerSetVal('partnerCnpj', '');
    _partnerCnpjOnOpen = '';
    _setPartnerCnpjStatus('', '');
    _partnerSetVal('partnerRazao', '');
    _partnerSetVal('partnerRepresentante', '');
    _partnerSetVal('partnerCpfRepresentante', '');
    _wirePartnerCpfRepresentante();
    _partnerSetVal('partnerEndereco', '');
    _partnerSetVal('partnerContato', '');
    _partnerSetVal('partnerEmail', '');
    _partnerSetVal('partnerSenha', 'Blu@2025');
    _partnerSetVal('partnerSimples', 'nao');
    _partnerSetVal('partnerRetencaoIrrf', '0');
    _partnerSetVal('partnerTaxaSaque', '10');
    _partnerSetVal('partnerFuncLimite', '');
    _partnerSetVal('partnerStatus', 'analise');
    if (typeof PartnerPerms !== 'undefined') PartnerPerms.fillCommissionTierForm({});
    _partnerSetVal('partnerCompliance', 'nao');
    const credEl = document.getElementById('partnerCredito');
    if (credEl) credEl.checked = false;
    _partnerSetVal('partnerPixType', 'cnpj');
    _partnerSetVal('partnerPixKey', '');
    _partnerSetVal('partnerConsultaScoreResult', '');
    _partnerSetVal('partnerConsultaCertidaoTjResult', '');
    _resetPartnerAttachments();
    await _populatePartnerComercialSelect('');
    _partnerSetVal('partnerModalTitle', ' Cadastrar parceiro');
    let fetchRepOnOpen = false;

    if (partnerId) {
      const p = await DB.getPartner(partnerId);
      if (!p) { showToast('Parceiro não encontrado.', 'error'); return; }
      p.meta = _parsePartnerJsonField(p.meta, {});
      p.permissions = _parsePartnerJsonField(p.permissions, {});
      const u = p.user_id ? await DB.getUser(p.user_id, true) : null;
      _partnerSetVal('partnerRecordId', p.id);
      _partnerSetVal('partnerUserId', p.user_id || '');
      _partnerSetVal('partnerCnpj', _formatCnpj(p.cnpj || ''));
      _partnerSetVal('partnerRazao', p.razao_social || '');
      _partnerSetVal('partnerRepresentante', p.meta?.representante_legal || '');
      _partnerSetVal('partnerEndereco', p.endereco || '');
      _partnerSetVal('partnerContato', p.contato || '');
      _partnerSetVal('partnerEmail', p.email || u?.email || '');
      _partnerSetVal('partnerSenha', u?.password || '');
      _partnerSetVal('partnerModalTitle', ' Editar parceiro');
      if (typeof PartnerPerms !== 'undefined') {
        PartnerPerms.fillForm('partnerPermsCheckboxes', p.permissions);
      }
      _fillPartnerMetaForm(p.meta || {});
      if (p.meta?.comercial_id) await _populatePartnerComercialSelect(p.meta.comercial_id);
      if (!p.meta?.bank?.pix_key && p.cnpj) {
        _partnerSetVal('partnerPixKey', _formatCnpj(p.cnpj));
      }
      _partnerCnpjOnOpen = String(p.cnpj || '').replace(/\D/g, '');
      const repMissing = !String(p.meta?.representante_legal || document.getElementById('partnerRepresentante')?.value || '').trim();
      fetchRepOnOpen = repMissing;
      if (fetchRepOnOpen) {
        _setPartnerCnpjStatus('Buscando sócio na Receita (consulta básica)…', 'muted');
      } else {
        _setPartnerCnpjStatus('', '');
      }
    } else if (typeof PartnerPerms !== 'undefined') {
      PartnerPerms.fillForm('partnerPermsCheckboxes', PartnerPerms.DEFAULT);
    }
    openModal('partnerModal');
    if (fetchRepOnOpen && _partnerCnpjOnOpen) {
      let filledFromCache = false;
      if (typeof DB.getCnpjFonteCache === 'function') {
        try {
          const cached = await DB.getCnpjFonteCache(_partnerCnpjOnOpen);
          if (cached) {
            _applyFonteDataToPartnerForm(cached, true);
            const repOk = String(document.getElementById('partnerRepresentante')?.value || '').trim();
            if (repOk) {
              _setPartnerCnpjStatus('Dados carregados do cadastro salvo (sem nova consulta).', 'success');
              filledFromCache = true;
            }
          }
        } catch (_) { /* segue */ }
      }
      if (!filledFromCache) {
        await _onPartnerCnpjLookup({ forceOnline: true, silent: true });
      }
    }
  } catch (err) {
    console.error('[openPartnerModal]', err);
    showToast('Erro ao abrir parceiro: ' + (err.message || 'tente novamente'), 'error');
  }
}
window.openPartnerModal = openPartnerModal;
window.savePartner = savePartner;
window.partnerToggleActive = partnerToggleActive;
window.partnerActivate = partnerActivate;

async function savePartner() {
  if (!_canManagePartnersHub()) return;
  const recordId = document.getElementById('partnerRecordId').value;
  const userId   = document.getElementById('partnerUserId').value;
  const cnpj     = document.getElementById('partnerCnpj').value.trim();
  const razao    = document.getElementById('partnerRazao').value.trim();
  const endereco = document.getElementById('partnerEndereco').value.trim();
  const contato  = document.getElementById('partnerContato').value.trim();
  const email    = document.getElementById('partnerEmail').value.trim().toLowerCase();
  const senha    = document.getElementById('partnerSenha').value;
  const perms    = PartnerPerms.readForm('partnerPermsCheckboxes');

  if (!razao || !email) { showToast('Razão social e e-mail são obrigatórios.', 'warning'); return; }
  if (!recordId && !senha) { showToast('Defina uma senha inicial.', 'warning'); return; }

  const meta = _partnerMetaFromForm();
  const cnpjDigits = cnpj.replace(/\D/g, '');
  if (cnpjDigits.length === 14) {
    const partners = await DB.getPartners().catch(() => []);
    const dup = (partners || []).find(p =>
      String(p.cnpj || '').replace(/\D/g, '') === cnpjDigits && p.id !== recordId
    );
    if (dup) { showToast('Este CNPJ já está cadastrado para outro parceiro.', 'error'); return; }
  }

  if (!recordId) {
    const missing = _PARTNER_DOC_REQUIRED.filter(k => !meta.attachments?.[k]);
    if (missing.length) {
      showToast('Anexe os documentos obrigatórios: termo login, contrato social, compliance e RG do representante.', 'warning');
      return;
    }
  }

  const isActive = meta.status === 'ativo' && meta.compliance_aprovado;
  const prevPartner = recordId ? await DB.getPartner(recordId).catch(() => null) : null;
  if (prevPartner?.meta) {
    const prevAtt = _partnerAttachmentsMap(
      typeof prevPartner.meta === 'string'
        ? (() => { try { return JSON.parse(prevPartner.meta); } catch (_) { return {}; } })().attachments
        : prevPartner.meta.attachments
    );
    Object.keys(prevAtt).forEach((k) => {
      if (!meta.attachments[k] && prevAtt[k]) meta.attachments[k] = prevAtt[k];
    });
  }
  const wasActive = prevPartner?.meta?.status === 'ativo' && prevPartner?.active !== false;

  showLoading('Salvando parceiro...');
  try {
    let uid = userId;
    const representante = document.getElementById('partnerRepresentante')?.value?.trim() || '';
    const loginName = razao || representante || contato;

    if (uid) {
      const upd = {
        name: loginName,
        email,
        department: 'Parceiro',
        role: 'parceiro',
        active: isActive,
      };
      if (senha) upd.password = senha;
      if (meta.bank?.pix_key && typeof WithdrawalRules !== 'undefined') {
        await WithdrawalRules.savePaymentProfile(uid, {
          method: 'pix',
          pix: { type: meta.bank.pix_type || 'cnpj', key: meta.bank.pix_key },
          bank: {},
        });
      }
      await DB.updateUser(uid, upd);
    } else {
      const dup = await DB.findUserByIdentifier(email);
      if (dup) { showToast('E-mail já cadastrado.', 'error'); return; }
      const nu = await DB.addUser({
        name: loginName,
        email,
        password: senha,
        department: 'Parceiro',
        role: 'parceiro',
        admin_id: null,
        balance: 0,
        points: 0,
        active: isActive,
      });
      uid = nu.id;
      if (meta.bank?.pix_key && typeof WithdrawalRules !== 'undefined') {
        await WithdrawalRules.savePaymentProfile(uid, {
          method: 'pix',
          pix: { type: meta.bank.pix_type || 'cnpj', key: meta.bank.pix_key },
          bank: {},
        });
      }
    }

    await DB.savePartner({
      id: recordId || undefined,
      user_id: uid,
      cnpj,
      razao_social: razao,
      endereco,
      contato,
      email,
      permissions: perms,
      meta,
      active: isActive,
    });

    if (cnpjDigits.length === 14 && representante && typeof DB.saveCnpjFonteCache === 'function') {
      const cpfRep = String(document.getElementById('partnerCpfRepresentante')?.value || '').replace(/\D/g, '');
      if (cpfRep.length === 11) {
        await DB.saveCnpjFonteCache({
          cnpj: cnpjDigits,
          razao_social: razao,
          representante_legal: representante,
          cpf_representante: cpfRep,
          endereco,
          contato,
          email,
        }, 'cadastro_parceiro').catch(() => null);
      }
    }

    closeModal('partnerModal');
    if (isActive) {
      showToast(`Parceiro "${razao}" salvo e ativo!`, 'success');
    } else {
      showToast(`Parceiro "${razao}" salvo em análise. Ative em RH → Cadastrar Parceiro.`, 'success', 7000);
    }
    if (typeof invalidateSouBluCaches === 'function') invalidateSouBluCaches();
    if (typeof refreshPartnerRootIdsCache === 'function') await refreshPartnerRootIdsCache();
    if (window.PartnerOps) PartnerOps.invalidate();
    await Promise.all([renderPartnersPanel(), renderMasterPanel()]);
  } catch (err) {
    console.error('[savePartner]', err);
    showToast('Erro ao salvar: ' + (err.message || 'tente novamente'), 'error');
  } finally { hideLoading(); }
}

async function partnerActivate(partnerId) {
  if (!_canManagePartnersHub()) return;
  const p = await DB.getPartner(partnerId);
  if (!p) { showToast('Parceiro não encontrado.', 'error'); return; }
  if (!confirm(`Ativar o parceiro "${p.razao_social || p.email}"?\n\nO login do gestor será liberado.`)) return;
  showLoading('Ativando parceiro...');
  try {
    const meta = { ...(p.meta || {}), status: 'ativo', compliance_aprovado: true };
    await DB.savePartner({ ...p, active: true, meta });
    if (p.user_id) await DB.updateUser(p.user_id, { active: true });
    showToast('Parceiro ativado! O gestor já pode entrar no sistema.', 'success');
    if (window.PartnerOps) PartnerOps.invalidate();
    if (typeof invalidateSouBluCaches === 'function') invalidateSouBluCaches();
    await renderPartnersPanel();
  } catch (e) {
    console.error('[partnerActivate]', e);
    showToast('Erro ao ativar: ' + (e.message || 'tente novamente'), 'error');
  } finally { hideLoading(); }
}

async function partnerToggleActive(partnerId) {
  const p = await DB.getPartner(partnerId);
  if (!p) return;
  const meta = { ...(p.meta || {}) };
  const live = meta.status === 'ativo' && p.active !== false;
  const next = !live;
  showLoading();
  try {
    const newMeta = {
      ...meta,
      status: next ? 'ativo' : 'inativo',
      compliance_aprovado: next ? true : !!meta.compliance_aprovado,
    };
    await DB.savePartner({ ...p, active: next, meta: newMeta });
    if (p.user_id) await DB.updateUser(p.user_id, { active: next });
    showToast(next ? 'Parceiro ativado.' : 'Parceiro desativado.', 'info');
    if (window.PartnerOps) PartnerOps.invalidate();
    await renderPartnersPanel();
  } catch (e) {
    showToast('Erro: ' + (e.message || ''), 'error');
  } finally { hideLoading(); }
}

function _masterUserOrderWdCounts(userId, allOrders, allWds) {
  const ords = allOrders.filter(o => o.employee_id === userId);
  const wds = allWds.filter(w => w.employee_id === userId);
  const wdPend = wds.filter(w => ['solicitado', 'aprovado_master', 'aprovado_financeiro'].includes(w.status)).length;
  const wdPaid = wds.filter(w => w.status === 'pago').length;
  return { ords: ords.length, wdPend, wdPaid, wds: wds.length };
}

function _masterUserIsActive(user) {
  if (typeof DB !== 'undefined' && typeof DB._isUserActive === 'function') return DB._isUserActive(user);
  if (!user) return false;
  const email = String(user.email || '').toLowerCase();
  if (email.endsWith('@deleted.local') || /^deleted_/.test(email)) return false;
  if (/\(removido\)\s*$/i.test(String(user.name || ''))) return false;
  if (user.deleted_at) return false;
  const a = user.active;
  return !(a === false || a === 0 || a === '0' || a === 'false');
}

function _masterMetricChipsHtml(user, allOrders, allWds) {
  const pts = userPts(user);
  const { ords, wdPend } = _masterUserOrderWdCounts(user.id, allOrders, allWds);
  const active = _masterUserIsActive(user);
  return `<div class="master-metric-chips">
    <span class="master-chip master-chip--pts"><strong>${pts.toLocaleString('pt-BR')}</strong> pts</span>
    <span class="master-chip">${ords} pedido${ords !== 1 ? 's' : ''}</span>
    <span class="master-chip${wdPend ? ' master-chip--warn' : ''}">${wdPend} saque${wdPend !== 1 ? 's' : ''} pend.</span>
    <span class="master-chip">${active ? '● Ativo' : '○ Inativo'}</span>
  </div>`;
}

function _masterRoleHint(role) {
  const hints = {
    financeiro: 'Aprova saques e operações financeiras no painel.',
    financial: 'Aprova saques e operações financeiras no painel.',
    rh: 'Gestão de pessoas, feedbacks e cadastros de RH.',
    desenvolvedor: 'Suporte técnico, integrações e manutenção do sistema.',
    gerente: 'Visão gerencial — equipes, metas e relatórios.',
    master: 'Acesso total ao painel administrativo.',
    fundador: 'Proprietário — acesso completo à plataforma.',
    supervisor: 'Líder de equipe de vendas — gerencia funcionários vinculados.',
    sup_backoffice: 'Coordena equipe de backoffice vinculada.',
    portaria: 'Recepção — painel dos sonhos, bolão, loja e abertura de chamados.',
  };
  return hints[role] || 'Usuário cadastrado no sistema SOU+BLU.';
}

function _renderMasterSoloBody(user, allOrders, allWds) {
  const pts = userPts(user);
  const { ords, wdPend, wdPaid } = _masterUserOrderWdCounts(user.id, allOrders, allWds);
  const canPoints = ['employee', 'vendedor', 'backoffice', 'sup_backoffice', 'desenvolvedor', 'fundador'].includes(user.role);
  return `
    <div class="stat-grid master-user-stats">${[
      statCardHtml({ icon: 'balance', color: 'green', label: canPoints ? 'Saldo / Pontos' : 'Saldo', value: pts.toLocaleString('pt-BR'), valueStyle: 'font-size:18px;' }),
      statCardHtml({ icon: 'orders', color: 'yellow', label: 'Pedidos', value: ords, sub: ords ? 'do usuário' : 'nenhum pedido' }),
      statCardHtml({ icon: 'withdrawals', color: 'orange', label: 'Saques pend.', value: wdPend }),
      statCardHtml({ icon: 'chart', color: 'blue', label: 'Saques pagos', value: wdPaid }),
    ].join('')}</div>
    <div class="master-user-detail">
      <p class="master-user-detail__hint">${_masterRoleHint(user.role)}</p>
      <dl class="master-user-detail__grid">
        <div><dt>Departamento</dt><dd>${user.department || '—'}</dd></div>
        <div><dt>Matrícula</dt><dd>${user.matricula || '—'}</dd></div>
        <div><dt>E-mail</dt><dd>${user.email || '—'}</dd></div>
        <div><dt>Perfil</dt><dd>${user.role || '—'}</dd></div>
      </dl>
    </div>`;
}

function _masterUserActionsHtml(user) {
  const escName = String(user.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const uid = String(user.id || '').replace(/'/g, '');
  const canDelete = IS_FUNDA ? user.role !== 'fundador' : (user.role !== 'master' && user.role !== 'fundador');
  const isActive = _masterUserIsActive(user);
  return `<div class="master-user-card__actions" data-master-actions="${uid}">
    <button type="button" class="btn btn-ghost btn-sm" data-master-act="edit" data-user-id="${uid}">Editar</button>
    <button type="button" class="btn btn-ghost btn-sm" data-master-act="toggle" data-user-id="${uid}">${isActive ? 'Desativar' : 'Ativar'}</button>
    ${canDelete ? `<button type="button" class="btn btn-ghost btn-sm" style="color:var(--color-danger);" data-master-act="delete" data-user-id="${uid}" data-user-name="${escName}" title="Excluir definitivamente">Excluir</button>` : ''}
  </div>`;
}

function _renderUserCard(user, team, allOrders, allWds, roleLabels) {
  const rl = roleLabels[user.role] || { label: user.role, cls: 'badge-muted' };
  const teamOrds = allOrders.filter(o => team.some(e => e.id === o.employee_id));
  const teamWds = allWds.filter(w => team.some(e => e.id === w.employee_id) || w.employee_id === user.id);
  const teamPts = team.reduce((s, e) => s + userPts(e), 0);
  const wdPend = teamWds.filter(w => w.status === 'solicitado').length;

  let body = '';
  if (team.length) {
    body = `
    <div class="stat-grid master-user-stats">${[
      statCardHtml({ icon: 'users', color: 'blue', label: 'Equipe', value: team.length }),
      statCardHtml({ icon: 'balance', color: 'green', label: 'Total Pontos', value: teamPts.toLocaleString('pt-BR'), valueStyle: 'font-size:18px;' }),
      statCardHtml({ icon: 'orders', color: 'yellow', label: 'Pedidos', value: teamOrds.length }),
      statCardHtml({ icon: 'withdrawals', color: 'orange', label: 'Saques', value: wdPend }),
    ].join('')}</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;">
      ${team.map(e => {
        const ptsBtn = (typeof canSouBluManagePoints === 'function' && canSouBluManagePoints(e))
          ? `<button class="btn btn-primary btn-sm" onclick="quickAddPoints('${e.id}','${e.name.replace(/'/g, "\\'")}')">Pontos</button>`
          : '';
        return `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--color-surface-2);border-radius:var(--radius-md);border:1px solid var(--color-border);">
          ${avatarHtml(e.name, 'avatar-sm', e.photo_url || '')}
          <div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:13px;">${e.name}</div><div style="font-size:11px;color:var(--color-text-muted);">${e.department} · ${formatCurrency(userPts(e), e)}</div></div>
          ${ptsBtn}
          <button type="button" class="btn btn-ghost btn-sm" data-master-act="edit" data-user-id="${e.id}">Editar</button>
          <button type="button" class="btn btn-ghost btn-sm" style="color:var(--color-danger);" data-master-act="delete" data-user-id="${e.id}" data-user-name="${e.name.replace(/'/g, "\\'")}" title="Excluir">Excluir</button>
        </div>`;
      }).join('')}
    </div>`;
  } else if (user.role === 'supervisor') {
    body = `
    <div class="stat-grid master-user-stats">${[
      statCardHtml({ icon: 'users', color: 'blue', label: 'Equipe', value: 0, sub: 'nenhum vinculado' }),
      statCardHtml({ icon: 'balance', color: 'green', label: 'Pontos equipe', value: '0' }),
      statCardHtml({ icon: 'orders', color: 'yellow', label: 'Pedidos', value: 0 }),
      statCardHtml({ icon: 'withdrawals', color: 'orange', label: 'Saques', value: 0 }),
    ].join('')}</div>
    <p style="font-size:13px;color:var(--color-text-muted);margin:0;padding:10px 14px;background:var(--color-surface-2);border-radius:var(--radius-md);">Nenhum funcionário nesta equipe ainda. Crie funcionários e vincule a este supervisor.</p>`;
  } else {
    body = _renderMasterSoloBody(user, allOrders, allWds);
  }

  return `
  <div class="card card-padded master-user-card">
    <div class="master-user-card__head">
      ${avatarHtml(user.name, 'avatar-lg', user.photo_url || '')}
      <div class="master-user-card__identity">
        <div class="master-user-card__name">
          <span>${user.name}</span>
          <span class="badge ${rl.cls}">${rl.label}</span>
          ${user.active === false ? '<span class="badge badge-danger">Inativo</span>' : ''}
        </div>
        <div class="master-user-card__sub">${user.email || '—'} · ${user.matricula || '—'} · ${user.department || '—'}</div>
      </div>
      <div class="master-user-card__metrics">${_masterMetricChipsHtml(user, allOrders, allWds)}</div>
      ${_masterUserActionsHtml(user)}
    </div>
    <div class="master-user-card__body">${body}</div>
  </div>`;
}

function _renderMasterUserSection(title, users, allOrders, allWds, roleLabels) {
  if (!users.length) return '';
  const heading = `<h3 style="font-family:var(--font-display);font-weight:800;font-size:15px;margin:20px 0 12px;color:var(--color-text-muted);">${title}</h3>`;
  if (users.length === 1) {
    return heading + _renderUserCard(users[0], [], allOrders, allWds, roleLabels);
  }
  const rows = users.map(u => {
    const rl = roleLabels[u.role] || { label: u.role, cls: 'badge-muted' };
    return `
    <div class="master-user-row">
      ${avatarHtml(u.name, 'avatar-sm', u.photo_url || '')}
      <div class="master-user-row__main">
        <div class="master-user-row__name">
          <span>${u.name}</span>
          <span class="badge ${rl.cls}">${rl.label}</span>
          ${u.active === false ? '<span class="badge badge-danger">Inativo</span>' : ''}
        </div>
        <div class="master-user-row__sub">${u.email || '—'} · ${u.matricula || '—'} · ${u.department || '—'}</div>
      </div>
      <div class="master-user-row__metrics">${_masterMetricChipsHtml(u, allOrders, allWds)}</div>
      ${_masterUserActionsHtml(u)}
    </div>`;
  }).join('');
  return `${heading}<div class="card master-user-group"><div class="master-user-group__rows">${rows}</div></div>`;
}

/* ── Modal criar / editar usuário ── */
async function openCreateUserModal() {
  document.getElementById('masterUserModalTitle').textContent = ' Criar Usuário';
  document.getElementById('masterUserId').value    = '';
  document.getElementById('masterUserName').value  = '';
  document.getElementById('masterUserEmail').value = '';
  document.getElementById('masterUserMat').value   = '';
  document.getElementById('masterUserPwd').value   = '123456';
  document.getElementById('masterUserRole').value  = 'supervisor';
  document.getElementById('masterUserDept').value  = 'Vendas';
  document.getElementById('masterUserPts').value   = '0';
  onMasterRoleChange('supervisor');
  await _populateMasterTeamSelect('');
  openModal('masterUserModal');
}

async function masterEditUser(id) {
  if (!id) return;
  if (typeof unlockUiOverlays === 'function') unlockUiOverlays();
  const u = await DB.getUser(id, true); if (!u) {
    showToast('Usuário não encontrado.', 'error');
    return;
  }

  // Rede parceira: edita no fluxo de equipe do parceiro (não manda para o RH).
  let partnerRoot = u.partner_root_id || null;
  if (!partnerRoot && u.admin_id) {
    const boss = await DB.getUser(u.admin_id).catch(() => null);
    if (boss?.role === 'parceiro') partnerRoot = boss.id;
  }
  if (!partnerRoot && u.role === 'parceiro') partnerRoot = u.id;
  if (partnerRoot && (IS_MASTER || IS_FUNDA || IS_GERENTE || IS_RH || IS_FINANCIAL)) {
    _empPartnerRootOverride = String(partnerRoot);
    window._keepPartnerTeamOverride = true;
    document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
    document.getElementById('secEmployees')?.classList.add('active');
    await renderEmployeesTable();
    await editEmployee(id);
    return;
  }

  // Painel Master: edita sempre no modal local (não redireciona para o RH).
  const modal = document.getElementById('masterUserModal');
  if (!modal) {
    showToast('Modal de edição não encontrado. Recarregue (Ctrl+F5).', 'error');
    return;
  }
  document.getElementById('masterUserModalTitle').textContent = ' Editar Usuário';
  document.getElementById('masterUserId').value    = u.id;
  document.getElementById('masterUserName').value  = u.name;
  document.getElementById('masterUserEmail').value = u.email;
  document.getElementById('masterUserMat').value   = u.matricula || '';
  document.getElementById('masterUserPwd').value   = u.password || '';
  const roleSel = document.getElementById('masterUserRole');
  if (roleSel && u.role && ![...roleSel.options].some((o) => o.value === u.role)) {
    const opt = document.createElement('option');
    opt.value = u.role;
    opt.textContent = u.role;
    roleSel.appendChild(opt);
  }
  document.getElementById('masterUserRole').value  = u.role;
  document.getElementById('masterUserDept').value  = u.department || 'Vendas';
  document.getElementById('masterUserPts').value   = u.points || u.balance || 0;
  onMasterRoleChange(u.role);
  await _populateMasterTeamSelect(u.admin_id || '');
  openModal('masterUserModal');
}

function onMasterRoleChange(role) {
  const isTeamMember = ['employee', 'vendedor', 'backoffice'].includes(role);
  const isTeamLeader = ['supervisor', 'sup_backoffice'].includes(role);
  const canHavePoints = ['employee','vendedor','backoffice','sup_backoffice','desenvolvedor','fundador'].includes(role);
  document.getElementById('masterUserPtsGroup').style.display  = canHavePoints ? '' : 'none';
  const teamGrp = document.getElementById('masterUserTeamGroup');
  if (teamGrp) {
    teamGrp.style.display = isTeamMember ? '' : 'none';
    const lbl = teamGrp.querySelector('label');
    if (lbl) {
      lbl.innerHTML = isTeamLeader
        ? 'Equipe <small style="text-transform:none;font-weight:400;">(líder — vincule membros pelo campo abaixo ao editar vendedores/backoffice)</small>'
        : 'Equipe / Líder responsável <small style="text-transform:none;font-weight:400;">(supervisor ou sup. backoffice)</small>';
    }
  }
  const leaderHint = document.getElementById('masterUserLeaderHint');
  if (leaderHint) leaderHint.style.display = isTeamLeader ? '' : 'none';
  // Departamento sugerido
  const deptSel = document.getElementById('masterUserDept');
  const deptMap = {
    financial:'Financeiro', financeiro:'Financeiro',
    supervisor:'Supervisor', sup_backoffice:'Backoffice',
    backoffice:'Backoffice', rh:'RH', vendedor:'Vendas',
    desenvolvedor:'TI', portaria:'Portaria',
    gerente:'Administração'
  };
  if (deptMap[role]) deptSel.value = deptMap[role];
}

async function _populateMasterTeamSelect(selected) {
  if (typeof DB.clearAllUsersCache === 'function') DB.clearAllUsersCache();
  const leaders = (await DB.getAllUsers(true)).filter(u => {
    const a = u?.active;
    const active = !(a === false || a === 0 || a === '0' || a === 'false');
    return active && ['supervisor', 'parceiro', 'sup_backoffice'].includes(String(u.role || '').toLowerCase());
  });
  const sel = document.getElementById('masterUserTeam');
  const roleTag = (r) => ({
    parceiro: 'Parceiro',
    sup_backoffice: 'Sup. Backoffice',
    supervisor: 'Supervisor',
  }[r] || '');
  sel.innerHTML = `<option value="">— Sem líder de equipe —</option>` +
    leaders.map(s => {
      const tag = roleTag(s.role);
      return `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${tag ? tag + ' — ' : ''}${s.name} (${s.department || '—'})</option>`;
    }).join('');
}

async function saveMasterUser() {
  const id   = document.getElementById('masterUserId').value;
  const role = document.getElementById('masterUserRole').value;
  const name = document.getElementById('masterUserName').value.trim();
  const email= document.getElementById('masterUserEmail').value.trim();
  const pwd  = document.getElementById('masterUserPwd').value;
  const mat  = document.getElementById('masterUserMat').value.trim();
  const dept = document.getElementById('masterUserDept').value;
  const pts  = parseInt(document.getElementById('masterUserPts').value) || 0;
  const team = document.getElementById('masterUserTeam')?.value || null;

  if (!name || !email) { showToast('Nome e e-mail obrigatórios.','warning'); return; }
  if (!id && !pwd) { showToast('Senha obrigatória para novo usuário.','warning'); return; }

  const isTeamMember = ['employee', 'vendedor', 'backoffice'].includes(role);
  const isTeamLeader = ['supervisor', 'sup_backoffice'].includes(role);
  const canHavePoints = ['employee','vendedor','backoffice','sup_backoffice','desenvolvedor','fundador'].includes(role);
  try {
    const existing = id ? await DB.getUser(id) : null;
    const ptsGroupVisible = document.getElementById('masterUserPtsGroup')?.style.display !== 'none';

    const data = { name, email, department: dept, role, active: true };
    if (mat) data.matricula = mat;
    if (pwd || !id) data.password = pwd || '123456';

    if (id && existing) {
      if (isTeamMember) data.admin_id = team || null;
      else if (isTeamLeader) data.admin_id = null;
      else data.admin_id = existing.admin_id ?? null;
      if (ptsGroupVisible && canHavePoints) {
        data.balance = pts;
        data.points = pts;
      } else {
        data.balance = Number(existing.balance ?? existing.points ?? 0);
        data.points = Math.round(Number(existing.points ?? existing.balance ?? 0));
      }
    } else {
      data.admin_id = isTeamMember ? (team || null) : null;
      data.balance = canHavePoints && ['employee','vendedor','backoffice','sup_backoffice'].includes(role) ? pts : 0;
      data.points = canHavePoints && ['employee','vendedor','backoffice','sup_backoffice'].includes(role) ? pts : 0;
    }

    data.email = DB.normalizeEmail(email);
    if (await DB.isEmailTaken(data.email, id || null)) {
      const dup = await DB.getUserByEmail(data.email);
      showToast(`Este e-mail já está cadastrado${dup?.name ? ` (${dup.name})` : ''}.`, 'error');
      return;
    }

    if (id) {
      await DB.updateUser(id, data);
      showToast(`${name} atualizado!`, 'success');
    } else {
      await DB.addUser(data);
      const roleNome = {
        supervisor:'Supervisor', financial:'Financeiro', financeiro:'Financeiro',
        rh:'RH', vendedor:'Vendedor', employee:'Funcionário',
        backoffice:'Backoffice', sup_backoffice:'Sup. Backoffice',
        gerente:'Gerente',
        fundador:'Fundador',
        desenvolvedor:'TI', portaria:'Portaria',
      }[role] || role;
      showToast(`${roleNome} "${name}" criado!`, 'success');
    }
    closeModal('masterUserModal');
    invalidateSouBluCaches();
    await Promise.all([renderMasterPanel(), renderEmployeesTable()]);
  } catch(err) {
    console.error('[saveMasterUser]', err);
    showToast(DB.formatUserDbError ? DB.formatUserDbError(err) : (err.message || 'tente novamente'), 'error');
  } finally { hideLoading(); }
}

async function masterToggleUser(id) {
  if (typeof unlockUiOverlays === 'function') unlockUiOverlays();
  const u = await DB.getUser(id, true); if (!u) { showToast('Usuário não encontrado.', 'error'); return; }
  const wasActive = _masterUserIsActive(u);
  showLoading();
  try {
    await DB.updateUser(id, { active: !wasActive });
    if (typeof invalidateSouBluCaches === 'function') invalidateSouBluCaches();
    if (typeof DB.clearAllUsersCache === 'function') DB.clearAllUsersCache();
    await renderMasterPanel();
    showToast(`${u.name} ${wasActive ? 'desativado' : 'ativado'}.`, 'info');
  } catch (err) {
    console.error('[masterToggleUser]', err);
    showToast('Erro ao alterar status: ' + (err.message || 'tente novamente'), 'error');
  } finally { hideLoading(); }
}

async function masterDeleteUser(id, name) {
  if (typeof unlockUiOverlays === 'function') unlockUiOverlays();
  const u = await DB.getUser(id, true).catch(() => null);
  const label = name || u?.name || id;
  const role = String(u?.role || '').toLowerCase();
  if (role === 'fundador' || role === 'master') {
    showToast('Não é permitido excluir master/fundador.', 'error');
    return;
  }
  if (!confirm(`Excluir "${label}"?\n\nO usuário some da lista e não consegue mais entrar.\nAs propostas e o histórico DELE CONTINUAM no sistema.`)) return;
  showLoading('Excluindo...');
  try {
    if (typeof DB.removeUserCompletely === 'function') {
      await DB.removeUserCompletely(id);
    } else {
      if (u && DB._isUserActive(u)) await DB.deleteUser(id);
      await DB.purgeInactiveUser(id);
    }
    if (typeof invalidateSouBluCaches === 'function') invalidateSouBluCaches();
    if (typeof DB.clearAllUsersCache === 'function') DB.clearAllUsersCache();
    await renderMasterPanel();
    if (document.getElementById('employeesTbody')) await renderEmployeesTable();
    showToast(`"${label}" removido. As propostas dele continuam no sistema.`, 'success');
  } catch (err) {
    console.error('[masterDeleteUser]', err);
    if (typeof DB.clearAllUsersCache === 'function') DB.clearAllUsersCache();
    await renderMasterPanel().catch(() => null);
    showToast('Erro ao excluir: ' + (err.message || 'tente novamente'), 'error');
  } finally { hideLoading(); }
}

window.masterEditUser = masterEditUser;
window.masterToggleUser = masterToggleUser;
window.masterDeleteUser = masterDeleteUser;

function _bindMasterPanelActions() {
  const box = document.getElementById('masterContent');
  if (!box || box.dataset.masterActionsBound === '1') return;
  box.dataset.masterActionsBound = '1';
  box.addEventListener('click', (ev) => {
    const btn = ev.target?.closest?.('[data-master-act]');
    if (!btn || !box.contains(btn)) return;
    ev.preventDefault();
    ev.stopPropagation();
    const act = btn.getAttribute('data-master-act');
    const uid = btn.getAttribute('data-user-id');
    const uname = btn.getAttribute('data-user-name') || '';
    if (!uid) return;
    if (act === 'edit') masterEditUser(uid);
    else if (act === 'toggle') masterToggleUser(uid);
    else if (act === 'delete') masterDeleteUser(uid, uname);
  });
}

/* ══════════════════════════════════════════════
   QUICK ADD POINTS — modal rápido de pontos
══════════════════════════════════════════════ */
async function quickAddPoints(empId, empName) {
  const emp = await DB.getUser(empId);
  if (emp && typeof canSouBluManagePoints === 'function' && !canSouBluManagePoints(emp)) {
    showToast('Rede parceira não usa pontos SOU+BLU. Use RH → Cadastrar Parceiro → Distribuir saldo (R$).', 'warning', 7000);
    return;
  }
  const saldoAtual = emp ? (emp.points||emp.balance||0) : 0;

  // Cria modal inline
  const overlay = document.createElement('div');
  overlay.id = 'quickPtsOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:var(--color-surface);border-radius:var(--radius-lg);padding:28px;width:380px;max-width:95vw;box-shadow:var(--shadow-xl);"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;"><h3 style="font-family:var(--font-display);font-weight:800;font-size:17px;"> Pontos — ${empName}</h3><button onclick="document.getElementById('quickPtsOverlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--color-text-muted);"></button></div><div style="background:var(--color-surface-2);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:18px;text-align:center;"><div style="font-size:12px;color:var(--color-text-muted);margin-bottom:2px;">Saldo atual</div><div style="font-size:26px;font-weight:900;font-family:var(--font-display);"> ${saldoAtual.toLocaleString('pt-BR')}</div></div><div class="form-group" style="margin-bottom:12px;"><label>Operação</label><div style="display:flex;gap:8px;"><button id="qpOpAdd" class="btn btn-primary" style="flex:1;" onclick="_qpSetOp('add')">Adicionar</button><button id="qpOpRemove" class="btn btn-outline" style="flex:1;" onclick="_qpSetOp('remove')">Remover</button><button id="qpOpSet" class="btn btn-outline" style="flex:1;" onclick="_qpSetOp('set')">Definir</button></div><input type="hidden" id="qpOperation" value="add"></div><div class="form-group" style="margin-bottom:12px;"><label>Quantidade de pontos</label><input type="number" id="qpAmount" min="1" step="1" placeholder="Ex: 100" style="width:100%;" autofocus/></div><div class="form-group" style="margin-bottom:18px;"><label>Motivo</label><input type="text" id="qpReason" placeholder="Ex: Proposta faturada" style="width:100%;"/></div><div style="display:flex;gap:10px;"><button class="btn btn-outline" style="flex:1;" onclick="document.getElementById('quickPtsOverlay').remove()">Cancelar</button><button class="btn btn-primary" style="flex:1;" onclick="_qpConfirm('${empId}')">Confirmar</button></div></div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if(e.target===overlay) overlay.remove(); });
}

function _qpSetOp(op) {
  document.getElementById('qpOperation').value = op;
  ['add','remove','set'].forEach(o => {
    const btn = document.getElementById('qpOp'+o.charAt(0).toUpperCase()+o.slice(1));
    if(btn) btn.className = o===op ? 'btn btn-primary' : 'btn btn-outline';
    if(btn) btn.style.flex = '1';
  });
}

async function _qpConfirm(empId) {
  const op     = document.getElementById('qpOperation').value;
  const amt    = parseFloat(document.getElementById('qpAmount').value);
  const reason = document.getElementById('qpReason').value.trim() || 'Ajuste de pontos';
  if (!amt || amt <= 0) { showToast('Informe uma quantidade válida.','warning'); return; }
  showLoading('Salvando pontos...');
  try {
    if (op==='add')         await DB.addBalance(empId, Math.round(Number(amt)), reason, ADMIN_ID, { kind: 'credito_manual', origin: 'painel_rapido', pontos_total: Math.round(Number(amt)) });
    else if (op==='remove') await DB.deductBalance(empId, amt, reason, ADMIN_ID);
    else if (op==='set')    await DB.setBalance(empId, amt, reason, ADMIN_ID);
    invalidateSouBluCaches();
    document.getElementById('quickPtsOverlay')?.remove();
    await Promise.all([
      renderMasterPanel(),
      renderDashboard(),
      populateBalanceSelect(),
      renderBalanceHistory(),
      document.getElementById('employeesTbody') ? renderEmployeesTable() : Promise.resolve(),
      document.getElementById('adminRankingList') ? renderAdminRanking() : Promise.resolve(),
    ]);
    showToast('Pontos atualizados!', 'success');
  } catch(err) {
    console.error('[quickAddPoints]', err);
    showToast('Erro ao salvar pontos: '+(err.message||'tente novamente'), 'error');
  } finally { hideLoading(); }
}

/* ══════════════════════════════════════════════
   MEU PERFIL (admin edita próprio e-mail/senha/foto)
══════════════════════════════════════════════ */
function _roleProfileLabel(role) {
  const map = {
    fundador: 'Fundador', master: 'Master', desenvolvedor: 'TI',
    gerente: 'Gerente', gerencia: 'Gerência', admin: 'Administrador',
    financeiro: 'Financeiro', financial: 'Financeiro', supervisor: 'Supervisor',
    sup_backoffice: 'Sup. Backoffice', backoffice: 'Backoffice', rh: 'RH',
    operacional: 'Operacional', juridico: 'Jurídico', diretoria: 'Diretoria',
    ouvidoria: 'Ouvidoria', parceiro: 'Parceiro', portaria: 'Portaria',
  };
  return map[role] || 'Gestor';
}

async function renderMyProfile() {
  const masterWrap = document.getElementById('myProfileMaster');
  const employeeWrap = document.getElementById('myProfileEmployee');
  const contentEl = document.getElementById('myProfileContent');

  const me = await Auth.getCurrentUser();
  if (!me) {
    if (contentEl) contentEl.innerHTML = '<div class="card card-padded"><p class="text-muted">Sessão inválida. Faça login novamente.</p></div>';
    return;
  }

  let partnerProfileMode = me.role === 'parceiro';
  if (!partnerProfileMode && me.admin_id) {
    try {
      const sup = await DB.getUser(me.admin_id);
      if (sup?.role === 'parceiro') partnerProfileMode = true;
    } catch (_) { /* noop */ }
  }
  if (partnerProfileMode) {
    if (masterWrap) masterWrap.style.display = 'none';
    if (employeeWrap) employeeWrap.style.display = '';
  } else {
    if (masterWrap) masterWrap.style.display = '';
    if (employeeWrap) employeeWrap.style.display = '';
  }

  const toggleEl = document.getElementById('ptsToggleBlock');
  if (toggleEl) {
    toggleEl.innerHTML = '';
    toggleEl.style.display = 'none';
  }

  if (contentEl) contentEl.innerHTML = '';
  if (!partnerProfileMode) {
    const profileSubtitle = document.querySelector('#myProfileMaster .page-header-text p');
    if (profileSubtitle) profileSubtitle.textContent = 'Gerencie saldo, movimentações e dados da sua conta';
  }

  window.currentUser = me;
  currentUser = me;
  const headerEl = document.getElementById('profileHeader');
  if (headerEl) {
    headerEl.innerHTML = '<div class="card card-padded" style="padding:24px;text-align:center;color:var(--color-text-muted);">Carregando…</div>';
  }
  try {
    if (typeof renderProfile === 'function') await renderProfile();
  } catch (err) {
    console.error('[renderMyProfile]', err);
    if (headerEl) headerEl.innerHTML = '';
    showToast('Erro ao carregar Meu Perfil.', 'error');
  }
}

async function uploadAdminPhoto(input) {
  const file=input.files[0]; if(!file)return;
  if(file.size>3*1024*1024){showToast('Máx. 3MB.','warning');return;}
  showLoading('Salvando foto...');
  try {
    const url = await uploadImage(file, 'profile-photos', ADMIN_ID || Auth.getSession()?.id);
    const updated = await DB.updateUser(ADMIN_ID, { photo_url: url });
    _cacheDel?.('users');
    const me = updated || await DB.getUser(ADMIN_ID);
    if (typeof renderAdminSidebar === 'function') renderAdminSidebar(me);
    await renderMyProfile();
    showToast('Foto atualizada.', 'success');
  } catch(e){console.error(e);showToast('Erro ao salvar foto.','error');} finally{hideLoading();}
}

/* ══════════════════════════════════════════════
   FUNCIONÁRIOS
══════════════════════════════════════════════ */
function _fmtPersonName(name) {
  const n = String(name || '');
  return typeof fixMojibake === 'function' ? fixMojibake(n) : n;
}

function _sortEmpByName(rows) {
  return (rows || []).slice().sort((a, b) =>
    _fmtPersonName(a?.name || a?.nome || '').localeCompare(
      _fmtPersonName(b?.name || b?.nome || ''), 'pt-BR', { sensitivity: 'base' }
    )
  );
}

async function renderEmployeesTable() {
  if (!CAN_EMPLOYEES_PANEL || employeesManagedInRhHub()) return;
  const partnerRoot = getEffectivePartnerRootId();
  const q    = (document.getElementById('empSearch')?.value||'').toLowerCase();
  const roleShort = {
    desenvolvedor: 'Dev/TI', supervisor: 'Supervisor', sup_backoffice: 'Sup. Backoffice',
    backoffice: 'Backoffice', gerente: 'Gerente', financeiro: 'Financeiro', financial: 'Financeiro',
    rh: 'RH', operacional: 'Operacional',
    vendedor: 'Vendedor', employee: 'Funcionário', parceiro: 'Parceiro',
  };
  let emps;
  if (partnerRoot) {
    emps = await DB.getPartnerTeam(partnerRoot);
  } else if (IS_MASTER || ((IS_FINANCIAL || IS_RH) && !PARTNER_ROOT_ID)) {
    emps = typeof filterSouBluInternalUsers === 'function'
      ? filterSouBluInternalUsers(await DB.getAllEmployees())
      : await DB.getAllEmployees();
  } else if (IS_DESENVOLVEDOR) {
    const all = await DB.getAllEmployees();
    emps = all.filter(e => e.role === 'desenvolvedor' || e.department === 'Desenvolvimento');
  } else if (_isCommercialSupervisor()) {
    emps = await _getMergedTeamEmployees();
  } else if (IS_SUPERVISOR) {
    emps = await DB.getEmployeesByAdmin(ADMIN_ID);
  } else {
    emps = await DB.getEmployeesByAdmin(ADMIN_ID);
  }
  if (q) {
    emps = emps.filter(e => {
      const nm = _fmtPersonName(e.name).toLowerCase();
      return nm.includes(q) || String(e.email || '').toLowerCase().includes(q) || String(e.matricula || '').toLowerCase().includes(q);
    });
  }
  if (!partnerRoot && typeof filterSouBluInternalUsers === 'function') {
    emps = filterSouBluInternalUsers(emps);
  }
  emps = _sortEmpByName(emps);
  const maxB = Math.max(...emps.map(e => Math.max(0, userPts(e))), 1);
  const tbody = document.getElementById('employeesTbody');
  const canAddTeam = canManagePartnerTeam();
  if (!emps.length) {
    const addBtn = canAddTeam
      ? `<button class="btn btn-primary btn-sm" style="margin-left:12px;" onclick="openAddEmployeeModal()">+ Adicionar</button>`
      : '';
    tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--color-text-muted);">Nenhum membro na equipe.${addBtn}</td></tr>`;
    return;
  }
  const empReadOnly = (IS_SUPERVISOR && !partnerRoot) || (partnerRoot && !canAddTeam);
  const hidePartnerDelete = !!partnerRoot;
  tbody.innerHTML = emps.map(e=>{ const dispName = _fmtPersonName(e.name); return `<tr><td><div class="employee-avatar-cell">${avatarHtml(dispName,'avatar-sm',e.photo_url||'')}
      <div><div style="font-weight:700;">${dispName}</div><div style="font-size:12px;color:var(--color-text-muted);">${e.email}</div></div></div></td><td><code style="font-size:12px;background:var(--color-surface-2);padding:2px 6px;border-radius:4px;">${e.matricula}</code></td><td><span class="badge badge-muted">${e.department}${roleShort[e.role] ? ' · ' + roleShort[e.role] : ''}</span></td><td><span class="emp-pts-value" style="font-family:var(--font-display);font-weight:900;${userPts(e)<0?'color:var(--color-danger);':''}">${formatCurrency(userPts(e), e)}</span></td><td><div class="points-bar-wrap emp-pts-progress"><div class="points-bar"><div class="points-bar-fill" style="width:${userPts(e)<0?0:Math.round((userPts(e)/maxB)*100)}%;${userPts(e)<0?'background:var(--color-danger);':''}"></div></div></div></td><td>${e.active?'<span class="badge badge-success">Ativo</span>':'<span class="badge badge-danger">Inativo</span>'}</td><td><div style="display:flex;gap:6px;flex-wrap:wrap;">
      ${empReadOnly ? '<span style="font-size:12px;color:var(--color-text-muted);">Somente leitura</span>' : `
        ${(typeof canSouBluManagePoints === 'function' ? canSouBluManagePoints(e) : true) ? `<button class="btn btn-primary btn-sm" onclick="quickAddPoints('${e.id}','${dispName.replace(/'/g,"\\'")}')">Pontos</button>` : ''}<button class="btn btn-ghost btn-sm" onclick="${(roleShort[e.role] && !partnerRoot) ? `masterEditUser('${e.id}')` : `editEmployee('${e.id}')`}" title="Editar"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></button><button class="btn btn-ghost btn-sm" onclick="toggleEmployee('${e.id}')">${e.active?'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-danger);vertical-align: middle;" title="Desativar"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>':'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-success);vertical-align: middle;" title="Ativar"><polyline points="20 6 9 17 4 12"></polyline></svg>'}</button>${hidePartnerDelete ? '' : `<button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" onclick="delEmployee('${e.id}','${dispName.replace(/'/g,"\\'")}')" title="Apagar"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-danger);vertical-align: middle;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>`}
      `}
    </div></td></tr>`; }).join('');
}

function openAddEmployeeModal() {
  if (employeesManagedInRhHub()) {
    goToRhFuncionarios();
    return;
  }
  const partnerRoot = getEffectivePartnerRootId();
  if (IS_SUPERVISOR && !partnerRoot) { showToast('Supervisor não pode criar funcionários.','error'); return; }
  if (partnerRoot && !canManagePartnerTeam()) { showToast('Sem permissão para cadastrar equipe.','error'); return; }
  _wireEmpCpfLookup();
  const isPartnerTeam = !!partnerRoot;
  document.getElementById('empModalTitle').textContent = isPartnerTeam ? 'Novo membro da equipe' : 'Novo Funcionário';
  ['editEmpId','empCpf','empName','empContato','empEmail','empMatricula'].forEach(id=>document.getElementById(id).value='');
  _setEmpCpfStatus('', '');
  document.getElementById('empPassword').value='123456';
  document.getElementById('empBalance').value='0';
  _togglePartnerTeamRoleField(isPartnerTeam);
  const teamSel = document.getElementById('empTeamRole');
  if (isPartnerTeam && teamSel && typeof PartnerPerms !== 'undefined') {
    teamSel.value = 'vendedor';
    _syncEmpDeptFromTeamRole();
  } else {
    document.getElementById('empDept').value = IS_DESENVOLVEDOR ? 'Desenvolvimento' : 'Vendas';
  }
  openModal('addEmployeeModal');
}
async function editEmployee(id) {
  const partnerRoot = getEffectivePartnerRootId();
  if (IS_SUPERVISOR && !partnerRoot) { showToast('Supervisor não pode editar funcionários.','error'); return; }
  if (partnerRoot && !canManagePartnerTeam()) { showToast('Sem permissão para editar equipe.','error'); return; }
  _wireEmpCpfLookup();
  const e=await DB.getUser(id, true); if(!e)return;
  const teamRoot = partnerRoot;
  const belongs = teamRoot ? _userBelongsToPartnerRoot(e, teamRoot) : false;
  const canEdit = IS_MASTER || IS_FUNDA || IS_GERENTE
    || (teamRoot && canManagePartnerTeam() && belongs)
    || ((IS_FINANCIAL || IS_RH) && !teamRoot)
    || e.admin_id === ADMIN_ID
    || (teamRoot && e.admin_id === teamRoot);
  if (!canEdit) {
    showToast('Sem permissão para editar este funcionário.', 'warning');
    return;
  }
  document.getElementById('empModalTitle').textContent = teamRoot ? 'Editar membro da equipe' : 'Editar Funcionário';
  document.getElementById('editEmpId').value=e.id;
  document.getElementById('empCpf').value=_formatCpf(e.cpf || '');
  document.getElementById('empName').value=e.name;
  document.getElementById('empContato').value=e.phone || e.phone1 || '';
  document.getElementById('empEmail').value=e.email;
  document.getElementById('empMatricula').value=e.matricula || '';
  _setEmpCpfStatus('', '');
  document.getElementById('empPassword').value=e.password || '';
  _togglePartnerTeamRoleField(!!teamRoot);
  const teamSel = document.getElementById('empTeamRole');
  if (teamRoot && teamSel) {
    const partnerRoles = (typeof PartnerPerms !== 'undefined' && PartnerPerms.TEAM_ROLES)
      ? PartnerPerms.TEAM_ROLES.map(r => r.value)
      : ['vendedor', 'backoffice', 'operacional', 'sup_backoffice', 'rh', 'financeiro'];
    if (e.role && !partnerRoles.includes(e.role) && ![...teamSel.options].some((o) => o.value === e.role)) {
      const opt = document.createElement('option');
      opt.value = e.role;
      opt.textContent = e.role;
      teamSel.appendChild(opt);
    }
    teamSel.value = partnerRoles.includes(e.role) || e.role ? e.role : 'vendedor';
    _syncEmpDeptFromTeamRole();
  } else {
    document.getElementById('empDept').value=e.department || 'Vendas';
  }
  document.getElementById('empBalance').value=Number(e.balance||e.points||0).toFixed(2);
  openModal('addEmployeeModal');
}
async function saveEmployee() {
  const partnerRoot = getEffectivePartnerRootId();
  if (IS_SUPERVISOR && !partnerRoot) { showToast('Supervisor não pode editar funcionários.','error'); return; }
  if (partnerRoot && !canManagePartnerTeam()) { showToast('Sem permissão para salvar equipe.','error'); return; }
  const id=document.getElementById('editEmpId').value;
  const pts = parseInt(document.getElementById('empBalance').value)||0;
  let dept = document.getElementById('empDept').value;
  let role = dept === 'Vendas' ? 'vendedor' : 'employee';
  if (partnerRoot) {
    const teamSel = document.getElementById('empTeamRole');
    role = teamSel?.value || 'vendedor';
    if (role === 'financial') role = 'financeiro';
    dept = typeof PartnerPerms !== 'undefined' ? PartnerPerms.roleDept(role) : dept;
  } else if (id) {
    const existing = await DB.getUser(id, true).catch(() => null);
    if (existing?.role) role = existing.role;
  }
  const teamAdmin = partnerRoot || (((IS_FINANCIAL || IS_RH) && !partnerRoot) ? null : ADMIN_ID);
  const cpfDigits = (document.getElementById('empCpf')?.value || '').replace(/\D/g, '');
  const data={
    name:document.getElementById('empName').value.trim(),
    email:DB.normalizeEmail(document.getElementById('empEmail').value),
    matricula:document.getElementById('empMatricula').value.trim(),
    password:document.getElementById('empPassword').value,
    department:dept,
    balance:pts,
    points:pts,
    role,
    admin_id:teamAdmin,
    cpf: cpfDigits || null,
    phone: (document.getElementById('empContato')?.value || '').trim() || null,
  };
  if (partnerRoot) data.partner_root_id = partnerRoot;
  else if (id) {
    const existing = await DB.getUser(id, true).catch(() => null);
    if (existing?.partner_root_id) data.partner_root_id = existing.partner_root_id;
  }
  if(!data.name||!data.email){showToast('Nome e e-mail obrigatórios.','warning');return;}
  if (cpfDigits.length === 11) {
    const dup = typeof DB.getUserByCpf === 'function'
      ? await DB.getUserByCpf(cpfDigits).catch(() => null)
      : null;
    if (dup && dup.id !== id) {
      showToast('Este CPF já está cadastrado para outro funcionário.', 'error');
      return;
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    showToast('Informe um e-mail válido.', 'warning');
    return;
  }
  const partnerRootForLimit = partnerRoot || (teamAdmin && teamAdmin !== ADMIN_ID ? teamAdmin : null);
  if (!id && partnerRootForLimit) {
    const prt = await DB.getPartnerByUserId(partnerRootForLimit).catch(() => null);
    const lim = parseInt(prt?.meta?.funcionario_limite, 10) || 0;
    if (lim > 0) {
      const team = await DB.getPartnerTeam(partnerRootForLimit).catch(() => []);
      if (team.length >= lim) {
        showToast(`Limite de funcionários atingido (${lim}). Ajuste no cadastro do parceiro.`, 'error');
        return;
      }
    }
  }
  showLoading('Salvando...');
  try {
    if (await DB.isEmailTaken(data.email, id || null)) {
      const dup = await DB.getUserByEmail(data.email);
      const quem = dup?.name ? ` (${dup.name})` : '';
      showToast(`Este e-mail já está cadastrado${quem}. Use outro e-mail.`, 'error');
      return;
    }
    if(id){
      await DB.updateUser(id,data);
      showToast('Funcionário atualizado!','success');
    } else {
      await DB.addUser(data);
      showToast(partnerRoot ? 'Membro da equipe cadastrado!' : 'Funcionário cadastrado!','success');
    }
    closeModal('addEmployeeModal');
    if (typeof invalidateSouBluCaches === 'function') invalidateSouBluCaches();
    if (typeof invalidateClientsListCache === 'function') invalidateClientsListCache();
    if (window.PartnerOps) PartnerOps.invalidate();
    const refreshes = [renderEmployeesTable()];
    if (_empPartnerRootOverride && (IS_MASTER || IS_FUNDA)) refreshes.push(renderPartnersPanel());
    if (IS_MASTER || IS_FINANCIAL || IS_RH || IS_GERENTE || IS_DESENVOLVEDOR) refreshes.push(renderDashboard(), populateBalanceSelect());
    await Promise.all(refreshes);
  } catch(err) {
    console.error('[saveEmployee]', err);
    showToast(DB.formatUserDbError ? DB.formatUserDbError(err) : (err.message || 'tente novamente'), 'error');
  } finally { hideLoading(); }
}
async function toggleEmployee(id){
  if ((IS_SUPERVISOR && !PARTNER_ROOT_ID) || !canManagePartnerTeam()) { showToast('Sem permissão para alterar status.','error'); return; }
  if (IS_RH && !confirm(`Alterar status de ${(await DB.getUser(id))?.name}?`)) return;
  const e=await DB.getUser(id);if(!e)return;await DB.updateUser(id,{active:!e.active});await renderEmployeesTable();showToast(`${e.name} ${!e.active?'ativado':'desativado'}.`,'info');}
async function delEmployee(id,name){
  if (PARTNER_ROOT_ID || IS_PARCEIRO) {
    showToast('Parceiros não podem apagar membros da equipe. Desative o acesso se necessário.','warning');
    return;
  }
  if ((IS_SUPERVISOR && !PARTNER_ROOT_ID) || !canManagePartnerTeam()){showToast('Sem permissão para excluir.','error');return;}
  confirmAction(`Desativar ${name}?\n\nA conta será desativada (não apagada). Propostas permanecem.`,async()=>{
    showLoading('Desativando...');
    try{
      await DB.deleteUser(id);
      if (typeof invalidateSouBluCaches === 'function') invalidateSouBluCaches();
      await renderEmployeesTable();
      await renderDashboard();
      if (IS_MASTER||IS_GERENTE||IS_FINANCIAL||IS_RH||IS_DESENVOLVEDOR) await renderMasterPanel();
      showToast(`${name} desativado.`,'success');
    }catch(err){
      console.error('[delEmployee]',err);
      showToast('Erro ao desativar: '+(err.message||'tente novamente'),'error');
    }finally{hideLoading();}
  });
}

/* ══════════════════════════════════════════════
   SALDO
══════════════════════════════════════════════ */
async function populateBalanceSelect() {
  if (IS_SUPERVISOR) return;
  const el = document.getElementById('balanceEmployee');
  if (!el) return;
  const prevVal = el.value; // Preserve selected option during refresh

  let rows = [];
  if (IS_MASTER || IS_FINANCIAL || IS_GERENTE || IS_DESENVOLVEDOR) {
    rows = await DB.getAllUsers().catch(() => []);
  } else {
    rows = await DB.getEmployeesByAdmin(ADMIN_ID);
  }
  rows = (rows || [])
    .filter(e => e.active !== false)
    .filter(e => typeof isUserInPartnerNetworkSync !== 'function' || !isUserInPartnerNetworkSync(e))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
  
  el.innerHTML =
    `<option value="">Selecione...</option>`+
    rows.map(e => {
      const pts = formatCurrency(userPts(e), e);
      const rl = e.role ? String(e.role) : '–';
      const tag = e.matricula ? e.matricula : (e.email ? e.email.split('@')[0] : e.id.slice(-6));
      return `<option value="${e.id}">${e.name} (${tag}) — ${pts} · ${rl}</option>`;
    }).join('');

  if (prevVal) {
    el.value = prevVal; // Restore selection
  }
}
async function renderBalanceHistory() {
  if (window.SOUBLU_FINANCEIRO_PAGE && typeof syncFinanceiroRoleGlobals === 'function') syncFinanceiroRoleGlobals();
  const box = document.getElementById('balanceHistory');
  if (!box) return;

  // Histórico usa a mesma regra de escopo que dashboard/pedidos (_transactionsForRole).
  let txs = [];
  try {
    txs = (IS_MASTER || IS_GERENTE || IS_FINANCIAL || IS_RH || IS_DIRETORIA)
      ? await DB.getTransactions()
      : await _transactionsForRole();
  } catch (e) {
    console.warn('[renderBalanceHistory]', e);
    txs = [];
  }

  txs = (txs || [])
    .slice()
    .sort((a, b) => new Date(b.created_at || b.date || 0) - new Date(a.created_at || a.date || 0))
    .slice(0, 30);

  if (!txs.length) {
    box.innerHTML = '<div class="text-muted text-center" style="padding:20px;">Nenhuma movimentação.</div>';
    return;
  }

  const cache = {};
  box.innerHTML = (await Promise.all(txs.map(async t => {
    if (!cache[t.employee_id]) cache[t.employee_id] = await DB.getUser(t.employee_id);
    const emp = cache[t.employee_id];
    const isCr = t.type === 'credit';
    const metaLine = typeof formatTransactionMetaLine === 'function' ? formatTransactionMetaLine(t.meta) : '';
    const subLinha = `${t.reason || '—'}${metaLine ? ' · ' + metaLine : ''} · ${timeAgo(t.created_at || t.date)}`;
    return `<div class="tx-item"><div class="tx-icon ${isCr ? 'earn' : 'spend'}">${txTypeIcon(t.type)}</div><div class="tx-info"><div class="tx-title">${emp?.name || '–'}</div><div class="tx-date">${subLinha}</div></div><div class="tx-amount ${isCr ? 'earn' : 'spend'}">${isCr ? '+' : '−'}${formatCurrency(t.amount, emp)}</div></div>`;
  }))).join('');
}

/* ══════════════════════════════════════════════
   PRODUTOS
══════════════════════════════════════════════ */
async function renderProductsTable() {
  if (IS_SUPERVISOR || IS_RH) return;
  const prods = await DB.getProducts(IS_MASTER||IS_FINANCIAL ? null : ADMIN_ID);
  const tbody = document.getElementById('productsTbody');
  if(!prods.length){tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--color-text-muted);">Nenhum produto. <button class="btn btn-primary btn-sm" style="margin-left:12px;" onclick="openAddProductModal()">+ Adicionar</button></td></tr>`;return;}
  tbody.innerHTML=prods.map(p=>{
    const img=p.image_url?`<img src="${p.image_url}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;">`:`<span style="font-size:26px;">${p.emoji||''}</span>`;
    return`<tr><td><div style="display:flex;align-items:center;gap:10px;">${img}<div><div style="font-weight:700;font-size:14px;">${p.name}</div><div style="font-size:11px;color:var(--color-text-muted);">${(p.description||'').slice(0,40)}${(p.description||'').length>40?'…':''}</div></div></div></td><td><span class="badge badge-muted">${p.category}</span></td><td><span class="pts-orange" style="font-family:var(--font-display);font-weight:900;">${formatCurrency(p.price)}</span></td><td><span class="${p.stock===0?'text-danger':p.stock<5?'text-warning':'text-success'}" style="font-weight:700;">${p.stock} un.</span></td><td>${p.active?'<span class="badge badge-success">Ativo</span>':'<span class="badge badge-muted">Inativo</span>'}</td><td>${p.featured?'':'–'}</td><td><div style="display:flex;gap:6px;"><button class="btn btn-ghost btn-sm" onclick="editProduct('${p.id}')" title="Editar"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></button><button class="btn btn-ghost btn-sm" onclick="toggleProduct('${p.id}')">${p.active?'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-danger);vertical-align: middle;" title="Desativar"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>':'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-success);vertical-align: middle;" title="Ativar"><polyline points="20 6 9 17 4 12"></polyline></svg>'}</button><button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" onclick="deleteProduct('${p.id}')" title="Apagar"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-danger);vertical-align: middle;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button></div></td></tr>`;
  }).join('');
}

function openAddProductModal(){
  _prodImgUrl='';
  document.getElementById('prodModalTitle').textContent='Novo Produto';
  document.getElementById('editProdId').value='';
  ['prodName','prodDesc','prodPrice','prodStock'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('prodEmoji').value='';document.getElementById('prodCategory').value='Tecnologia';document.getElementById('prodFeatured').checked=false;
  document.getElementById('prodImagePreview').style.display='none';document.getElementById('prodImageFile').value='';
  const th=document.getElementById('prodImgThumb');if(th)th.innerHTML='<span style="font-size:32px;"></span>';
  openModal('addProductModal');
}
async function editProduct(id){
  const p=await DB.getProduct(id);if(!p)return;
  _prodImgUrl=p.image_url||'';
  document.getElementById('prodModalTitle').textContent='Editar Produto';
  document.getElementById('editProdId').value=p.id;document.getElementById('prodName').value=p.name;
  document.getElementById('prodDesc').value=p.description;document.getElementById('prodCategory').value=p.category;
  document.getElementById('prodEmoji').value=p.emoji||'';document.getElementById('prodPrice').value=(p.price||0).toFixed(2);
  document.getElementById('prodStock').value=p.stock;document.getElementById('prodFeatured').checked=p.featured;
  document.getElementById('prodImageFile').value='';
  const prev=document.getElementById('prodImagePreview'),th=document.getElementById('prodImgThumb');
  if(_prodImgUrl){prev.src=_prodImgUrl;prev.style.display='block';if(th)th.innerHTML=`<img src="${_prodImgUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;}
  else{prev.style.display='none';if(th)th.innerHTML=`<span style="font-size:32px;">${p.emoji||''}</span>`;}
  openModal('addProductModal');
}
async function handleProductImageUpload(input){
  const file=input.files[0];if(!file)return;
  if(file.size>3*1024*1024){showToast('Máx 3MB.','warning');input.value='';return;}
  showLoading('Enviando imagem...');
  try{
    _prodImgUrl=await uploadImage(file,'product-images');
    const prev=document.getElementById('prodImagePreview'),th=document.getElementById('prodImgThumb');
    prev.src=_prodImgUrl;prev.style.display='block';
    if(th)th.innerHTML=`<img src="${_prodImgUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;
    showToast('Imagem carregada!','success');
  }catch(e){console.error(e);showToast('Erro ao enviar.','error');}finally{hideLoading();}
}
function removeProductImage(){_prodImgUrl='';document.getElementById('prodImageFile').value='';document.getElementById('prodImagePreview').style.display='none';const th=document.getElementById('prodImgThumb');const emoji=document.getElementById('prodEmoji')?.value||'';if(th)th.innerHTML=`<span style="font-size:32px;">${emoji}</span>`;}
async function saveProduct(){
  const id=document.getElementById('editProdId').value;
  const data={name:document.getElementById('prodName').value.trim(),description:document.getElementById('prodDesc').value.trim(),category:document.getElementById('prodCategory').value,emoji:document.getElementById('prodEmoji').value||'',image_url:_prodImgUrl,price:parseFloat(document.getElementById('prodPrice').value),points_price:parseFloat(document.getElementById('prodPrice').value),stock:parseInt(document.getElementById('prodStock').value),featured:document.getElementById('prodFeatured').checked,admin_id:ADMIN_ID};
  if(!data.name||isNaN(data.price)||data.price<0||isNaN(data.stock)){showToast('Preencha os campos.','warning');return;}
  showLoading();
  try{
    if(id){await DB.updateProduct(id,data);showToast('Produto atualizado!','success');}
    else{await DB.addProduct(data);showToast('Produto cadastrado!','success');}
    closeModal('addProductModal');await renderProductsTable();await renderDashboard();
  }finally{hideLoading();}
}
async function toggleProduct(id){const p=await DB.getProduct(id);if(!p)return;await DB.updateProduct(id,{active:!p.active});await renderProductsTable();showToast(`${p.name} ${!p.active?'ativado':'desativado'}.`,'info');}
async function deleteProduct(id){
  const p=await DB.getProduct(id);
  if(!p){showToast('Produto não encontrado.','error');return;}
  confirmAction(`Excluir "${p.name}"?`,async()=>{
    showLoading();
    try{
      await DB.deleteProduct(id);
      await renderProductsTable();
      await renderDashboard();
      showToast('Produto removido.','success');
    }catch(e){
      console.error('deleteProduct',e);
      const msg=(e?.message||'').includes('23503')||/foreign key|violates/i.test(e?.message||'')
        ? 'Não foi possível excluir: existem pedidos vinculados a este produto.'
        : 'Erro ao excluir produto. Tente novamente.';
      showToast(msg,'error');
    }finally{hideLoading();}
  });
}

/* ══════════════════════════════════════════════
   PEDIDOS
══════════════════════════════════════════════ */
const STATUS_OPT=['pendente','aprovado','enviado','entregue','cancelado'];
async function renderOrdersTable(){
  const q=(document.getElementById('orderSearch')?.value||'').toLowerCase();
  let orders = await _ordersForRole();
  orders = (orders || []).slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  if(q)orders=orders.filter(o=>(o.order_code||'').toLowerCase().includes(q));
  const tbody=document.getElementById('ordersTbody');
  if(!orders.length){tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--color-text-muted);">Nenhum pedido.</td></tr>`;return;}
  const cache={};
  tbody.innerHTML=(await Promise.all(orders.map(async o=>{
    if(!cache[o.employee_id])cache[o.employee_id]=await DB.getUser(o.employee_id);
    const emp=cache[o.employee_id];const items=Array.isArray(o.items)?o.items:(typeof o.items==='string'?JSON.parse(o.items||'[]'):[]);
    return`<tr><td><strong>${o.order_code||o.id}</strong></td><td><div class="employee-avatar-cell">${avatarHtml(emp?.name||'–','avatar-sm',emp?.photo_url||'')}
    <div><div style="font-weight:600;font-size:13px;">${emp?.name||'Desconhecido'}</div><div style="font-size:11px;color:var(--color-text-muted);">${emp?.department||''}</div></div></div></td><td>${items.map(i=>`<span style="font-size:11px;background:var(--color-surface-2);padding:2px 7px;border-radius:4px;margin:2px;display:inline-block;">${i.name} x${i.qty}</span>`).join('')}</td><td><span class="pts-orange" style="font-family:var(--font-display);font-weight:900;">${formatCurrency(o.total_points ?? o.total_price ?? 0)}</span></td><td style="font-size:12px;color:var(--color-text-muted);">${formatDate(o.created_at)}</td><td>${orderStatusBadge(o.status)}</td><td><select style="font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--color-border);" onchange="changeOrderStatus('${o.id}',this.value)">${STATUS_OPT.map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${s[0].toUpperCase()+s.slice(1)}</option>`).join('')}</select><button onclick="deleteOrder('${o.id}')" title="Apagar pedido" style="margin-left:6px;background:none;border:1px solid #ff4d4d;color:#ff4d4d;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:12px;line-height:1.4;" onmouseover="this.style.background='#ff4d4d';this.style.color='#fff'" onmouseout="this.style.background='none';this.style.color='#ff4d4d'">Apagar</button></td></tr>`;
  }))).join('');
}
async function changeOrderStatus(id,status){await DB.updateOrderStatus(id,status);await renderOrdersTable();await updatePendingBadge();await renderDashboard();showToast(`Pedido → "${status}"`,'success');}
async function deleteOrder(id){if(!confirm('Apagar este pedido? Essa ação não pode ser desfeita.'))return;await DB.deleteOrder(id);await renderOrdersTable();await updatePendingBadge();await renderDashboard();showToast('Pedido apagado.','success');}
async function updatePendingBadge(){const orders=await _ordersForRole();const n=orders.filter(o=>o.status==='pendente').length;const b=document.getElementById('pendingBadge');if(b){b.textContent=n;b.style.display=n>0?'inline':'none';}}

/* ══════════════════════════════════════════════
   SAQUES — Dupla aprovação: Master + Financeiro
══════════════════════════════════════════════ */
let _withdrawalsPixHealthCache = null;

async function checkWithdrawalsPixHealth(force) {
  const cfg = window.SOUBLU_CONFIG || {};
  const base = String(cfg.PIX_PHP_PAY_URL || '').replace(/\?.*$/, '');
  const token = String(cfg.PIX_INTERNAL_TOKEN || '').trim();
  if (!base || !token) {
    return { ok: false, error: 'PIX_PHP_PAY_URL ou PIX_INTERNAL_TOKEN não configurados no frontend.' };
  }
  if (!force && _withdrawalsPixHealthCache) return _withdrawalsPixHealthCache;
  try {
    const res = await fetch(`${base}?action=health`, {
      method: 'GET',
      headers: { 'X-PIX-Token': token },
    });
    const data = await res.json().catch(() => ({}));
    const dbOk = data.has_database === true || data.has_supabase === true;
    const ok = res.ok && data.ok !== false && dbOk;
    _withdrawalsPixHealthCache = {
      ok,
      data,
      error: data.error || (!res.ok ? `HTTP ${res.status}` : null)
        || (!dbOk ? 'SUPABASE_SERVICE_KEY ausente em config.pix.local.php no servidor.' : null),
    };
  } catch (e) {
    _withdrawalsPixHealthCache = {
      ok: false,
      error: (e && e.message) ? e.message : String(e),
      hint: 'Crie config.pix.local.php na raiz do site (copie do .example) com SUPABASE_SERVICE_KEY e o mesmo PIX_INTERNAL_TOKEN do painel.',
    };
  }
  return _withdrawalsPixHealthCache;
}

function _renderWithdrawalsPixBanner(health) {
  const sec = document.getElementById('secWithdrawals');
  if (!sec) return;
  let el = document.getElementById('withdrawalsPixHealthBanner');
  if (!health || health.ok) {
    if (el) el.remove();
    return;
  }
  const msg = health.error || health.data?.error || 'API PIX indisponível';
  const hint = health.hint || health.data?.hint || '';
  const html = `<div id="withdrawalsPixHealthBanner" class="card card-padded" style="margin-bottom:16px;border-left:4px solid var(--color-danger);background:#fef2f2;">
    <strong style="color:var(--color-danger);">PIX / banco — atenção</strong>
    <p style="margin:8px 0 0;font-size:13px;line-height:1.5;">${msg}</p>
    ${hint ? `<p style="margin:8px 0 0;font-size:12px;color:var(--color-text-muted);">${hint}</p>` : ''}
    <p style="margin:8px 0 0;font-size:12px;">Teste no navegador: <code style="font-size:11px;">${(window.SOUBLU_CONFIG?.PIX_PHP_PAY_URL || '').replace(/\?.*$/, '')}?action=health</code> (com header X-PIX-Token).</p>
  </div>`;
  if (!el) {
    sec.insertAdjacentHTML('afterbegin', html);
  } else {
    el.outerHTML = html;
  }
}

async function renderWithdrawalsTable(){
  if (window.SOUBLU_FINANCEIRO_PAGE && typeof syncFinanceiroRoleGlobals === 'function') syncFinanceiroRoleGlobals();
  const tbody=document.getElementById('withdrawalsTbody');if(!tbody)return;
  checkWithdrawalsPixHealth(false).then(_renderWithdrawalsPixBanner).catch(() => {});
  let wds = [];
  try {
    wds = (IS_MASTER || IS_FUNDA || IS_FINANCIAL || IS_RH)
      ? await DB.getWithdrawals()
      : await DB.getWithdrawalsByAdmin(ADMIN_ID);
  } catch (e) {
    console.error('[renderWithdrawalsTable]', e);
    tbody.innerHTML=`<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--color-danger);">Não foi possível carregar saques. ${e.message||e}</td></tr>`;
    return;
  }
  if(!wds.length){
    tbody.innerHTML=`<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--color-text-muted);">Nenhum saque solicitado.</td></tr>`;
    return;
  }
  if (typeof DB.syncPartnerWithdrawalDebits === 'function') {
    const paidEmpIds = [...new Set(
      wds.filter(w => String(w.status || '').toLowerCase() === 'pago' || String(w.pix_status || '').toLowerCase() === 'pago')
        .map(w => w.employee_id).filter(Boolean)
    )];
    await Promise.all(paidEmpIds.map(id => DB.syncPartnerWithdrawalDebits(id).catch(() => null)));
  }
  const cfgPix = window.SOUBLU_CONFIG || {};
  const gwConfigured = !!(
    (cfgPix.PIX_GATEWAY_URL && cfgPix.PIX_GATEWAY_BEARER) ||
    (cfgPix.PIX_PHP_PAY_URL && cfgPix.PIX_INTERNAL_TOKEN)
  );
  const empCache = {};
  try {
    const allUsers = await DB.getUsers();
    (allUsers || []).forEach(u => { if (u?.id) empCache[u.id] = u; });
    if (typeof DB.getFinanceSuppliers === 'function') {
      const allSup = await DB.getFinanceSuppliers().catch(()=>[]);
      allSup.forEach(s => { if (s?.id) empCache[s.id] = { id: s.id, name: s.name, role: 'fornecedor' }; });
    }
  } catch (e) {
    console.warn('[renderWithdrawalsTable] usuários/fornecedores:', e.message);
  }
  const partnerCache = {};
  let rowsHtml = '';
  for (const w of wds) {
    try {
    let wdMeta = {};
    try { wdMeta = typeof w.notes === 'string' && w.notes.startsWith('{') ? JSON.parse(w.notes) : {}; } catch (_) { wdMeta = {}; }
    const actualEmployeeId = wdMeta.supplier_id || w.employee_id;
    const emp = empCache[actualEmployeeId] || null;
    const mOk = w.approved_by_master;
    const fOk = w.approved_by_financial;

    let empPartner = null;
    const partnerKey = emp?.admin_id || (emp?.role === 'parceiro' ? emp.id : '');
    if (partnerKey) {
      if (!Object.prototype.hasOwnProperty.call(partnerCache, partnerKey)) {
        try {
          partnerCache[partnerKey] = await DB.getPartnerByUserId(partnerKey);
        } catch (_) {
          partnerCache[partnerKey] = null;
        }
      }
      empPartner = partnerCache[partnerKey];
    }
    const orgBadge = empPartner
      ? `<span class="badge badge-info" style="font-size:10px;display:block;margin-top:4px;">Parceiro</span>`
      : '';

    // Botão Master: só aparece para master/fundador e saque não rejeitado/pago
    const btnMaster = ((IS_MASTER || IS_FUNDA) && !mOk && !['pago','rejeitado'].includes(w.status))
      ? `<button class="btn btn-success btn-sm" style="width:100%;margin-top:4px;font-size:11px;"
           onclick="approveWdMaster('${w.id}')">Aprovar</button>`
      : '';

    // Botão Financeiro: só aparece para financeiro e saque não rejeitado/pago
    const btnFin = (IS_FINANCIAL && !fOk && !['pago','rejeitado'].includes(w.status))
      ? `<button class="btn btn-success btn-sm" style="width:100%;margin-top:4px;font-size:11px;background:#2563eb;border-color:#2563eb;"
           onclick="approveWdFin('${w.id}')">Aprovar</button>`
      : '';

    // Botão rejeitar: master ou financeiro
    const btnReject = (((IS_MASTER || IS_FUNDA) || IS_FINANCIAL) && !['pago','rejeitado'].includes(w.status))
      ? `<button class="btn btn-ghost btn-sm" style="width:100%;margin-top:4px;font-size:11px;color:var(--color-danger);"
           onclick="rejectWd('${w.id}')">Rejeitar</button>`
      : '';

    // Card de aprovação — altura igual sempre com min-height fixo
    const cardStyle = (ok, cor) =>
      `border:1.5px solid ${ok?'var(--color-success)':cor||'var(--color-border)'};
       border-radius:var(--radius-md);padding:8px;text-align:center;
       background:${ok?'rgba(0,179,65,.06)':'var(--color-surface-2)'};
       width:100px;min-height:80px;display:flex;flex-direction:column;
       align-items:center;justify-content:center;gap:2px;`;

    const cardMaster = `
      <div style="${cardStyle(mOk)}"><div style="font-size:10px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;">Master</div>
        ${mOk
          ? `<span style="font-size:14px;font-weight:700;color:var(--color-success);">Aprovado</span>`
          : `<span style="font-size:14px;font-weight:700;color:var(--color-text-muted);">Pendente</span>`}
        ${btnMaster}
      </div>`;

    const cardFin = `
      <div style="${cardStyle(fOk,'var(--color-info-light)')}"><div style="font-size:10px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;">Financeiro</div>
        ${fOk
          ? `<span style="font-size:14px;font-weight:700;color:var(--color-success);">Aprovado</span>`
          : `<span style="font-size:14px;font-weight:700;color:var(--color-text-muted);">Pendente</span>`}
        ${btnFin}
      </div>`;

    const receiptBtn = (typeof canDownloadWdReceipt === 'function' && canDownloadWdReceipt(w))
      ? `<button type="button" class="btn btn-outline btn-sm" style="font-size:11px;white-space:nowrap;"
           onclick="downloadWdReceipt('${w.id}')" title="Baixar comprovante">Comprovante</button>`
      : `<span style="font-size:11px;color:var(--color-text-muted);">—</span>`;

    const pixNeedsBank = w.approved_by_master && w.approved_by_financial && w.status !== 'rejeitado';
    const pixConfirmed = !!(w.pix_e2e_id && String(w.pix_e2e_id).trim() && !/^mock/i.test(String(w.pix_e2e_id)));
    const refreshPixBtn = (gwConfigured && (IS_MASTER || IS_FUNDA || IS_FINANCIAL) && pixNeedsBank)
      ? `<button type="button" class="btn btn-ghost btn-sm" style="font-size:10px;margin-top:4px;padding:2px 6px;"
           onclick="refreshWdPixStatus('${w.id}')" title="Consultar status na Efi">↻ Atualizar</button>`
      : '';
    const retryPixBtn = (gwConfigured && (IS_MASTER || IS_FUNDA || IS_FINANCIAL) && pixNeedsBank && !pixConfirmed
      && String(w.pix_status || '').toLowerCase() !== 'manual' && w.status !== 'pago')
      ? `<button type="button" class="btn btn-outline btn-sm" style="font-size:10px;margin-top:4px;padding:2px 6px;"
           onclick="retryWdPixPay('${w.id}')" title="Enviar PIX de novo para o banco">↻ Reenviar PIX</button>`
      : '';

    const btnManualPaid = ((IS_MASTER || IS_FUNDA || IS_FINANCIAL)
        && !['pago', 'rejeitado'].includes(w.status)
        && !pixConfirmed
        && String(w.pix_status || '').toLowerCase() !== 'manual')
      ? `<button type="button" class="btn btn-outline btn-sm" style="width:100%;margin-top:4px;font-size:11px;border-color:#0d9488;color:#0f766e;"
           onclick="markWdManuallyPaid('${w.id}')"
           title="Já pagou fora do sistema? Marca como aprovado/pago sem enviar PIX automático">Pago manual</button>`
      : '';

    const pixBankCell = `${typeof pixWdStatusBadge === 'function' ? pixWdStatusBadge(w) : '—'}${refreshPixBtn}${retryPixBtn}`;

    const irpfTax = Number(wdMeta.irpf_tax || 0);
    const irpjTax = Number(wdMeta.irpj_tax || 0);
    const payType = String(w.method || wdMeta.payment_method || 'pix').toLowerCase();
    const typeLbl = payType.includes('conta') ? 'CONTA CORRENTE' : String(w.pix_key_type || 'pix').toUpperCase();
    const debitoPending = !!wdMeta.account_debito_pending;
    const debitoAmt = Number(wdMeta.account_debito_amount || 0);
    const trStyle = debitoPending
      ? ' style="background:rgba(220,38,38,.12);outline:1px solid rgba(220,38,38,.35);"'
      : '';
    const debitoBadge = debitoPending
      ? `<div style="font-size:10px;font-weight:700;color:#b91c1c;margin-top:4px;" title="Colaborador sacou sem descontar débitos em aberto">⚠ Débito em conta${debitoAmt > 0 ? ' · ' + formatMoney(debitoAmt) : ''}</div>`
      : '';

    rowsHtml += `<tr${trStyle}><td><div class="employee-avatar-cell">
        ${avatarHtml(emp?.name||'–','avatar-sm',emp?.photo_url||'')}
        <div style="font-size:13px;font-weight:600;">${emp?.name||'–'}</div>
        ${orgBadge}${debitoBadge}
      </div></td><td><span class="pts-orange" style="font-family:var(--font-display);font-weight:900;">
        ${formatCurrency(w.amount, emp)}
      </span>${irpjTax > 0 ? `<div style="font-size:10px;color:var(--color-warning);">IRPJ −${formatMoney(irpjTax)}</div>` : ''}${irpfTax > 0 ? `<div style="font-size:10px;color:var(--color-warning);">IRPF −${formatMoney(irpfTax)}</div>` : ''}</td><td><div style="font-size:12px;"><strong>${typeLbl}</strong></div><div style="font-size:12px;color:var(--color-text-muted);">${w.pix_key}</div><div style="font-size:11px;color:var(--color-text-muted);">${w.holder_name}${w.bank_name?' · '+w.bank_name:''}</div></td><td style="font-size:12px;">${formatDate(w.created_at)}</td><td>${wdStatusBadge(w.status)}</td><td>${pixBankCell}</td><td style="text-align:center;">${receiptBtn}</td><td><input type="text" style="font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--color-border);width:110px;"
        placeholder="Observação" id="note_${w.id}" value="${w.admin_note||''}"></td><!-- MASTER + FINANCEIRO lado a lado na mesma célula --><td><div style="display:flex;gap:8px;align-items:flex-start;">
        ${cardMaster}
        ${cardFin}
      </div>
      ${(!['pago','rejeitado'].includes(w.status)&&(IS_MASTER||IS_FUNDA||IS_FINANCIAL))
        ? `<div style="margin-top:6px;">${btnManualPaid}${btnReject}</div>`
        : ''}
    </td></tr>`;
    } catch (rowErr) {
      console.warn('[renderWithdrawalsTable] linha', w.id, rowErr);
      rowsHtml += `<tr><td colspan="9" style="color:var(--color-text-muted);font-size:12px;">Erro ao exibir saque ${w.id}</td></tr>`;
    }
  }
  tbody.innerHTML = rowsHtml;
}

async function _toastPixAfterApproval(wd) {
  const pix = wd?._pixResult;
  if (!pix) return;
  if (pix.skipped) {
    if (pix.reason === 'pix_not_configured' || pix.reason === 'gateway_not_configured') {
      showToast('API PIX não configurada no servidor — o dinheiro NÃO foi enviado ao banco.', 'error', 10000);
    }
    return;
  }
  if (pix.ok && wd?.pix_e2e_id) {
    showToast('PIX confirmado pelo banco (E2E: …' + String(wd.pix_e2e_id).slice(-8) + ').', 'success', 8000);
  } else if (pix.ok) {
    showToast('PIX enviado — aguardando confirmação do banco. Use "Atualizar" na coluna Status Banco.', 'info', 9000);
  } else {
    const detail = pix.error || pix.hint || pix.message || 'motivo não informado pela API';
    showToast('Falha ao enviar PIX: ' + detail + ' — nada foi creditado no banco.', 'error', 12000);
  }
}

async function retryWdPixPay(id) {
  if (!(IS_MASTER || IS_FUNDA || IS_FINANCIAL)) { showToast('Sem permissão.', 'error'); return; }
  if (!confirm('Reenviar este saque via PIX para o banco?')) return;
  showLoading('Enviando PIX...');
  try {
    const r = await DB.retryWithdrawalPix(id);
    await renderWithdrawalsTable();
    await updateWithdrawalsBadge();
    if (r?.ok) {
      const wd = r.withdrawal || await DB.getWithdrawalById(id);
      if (wd?.pix_e2e_id) showToast('PIX enviado e confirmado pelo banco.', 'success');
      else showToast('PIX enviado — aguarde confirmação ou clique em Atualizar.', 'info');
    } else {
      showToast(r?.error || r?.hint || 'Falha ao reenviar PIX.', 'error', 10000);
    }
  } catch (e) {
    showToast((e && e.message) ? e.message : String(e), 'error', 10000);
  } finally { hideLoading(); }
}

/** Marca saque como pago fora do sistema (sem disparar PIX automático). */
async function markWdManuallyPaid(id) {
  if (!(IS_MASTER || IS_FUNDA || IS_FINANCIAL)) { showToast('Sem permissão.', 'error'); return; }
  if (!confirm('Confirmar pagamento MANUAL deste saque?\n\nO sistema NÃO enviará PIX. Use só se o valor já foi pago por fora.')) return;
  const note = document.getElementById('note_' + id)?.value || '';
  showLoading('Marcando como pago manual...');
  try {
    await DB.markWdManualPaid(id, note);
    await renderWithdrawalsTable();
    await updateWithdrawalsBadge();
    showToast('Saque marcado como pago manualmente (sem PIX automático).', 'success');
  } catch (e) {
    showToast('Erro: ' + (e.message || e), 'error');
  } finally { hideLoading(); }
}

async function downloadWdReceipt(id) {
  const wd = await DB.getWithdrawalById(id);
  if (!wd) { showToast('Saque não encontrado.', 'error'); return; }
  const emp = await DB.getUser(wd.employee_id).catch(() => null);
  if (typeof downloadWithdrawalReceipt === 'function') downloadWithdrawalReceipt(wd, emp);
  else showToast('Função de comprovante indisponível.', 'error');
}

async function refreshWdPixStatus(id) {
  if (!(IS_MASTER || IS_FINANCIAL)) { showToast('Sem permissão.', 'error'); return; }
  showLoading('Consultando status no banco...');
  try {
    const r = await DB.refreshWithdrawalPixStatus(id);
    await renderWithdrawalsTable();
    if (r?.ok === false && !r?.skipped) {
      showToast(r.error || r.hint || 'Não foi possível atualizar o status.', 'warning', 10000);
    } else if (r?.skipped) {
      showToast('Gateway PIX não configurado — exibindo último status salvo.', 'info');
    } else {
      showToast('Status bancário atualizado.', 'success');
    }
  } catch (e) {
    showToast('Erro ao consultar status: ' + (e.message || e), 'error');
  } finally { hideLoading(); }
}

async function approveWdMaster(id) {
  const note = document.getElementById('note_'+id)?.value||'';
  showLoading('Aprovando...');
  let wd = null;
  try {
    wd = await DB.approveWdMaster(id, note);
    if (!wd) { showToast('Saque não encontrado ou falha ao aprovar.', 'error'); return; }
  } catch (e) {
    console.error('[approveWdMaster]', e);
    showToast('Erro ao aprovar saque: ' + (e.message || 'tente novamente'), 'error');
    return;
  } finally {
    hideLoading();
  }
  try {
    await renderWithdrawalsTable();
    await updateWithdrawalsBadge();
    let msg = wd?.approved_by_financial
      ? 'Ambas aprovações concluídas.'
      : 'Aprovado pelo Master. Aguardando aprovação do Financeiro.';
    if (wd?.approved_by_financial && typeof PIX_AUTO_ON_APPROVAL !== 'undefined' && PIX_AUTO_ON_APPROVAL) {
      msg += ' Enviando PIX automaticamente…';
    }
    showToast(msg, wd?.approved_by_financial ? 'success' : 'info');
    await _toastPixAfterApproval(wd);
  } catch (e) {
    console.warn('[approveWdMaster] atualizar lista:', e);
    showToast('Aprovação salva. Atualize a página (F5) se a lista não mudou.', 'warning');
  }
}

async function approveWdFin(id) {
  const note = document.getElementById('note_'+id)?.value||'';
  showLoading('Aprovando...');
  let wd = null;
  try {
    wd = await DB.approveWdFinancial(id, note);
    if (!wd) { showToast('Saque não encontrado ou falha ao aprovar.', 'error'); return; }
  } catch (e) {
    console.error('[approveWdFin]', e);
    showToast('Erro ao aprovar saque: ' + (e.message || 'tente novamente'), 'error');
    return;
  } finally {
    hideLoading();
  }
  try {
    await renderWithdrawalsTable();
    await updateWithdrawalsBadge();
    let msg = wd?.approved_by_master
      ? 'Ambas aprovações concluídas.'
      : 'Aprovado pelo Financeiro. Aguardando aprovação do Master.';
    if (wd?.approved_by_master && typeof PIX_AUTO_ON_APPROVAL !== 'undefined' && PIX_AUTO_ON_APPROVAL) {
      msg += ' Enviando PIX automaticamente…';
    }
    showToast(msg, wd?.approved_by_master ? 'success' : 'info');
    await _toastPixAfterApproval(wd);
  } catch (e) {
    console.warn('[approveWdFin] atualizar lista:', e);
    showToast('Aprovação salva. Atualize a página (F5) se a lista não mudou.', 'warning');
  }
}

async function rejectWd(id) {
  const note = document.getElementById('note_'+id)?.value||'';
  if (!confirm('Rejeitar este saque? O valor em dinheiro será devolvido ao saldo do colaborador.')) return;
  showLoading('Rejeitando e devolvendo pontos...');
  try {
    await DB.rejectWd(id, note);
    showToast('Saque rejeitado — saldo devolvido ao funcionário.','info');
    try {
      await renderWithdrawalsTable();
      await updateWithdrawalsBadge();
    } catch (e) {
      console.warn('[rejectWd] atualizar lista:', e);
      showToast('Rejeição salva. Atualize a página (F5) se a lista não mudou.', 'warning');
    }
  } catch (e) {
    showToast('Erro ao rejeitar: ' + (e.message || e), 'error');
  } finally { hideLoading(); }
}

function openPayConfirm(id, note='') {
  const idEl = document.getElementById('payConfirmWdId');
  const noteEl = document.getElementById('payConfirmNote');
  if (idEl) idEl.value = id;
  if (noteEl) noteEl.value = note || document.getElementById('note_' + id)?.value || '';
  openModal('payConfirmOverlay');
}

function cancelPayConfirm() {
  closeModal('payConfirmOverlay');
}

async function confirmPayment() {
  const id = document.getElementById('payConfirmWdId')?.value;
  const note = document.getElementById('payConfirmNote')?.value || '';
  if (!id) { cancelPayConfirm(); return; }
  if (!(IS_MASTER || IS_FINANCIAL)) { showToast('Sem permissão.', 'error'); return; }
  showLoading('Confirmando pagamento...');
  try {
    await DB.markWdPaid(id, note);
    await renderWithdrawalsTable();
    await updateWithdrawalsBadge();
    showToast('Saque marcado como pago!', 'success');
  } catch (e) {
    console.error('[confirmPayment]', e);
    showToast('Erro ao confirmar pagamento.', 'error');
  } finally {
    cancelPayConfirm();
    hideLoading();
  }
}

/* aprovação dupla: ver approveWdMaster / approveWdFin acima */
async function updateWithdrawalsBadge(){const wds=(IS_MASTER||IS_FINANCIAL)?await DB.getWithdrawals():await DB.getWithdrawalsByAdmin(ADMIN_ID);const n=wds.filter(w=>w.status==='solicitado').length;const b=document.getElementById('wdPendingBadge');if(b){b.textContent=n;b.style.display=n>0?'inline':'none';}}

/* ══════════════════════════════════════════════
   RANKING
══════════════════════════════════════════════ */
function _hasGlobalRankingView() {
  return IS_MASTER || IS_FUNDA || IS_GERENTE || IS_FINANCIAL || IS_RH || IS_DESENVOLVEDOR || IS_DIRETORIA;
}

async function _usersForAdminRanking() {
  if (_hasGlobalRankingView()) {
    return (await DB.getAllUsers().catch(() => [])) || [];
  }
  if (_isCommercialSupervisor()) {
    return (await _getMergedTeamEmployees().catch(() => [])) || [];
  }
  return (await DB.getEmployeesByAdmin(ADMIN_ID).catch(() => [])) || [];
}

async function renderAdminRanking() {
  if (_isPartnerOrgUser()) return;
  if (window.__ADMIN_NAV_CFG__ && !window.__ADMIN_NAV_CFG__.canRanking) return;
  if (typeof SalesRanking !== 'undefined' && SalesRanking.renderAdmin) {
    return SalesRanking.renderAdmin();
  }
  const box = document.getElementById('adminRankingList');
  if (box) box.innerHTML = '<div class="text-muted text-center" style="padding:20px;">Ranking indisponível.</div>';
}


/* ══════════════════════════════════════════════
   FEEDBACK / HISTÓRICO DO FUNCIONÁRIO
   Master, RH, Financeiro e Desenvolvimento
══════════════════════════════════════════════ */

let _feedbackEmpId   = null;
let _feedbackEmpName = '';
let _feedbacks       = [];   // cache local de feedbacks (localStorage fallback)

const FB_KEY = 'soublu_feedbacks';

function _fbLoad()       { try { return JSON.parse(localStorage.getItem(FB_KEY)||'[]'); } catch { return []; } }
function _fbSave(list)   { localStorage.setItem(FB_KEY, JSON.stringify(list)); }
function _fbId()         { return 'fb' + Date.now().toString(36) + Math.random().toString(36).slice(2,5); }

async function _employeesForSupervisorPanel() {
  let rows;
  if (IS_MASTER || IS_FINANCIAL || IS_RH) rows = await DB.getAllEmployees();
  else if (IS_DESENVOLVEDOR) {
    const all = await DB.getAllEmployees();
    rows = all.filter(e => e.role === 'desenvolvedor' || e.department === 'Desenvolvimento');
  } else if (_isCommercialSupervisor()) {
    rows = await _getMergedTeamEmployees();
  } else {
    rows = await DB.getEmployeesByAdmin(ADMIN_ID);
  }
  if (!PARTNER_ROOT_ID && typeof filterSouBluInternalUsers === 'function') {
    rows = filterSouBluInternalUsers(rows);
  }
  return _sortEmpByName(rows);
}

async function openFeedbackModal(empId, empName) {
  document.getElementById('fbType').value      = 'elogio';
  document.getElementById('fbTitle').value     = '';
  document.getElementById('fbContent').value   = '';
  document.getElementById('fbPrivate').checked = false;
  onFbTypeChange('elogio');

  if (empId) {
    // Chamado da tabela de funcionários — funcionário já definido
    _feedbackEmpId   = empId;
    _feedbackEmpName = empName;
    document.getElementById('fbEmpName').textContent = empName;
    document.getElementById('fbEmpSelect').style.display = 'none';
  } else {
    // Chamado do botão "Novo" da seção Feedback — mostrar select
    _feedbackEmpId   = null;
    _feedbackEmpName = '';
    document.getElementById('fbEmpName').textContent = '';
    const sel = document.getElementById('fbEmpSelect');
    sel.style.display = '';
    const emps = await _employeesForSupervisorPanel();
    sel.innerHTML = '<option value="">Selecione o funcionário...</option>' +
      emps.filter(e=>e.active).map(e=>`<option value="${e.id}" data-name="${e.name}">${e.name} — ${e.department}</option>`).join('');
    sel.onchange = () => {
      const opt = sel.options[sel.selectedIndex];
      _feedbackEmpId   = sel.value;
      _feedbackEmpName = opt.dataset.name || '';
      document.getElementById('fbEmpName').textContent = _feedbackEmpName;
    };
  }

  openModal('feedbackModal');
}

function onFbTypeChange(val) {
  const warn = document.getElementById('fbAdvert');
  if (warn) warn.style.display = val === 'advertencia' ? '' : 'none';
}

async function saveFeedback() {
  const type    = document.getElementById('fbType').value;
  const title   = document.getElementById('fbTitle').value.trim();
  const content = document.getElementById('fbContent').value.trim();
  const priv    = document.getElementById('fbPrivate').checked;
  if (!_feedbackEmpId) { showToast('Selecione um funcionário.','warning'); return; }
  if (!title || !content) { showToast('Preencha título e descrição.','warning'); return; }

  if (type === 'advertencia') {
    const emp = await DB.getUser(_feedbackEmpId);
    if (emp && typeof canSouBluManagePoints === 'function' && !canSouBluManagePoints(emp)) {
      showToast('Advertência com pontos só para equipe SOU+BLU interna.', 'warning');
      return;
    }
    const pts = typeof userPts === 'function' ? userPts(emp) : Math.max(0, Number(emp?.points ?? emp?.balance ?? 0) || 0);
    const debit = Math.min(100, pts);
    const depois = Math.max(0, pts - debit);
    const msg = `Aplicar advertência a ${_feedbackEmpName}?

Serão descontados ${debit.toLocaleString('pt-BR')} ponto(s) (máx. 100; saldo não fica negativo).
Saldo atual: ${pts.toLocaleString('pt-BR')} pts → ${depois.toLocaleString('pt-BR')} pts`;
    if (!confirm(msg)) return;
  }

  showLoading('Registrando...');
  try {
    const entry = {
      id:          _fbId(),
      employee_id: _feedbackEmpId,
      author_id:   ADMIN_ID,
      type, title, content,
      private:     priv,
      created_at:  new Date().toISOString(),
    };

    // Salvar no Supabase se disponível, senão localStorage
    if (HOSTINGER_CONFIGURED || SUPABASE_CONFIGURED) {
      try { await supaReq('POST','feedbacks', entry); } catch { _saveFbLocal(entry); }
    } else { _saveFbLocal(entry); }

    // Advertência: descontar 100 pontos
    if (type === 'advertencia') {
      const novoSaldo = await DB.deductBalance(_feedbackEmpId, 100, `Advertência: ${title}`, ADMIN_ID);
      const saldoTxt = Number.isFinite(novoSaldo)
        ? ` Saldo atual: ${novoSaldo.toLocaleString('pt-BR')} pts.`
        : '';
      showToast(`Advertência registrada — 100 pts descontados de ${_feedbackEmpName}.${saldoTxt}`, 'warning', 6000);
    } else {
      showToast(`${type.charAt(0).toUpperCase()+type.slice(1)} registrado!`,'success');
    }

    closeModal('feedbackModal');
    await renderFeedbackSection();
    if (type === 'advertencia') await renderEmployeesTable();
  } finally { hideLoading(); }
}

function _saveFbLocal(entry) {
  const list = _fbLoad(); list.unshift(entry); _fbSave(list);
}

async function renderFeedbackSection() {
  const box = document.getElementById('feedbackContent');
  if (!box) return;

  // Carregar todos os feedbacks da equipe
  let feedbacks = [];
  if (HOSTINGER_CONFIGURED || SUPABASE_CONFIGURED) {
    try { feedbacks = await supaReq('GET','feedbacks',null,'?select=*&order=created_at.desc&limit=100'); }
    catch { feedbacks = _fbLoad(); }
  } else { feedbacks = _fbLoad(); }

  // Filtrar pela equipe do supervisor
  const emps = await _employeesForSupervisorPanel();
  const empIds = new Set(emps.map(e=>e.id));
  feedbacks = feedbacks.filter(f => empIds.has(f.employee_id));
  if (typeof AttendancePenalty !== 'undefined' && AttendancePenalty.isAutoAttendanceFeedback) {
    feedbacks = feedbacks.filter((f) => !AttendancePenalty.isAutoAttendanceFeedback(f));
  }

  const empCache = {};
  emps.forEach(e => empCache[e.id] = e);

  if (!feedbacks.length) {
    box.innerHTML = '<div class="text-muted text-center" style="padding:32px;"><div style="font-size:32px;margin-bottom:8px;"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-text-muted);display:inline-block;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></div><div>Nenhum registro ainda.</div></div>';
    return;
  }

  const typeConfig = {
    elogio:      { icon:'', label:'Elogio',      color:'var(--color-success)',  bg:'rgba(0,179,65,.07)',  border:'rgba(0,179,65,.25)'  },
    feedback:    { icon:'', label:'Feedback',    color:'#2563eb',               bg:'rgba(37,99,235,.07)', border:'rgba(37,99,235,.25)'  },
    advertencia: { icon:'!', label:'Advertência', color:'var(--color-warning)',   bg:'rgba(245,158,11,.07)',border:'rgba(245,158,11,.3)'  },
    observacao:  { icon:'', label:'Observação',  color:'var(--color-text-muted)',bg:'var(--color-surface-2)',border:'var(--color-border)'},
  };

  box.innerHTML = feedbacks.map(f => {
    const emp = empCache[f.employee_id];
    const tc  = typeConfig[f.type] || typeConfig.observacao;
    return `
    <div style="border-left:4px solid ${tc.border};background:${tc.bg};border-radius:0 var(--radius-lg) var(--radius-lg) 0;padding:14px 18px;margin-bottom:14px;"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;"><div style="display:flex;align-items:center;gap:10px;">
          ${avatarHtml(emp?.name||'–','avatar-sm',emp?.photo_url||'')}
          <div><span style="font-weight:700;font-size:14px;">${emp?.name||'–'}</span><span style="font-size:11px;color:var(--color-text-muted);margin-left:6px;">${emp?.department||''}</span></div></div><div style="display:flex;align-items:center;gap:8px;"><span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;background:${tc.bg};color:${tc.color};border:1px solid ${tc.border};">${tc.icon ? tc.icon + ' ' : ''}${tc.label}</span>
          ${f.private ? '<span style="font-size:11px;color:var(--color-text-muted);">Privado</span>' : ''}
          <span style="font-size:11px;color:var(--color-text-muted);">${formatDate(f.created_at)}</span></div></div>      <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${f.title}</div><div style="font-size:13px;color:var(--color-text-secondary);line-height:1.65;">${f.content}</div>
      ${f.type === 'advertencia' ? `<div style="margin-top:8px;font-size:12px;font-weight:700;color:var(--color-warning);">−${Number(f.points_deducted || 100).toLocaleString('pt-BR')} pontos descontados</div>` : ''}
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════
   RELATÓRIO DO FUNCIONÁRIO
══════════════════════════════════════════════ */
async function renderReportSection() {
  const box = document.getElementById('reportContent');
  if (!box) return;

  const emps = await _employeesForSupervisorPanel();
  const _rs=document.getElementById('reportEmpSelect'); if(!_rs) return;
  _rs.innerHTML =
    `<option value="">Selecione um funcionário...</option>` +
    emps.filter(e=>e.active).map(e=>`<option value="${e.id}">${e.name} — ${e.department}</option>`).join('');

  box.innerHTML = '<div class="text-muted text-center" style="padding:32px;">Selecione um funcionário acima.</div>';
}

async function generateReport() {
  const empId = document.getElementById('reportEmpSelect')?.value;
  if (!empId) { showToast('Selecione um funcionário.','warning'); return; }
  showLoading('Gerando relatório...');
  try {
    const [emp, txs, orders] = await Promise.all([
      DB.getUser(empId),
      DB.getTransactions(empId),
      DB.getOrdersByEmployee(empId),
    ]);
    if (!emp) { showToast('Funcionário não encontrado.','error'); return; }

    // Feedbacks do funcionário
    let feedbacks = [];
    if (HOSTINGER_CONFIGURED || SUPABASE_CONFIGURED) {
      try { feedbacks = await supaReq('GET','feedbacks',null,`?employee_id=eq.${empId}&select=*&order=created_at.desc`); }
      catch { feedbacks = _fbLoad().filter(f=>f.employee_id===empId); }
    } else { feedbacks = _fbLoad().filter(f=>f.employee_id===empId); }
    if (typeof AttendancePenalty !== 'undefined' && AttendancePenalty.isAutoAttendanceFeedback) {
      feedbacks = feedbacks.filter((f) => !AttendancePenalty.isAutoAttendanceFeedback(f));
    }

    const pts = emp.points || emp.balance || 0;
    const earned = txs.filter(t=>t.type==='credit').reduce((s,t)=>s+t.amount,0);
    const spent  = txs.filter(t=>t.type==='debit').reduce((s,t)=>s+t.amount,0);
    const advertencias = feedbacks.filter(f=>f.type==='advertencia').length;
    const elogios      = feedbacks.filter(f=>f.type==='elogio').length;

    const typeConfig = {
      elogio:'', feedback:'', advertencia:'!', observacao:'',
    };

    const _rc=document.getElementById('reportContent'); if(!_rc) return;
    _rc.innerHTML = `
      <!-- Cabeçalho do funcionário --><div style="display:flex;align-items:center;gap:20px;padding:20px;background:linear-gradient(135deg,var(--color-primary-dark),var(--color-primary));border-radius:var(--radius-xl);color:#fff;margin-bottom:20px;">
        ${avatarHtml(emp.name,'avatar-lg',emp.photo_url||'')}
        <div><div style="font-family:var(--font-display);font-size:22px;font-weight:900;">${emp.name}</div><div style="opacity:.85;">${emp.department} · Matrícula: ${emp.matricula}</div><div style="opacity:.85;">${emp.email}</div></div><div style="margin-left:auto;text-align:right;"><div style="font-size:12px;opacity:.8;">Saldo atual</div><div style="font-family:var(--font-display);font-size:28px;font-weight:900;">${pts.toLocaleString('pt-BR')}</div><div style="font-size:12px;opacity:.8;">pontos</div></div></div><!-- Stats --><div class="stat-grid" style="margin-bottom:20px;">${[
      statCardHtml({ icon: 'trendUp', color: 'green', label: 'Total Ganho', value: `${earned.toLocaleString('pt-BR')} pts`, valueStyle: 'font-size:18px;' }),
      statCardHtml({ icon: 'trendDown', color: 'orange', label: 'Total Gasto', value: `${spent.toLocaleString('pt-BR')} pts`, valueStyle: 'font-size:18px;' }),
      statCardHtml({ icon: 'orders', color: 'yellow', label: 'Pedidos', value: orders.length }),
      statCardHtml({ icon: 'feedback', color: advertencias > 0 ? 'orange' : 'blue', label: 'Feedbacks', value: `${feedbacks.length} <small style="font-size:12px;">(${elogios} elogios / ${advertencias} advert.)</small>` }),
    ].join('')}</div><!-- Histórico de feedbacks --><div class="card card-padded" style="margin-bottom:16px;"><h3 style="font-family:var(--font-display);font-weight:800;margin-bottom:16px;">Histórico de Feedbacks</h3>
        ${feedbacks.length ? feedbacks.map(f=>`
          <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--color-border);"><span style="font-size:18px;flex-shrink:0;">${typeConfig[f.type]||''}</span><div style="flex:1;"><div style="font-weight:700;font-size:13px;">${f.title}</div><div style="font-size:12px;color:var(--color-text-muted);">${f.content}</div></div><span style="font-size:11px;color:var(--color-text-muted);white-space:nowrap;">${formatDate(f.created_at)}</span></div>`).join('')
          : '<div class="text-muted text-center" style="padding:12px;">Nenhum feedback registrado.</div>'}
      </div><!-- Últimas transações --><div class="card card-padded"><h3 style="font-family:var(--font-display);font-weight:800;margin-bottom:16px;">Últimas Movimentações</h3>
        ${txs.slice(0,10).map(t=>{
          const isCr = t.type==='credit';
          return `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--color-border);"><div style="width:32px;height:32px;border-radius:50%;background:${isCr?'rgba(0,179,65,.12)':'rgba(220,38,38,.1)'};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;">${isCr?'↑':'↓'}</div><div style="flex:1;"><div style="font-size:13px;font-weight:600;">${t.reason}</div><div style="font-size:11px;color:var(--color-text-muted);">${formatDate(t.created_at)}</div></div><span style="font-weight:800;color:${isCr?'var(--color-success)':'var(--color-danger)'};">${isCr?'+':'−'}${(t.amount||0).toLocaleString('pt-BR')} pts</span></div>`;
        }).join('') || '<div class="text-muted text-center" style="padding:12px;">Sem movimentações.</div>'}
      </div>`;
  } finally { hideLoading(); }
}

/* Helper: pedidos por funcionário */
if (!DB.getOrdersByEmployee) {
  DB.getOrdersByEmployee = async function(empId) {
    const all = await this.getOrders();
    return all.filter(o=>o.employee_id===empId);
  };
}

async function openMinhaConta() {
  if (typeof navigateTo === 'function') navigateTo('secMyProfile');
  showLoading('Carregando perfil…');
  try { await renderMyProfile(); } finally { hideLoading(); }
}

let _clientsTableInflight = null;
let _clientsListCache = null;
let _clientsListCacheTs = 0;
const _CLIENTS_CACHE_MS = 20000;

async function _supervisorNameMap() {
  let users = Array.isArray(_allUsersCache) && _allUsersCache.length ? _allUsersCache : null;
  if (!users) {
    users = await DB.getAllUsers().catch(() => []);
    if (users.length) _allUsersCache = users;
  }
  const map = new Map();
  (users || []).forEach(u => { if (u?.id) map.set(String(u.id), u.name || '—'); });
  return map;
}

async function _partnerExcludeSupervisorIds() {
  if (!window.PartnerOps?._getIndex) return new Set();
  const index = await PartnerOps._getIndex();
  const set = new Set();
  index.forEach(e => { (e.allIds || []).forEach(id => set.add(String(id))); });
  return set;
}

async function renderClientsTable(force = false) {
  if (_clientsTableInflight) return _clientsTableInflight;
  _clientsTableInflight = _renderClientsTableBody(force);
  try {
    return await _clientsTableInflight;
  } finally {
    _clientsTableInflight = null;
  }
}

async function _renderClientsTableBody(force = false) {
  const tbody = document.getElementById('clientsTbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--color-text-muted);">Carregando clientes…</td></tr>';

  const now = Date.now();
  if (!force && _clientsListCache && (now - _clientsListCacheTs) < _CLIENTS_CACHE_MS) {
    _paintClientsTable(tbody, _clientsListCache.rows, _clientsListCache.nameMap);
    return;
  }

  try {
    let teamIds = null;
    const clientsProm = (async () => {
      if (PARTNER_ROOT_ID) {
        return DB.getClients({ partnerRootId: PARTNER_ROOT_ID, pageSize: 500 }) || [];
      }
      // Supervisor comercial: só a equipe. Sup. Backoffice / operacional vê a base
      // (como master) — senão aparece 1 cliente (só o que tem supervisorId = ele).
      if (IS_SUPERVISOR && !IS_SUP_BACKOFFICE) {
        const supervisorIds = await _resolveMergedSupervisorAdminIds(ADMIN_ID, Auth.getSession()?.name).catch(() => [ADMIN_ID]);
        teamIds = [...new Set(supervisorIds.filter(Boolean))];
        return DB.getClients({ supervisorIds: teamIds, pageSize: 800 }) || [];
      }
      return DB.getClients({ pageSize: 800 }) || [];
    })();

    const excludeProm = PARTNER_ROOT_ID
      ? Promise.resolve(null)
      : ((window.CAN_PARTNER_OPS_HUB && window.PartnerOps)
        ? _partnerExcludeSupervisorIds()
        : Promise.resolve(null));

    const [clientsRaw, nameMap, excludeIds] = await Promise.all([
      clientsProm,
      _supervisorNameMap(),
      excludeProm,
    ]);

    let clients = clientsRaw || [];
    if (excludeIds?.size) {
      clients = clients.filter(c => !excludeIds.has(String(c.supervisorId || c.supervisor_id || '')));
    }

    _clientsListCache = { rows: clients, nameMap };
    _clientsListCacheTs = Date.now();
    _paintClientsTable(tbody, clients, nameMap);
  } catch (err) {
    console.warn('[renderClientsTable]', err);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--color-danger);">Erro ao carregar clientes. Tente F5 ou verifique a conexão.</td></tr>';
  }
}

function _repaintClientsTableFromCache() {
  const tbody = document.getElementById('clientsTbody');
  if (!tbody || !_clientsListCache) return;
  _paintClientsTable(tbody, _clientsListCache.rows, _clientsListCache.nameMap);
}
window._repaintClientsTableFromCache = _repaintClientsTableFromCache;

function _paintClientsTable(tbody, clients, nameMap) {
  const q = (window.Clients && typeof Clients._getSearchQuery === 'function')
    ? Clients._getSearchQuery('clientSearch')
    : (document.getElementById('clientSearch')?.value || '').trim();
  let rows = clients;
  if (q && window.Clients && typeof Clients.matchesClientSearch === 'function') {
    rows = clients.filter(client => {
      const sid = String(client.supervisorId || client.supervisor_id || '');
      const supervisorName = nameMap.get(sid) || '';
      return Clients.matchesClientSearch(client, q, { supervisorName });
    });
  }

  if (!rows.length) {
    const msg = clients.length
      ? 'Nenhum cliente encontrado para a busca'
      : 'Nenhum cliente cadastrado';
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;">${msg}</td></tr>`;
    return;
  }
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  tbody.innerHTML = rows.map(client => {
    const sid = String(client.supervisorId || client.supervisor_id || '');
    const supervisorName = nameMap.get(sid) || '—';
    const cpf = esc(client.cpf);
    const cpfKey = String(client.cpf || client.id || '').replace(/\D/g, '');
    const actions = (window.Clients && typeof Clients.actionsRowHtml === 'function')
      ? Clients.actionsRowHtml(cpfKey)
      : '';
    return `<tr><td><strong>${esc(supervisorName)}</strong></td><td>${esc(client.name) || '-'}</td><td>${cpf || '-'}</td><td>${esc(client.phone1) || '-'}</td><td>${esc(client.email) || '-'}</td><td>${esc(client.rg) || '-'}</td><td class="td-client-actions">${actions}</td></tr>`;
  }).join('');
}

function invalidateClientsListCache() {
  _clientsListCache = null;
  _clientsListCacheTs = 0;
}
window.invalidateClientsListCache = invalidateClientsListCache;

async function deleteClientAdmin(cpf) {
  if (window.Clients && typeof Clients.deleteClient === 'function') {
    return Clients.deleteClient(cpf);
  }
  showToast('Módulo de clientes não carregado.', 'error');
}
window.deleteClientAdmin = deleteClientAdmin;

async function editClientAdmin(cpf) {
  const digits = String(cpf || '').replace(/\D/g, '');
  let client = typeof DB.getClientByCpf === 'function' ? await DB.getClientByCpf(digits) : null;
  if (!client) client = await DB.get('clients', digits || cpf);
  if (!client) { showToast('Cliente não encontrado.', 'error'); return; }

  const fields = ['clientCpf','clientName','clientPhone1','clientPhone2','clientRg','clientCivil','clientAddress','clientEmail','clientMother','clientFather'];
  const values = {
    clientCpf: client.cpf, clientName: client.name, clientPhone1: client.phone1||'',
    clientPhone2: client.phone2||'', clientRg: client.rg||'', clientCivil: client.civilState||'',
    clientAddress: client.address||'', clientEmail: client.email||'',
    clientMother: client.motherName||'', clientFather: client.fatherName||''
  };
  fields.forEach(f => { const el = document.getElementById(f); if (el) el.value = values[f] || ''; });

  // Guarda CPF original para update
  const modal = document.getElementById('clientModal');
  if (modal) {
    modal.dataset.editCpf = digits;
    delete modal.dataset.cpfDupBlocked;
  }
  if (window.Clients && typeof Clients._showClientModal === 'function') {
    Clients._showClientModal();
  } else if (typeof openModal === 'function') {
    openModal('clientModal');
  } else if (modal) {
    modal.classList.add('open');
    modal.style.display = 'flex';
    modal.style.opacity = '1';
    modal.style.visibility = 'visible';
    modal.style.pointerEvents = 'auto';
  }
  if (window.Clients) {
    if (typeof Clients._bindCpfLookup === 'function') Clients._bindCpfLookup();
    if (typeof Clients._setCpfStatus === 'function') {
      Clients._setCpfStatus('Dados do cliente carregados. Altere o CPF para buscar na FonteData.', 'muted');
    }
  }
}

async function viewClientDetails(cpf) {
  if (window.Clients && typeof Clients.viewDetails === 'function') {
    return Clients.viewDetails(cpf);
  }
  const digits = String(cpf || '').replace(/\D/g, '');
  let client = typeof DB.getClientByCpf === 'function' ? await DB.getClientByCpf(digits) : null;
  if (!client) client = await DB.get('clients', digits || cpf);
  if (!client) { showToast('Cliente não encontrado.','error'); return; }
  showToast('Atualize js/clients.js (modal de detalhes do cliente).', 'warning');
}

function openClientModalAdmin() {
  // Abre o modal de novo cliente (igual ao dos vendedores)
  if (window.Clients && window.Clients.openModal) {
    Clients.openModal();
  } else {
    alert('Erro: Modal de cliente não carregado');
  }
}

function openProposalModalAdmin() {
  // Abre o modal de nova proposta (igual ao dos vendedores)
  if (window.Proposals && window.Proposals.openModal) {
    Proposals.openModal();
  } else {
    alert('Erro: Modal de proposta não carregado');
  }
}

async function masterGrantTestRouletteCoins(amount = 10) {
  if (!IS_MASTER && !IS_FUNDA) {
    showToast('Apenas Master pode creditar moedas em massa.', 'error');
    return;
  }
  if (typeof DB?.grantRouletteCoinsToAll !== 'function') {
    showToast('Atualize js/db.js no servidor (função grantRouletteCoinsToAll).', 'error');
    return;
  }
  const n = Math.max(1, Math.round(Number(amount) || 10));
  const ok = confirm(`Creditar ${n} moedas da roleta para TODOS os usuários ativos?\n\nIsso é para teste. Cada pessoa poderá girar até ${n} vezes (1 moeda por giro).`);
  if (!ok) return;
  showLoading(`Creditando ${n} moedas para todos...`);
  try {
    const session = Auth.getSession();
    const r = await DB.grantRouletteCoinsToAll(n, {
      reason: `Teste Master — ${n} moedas roleta`,
      by_user: session?.email || session?.name || 'master',
      criteria_key: 'teste_massa',
    });
    showToast(`Concluído: ${r.granted} usuários com +${n} moedas${r.failed ? ` (${r.failed} falhas)` : ''}.`, 'success', 6000);
    if (typeof invalidateSouBluCaches === 'function') invalidateSouBluCaches();
    if (window.RouletteUI) await RouletteUI.renderRoulettePage().catch(() => {});
  } catch (e) {
    showToast(e?.message || 'Erro ao creditar moedas.', 'error');
  } finally {
    hideLoading();
  }
}
window.masterGrantTestRouletteCoins = masterGrantTestRouletteCoins;
