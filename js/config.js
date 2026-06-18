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
    const SUPABASE_CONFIGURED = !HOSTINGER_CONFIGURED && !!(SUPABASE_URL && SUPABASE_KEY);
    if (typeof window !== 'undefined') {
      window.SOUBLU_RUNTIME = {
        dbBackend: HOSTINGER_CONFIGURED ? 'hostinger' : (SUPABASE_CONFIGURED ? 'supabase' : 'local'),
        supabaseConfigured: SUPABASE_CONFIGURED,
        hostingerConfigured: HOSTINGER_CONFIGURED,
      };
    }
   
   const CACHE_TTL = 45000; // Cache de 45 segundos para consultas do Supabase
    
    function _cacheGet(key) {
      try {
        const raw = sessionStorage.getItem(`supa_cache_${key}`);
        if (!raw) return null;
        const e = JSON.parse(raw);
        if (e && Date.now() - e.ts < CACHE_TTL) return e.val;
        return null;
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

    async function supaReq(method, table, body = null, params = '') {
      const isLocalForce = false;
      if (isLocalForce || (!HOSTINGER_CONFIGURED && !SUPABASE_CONFIGURED)) {
          return await localSupaMock(method, table, body, params);
      }

     const cacheKey = method === 'GET' ? `${table}${params}` : null;
     if (cacheKey) {
       const hit = _cacheGet(cacheKey);
       if (hit) return hit;
     }

     const url = HOSTINGER_CONFIGURED
       ? `${API_BASE_URL}/api/rest/v1/${table}${params}`
       : `${SUPABASE_URL}/rest/v1/${table}${params}`;

     const headers = {
       'Content-Type': 'application/json',
       'Prefer': 'return=representation',
     };
     if (HOSTINGER_CONFIGURED) {
       headers['X-API-Key'] = API_KEY;
     } else {
       headers['apikey'] = SUPABASE_KEY;
       headers['Authorization'] = `Bearer ${SUPABASE_KEY}`;
     }

     let res;
     try {
       res = await fetch(url, {
         method,
         headers,
         body: body ? JSON.stringify(body) : undefined,
       });
     } catch (netErr) {
       const netMsg = netErr && netErr.message ? netErr.message : 'rede';
       const hint = HOSTINGER_CONFIGURED
         ? 'Confira se o site e a API (/api/rest/v1) estão no ar.'
         : 'Confira internet, bloqueador de anúncios ou status do Supabase.';
       throw new Error(`Sem conexão com o servidor (${netMsg}). ${hint}`);
     }

     if (!res.ok) {
       const e = await res.text();
       console.error(`ERRO ${method} ${table} (${res.status}):`, e);
       throw new Error(friendlyApiError(res.status, e));
     }
   
     const text = await res.text();
     const data = text ? JSON.parse(text) : [];
   
     /* Não cachear respostas vazias — evita "usuário não encontrado" fantasma por 8s */
     if (cacheKey && Array.isArray(data) ? data.length > 0 : data) _cacheSet(cacheKey, data);
     if (method !== 'GET') _cacheDel(table);
   
     return data;
   }
   
   // NOTE: User seed is handled by DB.init() in db.js → soublu_users
   // localSupaMock now maps 'users' table → 'soublu_users' so both systems share the same data
