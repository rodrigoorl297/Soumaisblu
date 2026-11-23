
/* Claude 19/11: proposals grandes (limit >= 200, sem offset) são ordenadas no navegador, com a mesma regra do
   PostgRestCompat/MySQL. Tira do servidor a ordenação de linhas largas, que fica lenta em horário de pico. */
function _soubluClientSortPlan(params) {
  const raw = String(params || '').replace(/^\?/, '');
  if (!raw) return null;
  const parts = raw.split('&');
  const get = (k) => { const p = parts.find(x => x.startsWith(k + '=')); return p == null ? null : decodeURIComponent(p.slice(k.length + 1)); };
  const order = get('order');
  if (!order || get('offset') != null) return null;
  const limRaw = get('limit');
  const limit = limRaw == null ? null : parseInt(limRaw, 10);
  if (limit !== null && (!Number.isFinite(limit) || limit < 200)) return null;
  let keys = [];
  order.split(',').forEach((s) => {
    const m = /^([A-Za-z0-9_]+)\.(asc|desc)$/i.exec(s.trim());
    if (m) keys.push({ col: m[1], desc: m[2].toLowerCase() === 'desc' });
  });
  /* igual ao PostgRestCompat: termos com .nullslast são ignorados; sem termo válido usa created_at DESC */
  if (!keys.length) keys = [{ col: 'created_at', desc: true }];
  const sel = get('select');
  if (sel && sel.trim() !== '*') {
    const cols = sel.split(',').map(s => s.trim());
    if (keys.some(k => !cols.includes(k.col))) return null;
  }
  const rest = parts.filter(x => !x.startsWith('order=') && !x.startsWith('limit=')).join('&');
  return { params: rest ? '?' + rest : '', keys, limit };
}
function _soubluSortVal(v) {
  if (v == null) return null;
  return typeof v === 'number' ? v : String(v);
}
function _soubluApplyClientSort(rows, plan) {
  if (!Array.isArray(rows)) return rows;
  const keys = plan.keys;
  const sorted = rows.map((r, i) => [r, i]).sort((A, B) => {
    for (const k of keys) {
      const a = _soubluSortVal(A[0] && A[0][k.col]);
      const b = _soubluSortVal(B[0] && B[0][k.col]);
      if (a === b) continue;
      /* NULL é o menor valor (mesma regra do MySQL): no DESC vai pro fim */
      let c;
      if (a === null) c = -1;
      else if (b === null) c = 1;
      else c = (typeof a === 'number' && typeof b === 'number') ? a - b : (a < b ? -1 : 1);
      return k.desc ? -c : c;
    }
    return A[1] - B[1];
  }).map(x => x[0]);
  return plan.limit != null ? sorted.slice(0, plan.limit) : sorted;
}

