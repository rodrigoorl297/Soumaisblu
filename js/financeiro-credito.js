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
    try { return new Date(iso).toLocaleString('pt-BR'); } catch { return '—'; }
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
    return `${num} · ${cli}`;
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
        const url = await DB.uploadProposalFile(file, proposalId, `retorno_${key}`);
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

      const props = await DB.getProposals().catch(() => []);
      const credito = (props || []).filter(isCreditoProposal);

      root.innerHTML = `
        <div class="page-header">
          <div class="page-header-text">
            <h2>Retorno de Propostas</h2>
            <p class="text-muted">Registre o retorno do banco, anexe documentos e aceite a proposta de crédito. Documentos enviados pela Esteira de Crédito ficam disponíveis para download abaixo.</p>
          </div>
        </div>
        <div class="card card-padded">
          <div class="table-wrap" style="margin-bottom:20px;">
            <table class="data-table" style="width:100%;">
              <tbody>
                ${finGridRow('PROPOSTA', `<select id="retornoPropostaSelect" class="form-control" onchange="FinanceiroCredito.onRetornoProposalChange()">
                  <option value="">Selecione a proposta...</option>
                  ${credito.map((p) => `<option value="${esc(p.id)}">${esc(proposalLabel(p))}</option>`).join('')}
                </select>`)}
                ${finGridRow('VALOR LIBERADO', `<input type="number" id="retornoValorLiberado" class="form-control" min="0" step="0.01" placeholder="0,00"/>`)}
                ${finGridRow('PRAZO', `<input type="text" id="retornoPrazo" class="form-control" placeholder="Ex.: 84 meses"/>`)}
                ${finGridRow('TAXA DE JUROS', `<input type="text" id="retornoTaxaJuros" class="form-control" placeholder="Ex.: 1,89% a.m."/>`)}
                ${finGridRow('CET', `<input type="text" id="retornoCet" class="form-control" placeholder="Ex.: 2,15% a.m."/>`)}
                ${finGridRow('VALOR PARCELA', `<input type="number" id="retornoValorParcela" class="form-control" min="0" step="0.01" placeholder="0,00"/>`)}
                ${finGridRow('TAC', `<input type="number" id="retornoTac" class="form-control" min="0" step="0.01" placeholder="0,00"/>`)}
                ${finGridRow('VALOR LIBERADO', `<input type="number" id="retornoValorLiberado2" class="form-control" min="0" step="0.01" placeholder="0,00"/>`)}
                ${finGridRow('PAGAMENTO', `<select id="retornoPagamento" class="form-control">
                  <option value="">Selecione...</option>
                  <option value="PIX AUTOMÁTICO">PIX AUTOMÁTICO</option>
                  <option value="BOLETO">BOLETO</option>
                </select>`)}
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

    limparRetorno() {
      ['retornoValorLiberado', 'retornoPrazo', 'retornoTaxaJuros', 'retornoCet', 'retornoValorParcela', 'retornoTac', 'retornoValorLiberado2'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      const pag = document.getElementById('retornoPagamento');
      if (pag) pag.value = '';
      _resetRetornoAnexos();
    },

    async onRetornoProposalChange() {
      const id = document.getElementById('retornoPropostaSelect')?.value;
      if (!id) {
        this.limparRetorno();
        return;
      }
      const p = typeof DB.getProposal === 'function'
        ? await DB.getProposal(id).catch(() => null)
        : (await DB.getProposals().catch(() => [])).find((x) => String(x.id) === String(id));
      if (!p) return;
      const r = parseRetorno(p);
      const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val != null && val !== '' ? val : '';
      };
      set('retornoValorLiberado', r.valor_liberado ?? r.valorLiberado);
      set('retornoPrazo', r.prazo);
      set('retornoTaxaJuros', r.taxa_juros ?? r.taxaJuros);
      set('retornoCet', r.cet);
      set('retornoValorParcela', r.valor_parcela ?? r.valorParcela);
      set('retornoTac', r.tac);
      set('retornoValorLiberado2', r.valor_liberado_2 ?? r.valorLiberado2);
      set('retornoPagamento', r.pagamento);
      _resetRetornoAnexos(r.attachments || {});
    },

    async aceitarRetorno() {
      const id = document.getElementById('retornoPropostaSelect')?.value;
      if (!id) {
        showToast('Selecione uma proposta.', 'warning');
        return;
      }
      const valorLiberado = parseFloat(document.getElementById('retornoValorLiberado')?.value);
      const prazo = document.getElementById('retornoPrazo')?.value?.trim();
      const taxaJuros = document.getElementById('retornoTaxaJuros')?.value?.trim();
      const cet = document.getElementById('retornoCet')?.value?.trim();
      const valorParcela = parseFloat(document.getElementById('retornoValorParcela')?.value);
      const tac = parseFloat(document.getElementById('retornoTac')?.value);
      const valorLiberado2 = parseFloat(document.getElementById('retornoValorLiberado2')?.value);
      const pagamento = document.getElementById('retornoPagamento')?.value;

      if (!Number.isFinite(valorLiberado) || valorLiberado <= 0) {
        showToast('Informe o valor liberado.', 'warning');
        return;
      }
      if (!prazo) {
        showToast('Informe o prazo.', 'warning');
        return;
      }
      if (!pagamento) {
        showToast('Selecione a forma de pagamento.', 'warning');
        return;
      }

      const props = await DB.getProposals().catch(() => []);
      const p = typeof DB.getProposal === 'function'
        ? await DB.getProposal(id).catch(() => props.find((x) => String(x.id) === String(id)))
        : props.find((x) => String(x.id) === String(id));
      if (!p) {
        showToast('Proposta não encontrada.', 'error');
        return;
      }

      const session = Auth.getSession();
      showLoading('Salvando retorno...');
      try {
        const prev = parseRetorno(p);
        const attachments = await _uploadRetornoAnexos(id);
        const mergedAtt = { ...(prev.attachments || {}), ...attachments };

        const retorno = {
          valor_liberado: valorLiberado,
          prazo,
          taxa_juros: taxaJuros,
          cet,
          valor_parcela: Number.isFinite(valorParcela) ? valorParcela : null,
          tac: Number.isFinite(tac) ? tac : null,
          valor_liberado_2: Number.isFinite(valorLiberado2) ? valorLiberado2 : null,
          pagamento,
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
          pagamento ? `Pagamento: ${pagamento}` : '',
        ].filter(Boolean).join(' · ');

        const updated = {
          ...p,
          creditoRetorno: retorno,
          credito_retorno: retorno,
          obs: typeof DB._appendProposalObsLine === 'function'
            ? DB._appendProposalObsLine(p.obs, linha)
            : `${String(p.obs || '').trim()}\n${linha}`.trim(),
          updatedAt: new Date().toISOString(),
        };

        if (typeof DB.saveProposal === 'function') await DB.saveProposal(updated);
        else await DB.save('proposals', updated);

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
        const emp = await DB.getUserByCpf(digits);
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
      if (!emp || String(emp.cpf || '').replace(/\D/g, '') !== cpf) {
        emp = await DB.getUserByCpf(cpf);
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

    async _renderAdiantamentoHistorico() {
      const wrap = document.getElementById('advHistoricoWrap');
      if (!wrap) return;
      const rows = await DB.getFinanceAdiantamentos().catch(() => []);
      if (!rows.length) {
        wrap.innerHTML = '<p class="text-muted" style="margin:0;font-size:13px;">Nenhum adiantamento registrado.</p>';
        return;
      }
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
            <th>Data</th><th>CPF</th><th>Funcionário</th><th>Valor</th><th>Status</th><th>Decidido por</th>
          </tr></thead>
          <tbody>${rows.slice(0, 50).map((r) => `<tr>
            <td>${esc(fmtDt(r.created_at))}</td>
            <td>${esc(fmtCpf(r.cpf))}</td>
            <td>${esc(r.employee_name || '—')}</td>
            <td>${esc(fmtMoney(r.valor))}</td>
            <td><span class="badge ${stCls(r.status)}">${esc(String(r.status || '—').toUpperCase())}</span></td>
            <td>${esc(r.decided_by_name || '—')}</td>
          </tr>`).join('')}</tbody>
        </table></div>`;
    },
  };

  window.FinanceiroCredito = FinanceiroCredito;
})();
