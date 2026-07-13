/* SOU+BLU — Autorização Pix Automático (painel do funcionário, sem API externa de mensagens) */
(function () {
  'use strict';

  const POLL_MS = 20000;

  let _pollTimer = null;
  let _pending = [];
  let _user = null;

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
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

  function parseEsteira(row) {
    const est = row?.esteira ?? row?.credito_esteira ?? row?.creditoEsteira ?? {};
    if (typeof est === 'string') {
      try { return JSON.parse(est) || {}; } catch { return {}; }
    }
    return est && typeof est === 'object' ? est : {};
  }

  function pixAuto(row) {
    return parseEsteira(row).pix_automatico || {};
  }

  /** Espelha pix_auto_fluxo_fase() no servidor (credito_pix_auto_api.php). */
  function pixFluxoFase(pa) {
    const parcelas = parseInt(pa.parcelas, 10) || 0;
    const cobrancas = Array.isArray(pa.cobrancas) ? pa.cobrancas : [];
    if (parcelas > 0 && cobrancas.length >= parcelas) return 'cobrancas_prontas';
    const status = String(pa.status || '').toUpperCase();
    if (status === 'APROVADA') return 'aprovada_gerar_cobrancas';
    if (pa.idSolicRec) return 'aguardando_aprovacao_banco';
    if (pa.idRec) return 'aguardando_verificacao_conta';
    return 'inicial';
  }

  function isPendingPixAuth(row) {
    if (window.CreditoFluxo?.needsPixAuth) {
      return CreditoFluxo.needsPixAuth(row);
    }
    const pa = pixAuto(row);
    const fase = pixFluxoFase(pa);
    if (fase === 'cobrancas_prontas' || fase === 'inicial' || fase === 'aprovada_gerar_cobrancas') return false;
    return !!(pa.idRec || pa.idSolicRec || pa.pix_copia_cola);
  }

  function needsGovDocs(row) {
    return window.CreditoFluxo?.needsGovDocs ? CreditoFluxo.needsGovDocs(row) : false;
  }

  function belongsToRequester(row, user) {
    if (!user?.id || !row) return false;
    const uid = String(user.id);
    if (String(row.employee_id || row.employeeId || '') === uid) return true;
    if (String(row.vendor_id || row.vendorId || '') === uid) return true;
    const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
    if (String(meta.beneficiary_user_id || '') === uid) return true;
    return false;
  }

  function qrImgUrl(pix) {
    if (!pix) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(pix)}`;
  }

  function bancoCurto(banco) {
    const b = String(banco || '');
    if (/nubank|260/i.test(b)) return 'Nubank';
    if (/santander|033/i.test(b)) return 'Santander';
    if (/bradesco|237/i.test(b)) return 'Bradesco';
    if (/itau|341/i.test(b)) return 'Itaú';
    if (/caixa|104/i.test(b)) return 'Caixa';
    if (/bb|001/i.test(b)) return 'Banco do Brasil';
    return b || 'seu banco';
  }

  async function syncProposal(proposalId) {
    const base = apiBase();
    const res = await fetch(`${base}/api/credito_pix_auto_api.php?action=sincronizar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey() },
      body: JSON.stringify({ proposal_id: String(proposalId) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `Erro HTTP ${res.status}`);
    return data;
  }

  async function loadPending(user) {
    if (!user?.id || !window.CreditoPropostasApi?.list) return [];
    const rows = await CreditoPropostasApi.list(user.id).catch(() => []);
    return (Array.isArray(rows) ? rows : [])
      .filter((row) => belongsToRequester(row, user) && (isPendingPixAuth(row) || needsGovDocs(row)));
  }

  function ensureSection() {
    if (document.getElementById('secAutorizarPix')) return;
    const main = document.querySelector('.main-content .page-content') || document.querySelector('.main-content');
    if (!main) return;
    const sec = document.createElement('section');
    sec.className = 'section';
    sec.id = 'secAutorizarPix';
    sec.innerHTML = '<div id="pixAutorizarEmployeeRoot"></div>';
    main.appendChild(sec);

    const nav = document.querySelector('.sidebar-nav');
    if (nav && !document.getElementById('navAutorizarPix')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nav-item';
      btn.id = 'navAutorizarPix';
      btn.dataset.section = 'secAutorizarPix';
      btn.style.display = 'none';
      btn.innerHTML = '<span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span> Autorizar Pix <span id="navAutorizarPixBadge" class="nav-badge" hidden>!</span>';
      const credNav = document.getElementById('navPropostaCredito');
      if (credNav?.parentNode) credNav.parentNode.insertBefore(btn, credNav.nextSibling);
      else nav.appendChild(btn);
    }
  }

  function setNavVisible(show) {
    const nav = document.getElementById('navAutorizarPix');
    const badge = document.getElementById('navAutorizarPixBadge');
    if (nav) nav.style.display = show ? '' : 'none';
    if (badge) badge.hidden = !show;
  }

  function renderCard(row) {
    const pa = pixAuto(row);
    const est = parseEsteira(row);
    const banco = row.banco || est.banco || '';
    const ag = row.agencia || est.agencia || '—';
    const conta = row.conta_corrente || est.conta_corrente || '—';
    const pix = pa.pix_copia_cola || '';
    const parcelas = pa.parcelas || est.parcelas_meses || '—';
    const valor = pa.valor_rec || est.valor_parcela || row.valor_parcela;
    const valorAprovado = est.valor_aprovado || est.valor_final || row.valor || 0;
    const proto = row.protocolo || row.id || '';
    const bName = bancoCurto(banco);
    const isNubank = /nubank|260/i.test(banco);
    const fase = pixFluxoFase(pa);
    const aguardando = fase === 'aguardando_aprovacao_banco' || fase === 'aguardando_verificacao_conta';
    const statusLine = [pa.solic_status && `conta: ${pa.solic_status}`, pa.status && `recorrência: ${pa.status}`]
      .filter(Boolean).join(' · ');

    return `
      <div class="card card-padded" style="margin-bottom:16px;border-left:4px solid #7c3aed;max-width:640px;">
        <h3 style="margin:0 0 8px;font-family:var(--font-display,'Nunito',sans-serif);font-weight:800;">Autorize o Pix Automático</h3>
        <p class="text-muted" style="font-size:13px;margin:0 0 14px;line-height:1.6;">
          Protocolo <strong>${esc(proto)}</strong><br>
          Valor liberado: <strong style="color:var(--color-primary, #7c3aed);font-size:16px;">${esc(fmtMoney(valorAprovado))}</strong><br>
          Condições: ${esc(parcelas)}× de ${esc(fmtMoney(valor))}/mês<br>
          Conta de depósito: <strong>${esc(bName)}</strong> Ag ${esc(ag)} · Cc ${esc(conta)}
        </p>
        ${aguardando ? `
        <div role="alert" style="margin:0 0 14px;padding:14px 16px;background:#f5f3ff;border:2px solid #a78bfa;border-radius:10px;line-height:1.65;font-size:13px;">
          <div style="font-size:14px;font-weight:800;color:#5b21b6;margin-bottom:8px;">${esc(bName)} — autorização pendente</div>
          <p style="margin:0 0 10px;color:#4c1d95;">
            O banco pode <strong>não enviar push</strong>. Use esta tela no <strong>celular</strong> para autorizar.
          </p>
          <ol style="margin:0 0 10px 18px;padding:0;color:#5b21b6;font-weight:600;">
            <li>No ${esc(bName)}: <strong>Pix → Pix Automático → Autorizações pendentes</strong></li>
            ${isNubank ? '<li>Agência costuma ser <strong>0001</strong></li>' : ''}
            <li>Confira a conta <strong>Ag ${esc(ag)} · Cc ${esc(conta)}</strong> e autorize</li>
          </ol>
          ${statusLine ? `<div style="font-size:11px;color:#9ca3af;">Status Efi: ${esc(statusLine)}</div>` : ''}
        </div>` : ''}
        ${pix && aguardando ? `
          <div style="margin:0 0 14px;padding:14px;background:#f0f9ff;border:1px solid #7dd3fc;border-radius:10px;">
            <div style="font-size:13px;font-weight:700;color:#0369a1;margin-bottom:6px;">QR Code — Jornada 2 (alternativa ao push)</div>
            <p class="text-muted" style="font-size:12px;margin:0 0 10px;line-height:1.5;">
              Se não aparecer em <strong>Pix Automático → Pendentes</strong>, escaneie o QR no app
              (<strong>Pix → Pagar → Ler QR Code</strong>) ou copie o código abaixo.
            </p>
            <div style="text-align:center;margin:12px 0;">
              <img src="${esc(qrImgUrl(pix))}" alt="QR Code Pix" width="240" height="240"
                style="max-width:100%;border-radius:8px;background:#fff;padding:8px;box-shadow:0 1px 4px rgba(0,0,0,.08);"/>
            </div>
            <textarea class="form-control" id="pixAutoCopy_${esc(row.id)}" rows="3" readonly style="font-size:11px;font-family:monospace;">${esc(pix)}</textarea>
            <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
              <button type="button" class="btn btn-primary btn-sm" data-copy-pix="${esc(row.id)}">Copiar código Pix</button>
              <button type="button" class="btn btn-outline btn-sm" data-sync-pix="${esc(row.id)}">Já autorizei — atualizar</button>
            </div>
          </div>
        ` : pix ? `
          <textarea class="form-control" id="pixAutoCopy_${esc(row.id)}" rows="3" readonly style="font-size:11px;font-family:monospace;">${esc(pix)}</textarea>
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
            <button type="button" class="btn btn-primary btn-sm" data-copy-pix="${esc(row.id)}">Copiar código Pix</button>
            <button type="button" class="btn btn-outline btn-sm" data-sync-pix="${esc(row.id)}">Já autorizei — atualizar</button>
          </div>
        ` : `
          <button type="button" class="btn btn-outline btn-sm" data-sync-pix="${esc(row.id)}">Já autorizei — atualizar status</button>
        `}
        <div class="text-muted" style="font-size:11px;margin-top:10px;">
          Status: ${esc(statusLine || 'aguardando')}
        </div>
      </div>`;
  }

  function renderGovCard(row) {
    const proto = row.protocolo || row.id || '';
    const est = parseEsteira(row);
    const ret = row.creditoRetorno || row.credito_retorno || row.retorno || {};
    const att = (ret.attachments && typeof ret.attachments === 'object') ? ret.attachments : {};
    return `
      <div class="card card-padded" style="margin-bottom:16px;border-left:4px solid #059669;max-width:640px;">
        <h3 style="margin:0 0 8px;font-weight:800;">Assinar documentos — Gov.br</h3>
        <p class="text-muted" style="font-size:13px;margin:0 0 14px;line-height:1.6;">
          Protocolo <strong>${esc(proto)}</strong><br>
          Após autorizar o Pix, assine no <strong>Gov.br</strong> o Termo de Confissão de Dívida e o Termo de Cessão de Crédito.
          Depois envie os PDFs assinados abaixo — o financeiro validará em Retorno de Propostas.
        </p>
        <ol style="margin:0 0 14px 18px;padding:0;font-size:13px;line-height:1.65;color:#374151;">
          <li>Acesse <strong>gov.br</strong> com sua conta</li>
          <li>Assine os dois termos enviados pelo financeiro (ou disponíveis na esteira)</li>
          <li>Envie os PDFs assinados nos campos abaixo</li>
        </ol>
        <div style="display:grid;gap:12px;margin-bottom:14px;">
          <label style="font-size:12px;font-weight:700;">Termo Confissão de Dívida (PDF assinado)
            <input type="file" class="form-control" id="gov_termo_divida_${esc(row.id)}" accept=".pdf,.jpg,.jpeg,.png"/>
            ${att.termo_divida_gov ? '<span class="text-muted" style="font-size:11px;">Já enviado anteriormente</span>' : ''}
          </label>
          <label style="font-size:12px;font-weight:700;">Termo Cessão de Crédito (PDF assinado)
            <input type="file" class="form-control" id="gov_termo_cessao_${esc(row.id)}" accept=".pdf,.jpg,.jpeg,.png"/>
            ${att.termo_cessao_gov ? '<span class="text-muted" style="font-size:11px;">Já enviado anteriormente</span>' : ''}
          </label>
        </div>
        <button type="button" class="btn btn-primary btn-sm" data-gov-submit="${esc(row.id)}">Enviar documentos ao financeiro</button>
      </div>`;
  }

  function renderBanner(host) {
    if (!host || !_pending.length) {
      if (host) host.innerHTML = '';
      return;
    }
    const pixN = _pending.filter(isPendingPixAuth).length;
    const govN = _pending.filter(needsGovDocs).length;
    const parts = [];
    if (pixN) parts.push(`${pixN} Pix`);
    if (govN) parts.push(`${govN} documento${govN > 1 ? 's' : ''} Gov.br`);
    host.innerHTML = `<div class="card card-padded" style="margin-bottom:16px;border-left:4px solid #f59e0b;background:#fffbeb;cursor:pointer;" id="pixAutorizarBanner">
      <strong style="display:block;color:#92400e;">Ação necessária no crédito</strong>
      <span style="font-size:13px;color:#78350f;">Toque aqui — ${esc(parts.join(' · ') || 'pendências')}</span>
    </div>`;
    host.querySelector('#pixAutorizarBanner')?.addEventListener('click', () => {
      if (typeof navigateTo === 'function') navigateTo('secAutorizarPix');
      PixAutorizarEmployee.render();
    });
  }

  function wireRoot(root) {
    root.querySelectorAll('[data-copy-pix]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-copy-pix');
        const ta = document.getElementById(`pixAutoCopy_${id}`);
        if (!ta) return;
        try {
          await navigator.clipboard.writeText(ta.value);
        } catch {
          ta.select();
          document.execCommand('copy');
        }
        if (typeof showToast === 'function') showToast('Código Pix copiado. Cole no app do banco.', 'success');
      });
    });
    root.querySelectorAll('[data-sync-pix]').forEach((btn) => {
      btn.addEventListener('click', () => PixAutorizarEmployee.onSync(btn.getAttribute('data-sync-pix')));
    });
    root.querySelectorAll('[data-gov-submit]').forEach((btn) => {
      btn.addEventListener('click', () => PixAutorizarEmployee.onSubmitGovDocs(btn.getAttribute('data-gov-submit')));
    });
  }

  async function _updateProposalStatus(row, status, extra = {}) {
    if (!row?.id || !window.CreditoPropostasApi?.update) return;
    const est = {
      ...parseEsteira(row),
      status_credito: status,
      ...(extra.esteiraPatch || {}),
    };
    if (extra.pix_automatico) est.pix_automatico = extra.pix_automatico;
    if (extra.pix_aprovado_em) est.pix_aprovado_em = extra.pix_aprovado_em;
    const patch = CreditoPropostasApi.proposalToUpdateRow({
      ...row,
      status,
      statusOp: status,
      creditoEsteira: est,
      credito_esteira: est,
      creditoRetorno: extra.creditoRetorno || row.creditoRetorno || row.credito_retorno,
      credito_retorno: extra.credito_retorno || extra.creditoRetorno || row.credito_retorno,
    });
    await CreditoPropostasApi.update(row.id, patch);
  }

  function stopPoll() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }

  function startPoll() {
    stopPoll();
    if (!_pending.length) return;
    _pollTimer = setInterval(() => {
      PixAutorizarEmployee.refresh({ silent: true }).catch(() => {});
    }, POLL_MS);
  }

  const PixAutorizarEmployee = {
    async refresh(opts = {}) {
      if (!_user) return;
      _pending = await loadPending(_user);
      setNavVisible(_pending.length > 0);
      const bannerHost = document.getElementById('pixAutorizarBannerHost');
      renderBanner(bannerHost);
      if (!opts.silent && _pending.length === 0 && typeof showToast === 'function') {
        showToast('Nenhuma autorização Pix pendente.', 'success');
      }
      if (document.getElementById('secAutorizarPix')?.classList.contains('active')) {
        this.render();
      }
      if (!_pending.length) stopPoll();
      else startPoll();
},

    async init(user) {
      _user = user;
      ensureSection();
      const main = document.querySelector('.main-content .page-content') || document.querySelector('.main-content');
      if (main && !document.getElementById('pixAutorizarBannerHost')) {
        const host = document.createElement('div');
        host.id = 'pixAutorizarBannerHost';
        main.insertBefore(host, main.firstChild);
      }
      await this.refresh({ silent: true });
      if (_pending.length > 0 && typeof navigateTo === 'function') {
        navigateTo('secAutorizarPix');
        this.render();
      }
    },

    render() {
      const root = document.getElementById('pixAutorizarEmployeeRoot');
      if (!root) return;
      if (!_pending.length) {
        root.innerHTML = `<div class="card card-padded" style="max-width:560px;">
          <h3 style="margin:0 0 8px;font-weight:800;">Autorizar Pix</h3>
          <p class="text-muted" style="margin:0;font-size:14px;">Nenhuma autorização pendente no momento.</p>
        </div>`;
        stopPoll();
        return;
      }
      root.innerHTML = `<div style="max-width:680px;">
        <p class="text-muted" style="font-size:13px;margin:0 0 16px;line-height:1.6;">
          Siga as etapas abaixo na ordem: <strong>autorizar Pix no banco</strong> → <strong>assinar documentos no Gov.br</strong> → aguardar o financeiro.
        </p>
        ${_pending.filter(isPendingPixAuth).map(renderCard).join('')}
        ${_pending.filter(needsGovDocs).map(renderGovCard).join('')}
      </div>`;
      wireRoot(root);
      startPoll();
    },

    async onSync(proposalId) {
      if (!proposalId) return;
      if (typeof showLoading === 'function') showLoading('Verificando autorização…');
      try {
        const data = await syncProposal(proposalId);
        const pa = data.pix_automatico || {};
        const rec = String(pa.status || '').toUpperCase();
        const row = _pending.find((r) => String(r.id) === String(proposalId));
        if (row && (rec === 'APROVADA' || data.fase === 'aprovada_gerar_cobrancas' || data.fase === 'cobrancas_prontas')) {
          const st = window.CreditoFluxo?.S?.ASSINATURA_GOV || 'AG. ASSINATURA GOV';
          await _updateProposalStatus(row, st, {
            pix_automatico: pa,
            pix_aprovado_em: new Date().toISOString(),
          });
          if (typeof showToast === 'function') {
            showToast('Pix autorizado! Próximo passo: assinar documentos no Gov.br.', 'success');
          }
        }
        await this.refresh();
        if (typeof showToast === 'function' && rec !== 'APROVADA') showToast('Status atualizado.', 'success');
      } catch (e) {
        if (typeof showToast === 'function') showToast(e.message || 'Erro ao atualizar.', 'error');
      } finally {
        if (typeof hideLoading === 'function') hideLoading();
      }
    },

    async onSubmitGovDocs(proposalId) {
      if (!proposalId) return;
      const row = _pending.find((r) => String(r.id) === String(proposalId));
      if (!row) return;
      const f1 = document.getElementById(`gov_termo_divida_${proposalId}`)?.files?.[0];
      const f2 = document.getElementById(`gov_termo_cessao_${proposalId}`)?.files?.[0];
      if (!f1 && !f2) {
        if (typeof showToast === 'function') showToast('Selecione ao menos um documento assinado.', 'warning');
        return;
      }
      if (typeof showLoading === 'function') showLoading('Enviando documentos…');
      try {
        const ret = row.creditoRetorno || row.credito_retorno || row.retorno || {};
        const att = { ...(ret.attachments || {}) };
        if (f1 && typeof DB !== 'undefined' && DB.uploadProposalFile) {
          const up = await DB.uploadProposalFile(f1, proposalId, 'retorno_termo_divida_gov');
          att.termo_divida_gov = typeof DB.resolveUploadUrl === 'function' ? DB.resolveUploadUrl(up) : (up?.url || up);
          att.termo_divida_gov_nome = f1.name;
        }
        if (f2 && typeof DB !== 'undefined' && DB.uploadProposalFile) {
          const up = await DB.uploadProposalFile(f2, proposalId, 'retorno_termo_cessao_gov');
          att.termo_cessao_gov = typeof DB.resolveUploadUrl === 'function' ? DB.resolveUploadUrl(up) : (up?.url || up);
          att.termo_cessao_gov_nome = f2.name;
        }
        const st = window.CreditoFluxo?.S?.RETORNO_FIN || 'AG. RETORNO FINANCEIRO';
        const retorno = { ...ret, attachments: att, docs_enviados_em: new Date().toISOString() };
        await _updateProposalStatus(row, st, {
          creditoRetorno: retorno,
          credito_retorno: retorno,
        });
        if (typeof showToast === 'function') showToast('Documentos enviados. O financeiro irá validar.', 'success');
        await this.refresh();
      } catch (e) {
        if (typeof showToast === 'function') showToast(e.message || 'Erro ao enviar.', 'error');
      } finally {
        if (typeof hideLoading === 'function') hideLoading();
      }
    },
  };

  window.PixAutorizarEmployee = PixAutorizarEmployee;
})();
