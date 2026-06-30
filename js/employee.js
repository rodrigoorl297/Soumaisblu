/* =============================================
   SOU + BLU – Employee Dashboard (async)
   ============================================= */

const _DB_LOAD_ERROR =
  'Scripts da camada de dados não carregaram (ex.: js/db.js). Pressione F12 → Rede e Console: verifique 404 ou erros em js/db.js e js/config.js e atualize com Ctrl+F5. Abrir arquivo direto no disco exige servidor local ou publicação (ex.: soumaisblu.com.br).';

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

/** Parceiro/equipe: sem loja, pedidos da loja, reuniões nem ranking */
function _applyPartnerEmployeeUI() {
  const hideNav = ['secStore', 'secOrders', 'secMeetings', 'secRanking'];
  hideNav.forEach(id => {
    document.querySelectorAll(`.nav-item[data-section="${id}"]`).forEach(el => {
      el.style.display = 'none';
    });
    const sec = document.getElementById(id);
    if (sec) {
      sec.style.display = 'none';
      sec.classList.remove('active');
    }
  });

  document.querySelector('.topbar-search')?.style.setProperty('display', 'none');
  document.querySelectorAll('.topbar-actions button').forEach(btn => {
    if ((btn.textContent || '').includes('Carrinho')) btn.style.display = 'none';
  });

  const role = currentUser?.role;
  const showProp = ['vendedor', 'backoffice'].includes(role);
  const navProp = document.getElementById('navProposals');
  const navSim = document.getElementById('navSimulacao');
  if (navProp) navProp.style.display = showProp ? '' : 'none';
  if (navSim) navSim.style.display = showProp ? '' : 'none';

  const land = role === 'backoffice' ? 'secTickets' : 'secProposals';
  const landBtn = document.querySelector(`.nav-item[data-section="${land}"]`);
  const fallback = document.querySelector('.nav-item[data-section="secProfile"]');
  const target = (landBtn && landBtn.style.display !== 'none') ? land : (fallback?.dataset.section || 'secProfile');
  if (typeof navigateTo === 'function') navigateTo(target);
  
  if (typeof syncSidebarDividers === 'function') syncSidebarDividers();
}

