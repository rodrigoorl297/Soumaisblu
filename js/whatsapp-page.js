/* SOU+BLU — Página dedicada WhatsApp CRM */
(function () {
  function backHref(session) {
    if (typeof Auth === 'undefined') return 'index.html';
    const role = String(session?.role || '').toLowerCase();
    if (role === 'financeiro' || role === 'financial') return Auth.pageHref('financeiro.html');
    if (['admin', 'gerente', 'gerencia', 'diretoria', 'desenvolvedor', 'fundador', 'master'].includes(role)) {
      return Auth.adminPageHref();
    }
    if (role === 'rh') return Auth.pageHref('rh-manager.html');
    if (role === 'juridico') return Auth.pageHref('juridico-manager.html');
    return Auth.employeePageHref();
  }

  function bindOverlayDismiss() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && window.WhatsAppChat?.closeChatOverlay) {
        WhatsAppChat.closeChatOverlay();
      }
    });
    document.addEventListener('click', (e) => {
      const overlay = document.getElementById('waChatOverlay');
      if (!overlay || overlay.classList.contains('is-hidden')) return;
      if (e.target === overlay) WhatsAppChat.closeChatOverlay();
    });
  }

  async function boot() {
    if (typeof Auth === 'undefined' || !Auth.getSession()) {
      window.location.href = typeof Auth !== 'undefined' && Auth.loginPageHref
        ? Auth.loginPageHref()
        : 'index.html';
      return;
    }

    const session = Auth.getSession();
    const backBtn = document.getElementById('waPageBackBtn');
    if (backBtn) {
      backBtn.addEventListener('click', () => { window.location.href = backHref(session); });
    }

    const monitorBtn = document.getElementById('waPageMonitorBtn');
    if (monitorBtn && typeof Auth !== 'undefined' && Auth.monitoramentoPageHref) {
      if (Auth.canAccessMonitoriaAtendimento?.()) {
        monitorBtn.href = Auth.monitoramentoPageHref();
      } else {
        monitorBtn.style.display = 'none';
      }
    }

    const userLine = document.getElementById('waPageUserLine');
    if (userLine) {
      userLine.textContent = session?.name
        ? `${session.name} — seu próprio WhatsApp`
        : 'Seu próprio WhatsApp';
    }

    if (!window.WhatsAppChat?.canAccess?.()) {
      if (typeof showToast === 'function') showToast('WhatsApp não disponível para seu perfil.', 'warning');
      setTimeout(() => { window.location.href = backHref(session); }, 1200);
      return;
    }

    bindOverlayDismiss();
    await WhatsAppChat.init();

    const params = new URLSearchParams(window.location.search);
    const phone = params.get('phone') || '';
    const name = params.get('name') || '';
    if (phone && WhatsAppChat.openChatByPhone) {
      try {
        await WhatsAppChat.openChatByPhone(phone, name);
      } catch (e) {
        console.error('[whatsapp-page]', e);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { boot().catch(console.error); });
  } else {
    boot().catch(console.error);
  }
})();
