/* SOU + BLU — Fiscal parceiro (fechamento, dados NF, upload nota) */
(function () {
  function _isSouBluAdminPanel() {
    return !window.SOUBLU_FINANCEIRO_PAGE
      && !document.getElementById('finSidebarNav')
      && !!(document.getElementById('navManageProposals') || document.getElementById('secManageProposals'));
  }

  function _isSouBluFinanceiroPage() {
    return !!window.SOUBLU_FINANCEIRO_PAGE || !!document.getElementById('finSidebarNav');
  }

  const STATUS = [
    { value: 'enviado', label: 'Fechamento enviado', cls: 'badge-info' },
    { value: 'aguardando_nf', label: 'Aguardando NF', cls: 'badge-warning' },
    { value: 'nf_recebida', label: 'NF recebida', cls: 'badge-success' },
    { value: 'concluido', label: 'Concluído', cls: 'badge-success' },
  ];

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function fmtMoney(v) {
    if (v == null || v === '') return '—';
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return '—';
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }

  function fmtCnpj(v) {
    const d = String(v || '').replace(/\D/g, '').slice(0, 14);
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
    if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
    if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }

  function stMeta(v) {
    return STATUS.find(s => s.value === v) || { label: v || '—', cls: 'badge-muted' };
  }

  function hasPerm(key) {
    if (typeof window.partnerOrgCan === 'function') return window.partnerOrgCan(key);
    return typeof PartnerPerms !== 'undefined' && PartnerPerms.can(window._PARTNER_PERMS, key);
  }

  function canManageFechamento() {
    const s = Auth.getSession();
    if (!s) return false;
    return !window.PARTNER_ROOT_ID && ['master', 'fundador', 'gerente', 'financeiro', 'financial', 'rh'].includes(s.role);
  }

  function canViewFiscal() {
    const s = Auth.getSession();
    if (!s) return false;
    if (!window.PARTNER_ROOT_ID) return canManageFechamento();
    return hasPerm('fechamento_financeiro') || hasPerm('dados_nota_fiscal') || hasPerm('upload_nota_fiscal');
  }

  function canViewDadosNf() {
    if (!window.PARTNER_ROOT_ID) return canManageFechamento();
    return hasPerm('dados_nota_fiscal') || hasPerm('upload_nota_fiscal');
  }

  function canUploadNf() {
    if (!window.PARTNER_ROOT_ID) return false;
    return hasPerm('upload_nota_fiscal');
  }

  async function buildDadosNf(partner) {
    if (!partner) return {};
    const cnpj = String(partner.cnpj || '').replace(/\D/g, '');
    const base = {
      cnpj: fmtCnpj(cnpj),
      razao_social: partner.razao_social || '',
      endereco: partner.endereco || '',
      email: partner.email || '',
      contato: partner.contato || '',
      representante_legal: partner.meta?.representante_legal || '',
      fonte: 'cadastro_parceiro',
      consultado_em: new Date().toISOString(),
    };
    if (cnpj.length === 14 && typeof FonteData !== 'undefined') {
      const res = await FonteData.lookupCnpj(cnpj);
      if (res.ok && res.partner) {
        return {
          ...base,
          razao_social: res.partner.razao_social || base.razao_social,
          endereco: res.partner.endereco || base.endereco,
          email: res.partner.email || base.email,
          contato: res.partner.contato || base.contato,
          representante_legal: res.partner.representante_legal || base.representante_legal,
          fonte: 'fontedata_cnpj',
          api_raw: res.raw || null,
        };
      }
    }
    return base;
  }

  const FiscalParceiro = {
    ensureUi() {
      if (_isSouBluAdminPanel() || _isSouBluFinanceiroPage()) {
        this.ensureModals();
        return;
      }

      const nav = document.querySelector('.sidebar-nav');
      const main = document.querySelector('.page-content');
      if (!nav || !main || !canViewFiscal()) return;

      if (!document.getElementById('navFiscalParceiro')) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-item fiscal-parceiro-nav';
        btn.id = 'navFiscalParceiro';
        btn.dataset.section = 'secFiscalParceiro';
        btn.innerHTML = `${navIconHtml('receipt')}<span class="nav-label">Fiscal — parceiro</span>`;
        const anchor = document.getElementById('navContestacao') || document.getElementById('navTimEsteira');
        if (anchor?.nextSibling) anchor.parentNode.insertBefore(btn, anchor.nextSibling);
        else nav.appendChild(btn);
      }

      if (!document.getElementById('secFiscalParceiro')) {
        const sec = document.createElement('section');
        sec.className = 'section';
        sec.id = 'secFiscalParceiro';
        sec.innerHTML = '<div id="fiscalParceiroRoot"></div>';
        main.appendChild(sec);
      }
      this.ensureModals();
    },

    applyNavVisibility(cfg) {
      const show = cfg?.canFiscalParceiro !== false && canViewFiscal()
        && !_isSouBluAdminPanel() && !_isSouBluFinanceiroPage();
      document.querySelectorAll('.fiscal-parceiro-nav').forEach(el => { el.style.display = show ? '' : 'none'; });
    },

    async render() {
      this.ensureUi();
      const root = document.getElementById('fiscalParceiroRoot');
      if (!root) return;

      const manageBtn = canManageFechamento()
        ? '<button type="button" class="btn btn-primary" onclick="FiscalParceiro.openSend()">+ Enviar fechamento</button>'
        : '';

      root.innerHTML = `
        <div class="page-header">
          <div class="page-header-text">
            <h2>Fiscal — Parceiro</h2>
            <p>Fechamento do financeiro, dados para emissão de NF (CNPJ/API) e upload da nota fiscal</p>
          </div>
          ${manageBtn}
        </div>
        <div class="card card-padded">
          <div class="table-wrap"><table class="data-table"><thead><tr>
            <th>Período</th><th>Parceiro</th><th>Valor fechamento</th><th>Status</th><th>NF</th><th></th>
          </tr></thead><tbody id="fiscalParceiroTbody"><tr><td colspan="6" class="text-muted text-center">Carregando…</td></tr></tbody></table></div>
        </div>`;
      await this._paintList();
    },

    async _scope() {
      const root = window.PARTNER_ROOT_ID;
      return root ? { partnerRootId: root } : {};
    },

    async _paintList() {
      const tb = document.getElementById('fiscalParceiroTbody');
      if (!tb) return;
      const rows = await DB.getPartnerFiscalRecords(await this._scope());
      if (!rows.length) {
        tb.innerHTML = '<tr><td colspan="6" class="text-muted text-center">Nenhum fechamento fiscal.</td></tr>';
        return;
      }
      tb.innerHTML = rows.map(r => {
        const st = stMeta(r.status);
        const nf = r.nota_fiscal_url
          ? `<a href="${esc(r.nota_fiscal_url)}" target="_blank" rel="noopener">Ver NF</a>`
          : '<span class="text-muted">Pendente</span>';
        let actions = `<button type="button" class="btn btn-ghost btn-sm" onclick="FiscalParceiro.openDetail('${esc(r.id)}')">Detalhes</button>`;
        if (canUploadNf() && r.status !== 'concluido' && !r.nota_fiscal_url) {
          actions += ` <button type="button" class="btn btn-primary btn-sm" onclick="FiscalParceiro.openUpload('${esc(r.id)}')">Upload NF</button>`;
        }
        if (canManageFechamento() && r.status === 'nf_recebida') {
          actions += ` <button type="button" class="btn btn-ghost btn-sm" onclick="FiscalParceiro.markConcluido('${esc(r.id)}')">Concluir</button>`;
        }
        return `<tr>
          <td><strong>${esc(r.periodo || '—')}</strong></td>
          <td>${esc(r.partner_razao || '—')}</td>
          <td><strong style="color:var(--color-success);">${fmtMoney(r.valor_fechamento)}</strong></td>
          <td><span class="badge ${st.cls}">${esc(st.label)}</span></td>
          <td>${nf}</td>
          <td>${actions}</td>
        </tr>`;
      }).join('');
    },

    async openSend() {
      if (!canManageFechamento()) return;
      this.ensureModals();
      const sel = document.getElementById('fscPartnerSelect');
      const partners = await DB.getPartners().catch(() => []);
      const ativos = (partners || []).filter(p => p.active !== false);
      sel.innerHTML = '<option value="">— Selecione o parceiro —</option>' +
        ativos.map(p => `<option value="${esc(p.id)}" data-root="${esc(p.user_id || '')}" data-razao="${esc(p.razao_social || '')}">${esc(p.razao_social || p.email)}</option>`).join('');
      const now = new Date();
      document.getElementById('fscPeriodo').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      document.getElementById('fscValor').value = '';
      document.getElementById('fscObs').value = '';
      openModal('fscSendModal');
    },

    async saveSend() {
      if (!canManageFechamento()) return;
      const partnerId = document.getElementById('fscPartnerSelect')?.value || '';
      const sel = document.getElementById('fscPartnerSelect');
      const opt = sel?.selectedOptions?.[0];
      const partnerRootId = opt?.dataset?.root || '';
      const partnerRazao = opt?.dataset?.razao || '';
      const periodo = document.getElementById('fscPeriodo')?.value.trim() || '';
      const valor = parseFloat(document.getElementById('fscValor')?.value || '0') || 0;
      const observacao = document.getElementById('fscObs')?.value.trim() || '';

      if (!partnerId) { showToast('Selecione o parceiro.', 'warning'); return; }
      if (!periodo) { showToast('Informe o período (AAAA-MM).', 'warning'); return; }
      if (valor <= 0) { showToast('Informe o valor do fechamento.', 'warning'); return; }

      const partner = await DB.getPartner(partnerId).catch(() => null);
      const dados_nf = await buildDadosNf(partner);

      showLoading('Enviando fechamento…');
      try {
        await DB.addPartnerFiscalRecord({
          partner_id: partnerId,
          partner_root_id: partnerRootId || partner?.user_id,
          partner_razao: partnerRazao || partner?.razao_social,
          periodo,
          valor_fechamento: valor,
          observacao,
          dados_nf,
          status: 'aguardando_nf',
          created_by: Auth.getSession()?.id,
        });
        showToast('Fechamento enviado ao parceiro!', 'success');
        closeModal('fscSendModal');
        await this.render();
      } catch (e) {
        showToast('Erro: ' + (e.message || ''), 'error');
      } finally { hideLoading(); }
    },

    async openDetail(id) {
      const row = await DB.getPartnerFiscalRecord(id);
      if (!row) return;
      this.ensureModals();
      document.getElementById('fscDetailTitle').textContent = `Fechamento ${row.periodo || ''} — ${row.partner_razao || ''}`;
      const st = stMeta(row.status);
      const d = row.dados_nf || {};
      let html = `
        <div style="margin-bottom:12px;"><span class="badge ${st.cls}">${esc(st.label)}</span>
          <strong style="margin-left:8px;font-size:18px;color:var(--color-success);">${fmtMoney(row.valor_fechamento)}</strong></div>
        ${row.observacao ? `<p style="font-size:13px;color:var(--color-text-muted);">${esc(row.observacao)}</p>` : ''}`;

      if (canViewDadosNf()) {
        html += `<div class="card card-padded" style="margin-top:12px;background:var(--color-surface-2);">
          <h4 style="font-size:14px;font-weight:800;margin:0 0 10px;">Dados para emissão da NF (CNPJ/API)</h4>
          <div style="font-size:13px;line-height:1.7;">
            <div><strong>CNPJ:</strong> ${esc(d.cnpj || '—')}</div>
            <div><strong>Razão social:</strong> ${esc(d.razao_social || '—')}</div>
            <div><strong>Representante:</strong> ${esc(d.representante_legal || '—')}</div>
            <div><strong>Endereço:</strong> ${esc(d.endereco || '—')}</div>
            <div><strong>E-mail:</strong> ${esc(d.email || '—')}</div>
            <div><strong>Contato:</strong> ${esc(d.contato || '—')}</div>
            <div style="font-size:11px;color:var(--color-text-muted);margin-top:6px;">Fonte: ${esc(d.fonte || '—')}</div>
          </div>
          ${canManageFechamento() ? `<button type="button" class="btn btn-ghost btn-sm" style="margin-top:10px;" onclick="FiscalParceiro.refreshDadosNf('${esc(row.id)}')">Atualizar via API CNPJ</button>` : ''}
        </div>`;
      }

      if (row.nota_fiscal_url) {
        html += `<p style="margin-top:12px;"><a href="${esc(row.nota_fiscal_url)}" target="_blank" rel="noopener">Abrir nota fiscal enviada</a></p>`;
      }

      document.getElementById('fscDetailBody').innerHTML = html;
      openModal('fscDetailModal');
    },

    async refreshDadosNf(id) {
      if (!canManageFechamento()) return;
      const row = await DB.getPartnerFiscalRecord(id);
      if (!row?.partner_id) return;
      const partner = await DB.getPartner(row.partner_id).catch(() => null);
      const dados_nf = await buildDadosNf(partner);
      await DB.updatePartnerFiscalRecord(id, { dados_nf });
      showToast('Dados NF atualizados via API.', 'success');
      await this.openDetail(id);
    },

    openUpload(id) {
      if (!canUploadNf()) return;
      this.ensureModals();
      document.getElementById('fscUploadId').value = id;
      document.getElementById('fscUploadFile').value = '';
      document.getElementById('fscUploadVal').value = '';
      openModal('fscUploadModal');
    },

    async saveUpload() {
      if (!canUploadNf()) return;
      const id = document.getElementById('fscUploadId')?.value;
      const url = document.getElementById('fscUploadVal')?.value;
      if (!id || !url) { showToast('Envie o arquivo da nota fiscal.', 'warning'); return; }
      showLoading('Salvando NF…');
      try {
        await DB.updatePartnerFiscalRecord(id, {
          nota_fiscal_url: url,
          nota_fiscal_enviada_em: new Date().toISOString(),
          status: 'nf_recebida',
        });
        showToast('Nota fiscal enviada!', 'success');
        closeModal('fscUploadModal');
        await this.render();
      } catch (e) {
        showToast('Erro: ' + (e.message || ''), 'error');
      } finally { hideLoading(); }
    },

    async uploadFile(input) {
      const file = input?.files?.[0];
      if (!file) return;
      try {
        const url = await uploadImage(file, 'partner-nf', `nf_${Date.now()}`);
        document.getElementById('fscUploadVal').value = url;
        showToast('Arquivo carregado. Clique em Enviar NF.', 'success');
      } catch (e) {
        showToast('Erro no upload: ' + (e.message || ''), 'error');
      }
    },

    async markConcluido(id) {
      if (!canManageFechamento()) return;
      await DB.updatePartnerFiscalRecord(id, { status: 'concluido' });
      showToast('Fechamento concluído.', 'success');
      await this.render();
    },

    ensureModals() {
      if (document.getElementById('fscSendModal')) return;
      document.body.insertAdjacentHTML('beforeend', `
<div class="modal-overlay" id="fscSendModal"><div class="modal" style="max-width:520px;"><div class="modal-header">
  <h3>Enviar fechamento — Financeiro</h3><button type="button" class="modal-close" onclick="closeModal('fscSendModal')"></button></div>
<div class="modal-body">
  <div class="form-group"><label>Parceiro</label><select id="fscPartnerSelect" class="form-control"></select></div>
  <div class="form-row"><div class="form-group"><label>Período (AAAA-MM)</label><input type="month" id="fscPeriodo" class="form-control"/></div>
  <div class="form-group"><label>Valor fechamento (R$)</label><input type="number" id="fscValor" class="form-control" min="0.01" step="0.01" placeholder="Ex: 15000,00"/></div></div>
  <div class="form-group"><label>Observação</label><textarea id="fscObs" class="form-control" rows="2" placeholder="Opcional"></textarea></div>
  <p style="font-size:12px;color:var(--color-text-muted);margin:0;">Os dados para emissão da NF (CNPJ/API) serão gerados automaticamente do cadastro do parceiro.</p>
</div><div class="modal-footer">
  <button type="button" class="btn btn-ghost" onclick="closeModal('fscSendModal')">Cancelar</button>
  <button type="button" class="btn btn-primary" onclick="FiscalParceiro.saveSend()">Enviar ao parceiro</button>
</div></div></div>

<div class="modal-overlay" id="fscDetailModal"><div class="modal" style="max-width:600px;"><div class="modal-header">
  <h3 id="fscDetailTitle">Fechamento fiscal</h3><button type="button" class="modal-close" onclick="closeModal('fscDetailModal')"></button></div>
<div class="modal-body" id="fscDetailBody" style="max-height:70vh;overflow-y:auto;"></div>
<div class="modal-footer"><button type="button" class="btn btn-ghost" onclick="closeModal('fscDetailModal')">Fechar</button></div></div></div>

<div class="modal-overlay" id="fscUploadModal"><div class="modal" style="max-width:480px;"><div class="modal-header">
  <h3>Upload nota fiscal</h3><button type="button" class="modal-close" onclick="closeModal('fscUploadModal')"></button></div>
<div class="modal-body">
  <input type="hidden" id="fscUploadId"/>
  <div class="form-group"><label>Arquivo da NF (PDF ou imagem)</label>
    <input type="file" id="fscUploadFile" accept=".pdf,.jpg,.jpeg,.png" onchange="FiscalParceiro.uploadFile(this)"/>
    <input type="hidden" id="fscUploadVal"/></div>
</div><div class="modal-footer">
  <button type="button" class="btn btn-ghost" onclick="closeModal('fscUploadModal')">Cancelar</button>
  <button type="button" class="btn btn-primary" onclick="FiscalParceiro.saveUpload()">Enviar NF</button>
</div></div></div>`);
    },

    init() {
      this.ensureUi();
      const cfg = window.__ADMIN_NAV_CFG__;
      if (cfg) this.applyNavVisibility(cfg);
    },
  };

  window.FiscalParceiro = FiscalParceiro;
  document.addEventListener('DOMContentLoaded', () => setTimeout(() => FiscalParceiro.init(), 300));
})();
