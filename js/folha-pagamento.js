/* =============================================
   SOU + BLU – Folha de Pagamento
   RH & Financeiro — gera folha por parceiro/mês
   ============================================= */

(async function () {
  'use strict';

  /* ══ ESTADO ══ */
  let _parceiros   = [];
  let _funcionarios = [];   // equipe carregada do parceiro selecionado
  let _folhaData   = null;  // resultado do processamento
  let _swStatus    = null;  // meta Sistema Web (api/folha_api.php?action=status)
  let _protocolo   = '';

  /* ══ SISTEMA WEB PROXY ══ */
  function folhaApiUrl(action) {
    const base = String((window.SOUBLU_CONFIG || {}).API_BASE_URL || '').replace(/\/+$/, '');
    const path = `/api/folha_api.php?action=${encodeURIComponent(action)}`;
    return base ? `${base}${path}` : path;
  }

  function folhaApiHeaders() {
    const key = String((window.SOUBLU_CONFIG || {}).API_KEY || '').trim();
    const h = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (key) h['X-API-Key'] = key;
    return h;
  }

  async function folhaApiFetch(action, opts = {}) {
    const method = opts.method || (opts.body ? 'POST' : 'GET');
    const res = await fetch(folhaApiUrl(action), {
      method,
      headers: folhaApiHeaders(),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    if (!res.ok || (data && data.ok === false)) {
      const err = new Error((data && (data.error || data.setup_hint)) || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data || { ok: true };
  }

  function setSwBadge(state, text) {
    const badge = document.getElementById('fpSwBadge');
    if (!badge) return;
    badge.dataset.state = state || 'off';
    badge.textContent = text || '';
    badge.title = (_swStatus && _swStatus.setup_hint) || text || '';
  }

  function updateSwUi() {
    const ready = !!( _swStatus && _swStatus.ready );
    const toggle = document.getElementById('fpSyncSistemaWeb');
    const wrap = document.getElementById('fpSwToggleWrap');
    if (wrap) wrap.style.display = ready ? '' : 'none';
    if (toggle) {
      toggle.disabled = !ready;
      if (!ready) toggle.checked = false;
      else if (!toggle.dataset.userTouched) toggle.checked = true;
    }
    if (!_swStatus) {
      setSwBadge('unknown', 'Sistema Web: verificando…');
      return;
    }
    if (ready) {
      setSwBadge('ready', 'Sistema Web: conectada');
    } else if (_swStatus.configured) {
      setSwBadge('partial', 'Sistema Web: falta path da API');
    } else {
      setSwBadge('off', 'Sistema Web: não configurada');
    }
  }

  async function probeSistemaWeb() {
    try {
      _swStatus = await folhaApiFetch('status');
    } catch (e) {
      _swStatus = {
        ok: false,
        ready: false,
        configured: false,
        paths_ready: false,
        setup_hint: e.message || 'Falha ao consultar proxy',
      };
      setSwBadge('error', 'Sistema Web: proxy indisponível');
      return;
    }
    updateSwUi();
  }

  function gerarProtocoloFolha() {
    const d = new Date();
    const y = d.getFullYear().toString(36).toUpperCase();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const r = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `FLH-${y}${m}${day}-${r}`;
  }

  function fillMetaFields() {
    _protocolo = gerarProtocoloFolha();
    const p = document.getElementById('fpProtocolo');
    if (p) p.value = _protocolo;
    const session = (typeof Auth !== 'undefined' && Auth.getSession) ? Auth.getSession() : null;
    const sol = document.getElementById('fpSolicitante');
    if (sol) sol.value = (session && (session.name || session.email)) || '—';
    const loginEl = document.getElementById('fpLoginFuncionario');
    if (loginEl) loginEl.value = '';
    updateSidebarUser(session);
  }

  /* ══ SIDEBAR (esteira) — usuário logado no rodapé ══ */
  function updateSidebarUser(session) {
    const nameEl = document.getElementById('userName');
    const roleEl = document.getElementById('userRole');
    const avEl   = document.getElementById('userAvatar');
    if (!nameEl && !roleEl && !avEl) return;
    const name = (session && (session.name || session.email)) || '—';
    if (nameEl) nameEl.textContent = name;
    if (roleEl) roleEl.textContent = roleLabel(session && session.role);
    if (avEl) avEl.textContent = getInitials(name);
  }

  /* ══ HELPERS ══ */
  function fmtMoney(v) {
    const n = parseFloat(v) || 0;
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtMes(monthVal) {
    if (!monthVal) return '—';
    const [y, m] = monthVal.split('-');
    const d = new Date(parseInt(y), parseInt(m) - 1, 1);
    return d.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
  }

  function getInitials(name) {
    return (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  function roleLabel(role) {
    const map = {
      vendedor: 'Vendedor', employee: 'Funcionário', backoffice: 'Backoffice',
      operacional: 'Operacional', supervisor: 'Supervisor', sup_backoffice: 'Sup. Backoffice',
      rh: 'RH', financeiro: 'Financeiro', financial: 'Financeiro',
      parceiro: 'Parceiro', gerente: 'Gerente', master: 'Master',
    };
    return map[String(role || '').toLowerCase()] || (role || '—');
  }

  /* Extrai dados PIX salvos do usuário */
  function getPixData(user) {
    // Verifica payment_saved (campo do DB)
    let ps = user.payment_saved || user.paymentSaved;
    if (typeof ps === 'string') { try { ps = JSON.parse(ps); } catch (_) { ps = null; } }

    const pix = (ps && ps.pix) ? ps.pix : {};

    // Fallback: campo legado localStorage (não disponível aqui; usamos só DB)
    // Também verifica campos diretos no usuário
    const key  = pix.pix_key  || user.pix_key  || '';
    const type = pix.pix_key_type || user.pix_key_type || '';
    const holder = pix.holder_name || user.pix_holder || '';
    const bank   = pix.bank_name   || user.bank_name   || '';

    return { key, type, holder, bank };
  }

  /* Formata exibição do chip de dados bancários */
  function renderBankChip(user) {
    const { key, type, holder, bank } = getPixData(user);
    if (!key) {
      return `<span class="fp-bank-empty">— não informado</span>`;
    }
    const typeLabels = { cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', phone: 'Celular', random: 'Aleatória' };
    const typeStr = typeLabels[type] || type || 'PIX';
    return `<div class="fp-bank-chip">
      <span class="fp-bank-chip-type">${typeStr}</span>
      <span>${key}</span>
    </div>
    ${holder ? `<div style="font-size:11px;color:var(--color-text-muted,#94a3b8);margin-top:3px;">${holder}${bank ? ' · ' + bank : ''}</div>` : ''}`;
  }

  /* ══ TOAST ══ */
  function showToast(msg, type = 'info', ms = 3500) {
    const c = document.getElementById('fpToastContainer');
    if (!c) return;
    const icons = { success: '✅', error: '❌', info: '📢' };
    const el = document.createElement('div');
    el.className = `fp-toast ${type}`;
    el.innerHTML = `<span>${icons[type] || '📢'}</span> ${msg}`;
    c.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  /* ══ LOADER ══ */
  function showLoader(msg = 'Carregando...') {
    const l = document.getElementById('fpLoader');
    const t = document.getElementById('fpLoaderText');
    if (l) l.classList.add('active');
    if (t) t.textContent = msg;
  }
  function hideLoader() {
    const l = document.getElementById('fpLoader');
    if (l) l.classList.remove('active');
  }

  /* ══ MODAL (não sobrescrever window.closeModal — usado pelos modais globais) ══ */
  function closeFolhaConfirmModal() {
    document.getElementById('modalConfirmar')?.classList.remove('active');
  }
  window.closeFolhaModal = closeFolhaConfirmModal;
  window.salvarFolhaRascunho = async function () {
    if (!_funcionarios.length) { showToast('Carregue os funcionários primeiro.', 'error'); return; }
    const empresaId = document.getElementById('selectEmpresa')?.value;
    const mes = document.getElementById('selectMes')?.value;
    if (!empresaId || !mes) { showToast('Selecione empresa e mês.', 'error'); return; }
    const linhas = coletarLinhas();
    const key = `soublu_folha_rascunho_${empresaId}_${mes}`;
    try {
      localStorage.setItem(key, JSON.stringify({ empresaId, mes, linhas, saved_at: new Date().toISOString() }));
      showToast('Rascunho da folha salvo localmente.', 'success');
    } catch (e) {
      showToast('Não foi possível salvar o rascunho.', 'error');
    }
  };
  window.imprimirRecibo = function () { window.print(); };

  /* ══ NAVIGATE BACK ══ */
  // Não usa history.back(): pode voltar do bfcache "congelada" (conexão com o
  // banco parada). Quando a página que abriu a Folha manda um "?back=" (ex.:
  // o Financeiro manda a URL dele já com ?section=&tab= da tela que estava
  // aberta, como a Esteira de Crédito), voltamos exatamente pra lá com
  // recarga forçada — assim a seção continua aberta em vez de resetar.
  // Sem "back" (acesso direto, ou vindo do RH), cai no admin.html com
  // recarga forçada, igual a todas as outras telas do painel (RH Manager,
  // Jurídico, Monitoramento, Leads etc. — todas usam Auth.adminPageHrefFresh()).
  function backHrefFromQuery() {
    try {
      const raw = new URLSearchParams(window.location.search).get('back');
      if (!raw) return '';
      const u = new URL(raw, window.location.href);
      return (u.origin === window.location.origin) ? u.href : '';
    } catch (_) {
      return '';
    }
  }

  window.navigateBack = function () {
    try {
      window.location.replace(
        backHrefFromQuery() ||
        ((typeof Auth !== 'undefined' && typeof Auth.adminPageHrefFresh === 'function')
          ? Auth.adminPageHrefFresh()
          : 'admin.html')
      );
    } catch (_) {
      window.location.href = (typeof Auth !== 'undefined' && typeof Auth.adminPageHref === 'function')
        ? Auth.adminPageHref()
        : 'admin.html';
    }
  };

  /* ══ INIT ══ */
  async function init() {
    // Verifica autenticação e papel
    try {
      await Auth.requireLogin();
    } catch (e) {
      if (e.message === 'AUTH_REDIRECT') return;
      throw e;
    }

    const session = Auth.getSession();
    const allowed = ['master', 'fundador', 'desenvolvedor', 'rh', 'financeiro', 'financial', 'gerencia', 'gerente', 'diretoria'];
    if (!session || !allowed.includes(session.role)) {
      showToast('Acesso restrito a RH e Financeiro.', 'error');
      setTimeout(() => { window.location.href = 'admin.html'; }, 2000);
      return;
    }

    // Define mês padrão = mês atual
    const hoje = new Date();
    const mesStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('selectMes').value = mesStr;

    fillMetaFields();
    document.getElementById('fpSyncSistemaWeb')?.addEventListener('change', function () {
      this.dataset.userTouched = '1';
    });

    // Carrega parceiros + status Sistema Web (não bloqueia se proxy falhar)
    await Promise.all([carregarParceiros(), probeSistemaWeb()]);
  }

  /* ══ CARREGAR PARCEIROS ══ */
  async function carregarParceiros() {
    showLoader('Carregando empresas...');
    try {
      _parceiros = await DB.getPartners().catch(() => []);
      const sel = document.getElementById('selectEmpresa');
      sel.innerHTML = '<option value="">Selecione a empresa...</option>';
      if (!_parceiros.length) {
        sel.innerHTML += '<option value="" disabled>Nenhum parceiro cadastrado</option>';
      } else {
        _parceiros
          .filter(p => p.active !== false)
          .sort((a, b) => (a.razao_social || '').localeCompare(b.razao_social || ''))
          .forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = (p.razao_social || 'Parceiro sem nome') + (p.cnpj ? ` — CNPJ: ${p.cnpj}` : '');
            sel.appendChild(opt);
          });
      }
    } catch (e) {
      console.error('[FolhaPagamento] carregarParceiros:', e);
      showToast('Erro ao carregar empresas.', 'error');
    } finally {
      hideLoader();
    }
  }

  /* ══ ON EMPRESA CHANGE ══ */
  window.onEmpresaChange = function () {
    // limpa tabela ao trocar empresa
    _funcionarios = [];
    document.getElementById('fpTableCard').style.display  = 'none';
    document.getElementById('fpSummary').style.display    = 'none';
    document.getElementById('fpFooterBar').style.display  = 'none';
    updateExportBtns(false);
  };

  /* ══ CARREGAR FUNCIONÁRIOS ══ */
  window.carregarFuncionarios = async function () {
    const empresaId = document.getElementById('selectEmpresa').value;
    const mes       = document.getElementById('selectMes').value;

    if (!empresaId) { showToast('Selecione a empresa.', 'error'); return; }
    if (!mes)       { showToast('Selecione o mês de referência.', 'error'); return; }

    const parceiro = _parceiros.find(p => p.id === empresaId);

    showLoader('Carregando funcionários...');
    try {
      let equipe = [];
      let source = 'local';

      // Preferência: Sistema Web quando credentials+paths estiverem prontos
      if (_swStatus?.ready) {
        try {
          const sw = await folhaApiFetch('employees', {
            method: 'POST',
            body: {
              cnpj: parceiro?.cnpj || '',
              mes,
              empresa_id: empresaId,
              protocolo: _protocolo || document.getElementById('fpProtocolo')?.value || '',
            },
          });
          if (Array.isArray(sw.employees) && sw.employees.length) {
            equipe = sw.employees.map(emp => {
              // Adequa pix_* do SW ao formato getPixData
              if (emp.pix_key && !emp.payment_saved) {
                emp.payment_saved = {
                  pix: {
                    pix_key: emp.pix_key,
                    pix_key_type: emp.pix_key_type || '',
                    holder_name: emp.pix_holder || '',
                    bank_name: emp.bank_name || '',
                  },
                };
              }
              return emp;
            });
            source = 'sistema_web';
          }
        } catch (swErr) {
          console.warn('[FolhaPagamento] Sistema Web employees fallback local:', swErr);
          showToast('Sistema Web indisponível — usando cadastro local.', 'info', 4000);
        }
      }

      // Local (DB RH) — padrão atual e fallback
      if (!equipe.length) {
        const partnerUserId = parceiro?.user_id;
        if (partnerUserId) {
          equipe = await DB.getPartnerTeam(partnerUserId).catch(() => []);
        }
        if (!equipe.length && partnerUserId) {
          const all = await DB.getUsers().catch(() => []);
          equipe = all.filter(u =>
            String(u.admin_id) === String(partnerUserId) &&
            u.active !== false
          );
        }
        source = 'local';
      }

      _funcionarios = equipe;

      if (!equipe.length) {
        showToast('Nenhum funcionário encontrado para esta empresa.', 'info');
        renderEmptyTable();
        document.getElementById('fpTableCard').style.display = '';
        document.getElementById('fpFooterBar').style.display = '';
      } else {
        renderTabela(equipe, parceiro, mes);
        document.getElementById('fpTableCard').style.display = '';
        document.getElementById('fpSummary').style.display   = '';
        document.getElementById('fpFooterBar').style.display = '';
        if (source === 'sistema_web') {
          showToast(`${equipe.length} funcionário(s) via Sistema Web.`, 'success');
        }
      }

      updateSummary();
    } catch (e) {
      console.error('[FolhaPagamento] carregarFuncionarios:', e);
      showToast('Erro ao carregar funcionários.', 'error');
    } finally {
      hideLoader();
    }
  };

  /* ══ RENDER EMPTY TABLE ══ */
  function renderEmptyTable() {
    document.getElementById('fpTableBody').innerHTML = `
      <tr>
        <td colspan="7">
          <div class="fp-empty">
            <div class="fp-empty-icon">👥</div>
            <div class="fp-empty-title">Nenhum funcionário encontrado</div>
            <div class="fp-empty-desc">Esta empresa não possui funcionários cadastrados.</div>
          </div>
        </td>
      </tr>`;
    document.getElementById('fpTableTitle').textContent = 'Funcionários (0)';
    updateSummary();
  }

  /* ══ RENDER TABELA ══ */
  function renderTabela(emps, parceiro, mes) {
    const title = document.getElementById('fpTableTitle');
    title.textContent = `Funcionários de ${parceiro?.razao_social || 'Empresa'} — ${fmtMes(mes)} (${emps.length})`;

    const tbody = document.getElementById('fpTableBody');
    tbody.innerHTML = emps.map((emp, idx) => {
      const ini  = getInitials(emp.name);
      const foto = emp.photo_url || emp.photo || '';
      const avatarHtml = foto
        ? `<div class="fp-emp-avatar"><img src="${foto}" alt="${emp.name}"/></div>`
        : `<div class="fp-emp-avatar">${ini}</div>`;

      const login = emp.login || emp.email || emp.usuario || '';
      const valorPrefill = (emp.valor != null && Number(emp.valor) > 0)
        ? Number(emp.valor).toFixed(2)
        : '';
      return `<tr id="row-${idx}" data-idx="${idx}" data-emp-id="${emp.id}">
        <td class="td-check">
          <input type="checkbox" class="fp-check emp-check" data-idx="${idx}" checked
            onchange="onRowCheck(${idx})"/>
        </td>
        <td>
          <div class="fp-emp-cell">
            ${avatarHtml}
            <div>
              <div class="fp-emp-name">${emp.name}</div>
              <div class="fp-emp-role">${roleLabel(emp.role)}${emp.matricula ? ' · ' + emp.matricula : ''}</div>
            </div>
          </div>
        </td>
        <td style="color:var(--color-text-muted,#94a3b8);font-size:12px;">
          ${login || '—'}
        </td>
        <td style="color:var(--color-text-muted,#94a3b8);font-size:12px;">
          ${emp.matricula || '—'}
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:13px;color:var(--color-text-muted,#94a3b8);">R$</span>
            <input type="number" class="fp-value-input" id="valor-${idx}" data-idx="${idx}"
              placeholder="0,00" min="0" step="0.01" value="${valorPrefill}"
              oninput="onValorInput(${idx})"
              onblur="onValorBlur(${idx})"/>
          </div>
        </td>
        <td>
          ${renderBankChip(emp)}
        </td>
        <td id="status-${idx}">
          <span style="font-size:12px;color:var(--color-text-muted,#94a3b8);">Aguardando valor</span>
        </td>
      </tr>`;
    }).join('');

    const loginEl = document.getElementById('fpLoginFuncionario');
    if (loginEl && emps.length) {
      const first = emps[0];
      loginEl.value = first.login || first.email || `${emps.length} colaborador(es)`;
    }

    updateSummary();
    emps.forEach((_, idx) => updateStatusCell(idx));
  }

  /* ══ EVENTS ON TABLE ══ */
  window.onRowCheck = function (idx) {
    const chk = document.querySelector(`.emp-check[data-idx="${idx}"]`);
    const row = document.getElementById(`row-${idx}`);
    if (!chk || !row) return;
    row.classList.toggle('row-excluded', !chk.checked);
    updateSummary();
    updateStatusCell(idx);
  };

  window.onValorInput = function (idx) {
    updateSummary();
    updateStatusCell(idx);
  };

  window.onValorBlur = function (idx) {
    const inp = document.getElementById(`valor-${idx}`);
    if (!inp) return;
    const v = parseFloat(inp.value) || 0;
    inp.value = v > 0 ? v.toFixed(2) : '';
    updateSummary();
    updateStatusCell(idx);
  };

  function updateStatusCell(idx) {
    const cell = document.getElementById(`status-${idx}`);
    const chk  = document.querySelector(`.emp-check[data-idx="${idx}"]`);
    const inp  = document.getElementById(`valor-${idx}`);
    if (!cell) return;

    const incluido = chk?.checked;
    const valor = parseFloat(inp?.value) || 0;

    if (!incluido) {
      cell.innerHTML = `<span style="font-size:12px;background:rgba(100,116,139,.15);color:#64748b;padding:3px 10px;border-radius:999px;font-weight:700;">Excluído</span>`;
      return;
    }
    if (!valor) {
      cell.innerHTML = `<span style="font-size:12px;color:var(--color-text-muted,#94a3b8);">Aguardando valor</span>`;
      return;
    }
    cell.innerHTML = `<span style="font-size:12px;background:rgba(34,197,94,.12);color:#22c55e;padding:3px 10px;border-radius:999px;font-weight:700;">✓ ${fmtMoney(valor)}</span>`;
  }

  /* ══ SELECT ALL ══ */
  window.toggleSelectAll = function () {
    const master = document.getElementById('chkSelectAll');
    const all    = document.querySelectorAll('.emp-check');
    const checked = master?.checked ?? true;
    all.forEach((c, i) => {
      c.checked = checked;
      const row = document.getElementById(`row-${i}`);
      if (row) row.classList.toggle('row-excluded', !checked);
      updateStatusCell(i);
    });
    updateSummary();
  };

  /* ══ UPDATE SUMMARY ══ */
  function updateSummary() {
    let total     = 0;
    let incluidos = 0;
    let soma      = 0;

    _funcionarios.forEach((_, idx) => {
      total++;
      const chk = document.querySelector(`.emp-check[data-idx="${idx}"]`);
      const inp = document.getElementById(`valor-${idx}`);
      const ok  = chk?.checked;
      const val = parseFloat(inp?.value) || 0;
      if (ok) {
        incluidos++;
        soma += val;
      }
    });

    document.getElementById('statTotal').textContent    = total;
    document.getElementById('statIncluidos').textContent = incluidos;
    document.getElementById('statValorTotal').textContent = fmtMoney(soma);

    const hasValues = soma > 0;
    const btnP = document.getElementById('btnProcessar');
    const btnE = document.getElementById('btnExportFooter');
    if (btnP) btnP.disabled = !hasValues;
    if (btnE) btnE.disabled = !hasValues;
    updateExportBtns(hasValues);

    const info = document.getElementById('fpFooterInfo');
    if (info) {
      if (!_funcionarios.length) {
        info.innerHTML = 'Nenhum funcionário carregado';
      } else {
        info.innerHTML = `<strong>${incluidos}</strong> funcionário(s) selecionado(s) · Total: <strong>${fmtMoney(soma)}</strong>`;
      }
    }
  }

  function updateExportBtns(enable) {
    const b1 = document.getElementById('btnExportXlsx');
    const b2 = document.getElementById('btnExportFooter');
    if (b1) b1.disabled = !enable;
    if (b2) b2.disabled = !enable;
  }

  /* ══ PROCESSAR FOLHA ══ */
  window.processarFolha = function () {
    const empresaId = document.getElementById('selectEmpresa').value;
    const mes       = document.getElementById('selectMes').value;
    if (!empresaId || !mes) { showToast('Selecione empresa e mês.', 'error'); return; }

    const parceiro = _parceiros.find(p => p.id === empresaId);
    const linhas   = coletarLinhas();
    if (!linhas.length) { showToast('Informe pelo menos um valor.', 'error'); return; }

    const total = linhas.reduce((s, l) => s + l.valor, 0);

    // Monta recibo
    const now = new Date().toLocaleString('pt-BR');
    const recibo = document.getElementById('fpReceipt');
    recibo.innerHTML = `
      <div class="fp-receipt-header">
        <h2>SOU + BLU</h2>
        <div style="font-size:11px;color:#555;">Folha de Pagamento</div>
        <div style="font-size:10px;color:#888;margin-top:4px;">Gerada em: ${now}</div>
      </div>
      <div class="fp-receipt-row">
        <span>Empresa</span>
        <strong>${parceiro?.razao_social || '—'}</strong>
      </div>
      <div class="fp-receipt-row">
        <span>CNPJ</span>
        <strong>${parceiro?.cnpj || '—'}</strong>
      </div>
      <div class="fp-receipt-row">
        <span>Mês de Referência</span>
        <strong>${fmtMes(mes)}</strong>
      </div>
      <div class="fp-receipt-row">
        <span>Funcionários</span>
        <strong>${linhas.length}</strong>
      </div>
      <div style="margin:12px 0 8px;font-weight:700;font-size:11px;color:#333;text-transform:uppercase;letter-spacing:.5px;">Detalhamento</div>
      ${linhas.map(l => `
        <div class="fp-receipt-row">
          <span>${l.nome}${l.matricula ? ' (' + l.matricula + ')' : ''}</span>
          <strong>${fmtMoney(l.valor)}</strong>
        </div>
        ${l.pix ? `<div style="font-size:10px;color:#888;padding:2px 0 4px;border-bottom:1px dashed #eee;">PIX: ${l.pix}</div>` : ''}
      `).join('')}
      <div class="fp-receipt-total">
        <span>TOTAL A PAGAR</span>
        <strong>${fmtMoney(total)}</strong>
      </div>
    `;

    _folhaData = { parceiro, mes, linhas, total, geradoEm: new Date().toISOString() };
    document.getElementById('modalConfirmar').classList.add('active');
  };

  /* ══ COLETAR LINHAS ══ */
  function coletarLinhas() {
    const linhas = [];
    _funcionarios.forEach((emp, idx) => {
      const chk = document.querySelector(`.emp-check[data-idx="${idx}"]`);
      const inp = document.getElementById(`valor-${idx}`);
      const valor = parseFloat(inp?.value) || 0;
      if (chk?.checked && valor > 0) {
        const { key, type, holder, bank } = getPixData(emp);
        const typeLabels = { cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', phone: 'Celular', random: 'Aleatória' };
        linhas.push({
          nome:      emp.name,
          login:     emp.login || emp.email || '',
          matricula: emp.matricula || '',
          email:     emp.email || '',
          role:      roleLabel(emp.role),
          valor,
          pixTipo:   typeLabels[type] || type || '',
          pix:       key || '',
          titular:   holder || '',
          banco:     bank || '',
        });
      }
    });
    return linhas;
  }

  async function syncFolhaSistemaWeb(folha) {
    const toggle = document.getElementById('fpSyncSistemaWeb');
    if (!toggle?.checked || !_swStatus?.ready) {
      return { skipped: true };
    }
    const parceiro = folha.parceiro || {};
    const payload = {
      protocolo: _protocolo || document.getElementById('fpProtocolo')?.value || '',
      solicitante: document.getElementById('fpSolicitante')?.value || '',
      empresa_id: parceiro.id || '',
      cnpj: parceiro.cnpj || '',
      razao_social: parceiro.razao_social || '',
      mes: folha.mes,
      total: folha.total,
      gerado_em: folha.geradoEm,
      linhas: folha.linhas,
    };
    return folhaApiFetch('save', { method: 'POST', body: payload });
  }

  /* ══ CONFIRMAR PROCESSAMENTO ══ */
  window.confirmarProcessamento = async function () {
    if (!_folhaData) return;
    closeFolhaConfirmModal();

    _folhaData.protocolo = _protocolo || document.getElementById('fpProtocolo')?.value || '';
    _folhaData.solicitante = document.getElementById('fpSolicitante')?.value || '';

    // Salva registro na folha (localStorage como fallback, pois não há tabela dedicada)
    const key = `soublu_folha_${_folhaData.parceiro?.id}_${_folhaData.mes}`;
    try {
      localStorage.setItem(key, JSON.stringify({ ..._folhaData, status: 'processada' }));
    } catch (_) {}

    showToast(`Folha processada com sucesso! ${_folhaData.linhas.length} funcionário(s) — ${fmtMoney(_folhaData.total)}`, 'success', 5000);

    // Envio opcional ao Sistema Web (só se configurado + checkbox)
    try {
      showLoader('Enviando ao Sistema Web...');
      const sync = await syncFolhaSistemaWeb(_folhaData);
      if (!sync.skipped) {
        showToast('Folha enviada ao Sistema Web.', 'success');
      }
    } catch (e) {
      console.warn('[FolhaPagamento] sync Sistema Web:', e);
      showToast(
        'Folha salva localmente, mas falhou o envio ao Sistema Web: ' + (e.message || 'erro'),
        'error',
        6000
      );
    } finally {
      hideLoader();
    }

    // Habilita export
    updateExportBtns(true);
    setTimeout(() => exportXlsx(), 500);
  };

  /* ══ EXPORT XLSX ══ */
  window.exportXlsx = async function () {
    if (!_funcionarios.length) { showToast('Carregue os funcionários primeiro.', 'error'); return; }

    const empresaId = document.getElementById('selectEmpresa').value;
    const mes       = document.getElementById('selectMes').value;
    const parceiro  = _parceiros.find(p => p.id === empresaId);
    const linhas    = coletarLinhas();

    if (!linhas.length) { showToast('Informe pelo menos um valor para exportar.', 'error'); return; }

    try {
      if (typeof window.ensureXlsx === 'function') await window.ensureXlsx();
      else if (typeof XLSX === 'undefined') {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
          s.onload = resolve;
          s.onerror = () => reject(new Error('SheetJS'));
          document.head.appendChild(s);
        });
      }
    } catch (e) {
      showToast('Não foi possível carregar a biblioteca de Excel.', 'error');
      return;
    }

    const wb = XLSX.utils.book_new();

    const rows = [
      ['FOLHA DE PAGAMENTO — SOU + BLU'],
      [],
      ['Empresa:', parceiro?.razao_social || '—'],
      ['CNPJ:', parceiro?.cnpj || '—'],
      ['Mês de Referência:', fmtMes(mes)],
      ['Data de Geração:', new Date().toLocaleString('pt-BR')],
      [],
      ['Protocolo:', _protocolo || document.getElementById('fpProtocolo')?.value || '—'],
      [],
      ['Nome', 'Login', 'Matrícula', 'E-mail', 'Cargo', 'Valor (R$)', 'Tipo PIX', 'Chave PIX', 'Titular', 'Banco'],
      ...linhas.map(l => [
        l.nome, l.login || '', l.matricula, l.email, l.role,
        l.valor, l.pixTipo, l.pix, l.titular, l.banco,
      ]),
      [],
      ['TOTAL', '', '', '', '', linhas.reduce((s, l) => s + l.valor, 0)],
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    // Larguras de coluna
    ws['!cols'] = [
      { wch: 30 }, { wch: 22 }, { wch: 14 }, { wch: 28 }, { wch: 16 },
      { wch: 14 }, { wch: 12 }, { wch: 36 }, { wch: 24 }, { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Folha');
    const nomeParceiro = (parceiro?.razao_social || 'folha').replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_');
    XLSX.writeFile(wb, `Folha_${nomeParceiro}_${mes}.xlsx`);
    showToast('XLSX exportado com sucesso!', 'success');
  };

  /* ══ START ══ */
  document.addEventListener('DOMContentLoaded', init);

})();
