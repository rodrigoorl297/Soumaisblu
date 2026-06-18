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
    const CHUNK_SIZE = 500;
    let imported = 0;
    for (let i = 0; i < leadsArray.length; i += CHUNK_SIZE) {
      const chunk = leadsArray.slice(i, i + CHUNK_SIZE).map(lead => ({
        id: DB._genId('ld'),
        batch_id: batchId,
        name: (lead.name || '').trim(),
        orgao: (lead.orgao || '').trim(),
        cpf: (lead.cpf || '').trim(),
        mother_name: (lead.mother_name || '').trim(),
        phone: (lead.phone || '').trim(),
        extra_data: lead.extra_data || {},
        status: 'pending',
        assigned_to: null,
        assigned_date: null,
        assigned_week: null,
        assigned_year: null,
        notes: '',
        completed_at: null,
        created_at: new Date().toISOString(),
      }));
      await supaReq('POST', 'leads', chunk);
      imported += chunk.length;
      if (typeof lead_onImportProgress === 'function') {
        lead_onImportProgress(imported, leadsArray.length);
      }
    }
    await this.updateBatch(batchId, { total_records: leadsArray.length });
    return imported;
  },

  async getLeads(batchId, filters = {}) {
    let params = `?batch_id=eq.${encodeURIComponent(batchId)}&select=*&order=created_at.asc`;
    if (filters.status) params += `&status=eq.${encodeURIComponent(filters.status)}`;
    if (filters.assigned_to) params += `&assigned_to=eq.${encodeURIComponent(filters.assigned_to)}`;
    if (filters.assigned_date) params += `&assigned_date=eq.${encodeURIComponent(filters.assigned_date)}`;
    if (filters.limit) params += `&limit=${filters.limit}`;
    if (filters.offset) params += `&offset=${filters.offset}`;
    return await supaReq('GET', 'leads', null, params);
  },

  async getLeadsByUser(userId, date = null) {
    let params = `?assigned_to=eq.${encodeURIComponent(userId)}&select=*&order=created_at.asc`;
    if (date) params += `&assigned_date=eq.${encodeURIComponent(date)}`;
    return await supaReq('GET', 'leads', null, params);
  },

  async getLeadsByUserAndWeek(userId, weekNumber, year) {
    return await supaReq('GET', 'leads', null,
      `?assigned_to=eq.${encodeURIComponent(userId)}&assigned_week=eq.${weekNumber}&assigned_year=eq.${year}&select=*&order=assigned_date.asc`
    );
  },

  async getEmployeeTodayLeads(userId, todayStr) {
    const d = new Date(todayStr + 'T12:00:00');
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const days = Math.floor((d - jan1) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((d.getDay() + 1 + days) / 7);
    const year = d.getFullYear();

    const weekLeads = await this.getLeadsByUserAndWeek(userId, weekNumber, year);

    return weekLeads.filter(l => {
      if (l.assigned_date === todayStr) return true;
      if (l.assigned_date < todayStr && !this.isWorkedStatus(l.status)) return true;
      if (l.assigned_date < todayStr && this.isWorkedStatus(l.status) && l.completed_at && l.completed_at.startsWith(todayStr)) return true;
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
    const updated = await this.updateLead(id, updates);
    const uid = updated?.assigned_to;
    if (uid && this.isWorkedStatus(status)) {
      await this.tryAwardDailyLeadsCoin(uid).catch(() => null);
    }
    return updated;
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
    return await supaReq('GET', 'leads', null,
      `?batch_id=eq.${encodeURIComponent(batchId)}&assigned_to=is.null&select=*&order=created_at.asc`
    );
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
  async distributeLeads(batchId, employeeIds, weeksCount = null) {
    _cacheDel('leads');
    _cacheDel('lead_weekly_assignments');

    const unassigned = await this.getUnassignedLeads(batchId);
    if (!unassigned.length) throw new Error('Nenhum lead disponível para distribuição.');
    if (!employeeIds.length) throw new Error('Selecione pelo menos um funcionário.');

    const leadsPerEmployee = Math.floor(unassigned.length / employeeIds.length);
    const remainder = unassigned.length % employeeIds.length;

    // Calculate weeks and daily targets
    const totalWeeks = weeksCount || Math.ceil(leadsPerEmployee / 200); // Default: ~200 leads/semana
    const leadsPerWeek = Math.ceil(leadsPerEmployee / totalWeeks);
    const dailyTarget = Math.ceil(leadsPerWeek / 5);

    // Get current week/year
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const currentWeek = Math.ceil(((now - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
    const currentYear = now.getFullYear();

    let leadIndex = 0;
    const weeklyAssignments = [];
    const leadUpdates = [];

    for (let empIdx = 0; empIdx < employeeIds.length; empIdx++) {
      const empId = employeeIds[empIdx];
      const empLeadCount = leadsPerEmployee + (empIdx < remainder ? 1 : 0);

      // Assign leads and create weekly assignments
      for (let week = 0; week < totalWeeks; week++) {
        const weekNum = currentWeek + week;
        const weekStart = this._getWeekStartDate(currentYear, weekNum);
        const weekLeadCount = Math.min(leadsPerWeek, empLeadCount - (week * leadsPerWeek));
        if (weekLeadCount <= 0) break;

        // Create weekly assignment
        weeklyAssignments.push({
          id: DB._genId('lwa'),
          user_id: empId,
          batch_id: batchId,
          week_number: weekNum,
          year: currentYear,
          total_leads: weekLeadCount,
          daily_target: Math.ceil(weekLeadCount / 5),
          created_at: new Date().toISOString(),
        });

        // Assign individual leads with dates
        for (let dayOffset = 0; dayOffset < 5 && leadIndex < unassigned.length; dayOffset++) {
          const date = new Date(weekStart);
          date.setDate(date.getDate() + dayOffset);
          // Skip weekends
          while (date.getDay() === 0 || date.getDay() === 6) {
            date.setDate(date.getDate() + 1);
          }
          const dateStr = date.toISOString().split('T')[0];
          const dailyCount = Math.ceil(weekLeadCount / 5);

          for (let d = 0; d < dailyCount && leadIndex < unassigned.length; d++) {
            const empTotalAssigned = leadIndex - (empIdx > 0 ? (leadsPerEmployee * empIdx + Math.min(empIdx, remainder)) : 0);
            if (empTotalAssigned >= empLeadCount) break;

            const lead = unassigned[leadIndex];
            leadUpdates.push({
              ...lead,
              assigned_to: empId,
              assigned_date: dateStr,
              assigned_week: weekNum,
              assigned_year: currentYear,
            });
            leadIndex++;
          }
        }
      }
    }

    if (weeklyAssignments.length > 0) {
      await supaReq('POST', 'lead_weekly_assignments', weeklyAssignments);
    }
    if (leadUpdates.length > 0) {
      await supaReq('POST', 'leads', leadUpdates, '?on_conflict=id');
    }

    // Update batch status
    await this.updateBatch(batchId, {
      status: 'active',
      distributed_records: leadIndex,
    });

    return { distributed: leadIndex, perEmployee: leadsPerEmployee, dailyTarget };
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
  async getWeeklyAssignment(userId, weekNumber, year) {
    const r = await supaReq('GET', 'lead_weekly_assignments', null,
      `?user_id=eq.${encodeURIComponent(userId)}&week_number=eq.${weekNumber}&year=eq.${year}&select=*&limit=1`
    );
    return r[0] || null;
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
    const metTarget = completed >= target;

    if (existing) {
      return await supaReq('PATCH', 'lead_daily_progress',
        { completed, met_target: metTarget },
        `?id=eq.${encodeURIComponent(existing.id)}`
      );
    }

    return await supaReq('POST', 'lead_daily_progress', {
      id: DB._genId('ldp'),
      user_id: userId,
      work_date: date,
      target,
      completed,
      met_target: metTarget,
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
      dates.push(d.toISOString().split('T')[0]);
    }

    const results = [];
    for (const date of dates) {
      const progress = await this.getDailyProgress(userId, date);
      results.push({
        date,
        dayName: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }),
        target: progress?.target || 0,
        completed: progress?.completed || 0,
        metTarget: progress?.met_target || false,
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

    // Update pending unlock requests
    const pending = await supaReq('GET', 'lead_unlock_requests', null,
      `?user_id=eq.${encodeURIComponent(userId)}&status=eq.pending&select=*`
    );
    for (const req of pending) {
      await supaReq('PATCH', 'lead_unlock_requests', {
        status: 'approved',
        approved_by: approvedBy,
        resolved_at: new Date().toISOString(),
      }, `?id=eq.${encodeURIComponent(req.id)}`);
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
  getCurrentDateStr() {
    return new Date().toISOString().split('T')[0];
  },

  getCurrentWeekAndYear() {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const weekNumber = Math.ceil(((now - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
    return { week: weekNumber, year: now.getFullYear() };
  },

  isBusinessDay(date) {
    const d = new Date(date);
    return d.getDay() !== 0 && d.getDay() !== 6;
  },
};
