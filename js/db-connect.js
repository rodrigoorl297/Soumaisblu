/**
 * SOU+BLU — Produção (Locaweb): MySQL via /api/rest/v1/ + PIX PHP.
 * Localhost :8080 = MySQL Locaweb (mesmo banco soumaisblu). Override: FORCE_SUPABASE.
 */
(function () {
  const c = window.SOUBLU_CONFIG = window.SOUBLU_CONFIG || {};
  const PROD_SITE = String(c.PIX_REMOTE_SITE || 'https://www.soumaisblu.com.br').replace(/\/+$/, '');
  const host = String(location.hostname || '').toLowerCase();
  const proto = String(location.protocol || '');
  const isLocal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '' ||
    proto === 'file:';
  const origin = String(location.origin || '').replace(/\/+$/, '');
  const port = String(location.port || '');

  /**
   * PIX PHP roda no servidor (config.pix.local.php + certificado Efi).
   * Painel aberto em localhost/arquivo sem PHP na porta 8080 deve chamar o site publicado.
   */
  const STATIC_DEV_PORTS = new Set(['8000', '5500', '5173', '3000', '4173']);
  const isLocalPhpDev = isLocal && port && !STATIC_DEV_PORTS.has(port);

  function resolvePhpApiBase() {
    /* Servidor PHP local (php -S com router-dev.php) — API no mesmo origin */
    if (c.FORCE_LOCAL_PIX === true || isLocalPhpDev) {
      if (origin && origin !== 'null') return origin;
      const h = location.hostname || '127.0.0.1';
      const p = port || '8080';
      return 'http://' + h + ':' + p;
    }
    if (isLocal) return PROD_SITE;
    return origin || c.SITE_URL || PROD_SITE;
  }

  const phpApiBase = resolvePhpApiBase();

  /* SITE_URL: origem do painel (local ou produção). PIX/upload: servidor PHP acima. */
  const panelBase = isLocal
    ? (origin && origin !== 'null' ? origin : PROD_SITE)
    : (origin || c.SITE_URL || PROD_SITE);

  const SUPABASE_URL = 'https://dqptnlywbarvznpzgtuj.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcHRubHl3YmFydnpucHpndHVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NzQ5NTEsImV4cCI6MjA5NDE1MDk1MX0.ntbw10N2fno5hbdLWaKgz11jk-n2gvxZ7zjI0O_Xt1I';

  c.API_KEY = c.API_KEY || 'soublu_api_52e8c7a6b3df4019';
  c.PIX_INTERNAL_TOKEN = c.PIX_INTERNAL_TOKEN || 'soublu_pix_52e8c7a6b3df4019';
  c.PIX_PHP_PAY_URL = phpApiBase + '/api/pix_api.php';
  c.UPLOAD_URL = phpApiBase + '/api/upload.php';
  c.FONTE_DATA_URL = phpApiBase + '/api/fontedata.php';
  c.FONTE_DATA_TOKEN = c.FONTE_DATA_TOKEN || c.PIX_INTERNAL_TOKEN;
  c.SITE_URL = panelBase;

  /**
   * Banco de dados:
   * - Produção (soumaisblu.com.br) → MySQL Locaweb via /api/rest/v1/
   * - Localhost :8080 com PHP → mesmo MySQL Locaweb (config.db.local.php)
   * - Outros localhost → Supabase dev (fallback)
   */
  const useLocawebMysql = c.FORCE_SUPABASE !== true;

  if (useLocawebMysql) {
    c.FORCE_HOSTINGER = true;
  }

  /** Roleta desativada — campanha encerrada (oculta menu, perfil e giros). */
  c.ROULETTE_ENABLED = false;
  c.ROULETTE_MAINTENANCE = true;
  c.ROULETTE_MAINTENANCE_MSG = c.ROULETTE_MAINTENANCE_MSG
    || 'A roleta premiada não está mais disponível.';

  if (c.FORCE_HOSTINGER === true && c.FORCE_SUPABASE !== true) {
    c.DB_BACKEND = 'hostinger';
    c.API_BASE_URL = phpApiBase;
    /* Storage Supabase: anexos legados + fallback de upload (API REST usa MySQL). */
    c.STORAGE_URL = c.STORAGE_URL || SUPABASE_URL;
    c.STORAGE_KEY = c.STORAGE_KEY || SUPABASE_ANON_KEY;
    delete c.SUPABASE_URL;
    delete c.SUPABASE_ANON_KEY;
    delete c.SUPABASE_KEY;
  } else {
    c.DB_BACKEND = 'supabase';
    c.FORCE_SUPABASE = true;
    c.SUPABASE_URL = c.SUPABASE_URL || SUPABASE_URL;
    c.SUPABASE_ANON_KEY = c.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;
    c.PROPOSALS_BANCO_DIGITADO_COLUMN = true;
    delete c.API_BASE_URL;
    delete c.FORCE_HOSTINGER;
  }
})();
