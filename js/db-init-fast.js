/**
 * db-init-fast — o painel não espera migração de RH/tabelas no boot.
 * db.init() travava >25s e o admin ficava em "Carregando painel…".
 * Usuários ainda são conferidos (máx. 4s). Migrações só 45s depois, sem bloquear.
 */
(function () {
  function installClientBankColumns() {
    const DB = window.DB;
    if (!DB || typeof DB._clientDbColumns !== 'function' || DB.__clientBankCols) return !!DB;
    DB.__clientBankCols = true;
    const orig = DB._clientDbColumns.bind(DB);
    /**
     * Inclui banco, agência e conta no save do cliente.
     * A lista antiga descartava esses campos e a conta sumia depois de salvar.
     */
    DB._clientDbColumns = function () {
      const set = orig();
      ['banco', 'agencia', 'conta'].forEach((col) => set.add(col));
      return set;
    };
    return true;
  }

  function install() {
    const DB = window.DB;
    if (!DB || typeof DB.init !== 'function' || DB.__initFast) return !!DB;
    DB.__initFast = true;
    const orig = DB.init.bind(DB);
    DB.init = async function () {
      this._stripLegacyDemoUsersLocal?.();
      this.clearAllUsersCache?.();
      if (typeof _cacheDel === 'function') _cacheDel('users');
      if (!this.online) return orig();
      try {
        await Promise.race([
          typeof this._ensureOnlineUsersOnce === 'function'
            ? this._ensureOnlineUsersOnce()
            : Promise.resolve(),
          new Promise((resolve) => setTimeout(resolve, 4000)),
        ]);
      } catch (_) { /* segue o painel mesmo se a lista de usuários atrasar */ }
      // Migração no boot abria vários PHP ao mesmo tempo e o nginx respondia 429.
      const db = this;
      setTimeout(() => {
        if (typeof db._purgeLegacyDemoUsersOnce === 'function') db._purgeLegacyDemoUsersOnce().catch(() => null);
        if (typeof db.ensurePersistTablesOnline === 'function') db.ensurePersistTablesOnline().catch(() => null);
        if (typeof db.ensureRhTablesOnline === 'function') db.ensureRhTablesOnline().catch(() => null);
      }, 45000);
    };
    return true;
  }
  function bootInstall() {
    const okInit = install();
    const okBank = installClientBankColumns();
    return okInit && okBank;
  }
  if (!bootInstall()) {
    document.addEventListener('DOMContentLoaded', bootInstall);
    let n = 0;
    const t = setInterval(function () {
      n += 1;
      if (bootInstall() || n > 40) clearInterval(t);
    }, 50);
  }
})();
