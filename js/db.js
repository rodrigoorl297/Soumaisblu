/* =============================================
   SOU + BLU – Database v3
   Supabase (online) com fallback localStorage
   Master vê TUDO; Admin vê só sua equipe
   ============================================= */

   const DB = {
    get online() { return HOSTINGER_CONFIGURED || SUPABASE_CONFIGURED; },
    LK: {
      users:'soublu_users', products:'soublu_products',
      transactions:'soublu_transactions', orders:'soublu_orders', withdrawals:'soublu_withdrawals',
      clients:'soublu_clients', proposals:'soublu_proposals', tickets:'soublu_tickets',
      meetings:'soublu_meetings', partners:'soublu_partners',
      tim_referrals:'soublu_tim_referrals',
      contestations:'soublu_contestations',
      partner_fiscal:'soublu_partner_fiscal',
      trainings:'soublu_trainings',
      training_attempts:'soublu_training_attempts',
      training_mural:'soublu_training_mural',
      marketplace_services:'soublu_marketplace_services',
      marketplace_orders:'soublu_marketplace_orders',
      finance_suppliers:'soublu_finance_suppliers',
      finance_expenses:'soublu_finance_expenses',
      finance_adiantamento:'soublu_finance_adiantamento',
      finance_reembolso:'soublu_finance_reembolso',
      finance_proposta_ops:'soublu_finance_proposta_ops',
      rh_companies:'soublu_rh_companies',
      rh_resumes:'soublu_rh_resumes',
      rh_jobs:'soublu_rh_jobs',
      rh_employees:'soublu_rh_employees',
      rh_absence_justifications:'soublu_rh_absence_justifications',
      rh_punishments:'soublu_rh_punishments',
      rh_dismissals:'soublu_rh_dismissals',
      monitoria_atendimento:'soublu_monitoria_atendimento',
    },
    _genId(p='x') { return p+Date.now().toString(36)+Math.random().toString(36).slice(2,7); },
    _lget(k)      { try{return JSON.parse(localStorage.getItem(k)||'[]');}catch{return[];} },
    _lset(k,d)    { localStorage.setItem(k,JSON.stringify(d)); },

    normalizeEmail(email) {
      return String(email || '').trim().toLowerCase();
    },

    formatUserDbError(err) {
      const msg = String(err?.message || err || '');
      if (/23505/.test(msg) && /users_email|email/i.test(msg)) {
        return 'Este e-mail já está cadastrado. Use outro e-mail ou edite o usuário existente.';
      }
      if (/23505/.test(msg) && /matricula/i.test(msg)) {
        return 'Esta matrícula já está em uso. Informe outra matrícula.';
      }
      if (/23505/.test(msg)) return 'Já existe um cadastro com estes dados. Verifique e-mail e matrícula.';
      return msg.replace(/^POST users:\s*/i, '').replace(/^PATCH users:\s*/i, '') || 'Não foi possível salvar.';
    },

    async isEmailTaken(email, excludeUserId = null) {
      const em = this.normalizeEmail(email);
      if (!em) return false;
      const found = await this.getUserByEmail(em);
      if (!found) return false;
      if (excludeUserId && String(found.id) === String(excludeUserId)) return false;
      return true;
    },
  
    async init() {
      if (this.online) {
        await this._ensureOnlineUsersOnce();
        return;
      }

      const SEED_VERSION = 'v26';
      const storedVersion = localStorage.getItem('soublu_seed_version');
      if (storedVersion !== SEED_VERSION) {
        console.log('[DB] Seed offline (localStorage)');
        localStorage.setItem('soublu_seed_version', SEED_VERSION);
        this._lset(this.LK.users, this._seedUsers());
        this._lset(this.LK.products, this._seedProducts());
        this._lset(this.LK.transactions, this._seedTransactions());
        this._lset(this.LK.orders, []);
        this._lset(this.LK.withdrawals, []);
        this._lset(this.LK.clients, this._seedClients());
        this._lset(this.LK.proposals, []);
        this._lset(this.LK.tickets, []);
        this._lset(this.LK.tim_referrals, []);
        this._lset(this.LK.contestations, []);
        this._lset(this.LK.partner_fiscal, []);
        this._lset(this.LK.trainings, []);
        this._lset(this.LK.training_attempts, []);
        this._lset(this.LK.training_mural, []);
        this._lset(this.LK.marketplace_services, this._seedMarketplaceServices());
        this._lset(this.LK.marketplace_orders, []);
        this._lset(this.LK.finance_suppliers, []);
        this._lset(this.LK.finance_expenses, []);
        this._lset(this.LK.finance_adiantamento, []);
        this._lset(this.LK.finance_reembolso, []);
        this._lset(this.LK.finance_proposta_ops, []);
        this._lset(this.LK.rh_companies, []);
        this._lset(this.LK.rh_resumes, []);
        this._lset(this.LK.rh_jobs, []);
        this._lset(this.LK.rh_employees, []);
        this._lset(this.LK.rh_absence_justifications, []);
        this._lset(this.LK.rh_punishments, []);
        this._lset(this.LK.rh_dismissals, []);
        this._lset(this.LK.monitoria_atendimento, []);
      }
    },

    _seedMarketplaceServices() {
      const now = new Date().toISOString();
      const mk = (id, name, category, pts, emoji, apiType, apiConsulta, fulfillment, desc) => ({
        id, name, category, points_price: pts, emoji, api_type: apiType, api_consulta: apiConsulta,
        fulfillment: fulfillment || 'auto', description: desc || '', active: true, sort_order: 0,
        partner_root_id: null, created_by: 'sistema', created_at: now, updated_at: now,
      });
      return [
        mk('mks_cpf', 'Consulta CPF — Cadastro básico', 'Consultas', 15, '🔍', 'cpf', 'cadastro-pf-basica', 'auto',
          'Nome, telefones, e-mail, endereço e filiação via FonteData.'),
        mk('mks_cnpj', 'Consulta CNPJ — Receita Federal', 'Consultas', 25, '🏢', 'cnpj', 'consulta-cnpj-receita', 'auto',
          'Razão social, endereço, contato e representante legal.'),
        mk('mks_score', 'Score de crédito (Quod)', 'Consultas', 35, '📊', 'cnpj', 'score-credito-quod', 'auto',
          'Score de crédito do CNPJ consultado.'),
        mk('mks_tj', 'Certidão TJ — Cível, Criminal e Fiscal', 'Certidões', 45, '⚖️', 'cpf_cnpj', 'tj-certidao', 'auto',
          'Certidão unificada TJ para o CNPJ informado.'),
        mk('mks_analise', 'Análise documental', 'Suporte', 80, '📎', null, null, 'manual',
          'Revisão de documentação pelo backoffice (até 24h úteis).'),
        mk('mks_marketing', 'Kit marketing digital', 'Marketing', 120, '📣', null, null, 'manual',
          'Materiais personalizados para campanhas da sua equipe.'),
        mk('mks_juridico', 'Consulta jurídica expressa', 'Suporte', 150, '💼', null, null, 'manual',
          'Orientação jurídica sobre operação e compliance.'),
        mk('mks_treinamento', 'Treinamento premium (1h)', 'Suporte', 200, '🎓', null, null, 'manual',
          'Sessão ao vivo com especialista SOU+BLU.'),
      ];
    },

    /** Só popula usuários demo quando o Supabase está vazio — nunca re-insere após exclusão. */
    async _ensureOnlineUsersOnce() {
      const flag = localStorage.getItem('soublu_supabase_seeded');
      if (flag === '1') return;
      try {
        const existing = await supaReq('GET', 'users', null, '?select=id&limit=1');
        if (existing && existing.length > 0) {
          localStorage.setItem('soublu_supabase_seeded', '1');
          return;
        }
        console.log('[DB] Banco vazio — seed inicial (uma vez)');
        await this._seedOnline();
        localStorage.setItem('soublu_supabase_seeded', '1');
      } catch (e) {
        console.warn('[DB] Não foi possível verificar usuários:', e);
      }
    },

    async _seedOnline() {
      try {
        const users = this._seedUsers();
        for (const u of users) {
          try {
            const exists = await supaReq('GET', 'users', null, `?id=eq.${encodeURIComponent(u.id)}&select=id&limit=1`);
            if (exists && exists.length) continue;
            await supaReq('POST', 'users', u);
          } catch (e) {
            console.warn('[DB] seed user', u.id, e.message || e);
          }
        }
        console.log('[DB] Seed inicial concluído');
      } catch (e) {
        console.warn('[DB] Erro ao inserir seed:', e);
      }
    },
  
    /* ══ USERS ══ */
    async getUsers() {
      if (this.online) return await supaReq('GET','users',null,'?select=*&order=name.asc');
      return this._lget(this.LK.users);
    },
  
    async getAdmins() {
      const adminRoles = ['master','fundador','desenvolvedor','gerente','financeiro','financial','supervisor','sup_backoffice','rh','gerencia','operacional','juridico','diretoria','backoffice','ouvidoria','admin'];
      if (this.online) return await supaReq('GET','users',null,`?role=in.(${adminRoles.join(',')})&select=*&order=name.asc`);
      return this._lget(this.LK.users).filter(u => adminRoles.includes(u.role));
    },
  
    async getUser(id) {
      if (this.online) { const r=await supaReq('GET','users',null,`?id=eq.${id}&select=*&limit=1`); return r[0]||null; }
      return this._lget(this.LK.users).find(u=>u.id===id)||null;
    },
  
    async getUserByEmail(email) {
      const em = (email || '').trim().toLowerCase();
      if (!em) return null;
      if (this.online) {
        try {
          const rows = await supaReq('GET', 'users', null,
            `?email=ilike.${encodeURIComponent(em)}&select=*&limit=20`);
          const matches = (rows || []).filter(u =>
            (u.email || '').trim().toLowerCase() === em
          );
          if (matches.length) return this._pickPreferredEmailUser(matches);
        } catch (e) {
          console.warn('[DB] getUserByEmail:', e);
        }
        return this._findUserInList(u => (u.email || '').trim().toLowerCase() === em);
      }
      const local = this._lget(this.LK.users).filter(u =>
        (u.email || '').trim().toLowerCase() === em
      );
      return local.length ? this._pickPreferredEmailUser(local) : null;
    },

    /** Em e-mails duplicados (caixa alta/baixa), prioriza parceiro ativo da rede. */
    _pickPreferredEmailUser(users) {
      const list = users || [];
      if (!list.length) return null;
      const score = (u) => {
        let s = 0;
        if (u.active !== false) s += 4;
        const role = String(u.role || '').trim().toLowerCase();
        if (role === 'parceiro') s += 8;
        if (this.PARTNER_TEAM_ROLES.includes(role)) s += 2;
        return s;
      };
      return list.slice().sort((a, b) => score(b) - score(a))[0];
    },
  
    async getUserByMatricula(mat) {
      const m = (mat || '').trim();
      if (!m) return null;
      if (this.online) {
        try {
          for (const op of ['eq', 'ilike']) {
            const r = await supaReq('GET', 'users', null, `?matricula=${op}.${encodeURIComponent(m)}&select=*&limit=1`);
            if (r[0]) return r[0];
          }
        } catch (e) {
          console.warn('[DB] getUserByMatricula:', e);
        }
        const low = m.toLowerCase();
        return this._findUserInList(u => (u.matricula || '').trim().toLowerCase() === low);
      }
      const low = m.toLowerCase();
      return this._lget(this.LK.users).find(u => (u.matricula || '').trim().toLowerCase() === low) || null;
    },

    async getUserByCpf(cpf) {
      const digits = String(cpf || '').replace(/\D/g, '');
      if (digits.length !== 11) return null;
      if (this.online) {
        try {
          const r = await supaReq('GET', 'users', null, `?cpf=eq.${digits}&select=*&limit=1`);
          if (r?.[0]) return r[0];
        } catch (e) {
          console.warn('[DB] getUserByCpf:', e.message);
        }
      }
      return this._lget(this.LK.users).find(u => String(u.cpf || '').replace(/\D/g, '') === digits) || null;
    },
  
    async findUserByIdentifier(identifier) {
      const id = (identifier || '').trim();
      if (!id) return null;
      if (id.includes('@')) {
        const byEmail = await this.getUserByEmail(id);
        if (byEmail) return byEmail;
      }
      const byMat = await this.getUserByMatricula(id);
      if (byMat) return byMat;
      if (!id.includes('@')) {
        const byEmail = await this.getUserByEmail(id);
        if (byEmail) return byEmail;
      }
      const low = id.toLowerCase();
      return this._findUserInList(u =>
        (u.email || '').trim().toLowerCase() === low ||
        (u.matricula || '').trim().toLowerCase() === low
      );
    },
  
    async _findUserInList(matchFn) {
      try {
        const all = this.online ? await this.getUsers() : this._lget(this.LK.users);
        return all.find(matchFn) || null;
      } catch {
        return null;
      }
    },
  
    /** Colaboradores da equipe de um parceiro (vendedor, operacional, RH, financeiro, etc.) */
    PARTNER_TEAM_ROLES: ['vendedor', 'backoffice', 'operacional', 'sup_backoffice', 'rh', 'financeiro', 'financial', 'employee'],

    /** Todos os IDs da organização parceira (equipe em qualquer nível abaixo do parceiro). */
    expandPartnerOrgIds(partnerRootId, users) {
      const root = String(partnerRootId || '');
      if (!root) return new Set();
      const ids = new Set([root]);
      const list = Array.isArray(users) ? users : [];
      let changed = true;
      while (changed) {
        changed = false;
        for (const u of list) {
          if (!u?.id) continue;
          const uid = String(u.id);
          const aid = u.admin_id ? String(u.admin_id) : '';
          if (!aid || !ids.has(aid)) continue;
          if (String(u.role || '').toLowerCase() === 'parceiro' && uid !== root) continue;
          if (!ids.has(uid)) {
            ids.add(uid);
            changed = true;
          }
        }
      }
      return ids;
    },

    async getPartnerTeamIds(partnerRootId) {
      if (!partnerRootId) return new Set();
      const users = this.online
        ? await supaReq('GET', 'users', null, '?select=id,admin_id,role&limit=2000').catch(() => [])
        : this._lget(this.LK.users);
      return this.expandPartnerOrgIds(partnerRootId, users);
    },

    async getPartnerTeam(partnerRootId) {
      if (!partnerRootId) return [];
      const ids = await this.getPartnerTeamIds(partnerRootId);
      ids.delete(String(partnerRootId));
      if (this.online) {
        const all = await supaReq('GET', 'users', null, '?select=*&order=name.asc&limit=2000').catch(() => []);
        return (all || []).filter(u => ids.has(String(u.id)) && this.PARTNER_TEAM_ROLES.includes(u.role));
      }
      return this._lget(this.LK.users).filter(u =>
        ids.has(String(u.id)) && this.PARTNER_TEAM_ROLES.includes(u.role)
      );
    },

    /** ID do parceiro dono da equipe (sobe a cadeia admin_id até achar role parceiro). */
    async getPartnerRootForUser(userId) {
      const u = await this.getUser(userId);
      if (!u) return null;
      if (u.role === 'parceiro') return u.id;
      let cur = u;
      for (let depth = 0; depth < 12 && cur?.admin_id; depth++) {
        const boss = await this.getUser(cur.admin_id);
        if (!boss) break;
        if (boss.role === 'parceiro') return boss.id;
        cur = boss;
      }
      return null;
    },

    /* Funcionários de um admin específico (supervisor: vendedores) */
    async getEmployeesByAdmin(adminId) {
      if (this.online) return await supaReq('GET','users',null,`?admin_id=eq.${adminId}&role=in.(employee,vendedor)&select=*&order=name.asc`);
      return this._lget(this.LK.users).filter(u=>(u.role==='employee'||u.role==='vendedor')&&u.admin_id===adminId);
    },

    /** IDs do time de um supervisor/parceiro (consulta leve). */
    async getTeamMemberIds(adminId) {
      if (!adminId) return [];
      if (this.online) {
        try {
          const rows = await supaReq('GET', 'users', null,
            `?admin_id=eq.${encodeURIComponent(adminId)}&select=id&limit=300`);
          return (rows || []).map(r => r.id).filter(Boolean);
        } catch (e) {
          console.warn('[DB] getTeamMemberIds:', e.message);
          return [];
        }
      }
      return this._lget(this.LK.users)
        .filter(u => u.admin_id === adminId)
        .map(u => u.id);
    },
  
    async getEmployeesByDepartment(department) {
      if (this.online) return await supaReq('GET','users',null,`?department=eq.${department}&role=in.(employee,vendedor)&select=*&order=name.asc`);
      return this._lget(this.LK.users).filter(u=>(u.role==='employee'||u.role==='vendedor')&&u.department===department);
    },
  
    /* Todos os funcionários (master) */
    async getAllEmployees() {
      /* Inclui supervisores/sup_backoffice/backoffice/desenvolvedor para listagens admin. */
      if (this.online) {
        return await supaReq('GET','users',null,'?role=in.(employee,vendedor,supervisor,sup_backoffice,backoffice,desenvolvedor)&select=*&order=name.asc&limit=500');
      }
      return this._lget(this.LK.users).filter(u =>
        ['employee','vendedor','supervisor','sup_backoffice','backoffice','desenvolvedor'].includes(u.role)
      );
    },
  
    /** Papéis que podem ser marcados em reunião (gerente para baixo na hierarquia). */
    MEETING_PARTICIPANT_ROLES: [
      'gerente', 'gerencia', 'supervisor', 'sup_backoffice', 'backoffice',
      'vendedor', 'employee', 'operacional', 'juridico', 'ouvidoria', 'admin',
    ],

    /** Colaboradores ativos convocáveis em reunião (gerente ↓; equipe ou todos conforme escopo). */
    async getMeetingParticipants(adminId = null) {
      const roles = this.MEETING_PARTICIPANT_ROLES;
      const cols = 'id,name,email,role,matricula,department,active,admin_id';
      if (this.online) {
        let params = `?role=in.(${roles.join(',')})&active=eq.true&select=${cols}&order=name.asc&limit=500`;
        if (adminId) {
          params = `?admin_id=eq.${encodeURIComponent(adminId)}&role=in.(${roles.join(',')})&active=eq.true&select=${cols}&order=name.asc&limit=500`;
        }
        try {
          return await supaReq('GET', 'users', null, params);
        } catch (e) {
          console.warn('[DB] getMeetingParticipants:', e);
          return [];
        }
      }
      const all = this._lget(this.LK.users);
      return all.filter(u =>
        roles.includes(u.role) &&
        u.active !== false &&
        (!adminId || u.admin_id === adminId)
      );
    },

    /** @deprecated use getMeetingParticipants */
    async getMeetingVendors(adminId = null) {
      return this.getMeetingParticipants(adminId);
    },

    /** Lista leve de vendedores para selects (evita timeout em GET users completo) */
    async getVendorsForSelect(adminId = null) {
      const cols = 'id,name,email,role,active';
      if (this.online) {
        let params = `?role=in.(employee,vendedor)&active=eq.true&select=${cols}&order=name.asc&limit=500`;
        if (adminId) {
          params = `?admin_id=eq.${encodeURIComponent(adminId)}&role=in.(employee,vendedor)&active=eq.true&select=${cols}&order=name.asc&limit=500`;
        }
        try {
          return await supaReq('GET', 'users', null, params);
        } catch (e) {
          console.warn('[DB] getVendorsForSelect:', e);
          return [];
        }
      }
      const all = this._lget(this.LK.users);
      return all.filter(u =>
        (u.role === 'employee' || u.role === 'vendedor') &&
        u.active !== false &&
        (!adminId || u.admin_id === adminId)
      );
    },
  
    /* Todos os usuários sem filtro (master panel) */
    async getAllUsers() {
      if (this.online) {
        return await supaReq('GET','users',null,'?select=id,name,email,role,matricula,department,admin_id,balance,points,active,photo_url,show_points,created_at&order=name.asc&limit=1000');
      }
      return this._lget(this.LK.users);
    },
  
    async addUser(data) {
      const email = this.normalizeEmail(data.email);
      if (!email) throw new Error('E-mail obrigatório.');
      if (await this.isEmailTaken(email)) {
        throw new Error('Este e-mail já está cadastrado. Use outro e-mail ou edite o usuário existente.');
      }
      const matricula = (data.matricula || '').trim() || ('F' + Math.floor(10000 + Math.random() * 90000));
      if (await this.getUserByMatricula(matricula)) {
        throw new Error('Esta matrícula já está em uso. Informe outra matrícula.');
      }
      const user = {
        id:          data.id || this._genId('u'),
        name:        data.name,
        email,
        password:    data.password || '123456',
        matricula,
        department:  data.department || 'Geral',
        role:        data.role || 'employee',
        admin_id:    data.admin_id || null,
        balance:     parseFloat(data.balance) || 0,
        points:      parseInt(data.points) || parseInt(data.balance) || 0,
        photo_url:   data.photo_url || '',
        face_hash:   data.face_hash || '',
        doc_verified: data.doc_verified || false,
        show_points: data.show_points !== undefined ? data.show_points : true,
        active:      true,
        created_at:  new Date().toISOString(),
      };
      if (data.cpf) user.cpf = String(data.cpf).replace(/\D/g, '');
      if (data.phone) user.phone = String(data.phone).trim();
      try {
        if (this.online) { _cacheDel('users'); const r = await supaReq('POST', 'users', user); return r[0] || user; }
        const list = this._lget(this.LK.users);
        if (list.some(u => this.normalizeEmail(u.email) === email)) {
          throw new Error('Este e-mail já está cadastrado. Use outro e-mail ou edite o usuário existente.');
        }
        list.push(user);
        this._lset(this.LK.users, list);
        return user;
      } catch (e) {
        throw new Error(this.formatUserDbError(e));
      }
    },
  
    async updateUser(id, updates) {
      const patch = { ...updates };
      if (patch.email != null) {
        patch.email = this.normalizeEmail(patch.email);
        if (!patch.email) throw new Error('E-mail obrigatório.');
        if (await this.isEmailTaken(patch.email, id)) {
          throw new Error('Este e-mail já está cadastrado. Use outro e-mail ou edite o usuário existente.');
        }
      }
      if (patch.matricula != null) {
        patch.matricula = String(patch.matricula).trim();
        const other = await this.getUserByMatricula(patch.matricula);
        if (other && String(other.id) !== String(id)) {
          throw new Error('Esta matrícula já está em uso. Informe outra matrícula.');
        }
      }
      try {
        if (this.online) { _cacheDel('users'); const r = await supaReq('PATCH', 'users', patch, `?id=eq.${id}`); return r[0] || null; }
        const list = this._lget(this.LK.users), idx = list.findIndex(u => u.id === id);
        if (idx === -1) return null;
        list[idx] = { ...list[idx], ...patch };
        this._lset(this.LK.users, list);
        return list[idx];
      } catch (e) {
        throw new Error(this.formatUserDbError(e));
      }
    },

    async verifyCurrentPassword(userId, password) {
      const user = await this.getUser(userId);
      return !!(user && user.password === password);
    },

    /* ── PARCEIROS (dados empresa + permissões; login em users.role=parceiro) ── */
    async getPartners() {
      if (this.online) {
        try {
          return await supaReq('GET', 'partners', null, '?select=*&order=razao_social.asc');
        } catch (e) {
          console.warn('[DB] partners online:', e.message);
        }
      }
      return this._lget(this.LK.partners);
    },

    async getPartner(id) {
      if (!id) return null;
      if (this.online) {
        try {
          const r = await supaReq('GET', 'partners', null, `?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
          return r[0] || null;
        } catch (e) {
          console.warn('[DB] getPartner:', e.message);
        }
      }
      return this._lget(this.LK.partners).find(p => p.id === id) || null;
    },

    async getPartnerByUserId(userId) {
      if (!userId) return null;
      if (this.online) {
        try {
          const r = await supaReq('GET', 'partners', null, `?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`);
          return r[0] || null;
        } catch (e) {
          console.warn('[DB] getPartnerByUserId:', e.message);
        }
      }
      return this._lget(this.LK.partners).find(p => p.user_id === userId) || null;
    },

    async savePartner(data) {
      const perms = typeof PartnerPerms !== 'undefined'
        ? PartnerPerms.merge(data.permissions)
        : { ...(data.permissions || {}) };
      const meta = (data.meta && typeof data.meta === 'object') ? data.meta : {};
      const row = {
        id: data.id || this._genId('prt'),
        user_id: data.user_id,
        cnpj: (data.cnpj || '').trim(),
        razao_social: (data.razao_social || '').trim(),
        endereco: (data.endereco || '').trim(),
        contato: (data.contato || '').trim(),
        email: (data.email || '').trim(),
        permissions: perms,
        meta,
        active: data.active !== false,
        created_at: data.created_at || new Date().toISOString(),
      };
      if (this.online) {
        try {
          _cacheDel('partners');
          if (data.id) {
            const r = await supaReq('PATCH', 'partners', row, `?id=eq.${encodeURIComponent(data.id)}`);
            return r[0] || row;
          }
          const r = await supaReq('POST', 'partners', row);
          return r[0] || row;
        } catch (e) {
          console.warn('[DB] savePartner online, usando local:', e.message);
        }
      }
      const list = this._lget(this.LK.partners);
      const idx = list.findIndex(p => p.id === row.id);
      if (idx === -1) list.push(row);
      else list[idx] = { ...list[idx], ...row };
      this._lset(this.LK.partners, list);
      return row;
    },

    async deletePartner(id) {
      if (!id) return false;
      if (this.online) {
        try {
          _cacheDel('partners');
          await supaReq('DELETE', 'partners', null, `?id=eq.${encodeURIComponent(id)}`);
          return true;
        } catch (e) {
          console.warn('[DB] deletePartner:', e.message);
        }
      }
      this._lset(this.LK.partners, this._lget(this.LK.partners).filter(p => p.id !== id));
      return true;
    },
  
    async deleteUser(id) {
      if (!id) throw new Error('ID do usuário inválido');
      if (this.online) {
        _cacheDel('users');
        const eq = encodeURIComponent(id);
        const wipe = async (table, params) => {
          try { await supaReq('DELETE', table, null, params); }
          catch (e) { console.warn(`[DB] deleteUser: limpar ${table}:`, e.message); }
        };
        for (const t of ['transactions', 'orders', 'withdrawals', 'feedbacks', 'proposals', 'tickets']) {
          await wipe(t, `?employee_id=eq.${eq}`);
        }
        await wipe('proposals', `?or=(vendor_id.eq.${eq},vendorId.eq.${eq})`);
        await wipe('clients', `?supervisorId=eq.${eq}`);
        try {
          const prt = await this.getPartnerByUserId(id);
          if (prt?.id) await this.deletePartner(prt.id);
        } catch (_) { /* noop */ }
        await supaReq('DELETE', 'users', null, `?id=eq.${eq}`);
        const still = await supaReq('GET', 'users', null, `?id=eq.${eq}&select=id&limit=1`);
        if (still && still.length) {
          throw new Error('Não foi possível excluir: ainda existem vínculos com este usuário.');
        }
        _cacheDel('users');
        return true;
      }
      this._lset(this.LK.users, this._lget(this.LK.users).filter(u => u.id !== id));
      return true;
    },
  
    _moneyAmt(amount) {
      if (typeof parseMoneyAmount === 'function') return parseMoneyAmount(amount);
      const n = Number(amount);
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
    },

    _ptsAmt(amount) {
      const n = Math.floor(Number(amount));
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    },

    /** Saldo em pontos (permite negativo após advertência / débitos). */
    _ptsBalance(emp) {
      if (typeof userPts === 'function') return userPts(emp);
      const n = Number(emp?.points ?? emp?.balance ?? 0);
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
    },

    _isPartnerWalletUser(emp) {
      if (!emp) return false;
      if (typeof isUserInPartnerNetworkSync === 'function') return isUserInPartnerNetworkSync(emp);
      if (emp.role === 'parceiro') return true;
      const ids = typeof window !== 'undefined' ? window._PARTNER_ROOT_USER_IDS : null;
      return ids && emp.admin_id && ids.has(String(emp.admin_id));
    },

    /** Saldo da rede parceira: gestor via Distribuir saldo; saque PIX pelo próprio gestor. */
    _partnerBalanceMutationAllowed(emp, meta) {
      if (!this._isPartnerWalletUser(emp)) return true;
      const m = meta || {};
      if (m.screen === 'distribuir_saldo_parceiro' || m.partner_root_id) {
        if (emp.role === 'parceiro') return true;
        if (m.partner_root_id && String(emp.id) === String(m.partner_root_id)) return true;
        return false;
      }
      if (m.screen === 'saque_pix' || m.kind === 'saque_solicitado' || m.kind === 'estorno_saque_falha') {
        if (m.retroactive && m.withdrawal_id) return emp.role === 'parceiro';
        return emp.role === 'parceiro';
      }
      if (m.screen === 'conta_corrente_gestao') return true;
      return false;
    },

    _walletAmt(amount, emp, forSet) {
      if (this._isPartnerWalletUser(emp)) {
        if (forSet) {
          const n = this._moneyAmt(amount);
          return Number.isFinite(n) ? Math.max(0, n) : NaN;
        }
        const v = this._moneyAmt(amount);
        return Number.isFinite(v) && v > 0 ? v : NaN;
      }
      if (forSet) return this._ptsAmt(amount);
      const n = this._ptsAmt(amount);
      return n > 0 ? n : NaN;
    },

    /* ── SALDO ── */
    async addBalance(empId, amount, reason, byId, meta) {
      const emp=await this.getUser(empId); if(!emp)return null;
      if (!this._partnerBalanceMutationAllowed(emp, meta)) return null;
      const amt = this._walletAmt(amount, emp, false);
      if (!Number.isFinite(amt) || amt <= 0) return null;
      const current = this._isPartnerWalletUser(emp)
        ? this._moneyAmt(emp.points || emp.balance || 0)
        : this._ptsBalance(emp);
      const nb = this._isPartnerWalletUser(emp)
        ? Math.round((current + amt) * 100) / 100
        : Math.round((current + amt) * 100) / 100;
      await this.updateUser(empId,{balance:nb, points:nb});
      _cacheDel('users');
      await this.addTransaction({employee_id:empId,type:'credit',amount:amt,reason,by_user:byId||'admin',meta});
      return nb;
    },
    async deductBalance(empId, amount, reason, byUser, meta) {
      const emp=await this.getUser(empId); if(!emp)return null;
      if (!this._partnerBalanceMutationAllowed(emp, meta)) return null;
      const amt = this._walletAmt(amount, emp, false);
      if (!Number.isFinite(amt) || amt <= 0) return null;
      const money = this._isPartnerWalletUser(emp);
      const current = money
        ? this._moneyAmt(emp.points || emp.balance || 0)
        : this._ptsBalance(emp);
      const nb = money
        ? Math.max(0, Math.round((current - amt) * 100) / 100)
        : Math.round((current - amt) * 100) / 100;
      await this.updateUser(empId,{balance:nb, points:nb});
      _cacheDel('users');
      const txMeta = (meta && typeof meta === 'object' && !Array.isArray(meta))
        ? { saldo_anterior: current, saldo_novo: nb, ...meta }
        : { saldo_anterior: current, saldo_novo: nb };
      await this.addTransaction({
        employee_id: empId,
        type: 'debit',
        amount: amt,
        reason,
        by_user: byUser || 'admin',
        meta: txMeta,
      });
      return nb;
    },
    async setBalance(empId, newAmt, reason, byId, meta) {
      const emp=await this.getUser(empId); if(!emp)return null;
      if (!this._partnerBalanceMutationAllowed(emp, meta)) return null;
      const money = this._isPartnerWalletUser(emp);
      const cur = money
        ? this._moneyAmt(emp.points || emp.balance || 0)
        : this._ptsBalance(emp);
      const nb = this._walletAmt(newAmt, emp, true);
      if (!Number.isFinite(nb)) return null;
      const diff = nb - cur;
      await this.updateUser(empId,{balance:nb, points:nb});
      _cacheDel('users');
      const txMeta = (meta && typeof meta === 'object' && !Array.isArray(meta))
        ? { saldo_anterior: cur, saldo_novo: nb, ...meta }
        : { saldo_anterior: cur, saldo_novo: nb };
      await this.addTransaction({
        employee_id: empId,
        type: diff >= 0 ? 'credit' : 'debit',
        amount: Math.abs(diff),
        reason,
        by_user: byId || 'admin',
        meta: txMeta,
      });
      return nb;
    },
  
    /* ══ PRODUCTS ══ */
    async getProducts(adminId=null) {
      if (this.online) {
        const q=adminId?`?admin_id=eq.${adminId}&select=*&order=created_at.desc`:'?select=*&order=created_at.desc';
        return await supaReq('GET','products',null,q);
      }
      const all=this._lget(this.LK.products); return adminId?all.filter(p=>p.admin_id===adminId):all;
    },
    /** Catálogo completo (loja do funcionário + painéis globais): todos os produtos, sem filtrar por admin. */
    async getCatalogProducts() {
      return await this.getProducts(null);
    },
    async getProduct(id) {
      if (this.online) { const r=await supaReq('GET','products',null,`?id=eq.${id}&select=*&limit=1`); return r[0]||null; }
      return this._lget(this.LK.products).find(p=>p.id===id)||null;
    },
    async addProduct(data) {
      const prod={id:data.id||this._genId('p'),admin_id:data.admin_id,name:data.name,description:data.description||'',category:data.category||'Geral',price:parseFloat(data.price)||0,stock:parseInt(data.stock)||0,image_url:data.image_url||'',emoji:data.emoji||'🎁',active:true,featured:data.featured||false};
      if (this.online) { _cacheDel('products'); const r=await supaReq('POST','products',prod); return r[0]||prod; }
      const list=this._lget(this.LK.products); list.push(prod); this._lset(this.LK.products,list); return prod;
    },
    async updateProduct(id, updates) {
      if (this.online) { _cacheDel('products'); const r=await supaReq('PATCH','products',updates,`?id=eq.${id}`); return r[0]||null; }
      const list=this._lget(this.LK.products), idx=list.findIndex(p=>p.id===id);
      if(idx===-1)return null; list[idx]={...list[idx],...updates}; this._lset(this.LK.products,list); return list[idx];
    },
    async deleteProduct(id) {
      if (this.online) { _cacheDel('products'); return await supaReq('DELETE','products',null,`?id=eq.${encodeURIComponent(id)}`); }
      this._lset(this.LK.products, this._lget(this.LK.products).filter(p=>p.id!==id));
    },
    async decrementStock(id, qty=1) {
      const p=await this.getProduct(id); if(!p)return null;
      return await this.updateProduct(id,{stock:Math.max(0,p.stock-qty)});
    },
  
    /* ══ TRANSACTIONS ══ */
    async getTransactions(empId=null) {
      if (this.online) {
        const q=empId?`?employee_id=eq.${empId}&select=*&order=created_at.desc`:'?select=*&order=created_at.desc&limit=300';
        return await supaReq('GET','transactions',null,q);
      }
      const all=this._lget(this.LK.transactions);
      return empId?all.filter(t=>t.employee_id===empId).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)):all;
    },
    async getTransactionsByAdmin(adminId) {
      const emps=await this.getEmployeesByAdmin(adminId);
      const ids=new Set(emps.map(e=>e.id));
      if (adminId) ids.add(adminId);
      const all=await this.getTransactions();
      return all.filter(t=>ids.has(t.employee_id));
    },
    async addTransaction(data) {
      const amountVal = this._moneyAmt(data.amount);
      const tx={
        id:this._genId('tx'),
        employee_id:data.employee_id,
        type:data.type,
        amount:Number.isFinite(amountVal) ? amountVal : 0,
        reason:data.reason??'',
        by_user:data.by_user||null,
        created_at:new Date().toISOString(),
      };
      if (data.meta != null && typeof data.meta === 'object' && !Array.isArray(data.meta)) {
        tx.meta = data.meta;
      }
      if (this.online) {
        _cacheDel('transactions');
        try {
          await supaReq('POST','transactions',tx);
        } catch (e) {
          if (tx.meta != null && typeof tx.meta === 'object') {
            const msg = String(e.message || e || '');
            const likelyMissingMeta = /\bmeta\b|could not find|column.*does not|undefined column|PGRST|schema/i.test(msg);
            if (likelyMissingMeta) {
              const tx2 = { ...tx };
              delete tx2.meta;
              await supaReq('POST','transactions',tx2);
              console.warn('[DB] Falha ao gravar campo meta na transação. Aplique migração `transactions.meta` (jsonb) no Supabase. Lançamento salvo sem auditoria estruturada.', msg);
              return tx2;
            }
          }
          throw e;
        }
        return tx;
      }
      const list=this._lget(this.LK.transactions); list.push(tx); this._lset(this.LK.transactions,list); return tx;
    },
  
    /* ══ ORDERS ══ */
    async getOrders(empId=null) {
      if (this.online) {
        const q=empId
          ? `?employee_id=eq.${empId}&select=*&order=created_at.desc`
          : '?select=id,employee_id,status,total_points,total_price,created_at,order_code&order=created_at.desc&limit=300';
        return await supaReq('GET','orders',null,q);
      }
      const all=this._lget(this.LK.orders);
      return empId?all.filter(o=>o.employee_id===empId).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)):all;
    },
    async getOrdersByAdmin(adminId) {
      const emps=await this.getEmployeesByAdmin(adminId);
      const ids=new Set(emps.map(e=>e.id));
      if (adminId) ids.add(adminId);
      const all=await this.getOrders();
      return all.filter(o=>ids.has(o.employee_id));
    },
    /** IDs do time de um departamento (inclui o próprio líder — mesmo vínculo employee_id). */
    async getDepartmentTeamIds(leaderId, department = 'Desenvolvimento') {
      const all = await this.getAllEmployees();
      const ids = new Set();
      if (leaderId) ids.add(leaderId);
      all.filter(e => e.department === department || e.role === 'desenvolvedor')
        .forEach(e => ids.add(e.id));
      return ids;
    },
    async getOrdersByDepartment(leaderId, department = 'Desenvolvimento') {
      const ids = await this.getDepartmentTeamIds(leaderId, department);
      const all = await this.getOrders();
      return all.filter(o => ids.has(o.employee_id));
    },
    async getTransactionsByDepartment(leaderId, department = 'Desenvolvimento') {
      const ids = await this.getDepartmentTeamIds(leaderId, department);
      const all = await this.getTransactions();
      return all.filter(t => ids.has(t.employee_id));
    },
    async placeOrder(empId, items) {
      if (!items?.length) return { ok: false, msg: 'Carrinho vazio.' };

      const total = Math.round(items.reduce((s, i) => s + (i.points_price || i.price || 0) * i.qty, 0));
      if (!Number.isFinite(total) || total <= 0) return { ok: false, msg: 'Valor do pedido inválido.' };

      const emp = await this.getUser(empId);
      const prevPts = this._ptsBalance(emp);
      if (!emp || prevPts < total) return { ok: false, msg: 'Saldo insuficiente.' };

      for (const item of items) {
        const p = await this.getProduct(item.productId);
        if (!p || p.stock < item.qty) return { ok: false, msg: `Estoque insuficiente: ${item.name}` };
      }

      const orderCode = 'ORD-' + Date.now().toString(36).toUpperCase();
      const primary = items[0];
      const order = {
        id: this._genId('ord'),
        order_code: orderCode,
        employee_id: empId,
        product_id: primary.productId,
        quantity: items.reduce((s, i) => s + (i.qty || 1), 0),
        items,
        total_points: total,
        total_price: total,
        status: 'pendente',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      let debited = false;
      const restocked = [];

      try {
        const nb = Math.round((prevPts - total) * 100) / 100;
        await this.updateUser(empId, { points: nb, balance: nb });
        debited = true;
        await this.addTransaction({
          employee_id: empId,
          type: 'debit',
          amount: total,
          reason: `Compra — ${orderCode}`,
          by_user: empId,
          meta: { kind: 'compra_loja', order_code: orderCode, itens: items.length },
        });
        for (const item of items) {
          await this.decrementStock(item.productId, item.qty);
          restocked.push({ productId: item.productId, qty: item.qty });
        }
        if (this.online) {
          _cacheDel('orders');
          await supaReq('POST', 'orders', order);
        } else {
          const list = this._lget(this.LK.orders);
          list.push(order);
          this._lset(this.LK.orders, list);
        }
        return { ok: true, order };
      } catch (e) {
        console.error('[placeOrder]', e);
        if (debited) {
          try {
            await this.updateUser(empId, { points: prevPts, balance: prevPts });
            await this.addTransaction({
              employee_id: empId,
              type: 'credit',
              amount: total,
              reason: `Estorno — falha ao registrar pedido ${orderCode}`,
              by_user: 'sistema',
              meta: { kind: 'estorno_pedido_falha', order_code: orderCode },
            });
          } catch (rollbackErr) {
            console.error('[placeOrder] estorno falhou:', rollbackErr);
          }
        }
        for (const s of restocked) {
          try {
            const p = await this.getProduct(s.productId);
            if (p) await this.updateProduct(s.productId, { stock: (p.stock || 0) + s.qty });
          } catch (_) { /* noop */ }
        }
        const raw = String(e.message || e || '');
        if (/product_id|null value|violates not-null|PGRST/i.test(raw)) {
          return { ok: false, msg: 'Erro ao registrar pedido no sistema. Tente novamente.' };
        }
        return { ok: false, msg: 'Não foi possível finalizar a compra. Tente novamente.' };
      }
    },
    async updateOrderStatus(id, status) {
      if(this.online){_cacheDel('orders');const r=await supaReq('PATCH','orders',{status},`?id=eq.${id}`);return r[0]||null;}
      const list=this._lget(this.LK.orders),idx=list.findIndex(o=>o.id===id);
      if(idx===-1)return null;list[idx].status=status;this._lset(this.LK.orders,list);return list[idx];
    },
    async deleteOrder(id) {
      if(this.online){_cacheDel('orders');return await supaReq('DELETE','orders',null,`?id=eq.${id}`);}
      this._lset(this.LK.orders, this._lget(this.LK.orders).filter(o=>o.id!==id));
    },
  
    /* ══ WITHDRAWALS ══ */
    async getWithdrawals(empId=null) {
      if(this.online){const q=empId?`?employee_id=eq.${empId}&select=*&order=created_at.desc`:'?select=*&order=created_at.desc';return await supaReq('GET','withdrawals',null,q);}
      const all=this._lget(this.LK.withdrawals);return empId?all.filter(w=>w.employee_id===empId):all;
    },
    async getWithdrawalsByAdmin(adminId) {
      const emps=await this.getEmployeesByAdmin(adminId);
      const ids=new Set(emps.map(e=>e.id));
      const all=await this.getWithdrawals();
      return all.filter(w=>ids.has(w.employee_id));
    },
    /** Normaliza tipo/chave PIX antes de gravar ou enviar à Efi. */
    normalizePixPayment(type, key) {
      let t = String(type || '').trim().toLowerCase();
      let k = String(key || '').trim();
      if (!k) return { pix_key_type: t || 'cpf', pix_key: '' };

      if (['celular', 'telefone'].includes(t)) t = 'phone';
      if (['e-mail', 'mail'].includes(t)) t = 'email';
      if (['aleatoria', 'chave_aleatoria', 'evp'].includes(t)) t = 'random';

      const digits = k.replace(/\D/g, '');
      const inferType = () => {
        if (k.includes('@')) return 'email';
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) return 'random';
        if (digits.length === 14) return 'cnpj';
        if (digits.length === 11 && !k.includes('@')) return 'cpf';
        if (digits.length === 10 || digits.length === 11) return 'phone';
        return 'random';
      };

      if (!t || t === 'pix') t = inferType();
      if (t === 'cpf' && (k.includes('@') || (digits.length !== 11 && digits.length > 0))) t = inferType();
      if (t === 'cnpj' && digits.length !== 14 && k.includes('@')) t = 'email';

      switch (t) {
        case 'cpf':
        case 'cnpj':
          k = digits;
          break;
        case 'phone':
          if (!digits) break;
          k = digits.startsWith('55') && digits.length >= 12
            ? '+' + digits
            : (digits.length === 10 || digits.length === 11 ? '+55' + digits : '+' + digits);
          break;
        case 'email':
          k = k.toLowerCase();
          break;
        default:
          k = k.trim();
      }
      return { pix_key_type: t, pix_key: k };
    },

    async requestWithdrawal(empId, amount, pixData) {
      const emp=await this.getUser(empId);
      if(!emp)return{ok:false,msg:'Funcionário não encontrado.'};
      const money = this._isPartnerWalletUser(emp);
      const amt = this._walletAmt(amount, emp, false);
      if(!Number.isFinite(amt) || amt<=0)return{ok:false,msg:'Valor inválido.'};

      const payMethod = String(pixData?.method || 'pix').toLowerCase();
      if (payMethod === 'conta' || payMethod === 'conta_corrente') {
        return { ok: false, msg: 'Saque disponível apenas via PIX. Use sua chave PIX no formulário.' };
      }
      if (!pixData?.pix_key) {
        return { ok: false, msg: 'Dados PIX obrigatórios.' };
      }

      let netAmount = amt;
      let irpfTax = 0;
      let totalDebit = amt;
      let irpfReason = '';

      if (money && typeof WithdrawalRules !== 'undefined') {
        const ev = await WithdrawalRules.evaluate(empId, amt, emp);
        if (!ev.ok) return { ok:false, msg: ev.msg };
        netAmount = ev.netAmount;
        irpfTax = ev.irpfTax || 0;
        totalDebit = ev.totalDebit;
        irpfReason = ev.irpfReason || '';
        try {
          if (ev.flagSplitNext) await this.updateUser(empId, { withdrawal_irpf_next: true });
          if (ev.clearPendingIrpf) await this.updateUser(empId, { withdrawal_irpf_next: false });
        } catch (e) { console.warn('[requestWithdrawal] flags IRPF:', e); }
      } else if (money && amt < 50) {
        return { ok:false, msg:'Valor mínimo para saque: R$ 50,00.' };
      } else if (!money && typeof VendorTierPoints !== 'undefined' && VendorTierPoints.usesTierWithdrawRules(emp)) {
        const wd = VendorTierPoints.canWithdrawToday(emp);
        if (!wd.ok) return { ok:false, msg: wd.msg };
      }

      const _bal = typeof userWalletBalance === 'function'
        ? userWalletBalance(emp)
        : (money ? this._moneyAmt(emp.points || emp.balance || 0) : this._ptsBalance(emp));
      const tol = money ? 0.001 : 0;
      if (_bal < totalDebit - tol) {
        const lbl = typeof formatCurrency === 'function' ? formatCurrency(_bal, emp) : String(_bal);
        const extra = irpfTax > 0 ? ' (saque + IRPF)' : '';
        return { ok:false, msg:`Saldo insuficiente${extra}. Você tem ${lbl}.` };
      }

      const normPix = this.normalizePixPayment(pixData.pix_key_type, pixData.pix_key);
      const pixType = normPix.pix_key_type;
      const pixKey = normPix.pix_key;
      if (!pixKey) {
        return { ok: false, msg: 'Chave PIX inválida para o tipo selecionado.' };
      }
      const holderName = pixData.holder_name || '';
      const bankName = pixData.bank_name || '';

      let reason = `Saque PIX — ${pixType.toUpperCase()} ${pixKey}`;
      if (irpfTax > 0) reason += ` (IRPF R$ ${irpfTax.toFixed(2)})`;

      const wdMeta = { screen: 'saque_pix', kind: 'saque_solicitado' };
      const nbAfter = await this.deductBalance(empId, totalDebit, reason, empId, wdMeta);
      if (nbAfter == null) {
        return {
          ok: false,
          msg: 'Não foi possível reservar o saldo para o saque. Se você é parceiro, confirme que está logado como gestor e tente novamente.',
        };
      }

      const notePayload = {
        net_amount: netAmount,
        irpf_tax: irpfTax,
        gross_debit: totalDebit,
        irpf_reason: irpfReason,
        payment_method: 'pix',
        bank: null,
      };

      const wd={
        id:this._genId('wdw'),
        employee_id:empId,
        amount:netAmount,
        method: 'pix',
        pix_key_type:pixType,
        pix_key:pixKey,
        holder_name:holderName,
        bank_name:bankName,
        status:'solicitado',
        approved_by_master:false,
        approved_by_financial:false,
        master_approved_at:null,
        financial_approved_at:null,
        admin_note:'',
        notes: JSON.stringify(notePayload),
        created_at:new Date().toISOString(),
        partner_root_id: emp.role === 'parceiro' ? empId : (emp.admin_id || null),
      };
      try {
        await this._insertWithdrawal(wd);
        return{ok:true,withdrawal:wd, irpf_tax: irpfTax, total_debit: totalDebit};
      } catch (e) {
        console.error('[requestWithdrawal]', e);
        try {
          await this.addBalance(empId, totalDebit, 'Estorno — falha ao registrar saque', 'sistema', {
            kind: 'estorno_saque_falha',
            screen: 'saque_pix',
          });
        } catch (rollbackErr) {
          console.error('[requestWithdrawal] estorno falhou:', rollbackErr);
        }
        const raw = String(e.message || e || '');
        let msg = 'Não foi possível registrar o saque. Tente novamente.';
        if (/method/i.test(raw)) msg = 'Erro de configuração do saque (método PIX). Avise o administrador.';
        else if (/null value|violates not-null/i.test(raw)) msg = 'Dados incompletos para o saque. Avise o administrador.';
        else if (/permission|policy|RLS|401|403/i.test(raw)) msg = 'Sem permissão para registrar saque. Avise o administrador.';
        else if (/unknown column|could not find/i.test(raw)) msg = 'Tabela de saques desatualizada no servidor. Avise o administrador para rodar a migration MySQL.';
        return { ok:false, msg };
      }
    },

    async _insertWithdrawal(wd) {
      if (!this.online) {
        const list = this._lget(this.LK.withdrawals);
        list.push(wd);
        this._lset(this.LK.withdrawals, list);
        return wd;
      }
      let payload = { ...wd };
      for (let attempt = 0; attempt < 8; attempt++) {
        try {
          _cacheDel('withdrawals');
          const r = await supaReq('POST', 'withdrawals', payload);
          return (Array.isArray(r) ? r[0] : r) || payload;
        } catch (e) {
          const msg = String(e.message || e || '');
          const m = msg.match(/'([^']+)'\s+column|Could not find the '([^']+)' column|Unknown column '([^']+)'/i);
          const badCol = m ? (m[2] || m[1] || m[3]) : null;
          if (badCol && Object.prototype.hasOwnProperty.call(payload, badCol)) {
            const next = { ...payload };
            delete next[badCol];
            payload = next;
            if (Object.keys(payload).length) continue;
          }
          throw e;
        }
      }
      throw new Error('Falha ao gravar saque no banco.');
    },
    async updateWithdrawalStatus(id, status, adminNote='') {
      return this._patchWd(id, { status, admin_note: adminNote, processed_at: new Date().toISOString() });
    },

    _pixSkipMessage(pixResult) {
      if (!pixResult?.skipped) return null;
      const r = pixResult.reason || '';
      if (r === 'pix_not_configured' || r === 'gateway_not_configured') {
        return 'API PIX não configurada no servidor (config.pix.local.php).';
      }
      if (r === 'PIX_AUTO_OFF') return 'Envio automático de PIX está desligado.';
      if (r === 'bank_transfer_manual') return 'Saque por conta corrente — PIX não se aplica.';
      return pixResult.hint || `PIX não enviado (${r || 'motivo desconhecido'}).`;
    },
  
    async _pixRemoteFetch(mode, body) {
      const cfg = window.SOUBLU_CONFIG || {};
      const gw = String(cfg.PIX_GATEWAY_URL || '').trim().replace(/\/+$/, '');
      const bearer = String(cfg.PIX_GATEWAY_BEARER || '').trim();
      const phpUrl = String(cfg.PIX_PHP_PAY_URL || '').trim();
      const pixToken = String(cfg.PIX_INTERNAL_TOKEN || '').trim();

      const parseRes = async function (res) {
        const txt = await res.text();
        let data = {};
        try { data = txt ? JSON.parse(txt) : {}; } catch { data = { raw: txt }; }
        const ok = res.ok && (data.ok !== false);
        const err = data.error || data.hint || data.message
          || (!ok && data.status ? `HTTP ${res.status}: ${data.status}` : null)
          || (!ok && txt && !txt.trim().startsWith('{') ? txt.trim().slice(0, 200) : null)
          || (!ok ? `HTTP ${res.status}` : undefined);
        return { ok, error: err, ...data };
      };

      const netErr = (e, where) => {
        const raw = (e && e.message) ? e.message : String(e);
        if (/failed to fetch|networkerror|load failed/i.test(raw)) {
          const localHint = /localhost|127\.0\.0\.1/i.test(where)
            ? ' Atualize js/db-connect.js (Ctrl+F5): em localhost a API PIX deve apontar para https://www.soumaisblu.com.br.'
            : '';
          return {
            ok: false,
            error: `API PIX inacessível (${where}). Confira config.pix.local.php na raiz do Hostinger.${localHint}`,
          };
        }
        return { ok: false, error: raw };
      };

      if (gw && bearer) {
        const path = mode === 'status' ? '/internal/payout/status' : '/internal/payout';
        try {
          return await parseRes(await fetch(`${gw}${path}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${bearer}`,
            },
            body: JSON.stringify(body),
          }));
        } catch (e) {
          return netErr(e, 'gateway');
        }
      }

      /* Hostinger / PHP: api/pix_api.php (PHP grava no Supabase/MySQL com service_role). */
      if (phpUrl && pixToken) {
        const sep = phpUrl.indexOf('?') >= 0 ? '&' : '?';
        const action = mode === 'status' ? 'status' : 'pay';
        try {
          return await parseRes(await fetch(`${phpUrl}${sep}action=${action}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-PIX-Token': pixToken,
            },
            body: JSON.stringify(body),
          }));
        } catch (e) {
          return netErr(e, phpUrl);
        }
      }

      return { skipped: true, reason: 'pix_not_configured' };
    },

    /** @deprecated alias interno */
    async _pixGatewayFetch(path, body) {
      const mode = String(path || '').indexOf('status') >= 0 ? 'status' : 'pay';
      return this._pixRemoteFetch(mode, body);
    },

    /** Dispara payout PIX (gateway Node ou PHP direto) após dupla aprovação. */
    async _maybeTriggerPixGateway(wd) {
      if (!wd?.id || typeof window === 'undefined') return null;
      if (String(wd.method || '').toLowerCase().includes('conta')) {
        return { skipped: true, reason: 'bank_transfer_manual' };
      }
      if (!(wd.approved_by_master && wd.approved_by_financial)) return null;
      if (typeof window.PIX_AUTO_ON_APPROVAL !== 'undefined' && !window.PIX_AUTO_ON_APPROVAL) {
        return { skipped: true, reason: 'PIX_AUTO_OFF' };
      }
      return this._pixRemoteFetch('pay', { withdrawal_id: wd.id });
    },

    /** Consulta status PIX na Efi via gateway ou PHP action=status. */
    async refreshWithdrawalPixStatus(id) {
      _cacheDel('withdrawals');
      return this._pixRemoteFetch('status', { withdrawal_id: id });
    },

    async _finalizeWithdrawalApproval(patchPromise) {
      const row = await patchPromise;
      if (!row) return null;
      if (!(row.approved_by_master && row.approved_by_financial)) return row;
      try {
        const pixResult = await this._maybeTriggerPixGateway(row);
        if (pixResult == null) return row;
        if (pixResult.skipped && (pixResult.reason === 'gateway_not_configured' || pixResult.reason === 'pix_not_configured')) {
          return { ...row, _pixResult: pixResult };
        }
        if (pixResult.ok) {
          const fresh = await this._getWd(row.id);
          return { ...(fresh || row), _pixResult: pixResult };
        }
        const errMsg = pixResult.error || this._pixSkipMessage(pixResult) || 'Falha ao enviar PIX para o banco';
        const updated = await this._patchWd(row.id, {
          status: 'erro',
          pix_status: 'erro',
          pix_error: errMsg,
        });
        return { ...(updated || row), _pixResult: { ...pixResult, ok: false, error: errMsg } };
      } catch (e) {
        console.warn('[DB] Falha ao disparar PIX após aprovação:', e);
        const errMsg = (e && e.message) ? e.message : String(e);
        try {
          const updated = await this._patchWd(row.id, {
            status: 'erro',
            pix_status: 'erro',
            pix_error: errMsg,
          });
          return { ...(updated || row), _pixResult: { ok: false, error: errMsg } };
        } catch (patchErr) {
          console.warn('[DB] Não foi possível gravar erro PIX no saque:', patchErr);
          return { ...row, _pixResult: { ok: false, error: errMsg } };
        }
      }
    },

    /* Aprovação pelo Master */
    async approveWdMaster(id, note='') {
      const wd = await this._getWd(id); if(!wd) return null;
      const bothApproved = wd.approved_by_financial;
      /* Só vira "pago" após confirmação Efi (pix_status + e2e), não na aprovação interna. */
      const newStatus = bothApproved ? 'processando' : 'aprovado_master';
      const upd = {
        approved_by_master: true,
        master_approved_at: new Date().toISOString(),
        status: newStatus,
        admin_note: note,
        ...(bothApproved ? { pix_status: 'processando', pix_error: null } : {}),
      };
      return this._finalizeWithdrawalApproval(this._patchWd(id, upd));
    },
  
    /* Aprovação pelo Financeiro */
    async approveWdFinancial(id, note='') {
      const wd = await this._getWd(id); if(!wd) return null;
      const bothApproved = wd.approved_by_master;
      const newStatus = bothApproved ? 'processando' : 'aprovado_financeiro';
      const upd = {
        approved_by_financial: true,
        financial_approved_at: new Date().toISOString(),
        status: newStatus,
        admin_note: note,
        ...(bothApproved ? { pix_status: 'processando', pix_error: null } : {}),
      };
      return this._finalizeWithdrawalApproval(this._patchWd(id, upd));
    },

    /** Reenvia PIX após falha ou saque marcado incorretamente como pago sem E2E. */
    async retryWithdrawalPix(id) {
      const wd = await this._getWd(id);
      if (!wd) return null;
      if (wd.status === 'rejeitado') {
        return { ok: false, error: 'Saque já rejeitado (estorno feito). Peça um novo saque ao colaborador.' };
      }
      if (!(wd.approved_by_master && wd.approved_by_financial)) {
        return { ok: false, error: 'Saque precisa das duas aprovações antes do PIX.' };
      }
      if (wd.pix_status === 'pago' && wd.pix_e2e_id) {
        return { ok: false, error: 'PIX já confirmado pelo banco (E2E presente).' };
      }
      await this._patchWd(id, { status: 'processando', pix_status: 'processando', pix_error: null });
      const pixResult = await this._maybeTriggerPixGateway({ ...wd, id, status: 'processando' });
      if (!pixResult) {
        const errMsg = 'API PIX não respondeu. Verifique config.pix.local.php no servidor.';
        await this._patchWd(id, { status: 'erro', pix_status: 'erro', pix_error: errMsg });
        return { ok: false, error: errMsg, withdrawal: await this._getWd(id) };
      }
      if (pixResult.skipped) {
        const errMsg = this._pixSkipMessage(pixResult) || pixResult.hint || 'PIX não foi enviado.';
        await this._patchWd(id, { status: 'erro', pix_status: 'erro', pix_error: errMsg });
        return { ok: false, error: errMsg, withdrawal: await this._getWd(id), ...pixResult };
      }
      if (pixResult?.ok) {
        const fresh = await this._getWd(id);
        return { ok: true, withdrawal: fresh, ...pixResult };
      }
      const errMsg = pixResult.error || 'Falha ao reenviar PIX';
      const updated = await this._patchWd(id, { status: 'erro', pix_status: 'erro', pix_error: errMsg });
      return { ok: false, error: errMsg, withdrawal: updated, ...pixResult };
    },
  
    async rejectWd(id, note='') {
      const wd = await this._getWd(id);
      if (wd && wd.employee_id && wd.amount && wd.status !== 'rejeitado' && wd.status !== 'pago') {
        const estorno = this._wdGrossDebit(wd);
        if (estorno > 0) {
          await this.addBalance(wd.employee_id, estorno, `Estorno de saque rejeitado`, 'sistema', {
            kind: 'estorno_saque_rejeitado',
            withdrawal_id: wd.id || null,
          });
        }
      }
      return this._patchWd(id, {status:'rejeitado', admin_note:note, processed_at:new Date().toISOString()});
    },

    _parseWdNotes(wd) {
      const raw = wd?.notes;
      if (!raw) return {};
      if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
      try {
        const p = JSON.parse(String(raw));
        return (p && typeof p === 'object') ? p : {};
      } catch (_) {
        return {};
      }
    },

    _wdGrossDebit(wd) {
      const notes = this._parseWdNotes(wd);
      const gross = Number(notes.gross_debit);
      if (Number.isFinite(gross) && gross > 0) return Math.round(gross * 100) / 100;
      const amt = Math.round(Number(wd?.amount || 0) * 100) / 100;
      const irpf = Number(notes.irpf_tax) || 0;
      return Math.round((amt + irpf) * 100) / 100;
    },

    async _withdrawalDebitAlreadyRecorded(wd) {
      const empId = wd?.employee_id;
      if (!empId) return true;
      const gross = this._wdGrossDebit(wd);
      if (!Number.isFinite(gross) || gross <= 0) return true;
      const txs = await this.getTransactions(empId).catch(() => []);
      const wdId = String(wd?.id || '');
      for (const t of txs || []) {
        const ty = String(t?.type || '').toLowerCase();
        if (ty !== 'debit') continue;
        let meta = t.meta;
        if (typeof meta === 'string') {
          try { meta = JSON.parse(meta); } catch (_) { meta = {}; }
        }
        meta = meta && typeof meta === 'object' ? meta : {};
        const amt = typeof txAmount === 'function' ? txAmount(t) : Number(t.amount) || 0;
        const reason = String(t.reason || '');
        const metaHit = meta.withdrawal_id && String(meta.withdrawal_id) === wdId;
        const reasonHit = wdId && reason.includes(wdId);
        const pixHit = meta.kind === 'saque_solicitado' || /saque pix/i.test(reason);
        if ((metaHit || reasonHit || pixHit) && Math.abs(amt - gross) < 0.02) return true;
      }
      return false;
    },

    async ensureWithdrawalBalanceDebited(wdOrId) {
      const wd = typeof wdOrId === 'string' ? await this._getWd(wdOrId) : wdOrId;
      if (!wd?.employee_id) return null;
      const st = String(wd.status || '').toLowerCase();
      if (['rejeitado', 'cancelado', 'estornado'].includes(st)) return null;
      const gross = this._wdGrossDebit(wd);
      if (!Number.isFinite(gross) || gross <= 0) return null;
      if (await this._withdrawalDebitAlreadyRecorded(wd)) return null;
      const reason = `Saque PIX (regularização) — ${wd.id}`;
      return this.deductBalance(wd.employee_id, gross, reason, 'sistema', {
        screen: 'saque_pix',
        kind: 'saque_solicitado',
        withdrawal_id: wd.id,
        retroactive: true,
      });
    },

    async syncPartnerWithdrawalDebits(empId) {
      if (!empId) return;
      const wds = await this.getWithdrawals(empId).catch(() => []);
      const open = (wds || []).filter(w => {
        const st = String(w.status || '').toLowerCase();
        return !['rejeitado', 'cancelado', 'estornado'].includes(st);
      });
      for (const w of open) {
        await this.ensureWithdrawalBalanceDebited(w);
      }
    },

    async markWdPaid(id, note='') {
      const wd = await this._getWd(id);
      const row = await this._patchWd(id, {
        status: 'pago',
        admin_note: note,
        processed_at: new Date().toISOString(),
      });
      if (wd) await this.ensureWithdrawalBalanceDebited(wd);
      return row;
    },
  
    /* Verifica se é o primeiro saque do funcionário */
    async isFirstWithdrawal(empId) {
      const wds = await this.getWithdrawals(empId);
      return wds.length === 0;
    },

    async getWithdrawalById(id) {
      return this._getWd(id);
    },
  
    async _getWd(id) {
      if(this.online){const r=await supaReq('GET','withdrawals',null,`?id=eq.${id}&select=*&limit=1`);return r[0]||null;}
      return this._lget(this.LK.withdrawals).find(w=>w.id===id)||null;
    },

    _withdrawalPayloadForApi(row) {
      const keys = [
        'employee_id', 'amount', 'method', 'status', 'bank_account', 'notes', 'admin_note',
        'approved_by_master', 'approved_by_financial', 'master_approved_at', 'financial_approved_at',
        'processed_at', 'pix_key_type', 'pix_key', 'holder_name', 'bank_name',
        'pix_status', 'pix_id_envio', 'pix_e2e_id', 'pix_error', 'pix_paid_at',
        'wallet_unit', 'partner_root_id', 'updated_at',
      ];
      const out = {};
      keys.forEach((k) => {
        if (row[k] !== undefined) out[k] = row[k];
      });
      return out;
    },

    async _patchWd(id, upd) {
      const applyLocal = (payload) => {
        const list = this._lget(this.LK.withdrawals);
        const idx = list.findIndex(w => w.id === id);
        if (idx === -1) return null;
        list[idx] = { ...list[idx], ...payload };
        this._lset(this.LK.withdrawals, list);
        return list[idx];
      };

      const patchOnline = async (payload) => {
        _cacheDel('withdrawals');
        const body = this._withdrawalPayloadForApi(payload);
        const r = await supaReq('PATCH', 'withdrawals', body, `?id=eq.${id}`);
        return r[0] || null;
      };

      if (!this.online) {
        const row = applyLocal(upd);
        if (row && (upd.status === 'pago' || upd.pix_status === 'pago')) {
          await this.ensureWithdrawalBalanceDebited(row);
        }
        return row;
      }

      let payload = { ...upd };
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const row = await patchOnline(payload);
          if (row && (upd.status === 'pago' || upd.pix_status === 'pago')) {
            await this.ensureWithdrawalBalanceDebited(row);
          }
          return row;
        } catch (e) {
          const msg = String(e.message || e || '');
          const m = msg.match(/'([^']+)'\s+column|Could not find the '([^']+)' column/i);
          const badCol = m ? (m[2] || m[1]) : null;
          if (badCol && Object.prototype.hasOwnProperty.call(payload, badCol)) {
            console.warn('[DB] withdrawals PATCH sem coluna:', badCol);
            const next = { ...payload };
            delete next[badCol];
            payload = next;
            if (Object.keys(payload).length) continue;
          }
          throw e;
        }
      }
      return null;
    },
  
    /* ══ CLIENTS ══ */
    _dbNow() {
      return new Date().toISOString();
    },

    /** Pares camelCase ↔ snake_case gravados nas duas colunas do MySQL. */
    _DB_FIELD_MIRRORS: {
      clients: [
        ['supervisorId', 'supervisor_id'],
        ['civilState', 'civil_state'],
        ['motherName', 'mother_name'],
        ['fatherName', 'father_name'],
        ['updatedAt', 'updated_at'],
      ],
      proposals: [
        ['clientName', 'client_name'],
        ['clientCpf', 'client_cpf'],
        ['vendorId', 'vendor_id'],
        ['vendorName', 'vendor_name'],
        ['valorFinal', 'valor_final'],
        ['statusOp', 'status_op'],
        ['senhaContracheque', 'senha_contracheque'],
        ['senhaConsignacao', 'senha_consignacao'],
        ['compraDivida', 'compra_divida'],
        ['bancoComprado', 'banco_comprado'],
        ['bancoDigitado', 'banco_digitado'],
        ['solicitouBoleto', 'solicitou_boleto'],
        ['dataSolicitacao', 'data_solicitacao'],
        ['protocoloBacen', 'protocolo_bacen'],
        ['dataSolicitacaoBacen', 'data_solicitacao_bacen'],
        ['posVenda', 'pos_venda'],
        ['createdAt', 'created_at'],
        ['updatedAt', 'updated_at'],
        ['lastUpdatedBy', 'last_updated_by'],
        ['creditoRetorno', 'credito_retorno'],
        ['creditoEsteira', 'credito_esteira'],
      ],
    },

    _mirrorDbFields(table, data) {
      const pairs = this._DB_FIELD_MIRRORS[table];
      if (!pairs || !data) return data ? { ...data } : data;
      const out = { ...data };
      const empty = (v) => v === undefined || v === null || v === '';
      pairs.forEach(([a, b]) => {
        if (!empty(out[a]) && empty(out[b])) out[b] = out[a];
        else if (!empty(out[b]) && empty(out[a])) out[a] = out[b];
      });
      return out;
    },

    _clientDbColumns() {
      return new Set([
        'id', 'cpf', 'name', 'phone1', 'phone2', 'rg',
        'civilState', 'civil_state', 'address', 'email',
        'motherName', 'mother_name', 'fatherName', 'father_name',
        'documents', 'created_at', 'updated_at', 'updatedAt',
        'supervisorId', 'supervisor_id',
      ]);
    },

    _normalizeClientForDb(data, { isNew = false } = {}) {
      if (!data || typeof data !== 'object') return data;
      const now = this._dbNow();
      const out = { ...data };
      const cpf = String(out.cpf || out.id || '').replace(/\D/g, '');
      if (cpf) {
        out.id = cpf;
        out.cpf = cpf;
      }
      out.updatedAt = out.updatedAt || now;
      out.updated_at = out.updated_at || out.updatedAt;
      if (isNew) {
        out.created_at = out.created_at || out.createdAt || now;
      }
      return this._mirrorDbFields('clients', out);
    },

    _sanitizeClientForApi(data) {
      if (!data || typeof data !== 'object') return data;
      const allowed = this._clientDbColumns();
      const out = {};
      Object.keys(data).forEach((k) => {
        if (allowed.has(k) && data[k] !== undefined) out[k] = data[k];
      });
      return out;
    },

    _normalizeProposalForDb(data, { isNew = false } = {}) {
      if (!data || typeof data !== 'object') return data;
      const now = this._dbNow();
      const p = { ...data };
      p.updatedAt = now;
      p.updated_at = now;
      if (isNew) {
        p.created_at = p.created_at || p.createdAt || now;
        p.createdAt = p.createdAt || p.created_at || now;
      }
      const vid = p.vendorId || p.vendor_id || p.employee_id;
      if (vid) {
        p.vendorId = vid;
        p.vendor_id = vid;
        p.employee_id = p.employee_id || vid;
      }
      if (p.status && !p.statusOp && !p.status_op) {
        p.statusOp = p.status;
        p.status_op = p.status;
      }
      return this._mirrorDbFields('proposals', p);
    },

    _CLIENTS_LIST_COLS: 'id,cpf,name,phone1,phone2,email,rg,supervisorId,supervisor_id,civilState,address,created_at,updatedAt,updated_at',
    _CLIENTS_ORDER: 'updatedAt.desc,updated_at.desc,created_at.desc',

    async getClients(opts = {}) {
      const limit = opts.pageSize ? Math.min(Number(opts.pageSize) || 1000, 2000) : 1000;
      const cols = opts.full ? '*' : this._CLIENTS_LIST_COLS;
      let ids = Array.isArray(opts.supervisorIds)
        ? opts.supervisorIds.filter(Boolean).map(String).slice(0, 60)
        : [];
      if (opts.partnerRootId && !ids.length) {
        const teamSet = await this.getPartnerTeamIds(opts.partnerRootId);
        ids = [...teamSet].slice(0, 60);
      }
      let list;
      if (this.online) {
        try {
          let params;
          if (opts.supervisorId) {
            params = `?supervisorId=eq.${encodeURIComponent(opts.supervisorId)}&select=${cols}&order=${this._CLIENTS_ORDER}&limit=${limit}`;
          } else if (ids.length) {
            const inList = ids.map(encodeURIComponent).join(',');
            params = `?supervisorId=in.(${inList})&select=${cols}&order=${this._CLIENTS_ORDER}&limit=${limit}`;
          } else {
            params = `?select=${cols}&order=${this._CLIENTS_ORDER}&limit=${limit}`;
          }
          list = await supaReq('GET', 'clients', null, params);
        } catch (e) {
          const msg = String(e.message || e || '');
          if (ids.length && /supervisorId|column|PGRST/i.test(msg)) {
            try {
              list = await supaReq('GET', 'clients', null, `?select=${cols}&order=${this._CLIENTS_ORDER}&limit=${limit}`);
            } catch (e2) {
              console.warn('[DB] getClients fallback:', e2.message);
              list = this._lget(this.LK.clients);
            }
          } else {
            console.warn('[DB] Erro ao buscar clientes no Supabase, usando local:', msg);
            list = this._lget(this.LK.clients);
          }
        }
      } else {
        list = this._lget(this.LK.clients);
      }
      if (!Array.isArray(list)) list = [];
      if (opts.supervisorId) {
        const sid = String(opts.supervisorId);
        list = list.filter(c => String(c.supervisorId || c.supervisor_id || '') === sid);
      }
      if (ids.length && (!this.online || list.length > limit)) {
        const set = new Set(ids);
        list = list.filter(c => set.has(String(c.supervisorId || c.supervisor_id || '')));
      }
      if (limit) list = list.slice(0, limit);
      return list;
    },
    async getClientByCpf(cpf) {
      return this.findClientByCpf(cpf);
    },

    async findClientByCpf(cpf) {
      const digits = String(cpf || '').replace(/\D/g, '');
      if (!digits) return null;
      if (this.online) {
        try {
          const r = await supaReq('GET', 'clients', null, `?cpf=eq.${digits}&select=*&limit=1`);
          if (r && r[0]) return r[0];
        } catch (e) {
          console.warn('[DB] Erro ao buscar cliente por CPF:', e.message);
        }
        try {
          const r2 = await supaReq('GET', 'clients', null, `?id=eq.${digits}&select=*&limit=1`);
          if (r2 && r2[0]) return r2[0];
        } catch (_) { /* noop */ }
      }
      const list = this._lget(this.LK.clients) || [];
      return list.find((c) => {
        const id = String(c.id || '').replace(/\D/g, '');
        const cp = String(c.cpf || '').replace(/\D/g, '');
        return cp === digits || id === digits;
      }) || null;
    },
    async addClient(data) {
      const row = this._sanitizeClientForApi(this._normalizeClientForDb(data, { isNew: true }));
      if (!row.id) row.id = this._genId('cli');
      if (this.online) {
        _cacheDel('clients');
        const r = await supaReq('POST', 'clients', row);
        return r[0] || row;
      }
      const list = this._lget(this.LK.clients);
      list.push(row);
      this._lset(this.LK.clients, list);
      return row;
    },
    async updateClient(id, updates) {
      const row = this._sanitizeClientForApi(this._normalizeClientForDb(updates, { isNew: false }));
      if (this.online) {
        _cacheDel('clients');
        const r = await supaReq('PATCH', 'clients', row, `?id=eq.${encodeURIComponent(id)}`);
        return r[0] || null;
      }
      const list = this._lget(this.LK.clients);
      const idx = list.findIndex(c => c.id === id);
      if (idx === -1) return null;
      list[idx] = { ...list[idx], ...row };
      this._lset(this.LK.clients, list);
      return list[idx];
    },
  
    /* Colunas leves — evita timeout ao buscar attachments/history em massa */
    _PROPOSALS_LIST_COLS: 'id,numero,vendorId,vendor_id,vendorName,vendor_name,clientName,client_name,clientCpf,client_cpf,product,convenio,entidade,valor,valorFinal,valor_final,desconto,tabela,status,statusOp,status_op,matricula,protocolo,obs,fases,comissaoElegivel,comissao_elegivel,comissaoRecebida,comissao_recebida,valorComissaoRecebida,valor_comissao_recebida,createdAt,created_at,updatedAt,updated_at,employee_id',

    /** Valor monetário da proposta (valorFinal → valor_final → valor). */
    proposalAmount(p) {
      const v = parseFloat(p?.valorFinal ?? p?.valor_final ?? p?.valor ?? 0);
      return Number.isFinite(v) ? v : 0;
    },

    /** Vendedor responsável (vendorId → vendor_id → employee_id). */
    proposalVendorId(p) {
      return String(p?.vendorId ?? p?.vendor_id ?? p?.employee_id ?? '').trim();
    },

    /** Data para filtros de faturamento por período (criação → última alteração). */
    proposalBillingDate(p) {
      const raw = p?.createdAt ?? p?.created_at;
      if (raw) {
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) return d;
      }
      return this.proposalDate(p);
    },

    proposalInDateRange(p, from, to) {
      const d = this.proposalBillingDate(p);
      return d >= from && d < to;
    },

    /** Resolve vendedor por ID ou nome (totais por equipe/ranking). */
    resolveProposalVendorId(p, usersByName) {
      const vid = this.proposalVendorId(p);
      if (vid) return vid;
      const vn = this._normVendorName(p?.vendorName || p?.vendor_name);
      return (vn && usersByName?.[vn]) || '';
    },

    /** Timestamp para ordenar listas (última alteração → topo). */
    proposalSortTime(p) {
      const dates = [];
      const push = (v) => {
        if (!v) return;
        const t = new Date(v).getTime();
        if (!Number.isNaN(t)) dates.push(t);
      };
      push(p?.updatedAt || p?.updated_at);
      if (Array.isArray(p?.history)) {
        for (const h of p.history) push(h?.date);
      }
      push(p?.createdAt || p?.created_at);
      return dates.length ? Math.max(...dates) : 0;
    },

    proposalDate(p) {
      return new Date(this.proposalSortTime(p));
    },

    async listProposals() {
      if (this.online) {
        try {
          return await supaReq('GET', 'proposals', null, this._proposalsListQuery());
        } catch (e) {
          console.warn('[DB] listProposals:', e.message);
          return [];
        }
      }
      return this._lget(this.LK.proposals);
    },
  
    _proposalsListQuery(extra = '') {
      return `?select=${this._PROPOSALS_LIST_COLS}&order=updated_at.desc.nullslast,created_at.desc&limit=2000${extra}`;
    },
  
    _normVendorName(n) {
      return String(n || '').trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    },

    /** Todos os IDs de vendedor distintos (legado: múltiplas colunas no banco). */
    _proposalVendorIds(p) {
      const o = p || {};
      const seen = new Set();
      const out = [];
      for (const v of [o.vendorId, o.vendor_id, o.employee_id]) {
        const s = String(v || '').trim();
        if (s && !seen.has(s)) {
          seen.add(s);
          out.push(s);
        }
      }
      return out;
    },
  
    _matchProposalToVendor(p, user) {
      if (!p || !user || !user.id) return false;
      const uid = String(user.id).trim();
      if (this._proposalVendorIds(p).some(vid => vid === uid)) return true;
      if (user.name) {
        const vn = this._normVendorName(p.vendorName || p.vendor_name);
        const un = this._normVendorName(user.name);
        if (vn && un && vn === un) return true;
      }
      return false;
    },
  
    async _getVendorClientCpfs(userId) {
      if (!userId) return new Set();
      try {
        if (this.online) {
          const rows = await supaReq('GET', 'clients', null, `?supervisorId=eq.${encodeURIComponent(userId)}&select=cpf,id`);
          return new Set((rows || []).map(c => String(c.cpf || c.id || '').replace(/\D/g, '')).filter(Boolean));
        }
        return new Set(
          this._lget(this.LK.clients)
            .filter(c => String(c.supervisorId || '') === String(userId))
            .map(c => String(c.cpf || c.id || '').replace(/\D/g, ''))
            .filter(Boolean)
        );
      } catch (e) {
        console.warn('[DB] _getVendorClientCpfs:', e.message);
        return new Set();
      }
    },
  
    /* ══ PROPOSALS ══ */
    async getProposals(empId = null, user = null, opts = {}) {
      const vendor = user || (empId ? { id: empId } : null);
      const uid = (vendor && vendor.id) ? vendor.id : empId;
      const partnerRootId = opts.partnerRootId || null;

      if (this.online) {
        if (!uid && partnerRootId) {
          const teamIds = await this.getPartnerTeamIds(partnerRootId);
          const all = await supaReq('GET', 'proposals', null, this._proposalsListQuery()).catch(() => []);
          return (all || []).filter(p => {
            const vids = this._proposalVendorIds(p);
            return vids.some(id => id && teamIds.has(String(id)));
          }).sort((a, b) => this.proposalSortTime(b) - this.proposalSortTime(a));
        }
        if (!uid) {
          return await supaReq('GET', 'proposals', null, this._proposalsListQuery());
        }
  
        const seen = new Set();
        const rows = [];
        const push = (list) => {
          for (const p of list || []) {
            if (!p || !p.id || seen.has(p.id)) continue;
            seen.add(p.id);
            rows.push(p);
          }
        };
  
        const base = this._proposalsListQuery();
        for (const col of ['employee_id', 'vendorId', 'vendor_id']) {
          try {
            const part = await supaReq('GET', 'proposals', null, `${base}&${col}=eq.${encodeURIComponent(uid)}`);
            push(part);
          } catch (e) {
            console.warn(`[DB] getProposals ${col}:`, e.message);
          }
        }
  
        if (rows.length === 0) {
          try {
            const all = await supaReq('GET', 'proposals', null, base);
            push((all || []).filter(p => this._matchProposalToVendor(p, vendor)));
          } catch (e) {
            console.warn('[DB] getProposals name fallback:', e.message);
          }
        }
  
        if (rows.length === 0) {
          const cpfs = await this._getVendorClientCpfs(uid);
          if (cpfs.size) {
            try {
              const all = await supaReq('GET', 'proposals', null, base);
              push((all || []).filter(p => cpfs.has(String(p.clientCpf || p.client_cpf || '').replace(/\D/g, ''))));
            } catch (e) {
              console.warn('[DB] getProposals client fallback:', e.message);
            }
          }
        }
  
        return rows.sort((a, b) => this.proposalSortTime(b) - this.proposalSortTime(a));
      }
  
      const all = this._lget(this.LK.proposals);
      if (!uid) return all;
  
      const cpfs = await this._getVendorClientCpfs(uid);
      return all.filter(p => {
        if (this._matchProposalToVendor(p, vendor)) return true;
        if (!cpfs.size) return false;
        return cpfs.has(String(p.clientCpf || p.client_cpf || '').replace(/\D/g, ''));
      }).sort((a, b) => this.proposalSortTime(b) - this.proposalSortTime(a));
    },
    /** Colunas reais da tabela proposals no Supabase (evita PGRST204). */
    _proposalSupabaseColumns() {
      return new Set([
        'id', 'numero', 'clientName', 'client_name', 'clientCpf', 'client_cpf',
        'vendorId', 'vendor_id', 'vendorName', 'vendor_name', 'employee_id',
        'product', 'convenio', 'entidade', 'matricula', 'protocolo', 'obs', 'tabela',
        'valor', 'valorFinal', 'valor_final', 'valorSolicitado', 'desconto',
        'status', 'statusOp', 'status_op',
        'senhaContracheque', 'senha_consignacao', 'senhaConsignacao', 'senha_contracheque',
        'compraDivida', 'compra_divida', 'bancoComprado', 'banco_comprado',
        'bancoDigitado', 'banco_digitado',
        'solicitouBoleto', 'solicitou_boleto', 'solicitacaoBoleto',
        'dataSolicitacao', 'data_solicitacao', 'dataSolicitacaoBacen', 'data_solicitacao_bacen',
        'bacen', 'protocoloBacen', 'protocolo_bacen', 'assinou',
        'posVenda', 'pos_venda', 'nuvidio', 'fases',
        'comissaoElegivel', 'comissao_elegivel', 'comissaoRecebida', 'comissao_recebida',
        'valorComissaoRecebida', 'valor_comissao_recebida',
        'attachments', 'history', 'email_contato',
        'creditoRetorno', 'credito_retorno', 'creditoEsteira', 'credito_esteira',
        'meta', 'credito',
        'createdAt', 'created_at', 'updatedAt', 'updated_at',
        'lastUpdatedBy', 'last_updated_by',
      ]);
    },

    _appendProposalObsLine(obs, line) {
      const o = String(obs || '').trim();
      const tag = String(line || '').trim();
      if (!tag || o.includes(tag)) return o;
      return o ? `${o}\n${tag}` : tag;
    },

    /** Evita PATCH gigante (base64 em anexos) que o nginx/WAF pode bloquear com 403. */
    _compactProposalPayloadForApi(payload) {
      if (!payload || typeof payload !== 'object') return payload;
      const p = { ...payload };
      const maxBytes = 850000;
      if (p.attachments && typeof p.attachments === 'object' && !Array.isArray(p.attachments)) {
        const att = { ...p.attachments };
        const stripped = [];
        Object.keys(att).forEach((k) => {
          const v = att[k];
          if (typeof v === 'string' && /^data:/i.test(v) && v.length > 120000) {
            stripped.push(k);
            delete att[k];
          }
        });
        p.attachments = att;
        if (stripped.length) {
          console.warn('[DB] Anexos base64 grandes omitidos do save:', stripped);
          p._attachments_stripped = stripped;
        }
      }
      const json = JSON.stringify(p);
      if (json.length > maxBytes) {
        throw new Error('PAYLOAD_TOO_LARGE');
      }
      if (p._attachments_stripped?.length) {
        throw new Error('ATTACHMENTS_TOO_LARGE');
      }
      delete p._attachments_stripped;
      return p;
    },

    /** Remove campos que não existem no PostgREST. */
    _sanitizeProposalForApi(data) {
      if (!data || typeof data !== 'object') return data;
      const allowed = this._proposalSupabaseColumns();
      const useBancoDigCol = window.SOUBLU_CONFIG?.PROPOSALS_BANCO_DIGITADO_COLUMN !== false;
      const p = this._mirrorDbFields('proposals', { ...data });
      delete p.etapaVendedor;

      const bancoDig = String(p.bancoDigitado ?? p.banco_digitado ?? '').trim();
      delete p.bancoDigitado;
      delete p.banco_digitado;
      if (bancoDig) {
        if (useBancoDigCol) {
          p.bancoDigitado = bancoDig;
          p.banco_digitado = bancoDig;
        } else {
          p.obs = this._appendProposalObsLine(p.obs, `Banco digitado: ${bancoDig}`);
        }
      }

      const out = {};
      Object.keys(p).forEach(k => {
        if (!allowed.has(k) || p[k] === undefined) return;
        out[k] = p[k];
      });
      return out;
    },

    async addProposal(data) {
      const prop = this._normalizeProposalForDb(
        { id: this._genId('prop'), ...data },
        { isNew: true }
      );
      let row = this.online ? this._sanitizeProposalForApi(prop) : prop;
      if (this.online) {
        row = this._compactProposalPayloadForApi(row);
        _cacheDel('proposals');
        await supaReq('POST', 'proposals', row);
      } else {
        const list = this._lget(this.LK.proposals);
        list.push(prop);
        this._lset(this.LK.proposals, list);
      }
      return prop;
    },
    async updateProposal(id, updates) {
      const row = this._sanitizeProposalForApi(this._normalizeProposalForDb(updates, { isNew: false }));
      if (this.online) {
        _cacheDel('proposals');
        const r = await supaReq('PATCH', 'proposals', row, `?id=eq.${encodeURIComponent(id)}`);
        return r[0] || null;
      }
      const list = this._lget(this.LK.proposals);
      const idx = list.findIndex(p => p.id === id);
      if (idx === -1) return null;
      list[idx] = { ...list[idx], ...row };
      this._lset(this.LK.proposals, list);
      return list[idx];
    },

    /** PATCH limpo — evita enviar campos inválidos que quebram status/histórico. */
    async saveProposal(proposal) {
      if (!proposal?.id) throw new Error('ID da proposta é obrigatório.');
      const merged = await this._hydrateProposalForSave(proposal);
      let payload = this._sanitizeProposalForApi(this._normalizeProposalForDb(merged, { isNew: false }));
      if (this.online) {
        payload = this._compactProposalPayloadForApi(payload);
        _cacheDel('proposals');
        let r = await supaReq('PATCH', 'proposals', payload, `?id=eq.${encodeURIComponent(merged.id)}`);
        if (!r || (Array.isArray(r) && r.length === 0)) {
          const created = this._compactProposalPayloadForApi(this._sanitizeProposalForApi(
            this._normalizeProposalForDb(
              { ...merged, id: merged.id },
              { isNew: true }
            )
          ));
          r = await supaReq('POST', 'proposals', created);
        }
        const saved = Array.isArray(r) ? r[0] : r;
        if (!saved) throw new Error('Proposta não encontrada ou não foi possível salvar.');
        return saved;
      }
      const list = this._lget(this.LK.proposals);
      const idx = list.findIndex(x => x.id === merged.id);
      if (idx === -1) return null;
      list[idx] = { ...list[idx], ...merged, ...payload };
      this._lset(this.LK.proposals, list);
      return list[idx];
    },

    /** Normaliza attachments (jsonb string, array legado ou objeto). */
    _parseProposalAttachments(att) {
      if (!att) return {};
      if (typeof att === 'string') {
        try { att = JSON.parse(att); } catch { return {}; }
      }
      if (Array.isArray(att)) {
        const out = {};
        att.forEach((item, i) => {
          if (!item || typeof item !== 'object') return;
          const url = item.url || item.path || item.src || item.href;
          if (url) {
            const key = `file_${i + 1}`;
            out[key] = url;
            if (item.name || item.nome) out[key + '_nome'] = item.name || item.nome;
          }
        });
        return out;
      }
      return att && typeof att === 'object' ? att : {};
    },

    _mergeProposalAttachments(existing, incoming) {
      const ex = this._parseProposalAttachments(existing);
      const inc = incoming === undefined ? {} : this._parseProposalAttachments(incoming);
      return { ...ex, ...inc };
    },

    _parseProposalJsonField(val) {
      if (!val) return {};
      if (typeof val === 'string') {
        try { return JSON.parse(val) || {}; } catch { return {}; }
      }
      return val && typeof val === 'object' && !Array.isArray(val) ? val : {};
    },

    _mergeProposalCreditoField(existing, incoming) {
      const ex = this._parseProposalJsonField(existing);
      const inc = this._parseProposalJsonField(incoming);
      const merged = { ...ex, ...inc };
      if (ex.attachments || inc.attachments) {
        merged.attachments = this._mergeProposalAttachments(ex.attachments, inc.attachments);
      }
      return merged;
    },

    /** Espelha anexos de retorno/esteira em proposals.attachments (chaves retorno_*). */
    _syncRetornoAttachmentsToTopLevel(attachments, retornoAtt) {
      const out = { ...this._parseProposalAttachments(attachments) };
      const ret = retornoAtt && typeof retornoAtt === 'object' ? retornoAtt : {};
      Object.keys(ret).forEach((k) => {
        if (ret[k] == null || ret[k] === '') return;
        const topKey = k.startsWith('retorno_') ? k : `retorno_${k}`;
        out[topKey] = ret[k];
      });
      return out;
    },

    _extractRetornoAttachmentsFromTopLevel(attachments) {
      const att = this._parseProposalAttachments(attachments);
      const out = {};
      Object.keys(att).forEach((k) => {
        if (!k.startsWith('retorno_')) return;
        const short = k.slice('retorno_'.length);
        if (short) out[short] = att[k];
      });
      return out;
    },

    /** Mescla proposta com registro existente — preserva anexos e dados de crédito. */
    async _hydrateProposalForSave(proposal) {
      if (!proposal?.id) return proposal;
      let existing = null;
      try {
        existing = await this.getProposal(proposal.id);
      } catch (e) {
        console.warn('[DB] hydrateProposalForSave:', e.message);
      }
      if (!existing) {
        const cr = proposal.creditoRetorno || proposal.credito_retorno;
        if (cr) {
          const mergedCr = this._mergeProposalCreditoField(null, cr);
          proposal.attachments = this._syncRetornoAttachmentsToTopLevel(proposal.attachments, mergedCr.attachments);
          proposal.creditoRetorno = mergedCr;
          proposal.credito_retorno = mergedCr;
        }
        return proposal;
      }

      const out = { ...existing, ...proposal };
      if (proposal.history) out.history = proposal.history;

      out.attachments = this._mergeProposalAttachments(existing.attachments, proposal.attachments);

      const exCr = existing.creditoRetorno || existing.credito_retorno;
      const inCr = proposal.creditoRetorno || proposal.credito_retorno;
      if (exCr || inCr) {
        let mergedCr = this._mergeProposalCreditoField(exCr, inCr);
        const fromTop = this._extractRetornoAttachmentsFromTopLevel(out.attachments);
        mergedCr.attachments = this._mergeProposalAttachments(mergedCr.attachments, fromTop);
        out.creditoRetorno = mergedCr;
        out.credito_retorno = mergedCr;
        out.attachments = this._syncRetornoAttachmentsToTopLevel(out.attachments, mergedCr.attachments);
      } else {
        const fromTop = this._extractRetornoAttachmentsFromTopLevel(out.attachments);
        if (Object.keys(fromTop).length) {
          out.attachments = this._syncRetornoAttachmentsToTopLevel(out.attachments, fromTop);
        }
      }

      const exCe = existing.creditoEsteira || existing.credito_esteira;
      const inCe = proposal.creditoEsteira || proposal.credito_esteira;
      if (exCe || inCe) {
        const mergedCe = this._mergeProposalCreditoField(exCe, inCe);
        out.creditoEsteira = mergedCe;
        out.credito_esteira = mergedCe;
      }

      if (existing.meta || proposal.meta) {
        out.meta = {
          ...this._parseProposalJsonField(existing.meta),
          ...this._parseProposalJsonField(proposal.meta),
        };
      }
      if (proposal.credito !== undefined) out.credito = proposal.credito;
      else if (existing.credito !== undefined) out.credito = existing.credito;

      return out;
    },

    /** Uma proposta completa (select=*) — lista parcial não traz attachments/history. */
    async getProposal(id) {
      if (!id) return null;
      const row = await this.get('proposals', id);
      if (!row) return null;
      if (row.attachments != null) {
        row.attachments = this._parseProposalAttachments(row.attachments);
      }
      return row;
    },

    /** Compatível com Proposals.openAdminModal — anexos vêm da própria linha. */
    async getProposalAttachments(id) {
      const p = await this.getProposal(id);
      if (!p) return null;
      return { attachments: this._parseProposalAttachments(p.attachments) };
    },

    async deleteProposal(id) {
      if (!id) return;
      if (this.online) {
        _cacheDel('proposals');
        return await supaReq('DELETE', 'proposals', null, `?id=eq.${encodeURIComponent(id)}`);
      }
      this._lset(this.LK.proposals, this._lget(this.LK.proposals).filter(p => p.id !== id));
    },

    /** Leitura local (FileReader) — usada quando Storage não está disponível. */
    _fileToDataURL(file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error || new Error('Não foi possível ler o arquivo.'));
        r.readAsDataURL(file);
      });
    },

    /**
     * Upload de anexo da proposta: tenta bucket Supabase `proposal-attachments` (público);
     * se falhar (bucket inexistente, CORS, file://, etc.), grava data URL na proposta.
     */
    async uploadProposalFile(file, proposalId, grupo) {
      if (!file || !(file instanceof Blob)) {
        throw new Error('Arquivo inválido.');
      }
      const bucket = 'proposal-attachments';
      const safePid = String(proposalId || 'new').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
      const safeGrp = String(grupo || 'doc').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
      const origName = file.name || 'arquivo';
      const extRaw = origName.includes('.') ? origName.split('.').pop() : '';
      const ext = (extRaw && /^[a-zA-Z0-9]+$/.test(extRaw)) ? extRaw.toLowerCase().slice(0, 12) : 'bin';
      const path = `${safePid}/${safeGrp}_${Date.now()}.${ext}`;
      const contentType = file.type || (ext === 'pdf' ? 'application/pdf' : 'application/octet-stream');

      const _cfg = typeof window !== 'undefined' && window.SOUBLU_CONFIG ? window.SOUBLU_CONFIG : {};
      const _hostUp = String(_cfg.DB_BACKEND || '').toLowerCase() === 'hostinger'
        && _cfg.UPLOAD_URL && _cfg.API_KEY;
      if (_hostUp && typeof uploadImage === 'function') {
        try {
          const url = await uploadImage(file, bucket, `${safePid}/${safeGrp}_${Date.now()}`);
          if (url && !String(url).startsWith('data:')) return url;
        } catch (e) {
          console.warn('[DB] uploadProposalFile hostinger:', e);
        }
      }

      if (this.online && typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_KEY !== 'undefined') {
        try {
          const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': contentType,
              'x-upsert': 'true',
            },
            body: file,
          });
          if (res.ok) {
            return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
          }
          const txt = await res.text().catch(() => '');
          console.warn('[DB] proposal-attachments storage:', res.status, txt);
        } catch (e) {
          console.warn('[DB] uploadProposalFile:', e);
        }
      }
      return this._fileToDataURL(file);
    },
  
    /* ══ TIM — Indicação e esteira ══ */
    _normTimReferral(row) {
      if (!row || typeof row !== 'object') return row;
      let att = row.attachments;
      if (typeof att === 'string') {
        try { att = JSON.parse(att); } catch { att = {}; }
      }
      if (!att || typeof att !== 'object' || Array.isArray(att)) att = {};
      return {
        ...row,
        cnpj: String(row.cnpj || '').replace(/\D/g, '') || row.cnpj,
        attachments: att,
        nuvideo_ok: !!row.nuvideo_ok,
        valor_receita: row.valor_receita != null ? Number(row.valor_receita) : null,
      };
    },

    async getTimReferrals(opts = {}) {
      const { partnerRootId, vendorId, limit = 500 } = opts;
      if (this.online) {
        try {
          let q = '?select=*&order=created_at.desc';
          if (limit) q += `&limit=${limit}`;
          if (partnerRootId) q += `&partner_root_id=eq.${encodeURIComponent(partnerRootId)}`;
          if (vendorId) q += `&vendor_id=eq.${encodeURIComponent(vendorId)}`;
          const rows = await supaReq('GET', 'tim_referrals', null, q);
          return (rows || []).map(r => this._normTimReferral(r));
        } catch (e) {
          console.warn('[DB] getTimReferrals:', e.message);
          return [];
        }
      }
      let all = (this._lget(this.LK.tim_referrals) || []).map(r => this._normTimReferral(r));
      if (partnerRootId) all = all.filter(r => String(r.partner_root_id || '') === String(partnerRootId));
      if (vendorId) all = all.filter(r => String(r.vendor_id || '') === String(vendorId));
      return all.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    },

    async getTimReferral(id) {
      if (!id) return null;
      if (this.online) {
        try {
          const r = await supaReq('GET', 'tim_referrals', null, `?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
          return this._normTimReferral(r[0]) || null;
        } catch (e) {
          console.warn('[DB] getTimReferral:', e.message);
          return null;
        }
      }
      const row = (this._lget(this.LK.tim_referrals) || []).find(x => x.id === id);
      return row ? this._normTimReferral(row) : null;
    },

    async addTimReferral(data) {
      const now = new Date().toISOString();
      const row = this._normTimReferral({
        id: this._genId('tim'),
        status: 'indicado',
        nuvideo_ok: false,
        attachments: {},
        created_at: now,
        updated_at: now,
        ...data,
      });
      if (this.online) {
        _cacheDel('tim_referrals');
        await supaReq('POST', 'tim_referrals', row);
        return row;
      }
      const list = this._lget(this.LK.tim_referrals) || [];
      list.push(row);
      this._lset(this.LK.tim_referrals, list);
      return row;
    },

    async updateTimReferral(id, updates) {
      if (!id) return null;
      const patch = { ...updates, updated_at: new Date().toISOString() };
      if (this.online) {
        _cacheDel('tim_referrals');
        const r = await supaReq('PATCH', 'tim_referrals', patch, `?id=eq.${encodeURIComponent(id)}`);
        return this._normTimReferral(r[0]) || null;
      }
      const list = this._lget(this.LK.tim_referrals) || [];
      const idx = list.findIndex(x => x.id === id);
      if (idx === -1) return null;
      list[idx] = this._normTimReferral({ ...list[idx], ...patch });
      this._lset(this.LK.tim_referrals, list);
      return list[idx];
    },

    /* ══ CONTESTAÇÕES ══ */
    _normContestation(row) {
      if (!row || typeof row !== 'object') return row;
      const parseJson = (v, fb) => {
        if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fb; } }
        return v && typeof v === 'object' ? v : fb;
      };
      return {
        ...row,
        partner_response: parseJson(row.partner_response, {}),
        attachments: parseJson(row.attachments, {}),
        admin_review: parseJson(row.admin_review, {}),
      };
    },

    async getContestations(opts = {}) {
      const { partnerRootId, vendorId, limit = 500 } = opts;
      if (this.online) {
        try {
          let q = '?select=*&order=created_at.desc';
          if (limit) q += `&limit=${limit}`;
          if (partnerRootId) q += `&partner_root_id=eq.${encodeURIComponent(partnerRootId)}`;
          if (vendorId) q += `&vendor_id=eq.${encodeURIComponent(vendorId)}`;
          const rows = await supaReq('GET', 'contestations', null, q);
          return (rows || []).map(r => this._normContestation(r));
        } catch (e) {
          console.warn('[DB] getContestations:', e.message);
          return [];
        }
      }
      let all = (this._lget(this.LK.contestations) || []).map(r => this._normContestation(r));
      if (partnerRootId) all = all.filter(r => String(r.partner_root_id || '') === String(partnerRootId));
      if (vendorId) all = all.filter(r => String(r.vendor_id || '') === String(vendorId));
      return all.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    },

    async getContestation(id) {
      if (!id) return null;
      if (this.online) {
        try {
          const r = await supaReq('GET', 'contestations', null, `?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
          return this._normContestation(r[0]) || null;
        } catch (e) {
          console.warn('[DB] getContestation:', e.message);
          return null;
        }
      }
      const row = (this._lget(this.LK.contestations) || []).find(x => x.id === id);
      return row ? this._normContestation(row) : null;
    },

    async addContestation(data) {
      const now = new Date().toISOString();
      const proto = data.protocolo || `CT-${Date.now().toString(36).toUpperCase()}`;
      const row = this._normContestation({
        id: this._genId('ct'),
        protocolo: proto,
        status: 'aguardando_resposta',
        partner_response: {},
        attachments: {},
        admin_review: {},
        created_at: now,
        updated_at: now,
        ...data,
      });
      if (this.online) {
        _cacheDel('contestations');
        await supaReq('POST', 'contestations', row);
        return row;
      }
      const list = this._lget(this.LK.contestations) || [];
      list.push(row);
      this._lset(this.LK.contestations, list);
      return row;
    },

    async updateContestation(id, updates) {
      if (!id) return null;
      const patch = { ...updates, updated_at: new Date().toISOString() };
      if (updates.status && String(updates.status).startsWith('encerrada')) {
        patch.closed_at = new Date().toISOString();
      }
      if (this.online) {
        _cacheDel('contestations');
        const r = await supaReq('PATCH', 'contestations', patch, `?id=eq.${encodeURIComponent(id)}`);
        return this._normContestation(r[0]) || null;
      }
      const list = this._lget(this.LK.contestations) || [];
      const idx = list.findIndex(x => x.id === id);
      if (idx === -1) return null;
      list[idx] = this._normContestation({ ...list[idx], ...patch });
      this._lset(this.LK.contestations, list);
      return list[idx];
    },

    /* ══ FISCAL PARCEIRO ══ */
    _normPartnerFiscal(row) {
      if (!row || typeof row !== 'object') return row;
      let dados = row.dados_nf;
      if (typeof dados === 'string') {
        try { dados = JSON.parse(dados); } catch { dados = {}; }
      }
      if (!dados || typeof dados !== 'object' || Array.isArray(dados)) dados = {};
      return {
        ...row,
        dados_nf: dados,
        valor_fechamento: row.valor_fechamento != null ? Number(row.valor_fechamento) : null,
      };
    },

    async getPartnerFiscalRecords(opts = {}) {
      const { partnerRootId, partnerId, limit = 500 } = opts;
      if (this.online) {
        try {
          let q = '?select=*&order=created_at.desc';
          if (limit) q += `&limit=${limit}`;
          if (partnerRootId) q += `&partner_root_id=eq.${encodeURIComponent(partnerRootId)}`;
          if (partnerId) q += `&partner_id=eq.${encodeURIComponent(partnerId)}`;
          const rows = await supaReq('GET', 'partner_fiscal', null, q);
          return (rows || []).map(r => this._normPartnerFiscal(r));
        } catch (e) {
          console.warn('[DB] getPartnerFiscalRecords:', e.message);
          return [];
        }
      }
      let all = (this._lget(this.LK.partner_fiscal) || []).map(r => this._normPartnerFiscal(r));
      if (partnerRootId) all = all.filter(r => String(r.partner_root_id || '') === String(partnerRootId));
      if (partnerId) all = all.filter(r => String(r.partner_id || '') === String(partnerId));
      return all.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    },

    async getPartnerFiscalRecord(id) {
      if (!id) return null;
      if (this.online) {
        try {
          const r = await supaReq('GET', 'partner_fiscal', null, `?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
          return this._normPartnerFiscal(r[0]) || null;
        } catch (e) {
          console.warn('[DB] getPartnerFiscalRecord:', e.message);
          return null;
        }
      }
      const row = (this._lget(this.LK.partner_fiscal) || []).find(x => x.id === id);
      return row ? this._normPartnerFiscal(row) : null;
    },

    async addPartnerFiscalRecord(data) {
      const now = new Date().toISOString();
      const row = this._normPartnerFiscal({
        id: this._genId('fsc'),
        status: 'enviado',
        dados_nf: {},
        created_at: now,
        updated_at: now,
        ...data,
      });
      if (this.online) {
        _cacheDel('partner_fiscal');
        await supaReq('POST', 'partner_fiscal', row);
        return row;
      }
      const list = this._lget(this.LK.partner_fiscal) || [];
      list.push(row);
      this._lset(this.LK.partner_fiscal, list);
      return row;
    },

    async updatePartnerFiscalRecord(id, updates) {
      if (!id) return null;
      const patch = { ...updates, updated_at: new Date().toISOString() };
      if (this.online) {
        _cacheDel('partner_fiscal');
        const r = await supaReq('PATCH', 'partner_fiscal', patch, `?id=eq.${encodeURIComponent(id)}`);
        return this._normPartnerFiscal(r[0]) || null;
      }
      const list = this._lget(this.LK.partner_fiscal) || [];
      const idx = list.findIndex(x => x.id === id);
      if (idx === -1) return null;
      list[idx] = this._normPartnerFiscal({ ...list[idx], ...patch });
      this._lset(this.LK.partner_fiscal, list);
      return list[idx];
    },

    /* ══ TREINAMENTOS ══ */
    _parseJsonField(v, fb) {
      if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fb; } }
      return v && typeof v === 'object' && !Array.isArray(v) ? v : (Array.isArray(v) ? v : fb);
    },

    _normTraining(row) {
      if (!row || typeof row !== 'object') return row;
      let aud = row.audience_roles;
      if (typeof aud === 'string') { try { aud = JSON.parse(aud); } catch { aud = ['*']; } }
      if (!Array.isArray(aud) || !aud.length) aud = ['*'];
      let qs = row.questions;
      if (typeof qs === 'string') { try { qs = JSON.parse(qs); } catch { qs = []; } }
      if (!Array.isArray(qs)) qs = [];
      return {
        ...row,
        category: row.category || 'obrigatorio',
        kind: row.kind || 'tutorial',
        audience_roles: aud,
        questions: qs,
        passing_score: row.passing_score != null ? Number(row.passing_score) : 70,
        penalty_points: row.penalty_points != null ? Number(row.penalty_points) : 0,
        active: row.active !== false && row.active !== 0,
      };
    },

    _normTrainingAttempt(row) {
      if (!row || typeof row !== 'object') return row;
      let ans = row.answers;
      if (typeof ans === 'string') { try { ans = JSON.parse(ans); } catch { ans = []; } }
      if (!Array.isArray(ans)) ans = [];
      return {
        ...row,
        answers: ans,
        score: row.score != null ? Number(row.score) : null,
        passed: !!row.passed,
      };
    },

    _normTrainingMural(row) {
      if (!row || typeof row !== 'object') return row;
      let aud = row.audience_roles;
      if (typeof aud === 'string') { try { aud = JSON.parse(aud); } catch { aud = ['*']; } }
      if (!Array.isArray(aud) || !aud.length) aud = ['*'];
      return {
        ...row,
        audience_roles: aud,
        pinned: !!row.pinned,
        active: row.active !== false && row.active !== 0,
      };
    },

    _attemptKey(trainingId, userId) {
      return `trnatt_${trainingId}_${userId}`;
    },

    async getTrainings(opts = {}) {
      const { partnerRootId, activeOnly, category } = opts;
      if (this.online) {
        try {
          let q = '?select=*&order=created_at.desc';
          if (partnerRootId) {
            q += `&or=(partner_root_id.is.null,partner_root_id.eq.${encodeURIComponent(partnerRootId)})`;
          }
          if (activeOnly) q += '&active=eq.true';
          if (category) q += `&category=eq.${encodeURIComponent(category)}`;
          const rows = await supaReq('GET', 'trainings', null, q);
          return (rows || []).map(r => this._normTraining(r));
        } catch (e) {
          console.warn('[DB] getTrainings:', e.message);
          return [];
        }
      }
      let all = (this._lget(this.LK.trainings) || []).map(r => this._normTraining(r));
      if (partnerRootId) {
        all = all.filter(r => !r.partner_root_id || String(r.partner_root_id) === String(partnerRootId));
      }
      if (activeOnly) all = all.filter(r => r.active);
      if (category) all = all.filter(r => String(r.category) === String(category));
      return all.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    },

    async getTraining(id) {
      if (!id) return null;
      if (this.online) {
        try {
          const r = await supaReq('GET', 'trainings', null, `?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
          return this._normTraining(r[0]) || null;
        } catch (e) {
          console.warn('[DB] getTraining:', e.message);
          return null;
        }
      }
      const row = (this._lget(this.LK.trainings) || []).find(x => x.id === id);
      return row ? this._normTraining(row) : null;
    },

    async saveTraining(data) {
      const now = new Date().toISOString();
      const id = data.id || this._genId('trn');
      const row = this._normTraining({
        created_at: now,
        updated_at: now,
        ...data,
        id,
      });
      if (this.online) {
        _cacheDel('trainings');
        const exists = await this.getTraining(id);
        if (exists) {
          const r = await supaReq('PATCH', 'trainings', row, `?id=eq.${encodeURIComponent(id)}`);
          return this._normTraining(r[0]) || row;
        }
        await supaReq('POST', 'trainings', row);
        return row;
      }
      const list = this._lget(this.LK.trainings) || [];
      const idx = list.findIndex(x => x.id === id);
      if (idx === -1) list.push(row);
      else list[idx] = { ...list[idx], ...row, updated_at: now };
      this._lset(this.LK.trainings, list);
      return row;
    },

    async deleteTraining(id) {
      if (!id) return;
      if (this.online) {
        _cacheDel('trainings');
        _cacheDel('training_attempts');
        await supaReq('DELETE', 'training_attempts', null, `?training_id=eq.${encodeURIComponent(id)}`);
        await supaReq('DELETE', 'trainings', null, `?id=eq.${encodeURIComponent(id)}`);
        return;
      }
      this._lset(this.LK.trainings, (this._lget(this.LK.trainings) || []).filter(x => x.id !== id));
      this._lset(this.LK.training_attempts, (this._lget(this.LK.training_attempts) || []).filter(x => x.training_id !== id));
    },

    async getTrainingAttempts(opts = {}) {
      const { trainingId, userId, limit = 2000 } = opts;
      if (this.online) {
        try {
          let q = '?select=*&order=completed_at.desc';
          if (limit) q += `&limit=${limit}`;
          if (trainingId) q += `&training_id=eq.${encodeURIComponent(trainingId)}`;
          if (userId) q += `&user_id=eq.${encodeURIComponent(userId)}`;
          const rows = await supaReq('GET', 'training_attempts', null, q);
          return (rows || []).map(r => this._normTrainingAttempt(r));
        } catch (e) {
          console.warn('[DB] getTrainingAttempts:', e.message);
          return [];
        }
      }
      let all = (this._lget(this.LK.training_attempts) || []).map(r => this._normTrainingAttempt(r));
      if (trainingId) all = all.filter(x => x.training_id === trainingId);
      if (userId) all = all.filter(x => x.user_id === userId);
      return all;
    },

    async getTrainingAttempt(trainingId, userId) {
      if (!trainingId || !userId) return null;
      if (this.online) {
        try {
          const r = await supaReq('GET', 'training_attempts', null,
            `?training_id=eq.${encodeURIComponent(trainingId)}&user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`);
          return this._normTrainingAttempt(r[0]) || null;
        } catch (e) {
          console.warn('[DB] getTrainingAttempt:', e.message);
          return null;
        }
      }
      const row = (this._lget(this.LK.training_attempts) || []).find(
        x => x.training_id === trainingId && x.user_id === userId
      );
      return row ? this._normTrainingAttempt(row) : null;
    },

    async saveTrainingAttempt(data) {
      const now = new Date().toISOString();
      const trainingId = data.training_id;
      const userId = data.user_id;
      const id = data.id || this._attemptKey(trainingId, userId);
      const row = this._normTrainingAttempt({
        id,
        created_at: now,
        updated_at: now,
        ...data,
      });
      if (this.online) {
        _cacheDel('training_attempts');
        const exists = await this.getTrainingAttempt(trainingId, userId);
        if (exists) {
          const r = await supaReq('PATCH', 'training_attempts', row,
            `?training_id=eq.${encodeURIComponent(trainingId)}&user_id=eq.${encodeURIComponent(userId)}`);
          return this._normTrainingAttempt(r[0]) || row;
        }
        await supaReq('POST', 'training_attempts', row);
        return row;
      }
      const list = this._lget(this.LK.training_attempts) || [];
      const idx = list.findIndex(x => x.training_id === trainingId && x.user_id === userId);
      if (idx === -1) list.push(row);
      else list[idx] = { ...list[idx], ...row, updated_at: now };
      this._lset(this.LK.training_attempts, list);
      return row;
    },

    async applyTrainingPenalty(userId, trainingId, points, title) {
      const pts = parseInt(points, 10);
      if (!userId || !Number.isFinite(pts) || pts <= 0) return null;
      const reason = `Penalidade — treinamento: ${title || trainingId}`;
      return this.deductBalance(userId, pts, reason, 'sistema_treinamento', {
        kind: 'training_penalty',
        training_id: trainingId,
      });
    },

    async getTrainingMuralPosts(opts = {}) {
      const { partnerRootId, activeOnly } = opts;
      if (this.online) {
        try {
          let q = '?select=*&order=created_at.desc';
          if (partnerRootId) {
            q += `&or=(partner_root_id.is.null,partner_root_id.eq.${encodeURIComponent(partnerRootId)})`;
          }
          if (activeOnly) q += '&active=eq.true';
          const rows = await supaReq('GET', 'training_mural', null, q);
          return (rows || []).map(r => this._normTrainingMural(r));
        } catch (e) {
          console.warn('[DB] getTrainingMuralPosts:', e.message);
          return [];
        }
      }
      let all = (this._lget(this.LK.training_mural) || []).map(r => this._normTrainingMural(r));
      if (partnerRootId) {
        all = all.filter(r => !r.partner_root_id || String(r.partner_root_id) === String(partnerRootId));
      }
      if (activeOnly) all = all.filter(r => r.active);
      return all.sort((a, b) => {
        if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });
    },

    async getTrainingMuralPost(id) {
      if (!id) return null;
      if (this.online) {
        try {
          const r = await supaReq('GET', 'training_mural', null, `?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
          return this._normTrainingMural(r[0]) || null;
        } catch (e) {
          console.warn('[DB] getTrainingMuralPost:', e.message);
          return null;
        }
      }
      const row = (this._lget(this.LK.training_mural) || []).find(x => x.id === id);
      return row ? this._normTrainingMural(row) : null;
    },

    async saveTrainingMuralPost(data) {
      const now = new Date().toISOString();
      const id = data.id || this._genId('mrl');
      const row = this._normTrainingMural({
        created_at: now,
        updated_at: now,
        ...data,
        id,
      });
      if (this.online) {
        _cacheDel('training_mural');
        const exists = await this.getTrainingMuralPost(id);
        if (exists) {
          const r = await supaReq('PATCH', 'training_mural', row, `?id=eq.${encodeURIComponent(id)}`);
          return this._normTrainingMural(r[0]) || row;
        }
        await supaReq('POST', 'training_mural', row);
        return row;
      }
      const list = this._lget(this.LK.training_mural) || [];
      const idx = list.findIndex(x => x.id === id);
      if (idx === -1) list.push(row);
      else list[idx] = { ...list[idx], ...row, updated_at: now };
      this._lset(this.LK.training_mural, list);
      return row;
    },

    async deleteTrainingMuralPost(id) {
      if (!id) return;
      if (this.online) {
        _cacheDel('training_mural');
        await supaReq('DELETE', 'training_mural', null, `?id=eq.${encodeURIComponent(id)}`);
        return;
      }
      this._lset(this.LK.training_mural, (this._lget(this.LK.training_mural) || []).filter(x => x.id !== id));
    },

    /* ══ MARKETPLACE BLU ══ */
    _normMarketplaceService(row) {
      if (!row || typeof row !== 'object') return row;
      return {
        ...row,
        points_price: parseInt(row.points_price, 10) || 0,
        sort_order: parseInt(row.sort_order, 10) || 0,
        active: row.active !== false && row.active !== 0,
        fulfillment: row.fulfillment || (row.api_type ? 'auto' : 'manual'),
      };
    },

    _normMarketplaceOrder(row) {
      if (!row || typeof row !== 'object') return row;
      const parseJson = (v, fb) => {
        if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fb; } }
        return v && typeof v === 'object' ? v : fb;
      };
      return {
        ...row,
        points_cost: parseInt(row.points_cost, 10) || 0,
        request_data: parseJson(row.request_data, {}),
        result_data: parseJson(row.result_data, {}),
      };
    },

    async ensureMarketplaceCatalog() {
      if (this.online) {
        try {
          const rows = await supaReq('GET', 'marketplace_services', null, '?select=id&limit=1');
          if (rows && rows.length) return;
          const seed = this._seedMarketplaceServices();
          for (const s of seed) {
            try { await supaReq('POST', 'marketplace_services', s); } catch (e) {
              console.warn('[DB] seed marketplace service', s.id, e.message || e);
            }
          }
        } catch (e) {
          console.warn('[DB] ensureMarketplaceCatalog:', e.message);
        }
        return;
      }
      const list = this._lget(this.LK.marketplace_services) || [];
      if (!list.length) this._lset(this.LK.marketplace_services, this._seedMarketplaceServices());
    },

    async getMarketplaceServices(opts = {}) {
      const { partnerRootId, activeOnly, category } = opts;
      await this.ensureMarketplaceCatalog();
      if (this.online) {
        try {
          let q = '?select=*&order=sort_order.asc,created_at.asc';
          if (partnerRootId) {
            q += `&or=(partner_root_id.is.null,partner_root_id.eq.${encodeURIComponent(partnerRootId)})`;
          }
          if (activeOnly) q += '&active=eq.true';
          if (category) q += `&category=eq.${encodeURIComponent(category)}`;
          const rows = await supaReq('GET', 'marketplace_services', null, q);
          return (rows || []).map(r => this._normMarketplaceService(r));
        } catch (e) {
          console.warn('[DB] getMarketplaceServices:', e.message);
          return [];
        }
      }
      let all = (this._lget(this.LK.marketplace_services) || []).map(r => this._normMarketplaceService(r));
      if (partnerRootId) {
        all = all.filter(r => !r.partner_root_id || String(r.partner_root_id) === String(partnerRootId));
      }
      if (activeOnly) all = all.filter(r => r.active);
      if (category) all = all.filter(r => String(r.category) === String(category));
      return all.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },

    async getMarketplaceService(id) {
      if (!id) return null;
      if (this.online) {
        try {
          const r = await supaReq('GET', 'marketplace_services', null, `?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
          return this._normMarketplaceService(r[0]) || null;
        } catch (e) {
          console.warn('[DB] getMarketplaceService:', e.message);
          return null;
        }
      }
      const row = (this._lget(this.LK.marketplace_services) || []).find(x => x.id === id);
      return row ? this._normMarketplaceService(row) : null;
    },

    async saveMarketplaceService(data) {
      const now = new Date().toISOString();
      const id = data.id || this._genId('mks');
      const row = this._normMarketplaceService({
        created_at: now,
        updated_at: now,
        ...data,
        id,
      });
      if (this.online) {
        _cacheDel('marketplace_services');
        const exists = await this.getMarketplaceService(id);
        if (exists) {
          const r = await supaReq('PATCH', 'marketplace_services', row, `?id=eq.${encodeURIComponent(id)}`);
          return this._normMarketplaceService(r[0]) || row;
        }
        await supaReq('POST', 'marketplace_services', row);
        return row;
      }
      const list = this._lget(this.LK.marketplace_services) || [];
      const idx = list.findIndex(x => x.id === id);
      if (idx === -1) list.push(row);
      else list[idx] = { ...list[idx], ...row, updated_at: now };
      this._lset(this.LK.marketplace_services, list);
      return row;
    },

    async deleteMarketplaceService(id) {
      if (!id) return;
      if (this.online) {
        _cacheDel('marketplace_services');
        await supaReq('DELETE', 'marketplace_services', null, `?id=eq.${encodeURIComponent(id)}`);
        return;
      }
      this._lset(this.LK.marketplace_services, (this._lget(this.LK.marketplace_services) || []).filter(x => x.id !== id));
    },

    async getMarketplaceOrders(opts = {}) {
      const { userId, partnerRootId, status, limit = 500 } = opts;
      if (this.online) {
        try {
          let q = '?select=*&order=created_at.desc';
          if (limit) q += `&limit=${limit}`;
          if (userId) q += `&user_id=eq.${encodeURIComponent(userId)}`;
          if (partnerRootId) q += `&partner_root_id=eq.${encodeURIComponent(partnerRootId)}`;
          if (status) q += `&status=eq.${encodeURIComponent(status)}`;
          const rows = await supaReq('GET', 'marketplace_orders', null, q);
          return (rows || []).map(r => this._normMarketplaceOrder(r));
        } catch (e) {
          console.warn('[DB] getMarketplaceOrders:', e.message);
          return [];
        }
      }
      let all = (this._lget(this.LK.marketplace_orders) || []).map(r => this._normMarketplaceOrder(r));
      if (userId) all = all.filter(x => x.user_id === userId);
      if (partnerRootId) all = all.filter(x => String(x.partner_root_id || '') === String(partnerRootId));
      if (status) all = all.filter(x => x.status === status);
      return all.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    },

    async getMarketplaceOrder(id) {
      if (!id) return null;
      if (this.online) {
        try {
          const r = await supaReq('GET', 'marketplace_orders', null, `?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
          return this._normMarketplaceOrder(r[0]) || null;
        } catch (e) {
          console.warn('[DB] getMarketplaceOrder:', e.message);
          return null;
        }
      }
      const row = (this._lget(this.LK.marketplace_orders) || []).find(x => x.id === id);
      return row ? this._normMarketplaceOrder(row) : null;
    },

    async placeMarketplaceOrder(userId, serviceId, requestData = {}) {
      const svc = await this.getMarketplaceService(serviceId);
      if (!svc || !svc.active) return { ok: false, msg: 'Serviço indisponível.' };
      const cost = parseInt(svc.points_price, 10) || 0;
      if (cost <= 0) return { ok: false, msg: 'Preço do serviço inválido.' };

      const emp = await this.getUser(userId);
      if (!emp) return { ok: false, msg: 'Usuário não encontrado.' };
      if (String(emp.role || '').toLowerCase() === 'parceiro') {
        return { ok: false, msg: 'Gestor parceiro usa saldo em R$. Marketplace BLU é para colaboradores com pontos.' };
      }
      const prevPts = this._ptsBalance(emp);
      if (prevPts < cost) return { ok: false, msg: 'Pontos insuficientes para este resgate.' };

      const orderCode = 'MBL-' + Date.now().toString(36).toUpperCase();
      const now = new Date().toISOString();
      const order = this._normMarketplaceOrder({
        id: this._genId('mko'),
        order_code: orderCode,
        service_id: svc.id,
        service_name: svc.name,
        user_id: userId,
        user_name: emp.name || '',
        partner_root_id: requestData.partner_root_id || null,
        document: requestData.document || '',
        points_cost: cost,
        status: svc.fulfillment === 'manual' ? 'pendente' : 'processando',
        request_data: requestData,
        result_data: {},
        created_at: now,
        updated_at: now,
      });

      let debited = false;
      try {
        const nb = Math.round((prevPts - cost) * 100) / 100;
        await this.updateUser(userId, { points: nb, balance: nb });
        debited = true;
        await this.addTransaction({
          employee_id: userId,
          type: 'debit',
          amount: cost,
          reason: `Marketplace BLU — ${svc.name} (${orderCode})`,
          by_user: userId,
          meta: { kind: 'marketplace_blu', order_code: orderCode, service_id: svc.id },
        });
        if (this.online) {
          _cacheDel('marketplace_orders');
          await supaReq('POST', 'marketplace_orders', order);
        } else {
          const list = this._lget(this.LK.marketplace_orders) || [];
          list.push(order);
          this._lset(this.LK.marketplace_orders, list);
        }
        return { ok: true, order, service: svc };
      } catch (e) {
        if (debited) {
          try {
            await this.updateUser(userId, { points: prevPts, balance: prevPts });
            await this.addTransaction({
              employee_id: userId,
              type: 'credit',
              amount: cost,
              reason: `Estorno Marketplace — falha ${orderCode}`,
              by_user: 'sistema',
              meta: { kind: 'estorno_marketplace', order_code: orderCode },
            });
          } catch (_) { /* noop */ }
        }
        return { ok: false, msg: e.message || 'Falha ao registrar resgate.' };
      }
    },

    async updateMarketplaceOrder(id, updates) {
      if (!id) return null;
      const patch = { ...updates, updated_at: new Date().toISOString() };
      if (updates.status === 'concluido' && !updates.fulfilled_at) {
        patch.fulfilled_at = new Date().toISOString();
      }
      if (this.online) {
        _cacheDel('marketplace_orders');
        const r = await supaReq('PATCH', 'marketplace_orders', patch, `?id=eq.${encodeURIComponent(id)}`);
        return this._normMarketplaceOrder(r[0]) || null;
      }
      const list = this._lget(this.LK.marketplace_orders) || [];
      const idx = list.findIndex(x => x.id === id);
      if (idx === -1) return null;
      list[idx] = this._normMarketplaceOrder({ ...list[idx], ...patch });
      this._lset(this.LK.marketplace_orders, list);
      return list[idx];
    },

    /* ══ FORNECEDOR FINANCEIRO + CONTA CORRENTE ══ */
    _normFinanceSupplier(row) {
      if (!row || typeof row !== 'object') return row;
      return {
        ...row,
        active: row.active !== false && row.active !== 0,
        amount: undefined,
      };
    },

    _normFinanceExpense(row) {
      if (!row || typeof row !== 'object') return row;
      let pix = row.pix_snapshot;
      let att = row.attachments;
      if (typeof pix === 'string') { try { pix = JSON.parse(pix); } catch { pix = {}; } }
      if (typeof att === 'string') { try { att = JSON.parse(att); } catch { att = []; } }
      if (!Array.isArray(att)) att = [];
      return {
        ...row,
        amount: this._moneyAmt(row.amount),
        pix_snapshot: pix || {},
        attachments: att,
      };
    },

    async getFinanceSuppliers(activeOnly = false) {
      if (this.online) {
        const q = activeOnly
          ? '?active=eq.true&select=*&order=name.asc'
          : '?select=*&order=name.asc';
        const rows = await supaReq('GET', 'finance_suppliers', null, q);
        return (rows || []).map(r => this._normFinanceSupplier(r));
      }
      let all = (this._lget(this.LK.finance_suppliers) || []).map(r => this._normFinanceSupplier(r));
      if (activeOnly) all = all.filter(s => s.active !== false);
      return all.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    },

    async getFinanceSupplier(id) {
      if (!id) return null;
      if (this.online) {
        const r = await supaReq('GET', 'finance_suppliers', null, `?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
        return this._normFinanceSupplier(r[0]) || null;
      }
      const row = (this._lget(this.LK.finance_suppliers) || []).find(x => x.id === id);
      return row ? this._normFinanceSupplier(row) : null;
    },

    async saveFinanceSupplier(data) {
      const now = new Date().toISOString();
      const row = {
        id: data.id || this._genId('fs'),
        name: String(data.name || '').trim(),
        document: String(data.document || '').trim(),
        pix_key: String(data.pix_key || '').trim(),
        pix_type: String(data.pix_type || 'cpf').trim(),
        email: String(data.email || '').trim(),
        phone: String(data.phone || '').trim(),
        category: String(data.category || 'Geral').trim(),
        notes: String(data.notes || '').trim(),
        active: data.active !== false,
        created_by: data.created_by || 'admin',
        created_at: data.created_at || now,
        updated_at: now,
      };
      if (!row.name) return null;
      if (this.online) {
        _cacheDel('finance_suppliers');
        if (data.id) {
          const r = await supaReq('PATCH', 'finance_suppliers', row, `?id=eq.${encodeURIComponent(row.id)}`);
          return this._normFinanceSupplier(r[0]) || row;
        }
        const r = await supaReq('POST', 'finance_suppliers', row);
        return this._normFinanceSupplier(r[0]) || row;
      }
      const list = this._lget(this.LK.finance_suppliers) || [];
      const idx = list.findIndex(x => x.id === row.id);
      if (idx === -1) list.push(row);
      else list[idx] = { ...list[idx], ...row };
      this._lset(this.LK.finance_suppliers, list);
      return this._normFinanceSupplier(row);
    },

    async deleteFinanceSupplier(id) {
      if (!id) return false;
      if (this.online) {
        _cacheDel('finance_suppliers');
        await supaReq('DELETE', 'finance_suppliers', null, `?id=eq.${encodeURIComponent(id)}`);
        return true;
      }
      this._lset(this.LK.finance_suppliers, (this._lget(this.LK.finance_suppliers) || []).filter(x => x.id !== id));
      return true;
    },

    async getFinanceExpenses(status = null) {
      if (this.online) {
        const q = status
          ? `?status=eq.${encodeURIComponent(status)}&select=*&order=created_at.desc`
          : '?select=*&order=created_at.desc';
        const rows = await supaReq('GET', 'finance_expenses', null, q);
        return (rows || []).map(r => this._normFinanceExpense(r));
      }
      let all = (this._lget(this.LK.finance_expenses) || []).map(r => this._normFinanceExpense(r));
      if (status) all = all.filter(x => String(x.status) === String(status));
      return all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },

    async getFinanceExpense(id) {
      if (!id) return null;
      if (this.online) {
        const r = await supaReq('GET', 'finance_expenses', null, `?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
        return this._normFinanceExpense(r[0]) || null;
      }
      const row = (this._lget(this.LK.finance_expenses) || []).find(x => x.id === id);
      return row ? this._normFinanceExpense(row) : null;
    },

    async saveFinanceExpense(data) {
      const now = new Date().toISOString();
      let att = data.attachments;
      if (typeof att === 'string') { try { att = JSON.parse(att); } catch { att = []; } }
      if (!Array.isArray(att)) att = [];
      const row = {
        id: data.id || this._genId('fx'),
        supplier_id: data.supplier_id || null,
        supplier_name: String(data.supplier_name || '').trim(),
        description: String(data.description || '').trim(),
        category: String(data.category || 'Despesa').trim(),
        amount: this._moneyAmt(data.amount),
        status: data.status || 'pendente_master',
        pix_snapshot: data.pix_snapshot || {},
        attachments: att,
        notes: String(data.notes || '').trim(),
        master_approved_by: data.master_approved_by || null,
        master_approved_at: data.master_approved_at || null,
        paid_at: data.paid_at || null,
        paid_by: data.paid_by || null,
        created_by: data.created_by || 'admin',
        created_at: data.created_at || now,
        updated_at: now,
      };
      if (!row.supplier_name || !row.description || !Number.isFinite(row.amount) || row.amount <= 0) return null;
      if (this.online) {
        _cacheDel('finance_expenses');
        if (data.id) {
          const r = await supaReq('PATCH', 'finance_expenses', row, `?id=eq.${encodeURIComponent(row.id)}`);
          return this._normFinanceExpense(r[0]) || row;
        }
        const r = await supaReq('POST', 'finance_expenses', row);
        return this._normFinanceExpense(r[0]) || row;
      }
      const list = this._lget(this.LK.finance_expenses) || [];
      const idx = list.findIndex(x => x.id === row.id);
      if (idx === -1) list.push(row);
      else list[idx] = { ...list[idx], ...row };
      this._lset(this.LK.finance_expenses, list);
      return this._normFinanceExpense(row);
    },

    async updateFinanceExpense(id, updates) {
      if (!id) return null;
      const patch = { ...updates, updated_at: new Date().toISOString() };
      if (this.online) {
        _cacheDel('finance_expenses');
        const r = await supaReq('PATCH', 'finance_expenses', patch, `?id=eq.${encodeURIComponent(id)}`);
        return this._normFinanceExpense(r[0]) || null;
      }
      const list = this._lget(this.LK.finance_expenses) || [];
      const idx = list.findIndex(x => x.id === id);
      if (idx === -1) return null;
      list[idx] = this._normFinanceExpense({ ...list[idx], ...patch });
      this._lset(this.LK.finance_expenses, list);
      return list[idx];
    },

    async getFinancePropostaOps(type = null) {
      let all;
      if (this.online) {
        try {
          let q = '?select=*&order=created_at.desc&limit=500';
          if (type) q += `&type=eq.${encodeURIComponent(type)}`;
          all = await supaReq('GET', 'finance_proposta_ops', null, q);
        } catch {
          all = this._lget(this.LK.finance_proposta_ops) || [];
        }
      } else {
        all = this._lget(this.LK.finance_proposta_ops) || [];
      }
      return type ? (all || []).filter(r => r.type === type) : (all || []);
    },

    async saveFinancePropostaOp(record) {
      const row = {
        id: record.id || this._genId('fpo'),
        ...record,
        updated_at: new Date().toISOString(),
      };
      if (!row.created_at) row.created_at = row.updated_at;
      if (this.online) {
        try {
          _cacheDel('finance_proposta_ops');
          const existing = await supaReq('GET', 'finance_proposta_ops', null, `?id=eq.${encodeURIComponent(row.id)}&select=id&limit=1`);
          if (existing?.length) {
            const r = await supaReq('PATCH', 'finance_proposta_ops', row, `?id=eq.${encodeURIComponent(row.id)}`);
            return r[0] || row;
          }
          const r = await supaReq('POST', 'finance_proposta_ops', row);
          return r[0] || row;
        } catch (e) {
          console.warn('[DB] saveFinancePropostaOp online fallback:', e.message);
        }
      }
      const list = this._lget(this.LK.finance_proposta_ops) || [];
      const idx = list.findIndex(x => x.id === row.id);
      if (idx >= 0) list[idx] = row;
      else list.unshift(row);
      this._lset(this.LK.finance_proposta_ops, list.slice(0, 500));
      return row;
    },

    async buildContaCorrenteStatement(empId, limit = 120) {
      const emp = await this.getUser(empId);
      if (!emp) return { balance: 0, lines: [], user: null, money: false };
      const [txs, wds] = await Promise.all([
        this.getTransactions(empId).catch(() => []),
        typeof this.getWithdrawals === 'function' ? this.getWithdrawals(empId).catch(() => []) : Promise.resolve([]),
      ]);
      const money = this._isPartnerWalletUser(emp);
      const balance = money
        ? this._moneyAmt(emp.points || emp.balance || 0)
        : this._ptsBalance(emp);
      const skipWd = new Set(['cancelado', 'rejeitado', 'estornado']);
      const lines = [];
      for (const t of txs || []) {
        lines.push({
          id: t.id,
          kind: 'transaction',
          type: t.type,
          amount: typeof txAmount === 'function' ? txAmount(t) : Number(t.amount) || 0,
          reason: t.reason || 'Movimentação',
          created_at: t.created_at || t.date,
          meta: t.meta,
          by_user: t.by_user,
        });
      }
      for (const w of wds || []) {
        if (skipWd.has(String(w.status || '').toLowerCase())) continue;
        lines.push({
          id: w.id,
          kind: 'withdrawal',
          type: 'debit',
          amount: this._moneyAmt(w.amount),
          reason: `Saque PIX — ${String(w.status || 'pendente')}`,
          created_at: w.created_at || w.createdAt,
          status: w.status,
        });
      }
      lines.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      return { balance, lines: lines.slice(0, limit), user: emp, money };
    },

    async applyContaCorrenteMovement(empId, kind, amount, reason, byUser, proposalRef = '') {
      const meta = {
        screen: 'conta_corrente_gestao',
        kind: `conta_${kind}`,
        proposal_ref: proposalRef || null,
      };
      const ref = proposalRef ? ` (proposta ${proposalRef})` : '';
      const fullReason = `${String(reason || '').trim() || 'Movimentação conta corrente'}${ref}`;
      if (kind === 'credito_proposta') {
        const bal = await this.addBalance(empId, amount, fullReason, byUser, meta);
        return bal != null ? { ok: true, balance: bal } : { ok: false, msg: 'Não foi possível creditar.' };
      }
      if (kind === 'debito_proposta') {
        const bal = await this.deductBalance(empId, amount, fullReason, byUser, meta);
        return bal != null ? { ok: true, balance: bal } : { ok: false, msg: 'Não foi possível debitar.' };
      }
      if (kind === 'adiantamento') {
        const emp = await this.getUser(empId);
        if (!emp) return { ok: false, msg: 'Usuário não encontrado.' };
        const money = this._isPartnerWalletUser(emp);
        const amt = money ? this._moneyAmt(amount) : (Number(amount) > 0 ? Number(amount) : NaN);
        if (!Number.isFinite(amt) || amt <= 0) return { ok: false, msg: 'Valor inválido.' };
        const current = money
          ? this._moneyAmt(emp.points || emp.balance || 0)
          : this._ptsBalance(emp);
        const nb = Math.round((current - amt) * 100) / 100;
        await this.updateUser(empId, { balance: nb, points: nb });
        _cacheDel('users');
        await this.addTransaction({
          employee_id: empId,
          type: 'debit',
          amount: amt,
          reason: fullReason || 'Adiantamento',
          by_user: byUser || 'admin',
          meta: { ...meta, saldo_anterior: current, saldo_novo: nb, adiantamento: true },
        });
        return { ok: true, balance: nb };
      }
      return { ok: false, msg: 'Tipo de movimentação inválido.' };
    },

    _normFinanceAdiantamento(row) {
      if (!row || typeof row !== 'object') return row;
      let att = row.attachments;
      if (typeof att === 'string') { try { att = JSON.parse(att); } catch { att = {}; } }
      return {
        ...row,
        cpf: String(row.cpf || '').replace(/\D/g, ''),
        valor: this._moneyAmt(row.valor),
        attachments: att && typeof att === 'object' ? att : {},
      };
    },

    _monthKeyFromDate(iso) {
      const d = iso ? new Date(iso) : new Date();
      if (Number.isNaN(d.getTime())) return '';
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    },

    async getFinanceAdiantamentos() {
      if (this.online) {
        try {
          const rows = await supaReq('GET', 'finance_adiantamento', null, '?select=*&order=created_at.desc&limit=500');
          return (rows || []).map(r => this._normFinanceAdiantamento(r));
        } catch (e) {
          console.warn('[DB] getFinanceAdiantamentos:', e?.message || e);
        }
      }
      return (this._lget(this.LK.finance_adiantamento) || [])
        .map(r => this._normFinanceAdiantamento(r))
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    },

    async hasFinanceAdiantamentoThisMonth(cpf, excludeId = null) {
      const digits = String(cpf || '').replace(/\D/g, '');
      if (!digits) return false;
      const monthKey = this._monthKeyFromDate();
      const all = await this.getFinanceAdiantamentos();
      return all.some((r) => {
        if (excludeId && String(r.id) === String(excludeId)) return false;
        if (String(r.cpf || '').replace(/\D/g, '') !== digits) return false;
        const st = String(r.status || '').toLowerCase();
        if (st === 'recusado') return false;
        const mk = r.month_key || this._monthKeyFromDate(r.created_at);
        return mk === monthKey;
      });
    },

    async saveFinanceAdiantamento(data) {
      const now = new Date().toISOString();
      const row = this._normFinanceAdiantamento({
        id: data.id || this._genId('adv'),
        cpf: String(data.cpf || '').replace(/\D/g, ''),
        employee_id: data.employee_id || null,
        employee_name: String(data.employee_name || '').trim(),
        valor: data.valor,
        status: String(data.status || 'pendente').toLowerCase(),
        month_key: data.month_key || this._monthKeyFromDate(),
        notes: String(data.notes || '').trim(),
        decided_by: data.decided_by || null,
        decided_by_name: data.decided_by_name || null,
        decided_at: data.decided_at || null,
        attachments: data.attachments || {},
        created_at: data.created_at || now,
        updated_at: now,
      });
      if (!row.cpf || !Number.isFinite(row.valor) || row.valor <= 0) return null;
      if (this.online) {
        try {
          _cacheDel('finance_adiantamento');
          if (data.id) {
            const r = await supaReq('PATCH', 'finance_adiantamento', row, `?id=eq.${encodeURIComponent(row.id)}`);
            return this._normFinanceAdiantamento(r[0]) || row;
          }
          const r = await supaReq('POST', 'finance_adiantamento', row);
          return this._normFinanceAdiantamento(r[0]) || row;
        } catch (e) {
          console.warn('[DB] saveFinanceAdiantamento online fallback:', e?.message || e);
        }
      }
      const list = this._lget(this.LK.finance_adiantamento) || [];
      const idx = list.findIndex(x => x.id === row.id);
      if (idx === -1) list.push(row);
      else list[idx] = { ...list[idx], ...row };
      this._lset(this.LK.finance_adiantamento, list);
      return row;
    },

    _normFinanceReembolso(row) {
      if (!row || typeof row !== 'object') return row;
      let att = row.attachments;
      if (typeof att === 'string') { try { att = JSON.parse(att); } catch { att = {}; } }
      return {
        ...row,
        cnpj: String(row.cnpj || '').replace(/\D/g, ''),
        valor: this._moneyAmt(row.valor),
        valor_liquido_sem_bebida: row.valor_liquido_sem_bebida != null
          ? this._moneyAmt(row.valor_liquido_sem_bebida)
          : null,
        attachments: att && typeof att === 'object' ? att : {},
      };
    },

    async getFinanceReembolsos() {
      if (this.online) {
        try {
          const rows = await supaReq('GET', 'finance_reembolso', null, '?select=*&order=created_at.desc&limit=500');
          return (rows || []).map(r => this._normFinanceReembolso(r));
        } catch (e) {
          console.warn('[DB] getFinanceReembolsos:', e?.message || e);
        }
      }
      return (this._lget(this.LK.finance_reembolso) || [])
        .map(r => this._normFinanceReembolso(r))
        .sort((a, b) => new Date(b.created_at || b.submitted_at || 0) - new Date(a.created_at || a.submitted_at || 0));
    },

    async saveFinanceReembolso(data) {
      const now = new Date().toISOString();
      const isUpdate = Boolean(data.id);
      const row = this._normFinanceReembolso({
        id: data.id || this._genId('reemb'),
        motivo: String(data.motivo || '').trim(),
        motivo_label: String(data.motivo_label || data.motivo || '').trim(),
        cnpj: String(data.cnpj || '').replace(/\D/g, ''),
        estabelecimento_nome: String(data.estabelecimento_nome || '').trim(),
        valor: data.valor,
        km_inicial: data.km_inicial || null,
        km_final: data.km_final || null,
        bebida_alcoolica: data.bebida_alcoolica || null,
        valor_liquido_sem_bebida: data.valor_liquido_sem_bebida ?? null,
        solicitante_id: data.solicitante_id || null,
        solicitante_nome: String(data.solicitante_nome || '').trim(),
        solicitante_login: data.solicitante_login || null,
        status: String(data.status || 'em_analise').toLowerCase(),
        submitted_at: data.submitted_at || now,
        attachments: data.attachments || {},
        notes: String(data.notes || '').trim(),
        decided_by: data.decided_by || null,
        decided_by_name: data.decided_by_name || null,
        decided_at: data.decided_at || null,
        created_at: data.created_at || now,
        updated_at: now,
      });
      if (!row.motivo || !row.cnpj || !Number.isFinite(row.valor) || row.valor <= 0) return null;
      if (this.online) {
        try {
          _cacheDel('finance_reembolso');
          if (isUpdate) {
            const r = await supaReq('PATCH', 'finance_reembolso', row, `?id=eq.${encodeURIComponent(row.id)}`);
            return this._normFinanceReembolso(r[0]) || row;
          }
          const r = await supaReq('POST', 'finance_reembolso', row);
          return this._normFinanceReembolso(r[0]) || row;
        } catch (e) {
          console.warn('[DB] saveFinanceReembolso online fallback:', e?.message || e);
        }
      }
      const list = this._lget(this.LK.finance_reembolso) || [];
      const idx = list.findIndex(x => x.id === row.id);
      if (idx === -1) list.push(row);
      else list[idx] = { ...list[idx], ...row };
      this._lset(this.LK.finance_reembolso, list);
      return row;
    },

    /* ══ TICKETS ══ */
    async getTickets(empId=null, department=null) {
      if(this.online){
        let q = '?select=*&order=created_at.desc';
        if(empId) q = `?employee_id=eq.${empId}&select=*&order=created_at.desc`;
        else if(department) q = `?department=eq.${department}&select=*&order=created_at.desc`;
        return await supaReq('GET','tickets',null,q);
      }
      const all=this._lget(this.LK.tickets);
      if(empId) return all.filter(t=>t.employee_id===empId).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
      if(department) return all.filter(t=>t.department===department).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
      return all.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    },
    async addTicket(data) {
      const ticket = { id: this._genId('tkt'), ...data, status: 'aberto', created_at: new Date().toISOString() };
      if(this.online){_cacheDel('tickets');await supaReq('POST','tickets',ticket);}
      else{const list=this._lget(this.LK.tickets);list.push(ticket);this._lset(this.LK.tickets,list);}
      return ticket;
    },
    async updateTicket(id, updates) {
      if(this.online){_cacheDel('tickets');const r=await supaReq('PATCH','tickets',updates,`?id=eq.${id}`);return r[0]||null;}
      const list=this._lget(this.LK.tickets),idx=list.findIndex(t=>t.id===id);
      if(idx===-1)return null;list[idx]={...list[idx],...updates};this._lset(this.LK.tickets,list);return list[idx];
    },

    /* ══ MEETINGS (convocações + termo de ciência da ata) ══ */
    _meetingsLS() {
      let list = this._lget(this.LK.meetings);
      if (!Array.isArray(list)) {
        list = [];
        this._lset(this.LK.meetings, list);
      }
      return list;
    },

    _normMeetingRow(row) {
      if (!row || typeof row !== 'object') return row;
      let pids = row.participant_ids;
      if (typeof pids === 'string') {
        try { pids = JSON.parse(pids); } catch { pids = []; }
      }
      if (!Array.isArray(pids)) pids = [];
      let ack = row.acknowledgements;
      if (typeof ack === 'string') {
        try { ack = JSON.parse(ack); } catch { ack = {}; }
      }
      if (!ack || typeof ack !== 'object' || Array.isArray(ack)) ack = {};
      const subject = String(row.subject || row.title || '').trim();
      const pauta = String(row.pauta || row.agenda || '').trim();
      const ata_subject = String(row.ata_subject || row.ataSubject || '').trim();
      const ata_pauta = String(row.ata_pauta || row.ataPauta || '').trim();
      return {
        ...row,
        subject,
        pauta,
        ata_subject,
        ata_pauta,
        participant_ids: pids.map(String),
        acknowledgements: ack,
      };
    },

    async getMeeting(id) {
      if (!id) return null;
      if (this.online) {
        try {
          const r = await supaReq('GET', 'meetings', null, `?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
          return this._normMeetingRow(r[0]) || null;
        } catch (e) {
          console.warn('[DB] getMeeting:', e.message);
          return null;
        }
      }
      const row = this._meetingsLS().find(m => m.id === id);
      return row ? this._normMeetingRow(row) : null;
    },

    /** Agenda criada pelo gestor (supervisor vê só a própria; perfil master-like vê todas). */
    async listMeetingsForAdmin(adminId, scopeMaster) {
      if (this.online) {
        try {
          const q = scopeMaster
            ? '?select=*&order=scheduled_at.desc&limit=400'
            : `?created_by=eq.${encodeURIComponent(adminId)}&select=*&order=scheduled_at.desc&limit=300`;
          const rows = await supaReq('GET', 'meetings', null, q);
          return (rows || []).map(r => this._normMeetingRow(r));
        } catch (e) {
          console.warn('[DB] listMeetingsForAdmin:', e.message);
          return [];
        }
      }
      let all = this._meetingsLS().map(r => this._normMeetingRow(r));
      if (!scopeMaster) all = all.filter(m => m.created_by === adminId);
      return all.sort((a, b) => new Date(b.scheduled_at || 0) - new Date(a.scheduled_at || 0));
    },

    /** Convocações em que o usuário é participante. */
    async listMeetingsForParticipant(userId) {
      const uid = String(userId || '');
      if (!uid) return [];
      if (this.online) {
        try {
          const rows = await supaReq('GET', 'meetings', null, '?select=*&order=scheduled_at.desc&limit=400');
          return (rows || [])
            .map(r => this._normMeetingRow(r))
            .filter(m => (m.participant_ids || []).map(String).includes(uid));
        } catch (e) {
          console.warn('[DB] listMeetingsForParticipant:', e.message);
          return [];
        }
      }
      return this._meetingsLS()
        .map(r => this._normMeetingRow(r))
        .filter(m => (m.participant_ids || []).map(String).includes(uid))
        .sort((a, b) => new Date(b.scheduled_at || 0) - new Date(a.scheduled_at || 0));
    },

    /** Pendentes de ciência para badge / alerta. */
    async countPendingMeetingInvites(userId) {
      const uid = String(userId || '');
      if (!uid) return 0;
      const list = await this.listMeetingsForParticipant(uid);
      return list.filter(m => !(m.acknowledgements || {})[uid]).length;
    },

    /** Colunas reais da tabela meetings (Supabase / MySQL) — evita title/description legados. */
    _meetingPayloadForApi(row) {
      const keys = [
        'id', 'subject', 'pauta', 'ata_subject', 'ata_pauta',
        'scheduled_at', 'created_by', 'participant_ids', 'acknowledgements', 'created_at',
      ];
      const out = {};
      keys.forEach((k) => {
        if (row[k] !== undefined) out[k] = row[k];
      });
      return out;
    },

    async createMeeting({ subject, pauta, scheduled_at, participant_ids, created_by }) {
      const pids = Array.isArray(participant_ids)
        ? [...new Set(participant_ids.map(String).filter(Boolean))]
        : [];
      const subj = String(subject || '').trim();
      const pautaTxt = String(pauta || '').trim();
      const ataPautaInicial = [
        'PAUTA DA CONVOCAÇÃO:',
        pautaTxt,
        '',
        '---',
        'REGISTRO / DELIBERAÇÕES DA REUNIÃO:',
        '(Complementar após o encontro, se necessário.)',
      ].join('\n');
      const row = {
        id: this._genId('mtg'),
        subject: subj,
        pauta: pautaTxt,
        ata_subject: subj,
        ata_pauta: ataPautaInicial,
        scheduled_at: scheduled_at ? new Date(scheduled_at).toISOString() : new Date().toISOString(),
        created_by: String(created_by || ''),
        participant_ids: pids,
        acknowledgements: {},
        created_at: new Date().toISOString(),
      };
      if (!row.subject) throw new Error('Informe o assunto da reunião.');
      if (!pautaTxt) throw new Error('Informe a pauta da reunião.');
      if (!pids.length) throw new Error('Selecione pelo menos um participante.');
      if (this.online) {
        _cacheDel('meetings');
        await supaReq('POST', 'meetings', this._meetingPayloadForApi(row));
        return this._normMeetingRow(row);
      }
      const list = this._meetingsLS();
      list.push(row);
      this._lset(this.LK.meetings, list);
      return row;
    },

    async acknowledgeMeeting(meetingId, userId) {
      const uid = String(userId || '');
      const mtg = await this.getMeeting(meetingId);
      if (!mtg) return null;
      const prev = mtg.acknowledgements && typeof mtg.acknowledgements === 'object' ? mtg.acknowledgements : {};
      const acknowledgements = { ...prev, [uid]: new Date().toISOString() };
      if (this.online) {
        _cacheDel('meetings');
        const r = await supaReq('PATCH', 'meetings', { acknowledgements }, `?id=eq.${encodeURIComponent(meetingId)}`);
        return this._normMeetingRow(r[0]) || null;
      }
      const list = this._meetingsLS();
      const idx = list.findIndex(m => m.id === meetingId);
      if (idx === -1) return null;
      list[idx] = { ...list[idx], acknowledgements };
      this._lset(this.LK.meetings, list);
      return this._normMeetingRow(list[idx]);
    },

    async updateMeetingAta(meetingId, { ata_subject, ata_pauta }) {
      const subj = String(ata_subject || '').trim();
      const pauta = String(ata_pauta || '').trim();
      if (!subj) throw new Error('Informe o assunto da ata.');
      if (!pauta) throw new Error('Informe a pauta da ata.');
      const patch = { ata_subject: subj, ata_pauta: pauta };
      if (this.online) {
        _cacheDel('meetings');
        const r = await supaReq(
          'PATCH',
          'meetings',
          this._meetingPayloadForApi(patch),
          `?id=eq.${encodeURIComponent(meetingId)}`
        );
        return this._normMeetingRow(r[0]) || null;
      }
      const list = this._meetingsLS();
      const idx = list.findIndex(m => m.id === meetingId);
      if (idx === -1) return null;
      list[idx] = { ...list[idx], ...patch };
      this._lset(this.LK.meetings, list);
      return this._normMeetingRow(list[idx]);
    },
  
    /* ══ GENERIC METHODS FOR NEW COLLECTIONS (CLIENTS, PROPOSALS) ══ */
    async list(collection) {
      if (this.online) {
        if (collection === 'proposals') {
          try {
            return await supaReq('GET', 'proposals', null, this._proposalsListQuery());
          } catch (e) {
            console.warn('[DB] list(proposals) leve falhou, tentando id only:', e.message);
            const ids = await supaReq('GET', 'proposals', null, '?select=id&order=created_at.desc&limit=500');
            return ids || [];
          }
        }
        return await supaReq('GET', collection, null, '?select=*&order=created_at.desc&limit=500');
      }
      return this._lget(`soublu_${collection}`);
    },
  
    async get(collection, id) {
      if (!id) return null;
      if (this.online) {
        const r = await supaReq('GET', collection, null, `?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
        if (r[0]) return r[0];
        if (collection === 'clients') {
          return this.findClientByCpf(id);
        }
        return null;
      }
      const data = this._lget(`soublu_${collection}`) || [];
      let hit = data.find(i => String(i.id) === String(id));
      if (!hit && collection === 'clients') {
        const digits = String(id).replace(/\D/g, '');
        hit = data.find((c) => {
          const cid = String(c.id || '').replace(/\D/g, '');
          const cp = String(c.cpf || '').replace(/\D/g, '');
          return cid === digits || cp === digits;
        });
      }
      return hit || null;
    },
  
    async save(collection, data) {
      if (!data || data.id === undefined || data.id === null || data.id === '') {
        throw new Error(`ID obrigatório para salvar em ${collection}.`);
      }
      if (this.online) {
        _cacheDel(collection);
        let existing = await this.get(collection, data.id);

        if (collection === 'clients') {
          const cpf = String(data.cpf || data.id || '').replace(/\D/g, '');
          if (!existing && cpf) existing = await this.findClientByCpf(cpf);
          const row = this._sanitizeClientForApi(
            this._normalizeClientForDb(data, { isNew: !existing })
          );
          const targetId = existing?.id || row.id;
          if (existing) {
            const r = await supaReq('PATCH', 'clients', row, `?id=eq.${encodeURIComponent(targetId)}`);
            return r[0] || row;
          }
          const r = await supaReq('POST', 'clients', row);
          return r[0] || row;
        }

        if (collection === 'proposals') {
          let merged = data;
          if (existing) {
            merged = await this._hydrateProposalForSave({ ...existing, ...data, id: data.id });
          }
          let row = this._sanitizeProposalForApi(
            this._normalizeProposalForDb(merged, { isNew: !existing })
          );
          if (this.online) row = this._compactProposalPayloadForApi(row);
          if (existing) {
            const r = await supaReq('PATCH', 'proposals', row, `?id=eq.${encodeURIComponent(data.id)}`);
            return r[0] || row;
          }
          const r = await supaReq('POST', 'proposals', row);
          return r[0] || row;
        }

        const row = { ...data };
        if (existing) {
          const r = await supaReq('PATCH', collection, row, `?id=eq.${encodeURIComponent(data.id)}`);
          return r[0] || data;
        }
        const r = await supaReq('POST', collection, row);
        return r[0] || data;
      }

      const key = this.LK[collection] || `soublu_${collection}`;
      const list = this._lget(key) || [];
      let idx = list.findIndex(i => String(i.id) === String(data.id));
      let normalized = { ...data };
      if (collection === 'clients') {
        normalized = this._sanitizeClientForApi(
          this._normalizeClientForDb(data, { isNew: idx < 0 })
        );
      } else if (collection === 'proposals') {
        let merged = data;
        if (idx > -1) {
          merged = await this._hydrateProposalForSave({ ...list[idx], ...data, id: data.id });
        }
        normalized = this._sanitizeProposalForApi(
          this._normalizeProposalForDb(merged, { isNew: idx < 0 })
        );
      }
      if (idx > -1) {
        list[idx] = { ...list[idx], ...normalized };
      } else {
        list.push(normalized);
      }
      this._lset(key, list);
      return normalized;
    },

    async delete(collection, id) {
      if (!id) return false;
      if (this.online) {
        _cacheDel(collection);
        await supaReq('DELETE', collection, null, `?id=eq.${encodeURIComponent(id)}`);
        return true;
      }
      const key = this.LK[collection] || `soublu_${collection}`;
      const list = this._lget(key).filter(i => i.id !== id);
      this._lset(key, list);
      return true;
    },
  
    /* ══ ROLETA PREMIADA ══ */
    _isLocalDevHost() {
      if (typeof window === 'undefined') return false;
      const h = String(window.location?.hostname || '').toLowerCase();
      return h === 'localhost' || h === '127.0.0.1' || h === '' || window.location?.protocol === 'file:';
    },

    _rouletteSessionUserId() {
      try {
        const s = typeof Auth !== 'undefined' && Auth.getSession ? Auth.getSession() : null;
        return s?.id ? String(s.id) : null;
      } catch (_) {
        return null;
      }
    },

    _assertRoulettePrivilegedAction(opts = {}) {
      const by = String(opts.by_user || opts.actor_id || '');
      if (/^sistema/i.test(by) || by.startsWith('sistema_')) return true;
      if (typeof Auth !== 'undefined' && Auth.isMaster && Auth.isMaster()) return true;
      const role = String(typeof Auth !== 'undefined' && Auth.getSession ? Auth.getSession()?.role : '').toLowerCase();
      if (role === 'fundador') return true;
      return false;
    },

    _assertRouletteSpinActor(userId) {
      const uid = String(userId || '');
      if (!uid) return { ok: false, msg: 'Usuário inválido.' };
      const sessionId = this._rouletteSessionUserId();
      if (!sessionId || sessionId !== uid) {
        return { ok: false, msg: 'Só é possível girar a roleta com a sua sessão ativa.' };
      }
      return { ok: true };
    },

    _rouletteSpinGate: null,

    _checkRouletteSpinRate(userId) {
      const now = Date.now();
      const minMs = 3500;
      if (!this._rouletteSpinGate) this._rouletteSpinGate = Object.create(null);
      const last = this._rouletteSpinGate[userId] || 0;
      if (now - last < minMs) {
        return { ok: false, msg: 'Aguarde alguns segundos antes de girar novamente.' };
      }
      this._rouletteSpinGate[userId] = now;
      return { ok: true };
    },

    _validRouletteRewardPoints(pts) {
      const allowed = (this._rouletteConfig().slots || [])
        .map((s) => Math.round(Number(s.points || 0)))
        .filter((n) => n > 0);
      return allowed.includes(Math.round(Number(pts || 0)));
    },

    _rouletteConfig() {
      return {
        slots: [
          {
            id: 'pt1',
            points: 1,
            weight: 960,
            probability: '96%',
            label: '1 ponto',
          },
          {
            id: 'pt5',
            points: 5,
            weight: 20,
            probability: '2%',
            label: '5 pontos',
          },
          {
            id: 'pt20',
            points: 20,
            weight: 15,
            probability: '1,5%',
            label: '20 pontos',
          },
          {
            id: 'pt40',
            points: 40,
            weight: 5,
            probability: '0,5%',
            label: '40 pontos',
          },
        ],
      };
    },

    /** 4 fatias visuais iguais; probabilidade real só no sorteio (weight). */
    rouletteWheelSegments() {
      const slots = this._rouletteConfig().slots || [];
      const n = slots.length || 1;
      const equalArc = 360 / n;
      const blues = [
        '#0a2d52',
        '#1c5f9a',
        '#256eb0',
        '#ffd60a',
      ];
      return slots.map((s, index) => ({
        index,
        id: s.id,
        points: Math.max(0, Math.round(Number(s.points || 0))),
        label: s.label,
        wheelLabel: s.label,
        joke: !!s.joke,
        probability: s.probability || '',
        weight: Math.max(0, Number(s.weight || 0)),
        color: s.color || blues[index % blues.length],
        textFill: s.id === 'pt40' ? '#0a2d52' : '#ffffff',
        startDeg: index * equalArc,
        arcDeg: equalArc,
        midDeg: index * equalArc + equalArc / 2,
      }));
    },

    rouletteSegmentIndexForDraw(draw) {
      const segs = this.rouletteWheelSegments();
      if (!draw) return 0;
      if (draw.id) {
        const byId = segs.findIndex((s) => s.id === draw.id);
        if (byId >= 0) return byId;
      }
      const byPts = segs.findIndex((s) => !s.joke && s.points === draw.points);
      return byPts >= 0 ? byPts : 0;
    },

    rouletteRotationForSegment(segmentIndex, baseRotation = 0) {
      const segs = this.rouletteWheelSegments();
      const seg = segs[segmentIndex] || segs[0];
      if (!seg) return baseRotation;
      const n = segs.length || 1;
      const step = 360 / n;
      const midDeg = seg.midDeg != null ? seg.midDeg : (segmentIndex * step + step / 2);
      const extraTurns = 5 + Math.floor(Math.random() * 4);
      const jitter = (Math.random() - 0.5) * Math.min(step * 0.35, 8);
      const POINTER_DEG = 90;
      const currentNorm = ((baseRotation % 360) + 360) % 360;
      let delta = POINTER_DEG - midDeg - currentNorm + jitter;
      delta = ((delta % 360) + 360) % 360;
      if (delta < 200) delta += 360;
      delta += extraTurns * 360;
      return baseRotation + delta;
    },

    _rouletteCriteriaMeta() {
      return {
        leads_todos_dias: {
          label: 'Trabalhar leads todos os dias',
          description: 'Bater a cota diária de leads (todos os leads do dia trabalhados).',
          period: 'day',
          periodLabel: '1 moeda · 1x por dia',
        },
        treinamento_concluido: {
          label: 'Efetuar treinamentos',
          description: 'Ser aprovado em um treinamento (cada treinamento conta).',
          period: 'training',
          periodLabel: '1 moeda por treinamento',
        },
        elogio_master: {
          label: 'Elogio Master',
          description: 'Receber elogio registrado pela Master ou gestão no sistema.',
          period: 'event',
          periodLabel: '2 moedas',
        },
        proposta_paga: {
          label: 'Proposta paga',
          description: 'Proposta marcada como PAGA (vendedor: 3 moedas; Super Backoffice: 1 moeda ao registrar o pagamento).',
          period: 'proposal',
          periodLabel: '1x por proposta',
        },
        proposta_paga_equipe: {
          label: 'Proposta paga por vendedor',
          description: 'Cada proposta PAGA de um vendedor da sua equipe (independente de quem registrou).',
          period: 'proposal',
          periodLabel: '1 moeda · 1x por proposta',
        },
        equipe_meta_leads_dia: {
          label: 'Equipe concluiu a lista de leads',
          description: 'Todos os vendedores da sua equipe bateram a cota diária de leads no dia.',
          period: 'day',
          periodLabel: '2 moedas · 1x por dia',
        },
        chamado_resolvido: {
          label: 'Chamado resolvido',
          description: 'Encerrar chamado interno com status resolvido no prazo.',
          period: 'ticket',
          periodLabel: '1x por chamado',
        },
        meta_mensal_vendas: {
          label: 'Meta mensal de vendas',
          description: 'Atingir a meta de faturamento do departamento Comercial no mês.',
          period: 'month',
          periodLabel: '1x por mês',
        },
      };
    },

    _isVendedorRouletteUser(user) {
      const role = String(user?.role || '').trim().toLowerCase();
      return role === 'vendedor' || role === 'employee';
    },

    _vendedorRouletteRuleKeys() {
      return ['leads_todos_dias', 'treinamento_concluido', 'elogio_master', 'proposta_paga'];
    },

    _isGestaoDemaisUser(user) {
      const role = String(user?.role || '').trim().toLowerCase();
      if (['desenvolvedor', 'gerente', 'gerencia', 'diretoria', 'fundador', 'master', 'admin'].includes(role)) {
        return true;
      }
      const d = String(user?.department || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return /desenvolv|ti\b|tecnologia/.test(d) || /geren|gestao/.test(d) || /diret/.test(d);
    },

    _gestaoDemaisRuleKeys() {
      return ['treinamento_concluido', 'elogio_master'];
    },

    async _vendedorHasRouletteSupervisor(user) {
      if (!this._isVendedorRouletteUser(user)) return true;
      if (!user?.admin_id) return false;
      const sup = await this.getUser(user.admin_id).catch(() => null);
      return !!(sup && this._isSupervisorVendasUser(sup));
    },

    async canAccessRoulette(userOrId) {
      const cfg = typeof window !== 'undefined' ? (window.SOUBLU_CONFIG || {}) : {};
      if (cfg.ROULETTE_ENABLED === false) return false;
      const user = userOrId && typeof userOrId === 'object'
        ? userOrId
        : await this.getUser(userOrId).catch(() => null);
      if (!user?.id) return false;
      if (String(user.role || '').trim().toLowerCase() === 'parceiro') return false;
      if (typeof isUserInPartnerNetworkSync === 'function' && isUserInPartnerNetworkSync(user)) {
        return false;
      }
      if (this._isVendedorRouletteUser(user)) {
        return this._vendedorHasRouletteSupervisor(user);
      }
      const pack = this.getRouletteRulesForUser(user);
      return (pack.rules || []).length > 0;
    },

    _isRhFinanceiroUser(user) {
      const role = String(user?.role || '').trim().toLowerCase();
      if (['rh', 'financeiro', 'financial'].includes(role)) return true;
      const d = String(user?.department || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return /financ/.test(d) || d === 'rh' || /recursos humanos/.test(d);
    },

    _rhFinanceiroRuleKeys() {
      return ['treinamento_concluido', 'elogio_master'];
    },

    _isSupBackofficeUser(user) {
      return String(user?.role || '').trim().toLowerCase() === 'sup_backoffice';
    },

    _supBackofficeRuleKeys() {
      return ['treinamento_concluido', 'proposta_paga', 'elogio_master'];
    },

    _isSupervisorVendasUser(user) {
      return String(user?.role || '').trim().toLowerCase() === 'supervisor';
    },

    _supervisorVendasRuleKeys() {
      return ['equipe_meta_leads_dia', 'treinamento_concluido', 'elogio_master', 'proposta_paga_equipe'];
    },

    async _supervisorIdForVendor(vendorId) {
      if (!vendorId) return null;
      const vendor = await this.getUser(vendorId).catch(() => null);
      const adminId = vendor?.admin_id;
      if (!adminId) return null;
      const sup = await this.getUser(adminId).catch(() => null);
      if (sup && this._isSupervisorVendasUser(sup)) return sup.id;
      return null;
    },

    _rouletteDepartmentKey(user) {
      if (this._isVendedorRouletteUser(user)) return 'vendas';
      if (this._isSupervisorVendasUser(user)) return 'supervisor_vendas';
      if (this._isSupBackofficeUser(user)) return 'sup_backoffice';
      if (this._isRhFinanceiroUser(user)) return 'rh_financeiro';
      if (this._isGestaoDemaisUser(user)) return 'gestao_demais';
      const d = String(user?.department || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (/venda|comercial/.test(d)) return 'vendas';
      if (/operac/.test(d)) return 'operacional';
      if (/financ/.test(d)) return 'rh_financeiro';
      if (d === 'rh' || /recursos humanos/.test(d)) return 'rh_financeiro';
      if (/desenvolv|ti\b|tecnologia/.test(d)) return 'desenvolvimento';
      if (/jurid/.test(d)) return 'juridico';
      if (/diret/.test(d)) return 'diretoria';
      if (/geren|administracao|admin/.test(d)) return 'gestao';
      if (/ouvid/.test(d)) return 'ouvidoria';
      if (/parceiro/.test(d)) return 'parceiro';
      return 'geral';
    },

    _rouletteDepartmentLabels() {
      return {
        vendas: 'Comercial / Vendas',
        operacional: 'Operacional',
        financeiro: 'RH / Financeiro',
        rh: 'RH / Financeiro',
        rh_financeiro: 'RH / Financeiro',
        sup_backoffice: 'Super Backoffice',
        supervisor_vendas: 'Supervisor de Vendas',
        gestao_demais: 'Gestão / Desenvolvimento',
        desenvolvimento: 'Desenvolvimento / TI',
        juridico: 'Jurídico',
        diretoria: 'Diretoria',
        gestao: 'Gestão / Administração',
        ouvidoria: 'Ouvidoria',
        parceiro: 'Parceiros',
        geral: 'Geral',
      };
    },

    _rouletteCriteriaConfig() {
      return {
        intro: 'Ganhe moedas cumprindo as metas do seu departamento. Cada moeda = 1 giro na roleta. Os pontos sorteados entram no seu saldo.',
        departments: {
          vendas: {
            leads_todos_dias: 1,
            treinamento_concluido: 1,
            elogio_master: 2,
            proposta_paga: 3,
          },
          operacional: {
            proposta_paga: 1,
            treinamento_concluido: 1,
            elogio_master: 2,
            chamado_resolvido: 1,
          },
          rh_financeiro: {
            treinamento_concluido: 2,
            elogio_master: 2,
          },
          sup_backoffice: {
            treinamento_concluido: 1,
            proposta_paga: 1,
            elogio_master: 2,
          },
          supervisor_vendas: {
            equipe_meta_leads_dia: 2,
            treinamento_concluido: 1,
            elogio_master: 2,
            proposta_paga_equipe: 1,
          },
          gestao_demais: {
            treinamento_concluido: 3,
            elogio_master: 3,
          },
          desenvolvimento: {
            treinamento_concluido: 3,
            elogio_master: 3,
          },
          juridico: {
            treinamento_concluido: 1,
            elogio_master: 1,
            chamado_resolvido: 1,
          },
          diretoria: {
            treinamento_concluido: 3,
            elogio_master: 3,
          },
          gestao: {
            treinamento_concluido: 3,
            elogio_master: 3,
          },
          ouvidoria: {
            treinamento_concluido: 1,
            chamado_resolvido: 2,
          },
          parceiro: {
            proposta_paga: 2,
            treinamento_concluido: 1,
          },
          geral: {
            treinamento_concluido: 1,
            elogio_master: 1,
          },
        },
        roles: {
          vendedor: {
            leads_todos_dias: 1,
            treinamento_concluido: 1,
            elogio_master: 2,
            proposta_paga: 3,
          },
          employee: {
            leads_todos_dias: 1,
            treinamento_concluido: 1,
            elogio_master: 2,
            proposta_paga: 3,
          },
          supervisor: {
            equipe_meta_leads_dia: 2,
            treinamento_concluido: 1,
            proposta_paga_equipe: 1,
            elogio_master: 2,
          },
          sup_backoffice: {
            treinamento_concluido: 1,
            proposta_paga: 1,
            elogio_master: 2,
          },
          backoffice: {
            proposta_paga: 1,
            chamado_resolvido: 1,
          },
          operacional: {
            chamado_resolvido: 1,
          },
          financeiro: {
            treinamento_concluido: 2,
            elogio_master: 2,
          },
          rh: {
            treinamento_concluido: 2,
            elogio_master: 2,
          },
          financial: {
            treinamento_concluido: 2,
            elogio_master: 2,
          },
          desenvolvedor: {
            treinamento_concluido: 3,
            elogio_master: 3,
          },
          gerente: {
            treinamento_concluido: 3,
            elogio_master: 3,
          },
          gerencia: {
            treinamento_concluido: 3,
            elogio_master: 3,
          },
          diretoria: {
            treinamento_concluido: 3,
            elogio_master: 3,
          },
          fundador: {
            treinamento_concluido: 3,
            elogio_master: 3,
          },
          master: {
            treinamento_concluido: 3,
            elogio_master: 3,
          },
          admin: {
            treinamento_concluido: 3,
            elogio_master: 3,
          },
        },
        '*': {
          treinamento_concluido: 1,
          elogio_master: 1,
        },
      };
    },

    _rouletteRoleKey(user) {
      const role = String(user?.role || '').trim().toLowerCase();
      if (role === 'employee') return 'employee';
      if (role === 'vendedor') return 'vendedor';
      if (role === 'operacional') return 'operacional';
      if (role === 'sup_backoffice') return 'sup_backoffice';
      if (role === 'supervisor') return 'supervisor';
      if (role === 'financeiro' || role === 'financial') return 'financeiro';
      if (role === 'rh') return 'rh';
      if (role === 'desenvolvedor') return 'desenvolvedor';
      if (role === 'gerente') return 'gerente';
      if (role === 'gerencia') return 'gerencia';
      if (role === 'backoffice') return 'backoffice';
      return role;
    },

    _criteriaCoinsFromMap(map, key) {
      if (!map || map[key] == null) return null;
      const raw = map[key];
      const val = typeof raw === 'object' ? raw.coins : raw;
      const n = Number(val || 0);
      return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
    },

    rouletteCoinsForCriteria(user, criteriaKey) {
      if (this._isVendedorRouletteUser(user) && !user?.admin_id) return 0;
      const cfg = this._rouletteCriteriaConfig();
      const key = String(criteriaKey || '').trim();
      const deptKey = this._rouletteDepartmentKey(user);
      const roleKey = this._rouletteRoleKey(user);
      const deptCfg = cfg.departments?.[deptKey] || {};
      const roleCfg = cfg.roles?.[roleKey] || cfg[roleKey] || {};
      const fallbackCfg = cfg['*'] || {};
      const fromDept = this._criteriaCoinsFromMap(deptCfg, key);
      if (fromDept != null && fromDept > 0) return fromDept;
      const fromRole = this._criteriaCoinsFromMap(roleCfg, key);
      if (fromRole != null && fromRole > 0) return fromRole;
      const fromFallback = this._criteriaCoinsFromMap(fallbackCfg, key);
      return fromFallback != null ? fromFallback : 0;
    },

    getRouletteRulesForUser(user) {
      if (!user) return { departmentKey: 'geral', departmentLabel: 'Geral', intro: '', rules: [] };
      const cfg = this._rouletteCriteriaConfig();
      const meta = this._rouletteCriteriaMeta();
      const deptKey = this._rouletteDepartmentKey(user);
      const deptLabels = this._rouletteDepartmentLabels();

      const buildRules = (keys) => [...keys]
        .map((key) => {
          const coins = this.rouletteCoinsForCriteria(user, key);
          const m = meta[key] || {};
          return {
            key,
            coins,
            label: m.label || key.replace(/_/g, ' '),
            description: m.description || '',
            periodLabel: m.periodLabel || '',
            period: m.period || 'event',
          };
        })
        .filter((r) => r.coins > 0)
        .sort((a, b) => b.coins - a.coins);

      if (this._isVendedorRouletteUser(user)) {
        if (!user.admin_id) {
          return {
            departmentKey: 'vendas',
            departmentLabel: 'Comercial / Vendas',
            roleKey: this._rouletteRoleKey(user),
            intro: 'A roleta premiada não está disponível para o seu perfil. Vendedores precisam estar vinculados a um supervisor de vendas.',
            rules: [],
            rouletteBlocked: true,
          };
        }
        return {
          departmentKey: 'vendas',
          departmentLabel: 'Roleta Premiada — Vendedor',
          roleKey: this._rouletteRoleKey(user),
          intro: 'Regras do vendedor: bata a cota de leads do dia, conclua treinamentos, receba elogio Master ou feche proposta paga para ganhar moedas e girar a roleta.',
          rules: buildRules(this._vendedorRouletteRuleKeys()),
        };
      }

      if (this._isGestaoDemaisUser(user)) {
        return {
          departmentKey: 'gestao_demais',
          departmentLabel: 'Gestão / Desenvolvimento',
          roleKey: this._rouletteRoleKey(user),
          intro: 'Regras do seu perfil: 3 moedas por treinamento concluído e 3 moedas por elogio Master.',
          rules: buildRules(this._gestaoDemaisRuleKeys()),
        };
      }

      if (this._isRhFinanceiroUser(user)) {
        return {
          departmentKey: 'rh_financeiro',
          departmentLabel: 'RH / Financeiro',
          roleKey: this._rouletteRoleKey(user),
          intro: 'Regras RH / Financeiro: efetue treinamentos e receba elogio Master para ganhar moedas e participar da roleta premiada.',
          rules: buildRules(this._rhFinanceiroRuleKeys()),
        };
      }

      if (this._isSupBackofficeUser(user)) {
        return {
          departmentKey: 'sup_backoffice',
          departmentLabel: 'Super Backoffice',
          roleKey: 'sup_backoffice',
          intro: 'Regras Super Backoffice: 1 moeda por treinamento, 1 moeda em cada proposta paga (qualquer vendedor) e 2 moedas por elogio Master.',
          rules: buildRules(this._supBackofficeRuleKeys()),
        };
      }

      if (this._isSupervisorVendasUser(user)) {
        return {
          departmentKey: 'supervisor_vendas',
          departmentLabel: 'Supervisor de Vendas',
          roleKey: 'supervisor',
          intro: 'Regras do supervisor: equipe com lista de leads completa no dia, treinamentos, elogio Master e proposta paga de cada vendedor.',
          rules: buildRules(this._supervisorVendasRuleKeys()),
        };
      }

      const keys = new Set([
        ...Object.keys(cfg['*'] || {}),
        ...Object.keys(cfg.departments?.[deptKey] || {}),
        ...Object.keys(cfg.roles?.[this._rouletteRoleKey(user)] || {}),
      ]);
      return {
        departmentKey: deptKey,
        departmentLabel: deptLabels[deptKey] || user.department || 'Geral',
        roleKey: this._rouletteRoleKey(user),
        intro: cfg.intro || '',
        rules: buildRules(keys),
      };
    },

    async _rouletteCriteriaAlreadyAwarded(userId, criteriaKey, period, context = {}) {
      const txs = await this.getTransactions(userId).catch(() => []);
      const key = String(criteriaKey || '').trim();
      const today = new Date().toISOString().slice(0, 10);
      const month = today.slice(0, 7);
      return (txs || []).some((t) => {
        const meta = this._parseTxMeta(t);
        if (meta?.kind !== 'roleta_moeda_credit') return false;
        if (String(meta.criteria_key || '') !== key) return false;
        const ctx = meta.context || {};
        const created = String(t.created_at || t.date || '').slice(0, 10);
        const createdMonth = created.slice(0, 7);
        if (period === 'day') return created === today;
        if (period === 'month') return createdMonth === month;
        if (period === 'training' && context.training_id) {
          return String(ctx.training_id || '') === String(context.training_id);
        }
        if (period === 'proposal' && context.proposal_id) {
          return String(ctx.proposal_id || '') === String(context.proposal_id);
        }
        if (period === 'ticket' && context.ticket_id) {
          return String(ctx.ticket_id || '') === String(context.ticket_id);
        }
        if (period === 'event' && context.event_id) {
          return String(ctx.event_id || '') === String(context.event_id);
        }
        return false;
      });
    },

    async applyRouletteCriteriaReward(userId, criteriaKey, context = {}) {
      if (!userId || !criteriaKey) return { ok: false, msg: 'Critério inválido.' };
      const user = await this.getUser(userId);
      if (!user) return { ok: false, msg: 'Usuário não encontrado.' };
      if (!(await this.canAccessRoulette(user))) {
        return { ok: false, msg: 'Roleta não disponível para o seu perfil.' };
      }
      const key = String(criteriaKey).trim();
      const coins = this.rouletteCoinsForCriteria(user, key);
      if (!coins) {
        return { ok: false, msg: 'Critério sem recompensa configurada para seu departamento.' };
      }
      const meta = this._rouletteCriteriaMeta()[key] || {};
      const period = meta.period || 'event';
      if (await this._rouletteCriteriaAlreadyAwarded(userId, key, period, context)) {
        return { ok: false, msg: 'Moeda já concedida para este critério no período.' };
      }
      const label = meta.label || key.replace(/_/g, ' ');
      const reasonLabel = `Moedas roleta — ${label}`;
      await this.grantRouletteCoins(userId, coins, {
        reason: reasonLabel,
        by_user: context?.by_user || 'sistema',
        criteria_key: key,
        department_key: this._rouletteDepartmentKey(user),
        role_key: this._rouletteRoleKey(user),
        ...context,
      });
      return { ok: true, coins };
    },

    /** Vendedor + Super Backoffice na proposta PAGA (moedas separadas). */
    async awardRouletteOnProposalPaid(proposal, actorUser = null) {
      if (!proposal?.id) return;
      const vendorId = proposal.employee_id || proposal.vendorId || proposal.vendor_id;
      if (vendorId) {
        const vendor = await this.getUser(vendorId).catch(() => null);
        if (vendor && this._isPartnerWalletUser(vendor)) return;
      }
      const proposalId = proposal.id;
      const by = actorUser?.id || 'sistema_proposta';

      if (vendorId) {
        await this.applyRouletteCriteriaReward(vendorId, 'proposta_paga', {
          proposal_id: proposalId,
          beneficiary: 'vendedor',
          by_user: by,
        }).catch(() => null);

        const supervisorId = await this._supervisorIdForVendor(vendorId);
        if (supervisorId) {
          await this.applyRouletteCriteriaReward(supervisorId, 'proposta_paga_equipe', {
            proposal_id: proposalId,
            vendor_id: vendorId,
            beneficiary: 'supervisor_vendas',
            by_user: by,
          }).catch(() => null);
        }
      }

      const actor = actorUser && typeof actorUser === 'object' ? actorUser : null;
      if (actor?.id && this._isSupBackofficeUser(actor)) {
        await this.applyRouletteCriteriaReward(actor.id, 'proposta_paga', {
          proposal_id: proposalId,
          beneficiary: 'sup_backoffice',
          vendor_id: vendorId || null,
          by_user: by,
        }).catch(() => null);
      }
    },

    _parseTxMeta(t) {
      const raw = t?.meta;
      if (!raw) return null;
      if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
      if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch { return null; }
      }
      return null;
    },

    /** Conta moedas mesmo se Supabase não tiver coluna meta (usa reason + amount). */
    _isRouletteCoinCreditTx(t, meta) {
      if (meta?.kind === 'roleta_moeda_credit') return true;
      if (meta?.kind === 'roleta_giro_custo' || meta?.kind === 'roleta_premiada') return false;
      if (String(t?.type || '').toLowerCase() !== 'credit') return false;
      const r = String(t?.reason || '');
      if (r.includes('[ROULETTE_COIN]')) return true;
      if (/premiad/i.test(r)) return false;
      return /moedas?\s*(da\s*)?roleta|cr[eé]dito\s*roleta|campanha\s*teste/i.test(r);
    },

    _isRouletteCoinDebitTx(t, meta) {
      if (meta?.kind === 'roleta_giro_custo' || meta?.kind === 'roleta_moeda_zeragem') return true;
      if (String(t?.type || '').toLowerCase() === 'credit') return false;
      const r = String(t?.reason || '');
      return /\[ROULETTE_SPIN\]|giro da roleta/i.test(r);
    },

    /** Soma prêmios da roleta ainda não estornados (só kind roleta_premiada). */
    _roulettePrizePointsPending(txs) {
      let premio = 0;
      let estorno = 0;
      (txs || []).forEach((t) => {
        const meta = this._parseTxMeta(t);
        const type = String(t?.type || '').toLowerCase();
        const amt = Math.max(0, Math.round(Number(meta?.reward_points ?? meta?.reversed_points ?? t?.amount ?? 0)));
        if (meta?.kind === 'roleta_premiada' && type === 'credit') premio += amt;
        if (meta?.kind === 'roleta_estorno_premio' && type === 'debit') estorno += amt;
      });
      return Math.max(0, premio - estorno);
    },

    /** Saldo reconstruído sem créditos de prêmio da roleta (mantém propostas, bônus, saques etc.). */
    _balanceExcludingRoulettePrizes(txs) {
      let bal = 0;
      const sorted = [...(txs || [])].sort(
        (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
      );
      sorted.forEach((t) => {
        const meta = this._parseTxMeta(t);
        const type = String(t?.type || '').toLowerCase();
        const amt = Math.max(0, Number(t?.amount ?? 0));
        if (!Number.isFinite(amt) || amt <= 0) return;
        if (meta?.kind === 'roleta_premiada' && type === 'credit') return;
        if (meta?.kind === 'roleta_estorno_premio' && type === 'debit') return;
        if (type === 'credit') bal += amt;
        else if (type === 'debit') bal -= amt;
      });
      return Math.round(bal * 100) / 100;
    },

    _roulettePrizePointsToReverse(txs, currentBalance) {
      const pending = this._roulettePrizePointsPending(txs);
      if (pending <= 0) return 0;
      const target = Math.max(0, this._balanceExcludingRoulettePrizes(txs));
      const cur = Math.max(0, Math.round(Number(currentBalance || 0) * 100) / 100);
      return Math.max(0, Math.min(pending, Math.round((cur - target) * 100) / 100));
    },

    async reverseRoulettePrizePointsForUser(userId, opts = {}) {
      if (!userId) return { ok: false, msg: 'Usuário inválido.' };
      const user = await this.getUser(userId);
      if (!user) return { ok: false, userId, msg: 'Usuário não encontrado.' };
      const txs = await this.getTransactions(userId).catch(() => []);
      const cur = this._isPartnerWalletUser(user)
        ? this._moneyAmt(user.points || user.balance || 0)
        : this._ptsBalance(user);
      const toReverse = this._roulettePrizePointsToReverse(txs, cur);
      if (toReverse <= 0) return { ok: true, skipped: true, userId, reversed: 0 };
      const nb = await this.deductBalance(
        userId,
        toReverse,
        `Estorno — prêmios da roleta (${toReverse} ${toReverse === 1 ? 'ponto' : 'pontos'})`,
        opts.by_user || 'admin',
        {
          kind: 'roleta_estorno_premio',
          reversed_points: toReverse,
          batch_id: opts.batch_id || null,
        }
      );
      if (nb == null) return { ok: false, userId, msg: 'Falha ao debitar pontos.' };
      return { ok: true, userId, reversed: toReverse, new_balance: nb };
    },

    /** Remove só pontos ganhos na roleta; saldo anterior (propostas, bônus etc.) permanece. */
    async reverseAllRoulettePrizePoints(opts = {}) {
      if (!this._assertRoulettePrivilegedAction(opts)) {
        return { ok: false, msg: 'Sem permissão para estornar prêmios da roleta.' };
      }
      const users = await this.getAllUsers().catch(() => []);
      const batchId = opts.batch_id || `roleta_estorno_${Date.now()}`;
      let usersAffected = 0;
      let totalPts = 0;
      let failed = 0;
      for (const u of users) {
        if (!u?.id) continue;
        try {
          const r = await this.reverseRoulettePrizePointsForUser(u.id, { ...opts, batch_id: batchId });
          if (r.ok && !r.skipped) {
            usersAffected += 1;
            totalPts += r.reversed;
          } else if (!r.ok) failed += 1;
        } catch (e) {
          failed += 1;
          console.warn('[reverseAllRoulettePrizePoints]', u.id, e);
        }
      }
      if (typeof _cacheDel === 'function') {
        _cacheDel('transactions');
        _cacheDel('users');
      }
      return { ok: true, usersAffected, totalPts, failed, batch_id: batchId };
    },

    async zeroRouletteCoinsForUser(userId, opts = {}) {
      if (!userId) return { ok: false, msg: 'Usuário inválido.' };
      const bal = await this.getRouletteCoinsBalance(userId);
      if (bal <= 0) return { ok: true, skipped: true, userId, coins: 0 };
      await this.addTransaction({
        employee_id: userId,
        type: 'debit',
        amount: bal,
        reason: `[ROULETTE_SPIN] Zeragem administrativa — ${bal} moeda(s)`,
        by_user: opts.by_user || 'admin',
        meta: {
          kind: 'roleta_moeda_zeragem',
          coins: bal,
          batch_id: opts.batch_id || null,
        },
      });
      return { ok: true, userId, coins: bal };
    },

    /** Zera moedas da roleta de todos (não altera pontos do saldo). */
    async zeroAllRouletteCoins(opts = {}) {
      if (!this._assertRoulettePrivilegedAction(opts)) {
        return { ok: false, msg: 'Sem permissão para zerar moedas da roleta.' };
      }
      const users = await this.getAllUsers().catch(() => []);
      const batchId = opts.batch_id || `roleta_zero_moedas_${Date.now()}`;
      let usersAffected = 0;
      let totalCoins = 0;
      let failed = 0;
      for (const u of users) {
        if (!u?.id) continue;
        try {
          const r = await this.zeroRouletteCoinsForUser(u.id, { ...opts, batch_id: batchId });
          if (r.ok && !r.skipped) {
            usersAffected += 1;
            totalCoins += r.coins;
          } else if (!r.ok) failed += 1;
        } catch (e) {
          failed += 1;
          console.warn('[zeroAllRouletteCoins]', u.id, e);
        }
      }
      if (typeof _cacheDel === 'function') _cacheDel('transactions');
      return { ok: true, usersAffected, totalCoins, failed, batch_id: batchId };
    },

    /** Estorna prêmios da roleta + zera moedas de todos. */
    async resetRouletteCampaign(opts = {}) {
      if (!this._assertRoulettePrivilegedAction(opts)) {
        return { ok: false, msg: 'Sem permissão.' };
      }
      const batchId = opts.batch_id || `roleta_reset_${Date.now()}`;
      const shared = { ...opts, batch_id: batchId };
      const coins = await this.zeroAllRouletteCoins(shared);
      const points = await this.reverseAllRoulettePrizePoints(shared);
      return { ok: true, batch_id: batchId, coins, points };
    },

    rouletteUnlimitedCoins() {
      const cfg = typeof window !== 'undefined' ? (window.SOUBLU_CONFIG || {}) : {};
      if (cfg.ROULETTE_UNLIMITED_COINS === false) return false;
      if (cfg.ROULETTE_UNLIMITED_COINS === true && this._isLocalDevHost()) return true;
      if (this._isLocalDevHost() && cfg.ROULETTE_UNLIMITED_MASTER === true
        && typeof Auth !== 'undefined' && Auth.isMaster && Auth.isMaster()) {
        return true;
      }
      return false;
    },

    formatRouletteCoinsDisplay(balance) {
      if (this.rouletteUnlimitedCoins()) return '∞';
      return Number(balance || 0).toLocaleString('pt-BR');
    },

    async getRouletteCoinsBalance(userId) {
      if (!userId) return 0;
      if (this.rouletteUnlimitedCoins()) return 999999;
      const txs = await this.getTransactions(userId).catch(() => []);
      let total = 0;
      (txs || []).forEach((t) => {
        const meta = this._parseTxMeta(t);
        const amt = Math.max(0, Math.round(Number(meta?.coins ?? t?.amount ?? 0)));
        if (this._isRouletteCoinCreditTx(t, meta)) {
          total += amt;
          return;
        }
        if (this._isRouletteCoinDebitTx(t, meta)) {
          total -= amt;
        }
      });
      return Math.max(0, total);
    },

    async grantRouletteCoins(userId, coins, context = {}) {
      const n = Math.max(0, Math.round(Number(coins || 0)));
      if (!userId || !n) return { ok: false, msg: 'Dados inválidos.' };
      const privileged = this._assertRoulettePrivilegedAction(context);
      const maxCoins = privileged ? 100 : 10;
      if (n > maxCoins) {
        return { ok: false, msg: `Limite de ${maxCoins} moeda(s) por crédito.` };
      }
      const label = context.reason || `Crédito roleta — ${n} moeda(s)`;
      const reason = label.includes('[ROULETTE_COIN]') ? label : `[ROULETTE_COIN] ${label}`;
      await this.addTransaction({
        employee_id: userId,
        type: 'credit',
        amount: n,
        reason,
        by_user: context.by_user || 'sistema',
        meta: {
          kind: 'roleta_moeda_credit',
          criteria_key: context.criteria_key || 'credito_manual',
          coins: n,
          context: context && typeof context === 'object' ? context : {},
        },
      });
      return { ok: true, coins: n };
    },

    /** Crédito em massa de moedas da roleta (testes / campanhas). */
    async grantRouletteCoinsToAll(coins = 10, opts = {}) {
      if (!this._assertRoulettePrivilegedAction(opts)) {
        return { ok: false, msg: 'Sem permissão para creditar moedas em massa.' };
      }
      const n = Math.max(1, Math.round(Number(coins || 10)));
      if (n > 50) {
        return { ok: false, msg: 'Limite de 50 moedas por campanha em massa.' };
      }
      const users = await this.getAllUsers().catch(() => []);
      const activeOnly = opts.activeOnly !== false;
      const list = (users || []).filter((u) => u?.id && (!activeOnly || u.active !== false));
      let granted = 0;
      let failed = 0;
      const batchId = opts.batch_id || `roleta_${Date.now()}`;
      for (const u of list) {
        try {
          const r = await this.grantRouletteCoins(u.id, n, {
            reason: opts.reason || `Campanha teste — ${n} moedas roleta`,
            by_user: opts.by_user || 'admin',
            criteria_key: opts.criteria_key || 'teste_massa',
            batch_id: batchId,
          });
          if (r.ok) granted += 1;
          else failed += 1;
        } catch (e) {
          console.warn('[grantRouletteCoinsToAll]', u.id, e);
          failed += 1;
        }
      }
      if (typeof _cacheDel === 'function') _cacheDel('transactions');
      return { ok: true, granted, failed, total: list.length, coins: n, batch_id: batchId };
    },

    async consumeRouletteCoins(userId, coins = 1, context = {}) {
      if (this.rouletteUnlimitedCoins()) {
        return { ok: true, unlimited: true, balance_after: 999999 };
      }
      const n = Math.max(1, Math.round(Number(coins || 1)));
      const bal = await this.getRouletteCoinsBalance(userId);
      if (bal < n) return { ok: false, msg: 'Moedas de roleta insuficientes.' };
      await this.addTransaction({
        employee_id: userId,
        type: 'debit',
        amount: n,
        reason: '[ROULETTE_SPIN] Giro da roleta',
        by_user: context?.by_user || 'sistema',
        meta: {
          kind: 'roleta_giro_custo',
          coins: n,
          context: context && typeof context === 'object' ? context : {},
        },
      });
      return { ok: true, balance_after: bal - n };
    },

    /** Devolve 1 moeda quando o giro falhou após débito (ex.: erro ao creditar prêmio). */
    async _refundRouletteSpinCoin(userId, context = {}) {
      if (!userId || this.rouletteUnlimitedCoins()) return;
      await this.grantRouletteCoins(userId, 1, {
        reason: '[ROULETTE_COIN] Estorno — falha ao creditar prêmio do giro',
        criteria_key: 'estorno_giro_falha',
        by_user: 'sistema',
        ...(context && typeof context === 'object' ? context : {}),
      }).catch(() => null);
    },

    roulettePool() {
      const drawables = (this._rouletteConfig().slots || []).filter((s) => (s.weight || 0) > 0);
      const pool = [];
      drawables.forEach((s) => {
        const points = Math.max(0, Math.round(Number(s.points || 0)));
        const qty = Math.max(0, Math.round(Number(s.weight || 0)));
        for (let i = 0; i < qty; i++) pool.push(points);
      });
      return pool;
    },

    rouletteTotalPossibilities() {
      return (this._rouletteConfig().slots || [])
        .reduce((sum, s) => sum + Math.max(0, Number(s.weight || 0)), 0) || 100;
    },

    rouletteDraw() {
      const slots = (this._rouletteConfig().slots || []).filter((s) => (s.weight || 0) > 0);
      const total = slots.reduce((a, s) => a + Number(s.weight || 0), 0);
      if (!total) {
        return { id: null, points: 0, label: '', joke: false };
      }
      let r = Math.random() * total;
      for (const s of slots) {
        r -= Number(s.weight || 0);
        if (r <= 0) {
          return {
            id: s.id,
            points: Math.max(0, Math.round(Number(s.points || 0))),
            label: s.label || `${s.points} pontos`,
            joke: false,
          };
        }
      }
      const last = slots[slots.length - 1];
      return {
        id: last.id,
        points: Math.max(0, Math.round(Number(last.points || 0))),
        label: last.label || `${last.points} pontos`,
        joke: false,
      };
    },

    async applyRouletteSpin(userId, context = {}, opts = {}) {
      if (!userId) return { ok: false, msg: 'Usuário inválido.' };
      const actorCheck = this._assertRouletteSpinActor(userId);
      if (!actorCheck.ok) return actorCheck;
      const rateCheck = this._checkRouletteSpinRate(userId);
      if (!rateCheck.ok) return rateCheck;

      const user = await this.getUser(userId);
      if (!user) return { ok: false, msg: 'Usuário não encontrado.' };
      if (!(await this.canAccessRoulette(user))) {
        return { ok: false, msg: 'Roleta não disponível para o seu perfil.' };
      }

      const consumeCoin = opts?.consume_coin !== false;
      if (consumeCoin && !this.rouletteUnlimitedCoins()) {
        const bal = await this.getRouletteCoinsBalance(userId);
        if (bal < 1) return { ok: false, msg: 'Moedas de roleta insuficientes.' };
      }

      const draw = this.rouletteDraw();
      const reward = Number(draw.points || 0);
      if (reward <= 0 || !this._validRouletteRewardPoints(reward)) {
        return { ok: false, msg: 'Roleta sem premiação configurada.' };
      }

      if (consumeCoin) {
        const c = await this.consumeRouletteCoins(userId, 1, context);
        if (!c.ok) return c;
      }

      const possibilities = this.rouletteTotalPossibilities();
      const reason = `Roleta premiada — ${reward} ${reward === 1 ? 'ponto' : 'pontos'}`;
      const meta = {
        kind: 'roleta_premiada',
        reward_points: reward,
        reward_label: draw.label || '',
        reward_segment_id: draw.id || null,
        possibilities_total: possibilities,
        context: context && typeof context === 'object' ? context : {},
        config_snapshot: this._rouletteConfig().slots,
      };

      try {
        const newBalance = await this.addBalance(userId, reward, reason, 'sistema', meta);
        if (newBalance == null) {
          if (consumeCoin) await this._refundRouletteSpinCoin(userId, context);
          return { ok: false, msg: 'Falha ao creditar prêmio. Sua moeda foi devolvida.' };
        }
        if (typeof _cacheDel === 'function') _cacheDel('transactions');
        return {
          ok: true,
          reward_points: reward,
          reward_label: draw.label || '',
          reward_segment_id: draw.id || null,
          possibilities_total: possibilities,
          new_balance: newBalance,
        };
      } catch (e) {
        if (consumeCoin) await this._refundRouletteSpinCoin(userId, context);
        throw e;
      }
    },

    /* ══ SEEDS ══ */
    _seedUsers(){
      return[
        {id:'fund_rodrigo',name:'Rodrigo Orlando',email:'rodrigo.orlando@soublu.com',password:'rodrigo123',matricula:'ROD001',department:'Direção',role:'fundador',admin_id:null,balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'dev_owner',name:'Desenvolvedor',email:'desenvolvedor@soublu.com',password:'dev123456',matricula:'DEV001',department:'Desenvolvimento',role:'desenvolvedor',admin_id:'fund_rodrigo',balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'master_sak01',name:'Lucas SAK',email:'lucas@sakpromotora.com.br',password:'master123',matricula:'SAK001',department:'Administracao',role:'master',admin_id:null,balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'ger_sak01',name:'Gerente Geral',email:'gerente@sakpromotora.com.br',password:'gerente123',matricula:'GRN001',department:'Gerência',role:'gerente',admin_id:null,balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'master01',name:'Master SOU+BLU',email:'master@soublu.com',password:'master123',matricula:'MST001',department:'Administração',role:'master',admin_id:null,balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'back01',name:'Backoffice OP',email:'backoffice@empresa.com',password:'123456',matricula:'BCK001',department:'Operacional',role:'backoffice',admin_id:'master01',balance:100,points:100,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'ger01',name:'Gerência Geral',email:'gerencia@empresa.com',password:'123456',matricula:'GER001',department:'Gerência',role:'gerencia',admin_id:'master01',balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'fin01',name:'Financeiro F',email:'financeiro@empresa.com',password:'123456',matricula:'FIN001',department:'Financeiro',role:'financeiro',admin_id:'master01',balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'rh01',name:'RH Human',email:'rh@empresa.com',password:'123456',matricula:'RHH001',department:'RH',role:'rh',admin_id:'master01',balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'oper01',name:'Operacional O',email:'operacional@empresa.com',password:'123456',matricula:'OPR001',department:'Operacional',role:'operacional',admin_id:'master01',balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'jur01',name:'Jurídico J',email:'juridico@empresa.com',password:'123456',matricula:'JUR001',department:'Jurídico',role:'juridico',admin_id:'master01',balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'dir01',name:'Diretoria D',email:'diretoria@empresa.com',password:'123456',matricula:'DIR001',department:'Diretoria',role:'diretoria',admin_id:'master01',balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'ouv01',name:'Ouvidoria O',email:'ouvidoria@empresa.com',password:'123456',matricula:'OUV001',department:'Ouvidoria',role:'ouvidoria',admin_id:'master01',balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'sup01',name:'Supervisor Alpha',email:'sup1@soublu.com',password:'sup123',matricula:'SUP001',department:'Vendas',role:'supervisor',admin_id:'master01',balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'sup02',name:'Supervisor Beta',email:'sup2@soublu.com',password:'sup123',matricula:'SUP002',department:'Vendas',role:'supervisor',admin_id:'master01',balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'vend01',name:'Vendedor Um (Alpha)',email:'vend1@soublu.com',password:'vend123',matricula:'VND001',department:'Vendas',role:'vendedor',admin_id:'sup01',balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'vend02',name:'Vendedor Dois (Alpha)',email:'vend2@soublu.com',password:'vend123',matricula:'VND002',department:'Vendas',role:'vendedor',admin_id:'sup01',balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
        {id:'vend03',name:'Vendedor Três (Beta)',email:'vend3@soublu.com',password:'vend123',matricula:'VND003',department:'Vendas',role:'vendedor',admin_id:'sup02',balance:0,points:0,photo_url:'',face_hash:'',doc_verified:false,show_points:true,active:true,created_at:new Date().toISOString()},
      ];
    },
    _seedProducts(){return[
      {id:'p001',admin_id:'master01',name:'Camiseta SOU+BLU',description:'Algodão com logo bordado.',category:'Vestuário',points_price:90,price:89.90,stock:30,image_url:'',emoji:'👕',active:true,featured:true,created_at:new Date().toISOString()},
      {id:'p002',admin_id:'master01',name:'Fone Bluetooth',description:'Sem fio, 20h bateria.',category:'Tecnologia',points_price:350,price:349.90,stock:15,image_url:'',emoji:'🎧',active:true,featured:true,created_at:new Date().toISOString()},
      {id:'p003',admin_id:'master01',name:'Vale-Presente R$50',description:'Loja parceira.',category:'Vale-Presente',price:50,stock:100,image_url:'',emoji:'🎁',active:true,featured:false,created_at:new Date().toISOString()},
      {id:'p004',admin_id:'master01',name:'Mochila Executiva',description:'Para notebook.',category:'Acessórios',points_price:190,price:189.90,stock:8,image_url:'',emoji:'🎒',active:true,featured:true,created_at:new Date().toISOString()},
      {id:'p005',admin_id:'master01',name:'Caneca Personalizada',description:'Cerâmica.',category:'Utilidades',points_price:40,price:39.90,stock:50,image_url:'',emoji:'☕',active:true,featured:false,created_at:new Date().toISOString()},
      {id:'p006',admin_id:'master01',name:'Dia de Folga',description:'Combinado com gestor.',category:'Benefício',price:300,stock:5,image_url:'',emoji:'🏖️',active:true,featured:true,created_at:new Date().toISOString()},
    ];},
    _seedTransactions(){return[];},
    _seedClients(){return [
      {id:'01419319140',cpf:'01419319140',name:'Paulo Roberto de Souza Coelho',supervisorId:'',phone1:'62982796369',phone2:'',rg:'5174184',civilState:'Casado',address:'Rua das Flores, 123',email:'paulorscoelho@gmail.com',motherName:'Maria Silva',fatherName:'Roberto Coelho',documents:{rgFront:{name:'rg_frente.pdf',size:245000,type:'application/pdf'},rgBack:{name:'rg_verso.pdf',size:230000,type:'application/pdf'},address:{name:'comprovante.pdf',size:150000,type:'application/pdf'}},updatedAt:new Date().toISOString()},
      {id:'12345678901',cpf:'12345678901',name:'Elielton Ferreira de França',supervisorId:'',phone1:'62987654321',phone2:'',rg:'1234567',civilState:'Solteiro',address:'Av. Principal, 456',email:'elielton@gmail.com',motherName:'Ana França',fatherName:'João França',documents:{rgFront:{name:'rg_frente.pdf',size:240000,type:'application/pdf'},rgBack:{name:'rg_verso.pdf',size:235000,type:'application/pdf'},address:{name:'comprovante.pdf',size:155000,type:'application/pdf'}},updatedAt:new Date().toISOString()},
      {id:'98765432101',cpf:'98765432101',name:'Ana Bela Moreira Santos',supervisorId:'',phone1:'62999998888',phone2:'',rg:'9876543',civilState:'Casada',address:'Rua do Comércio, 789',email:'anabela@gmail.com',motherName:'Carla Santos',fatherName:'Carlos Moreira',documents:{rgFront:{name:'rg_frente.pdf',size:250000,type:'application/pdf'},rgBack:{name:'rg_verso.pdf',size:238000,type:'application/pdf'},address:{name:'comprovante.pdf',size:160000,type:'application/pdf'}},updatedAt:new Date().toISOString()},
    ];},

    /* ══ RH MODULE ══ */
    async _rhOnlineList(table, order = 'created_at.desc') {
      try {
        const rows = await supaReq('GET', table, null, `?order=${order}`);
        return Array.isArray(rows) ? rows : [];
      } catch (e) {
        console.error(`[DB] get ${table}:`, e);
        return [];
      }
    },

    async _rhOnlineSave(table, row, lk) {
      if (!row.id) row.id = this._genId(table.replace(/^rh_/, '').slice(0, 3));
      row.created_at = row.created_at || new Date().toISOString();
      row.updated_at = new Date().toISOString();
      try {
        const res = await supaReq('POST', table, row, '?on_conflict=id');
        return res?.[0] || row;
      } catch (e) {
        console.error(`[DB] save ${table}:`, e);
        throw new Error(this.formatUserDbError ? this.formatUserDbError(e) : (e.message || 'Erro ao salvar.'));
      }
    },

    async _rhLocalSave(lk, row, matchFn) {
      const list = this._lget(lk);
      const idx = list.findIndex(matchFn);
      if (idx >= 0) list[idx] = { ...list[idx], ...row };
      else list.push(row);
      this._lset(lk, list);
      return row;
    },

    async ensureRhTablesOnline(force = false) {
      const c = typeof window !== 'undefined' ? (window.SOUBLU_CONFIG || {}) : {};
      const key = c.API_KEY;
      const base = String(c.API_BASE_URL || c.SITE_URL || (typeof location !== 'undefined' ? location.origin : '')).replace(/\/+$/, '');
      if (!key || c.DB_BACKEND !== 'hostinger') return { ok: true, skipped: true };
      const flag = force ? null : sessionStorage.getItem('soublu_rh_core_migrated');
      if (flag === '1') return { ok: true };
      try {
        const res = await fetch(`${base}/api/migrate-rh-core.php`, { headers: { apikey: key, 'X-API-Key': key } });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) sessionStorage.setItem('soublu_rh_core_migrated', '1');
        return data;
      } catch (e) {
        console.warn('[DB] ensureRhTablesOnline:', e);
        return { ok: false, error: e.message };
      }
    },

    async getRhCompanies() {
      if (this.online) return await this._rhOnlineList('rh_companies');
      return this._lget(this.LK.rh_companies);
    },
    async saveRhCompany(company) {
      if (this.online) return await this._rhOnlineSave('rh_companies', company);
      if (!company.id) company.id = this._genId('comp');
      company.created_at = company.created_at || new Date().toISOString();
      company.updated_at = new Date().toISOString();
      return await this._rhLocalSave(this.LK.rh_companies, company, c => c.cnpj === company.cnpj || c.id === company.id);
    },

    async getRhResumes() {
      if (this.online) return await this._rhOnlineList('rh_resumes');
      return this._lget(this.LK.rh_resumes);
    },
    async saveRhResume(resume) {
      if (this.online) return await this._rhOnlineSave('rh_resumes', resume);
      if (!resume.id) resume.id = this._genId('cv');
      resume.created_at = resume.created_at || new Date().toISOString();
      resume.updated_at = new Date().toISOString();
      return await this._rhLocalSave(this.LK.rh_resumes, resume, r => r.cpf === resume.cpf || r.id === resume.id);
    },

    async getRhJobs() {
      if (this.online) return await this._rhOnlineList('rh_jobs');
      return this._lget(this.LK.rh_jobs);
    },
    async getRhPositions() { return await this.getRhJobs(); },
    async saveRhJob(job) {
      if (this.online) return await this._rhOnlineSave('rh_jobs', job);
      if (!job.id) job.id = this._genId('job');
      job.created_at = job.created_at || new Date().toISOString();
      job.updated_at = new Date().toISOString();
      return await this._rhLocalSave(this.LK.rh_jobs, job, j => j.id === job.id);
    },
    async saveRhPosition(job) { return await this.saveRhJob(job); },

    async getRhEmployees() {
      if (this.online) return await this._rhOnlineList('rh_employees');
      return this._lget(this.LK.rh_employees);
    },
    async saveRhEmployee(employee) {
      if (this.online) return await this._rhOnlineSave('rh_employees', employee);
      if (!employee.id) employee.id = this._genId('emp');
      employee.created_at = employee.created_at || new Date().toISOString();
      employee.updated_at = new Date().toISOString();
      return await this._rhLocalSave(this.LK.rh_employees, employee, e => e.cpf === employee.cpf || e.id === employee.id);
    },

    async getRhAbsenceJustifications() {
      if (this.online) return await this._rhOnlineList('rh_absence_justifications');
      return this._lget(this.LK.rh_absence_justifications);
    },
    async saveRhAbsenceJustification(row) {
      if (this.online) return await this._rhOnlineSave('rh_absence_justifications', row);
      if (!row.id) row.id = this._genId('jf');
      row.created_at = row.created_at || new Date().toISOString();
      row.updated_at = new Date().toISOString();
      return await this._rhLocalSave(this.LK.rh_absence_justifications, row, r => r.id === row.id);
    },

    async getRhPunishments() {
      if (this.online) return await this._rhOnlineList('rh_punishments');
      return this._lget(this.LK.rh_punishments);
    },
    async saveRhPunishment(row) {
      if (this.online) return await this._rhOnlineSave('rh_punishments', row);
      if (!row.id) row.id = this._genId('pun');
      row.created_at = row.created_at || new Date().toISOString();
      row.updated_at = new Date().toISOString();
      return await this._rhLocalSave(this.LK.rh_punishments, row, r => r.id === row.id);
    },

    async getRhDismissals() {
      if (this.online) return await this._rhOnlineList('rh_dismissals');
      return this._lget(this.LK.rh_dismissals);
    },
    async saveRhDismissal(row) {
      if (this.online) return await this._rhOnlineSave('rh_dismissals', row);
      if (!row.id) row.id = this._genId('dem');
      row.created_at = row.created_at || new Date().toISOString();
      row.updated_at = new Date().toISOString();
      return await this._rhLocalSave(this.LK.rh_dismissals, row, r => r.id === row.id);
    },

    _normMonitoriaAtendimento(row) {
      if (!row) return null;
      let att = row.evidence_attachments;
      if (typeof att === 'string') { try { att = JSON.parse(att); } catch { att = []; } }
      if (!Array.isArray(att)) att = [];
      return { ...row, evidence_attachments: att };
    },

    async getMonitoriaAtendimentos() {
      if (this.online) {
        const rows = await this._rhOnlineList('monitoria_atendimento', 'data_avaliacao.desc');
        return (rows || []).map(r => this._normMonitoriaAtendimento(r));
      }
      return (this._lget(this.LK.monitoria_atendimento) || []).map(r => this._normMonitoriaAtendimento(r));
    },

    async getMonitoriaAtendimento(id) {
      if (!id) return null;
      if (this.online) {
        const r = await supaReq('GET', 'monitoria_atendimento', null, `?id=eq.${encodeURIComponent(id)}&limit=1`);
        const row = Array.isArray(r) ? r[0] : r;
        return this._normMonitoriaAtendimento(row) || null;
      }
      const row = (this._lget(this.LK.monitoria_atendimento) || []).find(x => x.id === id);
      return row ? this._normMonitoriaAtendimento(row) : null;
    },

    async saveMonitoriaAtendimento(data) {
      const now = new Date().toISOString();
      let att = data.evidence_attachments;
      if (typeof att === 'string') { try { att = JSON.parse(att); } catch { att = []; } }
      if (!Array.isArray(att)) att = [];
      const row = {
        id: data.id || this._genId('mon'),
        protocolo: String(data.protocolo || '').trim(),
        motivo: String(data.motivo || '').trim(),
        data_avaliacao: data.data_avaliacao || null,
        origem: String(data.origem || '').trim(),
        protocolo_monitoria: String(data.protocolo_monitoria || '').trim(),
        colaborador_id: data.colaborador_id || null,
        colaborador_nome: String(data.colaborador_nome || '').trim(),
        colaborador_cpf: data.colaborador_cpf || null,
        evidence_attachments: att,
        observacoes: String(data.observacoes || '').trim(),
        created_by: data.created_by || null,
        created_by_name: data.created_by_name || null,
        created_at: data.created_at || now,
        updated_at: now,
      };
      if (this.online) return await this._rhOnlineSave('monitoria_atendimento', row);
      return await this._rhLocalSave(this.LK.monitoria_atendimento, row, r => r.id === row.id);
    },

    async deleteMonitoriaAtendimento(id) {
      if (!id) return false;
      if (this.online) {
        try {
          await supaReq('DELETE', 'monitoria_atendimento', null, `?id=eq.${encodeURIComponent(id)}`);
          return true;
        } catch (e) {
          console.error('[DB] delete monitoria_atendimento:', e);
          return false;
        }
      }
      const list = (this._lget(this.LK.monitoria_atendimento) || []).filter(x => x.id !== id);
      this._lset(this.LK.monitoria_atendimento, list);
      return true;
    },
  };

  if (typeof window !== 'undefined') {
    window.DB = DB;
  }

  