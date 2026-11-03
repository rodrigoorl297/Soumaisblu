/* =============================================
   Gerenciador de Leads – Data Layer (Supabase)
   Todas as operações CRUD para leads
   ============================================= */

const LeadsDB = {

  /* ── BATCHES ── */
  async getBatches(managerId = null) {
    let params = '?select=*&order=created_at.desc';
    if (managerId) params += `&manager_id=eq.${encodeURIComponent(managerId)}`;
    return await supaReq('GET', 'lead_batches', null, params);
  },

  async getBatch(id) {
    const r = await supaReq('GET', 'lead_batches', null, `?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
    return r[0] || null;
  },

  async createBatch(data) {
    const batch = {
      id: DB._genId('lb'),
      name: data.name || `Lote ${new Date().toLocaleDateString('pt-BR')}`,
      original_filename: data.original_filename || '',
      total_records: data.total_records || 0,
      distributed_records: 0,
      manager_id: data.manager_id,
      status: 'uploaded',
      column_mapping: data.column_mapping || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    _cacheDel('lead_batches');
    const r = await supaReq('POST', 'lead_batches', batch);
    return r[0] || batch;
  },

  async updateBatch(id, updates) {
    updates.updated_at = new Date().toISOString();
    _cacheDel('lead_batches');
    const r = await supaReq('PATCH', 'lead_batches', updates, `?id=eq.${encodeURIComponent(id)}`);
    return r[0] || null;
  },

  async deleteBatch(id) {
    _cacheDel('lead_batches');
    _cacheDel('leads');
    await supaReq('DELETE', 'leads', null, `?batch_id=eq.${encodeURIComponent(id)}`);
    await supaReq('DELETE', 'lead_weekly_assignments', null, `?batch_id=eq.${encodeURIComponent(id)}`);
    await supaReq('DELETE', 'lead_batches', null, `?id=eq.${encodeURIComponent(id)}`);
    return true;
  },

  /* ── LEADS ── */
  async importLeads(batchId, leadsArray) {
    _cacheDel('leads');
    // nginx rejeita POST ~>=50KB com 400 HTML; manter margem (evidência: 45KB ok, 57KB fail).
    // WAF da Locaweb esvazia POST acima de ~16KB (corpo chega vazio e o INSERT vira 1136).
    const MAX_CHUNK_BYTES = 12000;
    const MAX_CHUNK_ROWS = 80;
    let imported = 0;
    let i = 0;
    while (i < leadsArray.length) {
      const chunk = [];
      let approxBytes = 2; // []
      while (i < leadsArray.length && chunk.length < MAX_CHUNK_ROWS) {
        const lead = leadsArray[i];
        const extraData = lead.extra_data || {};
        if (lead.score) extraData.score = (lead.score || '').trim();
        // Resgata "CEL 1" etc. antes de gravar — evita mesa sem número
        let phone = (lead.phone || '').trim();
        let phone2 = (lead.phone2 || '').trim();
        if (!phone.replace(/\D/g, '') && typeof LeadsImport !== 'undefined' && LeadsImport.pickPhoneFromExtra) {
          phone = (LeadsImport.pickPhoneFromExtra(extraData, 1) || '').trim();
        }
        if (!phone2.replace(/\D/g, '') && typeof LeadsImport !== 'undefined' && LeadsImport.pickPhoneFromExtra) {
          phone2 = (LeadsImport.pickPhoneFromExtra(extraData, 2) || '').trim();
        }
        if (phone2) extraData.phone2 = phone2;
        // extra_data como JSON texto — PDO não aceita objeto/array no INSERT (erro 1136).
        const row = {
          id: DB._genId('ld'),
          batch_id: batchId,
          name: (lead.name || '').trim(),
          orgao: (lead.orgao || '').trim(),
          cpf: (lead.cpf || '').trim(),
          mother_name: (lead.mother_name || '').trim(),
          phone,
          extra_data: JSON.stringify(extraData && typeof extraData === 'object' ? extraData : {}),
          status: 'pending',
          assigned_to: null,
          assigned_date: null,
          assigned_week: null,
          assigned_year: null,
          notes: '',
          completed_at: null,
          created_at: new Date().toISOString(),
        };
        const rowBytes = JSON.stringify(row).length + (chunk.length ? 1 : 0);
        if (chunk.length && approxBytes + rowBytes > MAX_CHUNK_BYTES) break;
        chunk.push(row);
        approxBytes += rowBytes;
        i += 1;
      }
      try {
        await supaReq('POST', 'leads', chunk);
      } catch (err) {
        throw err;
      }
      imported += chunk.length;
      if (typeof lead_onImportProgress === 'function') {
        lead_onImportProgress(imported, leadsArray.length);
      }
    }
    await this.updateBatch(batchId, { total_records: leadsArray.length });
    return imported;
  },

  async getLeads(batchId, filters = {}) {
    const limitVal = filters.limit || 50000;
    let params = `?batch_id=eq.${encodeURIComponent(batchId)}&select=*&order=created_at.asc&limit=${limitVal}`;
    if (filters.status) params += `&status=eq.${encodeURIComponent(filters.status)}`;
    if (filters.assigned_to) params += `&assigned_to=eq.${encodeURIComponent(filters.assigned_to)}`;
    if (filters.assigned_date) params += `&assigned_date=eq.${encodeURIComponent(filters.assigned_date)}`;
    if (filters.offset) params += `&offset=${filters.offset}`;
    return await supaReq('GET', 'leads', null, params);
  },

  async getLeadsByUser(userId, date = null) {
    let params = `?assigned_to=eq.${encodeURIComponent(userId)}&select=*&order=assigned_date.desc&limit=500`;
    if (date) params += `&assigned_date=eq.${encodeURIComponent(date)}`;
    return await supaReq('GET', 'leads', null, params);
  },

  async getLeadsByUserAndWeek(userId, weekNumber, year) {
    return await supaReq('GET', 'leads', null,
      `?assigned_to=eq.${encodeURIComponent(userId)}&assigned_week=eq.${weekNumber}&assigned_year=eq.${year}&select=*&order=assigned_date.asc&limit=500`
    );
  },

  /**
   * Mesa do vendedor: meta do dia + trabalhados de hoje.
   * Busca status trabalhados à parte — senão o limit=500 dos recentes “perde”
   * os já ligados e no F5 a cota reenche com backlog (volta aos 50/500).
   */
  // Lotes com atribuição fantasma (distribuição incompleta) — não mostrar na mesa
  _GHOST_BATCH_IDS: new Set(['lbmpwlwzf2meozi', 'lbmpwm1by2w2lyy']),

  async getEmployeeTodayLeads(userId, todayStr) {
    const today = this._normDate(todayStr) || this.getCurrentDateStr();
    const { week: weekNumber, year } = this.getWeekAndYearFromDateStr(today);
    const uid = encodeURIComponent(userId);
    const byId = new Map();

    const merge = (rows) => {
      for (const l of rows || []) {
        if (!l || !l.id) continue;
        if (l.batch_id && this._GHOST_BATCH_IDS.has(String(l.batch_id))) continue;
        // phone/phone2 podem vir só em extra_data (ex.: coluna "CEL 1" não mapeada)
        this._hydrateLeadPhones(l);
        byId.set(String(l.id), l);
      }
    };

    // 0) HOJE primeiro — lote novo não some atrás de 2000 atrasados
    merge(await this.getLeadsByUser(userId, today).catch(() => []));
    merge(await supaReq('GET', 'leads', null,
      `?assigned_to=eq.${uid}&status=eq.pending&assigned_date=eq.${encodeURIComponent(today)}&select=*&limit=1000`
    ).catch(() => []));

    // 1) Pendentes do backlog (mais antigos primeiro)
    merge(await supaReq('GET', 'leads', null,
      `?assigned_to=eq.${uid}&status=eq.pending&select=*&order=assigned_date.asc&limit=2000`
    ).catch(() => []));

    // 2) Trabalhados por status (em paralelo)
    const workedBatches = await Promise.all(
      this.WORKED_STATUSES.map((st) =>
        supaReq('GET', 'leads', null,
          `?assigned_to=eq.${uid}&status=eq.${encodeURIComponent(st)}&select=*&order=completed_at.desc&limit=500`
        ).catch(() => [])
      )
    );
    workedBatches.forEach((rows) => merge(rows));

    // 3) Reforço: semana atual + recentes
    merge(await this.getLeadsByUserAndWeek(userId, weekNumber, year).catch(() => []));
    merge(await this.getLeadsByUser(userId).catch(() => []));

    const all = [...byId.values()];
    const workedToday = all.filter((l) => {
      if (!this.isWorkedStatus(l.status || 'pending')) return false;
      if (!l.completed_at) {
        const assigned = this._normDate(l.assigned_date);
        return !assigned || assigned === today;
      }
      const completedLocal = this._normDate(l.completed_at) || this._toLocalDateStr(new Date(l.completed_at));
      return completedLocal === today;
    });

    const wa = await this.getWeeklyAssignmentOrLatest(userId, weekNumber, year).catch(() => null);
    const dailyTarget = Math.max(1, Number(wa?.daily_target) || 50);
    const remainingByMeta = Math.max(0, dailyTarget - workedToday.length);

    const pendingPool = all
      .filter((l) => {
        const status = l.status || 'pending';
        if (status !== 'pending') return false;
        const assigned = this._normDate(l.assigned_date);
        return !assigned || assigned <= today;
      })
      .sort((a, b) => String(a.assigned_date || '').localeCompare(String(b.assigned_date || '')));

    /**
     * Regra da mesa (todos os vendedores):
     * 1) SEMPRE mostra pendentes de HOJE (lote novo não some após meta batida).
     * 2) Atrasados: sobra da meta + mínimo de backlog (não zera atraso só porque há lote novo).
     */
    const pendingToday = pendingPool.filter((l) => this._normDate(l.assigned_date) === today);
    const pendingOverdue = pendingPool.filter((l) => {
      const a = this._normDate(l.assigned_date);
      return !a || a < today;
    });
    const overdueFloor = Math.min(40, dailyTarget);
    const overdueCap = Math.max(remainingByMeta, overdueFloor);
    const pendingOnDesk = [
      ...pendingToday,
      ...pendingOverdue.slice(0, overdueCap),
    ];

    const deskMap = new Map();
    workedToday.forEach((l) => deskMap.set(String(l.id), l));
    pendingOnDesk.forEach((l) => deskMap.set(String(l.id), l));
    return [...deskMap.values()];
  },

  _filterDeskLeads(leads, todayStr) {
    const today = this._normDate(todayStr);
    return (leads || []).filter((l) => {
      const status = l.status || 'pending';
      const assigned = this._normDate(l.assigned_date);
      if (assigned && assigned === today) return true;
      if (!this.isWorkedStatus(status)) {
        if (!assigned || assigned <= today) return true;
        return false;
      }
      if (l.completed_at) {
        const completedLocal = this._normDate(l.completed_at) || this._toLocalDateStr(new Date(l.completed_at));
        if (completedLocal === today) return true;
      }
      return false;
    });
  },

  async updateLead(id, updates) {
    _cacheDel('leads');
    const r = await supaReq('PATCH', 'leads', updates, `?id=eq.${encodeURIComponent(id)}`);
    return r[0] || null;
  },

  // Status possíveis: pending, nao_atende, sem_interesse, em_negociacao, venda_fechada, whatsapp
  LEAD_STATUSES: {
    pending:         { label: 'Pendente',        color: 'muted',   icon: '⏳' },
    nao_atende:      { label: 'Não Atende',      color: 'warning', icon: '📵' },
    sem_interesse:   { label: 'Sem Interesse',   color: 'danger',  icon: '👎' },
    em_negociacao:   { label: 'Em Negociação',   color: 'info',    icon: '🤝' },
    venda_fechada:   { label: 'Venda Fechada',   color: 'success', icon: '✅' },
    whatsapp:        { label: 'WhatsApp',        color: 'success', icon: '💬' },
  },

  // Status que contam como "lead trabalhado" (bateu meta)
  WORKED_STATUSES: ['nao_atende', 'sem_interesse', 'em_negociacao', 'venda_fechada', 'whatsapp'],

  isWorkedStatus(status) {
    return this.WORKED_STATUSES.includes(status);
  },

  async markLeadAs(id, status, notes = '') {
    const updates = { status };
    if (notes) updates.notes = notes;
    if (this.isWorkedStatus(status)) {
      updates.completed_at = new Date().toISOString();
    }
    if (status === 'pending') {
      updates.completed_at = null;
    }

    let updated = null;
    try {
      updated = await this.updateLead(id, updates);
    } catch (e) {
      // Se completed_at/notes não existem no MySQL, grava só o status (evita lead “voltar” pendente).
      if (Object.prototype.hasOwnProperty.call(updates, 'completed_at') || notes) {
        const fallback = { status };
        updated = await this.updateLead(id, fallback);
      } else {
        throw e;
      }
    }

    const uid = updated?.assigned_to;
    if (uid && this.isWorkedStatus(status)) {
      await this.tryAwardDailyLeadsCoin(uid).catch(() => null);
    }
    return updated;
  },

  _parseExtraData(raw) {
    if (!raw) return {};
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch (_) {
        return {};
      }
    }
    return typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  },

  /**
   * _hydrateLeadPhones — preenche phone/phone2 a partir do extra_data.
   * Cobre planilhas com "CEL 1" que entraram sem mapear a coluna de telefone.
   */
  _hydrateLeadPhones(lead) {
    if (!lead) return lead;
    const extra = this._parseExtraData(lead.extra_data);
    const pick = (which) => {
      if (typeof LeadsImport !== 'undefined' && typeof LeadsImport.pickPhoneFromExtra === 'function') {
        return LeadsImport.pickPhoneFromExtra(extra, which);
      }
      const want = which === 2 ? 2 : 1;
      for (const [k, v] of Object.entries(extra || {})) {
        const n = String(k || '').toLowerCase().replace(/[_\-\s]+/g, '');
        const ok = want === 2
          ? /^(cel|celular|tel|telefone|fone|whatsapp|phone|contato)2$/.test(n)
          : /^(cel|celular|tel|telefone|fone|whatsapp|phone|contato)1?$/.test(n);
        if (!ok) continue;
        const digits = String(v || '').replace(/\D/g, '');
        if (digits.length >= 8) return String(v).trim();
      }
      return '';
    };
    if (!String(lead.phone || '').replace(/\D/g, '')) {
      const p = pick(1) || (extra.phone ? String(extra.phone).trim() : '');
      if (p) lead.phone = p;
    }
    if (!String(lead.phone2 || '').replace(/\D/g, '')) {
      const p2 = pick(2) || (extra.phone2 ? String(extra.phone2).trim() : '');
      if (p2) lead.phone2 = p2;
    }
    return lead;
  },

  /**
   * computeEmployeeDailyStats — meta e trabalhados do dia na mesa do vendedor.
   * Conta trabalhados de hoje mesmo se a mesa local estiver incompleta (F5).
   */
  async computeEmployeeDailyStats(userId, todayStr, deskLeads) {
    const today = this._normDate(todayStr) || this.getCurrentDateStr();
    const desk = deskLeads || [];
    const countWorkedOnDesk = () => desk.filter((l) => {
      if (!this.isWorkedStatus(l.status)) return false;
      if (!l.completed_at) return true;
      const completedLocal = this._normDate(l.completed_at) || this._toLocalDateStr(new Date(l.completed_at));
      return completedLocal === today;
    }).length;

    const { week, year } = this.getWeekAndYearFromDateStr(today);
    const wa = await this.getWeeklyAssignmentOrLatest(userId, week, year).catch(() => null);
    const dailyFromWeek = Math.max(0, Number(wa?.daily_target) || 0);

    // Contagem real no banco (não só o que está no DOM da mesa) — em paralelo
    let workedFromDb = 0;
    try {
      const uid = encodeURIComponent(userId);
      const seen = new Set();
      const batches = await Promise.all(
        this.WORKED_STATUSES.map((st) =>
          supaReq('GET', 'leads', null,
            `?assigned_to=eq.${uid}&status=eq.${encodeURIComponent(st)}&select=id,completed_at,assigned_date&order=completed_at.desc&limit=400`
          ).catch(() => [])
        )
      );
      for (const rows of batches) {
        for (const l of rows || []) {
          if (!l?.id || seen.has(String(l.id))) continue;
          const completedLocal = this._normDate(l.completed_at) || this._toLocalDateStr(new Date(l.completed_at));
          const ok = completedLocal === today
            || (!l.completed_at && (this._normDate(l.assigned_date) === today || !l.assigned_date));
          if (!ok) continue;
          seen.add(String(l.id));
          workedFromDb += 1;
        }
      }
    } catch (_) { /* fallback desk */ }

    const worked = Math.max(countWorkedOnDesk(), workedFromDb);
    const pendingOnDesk = desk.filter((l) => (l.status || 'pending') === 'pending').length;
    const pendingTodayOnDesk = desk.filter((l) => {
      if ((l.status || 'pending') !== 'pending') return false;
      return this._normDate(l.assigned_date) === today;
    }).length;

    if (dailyFromWeek > 0) {
      // Contador acompanha a mesa: meta semanal OU trabalhados + pendentes de hoje
      const target = Math.max(dailyFromWeek, worked + pendingTodayOnDesk);
      return {
        target,
        worked,
        dueLeads: desk,
        pendingDue: pendingOnDesk,
      };
    }

    const pendingDue = pendingOnDesk;
    const target = Math.max(pendingDue + worked, 1);
    return { target, worked, dueLeads: desk, pendingDue };
  },

  _dialHistoryKey(userId) {
    const uid = userId || (typeof Auth !== 'undefined' ? Auth.getSession()?.id : '') || 'anon';
    return 'le_dial_history_' + uid;
  },

  getDialHistory(userId, limit = 20) {
    try {
      const raw = localStorage.getItem(this._dialHistoryKey(userId));
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.slice(0, limit) : [];
    } catch (_) {
      return [];
    }
  },

  _appendLocalDialHistory(entry, userId) {
    const list = this.getDialHistory(userId, 40);
    list.unshift(entry);
    try {
      localStorage.setItem(this._dialHistoryKey(userId), JSON.stringify(list.slice(0, 40)));
    } catch (_) { /* ignore */ }
  },

  /**
   * logCall — grava histórico de discagem no extra_data do lead (e localStorage).
   */
  async logCall(leadId, phone, meta = {}) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return null;
    const entry = {
      phone: digits,
      at: new Date().toISOString(),
      via: meta.via || 'click2call',
      method: meta.method || '',
    };
    this._appendLocalDialHistory({ ...entry, lead_id: leadId || '' }, meta.user_id);
    if (!leadId) return entry;
    try {
      const rows = await supaReq('GET', 'leads', null,
        `?id=eq.${encodeURIComponent(leadId)}&select=id,extra_data&limit=1`
      );
      const row = rows?.[0];
      if (!row) return entry;
      const extra = this._parseExtraData(row.extra_data);
      const calls = Array.isArray(extra.calls) ? extra.calls.slice() : [];
      calls.unshift(entry);
      extra.calls = calls.slice(0, 40);
      extra.last_called_at = entry.at;
      await this.updateLead(leadId, { extra_data: extra });
    } catch (_) { /* histórico local já gravado */ }
    return entry;
  },

  /**
   * markLeadTouchedOnCall — ao discar, conta o lead como trabalhado.
   * Pendente → nao_atende (vendedor pode ajustar depois no Atender).
   */
  async markLeadTouchedOnCall(leadId) {
    if (!leadId) return null;
    const rows = await supaReq('GET', 'leads', null,
      `?id=eq.${encodeURIComponent(leadId)}&select=id,status,assigned_to&limit=1`
    ).catch(() => []);
    const row = rows?.[0] || null;
    const current = row?.status || 'pending';
    if (current !== 'pending') return row;
    return await this.markLeadAs(leadId, 'nao_atende', 'Discagem registrada');
  },

  /** Vendedor: +1 moeda ao bater a cota diária de leads (1x por dia). */
  async tryAwardDailyLeadsCoin(userId) {
    if (!userId || typeof DB?.applyRouletteCriteriaReward !== 'function') return null;
    const user = await DB.getUser(userId).catch(() => null);
    if (!user || !['vendedor', 'employee'].includes(String(user.role || '').toLowerCase())) return null;

    const today = this.getCurrentDateStr();
    const todayLeads = await this.getEmployeeTodayLeads(userId, today);
    const target = todayLeads.length;
    const done = todayLeads.filter((l) => this.isWorkedStatus(l.status)).length;
    if (target <= 0 || done < target) return null;

    await this.upsertDailyProgress(userId, today, target, done).catch(() => null);
    const rw = await DB.applyRouletteCriteriaReward(userId, 'leads_todos_dias', {
      date: today,
      done,
      target,
      by_user: 'sistema_leads',
    });
    if (user?.admin_id) {
      await this.tryAwardSupervisorTeamLeadsCoin(user.admin_id, today).catch(() => null);
    }
    return rw;
  },

  /** Supervisor: +2 moedas quando toda a equipe de vendedores bate a cota de leads no dia. */
  async tryAwardSupervisorTeamLeadsCoin(supervisorId, dateStr) {
    if (!supervisorId || typeof DB?.applyRouletteCriteriaReward !== 'function') return null;
    const sup = await DB.getUser(supervisorId).catch(() => null);
    if (!sup || String(sup.role || '').toLowerCase() !== 'supervisor') return null;

    const team = await DB.getEmployeesByAdmin(supervisorId).catch(() => []);
    const vendors = (team || []).filter((u) =>
      u?.active !== false && ['vendedor', 'employee'].includes(String(u.role || '').toLowerCase())
    );
    if (!vendors.length) return null;

    const today = dateStr || this.getCurrentDateStr();
    for (const v of vendors) {
      const todayLeads = await this.getEmployeeTodayLeads(v.id, today);
      const target = todayLeads.length;
      const done = todayLeads.filter((l) => this.isWorkedStatus(l.status)).length;
      if (target <= 0 || done < target) return null;
    }

    return DB.applyRouletteCriteriaReward(supervisorId, 'equipe_meta_leads_dia', {
      date: today,
      team_size: vendors.length,
      by_user: 'sistema_leads',
    });
  },

  async countLeadsByStatus(batchId) {
    const all = await this.getLeads(batchId);
    const counts = { pending: 0, nao_atende: 0, sem_interesse: 0, em_negociacao: 0, venda_fechada: 0, whatsapp: 0, total: all.length, worked: 0 };
    all.forEach(l => {
      if (counts[l.status] !== undefined) counts[l.status]++;
      if (this.isWorkedStatus(l.status)) counts.worked++;
    });
    return counts;
  },

  async getUnassignedLeads(batchId) {
    // Pendentes sem dono (null ou ''). MySQL às vezes grava '' no lugar de NULL.
    const rows = await this.getPendingLeadsInBatch(batchId);
    return (rows || []).filter((l) => !String(l.assigned_to || '').trim());
  },

  /**
   * getPendingLeadsInBatch — pendentes do lote (mesmo já atribuídos).
   * Usado no redistribuir/sobrescrever sem mexer nos já trabalhados.
   */
  async getPendingLeadsInBatch(batchId) {
    const rows = [];
    for (let offset = 0; offset < 500000; offset += 500) {
      const page = await supaReq('GET', 'leads', null,
        `?batch_id=eq.${encodeURIComponent(batchId)}&status=eq.pending&select=*&order=created_at.asc,id.asc&limit=500&offset=${offset}`);
      rows.push(...page);
      if (page.length < 500) return rows;
    }
    throw new Error('Lote muito grande. Divida-o antes de distribuir.');
  },

  /**
   * clearPendingAssignmentsInBatch — zera assigned_* só dos pendentes do lote.
   * Não toca em nao_atende/whatsapp/etc. (histórico preservado).
   */
  async clearPendingAssignmentsInBatch(batchId) {
    _cacheDel('leads');
    const pending = await this.getPendingLeadsInBatch(batchId);
    if (!pending.length) return 0;
    const CHUNK = 30;
    for (let i = 0; i < pending.length; i += CHUNK) {
      const chunk = pending.slice(i, i + CHUNK);
      const orParams = chunk.map((l) => `id.eq.${encodeURIComponent(l.id)}`).join(',');
      await supaReq('PATCH', 'leads', {
        assigned_to: null,
        assigned_date: null,
        assigned_week: null,
        assigned_year: null,
      }, `?or=(${orParams})`);
    }
    return pending.length;
  },

  /**
   * redistributeLeads — sobrescreve destino dos PENDENTES do lote.
   * Plano em memória → aplica assigned_* (overwrite) → só então troca cotas semanais.
   * Assim, se o apply falhar, os leads NÃO ficam sem dono.
   */
  async redistributeLeads(batchId, employeeIds, weeksCount = null) {
    if (!employeeIds?.length) throw new Error('Selecione pelo menos um funcionário.');
    const pending = await this.getPendingLeadsInBatch(batchId);
    if (!pending.length) {
      throw new Error('Não há leads pendentes neste lote para redistribuir (só restam trabalhados).');
    }
    const plan = this._buildDistributionPlan(pending, employeeIds, weeksCount);
    if (!plan.leadUpdates.length) throw new Error('Não foi possível montar a redistribuição.');
    plan.weeklyAssignments.forEach((w) => { w.batch_id = batchId; });

    // 1) Sobrescreve atribuição (sem limpar antes)
    await this._applyLeadAssignments(plan.leadUpdates);

    // 2) Troca cotas semanais do lote
    _cacheDel('lead_weekly_assignments');
    await supaReq('DELETE', 'lead_weekly_assignments', null,
      `?batch_id=eq.${encodeURIComponent(batchId)}`
    );
    if (plan.weeklyAssignments.length > 0) {
      await supaReq('POST', 'lead_weekly_assignments', plan.weeklyAssignments);
    }

    await this.updateBatch(batchId, {
      status: 'active',
      distributed_records: plan.distributed,
    });

    return {
      distributed: plan.distributed,
      perEmployee: plan.perEmployee,
      dailyTarget: plan.dailyTarget,
    };
  },

  /* ── GESTÃO / APAGAR / TROCAR LEADS ── */
  async deleteLead(id) {
    _cacheDel('leads');
    await supaReq('DELETE', 'leads', null, `?id=eq.${encodeURIComponent(id)}`);
    return true;
  },

  async deleteLeadsBulk(leadIds) {
    if (!leadIds || !leadIds.length) return true;
    _cacheDel('leads');
    for (let i = 0; i < leadIds.length; i += 30) {
      const chunk = leadIds.slice(i, i + 30);
      const orParams = chunk.map(id => `id.eq.${encodeURIComponent(id)}`).join(',');
      await supaReq('DELETE', 'leads', null, `?or=(${orParams})`);
    }
    return true;
  },

  async reassignLead(id, newUserId, assignedDate = null) {
    _cacheDel('leads');
    const today = this.getCurrentDateStr();
    const { week, year } = this.getCurrentWeekAndYear();
    const updates = {
      assigned_to: newUserId || null,
      assigned_date: newUserId ? (assignedDate || today) : null,
      assigned_week: newUserId ? week : null,
      assigned_year: newUserId ? year : null,
    };
    return await this.updateLead(id, updates);
  },

  async reassignLeadsBulk(leadIds, newUserId) {
    if (!leadIds || !leadIds.length) return true;
    _cacheDel('leads');
    const today = this.getCurrentDateStr();
    const { week, year } = this.getCurrentWeekAndYear();
    for (let i = 0; i < leadIds.length; i += 30) {
      const chunk = leadIds.slice(i, i + 30);
      await Promise.all(chunk.map(id => supaReq('PATCH', 'leads', {
        assigned_to: newUserId || null,
        assigned_date: newUserId ? today : null,
        assigned_week: newUserId ? week : null,
        assigned_year: newUserId ? year : null,
      }, `?id=eq.${encodeURIComponent(id)}`)));
    }
    return true;
  },

  /* ── REPASSE / SUBDIVISÃO DE LOTES ── */
  async repassLeadsToSupervisors(batchId, supervisorIds) {
    _cacheDel('leads');
    _cacheDel('lead_batches');

    const unassigned = await this.getUnassignedLeads(batchId);
    if (!unassigned.length) throw new Error('Nenhum lead disponível para repasse.');
    if (!supervisorIds.length) throw new Error('Selecione pelo menos um supervisor.');

    const originalBatch = await this.getBatch(batchId);
    if (!originalBatch) throw new Error('Lote original não encontrado.');

    const leadsPerSupervisor = Math.floor(unassigned.length / supervisorIds.length);
    const remainder = unassigned.length % supervisorIds.length;

    let leadIndex = 0;
    
    for (let supIdx = 0; supIdx < supervisorIds.length; supIdx++) {
      const supId = supervisorIds[supIdx];
      const supLeadCount = leadsPerSupervisor + (supIdx < remainder ? 1 : 0);
      if (supLeadCount <= 0) continue;

      const supervisorUser = await DB.getUser(supId);
      const supName = supervisorUser ? supervisorUser.name.split(' ')[0] : 'Supervisor';
      
      // Create new sub-batch
      const newBatch = await this.createBatch({
        name: `${originalBatch.name} - Repasse ${supName}`,
        original_filename: originalBatch.original_filename,
        total_records: supLeadCount,
        manager_id: supId,
        column_mapping: originalBatch.column_mapping
      });

      // Update leads (bulk upsert for performance)
      const updates = [];
      for (let i = 0; i < supLeadCount; i++) {
        const lead = unassigned[leadIndex];
        updates.push({ ...lead, batch_id: newBatch.id });
        leadIndex++;
      }
      if (updates.length > 0) {
        await supaReq('POST', 'leads', updates, '?on_conflict=id');
      }
    }

    // Update original batch total records (subtract the repassed leads)
    const newTotal = Math.max(0, originalBatch.total_records - leadIndex);
    await this.updateBatch(batchId, { total_records: newTotal });

    return { repassed: leadIndex };
  },

  /* ── DISTRIBUTION ── */

  /**
   * _buildDistributionPlan — monta assigned_* + cotas semanais EM MEMÓRIA.
   * Não grava no banco. Usado por distributeLeads e redistributeLeads.
   * Cap por semana (weekLeadCount) evita despejar o lote inteiro nos dias restantes.
   */
  _buildDistributionPlan(leads, employeeIds, weeksCount = null, ref = new Date()) {
    employeeIds = [...new Set((employeeIds || []).map(id => String(id).trim()).filter(Boolean))];
    const pool = Array.isArray(leads) ? leads.slice() : [];
    if (!pool.length) throw new Error('Nenhum lead disponível para distribuição.');
    if (!employeeIds?.length) throw new Error('Selecione pelo menos um funcionário.');

    const leadsPerEmployee = Math.floor(pool.length / employeeIds.length);
    const remainder = pool.length % employeeIds.length;
    const totalWeeks = weeksCount == null ? Math.max(1, Math.ceil(Math.ceil(pool.length / employeeIds.length) / 200)) : Number(weeksCount);
    if (!Number.isInteger(totalWeeks) || totalWeeks < 1 || totalWeeks > 52) throw new Error("Informe de 1 a 52 semanas.");
    const leadsPerWeek = Math.ceil(Math.max(1, leadsPerEmployee) / totalWeeks);
    const dailyTarget = Math.ceil(leadsPerWeek / 5);
    const { week: currentWeek, year: currentYear } = this.getCurrentWeekAndYear(new Date(ref));
    const firstMonday = this._getWeekStartDate(currentYear, currentWeek);

    let leadIndex = 0;
    const weeklyAssignments = [];
    const leadUpdates = [];

    for (let empIdx = 0; empIdx < employeeIds.length; empIdx++) {
      const empId = employeeIds[empIdx];
      const empLeadCount = leadsPerEmployee + (empIdx < remainder ? 1 : 0);
      let empAssigned = 0;

      for (let week = 0; week < totalWeeks; week++) {
        const weekStart = new Date(firstMonday);
        weekStart.setDate(weekStart.getDate() + week * 7);
        const { week: weekNum, year: yearForWeek } = this.getCurrentWeekAndYear(weekStart);
        const weekLeadCount = Math.floor(empLeadCount / totalWeeks) + (week < empLeadCount % totalWeeks ? 1 : 0);
        if (weekLeadCount <= 0) break;

        const daysInWeek = 5;
        let startDayOffset = 0;
        if (week === 0) {
          const now = new Date(ref);
          const dow = now.getDay();
          if (dow >= 1 && dow <= 5) startDayOffset = dow - 1;
          else if (dow === 6) startDayOffset = 4;
        }
        const daysLeftForTarget = Math.max(1, daysInWeek - startDayOffset);
        // Cota ≤60: tudo no 1º dia útil. Espalhar 49 em 5 dias (~10/dia) faz a mesa
        // parecer vazia (“não chegou”) quando o gerente espera ~50 na hora.
        const dumpAllOnFirstDay = weekLeadCount <= 60;
        const dailyTargetForWa = dumpAllOnFirstDay
          ? weekLeadCount
          : Math.ceil(weekLeadCount / daysLeftForTarget);

        weeklyAssignments.push({
          id: DB._genId('lwa'),
          user_id: empId,
          batch_id: null,
          week_number: weekNum,
          year: yearForWeek,
          total_leads: weekLeadCount,
          daily_target: dailyTargetForWa,
          created_at: new Date().toISOString(),
        });

        let assignedThisWeek = 0;

        for (let dayOffset = startDayOffset; dayOffset < daysInWeek && leadIndex < pool.length && assignedThisWeek < weekLeadCount; dayOffset++) {
          const date = new Date(weekStart);
          date.setDate(date.getDate() + dayOffset);
          while (date.getDay() === 0 || date.getDay() === 6) {
            date.setDate(date.getDate() + 1);
          }
          const dateStr = this._toLocalDateStr(date);
          const slotsLeft = weekLeadCount - assignedThisWeek;
          const daysRemaining = daysInWeek - dayOffset;
          const dailyCount = dumpAllOnFirstDay
            ? slotsLeft
            : Math.ceil(slotsLeft / Math.max(1, daysRemaining));

          for (let d = 0; d < dailyCount && leadIndex < pool.length && assignedThisWeek < weekLeadCount && empAssigned < empLeadCount; d++) {
            const lead = pool[leadIndex];
            leadUpdates.push({
              id: lead.id,
              assigned_to: empId,
              assigned_date: dateStr,
              assigned_week: weekNum,
              assigned_year: yearForWeek,
            });
            leadIndex++;
            assignedThisWeek++;
            empAssigned++;
          }
          if (dumpAllOnFirstDay) break;
        }
      }
    }

    return {
      leadUpdates,
      weeklyAssignments,
      distributed: leadUpdates.length,
      perEmployee: leadsPerEmployee,
      dailyTarget: Math.max(0, ...weeklyAssignments.map(row => row.daily_target)),
    };
  },

  buildDistributionPlan(leads, employeeIds, weeksCount = null, ref = new Date()) {
    return this._buildDistributionPlan(leads, employeeIds, weeksCount, ref);
  },

  async distributeLeads(batchId, employeeIds, weeksCount = null) {
    _cacheDel('leads');
    _cacheDel('lead_weekly_assignments');

    const unassigned = await this.getUnassignedLeads(batchId);
    if (!unassigned.length) throw new Error('Nenhum lead disponível para distribuição.');
    if (!employeeIds.length) throw new Error('Selecione pelo menos um funcionário.');

    const plan = this._buildDistributionPlan(unassigned, employeeIds, weeksCount);
    plan.weeklyAssignments.forEach((w) => { w.batch_id = batchId; });

    if (plan.weeklyAssignments.length > 0) {
      await supaReq('POST', 'lead_weekly_assignments', plan.weeklyAssignments);
    }
    if (plan.leadUpdates.length > 0) {
      await this._applyLeadAssignments(plan.leadUpdates);
    }

    await this.updateBatch(batchId, {
      status: 'active',
      distributed_records: plan.distributed,
    });

    return {
      distributed: plan.distributed,
      perEmployee: plan.perEmployee,
      dailyTarget: plan.dailyTarget,
    };
  },

  /** Aplica assigned_* em chunks agrupados via PATCH OR (super rápido no MySQL). */
  async _applyLeadAssignments(updates) {
    _cacheDel('leads');
    if (!updates || !updates.length) return;

    // Agrupa atualizações por combinação de (assigned_to, assigned_date, assigned_week, assigned_year)
    const groups = new Map();
    for (const u of updates) {
      const key = `${u.assigned_to}|${u.assigned_date}|${u.assigned_week}|${u.assigned_year}`;
      if (!groups.has(key)) {
        groups.set(key, {
          assigned_to: u.assigned_to,
          assigned_date: u.assigned_date,
          assigned_week: u.assigned_week,
          assigned_year: u.assigned_year,
          ids: [],
        });
      }
      groups.get(key).ids.push(u.id);
    }

    for (const group of groups.values()) {
      const { assigned_to, assigned_date, assigned_week, assigned_year, ids } = group;
      const CHUNK_SIZE = 30; // 30 IDs por consulta OR para rápida execução no MySQL
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunkIds = ids.slice(i, i + CHUNK_SIZE);
        const orParams = chunkIds.map(id => `id.eq.${encodeURIComponent(id)}`).join(',');
        await supaReq('PATCH', 'leads', {
          assigned_to,
          assigned_date,
          assigned_week,
          assigned_year,
        }, `?or=(${orParams})`);
      }
    }
  },

  _getWeekStartDate(year, weekNum) {
    const jan1 = new Date(year, 0, 1);
    const dayOffset = (weekNum - 1) * 7 - jan1.getDay() + 1;
    const weekStart = new Date(year, 0, 1 + dayOffset);
    // Adjust to Monday
    while (weekStart.getDay() !== 1) {
      weekStart.setDate(weekStart.getDate() + 1);
    }
    return weekStart;
  },

  /* ── WEEKLY ASSIGNMENTS ── */
  /**
   * getWeeklyAssignment — cota da semana do vendedor.
   * Se houver vários lotes na mesma semana, SOMA daily_target/total_leads.
   * Sem isso o limit=1 pegava o lote antigo (ex.: 43/dia) e a mesa ficava
   * em remaining=0 mesmo com lote novo já atribuído.
   */
  async getWeeklyAssignment(userId, weekNumber, year) {
    const rows = await supaReq('GET', 'lead_weekly_assignments', null,
      `?user_id=eq.${encodeURIComponent(userId)}&week_number=eq.${weekNumber}&year=eq.${year}&select=*&limit=50`
    ).catch(() => []);
    const list = Array.isArray(rows) ? rows.filter((r) => r && (Number(r.daily_target) > 0 || Number(r.total_leads) > 0)) : [];
    if (!list.length) {
      const any = Array.isArray(rows) && rows[0] ? rows[0] : null;
      return any || null;
    }
    list.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const latest = list[0];
    const dailyTarget = list.reduce((s, r) => s + (Number(r.daily_target) || 0), 0);
    const totalLeads = list.reduce((s, r) => s + (Number(r.total_leads) || 0), 0);
    return {
      ...latest,
      daily_target: Math.max(1, dailyTarget),
      total_leads: totalLeads,
      _merged_from: list.length,
      _batch_ids: list.map((r) => r.batch_id).filter(Boolean),
    };
  },

  /**
   * getWeeklyAssignmentOrLatest — meta da semana atual; se não houver, usa a atribuição mais recente.
   * Ordena/soma no cliente (API pode ignorar order multi-coluna) para não zerar a mesa.
   */
  async getWeeklyAssignmentOrLatest(userId, weekNumber, year) {
    const cur = await this.getWeeklyAssignment(userId, weekNumber, year).catch(() => null);
    if (cur && Number(cur.daily_target) > 0) return cur;
    const rows = await supaReq('GET', 'lead_weekly_assignments', null,
      `?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=50`
    ).catch(() => []);
    const list = Array.isArray(rows) ? [...rows] : [];
    list.sort((a, b) => (Number(b.year) - Number(a.year)) || (Number(b.week_number) - Number(a.week_number)) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
    // Agrupa a semana mais recente e soma cotas dessa semana
    if (!list.length) return null;
    const topWeek = Number(list[0].week_number);
    const topYear = Number(list[0].year);
    const same = list.filter((r) => Number(r.week_number) === topWeek && Number(r.year) === topYear);
    if (same.length > 1) {
      const dailyTarget = same.reduce((s, r) => s + (Number(r.daily_target) || 0), 0);
      const totalLeads = same.reduce((s, r) => s + (Number(r.total_leads) || 0), 0);
      return {
        ...same[0],
        daily_target: Math.max(1, dailyTarget),
        total_leads: totalLeads,
        _merged_from: same.length,
      };
    }
    const withTarget = list.find((r) => Number(r?.daily_target) > 0);
    return withTarget || cur || list[0] || null;
  },

  async getWeeklyAssignments(batchId) {
    return await supaReq('GET', 'lead_weekly_assignments', null,
      `?batch_id=eq.${encodeURIComponent(batchId)}&select=*&order=user_id.asc,week_number.asc`
    );
  },

  /* ── DAILY PROGRESS ── */
  async getDailyProgress(userId, date) {
    const r = await supaReq('GET', 'lead_daily_progress', null,
      `?user_id=eq.${encodeURIComponent(userId)}&work_date=eq.${encodeURIComponent(date)}&select=*&limit=1`
    );
    return r[0] || null;
  },

  async upsertDailyProgress(userId, date, target, completed) {
    _cacheDel('lead_daily_progress');
    const existing = await this.getDailyProgress(userId, date);
    const safeTarget = Math.max(0, Number(target) || 0);
    const safeCompleted = Math.max(0, Number(completed) || 0);
    const metTarget = safeTarget > 0 && safeCompleted >= safeTarget;
    const payload = {
      target: safeTarget,
      completed: safeCompleted,
      met_target: metTarget,
    };

    if (existing) {
      // Atualiza meta E feitos — antes só patchava completed e a tela ficava 1/500.
      return await supaReq('PATCH', 'lead_daily_progress',
        payload,
        `?id=eq.${encodeURIComponent(existing.id)}`
      );
    }

    return await supaReq('POST', 'lead_daily_progress', {
      id: DB._genId('ldp'),
      user_id: userId,
      work_date: date,
      ...payload,
      lock_triggered: false,
      created_at: new Date().toISOString(),
    });
  },

  async getWeekProgress(userId, weekNumber, year) {
    // Get all 5 business days for this week
    const weekStart = this._getWeekStartDate(year, weekNumber);
    const dates = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
      dates.push(this._toLocalDateStr(d));
    }

    const allLeads = await this.getLeadsByUser(userId).catch(() => []);

    const results = [];
    for (const date of dates) {
      const progress = await this.getDailyProgress(userId, date);
      let target = progress?.target || 0;
      let completed = progress?.completed || 0;

      // Progress zerado / ausente: derivar dos leads reais (evita "0 de 0" falso)
      if (target <= 0) {
        const dayLeads = (allLeads || []).filter((l) => this._normDate(l.assigned_date) === date);
        if (dayLeads.length) {
          target = dayLeads.length;
          completed = dayLeads.filter((l) => this.isWorkedStatus(l.status)).length;
        } else if (date === this.getCurrentDateStr()) {
          const desk = this._filterDeskLeads(allLeads || [], date);
          target = desk.length;
          completed = desk.filter((l) => this.isWorkedStatus(l.status)).length;
        }
      }

      results.push({
        date,
        dayName: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }),
        target,
        completed,
        metTarget: progress?.met_target || (target > 0 && completed >= target),
        lockTriggered: progress?.lock_triggered || false,
      });
    }
    return results;
  },

  /* ── SOFT LOCK ── */
  async checkAndLockUser(userId, date) {
    const progress = await this.getDailyProgress(userId, date);
    if (!progress) return null;
    if (progress.met_target) return null; // Meta batida, tudo certo

    // Meta não batida → soft lock
    _cacheDel('users');
    await supaReq('PATCH', 'lead_daily_progress',
      { lock_triggered: true },
      `?id=eq.${encodeURIComponent(progress.id)}`
    );

    await DB.updateUser(userId, {
      is_lead_locked: true,
      lead_locked_at: new Date().toISOString(),
      lead_lock_reason: `Meta diária não atingida em ${date}: ${progress.completed}/${progress.target}`,
    });

    // Create unlock request
    await this.createUnlockRequest(userId, date, progress.target - progress.completed);

    return { locked: true, completed: progress.completed, target: progress.target };
  },

  async isUserLocked(userId) {
    const user = await DB.getUser(userId);
    return !!(user && user.is_lead_locked);
  },

  async unlockUser(userId, approvedBy) {
    _cacheDel('users');
    await DB.updateUser(userId, {
      is_lead_locked: false,
      lead_locked_at: null,
      lead_lock_reason: '',
    });

    // Update pending unlock requests (tabela pode estar incompleta — não bloquear desbloqueio)
    try {
      const pending = await supaReq('GET', 'lead_unlock_requests', null,
        `?user_id=eq.${encodeURIComponent(userId)}&status=eq.pending&select=*`
      );
      for (const req of pending || []) {
        await supaReq('PATCH', 'lead_unlock_requests', {
          status: 'approved',
          approved_by: approvedBy,
          resolved_at: new Date().toISOString(),
        }, `?id=eq.${encodeURIComponent(req.id)}`);
      }
    } catch (e) {
      console.warn('[LeadsDB.unlockUser] requests:', e?.message || e);
    }

    return true;
  },

  async denyUnlock(requestId, deniedBy) {
    return await supaReq('PATCH', 'lead_unlock_requests', {
      status: 'denied',
      approved_by: deniedBy,
      resolved_at: new Date().toISOString(),
    }, `?id=eq.${encodeURIComponent(requestId)}`);
  },

  /* ── UNLOCK REQUESTS ── */
  async createUnlockRequest(userId, lockDate, deficit) {
    _cacheDel('lead_unlock_requests');
    return await supaReq('POST', 'lead_unlock_requests', {
      id: DB._genId('lur'),
      user_id: userId,
      status: 'pending',
      reason: `Déficit de ${deficit} lead(s) em ${lockDate}`,
      lock_date: lockDate,
      deficit,
      requested_at: new Date().toISOString(),
    });
  },

  async getPendingUnlockRequests() {
    return await supaReq('GET', 'lead_unlock_requests', null,
      `?status=eq.pending&select=*&order=requested_at.desc`
    );
  },

  async getUnlockRequestsByUser(userId) {
    return await supaReq('GET', 'lead_unlock_requests', null,
      `?user_id=eq.${encodeURIComponent(userId)}&select=*&order=requested_at.desc`
    );
  },

  /* ── REPORTS ── */
  async getEmployeeStats(batchId) {
    const assignments = await this.getWeeklyAssignments(batchId);
    const userIds = [...new Set(assignments.map(a => a.user_id))];
    const stats = [];

    for (const uid of userIds) {
      const user = await DB.getUser(uid);
      if (!user) continue;

      const leads = await this.getLeadsByUser(uid);
      const batchLeads = leads.filter(l => l.batch_id === batchId);
      const worked = batchLeads.filter(l => this.isWorkedStatus(l.status)).length;
      const total = batchLeads.length;

      stats.push({
        user,
        total,
        worked,
        pending: batchLeads.filter(l => l.status === 'pending').length,
        vendaFechada: batchLeads.filter(l => l.status === 'venda_fechada').length,
        emNegociacao: batchLeads.filter(l => l.status === 'em_negociacao').length,
        naoAtende: batchLeads.filter(l => l.status === 'nao_atende').length,
        semInteresse: batchLeads.filter(l => l.status === 'sem_interesse').length,
        whatsapp: batchLeads.filter(l => l.status === 'whatsapp').length,
        completionRate: total > 0 ? Math.round((worked / total) * 100) : 0,
        isLocked: user.is_lead_locked || false,
      });
    }

    return stats.sort((a, b) => b.completionRate - a.completionRate);
  },

  /* ── HELPERS ── */
  /** Normaliza "2026-08-07 00:00:00" → "2026-08-07". */
  _normDate(v) {
    const m = String(v || '').match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  },

  /** Data local YYYY-MM-DD (evita bug de UTC do toISOString no Brasil). */
  _toLocalDateStr(d = new Date()) {
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  getCurrentDateStr() {
    return this._toLocalDateStr(new Date());
  },

  /** Semana alinhada a _getWeekStartDate (segunda como início). */
  getWeekAndYearFromDateStr(dateStr) {
    const d = new Date(String(dateStr) + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return this.getCurrentWeekAndYear();
    return this.getCurrentWeekAndYear(d);
  },

  getCurrentWeekAndYear(ref = new Date()) {
    const d = ref instanceof Date ? new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()) : new Date(ref);
    const day = d.getDay(); // 0=dom
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + mondayOffset);

    let year = monday.getFullYear();
    // Se a segunda cai em ano diferente do calendário, usar o ano da segunda
    let week1 = this._getWeekStartDate(year, 1);
    if (monday < week1) {
      year -= 1;
      week1 = this._getWeekStartDate(year, 1);
    }
    const diffDays = Math.round((monday - week1) / 86400000);
    const week = Math.max(1, Math.floor(diffDays / 7) + 1);
    return { week, year };
  },

  isBusinessDay(date) {
    const d = new Date(date);
    return d.getDay() !== 0 && d.getDay() !== 6;
  },

  normalizeBrPhone(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
    if (d.length >= 11 && d[0] === '0') d = d.slice(1);
    if (d.length < 10 || d.length > 11) return '';
    return d;
  },
  _nextBillingApiBase() {
    const cfg = window.SOUBLU_CONFIG || {};
    const base = String(cfg.API_BASE_URL || cfg.SITE_URL || '').replace(/\/+$/, '');
    if (base) return `${base}/api/nextbilling.php`;
    try {
      return new URL('../api/nextbilling.php', window.location.href).href;
    } catch (_) {
      return '/api/nextbilling.php';
    }
  },

  _nextBillingHeaders() {
    const cfg = window.SOUBLU_CONFIG || {};
    const key = String(cfg.API_KEY || '').trim();
    return {
      'Content-Type': 'application/json',
      'X-API-Key': key,
      apikey: key,
    };
  },

  async nextBillingStatus() {
    const url = `${this._nextBillingApiBase()}?action=status`;
    const res = await fetch(url, { headers: this._nextBillingHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  async nextBillingSaveDevice(deviceId) {
    return this.nextBillingSaveConfig({ device_id: Number(deviceId) });
  },

  async nextBillingSaveConfig(opts = {}) {
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    const res = await fetch(`${this._nextBillingApiBase()}?action=save_config`, {
      method: 'POST',
      headers: this._nextBillingHeaders(),
      body: JSON.stringify({ ...opts, user_id: session?.id || '' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  /**
   * @param {{ lead_id?: string, phone_field?: string, src?: string, dst?: string }} opts
   */
  async nextBillingClick2Call(opts = {}) {
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    if (!session?.id) throw new Error('Sessão inválida. Faça login novamente.');
    const payload = { ...opts, user_id: session.id };
    const res = await fetch(`${this._nextBillingApiBase()}?action=click2call`, {
      method: 'POST',
      headers: this._nextBillingHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || data.hint || `HTTP ${res.status}`);
    const dst = String(data.dst || opts.dst || '').trim();
    if (opts.lead_id) {
      await this.logCall(opts.lead_id, dst, {
        via: 'click2call',
        method: data.method || '',
        user_id: session.id,
      }).catch(() => null);
    }
    return data;
  },

  /** Abre o MicroSIP só com o número (conta blu-209). Não usar numero@IP. */
  openSoftphoneDialNow(rawNumber) {
    const dst = this.normalizeBrPhone(rawNumber);
    if (!dst) return false;
    const href = 'sip:' + dst;
    try {
      let a = document.getElementById('leads-sip-anchor');
      if (!a) {
        a = document.createElement('a');
        a.id = 'leads-sip-anchor';
        a.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px';
        document.body.appendChild(a);
      }
      a.setAttribute('href', href);
      a.click();
    } catch (_) { /* ignore */ }
    try {
      let iframe = document.getElementById('leads-sip-frame');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'leads-sip-frame';
        iframe.title = 'sip-dial';
        iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none';
        iframe.setAttribute('aria-hidden', 'true');
        document.body.appendChild(iframe);
      }
      iframe.src = 'about:blank';
      iframe.src = href;
    } catch (_) { /* ignore */ }
    return true;
  },
};
