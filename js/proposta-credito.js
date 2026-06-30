/* SOU+BLU — Solicitar Proposta Crédito (UY3) */
(function () {
  'use strict';

  const MAX_VALOR = 1621.0;
  const PIX_AUTOMATICO_FIXO = 'PIX automático';
  const ALLOWED_BANKS = [
    '001 - BANCO DO BRASIL',
    '237 - BRADESCO',
    '033 - SANTANDER',
    '341 - ITAU',
    '104 - CAIXA',
  ];

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function digits(v) {
    return String(v ?? '').replace(/\D/g, '');
  }

  function fmtMoney(n) {
    return 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtCpf(v) {
    const d = digits(v).slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  function _renderPersonInfo(infoEl, data, loading) {
    if (!infoEl) return;
    if (loading) {
      infoEl.hidden = false;
      infoEl.innerHTML = '<span class="text-muted">Buscando dados...</span>';
      return;
    }
    if (!data || !data.nome) {
      infoEl.hidden = true;
      infoEl.innerHTML = '';
      return;
    }
    const rows = [
      ['Nome', data.nome],
      ['CPF', data.cpf ? fmtCpf(data.cpf) : ''],
      ['Matrícula', data.matricula],
      ['Departamento', data.departamento],
      ['Cargo', data.cargo],
      ['E-mail', data.email],
      ['Telefone', data.telefone],
      ['Telefone 2', data.telefone2],
    ].filter(([, v]) => v);
    infoEl.hidden = false;
    infoEl.innerHTML = rows.map(([l, v]) =>
      `<div><span style="color:var(--color-text-muted);font-size:11px;text-transform:uppercase;">${esc(l)}</span><br/><strong>${esc(v)}</strong></div>`
    ).join('');
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
    return ALLOWED_BANKS.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
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
          ${finGridRow('CPF FUNCIONÁRIO', `<input type="text" class="form-control mask-cpf" id="pc_cpf_funcionario" placeholder="000.000.000-00" required autocomplete="off"/>
          <div id="pc_func_info" hidden class="pc-info-box pc-info-grid"></div>
          <input type="hidden" id="pc_func_nome"/>`)}
          ${finGridRow('VALOR SOLICITADO', `<input type="number" class="form-control" id="pc_valor" min="0.01" max="${MAX_VALOR}" step="0.01" placeholder="0,00" required/>
            <p class="pc-field-hint" id="pc_valor_hint">Máximo: ${fmtMoney(MAX_VALOR)}</p>`)}
          ${finGridRow('NÚMERO DE PARCELAS', `<select class="form-control" id="pc_parcelas" required>
            <option value="">Selecione...</option>
            <option value="2">2 meses</option>
            <option value="3">3 meses</option>
            <option value="4">4 meses</option>
          </select>`)}
          ${finGridRow('PIX AUTOMÁTICO', `<input type="text" class="form-control" value="${esc(PIX_AUTOMATICO_FIXO)}" readonly style="background:#f9fafb;font-weight:600;"/>
          <input type="hidden" id="pc_forma_pagamento" value="${esc(PIX_AUTOMATICO_FIXO)}"/>
          <p class="pc-field-hint">Débito automático na conta informada abaixo (agência e conta corrente).</p>`)}
          ${finGridRow('BANCO', `<select class="form-control" id="pc_banco" required>
            <option value="">Selecione o banco...</option>
            ${bankOptions()}
          </select>`)}
          ${finGridRow('AGÊNCIA', `<input type="text" class="form-control" id="pc_agencia" placeholder="2805 (sem dígito)" required/>
          <p class="pc-field-hint">Somente o número da agência (até 4 dígitos), sem o dígito verificador.</p>`)}
          ${finGridRow('CONTA CORRENTE', `<input type="text" class="form-control" id="pc_conta" placeholder="00000000-0" required/>
          <p class="pc-field-hint">Número da conta com dígito (pode usar hífen).</p>`)}
          ${finGridRow('1ª CONTATO', `<input type="text" class="form-control mask-phone" id="pc_contato1" placeholder="(00) 00000-0000"/>`)}
          ${finGridRow('2ª CONTATO', `<input type="text" class="form-control mask-phone" id="pc_contato2" placeholder="(00) 00000-0000"/>`)}
          <tr class="pc-section-row"><td colspan="2">AVALISTA (OPCIONAL)</td></tr>
          ${finGridRow('AVALISTA — CPF', `<input type="text" class="form-control mask-cpf" id="pc_avalista_cpf" placeholder="000.000.000-00" autocomplete="off"/>
          <div id="pc_avalista_info" hidden class="pc-info-box pc-info-grid"></div>
          <input type="hidden" id="pc_avalista_nome"/>`)}
          ${finGridRow('TELEFONE AVALISTA', `<input type="text" class="form-control mask-phone" id="pc_avalista_tel" placeholder="(00) 00000-0000"/>`)}
        </tbody>
      </table>
    </div>
    <div class="pc-form-actions">
      <button type="submit" class="btn btn-primary btn-lg" id="pc_submit_btn">SOLICITAR ANÁLISE</button>
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
.pc-info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px 16px; }
.pc-field-hint { margin: 4px 0 0; font-size: 11px; color: var(--color-text-muted); }
.pc-field-hint.is-error { color: #dc2626; font-weight: 600; }
.pc-input-invalid { border-color: #dc2626 !important; box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.12); }
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
      ['pc_cpf_funcionario', 'pc_func_nome', 'pc_valor', 'pc_parcelas', 'pc_agencia', 'pc_conta',
        'pc_contato1', 'pc_contato2', 'pc_avalista_cpf', 'pc_avalista_nome', 'pc_avalista_tel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      ['pc_banco'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      const fp = document.getElementById('pc_forma_pagamento');
      if (fp) fp.value = PIX_AUTOMATICO_FIXO;
      const valorEl = document.getElementById('pc_valor');
      if (valorEl) valorEl.classList.remove('pc-input-invalid');
      const hint = document.getElementById('pc_valor_hint');
      if (hint) {
        hint.classList.remove('is-error');
        hint.textContent = `Máximo: ${fmtMoney(MAX_VALOR)}`;
      }
      ['pc_func_info', 'pc_avalista_info'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.hidden = true; el.innerHTML = ''; }
      });
    },

    _wireValorInput() {
      const input = document.getElementById('pc_valor');
      const hint = document.getElementById('pc_valor_hint');
      if (!input) return;
      const refresh = () => {
        const v = parseFloat(input.value);
        const over = Number.isFinite(v) && v > MAX_VALOR;
        input.classList.toggle('pc-input-invalid', over);
        if (hint) {
          hint.classList.toggle('is-error', over);
          hint.textContent = over
            ? `Acima do máximo (${fmtMoney(MAX_VALOR)}). Ao sair do campo, o valor será ajustado.`
            : `Máximo: ${fmtMoney(MAX_VALOR)}`;
        }
      };
      input.addEventListener('input', refresh);
      input.addEventListener('blur', () => {
        let v = parseFloat(input.value);
        if (Number.isFinite(v) && v > MAX_VALOR) {
          input.value = String(MAX_VALOR);
          refresh();
          if (typeof showToast === 'function') {
            showToast(`Valor ajustado para o máximo: ${fmtMoney(MAX_VALOR)}`, 'info');
          }
        }
      });
    },

    _wireCpfAutoLookup(inputId, lookupFn) {
      const input = document.getElementById(inputId);
      if (!input) return;
      let timer = null;
      let lastCpf = '';
      const schedule = () => {
        clearTimeout(timer);
        const cpf = digits(input.value);
        if (cpf.length < 11) {
          if (cpf.length === 0) lookupFn('', { reset: true });
          return;
        }
        if (cpf === lastCpf) return;
        timer = setTimeout(() => {
          lastCpf = cpf;
          lookupFn(cpf, { auto: true });
        }, 450);
      };
      input.addEventListener('input', schedule);
      input.addEventListener('blur', () => {
        clearTimeout(timer);
        const cpf = digits(input.value);
        if (cpf.length === 11 && cpf !== lastCpf) {
          lastCpf = cpf;
          lookupFn(cpf, { auto: true });
        }
      });
    },

    _wireAutoLookups() {
      this._wireCpfAutoLookup('pc_cpf_funcionario', (cpf, opts) => this.buscarFuncionario(cpf, opts));
      this._wireCpfAutoLookup('pc_avalista_cpf', (cpf, opts) => this.buscarAvalista(cpf, opts));
    },

    renderShell(rootId) {
      _injectStyles();
      const root = document.getElementById(rootId);
      if (!root) return;
      root.innerHTML = _formHtml();
      this.resetForm();
      this._wireValorInput();
      this._wireAutoLookups();
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

    async buscarFuncionario(cpfArg, opts = {}) {
      const cpf = digits(cpfArg || document.getElementById('pc_cpf_funcionario')?.value);
      const info = document.getElementById('pc_func_info');
      const nomeEl = document.getElementById('pc_func_nome');
      if (opts.reset || cpf.length === 0) {
        if (nomeEl) nomeEl.value = '';
        _renderPersonInfo(info, null);
        return;
      }
      if (cpf.length !== 11) {
        if (!opts.auto && typeof showToast === 'function') showToast('Informe um CPF válido (11 dígitos).', 'warning');
        return;
      }

      _renderPersonInfo(info, null, true);

      const data = { cpf, nome: '', matricula: '', departamento: '', cargo: '', email: '', telefone: '', telefone2: '' };

      try {
        const rh = await _lookupRhEmployee(cpf);
        if (rh) {
          data.nome = rh.nome || rh.name || '';
          data.matricula = rh.matricula || '';
          data.departamento = rh.departamento || '';
          data.cargo = rh.cargo || '';
          data.email = rh.email || '';
          data.telefone = rh.contato || rh.phone || '';
          data.telefone2 = rh.contato_terceiros || '';
          const c1 = document.getElementById('pc_contato1');
          if (c1 && !c1.value && data.telefone) c1.value = data.telefone;
          const c2 = document.getElementById('pc_contato2');
          if (c2 && !c2.value && data.telefone2) c2.value = data.telefone2;
        }

        if (!data.nome) {
          const u = await _lookupSystemUser(cpf);
          if (u) {
            data.nome = u.name || '';
            data.departamento = u.department || data.departamento;
            data.cargo = u.role || data.cargo;
            data.email = u.email || data.email;
            data.telefone = u.phone || data.telefone;
            const c1 = document.getElementById('pc_contato1');
            if (c1 && !c1.value && u.phone) c1.value = u.phone;
          }
        }

        if (typeof FonteData !== 'undefined') {
          const res = await FonteData.lookupCpf(cpf);
          if (res.ok && res.client) {
            if (!data.nome && res.client.name) data.nome = res.client.name;
            if (!data.email && res.client.email) data.email = res.client.email;
            if (!data.telefone && res.client.phone1) data.telefone = res.client.phone1;
            const c1 = document.getElementById('pc_contato1');
            if (c1 && !c1.value && res.client.phone1) c1.value = res.client.phone1;
          } else if (!data.nome && !rh) {
            throw new Error(res.error || 'CPF não encontrado nas bases.');
          }
        } else if (!data.nome) {
          throw new Error('Funcionário não encontrado no cadastro RH.');
        }

        if (nomeEl) nomeEl.value = data.nome;
        _renderPersonInfo(info, data);
        if (!opts.auto && typeof showToast === 'function') showToast('Dados do funcionário carregados.', 'success');
      } catch (e) {
        if (nomeEl) nomeEl.value = '';
        if (info) {
          info.hidden = false;
          info.innerHTML = `<span style="color:#dc2626;">${esc(e.message || 'Falha na consulta')}</span>`;
        } else if (!opts.auto && typeof showToast === 'function') {
          showToast(e.message || 'Falha na consulta', 'error');
        }
      }
    },

    async buscarAvalista(cpfArg, opts = {}) {
      const cpf = digits(cpfArg || document.getElementById('pc_avalista_cpf')?.value);
      const info = document.getElementById('pc_avalista_info');
      const nomeEl = document.getElementById('pc_avalista_nome');
      if (opts.reset || cpf.length === 0) {
        if (nomeEl) nomeEl.value = '';
        _renderPersonInfo(info, null);
        return;
      }
      if (cpf.length !== 11) {
        if (!opts.auto && typeof showToast === 'function') showToast('Informe o CPF do avalista (11 dígitos).', 'warning');
        return;
      }
      if (typeof FonteData === 'undefined') {
        if (!opts.auto && typeof showToast === 'function') showToast('API de consulta não disponível.', 'error');
        return;
      }

      _renderPersonInfo(info, null, true);

      try {
        const res = await FonteData.lookupCpf(cpf);
        if (!res.ok) throw new Error(res.error || 'CPF não encontrado.');
        const data = {
          cpf,
          nome: res.client?.name || '',
          email: res.client?.email || '',
          telefone: res.client?.phone1 || '',
        };
        if (nomeEl) nomeEl.value = data.nome;
        const tel = document.getElementById('pc_avalista_tel');
        if (tel && !tel.value && data.telefone) tel.value = data.telefone;
        _renderPersonInfo(info, data);
        if (!opts.auto && typeof showToast === 'function') showToast('Dados do avalista carregados.', 'success');
      } catch (e) {
        if (nomeEl) nomeEl.value = '';
        if (info) {
          info.hidden = false;
          info.innerHTML = `<span style="color:#dc2626;">${esc(e.message || 'Falha na consulta')}</span>`;
        }
      }
    },

    _collectMeta() {
      const gv = id => document.getElementById(id)?.value?.trim() || '';
      const parcelas = parseInt(gv('pc_parcelas'), 10);
      return {
        tipo: 'proposta_credito_uy3',
        cpf_funcionario: digits(gv('pc_cpf_funcionario')),
        nome_funcionario: gv('pc_func_nome'),
        parcelas: Number.isFinite(parcelas) ? parcelas : null,
        parcelas_meses: Number.isFinite(parcelas) ? parcelas : null,
        conta_santander: '',
        forma_pagamento: PIX_AUTOMATICO_FIXO,
        banco: gv('pc_banco'),
        agencia: gv('pc_agencia'),
        conta_corrente: gv('pc_conta'),
        contato1: gv('pc_contato1'),
        contato2: gv('pc_contato2'),
        observacao: '',
        avalista_cpf: digits(gv('pc_avalista_cpf')),
        avalista_nome: gv('pc_avalista_nome'),
        avalista_telefone: gv('pc_avalista_tel'),
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
      let valor = parseFloat(document.getElementById('pc_valor')?.value);
      if (Number.isFinite(valor) && valor > MAX_VALOR) valor = MAX_VALOR;

      if (cpf.length !== 11) {
        if (typeof showToast === 'function') showToast('Informe o CPF do funcionário.', 'warning');
        return;
      }
      if (!nome) {
        if (typeof showToast === 'function') showToast('Digite o CPF e aguarde o carregamento dos dados do funcionário.', 'warning');
        return;
      }
      const parcelas = parseInt(document.getElementById('pc_parcelas')?.value, 10);
      if (![2, 3, 4].includes(parcelas)) {
        if (typeof showToast === 'function') showToast('Selecione o número de parcelas (2, 3 ou 4 meses).', 'warning');
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
      let beneficiaryUserId = user.id;
      if (cpf.length === 11 && typeof DB !== 'undefined' && typeof DB.getUserByCpf === 'function') {
        const beneficiary = await DB.getUserByCpf(cpf).catch(() => null);
        if (beneficiary?.id) beneficiaryUserId = beneficiary.id;
      }
      meta.beneficiary_user_id = beneficiaryUserId;
      meta.beneficiary_cpf = cpf;
      const obsLines = [
        '[CREDITO] Solicitação proposta crédito',
        `Protocolo: ${protocolo}`,
        `Funcionário: ${nome} (CPF ${cpf})`,
        `Valor: ${fmtMoney(valor)}`,
        `Parcelas: ${parcelas} meses`,
        `PIX automático: ${meta.forma_pagamento} · Conta: ${meta.banco} Ag ${meta.agencia} Cc ${meta.conta_corrente}`,
        meta.avalista_cpf ? `Avalista: ${meta.avalista_nome || '—'} (${meta.avalista_cpf})` : '',
      ].filter(Boolean);

      const proposalId = `PC-${Date.now()}`;
      const now = new Date().toISOString();
      const status = 'AG. ANÁLISE';

      const creditRow = {
        id: proposalId,
        protocolo,
        employee_id: user.id,
        employee_name: user.name,
        vendor_id: user.id,
        vendor_name: user.name,
        cpf,
        nome,
        valor_solicitado: valor,
        conta_santander: meta.conta_santander,
        forma_pagamento: meta.forma_pagamento,
        banco: meta.banco,
        agencia: meta.agencia,
        conta_corrente: meta.conta_corrente,
        contato1: meta.contato1,
        contato2: meta.contato2,
        observacao: meta.observacao,
        avalista_cpf: meta.avalista_cpf,
        avalista_nome: meta.avalista_nome,
        avalista_telefone: meta.avalista_telefone,
        status,
        esteira: {
          protocolo,
          status: 'pendente',
          valor_solicitado: valor,
          forma_pagamento: meta.forma_pagamento,
          parcelas,
          parcelas_meses: parcelas,
          criado_em: now,
        },
        meta: { ...meta, credito: true, opcao_credito: true, credit_table: 'credit_proposals' },
        history: [{
          date: now,
          actorName: user.name,
          action: 'Solicitação proposta crédito',
          note: `Protocolo ${protocolo}`,
        }],
      };

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
        product: 'CRÉDITO',
        convenio: 'INTERNO',
        entidade: 'FUNCIONÁRIO',
        valor,
        valorFinal: valor,
        desconto: 0,
        creditoEsteira: {
          protocolo,
          status: 'pendente',
          valor_solicitado: valor,
          forma_pagamento: meta.forma_pagamento,
          parcelas,
          parcelas_meses: parcelas,
          criado_em: now,
        },
        credito_esteira: {
          protocolo,
          status: 'pendente',
          valor_solicitado: valor,
          forma_pagamento: meta.forma_pagamento,
          parcelas,
          parcelas_meses: parcelas,
          criado_em: now,
        },
        meta: { ...meta, credito: true, opcao_credito: true, credit_table: 'credit_proposals' },
        obs: obsLines.join('\n'),
        status,
        statusOp: status,
        history: [{
          date: now,
          actorName: user.name,
          action: 'Solicitação proposta crédito',
          note: `Protocolo ${protocolo}`,
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
        if (!window.CreditoPropostasApi?.create) {
          throw new Error('API de propostas de crédito indisponível. Recarregue a página (Ctrl+F5).');
        }
        await CreditoPropostasApi.create(creditRow);

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
        if (btn) { btn.disabled = false; btn.textContent = oldLabel || 'SOLICITAR ANÁLISE'; }
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
