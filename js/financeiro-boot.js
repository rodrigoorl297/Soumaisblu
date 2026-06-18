/* SOU+BLU — Boot do módulo Financeiro */
(function () {
  const SECTION_LABELS = {
    secContaCorrenteGestao: 'Gestão de conta',
    secWithdrawals: 'Saque PIX',
    secBalance: 'Gerenciador de pontos',
    secFornecedorFinanceiro: 'Fornecedor',
    secPrestadorServicos: 'Cadastro prestador serviço',
    secFiscalParceiro: 'Fiscal parceiro',
    secContaCorrente: 'Conta corrente administrar',
    secEsteiraCredito: 'Esteira proposta crédito',
    secRetornoPropostas: 'Retorno de propostas',
    secAdiantamentoSalarial: 'Adiantamento salarial',
    secSolicitarReembolso: 'Solicitar reembolso',
    secManageProposals: 'Gestão de Propostas',
    secFinPropostas: 'Operações de proposta',
  };

  const FIN_PROP_NAV_TITLES = {
    baixa: 'Baixa comissões',
    prejuizo: 'Emitir prejuízo colaborador',
    debitar: 'Emitir prejuízo parceiro',
  };

  function sectionsUrl() {
    const rel = (typeof Auth !== 'undefined' && Auth._isInPagesDir && Auth._isInPagesDir())
      ? 'financeiro-sections.html?v=11'
      : 'pages/financeiro-sections.html?v=11';
    return typeof Auth !== 'undefined' && Auth.resolveHref
      ? Auth.resolveHref(rel)
      : rel;
  }

  async function loadSectionsHtml() {
    const host = document.getElementById('finPageContent');
    if (!host || host.dataset.loaded === '1') return;
    const res = await fetch(sectionsUrl());
    if (!res.ok) throw new Error('Não foi possível carregar telas financeiras.');
    const html = await res.text();
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    wrap.querySelectorAll('.section, section.section').forEach(el => host.appendChild(el));
    wrap.querySelectorAll('.modal-overlay').forEach(el => document.body.appendChild(el));
    host.dataset.loaded = '1';
    tagFinSections();
  }

  function tagFinSections() {
    document.querySelectorAll('#finPageContent .section:not(.fin-section)').forEach(el => {
      el.classList.add('fin-section');
    });
  }

  async function initRoleGlobals() {
    const s = Auth.getSession();
    if (!s) return;
    s.role = String(s.role || '').trim().toLowerCase();
    window.ADMIN_ID = s.id;
    window.IS_MASTER = Auth.isMaster();
    window.IS_FUNDA = typeof Auth.isFundador === 'function' ? Auth.isFundador() : s.role === 'fundador';
    window.IS_FINANCIAL = true;
    window.IS_RH = s.role === 'rh';
    window.IS_GERENTE = ['gerente', 'gerencia', 'admin'].includes(s.role);
    window.IS_SUPERVISOR = false;
    window.IS_SUP_BACKOFFICE = false;
    window.IS_BACKOFFICE = s.role === 'backoffice';
    window.IS_OPERACIONAL = s.role === 'operacional';
    window.IS_VENDEDOR_ADM = s.role === 'vendedor';
    window.IS_DIRETORIA = s.role === 'diretoria';
    window.IS_DESENVOLVEDOR = s.role === 'desenvolvedor';
    window.IS_PARCEIRO = false;
    window.PARTNER_ROOT_ID = null;
    window.IS_PARTNER_STAFF = false;
    window._PARTNER_PERMS = null;
    window.CAN_EMPLOYEES_PANEL = window.IS_MASTER || window.IS_FUNDA || window.IS_FINANCIAL || window.IS_RH;
    window.USER_ADMIN_ID = s.id;
    window.USER_DEPT = '';
    if (typeof syncFinanceiroRoleGlobals === 'function') syncFinanceiroRoleGlobals();
  }

  function finNavigateTo(sectionId) {
    document.querySelectorAll('#finPageContent .section').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionId)?.classList.add('active');
  }

  function wireBalanceForm() {
    const form = document.getElementById('addBalanceForm');
    if (!form || form.dataset.wired === '1') return;
    form.dataset.wired = '1';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (typeof syncFinanceiroRoleGlobals === 'function') syncFinanceiroRoleGlobals();
      const empId = document.getElementById('balanceEmployee')?.value;
      const op = document.getElementById('balanceOperation')?.value;
      const rawAmt = document.getElementById('balanceAmount')?.value;
      const reason = document.getElementById('balanceReason')?.value?.trim();
      if (!empId || !reason) { showToast('Preencha todos os campos.', 'warning'); return; }
      const amt = _parseBalanceFormAmount(op, rawAmt, false);
      const valMsg = _balanceAmountValidationMessage(op, amt, false);
      if (valMsg) { showToast(valMsg, 'warning'); return; }
      const emp = await DB.getUser(empId);
      if (!emp) { showToast('Funcionário não encontrado.', 'error'); return; }
      if (typeof isUserInPartnerNetworkSync === 'function' && isUserInPartnerNetworkSync(emp)) {
        showToast('Rede parceira usa saldo em R$.', 'warning');
        return;
      }
      if (!IS_MASTER && !IS_FINANCIAL && !IS_GERENTE && !IS_RH && emp.admin_id !== ADMIN_ID) {
        showToast('Acesso negado.', 'error');
        return;
      }
      showLoading('Atualizando saldo...');
      try {
        const nb = await applyBalanceAdjustment(empId, op, amt, reason, { screen: 'gerenciar_saldo' });
        if (typeof invalidateSouBluCaches === 'function') invalidateSouBluCaches();
        form.reset();
        if (typeof syncBalanceAmountByOperation === 'function') syncBalanceAmountByOperation();
        await Promise.all([
          typeof populateBalanceSelect === 'function' ? populateBalanceSelect() : Promise.resolve(),
          typeof renderBalanceHistory === 'function' ? renderBalanceHistory() : Promise.resolve(),
        ]);
        showToast(`${emp.name}: ${formatCurrency(nb, emp)}`, 'success');
      } catch (err) {
        showToast(err.message || 'Erro ao atualizar saldo.', 'error');
      } finally { hideLoading(); }
    });
    if (typeof wireBalanceOperationField === 'function') wireBalanceOperationField();
  }

  function initModules() {
    if (window.MarketplaceBlu?.init) MarketplaceBlu.init();
    if (window.FornecedorFinanceiro?.init) FornecedorFinanceiro.init();
    if (window.PrestadorServicos?.init) PrestadorServicos.init();
    if (window.ContaCorrente?.init) ContaCorrente.init();
    if (window.FiscalParceiro?.init) FiscalParceiro.init();
    if (window.EsteiraCredito?.init) EsteiraCredito.init();
    if (window.PropostaCredito?.init) PropostaCredito.init();
    if (window.FinanceiroCredito?.init) FinanceiroCredito.init();
    if (window.FinanceiroReembolso?.init) FinanceiroReembolso.init();
    if (window.FinPropostas?.init) FinPropostas.init();
    if (window.Proposals?.init) Proposals.init();
  }

  function hideInjectedAdminNav() {
    const nav = document.getElementById('finSidebarNav');
    if (!nav) return;
    nav.querySelectorAll(
      '.conta-corrente-nav, .conta-corrente-gestao-nav, ' +
      '.fornecedor-financeiro-nav, .fiscal-parceiro-nav, ' +
      '.esteira-credito-nav, .marketplace-blu-nav, .marketplace-manage-nav, .marketplace-orders-nav, ' +
      '.store-shop-nav, .store-nav, .trainings-nav, .trainings-manage-nav, .trainings-rh-nav, .trainings-collab-nav'
    ).forEach(el => { el.style.display = 'none'; });
    nav.querySelectorAll(
      '[id^="navMarketplace"], [id^="navContaCorrente"], [id^="navFornecedorFinanceiro"], ' +
      '[id^="navFiscalParceiro"], [id^="navEsteiraCredito"]'
    ).forEach(el => { el.style.display = 'none'; });
  }

  function isFinInjectedAdminNav(el) {
    if (!el || el.nodeType !== 1) return false;
    const injectedCls = [
      'marketplace-blu-nav', 'marketplace-manage-nav', 'marketplace-orders-nav',
      'conta-corrente-nav', 'conta-corrente-gestao-nav', 'fornecedor-financeiro-nav',
      'fiscal-parceiro-nav', 'esteira-credito-nav', 'store-shop-nav', 'store-nav',
      'trainings-nav', 'trainings-manage-nav', 'trainings-rh-nav', 'trainings-collab-nav',
    ];
    if (injectedCls.some((c) => el.classList.contains(c))) return true;
    const id = el.id || '';
    if (/^(navMarketplace|navContaCorrente|navFornecedorFinanceiro|navFiscalParceiro|navEsteiraCredito)/.test(id)) {
      return true;
    }
    const sec = el.dataset.section || '';
    return ['secProducts', 'secOrders', 'secStore', 'secMarketplaceBlu', 'secMarketplaceManage', 'secMarketplaceOrders'].includes(sec);
  }

  function isFinCoreNavChild(el) {
    if (!el || el.nodeType !== 1) return false;
    if (isFinInjectedAdminNav(el)) return false;
    if (el.dataset.tab === 'inicio') return true;
    if (el.dataset.section) return true;
    if (el.id === 'navFinVoltar') return true;
    if (el.getAttribute('onclick')?.includes('Auth.logout')) return true;
    if (el.classList.contains('fin-nav-black-bar') && el.getAttribute('role') === 'presentation') return true;
    if (el.classList.contains('nav-section-label')) return true;
    return false;
  }

  /** Garante menu financeiro nativo visível — bloqueia itens de admin/loja injetados por engano. */
  function ensureFinanceiroSidebarVisible() {
    const nav = document.getElementById('finSidebarNav');
    if (!nav) return;
    hideInjectedAdminNav();
    Array.from(nav.children).forEach((el) => {
      if (isFinCoreNavChild(el)) {
        el.style.display = '';
        el.classList.add('fin-core-nav');
      } else if (!el.classList.contains('fin-store-nav')) {
        el.style.display = 'none';
      }
    });
    const blackBars = nav.querySelectorAll('a.fin-nav-black-bar[data-section]');
    blackBars.forEach((el) => { el.style.display = ''; });
  }

  function folhaPagamentoHref() {
    if (typeof Auth !== 'undefined' && Auth.folhaPagamentoPageHref) {
      return Auth.folhaPagamentoPageHref();
    }
    const rel = (typeof Auth !== 'undefined' && Auth._isInPagesDir && Auth._isInPagesDir())
      ? 'folha-pagamento.html'
      : 'pages/folha-pagamento.html';
    return typeof Auth !== 'undefined' && Auth.resolveHref
      ? Auth.resolveHref(rel)
      : rel;
  }

  function isFinanceiroOnlyUser() {
    if (typeof Auth !== 'undefined' && typeof Auth.isFinanceiroOnly === 'function') {
      return Auth.isFinanceiroOnly();
    }
    const s = Auth.getSession();
    const r = String(s?.role || '').toLowerCase();
    return r === 'financeiro' || r === 'financial';
  }

  function wireSidebar() {
    const nav = document.getElementById('finSidebarNav');
    if (!nav || nav.dataset.wired === '1') return;
    nav.dataset.wired = '1';

    nav.querySelectorAll('[data-tab="inicio"], #navFinInicio').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        FinanceiroBoot.showInicioPanel();
        if (window.FinanceiroPage?.refreshDashboard) FinanceiroPage.refreshDashboard();
      });
    });

    nav.querySelectorAll('[data-section]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        FinanceiroBoot.openSection(el.dataset.section, el.dataset.tabParam || '');
      });
    });

    nav.querySelectorAll('#navFinFolha, #navFinFolhaGerar').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = folhaPagamentoHref();
      });
    });

    const voltar = document.getElementById('navFinVoltar');
    if (voltar) {
      if (isFinanceiroOnlyUser()) {
        voltar.style.display = 'none';
      } else {
        voltar.addEventListener('click', (e) => {
          e.preventDefault();
          const href = typeof Auth.adminPageHrefFresh === 'function'
            ? Auth.adminPageHrefFresh()
            : (typeof Auth.adminPageHref === 'function' ? Auth.adminPageHref() : 'admin.html');
          window.location.replace(href);
        });
      }
    }
  }

  async function renderSection(sectionId, tab) {
    if (typeof syncFinanceiroRoleGlobals === 'function') syncFinanceiroRoleGlobals();
    if (tab && window.FornecedorFinanceiro) FornecedorFinanceiro.tab = tab;
    if (tab && window.EsteiraCredito) EsteiraCredito.tab = tab;
    if (tab && window.FinPropostas && ['prejuizo', 'debitar'].includes(tab)) {
      FinPropostas.tab = tab;
    }

    const renders = {
      secWithdrawals: () => (typeof renderWithdrawalsTable === 'function' ? renderWithdrawalsTable() : Promise.resolve()),
      secBalance: async () => {
        if (typeof populateBalanceSelect === 'function') await populateBalanceSelect();
        if (typeof renderBalanceHistory === 'function') await renderBalanceHistory();
      },
      secManageProposals: async () => {
        if (window.FinPropostas) {
          FinPropostas._injectGestaoComissaoColumn?.();
          FinPropostas._injectGestaoBanner?.();
        }
        if (window.Proposals?.renderAdminList) await Proposals.renderAdminList();
      },
      secMarketplaceManage: () => window.MarketplaceBlu?.renderCatalogAdmin?.(),
      secMarketplaceOrders: () => window.MarketplaceBlu?.renderOrdersAdmin?.(),
      secFornecedorFinanceiro: () => window.FornecedorFinanceiro?.render?.(),
      secPrestadorServicos: () => window.PrestadorServicos?.render?.(),
      secFiscalParceiro: () => window.FiscalParceiro?.render?.(),
      secContaCorrente: () => window.ContaCorrente?.render?.(),
      secContaCorrenteGestao: () => window.ContaCorrente?.renderGestao?.(),
      secEsteiraCredito: () => window.EsteiraCredito?.render?.(),
      secRetornoPropostas: () => window.FinanceiroCredito?.renderRetorno?.(),
      secAdiantamentoSalarial: () => window.FinanceiroCredito?.renderAdiantamento?.(),
      secSolicitarReembolso: () => window.FinanceiroReembolso?.render?.(),
      secFinPropostas: () => window.FinPropostas?.render?.(),
    };

    const fn = renders[sectionId];
    if (fn) await fn();

    if (sectionId === 'secEsteiraCredito' && tab === 'ccb') {
      const adminSec = document.getElementById('cprAdminSection');
      if (adminSec) adminSec.style.display = '';
    }
    if (sectionId === 'secEsteiraCredito' && tab === 'solicitar' && window.EsteiraCredito) {
      EsteiraCredito.tab = 'solicitar';
    }
  }

  function showModulePanel(sectionId) {
    const inicio = document.getElementById('tab-inicio');
    const modulos = document.getElementById('tab-modulos');
    if (inicio) { inicio.classList.remove('active'); inicio.style.display = 'none'; }
    if (modulos) { modulos.classList.add('active'); modulos.style.display = 'block'; }
    finNavigateTo(sectionId);
    const title = document.getElementById('pageTitle');
    if (title) {
      if (window._finNavIntent && FIN_PROP_NAV_TITLES[window._finNavIntent.tab]) {
        title.textContent = FIN_PROP_NAV_TITLES[window._finNavIntent.tab];
      } else if (sectionId === 'secFornecedorFinanceiro' && window._finLastTab === 'despesas') {
        title.textContent = 'Emitir cobranças';
      } else {
        title.textContent = SECTION_LABELS[sectionId] || 'Financeiro';
      }
    }
    document.querySelectorAll('#finSidebarNav .nav-item[data-section]').forEach(n => {
      let match = false;
      if (window._finNavIntent) {
        match = n.dataset.section === window._finNavIntent.section
          && (n.dataset.tabParam || '') === window._finNavIntent.tab;
      } else {
        match = n.dataset.section === sectionId
          && (!n.dataset.tabParam || n.dataset.tabParam === (window._finLastTab || ''));
      }
      n.classList.toggle('active', match);
    });
  }

  function showInicioPanel() {
    const inicio = document.getElementById('tab-inicio');
    const modulos = document.getElementById('tab-modulos');
    if (modulos) { modulos.classList.remove('active'); modulos.style.display = 'none'; }
    if (inicio) { inicio.classList.add('active'); inicio.style.display = 'block'; }
    document.querySelectorAll('#finSidebarNav .nav-item[data-section]').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('#finSidebarNav .nav-item[data-tab="inicio"], #navFinInicio').forEach(n => {
      n.classList.add('active');
    });
    const title = document.getElementById('pageTitle');
    if (title) title.textContent = 'Painel dos Sonhos';
    if (window.PainelSonhos) {
      PainelSonhos.render('painelSonhosRoot').catch((e) => console.warn('[fin inicio]', e));
    }
    window._finLastTab = '';
    window._finNavIntent = null;
  }

  const FinanceiroBoot = {
    async init() {
      await initRoleGlobals();
      await loadSectionsHtml();
      initModules();
      ensureFinanceiroSidebarVisible();
      wireBalanceForm();
      wireSidebar();
    },

    async openSection(sectionId, opts) {
      const tab = typeof opts === 'string' ? opts : (opts?.tab || '');
      const proposalId = typeof opts === 'object' ? opts?.proposalId : '';

      if (sectionId === 'secFinPropostas') {
        const tabMap = { baixa: 'comissao', prejuizo: 'prejuizo', debitar: 'debito' };
        window._finNavIntent = { section: 'secFinPropostas', tab };
        sectionId = 'secManageProposals';
        window._finPendingDrawer = { id: proposalId, tab: tabMap[tab] || 'dados' };
        window._finLastTab = '';
      } else {
        window._finNavIntent = null;
        window._finLastTab = tab;
      }

      if (!sectionId) {
        showInicioPanel();
        return;
      }
      showModulePanel(sectionId);
      await renderSection(sectionId, tab);

      if (window._finPendingDrawer && sectionId === 'secManageProposals' && window.FinPropostas?.openProposalDrawer) {
        const pending = window._finPendingDrawer;
        window._finPendingDrawer = null;
        if (pending.id) await FinPropostas.openProposalDrawer(pending.id, pending.tab || 'comissao');
      }
    },

    showInicioPanel,
    SECTION_LABELS,
    ensureFinanceiroSidebarVisible,
  };

  window.FinanceiroBoot = FinanceiroBoot;
})();
