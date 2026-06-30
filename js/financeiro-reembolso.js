/* SOU+BLU — Solicitar Reembolso (Financeiro) */
(function () {
  'use strict';

  const MOTIVOS = [
    { value: 'COMPRAS SUP.', label: 'COMPRAS SUP.', max: null },
    { value: 'COMBUSTÍVEL', label: 'COMBUSTÍVEL', max: null, combustivel: true },
    { value: 'DESPESAS GERAIS', label: 'DESPESAS GERAIS', max: null },
    { value: 'REFEICAO_DESLOCAMENTO', label: 'Refeição deslocamento', max: 60, refeicao: true },
    { value: 'ALIMENTACAO_LANCHE', label: 'Alimentação lanche', max: 30, refeicao: true },
  ];

  const ANEXO_KEYS = [
    { key: 'recibo', label: 'RECIBO', hint: 'SUJEITO A ANÁLISE' },
    { key: 'cupom_fiscal', label: 'CUPOM FISCAL', hint: 'ANÁLISE AUTOMÁTICA SEFAZ' },
    { key: 'nfe', label: 'NOTA FISCAL ELETRÔNICA', hint: 'ANÁLISE AUTOMÁTICA RFE' },
  ];

  const KM_ANEXO_KEYS = [
    { key: 'km_inicial', label: 'KM inicial — anexo' },
    { key: 'km_final', label: 'KM final do deslocamento — anexo' },
  ];

  let _anexoPending = {};
  let _cnpjEstabelecimento = null;

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

  function fmtCnpj(v) {
    const d = digits(v).slice(0, 14);
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
    if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
    if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }

  function fmtDt(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR'); } catch { return '—'; }
  }

  function motivoByValue(val) {
    return MOTIVOS.find((m) => m.value === val) || null;
  }

  function canView() {
    const s = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    if (!s || window.PARTNER_ROOT_ID) return false;
    return ['master', 'fundador', 'gerente', 'financeiro', 'financial', 'rh', 'diretoria'].includes(String(s.role || '').toLowerCase());
  }

  function blackBar(title) {
    return `<div class="reemb-black-bar">${esc(title)}</div>`;
  }

  function finGridRow(label, fieldHtml) {
    return `<tr>
      <th class="reemb-grid-th">${esc(label)}</th>
      <td class="reemb-grid-td">${fieldHtml}</td>
    </tr>`;
  }

  function simNaoSelect(id) {
    return `<select class="form-control" id="${id}"><option value="">—</option><option value="SIM">SIM</option><option value="NÃO">NÃO</option></select>`;
  }

  function _injectStyles() {
    if (document.getElementById('reemb-form-styles')) return;
    const st = document.createElement('style');
    st.id = 'reemb-form-styles';
    st.textContent = `
.reemb-form-wrap { max-width: 960px; margin: 0 auto; border: 1px solid var(--color-border, #e5e7eb); border-radius: var(--radius-md, 8px); overflow: hidden; background: #fff; }
.reemb-black-bar { background: #111; color: #fff; padding: 10px 16px; font-family: var(--font-display, 'Nunito', sans-serif); font-weight: 800; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; text-align: center; }
.reemb-grid-th { width: 34%; text-align: left; padding: 10px 12px; background: var(--color-surface-2, #f3f4f6); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; white-space: nowrap; border-bottom: 1px solid var(--color-border, #e5e7eb); vertical-align: middle; }
.reemb-grid-td { padding: 8px 12px; border-bottom: 1px solid var(--color-border, #e5e7eb); vertical-align: middle; }
.reemb-section-row td { text-align: center; font-weight: 800; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; padding: 10px 12px; background: var(--color-surface-2, #f3f4f6); border-bottom: 1px solid var(--color-border, #e5e7eb); }
.reemb-section-hint { display: block; font-size: 11px; font-weight: 600; color: var(--color-text-muted, #6b7280); margin-top: 2px; }
.reemb-limits-table { width: 100%; border-collapse: collapse; margin: 0; }
.reemb-limits-table th, .reemb-limits-table td { padding: 8px 12px; border: 1px solid var(--color-border, #e5e7eb); font-size: 12px; }
.reemb-limits-table th { background: var(--color-surface-2, #f3f4f6); font-weight: 700; text-transform: uppercase; }
.reemb-info-box { font-size: 13px; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--color-border); margin-top: 8px; background: var(--color-surface-2, #f9fafb); }
.reemb-field-hint { margin: 4px 0 0; font-size: 11px; color: var(--color-text-muted); }
.reemb-form-actions { padding: 16px 20px 20px; display: flex; justify-content: center; border-top: 1px solid var(--color-border, #e5e7eb); }
#reemb_submit_btn { font-weight: 800; letter-spacing: .03em; text-transform: uppercase; min-width: 280px; }
`;
    document.head.appendChild(st);
  }

  function _limitsTableHtml() {
    return `<table class="reemb-limits-table">
      <thead><tr><th>DESPESAS</th><th>Valor máximo permitido</th></tr></thead>
      <tbody>${MOTIVOS.map((m) => `<tr>
        <td>${esc(m.label)}</td>
        <td>${m.max != null ? esc(fmtMoney(m.max)) : 'Sem limite'}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  function _anexoRow(key, label, hint) {
    return finGridRow(label, `<span class="reemb-section-hint">${esc(hint || '')}</span>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:6px;">
        <input type="file" id="reemb_anexo_${key}" class="form-control" style="max-width:300px;" accept=".pdf,.jpg,.jpeg,.png,.webp,.xml" onchange="FinanceiroReembolso.onAnexoPick('${key}', this)"/>
        <span id="reemb_anexo_${key}_status" class="text-muted" style="font-size:12px;">Nenhum arquivo</span>
      </div>`);
  }

  function _resetAnexos() {
    _anexoPending = {};
    [...ANEXO_KEYS, ...KM_ANEXO_KEYS].forEach(({ key }) => {
      const input = document.getElementById(`reemb_anexo_${key}`);
      if (input) input.value = '';
      _setAnexoStatus(key, 'Nenhum arquivo');
    });
  }

  function _setAnexoStatus(key, label) {
    const el = document.getElementById(`reemb_anexo_${key}_status`);
    if (el) el.textContent = label || 'Nenhum arquivo';
  }

  async function _uploadAnexos(recordId) {
    const out = {};
    const allKeys = [...ANEXO_KEYS, ...KM_ANEXO_KEYS].map((k) => k.key);
    for (const key of allKeys) {
      const file = _anexoPending[key];
      if (!file) continue;
      try {
        if (typeof DB.uploadProposalFile === 'function') {
          const uploaded = await DB.uploadProposalFile(file, recordId, `reemb_${key}`);
          const url = typeof DB.resolveUploadUrl === 'function' ? DB.resolveUploadUrl(uploaded) : (uploaded?.url || uploaded);
          if (url) out[key] = url;
        } else if (typeof fileToBase64 === 'function') {
          out[key] = await fileToBase64(file);
        }
      } catch (e) {
        console.warn('[FinanceiroReembolso] anexo', key, e);
        if (typeof fileToBase64 === 'function') out[key] = await fileToBase64(file);
      }
      out[`${key}_nome`] = file.name;
    }
    return out;
  }

  const FinanceiroReembolso = {
    applyNavVisibility() {
      const show = canView();
      document.querySelectorAll(
        '#navFinReembolso, [data-section="secSolicitarReembolso"]'
      ).forEach((el) => {
        el.style.display = show ? '' : 'none';
      });
    },

    init() {
      _injectStyles();
      this.applyNavVisibility();
    },

    onMotivoChange() {
      const val = document.getElementById('reemb_motivo')?.value || '';
      const m = motivoByValue(val);
      const comb = document.getElementById('reemb_combustivel_section');
      const ref = document.getElementById('reemb_refeicao_section');
      const hint = document.getElementById('reemb_valor_hint');
      if (comb) comb.style.display = m?.combustivel ? '' : 'none';
      if (ref) ref.style.display = m?.refeicao ? '' : 'none';
      if (hint) {
        hint.textContent = m?.max != null
          ? `Máximo permitido para este motivo: ${fmtMoney(m.max)}`
          : 'Sem limite de valor para este motivo.';
      }
      const valorEl = document.getElementById('reemb_valor');
      if (valorEl && m?.max != null) valorEl.max = String(m.max);
      else if (valorEl) valorEl.removeAttribute('max');
    },

    onAnexoPick(key, input) {
      const file = input?.files?.[0];
      if (!file) return;
      if (file.size > 25 * 1024 * 1024) {
        showToast('Arquivo excede 25 MB.', 'warning');
        input.value = '';
        return;
      }
      _anexoPending[key] = file;
      _setAnexoStatus(key, file.name);
    },

    async buscarCnpj() {
      const raw = document.getElementById('reemb_cnpj')?.value || '';
      const cnpj = digits(raw);
      const info = document.getElementById('reemb_cnpj_info');
      if (cnpj.length !== 14) {
        showToast('Informe um CNPJ válido (14 dígitos).', 'warning');
        return;
      }
      showLoading('Consultando CNPJ...');
      try {
        let razao = '';
        if (typeof FonteData !== 'undefined' && typeof FonteData.lookupCnpj === 'function') {
          const res = await FonteData.lookupCnpj(cnpj);
          if (res?.error) {
            showToast(res.error, 'warning');
          } else {
            razao = res?.partner?.razao_social || res?.razao_social || res?.nome || '';
            _cnpjEstabelecimento = { cnpj, razao_social: razao };
          }
        } else if (typeof DB.getCnpjFonteCache === 'function') {
          const cached = await DB.getCnpjFonteCache(cnpj);
          if (cached) {
            razao = cached.razao_social || cached.nome || '';
            _cnpjEstabelecimento = { cnpj, razao_social: razao };
          }
        }
        document.getElementById('reemb_cnpj').value = fmtCnpj(cnpj);
        if (info) {
          info.style.display = 'block';
          info.innerHTML = razao
            ? `<strong>${esc(razao)}</strong>`
            : '<span class="text-muted">CNPJ informado — consulta indisponível.</span>';
        }
        if (razao) showToast('Estabelecimento localizado.', 'success');
      } catch (e) {
        showToast(e.message || 'Erro na consulta CNPJ.', 'error');
      } finally {
        hideLoading();
      }
    },

    limpar() {
      const form = document.getElementById('form-reembolso');
      if (form) form.reset();
      _cnpjEstabelecimento = null;
      const info = document.getElementById('reemb_cnpj_info');
      if (info) { info.style.display = 'none'; info.innerHTML = ''; }
      _resetAnexos();
      this._fillSolicitante();
      this.onMotivoChange();
    },

    _fillSolicitante() {
      const s = typeof Auth !== 'undefined' ? Auth.getSession() : null;
      const el = document.getElementById('reemb_solicitante');
      const loginEl = document.getElementById('reemb_solicitante_login');
      const loginLabel = document.getElementById('reemb_solicitante_login_label');
      const login = s?.email || s?.login || s?.id || '—';
      if (el) el.value = s?.name || '—';
      if (loginEl) loginEl.value = login;
      if (loginLabel) loginLabel.textContent = login;
    },

    _validate() {
      const motivo = document.getElementById('reemb_motivo')?.value;
      const cnpj = digits(document.getElementById('reemb_cnpj')?.value);
      const valor = parseFloat(document.getElementById('reemb_valor')?.value);
      const m = motivoByValue(motivo);

      if (!motivo) {
        showToast('Selecione o motivo da despesa.', 'warning');
        return null;
      }
      if (cnpj.length !== 14) {
        showToast('Informe o CNPJ do estabelecimento.', 'warning');
        return null;
      }
      if (!Number.isFinite(valor) || valor <= 0) {
        showToast('Informe o valor reembolsado.', 'warning');
        return null;
      }
      if (m?.max != null && valor > m.max) {
        showToast(`Valor máximo para ${m.label}: ${fmtMoney(m.max)}.`, 'warning');
        return null;
      }

      const payload = {
        motivo,
        motivo_label: m?.label || motivo,
        cnpj,
        estabelecimento_nome: _cnpjEstabelecimento?.razao_social || '',
        valor,
      };

      if (m?.combustivel) {
        const kmIni = document.getElementById('reemb_km_inicial')?.value?.trim();
        const kmFim = document.getElementById('reemb_km_final')?.value?.trim();
        if (!kmIni || !kmFim) {
          showToast('Informe KM inicial e KM final do deslocamento.', 'warning');
          return null;
        }
        if (!_anexoPending.km_inicial || !_anexoPending.km_final) {
          showToast('Anexe comprovantes de KM inicial e KM final.', 'warning');
          return null;
        }
        payload.km_inicial = kmIni;
        payload.km_final = kmFim;
      }

      if (m?.refeicao) {
        const bebida = document.getElementById('reemb_bebida')?.value;
        const valorLiquido = parseFloat(document.getElementById('reemb_valor_liquido')?.value);
        if (!bebida) {
          showToast('Informe se houve consumo de bebida alcoólica.', 'warning');
          return null;
        }
        payload.bebida_alcoolica = bebida;
        if (bebida === 'SIM') {
          if (!Number.isFinite(valorLiquido) || valorLiquido <= 0) {
            showToast('Informe o valor líquido sem bebida alcoólica.', 'warning');
            return null;
          }
          if (m.max != null && valorLiquido > m.max) {
            showToast(`Valor líquido máximo: ${fmtMoney(m.max)}.`, 'warning');
            return null;
          }
          payload.valor_liquido_sem_bebida = valorLiquido;
        }
      }

      const hasDoc = ANEXO_KEYS.some(({ key }) => _anexoPending[key]);
      if (!hasDoc) {
        showToast('Anexe ao menos um comprovante (recibo, cupom ou NF-e).', 'warning');
        return null;
      }

      return payload;
    },

    async submit(event) {
      if (event) event.preventDefault();
      if (!canView()) return;

      const data = this._validate();
      if (!data) return;

      const session = Auth.getSession();
      const now = new Date().toISOString();
      const uploadRef = `REEMB-${Date.now()}`;

      const btn = document.getElementById('reemb_submit_btn');
      const oldLabel = btn?.textContent || '';
      if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
      showLoading('Enviando para análise...');

      try {
        const attachments = await _uploadAnexos(uploadRef);
        const row = await DB.saveFinanceReembolso({
          motivo: data.motivo,
          motivo_label: data.motivo_label,
          cnpj: data.cnpj,
          estabelecimento_nome: data.estabelecimento_nome,
          valor: data.valor,
          km_inicial: data.km_inicial || null,
          km_final: data.km_final || null,
          bebida_alcoolica: data.bebida_alcoolica || null,
          valor_liquido_sem_bebida: data.valor_liquido_sem_bebida ?? null,
          solicitante_id: session?.id || null,
          solicitante_nome: session?.name || '—',
          solicitante_login: session?.email || session?.login || session?.id || null,
          status: 'em_analise',
          submitted_at: now,
          attachments,
        });

        if (!row) throw new Error('Não foi possível salvar a solicitação.');

        showToast('Reembolso enviado para análise.', 'success');
        this.limpar();
        await this._renderHistorico();
      } catch (e) {
        showToast(e.message || 'Erro ao enviar reembolso.', 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = oldLabel || 'ENVIAR PARA ANÁLISE'; }
        hideLoading();
      }
    },

    async render() {
      const root = document.getElementById('solicitarReembolsoRoot');
      if (!root || !canView()) return;

      root.innerHTML = `
        <div class="reemb-form-wrap">
          ${blackBar('SOLICITAR REEMBOLSO')}
          <form id="form-reembolso" onsubmit="FinanceiroReembolso.submit(event)">
            <div class="table-wrap" style="margin:0;border:none;">
              <table class="data-table" style="width:100%;border-collapse:collapse;">
                <tbody>
                  ${finGridRow('MOTIVO', `<select id="reemb_motivo" class="form-control" required onchange="FinanceiroReembolso.onMotivoChange()">
                    <option value="">Selecione...</option>
                    ${MOTIVOS.map((m) => `<option value="${esc(m.value)}">${esc(m.label)}</option>`).join('')}
                  </select>`)}
                  ${finGridRow('CNPJ DO ESTABELECIMENTO', `<div class="form-row" style="gap:8px;margin:0;flex-wrap:wrap;">
                    <input type="text" id="reemb_cnpj" class="form-control mask-cnpj" placeholder="00.000.000/0000-00" required style="flex:1;min-width:180px;"/>
                    <button type="button" class="btn btn-accent btn-api-lookup" onclick="FinanceiroReembolso.buscarCnpj()">CONSULTAR CNPJ</button>
                  </div>
                  <div id="reemb_cnpj_info" class="reemb-info-box" style="display:none;"></div>`)}
                  ${finGridRow('SOLICITANTE', `<input type="text" id="reemb_solicitante" class="form-control" readonly style="background:#f3f4f6;font-weight:600;"/>
                    <input type="hidden" id="reemb_solicitante_login"/>
                    <p class="reemb-field-hint">Login funcionário: <span id="reemb_solicitante_login_label">—</span></p>`)}
                  ${finGridRow('Valor reembolsado', `<input type="number" id="reemb_valor" class="form-control" min="0.01" step="0.01" placeholder="0,00" required/>
                    <p id="reemb_valor_hint" class="reemb-field-hint">Selecione o motivo para ver o limite.</p>`)}
                </tbody>
              </table>
            </div>

            <div id="reemb_combustivel_section" style="display:none;">
              ${blackBar('habilitar para combustível')}
              <table class="data-table" style="width:100%;border-collapse:collapse;">
                <tbody>
                  ${finGridRow('KM inicial', `<input type="text" id="reemb_km_inicial" class="form-control" placeholder="Ex.: 12.450"/>`)}
                  ${_anexoRow('km_inicial', 'KM inicial', 'Anexo obrigatório')}
                  ${finGridRow('KM final do deslocamento', `<input type="text" id="reemb_km_final" class="form-control" placeholder="Ex.: 12.680"/>`)}
                  ${_anexoRow('km_final', 'KM final do deslocamento', 'Anexo obrigatório')}
                </tbody>
              </table>
            </div>

            <div id="reemb_refeicao_section" style="display:none;">
              ${blackBar('habilitar para refeição')}
              <table class="data-table" style="width:100%;border-collapse:collapse;">
                <tbody>
                  ${finGridRow('Consumo bebida alcoólica?', simNaoSelect('reemb_bebida'))}
                  ${finGridRow('Valor líquido sem bebida alcoólica', `<input type="number" id="reemb_valor_liquido" class="form-control" min="0" step="0.01" placeholder="0,00"/>
                    <p class="reemb-field-hint">Obrigatório quando houver bebida alcoólica.</p>`)}
                </tbody>
              </table>
            </div>

            <table class="data-table" style="width:100%;border-collapse:collapse;">
              <tbody>
                <tr class="reemb-section-row"><td colspan="2">COMPROVANTES</td></tr>
                ${ANEXO_KEYS.map(({ key, label, hint }) => _anexoRow(key, label, hint)).join('')}
              </tbody>
            </table>

            <div style="padding:16px 20px;border-top:1px solid var(--color-border,#e5e7eb);">
              ${blackBar('LIMITES POR DESPESA')}
              <div style="margin-top:12px;">${_limitsTableHtml()}</div>
            </div>

            <div class="reemb-form-actions">
              <button type="button" class="btn btn-ghost" onclick="FinanceiroReembolso.limpar()">Limpar</button>
              <button type="submit" class="btn btn-primary btn-lg" id="reemb_submit_btn">ENVIAR PARA ANÁLISE</button>
            </div>
          </form>
          <div id="reembHistoricoWrap" style="padding:16px 20px 24px;border-top:1px solid var(--color-border,#e5e7eb);"></div>
        </div>`;

      _resetAnexos();
      this._fillSolicitante();
      if (typeof applyInputMasks === 'function') applyInputMasks(root);
      this.onMotivoChange();
      await this._renderHistorico();
    },

    async _renderHistorico() {
      const wrap = document.getElementById('reembHistoricoWrap');
      if (!wrap) return;
      const rows = await DB.getFinanceReembolsos().catch(() => []);
      if (!rows.length) {
        wrap.innerHTML = '<p class="text-muted" style="margin:0;font-size:13px;">Nenhuma solicitação de reembolso registrada.</p>';
        return;
      }
      const stCls = (s) => {
        const v = String(s || '').toLowerCase();
        if (v === 'aprovado') return 'badge-success';
        if (v === 'recusado' || v === 'rejeitado') return 'badge-danger';
        return 'badge-warning';
      };
      const stLabel = (s) => {
        const v = String(s || '').toLowerCase();
        if (v === 'em_analise') return 'EM ANÁLISE';
        return String(s || '—').toUpperCase();
      };
      wrap.innerHTML = `
        <h4 style="font-weight:800;margin:0 0 12px;">Solicitações recentes</h4>
        <div class="table-wrap"><table class="data-table" style="width:100%;">
          <thead><tr>
            <th>Data</th><th>Solicitante</th><th>Motivo</th><th>CNPJ</th><th>Valor</th><th>Status</th>
          </tr></thead>
          <tbody>${rows.slice(0, 40).map((r) => `<tr>
            <td>${esc(fmtDt(r.submitted_at || r.created_at))}</td>
            <td>${esc(r.solicitante_nome || '—')}</td>
            <td>${esc(r.motivo_label || r.motivo || '—')}</td>
            <td>${esc(fmtCnpj(r.cnpj))}</td>
            <td>${esc(fmtMoney(r.valor))}</td>
            <td><span class="badge ${stCls(r.status)}">${esc(stLabel(r.status))}</span></td>
          </tr>`).join('')}</tbody>
        </table></div>`;
    },
  };

  window.FinanceiroReembolso = FinanceiroReembolso;
})();