function syncSidebarDividers() {
  const showReports = Array.from(document.querySelectorAll('.sidebar-nav button[data-section="secMeetings"], .sidebar-nav button[data-section="secRanking"]'))
    .some(el => el.style.display !== 'none');
  document.querySelectorAll('.reports-section').forEach(el => {
    el.style.display = showReports ? '' : 'none';
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.SOUBLU_ADMIN_PROFILE) return;
  showLoading('Carregando sua área...');
  try {
    const db = await _requireDB();
    if (!db) throw new Error(_DB_LOAD_ERROR);
    await db.init();
    if (typeof refreshPartnerRootIdsCache === 'function') await refreshPartnerRootIdsCache();
    await Auth.requireLogin();

    // Verificar modo preview (master/admin visualizando como funcionário)
    const _s = Auth.getSession();
    // Ler ID da URL (?preview=...) — sessionStorage NÃO é compartilhado entre abas
    const _urlParams = new URLSearchParams(window.location.search);
    const _previewId = _urlParams.get('preview');
    const _lojaMode  = _urlParams.get('loja') === '1';
    if (_lojaMode && _s && Auth.usesAdminPanel(_s.role)) {
      window.location.replace(Auth.resolveHref('admin.html?open=loja'));
      return;
    }
    const _perfilMode = _urlParams.get('perfil') === '1';
    const _saqueMode = _urlParams.get('saque') === '1' || _urlParams.get('sacar') === '1';

    if (_s && Auth.usesAdminPanel(_s.role)) {
      if (_previewId) {
        // Modo preview: carregar dados do funcionário escolhido
        currentUser = await DB.getUser(_previewId);
        if (!currentUser) {
          alert('Funcionário não encontrado.');
          window.location.replace(Auth.resolveHref('admin.html'));
          return;
        }
        // Adicionar banner de aviso
        const banner = document.createElement('div');
        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:var(--color-primary);color:#fff;text-align:center;padding:8px 16px;font-size:13px;font-weight:700;box-shadow: 0 2px 10px rgba(0,0,0,0.15);';
        banner.innerHTML = `<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/></svg> MODO VISUALIZAÇÃO — Você está vendo como: <strong>${currentUser.name}</strong> &nbsp;&nbsp;<button onclick="window.close()" style="background:rgba(255,255,255,.25);border:none;color:#fff;padding:2px 10px;border-radius:6px;cursor:pointer;font-weight:700;margin-left:10px;">✕ Fechar</button>`;
        document.body.prepend(banner);
        document.body.style.paddingTop = '36px';
        window.__PREVIEW_USER_ID__ = _previewId;
      } else if (_lojaMode) {
        currentUser = await Auth.getCurrentUser();
        window.__LOJA_MODE__ = true;
        const banner = document.createElement('div');
        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:var(--color-primary);color:#fff;text-align:center;padding:8px 16px;font-size:13px;font-weight:700;';
        banner.innerHTML = `<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 1a2.5 2.5 0 0 1 2.5 2.5V4h-5v-.5A2.5 2.5 0 0 1 8 1zm3.5 3v-.5a3.5 3.5 0 1 0-7 0V4H1v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4h-3.5z"/></svg> Loja de Prêmios &nbsp;&nbsp;<a href="${Auth.resolveHref('admin.html')}" style="color:#fff;text-decoration:underline;">← Voltar ao painel</a>`;
        document.body.prepend(banner);
        document.body.style.paddingTop = '36px';
      } else if (_perfilMode || _saqueMode) {
        currentUser = await Auth.getCurrentUser();
        window.__PERFIL_MODE__ = true;
        const banner = document.createElement('div');
        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:var(--color-primary);color:#fff;text-align:center;padding:8px 16px;font-size:13px;font-weight:700;';
        banner.innerHTML = `<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M11 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/><path d="M2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/></svg> Meu Perfil &nbsp;&nbsp;<a href="${Auth.resolveHref('admin.html')}" style="color:#fff;text-decoration:underline;">← Voltar ao painel</a>`;
        document.body.prepend(banner);
        document.body.style.paddingTop = '36px';
      } else if (typeof Auth.isFinanceiroOnly === 'function' && Auth.isFinanceiroOnly()) {
        window.location.replace(
          typeof Auth.financeiroPageHrefFresh === 'function'
            ? Auth.financeiroPageHrefFresh()
            : Auth.financeiroPageHref()
        );
        return;
      } else {
        // Sem preview/loja: redirecionar para admin
        window.location.replace(Auth.resolveHref('admin.html'));
        return;
      }
    } else {
      currentUser = await Auth.getCurrentUser();
    }

    if (!currentUser) { Auth.logout(); return; }
    if (currentUser.role) currentUser.role = String(currentUser.role).trim().toLowerCase();

    let partnerRootId = await DB.getPartnerRootForUser(currentUser.id).catch(() => null);
    if (!partnerRootId && currentUser?.partner_root_id) {
      const hinted = await DB.getUser(currentUser.partner_root_id).catch(() => null);
      if (String(hinted?.role || '').toLowerCase() === 'parceiro') partnerRootId = String(hinted.id);
    }
    if (!partnerRootId && window._PARTNER_ROOT_USER_IDS?.size && typeof DB.expandPartnerOrgIds === 'function') {
      const users = await DB.getAllUsers().catch(() => []);
      for (const rid of window._PARTNER_ROOT_USER_IDS) {
        if (DB.expandPartnerOrgIds(rid, users).has(String(currentUser.id))) {
          partnerRootId = String(rid);
          break;
        }
      }
    }
    if (partnerRootId) {
      window.PARTNER_ROOT_ID = partnerRootId;
      const prt = await DB.getPartnerByUserId(partnerRootId).catch(() => null);
      if (prt) window.PARTNER_RAZAO_SOCIAL = prt.razao_social || prt.razaoSocial || '';
      if (prt && typeof PartnerPerms !== 'undefined') {
        let row = prt;
        if (typeof PartnerPerms.ensureTeamSacarForFundedMember === 'function') {
          row = await PartnerPerms.ensureTeamSacarForFundedMember(currentUser, prt);
        }
        window._PARTNER_PERMS = PartnerPerms.merge(row?.permissions);
      }
    }
    // #region agent log
    fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'97c411'},body:JSON.stringify({sessionId:'97c411',location:'employee.js:partnerBoot',message:'partner root resolved',data:{partnerRootId:partnerRootId||null,hasRazao:!!window.PARTNER_RAZAO_SOCIAL,role:currentUser?.role,hasPartnerHint:!!currentUser?.partner_root_id},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (window.BolaoCopa && typeof BolaoCopa.applyNavVisibility === 'function') {
      BolaoCopa.applyNavVisibility();
    }

    const _inPartnerOrg = typeof isUserInPartnerOrg === 'function'
      ? await isUserInPartnerOrg(currentUser)
      : false;
    window.__EMPLOYEE_PARTNER_ORG__ = _inPartnerOrg;

    initSidebarToggle(); initNav();
    if (window.RouletteUI) RouletteUI.ensureRouletteDOM();
    renderSidebar();

    if (_inPartnerOrg) {
      _applyPartnerEmployeeUI();
    }

    if (window.__LOJA_MODE__) {
      document.querySelectorAll('[data-section]').forEach(btn => {
        if (btn.dataset.section !== 'secStore') btn.style.display = 'none';
      });
      document.querySelectorAll('.section').forEach(sec => {
        sec.classList.toggle('active', sec.id === 'secStore');
      });
    }

    if (window.__PERFIL_MODE__) {
      document.querySelectorAll('[data-section]').forEach(btn => {
        const keep = btn.dataset.section === 'secProfile' || btn.dataset.section === 'secRoleta';
        if (!keep) btn.style.display = 'none';
      });
      document.querySelectorAll('.section').forEach(sec => {
        const keep = sec.id === 'secProfile' || sec.id === 'secRoleta';
        if (!keep) sec.classList.remove('active');
      });
    }

    if (window.PainelSonhos) {
      PainelSonhos.applyEmployeeNav(currentUser.role);
    }

    // Permissões para Propostas (área completa do colaborador; modo perfil não usa)
    if (!window.__PERFIL_MODE__ && ['vendedor', 'backoffice', 'master', 'supervisor'].includes(currentUser.role)) {
       const btnProp = document.getElementById('navProposals');
       if (btnProp) btnProp.style.display = '';
       const btnSim = document.getElementById('navSimulacao');
       if (btnSim) btnSim.style.display = '';
       const btnClients = document.getElementById('navClients');
       if (btnClients) btnClients.style.display = '';
    }

    const bootTasks = [];
    if (!window.__PERFIL_MODE__) {
      if (!_inPartnerOrg) {
        bootTasks.push(renderBalance());
      } else {
        bootTasks.push(renderBalance());
      }
    } else {
      bootTasks.push(renderProfile());
    }
    const bootT0 = Date.now();
    await Promise.all(bootTasks);

    const _sonhosOpts = {
      lojaMode: !!window.__LOJA_MODE__,
      perfilMode: !!window.__PERFIL_MODE__,
      previewMode: !!window.__PREVIEW_USER_ID__,
      partnerOrg: _inPartnerOrg,
      partnerLanding: _inPartnerOrg,
    };
    if (window.PainelSonhos && PainelSonhos.shouldLandOnInicio(currentUser.role, _sonhosOpts)) {
      if (typeof navigateTo === 'function') navigateTo('secInicio');
      await PainelSonhos.render('painelSonhosRoot');
    }

    // #region agent log
    fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'97c411'},body:JSON.stringify({sessionId:'97c411',location:'employee.js:boot',message:'critical boot done',data:{ms:Date.now()-bootT0,perfil:!!window.__PERFIL_MODE__},timestamp:Date.now(),hypothesisId:'D',runId:'perf-photo-fix'})}).catch(()=>{});
    // #endregion

    hideLoading();
    _ensureEmployeeSectionVisible();
    void _deferredEmployeeBoot(_inPartnerOrg);

    if (window.PainelSonhos) {
      PainelSonhos.renderProfileTeaser();
    }

    if (window.Trainings && typeof Trainings.init === 'function') Trainings.init();
    if (window.MarketplaceBlu && typeof MarketplaceBlu.init === 'function') MarketplaceBlu.init();
    if (window.MarketplaceBlu && typeof MarketplaceBlu.applyNavVisibility === 'function') {
      MarketplaceBlu.applyNavVisibility(window.__ADMIN_NAV_CFG__ || { canMarketplaceBlu: true });
    }
    if (window.ContaCorrente && typeof ContaCorrente.init === 'function') ContaCorrente.init();
    if (window.WhatsAppChat && typeof WhatsAppChat.applyNavVisibility === 'function') WhatsAppChat.applyNavVisibility();
    if (window.PropostaCredito) {
      PropostaCredito.init();
      if (typeof PropostaCredito.applyEmployeeNavVisibility === 'function') {
        await PropostaCredito.applyEmployeeNavVisibility(currentUser);
      }
    }
    if (window.Trainings) {
      try { await Trainings.updateBadge(); } catch (_) { /* noop */ }
      try { await Trainings.checkPendingOnLogin(); } catch (_) { /* noop */ }
    }

    if (_saqueMode && typeof openWithdrawalModal === 'function') {
      setTimeout(() => openWithdrawalModal(), 200);
    } else if (_perfilMode && typeof navigateTo === 'function') {
      navigateTo('secProfile');
    }

    document.querySelectorAll('[data-section]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const s = btn.dataset.section;
        const u = typeof resolveEmployeeUser === 'function'
          ? await resolveEmployeeUser()
          : await Auth.getCurrentUser();
        if (u) currentUser = u;
        try {
        if (s==='secInicio' && window.PainelSonhos) {
          await PainelSonhos.render('painelSonhosRoot');
        }
        if (s==='secProfile')  {
          await renderProfile();
          await renderOrders();
          if (window.PainelSonhos) PainelSonhos.renderProfileTeaser();
        }
        if (s==='secRanking') {
          if (window.__EMPLOYEE_PARTNER_ORG__) return;
          if (typeof SalesRanking !== 'undefined' && SalesRanking.invalidateCache) SalesRanking.invalidateCache();
          await renderRanking();
        }
        if (s==='secOrders')   await renderOrders();
        if (s==='secStore')    { await renderBalance(); await renderProducts(); }
        if (s==='secProposals') { if(window.Proposals) await Proposals.renderEmployeeList(); }
        if (s==='secPropostaCredito' && window.PropostaCredito) PropostaCredito.renderEmployee();
        if (s==='secSimulacao') { if (window.SimulacaoTroco) SimulacaoTroco.init(); }
        if (s==='secClients')   { if(window.Clients) await Clients.renderEmployeeList(); }
        if (s==='secTickets')   {
          // #region agent log
          fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'97c411'},body:JSON.stringify({sessionId:'97c411',location:'employee.js:secTickets',message:'nav chamados',data:{hasTickets:!!window.Tickets,role:currentUser?.role,navDisplay:document.getElementById('navTickets')?.style?.display||'default'},timestamp:Date.now(),hypothesisId:'A',runId:'chamados-nav-fix'})}).catch(()=>{});
          // #endregion
          if (window.Tickets) {
            Tickets.init();
            await Tickets.renderEmployeeList();
          }
        }
        if (s==='secMeetings') { if (typeof renderMeetingsEmployee === 'function') await renderMeetingsEmployee(); }
        if (s==='secRoleta' && window.RouletteUI) await RouletteUI.renderRoulettePage();
        if (s==='secBolaoCopa' && window.BolaoCopa) await BolaoCopa.render();
        if (s==='secTrainings' && window.Trainings) await Trainings.renderEmployee();
        if (s==='secMarketplaceBlu' && window.MarketplaceBlu) await MarketplaceBlu.renderShop();
        if (s==='secContaCorrente' && window.ContaCorrente) await ContaCorrente.render();
        } catch (err) {
          console.error('[employee nav]', s, err);
          showToast('Erro ao carregar esta seção. Tente novamente.', 'error');
        }
      });
    });

    // (checkbox de saque gerenciado pelo setupTermScroll no employee.html)

    _startEmployeeLiveRefresh();
    if (!_inPartnerOrg) {
      try { if (typeof updateMeetingsBadge === 'function') await updateMeetingsBadge(); } catch (_) { /* noop */ }
    }
    if (typeof syncSidebarDividers === 'function') syncSidebarDividers();
  } catch(e) {
    if (e.message==='AUTH_REDIRECT') return;
    console.error('[SOU+BLU Employee Error]', e);
    hideLoading();
    showToast(`Erro: ${e.message || 'falha ao carregar'}`, 'error', 8000);
  }
});

