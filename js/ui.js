/* =============================================
   SOU + BLU – UI Utilities
   ============================================= */

function showToast(msg, type='info', dur=3500) {
  let c = document.getElementById('toastContainer');
  if (!c) { c=document.createElement('div'); c.id='toastContainer'; document.body.appendChild(c); }
  const t=document.createElement('div');
  t.className=`toast toast-${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(()=>{ t.style.cssText='opacity:0;transform:translateX(120%);transition:.4s ease'; setTimeout(()=>t.remove(),400); },dur);
}

function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
window.openModal = openModal;
window.closeModal = closeModal;
document.addEventListener('click',e=>{ if(e.target.classList.contains('modal-overlay'))e.target.classList.remove('open'); });

/**
 * Parceiros e equipe (admin_id = parceiro): saldo em R$.
 * Colaboradores SOU+BLU internos: pontos.
 */
window._PARTNER_ROOT_USER_IDS = window._PARTNER_ROOT_USER_IDS || new Set();
window._PARTNER_NETWORK_USER_IDS = window._PARTNER_NETWORK_USER_IDS || new Set();

async function refreshPartnerRootIdsCache() {
  const rootIds = new Set();
  const networkIds = new Set();
  if (typeof DB !== 'undefined') {
    try {
      const partners = await DB.getPartners();
      (partners || []).forEach((p) => {
        if (p.user_id) rootIds.add(String(p.user_id));
      });
    } catch (_) { /* noop */ }
    try {
      const users = await DB.getAllUsers();
      (users || []).forEach((u) => {
        const role = String(u.role || '').toLowerCase();
        if (role === 'parceiro' && u.id) rootIds.add(String(u.id));
      });
      (users || []).forEach((u) => {
        if (!u?.id) return;
        const uid = String(u.id);
        if (rootIds.has(uid)) {
          networkIds.add(uid);
          return;
        }
        const aid = u.admin_id ? String(u.admin_id) : '';
        if (aid && rootIds.has(aid)) networkIds.add(uid);
      });
    } catch (_) { /* noop */ }
  }
  window._PARTNER_ROOT_USER_IDS = rootIds;
  window._PARTNER_NETWORK_USER_IDS = networkIds;
  return rootIds;
}

function isUserInPartnerNetworkSync(u) {
  if (!u) return false;
  if (String(u.role || '').toLowerCase() === 'parceiro') return true;
  const net = window._PARTNER_NETWORK_USER_IDS;
  if (net && net.has(String(u.id))) return true;
  const roots = window._PARTNER_ROOT_USER_IDS;
  if (roots && u.admin_id && roots.has(String(u.admin_id))) return true;
  return false;
}

/** Colaboradores SOU+BLU (sem vínculo com rede parceira). */
function isSouBluInternalUser(u) {
  return !!u && !isUserInPartnerNetworkSync(u);
}

function filterSouBluInternalUsers(list) {
  return (list || []).filter(isSouBluInternalUser);
}

/** Pontos BLU: só equipe interna; parceiro usa R$ na aba Parceiros. */
function canSouBluManagePoints(u) {
  return isSouBluInternalUser(u);
}

function userUsesMoneyWallet(u) {
  return isUserInPartnerNetworkSync(u);
}

function formatCurrency(n, user) {
  if (user && typeof user === 'object') {
    return userUsesMoneyWallet(user) ? formatMoney(n) : Number(n || 0).toLocaleString('pt-BR') + ' pts';
  }
  return Number(n || 0).toLocaleString('pt-BR') + ' pts';
}

function formatMoney(n) {
  const v = Number(n || 0);
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseMoneyAmount(val) {
  const s = String(val ?? '').trim().replace(/\s/g, '');
  if (!s) return 0;
  const normalized = s.includes(',') && !s.includes('.')
    ? s.replace(/\./g, '').replace(',', '.')
    : s.replace(/,(?=\d{1,2}$)/, '.');
  const n = parseFloat(normalized);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

/** Valor numérico de uma transação (MySQL pode vir string ou campo ausente). */
function txAmount(t) {
  const raw = t?.amount ?? t?.value ?? t?.points ?? 0;
  if (typeof parseMoneyAmount === 'function') {
    const p = parseMoneyAmount(raw);
    if (p > 0 || raw === 0 || raw === '0') return p;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function txIsCredit(t) {
  const ty = String(t?.type || '').toLowerCase();
  return ty === 'credit' || ty === 'credito' || ty === 'crédito';
}

function _parseWalletField(raw) {
  if (raw == null || raw === '') return null;
  const n = typeof parseMoneyAmount === 'function' ? parseMoneyAmount(raw) : Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Saldo unificado — `points` e/ou `balance` (import MySQL pode preencher só um). */
function userPts(u) {
  if (!u) return 0;
  const pts = _parseWalletField(u.points);
  const bal = _parseWalletField(u.balance);
  if (typeof userUsesMoneyWallet === 'function' && userUsesMoneyWallet(u)) {
    if (pts != null && bal != null) return Math.min(pts, bal);
    return pts != null ? pts : (bal != null ? bal : 0);
  }
  if (pts != null) return pts;
  if (bal != null) return bal;
  return 0;
}

function _siteBaseUrl() {
  const cfg = window.SOUBLU_CONFIG || {};
  let base = String(cfg.SITE_URL || '').replace(/\/+$/, '');
  if (!base) {
    try {
      const p = String(window.location.pathname || '').replace(/\\/g, '/');
      const root = /\/pages\//i.test(p)
        ? new URL('../', window.location.href).href
        : window.location.href;
      base = new URL('.', root).href.replace(/\/$/, '');
    } catch (_) {
      base = String(window.location.origin || '').replace(/\/+$/, '');
    }
  }
  return base;
}

function _escAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
}

/** Normaliza URL de foto/arquivo (Supabase, uploads local, base64). */
function resolvePhotoUrl(photo) {
  const raw = String(photo || '').trim();
  if (!raw) return '';
  if (/^data:/i.test(raw)) return raw;
  const base = _siteBaseUrl();
  if (/^(?:\/)?api\/(?:file|attachment-proxy)\.php/i.test(raw)) {
    if (/attachment-proxy\.php/i.test(raw)) {
      try {
        const u = new URL(raw, base + '/');
        const p = u.searchParams.get('path');
        if (p) {
          return `${base}/api/file.php?path=${encodeURIComponent(decodeURIComponent(p))}`;
        }
      } catch (_) { /* segue */ }
    }
    return /^https?:\/\//i.test(raw) ? raw : `${base}${raw.startsWith('/') ? raw : '/' + raw}`;
  }
  if (/^https?:\/\//i.test(raw)) {
    if (/attachment-proxy\.php/i.test(raw)) {
      try {
        const p = new URL(raw, window.location.origin).searchParams.get('path');
        if (p) {
          const base = String((window.SOUBLU_CONFIG && window.SOUBLU_CONFIG.SITE_URL) || window.location.origin || '').replace(/\/+$/, '');
          return `${base}/api/file.php?path=${encodeURIComponent(decodeURIComponent(p))}`;
        }
      } catch (_) { /* segue */ }
    }
    if (/supabase\.co\/storage/i.test(raw)) {
      const m = raw.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/i);
      if (m) {
        const base = String((window.SOUBLU_CONFIG && window.SOUBLU_CONFIG.SITE_URL) || window.location.origin || '').replace(/\/+$/, '');
        return `${base}/api/file.php?path=${encodeURIComponent(m[1] + '/' + m[2])}`;
      }
    }
    const up = raw.match(/\/uploads\/([^?#]+)/i);
    if (up) {
      const base = String((window.SOUBLU_CONFIG && window.SOUBLU_CONFIG.SITE_URL) || window.location.origin || '').replace(/\/+$/, '');
      return `${base}/api/file.php?path=${encodeURIComponent(up[1])}`;
    }
    return raw;
  }
  const rel = raw.replace(/^\.\//, '').replace(/^\//, '');
  if (/^uploads\//i.test(rel)) {
    const base = String((window.SOUBLU_CONFIG && window.SOUBLU_CONFIG.SITE_URL) || window.location.origin || '').replace(/\/+$/, '');
    const path = rel.replace(/^uploads\//i, '');
    return `${base}/api/file.php?path=${encodeURIComponent(path)}`;
  }
  const storageBuckets = 'profile-photos|product-images|partner-docs|ticket-docs|sonhos|misc|proposal-attachments|finance-docs|tim-docs|contestacao-docs|whatsapp-media';
  if (new RegExp(`^(${storageBuckets})/`, 'i').test(rel)) {
    const base = String((window.SOUBLU_CONFIG && window.SOUBLU_CONFIG.SITE_URL) || window.location.origin || '').replace(/\/+$/, '');
    return `${base}/api/file.php?path=${encodeURIComponent(rel)}`;
  }
  if (typeof window.soubluAsset === 'function') return window.soubluAsset(rel);
  return raw;
}
window.resolvePhotoUrl = resolvePhotoUrl;
window.resolveFileUrl = resolvePhotoUrl;

async function verifyFileServeUrl(serveUrl) {
  const u = String(serveUrl || '').trim();
  if (!u || !/file\.php/i.test(u)) return '';
  try {
    const checkUrl = u + (u.includes('?') ? '&' : '?') + 'check=1';
    const res = await fetch(checkUrl, { cache: 'no-store', credentials: 'same-origin' });
    const j = await res.json().catch(() => ({}));
    if (j && j.ok && j.serve_url) return j.serve_url;
  } catch (_) { /* noop */ }
  return '';
}

async function openAttachmentUrl(rawUrl) {
  let url = typeof resolvePhotoUrl === 'function' ? resolvePhotoUrl(rawUrl) : String(rawUrl || '').trim();
  if (!url) {
    showToast('Anexo indisponível.', 'warning');
    return;
  }
  if (/file\.php/i.test(url)) {
    const verified = await verifyFileServeUrl(url);
    if (verified) {
      url = verified;
    } else {
      try {
        const checkUrl = url + (url.includes('?') ? '&' : '?') + 'check=1';
        const res = await fetch(checkUrl, { cache: 'no-store', credentials: 'same-origin' });
        const j = await res.json().catch(() => ({}));
        if (!j || !j.ok) {
          showToast('Arquivo não encontrado no servidor. Envie o documento novamente.', 'warning');
          return;
        }
        if (j.serve_url) url = j.serve_url;
      } catch (_) {
        showToast('Não foi possível abrir o anexo.', 'warning');
        return;
      }
    }
  } else if (/supabase\.co\/storage/i.test(url)) {
    url = `${_siteBaseUrl()}/api/file.php?fetch_url=${encodeURIComponent(url)}`;
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
window.openAttachmentUrl = openAttachmentUrl;
window.verifyFileServeUrl = verifyFileServeUrl;

function partnerAttachmentLinkHtml(url, label = 'Ver anexo') {
  const resolved = typeof resolvePhotoUrl === 'function' ? resolvePhotoUrl(url) : String(url || '').trim();
  if (!resolved) return '';
  const safe = _escAttr(resolved);
  return `<a href="${safe}" target="_blank" rel="noopener noreferrer" `
    + `onclick="event.stopPropagation(); openAttachmentUrl(this.getAttribute('href')); return false;">${_escAttr(label)}</a>`;
}
window.partnerAttachmentLinkHtml = partnerAttachmentLinkHtml;

/** Avatar com fallback para iniciais quando a URL da foto falha. */
function profileAvatarHtml(name, photo, extraClass, onClickAttr) {
  const cls = `profile-avatar${extraClass ? ' ' + extraClass : ''}`;
  const click = onClickAttr ? ` onclick="${onClickAttr}"` : '';
  const src = typeof resolvePhotoUrl === 'function' ? resolvePhotoUrl(photo) : String(photo || '').trim();
  if (src) {
    const safe = String(src).replace(/"/g, '&quot;');
    const ini = getInitials(name);
    const bg = avatarColor(name);
    return `<img src="${safe}" class="${cls}" style="object-fit:cover;cursor:pointer;"${click} onerror="this.outerHTML='<div class=\\'${cls}\\' style=\\'background:${bg};cursor:pointer;\\'>${ini}</div>'">`;
  }
  return `<div class="${cls}" style="background:${avatarColor(name)};cursor:pointer;"${click}>${getInitials(name)}</div>`;
}
window.profileAvatarHtml = profileAvatarHtml;

/** Sidebar avatar — resolve URL e volta para iniciais se a imagem não carregar. */
function applySidebarAvatar(el, name, photo) {
  if (!el) return;
  const src = typeof resolvePhotoUrl === 'function' ? resolvePhotoUrl(photo) : String(photo || '').trim();
  el.style.backgroundImage = '';
  el.style.backgroundSize = '';
  el.style.backgroundPosition = '';
  if (!src) {
    el.style.background = avatarColor(name);
    el.textContent = getInitials(name);
    return;
  }
  el.textContent = '';
  const probe = new Image();
  probe.onload = () => {
    el.style.background = 'transparent';
    el.style.backgroundImage = `url(${src})`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
  };
  probe.onerror = () => {
    el.style.backgroundImage = '';
    el.style.background = avatarColor(name);
    el.textContent = getInitials(name);
};
  probe.src = src;
}
window.applySidebarAvatar = applySidebarAvatar;

function userWalletBalance(u) { return userPts(u); }

window.txAmount = txAmount;
window.txIsCredit = txIsCredit;

const PROFILE_SACAR_ROLES = [
  'vendedor', 'employee', 'backoffice', 'supervisor', 'parceiro',
  'desenvolvedor', 'master', 'fundador', 'gerente', 'gerencia', 'admin',
  'financeiro', 'financial', 'rh', 'operacional', 'sup_backoffice',
  'juridico', 'diretoria', 'ouvidoria',
];

/** Na rede parceira, só estes cargos solicitam saque PIX (saldo individual). */
const PARTNER_TEAM_SACAR_ROLES = ['vendedor', 'backoffice', 'operacional', 'sup_backoffice'];

function _parsePartnerJsonField(raw) {
  if (typeof PartnerPerms !== 'undefined' && typeof PartnerPerms._parseJsonField === 'function') {
    return PartnerPerms._parseJsonField(raw);
  }
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) || {}; } catch { return {}; }
  }
  return {};
}

/** Saque PIX sem biometria facial (desativado em produção). */
function withdrawalSkipsFacialVerification(user) {
  void user;
  return true;
}

async function userCanSacarPix(user) {
  const u = user || (typeof currentUser !== 'undefined' ? currentUser : null);
  if (!u?.id || u.active === false) return false;
  if (!PROFILE_SACAR_ROLES.includes(u.role)) return false;

  if (typeof PartnerPerms === 'undefined' || typeof DB === 'undefined') return true;

  /** Gestor parceiro (role parceiro): respeita módulo sacar_pix do cadastro. */
  if (u.role === 'parceiro') {
    let perms = typeof window !== 'undefined' ? window._PARTNER_PERMS : null;
    if (!perms) {
      const prt = await DB.getPartnerByUserId(u.id).catch(() => null);
      perms = prt?.permissions;
    }
    return PartnerPerms.can(perms, 'sacar_pix');
  }

  let partnerRootId = null;
  try {
    partnerRootId = await DB.getPartnerRootForUser(u.id);
  } catch (_) { /* noop */ }

  if (partnerRootId) {
    const r = String(u.role || '').toLowerCase();
    if (!PARTNER_TEAM_SACAR_ROLES.includes(r)) return false;
    let prt = await DB.getPartnerByUserId(partnerRootId).catch(() => null);
    if (prt && typeof PartnerPerms.ensureTeamSacarForFundedMember === 'function') {
      prt = await PartnerPerms.ensureTeamSacarForFundedMember(u, prt);
    }
    const meta = _parsePartnerJsonField(prt?.meta);
    let perms = typeof window !== 'undefined' ? window._PARTNER_PERMS : null;
    if (!perms || (window.PARTNER_ROOT_ID && String(window.PARTNER_ROOT_ID) !== String(partnerRootId))) {
      perms = prt?.permissions;
    }
    if (typeof PartnerPerms !== 'undefined') {
      return PartnerPerms.canForStaff(perms, u.role, 'sacar_pix', meta);
    }
    return false;
  }

  return true;
}

async function isUserInPartnerOrg(user) {
  const u = user || (typeof currentUser !== 'undefined' ? currentUser : null);
  if (!u) return false;
  if (u.role === 'parceiro') return true;
  if (!u.admin_id) return false;
  try {
    const sup = await DB.getUser(u.admin_id);
    return sup?.role === 'parceiro';
  } catch (_) {
    return false;
  }
}

/** Ícones SVG padronizados da sidebar (18px, stroke branco via currentColor). */
const _NAV_ICON_PATHS = {
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>',
  bank: '<line x1="3" y1="22" x2="21" y2="22"></line><line x1="6" y1="18" x2="6" y2="11"></line><line x1="10" y1="18" x2="10" y2="11"></line><line x1="14" y1="18" x2="14" y2="11"></line><line x1="18" y1="18" x2="18" y2="11"></line><polygon points="12 2 20 7 4 7"></polygon>',
  wallet: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><path d="M9 22v-4h6v4"></path><line x1="8" y1="6" x2="8" y2="6"></line><line x1="12" y1="6" x2="12" y2="6"></line><line x1="16" y1="6" x2="16" y2="6"></line><line x1="8" y1="10" x2="8" y2="10"></line><line x1="12" y1="10" x2="12" y2="10"></line><line x1="16" y1="10" x2="16" y2="10"></line><line x1="8" y1="14" x2="8" y2="14"></line><line x1="12" y1="14" x2="12" y2="14"></line><line x1="16" y1="14" x2="16" y2="14"></line>',
  cart: '<circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>',
  grid: '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>',
  package: '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>',
  receipt: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line>',
  scale: '<path d="M12 3v18"></path><path d="M5 7h14"></path><path d="M5 7l-3 7h6L5 7z"></path><path d="M19 7l-3 7h6l-3-7z"></path>',
  send: '<line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>',
  list: '<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>',
  chart: '<line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>',
  roulette: '<circle cx="12" cy="12" r="10"></circle><path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path><circle cx="12" cy="12" r="3"></circle>',
  soccer: '<circle cx="12" cy="12" r="10"></circle><path d="M12 5.2l2.4 1.9 1.4 4.1H8.2l1.4-4.1L12 5.2z"></path><line x1="12" y1="5.2" x2="8.4" y2="7.8"></line><line x1="12" y1="5.2" x2="15.6" y2="7.8"></line><line x1="8.2" y1="11.2" x2="5.2" y2="13.8"></line><line x1="15.8" y1="11.2" x2="18.8" y2="13.8"></line><line x1="9.4" y1="11.2" x2="12" y2="17.5"></line><line x1="14.6" y1="11.2" x2="12" y2="17.5"></line>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
};

function navIconSvg(name) {
  const paths = _NAV_ICON_PATHS[name] || _NAV_ICON_PATHS.chart;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

function navIconHtml(name) {
  return `<span class="nav-icon">${navIconSvg(name)}</span>`;
}

window.navIconSvg = navIconSvg;
window.navIconHtml = navIconHtml;

function formatPoints(n, user) {
  return formatCurrency(n, user);
}
function formatCoins(n) { return formatCurrency(n); }
window.formatMoney = formatMoney;
window.parseMoneyAmount = parseMoneyAmount;
window.userWalletBalance = userWalletBalance;
window.PROFILE_SACAR_ROLES = PROFILE_SACAR_ROLES;
window.userCanSacarPix = userCanSacarPix;
window._parsePartnerJsonField = _parsePartnerJsonField;
window.withdrawalSkipsFacialVerification = withdrawalSkipsFacialVerification;
window.isUserInPartnerOrg = isUserInPartnerOrg;
window.refreshPartnerRootIdsCache = refreshPartnerRootIdsCache;
window.isUserInPartnerNetworkSync = isUserInPartnerNetworkSync;
window.userUsesMoneyWallet = userUsesMoneyWallet;
window.isSouBluInternalUser = isSouBluInternalUser;
window.filterSouBluInternalUsers = filterSouBluInternalUsers;
window.canSouBluManagePoints = canSouBluManagePoints;
function formatDate(iso) { return new Date(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}); }
function formatDateTime(iso) { return new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
function timeAgo(iso) {
  const d=Date.now()-new Date(iso).getTime(), m=Math.floor(d/60000);
  if(m<1)return'agora'; if(m<60)return`há ${m}min`;
  const h=Math.floor(m/60); if(h<24)return`há ${h}h`; return`há ${Math.floor(h/24)}d`;
}

function getInitials(name='') { return name.trim().split(' ').filter(Boolean).slice(0,2).map(n=>n[0]).join('').toUpperCase(); }
const AV_COLORS=['#FF6900','#e91e8c','#2563eb','#00b341','#7c3aed','#059669','#dc2626','#d97706'];
function avatarColor(name='') { let h=0; for(const c of name)h=c.charCodeAt(0)+((h<<5)-h); return AV_COLORS[Math.abs(h)%AV_COLORS.length]; }
/** Ícones line (mesmo estilo da sidebar) para cards de estatística. */
const _STAT_SVG = {
  users: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  balance: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
  products: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
  orders: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  clients: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  proposals: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  partners: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  billing: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  chart: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  calendar: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  trophy: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>',
  withdrawals: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
  trendUp: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  trendDown: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>',
  feedback: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
};

function statIconHtml(icon, colorClass = 'blue') {
  const svg = _STAT_SVG[icon] || _STAT_SVG.chart;
  return `<div class="stat-icon ${colorClass}">${svg}</div>`;
}

function statCardHtml({ icon, color = 'blue', label, value, sub = '', valueStyle = '' }) {
  const vs = valueStyle ? ` style="${valueStyle}"` : '';
  const subHtml = sub !== '' && sub != null ? `<div class="stat-sub">${sub}</div>` : '';
  return `<div class="stat-card">${statIconHtml(icon, color)}<div class="stat-info"><div class="stat-label">${label}</div><div class="stat-value"${vs}>${value}</div>${subHtml}</div></div>`;
}

function statKpiHtml({ icon, colorClass, label, value, valueColor, valueStyle }) {
  const vs = valueStyle ? valueStyle : 'font-size:16px;font-weight:800;font-family:var(--font-display);';
  return `<div class="stat-card" style="padding:14px 12px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:4px;">${statIconHtml(icon, colorClass)}<div style="font-size:10px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.04em;">${label}</div><div style="${vs}color:${valueColor || 'var(--color-text)'};">${value}</div></div>`;
}

window.statIconHtml = statIconHtml;
window.statCardHtml = statCardHtml;
window.statKpiHtml = statKpiHtml;

function avatarHtml(name,size='',photo='') {
  const src = typeof resolvePhotoUrl === 'function' ? resolvePhotoUrl(photo) : photo;
  if(src) {
    const safe = String(src).replace(/"/g, '&quot;');
    return `<img src="${safe}" class="avatar ${size}" style="object-fit:cover;border-radius:50%;" loading="lazy" onerror="this.outerHTML='<div class=\\'avatar ${size}\\' style=\\'background:${avatarColor(name)}\\'>${getInitials(name)}</div>'">`;
  }
  return `<div class="avatar ${size}" style="background:${avatarColor(name)}">${getInitials(name)}</div>`;
}

function productThumb(p) {
  const src = p.image_url || p.imageBase64 || '';
  if(src) return `<img src="${src}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='<span style=\\'font-size:52px\\'>${p.emoji||'🎁'}</span>'">`;
  return `<span style="font-size:52px;line-height:1">${p.emoji||'🎁'}</span>`;
}

const ORDER_STATUS={pendente:{label:'Pendente',cls:'badge-warning'},aprovado:{label:'Aprovado',cls:'badge-info'},enviado:{label:'Enviado',cls:'badge-accent'},entregue:{label:'Entregue',cls:'badge-success'},cancelado:{label:'Cancelado',cls:'badge-danger'}};
function orderStatusBadge(s){const st=ORDER_STATUS[s]||{label:s,cls:'badge-muted'};return`<span class="badge ${st.cls}">${st.label}</span>`;}

const WD_STATUS={
  solicitado:{label:'Solicitado',cls:'badge-warning'},
  aprovado_master:{label:'Aguard. Financeiro',cls:'badge-info'},
  aprovado_financeiro:{label:'Aguard. Master',cls:'badge-info'},
  aprovado:{label:'Aprovado',cls:'badge-info'},
  processando:{label:'Processando',cls:'badge-accent'},
  pago:{label:'Pago',cls:'badge-success'},
  rejeitado:{label:'Rejeitado',cls:'badge-danger'},
};
function wdStatusBadge(s){const st=WD_STATUS[s]||{label:s,cls:'badge-muted'};return`<span class="badge ${st.cls}">${st.label}</span>`;}

/** Status do PIX no banco/Efi (coluna ao lado do status interno do saque). */
const PIX_WD_STATUS={
  aguardando:{label:'Aguardando envio',cls:'badge-muted',icon:'⏳'},
  processando:{label:'Processando no banco',cls:'badge-accent',icon:'🔄'},
  pago:{label:'Confirmado pelo banco',cls:'badge-success',icon:'✅'},
  erro:{label:'Recusado pelo banco',cls:'badge-danger',icon:'❌'},
  estornado:{label:'Estornado / devolvido',cls:'badge-warning',icon:'↩️'},
};
function _resolvePixWdStatus(wd){
  if(!wd)return'aguardando';
  if(wd.status==='rejeitado')return'estornado';
  const ps=String(wd.pix_status||'').toLowerCase();
  const hasE2e=!!(wd.pix_e2e_id&&String(wd.pix_e2e_id).trim());
  const bankConfirmed=ps==='pago'||ps==='realizado'||ps==='concluido'||ps==='concluído';
  /* Confirmado pelo banco só com retorno Efi (pix_status + E2E), nunca só por aprovação interna. */
  if(bankConfirmed&&hasE2e)return'pago';
  if(bankConfirmed&&!hasE2e)return'processando';
  if(ps==='erro'||ps==='rejeitado'||ps==='nao_realizado'||ps==='cancelado')return'erro';
  if(ps==='estornado'||ps==='devolvido')return'estornado';
  if(ps==='processando'||ps==='em_processamento')return'processando';
  if(wd.status==='erro')return'erro';
  if(wd.approved_by_master&&wd.approved_by_financial)return'processando';
  return'aguardando';
}
function pixWdStatusBadge(wd){
  const key=_resolvePixWdStatus(wd);
  const st=PIX_WD_STATUS[key]||{label:key,cls:'badge-muted',icon:'•'};
  const err=wd?.pix_error?`<div style="font-size:10px;color:var(--color-danger);margin-top:4px;max-width:140px;line-height:1.3;" title="${String(wd.pix_error).replace(/"/g,'&quot;')}">${String(wd.pix_error).slice(0,80)}${String(wd.pix_error).length>80?'…':''}</div>`:'';
  const e2e=wd?.pix_e2e_id?`<div style="font-size:10px;color:var(--color-text-muted);margin-top:2px;" title="End-to-end ID">E2E: …${String(wd.pix_e2e_id).slice(-8)}</div>`:'';
  return`<div style="min-width:120px;"><span class="badge ${st.cls}">${st.icon} ${st.label}</span>${e2e}${err}</div>`;
}
function canDownloadWdReceipt(wd){
  if(!wd)return false;
  if(wd.status==='rejeitado')return false;
  const e2e=String(wd.pix_e2e_id||'').trim();
  if(!e2e||/^mock/i.test(e2e))return false;
  return _resolvePixWdStatus(wd)==='pago';
}
function downloadWithdrawalReceipt(wd,emp){
  if(!wd){showToast('Saque não encontrado.','error');return;}
  const pts=Number(wd.amount||0);
  const moneyWd = typeof userUsesMoneyWallet === 'function' && userUsesMoneyWallet(emp);
  const brl = moneyWd
    ? pts.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})
    : (pts*(window.POINTS_TO_BRL||1)).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const paidAt=wd.pix_paid_at||wd.processed_at||wd.financial_approved_at||wd.master_approved_at||wd.created_at;
  const html=`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Comprovante PIX — ${wd.id}</title>
<style>
  body{font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:32px auto;padding:24px;color:#111}
  h1{font-size:18px;margin:0 0 4px} .sub{color:#666;font-size:13px;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;font-size:14px} td{padding:8px 0;border-bottom:1px solid #eee;vertical-align:top}
  td:first-child{color:#666;width:42%} .amt{font-size:22px;font-weight:800;color:#00b341}
  .foot{margin-top:24px;font-size:11px;color:#888;line-height:1.5}
  @media print{body{margin:0}}
</style></head><body>
  <h1>SOU + BLU — Comprovante de saque PIX</h1>
  <div class="sub">Referência interna: ${wd.id}</div>
  <table>
    <tr><td>Beneficiário</td><td><strong>${emp?.name||'—'}</strong>${emp?.matricula?`<br><small>Mat. ${emp.matricula}</small>`:''}</td></tr>
    <tr><td>Valor</td><td class="amt">${moneyWd ? `💰 R$ ${brl}` : `🪙 ${pts.toLocaleString('pt-BR')} pts<br><small>≈ R$ ${brl}</small>`}</td></tr>
    <tr><td>Chave PIX</td><td>${(wd.pix_key_type||'').toUpperCase()} — ${wd.pix_key||'—'}<br><small>${wd.holder_name||''}</small></td></tr>
    <tr><td>Status interno</td><td>${WD_STATUS[wd.status]?.label||wd.status||'—'}</td></tr>
    <tr><td>Status banco</td><td>${PIX_WD_STATUS[_resolvePixWdStatus(wd)]?.label||'—'}</td></tr>
    <tr><td>ID envio Efi</td><td>${wd.pix_id_envio||'—'}</td></tr>
    <tr><td>End-to-end (E2E)</td><td style="word-break:break-all">${wd.pix_e2e_id||'—'}</td></tr>
    <tr><td>Solicitado em</td><td>${wd.created_at?new Date(wd.created_at).toLocaleString('pt-BR'):'—'}</td></tr>
    <tr><td>Pago / processado</td><td>${paidAt?new Date(paidAt).toLocaleString('pt-BR'):'—'}</td></tr>
    <tr><td>Aprovação Master</td><td>${wd.approved_by_master?'Sim':'Não'}${wd.master_approved_at?` — ${new Date(wd.master_approved_at).toLocaleString('pt-BR')}`:''}</td></tr>
    <tr><td>Aprovação Financeiro</td><td>${wd.approved_by_financial?'Sim':'Não'}${wd.financial_approved_at?` — ${new Date(wd.financial_approved_at).toLocaleString('pt-BR')}`:''}</td></tr>
  </table>
  <div class="foot">Documento gerado pelo sistema SOU + BLU em ${new Date().toLocaleString('pt-BR')}. 
  Comprovante administrativo — confira também o extrato Efi/bancário oficial quando disponível.</div>
  <script>window.onload=function(){window.print();}<\/script>
</body></html>`;
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`comprovante-pix-${wd.id}.html`;
  a.target='_blank';
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},500);
}
window.pixWdStatusBadge=pixWdStatusBadge;
window.canDownloadWdReceipt=canDownloadWdReceipt;
window.downloadWithdrawalReceipt=downloadWithdrawalReceipt;

