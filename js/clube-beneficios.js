/* Clube Benefícios — funcionários / vendedores */
(function (g) {
  'use strict';

  let currentUser = null;
  let currentLimit = null;
  let orderMode = 'entrega';
  let _orderSubmitting = false;

  function _benId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function _isSakUser(user) {
    const norm = (v) => String(v || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
    const name = norm(user?.name || '');
    if (name.includes('SAK') && name.includes('CADASTRAIS')) return true;
    const email = String(user?.email || '').toLowerCase();
    if (email.includes('@sakpromotora.') || email.includes('@sakservicos.') || email.includes('@sak.')) return true;
    const razao = norm(typeof window !== 'undefined' ? window.PARTNER_RAZAO_SOCIAL : '');
    if (razao.includes('SAK') && razao.includes('CADASTRAIS')) return true;
    if (typeof window !== 'undefined' && typeof window._isSakPartnerNetwork === 'function') {
      return !!window._isSakPartnerNetwork();
    }
    return false;
  }

  function _hasClubeAccess(user) {
    if (!user) return false;
    const role = String(user.role || '').toLowerCase();
    if (['admin', 'master', 'portaria', 'fundador', 'financeiro', 'financial'].includes(role)) return true;
    // Parceiros (e equipe de rede parceira): só SAK mantém Clube.
    const inPartnerOrg = !!(typeof window !== 'undefined' && window.PARTNER_ROOT_ID)
      || role === 'parceiro';
    if (inPartnerOrg && !_isSakUser(user)) return false;
    if (user.acesso_clube === false || user.acesso_clube === 0 || user.acesso_clube === '0') return false;
    // Liberado para todos os usuários internos — só parceiros (não-SAK) ficam fora
    return role !== 'parceiro';
  }

  function formatCurrency(val) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  }

  /** Extrai texto legível do que foi pedido (itens, modo, obs) a partir de detalhes_pedido. */
  function _formatPedidoDescricao(v) {
    let d = v?.detalhes_pedido;
    if (typeof d === 'string') {
      try { d = JSON.parse(d); } catch (_) { d = null; }
    }
    if (!d || typeof d !== 'object') return '—';
    const parts = [];
    const itens = Array.isArray(d.itens) ? d.itens : [];
    if (itens.length) {
      const lines = itens.map((it) => {
        const nome = String(it.name || it.nome || it.sku || 'Item').trim();
        const qtd = parseInt(it.qty ?? it.qtd ?? it.quantidade ?? 1, 10) || 1;
        return `${qtd}x ${nome}`;
      });
      parts.push(lines.join(', '));
    }
    if (d.modo) {
      const modoLabel = d.modo === 'entrega' ? 'Entrega' : (d.modo === 'retirada' ? 'Retirada' : String(d.modo));
      parts.push(modoLabel);
    }
    if (d.horario_entrega) parts.push(`Horário: ${d.horario_entrega}`);
    if (d.observacoes) parts.push(`Obs: ${d.observacoes}`);
    if (d.origem === 'mercadinho') parts.push('Mercadinho');
    if (Array.isArray(d.carnes) && d.carnes.length) parts.push(`Carnes: ${d.carnes.join(', ')}`);
    return parts.length ? parts.join(' · ') : '—';
  }

  const _VOUCHER_DEBIT_STATUSES = new Set(['em_analise', 'utilizado', 'em_processamento', 'pago']);

  function _sumVoucherUtilizado(vouchers) {
    return (Array.isArray(vouchers) ? vouchers : [])
      .filter((v) => _VOUCHER_DEBIT_STATUSES.has(String(v.status || '').toLowerCase()))
      .reduce((acc, v) => acc + (parseFloat(v.valor) || 0), 0);
  }

  function _computeLimitBalances(aprovado, utilizado) {
    const approved = Math.max(0, Math.round((parseFloat(aprovado) || 0) * 100) / 100);
    const used = Math.max(0, Math.min(approved, Math.round((parseFloat(utilizado) || 0) * 100) / 100));
    const available = Math.max(0, Math.round((approved - used) * 100) / 100);
    return { aprovado: approved, utilizado: used, disponivel: available };
  }

  function _renderLimitUI(limitRow) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    if (!limitRow || (parseFloat(limitRow.limite_aprovado) || 0) <= 0) {
      set('valAprovado', formatCurrency(0));
      set('valUtilizado', formatCurrency(0));
      set('valDisponivel', formatCurrency(0));
      set('topbarBalance', formatCurrency(0));
      set('heroDisponivelHint', formatCurrency(0));
      set('distTotalAvailable', formatCurrency(0));
      return;
    }
    set('valAprovado', formatCurrency(limitRow.limite_aprovado));
    set('valUtilizado', formatCurrency(limitRow.limite_utilizado));
    set('valDisponivel', formatCurrency(limitRow.limite_disponivel));
    set('topbarBalance', formatCurrency(limitRow.limite_disponivel));
    set('heroDisponivelHint', formatCurrency(limitRow.limite_disponivel));
    set('distTotalAvailable', formatCurrency(limitRow.limite_aprovado));
  }

  async function _reconcileLimitRow(limitRow, vouchers) {
    if (!limitRow?.id) return limitRow;
    const usedFromVouchers = _sumVoucherUtilizado(vouchers);
    const balances = _computeLimitBalances(limitRow.limite_aprovado, usedFromVouchers);
    const storedUsed = parseFloat(limitRow.limite_utilizado) || 0;
    const storedAvail = parseFloat(limitRow.limite_disponivel) || 0;
    const nextStatus = balances.aprovado > 0 ? 'aprovado' : (limitRow.status || 'solicitado');
    const patch = {
      limite_utilizado: balances.utilizado,
      limite_disponivel: balances.disponivel,
      status: nextStatus,
    };
    const drift = Math.abs(storedUsed - balances.utilizado) > 0.009
      || Math.abs(storedAvail - balances.disponivel) > 0.009
      || String(limitRow.status || '') !== nextStatus;
    if (drift) {
      try {
        await supaReq('PATCH', 'beneficios_limites', patch, `?id=eq.${limitRow.id}`);
      } catch (e) {
        console.warn('[Clube] reconcile limit:', e?.message || e);
      }
    }
    return { ...limitRow, ...patch, limite_aprovado: balances.aprovado };
  }

  async function _debitLimit(amount) {
    if (!currentLimit?.id) throw new Error('Limite não encontrado.');
    const orderVal = Math.round((parseFloat(amount) || 0) * 100) / 100;
    if (orderVal <= 0) throw new Error('Valor inválido.');
    const disponivel = parseFloat(currentLimit.limite_disponivel) || 0;
    if (orderVal > disponivel + 0.009) {
      throw new Error(`O valor excede o limite disponível (${formatCurrency(disponivel)}).`);
    }
    const balances = _computeLimitBalances(
      currentLimit.limite_aprovado,
      (parseFloat(currentLimit.limite_utilizado) || 0) + orderVal
    );
    await supaReq('PATCH', 'beneficios_limites', {
      limite_utilizado: balances.utilizado,
      limite_disponivel: balances.disponivel,
      status: 'aprovado',
    }, `?id=eq.${currentLimit.id}`);
    currentLimit = { ...currentLimit, ...balances, status: 'aprovado' };
    _renderLimitUI(currentLimit);
    return balances;
  }

  /** Estorna valor no limite (rollback se o voucher falhar após o débito). */
  async function _creditLimit(amount) {
    if (!currentLimit?.id) return null;
    const orderVal = Math.round((parseFloat(amount) || 0) * 100) / 100;
    if (orderVal <= 0) return null;
    const balances = _computeLimitBalances(
      currentLimit.limite_aprovado,
      Math.max(0, (parseFloat(currentLimit.limite_utilizado) || 0) - orderVal)
    );
    await supaReq('PATCH', 'beneficios_limites', {
      limite_utilizado: balances.utilizado,
      limite_disponivel: balances.disponivel,
      status: 'aprovado',
    }, `?id=eq.${currentLimit.id}`);
    currentLimit = { ...currentLimit, ...balances, status: 'aprovado' };
    _renderLimitUI(currentLimit);
    return balances;
  }

  function _itemsFingerprint(items) {
    return (Array.isArray(items) ? items : [])
      .map((it) => `${String(it.sku || it.name || '').trim()}|${parseInt(it.qty, 10) || 1}|${Math.round((parseFloat(it.price) || 0) * 100)}`)
      .sort()
      .join(';');
  }

  /** Evita pedido duplicado por clique duplo / retry no mesmo minuto. */
  async function _findRecentDuplicateOrder(employeeId, valor, items) {
    if (!employeeId) return null;
    const wantVal = Math.round((parseFloat(valor) || 0) * 100) / 100;
    const wantFp = _itemsFingerprint(items);
    const rows = await supaReq(
      'GET',
      'beneficios_vouchers',
      null,
      `?employee_id=eq.${encodeURIComponent(employeeId)}&status=eq.em_analise&order=created_at.desc&limit=15`
    ).catch(() => []);
    const now = Date.now();
    for (const v of (Array.isArray(rows) ? rows : [])) {
      const vVal = Math.round((parseFloat(v.valor) || 0) * 100) / 100;
      if (Math.abs(vVal - wantVal) > 0.009) continue;
      let det = v.detalhes_pedido;
      if (typeof det === 'string') {
        try { det = JSON.parse(det); } catch (_) { det = null; }
      }
      if (_itemsFingerprint(det?.itens) !== wantFp) continue;
      const created = (typeof _parseSouBluDate === 'function')
        ? _parseSouBluDate(v.created_at)
        : new Date(String(v.created_at || '').replace(' ', 'T'));
      const t = created && !Number.isNaN(created.getTime()) ? created.getTime() : 0;
      if (t && (now - t) <= 90 * 1000) return v;
    }
    return null;
  }

  function switchTab(tabId, el) {
    document.querySelectorAll('.menu-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => { c.style.display = 'none'; });
    if (el) el.classList.add('active');
    const panel = document.getElementById(`tab-${tabId}`);
    if (panel) panel.style.display = 'block';
    
    if (tabId === 'loja' && typeof StoreShop !== 'undefined') {
      StoreShop.renderBalance();
      StoreShop.renderProducts();
    } else if (tabId === 'produtos' && typeof g.renderProductsTable === 'function') {
      g.renderProductsTable();
    } else if (tabId === 'pedidos' && typeof g.renderOrdersTable === 'function') {
      g.renderOrdersTable();
    }
  }


  function setOrderMode(mode) {
    orderMode = mode;
    const btnE = document.getElementById('btnModeEntrega');
    const btnR = document.getElementById('btnModeRetirada');
    const deliveryF = document.getElementById('deliveryFields');
    if (mode === 'entrega') {
      if (btnE) { btnE.className = 'is-active btn btn-primary'; }
      if (btnR) { btnR.className = 'btn btn-outline'; }
      if (deliveryF) deliveryF.style.display = 'block';
    } else {
      if (btnE) { btnE.className = 'btn btn-outline'; }
      if (btnR) { btnR.className = 'is-active btn btn-primary'; }
      if (deliveryF) deliveryF.style.display = 'none';
    }
  }

  const CLUBE_MENU = {
    marca: { name: 'Opção marca', price: 18 },
    coca_lata: { name: 'Coca-Cola lata', price: 5 },
    coca_600: { name: 'Coca-Cola 600ml', price: 8 },
  };

  function clubeMenuQty(sku, delta) {
    const el = document.getElementById(`qty_${sku}`);
    if (!el) return;
    const next = Math.max(0, Math.min(20, (parseInt(el.value, 10) || 0) + delta));
    el.value = String(next);
    _refreshMenuTotal();
  }

  function _collectMenuItems() {
    const items = [];
    let total = 0;
    Object.keys(CLUBE_MENU).forEach((sku) => {
      const qty = parseInt(document.getElementById(`qty_${sku}`)?.value, 10) || 0;
      if (qty <= 0) return;
      const meta = CLUBE_MENU[sku];
      const sub = Math.round(meta.price * qty * 100) / 100;
      total += sub;
      items.push({ sku, name: meta.name, price: meta.price, qty, subtotal: sub });
    });
    return { items, total: Math.round(total * 100) / 100 };
  }

  function _refreshMenuTotal() {
    const { total } = _collectMenuItems();
    const totalEl = document.getElementById('orderMenuTotal');
    const hidden = document.getElementById('orderValue');
    if (totalEl) totalEl.textContent = formatCurrency(total);
    if (hidden) hidden.value = String(total);
  }

  function _resetMenuQty() {
    Object.keys(CLUBE_MENU).forEach((sku) => {
      const el = document.getElementById(`qty_${sku}`);
      if (el) el.value = '0';
    });
    _refreshMenuTotal();
  }

  function toggleMeat() {
    /* removido — pedido do restaurante sem seleção de carnes */
  }

  function renderDistribution(providers) {
    const container = document.getElementById('distribList');
    if (!container) return;
    container.innerHTML = '';
    if (!providers || providers.length === 0) {
      container.innerHTML = '<p class="text-muted">Nenhum prestador cadastrado no sistema.</p>';
      return;
    }
    const currentDist = currentLimit?.distribuicao || {};
    providers.forEach(p => {
      const val = currentDist[p.id] || 0;
      const row = document.createElement('div');
      row.className = 'limit-dist-row';
      row.innerHTML = `
        <div>
          <strong>${p.nome_fantasia}</strong>
          <div style="font-size:12px;color:var(--color-text-secondary);">${p.categoria || 'Geral'}</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span>R$</span>
          <input type="number" class="form-control dist-input" data-provider-id="${p.id}" value="${val}" style="width:100px; text-align:right;" min="0"/>
        </div>
      `;
      container.appendChild(row);
    });
  }

  async function saveDistribution() {
    if (!currentLimit) {
      alert('Você precisa ter um limite aprovado primeiro.');
      return;
    }
    if (currentLimit.last_distribution_at) {
      const lastDate = new Date(currentLimit.last_distribution_at);
      const diffDays = Math.ceil((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 45) {
        alert(`Você só pode alterar a distribuição do limite a cada 45 dias. Faltam ${45 - diffDays} dias.`);
        return;
      }
    }
    const inputs = document.querySelectorAll('.dist-input');
    const distObj = {};
    let sum = 0;
    inputs.forEach(input => {
      const val = parseFloat(input.value) || 0;
      distObj[input.dataset.providerId] = val;
      sum += val;
    });
    if (sum > currentLimit.limite_aprovado) {
      alert(`A soma dos limites distribuídos (${formatCurrency(sum)}) excede o seu limite total aprovado (${formatCurrency(currentLimit.limite_aprovado)}).`);
      return;
    }
    try {
      await supaReq('PATCH', 'beneficios_limites', {
        distribuicao: distObj,
        last_distribution_at: new Date().toISOString(),
      }, `?id=eq.${currentLimit.id}`);
      alert('Distribuição de limites atualizada com sucesso!');
      await loadUserData();
    } catch (e) {
      alert('Erro ao salvar distribuição: ' + e.message);
    }
  }

  function renderVouchers(vouchers) {
    const tbody = document.getElementById('vouchersTbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!vouchers || vouchers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum voucher emitido.</td></tr>';
      return;
    }
    vouchers.forEach(v => {
      const tr = document.createElement('tr');
      let statusBadge = '<span class="badge badge-warning">Em Processamento</span>';
      if (v.status === 'pago') statusBadge = '<span class="badge badge-success">Pago</span>';
      else if (v.status === 'recusado') statusBadge = '<span class="badge badge-danger">Recusado</span>';
      else if (v.status === 'utilizado') statusBadge = '<span class="badge badge-info">Utilizado</span>';
      const desc = _formatPedidoDescricao(v);
      const descSafe = String(desc).replace(/</g, '&lt;').replace(/>/g, '&gt;');
      tr.innerHTML = `
        <td><strong>${v.voucher_no}</strong></td>
        <td>${v.prestador_name || 'Restaurante'}</td>
        <td style="font-size:12px;line-height:1.4;max-width:280px;">${descSafe}</td>
        <td>${formatCurrency(v.valor)}</td>
        <td>${statusBadge}</td>
        <td>${formatDate(v.created_at)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function _fetchLimitRowFor(employeeId) {
    if (!employeeId) return null;
    const rows = await supaReq('GET', 'beneficios_limites', null,
      `?employee_id=eq.${encodeURIComponent(employeeId)}&order=created_at.desc&limit=1`);
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  }

  /** Limite gravado no id do cadastro RH (funcionário sem login na época):
      localiza pelo vínculo RH e re-vincula ao login atual (self-heal). */
  async function _findLimitRowSelfHeal() {
    let row = await _fetchLimitRowFor(currentUser.id);
    if (row) return row;
    /* ilike na compat local é substring ("%valor%") — confirma igualdade exata
       (sem acentos, case-insensitive) antes de aceitar o vínculo RH. */
    const _normMatch = (v) => String(v || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const rhIds = [];
    const addIds = (list, field, want) => (Array.isArray(list) ? list : []).forEach((r) => {
      if (!r?.id || rhIds.includes(r.id)) return;
      if (field && _normMatch(r[field]) !== _normMatch(want)) return;
      rhIds.push(r.id);
    });
    try {
      addIds(await supaReq('GET', 'rh_employees', null,
        `?user_id=eq.${encodeURIComponent(currentUser.id)}&select=id&limit=5`));
    } catch (_) { /* noop */ }
    const email = String(currentUser.email || '').trim().toLowerCase();
    if (!rhIds.length && email) {
      try {
        addIds(await supaReq('GET', 'rh_employees', null,
          `?email=ilike.${encodeURIComponent(email)}&select=id,email&limit=5`), 'email', email);
      } catch (_) { /* noop */ }
      try {
        addIds(await supaReq('GET', 'rh_employees', null,
          `?email_pessoal=ilike.${encodeURIComponent(email)}&select=id,email_pessoal&limit=5`), 'email_pessoal', email);
      } catch (_) { /* noop */ }
    }
    const nome = String(currentUser.name || '').trim();
    if (!rhIds.length && nome) {
      try {
        addIds(await supaReq('GET', 'rh_employees', null,
          `?nome=ilike.${encodeURIComponent(nome)}&select=id,nome&limit=5`), 'nome', nome);
      } catch (_) { /* noop */ }
    }
    for (const rhId of rhIds) {
      if (String(rhId) === String(currentUser.id)) continue;
      row = await _fetchLimitRowFor(rhId).catch(() => null);
      if (row?.id) {
        try {
          await supaReq('PATCH', 'beneficios_limites', { employee_id: currentUser.id }, `?id=eq.${encodeURIComponent(row.id)}`);
          row.employee_id = currentUser.id;
        } catch (e) {
          console.warn('[Clube] re-vincular limite:', e?.message || e);
        }
        // #region agent log
        fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'clube-selfheal',hypothesisId:'L-H2',location:'clube-beneficios.js:_findLimitRowSelfHeal',message:'limite re-vinculado do cadastro RH para o login',data:{userId:currentUser?.id||null,rhId,limitId:row.id},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        return row;
      }
    }
    return null;
  }

  async function loadUserData() {
    const errBox = document.getElementById('beneficiosLoadError');
    if (errBox) errBox.style.display = 'none';
    try {
      const vouchers = await supaReq('GET', 'beneficios_vouchers', null, `?employee_id=eq.${currentUser.id}&order=created_at.desc&limit=500`);
      const row = await _findLimitRowSelfHeal();
      // #region agent log
      fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'clube-load',hypothesisId:'H4',location:'clube-beneficios.js:loadUserData',message:'clube load limite',data:{userId:currentUser?.id||null,hasRow:!!row,aprovado:row?parseFloat(row.limite_aprovado)||0:null,status:row?.status||null,employee_id:row?.employee_id||null},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (row && (parseFloat(row.limite_aprovado) || 0) > 0) {
        currentLimit = await _reconcileLimitRow(row, vouchers);
      } else {
        currentLimit = null;
      }
      _renderLimitUI(currentLimit);
      const providers = await supaReq('GET', 'beneficios_prestadores', null, '?select=*');
      renderDistribution(providers);
      renderVouchers(vouchers);
    } catch (e) {
      console.error('Erro ao carregar dados do usuário:', e);
      if (errBox) {
        errBox.style.display = 'block';
        errBox.textContent = 'Não foi possível carregar os dados do Clube Benefícios. Atualize a página (Ctrl+F5). Se persistir, avise o suporte.';
      }
    }
  }




  function _digitsPhone(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    // Aceita (11) 9xxxx-xxxx → acrescenta 55 se parecer BR sem DDI
    if (d.length >= 10 && d.length <= 11 && !d.startsWith('55')) d = '55' + d;
    return d;
  }

  function _restauranteWhatsappFrom(provider) {
    const cfg = (typeof window !== 'undefined' && window.SOUBLU_CONFIG) ? window.SOUBLU_CONFIG : {};
    const candidates = [
      provider?.whatsapp,
      provider?.telefone,
      provider?.contato,
      provider?.phone,
      cfg.CLUBE_RESTAURANTE_WHATSAPP,
      cfg.RESTAURANTE_WHATSAPP,
      '5562991750451', // WhatsApp padrão do restaurante (Clube / marmitas)
    ];
    for (const c of candidates) {
      const d = _digitsPhone(c);
      if (d.length >= 12) return d;
    }
    return '';
  }

  function _buildFoodOrderWhatsappText({ voucherNo, providerName, items, total, detalhes }) {
    const nome = String(currentUser?.name || 'Colaborador').trim();
    const modo = detalhes?.modo === 'retirada' ? 'Retirada' : 'Entrega';
    const linhas = [
      'Olá! Já realizei meu pedido pelo *Clube ZS Benefícios*.',
      '',
      `*Voucher:* ${voucherNo}`,
      `*Funcionário:* ${nome}`,
      `*Restaurante:* ${providerName || 'Restaurante'}`,
      `*Modo:* ${modo}`,
    ];
    if (detalhes?.horario_entrega) linhas.push(`*Horário de entrega:* ${detalhes.horario_entrega}`);
    linhas.push('', '*Itens do pedido:*');
    (items || []).forEach((it) => {
      const q = parseInt(it.qty, 10) || 1;
      const n = String(it.name || it.sku || 'Item').trim();
      const sub = formatCurrency(it.subtotal || (it.price * q) || 0);
      linhas.push(`• ${q}x ${n} — ${sub}`);
    });
    linhas.push('', `*Total:* ${formatCurrency(total)}`);
    if (detalhes?.observacoes) linhas.push(`*Observações:* ${detalhes.observacoes}`);
    linhas.push('', 'Por favor, confirmar o recebimento deste pedido. Obrigado!');
    return linhas.join('\n');
  }

  function _openRestauranteWhatsapp(phone, text) {
    const digits = _digitsPhone(phone);
    if (!digits) return false;
    const url = `https://api.whatsapp.com/send?phone=${encodeURIComponent(digits)}&text=${encodeURIComponent(text)}`;
    try {
      window.open(url, '_blank', 'noopener');
      return true;
    } catch (_) {
      window.location.href = url;
      return true;
    }
  }

  async function submitFoodOrder(e) {
    e.preventDefault();
    if (_orderSubmitting) return;
    if (!currentLimit || (parseFloat(currentLimit.limite_aprovado) || 0) <= 0) {
      alert('Você precisa ter um limite aprovado pelo RH primeiro.');
      return;
    }
    const { items, total: orderVal } = _collectMenuItems();
    if (!items.length || orderVal <= 0) {
      alert('Selecione ao menos um item do cardápio.');
      return;
    }
    const disponivel = parseFloat(currentLimit.limite_disponivel) || 0;
    if (orderVal > disponivel + 0.009) {
      alert(`O valor do pedido excede o seu limite disponível (${formatCurrency(disponivel)}).`);
      return;
    }

    const form = document.getElementById('orderForm');
    const submitBtn = form?.querySelector('button[type="submit"]');
    _orderSubmitting = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.dataset._prevLabel = submitBtn.textContent || '';
      submitBtn.textContent = 'Enviando pedido…';
    }

    let debited = false;
    try {
      // Clique duplo / retry: se já existe pedido idêntico nos últimos 90s, não cria outro.
      const dup = await _findRecentDuplicateOrder(currentUser.id, orderVal, items);
      if (dup) {
        alert(`Este pedido já foi registrado (voucher ${dup.voucher_no}). Não foi criado outro.`);
        await loadUserData().catch(() => {});
        return;
      }

      const providers = await supaReq('GET', 'beneficios_prestadores', null, '?categoria=eq.Restaurante&limit=20');
      const list = Array.isArray(providers) ? providers : [];
      const provider = list.find((p) => _restauranteWhatsappFrom(p)) || list[0]
        || { id: 'rest_default', nome_fantasia: 'Restaurante Clube ZS Benefícios' };
      const today = new Date();
      const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
      const voucherNo = `ZS-${today.getDate().toString().padStart(2, '0')}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getFullYear()}-${rand}`;
      const detalhes = {
        modo: orderMode,
        horario_entrega: orderMode === 'entrega' ? document.getElementById('orderDeliveryTime')?.value : null,
        observacoes: document.getElementById('orderObs')?.value?.trim() || '',
        itens: items,
      };
      await _debitLimit(orderVal);
      debited = true;
      const voucherPayload = {
        id: _benId('ben_vou_'),
        voucher_no: voucherNo,
        employee_id: currentUser.id,
        employee_name: currentUser.name,
        prestador_id: provider.id,
        prestador_name: provider.nome_fantasia,
        categoria: 'Alimentação',
        valor: orderVal,
        status: 'em_analise',
        detalhes_pedido: detalhes,
        created_at: (typeof DB !== 'undefined' && typeof DB._nowBrazilSql === 'function')
          ? DB._nowBrazilSql()
          : undefined,
      };
      await supaReq('POST', 'beneficios_vouchers', voucherPayload);
      if (typeof DB !== 'undefined' && typeof DB.registerOpenAccountDebito === 'function') {
        try {
          await DB.registerOpenAccountDebito({
            employeeId: currentUser.id,
            amount: orderVal,
            reason: `Fatura Clube ${voucherNo}`,
            byUser: currentUser.id,
            voucherId: voucherPayload.id,
            voucherNo,
            source: 'clube',
          });
        } catch (regErr) {
          console.warn('[clube] lançamento débito aberto:', regErr);
        }
      }

      const waPhone = _restauranteWhatsappFrom(provider);
      const waText = _buildFoodOrderWhatsappText({
        voucherNo,
        providerName: provider.nome_fantasia,
        items,
        total: orderVal,
        detalhes,
      });
      const opened = waPhone ? _openRestauranteWhatsapp(waPhone, waText) : false;

      if (opened) {
        alert(`Pedido salvo! Voucher: ${voucherNo}\n\nAbrimos o WhatsApp do restaurante com a mensagem do seu pedido.`);
      } else if (waPhone) {
        alert(`Pedido salvo! Voucher: ${voucherNo}`);
      } else {
        alert(`Pedido salvo! Voucher: ${voucherNo}\n\nAviso: cadastre o WhatsApp do restaurante em Prestadores (Clube) para abrir o pedido automaticamente.`);
      }

      document.getElementById('orderForm').reset();
      _resetMenuQty();
      setOrderMode(orderMode);
      await loadUserData();
    } catch (err) {
      if (debited) {
        try { await _creditLimit(orderVal); } catch (_) { /* noop */ }
      }
      alert('Erro ao salvar pedido: ' + err.message);
      await loadUserData().catch(() => {});
    } finally {
      _orderSubmitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        if (submitBtn.dataset._prevLabel) {
          submitBtn.textContent = submitBtn.dataset._prevLabel;
          delete submitBtn.dataset._prevLabel;
        }
      }
    }
  }

  function _applySidebar(user) {
    const uName = user.nome_completo || user.name || user.username || 'Vendedor';
    const uRole = user.role === 'employee' ? 'Funcionário' : (user.role || 'Funcionário');
    const nameEl = document.getElementById('sidebarName');
    const roleEl = document.getElementById('sidebarRole');
    if (nameEl) nameEl.innerText = uName.split(' ')[0];
    if (roleEl) roleEl.innerText = uRole;
    const orderEmp = document.getElementById('orderEmpName');
    if (orderEmp) orderEmp.value = uName;
    const reqCpf = document.getElementById('reqCpf');
    if (reqCpf) reqCpf.value = user.cpf || '';
    const av = document.getElementById('sidebarAvatar');
    if (av) {
      av.textContent = uName.charAt(0).toUpperCase();
      av.style.display = 'flex';
      av.style.alignItems = 'center';
      av.style.justifyContent = 'center';
      av.style.color = '#fff';
      av.style.fontWeight = 'bold';
    }
    const showBenefitsAdmin = typeof Auth.canManageBeneficios === 'function' && Auth.canManageBeneficios(user?.role);
    document.querySelectorAll('.benefits-admin-nav').forEach(el => {
      el.style.display = showBenefitsAdmin ? 'flex' : 'none';
    });
  }

  async function init() {
    if (!document.getElementById('distribList') && !document.getElementById('limitRequestForm')) return;
    currentUser = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    if (!currentUser) return;
    if (!_hasClubeAccess(currentUser)) return;
    _applySidebar(currentUser);
    await loadUserData();
  }

  function _applyStoreAdminFlags(user) {
    const s = user || currentUser || (typeof Auth !== 'undefined' ? Auth.getSession() : null);
    if (!s) return;
    const role = String(s.role || '').toLowerCase();
    g.ADMIN_ID = s.id;
    g.IS_MASTER = ['master', 'fundador', 'admin'].includes(role);
    g.IS_FINANCIAL = ['financeiro', 'financial'].includes(role);
    g.IS_SUPERVISOR = role === 'supervisor';
    g.IS_RH = role === 'rh';
    g.IS_GERENTE = ['gerente', 'gerencia'].includes(role);
    g.IS_DIRETORIA = role === 'diretoria';
    g.IS_DESENVOLVEDOR = role === 'desenvolvedor';
    g.IS_OUVIDORIA = role === 'ouvidoria';
  }

  async function bootStandalone() {
    if (typeof DB !== 'undefined' && DB.init) await DB.init();
    currentUser = Auth.getSession();
    if (!currentUser) {
      window.location.replace(Auth.loginPageHref());
      return;
    }
    if (!_hasClubeAccess(currentUser)) {
      alert('Você não tem acesso ao Clube Benefícios. Solicite liberação ao RH.');
      window.history.back();
      return;
    }
    _applyStoreAdminFlags(currentUser);
    _applySidebar(currentUser);
    await loadUserData();
  }

  g.BeneficiosClube = {
    init,
    bootStandalone,
    loadUserData,
    switchTab,
    setOrderMode,
    toggleMeat,
    saveDistribution,
    submitFoodOrder,
  };
  Object.assign(g, {
    switchTab,
    setOrderMode,
    toggleMeat,
    saveDistribution,
    submitFoodOrder,
    loadUserData,
    clubeMenuQty,
  });

  if (/\/clube-beneficios\.html/i.test(g.location.pathname || '')) {
    g.addEventListener('DOMContentLoaded', () => { bootStandalone(); });
  }

  /* ── Esteira Loja de Prêmios (produtos/pedidos) — nomes separados do BeneficiosAdmin.saveProduct ── */
  async function renderProductsTable() {
    _applyStoreAdminFlags();
    if (g.IS_SUPERVISOR || g.IS_RH) return;
    const prods = await DB.getProducts((g.IS_MASTER || g.IS_FINANCIAL) ? null : g.ADMIN_ID);
    const tbody = document.getElementById('productsTbody');
    if (!tbody) return;
    if (!prods.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--color-text-muted);">Nenhum produto. <button class="btn btn-primary btn-sm" style="margin-left:12px;" onclick="openAddProductModal()">+ Adicionar</button></td></tr>`;
      return;
    }
    tbody.innerHTML = prods.map(p => {
      const img = p.image_url
        ? `<img src="${p.image_url}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;">`
        : `<span style="font-size:26px;">${p.emoji || ''}</span>`;
      return `<tr><td><div style="display:flex;align-items:center;gap:10px;">${img}<div><div style="font-weight:700;font-size:14px;">${p.name}</div><div style="font-size:11px;color:var(--color-text-muted);">${(p.description || '').slice(0, 40)}${(p.description || '').length > 40 ? '…' : ''}</div></div></div></td><td><span class="badge badge-muted">${p.category}</span></td><td><span class="pts-orange" style="font-family:var(--font-display);font-weight:900;">${formatCurrency(p.price)}</span></td><td><span class="${p.stock === 0 ? 'text-danger' : p.stock < 5 ? 'text-warning' : 'text-success'}" style="font-weight:700;">${p.stock} un.</span></td><td>${p.active ? '<span class="badge badge-success">Ativo</span>' : '<span class="badge badge-muted">Inativo</span>'}</td><td>${p.featured ? '⭐' : '–'}</td><td><div style="display:flex;gap:6px;"><button class="btn btn-ghost btn-sm" onclick="editProduct('${p.id}')" title="Editar">✎</button><button class="btn btn-ghost btn-sm" onclick="toggleProduct('${p.id}')" title="${p.active ? 'Desativar' : 'Ativar'}">${p.active ? '⏸' : '▶'}</button><button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" onclick="deleteProduct('${p.id}')" title="Apagar">🗑</button></div></td></tr>`;
    }).join('');
  }

  function openAddProductModal() {
    _prodImgUrl = '';
    document.getElementById('prodModalTitle').textContent = 'Novo Produto';
    document.getElementById('editProdId').value = '';
    ['prodName', 'prodDesc', 'prodPrice', 'prodStock'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const emoji = document.getElementById('prodEmoji'); if (emoji) emoji.value = '';
    const cat = document.getElementById('prodCategory'); if (cat) cat.value = 'Tecnologia';
    const feat = document.getElementById('prodFeatured'); if (feat) feat.checked = false;
    const prev = document.getElementById('prodImagePreview'); if (prev) prev.style.display = 'none';
    const file = document.getElementById('prodImageFile'); if (file) file.value = '';
    const th = document.getElementById('prodImgThumb'); if (th) th.innerHTML = '<span style="font-size:32px;"></span>';
    openModal('addProductModal');
  }

  async function saveStoreProduct() {
    _applyStoreAdminFlags();
    const id = document.getElementById('editProdId').value;
    const data = {
      name: document.getElementById('prodName').value.trim(),
      description: document.getElementById('prodDesc').value.trim(),
      category: document.getElementById('prodCategory').value,
      emoji: document.getElementById('prodEmoji').value || '',
      image_url: _prodImgUrl,
      price: parseFloat(document.getElementById('prodPrice').value),
      points_price: parseFloat(document.getElementById('prodPrice').value),
      stock: parseInt(document.getElementById('prodStock').value, 10),
      featured: document.getElementById('prodFeatured').checked,
      admin_id: g.ADMIN_ID,
    };
    if (!data.name || isNaN(data.price) || data.price < 0 || isNaN(data.stock)) {
      showToast('Preencha os campos.', 'warning');
      return;
    }
    showLoading();
    try {
      if (id) { await DB.updateProduct(id, data); showToast('Produto atualizado!', 'success'); }
      else { await DB.addProduct(data); showToast('Produto cadastrado!', 'success'); }
      closeModal('addProductModal');
      await renderProductsTable();
      if (typeof renderDashboard === 'function') await renderDashboard();
    } finally { hideLoading(); }
  }

  async function editProduct(id) {
    const p = await DB.getProduct(id); if (!p) return;
    _prodImgUrl = p.image_url || '';
    document.getElementById('prodModalTitle').textContent = 'Editar Produto';
    document.getElementById('editProdId').value = p.id;
    document.getElementById('prodName').value = p.name;
    document.getElementById('prodDesc').value = p.description || '';
    document.getElementById('prodCategory').value = p.category;
    document.getElementById('prodEmoji').value = p.emoji || '';
    document.getElementById('prodPrice').value = (p.price || 0).toFixed(2);
    document.getElementById('prodStock').value = p.stock;
    document.getElementById('prodFeatured').checked = !!p.featured;
    document.getElementById('prodImageFile').value = '';
    const prev = document.getElementById('prodImagePreview');
    const th = document.getElementById('prodImgThumb');
    if (_prodImgUrl) {
      prev.src = _prodImgUrl; prev.style.display = 'block';
      if (th) th.innerHTML = `<img src="${_prodImgUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;
    } else {
      prev.style.display = 'none';
      if (th) th.innerHTML = `<span style="font-size:32px;">${p.emoji || ''}</span>`;
    }
    openModal('addProductModal');
  }

  async function toggleProduct(id) {
    const p = await DB.getProduct(id); if (!p) return;
    await DB.updateProduct(id, { active: !p.active });
    await renderProductsTable();
    showToast(`${p.name} ${!p.active ? 'ativado' : 'desativado'}.`, 'info');
  }

  async function deleteProduct(id) {
    const p = await DB.getProduct(id);
    if (!p) { showToast('Produto não encontrado.', 'error'); return; }
    confirmAction(`Excluir "${p.name}"?`, async () => {
      showLoading();
      try {
        await DB.deleteProduct(id);
        await renderProductsTable();
        if (typeof renderDashboard === 'function') await renderDashboard();
        showToast('Produto removido.', 'success');
      } catch (e) {
        console.error('deleteProduct', e);
        const msg = (e?.message || '').includes('23503') || /foreign key|violates/i.test(e?.message || '')
          ? 'Não foi possível excluir: existem pedidos vinculados a este produto.'
          : 'Erro ao excluir produto. Tente novamente.';
        showToast(msg, 'error');
      } finally { hideLoading(); }
    });
  }

  async function _ordersForRole() {
    _applyStoreAdminFlags();
    if (g.IS_MASTER || g.IS_GERENTE || g.IS_FINANCIAL || g.IS_RH || g.IS_DIRETORIA) return DB.getOrders();
    if (g.IS_DESENVOLVEDOR) {
      return DB.getOrdersByDepartment(g.ADMIN_ID, window.USER_DEPT || 'Desenvolvimento');
    }
    return DB.getOrdersByAdmin(g.ADMIN_ID);
  }

  let _prodImgUrl = '';

  async function handleProductImageUpload(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      showToast('Máx 3MB.', 'warning');
      input.value = '';
      return;
    }
    showLoading('Enviando imagem...');
    try {
      _prodImgUrl = await uploadImage(file, 'product-images');
      const prev = document.getElementById('prodImagePreview');
      const th = document.getElementById('prodImgThumb');
      if (prev) { prev.src = _prodImgUrl; prev.style.display = 'block'; }
      if (th) th.innerHTML = `<img src="${_prodImgUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;
      showToast('Imagem carregada!', 'success');
    } catch (e) {
      console.error(e);
      showToast('Erro ao enviar.', 'error');
    } finally {
      hideLoading();
    }
  }

  function removeProductImage() {
    _prodImgUrl = '';
    const file = document.getElementById('prodImageFile'); if (file) file.value = '';
    const prev = document.getElementById('prodImagePreview');
    const th = document.getElementById('prodImgThumb');
    if (prev) { prev.style.display = 'none'; prev.src = ''; }
    if (th) th.innerHTML = '<span style="font-size:32px;"></span>';
  }

  const STATUS_OPT = ['pendente', 'aprovado', 'enviado', 'entregue', 'cancelado'];

  async function renderOrdersTable() {
    const q = (document.getElementById('orderSearch')?.value || '').toLowerCase();
    let orders = await _ordersForRole();
    orders = (orders || []).slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    if (q) orders = orders.filter(o => (o.order_code || '').toLowerCase().includes(q));
    const tbody = document.getElementById('ordersTbody');
    if (!tbody) return;
    if (!orders.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--color-text-muted);">Nenhum pedido.</td></tr>`;
      return;
    }
    const cache = {};
    tbody.innerHTML = (await Promise.all(orders.map(async o => {
      if (!cache[o.employee_id]) cache[o.employee_id] = await DB.getUser(o.employee_id);
      const emp = cache[o.employee_id];
      const items = Array.isArray(o.items) ? o.items : (typeof o.items === 'string' ? JSON.parse(o.items || '[]') : []);
      return `<tr><td><strong>${o.order_code || o.id}</strong></td><td><div class="employee-avatar-cell">${avatarHtml(emp?.name || '–', 'avatar-sm', emp?.photo_url || '')}<div><div style="font-weight:600;font-size:13px;">${emp?.name || 'Desconhecido'}</div><div style="font-size:11px;color:var(--color-text-muted);">${emp?.department || ''}</div></div></div></td><td>${items.map(i => `<span style="font-size:11px;background:var(--color-surface-2);padding:2px 7px;border-radius:4px;margin:2px;display:inline-block;">${i.name} x${i.qty}</span>`).join('')}</td><td><span class="pts-orange" style="font-family:var(--font-display);font-weight:900;">${formatCurrency(o.total_points ?? o.total_price ?? 0)}</span></td><td style="font-size:12px;color:var(--color-text-muted);">${formatDate(o.created_at)}</td><td>${orderStatusBadge(o.status)}</td><td><select style="font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--color-border);" onchange="changeOrderStatus('${o.id}',this.value)">${STATUS_OPT.map(s => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select><button onclick="deleteOrder('${o.id}')" title="Apagar pedido" style="margin-left:6px;background:none;border:1px solid #ff4d4d;color:#ff4d4d;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:12px;">Apagar</button></td></tr>`;
    }))).join('');
  }

  async function changeOrderStatus(id, status) {
    await DB.updateOrderStatus(id, status);
    await renderOrdersTable();
    if (typeof updatePendingBadge === 'function') await updatePendingBadge();
    showToast(`Pedido → "${status}"`, 'success');
  }

  async function deleteOrder(id) {
    if (!confirm('Apagar este pedido? Essa ação não pode ser desfeita.')) return;
    await DB.deleteOrder(id);
    await renderOrdersTable();
    if (typeof updatePendingBadge === 'function') await updatePendingBadge();
    showToast('Pedido apagado.', 'success');
  }

  Object.assign(g, {
    renderProductsTable,
    openAddProductModal,
    saveStoreProduct,
    editProduct,
    toggleProduct,
    deleteProduct,
    _ordersForRole,
    handleProductImageUpload,
    removeProductImage,
    renderOrdersTable,
    changeOrderStatus,
    deleteOrder,
  });
})(window);
