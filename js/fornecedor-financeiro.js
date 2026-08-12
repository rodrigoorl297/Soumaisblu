/* SOU + BLU — Fornecedor financeiro (cadastro, despesas, aprovação Master) */
(function () {
  function _isSouBluAdminPanel() {
    return !window.SOUBLU_FINANCEIRO_PAGE
      && !document.getElementById('finSidebarNav')
      && !!(document.getElementById('navManageProposals') || document.getElementById('secManageProposals'));
  }

  function _isSouBluFinanceiroPage() {
    return !!window.SOUBLU_FINANCEIRO_PAGE || !!document.getElementById('finSidebarNav');
  }

  const EXP_STATUS = [
    { value: 'pendente_master', label: 'Aguardando Master', cls: 'badge-warning' },
    { value: 'aprovado', label: 'Aprovado', cls: 'badge-info' },
    { value: 'pago', label: 'Pago', cls: 'badge-success' },
    { value: 'rejeitado', label: 'Rejeitado', cls: 'badge-danger' },
  ];

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function fmtMoney(v) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return '—';
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }

  function fmtDt(iso) {
    if (!iso) return '—';
    if (typeof formatDateTime === 'function') return formatDateTime(iso);
    try {
      const d = (typeof _parseSouBluDate === 'function') ? _parseSouBluDate(iso) : new Date(iso);
      if (!d || Number.isNaN(d.getTime())) return '—';
      return d.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      });
    } catch { return '—'; }
  }

  function stMeta(v) {
    return EXP_STATUS.find(s => s.value === v) || { label: v || '—', cls: 'badge-muted' };
  }

  function canManage() {
    const s = Auth.getSession();
    if (!s || window.PARTNER_ROOT_ID) return false;
    return ['master', 'fundador', 'gerente', 'financeiro', 'financial'].includes(s.role);
  }

  function canApproveMaster() {
    const s = Auth.getSession();
    if (!s || window.PARTNER_ROOT_ID) return false;
    return ['master', 'fundador'].includes(s.role);
  }

  const FornecedorFinanceiro = {
    tab: 'despesas',

    ensureUi() {
      if (_isSouBluAdminPanel() || _isSouBluFinanceiroPage()) {
        this.ensureModals();
        return;
      }

      const nav = document.querySelector('.sidebar-nav');
      const main = document.querySelector('.page-content');
      if (!nav || !main || !canManage()) return;

      if (!document.getElementById('navFornecedorFinanceiro')) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-item fornecedor-financeiro-nav';
        btn.id = 'navFornecedorFinanceiro';
        btn.dataset.section = 'secFornecedorFinanceiro';
        btn.innerHTML = `${navIconHtml('building')}<span class="nav-label">Fornecedor financeiro</span>`;
        const anchor = document.getElementById('navFiscalParceiro')
          || document.getElementById('navMarketplaceOrders')
          || document.querySelector('.financial-only');
        if (anchor?.parentNode) anchor.parentNode.insertBefore(btn, anchor.nextSibling);
        else nav.appendChild(btn);
      }

      if (!document.getElementById('secFornecedorFinanceiro')) {
        const sec = document.createElement('section');
        sec.className = 'section';
        sec.id = 'secFornecedorFinanceiro';
        sec.innerHTML = '<div id="fornecedorFinanceiroRoot"></div>';
        main.appendChild(sec);
      }
      this.ensureModals();
    },

    applyNavVisibility(cfg) {
      const show = cfg?.canFornecedorFinanceiro !== false && canManage()
        && !_isSouBluAdminPanel() && !_isSouBluFinanceiroPage();
      document.querySelectorAll('.fornecedor-financeiro-nav').forEach(el => {
        el.style.display = show ? '' : 'none';
      });
    },

    ensureModals() {
      if (document.getElementById('fornecedorSupplierModal')) return;
      const wrap = document.createElement('div');
      wrap.innerHTML = `
<div class="modal-overlay" id="fornecedorSupplierModal">
  <div class="modal" style="max-width:520px;">
    <div class="modal-header"><h3 id="fornecedorSupplierTitle">Fornecedor</h3>
      <button type="button" class="modal-close" onclick="closeModal('fornecedorSupplierModal')"></button></div>
    <div class="modal-body">
      <input type="hidden" id="fornecedorSupplierId"/>
      <div class="form-group"><label>Nome / Razão social *</label>
        <input type="text" id="fornecedorSupplierName" class="form-control"/></div>
      <div class="form-row">
        <div class="form-group"><label>CNPJ / CPF</label>
          <input type="text" id="fornecedorSupplierDoc" class="form-control"/></div>
        <div class="form-group"><label>Categoria</label>
          <input type="text" id="fornecedorSupplierCat" class="form-control" placeholder="Ex: Marketing"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Tipo PIX</label>
          <select id="fornecedorSupplierPixType" class="form-control">
            <option value="cpf">CPF</option><option value="cnpj">CNPJ</option>
            <option value="email">E-mail</option><option value="telefone">Telefone</option><option value="aleatoria">Aleatória</option>
          </select></div>
        <div class="form-group"><label>Chave PIX</label>
          <input type="text" id="fornecedorSupplierPix" class="form-control"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>E-mail</label>
          <input type="email" id="fornecedorSupplierEmail" class="form-control"/></div>
        <div class="form-group"><label>Telefone</label>
          <input type="text" id="fornecedorSupplierPhone" class="form-control"/></div>
      </div>
      <div class="form-group"><label>Observações</label>
        <textarea id="fornecedorSupplierNotes" class="form-control" rows="2"></textarea></div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
        <input type="checkbox" id="fornecedorSupplierActive" checked/> Ativo
      </label>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal('fornecedorSupplierModal')">Cancelar</button>
      <button type="button" class="btn btn-primary" onclick="FornecedorFinanceiro.saveSupplier()">Salvar</button>
    </div>
  </div>
</div>
<div class="modal-overlay" id="fornecedorExpenseModal">
  <div class="modal" style="max-width:560px;">
    <div class="modal-header"><h3>Nova despesa</h3>
      <button type="button" class="modal-close" onclick="closeModal('fornecedorExpenseModal')"></button></div>
    <div class="modal-body">
      <div class="form-group"><label>Fornecedor *</label>
        <select id="fornecedorExpenseSupplier" class="form-control"></select></div>
      <div class="form-group"><label>Descrição *</label>
        <input type="text" id="fornecedorExpenseDesc" class="form-control" placeholder="Ex: NF serviço gráfico"/></div>
      <div class="form-row">
        <div class="form-group"><label>Valor (R$) *</label>
          <input type="number" id="fornecedorExpenseAmount" class="form-control" min="0.01" step="0.01"/></div>
        <div class="form-group"><label>Categoria</label>
          <input type="text" id="fornecedorExpenseCat" class="form-control" value="Despesa operacional"/></div>
      </div>
      <div class="form-group"><label>NF / Recibo (anexo)</label>
        <input type="file" id="fornecedorExpenseFile" class="form-control" accept="image/*,.pdf"/></div>
      <div class="form-group"><label>Observações</label>
        <textarea id="fornecedorExpenseNotes" class="form-control" rows="2"></textarea></div>
      <p style="font-size:12px;color:var(--color-text-muted);margin:0;">
        Após lançar, a despesa aguarda <strong>aprovação do Master</strong> antes do pagamento.
      </p>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal('fornecedorExpenseModal')">Cancelar</button>
      <button type="button" class="btn btn-primary" onclick="FornecedorFinanceiro.saveExpense()">Lançar despesa</button>
    </div>
  </div>
</div>`;
      document.body.appendChild(wrap);
    },

    async render() {
      this.ensureUi();
      const root = document.getElementById('fornecedorFinanceiroRoot');
      if (!root || !canManage()) return;

      const [suppliers, expenses] = await Promise.all([
        DB.getFinanceSuppliers(),
        DB.getFinanceExpenses(),
      ]);

      root.innerHTML = `
        <div class="section-header">
          <div><h2>Fornecedor financeiro</h2>
            <p class="text-muted">Cadastro de fornecedores, despesas com anexo NF/recibo e aprovação Master.</p></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn btn-ghost btn-sm" onclick="FornecedorFinanceiro.openSupplierModal()">+ Fornecedor</button>
            <button type="button" class="btn btn-primary btn-sm" onclick="FornecedorFinanceiro.openExpenseModal()">+ Despesa</button>
          </div>
        </div>
        <div class="tabs" style="margin-bottom:16px;">
          <button type="button" class="tab ${this.tab === 'despesas' ? 'active' : ''}" onclick="FornecedorFinanceiro.switchTab('despesas')">Despesas (${expenses.length})</button>
          <button type="button" class="tab ${this.tab === 'fornecedores' ? 'active' : ''}" onclick="FornecedorFinanceiro.switchTab('fornecedores')">Fornecedores (${suppliers.length})</button>
        </div>
        <div id="fornecedorFinanceiroPanel"></div>`;

      const panel = document.getElementById('fornecedorFinanceiroPanel');
      if (this.tab === 'fornecedores') {
        panel.innerHTML = this._renderSuppliersTable(suppliers);
      } else {
        panel.innerHTML = this._renderExpensesTable(expenses);
      }
    },

    switchTab(tab) {
      this.tab = tab;
      this.render();
    },

    _renderSuppliersTable(list) {
      if (!list.length) {
        return '<div class="card card-padded text-muted text-center">Nenhum fornecedor cadastrado.</div>';
      }
      const rows = list.map(s => `
        <tr>
          <td><strong>${esc(s.name)}</strong><div style="font-size:12px;color:var(--color-text-muted);">${esc(s.category || '')}</div></td>
          <td>${esc(s.document || '—')}</td>
          <td><div style="font-size:12px;">${esc((s.pix_type || 'pix').toUpperCase())}</div><div style="font-size:12px;color:var(--color-text-muted);">${esc(s.pix_key || '—')}</div></td>
          <td>${s.active !== false ? '<span class="badge badge-success">Ativo</span>' : '<span class="badge badge-muted">Inativo</span>'}</td>
          <td style="white-space:nowrap;">
            <button type="button" class="btn btn-ghost btn-sm" onclick="FornecedorFinanceiro.openSupplierModal('${esc(s.id)}')">Editar</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="FornecedorFinanceiro.deleteSupplier('${esc(s.id)}')">Excluir</button>
          </td>
        </tr>`).join('');
      return `<div class="card"><div class="table-responsive"><table class="data-table">
        <thead><tr><th>Fornecedor</th><th>Documento</th><th>PIX</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>`;
    },

    _renderExpensesTable(list) {
      if (!list.length) {
        return '<div class="card card-padded text-muted text-center">Nenhuma despesa lançada.</div>';
      }
      const rows = list.map(e => {
        const st = stMeta(e.status);
        const att = (e.attachments || [])[0];
        const attHtml = att?.url
          ? `<a href="${esc(att.url)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">Ver anexo</a>`
          : '—';
        let actions = '';
        if (e.status === 'pendente_master' && canApproveMaster()) {
          actions += `<button type="button" class="btn btn-primary btn-sm" onclick="FornecedorFinanceiro.approveExpense('${esc(e.id)}')">Aprovar</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="FornecedorFinanceiro.rejectExpense('${esc(e.id)}')">Rejeitar</button>`;
        }
        if (e.status === 'aprovado') {
          actions += `<button type="button" class="btn btn-success btn-sm" onclick="FornecedorFinanceiro.markPaid('${esc(e.id)}')">Marcar pago</button>`;
        }
        return `<tr>
          <td>${fmtDt(e.created_at)}</td>
          <td><strong>${esc(e.supplier_name)}</strong><div style="font-size:12px;">${esc(e.description)}</div></td>
          <td>${fmtMoney(e.amount)}</td>
          <td><span class="badge ${st.cls}">${st.label}</span></td>
          <td>${attHtml}</td>
          <td style="white-space:nowrap;">${actions || '—'}</td>
        </tr>`;
      }).join('');
      return `<div class="card"><div class="table-responsive"><table class="data-table">
        <thead><tr><th>Data</th><th>Fornecedor / Descrição</th><th>Valor</th><th>Status</th><th>Anexo</th><th>Ações</th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>`;
    },

    async openSupplierModal(id) {
      this.ensureModals();
      const title = document.getElementById('fornecedorSupplierTitle');
      document.getElementById('fornecedorSupplierId').value = id || '';
      if (id) {
        const s = await DB.getFinanceSupplier(id);
        if (!s) { showToast('Fornecedor não encontrado.', 'error'); return; }
        title.textContent = 'Editar fornecedor';
        document.getElementById('fornecedorSupplierName').value = s.name || '';
        document.getElementById('fornecedorSupplierDoc').value = s.document || '';
        document.getElementById('fornecedorSupplierCat').value = s.category || '';
        document.getElementById('fornecedorSupplierPixType').value = s.pix_type || 'cpf';
        document.getElementById('fornecedorSupplierPix').value = s.pix_key || '';
        document.getElementById('fornecedorSupplierEmail').value = s.email || '';
        document.getElementById('fornecedorSupplierPhone').value = s.phone || '';
        document.getElementById('fornecedorSupplierNotes').value = s.notes || '';
        document.getElementById('fornecedorSupplierActive').checked = s.active !== false;
      } else {
        title.textContent = 'Novo fornecedor';
        ['fornecedorSupplierName', 'fornecedorSupplierDoc', 'fornecedorSupplierCat',
          'fornecedorSupplierPix', 'fornecedorSupplierEmail', 'fornecedorSupplierPhone',
          'fornecedorSupplierNotes'].forEach(i => {
          const el = document.getElementById(i);
          if (el) el.value = i === 'fornecedorSupplierCat' ? 'Geral' : '';
        });
        document.getElementById('fornecedorSupplierPixType').value = 'cpf';
        document.getElementById('fornecedorSupplierActive').checked = true;
      }
      openModal('fornecedorSupplierModal');
    },

    async saveSupplier() {
      const id = document.getElementById('fornecedorSupplierId').value.trim();
      const name = document.getElementById('fornecedorSupplierName').value.trim();
      if (!name) { showToast('Informe o nome do fornecedor.', 'warning'); return; }
      const s = Auth.getSession();
      const row = await DB.saveFinanceSupplier({
        id: id || undefined,
        name,
        document: document.getElementById('fornecedorSupplierDoc').value.trim(),
        category: document.getElementById('fornecedorSupplierCat').value.trim() || 'Geral',
        pix_type: document.getElementById('fornecedorSupplierPixType').value,
        pix_key: document.getElementById('fornecedorSupplierPix').value.trim(),
        email: document.getElementById('fornecedorSupplierEmail').value.trim(),
        phone: document.getElementById('fornecedorSupplierPhone').value.trim(),
        notes: document.getElementById('fornecedorSupplierNotes').value.trim(),
        active: document.getElementById('fornecedorSupplierActive').checked,
        created_by: s?.id || 'admin',
      });
      if (!row) { showToast('Não foi possível salvar.', 'error'); return; }
      closeModal('fornecedorSupplierModal');
      showToast('Fornecedor salvo.', 'success');
      await this.render();
    },

    async deleteSupplier(id) {
      if (!confirm('Excluir este fornecedor?')) return;
      await DB.deleteFinanceSupplier(id);
      showToast('Fornecedor excluído.', 'success');
      await this.render();
    },

    async openExpenseModal() {
      this.ensureModals();
      const suppliers = await DB.getFinanceSuppliers(true);
      const sel = document.getElementById('fornecedorExpenseSupplier');
      sel.innerHTML = suppliers.length
        ? suppliers.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')
        : '<option value="">Cadastre um fornecedor primeiro</option>';
      document.getElementById('fornecedorExpenseDesc').value = '';
      document.getElementById('fornecedorExpenseAmount').value = '';
      document.getElementById('fornecedorExpenseCat').value = 'Despesa operacional';
      document.getElementById('fornecedorExpenseNotes').value = '';
      document.getElementById('fornecedorExpenseFile').value = '';
      openModal('fornecedorExpenseModal');
    },

    async saveExpense() {
      const supplierId = document.getElementById('fornecedorExpenseSupplier').value;
      const desc = document.getElementById('fornecedorExpenseDesc').value.trim();
      const amount = parseFloat(document.getElementById('fornecedorExpenseAmount').value);
      if (!supplierId) { showToast('Selecione um fornecedor.', 'warning'); return; }
      if (!desc) { showToast('Informe a descrição.', 'warning'); return; }
      if (!Number.isFinite(amount) || amount <= 0) { showToast('Valor inválido.', 'warning'); return; }

      const supplier = await DB.getFinanceSupplier(supplierId);
      if (!supplier) { showToast('Fornecedor não encontrado.', 'error'); return; }

      let attachments = [];
      const file = document.getElementById('fornecedorExpenseFile')?.files?.[0];
      if (file && typeof uploadImage === 'function') {
        try {
          const url = await uploadImage(file, 'finance-docs', `exp_${Date.now()}`);
          if (url) attachments.push({ name: file.name, url, uploaded_at: new Date().toISOString() });
        } catch (e) {
          showToast('Falha no anexo: ' + (e.message || ''), 'warning');
        }
      }

      const s = Auth.getSession();
      const row = await DB.saveFinanceExpense({
        supplier_id: supplierId,
        supplier_name: supplier.name,
        description: desc,
        category: document.getElementById('fornecedorExpenseCat').value.trim() || 'Despesa',
        amount,
        status: 'pendente_master',
        pix_snapshot: { pix_key: supplier.pix_key, pix_type: supplier.pix_type },
        attachments,
        notes: document.getElementById('fornecedorExpenseNotes').value.trim(),
        created_by: s?.id || 'admin',
      });
      if (!row) { showToast('Não foi possível lançar a despesa.', 'error'); return; }
      closeModal('fornecedorExpenseModal');
      showToast('Despesa lançada — aguarda aprovação Master.', 'success');
      this.tab = 'despesas';
      await this.render();
    },

    async approveExpense(id) {
      if (!canApproveMaster()) { showToast('Apenas Master pode aprovar.', 'warning'); return; }
      const s = Auth.getSession();
      await DB.updateFinanceExpense(id, {
        status: 'aprovado',
        master_approved_by: s?.id || 'master',
        master_approved_at: new Date().toISOString(),
      });
      showToast('Despesa aprovada.', 'success');
      await this.render();
    },

    async rejectExpense(id) {
      if (!canApproveMaster()) return;
      const notes = prompt('Motivo da rejeição (opcional):') || '';
      await DB.updateFinanceExpense(id, { status: 'rejeitado', notes });
      showToast('Despesa rejeitada.', 'info');
      await this.render();
    },

    async markPaid(id) {
      const s = Auth.getSession();
      await DB.updateFinanceExpense(id, {
        status: 'pago',
        paid_at: new Date().toISOString(),
        paid_by: s?.id || 'financeiro',
      });
      showToast('Despesa marcada como paga.', 'success');
      await this.render();
    },

    init() {
      this.ensureUi();
    },
  };

  window.FornecedorFinanceiro = FornecedorFinanceiro;
})();