function txTypeIcon(type){return{credit:'📈',debit:'💸',withdrawal:'🏦',purchase:'🛒'}[type]||'';}

/** Valores em R$ no ranking de vendas — master, fundador e gerência (filtros período/status/fase). */
function canViewRankingSalesValues(user) {
  if (typeof Auth !== 'undefined' && typeof Auth.isMaster === 'function' && Auth.isMaster()) {
    return true;
  }
  const u = user || (typeof Auth !== 'undefined' ? Auth.getSession() : null);
  const r = String(u?.role || '').toLowerCase();
  return ['master', 'fundador', 'gerente', 'gerencia', 'admin', 'rh', 'financeiro', 'financial', 'sup_backoffice'].includes(r);
}
window.canViewRankingSalesValues = canViewRankingSalesValues;

/** Só vendedor participa do ranking de vendas. */
function participatesInVendorRanking(role) {
  return String(role || '').toLowerCase() === 'vendedor';
}

/** Colaboradores que aparecem no ranking (vendedor + employee de campo). Parceiros e rede ficam de fora. */
function isRankingParticipant(userOrRole) {
  if (userOrRole && typeof userOrRole === 'object') {
    if (userOrRole.active === false) return false;
    if (isUserInPartnerNetworkSync(userOrRole)) return false;
    return isRankingParticipant(userOrRole.role);
  }
  const r = String(userOrRole || '').toLowerCase();
  if (r === 'parceiro') return false;
  return true;
}

