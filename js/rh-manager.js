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

/** Colaboradores SOU+BLU (cadastro RH interno) — exclui parceiros e equipe parceira. */
function _isRhCompanyEmployee(emp) {
  if (!emp) return false;
  const role = String(emp.system_role || emp.role || '').trim().toLowerCase();
  if (role === 'parceiro') return false;
  const dept = _normRhDept(emp.departamento);
  if (dept === 'parceiro') return false;
  const uid = emp.user_id ? String(emp.user_id) : '';
  if (uid && window._PARTNER_NETWORK_USER_IDS?.has(uid)) return false;
  if (uid && typeof isUserInPartnerNetworkSync === 'function') {
    const u = (window._allSystemUsersCache || []).find((x) => String(x.id) === uid);
    if (u && isUserInPartnerNetworkSync(u)) return false;
  }
  return true;
}

function _rhCompanyEmployees(rows) {
  return (rows || []).filter(_isRhCompanyEmployee);
}

window._isRhCompanyEmployee = _isRhCompanyEmployee;
window._rhCompanyEmployees = _rhCompanyEmployees;

let _editingCvId = null;
let _editingJobId = null;

const _RH_DOC_BUCKET = 'rh-docs';

const _RH_CV_FILE_FIELDS = [
  ['cv_anexo_parecer', 'parecer'],
  ['cv_anexo_certidao_civil', 'certidao_civil'],
  ['cv_anexo_certidao_negativa', 'certidao_negativa'],
];

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
];

/** Perfis que nunca devem ser rebaixados pelo sync RH → users. */
const _RH_PROTECTED_USER_ROLES = ['master', 'fundador'];

/** Perfis cujo admin_id não deve ser sobrescrito pelo cadastro RH. */
const _RH_PRIVILEGED_USER_ROLES = ['master', 'fundador', 'desenvolvedor', 'gerente', 'diretoria'];

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

async function _loadEmpClubeLimite(userId) {
  _set('emp_limite_clube', '0');
  _set('emp_clube_limite_id', '');
  if (!userId || typeof supaReq !== 'function') return;
  try {
    const list = await supaReq(
      'GET',
      'beneficios_limites',
      null,
      `?employee_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=1`
    );
    const row = Array.isArray(list) && list[0] ? list[0] : null;
    if (!row) return;
    _set('emp_clube_limite_id', row.id || '');
    const val = parseFloat(row.limite_aprovado);
    _set('emp_limite_clube', Number.isFinite(val) ? String(val) : '0');
  } catch (e) {
    console.warn('[RH] load clube limite:', e?.message || e);
  }
}

async function _saveEmpClubeLimite(userId, employeeName, limiteVal) {
  if (!userId || typeof supaReq !== 'function') return;
  const aprovado = Math.max(0, Math.round((parseFloat(limiteVal) || 0) * 100) / 100);
  const existingId = _val('emp_clube_limite_id');
  let utilizado = 0;
  let limitId = existingId;

  try {
    if (!limitId) {
      const list = await supaReq(
        'GET',
        'beneficios_limites',
        null,
        `?employee_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=1`
      );
      if (Array.isArray(list) && list[0]) {
        limitId = list[0].id;
        utilizado = parseFloat(list[0].limite_utilizado) || 0;
      }
    } else {
      const list = await supaReq(
        'GET',
        'beneficios_limites',
        null,
        `?id=eq.${encodeURIComponent(limitId)}&limit=1`
      );
      if (Array.isArray(list) && list[0]) {
        utilizado = parseFloat(list[0].limite_utilizado) || 0;
      }
    }

    const disponivel = Math.max(0, Math.round((aprovado - utilizado) * 100) / 100);
    const payload = {
      employee_id: userId,
      employee_name: employeeName || '',
      limite_aprovado: aprovado,
      limite_utilizado: utilizado,
      limite_disponivel: disponivel,
      status: aprovado > 0 ? 'aprovado' : 'solicitado',
    };

    if (limitId) {
      await supaReq('PATCH', 'beneficios_limites', payload, `?id=eq.${encodeURIComponent(limitId)}`);
    } else if (aprovado > 0) {
      payload.id = 'ben_lim_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      payload.protocolo = 'RH-' + Date.now().toString(36).toUpperCase();
      await supaReq('POST', 'beneficios_limites', payload);
      limitId = payload.id;
    }

    if (limitId) _set('emp_clube_limite_id', limitId);

    try {
      await DB.updateUser(userId, { acesso_clube: aprovado > 0 });
    } catch (accErr) {
      console.warn('[RH] acesso_clube:', accErr?.message || accErr);
    }
  } catch (e) {
    console.error('[RH] save clube limite:', e);
    throw new Error('Não foi possível salvar o limite do Clube de Benefícios: ' + (e?.message || e));
  }
}

