/* Gestão Clube Benefícios — master/financeiro */
(function (g) {
  'use strict';

  let currentUser = null; //gera uma variável global pra armazenar usuário 
  let selectedVouchersForClose = []; //array vazio  

  function _benId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  } //gerador de ID único       

  function formatCurrency(val) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  } // formato pra R$ 

  function _formatPedidoDescricao(v) { //recebe pedido 
    let d = v?.detalhes_pedido; // pega detalhes de um pedido (Dentro de v, pegue a propriedade detalhes_pedido e coloque dentro de d)
    if (typeof d === 'string') {
      try { d = JSON.parse(d); } catch (_) { d = null; }
    } // uma conversão segurar de JSON pra Objeto
    if (!d || typeof d !== 'object') return '—';
    const parts = [];
    const itens = Array.isArray(d.itens) ? d.itens : [];
    if (itens.length) {
      parts.push(itens.map((it) => {
        const nome = String(it.name || it.nome || it.sku || 'Item').trim();
        const qtd = parseInt(it.qty ?? it.qtd ?? it.quantidade ?? 1, 10) || 1;
        return `${qtd}x ${nome}`;
      }).join(', '));
    }
    if (d.modo) {
      parts.push(d.modo === 'entrega' ? 'Entrega' : (d.modo === 'retirada' ? 'Retirada' : String(d.modo)));
    }
    if (d.horario_entrega) parts.push(`Horário: ${d.horario_entrega}`);
    if (d.observacoes) parts.push(`Obs: ${d.observacoes}`);
    if (d.origem === 'mercadinho') parts.push('Mercadinho');
    if (Array.isArray(d.carnes) && d.carnes.length) parts.push(`Carnes: ${d.carnes.join(', ')}`);
    return parts.length ? parts.join(' · ') : '—';
  } //Ela pega os detalhes do pedido, que podem estar em JSON, transforma o JSON em objeto e depois transforma os dados desse objeto em um texto legível.

  function switchTab(tabId, el) {
    document.querySelectorAll('.menu-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => { c.style.display = 'none'; });
    if (el) el.classList.add('active');
    const panel = document.getElementById(`tab-${tabId}`);
    if (panel) panel.style.display = 'block';
  } //controla qual aba está ativa e qual conteúdo aparece na tela

  const _VOUCHER_DEBIT_STATUSES = new Set(['em_analise', 'utilizado', 'em_processamento', 'pago']); // seta status  

  function _sumVoucherUtilizado(vouchers) { //receb vouchers, garante q seja um array filtra e soma 
    return (Array.isArray(vouchers) ? vouchers : [])
      .filter((v) => _VOUCHER_DEBIT_STATUSES.has(String(v.status || '').toLowerCase()))
      .reduce((acc, v) => acc + (parseFloat(v.valor) || 0), 0);
  } // soma de débitos 

  function _limitBalances(aprovado, utilizado) {
    const approved = Math.max(0, Math.round((parseFloat(aprovado) || 0) * 100) / 100);
    const used = Math.max(0, Math.min(approved, Math.round((parseFloat(utilizado) || 0) * 100) / 100));
    const available = Math.max(0, Math.round((approved - used) * 100) / 100);
    return { aprovado: approved, utilizado: used, disponivel: available };
  } //limita os valores aprovado/utilizado e calcula o saldo disponível.

  function _escAttr(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  } //protege/escapa valores antes de inseri-los em atributos HTML, convertendo caracteres especiais em entidades HTML.

  function _ensureManualDebitModal() {
    let modal = document.getElementById('manualDebitModal');
    if (modal) return modal;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-overlay" id="manualDebitModal">
        <div class="modal" style="max-width:480px;">
          <div class="modal-header">
            <h3>Lançar débito manual</h3>
            <button type="button" class="modal-close" onclick="closeManualDebitModal()"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="manualDebitLimitId"/>
            <input type="hidden" id="manualDebitEmployeeId"/>
            <div class="form-group"><label>Funcionário</label><input type="text" id="manualDebitName" class="form-control" readonly/></div>
            <div class="form-group"><label>Disponível agora</label><input type="text" id="manualDebitDisponivel" class="form-control" readonly/></div>
            <div class="form-group"><label>Valor do débito (R$)</label><input type="number" id="manualDebitValor" class="form-control" min="0.01" step="0.01" placeholder="0,00"/></div>
            <div class="form-group"><label>Descrição / o que foi comprado</label><input type="text" id="manualDebitDesc" class="form-control" placeholder="Ex.: Marmitas semana 10/07"/></div>
            <div class="form-group"><label>Estabelecimento (opcional)</label><input type="text" id="manualDebitPrestador" class="form-control" placeholder="Ex.: Restaurante ZS"/></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeManualDebitModal()">Cancelar</button>
            <button type="button" class="btn btn-primary" onclick="confirmManualDebit()">Lançar débito</button>
          </div>
        </div>
      </div>`);
    return document.getElementById('manualDebitModal');
  } //verifica se o modal de lançamento de débito manual existe; se não existir, cria o HTML do modal e retorna o elemento.

  async function loadLimitRequests() {
    const tbody = document.getElementById('limitesTbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Carregando acompanhamento…</td></tr>';

    let list = [];
    let vouchers = [];
    try {
      if (typeof _cacheDel === 'function') {
        try { _cacheDel('beneficios_limites'); _cacheDel('beneficios_vouchers'); } catch (_) { /* noop */ }
      }
      [list, vouchers] = await Promise.all([
        supaReq('GET', 'beneficios_limites', null, '?order=created_at.desc&limit=500'),
        supaReq('GET', 'beneficios_vouchers', null, '?select=id,employee_id,valor,status&limit=2000'),
      ]);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center">Erro ao carregar: ${e.message || e}</td></tr>`;
      return;
    }

    list = Array.isArray(list) ? list : [];
    vouchers = Array.isArray(vouchers) ? vouchers : [];
    const usedByEmp = {};
    vouchers.forEach((v) => {
      const eid = String(v.employee_id || '');
      if (!eid) return;
      if (!_VOUCHER_DEBIT_STATUSES.has(String(v.status || '').toLowerCase())) return;
      usedByEmp[eid] = (usedByEmp[eid] || 0) + (parseFloat(v.valor) || 0);
    });

    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum limite cadastrado.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    list.forEach((item) => {
      const tr = document.createElement('tr');
      const phones = `${item.contato1 || '—'}<br/>${item.contato2 || ''}`;
      let docBtn = '—';
      if (item.documento_url) {
        docBtn = `<a href="${_escAttr(item.documento_url)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm">📎 Ver</a>`;
      }
      const empId = String(item.employee_id || '');
      const aprovado = parseFloat(item.limite_aprovado) || 0;
      const usedFromVouchers = empId ? (usedByEmp[empId] || 0) : (parseFloat(item.limite_utilizado) || 0);
      const bal = _limitBalances(aprovado, usedFromVouchers);
      const status = String(item.status || '');
      let actionBtn = '—';
      if (status === 'solicitado') {
        actionBtn = `<button type="button" class="btn btn-primary btn-sm js-approve-limit" data-limit-id="${_escAttr(item.id)}" data-emp-name="${_escAttr(item.employee_name || '')}">Aprovar / Recusar</button>`;
      } else if (status === 'aprovado') {
        actionBtn = `<button type="button" class="btn btn-outline btn-sm js-manual-debit" data-limit-id="${_escAttr(item.id)}" data-emp-id="${_escAttr(empId)}" data-emp-name="${_escAttr(item.employee_name || '')}" data-disponivel="${bal.disponivel}">Lançar débito</button>`;
      }
      const valorCell = status === 'aprovado'
        ? `<div style="font-size:12px;line-height:1.45;">
            <div><strong>${formatCurrency(bal.aprovado)}</strong> aprovado</div>
            <div style="color:var(--color-text-muted);">Usado: ${formatCurrency(bal.utilizado)}</div>
            <div style="color:#059669;font-weight:700;">Disponível: ${formatCurrency(bal.disponivel)}</div>
          </div>`
        : `<div style="font-size:12px;line-height:1.45;">
            <div>${formatCurrency(aprovado || 0)}</div>
            <div style="color:var(--color-text-muted);">Aguardando aprovação</div>
          </div>`;
      tr.innerHTML = `
        <td><strong>${_escAttr(item.employee_name || '—')}</strong></td>
        <td>${phones}</td>
        <td><span class="badge ${status === 'aprovado' ? 'badge-success' : 'badge-warning'}">${_escAttr(status || '—')}</span></td>
        <td>${valorCell}</td>
        <td>${docBtn}</td>
        <td>${actionBtn}</td>
      `;
      tbody.appendChild(tr);
    });

    if (!tbody._benLimitesBound) {
      tbody._benLimitesBound = true;
      tbody.addEventListener('click', (ev) => {
        const debitBtn = ev.target.closest('.js-manual-debit');
        if (debitBtn) {
          openManualDebitModal(
            debitBtn.getAttribute('data-limit-id'),
            debitBtn.getAttribute('data-emp-id'),
            debitBtn.getAttribute('data-emp-name')
          );
          return;
        }
        const approveBtn = ev.target.closest('.js-approve-limit');
        if (approveBtn) {
          openApproveModal(
            approveBtn.getAttribute('data-limit-id'),
            approveBtn.getAttribute('data-emp-name')
          );
        }
      });
    }
  } // Busca limites e vouchers da API.
    // Calcula o valor utilizado por funcionário.
    // Calcula os saldos.
    // Monta/atualiza a tabela de acompanhamento.

  function openApproveModal(id, name) {
    const modal = document.getElementById('approveLimitModal');
    const idEl = document.getElementById('modalReqId');
    const nameEl = document.getElementById('modalReqName');
    if (idEl) idEl.value = id || '';
    if (nameEl) nameEl.value = name || '';
    if (modal) {
      modal.style.display = '';
      modal.classList.add('open');
    }
  } //preenche o ID e o nome do funcionário no modal de aprovação e abre o modal.

  function closeApproveModal() {
    const modal = document.getElementById('approveLimitModal');
    if (modal) {
      modal.classList.remove('open');
      modal.style.display = '';
    }
  } //remove a classe open e limpa o display do modal, fazendo com que o modal de aprovação seja fechado.

  async function openManualDebitModal(limitId, employeeId, name) {
    const modal = _ensureManualDebitModal();
    if (!modal) {
      alert('Modal de débito não encontrado. Atualize a página (Ctrl+F5).');
      return;
    }
    document.getElementById('manualDebitLimitId').value = limitId || '';
    document.getElementById('manualDebitEmployeeId').value = employeeId || '';
    document.getElementById('manualDebitName').value = name || '';
    document.getElementById('manualDebitValor').value = '';
    document.getElementById('manualDebitDesc').value = '';
    document.getElementById('manualDebitPrestador').value = '';
    let disponivelTxt = '—';
    try {
      if (typeof _cacheDel === 'function') {
        try { _cacheDel('beneficios_limites'); _cacheDel('beneficios_vouchers'); } catch (_) { /* noop */ }
      }
      const [rows, vouchers] = await Promise.all([
        supaReq('GET', 'beneficios_limites', null, `?id=eq.${encodeURIComponent(limitId)}&limit=1`),
        employeeId
          ? supaReq('GET', 'beneficios_vouchers', null, `?employee_id=eq.${encodeURIComponent(employeeId)}&select=valor,status&limit=500`)
          : Promise.resolve([]),
      ]);
      const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
      if (row) {
        const used = _sumVoucherUtilizado(vouchers);
        const bal = _limitBalances(row.limite_aprovado, used);
        disponivelTxt = formatCurrency(bal.disponivel);
        modal.dataset.aprovado = String(bal.aprovado);
        modal.dataset.utilizado = String(bal.utilizado);
        modal.dataset.disponivel = String(bal.disponivel);
      }
    } catch (e) {
      console.warn('[Beneficios] openManualDebitModal:', e?.message || e);
    }
    document.getElementById('manualDebitDisponivel').value = disponivelTxt;
    modal.style.display = '';
    modal.classList.add('open');
  } // Prepara o modal de lançamento de débito.
    // Preenche os dados do funcionário.
    // Limpa os campos anteriores.
    // Busca o limite e os vouchers atualizados.
    // Calcula o valor disponível.
    // Por fim, abre o modal.
      
  function closeManualDebitModal() {
    const modal = document.getElementById('manualDebitModal');
    if (modal) {
      modal.classList.remove('open');
      modal.style.display = '';
    }
  } //Fecha o modal de lançamento de débito, removendo a classe open e limpando o display

    async function confirmManualDebit() {
      const modal = document.getElementById('manualDebitModal');
      const limitId = document.getElementById('manualDebitLimitId')?.value;
      const employeeId = document.getElementById('manualDebitEmployeeId')?.value;
      const employeeName = document.getElementById('manualDebitName')?.value || '';
      const valor = Math.round((parseFloat(document.getElementById('manualDebitValor')?.value) || 0) * 100) / 100;
      const desc = String(document.getElementById('manualDebitDesc')?.value || '').trim();
      const prestadorName = String(document.getElementById('manualDebitPrestador')?.value || '').trim() || 'Débito Manual';
      if (!limitId) {
        alert('Registro de limite inválido.');
        return;
      }
      if (!employeeId) {
        alert('Este limite não está vinculado a um login. Vincule o colaborador no RH antes de lançar o débito.');
        return;
      }
      if (valor <= 0) {
        alert('Informe um valor maior que zero.');
        return;
      }
      if (!desc) {
        alert('Informe a descrição do que foi comprado.');
        return;
      }
      const disponivel = parseFloat(modal?.dataset?.disponivel) || 0;
      if (valor > disponivel + 0.009) {
        alert(`O valor excede o limite disponível (${formatCurrency(disponivel)}).`);
        return;
      }
      try {
        const today = new Date();
        const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
        const voucherNo = `MAN-${today.getDate().toString().padStart(2, '0')}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getFullYear()}-${rand}`;
        const voucherPayload = {
          id: _benId('ben_vou_'),
          voucher_no: voucherNo,
          employee_id: employeeId,
          employee_name: employeeName,
          prestador_id: 'manual',
          prestador_name: prestadorName,
          categoria: 'Débito Manual',
          valor,
          status: 'utilizado',
          detalhes_pedido: {
            origem: 'debito_manual',
            observacoes: desc,
            itens: [{ name: desc, qty: 1 }],
          },
          created_at: (typeof DB !== 'undefined' && typeof DB._nowBrazilSql === 'function')
            ? DB._nowBrazilSql()
            : undefined,
        };
        await supaReq('POST', 'beneficios_vouchers', voucherPayload);
        if (typeof DB !== 'undefined' && typeof DB.registerOpenAccountDebito === 'function') {
          try {
            await DB.registerOpenAccountDebito({
              employeeId,
              amount: valor,
              reason: `Débito Clube ${voucherNo}${desc ? ' — ' + desc : ''}`,
              byUser: (typeof Auth !== 'undefined' && Auth.getSession()?.id) || 'admin',
              voucherId: voucherPayload.id,
              voucherNo,
              source: 'clube',
            });
          } catch (regErr) {
            console.warn('[admin-beneficios] lançamento débito aberto:', regErr);
          }
        }
        const aprovado = parseFloat(modal?.dataset?.aprovado) || 0;
        const utilizadoAtual = parseFloat(modal?.dataset?.utilizado) || 0;
        const balances = _limitBalances(aprovado, utilizadoAtual + valor);
        await supaReq('PATCH', 'beneficios_limites', {
          limite_utilizado: balances.utilizado,
          limite_disponivel: balances.disponivel,
          status: 'aprovado',
        }, `?id=eq.${encodeURIComponent(limitId)}`);
        alert(`Débito lançado: ${formatCurrency(valor)}\nVoucher: ${voucherNo}`);
        closeManualDebitModal();
        await loadAllData();
      } catch (e) {
        alert('Erro ao lançar débito: ' + (e.message || e));
      }
    }// Confirma o lançamento de um débito manual.
     // Valida os dados e o saldo disponível.
     // Cria o voucher e registra o débito.
     // Atualiza o limite utilizado e disponível.
     // Fecha o modal e atualiza os dados da tela.
    // usuario informa debito, confirma, valida, tem limite ? tem funcionario ? valor > 0, tem descrição , SIM? , cria voucher, registra e atualiza   

  async function confirmLimitApproval() {
    const id = document.getElementById('modalReqId').value;
    const val = parseFloat(document.getElementById('modalReqLimit').value) || 0;
    try {
      const existing = await supaReq('GET', 'beneficios_limites', null, `?id=eq.${encodeURIComponent(id)}&limit=1`);
      const row = Array.isArray(existing) && existing[0] ? existing[0] : null;
      const utilizado = row ? (parseFloat(row.limite_utilizado) || 0) : 0;
      const disponivel = Math.max(0, Math.round((val - utilizado) * 100) / 100);
      await supaReq('PATCH', 'beneficios_limites', {
        limite_aprovado: val,
        limite_utilizado: utilizado,
        limite_disponivel: disponivel,
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
      const waRaw = String(document.getElementById('provWhatsapp')?.value || '').replace(/\D/g, '');
      const cnpj = String(document.getElementById('provCpfCnpj').value || '').replace(/\D/g, '');
      const payload = {
        nome_fantasia: document.getElementById('provNome').value,
        cnpj_cpf: document.getElementById('provCpfCnpj').value,
        chave_pix: document.getElementById('provPix').value,
        dia_pagamento: parseInt(document.getElementById('provDiaPgto').value, 10) || 5,
        categoria: document.getElementById('provCategoria').value,
        pagamento_automatico: document.getElementById('provAutoPgto').value,
        whatsapp: waRaw || null,
      };
      let existing = null;
      if (cnpj) {
        try {
          const rows = await supaReq('GET', 'beneficios_prestadores', null,
            `?cnpj_cpf=eq.${encodeURIComponent(cnpj)}&limit=1`);
          existing = Array.isArray(rows) && rows[0] ? rows[0] : null;
        } catch (_) { existing = null; }
      }
      if (existing?.id) {
        await supaReq('PATCH', 'beneficios_prestadores', payload, `?id=eq.${encodeURIComponent(existing.id)}`);
        alert('Prestador atualizado (WhatsApp/dados salvos)!');
      } else {
        await supaReq('POST', 'beneficios_prestadores', {
          id: _benId('ben_pre_'),
          codigo_parceiro: 'PRT-' + Date.now().toString(36).toUpperCase(),
          ...payload,
        });
        alert('Prestador cadastrado com sucesso!');
      }
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
      const detailsStr = _formatPedidoDescricao(v).replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const vid = _escAttr(v.id);
      const actions = [];
      if (v.status === 'em_analise') {
        actions.push(`<button type="button" class="btn btn-outline btn-sm btn-success" onclick="approveOrder('${vid}')">Aprovar</button>`);
      }
      actions.push(`<button type="button" class="btn btn-outline btn-sm" style="color:#b91c1c;border-color:#fca5a5;" onclick="deleteMealOrder('${vid}')">Apagar</button>`);
      tr.innerHTML = `
        <td><strong>${_escAttr(v.voucher_no)}</strong></td>
        <td>${_escAttr(v.employee_name || '—')}</td>
        <td>${_escAttr(v.prestador_name || '—')}</td>
        <td>${formatCurrency(v.valor)}</td>
        <td style="font-size:12px; line-height:1.4; max-width:320px;">${detailsStr}</td>
        <td><span class="badge ${v.status === 'pago' ? 'badge-success' : 'badge-warning'}">${_escAttr(v.status || '—')}</span></td>
        <td style="white-space:nowrap;display:flex;gap:6px;flex-wrap:wrap;">${actions.join('')}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function approveOrder(id) {
    try {
      await supaReq('PATCH', 'beneficios_vouchers', { status: 'utilizado' }, `?id=eq.${encodeURIComponent(id)}`);
      alert('Pedido/Voucher aprovado com sucesso!');
      await loadAllData();
    } catch (e) {
      alert('Erro ao aprovar pedido: ' + e.message);
    }
  }

  /** Apaga pedido de teste / incorreto e estorna o valor no limite do colaborador. */
  async function deleteMealOrder(id) {
    if (!id) return;
    if (!confirm('Apagar este pedido? Se o valor estava debitado no Clube, ele será estornado.')) return;
    try {
      const rows = await supaReq('GET', 'beneficios_vouchers', null,
        `?id=eq.${encodeURIComponent(id)}&select=id,employee_id,valor,status,voucher_no&limit=1`);
      const v = Array.isArray(rows) && rows[0] ? rows[0] : null;
      if (!v) {
        alert('Pedido não encontrado.');
        return;
      }
      await supaReq('DELETE', 'beneficios_vouchers', null, `?id=eq.${encodeURIComponent(id)}`);

      const st = String(v.status || '').toLowerCase();
      const empId = String(v.employee_id || '').trim();
      const valor = parseFloat(v.valor) || 0;
      if (empId && valor > 0 && _VOUCHER_DEBIT_STATUSES.has(st)) {
        const lims = await supaReq('GET', 'beneficios_limites', null,
          `?employee_id=eq.${encodeURIComponent(empId)}&order=created_at.desc&limit=1`);
        const lim = Array.isArray(lims) && lims[0] ? lims[0] : null;
        if (lim?.id) {
          const used = Math.max(0, (parseFloat(lim.limite_utilizado) || 0) - valor);
          const bal = _limitBalances(lim.limite_aprovado, used);
          await supaReq('PATCH', 'beneficios_limites', {
            limite_utilizado: bal.utilizado,
            limite_disponivel: bal.disponivel,
          }, `?id=eq.${encodeURIComponent(lim.id)}`);
        }
      }

      alert(`Pedido ${v.voucher_no || id} apagado.`);
      await loadAllData();
    } catch (e) {
      alert('Erro ao apagar pedido: ' + (e.message || e));
    }
  }

  async function loadProviderVouchers() {
    const provId = document.getElementById('closeProvider').value;
    if (!provId) return;
    const dateStart = document.getElementById('closeDateStart').value || '1970-01-01';
    const dateEnd = document.getElementById('closeDateEnd').value || new Date().toISOString().split('T')[0];
    try {
      const select = document.getElementById('closeProvider');
      const provName = (select?.options[select.selectedIndex]?.text || '').split(' (')[0].trim().toUpperCase();
      const vouchers = await supaReq('GET', 'beneficios_vouchers', null,
        '?status=eq.utilizado&order=created_at.desc&limit=1000');
      selectedVouchersForClose = (vouchers || []).filter(v => {
        if (v.fechamento_protocolo) return false;
        const sameId = String(v.prestador_id) === String(provId);
        const sameName = provName && String(v.prestador_name || '').trim().toUpperCase() === provName;
        if (!sameId && !sameName) return false;
        // created_at pode vir "2026-07-16 13:20:00" (MySQL) ou ISO com "T"
        const d = String(v.created_at || '').slice(0, 10);
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
          <td>${formatDate(v.created_at)}</td>
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
        <p><strong>Data de Emissão:</strong> ${formatDateTime(v.created_at)}</p>
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
    openManualDebitModal,
    closeManualDebitModal,
    confirmManualDebit,
    saveProvider,
    saveProduct,
    approveOrder,
    deleteMealOrder,
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
    openManualDebitModal,
    closeManualDebitModal,
    confirmManualDebit,
    saveProvider,
    saveProduct,
    approveOrder,
    deleteMealOrder,
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
