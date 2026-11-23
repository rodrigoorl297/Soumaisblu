/**
 * tabelas-fitech — catálogo FITECH DO CORBAN (INSS) + tabelas banco sem %.
 * pct = comissão sobre o valor bruto; 0 = sem comissão (valor final manual).
 */
(function () {
  var GROUPS = [
    {
      group: 'FITECH — INSS PORT',
      items: [
        { value: 'FITECH_INSS_PORT_PORTPURA_185_10', label: 'FITECH INSS PORT PORTPURA TX 1,85 — 10%', pct: 0.10 },
        { value: 'FITECH_INSS_PORT_REFINPORT_185_19', label: 'FITECH INSS PORT REFINPORT TX 1,85 — 19%', pct: 0.19 },
        { value: 'FITECH_INSS_PORT_REFINPORT_180_15', label: 'FITECH INSS PORT REFINPORT TX 1,80 — 15%', pct: 0.15 },
        { value: 'FITECH_INSS_PORT_REFINPORT_175_13', label: 'FITECH INSS PORT REFINPORT TX 1,75 — 13%', pct: 0.13 },
        { value: 'FITECH_INSS_PORT_REFINPORTESP2_175_9', label: 'FITECH INSS PORT REFINPORTESP2 TX 1,75 — 9%', pct: 0.09 },
        { value: 'FITECH_INSS_PORT_REFINPORT_185_13', label: 'FITECH INSS PORT REFINPORT TX 1,85 — 13%', pct: 0.13 },
        { value: 'FITECH_INSS_PORT_REFIN90_185_24', label: 'FITECH INSS PORT REFIN 90DIAS TX 1,85 — 24%', pct: 0.24 }
      ]
    },
    {
      group: 'FITECH — INSS NOVO',
      items: [
        { value: 'FITECH_INSS_NOVO_20MIL_108_185_38', label: 'FITECH INSS NOVO 20MIL 108 TX 1,85 — 38%', pct: 0.38 },
        { value: 'FITECH_INSS_NOVO_20MIL_96_185_35', label: 'FITECH INSS NOVO 20MIL 96 TX 1,85 — 35%', pct: 0.35 },
        { value: 'FITECH_INSS_NOVO_20MIL_84_185_16', label: 'FITECH INSS NOVO 20MIL 84 TX 1,85 — 16%', pct: 0.16 },
        { value: 'FITECH_INSS_NOVO_20MIL_90_108_185_41', label: 'FITECH INSS NOVO 20MIL 90DIAS 108 TX 1,85 — 41%', pct: 0.41 },
        { value: 'FITECH_INSS_NOVO_20MIL_90_96_185_35', label: 'FITECH INSS NOVO 20MIL 90DIAS 96 TX 1,85 — 35%', pct: 0.35 },
        { value: 'FITECH_INSS_NOVO_20MIL_84_90_185_16', label: 'FITECH INSS NOVO 20MIL 84 90DIAS TX 1,85 — 16%', pct: 0.16 },
        { value: 'FITECH_INSS_NOVO_108_185_38', label: 'FITECH INSS NOVO 108 TX 1,85 — 38%', pct: 0.38 },
        { value: 'FITECH_INSS_NOVO_96_185_35', label: 'FITECH INSS NOVO 96 TX 1,85 — 35%', pct: 0.35 },
        { value: 'FITECH_INSS_NOVO_84_185_16', label: 'FITECH INSS NOVO 84 TX 1,85 — 16%', pct: 0.16 },
        { value: 'FITECH_INSS_NOVO_90_108_185_38', label: 'FITECH INSS NOVO 90DIAS 108 TX 1,85 — 38%', pct: 0.38 },
        { value: 'FITECH_INSS_NOVO_96_90_185_35', label: 'FITECH INSS NOVO 96 90DIAS TX 1,85 — 35%', pct: 0.35 },
        { value: 'FITECH_INSS_NOVO_84_90_185_16', label: 'FITECH INSS NOVO 84 90DIAS TX 1,85 — 16%', pct: 0.16 }
      ]
    },
    {
      // Digitação banco — sem %; valor final fica manual (pct 0).
      group: 'BANCO — GOV SP CB (sem comissão)',
      items: [
        {
          value: 'CB_CP_GOV SP_LV_F1_CO_CCC',
          label: 'CB_CP_GOV SP_LV_F1_CO_CCC — sem comissão',
          pct: 0
        }
      ]
    }
  ];

  /**
   * apply — acrescenta FITECH + banco-extra no catálogo, sem tirar FUTURO/AMIGOZ.
   */
  function apply(P) {
    if (!P || P.__fitechTab3) return !!P;
    P.__fitechTab3 = true;
    var cur = Array.isArray(P._TABELA_GROUPS) ? P._TABELA_GROUPS.slice() : [];
    cur = cur.filter(function (g) {
      var name = String(g.group || '');
      if (name.indexOf('FITECH —') === 0) return false;
      if (name.indexOf('BANCO — GOV SP CB') === 0) return false;
      return true;
    });
    P._TABELA_GROUPS = cur.concat(GROUPS);
    P._tabelaPct = P._tabelaPct || {};
    GROUPS.forEach(function (g) {
      (g.items || []).forEach(function (i) {
        P._tabelaPct[i.value] = i.pct;
      });
    });
    ['propTabela', 'managePropTabela', 'empPropTabela'].forEach(function (id) {
      if (typeof P._fillTabelaSelect === 'function') P._fillTabelaSelect(id);
    });
    return true;
  }

  function boot() { return apply(window.Proposals); }
  if (!boot()) {
    document.addEventListener('DOMContentLoaded', boot);
    window.addEventListener('load', boot);
    var n = 0;
    var t = setInterval(function () {
      n += 1;
      if (boot() || n > 40) clearInterval(t);
    }, 250);
  }
})();