function _ensureEmployeeSectionVisible() {
  const active = document.querySelector('.section.active');
  if (active && active.style.display !== 'none') return;
  const ids = ['secInicio', 'secProfile', 'secProposals', 'secTickets', 'secStore'];
  for (const id of ids) {
    const sec = document.getElementById(id);
    if (!sec || sec.style.display === 'none') continue;
    if (typeof navigateTo === 'function') navigateTo(id);
    else {
      document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
      sec.classList.add('active');
    }
    if (id === 'secInicio' && window.PainelSonhos) {
      void PainelSonhos.render('painelSonhosRoot');
    }
    if (id === 'secBolaoCopa' && window.BolaoCopa) {
      void BolaoCopa.render();
    }
    break;
  }
}

async function _deferredEmployeeBoot(_inPartnerOrg) {
  const t0 = Date.now();
  const tasks = [];
  if (!window.__PERFIL_MODE__) {
    if (!_inPartnerOrg) {
      tasks.push(
        renderCategories(),
        renderProducts(),
        renderRanking(),
        renderOrders(),
      );
    }
    tasks.push(renderProfile());
    if (window.RouletteUI) tasks.push(RouletteUI.renderRoulettePage());
    if (window.BolaoCopa) {
      BolaoCopa.ensureDom();
      BolaoCopa.applyNavVisibility();
      tasks.push(BolaoCopa.init());
    }
    if (['vendedor', 'backoffice', 'supervisor'].includes(currentUser?.role) && window.Proposals) {
      tasks.push(Proposals.renderEmployeeList());
    }
    if (!_inPartnerOrg && typeof renderMeetingsEmployee === 'function') {
      tasks.push(renderMeetingsEmployee());
    }
  }
  try {
    await Promise.all(tasks);
    // #region agent log
    fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'97c411'},body:JSON.stringify({sessionId:'97c411',location:'employee.js:deferredBoot',message:'deferred boot done',data:{ms:Date.now()-t0,taskCount:tasks.length},timestamp:Date.now(),hypothesisId:'D',runId:'perf-photo-fix'})}).catch(()=>{});
    // #endregion
  } catch (err) {
    console.warn('[employee deferred boot]', err);
  }
}

