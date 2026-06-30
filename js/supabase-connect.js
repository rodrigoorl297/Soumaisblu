/* Conexão Supabase — carregar antes de config.js */
(function () {
  const cfg = (typeof window !== 'undefined' && window.SOUBLU_CONFIG) ? window.SOUBLU_CONFIG : {};
  window.SOUBLU_CONFIG = Object.assign({
    SUPABASE_URL: 'https://cpqediswbjxcvpnwflyj.supabase.co',
    /** Chave pública (anon) — soublu-v2 sa-east-1 */
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwcWVkaXN3Ymp4Y3ZwbndmbHlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNzc1MDEsImV4cCI6MjA5NzY1MzUwMX0.oe_njTabnKBVvopX7INporQQMMaI3dyFRDmLCuCOtWE',
  }, cfg);
})();
