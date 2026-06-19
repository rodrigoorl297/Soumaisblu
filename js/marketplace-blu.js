/* SOU + BLU — Marketplace BLU (solicitação de serviços com saldo financeiro) */
(function () {
  const CATEGORIES = ['Todos', 'Consultas', 'Certidões', 'Marketing', 'Suporte'];

  const STATUS = [
    { value: 'pendente', label: 'Pendente', cls: 'badge-warning' },
    { value: 'processando', label: 'Processando', cls: 'badge-info' },
    { value: 'concluido', label: 'Concluído', cls: 'badge-success' },
    { value: 'erro', label: 'Erro', cls: 'badge-danger' },
    { value: 'cancelado', label: 'Cancelado', cls: 'badge-muted' },
  ];

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function fmtDt(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR'); } catch { return '—'; }
  }

  function stMeta(v) {
    return STATUS.find(s => s.value === v) || { label: v || '—', cls: 'badge-muted' };
  }

  function showConfirm(title, message, onConfirm) {
    const dialogId = 'mktConfirmDialog';
    let dialog = document.getElementById(dialogId);
    if (!dialog) {
      dialog = document.createElement('div');
      dialog.className = 'modal-overlay';
      dialog.id = dialogId;
      document.body.appendChild(dialog);
    }
    dialog.innerHTML = `
      <div class="modal" style="max-width:400px; transform: scale(0.9); transition: transform 0.2s ease; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);">
        <div class="modal-header" style="border-bottom: none; padding: 20px 24px 8px;">
          <h3 style="font-size: 18px; font-weight: 700; color: var(--color-text-primary); margin: 0;">${esc(title)}</h3>
          <button type="button" class="modal-close" onclick="closeModal('${dialogId}')"></button>
        </div>
        <div class="modal-body" style="padding: 8px 24px 20px;">
          <p style="font-size:14px; color:var(--color-text-muted); line-height:1.5; margin:0;">${esc(message)}</p>
        </div>
        <div class="modal-footer" style="border-top: none; padding: 0 24px 20px; gap:12px;">
          <button type="button" class="btn btn-ghost" style="flex:1; border-radius: 8px; font-weight: 600;" onclick="closeModal('${dialogId}')">Não</button>
          <button type="button" class="btn btn-primary" style="flex:1; border-radius: 8px; font-weight: 600;" id="mktConfirmBtn">Sim</button>
        </div>
      </div>`;
    
    setTimeout(() => {
      const modal = dialog.querySelector('.modal');
      if (modal) modal.style.transform = 'scale(1)';
    }, 10);

    const confirmBtn = dialog.querySelector('#mktConfirmBtn');
    confirmBtn.onclick = () => {
      closeModal(dialogId);
      onConfirm();
    };
    
    openModal(dialogId);
  }

  function showPrompt(title, label, placeholder, onConfirm) {
    const dialogId = 'mktPromptDialog';
    let dialog = document.getElementById(dialogId);
    if (!dialog) {
      dialog = document.createElement('div');
      dialog.className = 'modal-overlay';
      dialog.id = dialogId;
      document.body.appendChild(dialog);
    }
    dialog.innerHTML = `
      <div class="modal" style="max-width:450px; transform: scale(0.9); transition: transform 0.2s ease; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);">
        <div class="modal-header" style="border-bottom: none; padding: 20px 24px 8px;">
          <h3 style="font-size: 18px; font-weight: 700; color: var(--color-text-primary); margin: 0;">${esc(title)}</h3>
          <button type="button" class="modal-close" onclick="closeModal('${dialogId}')"></button>
        </div>
        <div class="modal-body" style="padding: 8px 24px 20px;">
          <div class="form-group" style="margin:0;">
            <label style="font-weight:600; font-size: 13px; color: var(--color-text-muted); margin-bottom:8px; display:block;">${esc(label)}</label>
            <input type="text" id="mktPromptInput" class="form-control" placeholder="${esc(placeholder)}" autocomplete="off" style="width:100%; border-radius: 8px; padding: 10px 14px; border: 1px solid var(--color-border); font-size: 14px;" />
          </div>
        </div>
        <div class="modal-footer" style="border-top: none; padding: 0 24px 20px; gap:12px;">
          <button type="button" class="btn btn-ghost" style="flex:1; border-radius: 8px; font-weight: 600;" onclick="closeModal('${dialogId}')">Cancelar</button>
          <button type="button" class="btn btn-primary" style="flex:1; border-radius: 8px; font-weight: 600;" id="mktPromptBtn">Confirmar</button>
        </div>
      </div>`;

    setTimeout(() => {
      const modal = dialog.querySelector('.modal');
      if (modal) modal.style.transform = 'scale(1)';
      const input = dialog.querySelector('#mktPromptInput');
      if (input) input.focus();
    }, 10);

    const input = dialog.querySelector('#mktPromptInput');
    
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        closeModal(dialogId);
        onConfirm(input.value.trim());
      }
    };

    const confirmBtn = dialog.querySelector('#mktPromptBtn');
    confirmBtn.onclick = () => {
      closeModal(dialogId);
      onConfirm(input.value.trim());
    };

    openModal(dialogId);
  }

  function hasPerm(key) {
    if (typeof window.partnerOrgCan === 'function') return window.partnerOrgCan(key);
    return typeof PartnerPerms !== 'undefined' && PartnerPerms.can(window._PARTNER_PERMS, key);
  }

  /** Loja Marketplace BLU — somente rede parceira (gestor/equipe autorizada), nunca vendedor interno. */
  function canAccess() {
    const s = Auth.getSession();
    if (!s) return false;
    const role = String(s.role || '').toLowerCase();
    if (role === 'vendedor' || role === 'employee') return false;
    if (!window.PARTNER_ROOT_ID) return false;
    if (role === 'parceiro') return hasPerm('marketplace_blu');
    return hasPerm('marketplace_blu');
  }

  function guardMarketplaceSection(section) {
    const checks = {
      secMarketplaceBlu: () => canAccess(),
      secMarketplaceManage: () => canManageCatalog(),
      secMarketplaceOrders: () => canManageOrders(),
    };
    if (checks[section]?.()) return true;
    if (typeof showToast === 'function') showToast('Sem permissão para acessar o Marketplace BLU.', 'warning');
    const fallback = document.querySelector('.sidebar-nav .nav-item[data-section]:not([style*="display: none"])')?.dataset?.section
      || document.querySelector('.sidebar-nav .nav-item[data-section]')?.dataset?.section
      || 'secInicio';
    if (typeof navigateTo === 'function') navigateTo(fallback);
    return false;
  }

  function canManageCatalog() {
    const s = Auth.getSession();
    if (!s) return false;
    return !window.PARTNER_ROOT_ID && ['master', 'fundador', 'gerente', 'financeiro', 'financial', 'rh'].includes(s.role);
  }

  function canManageOrders() {
    const s = Auth.getSession();
    if (!s) return false;
    if (!window.PARTNER_ROOT_ID) {
      return ['master', 'fundador', 'gerente', 'financeiro', 'financial', 'rh', 'backoffice', 'operacional'].includes(s.role);
    }
    return hasPerm('marketplace_blu') && ['parceiro', 'backoffice', 'operacional', 'sup_backoffice'].includes(s.role);
  }

  function userPoints(u) {
    if (!u) return 0;
    return typeof userPts === 'function' ? userPts(u) : (u.points || u.balance || 0);
  }

  function fmtPts(n, isPriceOrOrder = false) {
    const v = parseFloat(n) || 0;
    const isPrice = isPriceOrOrder === true;
    if (isPrice && v === 0) return 'A definir';
    return typeof formatMoney === 'function' ? formatMoney(v) : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  async function runApiForService(svc, documentValue) {
    if (!svc?.api_type || typeof FonteData === 'undefined') {
      return { ok: false, error: 'Consulta automática não configurada.' };
    }
    const doc = String(documentValue || '').replace(/\D/g, '');
    if (svc.api_type === 'cpf') {
      if (doc.length !== 11) return { ok: false, error: 'Informe um CPF válido (11 dígitos).' };
      return FonteData.lookupCpf(doc);
    }
    if (svc.api_type === 'cpf_cnpj' || svc.api_consulta === 'tj-certidao' || svc.api_consulta === 'processos-completa') {
      if (doc.length !== 11) {
        return { ok: false, error: 'Informe CPF válido (11 dígitos) para consulta de processos TJ.' };
      }
      return typeof FonteData.lookupTjCertidao === 'function'
        ? FonteData.lookupTjCertidao(doc)
        : { ok: false, error: 'Consulta TJ indisponível — atualize fontedata.js no servidor.' };
    }
    if (svc.api_type === 'cnpj') {
      if (doc.length !== 14) return { ok: false, error: 'Informe um CNPJ válido (14 dígitos).' };
      return FonteData.lookupCnpj(doc, svc.api_consulta || 'consulta-cnpj-receita');
    }
    return { ok: false, error: 'Tipo de API desconhecido.' };
  }

  const MarketplaceBlu = {
    activeCategory: 'Todos',
    adminTab: 'catalogo',

    ensureUi() {
      const finNav = document.getElementById('finSidebarNav');
      const nav = finNav || document.querySelector('.sidebar-nav');
      const main = document.querySelector('.page-content');
      if (!main) return;
      if (window.SOUBLU_FINANCEIRO_PAGE || finNav) {
        this.ensureModals();
        return;
      }
      if (!nav) return;

      if (!document.getElementById('navMarketplaceBlu') && canAccess()) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-item marketplace-blu-nav';
        btn.id = 'navMarketplaceBlu';
        btn.dataset.section = 'secMarketplaceBlu';
        btn.innerHTML = `${navIconHtml('cart')}<span class="nav-label">Marketplace BLU</span>`;
        btn.addEventListener('click', async () => {
          if (typeof navigateTo === 'function') navigateTo('secMarketplaceBlu');
          await MarketplaceBlu.renderShop();
        });
        const anchor = nav.querySelector('.store-shop-nav') || nav.querySelector('[data-section="secStore"]')
          || nav.querySelector('#navManageProposals');
        if (anchor?.parentNode) anchor.parentNode.insertBefore(btn, anchor.nextSibling);
        else nav.appendChild(btn);
      }

      if (!document.getElementById('secMarketplaceBlu')) {
        const sec = document.createElement('section');
        sec.className = 'section';
        sec.id = 'secMarketplaceBlu';
        sec.innerHTML = '<div id="marketplaceBluRoot"></div>';
        main.appendChild(sec);
      }

      if (canManageCatalog() && !document.getElementById('navMarketplaceManage')) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-item marketplace-manage-nav';
        btn.id = 'navMarketplaceManage';
        btn.dataset.section = 'secMarketplaceManage';
        btn.innerHTML = `${navIconHtml('grid')}<span class="nav-label">Catálogo marketplace</span>`;
        btn.addEventListener('click', async () => {
          if (typeof navigateTo === 'function') navigateTo('secMarketplaceManage');
          await MarketplaceBlu.renderCatalogAdmin();
        });
        const mkt = document.getElementById('navMarketplaceBlu');
        if (mkt?.nextSibling) mkt.parentNode.insertBefore(btn, mkt.nextSibling);
        else nav.appendChild(btn);
      }
      if (canManageOrders() && !document.getElementById('navMarketplaceOrders')) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-item marketplace-orders-nav';
        btn.id = 'navMarketplaceOrders';
        btn.dataset.section = 'secMarketplaceOrders';
        btn.innerHTML = `${navIconHtml('package')}<span class="nav-label">Solicitações marketplace</span>`;
        btn.addEventListener('click', async () => {
          if (typeof navigateTo === 'function') navigateTo('secMarketplaceOrders');
          await MarketplaceBlu.renderOrdersAdmin();
        });
        const cat = document.getElementById('navMarketplaceManage') || document.getElementById('navMarketplaceBlu');
        if (cat?.nextSibling) cat.parentNode.insertBefore(btn, cat.nextSibling);
        else nav.appendChild(btn);
      }

      if (canManageCatalog() && !document.getElementById('secMarketplaceManage')) {
        const sec = document.createElement('section');
        sec.className = 'section';
        sec.id = 'secMarketplaceManage';
        sec.innerHTML = '<div id="marketplaceManageRoot"></div>';
        main.appendChild(sec);
      }
      if (canManageOrders() && !document.getElementById('secMarketplaceOrders')) {
        const sec = document.createElement('section');
        sec.className = 'section';
        sec.id = 'secMarketplaceOrders';
        sec.innerHTML = '<div id="marketplaceOrdersRoot"></div>';
        main.appendChild(sec);
      }
      this.ensureModals();
    },

    applyNavVisibility(cfg) {
      if (window.SOUBLU_FINANCEIRO_PAGE || document.getElementById('finSidebarNav')) return;
      const showShop = cfg?.canMarketplaceBlu !== false && canAccess();
      document.querySelectorAll('.marketplace-blu-nav').forEach(el => {
        el.style.display = showShop ? '' : 'none';
      });
      document.querySelectorAll('.marketplace-manage-nav').forEach(el => {
        el.style.display = canManageCatalog() ? '' : 'none';
      });
      document.querySelectorAll('.marketplace-orders-nav').forEach(el => {
        el.style.display = canManageOrders() ? '' : 'none';
      });
    },

    async renderShop() {
      if (!guardMarketplaceSection('secMarketplaceBlu')) return;
      this.ensureUi();
      const root = document.getElementById('marketplaceBluRoot');
      if (!root) return;
      const user = await Auth.getCurrentUser();
      if (!user) return;
      const partnerRoot = window.PARTNER_ROOT_ID || null;
      const pts = userPoints(user);
      const services = await DB.getMarketplaceServices({ partnerRootId: partnerRoot, activeOnly: true });
      const cats = CATEGORIES;
      const filtered = this.activeCategory === 'Todos'
        ? services
        : services.filter(s => s.category === this.activeCategory);
      const myOrders = await DB.getMarketplaceOrders({ userId: user.id, limit: 8 });

      root.innerHTML = `
        <div class="page-header">
          <div class="page-header-text">
            <h2>Marketplace BLU</h2>
            <p>Contrate serviços corporativos para o seu negócio — consultas, certidões e suporte</p>
          </div>
          <div style="font-size:15px;font-weight:800;color:var(--color-primary);">Saldo: ${fmtPts(pts)}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
          ${cats.map(c => `<button type="button" class="btn btn-sm ${this.activeCategory === c ? 'btn-primary' : 'btn-outline'}"
            onclick="MarketplaceBlu.setCategory('${esc(c)}')">${esc(c)}</button>`).join('')}
        </div>
        <div class="product-grid" id="mktServiceGrid"></div>
        <div class="card card-padded" style="margin-top:20px;">
          <h4 style="margin:0 0 12px;">Minhas últimas solicitações</h4>
          <div id="mktMyOrders">${this._ordersTableHtml(myOrders, false)}</div>
        </div>`;

      const grid = document.getElementById('mktServiceGrid');
      if (!grid) return;
      if (!filtered.length) {
        grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><h4>Nenhum serviço nesta categoria</h4></div>';
        return;
      }
      grid.innerHTML = filtered.map(s => {
        const canBuy = true;
        const auto = s.fulfillment !== 'manual';
        const btnLabel = 'Solicitar';
        return `<div class="product-card">
          <div class="product-img-wrap" style="font-size:42px;display:flex;align-items:center;justify-content:center;">${esc(s.emoji || '🛒')}</div>
          <div class="product-info">
            <span class="product-category">${esc(s.category || '')}</span>
            <div class="product-name">${esc(s.name)}</div>
            <p style="font-size:12px;color:var(--color-text-muted);margin:6px 0 0;line-height:1.4;">${esc(s.description || '')}</p>
            <div class="product-price-row" style="margin-top:8px;">
              <div class="product-price">${fmtPts(s.points_price, true)}</div>
              <span class="badge badge-muted">${auto ? 'Automático' : 'Manual'}</span>
            </div>
          </div>
          <button type="button" class="btn ${canBuy ? 'btn-primary' : 'btn-ghost'} btn-buy"
            onclick="MarketplaceBlu.openRedeem('${esc(s.id)}')" ${!canBuy ? 'disabled' : ''}>
            ${btnLabel}
          </button>
        </div>`;
      }).join('');
    },

    _ordersTableHtml(rows, adminView) {
      if (!rows.length) {
        return '<p class="text-muted" style="margin:0;">Nenhuma solicitação ainda.</p>';
      }
      return `<div class="table-wrap"><table class="data-table"><thead><tr>
        <th>Código</th>${adminView ? '<th>Parceiro</th>' : ''}<th>Serviço</th><th>Documento</th><th>Valor</th><th>Status</th><th>Data</th>${adminView ? '<th></th>' : '<th></th>'}
      </tr></thead><tbody>${rows.map(o => {
        const st = stMeta(o.status);
        const docBtn = o.result_data && Object.keys(o.result_data).length
          ? `<button type="button" class="btn btn-ghost btn-sm" onclick="MarketplaceBlu.viewResult('${esc(o.id)}')">Ver resultado</button>`
          : '';
        const adminBtns = adminView ? `<td>
          ${o.status === 'pendente' ? `<button type="button" class="btn btn-primary btn-sm" onclick="MarketplaceBlu.fulfill('${esc(o.id)}')">Concluir</button>` : ''}
          ${o.status === 'pendente' ? `<button type="button" class="btn btn-ghost btn-sm" onclick="MarketplaceBlu.cancel('${esc(o.id)}')">Cancelar</button>` : ''}
        </td>` : `<td>${docBtn}</td>`;
        return `<tr>
          <td><code>${esc(o.order_code)}</code></td>
          ${adminView ? `<td>${esc(o.user_name || o.user_id)}</td>` : ''}
          <td>${esc(o.service_name)}</td>
          <td>${esc(o.document || '—')}</td>
          <td>${fmtPts(o.points_cost, true)}</td>
          <td><span class="badge ${st.cls}">${st.label}</span></td>
          <td>${fmtDt(o.created_at)}</td>
          ${adminBtns}
        </tr>`;
      }).join('')}</tbody></table></div>`;
    },

    setCategory(cat) {
      this.activeCategory = cat || 'Todos';
      this.renderShop();
    },

    openRedeem(serviceId) {
      DB.getMarketplaceService(serviceId).then(svc => {
        if (!svc) return;
        window.__mktRedeem = { service: svc };
        document.getElementById('mktRedeemTitle').textContent = svc.name;
        document.getElementById('mktRedeemDesc').textContent = svc.description || '';
        document.getElementById('mktRedeemPrice').textContent = fmtPts(svc.points_price, true);
        const docGrp = document.getElementById('mktRedeemDocGroup');
        const needsDoc = !!svc.api_type;
        if (docGrp) docGrp.style.display = needsDoc ? '' : 'none';
        const lbl = document.getElementById('mktRedeemDocLabel');
        const inp = document.getElementById('mktRedeemDoc');
        if (lbl && inp) {
          if (svc.api_type === 'cpf') {
            lbl.textContent = 'CPF para consulta *';
            inp.placeholder = '000.000.000-00';
            inp.maxLength = 14;
          } else if (svc.api_type === 'cpf_cnpj' || svc.api_consulta === 'tj-certidao' || svc.api_consulta === 'processos-completa') {
            lbl.textContent = 'CPF para processos TJ *';
            inp.placeholder = '000.000.000-00';
            inp.maxLength = 14;
          } else if (svc.api_type === 'cnpj') {
            lbl.textContent = 'CNPJ para consulta *';
            inp.placeholder = '00.000.000/0001-00';
            inp.maxLength = 18;
          }
          inp.value = '';
        }
        const obs = document.getElementById('mktRedeemObs');
        if (obs) {
          obs.value = '';
          obs.parentElement.style.display = svc.fulfillment === 'manual' ? '' : 'none';
        }
        openModal('mktRedeemModal');
      });
    },

    async confirmRedeem() {
      const pack = window.__mktRedeem;
      if (!pack?.service) return;
      const svc = pack.service;
      const user = await Auth.getCurrentUser();
      if (!user) return;
      const docRaw = document.getElementById('mktRedeemDoc')?.value || '';
      const doc = String(docRaw).replace(/\D/g, '');
      const obs = document.getElementById('mktRedeemObs')?.value?.trim() || '';
      if (svc.api_type === 'cpf' && doc.length !== 11) {
        showToast('Informe um CPF válido.', 'warning'); return;
      }
      if ((svc.api_type === 'cpf_cnpj' || svc.api_consulta === 'tj-certidao' || svc.api_consulta === 'processos-completa')
        && doc.length !== 11) {
        showToast('Informe CPF válido (11 dígitos) para consulta de processos TJ.', 'warning'); return;
      }
      if (svc.api_type === 'cnpj' && doc.length !== 14) {
        showToast('Informe um CNPJ válido.', 'warning'); return;
      }
      showLoading('Processando solicitação...');
      try {
        const partnerRoot = window.PARTNER_ROOT_ID || null;
        const placed = await DB.placeMarketplaceOrder(user.id, svc.id, {
          document: doc,
          observacao: obs,
          partner_root_id: partnerRoot,
        });
        if (!placed.ok) {
          showToast(placed.msg || 'Falha na solicitação.', 'error');
          return;
        }
        let order = placed.order;
        if (svc.api_type && svc.fulfillment !== 'manual') {
          const apiRes = await runApiForService(svc, doc);
          const patch = {
            result_data: apiRes.ok
              ? { api: apiRes, consulta: svc.api_consulta, at: new Date().toISOString() }
              : { error: apiRes.error, at: new Date().toISOString() },
            status: apiRes.ok ? 'concluido' : 'erro',
            fulfilled_at: apiRes.ok ? new Date().toISOString() : null,
          };
          order = await DB.updateMarketplaceOrder(order.id, patch) || { ...order, ...patch };
          if (!apiRes.ok) {
            showToast('Solicitação registrada, mas a consulta falhou: ' + (apiRes.error || 'erro'), 'warning', 9000);
          } else {
            showToast('Serviço concluído! Consulte o resultado em Minhas solicitações.', 'success');
          }
        } else {
          showToast('Solicitação enviada! A equipe irá processar em breve.', 'success');
        }
        closeModal('mktRedeemModal');
        await this.renderShop();
        if (document.getElementById('marketplaceOrdersRoot')) await this.renderOrdersAdmin();
      } catch (e) {
        alert('Erro: ' + (e.message || e));
      } finally { hideLoading(); }
    },

    async viewResult(orderId) {
      const o = await DB.getMarketplaceOrder(orderId);
      if (!o) return;
      const body = document.getElementById('mktResultBody');
      const title = document.getElementById('mktResultTitle');
      if (title) title.textContent = o.service_name || 'Resultado';
      const data = o.result_data || {};
      if (data.error) {
        body.innerHTML = `<p class="text-danger">${esc(data.error)}</p>`;
      } else if (data.api) {
        body.innerHTML = `<pre style="font-size:12px;white-space:pre-wrap;max-height:55vh;overflow:auto;background:var(--color-surface-2);padding:12px;border-radius:8px;">${esc(JSON.stringify(data.api, null, 2))}</pre>`;
      } else {
        body.innerHTML = '<p class="text-muted">Sem resultado disponível.</p>';
      }
      openModal('mktResultModal');
    },

    switchAdminTab(tab) {
      this.adminTab = tab || 'catalogo';
      this.renderCatalogAdmin();
    },

    async renderCatalogAdmin() {
      if (!guardMarketplaceSection('secMarketplaceManage')) return;
      this.ensureUi();
      const root = document.getElementById('marketplaceManageRoot');
      if (!root || !canManageCatalog()) return;
      const tab = this.adminTab || 'catalogo';
      const services = await DB.getMarketplaceServices({});
      root.innerHTML = `
        <div class="page-header">
          <div class="page-header-text"><h2>Catálogo Marketplace BLU</h2><p>Serviços, preços em R$ e tipo de entrega</p></div>
          <button type="button" class="btn btn-primary" onclick="MarketplaceBlu.openServiceEditor()">+ Serviço</button>
        </div>
        <div class="card card-padded"><div class="table-wrap"><table class="data-table"><thead><tr>
          <th>Serviço</th><th>Categoria</th><th>Preço</th><th>API</th><th>Entrega</th><th>Ativo</th><th></th>
        </tr></thead><tbody id="mktCatalogTbody"></tbody></table></div></div>`;
      const tb = document.getElementById('mktCatalogTbody');
      if (!services.length) {
        tb.innerHTML = '<tr><td colspan="7" class="text-muted text-center">Catálogo vazio.</td></tr>';
        return;
      }
      tb.innerHTML = services.map(s => `<tr>
        <td>${esc(s.emoji || '')} <strong>${esc(s.name)}</strong></td>
        <td>${esc(s.category)}</td>
        <td>${fmtPts(s.points_price, true)}</td>
        <td>${s.api_type ? esc(s.api_consulta || s.api_type) : '—'}</td>
        <td>${s.fulfillment === 'manual' ? 'Manual' : 'Automático'}</td>
        <td>${s.active ? 'Sim' : 'Não'}</td>
        <td>
          <button type="button" class="btn btn-ghost btn-sm" onclick="MarketplaceBlu.openServiceEditor('${esc(s.id)}')">Editar</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="MarketplaceBlu.removeService('${esc(s.id)}')">Excluir</button>
        </td>
      </tr>`).join('');
    },

    async renderOrdersAdmin() {
      if (!guardMarketplaceSection('secMarketplaceOrders')) return;
      this.ensureUi();
      const root = document.getElementById('marketplaceOrdersRoot');
      if (!root || !canManageOrders()) return;
      const partnerRoot = window.PARTNER_ROOT_ID || null;
      const opts = partnerRoot ? { partnerRootId: partnerRoot } : {};
      const rows = await DB.getMarketplaceOrders(opts);
      root.innerHTML = `
        <div class="page-header">
          <div class="page-header-text"><h2>Solicitações Marketplace</h2><p>Pedidos de serviços — conclua ou cancele solicitações manuais</p></div>
        </div>
        <div class="card card-padded">${this._ordersTableHtml(rows, true)}</div>`;
    },

    openServiceEditor(id) {
      const isEdit = !!id;
      document.getElementById('mktSvcModalTitle').textContent = isEdit ? 'Editar serviço' : 'Novo serviço';
      document.getElementById('mktSvcEditId').value = id || '';
      const fill = (s) => {
        document.getElementById('mktSvcName').value = s.name || '';
        document.getElementById('mktSvcCategory').value = s.category || 'Consultas';
        document.getElementById('mktSvcDesc').value = s.description || '';
        document.getElementById('mktSvcPoints').value = String(s.points_price ?? 0);
        document.getElementById('mktSvcEmoji').value = s.emoji || '🛒';
        document.getElementById('mktSvcApiType').value = s.api_type || '';
        document.getElementById('mktSvcApiConsulta').value = s.api_consulta || '';
        document.getElementById('mktSvcFulfillment').value = s.fulfillment || 'auto';
        document.getElementById('mktSvcActive').checked = s.active !== false;
        document.getElementById('mktSvcSort').value = String(s.sort_order ?? 0);
        this._syncApiFields();
      };
      if (!isEdit) {
        fill({ category: 'Consultas', emoji: '🛒', fulfillment: 'auto', active: true, points_price: 10 });
        openModal('mktSvcModal');
        return;
      }
      DB.getMarketplaceService(id).then(s => { if (s) { fill(s); openModal('mktSvcModal'); } });
    },

    _syncApiFields() {
      const t = document.getElementById('mktSvcApiType')?.value || '';
      const cons = document.getElementById('mktSvcApiConsulta');
      const ful = document.getElementById('mktSvcFulfillment');
      if (cons) cons.disabled = !t;
      if (ful && t) ful.value = 'auto';
    },

    async saveServiceEditor() {
      if (!canManageCatalog()) { showToast('Sem permissão.', 'error'); return; }
      const s = Auth.getSession();
      const apiType = document.getElementById('mktSvcApiType').value || null;
      const row = {
        id: document.getElementById('mktSvcEditId').value || undefined,
        name: document.getElementById('mktSvcName').value.trim(),
        category: document.getElementById('mktSvcCategory').value,
        description: document.getElementById('mktSvcDesc').value.trim(),
        points_price: parseFloat(document.getElementById('mktSvcPoints').value) || 0,
        emoji: document.getElementById('mktSvcEmoji').value.trim() || '🛒',
        api_type: apiType,
        api_consulta: apiType ? (document.getElementById('mktSvcApiConsulta').value.trim() || null) : null,
        fulfillment: document.getElementById('mktSvcFulfillment').value || 'manual',
        active: document.getElementById('mktSvcActive').checked,
        sort_order: parseInt(document.getElementById('mktSvcSort').value, 10) || 0,
        created_by: s?.id,
        partner_root_id: null,
      };
      if (!row.name) { showToast('Informe o nome.', 'warning'); return; }
      showLoading('Salvando...');
      try {
        await DB.saveMarketplaceService(row);
        closeModal('mktSvcModal');
        showToast('Serviço salvo!', 'success');
        await this.renderCatalogAdmin();
        if (document.getElementById('marketplaceBluRoot')) await this.renderShop();
      } catch (e) {
        alert('Erro: ' + (e.message || e));
      } finally { hideLoading(); }
    },

    async removeService(id) {
      showConfirm('Excluir Serviço', 'Tem certeza de que deseja excluir este serviço do catálogo?', async () => {
        await DB.deleteMarketplaceService(id);
        showToast('Serviço excluído.', 'success');
        await this.renderCatalogAdmin();
      });
    },

    async fulfill(orderId) {
      showPrompt('Concluir Solicitação', 'Observação de conclusão (opcional):', 'Observações sobre a conclusão do serviço...', async (notes) => {
        showLoading('Concluindo...');
        try {
          await DB.updateMarketplaceOrder(orderId, {
            status: 'concluido',
            notes: notes || '',
            fulfilled_by: Auth.getSession()?.id,
          });
          showToast('Solicitação concluída.', 'success');
          await this.renderOrdersAdmin();
        } catch (e) {
          showToast(e.message || e, 'error');
        } finally {
          hideLoading();
        }
      });
    },

    async cancel(orderId) {
      showConfirm('Cancelar Solicitação', 'Tem certeza de que deseja cancelar esta solicitação?', async () => {
        const o = await DB.getMarketplaceOrder(orderId);
        if (!o || o.status === 'cancelado') return;
        showLoading('Cancelando...');
        try {
          await DB.updateMarketplaceOrder(orderId, { status: 'cancelado', notes: 'Cancelado pela gestão' });
          showToast('Solicitação cancelada.', 'success');
          await this.renderOrdersAdmin();
          if (document.getElementById('marketplaceBluRoot')) await this.renderShop();
        } catch (e) {
          showToast(e.message || e, 'error');
        } finally {
          hideLoading();
        }
      });
    },

    ensureModals() {
      if (document.getElementById('mktRedeemModal')) return;
      document.body.insertAdjacentHTML('beforeend', `
<div class="modal-overlay" id="mktRedeemModal"><div class="modal" style="max-width:480px;"><div class="modal-header">
  <h3 id="mktRedeemTitle">Solicitar serviço</h3><button type="button" class="modal-close" onclick="closeModal('mktRedeemModal')"></button></div>
<div class="modal-body">
  <p id="mktRedeemDesc" style="font-size:14px;color:var(--color-text-muted);"></p>
  <p style="font-weight:800;color:var(--color-primary);margin:12px 0;" id="mktRedeemPrice"></p>
  <div class="form-group" id="mktRedeemDocGroup"><label id="mktRedeemDocLabel">Documento</label>
    <input type="text" id="mktRedeemDoc" class="form-control" autocomplete="off"/></div>
  <div class="form-group"><label>Observação (serviços manuais)</label>
    <textarea id="mktRedeemObs" class="form-control" rows="2" placeholder="Detalhes do pedido..."></textarea></div>
</div><div class="modal-footer">
  <button type="button" class="btn btn-ghost" onclick="closeModal('mktRedeemModal')">Cancelar</button>
  <button type="button" class="btn btn-primary" onclick="MarketplaceBlu.confirmRedeem()">Confirmar solicitação</button>
</div></div></div>
<div class="modal-overlay" id="mktResultModal"><div class="modal" style="max-width:640px;"><div class="modal-header">
  <h3 id="mktResultTitle">Resultado</h3><button type="button" class="modal-close" onclick="closeModal('mktResultModal')"></button></div>
<div class="modal-body" id="mktResultBody" style="max-height:60vh;overflow:auto;"></div>
<div class="modal-footer"><button type="button" class="btn btn-ghost" onclick="closeModal('mktResultModal')">Fechar</button></div></div></div>
<div class="modal-overlay" id="mktSvcModal"><div class="modal" style="max-width:560px;"><div class="modal-header">
  <h3 id="mktSvcModalTitle">Serviço</h3><button type="button" class="modal-close" onclick="closeModal('mktSvcModal')"></button></div>
<div class="modal-body" style="max-height:70vh;overflow-y:auto;">
  <input type="hidden" id="mktSvcEditId"/>
  <div class="form-row"><div class="form-group"><label>Nome *</label><input type="text" id="mktSvcName" class="form-control"/></div>
  <div class="form-group"><label>Emoji</label><input type="text" id="mktSvcEmoji" class="form-control" maxlength="4"/></div></div>
  <div class="form-row"><div class="form-group"><label>Categoria</label>
    <select id="mktSvcCategory" class="form-control">${CATEGORIES.filter(c => c !== 'Todos').map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
  <div class="form-group"><label>Valor (R$) *</label><input type="number" id="mktSvcPoints" class="form-control" min="0" step="any"/></div></div>
  <div class="form-group"><label>Descrição</label><textarea id="mktSvcDesc" class="form-control" rows="2"></textarea></div>
  <div class="form-row"><div class="form-group"><label>Consulta API</label>
    <select id="mktSvcApiType" class="form-control" onchange="MarketplaceBlu._syncApiFields()">
      <option value="">Nenhuma (manual)</option><option value="cpf">CPF</option><option value="cnpj">CNPJ</option>
    </select></div>
  <div class="form-group"><label>Endpoint FonteData</label>
    <input type="text" id="mktSvcApiConsulta" class="form-control" placeholder="cadastro-pf-basica, score-credito-quod..."/></div></div>
  <div class="form-row"><div class="form-group"><label>Entrega</label>
    <select id="mktSvcFulfillment" class="form-control"><option value="auto">Automática (API)</option><option value="manual">Manual</option></select></div>
  <div class="form-group"><label>Ordem</label><input type="number" id="mktSvcSort" class="form-control" value="0"/></div></div>
  <label><input type="checkbox" id="mktSvcActive" checked/> Ativo</label>
</div><div class="modal-footer">
  <button type="button" class="btn btn-ghost" onclick="closeModal('mktSvcModal')">Cancelar</button>
  <button type="button" class="btn btn-primary" onclick="MarketplaceBlu.saveServiceEditor()">Salvar</button>
</div></div></div>`);
    },

    init() {
      this.ensureUi();
      const cfg = window.__ADMIN_NAV_CFG__;
      if (cfg) this.applyNavVisibility(cfg);
    },
  };

  window.MarketplaceBlu = MarketplaceBlu;
})();
