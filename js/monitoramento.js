/* SOU+BLU — Sales & Activity Monitoring (HUD Command Center) */
const Monitoramento = (() => {
  const TZ = 'America/Sao_Paulo';
  const MONTH_GOAL = 500000;
  const PROPOSAL_GOAL = 120;
  let _clockTimer = null;
  let _refreshTimer = null;

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmtMoney(v) {
    const n = Number(v) || 0;
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function fmtMoneyFull(v) {
    const n = Number(v) || 0;
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function proposalDate(p) {
    const raw = p?.created_at || p?.createdAt || p?.updated_at;
    const d = raw ? new Date(raw) : new Date(0);
    return Number.isNaN(d.getTime()) ? new Date(0) : d;
  }

  function proposalAmount(p) {
    if (typeof DB !== 'undefined' && typeof DB.proposalAmount === 'function') {
      return DB.proposalAmount(p);
    }
    return parseFloat(p?.valor_final ?? p?.valorFinal ?? p?.valor ?? 0) || 0;
  }

  function vendorId(p) {
    return String(p?.vendor_id || p?.vendorId || p?.employee_id || '').trim();
  }

  function isPaid(p) {
    const st = String(p?.status || '').toLowerCase();
    const fase = String(p?.status_op || p?.statusOp || '').toLowerCase();
    return st === 'pago' || fase === 'pago';
  }

  function isVendor(u) {
    const r = String(u?.role || '').toLowerCase();
    return r === 'vendedor' || r === 'backoffice';
  }

  async function loadProposals() {
    let rows = [];
    try {
      if (typeof DB.listProposals === 'function') rows = await DB.listProposals();
      else if (typeof DB.getProposals === 'function') rows = await DB.getProposals();
      else if (typeof DB.list === 'function') rows = await DB.list('proposals');
    } catch (e) {
      console.warn('[Monitoramento] propostas:', e);
    }
    return Array.isArray(rows) ? rows : [];
  }

  function monthStart(d = new Date()) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function dayKey(d) {
    return d.toISOString().slice(0, 10);
  }

  function last7DaysSeries(proposals) {
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push({
        date: d,
        key: dayKey(d),
        label: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', timeZone: TZ }),
        count: 0,
        revenue: 0,
      });
    }
    const map = Object.fromEntries(days.map(d => [d.key, d]));
    (proposals || []).forEach(p => {
      const k = dayKey(proposalDate(p));
      if (!map[k]) return;
      map[k].count += 1;
      map[k].revenue += proposalAmount(p);
    });
    return days;
  }

  function renderLineChart(series) {
    const w = 400;
    const h = 100;
    const pad = { l: 8, r: 8, t: 12, b: 8 };
    const maxVal = Math.max(1, ...series.map(d => d.count));
    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;

    const pts = series.map((d, i) => {
      const x = pad.l + (i / Math.max(1, series.length - 1)) * innerW;
      const y = pad.t + innerH - (d.count / maxVal) * innerH;
      return { x, y, ...d };
    });

    const line = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const area = `${pad.l},${pad.t + innerH} ${line} ${pad.l + innerW},${pad.t + innerH}`;

    const gridLines = [0.25, 0.5, 0.75].map(f => {
      const y = pad.t + innerH * (1 - f);
      return `<line x1="${pad.l}" y1="${y}" x2="${pad.l + innerW}" y2="${y}"/>`;
    }).join('');

    const dots = pts.map(p =>
      `<circle class="hud-chart-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4"/>`
    ).join('');

    return `
      <div class="hud-chart-wrap">
        <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="hudChartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.5"/>
              <stop offset="100%" stop-color="#38bdf8" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <g class="hud-chart-grid">${gridLines}</g>
          <polygon class="hud-chart-area" points="${area}"/>
          <polyline class="hud-chart-line" points="${line}"/>
          ${dots}
        </svg>
      </div>
      <div class="hud-chart-labels">
        ${series.map(d => `<span>${esc(d.label)}</span>`).join('')}
      </div>`;
  }

  function renderGauge(pct, caption, sub, variant = 'green') {
    const p = Math.min(100, Math.max(0, pct));
    const r = 70;
    const cx = 100;
    const cy = 95;
    const startAngle = Math.PI;
    const endAngle = 0;
    const totalLen = Math.PI * r;
    const offset = totalLen * (1 - p / 100);

    const arc = (a1, a2) => {
      const x1 = cx + r * Math.cos(a1);
      const y1 = cy + r * Math.sin(a1);
      const x2 = cx + r * Math.cos(a2);
      const y2 = cy + r * Math.sin(a2);
      const large = a2 - a1 > Math.PI ? 1 : 0;
      return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
    };

    return `
      <div class="hud-gauge">
        <svg viewBox="0 0 200 120" aria-hidden="true">
          <path class="hud-gauge__track" d="${arc(startAngle, endAngle)}"/>
          <path class="hud-gauge__value hud-gauge__value--${variant}" d="${arc(startAngle, endAngle)}"
            stroke-dasharray="${totalLen.toFixed(2)}"
            stroke-dashoffset="${offset.toFixed(2)}"/>
          <text class="hud-gauge__pct" x="${cx}" y="${cy - 8}" text-anchor="middle">${Math.round(p)}%</text>
          <text class="hud-gauge__sub" x="${cx}" y="${cy + 14}" text-anchor="middle">${esc(sub)}</text>
        </svg>
        <div class="hud-gauge__caption">${esc(caption)}</div>
      </div>`;
  }

  function activityStatus(lastDate) {
    if (!lastDate || lastDate.getTime() <= 0) {
      return { cls: 'hud-status-dot--idle', label: 'Inativo' };
    }
    const days = (Date.now() - lastDate.getTime()) / 86400000;
    if (days <= 2) return { cls: '', label: 'Ativo' };
    if (days <= 7) return { cls: 'hud-status-dot--warm', label: 'Moderado' };
    return { cls: 'hud-status-dot--idle', label: 'Inativo' };
  }

  function buildMetrics(proposals, users) {
    const now = new Date();
    const mStart = monthStart(now);
    const todayKey = dayKey(now);

    const monthProps = proposals.filter(p => proposalDate(p) >= mStart);
    const todayProps = proposals.filter(p => dayKey(proposalDate(p)) === todayKey);
    const paidMonth = monthProps.filter(isPaid);
    const revenueMonth = monthProps.reduce((s, p) => s + proposalAmount(p), 0);
    const revenueToday = todayProps.reduce((s, p) => s + proposalAmount(p), 0);

    const vendors = (users || []).filter(isVendor);
    const activeVendorIds = new Set();
    const vendorStats = {};

    monthProps.forEach(p => {
      const vid = vendorId(p);
      if (!vid) return;
      activeVendorIds.add(vid);
      if (!vendorStats[vid]) {
        vendorStats[vid] = { count: 0, paid: 0, revenue: 0, last: new Date(0) };
      }
      const s = vendorStats[vid];
      s.count += 1;
      if (isPaid(p)) s.paid += 1;
      s.revenue += proposalAmount(p);
      const d = proposalDate(p);
      if (d > s.last) s.last = d;
    });

    const leaderboard = vendors
      .map(u => {
        const s = vendorStats[u.id] || { count: 0, paid: 0, revenue: 0, last: new Date(0) };
        return { user: u, ...s, status: activityStatus(s.last) };
      })
      .filter(r => r.count > 0)
      .sort((a, b) => b.revenue - a.revenue || b.count - a.count)
      .slice(0, 12);

    const convRate = monthProps.length
      ? Math.round((paidMonth.length / monthProps.length) * 100)
      : 0;

    return {
      revenueMonth,
      revenueToday,
      proposalsMonth: monthProps.length,
      proposalsToday: todayProps.length,
      paidMonth: paidMonth.length,
      activeVendors: activeVendorIds.size,
      totalVendors: vendors.length,
      convRate,
      goalRevenuePct: Math.min(100, (revenueMonth / MONTH_GOAL) * 100),
      goalProposalPct: Math.min(100, (monthProps.length / PROPOSAL_GOAL) * 100),
      series: last7DaysSeries(proposals),
      leaderboard,
    };
  }

  function renderDashboard(metrics) {
    const m = metrics;
    return `
      <div class="hud-status-grid">
        <div class="hud-status-card">
          <div class="hud-status-card__label">Faturamento do mês</div>
          <div class="hud-status-card__value">${fmtMoney(m.revenueMonth)}</div>
          <div class="hud-status-card__delta">Hoje: ${fmtMoneyFull(m.revenueToday)}</div>
        </div>
        <div class="hud-status-card hud-status-card--green">
          <div class="hud-status-card__label">Propostas pagas</div>
          <div class="hud-status-card__value">${m.paidMonth}</div>
          <div class="hud-status-card__delta">Conversão ${m.convRate}%</div>
        </div>
        <div class="hud-status-card">
          <div class="hud-status-card__label">Propostas no mês</div>
          <div class="hud-status-card__value">${m.proposalsMonth}</div>
          <div class="hud-status-card__delta">Hoje: +${m.proposalsToday}</div>
        </div>
        <div class="hud-status-card hud-status-card--green">
          <div class="hud-status-card__label">Vendedores ativos</div>
          <div class="hud-status-card__value">${m.activeVendors}<span style="font-size:14px;color:var(--hud-muted);font-weight:600"> / ${m.totalVendors}</span></div>
          <div class="hud-status-card__delta">Com proposta no mês</div>
        </div>
      </div>

      <div class="hud-charts-row">
        <div class="hud-panel">
          <div class="hud-panel__head">
            <h2 class="hud-panel__title">Atividade · 7 dias</h2>
            <span class="hud-panel__badge">LIVE</span>
          </div>
          ${renderLineChart(m.series)}
        </div>
        <div class="hud-panel">
          <div class="hud-panel__head">
            <h2 class="hud-panel__title">Meta faturamento</h2>
          </div>
          ${renderGauge(m.goalRevenuePct, `Meta ${fmtMoney(MONTH_GOAL)}`, fmtMoney(m.revenueMonth), 'green')}
        </div>
        <div class="hud-panel">
          <div class="hud-panel__head">
            <h2 class="hud-panel__title">Meta propostas</h2>
          </div>
          ${renderGauge(m.goalProposalPct, `Meta ${PROPOSAL_GOAL} propostas`, `${m.proposalsMonth} registradas`, 'blue')}
        </div>
      </div>

      <div class="hud-panel hud-table-panel">
        <div class="hud-panel__head">
          <h2 class="hud-panel__title">Ranking de atividade · vendas</h2>
          <span class="hud-panel__badge">${m.leaderboard.length} no período</span>
        </div>
        <div class="hud-table-wrap">
          <table class="hud-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Vendedor</th>
                <th>Status</th>
                <th>Propostas</th>
                <th>Pagas</th>
                <th>Faturamento</th>
              </tr>
            </thead>
            <tbody>
              ${m.leaderboard.length ? m.leaderboard.map((r, i) => `
                <tr>
                  <td class="hud-table__rank">${String(i + 1).padStart(2, '0')}</td>
                  <td class="hud-table__name">${esc(r.user.name)}<br><small style="color:var(--hud-muted);font-weight:500">${esc(r.user.department || r.user.role || '—')}</small></td>
                  <td><span class="hud-status-dot ${r.status.cls}">${esc(r.status.label)}</span></td>
                  <td>${r.count}</td>
                  <td>${r.paid}</td>
                  <td class="hud-table__money">${fmtMoneyFull(r.revenue)}</td>
                </tr>`).join('') : `<tr><td colspan="6" class="hud-empty">Nenhuma atividade registrada neste mês.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function tickClock() {
    const el = document.getElementById('hudClock');
    if (!el) return;
    el.textContent = new Date().toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function showApp() {
    const loader = document.getElementById('globalLoader');
    const app = document.getElementById('hudApp');
    if (loader) loader.style.display = 'none';
    if (app) app.style.display = 'flex';
  }

  async function render() {
    const root = document.getElementById('hudRoot');
    if (!root) return;
    root.innerHTML = '<div class="hud-empty">Sincronizando dados...</div>';

    const [proposals, users] = await Promise.all([
      loadProposals(),
      DB.getAllUsers().catch(() => []),
    ]);

    const metrics = buildMetrics(proposals, users);
    root.innerHTML = renderDashboard(metrics);
  }

  function canAccess() {
    const s = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    if (!s) return false;
    const r = String(s.role || '').toLowerCase();
    return ['master', 'fundador', 'gerente', 'gerencia', 'admin', 'diretoria', 'rh', 'supervisor', 'financeiro', 'financial', 'desenvolvedor'].includes(r);
  }

  function navigateBack() {
    const href = typeof Auth !== 'undefined' && Auth.adminPageHrefFresh
      ? Auth.adminPageHrefFresh()
      : (typeof Auth !== 'undefined' && Auth.adminPageHref ? Auth.adminPageHref() : 'admin.html');
    window.location.replace(href);
  }

  async function boot() {
    try {
      await DB.init();
      await Auth.requireLogin();
      if (!canAccess()) {
        window.location.replace(typeof Auth.adminPageHref === 'function' ? Auth.adminPageHref() : 'pages/admin.html');
        return;
      }
      showApp();
      tickClock();
      if (_clockTimer) clearInterval(_clockTimer);
      _clockTimer = setInterval(tickClock, 1000);
      await render();
      if (_refreshTimer) clearInterval(_refreshTimer);
      _refreshTimer = setInterval(() => {
        if (!document.hidden) render().catch(() => {});
      }, 60000);
    } catch (e) {
      if (e?.message === 'AUTH_REDIRECT') return;
      console.error('[Monitoramento]', e);
      showApp();
      const root = document.getElementById('hudRoot');
      if (root) root.innerHTML = `<div class="hud-empty">Erro ao carregar: ${esc(e.message || e)}</div>`;
    }
  }

  window.addEventListener('pagehide', () => {
    if (_clockTimer) clearInterval(_clockTimer);
    if (_refreshTimer) clearInterval(_refreshTimer);
  });

  return { boot, refresh: render, navigateBack, canAccess };
})();

window.Monitoramento = Monitoramento;
document.addEventListener('DOMContentLoaded', () => Monitoramento.boot());
