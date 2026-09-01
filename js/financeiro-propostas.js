/* SOU+BLU — Financeiro: Baixa Comissão, Emitir Prejuízo, Debitar Parceiro */
(function () {
  'use strict';

  const LS_KEY = 'soublu_finance_proposta_ops';

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

  function simNaoOptions(selected) {
    const s = String(selected || '').toUpperCase();
    return ['', 'SIM', 'NÃO'].map((v) => {
      const lbl = v || '—';
      return `<option value="${v}"${s === v ? ' selected' : ''}>${lbl}</option>`;
    }).join('');
  }

  function canView() {
    const sess = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    if (!sess || window.PARTNER_ROOT_ID) return false;
    return ['master', 'fundador', 'gerente', 'financeiro', 'financial', 'rh', 'diretoria'].includes(String(sess.role || '').toLowerCase());
  }

  function proposalValor(p) {
    if (typeof DB !== 'undefined' && typeof DB.proposalAmount === 'function') {
      return DB.proposalAmount(p);
    }
    const v = parseFloat(p?.valor ?? 0);
    if (Number.isFinite(v) && v > 0) return v;
    return parseFloat(p?.valorFinal ?? p?.valor_final ?? 0) || 0;
  }

  function proposalLabel(p) {
    const num = p?.numero || p?.id || '—';
    const cli = p?.client_name || p?.clientName || 'Cliente';
    const vend = p?.vendor_name || p?.vendorName || '';
    return `${num} · ${cli}${vend ? ` · ${vend}` : ''}`;
  }

  function blackBar(title) {
    return `<div style="background:#111;color:#fff;padding:10px 16px;font-family:var(--font-display,'Nunito',sans-serif);font-weight:800;font-size:13px;letter-spacing:.04em;text-transform:uppercase;margin:0 0 0;border-radius:var(--radius-md,8px) var(--radius-md,8px) 0 0;">${esc(title)}</div>`;
  }

  function finGridRow(label, fieldHtml) {
    return `<tr>
      <th style="width:34%;text-align:left;padding:10px 12px;background:var(--color-surface-2);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap;">${esc(label)}</th>
      <td style="padding:8px 12px;">${fieldHtml}</td>
    </tr>`;
  }

  function simNaoSelect(id, onchange) {
    const oc = onchange ? ` onchange="${onchange}"` : '';
    return `<select id="${id}" class="form-control"${oc}><option value="">—</option><option value="SIM">SIM</option><option value="NÃO">NÃO</option></select>`;
  }

  function val(id) {
    return document.getElementById(id)?.value || '';
  }

  async function loadOps(type) {
    if (typeof DB.getFinancePropostaOps === 'function') {
      return DB.getFinancePropostaOps(type);
    }
    let all = [];
    try { all = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { all = []; }
    return type ? all.filter((r) => r.type === type) : all;
  }

  async function saveOpLocal(record) {
    let all = [];
    try { all = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { all = []; }
    const idx = all.findIndex((r) => r.id === record.id);
    if (idx >= 0) all[idx] = record;
    else all.unshift(record);
    localStorage.setItem(LS_KEY, JSON.stringify(all.slice(0, 500)));
    return record;
  }

  async function saveOp(record) {
    if (typeof DB.saveFinancePropostaOp === 'function') {
      try {
        return await DB.saveFinancePropostaOp(record);
      } catch (e) {
        console.warn('[FinPropostas] saveFinancePropostaOp falhou, fallback local:', e?.message || e);
        return saveOpLocal(record);
      }
    }
    return saveOpLocal(record);
  }

  /** PATCH parcial — evita saveProposal completo (anexos/base64) que quebra a baixa. */
  async function patchProposalLean(proposalId, fields) {
    const id = String(proposalId || '').trim();
    if (!id) throw new Error('ID da proposta é obrigatório.');
    const patch = { id, ...fields };
    if (typeof DB.updateProposal === 'function') {
      const saved = await DB.updateProposal(id, patch);
      if (!saved && typeof DB.saveProposal === 'function') {
        return DB.saveProposal(patch, { skipHydrate: true });
      }
      return saved || patch;
    }
    if (typeof DB.saveProposal === 'function') {
      return DB.saveProposal(patch, { skipHydrate: true });
    }
    throw new Error('Não foi possível atualizar a proposta.');
  }

  const FinPropostas = {
    tab: 'prejuizo',
    _proposal: null,
    _evidencias: [],
    _drawerProposal: null,
    _drawerTab: 'dados',
    _drawerAptoOverride: false,
    _baixaOpsByProposal: null,
    _prejuizoOpsByProposal: null,
    _debitoOpsByProposal: null,

    init() {
      this.applyNavVisibility();
      this.ensureDrawer();
      this._injectGestaoComissaoColumn();
      this._injectGestaoBanner();
    },

    applyNavVisibility() {
      const show = canView();
      document.querySelectorAll(
        '#navFinBaixaComissao, #navFinPrejuizoColaborador, #navFinPrejuizoParceiro, ' +
        '#navFinPrejuizo, #navFinDebitarParceiro, [data-section="secFinPropostas"]'
      ).forEach((el) => {
        el.style.display = show ? '' : 'none';
      });
    },

    async render() {
      await this.mount();
    },

    _tabsHtml() {
      const tabs = [
        { id: 'prejuizo', label: 'Emitir prejuízo colaborador' },
        { id: 'debitar', label: 'Emitir prejuízo parceiro' },
      ];
      return `<div class="fin-prop-tabs" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;border-bottom:1px solid var(--color-border);padding-bottom:10px;">
        ${tabs.map((t) => `<button type="button" class="btn ${this.tab === t.id ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="FinPropostas.switchTab('${t.id}')">${esc(t.label)}</button>`).join('')}
      </div>`;
    },

    switchTab(tab) {
      this.tab = tab;
      this._proposal = null;
      this._evidencias = [];
      if (window.FinanceiroBoot?.openSection) {
        FinanceiroBoot.openSection('secFinPropostas', tab);
      } else {
        this.mount();
      }
    },

    _lookupRow(prefix, btnLabel) {
      return finGridRow('PROPOSTA', `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
        <input type="text" id="${prefix}PropostaBusca" class="form-control" style="flex:1;min-width:200px;" placeholder="Nº proposta, CPF ou nome do cliente"/>
        <button type="button" class="btn btn-primary btn-sm" onclick="FinPropostas.buscarProposta('${prefix}')">${esc(btnLabel || 'Buscar banco de dados')}</button>
      </div>
      <div id="${prefix}PropostaResumo" style="display:none;margin-top:10px;"></div>
      <input type="hidden" id="${prefix}PropostaId"/>`);
    },

    _embeddedProposalRow(p, prefix) {
      return finGridRow('PROPOSTA', `<strong>${esc(proposalLabel(p))}</strong>
        <input type="hidden" id="${prefix}PropostaId" value="${esc(p.id)}"/>`);
    },

    async _loadProposalById(propId) {
      const id = String(propId || '').trim();
      if (!id) return null;
      if (this._drawerProposal && String(this._drawerProposal.id) === id) {
        return this._drawerProposal;
      }
      if (this._proposal && String(this._proposal.id) === id) {
        return this._proposal;
      }
      if (typeof DB.getProposal === 'function') {
        const full = await DB.getProposal(id).catch(() => null);
        if (full) return full;
      }
      const props = await DB.getProposals().catch(() => []);
      return (props || []).find((x) => String(x.id) === id) || null;
    },

    async _findProposalByQuery(q) {
      const raw = String(q || '').trim();
      if (!raw) return null;
      const qCpf = raw.replace(/\D/g, '');
      const matchLocal = (p) => {
        const num = String(p.numero || p.id || '');
        const cpf = String(p.client_cpf || p.clientCpf || '').replace(/\D/g, '');
        const cli = String(p.client_name || p.clientName || '');
        if (typeof textMatchesSearch === 'function') {
          if (textMatchesSearch(num, raw) || textMatchesSearch(cli, raw)) return true;
        } else {
          const ql = raw.toLowerCase();
          const numL = num.toLowerCase();
          if (numL === ql || numL.includes(ql) || cli.toLowerCase().includes(ql)) return true;
        }
        return qCpf.length >= 4 && cpf.includes(qCpf);
      };

      // Busca direta na API (não depende do limite de 800 da lista).
      if (DB.online && typeof supaReq === 'function') {
        const tries = [];
        tries.push(`?select=*&numero=eq.${encodeURIComponent(raw)}&limit=5`);
        if (/^[a-zA-Z0-9_-]{6,}$/.test(raw)) {
          tries.push(`?select=*&id=eq.${encodeURIComponent(raw)}&limit=1`);
        }
        if (qCpf.length >= 11) {
          tries.push(`?select=*&clientCpf=eq.${encodeURIComponent(qCpf)}&limit=10`);
          tries.push(`?select=*&client_cpf=eq.${encodeURIComponent(qCpf)}&limit=10`);
        } else if (qCpf.length >= 4) {
          tries.push(`?select=*&clientCpf=like.*${encodeURIComponent(qCpf)}*&limit=20`);
          tries.push(`?select=*&client_cpf=like.*${encodeURIComponent(qCpf)}*&limit=20`);
        }
        if (raw.length >= 3 && !/^\d+$/.test(raw)) {
          tries.push(`?select=*&clientName=ilike.*${encodeURIComponent(raw)}*&limit=20`);
          tries.push(`?select=*&client_name=ilike.*${encodeURIComponent(raw)}*&limit=20`);
          tries.push(`?select=*&numero=ilike.*${encodeURIComponent(raw)}*&limit=20`);
        }
        for (const params of tries) {
          try {
            const rows = await supaReq('GET', 'proposals', null, params);
            const hit = (rows || []).find(matchLocal) || (rows || [])[0];
            if (hit) return hit;
          } catch { /* tenta próximo filtro */ }
        }
      }

      const props = await DB.getProposals().catch(() => []);
      return (props || []).find(matchLocal) || null;
    },

    async buscarProposta(prefix) {
      const q = document.getElementById(`${prefix}PropostaBusca`)?.value?.trim();
      if (!q) {
        showToast('Informe o número da proposta, CPF ou cliente.', 'warning');
        return;
      }
      showLoading('Buscando proposta...');
      try {
        const found = await this._findProposalByQuery(q);
        if (!found) {
          showToast('Proposta não encontrada.', 'warning');
          return;
        }
        this._proposal = found;
        const hid = document.getElementById(`${prefix}PropostaId`);
        if (hid) hid.value = found.id;
        const box = document.getElementById(`${prefix}PropostaResumo`);
        if (box) {
          box.style.display = 'block';
          box.innerHTML = `<div class="card card-padded" style="background:var(--color-surface-2);border-left:4px solid var(--color-primary);">
            <strong>${esc(proposalLabel(found))}</strong>
            <p style="margin:6px 0 0;font-size:13px;color:var(--color-text-muted);">
              Valor: ${fmtMoney(proposalValor(found))} · Status: ${esc(found.status || '—')}
              ${found.comissaoRecebida || found.comissao_recebida ? ` · Comissão recebida: ${esc(found.comissaoRecebida || found.comissao_recebida)}` : ''}
              ${found.comissaoElegivel || found.comissao_elegivel ? ` · Elegível: ${esc(found.comissaoElegivel || found.comissao_elegivel)}` : ''}
            </p>
          </div>`;
        }
        if (prefix === 'prej') await this._preencherEquipePrejuizo(found);
        if (prefix === 'deb') await this._preencherParceiroDebito(found);
        showToast('Proposta localizada.', 'success');
      } catch (e) {
        showToast(e.message || 'Erro na busca.', 'error');
      } finally {
        hideLoading();
      }
    },

    async _resolveEquipe(proposal) {
      const vendorId = (typeof DB !== 'undefined' && typeof DB.proposalVendorId === 'function')
        ? DB.proposalVendorId(proposal)
        : (proposal.vendorId || proposal.vendor_id || proposal.employee_id);
      const vendor = vendorId ? await DB.getUser(vendorId).catch(() => null) : null;
      let supervisor = null;
      let gerente = null;
      let supOperacional = null;
      let backoffice = null;
      let empresa = 'SOU+BLU';

      if (vendor?.admin_id) {
        supervisor = await DB.getUser(vendor.admin_id).catch(() => null);
        if (supervisor?.admin_id) {
          gerente = await DB.getUser(supervisor.admin_id).catch(() => null);
        }
      }

      const users = await DB.getUsers().catch(() => []);
      if (supervisor) {
        supOperacional = users.find((u) =>
          u.admin_id === supervisor.id && ['sup_backoffice', 'operacional'].includes(String(u.role || '').toLowerCase())
        ) || null;
        backoffice = users.find((u) =>
          u.admin_id === supervisor.id && String(u.role || '').toLowerCase() === 'backoffice'
        ) || null;
      }
      if (!gerente) {
        gerente = users.find((u) => ['gerente', 'gerencia'].includes(String(u.role || '').toLowerCase())) || null;
      }

      if (typeof DB.getRhCompanies === 'function') {
        const cos = await DB.getRhCompanies().catch(() => []);
        if (cos?.length) empresa = cos[0].razao_social || cos[0].name || empresa;
      } else if (vendor?.department) {
        empresa = vendor.department;
      }

      return {
        vendedor: vendor?.name || proposal.vendor_name || proposal.vendorName || '—',
        vendedorId: vendor?.id || vendorId || null,
        supervisor: supervisor?.name || '—',
        supervisorId: supervisor?.id || null,
        gerente: gerente?.name || '—',
        gerenteId: gerente?.id || null,
        supOperacional: supOperacional?.name || '—',
        supOperacionalId: supOperacional?.id || null,
        backoffice: backoffice?.name || '—',
        backofficeId: backoffice?.id || null,
        empresa,
        valor: proposalValor(proposal),
      };
    },

    async _resolvePartnerForVendor(vendor) {
      if (!vendor || typeof DB === 'undefined') return null;
      let rootId = vendor.partner_root_id || null;
      if (!rootId && String(vendor.role || '').toLowerCase() === 'parceiro') rootId = vendor.id;
      if (!rootId) return null;
      return DB.getPartnerByUserId(rootId).catch(() => null);
    },

    _parseProposalMeta(proposal) {
      const raw = proposal?.meta;
      if (typeof DB !== 'undefined' && typeof DB._parseProposalJsonField === 'function') {
        return DB._parseProposalJsonField(raw);
      }
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
      if (typeof raw === 'string' && raw.trim()) {
        try { return JSON.parse(raw); } catch { return {}; }
      }
      return {};
    },

    async _resolveComissaoCreditTarget(proposal, origemParceiro, pagoParceiro) {
      const eq = await this._resolveEquipe(proposal);
      const vendorId = eq.vendedorId;
      if (!vendorId) return { targetId: null, label: null, eq, vendorId: null, partnerId: null };

      // Crédito automático só para origem parceiro + pago comissão parceiro = SIM (conta do parceiro).
      // Nunca credita vendedor automaticamente — evita o bug de comissão indevida.
      if (origemParceiro !== 'SIM' || pagoParceiro !== 'SIM') {
        return { targetId: null, label: null, eq, vendorId, partnerId: null };
      }

      const users = await DB.getUsers().catch(() => []);
      const vendor = users.find((u) => String(u.id) === String(vendorId)) || null;
      const partnerId = vendor?.partner_root_id
        || (String(vendor?.role || '').toLowerCase() === 'parceiro' ? vendor.id : null);
      const partner = partnerId ? users.find((u) => String(u.id) === String(partnerId)) : null;
      return {
        targetId: partner?.id || null,
        label: partner?.id ? 'parceiro' : null,
        eq,
        vendorId,
        partnerId: partner?.id || null,
      };
    },

    async _sumComissaoContaCreditada(proposal, targetId) {
      const proposalRef = String(proposal?.numero || proposal?.id || '');
      const metaAmt = parseFloat(this._parseProposalMeta(proposal).comissao_conta_creditada);
      let txSum = 0;
      if (targetId && typeof DB.getTransactions === 'function') {
        const txs = await DB.getTransactions(targetId).catch(() => []);
        for (const t of txs || []) {
          if (String(t.type || '').toLowerCase() !== 'credit') continue;
          let meta = t.meta;
          if (typeof meta === 'string') {
            try { meta = JSON.parse(meta); } catch { meta = {}; }
          }
          meta = meta && typeof meta === 'object' ? meta : {};
          if (meta.kind !== 'conta_credito_proposta') continue;
          if (String(meta.proposal_ref || '') !== proposalRef) continue;
          const amt = parseFloat(t.amount);
          if (Number.isFinite(amt)) txSum += amt;
        }
        txSum = Math.round(txSum * 100) / 100;
      }
      const fromMeta = Number.isFinite(metaAmt) && metaAmt >= 0 ? metaAmt : 0;
      return Math.max(fromMeta, txSum);
    },

    async _preencherBaixaComissao(proposal, prefix = 'fpd') {
      const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
      set(`${prefix}ComissaoRecebida`, proposal.comissaoRecebida || proposal.comissao_recebida || '');
      set(`${prefix}AptoComissao`, proposal.comissaoElegivel || proposal.comissao_elegivel || '');
      const vcr = proposal.valorComissaoRecebida ?? proposal.valor_comissao_recebida;
      if (vcr != null && vcr !== '') {
        const elV = document.getElementById(`${prefix}ValorComissao`);
        if (elV) elV.value = vcr;
      }

      const vendorId = (typeof DB !== 'undefined' && typeof DB.proposalVendorId === 'function')
        ? DB.proposalVendorId(proposal)
        : (proposal.vendorId || proposal.vendor_id || proposal.employee_id);
      const users = await DB.getUsers().catch(() => []);
      const vendor = vendorId ? users.find((u) => u.id === vendorId) : null;
      const isPartner = !!(vendor?.partner_root_id || String(vendor?.role || '').toLowerCase() === 'parceiro');
      set(`${prefix}OrigemParceiro`, isPartner ? 'SIM' : 'NÃO');
      set(`${prefix}OrigemVendedor`, vendorId ? 'SIM' : 'NÃO');

      // Comissão líquida automática pela faixa do parceiro (FinPropostas / baixa comissão).
      if (isPartner && (vcr == null || vcr === '') && typeof PartnerPerms !== 'undefined') {
        const prt = await this._resolvePartnerForVendor(vendor);
        const valorBruto = typeof DB.proposalGrossAmount === 'function'
          ? DB.proposalGrossAmount(proposal)
          : parseFloat(proposal.valor ?? proposal.valorFinal ?? proposal.valor_final ?? 0);
        const liquido = PartnerPerms.calcPartnerCommission(valorBruto, prt);
        if (liquido > 0) {
          const elV = document.getElementById(`${prefix}ValorComissao`);
          if (elV) elV.value = liquido.toFixed(2);
        }
      }

      const lastOp = await this._getLastBaixaOp(proposal.id);
      if (lastOp) {
        set(`${prefix}Divergencia`, lastOp.divergencia_tabela || '');
        set(`${prefix}Protocolo`, lastOp.protocolo_divergencia || '');
        set(`${prefix}PagoParceiro`, lastOp.pago_comissao_parceiro || '');
        if (lastOp.origem_parceiro) set(`${prefix}OrigemParceiro`, lastOp.origem_parceiro);
        if (lastOp.origem_vendedor) set(`${prefix}OrigemVendedor`, lastOp.origem_vendedor);
        if (lastOp.apto_comissao && !proposal.comissaoElegivel && !proposal.comissao_elegivel) {
          set(`${prefix}AptoComissao`, lastOp.apto_comissao);
        }
        if (lastOp.valor_comissao != null && lastOp.valor_comissao !== '' && !vcr) {
          const elV = document.getElementById(`${prefix}ValorComissao`);
          if (elV) elV.value = lastOp.valor_comissao;
        }
      }

      this._drawerAptoOverride = !!(proposal.comissaoElegivel || proposal.comissao_elegivel);
      this.onDivergenciaChange(prefix);
      this._updateAptoComissao(prefix);
    },

    _renderComissaoForm(prefix, opts = {}) {
      const embedded = !!opts.embedded;
      const p = opts.proposal;
      const oc = (fn) => `FinPropostas.${fn}('${prefix}')`;
      const proposalRow = embedded && p
        ? this._embeddedProposalRow(p, prefix)
        : this._lookupRow(prefix, 'Buscar banco de dados');
      return `<div class="card card-padded" style="padding:0;overflow:hidden;">
        ${blackBar('Baixa comissão')}
        <div style="padding:16px 20px 20px;">
          <div class="table-wrap" style="margin-bottom:16px;">
            <table class="data-table" style="width:100%;">
              <tbody>
                ${proposalRow}
                ${finGridRow('COMISSÃO RECEBIDA?', simNaoSelect(`${prefix}ComissaoRecebida`, oc('_updateAptoComissao')))}
                ${finGridRow('VALOR DA COMISSÃO (R$)', `<input type="number" id="${prefix}ValorComissao" class="form-control" min="0" step="0.01" placeholder="0,00"/>`)}
                ${finGridRow('DIVERGÊNCIA TABELA', simNaoSelect(`${prefix}Divergencia`, oc('onDivergenciaChange')))}
                <tr id="${prefix}ProtocoloRow" style="display:none;">
                  <th style="width:34%;text-align:left;padding:10px 12px;background:var(--color-surface-2);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap;">PROTOCOLO PARA TRATAR DIVERGÊNCIA</th>
                  <td style="padding:8px 12px;"><input type="text" id="${prefix}Protocolo" class="form-control" placeholder="Número do protocolo"/></td>
                </tr>
                ${finGridRow('PROPOSTA ORIGEM PARCEIRO', simNaoSelect(`${prefix}OrigemParceiro`, oc('_updateAptoComissao')))}
                ${finGridRow('PAGO COMISSÃO PARCEIRO', simNaoSelect(`${prefix}PagoParceiro`, oc('_updateAptoComissao')))}
                ${finGridRow('PROPOSTA ORIGEM VENDEDOR', simNaoSelect(`${prefix}OrigemVendedor`, oc('_updateAptoComissao')))}
                ${finGridRow('APTO PARA RECEBER COMISSÃO', `${simNaoSelect(`${prefix}AptoComissao`, 'FinPropostas.onAptoManualChange()')}
                  <p id="${prefix}AptoHint" style="margin:6px 0 0;font-size:11px;color:var(--color-text-muted);">Calculado automaticamente — altere para sobrescrever.</p>`)}
              </tbody>
            </table>
          </div>
          <div style="display:flex;justify-content:flex-end;">
            <button type="button" class="btn btn-primary" onclick="FinPropostas.salvarBaixaComissao('${prefix}')">Registrar baixa de comissão</button>
          </div>
        </div>
      </div>`;
    },

    onDivergenciaChange(prefix = 'fpd') {
      const show = val(`${prefix}Divergencia`) === 'SIM';
      const row = document.getElementById(`${prefix}ProtocoloRow`);
      if (row) row.style.display = show ? '' : 'none';
      this._updateAptoComissao(prefix);
    },

    onAptoManualChange() {
      this._drawerAptoOverride = true;
      const hint = document.getElementById('fpdAptoHint');
      if (hint) hint.textContent = 'Valor definido manualmente.';
    },

    _computeAptoComissao(prefix = 'fpd') {
      const recebida = val(`${prefix}ComissaoRecebida`);
      const divergencia = val(`${prefix}Divergencia`);
      const origemParceiro = val(`${prefix}OrigemParceiro`);
      const pagoParceiro = val(`${prefix}PagoParceiro`);
      if (recebida !== 'SIM' || divergencia === 'SIM') return 'NÃO';
      // Comissão automática só para propostas de parceiro — vendedores exigem definição manual.
      if (origemParceiro !== 'SIM') return '';
      if (pagoParceiro !== 'SIM') return 'NÃO';
      return 'SIM';
    },

    _updateAptoComissao(prefix = 'fpd') {
      if (this._drawerAptoOverride) return;
      const apto = this._computeAptoComissao(prefix);
      const el = document.getElementById(`${prefix}AptoComissao`);
      if (!el) return;
      if (apto === '') {
        el.value = '';
        return;
      }
      if (apto) el.value = apto;
    },

    async _preencherEquipePrejuizo(proposal, prefix = 'prej') {
      const eq = await this._resolveEquipe(proposal);
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      set(`${prefix}Vendedor`, eq.vendedor);
      set(`${prefix}Supervisor`, eq.supervisor);
      set(`${prefix}Gerente`, eq.gerente);
      set(`${prefix}SupOperacional`, eq.supOperacional);
      set(`${prefix}Backoffice`, eq.backoffice);
      set(`${prefix}Empresa`, eq.empresa);
      set(`${prefix}ValorEstorno`, eq.valor > 0 ? eq.valor.toFixed(2) : '');
      this._equipeIds = eq;
    },

    async _preencherParceiroDebito(proposal, prefix = 'deb') {
      const users = await DB.getUsers().catch(() => []);
      const vendorId = (typeof DB !== 'undefined' && typeof DB.proposalVendorId === 'function')
        ? DB.proposalVendorId(proposal)
        : (proposal.vendorId || proposal.vendor_id || proposal.employee_id);
      const vendor = vendorId ? users.find((u) => u.id === vendorId) : null;
      let parceiro = '—';
      if (vendor?.partner_root_id) {
        const root = users.find((u) => u.id === vendor.partner_root_id);
        parceiro = root?.name || vendor.name;
      } else if (vendor?.role === 'parceiro') {
        parceiro = vendor.name;
      }
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      set(`${prefix}Parceiro`, parceiro);
      set(`${prefix}ValorEstorno`, proposalValor(proposal) > 0 ? proposalValor(proposal).toFixed(2) : '');
      set(`${prefix}ValorIntegral`, proposalValor(proposal) > 0 ? proposalValor(proposal).toFixed(2) : '');
    },

    _renderPrejuizo(prefix = 'prej', opts = {}) {
      const embedded = !!opts.embedded;
      const p = opts.proposal;
      const oc = (fn) => `FinPropostas.${fn}('${prefix}')`;
      const proposalRow = embedded && p
        ? this._embeddedProposalRow(p, prefix)
        : this._lookupRow(prefix, 'Buscar banco de dados');
      const evidRows = Array.from({ length: 7 }, (_, i) => {
        const n = i + 1;
        return `<tr>
          <th style="width:34%;text-align:left;padding:10px 12px;background:var(--color-surface-2);font-size:11px;font-weight:700;">EVIDÊNCIA ${n}</th>
          <td style="padding:8px 12px;">
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
              <input type="file" id="${prefix}Evid${n}" class="form-control" style="max-width:280px;" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onchange="FinPropostas.uploadEvidencia(${n}, this, '${prefix}')"/>
              <input type="hidden" id="${prefix}EvidUrl${n}"/>
              <span id="${prefix}EvidStatus${n}" class="text-muted" style="font-size:12px;">Nenhum arquivo</span>
            </div>
          </td>
        </tr>`;
      }).join('');

      return `<div class="card card-padded" style="padding:0;overflow:hidden;">
        ${blackBar('Emitir prejuízo')}
        <div style="padding:16px 20px 20px;">
          <div class="table-wrap" style="margin-bottom:16px;">
            <table class="data-table" style="width:100%;">
              <tbody>
                ${proposalRow}
                ${finGridRow('VALOR DO ESTORNO', `<input type="number" id="${prefix}ValorEstorno" class="form-control" min="0" step="0.01" placeholder="0,00"/>`)}
                ${finGridRow('VENDEDOR', `<input type="text" id="${prefix}Vendedor" class="form-control" readonly/>`)}
                ${finGridRow('SUPERVISOR', `<input type="text" id="${prefix}Supervisor" class="form-control" readonly/>`)}
                ${finGridRow('GERENTE', `<input type="text" id="${prefix}Gerente" class="form-control" readonly/>`)}
                ${finGridRow('SUP. OPERACIONAL', `<input type="text" id="${prefix}SupOperacional" class="form-control" readonly/>`)}
                ${finGridRow('BACKOFFICE', `<input type="text" id="${prefix}Backoffice" class="form-control" readonly/>`)}
                ${finGridRow('EMPRESA', `<input type="text" id="${prefix}Empresa" class="form-control" readonly/>`)}
                ${finGridRow('RESPONSÁVEL PELO ERRO', `<input type="text" id="${prefix}Responsavel" class="form-control" placeholder="Nome do responsável"/>`)}
                ${finGridRow('DESCRIÇÃO DO ERRO', `<textarea id="${prefix}Descricao" class="form-control" rows="3" placeholder="Descreva o erro ocorrido..."></textarea>`)}
                ${finGridRow('STATUS', `<select id="${prefix}Status" class="form-control" onchange="FinPropostas.onPrejuizoStatusChange('${prefix}')">
                  <option value="">Selecione...</option>
                  <option value="PROCEDENTE">PROCEDENTE</option>
                  <option value="IMPROCEDENTE">IMPROCEDENTE</option>
                </select>`)}
              </tbody>
            </table>
          </div>
          <h4 style="font-weight:800;margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--color-text-muted);">Evidências</h4>
          <div class="table-wrap" style="margin-bottom:16px;">
            <table class="data-table" style="width:100%;"><tbody>${evidRows}</tbody></table>
          </div>
          <p id="${prefix}ImprocedenteHint" class="text-muted" style="display:none;font-size:12px;margin:0 0 16px;padding:10px;background:#fef3c7;border-radius:8px;border:1px solid #fcd34d;">
            <strong>IMPROCEDENTE:</strong> será lançado 5% do valor da proposta como débito negativo para todos os envolvidos (vendedor, supervisor, gerente, sup. operacional e backoffice).
          </p>
          <div style="display:flex;justify-content:flex-end;">
            <button type="button" class="btn btn-primary" onclick="FinPropostas.salvarPrejuizo('${prefix}')">Emitir prejuízo</button>
          </div>
        </div>
      </div>${embedded ? '' : '<div id="prejHistorico" style="margin-top:20px;"></div>'}`;
    },

    _renderDebitar(prefix = 'deb', opts = {}) {
      const embedded = !!opts.embedded;
      const p = opts.proposal;
      const proposalRow = embedded && p
        ? this._embeddedProposalRow(p, prefix)
        : this._lookupRow(prefix, 'Buscar banco de dados');

      return `<div class="card card-padded" style="padding:0;overflow:hidden;">
        ${blackBar('Debitar parceiro')}
        <div style="padding:16px 20px 20px;">
          <div class="table-wrap" style="margin-bottom:16px;">
            <table class="data-table" style="width:100%;">
              <tbody>
                ${proposalRow}
                ${finGridRow('VALOR DO ESTORNO', `<input type="number" id="${prefix}ValorEstorno" class="form-control" min="0" step="0.01" placeholder="0,00"/>`)}
                ${finGridRow('CUSTAS JUDICIAIS', `<input type="number" id="${prefix}Custas" class="form-control" min="0" step="0.01" placeholder="0,00"/>`)}
                ${finGridRow('PARCEIRO', `<input type="text" id="${prefix}Parceiro" class="form-control" placeholder="Nome do parceiro"/>`)}
                ${finGridRow('VALOR DO ESTORNO INTEGRAL', `<input type="number" id="${prefix}ValorIntegral" class="form-control" min="0" step="0.01" placeholder="0,00"/>`)}
                ${finGridRow('PARCELAMENTO', `<select id="${prefix}Parcelas" class="form-control">
                  <option value="1">1X</option><option value="2">2X</option><option value="3">3X</option><option value="4">4X</option>
                </select>`)}
              </tbody>
            </table>
          </div>
          <div style="background:#111;color:#fff;padding:10px 16px;font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:.04em;border-radius:var(--radius-md,8px);margin-bottom:12px;text-align:center;">Debitar parceiro</div>
          <button type="button" class="btn btn-primary btn-full" onclick="FinPropostas.salvarDebitoParceiro('${prefix}')">Confirmar débito ao parceiro</button>
        </div>
      </div>${embedded ? '' : '<div id="debHistorico" style="margin-top:20px;"></div>'}`;
    },

    async mount(rootId = 'finPropostasRoot') {
      const root = document.getElementById(rootId);
      if (!root || !canView()) return;

      root.innerHTML = `<div class="card card-padded" style="text-align:center;padding:40px 24px;">
        <h3 style="margin:0 0 10px;font-weight:800;">Operações integradas à Gestão de Propostas</h3>
        <p class="text-muted" style="margin:0 0 20px;font-size:14px;max-width:520px;margin-left:auto;margin-right:auto;">
          Baixa de comissão, emissão de prejuízo e débito ao parceiro estão no painel de cada proposta — abas <strong>Dados · Comissão · Prejuízo · Débito Parceiro · Histórico</strong>.
        </p>
        <button type="button" class="btn btn-primary" onclick="FinanceiroBoot.openSection('secManageProposals')">Abrir Gestão de Propostas</button>
      </div>`;
    },

    onPrejuizoStatusChange(prefix = 'prej') {
      const st = document.getElementById(`${prefix}Status`)?.value;
      const hint = document.getElementById(`${prefix}ImprocedenteHint`);
      if (hint) hint.style.display = st === 'IMPROCEDENTE' ? 'block' : 'none';
    },

    async uploadEvidencia(n, input, prefix = 'prej') {
      const file = input?.files?.[0];
      if (!file) return;
      if (file.size > 25 * 1024 * 1024) {
        showToast('Arquivo excede 25 MB.', 'warning');
        input.value = '';
        return;
      }
      const statusEl = document.getElementById(`${prefix}EvidStatus${n}`);
      if (statusEl) statusEl.textContent = 'Enviando...';
      try {
        const propId = document.getElementById(`${prefix}PropostaId`)?.value
          || this._drawerProposal?.id
          || 'prejuizo';
        let url = '';
        if (typeof DB.uploadProposalFile === 'function') {
          const uploaded = await DB.uploadProposalFile(file, propId, `prejuizo_evid_${n}`);
          url = typeof DB.resolveUploadUrl === 'function' ? DB.resolveUploadUrl(uploaded) : (uploaded?.url || uploaded);
        } else if (typeof uploadImage === 'function') {
          url = await uploadImage(file, 'finance-docs', `prejuizo_evid_${n}_${Date.now()}`);
        } else if (typeof fileToBase64 === 'function') {
          url = await fileToBase64(file);
        }
        const hid = document.getElementById(`${prefix}EvidUrl${n}`);
        if (hid) hid.value = url;
        if (statusEl) statusEl.textContent = file.name || '✓ Anexado';
        showToast(`Evidência ${n} carregada.`, 'success');
      } catch (e) {
        if (statusEl) statusEl.textContent = 'Erro';
        showToast('Erro no upload: ' + (e.message || ''), 'error');
      }
    },

    async salvarBaixaComissao(prefix = 'fpd') {
      const propId = prefix === 'fpd'
        ? this._drawerProposal?.id
        : document.getElementById(`${prefix}PropostaId`)?.value;
      if (!propId) {
        showToast('Selecione uma proposta.', 'warning');
        return;
      }
      const p = await this._loadProposalById(propId);
      if (!p) {
        showToast('Proposta não encontrada.', 'error');
        return;
      }

      const rawValor = val(`${prefix}ValorComissao`);
      const valorComissao = rawValor !== '' && rawValor != null ? Number(rawValor) : null;

      const dados = {
        comissaoRecebida: val(`${prefix}ComissaoRecebida`) || null,
        comissaoElegivel: val(`${prefix}AptoComissao`) || null,
        valorComissaoRecebida: valorComissao != null && !Number.isNaN(valorComissao) ? valorComissao : null,
      };

      const origemParceiro = val(`${prefix}OrigemParceiro`) || null;
      const pagoParceiro = val(`${prefix}PagoParceiro`) || null;
      const aptoComissao = val(`${prefix}AptoComissao`) || null;
      const sess = Auth.getSession();
      const proposalNumero = p.numero || p.id;

      const op = {
        id: DB._genId ? DB._genId('fpo') : 'fpo' + Date.now(),
        type: 'baixa_comissao',
        proposal_id: propId,
        proposal_numero: proposalNumero,
        comissao_recebida: dados.comissaoRecebida,
        valor_comissao: dados.valorComissaoRecebida,
        divergencia_tabela: val(`${prefix}Divergencia`) || null,
        protocolo_divergencia: val(`${prefix}Protocolo`)?.trim() || '',
        origem_parceiro: origemParceiro,
        pago_comissao_parceiro: pagoParceiro,
        origem_vendedor: val(`${prefix}OrigemVendedor`) || null,
        apto_comissao: aptoComissao,
        created_at: new Date().toISOString(),
        created_by: sess?.id || 'admin',
      };

      showLoading('Salvando baixa de comissão...');
      try {
        let creditInfo = null;
        const shouldCredit = aptoComissao === 'SIM'
          && valorComissao != null
          && Number.isFinite(valorComissao)
          && valorComissao > 0
          && typeof DB.applyContaCorrenteMovement === 'function'
          && origemParceiro === 'SIM'
          && pagoParceiro === 'SIM';

        if (shouldCredit) {
          try {
            const target = await this._resolveComissaoCreditTarget(p, origemParceiro, pagoParceiro);
            if (!target.targetId) {
              creditInfo = { ok: false, msg: 'Parceiro não encontrado para crédito.' };
            } else {
              const previouslyCredited = await this._sumComissaoContaCreditada(p, target.targetId);
              const delta = Math.round((valorComissao - previouslyCredited) * 100) / 100;

              if (delta > 0) {
                const reason = `Baixa comissão — proposta ${proposalNumero} (${target.label})`;
                const res = await DB.applyContaCorrenteMovement(
                  target.targetId,
                  'credito_proposta',
                  delta,
                  reason,
                  sess?.id || 'admin',
                  proposalNumero
                );
                creditInfo = {
                  targetId: target.targetId,
                  label: target.label,
                  delta,
                  previouslyCredited,
                  newTotal: Math.round((previouslyCredited + delta) * 100) / 100,
                  ok: !!res?.ok,
                  balance: res?.balance ?? null,
                };
                op.conta_credito = creditInfo;
              }
            }
          } catch (creditErr) {
            creditInfo = { ok: false, msg: creditErr?.message || 'Falha no crédito' };
            op.conta_credito = creditInfo;
          }
        }

        if (creditInfo?.ok) {
          op.comissao_conta_creditada = creditInfo.newTotal;
          op.comissao_conta_creditada_para = creditInfo.targetId;
        }

        const obsLine = `[BAIXA COMISSÃO] ${typeof formatDateTime === 'function' ? formatDateTime(new Date()) : new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
        const obs = typeof DB._appendProposalObsLine === 'function'
          ? DB._appendProposalObsLine(p.obs, obsLine)
          : `${String(p.obs || '').trim()}\n${obsLine}`.trim();

        await saveOp(op);
        await patchProposalLean(p.id, { ...dados, obs });

        const updated = { ...p, ...dados, obs, updatedAt: new Date().toISOString() };
        this._baixaOpsByProposal = null;
        this._drawerProposal = updated;
        if (creditInfo?.ok) {
          showToast(`Baixa registrada. ${fmtMoney(creditInfo.delta)} creditado na conta corrente.`, 'success');
        } else if (creditInfo && !creditInfo.ok) {
          showToast('Baixa registrada, mas o crédito em conta corrente falhou.', 'warning');
        } else {
          showToast('Baixa de comissão registrada.', 'success');
        }
        if (prefix === 'fpd') {
          await this._renderDrawerTab('historico');
          if (window.Proposals?.renderAdminList) await Proposals.renderAdminList();
        } else {
          await this._renderHistorico();
        }
      } catch (e) {
        const msg = String(e?.message || e || '');
        if (/ATTACHMENTS_TOO_LARGE|PAYLOAD_TOO_LARGE/i.test(msg)) {
          showToast('Erro ao salvar: anexos da proposta estão grandes demais. Tente novamente.', 'error');
        } else {
          showToast(msg || 'Erro ao salvar.', 'error');
        }
      } finally {
        hideLoading();
      }
    },

    _coletarEvidencias(prefix = 'prej') {
      const urls = [];
      for (let i = 1; i <= 7; i++) {
        const u = document.getElementById(`${prefix}EvidUrl${i}`)?.value;
        if (u) urls.push({ slot: i, url: u });
      }
      return urls;
    },

    _resolvePropId(prefix) {
      if (['fpd', 'fpj', 'fdb'].includes(prefix)) {
        return this._drawerProposal?.id || document.getElementById(`${prefix}PropostaId`)?.value;
      }
      return document.getElementById(`${prefix}PropostaId`)?.value;
    },

    async salvarPrejuizo(prefix = 'prej') {
      const propId = this._resolvePropId(prefix);
      const status = document.getElementById(`${prefix}Status`)?.value;
      const descricao = document.getElementById(`${prefix}Descricao`)?.value?.trim();
      const responsavel = document.getElementById(`${prefix}Responsavel`)?.value?.trim();

      if (!propId) { showToast('Selecione uma proposta.', 'warning'); return; }
      if (!status) { showToast('Selecione o status (procedente/improcedente).', 'warning'); return; }
      if (!descricao) { showToast('Informe a descrição do erro.', 'warning'); return; }

      const p = await this._loadProposalById(propId);
      if (!p) { showToast('Proposta não encontrada.', 'error'); return; }

      const eq = this._equipeIds || await this._resolveEquipe(p);
      const valorProposta = proposalValor(p);
      let valorDebito = parseFloat(document.getElementById(`${prefix}ValorEstorno`)?.value);
      if (!Number.isFinite(valorDebito) || valorDebito <= 0) valorDebito = valorProposta;

      const evidencias = this._coletarEvidencias(prefix);
      const sess = Auth.getSession();
      const op = {
        id: DB._genId ? DB._genId('fpo') : 'fpo' + Date.now(),
        type: 'prejuizo',
        proposal_id: propId,
        proposal_numero: p.numero || p.id,
        valor_estorno: valorDebito,
        vendedor: document.getElementById(`${prefix}Vendedor`)?.value,
        supervisor: document.getElementById(`${prefix}Supervisor`)?.value,
        gerente: document.getElementById(`${prefix}Gerente`)?.value,
        sup_operacional: document.getElementById(`${prefix}SupOperacional`)?.value,
        backoffice: document.getElementById(`${prefix}Backoffice`)?.value,
        empresa: document.getElementById(`${prefix}Empresa`)?.value,
        responsavel_erro: responsavel,
        descricao_erro: descricao,
        evidencias,
        status,
        created_at: new Date().toISOString(),
        created_by: sess?.id || 'admin',
      };

      showLoading('Emitindo prejuízo...');
      try {
        const debits = [];
        if (status === 'IMPROCEDENTE') {
          const pct = Math.round(valorProposta * 0.05 * 100) / 100;
          const targets = [
            { id: eq.vendedorId, label: 'vendedor' },
            { id: eq.supervisorId, label: 'supervisor' },
            { id: eq.gerenteId, label: 'gerente' },
            { id: eq.supOperacionalId, label: 'sup_operacional' },
            { id: eq.backofficeId, label: 'backoffice' },
          ].filter((t) => t.id);
          for (const t of targets) {
            const reason = `Prejuízo IMPROCEDENTE (5%) — proposta ${p.numero || p.id} — ${t.label}`;
            const res = await DB.applyContaCorrenteMovement(
              t.id, 'debito_proposta', pct, reason, sess?.id || 'admin', p.numero || p.id
            );
            debits.push({ userId: t.id, role: t.label, valor: pct, ok: res?.ok });
          }
          op.debitos_improcedente = debits;
          op.valor_debito_pct = pct;
        } else {
          const reason = `Prejuízo PROCEDENTE — estorno proposta ${p.numero || p.id}`;
          if (eq.vendedorId) {
            const res = await DB.applyContaCorrenteMovement(
              eq.vendedorId, 'debito_proposta', valorDebito, reason, sess?.id || 'admin', p.numero || p.id
            );
            debits.push({ userId: eq.vendedorId, valor: valorDebito, ok: res?.ok });
          }
          op.debitos = debits;
        }

        const linhaObs = `[PREJUÍZO ${status}] ${descricao.slice(0, 120)}${status === 'IMPROCEDENTE' ? ` — 5% (${fmtMoney(op.valor_debito_pct)}) para todos` : ` — ${fmtMoney(valorDebito)}`}`;
        const obs = typeof DB._appendProposalObsLine === 'function'
          ? DB._appendProposalObsLine(p.obs, linhaObs)
          : `${String(p.obs || '').trim()}\n${linhaObs}`.trim();
        await saveOp(op);
        await patchProposalLean(p.id, { obs });
        const updated = { ...p, obs, updatedAt: new Date().toISOString() };
        this._prejuizoOpsByProposal = null;
        this._drawerProposal = updated;
        const okCount = (op.debitos_improcedente || op.debitos || []).filter((d) => d.ok).length;
        showToast(`Prejuízo registrado. ${okCount} débito(s) lançado(s).`, 'success');
        this._evidencias = [];
        if (['fpj'].includes(prefix)) {
          await this._renderDrawerTab('historico');
          if (window.Proposals?.renderAdminList) await Proposals.renderAdminList();
        } else {
          await this.mount();
        }
      } catch (e) {
        showToast(e.message || 'Erro ao emitir prejuízo.', 'error');
      } finally {
        hideLoading();
      }
    },

    async salvarDebitoParceiro(prefix = 'deb') {
      const propId = this._resolvePropId(prefix);
      if (!propId) { showToast('Selecione uma proposta.', 'warning'); return; }

      const valorEstorno = parseFloat(document.getElementById(`${prefix}ValorEstorno`)?.value);
      const custas = parseFloat(document.getElementById(`${prefix}Custas`)?.value) || 0;
      const valorIntegral = parseFloat(document.getElementById(`${prefix}ValorIntegral`)?.value);
      const parcelas = parseInt(document.getElementById(`${prefix}Parcelas`)?.value, 10) || 1;
      const parceiroNome = document.getElementById(`${prefix}Parceiro`)?.value?.trim();

      if (!Number.isFinite(valorEstorno) || valorEstorno <= 0) {
        showToast('Informe o valor do estorno.', 'warning');
        return;
      }
      if (!parceiroNome) { showToast('Informe o parceiro.', 'warning'); return; }

      const p = await this._loadProposalById(propId);
      if (!p) { showToast('Proposta não encontrada.', 'error'); return; }

      const totalDebito = valorEstorno + custas;
      const valorParcela = Math.round((totalDebito / parcelas) * 100) / 100;
      const sess = Auth.getSession();

      const users = await DB.getUsers().catch(() => []);
      const vendorId = p.vendorId || p.vendor_id || p.employee_id;
      const vendor = vendorId ? users.find((u) => u.id === vendorId) : null;
      const partnerId = vendor?.partner_root_id || (vendor?.role === 'parceiro' ? vendor.id : null);
      const partner = partnerId ? users.find((u) => u.id === partnerId) : null;

      const op = {
        id: DB._genId ? DB._genId('fpo') : 'fpo' + Date.now(),
        type: 'debitar_parceiro',
        proposal_id: propId,
        proposal_numero: p.numero || p.id,
        valor_estorno: valorEstorno,
        custas_judiciais: custas,
        valor_integral: Number.isFinite(valorIntegral) ? valorIntegral : null,
        parceiro: parceiroNome,
        parceiro_id: partner?.id || null,
        parcelas,
        valor_parcela: valorParcela,
        total_debito: totalDebito,
        created_at: new Date().toISOString(),
        created_by: sess?.id || 'admin',
      };

      showLoading('Debitando parceiro...');
      try {
        const debits = [];
        if (partner?.id) {
          for (let i = 1; i <= parcelas; i++) {
            const reason = `Débito parceiro (${i}/${parcelas}X) — estorno proposta ${p.numero || p.id}`;
            const res = await DB.applyContaCorrenteMovement(
              partner.id, 'debito_proposta', valorParcela, reason, sess?.id || 'admin', p.numero || p.id
            );
            debits.push({ parcela: i, valor: valorParcela, ok: res?.ok });
          }
        }
        op.debitos = debits;

        const linhaObs = `[DÉBITO PARCEIRO] ${parceiroNome} — ${parcelas}X de ${fmtMoney(valorParcela)} (estorno ${fmtMoney(valorEstorno)}${custas > 0 ? ` + custas ${fmtMoney(custas)}` : ''})`;
        const obs = typeof DB._appendProposalObsLine === 'function'
          ? DB._appendProposalObsLine(p.obs, linhaObs)
          : `${String(p.obs || '').trim()}\n${linhaObs}`.trim();
        await saveOp(op);
        await patchProposalLean(p.id, { obs });
        const updated = { ...p, obs, updatedAt: new Date().toISOString() };
        this._debitoOpsByProposal = null;
        this._drawerProposal = updated;
        const okCount = debits.filter((d) => d.ok).length;
        showToast(
          partner?.id
            ? `Débito registrado. ${okCount}/${parcelas} parcela(s) lançada(s).`
            : 'Registro salvo (parceiro não encontrado no cadastro — débito não lançado em conta).',
          partner?.id ? 'success' : 'warning'
        );
        if (['fdb'].includes(prefix)) {
          await this._renderDrawerTab('historico');
          if (window.Proposals?.renderAdminList) await Proposals.renderAdminList();
        } else {
          await this.mount();
        }
      } catch (e) {
        showToast(e.message || 'Erro ao debitar parceiro.', 'error');
      } finally {
        hideLoading();
      }
    },

    async _renderHistorico() {
      const map = {
        prejuizo: { id: 'prejHistorico', type: 'prejuizo', title: 'Últimos prejuízos emitidos' },
        debitar: { id: 'debHistorico', type: 'debitar_parceiro', title: 'Últimos débitos a parceiros' },
      };
      const cfg = map[this.tab];
      if (!cfg) return;
      const box = document.getElementById(cfg.id);
      if (!box) return;

      const rows = (await loadOps(cfg.type)).slice(0, 15);
      if (!rows.length) {
        box.innerHTML = '';
        return;
      }

      box.innerHTML = `<div class="card card-padded">
        <h3 style="font-weight:800;margin:0 0 12px;font-size:15px;">${esc(cfg.title)}</h3>
        <div class="table-wrap"><table class="data-table" style="width:100%;font-size:13px;">
          <thead><tr>
            <th>Data</th><th>Proposta</th><th>Detalhe</th>
          </tr></thead>
          <tbody>${rows.map((r) => {
            let det = '—';
            if (r.type === 'baixa_comissao') {
              const v = r.valor_comissao != null ? ` · Valor: ${fmtMoney(r.valor_comissao)}` : '';
              det = `Recebida: ${esc(r.comissao_recebida || '—')} · Apto: ${esc(r.apto_comissao || '—')}${v}`;
            } else if (r.type === 'prejuizo') {
              det = `${esc(r.status)} — ${esc(r.responsavel_erro || '—')} · ${fmtMoney(r.valor_estorno)}`;
            } else if (r.type === 'debitar_parceiro') {
              det = `${esc(r.parceiro)} · ${r.parcelas}X ${fmtMoney(r.valor_parcela)}`;
            }
            return `<tr>
              <td>${fmtDt(r.created_at)}</td>
              <td>${esc(r.proposal_numero || r.proposal_id)}</td>
              <td>${det}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>`;
    },

    /* ── Gestão integrada: drawer de proposta ─────────────────────── */

    _injectGestaoComissaoColumn() {
      if (!window.SOUBLU_FINANCEIRO_PAGE) return;
      const row = document.querySelector('#secManageProposals table.data-table thead tr');
      if (!row || row.querySelector('.fin-comissao-col')) return;
      const th = document.createElement('th');
      th.className = 'fin-comissao-col';
      th.textContent = 'Financeiro';
      const actions = row.lastElementChild;
      if (actions) row.insertBefore(th, actions);
    },

    _injectGestaoBanner() {
      if (!window.SOUBLU_FINANCEIRO_PAGE || !canView()) return;
      const sec = document.getElementById('secManageProposals');
      if (!sec || document.getElementById('finGestaoComissaoBanner')) return;
      const header = sec.querySelector('.page-header');
      if (!header) return;
      const banner = document.createElement('div');
      banner.id = 'finGestaoComissaoBanner';
      banner.className = 'fin-gestao-comissao-banner';
      banner.innerHTML = `<strong>Operações financeiras integradas</strong> — clique em uma proposta ou use os botões de ação para abrir o painel com abas <span style="opacity:.85;">Dados · Comissão · Prejuízo · Débito Parceiro · Histórico</span>.`;
      header.insertAdjacentElement('afterend', banner);
    },

    ensureDrawer() {
      if (document.getElementById('finPropDrawerOverlay')) return;
      const wrap = document.createElement('div');
      wrap.innerHTML = `<div class="fin-prop-drawer-overlay" id="finPropDrawerOverlay" onclick="FinPropostas.closeDrawer()">
        <aside class="fin-prop-drawer" onclick="event.stopPropagation()" role="dialog" aria-labelledby="finPropDrawerTitle">
          <header class="fin-prop-drawer__header">
            <div>
              <div class="fin-prop-drawer__eyebrow">Gestão de proposta</div>
              <h3 id="finPropDrawerTitle">—</h3>
            </div>
            <button type="button" class="btn btn-ghost btn-sm" onclick="FinPropostas.closeDrawer()" aria-label="Fechar">✕</button>
          </header>
          <nav class="fin-prop-drawer__tabs" id="finPropDrawerTabs"></nav>
          <div class="fin-prop-drawer__body" id="finPropDrawerBody"></div>
        </aside>
      </div>`;
      document.body.appendChild(wrap.firstElementChild);
    },

    async _loadBaixaOpsMap() {
      if (this._baixaOpsByProposal) return this._baixaOpsByProposal;
      const rows = await loadOps('baixa_comissao');
      const map = {};
      (rows || []).forEach((r) => {
        const pid = String(r.proposal_id || '');
        if (!pid) return;
        if (!map[pid]) map[pid] = r;
      });
      this._baixaOpsByProposal = map;
      return map;
    },

    async _loadPrejuizoOpsMap() {
      if (this._prejuizoOpsByProposal) return this._prejuizoOpsByProposal;
      const rows = await loadOps('prejuizo');
      const map = {};
      (rows || []).forEach((r) => {
        const pid = String(r.proposal_id || '');
        if (!pid) return;
        if (!map[pid]) map[pid] = r;
      });
      this._prejuizoOpsByProposal = map;
      return map;
    },

    async _loadDebitoOpsMap() {
      if (this._debitoOpsByProposal) return this._debitoOpsByProposal;
      const rows = await loadOps('debitar_parceiro');
      const map = {};
      (rows || []).forEach((r) => {
        const pid = String(r.proposal_id || '');
        if (!pid) return;
        if (!map[pid]) map[pid] = r;
      });
      this._debitoOpsByProposal = map;
      return map;
    },

    async _loadAllOpsMaps() {
      const [baixa, prejuizo, debito] = await Promise.all([
        this._loadBaixaOpsMap(),
        this._loadPrejuizoOpsMap(),
        this._loadDebitoOpsMap(),
      ]);
      return { baixa, prejuizo, debito };
    },

    async _getLastBaixaOp(proposalId) {
      const map = await this._loadBaixaOpsMap();
      return map[String(proposalId)] || null;
    },

    comissaoChipsHtml(proposal, lastOp) {
      const rec = proposal?.comissaoRecebida || proposal?.comissao_recebida || lastOp?.comissao_recebida;
      const apto = proposal?.comissaoElegivel || proposal?.comissao_elegivel || lastOp?.apto_comissao;
      const div = lastOp?.divergencia_tabela;
      const chips = [];
      if (rec === 'SIM') chips.push('<span class="fin-chip fin-chip--ok">Recebida</span>');
      else if (rec === 'NÃO') chips.push('<span class="fin-chip fin-chip--warn">Não recebida</span>');
      else chips.push('<span class="fin-chip fin-chip--muted">CMS pendente</span>');
      if (div === 'SIM') chips.push('<span class="fin-chip fin-chip--danger">Divergência</span>');
      if (apto === 'SIM') chips.push('<span class="fin-chip fin-chip--ok">Apto</span>');
      else if (apto === 'NÃO') chips.push('<span class="fin-chip fin-chip--warn">Não apto</span>');
      return chips.join('');
    },

    prejuizoChipsHtml(lastOp) {
      if (!lastOp) return '<span class="fin-chip fin-chip--muted">Prejuízo pendente</span>';
      if (lastOp.status === 'PROCEDENTE') return '<span class="fin-chip fin-chip--danger">Prejuízo procedente</span>';
      if (lastOp.status === 'IMPROCEDENTE') return '<span class="fin-chip fin-chip--warn">Prejuízo improcedente</span>';
      return '<span class="fin-chip fin-chip--muted">Prejuízo registrado</span>';
    },

    debitoChipsHtml(lastOp) {
      if (!lastOp) return '<span class="fin-chip fin-chip--muted">Débito pendente</span>';
      return '<span class="fin-chip fin-chip--danger">Parceiro debitado</span>';
    },

    operacaoChipsHtml(proposal, ops = {}) {
      const baixa = ops.baixa || ops.baixaMap?.[String(proposal?.id)];
      const prejuizo = ops.prejuizo || ops.prejuizoMap?.[String(proposal?.id)];
      const debito = ops.debito || ops.debitoMap?.[String(proposal?.id)];
      return `<div class="fin-comissao-chips">${this.comissaoChipsHtml(proposal, baixa)}${this.prejuizoChipsHtml(prejuizo)}${this.debitoChipsHtml(debito)}</div>`;
    },

    _drawerTabsHtml() {
      const tabs = [
        { id: 'dados', label: 'Dados' },
        { id: 'comissao', label: 'Comissão' },
        { id: 'prejuizo', label: 'Prejuízo colaborador' },
        { id: 'debito', label: 'Prejuízo parceiro' },
        { id: 'historico', label: 'Histórico' },
      ];
      return tabs.map((t) =>
        `<button type="button" class="fin-prop-drawer__tab${this._drawerTab === t.id ? ' is-active' : ''}" onclick="FinPropostas.switchDrawerTab('${t.id}')">${esc(t.label)}</button>`
      ).join('');
    },

    async openProposalDrawer(id, tab = 'comissao') {
      if (!canView()) return;
      if (this._drawerBusy) return;
      this._drawerBusy = true;
      this.ensureDrawer();
      showLoading('Carregando proposta...');
      try {
        const raw = (typeof DB.getProposal === 'function')
          ? await DB.getProposal(id, { lite: true })
          : await DB.getProposal(id);
        if (!raw) {
          showToast('Proposta não encontrada.', 'warning');
          return;
        }
        this._drawerProposal = raw;
        this._drawerTab = tab || 'comissao';
        this._drawerAptoOverride = false;
        const title = document.getElementById('finPropDrawerTitle');
        if (title) title.textContent = proposalLabel(raw);
        const tabs = document.getElementById('finPropDrawerTabs');
        if (tabs) tabs.innerHTML = this._drawerTabsHtml();
        await this._renderDrawerTab(this._drawerTab);
        document.getElementById('finPropDrawerOverlay')?.classList.add('open');
      } catch (e) {
        showToast(e.message || 'Erro ao abrir proposta.', 'error');
        if (typeof unlockUiOverlays === 'function') unlockUiOverlays();
      } finally {
        this._drawerBusy = false;
        hideLoading();
      }
    },

    closeDrawer() {
      document.getElementById('finPropDrawerOverlay')?.classList.remove('open');
      this._drawerProposal = null;
      this._drawerBusy = false;
      if (typeof hideLoading === 'function') hideLoading();
    },

    async switchDrawerTab(tab) {
      this._drawerTab = tab;
      const tabs = document.getElementById('finPropDrawerTabs');
      if (tabs) tabs.innerHTML = this._drawerTabsHtml();
      await this._renderDrawerTab(tab);
    },

    async _renderDrawerTab(tab) {
      const body = document.getElementById('finPropDrawerBody');
      const p = this._drawerProposal;
      if (!body || !p) return;

      if (tab === 'dados') {
        const fmtR = (v) => fmtMoney(v);
        const maps = await this._loadAllOpsMaps();
        body.innerHTML = `<div class="card card-padded" style="background:var(--color-surface-2);">
          ${this.operacaoChipsHtml(p, { baixa: maps.baixa[String(p.id)], prejuizo: maps.prejuizo[String(p.id)], debito: maps.debito[String(p.id)] })}
          <p style="margin:12px 0 10px;font-size:14px;line-height:1.6;">
            <strong>Cliente:</strong> ${esc(p.client_name || p.clientName)} · ${esc(p.client_cpf || p.clientCpf || '')}<br>
            <strong>Vendedor:</strong> ${esc(p.vendor_name || p.vendorName || '—')}<br>
            <strong>Produto:</strong> ${esc(p.product || '—')} / ${esc(p.convenio || '—')}<br>
            <strong>Valor:</strong> ${fmtR(proposalValor(p))} · <strong>Status:</strong> ${esc(p.status || p.statusOp || '—')}
          </p>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
            <button type="button" class="btn btn-primary btn-sm" onclick="Proposals.openAdminModal('${esc(p.id)}')">Editar proposta completa</button>
            <button type="button" class="btn btn-outline btn-sm" onclick="FinPropostas.switchDrawerTab('comissao')">Comissão</button>
            <button type="button" class="btn btn-outline btn-sm" onclick="FinPropostas.switchDrawerTab('prejuizo')">Prejuízo</button>
            <button type="button" class="btn btn-outline btn-sm" onclick="FinPropostas.switchDrawerTab('debito')">Débito Parceiro</button>
          </div>
        </div>`;
        return;
      }

      if (tab === 'comissao') {
        const lastBaixa = await this._getLastBaixaOp(p.id);
        body.innerHTML = `${this.operacaoChipsHtml(p, { baixa: lastBaixa })}
          ${this._renderComissaoForm('fpd', { embedded: true, proposal: p })}`;
        await this._preencherBaixaComissao(p, 'fpd');
        return;
      }

      if (tab === 'prejuizo') {
        const lastPrej = (await this._loadPrejuizoOpsMap())[String(p.id)];
        body.innerHTML = `${lastPrej ? this.prejuizoChipsHtml(lastPrej) : ''}
          ${this._renderPrejuizo('fpj', { embedded: true, proposal: p })}`;
        await this._preencherEquipePrejuizo(p, 'fpj');
        return;
      }

      if (tab === 'debito') {
        const lastDeb = (await this._loadDebitoOpsMap())[String(p.id)];
        body.innerHTML = `${lastDeb ? this.debitoChipsHtml(lastDeb) : ''}
          ${this._renderDebitar('fdb', { embedded: true, proposal: p })}`;
        await this._preencherParceiroDebito(p, 'fdb');
        return;
      }

      if (tab === 'historico') {
        const allOps = (await loadOps()).filter((r) => String(r.proposal_id) === String(p.id));
        const sorted = allOps.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const opsHtml = sorted.length
          ? sorted.map((r) => {
            let det = '—';
            if (r.type === 'baixa_comissao') {
              const v = r.valor_comissao != null ? ` · Valor: ${fmtMoney(r.valor_comissao)}` : '';
              det = `Recebida: ${esc(r.comissao_recebida || '—')} · Divergência: ${esc(r.divergencia_tabela || '—')} · Apto: ${esc(r.apto_comissao || '—')}${v}`;
            } else if (r.type === 'prejuizo') {
              det = `${esc(r.status)} — ${esc(r.responsavel_erro || '—')} · ${fmtMoney(r.valor_estorno)}`;
            } else if (r.type === 'debitar_parceiro') {
              det = `${esc(r.parceiro)} · ${r.parcelas}X ${fmtMoney(r.valor_parcela)}`;
            }
            const tipo = r.type === 'baixa_comissao' ? 'Baixa comissão'
              : r.type === 'prejuizo' ? 'Prejuízo' : 'Débito parceiro';
            return `<div class="fin-hist-item"><div class="fin-hist-item__meta"><strong>${tipo}</strong><span>${fmtDt(r.created_at)}</span></div><div>${det}</div></div>`;
          }).join('')
          : '<p class="text-muted" style="font-size:13px;">Nenhuma operação financeira registrada.</p>';

        let histHtml = '';
        if (p.history?.length) {
          p.history.slice().reverse().forEach((h) => {
            histHtml += `<div class="fin-hist-item"><div class="fin-hist-item__meta"><strong>${esc(h.actorName || '—')}</strong><span>${fmtDt(h.date)}</span></div><div>${esc(h.action || '')}</div>${h.note ? `<div class="fin-hist-item__note">${esc(h.note)}</div>` : ''}</div>`;
          });
        }
        body.innerHTML = `<h4 style="font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:.04em;margin:0 0 10px;">Operações financeiras</h4>${opsHtml}
          <h4 style="font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:.04em;margin:20px 0 10px;">Histórico operacional</h4>
          ${histHtml || '<p class="text-muted" style="font-size:13px;">Sem registros.</p>'}`;
      }
    },
  };

  window.FinPropostas = FinPropostas;
})();
