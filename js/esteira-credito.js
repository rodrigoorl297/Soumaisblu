/* SOU+BLU — Esteira Proposta de Crédito (workflow completo) */
(function () {
  'use strict';

  const ESTEIRA_ANEXOS = [
    { key: 'termo_divida_gov', label: 'ENVIAR TERMO CONFISSÃO DE DÍVIDA' },
    { key: 'termo_cessao_gov', label: 'ENVIAR TERMO DE CESSÃO DE CRÉDITO' },
  ];

  const PIX_AUTOMATICO_FIXO = 'PIX automático';

  function _ecPixAutoFieldHtml() {
    return `<input type="text" class="form-control" value="${esc(PIX_AUTOMATICO_FIXO)}" readonly style="background:#f9fafb;font-weight:600;"/>
      <input type="hidden" id="ecFormaPagamento" value="${esc(PIX_AUTOMATICO_FIXO)}"/>`;
  }

  const EC_STATUS_OPCOES = [
    'EM ANÁLISE',
    'AGUARDANDO DOCUMENTAÇÃO',
    'APROVADO AG. PAGAMENTO',
    'PAGO',
    'REPROVADO',
  ];

  function _ecStatusSelectHtml(id, selected) {
    const opts = ['<option value="">Selecione o status...</option>']
      .concat(EC_STATUS_OPCOES.map((s) =>
        `<option value="${esc(s)}"${String(selected || '') === s ? ' selected' : ''}>${esc(s)}</option>`));
    return `<select id="${id}" class="form-control">${opts.join('')}</select>`;
  }

  function _ecStatusBadgeClass(status) {
    const s = String(status || '').toUpperCase();
    if (s === 'PAGO') return 'ec-status-aprovado';
    if (s === 'REPROVADO') return 'ec-status-recusado';
    if (s.includes('APROVADO')) return 'ec-status-aprovado';
    return 'ec-status-pendente';
  }

  let _esteiraPending = {};
  let _esteiraUrls = {};
  let _currentProposalId = null;

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function digits(v) {
    return String(v ?? '').replace(/\D/g, '');
  }

  function fmtMoney(v) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return '—';
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }

  function fmtCpf(v) {
    const d = digits(v).slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  function fmtDt(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR'); } catch { return '—'; }
  }

  function _ecDbgLog(location, message, data, hypothesisId) {
    const payload = {
      sessionId: '97c411',
      location,
      message,
      data: data || {},
      timestamp: Date.now(),
      hypothesisId: hypothesisId || 'calc-parcela',
      runId: 'calc-fix-v2',
    };
    fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '97c411' },
      body: JSON.stringify(payload),
    }).catch(() => {});
    const cfg = window.SOUBLU_CONFIG || {};
    const base = String(cfg.API_BASE_URL || cfg.SITE_URL || location.origin || '').replace(/\/+$/, '');
    const key = cfg.API_KEY || '';
    if (!base || !key) return;
    fetch(`${base}/api/credito_api.php?action=client_log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  function gerarProtocolo() {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const seq = String(Math.floor(1000 + Math.random() * 9000));
    return `PC-${ymd}-${seq}`;
  }

  function canView() {
    const s = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    if (!s || window.PARTNER_ROOT_ID) return false;
    return ['master', 'fundador', 'gerente', 'financeiro', 'financial', 'rh', 'diretoria'].includes(String(s.role || '').toLowerCase());
  }

  function isCreditoProposal(p) {
    if (!p) return false;
    // Somente solicitações da tabela dedicada credit_proposals (empréstimo interno ao funcionário).
    if (window.CreditoPropostasApi?.isCreditTableRow?.(p)) return true;
    const m = p.meta && typeof p.meta === 'object' ? p.meta : {};
    return m.credit_table === 'credit_proposals';
  }

  function proposalLabel(p) {
    const num = p.protocolo || p.numero || p.id || '—';
    const func = p.client_name || p.clientName || p.nome || 'Funcionário';
    const vend = p.vendor_name || p.vendorName || p.employee_name || '';
    return `${num} · ${func}${vend && vend !== func ? ` · solicitante: ${vend}` : ''}`;
  }

  function parseEsteira(p) {
    const raw = p?.creditoEsteira || p?.credito_esteira || {};
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return {}; }
    }
    return raw && typeof raw === 'object' ? raw : {};
  }

  function parseRetorno(p) {
    const raw = p?.creditoRetorno || p?.credito_retorno || {};
    let ret;
    if (typeof raw === 'string') {
      try { ret = JSON.parse(raw) || {}; } catch { ret = {}; }
    } else {
      ret = raw && typeof raw === 'object' ? { ...raw } : {};
    }
    const hasNested = ret.attachments && typeof ret.attachments === 'object'
      && Object.keys(ret.attachments).some((k) => !k.endsWith('_nome') && ret.attachments[k]);
    if (!hasNested && typeof DB !== 'undefined' && DB._extractRetornoAttachmentsFromTopLevel) {
      const fromTop = DB._extractRetornoAttachmentsFromTopLevel(p?.attachments);
      if (Object.keys(fromTop).length) {
        ret.attachments = { ...fromTop, ...(ret.attachments || {}) };
      }
    } else if (!hasNested && p?.attachments) {
      let att = p.attachments;
      if (typeof att === 'string') {
        try { att = JSON.parse(att); } catch { att = {}; }
      }
      if (att && typeof att === 'object') {
        const fromTop = {};
        Object.keys(att).forEach((k) => {
          if (!k.startsWith('retorno_')) return;
          const short = k.slice('retorno_'.length);
          if (short) fromTop[short] = att[k];
        });
        if (Object.keys(fromTop).length) {
          ret.attachments = { ...fromTop, ...(ret.attachments || {}) };
        }
      }
    }
    return ret;
  }

  function proposalCpf(p) {
    const m = p?.meta && typeof p.meta === 'object' ? p.meta : {};
    return digits(p?.cpf || p?.clientCpf || p?.client_cpf || m.cpf_funcionario || '');
  }

  async function resolveCreditBeneficiaryId(p) {
    const m = p?.meta && typeof p.meta === 'object' ? p.meta : {};
    if (m.beneficiary_user_id) return String(m.beneficiary_user_id);
    const cpf = proposalCpf(p);
    if (cpf.length === 11 && typeof DB !== 'undefined' && typeof DB.getUserByCpf === 'function') {
      const emp = await DB.getUserByCpf(cpf);
      if (emp?.id) return String(emp.id);
    }
    const fallback = p.employee_id || p.vendorId || p.vendor_id;
    return fallback ? String(fallback) : null;
  }

  function blackBar(title) {
    return `<div class="ec-black-bar">${esc(title)}</div>`;
  }

  function finGridRow(label, fieldHtml) {
    return `<tr>
      <th class="ec-grid-th">${esc(label)}</th>
      <td class="ec-grid-td">${fieldHtml}</td>
    </tr>`;
  }

  function _parseParcelasValores(est, ret) {
    const raw = est?.parcelas_valores ?? ret?.parcelas_valores;
    if (Array.isArray(raw) && raw.length) {
      return raw.map((v) => parseFloat(v)).filter((n) => Number.isFinite(n));
    }
    const vp = parseFloat(est?.valor_parcela ?? ret?.valor_parcela);
    const n = parseInt(est?.parcelas_meses ?? est?.parcelas ?? '', 10);
    if (Number.isFinite(vp) && vp > 0 && Number.isFinite(n) && n > 0) {
      return Array(n).fill(vp);
    }
    return [];
  }

  function _sumParcelasInputs(containerId) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return 0;
    let sum = 0;
    wrap.querySelectorAll('.ec-parcela-input').forEach((el) => {
      const n = parseFloat(el.value);
      if (Number.isFinite(n)) sum += n;
    });
    return Math.round(sum * 100) / 100;
  }

  function _renderParcelasInputsHtml(containerId, count, values = []) {
    const n = Math.max(0, Math.min(12, parseInt(count, 10) || 0));
    if (!n) {
      return '<p class="text-muted" style="margin:0;font-size:13px;">Selecione o número de parcelas acima.</p>';
    }
    return Array.from({ length: n }, (_, i) => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="font-size:12px;font-weight:700;min-width:72px;color:var(--color-text-muted);">Parcela ${i + 1}</span>
        <input type="number" class="form-control ec-parcela-input" data-idx="${i}" min="0" step="0.01"
          placeholder="0,00" value="${values[i] != null && values[i] !== '' ? esc(String(values[i])) : ''}"
          style="max-width:200px;" oninput="EsteiraCredito.onParcelaInputChange()"/>
      </div>`).join('');
  }

  function _injectStyles() {
    if (document.getElementById('ec-styles')) return;
    const st = document.createElement('style');
    st.id = 'ec-styles';
    st.textContent = `
.ec-wrap { border: 1px solid var(--color-border, #e5e7eb); border-radius: var(--radius-md, 8px); overflow: hidden; background: #fff; }
.ec-black-bar { background: #111; color: #fff; padding: 10px 16px; font-family: var(--font-display, 'Nunito', sans-serif); font-weight: 800; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; text-align: center; }
.ec-body { padding: 16px 20px 20px; }
.ec-grid-th { width: 34%; text-align: left; padding: 10px 12px; background: var(--color-surface-2, #f3f4f6); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; white-space: nowrap; border-bottom: 1px solid var(--color-border, #e5e7eb); vertical-align: middle; }
.ec-grid-td { padding: 8px 12px; border-bottom: 1px solid var(--color-border, #e5e7eb); vertical-align: middle; }
.ec-section-label { font-weight: 800; margin: 20px 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-text-muted); }
.ec-api-box { margin-top: 8px; padding: 10px 12px; background: var(--color-surface-2); border-radius: 6px; font-size: 13px; min-height: 20px; }
.ec-note { margin: 12px 0; padding: 10px 12px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px; font-size: 12px; color: #92400e; }
.ec-review-text { margin: 0 0 14px; font-size: 13px; color: var(--color-text-muted); line-height: 1.5; }
.ec-status-badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: .03em; }
.ec-status-aprovado { background: #d1fae5; color: #065f46; }
.ec-status-recusado { background: #fee2e2; color: #991b1b; }
.ec-status-pendente { background: #e5e7eb; color: #374151; }
`;
    document.head.appendChild(st);
  }

  function _fmtConsultaRows(raw) {
    if (raw && typeof raw === 'object' && (raw.rh || raw.score)) {
      return [];
    }
    const d = raw?.data ?? raw?.retorno ?? raw?.resultado ?? raw;
    if (!d || typeof d !== 'object') return [];
    const rows = [];
    const push = (l, v) => { if (v != null && v !== '') rows.push([l, String(v)]); };
    push('Nome', d.nome || d.name);
    push('Score', d.score || d.scoreCredito || d.pontuacao);
    push('Classificação', d.classificacao || d.rating || d.faixa || d.risco);
    push('Resultado', d.resultado || d.parecer || d.situacao || d.status);
    push('Certidão', d.certidao_negativa || d.certidao_positiva || d.tipo_certidao);
    push('Protocolo', d.protocolo || d.numero || d.codigoControle);
    if (Array.isArray(d.processos) && d.processos.length) {
      push('Processos', `${d.processos.length} registro(s)`);
    }
    return rows;
  }

  function _fmtAnaliseCreditoHtml(bundle) {
    if (!bundle || typeof bundle !== 'object') return '';
    if (!bundle.rh && !bundle.score) {
      return _fmtConsultaHtml(bundle, 'Análise de crédito');
    }
    const lines = [];
    if (bundle.rh?.ok && typeof FonteData !== 'undefined' && FonteData.formatRhConsultaSummary) {
      const rhHtml = FonteData.formatRhConsultaSummary(bundle.rh);
      if (rhHtml) lines.push(rhHtml);
    } else if (bundle.rh && !bundle.rh.ok) {
      lines.push(`<span style="color:#b45309;">Cadastro/RH: ${esc(bundle.rh.error || 'indisponível')}</span>`);
    }
    const sc = bundle.score;
    if (sc?.ok && sc.score) {
      const s = sc.score;
      lines.push(`<strong>Score Quod:</strong> ${esc(s.score || '—')}${s.classificacao ? ` · ${esc(s.classificacao)}` : ''}`);
      if (s.situacao) lines.push(`Situação: ${esc(s.situacao)}`);
      if (s.mensagem) lines.push(esc(s.mensagem));
    } else if (sc && !sc.ok && sc.error) {
      lines.push(`<span style="color:#b45309;">Score Quod: ${esc(sc.error)}</span>`);
    }
    if (!lines.length && (bundle.nome || bundle.name)) {
      lines.push(`<strong>Nome:</strong> ${esc(bundle.nome || bundle.name)}`);
      lines.push(`<span style="color:#b45309;">Dados limitados — clique em CONSULTAR ANÁLISE CRÉDITO para atualizar.</span>`);
    }
    if (!lines.length) {
      return _fmtConsultaHtml(bundle, 'Análise de crédito');
    }
    return `<div class="ec-api-box"><strong>Análise de crédito</strong>
      <div style="margin-top:8px;font-size:13px;line-height:1.5;">${lines.join('<br/>')}</div></div>`;
  }

  function _fmtConsultaHtml(raw, title) {
    const rows = _fmtConsultaRows(raw);
    if (!rows.length) {
      return `<div class="ec-api-box"><strong>${esc(title)}</strong><p class="text-muted" style="margin:6px 0 0;">Consulta realizada — verifique os dados na resposta da API.</p></div>`;
    }
    const body = rows.map(([l, v]) =>
      `<tr><td style="padding:4px 10px 4px 0;color:var(--color-text-muted);white-space:nowrap;">${esc(l)}</td>
       <td style="padding:4px 0;font-weight:600;">${esc(v)}</td></tr>`
    ).join('');
    return `<div class="ec-api-box"><strong>${esc(title)}</strong>
      <table style="width:100%;margin-top:8px;font-size:13px;">${body}</table></div>`;
  }

  function _resetEsteiraAnexos(urls = {}) {
    _esteiraPending = {};
    _esteiraUrls = { ...urls };
    ESTEIRA_ANEXOS.forEach(({ key }) => {
      const input = document.getElementById(`ec_anexo_${key}`);
      if (input) input.value = '';
      _setAnexoStatus(key, _esteiraUrls[key] ? 'Arquivo disponível no Retorno de Propostas' : 'Nenhum arquivo');
    });
    const promStatus = document.getElementById('ec_promissoria_status');
    if (promStatus) {
      const promUrl = _esteiraUrls.promissoria;
      const promNome = _esteiraUrls.promissoria_nome || 'nota_promissoria.txt';
      promStatus.innerHTML = promUrl
        ? `Nota gerada — <a href="${esc(promUrl)}" target="_blank" rel="noopener" download="${esc(promNome)}">⬇ Baixar nota promissória</a> · também em Retorno de Propostas`
        : 'Nenhuma nota gerada';
    }
  }

  function _setAnexoStatus(key, label) {
    const el = document.getElementById(`ec_anexo_${key}_status`);
    if (el) el.textContent = label || 'Nenhum arquivo';
  }

  async function _uploadEsteiraAnexos(proposalId) {
    const out = { ..._esteiraUrls };
    for (const { key } of ESTEIRA_ANEXOS) {
      const file = _esteiraPending[key];
      if (!file) continue;
      try {
        const uploaded = await DB.uploadProposalFile(file, proposalId, `retorno_${key}`);
        const url = typeof DB.resolveUploadUrl === 'function' ? DB.resolveUploadUrl(uploaded) : (uploaded?.url || uploaded);
        if (url) out[key] = url;
      } catch (e) {
        console.warn('[EsteiraCredito] anexo', key, e);
        if (typeof fileToBase64 === 'function') out[key] = await fileToBase64(file);
      }
      if (file.name) out[`${key}_nome`] = file.name;
    }
    return out;
  }

  async function _saveProposal(updated) {
    if (window.CreditoPropostasApi?.isCreditTableRow?.(updated)) {
      await CreditoPropostasApi.update(
        updated.id,
        CreditoPropostasApi.proposalToUpdateRow(updated)
      );
      return;
    }
    if (typeof DB.saveProposal === 'function') await DB.saveProposal(updated);
    else await DB.save('proposals', updated);
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
      _injectStyles();
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
      <p class="text-muted" style="font-size:13px;margin:0 0 14px;">Selecione uma proposta existente. O protocolo será gerado automaticamente ao entrar na esteira.</p>
      <div class="form-group">
        <label>Proposta</label>
        <select id="esteiraAddProposal" class="form-control"><option value="">Carregando...</option></select>
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
      const tab = this.tab || 'propostas';
      return `<div class="esteira-credito-toolbar" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;align-items:center;">
        <button type="button" class="btn ${tab === 'solicitar' ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="EsteiraCredito.openSolicitarPanel()">Nova solicitação</button>
        <button type="button" class="btn ${tab === 'propostas' ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="EsteiraCredito.openPropostasPanel()">Esteira</button>
        <button type="button" class="btn ${tab === 'ccb' ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="EsteiraCredito.openCcbPanel()">Emitir CCB</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="FinanceiroBoot.openSection('secRetornoPropostas')">Retorno de Propostas</button>
      </div>`;
    },

    _renderPropostasShell() {
      return `<div class="ec-wrap">
        ${blackBar('ESTEIRA DE CRÉDITO — EMPRÉSTIMO AO FUNCIONÁRIO')}
        ${blackBar('SOLICITAÇÕES VIA PAINEL DO FUNCIONÁRIO · PROTOCOLO AUTOMÁTICO')}
        <div class="ec-body">
          ${this._toolbarHtml()}
          <div id="esteiraCreditoWorkflow">Carregando...</div>
        </div>
      </div>`;
    },

    _renderCcbShell() {
      return `<div id="cprAdminSection" class="ec-wrap">
        ${blackBar('Emitir CCB')}
        <div class="ec-body">
          <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;align-items:center;margin-bottom:16px;">
            <p class="text-muted" style="margin:0;font-size:14px;">Registre a emissão de Cédula de Crédito Bancário para solicitações de empréstimo interno (funcionários).</p>
            <button type="button" class="btn btn-ghost btn-sm" onclick="EsteiraCredito.openPropostasPanel()">← Voltar à esteira</button>
          </div>
          ${this._toolbarHtml()}
          <div class="table-wrap" style="margin-bottom:16px;">
            <table class="data-table" style="width:100%;">
              <tbody>
                ${finGridRow('PROPOSTA NA ESTEIRA', `<select id="ccbProposalSelect" class="form-control"><option value="">Carregando...</option></select>`)}
                ${finGridRow('PARCELAS', `<input type="number" id="ccbParcelas" class="form-control" min="1" max="12" step="1" placeholder="Ex.: 4" onchange="EsteiraCredito.onCcbParcelasChange()"/>`)}
                ${finGridRow('VALORES DAS PARCELAS', `<div id="ccbParcelasWrap"></div>`)}
                ${finGridRow('VALOR DO CRÉDITO (R$)', `<input type="number" id="ccbValor" class="form-control" min="0" step="0.01" placeholder="0,00" readonly style="background:#f9fafb;font-weight:700;"/>`)}
                ${finGridRow('OBSERVAÇÕES DA EMISSÃO', `<textarea id="ccbObs" class="form-control" rows="3" placeholder="Dados complementares do CCB (opcional)"></textarea>`)}
              </tbody>
            </table>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
            <button type="button" class="btn btn-primary" onclick="EsteiraCredito.emitCcb()">Emitir CCB</button>
          </div>
          <div id="ccbEmitResult" style="margin-top:16px;"></div>
        </div>
      </div>`;
    },

    _renderSolicitarShell() {
      return `<div>
        ${this._toolbarHtml()}
        <div id="propostaCreditoRoot"></div>
      </div>`;
    },

    _workflowHtml(credito) {
      const options = (credito || []).map((p) =>
        `<option value="${esc(p.id)}">${esc(proposalLabel(p))}</option>`
      ).join('');
      return `
        <div class="table-wrap" style="margin-bottom:16px;">
          <table class="data-table" style="width:100%;">
            <tbody>
                ${finGridRow('PROPOSTA', `<select id="ecProposalSelect" class="form-control" onchange="EsteiraCredito.onProposalChange()">
                <option value="">Selecione a solicitação de crédito...</option>
                ${options}
              </select>`)}
              ${finGridRow('PROTOCOLO', `<input type="text" id="ecProtocolo" class="form-control text-center" readonly style="font-weight:800;background:#f3f4f6;letter-spacing:.04em;max-width:320px;"/>`)}
              ${finGridRow('CPF', `<input type="text" id="ecCpf" class="form-control mask-cpf" placeholder="000.000.000-00" readonly style="background:#f9fafb;"/>`)}
              ${finGridRow('VALOR SOLICITADO', `<input type="number" id="ecValorSolicitado" class="form-control" min="0" step="0.01" placeholder="0,00"/>`)}
              ${finGridRow('VALOR APROVADO', `<input type="number" id="ecValorAprovado" class="form-control" min="0" step="0.01" placeholder="0,00"/>`)}
              ${finGridRow('Nº PARCELAS', `<select id="ecParcelas" class="form-control" onchange="EsteiraCredito.onParcelasChange()">
                <option value="">Selecione (2, 3 ou 4 meses)...</option>
                <option value="2">2 meses</option>
                <option value="3">3 meses</option>
                <option value="4">4 meses</option>
              </select>`)}
              ${finGridRow('FORMA DE PAGAMENTO — PIX AUTOMÁTICO', _ecPixAutoFieldHtml())}
              ${finGridRow('VALOR PARCELA', `<input type="number" id="ecValorParcela" class="form-control" min="0" step="0.01" placeholder="0,00" oninput="EsteiraCredito.onValorParcelaChange()"/>`)}
              ${finGridRow('VALOR FINAL', `<input type="number" id="ecValorFinal" class="form-control" min="0" step="0.01" placeholder="0,00" readonly style="background:#f9fafb;font-weight:700;"/>`)}
              ${finGridRow('STATUS DA PROPOSTA', `${_ecStatusSelectHtml('ecStatusCredito', 'EM ANÁLISE')}<div id="ecStatusBadge" style="margin-top:8px;"></div>`)}
            </tbody>
          </table>
        </div>

        <div class="ec-section-label">Consultas</div>
        <div class="table-wrap" style="margin-bottom:16px;">
          <table class="data-table" style="width:100%;">
            <tbody>
              ${finGridRow('ANÁLISE CRÉDITO', `<button type="button" class="btn btn-accent btn-sm" onclick="EsteiraCredito.apiAnaliseCredito()">CONSULTAR ANÁLISE CRÉDITO</button>
                <div id="ecApiAnaliseResult" class="ec-api-box text-muted">Aguardando consulta...</div>`)}
              ${finGridRow('CERTIDÃO NEGATIVA CIVIL', `<button type="button" class="btn btn-accent btn-sm" onclick="EsteiraCredito.apiCertidaoCivil()">CONSULTAR CERTIDÃO CIVIL</button>
                <div id="ecApiCertidaoResult" class="ec-api-box text-muted">Aguardando consulta...</div>`)}
            </tbody>
          </table>
        </div>

        <div class="ec-section-label">Documentos</div>
        <div class="table-wrap" style="margin-bottom:12px;">
          <table class="data-table" style="width:100%;">
            <tbody>
              ${ESTEIRA_ANEXOS.map(({ key, label }) => `
              <tr>
                <th class="ec-grid-th">${esc(label)}</th>
                <td class="ec-grid-td">
                  <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
                    <input type="file" id="ec_anexo_${key}" class="form-control" style="max-width:280px;" accept=".pdf,.jpg,.jpeg,.png,.webp"
                      onchange="EsteiraCredito.onAnexoPick('${key}', this)"/>
                    <span id="ec_anexo_${key}_status" class="text-muted" style="font-size:12px;">Nenhum arquivo</span>
                  </div>
                </td>
              </tr>`).join('')}
              ${finGridRow('Nº NOTA PROMISSÓRIA', `<input type="text" id="ecNumPromissoria" class="form-control" placeholder="Ex.: NP-2026-0001"/>`)}
              ${finGridRow('DATA DO DESCONTO', `<input type="date" id="ecDataDesconto" class="form-control"/>`)}
            </tbody>
          </table>
        </div>
        <p class="ec-note"><strong>Obs:</strong> FICAR RETORNO DE PROPOSTAS PARA DOWNLOAD — documentos enviados e nota promissória gerada ficam disponíveis em Retorno de Propostas.</p>
        <div id="ecPixAutoHost"></div>
        <div style="margin-bottom:20px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
          <button type="button" class="btn btn-outline" onclick="EsteiraCredito.gerarNotaPromissoria()">GERAR NOTA PROMISSÓRIA</button>
          <button type="button" class="btn btn-accent" onclick="EsteiraCredito.enviarNotaPromissoriaAssinatura()">ENVIAR NOTA PROMISSÓRIA PARA ASSINATURA</button>
          <span id="ec_promissoria_status" class="text-muted" style="font-size:12px;">Nenhuma nota gerada</span>
        </div>

        <div style="display:flex;justify-content:flex-end;margin-bottom:24px;">
          <button type="button" class="btn btn-primary" onclick="EsteiraCredito.salvarDados()">Salvar dados da esteira</button>
        </div>

        <div id="esteiraCreditoLista" style="margin-top:28px;"></div>`;
    },

    async mount(rootId = 'esteiraCreditoRoot') {
      const root = document.getElementById(rootId);
      if (!root || !canView()) return;
      _injectStyles();
      this._ensureModal();
      if (this.tab === 'solicitar') {
        root.innerHTML = this._renderSolicitarShell();
        if (window.PropostaCredito?.renderFinanceiro) PropostaCredito.renderFinanceiro('propostaCreditoRoot');
        return;
      }
      root.innerHTML = this.tab === 'ccb' ? this._renderCcbShell() : this._renderPropostasShell();
      await this._ensureComissaoSchema();
      if (this.tab === 'ccb') {
        await this._populateCcbSelect();
        return;
      }
      await this.renderWorkflow();
    },

    openSolicitarPanel() {
      this.tab = 'solicitar';
      if (window.FinanceiroBoot?.openSection) FinanceiroBoot.openSection('secEsteiraCredito', 'solicitar');
      else this.mount();
    },

    openPropostasPanel() {
      this.tab = 'propostas';
      if (window.FinanceiroBoot?.openSection) FinanceiroBoot.openSection('secEsteiraCredito', '');
      else this.mount();
    },

    openCcbPanel() {
      this.tab = 'ccb';
      if (window.FinanceiroBoot?.openSection) FinanceiroBoot.openSection('secEsteiraCredito', 'ccb');
      else this.mount();
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
      if (!window.CreditoPropostasApi?.list) {
        // #region agent log
        fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'97c411'},body:JSON.stringify({sessionId:'97c411',location:'esteira-credito.js:_loadProposals',message:'CreditoPropostasApi missing',data:{},timestamp:Date.now(),hypothesisId:'H1',runId:'esteira-sep'})}).catch(()=>{});
        // #endregion
        return [];
      }
      try {
        const creditRows = await CreditoPropostasApi.list();
        const rows = Array.isArray(creditRows) ? creditRows.filter(isCreditoProposal) : [];
        // #region agent log
        fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'97c411'},body:JSON.stringify({sessionId:'97c411',location:'esteira-credito.js:_loadProposals',message:'loaded credit_proposals only',data:{count:rows.length,sampleIds:rows.slice(0,3).map((p)=>p.id)},timestamp:Date.now(),hypothesisId:'H1,H2',runId:'esteira-sep'})}).catch(()=>{});
        // #endregion
        return rows;
      } catch (e) {
        console.warn('[EsteiraCredito] credit_proposals:', e.message || e);
        // #region agent log
        fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'97c411'},body:JSON.stringify({sessionId:'97c411',location:'esteira-credito.js:_loadProposals:fail',message:'credit list failed',data:{error:String(e&&e.message||e)},timestamp:Date.now(),hypothesisId:'H3',runId:'esteira-sep'})}).catch(()=>{});
        // #endregion
        return [];
      }
    },

    async renderWorkflow() {
      const wrap = document.getElementById('esteiraCreditoWorkflow');
      if (!wrap) return;
      const props = await this._loadProposals();
      const credito = (props || []).filter(isCreditoProposal);
      if (!credito.length) {
        wrap.innerHTML = `<div class="text-center" style="padding:28px 16px;">
          <p class="text-muted" style="margin:0 0 8px;">Nenhuma solicitação de empréstimo na esteira.</p>
          <p class="text-muted" style="margin:0 0 16px;font-size:13px;">O funcionário solicita pelo painel <strong>Solicitar proposta crédito</strong>. Propostas comerciais (PROP-) não entram nesta esteira.</p>
          <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
            <button type="button" class="btn btn-primary btn-sm" onclick="EsteiraCredito.openSolicitarPanel()">Solicitar empréstimo (financeiro)</button>
          </div>
        </div>`;
        return;
      }
      wrap.innerHTML = this._workflowHtml(credito);
      // #region agent log
      _ecDbgLog('esteira-credito.js:render', 'workflow rendered v6', {
        build: '97c411credito6',
        hasPixSelect: !!wrap.querySelector('select#ecFormaPagamento'),
        hasPixReadonly: !!wrap.querySelector('input[readonly][value="PIX automático"]'),
        pixFixo: PIX_AUTOMATICO_FIXO,
      }, 'pix-auto-fixo');
      // #endregion
      if (typeof applyInputMasks === 'function') applyInputMasks(wrap);
      if (window.PixAutomaticoCredito?.mount) PixAutomaticoCredito.mount('ecPixAutoHost');
      this._valorAutoCalcWired = false;
      this._wireValorAutoCalc();
      const sel = document.getElementById('ecProposalSelect');
      if (sel && _currentProposalId) sel.value = _currentProposalId;
      await this.onProposalChange();
      await this._renderLista(credito);
    },

    async _renderLista(credito) {
      const wrap = document.getElementById('esteiraCreditoLista');
      if (!wrap) return;
      wrap.innerHTML = `
        <h4 style="font-weight:800;margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;">Solicitações na esteira</h4>
        <div class="table-wrap"><table class="data-table" style="width:100%;">
          <thead><tr>
            <th>Protocolo</th><th>Cliente</th><th>Valor solicitado</th><th>Status</th><th>Ações</th>
          </tr></thead>
          <tbody>${credito.slice(0, 50).map((p) => {
            const est = parseEsteira(p);
            const st = String(est.status_credito || p.status || p.statusOp || 'EM ANÁLISE').toUpperCase();
            const pid = String(p.id || '').replace(/'/g, "\\'");
            const stCls = _ecStatusBadgeClass(st);
            return `<tr>
              <td>${esc(p.protocolo || p.numero || p.id)}</td>
              <td>${esc(p.client_name || p.clientName || '—')}</td>
              <td>${esc(fmtMoney(p.valor || p.valorFinal || p.valor_solicitado))}</td>
              <td><span class="ec-status-badge ${stCls}">${esc(st.toUpperCase())}</span></td>
              <td><button type="button" class="btn btn-ghost btn-sm" onclick="EsteiraCredito.selecionar('${pid}')">Abrir</button></td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>`;
    },

    selecionar(id) {
      _currentProposalId = id;
      const sel = document.getElementById('ecProposalSelect');
      if (sel) sel.value = id;
      this.onProposalChange();
    },

    _parcelasFromProposal(p, est, m) {
      const estMeta = est._meta && typeof est._meta === 'object' ? est._meta : {};
      const n = parseInt(
        est.parcelas_meses ?? est.parcelas ?? m.parcelas_meses ?? m.parcelas
          ?? estMeta.parcelas_meses ?? estMeta.parcelas ?? p.parcelas_meses ?? p.parcelas ?? '',
        10
      );
      if ([2, 3, 4].includes(n)) return n;
      const obsMatch = String(p?.obs || '').match(/Parcelas:\s*(\d+)\s*meses/i);
      if (obsMatch) {
        const fromObs = parseInt(obsMatch[1], 10);
        if ([2, 3, 4].includes(fromObs)) return fromObs;
      }
      return null;
    },

    async _resolveDataNascimento(p, cpf) {
      const m = p?.meta && typeof p.meta === 'object' ? p.meta : {};
      const est = parseEsteira(p);
      const estMeta = est._meta && typeof est._meta === 'object' ? est._meta : {};
      let dn = m.data_nascimento || m.dataNascimento || estMeta.data_nascimento || estMeta.dataNascimento || '';
      if (!dn && typeof DB !== 'undefined' && typeof DB.getRhEmployees === 'function') {
        const rhList = await DB.getRhEmployees().catch(() => []);
        const rh = (rhList || []).find((e) => digits(e.cpf) === cpf);
        dn = rh?.data_nascimento || rh?.dataNascimento || '';
      }
      return String(dn || '').trim();
    },

    onParcelasChange() {
      const parcelasEl = document.getElementById('ecParcelas');
      const n = parseInt(parcelasEl?.value ?? '', 10);
      if (parcelasEl && Number.isFinite(n)) parcelasEl.dataset.parcelas = String(n);
      else if (parcelasEl) delete parcelasEl.dataset.parcelas;
      this.onValorParcelaChange();
    },

    onValorParcelaChange() {
      const parcela = parseFloat(document.getElementById('ecValorParcela')?.value) || 0;
      const n = parseInt(document.getElementById('ecParcelas')?.value || document.getElementById('ecParcelas')?.dataset?.parcelas || '', 10);
      const finalEl = document.getElementById('ecValorFinal');
      if (!finalEl) return;
      if (parcela > 0 && Number.isFinite(n) && n > 0) {
        finalEl.value = String(Math.round(parcela * n * 100) / 100);
      } else if (parcela > 0) {
        finalEl.value = String(parcela);
      } else {
        finalEl.value = '';
      }
    },

    onParcelaInputChange() {
      this.onValorParcelaChange();
    },

    onCcbParcelasChange() {
      const n = parseInt(document.getElementById('ccbParcelas')?.value || '', 10);
      const wrap = document.getElementById('ccbParcelasWrap');
      if (wrap) {
        const prev = [];
        wrap.querySelectorAll('.ec-parcela-input').forEach((el) => prev.push(el.value));
        wrap.innerHTML = _renderParcelasInputsHtml('ccbParcelasWrap', n, prev)
          .replace(/EsteiraCredito\.onParcelaInputChange/g, 'EsteiraCredito.onCcbParcelaInputChange');
      }
      this.onCcbParcelaInputChange();
    },

    onCcbParcelaInputChange() {
      const sum = _sumParcelasInputs('ccbParcelasWrap');
      const v = document.getElementById('ccbValor');
      if (v) v.value = sum > 0 ? String(sum) : '';
    },

    _recalcValorFinalFromParcelas() {
      const sum = _sumParcelasInputs('ecParcelasWrap');
      const finalEl = document.getElementById('ecValorFinal');
      if (finalEl) finalEl.value = sum > 0 ? String(sum) : '';
      // #region agent log
      _ecDbgLog('esteira-credito.js:_recalcValorFinalFromParcelas', 'sum parcelas', { sum }, 'parcelas-soma');
      // #endregion
    },

    _recalcValoresParcela() {
      this.onParcelasChange();
    },

    _wireValorAutoCalc() {
      if (this._valorAutoCalcWired) return;
      this._valorAutoCalcWired = true;
    },

    _fillParcelasInputs(containerId, count, values) {
      const wrap = document.getElementById(containerId);
      if (!wrap) return;
      wrap.innerHTML = _renderParcelasInputsHtml(containerId, count, values);
      if (containerId === 'ccbParcelasWrap') {
        wrap.querySelectorAll('.ec-parcela-input').forEach((el) => {
          el.setAttribute('oninput', 'EsteiraCredito.onCcbParcelaInputChange()');
        });
      }
    },

    async onProposalChange() {
      const id = document.getElementById('ecProposalSelect')?.value;
      _currentProposalId = id || null;
      if (!id) {
        _resetEsteiraAnexos();
        return;
      }
      let p = null;
      if (window.CreditoPropostasApi?.get) {
        p = await CreditoPropostasApi.get(id).catch(() => null);
      }
      if (!p) {
        const props = await this._loadProposals();
        p = props.find((x) => String(x.id) === String(id)) || null;
      }
      if (!p) return;

      const est = parseEsteira(p);
      const ret = parseRetorno(p);
      const m = p.meta && typeof p.meta === 'object' ? p.meta : {};
      const att = ret.attachments || {};

      const set = (elId, val) => {
        const el = document.getElementById(elId);
        if (el) el.value = val != null && val !== '' ? val : '';
      };

      set('ecProtocolo', p.protocolo || p.numero || est.protocolo || '');
      set('ecCpf', fmtCpf(proposalCpf(p)));
      set('ecValorSolicitado', est.valor_solicitado ?? p.valor ?? p.valorFinal ?? '');
      set('ecValorAprovado', est.valor_aprovado ?? ret.valor_liberado ?? '');
      const parcelas = this._parcelasFromProposal(p, est, m);
      const parcelasEl = document.getElementById('ecParcelas');
      if (parcelasEl) {
        parcelasEl.value = parcelas ? String(parcelas) : '';
        if (parcelas) parcelasEl.dataset.parcelas = String(parcelas);
        else delete parcelasEl.dataset.parcelas;
      }
      // #region agent log
      _ecDbgLog('esteira-credito.js:onProposalChange', 'proposal loaded', {
        proposalId: id,
        parcelas,
        valorSolicitado: est.valor_solicitado ?? p.valor,
        hasMetaParcelas: !!(m.parcelas_meses || m.parcelas),
        hasEsteiraParcelas: !!(est.parcelas_meses || est.parcelas),
      }, 'calc-parcela');
      // #endregion
      set('ecFormaPagamento', PIX_AUTOMATICO_FIXO);
      const vp = est.valor_parcela ?? ret.valor_parcela ?? '';
      set('ecValorParcela', vp);
      this.onValorParcelaChange();
      const statusCred = est.status_credito || p.status || p.statusOp || 'EM ANÁLISE';
      const statusEl = document.getElementById('ecStatusCredito');
      if (statusEl) statusEl.value = EC_STATUS_OPCOES.includes(statusCred) ? statusCred : 'EM ANÁLISE';
      set('ecNumPromissoria', est.num_nota_promissoria ?? est.num_promissoria ?? '');
      set('ecDataDesconto', (est.data_desconto || est.data_credito) ? String(est.data_desconto || est.data_credito).slice(0, 10) : '');

      _resetEsteiraAnexos(att);

      const analiseEl = document.getElementById('ecApiAnaliseResult');
      if (analiseEl) {
        analiseEl.innerHTML = est.consultas?.analise_credito
          ? _fmtAnaliseCreditoHtml(est.consultas.analise_credito)
          : 'Aguardando consulta...';
      }
      const certEl = document.getElementById('ecApiCertidaoResult');
      if (certEl) {
        certEl.innerHTML = est.consultas?.certidao_civil
          ? _fmtConsultaHtml(est.consultas.certidao_civil, 'Certidão negativa civil')
          : 'Aguardando consulta...';
      }

      const badge = document.getElementById('ecStatusBadge');
      if (badge) {
        const st = String(statusCred || 'EM ANÁLISE').toUpperCase();
        badge.innerHTML = `<span class="ec-status-badge ${_ecStatusBadgeClass(st)}">${esc(st)}</span>`;
      }
      if (window.PixAutomaticoCredito?.mountFromEsteira) {
        const pa = est.pix_automatico || {};
        const m = p?.meta || {};
        PixAutomaticoCredito.mountFromEsteira(pa, {
          banco: p.banco || m.banco || '',
          agencia: p.agencia || m.agencia || '',
          conta: p.conta_corrente || m.conta_corrente || '',
        });
      }
    },

    onAnexoPick(key, input) {
      const file = input?.files?.[0];
      if (!file) return;
      if (file.size > 25 * 1024 * 1024) {
        showToast('Arquivo excede 25 MB.', 'warning');
        input.value = '';
        return;
      }
      _esteiraPending[key] = file;
      _setAnexoStatus(key, file.name);
    },

    async _getCurrentProposal() {
      const id = document.getElementById('ecProposalSelect')?.value || _currentProposalId;
      if (!id) return null;
      if (window.CreditoPropostasApi?.get) {
        const row = await CreditoPropostasApi.get(id).catch(() => null);
        if (row) return row;
      }
      const props = await this._loadProposals();
      return props.find((x) => String(x.id) === String(id)) || null;
    },

    _collectEsteiraFields() {
      const gv = (id) => document.getElementById(id)?.value?.trim() ?? '';
      const parcelasEl = document.getElementById('ecParcelas');
      const parcelasMeses = parseInt(parcelasEl?.value || parcelasEl?.dataset?.parcelas || '', 10);
      const valorParcela = parseFloat(gv('ecValorParcela')) || null;
      const valorFinal = parseFloat(gv('ecValorFinal')) || null;
      const statusCred = gv('ecStatusCredito') || 'EM ANÁLISE';
      const dataDesconto = gv('ecDataDesconto') || null;
      return {
        protocolo: gv('ecProtocolo'),
        valor_solicitado: parseFloat(gv('ecValorSolicitado')) || null,
        valor_aprovado: parseFloat(gv('ecValorAprovado')) || null,
        parcelas_meses: Number.isFinite(parcelasMeses) ? parcelasMeses : null,
        parcelas: Number.isFinite(parcelasMeses) ? parcelasMeses : null,
        forma_pagamento: gv('ecFormaPagamento'),
        valor_parcela: valorParcela,
        valor_final: valorFinal,
        status_credito: statusCred,
        num_nota_promissoria: gv('ecNumPromissoria'),
        data_desconto: dataDesconto,
        data_credito: dataDesconto,
      };
    },

    async salvarDados() {
      const p = await this._getCurrentProposal();
      if (!p) {
        showToast('Selecione uma proposta.', 'warning');
        return;
      }
      const fields = this._collectEsteiraFields();
      const prevEst = parseEsteira(p);
      const prevRet = parseRetorno(p);

      showLoading('Salvando...');
      try {
        const attachments = await _uploadEsteiraAnexos(p.id);
        const mergedAtt = { ...(prevRet.attachments || {}), ...attachments };

        const esteira = {
          ...prevEst,
          ...fields,
          attachments_sync: Object.keys(mergedAtt),
          atualizado_em: new Date().toISOString(),
        };

        const retorno = {
          ...prevRet,
          valor_liberado: fields.valor_aprovado ?? fields.valor_final ?? prevRet.valor_liberado,
          valor_parcela: fields.valor_parcela ?? prevRet.valor_parcela,
          pagamento: fields.forma_pagamento || prevRet.pagamento,
          status_credito: fields.status_credito,
          data_desconto: fields.data_desconto,
          attachments: mergedAtt,
        };

        const updated = {
          ...p,
          protocolo: fields.protocolo || p.protocolo || p.numero,
          numero: fields.protocolo || p.numero || p.protocolo,
          valorFinal: fields.valor_final ?? p.valorFinal,
          valor_final: fields.valor_final ?? p.valor_final,
          status: fields.status_credito,
          statusOp: fields.status_credito,
          creditoEsteira: esteira,
          credito_esteira: esteira,
          creditoRetorno: retorno,
          credito_retorno: retorno,
          updatedAt: new Date().toISOString(),
        };

        await _saveProposal(updated);
        // #region agent log
        _ecDbgLog('esteira-credito.js:salvarDados', 'esteira saved', {
          proposalId: p.id,
          valorParcela: fields.valor_parcela,
          valorFinal: fields.valor_final,
          statusCredito: fields.status_credito,
          dataDesconto: fields.data_desconto,
          formaPagamento: fields.forma_pagamento,
        }, 'credito-form-v3');
        // #endregion
        _esteiraPending = {};
        showToast('Dados da esteira salvos. Documentos disponíveis no Retorno de Propostas.', 'success');
        await this.renderWorkflow();
      } catch (e) {
        showToast(e.message || 'Erro ao salvar.', 'error');
      } finally {
        hideLoading();
      }
    },

    async apiAnaliseCredito() {
      const p = await this._getCurrentProposal();
      if (!p) {
        showToast('Selecione uma proposta.', 'warning');
        return;
      }
      const cpf = proposalCpf(p);
      if (cpf.length !== 11) {
        showToast('CPF não encontrado na proposta.', 'warning');
        return;
      }
      if (typeof FonteData === 'undefined') {
        showToast('API FonteData não disponível.', 'error');
        return;
      }

      const el = document.getElementById('ecApiAnaliseResult');
      if (el) el.textContent = 'Consultando análise de crédito...';

      try {
        const m = p.meta && typeof p.meta === 'object' ? p.meta : {};
        const dataNasc = await this._resolveDataNascimento(p, cpf) || m.data_nascimento || m.dataNascimento || '';
        const res = await FonteData.lookupAnaliseCreditoPf(cpf, dataNasc);
        // #region agent log
        _ecDbgLog('esteira-credito.js:apiAnaliseCredito', 'analise result', {
          ok: res.ok,
          rhOk: !!res.rh?.ok,
          receitaOk: !!res.rh?.receita?.ok,
          pisOk: !!res.rh?.pis?.ok,
          hasDataNasc: !!dataNasc,
          error: res.error || null,
        }, 'analise-api');
        // #endregion
        if (!res.ok) throw new Error(res.error || 'Falha na consulta');
        const bundle = { rh: res.rh, score: res.score };
        const prevEst = parseEsteira(p);
        const esteira = {
          ...prevEst,
          consultas: { ...(prevEst.consultas || {}), analise_credito: bundle },
          analise_credito_em: new Date().toISOString(),
        };
        await _saveProposal({
          ...p,
          creditoEsteira: esteira,
          credito_esteira: esteira,
          updatedAt: new Date().toISOString(),
        });
        if (el) el.innerHTML = _fmtAnaliseCreditoHtml(bundle);
        showToast('Análise de crédito consultada.', 'success');
      } catch (e) {
        if (el) el.innerHTML = `<span style="color:#dc2626;">${esc(e.message || 'Erro na consulta')}</span>`;
        showToast(e.message || 'Erro na consulta.', 'error');
      }
    },

    async apiCertidaoCivil() {
      const p = await this._getCurrentProposal();
      if (!p) {
        showToast('Selecione uma proposta.', 'warning');
        return;
      }
      const cpf = proposalCpf(p);
      if (cpf.length !== 11) {
        showToast('CPF não encontrado na proposta.', 'warning');
        return;
      }
      if (typeof FonteData === 'undefined' || typeof FonteData.lookupTjCertidao !== 'function') {
        showToast('API de certidão não disponível.', 'error');
        return;
      }

      const el = document.getElementById('ecApiCertidaoResult');
      if (el) el.textContent = 'Consultando certidão negativa civil...';

      try {
        const res = await FonteData.lookupTjCertidao(cpf);
        // #region agent log
        _ecDbgLog('esteira-credito.js:apiCertidaoCivil', 'certidao result', {
          ok: res.ok,
          error: res.error || null,
        }, 'certidao-host');
        // #endregion
        if (!res.ok) throw new Error(res.error || 'Falha na consulta');
        const prevEst = parseEsteira(p);
        const esteira = {
          ...prevEst,
          consultas: { ...(prevEst.consultas || {}), certidao_civil: res.raw },
          certidao_civil_em: new Date().toISOString(),
        };
        await _saveProposal({
          ...p,
          creditoEsteira: esteira,
          credito_esteira: esteira,
          updatedAt: new Date().toISOString(),
        });
        if (el) el.innerHTML = _fmtConsultaHtml(res.raw, 'Certidão negativa civil');
        showToast('Certidão civil consultada.', 'success');
      } catch (e) {
        if (el) el.innerHTML = `<span style="color:#dc2626;">${esc(e.message || 'Erro na consulta')}</span>`;
        showToast(e.message || 'Erro na consulta.', 'error');
      }
    },

    async gerarNotaPromissoria() {
      const p = await this._getCurrentProposal();
      if (!p) {
        showToast('Selecione uma proposta.', 'warning');
        return;
      }
      const fields = this._collectEsteiraFields();
      const cpf = proposalCpf(p);
      const nome = p.client_name || p.clientName || '—';
      const num = fields.num_nota_promissoria || `NP-${Date.now()}`;
      const valor = fields.valor_final || fields.valor_aprovado || p.valor || 0;
      const dataCred = fields.data_desconto || fields.data_credito || new Date().toISOString().slice(0, 10);

      const texto = [
        'NOTA PROMISSÓRIA',
        '',
        `Nº: ${num}`,
        `Data do crédito: ${dataCred}`,
        `Protocolo: ${fields.protocolo || p.protocolo || p.numero || '—'}`,
        '',
        `Eu, ${nome}, CPF ${fmtCpf(cpf)}, prometo pagar à SOU+BLU`,
        `a quantia de ${fmtMoney(valor)}, conforme condições da proposta de crédito.`,
        '',
        `Forma de pagamento: ${fields.forma_pagamento || '—'}`,
        fields.valor_parcela && fields.parcelas_meses
          ? `Parcelas: ${fields.parcelas_meses}x de ${fmtMoney(fields.valor_parcela)} = ${fmtMoney(valor)}`
          : `Valor da parcela: ${fields.valor_parcela ? fmtMoney(fields.valor_parcela) : '—'}`,
        '',
        `Gerado em ${new Date().toLocaleString('pt-BR')}`,
      ].join('\n');

      showLoading('Gerando nota promissória...');
      try {
        const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
        const file = new File([blob], `nota_promissoria_${num.replace(/[^\w-]/g, '_')}.txt`, { type: 'text/plain' });
        const uploaded = await DB.uploadProposalFile(file, p.id, 'retorno_promissoria');
        const url = typeof DB.resolveUploadUrl === 'function' ? DB.resolveUploadUrl(uploaded) : (uploaded?.url || uploaded);

        const prevEst = parseEsteira(p);
        const prevRet = parseRetorno(p);
        const mergedAtt = {
          ...(prevRet.attachments || {}),
          promissoria: url,
          promissoria_nome: file.name,
        };

        const esteira = {
          ...prevEst,
          ...fields,
          num_nota_promissoria: num,
          promissoria_gerada_em: new Date().toISOString(),
        };

        const retorno = {
          ...prevRet,
          attachments: mergedAtt,
        };

        await _saveProposal({
          ...p,
          creditoEsteira: esteira,
          credito_esteira: esteira,
          creditoRetorno: retorno,
          credito_retorno: retorno,
          updatedAt: new Date().toISOString(),
        });

        const set = (id, val) => {
          const el = document.getElementById(id);
          if (el) el.value = val;
        };
        set('ecNumPromissoria', num);

        const promStatus = document.getElementById('ec_promissoria_status');
        if (promStatus) {
          promStatus.innerHTML = url
            ? `Nota gerada — <a href="${esc(url)}" target="_blank" rel="noopener" download="${esc(file.name)}">⬇ Baixar nota promissória</a> · também em Retorno de Propostas`
            : 'Nota promissória gerada — download no Retorno de Propostas';
        }

        showToast('Nota promissória gerada. Baixe aqui ou em Retorno de Propostas.', 'success');
      } catch (e) {
        showToast(e.message || 'Erro ao gerar nota.', 'error');
      } finally {
        hideLoading();
      }
    },

    async enviarNotaPromissoriaAssinatura() {
      const p = await this._getCurrentProposal();
      if (!p) {
        showToast('Selecione uma proposta.', 'warning');
        return;
      }
      const fields = this._collectEsteiraFields();
      const prevEst = parseEsteira(p);
      const prevRet = parseRetorno(p);
      const hasProm = prevRet.attachments?.promissoria || _esteiraUrls.promissoria;
      if (!hasProm && !fields.num_nota_promissoria) {
        await this.gerarNotaPromissoria();
      }
      showLoading('Registrando envio para assinatura...');
      try {
        const esteira = {
          ...prevEst,
          ...fields,
          promissoria_enviada_assinatura_em: new Date().toISOString(),
          promissoria_status: 'aguardando_assinatura',
        };
        const retorno = {
          ...prevRet,
          promissoria_enviada_assinatura_em: esteira.promissoria_enviada_assinatura_em,
          promissoria_status: 'aguardando_assinatura',
        };
        await _saveProposal({
          ...p,
          creditoEsteira: esteira,
          credito_esteira: esteira,
          creditoRetorno: retorno,
          credito_retorno: retorno,
          updatedAt: new Date().toISOString(),
        });
        const promStatus = document.getElementById('ec_promissoria_status');
        if (promStatus) {
          promStatus.innerHTML = '<span style="color:#059669;font-weight:600;">Enviada para assinatura</span>';
        }
        showToast('Nota promissória marcada como enviada para assinatura.', 'success');
      } catch (e) {
        showToast(e.message || 'Erro ao registrar envio.', 'error');
      } finally {
        hideLoading();
      }
    },

    async decidir(status) {
      const p = await this._getCurrentProposal();
      if (!p) {
        showToast('Selecione uma proposta.', 'warning');
        return;
      }
      const st = String(status || '').toLowerCase();
      if (!['aprovado', 'recusado'].includes(st)) return;

      const fields = this._collectEsteiraFields();
      const prevEst = parseEsteira(p);
      if (prevEst.status === 'aprovado' && st === 'aprovado') {
        showToast('Proposta já aprovada anteriormente.', 'warning');
        return;
      }

      const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
      const now = new Date().toISOString();

      showLoading(st === 'aprovado' ? 'Aprovando proposta...' : 'Registrando recusa...');
      try {
        const attachments = await _uploadEsteiraAnexos(p.id);
        const prevRet = parseRetorno(p);
        const mergedAtt = { ...(prevRet.attachments || {}), ...attachments };

        const esteira = {
          ...prevEst,
          ...fields,
          status: st === 'aprovado' ? 'aprovado' : 'recusado_politica',
          aprovado_em: st === 'aprovado' ? now : prevEst.aprovado_em,
          recusado_em: st === 'recusado' ? now : prevEst.recusado_em,
          decidido_por: session?.id || null,
          decidido_por_nome: session?.name || 'Financeiro',
        };

        const retorno = {
          ...prevRet,
          valor_liberado: fields.valor_aprovado ?? prevRet.valor_liberado,
          valor_parcela: fields.valor_parcela ?? prevRet.valor_parcela,
          pagamento: fields.forma_pagamento || prevRet.pagamento,
          attachments: mergedAtt,
          status: st === 'aprovado' ? 'aprovado_esteira' : 'recusado_politica',
        };

        let empId = null;
        let beneficiaryName = '';
        if (st === 'aprovado') {
          const valorCredito = fields.valor_aprovado || fields.valor_final || p.valor || 0;
          if (!Number.isFinite(valorCredito) || valorCredito <= 0) {
            throw new Error('Informe o valor aprovado ou valor final antes de aprovar.');
          }
          empId = await resolveCreditBeneficiaryId(p);
          if (!empId) throw new Error('Funcionário beneficiário não identificado (CPF da proposta sem cadastro).');

          const beneficiary = typeof DB.getUser === 'function' ? await DB.getUser(empId) : null;
          beneficiaryName = beneficiary?.name || p.clientName || p.client_name || p.nome || 'funcionário';
          const submitterId = String(p.employee_id || p.vendor_id || '');
          // #region agent log
          _ecDbgLog('esteira-credito.js:decidir', 'credit beneficiary', {
            proposalId: p.id,
            empId,
            beneficiaryName,
            submitterId,
            cpf: proposalCpf(p),
            valorCredito,
            redirectedFromSubmitter: submitterId && submitterId !== String(empId),
          }, 'credit-beneficiary');
          // #endregion

          const protocolo = fields.protocolo || p.protocolo || p.numero || p.id;
          const reason = `Crédito aprovado — Esteira Proposta de Crédito (${protocolo})`;
          const meta = {
            screen: 'esteira_credito',
            kind: 'proposta_credito',
            proposal_id: p.id,
            protocolo,
            credito: true,
            beneficiary_cpf: proposalCpf(p),
            beneficiary_user_id: empId,
          };
          const nb = await DB.addBalance(empId, valorCredito, reason, session?.id || 'financeiro', meta);
          if (nb == null) {
            showToast('Decisão registrada, mas não foi possível creditar a conta corrente do beneficiário.', 'warning');
          }
          esteira.credito_conta_em = now;
          esteira.credito_valor = valorCredito;
          esteira.credito_beneficiary_id = empId;
          esteira.credito_beneficiary_cpf = proposalCpf(p);
          esteira.credito_beneficiary_nome = beneficiaryName;
        }

        const linha = st === 'aprovado'
          ? `[ESTEIRA CRÉDITO] Aprovado — ${fmtMoney(esteira.credito_valor || fields.valor_aprovado)} creditado na conta de ${beneficiaryName || 'funcionário'}`
          : '[ESTEIRA CRÉDITO] Recusado — política interna';

        const updated = {
          ...p,
          protocolo: fields.protocolo || p.protocolo || p.numero,
          status: st === 'aprovado' ? 'APROVADO CRÉDITO' : 'RECUSADO POLÍTICA INTERNA',
          statusOp: st === 'aprovado' ? 'APROVADO CRÉDITO' : 'RECUSADO POLÍTICA INTERNA',
          valorFinal: fields.valor_final ?? p.valorFinal,
          creditoEsteira: esteira,
          credito_esteira: esteira,
          creditoRetorno: retorno,
          credito_retorno: retorno,
          obs: typeof DB._appendProposalObsLine === 'function'
            ? DB._appendProposalObsLine(p.obs, linha)
            : `${String(p.obs || '').trim()}\n${linha}`.trim(),
          history: [
            ...(Array.isArray(p.history) ? p.history : []),
            {
              date: now,
              actorName: session?.name || 'Financeiro',
              action: st === 'aprovado' ? 'Aprovado na esteira de crédito' : 'Recusado — política interna',
              note: linha,
            },
          ],
          updatedAt: now,
        };

        await _saveProposal(updated);
        _esteiraPending = {};
        showToast(
          st === 'aprovado'
            ? `Proposta aprovada. ${fmtMoney(esteira.credito_valor || fields.valor_aprovado)} creditado na conta de ${beneficiaryName || 'funcionário'} (conta corrente SOU+BLU — não é transferência bancária automática).`
            : 'Proposta recusada por política interna.',
          st === 'aprovado' ? 'success' : 'warning'
        );
        await this.renderWorkflow();
      } catch (e) {
        showToast(e.message || 'Erro ao processar decisão.', 'error');
      } finally {
        hideLoading();
      }
    },

    async _populateCcbSelect() {
      const sel = document.getElementById('ccbProposalSelect');
      if (!sel) return;
      const props = await this._loadProposals();
      const credito = (props || []).filter(isCreditoProposal);
      if (!credito.length) {
        sel.innerHTML = '<option value="">Nenhuma solicitação na esteira</option>';
        return;
      }
      sel.innerHTML = '<option value="">Selecione a solicitação...</option>' + credito.map((p) =>
        `<option value="${esc(p.id)}" data-valor="${esc(p.valorFinal || p.valor_final || p.valor || '')}">${esc(proposalLabel(p))}</option>`
      ).join('');
      sel.onchange = () => {
        const opt = sel.selectedOptions[0];
        const parcelasInput = document.getElementById('ccbParcelas');
        const valorInput = document.getElementById('ccbValor');
        if (!opt?.value) {
          if (parcelasInput) parcelasInput.value = '';
          if (valorInput) valorInput.value = '';
          const wrap = document.getElementById('ccbParcelasWrap');
          if (wrap) wrap.innerHTML = '';
          return;
        }
        const p = credito.find((x) => String(x.id) === String(opt.value));
        if (!p) return;
        const est = parseEsteira(p);
        const ret = parseRetorno(p);
        const parcelas = this._parcelasFromProposal(p, est, p.meta || {}) || est.parcelas_meses || 2;
        const valores = _parseParcelasValores(est, ret);
        if (parcelasInput) parcelasInput.value = String(parcelas);
        this._fillParcelasInputs('ccbParcelasWrap', parcelas, valores);
        this.onCcbParcelaInputChange();
      };
    },

    openAddModal() {
      showToast('Esta esteira é só para empréstimo interno ao funcionário. Use "Solicitar proposta crédito" ou aguarde a solicitação pelo painel do funcionário. Propostas comerciais (PROP-) não entram aqui.', 'info');
      this.openSolicitarPanel();
    },

    async saveAdd() {
      showToast('Não é possível adicionar propostas comerciais à esteira de crédito.', 'warning');
    },

    async emitCcb() {
      const id = document.getElementById('ccbProposalSelect')?.value;
      if (!id) {
        showToast('Selecione uma proposta da esteira.', 'warning');
        return;
      }
      const valor = parseFloat(document.getElementById('ccbValor')?.value) || _sumParcelasInputs('ccbParcelasWrap');
      const parcelas = parseInt(document.getElementById('ccbParcelas')?.value, 10);
      const parcelasValores = [];
      document.querySelectorAll('#ccbParcelasWrap .ec-parcela-input').forEach((el) => {
        const n = parseFloat(el.value);
        if (Number.isFinite(n)) parcelasValores.push(n);
      });
      const obsExtra = document.getElementById('ccbObs')?.value?.trim() || '';

      if (!Number.isFinite(valor) || valor <= 0) {
        showToast('Informe os valores das parcelas (soma do crédito).', 'warning');
        return;
      }

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
        parcelasValores.length ? `Detalhe: ${parcelasValores.map((v) => fmtMoney(v)).join(' + ')} = ${fmtMoney(valor)}` : '',
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
        await _saveProposal(updated);
        const box = document.getElementById('ccbEmitResult');
        if (box) {
          box.innerHTML = `<div class="table-wrap"><table class="data-table" style="width:100%;">
            <tbody>
              ${finGridRow('STATUS', '<strong style="color:#059669;">CCB registrado</strong>')}
              ${finGridRow('PROPOSTA', esc(proposalLabel(p)))}
              ${finGridRow('DETALHES', esc(linha))}
            </tbody>
          </table></div>`;
        }
        showToast('CCB emitido e registrado na proposta.', 'success');
      } catch (e) {
        showToast(e.message || 'Erro ao emitir CCB.', 'error');
      } finally {
        hideLoading();
      }
    },
  };

  window.EsteiraCredito = EsteiraCredito;
})();
