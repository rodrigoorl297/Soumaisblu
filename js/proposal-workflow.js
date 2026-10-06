/* Gestão de Propostas: aba PROPOSTAS, linhas 1–131. Dados específicos em meta.workflow. */
window.ProposalWorkflow = (() => {
  const P = window.Proposals;
  const esc = value => P._escHtml(String(value ?? ''));
  const json = value => {
    if (typeof value === 'string') { try { return JSON.parse(value) || {}; } catch (_) { return {}; } }
    return value && typeof value === 'object' ? value : {};
  };
  const get = id => document.getElementById(id);
  const value = id => get(id)?.value.trim() || '';
  const products = ['COMPRA DE DÍVIDA', 'CNC', 'NOVO', 'CARTÃO', 'SAQUE COMPL', 'REFIN', 'TIM', 'OSJ', 'C6 PJ'];
  const videoTimes = ['09:30 às 10:00', '10:01 às 10:30', '10:30 às 11:00', '11:01 às 11:30', '11:31 às 12:00', '12:01 às 12:30', '13:31 às 14:00', '14:01 às 14:30', '14:31 às 15:00', '15:01 às 15:30', '15:31 às 16:00', '16:01 às 16:30', '16:31 às 17:00', '17:01 às 17:30', '17:31 às 18:00', '18:01 às 18:30', '18:31 às 19:00', '19:01 às 19:30', '19:31 às 20:00'];
  const operational = ['bancoDigitado', 'solicitouBoleto', 'protocolo', 'dataSolicitacao', 'assinou', 'status', 'statusOp', 'status_op', 'posVenda', 'nuvidio', 'fases'];
  const financial = ['tabela', 'valorFinal', 'valor_final', 'desconto'];
  const vendor = ['compraDivida', 'bancoComprado', 'bacen', 'protocoloBacen', 'dataSolicitacaoBacen'];
  let state = null;
  function kind(product) {
    const key = String(product || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (key.startsWith('COMPRA')) return 'compra';
    if (key === 'TIM') return 'tim';
    if (key === 'OSJ') return 'osj';
    if (key === 'C6 PJ') return 'c6';
    return 'consignado';
  }
  function permissions(user) {
    const role = String(user?.role || '').toLowerCase();
    const master = !window.PARTNER_ROOT_ID && (['master', 'fundador', 'desenvolvedor', 'admin', 'gerente', 'gerencia', 'diretoria'].includes(role) ||
      (user?.id === Auth.getSession()?.id && typeof Auth.isMaster === 'function' && Auth.isMaster()));
    const rights = {
      master,
      vendor: master || ['supervisor', 'parceiro', 'vendedor', 'employee', 'funcionario', 'funcionário', 'colaborador'].includes(role),
      operational: master || ['backoffice', 'operacional', 'sup_backoffice'].includes(role),
      financial: master || ['financeiro', 'financial', 'sup_financeiro', 'sup_backoffice'].includes(role),
      assign: master || ['supervisor', 'parceiro'].includes(role),
    };
    if (window.PARTNER_ROOT_ID) {
      const canWrite = orgCan('cadastrar_proposta', user);
      if (!canWrite) return { master:false, vendor:false, operational:false, financial:false, assign:false };
      // O gestor parceiro pertence à fase vendedor; backoffice mantém a fase operacional.
      rights.master = false;
    }
    return rights;
  }
  function orgCan(key, user = Auth.getSession()) {
    if (typeof partnerOrgCan === 'function') return partnerOrgCan(key);
    if (!window.PartnerPerms || !window._PARTNER_PERMS) return false;
    return user?.role === 'parceiro' ? PartnerPerms.can(window._PARTNER_PERMS, key) : PartnerPerms.canForStaff(window._PARTNER_PERMS, user?.role, key);
  }
  async function partnerRoot(proposal) {
    const explicit = json(json(proposal.meta).workflow).partnerRootId || proposal.partner_root_id || proposal.partnerRootId;
    if (explicit) return String(explicit);
    if (window.PARTNER_ROOT_ID && await P._proposalBelongsToSessionPartnerOrg(proposal)) return String(window.PARTNER_ROOT_ID);
    if (typeof DB.getPartnerRootForUser === 'function') return await DB.getPartnerRootForUser(P._proposalVendorId(proposal)) || '';
    return '';
  }
  function schema() {
    if (!state.partner || state.kind !== 'compra') return fields[state.kind];
    return {
      vendor: [...fields.compra.vendor.filter(([key]) => !['protocoloConsumidor','dataConsumidor'].includes(key)), ['senhaGov', 'Senha GOV', 'password'], ['emailPessoal', 'Email pessoal', 'email']],
      operational: [...fields.compra.operational, ['protocoloConsumidor', 'Protocolo Consumidor GOV'], ['dataConsumidor', 'Data Consumidor GOV', 'date'], ['tabelaManual', 'Tabela (digitar manualmente)']],
    };
  }
  async function canEdit(proposal, user) {
    if (!user?.id || P._isProposalPaid(proposal)) return false;
    const rights = permissions(user);
    if (!rights.vendor && !rights.operational && !rights.financial) return false;
    if (window.PARTNER_ROOT_ID && !await P._proposalBelongsToSessionPartnerOrg(proposal)) return false;
    if (window.PARTNER_ROOT_ID && !orgCan('cadastrar_proposta', user)) return false;
    if (String(user.role).toLowerCase() === 'supervisor' && !window.PARTNER_ROOT_ID) {
      return (await P._filterProposalsToSupervisorTeam([proposal], user)).length === 1;
    }
    return rights.master || rights.operational || rights.financial ||
      (window.PARTNER_ROOT_ID && user.role === 'parceiro' && orgCan('cadastrar_proposta', user)) || P._ownsProposal(proposal, user);
  }
  function expiry(date, hours) {
    if (!date) return '';
    // Datas de protocolo representam dias civis; dez dias não dependem de fuso/DST.
    if (hours === 240) {
      const parsed = new Date(`${date.slice(0, 10)}T12:00:00Z`);
      if (Number.isNaN(parsed.getTime())) return '';
      parsed.setUTCDate(parsed.getUTCDate() + 10);
      return parsed.toISOString().slice(0, 10);
    }
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? '' : new Date(parsed.getTime() + hours * 3600000).toISOString();
  }
  function field(key, label, data, type = 'text', options) {
    const current = data[key] ?? '';
    const id = `workflow_${key}`;
    const control = options
      ? `<select id="${id}" class="form-control"><option value="">Selecione</option>${[...new Set([...options, ...(current ? [current] : [])])].map(o => `<option value="${esc(o)}"${o === current ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`
      : `<input id="${id}" class="form-control" type="${type}" value="${esc(current)}"${type === 'number' ? ' min="0" step="0.01"' : ''}>`;
    return `<div class="form-group"><label for="${id}">${esc(label)}</label>${control}</div>`;
  }
  const fields = {
    compra: {
      vendor: [['tipoCompra', 'Tipo de compra'], ['matricula', 'Matrícula'], ['senhaContracheque', 'Senha contracheque'], ['senhaConsignacao', 'Senha consignação'], ['servidor', 'Servidor'], ['situacaoServidor', 'Situação servidor'], ['convenio', 'Convênio'], ['entidade', 'Órgão / entidade'], ['contato', 'Contato'], ['contatoReferencia', 'Contato referência'], ['horarioVideochamada', 'Melhor horário de videochamada'], ['protocoloConsumidor', 'Protocolo Consumidor GOV'], ['dataConsumidor', 'Data Consumidor GOV', 'date']],
      operational: [['emailJudicial', 'Email da notificação judicial', 'email'], ['dataEmailJudicial', 'Data do email judicial', 'datetime-local'], ['dataReenvioEmail', 'Data do reenvio de email', 'datetime-local'], ['protocoloNuvidio', 'Protocolo Núvidio'], ['dataPosVenda', 'Data pós-venda', 'date']],
    },
    consignado: { vendor: [['matricula', 'Matrícula'], ['convenio', 'Convênio'], ['entidade', 'Órgão / entidade'], ['subproduto', 'Subproduto']], operational: [] },
    tim: { vendor: [['cnpj', 'CNPJ'], ['razaoSocial', 'Razão social'], ['produtoTim', 'Produto TIM'], ['quantidadeAcessos', 'Quantidade de acessos', 'number'], ['aparelho', 'Aparelho']], operational: [['numeroRadar', 'Nº Radar'], ['numeroP2b', 'Nº P2B'], ['numeroEasyVendas', 'Nº Easy Vendas'], ['totalNegociacao', 'Total negociação (R$)', 'number']] },
    osj: { vendor: [['subproduto', 'Subproduto'], ['contato', 'Contato'], ['contato2', 'Contato 2'], ['email', 'Email', 'email']], operational: [['numeroAcao', 'Nº ação']] },
    c6: { vendor: [['cnpj', 'CNPJ'], ['razaoSocial', 'Razão social'], ['subproduto', 'Subproduto']], operational: [['numeroPropostaBanco', 'Nº proposta no banco']] },
  };
  function attachmentCategory(key, label, count = 1) {
    return { key, titulo: label, folderIdSuffix: key, grupoPrefix: `${key}_`, viewSeed: [],
      initialSlots: Array.from({ length: count }, (_, i) => ({ slotSuffix: String(i + 1), grupo: `${key}_${i + 1}`, label: String(i + 1) })) };
  }
  const extraCategories = [attachmentCategory('endereco', 'Comprovante de endereço'), attachmentCategory('contrato_social', 'Contrato social'), attachmentCategory('outros', 'Outros anexos'), attachmentCategory('procuracao', 'Procuração'), attachmentCategory('contrato_servicos', 'Contrato de prestação de serviços'), attachmentCategory('faturamento', 'Faturamento dos últimos 12 meses')];
  P._ANEXO_CATEGORIES.push(...extraCategories);
  const originalFolders = P._getFolderDefs;
  P._getFolderDefs = function() {
    const defs = originalFolders.call(this);
    if (this._folderRootId !== 'managePropAnexosFolders' || !state) return defs.filter(d => !extraCategories.some(c => c.key === d.key));
    const keys = {
      compra: ['identidade', 'contracheque', 'extrato', 'boleto', 'nota_promissoria', 'termo_confissao_divida'],
      consignado: ['identidade', 'extrato', 'endereco'], tim: ['identidade', 'contrato_social', 'outros'],
      osj: ['identidade', 'contracheque', 'procuracao', 'contrato_servicos'], c6: ['identidade', 'contrato_social', 'endereco', 'faturamento'],
    }[state.kind];
    return defs.filter(d => keys.includes(d.key) && !(state.partner && d.key === 'boleto' && !permissions(Auth.getSession()).operational)).map(d => {
      if (['contracheque', 'extrato'].includes(d.key)) return { ...d, initialSlots: Array.from({length: 3}, (_, i) => ({id: `${d.idPrefix}${i + 1}`, grupo: `${d.grupoPrefix}${i + 1}`, label: String(i + 1)})) };
      return d;
    });
  };
  function restore(target, before, keys) {
    keys.forEach(key => { if (before[key] === undefined) delete target[key]; else target[key] = before[key]; });
  }
  function applyPermissions(readonly) {
    const rights = permissions(Auth.getSession());
    const groups = { operational: ['managePropBancoDigitado', 'managePropBoleto', 'managePropProtocolo', 'managePropDataSol', 'managePropAssinou', 'managePropStatusOp', 'managePropStatus', 'managePropPosVenda', 'managePropNuvidio', 'managePropFases'], vendor: ['managePropDivida', 'managePropBanco', 'managePropBacen', 'managePropProtBacen', 'managePropDataBacen'], financial: ['managePropTabela'] };
    Object.entries(groups).forEach(([group, ids]) => ids.forEach(id => { if (get(id)) get(id).disabled = readonly || !rights[group]; }));
    if (state.partner && state.kind === 'compra') {
      ['managePropBacen','managePropProtBacen','managePropDataBacen'].forEach(id => { if (get(id)) get(id).disabled = readonly || !rights.operational; });
    }
    if (state.kind === 'consignado' && get('managePropBancoDigitado')) get('managePropBancoDigitado').disabled = readonly || !(rights.vendor || rights.operational);
    get('workflowPanel')?.querySelectorAll('[data-workflow-group]').forEach(section => {
      section.querySelectorAll('input,select,textarea,button').forEach(el => { el.disabled = readonly || !rights[section.dataset.workflowGroup]; });
    });
    ['managePropNumeroEdit', 'managePropValorEdit'].forEach(id => { if (get(id)) get(id).disabled = readonly || !(rights.vendor || rights.operational || rights.financial); });
    if (get('managePropVendor')) get('managePropVendor').disabled = readonly || !rights.assign;
    const purchaseOnly = ['managePropDivida', 'managePropBanco', 'managePropBoleto', 'managePropProtocolo', 'managePropDataSol', 'managePropBacen', 'managePropProtBacen', 'managePropDataBacen', 'managePropAssinou', 'managePropPosVenda', 'managePropNuvidio'];
    purchaseOnly.forEach(id => { const el = get(id); if (el) el.closest('.form-group').style.display = state.kind === 'compra' ? '' : 'none'; });
    if (get('managePropBancoDigitado')) get('managePropBancoDigitado').closest('.form-group').style.display = ['compra', 'consignado'].includes(state.kind) ? '' : 'none';
    const tableCard = get('managePropTabela')?.closest('.card');
    if (tableCard) tableCard.style.display = state.kind === 'compra' && !state.partner ? '' : 'none';
    get('managePropClientDetail')?.querySelectorAll('input,select,textarea,button').forEach(el => { el.disabled = readonly || !rights.vendor; });
    get('managePropAnexosUpload')?.querySelectorAll('input,button').forEach(el => { el.disabled = readonly || !(rights.vendor || rights.operational); });
  }
  function updateDeadlines() {
    const show = (id, date, hours) => {
      const result = expiry(date, hours);
      if (get(id)) get(id).textContent = result ? new Date(hours === 240 ? `${result}T12:00:00` : result).toLocaleString('pt-BR', hours === 240 ? {dateStyle: 'short'} : {dateStyle: 'short', timeStyle: 'short'}) : '—';
    };
    show('deadlineBacen', value('managePropDataBacen'), 240);
    show('deadlineConsumidor', value('workflow_dataConsumidor'), 240);
    show('deadlineJudicial', value('workflow_dataEmailJudicial'), 72);
    show('deadlineReenvio', value('workflow_dataReenvioEmail'), 72);
    get('workflowProtocols')?.querySelectorAll('[data-protocol-row]').forEach(row => {
      const result = expiry(row.querySelector('[data-date]').value, 240);
      row.querySelector('output').textContent = result ? result.split('-').reverse().join('/') : '—';
    });
  }
  function addProtocol(protocol = {}) {
    if (!state || state.readonly || !permissions(Auth.getSession()).operational) return;
    const row = document.createElement('div');
    row.dataset.protocolRow = '1';
    row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:10px';
    row.innerHTML = `<div><label>Protocolo central</label><input data-number class="form-control" value="${esc(protocol.numero || '')}"></div><div><label>Data</label><input data-date type="date" class="form-control" value="${esc(protocol.data || '')}"></div><div><label>Expira em</label><output style="display:block"></output></div>`;
    get('workflowProtocols').appendChild(row);
    row.querySelector('[data-date]').addEventListener('change', updateDeadlines);
    updateDeadlines();
  }
  async function open(proposal, viewOnly) {
    const openToken = P._adminOpenToken;
    const rights = permissions(Auth.getSession());
    const readonly = viewOnly || !await canEdit(proposal, Auth.getSession());
    const root = kind(proposal.product) === 'compra' ? await partnerRoot(proposal) : '';
    if (openToken !== P._adminOpenToken) return;
    state = { id: proposal.id, proposal, kind: kind(proposal.product), readonly, partner:!!root, partnerRootId:root };
    get('workflowPanel')?.remove();
    const meta = json(proposal.meta), data = { ...proposal, ...json(meta.workflow) };
    const cfg = schema();
    if (state.partner && data.tabelaManual === undefined) data.tabelaManual = proposal.tabela || '';
    const panel = document.createElement('div');
    panel.id = 'workflowPanel';
    panel.className = 'card card-padded';
    panel.style.marginBottom = '16px';
    const common = [['clientCpf', ['tim', 'c6'].includes(state.kind) ? 'CPF do representante' : 'CPF'], ['clientName', 'Nome do cliente / representante'], ['obs', 'Observações do vendedor']];
    if (P._workflowDraft?.id === proposal.id) common.push(['numero', 'Nº proposta', 'text'], ['valor', 'Valor proposta (R$)', 'number']);
    panel.innerHTML = `<h4 style="margin-bottom:12px">${esc(proposal.product)}${state.partner ? ' — Parceiro' : ''} — Cadastro e andamento</h4>
      ${P._workflowDraft?.id === proposal.id ? `<div class="form-group"><label>Produto</label><select id="workflowProduct" class="form-control">${products.map(p => `<option${p === proposal.product ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></div>` : ''}
      <fieldset data-workflow-group="vendor" style="border:0;padding:0"><legend>Vendedor</legend><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px">${[...common, ...cfg.vendor].map(f => field(f[0], f[1], data, f[2] || 'text', f[0] === 'convenio' ? P._CONVENIOS : f[0] === 'horarioVideochamada' ? videoTimes : f[0] === 'entidade' ? [] : undefined)).join('')}</div>
      <button type="button" class="btn btn-outline btn-sm" id="workflowLookup">${['tim', 'c6'].includes(state.kind) ? 'Buscar CNPJ na API' : 'Buscar CPF no banco de dados'}</button></fieldset>
      <fieldset data-workflow-group="operational" style="border:0;padding:0;margin-top:14px"><legend>Backoffice</legend><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px">${cfg.operational.map(f => field(f[0], f[1], data, f[2] || 'text')).join('')}</div>
      ${state.kind === 'compra' ? '<div id="workflowProtocols"></div><button id="workflowAddProtocol" type="button" class="btn btn-outline btn-sm">+ Novo protocolo central</button>' : ''}</fieldset>
      ${state.kind === 'compra' ? '<p style="margin-top:14px">Expira BACEN: <output id="deadlineBacen"></output> · Consumidor GOV: <output id="deadlineConsumidor"></output><br>Email judicial: <output id="deadlineJudicial"></output> · Reenvio: <output id="deadlineReenvio"></output></p>' : ''}
      ${state.kind === 'consignado' ? `<fieldset data-workflow-group="financial" style="border:0;padding:0"><legend>Supervisor financeiro</legend>${field('deflator', 'Deflator (%)', data, 'number')}<label>Valor produção (R$)</label><output id="workflowProduction" style="display:block"></output></fieldset>` : ''}`;
    get('managePropClientInfo').closest('.card').insertAdjacentElement('afterend', panel);
    get('workflowWhatsappNotice')?.remove();
    if (state.kind === 'compra') {
      const notice = document.createElement('p');
      notice.id = 'workflowWhatsappNotice';
      notice.className = 'alert alert-info';
      notice.style.cssText = 'margin:0 0 12px;font-size:13px;';
      notice.textContent = 'Informar no WhatsApp a situação atual da proposta.';
      get('managePropStatusOp')?.closest('.form-group')?.prepend(notice);
    }
    const convenioSelect = get('workflow_convenio');
    const entidadeSelect = get('workflow_entidade');
    if (convenioSelect && entidadeSelect) {
      const updateMenu = (initial = false) => {
        const convenio = P._normalizeConvenioKey(convenioSelect.value);
        entidadeSelect.closest('.form-group').hidden = !convenio;
        P._fillEntidadeSelect('workflow_entidade', convenio, initial ? data.entidade : '');
        entidadeSelect.value = initial ? (data.entidade || '') : '';
        entidadeSelect.closest('.form-group').querySelector('label').textContent = {
          ESTADUAL:'Órgão estadual', MUNICIPAL:'Prefeitura / órgão municipal', FEDERAL:'Órgão federal', INSS:'Categoria INSS', CLT:'Entidade CLT'
        }[convenio] || 'Órgão / entidade';
      };
      updateMenu(true);
      convenioSelect.addEventListener('change', () => updateMenu(false));
    }
    get('workflowLookup').addEventListener('click', lookup);
    if (get('workflowProduct')) get('workflowProduct').addEventListener('change', async e => {
      if (P._hasPendingAnexoUploads('managePropAnexosFolders')) { e.target.value = proposal.product; showToast('Salve ou remova os anexos antes de mudar o produto.', 'warning'); return; }
      ['clientCpf', 'clientName', 'obs', 'numero', 'valor'].forEach(key => {
        if (get(`workflow_${key}`)) P._workflowDraft[key] = key === 'valor' ? Number(value(`workflow_${key}`)) : value(`workflow_${key}`);
      });
      P._workflowDraft.product = e.target.value;
      if (['tim', 'osj', 'c6'].includes(kind(e.target.value)) && !P._workflowDraft.numero) P._workflowDraft.numero = proposal.id;
      await P.openAdminModal(proposal.id);
    });
    if (state.kind === 'compra') {
      const protocols = Array.isArray(data.protocolosCentral) ? data.protocolosCentral : [];
      if (readonly || !rights.operational) {
        get('workflowProtocols').innerHTML = protocols.map(p => `<p>Protocolo central: ${esc(p.numero)} · Data: ${esc(p.data)} · Expira: ${esc(expiry(p.data, 240))}</p>`).join('');
      } else protocols.forEach(addProtocol);
      get('workflowAddProtocol').addEventListener('click', () => addProtocol());
      ['managePropDataBacen', 'workflow_dataConsumidor', 'workflow_dataEmailJudicial', 'workflow_dataReenvioEmail'].forEach(id => { if (get(id)) get(id).onchange = updateDeadlines; });
      updateDeadlines();
    }
    if (get('workflow_deflator')) {
      const calculate = () => { const raw = value('managePropValorEdit'); const amount = P._parseBrMoneyInput(raw || String(proposal.valor || 0)); const pct = Number(value('workflow_deflator')); get('workflowProduction').textContent = (amount * (1 - pct / 100)).toLocaleString('pt-BR', {style:'currency',currency:'BRL'}); };
      get('workflow_deflator').addEventListener('input', calculate); get('managePropValorEdit')?.addEventListener('input', calculate); calculate();
    }
    if (!readonly) { P._setFolderContext('managePropAnexosFolders', 'manageProp'); P.resetAnexoFolders(proposal.attachments); }
    applyPermissions(readonly);
    if (get('managePropAnexosUpload')) get('managePropAnexosUpload').style.display = readonly || !(rights.vendor || rights.operational) ? 'none' : '';
    const save = document.querySelector('#manageProposalModal button[onclick*="adminSave"]');
    if (save) save.style.display = readonly ? 'none' : '';
  }
  async function lookup() {
    if (!state || state.readonly || !permissions(Auth.getSession()).vendor) return;
    const id = state.id;
    try {
      if (['tim', 'c6'].includes(state.kind)) {
        if (!window.FonteData && typeof ensureScript === 'function') await ensureScript('../js/fontedata.js');
        if (!window.FonteData) throw new Error('Integração de CNPJ indisponível.');
        const cnpj = value('workflow_cnpj').replace(/\D/g, '');
        const result = await FonteData.lookupCnpj(cnpj);
        if (!result.ok) throw new Error(result.error || 'Falha na consulta CNPJ.');
        if (state?.id !== id || value('workflow_cnpj').replace(/\D/g, '') !== cnpj) return;
        get('workflow_razaoSocial').value = result.partner.razao_social || '';
        get('workflow_clientName').value = result.partner.razao_social || '';
      } else {
        const cpf = value('workflow_clientCpf').replace(/\D/g, '');
        if (cpf.length !== 11) throw new Error('Informe um CPF completo.');
        const client = await P._lookupClientByCpf(cpf);
        if (state?.id !== id || value('workflow_clientCpf').replace(/\D/g, '') !== cpf) return;
        if (!client) throw new Error('Cliente não encontrado.');
        get('workflow_clientName').value = client.name || '';
        if (get('workflow_contato')) get('workflow_contato').value = client.phone1 || '';
      }
      showToast('Dados encontrados.', 'success');
    } catch (e) { showToast(e.message, 'warning'); }
  }
  function collect(proposal, before, user) {
    if (!state || state.id !== proposal.id || state.readonly) throw new Error('Abra a proposta novamente para editar.');
    const rights = permissions(user);
    const data = { ...json(json(before.meta).workflow) };
    const cfg = schema();
    for (const group of ['vendor', 'operational']) {
      if (!rights[group]) {
        const preserved = state.kind === 'consignado' && rights.vendor ? operational.filter(k => k !== 'bancoDigitado') : operational;
        const vendorFields = state.partner ? vendor.filter(k => !['bacen','protocoloBacen','dataSolicitacaoBacen'].includes(k)) : vendor;
        const extraOperational = state.partner ? ['bacen','protocoloBacen','dataSolicitacaoBacen'] : [];
        restore(proposal, before, group === 'vendor' ? vendorFields : [...preserved, ...extraOperational, '_digitacaoAtMark', '_billingPaidAt', '_billingPaidBy']);
        continue;
      }
      const defs = [...cfg[group], ...(group === 'vendor' ? [['clientCpf'], ['clientName'], ['obs'], ...(P._workflowDraft?.id === proposal.id ? [['numero'], ['valor', '', 'number']] : [])] : [])];
      defs.forEach(([key, , type]) => {
        let v = value(`workflow_${key}`);
        if (type === 'number' && v !== '') { v = Number(v); if (!Number.isFinite(v) || v < 0) throw new Error('Informe valores numéricos positivos.'); }
        if (['clientCpf', 'clientName', 'obs', 'numero', 'valor', 'matricula', 'senhaContracheque', 'senhaConsignacao', 'servidor', 'situacaoServidor', 'convenio', 'entidade', 'horarioVideochamada'].includes(key)) proposal[key] = v;
        else data[key] = v;
      });
    }
    if (!rights.assign) restore(proposal, before, ['vendorId', 'vendor_id', 'employee_id', 'vendorName', 'vendor_name']);
    if (!(rights.vendor || rights.operational || rights.financial)) restore(proposal, before, ['numero', 'valor']);
    if (!rights.financial) restore(proposal, before, financial);
    if (state.partner) {
      data.partnerRootId = state.partnerRootId;
      restore(proposal, before, financial);
      if (rights.operational) proposal.tabela = data.tabelaManual || '';
      else restore(proposal, before, ['tabela']);
    }
    if (state.kind === 'compra') {
      if (rights.operational) {
        const protocols = Array.from(get('workflowProtocols').querySelectorAll('[data-protocol-row]')).map(row => ({numero: row.querySelector('[data-number]').value.trim(), data: row.querySelector('[data-date]').value}));
        if (protocols.some(p => !p.numero || !p.data)) throw new Error('Preencha número e data de cada protocolo central.');
        data.protocolosCentral = protocols.map(p => ({...p, expiraEm: expiry(p.data, 240)}));
        data.expiraEmailJudicial = expiry(data.dataEmailJudicial, 72); data.expiraReenvioEmail = expiry(data.dataReenvioEmail, 72);
      }
      data.expiraBacen = expiry(proposal.dataSolicitacaoBacen, 240); data.expiraConsumidor = expiry(data.dataConsumidor, 240);
    }
    if (state.kind === 'consignado' && rights.financial) {
      const pct = Number(value('workflow_deflator'));
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error('Deflator deve estar entre 0 e 100%.');
      data.deflator = pct; data.valorProducao = Math.round(Number(proposal.valor || 0) * (1 - pct / 100) * 100) / 100;
    }
    proposal.meta = { ...json(before.meta), workflow: data };
    const isNew = P._workflowDraft?.id === proposal.id;
    if (isNew) {
      if (!proposal.clientName || !proposal.numero) throw new Error('Informe cliente e número da proposta.');
      if (['tim', 'c6'].includes(state.kind)) {
        if (String(data.cnpj).replace(/\D/g, '').length !== 14) throw new Error('Informe o CNPJ completo.');
        proposal.clientCpf = String(data.cnpj).replace(/\D/g, '');
      } else if (String(proposal.clientCpf).replace(/\D/g, '').length !== 11) throw new Error('Informe o CPF completo.');
      if (state.kind === 'compra' && !state.partner && (!proposal.protocoloBacen || !proposal.dataSolicitacaoBacen || !data.protocoloConsumidor || !data.dataConsumidor)) throw new Error('Informe protocolos BACEN e Consumidor GOV, com suas datas.');
      if (state.kind === 'tim' && (!data.produtoTim || !Number.isInteger(data.quantidadeAcessos) || data.quantidadeAcessos < 1)) throw new Error('Informe produto TIM e quantidade inteira de acessos maior que zero.');
      if (['consignado', 'osj', 'c6'].includes(state.kind) && !data.subproduto) throw new Error('Informe o subproduto.');
      proposal.status = 'Em Andamento'; proposal.statusOp = 'Em Andamento'; proposal.status_op = 'Em Andamento';
    }
    if (state.kind !== 'compra') {
      restore(proposal, before, [...vendor, ...operational.filter(k => !['bancoDigitado', 'status', 'statusOp', 'status_op', 'fases'].includes(k)), ...financial]);
      if (state.kind !== 'consignado') restore(proposal, before, ['bancoDigitado']);
    }
    if (state.kind === 'consignado' && data.deflator !== undefined) {
      data.valorProducao = Math.round(Number(proposal.valor || 0) * (1 - Number(data.deflator) / 100) * 100) / 100;
      proposal.valorFinal = data.valorProducao;
      proposal.valor_final = data.valorProducao;
      proposal.desconto = Math.round((Number(proposal.valor || 0) - data.valorProducao) * 100) / 100;
    }
    proposal.client_cpf = proposal.clientCpf;
    proposal.client_name = proposal.clientName;
    (DB._DB_FIELD_MIRRORS?.proposals || []).forEach(([camel, snake]) => {
      if (Object.prototype.hasOwnProperty.call(proposal, camel)) proposal[snake] = proposal[camel];
    });
    // O cadastro legado aparece no mesmo modal; mantenha a identidade única no save.
    if (get('manageClientName')) get('manageClientName').value = proposal.clientName || '';
    if (get('manageClientCpf')) get('manageClientCpf').value = proposal.clientCpf || '';
  }
  function validateAttachments(proposal) {
    const att = P._parseAttachments(proposal.attachments);
    const keys = Object.keys(att).filter(k => !P._isAttachmentMetaKey(k));
    const has = prefix => keys.some(k => k === prefix || k.startsWith(`${prefix}_`));
    const required = {
      compra: [['identidade', 'Documento de identidade'], ['contracheque', 'Contracheque'], ['extrato', 'Extrato de consignação']],
      consignado: [['identidade', 'Documento de identidade'], ['extrato', 'Extrato de consignação'], ['endereco', 'Comprovante de endereço']],
      tim: [['identidade', 'Documento de identidade'], ['contrato_social', 'Contrato social']],
      osj: [['identidade', 'Documento de identidade'], ['contracheque', 'Contracheque'], ['procuracao', 'Procuração'], ['contrato_servicos', 'Contrato de prestação de serviços']],
      c6: [['identidade', 'Documento de identidade'], ['contrato_social', 'Contrato social'], ['endereco', 'Comprovante de endereço'], ['faturamento', 'Faturamento dos últimos 12 meses']],
    }[kind(proposal.product)];
    const missing = required.filter(([prefix]) => !has(prefix)).map(([, label]) => label);
    if (kind(proposal.product) === 'osj' && [1, 2, 3].some(i => !att[`contracheque_${i}`])) missing.push('Três contracheques');
    if (kind(proposal.product) === 'compra' && (!att.identidade_frente || !att.identidade_verso)) missing.push('RG frente e verso');
    if (missing.length) throw new Error('Anexe os documentos obrigatórios: ' + missing.join(', ') + '.');
  }
  async function validateVendor(proposal, before, user) {
    if (!permissions(user).assign || proposal.vendorId === before.vendorId) return;
    const scope = await P._proposalVendorScopeForSession(user);
    const vendors = await DB.getVendorsForSelect(scope);
    if (!vendors.some(v => String(v.id) === String(proposal.vendorId))) throw new Error('Vendedor fora do seu escopo de gestão.');
  }
  function audit(proposal, before, user) {
    const redact = item => {
      if (Array.isArray(item)) return item.map(redact);
      if (!item || typeof item !== 'object') return item;
      return Object.fromEntries(Object.entries(item).map(([key, val]) => [key, /senha/i.test(key) ? '[protegido]' : redact(val)]));
    };
    const ignored = new Set(['history', 'updatedAt', 'updated_at', 'lastUpdatedBy', 'last_updated_by']);
    const changes = {};
    for (const key of new Set([...Object.keys(before), ...Object.keys(proposal)])) {
      if (ignored.has(key) || key.startsWith('_')) continue;
      if (JSON.stringify(before[key] ?? null) !== JSON.stringify(proposal[key] ?? null)) {
        changes[key] = /senha/i.test(key) ? { before: '[protegido]', after: '[protegido]' } : { before: redact(before[key] ?? null), after: redact(proposal[key] ?? null) };
      }
    }
    proposal.history = P._parseProposalHistory(proposal.history);
    proposal.history.push({date: new Date().toISOString(), actorId: user.id, actorName: user.name || user.id, actorRole: user.role, action: P._workflowDraft?.id === proposal.id ? 'Proposta criada' : 'Alterações da proposta: ' + (Object.keys(changes).join(', ') || 'observação'), changes});
  }
  async function create() {
    const user = Auth.getSession();
    if (!user?.id || !permissions(user).vendor) return showToast('Sem permissão para cadastrar propostas.', 'warning');
    await ensureManageModal();
    const token = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() :
      Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    const id = `PROP-${token}`;
    const root = window.PARTNER_ROOT_ID || (user.role === 'parceiro' ? user.id : '');
    P._workflowDraft = {id, product: 'COMPRA DE DÍVIDA', clientName:'', clientCpf:'', vendorId:user.id, vendorName:user.name, numero:'', valor:0, status:'Em Andamento', attachments:{}, history:[], meta:root ? {workflow:{partnerRootId:String(root)}} : {}};
    await P.openAdminModal(id);
  }
  let modalLoading;
  async function ensureManageModal() {
    if (get('manageProposalModal')) return;
    if (!modalLoading) modalLoading = (async () => {
      const response = await fetch('/pages/financeiro-sections.html?v=workflow-partner131-1');
      if (!response.ok) throw new Error('Não foi possível carregar o formulário de propostas.');
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      for (const id of ['manageProposalModal','attachmentViewerModal']) {
        if (get(id)) continue;
        const modal = doc.getElementById(id);
        if (modal) document.body.appendChild(document.importNode(modal, true));
      }
      if (!get('manageProposalModal')) throw new Error('Formulário de propostas indisponível.');
      P._initStaticProposalSelects();
    })().finally(() => { modalLoading = null; });
    return modalLoading;
  }
  async function openPartnerEmployee(id, viewOnly) {
    await ensureManageModal();
    return P.openAdminModal(id, viewOnly);
  }
  return { open, collect, audit, permissions, canEdit, create, expiry, kind, validateAttachments, validateVendor, openPartnerEmployee };
})();
