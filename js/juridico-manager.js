/* juridico-manager.js */

async function _initJuridico() {
  try {
    await Auth.requireLogin();
  } catch (e) {
    if (e?.message === 'AUTH_REDIRECT') return;
    throw e;
  }

  await DB.init();
  const session = Auth.getSession();
  const role = String(session?.role || '').toLowerCase();

  // Permite Jurídico, Master, Gerente, RH
  const allowed = ['juridico', 'master', 'gerente', 'rh', 'diretoria', 'fundador', 'desenvolvedor'];
  if (!session || !allowed.includes(role)) {
    showToast('Acesso restrito ao módulo Jurídico.', 'error');
    setTimeout(() => { window.location.replace(Auth.employeePageHref()); }, 2000);
    return;
  }

  document.getElementById('globalLoader').style.display = 'none';
  document.getElementById('appLayout').style.display = '';

  // Configura a sessão
  document.getElementById('userName').textContent = session.name;
  document.getElementById('userRole').textContent = session.role;
  document.getElementById('topbarUserName').textContent = session.name;
  
  if (session.photo_url) {
    const html = `<img src="${_esc(session.photo_url)}" alt="Avatar"/>`;
    document.getElementById('userAvatar').innerHTML = html;
    document.getElementById('topbarAvatar').innerHTML = html;
  } else {
    const init = session.name.substring(0, 2).toUpperCase();
    document.getElementById('userAvatar').textContent = init;
    document.getElementById('topbarAvatar').textContent = init;
  }
  document.getElementById('topbarUserName').style.display = '';
  document.getElementById('topbarAvatar').style.display = '';

  // Renderiza tabs default
  switchTab('contestacao');
}

async function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  const tab = document.getElementById(`tab-${tabId}`);
  if (tab) tab.style.display = 'block';

  const nav = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (nav) nav.classList.add('active');

  const titles = {
    contestacao: 'Esteira de Contestação',
    chamados: 'Esteira de Chamados',
    punicao: 'Registro de Punições',
    demissao: 'Demissões',
  };
  document.getElementById('pageTitle').textContent = titles[tabId] || 'Painel do Jurídico';

  if (tabId === 'contestacao') {
    if (window.Contestacao) {
      try { await Contestacao.render(); } catch (e) { console.error('Erro na contestação:', e); }
    }
  } else if (tabId === 'chamados') {
    if (window.Tickets) {
      try { await Tickets.renderAdminList(); } catch (e) { console.error('Erro nos tickets:', e); }
    }
  } else if (tabId === 'punicao') {
    if (typeof renderPunicaoList === 'function') renderPunicaoList();
  } else if (tabId === 'demissao') {
    if (typeof renderDemissaoList === 'function') renderDemissaoList();
  }
}

// ───────────────────────────────────────────────
// UTIL
// ───────────────────────────────────────────────
function _esc(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>'"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[c]));
}

function navigateBack() {
  window.location.href = Auth.adminPageHrefFresh();
}

// Define reloadAllData para compatibilidade com rh-ops.js
window.reloadAllData = async function() {
  const activeTab = document.querySelector('.nav-item.active')?.dataset.tab;
  if (activeTab) switchTab(activeTab);
};

document.addEventListener('DOMContentLoaded', () => {
  _initJuridico().catch(e => {
    console.error('[Juridico] init error:', e);
    showToast('Erro ao iniciar o Painel Jurídico.', 'error');
  });
});
