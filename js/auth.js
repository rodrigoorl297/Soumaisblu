/* SOU + BLU – Auth v3 */

const Auth = {
  SESSION_KEY: 'soublu_session',

  /** Detecta se o HTML atual está em /pages/ (file:// e http, com ou sem \\ no path). */
  _isInPagesDir() {
    try {
      const href = decodeURIComponent(String(window.location.href || ''));
      if (/[\\/]pages[\\/]/i.test(href)) return true;
      const path = String(window.location.pathname || '').replace(/\\/g, '/');
      return /(^|\/)pages(\/|$)/i.test(path);
    } catch (e) {
      return false;
    }
  },

  /**
   * Resolve caminho relativo usando a URL completa do documento (file:// com espaços, etc.).
   * Evita ERR_FILE_NOT_FOUND ao sair / expirar sessão quando <base> ou pathname falham.
   */
  resolveHref(rel) {
    try {
      return new URL(rel, window.location.href).href;
    } catch (e) {
      return rel;
    }
  },

  /** Caminho correto para HTML em /pages/ — evita /pages/pages/ quando já está em pages/. */
  pageHref(filename) {
    const name = String(filename || '').replace(/^\/+/, '').replace(/^pages\//, '');
    const rel = this._isInPagesDir() ? name : `pages/${name}`;
    return this.resolveHref(rel);
  },

  loginPageHref() {
    const rel = this._isInPagesDir() ? '../index.html' : 'index.html';
    return this.resolveHref(rel);
  },

  employeePageHref() { return this.pageHref('employee.html'); },
  adminPageHref() { return this.pageHref('admin.html'); },

  /** Força recarga da página (evita bfcache que congela requisições ao banco). */
  pageHrefFresh(filename) {
    try {
      const u = new URL(this.pageHref(filename));
      u.searchParams.set('_r', Date.now().toString(36));
      return u.href;
    } catch (e) {
      const base = this.pageHref(filename);
      const sep = base.includes('?') ? '&' : '?';
      return `${base}${sep}_r=${Date.now().toString(36)}`;
    }
  },

  /** Volta ao painel forçando recarga (evita bfcache que congela a conexão com o banco). */
  adminPageHrefFresh() {
    return this.pageHrefFresh('admin.html');
  },
  financeiroPageHref() { return this.pageHref('financeiro.html'); },
  financeiroPageHrefFresh() { return this.pageHrefFresh('financeiro.html'); },
  leadsManagerPageHref() { return this.pageHref('leads-manager.html'); },
  leadsEmployeePageHref() { return this.pageHref('leads-employee.html'); },
  rhManagerPageHref() { return this.pageHref('rh-manager.html'); },
  rhManagerPageHrefFresh() { return this.pageHrefFresh('rh-manager.html'); },
  juridicoManagerPageHref() { return this.pageHref('juridico-manager.html'); },
  juridicoManagerPageHrefFresh() { return this.pageHrefFresh('juridico-manager.html'); },
  monitoriaAtendimentoPageHref() { return this.pageHref('monitoria-atendimento.html'); },
  monitoriaAtendimentoPageHrefFresh() { return this.pageHrefFresh('monitoria-atendimento.html'); },
  monitoramentoPageHref() { return this.monitoriaAtendimentoPageHref(); },
  monitoramentoPageHrefFresh() { return this.monitoriaAtendimentoPageHrefFresh(); },

  /** Monitoria de Atendimento — departamento administrativo interno. */
  canAccessMonitoriaAtendimento() {
    const s = this.getSession();
    if (!s || window.PARTNER_ROOT_ID) return false;
    const r = String(s.role || '').toLowerCase();
    return ['master', 'fundador', 'desenvolvedor', 'gerente', 'supervisor', 'backoffice',
      'operacional', 'sup_backoffice', 'rh', 'ouvidoria', 'admin', 'diretoria'].includes(r);
  },

  /** Hub Jurídico (rh-manager com chrome jurídico). */
  canAccessJuridicoHub() {
    const s = this.getSession();
    if (!s || window.PARTNER_ROOT_ID) return false;
    const r = String(s.role || '').toLowerCase();
    return ['juridico', 'master', 'fundador', 'rh', 'gerencia'].includes(r);
  },
  folhaPagamentoPageHref() { return this.pageHref('folha-pagamento.html'); },
  folhaPagamentoPageHrefFresh() { return this.pageHrefFresh('folha-pagamento.html'); },
  treinamentosPageHref() { return this.pageHref('treinamentos.html'); },
  treinamentosPageHrefFresh() { return this.pageHrefFresh('treinamentos.html'); },
  clubeBeneficiosPageHref() { return this.pageHref('clube-beneficios.html'); },
  adminBeneficiosPageHref() { return this.pageHref('admin-beneficios.html'); },
  clubeBeneficiosPageHrefFresh() { return this.pageHrefFresh('clube-beneficios.html'); },
  adminBeneficiosPageHrefFresh() { return this.pageHrefFresh('admin-beneficios.html'); },

  /** Roles que entram no painel admin (gestão). Vendedor → área do colaborador. */
  ADMIN_PANEL_ROLES: [
    'master', 'fundador', 'desenvolvedor', 'gerente', 'financeiro', 'financial',
    'supervisor', 'sup_backoffice', 'parceiro', 'rh', 'gerencia', 'operacional', 'juridico',
    'diretoria', 'backoffice', 'ouvidoria', 'admin', 'portaria',
  ],

  isParceiro() {
    const s = this.getSession();
    return !!(s && s.role === 'parceiro');
  },

  isPortaria() {
    const s = this.getSession();
    return !!(s && String(s.role || '').toLowerCase() === 'portaria');
  },

  usesAdminPanel(role) {
    return this.ADMIN_PANEL_ROLES.includes(String(role || '').toLowerCase());
  },

  /** Gestão Benefícios (admin-beneficios) — somente master/fundador e financeiro. */
  canManageBeneficios(role) {
    const r = String(role || '').toLowerCase();
    return r === 'master' || r === 'fundador' || r === 'financeiro' || r === 'financial';
  },

  /** Painel Master (Dashboard + Painel Master) — master, fundador, financeiro e RH. */
  hasMasterPanel() {
    const s = this.getSession();
    const role = String(s?.role || '').toLowerCase();
    return !!(s && (role === 'master' || role === 'fundador' || role === 'financeiro' || role === 'financial' || role === 'rh'));
  },

  isFinanceiroOnly() {
    const s = this.getSession();
    const role = String(s?.role || '').toLowerCase();
    return (role === 'financeiro' || role === 'financial') && !this.isMaster();
  },

  defaultAppHref() {
    const s = this.getSession();
    if (!s) return this.loginPageHref();
    const role = String(s.role || '').toLowerCase();
    if (role === 'juridico') return this.juridicoManagerPageHref();
    if (role === 'portaria' || this.usesAdminPanel(role)) return this.adminPageHref();
    return this.employeePageHref();
  },

  requireMasterPanel() {
    if (!this.hasMasterPanel()) {
      window.location.replace(this.employeePageHref());
      throw new Error('AUTH_REDIRECT');
    }
  },

  _writeSession(session) {
    const data = JSON.stringify(session);
    localStorage.setItem(this.SESSION_KEY, data);
    sessionStorage.setItem(this.SESSION_KEY, data);
  },

  _sessionFromUser(user, loginAt) {
    const role = String(user.role || '').trim().toLowerCase();
    const permissions = (user.permissions && typeof user.permissions === 'object')
      ? user.permissions
      : {};
    return {
      id: user.id,
      role,
      name: user.name,
      email: user.email,
      adminId: user.admin_id || user.id,
      permissions,
      loginAt: loginAt || Date.now(),
    };
  },

  /**
   * Atualiza sessão com o banco (evita PC com role/id antigo — ex.: parceiro virando "colaborador").
   * Se o e-mail tiver cadastro duplicado, prioriza conta parceiro ativa (mesma regra do login).
   */
  async syncSessionFromDb() {
    const s = this.getSession();
    if (!s?.id) return null;
    try {
      let user = await DB.getUser(s.id);
      if (!user || user.active === false) {
        this._clear();
        return null;
      }
      const email = (user.email || '').trim().toLowerCase();
      if (email && typeof DB.getUserByEmail === 'function') {
        const preferred = await DB.getUserByEmail(email);
        if (preferred && preferred.active !== false && preferred.id !== user.id) {
          const curRole = String(user.role || '').trim().toLowerCase();
          const prefRole = String(preferred.role || '').trim().toLowerCase();
          if (prefRole === 'parceiro' && curRole !== 'parceiro') {
            user = preferred;
          } else if (typeof DB._pickPreferredEmailUser === 'function') {
            const best = DB._pickPreferredEmailUser([user, preferred]);
            if (best?.id && best.id !== user.id) user = best;
          }
        }
      }
      const next = this._sessionFromUser(user, s.loginAt);
      const changed = next.id !== s.id || next.role !== s.role || next.name !== s.name
        || JSON.stringify(next.permissions || {}) !== JSON.stringify(s.permissions || {});
      this._writeSession(next);
      if (changed) {
        try { sessionStorage.setItem('soublu_session_synced', String(Date.now())); } catch (_) { /* noop */ }
      }
      return next;
    } catch (e) {
      console.warn('[Auth] syncSessionFromDb:', e);
      return s;
    }
  },

  async login(identifier, password) {
    const user = await DB.findUserByIdentifier(identifier);
    if (!user) return { ok:false, msg:'Usuário não encontrado.' };
    if (!user.active) return { ok:false, msg:'Conta desativada. Fale com o RH.' };
    if (user.password !== password) return { ok:false, msg:'Senha incorreta.' };

    if (user.is_lead_locked) {
      return { ok:false, msg: user.lead_lock_reason || 'Sua conta está bloqueada por não atingir a meta diária de leads. Aguarde aprovação do gerente.' };
    }

    this.clearWaSessionStorage();
    const session = this._sessionFromUser(user, Date.now());
    this._writeSession(session);
    if (typeof DB !== 'undefined' && typeof DB.relinkOrphanProposalsForUser === 'function') {
      try {
        DB.relinkOrphanProposalsForUser(user).catch((e) =>
          console.warn('[Auth] relink orphans:', e?.message || e)
        );
      } catch (e) {
        console.warn('[Auth] relink orphans:', e);
      }
    }
    if (typeof AttendancePenalty !== 'undefined' && AttendancePenalty.onLogin) {
      // try { await AttendancePenalty.onLogin(user); } catch (e) { console.warn('[Auth] attendance:', e); }
    }
    if (typeof VendorTierPoints !== 'undefined' && VendorTierPoints.onLogin) {
      try { await VendorTierPoints.onLogin(user); } catch (e) { console.warn('[Auth] vendor tier:', e); }
    }
    return { ok:true, user };
  },

  /** Remove caches locais do WhatsApp CRM (evita vazamento entre logins). */
  clearWaSessionStorage() {
    try {
      const keys = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && (k.startsWith('soublu_wa_') || k === 'soublu_wa_active_uid')) keys.push(k);
      }
      keys.forEach((k) => sessionStorage.removeItem(k));
    } catch (_) { /* noop */ }
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('soublu_wa_')) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch (_) { /* noop */ }
    try { delete window._waContactCache; } catch (_) { /* noop */ }
  },

  /** Desconecta a sessão WhatsApp do user atual (fire-and-forget). */
  _disconnectWhatsAppBestEffort(userId) {
    if (!userId) return;
    try {
      const c = window.SOUBLU_CONFIG || {};
      const base = String(c.API_BASE_URL || c.SITE_URL || location.origin || '').replace(/\/+$/, '');
      const key = c.API_KEY || '';
      if (!base || !key) return;
      const url = `${base}/api/whatsapp_api.php?action=disconnect&user_id=${encodeURIComponent(userId)}&apikey=${encodeURIComponent(key)}`;
      const body = JSON.stringify({ user_id: userId });
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(url, blob);
      } else {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': key, apikey: key },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch (_) { /* noop */ }
  },

  logout() {
    const s = this.getSession();
    const uid = s?.id || null;
    if (uid) this._disconnectWhatsAppBestEffort(uid);
    if (typeof WhatsAppChat !== 'undefined' && typeof WhatsAppChat.hardResetLocalState === 'function') {
      try { WhatsAppChat.hardResetLocalState(); } catch (_) { /* noop */ }
    }
    this._clear();
    window.location.replace(this.loginPageHref());
  },

  getSession() {
    const raw = sessionStorage.getItem(this.SESSION_KEY) || localStorage.getItem(this.SESSION_KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      if (s && s.role != null) s.role = String(s.role).trim().toLowerCase();
      return s;
    } catch (e) { return null; }
  },

  async isLoggedIn() {
    const s = this.getSession();
    if (!s) return false;
    try {
      const user = await DB.getUser(s.id);
      if (!user || !user.active) { this._clear(); return false; }
      return true;
    } catch (e) { return !!s; }
  },

  /* master, admin, supervisor ou financial, etc (todos que tem visão de admin) */
  isAdmin() {
    const s = this.getSession();
    return !!(s && this.usesAdminPanel(s.role));
  },

  /* master ou fundador (Rodrigo / topo da hierarquia) — mesmo poder no painel e propostas */
  isMaster() {
    const s = this.getSession();
    if (!s) return false;
    
    // Explicit master check
    if (s.role === 'master' || s.role === 'fundador') return true;

    // Emails with master access for both Painel and Propostas (without losing their primary role functionality)
    const masterEmails = ['gabi@blupromotora.com.br', 'flaviahonda@gmail.com'];
    if (masterEmails.includes(s.email?.trim().toLowerCase())) return true;

    return false;
  },

  isFundador() {
    const s = this.getSession();
    return !!(s && s.role === 'fundador');
  },

  async requireLogin() {
    const ok = await this.isLoggedIn();
    if (!ok) {
      this._clear();
      window.location.replace(this.loginPageHref());
      throw new Error('AUTH_REDIRECT');
    }
    await this.syncSessionFromDb();
    const u = await DB.getUser(this.getSession()?.id).catch(() => null);
    if (typeof AttendancePenalty !== 'undefined' && AttendancePenalty.onLogin && u) {
      // try { await AttendancePenalty.onLogin(u); } catch (e) { console.warn('[Auth] attendance:', e); }
    }
    if (typeof VendorTierPoints !== 'undefined' && VendorTierPoints.onLogin && u) {
      try {
        await Promise.race([
          VendorTierPoints.onLogin(u),
          new Promise((_, reject) => setTimeout(() => reject(new Error('vendor tier timeout')), 8000)),
        ]);
      } catch (e) { console.warn('[Auth] vendor tier:', e); }
    }
    if (window.location.protocol !== 'file:' && !window.SOUBLU_SKIP_BACK_TRAP) {
      window.history.pushState(null,'',window.location.href);
      window.addEventListener('popstate',()=>window.history.pushState(null,'',window.location.href));
    }
  },

  requireAdmin() {
    const s = this.getSession();
    const role = String(s?.role || '').toLowerCase();
    const ok = !!(s && (this.usesAdminPanel(role) || this.isPortaria() || window.SOUBLU_PORTARIA_BOOT));
    if (!ok) {
      window.location.replace(this.employeePageHref());
      throw new Error('AUTH_REDIRECT');
    }
  },

  /* ══ REGRAS DE NEGÓCIO DE CHAMADOS ══ */
  canOpenTicketTo(department) {
    const s = this.getSession();
    if (!s) return false;
    const role = String(s.role || '').toLowerCase();
    // Baseado na tabela de "quem abre"
    if (['vendedor','backoffice','portaria'].includes(role)) {
      return ['Financeiro', 'RH', 'Operacional', 'Supervisão', 'Ouvidoria', 'Desenvolvimento', 'TI'].includes(department);
    }
    if (role === 'supervisor') {
      return ['Financeiro', 'RH', 'Operacional', 'Supervisão', 'Gerência', 'Ouvidoria', 'Desenvolvimento', 'TI'].includes(department);
    }
    if (role === 'parceiro') {
      try {
        if (typeof window !== 'undefined' && window._PARTNER_PERMS && typeof PartnerPerms !== 'undefined'
          && !PartnerPerms.can(window._PARTNER_PERMS, 'abrir_chamados_operacional')) {
          return false;
        }
      } catch (_) { /* noop */ }
      return department === 'Operacional';
    }
    // Gerência / Master / Fundador / Financeiro / RH / Jurídico / Diretoria / Desenvolvimento / TI podem direcionar para estes deptos.
    return ['Financeiro', 'RH', 'Operacional', 'Supervisão', 'Gerência', 'Jurídico', 'Diretoria', 'Ouvidoria', 'Desenvolvimento', 'TI'].includes(department);
  },

  /** Visão global da esteira de chamados (Painel Master). */
  canSeeAllTickets() {
    const s = this.getSession();
    if (!s) return false;
    if (this.isMaster()) return true;
    if (typeof this.hasMasterPanel === 'function' && this.hasMasterPanel()) return true;
    const role = String(s.role || '').toLowerCase();
    if (role === 'diretoria' || role === 'desenvolvedor' || role === 'desenvolvimento') return true;
    const p = (s.permissions && typeof s.permissions === 'object') ? s.permissions : {};
    return !!(p.canSeeAllTickets || p.canMasterPanel);
  },

  canReplyToTicket(department) {
    const s = this.getSession();
    if (!s) return false;
    if (this.canSeeAllTickets()) return true;
    const role = String(s.role || '').toLowerCase();

    // "quem trata (responde)"
    switch (department) {
      case 'RH': return ['rh', 'gerencia', 'juridico'].includes(role);
      case 'Financeiro': return role === 'financeiro';
      case 'Operacional': return role === 'sup_backoffice';
      case 'Supervisão': return ['supervisor', 'gerente', 'gerencia'].includes(role);
      case 'Ouvidoria': return ['rh', 'ouvidoria', 'gerente', 'gerencia'].includes(role);
      case 'Gerência': return ['gerente', 'gerencia'].includes(role);
      case 'Jurídico': return role === 'juridico';
      case 'Diretoria': return role === 'diretoria';
      case 'Desenvolvimento':
        return ['desenvolvedor', 'desenvolvimento', 'fundador', 'master', 'diretoria'].includes(role);
      case 'TI':
        return ['desenvolvedor', 'desenvolvimento', 'fundador', 'master', 'diretoria'].includes(role);
      default: return false;
    }
  },

  async getCurrentUser() {
    const s = this.getSession();
    if (!s) return null;
    try { return await DB.getUser(s.id); } catch (e) { return null; }
  },

  _clear() {
    this.clearWaSessionStorage();
    localStorage.removeItem(this.SESSION_KEY);
    sessionStorage.removeItem(this.SESSION_KEY);
    try {
      const keysToRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith('supa_cache_')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => sessionStorage.removeItem(k));
    } catch (_) {}
  },
};
