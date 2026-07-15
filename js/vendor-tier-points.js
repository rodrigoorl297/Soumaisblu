/* Faixas de faturamento (vendedor): soma mensal (dia 1 ao 1), crédito no dia 15, saque 20–30. */

const VendorTierPoints = (() => {
  const TZ = 'America/Sao_Paulo';
  const FEATURE_START = '2026-06';
  const CREDIT_DAY = 15;
  const WITHDRAW_DAY_MIN = 20;
  const WITHDRAW_DAY_MAX = 30;
  const ELIGIBLE_ROLES = new Set(['vendedor']);
  const EXEMPT_ROLES = new Set(['master', 'fundador', 'desenvolvedor', 'parceiro']);

  /** min/max em R$ (inclusive). Acima da última faixa mantém FAIXA18. */
  const TIERS = [
    { id: 1, label: 'FAIXA1', min: 30000, max: 39999.99, points: 450 },
    { id: 2, label: 'FAIXA2', min: 40000, max: 49999.99, points: 800 },
    { id: 3, label: 'FAIXA3', min: 50000, max: 59999.99, points: 1150 },
    { id: 4, label: 'FAIXA4', min: 60000, max: 69999.99, points: 1500 },
    { id: 5, label: 'FAIXA5', min: 70000, max: 79999.99, points: 2000 },
    { id: 6, label: 'FAIXA6', min: 80000, max: 89999.99, points: 2500 },
    { id: 7, label: 'FAIXA7', min: 90000, max: 109999.99, points: 3000 },
    { id: 8, label: 'FAIXA8', min: 110000, max: 129999.99, points: 3500 },
    { id: 9, label: 'FAIXA9', min: 130000, max: 139999.99, points: 4000 },
    { id: 10, label: 'FAIXA10', min: 140000, max: 149999.99, points: 4500 },
    { id: 11, label: 'FAIXA11', min: 150000, max: 159999.99, points: 5100 },
    { id: 12, label: 'FAIXA12', min: 160000, max: 169999.99, points: 5700 },
    { id: 13, label: 'FAIXA13', min: 170000, max: 179999.99, points: 6300 },
    { id: 14, label: 'FAIXA14', min: 180000, max: 189999.99, points: 6900 },
    { id: 15, label: 'FAIXA15', min: 190000, max: 199999.99, points: 7500 },
    { id: 16, label: 'FAIXA16', min: 200000, max: 209999.99, points: 8300 },
    { id: 17, label: 'FAIXA17', min: 210000, max: 219999.99, points: 9100 },
    { id: 18, label: 'FAIXA18', min: 220000, max: Infinity, points: 10000 },
  ];

  function brYmd(d = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
  }

  function brPeriodKey(d = new Date()) {
    return brYmd(d).slice(0, 7);
  }

  function brDayOfMonth(d = new Date()) {
    return parseInt(brYmd(d).slice(8, 10), 10);
  }

  function addMonthsPeriod(periodKey, delta) {
    const [y, m] = String(periodKey || '').split('-').map(Number);
    if (!y || !m) return periodKey;
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  function periodKeysThrough(endKey) {
    const out = [];
    let cur = FEATURE_START;
    let guard = 0;
    while (cur <= endKey && guard < 240) {
      out.push(cur);
      if (cur === endKey) break;
      cur = addMonthsPeriod(cur, 1);
      guard++;
    }
    return out;
  }

  function localKey(userId) {
    return `soublu_vendor_tier_${userId}`;
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

  function normalizeData(user) {
    let raw = user?.vendor_tier_data;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (_) { raw = null; }
    }
    if (!raw || typeof raw !== 'object') raw = {};
    const loc = readLocal(user?.id);
    const periods = { ...(loc?.periods || {}), ...(raw.periods || {}) };
    const credits = { ...(loc?.credits || {}), ...(raw.credits || {}) };
    return {
      periods,
      credits,
      updated_at: raw.updated_at || loc?.updated_at || null,
    };
  }

  async function saveData(userId, data) {
    const payload = {
      vendor_tier_data: {
        periods: data.periods || {},
        credits: data.credits || {},
        updated_at: new Date().toISOString(),
      },
    };
    try {
      await DB.updateUser(userId, payload);
      clearLocal(userId);
      return true;
    } catch (e) {
      console.warn('[VendorTier] save remoto falhou:', e?.message || e);
      writeLocal(userId, payload.vendor_tier_data);
      return false;
    }
  }

  function appliesTo(user) {
    if (!user?.id || user.active === false) return false;
    const role = String(user.role || '').trim().toLowerCase();
    if (EXEMPT_ROLES.has(role)) return false;
    if (!ELIGIBLE_ROLES.has(role)) return false;
    if (typeof DB !== 'undefined' && DB._isPartnerWalletUser?.(user)) return false;
    if (typeof userUsesMoneyWallet === 'function' && userUsesMoneyWallet(user)) return false;
    if (typeof window !== 'undefined' && window.__PREVIEW_USER_ID__) return false;
    return true;
  }

  function _statusNorm(p) {
    return String(p?.statusOp || p?.status_op || p?.status || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim();
  }

  function isPaidProposal(p) {
    if (typeof DB !== 'undefined' && typeof DB.isPaidProposal === 'function') {
      return DB.isPaidProposal(p);
    }
    const s = _statusNorm(p);
    if (s.includes('CANCEL')) return false;
    return s === 'PAGO' || s.includes('PAGO');
  }

  function proposalPeriodKey(p) {
    const raw = p?.paid_at || p?.paidAt || p?.createdAt || p?.created_at;
    if (!raw) return '';
    return brPeriodKey(new Date(raw));
  }

  function tierForSales(total) {
    const t = Number(total) || 0;
    if (t < TIERS[0].min) return null;
    let best = null;
    for (const row of TIERS) {
      if (t >= row.min && t <= row.max) best = row;
    }
    if (!best && t >= TIERS[TIERS.length - 1].min) best = TIERS[TIERS.length - 1];
    return best;
  }

  function fmtSales(v) {
    return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function proposalAmount(p) {
    if (typeof DB !== 'undefined' && typeof DB.proposalAmount === 'function') {
      return DB.proposalAmount(p);
    }
    const v = parseFloat(p?.valor ?? 0);
    if (Number.isFinite(v) && v > 0) return v;
    const vf = parseFloat(p?.valorFinal ?? p?.valor_final ?? 0);
    return Number.isFinite(vf) && vf > 0 ? vf : 0;
  }

  function sumPaidSales(user, proposals, periodKey) {
    let sum = 0;
    let count = 0;
    for (const p of proposals || []) {
      if (!isPaidProposal(p)) continue;
      if (typeof DB._matchProposalToVendor === 'function') {
        if (!DB._matchProposalToVendor(p, user)) continue;
      } else {
        const vid = String(p.vendorId || p.vendor_id || p.employee_id || '');
        if (vid !== String(user.id)) continue;
      }
      if (proposalPeriodKey(p) !== periodKey) continue;
      sum += proposalAmount(p);
      count++;
    }
    return { total: Math.round(sum * 100) / 100, count };
  }

  let _proposalsCache = null;
  let _proposalsCacheAt = 0;

  async function loadPaidProposals() {
    const now = Date.now();
    if (_proposalsCache && now - _proposalsCacheAt < 120000) return _proposalsCache;
    let all = [];
    try {
      all = typeof DB.listProposals === 'function'
        ? await DB.listProposals()
        : [];
    } catch (e) {
      console.warn('[VendorTier] listProposals:', e?.message || e);
    }
    _proposalsCache = (all || []).filter(isPaidProposal);
    _proposalsCacheAt = now;
    return _proposalsCache;
  }

  function usesTierWithdrawRules(user) {
    return appliesTo(user);
  }

  function canWithdrawToday(user) {
    if (user && !usesTierWithdrawRules(user)) return { ok: true };
    const day = brDayOfMonth();
    if (day >= WITHDRAW_DAY_MIN && day <= WITHDRAW_DAY_MAX) return { ok: true };
    return {
      ok: false,
      msg: `Saques liberados apenas do dia ${WITHDRAW_DAY_MIN} ao ${WITHDRAW_DAY_MAX} de cada mês. Hoje é dia ${day}.`,
    };
  }

  function nextCreditLabel() {
    const day = brDayOfMonth();
    const pk = brPeriodKey();
    const prev = addMonthsPeriod(pk, -1);
    if (day >= CREDIT_DAY) {
      return `Próximo crédito: dia ${CREDIT_DAY}/${addMonthsPeriod(pk, 1).replace('-', '/')} (referente a ${pk})`;
    }
    return `Crédito da ${prev.replace('-', '/')} no dia ${CREDIT_DAY}/${pk.replace('-', '/')}`;
  }

  function summaryForUser(user, data, proposals) {
    if (!appliesTo(user)) return null;
    const cur = brPeriodKey();
    const { total, count } = sumPaidSales(user, proposals, cur);
    const tier = tierForSales(total);
    const prev = addMonthsPeriod(cur, -1);
    const prevCredit = data?.credits?.[prev];
    return {
      periodKey: cur,
      salesTotal: total,
      proposalCount: count,
      tier,
      nextCreditText: nextCreditLabel(),
      lastCredited: prevCredit?.credited ? prevCredit : null,
    };
  }

  function renderProfileCard(summary) {
    if (!summary) return '';
    const tierLine = summary.tier
      ? `<strong>${summary.tier.label}</strong> · ${summary.tier.points.toLocaleString('pt-BR')} pts previstos`
      : 'Abaixo da FAIXA1 (mín. R$ 30.000)';
    return `
      <div class="card card-padded" style="margin-top:14px;background:var(--color-surface-2);border:1px solid var(--color-border);">
        <h4 style="font-size:13px;font-weight:800;margin:0 0 8px;color:var(--color-primary);">Faixas de faturamento — ${summary.periodKey.replace('-', '/')}</h4>
        <div style="font-size:13px;line-height:1.55;color:var(--color-text-secondary);">
          <div>Faturamento pago no mês: <strong>${fmtSales(summary.salesTotal)}</strong> (${summary.proposalCount} proposta(s))</div>
          <div>Faixa atual: ${tierLine}</div>
          <div style="margin-top:6px;font-size:12px;color:var(--color-text-muted);">${summary.nextCreditText}</div>
          <div style="font-size:12px;color:var(--color-text-muted);">Saque permitido do dia ${WITHDRAW_DAY_MIN} ao ${WITHDRAW_DAY_MAX}.</div>
        </div>
      </div>`;
  }

  async function syncCurrentPeriod(user, data, proposals) {
    const cur = brPeriodKey();
    const { total, count } = sumPaidSales(user, proposals, cur);
    const tier = tierForSales(total);
    const prev = data.periods[cur] || {};
    const tierId = tier?.id || null;
    const changed = prev.sales_total !== total || prev.tier_id !== tierId;
    data.periods[cur] = {
      sales_total: total,
      proposal_count: count,
      tier_id: tierId,
      tier_label: tier?.label || null,
      points: tier?.points || 0,
      updated_at: new Date().toISOString(),
    };
    return { changed, tier, total };
  }

  async function processCredits(user, data, proposals) {
    const day = brDayOfMonth();
    if (day < CREDIT_DAY) return { credited: 0, points: 0 };

    const cur = brPeriodKey();
    const lastClosed = addMonthsPeriod(cur, -1);
    const keys = periodKeysThrough(lastClosed);
    let credited = 0;
    let pointsSum = 0;

    for (const pk of keys) {
      if (pk < FEATURE_START) continue;
      const existing = data.credits[pk];
      if (existing?.credited) continue;

      const { total, count } = sumPaidSales(user, proposals, pk);
      const tier = tierForSales(total);
      const pts = tier?.points || 0;

      if (pts > 0) {
        const reason = `Faixa ${tier.label} — faturamento ${pk.replace('-', '/')} (${fmtSales(total)})`;
        const nb = await DB.addBalance(user.id, pts, reason, 'sistema', {
          kind: 'vendor_tier',
          period: pk,
          tier_id: tier.id,
          tier_label: tier.label,
          sales_total: total,
        });
        if (!Number.isFinite(nb)) continue;
        credited += 1;
        pointsSum += pts;
        if (typeof showToast === 'function') {
          showToast(`+${pts.toLocaleString('pt-BR')} pts (${tier.label}) creditados — faturamento ${pk.replace('-', '/')}.`, 'success', 8000);
        }
      }

      data.credits[pk] = {
        credited: true,
        points: pts,
        sales_total: total,
        proposal_count: count,
        tier_id: tier?.id || null,
        tier_label: tier?.label || null,
        credited_at: new Date().toISOString(),
      };
    }

    return { credited, points: pointsSum };
  }

  async function onLogin(user) {
    if (!appliesTo(user)) return { synced: false };

    const data = normalizeData(user);
    const proposals = await loadPaidProposals();
    await syncCurrentPeriod(user, data, proposals);
    const creditResult = await processCredits(user, data, proposals);
    await saveData(user.id, data);

    return {
      synced: true,
      ...creditResult,
      summary: summaryForUser(user, data, proposals),
    };
  }

  return {
    TIERS,
    FEATURE_START,
    CREDIT_DAY,
    WITHDRAW_DAY_MIN,
    WITHDRAW_DAY_MAX,
    appliesTo,
    usesTierWithdrawRules,
    canWithdrawToday,
    tierForSales,
    summaryForUser,
    renderProfileCard,
    onLogin,
    loadPaidProposals,
    normalizeData,
  };
})();

window.VendorTierPoints = VendorTierPoints;
