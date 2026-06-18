/* SOU+BLU — Busca CBO (Classificação Brasileira de Ocupações) */
const CboLookup = (() => {
  let _cache = null;
  let _timer = null;

  function apiBase() {
    const c = window.SOUBLU_CONFIG || {};
    const base = String(c.API_BASE_URL || c.SITE_URL || location.origin).replace(/\/+$/, '');
    return `${base}/api/cbo.php`;
  }

  async function search(q, limit = 20) {
    const term = String(q || '').trim();
    if (term.length < 2) return [];
    if (_cache && _cache.term === term) return _cache.rows;
    const c = window.SOUBLU_CONFIG || {};
    const headers = {};
    if (c.API_KEY) {
      headers.apikey = c.API_KEY;
      headers['X-API-Key'] = c.API_KEY;
    }
    const url = `${apiBase()}?q=${encodeURIComponent(term)}&limit=${limit}`;
    const res = await fetch(url, { headers });
    const data = await res.json().catch(() => ({}));
    const rows = Array.isArray(data.rows) ? data.rows : (Array.isArray(data) ? data : []);
    _cache = { term, rows };
    return rows;
  }

  function bind(inputId, dropdownId, codId, descId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    const cod = document.getElementById(codId);
    const desc = document.getElementById(descId);
    if (!input || !dropdown) return;

    const hide = () => { dropdown.style.display = 'none'; dropdown.innerHTML = ''; };

    const pick = (row) => {
      if (cod) cod.value = row.codigo || row.cod || '';
      if (desc) desc.value = row.titulo || row.descricao || '';
      input.value = `${row.codigo || row.cod} — ${row.titulo || row.descricao || ''}`;
      hide();
    };

    input.addEventListener('input', () => {
      clearTimeout(_timer);
      const q = input.value.trim();
      if (q.length < 2) { hide(); return; }
      _timer = setTimeout(async () => {
        try {
          const rows = await search(q);
          if (!rows.length) {
            dropdown.innerHTML = '<div class="cbo-dropdown__empty">Nenhuma ocupação encontrada</div>';
          } else {
            dropdown.innerHTML = rows.map((r) =>
              `<button type="button" class="cbo-dropdown__item" data-cod="${r.codigo || r.cod}" data-desc="${(r.titulo || r.descricao || '').replace(/"/g, '&quot;')}">
                <strong>${r.codigo || r.cod}</strong> — ${r.titulo || r.descricao || ''}
              </button>`
            ).join('');
            dropdown.querySelectorAll('.cbo-dropdown__item').forEach((btn) => {
              btn.addEventListener('click', () => pick({
                codigo: btn.dataset.cod,
                titulo: btn.dataset.desc,
              }));
            });
          }
          dropdown.style.display = 'block';
        } catch (e) {
          console.warn('[CBO]', e);
          hide();
        }
      }, 280);
    });

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && e.target !== input) hide();
    });
  }

  function initRhCboFields() {
    bind('jg_cbo_search', 'jg_cbo_dropdown', 'jg_cbo_cod', 'jg_cbo_descricao');
    bind('justif_cbo_search', 'justif_cbo_dropdown', 'justif_cbo_cod', 'justif_cbo_descricao');
  }

  return { search, bind, initRhCboFields };
})();

window.CboLookup = CboLookup;
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('jg_cbo_search') || document.getElementById('justif_cbo_search')) {
    CboLookup.initRhCboFields();
  }
});
