/**
 * tabelas-compra-divida — catálogo Banco → Convênio → Tabela da esteira Compra de Dívida.
 * Fonte: planilha ESTEIRA DE CRÉDITO / COMPRA DE DÍVIDA (produtos, bancos portados, tabelas).
 */
(function () {
  'use strict';

  const BANCOS = ['BMG', '3RN', 'C6 BANK', 'MERCANTIL', 'BTW', 'FITECH DO CORBAN'];

  const PRODUTOS = [
    'NOVO',
    'CNC REFIN',
    'SEGURO',
    'CNC',
    'REFIN',
    'REFIN PORT',
    'SAQUE COMPL',
    'CARTÃO',
    'RECONQUISTA',
    'COBRANÇA',
    'CREDITO PESSOAL',
    'CREDITO TRABALHADOR',
  ];

  const CONVENIOS = ['INSS', 'GOV', 'CLT', 'GERAL', 'CARTAO'];

  const SITUACOES = ['PENSIONISTA', 'APOSENTADO', 'ATIVO', 'OUTROS'];

  const BANCOS_PORTADOS = [
    { codigo: '001', nome: 'BANCO DO BRASIL' },
    { codigo: '033', nome: 'SANTANDER' },
    { codigo: '029', nome: 'ITAU CONSIGNADO' },
    { codigo: '341', nome: 'ITAU' },
    { codigo: '237', nome: 'BRADESCO' },
    { codigo: '121', nome: 'Agibank' },
    { codigo: '707', nome: 'Daycoval' },
    { codigo: '041', nome: 'Banrisul' },
    { codigo: '389', nome: 'Mercantil' },
    { codigo: '318', nome: 'BMG' },
    { codigo: '355', nome: 'Digio' },
    { codigo: '149', nome: 'Facta' },
    { codigo: '104', nome: 'Caixa Econômica' },
    { codigo: '623', nome: 'Pan' },
    { codigo: '626', nome: 'Banco C6' },
    { codigo: '069', nome: 'Crefisa' },
    { codigo: '422', nome: 'Safra' },
    { codigo: '012', nome: 'Imbursa' },
  ];

  /** Tabelas: banco + convenio → value/label/pct (amostra da planilha). */
  const TABELAS = [
    { banco: 'BMG', convenio: 'INSS', value: 'BMG_CNC_18_10', label: 'BMG CNC 18 — 10%', pct: 0.10 },
    { banco: 'BMG', convenio: 'INSS', value: 'BMG_NOVO_108_8', label: 'BMG NOVO 108 — 8%', pct: 0.08 },
    { banco: 'BMG', convenio: 'INSS', value: 'BMG_NOVO_96_7', label: 'BMG NOVO 96 — 7%', pct: 0.07 },
    { banco: 'BMG', convenio: 'GOV', value: 'BMG_SAQUE_SP_70', label: 'BMG SAQUE SP — 70%', pct: 0.70 },
    { banco: 'BMG', convenio: 'CLT', value: 'BMG_CLT_NOVO_12', label: 'BMG CLT NOVO — 12%', pct: 0.12 },
    { banco: '3RN', convenio: 'INSS', value: '3RN_NOVO_108_9', label: '3RN NOVO 108 — 9%', pct: 0.09 },
    { banco: '3RN', convenio: 'INSS', value: '3RN_REFIN_18_11', label: '3RN REFIN 18 — 11%', pct: 0.11 },
    { banco: 'C6 BANK', convenio: 'INSS', value: 'C6_PORTREFIN_178_18', label: 'C6 PORT REFIN 1,78 — 18%', pct: 0.18 },
    { banco: 'C6 BANK', convenio: 'INSS', value: 'C6_NOVO_60D_108_185_12', label: 'C6 NOVO 60D 108 1,85 — 12%', pct: 0.12 },
    { banco: 'C6 BANK', convenio: 'INSS', value: 'C6_NOVO_108_185_14', label: 'C6 NOVO 108 1,85 — 14%', pct: 0.14 },
    { banco: 'C6 BANK', convenio: 'GOV', value: 'C6_GOV_NOVO_10', label: 'C6 GOV NOVO — 10%', pct: 0.10 },
    { banco: 'MERCANTIL', convenio: 'INSS', value: 'MERCANTIL_CP_12_SEGURO_12', label: 'MERCANTIL CP 12 SEGURO — 12%', pct: 0.12 },
    { banco: 'MERCANTIL', convenio: 'INSS', value: 'MERCANTIL_NOVO_108_10', label: 'MERCANTIL NOVO 108 — 10%', pct: 0.10 },
    { banco: 'MERCANTIL', convenio: 'CLT', value: 'MERCANTIL_CLT_15', label: 'MERCANTIL CLT — 15%', pct: 0.15 },
    { banco: 'BTW', convenio: 'INSS', value: 'BTW_NOVO_SEGURO_10', label: 'BTW NOVO SEGURO — 10%', pct: 0.10 },
    { banco: 'BTW', convenio: 'GERAL', value: 'BTW_GERAL_8', label: 'BTW GERAL — 8%', pct: 0.08 },
    // FITECH DO CORBAN — INSS PORT (planilha)
    { banco: 'FITECH DO CORBAN', convenio: 'INSS', value: 'FITECH_INSS_PORT_PORTPURA_185_10', label: 'FITECH PORTPURA TX 1,85 — 10%', pct: 0.10 },
    { banco: 'FITECH DO CORBAN', convenio: 'INSS', value: 'FITECH_INSS_PORT_REFINPORT_185_19', label: 'FITECH REFINPORT TX 1,85 — 19%', pct: 0.19 },
    { banco: 'FITECH DO CORBAN', convenio: 'INSS', value: 'FITECH_INSS_PORT_REFINPORT_180_15', label: 'FITECH REFINPORT TX 1,80 — 15%', pct: 0.15 },
    { banco: 'FITECH DO CORBAN', convenio: 'INSS', value: 'FITECH_INSS_PORT_REFINPORT_175_13', label: 'FITECH REFINPORT TX 1,75 — 13%', pct: 0.13 },
    { banco: 'FITECH DO CORBAN', convenio: 'INSS', value: 'FITECH_INSS_PORT_REFINPORTESP2_175_9', label: 'FITECH REFINPORTESP2 TX 1,75 — 9%', pct: 0.09 },
    { banco: 'FITECH DO CORBAN', convenio: 'INSS', value: 'FITECH_INSS_PORT_REFINPORT_185_13', label: 'FITECH REFINPORT TX 1,85 — 13%', pct: 0.13 },
    { banco: 'FITECH DO CORBAN', convenio: 'INSS', value: 'FITECH_INSS_PORT_REFIN90_185_24', label: 'FITECH REFIN 90DIAS TX 1,85 — 24%', pct: 0.24 },
    // FITECH DO CORBAN — INSS NOVO
    { banco: 'FITECH DO CORBAN', convenio: 'INSS', value: 'FITECH_INSS_NOVO_20MIL_108_185_38', label: 'FITECH NOVO 20MIL 108 TX 1,85 — 38%', pct: 0.38 },
    { banco: 'FITECH DO CORBAN', convenio: 'INSS', value: 'FITECH_INSS_NOVO_20MIL_96_185_35', label: 'FITECH NOVO 20MIL 96 TX 1,85 — 35%', pct: 0.35 },
    { banco: 'FITECH DO CORBAN', convenio: 'INSS', value: 'FITECH_INSS_NOVO_20MIL_84_185_16', label: 'FITECH NOVO 20MIL 84 TX 1,85 — 16%', pct: 0.16 },
    { banco: 'FITECH DO CORBAN', convenio: 'INSS', value: 'FITECH_INSS_NOVO_20MIL_90_108_185_41', label: 'FITECH NOVO 20MIL 90DIAS 108 TX 1,85 — 41%', pct: 0.41 },
    { banco: 'FITECH DO CORBAN', convenio: 'INSS', value: 'FITECH_INSS_NOVO_20MIL_90_96_185_35', label: 'FITECH NOVO 20MIL 90DIAS 96 TX 1,85 — 35%', pct: 0.35 },
    { banco: 'FITECH DO CORBAN', convenio: 'INSS', value: 'FITECH_INSS_NOVO_20MIL_84_90_185_16', label: 'FITECH NOVO 20MIL 84 90DIAS TX 1,85 — 16%', pct: 0.16 },
    { banco: 'FITECH DO CORBAN', convenio: 'INSS', value: 'FITECH_INSS_NOVO_108_185_38', label: 'FITECH NOVO 108 TX 1,85 — 38%', pct: 0.38 },
    { banco: 'FITECH DO CORBAN', convenio: 'INSS', value: 'FITECH_INSS_NOVO_96_185_35', label: 'FITECH NOVO 96 TX 1,85 — 35%', pct: 0.35 },
    { banco: 'FITECH DO CORBAN', convenio: 'INSS', value: 'FITECH_INSS_NOVO_84_185_16', label: 'FITECH NOVO 84 TX 1,85 — 16%', pct: 0.16 },
    { banco: 'FITECH DO CORBAN', convenio: 'INSS', value: 'FITECH_INSS_NOVO_90_108_185_38', label: 'FITECH NOVO 90DIAS 108 TX 1,85 — 38%', pct: 0.38 },
    { banco: 'FITECH DO CORBAN', convenio: 'INSS', value: 'FITECH_INSS_NOVO_96_90_185_35', label: 'FITECH NOVO 96 90DIAS TX 1,85 — 35%', pct: 0.35 },
    { banco: 'FITECH DO CORBAN', convenio: 'INSS', value: 'FITECH_INSS_NOVO_84_90_185_16', label: 'FITECH NOVO 84 90DIAS TX 1,85 — 16%', pct: 0.16 },
  ];

  const STATUS_BO = [
    'AG. ANÁLISE',
    'AG. BOLETO',
    'BOLETO VALIDADO',
    'PROPOSTA DIGITADA',
    'AG. DOCS GARANTIA',
    'AG. LIBERAÇÃO MARGEM',
    'Pendenciado',
    'Em Andamento',
    'PAGO',
    'CANCELADO',
  ];

  /**
   * tabelasPor — filtra tabelas pelo banco e convênio selecionados.
   */
  function tabelasPor(banco, convenio) {
    const b = String(banco || '').trim();
    const c = String(convenio || '').trim();
    return TABELAS.filter((t) => (!b || t.banco === b) && (!c || t.convenio === c));
  }

  window.COMPRA_DIVIDA_CATALOG = {
    BANCOS,
    PRODUTOS,
    CONVENIOS,
    SITUACOES,
    BANCOS_PORTADOS,
    TABELAS,
    STATUS_BO,
    tabelasPor,
  };
})();
