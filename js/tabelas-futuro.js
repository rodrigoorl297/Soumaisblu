/**
 * tabelas-futuro — tabelas FUTURO (TABELAS 2.xlsx + COMISSAO_SIAPE_20260901).
 * Atualiza o select de tabela da proposta (pct do valor final) e o simulador.
 */
(function () {
  var GROUPS = [
  {
    "group": "FUTURO — GOV PR RCC 96X",
    "items": [
      {
        "value": "FUTURO_GOVPR_RCC_96X_CB_385_85",
        "label": "FUTURO GOV PR RCC 96X TX 3,85 — 85%",
        "pct": 0.85
      },
      {
        "value": "FUTURO_GOVPR_RCC_96X_CB_380_85",
        "label": "FUTURO GOV PR RCC 96X TX 3,80 — 85%",
        "pct": 0.85
      },
      {
        "value": "FUTURO_GOVPR_RCC_96X_CB_349_70",
        "label": "FUTURO GOV PR RCC 96X TX 3,49 — 70%",
        "pct": 0.7
      },
      {
        "value": "FUTURO_GOVPR_RCC_96X_CB_325_60",
        "label": "FUTURO GOV PR RCC 96X TX 3,25 — 60%",
        "pct": 0.6
      },
      {
        "value": "FUTURO_GOVPR_RCC_96X_CB_330_45",
        "label": "FUTURO GOV PR RCC 96X TX 3,30 — 45%",
        "pct": 0.45
      },
      {
        "value": "FUTURO_GOVPR_RCC_96X_CB_285_34",
        "label": "FUTURO GOV PR RCC 96X TX 2,85 — 34%",
        "pct": 0.34
      },
      {
        "value": "FUTURO_GOVPR_RCC_96X_CB_250_28",
        "label": "FUTURO GOV PR RCC 96X TX 2,50 — 28%",
        "pct": 0.28
      },
      {
        "value": "FUTURO_GOVPR_RCC_96X_CB_240_10",
        "label": "FUTURO GOV PR RCC 96X TX 2,40 — 10%",
        "pct": 0.1
      }
    ]
  },
  {
    "group": "FUTURO — GOV RO RMC 96X",
    "items": [
      {
        "value": "FUTURO_GOVRO_RMC_96X_CB_35_100",
        "label": "FUTURO GOV RO RMC 96X TX 3,5 — 100%",
        "pct": 1.0
      },
      {
        "value": "FUTURO_GOVRO_RMC_96X_CB_33_80",
        "label": "FUTURO GOV RO RMC 96X TX 3,3 — 80%",
        "pct": 0.8
      },
      {
        "value": "FUTURO_GOVRO_RMC_96X_CLT_35_80",
        "label": "FUTURO GOV RO CLT RMC 96X TX 3,5 — 80%",
        "pct": 0.8
      },
      {
        "value": "FUTURO_GOVRO_RMC_96X_CLT_35_65",
        "label": "FUTURO GOV RO CLT RMC 96X TX 3,5 — 65%",
        "pct": 0.65
      },
      {
        "value": "FUTURO_GOVRO_RMC_96X_SENIOR_35_80",
        "label": "FUTURO GOV RO SENIOR RMC 96X TX 3,5 — 80%",
        "pct": 0.8
      },
      {
        "value": "FUTURO_GOVRO_RMC_96X_SENIOR_35_65",
        "label": "FUTURO GOV RO SENIOR RMC 96X TX 3,5 — 65%",
        "pct": 0.65
      }
    ]
  },
  {
    "group": "FUTURO — GOV SP RMC 96X",
    "items": [
      {
        "value": "FUTURO_GOVSP_RMC_96X_CLT_35_115",
        "label": "FUTURO GOV SP CLT RMC 96X TX 3,5 — 115%",
        "pct": 1.15
      },
      {
        "value": "FUTURO_GOVSP_RMC_96X_CLT_34_95",
        "label": "FUTURO GOV SP CLT RMC 96X TX 3,4 — 95%",
        "pct": 0.95
      },
      {
        "value": "FUTURO_GOVSP_RMC_96X_CLT_32_90",
        "label": "FUTURO GOV SP CLT RMC 96X TX 3,2 — 90%",
        "pct": 0.9
      },
      {
        "value": "FUTURO_GOVSP_RMC_96X_CLT_29_80",
        "label": "FUTURO GOV SP CLT RMC 96X TX 2,9 — 80%",
        "pct": 0.8
      },
      {
        "value": "FUTURO_GOVSP_RMC_96X_CLT_27_70",
        "label": "FUTURO GOV SP CLT RMC 96X TX 2,7 — 70%",
        "pct": 0.7
      },
      {
        "value": "FUTURO_GOVSP_RMC_96X_CLT_24_45",
        "label": "FUTURO GOV SP CLT RMC 96X TX 2,4 — 45%",
        "pct": 0.45
      }
    ]
  },
  {
    "group": "FUTURO — TJ SP RMC 96X",
    "items": [
      {
        "value": "FUTURO_TJSP_RMC_96X_CB_351_38",
        "label": "FUTURO TJ SP RMC 96X TX 3,51 — 38%",
        "pct": 0.38
      },
      {
        "value": "FUTURO_TJSP_RMC_96X_CB_344_32",
        "label": "FUTURO TJ SP RMC 96X TX 3,44 — 32%",
        "pct": 0.32
      },
      {
        "value": "FUTURO_TJSP_RMC_96X_CB_339_26",
        "label": "FUTURO TJ SP RMC 96X TX 3,39 — 26%",
        "pct": 0.26
      },
      {
        "value": "FUTURO_TJSP_RMC_96X_CB_33_12",
        "label": "FUTURO TJ SP RMC 96X TX 3,3 — 12%",
        "pct": 0.12
      }
    ]
  },
  {
    "group": "FUTURO — SIAPE EMP 117X",
    "items": [
      {
        "value": "FUTURO_SIAPE_EMP_117X_EMP_180_15",
        "label": "FUTURO SIAPE EMP 117X TX 1,80 — 15%",
        "pct": 0.15
      }
    ]
  },
  {
    "group": "FUTURO — SIAPE EMP 96X",
    "items": [
      {
        "value": "FUTURO_SIAPE_EMP_96X_EMP_180_12",
        "label": "FUTURO SIAPE EMP 96X TX 1,80 — 12%",
        "pct": 0.12
      }
    ]
  },
  {
    "group": "FUTURO — SIAPE CC-CB 96X",
    "items": [
      {
        "value": "FUTURO_SIAPE_CCCB_96X_NCDT_419_30",
        "label": "FUTURO SIAPE CC-CB 96X NCDT TX 4,19 — 30%",
        "pct": 0.3,
        "taxa": 0.0419,
        "tabela": "NCDT_096-419_428248",
        "coeficiente": 0.0428248884
      },
      {
        "value": "FUTURO_SIAPE_CCCB_96X_NCDT_399_27",
        "label": "FUTURO SIAPE CC-CB 96X NCDT TX 3,99 — 27%",
        "pct": 0.27,
        "taxa": 0.0399,
        "tabela": "NCDT_096-399_409485",
        "coeficiente": 0.0409485002
      },
      {
        "value": "FUTURO_SIAPE_CCCB_96X_NCDT_379_24",
        "label": "FUTURO SIAPE CC-CB 96X NCDT TX 3,79 — 24%",
        "pct": 0.24,
        "taxa": 0.0379,
        "tabela": "NCDT_096-379_390892",
        "coeficiente": 0.0390892083
      },
      {
        "value": "FUTURO_SIAPE_CCCB_96X_NCDT_359_18",
        "label": "FUTURO SIAPE CC-CB 96X NCDT TX 3,59 — 18%",
        "pct": 0.18,
        "taxa": 0.0359,
        "tabela": "NCDT_096-359_372490",
        "coeficiente": 0.0372490466
      },
      {
        "value": "FUTURO_SIAPE_CCCB_96X_NCDT_339_15",
        "label": "FUTURO SIAPE CC-CB 96X NCDT TX 3,39 — 15%",
        "pct": 0.15,
        "taxa": 0.0339,
        "tabela": "NCDT_096-339_354302",
        "coeficiente": 0.0354302175
      },
      {
        "value": "FUTURO_SIAPE_CCCB_96X_NCDT_319_9",
        "label": "FUTURO SIAPE CC-CB 96X NCDT TX 3,19 — 9%",
        "pct": 0.09,
        "taxa": 0.0319,
        "tabela": "NCDT_096-319_336350",
        "coeficiente": 0.03363509
      },
      {
        "value": "FUTURO_SIAPE_CCCB_96X_NCDT_309_6",
        "label": "FUTURO SIAPE CC-CB 96X NCDT TX 3,09 — 6%",
        "pct": 0.06,
        "taxa": 0.0309,
        "tabela": "NCDT_096-309_327471",
        "coeficiente": 0.0327471987
      },
      {
        "value": "FUTURO_SIAPE_CCCB_96X_NCDT_299_3",
        "label": "FUTURO SIAPE CC-CB 96X NCDT TX 2,99 — 3%",
        "pct": 0.03,
        "taxa": 0.0299,
        "tabela": "NCDT_096-299_318661",
        "coeficiente": 0.0318661932
      }
    ]
  },
  {
    "group": "FUTURO — GOV AM RCC 96X",
    "items": [
      {
        "value": "FUTURO_GOVAM_RCC_96X_CB_390_85",
        "label": "FUTURO GOV AM RCC 96X TX 3,90 — 85%",
        "pct": 0.85
      },
      {
        "value": "FUTURO_GOVAM_RCC_96X_CB_360_70",
        "label": "FUTURO GOV AM RCC 96X TX 3,60 — 70%",
        "pct": 0.7
      },
      {
        "value": "FUTURO_GOVAM_RCC_96X_CB_330_60",
        "label": "FUTURO GOV AM RCC 96X TX 3,30 — 60%",
        "pct": 0.6
      },
      {
        "value": "FUTURO_GOVAM_RCC_96X_CB_300_50",
        "label": "FUTURO GOV AM RCC 96X TX 3,00 — 50%",
        "pct": 0.5
      }
    ]
  },
  {
    "group": "FUTURO — GOV AM RMC 96X",
    "items": [
      {
        "value": "FUTURO_GOVAM_RMC_96X_CC_390_85",
        "label": "FUTURO GOV AM CC RMC 96X TX 3,90 — 85%",
        "pct": 0.85
      },
      {
        "value": "FUTURO_GOVAM_RMC_96X_CC_360_70",
        "label": "FUTURO GOV AM CC RMC 96X TX 3,60 — 70%",
        "pct": 0.7
      },
      {
        "value": "FUTURO_GOVAM_RMC_96X_CC_330_60",
        "label": "FUTURO GOV AM CC RMC 96X TX 3,30 — 60%",
        "pct": 0.6
      },
      {
        "value": "FUTURO_GOVAM_RMC_96X_CC_300_50",
        "label": "FUTURO GOV AM CC RMC 96X TX 3,00 — 50%",
        "pct": 0.5
      }
    ]
  },
  {
    "group": "FUTURO — EXERCITO EMP 96X",
    "items": [
      {
        "value": "FUTURO_EXERCITO_EMP_96X_EMP_203_14",
        "label": "FUTURO EXERCITO EMP 96X TX 2,03 — 14%",
        "pct": 0.14
      },
      {
        "value": "FUTURO_EXERCITO_EMP_96X_EMP_190_12",
        "label": "FUTURO EXERCITO EMP 96X TX 1,90 — 12%",
        "pct": 0.12
      }
    ]
  },
  {
    "group": "FUTURO — AERONAUTICA EMP 96X",
    "items": [
      {
        "value": "FUTURO_AERONAUTICA_EMP_96X_EMP_203_14",
        "label": "FUTURO AERONAUTICA EMP 96X TX 2,03 — 14%",
        "pct": 0.14
      },
      {
        "value": "FUTURO_AERONAUTICA_EMP_96X_EMP_190_12",
        "label": "FUTURO AERONAUTICA EMP 96X TX 1,90 — 12%",
        "pct": 0.12
      }
    ]
  }
];

  /**
   * apply — troca os grupos FUTURO no catálogo da proposta e recarrega os selects.
   */
  function apply(P) {
    if (!P || P.__futuroTab3) return !!P;
    P.__futuroTab3 = true;
    var cur = Array.isArray(P._TABELA_GROUPS) ? P._TABELA_GROUPS.slice() : [];
    cur = cur.filter(function (g) {
      return String(g.group || '').indexOf('FUTURO —') !== 0;
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
    // Simulador de troco: coeficiente do PDF SIAPE (parcela / fator = saldo).
    var S = window.SimulacaoTroco;
    if (S && Array.isArray(S.TABELAS)) {
      var seen = {};
      S.TABELAS.forEach(function (t) { seen[t.id] = true; });
      GROUPS.forEach(function (g) {
        (g.items || []).forEach(function (i) {
          if (seen[i.value] || i.coeficiente == null) return;
          S.TABELAS.push({
            grupo: g.group,
            id: i.value,
            label: i.label,
            code: Math.round(i.pct * 100) + '%',
            fator: i.coeficiente,
            taxa: i.taxa != null ? i.taxa : i.pct,
            pct: i.pct
          });
          seen[i.value] = true;
        });
      });
    }
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