function renderSidebar() {
  const nameEl = document.getElementById('sidebarName');
  const av = document.getElementById('sidebarAvatar');
  if (!nameEl || !av) return;
  nameEl.textContent = currentUser.name.split(' ')[0];
  if (typeof applySidebarAvatar === 'function') {
    applySidebarAvatar(av, currentUser.name, currentUser.photo_url || currentUser.photo || '');
  } else {
    const photo = currentUser.photo_url || currentUser.photo || '';
    if (photo) {
      av.style.backgroundImage = `url(${photo})`;
      av.style.backgroundSize = 'cover';
      av.style.backgroundPosition = 'center';
      av.textContent = '';
    } else {
      av.style.background = avatarColor(currentUser.name);
      av.textContent = getInitials(currentUser.name);
    }
  }
  // Role label dinâmico
  const roleEl = document.getElementById('sidebarRole');
  if (roleEl) {
    const roleLabels = {
      vendedor: 'Vendedor', backoffice: 'Backoffice', employee: 'Funcionário',
      supervisor: 'Supervisor', sup_backoffice: 'Sup. Backoffice', parceiro: 'Parceiro',
      gerente: 'Gerente', financeiro: 'Financeiro', financial: 'Financeiro',
      rh: 'RH', gerencia: 'Gerência', operacional: 'Operacional',
      desenvolvedor: 'Desenvolvimento', fundador: 'Fundador',
    };
    roleEl.textContent = roleLabels[currentUser.role] || 'Colaborador';
  }
}