async function _syncRhUserFromEmployee(emp, password, opts = {}) {
  const email = DB.normalizeEmail(emp.email || emp.email_pessoal || '');
  if (!email && !emp.user_id) return emp.user_id || null;

  const users = await DB.getAllUsers().catch(() => []);
  const u = _resolveRhLinkedUser(users, emp, email);
  const formRole = String(emp.system_role || emp.role || '').trim().toLowerCase() || null;
  const syncRole = opts.syncRole === true;

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
    if (emp.supervisor_id) userData.admin_id = emp.supervisor_id;
    else if (typeof ADMIN_ID !== 'undefined') userData.admin_id = ADMIN_ID;
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
    if (emp.supervisor_id) userData.admin_id = emp.supervisor_id;
    else if (typeof ADMIN_ID !== 'undefined' && !u.admin_id) userData.admin_id = ADMIN_ID;
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

function _normalizeRhEmployeeRow(row) {
  if (!row || typeof row !== 'object') return row;
  const r = { ...row };
  if (!r.emergencia_nome_1 && r.nome_emergencia_1) r.emergencia_nome_1 = r.nome_emergencia_1;
  if (!r.emergencia_contato_1 && r.contato_emergencia_1) r.emergencia_contato_1 = r.contato_emergencia_1;
  if (!r.emergencia_nome_2 && r.nome_emergencia_2) r.emergencia_nome_2 = r.nome_emergencia_2;
  if (!r.emergencia_contato_2 && r.contato_emergencia_2) r.emergencia_contato_2 = r.contato_emergencia_2;
  if (!r.email_pessoal && r.email) r.email_pessoal = r.email;
  if (!r.cargo_id && r.cargo && /^[a-f0-9]{16,}$/i.test(String(r.cargo))) r.cargo_id = r.cargo;
  ['permissions', 'attachments', 'fontedata_meta', 'audit_log'].forEach((k) => {
    if (typeof r[k] === 'string' && r[k] !== '') {
      try { r[k] = JSON.parse(r[k]); } catch { /* mantém string */ }
    }
  });
  return r;
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
      const el = _ensureLeaderSelect(id);
      if (el) {
        const currentVal = el.value || el.dataset.pendingValue || '';
        delete el.dataset.pendingValue;
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
      <td><div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button type="button" class="btn btn-xs btn-outline" onclick="editFuncionario('${_esc(e.id)}')">Editar</button>
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
      window._allSystemUsersCache = await DB.getUsers().catch(() => []);
    } catch (_) {
      window._allSystemUsersCache = [];
    }
    const [companies, resumes, jobs, employees] = await Promise.all([
      DB.getRhCompanies().catch(() => []),
      DB.getRhResumes().catch(() => []),
      DB.getRhJobs().catch(() => []),
      DB.getRhEmployees().catch(() => []),
    ]);
    _allCompanies = companies || [];
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
    _clearRhFileSavedHints(_RH_CV_FILE_FIELDS.map((f) => f[0]));
  }

  if (row) {
    _showRhAttachmentHints(_RH_CV_FILE_FIELDS, row.attachments);
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
    stage: _editingCvId
      ? (_allResumes.find((r) => String(r.id) === String(_editingCvId))?.stage || 'triagem')
      : 'triagem',
  };

  showLoading('Salvando currículo...');
  try {
    const cvKey = _editingCvId || cpf;
    const prev = _editingCvId ? (_allResumes.find((r) => String(r.id) === String(_editingCvId)) || {}) : {};
    row.attachments = await _collectRhAttachments(_RH_CV_FILE_FIELDS, prev.attachments, `curriculos/${cvKey}`);
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
  await _fillLeadersSelects();

  if (row) {
    row = _normalizeRhEmployeeRow(row);
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
    _setEmpRole(row.system_role || row.role || 'vendedor');
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
    await _loadEmpClubeLimite(row.user_id || null);
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
    ],
    'portaria': [
      'perm_canLoja', 'perm_canChamados', 'perm_canPainelSonhos', 'perm_canMeuExtrato',
    ],
  };

  let toCheck = [];
  if (role === 'diretoria' || role === 'desenvolvedor' || role === 'fundador' || role === 'master') {
    // Marca tudo
    checkboxes.forEach(cb => cb.checked = true);
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
  let finalRole = role;
  const prev = id ? ((window._allEmployees || []).find((e) => String(e.id) === String(id)) || {}) : {};
  if (id && prev.user_id) {
    const linked = await DB.getUser(prev.user_id, true).catch(() => null);
    const linkedRole = String(linked?.role || '').trim().toLowerCase();
    if (_RH_PROTECTED_USER_ROLES.includes(linkedRole) && role !== linkedRole) {
      finalRole = linkedRole;
      showToast(`Perfil "${_RH_ROLE_LABELS[linkedRole] || linkedRole}" preservado para este usuário.`, 'info', 6000);
    }
  }

  if (cpf.length !== 11 || !nome) {
    showToast('Preencha CPF e nome.', 'warning');
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
    cargo_id: cargoId || null,
    cargo: cargoId || null,
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
    demitido: false,
    status: 'ativo',
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
    const empKey = id || cpf;
    try {
      row.attachments = await _collectRhAttachments(_RH_EMP_FILE_FIELDS, prev.attachments, `funcionarios/${empKey}`);
    } catch (attErr) {
      console.warn('[RH] anexos ignorados:', attErr);
      row.attachments = prev.attachments || {};
    }
    let userSyncWarn = '';
    const prevUserId = prev.user_id || null;
    const prevRole = String(prev.system_role || prev.role || '').trim().toLowerCase();
    const roleChanged = !!id && prevRole && prevRole !== finalRole;
    try {
      if (password) {
        row.user_id = await _syncRhUserFromEmployee(row, password);
      } else if (email || prevUserId) {
        row.user_id = await _syncRhUserFromEmployee(row, null, { syncRole: roleChanged });
      }
    } catch (userErr) {
      console.warn('[RH] sync usuário:', userErr);
      userSyncWarn = userErr?.message || String(userErr);
    }

    const limiteClube = parseFloat(_val('emp_limite_clube')) || 0;
    let clubeWarn = '';
    if (row.user_id) {
      try {
        await _saveEmpClubeLimite(row.user_id, nome, limiteClube);
      } catch (limErr) {
        console.warn('[RH] limite clube:', limErr);
        clubeWarn = limErr?.message || String(limErr);
      }
    } else if (limiteClube > 0) {
      clubeWarn = 'Informe e-mail/senha de acesso para liberar o limite do Clube.';
    }

    await DB.saveRhEmployee(row);
    closeModalRH('funcionarioModal');
    await reloadAllData();
    if (userSyncWarn || clubeWarn) {
      const parts = [];
      if (userSyncWarn) parts.push(`Login: ${userSyncWarn}`);
      if (clubeWarn) parts.push(clubeWarn);
      showToast(`Funcionário salvo. ${parts.join(' ')}`, 'warning', 8000);
    } else {
      showToast(id ? 'Funcionário atualizado!' : 'Funcionário cadastrado!', 'success');
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
