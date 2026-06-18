/**
 * SOU+BLU — proteções básicas no cliente (produção).
 * Complementa RLS/constraints no Supabase; não substitui auth server-side.
 */
(function () {
  if (typeof window === 'undefined') return;

  const host = String(window.location.hostname || '').toLowerCase();
  const isLocal =
    host === '' ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    window.location.protocol === 'file:';

  /** Remove truques de debug da roleta em produção (localStorage manipulável). */
  if (!isLocal) {
    try {
      localStorage.removeItem('soublu_roulette_unlimited');
    } catch (_) { /* noop */ }
    const cfg = window.SOUBLU_CONFIG || {};
    if (cfg.ROULETTE_UNLIMITED_COINS === true) {
      cfg.ROULETTE_UNLIMITED_COINS = false;
    }
  }

  /** Evita sobrescrever tokens críticos via console em sessão normal. */
  window.SouBluSecurity = {
    isLocalDev() {
      return isLocal;
    },
    assertSessionUser(expectedId) {
      if (!expectedId) return false;
      try {
        const raw = localStorage.getItem('soublu_session');
        if (!raw) return false;
        const s = JSON.parse(raw);
        return String(s?.id || '') === String(expectedId);
      } catch (_) {
        return false;
      }
    },
  };
})();
