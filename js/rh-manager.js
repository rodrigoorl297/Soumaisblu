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

function _normRhDept(v) {
  return String(v || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function _normRhRazao(s) {
  return String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

/** SAK SERVIÇOS CADASTRAIS — única rede parceira permitida na lista RH Funcionários. */
function _isSakRazao(razao) {
  const n = _normRhRazao(razao);
  if (!n) return false;
  if (n === 'SAK SERVICOS CADASTRAIS LTDA') return true;
  return n.includes('SAK') && n.includes('CADASTRAIS');
}

function _isSakEmail(email) {
  const e = String(email || '').toLowerCase();
  return e.includes('@sakpromotora.') || e.includes('@sakservicos.') || e.includes('@sak.');
}

function _rhDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

/**
 * Cache: CNPJs/roots SAK vs demais parceiros (só filtro de UI — não apaga dados).
 * Montado em reloadAllData a partir de partners + rh_companies + users.
 */
window._RH_ORG_FILTER = window._RH_ORG_FILTER || {
  sakRootIds: new Set(),
  sakNetworkIds: new Set(),
  sakCnpjs: new Set(),
  otherRootIds: new Set(),
  otherNetworkIds: new Set(),
  otherCnpjs: new Set(),
};

function _rebuildRhOrgFilter(partners, companies, users) {
  const sakRootIds = new Set();
  const sakCnpjs = new Set();
  const otherRootIds = new Set();
  const otherCnpjs = new Set();

  (partners || []).forEach((p) => {
    const cnpj = _rhDigits(p.cnpj);
    const root = p.user_id ? String(p.user_id) : '';
    const sak = _isSakRazao(p.razao_social || p.razaoSocial || '');
    if (sak) {
      if (root) sakRootIds.add(root);
      if (cnpj.length === 14) sakCnpjs.add(cnpj);
    } else {
      if (root) otherRootIds.add(root);
      if (cnpj.length === 14) otherCnpjs.add(cnpj);
    }
  });

  (companies || []).forEach((c) => {
    const cnpj = _rhDigits(c.cnpj);
    if (cnpj.length !== 14) return;
    if (_isSakRazao(c.razao_social || '')) {
      sakCnpjs.add(cnpj);
      otherCnpjs.delete(cnpj);
    }
  });

  const sakNetworkIds = new Set(sakRootIds);
  const otherNetworkIds = new Set(otherRootIds);
  const allUsers = users || window._allSystemUsersCache || [];

  if (typeof DB !== 'undefined' && typeof DB.expandPartnerOrgIds === 'function') {
    sakRootIds.forEach((rid) => {
      DB.expandPartnerOrgIds(rid, allUsers).forEach((id) => sakNetworkIds.add(String(id)));
    });
    otherRootIds.forEach((rid) => {
      DB.expandPartnerOrgIds(rid, allUsers).forEach((id) => otherNetworkIds.add(String(id)));
    });
  } else {
    allUsers.forEach((u) => {
      if (!u?.id) return;
      const aid = u.admin_id ? String(u.admin_id) : '';
      if (aid && sakRootIds.has(aid)) sakNetworkIds.add(String(u.id));
      if (aid && otherRootIds.has(aid)) otherNetworkIds.add(String(u.id));
    });
  }

  // SAK nunca fica no conjunto "outros"
  sakNetworkIds.forEach((id) => otherNetworkIds.delete(id));
  sakCnpjs.forEach((c) => otherCnpjs.delete(c));

  window._RH_ORG_FILTER = {
    sakRootIds, sakNetworkIds, sakCnpjs,
    otherRootIds, otherNetworkIds, otherCnpjs,
  };
  return window._RH_ORG_FILTER;
}

function _rhLinkedUser(emp) {
  const uid = emp?.user_id ? String(emp.user_id) : '';
  if (!uid) return null;
  return (window._allSystemUsersCache || []).find((x) => String(x.id) === uid) || null;
}

function _isSakRhEmployee(emp) {
  if (!emp) return false;
  const f = window._RH_ORG_FILTER || {};
  const cnpj = _rhDigits(emp.cnpj_registro || emp.cnpj || '');
  if (cnpj && f.sakCnpjs?.has(cnpj)) return true;
  if (_isSakRazao(emp.empresa || emp.razao_social || emp.company_name || '')) return true;
  if (_isSakEmail(emp.email || emp.email_pessoal || '')) return true;
  const dept = _normRhDept(emp.departamento);
  if (dept.includes('sak')) return true;

  const uid = emp.user_id ? String(emp.user_id) : '';
  if (uid && f.sakNetworkIds?.has(uid)) return true;

  const u = _rhLinkedUser(emp);
  if (u) {
    if (_isSakEmail(u.email)) return true;
    if (f.sakNetworkIds?.has(String(u.id))) return true;
    const aid = u.admin_id ? String(u.admin_id) : '';
    if (aid && f.sakRootIds?.has(aid)) return true;
  }

  for (const k of ['supervisor_id', 'admin_id', 'responsavel_dpto_id', 'diretor_dpto_id']) {
    const id = emp[k] ? String(emp[k]) : '';
    if (id && (f.sakRootIds?.has(id) || f.sakNetworkIds?.has(id))) return true;
  }
  return false;
}

function _isOtherPartnerRhEmployee(emp) {
  if (!emp) return false;
  if (_isSakRhEmployee(emp)) return false;
  const f = window._RH_ORG_FILTER || {};
  const role = String(emp.system_role || emp.role || '').trim().toLowerCase();
  if (role === 'parceiro') return true;
  const dept = _normRhDept(emp.departamento);
  if (dept === 'parceiro') return true;

  const cnpj = _rhDigits(emp.cnpj_registro || emp.cnpj || '');
  if (cnpj && f.otherCnpjs?.has(cnpj)) return true;

  const uid = emp.user_id ? String(emp.user_id) : '';
  if (uid && f.otherNetworkIds?.has(uid)) return true;

  const u = _rhLinkedUser(emp);
  if (u) {
    if (f.otherNetworkIds?.has(String(u.id))) return true;
    const aid = u.admin_id ? String(u.admin_id) : '';
    if (aid && f.otherRootIds?.has(aid)) return true;
    if (typeof isUserInPartnerNetworkSync === 'function' && isUserInPartnerNetworkSync(u)) {
      return true;
    }
  }
  if (uid && window._PARTNER_NETWORK_USER_IDS?.has(uid) && !f.sakNetworkIds?.has(uid)) return true;

  for (const k of ['supervisor_id', 'admin_id', 'responsavel_dpto_id', 'diretor_dpto_id']) {
    const id = emp[k] ? String(emp[k]) : '';
    if (id && (f.otherRootIds?.has(id) || f.otherNetworkIds?.has(id))) return true;
  }
  return false;
}

/**
 * Lista RH "Funcionários": só equipe SOU+BLU interna + povo da SAK.
 * Parceiros e colaboradores de outras redes ficam só em Cadastrar Parceiro.
 */
function _isRhCompanyEmployee(emp) {
  if (!emp) return false;
  if (_isSakRhEmployee(emp)) return true;
  if (_isOtherPartnerRhEmployee(emp)) return false;
  return true;
}

function _rhCompanyEmployees(rows) {
  return (rows || []).filter(_isRhCompanyEmployee);
}

function _rhAllowedCompanies(rows) {
  const f = window._RH_ORG_FILTER || {};
  return (rows || []).filter((c) => {
    const cnpj = _rhDigits(c.cnpj);
    if (_isSakRazao(c.razao_social || '')) return true;
    if (cnpj && f.sakCnpjs?.has(cnpj)) return true;
    if (cnpj && f.otherCnpjs?.has(cnpj)) return false;
    return true;
  });
}

window._isSakRazao = _isSakRazao;
window._isSakRhEmployee = _isSakRhEmployee;
window._isRhCompanyEmployee = _isRhCompanyEmployee;
window._rhCompanyEmployees = _rhCompanyEmployees;
window._rhAllowedCompanies = _rhAllowedCompanies;
window._rebuildRhOrgFilter = _rebuildRhOrgFilter;

let _editingCvId = null;
let _editingJobId = null;

const _RH_DOC_BUCKET = 'rh-docs';

const _RH_EMP_FILE_FIELDS = [
  ['emp_anexo_entrevista_rh', 'entrevista_rh'],
  ['emp_anexo_ficha_rh', 'ficha_rh'],
  ['emp_anexo_rg', 'rg'],
  ['emp_anexo_exame_admissional', 'exame_admissional'],
  ['emp_anexo_contrato', 'contrato'],
  ['emp_anexo_aditivo_1', 'aditivo_1'],
  ['emp_anexo_aditivo_2', 'aditivo_2'],
  ['emp_anexo_aditivo_3', 'aditivo_3'],
  ['emp_anexo_aditivo_4', 'aditivo_4'],
];

function _parseRhAttachments(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) || {}; } catch { return {}; }
  }
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
}

function _rhAttachmentOpenUrl(meta) {
  if (!meta) return '';
  const raw = String(meta.url || meta.caminho || '').trim();
  if (!raw) return '';
  if (/^(data:|blob:|https?:\/\/)/i.test(raw)) return raw.replace(/ /g, '%20');
  if (raw.startsWith('/api/file.php')) {
    const base = String((window.SOUBLU_CONFIG && window.SOUBLU_CONFIG.SITE_URL) || window.location.origin || '').replace(/\/+$/, '');
    return base + raw;
  }
  if (raw.startsWith('/uploads/')) {
    const base = String((window.SOUBLU_CONFIG && window.SOUBLU_CONFIG.SITE_URL) || window.location.origin || '').replace(/\/+$/, '');
    return base + raw;
  }
  const base = String((window.SOUBLU_CONFIG && window.SOUBLU_CONFIG.SITE_URL) || window.location.origin || '').replace(/\/+$/, '');
  return `${base}/api/file.php?path=${encodeURIComponent(raw.replace(/^\/+/, ''))}`;
}

