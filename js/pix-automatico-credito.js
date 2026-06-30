/* SOU+BLU — Pix Automático Efi Pay (propostas de crédito) */
(function () {
  'use strict';

  const DBG_INGEST = 'http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1';

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function fmtDt(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR'); } catch { return '—'; }
  }

  function fmtMoney(v) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return '—';
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }

  function _dbgLog(location, message, data, hypothesisId) {
    const payload = {
      sessionId: '97c411',
      location,
      message,
      data: data || {},
      timestamp: Date.now(),
      hypothesisId: hypothesisId || 'pix-auto',
      runId: 'pix-auto-v1',
    };
    fetch(DBG_INGEST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '97c411' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  function apiBase() {
    const c = window.SOUBLU_CONFIG || {};
    return String(c.API_BASE_URL || c.SITE_URL || location.origin || '').replace(/\/+$/, '');
  }

  function apiKey() {
    return (window.SOUBLU_CONFIG || {}).API_KEY || '';
  }

  async function _req(action, opts = {}) {
    const base = apiBase();
    if (!base) throw new Error('API base URL indisponível.');
    const qs = new URLSearchParams({ action, ...(opts.query || {}) });
    const url = `${base}/api/credito_pix_auto_api.php?${qs}`;
    const headers = { 'X-API-Key': apiKey() };
    const init = { method: opts.method || 'GET', headers };
    if (opts.body) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    _dbgLog('pix-automatico-credito.js:_req', `call ${action}`, { action, method: init.method }, 'pix-auto-api');
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      _dbgLog('pix-automatico-credito.js:_req:fail', `error ${action}`, { action, error: data.error, status: res.status }, 'pix-auto-api');
      throw new Error(data.error || `Erro HTTP ${res.status}`);
    }
    _dbgLog('pix-automatico-credito.js:_req:ok', `ok ${action}`, { action }, 'pix-auto-api');
    return data;
  }

  function _statusClass(status) {
    const s = String(status || '').toUpperCase();
    if (s === 'APROVADA' || s === 'ATIVA' || s === 'CONCLUIDA') return 'ec-status-aprovado';
    if (s === 'REJEITADA' || s === 'CANCELADA' || s === 'EXPIRADA') return 'ec-status-recusado';
    return 'ec-status-pendente';
  }

  function _badge(label, status) {
    const st = String(status || '—').toUpperCase();
    return `<span class="ec-status-badge ${_statusClass(st)}" title="${esc(label)}">${esc(label)}: ${esc(st)}</span>`;
  }

  function _qrImg(pix) {
    if (!pix) return '';
    const src = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(pix);
    return `<div style="margin-top:10px;">
      <img src="${src}" alt="QR Code Pix Automático" width="180" height="180" style="border:1px solid #e5e7eb;border-radius:8px;"/>
    </div>`;
  }

  function _renderPanel(pa) {
    const pix = pa.pix_copia_cola || '';
    const cobrancas = Array.isArray(pa.cobrancas) ? pa.cobrancas : [];
    const cobRows = cobrancas.length
      ? cobrancas.map((c) =>
        `<tr><td>${esc(c.parcela)}</td><td>${esc(c.vencimento)}</td><td>${esc(fmtMoney(c.valor))}</td><td>${esc(c.status || '—')}</td></tr>`
      ).join('')
      : '<tr><td colspan="4" class="text-muted">Nenhuma cobrança gerada</td></tr>';

    const banco = _contaCtx.banco || pa.destinatario?.banco || '—';
    const agencia = _contaCtx.agencia || pa.destinatario?.agencia || '—';
    const conta = _contaCtx.conta || pa.destinatario?.conta || '—';
    const temConta = banco !== '—' && agencia !== '—' && conta !== '—';
    const passoRec = pa.idRec ? '✓' : '1';
    const passoQr = pa.idRec ? (pa.status === 'APROVADA' ? '✓' : '2') : '2';
    const passoCobr = pa.status === 'APROVADA' ? (cobrancas.length ? '✓' : '4') : '4';

    return `
      <div class="ec-section-label" style="margin-top:20px;">PIX Automático (Efi Pay — API Pix)</div>
      <p class="text-muted" style="font-size:11px;margin:0 0 10px;padding:0 4px;">
        Débito recorrente na conta corrente informada na proposta (BB, Bradesco, Santander, Itaú ou Caixa). Usa <strong>API Pix</strong>, não API Cobranças (boleto/cartão).
        <a href="https://dev.efipay.com.br/docs/api-pix/pix-automatico" target="_blank" rel="noopener">Documentação</a>
      </p>
      <div class="text-muted" style="font-size:11px;margin:0 0 12px;padding:8px 12px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;line-height:1.6;">
        <strong>Fluxo (Jornada 2 — QR Code):</strong><br>
        ${passoRec} <strong>Criar recorrência</strong> → gera o Pix Copia e Cola<br>
        ${passoQr} <strong>Funcionário autoriza no app do banco</strong> (QR) — isso confirma a conta e o débito automático<br>
        3 <strong>Atualizar status</strong> até <em>APROVADA</em><br>
        ${passoCobr} <strong>Gerar cobranças</strong> mensais<br>
        <span style="color:#6b7280;">O botão <em>Verificar conta</em> é opcional (Jornada 1 — notificação push no banco). Na Jornada 2, a verificação ocorre quando o funcionário aceita o QR.</span>
      </div>
      <div class="table-wrap" style="margin-bottom:16px;">
        <table class="data-table" style="width:100%;">
          <tbody>
            <tr>
              <th class="ec-grid-th">CONTA DO FUNCIONÁRIO</th>
              <td class="ec-grid-td">
                ${temConta
                  ? `<div style="font-size:12px;line-height:1.7;">
                      <div><strong>Banco:</strong> ${esc(banco)}</div>
                      <div><strong>Agência:</strong> ${esc(agencia)} · <strong>Conta:</strong> ${esc(conta)}</div>
                    </div>`
                  : '<span class="text-muted">Dados bancários não encontrados na proposta. O funcionário deve informar banco, agência e conta ao solicitar o crédito.</span>'}
              </td>
            </tr>
            <tr>
              <th class="ec-grid-th">AÇÕES</th>
              <td class="ec-grid-td">
                <div style="display:flex;flex-wrap:wrap;gap:8px;">
                  <button type="button" class="btn btn-primary btn-sm" id="paBtnCriarRec">Criar recorrência</button>
                  <button type="button" class="btn btn-accent btn-sm" id="paBtnVerificarConta" title="Opcional — Jornada 1 (push no banco). Na Jornada 2 use o QR Code.">Verificar conta (opcional)</button>
                  <button type="button" class="btn btn-ghost btn-sm" id="paBtnAtualizar">Atualizar status</button>
                  <button type="button" class="btn btn-outline btn-sm" id="paBtnGerarCobr">Gerar cobranças</button>
                </div>
                <div id="paActionMsg" class="text-muted" style="font-size:12px;margin-top:8px;"></div>
              </td>
            </tr>
            <tr>
              <th class="ec-grid-th">STATUS</th>
              <td class="ec-grid-td">
                <div style="display:flex;flex-wrap:wrap;gap:8px;" id="paStatusBadges">
                  ${_badge('Recorrência', pa.status || '—')}
                  ${pa.solic_status ? _badge('Conta', pa.solic_status) : ''}
                  ${pa.mock ? '<span class="ec-status-badge ec-status-pendente">MODO MOCK</span>' : ''}
                </div>
                <div class="text-muted" style="font-size:12px;margin-top:6px;">
                  ${pa.idRec ? `idRec: <code>${esc(pa.idRec)}</code>` : 'Recorrência ainda não criada'}
                  ${pa.idSolicRec ? ` · idSolicRec: <code>${esc(pa.idSolicRec)}</code>` : ''}
                </div>
              </td>
            </tr>
            <tr>
              <th class="ec-grid-th">PIX COPIA E COLA</th>
              <td class="ec-grid-td">
                ${pix
                  ? `<textarea id="paPixCopiaCola" class="form-control" rows="3" readonly style="font-size:11px;font-family:monospace;">${esc(pix)}</textarea>
                     <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
                       <button type="button" class="btn btn-ghost btn-sm" id="paBtnCopyPix">Copiar código</button>
                     </div>
                     ${_qrImg(pix)}`
                  : '<span class="text-muted">Crie a recorrência para gerar o QR Code de autorização.</span>'}
              </td>
            </tr>
            <tr>
              <th class="ec-grid-th">COBRANÇAS</th>
              <td class="ec-grid-td">
                <div class="table-wrap">
                  <table class="data-table" style="width:100%;font-size:12px;">
                    <thead><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th><th>Status</th></tr></thead>
                    <tbody>${cobRows}</tbody>
                  </table>
                </div>
                ${pa.cobrancas_geradas_em ? `<div class="text-muted" style="font-size:11px;margin-top:6px;">Geradas em ${esc(fmtDt(pa.cobrancas_geradas_em))}</div>` : ''}
              </td>
            </tr>
          </tbody>
        </table>
      </div>`;
  }

  function _wireButtons(host) {
    const map = [
      ['paBtnCriarRec', () => PixAutomaticoCredito.onCriarRecorrencia()],
      ['paBtnVerificarConta', () => PixAutomaticoCredito.onVerificarConta()],
      ['paBtnAtualizar', () => PixAutomaticoCredito.onConsultar()],
      ['paBtnGerarCobr', () => PixAutomaticoCredito.onGerarCobrancas()],
    ];
    map.forEach(([id, fn]) => {
      const el = host.querySelector('#' + id);
      if (el) el.addEventListener('click', fn);
    });
    const copyBtn = host.querySelector('#paBtnCopyPix');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const ta = host.querySelector('#paPixCopiaCola');
        if (!ta) return;
        ta.select();
        document.execCommand('copy');
        _setMsg('Código Pix copiado.', 'success');
      });
    }
  }

  function _setMsg(text, tone) {
    const el = document.getElementById('paActionMsg');
    if (!el) return;
    const color = tone === 'success' ? '#059669' : tone === 'error' ? '#dc2626' : '#6b7280';
    el.innerHTML = `<span style="color:${color};">${esc(text)}</span>`;
  }

  function _proposalId() {
    return document.getElementById('ecProposalSelect')?.value?.trim() || '';
  }

  let _currentPa = {};
  let _contaCtx = {};

  const PixAutomaticoCredito = {
    async health() {
      return _req('health');
    },

    async criarRecorrencia(proposalId) {
      return _req('criar_recorrencia', { method: 'POST', body: { proposal_id: String(proposalId) } });
    },

    async verificarConta(proposalId) {
      return _req('verificar_conta', { method: 'POST', body: { proposal_id: String(proposalId) } });
    },

    async consultar(proposalId) {
      return _req('consultar', { query: { proposal_id: String(proposalId) } });
    },

    async gerarCobrancas(proposalId) {
      return _req('gerar_cobrancas', { method: 'POST', body: { proposal_id: String(proposalId) } });
    },

    mount(hostId = 'ecPixAutoHost') {
      const host = document.getElementById(hostId);
      if (!host) return;
      host.innerHTML = _renderPanel(_currentPa);
      _wireButtons(host);
    },

    mountFromEsteira(pa, contaCtx) {
      _currentPa = pa && typeof pa === 'object' ? { ...pa } : {};
      _contaCtx = contaCtx && typeof contaCtx === 'object' ? { ...contaCtx } : {};
      this.mount('ecPixAutoHost');
    },

    async _runAction(label, fn) {
      const id = _proposalId();
      if (!id) {
        if (typeof showToast === 'function') showToast('Selecione uma proposta.', 'warning');
        return;
      }
      _setMsg(`${label}...`);
      if (typeof showLoading === 'function') showLoading(label + '...');
      try {
        const data = await fn(id);
        _currentPa = data.pix_automatico || _currentPa;
        this.mount('ecPixAutoHost');
        const msg = data.message || `${label} concluído.`;
        _setMsg(msg, 'success');
        if (typeof showToast === 'function') showToast(msg, 'success');
        _dbgLog('pix-automatico-credito.js:action', label, { proposalId: id, status: _currentPa.status }, 'pix-auto-ui');
        if (window.EsteiraCredito?.onProposalChange) {
          await EsteiraCredito.onProposalChange();
        }
      } catch (e) {
        const err = e.message || String(e);
        _setMsg(err, 'error');
        if (typeof showToast === 'function') showToast(err, 'error');
        _dbgLog('pix-automatico-credito.js:action:fail', label, { proposalId: id, error: err }, 'pix-auto-ui');
      } finally {
        if (typeof hideLoading === 'function') hideLoading();
      }
    },

    onCriarRecorrencia() {
      return this._runAction('Criar recorrência', (id) => this.criarRecorrencia(id));
    },

    onVerificarConta() {
      return this._runAction('Verificar conta', (id) => this.verificarConta(id));
    },

    onConsultar() {
      return this._runAction('Atualizar status', (id) => this.consultar(id));
    },

    onGerarCobrancas() {
      return this._runAction('Gerar cobranças', (id) => this.gerarCobrancas(id));
    },
  };

  window.PixAutomaticoCredito = PixAutomaticoCredito;
})();
