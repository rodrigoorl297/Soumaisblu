/* Conexão Supabase — carregar antes de config.js */
(function () {
  const cfg = (typeof window !== 'undefined' && window.SOUBLU_CONFIG) ? window.SOUBLU_CONFIG : {};
  window.SOUBLU_CONFIG = Object.assign({
    SUPABASE_URL: 'https://dqptnlywbarvznpzgtuj.supabase.co',
    /** Chave pública (anon) — obrigatória no browser */
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcHRubHl3YmFydnpucHpndHVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NzQ5NTEsImV4cCI6MjA5NDE1MDk1MX0.ntbw10N2fno5hbdLWaKgz11jk-n2gvxZ7zjI0O_Xt1I',
  }, cfg);
})();
