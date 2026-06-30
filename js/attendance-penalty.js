/* Presença: login em dias úteis (seg–sex, exceto feriados). Falta = −20 pts por dia. */

const AttendancePenalty = (() => {
  const TZ = 'America/Sao_Paulo';
  const PENALTY_PTS = 20;
  const WRONG_PENALTY_PTS = 100;
  /** Presença e desconto de −20 pts válidos a partir desta data (após correção). */
  const FEATURE_START = '2026-06-03';
  const CLEANUP_STORAGE_KEY = 'soublu_attendance_full_restore_v4';
  const MAX_LOGIN_DAYS = 120;
  const EXEMPT_ROLES = new Set(['master', 'fundador', 'desenvolvedor', 'parceiro']);

  function brTodayYmd() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  }

  function parseYmd(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    return { y: +m[1], mo: +m[2], d: +m[3] };
  }

  function ymdToDate(ymd) {
    const p = parseYmd(ymd);
    if (!p) return null;
    return new Date(Date.UTC(p.y, p.mo - 1, p.d));
  }

  function formatYmd(d) {
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }

  function addDaysYmd(ymd, delta) {
    const d = ymdToDate(ymd);
    if (!d) return ymd;
    d.setUTCDate(d.getUTCDate() + delta);
    return formatYmd(d);
  }

  function maxYmd(a, b) {
    if (!a) return b || '';
    if (!b) return a || '';
    return a > b ? a : b;
  }

  function weekdayMonFri(ymd) {
    const d = ymdToDate(ymd);
    if (!d) return false;
    const w = d.getUTCDay();
    return w >= 1 && w <= 5;
  }

  function isBusinessDay(ymd) {
    return weekdayMonFri(ymd) && !(typeof BrHolidays !== 'undefined' && BrHolidays.isHoliday(ymd));
  }

  function formatBr(ymd) {
    const p = parseYmd(ymd);
    if (!p) return ymd;
    return `${String(p.d).padStart(2, '0')}/${String(p.mo).padStart(2, '0')}/${p.y}`;
  }

  function isAutoAttendanceFeedback(f) {
    const title = String(f?.title || '');
    const content = String(f?.content || '');
    return /Aus[eê]ncia de login/i.test(title)
      || /Advert[eê]ncia autom[aá]tica/i.test(content)
      || /n[aã]o houve acesso ao sistema/i.test(content)
      || f?.source === 'attendance_auto'
      || f?.auto_attendance === true;
  }

  function _txMeta(tx) {
    try {
      if (tx?.meta && typeof tx.meta === 'object') return tx.meta;
      if (typeof tx?.meta === 'string' && tx.meta.startsWith('{')) return JSON.parse(tx.meta);
    } catch (_) { /* noop */ }
    return {};
  }

  /** Débito ligado à advertência automática de presença (−20 ou −100 indevido). */
  function isAttendancePenaltyDebit(tx) {
    if (!tx || String(tx.type || '').toLowerCase() !== 'debit') return false;
    const reason = String(tx.reason || '');
    if (/Falta de login em dia/i.test(reason)) return true;
    if (/Advert[eê]ncia:\s*Aus[eê]ncia de login/i.test(reason)) return true;
    if (/Advert[eê]ncia autom[aá]tica/i.test(reason)) return true;
    return false;
  }

  function _alreadyRefundedForDebit(allTx, debitId) {
    let sum = 0;
    for (const t of allTx || []) {
      if (String(t.type || '').toLowerCase() !== 'credit') continue;
      const m = _txMeta(t);
      if (String(m.original_tx || '') !== String(debitId)) continue;
      if (m.kind === 'attendance_fix' || m.kind === 'attendance_full_restore') {
        sum += Number(t.amount) || 0;
      }
    }
    return sum;
  }

  function _userEligibleForRestore(u) {
    if (!u?.id || u.active === false) return false;
    if (typeof canSouBluManagePoints === 'function') return canSouBluManagePoints(u);
    if (typeof isUserInPartnerNetworkSync === 'function' && isUserInPartnerNetworkSync(u)) return false;
    if (EXEMPT_ROLES.has(String(u.role || '').trim().toLowerCase())) return false;
    return true;
  }

  function localKey(userId) {
    return `soublu_attendance_${userId}`;
  }

  function readLocal(userId) {
    try {
      const raw = localStorage.getItem(localKey(userId));
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function writeLocal(userId, data) {
    try {
      localStorage.setItem(localKey(userId), JSON.stringify(data));
    } catch (_) { /* noop */ }
  }

  function clearLocal(userId) {
    try { localStorage.removeItem(localKey(userId)); } catch (_) { /* noop */ }
  }

  function normalizeAttendance(user) {
    let raw = user?.attendance_data;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (_) { raw = null; }
    }
    if (!raw || typeof raw !== 'object') raw = {};
    let login_days = Array.isArray(raw.login_days) ? raw.login_days.slice() : [];
    if (!login_days.length && Array.isArray(user?.login_days)) login_days = user.login_days.slice();
    let penalty_through = raw.penalty_through || user?.attendance_penalty_through || null;

    const loc = readLocal(user?.id);
    if (loc) {
      if (Array.isArray(loc.login_days) && loc.login_days.length > login_days.length) {
        login_days = loc.login_days.slice();
      }
      if (loc.penalty_through && (!penalty_through || loc.penalty_through > penalty_through)) {
        penalty_through = loc.penalty_through;
      }
    }

    login_days = [...new Set(login_days.filter((d) => parseYmd(d)))].sort();
    if (login_days.length > MAX_LOGIN_DAYS) login_days = login_days.slice(-MAX_LOGIN_DAYS);
    return { login_days, penalty_through: penalty_through || null };
  }

  async function saveAttendance(userId, att) {
    const payload = {
      attendance_data: {
        login_days: att.login_days,
        penalty_through: att.penalty_through,
        updated_at: new Date().toISOString(),
      },
      login_days: att.login_days,
      attendance_penalty_through: att.penalty_through,
    };
    try {
      await DB.updateUser(userId, payload);
      clearLocal(userId);
      return true;
    } catch (e) {
      console.warn('[Attendance] save remoto falhou, usando localStorage:', e?.message || e);
      writeLocal(userId, att);
      return false;
    }
  }

  function appliesTo(user) {
    if (!user?.id || user.active === false) return false;
    const role = String(user.role || '').trim().toLowerCase();
    if (EXEMPT_ROLES.has(role)) return false;
    if (typeof DB !== 'undefined' && DB._isPartnerWalletUser?.(user)) return false;
    if (typeof window !== 'undefined' && window.__PREVIEW_USER_ID__) return false;
    return true;
  }

  function iterDays(fromYmd, toYmd) {
    const out = [];
    if (!fromYmd || !toYmd || fromYmd > toYmd) return out;
    let cur = fromYmd;
    let guard = 0;
    while (cur <= toYmd && guard < 400) {
      out.push(cur);
      cur = addDaysYmd(cur, 1);
      guard++;
    }
    return out;
  }

  /**
   * @returns {{ deducted: number, days: number, balance: number|null }}
   */
  async function processLogin(user) {
    return { penalties: 0, days: 0 };
    if (!user?.id || !appliesTo(user)) {
      return { deducted: 0, days: 0, balance: null };
    }

    const today = brTodayYmd();
    const yesterday = addDaysYmd(today, -1);
    const created = (user.created_at || '').slice(0, 10);
    const start = maxYmd(FEATURE_START, created || FEATURE_START);

    const att = normalizeAttendance(user);
    const loginSet = new Set(att.login_days);

    let through = att.penalty_through || addDaysYmd(start, -1);
    if (through < addDaysYmd(start, -1)) through = addDaysYmd(start, -1);

    const firstCheck = addDaysYmd(through, 1);
    const missed = [];

    if (yesterday >= firstCheck) {
      for (const day of iterDays(firstCheck, yesterday)) {
        if (!isBusinessDay(day)) continue;
        if (day < start) continue;
        if (!loginSet.has(day)) missed.push(day);
      }
    }

    let deducted = 0;
    let balance = null;

    for (const day of missed) {
      const reason = `Falta de login em dia útil (${formatBr(day)})`;
      const nb = await DB.deductBalance(user.id, PENALTY_PTS, reason, 'sistema');
      if (Number.isFinite(nb)) {
        deducted += PENALTY_PTS;
        balance = nb;
      }
    }

    loginSet.add(today);
    const login_days = [...loginSet].sort();
    const trimmed = login_days.length > MAX_LOGIN_DAYS ? login_days.slice(-MAX_LOGIN_DAYS) : login_days;

    const newThrough = yesterday >= start ? yesterday : through;
    await saveAttendance(user.id, {
      login_days: trimmed,
      penalty_through: newThrough,
    });

    return { deducted, days: missed.length, balance, missed };
  }

  function notify(result) {
    if (!result?.deducted || result.deducted <= 0) return;
    const n = result.days;
    const pts = result.deducted;
    const saldo = Number.isFinite(result.balance)
      ? ` Saldo atual: ${result.balance.toLocaleString('pt-BR')} pts.`
      : '';
    const msg = n === 1
      ? `Você não entrou em 1 dia útil: −${PENALTY_PTS} pts.${saldo}`
      : `Você não entrou em ${n} dias úteis: −${pts} pts no total.${saldo}`;
    if (typeof showToast === 'function') showToast(msg, 'warning', 7000);
  }

  async function onLogin(user) {
    return;
    if (!user?.id || typeof DB === 'undefined') return null;
    try { await runOneTimeCleanup(); } catch (e) { console.warn('[Attendance] cleanup:', e); }
    const today = brTodayYmd();
    const runKey = `soublu_att_run_${user.id}_${today}`;
    try {
      if (sessionStorage.getItem(runKey)) return null;
    } catch (_) { /* noop */ }
    const fresh = await DB.getUser(user.id).catch(() => user);
    const u = fresh || user;
    try {
      const result = await processLogin(u);
      try { sessionStorage.setItem(runKey, '1'); } catch (_) { /* noop */ }
      notify(result);
      return result;
    } catch (e) {
      console.warn('[Attendance] processLogin:', e);
      return null;
    }
  }

  async function _deleteFeedbackEntry(f) {
    const id = f?.id;
    if (!id) return false;
    if (typeof HOSTINGER_CONFIGURED !== 'undefined' && (HOSTINGER_CONFIGURED || SUPABASE_CONFIGURED) && typeof supaReq === 'function') {
      try {
        await supaReq('DELETE', 'feedbacks', null, `?id=eq.${encodeURIComponent(id)}`);
        return true;
      } catch (e) {
        console.warn('[Attendance] delete feedback', id, e?.message || e);
      }
    }
    try {
      const key = 'soublu_feedbacks';
      const list = JSON.parse(localStorage.getItem(key) || '[]').filter((x) => String(x.id) !== String(id));
      localStorage.setItem(key, JSON.stringify(list));
      return true;
    } catch (_) {
      return false;
    }
  }

  async function _resetUserAttendanceState(user) {
    if (!user?.id) return;
    const yesterday = addDaysYmd(brTodayYmd(), -1);
    const att = { login_days: normalizeAttendance(user).login_days, penalty_through: yesterday };
    await saveAttendance(user.id, att);
  }

  /**
   * Remove advertências automáticas de presença, estorna 100% dos descontos indevidos e reinicia contagem a partir de hoje.
   * @param {{ force?: boolean }} opts — force=true ignora flag local (ex.: botão admin).
   */
  async function runOneTimeCleanup(opts) {
    const force = !!(opts && opts.force);
    if (!force) {
      try {
        if (localStorage.getItem(CLEANUP_STORAGE_KEY)) return { skipped: true };
      } catch (_) { /* noop */ }
    }

    let feedbacks = [];
    if (typeof HOSTINGER_CONFIGURED !== 'undefined' && (HOSTINGER_CONFIGURED || SUPABASE_CONFIGURED) && typeof supaReq === 'function') {
      try {
        feedbacks = await supaReq('GET', 'feedbacks', null, '?select=*&order=created_at.desc&limit=500');
      } catch (e) {
        console.warn('[Attendance] load feedbacks:', e?.message || e);
      }
    }
    try {
      const local = JSON.parse(localStorage.getItem('soublu_feedbacks') || '[]');
      const seen = new Set(feedbacks.map((f) => f.id));
      local.forEach((f) => { if (!seen.has(f.id)) feedbacks.push(f); });
    } catch (_) { /* noop */ }

    const autoFb = feedbacks.filter(isAutoAttendanceFeedback);
    let deletedFb = 0;
    for (const f of autoFb) {
      if (await _deleteFeedbackEntry(f)) deletedFb++;
    }

    let refunds = 0;
    let refundPts = 0;
    let usersRestored = 0;
    const users = await DB.getAllUsers().catch(() => []);
    let txs = [];
    if (typeof HOSTINGER_CONFIGURED !== 'undefined' && (HOSTINGER_CONFIGURED || SUPABASE_CONFIGURED) && typeof supaReq === 'function') {
      try {
        txs = await supaReq('GET', 'transactions', null, '?select=*&order=created_at.desc&limit=3000');
      } catch (e) {
        console.warn('[Attendance] load transactions:', e?.message || e);
        txs = await DB.getTransactions().catch(() => []);
      }
    } else {
      txs = await DB.getTransactions().catch(() => []);
    }

    for (const u of users || []) {
      if (!_userEligibleForRestore(u)) continue;
      const userTx = (txs || []).filter((t) => String(t.employee_id) === String(u.id));
      let userGotRefund = false;

      for (const tx of userTx) {
        if (!isAttendancePenaltyDebit(tx)) continue;
        const debited = Number(tx.amount) || 0;
        if (debited <= 0) continue;
        const already = _alreadyRefundedForDebit(userTx, tx.id);
        const refund = Math.round((debited - already) * 100) / 100;
        if (refund <= 0) continue;

        const nb = await DB.addBalance(u.id, refund, 'Estorno integral — advertência automática de presença removida', 'sistema', {
          kind: 'attendance_full_restore',
          original_tx: tx.id,
          refund,
          debited,
        });
        if (Number.isFinite(nb)) {
          refunds++;
          refundPts += refund;
          userGotRefund = true;
          txs = await DB.getTransactions().catch(() => txs);
        }
      }

      if (userGotRefund) usersRestored++;
      await _resetUserAttendanceState(u);
    }

    try { localStorage.setItem(CLEANUP_STORAGE_KEY, new Date().toISOString()); } catch (_) { /* noop */ }

    const summary = { deletedFb, refunds, refundPts, usersRestored, forced: force };
    if ((deletedFb || refunds) && typeof showToast === 'function') {
      const parts = [];
      if (deletedFb) parts.push(`${deletedFb} advertência(s) removida(s)`);
      if (refundPts) parts.push(`${refundPts.toLocaleString('pt-BR')} pts devolvidos (${usersRestored} colaborador(es))`);
      showToast(parts.join(' · ') + '. Saldos restaurados; presença −20 pts/dia só a partir de hoje.', 'success', 10000);
    }
    if (typeof invalidateSouBluCaches === 'function') invalidateSouBluCaches();
    const refreshJobs = [];
    if (typeof renderFeedbackSection === 'function') refreshJobs.push(renderFeedbackSection());
    if (typeof renderEmployeesTable === 'function' && document.getElementById('employeesTbody')) {
      refreshJobs.push(renderEmployeesTable());
    }
    if (typeof renderDashboard === 'function') refreshJobs.push(renderDashboard());
    if (typeof renderMasterPanel === 'function') refreshJobs.push(renderMasterPanel());
    if (typeof renderAdminRanking === 'function' && document.getElementById('adminRankingList')) {
      refreshJobs.push(renderAdminRanking());
    }
    await Promise.allSettled(refreshJobs);
    return summary;
  }

  /** Restaura pontos das advertências automáticas de presença (estorno total). */
  async function restoreAdvertenciaPoints() {
    return runOneTimeCleanup({ force: true });
  }

  return {
    PENALTY_PTS,
    WRONG_PENALTY_PTS,
    FEATURE_START,
    onLogin,
    processLogin,
    appliesTo,
    brTodayYmd,
    isBusinessDay,
    isAutoAttendanceFeedback,
    isAttendancePenaltyDebit,
    runOneTimeCleanup,
    restoreAdvertenciaPoints,
  };
})();

window.restoreAdvertenciaPoints = () => AttendancePenalty.restoreAdvertenciaPoints();