async function _uploadRhDoc(file, subPath) {
  if (!file || !file.size) return null;
  const folder = String(subPath || 'geral').replace(/[^a-zA-Z0-9_/-]/g, '_').replace(/^\/+|\/+$/g, '');
  if (typeof uploadImage !== 'function') {
    if (typeof fileToBase64 === 'function') {
      return { url: await fileToBase64(file), nome: file.name || 'documento', caminho: '', uploaded_at: new Date().toISOString() };
    }
    return null;
  }
  const url = await uploadImage(file, _RH_DOC_BUCKET, folder);
  let caminho = '';
  const s = String(url || '');
  const m1 = s.match(/[?&]path=([^&]+)/i);
  if (m1) caminho = decodeURIComponent(m1[1]);
  else {
    const m2 = s.match(/\/uploads\/([^?#]+)/i);
    if (m2) caminho = decodeURIComponent(m2[1]);
    else if (!/^data:/i.test(s) && !/^https?:\/\//i.test(s) && s) caminho = s.replace(/^\/+/, '');
  }
  return {
    url: s,
    caminho,
    nome: file.name || 'documento',
    uploaded_at: new Date().toISOString(),
  };
}

function _renderRhFileSavedHint(inputId, meta, label) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const hostId = `${inputId}_saved_hint`;
  let host = document.getElementById(hostId);
  if (!host) {
    host = document.createElement('div');
    host.id = hostId;
    host.style.cssText = 'margin-top:8px;font-size:12px;line-height:1.5;';
    input.insertAdjacentElement('afterend', host);
  }
  if (!meta || !(meta.url || meta.caminho)) {
    host.innerHTML = '<span class="text-muted">Nenhum arquivo salvo.</span>';
    return;
  }
  const openUrl = _rhAttachmentOpenUrl(meta);
  const nome = _esc(meta.nome || label || 'Documento');
  host.innerHTML = `<span style="color:var(--color-success);font-weight:600;">✓ ${nome}</span> <a href="${_esc(openUrl)}" target="_blank" rel="noopener noreferrer" style="margin-left:8px;">Abrir documento</a>`;
}

function _clearRhFileSavedHints(ids) {
  (ids || []).forEach((inputId) => _renderRhFileSavedHint(inputId, null));
}

async function _collectRhFileField(inputId, existingMeta, subPath) {
  const input = document.getElementById(inputId);
  const file = input?.files?.[0];
  if (!file || !file.size) return existingMeta || null;
  return await _uploadRhDoc(file, subPath);
}

async function _collectRhAttachments(fields, existingAtt, subPath) {
  const out = { ..._parseRhAttachments(existingAtt) };
  for (const [inputId, key] of fields) {
    const up = await _collectRhFileField(inputId, out[key] || null, `${subPath}/${key}`);
    if (up) out[key] = up;
  }
  return out;
}

function _showRhAttachmentHints(fields, attachments) {
  const att = _parseRhAttachments(attachments);
  fields.forEach(([inputId, key]) => _renderRhFileSavedHint(inputId, att[key], key));
}

const _RH_ALLOWED_ROLES = [
  'master', 'fundador', 'desenvolvedor', 'rh', 'gerente',
  'juridico', 'gerencia', 'financeiro', 'diretoria',
  'supervisor', 'sup_backoffice',
];

/** Perfis que nunca devem ser rebaixados pelo sync RH → users. */
const _RH_PROTECTED_USER_ROLES = ['master', 'fundador'];

/** Perfis cujo admin_id não deve ser sobrescrito pelo cadastro RH. */
const _RH_PRIVILEGED_USER_ROLES = ['master', 'fundador', 'desenvolvedor'];

const _RH_TEAM_MEMBER_ROLES = ['employee', 'vendedor', 'backoffice'];
const _RH_TEAM_LEADER_ROLES = ['supervisor', 'sup_backoffice'];
const _RH_STAFF_ROLES = ['rh', 'financeiro', 'financial', 'portaria', 'juridico', 'operacional'];

const _RH_TAB_TITLES = {
  sonhos: 'Painel dos Sonhos',
  conta: 'Minha Conta',
  kanban: 'Esteira Seletiva',
  empresa: 'Empresas Parceiras',
  curriculo: 'Currículos / Candidatos',
  cargo: 'Cargos',
  funcionario: 'Cadastrar Funcionário',
  feedback: 'Feedbacks',
  vagas: 'Vagas',
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
  portaria: 'Portaria',
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
  if (!row) {
    _set(`${prefix}_data_nascimento`, '');
    _set(`${prefix}_pis`, '');
    _set(`${prefix}_situacao_rf`, '');
    _renderRhFonteInfo(prefix, null);
    _lastRhFonteBundle[prefix] = null;
    return;
  }
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

/** Aceita "1500", "1500.50", "1.500,50" ou "1500,50". */
function _parseMoney(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
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

  function _rhMigrationIssueLines(core, cbo) {
    const lines = [];
    const pushStep = (label, step) => {
      if (!step || step.ok !== false) return;
      const err = step.error || step.data?.error || (step.http ? `HTTP ${step.http}` : 'falhou');
      lines.push(`<li><strong>${label}</strong>: ${_esc(err)}${step.path ? ` <span class="text-muted">(${_esc(step.path)})</span>` : ''}</li>`);
    };
    if (core?.ok === false && core.steps) {
      pushStep('RH Core', core.steps.core);
      pushStep('RH Hierarquia', core.steps.hierarchy);
      pushStep('RH Justificativa (horas)', core.steps.justifHours);
      if (core.error) lines.push(`<li>${_esc(core.error)}</li>`);
    } else if (core?.ok === false) {
      lines.push(`<li>${_esc(core.error || 'Migração RH core falhou')}</li>`);
    }
    if (cbo?.ok === false) {
      const err = cbo.error || cbo.data?.error || (cbo.http ? `HTTP ${cbo.http}` : 'falhou');
      lines.push(`<li><strong>RH CBO</strong>: ${_esc(err)} <span class="text-muted">(migrate-rh-cbo.php)</span></li>`);
    }
    return lines;
  }

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
        const data = await res.json().catch(() => ({}));
        cbo = {
          ok: res.ok && data.ok !== false,
          http: res.status,
          path: 'migrate-rh-cbo.php',
          error: data.error || (!res.ok ? `HTTP ${res.status}` : null),
          data,
        };
        if (cbo.ok) sessionStorage.setItem('soublu_rh_cbo_migrated', '1');
      }
    }

    const issues = _rhMigrationIssueLines(core, cbo);
    // #region agent log
    fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',hypothesisId:'H1-H5',location:'rh-manager.js:_ensureRhDatabaseReady',message:'rh db ready',data:{coreOk:core?.ok,cboOk:cbo?.ok,issues:issues.length,steps:core?.steps||null,cbo},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    console.warn('[RH] migração', { core, cbo, issues: issues.length });

    if (banner) {
      if (issues.length) {
        banner.style.display = '';
        banner.innerHTML = `<div class="alert alert-warning" style="margin:0;">
          <strong>Aviso: migração RH online incompleta.</strong>
          <ul style="margin:8px 0 0 18px;padding:0;">${issues.join('')}</ul>
          <div style="margin-top:8px;font-size:12px;">Se persistir após Ctrl+F5, avise o suporte com os itens acima.</div>
        </div>`;
      } else {
        banner.style.display = 'none';
        banner.innerHTML = '';
      }
    }
    return { ok: issues.length === 0, core, cbo };
  } catch (e) {
    console.warn('[RH] _ensureRhDatabaseReady:', e);
    // #region agent log
    fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',hypothesisId:'H4',location:'rh-manager.js:_ensureRhDatabaseReady',message:'rh db ready exception',data:{error:e?.message||String(e)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (banner) {
      banner.style.display = '';
      banner.innerHTML = `<div class="alert alert-warning" style="margin:0;">Não foi possível validar tabelas RH: ${_esc(e.message || e)}</div>`;
    }
    return { ok: false, error: e.message };
  }
}

function _rhDefaultTab(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'supervisor' || r === 'sup_backoffice') return 'vagas';
  const elig = typeof PainelSonhos !== 'undefined' && (
    typeof PainelSonhos.eligibleOnHub === 'function'
      ? PainelSonhos.eligibleOnHub(role)
      : PainelSonhos.eligible(role)
  );
  const tab = elig ? 'sonhos' : 'kanban';
  return tab;
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
  el.textContent = `${_rhGreeting()}, ${name}! Lista só da equipe SOU+BLU e SAK (parceiros ficam no Financeiro).`;
}