function _startEmployeeLiveRefresh() {
  if (window.__SOUBLU_EMP_POLL__ || window.SOUBLU_ADMIN_PROFILE) return;
  window.__SOUBLU_EMP_POLL__ = true;
  const tick = async () => {
    if (document.hidden || !currentUser?.id) return;
    await renderBalance().catch(() => {});
    const sec = document.querySelector('.section.active')?.id;
    if (!window.__EMPLOYEE_PARTNER_ORG__) {
      if (sec === 'secRanking') await renderRanking().catch(() => {});
      if (sec === 'secRoleta' && window.RouletteUI) await RouletteUI.renderRoulettePage().catch(() => {});
      if (sec === 'secMeetings' && typeof renderMeetingsEmployee === 'function') {
        await renderMeetingsEmployee().catch(() => {});
      }
      if (typeof updateMeetingsBadge === 'function') await updateMeetingsBadge().catch(() => {});
    }
  };
  const pollId = setInterval(tick, 20000);
  window.__SOUBLU_EMP_POLL_ID__ = pollId;
  window.addEventListener('pagehide', () => {
    clearInterval(pollId);
    window.__SOUBLU_EMP_POLL__ = false;
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
}

/* Loja: js/store-shop.js (renderBalance, renderProducts, checkout, …) */

async function renderOrders() {
  if (!currentUser?.id) return;
  if (typeof _cacheDel === 'function') _cacheDel('orders');
  const orders = (await DB.getOrders(currentUser.id).catch(() => [])) || [];
  const box = document.getElementById('ordersContainer');
  if (!box) return;
  if (!orders.length) { box.innerHTML = `<div class="empty-state"><div class="empty-icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><polygon points="12 22.08 12 12 3 6.92 3 17.08 12 22.08"></polygon><polygon points="12 22.08 12 12 21 6.92 21 17.08 12 22.08"></polygon><polygon points="12 12 3 6.92 12 1.84 21 6.92 12 12"></polygon><line x1="3.27" y1="6.92" x2="12" y2="12.01"></line><line x1="20.73" y1="6.92" x2="12" y2="12.01"></line></svg></div><h4>Nenhum pedido ainda</h4><p>Faça sua primeira compra!</p></div>`; return; }
  box.innerHTML=orders.map(o=>{
    const items=typeof o.items==='string'?JSON.parse(o.items):o.items;
    return `<div class="order-card">
      <div class="order-card-header">
        <div><strong>${o.order_code||o.orderId||o.id}</strong><span style="font-size:12px;color:var(--color-text-muted);margin-left:10px;">${formatDateTime(o.created_at||o.date)}</span></div>
        <div style="display:flex;align-items:center;gap:10px;"><span class="pts-orange" style="font-family:var(--font-display);font-weight:800;">${formatCurrency(o.total_points||o.total_price||o.totalPoints||0)}</span>${orderStatusBadge(o.status)}</div>
      </div>
      <div class="order-card-body">
        ${items.map(i=>`<div style="display:flex;align-items:center;gap:10px;padding:6px 0;">
          <span style="font-size:20px;">${i.emoji||'🎁'}</span>
          <span style="flex:1;font-size:14px;font-weight:600;">${i.name}</span>
          <span style="font-size:13px;color:var(--color-text-muted);">x${i.qty}</span>
          <span class="pts-orange" style="font-size:13px;font-weight:700;">${formatCurrency(i.points_price*i.qty)}</span>
        </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

async function renderRanking() {
  if (typeof SalesRanking !== 'undefined' && SalesRanking.renderEmployee) {
    return SalesRanking.renderEmployee(currentUser);
  }
  const listEl = document.getElementById('rankingList');
  if (listEl) listEl.innerHTML = '<div class="text-muted text-center" style="padding:24px;">Ranking indisponível.</div>';
}
