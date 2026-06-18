/**
 * PIX Efi — URL da API PHP e token interno (browser → api/pix_api.php).
 * Credenciais Efi ficam só em config.pix.local.php no servidor.
 */
(function () {
  const c = window.SOUBLU_CONFIG = window.SOUBLU_CONFIG || {};
  const PROD = String(c.PIX_REMOTE_SITE || 'https://www.soumaisblu.com.br').replace(/\/+$/, '');
  const host = String(location.hostname || '').toLowerCase();
  const local =
    /^(localhost|127\.0\.0\.1)$/i.test(host) ||
    host === '' ||
    location.protocol === 'file:';
  if (!c.PIX_INTERNAL_TOKEN) {
    c.PIX_INTERNAL_TOKEN = 'soublu_pix_52e8c7a6b3df4019';
  }
  if (!c.PIX_PHP_PAY_URL) {
    const port = String(location.port || '');
    let phpOrigin = PROD;
    if (local) {
      phpOrigin = c.FORCE_LOCAL_PIX === true || port === '8080'
        ? 'http://' + (location.hostname || '127.0.0.1') + ':8080'
        : PROD;
    } else {
      const origin = String(location.origin || '').replace(/\/+$/, '');
      phpOrigin = origin || PROD;
    }
    c.PIX_PHP_PAY_URL = `${phpOrigin}/api/pix_api.php`;
  }
  if (typeof window.PIX_AUTO_ON_APPROVAL === 'undefined') {
    window.PIX_AUTO_ON_APPROVAL = true;
  }
})();
