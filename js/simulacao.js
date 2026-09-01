/* ==========================================================
   SOU + BLU – Simulador de Troco [OTIMIZADO]
   ========================================================== */

window.SimulacaoTroco = {
  PARCELAS: 22,

  // Tabelas de Fatores (mantidas para referência do negócio)
  TABELAS: (() => {
    return [
      { grupo: "AMIGOZ — GOV MG RCC", id: "AMIGOZ_GOVMG_RCC_450_100", label: "AMIGOZ GOV MG RCC TX 4,50 — 100%", code: "100%", fator: 0.0450000000, taxa: 0.045, pct: 1.0 },
      { grupo: "AMIGOZ — GOV MG RCC", id: "AMIGOZ_GOVMG_RCC_425_85", label: "AMIGOZ GOV MG RCC TX 4,25 — 85%", code: "85%", fator: 0.0500000000, taxa: 0.0425, pct: 0.85 },
      { grupo: "AMIGOZ — GOV MG RCC", id: "AMIGOZ_GOVMG_RCC_399_65", label: "AMIGOZ GOV MG RCC TX 3,99 — 65%", code: "65%", fator: 0.0613846154, taxa: 0.039900000000000005, pct: 0.65 },
      { grupo: "AMIGOZ — GOV MG RCC", id: "AMIGOZ_GOVMG_RCC_375_50", label: "AMIGOZ GOV MG RCC TX 3,75 — 50%", code: "50%", fator: 0.0750000000, taxa: 0.0375, pct: 0.5 },
      { grupo: "AMIGOZ — GOV MG RCC", id: "AMIGOZ_GOVMG_RCC_350_45", label: "AMIGOZ GOV MG RCC TX 3,50 — 45%", code: "45%", fator: 0.0777777778, taxa: 0.035, pct: 0.45 },
      { grupo: "AMIGOZ — GOV MG RMC", id: "AMIGOZ_GOVMG_RMC_450_100", label: "AMIGOZ GOV MG RMC TX 4,50 — 100%", code: "100%", fator: 0.0450000000, taxa: 0.045, pct: 1.0 },
      { grupo: "AMIGOZ — GOV MG RMC", id: "AMIGOZ_GOVMG_RMC_425_85", label: "AMIGOZ GOV MG RMC TX 4,25 — 85%", code: "85%", fator: 0.0500000000, taxa: 0.0425, pct: 0.85 },
      { grupo: "AMIGOZ — GOV MG RMC", id: "AMIGOZ_GOVMG_RMC_399_65", label: "AMIGOZ GOV MG RMC TX 3,99 — 65%", code: "65%", fator: 0.0613846154, taxa: 0.039900000000000005, pct: 0.65 },
      { grupo: "AMIGOZ — GOV MG RMC", id: "AMIGOZ_GOVMG_RMC_375_50", label: "AMIGOZ GOV MG RMC TX 3,75 — 50%", code: "50%", fator: 0.0750000000, taxa: 0.0375, pct: 0.5 },
      { grupo: "AMIGOZ — GOV MG RMC", id: "AMIGOZ_GOVMG_RMC_350_45", label: "AMIGOZ GOV MG RMC TX 3,50 — 45%", code: "45%", fator: 0.0777777778, taxa: 0.035, pct: 0.45 },
      { grupo: "AMIGOZ — GOV PB RMC", id: "AMIGOZ_GOVPB_RMC_500_100", label: "AMIGOZ GOV PB RMC TX 5,00 — 100%", code: "100%", fator: 0.0500000000, taxa: 0.05, pct: 1.0 },
      { grupo: "AMIGOZ — GOV PB RMC", id: "AMIGOZ_GOVPB_RMC_450_85", label: "AMIGOZ GOV PB RMC TX 4,50 — 85%", code: "85%", fator: 0.0529411765, taxa: 0.045, pct: 0.85 },
      { grupo: "AMIGOZ — GOV PB RMC", id: "AMIGOZ_GOVPB_RMC_398_55", label: "AMIGOZ GOV PB RMC TX 3,98 — 55%", code: "55%", fator: 0.0723636364, taxa: 0.0398, pct: 0.55 },
      { grupo: "AMIGOZ — GOV PB RMC", id: "AMIGOZ_GOVPB_RMC_375_35", label: "AMIGOZ GOV PB RMC TX 3,75 — 35%", code: "35%", fator: 0.1071428571, taxa: 0.0375, pct: 0.35 },
      { grupo: "AMIGOZ — GOV PB RMC", id: "AMIGOZ_GOVPB_RMC_350_12", label: "AMIGOZ GOV PB RMC TX 3,50 — 12%", code: "12%", fator: 0.2916666667, taxa: 0.035, pct: 0.12 },
      { grupo: "AMIGOZ — GOV SP RMC", id: "AMIGOZ_GOVSP_RMC_450_100", label: "AMIGOZ GOV SP RMC TX 4,50 — 100%", code: "100%", fator: 0.0450000000, taxa: 0.045, pct: 1.0 },
      { grupo: "AMIGOZ — GOV SP RMC", id: "AMIGOZ_GOVSP_RMC_398_85", label: "AMIGOZ GOV SP RMC TX 3,98 — 85%", code: "85%", fator: 0.0468235294, taxa: 0.0398, pct: 0.85 },
      { grupo: "AMIGOZ — GOV SP RMC", id: "AMIGOZ_GOVSP_RMC_375_55", label: "AMIGOZ GOV SP RMC TX 3,75 — 55%", code: "55%", fator: 0.0681818182, taxa: 0.0375, pct: 0.55 },
      { grupo: "AMIGOZ — GOV SP RMC", id: "AMIGOZ_GOVSP_RMC_350_35", label: "AMIGOZ GOV SP RMC TX 3,50 — 35%", code: "35%", fator: 0.1000000000, taxa: 0.035, pct: 0.35 },
      { grupo: "AMIGOZ — GOV SP RMC", id: "AMIGOZ_GOVSP_RMC_325_12", label: "AMIGOZ GOV SP RMC TX 3,25 — 12%", code: "12%", fator: 0.2708333333, taxa: 0.0325, pct: 0.12 },
      { grupo: "AMIGOZ — GOV SP CELETISTA RMC", id: "AMIGOZ_GOVSPCELETISTA_RMC_500_100", label: "AMIGOZ GOV SP CELETISTA RMC TX 5,00 — 100%", code: "100%", fator: 0.0500000000, taxa: 0.05, pct: 1.0 },
      { grupo: "AMIGOZ — GOV SP CELETISTA RCC", id: "AMIGOZ_GOVSPCELETISTA_RCC_500_100", label: "AMIGOZ GOV SP CELETISTA RCC TX 5,00 — 100%", code: "100%", fator: 0.0500000000, taxa: 0.05, pct: 1.0 },
      { grupo: "AMIGOZ — GOV SP RCC", id: "AMIGOZ_GOVSP_RCC_450_100", label: "AMIGOZ GOV SP RCC TX 4,50 — 100%", code: "100%", fator: 0.0450000000, taxa: 0.045, pct: 1.0 },
      { grupo: "AMIGOZ — GOV SP RCC", id: "AMIGOZ_GOVSP_RCC_398_85", label: "AMIGOZ GOV SP RCC TX 3,98 — 85%", code: "85%", fator: 0.0468235294, taxa: 0.0398, pct: 0.85 },
      { grupo: "AMIGOZ — GOV SP RCC", id: "AMIGOZ_GOVSP_RCC_375_55", label: "AMIGOZ GOV SP RCC TX 3,75 — 55%", code: "55%", fator: 0.0681818182, taxa: 0.0375, pct: 0.55 },
      { grupo: "AMIGOZ — GOV SP RCC", id: "AMIGOZ_GOVSP_RCC_350_35", label: "AMIGOZ GOV SP RCC TX 3,50 — 35%", code: "35%", fator: 0.1000000000, taxa: 0.035, pct: 0.35 },
      { grupo: "AMIGOZ — GOV SP RCC", id: "AMIGOZ_GOVSP_RCC_325_12", label: "AMIGOZ GOV SP RCC TX 3,25 — 12%", code: "12%", fator: 0.2708333333, taxa: 0.0325, pct: 0.12 },
      { grupo: "AMIGOZ — GOV ES RCC", id: "AMIGOZ_GOVES_RCC_350_35", label: "AMIGOZ GOV ES RCC TX 3,50 — 35%", code: "35%", fator: 0.1000000000, taxa: 0.035, pct: 0.35 },
      { grupo: "AMIGOZ — GOV ES RCC", id: "AMIGOZ_GOVES_RCC_246_12", label: "AMIGOZ GOV ES RCC TX 2,46 — 12%", code: "12%", fator: 0.2050000000, taxa: 0.0246, pct: 0.12 },
      { grupo: "AMIGOZ — GOV PI RMC", id: "AMIGOZ_GOVPI_RMC_479_80", label: "AMIGOZ GOV PI RMC TX 4,79 — 80%", code: "80%", fator: 0.0598750000, taxa: 0.0479, pct: 0.8 },
      { grupo: "AMIGOZ — GOV PI RCC", id: "AMIGOZ_GOVPI_RCC_479_80", label: "AMIGOZ GOV PI RCC TX 4,79 — 80%", code: "80%", fator: 0.0598750000, taxa: 0.0479, pct: 0.8 },
      { grupo: "NEO — GOV SP RCC", id: "NEO_GOVSP_RCC_399_100", label: "NEO GOV SP RCC TX 3,99 — 100%", code: "100%", fator: 0.0399000000, taxa: 0.039900000000000005, pct: 1.0 },
      { grupo: "NEO — GOV SP RCC", id: "NEO_GOVSP_RCC_379_80", label: "NEO GOV SP RCC TX 3,79 — 80%", code: "80%", fator: 0.0473750000, taxa: 0.0379, pct: 0.8 },
      { grupo: "NEO — GOV SP RCC", id: "NEO_GOVSP_RCC_359_65", label: "NEO GOV SP RCC TX 3,59 — 65%", code: "65%", fator: 0.0552307692, taxa: 0.0359, pct: 0.65 },
      { grupo: "NEO — GOV SP RCC", id: "NEO_GOVSP_RCC_339_50", label: "NEO GOV SP RCC TX 3,39 — 50%", code: "50%", fator: 0.0678000000, taxa: 0.0339, pct: 0.5 },
      { grupo: "NEO — GOV SP RCC", id: "NEO_GOVSP_RCC_319_30", label: "NEO GOV SP RCC TX 3,19 — 30%", code: "30%", fator: 0.1063333333, taxa: 0.0319, pct: 0.3 },
      { grupo: "NEO — GOV SP RCC", id: "NEO_GOVSP_RCC_299_12", label: "NEO GOV SP RCC TX 2,99 — 12%", code: "12%", fator: 0.2491666667, taxa: 0.029900000000000003, pct: 0.12 },
      { grupo: "NEO — GOV PR RCC", id: "NEO_GOVPR_RCC_399_100", label: "NEO GOV PR RCC TX 3,99 — 100%", code: "100%", fator: 0.0399000000, taxa: 0.039900000000000005, pct: 1.0 },
      { grupo: "NEO — GOV PR RCC", id: "NEO_GOVPR_RCC_379_80", label: "NEO GOV PR RCC TX 3,79 — 80%", code: "80%", fator: 0.0473750000, taxa: 0.0379, pct: 0.8 },
      { grupo: "NEO — GOV PR RCC", id: "NEO_GOVPR_RCC_359_65", label: "NEO GOV PR RCC TX 3,59 — 65%", code: "65%", fator: 0.0552307692, taxa: 0.0359, pct: 0.65 },
      { grupo: "NEO — GOV PR RCC", id: "NEO_GOVPR_RCC_339_50", label: "NEO GOV PR RCC TX 3,39 — 50%", code: "50%", fator: 0.0678000000, taxa: 0.0339, pct: 0.5 },
      { grupo: "NEO — GOV PR RCC", id: "NEO_GOVPR_RCC_319_30", label: "NEO GOV PR RCC TX 3,19 — 30%", code: "30%", fator: 0.1063333333, taxa: 0.0319, pct: 0.3 },
      { grupo: "NEO — GOV PR RCC", id: "NEO_GOVPR_RCC_299_12", label: "NEO GOV PR RCC TX 2,99 — 12%", code: "12%", fator: 0.2491666667, taxa: 0.029900000000000003, pct: 0.12 },
      { grupo: "NEO — PREF SP RCC", id: "NEO_PREFSP_RCC_419_83", label: "NEO PREF SP RCC TX 4,19 — 83%", code: "83%", fator: 0.0504819277, taxa: 0.04190000000000001, pct: 0.83 },
      { grupo: "NEO — PREF SP RCC", id: "NEO_PREFSP_RCC_399_73", label: "NEO PREF SP RCC TX 3,99 — 73%", code: "73%", fator: 0.0546575342, taxa: 0.039900000000000005, pct: 0.73 },
      { grupo: "NEO — PREF SP RCC", id: "NEO_PREFSP_RCC_379_63", label: "NEO PREF SP RCC TX 3,79 — 63%", code: "63%", fator: 0.0601587302, taxa: 0.0379, pct: 0.63 },
      { grupo: "NEO — PREF SP RCC", id: "NEO_PREFSP_RCC_359_53", label: "NEO PREF SP RCC TX 3,59 — 53%", code: "53%", fator: 0.0677358491, taxa: 0.0359, pct: 0.53 },
      { grupo: "NEO — PREF SP RCC", id: "NEO_PREFSP_RCC_339_43", label: "NEO PREF SP RCC TX 3,39 — 43%", code: "43%", fator: 0.0788372093, taxa: 0.0339, pct: 0.43 },
      { grupo: "NEO — PREF SP RCC", id: "NEO_PREFSP_RCC_319_23", label: "NEO PREF SP RCC TX 3,19 — 23%", code: "23%", fator: 0.1386956522, taxa: 0.0319, pct: 0.23 },
      { grupo: "NEO — PREF SP RCC", id: "NEO_PREFSP_RCC_299_12", label: "NEO PREF SP RCC TX 2,99 — 12%", code: "12%", fator: 0.2491666667, taxa: 0.029900000000000003, pct: 0.12 },
      { grupo: "NEO — GOV MA RCC", id: "NEO_GOVMA_RCC_419_83", label: "NEO GOV MA RCC TX 4,19 — 83%", code: "83%", fator: 0.0504819277, taxa: 0.04190000000000001, pct: 0.83 },
      { grupo: "NEO — GOV MA RCC", id: "NEO_GOVMA_RCC_399_73", label: "NEO GOV MA RCC TX 3,99 — 73%", code: "73%", fator: 0.0546575342, taxa: 0.039900000000000005, pct: 0.73 },
      { grupo: "NEO — GOV MA RCC", id: "NEO_GOVMA_RCC_379_63", label: "NEO GOV MA RCC TX 3,79 — 63%", code: "63%", fator: 0.0601587302, taxa: 0.0379, pct: 0.63 },
      { grupo: "NEO — GOV MA RCC", id: "NEO_GOVMA_RCC_359_53", label: "NEO GOV MA RCC TX 3,59 — 53%", code: "53%", fator: 0.0677358491, taxa: 0.0359, pct: 0.53 },
      { grupo: "NEO — GOV MA RCC", id: "NEO_GOVMA_RCC_339_43", label: "NEO GOV MA RCC TX 3,39 — 43%", code: "43%", fator: 0.0788372093, taxa: 0.0339, pct: 0.43 },
      { grupo: "NEO — GOV MA RCC", id: "NEO_GOVMA_RCC_319_23", label: "NEO GOV MA RCC TX 3,19 — 23%", code: "23%", fator: 0.1386956522, taxa: 0.0319, pct: 0.23 },
      { grupo: "NEO — GOV MA RCC", id: "NEO_GOVMA_RCC_299_12", label: "NEO GOV MA RCC TX 2,99 — 12%", code: "12%", fator: 0.2491666667, taxa: 0.029900000000000003, pct: 0.12 },
      { grupo: "NEO — GOV MA RMC", id: "NEO_GOVMA_RMC_419_83", label: "NEO GOV MA RMC TX 4,19 — 83%", code: "83%", fator: 0.0504819277, taxa: 0.04190000000000001, pct: 0.83 },
      { grupo: "NEO — GOV MA RMC", id: "NEO_GOVMA_RMC_399_73", label: "NEO GOV MA RMC TX 3,99 — 73%", code: "73%", fator: 0.0546575342, taxa: 0.039900000000000005, pct: 0.73 },
      { grupo: "NEO — GOV MA RMC", id: "NEO_GOVMA_RMC_379_63", label: "NEO GOV MA RMC TX 3,79 — 63%", code: "63%", fator: 0.0601587302, taxa: 0.0379, pct: 0.63 },
      { grupo: "NEO — GOV MA RMC", id: "NEO_GOVMA_RMC_359_53", label: "NEO GOV MA RMC TX 3,59 — 53%", code: "53%", fator: 0.0677358491, taxa: 0.0359, pct: 0.53 },
      { grupo: "NEO — GOV MA RMC", id: "NEO_GOVMA_RMC_339_43", label: "NEO GOV MA RMC TX 3,39 — 43%", code: "43%", fator: 0.0788372093, taxa: 0.0339, pct: 0.43 },
      { grupo: "NEO — GOV MA RMC", id: "NEO_GOVMA_RMC_319_23", label: "NEO GOV MA RMC TX 3,19 — 23%", code: "23%", fator: 0.1386956522, taxa: 0.0319, pct: 0.23 },
      { grupo: "NEO — GOV MA RMC", id: "NEO_GOVMA_RMC_299_12", label: "NEO GOV MA RMC TX 2,99 — 12%", code: "12%", fator: 0.2491666667, taxa: 0.029900000000000003, pct: 0.12 },
      { grupo: "NEO — PREF SP RMC", id: "NEO_PREFSP_RMC_419_83", label: "NEO PREF SP RMC TX 4,19 — 83%", code: "83%", fator: 0.0504819277, taxa: 0.04190000000000001, pct: 0.83 },
      { grupo: "NEO — PREF SP RMC", id: "NEO_PREFSP_RMC_399_73", label: "NEO PREF SP RMC TX 3,99 — 73%", code: "73%", fator: 0.0546575342, taxa: 0.039900000000000005, pct: 0.73 },
      { grupo: "NEO — PREF SP RMC", id: "NEO_PREFSP_RMC_379_63", label: "NEO PREF SP RMC TX 3,79 — 63%", code: "63%", fator: 0.0601587302, taxa: 0.0379, pct: 0.63 },
      { grupo: "NEO — PREF SP RMC", id: "NEO_PREFSP_RMC_359_53", label: "NEO PREF SP RMC TX 3,59 — 53%", code: "53%", fator: 0.0677358491, taxa: 0.0359, pct: 0.53 },
      { grupo: "NEO — PREF SP RMC", id: "NEO_PREFSP_RMC_339_43", label: "NEO PREF SP RMC TX 3,39 — 43%", code: "43%", fator: 0.0788372093, taxa: 0.0339, pct: 0.43 },
      { grupo: "NEO — PREF SP RMC", id: "NEO_PREFSP_RMC_319_23", label: "NEO PREF SP RMC TX 3,19 — 23%", code: "23%", fator: 0.1386956522, taxa: 0.0319, pct: 0.23 },
      { grupo: "NEO — PREF SP RMC", id: "NEO_PREFSP_RMC_299_12", label: "NEO PREF SP RMC TX 2,99 — 12%", code: "12%", fator: 0.2491666667, taxa: 0.029900000000000003, pct: 0.12 },
      { grupo: "AKI — PREF RJ RCC", id: "AKI_PREFRJ_RCC_P5_30", label: "AKI PREF RJ RCC P5 — 30%", code: "30%", fator: 0.1499666667, taxa: 0.04499, pct: 0.3 },
      { grupo: "AKI — SIAPE RCC", id: "AKI_SIAPE_RCC_F12_70", label: "AKI SIAPE RCC F12 — 70%", code: "70%", fator: 0.0642714286, taxa: 0.04499, pct: 0.7 },
      { grupo: "AKI — SIAPE RCC", id: "AKI_SIAPE_RCC_F13_60", label: "AKI SIAPE RCC F13 — 60%", code: "60%", fator: 0.0749833333, taxa: 0.04499, pct: 0.6 },
      { grupo: "AKI — SIAPE RCC", id: "AKI_SIAPE_RCC_F14_50", label: "AKI SIAPE RCC F14 — 50%", code: "50%", fator: 0.0899800000, taxa: 0.04499, pct: 0.5 },
      { grupo: "AKI — SIAPE RCC", id: "AKI_SIAPE_RCC_F15_45", label: "AKI SIAPE RCC F15 — 45%", code: "45%", fator: 0.0999777778, taxa: 0.04499, pct: 0.45 },
      { grupo: "AKI — SIAPE RCC", id: "AKI_SIAPE_RCC_F16_35", label: "AKI SIAPE RCC F16 — 35%", code: "35%", fator: 0.1285428571, taxa: 0.04499, pct: 0.35 },
      { grupo: "AKI — SIAPE RMC", id: "AKI_SIAPE_RMC_F11_88", label: "AKI SIAPE RMC F11 — 88%", code: "88%", fator: 0.0511250000, taxa: 0.04499, pct: 0.88 },
      { grupo: "AKI — SIAPE RMC", id: "AKI_SIAPE_RMC_F12_70", label: "AKI SIAPE RMC F12 — 70%", code: "70%", fator: 0.0642714286, taxa: 0.04499, pct: 0.7 },
      { grupo: "AKI — SIAPE RMC", id: "AKI_SIAPE_RMC_F13_60", label: "AKI SIAPE RMC F13 — 60%", code: "60%", fator: 0.0749833333, taxa: 0.04499, pct: 0.6 },
      { grupo: "AKI — SIAPE RMC", id: "AKI_SIAPE_RMC_F14_50", label: "AKI SIAPE RMC F14 — 50%", code: "50%", fator: 0.0899800000, taxa: 0.04499, pct: 0.5 },
      { grupo: "AKI — SIAPE RMC", id: "AKI_SIAPE_RMC_F15_45", label: "AKI SIAPE RMC F15 — 45%", code: "45%", fator: 0.0999777778, taxa: 0.04499, pct: 0.45 },
      { grupo: "AKI — SIAPE RMC", id: "AKI_SIAPE_RMC_F16_35", label: "AKI SIAPE RMC F16 — 35%", code: "35%", fator: 0.1285428571, taxa: 0.04499, pct: 0.35 }
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

    this.fillSelect(tabelaEl, '');

    // Listener unificado
    [tabelaEl, parcelaEl, margemEl].forEach(el => {
      el?.addEventListener('input', () => this.render());
      el?.addEventListener('change', () => this.render());
    });

    this.render();
  }
};