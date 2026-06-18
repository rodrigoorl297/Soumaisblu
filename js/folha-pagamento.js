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
  window.navigateBack = function () {
    try { history.back(); } catch (_) { window.location.href = 'admin.html'; }
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

    // Carrega parceiros
    await carregarParceiros();
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
      // Busca o usuário root do parceiro (user_id do parceiro)
      const partnerUserId = parceiro?.user_id;
      let equipe = [];
      if (partnerUserId) {
        equipe = await DB.getPartnerTeam(partnerUserId).catch(() => []);
      }

      // Fallback: busca por admin_id = partnerUserId
      if (!equipe.length && partnerUserId) {
        const all = await DB.getUsers().catch(() => []);
        equipe = all.filter(u =>
          String(u.admin_id) === String(partnerUserId) &&
          u.active !== false
        );
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
        <td colspan="6">
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
          ${emp.matricula || '—'}
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:13px;color:var(--color-text-muted,#94a3b8);">R$</span>
            <input type="number" class="fp-value-input" id="valor-${idx}" data-idx="${idx}"
              placeholder="0,00" min="0" step="0.01"
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

    updateSummary();
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

  /* ══ CONFIRMAR PROCESSAMENTO ══ */
  window.confirmarProcessamento = function () {
    if (!_folhaData) return;
    closeFolhaConfirmModal();

    // Salva registro na folha (localStorage como fallback, pois não há tabela dedicada)
    const key = `soublu_folha_${_folhaData.parceiro?.id}_${_folhaData.mes}`;
    try {
      localStorage.setItem(key, JSON.stringify({ ..._folhaData, status: 'processada' }));
    } catch (_) {}

    showToast(`Folha processada com sucesso! ${_folhaData.linhas.length} funcionário(s) — ${fmtMoney(_folhaData.total)}`, 'success', 5000);

    // Habilita export
    updateExportBtns(true);
    setTimeout(() => exportXlsx(), 500);
  };

  /* ══ EXPORT XLSX ══ */
  window.exportXlsx = function () {
    if (!_funcionarios.length) { showToast('Carregue os funcionários primeiro.', 'error'); return; }

    const empresaId = document.getElementById('selectEmpresa').value;
    const mes       = document.getElementById('selectMes').value;
    const parceiro  = _parceiros.find(p => p.id === empresaId);
    const linhas    = coletarLinhas();

    if (!linhas.length) { showToast('Informe pelo menos um valor para exportar.', 'error'); return; }

    const wb = typeof XLSX !== 'undefined' ? XLSX.utils.book_new() : null;

    const rows = [
      ['FOLHA DE PAGAMENTO — SOU + BLU'],
      [],
      ['Empresa:', parceiro?.razao_social || '—'],
      ['CNPJ:', parceiro?.cnpj || '—'],
      ['Mês de Referência:', fmtMes(mes)],
      ['Data de Geração:', new Date().toLocaleString('pt-BR')],
      [],
      ['Nome', 'Matrícula', 'E-mail', 'Cargo', 'Valor (R$)', 'Tipo PIX', 'Chave PIX', 'Titular', 'Banco'],
      ...linhas.map(l => [
        l.nome, l.matricula, l.email, l.role,
        l.valor, l.pixTipo, l.pix, l.titular, l.banco,
      ]),
      [],
      ['TOTAL', '', '', '', linhas.reduce((s, l) => s + l.valor, 0)],
    ];

    if (wb && typeof XLSX !== 'undefined') {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      // Larguras de coluna
      ws['!cols'] = [
        { wch: 30 }, { wch: 14 }, { wch: 28 }, { wch: 16 },
        { wch: 14 }, { wch: 12 }, { wch: 36 }, { wch: 24 }, { wch: 20 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Folha');
      const nomeParceiro = (parceiro?.razao_social || 'folha').replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_');
      XLSX.writeFile(wb, `Folha_${nomeParceiro}_${mes}.xlsx`);
      showToast('XLSX exportado com sucesso!', 'success');
    } else {
      // Fallback CSV
      const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `Folha_${mes}.csv`; a.click();
      URL.revokeObjectURL(url);
      showToast('CSV exportado (XLSX não disponível).', 'info');
    }
  };

  /* ══ START ══ */
  document.addEventListener('DOMContentLoaded', init);

})();
