/* SOU+BLU — Retorno de Propostas + Adiantamento Salarial (Financeiro) */
(function () {
  'use strict';

  const ADIANTAMENTO_MAX = 300;

  const RETORNO_ANEXOS = [
    { key: 'termo_divida_gov', label: 'ANEXO TERMO DÍVIDA - VIA GOV' },
    { key: 'termo_cessao_gov', label: 'ANEXO TERMO CESSÃO CRÉDITO VIA GOV' },
    { key: 'promissoria', label: 'ANEXO PROMISSÓRIA' },
    { key: 'print_pix_automatico', label: 'PRINT AUTORIZAÇÃO PIX AUTOMÁTICO LIBERADO' },
  ];

  const PIX_AUTOMATICO_FIXO = 'PIX automático';

  function _fcPixAutoFieldHtml() {
    return `<input type="text" class="form-control" value="${esc(PIX_AUTOMATICO_FIXO)}" readonly style="background:#f9fafb;font-weight:600;"/>
      <input type="hidden" id="retornoPagamento" value="${esc(PIX_AUTOMATICO_FIXO)}"/>`;
  }

  const FC_STATUS_OPCOES = [
    'AG. ANÁLISE',
    'EM ANÁLISE',
    'AGUARDANDO DOCUMENTAÇÃO',
    'AG. ACEITE FUNCIONÁRIO',
    'AG. ASSINATURA GOV',
    'AG. RETORNO FINANCEIRO',
    'APROVADO AG. PAGAMENTO',
    'PAGO',
    'REPROVADO',
  ];

  function _fcStatusSelectHtml(id, selected) {
    const opts = ['<option value="">Selecione o status...</option>']
      .concat(FC_STATUS_OPCOES.map((s) =>
        `<option value="${esc(s)}"${String(selected || '') === s ? ' selected' : ''}>${esc(s)}</option>`));
    return `<select id="${id}" class="form-control">${opts.join('')}</select>`;
  }

  let _retornoAnexoPending = {};
  let _retornoAnexoUrls = {};
  let _adiantamentoEmployee = null;

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function fmtMoney(v) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return '—';
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }

  function fmtCpf(v) {
    const d = String(v || '').replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
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

  function cpfDigits(v) {
    return String(v || '').replace(/\D/g, '');
  }

  async function _lookupRhEmployee(cpf) {
    const list = await DB.getRhEmployees().catch(() => []);
    return (list || []).find(e => cpfDigits(e.cpf) === cpf) || null;
  }

  async function _lookupSystemUser(cpf) {
    const users = await DB.getAllUsers().catch(() => []);
    return (users || []).find(u => cpfDigits(u.cpf) === cpf && u.active !== false) || null;
  }

  function _mapRhToEmployee(rh, cpf) {
    return {
      id: rh.id,
      name: rh.nome || rh.name || '',
      cpf,
      role: rh.cargo || rh.departamento || 'employee',
      matricula: rh.matricula || '',
    };
  }

  function _mapUserToEmployee(u, cpf) {
    return {
      id: u.id,
      name: u.name || '',
      cpf,
      role: u.role || u.department || 'employee',
      matricula: u.matricula || '',
    };
  }

  async function _resolveEmployeeByCpf(cpf) {
    const direct = await DB.getUserByCpf(cpf);
    if (direct) return direct;

    const rh = await _lookupRhEmployee(cpf);
    if (rh) return _mapRhToEmployee(rh, cpf);

    const u = await _lookupSystemUser(cpf);
    if (u) return _mapUserToEmployee(u, cpf);

    return null;
  }

  function canView() {
    const s = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    if (!s || window.PARTNER_ROOT_ID) return false;
    if (typeof Auth.hasFinanceiroInternoAccess === 'function') return Auth.hasFinanceiroInternoAccess(s);
    return ['master', 'fundador', 'gerente', 'financeiro', 'financial', 'rh', 'diretoria'].includes(String(s.role || '').toLowerCase());
  }

  function isCreditoProposal(p) {
    if (!p) return false;
    if (window.CreditoPropostasApi?.isCreditTableRow?.(p)) return true;
    const m = p.meta && typeof p.meta === 'object' ? p.meta : {};
    return m.credit_table === 'credit_proposals';
  }

  function proposalLabel(p) {
    const num = p.protocolo || p.numero || p.id || '—';
    const cli = p.client_name || p.clientName || p.nome || 'Funcionário';
    return `${num} · ${cli}`;
  }

  async function _loadCreditoProposals() {
    if (window.CreditoPropostasApi?.list) {
      try {
        const rows = await CreditoPropostasApi.list();
        if (Array.isArray(rows) && rows.length) return rows.filter(isCreditoProposal);
      } catch (e) {
        console.warn('[FinanceiroCredito] credit_proposals:', e.message || e);
      }
    }
    const legacy = await DB.getProposals().catch(() => []);
    return (legacy || []).filter(isCreditoProposal);
  }

  async function _getCreditoProposal(id) {
    if (!id) return null;
    if (window.CreditoPropostasApi?.get) {
      const row = await CreditoPropostasApi.get(id).catch(() => null);
      if (row) return row;
    }
    if (typeof DB.getProposal === 'function') {
      const row = await DB.getProposal(id).catch(() => null);
      if (row) return row;
    }
    const list = await _loadCreditoProposals();
    return list.find((x) => String(x.id) === String(id)) || null;
  }

  async function _saveCreditoProposal(updated) {
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

  function _recalcRetornoValorLiberado() {
    const base = parseFloat(document.getElementById('retornoValorBase')?.value) || 0;
    const totalEl = document.getElementById('retornoValorLiberado');
    if (totalEl) totalEl.value = base > 0 ? String(base) : '';
    return base;
  }

  function finGridRow(label, fieldHtml) {
    return `<tr>
      <th style="width:34%;text-align:left;padding:10px 12px;background:var(--color-surface-2);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap;">${esc(label)}</th>
      <td style="padding:8px 12px;">${fieldHtml}</td>
    </tr>`;
  }

  function _resetRetornoAnexos(urls = {}) {
    _retornoAnexoPending = {};
    _retornoAnexoUrls = { ...urls };
    RETORNO_ANEXOS.forEach(({ key }) => {
      const input = document.getElementById(`retorno_anexo_${key}`);
      if (input) input.value = '';
      const url = _retornoAnexoUrls[key];
      const nome = _retornoAnexoUrls[`${key}_nome`];
      const dl = document.getElementById(`retorno_anexo_${key}_dl`);
      if (dl) dl.innerHTML = url ? _retornoDownloadHtml(key, url, nome || 'Download') : '';
      _setRetornoAnexoStatus(key, url ? (nome || 'Arquivo da esteira — disponível para download') : 'Nenhum arquivo');
    });
  }

  function _setRetornoAnexoStatus(key, label) {
    const el = document.getElementById(`retorno_anexo_${key}_status`);
    if (el) el.textContent = label || 'Nenhum arquivo';
  }

  function _retornoDownloadHtml(key, url, nome) {
    if (!url) return '';
    const label = nome || 'Baixar arquivo';
    const safeUrl = esc(url);
    return `<a href="${safeUrl}" target="_blank" rel="noopener" download class="btn btn-outline btn-sm" style="margin-left:4px;">⬇ ${esc(label)}</a>`;
  }

  function onRetornoAnexoPick(key, input) {
    const file = input?.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      showToast('Arquivo excede 25 MB.', 'warning');
      input.value = '';
      return;
    }
    _retornoAnexoPending[key] = file;
    _setRetornoAnexoStatus(key, file.name);
  }

  async function _uploadRetornoAnexos(proposalId) {
    const out = { ..._retornoAnexoUrls };
    for (const { key } of RETORNO_ANEXOS) {
      const file = _retornoAnexoPending[key];
      if (!file) continue;
      try {
        const uploaded = await DB.uploadProposalFile(file, proposalId, `retorno_${key}`);
        const url = typeof DB.resolveUploadUrl === 'function' ? DB.resolveUploadUrl(uploaded) : (uploaded?.url || uploaded);
        if (url) out[key] = url;
      } catch (e) {
        console.warn('[FinanceiroCredito] anexo', key, e);
        if (typeof fileToBase64 === 'function') {
          out[key] = await fileToBase64(file);
        }
      }
      if (file.name) out[`${key}_nome`] = file.name;
    }
    return out;
  }

  const FinanceiroCredito = {
    applyNavVisibility() {
      const show = canView();
      document.querySelectorAll(
        '#navFinRetornoPropostas, #navFinAdiantamento, [data-section="secRetornoPropostas"], [data-section="secAdiantamentoSalarial"]'
      ).forEach((el) => {
        el.style.display = show ? '' : 'none';
      });
    },

    init() {
      this.applyNavVisibility();
    },

    async renderRetorno() {
      const root = document.getElementById('retornoPropostasRoot');
      if (!root || !canView()) return;
const props = await _loadCreditoProposals();
      const credito = props || [];

      root.innerHTML = `
        <div class="page-header">
          <div class="page-header-text">
            <h2>Retorno de Propostas</h2>
            <p class="text-muted">Registre o retorno do banco, anexe documentos e aceite a solicitação de crédito. A nota promissória gerada na Esteira de Crédito aparece em <strong>ANEXO PROMISSÓRIA</strong> abaixo.</p>
          </div>
        </div>
        <div class="card card-padded">
          <div class="table-wrap" style="margin-bottom:20px;">
            <table class="data-table" style="width:100%;">
              <tbody>
                ${finGridRow('SOLICITAÇÃO', `<select id="retornoPropostaSelect" class="form-control" onchange="FinanceiroCredito.onRetornoProposalChange()">
                  <option value="">Selecione a solicitação de crédito...</option>
                  ${credito.map((p) => `<option value="${esc(p.id)}">${esc(proposalLabel(p))}</option>`).join('')}
                </select>`)}
                ${finGridRow('VALOR CRÉDITO', `<input type="number" id="retornoValorBase" class="form-control" min="0" step="0.01" placeholder="0,00" oninput="FinanceiroCredito.onRetornoValorChange()"/>`)}
                ${finGridRow('VALOR LIBERADO', `<input type="number" id="retornoValorLiberado" class="form-control" min="0" step="0.01" placeholder="0,00" readonly style="background:#f9fafb;font-weight:700;"/>`)}
                ${finGridRow('PRAZO', `<input type="text" id="retornoPrazo" class="form-control" placeholder="Ex.: 2, 3 ou 4 meses"/>`)}
                ${finGridRow('VALOR PARCELA', `<input type="number" id="retornoValorParcela" class="form-control" min="0" step="0.01" placeholder="0,00"/>`)}
                ${finGridRow('FORMA DE PAGAMENTO — PIX AUTOMÁTICO', _fcPixAutoFieldHtml())}
                ${finGridRow('STATUS DA PROPOSTA', _fcStatusSelectHtml('retornoStatusCredito', 'EM ANÁLISE'))}
                ${finGridRow('DATA DO DESCONTO', `<input type="date" id="retornoDataDesconto" class="form-control"/>`)}
              </tbody>
            </table>
          </div>

          <h4 style="font-weight:800;margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--color-text-muted);">Anexos</h4>
          <div class="table-wrap" style="margin-bottom:20px;">
            <table class="data-table" style="width:100%;">
              <tbody>
                ${RETORNO_ANEXOS.map(({ key, label }) => `
                <tr>
                  <th style="width:50%;text-align:left;padding:10px 12px;background:var(--color-surface-2);font-size:11px;font-weight:700;">${esc(label)}</th>
                  <td style="padding:8px 12px;">
                    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
                      <input type="file" id="retorno_anexo_${key}" class="form-control" style="max-width:280px;" accept=".pdf,.jpg,.jpeg,.png,.webp" onchange="FinanceiroCredito.onRetornoAnexoPick('${key}', this)"/>
                      <span id="retorno_anexo_${key}_status" class="text-muted" style="font-size:12px;">Nenhum arquivo</span>
                      <span id="retorno_anexo_${key}_dl"></span>
                    </div>
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>

          <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn btn-ghost" onclick="FinanceiroCredito.limparRetorno()">Limpar</button>
            <button type="button" class="btn btn-primary" onclick="FinanceiroCredito.aceitarRetorno()">Aceitar proposta</button>
          </div>
          <div id="retornoHistoricoWrap" style="margin-top:24px;"></div>
        </div>`;

      _resetRetornoAnexos();
      await this._renderRetornoHistorico(credito);
    },

    async _renderRetornoHistorico(credito) {
      const wrap = document.getElementById('retornoHistoricoWrap');
      if (!wrap) return;
      const aceitas = (credito || []).filter((p) => {
        const r = parseRetorno(p);
        return r.aceito_em || String(r.status || '').toLowerCase() === 'aceito';
      });
      if (!aceitas.length) {
        wrap.innerHTML = '';
        return;
      }
      wrap.innerHTML = `
        <h4 style="font-weight:800;margin:0 0 12px;">Propostas aceitas recentemente</h4>
        <div class="table-wrap"><table class="data-table" style="width:100%;">
          <thead><tr><th>Proposta</th><th>Valor liberado</th><th>Pagamento</th><th>Aceito em</th></tr></thead>
          <tbody>${aceitas.slice(0, 20).map((p) => {
            const r = parseRetorno(p);
            return `<tr>
              <td>${esc(proposalLabel(p))}</td>
              <td>${esc(fmtMoney(r.valor_liberado || r.valorLiberado))}</td>
              <td>${esc(r.pagamento || '—')}</td>
              <td>${esc(fmtDt(r.aceito_em))}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>`;
    },

    onRetornoAnexoPick(key, input) {
      onRetornoAnexoPick(key, input);
    },

    onRetornoValorChange() {
      _recalcRetornoValorLiberado();
    },

    limparRetorno() {
      ['retornoValorBase', 'retornoValorLiberado', 'retornoPrazo', 'retornoValorParcela', 'retornoDataDesconto'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      const pag = document.getElementById('retornoPagamento');
      if (pag) pag.value = PIX_AUTOMATICO_FIXO;
      const st = document.getElementById('retornoStatusCredito');
      if (st) st.value = 'EM ANÁLISE';
      _resetRetornoAnexos();
    },

    async onRetornoProposalChange() {
      const id = document.getElementById('retornoPropostaSelect')?.value;
      if (!id) {
        this.limparRetorno();
        return;
      }
      const p = await _getCreditoProposal(id);
      if (!p) return;
      const r = parseRetorno(p);
      const est = p?.creditoEsteira || p?.credito_esteira || {};
      const esteira = typeof est === 'string' ? (() => { try { return JSON.parse(est); } catch { return {}; } })() : (est || {});
      const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val != null && val !== '' ? val : '';
      };
      const liberado = parseFloat(r.valor_liberado ?? r.valorLiberado) || 0;
      const base = parseFloat(r.valor_base ?? r.valorBase);
      const valorBase = Number.isFinite(base) ? base : (liberado > 0 ? liberado : '');
      set('retornoValorBase', valorBase);
      _recalcRetornoValorLiberado();
      set('retornoPrazo', r.prazo);
      set('retornoValorParcela', r.valor_parcela ?? r.valorParcela ?? esteira.valor_parcela);
      set('retornoPagamento', PIX_AUTOMATICO_FIXO);
      const statusCred = r.status_credito ?? esteira.status_credito ?? p.status ?? p.statusOp ?? 'EM ANÁLISE';
      const statusEl = document.getElementById('retornoStatusCredito');
      if (statusEl) statusEl.value = FC_STATUS_OPCOES.includes(statusCred) ? statusCred : 'EM ANÁLISE';
      set('retornoDataDesconto', (r.data_desconto ?? esteira.data_desconto ?? esteira.data_credito)
        ? String(r.data_desconto ?? esteira.data_desconto ?? esteira.data_credito).slice(0, 10) : '');
      _resetRetornoAnexos(r.attachments || {});
    },

    async aceitarRetorno() {
      const id = document.getElementById('retornoPropostaSelect')?.value;
      if (!id) {
        showToast('Selecione uma proposta.', 'warning');
        return;
      }
      const valorLiberado = _recalcRetornoValorLiberado();
      const valorBase = parseFloat(document.getElementById('retornoValorBase')?.value);
      const prazo = document.getElementById('retornoPrazo')?.value?.trim();
      const valorParcela = parseFloat(document.getElementById('retornoValorParcela')?.value);
      const statusCredito = document.getElementById('retornoStatusCredito')?.value || 'EM ANÁLISE';
      const dataDesconto = document.getElementById('retornoDataDesconto')?.value?.trim() || null;

      if (!Number.isFinite(valorLiberado) || valorLiberado <= 0) {
        showToast('Informe o valor do crédito.', 'warning');
        return;
      }
      if (!prazo) {
        showToast('Informe o prazo.', 'warning');
        return;
      }

      const p = await _getCreditoProposal(id);
      if (!p) {
        showToast('Solicitação não encontrada.', 'error');
        return;
      }

      const session = Auth.getSession();
      showLoading('Salvando retorno...');
      try {
        const prev = parseRetorno(p);
        const attachments = await _uploadRetornoAnexos(id);
        const mergedAtt = { ...(prev.attachments || {}), ...attachments };

        const retorno = {
          valor_base: Number.isFinite(valorBase) ? valorBase : null,
          valor_liberado: valorLiberado,
          prazo,
          valor_parcela: Number.isFinite(valorParcela) ? valorParcela : null,
          pagamento: PIX_AUTOMATICO_FIXO,
          status_credito: statusCredito,
          data_desconto: dataDesconto,
          attachments: mergedAtt,
          status: 'aceito',
          aceito_em: new Date().toISOString(),
          aceito_por: session?.id || null,
          aceito_por_nome: session?.name || 'Financeiro',
        };

        const linha = [
          '[RETORNO CRÉDITO] Proposta aceita',
          `Valor: ${fmtMoney(valorLiberado)}`,
          prazo ? `Prazo: ${prazo}` : '',
          `PIX automático: ${PIX_AUTOMATICO_FIXO}`,
          statusCredito ? `Status: ${statusCredito}` : '',
        ].filter(Boolean).join(' · ');

        const updated = {
          ...p,
          status: statusCredito,
          statusOp: statusCredito,
          creditoRetorno: retorno,
          credito_retorno: retorno,
          obs: typeof DB._appendProposalObsLine === 'function'
            ? DB._appendProposalObsLine(p.obs, linha)
            : `${String(p.obs || '').trim()}\n${linha}`.trim(),
          updatedAt: new Date().toISOString(),
        };

        await _saveCreditoProposal(updated);

        _retornoAnexoPending = {};
        showToast('Proposta aceita com retorno registrado.', 'success');
        await this.renderRetorno();
      } catch (e) {
        showToast(e.message || 'Erro ao aceitar proposta.', 'error');
      } finally {
        hideLoading();
      }
    },

    async renderAdiantamento() {
      const root = document.getElementById('adiantamentoSalarialRoot');
      if (!root || !canView()) return;
      _adiantamentoEmployee = null;

      root.innerHTML = `
        <div class="page-header">
          <div class="page-header-text">
            <h2>ADIANTAMENTO SALÁRIAL</h2>
            <p class="text-muted">Liberação única por mês, valor máximo de ${fmtMoney(ADIANTAMENTO_MAX)}.</p>
          </div>
        </div>
        <div class="card card-padded">
          <div class="table-wrap" style="margin-bottom:16px;">
            <table class="data-table" style="width:100%;">
              <tbody>
                ${finGridRow('CPF FUNCIONÁRIO', `<div class="form-row" style="gap:8px;margin:0;">
                  <input type="text" id="advCpf" class="form-control" placeholder="000.000.000-00" maxlength="14" style="flex:1;"/>
                  <button type="button" class="btn btn-outline btn-sm" onclick="FinanceiroCredito.buscarCpf()">Buscar</button>
                </div>
                <div id="advCpfInfo" class="text-muted" style="font-size:13px;margin-top:8px;display:none;"></div>`)}
                ${finGridRow('VALOR', `<input type="number" id="advValor" class="form-control" min="0.01" max="${ADIANTAMENTO_MAX}" step="0.01" placeholder="Máx. ${ADIANTAMENTO_MAX.toFixed(2)}"/>`)}
              </tbody>
            </table>
          </div>
          <p style="margin:0 0 20px;padding:12px 14px;background:var(--color-surface-2);border-radius:var(--radius-md);font-size:13px;color:var(--color-text-muted);">
            <strong>OBS:</strong> NÃO HÁ PARCELAMENTO E O VALOR É DESCONTADO INTEGRAL NA FOLHA SUBSEQUENTE.
          </p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button type="button" class="btn btn-success" onclick="FinanceiroCredito.decidirAdiantamento('aprovado')">APROVADO</button>
            <button type="button" class="btn btn-danger" onclick="FinanceiroCredito.decidirAdiantamento('recusado')">RECUSADO</button>
          </div>
          <div id="advHistoricoWrap" style="margin-top:28px;"></div>
        </div>`;

      await this._renderAdiantamentoHistorico();
    },

    async buscarCpf() {
      const raw = document.getElementById('advCpf')?.value || '';
      const digits = raw.replace(/\D/g, '');
      const info = document.getElementById('advCpfInfo');
      if (digits.length !== 11) {
        showToast('Informe um CPF válido (11 dígitos).', 'warning');
        return;
      }
      showLoading('Buscando...');
      try {
        const emp = await _resolveEmployeeByCpf(digits);
        _adiantamentoEmployee = emp;
        if (!emp) {
          if (info) {
            info.style.display = 'block';
            info.innerHTML = `<span style="color:#dc2626;">CPF não encontrado no cadastro.</span>`;
          }
          showToast('Funcionário não encontrado.', 'warning');
          return;
        }
        const nome = typeof fixMojibake === 'function' ? fixMojibake(emp.name) : emp.name;
        if (info) {
          info.style.display = 'block';
          info.innerHTML = `<strong>${esc(nome)}</strong> · ${esc(emp.role || '—')} · Matrícula: ${esc(emp.matricula || '—')}`;
        }
        document.getElementById('advCpf').value = fmtCpf(digits);

        const jaTem = await DB.hasFinanceAdiantamentoThisMonth(digits);
        if (jaTem) {
          showToast('Este CPF já possui adiantamento neste mês.', 'warning');
        }
      } catch (e) {
        showToast(e.message || 'Erro na busca.', 'error');
      } finally {
        hideLoading();
      }
    },

    async decidirAdiantamento(status) {
      const rawCpf = document.getElementById('advCpf')?.value || '';
      const cpf = rawCpf.replace(/\D/g, '');
      const valor = parseFloat(document.getElementById('advValor')?.value);

      if (cpf.length !== 11) {
        showToast('Busque o CPF do funcionário.', 'warning');
        return;
      }
      if (!Number.isFinite(valor) || valor <= 0) {
        showToast('Informe o valor do adiantamento.', 'warning');
        return;
      }
      if (valor > ADIANTAMENTO_MAX) {
        showToast(`Valor máximo permitido: ${fmtMoney(ADIANTAMENTO_MAX)}.`, 'warning');
        return;
      }

      const st = String(status || '').toLowerCase();
      if (!['aprovado', 'recusado'].includes(st)) return;

      if (st === 'aprovado') {
        const jaTem = await DB.hasFinanceAdiantamentoThisMonth(cpf);
        if (jaTem) {
          showToast('Já existe adiantamento para este CPF no mês atual.', 'error');
          return;
        }
      }

      let emp = _adiantamentoEmployee;
      if (!emp || cpfDigits(emp.cpf) !== cpf) {
        emp = await _resolveEmployeeByCpf(cpf);
      }
      if (!emp) {
        showToast('Funcionário não encontrado.', 'error');
        return;
      }

      const session = Auth.getSession();
      const now = new Date().toISOString();
      const monthLabel = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

      showLoading(st === 'aprovado' ? 'Aprovando adiantamento...' : 'Registrando recusa...');
      try {
        const row = await DB.saveFinanceAdiantamento({
          cpf,
          employee_id: emp.id,
          employee_name: emp.name,
          valor,
          status: st,
          decided_by: session?.id || null,
          decided_by_name: session?.name || 'Financeiro',
          decided_at: now,
        });

        if (!row) throw new Error('Não foi possível salvar o registro.');

        if (st === 'aprovado') {
          const reason = `Adiantamento salarial (${monthLabel}) — desconto integral na folha subsequente`;
          const meta = {
            screen: 'adiantamento_salarial',
            kind: 'adiantamento_salarial',
            adiantamento_salarial: true,
            folha_desconto: true,
            adiantamento_id: row.id,
          };
          const nb = await DB.addBalance(emp.id, valor, reason, session?.id || 'financeiro', meta);
if (nb == null) {
            showToast('Adiantamento registrado, mas não foi possível creditar o saldo.', 'warning');
          }
        }

        document.getElementById('advCpf').value = '';
        document.getElementById('advValor').value = '';
        const info = document.getElementById('advCpfInfo');
        if (info) { info.style.display = 'none'; info.innerHTML = ''; }
        _adiantamentoEmployee = null;

        showToast(st === 'aprovado' ? 'Adiantamento aprovado e creditado.' : 'Adiantamento recusado.', 'success');
        await this._renderAdiantamentoHistorico();
      } catch (e) {
        showToast(e.message || 'Erro ao processar.', 'error');
      } finally {
        hideLoading();
      }
    },

    async _adiantamentoHasCredit(row) {
      if (!row?.employee_id || !row?.id) return false;
      const txs = await DB.getTransactions(row.employee_id).catch(() => []);
      return (txs || []).some((t) => {
        if (String(t.type || '').toLowerCase() !== 'credit') return false;
        const m = t.meta && typeof t.meta === 'object' ? t.meta : {};
        return String(m.adiantamento_id || '') === String(row.id);
      });
    },

    async retryAdiantamentoCredit(rowId) {
      const rows = await DB.getFinanceAdiantamentos().catch(() => []);
      const row = (rows || []).find((r) => String(r.id) === String(rowId));
      if (!row) {
        showToast('Adiantamento não encontrado.', 'error');
        return;
      }
      if (String(row.status || '').toLowerCase() !== 'aprovado') {
        showToast('Só é possível creditar adiantamentos aprovados.', 'warning');
        return;
      }
      if (await this._adiantamentoHasCredit(row)) {
        showToast('Saldo já creditado para este adiantamento.', 'info');
        return;
      }
      let emp = row.employee_id ? await DB.getUser(row.employee_id).catch(() => null) : null;
      if (!emp && row.cpf) emp = await _resolveEmployeeByCpf(row.cpf);
      if (!emp?.id) {
        showToast('Funcionário não encontrado para creditar.', 'error');
        return;
      }
      const session = Auth.getSession();
      const monthLabel = row.month_key
        ? row.month_key.replace('-', '/')
        : new Date(row.created_at || Date.now()).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      const reason = `Adiantamento salarial (${monthLabel}) — desconto integral na folha subsequente`;
      const meta = {
        screen: 'adiantamento_salarial',
        kind: 'adiantamento_salarial',
        adiantamento_salarial: true,
        folha_desconto: true,
        adiantamento_id: row.id,
        retry: true,
      };
      showLoading('Creditando saldo...');
      try {
        const nb = await DB.addBalance(emp.id, row.valor, reason, session?.id || 'financeiro', meta);
        if (nb == null) {
          showToast('Não foi possível creditar o saldo.', 'error');
          return;
        }
        showToast('Saldo creditado com sucesso.', 'success');
        await this._renderAdiantamentoHistorico();
      } finally {
        hideLoading();
      }
    },

    async _renderAdiantamentoHistorico() {
      const wrap = document.getElementById('advHistoricoWrap');
      if (!wrap) return;
      const rows = await DB.getFinanceAdiantamentos().catch(() => []);
      if (!rows.length) {
        wrap.innerHTML = '<p class="text-muted" style="margin:0;font-size:13px;">Nenhum adiantamento registrado.</p>';
        return;
      }
      const creditChecks = await Promise.all(rows.slice(0, 50).map((r) => this._adiantamentoHasCredit(r)));
      const stCls = (s) => {
        const v = String(s || '').toLowerCase();
        if (v === 'aprovado') return 'badge-success';
        if (v === 'recusado') return 'badge-danger';
        return 'badge-muted';
      };
      wrap.innerHTML = `
        <h4 style="font-weight:800;margin:0 0 12px;">Histórico de adiantamentos</h4>
        <div class="table-wrap"><table class="data-table" style="width:100%;">
          <thead><tr>
            <th>Data</th><th>CPF</th><th>Funcionário</th><th>Valor</th><th>Status</th><th>Decidido por</th><th></th>
          </tr></thead>
          <tbody>${rows.slice(0, 50).map((r, i) => {
            const approved = String(r.status || '').toLowerCase() === 'aprovado';
            const credited = creditChecks[i];
            const action = approved && !credited
              ? `<button type="button" class="btn btn-sm btn-warning" onclick="FinanceiroCredito.retryAdiantamentoCredit('${esc(r.id)}')">Creditar saldo</button>`
              : (approved && credited ? '<span class="text-muted" style="font-size:12px;">Creditado</span>' : '');
            return `<tr>
            <td>${esc(fmtDt(r.created_at))}</td>
            <td>${esc(fmtCpf(r.cpf))}</td>
            <td>${esc(r.employee_name || '—')}</td>
            <td>${esc(fmtMoney(r.valor))}</td>
            <td><span class="badge ${stCls(r.status)}">${esc(String(r.status || '—').toUpperCase())}</span></td>
            <td>${esc(r.decided_by_name || '—')}</td>
            <td>${action}</td>
          </tr>`;
          }).join('')}</tbody>
        </table></div>`;
    },
  };

  window.FinanceiroCredito = FinanceiroCredito;
})();
