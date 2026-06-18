/* SOU+BLU — Esteira de Crédito (Financeiro) */
(function () {
  'use strict';

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function fmtMoney(v) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return '—';
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }

  function canView() {
    const s = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    if (!s || window.PARTNER_ROOT_ID) return false;
    return ['master', 'fundador', 'gerente', 'financeiro', 'financial', 'rh', 'diretoria'].includes(String(s.role || '').toLowerCase());
  }

  function isCreditoProposal(p) {
    if (!p) return false;
    if (p.credito === true) return true;
    const m = p.meta && typeof p.meta === 'object' ? p.meta : {};
    if (m.credito === true || m.opcao_credito === true) return true;
    const obs = String(p.obs || '').toUpperCase();
    return obs.includes('[CREDITO]') || obs.includes('ESTEIRA DE CRÉDITO') || obs.includes('ESTEIRA DE CREDITO');
  }

  function proposalLabel(p) {
    const num = p.numero || p.id || '—';
    const cli = p.client_name || p.clientName || 'Cliente';
    const vend = p.vendor_name || p.vendorName || '';
    return `${num} · ${cli}${vend ? ` · ${vend}` : ''}`;
  }

  const EsteiraCredito = {
    tab: 'propostas',

    applyNavVisibility(cfg) {
      const show = cfg?.canMasterPanel || cfg?.canSaques || canView();
      document.querySelectorAll('#navFinEsteira, [data-section="secEsteiraCredito"]').forEach((el) => {
        el.style.display = show ? '' : 'none';
      });
    },

    async render() {
      await this.mount();
    },

    init() {
      this.applyNavVisibility();
      this._ensureModal();
    },

    _ensureModal() {
      if (document.getElementById('esteiraCreditoAddModal')) return;
      const host = document.createElement('div');
      host.innerHTML = `
<div class="modal-overlay" id="esteiraCreditoAddModal">
  <div class="modal" style="max-width:520px;">
    <div class="modal-header">
      <h3>Adicionar à esteira de crédito</h3>
      <button type="button" class="modal-close" onclick="closeModal('esteiraCreditoAddModal')"></button>
    </div>
    <div class="modal-body">
      <p class="text-muted" style="font-size:13px;margin:0 0 14px;">Selecione uma proposta existente para entrar na esteira de crédito e informe os dados de comissão.</p>
      <div class="form-group">
        <label>Proposta</label>
        <select id="esteiraAddProposal" class="form-control"><option value="">Carregando...</option></select>
      </div>
      <div class="form-row" style="gap:12px;">
        <div class="form-group" style="flex:1;">
          <label>Elegível comissão?</label>
          <select id="esteiraAddElegivel" class="form-control">
            <option value="">—</option><option value="SIM">SIM</option><option value="NÃO">NÃO</option>
          </select>
        </div>
        <div class="form-group" style="flex:1;">
          <label>Comissão recebida?</label>
          <select id="esteiraAddRecebida" class="form-control">
            <option value="">—</option><option value="SIM">SIM</option><option value="NÃO">NÃO</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Valor comissão recebida (R$)</label>
        <input type="number" id="esteiraAddValor" class="form-control" min="0" step="0.01" placeholder="0,00"/>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal('esteiraCreditoAddModal')">Cancelar</button>
      <button type="button" class="btn btn-primary" onclick="EsteiraCredito.saveAdd()">Adicionar à esteira</button>
    </div>
  </div>
</div>`;
      document.body.appendChild(host.firstElementChild);
    },

    _toolbarHtml() {
      return `<div class="esteira-credito-toolbar" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;align-items:center;">
        <button type="button" class="btn btn-primary btn-sm" onclick="EsteiraCredito.openAddModal()">+ Adicionar à esteira</button>
        <button type="button" class="btn btn-outline btn-sm" onclick="EsteiraCredito.openCcbPanel()">Emitir CCB</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="FinanceiroBoot.openSection('secManageProposals')">Gestão de propostas</button>
      </div>`;
    },

    _renderPropostasShell() {
      return `<div class="card card-padded">
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:8px;">
          <div>
            <h2 style="font-weight:800;margin:0 0 8px;">Esteira de Crédito</h2>
            <p class="text-muted" style="margin:0;font-size:14px;">Acompanhe propostas com opção crédito e comissão do vendedor.</p>
          </div>
        </div>
        ${this._toolbarHtml()}
        <div id="esteiraCreditoTableWrap" class="text-muted">Carregando propostas...</div>
      </div>`;
    },

    _renderCcbShell() {
      return `<div class="card card-padded" id="cprAdminSection">
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:16px;">
          <div>
            <h2 style="font-weight:800;margin:0 0 8px;">Emitir CCB</h2>
            <p class="text-muted" style="margin:0;font-size:14px;">Registre a emissão de Cédula de Crédito Bancário para propostas da esteira.</p>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" onclick="EsteiraCredito.openPropostasPanel()">← Voltar à esteira</button>
        </div>
        <div class="form-group">
          <label>Proposta na esteira de crédito</label>
          <select id="ccbProposalSelect" class="form-control"><option value="">Carregando...</option></select>
        </div>
        <div class="form-row" style="gap:12px;">
          <div class="form-group" style="flex:1;">
            <label>Valor do crédito (R$)</label>
            <input type="number" id="ccbValor" class="form-control" min="0" step="0.01" placeholder="0,00"/>
          </div>
          <div class="form-group" style="flex:1;">
            <label>Parcelas</label>
            <input type="number" id="ccbParcelas" class="form-control" min="1" step="1" placeholder="Ex.: 84"/>
          </div>
        </div>
        <div class="form-group">
          <label>Observações da emissão</label>
          <textarea id="ccbObs" class="form-control" rows="3" placeholder="Dados complementares do CCB (opcional)"></textarea>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-primary" onclick="EsteiraCredito.emitCcb()">Emitir CCB</button>
          <button type="button" class="btn btn-outline btn-sm" onclick="EsteiraCredito.openAddModal()">+ Adicionar proposta à esteira</button>
        </div>
        <div id="ccbEmitResult" style="margin-top:16px;"></div>
      </div>`;
    },

    async mount(rootId = 'esteiraCreditoRoot') {
      const root = document.getElementById(rootId);
      if (!root || !canView()) return;
      this._ensureModal();
      root.innerHTML = this.tab === 'ccb' ? this._renderCcbShell() : this._renderPropostasShell();
      await this._ensureComissaoSchema();
      if (this.tab === 'ccb') {
        await this._populateCcbSelect();
        return;
      }
      await this.renderTable();
    },

    openPropostasPanel() {
      this.tab = 'propostas';
      if (window.FinanceiroBoot?.openSection) {
        FinanceiroBoot.openSection('secEsteiraCredito', '');
      } else {
        this.mount();
      }
    },

    openCcbPanel() {
      this.tab = 'ccb';
      if (window.FinanceiroBoot?.openSection) {
        FinanceiroBoot.openSection('secEsteiraCredito', 'ccb');
      } else {
        this.mount();
      }
    },

    async _ensureComissaoSchema() {
      try {
        const c = window.SOUBLU_CONFIG || {};
        const key = c.API_KEY;
        const base = String(c.API_BASE_URL || c.SITE_URL || location.origin).replace(/\/+$/, '');
        if (!key || sessionStorage.getItem('soublu_proposals_comissao') === '1') return;
        const res = await fetch(`${base}/api/migrate-proposals-comissao.php`, {
          headers: { apikey: key, 'X-API-Key': key },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) sessionStorage.setItem('soublu_proposals_comissao', '1');
      } catch (_) { /* noop */ }
    },

    async _loadProposals() {
      return DB.getProposals().catch(() => []);
    },

    async _populateCcbSelect() {
      const sel = document.getElementById('ccbProposalSelect');
      if (!sel) return;
      const props = await this._loadProposals();
      const credito = (props || []).filter(isCreditoProposal);
      if (!credito.length) {
        sel.innerHTML = '<option value="">Nenhuma proposta na esteira — adicione primeiro</option>';
        return;
      }
      sel.innerHTML = '<option value="">Selecione a proposta...</option>' + credito.map((p) =>
        `<option value="${esc(p.id)}" data-valor="${esc(p.valorFinal || p.valor_final || p.valor || '')}">${esc(proposalLabel(p))}</option>`
      ).join('');
      sel.onchange = () => {
        const opt = sel.selectedOptions[0];
        const v = document.getElementById('ccbValor');
        if (v && opt?.dataset.valor) v.value = parseFloat(opt.dataset.valor) || '';
      };
    },

    async openAddModal() {
      this._ensureModal();
      const sel = document.getElementById('esteiraAddProposal');
      if (!sel) return;
      const props = await this._loadProposals();
      const disponiveis = (props || []).filter((p) => !isCreditoProposal(p));
      sel.innerHTML = disponiveis.length
        ? '<option value="">Selecione a proposta...</option>' + disponiveis.map((p) =>
          `<option value="${esc(p.id)}">${esc(proposalLabel(p))}</option>`
        ).join('')
        : '<option value="">Todas as propostas já estão na esteira</option>';
      document.getElementById('esteiraAddElegivel').value = '';
      document.getElementById('esteiraAddRecebida').value = '';
      document.getElementById('esteiraAddValor').value = '';
      openModal('esteiraCreditoAddModal');
    },

    async saveAdd() {
      const id = document.getElementById('esteiraAddProposal')?.value;
      if (!id) {
        showToast('Selecione uma proposta.', 'warning');
        return;
      }
      const elegivel = document.getElementById('esteiraAddElegivel')?.value || '';
      const recebida = document.getElementById('esteiraAddRecebida')?.value || '';
      const valorRaw = document.getElementById('esteiraAddValor')?.value;
      const valor = valorRaw !== '' && valorRaw != null ? parseFloat(valorRaw) : null;

      const props = await this._loadProposals();
      const p = props.find((x) => String(x.id) === String(id));
      if (!p) {
        showToast('Proposta não encontrada.', 'error');
        return;
      }

      const updated = {
        ...p,
        credito: true,
        comissaoElegivel: elegivel || p.comissaoElegivel || p.comissao_elegivel || null,
        comissao_elegivel: elegivel || p.comissao_elegivel || p.comissaoElegivel || null,
        comissaoRecebida: recebida || p.comissaoRecebida || p.comissao_recebida || null,
        comissao_recebida: recebida || p.comissao_recebida || p.comissaoRecebida || null,
        valorComissaoRecebida: valor != null && Number.isFinite(valor) ? valor : (p.valorComissaoRecebida ?? p.valor_comissao_recebida ?? null),
        valor_comissao_recebida: valor != null && Number.isFinite(valor) ? valor : (p.valor_comissao_recebida ?? p.valorComissaoRecebida ?? null),
        obs: typeof DB._appendProposalObsLine === 'function'
          ? DB._appendProposalObsLine(p.obs, '[CREDITO] Esteira de crédito')
          : `${String(p.obs || '').trim()}\n[CREDITO] Esteira de crédito`.trim(),
        updatedAt: new Date().toISOString(),
      };

      showLoading('Salvando...');
      try {
        if (typeof DB.saveProposal === 'function') await DB.saveProposal(updated);
        else await DB.save('proposals', updated);
        closeModal('esteiraCreditoAddModal');
        showToast('Proposta adicionada à esteira de crédito.', 'success');
        this.tab = 'propostas';
        await this.mount();
      } catch (e) {
        showToast(e.message || 'Erro ao salvar.', 'error');
      } finally {
        hideLoading();
      }
    },

    async emitCcb() {
      const id = document.getElementById('ccbProposalSelect')?.value;
      if (!id) {
        showToast('Selecione uma proposta da esteira.', 'warning');
        return;
      }
      const valor = parseFloat(document.getElementById('ccbValor')?.value);
      const parcelas = parseInt(document.getElementById('ccbParcelas')?.value, 10);
      const obsExtra = document.getElementById('ccbObs')?.value?.trim() || '';

      const props = await this._loadProposals();
      const p = props.find((x) => String(x.id) === String(id));
      if (!p) {
        showToast('Proposta não encontrada.', 'error');
        return;
      }

      const now = new Date().toLocaleString('pt-BR');
      const linha = [
        `CCB emitido em ${now}`,
        Number.isFinite(valor) ? `Valor: R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '',
        Number.isFinite(parcelas) ? `Parcelas: ${parcelas}` : '',
        obsExtra,
      ].filter(Boolean).join(' · ');

      const updated = {
        ...p,
        obs: typeof DB._appendProposalObsLine === 'function'
          ? DB._appendProposalObsLine(p.obs, linha)
          : `${String(p.obs || '').trim()}\n${linha}`.trim(),
        updatedAt: new Date().toISOString(),
      };

      showLoading('Registrando CCB...');
      try {
        if (typeof DB.saveProposal === 'function') await DB.saveProposal(updated);
        else await DB.save('proposals', updated);
        const box = document.getElementById('ccbEmitResult');
        if (box) {
          box.innerHTML = `<div class="card card-padded" style="background:var(--color-success-light, #ecfdf5);border:1px solid #6ee7b7;">
            <strong style="color:#059669;">CCB registrado</strong>
            <p style="margin:8px 0 0;font-size:14px;">${esc(proposalLabel(p))}</p>
            <p style="margin:4px 0 0;font-size:13px;color:var(--color-text-muted);">${esc(linha)}</p>
          </div>`;
        }
        showToast('CCB emitido e registrado na proposta.', 'success');
      } catch (e) {
        showToast(e.message || 'Erro ao emitir CCB.', 'error');
      } finally {
        hideLoading();
      }
    },

    async openEditModal(id) {
      const props = await this._loadProposals();
      const p = props.find((x) => String(x.id) === String(id));
      if (!p) return;
      this._ensureModal();
      const sel = document.getElementById('esteiraAddProposal');
      if (sel) {
        sel.innerHTML = `<option value="${esc(p.id)}" selected>${esc(proposalLabel(p))}</option>`;
        sel.disabled = true;
      }
      document.getElementById('esteiraAddElegivel').value = p.comissaoElegivel || p.comissao_elegivel || '';
      document.getElementById('esteiraAddRecebida').value = p.comissaoRecebida || p.comissao_recebida || '';
      const v = p.valorComissaoRecebida ?? p.valor_comissao_recebida;
      document.getElementById('esteiraAddValor').value = v != null ? v : '';
      const saveBtn = document.querySelector('#esteiraCreditoAddModal .btn-primary');
      if (saveBtn) {
        saveBtn.textContent = 'Salvar alterações';
        saveBtn.onclick = () => this.saveEdit(id);
      }
      openModal('esteiraCreditoAddModal');
    },

    async saveEdit(id) {
      const elegivel = document.getElementById('esteiraAddElegivel')?.value || '';
      const recebida = document.getElementById('esteiraAddRecebida')?.value || '';
      const valorRaw = document.getElementById('esteiraAddValor')?.value;
      const valor = valorRaw !== '' && valorRaw != null ? parseFloat(valorRaw) : null;

      const props = await this._loadProposals();
      const p = props.find((x) => String(x.id) === String(id));
      if (!p) return;

      const updated = {
        ...p,
        comissaoElegivel: elegivel || null,
        comissao_elegivel: elegivel || null,
        comissaoRecebida: recebida || null,
        comissao_recebida: recebida || null,
        valorComissaoRecebida: valor != null && Number.isFinite(valor) ? valor : null,
        valor_comissao_recebida: valor != null && Number.isFinite(valor) ? valor : null,
        updatedAt: new Date().toISOString(),
      };

      showLoading('Salvando...');
      try {
        if (typeof DB.saveProposal === 'function') await DB.saveProposal(updated);
        else await DB.save('proposals', updated);
        closeModal('esteiraCreditoAddModal');
        const sel = document.getElementById('esteiraAddProposal');
        if (sel) sel.disabled = false;
        const saveBtn = document.querySelector('#esteiraCreditoAddModal .btn-primary');
        if (saveBtn) {
          saveBtn.textContent = 'Adicionar à esteira';
          saveBtn.onclick = () => this.saveAdd();
        }
        showToast('Comissão atualizada.', 'success');
        await this.renderTable();
      } catch (e) {
        showToast(e.message || 'Erro ao salvar.', 'error');
      } finally {
        hideLoading();
      }
    },

    async renderTable() {
      const wrap = document.getElementById('esteiraCreditoTableWrap');
      if (!wrap) return;
      const props = await this._loadProposals();
      const credito = (props || []).filter(isCreditoProposal);
      if (!credito.length) {
        wrap.innerHTML = `<div class="text-center" style="padding:28px 16px;">
          <p class="text-muted" style="margin:0 0 16px;">Nenhuma proposta na esteira de crédito.</p>
          <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
            <button type="button" class="btn btn-primary btn-sm" onclick="EsteiraCredito.openAddModal()">+ Adicionar à esteira</button>
            <button type="button" class="btn btn-outline btn-sm" onclick="EsteiraCredito.openCcbPanel()">Emitir CCB</button>
          </div>
        </div>`;
        return;
      }
      wrap.innerHTML = `<div class="table-wrap"><table class="data-table" style="width:100%;">
        <thead><tr>
          <th>Nº</th><th>Cliente</th><th>Vendedor</th><th>Status</th>
          <th>Comissão elegível</th><th>Comissão recebida</th><th>Valor (R$)</th><th>Ações</th>
        </tr></thead>
        <tbody>${credito.slice(0, 100).map((p) => {
          const pid = String(p.id || '').replace(/'/g, "\\'");
          return `<tr>
          <td>${esc(p.numero || p.id)}</td>
          <td>${esc(p.client_name || p.clientName || '—')}</td>
          <td>${esc(p.vendor_name || p.vendorName || '—')}</td>
          <td>${esc(p.status || '—')}</td>
          <td>${esc(p.comissaoElegivel || p.comissao_elegivel || '—')}</td>
          <td>${esc(p.comissaoRecebida || p.comissao_recebida || '—')}</td>
          <td>${esc(p.valorComissaoRecebida != null ? fmtMoney(p.valorComissaoRecebida) : (p.valor_comissao_recebida != null ? fmtMoney(p.valor_comissao_recebida) : '—'))}</td>
          <td style="white-space:nowrap;">
            <button type="button" class="btn btn-ghost btn-sm" onclick="EsteiraCredito.openEditModal('${pid}')">Editar</button>
            <button type="button" class="btn btn-outline btn-sm" onclick="EsteiraCredito.openCcbPanel()">CCB</button>
          </td>
        </tr>`;
        }).join('')}</tbody>
      </table></div>`;
    },
  };

  window.EsteiraCredito = EsteiraCredito;
})();