function _applyRhChrome(role) {
  const r = String(role || '').toLowerCase();
  const isJuridico = r === 'juridico';
  const isSupervisorOnly = r === 'supervisor' || r === 'sup_backoffice';
  const showSonhos = typeof PainelSonhos !== 'undefined' && (
    typeof PainelSonhos.eligibleOnHub === 'function'
      ? PainelSonhos.eligibleOnHub(r)
      : PainelSonhos.eligible(r)
  );

  document.querySelectorAll('.juridico-section-label, .juridico-nav').forEach((el) => {
    el.style.display = isJuridico ? '' : 'none';
  });
  document.querySelectorAll('.rh-mgmt-label, .rh-mgmt-only').forEach((el) => {
    el.style.display = isJuridico ? 'none' : '';
  });
  document.querySelectorAll('.juridico-only').forEach((el) => {
    el.style.display = isJuridico ? '' : 'none';
  });

  /* Supervisor: acesso focado em Vagas (+ início/conta), sem demais abas de gestão RH. */
  if (isSupervisorOnly) {
    document.querySelectorAll('.rh-mgmt-only').forEach((el) => {
      const tab = el.getAttribute('data-tab');
      el.style.display = tab === 'vagas' ? '' : 'none';
    });
    document.querySelectorAll('.rh-mgmt-label').forEach((el) => {
      el.style.display = '';
    });
  }

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

function _ensureEmpRoleOption(role) {
  const sel = document.getElementById('emp_role');
  if (!sel) return;
  const v = String(role || '').trim().toLowerCase();
  if (!v) return;
  if ([...sel.options].some((o) => o.value === v)) return;
  const opt = document.createElement('option');
  opt.value = v;
  opt.textContent = _RH_ROLE_LABELS[v] || v;
  sel.appendChild(opt);
}

function _setEmpRole(role) {
  const v = String(role || '').trim().toLowerCase() || 'vendedor';
  _ensureEmpRoleOption(v);
  _set('emp_role', v);
  _refreshEmpHierarchyUI(v);
}

function _resolveRhLinkedUser(users, emp, email) {
  const cpf = _digits(emp.cpf);
  if (emp.user_id) {
    const byId = users.find((x) => String(x.id) === String(emp.user_id));
    if (byId) return byId;
  }
  if (cpf) {
    const byCpf = users.find((x) => x.cpf && _digits(x.cpf) === cpf);
    if (byCpf) return byCpf;
  }
  if (email) {
    const byEmail = users.find((x) => x.email && String(x.email).toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  return null;
}

function _rhLinkedUserIdFromMeta(emp) {
  const meta = emp?.fontedata_meta;
  if (typeof meta === 'string' && meta) {
    try {
      const parsed = JSON.parse(meta);
      return parsed?.linked_user_id || null;
    } catch { /* ignore */ }
  }
  if (meta && typeof meta === 'object' && meta.linked_user_id) {
    return meta.linked_user_id;
  }
  return null;
}

async function _isRealSystemUserId(userId) {
  if (!userId || typeof DB.getUser !== 'function') return false;
  const u = await DB.getUser(userId, true).catch(() => null);
  return !!(u && u.id);
}

async function _resolveRhEmployeeUserId(emp, email) {
  if (emp?.user_id) {
    if (await _isRealSystemUserId(emp.user_id)) return emp.user_id;
  }
  const metaUid = _rhLinkedUserIdFromMeta(emp);
  if (metaUid && await _isRealSystemUserId(metaUid)) return metaUid;

  const users = await DB.getAllUsers().catch(() => []);
  const u = _resolveRhLinkedUser(users, emp, email || emp?.email || emp?.email_pessoal || '');
  if (u?.id) return u.id;

  const cpf = _digits(emp?.cpf);
  if (cpf && typeof DB.getUserByCpf === 'function') {
    const byCpf = await DB.getUserByCpf(cpf).catch(() => null);
    if (byCpf?.id && (byCpf.email || byCpf.balance !== undefined || byCpf.admin_id !== undefined)) {
      if (await _isRealSystemUserId(byCpf.id)) return byCpf.id;
    }
  }
  return null;
}

function _normNameForMatch(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

async function _resolveClubeUserId(emp, email) {
  const resolved = await _resolveRhEmployeeUserId(emp, email || emp?.email || emp?.email_pessoal || '');
  if (resolved) return resolved;
  /* Sem vínculo por CPF/e-mail: tenta casar pelo nome nos usuários de login.
     O Clube busca o limite pelo id de LOGIN — gravar no id do cadastro RH deixa
     o limite invisível para o colaborador. */
  const nome = _normNameForMatch(emp?.nome);
  if (nome) {
    const users = await DB.getAllUsers().catch(() => []);
    const byName = (users || []).find((u) => _normNameForMatch(u?.name) === nome);
    // #region agent log
    fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'clube-limite',hypothesisId:'L-H2',location:'rh-manager.js:_resolveClubeUserId',message:'match por nome',data:{empId:emp?.id||null,byName:byName?.id||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (byName?.id) return byName.id;
  }
  // user_id/id do RH só vale se for usuário de login real (senão o Clube nunca acha o limite).
  const candidate = String(emp?.user_id || emp?.id || '').trim();
  if (candidate && await _isRealSystemUserId(candidate)) return candidate;
  return null;
}

/** IDs possíveis ligados ao limite do Clube (login, RH, meta). */
function _clubeLimiteCandidateIds(emp, preferredId) {
  const ids = [];
  const add = (v) => {
    const s = String(v || '').trim();
    if (s && !ids.includes(s)) ids.push(s);
  };
  add(preferredId);
  add(emp?.user_id);
  add(emp?.id);
  add(_rhLinkedUserIdFromMeta(emp));
  return ids;
}

async function _fetchClubeLimiteRow(employeeId) {
  if (!employeeId || typeof supaReq !== 'function') return null;
  const q = `?employee_id=eq.${encodeURIComponent(employeeId)}&order=updated_at.desc&limit=1`;
  const list = await supaReq('GET', 'beneficios_limites', null, q);
  return Array.isArray(list) && list[0] ? list[0] : null;
}

async function _loadEmpClubeLimite(userId, emp) {
  _set('emp_limite_clube', '0');
  _set('emp_clube_limite_id', '');
  if (typeof supaReq !== 'function') return null;
  const candidates = _clubeLimiteCandidateIds(emp, userId);
  if (!candidates.length) return null;
  try {
    let row = null;
    let matchedUid = '';
    for (const uid of candidates) {
      row = await _fetchClubeLimiteRow(uid);
      if (row) {
        matchedUid = uid;
        break;
      }
    }
    if (!row && emp?.nome) {
      const nome = String(emp.nome).trim();
      const byName = await supaReq(
        'GET',
        'beneficios_limites',
        null,
        `?employee_name=ilike.${encodeURIComponent(nome)}&order=updated_at.desc&limit=10`
      );
      const rows = Array.isArray(byName) ? byName : [];
      /* ilike na compat local é substring ("%valor%") — exige igualdade exata
         (normalizada) para não carregar o limite de outra pessoa (ex.: ANA × MARIANA). */
      const alvo = _normNameForMatch(nome);
      row = rows.find((r) => _normNameForMatch(r.employee_name) === alvo) || null;
      if (row) matchedUid = row.employee_id || '';
    }
    // #region agent log
    fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'clube-limite-load',hypothesisId:'H-load',location:'rh-manager.js:_loadEmpClubeLimite',message:'load clube limite',data:{candidates,matchedUid:matchedUid||null,found:!!row,aprovado:row?row.limite_aprovado:null,limitId:row?.id||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!row) return null;
    _set('emp_clube_limite_id', row.id || '');
    const val = parseFloat(row.limite_aprovado);
    _set('emp_limite_clube', Number.isFinite(val) ? String(val) : '0');
    return row;
  } catch (e) {
    console.warn('[RH] load clube limite:', e?.message || e);
    return null;
  }
}

async function _sumBenVoucherUtilizado(userId) {
  if (!userId || typeof supaReq !== 'function') return 0;
  try {
    const vouchers = await supaReq(
      'GET',
      'beneficios_vouchers',
      null,
      `?employee_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=500`
    );
    const debit = new Set(['em_analise', 'utilizado', 'em_processamento', 'pago']);
    return (Array.isArray(vouchers) ? vouchers : [])
      .filter((v) => debit.has(String(v.status || '').toLowerCase()))
      .reduce((acc, v) => acc + (parseFloat(v.valor) || 0), 0);
  } catch (e) {
    console.warn('[RH] sum vouchers:', e?.message || e);
    return 0;
  }
}

async function _ensureBeneficiosTables() {
  if (typeof supaReq !== 'function') return;
  try {
    await supaReq('GET', 'beneficios_limites', null, '?limit=1');
  } catch (_) { /* tabela criada sob demanda pelo /api/rest */ }
}

async function _saveEmpClubeLimite(userId, employeeName, limiteVal) {
  // #region agent log
  fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'clube-limite',hypothesisId:'H1-H2',location:'rh-manager.js:_saveEmpClubeLimite:entry',message:'save clube limite start',data:{userId:userId||null,limiteVal,employeeName:(employeeName||'').slice(0,40)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (!userId || typeof supaReq !== 'function') {
    throw new Error('Funcionário sem usuário vinculado ao sistema de login.');
  }
  await _ensureBeneficiosTables();
  const aprovado = Math.max(0, Math.round((parseFloat(limiteVal) || 0) * 100) / 100);

  const existing = await _fetchClubeLimiteRow(userId);
  const loadedLimitId = String(_val('emp_clube_limite_id') || '').trim();
  const existingAprovado = Math.max(0, parseFloat(existing?.limite_aprovado) || 0);
  // Evita zerar limite existente quando o campo veio 0 porque o load falhou (sem id no form).
  if (aprovado <= 0 && existing && existingAprovado > 0 && !loadedLimitId) {
    // #region agent log
    fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'clube-limite',hypothesisId:'H-wipe',location:'rh-manager.js:_saveEmpClubeLimite:keep',message:'keep existing limite (load miss)',data:{userId,existingAprovado},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (existing.id) _set('emp_clube_limite_id', existing.id);
    _set('emp_limite_clube', String(existingAprovado));
    return existing;
  }

  const usedFromVouchers = await _sumBenVoucherUtilizado(userId);
  const utilizado = Math.min(
    aprovado,
    Math.round(Math.max(parseFloat(existing?.limite_utilizado) || 0, usedFromVouchers) * 100) / 100
  );
  const disponivel = Math.max(0, Math.round((aprovado - utilizado) * 100) / 100);
  const payload = {
    employee_id: userId,
    employee_name: employeeName || existing?.employee_name || '',
    limite_aprovado: aprovado,
    limite_utilizado: utilizado,
    limite_disponivel: disponivel,
    status: aprovado > 0 ? 'aprovado' : (existing?.status || 'solicitado'),
  };

  let limitId = existing?.id || loadedLimitId || '';
  let savedRow = null;

  if (limitId) {
    const patched = await supaReq(
      'PATCH',
      'beneficios_limites',
      payload,
      `?id=eq.${encodeURIComponent(limitId)}`
    );
    savedRow = Array.isArray(patched) && patched[0] ? patched[0] : null;
  }

  if (!savedRow) {
    const row = await _fetchClubeLimiteRow(userId);
    if (row && Math.abs((parseFloat(row.limite_aprovado) || 0) - aprovado) < 0.01) {
      savedRow = row;
      limitId = row.id;
    }
  }

  if (!savedRow) {
    if (aprovado <= 0 && !existing) {
      // #region agent log
      fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'clube-limite',hypothesisId:'H3',location:'rh-manager.js:_saveEmpClubeLimite:skip',message:'skip zero limite no row',data:{userId},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return;
    }
    const newId = 'ben_lim_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const createPayload = {
      ...payload,
      id: newId,
      protocolo: existing?.protocolo || ('RH-' + Date.now().toString(36).toUpperCase()),
    };
    const created = await supaReq('POST', 'beneficios_limites', createPayload);
    savedRow = Array.isArray(created) && created[0] ? created[0] : (created && created.id ? created : null);
    limitId = savedRow?.id || newId;
  }

  if (!savedRow || Math.abs((parseFloat(savedRow.limite_aprovado) || 0) - aprovado) > 0.01) {
    // #region agent log
    fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'clube-limite',hypothesisId:'H2',location:'rh-manager.js:_saveEmpClubeLimite:fail',message:'save clube limite failed',data:{userId,aprovado,savedRow:!!savedRow,limitId},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    throw new Error('Não foi possível gravar o limite do Clube de Benefícios. Tente novamente.');
  }

  if (limitId) _set('emp_clube_limite_id', limitId);

  try {
    await DB.updateUser(userId, { acesso_clube: aprovado > 0 });
  } catch (accErr) {
    console.warn('[RH] acesso_clube:', accErr?.message || accErr);
    // #region agent log
    fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'clube-limite',hypothesisId:'H6',location:'rh-manager.js:_saveEmpClubeLimite:acesso',message:'acesso_clube update failed',data:{userId,error:String(accErr?.message||accErr).slice(0,120)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }
  // #region agent log
  fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'clube-limite',hypothesisId:'H1',location:'rh-manager.js:_saveEmpClubeLimite:ok',message:'save clube limite ok',data:{userId,aprovado,limitId,disponivel},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
}

async function _syncRhUserFromEmployee(emp, password, opts = {}) {
  const email = DB.normalizeEmail(emp.email || emp.email_pessoal || '');
  const users = await DB.getAllUsers().catch(() => []);
  const u = _resolveRhLinkedUser(users, emp, email);
  if (!email && !emp.user_id && !u?.id) return null;
  const formRole = String(emp.system_role || emp.role || '').trim().toLowerCase() || null;
  const syncRole = opts.syncRole === true;
  const isTeamMember = _RH_TEAM_MEMBER_ROLES.includes(formRole || '');
  const isTeamLeader = _RH_TEAM_LEADER_ROLES.includes(formRole || '');
  const adminFromHierarchy = _resolveRhAdminIdFromHierarchy(emp, formRole);

  const userData = {
    name: emp.nome || emp.name || '',
    email: email || u?.email || '',
    cpf: _digits(emp.cpf) || null,
    phone: emp.contato || emp.phone || null,
    matricula: emp.matricula || undefined,
  };
  const deptRh = String(emp.departamento || '').trim();
  if (deptRh) {
    userData.department = deptRh;
  } else if (!u?.department) {
    userData.department = 'Geral';
  }
  if (password) userData.password = password;

  if (!u?.id) {
    if (!password) return null;
    userData.role = formRole || 'vendedor';
    userData.permissions = emp.permissions || _collectPermissoesFromForm();
    if (isTeamMember) {
      userData.admin_id = emp.supervisor_id || (typeof ADMIN_ID !== 'undefined' ? ADMIN_ID : null);
    } else if (adminFromHierarchy) {
      userData.admin_id = adminFromHierarchy;
    }
    const created = await DB.addUser({
      ...userData,
      password,
      balance: 0,
      points: 0,
    });
    return created?.id || null;
  }

  const existingRole = String(u.role || '').trim().toLowerCase();
  if (syncRole && formRole && !_RH_PROTECTED_USER_ROLES.includes(existingRole)) {
    userData.role = formRole;
    if (emp.permissions) userData.permissions = emp.permissions;
  }
  if (!_RH_PRIVILEGED_USER_ROLES.includes(existingRole)) {
    if (isTeamMember) {
      userData.admin_id = emp.supervisor_id || null;
    } else if (isTeamLeader || formRole === 'gerente' || formRole === 'gerencia' || formRole === 'diretoria' || _RH_STAFF_ROLES.includes(formRole || '')) {
      userData.admin_id = adminFromHierarchy || null;
    } else if (adminFromHierarchy) {
      userData.admin_id = adminFromHierarchy;
    }
  }

  await DB.updateUser(u.id, userData);
  return u.id;
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
  if (tabId === 'ranking') {
    openRhRankingTab();
    return;
  }
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
  if (tabId === 'vagas' && typeof RhVagas !== 'undefined' && typeof RhVagas.render === 'function') {
    RhVagas.render();
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
  /* Conteúdo continua em #tab-relatorios; menu lateral usa só Ranking Vendas. */
  switchTab('relatorios');
  if (typeof switchRhRelatorio === 'function') switchRhRelatorio('ranking');
  document.querySelectorAll('.nav-item[data-tab]').forEach((n) => n.classList.remove('active'));
  document.querySelector('.nav-item[data-tab="ranking"]')?.classList.add('active');
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = _RH_TAB_TITLES.ranking || 'Ranking Vendas';
}

function openRhFolhaTab() {
  if (typeof openFolhaPagamento === 'function') {
    openFolhaPagamento();
    return;
  }
  const href = typeof Auth !== 'undefined' && typeof Auth.folhaPagamentoPageHrefFresh === 'function'
    ? Auth.folhaPagamentoPageHrefFresh()
    : (typeof Auth !== 'undefined' && typeof Auth.folhaPagamentoPageHref === 'function'
      ? Auth.folhaPagamentoPageHref()
      : (typeof window.soubluPage === 'function'
        ? window.soubluPage('folha-pagamento.html')
        : 'folha-pagamento.html'));
  window.location.assign(href);
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

function _ensureLeaderSelect(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (el.tagName === 'SELECT') return el;
  const sel = document.createElement('select');
  sel.className = el.className || 'form-control';
  sel.id = id;
  if (el.value) sel.dataset.pendingValue = el.value;
  el.parentNode?.replaceChild(sel, el);
  return sel;
}

function _leaderFieldValue(el, mode) {
  if (!el) return mode === 'id' ? null : '';
  if (el.tagName === 'SELECT') {
    if (mode === 'id') return el.value || null;
    const opt = el.options[el.selectedIndex];
    return (opt?.dataset?.name || opt?.textContent || '').trim();
  }
  const text = String(el.value || '').trim();
  return mode === 'id' ? null : text;
}

function _rhUserRole(u) {
  return String(u?.role || '').trim().toLowerCase();
}

function _rhUserIsActive(u) {
  const a = u?.active;
  if (a === false || a === 0 || a === '0' || a === 'false') return false;
  return true;
}

async function _loadRhSystemUsers(force = false) {
  if (force && typeof DB.clearAllUsersCache === 'function') {
    DB.clearAllUsersCache();
  }
  let users = await DB.getAllUsers(force).catch(() => []);
  if (!users?.length) {
    users = await DB.getUsers().catch(() => []);
  }
  window._allSystemUsersCache = Array.isArray(users) ? users : [];
  return window._allSystemUsersCache;
}

function _rhLeaderPools() {
  return {
    emp_supervisor: ['supervisor', 'sup_backoffice', 'parceiro'],
    emp_responsavel_dpto: ['gerente', 'gerencia', 'rh', 'operacional', 'backoffice', 'supervisor'],
    emp_diretor_dpto: ['diretoria', 'gerente', 'gerencia', 'master', 'fundador'],
  };
}

function _rhLeaderRoleTag(r) {
  return ({
    parceiro: 'Parceiro',
    sup_backoffice: 'Sup. Backoffice',
    supervisor: 'Supervisor',
    diretoria: 'Diretoria',
    gerente: 'Gerente',
    gerencia: 'Gerência',
    rh: 'RH',
    operacional: 'Operacional',
    backoffice: 'Backoffice',
    master: 'Master',
    fundador: 'Fundador',
  })[r] || '';
}

function _buildLeaderOptions(users, allowedRoles, selectedId, selectedName, emptyLabel = '— Sem vínculo —') {
  const roles = new Set(allowedRoles.map((x) => x.toLowerCase()));
  const leaders = (users || [])
    .filter((u) => _rhUserIsActive(u) && roles.has(_rhUserRole(u)))
    .sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || ''));
  let html = `<option value="">${emptyLabel}</option>` + leaders.map((s) => {
    const role = _rhUserRole(s);
    const tag = _rhLeaderRoleTag(role);
    const name = s.name || s.email || '';
    return `<option value="${_esc(s.id)}" data-name="${_esc(name)}">${tag ? `${tag} — ` : ''}${_esc(name)} (${_esc(s.department || '—')})</option>`;
  }).join('');
  if (selectedId && !leaders.some((s) => String(s.id) === String(selectedId))) {
    const nm = selectedName || 'Usuário vinculado';
    html += `<option value="${_esc(selectedId)}" data-name="${_esc(nm)}">${_esc(nm)} (vínculo salvo)</option>`;
  }
  return html;
}

function _resolveRhAdminIdFromHierarchy(emp, formRole) {
  const r = String(formRole || emp.system_role || emp.role || '').trim().toLowerCase();
  if (_RH_TEAM_MEMBER_ROLES.includes(r)) return emp.supervisor_id || null;
  if (_RH_TEAM_LEADER_ROLES.includes(r)) return emp.responsavel_dpto_id || emp.diretor_dpto_id || null;
  if (r === 'gerente' || r === 'gerencia' || r === 'diretoria') return emp.diretor_dpto_id || null;
  if (_RH_STAFF_ROLES.includes(r)) return emp.responsavel_dpto_id || emp.diretor_dpto_id || null;
  return emp.supervisor_id || null;
}

function _refreshEmpHierarchyUI(role) {
  const r = String(role || 'vendedor').toLowerCase();
  const isTeamMember = _RH_TEAM_MEMBER_ROLES.includes(r);
  const isTeamLeader = _RH_TEAM_LEADER_ROLES.includes(r);
  const isStaff = _RH_STAFF_ROLES.includes(r);
  const isDirector = r === 'diretoria' || r === 'gerente' || r === 'gerencia';
  const setVis = (id, show) => {
    const g = document.getElementById(id);
    if (g) g.style.display = show ? '' : 'none';
  };
  // RH/Financeiro/Portaria: sem supervisor comercial; vendedor/supervisor/diretoria mantêm a cadeia.
  setVis('emp_hier_supervisor_group', !isStaff);
  setVis('emp_hier_responsavel_group', true);
  setVis('emp_hier_diretor_group', true);

  const supLbl = document.querySelector('label[for="emp_supervisor"]');
  if (supLbl) {
    if (isTeamMember) {
      supLbl.innerHTML = 'Equipe / Líder responsável <small style="text-transform:none;font-weight:400;">(obrigatório — supervisor ou sup. backoffice)</small>';
    } else if (isTeamLeader) {
      supLbl.innerHTML = 'Reporta a / coordenação superior <small style="text-transform:none;font-weight:400;">(opcional)</small>';
    } else if (isDirector) {
      supLbl.innerHTML = 'Líder / referência na equipe <small style="text-transform:none;font-weight:400;">(opcional)</small>';
    } else {
      supLbl.innerHTML = 'Supervisor do Colaborador';
    }
  }

  const hint = document.getElementById('emp_hierarchy_hint');
  if (!hint) return;
  if (isTeamLeader) {
    hint.textContent = 'Como supervisor, selecione o Responsável pelo Dpto e o Diretor (recomendado). O supervisor escolhido no cadastro de vendedores vira a equipe no sistema (mesmo vínculo do Painel Master).';
  } else if (isDirector) {
    hint.textContent = 'Como diretor/gerente, preencha responsável e diretor superior se houver. O supervisor comercial é opcional.';
  } else if (isStaff) {
    hint.textContent = 'Para este perfil, selecione Responsável pelo Dpto e Diretor Dpto (sem supervisor comercial).';
  } else if (isTeamMember) {
    hint.textContent = 'O supervisor escolhido vira a equipe no sistema (mesmo vínculo do Painel Master).';
  } else {
    hint.textContent = 'Monte a hierarquia: Supervisor → Responsável Dpto → Diretor Dpto.';
  }
}

function _rhSupervisorLabel(e) {
  if (e?.supervisor) return e.supervisor;
  if (e?.supervisor_id) {
    const u = (window._allSystemUsersCache || []).find((x) => String(x.id) === String(e.supervisor_id));
    if (u) return u.name || u.email || '—';
  }
  return '—';
}

function _normalizeRhEmployeeRow(row) {
  if (!row || typeof row !== 'object') return row;
  const r = { ...row };
  if (!r.emergencia_nome_1 && r.nome_emergencia_1) r.emergencia_nome_1 = r.nome_emergencia_1;
  if (!r.emergencia_contato_1 && r.contato_emergencia_1) r.emergencia_contato_1 = r.contato_emergencia_1;
  if (!r.emergencia_nome_2 && r.nome_emergencia_2) r.emergencia_nome_2 = r.nome_emergencia_2;
  if (!r.emergencia_contato_2 && r.contato_emergencia_2) r.emergencia_contato_2 = r.contato_emergencia_2;
  if (!r.email_pessoal && r.email) r.email_pessoal = r.email;
  if (!r.cargo_id && r.cargo) {
    if (/^[a-f0-9]{16,}$/i.test(String(r.cargo))) r.cargo_id = r.cargo;
    else if (typeof _resolveJobId === 'function') {
      const resolved = _resolveJobId(r.cargo);
      if (resolved) r.cargo_id = resolved;
    }
  }
  ['permissions', 'attachments', 'fontedata_meta', 'audit_log'].forEach((k) => {
    if (typeof r[k] === 'string' && r[k] !== '') {
      try { r[k] = JSON.parse(r[k]); } catch { /* mantém string */ }
    }
  });
  if (!r.supervisor_id && r.supervisor && typeof r.supervisor === 'string' && /^[a-f0-9-]{16,}$/i.test(r.supervisor)) {
    r.supervisor_id = r.supervisor;
    r.supervisor = '';
  }
  // Fallback de leitura: legado admin_id (users) → supervisor_id no RH
  if (!r.supervisor_id && r.admin_id) {
    r.supervisor_id = r.admin_id;
  }
  return r;
}

async function _fillLeadersSelects(selected = {}, opts = {}) {
  try {
    const force = opts.force !== false;
    const users = await _loadRhSystemUsers(force);
    const pools = _rhLeaderPools();
    const fieldMap = {
      emp_supervisor: ['supervisor_id', 'supervisor'],
      emp_responsavel_dpto: ['responsavel_dpto_id', 'responsavel_dpto'],
      emp_diretor_dpto: ['diretor_dpto_id', 'diretor_dpto'],
    };

    const emptyLabels = {
      emp_supervisor: '— Sem líder de equipe —',
    };

    for (const [id, roles] of Object.entries(pools)) {
      const el = _ensureLeaderSelect(id);
      if (!el) continue;
      el.disabled = false;
      const [idKey, nameKey] = fieldMap[id] || [];
      const currentVal = el.value || el.dataset.pendingValue || '';
      const selId = selected[idKey] || currentVal;
      const selName = selected[nameKey] || '';
      delete el.dataset.pendingValue;
      el.innerHTML = _buildLeaderOptions(users, roles, selId, selName, emptyLabels[id] || '— Sem vínculo —');
      if (selId) el.value = selId;
    }

    const role = String(_val('emp_role') || selected.system_role || selected.role || 'vendedor').toLowerCase();
    const supEl = document.getElementById('emp_supervisor');
    const respEl = document.getElementById('emp_responsavel_dpto');
    const dirEl = document.getElementById('emp_diretor_dpto');
    const counts = {
      users: (users || []).length,
      supervisor: supEl ? Math.max(0, supEl.options.length - 1) : 0,
      responsavel: respEl ? Math.max(0, respEl.options.length - 1) : 0,
      diretor: dirEl ? Math.max(0, dirEl.options.length - 1) : 0,
    };
    // #region agent log
    fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'hier-fix',hypothesisId:'H-hier2',location:'rh-manager.js:_fillLeadersSelects',message:'leader selects filled',data:{role,counts},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (_RH_TEAM_MEMBER_ROLES.includes(role) || _RH_TEAM_LEADER_ROLES.includes(role) || role === 'diretoria' || role === 'gerente') {
      const warn = document.getElementById('emp_supervisor_warn');
      if (warn) {
        const emptyAll = !counts.supervisor && !counts.responsavel && !counts.diretor;
        warn.style.display = emptyAll ? '' : 'none';
        warn.textContent = emptyAll
          ? 'Nenhum líder encontrado. Cadastre usuários Supervisor / Gerente / Diretoria no sistema.'
          : '';
      }
    }
  } catch (e) {
    console.error('[RH] fill leaders:', e);
  }
}

function _rhHierarchySelectionFromForm() {
  const elSup = document.getElementById('emp_supervisor');
  const elResp = document.getElementById('emp_responsavel_dpto');
  const elDir = document.getElementById('emp_diretor_dpto');
  return {
    supervisor_id: _leaderFieldValue(elSup, 'id'),
    supervisor: _leaderFieldValue(elSup, 'name'),
    responsavel_dpto_id: _leaderFieldValue(elResp, 'id'),
    responsavel_dpto: _leaderFieldValue(elResp, 'name'),
    diretor_dpto_id: _leaderFieldValue(elDir, 'id'),
    diretor_dpto: _leaderFieldValue(elDir, 'name'),
  };
}


function _fillCompanySelect() {
  const el = document.getElementById('emp_cnpj_registro');
  if (!el) return;
  const list = typeof _rhAllowedCompanies === 'function'
    ? _rhAllowedCompanies(_allCompanies)
    : (_allCompanies || []);
  el.innerHTML = '<option value="">Selecione a empresa...</option>' + list.map((c) =>
    `<option value="${_esc(c.cnpj || c.id)}">${_esc(c.razao_social || 'Empresa')} — ${_esc(_fmtCnpj(c.cnpj))}</option>`
  ).join('');
}

function _jobLabel(idOrName) {
  const key = String(idOrName || '').trim();
  if (!key) return '—';
  const byId = _allJobs.find((x) => String(x.id) === key);
  if (byId) return byId.cargo || byId.titulo || '—';
  const low = key.toLowerCase();
  const byName = _allJobs.find((x) => {
    const n = String(x.cargo || x.titulo || '').trim().toLowerCase();
    return n && n === low;
  });
  if (byName) return byName.cargo || byName.titulo || key;
  if (/^[a-f0-9]{16,}$/i.test(key)) return '—';
  return key;
}

function _resolveJobId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (_allJobs.some((j) => String(j.id) === raw)) return raw;
  const low = raw.toLowerCase();
  const byName = _allJobs.find((j) => {
    const n = String(j.cargo || j.titulo || '').trim().toLowerCase();
    return n && n === low;
  });
  return byName ? String(byName.id) : '';
}

function _setEmpCargoSelect(row) {
  const el = document.getElementById('emp_cargo');
  if (!el) return;
  const raw = String(row?.cargo_id || row?.cargo || '').trim();
  let id = _resolveJobId(raw);
  if (!id && raw && !/^[a-f0-9]{16,}$/i.test(raw)) {
    /* texto legado sem job cadastrado — mantém visível no select */
    const opt = document.createElement('option');
    opt.value = raw;
    opt.textContent = raw;
    opt.dataset.legacy = '1';
    el.appendChild(opt);
    id = raw;
  }
  el.value = id || '';
  if (typeof _onEmpCargoChange === 'function' && el.value) _onEmpCargoChange();
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
    <td style="white-space:nowrap;">
      <button type="button" class="btn btn-xs btn-outline" onclick="editCurriculo('${_esc(r.id)}')">Editar</button>
      <button type="button" class="btn btn-xs btn-danger" onclick="excluirCurriculo('${_esc(r.id)}')">Excluir</button>
    </td>
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
    <td style="white-space:nowrap;">
      <button type="button" class="btn btn-xs btn-outline" onclick="editCargo('${_esc(j.id)}')">Editar</button>
      <button type="button" class="btn btn-xs btn-danger" onclick="excluirCargo('${_esc(j.id)}')">Excluir</button>
    </td>
  </tr>`;
  }).join('');
}

function renderEmployeeList() {
  const tbody = document.getElementById('employee_list_body');
  if (!tbody) return;
  const raw = window._allEmployees || [];
  const company = _rhCompanyEmployees(raw);
  const list = _sortRhEmpByName(company);
if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Nenhum registro encontrado.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map((e) => {
    const adv = parseInt(e.advertencias || e.advertencia || 0, 10) || 0;
    const sus = parseInt(e.suspensoes || e.suspensao || 0, 10) || 0;
    const medidas = `${adv} adv. / ${sus} susp.`;
    const st = String(e.status || (e.demitido ? 'demitido' : 'ativo')).toLowerCase();
    const isInactive = st === 'inativo' || st === 'demitido' || e.demitido === true;
    const statusBadge = st === 'demitido'
      ? '<span class="badge badge-danger">Demitido</span>'
      : (isInactive
        ? '<span class="badge badge-warning">Inativo</span>'
        : '<span class="badge badge-success">Ativo</span>');
    const toggleBtn = st === 'demitido'
      ? ''
      : (isInactive
        ? `<button type="button" class="btn btn-xs btn-success" onclick="reativarFuncionario('${_esc(e.id)}')">Reativar</button>`
        : `<button type="button" class="btn btn-xs btn-outline" onclick="inativarFuncionario('${_esc(e.id)}')">Inativar</button>`);
    return `<tr${isInactive ? ' style="opacity:.72;"' : ''}>
      <td><strong>${_esc(e.nome)}</strong><div style="font-size:12px;color:var(--color-text-muted);">${_esc(_fmtCpf(e.cpf))}</div></td>
      <td>${_esc(_jobLabel(e.cargo_id || e.cargo))}</td>
      <td>${_esc(e.departamento || '—')}</td>
      <td>${_esc(_rhSupervisorLabel(e))}</td>
      <td>${_fmtDate(e.data_admissao)}</td>
      <td>${statusBadge}</td>
      <td>${_esc(medidas)}</td>
      <td><div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button type="button" class="btn btn-xs btn-outline" onclick="editFuncionario('${_esc(e.id)}')">Editar</button>
        ${toggleBtn}
        <button type="button" class="btn btn-xs btn-danger" onclick="excluirFuncionario('${_esc(e.id)}')">Excluir</button>
      </div></td>
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
    if (typeof refreshPartnerRootIdsCache === 'function') {
      await refreshPartnerRootIdsCache().catch(() => {});
    }
    try {
      await _loadRhSystemUsers(false);
    } catch (_) {
      window._allSystemUsersCache = [];
    }
    const [companies, resumes, jobs, employees, partners] = await Promise.all([
      DB.getRhCompanies().catch(() => []),
      DB.getRhResumes().catch(() => []),
      DB.getRhJobs().catch(() => []),
      DB.getRhEmployees().catch(() => []),
      (typeof DB.getPartners === 'function' ? DB.getPartners().catch(() => []) : Promise.resolve([])),
    ]);
    _allCompanies = companies || [];
    _rebuildRhOrgFilter(partners || [], _allCompanies, window._allSystemUsersCache || []);
    _allResumes = resumes || [];
    window._allResumes = _allResumes;
    if (typeof purgeExpiredRecusados === 'function') {
      const purged = await purgeExpiredRecusados();
      if (purged > 0) {
        _allResumes = window._allResumes || [];
        if (purged > 0 && typeof showToast === 'function' && !silent) {
          showToast(`${purged} currículo(s) recusado(s) removido(s) após 7 dias.`, 'info', 5000);
        }
      }
    }
    _allJobs = jobs || [];
    window._allEmployees = _sortRhEmpByName((employees || []).map(_normalizeRhEmployeeRow));
    window._allCompanies = _allCompanies;
    window._allResumes = _allResumes;
    window._allJobs = _allJobs;

    _fillJobSelects();
    _fillCompanySelect();
    const openEmpRow = document.getElementById('funcionarioModal')?.classList.contains('open')
      ? (_val('emp_id')
        ? (window._allEmployees || []).find((e) => String(e.id) === String(_val('emp_id')))
        : _rhHierarchySelectionFromForm())
      : {};
    await _fillLeadersSelects(openEmpRow || {}, { force: true }).catch(() => {});
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
function _cvRadioVal(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? String(el.value || '') : '';
}

function _cvSetRadio(name, value) {
  const v = value == null || value === '' ? '' : String(value);
  document.querySelectorAll(`input[name="${name}"]`).forEach((el) => {
    el.checked = v !== '' && String(el.value) === v;
  });
}

function _cvSkillFromForm(prefix) {
  const scoreRaw = _cvRadioVal(prefix);
  const score = scoreRaw ? parseInt(scoreRaw, 10) : null;
  return {
    score: (score >= 1 && score <= 5) ? score : null,
    obs: _val(`${prefix}_obs`).trim(),
  };
}

function _cvFillSkill(prefix, data) {
  const d = data && typeof data === 'object' ? data : {};
  _cvSetRadio(prefix, d.score != null ? d.score : '');
  _set(`${prefix}_obs`, d.obs || '');
}

function _parseCvAvaliacao(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function _collectCvAvaliacao() {
  return {
    doc_parecer_rh: _val('cv_doc_parecer_rh') || '',
    doc_certidao_civil: _val('cv_doc_certidao_civil') || '',
    doc_certidao_negativa: _val('cv_doc_certidao_negativa') || '',
    resumo_executivo: _val('cv_resumo_executivo').trim(),
    hard_skills: {
      experiencia: _cvSkillFromForm('cv_hs_experiencia'),
      formacao: _cvSkillFromForm('cv_hs_formacao'),
      ferramentas: _cvSkillFromForm('cv_hs_ferramentas'),
    },
    soft_skills: {
      comunicacao: _cvSkillFromForm('cv_ss_comunicacao'),
      equipe: _cvSkillFromForm('cv_ss_equipe'),
      problemas: _cvSkillFromForm('cv_ss_problemas'),
      adaptabilidade: _cvSkillFromForm('cv_ss_adaptabilidade'),
    },
    pontos_fortes: _val('cv_pontos_fortes').trim(),
    pontos_atencao: _val('cv_pontos_atencao').trim(),
    parecer: _cvRadioVal('cv_parecer') || '',
    parecer_justificativa: _val('cv_parecer_justificativa').trim(),
  };
}

function _fillCvAvaliacao(row) {
  const a = _parseCvAvaliacao(row?.avaliacao);
  _set('cv_doc_parecer_rh', a.doc_parecer_rh || '');
  _set('cv_doc_certidao_civil', a.doc_certidao_civil || '');
  _set('cv_doc_certidao_negativa', a.doc_certidao_negativa || '');
  _set('cv_resumo_executivo', a.resumo_executivo || '');
  const hs = a.hard_skills || {};
  _cvFillSkill('cv_hs_experiencia', hs.experiencia);
  _cvFillSkill('cv_hs_formacao', hs.formacao);
  _cvFillSkill('cv_hs_ferramentas', hs.ferramentas);
  const ss = a.soft_skills || {};
  _cvFillSkill('cv_ss_comunicacao', ss.comunicacao);
  _cvFillSkill('cv_ss_equipe', ss.equipe);
  _cvFillSkill('cv_ss_problemas', ss.problemas);
  _cvFillSkill('cv_ss_adaptabilidade', ss.adaptabilidade);
  _set('cv_pontos_fortes', a.pontos_fortes || '');
  _set('cv_pontos_atencao', a.pontos_atencao || '');
  _cvSetRadio('cv_parecer', a.parecer || '');
  _set('cv_parecer_justificativa', a.parecer_justificativa || '');
}

function _resetCvAvaliacaoForm() {
  _fillCvAvaliacao({});
}

function openCurriculoModal(row) {
  const form = document.getElementById('form-curriculo');
  if (form) form.reset();
  _editingCvId = null;
  _fillJobSelects();
  gerarProtocoloCurriculo();
  _resetCvAvaliacaoForm();

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
    _fillCvAvaliacao(row);
  } else {
    _loadRhFonteFieldsFromRow('cv', null);
  }

  openModalRH('curriculoModal');
}

function editCurriculo(id) {
  const row = _allResumes.find((r) => String(r.id) === String(id));
  if (row) openCurriculoModal(row);
}

async function excluirCurriculo(id) {
  const row = _allResumes.find((r) => String(r.id) === String(id));
  if (!row) {
    showToast('Currículo não encontrado.', 'warning');
    return;
  }
  const label = row.nome || row.protocolo || row.cpf || id;
  if (!confirm(`Excluir o currículo de "${label}"?\n\nEsta ação não pode ser desfeita.`)) return;

  showLoading('Excluindo currículo...');
  try {
    await DB.deleteRhResume(id);
    _allResumes = _allResumes.filter((r) => String(r.id) !== String(id));
    window._allResumes = _allResumes;
    if (_editingCvId && String(_editingCvId) === String(id)) {
      _editingCvId = null;
      closeModalRH('curriculoModal');
    }
    renderResumeList();
    if (typeof renderKanban === 'function') renderKanban();
    showToast('Currículo excluído.', 'success');
  } catch (e) {
    console.error('[RH] excluirCurriculo:', e);
    showToast(e?.message || 'Erro ao excluir currículo.', 'error');
  } finally {
    hideLoading();
  }
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
    avaliacao: _collectCvAvaliacao(),
    stage: _editingCvId
      ? (_allResumes.find((r) => String(r.id) === String(_editingCvId))?.stage || 'triagem')
      : 'triagem',
  };

  showLoading('Salvando currículo...');
  try {
    await DB.ensureRhTablesOnline(true);
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
    const att = _parseRhAttachments(row.attachments);
    const popMeta = att.pop || (row.pop ? { url: row.pop, nome: row.pop_nome || 'POP', caminho: row.pop } : null);
    _renderRhFileSavedHint('jg_pop', popMeta, 'POP');
  } else {
    _renderRhFileSavedHint('jg_pop', null, 'POP');
  }

  openModalRH('cargoModal');
}

function editCargo(id) {
  const row = _allJobs.find((j) => String(j.id) === String(id));
  if (row) openCargoModal(row);
}

async function _deleteRhJobCompat(id) {
  if (typeof DB.deleteRhJob === 'function') return DB.deleteRhJob(id);
  if (DB.online && typeof supaReq === 'function') {
    await supaReq('DELETE', 'rh_jobs', null, `?id=eq.${encodeURIComponent(id)}`);
    return true;
  }
  const lk = DB.LK?.rh_jobs || 'soublu_rh_jobs';
  try {
    const all = JSON.parse(localStorage.getItem(lk) || '[]');
    localStorage.setItem(lk, JSON.stringify(all.filter((j) => String(j.id) !== String(id))));
  } catch (_) { /* noop */ }
  return true;
}

async function excluirCargo(id) {
  const row = _allJobs.find((j) => String(j.id) === String(id));
  if (!row) {
    showToast('Cargo não encontrado.', 'warning');
    return;
  }
  const label = row.cargo || row.protocolo || id;
  if (!confirm(`Excluir o cargo "${label}"?\n\nEsta ação não pode ser desfeita.`)) return;

  showLoading('Excluindo cargo...');
try {
    await _deleteRhJobCompat(id);
    _allJobs = _allJobs.filter((j) => String(j.id) !== String(id));
    if (_editingJobId && String(_editingJobId) === String(id)) {
      _editingJobId = null;
      closeModalRH('cargoModal');
    }
    renderJobList();
    _fillJobSelects();
    showToast('Cargo excluído.', 'success');
  } catch (e) {
    console.error('[RH] excluirCargo:', e);
    showToast(e?.message || 'Erro ao excluir cargo.', 'error');
  } finally {
    hideLoading();
  }
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
    const prev = _editingJobId ? (_allJobs.find((j) => String(j.id) === String(_editingJobId)) || {}) : {};
    const jobKey = row.id || row.protocolo || `cargo_${Date.now()}`;
    const att = await _collectRhAttachments([['jg_pop', 'pop']], prev.attachments, `cargos/${jobKey}`);
    const popMeta = att.pop || null;
    if (popMeta) {
      row.attachments = att;
      row.pop = popMeta.caminho || popMeta.url || prev.pop || null;
      row.pop_nome = popMeta.nome || prev.pop_nome || null;
    } else if (prev.attachments || prev.pop) {
      row.attachments = _parseRhAttachments(prev.attachments);
      row.pop = prev.pop || null;
      row.pop_nome = prev.pop_nome || null;
    }
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
  _set('emp_user_id', '');
  _set('emp_advertencia', '0');
  _set('emp_suspensao', '0');
  _set('emp_limite_clube', '0');
  _set('emp_clube_limite_id', '');
  _fillPermissoesForm({});
  const audit = document.getElementById('emp_audit_section');
  if (audit) audit.style.display = 'none';
  const hist = document.getElementById('history_log');
  if (hist) hist.innerHTML = '';
  document.getElementById('funcModalTitle').textContent = 'Novo Funcionário';
  _loadRhFonteFieldsFromRow('emp', null);
  _clearRhFileSavedHints(_RH_EMP_FILE_FIELDS.map((f) => f[0]));
}

async function openFuncionarioModal(row) {
  limparFormFuncionario();
  _fillJobSelects();
  _fillCompanySelect();
  await _loadRhSystemUsers(true);

  if (row) {
    row = _normalizeRhEmployeeRow(row);
    if (!row.supervisor_id && row.user_id) {
      const u = (window._allSystemUsersCache || []).find((x) => String(x.id) === String(row.user_id));
      if (u?.admin_id && _RH_TEAM_MEMBER_ROLES.includes(String(row.system_role || row.role || '').toLowerCase())) {
        row.supervisor_id = u.admin_id;
      }
    }
  }

  if (row) {
    _set('emp_id', row.id);
    _set('emp_user_id', row.user_id || '');
    document.getElementById('funcModalTitle').textContent = 'Editar Funcionário';
    _set('emp_cpf', _fmtCpf(row.cpf));
    _set('emp_nome', row.nome || '');
    _set('emp_cnpj_registro', row.cnpj_registro || row.cnpj || '');
    _set('emp_matricula', row.matricula || '');
    _set('emp_cracha_codigo', row.cracha_codigo || '');
    _set('emp_contato', row.contato || '');
    _set('emp_email_pessoal', row.email || row.email_pessoal || '');
    _set('emp_protocolo_entrevista', row.protocolo_entrevista || '');
    _set('emp_data_admissao', (row.data_admissao || '').slice(0, 10));
    _set('emp_departamento', row.departamento || '');
    _set('emp_chave_pix', row.chave_pix || '');
    _setEmpCargoSelect(row);
    _set('emp_cbo_cod', row.cbo_cod || '');
    _set('emp_cbo_descricao', row.cbo_descricao || '');

    _setEmpRole(row.system_role || row.role || 'vendedor');

    await _fillLeadersSelects(row);

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
    _showRhAttachmentHints(_RH_EMP_FILE_FIELDS, row.attachments);
    const linkedUid = await _resolveClubeUserId(row, row.email || row.email_pessoal || '');
    await _loadEmpClubeLimite(linkedUid, row);
  } else {
    _setEmpRole('vendedor');
    await _fillLeadersSelects({});
  }

  openModalRH('funcionarioModal');
}

function editFuncionario(id) {
  const row = (window._allEmployees || []).find((e) => String(e.id) === String(id));
  if (row) openFuncionarioModal(row);
}

async function excluirFuncionario(id) {
  const row = (window._allEmployees || []).find((e) => String(e.id) === String(id));
  if (!row) {
    showToast('Funcionário não encontrado.', 'warning');
    return;
  }
  const label = row.nome || _fmtCpf(row.cpf) || id;
  const loginNote = row.user_id
    ? '\n\nO cadastro RH será removido. O login do sistema (se existir) permanece ativo.'
    : '';
  if (!confirm(`Excluir o funcionário "${label}"?\n\nEsta ação não pode ser desfeita.${loginNote}`)) return;

  showLoading('Excluindo funcionário...');
  try {
    if (typeof DB.deleteRhEmployee === 'function') {
      await DB.deleteRhEmployee(id);
    } else if (DB.online && typeof supaReq === 'function') {
      await supaReq('DELETE', 'rh_employees', null, `?id=eq.${encodeURIComponent(id)}`);
    } else {
      const lk = DB.LK?.rh_employees || 'soublu_rh_employees';
      const all = JSON.parse(localStorage.getItem(lk) || '[]');
      localStorage.setItem(lk, JSON.stringify(all.filter((e) => String(e.id) !== String(id))));
    }
    window._allEmployees = (window._allEmployees || []).filter((e) => String(e.id) !== String(id));
    const empId = _val('emp_id');
    if (empId && String(empId) === String(id)) {
      closeModalRH('funcionarioModal');
      limparFormFuncionario();
    }
    renderEmployeeList();
    showToast('Funcionário excluído.', 'success');
  } catch (e) {
    console.error('[RH] excluirFuncionario:', e);
    showToast(e?.message || 'Erro ao excluir funcionário.', 'error');
  } finally {
    hideLoading();
  }
}

async function _setRhEmployeeActiveState(id, active) {
  const row = (window._allEmployees || []).find((e) => String(e.id) === String(id));
  if (!row) {
    showToast('Funcionário não encontrado.', 'warning');
    return;
  }
  if (row.demitido || String(row.status || '').toLowerCase() === 'demitido') {
    showToast('Funcionário demitido. Use o fluxo de demissão/reintegração.', 'warning');
    return;
  }
  const label = row.nome || _fmtCpf(row.cpf) || id;
  const ask = active
    ? `Reativar o funcionário "${label}"?\n\nO login do sistema será liberado novamente.`
    : `Inativar o funcionário "${label}"?\n\nO cadastro RH permanece, mas o login do sistema será bloqueado.`;
  if (!confirm(ask)) return;

  showLoading(active ? 'Reativando...' : 'Inativando...');
  try {
    const next = {
      ...row,
      status: active ? 'ativo' : 'inativo',
      demitido: false,
      updated_at: new Date().toISOString(),
    };
    const author = typeof Auth !== 'undefined' ? (Auth.getSession()?.name || 'RH') : 'RH';
    const log = Array.isArray(row.audit_log) ? [...row.audit_log] : [];
    log.unshift({
      data: new Date().toLocaleString('pt-BR'),
      nota: active ? 'Funcionário reativado' : 'Funcionário inativado',
      autor: author,
    });
    next.audit_log = log.slice(0, 50);

    await DB.saveRhEmployee(next);

    if (typeof _setUserActive === 'function') {
      await _setUserActive(next, active);
    } else if (next.user_id && typeof DB.updateUser === 'function') {
      await DB.updateUser(next.user_id, { active: !!active });
    } else {
      const users = await DB.getAllUsers().catch(() => []);
      const cpf = _digits(next.cpf);
      const email = String(next.email || next.email_pessoal || '').trim().toLowerCase();
      const u = users.find((x) =>
        (next.user_id && String(x.id) === String(next.user_id))
        || (cpf && _digits(x.cpf) === cpf)
        || (email && String(x.email || '').trim().toLowerCase() === email)
      );
      if (u?.id) await DB.updateUser(u.id, { active: !!active });
    }

    const idx = (window._allEmployees || []).findIndex((e) => String(e.id) === String(id));
    if (idx >= 0) window._allEmployees[idx] = next;
    renderEmployeeList();
    showToast(active ? 'Funcionário reativado.' : 'Funcionário inativado.', 'success');
  } catch (e) {
    console.error('[RH] setActive:', e);
    showToast(e?.message || 'Erro ao alterar status do funcionário.', 'error');
  } finally {
    hideLoading();
  }
}

async function inativarFuncionario(id) {
  return _setRhEmployeeActiveState(id, false);
}

async function reativarFuncionario(id) {
  return _setRhEmployeeActiveState(id, true);
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
    supervisor_id: u.admin_id || null,
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
    ],
    'portaria': [
      'perm_canLoja', 'perm_canChamados', 'perm_canPainelSonhos', 'perm_canMeuExtrato',
      'perm_canTreinamentos',
    ],
  };

  let toCheck = [];
  if (role === 'diretoria' || role === 'desenvolvedor' || role === 'fundador' || role === 'master') {
    checkboxes.forEach(cb => cb.checked = true);
    _refreshEmpHierarchyUI(role);
    _fillLeadersSelects(_rhHierarchySelectionFromForm(), { force: true }).catch(() => {});
    return;
  } else if (role === 'gerente') {
    toCheck = [
      'perm_canMasterPanel',
      ...presets['supervisor'], ...presets['rh'], ...presets['financeiro'], 'perm_canMarketplaceBlu',
    ];
  } else {
    toCheck = presets[role] || [];
  }

  toCheck.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = true;
  });
  _refreshEmpHierarchyUI(role);
  _fillLeadersSelects(_rhHierarchySelectionFromForm(), { force: true }).catch(() => {});
}

async function salvarFuncionario(event) {
  if (event) event.preventDefault();

  const id = _val('emp_id');
  const linkedUserId = _val('emp_user_id') || '';
  const cpf = _digits(_val('emp_cpf'));
  const nome = _val('emp_nome').trim();
  const cnpjReg = _digits(_val('emp_cnpj_registro'));
  const prev = id ? ((window._allEmployees || []).find((e) => String(e.id) === String(id)) || {}) : {};
  if (!prev.user_id && linkedUserId) prev.user_id = linkedUserId;
  const cargoRaw = _val('emp_cargo');
  let cargoId = _resolveJobId(cargoRaw) || '';
  if (!cargoId && cargoRaw && /^[a-f0-9]{16,}$/i.test(cargoRaw)) cargoId = cargoRaw;
  if (!cargoId && id) {
    cargoId = String(prev.cargo_id || '').trim()
      || (_resolveJobId(prev.cargo) || '')
      || (prev.cargo && /^[a-f0-9]{16,}$/i.test(String(prev.cargo)) ? String(prev.cargo) : '');
  }
  const email = _val('emp_email_pessoal').trim();
  const password = _val('emp_password');
  const limiteClubeEarly = _parseMoney(_val('emp_limite_clube'));
  const role = _val('emp_role') || 'vendedor';
  let finalRole = role;
  if ((id || linkedUserId) && (prev.user_id || linkedUserId)) {
    const linked = await DB.getUser(prev.user_id || linkedUserId, true).catch(() => null);
    const linkedRole = String(linked?.role || '').trim().toLowerCase();
    if (_RH_PROTECTED_USER_ROLES.includes(linkedRole) && role !== linkedRole) {
      finalRole = linkedRole;
      showToast(`Perfil "${_RH_ROLE_LABELS[linkedRole] || linkedRole}" preservado para este usuário.`, 'info', 6000);
    }
  }

  if (!nome) {
    showToast('Preencha o nome.', 'warning');
    return;
  }
  const hasLinkedLogin = !!(linkedUserId || prev.user_id || email);
  if (cpf.length !== 11 && !hasLinkedLogin) {
    showToast('Preencha CPF e nome.', 'warning');
    return;
  }
  if (cpf.length && cpf.length !== 11) {
    showToast('CPF inválido. Informe 11 dígitos ou deixe em branco.', 'warning');
    return;
  }

  const dup = cpf.length === 11
    ? (window._allEmployees || []).find((e) => _digits(e.cpf) === cpf && String(e.id) !== String(id))
    : null;
  if (dup) {
    showToast('CPF já cadastrado para outro funcionário.', 'warning');
    return;
  }

  const job = _allJobs.find((j) => String(j.id) === String(cargoId));
  const cargoName = (job?.cargo || job?.titulo || '').trim()
    || (cargoRaw && !/^[a-f0-9]{16,}$/i.test(cargoRaw) ? cargoRaw.trim() : '')
    || (prev.cargo && !/^[a-f0-9]{16,}$/i.test(String(prev.cargo)) ? String(prev.cargo).trim() : '')
    || '';
  const permissions = _collectPermissoesFromForm();
  const auditNote = _val('emp_audit_note').trim();

  const elSup = document.getElementById('emp_supervisor');
  const elResp = document.getElementById('emp_responsavel_dpto');
  const elDir = document.getElementById('emp_diretor_dpto');

  const row = {
    id: id || undefined,
    user_id: linkedUserId || prev.user_id || null,
    cpf: cpf || null,
    nome,
    cnpj_registro: cnpjReg,
    matricula: _val('emp_matricula').trim(),
    cracha_codigo: _val('emp_cracha_codigo').trim(),
    contato: _val('emp_contato').trim(),
    email,
    email_pessoal: email,
    protocolo_entrevista: _val('emp_protocolo_entrevista').trim(),
    data_admissao: _val('emp_data_admissao') || null,
    departamento: _val('emp_departamento').trim(),
    chave_pix: _val('emp_chave_pix').trim(),
    cargo_id: cargoId || null,
    cargo: cargoName || cargoId || null,
    cbo_cod: _val('emp_cbo_cod').trim() || job?.cbo_cod || '',
    cbo_descricao: _val('emp_cbo_descricao').trim() || job?.cbo_descricao || '',
    supervisor: _leaderFieldValue(elSup, 'name'),
    supervisor_id: _leaderFieldValue(elSup, 'id'),
    responsavel_dpto: _leaderFieldValue(elResp, 'name'),
    responsavel_dpto_id: _leaderFieldValue(elResp, 'id'),
    diretor_dpto: _leaderFieldValue(elDir, 'name'),
    diretor_dpto_id: _leaderFieldValue(elDir, 'id'),
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
    system_role: finalRole,
    role: finalRole,
    permissions,
    demitido: !!(prev?.demitido || String(prev?.status || '').toLowerCase() === 'demitido'),
    status: (prev?.demitido || String(prev?.status || '').toLowerCase() === 'demitido')
      ? 'demitido'
      : (String(prev?.status || '').toLowerCase() === 'inativo' ? 'inativo' : 'ativo'),
  };

  if (id && auditNote) {
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
    await DB.ensureRhTablesOnline(true);
    await DB.ensurePersistTablesOnline(true);
    const empKey = id || cpf || linkedUserId || prev.user_id || ('tmp_' + Date.now());
    try {
      row.attachments = await _collectRhAttachments(_RH_EMP_FILE_FIELDS, prev.attachments, `funcionarios/${empKey}`);
    } catch (attErr) {
      console.error('[RH] falha ao enviar anexos:', attErr);
      hideLoading();
      const msg = (attErr && attErr.message) ? attErr.message : String(attErr || 'erro desconhecido');
      showToast('Não foi possível salvar o anexo: ' + msg, 'error', 9000);
      return;
    }
    let userSyncWarn = '';
    let loginCreatedMsg = '';
    const prevUserId = prev.user_id || null;
    const prevRole = String(prev.system_role || prev.role || '').trim().toLowerCase();
    const roleChanged = !!id && prevRole && prevRole !== finalRole;
    try {
      let syncPwd = password || '';
      if (password) {
        row.user_id = await _syncRhUserFromEmployee(row, password);
      } else if (email || prev.user_id || cpf) {
        row.user_id = await _syncRhUserFromEmployee(row, null, { syncRole: roleChanged });
      }
      /* Sem usuário de login: com e-mail + limite do Clube (ou senha), cria o acesso
         automaticamente — senão o colaborador vê "Usuário não encontrado" no login. */
      const needsLogin = !!(email && !(row.user_id && await _isRealSystemUserId(row.user_id)));
      if (needsLogin && (password || limiteClubeEarly > 0)) {
        syncPwd = password || '123456';
        if (String(syncPwd).length < 4) syncPwd = '123456';
        row.user_id = await _syncRhUserFromEmployee(row, syncPwd);
        if (row.user_id && await _isRealSystemUserId(row.user_id)) {
          if (!password) {
            loginCreatedMsg = `Login criado: ${email} / senha inicial 123456 (peça para trocar).`;
          }
          // #region agent log
          fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'clube-limite',hypothesisId:'L-login',location:'rh-manager.js:salvarFuncionario:autoLogin',message:'login auto-criado para clube',data:{empId:id||null,userId:row.user_id||null,hadPassword:!!password,limite:limiteClubeEarly},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
        }
      }
      if (!row.user_id || !(await _isRealSystemUserId(row.user_id))) {
        row.user_id = await _resolveRhEmployeeUserId({ ...row, user_id: prev.user_id }, email);
      }
    } catch (userErr) {
      console.warn('[RH] sync usuário:', userErr);
      userSyncWarn = userErr?.message || String(userErr);
      if (!row.user_id) {
        row.user_id = await _resolveRhEmployeeUserId({ ...row, user_id: prev.user_id }, email);
      }
    }

    const savedEmp = await DB.saveRhEmployee(row);
    if (savedEmp?.id) row.id = savedEmp.id;

    let hierWarn = '';
    const savedId = row.id || id;
    const clubeUserId = await _resolveClubeUserId(
      { ...row, user_id: row.user_id || prev.user_id, fontedata_meta: row.fontedata_meta || prev.fontedata_meta },
      email
    );
    if (clubeUserId && clubeUserId !== row.user_id) {
      row.user_id = clubeUserId;
      const metaBase = (typeof row.fontedata_meta === 'object' && row.fontedata_meta)
        ? { ...row.fontedata_meta }
        : (typeof prev.fontedata_meta === 'object' && prev.fontedata_meta ? { ...prev.fontedata_meta } : {});
      metaBase.linked_user_id = clubeUserId;
      row.fontedata_meta = metaBase;
      if (savedId) {
        await DB.saveRhEmployee({
          id: savedId,
          user_id: clubeUserId,
          fontedata_meta: metaBase,
        }).catch((linkErr) => console.warn('[RH] persistir user_id:', linkErr));
      }
    } else if (clubeUserId) {
      row.user_id = clubeUserId;
    }
    if (savedId && (row.supervisor_id || row.responsavel_dpto_id || row.diretor_dpto_id)) {
      let fresh = savedEmp && String(savedEmp.id) === String(savedId) ? savedEmp : null;
      if (!fresh || (row.supervisor_id && !fresh.supervisor_id)) {
        fresh = (await DB.getRhEmployees().catch(() => []))
          .find((e) => String(e.id) === String(savedId)) || fresh;
      }
      if (fresh) {
        const norm = _normalizeRhEmployeeRow(fresh);
        const missing = [];
        if (row.supervisor_id && String(norm.supervisor_id || '') !== String(row.supervisor_id)) missing.push('supervisor');
        if (row.responsavel_dpto_id && String(norm.responsavel_dpto_id || '') !== String(row.responsavel_dpto_id)) missing.push('responsável');
        if (row.diretor_dpto_id && String(norm.diretor_dpto_id || '') !== String(row.diretor_dpto_id)) missing.push('diretor');
        if (missing.length) {
          // Retry hierarchy-only patch after forcing schema migrate
          await DB.ensureRhTablesOnline(true).catch(() => null);
          await DB.saveRhEmployee({
            id: savedId,
            supervisor_id: row.supervisor_id || null,
            supervisor: row.supervisor || '',
            responsavel_dpto_id: row.responsavel_dpto_id || null,
            responsavel_dpto: row.responsavel_dpto || '',
            diretor_dpto_id: row.diretor_dpto_id || null,
            diretor_dpto: row.diretor_dpto || '',
          }).catch(() => null);
          const retry = (await DB.getRhEmployees().catch(() => []))
            .find((e) => String(e.id) === String(savedId));
          const retryNorm = _normalizeRhEmployeeRow(retry || {});
          const stillMissing = [];
          if (row.supervisor_id && String(retryNorm.supervisor_id || '') !== String(row.supervisor_id)) stillMissing.push('supervisor');
          if (row.responsavel_dpto_id && String(retryNorm.responsavel_dpto_id || '') !== String(row.responsavel_dpto_id)) stillMissing.push('responsável');
          if (row.diretor_dpto_id && String(retryNorm.diretor_dpto_id || '') !== String(row.diretor_dpto_id)) stillMissing.push('diretor');
          if (stillMissing.length) {
            hierWarn = `Hierarquia (${stillMissing.join(', ')}) não persistiu no banco — rode a migração RH (colunas supervisor_id / diretor_dpto_id).`;
          }
        }
      } else {
        hierWarn = 'Não foi possível confirmar a hierarquia gravada. Reabra o cadastro para verificar.';
      }
    }

    const limiteClube = limiteClubeEarly;
    let clubeWarn = '';
    let clubeOkMsg = '';
    /* Preferência: id de usuário de LOGIN. Sem login, grava no id do cadastro RH —
       o Clube re-vincula sozinho no primeiro acesso (self-heal) e o salvamento nunca falha. */
    let limiteUid = clubeUserId || null;
    if (!limiteUid) {
      const fallback = row.user_id || prev.user_id || null;
      if (fallback && await _isRealSystemUserId(fallback)) limiteUid = fallback;
    }
    if (!limiteUid) limiteUid = savedId || id || null;
    /* Login existe e há linha antiga gravada no id do cadastro RH: migra em vez de duplicar. */
    if (limiteUid && savedId && String(limiteUid) !== String(savedId)) {
      try {
        const orphan = await _fetchClubeLimiteRow(savedId);
        if (orphan?.id) {
          const own = await _fetchClubeLimiteRow(limiteUid);
          if (!own) {
            await supaReq('PATCH', 'beneficios_limites', { employee_id: limiteUid }, `?id=eq.${encodeURIComponent(orphan.id)}`);
            _set('emp_clube_limite_id', orphan.id);
          }
        }
      } catch (migErr) {
        console.warn('[RH] migrar limite órfão:', migErr?.message || migErr);
      }
    }
    // #region agent log
    fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'clube-limite',hypothesisId:'H1-H4',location:'rh-manager.js:salvarFuncionario:clube',message:'clube save context',data:{empId:id||null,limiteClube,limiteUid,clubeUserId,rowUserId:row.user_id||null,prevUserId:prev.user_id||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (limiteUid) {
      try {
        await _saveEmpClubeLimite(limiteUid, nome, limiteClube);
        if (limiteClube > 0) clubeOkMsg = `Limite Clube: R$ ${limiteClube.toFixed(2).replace('.', ',')}.`;
      } catch (limErr) {
        console.warn('[RH] limite clube:', limErr);
        clubeWarn = limErr?.message || String(limErr);
      }
    } else if (limiteClube > 0) {
      clubeWarn = 'Limite não gravado: salve o funcionário primeiro e tente novamente.';
    }

    closeModalRH('funcionarioModal');
    await reloadAllData();
    if (userSyncWarn || clubeWarn || hierWarn) {
      const parts = [];
      if (userSyncWarn) parts.push(`Login: ${userSyncWarn}`);
      if (loginCreatedMsg) parts.push(loginCreatedMsg);
      if (clubeWarn) parts.push(clubeWarn);
      if (hierWarn) parts.push(hierWarn);
      showToast(`Funcionário salvo. ${parts.join(' ')}`, 'warning', 10000);
    } else {
      const extra = [clubeOkMsg, loginCreatedMsg].filter(Boolean).join(' ');
      showToast((id ? 'Funcionário atualizado!' : 'Funcionário cadastrado!') + (extra ? ' ' + extra : ''), 'success', loginCreatedMsg ? 12000 : 5000);
    }
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
    /* Sem permissão: não renderizar o painel RH — volta direto à área do usuário. */
    if (typeof Auth !== 'undefined' && typeof Auth.defaultAppHref === 'function') {
      window.location.replace(Auth.defaultAppHref());
    } else {
      navigateBack();
    }
    return;
  }

  currentUser = await Auth.getCurrentUser().catch(() => session);
  window.currentUser = currentUser;
  _applyRhChrome(role);
  _renderRhSidebarUser(currentUser);
  _wireRhEvents();

  if (typeof loadRhJustificativaSection === 'function') {
    await loadRhJustificativaSection().catch((e) => console.warn('[RH] justificativa load:', e));
  }

  _showRhApp();

  const params = new URLSearchParams(window.location.search);
  const tabParam = params.get('tab') || (window.location.hash || '').replace(/^#/, '');
  const editParam = params.get('edit');

  const folhaDeepLink = tabParam === 'folha';
  if (folhaDeepLink) {
    openRhFolhaTab();
    return;
  }
  /* Relatórios saiu do menu — deep-links antigos abrem Ranking Vendas (mesmo hub). */
  if (tabParam === 'relatorios' || tabParam === 'ranking') {
    openRhRankingTab();
  } else {
    const initialTab = tabParam || _rhDefaultTab(role);
    switchTab(initialTab);
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
window.excluirCurriculo = excluirCurriculo;

window.openCargoModal = openCargoModal;
window.salvarCargo = salvarCargo;
window.editCargo = editCargo;
window.excluirCargo = excluirCargo;
window.gerarProtocoloCargo = gerarProtocoloCargo;

window.openFuncionarioModal = openFuncionarioModal;
window.openFuncionarioFromRef = openFuncionarioFromRef;
window.salvarFuncionario = salvarFuncionario;
window.limparFormFuncionario = limparFormFuncionario;
window.buscarCpfFuncionario = buscarCpfFuncionario;
window.buscarCnpjFuncionario = buscarCnpjFuncionario;
window.editFuncionario = editFuncionario;
window.excluirFuncionario = excluirFuncionario;
window.inativarFuncionario = inativarFuncionario;
window.reativarFuncionario = reativarFuncionario;
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