/* Claude fix: colunas JSON que chegam como texto viram lista/objeto (ex.: history.forEach is not a function). */
function _soubluHydrateJson(table, data) {
  const cols = ({
    proposals: ['history','attachments','meta','credito_esteira','credito_retorno','creditoEsteira','creditoRetorno'],
    vendor_pendencias: ['history'],
  })[String(table || '').split('?')[0]];
  if (!cols || data == null) return data;
  const fix = row => {
    if (!row || typeof row !== 'object') return row;
    cols.forEach(c => {
      let v = row[c];
      for (let i = 0; i < 3 && typeof v === 'string' && /^\s*[\[{"]/.test(v); i++) {
        try { v = JSON.parse(v); } catch (_) { break; }
      }
      if (c === 'history') { if (v != null && !Array.isArray(v)) v = []; }
      if (v !== row[c]) row[c] = v;
    });
    return row;
  };
  return Array.isArray(data) ? data.map(fix) : fix(data);
}

/* Compatibilidade MySQL: nomes físicos e JSON escalar para todos os módulos. */
function _soubluMysqlAliases(table) {
  return table === 'proposals' ? {
    creditoEsteira:'credito_esteira',creditoRetorno:'credito_retorno',
    comissao_elegivel:'comissaoElegivel',comissao_recebida:'comissaoRecebida',
    valor_comissao_recebida:'valorComissaoRecebida'
  } : {};
}
function _soubluMysqlParams(table, params) {
  let output = params || '';
  Object.entries(_soubluMysqlAliases(table)).forEach(([alias,column]) => {
    output = output.replace(new RegExp('\\b' + alias + '\\b', 'g'), column);
  });
  return output;
}
function _soubluMysqlBody(table, body) {
  if (body == null) return body;
  const aliases = _soubluMysqlAliases(table);
  const row = item => {
    const result = {};
    Object.entries(item || {}).forEach(([key,value]) => {
      const column = aliases[key] || key;
      if (aliases[key] && Object.prototype.hasOwnProperty.call(item,column) && item[column] != null) return;
      result[column] = value && typeof value === 'object' ? JSON.stringify(value) : value;
    });
    return result;
  };
  return Array.isArray(body) ? body.map(row) : row(body);
}

/* =============================================
   SOU + BLU – Configuração Supabase
   ============================================= */

    const _cfg = typeof window !== 'undefined' && window.SOUBLU_CONFIG ? window.SOUBLU_CONFIG : {};
    const DB_BACKEND = String(_cfg.DB_BACKEND || 'supabase').toLowerCase();
    const API_BASE_URL = String(_cfg.API_BASE_URL || _cfg.SITE_URL || '').replace(/\/+$/, '');
    const API_KEY = String(_cfg.API_KEY || '').trim();
    const HOSTINGER_CONFIGURED = DB_BACKEND === 'hostinger' && !!(API_BASE_URL && API_KEY);
    const SUPABASE_URL = String(_cfg.SUPABASE_URL || '').replace(/\/+$/, '');
    const SUPABASE_KEY = String(_cfg.SUPABASE_ANON_KEY || _cfg.SUPABASE_KEY || '').trim();
    /* Produção é MySQL Locaweb. REST Supabase só em FORCE_SUPABASE local. */
    const SUPABASE_CONFIGURED = !HOSTINGER_CONFIGURED && !!(SUPABASE_URL && SUPABASE_KEY);
    if (typeof window !== 'undefined') {
      window.SOUBLU_CONFIG = window.SOUBLU_CONFIG || {};
      if (window.SOUBLU_CONFIG.BOLAO_COPA_ENABLED === undefined) {
        window.SOUBLU_CONFIG.BOLAO_COPA_ENABLED = false;
      }
      /**
       * CLUBE_BENEFICIOS_ENABLED — liga/desliga o Clube de Benefícios.
       * false = some menu, bloqueia páginas standalone e alertas de pedido.
       * Trocar para true quando for reativar.
       */
      if (window.SOUBLU_CONFIG.CLUBE_BENEFICIOS_ENABLED === undefined) {
        window.SOUBLU_CONFIG.CLUBE_BENEFICIOS_ENABLED = false;
      }
      /**
       * isClubeBeneficiosEnabled — lê o flag (desligado por padrão).
       * Usado por admin/employee/clube/pedido-alert para ocultar e barrar acesso.
       */
      window.isClubeBeneficiosEnabled = function isClubeBeneficiosEnabled() {
        const cfg = window.SOUBLU_CONFIG || {};
        if (cfg.CLUBE_BENEFICIOS_ENABLED === false || cfg.CLUBE_BENEFICIOS_ENABLED === 0 || cfg.CLUBE_BENEFICIOS_ENABLED === '0') {
          return false;
        }
        return cfg.CLUBE_BENEFICIOS_ENABLED === true || cfg.CLUBE_BENEFICIOS_ENABLED === 1 || cfg.CLUBE_BENEFICIOS_ENABLED === '1';
      };
      window.SOUBLU_RUNTIME = {
        dbBackend: HOSTINGER_CONFIGURED ? 'hostinger' : (SUPABASE_CONFIGURED ? 'supabase' : 'local'),
        supabaseConfigured: SUPABASE_CONFIGURED,
        hostingerConfigured: HOSTINGER_CONFIGURED,
        bolaoEnabled: window.SOUBLU_CONFIG.BOLAO_COPA_ENABLED === true,
        clubeBeneficiosEnabled: window.isClubeBeneficiosEnabled(),
      };
    }
   
   const CACHE_TTL = 300000; // 5 min — leitura fresca
   const CACHE_STALE_MAX = 86400000; // 24h — dados antigos ainda servem na tela
   const API_RETRY_MAX = 3;
   const API_RETRY_BASE_MS = 500;
   /** No máximo 4 chamadas à API ao mesmo tempo. O boot disparava dezenas e o nginx respondia 429. */
   const API_MAX_CONCURRENT = 4;
   const API_429_PAUSE_MS = 5000;
   let _apiInUse = 0;
   const _apiWaiters = [];
   let _rateLimitUntil = 0;
   let _rateLimitLogged = false;

   /**
    * _noteRateLimit — marca pausa depois de HTTP 429.
    * O nginx devolve "Too Many Requests"; insistir na hora multiplica o erro (~200 no console).
    */
   function _noteRateLimit() {
     _rateLimitUntil = Math.max(_rateLimitUntil, Date.now() + API_429_PAUSE_MS);
     if (_rateLimitLogged) return;
     _rateLimitLogged = true;
     console.warn('[SOUBLU] Muitas chamadas ao mesmo tempo (429). Pausando chamadas por 5s.');
     setTimeout(() => { _rateLimitLogged = false; }, API_429_PAUSE_MS);
   }

   function _releaseApiSlot() {
     _apiInUse = Math.max(0, _apiInUse - 1);
     const next = _apiWaiters.shift();
     if (next) {
       _apiInUse += 1;
       next();
     }
   }

   /** Espera vaga (máx. 4) e a pausa de 429 antes de falar com o servidor. */
   function _acquireApiSlot() {
     return new Promise((resolve) => {
       const start = () => {
         const wait = _rateLimitUntil - Date.now();
         if (wait > 0) {
           setTimeout(start, wait);
           return;
         }
         resolve();
       };
       if (_apiInUse < API_MAX_CONCURRENT) {
         _apiInUse += 1;
         start();
         return;
       }
       _apiWaiters.push(start);
     });
   }
   /** GET de listagem. Escrita (PATCH/POST com anexo) usa o timeout maior. */
   const API_FETCH_TIMEOUT_MS = 10000;
   const API_WRITE_TIMEOUT_MS = 90000;
   const _supaInflight = new Map();
   const _bgRefresh = new Set();
   /** Incrementado em cada escrita — evita GET em voo regravar cache após DELETE/PATCH. */
   const _tableWriteGen = Object.create(null);
   /** Tabelas em tempo quase-real: nunca cachear GET (chat interno etc.). */
   function _isNoCacheTable(table) {
     const t = String(table || '');
     return t.startsWith('internal_chat_')
       || t.startsWith('leads')
       || t === 'lead_batches'
       || t === 'lead_weekly_assignments'
       || t === 'lead_unlock_requests'
       || t === 'vendor_pendencias';
   }

   /** Debug ingest desligado em produção (evita spam localhost + /api/debug-session-log). */
   function _dbgSessionLog() { /* noop */ }
   if (typeof window !== 'undefined') window._dbgSessionLog = _dbgSessionLog;

   function _bumpTableWriteGen(table) {
     if (!table) return 0;
     _tableWriteGen[table] = (_tableWriteGen[table] || 0) + 1;
     return _tableWriteGen[table];
   }

   function _scheduleBgRefresh(cacheKey, method, table, body, params) {
     if (_bgRefresh.has(cacheKey)) return;
     _bgRefresh.add(cacheKey);
     const genAtStart = _tableWriteGen[table] || 0;
       supaReqOnceWithFailover(method, table, body, params)
       .then((data) => {
         if ((_tableWriteGen[table] || 0) !== genAtStart) return;
         if (cacheKey && (Array.isArray(data) ? data.length > 0 : data)) _cacheSet(cacheKey, data);
       })
       .catch(() => {})
       .finally(() => { setTimeout(() => _bgRefresh.delete(cacheKey), 15000); });
   }

   function _isTransientApiFailure(status, err) {
     const code = Number(status) || 0;
     // 429 não entra no retry rápido: cada repetição aumenta o bloqueio do nginx.
     if (code === 502 || code === 503 || code === 504) return true;
     const msg = String(err?.message || err || '');
     return /Sem conexão|Failed to fetch|NetworkError|network|timeout|temporariamente indisponível|aborted|supabase/i.test(msg);
   }

   /**
    * Failover Supabase → Localweb: quando o REST do Supabase cai, usa MySQL em soumaisblu.com.br.
    * Produção já usa Localweb direto; isso protege dev/FORCE_SUPABASE e quedas pontuais.
    */
   const FAILOVER_STICKY_MS = 5 * 60 * 1000;
   let _apiUseHostingerFailover = false;
   let _failoverStickyUntil = 0;

   function _locawebFallbackUrl() {
     const c = typeof window !== 'undefined' ? (window.SOUBLU_CONFIG || {}) : {};
     const raw = c.LOCAWEB_FALLBACK_URL || c.API_BASE_URL || c.SITE_URL || 'https://www.soumaisblu.com.br';
     return String(raw).replace(/\/+$/, '');
   }

   function _resolveUseHostingerApi() {
     if (HOSTINGER_CONFIGURED) return true;
     if (_apiUseHostingerFailover && Date.now() > _failoverStickyUntil) {
       _apiUseHostingerFailover = false;
     }
     return _apiUseHostingerFailover;
   }

   function _activateLocawebFailover(reason) {
     if (HOSTINGER_CONFIGURED) return;
     const c = typeof window !== 'undefined' ? (window.SOUBLU_CONFIG || {}) : {};
     if (c.ENABLE_LOCawEB_FAILOVER === false || !API_KEY) return;
     _apiUseHostingerFailover = true;
     _failoverStickyUntil = Date.now() + FAILOVER_STICKY_MS;
     if (typeof window !== 'undefined') {
       window.SOUBLU_RUNTIME = window.SOUBLU_RUNTIME || {};
       window.SOUBLU_RUNTIME.dbBackend = 'hostinger-failover';
       window.SOUBLU_RUNTIME.failoverActive = true;
       window.SOUBLU_RUNTIME.failoverReason = String(reason || '').slice(0, 200);
     }
     console.warn('[SOUBLU] Supabase indisponível — dados via MySQL Localweb.', reason || '');
   }

   /** Só faz failover em queda de rede/servidor — não em erro de permissão ou registro. */
   function _shouldFailoverToLocaweb(err, status) {
     if (HOSTINGER_CONFIGURED) return false;
     const c = typeof window !== 'undefined' ? (window.SOUBLU_CONFIG || {}) : {};
     if (c.ENABLE_LOCawEB_FAILOVER === false || !API_KEY) return false;
     const code = Number(status) || 0;
     if (code === 401 || code === 403 || code === 404 || code === 409 || code === 422) return false;
     return _isTransientApiFailure(status, err) || code === 0 || code >= 500;
   }
    
    function _cacheGet(key) {
      try {
        const raw = sessionStorage.getItem(`supa_cache_${key}`);
        if (!raw) return null;
        const e = JSON.parse(raw);
        if (e && Date.now() - e.ts < CACHE_TTL) return _soubluHydrateJson(key, e.val);
        return null;
      } catch (err) {
        return null;
      }
    }

    function _cacheGetAny(key) {
      try {
        const raw = sessionStorage.getItem(`supa_cache_${key}`);
        if (!raw) return null;
        const e = JSON.parse(raw);
        if (!e?.val) return null;
        if (e.ts && Date.now() - e.ts > CACHE_STALE_MAX) return null;
        return _soubluHydrateJson(key, e.val);
      } catch (err) {
        return null;
      }
    }
    
    function _cacheSet(key, val) {
      try {
        sessionStorage.setItem(`supa_cache_${key}`, JSON.stringify({ val, ts: Date.now() }));
      } catch (err) {
        // fail-silent se o storage estiver cheio
      }
    }
    
    function _cacheDel(prefix) {
      try {
        const keysToRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith('supa_cache_')) {
            const cacheKey = k.replace('supa_cache_', '');
            if (cacheKey.startsWith(prefix)) {
              keysToRemove.push(k);
            }
          }
        }
        keysToRemove.forEach(k => sessionStorage.removeItem(k));
      } catch (err) {
        // fail-silent
      }
    }
   
   async function localSupaMock(method, table, body, params) {
       await new Promise(r => setTimeout(r, 100)); // fake delay
       // Map Supabase table names to the same localStorage keys used by DB offline mode
       const _tableKeyMap = {
         users: 'soublu_users', products: 'soublu_products',
         transactions: 'soublu_transactions', orders: 'soublu_orders',
         withdrawals: 'soublu_withdrawals', clients: 'soublu_clients',
         proposals: 'soublu_proposals', tickets: 'soublu_tickets',
         meetings: 'soublu_meetings', partners: 'soublu_partners',
       };
       const storageKey = _tableKeyMap[table] || `supamock_${table}`;
       const allData = JSON.parse(localStorage.getItem(storageKey) || '[]');
       
       if (method === 'GET') {
          let result = [...allData];
          // parse ?param=eq.123
          const pStr = params.startsWith('?') ? params.substring(1) : params;
          const parts = pStr.split('&');
          for (const p of parts) {
             const [k, v] = p.split('=');
             if (k && v && v.startsWith('eq.')) {
                const val = v.replace('eq.', '');
                result = result.filter(item => {
                   if (val === 'null' && item[k] === null) return true;
                   return String(item[k]) === String(val);
                });
             } else if (k && v && v === 'is.null') {
                result = result.filter(item => item[k] === null || item[k] === undefined);
             }
          }
          // handle order desc loosely for created_at
          if (pStr.includes('order=created_at.desc') || pStr.includes('order=requested_at.desc')) {
              result = result.reverse();
          }
          return result;
       }
       if (method === 'POST') {
          const items = Array.isArray(body) ? body : [body];
          const conflictMatch = params && params.match(/on_conflict=([^&]+)/);
          if (conflictMatch) {
             const key = conflictMatch[1];
             for (let item of items) {
                const idx = allData.findIndex(x => String(x[key]) === String(item[key]));
                if (idx >= 0) allData[idx] = { ...allData[idx], ...item };
                else allData.push(item);
             }
          } else {
             allData.push(...items);
          }
          localStorage.setItem(storageKey, JSON.stringify(allData));
          return items;
       }
       if (method === 'PATCH') {
          const idMatch = params.match(/id=eq\.([^&]+)/);
          const id = idMatch ? idMatch[1] : null;
          let updated = [];
          for (let i=0; i<allData.length; i++) {
             if (!id || String(allData[i].id) === String(id)) {
                allData[i] = { ...allData[i], ...body };
                updated.push(allData[i]);
             }
          }
          localStorage.setItem(storageKey, JSON.stringify(allData));
          return updated;
       }
       if (method === 'DELETE') {
          const idMatch = params.match(/id=eq\.([^&]+)/);
          const batchMatch = params.match(/batch_id=eq\.([^&]+)/);
          let remaining = allData;
          if (idMatch) {
             remaining = allData.filter(i => String(i.id) !== String(idMatch[1]));
          } else if (batchMatch) {
             remaining = allData.filter(i => String(i.batch_id) !== String(batchMatch[1]));
          }
          localStorage.setItem(storageKey, JSON.stringify(remaining));
          return [];
       }
       return [];
   }

    function _looksLikeHtmlError(text) {
      const s = String(text || '');
      return /<html|<!doctype|<body[\s>]/i.test(s) || (/nginx|apache|cloudflare/i.test(s) && s.length > 80);
    }

    function friendlyApiError(status, bodyText) {
      const code = Number(status) || 0;
      const body = String(bodyText || '').trim();

      if (body.startsWith('{') || body.startsWith('[')) {
        try {
          const j = JSON.parse(body);
          if (j.code === '23505' && /email/i.test(String(j.message || ''))) {
            return 'Este e-mail já está cadastrado. Use outro e-mail.';
          }
          if (j.code === '23505' && /matricula/i.test(String(j.message || ''))) {
            return 'Esta matrícula já está em uso.';
          }
          const msg = j.message || j.error || j.hint;
          if (typeof msg === 'string' && msg && !_looksLikeHtmlError(msg)) return msg;
        } catch (_) { /* não é JSON */ }
      }

      if (_looksLikeHtmlError(body) || body.length > 300) {
        if (code === 403) {
          return 'Acesso negado pelo servidor. Pode ser bloqueio de segurança, sessão expirada ou anexos muito grandes — tente arquivos menores ou contate o suporte.';
        }
        if (code === 401) return 'Sessão expirada ou sem permissão. Faça login novamente.';
        if (code === 413) return 'Dados muito grandes para enviar. Use anexos menores (até 25 MB por arquivo).';
        if (code === 502 || code === 504) return 'Servidor temporariamente indisponível. Tente novamente em alguns minutos.';
        if (code >= 500) return `Erro interno do servidor (${code}). Tente novamente ou contate o suporte.`;
        return code
          ? `Não foi possível concluir a operação (erro ${code}). Tente novamente ou contate o suporte.`
          : 'Não foi possível concluir a operação. Tente novamente ou contate o suporte.';
      }

      if (body && !_looksLikeHtmlError(body)) return body;
      return code
        ? `Erro ao comunicar com o servidor (${code}).`
        : 'Erro ao comunicar com o servidor.';
    }

    if (typeof window !== 'undefined') window.friendlyApiError = friendlyApiError;

    /** Extrai JSON mesmo se o PHP emitir avisos antes do corpo (ex.: constantes duplicadas). */
    function _parseApiJson(text) {
      try {
        return JSON.parse(text);
      } catch (_) {
        const trimmed = String(text || '').trim();
        const start = trimmed.search(/[\[{]/);
        if (start < 0) throw new Error('Resposta inválida do servidor.');
        return JSON.parse(trimmed.slice(start));
      }
    }

    async function supaReqOnce(method, table, body = null, params = '', opts = {}) {
     if (method === 'GET' && table === 'proposals' && !opts._noClientSort) {
       const plan = _soubluClientSortPlan(params);
       if (plan) {
         const rows = await supaReqOnce(method, table, body, plan.params, Object.assign({}, opts, { _noClientSort: true }));
         return _soubluApplyClientSort(rows, plan);
       }
     }
     const forceHostinger = opts.forceHostinger === true || _resolveUseHostingerApi();
     if (forceHostinger) { params = _soubluMysqlParams(table, params); body = _soubluMysqlBody(table, body); }
     const url = forceHostinger
       ? `${HOSTINGER_CONFIGURED ? API_BASE_URL : _locawebFallbackUrl()}/api/rest/v1/${table}${params}`
       : `${SUPABASE_URL}/rest/v1/${table}${params}`;

     const headers = {
       'Content-Type': 'application/json',
       'Prefer': 'return=representation',
     };
     if (forceHostinger) {
       headers['X-API-Key'] = API_KEY;
       // Quem clicou em excluir (deleteProposal grava window.__soubluActor). A API usa isso no arquivo Localweb.
       if (typeof window !== 'undefined' && window.__soubluActor) {
         headers['X-Soublu-Actor'] = String(window.__soubluActor).slice(0, 120);
       }
     } else {
       headers['apikey'] = SUPABASE_KEY;
       headers['Authorization'] = `Bearer ${SUPABASE_KEY}`;
     }

     let res;
     const ctrl = new AbortController();
     const isWrite = method !== 'GET' && method !== 'HEAD';
     const timeoutMs = isWrite ? API_WRITE_TIMEOUT_MS : (table === 'users' ? Math.max(API_FETCH_TIMEOUT_MS, 15000) : API_FETCH_TIMEOUT_MS);
     await _acquireApiSlot();
     const timer = setTimeout(() => ctrl.abort(), timeoutMs);
     try {
       res = await fetch(url, {
         method,
         headers,
         body: body ? JSON.stringify(body) : undefined,
         signal: ctrl.signal,
       });
     } catch (netErr) {
       const aborted = netErr && netErr.name === 'AbortError';
       const netMsg = aborted ? 'tempo esgotado' : (netErr && netErr.message ? netErr.message : 'rede');
       const hint = forceHostinger
         ? 'Confira se o site e a API (/api/rest/v1) estão no ar.'
         : 'Confira internet, bloqueador de anúncios ou status do Supabase.';
       const err = new Error(`Sem conexão com o servidor (${netMsg}). ${hint}`);
       err.status = 0;
       err.aborted = !!aborted;
       throw err;
     } finally {
       clearTimeout(timer);
       _releaseApiSlot();
     }

     if (res.status === 429) {
       _noteRateLimit();
       const err = new Error('Muitas requisições ao mesmo tempo. Aguarde um instante e atualize a página.');
       err.status = 429;
       throw err;
     }

     if (!res.ok) {
       const e = await res.text();
       console.error(`ERRO ${method} ${table} (${res.status}):`, String(e || '').slice(0, 180));
       const err = new Error(friendlyApiError(res.status, e));
       err.status = res.status;
       throw err;
     }

     const text = await res.text();
     return text ? _soubluHydrateJson(table, _parseApiJson(text)) : [];
   }

   async function supaReqOnceWithFailover(method, table, body = null, params = '') {
     try {
       return await supaReqOnce(method, table, body, params);
     } catch (e) {
       if (!HOSTINGER_CONFIGURED && _shouldFailoverToLocaweb(e, e.status)) {
         _activateLocawebFailover(e.message);
         return await supaReqOnce(method, table, body, params, { forceHostinger: true });
       }
       throw e;
     }
   }

    async function supaReq(method, table, body = null, params = '') {
      const isLocalForce = false;
      if (isLocalForce || (!HOSTINGER_CONFIGURED && !SUPABASE_CONFIGURED)) {
          return await localSupaMock(method, table, body, params);
      }

     const cacheKey = (method === 'GET' && !_isNoCacheTable(table)) ? `${table}${params}` : null;
     if (cacheKey) {
       const hit = _cacheGet(cacheKey);
       if (hit) return hit;
       const stale = _cacheGetAny(cacheKey);
       if (stale) {
         _scheduleBgRefresh(cacheKey, method, table, body, params);
         return stale;
       }
     }

     const inflightKey = `${method}:${table}:${params}`;
     if (_supaInflight.has(inflightKey)) {
       return _supaInflight.get(inflightKey);
     }

     const genAtStart = _tableWriteGen[table] || 0;
     const task = (async () => {
     let lastErr;
     for (let attempt = 1; attempt <= API_RETRY_MAX; attempt++) {
       try {
         const data = await supaReqOnceWithFailover(method, table, body, params);
         if (method !== 'GET') {
           _bumpTableWriteGen(table);
           _cacheDel(table);
         } else if ((_tableWriteGen[table] || 0) === genAtStart) {
           if (cacheKey && (Array.isArray(data) ? data.length > 0 : data)) _cacheSet(cacheKey, data);
         }
         return data;
       } catch (e) {
         lastErr = e;
         const stale = cacheKey ? _cacheGetAny(cacheKey) : null;
         if (method === 'GET' && stale && (_tableWriteGen[table] || 0) === genAtStart) {
           return stale;
         }
         if (e?.status === 429 && attempt < API_RETRY_MAX) continue; /* 429: espera a pausa em _acquireApiSlot e tenta de novo */ if (e?.status === 429 || e?.status === 0 || e?.aborted) throw e;
         /* 502/503/504: até 3 tentativas. Queda de rede e 429 não repetem — repetir enche o nginx. */
         const maxAttempts = method === 'GET' && table === 'users' ? 1 : API_RETRY_MAX;
         if (attempt < maxAttempts && _isTransientApiFailure(e.status, e)) {
           await new Promise(r => setTimeout(r, API_RETRY_BASE_MS * attempt));
           continue;
         }
         throw e;
       }
     }
     if (method === 'GET' && cacheKey && (_tableWriteGen[table] || 0) === genAtStart) {
       const stale = _cacheGetAny(cacheKey);
       if (stale) return stale;
     }
     throw lastErr || new Error('Falha ao comunicar com o servidor.');
     })();

     _supaInflight.set(inflightKey, task);
     try {
       return await task;
     } finally {
       _supaInflight.delete(inflightKey);
     }
   }
   
   // NOTE: User seed is handled by DB.init() in db.js → soublu_users
   // localSupaMock now maps 'users' table → 'soublu_users' so both systems share the same data


/* =============================================
   Cutover Locaweb — URLs antigas do Supabase Storage
   O Supabase saiu do ar; os arquivos estão em /uploads e são servidos pelo
   /api/file.php (que procura no disco primeiro). Qualquer src/href/fetch/
   window.open apontando pro Storage antigo é trocado na hora.
   ============================================= */
(function () {
  if (typeof window === 'undefined' || window.__soubluStorageNet) return;
  window.__soubluStorageNet = true;

  const BUCKETS = new Set([
    'proposal-attachments', 'propostas', 'tim-docs', 'contestacao-docs', 'finance-docs',
    'ticket-docs', 'partner-docs', 'profile-photos', 'product-images',
    'rh-demissao', 'rh-docs', 'monitoria-atendimento', 'partner-nf', 'sonhos', 'mural', 'misc',
    'whatsapp-media', 'docs', 'trainings', 'trainings-media',
  ]);
  const RX = /^https?:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/(?:(?:public|sign|authenticated)\/)?([a-z0-9_-]+)\/([^?#]+)/i;
  const ATTRS = ['src', 'href', 'poster', 'data-src', 'data-alt-src'];

  function siteBase() {
    const cfg = window.SOUBLU_CONFIG || {};
    const base = String(cfg.SITE_URL || cfg.API_BASE_URL || '').replace(/\/+$/, '');
    return base || window.location.origin;
  }

  function fixUrl(url) {
    const s = String(url || '').trim();
    if (!s || s.indexOf('.supabase.co/storage/') === -1) return null;
    const m = RX.exec(s);
    if (!m) return null;
    let bucket = m[1].toLowerCase();
    if (!BUCKETS.has(bucket)) return null;
    if (bucket === 'propostas') bucket = 'proposal-attachments';
    let obj = m[2];
    try { obj = decodeURIComponent(obj); } catch (_) { /* mantém cru */ }
    obj = obj.replace(/^\/+|\/+$/g, '');
    if (!obj) return null;
    return siteBase() + '/api/file.php?path=' + encodeURIComponent(bucket + '/' + obj);
  }

  /** Uso manual: SOUBLU_fixStorageUrl(url) → URL do file.php (ou a própria url). */
  window.SOUBLU_fixStorageUrl = function (url) { return fixUrl(url) || url; };

  function fixEl(el) {
    if (!el || el.nodeType !== 1 || !el.getAttribute) return;
    for (let i = 0; i < ATTRS.length; i++) {
      const v = el.getAttribute(ATTRS[i]);
      if (!v || v.indexOf('supabase.co') === -1) continue;
      const f = fixUrl(v);
      if (f) el.setAttribute(ATTRS[i], f);
    }
  }

  function fixTree(root) {
    if (!root || !root.querySelectorAll) return;
    fixEl(root);
    const list = root.querySelectorAll('[src*="supabase.co"],[href*="supabase.co"],[poster*="supabase.co"],[data-src*="supabase.co"],[data-alt-src*="supabase.co"]');
    for (let i = 0; i < list.length; i++) fixEl(list[i]);
  }

  try {
    const mo = new MutationObserver(function (muts) {
      for (let i = 0; i < muts.length; i++) {
        const m = muts[i];
        if (m.type === 'attributes') {
          fixEl(m.target);
        } else if (m.addedNodes) {
          for (let j = 0; j < m.addedNodes.length; j++) fixTree(m.addedNodes[j]);
        }
      }
    });
    mo.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ATTRS,
    });
  } catch (_) { /* navegador antigo: fica só com o fetch/open */ }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { fixTree(document.documentElement); });
  } else {
    fixTree(document.documentElement);
  }

  /* Leituras de arquivo via fetch (visualizador de PDF/blob). Upload ao Storage (POST) segue intacto. */
  if (typeof window.fetch === 'function') {
    const origFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        if (method === 'GET' || method === 'HEAD') {
          if (typeof input === 'string') {
            const f = fixUrl(input);
            if (f) input = f;
          } else if (input && typeof input.url === 'string' && typeof Request !== 'undefined' && input instanceof Request) {
            const f = fixUrl(input.url);
            if (f) input = new Request(f, input);
          }
        }
      } catch (_) { /* segue com o original */ }
      return origFetch.call(this, input, init);
    };
  }

  if (typeof window.open === 'function') {
    const origOpen = window.open;
    window.open = function (url) {
      const f = fixUrl(url);
      const args = Array.prototype.slice.call(arguments);
      if (f) args[0] = f;
      return origOpen.apply(this, args);
    };
  }
})();


/* Clube Benefícios desligado (CLUBE_BENEFICIOS_ENABLED = false): esconde o menu do clube, como antes.
   Sem isso, o item abre a página do clube num iframe, ela redireciona pro painel e aparece "painel dentro do painel". */
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof window.isClubeBeneficiosEnabled !== 'function' || window.isClubeBeneficiosEnabled()) return;
  const SEL = '.nav-item[data-section="secClubeBeneficios"], #navClubeBeneficios, [onclick*="clube-beneficios"], [onclick*="clubeBeneficiosPageHref"], a[href*="clube-beneficios"]';
  const hide = () => {
    document.querySelectorAll(SEL).forEach((el) => { el.style.setProperty('display', 'none', 'important'); el.setAttribute('aria-hidden', 'true'); });
    const sec = document.getElementById('secClubeBeneficios');
    if (sec && sec.classList.contains('active') && typeof window.navigateTo === 'function') window.navigateTo('secDashboard');
  };
  const start = () => {
    hide();
    try { new MutationObserver(hide).observe(document.body, { childList: true, subtree: true }); } catch (_) { /* navegador antigo */ }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
