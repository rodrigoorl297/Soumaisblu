/* ==========================================================
   SOU + BLU – Simulador de Troco [OTIMIZADO]
   ========================================================== */

window.SimulacaoTroco = {
  PARCELAS: 22,

  // Tabelas de Fatores (mantidas para referência do negócio)
  TABELAS: (() => {
    const neo = 0.04199;
    const aki = 0.04499;
    const f = (base, pct) => base / pct;
    return [
      { grupo: 'NEO', id: 'NEO_NORMAL', label: 'NEO NORMAL — 100%', code: '100%', fator: f(neo, 1) },
      { grupo: 'NEO', id: 'NEO_FLEX1_83', label: 'NEO FLEX 1 — 83%', code: '83%', fator: f(neo, 0.83) },
      { grupo: 'NEO', id: 'NEO_FLEX1_82', label: 'NEO FLEX 1 — 82%', code: '82%', fator: f(neo, 0.82) },
      { grupo: 'NEO', id: 'NEO_FLEX1_80', label: 'NEO FLEX 1 — 80%', code: '80%', fator: f(neo, 0.80) },
      { grupo: 'NEO', id: 'NEO_FLEX2_73', label: 'NEO FLEX 2 — 73%', code: '73%', fator: f(neo, 0.73) },
      { grupo: 'NEO', id: 'NEO_FLEX2_67', label: 'NEO FLEX 2 — 67%', code: '67%', fator: f(neo, 0.67) },
      { grupo: 'NEO', id: 'NEO_FLEX2_65', label: 'NEO FLEX 2 — 65%', code: '65%', fator: f(neo, 0.65) },
      { grupo: 'NEO', id: 'NEO_FLEX2_63', label: 'NEO FLEX 2 — 63%', code: '63%', fator: f(neo, 0.63) },
      { grupo: 'NEO', id: 'NEO_FLEX3_53', label: 'NEO FLEX 3 — 53%', code: '53%', fator: f(neo, 0.53) },
      { grupo: 'NEO', id: 'NEO_FLEX3_52', label: 'NEO FLEX 3 — 52%', code: '52%', fator: f(neo, 0.52) },
      { grupo: 'NEO', id: 'NEO_FLEX3_50', label: 'NEO FLEX 3 — 50%', code: '50%', fator: f(neo, 0.50) },
      { grupo: 'NEO', id: 'NEO_FLEX3_43', label: 'NEO FLEX 3 — 43%', code: '43%', fator: f(neo, 0.43) },
      { grupo: 'NEO', id: 'NEO_FLEX4_37', label: 'NEO FLEX 4 — 37%', code: '37%', fator: f(neo, 0.37) },
      { grupo: 'NEO', id: 'NEO_FLEX4_30', label: 'NEO FLEX 4 — 30%', code: '30%', fator: f(neo, 0.30) },
      { grupo: 'NEO', id: 'NEO_FLEX4_23', label: 'NEO FLEX 4 — 23%', code: '23%', fator: f(neo, 0.23) },
      { grupo: 'NEO', id: 'NEO_FLEX5_17', label: 'NEO FLEX 5 — 17%', code: '17%', fator: f(neo, 0.17) },
      { grupo: 'NEO', id: 'NEO_FLEX5_12', label: 'NEO FLEX 5 — 12%', code: '12%', fator: f(neo, 0.12) },
      { grupo: 'GOVSP NEO CGM', id: 'GOVSP_NEO_CGM_399_76', label: 'GOVSP NEO CGM 399 — 76%', code: '76%', fator: f(neo, 0.76) },
      { grupo: 'GOVSP NEO CGM', id: 'GOVSP_NEO_CGM_379_65', label: 'GOVSP NEO CGM 379 — 65%', code: '65%', fator: f(neo, 0.65) },
      { grupo: 'GOVSP NEO CGM', id: 'GOVSP_NEO_CGM_359_40', label: 'GOVSP NEO CGM 359 — 40%', code: '40%', fator: f(neo, 0.40) },
      { grupo: 'GOVSP NEO CGM', id: 'GOVSP_NEO_CGM_339_30', label: 'GOVSP NEO CGM 339 — 30%', code: '30%', fator: f(neo, 0.30) },
      { grupo: 'GOVSP NEO CGM', id: 'GOVSP_NEO_CGM_319_15', label: 'GOVSP NEO CGM 319 — 15%', code: '15%', fator: f(neo, 0.15) },
      { grupo: 'PREFSP NEO CGM', id: 'PREFSP_NEO_CGM_419_60', label: 'PREFSP NEO CGM 419 — 60%', code: '60%', fator: f(neo, 0.60) },
      { grupo: 'PREFSP NEO CGM', id: 'PREFSP_NEO_CGM_399_50', label: 'PREFSP NEO CGM 399 — 50%', code: '50%', fator: f(neo, 0.50) },
      { grupo: 'PREFSP NEO CGM', id: 'PREFSP_NEO_CGM_379_40', label: 'PREFSP NEO CGM 379 — 40%', code: '40%', fator: f(neo, 0.40) },
      { grupo: 'PREFSP NEO CGM', id: 'PREFSP_NEO_CGM_359_25', label: 'PREFSP NEO CGM 359 — 25%', code: '25%', fator: f(neo, 0.25) },
      { grupo: 'GOVMA NEO CGM', id: 'GOVMA_NEO_CGM_419_60', label: 'GOVMA NEO CGM 419 — 60%', code: '60%', fator: f(neo, 0.60) },
      { grupo: 'GOVMA NEO CGM', id: 'GOVMA_NEO_CGM_399_50', label: 'GOVMA NEO CGM 399 — 50%', code: '50%', fator: f(neo, 0.50) },
      { grupo: 'GOVMA NEO CGM', id: 'GOVMA_NEO_CGM_379_40', label: 'GOVMA NEO CGM 379 — 40%', code: '40%', fator: f(neo, 0.40) },
      { grupo: 'GOVMA NEO CGM', id: 'GOVMA_NEO_CGM_359_25', label: 'GOVMA NEO CGM 359 — 25%', code: '25%', fator: f(neo, 0.25) },
      { grupo: 'AKI CAPITAL', id: 'AKI_L2_110', label: 'AKI CAPITAL L2 — 110%', code: '110%', fator: f(aki, 1.10) },
      { grupo: 'AKI CAPITAL', id: 'AKI_L3_100', label: 'AKI CAPITAL L3 — 100%', code: '100%', fator: f(aki, 1.00) },
      { grupo: 'AKI CAPITAL', id: 'AKI_L4_82', label: 'AKI CAPITAL L4 — 82%', code: '82%', fator: f(aki, 0.82) },
      { grupo: 'AKI CAPITAL', id: 'AKI_L5_67', label: 'AKI CAPITAL L5 — 67%', code: '67%', fator: f(aki, 0.67) },
      { grupo: 'AKI CAPITAL', id: 'AKI_L6_52', label: 'AKI CAPITAL L6 — 52%', code: '52%', fator: f(aki, 0.52) },
      { grupo: 'AKI CAPITAL', id: 'AKI_L7_37', label: 'AKI CAPITAL L7 — 37%', code: '37%', fator: f(aki, 0.37) },
      { grupo: 'AKI CAPITAL', id: 'AKI_L8_17', label: 'AKI CAPITAL L8 — 17%', code: '17%', fator: f(aki, 0.17) },
      { grupo: 'AKI CAPITAL', id: 'AKI_L9_10', label: 'AKI CAPITAL L9 — 10%', code: '10%', fator: f(aki, 0.10) },
      { grupo: 'AKI CAPITAL', id: 'AKI_100', label: 'AKI CAPITAL — 100%', code: '100%', fator: f(aki, 1) },
      { grupo: 'AKI CAPITAL', id: 'AKI_70', label: 'AKI CAPITAL — 70%', code: '70%', fator: f(aki, 0.70) },
      { grupo: 'AKI CAPITAL', id: 'AKI_35', label: 'AKI CAPITAL — 35%', code: '35%', fator: f(aki, 0.35) },
      { grupo: 'AKI CAPITAL', id: 'AKI_17', label: 'AKI CAPITAL — 17%', code: '17%', fator: f(aki, 0.17) },
      { grupo: 'AMIGOZ', id: 'AMIGOZ_100', label: 'AMIGOZ — 100%', code: '100%', fator: f(neo, 1) },
      { grupo: 'AMIGOZ', id: 'AMIGOZ_85', label: 'AMIGOZ — 85%', code: '85%', fator: f(neo, 0.85) },
      { grupo: 'AMIGOZ', id: 'AMIGOZ_80', label: 'AMIGOZ — 80%', code: '80%', fator: f(neo, 0.80) },
      { grupo: 'AMIGOZ', id: 'AMIGOZ_67', label: 'AMIGOZ — 67%', code: '67%', fator: f(neo, 0.67) },
      { grupo: 'AMIGOZ', id: 'AMIGOZ_65', label: 'AMIGOZ — 65%', code: '65%', fator: f(neo, 0.65) },
      { grupo: 'AMIGOZ', id: 'AMIGOZ_58', label: 'AMIGOZ — 58%', code: '58%', fator: f(neo, 0.58) },
      { grupo: 'AMIGOZ', id: 'AMIGOZ_55', label: 'AMIGOZ — 55%', code: '55%', fator: f(neo, 0.55) },
      { grupo: 'AMIGOZ', id: 'AMIGOZ_50', label: 'AMIGOZ — 50%', code: '50%', fator: f(neo, 0.50) },
      { grupo: 'AMIGOZ', id: 'AMIGOZ_45', label: 'AMIGOZ — 45%', code: '45%', fator: f(neo, 0.45) },
      { grupo: 'AMIGOZ', id: 'AMIGOZ_38', label: 'AMIGOZ — 38%', code: '38%', fator: f(neo, 0.38) },
      { grupo: 'AMIGOZ', id: 'AMIGOZ_35', label: 'AMIGOZ — 35%', code: '35%', fator: f(neo, 0.35) },
      { grupo: 'AMIGOZ', id: 'AMIGOZ_13', label: 'AMIGOZ — 13%', code: '13%', fator: f(neo, 0.13) },
      { grupo: 'AMIGOZ', id: 'AMIGOZ_12', label: 'AMIGOZ — 12%', code: '12%', fator: f(neo, 0.12) },
      { grupo: 'FUTURO', id: 'FUTURO_100', label: 'FUTURO — 100%', code: '100%', fator: f(neo, 1) },
      { grupo: 'FUTURO', id: 'FUTURO_95', label: 'FUTURO — 95%', code: '95%', fator: f(neo, 0.95) },
      { grupo: 'FUTURO', id: 'FUTURO_90', label: 'FUTURO — 90%', code: '90%', fator: f(neo, 0.90) },
      { grupo: 'FUTURO', id: 'FUTURO_82', label: 'FUTURO — 82%', code: '82%', fator: f(neo, 0.82) },
      { grupo: 'FUTURO', id: 'FUTURO_50', label: 'FUTURO — 50%', code: '50%', fator: f(neo, 0.50) },
      { grupo: 'FUTURO', id: 'FUTURO_25', label: 'FUTURO — 25%', code: '25%', fator: f(neo, 0.25) },
      { grupo: 'FUTURO', id: 'FUTURO_10', label: 'FUTURO — 10%', code: '10%', fator: f(neo, 0.10) },
      { grupo: 'Outras', id: 'FOX', label: 'FOX — 100%', code: '100%', fator: f(neo, 1) },
      { grupo: 'Outras', id: 'BLU', label: 'BLU — 100%', code: '100%', fator: f(neo, 1) },
      { grupo: 'Outras', id: 'GL3', label: 'GL3 — 100%', code: '100%', fator: f(neo, 1) },
    ];
  })(),

  // Formatação robusta de moeda
  fmt: (v) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),

  getTabela: (id) => window.SimulacaoTroco.TABELAS.find(t => t.id === id) || null,

  // Cálculo preciso (utilizando arredondamento matemático padrão)
  calcular(parcela, tabelaId, margemAdicional) {
    const p = parseFloat(parcela) || 0;
    const margem = parseFloat(margemAdicional) || 0;
    const tab = this.getTabela(tabelaId);
    
    if (!p || !tab?.fator) {
      return { saldoDevedor: 0, saldoLiberado: 0, margemLiberada: 0, troco: 0, tabela: tab };
    }

    const saldoDevedor = p * this.PARCELAS;
    const saldoLiberado = p / tab.fator;
    const margemLiberada = margem > 0 ? (margem / tab.fator) : 0;
    const troco = saldoLiberado - saldoDevedor + margemLiberada;

    return { 
      saldoDevedor: saldoDevedor.toFixed(2), 
      saldoLiberado: saldoLiberado.toFixed(2), 
      margemLiberada: margemLiberada.toFixed(2), 
      troco: troco.toFixed(2), 
      tabela: tab 
    };
  },

  fillSelect(selectEl, defaultId) {
    if (!selectEl) return;
    const grupos = [...new Set(this.TABELAS.map(t => t.grupo))];
    
    selectEl.innerHTML = '<option value="">Selecione a tabela</option>' + 
      grupos.map(gk => `
        <optgroup label="${gk}">
          ${this.TABELAS.filter(t => t.grupo === gk).map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
        </optgroup>
      `).join('');
    
    if (defaultId) selectEl.value = defaultId;
  },

  render() {
    const inputs = {
      parcela: document.getElementById('simParcela'),
      tabela: document.getElementById('simTabela'),
      margem: document.getElementById('simMargemAdicional')
    };
    const outputs = {
      devedor: document.getElementById('simSaldoDevedor'),
      liberado: document.getElementById('simSaldoLiberado'),
      margemLib: document.getElementById('simMargemLiberada'),
      troco: document.getElementById('simTrocoValor'),
      hint: document.getElementById('simTabelaHint')
    };

    if (!inputs.parcela || !inputs.tabela) return;

    const r = this.calcular(inputs.parcela.value, inputs.tabela.value, inputs.margem?.value);

    if (outputs.devedor) outputs.devedor.textContent = r.saldoDevedor > 0 ? this.fmt(r.saldoDevedor) : '—';
    if (outputs.liberado) outputs.liberado.textContent = r.saldoLiberado > 0 ? this.fmt(r.saldoLiberado) : '—';
    if (outputs.margemLib) outputs.margemLib.textContent = r.margemLiberada > 0 ? this.fmt(r.margemLiberada) : '—';
    if (outputs.troco) outputs.troco.textContent = this.fmt(r.troco);

    if (outputs.hint) {
      outputs.hint.textContent = r.tabela ? `${r.tabela.label} · Fator: ${r.tabela.fator} · ${r.tabela.code}` : 'Selecione parcela e tabela.';
    }
  },

  init() {
    const tabelaEl = document.getElementById('simTabela');
    const parcelaEl = document.getElementById('simParcela');
    const margemEl = document.getElementById('simMargemAdicional');

    if (!tabelaEl || tabelaEl.dataset.simInit) return;
    tabelaEl.dataset.simInit = '1';

    this.fillSelect(tabelaEl, 'NEO_NORMAL');

    // Listener unificado
    [tabelaEl, parcelaEl, margemEl].forEach(el => {
      el?.addEventListener('input', () => this.render());
      el?.addEventListener('change', () => this.render());
    });

    this.render();
  }
};