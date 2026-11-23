/**
 * clients-search-fix — busca cliente por nome no banco, não só nos ~800 da tela.
 * CPF já ia no findClientByCpf; nome antigo não aparecia.
 */
(function () {
  function restGet(qs) {
    const cfg = window.SOUBLU_CONFIG || {};
    const key = cfg.API_KEY || '';
    const origin = String(location.origin || '').replace(/\/$/, '');
    const url = origin + '/api/rest/v1/clients?' + qs;
    return fetch(url, {
      headers: { 'X-API-Key': key, apikey: key, Accept: 'application/json' },
    }).then(function (res) { return res.json().catch(function () { return []; }); })
      .then(function (data) { return Array.isArray(data) ? data : []; });
  }

  /**
   * fetchByQuery — nome/e-mail (ilike) e CPF exato quando tiver 11 dígitos.
   */
  async function fetchByQuery(q) {
    if (window.DB && typeof DB.searchClients === 'function') {
      try { return await DB.searchClients(q, { limit: 80 }); } catch (_) { /* cai no REST */ }
    }
    const raw = String(q || '').trim();
    if (!raw) return [];
    const digits = raw.replace(/\D/g, '');
    const like = '*' + raw.replace(/[*%(),]/g, ' ').replace(/\s+/g, '*').slice(0, 80) + '*';
    const cols = 'id,cpf,name,phone1,phone2,email,rg,supervisorId,supervisor_id';
    const seen = new Set();
    const out = [];
    function add(rows) {
      (rows || []).forEach(function (c) {
        const k = String((c && (c.cpf || c.id)) || '').replace(/\D/g, '') || String((c && c.id) || '');
        if (!k || seen.has(k)) return;
        seen.add(k);
        out.push(c);
      });
    }
    try {
      add(await restGet('or=(name.ilike.' + encodeURIComponent(like) + ',email.ilike.' + encodeURIComponent(like) + ')&select=' + cols + '&limit=80'));
    } catch (_) {
      try { add(await restGet('name=ilike.' + encodeURIComponent(like) + '&select=' + cols + '&limit=80')); } catch (e2) { /* noop */ }
    }
    if (digits.length === 11 && window.DB && typeof DB.findClientByCpf === 'function') {
      const one = await DB.findClientByCpf(digits).catch(function () { return null; });
      if (one) add([one]);
    } else if (digits.length >= 3) {
      try { add(await restGet('cpf=ilike.*' + encodeURIComponent(digits) + '*&select=' + cols + '&limit=40')); } catch (_) { /* noop */ }
    }
    return out;
  }

  function merge(local, remote, q) {
    const seen = new Set();
    const out = [];
    function add(c) {
      const k = String((c && (c.cpf || c.id)) || '').replace(/\D/g, '') || String((c && c.id) || '');
      if (!k || seen.has(k)) return;
      seen.add(k);
      out.push(c);
    }
    (local || []).forEach(function (c) {
      if (window.Clients && typeof Clients.matchesClientSearch === 'function') {
        if (Clients.matchesClientSearch(c, q)) add(c);
      } else add(c);
    });
    (remote || []).forEach(add);
    return out;
  }

  async function runSearch(inputId) {
    const C = window.Clients;
    if (!C) return;
    const q = C._getSearchQuery(inputId || 'clientSearch');
    const tbody = document.getElementById('clientsTbody');
    const listEl = document.getElementById('clientsList');
    if (!q || q.length < 2) {
      if (tbody && typeof window._repaintClientsTableFromCache === 'function') window._repaintClientsTableFromCache();
      if (listEl && typeof C._repaintEmployeeList === 'function') C._repaintEmployeeList();
      return;
    }
    const remote = await fetchByQuery(q).catch(function () { return []; });
    if (tbody && typeof window._paintClientsTable === 'function') {
      const cache = typeof window._getClientsListCache === 'function' ? window._getClientsListCache() : null;
      window._paintClientsTable(tbody, merge(cache && cache.rows, remote, q), (cache && cache.nameMap) || new Map());
    } else if (tbody && typeof window._repaintClientsTableFromCache === 'function') {
      window._repaintClientsTableFromCache();
    }
    if (listEl && C._employeeListCache && typeof C._paintEmployeeList === 'function') {
      C._paintEmployeeList(listEl, merge(C._employeeListCache, remote, q));
    }
  }

  function install() {
    const C = window.Clients;
    if (!C || C.__nameSearchFix1) return !!C;
    C.__nameSearchFix1 = true;
    C._fetchClientsByQuery = fetchByQuery;
    C._runClientSearch = runSearch;
    const prev = C._onSearchInput && C._onSearchInput.bind(C);
    C._onSearchInput = function () {
      clearTimeout(C._searchDebounce);
      C._searchDebounce = setTimeout(function () { runSearch('clientSearch'); }, 280);
    };
    const emp = document.getElementById('employeeClientSearch');
    if (emp && !emp.dataset.nameSearchFix) {
      emp.dataset.nameSearchFix = '1';
      emp.addEventListener('input', function () {
        clearTimeout(C._searchDebounce);
        C._searchDebounce = setTimeout(function () { runSearch('employeeClientSearch'); }, 280);
      });
    }
    if (typeof prev === 'function') { /* busca agora vai ao banco */ }
    return true;
  }

  if (!install()) {
    document.addEventListener('DOMContentLoaded', install);
    window.addEventListener('load', install);
    let n = 0;
    const t = setInterval(function () {
      n += 1;
      if (install() || n > 40) clearInterval(t);
    }, 250);
  }
})();
