/* SOU+BLU — Pix Automático Efi Pay (propostas de crédito) */
(function () {
  'use strict';

  const POLL_MS = 20000;
  let _pollTimer = null;

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

  function apiBase() {
    const c = window.SOUBLU_CONFIG || {};
    return String(c.API_BASE_URL || c.SITE_URL || location.origin || '').replace(/\/+$/, '');
  }

  function apiKey() {
    return (window.SOUBLU_CONFIG || {}).API_KEY || '';
  }

  async function _dbgLog(location, message, data, hypothesisId) {
    try {
      await fetch(`${apiBase()}/api/credito_api.php?action=client_log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey() },
        body: JSON.stringify({
          sessionId: '97c411',
          location,
          message,
          data: data || {},
          hypothesisId: hypothesisId || '',
          runId: 'push-debug',
          timestamp: Date.now(),
        }),
      });
    } catch (_) { /* ignore */ }
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
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `Erro HTTP ${res.status}`);
    }
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

  function _faseLabel(fase) {
    const map = {
      cobrancas_prontas: 'Cobranças agendadas',
      aprovada_gerar_cobrancas: 'Aprovada — gerando cobranças',
      aguardando_aprovacao_banco: 'Aguardando autorização no banco',
      aguardando_verificacao_conta: 'Aguardando dados bancários',
      inicial: 'Não iniciado',
    };
    return map[fase] || fase || '—';
  }

  function _needsPolling(pa, fase) {
    if (fase) {
      return fase === 'aguardando_aprovacao_banco' || fase === 'aguardando_verificacao_conta' || fase === 'aprovada_gerar_cobrancas';
    }
    const st = String(pa.status || '').toUpperCase();
    const cobrancas = Array.isArray(pa.cobrancas) ? pa.cobrancas : [];
    const parcelas = parseInt(pa.parcelas, 10) || 0;
    if (parcelas > 0 && cobrancas.length >= parcelas) return false;
    if (st === 'APROVADA' && cobrancas.length < parcelas) return true;
    if (pa.idSolicRec && st !== 'APROVADA' && st !== 'REJEITADA' && st !== 'CANCELADA') return true;
    return false;
  }

  function _aguardandoAutorizacao(pa, fase) {
    if (fase === 'aguardando_aprovacao_banco' || fase === 'aguardando_verificacao_conta') return true;
    const solic = String(pa.solic_status || '').toUpperCase();
    const rec = String(pa.status || '').toUpperCase();
    if (pa.idSolicRec && (solic === 'ENVIADA' || solic === 'CRIADA')) return true;
    if (pa.idSolicRec && rec === 'CRIADA' && solic !== 'APROVADA' && solic !== 'REJEITADA') return true;
    return false;
  }

  function _isNubank(banco) {
    return /260|nubank|nu pagamentos/i.test(String(banco || ''));
  }

  function _isSantander(banco) {
    return /033|santander/i.test(String(banco || ''));
  }

  function _renderBancoAlert(pa, fase, banco, agencia, conta) {
    if (!_aguardandoAutorizacao(pa, fase)) return '';
    const isSantander = _isSantander(banco);
    const isNubank = _isNubank(banco);
    const solic = String(pa.solic_status || '').toUpperCase();
    const rec = String(pa.status || '').toUpperCase();
    const statusLine = [solic && `conta: ${solic}`, rec && `recorrência: ${rec}`].filter(Boolean).join(' · ');
    const temQr = !!(pa.pix_copia_cola || '');

    if (isNubank) {
      return `
      <div role="alert" style="margin:0 0 14px;padding:14px 16px;background:#f5f3ff;border:2px solid #a78bfa;border-radius:10px;line-height:1.65;font-size:13px;">
        <div style="font-size:14px;font-weight:800;color:#5b21b6;margin-bottom:8px;">Nubank — autorização pendente</div>
        <p style="margin:0 0 10px;color:#4c1d95;">
          O banco pode <strong>não enviar push</strong>. Peça ao funcionário abrir o <strong>painel SOU+BLU no celular</strong> → menu <strong>Autorizar Pix</strong>.
        </p>
        <ol style="margin:0 0 10px 18px;padding:0;color:#5b21b6;font-weight:600;">
          <li>No app do funcionário: <strong>Autorizar Pix</strong> (código e passo a passo)</li>
          <li>Ou no Nubank: <strong>Pix → Pix Automático → Autorizações pendentes</strong></li>
          <li>Agência costuma ser <strong>0001</strong> — conta <strong>${esc(conta)}</strong></li>
        </ol>
        ${statusLine ? `<div style="font-size:11px;color:#9ca3af;margin-bottom:8px;">Status Efi: ${esc(statusLine)}</div>` : ''}
        ${temQr ? `<div style="font-size:12px;color:#374151;padding-top:8px;border-top:1px solid #ddd6fe;">
          <strong>Alternativa:</strong> escaneie o QR abaixo no Nubank (Pix → Pagar → Ler QR Code).
        </div>` : ''}
      </div>`;
    }

    if (isSantander) {
      return `
      <div role="alert" style="margin:0 0 14px;padding:14px 16px;background:#fef2f2;border:2px solid #f87171;border-radius:10px;line-height:1.65;font-size:13px;">
        <div style="font-size:14px;font-weight:800;color:#b91c1c;margin-bottom:8px;">Santander — autorização pendente</div>
        <p style="margin:0 0 10px;color:#7f1d1d;">
          <strong>O push do Pix Automático (Jornada 1) muitas vezes NÃO aparece como notificação</strong> no app Santander,
          mesmo com status <strong>ENVIADA</strong> na Efi. Peça ao funcionário para abrir o app manualmente:
        </p>
        <ol style="margin:0 0 10px 18px;padding:0;color:#991b1b;font-weight:600;">
          <li><strong>Pix</strong> → <strong>Pix Automático</strong> → <strong>Autorizações pendentes</strong></li>
          <li>Confirme a conta <strong>Ag ${esc(agencia)} Cc ${esc(conta)}</strong> (igual ao app)</li>
          <li>O CPF da proposta deve ser o <strong>titular</strong> dessa conta</li>
        </ol>
        ${statusLine ? `<div style="font-size:11px;color:#9ca3af;margin-bottom:8px;">Status Efi: ${esc(statusLine)}</div>` : ''}
        ${temQr ? `<div style="font-size:12px;color:#374151;padding-top:8px;border-top:1px solid #fecaca;">
          <strong>Alternativa (Jornada 2):</strong> escaneie o QR Code abaixo no app Santander (Pix → Pagar → Ler QR).
        </div>` : ''}
      </div>`;
    }

    return `
      <div role="alert" style="margin:0 0 14px;padding:12px 14px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;line-height:1.6;font-size:12px;">
        <strong>Aguardando autorização no banco.</strong>
        ${statusLine ? ` Status: ${esc(statusLine)}.` : ''}
        Se o push não chegar, abra o app em <strong>Pix → Pix Automático → Autorizações pendentes</strong>.
        ${temQr ? ' Ou use o QR Code abaixo (Jornada 2).' : ''}
      </div>`;
  }

  function _qrImgUrl(pix) {
    if (!pix) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(pix)}`;
  }

  function _renderQrBlock(pa, fase, pix) {
    if (!pix) return '';
    const aguardando = _aguardandoAutorizacao(pa, fase);
    if (!aguardando) {
      return `<tr>
        <th class="ec-grid-th">QR (alternativa)</th>
        <td class="ec-grid-td">
          <details style="font-size:12px;">
            <summary style="cursor:pointer;color:var(--color-text-muted);">Usar QR Code só se o push do banco não chegar</summary>
            <textarea id="paPixCopiaCola" class="form-control" rows="2" readonly style="font-size:11px;font-family:monospace;margin-top:8px;">${esc(pix)}</textarea>
            <button type="button" class="btn btn-ghost btn-sm" id="paBtnCopyPix" style="margin-top:6px;">Copiar código</button>
          </details>
        </td>
      </tr>`;
    }
    return `
      <div style="margin:0 0 16px;padding:14px;background:#f0f9ff;border:1px solid #7dd3fc;border-radius:10px;">
        <div style="font-size:13px;font-weight:700;color:#0369a1;margin-bottom:6px;">QR Code — Jornada 2 (alternativa ao push)</div>
        <p class="text-muted" style="font-size:12px;margin:0 0 10px;line-height:1.5;">
          Se não encontrar a autorização em <strong>Pix Automático → Pendentes</strong>, escaneie este QR no app do banco
          (<strong>Pix → Pagar → Ler QR Code</strong>) ou copie o código abaixo.
          O <strong>solicitante</strong> também vê este QR no painel dele (menu <strong>Autorizar Pix</strong>).
        </p>
        <div style="text-align:center;margin:10px 0;">
          <img src="${esc(_qrImgUrl(pix))}" alt="QR Code Pix" width="220" height="220"
            style="max-width:100%;border-radius:8px;background:#fff;padding:8px;"/>
        </div>
        <textarea id="paPixCopiaCola" class="form-control" rows="3" readonly style="font-size:11px;font-family:monospace;">${esc(pix)}</textarea>
        <button type="button" class="btn btn-primary btn-sm" id="paBtnCopyPix" style="margin-top:8px;">Copiar código Pix</button>
      </div>`;
  }

  function _renderContaConferencia(cmp) {
    if (!cmp || typeof cmp !== 'object') return '';
    const conf = cmp.conferencia || {};
    const ok = conf.tudo_bate;
    const pendente = conf.pendente_envio && !cmp.efi_respondeu;
    const bg = ok ? '#ecfdf5' : pendente ? '#fffbeb' : '#fef2f2';
    const border = ok ? '#6ee7b7' : pendente ? '#fcd34d' : '#fecaca';
    const icon = ok ? '✓' : pendente ? '⏳' : '⚠';
    const titulo = ok
      ? 'Conferência de conta (bate com a Efi)'
      : pendente
        ? 'Conferência de conta (aguardando envio ao banco)'
        : 'Conferência de conta (verifique divergências)';
    const prop = cmp.proposta || {};
    const env = cmp.enviado_efipay || {};
    const efi = cmp.efi_respondeu || {};
    const app = cmp.app_banco_deve_mostrar || {};
    return `
      <div id="paContaConferencia" style="margin-top:10px;padding:12px;background:${bg};border:1px solid ${border};border-radius:8px;font-size:12px;line-height:1.7;">
        <div style="font-weight:700;margin-bottom:8px;">${icon} ${esc(titulo)}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
          <div><strong>Na proposta</strong><br>Ag ${esc(prop.agencia || '—')}<br>Conta ${esc(prop.conta || '—')}<br>CPF ${esc(prop.cpf || '—')}</div>
          <div><strong>Enviado à Efi (API)</strong><br>Ag ${esc(env.agencia || '—')}<br>Conta ${esc(env.conta_api || '—')}<br>CPF ${esc(env.cpf || '—')}<br><span class="text-muted">No app: ${esc(env.conta_exibicao || prop.conta || '—')}</span></div>
          ${cmp.efi_respondeu ? `<div><strong>Efi confirmou</strong><br>Ag ${esc(efi.agencia || '—')}<br>Conta ${esc(efi.conta || '—')}<br>CPF ${esc(efi.cpf || '—')}<br>Status ${esc(efi.status || '—')}</div>` : `<div><strong>Efi</strong><br><span class="text-muted">Autorização ainda não enviada ou cancelada.<br>Use <strong>Reenviar ao banco</strong>.</span></div>`}
          <div><strong>App do banco deve mostrar</strong><br>Ag ${esc(app.agencia || '—')}<br>Conta ${esc(app.conta || '—')}<br>CPF ${esc(app.cpf || '—')}</div>
        </div>
        <div style="margin-top:8px;color:#374151;">${esc(cmp.resumo || '')}</div>
        ${app.dica ? `<div class="text-muted" style="margin-top:6px;">${esc(app.dica)}</div>` : ''}
        ${conf.conta_api_sem_digito && !ok ? `<div class="text-muted" style="margin-top:6px;">Santander: a API recebe a conta <strong>sem</strong> o dígito após o hífen (ex.: 01011476-0 → 01011476).</div>` : ''}
        ${/nubank|260/i.test(String(cmp.proposta?.banco || '')) && !ok ? `<div class="text-muted" style="margin-top:6px;">Nubank: a API recebe conta <strong>com</strong> o dígito junto (ex.: 26972551-6 → 269725516).</div>` : ''}
      </div>`;
  }

  function _renderPanel(pa, fase, contaCmp) {
    const pix = pa.pix_copia_cola || '';
    const cobrancas = Array.isArray(pa.cobrancas) ? pa.cobrancas : [];
    const parcelas = parseInt(pa.parcelas, 10) || 0;
    const cobRows = cobrancas.length
      ? cobrancas.map((c) =>
        `<tr><td>${esc(c.parcela)}</td><td>${esc(c.vencimento)}</td><td>${esc(fmtMoney(c.valor))}</td><td>${esc(c.status || '—')}</td></tr>`
      ).join('')
      : '<tr><td colspan="4" class="text-muted">As cobranças serão geradas automaticamente após aprovação no banco.</td></tr>';

    const banco = _contaCtx.banco || pa.destinatario?.banco || '—';
    const agencia = _contaCtx.agencia || pa.agencia_raw || pa.destinatario?.agencia || '—';
    const conta = _contaCtx.conta || pa.conta_raw || pa.destinatario?.conta || '—';
    const contaEnviada = pa.conta_enviada || '';
    const agenciaEnviada = pa.agencia_enviada || '';
    const temConta = banco !== '—' && agencia !== '—' && conta !== '—';
    const fluxoOk = fase === 'cobrancas_prontas';
    const aguardando = _needsPolling(pa, fase);
    const aguardandoAuth = _aguardandoAutorizacao(pa, fase);
    const podeReenviar = pa.idRec && !fluxoOk && String(pa.status || '').toUpperCase() !== 'APROVADA';
    const isNubank = _isNubank(banco);
    const isSantander = _isSantander(banco);
    const qrBlock = _renderQrBlock(pa, fase, pix);

    return `
      <div class="ec-section-label" style="margin-top:20px;">Débito automático na conta</div>
      ${_renderBancoAlert(pa, fase, banco, agencia, conta)}
      ${qrBlock && aguardandoAuth ? qrBlock : ''}
      <p class="text-muted" style="font-size:12px;margin:0 0 10px;padding:0 4px;line-height:1.6;">
        Peça ao <strong>solicitante</strong> abrir o <strong>painel SOU+BLU no celular</strong> → <strong>Autorizar Pix</strong> (passo a passo + QR Code).
        ${aguardandoAuth && isNubank
          ? ' Alternativa no Nubank: <strong>Pix → Pix Automático → Autorizações pendentes</strong>.'
          : aguardandoAuth && isSantander
          ? ' Alternativa no Santander: <strong>Pix Automático → Pendentes</strong>.'
          : ' Ele autoriza no app do banco ou colando o código Pix.'}
        Depois da aprovação, as <strong>${esc(parcelas || '—')} parcelas</strong> de <strong>${esc(fmtMoney(pa.valor_rec))}</strong> são agendadas automaticamente.
      </p>
      <div style="font-size:12px;margin:0 0 12px;padding:10px 12px;background:${fluxoOk ? '#ecfdf5' : '#fffbeb'};border:1px solid ${fluxoOk ? '#6ee7b7' : '#fcd34d'};border-radius:8px;line-height:1.6;">
        <strong>Etapa atual:</strong> ${esc(_faseLabel(fase))}
        ${aguardando ? '<br><span class="text-muted">Atualizando automaticamente a cada 20 segundos…</span>' : ''}
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
                      ${contaEnviada ? `<div style="margin-top:6px;color:#92400e;"><strong>Enviado ao banco:</strong> Ag ${esc(agenciaEnviada || agencia)} · conta ${esc(contaEnviada)} — deve bater com o app.</div>` : ''}
                      <div style="margin-top:8px;">
                        <button type="button" class="btn btn-accent btn-sm" id="paBtnConsultarConta">Consultar conta na Efi</button>
                      </div>
                      ${contaCmp ? _renderContaConferencia(contaCmp) : '<div id="paContaConferenciaHost"></div>'}
                    </div>`
                  : '<span class="text-muted">Informe banco, agência e conta na proposta para débito automático.</span>'}
              </td>
            </tr>
            <tr>
              <th class="ec-grid-th">AÇÃO</th>
              <td class="ec-grid-td">
                <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
                  ${fluxoOk
                    ? '<span style="color:#059669;font-weight:700;">✓ Débito automático ativo</span>'
                    : `<button type="button" class="btn btn-primary btn-sm" id="paBtnIniciarFluxo">${pa.idRec ? 'Sincronizar agora' : 'Iniciar débito automático'}</button>
                       ${podeReenviar ? '<button type="button" class="btn btn-accent btn-sm" id="paBtnReenviar">Reenviar ao banco</button>' : ''}`}
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
                  ${pa.parcelas ? `${esc(pa.parcelas)}× ${esc(fmtMoney(pa.valor_rec))} · 1º desconto ${esc(pa.data_inicial || '—')}` : ''}
                </div>
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
            ${qrBlock && !aguardandoAuth ? qrBlock : ''}
          </tbody>
        </table>
      </div>`;
  }

  function _wireButtons(host) {
    const iniciar = host.querySelector('#paBtnIniciarFluxo');
    if (iniciar) iniciar.addEventListener('click', () => PixAutomaticoCredito.onIniciarFluxo());
    const reenviar = host.querySelector('#paBtnReenviar');
    if (reenviar) reenviar.addEventListener('click', () => PixAutomaticoCredito.onReenviarVerificacao());
    const consultar = host.querySelector('#paBtnConsultarConta');
    if (consultar) consultar.addEventListener('click', () => PixAutomaticoCredito.onConsultarConta());
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

  function _stopPolling() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }

  function _startPolling() {
    _stopPolling();
    if (!_needsPolling(_currentPa, _currentFase)) return;
    _pollTimer = setInterval(() => {
      PixAutomaticoCredito.onSincronizar({ silent: true }).catch(() => {});
    }, POLL_MS);
  }

  let _currentPa = {};
  let _currentFase = 'inicial';
  let _contaCtx = {};
  let _contaCmp = null;

  const PixAutomaticoCredito = {
    async consultarConta(proposalId) {
      return _req('consultar_conta', { query: { proposal_id: String(proposalId) } });
    },
    async iniciarFluxo(proposalId) {
      return _req('iniciar_fluxo', { method: 'POST', body: { proposal_id: String(proposalId) } });
    },

    async sincronizar(proposalId) {
      return _req('sincronizar', { method: 'POST', body: { proposal_id: String(proposalId) } });
    },

    async reenviarVerificacao(proposalId) {
      return _req('reenviar_verificacao', { method: 'POST', body: { proposal_id: String(proposalId) } });
    },

    mount(hostId = 'ecPixAutoHost') {
      const host = document.getElementById(hostId);
      if (!host) return;
      host.innerHTML = _renderPanel(_currentPa, _currentFase, _contaCmp);
      _wireButtons(host);
      _startPolling();
    },

    mountFromEsteira(pa, contaCtx) {
      _currentPa = pa && typeof pa === 'object' ? { ...pa } : {};
      _contaCtx = contaCtx && typeof contaCtx === 'object' ? { ...contaCtx } : {};
      _contaCmp = null;
      const parcelasN = parseInt(_currentPa.parcelas, 10) || 0;
      const cobOk = Array.isArray(_currentPa.cobrancas) && _currentPa.cobrancas.length >= parcelasN && parcelasN > 0;
      if (cobOk) {
        _currentFase = 'cobrancas_prontas';
      } else if (_currentPa.idSolicRec || _aguardandoAutorizacao(_currentPa, '')) {
        _currentFase = 'aguardando_aprovacao_banco';
      } else if (_currentPa.idRec) {
        _currentFase = 'aguardando_verificacao_conta';
      } else {
        _currentFase = 'inicial';
      }
      this.mount('ecPixAutoHost');
    },

    async _applyFluxo(data, opts = {}) {
      _currentPa = data.pix_automatico || _currentPa;
      _currentFase = data.fase || _currentFase;
      this.mount('ecPixAutoHost');
      const msg = data.message || '';
      if (msg && !opts.silent) {
        _setMsg(msg, data.fase === 'cobrancas_prontas' ? 'success' : 'info');
        if (typeof showToast === 'function') showToast(msg, data.fase === 'cobrancas_prontas' ? 'success' : 'info');
      } else if (opts.silent && data.fase === 'cobrancas_prontas') {
        _setMsg(msg || 'Cobranças agendadas.', 'success');
        if (typeof showToast === 'function') showToast('Débito automático ativo — cobranças agendadas.', 'success');
      }
      if (!_needsPolling(_currentPa, _currentFase)) _stopPolling();
      if (window.EsteiraCredito?.onProposalChange) {
        await EsteiraCredito.onProposalChange();
      }
    },

    async onIniciarFluxo() {
      const id = _proposalId();
      if (!id) {
        if (typeof showToast === 'function') showToast('Selecione uma proposta.', 'warning');
        return;
      }
      const label = _currentPa.idRec ? 'Sincronizando' : 'Iniciando débito automático';
      _setMsg(`${label}…`);
      if (typeof showLoading === 'function') showLoading(label + '…');
      try {
        const action = _currentPa.idRec ? 'sincronizar' : 'iniciar_fluxo';
        const data = action === 'iniciar_fluxo'
          ? await this.iniciarFluxo(id)
          : await this.sincronizar(id);
        await this._applyFluxo(data);
      } catch (e) {
        const err = e.message || String(e);
        _setMsg(err, 'error');
        if (typeof showToast === 'function') showToast(err, 'error');
      } finally {
        if (typeof hideLoading === 'function') hideLoading();
      }
    },

    async onReenviarVerificacao() {
      const id = _proposalId();
      if (!id) {
        if (typeof showToast === 'function') showToast('Selecione uma proposta.', 'warning');
        return;
      }
      _setMsg('Reenviando verificação ao banco…');
      if (typeof showLoading === 'function') showLoading('Reenviando ao banco…');
      try {
        const data = await this.reenviarVerificacao(id);
        await _dbgLog('pix-automatico:reenviar', 'reenviar ok', {
          fase: data.fase,
          solic_status: data.pix_automatico?.solic_status,
          idSolicRec: data.pix_automatico?.idSolicRec,
          conta_api: data.pix_automatico?.conta_api,
          banco: _contaCtx.banco,
        }, 'H5-ui-reenviar');
        await this._applyFluxo(data);
      } catch (e) {
        const err = e.message || String(e);
        _setMsg(err, 'error');
        if (typeof showToast === 'function') showToast(err, 'error');
      } finally {
        if (typeof hideLoading === 'function') hideLoading();
      }
    },

    async onConsultarConta() {
      const id = _proposalId();
      if (!id) {
        if (typeof showToast === 'function') showToast('Selecione uma proposta.', 'warning');
        return;
      }
      _setMsg('Consultando conta na Efi…');
      if (typeof showLoading === 'function') showLoading('Consultando conta…');
      try {
        const data = await this.consultarConta(id);
        _contaCmp = data.conta_comparacao || null;
        if (data.pix_automatico) _currentPa = data.pix_automatico;
        this.mount('ecPixAutoHost');
        const msg = data.message || 'Consulta concluída.';
        _setMsg(msg, _contaCmp?.conferencia?.tudo_bate ? 'success' : 'info');
        if (typeof showToast === 'function') showToast(msg, _contaCmp?.conferencia?.tudo_bate ? 'success' : 'info');
      } catch (e) {
        const err = e.message || String(e);
        _setMsg(err, 'error');
        if (typeof showToast === 'function') showToast(err, 'error');
      } finally {
        if (typeof hideLoading === 'function') hideLoading();
      }
    },

    async onSincronizar(opts = {}) {
      const id = _proposalId();
      if (!id) return;
      if (!opts.silent && typeof showLoading === 'function') showLoading('Atualizando…');
      try {
        const data = await this.sincronizar(id);
        await this._applyFluxo(data, opts);
      } catch (e) {
        if (!opts.silent) {
          _setMsg(e.message || 'Erro ao sincronizar', 'error');
        }
      } finally {
        if (!opts.silent && typeof hideLoading === 'function') hideLoading();
      }
    },
  };

  window.PixAutomaticoCredito = PixAutomaticoCredito;
})();
