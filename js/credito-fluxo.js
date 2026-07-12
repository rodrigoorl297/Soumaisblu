/* SOU+BLU — Fluxo proposta de crédito (status compartilhados) */
(function () {
  'use strict';

  const S = {
    ANALISE: 'AG. ANÁLISE',
    DOCS: 'AGUARDANDO DOCUMENTAÇÃO',
    ACEITE: 'AG. ACEITE FUNCIONÁRIO',
    ASSINATURA_GOV: 'AG. ASSINATURA GOV',
    RETORNO_FIN: 'AG. RETORNO FINANCEIRO',
    APROVADO_PAG: 'APROVADO AG. PAGAMENTO',
    PAGO: 'PAGO',
    REPROVADO: 'REPROVADO',
  };

  const ETAPAS = [
    { key: 'analise', status: S.ANALISE, label: 'Em análise', actor: 'financeiro', hint: 'Aguarde o financeiro analisar sua solicitação.' },
    { key: 'aceite', status: S.ACEITE, label: 'Autorizar Pix', actor: 'funcionario', hint: 'Abra Autorizar Pix no celular e conclua no app do banco.' },
    { key: 'gov', status: S.ASSINATURA_GOV, label: 'Assinar documentos (Gov.br)', actor: 'funcionario', hint: 'Assine os termos via Gov.br e envie os PDFs assinados.' },
    { key: 'retorno', status: S.RETORNO_FIN, label: 'Retorno ao financeiro', actor: 'financeiro', hint: 'Documentos enviados — aguarde validação do financeiro.' },
    { key: 'pagamento', status: S.APROVADO_PAG, label: 'Aprovado para pagamento', actor: 'empresa', hint: 'Aprovado — encaminhado para a empresa pagadora.' },
    { key: 'pago', status: S.PAGO, label: 'Pago', actor: 'sistema', hint: 'Crédito concluído.' },
  ];

  function normStatus(v) {
    const s = String(v || '').trim().toUpperCase();
    if (s === 'EM ANÁLISE') return S.ANALISE;
    return s;
  }

  function parseEsteira(row) {
    const est = row?.esteira ?? row?.credito_esteira ?? row?.creditoEsteira ?? {};
    if (typeof est === 'string') {
      try { return JSON.parse(est) || {}; } catch { return {}; }
    }
    return est && typeof est === 'object' ? est : {};
  }

  function proposalStatus(row) {
    const est = parseEsteira(row);
    return normStatus(est.status_credito || row?.status || row?.statusOp || S.ANALISE);
  }

  function etapaAtual(row) {
    const st = proposalStatus(row);
    return ETAPAS.find((e) => e.status === st) || { key: 'outro', status: st, label: st, actor: '—', hint: '' };
  }

  function needsPixAuth(row) {
    const st = proposalStatus(row);
    if (st === S.ACEITE) return true;
    const pa = parseEsteira(row).pix_automatico || {};
    const rec = String(pa.status || '').toUpperCase();
    if (rec === 'APROVADA') return false;
    return !!(pa.idRec || pa.idSolicRec || pa.pix_copia_cola);
  }

  function needsGovDocs(row) {
    return proposalStatus(row) === S.ASSINATURA_GOV;
  }

  function badgeClass(status) {
    const s = normStatus(status);
    if (s === S.PAGO || s === S.APROVADO_PAG) return 'ec-status-aprovado';
    if (s === S.REPROVADO) return 'ec-status-recusado';
    return 'ec-status-pendente';
  }

  window.CreditoFluxo = {
    S,
    ETAPAS,
    normStatus,
    parseEsteira,
    proposalStatus,
    etapaAtual,
    needsPixAuth,
    needsGovDocs,
    badgeClass,
  };
})();
