/* SOU+BLU — API Propostas de Crédito (Supabase v2 via PHP) */
(function () {
  'use strict';

  function apiBase() {
    const c = window.SOUBLU_CONFIG || {};
    return String(c.API_BASE_URL || c.SITE_URL || location.origin || '').replace(/\/+$/, '');
  }

  function apiKey() {
    return (window.SOUBLU_CONFIG || {}).API_KEY || '';
  }

  async function _req(action, opts = {}) {
    const base = apiBase();
    if (!base) throw new Error('API base URL indisponível.');
    const qs = new URLSearchParams({ action, ...(opts.query || {}) });
    const url = `${base}/api/credito_api.php?${qs}`;
    const headers = { 'X-API-Key': apiKey() };
    const init = { method: opts.method || 'GET', headers };
    if (opts.body) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `Erro HTTP ${res.status}`);
    }
    return data;
  }

  function isCreditTableRow(p) {
    if (!p) return false;
    const m = p.meta && typeof p.meta === 'object' ? p.meta : {};
    return m.credit_table === 'credit_proposals';
  }

  const CreditoPropostasApi = {
    isCreditTableRow,

    async health() {
      return _req('health');
    },

    async list(employeeId) {
      const query = employeeId ? { employee_id: String(employeeId) } : {};
      const data = await _req('list', { query });
      return data.items || [];
    },

    async get(id) {
      const data = await _req('get', { query: { id: String(id) } });
      return data.item || null;
    },

    async create(row) {
      const data = await _req('create', { method: 'POST', body: row });
      return data.item || null;
    },

    async update(id, patch) {
      const data = await _req('update', { method: 'POST', body: { id: String(id), ...patch } });
      return data.item || null;
    },

    proposalToUpdateRow(proposal) {
      const p = proposal || {};
      const est = p.creditoEsteira || p.credito_esteira || {};
      const ret = p.creditoRetorno || p.credito_retorno || {};
      const row = {
        protocolo: p.protocolo || p.numero,
        status: p.status || p.statusOp,
        valor_aprovado: est.valor_aprovado ?? p.valorFinal ?? p.valor_final,
        valor_parcela: est.valor_parcela,
        valor_final: p.valorFinal ?? p.valor_final ?? est.valor_final,
        esteira: est,
        retorno: ret,
        attachments: p.attachments || {},
        history: Array.isArray(p.history) ? p.history : [],
        observacao: p.obs || p.observacao,
      };
      Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);
      return row;
    },
  };

  window.CreditoPropostasApi = CreditoPropostasApi;
})();
