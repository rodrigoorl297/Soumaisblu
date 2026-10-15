/**
 * esteira-compra-divida — 2ª esteira (Compra de Dívida / consignado).
 * Vendedor: formulário + minhas fichas.
 * Backoffice: lista/kanban com troca de status.
 * Persiste em proposals (credito_esteira.tipo = compra_divida).
 */
(function () {
  'use strict';

  const TAG = '[COMPRA_DIVIDA]';
  const TIPO = 'compra_divida';

  function cat() {
    return window.COMPRA_DIVIDA_CATALOG || {};
  }

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

  function fmtCpf(v) {
    const d = digits(v).slice(0, 11);
    if (d.length !== 11) return d;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  function session() {
    return typeof Auth !== 'undefined' && Auth.getSession ? Auth.getSession() : null;
  }

  function roleOf(u) {
    return String(u?.role || '').toLowerCase();
  }

  /**
   * canVendorView — vendedor/employee vê só as próprias fichas (menu separado de Propostas).
   * Parceiro fica de fora: esteira é operação interna da casa.
   */
  function canVendorView(u) {
    if (!u) return false;
    const r = roleOf(u);
    return ['employee', 'vendedor'].includes(r);
  }

  /** Backoffice e cargos de gestão veem a esteira completa. */
  function canBoView(u) {
    if (!u) return false;
    const r = roleOf(u);
    if (['employee', 'vendedor', 'parceiro'].includes(r)) return false;
    return [
      'backoffice', 'sup_backoffice', 'master', 'fundador', 'gerente', 'gerencia', 'admin',
      'financeiro', 'financial', 'diretoria', 'desenvolvedor', 'estrategico', 'rh',
      'supervisor', 'operacional',
    ].includes(r);
  }

  /**
   * shouldShowGestaoCredito — BO/gestão (esteira completa) ou vendedor (só as suas).
   */
  function shouldShowGestaoCredito(u) {
    if (!u) return false;
    return canBoView(u) || canVendorView(u);
  }

  /**
   * lockVendorSelectToSelf — no painel do vendedor o responsável é sempre o logado.
   * Evita cadastrar ficha no nome de outro e some com a proposta da lista dele.
   */
  function lockVendorSelectToSelf() {
    const sel = document.getElementById('cd_vendedor');
    const u = session();
    if (!sel || !u?.id) return;
    const name = u.name || u.email || u.id;
    sel.innerHTML = `<option value="${esc(u.id)}" selected>${esc(name)}</option>`;
    sel.disabled = true;
    sel.setAttribute('aria-readonly', 'true');
  }

  /**
   * goSection — usa navigateTo do CRM (.section.active).
   * Não usar style.display=none: isso impede .section.active { display:block }.
   */
  function goSection(id) {
    const sec = document.getElementById(id);
    if (sec) sec.style.removeProperty('display');
    if (typeof navigateTo === 'function') {
      navigateTo(id);
      return;
    }
    document.querySelectorAll('.section').forEach((s) => s.classList.toggle('active', s.id === id));
    document.querySelectorAll('[data-section]').forEach((b) => {
      b.classList.toggle('active', b.dataset.section === id);
    });
    const tb = document.getElementById('topbarTitle');
    const nav = document.querySelector(`[data-section="${id}"]`);
    const title = nav?.querySelector('.nav-label')?.textContent;
    if (tb && title) tb.textContent = title;
  }

  /** openGestao — monta a tela da planilha e mostra a seção. */
  function openGestao(mode) {
    if (mode === 'bo') {
      EsteiraCompraDivida.ensureBoSection();
      goSection('secEsteiraCompraDividaBo');
      fillTabelaSelect();
      toggleRefinPort();
      renderBo();
    } else {
      EsteiraCompraDivida.ensureVendorSection();
      goSection('secEsteiraCompraDivida');
      fillTabelaSelect();
      toggleRefinPort();
      renderMinhasFichas();
    }
  }

  /**
   * findProposalsNav — acha o botão “Gestão de Propostas” no menu GESTÃO
   * (id pode ser navManageProposals ou navProposals).
   */
  function findProposalsNav() {
    return document.getElementById('navManageProposals')
      || document.getElementById('navProposals')
      || document.querySelector('[data-section="secManageProposals"]')
      || [...document.querySelectorAll('.sidebar-nav .nav-label')].find((el) => /Gest[aã]o de Propostas/i.test(el.textContent || ''))?.closest('button');
  }

  /** Ícone documento — mesmo estilo dos itens de GESTÃO. */
  function credNavIcon() {
    return '<span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/></svg></span>';
  }

  /**
   * insertAfterProposals — coloca o botão Gestão de Crédito logo após Propostas.
   */
  function insertAfterProposals(btn) {
    const nav = document.querySelector('.sidebar-nav');
    if (!nav) return;
    const anchor = findProposalsNav();
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    else nav.appendChild(btn);
  }

  function optsHtml(list, selected) {
    return (list || []).map((v) => {
      const val = typeof v === 'string' ? v : (v.value || v.nome || '');
      const lab = typeof v === 'string' ? v : (v.label || `${v.codigo} - ${v.nome}`);
      const sel = String(selected || '') === String(val) ? ' selected' : '';
      return `<option value="${esc(val)}"${sel}>${esc(lab)}</option>`;
    }).join('');
  }

  function isCompraDividaProposal(p) {
    if (!p) return false;
    const ce = p.creditoEsteira || p.credito_esteira || {};
    if (ce && ce.tipo === TIPO) return true;
    const obs = String(p.obs || '');
    if (obs.includes(TAG) || obs.includes('tipo_esteira=compra_divida')) return true;
    const ent = String(p.entidade || '').toUpperCase();
    return ent === 'COMPRA_DIVIDA' || ent === 'COMPRA DE DIVIDA';
  }

  function payloadOf(p) {
    const ce = p.creditoEsteira || p.credito_esteira || {};
    if (ce && ce.tipo === TIPO) return ce;
    return {
      tipo: TIPO,
      origem: 'propria',
      situacao_beneficiario: '',
      contratos_port: [],
      banco: p.bancoDigitado || p.banco_digitado || '',
      produto: p.product || '',
      convenio: p.convenio || '',
      tabela: p.tabela || '',
    };
  }

  /**
   * loadAllCd — busca fichas da esteira Compra de Dívida.
   * Select sem credito_esteira/anexos: essas colunas podem não existir no MySQL
   * e o GET 500 deixava a lista vazia (“Nenhuma proposta encontrada”).
   * Payload da esteira fica em obs + meta quando as colunas JSON ainda não existem.
   */
  async function loadAllCd() {
    if (typeof DB === 'undefined') return [];
    const colsSafe = [
      'id,numero,protocolo,vendorId,vendor_id,vendorName,vendor_name',
      'clientName,client_name,clientCpf,client_cpf,product,convenio,entidade,tabela',
      'valor,valorFinal,valor_final,status,statusOp,status_op,obs',
      'bancoDigitado,banco_digitado,created_at,updated_at,employee_id,history',
    ].join(',');
    const colsFull = colsSafe + ',creditoEsteira,credito_esteira,attachments,meta';
    let rows = [];
    if (typeof DB._fetchAllProposalPages === 'function') {
      rows = await DB._fetchAllProposalPages(colsFull, '&entidade=eq.COMPRA_DIVIDA').catch(() => null);
      if (!Array.isArray(rows)) {
        rows = await DB._fetchAllProposalPages(colsSafe, '&entidade=eq.COMPRA_DIVIDA').catch(() => []);
      }
      if (!rows?.length) {
        const all = await DB._fetchAllProposalPages(colsSafe, '').catch(() => []);
        rows = (all || []).filter(isCompraDividaProposal);
        return rows;
      }
    } else if (typeof DB.listProposalsLite === 'function') {
      rows = await DB.listProposalsLite({ all: true }).catch(() => []);
    }
    return (rows || []).filter(isCompraDividaProposal);
  }

  function fillTabelaSelect() {
    const banco = document.getElementById('cd_banco')?.value || '';
    const convenio = document.getElementById('cd_convenio')?.value || '';
    const sel = document.getElementById('cd_tabela');
    if (!sel) return;
    const items = typeof cat().tabelasPor === 'function'
      ? cat().tabelasPor(banco, convenio)
      : [];
    const cur = sel.value;
    sel.innerHTML = `<option value="">Selecione...</option>${optsHtml(items, cur)}`;
  }

  async function fillVendorSelect() {
    const sel = document.getElementById('cd_vendedor');
    if (!sel) return;
    let list = [];
    try {
      if (typeof DB !== 'undefined' && typeof DB.getVendorsForSelect === 'function') {
        list = await DB.getVendorsForSelect();
      }
      if (!list?.length && typeof DB !== 'undefined' && typeof DB.getAllUsers === 'function') {
        const all = await DB.getAllUsers();
        list = (all || []).filter((usr) => {
          const r = String(usr.role || '').toLowerCase();
          return ['employee', 'vendedor', 'supervisor', 'parceiro'].includes(r);
        });
      }
    } catch (_) { list = []; }
    if (!list?.length) {
      const existing = [...new Set(_boRows.map((p) => p.vendorName || p.vendor_name).filter(Boolean))];
      list = existing.map((name) => ({ id: name, name }));
    }
    const cur = sel.value;
    sel.innerHTML = `<option value="">Selecione o vendedor...</option>` +
      list.map((v) => {
        const val = v.id || v.name;
        const name = v.name || v.nome || v.id;
        const selAttr = String(cur) === String(val) ? ' selected' : '';
        return `<option value="${esc(val)}"${selAttr}>${esc(name)}</option>`;
      }).join('');
  }

  function toggleRefinPort() {
    const prod = document.getElementById('cd_produto')?.value || '';
    const box = document.getElementById('cd_refin_box');
    if (box) box.hidden = prod !== 'REFIN PORT';
    if (prod === 'REFIN PORT') recalcTotal();
  }

  function recalcTotal() {
    let total = 0;
    for (let i = 1; i <= 5; i++) {
      const on = document.getElementById(`cd_port_on_${i}`)?.checked;
      const v = parseFloat(document.getElementById(`cd_port_valor_${i}`)?.value);
      if (on && Number.isFinite(v)) total += v;
    }
    const el = document.getElementById('cd_valor_total');
    if (el) el.value = total ? total.toFixed(2) : '';
    const hint = document.getElementById('cd_valor_total_hint');
    if (hint) hint.textContent = total ? `Total: ${fmtMoney(total)}` : '';
  }

  function maskCpf(v) {
    const d = digits(v).slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  function cdModalStyles() {
    return `<style id="cdModalStyle">
#cdNovaModal {
  z-index: 13500;
}
#cdNovaModal .modal,
#cdNovaModal .cd-modal-container {
  max-width: 820px !important;
  width: 95% !important;
  max-height: 90vh !important;
  background: #ffffff !important;
  border-radius: 16px !important;
  box-shadow: 0 25px 60px -15px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(226, 232, 240, 0.9) !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  padding: 0 !important;
  border: none !important;
}
.cd-modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #ffffff;
}
.cd-modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
  background: #ffffff;
}
.cd-modal-footer {
  padding: 16px 24px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.cd-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 20px;
}
@media (max-width: 680px) {
  .cd-form-grid {
    grid-template-columns: 1fr;
    gap: 14px;
  }
}
.cd-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cd-field.col-full {
  grid-column: 1 / -1;
}
.cd-field label {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.05em;
  color: #475569;
  text-transform: uppercase;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}
.cd-field label .req {
  color: #ef4444;
}
.cd-field select,
.cd-field input[type="text"],
.cd-field input[type="number"],
.cd-field textarea {
  border: 1.5px solid #cbd5e1 !important;
  border-radius: 8px !important;
  padding: 10px 14px !important;
  font-size: 14px !important;
  font-family: inherit !important;
  color: #0f172a !important;
  background: #ffffff !important;
  transition: border-color .15s ease, box-shadow .15s ease !important;
  outline: none !important;
  width: 100% !important;
  box-sizing: border-box !important;
  min-height: 42px;
}
.cd-field select:focus,
.cd-field input:focus,
.cd-field textarea:focus {
  border-color: #ea580c !important;
  box-shadow: 0 0 0 3px rgba(234, 88, 12, 0.15) !important;
}
.cd-refin-card {
  grid-column: 1 / -1;
  background: #f8fafc;
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px 18px;
  margin-top: 4px;
}
.cd-refin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e2e8f0;
}
.cd-port-row {
  display: grid;
  grid-template-columns: 36px 1fr 1.3fr 130px;
  gap: 10px;
  align-items: center;
  margin-bottom: 8px;
  background: #ffffff;
  padding: 6px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  transition: border-color .15s ease;
}
.cd-port-row:hover {
  border-color: #cbd5e1;
}
.cd-total-box {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
  border: 1.5px solid #a7f3d0;
  border-radius: 10px;
  padding: 12px 18px;
  margin-top: 14px;
}
</style>`;
  }

  function portRowsHtml() {
    const banks = cat().BANCOS_PORTADOS || [];
    const bankOpts = optsHtml(banks.map((b) => ({ value: `${b.codigo} - ${b.nome}`, label: `${b.codigo} - ${b.nome}` })));
    let html = '';
    for (let i = 1; i <= 5; i++) {
      html += `<div class="cd-port-row">
        <div style="display:flex;align-items:center;justify-content:center;">
          <input type="checkbox" id="cd_port_on_${i}" onchange="EsteiraCompraDivida.onPortChange()" style="width:18px;height:18px;cursor:pointer;accent-color:#ea580c;"/>
        </div>
        <input type="text" class="form-control" id="cd_port_contrato_${i}" placeholder="Nº Contrato ${i}" style="height:38px;font-size:13px;"/>
        <select class="form-control" id="cd_port_banco_${i}" style="height:38px;font-size:13px;"><option value="">Banco portado...</option>${bankOpts}</select>
        <input type="number" class="form-control" id="cd_port_valor_${i}" min="0" step="0.01" placeholder="0,00" oninput="EsteiraCompraDivida.onPortChange()" style="height:38px;font-size:13px;text-align:right;font-weight:700;"/>
      </div>`;
    }
    return html;
  }

  /** Componente com todos os campos de entrada do formulário. */
  function formFieldsHtml() {
    const C = cat();
    return `
<div class="cd-form-grid">
  <!-- Origem -->
  <div class="cd-field">
    <label for="cd_origem">Origem <span class="req">*</span></label>
    <select id="cd_origem" class="form-control" required>
      <option value="propria">Própria</option>
      <option value="parceiro">Parceiro</option>
    </select>
  </div>

  <!-- Vendedor Responsável -->
  <div class="cd-field">
    <label for="cd_vendedor">Vendedor Responsável</label>
    <select id="cd_vendedor" class="form-control">
      <option value="">Carregando vendedores...</option>
    </select>
  </div>

  <!-- CPF com busca na API -->
  <div class="cd-field">
    <label for="cd_cpf">CPF do Cliente <span class="req">*</span></label>
    <div style="display:flex;gap:8px;">
      <input type="text" id="cd_cpf" class="form-control" placeholder="000.000.000-00" maxlength="14" required oninput="this.value = EsteiraCompraDivida.maskCpf(this.value)" style="font-weight:600;"/>
      <button type="button" class="btn btn-primary" onclick="EsteiraCompraDivida.buscarCpf()" style="white-space:nowrap;padding:0 14px;display:inline-flex;align-items:center;gap:6px;font-weight:700;border-radius:8px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        Buscar API
      </button>
    </div>
    <input type="hidden" id="cd_nome"/>
    <div id="cd_cliente_info" style="min-height:16px;"></div>
  </div>

  <!-- Situação Beneficiário -->
  <div class="cd-field">
    <label for="cd_situacao">Situação Beneficiário</label>
    <select id="cd_situacao" class="form-control">
      <option value="">Selecione a situação...</option>
      ${optsHtml(C.SITUACOES)}
    </select>
  </div>

  <!-- Produto -->
  <div class="cd-field">
    <label for="cd_produto">Produto <span class="req">*</span></label>
    <select id="cd_produto" class="form-control" required onchange="EsteiraCompraDivida.onProdutoChange()">
      <option value="">Selecione o produto...</option>
      ${optsHtml(C.PRODUTOS)}
    </select>
  </div>

  <!-- Convênio -->
  <div class="cd-field">
    <label for="cd_convenio">Convênio <span class="req">*</span></label>
    <select id="cd_convenio" class="form-control" required onchange="EsteiraCompraDivida.onFiltroTabela()">
      <option value="">Selecione o convênio...</option>
      ${optsHtml(C.CONVENIOS)}
    </select>
  </div>

  <!-- Banco -->
  <div class="cd-field">
    <label for="cd_banco">Banco <span class="req">*</span></label>
    <select id="cd_banco" class="form-control" required onchange="EsteiraCompraDivida.onFiltroTabela()">
      <option value="">Selecione o banco...</option>
      ${optsHtml(C.BANCOS)}
    </select>
  </div>

  <!-- Tabela -->
  <div class="cd-field">
    <label for="cd_tabela">Tabela <span class="req">*</span></label>
    <select id="cd_tabela" class="form-control" required>
      <option value="">Selecione banco e convênio primeiro...</option>
    </select>
  </div>

  <!-- Valor da Operação -->
  <div class="cd-field">
    <label for="cd_valor">Valor da Operação (R$) <span class="req">*</span></label>
    <div style="position:relative;">
      <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94a3b8;font-weight:700;font-size:13px;pointer-events:none;">R$</span>
      <input type="number" id="cd_valor" class="form-control" step="0.01" min="0" placeholder="0,00" style="padding-left:38px !important;font-weight:700;"/>
    </div>
    <div id="cd_valor_hint" style="font-size:11px;color:#64748b;">No REFIN PORT, o valor total é calculado pelos contratos.</div>
  </div>

  <div></div>

  <!-- Anexo / Documento 1 -->
  <div class="cd-field">
    <label for="cd_anexo_1">Anexo / Documento 1 <span style="font-size:10px;color:#64748b;font-weight:600;text-transform:none;">(opcional)</span></label>
    <input type="file" id="cd_anexo_1" class="form-control" accept="image/*,.pdf" style="font-size:12px;padding:8px 10px;height:42px;"/>
    <div style="font-size:11px;color:#64748b;">RG, CNH ou documento do cliente (PDF ou foto)</div>
  </div>

  <!-- Anexo / Documento 2 -->
  <div class="cd-field">
    <label for="cd_anexo_2">Anexo / Documento 2 <span style="font-size:10px;color:#64748b;font-weight:600;text-transform:none;">(opcional)</span></label>
    <input type="file" id="cd_anexo_2" class="form-control" accept="image/*,.pdf" style="font-size:12px;padding:8px 10px;height:42px;"/>
    <div style="font-size:11px;color:#64748b;">Contrato, extrato, termo ou comprovante (PDF ou foto)</div>
  </div>

  <!-- Observação -->
  <div class="cd-field col-full">
    <label for="cd_obs">Observações da Proposta</label>
    <textarea id="cd_obs" class="form-control" rows="2" placeholder="Observações adicionais ou particularidades da operação (opcional)..." style="min-height:60px;resize:vertical;"></textarea>
  </div>

  <!-- Bloco REFIN PORT -->
  <div id="cd_refin_box" class="cd-refin-card" hidden>
    <div class="cd-refin-header">
      <div>
        <div style="font-size:12px;font-weight:800;color:#0f172a;letter-spacing:0.04em;text-transform:uppercase;display:flex;align-items:center;gap:8px;">
          <span style="padding:2px 8px;border-radius:4px;background:#ffedd5;color:#c2410c;font-size:10px;font-weight:800;">REFIN PORT</span>
          Contratos Portados
        </div>
        <div style="font-size:12px;color:#64748b;margin-top:2px;">Marque e preencha os contratos a serem quitados/portados.</div>
      </div>
    </div>

    <div style="font-size:11px;color:#64748b;margin-bottom:8px;display:grid;grid-template-columns:36px 1fr 1.3fr 130px;gap:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;padding:0 8px;">
      <span style="text-align:center;">Ativo</span><span>Nº Contrato</span><span>Banco Portado</span><span style="text-align:right;">Saldo Devedor</span>
    </div>

    ${portRowsHtml()}

    <div class="cd-total-box">
      <div>
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:#065f46;">Total da Operação Portada</div>
        <div id="cd_valor_total_hint" style="font-size:12px;color:#047857;margin-top:2px;">Nenhum contrato ativo somado</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:13px;font-weight:700;color:#065f46;">R$</span>
        <input type="number" id="cd_valor_total" class="form-control" step="0.01" min="0" readonly style="font-weight:800;font-size:15px;color:#065f46;background:#ffffff !important;border-color:#6ee7b7 !important;width:140px;text-align:right;height:38px;padding:6px 10px !important;"/>
      </div>
    </div>

    <details style="margin-top:12px;">
      <summary style="cursor:pointer;font-size:12px;font-weight:600;color:#64748b;user-select:none;">Ver lista de bancos aceitos na portabilidade</summary>
      <ul style="columns:2;font-size:11px;margin:8px 0 0;padding-left:18px;color:#64748b;line-height:1.6;">
        ${(C.BANCOS_PORTADOS || []).map((b) => `<li><strong>${esc(b.codigo)}</strong> — ${esc(b.nome)}</li>`).join('')}
      </ul>
    </details>
  </div>
</div>`;
  }

  /**
   * vendorListHtml — painel do vendedor igual ao BO: lista + botão que abre o popup.
   * O formulário NÃO fica na página; só no modal "Nova Proposta" (openNova).
   */
  function vendorListHtml() {
    return `
<div class="cd-bo-toolbar" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
  <div>
    <h3 style="margin:0;font-size:18px;font-weight:800;color:#0f172a;">Gestão de Crédito</h3>
    <p style="margin:4px 0 0;font-size:13px;color:#64748b;">Suas fichas na esteira — cadastro pelo popup Nova Proposta.</p>
  </div>
  <button type="button" class="btn btn-primary btn-sm" onclick="EsteiraCompraDivida.openNova()">+ Nova Proposta</button>
</div>
<div class="card card-padded" style="border-radius:14px;">
  <h4 style="margin:0 0 12px;font-weight:800;">Minhas fichas</h4>
  <div id="cd_minhas_fichas"><p class="text-muted">Carregando...</p></div>
</div>`;
  }

  /**
   * vendorFormHtml — legado (formulário inline). Mantido só se algum caller antigo pedir.
   * Preferir vendorListHtml + popup novaModalHtml.
   */
  function vendorFormHtml(opts = {}) {
    const showMine = opts.showMine !== false;
    return `
${cdModalStyles()}
<div class="card card-padded" style="margin-bottom:20px;border-radius:14px;box-shadow:0 4px 14px rgba(0,0,0,0.04);">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid #e2e8f0;">
    <div>
      <h3 style="margin:0;font-size:18px;font-weight:800;color:#0f172a;">Nova Proposta — Crédito</h3>
      <p style="margin:4px 0 0;font-size:13px;color:#64748b;">Preencha os campos abaixo para cadastrar a proposta na esteira.</p>
    </div>
  </div>
  <form id="cdVendorForm" onsubmit="EsteiraCompraDivida.submitVendor(event)">
    ${formFieldsHtml()}
    <div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end;">
      <button type="button" class="btn btn-outline" onclick="EsteiraCompraDivida.resetVendorForm()">Limpar</button>
      <button type="submit" class="btn btn-primary" id="cd_submit_btn" style="min-width:180px;font-weight:700;">Enviar para esteira</button>
    </div>
  </form>
</div>
${showMine ? `<div class="card card-padded" style="border-radius:14px;">
  <h4 style="margin:0 0 12px;font-weight:800;">Minhas fichas</h4>
  <div id="cd_minhas_fichas"><p class="text-muted">Carregando...</p></div>
</div>` : ''}`;
  }

  /**
   * ensureCdNovaModal — cria/recria o popup no body (vendedor e BO usam o mesmo).
   */
  function ensureCdNovaModal() {
    let modal = document.getElementById('cdNovaModal');
    if (!modal || !document.getElementById('cdVendorForm') || !modal.querySelector('.cd-modal-container')) {
      if (modal) modal.remove();
      modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.id = 'cdNovaModal';
      modal.innerHTML = novaModalHtml();
      document.body.appendChild(modal);
    }
    return modal;
  }

  /**
   * boHtml — Gestão de Crédito no admin: mesmo layout da Gestão de Propostas
   * (busca + ações, Consulta por período, tabela). O formulário fica no popup "Nova Proposta".
   */
  function boHtml() {
    return `
<div class="cd-bo-toolbar" style="display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
  <div class="search-bar" style="flex:1;min-width:200px;max-width:320px;">
    <input type="search" id="cd_bo_q" placeholder="Buscar proposta..." oninput="EsteiraCompraDivida.refreshBo(true)"/>
  </div>
  <button type="button" class="btn btn-outline btn-sm" id="cd_bo_sort_btn" onclick="EsteiraCompraDivida.toggleVendorSort()">Vendedor A-Z</button>
  <button type="button" class="btn btn-outline btn-sm" onclick="EsteiraCompraDivida.exportCsv()">Baixar Planilha</button>
  <button type="button" class="btn btn-primary btn-sm" onclick="EsteiraCompraDivida.openNova()">+ Nova Proposta</button>
</div>
<div class="proposal-date-filter proposal-date-filter--livecred" id="cdDateFilter">
  <div class="prop-date-filter__title">Consulta por período</div>
  <div class="prop-date-filter__radios" role="radiogroup" aria-label="Tipo de data">
    <label class="prop-date-filter__radio"><input type="radio" name="cdDateFieldRadio" value="criacao" checked/><span>Cadastro</span></label>
    <label class="prop-date-filter__radio"><input type="radio" name="cdDateFieldRadio" value="digitacao"/><span>Digitação</span></label>
    <label class="prop-date-filter__radio"><input type="radio" name="cdDateFieldRadio" value="pagamento"/><span>Pagamento</span></label>
  </div>
  <div class="prop-date-filter__row">
    <div class="prop-date-filter__field"><label for="cd_bo_from">Data Inicial</label><input type="date" id="cd_bo_from" class="form-control"/></div>
    <div class="prop-date-filter__field"><label for="cd_bo_to">Data Final</label><input type="date" id="cd_bo_to" class="form-control"/></div>
    <div class="prop-date-filter__actions">
      <button type="button" class="btn btn-primary btn-sm" onclick="EsteiraCompraDivida.refreshBo()">Consultar</button>
      <button type="button" class="btn btn-outline btn-sm" onclick="EsteiraCompraDivida.clearBoFilters()">Limpar</button>
    </div>
  </div>
</div>
<div class="card proposals-list-card"><div id="cd_bo_list"><p class="text-muted" style="padding:16px;">Carregando...</p></div></div>`;
  }

  /** Popup "Nova Proposta" moderno e elegante. */
  function novaModalHtml() {
    return `
${cdModalStyles()}
<div class="modal cd-modal-container">
  <div class="cd-modal-header">
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="width:38px;height:38px;border-radius:10px;background:rgba(234,88,12,0.12);color:#ea580c;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2"/>
          <line x1="2" y1="10" x2="22" y2="10"/>
          <line x1="6" y1="15" x2="10" y2="15"/>
        </svg>
      </div>
      <div>
        <h3 style="margin:0;font-size:18px;font-weight:800;color:#0f172a;letter-spacing:-0.01em;">Nova Proposta — Crédito</h3>
        <p style="margin:2px 0 0;font-size:12px;color:#64748b;">Cadastre a proposta de crédito para análise na esteira.</p>
      </div>
    </div>
    <button type="button" class="modal-close" onclick="EsteiraCompraDivida.closeNova()" title="Fechar"></button>
  </div>
  
  <form id="cdVendorForm" onsubmit="EsteiraCompraDivida.submitVendor(event)" style="display:flex;flex-direction:column;flex:1;overflow:hidden;margin:0;">
    <div class="cd-modal-body">
      ${formFieldsHtml()}
    </div>
    <div class="cd-modal-footer">
      <button type="button" class="btn btn-outline btn-sm" onclick="EsteiraCompraDivida.resetVendorForm()" style="font-weight:600;color:#64748b;">
        Limpar formulário
      </button>
      <div style="display:flex;gap:10px;align-items:center;">
        <button type="button" class="btn btn-outline" onclick="EsteiraCompraDivida.closeNova()" style="font-weight:600;">
          Cancelar
        </button>
        <button type="submit" class="btn btn-primary" id="cd_submit_btn" style="min-width:180px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;gap:8px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          Enviar para Esteira
        </button>
      </div>
    </div>
  </form>
</div>`;
  }

  let _boRows = [];
  let _boSortAz = false;

  function parseHistory(p) {
    let h = p.history;
    if (typeof h === 'string') { try { h = JSON.parse(h); } catch (_) { h = []; } }
    return Array.isArray(h) ? h : [];
  }

  function dateOnly(v) {
    const s = String(v || '').trim();
    if (!s || s.startsWith('0000')) return '';
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }

  function fmtDay(v) {
    const d = dateOnly(v);
    if (!d) return '—';
    const [y, mo, da] = d.split('-');
    return `${da}/${mo}/${y}`;
  }

  /** Datas de cadastro / digitação / pagamento da ficha. */
  function datesOf(p) {
    const hist = parseHistory(p);
    const created = p.created_at || p.createdAt || '';
    const dig = hist.find((h) => h.kind === 'digitacao');
    const paidH = hist.find((h) => h.kind === 'paid');
    const st = String(p.status || p.statusOp || p.status_op || '').toUpperCase();
    return {
      criacao: created,
      digitacao: dig ? dig.date : '',
      pagamento: paidH ? paidH.date : (st === 'PAGO' ? (p.updated_at || p.updatedAt || '') : ''),
    };
  }

  function collectPortContracts() {
    const list = [];
    for (let i = 1; i <= 5; i++) {
      if (!document.getElementById(`cd_port_on_${i}`)?.checked) continue;
      const contrato = document.getElementById(`cd_port_contrato_${i}`)?.value?.trim() || '';
      const banco = document.getElementById(`cd_port_banco_${i}`)?.value || '';
      const valor = parseFloat(document.getElementById(`cd_port_valor_${i}`)?.value);
      if (!contrato && !banco && !Number.isFinite(valor)) continue;
      list.push({
        contrato,
        banco_portado: banco,
        valor: Number.isFinite(valor) ? valor : 0,
      });
    }
    return list;
  }

  async function renderMinhasFichas() {
    const root = document.getElementById('cd_minhas_fichas');
    if (!root) return;
    const u = session();
    root.innerHTML = '<p class="text-muted">Carregando...</p>';
    try {
      const all = await loadAllCd();
      const mine = all.filter((p) => String(p.vendorId || p.vendor_id || p.employee_id || '') === String(u?.id || ''));
      if (!mine.length) {
        root.innerHTML = '<p class="text-muted">Nenhuma ficha enviada ainda.</p>';
        return;
      }
      root.innerHTML = `<div class="table-wrap"><table class="data-table" style="width:100%;font-size:13px;">
        <thead><tr><th>Protocolo</th><th>Cliente</th><th>Produto</th><th>Banco</th><th>Valor</th><th>Status</th></tr></thead>
        <tbody>${mine.map((p) => {
          const pl = payloadOf(p);
          return `<tr>
            <td>${esc(p.numero || p.protocolo || p.id)}</td>
            <td>${esc(p.clientName || p.client_name || '')}<br/><span class="text-muted">${esc(fmtCpf(p.clientCpf || p.client_cpf))}</span></td>
            <td>${esc(pl.produto || p.product || '')}</td>
            <td>${esc(pl.banco || '')}</td>
            <td>${esc(fmtMoney(p.valor))}</td>
            <td><strong>${esc(p.status || p.statusOp || '')}</strong></td>
          </tr>`;
        }).join('')}</tbody></table></div>`;
    } catch (e) {
      root.innerHTML = `<p style="color:#dc2626;">${esc(e.message || 'Falha ao carregar')}</p>`;
    }
  }

  function boFilteredRows(rows) {
    const st = document.getElementById('cd_bo_status_filter')?.value || '';
    const vendor = document.getElementById('cd_bo_vendor')?.value || '';
    const q = String(document.getElementById('cd_bo_q')?.value || '').toLowerCase().trim();
    const field = document.querySelector('input[name="cdDateFieldRadio"]:checked')?.value || 'criacao';
    const from = document.getElementById('cd_bo_from')?.value || '';
    const to = document.getElementById('cd_bo_to')?.value || '';
    let out = rows.slice();
    if (st && st !== 'todos') out = out.filter((p) => String(p.status || p.statusOp || '') === st);
    if (vendor) out = out.filter((p) => String(p.vendorName || p.vendor_name || '') === vendor);
    if (q) {
      out = out.filter((p) => {
        const blob = [
          p.numero, p.protocolo, p.id, p.clientName, p.client_name, p.clientCpf, p.client_cpf,
          p.vendorName, p.vendor_name, p.product, p.status,
        ].join(' ').toLowerCase();
        return blob.includes(q) || (digits(q) && digits(blob).includes(digits(q)));
      });
    }
    if (from || to) {
      out = out.filter((p) => {
        const d = dateOnly(datesOf(p)[field]);
        if (!d) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
    }
    if (_boSortAz) {
      out.sort((a, b) => String(a.vendorName || a.vendor_name || '').localeCompare(String(b.vendorName || b.vendor_name || ''), 'pt-BR'));
    } else {
      out.sort((a, b) => String(b.created_at || b.createdAt || '').localeCompare(String(a.created_at || a.createdAt || '')));
    }
    return out;
  }

  /**
   * cdActionsHtml — mesmas ações do painel de Propostas (ver / editar / lixeira).
   * Status muda no select e salva sozinho (onchange); não usa mais o botão Salvar.
   */
  function cdActionsHtml(p) {
    const id = String(p?.id || '');
    if (!id) return '—';
    if (typeof Proposals !== 'undefined' && typeof Proposals.actionsRowHtml === 'function') {
      const canDelete = typeof Proposals._canDeleteProposal === 'function'
        ? !!Proposals._canDeleteProposal()
        : true;
      const label = p.clientName || p.client_name || p.numero || id;
      return Proposals.actionsRowHtml(id, { canEdit: true, canDelete, label });
    }
    const safe = esc(id);
    return `<div class="client-actions" role="group" aria-label="Ações">
      <button type="button" class="client-actions__btn" title="Ver" onclick="Proposals.openAdminViewModal('${safe}')">Ver</button>
      <button type="button" class="client-actions__btn" title="Editar" onclick="Proposals.openAdminModal('${safe}')">Editar</button>
    </div>`;
  }

  async function renderBo(opts = {}) {
    const root = document.getElementById('cd_bo_list');
    if (!root) return;
    if (!opts.cached) root.innerHTML = '<p class="text-muted" style="padding:16px;">Carregando...</p>';
    try {
      if (!opts.cached) _boRows = await loadAllCd();
      const vendors = [...new Set(_boRows.map((p) => String(p.vendorName || p.vendor_name || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
      const curVendor = document.getElementById('cd_bo_vendor')?.value || '';
      const curStatus = document.getElementById('cd_bo_status_filter')?.value || '';
      const all = boFilteredRows(_boRows);
      const statusOpts = optsHtml(cat().STATUS_BO || []);
      const head = `<thead><tr>
        <th>Nº</th>
        <th><select id="cd_bo_vendor" class="header-filter" onchange="EsteiraCompraDivida.refreshBo(true)"><option value="">VENDEDOR</option>${vendors.map((v) => `<option value="${esc(v)}"${v === curVendor ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></th>
        <th>Cliente</th><th>Produto</th><th>Convênio</th><th>Protocolo</th><th>Valor</th><th>Valor Final</th><th>Data / Digitação</th>
        <th><select id="cd_bo_status_filter" class="header-filter" onchange="EsteiraCompraDivida.refreshBo(true)"><option value="">STATUS</option><option value="todos"${curStatus === 'todos' ? ' selected' : ''}>TODOS OS STATUS</option>${(cat().STATUS_BO || []).map((s) => `<option value="${esc(s)}"${s === curStatus ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></th>
        <th>Data pagamento</th><th>Ações</th></tr></thead>`;
      if (!all.length) {
        root.innerHTML = `<div class="table-wrap"><table class="data-table">${head}<tbody><tr><td colspan="12" style="text-align:center;color:var(--color-text-muted);padding:24px;">Nenhuma proposta encontrada.</td></tr></tbody></table></div>`;
        return;
      }
      root.innerHTML = `<div class="table-wrap"><table class="data-table">${head}
        <tbody>${all.map((p) => {
          const pl = payloadOf(p);
          const id = esc(p.id);
          const cur = esc(p.status || p.statusOp || '');
          const dt = datesOf(p);
          const ports = (pl.contratos_port || []).length
            ? `<div class="text-muted" style="font-size:11px;margin-top:4px;">${pl.contratos_port.length} contrato(s) port</div>`
            : '';
          const atts = p.anexos || p.attachments || pl.anexos || {};
          const attList = [];
          if (atts.documento_1) attList.push({ label: 'Doc 1', att: atts.documento_1 });
          if (atts.documento_2) attList.push({ label: 'Doc 2', att: atts.documento_2 });
          const attsHtml = attList.length
            ? `<div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap;">${attList.map((a) => {
                const url = a.att?.url || a.att?.caminho || '';
                const nome = a.att?.nome || a.label;
                return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="badge badge-info" style="font-size:10px;text-decoration:none;padding:2px 6px;" title="${esc(nome)}">📎 ${a.label}</a>`;
              }).join('')}</div>`
            : '';
          return `<tr>
            <td>${esc(p.numero || p.id)}</td>
            <td>${esc(p.vendorName || p.vendor_name || '—')}</td>
            <td>${esc(p.clientName || p.client_name || '')}<br/><span class="text-muted">${esc(fmtCpf(p.clientCpf || p.client_cpf))}</span>${attsHtml}</td>
            <td>${esc(pl.produto || p.product || '')}<br/><span class="text-muted">${esc(pl.banco || '')} · ${esc(pl.tabela || p.tabela || '')}</span>${ports}</td>
            <td>${esc(pl.convenio || p.convenio || '')}</td>
            <td>${esc(p.protocolo || '—')}</td>
            <td>${esc(fmtMoney(p.valor))}</td>
            <td>${esc(fmtMoney(p.valorFinal ?? p.valor))}</td>
            <td>${esc(fmtDay(dt.criacao))}${dt.digitacao ? `<div class="text-muted" style="font-size:11px;">Digitação: ${esc(fmtDay(dt.digitacao))}</div>` : ''}</td>
            <td><select class="form-control" id="cd_st_${id}" style="min-width:150px;"
              onchange="EsteiraCompraDivida.saveStatus('${id}')">
              <option value="${cur}">${cur}</option>${statusOpts}
            </select></td>
            <td>${esc(fmtDay(dt.pagamento))}</td>
            <td>${cdActionsHtml(p)}</td>
          </tr>`;
        }).join('')}</tbody></table></div>`;
    } catch (e) {
      root.innerHTML = `<p style="color:#dc2626;padding:16px;">${esc(e.message || 'Falha ao carregar')}</p>`;
    }
  }

  const EsteiraCompraDivida = {
    maskCpf(v) { return maskCpf(v); },
    onProdutoChange() { toggleRefinPort(); },
    onFiltroTabela() { fillTabelaSelect(); },
    onPortChange() { recalcTotal(); },

    resetVendorForm() {
      const f = document.getElementById('cdVendorForm');
      if (f) f.reset();
      const info = document.getElementById('cd_cliente_info');
      if (info) info.innerHTML = '';
      const nome = document.getElementById('cd_nome');
      if (nome) nome.value = '';
      const hint = document.getElementById('cd_valor_total_hint');
      if (hint) hint.textContent = 'Nenhum contrato ativo somado';
      fillTabelaSelect();
      toggleRefinPort();
      fillVendorSelect();
    },

    async buscarCpf() {
      const cpf = digits(document.getElementById('cd_cpf')?.value);
      const info = document.getElementById('cd_cliente_info');
      const nomeEl = document.getElementById('cd_nome');
      if (cpf.length !== 11) {
        if (typeof showToast === 'function') showToast('Informe um CPF válido (11 dígitos).', 'warning');
        return;
      }
      if (info) info.innerHTML = '<span style="color:#64748b;font-size:12px;">Buscando cliente na base...</span>';
      let nome = '';
      try {
        if (typeof DB !== 'undefined' && typeof DB.findClientByCpf === 'function') {
          const c = await DB.findClientByCpf(cpf).catch(() => null);
          if (c) nome = c.name || c.nome || '';
        }
        if (!nome && typeof DB !== 'undefined' && typeof DB.getUserByCpf === 'function') {
          const u = await DB.getUserByCpf(cpf).catch(() => null);
          if (u) nome = u.name || '';
        }
      } catch (_) { /* noop */ }
      if (nomeEl) nomeEl.value = nome;
      if (info) {
        info.innerHTML = nome
          ? `<div style="display:inline-flex;align-items:center;gap:6px;background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;padding:4px 10px;border-radius:6px;font-weight:600;font-size:12px;margin-top:2px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span>${esc(nome)}</span>
             </div>`
          : `<div style="display:inline-flex;align-items:center;gap:6px;background:#fffbeb;color:#92400e;border:1px solid #fde68a;padding:4px 10px;border-radius:6px;font-size:12px;margin-top:2px;">
              <span>Não cadastrado na base. Prossiga informando na observação se desejar.</span>
             </div>`;
      }
    },

    /**
     * ensureNavButton — cria o item GESTÃO → Gestão de Crédito (após Propostas).
     * mode: 'vendor' | 'bo' define qual seção abre.
     */
    ensureNavButton(mode) {
      let btn = document.getElementById('navGestaoCredito');
      const sectionId = mode === 'bo' ? 'secEsteiraCompraDividaBo' : 'secEsteiraCompraDivida';
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-item';
        btn.id = 'navGestaoCredito';
        btn.innerHTML = `${credNavIcon()}<span class="nav-label">Gestão de Crédito</span>`;
        insertAfterProposals(btn);
      }
      btn.dataset.section = sectionId;
      btn.style.display = '';
      btn.hidden = false;
      btn._cdOpenMode = mode;
      // Um único handler: monta formulário + navigateTo (não deixar tela branca).
      if (!btn.dataset.cdOpenWired) {
        btn.dataset.cdOpenWired = '1';
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          openGestao(btn._cdOpenMode || 'bo');
        }, true);
      }
      return btn;
    },

    /**
     * contentRoot — onde as sections do painel moram.
     * Admin usa .page-content dentro de #mainArea (não existe .main-content).
     */
    contentRoot() {
      return document.querySelector('.page-content')
        || document.querySelector('#mainArea .page-content')
        || document.querySelector('#mainArea')
        || document.querySelector('.main-content .page-content')
        || document.querySelector('.main-content')
        || document.body;
    },

    ensureVendorSection() {
      const main = this.contentRoot();
      if (!main) return false;
      let sec = document.getElementById('secEsteiraCompraDivida');
      if (!sec) {
        sec = document.createElement('section');
        sec.className = 'section';
        sec.id = 'secEsteiraCompraDivida';
        main.appendChild(sec);
      }
      sec.style.removeProperty('display');
      // Sempre lista + botão; formulário só no popup (nunca formulário inline na página).
      const root = document.getElementById('cdVendorRoot');
      const hasInlineForm = !!(sec.querySelector('#cd_produto') || document.querySelector('#cdVendorRoot #cd_produto'));
      const hasList = !!document.getElementById('cd_minhas_fichas');
      if (!root || hasInlineForm || !hasList) {
        sec.innerHTML = `<div id="cdVendorRoot">${vendorListHtml()}</div>`;
      }
      ensureCdNovaModal();
      this.ensureNavButton('vendor');
      renderMinhasFichas();
      return true;
    },

    ensureBoSection() {
      const main = this.contentRoot();
      if (!main) return false;
      let sec = document.getElementById('secEsteiraCompraDividaBo');
      if (!sec) {
        sec = document.createElement('section');
        sec.className = 'section';
        sec.id = 'secEsteiraCompraDividaBo';
        main.appendChild(sec);
      }
      sec.style.removeProperty('display');
      if (!document.getElementById('cdDateFilter') || !document.getElementById('cd_bo_list')) {
        sec.innerHTML = `<div id="cdBoRoot">${boHtml()}</div>`;
      }
      ensureCdNovaModal();
      this.ensureNavButton('bo');
      return true;
    },

    open: openGestao,

    /**
     * openNova — abre o popup de cadastro (mesmo do BO).
     * No painel do vendedor trava o responsável nele mesmo.
     */
    openNova() {
      const path = String(location.pathname || '');
      const isEmployeePage = /employee\.html/i.test(path);
      if (isEmployeePage) this.ensureVendorSection();
      else this.ensureBoSection();

      const modal = ensureCdNovaModal();
      modal.innerHTML = novaModalHtml();
      this.resetVendorForm();
      fillTabelaSelect();
      toggleRefinPort();
      if (isEmployeePage || canVendorView(session())) {
        lockVendorSelectToSelf();
      } else {
        fillVendorSelect();
      }
      if (typeof openModal === 'function') openModal('cdNovaModal');
      else modal.classList.add('open');
    },

    closeNova() {
      if (typeof closeModal === 'function') closeModal('cdNovaModal');
      else document.getElementById('cdNovaModal')?.classList.remove('open');
    },

    refreshBo(cached) { return renderBo({ cached: cached === true }); },

    clearBoFilters() {
      ['cd_bo_q', 'cd_bo_from', 'cd_bo_to', 'cd_bo_vendor', 'cd_bo_status_filter'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      const first = document.querySelector('input[name="cdDateFieldRadio"][value="criacao"]');
      if (first) first.checked = true;
      return renderBo({ cached: true });
    },

    toggleVendorSort() {
      _boSortAz = !_boSortAz;
      const b = document.getElementById('cd_bo_sort_btn');
      if (b) b.classList.toggle('btn-primary', _boSortAz);
      return renderBo({ cached: true });
    },

    /** Baixa a lista filtrada em CSV (separador ;). */
    exportCsv() {
      const rows = boFilteredRows(_boRows);
      if (!rows.length) {
        if (typeof showToast === 'function') showToast('Nada para exportar.', 'warning');
        return;
      }
      const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [['Nº', 'Vendedor', 'Cliente', 'CPF', 'Produto', 'Banco', 'Tabela', 'Convênio', 'Protocolo', 'Valor', 'Valor Final', 'Cadastro', 'Digitação', 'Status', 'Pagamento'].map(cell).join(';')];
      rows.forEach((p) => {
        const pl = payloadOf(p);
        const dt = datesOf(p);
        lines.push([
          p.numero || p.id, p.vendorName || p.vendor_name, p.clientName || p.client_name, fmtCpf(p.clientCpf || p.client_cpf),
          pl.produto || p.product, pl.banco, pl.tabela || p.tabela, pl.convenio || p.convenio, p.protocolo,
          p.valor, p.valorFinal ?? p.valor, fmtDay(dt.criacao), fmtDay(dt.digitacao), p.status || p.statusOp, fmtDay(dt.pagamento),
        ].map(cell).join(';'));
      });
      const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `gestao-credito-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    },

    async submitVendor(event) {
      if (event) event.preventDefault();
      const u = session();
      if (!u?.id) {
        if (typeof showToast === 'function') showToast('Faça login novamente.', 'warning');
        return;
      }
      const cpf = digits(document.getElementById('cd_cpf')?.value);
      const nome = document.getElementById('cd_nome')?.value?.trim()
        || document.getElementById('cd_obs')?.value?.trim()?.slice(0, 80)
        || 'Cliente';
      const produto = document.getElementById('cd_produto')?.value || '';
      const convenio = document.getElementById('cd_convenio')?.value || '';
      const situacao = document.getElementById('cd_situacao')?.value || '';
      const banco = document.getElementById('cd_banco')?.value || '';
      const tabela = document.getElementById('cd_tabela')?.value || '';
      const origem = document.getElementById('cd_origem')?.value || 'propria';
      const obsUser = document.getElementById('cd_obs')?.value?.trim() || '';
      const contratos = produto === 'REFIN PORT' ? collectPortContracts() : [];
      let valor = produto === 'REFIN PORT'
        ? parseFloat(document.getElementById('cd_valor_total')?.value)
        : parseFloat(document.getElementById('cd_valor')?.value);

      if (cpf.length !== 11) {
        if (typeof showToast === 'function') showToast('Informe o CPF do cliente.', 'warning');
        return;
      }
      if (!produto || !convenio || !banco || !tabela) {
        if (typeof showToast === 'function') showToast('Preencha produto, convênio, banco e tabela.', 'warning');
        return;
      }
      if (produto === 'REFIN PORT' && !contratos.length) {
        if (typeof showToast === 'function') showToast('Marque ao menos 1 contrato no REFIN PORT.', 'warning');
        return;
      }
      if (!Number.isFinite(valor) || valor <= 0) {
        if (typeof showToast === 'function') showToast('Informe o valor da operação.', 'warning');
        return;
      }

      const now = new Date().toISOString();
      const d = new Date();
      const protocolo = `CD-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(Math.floor(1000 + Math.random() * 9000))}`;
      const id = `CD-${Date.now()}`;
      const status = 'AG. ANÁLISE';
      const payload = {
        tipo: TIPO,
        origem,
        produto,
        convenio,
        situacao_beneficiario: situacao,
        banco,
        tabela,
        contratos_port: contratos,
        valor_total: valor,
        criado_em: now,
      };

      const vendorSel = document.getElementById('cd_vendedor');
      const vendorVal = vendorSel?.value || '';
      const vendorOpt = vendorSel?.options[vendorSel.selectedIndex];
      const vendorId = vendorVal || u.id;
      const vendorName = (vendorVal && vendorOpt?.text) ? vendorOpt.text.trim() : (u.name || 'Backoffice');

      const proposal = {
        id,
        numero: protocolo,
        protocolo,
        employee_id: vendorId,
        vendorId: vendorId,
        vendor_id: vendorId,
        vendorName: vendorName,
        vendor_name: vendorName,
        clientCpf: cpf,
        client_cpf: cpf,
        clientName: nome,
        client_name: nome,
        product: produto,
        convenio,
        entidade: 'COMPRA_DIVIDA',
        tabela,
        bancoDigitado: banco,
        banco_digitado: banco,
        compraDivida: produto === 'REFIN PORT' || /divida|dívida|port|refin/i.test(produto) ? 'SIM' : 'NÃO',
        compra_divida: produto === 'REFIN PORT' || /divida|dívida|port|refin/i.test(produto) ? 'SIM' : 'NÃO',
        valor,
        valorFinal: valor,
        desconto: 0,
        status,
        statusOp: status,
        status_op: status,
        creditoEsteira: payload,
        credito_esteira: payload,
        obs: [
          TAG,
          'tipo_esteira=compra_divida',
          `origem=${origem}`,
          `banco=${banco}`,
          `tabela=${tabela}`,
          situacao ? `situacao=${situacao}` : '',
          contratos.length ? `contratos_port=${contratos.length}` : '',
          obsUser,
        ].filter(Boolean).join('\n'),
        history: [{
          date: now,
          actorName: u.name,
          action: 'Cadastro Compra de Dívida',
          note: `Protocolo ${protocolo}`,
        }],
        createdAt: now,
        created_at: now,
        updatedAt: now,
        updated_at: now,
      };

      const file1 = document.getElementById('cd_anexo_1')?.files?.[0];
      const file2 = document.getElementById('cd_anexo_2')?.files?.[0];
      const anexos = {};

      const btn = document.getElementById('cd_submit_btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
      try {
        if (file1 && typeof DB !== 'undefined' && typeof DB.uploadProposalFile === 'function') {
          if (btn) btn.textContent = 'Enviando anexo 1...';
          try {
            const up1 = await DB.uploadProposalFile(file1, id, 'doc_1');
            if (up1) anexos.documento_1 = up1;
          } catch (e1) {
            console.warn('[EsteiraCompraDivida] Falha anexo 1:', e1);
          }
        }
        if (file2 && typeof DB !== 'undefined' && typeof DB.uploadProposalFile === 'function') {
          if (btn) btn.textContent = 'Enviando anexo 2...';
          try {
            const up2 = await DB.uploadProposalFile(file2, id, 'doc_2');
            if (up2) anexos.documento_2 = up2;
          } catch (e2) {
            console.warn('[EsteiraCompraDivida] Falha anexo 2:', e2);
          }
        }

        if (Object.keys(anexos).length) {
          // MySQL grava em attachments (não existe coluna "anexos").
          payload.anexos = anexos;
          proposal.attachments = anexos;
          proposal.anexos = anexos;
          proposal.creditoEsteira = payload;
          proposal.credito_esteira = payload;
        }

        if (btn) btn.textContent = 'Salvando proposta...';
        if (typeof DB === 'undefined' || typeof DB.saveProposal !== 'function') {
          throw new Error('Banco indisponível. Recarregue (Ctrl+F5).');
        }
        await DB.saveProposal(proposal);
        if (typeof showToast === 'function') showToast(`Ficha enviada! Protocolo ${protocolo}`, 'success');
        this.resetVendorForm();
        this.closeNova();
        if (document.getElementById('cd_minhas_fichas')) await renderMinhasFichas();
        if (document.getElementById('cd_bo_list')) await renderBo();
      } catch (e) {
        console.error('[EsteiraCompraDivida]', e);
        if (typeof showToast === 'function') showToast(e.message || 'Erro ao salvar.', 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar para esteira'; }
      }
    },

    async saveStatus(id) {
      const sel = document.getElementById(`cd_st_${id}`);
      const status = sel?.value || '';
      if (!status) return;
      const u = session();
      try {
        if (typeof showLoading === 'function') showLoading('Salvando status…');
        const patch = {
          id,
          status,
          statusOp: status,
          status_op: status,
          updatedAt: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          lastUpdatedBy: u?.name || '',
        };
        if (typeof DB.saveProposal === 'function') {
          await DB.saveProposal(patch, { patch: true });
        } else {
          throw new Error('DB.saveProposal indisponível');
        }
        if (typeof showToast === 'function') showToast('Status atualizado.', 'success');
        await renderBo();
      } catch (e) {
        console.error('[EsteiraCompraDivida.saveStatus]', e);
        if (typeof showToast === 'function') showToast(e.message || 'Falha ao salvar status.', 'error');
      } finally {
        if (typeof hideLoading === 'function') hideLoading();
      }
    },

    async init() {
      const u = session();
      if (!u) return false;

      const path = String(location.pathname || '');
      const isEmployeePage = /employee\.html/i.test(path);
      const isAdminPage = /admin\.html|financeiro\.html/i.test(path);

      // Painel do vendedor: menu separado "Gestão de Crédito" (só fichas dele).
      if (isEmployeePage) {
        if (!canVendorView(u)) {
          document.getElementById('navGestaoCredito')?.remove();
          document.getElementById('secEsteiraCompraDivida')?.remove();
          return false;
        }
        return this.ensureVendorSection();
      }

      // Admin/financeiro: esteira completa do BO.
      if (!isAdminPage || !canBoView(u)) {
        document.getElementById('navGestaoCredito')?.remove();
        document.getElementById('secEsteiraCompraDivida')?.remove();
        document.getElementById('secEsteiraCompraDividaBo')?.remove();
        document.getElementById('cdNovaModal')?.remove();
        return false;
      }

      return this.ensureBoSection();
    },

    /** Exposto para Proposals.renderEmployeeList separar CD da lista normal. */
    isCompraDividaProposal,
  };

  window.EsteiraCompraDivida = EsteiraCompraDivida;

  let _cdTries = 0;
  function _bootCd() {
    _cdTries += 1;
    Promise.resolve(EsteiraCompraDivida.init()).then((ok) => {
      if (!ok && _cdTries < 25) setTimeout(_bootCd, 500);
    }).catch(() => {
      if (_cdTries < 25) setTimeout(_bootCd, 500);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bootCd);
  } else {
    _bootCd();
  }
  // Reaplica depois do applyAdminNavVisibility (admin.js) e em troca de aba.
  setTimeout(_bootCd, 2500);
  setTimeout(_bootCd, 6000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) _bootCd();
  });
})();