/** Supervisor dono da equipe no ranking (próprio id se for supervisor). */
function rankingTeamSupervisorId(user) {
  if (!user) return null;
  const role = String(user.role || '').toLowerCase();
  if (role === 'supervisor' || role === 'sup_backoffice') return user.id;
  return user.admin_id || null;
}

/** Mesma equipe de vendas no ranking (por admin_id = id do supervisor). */
function isSameRankingTeam(viewer, candidate) {
  if (!viewer || !candidate) return false;
  if (!isRankingParticipant(candidate)) return false;
  if (candidate.id === viewer.id) return true;
  const teamSup = rankingTeamSupervisorId(viewer);
  if (!teamSup) return false;
  return candidate.admin_id === teamSup;
}

/**
 * Extrai texto resumido de `transactions.meta` (auditoria de bonificação).
 * Aceita objeto já parseado (Supabase JSON) ou string JSON legacy.
 */
function formatTransactionMetaLine(metaRaw) {
  if (metaRaw == null || metaRaw === '') return '';
  try {
    const m = typeof metaRaw === 'string' ? JSON.parse(metaRaw) : metaRaw;
    if (!m || typeof m !== 'object') return '';
    if (m.kind === 'bonus_vendedor') {
      const parts = [];
      if (m.valor_liquido_reais != null && Number.isFinite(Number(m.valor_liquido_reais))) {
        parts.push(`Líq. R$ ${Number(m.valor_liquido_reais).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      }
      if (m.faixa_id) {
        parts.push(`${m.faixa_id} → ${Number(m.pontos_tabela || 0).toLocaleString('pt-BR')} pts`);
      }
      const ex = Number(m.pontos_extra || 0);
      if (ex > 0) parts.push(`+ ${ex.toLocaleString('pt-BR')} pts extras`);
      return parts.join(' · ');
    }
    if (m.kind === 'roleta_premiada') {
      const rw = Number(m.reward_points || 0);
      const total = Number(m.possibilities_total || 0);
      const rwTxt = `${rw.toLocaleString('pt-BR')} ${rw === 1 ? 'moeda' : 'moedas'}`;
      if (total > 0) return `🎰 Roleta: ${rwTxt} (${total} possibilidades)`;
      return `🎰 Roleta: ${rwTxt}`;
    }
    if (m.kind === 'roleta_moeda_credit') {
      const coins = Number(m.coins || 0);
      const crit = String(m.criteria_key || '').replace(/_/g, ' ');
      return `🪙 +${coins.toLocaleString('pt-BR')} moedas (${crit || 'critério'})`;
    }
    if (m.kind === 'roleta_giro_custo') {
      const coins = Number(m.coins || 0);
      return `🎰 Giro da roleta (−${coins.toLocaleString('pt-BR')} moeda${coins === 1 ? '' : 's'})`;
    }
    if (m.kind === 'estorno_saque_rejeitado') return '🔄 Estorno de saque devolvido';
    if (m.kind === 'credito_manual' && m.origin === 'painel_rapido') return '⚡ Painel rápido de pontos';
    return '';
  } catch (e) { return ''; }
}
/** Ações executam direto — sem popup de confirmação */
window.confirm = function() { return true; };
function confirmAction(msg, cb) { cb(); }

function initSidebarToggle() {
  const sb=document.getElementById('sidebar'),ma=document.getElementById('mainArea'),btn=document.getElementById('sidebarToggle');
  if(!sb||!ma)return; btn?.addEventListener('click',()=>{sb.classList.toggle('collapsed');ma.classList.toggle('collapsed');});
}
function initNav() { document.querySelectorAll('[data-section]').forEach(wireNavButton); }
function wireNavButton(b) {
  if (!b || b.dataset.navWiredUi) return;
  b.dataset.navWiredUi = '1';
  b.addEventListener('click', () => navigateTo(b.dataset.section));
}
window.wireNavButton = wireNavButton;
function navigateTo(id) {
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  const nav=document.querySelector(`[data-section="${id}"]`); nav?.classList.add('active');
  const title=nav?.querySelector('.nav-label')?.textContent||'';
  const tb=document.getElementById('topbarTitle'); if(tb&&title)tb.textContent=title;
}
function updateCartBadge(n){const b=document.getElementById('cartBadge');if(!b)return;b.textContent=n;b.style.display=n>0?'inline':'none';}
function togglePassword(id,btn){const i=document.getElementById(id);if(!i)return;i.type=i.type==='password'?'text':'password';btn.textContent=i.type==='password'?'👁':'🙈';}
function fileToBase64(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.onerror=()=>rej(new Error('Erro'));r.readAsDataURL(file);});}

const _UPLOAD_DOC_BUCKETS = new Set([
  'partner-docs', 'ticket-docs', 'tim-docs', 'contestacao-docs', 'finance-docs',
  'rh-demissao', 'rh-justificativa', 'rh-docs', 'monitoria-atendimento', 'partner-nf',
]);

function _isInlineAttachmentUrl(url) {
  const s = String(url || '').trim();
  return s.startsWith('data:') || s.startsWith('blob:');
}

/* Upload: Hostinger (api/upload.php), Supabase Storage ou Base64 */
async function uploadImage(file, bucket = 'product-images', subPath = '') {
  if (!file) throw new Error('Arquivo inválido');
  const extRaw = (file.name && file.name.includes('.')) ? file.name.split('.').pop() : 'jpg';
  const ext = String(extRaw).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'jpg';
  const folder = subPath ? String(subPath).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) : '';
  const path = _UPLOAD_DOC_BUCKETS.has(bucket)
    ? folder
    : (folder ? `${folder}/img_${Date.now()}.${ext}` : `img_${Date.now()}.${ext}`);

  const _cfg = typeof window !== 'undefined' && window.SOUBLU_CONFIG ? window.SOUBLU_CONFIG : {};
  const hostingerUp = String(_cfg.DB_BACKEND || '').toLowerCase() === 'hostinger' && _cfg.UPLOAD_URL && _cfg.API_KEY;
  if (bucket === 'proposal-attachments') {
    throw new Error('Use DB.uploadProposalFile para anexos de proposta.');
  }
  if (hostingerUp) {
    try {
      const fd = new FormData();
      fd.append('file', file);
      const q = new URLSearchParams({ bucket, path });
      const res = await fetch(`${_cfg.UPLOAD_URL}?${q}`, {
        method: 'POST',
        headers: { 'X-API-Key': _cfg.API_KEY },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) return data.url;
      const errMsg = data.error || `HTTP ${res.status}`;
      console.warn('[uploadImage hostinger]', bucket, errMsg);
      if (_UPLOAD_DOC_BUCKETS.has(bucket)) {
        throw new Error(`Falha ao enviar documento: ${errMsg}`);
      }
    } catch (e) {
      console.warn('[uploadImage hostinger]', e.message || e);
      if (_UPLOAD_DOC_BUCKETS.has(bucket)) {
        throw e instanceof Error ? e : new Error('Falha ao enviar documento ao servidor.');
      }
    }
  }

  if (SUPABASE_CONFIGURED && typeof SUPABASE_URL !== 'undefined') {
    try {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': file.type || 'image/jpeg',
          'x-upsert': 'true',
        },
        body: file,
      });
      if (res.ok) {
        return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
      }
      console.warn('[uploadImage]', bucket, res.status, await res.text().catch(() => ''));
    } catch (e) {
      console.warn('[uploadImage]', e.message || e);
    }
  }
  if (_UPLOAD_DOC_BUCKETS.has(bucket)) {
    throw new Error('Upload de documento indisponível. Recarregue a página (Ctrl+F5) e tente novamente.');
  }
  return await fileToBase64(file);
}

/** Atualiza avatar e nome na sidebar do painel admin. */
function renderAdminSidebar(user) {
  if (!user) return;
  const nameEl = document.getElementById('adminName');
  const roleEl = document.getElementById('roleLabel');
  const av = document.getElementById('sidebarAvatar');
  const role = String(user.role || '').trim().toLowerCase();
  if (nameEl) nameEl.textContent = user.name || 'Usuário';
  if (roleEl) {
    const labels = {
      fundador: 'Fundador', master: 'Master', desenvolvedor: 'Desenvolvimento',
      gerente: 'Gerente', gerencia: 'Gerência', admin: 'Administrador',
      financeiro: 'Financeiro', financial: 'Financeiro', supervisor: 'Supervisor',
      sup_backoffice: 'Sup. Backoffice', backoffice: 'Backoffice', rh: 'RH',
      operacional: 'Operacional', juridico: 'Jurídico', diretoria: 'Diretoria',
      ouvidoria: 'Ouvidoria', parceiro: 'Parceiro', vendedor: 'Vendedor', portaria: 'Portaria',
    };
    roleEl.textContent = labels[role] || (role ? role : 'Gestor');
  }
  if (!av) return;
  const photo = typeof resolvePhotoUrl === 'function'
    ? resolvePhotoUrl(user.photo_url || user.photo || '')
    : String(user.photo_url || user.photo || '').trim();
  if (photo) {
    av.style.background = 'transparent';
    av.textContent = '';
    av.innerHTML = `<img alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;">`;
    const img = av.querySelector('img');
    if (img) {
      img.src = photo;
      img.onerror = () => {
        av.innerHTML = '';
        av.style.background = avatarColor(user.name);
        av.textContent = getInitials(user.name);
      };
    }
  } else {
    av.innerHTML = '';
    av.style.backgroundImage = '';
    av.style.background = avatarColor(user.name);
    av.textContent = getInitials(user.name);
  }
}
window.renderAdminSidebar = renderAdminSidebar;

/* Loader global */
function showLoading(msg='Carregando...') {
  let el = document.getElementById('globalLoader');
  if (!el) {
    el = document.createElement('div');
    el.id = 'globalLoader';
    el.className = 'loader-overlay';
    el.innerHTML = `<div class="loader-spinner"></div><p class="loader-text">${msg}</p>`;
    document.body.appendChild(el);
  } else {
    el.style.display = 'flex';
    const p = el.querySelector('.loader-text, p');
    if (p && msg) p.textContent = msg;
  }
}
function hideLoading() {
  const el = document.getElementById('globalLoader');
  if (el) el.style.display = 'none';
}
window.showLoading = showLoading;
window.hideLoading = hideLoading;

/* PIX key mask */
function formatPixKey(type, value) {
  if(type==='cpf')   return value.replace(/\D/g,'').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
  if(type==='phone') return value.replace(/\D/g,'').replace(/(\d{2})(\d{5})(\d{4})/,'($1) $2-$3');
  return value;
}
