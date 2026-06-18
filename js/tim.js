/* SOU + BLU — Indicação TIM + Esteira de propostas TIM */
(function () {
  const STATUSES = [
    { value: 'indicado', label: 'Indicado', cls: 'badge-muted' },
    { value: 'proposta_cadastrada', label: 'Proposta cadastrada', cls: 'badge-info' },
    { value: 'nuvideo_pendente', label: 'Nuvidio pendente', cls: 'badge-warning' },
    { value: 'nuvideo_ok', label: 'Nuvidio OK', cls: 'badge-success' },
    { value: 'documentacao_pendente', label: 'Documentação pendente', cls: 'badge-warning' },
    { value: 'em_analise', label: 'Em análise', cls: 'badge-accent' },
    { value: 'aprovado', label: 'Aprovado', cls: 'badge-success' },
    { value: 'reprovado', label: 'Reprovado', cls: 'badge-danger' },
    { value: 'cancelado', label: 'Cancelado', cls: 'badge-danger' },
  ];

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function fmtCnpj(v) {
    const d = String(v || '').replace(/\D/g, '').slice(0, 14);
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
    if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
    if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }

  function fmtMoney(v) {
    if (v == null || v === '') return '—';
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return '—';
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }

  function statusMeta(st) {
    return STATUSES.find(s => s.value === st) || { label: st || '—', cls: 'badge-muted' };
  }

  function hasPartnerPerm(key) {
    if (typeof window.partnerOrgCan === 'function') return window.partnerOrgCan(key);
    return typeof PartnerPerms !== 'undefined' && PartnerPerms.can(window._PARTNER_PERMS, key);
  }

  function canIndicacao() {
    const s = Auth.getSession();
    if (!s || !window.PARTNER_ROOT_ID) return false;
    return s.role === 'parceiro' || hasPartnerPerm('indicacao_tim');
  }

  function canEsteira() {
    const s = Auth.getSession();
    if (!s || !window.PARTNER_ROOT_ID) return false;
    return hasPartnerPerm('esteira_indicacao_tim') || hasPartnerPerm('indicacao_tim');
  }

  function canEditEsteira() {
    const s = Auth.getSession();
    if (!s || !window.PARTNER_ROOT_ID) return false;
    return s.role === 'parceiro' || hasPartnerPerm('esteira_indicacao_tim');
  }

  async function scopeFilter() {
    const s = Auth.getSession();
    const root = window.PARTNER_ROOT_ID;
    if (root) return { partnerRootId: root };
    if (s?.role === 'vendedor' || s?.role === 'employee') return { vendorId: s.id };
    return {};
  }

  const Tim = {
    ensureUi() {
      const nav = document.querySelector('.sidebar-nav');
      const main = document.querySelector('.page-content');
      if (!nav || !main) return;

      if (!document.getElementById('navTimIndicacao') && canIndicacao()) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-item tim-indicacao-nav';
        btn.id = 'navTimIndicacao';
        btn.dataset.section = 'secTimIndicacao';
        btn.innerHTML = `${navIconHtml('send')}<span class="nav-label">Indicação TIM</span>`;
        const anchor = nav.querySelector('#navManageProposals') || nav.querySelector('[data-section="secClients"]');
        if (anchor?.parentNode) anchor.parentNode.insertBefore(btn, anchor.nextSibling);
        else nav.appendChild(btn);
      }

      if (!document.getElementById('navTimEsteira') && canEsteira()) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-item tim-esteira-nav';
        btn.id = 'navTimEsteira';
        btn.dataset.section = 'secTimEsteira';
        btn.innerHTML = `${navIconHtml('list')}<span class="nav-label">Esteira TIM</span>`;
        const ind = document.getElementById('navTimIndicacao');
        if (ind?.nextSibling) ind.parentNode.insertBefore(btn, ind.nextSibling);
        else nav.appendChild(btn);
      }

      if (!document.getElementById('secTimIndicacao')) {
        const sec = document.createElement('section');
        sec.className = 'section';
        sec.id = 'secTimIndicacao';
        sec.innerHTML = '<div id="timIndicacaoRoot"></div>';
        main.appendChild(sec);
      }
      if (!document.getElementById('secTimEsteira')) {
        const sec = document.createElement('section');
        sec.className = 'section';
        sec.id = 'secTimEsteira';
        sec.innerHTML = '<div id="timEsteiraRoot"></div>';
        main.appendChild(sec);
      }
      this.ensureModals();
    },

    applyNavVisibility(cfg) {
      const showInd = cfg?.canTimIndicacao !== false && canIndicacao();
      const showEst = cfg?.canTimEsteira !== false && canEsteira();
      document.querySelectorAll('.tim-indicacao-nav').forEach(el => { el.style.display = showInd ? '' : 'none'; });
      document.querySelectorAll('.tim-esteira-nav').forEach(el => { el.style.display = showEst ? '' : 'none'; });
    },

    async renderIndicacao() {
      this.ensureUi();
      const root = document.getElementById('timIndicacaoRoot');
      if (!root) return;
      const s = Auth.getSession();
      root.innerHTML = `
        <div class="page-header">
          <div class="page-header-text">
            <h2>Indicação TIM</h2>
            <p>Cadastre indicações e propostas TIM com consulta automática de CNPJ</p>
          </div>
          <button type="button" class="btn btn-primary" onclick="Tim.openForm()">+ Nova indicação</button>
        </div>
        <div class="card card-padded">
          <div class="table-wrap"><table class="data-table"><thead><tr>
            <th>CNPJ / Cliente</th><th>Contato</th><th>E-mail</th><th>Pedido P2B</th><th>Receita</th><th>Status</th><th></th>
          </tr></thead><tbody id="timIndicacaoTbody"><tr><td colspan="7" class="text-muted text-center">Carregando…</td></tr></tbody></table></div>
        </div>`;
      await this._paintIndicacaoList();
    },

    async _paintIndicacaoList() {
      const tb = document.getElementById('timIndicacaoTbody');
      if (!tb) return;
      const rows = await DB.getTimReferrals(await scopeFilter());
      if (!rows.length) {
        tb.innerHTML = '<tr><td colspan="7" class="text-muted text-center">Nenhuma indicação cadastrada.</td></tr>';
        return;
      }
      tb.innerHTML = rows.map(r => {
        const st = statusMeta(r.status);
        return `<tr>
          <td><strong>${esc(r.razao_social || '—')}</strong><div style="font-size:11px;color:var(--color-text-muted);">${esc(fmtCnpj(r.cnpj))}</div></td>
          <td>${esc(r.contato || '—')}</td>
          <td>${esc(r.email || '—')}</td>
          <td>${esc(r.numero_pedido_p2b || '—')}</td>
          <td>${fmtMoney(r.valor_receita)}</td>
          <td><span class="badge ${st.cls}">${esc(st.label)}</span></td>
          <td><button type="button" class="btn btn-ghost btn-sm" onclick="Tim.openForm('${esc(r.id)}')">Editar</button></td>
        </tr>`;
      }).join('');
    },

    async renderEsteira() {
      this.ensureUi();
      const root = document.getElementById('timEsteiraRoot');
      if (!root) return;
      const editable = canEditEsteira();
      root.innerHTML = `
        <div class="page-header">
          <div class="page-header-text">
            <h2>Esteira de indicação TIM</h2>
            <p>Clientes indicados e status da indicação — Nuvidio e documentação</p>
          </div>
        </div>
        <div class="card card-padded">
          <div class="table-wrap"><table class="data-table"><thead><tr>
            <th>Cliente</th><th>Vendedor / Parceiro</th><th>Status</th><th>Nuvidio</th><th>Contrato social</th><th>Doc. sócios</th>${editable ? '<th>Ações</th>' : ''}
          </tr></thead><tbody id="timEsteiraTbody"><tr><td colspan="7" class="text-muted text-center">Carregando…</td></tr></tbody></table></div>
        </div>`;
      await this._paintEsteiraList();
    },

    async _paintEsteiraList() {
      const tb = document.getElementById('timEsteiraTbody');
      if (!tb) return;
      const editable = canEditEsteira();
      const rows = await DB.getTimReferrals(await scopeFilter());
      if (!rows.length) {
        tb.innerHTML = `<tr><td colspan="${editable ? 7 : 6}" class="text-muted text-center">Nenhum registro na esteira.</td></tr>`;
        return;
      }
      tb.innerHTML = rows.map(r => {
        const st = statusMeta(r.status);
        const att = r.attachments || {};
        const docLink = (url, label) => url
          ? `<a href="${esc(url)}" target="_blank" rel="noopener">${label}</a>`
          : '<span class="text-muted">—</span>';
        const actions = editable
          ? `<button type="button" class="btn btn-ghost btn-sm" onclick="Tim.openEsteira('${esc(r.id)}')">Gerenciar</button>`
          : '';
        return `<tr>
          <td><strong>${esc(r.razao_social || '—')}</strong><div style="font-size:11px;color:var(--color-text-muted);">${esc(fmtCnpj(r.cnpj))}</div></td>
          <td>${esc(r.vendor_name || '—')}</td>
          <td><span class="badge ${st.cls}">${esc(st.label)}</span></td>
          <td>${r.nuvideo_ok ? '<span class="badge badge-success">OK</span>' : '<span class="badge badge-warning">Pendente</span>'}</td>
          <td>${docLink(att.contrato_social, 'Ver')}</td>
          <td>${docLink(att.documento_socios, 'Ver')}</td>
          ${editable ? `<td>${actions}</td>` : ''}
        </tr>`;
      }).join('');
    },

    async openForm(id) {
      this.ensureModals();
      const isEdit = !!id;
      let row = null;
      if (isEdit) row = await DB.getTimReferral(id);
      const s = Auth.getSession();
      const me = await Auth.getCurrentUser().catch(() => null);
      document.getElementById('timFormId').value = row?.id || '';
      document.getElementById('timFormTitle').textContent = isEdit ? 'Editar indicação TIM' : 'Nova indicação TIM';
      document.getElementById('timCnpj').value = row?.cnpj ? fmtCnpj(row.cnpj) : '';
      document.getElementById('timRazao').value = row?.razao_social || '';
      document.getElementById('timContato').value = row?.contato || '';
      document.getElementById('timEmail').value = row?.email || '';
      document.getElementById('timPedidoP2b').value = row?.numero_pedido_p2b || '';
      document.getElementById('timValorReceita').value = row?.valor_receita ?? '';
      document.getElementById('timVendorName').value = row?.vendor_name || me?.name || s?.name || '';
      document.getElementById('timCnpjStatus').textContent = '';
      openModal('timFormModal');
    },

    async lookupCnpj() {
      const el = document.getElementById('timCnpj');
      const status = document.getElementById('timCnpjStatus');
      if (!el || typeof FonteData === 'undefined') return;
      const cnpj = el.value.replace(/\D/g, '');
      if (cnpj.length !== 14) {
        if (status) status.textContent = 'Informe o CNPJ completo.';
        return;
      }
      if (status) status.textContent = 'Consultando CNPJ…';
      const res = await FonteData.lookupCnpj(cnpj);
      if (!res.ok) {
        if (status) status.textContent = res.error || 'Erro na consulta';
        return;
      }
      const p = res.partner || {};
      if (p.razao_social) document.getElementById('timRazao').value = p.razao_social;
      if (p.contato) document.getElementById('timContato').value = p.contato;
      if (p.email) document.getElementById('timEmail').value = p.email;
      if (status) status.textContent = 'Dados preenchidos via API CNPJ.';
    },

    _wireCnpjInput() {
      const el = document.getElementById('timCnpj');
      if (!el || el.dataset.wired) return;
      el.dataset.wired = '1';
      let debounce;
      el.addEventListener('input', () => {
        const d = el.value.replace(/\D/g, '');
        el.value = fmtCnpj(d);
        clearTimeout(debounce);
        if (d.length === 14) debounce = setTimeout(() => this.lookupCnpj(), 450);
      });
      el.addEventListener('blur', () => this.lookupCnpj());
    },

    async saveForm() {
      const id = document.getElementById('timFormId')?.value || '';
      const cnpj = document.getElementById('timCnpj')?.value.replace(/\D/g, '') || '';
      const razao = document.getElementById('timRazao')?.value.trim() || '';
      const contato = document.getElementById('timContato')?.value.trim() || '';
      const email = document.getElementById('timEmail')?.value.trim().toLowerCase() || '';
      const pedido = document.getElementById('timPedidoP2b')?.value.trim() || '';
      const valor = parseFloat(document.getElementById('timValorReceita')?.value || '0') || 0;
      const vendorName = document.getElementById('timVendorName')?.value.trim() || '';

      if (!cnpj || cnpj.length !== 14) { showToast('CNPJ inválido.', 'warning'); return; }
      if (!razao) { showToast('Razão social obrigatória.', 'warning'); return; }

      const s = Auth.getSession();
      const me = await Auth.getCurrentUser().catch(() => null);
      const status = pedido ? 'proposta_cadastrada' : 'indicado';
      const payload = {
        cnpj, razao_social: razao, contato, email,
        numero_pedido_p2b: pedido || null,
        valor_receita: valor || null,
        vendor_id: me?.id || s?.id,
        vendor_name: vendorName || me?.name || s?.name,
        partner_root_id: window.PARTNER_ROOT_ID || null,
        status,
        created_by: s?.id,
      };

      showLoading('Salvando…');
      try {
        if (id) await DB.updateTimReferral(id, payload);
        else await DB.addTimReferral(payload);
        showToast('Indicação TIM salva!', 'success');
        closeModal('timFormModal');
        await Promise.all([this.renderIndicacao(), this.renderEsteira()]);
      } catch (e) {
        showToast('Erro: ' + (e.message || ''), 'error');
      } finally { hideLoading(); }
    },

    async openEsteira(id) {
      if (!canEditEsteira()) return;
      const row = await DB.getTimReferral(id);
      if (!row) { showToast('Registro não encontrado.', 'error'); return; }
      this.ensureModals();
      document.getElementById('timEsteiraId').value = row.id;
      document.getElementById('timEsteiraCliente').textContent = `${row.razao_social || '—'} (${fmtCnpj(row.cnpj)})`;
      document.getElementById('timEsteiraStatus').value = row.status || 'indicado';
      document.getElementById('timEsteiraNuvideo').checked = !!row.nuvideo_ok;
      document.getElementById('timEsteiraNotes').value = row.notes || '';
      const att = row.attachments || {};
      document.getElementById('timDocContratoVal').value = att.contrato_social || '';
      document.getElementById('timDocSociosVal').value = att.documento_socios || '';
      document.getElementById('timDocContratoLbl').innerHTML = att.contrato_social
        ? `<a href="${esc(att.contrato_social)}" target="_blank" rel="noopener">Ver anexo</a>` : '<span class="text-muted">Nenhum</span>';
      document.getElementById('timDocSociosLbl').innerHTML = att.documento_socios
        ? `<a href="${esc(att.documento_socios)}" target="_blank" rel="noopener">Ver anexo</a>` : '<span class="text-muted">Nenhum</span>';
      openModal('timEsteiraModal');
    },

    async uploadDoc(input, key) {
      const file = input?.files?.[0];
      if (!file) return;
      const lbl = document.getElementById(key === 'contrato_social' ? 'timDocContratoLbl' : 'timDocSociosLbl');
      if (lbl) lbl.textContent = 'Enviando…';
      try {
        const url = await uploadImage(file, 'tim-docs', `${key}_${Date.now()}`);
        const hid = document.getElementById(key === 'contrato_social' ? 'timDocContratoVal' : 'timDocSociosVal');
        if (hid) hid.value = url;
        if (lbl) lbl.innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(file.name)}</a>`;
        showToast('Anexo enviado.', 'success');
      } catch (e) {
        if (lbl) lbl.textContent = 'Falha no upload';
        showToast('Erro ao enviar: ' + (e.message || ''), 'error');
      }
    },

    async saveEsteira() {
      if (!canEditEsteira()) return;
      const id = document.getElementById('timEsteiraId')?.value;
      if (!id) return;
      const status = document.getElementById('timEsteiraStatus')?.value || 'indicado';
      const nuvideo_ok = !!document.getElementById('timEsteiraNuvideo')?.checked;
      const notes = document.getElementById('timEsteiraNotes')?.value.trim() || '';
      const attachments = {
        contrato_social: document.getElementById('timDocContratoVal')?.value || '',
        documento_socios: document.getElementById('timDocSociosVal')?.value || '',
      };
      showLoading('Salvando…');
      try {
        await DB.updateTimReferral(id, { status, nuvideo_ok, notes, attachments });
        showToast('Esteira atualizada!', 'success');
        closeModal('timEsteiraModal');
        await this.renderEsteira();
        await this._paintIndicacaoList();
      } catch (e) {
        showToast('Erro: ' + (e.message || ''), 'error');
      } finally { hideLoading(); }
    },

    ensureModals() {
      if (document.getElementById('timFormModal')) return;
      document.body.insertAdjacentHTML('beforeend', `
<div class="modal-overlay" id="timFormModal"><div class="modal" style="max-width:640px;"><div class="modal-header">
  <h3 id="timFormTitle">Indicação TIM</h3><button type="button" class="modal-close" onclick="closeModal('timFormModal')"></button></div>
<div class="modal-body" style="max-height:70vh;overflow-y:auto;">
  <input type="hidden" id="timFormId"/>
  <div class="form-row"><div class="form-group"><label>CNPJ (cliente)</label>
    <input type="text" id="timCnpj" class="form-control" placeholder="00.000.000/0001-00" maxlength="18"/>
    <small id="timCnpjStatus" style="font-size:12px;color:var(--color-text-muted);"></small>
    <button type="button" class="btn btn-ghost btn-sm" style="margin-top:6px;" onclick="Tim.lookupCnpj()">Buscar API CNPJ</button>
  </div><div class="form-group"><label>Razão social</label><input type="text" id="timRazao" class="form-control"/></div></div>
  <div class="form-row"><div class="form-group"><label>Contato</label><input type="text" id="timContato" class="form-control"/></div>
  <div class="form-group"><label>E-mail</label><input type="email" id="timEmail" class="form-control"/></div></div>
  <hr style="margin:16px 0;border:none;border-top:1px solid var(--color-border);"/>
  <p style="font-size:12px;font-weight:700;margin:0 0 10px;">Cadastro proposta TIM</p>
  <div class="form-row"><div class="form-group"><label>Vendedor / Parceiro</label><input type="text" id="timVendorName" class="form-control"/></div>
  <div class="form-group"><label>Nº pedido P2B</label><input type="text" id="timPedidoP2b" class="form-control"/></div></div>
  <div class="form-group"><label>Valor da receita (R$)</label><input type="number" id="timValorReceita" class="form-control" min="0" step="0.01"/></div>
</div><div class="modal-footer">
  <button type="button" class="btn btn-ghost" onclick="closeModal('timFormModal')">Cancelar</button>
  <button type="button" class="btn btn-primary" onclick="Tim.saveForm()">Salvar</button>
</div></div></div>

<div class="modal-overlay" id="timEsteiraModal"><div class="modal" style="max-width:600px;"><div class="modal-header">
  <h3>Gerenciar esteira TIM</h3><button type="button" class="modal-close" onclick="closeModal('timEsteiraModal')"></button></div>
<div class="modal-body" style="max-height:70vh;overflow-y:auto;">
  <input type="hidden" id="timEsteiraId"/>
  <p style="font-size:14px;margin:0 0 12px;"><strong>Cliente:</strong> <span id="timEsteiraCliente"></span></p>
  <div class="form-group"><label>Status indicação</label>
    <select id="timEsteiraStatus" class="form-control">${STATUSES.map(s => `<option value="${s.value}">${s.label}</option>`).join('')}</select></div>
  <div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
    <input type="checkbox" id="timEsteiraNuvideo"/> Nuvidio concluído</label></div>
  <div class="form-group"><label>Anexo contrato social</label>
    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onchange="Tim.uploadDoc(this,'contrato_social')"/>
    <div id="timDocContratoLbl" style="font-size:12px;margin-top:4px;"></div>
    <input type="hidden" id="timDocContratoVal"/></div>
  <div class="form-group"><label>Anexo documento sócios</label>
    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onchange="Tim.uploadDoc(this,'documento_socios')"/>
    <div id="timDocSociosLbl" style="font-size:12px;margin-top:4px;"></div>
    <input type="hidden" id="timDocSociosVal"/></div>
  <div class="form-group"><label>Observações</label><textarea id="timEsteiraNotes" class="form-control" rows="3"></textarea></div>
</div><div class="modal-footer">
  <button type="button" class="btn btn-ghost" onclick="closeModal('timEsteiraModal')">Cancelar</button>
  <button type="button" class="btn btn-primary" onclick="Tim.saveEsteira()">Salvar</button>
</div></div></div>`);
      this._wireCnpjInput();
    },

    init() {
      this.ensureUi();
      const cfg = window.__ADMIN_NAV_CFG__;
      if (cfg) this.applyNavVisibility(cfg);
    },
  };

  window.Tim = Tim;

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => Tim.init(), 200);
  });
})();
