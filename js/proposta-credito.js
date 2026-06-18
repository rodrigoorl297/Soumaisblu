/* SOU+BLU — Solicitar Proposta Crédito (UY3) */
(function () {
  'use strict';

  const MAX_VALOR = 1621.0;
  const TAXA_LABEL = 'SUJEITO ANÁLISE DA UY3, TAXA 3,5% ao mês';

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function digits(v) {
    return String(v ?? '').replace(/\D/g, '');
  }

  function fmtMoney(n) {
    return 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function gerarProtocolo() {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const seq = String(Math.floor(1000 + Math.random() * 9000));
    return `PC-${ymd}-${seq}`;
  }

  function canViewFinanceiro() {
    const s = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    if (!s || window.PARTNER_ROOT_ID) return false;
    return ['master', 'fundador', 'gerente', 'financeiro', 'financial', 'rh', 'diretoria'].includes(String(s.role || '').toLowerCase());
  }

  function canViewEmployee() {
    const s = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    if (!s) return false;
    return !window.__PERFIL_MODE__ && !window.__LOJA_MODE__;
  }

  function bankOptions() {
    const banks = (window.Proposals && Proposals._BANCOS_COMPRADOS) || [
      '033 - Banco Santander (Brasil) S.A.',
      '001 - Banco do Brasil S.A.',
      '237 - Banco Bradesco S.A.',
      '104 - Caixa Econômica Federal',
      '341 - Itaú Unibanco S.A.',
    ];
    return banks.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
  }

  function blackBar(title) {
    return `<div class="pc-black-bar">${esc(title)}</div>`;
  }

  function finGridRow(label, fieldHtml) {
    return `<tr>
      <th class="pc-grid-th">${esc(label)}</th>
      <td class="pc-grid-td">${fieldHtml}</td>
    </tr>`;
  }

  function simNaoSelect(id, required) {
    const req = required ? ' required' : '';
    return `<select class="form-control" id="${id}"${req}><option value="">—</option><option value="SIM">SIM</option><option value="NÃO">NÃO</option></select>`;
  }

  function _formHtml() {
    return `
<div class="pc-form-wrap" id="pcFormWrap">
  ${blackBar('SOLICITAR PROPOSTA CRÉDITO')}
  ${blackBar('PROTOCOLO AUTOMÁTICO')}
  <form id="form-proposta-credito" onsubmit="PropostaCredito.submit(event)">
    <div class="table-wrap pc-table-wrap">
      <table class="data-table pc-grid-table">
        <tbody>
          ${finGridRow('PROTOCOLO', `<input type="text" class="form-control text-center" id="pc_protocolo" readonly style="font-weight:800;background:#f3f4f6;letter-spacing:.04em;max-width:320px;"/>`)}
          ${finGridRow('CPF FUNCIONÁRIO', `<div class="form-row" style="gap:8px;margin:0;flex-wrap:wrap;">
            <input type="text" class="form-control mask-cpf" id="pc_cpf_funcionario" placeholder="000.000.000-00" required style="flex:1;min-width:160px;"/>
            <button type="button" class="btn btn-accent btn-api-lookup" id="btn_pc_buscar_func" onclick="PropostaCredito.buscarFuncionario()">BUSCAR BANCO DE DADOS</button>
          </div>
          <div id="pc_func_info" hidden class="pc-info-box"></div>
          <input type="hidden" id="pc_func_nome"/>`)}
          ${finGridRow('VALOR SOLICITADO', `<input type="number" class="form-control" id="pc_valor" min="0.01" max="${MAX_VALOR}" step="0.01" placeholder="0,00" required/>
            <p class="pc-field-hint">Máximo: ${fmtMoney(MAX_VALOR)}</p>`)}
          ${finGridRow('POSSUI CONTA SANTANDER?', simNaoSelect('pc_conta_santander', true))}
          ${finGridRow('FORMA DE PAGAMENTO', `<select class="form-control" id="pc_forma_pagamento" required>
            <option value="">Selecione...</option>
            <option value="PIX">PIX</option>
            <option value="TED">TED</option>
            <option value="DOC">DOC</option>
            <option value="CRÉDITO EM CONTA">Crédito em conta</option>
          </select>`)}
          ${finGridRow('BANCO', `<select class="form-control" id="pc_banco" required>
            <option value="">Selecione o banco...</option>
            ${bankOptions()}
          </select>`)}
          ${finGridRow('AGÊNCIA', `<input type="text" class="form-control" id="pc_agencia" placeholder="0000" required/>`)}
          ${finGridRow('CONTA CORRENTE', `<input type="text" class="form-control" id="pc_conta" placeholder="00000-0" required/>`)}
          ${finGridRow('1ª CONTATO', `<input type="text" class="form-control mask-phone" id="pc_contato1" placeholder="(00) 00000-0000"/>`)}
          ${finGridRow('2ª CONTATO', `<input type="text" class="form-control mask-phone" id="pc_contato2" placeholder="(00) 00000-0000"/>`)}
          <tr class="pc-section-row"><td colspan="2">SUJEITO ANÁLISE DA UY3</td></tr>
          ${finGridRow('AVALISTA — CPF', `<div class="form-row" style="gap:8px;margin:0;flex-wrap:wrap;">
            <input type="text" class="form-control mask-cpf" id="pc_avalista_cpf" placeholder="000.000.000-00" style="flex:1;min-width:160px;"/>
            <button type="button" class="btn btn-accent btn-api-lookup" onclick="PropostaCredito.buscarAvalista()">BUSCAR BANCO DE DADOS</button>
          </div>
          <div id="pc_avalista_info" hidden class="pc-info-box"></div>
          <input type="hidden" id="pc_avalista_nome"/>`)}
          ${finGridRow('TELEFONE AVALISTA', `<input type="text" class="form-control mask-phone" id="pc_avalista_tel" placeholder="(00) 00000-0000"/>`)}
          ${finGridRow('BEM EM GARANTIA?', simNaoSelect('pc_bem_garantia', true))}
          ${finGridRow('QUITADO?', simNaoSelect('pc_quitado', true))}
          <tr class="pc-footer-row"><td colspan="2">${esc(TAXA_LABEL)}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="pc-form-actions">
      <button type="submit" class="btn btn-primary btn-lg" id="pc_submit_btn">SOLICITAR 7 DIAS PARA ANÁLISE</button>
    </div>
  </form>
</div>`;
  }

  function _injectStyles() {
    if (document.getElementById('pc-form-styles')) return;
    const st = document.createElement('style');
    st.id = 'pc-form-styles';
    st.textContent = `
.pc-form-wrap { max-width: 900px; margin: 0 auto; border: 1px solid var(--color-border, #e5e7eb); border-radius: var(--radius-md, 8px); overflow: hidden; background: #fff; }
.pc-black-bar { background: #111; color: #fff; padding: 10px 16px; font-family: var(--font-display, 'Nunito', sans-serif); font-weight: 800; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; text-align: center; }
.pc-table-wrap { margin: 0; border-radius: 0; border: none; }
.pc-grid-table { width: 100%; border-collapse: collapse; }
.pc-grid-th { width: 34%; text-align: left; padding: 10px 12px; background: var(--color-surface-2, #f3f4f6); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; white-space: nowrap; border-bottom: 1px solid var(--color-border, #e5e7eb); vertical-align: middle; }
.pc-grid-td { padding: 8px 12px; border-bottom: 1px solid var(--color-border, #e5e7eb); vertical-align: middle; }
.pc-section-row td { text-align: center; font-weight: 800; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; padding: 12px; background: var(--color-surface-2, #f3f4f6); border-bottom: 1px solid var(--color-border, #e5e7eb); }
.pc-footer-row td { text-align: center; font-size: 13px; font-weight: 700; padding: 12px 16px; color: var(--color-text-muted, #6b7280); background: #fff; border-bottom: none; }
.pc-info-box { font-size: 13px; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--color-border); margin-top: 8px; background: var(--color-surface-2, #f9fafb); }
.pc-field-hint { margin: 4px 0 0; font-size: 11px; color: var(--color-text-muted); }
.pc-form-actions { padding: 16px 20px 20px; display: flex; justify-content: center; border-top: 1px solid var(--color-border, #e5e7eb); }
#pc_submit_btn { font-weight: 800; letter-spacing: .03em; text-transform: uppercase; min-width: 280px; }
`;
    document.head.appendChild(st);
  }

  async function _lookupRhEmployee(cpf) {
    const list = await DB.getRhEmployees().catch(() => []);
    return (list || []).find(e => digits(e.cpf) === cpf) || null;
  }

  async function _lookupSystemUser(cpf) {
    const users = await DB.getAllUsers().catch(() => []);
    return (users || []).find(u => digits(u.cpf) === cpf && u.active !== false) || null;
  }

  const PropostaCredito = {
    MAX_VALOR,

    init() {
      _injectStyles();
    },

    resetForm() {
      const proto = gerarProtocolo();
      const pEl = document.getElementById('pc_protocolo');
      if (pEl) pEl.value = proto;
      ['pc_cpf_funcionario', 'pc_func_nome', 'pc_valor', 'pc_agencia', 'pc_conta',
        'pc_contato1', 'pc_contato2', 'pc_avalista_cpf', 'pc_avalista_nome', 'pc_avalista_tel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      ['pc_conta_santander', 'pc_forma_pagamento', 'pc_banco', 'pc_bem_garantia', 'pc_quitado'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      ['pc_func_info', 'pc_avalista_info'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.hidden = true; el.innerHTML = ''; }
      });
    },

    renderShell(rootId) {
      _injectStyles();
      const root = document.getElementById(rootId);
      if (!root) return;
      root.innerHTML = _formHtml();
      this.resetForm();
      if (typeof applyInputMasks === 'function') applyInputMasks(root);
    },

    renderFinanceiro(rootId = 'propostaCreditoRoot') {
      if (!canViewFinanceiro()) return;
      this.renderShell(rootId);
    },

    renderEmployee(rootId = 'propostaCreditoEmployeeRoot') {
      if (!canViewEmployee()) return;
      this.ensureEmployeeSection();
      this.renderShell(rootId);
    },

    ensureEmployeeSection() {
      if (document.getElementById('secPropostaCredito')) return;
      const main = document.querySelector('.main-content .page-content') || document.querySelector('.main-content');
      if (!main) return;
      const sec = document.createElement('section');
      sec.className = 'section';
      sec.id = 'secPropostaCredito';
      sec.innerHTML = '<div id="propostaCreditoEmployeeRoot"></div>';
      main.appendChild(sec);

      const nav = document.querySelector('.sidebar-nav');
      if (nav && !document.getElementById('navPropostaCredito')) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-item';
        btn.id = 'navPropostaCredito';
        btn.dataset.section = 'secPropostaCredito';
        btn.style.display = 'none';
        btn.innerHTML = '<span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></span> Proposta Crédito';
        const propNav = document.getElementById('navProposals');
        if (propNav && propNav.parentNode) propNav.parentNode.insertBefore(btn, propNav.nextSibling);
        else nav.appendChild(btn);
      }
    },

    async applyEmployeeNavVisibility(user) {
      this.ensureEmployeeSection();
      const nav = document.getElementById('navPropostaCredito');
      if (!nav) return;
      let show = ['vendedor', 'backoffice', 'supervisor', 'rh'].includes(String(user?.role || '').toLowerCase());
      if (show && window.__EMPLOYEE_PARTNER_ORG__ && typeof DB.getPartnerByUserId === 'function') {
        const rootId = typeof getPartnerRootId === 'function' ? await getPartnerRootId(user) : null;
        if (rootId) {
          const prt = await DB.getPartnerByUserId(rootId).catch(() => null);
          const meta = prt?.meta || {};
          if (meta.credito_habilitado === false) show = false;
        }
      }
      nav.style.display = show ? '' : 'none';
    },

    async buscarFuncionario() {
      const cpf = digits(document.getElementById('pc_cpf_funcionario')?.value);
      const info = document.getElementById('pc_func_info');
      const nomeEl = document.getElementById('pc_func_nome');
      if (cpf.length !== 11) {
        if (typeof showToast === 'function') showToast('Informe um CPF válido (11 dígitos).', 'warning');
        return;
      }

      const btn = document.getElementById('btn_pc_buscar_func');
      if (btn) { btn.disabled = true; btn.textContent = 'Buscando...'; }

      let nome = '';
      let extra = '';

      try {
        const rh = await _lookupRhEmployee(cpf);
        if (rh) {
          nome = rh.nome || rh.name || '';
          extra = [rh.matricula ? `Matrícula: ${rh.matricula}` : '', rh.departamento ? `Depto: ${rh.departamento}` : ''].filter(Boolean).join(' · ');
          const c1 = document.getElementById('pc_contato1');
          if (c1 && !c1.value && (rh.contato || rh.phone)) c1.value = rh.contato || rh.phone || '';
        }

        if (!nome) {
          const u = await _lookupSystemUser(cpf);
          if (u) {
            nome = u.name || '';
            extra = u.department ? `Departamento: ${u.department}` : '';
            const c1 = document.getElementById('pc_contato1');
            if (c1 && !c1.value && u.phone) c1.value = u.phone;
          }
        }

        if (typeof FonteData !== 'undefined') {
          const res = await FonteData.lookupCpf(cpf);
          if (res.ok && res.client) {
            if (!nome && res.client.name) nome = res.client.name;
            if (!extra && res.client.email) extra = `E-mail: ${res.client.email}`;
            const c1 = document.getElementById('pc_contato1');
            if (c1 && !c1.value && res.client.phone1) c1.value = res.client.phone1;
          } else if (!nome && !rh) {
            throw new Error(res.error || 'CPF não encontrado nas bases.');
          }
        } else if (!nome) {
          throw new Error('Funcionário não encontrado no cadastro RH.');
        }

        if (nomeEl) nomeEl.value = nome;
        if (info) {
          info.hidden = false;
          info.innerHTML = `<strong>${esc(nome || '—')}</strong>${extra ? `<br/><span style="color:var(--color-text-muted);">${esc(extra)}</span>` : ''}`;
        }
        if (typeof showToast === 'function') showToast('Dados do funcionário carregados.', 'success');
      } catch (e) {
        if (info) {
          info.hidden = false;
          info.innerHTML = `<span style="color:#dc2626;">${esc(e.message || 'Falha na consulta')}</span>`;
        } else if (typeof showToast === 'function') {
          showToast(e.message || 'Falha na consulta', 'error');
        }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'BUSCAR BANCO DE DADOS'; }
      }
    },

    async buscarAvalista() {
      const cpf = digits(document.getElementById('pc_avalista_cpf')?.value);
      const info = document.getElementById('pc_avalista_info');
      const nomeEl = document.getElementById('pc_avalista_nome');
      if (cpf.length !== 11) {
        if (typeof showToast === 'function') showToast('Informe o CPF do avalista (11 dígitos).', 'warning');
        return;
      }
      if (typeof FonteData === 'undefined') {
        if (typeof showToast === 'function') showToast('API de consulta não disponível.', 'error');
        return;
      }

      try {
        const res = await FonteData.lookupCpf(cpf);
        if (!res.ok) throw new Error(res.error || 'CPF não encontrado.');
        const nome = res.client?.name || '';
        if (nomeEl) nomeEl.value = nome;
        const tel = document.getElementById('pc_avalista_tel');
        if (tel && !tel.value && res.client?.phone1) tel.value = res.client.phone1;
        if (info) {
          info.hidden = false;
          info.innerHTML = `<strong>${esc(nome || '—')}</strong>`;
        }
        if (typeof showToast === 'function') showToast('Dados do avalista carregados.', 'success');
      } catch (e) {
        if (info) {
          info.hidden = false;
          info.innerHTML = `<span style="color:#dc2626;">${esc(e.message || 'Falha na consulta')}</span>`;
        }
      }
    },

    _collectMeta() {
      const gv = id => document.getElementById(id)?.value?.trim() || '';
      return {
        tipo: 'proposta_credito_uy3',
        cpf_funcionario: digits(gv('pc_cpf_funcionario')),
        nome_funcionario: gv('pc_func_nome'),
        conta_santander: gv('pc_conta_santander'),
        forma_pagamento: gv('pc_forma_pagamento'),
        banco: gv('pc_banco'),
        agencia: gv('pc_agencia'),
        conta_corrente: gv('pc_conta'),
        contato1: gv('pc_contato1'),
        contato2: gv('pc_contato2'),
        avalista_cpf: digits(gv('pc_avalista_cpf')),
        avalista_nome: gv('pc_avalista_nome'),
        avalista_telefone: gv('pc_avalista_tel'),
        bem_garantia: gv('pc_bem_garantia'),
        quitado: gv('pc_quitado'),
        taxa_mensal: '3,5%',
        prazo_analise_dias: 7,
      };
    },

    async submit(event) {
      if (event) event.preventDefault();
      const user = typeof Auth !== 'undefined' ? Auth.getSession() : null;
      if (!user?.id) return;

      const cpf = digits(document.getElementById('pc_cpf_funcionario')?.value);
      const nome = document.getElementById('pc_func_nome')?.value?.trim()
        || document.getElementById('pc_func_info')?.querySelector('strong')?.textContent?.trim()
        || '';
      const valor = parseFloat(document.getElementById('pc_valor')?.value);

      if (cpf.length !== 11) {
        if (typeof showToast === 'function') showToast('Informe o CPF do funcionário.', 'warning');
        return;
      }
      if (!nome) {
        if (typeof showToast === 'function') showToast('Busque o funcionário pelo CPF antes de enviar.', 'warning');
        return;
      }
      if (!Number.isFinite(valor) || valor <= 0) {
        if (typeof showToast === 'function') showToast('Informe o valor solicitado.', 'warning');
        return;
      }
      if (valor > MAX_VALOR) {
        if (typeof showToast === 'function') showToast(`Valor máximo permitido: ${fmtMoney(MAX_VALOR)}.`, 'warning');
        return;
      }

      const protocolo = gerarProtocolo();
      const pEl = document.getElementById('pc_protocolo');
      if (pEl) pEl.value = protocolo;

      const meta = this._collectMeta();
      const obsLines = [
        '[CREDITO] Solicitação proposta crédito UY3',
        `Protocolo: ${protocolo}`,
        `Funcionário: ${nome} (CPF ${cpf})`,
        `Valor: ${fmtMoney(valor)}`,
        `Santander: ${meta.conta_santander}`,
        `Pagamento: ${meta.forma_pagamento} · ${meta.banco} Ag ${meta.agencia} Cc ${meta.conta_corrente}`,
        meta.avalista_cpf ? `Avalista: ${meta.avalista_nome || '—'} (${meta.avalista_cpf})` : '',
        `Garantia: ${meta.bem_garantia} · Quitado: ${meta.quitado}`,
        TAXA_LABEL,
      ].filter(Boolean);

      const proposalId = `PC-${Date.now()}`;
      const now = new Date().toISOString();
      const status = 'AG. ANÁLISE UY3 (7 DIAS)';

      const proposal = {
        id: proposalId,
        numero: protocolo,
        protocolo,
        employee_id: user.id,
        vendorId: user.id,
        vendor_id: user.id,
        vendorName: user.name,
        vendor_name: user.name,
        clientCpf: cpf,
        client_cpf: cpf,
        clientName: nome,
        client_name: nome,
        product: 'CRÉDITO UY3',
        convenio: 'INTERNO',
        entidade: 'FUNCIONÁRIO',
        valor,
        valorFinal: valor,
        desconto: 0,
        credito: true,
        creditoEsteira: {
          protocolo,
          status: 'pendente',
          valor_solicitado: valor,
          forma_pagamento: meta.forma_pagamento,
          criado_em: now,
        },
        credito_esteira: {
          protocolo,
          status: 'pendente',
          valor_solicitado: valor,
          forma_pagamento: meta.forma_pagamento,
          criado_em: now,
        },
        meta: { ...meta, credito: true, opcao_credito: true },
        obs: obsLines.join('\n'),
        status,
        statusOp: status,
        history: [{
          date: now,
          actorName: user.name,
          action: 'Solicitação proposta crédito UY3',
          note: `Protocolo ${protocolo} — análise em até 7 dias`,
        }],
        createdAt: now,
        updatedAt: now,
        updated_at: now,
      };

      const btn = document.getElementById('pc_submit_btn');
      const oldLabel = btn?.textContent || '';
      if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
      if (typeof showLoading === 'function') showLoading('Registrando solicitação…');

      try {
        if (typeof DB.save === 'function') await DB.save('proposals', proposal);
        else if (typeof DB.saveProposal === 'function') await DB.saveProposal(proposal);
        else throw new Error('Camada de dados indisponível.');

        if (typeof showToast === 'function') {
          showToast(`Solicitação registrada! Protocolo: ${protocolo}`, 'success');
        } else {
          alert(`Solicitação registrada!\nProtocolo: ${protocolo}`);
        }
        this.resetForm();
        if (document.getElementById('pc_protocolo')) {
          document.getElementById('pc_protocolo').value = protocolo;
        }
      } catch (e) {
        console.error('[PropostaCredito]', e);
        if (typeof showToast === 'function') showToast(e.message || 'Erro ao salvar.', 'error');
        else alert(e.message || 'Erro ao salvar.');
      } finally {
        if (typeof hideLoading === 'function') hideLoading();
        if (btn) { btn.disabled = false; btn.textContent = oldLabel || 'SOLICITAR 7 DIAS PARA ANÁLISE'; }
      }
    },
  };

  window.PropostaCredito = PropostaCredito;
  window.buscarPcFuncionario = () => PropostaCredito.buscarFuncionario();
  window.buscarPcAvalista = () => PropostaCredito.buscarAvalista();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PropostaCredito.init());
  } else {
    PropostaCredito.init();
  }
})();
