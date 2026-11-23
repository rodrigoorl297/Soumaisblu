/**
 * conta-bloqueio-saque — conta bloqueada trava só o saque.
 * Digitar proposta continua liberado (DB.isProposalCreateBlocked já devolve false).
 */
(function () {
  /**
   * freshUser — lê o cadastro atual (não o cache antigo da sessão).
   */
  async function freshUser() {
    let u = window.currentUser || null;
    if (typeof resolveEmployeeUser === 'function') {
      try { u = (await resolveEmployeeUser()) || u; } catch (_) { /* segue com o que tiver */ }
    }
    if (u && u.id && typeof DB !== 'undefined' && typeof DB.getUser === 'function') {
      try {
        const fresh = await DB.getUser(u.id, true);
        if (fresh) u = fresh;
      } catch (_) { /* overlay não impede o saque se a leitura falhar */ }
    }
    return u;
  }

  /**
   * blockMessage — texto do toast. O motivo vem do código 001–005.
   */
  function blockMessage(u) {
    let motive = '';
    if (typeof DB !== 'undefined' && typeof DB.formatAccountBlockMotive === 'function') {
      motive = DB.formatAccountBlockMotive(u) || '';
    }
    return motive
      ? 'Conta bloqueada (' + motive + '). O bloqueio impede só o saque. A proposta continua liberada.'
      : 'Conta bloqueada. O bloqueio impede só o saque. A proposta continua liberada.';
  }

  /**
   * refuseIfBlocked — true quando o saque deve ser interrompido.
   */
  async function refuseIfBlocked() {
    const u = await freshUser();
    if (!u || typeof DB === 'undefined' || typeof DB.isAccountBlocked !== 'function') return false;
    if (!DB.isAccountBlocked(u)) return false;
    if (typeof showToast === 'function') showToast(blockMessage(u), 'warning', 7000);
    return true;
  }

  function install() {
    if (typeof openWithdrawalModal === 'function' && !openWithdrawalModal.__saqueBlock) {
      const origOpen = openWithdrawalModal;
      window.openWithdrawalModal = async function () {
        if (await refuseIfBlocked()) return;
        return origOpen.apply(this, arguments);
      };
      window.openWithdrawalModal.__saqueBlock = true;
    }
    if (typeof executeWithdrawal === 'function' && !executeWithdrawal.__saqueBlock) {
      const origExec = executeWithdrawal;
      window.executeWithdrawal = async function () {
        if (await refuseIfBlocked()) return;
        return origExec.apply(this, arguments);
      };
      window.executeWithdrawal.__saqueBlock = true;
    }
    return !!(window.openWithdrawalModal && window.openWithdrawalModal.__saqueBlock);
  }

  install();
  document.addEventListener('DOMContentLoaded', install);
  window.addEventListener('load', install);
  let n = 0;
  const t = setInterval(function () {
    n += 1;
    if (install() || n > 40) clearInterval(t);
  }, 250);
})();
