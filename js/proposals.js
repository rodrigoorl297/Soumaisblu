window.Proposals = {
  /** Limite por anexo de proposta (alinhado com api/upload.php). */
  PROPOSAL_MAX_FILE_MB: 50,

  /** Debounce da busca automática ao digitar CPF no modal Nova Proposta. */
  _cpfPopupTimer: null,

  init: function() {
    this._applyMobileListLimits();
    this._initAnexoFolderDelegation();
    this._bindManageStatusSync();
    this._ensureAdminProposalActionsDelegation();
    void this._bootstrapProposalUi();
  },

  /** Estado do catálogo configurável (convênios, produtos, situações). */
  _catalogOverrides: null,
  _catalogLoadPromise: null,

  /**
   * _bootstrapProposalUi — carrega catálogo remoto e monta selects + botão de config.
   */
  _bootstrapProposalUi: async function() {
    await this._loadProposalCatalog();
    this._ensureProposalManageToolbar();
    this._initStaticProposalSelects();
    if (document.getElementById('propAnexosFolders')) {
      this.initAnexoFolders();
    }
  },

  /** Catálogo de produtos (planilha ALTERAÇÃO PRODUTOS). */
  _PRODUTOS: [
    { v: 'NOVO', l: 'NOVO' },
    { v: 'COMPRA DE DÍVIDA', l: 'COMPRA DE DÍVIDA' },
    { v: 'CARTÃO', l: 'CARTÃO' },
    { v: 'CNC', l: 'CNC' },
  ],

  _CONVENIOS: ['FEDERAL', 'ESTADUAL', 'MUNICIPAL', 'INSS', 'CLT'],

  /** Pastas de anexo da proposta (vendedor + gestão). Chaves gravadas em proposals.attachments (JSON). */
  _ANEXO_CATEGORIES: [
    {
      key: 'identidade',
      titulo: '🪪 Documento de Identidade',
      folderIdSuffix: 'DocIdentidade',
      grupoPrefix: 'identidade_',
      initialSlots: [
        { slotSuffix: 'Frente', grupo: 'identidade_frente', label: 'Frente' },
        { slotSuffix: 'Verso', grupo: 'identidade_verso', label: 'Verso' },
      ],
      viewSeed: [
        { key: 'identidade_frente', label: 'Frente', legado: ['identidade', 'arquivo_1'] },
        { key: 'identidade_verso', label: 'Verso', legado: [] },
      ],
    },
    {
      key: 'contracheque',
      titulo: '📋 Contracheque',
      folderIdSuffix: 'CC',
      grupoPrefix: 'contracheque_',
      viewSeed: [{ key: 'contracheque_1', legado: ['paystub', 'contracheque'] }],
    },
    {
      key: 'boleto',
      titulo: '💳 Boleto de Quitação',
      folderIdSuffix: 'Bol',
      grupoPrefix: 'boleto_',
      viewSeed: [
        { key: 'boleto_1', legado: ['boleto1', 'boleto_quitacao', 'boleto_quitacao_1'] },
        { key: 'boleto_2', legado: ['boleto2', 'boleto_quitacao_2'] },
      ],
    },
    {
      key: 'extrato',
      titulo: '📄 Extrato de Consignação',
      folderIdSuffix: 'Ext',
      grupoPrefix: 'extrato_',
      viewSeed: [
        { key: 'extrato_1', legado: ['extrato1', 'extrato_consignacao', 'extrato_consignacao_1'] },
        { key: 'extrato_2', legado: ['extrato2', 'extrato_consignacao_2'] },
      ],
    },
    {
      key: 'nota_promissoria',
      titulo: '📝 Nota Promissória',
      folderIdSuffix: 'NotaProm',
      grupoPrefix: 'nota_promissoria_',
      viewSeed: [{ key: 'nota_promissoria_1', legado: [] }],
    },
    {
      key: 'termo_confissao_divida',
      titulo: '📜 Termo de Confissão de Dívida',
      folderIdSuffix: 'TermoConfDivida',
      grupoPrefix: 'termo_confissao_divida_',
      viewSeed: [{ key: 'termo_confissao_divida_1', legado: [] }],
    },
  ],

  /** Entidades / órgãos por convênio (planilha Margem / RMC / RCC). */
  _CONVENIO_ENTIDADES: {
    FEDERAL: ['SIAPE'],
    ESTADUAL: [
      'GOVERNO DE ALAGOAS - AL',
      'TRIBUNAL DE JUSTIÇA DE ALAGOAS - AL',
      'PREFEITURA DE ALAGOINHAS - BA',
      'PREFEITURA DE JUAZEIRO DO NORTE - CE',
      'PREFEITURA DE SOBRAL - CE',
      'GOVERNO DO ESPÍRITO SANTO - ES',
      'GOVERNO DE GOIÁS - GO',
      'PREF DE ÁGUAS LINDAS DE GOIÁS - GO',
      'PREF DE PLANALTINA - GO',
      'PREF DE PLANALTINA - PREVPLAN - GO',
      'GOVERNO DO MARANHÃO - MA',
      'PREFEITURA DE AÇAILÂNDIA - MA',
      'PREFEITURA DE IMPERATRIZ - MA',
      'PREFEITURA DE PAÇO DO LUMIAR - MA',
      'PREFEITURA DE SÃO LUIS - MA',
      'PREFEITURA DE CAMPO GRANDE - MS',
      'PREFEITURA DE ANANINDEUA - PA',
      'GOVERNO DA PARAÍBA - PB',
      'GOVERNO DA PARAÍBA - PBPREV - PB',
      'GOVERNO DA PARAÍBA - UEPB - PB',
      'PREF DE CAMPINA GRANDE - IPSEM - PB',
      'PREFEITURA DE JOÃO PESSOA - PB',
      'PREFEITURA DE SANTA RITA - PB',
      'GOVERNO DE PERNAMBUCO - PE',
      'PREFEITURA DE RECIFE - PE',
      'GOVERNO DO PIAUÍ - PI',
      'PREFEITURA DE PICOS - PI',
      'GOVERNO DO PARANÁ - PR',
      'GOV DO PARANÁ - PR',
      'PREFEITURA DE CURITIBA - PR',
      'PREFEITURA DE ARAPONGAS - PR',
      'GOVERNO DO RIO GRANDE DO NORTE - RN',
      'PREFEITURA DE NATAL - RN',
      'PREFEITURA DE PORTO VELHO - IPAM - RO',
      'PREFEITURA DE GRAVATAÍ - RS',
      'PREFEITURA DE SANTA MARIA - RS',
      'PREFEITURA DE SAPUCAIA - RS',
      'GOVERNO DE SANTA CATARINA - SC',
      'PREFEITURA DE ARACAJU - SE',
      'GOVERNO DO TOCANTINS - TO',
      'PREFEITURA DE ARAGUAÍNA - TO',
      'PREFEITURA DE PALMAS - TO',
      'PREV PALMAS - TO',
      'GOVERNO DE MINAS GERAIS - CBMMG - MG',
      'GOVERNO DE MINAS GERAIS - IPSEMG - MG',
      'GOVERNO DE MINAS GERAIS - IPSM - MG',
      'GOVERNO DE MINAS GERAIS - PMMG - MG',
      'GOVERNO DE MINAS GERAIS - SEPLAG - MG',
      'PREFEITURA DE BELO HORIZONTE - MG',
      'PREFEITURA DE CONTAGEM - MG',
      'PREFEITURA DE CONTAGEM - FUNEC - MG',
      'PREFEITURA DE CONTAGEM - PREVICON - MG',
      'PREFEITURA DE CONTAGEM - TRANSCON - MG',
      'PREFEITURA DE JUIZ DE FORA - MG',
      'PREFEITURA DE UBERABA - MG',
      'PREFEITURA DE DUQUE DE CAXIAS - RJ',
      'PREFEITURA DE DUQUE DE CAXIAS - IPM - RJ',
      'PREFEITURA DE MACAÉ - RJ',
      'PREFEITURA DE SÃO GONÇALO - RJ',
      'PREFEITURA DO RIO DE JANEIRO - RJ',
      'GOVERNO DE SÃO PAULO - SP',
      'GOVERNO DE SÃO PAULO - SPPREV - SP',
      'PREFEITURA DE BAURU - SP',
      'PREFEITURA DE CAJAMAR - SP',
      'PREFEITURA DE CAMPINAS - SP',
      'PREFEITURA DE GUARULHOS - SP',
      'PREFEITURA DE ITU - SP',
      'PREFEITURA DE RIBEIRÃO PRETO - SP',
      'PREFEITURA DE SANTOS - SP',
      'PREFEITURA DE SÃO JOSÉ DO RIO PRETO - SP',
      'PREFEITURA DE SÃO PAULO - SP',
      'PREFEITURA DE SÃO PAULO - IPREM - SP',
      'PREFEITURA DE TAUBATÉ - SP',
    ],
    MUNICIPAL: [
      'PREF SP', 'PREF RJ', 'PREF BH', 'PREF SÃO LUIS', 'PREF CAMPO GRANDE', 'PREF CURITIBA',
    ],
    INSS: ['INSS', 'APOSENTADO', 'PENSIONISTA', 'BPC LOAS'],
    CLT: ['CLT - DATAPREV'],
  },

  _ENTIDADE_LABELS: {
    INSS: 'Categoria INSS',
    CLT: 'Entidade CLT',
    DEFAULT: 'Entidade / Órgão',
  },

  /** Situações disponíveis para o vendedor marcar na proposta. */
  /** Banco comprado (planilha Alteração Banco comprado). */
  _BANCOS_COMPRADOS: [
    '001 - Banco do Brasil S.A.',
    '237 - Banco Bradesco S.A.',
    '104 - Caixa Econômica Federal',
    '341 - Itaú Unibanco S.A.',
    '033 - Banco Santander (Brasil) S.A.',
    '260 - Nu Pagamentos S.A. (Nubank)',
    '077 - Banco Inter S.A.',
    '290 - PagBank (PagSeguro)',
    '336 - Banco C6 S.A',
    '380 - Mercantil do Brasil',
    '318 - BMG',
    '707 - Daycoval',
    '329 - Fintech do Corban',
    '654 - Digimais',
    '465 - Capital Consig',
    '643 - Banco Pine',
    '643 - Banco Amigoz',
    '321 - 321bank',
    '149 - Facta',
    '121 - Agibank',
    '422 - Safra Financeira',
    '069 - Crefisa',
  ],

  /** Banco para digitação — preenchido pelo vendedor após a simulação. */
  _BANCOS_DIGITADOS: [
    'Banco Neo',
    'Banco Aki',
    'Banco Amigoz',
    'Banco BTW',
    'Banco Digio',
  ],

  /** Tipo de operação — preenchido pelo vendedor; operacional digita conforme informado. */
  _TIPOS_OPERACAO: [
    'Margem Facultativa',
    'Cartão Benefício',
    'Cartão Consignado',
    'Compra Cartão Benefício',
    'Compra Cartão Consignado',
  ],

  _VENDOR_SITUACOES: [
    { v: 'Em Andamento', l: 'Em Andamento' },
    { v: 'Digitação', l: 'Digitação' },
    { v: 'AG. BOLETO', l: 'Aguardando boleto' },
    { v: 'PROPOSTA DIGITADA', l: 'Proposta digitada' },
    { v: 'AG. ASS TERMO', l: 'Aguardando assinatura do termo' },
    { v: 'AG. VÍDEO', l: 'Aguardando Vídeo' },
    { v: 'AG. DOCS GARANTIA', l: 'Aguardando Documentos de Garantia' },
    { v: 'AG. ASS PROPOSTA', l: 'Aguardando assinatura da proposta' },
    { v: 'BOLETO VALIDADO', l: 'Boleto validado' },
    { v: 'AG. QUITAÇÃO', l: 'Aguardando quitação' },
    { v: 'BOLETO QUITADO', l: 'Boleto quitado' },
    { v: 'AG. LIBERAÇÃO MARGEM', l: 'Aguardando liberação de margem' },
    { v: 'AVERBADO', l: 'Averbado' },
    { v: 'PAGO', l: 'Pago' },
    { v: 'Pendenciado', l: 'Pendenciado' },
    { v: 'Cancelado', l: 'Cancelado' },
  ],

  /** Papéis que podem abrir Configurar cadastro de proposta. */
  _canManageProposalCatalog: function() {
    const r = this._normProposalManageRole(
      typeof Auth !== 'undefined' && Auth.getSession?.()?.role
    );
    return [
      'master', 'fundador', 'desenvolvedor', 'gerente', 'gerencia', 'diretoria',
      'sup_backoffice', 'backoffice', 'operacional', 'financeiro', 'financial',
    ].includes(r);
  },

  _proposalCatalogApiUrl: function(action) {
    const cfg = (typeof window !== 'undefined' && window.SOUBLU_CONFIG) ? window.SOUBLU_CONFIG : {};
    const apiBase = String(cfg.API_BASE_URL || cfg.SITE_URL || '').replace(/\/+$/, '')
      || (typeof location !== 'undefined' ? location.origin : '');
    return `${apiBase}/api/proposal-catalog.php?action=${encodeURIComponent(action || 'get')}`;
  },

  /**
   * _loadProposalCatalog — busca overrides do servidor e aplica nos selects da esteira.
   * Se a API falhar, mantém defaults em _PRODUTOS / _CONVENIOS (código abaixo).
   */
  _loadProposalCatalog: async function() {
    if (this._catalogLoadPromise) return this._catalogLoadPromise;
    this._catalogLoadPromise = (async () => {
      try {
        const cfg = (typeof window !== 'undefined' && window.SOUBLU_CONFIG) ? window.SOUBLU_CONFIG : {};
        const apiKey = String(cfg.API_KEY || '').trim();
        if (!apiKey) return;
        const res = await fetch(this._proposalCatalogApiUrl('get'), {
          headers: { 'X-API-Key': apiKey },
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        if (data?.ok && data.overrides) {
          this._applyCatalogOverrides(data.overrides);
        }
} catch (e) {
        console.warn('[Proposals] catálogo remoto:', e?.message || e);
      }
    })();
    return this._catalogLoadPromise;
  },

  /** Aplica overrides salvos (mescla entidades; substitui listas simples). */
  _applyCatalogOverrides: function(overrides) {
    if (!overrides || typeof overrides !== 'object') return;
    this._catalogOverrides = overrides;
    if (Array.isArray(overrides.produtos) && overrides.produtos.length) {
      this._PRODUTOS = overrides.produtos.map((p) => {
        const v = String(p.v || p).trim();
        return { v, l: String(p.l || v) };
      });
    }
    if (Array.isArray(overrides.convenios) && overrides.convenios.length) {
      this._CONVENIOS = overrides.convenios.map((c) => String(c).trim().toUpperCase()).filter(Boolean);
    }
    if (overrides.convenioEntidades && typeof overrides.convenioEntidades === 'object') {
      Object.assign(this._CONVENIO_ENTIDADES, overrides.convenioEntidades);
    }
    if (Array.isArray(overrides.vendorSituacoes) && overrides.vendorSituacoes.length) {
      this._VENDOR_SITUACOES = overrides.vendorSituacoes.map((o) => ({
        v: String(o.v || o.value || '').trim(),
        l: String(o.l || o.label || o.v || '').trim(),
      })).filter((o) => o.v);
    }
    if (Array.isArray(overrides.bancosComprados) && overrides.bancosComprados.length) {
      this._BANCOS_COMPRADOS = overrides.bancosComprados.slice();
    }
    if (Array.isArray(overrides.bancosDigitados) && overrides.bancosDigitados.length) {
      this._BANCOS_DIGITADOS = overrides.bancosDigitados.slice();
    }
    if (Array.isArray(overrides.tiposOperacao) && overrides.tiposOperacao.length) {
      this._TIPOS_OPERACAO = overrides.tiposOperacao.slice();
    }
    ['propEtapaVendedor', 'empPropEtapa', 'managePropStatusOp', 'proposalStatusFilterHeader'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) delete el.dataset.situLoaded;
    });
    ['propProduct', 'empPropProduct', 'propBancoComprado', 'propBancoDigitado', 'propTipoOperacao'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) delete el.dataset.catalogBound;
    });
  },

  _catalogEntidadesToText: function() {
    const map = this._getConvenioEntidadesMap();
    const lines = [];
    Object.keys(map).sort().forEach((k) => {
      lines.push(`[${k}]`);
      (map[k] || []).forEach((e) => lines.push(e));
      lines.push('');
    });
    return lines.join('\n').trim();
  },

  _parseCatalogEntidadesText: function(text) {
    const map = {};
    let current = null;
    String(text || '').split(/\r?\n/).forEach((line) => {
      const t = line.trim();
      if (!t) return;
      const m = t.match(/^\[(.+)\]$/);
      if (m) {
        current = m[1].trim().toUpperCase();
        if (!map[current]) map[current] = [];
        return;
      }
      if (current) map[current].push(t);
    });
    return map;
  },

  _catalogFormsToOverrides: function() {
    const gv = (id) => document.getElementById(id)?.value || '';
    const lines = (s) => String(s || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const produtos = lines(gv('propCatProdutos'));
    const convenios = lines(gv('propCatConvenios')).map((c) => c.toUpperCase());
    const situRaw = lines(gv('propCatSituacoes'));
    const vendorSituacoes = situRaw.map((row) => {
      const p = row.split('|');
      const v = (p[0] || '').trim();
      const l = (p[1] || v).trim();
      return v ? { v, l } : null;
    }).filter(Boolean);
    return {
      produtos,
      convenios,
      convenioEntidades: this._parseCatalogEntidadesText(gv('propCatEntidades')),
      vendorSituacoes,
      bancosComprados: lines(gv('propCatBancosComprados')),
      bancosDigitados: lines(gv('propCatBancosDigitados')),
      tiposOperacao: lines(gv('propCatTiposOperacao')),
    };
  },

  openCatalogConfigModal: async function() {
    if (!this._canManageProposalCatalog()) {
      showToast('Sem permissão para configurar o cadastro.', 'error');
      return;
    }
    await this._loadProposalCatalog();
    this._ensureProposalManageToolbar();
    const modal = document.getElementById('propCatalogConfigModal');
    if (!modal) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    set('propCatProdutos', (this._PRODUTOS || []).map((o) => o.v || o).join('\n'));
    set('propCatConvenios', (this._CONVENIOS || []).join('\n'));
    set('propCatEntidades', this._catalogEntidadesToText());
    set('propCatSituacoes', (this._VENDOR_SITUACOES || []).map((o) => `${o.v}|${o.l}`).join('\n'));
    set('propCatBancosComprados', (this._BANCOS_COMPRADOS || []).join('\n'));
    set('propCatBancosDigitados', (this._BANCOS_DIGITADOS || []).join('\n'));
    set('propCatTiposOperacao', (this._TIPOS_OPERACAO || []).join('\n'));
    const firstTab = document.querySelector('#propCatalogConfigModal .prop-catalog-tab');
    this.switchCatalogConfigTab('propCatPanelProdutos', firstTab);
    if (typeof openModal === 'function') openModal('propCatalogConfigModal');
    else { modal.classList.add('open'); modal.style.display = 'flex'; }
},

  saveCatalogConfig: async function() {
    if (!this._canManageProposalCatalog()) {
      showToast('Sem permissão.', 'error');
      return;
    }
    const overrides = this._catalogFormsToOverrides();
    if (!overrides.produtos.length || !overrides.convenios.length) {
      showToast('Informe ao menos 1 produto e 1 convênio.', 'warning');
      return;
    }
    const cfg = (typeof window !== 'undefined' && window.SOUBLU_CONFIG) ? window.SOUBLU_CONFIG : {};
    const apiKey = String(cfg.API_KEY || '').trim();
    const role = typeof Auth !== 'undefined' ? Auth.getSession()?.role : '';
    try {
      const res = await fetch(this._proposalCatalogApiUrl('save'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ role, overrides }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error || 'Falha ao salvar');
      this._applyCatalogOverrides(data.overrides || overrides);
      this._initStaticProposalSelects();
      if (typeof closeModal === 'function') closeModal('propCatalogConfigModal');
      showToast('Cadastro de proposta atualizado.', 'success');
      void this.renderAdminList({ soft: true, forceRefresh: true });
} catch (e) {
      showToast(String(e?.message || e || 'Erro ao salvar configuração'), 'error');
    }
  },

  /**
   * _removeKanbanUi — remove visualização kanban/esteira (só lista na gestão de propostas).
   */
  _removeKanbanUi: function() {
    document.querySelector('.esteira-view-toggle')?.remove();
    document.getElementById('esteiraViewList')?.closest('.esteira-view-toggle')?.remove();
    document.getElementById('masterKanbanArea')?.remove();
    const card = document.querySelector('#secManageProposals .proposals-list-card');
    if (card) card.style.display = '';
    try { localStorage.removeItem('soublu_esteira_view'); } catch (_) { /* noop */ }
  },

  /**
   * _ensureProposalManageToolbar — busca/config/botões; no desktop sobe para o topbar ao lado de Minha Conta.
   */
  _ensureProposalManageToolbar: function() {
    this._removeKanbanUi();
    const sec = document.getElementById('secManageProposals');
    if (!sec) return;

    let headerActions = document.getElementById('propManageTopbarTools')
      || sec.querySelector('.prop-manage-header-actions')
      || sec.querySelector('.page-header > div[style*="display:flex"]');
    if (!headerActions) return;
    headerActions.id = 'propManageTopbarTools';
    headerActions.classList.add('prop-manage-header-actions');

    // Remove controles soltos na barra (ficam só dentro do modal Configuração).
    document.getElementById('btnPropCatalogConfig')?.remove();
    document.getElementById('btnLimparPropostasDuplicadas')?.remove();
    headerActions.querySelector('button[onclick*="exportAdminCsv"]')?.remove();

    const searchBar = headerActions.querySelector('.search-bar');
    if (searchBar) {
      searchBar.classList.add('prop-search-bar--wide');
      searchBar.style.width = '';
    }

    this._ensureManageConfigModal(headerActions);
    this._ensureLivecredDateFilter();

    if (!document.getElementById('btnPropManageConfig')) {
      const cfgBtn = document.createElement('button');
      cfgBtn.type = 'button';
      cfgBtn.id = 'btnPropManageConfig';
      cfgBtn.className = 'btn btn-outline btn-sm';
      cfgBtn.title = 'Filtro de data, exportar CSV, limpar clones e cadastro';
      cfgBtn.textContent = '⚙ Configuração';
      cfgBtn.onclick = () => this.openManageConfigModal();
      const clienteBtn = headerActions.querySelector('button[onclick*="openClientModalAdmin"]');
      if (clienteBtn) headerActions.insertBefore(cfgBtn, clienteBtn);
      else headerActions.appendChild(cfgBtn);
    }

    const oldCat = document.getElementById('propCatalogConfigModal');
    if (oldCat && !oldCat.querySelector('.prop-catalog-modal')) oldCat.remove();
    const oldManage = document.getElementById('propManageConfigModal');
    // Recria modal antigo (com datas embutidas) — filtro agora é barra Livecred na lista.
    if (oldManage && oldManage.dataset.ui !== 'livecred-dates') {
      oldManage.remove();
    }

    if (!document.getElementById('propCatalogConfigModal')) {
      this._ensureCatalogConfigModalBody();
    }
    this._ensureProposalTableScrollContainer();
    this._bindProposalResponsiveLayout();
    this._syncProposalToolsPlacement();
    this._syncProposalResponsiveLayout();
  },

  /**
   * _syncProposalTopbarToolsVisibility — mostra a barra no topbar só na Gestão de Propostas.
   */
  _syncProposalTopbarToolsVisibility: function() {
    const tools = document.getElementById('propManageTopbarTools');
    if (!tools) return;
    const sec = document.getElementById('secManageProposals');
    const active = !!(sec && sec.classList.contains('active'));
    tools.hidden = !active;
    tools.style.display = active ? '' : 'none';
    document.body.classList.toggle('prop-manage-tools-active', active);
  },

  /**
   * _syncProposalToolsPlacement — desktop: topbar ao lado de Minha Conta; mobile: volta ao page-header.
   */
  _syncProposalToolsPlacement: function() {
    const tools = document.getElementById('propManageTopbarTools')
      || document.querySelector('.prop-manage-header-actions');
    const sec = document.getElementById('secManageProposals');
    if (!tools || !sec) return;
    const pageHeader = sec.querySelector('.page-header');
    const mobile = this._isProposalMobileLayout();
    let topbarActions = document.querySelector('.topbar .topbar-actions, header.topbar .topbar-actions');
    if (!topbarActions) {
      const topbar = document.querySelector('.topbar, header.topbar');
      if (topbar && !mobile) {
        topbarActions = document.createElement('div');
        topbarActions.className = 'topbar-actions';
        topbar.appendChild(topbarActions);
      }
    }
    if (!mobile && topbarActions) {
      const anchor = topbarActions.querySelector('.minha-conta-topbar')
        || topbarActions.querySelector('button[onclick*="openMinhaConta"]')
        || topbarActions.querySelector('button[onclick*="Auth.logout"]');
      if (tools.parentElement !== topbarActions) {
        if (anchor) topbarActions.insertBefore(tools, anchor);
        else topbarActions.prepend(tools);
      }
      pageHeader?.classList.add('prop-page-header--tools-in-topbar');
    } else if (pageHeader) {
      if (tools.parentElement !== pageHeader) pageHeader.appendChild(tools);
      pageHeader.classList.remove('prop-page-header--tools-in-topbar');
    }
    this._syncProposalTopbarToolsVisibility();
},

  /**
   * _ensureLivecredDateFilter — faixa de filtro no padrão Livecred (acima da tabela).
   * Radios Cadastro/Digitação/Pagamento + Data Inicial/Final + Consultar/Limpar.
   * Consultar aplica o filtro (não aplica ao digitar a data, como no Livecred).
   */
  _ensureLivecredDateFilter: function() {
    const sec = document.getElementById('secManageProposals');
    if (!sec) return;

    // Tira datas do topbar/header — só na faixa acima da lista.
    document.getElementById('propManageConfigDatesPanel')?.remove();
    document.querySelectorAll('#propManageTopbarTools .proposal-date-filter, #secManageProposals .page-header .proposal-date-filter').forEach((el) => {
      el.remove();
    });

    let wrap = document.getElementById('proposalLivecredDateFilter');
    const card = sec.querySelector('.proposals-list-card');
    const needRebuild = wrap && wrap.dataset.ui !== 'livecred-radios';
    if (needRebuild) wrap.remove();
    wrap = document.getElementById('proposalLivecredDateFilter');

    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'proposalLivecredDateFilter';
      wrap.className = 'proposal-date-filter proposal-date-filter--livecred';
      wrap.dataset.ui = 'livecred-radios';
      wrap.innerHTML = `
        <div class="prop-date-filter__title">Consulta por período</div>
        <div class="prop-date-filter__radios" role="radiogroup" aria-label="Tipo de data">
          <label class="prop-date-filter__radio">
            <input type="radio" name="proposalDateFieldRadio" value="criacao"/>
            <span>Cadastro</span>
          </label>
          <label class="prop-date-filter__radio">
            <input type="radio" name="proposalDateFieldRadio" value="digitacao"/>
            <span>Digitação</span>
          </label>
          <label class="prop-date-filter__radio">
            <input type="radio" name="proposalDateFieldRadio" value="pagamento"/>
            <span>Pagamento</span>
          </label>
        </div>
        <div class="prop-date-filter__row">
          <div class="prop-date-filter__field">
            <label for="proposalDateFrom">Data Inicial</label>
            <input type="date" id="proposalDateFrom" class="form-control" title="Data inicial"/>
          </div>
          <div class="prop-date-filter__field">
            <label for="proposalDateTo">Data Final</label>
            <input type="date" id="proposalDateTo" class="form-control" title="Data final"/>
          </div>
          <input type="hidden" id="proposalDateField" value="criacao"/>
          <div class="prop-date-filter__actions">
            <button type="button" class="btn btn-primary btn-sm" id="proposalDateApplyBtn">Consultar</button>
            <button type="button" class="btn btn-outline btn-sm" id="proposalDateClearBtn">Limpar</button>
          </div>
        </div>`;
    }

    // Posição: logo acima da tabela de propostas.
    if (card && wrap.parentElement !== card.parentElement) {
      card.parentElement.insertBefore(wrap, card);
    } else if (!wrap.parentElement && sec) {
      sec.appendChild(wrap);
    }

    // Remove IDs duplicados fora desta faixa.
    document.querySelectorAll('#proposalDateFrom, #proposalDateTo, #proposalDateField').forEach((el) => {
      if (wrap.contains(el)) return;
      el.closest('.prop-date-filter__field, label')?.remove() || el.remove();
    });

    const fieldEl = document.getElementById('proposalDateField');
    const fromEl = document.getElementById('proposalDateFrom');
    const toEl = document.getElementById('proposalDateTo');
    const applyBtn = document.getElementById('proposalDateApplyBtn');
    const clearBtn = document.getElementById('proposalDateClearBtn');
    const radios = wrap.querySelectorAll('input[name="proposalDateFieldRadio"]');

    /**
     * _syncDateFieldFromRadios — grava o radio ativo no hidden #proposalDateField.
     * Mantém _getAdminDateFilter lendo um único id, como antes.
     */
    const syncFieldFromRadios = () => {
      const checked = wrap.querySelector('input[name="proposalDateFieldRadio"]:checked');
      const val = checked ? checked.value : (this._adminList.dateField || 'criacao');
      if (fieldEl) fieldEl.value = val;
      this._adminList.dateField = val;
    };

    radios.forEach((r) => {
      if (r.dataset.bound) return;
      r.dataset.bound = '1';
      r.addEventListener('change', () => syncFieldFromRadios());
    });

    // Só Consultar/Limpar disparam a lista — padrão Livecred (não filtra ao mudar a data).
    if (applyBtn && !applyBtn.dataset.bound) {
      applyBtn.dataset.bound = '1';
      applyBtn.addEventListener('click', () => {
        syncFieldFromRadios();
        this.onAdminDateFilter();
      });
    }
    if (clearBtn && !clearBtn.dataset.bound) {
      clearBtn.dataset.bound = '1';
      clearBtn.addEventListener('click', () => this.clearAdminDateFilter());
    }

    const curField = this._adminList.dateField || 'criacao';
    if (fieldEl) fieldEl.value = curField;
    radios.forEach((r) => { r.checked = (r.value === curField); });
    if (fromEl) fromEl.value = this._adminList.dateFrom || '';
    if (toEl) toEl.value = this._adminList.dateTo || '';
  },

  /**
   * _normalizeManageConfigDateSlot — legado (datas saíram do modal; no-op seguro).
   */
  _normalizeManageConfigDateSlot: function() { /* datas na faixa Livecred */ },

  /**
   * _ensureDateFilterHome — mantém a faixa Livecred acima da tabela.
   */
  _ensureDateFilterHome: function() {
    this._ensureLivecredDateFilter();
    return document.getElementById('proposalLivecredDateFilter');
  },

  /** Modal único de configuração da gestão de propostas (sem filtro de data — fica na lista). */
  _ensureManageConfigModal: function(headerActions) {
    this._ensureLivecredDateFilter();
    void headerActions;

    if (!document.getElementById('propManageConfigModal')) {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.id = 'propManageConfigModal';
      modal.dataset.ui = 'livecred-dates';
      modal.innerHTML = `
        <div class="modal prop-manage-config-modal">
          <div class="modal-header">
            <div class="prop-manage-config-header-text">
              <h3>Configuração</h3>
              <p>Gestão de propostas</p>
            </div>
            <button type="button" class="modal-close" onclick="Proposals.closeManageConfigModal()" aria-label="Fechar"></button>
          </div>
          <div class="modal-body prop-manage-config-body">
            <div class="prop-manage-config-panel">
              <h4 class="prop-manage-config-panel__title">Ferramentas</h4>
              <ul class="prop-manage-config-menu" role="menu">
                <li role="none">
                  <button type="button" role="menuitem" id="propCfgBtnCatalog" onclick="Proposals.openCatalogFromManageConfig()">
                    Configurar cadastro
                    <span>Produtos, convênios e status</span>
                  </button>
                </li>
                <li role="none">
                  <button type="button" role="menuitem" onclick="Proposals.exportAdminExcel(); Proposals.closeManageConfigModal();">
                    Baixar Planilha
                    <span>Excel com os filtros atuais (inclui data de pagamento)</span>
                  </button>
                </li>
                <li role="none" class="prop-manage-config-menu__danger">
                  <button type="button" role="menuitem" id="propCfgBtnClones" onclick="Proposals.cleanupDuplicateProposals()">
                    Limpar clones
                    <span>Mesmo CPF, produto e banco</span>
                  </button>
                </li>
              </ul>
            </div>
          </div>
          <div class="modal-footer prop-manage-config-footer">
            <button type="button" class="btn btn-ghost btn-sm" onclick="Proposals.closeManageConfigModal()">Fechar</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }

    const catBtn = document.getElementById('propCfgBtnCatalog');
    if (catBtn) {
      const showCat = this._canManageProposalCatalog();
      catBtn.style.display = showCat ? '' : 'none';
      catBtn.closest('li')?.style.setProperty('display', showCat ? '' : 'none');
    }
    const cloneBtn = document.getElementById('propCfgBtnClones');
    if (cloneBtn) {
      const showClone = this._canDeleteProposal();
      cloneBtn.style.display = showClone ? '' : 'none';
      cloneBtn.closest('li')?.style.setProperty('display', showClone ? '' : 'none');
    }
  },

  _ensureCatalogConfigModalBody: function() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'propCatalogConfigModal';
    modal.innerHTML = `
      <div class="modal prop-catalog-modal" style="max-width:960px;">
        <div class="prop-catalog-hero">
          <div>
            <p class="prop-catalog-hero__eyebrow">SOU+BLU · Propostas</p>
            <h3>Configurar cadastro</h3>
            <p class="prop-catalog-hero__sub">Listas usadas em Nova Proposta e na gestão operacional</p>
          </div>
          <button type="button" class="modal-close prop-catalog-hero__close" onclick="closeModal('propCatalogConfigModal')" aria-label="Fechar"></button>
        </div>
        <div class="prop-catalog-tabs" role="tablist">
          <button type="button" class="prop-catalog-tab active" data-tab="propCatPanelProdutos" onclick="Proposals.switchCatalogConfigTab('propCatPanelProdutos', this)">📦 Produtos</button>
          <button type="button" class="prop-catalog-tab" data-tab="propCatPanelConvenios" onclick="Proposals.switchCatalogConfigTab('propCatPanelConvenios', this)">🏛 Convênios</button>
          <button type="button" class="prop-catalog-tab" data-tab="propCatPanelEntidades" onclick="Proposals.switchCatalogConfigTab('propCatPanelEntidades', this)">🏢 Entidades</button>
          <button type="button" class="prop-catalog-tab" data-tab="propCatPanelSituacoes" onclick="Proposals.switchCatalogConfigTab('propCatPanelSituacoes', this)">📋 Status</button>
          <button type="button" class="prop-catalog-tab" data-tab="propCatPanelBancos" onclick="Proposals.switchCatalogConfigTab('propCatPanelBancos', this)">🏦 Bancos</button>
        </div>
        <div class="modal-body prop-catalog-body">
          <div id="propCatPanelProdutos" class="prop-catalog-panel active">
            <div class="prop-catalog-hint">
              <strong>Uma opção por linha.</strong> Ex.: NOVO, CARTÃO, COMPRA DE DÍVIDA
            </div>
            <label class="prop-catalog-label" for="propCatProdutos">Produtos disponíveis</label>
            <textarea id="propCatProdutos" class="form-control prop-catalog-textarea" rows="10" spellcheck="false"></textarea>
          </div>
          <div id="propCatPanelConvenios" class="prop-catalog-panel">
            <div class="prop-catalog-hint">
              <strong>Convênios em MAIÚSCULAS</strong> — uma por linha (FEDERAL, INSS, CLT…)
            </div>
            <label class="prop-catalog-label" for="propCatConvenios">Convênios</label>
            <textarea id="propCatConvenios" class="form-control prop-catalog-textarea" rows="10" spellcheck="false"></textarea>
          </div>
          <div id="propCatPanelEntidades" class="prop-catalog-panel">
            <div class="prop-catalog-hint">
              Use bloco <code>[CONVÊNIO]</code> e liste os órgãos abaixo. Ex.: <code>[INSS]</code> na linha, depois APOSENTADO, PENSIONISTA…
            </div>
            <label class="prop-catalog-label" for="propCatEntidades">Entidades por convênio</label>
            <textarea id="propCatEntidades" class="form-control prop-catalog-textarea prop-catalog-textarea--tall" rows="14" spellcheck="false" placeholder="[INSS]&#10;APOSENTADO&#10;PENSIONISTA"></textarea>
          </div>
          <div id="propCatPanelSituacoes" class="prop-catalog-panel">
            <div class="prop-catalog-hint">
              Formato <code>VALOR|Rótulo</code> — ex.: <code>AG. BOLETO|Aguardando boleto</code>
            </div>
            <label class="prop-catalog-label" for="propCatSituacoes">Situações / status da esteira</label>
            <textarea id="propCatSituacoes" class="form-control prop-catalog-textarea prop-catalog-textarea--tall" rows="12" spellcheck="false"></textarea>
          </div>
          <div id="propCatPanelBancos" class="prop-catalog-panel">
            <div class="form-row prop-catalog-bancos-row">
              <div class="form-group" style="flex:1;margin-bottom:0;">
                <label class="prop-catalog-label" for="propCatBancosComprados">Bancos comprados</label>
                <textarea id="propCatBancosComprados" class="form-control prop-catalog-textarea" rows="8" spellcheck="false"></textarea>
              </div>
              <div class="form-group" style="flex:1;margin-bottom:0;">
                <label class="prop-catalog-label" for="propCatBancosDigitados">Bancos para digitação</label>
                <textarea id="propCatBancosDigitados" class="form-control prop-catalog-textarea" rows="8" spellcheck="false"></textarea>
              </div>
            </div>
            <label class="prop-catalog-label" for="propCatTiposOperacao" style="margin-top:16px;">Tipos de operação</label>
            <textarea id="propCatTiposOperacao" class="form-control prop-catalog-textarea" rows="5" spellcheck="false"></textarea>
          </div>
        </div>
        <div class="modal-footer prop-catalog-footer">
          <button type="button" class="btn btn-ghost" onclick="closeModal('propCatalogConfigModal')">Cancelar</button>
          <button type="button" class="btn btn-primary" onclick="Proposals.saveCatalogConfig()">Salvar configuração</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  },

  /** Troca aba do modal de cadastro (propCatPanel*). */
  switchCatalogConfigTab: function(panelId, btn) {
    const root = document.getElementById('propCatalogConfigModal');
    if (!root) return;
    root.querySelectorAll('.prop-catalog-tab').forEach((t) => t.classList.remove('active'));
    root.querySelectorAll('.prop-catalog-panel').forEach((p) => p.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.add('active');
  },

  openManageConfigModal: function() {
    this._ensureProposalManageToolbar();
    this._ensureDateFilterHome();
    if (typeof openModal === 'function') openModal('propManageConfigModal');
    else document.getElementById('propManageConfigModal')?.classList.add('open');
  },

  closeManageConfigModal: function() {
    if (typeof closeModal === 'function') closeModal('propManageConfigModal');
    else document.getElementById('propManageConfigModal')?.classList.remove('open');
  },

  applyManageConfigDateFilter: function() {
    this.onAdminDateFilter();
    this.closeManageConfigModal();
  },

  /** Limpa filtro De/Até e recarrega a lista. */
  clearAdminDateFilter: function() {
    this._syncAdminDateInputs('', '', this._adminList.dateField || 'criacao');
    this._adminList.page = 1;
    void this.renderAdminList({ forceRefresh: true });
    if (typeof showToast === 'function') showToast('Filtro de data removido.', 'info');
  },

  openCatalogFromManageConfig: function() {
    this.closeManageConfigModal();
    void this.openCatalogConfigModal();
  },

  _getConvenioEntidadesMap: function() {
    return this._CONVENIO_ENTIDADES;
  },

  _groupEntidadesByUf: function(opts) {
    const groups = {};
    (opts || []).forEach((o) => {
      const m = String(o).match(/ - ([A-Z]{2})$/);
      const uf = m ? m[1] : '—';
      if (!groups[uf]) groups[uf] = [];
      groups[uf].push(o);
    });
    const ufs = Object.keys(groups).sort((a, b) => {
      if (a === '—') return 1;
      if (b === '—') return -1;
      return a.localeCompare(b, 'pt-BR');
    });
    ufs.forEach((uf) => {
      groups[uf].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    });
    return { groups, ufs };
  },

  _normalizeConvenioKey: function(convenio) {
    const c = String(convenio || '').trim().toUpperCase();
    if (this._CONVENIO_ENTIDADES[c]) return c;
    if (c.includes('INSS')) return 'INSS';
    if (c === 'CLT' || c.includes('DATAPREV')) return 'CLT';
    return c;
  },

  _fixMojibake: function(str) {
    if (str == null || str === '') return '';
    let s = String(str);
    s = s.replace(/COMPRA DE D[\u251C\u00AD\u0094|\-\s]VIDA/gi, 'COMPRA DE DÍVIDA');
    s = s.replace(/COMPRA DE D.IVIDA/gi, 'COMPRA DE DÍVIDA');
    s = s.replace(/D[\u251C\u00AD\u0094|]VIDA/gi, 'DÍVIDA');
    if (/Ã./.test(s)) {
      try { s = decodeURIComponent(escape(s)); } catch (_) { /* noop */ }
    }
    return s;
  },

  _normalizeProductValue: function(product) {
    const raw = this._fixMojibake(String(product || '').trim());
    if (!raw) return '';
    const p = raw.toUpperCase();
    if (p === 'COMPRA DE DÍV' || p === 'COMPRA DE DIVIDA' || /^COMPRA DE D[\W]?IVIDA$/.test(p)) {
      return 'COMPRA DE DÍVIDA';
    }
    const known = (this._PRODUTOS || []).find(o => String(o.v || o).toUpperCase() === p);
    if (known) return known.v || known.l || raw;
    return raw;
  },

  _fillProductSelect: function(selectId, currentValue) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const cur = this._normalizeProductValue(currentValue != null ? currentValue : sel.value);
    let html = '<option value="">Selecione o Produto</option>';
    (this._PRODUTOS || []).forEach((o) => {
      const v = o.v || o;
      const l = o.l || o.v || o;
      html += `<option value="${this._escAttr(v)}"${cur === v ? ' selected' : ''}>${this._escHtml(l)}</option>`;
    });
    if (cur && !(this._PRODUTOS || []).some((o) => (o.v || o) === cur)) {
      html += `<option value="${this._escAttr(cur)}" selected>${this._escHtml(cur)}</option>`;
    }
    sel.innerHTML = html;
    if (cur) sel.value = cur;
  },

  _fillConvenioSelect: function(selectId, entidadeSelectId, currentValue) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const cur = String(currentValue != null ? currentValue : sel.value || '').trim().toUpperCase();
    let html = '<option value="">Selecione o Convênio</option>';
    (this._CONVENIOS || []).forEach((c) => {
      html += `<option value="${this._escAttr(c)}"${cur === c ? ' selected' : ''}>${this._escHtml(c)}</option>`;
    });
    if (cur && !(this._CONVENIOS || []).includes(cur)) {
      html += `<option value="${this._escAttr(cur)}" selected>${this._escHtml(cur)}</option>`;
    }
    sel.innerHTML = html;
    if (cur) sel.value = cur;
    if (entidadeSelectId) this._fillEntidadeSelect(entidadeSelectId, cur || sel.value);
  },

  _initProposalCatalogSelects: function() {
    ['propProduct', 'empPropProduct'].forEach((id) => this._fillProductSelect(id));
    this._fillConvenioSelect('propConvenio', 'propEntidade');
    this._fillConvenioSelect('empPropConvenio', 'empPropEntidade');
    const propConv = document.getElementById('propConvenio');
    if (propConv && !propConv.dataset.catalogBound) {
      propConv.dataset.catalogBound = '1';
      propConv.addEventListener('change', () => this.updateEntidades());
    }
    const empConv = document.getElementById('empPropConvenio');
    if (empConv && !empConv.dataset.catalogBound) {
      empConv.dataset.catalogBound = '1';
      empConv.addEventListener('change', () => this.updateEmployeeEntidades());
    }
  },

  _vendorSituacaoOptionsHtml: function(selected) {
    const sel = String(selected || '').trim();
    let html = '<option value="">Selecione</option>';
    let found = !sel;
    (this._VENDOR_SITUACOES || []).forEach(o => {
      const val = o.v || o;
      const lbl = o.l || o.v || o;
      if (sel === val) found = true;
      html += `<option value="${this._escAttr(val)}"${sel === val ? ' selected' : ''}>${this._escHtml(lbl)}</option>`;
    });
    // Status legado fora da lista — mantém valor visível sem precisar mudar duas vezes
    if (sel && !found) {
      html += `<option value="${this._escAttr(sel)}" selected>${this._escHtml(sel)}</option>`;
    }
    return html;
  },

  /**
   * _bindManageStatusSync — remove campo legado "Status Geral" se ainda existir no HTML em cache.
   * Status único: #managePropStatusOp (status + statusOp gravam o mesmo valor no save).
   */
  _bindManageStatusSync: function() {
    const legacy = document.getElementById('managePropStatus');
    if (!legacy) return;
    const grp = legacy.closest('.form-group');
    let prev = grp?.previousElementSibling;
    if (prev && prev.tagName === 'H4' && /status geral/i.test(prev.textContent || '')) {
      prev.remove();
    }
    grp?.remove();
},

  /**
   * _readManageStatusFromForm — lê o único select de status do modal de gestão.
   */
  _readManageStatusFromForm: function(gv, proposal, cached) {
    const ui = String(gv('managePropStatusOp') || gv('managePropStatus') || '').trim();
    if (ui) return ui;
    const base = cached || proposal || {};
    return String(base.statusOp || base.status_op || base.status || '').trim();
  },

  _fillBankSelect: function(selectId, catalog, currentValue) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const cur = String(currentValue != null ? currentValue : sel.value || '').trim();
    let html = '<option value="">Selecione o banco</option>';
    (catalog || []).forEach((label) => {
      html += `<option value="${this._escAttr(label)}"${cur === label ? ' selected' : ''}>${this._escHtml(label)}</option>`;
    });
    if (cur && !(catalog || []).includes(cur)) {
      html += `<option value="${this._escAttr(cur)}" selected>${this._escHtml(cur)}</option>`;
    }
    sel.innerHTML = html;
    if (cur) sel.value = cur;
  },

  _fillTipoOperacaoSelect: function(selectId, currentValue) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const cur = String(currentValue != null ? currentValue : sel.value || '').trim();
    let html = '<option value="">Selecione o tipo</option>';
    (this._TIPOS_OPERACAO || []).forEach((label) => {
      html += `<option value="${this._escAttr(label)}"${cur === label ? ' selected' : ''}>${this._escHtml(label)}</option>`;
    });
    if (cur && !(this._TIPOS_OPERACAO || []).includes(cur)) {
      html += `<option value="${this._escAttr(cur)}" selected>${this._escHtml(cur)}</option>`;
    }
    sel.innerHTML = html;
    if (cur) sel.value = cur;
  },

  _initBankSelects: function(preset) {
    const p = preset || {};
    this._fillBankSelect('propBancoComprado', this._BANCOS_COMPRADOS, p.bancoComprado);
    this._fillBankSelect('propBancoDigitado', this._BANCOS_DIGITADOS, p.bancoDigitado);
    this._fillBankSelect('managePropBanco', this._BANCOS_COMPRADOS, p.bancoComprado);
    this._fillBankSelect('managePropBancoDigitado', this._BANCOS_DIGITADOS, p.bancoDigitado);
    this._fillBankSelect('empPropBancoDigitado', this._BANCOS_DIGITADOS, p.bancoDigitado);
    this._fillTipoOperacaoSelect('propTipoOperacao', p.tipoOperacao);
    this._fillTipoOperacaoSelect('managePropTipoOperacao', p.tipoOperacao);
    this._fillTipoOperacaoSelect('empPropTipoOperacao', p.tipoOperacao);
  },

  _normTipoOperacao: function(p) {
    if (!p) return '';
    const meta = p.meta && typeof p.meta === 'object' ? p.meta : {};
    return String(
      p.tipoOperacao || p.tipo_operacao || meta.tipo_operacao || meta.tipoOperacao
      || this._obsLineValue(p.obs, 'Tipo de operação')
      || this._obsLineValue(p.obs, 'Tipo de operacao')
      || ''
    ).trim();
  },

  /** Se o banco para digitação mudou após o envio → força Pendenciado. */
  _applyBancoChangePendencia: function(proposal, oldBanco, newBanco) {
    const prev = String(oldBanco || '').trim();
    const next = String(newBanco || '').trim();
    if (!prev || !next || prev === next) return false;
    proposal.status = 'Pendenciado';
    proposal.statusOp = 'Pendenciado';
    proposal.status_op = 'Pendenciado';
    proposal.history = proposal.history || [];
    proposal.history.push({
      date: nowBrazilSql(),
      actorName: (typeof Auth !== 'undefined' && Auth.getSession?.()?.name) || 'Sistema',
      action: `Banco para digitação alterado: [${prev}] → [${next}] · status → Pendenciado`,
      note: 'Ajuste de banco após envio — proposta colocada em pendência para digitação correta.',
    });
    return true;
  },

  _initStaticProposalSelects: function() {
    this._initProposalCatalogSelects();
    this._initBankSelects();
    ['propEtapaVendedor', 'empPropEtapa', 'managePropStatusOp'].forEach(id => {
      const el = document.getElementById(id);
      if (!el || el.dataset.situLoaded) return;
      const cur = el.value;
      el.innerHTML = this._vendorSituacaoOptionsHtml(cur);
      el.dataset.situLoaded = '1';
    });
    this._fillAdminStatusFilterSelect();
    const tabFin = document.getElementById('managePropTabela');
    if (tabFin && !tabFin.dataset.tabelaLoaded) {
      this._fillTabelaSelect('managePropTabela', tabFin.value);
      tabFin.dataset.tabelaLoaded = '1';
    }
  },

  /** Filtro de status da lista admin/financeiro — espelha _VENDOR_SITUACOES. */
  _fillAdminStatusFilterSelect: function() {
    const sel = document.getElementById('proposalStatusFilterHeader');
    if (!sel || sel.dataset.situLoaded === '1') return;
    const cur = sel.value;
    let html = '<option value="">STATUS</option><option value="todos">TODOS OS STATUS</option>';
    (this._VENDOR_SITUACOES || []).forEach(o => {
      const val = o.v || o;
      const lbl = String(o.l || o.v || o).toUpperCase();
      html += `<option value="${this._escAttr(val)}">${this._escHtml(lbl)}</option>`;
    });
    sel.innerHTML = html;
    if (cur) sel.value = cur;
    sel.dataset.situLoaded = '1';
  },

  _fillEntidadeSelect: function(selectId, convenio, currentValue) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const conv = this._normalizeConvenioKey(convenio);
    const map = this._getConvenioEntidadesMap();
    const opts = map[conv] || [];
    const current = currentValue != null ? currentValue : sel.value;
    const label = this._ENTIDADE_LABELS[conv] || this._ENTIDADE_LABELS.DEFAULT;
    const labelEl = sel.closest('.form-group')?.querySelector('label');
    if (labelEl) labelEl.textContent = label;

    const emptyOpt = conv === 'INSS'
      ? 'Selecione a categoria'
      : 'Selecione o órgão / entidade';
    const { groups, ufs } = this._groupEntidadesByUf(opts);
    let html = `<option value="">${emptyOpt}</option>`;
    ufs.forEach((uf) => {
      const items = groups[uf] || [];
      const renderOpt = (o) => `<option value="${this._escAttr(o)}">${this._escHtml(o)}</option>`;
      if (uf === '—' || ufs.length === 1) {
        html += items.map(renderOpt).join('');
      } else {
        html += `<optgroup label="${this._escAttr(uf)}">`;
        html += items.map(renderOpt).join('');
        html += '</optgroup>';
      }
    });
    sel.innerHTML = html;
    if (current) {
      if (!opts.includes(current)) {
        sel.insertAdjacentHTML('beforeend',
          `<option value="${this._escAttr(current)}">${this._escHtml(current)}</option>`);
      }
      sel.value = current;
    }
  },

  _adminList: { page: 1, pageSize: 25, total: 0, vendorId: '', statusFilter: '', dateFrom: '', dateTo: '', dateField: 'criacao', sortField: '', sortDir: 'asc' },
  _employeeList: { page: 1, pageSize: 20, total: 0 },

  _applyMobileListLimits: function() {
    try {
      if (!this._isProposalMobileLayout()) return;
      this._adminList.pageSize = Math.min(this._adminList.pageSize || 25, 20);
      this._employeeList.pageSize = Math.min(this._employeeList.pageSize || 20, 15);
    } catch (_) { /* noop */ }
  },

  /**
   * _isProposalMobileLayout — celular/tablet estreito: cards em vez de tabela desktop.
   */
  _isProposalMobileLayout: function() {
    try {
      return (typeof window.isSoubluMobile === 'function' && window.isSoubluMobile())
        || (window.matchMedia && window.matchMedia('(max-width: 900px)').matches);
    } catch (_) {
      return (window.innerWidth || 0) <= 900;
    }
  },

  /**
   * _bindProposalResponsiveLayout — reage ao redimensionar (mobile ↔ desktop).
   */
  _bindProposalResponsiveLayout: function() {
    if (this._propResponsiveBound) return;
    this._propResponsiveBound = true;
    let timer;
    window.addEventListener('resize', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const wasMobile = document.getElementById('secManageProposals')?.classList.contains('prop-manage--mobile');
        this._syncProposalToolsPlacement();
        this._syncProposalResponsiveLayout();
        const isMobile = this._isProposalMobileLayout();
        if (wasMobile !== isMobile && document.getElementById('secManageProposals')?.classList.contains('active')) {
          void this.renderAdminList({ soft: true });
        }
      }, 220);
    });
  },

  /**
   * _ensureProposalMobileFilters — painel de filtros vertical (busca fica no header; datas aqui).
   */
  _ensureProposalMobileFilters: function() {
    const sec = document.getElementById('secManageProposals');
    if (!sec || document.getElementById('propMobileFilterPanel')) return;
    const card = sec.querySelector('.proposals-list-card');
    if (!card) return;
    const panel = document.createElement('div');
    panel.id = 'propMobileFilterPanel';
    panel.className = 'prop-mobile-filters';
    panel.innerHTML = `
      <p class="prop-mobile-filters__label">Período</p>
      <div id="propMobileDateSlot" class="prop-mobile-date-fields"></div>
      <div class="prop-mobile-filter-actions">
        <button type="button" class="btn btn-primary btn-block" onclick="Proposals.applyMobileDateFilter()">Filtrar</button>
        <button type="button" class="btn btn-outline btn-block" onclick="Proposals.clearAdminDateFilter()">Limpar filtros</button>
      </div>`;
    card.parentElement.insertBefore(panel, card);
  },

  /**
   * _syncProposalResponsiveLayout — alterna classes e reposiciona filtro de datas no mobile.
   */
  _syncProposalResponsiveLayout: function() {
    const sec = document.getElementById('secManageProposals');
    if (!sec) return;
    const mobile = this._isProposalMobileLayout();
    sec.classList.toggle('prop-manage--mobile', mobile);
    // Faixa Livecred fica acima da tabela (desktop e mobile).
    this._ensureDateFilterHome();
    const searchWrap = sec.querySelector('.prop-manage-header-actions .search-bar')
      || document.querySelector('#propManageTopbarTools .search-bar');
    if (searchWrap && !searchWrap.querySelector('.prop-mobile-search-label') && mobile) {
      const lbl = document.createElement('label');
      lbl.className = 'prop-mobile-search-label';
      lbl.setAttribute('for', 'proposalSearch');
      lbl.textContent = 'Buscar proposta';
      searchWrap.prepend(lbl);
    }
    const headerActions = document.getElementById('propManageTopbarTools')
      || sec.querySelector('.prop-manage-header-actions');
    if (headerActions) headerActions.classList.toggle('prop-manage-header-actions--stack', mobile);
  },

  /** Filtrar por data no painel mobile (sem abrir modal Configuração). */
  applyMobileDateFilter: function() {
    this.onAdminDateFilter();
    if (typeof showToast === 'function') showToast('Filtro aplicado.', 'success');
  },

  /**
   * _mobileProposalCardHtml — card compacto para celular (Ver detalhes abre modal completo).
   */
  _mobileProposalCardHtml: function(p, opts) {
    const fmtR = (v) => (v != null && v !== '' ? 'R$ ' + parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—');
    const stage = this._vendorStage(p);
    const statusLabel = this._proposalDisplayStatus(p);
    const badgeClass = this._proposalStatusBadgeClass(stage || p.status);
    const safeId = this._escAttr(p.id);
    const safeLabel = this._escAttr(p.numero || p.clientName || p.id);
    const isPartnerRow = !!opts.isPartner;
    const partnerBadge = isPartnerRow
      ? '<span class="badge badge-info proposal-badge-partner">Parceiro</span> '
      : '';
    const role = this._normProposalManageRole(typeof Auth !== 'undefined' && Auth.getSession()?.role);
    const adminOpensEdit = this._canEditNumeroValor(role);
    const canDelete = this._canDeleteProposal();
    const onDetails = adminOpensEdit
      ? `Proposals.openAdminModal('${safeId}', false)`
      : `Proposals.openAdminViewModal('${safeId}')`;
    const valorExibir = p.valorFinal != null && p.valorFinal !== '' ? p.valorFinal : p.valor;
    const delBtn = canDelete
      ? `<button type="button" class="btn btn-ghost btn-sm client-actions__btn--danger" data-prop-action="delete" data-prop-id="${safeId}" data-prop-label="${safeLabel}">Excluir</button>`
      : '';
    return `
      <article class="prop-mobile-card${isPartnerRow ? ' proposal-row--partner' : ''}" data-prop-id="${safeId}">
        <div class="prop-mobile-card__head">
          ${partnerBadge}<strong class="prop-mobile-card__num">${this._escHtml(p.numero || p.id)}</strong>
        </div>
        <dl class="prop-mobile-card__grid">
          <div class="prop-mobile-card__row"><dt>Cliente</dt><dd>${this._escHtml(p.clientName || '—')}</dd></div>
          <div class="prop-mobile-card__row"><dt>Vendedor</dt><dd>${this._escHtml(p.vendorName || '—')}</dd></div>
          <div class="prop-mobile-card__row"><dt>Valor</dt><dd class="prop-mobile-card__valor">${fmtR(valorExibir)}</dd></div>
          <div class="prop-mobile-card__row"><dt>Status</dt><dd><span class="badge ${badgeClass}">${this._escHtml(statusLabel)}</span></dd></div>
          <div class="prop-mobile-card__row"><dt>Data</dt><dd>${this._escHtml(this._propDateStr(p))}</dd></div>
        </dl>
        <div class="prop-mobile-card__actions" style="display:flex;gap:8px;margin-top:10px;">
          <button type="button" class="btn btn-primary btn-block prop-mobile-card__details" onclick="${onDetails}">Ver detalhes</button>
          ${delBtn}
        </div>
      </article>`;
  },
  _employeeEditCache: {},
  _adminEditCache: {},
  _adminListCache: null,
  _adminListCacheAt: 0,
  _ADMIN_LIST_CACHE_TTL: 120000,
  _searchDebounce: null,
  _PROP_TZ: 'America/Sao_Paulo',

  _propPerfLog: function() { /* noop — debug desligado */ },

  _withTimeout: function(promise, ms, label) {
    const lim = Math.max(5000, parseInt(ms, 10) || 45000);
    const tag = label || 'operação';
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Tempo esgotado (${tag}). Verifique a internet e tente novamente.`)), lim);
      }),
    ]);
  },

  /** Anexos só quando há upload novo — evita migração pesada em PCs lentos. */
  async _resolveAttachmentsForSaveQuick(proposalId, proposal, rootId) {
    if (this._hasPendingAnexoUploads(rootId)) {
      return this._withTimeout(
        this._prepareAttachmentsForSave(proposalId, proposal, rootId),
        90000,
        'Preparar anexos',
      );
    }
    if (proposal?.attachments && this._hasProposalAttachments(proposal.attachments)) {
      return this._parseAttachments(proposal.attachments);
    }
    return this._parseAttachments(proposal?.attachments);
  },

  _findAdminTableRow: function(id) {
    if (!id) return null;
    const tbody = document.getElementById('manageProposalsTbody');
    if (!tbody) return null;
    const sid = String(id);
    const esc = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(sid) : sid.replace(/"/g, '');
    let row = tbody.querySelector(`tr[data-prop-id="${esc}"]`);
    if (!row) {
      row = [...tbody.querySelectorAll('tr[data-prop-id]')].find((tr) => tr.getAttribute('data-prop-id') === sid);
    }
    return row || null;
  },

  _patchAdminTableRow: function(proposal) {
    const p = this._normProposal(proposal) || proposal;
    if (!p?.id) return false;
    const row = this._findAdminTableRow(p.id);
    if (!row) return false;
    const fmtR = (v) => (v != null && v !== '' ? 'R$ ' + parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—');
    const setCol = (name, html) => {
      const el = row.querySelector(`[data-col="${name}"]`);
      if (el) el.innerHTML = html;
    };
    setCol('protocolo', p.protocolo ? this._escHtml(p.protocolo) : '—');
    setCol('valor', fmtR(p.valor));
    setCol('valorFinal', `<strong style="color:var(--color-success);">${fmtR(p.valorFinal)}</strong>`);
    const stage = this._vendorStage(p);
    const statusLabel = this._proposalDisplayStatus(p);
    const badgeClass = this._proposalStatusBadgeClass(stage || p.status);
    setCol('status', `<span class="badge ${badgeClass}">${this._escHtml(statusLabel)}</span>`);
    const paidAt = (typeof DB !== 'undefined' && typeof DB.proposalPaidAt === 'function')
      ? DB.proposalPaidAt(p)
      : null;
    setCol('paidAt', paidAt ? this._escHtml(this._fmtDateTime(paidAt)) : '—');
    row.classList.add('proposal-row--saved-flash');
    setTimeout(() => row.classList.remove('proposal-row--saved-flash'), 1800);
    return true;
  },

  _hasPendingAnexoUploads: function(rootId) {
    const root = document.getElementById(rootId || this._folderRootId);
    if (root) {
      return [...root.querySelectorAll('input.prop-folder__input[type="file"]')]
        .some((inp) => !!(inp.files && inp.files[0]));
    }
    return this._getAllAnexoFieldDefs().some(({ id }) => !!document.getElementById(id)?.files?.[0]);
  },

  /** Une defs do estado + inputs reais do DOM (evita perder boleto se o contexto/slots dessincronizar). */
  _getAnexoUploadJobsFromDom: function(rootId) {
    const byGrupo = new Map();
    const put = (id, grupo, customNameId, prefer) => {
      if (!id || !grupo) return;
      const inp = document.getElementById(id);
      const hasFile = !!(inp?.files?.[0]);
      const prev = byGrupo.get(grupo);
      if (!prev) {
        byGrupo.set(grupo, { id, grupo, customNameId: customNameId || null });
        return;
      }
      /* Prefere o input que realmente tem arquivo (ex.: manageProp* vs empProp* stale). */
      if (prefer || (hasFile && !document.getElementById(prev.id)?.files?.[0])) {
        byGrupo.set(grupo, { id, grupo, customNameId: customNameId || prev.customNameId || null });
      } else if (customNameId && !prev.customNameId) {
        prev.customNameId = customNameId;
      }
    };
    const root = document.getElementById(rootId || this._folderRootId);
    if (root) {
      root.querySelectorAll('input.prop-folder__input[type="file"]').forEach((inp) => {
        if (!inp?.id || !inp.files?.[0]) return;
        let grupo = inp.getAttribute('data-grupo') || '';
        if (!grupo) {
          const hit = this._getAllAnexoFieldDefs().find((d) => d.id === inp.id);
          grupo = hit?.grupo || '';
        }
        if (!grupo) {
          for (const cat of (this._ANEXO_CATEGORIES || [])) {
            const suf = String(cat.folderIdSuffix || '');
            if (!suf) continue;
            const esc = suf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (cat.initialSlots?.length) {
              const slot = cat.initialSlots.find((s) =>
                String(inp.id).endsWith(suf + (s.slotSuffix || '')));
              if (slot?.grupo) { grupo = slot.grupo; break; }
            }
            const m = String(inp.id).match(new RegExp(esc + '(\\d+)$', 'i'));
            if (m) { grupo = cat.grupoPrefix + m[1]; break; }
          }
        }
        if (!grupo) {
          const m2 = String(inp.id).match(/Custom_([^_]+)_(\d+)$/i);
          if (m2) grupo = `custom_${m2[1]}_${m2[2]}`;
        }
        put(inp.id, grupo, null, true);
      });
    }
    this._getAllAnexoFieldDefs().forEach((d) => put(d.id, d.grupo, d.customNameId, false));
    return [...byGrupo.values()];
  },

  _attachmentAlreadyOnStorage: function(att, key) {
    const caminho = String(att[key + '_caminho'] || '').trim();
    const url = String(att[key] || '').trim();
    if (caminho && /proposal-attachments\//i.test(caminho)) return true;
    if (/file\.php/i.test(url)) return true;
    if (/\/storage\/v1\/object\//i.test(url)) return true;
    if (caminho && !this._isLocawebProposalUploadUrl(caminho)) return true;
    return false;
  },

  /** Tabelas financeiras (valor final = valor bruto × pct) — AMIGOZ/NEO/AKI Ago/2026 + FUTURO TABELAS 2 set/2026. */
  _TABELA_GROUPS: [
    {
      group: "AMIGOZ — GOV MG RCC",
      items: [
        { value: "AMIGOZ_GOVMG_RCC_450_100", label: "AMIGOZ GOV MG RCC TX 4,50 — 100%", pct: 1.0 },
        { value: "AMIGOZ_GOVMG_RCC_425_85", label: "AMIGOZ GOV MG RCC TX 4,25 — 85%", pct: 0.85 },
        { value: "AMIGOZ_GOVMG_RCC_399_65", label: "AMIGOZ GOV MG RCC TX 3,99 — 65%", pct: 0.65 },
        { value: "AMIGOZ_GOVMG_RCC_375_50", label: "AMIGOZ GOV MG RCC TX 3,75 — 50%", pct: 0.5 },
        { value: "AMIGOZ_GOVMG_RCC_350_45", label: "AMIGOZ GOV MG RCC TX 3,50 — 45%", pct: 0.45 },
      ],
    },
    {
      group: "AMIGOZ — GOV MG RMC",
      items: [
        { value: "AMIGOZ_GOVMG_RMC_450_100", label: "AMIGOZ GOV MG RMC TX 4,50 — 100%", pct: 1.0 },
        { value: "AMIGOZ_GOVMG_RMC_425_85", label: "AMIGOZ GOV MG RMC TX 4,25 — 85%", pct: 0.85 },
        { value: "AMIGOZ_GOVMG_RMC_399_65", label: "AMIGOZ GOV MG RMC TX 3,99 — 65%", pct: 0.65 },
        { value: "AMIGOZ_GOVMG_RMC_375_50", label: "AMIGOZ GOV MG RMC TX 3,75 — 50%", pct: 0.5 },
        { value: "AMIGOZ_GOVMG_RMC_350_45", label: "AMIGOZ GOV MG RMC TX 3,50 — 45%", pct: 0.45 },
      ],
    },
    {
      group: "AMIGOZ — GOV PB RMC",
      items: [
        { value: "AMIGOZ_GOVPB_RMC_500_100", label: "AMIGOZ GOV PB RMC TX 5,00 — 100%", pct: 1.0 },
        { value: "AMIGOZ_GOVPB_RMC_450_85", label: "AMIGOZ GOV PB RMC TX 4,50 — 85%", pct: 0.85 },
        { value: "AMIGOZ_GOVPB_RMC_398_55", label: "AMIGOZ GOV PB RMC TX 3,98 — 55%", pct: 0.55 },
        { value: "AMIGOZ_GOVPB_RMC_375_35", label: "AMIGOZ GOV PB RMC TX 3,75 — 35%", pct: 0.35 },
        { value: "AMIGOZ_GOVPB_RMC_350_12", label: "AMIGOZ GOV PB RMC TX 3,50 — 12%", pct: 0.12 },
      ],
    },
    {
      group: "AMIGOZ — GOV SP RMC",
      items: [
        { value: "AMIGOZ_GOVSP_RMC_450_100", label: "AMIGOZ GOV SP RMC TX 4,50 — 100%", pct: 1.0 },
        { value: "AMIGOZ_GOVSP_RMC_398_85", label: "AMIGOZ GOV SP RMC TX 3,98 — 85%", pct: 0.85 },
        { value: "AMIGOZ_GOVSP_RMC_375_55", label: "AMIGOZ GOV SP RMC TX 3,75 — 55%", pct: 0.55 },
        { value: "AMIGOZ_GOVSP_RMC_350_35", label: "AMIGOZ GOV SP RMC TX 3,50 — 35%", pct: 0.35 },
        { value: "AMIGOZ_GOVSP_RMC_325_12", label: "AMIGOZ GOV SP RMC TX 3,25 — 12%", pct: 0.12 },
      ],
    },
    {
      group: "AMIGOZ — GOV SP CELETISTA RMC",
      items: [
        { value: "AMIGOZ_GOVSPCELETISTA_RMC_500_100", label: "AMIGOZ GOV SP CELETISTA RMC TX 5,00 — 100%", pct: 1.0 },
      ],
    },
    {
      group: "AMIGOZ — GOV SP CELETISTA RCC",
      items: [
        { value: "AMIGOZ_GOVSPCELETISTA_RCC_500_100", label: "AMIGOZ GOV SP CELETISTA RCC TX 5,00 — 100%", pct: 1.0 },
      ],
    },
    {
      group: "AMIGOZ — GOV SP RCC",
      items: [
        { value: "AMIGOZ_GOVSP_RCC_450_100", label: "AMIGOZ GOV SP RCC TX 4,50 — 100%", pct: 1.0 },
        { value: "AMIGOZ_GOVSP_RCC_398_85", label: "AMIGOZ GOV SP RCC TX 3,98 — 85%", pct: 0.85 },
        { value: "AMIGOZ_GOVSP_RCC_375_55", label: "AMIGOZ GOV SP RCC TX 3,75 — 55%", pct: 0.55 },
        { value: "AMIGOZ_GOVSP_RCC_350_35", label: "AMIGOZ GOV SP RCC TX 3,50 — 35%", pct: 0.35 },
        { value: "AMIGOZ_GOVSP_RCC_325_12", label: "AMIGOZ GOV SP RCC TX 3,25 — 12%", pct: 0.12 },
      ],
    },
    {
      group: "AMIGOZ — GOV ES RCC",
      items: [
        { value: "AMIGOZ_GOVES_RCC_350_35", label: "AMIGOZ GOV ES RCC TX 3,50 — 35%", pct: 0.35 },
        { value: "AMIGOZ_GOVES_RCC_246_12", label: "AMIGOZ GOV ES RCC TX 2,46 — 12%", pct: 0.12 },
      ],
    },
    {
      group: "AMIGOZ — GOV PI RMC",
      items: [
        { value: "AMIGOZ_GOVPI_RMC_479_80", label: "AMIGOZ GOV PI RMC TX 4,79 — 80%", pct: 0.8 },
      ],
    },
    {
      group: "AMIGOZ — GOV PI RCC",
      items: [
        { value: "AMIGOZ_GOVPI_RCC_479_80", label: "AMIGOZ GOV PI RCC TX 4,79 — 80%", pct: 0.8 },
      ],
    },
    {
      group: "NEO — GOV SP RCC",
      items: [
        { value: "NEO_GOVSP_RCC_399_100", label: "NEO GOV SP RCC TX 3,99 — 100%", pct: 1.0 },
        { value: "NEO_GOVSP_RCC_379_80", label: "NEO GOV SP RCC TX 3,79 — 80%", pct: 0.8 },
        { value: "NEO_GOVSP_RCC_359_65", label: "NEO GOV SP RCC TX 3,59 — 65%", pct: 0.65 },
        { value: "NEO_GOVSP_RCC_339_50", label: "NEO GOV SP RCC TX 3,39 — 50%", pct: 0.5 },
        { value: "NEO_GOVSP_RCC_319_30", label: "NEO GOV SP RCC TX 3,19 — 30%", pct: 0.3 },
        { value: "NEO_GOVSP_RCC_299_12", label: "NEO GOV SP RCC TX 2,99 — 12%", pct: 0.12 },
      ],
    },
    {
      group: "NEO — GOV PR RCC",
      items: [
        { value: "NEO_GOVPR_RCC_399_100", label: "NEO GOV PR RCC TX 3,99 — 100%", pct: 1.0 },
        { value: "NEO_GOVPR_RCC_379_80", label: "NEO GOV PR RCC TX 3,79 — 80%", pct: 0.8 },
        { value: "NEO_GOVPR_RCC_359_65", label: "NEO GOV PR RCC TX 3,59 — 65%", pct: 0.65 },
        { value: "NEO_GOVPR_RCC_339_50", label: "NEO GOV PR RCC TX 3,39 — 50%", pct: 0.5 },
        { value: "NEO_GOVPR_RCC_319_30", label: "NEO GOV PR RCC TX 3,19 — 30%", pct: 0.3 },
        { value: "NEO_GOVPR_RCC_299_12", label: "NEO GOV PR RCC TX 2,99 — 12%", pct: 0.12 },
      ],
    },
    {
      group: "NEO — PREF SP RCC",
      items: [
        { value: "NEO_PREFSP_RCC_419_83", label: "NEO PREF SP RCC TX 4,19 — 83%", pct: 0.83 },
        { value: "NEO_PREFSP_RCC_399_73", label: "NEO PREF SP RCC TX 3,99 — 73%", pct: 0.73 },
        { value: "NEO_PREFSP_RCC_379_63", label: "NEO PREF SP RCC TX 3,79 — 63%", pct: 0.63 },
        { value: "NEO_PREFSP_RCC_359_53", label: "NEO PREF SP RCC TX 3,59 — 53%", pct: 0.53 },
        { value: "NEO_PREFSP_RCC_339_43", label: "NEO PREF SP RCC TX 3,39 — 43%", pct: 0.43 },
        { value: "NEO_PREFSP_RCC_319_23", label: "NEO PREF SP RCC TX 3,19 — 23%", pct: 0.23 },
        { value: "NEO_PREFSP_RCC_299_12", label: "NEO PREF SP RCC TX 2,99 — 12%", pct: 0.12 },
      ],
    },
    {
      group: "NEO — GOV MA RCC",
      items: [
        { value: "NEO_GOVMA_RCC_419_83", label: "NEO GOV MA RCC TX 4,19 — 83%", pct: 0.83 },
        { value: "NEO_GOVMA_RCC_399_73", label: "NEO GOV MA RCC TX 3,99 — 73%", pct: 0.73 },
        { value: "NEO_GOVMA_RCC_379_63", label: "NEO GOV MA RCC TX 3,79 — 63%", pct: 0.63 },
        { value: "NEO_GOVMA_RCC_359_53", label: "NEO GOV MA RCC TX 3,59 — 53%", pct: 0.53 },
        { value: "NEO_GOVMA_RCC_339_43", label: "NEO GOV MA RCC TX 3,39 — 43%", pct: 0.43 },
        { value: "NEO_GOVMA_RCC_319_23", label: "NEO GOV MA RCC TX 3,19 — 23%", pct: 0.23 },
        { value: "NEO_GOVMA_RCC_299_12", label: "NEO GOV MA RCC TX 2,99 — 12%", pct: 0.12 },
      ],
    },
    {
      group: "NEO — GOV MA RMC",
      items: [
        { value: "NEO_GOVMA_RMC_419_83", label: "NEO GOV MA RMC TX 4,19 — 83%", pct: 0.83 },
        { value: "NEO_GOVMA_RMC_399_73", label: "NEO GOV MA RMC TX 3,99 — 73%", pct: 0.73 },
        { value: "NEO_GOVMA_RMC_379_63", label: "NEO GOV MA RMC TX 3,79 — 63%", pct: 0.63 },
        { value: "NEO_GOVMA_RMC_359_53", label: "NEO GOV MA RMC TX 3,59 — 53%", pct: 0.53 },
        { value: "NEO_GOVMA_RMC_339_43", label: "NEO GOV MA RMC TX 3,39 — 43%", pct: 0.43 },
        { value: "NEO_GOVMA_RMC_319_23", label: "NEO GOV MA RMC TX 3,19 — 23%", pct: 0.23 },
        { value: "NEO_GOVMA_RMC_299_12", label: "NEO GOV MA RMC TX 2,99 — 12%", pct: 0.12 },
      ],
    },
    {
      group: "NEO — PREF SP RMC",
      items: [
        { value: "NEO_PREFSP_RMC_419_83", label: "NEO PREF SP RMC TX 4,19 — 83%", pct: 0.83 },
        { value: "NEO_PREFSP_RMC_399_73", label: "NEO PREF SP RMC TX 3,99 — 73%", pct: 0.73 },
        { value: "NEO_PREFSP_RMC_379_63", label: "NEO PREF SP RMC TX 3,79 — 63%", pct: 0.63 },
        { value: "NEO_PREFSP_RMC_359_53", label: "NEO PREF SP RMC TX 3,59 — 53%", pct: 0.53 },
        { value: "NEO_PREFSP_RMC_339_43", label: "NEO PREF SP RMC TX 3,39 — 43%", pct: 0.43 },
        { value: "NEO_PREFSP_RMC_319_23", label: "NEO PREF SP RMC TX 3,19 — 23%", pct: 0.23 },
        { value: "NEO_PREFSP_RMC_299_12", label: "NEO PREF SP RMC TX 2,99 — 12%", pct: 0.12 },
      ],
    },
    {
      group: "AKI — PREF RJ RCC",
      items: [
        { value: "AKI_PREFRJ_RCC_P5_30", label: "AKI PREF RJ RCC P5 — 30%", pct: 0.3 },
      ],
    },
    {
      group: "AKI — SIAPE RCC",
      items: [
        { value: "AKI_SIAPE_RCC_F12_70", label: "AKI SIAPE RCC F12 — 70%", pct: 0.7 },
        { value: "AKI_SIAPE_RCC_F13_60", label: "AKI SIAPE RCC F13 — 60%", pct: 0.6 },
        { value: "AKI_SIAPE_RCC_F14_50", label: "AKI SIAPE RCC F14 — 50%", pct: 0.5 },
        { value: "AKI_SIAPE_RCC_F15_45", label: "AKI SIAPE RCC F15 — 45%", pct: 0.45 },
        { value: "AKI_SIAPE_RCC_F16_35", label: "AKI SIAPE RCC F16 — 35%", pct: 0.35 },
      ],
    },
    {
      group: "AKI — SIAPE RMC",
      items: [
        { value: "AKI_SIAPE_RMC_F11_88", label: "AKI SIAPE RMC F11 — 88%", pct: 0.88 },
        { value: "AKI_SIAPE_RMC_F12_70", label: "AKI SIAPE RMC F12 — 70%", pct: 0.7 },
        { value: "AKI_SIAPE_RMC_F13_60", label: "AKI SIAPE RMC F13 — 60%", pct: 0.6 },
        { value: "AKI_SIAPE_RMC_F14_50", label: "AKI SIAPE RMC F14 — 50%", pct: 0.5 },
        { value: "AKI_SIAPE_RMC_F15_45", label: "AKI SIAPE RMC F15 — 45%", pct: 0.45 },
        { value: "AKI_SIAPE_RMC_F16_35", label: "AKI SIAPE RMC F16 — 35%", pct: 0.35 },
      ],
    },
    {
      group: "FUTURO — GOV PR RCC 96X",
      items: [
        { value: "FUTURO_GOVPR_RCC_96X_CB_385_85", label: "FUTURO GOV PR RCC 96X TX 3,85 — 85%", pct: 0.85 },
        { value: "FUTURO_GOVPR_RCC_96X_CB_380_85", label: "FUTURO GOV PR RCC 96X TX 3,80 — 85%", pct: 0.85 },
        { value: "FUTURO_GOVPR_RCC_96X_CB_349_70", label: "FUTURO GOV PR RCC 96X TX 3,49 — 70%", pct: 0.7 },
        { value: "FUTURO_GOVPR_RCC_96X_CB_325_60", label: "FUTURO GOV PR RCC 96X TX 3,25 — 60%", pct: 0.6 },
        { value: "FUTURO_GOVPR_RCC_96X_CB_330_45", label: "FUTURO GOV PR RCC 96X TX 3,30 — 45%", pct: 0.45 },
        { value: "FUTURO_GOVPR_RCC_96X_CB_285_34", label: "FUTURO GOV PR RCC 96X TX 2,85 — 34%", pct: 0.34 },
        { value: "FUTURO_GOVPR_RCC_96X_CB_250_28", label: "FUTURO GOV PR RCC 96X TX 2,50 — 28%", pct: 0.28 },
        { value: "FUTURO_GOVPR_RCC_96X_CB_240_10", label: "FUTURO GOV PR RCC 96X TX 2,40 — 10%", pct: 0.1 },
      ],
    },
    {
      group: "FUTURO — GOV RO RMC 96X",
      items: [
        { value: "FUTURO_GOVRO_RMC_96X_CB_35_100", label: "FUTURO GOV RO RMC 96X TX 3,5 — 100%", pct: 1.0 },
        { value: "FUTURO_GOVRO_RMC_96X_CB_33_80", label: "FUTURO GOV RO RMC 96X TX 3,3 — 80%", pct: 0.8 },
        { value: "FUTURO_GOVRO_RMC_96X_CLT_35_80", label: "FUTURO GOV RO CLT RMC 96X TX 3,5 — 80%", pct: 0.8 },
        { value: "FUTURO_GOVRO_RMC_96X_CLT_35_65", label: "FUTURO GOV RO CLT RMC 96X TX 3,5 — 65%", pct: 0.65 },
        { value: "FUTURO_GOVRO_RMC_96X_SENIOR_35_80", label: "FUTURO GOV RO SENIOR RMC 96X TX 3,5 — 80%", pct: 0.8 },
        { value: "FUTURO_GOVRO_RMC_96X_SENIOR_35_65", label: "FUTURO GOV RO SENIOR RMC 96X TX 3,5 — 65%", pct: 0.65 },
      ],
    },
    {
      group: "FUTURO — GOV SP RMC 96X",
      items: [
        { value: "FUTURO_GOVSP_RMC_96X_CLT_35_115", label: "FUTURO GOV SP CLT RMC 96X TX 3,5 — 115%", pct: 1.15 },
        { value: "FUTURO_GOVSP_RMC_96X_CLT_34_95", label: "FUTURO GOV SP CLT RMC 96X TX 3,4 — 95%", pct: 0.95 },
        { value: "FUTURO_GOVSP_RMC_96X_CLT_32_90", label: "FUTURO GOV SP CLT RMC 96X TX 3,2 — 90%", pct: 0.9 },
        { value: "FUTURO_GOVSP_RMC_96X_CLT_29_80", label: "FUTURO GOV SP CLT RMC 96X TX 2,9 — 80%", pct: 0.8 },
        { value: "FUTURO_GOVSP_RMC_96X_CLT_27_70", label: "FUTURO GOV SP CLT RMC 96X TX 2,7 — 70%", pct: 0.7 },
        { value: "FUTURO_GOVSP_RMC_96X_CLT_24_45", label: "FUTURO GOV SP CLT RMC 96X TX 2,4 — 45%", pct: 0.45 },
      ],
    },
    {
      group: "FUTURO — TJ SP RMC 96X",
      items: [
        { value: "FUTURO_TJSP_RMC_96X_CB_351_38", label: "FUTURO TJ SP RMC 96X TX 3,51 — 38%", pct: 0.38 },
        { value: "FUTURO_TJSP_RMC_96X_CB_344_32", label: "FUTURO TJ SP RMC 96X TX 3,44 — 32%", pct: 0.32 },
        { value: "FUTURO_TJSP_RMC_96X_CB_339_26", label: "FUTURO TJ SP RMC 96X TX 3,39 — 26%", pct: 0.26 },
        { value: "FUTURO_TJSP_RMC_96X_CB_33_12", label: "FUTURO TJ SP RMC 96X TX 3,3 — 12%", pct: 0.12 },
      ],
    },
    {
      group: "FUTURO — SIAPE EMP 117X",
      items: [
        { value: "FUTURO_SIAPE_EMP_117X_EMP_180_15", label: "FUTURO SIAPE EMP 117X TX 1,80 — 15%", pct: 0.15 },
      ],
    },
    {
      group: "FUTURO — SIAPE EMP 96X",
      items: [
        { value: "FUTURO_SIAPE_EMP_96X_EMP_180_12", label: "FUTURO SIAPE EMP 96X TX 1,80 — 12%", pct: 0.12 },
      ],
    },
    {
      group: "FUTURO — SIAPE CC-CB 96X",
      items: [
        { value: "FUTURO_SIAPE_CCCB_96X_NCDT_419_30", label: "FUTURO SIAPE CC-CB 96X NCDT TX 4,19 — 30%", pct: 0.3 },
        { value: "FUTURO_SIAPE_CCCB_96X_NCDT_399_27", label: "FUTURO SIAPE CC-CB 96X NCDT TX 3,99 — 27%", pct: 0.27 },
        { value: "FUTURO_SIAPE_CCCB_96X_NCDT_379_24", label: "FUTURO SIAPE CC-CB 96X NCDT TX 3,79 — 24%", pct: 0.24 },
        { value: "FUTURO_SIAPE_CCCB_96X_NCDT_359_18", label: "FUTURO SIAPE CC-CB 96X NCDT TX 3,59 — 18%", pct: 0.18 },
        { value: "FUTURO_SIAPE_CCCB_96X_NCDT_339_15", label: "FUTURO SIAPE CC-CB 96X NCDT TX 3,39 — 15%", pct: 0.15 },
        { value: "FUTURO_SIAPE_CCCB_96X_NCDT_319_9", label: "FUTURO SIAPE CC-CB 96X NCDT TX 3,19 — 9%", pct: 0.09 },
        { value: "FUTURO_SIAPE_CCCB_96X_NCDT_309_6", label: "FUTURO SIAPE CC-CB 96X NCDT TX 3,09 — 6%", pct: 0.06 },
        { value: "FUTURO_SIAPE_CCCB_96X_NCDT_299_3", label: "FUTURO SIAPE CC-CB 96X NCDT TX 2,99 — 3%", pct: 0.03 },
      ],
    },
    {
      group: "FUTURO — GOV AM RCC 96X",
      items: [
        { value: "FUTURO_GOVAM_RCC_96X_CB_390_85", label: "FUTURO GOV AM RCC 96X TX 3,90 — 85%", pct: 0.85 },
        { value: "FUTURO_GOVAM_RCC_96X_CB_360_70", label: "FUTURO GOV AM RCC 96X TX 3,60 — 70%", pct: 0.7 },
        { value: "FUTURO_GOVAM_RCC_96X_CB_330_60", label: "FUTURO GOV AM RCC 96X TX 3,30 — 60%", pct: 0.6 },
        { value: "FUTURO_GOVAM_RCC_96X_CB_300_50", label: "FUTURO GOV AM RCC 96X TX 3,00 — 50%", pct: 0.5 },
      ],
    },
    {
      group: "FUTURO — GOV AM RMC 96X",
      items: [
        { value: "FUTURO_GOVAM_RMC_96X_CC_390_85", label: "FUTURO GOV AM CC RMC 96X TX 3,90 — 85%", pct: 0.85 },
        { value: "FUTURO_GOVAM_RMC_96X_CC_360_70", label: "FUTURO GOV AM CC RMC 96X TX 3,60 — 70%", pct: 0.7 },
        { value: "FUTURO_GOVAM_RMC_96X_CC_330_60", label: "FUTURO GOV AM CC RMC 96X TX 3,30 — 60%", pct: 0.6 },
        { value: "FUTURO_GOVAM_RMC_96X_CC_300_50", label: "FUTURO GOV AM CC RMC 96X TX 3,00 — 50%", pct: 0.5 },
      ],
    },
    {
      group: "FUTURO — EXERCITO EMP 96X",
      items: [
        { value: "FUTURO_EXERCITO_EMP_96X_EMP_203_14", label: "FUTURO EXERCITO EMP 96X TX 2,03 — 14%", pct: 0.14 },
        { value: "FUTURO_EXERCITO_EMP_96X_EMP_190_12", label: "FUTURO EXERCITO EMP 96X TX 1,90 — 12%", pct: 0.12 },
      ],
    },
    {
      group: "FUTURO — AERONAUTICA EMP 96X",
      items: [
        { value: "FUTURO_AERONAUTICA_EMP_96X_EMP_203_14", label: "FUTURO AERONAUTICA EMP 96X TX 2,03 — 14%", pct: 0.14 },
        { value: "FUTURO_AERONAUTICA_EMP_96X_EMP_190_12", label: "FUTURO AERONAUTICA EMP 96X TX 1,90 — 12%", pct: 0.12 },
      ],
    },
  ],

  _tabelaPct: {
    AMIGOZ_GOVMG_RCC_450_100: 1.0,
    AMIGOZ_GOVMG_RCC_425_85: 0.85,
    AMIGOZ_GOVMG_RCC_399_65: 0.65,
    AMIGOZ_GOVMG_RCC_375_50: 0.5,
    AMIGOZ_GOVMG_RCC_350_45: 0.45,
    AMIGOZ_GOVMG_RMC_450_100: 1.0,
    AMIGOZ_GOVMG_RMC_425_85: 0.85,
    AMIGOZ_GOVMG_RMC_399_65: 0.65,
    AMIGOZ_GOVMG_RMC_375_50: 0.5,
    AMIGOZ_GOVMG_RMC_350_45: 0.45,
    AMIGOZ_GOVPB_RMC_500_100: 1.0,
    AMIGOZ_GOVPB_RMC_450_85: 0.85,
    AMIGOZ_GOVPB_RMC_398_55: 0.55,
    AMIGOZ_GOVPB_RMC_375_35: 0.35,
    AMIGOZ_GOVPB_RMC_350_12: 0.12,
    AMIGOZ_GOVSP_RMC_450_100: 1.0,
    AMIGOZ_GOVSP_RMC_398_85: 0.85,
    AMIGOZ_GOVSP_RMC_375_55: 0.55,
    AMIGOZ_GOVSP_RMC_350_35: 0.35,
    AMIGOZ_GOVSP_RMC_325_12: 0.12,
    AMIGOZ_GOVSPCELETISTA_RMC_500_100: 1.0,
    AMIGOZ_GOVSPCELETISTA_RCC_500_100: 1.0,
    AMIGOZ_GOVSP_RCC_450_100: 1.0,
    AMIGOZ_GOVSP_RCC_398_85: 0.85,
    AMIGOZ_GOVSP_RCC_375_55: 0.55,
    AMIGOZ_GOVSP_RCC_350_35: 0.35,
    AMIGOZ_GOVSP_RCC_325_12: 0.12,
    AMIGOZ_GOVES_RCC_350_35: 0.35,
    AMIGOZ_GOVES_RCC_246_12: 0.12,
    AMIGOZ_GOVPI_RMC_479_80: 0.8,
    AMIGOZ_GOVPI_RCC_479_80: 0.8,
    NEO_GOVSP_RCC_399_100: 1.0,
    NEO_GOVSP_RCC_379_80: 0.8,
    NEO_GOVSP_RCC_359_65: 0.65,
    NEO_GOVSP_RCC_339_50: 0.5,
    NEO_GOVSP_RCC_319_30: 0.3,
    NEO_GOVSP_RCC_299_12: 0.12,
    NEO_GOVPR_RCC_399_100: 1.0,
    NEO_GOVPR_RCC_379_80: 0.8,
    NEO_GOVPR_RCC_359_65: 0.65,
    NEO_GOVPR_RCC_339_50: 0.5,
    NEO_GOVPR_RCC_319_30: 0.3,
    NEO_GOVPR_RCC_299_12: 0.12,
    NEO_PREFSP_RCC_419_83: 0.83,
    NEO_PREFSP_RCC_399_73: 0.73,
    NEO_PREFSP_RCC_379_63: 0.63,
    NEO_PREFSP_RCC_359_53: 0.53,
    NEO_PREFSP_RCC_339_43: 0.43,
    NEO_PREFSP_RCC_319_23: 0.23,
    NEO_PREFSP_RCC_299_12: 0.12,
    NEO_GOVMA_RCC_419_83: 0.83,
    NEO_GOVMA_RCC_399_73: 0.73,
    NEO_GOVMA_RCC_379_63: 0.63,
    NEO_GOVMA_RCC_359_53: 0.53,
    NEO_GOVMA_RCC_339_43: 0.43,
    NEO_GOVMA_RCC_319_23: 0.23,
    NEO_GOVMA_RCC_299_12: 0.12,
    NEO_GOVMA_RMC_419_83: 0.83,
    NEO_GOVMA_RMC_399_73: 0.73,
    NEO_GOVMA_RMC_379_63: 0.63,
    NEO_GOVMA_RMC_359_53: 0.53,
    NEO_GOVMA_RMC_339_43: 0.43,
    NEO_GOVMA_RMC_319_23: 0.23,
    NEO_GOVMA_RMC_299_12: 0.12,
    NEO_PREFSP_RMC_419_83: 0.83,
    NEO_PREFSP_RMC_399_73: 0.73,
    NEO_PREFSP_RMC_379_63: 0.63,
    NEO_PREFSP_RMC_359_53: 0.53,
    NEO_PREFSP_RMC_339_43: 0.43,
    NEO_PREFSP_RMC_319_23: 0.23,
    NEO_PREFSP_RMC_299_12: 0.12,
    AKI_PREFRJ_RCC_P5_30: 0.3,
    AKI_SIAPE_RCC_F12_70: 0.7,
    AKI_SIAPE_RCC_F13_60: 0.6,
    AKI_SIAPE_RCC_F14_50: 0.5,
    AKI_SIAPE_RCC_F15_45: 0.45,
    AKI_SIAPE_RCC_F16_35: 0.35,
    AKI_SIAPE_RMC_F11_88: 0.88,
    AKI_SIAPE_RMC_F12_70: 0.7,
    AKI_SIAPE_RMC_F13_60: 0.6,
    AKI_SIAPE_RMC_F14_50: 0.5,
    AKI_SIAPE_RMC_F15_45: 0.45,
    AKI_SIAPE_RMC_F16_35: 0.35,
    FUTURO_GOVPR_RCC_96X_CB_385_85: 0.85,
    FUTURO_GOVPR_RCC_96X_CB_380_85: 0.85,
    FUTURO_GOVPR_RCC_96X_CB_349_70: 0.7,
    FUTURO_GOVPR_RCC_96X_CB_325_60: 0.6,
    FUTURO_GOVPR_RCC_96X_CB_330_45: 0.45,
    FUTURO_GOVPR_RCC_96X_CB_285_34: 0.34,
    FUTURO_GOVPR_RCC_96X_CB_250_28: 0.28,
    FUTURO_GOVPR_RCC_96X_CB_240_10: 0.1,
    FUTURO_GOVRO_RMC_96X_CB_35_100: 1.0,
    FUTURO_GOVRO_RMC_96X_CB_33_80: 0.8,
    FUTURO_GOVRO_RMC_96X_CLT_35_80: 0.8,
    FUTURO_GOVRO_RMC_96X_CLT_35_65: 0.65,
    FUTURO_GOVRO_RMC_96X_SENIOR_35_80: 0.8,
    FUTURO_GOVRO_RMC_96X_SENIOR_35_65: 0.65,
    FUTURO_GOVSP_RMC_96X_CLT_35_115: 1.15,
    FUTURO_GOVSP_RMC_96X_CLT_34_95: 0.95,
    FUTURO_GOVSP_RMC_96X_CLT_32_90: 0.9,
    FUTURO_GOVSP_RMC_96X_CLT_29_80: 0.8,
    FUTURO_GOVSP_RMC_96X_CLT_27_70: 0.7,
    FUTURO_GOVSP_RMC_96X_CLT_24_45: 0.45,
    FUTURO_TJSP_RMC_96X_CB_351_38: 0.38,
    FUTURO_TJSP_RMC_96X_CB_344_32: 0.32,
    FUTURO_TJSP_RMC_96X_CB_339_26: 0.26,
    FUTURO_TJSP_RMC_96X_CB_33_12: 0.12,
    FUTURO_SIAPE_EMP_117X_EMP_180_15: 0.15,
    FUTURO_SIAPE_EMP_96X_EMP_180_12: 0.12,
    FUTURO_SIAPE_CCCB_96X_NCDT_419_30: 0.3,
    FUTURO_SIAPE_CCCB_96X_NCDT_399_27: 0.27,
    FUTURO_SIAPE_CCCB_96X_NCDT_379_24: 0.24,
    FUTURO_SIAPE_CCCB_96X_NCDT_359_18: 0.18,
    FUTURO_SIAPE_CCCB_96X_NCDT_339_15: 0.15,
    FUTURO_SIAPE_CCCB_96X_NCDT_319_9: 0.09,
    FUTURO_SIAPE_CCCB_96X_NCDT_309_6: 0.06,
    FUTURO_SIAPE_CCCB_96X_NCDT_299_3: 0.03,
    FUTURO_GOVAM_RCC_96X_CB_390_85: 0.85,
    FUTURO_GOVAM_RCC_96X_CB_360_70: 0.7,
    FUTURO_GOVAM_RCC_96X_CB_330_60: 0.6,
    FUTURO_GOVAM_RCC_96X_CB_300_50: 0.5,
    FUTURO_GOVAM_RMC_96X_CC_390_85: 0.85,
    FUTURO_GOVAM_RMC_96X_CC_360_70: 0.7,
    FUTURO_GOVAM_RMC_96X_CC_330_60: 0.6,
    FUTURO_GOVAM_RMC_96X_CC_300_50: 0.5,
    FUTURO_EXERCITO_EMP_96X_EMP_203_14: 0.14,
    FUTURO_EXERCITO_EMP_96X_EMP_190_12: 0.12,
    FUTURO_AERONAUTICA_EMP_96X_EMP_203_14: 0.14,
    FUTURO_AERONAUTICA_EMP_96X_EMP_190_12: 0.12,
    FUTURO_100: 1,
    FUTURO_95: 0.95,
    FUTURO_90: 0.9,
    FUTURO_82: 0.82,
    FUTURO_50: 0.5,
    FUTURO_25: 0.25,
    FUTURO_10: 0.1,
    FOX: 1,
    BLU: 1,
    GL3: 1,
    /* legado (propostas antigas) */
    NEO_NORMAL: 1,
    NEO_FLEX1: 0.82,
    NEO_FLEX2: 0.67,
    NEO_FLEX3: 0.52,
    NEO_FLEX4: 0.37,
    NEO_FLEX5: 0.17,
    GOVSP_NEO_CGM_399_76: 0.76,
    GOVSP_NEO_CGM_379_65: 0.65,
    GOVSP_NEO_CGM_359_40: 0.4,
    GOVSP_NEO_CGM_339_30: 0.3,
    GOVSP_NEO_CGM_319_15: 0.15,
    PREFSP_NEO_CGM_419_60: 0.6,
    PREFSP_NEO_CGM_399_50: 0.5,
    PREFSP_NEO_CGM_379_40: 0.4,
    PREFSP_NEO_CGM_359_25: 0.25,
    GOVMA_NEO_CGM_419_60: 0.6,
    GOVMA_NEO_CGM_399_50: 0.5,
    GOVMA_NEO_CGM_379_40: 0.4,
    GOVMA_NEO_CGM_359_25: 0.25,
    AKI_L2_110: 1.1,
    AKI_L3_100: 1.0,
    AKI_L4_82: 0.82,
    AKI_L5_67: 0.67,
    AKI_L6_52: 0.52,
    AKI_L7_37: 0.37,
    AKI_L8_17: 0.17,
    AKI_L9_10: 0.1,
    AKI_100: 1,
    AKI_70: 0.7,
    AKI_35: 0.35,
    AKI_17: 0.17,
    AMIGOZ_100: 1,
    AMIGOZ_67: 0.67,
    AMIGOZ_58: 0.58,
    AMIGOZ_38: 0.38,
    AMIGOZ_13: 0.13,
    NORMAL: 1,
    FLEX1: 0.82,
    FLEX2: 0.67,
    FLEX3: 0.52,
    FLEX4: 0.37,
    FLEX5: 0.17,
    S: 1,
  },

  _tabelaLabel: function(code) {
    if (!code) return '';
    for (const g of this._TABELA_GROUPS) {
      const hit = g.items.find(i => i.value === code);
      if (hit) return hit.label;
    }
    const legacy = {
      NORMAL: 'NEO NORMAL — 100%', FLEX1: 'NEO FLEX 1 — 82%', FLEX2: 'NEO FLEX 2 — 67%',
      FLEX3: 'NEO FLEX 3 — 52%', FLEX4: 'NEO FLEX 4 — 37%', FLEX5: 'NEO FLEX 5 — 17%', S: 'S',
    };
    return legacy[code] || code;
  },

  _tabelaSelectHtml: function(selected) {
    let html = '<option value="">— Aguardando análise —</option>';
    for (const g of this._TABELA_GROUPS) {
      html += `<optgroup label="${g.group}">`;
      html += g.items.map(i => {
        const sel = selected === i.value ? ' selected' : '';
        return `<option value="${this._escAttr(i.value)}"${sel}>${this._escHtml(i.label)}</option>`;
      }).join('');
      html += '</optgroup>';
    }
    const known = new Set(this._TABELA_GROUPS.flatMap(g => g.items.map(i => i.value)));
    if (selected && !known.has(selected)) {
      html += `<option value="${this._escAttr(selected)}" selected>${this._escHtml(selected)} (legado)</option>`;
    }
    return html;
  },

  _fillTabelaSelect: function(selectId, selected) {
    const el = document.getElementById(selectId);
    if (!el) return;
    const cur = selected != null ? selected : el.value;
    el.innerHTML = this._tabelaSelectHtml(cur);
    if (cur) el.value = cur;
  },

  /** DB.getProposals devolve um array — o UI antigo esperava { items, total }; normaliza aqui. */
  _rowsFromProposalQuery: function(result) {
    if (Array.isArray(result)) return result;
    if (result && Array.isArray(result.items)) return result.items;
    return [];
  },

  /** Escopo para listar vendedores no filtro/modal de proposta (Master/financeiro = todos). */
  /**
   * _VENDOR_TRANSFER_GLOBAL_IDS — usuários liberados a passar venda para qualquer vendedor.
   * Pedido: Vinicius (sup_backoffice) transferir fichas (ex.: Goianésia → Viviane).
   */
  _VENDOR_TRANSFER_GLOBAL_IDS: ['umpe2d8mbt3sd8'],

  /**
   * _proposalVendorScopeAdmin — escopo do select “Vendedor responsável”.
   * null = todos os vendedores (master/gerente/BO e allowlist de transferência).
   */
  _proposalVendorScopeAdmin: function(session) {
    const r = this._normProposalManageRole(session?.role);
    const uid = String(session?.id || '');
    if (uid && (this._VENDOR_TRANSFER_GLOBAL_IDS || []).includes(uid)) return null;
    // Gerente/gerência/BO vê todos — senão o select só lista o próprio time e
    // não dá para “passar a venda” (ex.: Viviane / Goianésia).
    const globalRoles = [
      'master', 'fundador', 'desenvolvedor', 'gerente', 'gerencia',
      'financeiro', 'financial', 'rh', 'diretoria',
      'backoffice', 'sup_backoffice', 'operacional',
    ];
    if (globalRoles.includes(r)) return null;
    if (typeof window !== 'undefined' && window.PARTNER_ROOT_ID) return window.PARTNER_ROOT_ID;
    if (r === 'supervisor' || r === 'parceiro') return session?.id || null;
    return session?.adminId || session?.id || null;
  },

  async _proposalVendorScopeForSession(session) {
    const scope = this._proposalVendorScopeAdmin(session);
    const r = String(session?.role || '').toLowerCase();
    if (r === 'supervisor' && !window.PARTNER_ROOT_ID
      && typeof window._resolveMergedSupervisorAdminIds === 'function') {
      const merged = await window._resolveMergedSupervisorAdminIds(session.id, session.name);
      if (merged.length > 1) return merged;
    }
    return scope;
  },

  /** Mantém só propostas do time unificado da supervisora comercial. */
  async _filterProposalsToSupervisorTeam(proposals, session) {
    if (!Array.isArray(proposals)) return proposals;
    const r = String(session?.role || '').toLowerCase();
    if (r !== 'supervisor' || window.PARTNER_ROOT_ID) return proposals;
    if (typeof window._getMergedTeamScopeIds !== 'function') return proposals;
    const teamIds = await window._getMergedTeamScopeIds().catch(() => []);
    const set = new Set(teamIds.map(String));
    let usersByName = {};
    try {
      const users = typeof DB.getAllUsers === 'function' ? await DB.getAllUsers().catch(() => []) : [];
      if (typeof _buildUsersByVendorName === 'function') {
        usersByName = _buildUsersByVendorName(users);
      } else if (typeof DB._normVendorName === 'function') {
        (users || []).forEach((u) => {
          const k = DB._normVendorName(u?.name);
          if (k && u?.id) usersByName[k] = u.id;
        });
      }
    } catch (_) { /* noop */ }
    const filtered = proposals.filter((p) => {
      const vid = typeof DB.resolveProposalVendorId === 'function'
        ? DB.resolveProposalVendorId(p, usersByName)
        : String(p.vendorId || p.vendor_id || p.employee_id || '').trim();
      return vid && set.has(String(vid));
    });
return filtered;
  },

  /** Mantém só propostas da equipe do parceiro (vendedores vinculados). Master não usa. */
  _filterProposalsToPartnerOrg: async function(proposals) {
    const rootId = typeof window !== 'undefined' ? window.PARTNER_ROOT_ID : null;
    if (!rootId || !Array.isArray(proposals)) return proposals;
    let teamIds = await DB.getPartnerTeamIds(rootId).catch(() => null);
    if (!(teamIds instanceof Set)) teamIds = new Set();
    if (!teamIds.size) teamIds.add(String(rootId));
    return proposals.filter(p => {
      const pr = p.partner_root_id || p.partnerRootId;
      if (pr && String(pr) === String(rootId)) return true;
      const ids = typeof DB._proposalVendorIds === 'function'
        ? DB._proposalVendorIds(p)
        : [p.vendorId, p.vendor_id, p.employee_id];
      return ids.some(id => id && teamIds.has(String(id)));
    });
  },

  /** Gestão interna: remove propostas de qualquer organização parceira. */
  _filterProposalsExcludePartnerOrg: async function(proposals) {
    const rootId = typeof window !== 'undefined' ? window.PARTNER_ROOT_ID : null;
    if (rootId || !Array.isArray(proposals)) return proposals;
    if (typeof window.PartnerOps === 'undefined') return proposals;
    return PartnerOps.filterExcludePartnerProposals(proposals);
  },

  /** Master/backoffice interno vê propostas de parceiros na mesma lista (destaque azul). */
  _canSeePartnerProposalsInAdminList: function() {
    if (typeof window !== 'undefined' && window.PARTNER_ROOT_ID) return false;
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    const r = (session?.role || '').toLowerCase();
    if (typeof Auth !== 'undefined' && typeof Auth.isMaster === 'function' && Auth.isMaster()) return true;
    return ['fundador', 'desenvolvedor', 'gerente', 'financeiro', 'financial', 'rh', 'diretoria', 'backoffice', 'operacional', 'sup_backoffice', 'supervisor'].includes(r);
  },

  async _partnerProposalIdSet(proposals) {
    const set = new Set();
    if (!Array.isArray(proposals) || typeof PartnerOps === 'undefined') return set;
    const index = await PartnerOps._getIndex().catch(() => []);
    const allPartnerIds = new Set();
    (index || []).forEach(e => {
      if (e?.allIds) e.allIds.forEach(id => allPartnerIds.add(String(id)));
    });
    if (!allPartnerIds.size) return set;
    proposals.forEach(p => {
      const ids = typeof DB._proposalVendorIds === 'function'
        ? DB._proposalVendorIds(p)
        : [p.vendorId, p.vendor_id, p.employee_id];
      if (ids.some(id => id && allPartnerIds.has(String(id)))) set.add(String(p.id));
    });
    return set;
  },

  async _proposalBelongsToSessionPartnerOrg(proposal) {
    const rootId = typeof window !== 'undefined' ? window.PARTNER_ROOT_ID : null;
    if (!rootId) return true;
    const pr = proposal.partner_root_id || proposal.partnerRootId;
    if (pr && String(pr) === String(rootId)) return true;
    if (typeof DB.getPartnerTeamIds !== 'function') return false;
    const teamIds = await DB.getPartnerTeamIds(rootId);
    const vids = typeof DB._proposalVendorIds === 'function'
      ? DB._proposalVendorIds(proposal)
      : [proposal.vendorId, proposal.vendor_id, proposal.employee_id];
    return vids.some(id => id && teamIds.has(String(id)));
  },

  _isSoubluProposalAdmin: function() {
    const r = String(typeof Auth !== 'undefined' && Auth.getSession()?.role || '').toLowerCase();
    if (typeof Auth !== 'undefined' && typeof Auth.isMaster === 'function' && Auth.isMaster()) return true;
    return ['fundador', 'desenvolvedor', 'gerente', 'gerencia', 'financeiro', 'financial', 'rh', 'diretoria', 'supervisor', 'juridico'].includes(r);
  },

  _canPartnerManageProposals: function() {
    if (typeof window === 'undefined' || !window.PARTNER_ROOT_ID) return true;
    if (this._isSoubluProposalAdmin()) return true;
    if (typeof partnerOrgCan !== 'function') return false;
    const r = String(typeof Auth !== 'undefined' && Auth.getSession()?.role || '').toLowerCase();
    if (r === 'parceiro') return partnerOrgCan('cadastrar_proposta') || partnerOrgCan('visualizar_propostas');
    if (typeof isPartnerOrgStaffRole === 'function' && isPartnerOrgStaffRole(r)) {
      return partnerOrgCan('cadastrar_proposta') || partnerOrgCan('visualizar_propostas');
    }
    return partnerOrgCan('cadastrar_proposta') || partnerOrgCan('visualizar_propostas');
  },

  _matchesVendorIdFilter: function(p, vendorId) {
    const want = String(vendorId || '').trim();
    if (!want || want === 'todos') return true;
    const primary = String(this._proposalVendorId(p) || '').trim();
    return primary === want;
  },

  _matchesStatusFilter: function(p, status) {
    const want = String(status || '').trim().toLowerCase();
    if (!want) return true;
    const pStatus = String(p.status || '').trim().toLowerCase();
    const pStatusOp = String(p.statusOp || p.status_op || '').trim().toLowerCase();
    
    const match = (val) => {
      if (val === want) return true;
      if (want === 'ag. boleto' && (val === 'ag. boleto' || val === 'aguardando boleto')) return true;
      if (want === 'ag. ass termo' && (val === 'ag. ass termo' || val === 'aguardando assinatura do termo')) return true;
      if (want === 'ag. vídeo' && (val === 'ag. vídeo' || val === 'aguardando vídeo' || val === 'ag. video' || val === 'aguardando video' || val === 'aguardando vídeo')) return true;
      if (want === 'ag. docs garantia' && (
        val === 'ag. docs garantia'
        || val === 'aguardando documentos de garantia'
        || val === 'aguardando docs garantia'
        || val === 'ag. documentos garantia'
      )) return true;
      if (want === 'ag. ass proposta' && (val === 'ag. ass proposta' || val === 'aguardando assinatura da proposta')) return true;
      if (want === 'ag. quitação' && (val === 'ag. quitação' || val === 'aguardando quitação' || val === 'ag. quitacao' || val === 'aguardando quitacao')) return true;
      if (want === 'ag. liberação margem' && (val === 'ag. liberação margem' || val === 'aguardando liberação margem' || val === 'ag. liberacao margem' || val === 'aguardando liberacao margem')) return true;
      if (want === 'digitação' && (val === 'digitação' || val === 'digitacao')) return true;
      if (want === 'pendenciado' && (val === 'pendenciado' || val === 'pendente')) return true;
      return false;
    };
    
    return match(pStatus) || match(pStatusOp);
  },

  _matchesProposalQuickSearch: function(p, query) {
    const raw = String(query || '').trim();
    if (!raw) return true;
    const blob = [
      p.numero, p.id,
      p.clientName, p.client_name, p.clientCpf, p.client_cpf,
      p.product, p.convenio, p.entidade,
      p.vendorName, p.vendor_name,
      p.protocolo, p.matricula, p.status,
    ].map(x => (x != null ? String(x) : '')).join(' ');
    if (typeof textMatchesSearch === 'function') {
      if (textMatchesSearch(blob, raw)) return true;
    } else {
      const n = raw.toLowerCase();
      if (blob.toLowerCase().includes(n)) return true;
    }
    const qDigits = raw.replace(/\D/g, '');
    if (qDigits.length >= 3) {
      const cpf = String(p.clientCpf || p.client_cpf || '').replace(/\D/g, '');
      const mat = String(p.matricula || '').replace(/\D/g, '');
      if (cpf.includes(qDigits) || mat.includes(qDigits)) return true;
    }
    return false;
  },

  _folderRootId: 'propAnexosFolders',
  _folderPrefix: 'prop',
  _folderDynamicSlots: {},
  _customFolders: [],

  _setFolderContext: function(rootId, prefix) {
    this._folderRootId = rootId || 'propAnexosFolders';
    this._folderPrefix = prefix || 'prop';
  },

  _resolveAnexoRootFromEl: function(el) {
    const root = el?.closest?.('#empPropAnexosFolders, #propAnexosFolders, #managePropAnexosFolders');
    if (!root) return null;
    const cfg = {
      empPropAnexosFolders: ['empPropAnexosFolders', 'empProp'],
      managePropAnexosFolders: ['managePropAnexosFolders', 'manageProp'],
      propAnexosFolders: ['propAnexosFolders', 'prop'],
    }[root.id];
    if (cfg) this._setFolderContext(cfg[0], cfg[1]);
    return root;
  },

  _initAnexoFolderDelegation: function() {
    if (this._anexoDelegationWired) return;
    this._anexoDelegationWired = true;
    document.addEventListener('click', (e) => {
      const fileBtn = e.target.closest('.prop-folder__btn');
      if (fileBtn) {
        e.preventDefault();
        this._resolveAnexoRootFromEl(fileBtn);
        const slot = fileBtn.closest('.prop-folder__slot');
        (slot?.querySelector('input[type="file"]') || fileBtn.parentElement?.querySelector('input[type="file"]'))?.click();
        return;
      }
      const addBtn = e.target.closest('.prop-folder__add');
      if (addBtn) {
        e.preventDefault();
        this._resolveAnexoRootFromEl(addBtn);
        const folder = addBtn.closest('.prop-folder');
        if (!folder) return;
        if (folder.dataset.folderKey) this.addFolderSlot(folder.dataset.folderKey);
        else if (folder.dataset.customId) this.addCustomFolderSlot(folder.dataset.customId);
        return;
      }
      const removeBtn = e.target.closest('.prop-folder__remove');
      if (removeBtn) {
        e.preventDefault();
        this._resolveAnexoRootFromEl(removeBtn);
        const folder = removeBtn.closest('.prop-folder');
        if (folder?.dataset.customId) this.removeCustomFolder(folder.dataset.customId);
      }
    });
    document.addEventListener('change', (e) => {
      const inp = e.target.closest?.('.prop-folder__input');
      if (!inp?.id) return;
      this._resolveAnexoRootFromEl(inp);
      this._labelFile(inp.id, inp.id + 'Label');
    });
  },

  _getFolderDefs: function() {
    const p = this._folderPrefix || 'prop';
    return (this._ANEXO_CATEGORIES || []).map(cat => {
      const def = {
        key: cat.key,
        titulo: cat.titulo,
        idPrefix: p + cat.folderIdSuffix,
        grupoPrefix: cat.grupoPrefix,
      };
      if (cat.initialSlots?.length) {
        def.initialSlots = cat.initialSlots.map(s => ({
          id: p + cat.folderIdSuffix + (s.slotSuffix || ''),
          grupo: s.grupo,
          label: s.label,
        }));
      }
      return def;
    });
  },

  _getAnexoViewGroups: function() {
    return (this._ANEXO_CATEGORIES || []).map(cat => ({
      titulo: cat.titulo,
      prefix: cat.grupoPrefix,
      seed: cat.viewSeed || [],
    }));
  },

  _initDynamicFolderSlots: function() {
    this._folderDynamicSlots = {};
    this._getFolderDefs().forEach(def => {
      if (def.initialSlots) {
        this._folderDynamicSlots[def.key] = def.initialSlots.map(s => ({ ...s }));
      } else {
        this._folderDynamicSlots[def.key] = [{
          id: def.idPrefix + '1',
          grupo: def.grupoPrefix + '1',
        }];
      }
    });
  },

  _nextFolderSlot: function(def) {
    const slots = this._folderDynamicSlots[def.key] || [];
    const n = slots.length + 1;
    if (def.initialSlots && n <= def.initialSlots.length) {
      return { ...def.initialSlots[n - 1] };
    }
    return {
      id: def.idPrefix + n,
      grupo: def.grupoPrefix + n,
    };
  },

  _folderSlotRowHtml: function(inputId, labelText, grupo) {
    const safeId = this._escAttr(inputId);
    const lblId = inputId + 'Label';
    const sub = labelText
      ? `<span class="prop-folder__slot-label">${this._escHtml(labelText)}</span>`
      : '';
    const grupoAttr = grupo ? ` data-grupo="${this._escAttr(grupo)}"` : '';
    return `<div class="prop-folder__slot">
      ${sub}
      <input type="file" id="${safeId}" class="form-control prop-folder__input" accept="*/*"${grupoAttr}>
      <button type="button" class="btn btn-outline btn-sm prop-folder__btn" title="Selecionar arquivo">📁</button>
      <div id="${lblId}" class="prop-file-label prop-file-preview-wrap">-</div>
    </div>`;
  },

  _buildFolderSlotsHtml: function(folderKey) {
    const slots = this._folderDynamicSlots[folderKey] || [];
    return slots.map((s, idx) =>
      `<div class="prop-folder__slot-wrap" data-slot="${idx + 1}">` +
      this._folderSlotRowHtml(s.id, s.label, s.grupo) + '</div>'
    ).join('');
  },

  _appendSlotToFolderEl: function(folderEl, slot, slotIndex) {
    if (!folderEl || !slot) return;
    const slotsEl = folderEl.querySelector('.prop-folder__slots');
    if (!slotsEl) return;
    const wrap = document.createElement('div');
    wrap.className = 'prop-folder__slot-wrap';
    wrap.dataset.slot = String(slotIndex);
    wrap.innerHTML = this._folderSlotRowHtml(slot.id, slot.label, slot.grupo);
    slotsEl.appendChild(wrap);
  },

  /** Expande slots no DOM sem recriar inputs (preserva arquivo já selecionado pelo vendedor). */
  _expandAnexoSlotsDom: function() {
    const root = document.getElementById(this._folderRootId);
    if (!root) return;
    this._getFolderDefs().forEach((def) => {
      const slots = this._folderDynamicSlots[def.key] || [];
      const folder = root.querySelector(`.prop-folder[data-folder-key="${def.key}"]`);
      if (!folder) return;
      const existing = folder.querySelectorAll('.prop-folder__slot-wrap').length;
      for (let i = existing; i < slots.length; i++) {
        this._appendSlotToFolderEl(folder, slots[i], i + 1);
      }
    });
  },

  _syncAnexoUploadFormFromAttachments: function(att) {
    const uploadWrap = document.getElementById(this._folderRootId)?.closest('[id$="AnexosUpload"]');
    if (!uploadWrap || uploadWrap.style.display === 'none') return;
    this._syncAnexoSlotsFromAttachments(att);
    const root = document.getElementById(this._folderRootId);
    if (!root) return;
    if (root.children.length && !this._hasPendingAnexoUploads()) {
      this._expandAnexoSlotsDom();
    } else if (!root.children.length) {
      this._renderAnexoFolders();
    } else {
      this._expandAnexoSlotsDom();
    }
    this._markSavedAttachmentsOnUploadForm(att);
  },

  _renderAnexoFolders: function() {
    const root = document.getElementById(this._folderRootId);
    if (!root) return;

    this._customFolders.forEach(cf => {
      const el = document.getElementById(cf.nameInputId);
      if (el) cf.name = el.value;
    });

    let html = '';
    this._getFolderDefs().forEach(def => {
      html += `<div class="prop-folder" data-folder-key="${this._escAttr(def.key)}">
        <div class="prop-folder__header">
          <span class="prop-folder__title">${def.titulo}</span>
        </div>
        <div class="prop-folder__slots">${this._buildFolderSlotsHtml(def.key)}</div>
        <button type="button" class="btn btn-ghost btn-sm prop-folder__add">+ Adicionar arquivo</button>
      </div>`;
    });

    this._customFolders.forEach(cf => {
      html += this._buildCustomFolderHtml(cf);
    });

    root.innerHTML = html;
  },

  initAnexoFolders: function() {
    /* Slots herdados de outro contexto (empProp/manageProp) geravam inputs com IDs
       duplicados no DOM e anexos duplicados/trocados no save — reinicia se houver id
       com prefixo diferente do contexto atual. */
    const p = this._folderPrefix || 'prop';
    const stale = Object.values(this._folderDynamicSlots || {}).some((list) =>
      (list || []).some((s) => !String(s.id || '').startsWith(p)));
    if (!this._folderDynamicSlots || !Object.keys(this._folderDynamicSlots).length || stale) {
      this._initDynamicFolderSlots();
    }
    this._renderAnexoFolders();
  },

  resetAnexoFolders: function(att) {
    this._customFolders = [];
    this._initDynamicFolderSlots();
    if (att) this._syncAnexoSlotsFromAttachments(att);
    this._renderAnexoFolders();
  },

  /** Expande slots de upload conforme anexos já salvos (ex.: 3 contracheques). */
  _syncAnexoSlotsFromAttachments: function(att) {
    const parsed = this._parseAttachments(att);
    if (!this._hasProposalAttachments(parsed)) return;

    this._getFolderDefs().forEach((def) => {
      const slots = this._folderDynamicSlots[def.key];
      if (!slots) return;
      const grupoSet = new Set(slots.map((s) => s.grupo));
      const prefix = def.grupoPrefix;
      const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const numbered = [];

      Object.keys(parsed).forEach((k) => {
        if (this._isAttachmentMetaKey(k)) return;
        const m = k.match(new RegExp('^' + esc + '(\\d+)$'));
        if (m) numbered.push(parseInt(m[1], 10));
      });

      if (!numbered.length) return;
      const maxN = Math.max(...numbered, slots.length);
      /* for com limite fixo (o while anterior travava se o grupo já existisse no Set) */
      for (let n = slots.length + 1; n <= maxN; n++) {
        let slot;
        if (def.initialSlots && n <= def.initialSlots.length) {
          slot = { ...def.initialSlots[n - 1] };
        } else {
          slot = {
            id: def.idPrefix + n,
            grupo: prefix + n,
          };
        }
        if (!grupoSet.has(slot.grupo)) {
          slots.push(slot);
          grupoSet.add(slot.grupo);
        }
      }
    });
  },

  addFolderSlot: function(folderKey) {
    const def = this._getFolderDefs().find(d => d.key === folderKey);
    if (!def) return;
    if (!this._folderDynamicSlots[folderKey]) this._initDynamicFolderSlots();
    const slot = this._nextFolderSlot(def);
    this._folderDynamicSlots[folderKey].push(slot);
    const root = document.getElementById(this._folderRootId);
    const folder = root?.querySelector(`.prop-folder[data-folder-key="${folderKey}"]`);
    this._appendSlotToFolderEl(folder, slot, this._folderDynamicSlots[folderKey].length);
  },

  _buildCustomFolderHtml: function(cf) {
    const slotsHtml = cf.slots.map((s, idx) =>
      `<div class="prop-folder__slot-wrap" data-slot="${idx + 1}">` +
      this._folderSlotRowHtml(s.id) + '</div>'
    ).join('');
    return `<div class="prop-folder prop-folder--custom" data-custom-id="${this._escAttr(cf.id)}">
      <div class="prop-folder__header">
        <input type="text" class="form-control prop-folder__custom-name" id="${this._escAttr(cf.nameInputId)}" placeholder="Nome da pasta" value="${this._escAttr(cf.name || '')}">
        <button type="button" class="btn btn-ghost btn-sm prop-folder__remove" title="Remover pasta">✕</button>
      </div>
      <div class="prop-folder__slots">${slotsHtml}</div>
      <button type="button" class="btn btn-ghost btn-sm prop-folder__add">+ Adicionar arquivo</button>
    </div>`;
  },

  addCustomFolder: function(fromEl) {
    if (fromEl) {
      const prev = fromEl.previousElementSibling;
      if (prev?.id && /AnexosFolders$/.test(prev.id)) this._resolveAnexoRootFromEl(prev);
      else this._resolveAnexoRootFromEl(fromEl);
    }
    const root = document.getElementById(this._folderRootId);
    if (!root) return;
    const p = this._folderPrefix || 'prop';
    const id = String(Date.now()) + '_' + (this._customFolders.length + 1);
    const cf = {
      id,
      name: '',
      nameInputId: p + 'CustomName_' + id,
      slots: [{ id: p + 'Custom_' + id + '_1', grupo: 'custom_' + id + '_1' }],
    };
    this._customFolders.push(cf);
    root.insertAdjacentHTML('beforeend', this._buildCustomFolderHtml(cf));
  },

  removeCustomFolder: function(customId) {
    this._customFolders = this._customFolders.filter(cf => cf.id !== customId);
    const root = document.getElementById(this._folderRootId);
    root?.querySelector(`.prop-folder[data-custom-id="${customId}"]`)?.remove();
  },

  addCustomFolderSlot: function(customId) {
    const cf = this._customFolders.find(c => c.id === customId);
    if (!cf) return;
    const p = this._folderPrefix || 'prop';
    const nameEl = document.getElementById(cf.nameInputId);
    if (nameEl) cf.name = nameEl.value;
    const n = cf.slots.length + 1;
    const slot = { id: p + 'Custom_' + cf.id + '_' + n, grupo: 'custom_' + cf.id + '_' + n };
    cf.slots.push(slot);
    const root = document.getElementById(this._folderRootId);
    const folder = root?.querySelector(`.prop-folder[data-custom-id="${customId}"]`);
    this._appendSlotToFolderEl(folder, slot, n);
  },

  _getAllAnexoFieldDefs: function() {
    const list = [];
    Object.keys(this._folderDynamicSlots || {}).forEach(key => {
      (this._folderDynamicSlots[key] || []).forEach(s => list.push({ id: s.id, grupo: s.grupo }));
    });
    this._customFolders.forEach(cf => {
      cf.slots.forEach(s => list.push({ id: s.id, grupo: s.grupo, customNameId: cf.nameInputId }));
    });
    return list;
  },

  _collectAttachments: async function(proposalId, rootId) {
    if (!proposalId) throw new Error('ID da proposta é obrigatório para anexos.');
    const maxBytes = (this.PROPOSAL_MAX_FILE_MB || 50) * 1024 * 1024;
    const attachments = {};
    const defs = this._getAnexoUploadJobsFromDom(rootId);

    /* Anti-duplicação: slots obsoletos (contexto trocado / modal reaberto) podem gerar
       defs repetidos ou ids duplicados no DOM apontando para o MESMO input — o que
       subia o mesmo boleto 2x em grupos vizinhos (boleto_3 e boleto_4). */
    const seenGrupos = new Set();
    const seenInputs = new Set();
    const seenFilesByFolder = {};
    const jobs = [];
    defs.forEach(({ id, grupo, customNameId }) => {
      if (!grupo || seenGrupos.has(grupo)) return;
      seenGrupos.add(grupo);
      const inp = document.getElementById(id);
      const f = inp?.files?.[0];
      if (!f) return;
      if (seenInputs.has(inp)) {
        console.warn('[Proposals] input duplicado ignorado no upload:', id, grupo);
        return;
      }
      seenInputs.add(inp);
      const folder = grupo.replace(/\d+$/, '');
      const sig = `${f.name}|${f.size}|${f.lastModified}`;
      const set = seenFilesByFolder[folder] = seenFilesByFolder[folder] || new Set();
      if (set.has(sig)) {
        console.warn('[Proposals] arquivo repetido na mesma pasta ignorado no upload:', grupo, f.name);
        return;
      }
      set.add(sig);
      jobs.push((async () => {
        if (f.size > maxBytes) {
          throw new Error(`"${f.name}" excede ${this.PROPOSAL_MAX_FILE_MB || 50} MB.`);
        }
        attachments[grupo] = await (window.DB || DB).uploadProposalFile(f, proposalId, grupo);
        this._applyProposalUploadResult(attachments, grupo, attachments[grupo], f.name);
        if (customNameId) {
          const folderName = (document.getElementById(customNameId)?.value || '').trim();
          if (folderName) attachments[grupo + '_pasta'] = folderName;
        }
      })());
    });
    await Promise.all(jobs);
    return attachments;
  },

  /**
   * _isVendedorRole — perfil de vendedor (mesa/employee).
   * Inclui employee/funcionario — no RH muitos vendedores usam role "employee".
   */
  _isVendedorRole: function(role) {
    const r = typeof this._normProposalManageRole === 'function'
      ? this._normProposalManageRole(role)
      : String(role || '').trim().toLowerCase();
    return r === 'vendedor' || r === 'employee' || r === 'funcionario';
  },

  _labelEtapaVendedor: function(val) {
    const hit = (this._VENDOR_SITUACOES || []).find(o => o.v === val);
    if (hit) return hit.l;
    return val || '—';
  },

  /** Situação do vendedor — só em status/statusOp no banco (sem coluna etapaVendedor). */
  _vendorStage: function(p) {
    if (!p) return '';
    return String(p.statusOp || p.status_op || p.status || '').trim();
  },

  /** Rótulo exibido na lista — prioriza statusOp (fluxo vendedor/parceiro). */
  _proposalDisplayStatus: function(p) {
    const stage = this._vendorStage(p);
    if (stage) return this._labelEtapaVendedor(stage);
    return String(p?.status || p?.statusOp || p?.status_op || '—').trim() || '—';
  },

  _proposalStatusBadgeClass: function(val) {
    const u = String(val || '').trim().toUpperCase();
    if (u === 'EM ANDAMENTO') return 'badge-info';
    if (u === 'DIGITAÇÃO' || u === 'DIGITACAO') return 'badge-accent';
    if (u === 'AG. BOLETO') return 'badge-warning';
    if (u === 'AG. VÍDEO' || u === 'AG. VIDEO') return 'badge-warning';
    if (u === 'AG. DOCS GARANTIA') return 'badge-warning';
    if (u === 'PAGO') return 'badge-success';
    if (u === 'CANCELADO') return 'badge-danger';
    if (u === 'PENDENCIADO' || u === 'PENDENTE') return 'badge-warning';
    if (u === 'AVERBADO') return 'badge-success';
    return 'badge-muted';
  },

  /** Mantém status e statusOp alinhados quando o parceiro altera só o campo operacional. */
  _syncProposalStatusFields: function(proposal) {
    if (!proposal) return proposal;
    const st = String(proposal.status || '').trim();
    const op = String(proposal.statusOp || proposal.status_op || '').trim();
    if (op && st === 'Em Andamento' && op !== st) {
      proposal.status = op;
    } else if (st && !op) {
      proposal.statusOp = st;
      proposal.status_op = st;
    } else if (st && op) {
      proposal.status_op = op;
    }
    return proposal;
  },

  _proposalSearchUserTyped: false,
  _EMAIL_ONLY_RE: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

  _markProposalSearchTyped: function() {
    this._proposalSearchUserTyped = true;
  },

  _onProposalSearchFocus: function(el) {
    if (el) el.removeAttribute('readonly');
  },

  /** Chrome costuma injetar e-mail salvo no campo de busca (parece login). Não confundir com busca legítima. */
  _isAutofillJunkSearchQuery: function(raw) {
    const n = String(raw || '').trim().toLowerCase();
    if (!n || !this._EMAIL_ONLY_RE.test(n)) return false;
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    const sessEmail = String(session?.email || '').trim().toLowerCase();
    if (sessEmail && n === sessEmail) return true;
    // E-mail puro sem digitação/paste do usuário = autofill (busca de propostas não usa e-mail de login).
    if (!this._proposalSearchUserTyped) return true;
    return false;
  },

  _scrubProposalSearchAutofill: function() {
    const el = document.getElementById('proposalSearch');
    if (!el) return '';
    const raw = el.value || '';
    if (this._isAutofillJunkSearchQuery(raw)) {
      el.value = '';
      return '';
    }
    return String(raw).toLowerCase().trim();
  },

  _getProposalSearchQuery: function() {
    return this._scrubProposalSearchAutofill();
  },

  _onProposalSearchInput: function() {
    // Autofill do Chrome dispara input sem keydown — limpa e-mail lixo antes de filtrar.
    if (!this._proposalSearchUserTyped && this._isAutofillJunkSearchQuery(document.getElementById('proposalSearch')?.value)) {
      const el = document.getElementById('proposalSearch');
      if (el) el.value = '';
    }
    clearTimeout(this._searchDebounce);
    this._searchDebounce = setTimeout(() => {
      this._adminList.page = 1;
      this.renderAdminList();
    }, 350);
  },

  _getAdminVendorFilter: function() {
    const headerSel = document.getElementById('proposalVendorFilterHeader');
    if (headerSel) {
      const val = headerSel.value;
      return val === 'todos' ? '' : val;
    }
    return this._adminList.vendorId || '';
  },

  onAdminVendorFilter: function() {
    const val = this._getAdminVendorFilter();
    this._adminList.vendorId = val;
    this._adminList.page = 1;

    const headerSel = document.getElementById('proposalVendorFilterHeader');
    if (headerSel) headerSel.value = val === '' ? '' : val;
    this.renderAdminList();
  },

  /**
   * toggleAdminVendorSort — alterna ordenação por nome de funcionário (vendedor): nenhuma → A-Z → Z-A → nenhuma.
   */
  toggleAdminVendorSort: function() {
    if (this._adminList.sortField !== 'vendedor') {
      this._adminList.sortField = 'vendedor';
      this._adminList.sortDir = 'asc';
    } else if (this._adminList.sortDir === 'asc') {
      this._adminList.sortDir = 'desc';
    } else {
      this._adminList.sortField = '';
      this._adminList.sortDir = 'asc';
    }
    this._adminList.page = 1;
    this._updateAdminVendorSortHeader();
    this.renderAdminList();
  },

  /**
   * _updateAdminVendorSortHeader — sincroniza texto/estilo do botão #proposalVendorSortBtn com o estado atual.
   */
  _updateAdminVendorSortHeader: function() {
    const btn = document.getElementById('proposalVendorSortBtn');
    if (!btn) return;
    const active = this._adminList.sortField === 'vendedor';
    const dir = this._adminList.sortDir;
    btn.classList.toggle('btn-primary', active);
    btn.classList.toggle('btn-outline', !active);
    btn.textContent = active && dir === 'desc' ? 'Vendedor ↓ Z-A' : (active ? 'Vendedor ↑ A-Z' : 'Vendedor A-Z');
    btn.title = active
      ? (dir === 'desc' ? 'Ordenado Z-A por funcionário — clique para remover a ordenação' : 'Ordenado A-Z por funcionário — clique para inverter')
      : 'Ordenar propostas por nome de funcionário (vendedor), A-Z';
  },

  /**
   * _sortProposalsByVendorName — ordena lista de propostas pelo vendorName (pt-BR).
   */
  _sortProposalsByVendorName: function(list, dir) {
    const mult = dir === 'desc' ? -1 : 1;
    return (list || []).slice().sort((a, b) => {
      const va = String(a.vendorName || '').trim().toLocaleLowerCase('pt-BR');
      const vb = String(b.vendorName || '').trim().toLocaleLowerCase('pt-BR');
      return va.localeCompare(vb, 'pt-BR', { sensitivity: 'base' }) * mult;
    });
  },

  _getAdminStatusFilter: function() {
    const sel = document.getElementById('proposalStatusFilterHeader');
    if (sel) {
      const val = sel.value;
      return val === 'todos' ? '' : val;
    }
    return this._adminList.statusFilter || '';
  },

  onAdminStatusFilter: function() {
    this._adminList.statusFilter = this._getAdminStatusFilter();
    this._adminList.page = 1;
    this.renderAdminList();
  },

  /** YYYY-MM-DD em America/Sao_Paulo (calendário civil BR). */
  _ymdInPropTz: function(dateOrRaw) {
    if (dateOrRaw == null || dateOrRaw === '') return '';
    // Já veio como dia civil YYYY-MM-DD — não reinterpretar como UTC (evita dia -1).
    if (typeof dateOrRaw === 'string') {
      const m = String(dateOrRaw).trim().match(/^(\d{4}-\d{2}-\d{2})/);
      if (m && !/[T\s]\d{2}:\d{2}/.test(String(dateOrRaw).trim())) return m[1];
    }
    const d = dateOrRaw instanceof Date
      ? dateOrRaw
      : (typeof _parseSouBluDate === 'function' ? _parseSouBluDate(dateOrRaw) : new Date(dateOrRaw));
    if (!d || Number.isNaN(d.getTime())) return '';
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: this._PROP_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(d);
      const y = parts.find(p => p.type === 'year')?.value;
      const mth = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;
      if (y && mth && day) return `${y}-${mth}-${day}`;
      const flat = new Intl.DateTimeFormat('en-CA', {
        timeZone: this._PROP_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
      return String(flat).slice(0, 10);
    } catch (_) {
      return '';
    }
  },

  /** Mesma data da coluna DATA (created_at), dia civil SP. */
  _proposalCreatedDayKey: function(p) {
    return this._ymdInPropTz(p?.createdAt || p?.created_at || '');
  },

  /**
   * _proposalFilterDayKey — dia usado no filtro De/Até (estilo Livecred).
   * Tipo: criacao | digitacao | pagamento (select #proposalDateField).
   */
  _proposalFilterDayKey: function(p, statusFilter) {
    const field = String(
      this._adminList.dateField
      || document.getElementById('proposalDateField')?.value
      || 'criacao'
    ).toLowerCase();
    if (field === 'pagamento' || field === 'pago' || field === 'pagas') {
      if (typeof DB !== 'undefined' && typeof DB.proposalPaidAt === 'function') {
        const paid = DB.proposalPaidAt(p);
        const day = this._ymdInPropTz(paid);
        if (day) return day;
      }
      // Sem data de pagamento → fora do filtro de pagamento
      return '';
    }
    if (field === 'digitacao' || field === 'digitadas') {
      const dig = this._digitacaoAt(p);
      const day = this._ymdInPropTz(dig);
      if (day) return day;
      return '';
    }
    // Fallback legado: status PAGO sem tipo explícito ainda usa pagamento
    const st = String(statusFilter || this._adminList.statusFilter || '').trim().toUpperCase();
    if (st === 'PAGO' || st === 'PAGA' || st === 'PAGAS') {
      if (typeof DB !== 'undefined' && typeof DB.proposalPaidAt === 'function') {
        const paid = DB.proposalPaidAt(p);
        const day = this._ymdInPropTz(paid);
        if (day) return day;
      }
    }
    return this._proposalCreatedDayKey(p);
  },

  _getAdminDateFilter: function() {
    const fromEl = document.getElementById('proposalDateFrom');
    const toEl = document.getElementById('proposalDateTo');
    const fieldEl = document.getElementById('proposalDateField');
    const radio = document.querySelector('#proposalLivecredDateFilter input[name="proposalDateFieldRadio"]:checked');
    let from = fromEl ? String(fromEl.value || '').trim() : '';
    let to = toEl ? String(toEl.value || '').trim() : '';
    let dateField = radio
      ? String(radio.value || '').trim()
      : (fieldEl ? String(fieldEl.value || '').trim() : '');
    if (!fromEl && !toEl) {
      from = this._adminList.dateFrom || '';
      to = this._adminList.dateTo || '';
    }
    if (!dateField) dateField = this._adminList.dateField || 'criacao';
    if (fieldEl) fieldEl.value = dateField;
    if (from && to && from > to) {
      const tmp = from;
      from = to;
      to = tmp;
      if (fromEl) fromEl.value = from;
      if (toEl) toEl.value = to;
    }
    this._adminList.dateFrom = from;
    this._adminList.dateTo = to;
    this._adminList.dateField = dateField;
    return { dateFrom: from, dateTo: to, dateField };
  },

  _matchesDateFilter: function(p, dateFrom, dateTo, statusFilter) {
    if (!dateFrom && !dateTo) return true;
    const day = this._proposalFilterDayKey(p, statusFilter);
    if (!day) return false;
    if (dateFrom && day < dateFrom) return false;
    if (dateTo && day > dateTo) return false;
    return true;
  },

  /**
   * _syncAdminDateInputs — espelha De/Até/tipo nos inputs e radios Livecred.
   */
  _syncAdminDateInputs: function(from, to, dateField) {
    const fromEl = document.getElementById('proposalDateFrom');
    const toEl = document.getElementById('proposalDateTo');
    const fieldEl = document.getElementById('proposalDateField');
    if (fromEl) fromEl.value = from || '';
    if (toEl) toEl.value = to || '';
    if (fieldEl && dateField) fieldEl.value = dateField;
    if (dateField) {
      document.querySelectorAll('#proposalLivecredDateFilter input[name="proposalDateFieldRadio"]').forEach((r) => {
        r.checked = (r.value === dateField);
      });
    }
    this._adminList.dateFrom = from || '';
    this._adminList.dateTo = to || '';
    if (dateField) this._adminList.dateField = dateField;
  },

  onAdminDateFilter: function() {
    this._getAdminDateFilter();
    this._adminList.page = 1;
    this.renderAdminList({ forceRefresh: true });
  },


  adminSetPage: function(page) {
    this._adminList.page = Math.max(1, page);
    this.renderAdminList();
  },

  employeeSetPage: function(page) {
    this._employeeList.page = Math.max(1, page);
    this.renderEmployeeList();
  },

  _renderPagination: function(containerId, meta, goFn) {
    const targets = [containerId];
    // Só no hub Financeiro: espelhar pager acima da tabela (Admin mantém layout clássico).
    if (containerId === 'proposalsPagination' && window.SOUBLU_FINANCEIRO_PAGE) {
      targets.push('proposalsPaginationTop');
    } else if (containerId === 'proposalsPagination') {
      const top = document.getElementById('proposalsPaginationTop');
      if (top) top.innerHTML = '';
    }
    const nodes = targets.map((id) => document.getElementById(id)).filter(Boolean);
    if (!nodes.length) return;
    const { page, pageSize, total } = meta;
    const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
    let html = '';
    if (total <= pageSize && totalPages <= 1) {
      html = total > 0
        ? `<span class="list-pagination__info">${total} proposta${total !== 1 ? 's' : ''}</span>`
        : '';
    } else {
      const from = total ? (page - 1) * pageSize + 1 : 0;
      const to = Math.min(page * pageSize, total);
      html = `
      <div class="list-pagination">
        <button type="button" class="btn btn-outline btn-sm" ${page <= 1 ? 'disabled' : ''} onclick="${goFn}(${page - 1})">← Anterior</button>
        <span class="list-pagination__info">Página ${page} de ${totalPages} · ${from}–${to} de ${total}</span>
        <button type="button" class="btn btn-outline btn-sm" ${page >= totalPages ? 'disabled' : ''} onclick="${goFn}(${page + 1})">Próxima →</button>
      </div>`;
    }
    nodes.forEach((el) => { el.innerHTML = html; });
  },

  _initAdminProposalFilters: async function() {
    const selHeader = document.getElementById('proposalVendorFilterHeader');
    if (!selHeader) return;
    if (selHeader.dataset.loaded === '1' && selHeader.options.length > 2) return;
    try {
      const session = Auth.getSession();
      const scopeAdmin = await this._proposalVendorScopeForSession(session);
      const vendors = await DB.getVendorsForSelect(scopeAdmin);
      const opts = (vendors || [])
        .filter(v => v && v.id)
        .slice()
        .sort((a, b) => String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''), 'pt-BR', { sensitivity: 'base' }))
        .map(v => {
          const label = String(v.name || v.email || v.id || '').toUpperCase();
          return `<option value="${this._escAttr(v.id)}">${this._escHtml(label)}</option>`;
        })
        .join('');
      selHeader.innerHTML = '<option value="">VENDEDOR</option>' +
        '<option value="todos">TODOS OS VENDEDORES</option>' +
        opts;
      selHeader.title = 'Filtrar por vendedor';
      if (this._adminList.vendorId) selHeader.value = this._adminList.vendorId;
      if ((vendors || []).length) selHeader.dataset.loaded = '1';
      else delete selHeader.dataset.loaded;
    } catch (e) {
      console.warn('[Proposals] vendor filter:', e);
      delete selHeader.dataset.loaded;
    }
  },

  _isFinanceiroGestao: function() {
    return !!(typeof window !== 'undefined' && window.SOUBLU_FINANCEIRO_PAGE
      && document.getElementById('secManageProposals'));
  },

  _adminListColspan: function() {
    // +1 coluna "Data pagamento" (gestão/financeiro).
    return this._isFinanceiroGestao() ? 13 : 12;
  },

  _finGestaoActionBtns: function(id) {
    const safeId = this._escAttr(id);
    return `<button type="button" class="client-actions__btn" title="Baixa comissão" aria-label="Baixa comissão" onclick="FinPropostas.openProposalDrawer('${safeId}','comissao')"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></button>`
      + `<button type="button" class="client-actions__btn" title="Emitir prejuízo" aria-label="Emitir prejuízo" onclick="FinPropostas.openProposalDrawer('${safeId}','prejuizo')"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></button>`
      + `<button type="button" class="client-actions__btn" title="Debitar parceiro" aria-label="Debitar parceiro" onclick="FinPropostas.openProposalDrawer('${safeId}','debito')"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg></button>`;
  },

  _finComissaoActionBtn: function(id) {
    return this._finGestaoActionBtns(id);
  },

  _escHtml: function(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  _escAttr: function(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/'/g, '&#39;')
      .replace(/"/g, '&quot;');
  },

  _actionIconSvg: function(name) {
    const icons = {
      eye: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
      pen: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
      trash: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    };
    return icons[name] || '';
  },

  /**
   * _unlockManageValorFields — libera nº/valor no modal admin (HTML vem com fundo cinza no bruto).
   * Entrada: editable true quando backoffice/supervisor+ em modo edição.
   */
  _unlockManageValorFields: function(editable) {
    const valorIds = ['managePropValorBruto', 'managePropValorEdit', 'managePropNumeroEdit'];
    valorIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (editable) {
        el.removeAttribute('readonly');
        el.disabled = false;
        el.readOnly = false;
        el.style.cursor = 'text';
        if (id === 'managePropValorBruto') {
          el.style.background = 'var(--color-surface, #fff)';
        }
      }
    });
  },

  /** Ícones compactos — gestão admin, parceiros e cards do vendedor */
  actionsRowHtml: function(id, opts = {}) {
    const safeId = this._escAttr(id);
    const safeLabel = this._escAttr(opts.label || id);
    const employee = !!opts.employee;
    const canEdit = opts.canEdit !== false;
    const canDelete = !!opts.canDelete;
    const role = this._normProposalManageRole(typeof Auth !== 'undefined' && Auth.getSession()?.role);
    const adminOpensEdit = !employee && this._canEditNumeroValor(role);
    const onView = employee
      ? `Proposals.openEmployeeViewModal('${safeId}')`
      : (adminOpensEdit ? `Proposals.openAdminModal('${safeId}')` : `Proposals.openAdminViewModal('${safeId}')`);
    const onEdit = employee
      ? `Proposals.openEmployeeModal('${safeId}')`
      : `Proposals.openAdminModal('${safeId}')`;
    const onDelete = `Proposals.masterDeleteProposal('${safeId}', '${safeLabel}')`;
    const eye = this._actionIconSvg('eye');
    const pen = this._actionIconSvg('pen');
    const trash = this._actionIconSvg('trash');
    let inner = `<button type="button" class="client-actions__btn" title="Ver" aria-label="Ver proposta" onclick="${onView}">${eye}</button>`;
    if (canEdit) {
      inner += `<button type="button" class="client-actions__btn" title="Editar" aria-label="Editar proposta" onclick="${onEdit}">${pen}</button>`;
    }
    if (canDelete) {
      inner += `<button type="button" class="client-actions__btn client-actions__btn--danger" title="Arquivar na Localweb" aria-label="Arquivar proposta" onclick="${onDelete}">${trash}</button>`;
    }
    return `<div class="client-actions" role="group" aria-label="Ações da proposta">${inner}</div>`;
  },

  /**
   * _ensureProposalTableScrollContainer — marca o wrapper da tabela para scroll horizontal.
   * Garante classe proposals-table-scroll mesmo em HTML legado no DOM.
   */
  _ensureProposalTableScrollContainer: function() {
    const wrap = document.querySelector('#secManageProposals .table-wrap');
    if (wrap) wrap.classList.add('proposals-table-scroll');
  },

  /**
   * _probeProposalTableLayout — mede scroll horizontal da tabela (debug responsivo).
   */
  _probeProposalTableLayout: function(runId) {
    const sec = document.getElementById('secManageProposals');
    const wrap = sec?.querySelector('.table-wrap');
    const table = wrap?.querySelector('table.data-table');
    const main = document.querySelector('.main-area');
    const page = document.querySelector('.page-content');
    if (!wrap || !table) return;
    const csWrap = getComputedStyle(wrap);
    const csPage = page ? getComputedStyle(page) : null;
    const card = sec?.querySelector('.proposals-list-card');
    const csCard = card ? getComputedStyle(card) : null;
},

  /**
   * _resetAdminProposalTableLayout — remove hacks de layout (colgroup / table-layout fixed).
   * Mantém tabela fluida; ações ficam na coluna via DOM paint.
   */
  _resetAdminProposalTableLayout: function() {
    const table = document.querySelector('#secManageProposals table.data-table');
    if (!table) return;
    table.querySelector('colgroup')?.remove();
    table.style.removeProperty('min-width');
    table.style.removeProperty('table-layout');
    delete table.dataset.propLayoutReady;
  },

  /**
   * _runProposalAction — executa Ver/Editar/Arquivar a partir do botão da lista.
   * Usado pelos handlers diretos nos botões (não depende de bubbling até o tbody).
   */
  _runProposalAction: function(btn) {
    if (!btn) return;
    const id = btn.getAttribute('data-prop-id');
    const label = btn.getAttribute('data-prop-label') || id;
    const act = btn.getAttribute('data-prop-action');
    if (!id || !act) return;
    this._openModalBusy = false;
    if (act === 'view') {
      if (btn.getAttribute('data-prop-employee') === '1') this.openEmployeeViewModal(id);
      else if (btn.getAttribute('data-prop-admin-edit') === '1') this.openAdminModal(id, false);
      else this.openAdminViewModal(id);
    } else if (act === 'edit') {
      if (btn.getAttribute('data-prop-employee') === '1') this.openEmployeeModal(id);
      else this.openAdminModal(id, false);
    } else if (act === 'delete') {
      this.masterDeleteProposal(id, label);
    }
  },

  /**
   * _ensureAdminProposalActionsDelegation — fallback de cliques Ver/Editar/Arquivar.
   * Capture=true no documento: sobrevive a re-render e não some se o tbody for trocado.
   */
  _ensureAdminProposalActionsDelegation: function() {
    if (typeof document === 'undefined') return;
    if (document.documentElement.dataset.propActionsBound === '1') return;
    document.documentElement.dataset.propActionsBound = '1';
    document.addEventListener('click', (ev) => {
      const btn = ev.target.closest?.('[data-prop-action]');
      if (!btn) return;
      const inAdmin = btn.closest('#manageProposalsTbody, #manageProposalsMobileList, #secManageProposals');
      if (!inAdmin) return;
      ev.preventDefault();
      ev.stopPropagation();
      this._runProposalAction(btn);
    }, true);
  },

  /**
   * _paintProposalActionCell — monta botões de ação via DOM na célula da lista admin.
   * Handlers diretos no botão (onclick) — não dependem de bubbling até o tbody.
   */
  _paintProposalActionCell: function(td, id, opts = {}) {
    if (!td) return;
    td.innerHTML = '';
    td.classList.add('td-proposal-actions');
    // Só impede clique da linha financeira; deixa os botões de ação funcionarem.
    td.onclick = (ev) => {
      if (ev.target.closest('[data-prop-action], .client-actions__btn')) return;
      ev.stopPropagation();
    };

    if (opts.finGestao) {
      td.insertAdjacentHTML('beforeend', this._finGestaoActionBtns(id));
    }

    const wrap = document.createElement('div');
    wrap.className = 'client-actions';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Ações da proposta');

    const safeId = String(id ?? '');
    const label = String(opts.label || id || '');
    const employee = !!opts.employee;
    const canEdit = opts.canEdit !== false;
    const canDelete = !!opts.canDelete;
    let adminOpensEdit = false;
    try {
      const role = this._normProposalManageRole(typeof Auth !== 'undefined' && Auth.getSession()?.role);
      adminOpensEdit = !employee && this._canEditNumeroValor(role);
    } catch (_) { /* noop */ }

    const self = this;
    const mkBtn = (action, title, iconName, danger) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'client-actions__btn' + (danger ? ' client-actions__btn--danger' : '');
      btn.title = title;
      btn.setAttribute('aria-label', title + ' proposta');
      btn.setAttribute('data-prop-action', action);
      btn.setAttribute('data-prop-id', safeId);
      btn.setAttribute('data-prop-label', label);
      if (employee) btn.setAttribute('data-prop-employee', '1');
      if (adminOpensEdit && action === 'view') btn.setAttribute('data-prop-admin-edit', '1');
      btn.innerHTML = this._actionIconSvg(iconName);
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        self._runProposalAction(btn);
      });
      return btn;
    };

    wrap.appendChild(mkBtn('view', 'Ver', 'eye', false));
    if (canEdit) wrap.appendChild(mkBtn('edit', 'Editar', 'pen', false));
    if (canDelete) wrap.appendChild(mkBtn('delete', 'Arquivar na Localweb', 'trash', true));
    td.appendChild(wrap);
  },

  /**
   * _paintAdminProposalActionCells — preenche coluna Ações após render da tabela (gestão admin).
   */
  _paintAdminProposalActionCells: function(proposals, opts = {}) {
    const tbody = document.getElementById('manageProposalsTbody');
    if (!tbody || !proposals?.length) return;
    this._ensureAdminProposalActionsDelegation();
    const finGestao = !!opts.finGestao;
    proposals.forEach((p) => {
      const sid = String(p.id);
      const esc = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(sid) : sid.replace(/"/g, '');
      let row = tbody.querySelector(`tr[data-prop-id="${esc}"]`);
      if (!row) {
        row = [...tbody.querySelectorAll('tr[data-prop-id]')].find((tr) => tr.getAttribute('data-prop-id') === sid);
      }
      if (!row) return;
      let td = row.querySelector('.td-proposal-actions');
      if (!td) {
        td = document.createElement('td');
        td.className = 'td-proposal-actions';
        row.appendChild(td);
      }
      const canEditRow = typeof opts.canEditRowFn === 'function'
        ? opts.canEditRowFn(p)
        : (opts.canEdit !== false);
      const canDeleteRow = typeof opts.canDeleteFn === 'function'
        ? opts.canDeleteFn(p)
        : !!opts.canDelete;
      this._paintProposalActionCell(td, p.id, {
        finGestao,
        canEdit: canEditRow,
        canDelete: canDeleteRow,
        label: p.numero || p.clientName || p.id,
      });
    });
  },

  _escUrlAttr: function(s) {
    return String(s ?? '').replace(/"/g, '&quot;');
  },

  /** Chaves auxiliares do JSON de anexos (metadados) — nunca são arquivos. */
  _isAttachmentMetaKey: function(k) {
    return k.endsWith('_nome') || k.endsWith('_pasta') || k.endsWith('_caminho') || k.endsWith('_public');
  },

  _parseAttachments: function(att) {
    if (typeof DB !== 'undefined' && DB._parseProposalAttachments) {
      return DB._parseProposalAttachments(att);
    }
    if (!att) return {};
    if (typeof att === 'string') {
      try { return JSON.parse(att) || {}; } catch { return {}; }
    }
    if (Array.isArray(att)) return {};
    return att && typeof att === 'object' ? att : {};
  },

  _proposalSaveErrorMsg: function(err) {
    let msg = String(err?.message || err || '');
    if (typeof friendlyApiError === 'function' && (/<html|<!doctype|nginx/i.test(msg) || msg.length > 300)) {
      msg = friendlyApiError(0, msg);
    }
    if (msg === 'PAYLOAD_TOO_LARGE' || msg === 'ATTACHMENTS_TOO_LARGE') {
      return `Esta proposta tem anexos muito grandes para salvar de uma vez. Envie um arquivo por vez (até ${this.PROPOSAL_MAX_FILE_MB || 50} MB) ou aguarde o upload terminar antes de salvar.`;
    }
    if (msg.includes('57014') || /statement timeout/i.test(msg)) {
      return 'Tempo esgotado ao salvar. Anexos grandes devem ir ao Storage — use Ctrl+F5 e tente de novo. Confira o bucket "proposal-attachments" no Supabase.';
    }
    if (/payload too large|413|entity too large|muito grandes/i.test(msg)) {
      return `Anexo muito grande. Limite de ${this.PROPOSAL_MAX_FILE_MB || 50} MB por arquivo — envie um por vez se necessário.`;
    }
    if (/403|acesso negado|forbidden/i.test(msg)) {
      return 'Acesso negado ao salvar. Verifique permissões, reduza anexos ou contate o suporte técnico.';
    }
    if (/<html|<!doctype|<body[\s>]|nginx/i.test(msg)) {
      return 'Erro no servidor ao salvar. Tente novamente com arquivos menores ou contate o suporte.';
    }
    if (msg.length > 220) {
      return 'Não foi possível salvar a proposta. Tente novamente ou contate o suporte.';
    }
    return msg || 'Não foi possível salvar a proposta.';
  },

  _proposalSaveErrorNotify: function(err) {
    const msg = this._proposalSaveErrorMsg(err);
    this._notifyOverModal(msg, 'error');
  },

  /**
   * _notifyOverModal — toast/alert visível COM modal aberto.
   * Toast antigo (z-index 9999) ficava atrás do overlay (999999) e o Salvar
   * parecia “não fazer nada” quando o save era bloqueado.
   */
  _notifyOverModal: function(msg, type) {
    const text = String(msg || '').trim() || 'Não foi possível salvar.';
    if (typeof showToast === 'function') showToast(text, type || 'error', 8000);
    // Bloqueios críticos: alert garante feedback mesmo se o toast falhar
    if (type === 'error' || type === 'warning') {
      try { window.alert(text); } catch (_) { /* noop */ }
    }
  },

  _applyProposalUploadResult: function(att, grupo, uploaded, fallbackNome) {
    if (!att || !grupo) return;
    const nome = (uploaded && uploaded.nome) || fallbackNome || '';
    if (uploaded && typeof uploaded === 'object' && (uploaded.url || uploaded.caminho)) {
      let caminho = String(uploaded.caminho || this._extractStorageRelative(uploaded.url) || '').replace(/^\/+/, '');
      if (!caminho && !String(uploaded.url || '').startsWith('data:')) {
        /* URL http(s) ou file.php sem caminho explícito — mantém referência sem bloquear save. */
        att[grupo] = uploaded.url;
        att[grupo + '_nome'] = nome;
        if (uploaded.public_url) att[grupo + '_public'] = uploaded.public_url;
        return;
      }
      if (!caminho && String(uploaded.url || '').startsWith('data:')) {
        att[grupo] = uploaded.url;
        att[grupo + '_nome'] = nome;
        return;
      }
      if (caminho) {
        caminho = this._normalizeStorageCaminho(caminho);
        att[grupo + '_caminho'] = caminho;
        const served = this._fileServeUrl(caminho);
        att[grupo] = served || uploaded.url;
      } else {
        att[grupo] = uploaded.url;
      }
      if (uploaded.public_url) att[grupo + '_public'] = uploaded.public_url;
      att[grupo + '_nome'] = nome;
      return;
    }
    const raw = String(uploaded || '').trim();
    if (!raw) return;
    const rel = this._extractStorageRelative(raw);
    if (!rel && !/^data:/i.test(raw)) {
      throw new Error(`Anexo "${nome || grupo}" com URL inválida.`);
    }
    att[grupo] = rel ? (this._fileServeUrl(rel) || raw) : raw;
    att[grupo + '_nome'] = nome;
    if (rel) att[grupo + '_caminho'] = this._normalizeStorageCaminho(rel);
  },

  /** Dedup defensivo: remove chaves numéricas da mesma pasta apontando para a mesma URL/caminho. */
  _dedupeAttachmentsByUrl: function(parsed) {
    const numKeys = Object.keys(parsed || {}).filter((k) =>
      !this._isAttachmentMetaKey(k) && /^(.+_)(\d+)$/.test(k)
    );
    numKeys.sort((a, b) => {
      const ma = a.match(/^(.+_)(\d+)$/);
      const mb = b.match(/^(.+_)(\d+)$/);
      if (ma[1] !== mb[1]) return ma[1] < mb[1] ? -1 : 1;
      return parseInt(ma[2], 10) - parseInt(mb[2], 10);
    });
    const seenByFolder = {};
    numKeys.forEach((k) => {
      const folder = k.match(/^(.+_)(\d+)$/)[1];
      const sig = String(parsed[k + '_caminho'] || parsed[k] || '').trim();
      if (!sig || /^data:/i.test(sig)) return;
      const set = seenByFolder[folder] = seenByFolder[folder] || new Set();
      if (set.has(sig)) {
        console.warn('[Proposals] anexo duplicado removido no save:', k, sig.slice(0, 120));
delete parsed[k];
        delete parsed[k + '_nome'];
        delete parsed[k + '_caminho'];
        delete parsed[k + '_public'];
        delete parsed[k + '_pasta'];
      } else {
        set.add(sig);
      }
    });
    return parsed;
  },

  _validateAttachmentsBeforeSave: function(att) {
    const parsed = this._parseAttachments(att);
    Object.keys(parsed || {}).forEach((k) => {
      if (this._isAttachmentMetaKey(k)) return;
      const v = parsed[k];
      if (!v || /^data:/i.test(String(v))) return;
      let caminho = String(parsed[k + '_caminho'] || '').replace(/^\/+/, '')
        || this._extractStorageRelative(v);
      if (!caminho) {
        const norm = this._normalizeAttachmentUrl(v);
        caminho = this._extractStorageRelative(norm) || this._extractStorageRelative(v);
      }
      if (!caminho) {
        if (/^https?:\/\//i.test(String(v)) || /file\.php/i.test(String(v))) {
          parsed[k] = String(v);
          parsed[k + '_nome'] = parsed[k + '_nome'] || k;
          return;
        }
        throw new Error(`Anexo "${parsed[k + '_nome'] || k}" sem caminho — reenvie o arquivo antes de salvar.`);
      }
      caminho = this._normalizeStorageCaminho(caminho);
      parsed[k + '_caminho'] = caminho;
      if (!/file\.php/i.test(String(parsed[k])) && !/^data:/i.test(String(parsed[k]))) {
        const served = this._fileServeUrl(caminho);
        if (served) parsed[k] = served;
      }
    });
    return this._dedupeAttachmentsByUrl(parsed);
  },

  _attachmentCaminho: function(raw, att, key) {
    const stored = att && key ? att[key + '_caminho'] : '';
    const rel = stored
      ? this._normalizeStorageCaminho(stored)
      : this._normalizeStorageCaminho(this._extractStorageRelative(raw));
    return rel;
  },

  _attachmentViewerCache: [],
  _lastAttachmentBlobUrl: null,
  _attachmentLoadPromises: {},

  _SUPABASE_LEGACY: 'https://dqptnlywbarvznpzgtuj.supabase.co',
  _SUPABASE_V2: 'https://cpqediswbjxcvpnwflyj.supabase.co',

  _supabasePublicUrl: function(base, relPath) {
    const rel = String(relPath || '').replace(/^\/+/, '');
    if (!rel || !base) return '';
    const parts = rel.split('/');
    const bucket = parts.shift();
    if (!bucket || !parts.length) return '';
    const objectEnc = parts.map((p) => encodeURIComponent(p)).join('/');
    return `${String(base).replace(/\/+$/, '')}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectEnc}`;
  },

  /** Anexos de proposta: só projeto original (sou+blu). v2 = WhatsApp. */
  _allSupabasePublicUrls: function(relPath) {
    const u = this._supabasePublicUrl(this._SUPABASE_LEGACY, relPath);
    return u ? [u] : [];
  },

  _siteBaseUrl: function() {
    const cfg = typeof window !== 'undefined' ? (window.SOUBLU_CONFIG || {}) : {};
    return String(cfg.SITE_URL || cfg.API_BASE_URL || (typeof location !== 'undefined' ? location.origin : ''))
      .replace(/\/+$/, '');
  },

  _mapSupabaseStorageToLocalUpload: function(url) {
    const rel = this._extractStorageRelative(url);
    return rel ? this._fileServeUrl(rel) : '';
  },

  _extractStorageRelative: function(url) {
    const s = String(url || '').trim();
    if (!s) return '';
    if (/file\.php/i.test(s)) {
      const m = s.match(/[?&]path=([^&]+)/i);
      if (m) return decodeURIComponent(m[1]).replace(/^\/+/, '');
    }
    const up = s.match(/\/uploads\/([^?#]+)/i);
    if (up) return decodeURIComponent(up[1]);
    const supa = s.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/i);
    if (supa) {
      let bucket = decodeURIComponent(supa[1]);
      if (bucket === 'propostas') bucket = 'proposal-attachments';
      return bucket + '/' + decodeURIComponent(supa[2]);
    }
    if (/^proposal-attachments\//i.test(s)) return s.replace(/^\/+/, '');
    return '';
  },

  _extractUploadsRelative: function(url) {
    return this._extractStorageRelative(url);
  },

  _normalizeStorageCaminho: function(caminho) {
    const db = window.DB || (typeof DB !== 'undefined' ? DB : null);
    if (db && typeof db.normalizeProposalCaminho === 'function') {
      return db.normalizeProposalCaminho(caminho);
    }
    const rel = String(caminho || '').replace(/^\/+/, '');
    if (!rel) return '';
    const slash = rel.indexOf('/');
    if (slash < 0) return rel;
    const bucket = rel.slice(0, slash);
    const object = rel.slice(slash + 1);
    const segs = object.split('/').filter(Boolean).map((seg) => {
      const ascii = seg.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return ascii.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^_+|_+$/g, '') || 'arquivo';
    });
    return segs.length ? `${bucket}/${segs.join('/')}` : bucket;
  },

  _fileServeUrl: function(relativePath) {
    const rel = this._normalizeStorageCaminho(relativePath);
    if (!rel) return '';
    const base = this._siteBaseUrl();
    return base ? `${base}/api/file.php?path=${encodeURIComponent(rel)}` : '';
  },

  _fileProxyFromSupabaseUrl: function(url) {
    const s = String(url || '').trim();
    if (!/supabase\.co\/storage\/v1\/object\//i.test(s)) return '';
    const base = this._siteBaseUrl();
    return base ? `${base}/api/file.php?fetch_url=${encodeURIComponent(s)}` : '';
  },

  _attachmentDisplayUrl: function(raw, caminho) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (/^(data:|blob:)/i.test(s)) {
      return this._safeUiAttachmentUrl(this._toDisplayUrl(s));
    }
    if (/file\.php/i.test(s)) return s;
    if (/supabase\.co\/storage/i.test(s)) return s.replace(/ /g, '%20');
    if (/^https?:\/\//i.test(s)) {
      if (this._isDirectUploadsUrl(s)) {
        const rel = this._extractStorageRelative(s);
        return rel ? this._fileServeUrl(rel) : '';
      }
      return s.replace(/ /g, '%20');
    }
    const path = String(caminho || '').replace(/^\/+/, '') || this._extractStorageRelative(s);
    return path ? this._fileServeUrl(path) : '';
  },

  _toViewerUrl: function(url, caminho) {
    return this._attachmentDisplayUrl(url, caminho) || '';
  },

  _verifyAttachmentServeUrl: async function(serveUrl) {
    const u = String(serveUrl || '').trim();
    if (!u || !/file\.php/i.test(u)) return null;
    try {
      const checkUrl = u + (u.includes('?') ? '&' : '?') + 'check=1';
      const res = await fetch(checkUrl, { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (j && j.ok && j.serve_url) return j.serve_url;
      const normPath = this._normalizeStorageCaminho(decodeURIComponent((u.match(/[?&]path=([^&]+)/i) || [])[1] || ''));
      if (normPath && normPath !== decodeURIComponent((u.match(/[?&]path=([^&]+)/i) || [])[1] || '')) {
        const retry = this._fileServeUrl(normPath);
        if (retry && retry !== u) {
          const r2 = await fetch(retry + (retry.includes('?') ? '&' : '?') + 'check=1', { cache: 'no-store' });
          const j2 = await r2.json().catch(() => ({}));
          if (j2 && j2.ok && j2.serve_url) return j2.serve_url;
        }
      }
    } catch (_) { /* noop */ }
    return null;
  },

  _attachmentPreviewUrl: function(raw, caminho, urls, nome) {
    const r = String(raw || '').trim();
    if (!r) return '';
    if (/^(data:|blob:)/i.test(r)) {
      return this._safeUiAttachmentUrl(this._toDisplayUrl(r));
    }
    const rel = String(caminho || '').replace(/^\/+/, '') || this._extractStorageRelative(r);
    if (rel) {
      const served = this._fileServeUrl(rel);
      if (served) return served;
    }
    if (this._isImageUrl(r, nome)) {
      if (/supabase\.co\/storage/i.test(r)) return r.replace(/ /g, '%20');
      if (rel) {
        const supa = this._allSupabasePublicUrls(rel);
        if (supa[0]) return supa[0];
      }
      if (this._isDirectUploadsUrl(r)) return r.replace(/ /g, '%20');
    }
    return this._safeUiAttachmentUrl(this._pickViewerUrl(urls || [], r, caminho));
  },

  _pickViewerUrl: function(urls, raw, caminho) {
    const list = urls || [];
    if (/^(data:|blob:)/i.test(String(raw || ''))) {
      return this._toDisplayUrl(raw);
    }
    const rel = String(caminho || '').replace(/^\/+/, '') || this._extractStorageRelative(raw);
    if (rel) {
      const served = this._fileServeUrl(rel);
      if (served) return served;
      const mirrors = this._allSupabasePublicUrls(rel);
      if (mirrors.length) return mirrors[0];
    }
    if (/supabase\.co\/storage/i.test(String(raw || ''))) {
      const proxied = this._fileProxyFromSupabaseUrl(raw);
      if (proxied) return proxied;
      return String(raw).replace(/ /g, '%20');
    }
    const proxy = list.find((u) => /file\.php/i.test(String(u)));
    if (proxy) return proxy;
    const supa = list.find((u) => /supabase\.co\/storage/i.test(String(u)) && !/file\.php/i.test(String(u)));
    if (supa) return String(supa).replace(/ /g, '%20');
    if (this._isDirectUploadsUrl(raw)) {
      return String(raw).replace(/ /g, '%20');
    }
    return list[0] || this._attachmentDisplayUrl(raw, caminho) || '';
  },

  _normalizeAttachmentUrl: function(val) {
    if (val == null || val === '') return '';
    if (typeof val === 'object') {
      const nested = val.url || val.path || val.src || val.href || val.publicUrl || val.public_url || val.signedUrl || val.signed_url;
      if (nested) return this._normalizeAttachmentUrl(nested);
      return '';
    }
    const s = String(val).trim();
    if (!s) return '';
    if (/^(data:|blob:)/i.test(s)) return s;
    if (/^https?:\/\//i.test(s)) {
      if (/supabase\.co\/storage/i.test(s)) return s.replace(/ /g, '%20');
      if (/\/uploads\//i.test(s)) {
        const rel = this._extractStorageRelative(s);
        return rel ? this._fileServeUrl(rel) : s.replace(/ /g, '%20');
      }
      return s.replace(/ /g, '%20');
    }
    if (s.startsWith('/uploads/') || /^uploads\//i.test(s)) {
      const rel = s.replace(/^\/?uploads\//i, '');
      return this._fileServeUrl(rel);
    }
    if (/^proposal-attachments\//i.test(s)) {
      return this._supabasePublicUrl(this._SUPABASE_LEGACY, s)
        || this._fileServeUrl(s);
    }
    const legacyBase = this._SUPABASE_LEGACY;
    if (s.startsWith('/storage/')) {
      return (legacyBase + s).replace(/ /g, '%20');
    }
    if (s.startsWith('storage/v1/')) {
      return (legacyBase + '/' + s).replace(/ /g, '%20');
    }
    if (/^[A-Za-z0-9+/=\s-]+$/.test(s.replace(/\s/g, '')) && s.length > 80) {
      /* Nunca materializar base64 gigante como data:URL na UI — congela o Chrome no celular. */
      return '';
    }
    return '';
  },

  /** data:URL grande não pode ir para <img>/DOM. */
  _isHeavyDataUrl: function(s) {
    const t = String(s || '');
    return /^data:/i.test(t) && t.length > 2048;
  },

  _safeUiAttachmentUrl: function(url) {
    const u = String(url || '').trim();
    if (!u) return '';
    if (this._isHeavyDataUrl(u)) return '';
    return u;
  },

  _isDirectUploadsUrl: function(url) {
    const s = String(url || '');
    return /^https?:\/\//i.test(s) && /\/uploads\//i.test(s) && !/file\.php/i.test(s);
  },

  _attachmentOpenUrls: function(url, caminho) {
    const raw = String(url || '').trim();
    const list = [];
    const add = (u) => {
      const v = String(u || '').trim();
      if (!v) return;
      if (!list.includes(v)) list.push(v);
    };

    if (/^(data:|blob:)/i.test(raw)) {
      const display = this._toDisplayUrl(raw);
      if (!this._isHeavyDataUrl(display) && String(display).length <= 2048) add(display);
      return list;
    }

    const rel = this._normalizeStorageCaminho(
      String(caminho || '').replace(/^\/+/, '') || this._extractStorageRelative(raw)
    );

    if (rel) {
      add(this._fileServeUrl(rel));
      this._allSupabasePublicUrls(rel).forEach(add);
      this._allSupabasePublicUrls(rel).forEach((u) => add(this._fileProxyFromSupabaseUrl(u)));
    }

    if (/supabase\.co\/storage/i.test(raw)) {
      add(raw.replace(/ /g, '%20'));
      add(this._fileProxyFromSupabaseUrl(raw));
    }

    if (/^https?:\/\//i.test(raw) && this._isDirectUploadsUrl(raw)) {
      add(raw.replace(/ /g, '%20'));
    }

    return list;
  },

  _attachmentFallbackChain: function(urls, primary) {
    const p = String(primary || '').trim();
    return (urls || []).filter((u) => String(u).trim() && String(u).trim() !== p).slice(0, 6);
  },

  _attachmentOnErrorHandler: function() {
    return "var el=this;for(var i=1;i<=6;i++){var k='fb'+i;if(el.dataset[k]&&!el.dataset['t'+i]){el.dataset['t'+i]=1;el.src=el.dataset[k];return;}}el.replaceWith(Object.assign(document.createElement('p'),{textContent:'Arquivo indisponível (não encontrado no Supabase nem no servidor). Peça ao vendedor para reenviar o anexo.',style:'padding:24px;text-align:center;color:var(--color-danger);font-size:13px;line-height:1.4;'}));";
  },

  _attachmentFallbackAttrs: function(chain) {
    const attrs = {};
    (chain || []).forEach((u, i) => {
      attrs[`data-fb${i + 1}`] = this._escUrlAttr(u);
    });
    return attrs;
  },

  _isValidAttachmentUrl: function(url) {
    if (!url || typeof url !== 'string') return false;
    const s = url.trim();
    return /^https?:\/\//i.test(s) || /^data:/i.test(s) || /^blob:/i.test(s)
      || /^\/?api\/file\.php/i.test(s) || /^\/uploads\//i.test(s)
      || /^proposal-attachments\//i.test(s);
  },

  _ensureAttachmentViewerModal: function() {
    if (document.getElementById('attachmentViewerModal')) return;
    const tpl = document.createElement('template');
    tpl.innerHTML = '<div class="modal-overlay" id="attachmentViewerModal"><div class="modal" style="max-width:900px;"><div class="modal-header"><h3 id="attachmentViewerTitle">Anexo</h3><button class="modal-close" onclick="Proposals.closeAttachmentViewer()"></button></div><div class="modal-body" style="max-height:80vh;overflow:auto;padding:16px;"><div id="attachmentViewerBody" style="min-height:200px;"></div></div><div class="modal-footer"><button type="button" class="btn btn-outline btn-sm" id="attachmentViewerOpenExternal">Abrir em nova aba</button><button class="btn btn-ghost" onclick="Proposals.closeAttachmentViewer()">Fechar</button></div></div></div>';
    const node = tpl.content.firstElementChild;
    if (node) document.body.appendChild(node);
  },

  _openAttachmentViewerModal: function(modal) {
    if (!modal) return;
    modal.classList.add('modal-stack-front');
    if (typeof openModal === 'function') openModal('attachmentViewerModal');
    else modal.classList.add('open');
  },

  _resolveWorkingViewerUrl: async function(displayUrl, urls, raw, caminho) {
    const candidates = [];
    const add = (u) => {
      const v = String(u || '').trim();
      if (v && !candidates.includes(v)) candidates.push(v);
    };
    add(displayUrl);
    (urls || []).forEach(add);
    const rel = String(caminho || '').replace(/^\/+/, '') || this._extractStorageRelative(raw);
    if (rel) {
      add(this._fileServeUrl(rel));
      this._allSupabasePublicUrls(rel).forEach(add);
    }
    if (/supabase\.co\/storage/i.test(String(raw || ''))) {
      add(String(raw).replace(/ /g, '%20'));
    }
    for (const u of candidates) {
      if (/file\.php/i.test(u)) {
        const verified = await this._verifyAttachmentServeUrl(u);
        if (verified) return verified;
        continue;
      }
      if (/^(data:|blob:)/i.test(u) || /^https?:\/\//i.test(u)) {
        return String(u).replace(/ /g, '%20');
      }
    }
    return candidates[0] || displayUrl || '';
  },

  _hasProposalAttachments: function(att) {
    const parsed = this._parseAttachments(att);
    return Object.keys(parsed || {}).some((k) => {
      if (this._isAttachmentMetaKey(k)) return false;
      const url = this._normalizeAttachmentUrl(parsed[k]);
      return this._isValidAttachmentUrl(url);
    });
  },

  _loadProposalAttachments: async function(id, proposal, attEl, cacheObj) {
    const render = (p) => {
      if (!attEl) return;
      if (!this._hasProposalAttachments(p?.attachments)) {
        attEl.innerHTML = '<p style="color:var(--color-text-muted);font-size:13px;">Nenhum anexo.</p>';
        return;
      }
      this._renderProposalAttachments(p, attEl);
    };

    const job = (async () => {
      const initial = this._parseAttachments(proposal?.attachments);
      if (this._hasProposalAttachments(initial)) {
        proposal.attachments = initial;
        render(proposal);
      } else if (attEl) {
        attEl.innerHTML = '<p style="color:var(--color-text-muted);font-size:13px;">Carregando anexos...</p>';
      }

      try {
        const attRow = await DB.getProposalAttachments(id);
        if (attRow?.attachments != null) {
          proposal.attachments = this._parseAttachments(attRow.attachments);
          if (cacheObj) cacheObj.attachments = proposal.attachments;
        }
        render(proposal);
        this._syncAnexoUploadFormFromAttachments(proposal.attachments);
      } catch (err) {
        console.warn('[Proposals] anexos:', err);
        if (!this._hasProposalAttachments(proposal?.attachments) && attEl) {
          attEl.innerHTML = '<p style="color:var(--color-danger);font-size:13px;">Erro ao carregar anexos.</p>';
        }
      }
    })();

    this._attachmentLoadPromises[id] = job;
    try {
      await job;
    } finally {
      delete this._attachmentLoadPromises[id];
    }
  },

  _findSavedAttachmentForGrupo: function(att, grupo) {
    const parsed = this._parseAttachments(att);
    const tryKey = (k) => {
      if (parsed[k] == null || parsed[k] === '') return null;
      const raw = parsed[k];
      const docNome = parsed[k + '_nome'] || k;
      const caminho = this._attachmentCaminho(raw, parsed, k);
      const urls = this._attachmentOpenUrls(raw, caminho);
      const display = this._attachmentPreviewUrl(raw, caminho, urls, docNome)
        || this._normalizeAttachmentUrl(raw);
      if (!display && !this._isValidAttachmentUrl(raw)) return null;
      return { url: display, rawUrl: raw, urls, nome: docNome, caminho };
    };
    let doc = tryKey(grupo);
    if (doc) return doc;
    for (const cat of (this._ANEXO_CATEGORIES || [])) {
      for (const seed of (cat.viewSeed || [])) {
        if (seed.key !== grupo && !(seed.legado || []).includes(grupo)) continue;
        doc = tryKey(seed.key);
        if (doc) return doc;
        for (const lk of (seed.legado || [])) {
          doc = tryKey(lk);
          if (doc) return doc;
        }
      }
    }
    return null;
  },

  _markSavedAttachmentsOnUploadForm: function(att) {
    const defs = this._getAllAnexoFieldDefs();
    defs.forEach(({ id, grupo }) => {
      const inp = document.getElementById(id);
      if (inp?.files?.[0]) return;
      const doc = this._findSavedAttachmentForGrupo(att, grupo);
      const lbl = document.getElementById(id + 'Label');
      if (!lbl) return;
      if (!doc?.url) {
        if (!lbl.textContent || lbl.textContent.trim() === '-' || lbl.textContent.trim() === '') {
          lbl.innerHTML = '<span style="color:#999;">-</span>';
        }
        return;
      }
      lbl.innerHTML = this._renderFormSlotPreview(doc);
    });
  },

  /** Miniatura no formulário de anexos (pastas da proposta — admin / vendedor / financeiro). */
  _renderFormSlotPreview: function(doc) {
    const rawSrc = doc.rawUrl || doc.url || '';
    const nome = doc.nome || 'Anexo';
    if (!this._isValidAttachmentUrl(rawSrc) && !this._isValidAttachmentUrl(doc.url)) {
      return '<span style="color:#999;">-</span>';
    }
    const previewPrimary = this._attachmentPreviewUrl(rawSrc, doc.caminho, doc.urls || [], nome)
      || doc.url;
    const previewList = [previewPrimary];
    (doc.urls || []).forEach((u) => {
      const v = String(u || '').trim();
      if (v && !previewList.includes(v)) previewList.push(v);
    });
    const previewChain = this._attachmentFallbackChain(previewList, previewPrimary);
    const previewFb = this._attachmentFallbackAttrs(previewChain);
    const previewFbStr = Object.keys(previewFb).map((k) => `${k}="${previewFb[k]}"`).join(' ');
    const safePreview = this._escUrlAttr(this._safeUiAttachmentUrl(previewPrimary) || '');
    const safeNome = this._escHtml(nome);
    const shortNome = safeNome.length > 28 ? (safeNome.slice(0, 25) + '…') : safeNome;
    const openRaw = (String(rawSrc).length > 512 || this._isHeavyDataUrl(rawSrc)) ? '' : String(rawSrc);
    const openJs = `Proposals.openAttachment('${this._escAttr(openRaw)}','${this._escAttr(nome)}','${this._escAttr(doc.caminho || '')}')`;
    const wrap = 'display:inline-flex;flex-direction:column;align-items:center;max-width:88px;margin-top:6px;vertical-align:top;';
    const card = 'width:80px;height:100px;border-radius:10px;border:2px solid var(--color-success);overflow:hidden;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.08);cursor:pointer;flex-shrink:0;';
    const previewOnErr = this._attachmentOnErrorHandler();

    if (this._isImageUrl(rawSrc, nome)) {
      if (!safePreview) {
        return `<div style="${wrap}" title="Anexo legado sem prévia">
          <div style="${card}display:flex;align-items:center;justify-content:center;font-size:22px;" role="button" tabindex="0" onclick="${openJs}">📎</div>
          <span style="font-size:9px;line-height:1.15;text-align:center;margin-top:4px;word-break:break-word;color:var(--color-text-muted);">${shortNome}</span>
        </div>`;
      }
      return `<div style="${wrap}" title="${safeNome} — clique para ampliar">
        <div style="${card}" role="button" tabindex="0" onclick="${openJs}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${openJs};}">
          <img src="${safePreview}" ${previewFbStr} alt="${safeNome}" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;" loading="lazy" onerror="${previewOnErr}"/>
        </div>
        <span style="font-size:9px;line-height:1.15;text-align:center;margin-top:4px;word-break:break-word;color:var(--color-text-muted);">${shortNome}</span>
      </div>`;
    }
    if (this._isPdfUrl(rawSrc, nome)) {
      return `<div style="${wrap}" title="${safeNome} — clique para abrir">
        <div style="${card}display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6px;color:var(--color-primary);" role="button" tabindex="0" onclick="${openJs}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${openJs};}">
          <span style="font-size:26px;line-height:1;">📄</span>
        </div>
        <span style="font-size:9px;line-height:1.15;text-align:center;margin-top:4px;word-break:break-word;color:var(--color-text-muted);">${shortNome}</span>
      </div>`;
    }
    return `<div style="${wrap}">
      <div style="${card}display:flex;align-items:center;justify-content:center;font-size:22px;" role="button" tabindex="0" onclick="${openJs}">📎</div>
      <span style="font-size:9px;text-align:center;margin-top:4px;">${shortNome}</span>
    </div>`;
  },

  _isLocawebProposalUploadUrl: function(val) {
    const s = String(val || '').trim();
    return /\/uploads\/proposal-attachments\//i.test(s)
      || (/soumaisblu\.com\.br\/uploads\//i.test(s) && !/file\.php/i.test(s));
  },

  /** Reenvia anexos que estavam no disco Locaweb para o Supabase ao salvar a proposta. */
  _migrateLocawebAttachmentsToSupabase: async function(proposalId, att) {
    const out = { ...att };
    const jobs = [];
    Object.keys(out).forEach((k) => {
      if (this._isAttachmentMetaKey(k)) return;
      const v = out[k];
      if (typeof v !== 'string' || !this._isLocawebProposalUploadUrl(v)) return;
      if (this._attachmentAlreadyOnStorage(out, k)) return;
      jobs.push((async () => {
        try {
          const res = await fetch(v.replace(/ /g, '%20'), { cache: 'no-store' });
          if (!res.ok) {
            console.warn('[Proposals] arquivo Locaweb ausente, reenvie manualmente:', k, v);
            return;
          }
          const blob = await res.blob();
          const nome = out[k + '_nome'] || `${k}`;
          const file = new File([blob], nome, { type: blob.type || 'application/octet-stream' });
          const uploaded = await (window.DB || DB).uploadProposalFile(file, proposalId, k);
          if (uploaded && (uploaded.caminho || uploaded.url)) {
            this._applyProposalUploadResult(out, k, uploaded, nome);
          }
        } catch (e) {
          console.warn('[Proposals] migrar anexo Locaweb→Supabase', k, e);
        }
      })());
    });
    await Promise.all(jobs);
    return out;
  },

  _uploadPendingDataAttachments: async function(proposalId, att) {
    const out = { ...att };
    const jobs = [];
    Object.keys(out).forEach((k) => {
      if (this._isAttachmentMetaKey(k)) return;
      const v = out[k];
      if (typeof v !== 'string' || !/^data:/i.test(v)) return;
      jobs.push((async () => {
        try {
          const res = await fetch(v);
          const blob = await res.blob();
          const nome = out[k + '_nome'] || `${k}`;
          const file = new File([blob], nome, { type: blob.type || 'application/octet-stream' });
          const uploaded = await (window.DB || DB).uploadProposalFile(file, proposalId, k);
          const url = uploaded && typeof uploaded === 'object' ? uploaded.url : uploaded;
          if (url && !String(url).startsWith('data:')) {
            this._applyProposalUploadResult(out, k, uploaded, nome);
          }
        } catch (e) {
          console.warn('[Proposals] upload pending attachment', k, e);
        }
      })());
    });
    await Promise.all(jobs);
    return out;
  },

  _prepareAttachmentsForSave: async function(proposalId, proposal, rootId) {
    const t0 = Date.now();
    let base = this._parseAttachments(proposal?.attachments);
    const hasBase = this._hasProposalAttachments(base);
    const hasNewFiles = this._hasPendingAnexoUploads(rootId);

    if (this._attachmentLoadPromises[proposalId] && (hasNewFiles || !hasBase)) {
      try { await this._attachmentLoadPromises[proposalId]; } catch { /* ignore */ }
      base = this._parseAttachments(proposal?.attachments);
    }

    if (!this._hasProposalAttachments(base)) {
      try {
        const attRow = typeof DB.getProposalAttachments === 'function'
          ? await DB.getProposalAttachments(proposalId)
          : await DB.getProposal(proposalId);
        if (attRow?.attachments) base = this._parseAttachments(attRow.attachments);
      } catch (e) {
        console.warn('[Proposals] anexos save:', e);
      }
    }
    const needsDataUpload = Object.keys(base).some((k) => {
      if (this._isAttachmentMetaKey(k)) return false;
      return typeof base[k] === 'string' && /^data:/i.test(base[k]);
    });
    const needsLocawebMigrate = Object.keys(base).some((k) => {
      if (this._isAttachmentMetaKey(k)) return false;
      if (this._attachmentAlreadyOnStorage(base, k)) return false;
      return typeof base[k] === 'string' && this._isLocawebProposalUploadUrl(base[k]);
    });
    let msData = 0;
    let msMigrate = 0;
    let msCollect = 0;
    if (needsDataUpload) {
      const t1 = Date.now();
      base = await this._uploadPendingDataAttachments(proposalId, base);
      msData = Date.now() - t1;
    }
    if (needsLocawebMigrate) {
      const t2 = Date.now();
      base = await this._migrateLocawebAttachmentsToSupabase(proposalId, base);
      msMigrate = Date.now() - t2;
    }
    const t3 = Date.now();
    const uploaded = await this._collectAttachments(proposalId, rootId);
    msCollect = Date.now() - t3;
    const merged = { ...base, ...uploaded };
    this._propPerfLog('proposals.js:_prepareAttachmentsForSave', 'attachments prepared', {
      msTotal: Date.now() - t0, msData, msMigrate, msCollect, needsDataUpload, needsLocawebMigrate, hasNewFiles, hasBase,
    }, 'A');
    return this._validateAttachmentsBeforeSave(merged);
  },

  _dataUrlToBlobUrl: function(dataUrl) {
    const parts = String(dataUrl).split(',');
    if (parts.length < 2) throw new Error('Invalid data URL');
    const header = parts[0];
    const mimeMatch = header.match(/data:([^;]+)/i);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const binary = atob(parts.slice(1).join(','));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  },

  _toDisplayUrl: function(url) {
    if (!url || !String(url).startsWith('data:')) {
      return typeof url === 'string' ? url.replace(/ /g, '%20') : url;
    }
    if (String(url).length < 500000) return url;
    try {
      return this._dataUrlToBlobUrl(url);
    } catch {
      return url;
    }
  },

  _revokeAttachmentBlobUrl: function() {
    if (this._lastAttachmentBlobUrl) {
      try { URL.revokeObjectURL(this._lastAttachmentBlobUrl); } catch { /* ignore */ }
      this._lastAttachmentBlobUrl = null;
    }
  },

  openAttachment: async function(cacheIdxOrUrl, nome, caminhoOpt) {
    let raw = '';
    let urls = [];
    let name = nome || 'Anexo';
    let caminho = caminhoOpt || '';

    if (typeof cacheIdxOrUrl === 'number') {
      const item = this._attachmentViewerCache?.[cacheIdxOrUrl];
      if (!item) {
        alert('Anexo indisponível.');
        return;
      }
      raw = String(item.rawUrl || item.url || '').trim();
      caminho = item.caminho || '';
      urls = item.urls || this._attachmentOpenUrls(raw, caminho);
      name = item.nome || name;
    } else {
      raw = String(cacheIdxOrUrl || '').trim();
      /* Evita colar base64 gigante no onclick do HTML (trava o celular). */
      if (raw.length > 4096 || this._isHeavyDataUrl(raw)) {
        alert('Anexo legado (base64) não pode ser aberto neste aparelho. Peça reenvio do arquivo.');
        return;
      }
      caminho = String(caminhoOpt || '').replace(/^\/+/, '');
      urls = this._attachmentOpenUrls(raw, caminho);
      name = nome || name;
    }

    const initialUrl = this._isImageUrl(raw, name)
      ? (this._attachmentPreviewUrl(raw, caminho, urls, name) || this._pickViewerUrl(urls, raw, caminho))
      : this._pickViewerUrl(urls, raw, caminho);
    if (!initialUrl || this._isHeavyDataUrl(initialUrl) || String(initialUrl).length > 8192 && /^data:/i.test(initialUrl)) {
      alert('Anexo indisponível, inválido ou grande demais para visualizar aqui.');
      return;
    }

    this._ensureAttachmentViewerModal();
    const modal = document.getElementById('attachmentViewerModal');
    const titleEl = document.getElementById('attachmentViewerTitle');
    const bodyEl = document.getElementById('attachmentViewerBody');
    const openExtEl = document.getElementById('attachmentViewerOpenExternal');
    const parentModalOpen = !!document.querySelector('.modal-overlay.open:not(#attachmentViewerModal)');

    let finalUrl = initialUrl;
    try {
      finalUrl = await this._resolveWorkingViewerUrl(initialUrl, urls, raw, caminho) || initialUrl;
    } catch (_) { /* keep initial */ }


    const fallbackChain = this._attachmentFallbackChain(urls, finalUrl);
    const fbAttrs = this._attachmentFallbackAttrs(fallbackChain);
    const fbAttrStr = Object.keys(fbAttrs).map((k) => `${k}="${fbAttrs[k]}"`).join(' ');
    const onErr = this._attachmentOnErrorHandler();

    if (titleEl) titleEl.textContent = name;

    this._revokeAttachmentBlobUrl();
    if (String(finalUrl).startsWith('blob:')) {
      this._lastAttachmentBlobUrl = finalUrl;
    }

    const _openExternal = () => {
      const a = document.createElement('a');
      a.href = finalUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    };

    if (!modal) {
      _openExternal();
      return;
    }

    this._openAttachmentViewerModal(modal);

    if (openExtEl) {
      openExtEl.onclick = () => {
        _openExternal();
      };
    }

    if (bodyEl) {
      const kind = this._guessAttachmentKind(raw || finalUrl, name);
      bodyEl.innerHTML = this._renderAttachmentViewerBody(kind, finalUrl, name, fbAttrStr, onErr);
    }
  },

  closeAttachmentViewer: function() {
    this._revokeAttachmentBlobUrl();
    const modal = document.getElementById('attachmentViewerModal');
    const bodyEl = document.getElementById('attachmentViewerBody');
    if (bodyEl) bodyEl.innerHTML = '';
    if (modal) modal.classList.remove('modal-stack-front');
    if (typeof closeModal === 'function') closeModal('attachmentViewerModal');
    else modal?.classList.remove('open');
  },

  _isImageUrl: function(url, nome) {
    if (!url) return false;
    const s = String(url);
    if (s.startsWith('data:image/')) return true;
    const ref = ((nome || '') + ' ' + s.split('?')[0]).toLowerCase();
    if (/\.(jpe?g|png|gif|webp|jfif|bmp|heic|heif)(\?|$)/i.test(ref)) return true;
    if (/(?:^|[/_.-])(jpe?g|png|gif|webp|jfif|bmp|heic)(?:[/_.-]|$)/i.test(ref)) return true;
    return false;
  },

  _isPdfUrl: function(url, nome) {
    if (!url) return false;
    if (String(url).startsWith('data:application/pdf')) return true;
    const ref = ((nome || '') + ' ' + String(url).split('?')[0]).toLowerCase();
    return /\.pdf(\?|$)/i.test(ref);
  },

  _guessAttachmentKind: function(url, nome) {
    if (this._isImageUrl(url, nome)) return 'image';
    if (this._isPdfUrl(url, nome)) return 'pdf';
    const ref = ((nome || '') + ' ' + String(url || '').split('?')[0]).toLowerCase();
    if (/\.(mp4|webm|ogv|mov|m4v|avi|mkv)(\?|$)/i.test(ref)) return 'video';
    if (/\.(mp3|wav|m4a|aac|ogg|flac|opus)(\?|$)/i.test(ref)) return 'audio';
    if (/\.(txt|csv|json|xml|html?|md|log|yml|yaml)(\?|$)/i.test(ref)) return 'text';
    return 'other';
  },

  _renderAttachmentViewerBody: function(kind, displayUrl, name, fbAttrStr, onErr) {
    const safeDisplay = this._escUrlAttr(displayUrl);
    const safeName = this._escHtml(name);
    const safeNameAttr = this._escAttr(name);
    if (kind === 'image') {
      return `<img src="${safeDisplay}" ${fbAttrStr} alt="${safeName}" style="max-width:100%;max-height:70vh;display:block;margin:0 auto;border-radius:8px;object-fit:contain;" onerror="${onErr}"/>`;
    }
    if (kind === 'pdf' || kind === 'text') {
      return `<iframe src="${safeDisplay}" ${fbAttrStr} title="${safeName}" style="width:100%;height:70vh;border:0;border-radius:8px;background:#fff;"></iframe>`;
    }
    if (kind === 'video') {
      return `<video src="${safeDisplay}" ${fbAttrStr} controls playsinline style="max-width:100%;max-height:70vh;display:block;margin:0 auto;border-radius:8px;background:#000;" onerror="${onErr}">${safeName}</video>`;
    }
    if (kind === 'audio') {
      return `<div style="padding:24px;text-align:center;"><p style="margin-bottom:16px;font-weight:600;">${safeName}</p><audio src="${safeDisplay}" ${fbAttrStr} controls style="width:min(100%,480px);" onerror="${onErr}"></audio></div>`;
    }
    return `<div style="padding:32px 24px;text-align:center;">
      <div style="font-size:52px;line-height:1;margin-bottom:16px;">📎</div>
      <p style="font-weight:600;margin-bottom:8px;word-break:break-word;">${safeName}</p>
      <p style="font-size:13px;color:var(--color-text-muted);margin-bottom:20px;">Este tipo de arquivo não pode ser exibido aqui. Baixe ou abra em nova aba.</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        <a href="${safeDisplay}" download="${safeNameAttr}" class="btn btn-primary" style="text-decoration:none;">Baixar</a>
        <button type="button" class="btn btn-outline" onclick="window.open('${safeDisplay}','_blank','noopener,noreferrer')">Abrir em nova aba</button>
      </div>
    </div>`;
  },

  _renderAttachmentPreview: function(doc, cacheIdx) {
    const rawSrc = doc.rawUrl || doc.url || '';
    const nome = doc.nome || ('Anexo ' + (cacheIdx + 1));
    if (!this._isValidAttachmentUrl(rawSrc) && !this._isValidAttachmentUrl(doc.url)) {
      return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:120px;height:150px;border-radius:10px;border:2px dashed var(--color-border);background:var(--color-surface-2);color:var(--color-text-muted);font-size:11px;padding:8px;text-align:center;flex-shrink:0;" title="Anexo indisponível">
        <span style="font-size:24px;margin-bottom:4px;">⚠️</span>
        <span style="word-break:break-word;line-height:1.2;">${this._escHtml(nome)}</span>
      </div>`;
    }
    let previewPrimary = this._attachmentPreviewUrl(rawSrc, doc.caminho, doc.urls || [], nome)
      || this._attachmentDisplayUrl(rawSrc, doc.caminho)
      || doc.url;
    previewPrimary = this._safeUiAttachmentUrl(previewPrimary);
    const box = 'display:block;width:120px;height:150px;border-radius:10px;border:2px solid var(--color-success);overflow:hidden;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.08);flex-shrink:0;cursor:pointer;';
    const click = `role="button" tabindex="0" onclick="Proposals.openAttachment(${cacheIdx})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();Proposals.openAttachment(${cacheIdx});}"`;
    const safeNome = this._escHtml(nome);
    const shortNome = safeNome.length > 42 ? (safeNome.slice(0, 39) + '…') : safeNome;

    /* Sem URL leve: ícone clicável (não injeta data:URL no DOM). */
    if (!previewPrimary || this._isHeavyDataUrl(previewPrimary)) {
      return `<div ${click} style="${box}display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--color-primary);padding:8px;text-align:center;" title="${safeNome}">
        <span style="font-size:28px;margin-bottom:6px;">📎</span>
        <span style="font-size:10px;line-height:1.25;word-break:break-word;">${shortNome}</span>
      </div>`;
    }
    const previewList = [previewPrimary];
    (doc.urls || []).forEach((u) => {
      const v = this._safeUiAttachmentUrl(u);
      if (v && !previewList.includes(v)) previewList.push(v);
    });
    const previewChain = this._attachmentFallbackChain(previewList, previewPrimary);
    const previewFb = this._attachmentFallbackAttrs(previewChain);
    const previewFbStr = Object.keys(previewFb).map((k) => `${k}="${previewFb[k]}"`).join(' ');
    const safePreview = this._escUrlAttr(previewPrimary);
    const previewOnErr = this._attachmentOnErrorHandler();

    if (this._isImageUrl(rawSrc, nome) && !this._isHeavyDataUrl(previewPrimary)) {
      return `<div ${click} style="${box}" title="${safeNome} — clique para ampliar">
        <img src="${safePreview}" ${previewFbStr} alt="${safeNome}" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;background:#f4f4f4;" loading="lazy" onerror="${previewOnErr}"/>
      </div>`;
    }
    if (this._isPdfUrl(rawSrc, nome)) {
      return `<div ${click} style="${box}display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--color-primary);padding:8px;text-align:center;" title="${safeNome} — clique para abrir">
        <span style="font-size:32px;margin-bottom:6px;line-height:1;">📄</span>
        <span style="font-size:10px;line-height:1.25;word-break:break-word;max-height:52px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;">${shortNome}</span>
      </div>`;
    }
    return `<div ${click} style="${box}display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--color-primary);padding:8px;text-align:center;" title="${safeNome}">
      <span style="font-size:28px;margin-bottom:6px;">📎</span>
      <span style="font-size:10px;line-height:1.25;word-break:break-word;">${shortNome}</span>
    </div>`;
  },

  _proposalCreatedAt: function(p) {
    return p.createdAt || p.created_at || '';
  },

  _parseProposalMeta: function(raw) {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
    if (typeof raw === 'string') {
      try {
        const j = JSON.parse(raw);
        return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
      } catch (_) { return {}; }
    }
    return {};
  },

  _parseProposalHistory: function(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const j = JSON.parse(raw);
        return Array.isArray(j) ? j : [];
      } catch (_) { return []; }
    }
    return [];
  },

  _isDigitacaoStatus: function(val) {
    const s = String(val || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().trim();
    return s === 'DIGITACAO' || s.includes('DIGITACAO');
  },

  /** Primeiro horário em que a proposta entrou em Digitação (fila FIFO / esteira). */
  _digitacaoAt: function(p) {
    if (!p) return '';
    if (typeof DB !== 'undefined' && typeof DB.proposalDigitacaoAt === 'function') {
      const d = DB.proposalDigitacaoAt(p);
      return d ? nowBrazilSql(d) : '';
    }
    if (p.digitacaoAt || p.digitacao_at) return p.digitacaoAt || p.digitacao_at;
    const meta = this._parseProposalMeta(p.meta);
    if (meta.digitacaoAt) return meta.digitacaoAt;
    const hist = this._parseProposalHistory(p.history);
    for (const h of hist) {
      const kind = String(h?.kind || '').toLowerCase();
      const action = String(h?.action || '');
      if (kind === 'digitacao' || kind === 'digitacao_at'
        || /(→|->|⇒)\s*\[?\s*Digita/i.test(action) || /Status:.*Digita/i.test(action)) {
        if (h.date) return h.date;
      }
    }
    // Sem updatedAt — movimentação comum não pode “repinar” na esteira.
    return '';
  },

  _ensureDigitacaoTimestamp: function(proposal, prevStatus, prevStatusOp) {
    if (!proposal) return proposal;
    const nowOp = proposal.statusOp || proposal.status_op || proposal.status || '';
    const entered = this._isDigitacaoStatus(nowOp)
      && !this._isDigitacaoStatus(prevStatusOp)
      && !this._isDigitacaoStatus(prevStatus);
    if (entered) {
      const at = nowBrazilSql();
      proposal._digitacaoAtMark = at;
      // Persiste se a API aceitar o campo; histórico com kind é o fallback.
      if (!proposal.digitacaoAt && !proposal.digitacao_at) {
        proposal.digitacaoAt = at;
        proposal.digitacao_at = at;
      }
    }
    return proposal;
  },

  _fmtDateTime: function(raw) {
    if (!raw) return '—';
    if (typeof formatDateTime === 'function') return formatDateTime(raw);
    const d = typeof _parseSouBluDate === 'function' ? _parseSouBluDate(raw) : new Date(raw);
    if (!d || Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: this._PROP_TZ,
    });
  },

  _proposalSortAt: function(p) {
    if (typeof DB !== 'undefined' && typeof DB.proposalSortTime === 'function') {
      return DB.proposalSortTime(p);
    }
    const raw = p?.updatedAt || p?.updated_at || p?.createdAt || p?.created_at || '';
    const t = new Date(raw).getTime();
    return Number.isNaN(t) ? 0 : t;
  },

  _sortProposalsNewestFirst: function(list) {
    return (list || []).slice().sort((a, b) => this._proposalSortAt(b) - this._proposalSortAt(a));
  },

  /** Fila de digitação: quem entrou primeiro aparece primeiro. */
  _sortProposalsDigitacaoFifo: function(list) {
    return (list || []).slice().sort((a, b) => {
      const ta = new Date(this._digitacaoAt(a) || 0).getTime() || 0;
      const tb = new Date(this._digitacaoAt(b) || 0).getTime() || 0;
      if (ta !== tb) return ta - tb;
      return this._proposalSortAt(a) - this._proposalSortAt(b);
    });
  },

  _cleanProposalDate: function(val) {
    const s = String(val || '').trim();
    if (!s || /^0000-00-00/.test(s)) return '';
    return s.length >= 10 ? s.slice(0, 10) : s;
  },

  _obsLineValue: function(obs, label) {
    const lines = String(obs || '').split(/\r?\n/);
    const prefix = String(label || '').trim() + ':';
    for (const line of lines) {
      const t = line.trim();
      if (t.toLowerCase().startsWith(prefix.toLowerCase())) {
        return t.slice(prefix.length).trim();
      }
    }
    return '';
  },

  _normProposal: function(p) {
    if (!p) return p;
    return {
      ...p,
      vendorName: this._fixMojibake(p.vendorName || p.vendor_name || ''),
      clientName: this._fixMojibake(p.clientName || p.client_name || ''),
      clientCpf: p.clientCpf || p.client_cpf || '',
      product: this._normalizeProductValue(p.product || ''),
      convenio: this._fixMojibake(p.convenio || ''),
      entidade: this._fixMojibake(p.entidade || ''),
      valor: p.valor != null ? p.valor : null,
      valorFinal: p.valorFinal ?? p.valor_final ?? p.valor ?? null,
      createdAt: p.createdAt || p.created_at || null,
      updatedAt: p.updatedAt || p.updated_at || null,
      vendorId: p.vendorId || p.vendor_id || p.employee_id || '',
      employee_id: p.employee_id || p.vendorId || p.vendor_id || '',
      statusOp: p.statusOp || p.status_op || p.status || '',
      protocolo: p.protocolo || p.numero_protocolo || '',
      senhaContracheque: p.senhaContracheque || p.senha_contracheque || '',
      senhaConsignacao: p.senhaConsignacao || p.senha_consignacao || '',
      compraDivida: p.compraDivida || p.compra_divida || '',
      bancoComprado: p.bancoComprado || p.banco_comprado || '',
      bancoDigitado: p.bancoDigitado || p.banco_digitado
        || this._obsLineValue(p.obs, 'Banco para digitação')
        || this._obsLineValue(p.obs, 'Banco digitado') || '',
      tipoOperacao: (() => {
        const meta = p.meta && typeof p.meta === 'object' ? p.meta : {};
        return String(
          p.tipoOperacao || p.tipo_operacao || meta.tipo_operacao || meta.tipoOperacao
          || this._obsLineValue(p.obs, 'Tipo de operação')
          || this._obsLineValue(p.obs, 'Tipo de operacao')
          || ''
        ).trim();
      })(),
      solicitouBoleto: p.solicitouBoleto || p.solicitou_boleto || '',
      dataSolicitacao: p.dataSolicitacao || p.data_solicitacao || '',
      protocoloBacen: p.protocoloBacen || p.protocolo_bacen || '',
      dataSolicitacaoBacen: p.dataSolicitacaoBacen || p.data_solicitacao_bacen || '',
      posVenda: p.posVenda || p.pos_venda || '',
      attachments: this._parseAttachments(p.attachments),
    };
  },

  _proposalVendorId: function(p) {
    if (typeof DB !== 'undefined' && typeof DB.proposalVendorId === 'function') {
      return DB.proposalVendorId(p);
    }
    return p?.vendorId || p?.vendor_id || p?.employee_id || '';
  },

  _ownsProposal: function(proposal, user) {
    if (!proposal || !user?.id) return false;
    if (typeof DB._matchProposalToVendor === 'function' && DB._matchProposalToVendor(proposal, user)) return true;
    return String(this._proposalVendorId(proposal)) === String(user.id);
  },

  _propDateStr: function(p) {
    const created = this._fmtDateTime(p?.createdAt || p?.created_at);
    const dig = this._digitacaoAt(p);
    if (!dig) return created;
    const digStr = this._fmtDateTime(dig);
    if (digStr === '—' || digStr === created) return created;
    return `${created}<div style="font-size:11px;color:var(--color-text-muted);margin-top:2px;">Digitação: <strong>${digStr}</strong></div>`;
  },

  _clientsByCpfMap: function(clients) {
    const map = {};
    for (const c of clients || []) {
      const cpf = String(c.cpf || c.id || '').replace(/\D/g, '');
      if (cpf) map[cpf] = c;
    }
    return map;
  },

  _proposalClientPhone: function(p, clientsByCpf) {
    const cpf = String(p?.clientCpf || p?.client_cpf || '').replace(/\D/g, '');
    const client = cpf && clientsByCpf ? clientsByCpf[cpf] : null;
    const meta = p?.meta && typeof p.meta === 'object' ? p.meta : {};
    const phone = client?.phone1 || client?.phone2 || meta.phone1 || meta.client_phone
      || p.client_phone || p.clientPhone || p.phone1 || '';
    return String(phone || '').trim();
  },

  _proposalClientEmail: function(p, clientsByCpf) {
    const cpf = String(p?.clientCpf || p?.client_cpf || '').replace(/\D/g, '');
    const client = cpf && clientsByCpf ? clientsByCpf[cpf] : null;
    const meta = p?.meta && typeof p.meta === 'object' ? p.meta : {};
    return String(
      client?.email || meta.email || meta.client_email || p.client_email || p.clientEmail || ''
    ).trim();
  },

  _formatPhoneDisplay: function(phone) {
    const d = String(phone || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return String(phone || '').trim();
  },

  _isBoletoValidadoStatus: function(status, statusOp) {
    const n = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const a = n(status);
    const b = n(statusOp);
    return a.includes('boleto validado') || b.includes('boleto validado');
  },

  /**
   * Dispara webhook Hyper/n8n quando o status vira BOLETO VALIDADO (1ª vez).
   * Fire-and-forget — não bloqueia o save.
   */
  _notifyBoletoValidadoWebhook: async function(proposal, oldStatus, oldStatusOp) {
    try {
      if (!proposal?.id) return;
      const nowOk = this._isBoletoValidadoStatus(proposal.status, proposal.statusOp || proposal.status_op);
      if (!nowOk) return;
      if (this._isBoletoValidadoStatus(oldStatus, oldStatusOp)) return;

      /* Seed lembrete a cada 2 dias até PAGO (esteira de pendências). */
      try {
        const vid = proposal.employee_id || proposal.employeeId || proposal.user_id || proposal.vendor_id;
        if (vid && typeof DB?.upsertBoletoReminder === 'function') {
          DB.upsertBoletoReminder({
            proposalId: proposal.id,
            vendorId: vid,
            clientName: proposal.clientName || proposal.client_name || null,
          }).catch(() => {});
        }
      } catch (_) { /* noop */ }

      const cfg = (typeof window !== 'undefined' && window.SOUBLU_CONFIG) ? window.SOUBLU_CONFIG : {};
      const apiBase = String(cfg.API_BASE_URL || cfg.SITE_URL || '').replace(/\/+$/, '')
        || (typeof location !== 'undefined' ? location.origin : '');
      const apiKey = String(cfg.API_KEY || '').trim();
      if (!apiBase || !apiKey) return;

      let client = null;
      const cpf = String(proposal.clientCpf || proposal.client_cpf || '').replace(/\D/g, '');
      if (cpf && typeof DB?.getClientByCpf === 'function') {
        try { client = await DB.getClientByCpf(cpf); } catch (_) { /* noop */ }
      } else if (cpf && typeof DB?.getClient === 'function') {
        try { client = await DB.getClient(cpf); } catch (_) { /* noop */ }
      }

      const url = `${apiBase}/api/boleto-webhook.php?action=notify`;
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          proposal,
          client: client || undefined,
          old_status: oldStatus || '',
          old_status_op: oldStatusOp || '',
        }),
        keepalive: true,
      }).catch((e) => console.warn('[boleto-webhook]', e?.message || e));
    } catch (e) {
      console.warn('[boleto-webhook]', e?.message || e);
    }
  },

  _matchProposalSearch: function(p, q) {
    const raw = String(q || '').trim();
    if (!raw) return true;
    const etapaLabel = this._vendorStage(p) ? this._labelEtapaVendedor(this._vendorStage(p)) : '';
    const haystack = [
      p.id, p.numero, p.clientName, p.clientCpf, p.vendorName,
      p.product, p.convenio, p.entidade, p.status, p.statusOp,
      etapaLabel, p.matricula, p.protocolo
    ].filter(Boolean).join(' ');
    if (typeof textMatchesSearch === 'function') {
      if (textMatchesSearch(haystack, raw)) return true;
    } else if (haystack.toLowerCase().includes(raw.toLowerCase())) {
      return true;
    }
    const qDigits = raw.replace(/\D/g, '');
    if (qDigits) {
      const cpfDigits = String(p.clientCpf || '').replace(/\D/g, '');
      const matriculaDigits = String(p.matricula || '').replace(/\D/g, '');
      if (cpfDigits.includes(qDigits) || matriculaDigits.includes(qDigits)) return true;
    }
    return false;
  },

  _isSupervisorOrAbove: function(role) {
    const r = this._normProposalManageRole(role);
    return ['supervisor', 'sup_backoffice', 'parceiro', 'backoffice', 'operacional', 'master', 'gerente', 'financeiro', 'financial', 'rh', 'admin', 'fundador', 'desenvolvedor', 'diretoria', 'gerencia'].includes(r);
  },

  /**
   * _normProposalManageRole — normaliza papel do usuário para checagem de permissão no modal.
   * Aceita variações com espaço, hífen ou acento (ex.: "Back Office", "sup-backoffice").
   */
  _normProposalManageRole: function(role) {
    return String(role || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s-]+/g, '_');
  },

  _canPickVendor: function(role) {
    const r = this._normProposalManageRole(role);
    // Gerente/gerência sempre pode trocar o vendedor da proposta (pedido explícito).
    if (r === 'gerente' || r === 'gerencia') return true;
    return this._isSupervisorOrAbove(role);
  },

  /** Backoffice/supervisor+ podem ajustar nº e valor (inclusive em proposta já paga). */
  _canEditNumeroValor: function(role) {
    return this._isSupervisorOrAbove(role);
  },

  /**
   * _canEditTabelaComissao — define/altera tabela de comissão (bloco Financeiro).
   * Super Backoffice / backoffice operacional também editam (antes só financeiro/gerente).
   * Supervisor de vendedor: pode mexer na tabela só se a proposta NÃO estiver paga.
   * Sem isso o select fica travado e o valor final “paga” 100% do bruto.
   */
  _canEditTabelaComissao: function(role, opts) {
    const r = this._normProposalManageRole(role);
    const paid = !!(opts && opts.paid);
    // Supervisor de vendedor: libera tabela em abertas; em pagas continua bloqueado.
    if (r === 'supervisor') return !paid;
    if ([
      'master', 'fundador', 'desenvolvedor', 'financeiro', 'financial',
      'gerente', 'gerencia', 'diretoria',
      'sup_backoffice', 'backoffice', 'operacional',
    ].includes(r)) return true;
    const s = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    if (s && typeof Auth.hasFinanceiroInternoAccess === 'function' && Auth.hasFinanceiroInternoAccess(s)) {
      return true;
    }
    return false;
  },

  /**
   * _canChangeProposalStatus — quem pode alterar a situação (status/statusOp).
   * Supervisor de vendedor NÃO altera status; backoffice, gerente, master, etc. podem.
   * Vendedor continua alterando a situação nas próprias fichas (modal employee).
   */
  _canChangeProposalStatus: function(role) {
    const r = this._normProposalManageRole(role);
    if (r === 'supervisor') return false;
    if (typeof this._isVendedorRole === 'function' && this._isVendedorRole(role)) return true;
    return this._isSupervisorOrAbove(role);
  },

  /**
   * _applyTabelaToProposal — aplica tabela e recalcula valorFinal/desconto.
   * Evita proposta “PAGO” com comissão no valor bruto quando a tabela está vazia/errada.
   */
  _applyTabelaToProposal: function(proposal, tabelaCode) {
    if (!proposal) return;
    const code = String(tabelaCode || '').trim();
    if (!code) {
      proposal.tabela = '';
      proposal.valorFinal = Number(proposal.valor) || 0;
      proposal.desconto = 0;
      return;
    }
    const pct = this._tabelaPct[code];
    const factor = (pct != null && !isNaN(pct)) ? Number(pct) : 1;
    const bruto = Number(proposal.valor) || 0;
    proposal.tabela = code;
    proposal.valorFinal = parseFloat((bruto * factor).toFixed(2));
    proposal.desconto = parseFloat((bruto - proposal.valorFinal).toFixed(2));
  },

  /**
   * _readManageValorInput — lê o valor digitado no modal.
   * Prioriza o campo em foco; se vazio de propósito, NÃO puxa o outro (senão não dá para apagar).
   */
  _readManageValorInput: function() {
    const editEl = document.getElementById('managePropValorEdit');
    const brutoEl = document.getElementById('managePropValorBruto');
    const activeId = document.activeElement?.id || '';
    const rawOf = (el) => String(el?.value || '').replace(/^R\$\s*/i, '').trim();

    if (activeId === 'managePropValorEdit') {
      const raw = rawOf(editEl);
      if (!raw) return NaN;
      return this._parseBrMoneyInput(raw);
    }
    if (activeId === 'managePropValorBruto') {
      const raw = rawOf(brutoEl);
      if (!raw) return NaN;
      return this._parseBrMoneyInput(raw);
    }

    const editRaw = rawOf(editEl);
    if (editRaw) {
      const p = this._parseBrMoneyInput(editRaw);
      if (!isNaN(p)) return p;
    }
    const brutoRaw = rawOf(brutoEl);
    if (brutoRaw) {
      const p = this._parseBrMoneyInput(brutoRaw);
      if (!isNaN(p)) return p;
    }
    return NaN;
  },

  /**
   * _syncManageValorFields — alinha verde/azul ao abrir ou ao sair do campo (blur).
   * valor null/NaN limpa os dois (permite apagar).
   */
  _syncManageValorFields: function(valor) {
    const v = valor != null && valor !== '' && !isNaN(parseFloat(valor)) ? parseFloat(valor) : null;
    const empty = v == null || isNaN(v);
    const txt = empty
      ? ''
      : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtBruto = empty ? '' : ('R$ ' + txt);
    const editEl = document.getElementById('managePropValorEdit');
    const brutoEl = document.getElementById('managePropValorBruto');
    if (editEl) editEl.value = txt;
    if (brutoEl) brutoEl.value = fmtBruto;
  },

  /**
   * _bindManageValorInputs — digitação livre no valor.
   * Não mexe no texto enquanto digita/apaga; formata só no blur.
   */
  _bindManageValorInputs: function() {
    const BIND_VER = 'v4';
    const rawOf = (el) => String(el?.value || '').replace(/^R\$\s*/i, '').trim();

    const onBlurFormat = (sourceId) => {
      const el = document.getElementById(sourceId);
      const raw = rawOf(el);
      // Campo apagado → limpa os dois (não restaura o valor antigo).
      if (!raw) {
        this._syncManageValorFields(null);
        this.calcAdminValorFinal();
        return;
      }
      const parsed = this._parseBrMoneyInput(raw);
      if (!isNaN(parsed) && parsed >= 0) this._syncManageValorFields(parsed);
      this.calcAdminValorFinal();
    };

    ['managePropValorEdit', 'managePropValorBruto'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.dataset.valorBound === BIND_VER) return;
      el.dataset.valorBound = BIND_VER;
      // Só recalcula preview — não reescreve o que o usuário está digitando/apagando.
      el.addEventListener('input', () => this.calcAdminValorFinal());
      el.addEventListener('blur', () => onBlurFormat(id));
    });

    const tabEl = document.getElementById('managePropTabela');
    if (tabEl && tabEl.dataset.valorSyncBound !== BIND_VER) {
      tabEl.dataset.valorSyncBound = BIND_VER;
      tabEl.addEventListener('change', () => this.calcAdminValorFinal());
    }
  },

  _isMaster: function() {
    return typeof Auth !== 'undefined' && Auth.isMaster();
  },

  /**
   * _canDeleteProposal — quem pode arquivar/excluir proposta (lixeira Localweb).
   * Usa _normProposalManageRole p/ aceitar "Gerência"/"Super Backoffice" com acento.
   * Parceiros NÃO excluem (só veem/editam a própria rede).
   */
  _canDeleteProposal: function() {
    if (typeof window !== 'undefined' && window.PARTNER_ROOT_ID) return false;
    if (this._isMaster()) return true;
    const role = this._normProposalManageRole(
      typeof Auth !== 'undefined' && Auth.getSession()?.role
    );
    if (!role || role === 'parceiro') return false;
    return [
      'master', 'fundador', 'desenvolvedor', 'gerente', 'gerencia',
      'sup_backoffice', 'financeiro', 'financial', 'diretoria',
    ].includes(role);
  },

  _isProposalPaid: function(p) {
    if (!p) return false;
    if (typeof DB !== 'undefined' && typeof DB.isPaidProposal === 'function') {
      return DB.isPaidProposal(p);
    }
    const st = String(p.status || '').toUpperCase();
    const fase = String(p.statusOp || p.status_op || '').toUpperCase();
    return st.includes('PAGO') || fase.includes('PAGO');
  },

  /** Proposta paga = somente leitura (salvar altera updatedAt e distorce o dashboard). */
  _assertProposalNotPaidForSave: function(proposal) {
    if (!this._isProposalPaid(proposal)) return true;
    const msg = 'Proposta paga é somente leitura. Não é permitido salvar alterações de status. Use a correção de nº/valor se precisar.';
    this._notifyOverModal(msg, 'warning');
    return false;
  },

  /**
   * _ensureCleanupDuplicatesBtn — clones ficam no modal Configuração (não na barra).
   */
  _ensureCleanupDuplicatesBtn: function() {
    this._ensureProposalManageToolbar();
  },

  /**
   * cleanupDuplicateProposals — limpeza manual de CLONES (ficha repetida).
   * Clone = mesmo CPF + mesmo produto + mesmo banco. Cartão+BTW / dívida+Neo NÃO entram.
   * Paga nunca vai para a lista de exclusão. DELETE é definitivo (sem log de quem foi).
   * Confirma no alert antes de apagar. Não rode isso achando que “1 CPF = 1 proposta”.
   */
  cleanupDuplicateProposals: async function() {
    if (!this._canDeleteProposal()) {
      alert('Sem permissão para excluir propostas.');
      return;
    }
    if (typeof showLoading === 'function') showLoading('Analisando clones (mesmo produto e banco)…');
    try {
      const all = await (typeof DB.listProposals === 'function' ? DB.listProposals() : []);
      const groups = typeof DB.findDuplicateProposalGroups === 'function'
        ? DB.findDuplicateProposalGroups(all)
        : [];
      if (!groups.length) {
        const msg = 'Nenhum clone encontrado. Cliente com dois produtos diferentes (ex.: Cartão + BTW) é permitido e não é apagado.';
        if (typeof showToast === 'function') showToast(msg, 'success');
        else alert(msg);
        return;
      }
      const toDelete = [];
      const keepPreview = [];
      groups.forEach((g) => {
        const keep = DB.pickProposalToKeep(g.proposals);
        if (!keep) return;
        const name = keep.clientName || keep.client_name || 'Cliente';
        const cpf = String(keep.clientCpf || keep.client_cpf || '').replace(/\D/g, '');
        const prod = keep.product || 'produto';
        const bank = keep.bancoDigitado || keep.banco_digitado || '';
        keepPreview.push(`${name} (${cpf || 'sem CPF'}) ${prod}${bank ? ' / ' + bank : ''} — mantém ${keep.numero || keep.id}`);
        g.proposals.forEach((p) => {
          if (String(p.id) === String(keep.id)) return;
          // Segunda operação paga no mesmo clone-key não se apaga (recuperar DELETE é manual).
          if (typeof DB.isPaidProposal === 'function' && DB.isPaidProposal(p)) return;
          toDelete.push(p);
        });
      });
      if (!toDelete.length) {
        alert('Nada para apagar (clones pagos são preservados; dois produtos no mesmo CPF não entram).');
        return;
      }
      const sample = keepPreview.slice(0, 8).join('\n');
      const more = keepPreview.length > 8 ? `\n… e mais ${keepPreview.length - 8} grupo(s)` : '';
      if (!confirm(
        `Encontrados ${groups.length} clone(s) do MESMO produto e banco.\n` +
        `Serão apagadas ${toDelete.length} ficha(s) repetida(s).\n` +
        `Cliente com dois produtos diferentes NÃO entra nesta lista.\n\n` +
        `${sample}${more}\n\nConfirmar exclusão só dos clones?`
      )) return;

      if (typeof showLoading === 'function') showLoading(`Arquivando ${toDelete.length} clone(s) na Localweb…`);
      const session = (typeof Auth !== 'undefined' && Auth.getSession) ? Auth.getSession() : null;
      let ok = 0;
      let fail = 0;
      for (const p of toDelete) {
        try {
          await DB.deleteProposal(p.id, { by: session?.name || session?.email || 'dedupe' });
          ok += 1;
        } catch (e) {
          console.warn('[cleanupDuplicateProposals]', p.id, e);
          fail += 1;
        }
      }
      this._adminListCache = null;
      if (typeof SalesRanking !== 'undefined' && SalesRanking.invalidateCache) {
        SalesRanking.invalidateCache();
      }
      if (typeof DB._invalidateProposalsCache === 'function') DB._invalidateProposalsCache();
      await this.renderAdminList();
      const msg = fail
        ? `Duplicadas: ${ok} apagada(s), ${fail} falha(s).`
        : `${ok} clone(s) arquivado(s) na Localweb (Cancelado). Dois produtos no mesmo cliente não foram mexidos.`;
      if (typeof showToast === 'function') showToast(msg, fail ? 'warning' : 'success');
      else alert(msg);
    } catch (e) {
      console.error('[cleanupDuplicateProposals]', e);
      alert('Erro ao limpar duplicadas: ' + (e.message || 'tente novamente'));
    } finally {
      if (typeof hideLoading === 'function') hideLoading();
    }
  },

  _BR_UFS: ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'],

  _parseAddress: function(raw) {
    const text = String(raw || '').replace(/\s+/g, ' ').trim();
    const out = { estado: '', municipio: '', rua: '', bairro: '', cep: '' };
    if (!text) return out;

    const defs = [
      { key: 'estado', re: /(?:Estado|UF)\s*:/gi },
      { key: 'municipio', re: /(?:Município|Municipio|Cidade)\s*:/gi },
      { key: 'rua', re: /(?:Rua|Logradouro|Endereço|Endereco)\s*:/gi },
      { key: 'bairro', re: /Bairro\s*:/gi },
      { key: 'cep', re: /(?:Cep|CEP)\s*:/gi },
    ];
    const markers = [];
    defs.forEach((d) => {
      const re = new RegExp(d.re.source, d.re.flags);
      let m;
      while ((m = re.exec(text)) !== null) {
        markers.push({ key: d.key, start: m.index, valStart: m.index + m[0].length });
      }
    });
    if (!markers.length) {
      out.rua = text;
      return out;
    }
    markers.sort((a, b) => a.start - b.start);
    markers.forEach((mk, i) => {
      const end = i + 1 < markers.length ? markers[i + 1].start : text.length;
      out[mk.key] = text.slice(mk.valStart, end).trim();
    });
    return out;
  },

  _formatAddress: function(parts) {
    const p = parts || {};
    const bits = [];
    if (p.estado) bits.push(`Estado: ${p.estado}`);
    if (p.municipio) bits.push(`Município: ${p.municipio}`);
    if (p.rua) bits.push(`Rua : ${p.rua}`);
    if (p.bairro) bits.push(`Bairro: ${p.bairro}`);
    if (p.cep) bits.push(`Cep: ${p.cep}`);
    return bits.join(' ');
  },

  _estadoUfFromParsed: function(estado, municipio) {
    const e = String(estado || '').trim().toUpperCase();
    if (this._BR_UFS.includes(e)) return e;
    const byCity = {
      'SÃO PAULO': 'SP', 'SAO PAULO': 'SP', 'RIO DE JANEIRO': 'RJ', 'BELO HORIZONTE': 'MG',
      'CURITIBA': 'PR', 'PORTO ALEGRE': 'RS', 'BRASÍLIA': 'DF', 'BRASILIA': 'DF',
    };
    const m = String(municipio || '').trim().toUpperCase();
    if (byCity[m]) return byCity[m];
    return '';
  },

  _proposalClientFallback: function(client, proposal) {
    if (client) return client;
    const cpf = String(proposal?.clientCpf || proposal?.client_cpf || '').replace(/\D/g, '');
    const name = String(proposal?.clientName || proposal?.client_name || '').trim();
    if (!cpf && !name) return null;
    return { id: cpf || name, cpf: cpf || '', name, _fromProposalOnly: true };
  },

  _lookupClientByCpf: async function(cpf) {
    const digits = String(cpf || '').replace(/\D/g, '');
    if (!digits) return null;
    if (typeof DB.getClientByCpf === 'function') {
      const hit = await DB.getClientByCpf(digits).catch(() => null);
      if (hit) return hit;
    }
    if (typeof DB.findClientByCpf === 'function') {
      const hit = await DB.findClientByCpf(digits).catch(() => null);
      if (hit) return hit;
    }
    if (typeof DB.get === 'function') {
      return await DB.get('clients', digits).catch(() => null);
    }
    return null;
  },

  _fmtClientBlock: function(client, proposal) {
    client = this._proposalClientFallback(client, proposal);
    if (!client) {
      return `<p style="color:var(--color-text-muted);margin:0;">Cadastro completo do cliente não encontrado no sistema (CPF ${proposal?.clientCpf || '—'}).</p>`;
    }
    const row = (label, val) => val ? `<div><strong>${label}:</strong> ${this._escHtml(val)}</div>` : '';
    if (client._fromProposalOnly) {
      return [
        `<p style="color:var(--color-warning);margin:0 0 8px;font-size:13px;font-weight:600;">Cliente não está no cadastro — preencha telefone, e-mail e endereço abaixo e salve a proposta.</p>`,
        row('Nome completo', client.name),
        row('CPF', client.cpf),
      ].filter(Boolean).join('');
    }
    const addr = this._parseAddress(client.address);
    const hasAddrParts = !!(addr.estado || addr.municipio || addr.rua || addr.bairro || addr.cep);
    const addrHtml = hasAddrParts
      ? [
        row('Estado (UF)', addr.estado),
        row('Município', addr.municipio),
        row('Rua', addr.rua),
        row('Bairro', addr.bairro),
        row('CEP', addr.cep),
      ].filter(Boolean).join('')
      : row('Endereço', client.address);
    const bankHtml = [
      row('Banco (conta)', client.banco || client.bank),
      row('Agência', client.agencia),
      row('Conta', client.conta || client.conta_corrente),
    ].filter(Boolean).join('');
    return [
      row('Nome completo', client.name),
      row('CPF', client.cpf || client.id),
      row('RG', client.rg),
      row('Celular', client.phone1),
      row('Celular 2', client.phone2),
      row('E-mail', client.email),
      row('Estado civil', client.civilState),
      addrHtml,
      bankHtml,
      row('Nome da mãe', client.motherName),
      row('Nome do pai', client.fatherName),
    ].filter(Boolean).join('');
  },

  _renderEditableClientDetail: function(client, proposal, opts) {
    opts = opts || {};
    const prefix = opts.prefix || 'manage';
    const editable = opts.editable !== false;
    client = this._proposalClientFallback(client, proposal);
    if (!client) {
      return `<p style="color:var(--color-text-muted);margin:0;">Cadastro do cliente não encontrado (CPF ${this._escHtml(proposal?.clientCpf || '—')}).</p>`;
    }

    const dis = editable ? '' : ' readonly';
    const disSel = editable ? '' : ' disabled';
    const cpf = String(client.cpf || client.id || proposal?.clientCpf || '').replace(/\D/g, '');
    const addr = this._parseAddress(client.address);
    const ufSel = this._estadoUfFromParsed(addr.estado, addr.municipio);
    const ufOpts = ['<option value="">—</option>'].concat(
      this._BR_UFS.map((uf) => `<option value="${uf}"${ufSel === uf ? ' selected' : ''}>${uf}</option>`)
    ).join('');
    const p = prefix;

    const fromProposalOnly = !!client._fromProposalOnly;
    const proposalHint = fromProposalOnly
      ? '<p style="color:var(--color-warning);margin:0 0 8px;font-size:13px;font-weight:600;">Cliente não está no cadastro — use <strong>Editar</strong> (ícone lápis), complete telefone, e-mail e endereço e clique em <strong>Salvar alterações</strong>.</p>'
      : '';

    return `
      <input type="hidden" id="${p}ClientOrigCpf" value="${this._escAttr(cpf)}"/>
      <div class="prop-client-edit" style="display:grid;gap:10px;">
        ${proposalHint}
        <p style="color:var(--color-text-muted);margin:0 0 4px;font-size:13px;">${editable ? 'Altere os dados do cliente abaixo. As mudanças serão salvas na proposta e no cadastro do cliente (quando existir).' : 'Dados cadastrais do cliente.'}</p>
        <div class="form-group" style="margin:0;">
          <label style="font-size:11px;">Nome completo</label>
          <input type="text" id="${p}ClientName" class="form-control prop-client-field" value="${this._escAttr(client.name || proposal?.clientName || '')}"${dis}/>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group" style="margin:0;">
            <label style="font-size:11px;">CPF</label>
            <input type="text" id="${p}ClientCpf" class="form-control prop-client-field" placeholder="000.000.000-00" value="${this._escAttr(cpf)}"${dis}/>
          </div>
          <div class="form-group" style="margin:0;">
            <label style="font-size:11px;">RG</label>
            <input type="text" id="${p}ClientRg" class="form-control prop-client-field" value="${this._escAttr(client.rg || '')}"${dis}/>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group" style="margin:0;">
            <label style="font-size:11px;">Celular</label>
            <input type="text" id="${p}ClientPhone1" class="form-control prop-client-field" value="${this._escAttr(client.phone1 || '')}"${dis}/>
          </div>
          <div class="form-group" style="margin:0;">
            <label style="font-size:11px;">Celular 2</label>
            <input type="text" id="${p}ClientPhone2" class="form-control prop-client-field" value="${this._escAttr(client.phone2 || '')}"${dis}/>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group" style="margin:0;">
            <label style="font-size:11px;">E-mail</label>
            <input type="email" id="${p}ClientEmail" class="form-control prop-client-field" value="${this._escAttr(client.email || '')}"${dis}/>
          </div>
          <div class="form-group" style="margin:0;">
            <label style="font-size:11px;">Estado civil</label>
            <input type="text" id="${p}ClientCivilState" class="form-control prop-client-field" value="${this._escAttr(client.civilState || '')}"${dis}/>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group" style="margin:0;">
            <label style="font-size:11px;">Nome da mãe</label>
            <input type="text" id="${p}ClientMotherName" class="form-control prop-client-field" value="${this._escAttr(client.motherName || '')}"${dis}/>
          </div>
          <div class="form-group" style="margin:0;">
            <label style="font-size:11px;">Nome do pai</label>
            <input type="text" id="${p}ClientFatherName" class="form-control prop-client-field" value="${this._escAttr(client.fatherName || '')}"${dis}/>
          </div>
        </div>
        <div style="margin-top:6px;padding-top:12px;border-top:1px dashed var(--color-border);">
          <p style="font-weight:700;margin:0 0 10px;font-size:13px;color:var(--color-primary);">Endereço <span style="color:var(--color-danger);">*</span> <span style="font-weight:500;color:var(--color-text-muted);font-size:11px;">(obrigatório para vendedores)</span></p>
          <div style="display:grid;grid-template-columns:72px 1fr 1fr;gap:10px;">
            <div class="form-group" style="margin:0;">
              <label style="font-size:11px;">UF <span style="color:var(--color-danger);">*</span></label>
              <select id="${p}ClientEstado" class="form-control prop-client-field"${disSel}>${ufOpts}</select>
            </div>
            <div class="form-group" style="margin:0;">
              <label style="font-size:11px;">Município <span style="color:var(--color-danger);">*</span></label>
              <input type="text" id="${p}ClientMunicipio" class="form-control prop-client-field" value="${this._escAttr(addr.municipio)}"${dis}/>
            </div>
            <div class="form-group" style="margin:0;">
              <label style="font-size:11px;">CEP <span style="color:var(--color-danger);">*</span></label>
              <input type="text" id="${p}ClientCep" class="form-control prop-client-field" placeholder="00000-000" value="${this._escAttr(addr.cep)}"${dis}/>
            </div>
          </div>
          <div class="form-group" style="margin:10px 0 0;">
            <label style="font-size:11px;">Rua / nº / complemento <span style="color:var(--color-danger);">*</span></label>
            <input type="text" id="${p}ClientRua" class="form-control prop-client-field" value="${this._escAttr(addr.rua)}"${dis}/>
          </div>
          <div class="form-group" style="margin:10px 0 0;">
            <label style="font-size:11px;">Bairro <span style="color:var(--color-danger);">*</span></label>
            <input type="text" id="${p}ClientBairro" class="form-control prop-client-field" value="${this._escAttr(addr.bairro)}"${dis}/>
          </div>
        </div>
        <div style="margin-top:6px;padding-top:12px;border-top:1px dashed var(--color-border);">
          <p style="font-weight:700;margin:0 0 10px;font-size:13px;color:var(--color-primary);">Conta do cliente <span style="color:var(--color-danger);">*</span> <span style="font-weight:500;color:var(--color-text-muted);font-size:11px;">(obrigatório para vendedores)</span></p>
          <p style="color:var(--color-text-muted);margin:0 0 8px;font-size:12px;">Vendedor precisa informar banco, agência e conta. Backoffice pode salvar sem isso.</p>
          <div class="form-group" style="margin:0;">
            <label style="font-size:11px;">Banco <span style="color:var(--color-danger);">*</span></label>
            <input type="text" id="${p}ClientBanco" class="form-control prop-client-field" placeholder="Ex.: Banco do Brasil" value="${this._escAttr(client.banco || client.bank || '')}"${dis}/>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
            <div class="form-group" style="margin:0;">
              <label style="font-size:11px;">Agência <span style="color:var(--color-danger);">*</span></label>
              <input type="text" id="${p}ClientAgencia" class="form-control prop-client-field" placeholder="0000" value="${this._escAttr(client.agencia || '')}"${dis}/>
            </div>
            <div class="form-group" style="margin:0;">
              <label style="font-size:11px;">Conta <span style="color:var(--color-danger);">*</span></label>
              <input type="text" id="${p}ClientConta" class="form-control prop-client-field" placeholder="00000-0" value="${this._escAttr(client.conta || client.conta_corrente || '')}"${dis}/>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  _renderManageClientDetail: function(client, proposal, editable) {
    return this._renderEditableClientDetail(client, proposal, { prefix: 'manage', editable: editable !== false });
  },

  _readProposalClientForm: function(prefix) {
    const p = prefix || 'manage';
    const gv = (suffix) => document.getElementById(`${p}Client${suffix}`)?.value?.trim() || '';
    return {
      origCpf: gv('OrigCpf').replace(/\D/g, ''),
      name: gv('Name'),
      cpf: gv('Cpf').replace(/\D/g, ''),
      rg: gv('Rg'),
      phone1: gv('Phone1'),
      phone2: gv('Phone2'),
      email: gv('Email'),
      civilState: gv('CivilState'),
      motherName: gv('MotherName'),
      fatherName: gv('FatherName'),
      banco: gv('Banco'),
      agencia: gv('Agencia'),
      conta: gv('Conta'),
      address: this._formatAddress({
        estado: gv('Estado'),
        municipio: gv('Municipio'),
        rua: gv('Rua'),
        bairro: gv('Bairro'),
        cep: gv('Cep'),
      }),
      _addrParts: {
        estado: gv('Estado'),
        municipio: gv('Municipio'),
        rua: gv('Rua'),
        bairro: gv('Bairro'),
        cep: gv('Cep'),
      },
    };
  },

  /**
   * _clientHasRequiredAddressAndBank — checa endereço + conta num registro de cliente.
   * Usado no envio de proposta nova pelo vendedor (sem form emp/manage).
   */
  _clientHasRequiredAddressAndBank: function(client) {
    if (!client) return false;
    const parts = this._parseAddress(client.address || '');
    if (!String(parts.estado || '').trim()) return false;
    if (!String(parts.municipio || '').trim()) return false;
    if (!String(parts.rua || '').trim()) return false;
    if (!String(parts.bairro || '').trim()) return false;
    if (!String(parts.cep || '').replace(/\D/g, '')) return false;
    if (!String(client.banco || client.bank || '').trim()) return false;
    if (!String(client.agencia || '').trim()) return false;
    if (!String(client.conta || client.conta_corrente || '').trim()) return false;
    return true;
  },

  /**
   * _shouldRequireClientAddressAndBank — obrigatoriedade SÓ para vendedor.
   * Backoffice/supervisor/gerente/financeiro salvam sem endereço/conta (correção de ficha).
   */
  _shouldRequireClientAddressAndBank: function(/* proposal */) {
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    return this._isVendedorRole(session?.role);
  },

  /**
   * _assertClientAddressAndBank — bloqueia save do vendedor sem endereço + conta.
   * Backoffice não passa por esta trava (pode corrigir nº/valor sem completar cadastro).
   * Se faltar dado, destaca o bloco do cliente no modal para o vendedor ver os campos.
   */
  _assertClientAddressAndBank: function(prefix, proposal) {
    void proposal;
    if (!this._shouldRequireClientAddressAndBank()) return true;
    const pfx = prefix || 'manage';
    // Modal sem bloco de cliente (campo não renderizado): não bloqueia.
    if (!document.getElementById(`${pfx}ClientName`)) return true;
    const form = this._readProposalClientForm(pfx);
    const parts = form._addrParts || this._parseAddress(form.address);
    const missing = [];
    if (!String(parts.estado || '').trim()) missing.push('UF');
    if (!String(parts.municipio || '').trim()) missing.push('Município');
    if (!String(parts.rua || '').trim()) missing.push('Rua');
    if (!String(parts.bairro || '').trim()) missing.push('Bairro');
    if (!String(parts.cep || '').replace(/\D/g, '')) missing.push('CEP');
    if (!String(form.banco || '').trim()) missing.push('Banco (conta do cliente)');
    if (!String(form.agencia || '').trim()) missing.push('Agência');
    if (!String(form.conta || '').trim()) missing.push('Conta');
    if (!missing.length) return true;

    // Destaca e rola até o bloco (antes ficava escondido por CSS display:none).
    const detailId = pfx === 'emp' ? 'empPropClientDetail' : 'managePropClientDetail';
    const detailEl = document.getElementById(detailId);
    if (detailEl) {
      detailEl.classList.add('is-open', 'is-required');
      detailEl.style.display = 'block';
      try { detailEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) { /* noop */ }
    }
    const firstMissing =
      document.getElementById(`${pfx}ClientEstado`)
      || document.getElementById(`${pfx}ClientBanco`)
      || detailEl;
    try { firstMissing?.focus?.(); } catch (_) { /* noop */ }

    const msg = 'Preencha os dados obrigatórios do cliente antes de salvar: ' + missing.join(', ') + '.';
    if (typeof this._notifyOverModal === 'function') this._notifyOverModal(msg, 'error');
    else if (typeof showToast === 'function') showToast(msg, 'error');
    else alert(msg);
    return false;
  },

  _proposalVendorSupervisorId: function(proposal) {
    return String(proposal?.vendorId || proposal?.vendor_id || proposal?.employee_id || '').trim();
  },

  _ensureClientRecordForProposal: async function(proposal, prefix) {
    const form = prefix ? this._readProposalClientForm(prefix) : {};
    const cpf = String(form.cpf || form.origCpf || proposal?.clientCpf || proposal?.client_cpf || '').replace(/\D/g, '');
    const name = String(form.name || proposal?.clientName || proposal?.client_name || '').trim();
    if (!cpf && !name) return null;

    let client = cpf ? await this._lookupClientByCpf(cpf) : null;
    const supervisorId = this._proposalVendorSupervisorId(proposal)
      || String(client?.supervisorId || client?.supervisor_id || '').trim();

    const updated = {
      ...(client || {}),
      id: client?.id || cpf,
      cpf: cpf || client?.cpf || '',
      name: name || client?.name || '',
      rg: form.rg || client?.rg || '',
      phone1: form.phone1 || client?.phone1 || '',
      phone2: form.phone2 || client?.phone2 || '',
      email: form.email || client?.email || '',
      civilState: form.civilState || client?.civilState || client?.civil_state || '',
      motherName: form.motherName || client?.motherName || client?.mother_name || '',
      fatherName: form.fatherName || client?.fatherName || client?.father_name || '',
      address: form.address || client?.address || '',
      banco: form.banco || client?.banco || client?.bank || '',
      agencia: form.agencia || client?.agencia || '',
      conta: form.conta || client?.conta || client?.conta_corrente || '',
      updatedAt: nowBrazilSql(),
    };
    if (supervisorId) {
      updated.supervisorId = supervisorId;
      updated.supervisor_id = supervisorId;
    }
    if (!updated.name && !updated.cpf) return null;

    const saved = await DB.save('clients', updated);
    if (typeof invalidateClientsListCache === 'function') invalidateClientsListCache();
    return saved;
  },

  _saveProposalClientData: async function(proposal, prefix) {
    const form = this._readProposalClientForm(prefix);
    if (!form.name && !form.cpf) {
      await this._ensureClientRecordForProposal(proposal, prefix);
      return;
    }

    proposal.clientName = form.name || proposal.clientName;
    proposal.client_name = form.name || proposal.client_name;
    if (form.cpf) {
      proposal.clientCpf = form.cpf;
      proposal.client_cpf = form.cpf;
    }
    // Espelha conta do cliente na meta da proposta (auditoria / esteira).
    const meta = (proposal.meta && typeof proposal.meta === 'object') ? { ...proposal.meta } : {};
    if (form.banco || form.agencia || form.conta) {
      meta.client_bank = {
        banco: form.banco || '',
        agencia: form.agencia || '',
        conta: form.conta || '',
      };
      proposal.meta = meta;
    }

    await this._ensureClientRecordForProposal(proposal, prefix);
  },

  _saveManageClientAddress: async function(proposal) {
    const p = proposal || { id: document.getElementById('managePropId')?.value };
    if (!p?.id) return;
    await this._saveProposalClientData(p, 'manage');
  },

  _applyVendedorFormRules: function() {
    const anexosSec = document.getElementById('propAnexosSection');
    if (anexosSec) anexosSec.style.display = '';
    const anexosTitle = document.getElementById('propAnexosTitle');
    if (anexosTitle) anexosTitle.textContent = '📎 Documentos (opcional)';
    const numeroRow = document.getElementById('propNumeroValorRow');
    if (numeroRow) numeroRow.style.display = '';
    const etapaRow = document.getElementById('propEtapaVendedorRow');
    if (etapaRow) etapaRow.style.display = '';
  },

  calcValorFinal: function() {
    // usado apenas quando o formulário mostra o campo tabela visivelmente
    const valor  = parseFloat(document.getElementById('propValor')?.value) || 0;
    const tabela = document.getElementById('propTabela')?.value || 'NORMAL';
    const pct    = this._tabelaPct[tabela] ?? 1;
    const final  = valor * pct;
    const desconto = valor - final;
    const dispEl = document.getElementById('propValorFinalDisplay');
    if (dispEl) dispEl.value = final > 0 ? 'R$ ' + final.toLocaleString('pt-BR',{minimumFractionDigits:2}) : '';
    const descEl = document.getElementById('propDesconto');
    if (descEl) descEl.value = desconto.toFixed(2);
  },

  _labelFile: function(inputId, labelId) {
    const inp = document.getElementById(inputId);
    const lbl = document.getElementById(labelId);
    if (!inp || !lbl) return;
    const f = inp.files[0];
    if (!f) {
      lbl.innerHTML = '<span style="color:#999;">-</span>';
      return;
    }
    const url = URL.createObjectURL(f);
    const safeName = this._escHtml(f.name);
    const wrap = 'display:inline-flex;flex-direction:column;align-items:center;max-width:88px;margin-top:6px;';
    const card = 'width:80px;height:100px;border-radius:10px;border:2px solid var(--color-primary);overflow:hidden;background:#fff;cursor:pointer;';
    if (f.type && f.type.startsWith('image/')) {
      lbl.innerHTML = `<div style="${wrap}" title="${this._escAttr(f.name)} — novo arquivo">
        <a href="${url}" target="_blank" rel="noopener" style="${card}display:block;">
          <img src="${url}" alt="${safeName}" style="width:100%;height:100%;object-fit:cover;display:block;"/>
        </a>
        <span style="font-size:9px;margin-top:4px;text-align:center;color:var(--color-success);font-weight:600;">Novo</span>
      </div>`;
      return;
    }
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
      lbl.innerHTML = `<div style="${wrap}">
        <a href="${url}" target="_blank" rel="noopener" style="${card}display:flex;align-items:center;justify-content:center;font-size:26px;text-decoration:none;">📄</a>
        <span style="font-size:9px;margin-top:4px;text-align:center;color:var(--color-success);font-weight:600;">Novo PDF</span>
      </div>`;
      return;
    }
    lbl.innerHTML =
      `<span style="color:var(--color-success);font-weight:600;">${safeName}</span>` +
      `<a href="${url}" target="_blank" title="Visualizar" style="margin-left:6px;font-size:18px;text-decoration:none;">👁</a>`;
  },

  updateAnexosLabel: function() {},  // compatibilidade

  /**
   * _parseBrMoneyInput — interpreta valor em formato BR ou simples.
   * "2.040,50" → 2040.5 | "2040,5" → 2040.5 | "2040" → 2040
   * Evita o bug do parseFloat("2.040") = 2.04 (ponto como milhar).
   */
  _parseBrMoneyInput: function(raw) {
    let s = String(raw ?? '').trim();
    if (!s) return NaN;
    s = s.replace(/[^\d,.-]/g, '');
    if (!s || s === '-' || s === '.' || s === ',') return NaN;

    const hasComma = s.includes(',');
    const hasDot = s.includes('.');

    if (hasComma) {
      // Formato BR: pontos = milhar, vírgula = decimal
      return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    }

    if (hasDot) {
      const parts = s.split('.');
      // Vários pontos OU um ponto com exatamente 3 dígitos → milhar BR sem centavos
      // Ex.: "2.040" / "40.454.358"
      if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length >= 1)) {
        return parseFloat(parts.join(''));
      }
      // Um ponto com 1–2 casas → decimal (ex.: "2.5")
      return parseFloat(s);
    }

    return parseFloat(s);
  },

  /**
   * calcAdminValorFinal — atualiza só o display do valor final / info da tabela.
   * Não reescreve os inputs de valor (senão a digitação vira "2,04" no meio do tipo).
   */
  calcAdminValorFinal: function() {
    const fmtR = v => 'R$ ' + parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const parsed = this._readManageValorInput();
    const bruto = (!isNaN(parsed) && parsed >= 0) ? parsed : 0;
    const tabela = document.getElementById('managePropTabela')?.value || '';
    const pct    = tabela ? (this._tabelaPct[tabela] ?? 1) : null;
    const finalV = pct !== null ? parseFloat((bruto * pct).toFixed(2)) : null;
    const desconto = finalV !== null ? parseFloat((bruto - finalV).toFixed(2)) : null;

    const calcEl = document.getElementById('managePropValorFinalCalc');
    const infoEl = document.getElementById('managePropTabelaInfo');

    if (calcEl) calcEl.value = finalV !== null ? fmtR(finalV) : '';
    if (infoEl && tabela && pct !== null) {
      const pctLabel = Math.round(pct * 100);
      const tabNome = this._tabelaLabel(tabela) || tabela;
      infoEl.innerHTML = `<span style="color:#3b82f6;font-weight:600;">${tabNome} (${pctLabel}% do valor bruto)</span>
        &nbsp;·&nbsp; Desconto: <strong>${fmtR(desconto)}</strong>
        &nbsp;·&nbsp; Valor Final: <strong style="color:var(--color-success);">${fmtR(finalV)}</strong>`;
    } else if (infoEl) {
      infoEl.innerHTML = '<span style="color:var(--color-text-muted);">Selecione uma tabela para calcular o valor final.</span>';
    }
  },

  updateEntidades: function() {
    const conv = document.getElementById('propConvenio')?.value;
    this._fillEntidadeSelect('propEntidade', conv, '');
  },

  updateEmployeeEntidades: function() {
    const conv = document.getElementById('empPropConvenio')?.value;
    this._fillEntidadeSelect('empPropEntidade', conv, '');
  },

  /**
   * _assertCanCreateProposal — bloqueia se pendência vencida (esteira).
   * Independente do bloqueio de saque.
   */
  _assertCanCreateProposal: async function() {
    if (typeof window.EsteiraPendencias?.assertCanEditProposals === 'function') {
      return window.EsteiraPendencias.assertCanEditProposals();
    }
    if (typeof DB !== 'undefined' && typeof DB.isProposalCreateBlocked === 'function') {
      const u = (typeof Auth !== 'undefined' && Auth.getSession) ? Auth.getSession() : null;
      if (u?.id) {
        try {
          const fresh = await DB.getUser(u.id, true).catch(() => u);
          if (DB.isProposalCreateBlocked(fresh)) {
            alert('Bloqueado por pendência em atraso. Resolva com o backoffice/supervisor.');
            return false;
          }
        } catch (_) { /* segue */ }
      }
    }
    return true;
  },

  /**
   * closeModal — fecha pop-up Nova Proposta (admin) ou card inline (vendedor).
   * closeCreatePanel é alias para compatibilidade com HTML antigo.
   */
  closeModal: function() {
    const overlay = document.getElementById('propFormModal');
    if (overlay) {
      if (typeof window.closeModal === 'function') window.closeModal('propFormModal');
      else overlay.classList.remove('open');
      return;
    }
    const container = document.getElementById('propFormContainer');
    if (container) {
      container.style.display = 'none';
      container.classList.remove('prop-form-panel-open');
    }
    document.body.classList.remove('prop-form-panel-open');
    const backdrop = document.getElementById('propFormBackdrop');
    if (backdrop) backdrop.classList.remove('is-visible');
  },

  closeCreatePanel: function() {
    this.closeModal();
  },

  openModal: async function() {
    try {
      if (!(await this._assertCanCreateProposal())) return;
      const container = document.getElementById('propFormContainer');
      if (!container) {
        alert('Erro: O formulário de proposta não foi encontrado.');
        return;
      }
      if (typeof window.closeMobileNav === 'function') window.closeMobileNav();
      // Lista da busca anterior; sem isso o submit podia achar clone do cliente de antes.
      this._cpfExistingProposals = [];
      this._initProposalCatalogSelects();
      const ids = ['propCpf','propNumero','propValor','propDesconto','propValorFinalDisplay','propObs',
                   'propMatricula','propSenhaContracheque','propSenhaConsignacao',
                   'propBancoComprado','propProtocolo','propProtocoloBacen','propFases','propHistoryNote'];
      ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      const tabEl = document.getElementById('propTabela'); if (tabEl) tabEl.value = '';
      this._setFolderContext('propAnexosFolders', 'prop');
      this.resetAnexoFolders();
      ['propProduct','propConvenio','propEntidade','propCompraDivida','propBancoComprado','propBancoDigitado',
       'propTipoOperacao','propSolicitouBoleto','propBacen','propAssinouTermo','propStatusOp','propPosVenda','propNuvidio','propEtapaVendedor'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      this._initBankSelects();
      const area = document.getElementById('propFormArea');
      if (area) area.style.display = 'none';
      const popupEl = document.getElementById('propCpfPopup');
      if (popupEl) popupEl.style.display = 'none';
      clearTimeout(this._cpfPopupTimer);
      const fileEl = document.getElementById('filePaystub');
      if (fileEl) fileEl.value = '';

      // Mostrar seção operacional para roles com permissão
      this._toggleOperacionalSection();
      this.initAnexoFolders();
      this._initStaticProposalSelects();
      this._applyVendedorFormRules();
      this._ensureSupBackofficeDateUi('prop');
      const overlay = document.getElementById('propFormModal');
      if (overlay) {
        if (typeof window.openModal === 'function') window.openModal('propFormModal');
        else overlay.classList.add('open');
      } else {
        container.style.display = 'block';
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch(e) {
      alert("Erro ao abrir formulário: " + e.message);
    }
  },

  _toggleOperacionalSection: function() {
    const sec = document.getElementById('propOperacionalSection');
    if (!sec) return;
    const s = (typeof Auth !== 'undefined') ? Auth.getSession() : null;
    const opRoles = ['master','operacional','backoffice','supervisor','admin'];
    if (s && opRoles.includes(s.role)) {
      sec.style.display = 'block';
    } else {
      sec.style.display = 'none';
    }
  },

  /**
   * _isSupBackofficeSession — perfil Super Backoffice (sup_backoffice).
   * Só esse perfil vê o ajuste manual de data/hora do lançamento.
   */
  _isSupBackofficeSession: function() {
    const s = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    if (!s) return false;
    if (typeof DB !== 'undefined' && typeof DB._isSupBackofficeUser === 'function') {
      return DB._isSupBackofficeUser(s);
    }
    return String(s.role || '').trim().toLowerCase() === 'sup_backoffice';
  },

  /**
   * _ensureSupBackofficeDateUi — injeta bloco de data/hora manual no formulário.
   * prefix: 'prop' (cadastro) ou 'manageProp' (edição admin).
   */
  _ensureSupBackofficeDateUi: function(prefix) {
    const isProp = prefix === 'prop';
    const blockId = `${prefix}SupBackofficeDateBlock`;
    let block = document.getElementById(blockId);
    if (!this._isSupBackofficeSession()) {
      if (block) block.style.display = 'none';
      return;
    }
    if (!block) {
      block = document.createElement('div');
      block.id = blockId;
      block.className = 'card card-padded';
      block.style.cssText = 'margin-bottom:16px;border:1px solid var(--color-warning);background:var(--color-surface-2);';
      block.innerHTML = `
        <h4 style="margin:0 0 8px;font-size:14px;color:var(--color-warning);">Ajustar data/hora do lançamento</h4>
        <p style="margin:0 0 12px;font-size:12px;color:var(--color-text-muted);line-height:1.5;">
          Exclusivo Super Backoffice — use para recadastrar propostas que sumiram do filtro por período.
          Deixe desmarcado para usar o horário atual de Brasília.
        </p>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:13px;cursor:pointer;">
          <input type="checkbox" id="${prefix}CustomCreatedEnabled"/>
          Definir data e hora manualmente
        </label>
        <div id="${prefix}CustomCreatedFields" style="display:none;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group" style="margin:0;">
            <label>Data do lançamento</label>
            <input type="date" id="${prefix}CustomCreatedDate" class="form-control"/>
          </div>
          <div class="form-group" style="margin:0;">
            <label>Hora (Brasília)</label>
            <input type="time" id="${prefix}CustomCreatedTime" class="form-control" step="60"/>
          </div>
        </div>
      `;
      const chk = block.querySelector(`#${prefix}CustomCreatedEnabled`);
      const fields = block.querySelector(`#${prefix}CustomCreatedFields`);
      chk?.addEventListener('change', () => {
        if (fields) fields.style.display = chk.checked ? 'grid' : 'none';
      });
      if (isProp) {
        const area = document.getElementById('propFormArea');
        area?.insertBefore(block, area.firstChild);
      } else {
        const body = document.getElementById('manageProposalModal')?.querySelector('.modal-body');
        body?.insertBefore(block, body.firstChild);
      }
    }
    block.style.display = 'block';
    this._resetSupBackofficeDateUi(prefix);
  },

  /** Preenche defaults do bloco de data manual (cadastro ou edição). */
  _resetSupBackofficeDateUi: function(prefix, proposal) {
    const chk = document.getElementById(`${prefix}CustomCreatedEnabled`);
    const dateEl = document.getElementById(`${prefix}CustomCreatedDate`);
    const timeEl = document.getElementById(`${prefix}CustomCreatedTime`);
    const fields = document.getElementById(`${prefix}CustomCreatedFields`);
    const tz = this._PROP_TZ || 'America/Sao_Paulo';
    const now = new Date();
    const ymd = now.toLocaleDateString('en-CA', { timeZone: tz });
    const hm = now.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
    if (proposal) {
      const raw = proposal.createdAt || proposal.created_at || '';
      const d = typeof _parseSouBluDate === 'function' ? _parseSouBluDate(raw) : new Date(raw);
      if (d && !Number.isNaN(d.getTime())) {
        if (dateEl) dateEl.value = d.toLocaleDateString('en-CA', { timeZone: tz });
        if (timeEl) timeEl.value = d.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
      }
    } else {
      if (dateEl) dateEl.value = ymd;
      if (timeEl) timeEl.value = hm;
    }
    if (chk) chk.checked = false;
    if (fields) fields.style.display = 'none';
  },

  /**
   * _readSupBackofficeCreatedAt — lê data/hora manual do formulário (YYYY-MM-DD HH:mm:ss BRT).
   * Retorna null se checkbox desligado ou dados inválidos.
   */
  _readSupBackofficeCreatedAt: function(prefix) {
    if (!this._isSupBackofficeSession()) return null;
    const chk = document.getElementById(`${prefix}CustomCreatedEnabled`);
    if (!chk?.checked) return null;
    const dateVal = String(document.getElementById(`${prefix}CustomCreatedDate`)?.value || '').trim();
    const timeVal = String(document.getElementById(`${prefix}CustomCreatedTime`)?.value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) return null;
    const hm = /^\d{2}:\d{2}/.test(timeVal) ? timeVal.slice(0, 5) : '12:00';
    const sql = `${dateVal} ${hm}:00`;
    const d = typeof _parseSouBluDate === 'function'
      ? _parseSouBluDate(sql)
      : new Date(`${dateVal}T${hm}:00-03:00`);
    if (!d || Number.isNaN(d.getTime())) return null;
    return sql;
  },

  /**
   * _applySupBackofficeCreatedAt — grava created_at customizado na proposta.
   * touchUpdated: true no cadastro novo; false na edição (só muda data do lançamento).
   */
  _applySupBackofficeCreatedAt: function(proposal, prefix, user, opts = {}) {
    const touchUpdated = opts.touchUpdated !== false;
    const sql = this._readSupBackofficeCreatedAt(prefix);
    if (!sql || !proposal) return proposal;
    proposal.createdAt = sql;
    proposal.created_at = sql;
    if (touchUpdated) {
      proposal.updatedAt = sql;
      proposal.updated_at = sql;
    }
    proposal._preserveCreatedAt = true;
    const meta = (proposal.meta && typeof proposal.meta === 'object') ? { ...proposal.meta } : {};
    meta._customCreatedAt = true;
    meta._adjustedBy = user?.id || user?.name || 'sup_backoffice';
    meta._adjustedAt = typeof nowBrazilSql === 'function' ? nowBrazilSql() : sql;
    proposal.meta = meta;
    if (touchUpdated && Array.isArray(proposal.history) && proposal.history[0]) {
      proposal.history = proposal.history.slice();
      proposal.history[0] = { ...proposal.history[0], date: sql };
    }
    return proposal;
  },

  /**
   * _existingProposalsHintHtml — bloco no resumo do CPF após “Buscar Cliente”.
   * Mostra as fichas já gravadas e deixa explícito: segundo produto é permitido.
   * rows vem de DB.listProposalsByCpf (sem anexo).
   */
  _existingProposalsHintHtml: function(rows) {
    const list = (rows || []).filter((p) => p && p.id);
    if (!list.length) {
      return `<p style="margin:10px 0 0;font-size:13px;color:var(--color-text-muted);">Nenhuma proposta neste CPF. Pode lançar a primeira.</p>`;
    }
    const lines = list.slice(0, 8).map((p) => {
      const prod = this._escHtml(p.product || '—');
      const bank = this._escHtml(p.bancoDigitado || p.banco_digitado || '');
      const st = this._escHtml(p.status || p.statusOp || p.status_op || '—');
      const valor = Number(p.valor || 0);
      const valorTxt = valor > 0
        ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : 'R$ 0,00';
      return `<li>${prod}${bank ? ' · ' + bank : ''} · ${st} · ${valorTxt}</li>`;
    }).join('');
    const more = list.length > 8 ? `<li>… e mais ${list.length - 8}</li>` : '';
    return `<div style="margin-top:12px;padding:10px 12px;border-radius:8px;background:var(--color-surface-2);border:1px solid var(--color-border);">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:var(--color-success);">Este cliente já tem ${list.length} proposta(s). Pode lançar outro produto — as duas ficam no sistema.</p>
      <ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.5;">${lines}${more}</ul>
    </div>`;
  },

  /**
   * onCpfInput — dispara busca automática ao completar 11 dígitos do CPF.
   * Usa debounce curto para não consultar a cada tecla.
   */
  onCpfInput: function() {
    const input = document.getElementById('propCpf');
    const popup = document.getElementById('propCpfPopup');
    if (!input) return;

    const cpf = input.value.replace(/\D/g, '');
    clearTimeout(this._cpfPopupTimer);

    if (cpf.length !== 11) {
      if (popup) popup.style.display = 'none';
      const area = document.getElementById('propFormArea');
      if (area) area.style.display = 'none';
      return;
    }

    this._cpfPopupTimer = setTimeout(() => {
      this.searchCpf({ silent: true });
    }, 350);
  },

  /**
   * searchCpf — busca o cadastro (1 por CPF) e as propostas já lançadas.
   * Não bloqueia se já existir ficha: preenche o form e lista produtos atuais.
   * Grava this._cpfExistingProposals para o submit detectar clone vs segundo produto.
   * opts.silent: feedback no popup em vez de alert/botão (busca automática ao digitar).
   */
  searchCpf: async function(opts) {
    opts = opts || {};
    const popup = document.getElementById('propCpfPopup');
    try {
      const cpfStr = document.getElementById('propCpf').value;
      const cpf = cpfStr.replace(/\D/g, '');
      if (cpf.length !== 11) {
        if (!opts.silent) alert("Por favor, digite um CPF válido.");
        return;
      }

      let btn = null;
      let oldText = '';
      if (opts.silent) {
        if (popup) {
          popup.className = 'prop-cpf-popup';
          popup.style.display = 'block';
          popup.innerHTML = '<span style="color:var(--color-text-muted);">Buscando cliente...</span>';
        }
      } else {
        btn = (typeof event !== 'undefined' && event && event.target)
          || document.querySelector('#propFormContainer .btn-primary');
        oldText = btn ? btn.innerText : 'Buscar Cliente';
        if (btn) btn.innerText = 'Buscando...';
      }

      const client = await this._lookupClientByCpf(cpf);

      if (btn) btn.innerText = oldText;

      if (client) {
        this._cpfExistingProposals = [];
        if (typeof DB.listProposalsByCpf === 'function') {
          this._cpfExistingProposals = await DB.listProposalsByCpf(cpf).catch(() => []) || [];
        }
        let summary = `<strong>Nome:</strong> ${this._escHtml(client.name)}<br>
                       <strong>CPF:</strong> ${this._escHtml(client.cpf || cpf)}<br>
                       <strong>RG:</strong> ${this._escHtml(client.rg || '—')}<br>
                       <strong>Celular:</strong> ${this._escHtml(client.phone1 || 'Não informado')}<br>
                       <strong>Celular 2:</strong> ${this._escHtml(client.phone2 || '—')}<br>
                       <strong>E-mail:</strong> ${this._escHtml(client.email || 'Não informado')}<br>
                       <strong>Endereço:</strong> ${this._escHtml(client.address || '—')}`;
        summary += this._existingProposalsHintHtml(this._cpfExistingProposals);
        document.getElementById('propClientSummary').innerHTML = summary;
        document.getElementById('propClientName').value = client.name;
        document.getElementById('propFormArea').style.display = 'block';
        this._ensureSupBackofficeDateUi('prop');
        this._setFolderContext('propAnexosFolders', 'prop');
        this.initAnexoFolders();
        this._applyVendedorFormRules();

        if (popup) {
          popup.className = 'prop-cpf-popup prop-cpf-popup--found';
          popup.innerHTML = `✓ Cliente encontrado: <strong>${this._escHtml(client.name)}</strong>`;
          setTimeout(() => { popup.style.display = 'none'; }, 1800);
        }
      } else {
        document.getElementById('propFormArea').style.display = 'none';
        if (opts.silent) {
          if (popup) {
            popup.className = 'prop-cpf-popup prop-cpf-popup--notfound';
            popup.innerHTML = "Cliente não encontrado. Vá em 'Clientes' e cadastre primeiro.";
          }
        } else {
          alert("Cliente não encontrado. Por favor, vá na aba 'Clientes' e cadastre o cliente primeiro.");
          if (popup) popup.style.display = 'none';
        }
      }
    } catch (e) {
      if (opts.silent && popup) {
        popup.className = 'prop-cpf-popup prop-cpf-popup--notfound';
        popup.innerHTML = 'Erro ao buscar cliente.';
      } else if (!opts.silent) {
        alert('Erro ao buscar cliente: ' + e.message);
      }
    }
  },

  // Helper to read file as Base64
  readFileAsBase64: function(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  },

  submit: async function() {
    try {
      const user = Auth.getSession();
      if (!user) return;
      if (!(await this._assertCanCreateProposal())) return;

      const cpf = document.getElementById('propCpf').value.replace(/\D/g, '');
      const name = document.getElementById('propClientName').value;

      if (!cpf || !name) {
        alert("Busque o cliente primeiro.");
        return;
      }

      const role = user.role || '';
      const isVendedor = this._isVendedorRole(role);
      const etapaVendedor = (document.getElementById('propEtapaVendedor')?.value || '').trim();

      // Vendedor: precisa ter endereço no cadastro do cliente antes de criar a proposta.
      // Banco/agência/conta são exigidos ao salvar a ficha (modal editar), não aqui —
      // o cadastro de cliente ainda não tem esses campos estruturados.
      if (isVendedor) {
        let clientRow = null;
        try {
          clientRow = typeof this._lookupClientByCpf === 'function'
            ? await this._lookupClientByCpf(cpf)
            : null;
        } catch (_) { clientRow = null; }
        const addr = String(clientRow?.address || '').trim();
        if (!addr || addr.length < 8) {
          alert(
            'Complete o endereço do cliente no cadastro antes de enviar a proposta.\n\n' +
            'Abra o cliente, preencha o endereço e tente novamente.'
          );
          return;
        }
      }

      const saveBtn = document.querySelector('#propFormArea .btn-primary');
      let oldText = 'Enviar Proposta';
      if (saveBtn) {
        oldText = saveBtn.innerText;
        saveBtn.innerText = 'Enviando...';
        saveBtn.disabled = true;
      }

      let attachments = {};
      const proposalId = 'PROP-' + Date.now();
      try {
        this._setFolderContext('propAnexosFolders', 'prop');
        attachments = await this._collectAttachments(proposalId, 'propAnexosFolders');
        attachments = this._validateAttachmentsBeforeSave(attachments);
      } catch (e) {
        alert(e.message || `Erro ao enviar anexo. Verifique o tamanho (máx. ${this.PROPOSAL_MAX_FILE_MB || 50} MB) e tente novamente.`);
        if (saveBtn) { saveBtn.innerText = oldText; saveBtn.disabled = false; }
        return;
      }

      const gv = id => document.getElementById(id)?.value || '';
      const bancoDigitado = String(gv('propBancoDigitado') || '').trim();
      const tipoOperacao = String(gv('propTipoOperacao') || '').trim();
      if (!bancoDigitado) {
        alert('Selecione o Banco para digitação (informado na simulação).');
        if (saveBtn) { saveBtn.innerText = oldText; saveBtn.disabled = false; }
        return;
      }
      if (!tipoOperacao) {
        alert('Selecione o Tipo de operação.');
        if (saveBtn) { saveBtn.innerText = oldText; saveBtn.disabled = false; }
        return;
      }

      // Só pergunta se for o MESMO produto+banco. Outro produto (ex.: Neo) passa direto.
      const existing = Array.isArray(this._cpfExistingProposals) ? this._cpfExistingProposals : [];
      const cloneHint = { clientCpf: cpf, product: this._normalizeProductValue(gv('propProduct')), bancoDigitado };
      const clone = (typeof DB.findOtherCloneProposalForClient === 'function')
        ? DB.findOtherCloneProposalForClient(existing, cloneHint)
        : null;
      if (clone) {
        const ok = confirm(
          `Já existe uma proposta deste CPF com o mesmo produto e banco:\n` +
          `${clone.product || ''} / ${clone.bancoDigitado || clone.banco_digitado || ''} (${clone.status || '—'}).\n\n` +
          `Isso parece ficha repetida. Confirma lançar mesmo assim?\n` +
          `(Outro produto neste cliente é permitido — só confirme se for de propósito.)`
        );
        if (!ok) {
          if (saveBtn) { saveBtn.innerText = oldText; saveBtn.disabled = false; }
          return;
        }
      }

      const valor      = parseFloat(gv('propValor')) || 0;
      const tabela     = '';
      const valorFinal = valor;
      const desconto   = 0;
      const statusInicial = isVendedor
        ? (etapaVendedor || 'Em Andamento')
        : (gv('propStatusOp') || 'Em Andamento');

      const proposal = {
        id: proposalId,
        employee_id: user.id,
        numero: gv('propNumero'),
        vendorId: user.id,
        vendor_id: user.id,
        vendorName: user.name,
        vendor_name: user.name,
        clientCpf: cpf,
        client_cpf: cpf,
        clientName: name,
        client_name: name,
        matricula: gv('propMatricula'),
        senhaContracheque: gv('propSenhaContracheque'),
        senhaConsignacao: gv('propSenhaConsignacao'),
        product: this._normalizeProductValue(gv('propProduct')),
        convenio: this._normalizeConvenioKey(gv('propConvenio')),
        entidade: gv('propEntidade'),
        obs: gv('propObs'),
        tabela: tabela,
        valor: valor,
        desconto: desconto,
        valorFinal: valorFinal,
        compraDivida: gv('propCompraDivida'),
        bancoComprado: gv('propBancoComprado'),
        bancoDigitado,
        tipoOperacao,
        tipo_operacao: tipoOperacao,
        meta: { tipo_operacao: tipoOperacao },
        solicitouBoleto: gv('propSolicitouBoleto'),
        protocolo: gv('propProtocolo'),
        dataSolicitacao: gv('propDataSolicitacao'),
        bacen: gv('propBacen'),
        protocoloBacen: gv('propProtocoloBacen'),
        dataSolicitacaoBacen: gv('propDataSolicitacaoBacen'),
        assinou: gv('propAssinouTermo'),
        statusOp: statusInicial,
        posVenda: gv('propPosVenda'),
        nuvidio: gv('propNuvidio'),
        fases: gv('propFases'),
        attachments: attachments,
        status: statusInicial,
        history: [{
          date: nowBrazilSql(),
          actorName: user.name,
          action: 'Proposta Criada',
          note: gv('propObs')
        }],
        createdAt: nowBrazilSql(),
        updatedAt: nowBrazilSql(),
        updated_at: nowBrazilSql(),
      };

      this._applySupBackofficeCreatedAt(proposal, 'prop', user, { touchUpdated: true });

      if (typeof showLoading === 'function') showLoading('Enviando proposta…');
      try {
        await DB.save('proposals', proposal);
        try {
          await this._ensureClientRecordForProposal(proposal, null);
        } catch (syncErr) {
          console.warn('[Proposals] sync client on create:', syncErr);
        }
      } finally {
        if (typeof hideLoading === 'function') hideLoading();
      }
      if (typeof SalesRanking !== 'undefined' && SalesRanking.invalidateCache) SalesRanking.invalidateCache();
      
      if (saveBtn) { saveBtn.innerText = oldText; saveBtn.disabled = false; }
      alert("Proposta enviada com sucesso!");
      
      this.closeCreatePanel();
      /* Limpa slots e arquivos selecionados — evita anexos "fantasma" na próxima proposta. */
      this._setFolderContext('propAnexosFolders', 'prop');
      this.resetAnexoFolders();
      
      if (document.getElementById('manageProposalsTbody')) {
        this._adminList.page = 1;
        this.renderAdminList();
      }
      else {
        this._employeeList.page = 1;
        this.renderEmployeeList();
      }
    } catch(e) {
      console.error(e);
      const msg = String(e.message || e);
      const friendly = msg.includes('57014') || msg.includes('statement timeout')
        ? 'Tempo esgotado ao salvar. Os anexos são enviados ao Storage — recarregue (Ctrl+F5) e tente de novo. Se persistir, crie o bucket "proposal-attachments" no Supabase.'
        : msg.includes('etapaVendedor') || msg.includes('PGRST204') || /Could not find the .* column/i.test(msg)
        ? 'Erro ao enviar proposta: campo inválido no servidor. Recarregue a página (Ctrl+F5) e tente novamente. Se persistir, aplique a migração 006_proposals_banco_digitado.sql no Supabase.'
        : 'Erro ao enviar proposta: ' + msg;
      alert(friendly);
      const saveBtn = document.querySelector('#propFormArea .btn-primary');
      if (saveBtn) { saveBtn.innerText = 'Enviar Proposta'; saveBtn.disabled = false; }
    }
  },

  /**
   * _isGestaoCreditoProposal — ficha da 2ª esteira (CD-* / entidade COMPRA_DIVIDA).
   * Separada de Minhas Propostas: vendedor olha em "Propostas de Crédito" ou no menu Gestão de Crédito.
   */
  _isGestaoCreditoProposal: function(p) {
    if (!p) return false;
    if (typeof window.EsteiraCompraDivida?.isCompraDividaProposal === 'function') {
      return !!window.EsteiraCompraDivida.isCompraDividaProposal(p);
    }
    const ent = String(p.entidade || '').toUpperCase().normalize('NFD').replace(/\p{M}/gu, '');
    if (ent === 'COMPRA_DIVIDA' || ent === 'COMPRA DE DIVIDA') return true;
    if (String(p.id || '').startsWith('CD-') || String(p.numero || '').startsWith('CD-')) return true;
    const obs = String(p.obs || '');
    return obs.includes('tipo_esteira=compra_divida') || /\[COMPRA[_\s]?DIVIDA\]/i.test(obs);
  },

  /**
   * _ensureEmployeeCreditBlock — card separado sob Meus Clientes para fichas de crédito.
   * Evita misturar com NOVO/CARTÃO e deixa claro onde a Gestão de Crédito aparece.
   */
  _ensureEmployeeCreditBlock: function() {
    let list = document.getElementById('employeeCreditProposalsList');
    if (list) return list;
    const proposalsList = document.getElementById('proposalsList');
    const host = proposalsList?.closest('.card.card-padded')?.parentElement
      || document.getElementById('secProposals');
    if (!host || !proposalsList) return null;
    const card = document.createElement('div');
    card.className = 'card card-padded';
    card.id = 'employeeCreditProposalsCard';
    card.style.marginBottom = '20px';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:15px;">
        <div>
          <h3 style="margin:0;">Propostas de Crédito</h3>
          <p style="margin:4px 0 0;font-size:13px;color:var(--color-text-muted);">Esteira Gestão de Crédito (separado das propostas normais)</p>
        </div>
        <button type="button" class="btn btn-outline btn-sm" id="employeeCreditGoBtn">Abrir Gestão de Crédito</button>
      </div>
      <div id="employeeCreditProposalsList"></div>`;
    const normalCard = proposalsList.closest('.card.card-padded');
    if (normalCard && normalCard.parentNode) {
      normalCard.parentNode.insertBefore(card, normalCard);
    } else {
      host.appendChild(card);
    }
    card.querySelector('#employeeCreditGoBtn')?.addEventListener('click', () => {
      if (typeof window.EsteiraCompraDivida?.ensureVendorSection === 'function') {
        window.EsteiraCompraDivida.ensureVendorSection();
      }
      const nav = document.getElementById('navGestaoCredito');
      if (nav) nav.click();
      else if (typeof navigateTo === 'function') navigateTo('secEsteiraCompraDivida');
    });
    return document.getElementById('employeeCreditProposalsList');
  },

  /** _employeeProposalCardHtml — card compacto da lista do vendedor (normal ou crédito). */
  _employeeProposalCardHtml: function(p, clientsByCpf) {
    const fmtR = (v) => (v != null && v !== '' ? 'R$ ' + parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—');
    const stage = this._vendorStage(p);
    const statusLabel = this._proposalDisplayStatus(p);
    const badgeClass = this._proposalStatusBadgeClass(stage || p.status);
    const phone = this._formatPhoneDisplay(this._proposalClientPhone(p, clientsByCpf));
    const email = this._proposalClientEmail(p, clientsByCpf);
    const protoParts = [];
    if (p.protocolo) protoParts.push(`<strong>Nº Protocolo:</strong> ${this._escHtml(p.protocolo)}`);
    if (phone) protoParts.push(`<strong>Telefone:</strong> ${this._escHtml(phone)}`);
    if (email) protoParts.push(`<strong>E-mail:</strong> ${this._escHtml(email)}`);
    const protoPhoneHtml = protoParts.length
      ? `<div style="font-size:14px;margin-top:4px;">${protoParts.join(' | ')}</div>`
      : '';
    return `
      <div class="card" style="padding: 16px; margin-bottom: 12px;">
         <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 8px;">
            <div>
              <strong style="font-size:16px;">${this._escHtml(p.numero || p.id)}</strong>
              ${p.numero ? `<span style="font-size:11px;color:var(--color-text-muted);margin-left:8px;">(${this._escHtml(p.id)})</span>` : ''}
            </div>
            <span class="badge ${badgeClass}">${this._escHtml(statusLabel)}</span>
         </div>
         <div style="margin-bottom:4px; font-size:14px;"><strong>Cliente:</strong> ${this._escHtml(p.clientName)} (CPF: ${this._escHtml(p.clientCpf)})</div>
         <div style="font-size:14px;"><strong>Produto:</strong> ${this._escHtml(p.product || '—')} | <strong>Convênio:</strong> ${this._escHtml(p.convenio || '—')} | <strong>Entidade:</strong> ${this._escHtml(p.entidade || '—')}</div>
         ${protoPhoneHtml}
         <div style="display:flex; gap:20px; margin-top:10px; background:var(--color-surface-2); padding:10px; border-radius:8px; flex-wrap:wrap;">
           <div style="font-size:13px;"><span style="color:var(--color-text-muted);">Valor Proposta</span><br><strong>${fmtR(p.valor)}</strong></div>
           <div style="font-size:13px;"><span style="color:var(--color-text-muted);">Desconto</span><br><strong style="color:var(--color-danger);">− ${fmtR(p.desconto)}</strong></div>
           <div style="font-size:13px;"><span style="color:var(--color-text-muted);">Valor Final</span><br><strong style="color:var(--color-success);">${fmtR(p.valorFinal)}</strong></div>
         </div>
         <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; flex-wrap:wrap; gap:8px;">
           <div style="font-size: 12px; color: var(--color-text-muted);">Criada em: ${this._propDateStr(p)}</div>
           <div style="flex-shrink:0;">${this.actionsRowHtml(p.id, { employee: true })}</div>
         </div>
      </div>`;
  },

  renderEmployeeList: async function() {
    this._applyMobileListLimits();
    const listEl = document.getElementById('proposalsList');
    if (!listEl) return;

    const user = Auth.getSession();
    if (!user?.id) return;

    listEl.innerHTML = '<p style="color:var(--color-text-muted);">Carregando propostas...</p>';
    const creditEl = this._ensureEmployeeCreditBlock();
    if (creditEl) creditEl.innerHTML = '<p style="color:var(--color-text-muted);">Carregando propostas de crédito...</p>';

    try {
      const me = await DB.getUser(user.id).catch(() => null);
      const vendorUser = { id: user.id, name: me?.name || user.name || '' };

      const raw = await DB.getProposals(user.id, vendorUser);
      // getProposals já filtra por vendor_id/employee_id e por CPF dos clientes do vendedor.
      // Não aplicar _ownsProposal de novo — isso escondia propostas com vendor_id vazio/errado.
      let all = this._rowsFromProposalQuery(raw)
        .map(p => this._normProposal(p));

      all = this._sortProposalsNewestFirst(all);

      // Separa Gestão de Crédito (CD) das propostas CRM normais.
      const credit = all.filter((p) => this._isGestaoCreditoProposal(p));
      let proposals = all.filter((p) => !this._isGestaoCreditoProposal(p));

      let clientsByCpf = {};
      if (typeof DB.getClients === 'function') {
        try {
          const clients = await DB.getClients({ supervisorId: user.id, pageSize: 2000 });
          clientsByCpf = this._clientsByCpfMap(clients);
        } catch (_) { /* noop */ }
      }
      const pageCpfs = [...new Set(
        all.map((p) => String(p.clientCpf || p.client_cpf || '').replace(/\D/g, '')).filter(Boolean)
      )];
      const missingCpfs = pageCpfs.filter((cpf) => !clientsByCpf[cpf]);
      if (missingCpfs.length && typeof DB.getClientByCpf === 'function') {
        await Promise.all(missingCpfs.slice(0, 25).map(async (cpf) => {
          const c = await DB.getClientByCpf(cpf).catch(() => null);
          if (c) clientsByCpf[cpf] = c;
        }));
      }

      if (creditEl) {
        if (!credit.length) {
          creditEl.innerHTML = '<p style="color:var(--color-text-muted);">Nenhuma proposta de crédito nesta esteira. Use <strong>Gestão de Crédito</strong> no menu para cadastrar.</p>';
        } else {
          creditEl.innerHTML = credit.map((p) => this._employeeProposalCardHtml(p, clientsByCpf)).join('');
        }
      }

      this._employeeList.total = proposals.length;
      const startEmp = (this._employeeList.page - 1) * this._employeeList.pageSize;
      proposals = proposals.slice(startEmp, startEmp + this._employeeList.pageSize);

      if (proposals.length === 0) {
        listEl.innerHTML = '<p style="color:var(--color-text-muted);">Nenhuma proposta cadastrada.</p>';
        this._renderPagination('employeeProposalsPagination', this._employeeList, 'Proposals.employeeSetPage');
        return;
      }

      listEl.innerHTML = proposals.map((p) => this._employeeProposalCardHtml(p, clientsByCpf)).join('');
      this._renderPagination('employeeProposalsPagination', this._employeeList, 'Proposals.employeeSetPage');
    } catch (e) {
      console.error('[Proposals] renderEmployeeList:', e);
      listEl.innerHTML = '<p style="color:var(--color-danger);">Erro ao carregar propostas. Recarregue a página.</p>';
      if (creditEl) creditEl.innerHTML = '';
    }
  },

  /** Lista filtrada da gestão (sem paginação) — usada na tabela e na exportação CSV. */
  _fetchAdminProposalsFiltered: async function(opts = {}) {
    const forceRefresh = !!(opts && opts.forceRefresh);
    const t0 = Date.now();
    const q = this._getProposalSearchQuery();
    const session = Auth.getSession();
    const isVendorSession = session?.role === 'vendedor';
    let vendorId = this._getAdminVendorFilter();
    if (isVendorSession) vendorId = session.id;
    this._adminList.vendorId = vendorId;

    const statusFilter = this._getAdminStatusFilter();
    this._adminList.statusFilter = statusFilter;

    const { dateFrom, dateTo } = this._getAdminDateFilter();

    const headerVendor = document.getElementById('proposalVendorFilterHeader');
    if (headerVendor) {
      if (vendorId && vendorId !== 'todos') headerVendor.classList.add('filter-active');
      else headerVendor.classList.remove('filter-active');
    }
    const headerStatus = document.getElementById('proposalStatusFilterHeader');
    if (headerStatus) {
      if (statusFilter && statusFilter !== 'todos') headerStatus.classList.add('filter-active');
      else headerStatus.classList.remove('filter-active');
    }
    const dateFromEl = document.getElementById('proposalDateFrom');
    const dateToEl = document.getElementById('proposalDateTo');
    if (dateFromEl) {
      if (dateFrom) dateFromEl.classList.add('filter-active');
      else dateFromEl.classList.remove('filter-active');
    }
    if (dateToEl) {
      if (dateTo) dateToEl.classList.add('filter-active');
      else dateToEl.classList.remove('filter-active');
    }

    const vendorFilterHeaderEl = document.getElementById('proposalVendorFilterHeader');
    if (vendorFilterHeaderEl) {
      vendorFilterHeaderEl.disabled = isVendorSession;
      vendorFilterHeaderEl.style.display = isVendorSession ? 'none' : '';
    }

    const partnerRoot = !isVendorSession && typeof window !== 'undefined' ? window.PARTNER_ROOT_ID : null;
    const propOpts = partnerRoot ? { partnerRootId: partnerRoot } : {};
    const hasDateFilter = !!(dateFrom || dateTo);
    const canUseCache = !forceRefresh && !partnerRoot && !isVendorSession && !q && !vendorId
      && (!statusFilter || statusFilter === 'todos')
      && !hasDateFilter
      && Array.isArray(this._adminListCache) && this._adminListCache.length > 0
      && (opts.fromCache || (Date.now() - this._adminListCacheAt) < this._ADMIN_LIST_CACHE_TTL);

    let rawRows;
    const filterInit = this._initAdminProposalFilters();
    if (canUseCache) {
      rawRows = this._adminListCache;
      await filterInit;
    } else {
      if (forceRefresh && typeof DB._invalidateProposalsCache === 'function') {
        try { DB._invalidateProposalsCache(); } catch (_) { /* noop */ }
      }
      if (forceRefresh && typeof _cacheDel === 'function') {
        try { _cacheDel('proposals'); } catch (_) { /* noop */ }
      }
      const [, fetched] = await Promise.all([
        filterInit,
        isVendorSession
          ? DB.getProposals(session.id, { id: session.id, name: session.name })
          : DB.getProposals(null, null, propOpts),
      ]);
      rawRows = fetched;
      if (!partnerRoot && !isVendorSession && !q && !vendorId && (!statusFilter || statusFilter === 'todos') && !hasDateFilter) {
        const list = Array.isArray(rawRows) ? rawRows.slice() : [];
        if (list.length > 0) {
          this._adminListCache = list;
          this._adminListCacheAt = Date.now();
        } else {
          this._adminListCache = null;
          this._adminListCacheAt = 0;
        }
      }
    }

    let proposals = this._rowsFromProposalQuery(rawRows).map(p => this._normProposal(p));
    if (isVendorSession) {
      // getProposals(session.id) já restringe ao vendedor; não filtrar de novo.
    } else if (window.PARTNER_ROOT_ID) {
      proposals = await this._filterProposalsToPartnerOrg(proposals);
    } else {
      proposals = await this._filterProposalsToSupervisorTeam(proposals, session);
      if (!this._canSeePartnerProposalsInAdminList()) {
        proposals = await this._filterProposalsExcludePartnerOrg(proposals);
      }
    }
    proposals = proposals.filter(p => this._matchesVendorIdFilter(p, vendorId || ''));
    proposals = proposals.filter(p => this._matchesStatusFilter(p, statusFilter || ''));
    // Lista padrão esconde Cancelado — exclusão/arquivamento some na hora (filtro Cancelado ainda mostra).
    if (!statusFilter || statusFilter === 'todos') {
      proposals = proposals.filter((p) => !(typeof DB !== 'undefined' && typeof DB.isCancelledProposal === 'function' && DB.isCancelledProposal(p)));
    }
    proposals = proposals.filter(p => this._matchesProposalQuickSearch(p, q));
    proposals = proposals.filter(p => this._matchesDateFilter(p, dateFrom, dateTo, statusFilter));
    if (this._adminList.sortField === 'vendedor') {
      proposals = this._sortProposalsByVendorName(proposals, this._adminList.sortDir);
    } else if (this._isDigitacaoStatus(statusFilter)) {
      proposals = this._sortProposalsDigitacaoFifo(proposals);
    } else {
      proposals = this._sortProposalsNewestFirst(proposals);
    }
    this._updateAdminVendorSortHeader();

    this._propPerfLog('proposals.js:_fetchAdminProposalsFiltered', 'list fetched', {
      ms: Date.now() - t0, count: proposals.length, partnerRoot: !!window.PARTNER_ROOT_ID, fromCache: !!canUseCache,
    }, 'B');

    return { proposals, q, vendorId, statusFilter, dateFrom, dateTo, isVendorSession };
  },

  _mergeAdminListCacheRow: function(proposal) {
    if (!proposal?.id) return;
    const norm = this._normProposal(proposal) || proposal;
    if (!Array.isArray(this._adminListCache)) {
      this._adminListCache = [norm];
      this._adminListCacheAt = Date.now();
      return;
    }
    const idx = this._adminListCache.findIndex((p) => String(p.id) === String(norm.id));
    if (idx >= 0) this._adminListCache[idx] = { ...this._adminListCache[idx], ...norm };
    else this._adminListCache.unshift(norm);
    this._adminListCacheAt = Date.now();
  },

  _invalidateAdminListCache: function() {
    this._adminListCache = null;
    this._adminListCacheAt = 0;
  },

  _proposalExportRow: function(p) {
    const num = (v) => (v != null && v !== '' && Number.isFinite(parseFloat(v)) ? parseFloat(v) : '');
    const dt = this._proposalCreatedAt(p);
    let dataCriacao = '';
    if (dt) {
      try { dataCriacao = typeof formatDateTime === 'function' ? formatDateTime(dt) : this._fmtDateTime(dt); } catch (_) { dataCriacao = String(dt); }
    }
    let dataPagamento = '';
    if (typeof DB !== 'undefined' && typeof DB.proposalPaidAt === 'function') {
      const paidAt = DB.proposalPaidAt(p);
      if (paidAt) {
        try {
          dataPagamento = typeof formatDateTime === 'function'
            ? formatDateTime(paidAt)
            : this._fmtDateTime(paidAt);
        } catch (_) {
          dataPagamento = String(paidAt);
        }
      }
    }
    return {
      'Nº Proposta': p.numero || p.id || '',
      Vendedor: p.vendorName || '',
      Cliente: p.clientName || '',
      CPF: p.clientCpf || '',
      Produto: p.product || '',
      'Valor Final (R$)': num(p.valorFinal),
      Status: p.status || p.statusOp || '',
      'Data criação': dataCriacao,
      'Data pagamento': dataPagamento,
    };
  },

  _downloadProposalCsv: function(rows, filenameBase) {
    const headers = rows.length
      ? Object.keys(rows[0])
      : ['Nº Proposta', 'Vendedor', 'Cliente', 'CPF', 'Produto', 'Valor Final (R$)', 'Status', 'Data criação', 'Data pagamento'];
    const stamp = nowBrazilSql().slice(0, 10);
    const fname = `${filenameBase}_${stamp}.csv`;
    const bom = '\uFEFF';
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.join(';'), ...rows.map(r => headers.map(h => esc(r[h])).join(';'))].join('\n');
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    a.click();
    URL.revokeObjectURL(url);
  },

  /**
   * _downloadProposalXlsx — gera .xlsx com cabeçalho fixo, autofilter e moeda.
   * Usa SheetJS (ensureXlsx); se falhar, o caller faz fallback para CSV.
   */
  _downloadProposalXlsx: async function(rows, filenameBase) {
    if (typeof window.ensureXlsx === 'function') await window.ensureXlsx();
    if (typeof XLSX === 'undefined') throw new Error('Biblioteca de planilha indisponível.');

    const headers = rows.length
      ? Object.keys(rows[0])
      : ['Nº Proposta', 'Vendedor', 'Cliente', 'CPF', 'Produto', 'Valor Final (R$)', 'Status', 'Data criação', 'Data pagamento'];
    const moneyCols = new Set(['Valor Final (R$)']);
    const moneyColIdx = headers.reduce((acc, h, i) => { if (moneyCols.has(h)) acc.push(i); return acc; }, []);

    const aoa = [headers, ...rows.map(r => headers.map(h => r[h]))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    for (let R = 1; R < aoa.length; R++) {
      moneyColIdx.forEach((C) => {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        if (cell && typeof cell.v === 'number') cell.z = '"R$" #,##0.00';
      });
    }

    ws['!cols'] = headers.map((h, i) => {
      const maxLen = aoa.reduce((m, row) => Math.max(m, String(row[i] ?? '').length), h.length);
      return { wch: Math.min(Math.max(maxLen + 2, 10), 42) };
    });
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: Math.max(aoa.length - 1, 0), c: headers.length - 1 },
      }),
    };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Propostas');
    const stamp = nowBrazilSql().slice(0, 10);
    XLSX.writeFile(wb, `${filenameBase}_${stamp}.xlsx`);
  },

  exportAdminExcel: async function() {
    if (!document.getElementById('manageProposalsTbody')) return;
    if (typeof showLoading === 'function') showLoading('Gerando planilha...');
    try {
      const { proposals, q } = await this._fetchAdminProposalsFiltered();
      if (!proposals.length) {
        if (typeof showToast === 'function') {
          showToast(q ? 'Nenhuma proposta encontrada com os filtros atuais.' : 'Não há propostas para exportar.', 'warning');
        } else alert('Nenhuma proposta para exportar.');
        return;
      }
      const rows = proposals.map(p => this._proposalExportRow(p));
      try {
        await this._downloadProposalXlsx(rows, 'propostas_soublu');
        if (typeof showToast === 'function') {
          showToast(`${proposals.length} proposta(s) exportada(s) em Excel.`, 'success', 4500);
        }
      } catch (xlsxErr) {
        console.error('[Proposals] exportAdminExcel xlsx fallback:', xlsxErr);
        this._downloadProposalCsv(rows, 'propostas_soublu');
        if (typeof showToast === 'function') {
          showToast(`${proposals.length} proposta(s) exportada(s) em CSV (Excel indisponível).`, 'warning', 5500);
        }
      }
    } catch (e) {
      console.error('[Proposals] exportAdminExcel:', e);
      if (typeof showToast === 'function') showToast('Erro ao gerar planilha. Tente novamente.', 'error');
      else alert('Erro ao gerar planilha.');
    } finally {
      if (typeof hideLoading === 'function') hideLoading();
    }
  },

  exportAdminCsv: async function() {
    if (!document.getElementById('manageProposalsTbody')) return;
    if (typeof showLoading === 'function') showLoading('Gerando CSV...');
    try {
      const { proposals, q } = await this._fetchAdminProposalsFiltered();
      if (!proposals.length) {
        if (typeof showToast === 'function') {
          showToast(q ? 'Nenhuma proposta encontrada com os filtros atuais.' : 'Não há propostas para exportar.', 'warning');
        } else alert('Nenhuma proposta para exportar.');
        return;
      }
      const rows = proposals.map(p => this._proposalExportRow(p));
      this._downloadProposalCsv(rows, 'propostas_soublu');
      if (typeof showToast === 'function') {
        showToast(`${proposals.length} proposta(s) exportada(s) em CSV.`, 'success', 4500);
      }
    } catch (e) {
      console.error('[Proposals] exportAdminCsv:', e);
      if (typeof showToast === 'function') showToast('Erro ao gerar CSV. Tente novamente.', 'error');
      else alert('Erro ao gerar CSV.');
    } finally {
      if (typeof hideLoading === 'function') hideLoading();
    }
  },

  renderAdminList: async function(opts = {}) {
    this._applyMobileListLimits();
    this._syncProposalToolsPlacement();
    this._syncProposalResponsiveLayout();
    this._resetAdminProposalTableLayout();
    const tbody = document.getElementById('manageProposalsTbody');
    if (!tbody) return;

    this._ensureCleanupDuplicatesBtn();

    // Limpa e-mail injetado pelo autofill do Chrome antes de filtrar a lista.
    this._scrubProposalSearchAutofill();

    const colspan = this._adminListColspan();
    const finGestao = this._isFinanceiroGestao();
    const emptyMsg = (q) => `<tr><td colspan="${colspan}" style="text-align:center;color:var(--color-text-muted);padding:24px;">${q ? 'Nenhuma proposta encontrada para esta busca.' : 'Nenhuma proposta cadastrada.'}</td></tr>`;

    if (!opts.soft) {
      tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center;color:var(--color-text-muted);padding:24px;">Carregando propostas...</td></tr>`;
    }

    try {
      let { proposals: allFiltered, q, vendorId, dateFrom, dateTo } = await this._fetchAdminProposalsFiltered(opts);

      /* Se veio vazio sem filtro, tenta de novo sem cache (evita “sumiu tudo”). */
      if (!allFiltered.length && !q && !vendorId && !dateFrom && !dateTo && !opts._retriedEmpty) {
        this._invalidateAdminListCache();
        if (typeof DB._invalidateProposalsCache === 'function') DB._invalidateProposalsCache();
        if (typeof _cacheDel === 'function') {
          try { _cacheDel('proposals'); } catch (_) { /* noop */ }
        }
        const retry = await this._fetchAdminProposalsFiltered({ ...opts, forceRefresh: true, _retriedEmpty: true });
        allFiltered = retry.proposals;
        q = retry.q;
        vendorId = retry.vendorId;
        dateFrom = retry.dateFrom;
        dateTo = retry.dateTo;
      }

      this._adminList.total = allFiltered.length;
      let proposals = allFiltered.slice(
        (this._adminList.page - 1) * this._adminList.pageSize,
        this._adminList.page * this._adminList.pageSize
      );

      if (proposals.length === 0) {
        tbody.innerHTML = emptyMsg(q || vendorId || dateFrom || dateTo);
        const mobileHostEmpty = document.getElementById('manageProposalsMobileList');
        const tableWrapEmpty = tbody.closest('.table-wrap');
        const mobileLayout = this._isProposalMobileLayout();
        if (mobileHostEmpty) {
          mobileHostEmpty.style.display = mobileLayout ? 'block' : 'none';
          if (mobileLayout) {
            mobileHostEmpty.innerHTML = `<div class="prop-mobile-empty">${q || vendorId || dateFrom || dateTo ? 'Nenhuma proposta encontrada.' : 'Nenhuma proposta cadastrada.'}</div>`;
          }
        }
        if (tableWrapEmpty) tableWrapEmpty.style.display = mobileLayout ? 'none' : '';
        this._renderPagination('proposalsPagination', this._adminList, 'Proposals.adminSetPage');
        return;
      }

      let baixaMap = {};
      let prejuizoMap = {};
      let debitoMap = {};
      if (finGestao && window.FinPropostas?._loadAllOpsMaps) {
        const maps = await FinPropostas._loadAllOpsMaps();
        baixaMap = maps.baixa || {};
        prejuizoMap = maps.prejuizo || {};
        debitoMap = maps.debito || {};
      } else if (finGestao && window.FinPropostas?._loadBaixaOpsMap) {
        baixaMap = await FinPropostas._loadBaixaOpsMap();
      }

      const fmtR = v => v != null && v !== '' ? 'R$ ' + parseFloat(v).toLocaleString('pt-BR', {minimumFractionDigits:2}) : '—';
      const canDelete = this._canDeleteProposal();
      const showPartnerStyle = this._canSeePartnerProposalsInAdminList();
      const partnerIds = showPartnerStyle ? await this._partnerProposalIdSet(allFiltered) : new Set();
      const partnerRoot = typeof window !== 'undefined' ? window.PARTNER_ROOT_ID : null;
      const mobileCards = this._isProposalMobileLayout();
      const tableWrap = tbody.closest('.table-wrap');
      let mobileHost = document.getElementById('manageProposalsMobileList');
      if (!mobileHost && tableWrap?.parentElement) {
        mobileHost = document.createElement('div');
        mobileHost.id = 'manageProposalsMobileList';
        mobileHost.className = 'prop-mobile-cards';
        tableWrap.parentElement.insertBefore(mobileHost, tableWrap);
      }
      if (mobileHost) mobileHost.style.display = mobileCards ? 'block' : 'none';
      if (tableWrap) tableWrap.style.display = mobileCards ? 'none' : '';

      if (mobileCards && mobileHost) {
        let cards = '';
        proposals.forEach((p) => {
          cards += this._mobileProposalCardHtml(p, {
            isPartner: partnerIds.has(String(p.id)),
          });
        });
        mobileHost.innerHTML = cards;
        tbody.innerHTML = '';
        this._renderPagination('proposalsPagination', this._adminList, 'Proposals.adminSetPage');
        return;
      }

      let html = '';
      proposals.forEach(p => {
        const stage = this._vendorStage(p);
        const statusLabel = this._proposalDisplayStatus(p);
        const badgeClass = this._proposalStatusBadgeClass(stage || p.status);
        const subStatus = '';
        const safeId = this._escAttr(p.id);
        const isPartnerRow = partnerIds.has(String(p.id));
        const rowClass = isPartnerRow ? 'proposal-row--partner' : '';
        const partnerBadge = isPartnerRow
          ? '<span class="badge badge-info proposal-badge-partner">Parceiro</span> '
          : '';
        const comissaoCell = finGestao && window.FinPropostas?.operacaoChipsHtml
          ? `<td class="fin-comissao-col" style="cursor:pointer;" onclick="FinPropostas.openProposalDrawer('${safeId}','dados')" title="Abrir operações financeiras">${FinPropostas.operacaoChipsHtml(p, { baixa: baixaMap[String(p.id)], prejuizo: prejuizoMap[String(p.id)], debito: debitoMap[String(p.id)] })}</td>`
          : '';
        html += `<tr data-prop-id="${safeId}"${rowClass ? ` class="${rowClass}"` : ''}${finGestao ? ` style="cursor:pointer;" onclick="if(!event.target.closest('.client-actions,.fin-comissao-col'))FinPropostas.openProposalDrawer('${safeId}','dados')"` : ''}>
            <td>${partnerBadge}<strong>${this._escHtml(p.numero || p.id)}</strong></td>
            <td>${this._escHtml(p.vendorName || '—')}</td>
            <td>${this._escHtml(p.clientName || '—')} <div style="font-size:11px;color:var(--color-text-muted);">${this._escHtml(p.clientCpf || '')}</div></td>
            <td>${this._escHtml(p.product || '—')}${subStatus ? ` <div style="font-size:11px;color:var(--color-text-muted);">${this._escHtml(subStatus)}</div>` : ''}</td>
            <td>${this._escHtml(p.convenio || '—')} <div style="font-size:11px;color:var(--color-text-muted);">${this._escHtml(p.entidade || '')}</div></td>
            <td data-col="protocolo">${p.protocolo ? this._escHtml(p.protocolo) : '—'}</td>
            <td data-col="valor">${fmtR(p.valor)}</td>
            <td data-col="valorFinal"><strong style="color:var(--color-success);">${fmtR(p.valorFinal)}</strong></td>
            <td>${this._escHtml(this._propDateStr(p))}</td>
            <td data-col="status"><span class="badge ${badgeClass}">${this._escHtml(statusLabel)}</span></td>
            <td data-col="paidAt">${(typeof DB !== 'undefined' && typeof DB.proposalPaidAt === 'function' && DB.proposalPaidAt(p)) ? this._escHtml(this._fmtDateTime(DB.proposalPaidAt(p))) : '—'}</td>
            ${comissaoCell}
            <td class="td-proposal-actions"></td>
          </tr>`;
      });
      tbody.innerHTML = html;
      this._paintAdminProposalActionCells(proposals, {
        finGestao,
        canDelete,
        canEditRowFn: () => this._isSoubluProposalAdmin() || !partnerRoot || this._canPartnerManageProposals(),
        canDeleteFn: () => canDelete && (this._isSoubluProposalAdmin() || !partnerRoot || this._canPartnerManageProposals()),
      });
      this._renderPagination('proposalsPagination', this._adminList, 'Proposals.adminSetPage');
      this._ensureProposalTableScrollContainer();
      requestAnimationFrame(() => this._probeProposalTableLayout('prop-table2-post-render'));
    } catch (e) {
      console.error('[Proposals] renderAdminList:', e);
      const msg = (e && e.message) ? String(e.message).slice(0, 200) : 'Erro desconhecido';
      tbody.innerHTML = `<tr><td colspan="${this._adminListColspan()}" style="text-align:center;color:var(--color-danger);padding:24px;">Erro ao carregar propostas.<br><small style="opacity:.85;">${this._escHtml(msg)}</small><br><button type="button" class="btn btn-outline btn-sm" style="margin-top:10px;" onclick="Proposals.renderAdminList()">Tentar novamente</button></td></tr>`;
    }
  },


  _attachmentKeysForGroup: function(att, prefix, seedItems) {
    const items = (seedItems || []).map(i => ({ ...i, legado: i.legado || [] }));
    const seen = new Set(items.map(i => i.key));
    Object.keys(att || {}).forEach(k => {
      if (this._isAttachmentMetaKey(k)) return;
      if (k.startsWith(prefix) && !seen.has(k)) {
        seen.add(k);
        items.push({ key: k, legado: [] });
      }
    });
    return items;
  },

  _renderProposalAttachments: function(proposal, attEl) {
    if (!attEl) return;
    const att = this._parseAttachments(proposal.attachments);
    this._attachmentViewerCache = [];
    const grupos = this._getAnexoViewGroups();
    const _resolve = (item) => {
      const tryKey = (k) => {
        if (att[k] == null || att[k] === '') return null;
        const raw = att[k];
        const docNome = att[k + '_nome'] || item.label || item.key || k;
        const caminho = this._attachmentCaminho(raw, att, k);
        const urls = this._attachmentOpenUrls(raw, caminho);
        const display = this._attachmentPreviewUrl(raw, caminho, urls, docNome)
          || this._attachmentDisplayUrl(raw, caminho);
        if (!display && !this._isValidAttachmentUrl(raw)) return null;
        return { url: display || raw, rawUrl: raw, urls, nome: docNome, caminho };
      };
      let doc = tryKey(item.key);
      if (doc) return doc;
      for (const lk of (item.legado || [])) {
        doc = tryKey(lk);
        if (doc) return doc;
      }
      return null;
    };
    let html = '<div style="display:flex;flex-direction:column;gap:14px;width:100%;margin-top:8px;">';
    const usedKeys = new Set();
    grupos.forEach(g => {
      const itens = this._attachmentKeysForGroup(att, g.prefix, g.seed);
      html += `<div>
        <div style="font-size:12px;font-weight:700;color:var(--color-text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">${g.titulo}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">`;
      let algum = false;
      itens.forEach((item) => {
        if (usedKeys.has(item.key)) return; /* já exibido via legado de outro item — evita duplicar */
        const doc = _resolve(item);
        if (!doc) return;
        algum = true;
        usedKeys.add(item.key);
        (item.legado || []).forEach((lk) => usedKeys.add(lk));
        const cacheIdx = this._attachmentViewerCache.length;
        this._attachmentViewerCache.push({ url: doc.url, rawUrl: doc.rawUrl, urls: doc.urls, nome: doc.nome, caminho: doc.caminho });
        html += this._renderAttachmentPreview(doc, cacheIdx);
      });
      if (!algum) html += `<span style="font-size:12px;color:var(--color-text-muted);align-self:center;">Nenhum arquivo</span>`;
      html += `</div></div>`;
    });

    const customGroupIds = new Set();
    Object.keys(att).forEach(k => {
      if (!k.startsWith('custom_') || this._isAttachmentMetaKey(k)) return;
      const m = k.match(/^custom_(.+)_(\d+)$/);
      if (m) customGroupIds.add(m[1]);
    });
    customGroupIds.forEach(groupId => {
      const keys = Object.keys(att).filter(k =>
        k.startsWith('custom_' + groupId + '_') && !this._isAttachmentMetaKey(k)
      ).sort();
      const titulo = att['custom_' + groupId + '_1_pasta'] || att[keys[0] + '_pasta'] || '📁 Pasta extra';
      html += `<div>
        <div style="font-size:12px;font-weight:700;color:var(--color-text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">${this._escHtml(titulo)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">`;
      let algumCustom = false;
      keys.forEach(key => {
        const doc = _resolve({ key, legado: [] });
        if (!doc) return;
        algumCustom = true;
        const cacheIdx = this._attachmentViewerCache.length;
        this._attachmentViewerCache.push({ url: doc.url, rawUrl: doc.rawUrl, urls: doc.urls, nome: doc.nome, caminho: doc.caminho });
        html += this._renderAttachmentPreview(doc, cacheIdx);
      });
      if (!algumCustom) html += `<span style="font-size:12px;color:var(--color-text-muted);">Nenhum arquivo</span>`;
      html += `</div></div>`;
    });

    const miscKeys = Object.keys(att).filter(k =>
      !this._isAttachmentMetaKey(k) && !usedKeys.has(k)
    );
    if (miscKeys.length) {
      html += `<div>
        <div style="font-size:12px;font-weight:700;color:var(--color-text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">📎 Outros documentos</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">`;
      let algumMisc = false;
      miscKeys.forEach((key) => {
        const doc = _resolve({ key, legado: [] });
        if (!doc) return;
        algumMisc = true;
        const cacheIdx = this._attachmentViewerCache.length;
        this._attachmentViewerCache.push({ url: doc.url, rawUrl: doc.rawUrl, urls: doc.urls, nome: doc.nome, caminho: doc.caminho });
        html += this._renderAttachmentPreview(doc, cacheIdx);
      });
      if (!algumMisc) html += `<span style="font-size:12px;color:var(--color-text-muted);">Nenhum arquivo</span>`;
      html += `</div></div>`;
    }

    html += '</div>';
    attEl.innerHTML = html;
  },

  _applyEmployeeModalMode: function(viewOnly) {
    const modal = document.getElementById('employeeProposalModal');
    if (!modal) return;
    const title = document.getElementById('employeeProposalTitle');
    if (title) title.textContent = viewOnly ? 'Visualizar Proposta' : 'Editar Proposta';
    const editBlock = document.getElementById('empPropEditFields');
    if (editBlock) editBlock.style.display = viewOnly ? 'none' : '';
    const saveBtn = document.getElementById('empPropSaveBtn');
    if (saveBtn) saveBtn.style.display = viewOnly ? 'none' : '';
    const cancelBtn = document.getElementById('empPropCancelBtn');
    if (cancelBtn) cancelBtn.textContent = viewOnly ? 'Fechar' : 'Cancelar';
    modal.querySelectorAll('#empPropEditFields input, #empPropEditFields select, #empPropEditFields textarea, .prop-client-field').forEach(el => {
      if (el.type === 'file' && viewOnly) { el.disabled = true; return; }
      if (el.type === 'file' && !viewOnly) { el.disabled = false; return; }
      if (viewOnly) {
        if (el.tagName === 'SELECT') el.disabled = true;
        else el.readOnly = true;
      } else {
        el.disabled = false;
        el.readOnly = false;
      }
    });
  },

  openEmployeeViewModal: function(id) {
    return this.openEmployeeModal(id, true);
  },

  openEmployeeModal: async function(id, viewOnly) {
    // Token invalida carga antiga — permite abrir outra proposta sem F5
    const token = (this._modalLoadToken = (this._modalLoadToken || 0) + 1);
    this._openModalBusy = true;
    viewOnly = !!viewOnly;
    const user = Auth.getSession();
    if (!user?.id) { this._openModalBusy = false; return; }

    /* Pendência vencida: só visualização — não edita proposta. */
    if (!viewOnly && typeof window.EsteiraPendencias?.assertCanEditProposals === 'function') {
      const ok = await window.EsteiraPendencias.assertCanEditProposals();
      if (!ok) {
        this._openModalBusy = false;
        return this.openEmployeeModal(id, true);
      }
    }

    const modal = document.getElementById('employeeProposalModal');
    this._applyEmployeeModalMode(viewOnly);
    if (typeof openModal === 'function') openModal('employeeProposalModal');
    else modal?.classList.add('open');

    const attEl = document.getElementById('empPropAttachments');
    const histEl = document.getElementById('empPropHistoryList');
    if (attEl) attEl.innerHTML = '<p style="color:var(--color-text-muted);font-size:13px;">Carregando anexos...</p>';
    if (histEl) histEl.innerHTML = '<p style="color:var(--color-text-muted);">Carregando...</p>';

    if (typeof showLoading === 'function') showLoading('Carregando proposta...');

    try {
      const raw = await DB.getProposal(id, { lite: true });
      if (token !== this._modalLoadToken) return;
      const proposal = this._normProposal(raw);
      if (!proposal) {
        alert('Proposta não encontrada.');
        if (typeof closeModal === 'function') closeModal('employeeProposalModal');
        else modal?.classList.remove('open');
        return;
      }
      if (!this._ownsProposal(proposal, user)) {
        alert('Você só pode visualizar ou editar suas próprias propostas.');
        if (typeof closeModal === 'function') closeModal('employeeProposalModal');
        else modal?.classList.remove('open');
        return;
      }
      // Paga = somente leitura (evitar save que distorce filtros do dashboard).
      if (this._isProposalPaid(proposal)) {
        viewOnly = true;
        if (typeof showToast === 'function') showToast('Proposta paga: somente visualização (não salva).', 'info');
      }
      this._applyEmployeeModalMode(viewOnly);

      const cpf = String(proposal.clientCpf || '').replace(/\D/g, '');
      const client = cpf ? await this._lookupClientByCpf(cpf) : null;
      if (token !== this._modalLoadToken) return;

      const sv = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val ?? ''; };
      sv('empPropId', proposal.id);

      const detailEl = document.getElementById('empPropClientDetail');
      if (detailEl) {
        // CSS base é display:none — precisa da classe is-open (style='' voltava a esconder).
        detailEl.classList.add('is-open');
        detailEl.style.display = 'block';
        const needClientReq = !viewOnly && this._shouldRequireClientAddressAndBank();
        detailEl.classList.toggle('is-required', needClientReq);
        detailEl.innerHTML =
          '<strong style="display:block;margin-bottom:8px;">Dados cadastrais do cliente' +
          (needClientReq ? ' <span style="color:var(--color-danger);">*</span>' : '') +
          '</strong>' +
          (needClientReq
            ? '<p style="margin:0 0 10px;font-size:12px;color:var(--color-warning);font-weight:600;">Preencha endereço completo e conta (banco/agência/conta) para salvar.</p>'
            : '') +
          this._renderEditableClientDetail(client, proposal, { prefix: 'emp', editable: !viewOnly });
        // Reaplica readonly/liberação nos campos recém-criados.
        this._applyEmployeeModalMode(viewOnly);
      }

      const fmtR = v => v != null && v !== '' ? 'R$ ' + parseFloat(v).toLocaleString('pt-BR', {minimumFractionDigits:2}) : '—';
      const etapaLabel = this._vendorStage(proposal) ? this._labelEtapaVendedor(this._vendorStage(proposal)) : '';
      const infoEl = document.getElementById('empPropClientInfo');
      if (infoEl) {
        infoEl.innerHTML = `
          <strong>Cliente:</strong> ${this._escHtml(proposal.clientName)} (CPF: ${this._escHtml(proposal.clientCpf)})<br>
          <strong>Produto:</strong> ${this._escHtml(proposal.product || '—')} / ${this._escHtml(proposal.convenio || '—')} / ${this._escHtml(proposal.entidade || '—')}<br>
          <strong>Nº Proposta:</strong> ${this._escHtml(proposal.numero || '—')} &nbsp;|&nbsp;
          <strong>Valor:</strong> ${fmtR(proposal.valor)} &nbsp;|&nbsp;
          <strong>Valor Final:</strong> <span style="color:var(--color-success);font-weight:700;">${fmtR(proposal.valorFinal)}</span><br>
          ${proposal.protocolo ? `<strong>Nº Protocolo:</strong> ${this._escHtml(proposal.protocolo)}<br>` : ''}
          ${etapaLabel ? `<strong>Situação:</strong> ${this._escHtml(etapaLabel)}<br>` : ''}
          <strong>Status:</strong> ${this._escHtml(proposal.status || '—')}<br>
          ${proposal.bancoDigitado ? `<strong>Banco para digitação:</strong> ${this._escHtml(proposal.bancoDigitado)}<br>` : ''}
          ${proposal.tipoOperacao ? `<strong>Tipo de operação:</strong> ${this._escHtml(proposal.tipoOperacao)}<br>` : ''}
          <strong>Obs:</strong> ${this._escHtml(proposal.obs || '—')}
        `;
      }

      sv('empPropMatricula', proposal.matricula);
      sv('empPropSenhaCC', proposal.senhaContracheque);
      sv('empPropSenhaConsig', proposal.senhaConsignacao);
      this._fillProductSelect('empPropProduct', proposal.product);
      this._fillConvenioSelect('empPropConvenio', 'empPropEntidade', proposal.convenio);
      this._fillEntidadeSelect('empPropEntidade', proposal.convenio, proposal.entidade);
      this._initBankSelects({
        bancoDigitado: proposal.bancoDigitado,
        tipoOperacao: proposal.tipoOperacao,
      });
      const etapaSel = document.getElementById('empPropEtapa');
      if (etapaSel) {
        etapaSel.innerHTML = this._vendorSituacaoOptionsHtml(this._vendorStage(proposal));
        // Supervisor de vendedor: situação só leitura no modal do vendedor.
        const canChangeStatusEmpUi = this._canChangeProposalStatus(user?.role);
        etapaSel.disabled = !!viewOnly || !canChangeStatusEmpUi;
      } else {
        sv('empPropEtapa', this._vendorStage(proposal));
      }
      sv('empPropProtocolo', proposal.protocolo);
      sv('empPropObs', proposal.obs);

      const uploadSec = document.getElementById('empPropAnexosUpload');
      if (uploadSec) uploadSec.style.display = viewOnly ? 'none' : '';
      if (!viewOnly) {
        this._setFolderContext('empPropAnexosFolders', 'empProp');
        this.resetAnexoFolders(proposal.attachments);
        this._initStaticProposalSelects();
      }

      let histHtml = '';
      (proposal.history || []).forEach(h => {
        histHtml += `
          <div class="card" style="padding:12px;margin-bottom:10px;border-left:4px solid var(--color-primary);">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:13px;">
              <strong>${this._escHtml(h.actorName)}</strong>
              <span style="color:var(--color-text-muted)">${typeof formatDateTime === 'function' ? formatDateTime(h.date) : new Date(h.date).toLocaleString('pt-BR')}</span>
            </div>
            <div style="font-size:14px;"><strong>${this._escHtml(h.action)}</strong></div>
            ${h.note ? `<div style="margin-top:6px;font-size:14px;background:var(--color-surface-2);padding:8px;border-radius:4px;">${this._escHtml(h.note)}</div>` : ''}
          </div>`;
      });
      if (histEl) histEl.innerHTML = histHtml || '<p style="color:var(--color-text-muted);">Sem histórico.</p>';

      this._employeeEditCache[id] = { ...proposal };

      if (token !== this._modalLoadToken) return;
      if (typeof hideLoading === 'function') hideLoading();
      this._openModalBusy = false;

      /* Anexos em background — não bloquear o modal (mesmo padrão do chamado). */
      this._loadProposalAttachments(id, proposal, attEl, this._employeeEditCache[id]).catch((err) => {
        console.warn('[Proposals] anexos employee:', err);
      });
    } catch (e) {
      console.error(e);
      alert('Erro ao carregar proposta: ' + (e.message || 'tente novamente'));
      if (typeof closeModal === 'function') closeModal('employeeProposalModal');
      else modal?.classList.remove('open');
      if (typeof hideLoading === 'function') hideLoading();
      if (typeof unlockUiOverlays === 'function') unlockUiOverlays();
    } finally {
      if (token === this._modalLoadToken) {
        this._openModalBusy = false;
        if (typeof hideLoading === 'function') hideLoading();
      }
    }
  },

  employeeSave: async function() {
    const user = Auth.getSession();
    if (!user?.id) return;
    const gv = id => document.getElementById(id)?.value?.trim() || '';
    const id = gv('empPropId');
    let proposal = this._employeeEditCache[id] ? { ...this._employeeEditCache[id] } : await DB.getProposal(id);
    if (!proposal) return;
    if (!this._assertProposalNotPaidForSave(proposal)) return;
    if (!proposal.attachments || !this._hasProposalAttachments(proposal.attachments)) {
      if (!this._employeeEditCache[id]) {
        try {
          const attRow = typeof DB.getProposalAttachments === 'function'
            ? await DB.getProposalAttachments(id)
            : await DB.getProposal(id);
          if (attRow?.attachments) proposal.attachments = attRow.attachments;
        } catch (_) { /* noop */ }
      }
    }
    const norm = this._normProposal(proposal);
    if (!this._ownsProposal(norm, user)) {
      alert('Você só pode editar suas próprias propostas.');
      return;
    }

    const matricula = gv('empPropMatricula');
    const senhaCC = gv('empPropSenhaCC');
    const senhaConsig = gv('empPropSenhaConsig');
    const product = gv('empPropProduct');
    const etapa = gv('empPropEtapa');

    if (!this._assertClientAddressAndBank('emp', proposal)) return;

    const saveBtn = document.getElementById('empPropSaveBtn');
    const oldText = saveBtn?.innerText || 'Salvar';
    if (saveBtn) { saveBtn.innerText = 'Salvando...'; saveBtn.disabled = true; }

    proposal.matricula = matricula;
    proposal.senhaContracheque = senhaCC;
    proposal.senhaConsignacao = senhaConsig;
    proposal.product = this._normalizeProductValue(gv('empPropProduct'));
    proposal.convenio = this._normalizeConvenioKey(gv('empPropConvenio'));
    proposal.entidade = gv('empPropEntidade');
    proposal.protocolo = gv('empPropProtocolo');
    proposal.obs = gv('empPropObs');
    const oldBancoDigitado = String(proposal.bancoDigitado || proposal.banco_digitado || '').trim();
    const newBancoDigitado = String(gv('empPropBancoDigitado') || '').trim();
    const tipoOperacao = String(gv('empPropTipoOperacao') || '').trim()
      || String(this._normTipoOperacao(proposal) || '').trim();
    if (!newBancoDigitado) {
      alert('Selecione o Banco para digitação.');
      if (saveBtn) { saveBtn.innerText = oldText; saveBtn.disabled = false; }
      return;
    }
    if (!tipoOperacao) {
      alert('Selecione o Tipo de operação.');
      if (saveBtn) { saveBtn.innerText = oldText; saveBtn.disabled = false; }
      return;
    }
    proposal.bancoDigitado = newBancoDigitado;
    proposal.tipoOperacao = tipoOperacao;
    proposal.tipo_operacao = tipoOperacao;
    {
      const meta = (proposal.meta && typeof proposal.meta === 'object') ? { ...proposal.meta } : {};
      meta.tipo_operacao = tipoOperacao;
      proposal.meta = meta;
    }
    const bancoMudouPendencia = this._applyBancoChangePendencia(proposal, oldBancoDigitado, newBancoDigitado);
    const oldStatus = proposal.status;
    const oldStatusOp = proposal.statusOp || proposal.status_op || '';
    // Supervisor de vendedor: não aplica mudança de situação (só vendedor/backoffice+).
    const canChangeStatusEmp = this._canChangeProposalStatus(user?.role);
    if (bancoMudouPendencia) {
      /* status já setado em Pendenciado */
    } else if (canChangeStatusEmp && etapa) {
      proposal.statusOp = etapa;
      proposal.status = etapa;
    }
    this._syncProposalStatusFields(proposal);
    this._ensureDigitacaoTimestamp(proposal, oldStatus, oldStatusOp);

    this._setFolderContext('empPropAnexosFolders', 'empProp');
    try {
      proposal.attachments = await this._prepareAttachmentsForSave(id, proposal, 'empPropAnexosFolders');
    } catch (e) {
      console.error('[employeeSave] anexo', e);
      alert('Erro ao processar anexo: ' + (e.message || 'tente de novo. Arquivos muito grandes podem falhar no modo local.'));
      if (saveBtn) { saveBtn.innerText = oldText; saveBtn.disabled = false; }
      return;
    }

    proposal.history = proposal.history || [];
    let empAction = 'Proposta atualizada pelo vendedor';
    if (canChangeStatusEmp && etapa && String(etapa) !== String(oldStatusOp || oldStatus)) {
      empAction = `Status: [${oldStatusOp || oldStatus || '—'}] → [${etapa}]`;
    }
    const empHistEntry = {
      date: nowBrazilSql(),
      actorName: user.name,
      action: empAction,
      note: proposal.obs || ''
    };
    if (proposal._digitacaoAtMark) {
      empHistEntry.kind = 'digitacao';
      empHistEntry.date = proposal._digitacaoAtMark;
      delete proposal._digitacaoAtMark;
    }
    const wasPaidEmp = typeof DB !== 'undefined' && typeof DB.isPaidProposal === 'function'
      ? DB.isPaidProposal({ status: oldStatus, statusOp: oldStatusOp, status_op: oldStatusOp })
      : String(oldStatus || '').toUpperCase().includes('PAGO');
    const isPaidEmp = typeof DB !== 'undefined' && typeof DB.isPaidProposal === 'function'
      ? DB.isPaidProposal(proposal)
      : String(etapa || proposal.status || '').toUpperCase().includes('PAGO');
    if (!wasPaidEmp && isPaidEmp) {
      empHistEntry.kind = 'paid';
      proposal._billingPaidAt = empHistEntry.date;
      proposal._billingPaidBy = user.name;
    }
    proposal.history.push(empHistEntry);

    if (typeof showLoading === 'function') showLoading('Salvando proposta…');
    const saveT0 = Date.now();
    try {
      await this._saveProposalClientData(proposal, 'emp');
      const tClient = Date.now();
      await DB.saveProposal(proposal, { skipHydrate: true });
      void this._notifyBoletoValidadoWebhook(proposal, oldStatus, oldStatusOp);
      if (isPaidEmp && typeof DB?.deactivateBoletoRemindersForProposal === 'function') {
        void DB.deactivateBoletoRemindersForProposal(proposal.id);
      }
      this._propPerfLog('proposals.js:employeeSave', 'save done', {
        msTotal: Date.now() - saveT0, msClient: tClient - saveT0, msDb: Date.now() - tClient,
      }, 'C');
      if (typeof SalesRanking !== 'undefined' && SalesRanking.invalidateCache) SalesRanking.invalidateCache();
      delete this._employeeEditCache[id];
      if (typeof showToast === 'function') {
        showToast(
          bancoMudouPendencia
            ? 'Banco alterado — proposta colocada em Pendenciado.'
            : 'Proposta atualizada!',
          bancoMudouPendencia ? 'warning' : 'success',
          bancoMudouPendencia ? 7000 : 4000
        );
      }
      else alert(bancoMudouPendencia
        ? 'Banco alterado — proposta colocada em Pendenciado.'
        : 'Proposta atualizada!');
      closeModal('employeeProposalModal');
      void this.renderEmployeeList();
    } catch (e) {
      console.error('[employeeSave]', e);
      this._proposalSaveErrorNotify(e);
    } finally {
      if (typeof hideLoading === 'function') hideLoading();
      if (saveBtn) { saveBtn.innerText = oldText; saveBtn.disabled = false; }
    }
  },

  openAdminViewModal: function(id) {
    const role = this._normProposalManageRole(typeof Auth !== 'undefined' && Auth.getSession()?.role);
    if (this._canEditNumeroValor(role)) {
      return this.openAdminModal(id, false);
    }
    return this.openAdminModal(id, true);
  },

  _applyManageModalMode: function(viewOnly, opts = {}) {
    const modal = document.getElementById('manageProposalModal');
    if (!modal) return;

    const canEditValor = opts.canEditValor !== false;
    const valorOnlyMode = !!opts.valorOnlyMode;
    const role = this._normProposalManageRole(typeof Auth !== 'undefined' && Auth.getSession()?.role);
    const canEditTabela = (opts.canEditTabela != null)
      ? !!opts.canEditTabela
      : this._canEditTabelaComissao(role, { paid: valorOnlyMode });
    const canChangeStatus = (opts.canChangeStatus != null)
      ? !!opts.canChangeStatus
      : (this._canChangeProposalStatus(role) && !valorOnlyMode);
    const canPickVendor = this._canPickVendor(role);
    const valorFieldIds = new Set(['managePropValorBruto', 'managePropValorEdit', 'managePropNumeroEdit']);
    const tabelaFieldIds = new Set(['managePropTabela']);
    const statusFieldIds = new Set(['managePropStatusOp', 'managePropStatus']);
    if (modal.dataset) modal.dataset.valorOnlySave = valorOnlyMode ? '1' : '';

    const title = document.getElementById('manageProposalTitle');
    if (title) {
      title.textContent = valorOnlyMode
        ? (canEditTabela
          ? 'Corrigir Nº, Valor e Tabela (proposta paga)'
          : 'Corrigir Nº e Valor (proposta paga)')
        : (viewOnly ? 'Visualizar Proposta' : 'Atualizar Proposta');
    }

    const readonlyIds = new Set(['managePropValorFinalCalc']);
    if ((!canEditValor || viewOnly) && !valorOnlyMode) {
      readonlyIds.add('managePropValorBruto');
      readonlyIds.add('managePropValorEdit');
      readonlyIds.add('managePropNumeroEdit');
    }
    if (viewOnly && !valorOnlyMode) {
      readonlyIds.add('managePropTabela');
    } else if (!canEditTabela && !valorOnlyMode) {
      readonlyIds.add('managePropTabela');
    }

    const body = modal.querySelector('.modal-body');
    if (body) {
      body.querySelectorAll('input, select, textarea').forEach(el => {
        if (el.type === 'hidden') return;
        const id = el.id || '';
        // Select de vendedor: gerente+ continua editável mesmo em proposta paga (valorOnly).
        if (id === 'managePropVendor' && canPickVendor && (!viewOnly || valorOnlyMode)) {
          el.disabled = false;
          el.readOnly = false;
          return;
        }
        // Status: supervisor de vendedor não altera; backoffice/gerente etc. sim.
        if (statusFieldIds.has(id)) {
          const lockStatus = viewOnly || valorOnlyMode || !canChangeStatus;
          if (el.tagName === 'SELECT') el.disabled = lockStatus;
          else el.readOnly = lockStatus;
          return;
        }
        if (valorOnlyMode) {
          const canEditField = valorFieldIds.has(id)
            || (canEditTabela && tabelaFieldIds.has(id));
          if (el.tagName === 'SELECT') el.disabled = !canEditField;
          else el.readOnly = !canEditField;
          return;
        }
        if (viewOnly) {
          if (el.tagName === 'SELECT') el.disabled = true;
          else el.readOnly = true;
        } else {
          if (id === 'managePropTabela' && el.tagName === 'SELECT') {
            el.disabled = !canEditTabela;
            el.readOnly = false;
            return;
          }
          el.disabled = false;
          el.readOnly = readonlyIds.has(id);
        }
      });
    }

    if (viewOnly && !valorOnlyMode) {
      document.querySelectorAll('.backoffice-edit-block').forEach(el => { el.style.display = 'none'; });
      const vb = document.getElementById('managePropVendorBlock');
      if (vb) vb.style.display = 'none';
    } else if (canEditValor || valorOnlyMode) {
      document.querySelectorAll('.backoffice-edit-block').forEach(el => { el.style.display = ''; });
    }

    // Garante bloco de vendedor visível quando o perfil pode trocar (inclui proposta paga).
    const vendorBlock = document.getElementById('managePropVendorBlock');
    if (vendorBlock) {
      vendorBlock.style.display = (canPickVendor && (!viewOnly || valorOnlyMode)) ? '' : 'none';
    }

    this._unlockManageValorFields((canEditValor && !viewOnly) || valorOnlyMode);

    const saveBtn = modal.querySelector('.modal-footer .btn-primary');
    if (saveBtn) saveBtn.style.display = (viewOnly && !valorOnlyMode) ? 'none' : '';
    const cancelBtn = modal.querySelector('.modal-footer .btn-ghost');
    if (cancelBtn) cancelBtn.textContent = viewOnly ? 'Fechar' : 'Cancelar';
    const delBtn = document.getElementById('managePropDeleteBtn');
    if (delBtn) delBtn.style.display = (!viewOnly && this._canDeleteProposal()) ? '' : 'none';
  },

    openAdminModal: async function(id, viewOnly) {
    // Token invalida carga antiga — permite abrir outra proposta sem F5
    const token = (this._modalLoadToken = (this._modalLoadToken || 0) + 1);
    this._openModalBusy = true;
    viewOnly = !!viewOnly;
    const modal = document.getElementById('manageProposalModal');
    const attEl = document.getElementById('managePropAttachments');
    if (attEl) attEl.innerHTML = '<p style="color:var(--color-text-muted);font-size:13px;">Carregando anexos...</p>';
    if (typeof showLoading === 'function') showLoading('Carregando proposta...');

    try {
    const raw = await DB.getProposal(id, { lite: true });
    if (token !== this._modalLoadToken) return;
    const proposal = this._normProposal(raw);
    if (!proposal) {
      alert('Proposta não encontrada.');
      return;
    }

    // Paga: backoffice+ corrige só nº/valor (preserveUpdatedAt — não mexe na data do dashboard).
    // Supervisor de vendedor NÃO edita tabela em pagas.
    let valorOnlyMode = false;
    const roleEarly = this._normProposalManageRole(Auth.getSession()?.role);
    const canFixPaidValor = this._canEditNumeroValor(roleEarly);
    if (this._isProposalPaid(proposal)) {
      if (canFixPaidValor) {
        valorOnlyMode = true;
        viewOnly = false;
        const canFixTabela = this._canEditTabelaComissao(roleEarly, { paid: true });
        if (typeof showToast === 'function') {
          showToast(
            canFixTabela
              ? 'Proposta paga: corrija número, valor e tabela nos blocos verde/azul e salve.'
              : 'Proposta paga: corrija número e valor no bloco verde e salve.',
            'info',
            7000
          );
        }
      } else {
        viewOnly = true;
        if (typeof showToast === 'function') showToast('Proposta paga: somente visualização (não salva).', 'info');
      }
    }

    if (typeof window !== 'undefined' && window.PARTNER_ROOT_ID && !this._isSoubluProposalAdmin()) {
      const belongs = await this._proposalBelongsToSessionPartnerOrg(proposal);
      const canManage = this._canPartnerManageProposals();
      if (!belongs) viewOnly = true;
      else if (!canManage) viewOnly = true;
    }

    const sv = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ''; };

    sv('managePropId', proposal.id);

    const user = Auth.getSession();
    const role = this._normProposalManageRole(user?.role);
    const canEditProp = this._canEditNumeroValor(role);
    const canPickVendor = this._canPickVendor(role);

    document.querySelectorAll('.backoffice-edit-block').forEach(el => {
      el.style.display = canEditProp ? '' : 'none';
    });

    const vendorBlock = document.getElementById('managePropVendorBlock');
    if (vendorBlock) vendorBlock.style.display = canPickVendor ? '' : 'none';

    if (canPickVendor) {
      const vendorSel = document.getElementById('managePropVendor');
      if (vendorSel) {
        // Usar escopo mesclado (Ana Bela / Viviane) — não só session.id
        const scopeAdmin = await this._proposalVendorScopeForSession(user);
        if (token !== this._modalLoadToken) return;
        let vendors = await DB.getVendorsForSelect(scopeAdmin).catch(() => []);
        if (token !== this._modalLoadToken) return;

        const vid = proposal.vendorId || proposal.employee_id || '';
        if (vid && !vendors.some(v => v.id === vid)) {
          const current = await DB.getUser(vid).catch(() => null);
          if (token !== this._modalLoadToken) return;
          if (current) vendors = [current, ...vendors];
        }

        vendors.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        vendorSel.innerHTML = vendors.length
          ? vendors.map(v => `<option value="${v.id}">${v.name || v.email || v.id}</option>`).join('')
          : '<option value="">Nenhum vendedor encontrado</option>';
        if (vid && vendors.some(v => v.id === vid)) vendorSel.value = vid;
        else if (vendors.length) vendorSel.selectedIndex = 0;
      }
    }
    if (token !== this._modalLoadToken) return;
    sv('managePropNumeroEdit', proposal.numero);
    this._syncManageValorFields(proposal.valor);
    this._bindManageValorInputs();

    const client = proposal.clientCpf ? await this._lookupClientByCpf(String(proposal.clientCpf).replace(/\D/g, '')) : null;
    if (token !== this._modalLoadToken) return;
    const detailEl = document.getElementById('managePropClientDetail');
    if (detailEl) {
      detailEl.style.display = 'block';
      detailEl.innerHTML = '<strong style="display:block;margin-bottom:8px;">Dados cadastrais do cliente</strong>' +
        this._renderManageClientDetail(client, proposal, !viewOnly);
    }

    const fmtR = v => v != null && v !== '' ? 'R$ ' + parseFloat(v).toLocaleString('pt-BR', {minimumFractionDigits:2}) : '—';
    let clientInfo = `
      <strong>Cliente:</strong> ${proposal.clientName} (CPF: ${proposal.clientCpf})<br>
      <strong>Vendedor:</strong> ${canPickVendor ? '<span id="managePropVendorName">' + (proposal.vendorName || '—') + '</span>' : (proposal.vendorName || '—')}<br>
      <strong>Produto:</strong> ${proposal.product || '—'} / ${proposal.convenio || '—'} / ${proposal.entidade || '—'}<br>
      <strong>Nº Proposta:</strong> ${proposal.numero || '—'} &nbsp;|&nbsp;
      <strong>Valor Bruto:</strong> ${fmtR(proposal.valor)} &nbsp;|&nbsp;
      <strong>Tabela:</strong> ${proposal.tabela
        ? `<span style="background:#3b82f620;color:#3b82f6;padding:1px 7px;border-radius:99px;font-weight:700;">${this._tabelaLabel(proposal.tabela)}</span>`
        : `<span style="background:#f59e0b20;color:#f59e0b;padding:1px 7px;border-radius:99px;font-weight:700;">⏳ Aguardando análise</span>`}
      &nbsp;|&nbsp;
      <strong>Valor Final:</strong> <span style="color:var(--color-success);font-weight:700;">${proposal.tabela ? fmtR(proposal.valorFinal) : '—'}</span><br>
      ${proposal.matricula ? `<strong>Matrícula:</strong> ${proposal.matricula} &nbsp;|&nbsp; <strong>Senha Contracheque:</strong> ${proposal.senhaContracheque || '—'} &nbsp;|&nbsp; <strong>Senha Consignação:</strong> ${proposal.senhaConsignacao || '—'}<br>` : ''}
      ${proposal.protocolo ? `<strong>Nº Protocolo:</strong> ${proposal.protocolo}<br>` : ''}
      ${proposal.bancoComprado ? `<strong>Banco comprado:</strong> ${proposal.bancoComprado}<br>` : ''}
      ${proposal.bancoDigitado ? `<strong>Banco para digitação:</strong> ${proposal.bancoDigitado}<br>` : ''}
      ${proposal.tipoOperacao ? `<strong>Tipo de operação:</strong> ${proposal.tipoOperacao}<br>` : ''}
      ${this._vendorStage(proposal) ? `<strong>Situação (vendedor):</strong> ${this._labelEtapaVendedor(this._vendorStage(proposal))}<br>` : ''}
      <strong>Obs:</strong> ${proposal.obs || '—'}
    `;
    const infoEl = document.getElementById('managePropClientInfo');
    if (infoEl) infoEl.innerHTML = clientInfo;

    // Seção Tabela/Financeiro
    const fmtRaw = v => v != null && v !== '' ? 'R$ ' + parseFloat(v).toLocaleString('pt-BR',{minimumFractionDigits:2}) : '';
    const brutoEl = document.getElementById('managePropValorBruto');
    if (brutoEl && !canEditProp) brutoEl.value = fmtRaw(proposal.valor);
    this._fillTabelaSelect('managePropTabela', proposal.tabela || '');
    // dispara cálculo visual
    setTimeout(() => this.calcAdminValorFinal(), 50);

    sv('managePropDivida', proposal.compraDivida);
    this._initBankSelects({
      bancoComprado: proposal.bancoComprado,
      bancoDigitado: proposal.bancoDigitado,
      tipoOperacao: this._normTipoOperacao(proposal),
    });
    sv('managePropBoleto', proposal.solicitouBoleto || proposal.solicitacaoBoleto);
    sv('managePropValor', proposal.valor);
    sv('managePropProtocolo', proposal.protocolo);
    sv('managePropDataSol', this._cleanProposalDate(proposal.dataSolicitacao));
    sv('managePropBacen', proposal.bacen);
    sv('managePropProtBacen', proposal.protocoloBacen);
    sv('managePropDataBacen', this._cleanProposalDate(proposal.dataSolicitacaoBacen));
    sv('managePropAssinou', proposal.assinou);
    const statusUnified = String(proposal.statusOp || proposal.status_op || proposal.status || '').trim();
    const opEl = document.getElementById('managePropStatusOp');
    if (opEl) {
      opEl.innerHTML = this._vendorSituacaoOptionsHtml(statusUnified);
      opEl.value = statusUnified;
    }
    this._bindManageStatusSync();
    sv('managePropPosVenda', proposal.posVenda);
    sv('managePropNuvidio', proposal.nuvidio);
    sv('managePropFases', proposal.fases);
    sv('managePropHistoryNote', '');

    let histHtml = '';
    if (proposal.history) {
      proposal.history.forEach(h => {
        histHtml += `
          <div class="card" style="padding: 12px; margin-bottom: 10px; border-left: 4px solid var(--color-primary);">
            <div style="display:flex; justify-content:space-between; margin-bottom: 4px; font-size: 13px;">
              <strong>${h.actorName}</strong>
              <span style="color:var(--color-text-muted)">${typeof formatDateTime === 'function' ? formatDateTime(h.date) : new Date(h.date).toLocaleString('pt-BR')}</span>
            </div>
            <div style="font-size:14px;"><strong>${h.action}</strong></div>
            ${h.note ? `<div style="margin-top: 6px; font-size:14px; background: var(--color-surface-2); padding: 8px; border-radius: 4px;">${h.note}</div>` : ''}
          </div>
        `;
      });
    }
    document.getElementById('managePropHistoryList').innerHTML = histHtml;

    this._adminEditCache[id] = { ...proposal };
    const adminUploadSec = document.getElementById('managePropAnexosUpload');
    if (adminUploadSec) adminUploadSec.style.display = viewOnly ? 'none' : '';
    if (!viewOnly) {
      this._setFolderContext('managePropAnexosFolders', 'manageProp');
      this.resetAnexoFolders(proposal.attachments);
    }
    this._applyManageModalMode(viewOnly, {
      canEditValor: canEditProp,
      valorOnlyMode,
      canEditTabela: this._canEditTabelaComissao(role, { paid: valorOnlyMode || this._isProposalPaid(proposal) }),
      canChangeStatus: this._canChangeProposalStatus(role) && !valorOnlyMode,
    });
    this._ensureSupBackofficeDateUi('manageProp');
    this._resetSupBackofficeDateUi('manageProp', proposal);
    if (token !== this._modalLoadToken) return;
    if (typeof openModal === 'function') openModal('manageProposalModal');
    else modal?.classList.add('open');
    if (typeof hideLoading === 'function') hideLoading();
    this._openModalBusy = false;

    this._loadProposalAttachments(id, proposal, attEl, this._adminEditCache[id]).catch((err) => {
      console.warn('[Proposals] anexos admin:', err);
    });
    } catch (e) {
      console.error(e);
      alert('Erro ao carregar proposta: ' + (e.message || 'tente novamente'));
      if (typeof closeModal === 'function') closeModal('manageProposalModal');
      else modal?.classList.remove('open');
      if (typeof hideLoading === 'function') hideLoading();
      if (typeof unlockUiOverlays === 'function') unlockUiOverlays();
    } finally {
      if (token === this._modalLoadToken) {
        this._openModalBusy = false;
        if (typeof hideLoading === 'function') hideLoading();
      }
    }
  },

  /**
   * _adminSaveValorOnlyPaid — correção de nº/valor (e vendedor, se permitido) em proposta já paga.
   * Usa preserveUpdatedAt para não alterar a data no dashboard de faturamento.
   * Gerente+ pode trocar o vendedor mesmo neste modo — o status da proposta não muda.
   */
  _adminSaveValorOnlyPaid: async function(proposal, user, gv) {
    const id = proposal.id;
    const origVendorId = String(proposal.vendorId || proposal.vendor_id || proposal.employee_id || '').trim();
    const origVendorName = String(proposal.vendorName || proposal.vendor_name || '').trim();
    const orig = {
      valor: proposal.valor,
      numero: proposal.numero,
      tabela: proposal.tabela,
      valorFinal: proposal.valorFinal,
      vendorId: origVendorId,
      vendorName: origVendorName,
    };
    const saveBtn = document.querySelector('#manageProposalModal .btn-primary[onclick*="adminSave"], #manageProposalModal button[onclick*="adminSave"]');
    const saveBtnText = saveBtn?.innerText;
    if (typeof showLoading === 'function') showLoading('Salvando correção…');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerText = 'Salvando…'; }
    try {
      const rolePaid = this._normProposalManageRole(user?.role);
      let vendorChanged = false;
      // Gerente+ grava troca de vendedor também em proposta paga (UI já libera o select).
      if (this._canPickVendor(rolePaid)) {
        const vendorSel = document.getElementById('managePropVendor');
        if (vendorSel && vendorSel.value) {
          const newVid = String(vendorSel.value || '').trim();
          const opt = vendorSel.options[vendorSel.selectedIndex];
          const newName = opt ? String(opt.textContent || '').trim() : '';
          if (newVid && newVid !== origVendorId) {
            proposal.vendorId = newVid;
            proposal.vendor_id = newVid;
            proposal.employee_id = newVid;
            if (newName) {
              proposal.vendorName = newName;
              proposal.vendor_name = newName;
            }
            vendorChanged = true;
          }
        }
      }

      const novoNumero = String(gv('managePropNumeroEdit') || '').trim();
      const parsedValor = this._readManageValorInput();
      // Backoffice pode trocar nº/valor/tabela livremente (inclui baixar valor).
      if (novoNumero) proposal.numero = novoNumero;
      if (!isNaN(parsedValor) && parsedValor >= 0) proposal.valor = parsedValor;
      const tabelaEl = document.getElementById('managePropTabela');
      if (tabelaEl && this._canEditTabelaComissao(rolePaid, { paid: true })) {
        this._applyTabelaToProposal(proposal, String(tabelaEl.value || '').trim());
      } else if (!isNaN(parsedValor) && parsedValor >= 0 && proposal.tabela) {
        this._applyTabelaToProposal(proposal, proposal.tabela);
      } else if (!isNaN(parsedValor) && parsedValor >= 0 && !proposal.tabela) {
        proposal.valorFinal = Number(proposal.valor) || 0;
        proposal.desconto = 0;
      }
      const changed = vendorChanged
        || proposal.valor !== orig.valor
        || proposal.numero !== orig.numero
        || proposal.tabela !== orig.tabela
        || Number(proposal.valorFinal) !== Number(orig.valorFinal);
      if (!changed) {
        this._notifyOverModal(
          'Nenhuma alteração em número/valor/tabela/vendedor. Em proposta paga o status não é salvo por este botão.',
          'warning'
        );
        return;
      }
      proposal.history = Array.isArray(proposal.history) ? proposal.history.slice() : [];
      const noteParts = [];
      if (proposal.valor !== orig.valor) noteParts.push(`Valor: ${orig.valor} → ${proposal.valor}`);
      if (orig.numero !== proposal.numero) noteParts.push(`Nº: ${orig.numero || '—'} → ${proposal.numero}`);
      if (orig.tabela !== proposal.tabela) noteParts.push(`Tabela: ${orig.tabela || '—'} → ${proposal.tabela}`);
      if (vendorChanged) noteParts.push(`Vendedor: ${orig.vendorName || orig.vendorId || '—'} → ${proposal.vendorName || proposal.vendorId}`);
      const actionLabel = vendorChanged && noteParts.length === 1
        ? 'Troca de vendedor (proposta paga)'
        : (orig.tabela !== proposal.tabela
          ? 'Correção de valor/nº/tabela (proposta paga)'
          : (vendorChanged
            ? 'Correção de valor/nº/vendedor (proposta paga)'
            : 'Correção de valor/nº (proposta paga)'));
      proposal.history.push({
        date: typeof nowBrazilSql === 'function' ? nowBrazilSql() : new Date().toISOString(),
        actorName: user?.name || 'Sistema',
        action: actionLabel,
        note: noteParts.join(' · ') || actionLabel,
        kind: vendorChanged && noteParts.length === 1 ? 'vendor_fix_paid' : 'valor_fix_paid',
      });
      const saved = await this._withTimeout(
        DB.saveProposal(proposal, { skipHydrate: true, preserveUpdatedAt: true }),
        45000,
        'Salvar correção de valor',
      );
      const merged = saved ? (this._normProposal({ ...proposal, ...saved }) || { ...proposal, ...saved }) : proposal;
      delete this._adminEditCache[id];
      this._mergeAdminListCacheRow(merged);
      const okMsg = vendorChanged && noteParts.length === 1
        ? 'Vendedor atualizado com sucesso!'
        : (vendorChanged ? 'Valor/vendedor atualizados com sucesso!' : 'Valor atualizado com sucesso!');
      if (typeof showToast === 'function') showToast(okMsg, 'success');
      else alert(okMsg);
      if (typeof closeModal === 'function') closeModal('manageProposalModal');
      else {
        const modal = document.getElementById('manageProposalModal');
        if (modal) modal.classList.remove('open');
      }
      if (!this._patchAdminTableRow(merged)) {
        void this.renderAdminList({ soft: true, fromCache: !!this._adminListCache });
      }
    } catch (e) {
      console.error('[adminSaveValorOnly]', e);
      this._proposalSaveErrorNotify(e);
    } finally {
      if (typeof hideLoading === 'function') hideLoading();
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerText = saveBtnText || 'Salvar'; }
    }
  },

  adminSave: async function() {
    const _dbg = (hypothesisId, message, data) => {
};
    const user = Auth.getSession();
    const gv = id => document.getElementById(id)?.value || '';
    const id = gv('managePropId');
    _dbg('S0', 'adminSave entry', {
      id: String(id || '').slice(0, 24),
      role: String(user?.role || ''),
      statusUi: gv('managePropStatus'),
      statusOpUi: gv('managePropStatusOp'),
      tabelaUi: gv('managePropTabela'),
      valorOnly: document.getElementById('manageProposalModal')?.dataset?.valorOnlySave || '',
    });
    let proposal = this._adminEditCache[id] ? { ...this._adminEditCache[id] } : await DB.getProposal(id);
    if (!proposal) {
      const msg = 'Proposta não encontrada. Feche o modal e abra novamente.';
      _dbg('S1', 'proposal missing', { id: String(id || '').slice(0, 24) });
      if (typeof showToast === 'function') showToast(msg, 'error');
      else alert(msg);
      return;
    }
    proposal = this._normProposal(proposal) || proposal;
    const roleNorm = this._normProposalManageRole(user?.role);
    const valorOnlySave = document.getElementById('manageProposalModal')?.dataset?.valorOnlySave === '1';
    if (valorOnlySave && this._canEditNumeroValor(roleNorm)) {
      _dbg('S2', 'route valorOnlyPaid (status NÃO será salvo)', {
        id: String(id || '').slice(0, 24),
        status: proposal.status,
        statusOp: proposal.statusOp || proposal.status_op,
      });
      return this._adminSaveValorOnlyPaid(proposal, user, gv);
    }
    if (!this._assertProposalNotPaidForSave(proposal)) {
      _dbg('S3', 'blocked already-paid assert', {
        id: String(id || '').slice(0, 24),
        status: proposal.status,
        statusOp: proposal.statusOp || proposal.status_op,
      });
      return;
    }
    if (typeof window !== 'undefined' && window.PARTNER_ROOT_ID && !this._isSoubluProposalAdmin()) {
      const belongs = await this._proposalBelongsToSessionPartnerOrg(proposal);
      if (!belongs) {
        const msg = 'Propostas internas SOU+BLU são somente leitura para a rede parceira.';
        if (typeof showToast === 'function') showToast(msg, 'warning');
        else alert(msg);
        return;
      }
      if (!this._canPartnerManageProposals()) {
        const msg = 'Sem permissão para editar propostas nesta rede parceira.';
        if (typeof showToast === 'function') showToast(msg, 'warning');
        else alert(msg);
        return;
      }
    }
    if (typeof showLoading === 'function') showLoading('Salvando…', { maxMs: 65000 });
    const saveBtn = document.querySelector('#manageProposalModal .btn-primary[onclick*="adminSave"], #manageProposalModal button[onclick*="adminSave"]');
    const saveBtnText = saveBtn?.innerText;
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerText = 'Salvando…'; }
    const releaseSaveUi = () => {
      if (typeof hideLoading === 'function') hideLoading();
      if (saveBtn) {
        saveBtn.disabled = false;
        if (saveBtnText) saveBtn.innerText = saveBtnText;
      }
    };
    try {
    /* Contexto ANTES de detectar uploads — senão defs/prefixo de outro modal
       fazem pendingAtt=false e o save apaga/ignora os boletos anexados. */
    this._setFolderContext('managePropAnexosFolders', 'manageProp');
    const pendingAtt = this._hasPendingAnexoUploads('managePropAnexosFolders');
    if (pendingAtt && (!proposal.attachments || !this._hasProposalAttachments(proposal.attachments))) {
      if (!this._adminEditCache[id]) {
        try {
          const attRow = typeof DB.getProposalAttachments === 'function'
            ? await DB.getProposalAttachments(id)
            : await DB.getProposal(id);
          if (attRow?.attachments) proposal.attachments = attRow.attachments;
        } catch (_) { /* noop */ }
      }
    }

    const role = roleNorm;

    // Vendedor responsável — troca grava history (passar venda para outro).
    if (this._canPickVendor(role)) {
      const vendorSel = document.getElementById('managePropVendor');
      if (vendorSel && vendorSel.value) {
        const prevVid = String(proposal.vendorId || proposal.vendor_id || proposal.employee_id || '').trim();
        const prevName = String(proposal.vendorName || proposal.vendor_name || '').trim();
        const newVid = String(vendorSel.value || '').trim();
        const opt = vendorSel.options[vendorSel.selectedIndex];
        const newName = opt ? String(opt.textContent || '').trim() : '';
        proposal.vendorId = newVid;
        proposal.vendor_id = newVid;
        proposal.employee_id = newVid;
        if (newName) {
          proposal.vendorName = newName;
          proposal.vendor_name = newName;
        }
        if (newVid && newVid !== prevVid) {
          proposal.history = Array.isArray(proposal.history) ? proposal.history.slice() : [];
          proposal.history.push({
            date: typeof nowBrazilSql === 'function' ? nowBrazilSql() : new Date().toISOString(),
            actorName: user?.name || 'Sistema',
            action: 'Troca de vendedor',
            note: `Vendedor: ${prevName || prevVid || '—'} → ${newName || newVid}`,
            kind: 'vendor_transfer',
          });
        }
      }
    }

    // ── Nº e Valor — backoffice pode trocar livremente ──
    if (this._canEditNumeroValor(role)) {
      const novoNumero = String(gv('managePropNumeroEdit') || '').trim();
      const parsedValor = this._readManageValorInput();
      if (novoNumero) proposal.numero = novoNumero;
      if (!isNaN(parsedValor) && parsedValor >= 0) {
        proposal.valor = parsedValor;
        if (!proposal.tabela) proposal.valorFinal = proposal.valor;
      }
    }

    // ── Tabela / Valor Final ──
    const tabelaEl = document.getElementById('managePropTabela');
    const oldTabela = String(proposal.tabela || '').trim();
    let novaTabela = '';
    if (tabelaEl && this._canEditTabelaComissao(role, { paid: false })) {
      novaTabela = String(tabelaEl.value || '').trim();
      this._applyTabelaToProposal(proposal, novaTabela);
    } else if (this._canEditNumeroValor(role) && proposal.tabela) {
      // Sem permissão de tabela: ainda recalcula valorFinal com a tabela já gravada
      this._applyTabelaToProposal(proposal, proposal.tabela);
    } else if (this._canEditNumeroValor(role) && !proposal.tabela) {
      // Sem tabela definida: valor final = bruto (evita lixo antigo)
      proposal.valorFinal = Number(proposal.valor) || 0;
      proposal.desconto = 0;
    }

    proposal.compraDivida    = gv('managePropDivida');
    proposal.bancoComprado   = gv('managePropBanco');
    const oldBancoDigitado = String(proposal.bancoDigitado || proposal.banco_digitado || '').trim();
    const newBancoDigitado = String(gv('managePropBancoDigitado') || '').trim();
    proposal.bancoDigitado   = newBancoDigitado;
    const tipoOperacao = String(gv('managePropTipoOperacao') || '').trim();
    proposal.tipoOperacao = tipoOperacao || proposal.tipoOperacao || '';
    proposal.tipo_operacao = proposal.tipoOperacao;
    // Lite fetch pode omitir meta — só grava meta se o usuário setou tipo OU já havia meta
    if (tipoOperacao) {
      const meta = (proposal.meta && typeof proposal.meta === 'object') ? { ...proposal.meta } : {};
      meta.tipo_operacao = tipoOperacao;
      proposal.meta = meta;
    } else if (proposal.meta && typeof proposal.meta === 'object') {
      const meta = { ...proposal.meta };
      delete meta.tipo_operacao;
      proposal.meta = meta;
    }
    const bancoMudouPendencia = this._applyBancoChangePendencia(proposal, oldBancoDigitado, newBancoDigitado);
    proposal.solicitouBoleto = gv('managePropBoleto');
    proposal.protocolo       = gv('managePropProtocolo');
    proposal.dataSolicitacao = gv('managePropDataSol');
    proposal.bacen           = gv('managePropBacen');
    proposal.protocoloBacen  = gv('managePropProtBacen');
    proposal.dataSolicitacaoBacen = gv('managePropDataBacen');
    proposal.assinou         = gv('managePropAssinou');
    const oldStatus = proposal.status;
    const oldStatusOp = String(proposal.statusOp || proposal.status_op || '').trim();
    const cachedSnap = this._adminEditCache[id] || { status: oldStatus, statusOp: oldStatusOp };
    let newStatus = bancoMudouPendencia
      ? 'Pendenciado'
      : this._readManageStatusFromForm(gv, proposal, cachedSnap);
    let newStatusOp = newStatus;
    // Supervisor de vendedor: ignora mudança manual de status (mantém o atual).
    if (!bancoMudouPendencia && !this._canChangeProposalStatus(role)) {
      newStatus = oldStatus;
      newStatusOp = oldStatusOp || oldStatus;
    }

    // Endereço + conta: obrigatório só para vendedor (backoffice salva sem trava).
    if (!this._assertClientAddressAndBank('manage', proposal)) {
      releaseSaveUi();
      return;
    }

    // Bloqueia 1º PAGO sem tabela — evita “pagar” comissão no valor bruto
    {
      const preview = { status: newStatus, statusOp: newStatusOp, status_op: newStatusOp };
      const wasPaidGate = typeof DB !== 'undefined' && typeof DB.isPaidProposal === 'function'
        ? DB.isPaidProposal({ status: oldStatus, statusOp: oldStatusOp, status_op: oldStatusOp })
        : String(oldStatus || '').toUpperCase().includes('PAGO');
      const willBePaid = typeof DB !== 'undefined' && typeof DB.isPaidProposal === 'function'
        ? DB.isPaidProposal(preview)
        : String(newStatus || '').toUpperCase().includes('PAGO');
      if (!wasPaidGate && willBePaid && !String(proposal.tabela || '').trim()) {
        const msg = 'Defina a Tabela de comissão antes de marcar como PAGO.';
        _dbg('S4', 'blocked PAGO without tabela', {
          id: String(id || '').slice(0, 24),
          newStatus, newStatusOp, oldStatus, oldStatusOp,
        });
        this._notifyOverModal(msg, 'error');
        releaseSaveUi();
        return;
      }
    }

    _dbg('S5', 'status transition accepted', {
      id: String(id || '').slice(0, 24),
      oldStatus, oldStatusOp, newStatus, newStatusOp,
      tabela: String(proposal.tabela || '').slice(0, 40),
      pendingAtt: !!pendingAtt,
    });

    proposal.status = newStatus;
    proposal.statusOp = newStatusOp;
    proposal.status_op = newStatusOp;
    this._syncProposalStatusFields(proposal);
    this._ensureDigitacaoTimestamp(proposal, oldStatus, oldStatusOp);
    proposal.posVenda        = gv('managePropPosVenda');
    proposal.nuvidio         = gv('managePropNuvidio');
    proposal.fases           = gv('managePropFases');

    const note = gv('managePropHistoryNote');

    if (newStatus !== oldStatus || newStatusOp !== oldStatusOp || note || novaTabela) {
       proposal.history = proposal.history || [];
       let action = 'Atualização operacional';
       if (newStatus !== oldStatus) action = `Status: [${oldStatus}] → [${newStatus}]`;
       else if (newStatusOp && newStatusOp !== oldStatusOp) {
         action = `Status: [${oldStatusOp || oldStatus}] → [${newStatusOp}]`;
       }
       if (novaTabela && novaTabela !== oldTabela) {
         const pctLabel = Math.round((this._tabelaPct[novaTabela]??1)*100);
         action += ` | Tabela definida: ${novaTabela} (${pctLabel}%) → Valor Final: R$ ${proposal.valorFinal?.toLocaleString('pt-BR',{minimumFractionDigits:2})||'0,00'}`;
       }
       const histEntry = {
         date: nowBrazilSql(),
         actorName: user.name,
         action,
         note: note
       };
       if (proposal._digitacaoAtMark) {
         histEntry.kind = 'digitacao';
         histEntry.date = proposal._digitacaoAtMark;
         delete proposal._digitacaoAtMark;
       }
       const wasPaid = typeof DB !== 'undefined' && typeof DB.isPaidProposal === 'function'
         ? DB.isPaidProposal({ status: oldStatus, statusOp: oldStatusOp, status_op: oldStatusOp })
         : String(oldStatus || '').toUpperCase().includes('PAGO');
       const isPaidNow = typeof DB !== 'undefined' && typeof DB.isPaidProposal === 'function'
         ? DB.isPaidProposal(proposal)
         : String(newStatus || '').toUpperCase().includes('PAGO');
       if (!wasPaid && isPaidNow) {
         histEntry.kind = 'paid';
         proposal._billingPaidAt = histEntry.date;
         proposal._billingPaidBy = user.name;
       }
       proposal.history.push(histEntry);
    }

    if (pendingAtt) {
        try {
          proposal.attachments = await this._resolveAttachmentsForSaveQuick(id, proposal, 'managePropAnexosFolders');
        } catch (e) {
          console.error('[adminSave] anexo', e);
          throw e;
        }
      }

    const saveT0 = Date.now();
      const wasPaidBefore = typeof DB !== 'undefined' && typeof DB.isPaidProposal === 'function'
        ? DB.isPaidProposal({ status: oldStatus, statusOp: oldStatusOp, status_op: oldStatusOp })
        : String(oldStatus || '').toUpperCase() === 'PAGO';
      const isPaidAfter = typeof DB !== 'undefined' && typeof DB.isPaidProposal === 'function'
        ? DB.isPaidProposal(proposal)
        : String(newStatus || '').toUpperCase() === 'PAGO';
      const becamePaid = !wasPaidBefore && isPaidAfter;
      if (becamePaid) {
        if (!proposal._billingPaidAt) {
          proposal._billingPaidAt = nowBrazilSql();
          proposal._billingPaidBy = user.name;
        }
        if (typeof DB.awardRouletteOnProposalPaid === 'function') {
          _dbg('S6', 'before awardRoulette', { id: String(id || '').slice(0, 24) });
          await this._withTimeout(
            DB.awardRouletteOnProposalPaid(proposal, user).catch(() => null),
            12000,
            'Roleta proposta paga',
          ).catch((e) => { _dbg('S6e', 'awardRoulette timeout/fail', { err: String(e?.message || e).slice(0, 120) }); });
          _dbg('S6b', 'after awardRoulette', { id: String(id || '').slice(0, 24) });
        }
      }
      try {
        _dbg('S7', 'before save client', { id: String(id || '').slice(0, 24) });
        await this._withTimeout(
          this._saveProposalClientData(proposal, 'manage'),
          15000,
          'Salvar cliente da proposta',
        );
        _dbg('S7b', 'after save client', { id: String(id || '').slice(0, 24) });
      } catch (clientErr) {
        _dbg('S7e', 'client save fail', { err: String(clientErr?.message || clientErr).slice(0, 160) });
        console.error('[adminSave] cliente', clientErr);
        const cm = String(clientErr?.message || clientErr || '');
        if (typeof showToast === 'function') {
          showToast('Proposta salva parcialmente — falha ao gravar cadastro do cliente: ' + cm, 'warning', 8000);
        }
      }
      const tClient = Date.now();
      const toSave = { ...proposal };
      const customSql = this._readSupBackofficeCreatedAt('manageProp');
      if (customSql) {
        this._applySupBackofficeCreatedAt(toSave, 'manageProp', user, { touchUpdated: false });
        toSave.history = Array.isArray(toSave.history) ? toSave.history.slice() : [];
        toSave.history.push({
          date: typeof nowBrazilSql === 'function' ? nowBrazilSql() : customSql,
          actorName: user.name,
          action: 'Data/hora do lançamento ajustada (Super Backoffice)',
          note: `Nova data do lançamento: ${customSql}`,
          kind: 'created_at_adjust',
        });
      }
      /* Só omite attachments no PATCH se não houve upload novo — senão o boleto some. */
      if (!pendingAtt) delete toSave.attachments;
      _dbg('S8', 'before DB.saveProposal', {
        id: String(id || '').slice(0, 24),
        status: toSave.status,
        statusOp: toSave.statusOp,
        hasAtt: !!toSave.attachments,
      });
      const saved = await this._withTimeout(
        DB.saveProposal(toSave, { skipHydrate: true }),
        45000,
        'Salvar proposta',
      );
      _dbg('S8b', 'after DB.saveProposal', {
        id: String(id || '').slice(0, 24),
        ok: !!saved,
        ms: Date.now() - saveT0,
      });
      proposal = saved
        ? (this._normProposal({ ...proposal, ...saved }) || { ...proposal, ...saved })
        : proposal;
      void this._notifyBoletoValidadoWebhook(proposal, oldStatus, oldStatusOp);
      {
        const paidNow = typeof DB !== 'undefined' && typeof DB.isPaidProposal === 'function'
          ? DB.isPaidProposal(proposal)
          : String(proposal.status || '').toUpperCase().includes('PAGO');
        if (paidNow && typeof DB?.deactivateBoletoRemindersForProposal === 'function') {
          void DB.deactivateBoletoRemindersForProposal(proposal.id);
        }
      }
      this._propPerfLog('proposals.js:adminSave', 'save done', {
        msTotal: Date.now() - saveT0, msClient: tClient - saveT0, msDb: Date.now() - tClient,
      }, 'C');
      if (typeof SalesRanking !== 'undefined' && SalesRanking.invalidateCache) SalesRanking.invalidateCache();
      delete this._adminEditCache[id];
      this._mergeAdminListCacheRow(proposal);
      if (typeof showToast === 'function') {
        showToast(
          bancoMudouPendencia
            ? 'Banco alterado — proposta colocada em Pendenciado.'
            : 'Proposta atualizada!',
          bancoMudouPendencia ? 'warning' : 'success',
          bancoMudouPendencia ? 7000 : 4000
        );
      }
      else alert(bancoMudouPendencia
        ? 'Banco alterado — proposta colocada em Pendenciado.'
        : 'Proposta atualizada!');
      if (typeof closeModal === 'function') closeModal('manageProposalModal');
      else {
        const modal = document.getElementById('manageProposalModal');
        if (modal) modal.classList.remove('open');
      }
      const patched = this._patchAdminTableRow(proposal);
      _dbg('S9', 'ui refresh done', { patched: !!patched, id: String(proposal.id || '').slice(0, 24) });
      this._propPerfLog('proposals.js:adminSave', 'ui refresh', { patched, id: proposal.id }, 'D');
      if (!patched) {
        void this.renderAdminList({ soft: true, fromCache: !!this._adminListCache });
      }
    } catch (e) {
      _dbg('S10', 'adminSave catch', { err: String(e?.message || e).slice(0, 200) });
      console.error('[adminSave]', e);
      this._proposalSaveErrorNotify(e);
    } finally {
      _dbg('S11', 'adminSave finally', { id: String(id || '').slice(0, 24) });
      releaseSaveUi();
    }
  },

  masterDeleteFromModal: function() {
    const id = document.getElementById('managePropId')?.value;
    if (!id) return;
    this.masterDeleteProposal(id, document.getElementById('managePropNumeroEdit')?.value || id, true);
  },

  masterDeleteProposal: async function(id, label, fromModal) {
    if (!this._canDeleteProposal()) {
      alert('Sem permissão para excluir propostas.');
      return;
    }
    const nome = label || id;
    if (!confirm(
      `Arquivar a proposta "${nome}"?\n\n` +
      `A ficha vira Cancelado e uma cópia fica na Localweb.\n` +
      `Proposta PAGA não é cancelada — só a cópia de segurança é gravada.`
    )) return;

    if (typeof showLoading === 'function') showLoading('Excluindo proposta...');
    try {
      if (typeof window !== 'undefined' && window.PARTNER_ROOT_ID) {
        const raw = await DB.getProposal(id);
        const proposal = this._normProposal(raw);
        if (proposal) {
          const belongs = await this._proposalBelongsToSessionPartnerOrg(proposal);
          if (!belongs) {
            alert('Sem permissão para excluir propostas de outra rede.');
            return;
          }
        }
      }
      const session = (typeof Auth !== 'undefined' && Auth.getSession) ? Auth.getSession() : null;
      const result = await DB.deleteProposal(id, { by: session?.name || session?.email || 'admin' });
      delete this._adminEditCache[id];
      delete this._employeeEditCache[id];
      // Atualiza cache local: cancelada some da lista padrão (não parece “botão morto”).
      if (Array.isArray(this._adminListCache) && !result?.keptPaid) {
        this._adminListCache = this._adminListCache.filter((p) => String(p?.id) !== String(id));
      } else if (Array.isArray(this._adminListCache) && result?.keptPaid) {
        const idx = this._adminListCache.findIndex((p) => String(p?.id) === String(id));
        if (idx >= 0) {
          this._adminListCache[idx] = {
            ...this._adminListCache[idx],
            /* paga permanece; só refresh visual */
          };
        }
      } else {
        this._adminListCache = null;
      }
      if (typeof SalesRanking !== 'undefined' && SalesRanking.invalidateCache) {
        SalesRanking.invalidateCache();
      }
      if (fromModal) {
        if (typeof closeModal === 'function') closeModal('manageProposalModal');
        else {
          const modal = document.getElementById('manageProposalModal');
          if (modal) modal.classList.remove('open');
        }
      }
      const toastMsg = result?.keptPaid
        ? 'Proposta paga permanece. Cópia salva na Localweb.'
        : 'Proposta arquivada (status Cancelado).';
      if (typeof showToast === 'function') showToast(toastMsg, 'success');
      else alert(toastMsg);
      // Remove a linha na hora (feedback imediato) e re-renderiza.
      const row = this._findAdminTableRow(id);
      if (row && !result?.keptPaid) row.remove();
      const mobileCard = document.querySelector(`#manageProposalsMobileList [data-prop-id="${CSS?.escape ? CSS.escape(String(id)) : String(id)}"]`);
      if (mobileCard && !result?.keptPaid) mobileCard.remove();
      await this.renderAdminList({ soft: true, fromCache: !!this._adminListCache });
      if (typeof renderAdminRanking === 'function' && document.getElementById('adminRankingList')) {
        try { await renderAdminRanking(); } catch (_) { /* noop */ }
      }
    } catch (e) {
      console.error('[masterDeleteProposal]', e);
      alert('Erro ao excluir proposta: ' + (e.message || 'tente novamente'));
    } finally {
      if (typeof hideLoading === 'function') hideLoading();
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (window.Proposals) {
    Proposals._ensureAdminProposalActionsDelegation();
    Proposals._initAnexoFolderDelegation();
    void (Proposals._bootstrapProposalUi?.() || Promise.resolve().then(() => {
      Proposals._initStaticProposalSelects();
    }));
    if (document.getElementById('propAnexosFolders')) {
      Proposals._setFolderContext('propAnexosFolders', 'prop');
      Proposals.initAnexoFolders();
      Proposals._applyVendedorFormRules();
    }
  }
});

/** Fecha Nova Proposta com Escape quando o overlay está aberto. */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const overlay = document.getElementById('propFormModal');
  if (overlay && overlay.classList.contains('open')) {
    if (window.Proposals && typeof Proposals.closeModal === 'function') {
      Proposals.closeModal();
    }
    return;
  }
  const panel = document.getElementById('propFormContainer');
  if (!panel || panel.style.display === 'none' || !panel.classList.contains('prop-form-panel-open')) return;
  if (window.Proposals && typeof Proposals.closeModal === 'function') {
    Proposals.closeModal();
  }
});
