/* SOU + BLU — Contestação (abrir, notificar parceiro, responder, interagir) */
(function () {
  const MOTIVOS = [
    { value: 'acao_judicial', label: 'Ação judicial' },
    { value: 'desconhece_operacao', label: 'Desconhece operação' },
    { value: 'fraude', label: 'Fraude' },
    { value: 'cancelamento', label: 'Cancelamento' },
  ];

  const STATUS = [
    { value: 'aguardando_resposta', label: 'Aguardando parceiro', cls: 'badge-warning' },
    { value: 'respondida', label: 'Respondida', cls: 'badge-info' },
    { value: 'em_analise', label: 'Em análise', cls: 'badge-accent' },
    { value: 'encerrada_procedente', label: 'Procedente', cls: 'badge-danger' },
    { value: 'encerrada_improcedente', label: 'Improcedente', cls: 'badge-success' },
    { value: 'em_aberto', label: 'Em aberto', cls: 'badge-muted' },
  ];

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function hasPartnerPerm(key) {
    if (typeof window.partnerOrgCan === 'function') return window.partnerOrgCan(key);
    return typeof PartnerPerms !== 'undefined' && PartnerPerms.can(window._PARTNER_PERMS, key);
  }

  function canOpen() {
    const s = Auth.getSession();
    if (!s) return false;
    if (!window.PARTNER_ROOT_ID) {
      return ['master', 'fundador', 'gerente', 'backoffice', 'operacional', 'sup_backoffice', 'supervisor'].includes(s.role);
    }
    return false;
  }

  function canManage() {
    const s = Auth.getSession();
    if (!s) return false;
    if (!window.PARTNER_ROOT_ID) {
      return ['master', 'fundador', 'gerente', 'backoffice', 'operacional', 'sup_backoffice'].includes(s.role);
    }
    return false;
  }

  function canRespond() {
    const s = Auth.getSession();
    if (!s || !window.PARTNER_ROOT_ID) return false;
    return s.role === 'parceiro' || hasPartnerPerm('contestacao');
  }

  function stMeta(v) {
    return STATUS.find(x => x.value === v) || { label: v || '—', cls: 'badge-muted' };
  }

  function motivoLabel(v) {
    return MOTIVOS.find(m => m.value === v)?.label || v || '—';
  }

  async function scopeFilter() {
    const root = window.PARTNER_ROOT_ID;
    if (root) return { partnerRootId: root };
    return {};
  }

  async function applyPartnerBlock(partnerRootId) {
    if (!partnerRootId) return;
    const prt = await DB.getPartnerByUserId(partnerRootId).catch(() => null);
    if (!prt) return;
    const meta = { ...(prt.meta || {}) };
    const modo = meta.contestacao_modo || 'sim_48h';
    if (modo === 'sim_48h') {
      meta.contestacao_bloqueado_ate = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    } else {
      meta.contestacao_count = (parseInt(meta.contestacao_count, 10) || 0) + 1;
      if (meta.contestacao_count >= 3) {
        meta.contestacao_bloqueado = true;
      }
    }
    await DB.savePartner({ ...prt, meta });
  }

  const Contestacao = {
    ensureUi() {
      const nav = document.querySelector('.sidebar-nav');
      const main = document.querySelector('.page-content');
      if (!nav || !main) return;

      if (!document.getElementById('navContestacao') && canRespond()) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-item contestacao-nav';
        btn.id = 'navContestacao';
        btn.dataset.section = 'secContestacao';
        btn.innerHTML = `${navIconHtml('scale')}<span class="nav-label">Contestação</span>`;
        const anchor = document.getElementById('navTimEsteira') || document.getElementById('navManageProposals');
        if (anchor?.nextSibling) anchor.parentNode.insertBefore(btn, anchor.nextSibling);
        else nav.appendChild(btn);
      }

      if (!document.getElementById('secContestacao')) {
        const sec = document.createElement('section');
        sec.className = 'section';
        sec.id = 'secContestacao';
        sec.innerHTML = '<div id="contestacaoRoot"></div>';
        main.appendChild(sec);
      }
      this.ensureModals();
    },

    applyNavVisibility(cfg) {
      const show = cfg?.canContestacao !== false && canRespond();
      document.querySelectorAll('.contestacao-nav').forEach(el => { el.style.display = show ? '' : 'none'; });
    },

    async render() {
      this.ensureUi();
      const root = document.getElementById('contestacaoRoot');
      if (!root) return;
      const openBtn = canOpen()
        ? '<button type="button" class="btn btn-primary" onclick="Contestacao.openNew()">+ Abrir contestação</button>'
        : '';
      root.innerHTML = `
        <div class="page-header">
          <div class="page-header-text">
            <h2>Contestação</h2>
            <p>${canRespond() ? 'Responda contestações da sua organização' : 'Gestão de contestações e notificação ao parceiro'}</p>
          </div>
          ${openBtn}
        </div>
        <div class="card card-padded">
          <div class="table-wrap"><table class="data-table"><thead><tr>
            <th>Protocolo</th><th>Cliente</th><th>Proposta</th><th>Motivo</th><th>Status</th><th></th>
          </tr></thead><tbody id="contestacaoTbody"><tr><td colspan="6" class="text-muted text-center">Carregando…</td></tr></tbody></table></div>
        </div>`;
      await this._paintList();
    },

    async _paintList() {
      const tb = document.getElementById('contestacaoTbody');
      if (!tb) return;
      const rows = await DB.getContestations(await scopeFilter());
      if (!rows.length) {
        tb.innerHTML = '<tr><td colspan="6" class="text-muted text-center">Nenhuma contestação.</td></tr>';
        return;
      }
      tb.innerHTML = rows.map(r => {
        const st = stMeta(r.status);
        let actions = '';
        if (canManage() && r.status !== 'encerrada_procedente' && r.status !== 'encerrada_improcedente') {
          actions += `<button type="button" class="btn btn-ghost btn-sm" onclick="Contestacao.openReview('${esc(r.id)}')">Interagir</button> `;
        }
        if (canRespond() && ['aguardando_resposta', 'em_aberto'].includes(r.status)) {
          actions += `<button type="button" class="btn btn-primary btn-sm" onclick="Contestacao.openRespond('${esc(r.id)}')">Responder</button>`;
        }
        return `<tr>
          <td><strong>${esc(r.protocolo)}</strong></td>
          <td>${esc(r.client_name || '—')}<div style="font-size:11px;color:var(--color-text-muted);">${esc(r.client_doc || '')}</div></td>
          <td>${esc(r.proposal_numero || r.proposal_id || '—')}</td>
          <td>${esc(motivoLabel(r.motivo))}</td>
          <td><span class="badge ${st.cls}">${esc(st.label)}</span></td>
          <td>${actions || '—'}</td>
        </tr>`;
      }).join('');
    },

    openNew() {
      if (!canOpen()) return;
      this.ensureModals();
      document.getElementById('ctNewId').value = '';
      document.getElementById('ctClientDoc').value = '';
      document.getElementById('ctClientName').value = '';
      document.getElementById('ctProposalNum').value = '';
      document.getElementById('ctProposalId').value = '';
      document.getElementById('ctMotivo').value = 'desconhece_operacao';
      document.getElementById('ctDescricao').value = '';
      document.getElementById('ctVendorName').value = '';
      document.getElementById('ctVendorId').value = '';
      document.getElementById('ctProtocoloPreview').textContent = `CT-${Date.now().toString(36).toUpperCase()}`;
      openModal('ctNewModal');
    },

    async lookupClient() {
      const doc = document.getElementById('ctClientDoc')?.value.replace(/\D/g, '') || '';
      if (doc.length !== 11 && doc.length !== 14) { showToast('Informe CPF (11) ou CNPJ (14).', 'warning'); return; }
      let client = null;
      if (doc.length === 11 && typeof DB.getClientByCpf === 'function') {
        client = await DB.getClientByCpf(doc);
      }
      if (client) {
        document.getElementById('ctClientName').value = client.name || '';
        showToast('Cliente encontrado.', 'success');
        return;
      }
      showToast('Cliente não encontrado na base.', 'warning');
    },

    async lookupProposal() {
      const num = document.getElementById('ctProposalNum')?.value.trim() || '';
      if (!num) { showToast('Informe o número da proposta.', 'warning'); return; }
      const rows = await DB.listProposals().catch(() => []);
      const p = (rows || []).find(x => String(x.numero || x.id) === num);
      if (!p) { showToast('Proposta não encontrada.', 'warning'); return; }
      document.getElementById('ctProposalId').value = p.id || '';
      document.getElementById('ctClientDoc').value = p.clientCpf || p.client_cpf || '';
      document.getElementById('ctClientName').value = p.clientName || p.client_name || '';
      document.getElementById('ctVendorId').value = p.vendorId || p.vendor_id || '';
      document.getElementById('ctVendorName').value = p.vendorName || p.vendor_name || '';
      showToast('Proposta vinculada.', 'success');
    },

    async saveNew() {
      if (!canOpen()) return;
      const clientDoc = document.getElementById('ctClientDoc')?.value.replace(/\D/g, '') || '';
      const clientName = document.getElementById('ctClientName')?.value.trim() || '';
      const proposalNum = document.getElementById('ctProposalNum')?.value.trim() || '';
      const proposalId = document.getElementById('ctProposalId')?.value.trim() || '';
      const motivo = document.getElementById('ctMotivo')?.value || '';
      const descricao = document.getElementById('ctDescricao')?.value.trim() || '';
      const vendorId = document.getElementById('ctVendorId')?.value.trim() || '';
      const vendorName = document.getElementById('ctVendorName')?.value.trim() || '';
      const protocolo = document.getElementById('ctProtocoloPreview')?.textContent.trim() || '';

      if (!clientDoc) { showToast('Informe CPF/CNPJ do cliente.', 'warning'); return; }
      if (!descricao) { showToast('Descrição obrigatória.', 'warning'); return; }

      let partnerRootId = null;
      if (vendorId) {
        partnerRootId = await DB.getPartnerRootForUser(vendorId).catch(() => null);
      }

      showLoading('Abrindo contestação…');
      try {
        const row = await DB.addContestation({
          protocolo,
          client_doc: clientDoc,
          client_name: clientName,
          proposal_id: proposalId || null,
          proposal_numero: proposalNum || null,
          motivo,
          descricao,
          vendor_id: vendorId || null,
          vendor_name: vendorName || null,
          partner_root_id: partnerRootId,
          created_by: Auth.getSession()?.id,
          status: 'aguardando_resposta',
        });
        if (partnerRootId) await applyPartnerBlock(partnerRootId);
        showToast(`Contestação aberta — protocolo ${row.protocolo}. Parceiro notificado.`, 'success', 8000);
        closeModal('ctNewModal');
        await this.render();
      } catch (e) {
        showToast('Erro: ' + (e.message || ''), 'error');
      } finally { hideLoading(); }
    },

    async openRespond(id) {
      if (!canRespond()) return;
      const row = await DB.getContestation(id);
      if (!row) return;
      this.ensureModals();
      document.getElementById('ctRespId').value = row.id;
      document.getElementById('ctRespInfo').innerHTML = `<strong>${esc(row.protocolo)}</strong> — ${esc(motivoLabel(row.motivo))}<br>${esc(row.descricao || '')}`;
      const pr = row.partner_response || {};
      document.getElementById('ctRespNegociacao').value = pr.como_negociacao || '';
      document.getElementById('ctRespEscritorio').value = pr.cliente_resolve_escritorio || '';
      document.getElementById('ctRespProspeccao').value = pr.onde_prospeccao || '';
      document.getElementById('ctRespRespVenda').value = pr.responsavel_venda || '';
      document.getElementById('ctRespRespIndic').value = pr.responsavel_indicacao || '';
      document.getElementById('ctRespEvidencias').value = pr.possui_evidencias || 'nao';
      document.getElementById('ctRespEvidVal').value = row.attachments?.evidencias || '';
      document.getElementById('ctRespTermoVal').value = row.attachments?.termo_ciencia || '';
      openModal('ctRespondModal');
    },

    async uploadResp(input, key) {
      const file = input?.files?.[0];
      if (!file) return;
      try {
        const url = await uploadImage(file, 'contestacao-docs', `${key}_${Date.now()}`);
        const hid = document.getElementById(key === 'evidencias' ? 'ctRespEvidVal' : 'ctRespTermoVal');
        if (hid) hid.value = url;
        showToast('Anexo enviado.', 'success');
      } catch (e) {
        showToast('Erro no upload: ' + (e.message || ''), 'error');
      }
    },

    async saveRespond() {
      if (!canRespond()) return;
      const id = document.getElementById('ctRespId')?.value;
      if (!id) return;
      const partner_response = {
        como_negociacao: document.getElementById('ctRespNegociacao')?.value.trim() || '',
        cliente_resolve_escritorio: document.getElementById('ctRespEscritorio')?.value.trim() || '',
        onde_prospeccao: document.getElementById('ctRespProspeccao')?.value.trim() || '',
        responsavel_venda: document.getElementById('ctRespRespVenda')?.value.trim() || '',
        responsavel_indicacao: document.getElementById('ctRespRespIndic')?.value.trim() || '',
        possui_evidencias: document.getElementById('ctRespEvidencias')?.value || 'nao',
        respondido_em: new Date().toISOString(),
      };
      const attachments = {
        evidencias: document.getElementById('ctRespEvidVal')?.value || '',
        termo_ciencia: document.getElementById('ctRespTermoVal')?.value || '',
      };
      showLoading('Enviando resposta…');
      try {
        await DB.updateContestation(id, { partner_response, attachments, status: 'respondida' });
        showToast('Resposta enviada!', 'success');
        closeModal('ctRespondModal');
        await this.render();
      } catch (e) {
        showToast('Erro: ' + (e.message || ''), 'error');
      } finally { hideLoading(); }
    },

    async openReview(id) {
      if (!canManage()) return;
      const row = await DB.getContestation(id);
      if (!row) return;
      this.ensureModals();
      document.getElementById('ctRevId').value = row.id;
      document.getElementById('ctRevInfo').innerHTML = `<strong>${esc(row.protocolo)}</strong> — ${esc(row.client_name || '')}`;
      const ar = row.admin_review || {};
      document.getElementById('ctRevEvid').value = ar.evidencias_aceitas || 'nao';
      document.getElementById('ctRevTermo').value = ar.termo_assinado || 'nao';
      document.getElementById('ctRevEncerrado').value = ar.encerrado || 'nao';
      document.getElementById('ctRevProcedente').value = ar.procedente || 'em_aberto';
      openModal('ctReviewModal');
    },

    async saveReview() {
      if (!canManage()) return;
      const id = document.getElementById('ctRevId')?.value;
      if (!id) return;
      const admin_review = {
        evidencias_aceitas: document.getElementById('ctRevEvid')?.value || 'nao',
        termo_assinado: document.getElementById('ctRevTermo')?.value || 'nao',
        encerrado: document.getElementById('ctRevEncerrado')?.value || 'nao',
        procedente: document.getElementById('ctRevProcedente')?.value || 'em_aberto',
        revisado_em: new Date().toISOString(),
      };
      let status = 'em_analise';
      if (admin_review.encerrado === 'sim') {
        if (admin_review.procedente === 'sim') status = 'encerrada_procedente';
        else if (admin_review.procedente === 'nao') status = 'encerrada_improcedente';
        else status = 'em_aberto';
      } else if (admin_review.procedente === 'em_aberto') {
        status = 'em_aberto';
      }
      showLoading('Salvando…');
      try {
        await DB.updateContestation(id, { admin_review, status });
        showToast('Contestação atualizada.', 'success');
        closeModal('ctReviewModal');
        await this.render();
      } catch (e) {
        showToast('Erro: ' + (e.message || ''), 'error');
      } finally { hideLoading(); }
    },

    ensureModals() {
      if (document.getElementById('ctNewModal')) return;
      const motivoOpts = MOTIVOS.map(m => `<option value="${m.value}">${m.label}</option>`).join('');
      document.body.insertAdjacentHTML('beforeend', `
<div class="modal-overlay" id="ctNewModal"><div class="modal" style="max-width:640px;"><div class="modal-header">
  <h3>Abrir contestação</h3><button type="button" class="modal-close" onclick="closeModal('ctNewModal')"></button></div>
<div class="modal-body" style="max-height:70vh;overflow-y:auto;">
  <input type="hidden" id="ctNewId"/>
  <div class="form-row"><div class="form-group"><label>CPF / CNPJ cliente</label>
    <input type="text" id="ctClientDoc" class="form-control"/>
    <button type="button" class="btn btn-ghost btn-sm" style="margin-top:6px;" onclick="Contestacao.lookupClient()">Buscar base cliente</button>
  </div><div class="form-group"><label>Nome cliente</label><input type="text" id="ctClientName" class="form-control"/></div></div>
  <div class="form-row"><div class="form-group"><label>Nº proposta</label>
    <input type="text" id="ctProposalNum" class="form-control"/>
    <button type="button" class="btn btn-ghost btn-sm" style="margin-top:6px;" onclick="Contestacao.lookupProposal()">Buscar vendedor</button>
  </div><div class="form-group"><label>Protocolo (automático)</label><div id="ctProtocoloPreview" class="form-control" style="background:var(--color-surface-2);"></div></div></div>
  <input type="hidden" id="ctProposalId"/><input type="hidden" id="ctVendorId"/>
  <div class="form-group"><label>Vendedor</label><input type="text" id="ctVendorName" class="form-control" readonly/></div>
  <div class="form-group"><label>Motivo (notifica parceiro)</label><select id="ctMotivo" class="form-control">${motivoOpts}</select></div>
  <div class="form-group"><label>Descrição</label><textarea id="ctDescricao" class="form-control" rows="3"></textarea></div>
</div><div class="modal-footer">
  <button type="button" class="btn btn-ghost" onclick="closeModal('ctNewModal')">Cancelar</button>
  <button type="button" class="btn btn-primary" onclick="Contestacao.saveNew()">Abrir e notificar</button>
</div></div></div>

<div class="modal-overlay" id="ctRespondModal"><div class="modal" style="max-width:680px;"><div class="modal-header">
  <h3>Responder contestação</h3><button type="button" class="modal-close" onclick="closeModal('ctRespondModal')"></button></div>
<div class="modal-body" style="max-height:70vh;overflow-y:auto;">
  <input type="hidden" id="ctRespId"/>
  <div class="card card-padded" style="margin-bottom:12px;background:var(--color-surface-2);font-size:13px;" id="ctRespInfo"></div>
  <div class="form-group"><label>Como foi feita a negociação?</label><textarea id="ctRespNegociacao" class="form-control" rows="2"></textarea></div>
  <div class="form-group"><label>O cliente buscou resolver com o escritório?</label><textarea id="ctRespEscritorio" class="form-control" rows="2"></textarea></div>
  <div class="form-group"><label>Onde foi feita a prospecção da venda?</label><textarea id="ctRespProspeccao" class="form-control" rows="2"></textarea></div>
  <div class="form-row"><div class="form-group"><label>Responsável pela venda (CPF/nome)</label><input type="text" id="ctRespRespVenda" class="form-control"/></div>
  <div class="form-group"><label>Responsável pela indicação (cível)</label><input type="text" id="ctRespRespIndic" class="form-control"/></div></div>
  <div class="form-group"><label>Possui evidências?</label><select id="ctRespEvidencias" class="form-control"><option value="nao">Não</option><option value="sim">Sim</option></select></div>
  <div class="form-group"><label>Anexo evidências</label><input type="file" accept=".pdf,.jpg,.jpeg,.png" onchange="Contestacao.uploadResp(this,'evidencias')"/><input type="hidden" id="ctRespEvidVal"/></div>
  <div class="form-group"><label>Anexo termo de ciência</label><input type="file" accept=".pdf,.jpg,.jpeg,.png" onchange="Contestacao.uploadResp(this,'termo_ciencia')"/><input type="hidden" id="ctRespTermoVal"/></div>
</div><div class="modal-footer">
  <button type="button" class="btn btn-ghost" onclick="closeModal('ctRespondModal')">Cancelar</button>
  <button type="button" class="btn btn-primary" onclick="Contestacao.saveRespond()">Enviar resposta</button>
</div></div></div>

<div class="modal-overlay" id="ctReviewModal"><div class="modal" style="max-width:520px;"><div class="modal-header">
  <h3>Interagir contestação</h3><button type="button" class="modal-close" onclick="closeModal('ctReviewModal')"></button></div>
<div class="modal-body">
  <input type="hidden" id="ctRevId"/>
  <div id="ctRevInfo" style="margin-bottom:12px;font-size:13px;"></div>
  <div class="form-group"><label>Evidências aceitas</label><select id="ctRevEvid" class="form-control"><option value="nao">Não</option><option value="sim">Sim</option></select></div>
  <div class="form-group"><label>Termo de ciência assinado</label><select id="ctRevTermo" class="form-control"><option value="nao">Não</option><option value="sim">Sim</option></select></div>
  <div class="form-group"><label>Encerrado</label><select id="ctRevEncerrado" class="form-control"><option value="nao">Não</option><option value="sim">Sim</option></select></div>
  <div class="form-group"><label>Procedente</label><select id="ctRevProcedente" class="form-control"><option value="em_aberto">Em aberto</option><option value="sim">Sim</option><option value="nao">Não</option></select></div>
</div><div class="modal-footer">
  <button type="button" class="btn btn-ghost" onclick="closeModal('ctReviewModal')">Cancelar</button>
  <button type="button" class="btn btn-primary" onclick="Contestacao.saveReview()">Salvar</button>
</div></div></div>`);
    },

    init() {
      this.ensureUi();
      const cfg = window.__ADMIN_NAV_CFG__;
      if (cfg) this.applyNavVisibility(cfg);
    },
  };

  window.Contestacao = Contestacao;
  document.addEventListener('DOMContentLoaded', () => setTimeout(() => Contestacao.init(), 250));
})();
