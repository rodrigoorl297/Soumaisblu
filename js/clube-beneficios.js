/* Clube Benefícios — funcionários / vendedores */
(function (g) {
  'use strict';

  let currentUser = null;
  let currentLimit = null;
  let orderMode = 'entrega';
  let selectedMeats = [];

  function _benId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function _hasClubeAccess(user) {
    if (!user) return false;
    const role = String(user.role || '').toLowerCase();
    if (['admin', 'master', 'portaria', 'fundador', 'financeiro', 'financial'].includes(role)) return true;
    if (user.acesso_clube === false || user.acesso_clube === 0 || user.acesso_clube === '0') return false;
    if (user.acesso_clube === true || user.acesso_clube === 1 || user.acesso_clube === '1') return true;
    return ['vendedor', 'employee', 'funcionario', 'supervisor', 'backoffice', 'operacional', 'gerente', 'gerencia'].includes(role);
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
      if (btnE) btnE.className = 'btn btn-primary';
      if (btnR) btnR.className = 'btn btn-outline';
      if (deliveryF) deliveryF.style.display = 'block';
    } else {
      if (btnE) btnE.className = 'btn btn-outline';
      if (btnR) btnR.className = 'btn btn-primary';
      if (deliveryF) deliveryF.style.display = 'none';
    }
  }

  function toggleMeat(el, meat) {
    if (selectedMeats.includes(meat)) {
      selectedMeats = selectedMeats.filter(x => x !== meat);
      el.classList.remove('active');
    } else {
      if (selectedMeats.length >= 2) {
        alert('Selecione no máximo 2 carnes.');
        return;
      }
      selectedMeats.push(meat);
      el.classList.add('active');
    }
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
      tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum voucher emitido.</td></tr>';
      return;
    }
    vouchers.forEach(v => {
      const tr = document.createElement('tr');
      let statusBadge = '<span class="badge badge-warning">Em Processamento</span>';
      if (v.status === 'pago') statusBadge = '<span class="badge badge-success">Pago</span>';
      else if (v.status === 'recusado') statusBadge = '<span class="badge badge-danger">Recusado</span>';
      tr.innerHTML = `
        <td><strong>${v.voucher_no}</strong></td>
        <td>${v.prestador_name || 'Restaurante'}</td>
        <td>${formatCurrency(v.valor)}</td>
        <td>${statusBadge}</td>
        <td>${new Date(v.created_at).toLocaleDateString('pt-BR')}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function loadUserData() {
    const errBox = document.getElementById('beneficiosLoadError');
    if (errBox) errBox.style.display = 'none';
    try {
      const limits = await supaReq('GET', 'beneficios_limites', null, `?employee_id=eq.${currentUser.id}&order=created_at.desc&limit=1`);
      if (limits && limits.length > 0) {
        currentLimit = limits[0];
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
        set('valAprovado', formatCurrency(currentLimit.limite_aprovado));
        set('valUtilizado', formatCurrency(currentLimit.limite_utilizado));
        set('valDisponivel', formatCurrency(currentLimit.limite_disponivel));
        set('topbarBalance', formatCurrency(currentLimit.limite_disponivel));
        set('distTotalAvailable', formatCurrency(currentLimit.limite_aprovado));
      } else {
        currentLimit = null;
      }
      const providers = await supaReq('GET', 'beneficios_prestadores', null, '?select=*');
      renderDistribution(providers);
      const vouchers = await supaReq('GET', 'beneficios_vouchers', null, `?employee_id=eq.${currentUser.id}&order=created_at.desc`);
      renderVouchers(vouchers);
    } catch (e) {
      console.error('Erro ao carregar dados do usuário:', e);
      if (errBox) {
        errBox.style.display = 'block';
        errBox.textContent = 'Não foi possível carregar os dados do Clube Benefícios. Atualize a página (Ctrl+F5). Se persistir, avise o suporte.';
      }
    }
  }




  async function submitFoodOrder(e) {
    e.preventDefault();
    if (!currentLimit) {
      alert('Você precisa ter um limite aprovado primeiro.');
      return;
    }
    const orderVal = parseFloat(document.getElementById('orderValue')?.value) || 0;
    if (orderVal <= 0) {
      alert('Informe um valor de pedido válido.');
      return;
    }
    const disponivel = parseFloat(currentLimit.limite_disponivel) || 0;
    if (orderVal > disponivel) {
      alert(`O valor do pedido excede o seu limite disponível (${formatCurrency(disponivel)}).`);
      return;
    }
    if (orderMode === 'entrega' && selectedMeats.length < 2) {
      alert('Por favor, escolha 2 opções de carne.');
      return;
    }
    try {
      const providers = await supaReq('GET', 'beneficios_prestadores', null, '?categoria=eq.Restaurante&limit=1');
      const provider = (providers && providers.length > 0) ? providers[0] : { id: 'rest_default', nome_fantasia: 'Restaurante Clube ZS Benefícios' };
      const today = new Date();
      const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
      const voucherNo = `ZS-${today.getDate().toString().padStart(2, '0')}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getFullYear()}-${rand}`;
      const detalhes = {
        modo: orderMode,
        horario_entrega: orderMode === 'entrega' ? document.getElementById('orderDeliveryTime')?.value : null,
        salada: orderMode === 'entrega' ? !!document.getElementById('chkSalada')?.checked : false,
        feijao_caldo: orderMode === 'entrega' ? !!document.getElementById('chkFeijaoCaldo')?.checked : false,
        carnes: orderMode === 'entrega' ? selectedMeats.slice() : [],
        observacoes: document.getElementById('orderObs')?.value?.trim() || '',
      };
      await supaReq('POST', 'beneficios_vouchers', {
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
      });
      const newUsed = Math.round((parseFloat(currentLimit.limite_utilizado || 0) + orderVal) * 100) / 100;
      const newAvailable = Math.round((disponivel - orderVal) * 100) / 100;
      await supaReq('PATCH', 'beneficios_limites', {
        limite_utilizado: newUsed,
        limite_disponivel: newAvailable,
      }, `?id=eq.${currentLimit.id}`);
      alert(`Pedido salvo com sucesso! Seu voucher é: ${voucherNo}`);
      document.getElementById('orderForm').reset();
      selectedMeats = [];
      document.querySelectorAll('.meat-option').forEach(o => o.classList.remove('active'));
      await loadUserData();
    } catch (err) {
      alert('Erro ao salvar pedido: ' + err.message);
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
