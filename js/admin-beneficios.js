/* Gestão Clube Benefícios — master/financeiro */
(function (g) {
  'use strict';

  let currentUser = null;
  let selectedVouchersForClose = [];

  function _benId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function formatCurrency(val) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  }

  function switchTab(tabId, el) {
    document.querySelectorAll('.menu-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => { c.style.display = 'none'; });
    if (el) el.classList.add('active');
    const panel = document.getElementById(`tab-${tabId}`);
    if (panel) panel.style.display = 'block';
  }

  async function loadLimitRequests() {
    const list = await supaReq('GET', 'beneficios_limites', null, '?order=created_at.desc');
    const tbody = document.getElementById('limitesTbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!list || list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhuma solicitação cadastrada.</td></tr>';
      return;
    }

    list.forEach(item => {
      const tr = document.createElement('tr');
      const phones = `${item.contato1 || '—'}<br/>${item.contato2 || ''}`;
      let docBtn = '—';
      if (item.documento_url) {
        docBtn = `<a href="${item.documento_url}" target="_blank" class="btn btn-outline btn-sm">📎 Ver</a>`;
      }
      let actionBtn = '—';
      if (item.status === 'solicitado') {
        const safeName = String(item.employee_name || '').replace(/'/g, "\\'");
        actionBtn = `<button class="btn btn-primary btn-sm" onclick="openApproveModal('${item.id}', '${safeName}')">Aprovar / Recusar</button>`;
      }
      tr.innerHTML = `
        <td><strong>${item.employee_name}</strong></td>
        <td>${phones}</td>
        <td><span class="badge ${item.status === 'aprovado' ? 'badge-success' : 'badge-warning'}">${item.status}</span></td>
        <td>${formatCurrency(item.limite_aprovado)}</td>
        <td>${docBtn}</td>
        <td>${actionBtn}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function openApproveModal(id, name) {
    document.getElementById('modalReqId').value = id;
    document.getElementById('modalReqName').value = name;
    document.getElementById('approveLimitModal').style.display = 'flex';
  }

  function closeApproveModal() {
    document.getElementById('approveLimitModal').style.display = 'none';
  }

  async function confirmLimitApproval() {
    const id = document.getElementById('modalReqId').value;
    const val = parseFloat(document.getElementById('modalReqLimit').value) || 0;
    try {
      await supaReq('PATCH', 'beneficios_limites', {
        limite_aprovado: val,
        limite_disponivel: val,
        status: 'aprovado',
        contrato_url: 'uploads/contract_' + Date.now() + '.pdf',
        promissoria_url: 'uploads/promissory_' + Date.now() + '.pdf',
      }, `?id=eq.${id}`);
      alert('Limite aprovado e ativado!');
      closeApproveModal();
      await loadAllData();
    } catch (e) {
      alert('Erro ao aprovar limite: ' + e.message);
    }
  }

  async function loadProviders() {
    const list = await supaReq('GET', 'beneficios_prestadores', null, '?order=nome_fantasia.asc');
    const selectProd = document.getElementById('prodProvider');
    const selectClose = document.getElementById('closeProvider');
    if (selectProd) selectProd.innerHTML = '<option value="">Selecione...</option>';
    if (selectClose) selectClose.innerHTML = '<option value="">Selecione...</option>';
    if (list) {
      list.forEach(p => {
        const opt = `<option value="${p.id}">${p.nome_fantasia} (${p.categoria})</option>`;
        if (selectProd) selectProd.innerHTML += opt;
        if (selectClose) selectClose.innerHTML += opt;
      });
    }
  }

  async function saveProvider(e) {
    e.preventDefault();
    try {
      const payload = {
        id: _benId('ben_pre_'),
        codigo_parceiro: 'PRT-' + Date.now().toString(36).toUpperCase(),
        nome_fantasia: document.getElementById('provNome').value,
        cnpj_cpf: document.getElementById('provCpfCnpj').value,
        chave_pix: document.getElementById('provPix').value,
        dia_pagamento: parseInt(document.getElementById('provDiaPgto').value, 10) || 5,
        categoria: document.getElementById('provCategoria').value,
        pagamento_automatico: document.getElementById('provAutoPgto').value,
      };
      await supaReq('POST', 'beneficios_prestadores', payload);
      alert('Prestador cadastrado com sucesso!');
      document.getElementById('providerForm').reset();
      await loadAllData();
    } catch (err) {
      alert('Erro ao salvar prestador: ' + err.message);
    }
  }

  async function saveProduct(e) {
    e.preventDefault();
    try {
      const select = document.getElementById('prodProvider');
      const providerName = select.options[select.selectedIndex].text.split(' (')[0];
      const payload = {
        id: _benId('ben_prd_'),
        codigo_produto: 'PROD-' + Date.now().toString(36).toUpperCase(),
        categoria: document.getElementById('prodCategoria').value,
        nome: document.getElementById('prodNome').value,
        prestador_id: select.value,
        prestador_name: providerName,
        descricao: document.getElementById('prodDesc').value,
        valor: parseFloat(document.getElementById('prodValor').value) || 0,
      };
      await supaReq('POST', 'beneficios_produtos', payload);
      alert('Produto cadastrado com sucesso!');
      document.getElementById('productForm').reset();
    } catch (err) {
      alert('Erro ao cadastrar produto: ' + err.message);
    }
  }

  async function loadActiveOrders() {
    const list = await supaReq('GET', 'beneficios_vouchers', null, '?order=created_at.desc');
    const tbody = document.getElementById('pedidosTbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!list || list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum pedido registrado hoje.</td></tr>';
      return;
    }
    list.forEach(v => {
      const tr = document.createElement('tr');
      const detalhes = v.detalhes_pedido || {};
      let detailsStr = `Modo: ${detalhes.modo || 'Geral'}`;
      if (detalhes.modo === 'entrega') {
        detailsStr += `<br/>Hora: ${detalhes.horario_entrega || '—'}<br/>Carnes: ${(detalhes.carnes || []).join(', ')}`;
      }
      let actionBtn = '—';
      if (v.status === 'em_analise') {
        actionBtn = `<button class="btn btn-outline btn-sm btn-success" onclick="approveOrder('${v.id}')">Aprovar</button>`;
      }
      tr.innerHTML = `
        <td><strong>${v.voucher_no}</strong></td>
        <td>${v.employee_name}</td>
        <td>${v.prestador_name}</td>
        <td>${formatCurrency(v.valor)}</td>
        <td style="font-size:12px; line-height:1.4;">${detailsStr}</td>
        <td><span class="badge ${v.status === 'pago' ? 'badge-success' : 'badge-warning'}">${v.status}</span></td>
        <td>${actionBtn}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function approveOrder(id) {
    try {
      await supaReq('PATCH', 'beneficios_vouchers', { status: 'utilizado' }, `?id=eq.${id}`);
      alert('Pedido/Voucher aprovado com sucesso!');
      await loadAllData();
    } catch (e) {
      alert('Erro ao aprovar pedido: ' + e.message);
    }
  }

  async function loadProviderVouchers() {
    const provId = document.getElementById('closeProvider').value;
    if (!provId) return;
    const dateStart = document.getElementById('closeDateStart').value || '1970-01-01';
    const dateEnd = document.getElementById('closeDateEnd').value || new Date().toISOString().split('T')[0];
    try {
      const vouchers = await supaReq('GET', 'beneficios_vouchers', null,
        `?prestador_id=eq.${provId}&status=eq.utilizado&fechamento_protocolo=is.null`);
      selectedVouchersForClose = (vouchers || []).filter(v => {
        const d = v.created_at.split('T')[0];
        return d >= dateStart && d <= dateEnd;
      });
      document.getElementById('closeVouchersQty').value = selectedVouchersForClose.length;
      const sum = selectedVouchersForClose.reduce((acc, curr) => acc + parseFloat(curr.valor), 0);
      document.getElementById('closeTotalVal').value = formatCurrency(sum);
    } catch (e) {
      console.error(e);
    }
  }

  async function generateClosing(e) {
    e.preventDefault();
    if (selectedVouchersForClose.length === 0) {
      alert('Nenhum voucher disponível para fechamento no período.');
      return;
    }
    const provId = document.getElementById('closeProvider').value;
    const select = document.getElementById('closeProvider');
    const provName = select.options[select.selectedIndex].text.split(' (')[0];
    const today = new Date();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    const protocol = `ZS-${today.getDate().toString().padStart(2, '0')}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getFullYear()}-${rand}`;
    const totalVal = selectedVouchersForClose.reduce((acc, curr) => acc + parseFloat(curr.valor), 0);
    const voucherIds = selectedVouchersForClose.map(v => v.id);
    try {
      await supaReq('POST', 'beneficios_fechamentos', {
        id: _benId('ben_fec_'),
        protocolo: protocol,
        prestador_id: provId,
        prestador_name: provName,
        data_inicial: document.getElementById('closeDateStart').value,
        data_final: document.getElementById('closeDateEnd').value,
        valor_total: totalVal,
        status: 'em_processamento',
        voucher_ids: voucherIds,
      });
      for (const vId of voucherIds) {
        await supaReq('PATCH', 'beneficios_vouchers', {
          fechamento_protocolo: protocol,
          status: 'em_processamento',
        }, `?id=eq.${vId}`);
      }
      alert(`Fechamento gerado com sucesso! Protocolo: ${protocol}`);
      document.getElementById('closingForm').reset();
      selectedVouchersForClose = [];
      await loadAllData();
    } catch (err) {
      alert('Erro ao gerar fechamento: ' + err.message);
    }
  }

  async function loadClosings() {
    const list = await supaReq('GET', 'beneficios_fechamentos', null, '?status=eq.em_processamento&order=created_at.desc');
    const tbody = document.getElementById('fechamentosTbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!list || list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum fechamento pendente.</td></tr>';
      return;
    }
    list.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${c.protocolo}</strong></td>
        <td>${c.prestador_name}</td>
        <td>${c.data_inicial} até ${c.data_final}</td>
        <td>${formatCurrency(c.valor_total)}</td>
        <td><span class="badge badge-warning">Em Processamento</span></td>
        <td><button class="btn btn-outline btn-sm btn-success" onclick="approveClosing('${c.id}', '${c.protocolo}')">Aprovar Payout</button></td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function approveClosing(id, protocol) {
    try {
      await supaReq('PATCH', 'beneficios_fechamentos', { status: 'pago' }, `?id=eq.${id}`);
      const vouchers = await supaReq('GET', 'beneficios_vouchers', null, `?fechamento_protocolo=eq.${protocol}`);
      if (vouchers) {
        for (const v of vouchers) {
          await supaReq('PATCH', 'beneficios_vouchers', { status: 'pago' }, `?id=eq.${v.id}`);
        }
      }
      alert('Fechamento e pagamento aprovados!');
      await loadAllData();
    } catch (e) {
      alert('Erro ao aprovar fechamento: ' + e.message);
    }
  }

  async function loadReportVouchers() {
    const prot = document.getElementById('repProtocol').value.trim();
    const tbody = document.getElementById('repVouchersTbody');
    tbody.innerHTML = '';
    if (!prot) {
      alert('Por favor, informe o protocolo do fechamento.');
      return;
    }
    try {
      const list = await supaReq('GET', 'beneficios_vouchers', null, `?fechamento_protocolo=eq.${prot}`);
      if (!list || list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Nenhum voucher encontrado para o protocolo.</td></tr>';
        return;
      }
      list.forEach(v => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${v.voucher_no}</strong></td>
          <td>${v.employee_name}</td>
          <td>${formatCurrency(v.valor)}</td>
          <td>${new Date(v.created_at).toLocaleDateString('pt-BR')}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {
      alert('Erro ao buscar vouchers: ' + e.message);
    }
  }

  async function searchSingleVoucher() {
    const vNo = document.getElementById('searchVoucherNo').value.trim();
    const resultDiv = document.getElementById('voucherSearchResult');
    resultDiv.style.display = 'none';
    if (!vNo) {
      alert('Informe o número do voucher.');
      return;
    }
    try {
      const list = await supaReq('GET', 'beneficios_vouchers', null, `?voucher_no=eq.${vNo}&limit=1`);
      if (!list || list.length === 0) {
        alert('Voucher não encontrado.');
        return;
      }
      const v = list[0];
      resultDiv.innerHTML = `
        <h4 style="margin-top:0;">Voucher: ${v.voucher_no}</h4>
        <p><strong>Funcionário:</strong> ${v.employee_name}</p>
        <p><strong>Prestador:</strong> ${v.prestador_name}</p>
        <p><strong>Valor:</strong> ${formatCurrency(v.valor)}</p>
        <p><strong>Situação:</strong> <span class="badge ${v.status === 'pago' ? 'badge-success' : 'badge-warning'}">${v.status}</span></p>
        <p><strong>Data de Emissão:</strong> ${new Date(v.created_at).toLocaleString('pt-BR')}</p>
      `;
      resultDiv.style.display = 'block';
    } catch (e) {
      alert('Erro ao buscar voucher: ' + e.message);
    }
  }

  async function loadClosingsHistory() {
    const list = await supaReq('GET', 'beneficios_fechamentos', null, '?order=created_at.desc');
    const tbody = document.getElementById('fechamentosEmitidosTbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!list || list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum fechamento emitido.</td></tr>';
      return;
    }
    list.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${c.protocolo}</strong></td>
        <td>${c.prestador_name}</td>
        <td>${c.data_inicial} até ${c.data_final}</td>
        <td>${formatCurrency(c.valor_total)}</td>
        <td><span class="badge ${c.status === 'pago' ? 'badge-success' : 'badge-warning'}">${c.status === 'pago' ? 'Pago' : 'Pagamento Programado'}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function loadAllData() {
    const errBox = document.getElementById('beneficiosLoadError');
    if (errBox) errBox.style.display = 'none';
    try {
      await loadLimitRequests();
      await loadProviders();
      await loadActiveOrders();
      await loadClosings();
      await loadClosingsHistory();
    } catch (e) {
      console.error('Erro ao carregar painel:', e);
      if (errBox) {
        errBox.style.display = 'block';
        errBox.textContent = 'Não foi possível carregar o painel de benefícios. Atualize a página (Ctrl+F5).';
      }
    }
  }

  async function init() {
    if (!document.getElementById('limitesTbody')) return;
    currentUser = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    if (!currentUser || !Auth.canManageBeneficios(currentUser.role)) return;
    await loadAllData();
  }

  async function bootStandalone() {
    if (typeof DB !== 'undefined' && DB.init) await DB.init();
    currentUser = Auth.getSession();
    if (!currentUser || !Auth.canManageBeneficios(currentUser.role)) {
      window.location.replace(Auth.pageHref('clube-beneficios.html'));
      return;
    }
    const uName = currentUser.nome_completo || currentUser.name || currentUser.username || 'Gestor';
    const av = document.getElementById('sidebarAvatar');
    const nameEl = document.getElementById('sidebarName');
    const roleEl = document.getElementById('sidebarRole');
    if (nameEl) nameEl.innerText = uName.split(' ')[0];
    if (roleEl) roleEl.innerText = currentUser.role || 'Administrador';
    if (av) {
      av.textContent = uName.charAt(0).toUpperCase();
      av.style.display = 'flex';
      av.style.alignItems = 'center';
      av.style.justifyContent = 'center';
      av.style.color = '#fff';
      av.style.fontWeight = 'bold';
    }
    await loadAllData();
  }

  const api = {
    init,
    bootStandalone,
    loadAllData,
    switchTab,
    openApproveModal,
    closeApproveModal,
    confirmLimitApproval,
    saveProvider,
    saveProduct,
    approveOrder,
    loadProviderVouchers,
    generateClosing,
    approveClosing,
    loadReportVouchers,
    searchSingleVoucher,
  };

  g.BeneficiosAdmin = api;
  Object.assign(g, {
    switchTab,
    openApproveModal,
    closeApproveModal,
    confirmLimitApproval,
    saveProvider,
    saveProduct,
    approveOrder,
    loadProviderVouchers,
    generateClosing,
    approveClosing,
    loadReportVouchers,
    searchSingleVoucher,
    loadAllData,
  });

  if (/\/admin-beneficios\.html/i.test(g.location.pathname || '')) {
    g.addEventListener('DOMContentLoaded', () => { bootStandalone(); });
  }
})(window);
