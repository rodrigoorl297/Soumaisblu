/* SOU+BLU — Página Financeiro (boot DOMContentLoaded) */
(function () {
  let _sessionRole = '';

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function fmtMoney(v) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return '—';
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }

  function fmtDt(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR'); } catch { return '—'; }
  }

  function isFinanceiroOnly() {
    if (typeof Auth.isFinanceiroOnly === 'function') return Auth.isFinanceiroOnly();
    return _sessionRole === 'financeiro' || _sessionRole === 'financial';
  }

  function isMasterOrFundador() {
    return _sessionRole === 'master' || _sessionRole === 'fundador';
  }

  function pixRoleHint() {
    if (isMasterOrFundador()) {
      return 'Como Master/Fundador, aprove saques PIX aqui (dupla aprovação com o Financeiro).';
    }
    if (isFinanceiroOnly()) {
      return 'Como Financeiro, aprove saques PIX após a aprovação do Master.';
    }
    return 'Aprovação dupla: Master + Financeiro SOU+BLU.';
  }

  function isPixPending(w) {
    const st = String(w?.status || '').toLowerCase();
    return ['solicitado', 'aprovado_master', 'aprovado_financeiro', 'processando'].includes(st);
  }

  async function loadDashboardData() {
    const [wds, expenses, fiscal] = await Promise.all([
      DB.getWithdrawals().catch(() => []),
      typeof DB.getFinanceExpenses === 'function'
        ? DB.getFinanceExpenses('pendente_master').catch(() => [])
        : Promise.resolve([]),
      typeof DB.getPartnerFiscalRecords === 'function'
        ? DB.getPartnerFiscalRecords().catch(() => [])
        : Promise.resolve([]),
    ]);
    const pixPending = (wds || []).filter(isPixPending);
    const pixValue = pixPending.reduce((s, w) => s + (parseFloat(w.amount) || 0), 0);
    const fiscalPending = (fiscal || []).filter(r =>
      ['enviado', 'aguardando_nf'].includes(String(r.status || '').toLowerCase())
    );
    const expValue = (expenses || []).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    return { pixPending, pixValue, expenses: expenses || [], expValue, fiscalPending };
  }

  function statCard(opts) {
    if (typeof statCardHtml === 'function') return statCardHtml(opts);
    return `<div class="stat-card"><div class="stat-info"><div class="stat-label">${esc(opts.label)}</div><div class="stat-value">${esc(opts.value)}</div></div></div>`;
  }

  function updateSidebarUser(session, user) {
    const name = user?.name || session?.name || 'Usuário';
    const role = String(session?.role || '').toLowerCase();
    const nameEl = document.getElementById('userName');
    const roleEl = document.getElementById('userRole');
    const av = document.getElementById('userAvatar');
    if (nameEl) nameEl.textContent = name;
    if (roleEl) {
      roleEl.textContent = isFinanceiroOnly()
        ? 'Financeiro'
        : (role === 'master' ? 'Master' : role === 'fundador' ? 'Fundador' : role);
    }
    if (av) {
      if (user?.photo_url) {
        av.innerHTML = `<img src="${esc(user.photo_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>`;
      } else {
        av.textContent = name.charAt(0).toUpperCase();
      }
    }
  }

  async function renderDashboard() {
    const kpiRoot = document.getElementById('finDashKpis');
    const alerts = document.getElementById('finDashAlerts');
    const subtitle = document.getElementById('finPageSubtitle');
    if (!kpiRoot) return;

    const data = await loadDashboardData();
    const { pixPending, pixValue, expenses, expValue, fiscalPending } = data;

    const badge = document.getElementById('finPixBadge');
    if (badge) {
      if (pixPending.length > 0) {
        badge.textContent = pixPending.length;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    if (subtitle) {
      const pixLine = pixPending.length
        ? `${pixPending.length} saque(s) PIX aguardando`
        : 'Nenhum saque PIX pendente';
      subtitle.textContent = `${pixLine}. ${pixRoleHint()}`;
    }

    kpiRoot.innerHTML = [
      statCard({
        icon: 'withdrawals',
        color: pixPending.length ? 'orange' : 'green',
        label: 'Saques PIX pendentes',
        value: pixPending.length,
        sub: pixPending.length ? `${fmtMoney(pixValue)} aguardando` : 'Nenhum pendente',
      }),
      statCard({
        icon: 'billing',
        color: 'yellow',
        label: 'Despesas p/ aprovar',
        value: expenses.length,
        sub: expenses.length ? `${fmtMoney(expValue)} total` : 'Nenhuma pendente',
      }),
      statCard({
        icon: 'clients',
        color: 'blue',
        label: 'Fiscal parceiro',
        value: fiscalPending.length,
        sub: fiscalPending.length ? 'Aguardando NF / fechamento' : 'Em dia',
      }),
    ].join('');

    if (!alerts) return;

    if (pixPending.length) {
      const rows = pixPending.slice(0, 6);
      const empCache = {};
      await Promise.all(rows.map(async (w) => {
        if (!empCache[w.employee_id]) {
          empCache[w.employee_id] = await DB.getUser(w.employee_id).catch(() => null);
        }
      }));
      alerts.innerHTML = `<div class="card card-padded" style="margin-bottom:16px;border-left:4px solid #f59e0b;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
          <div>
            <h3 style="font-family:'Nunito',sans-serif;font-weight:800;margin:0 0 4px;">Saques PIX pendentes</h3>
            <p style="margin:0;font-size:13px;color:var(--color-text-muted);">Aprovação Master + Financeiro</p>
          </div>
          <button type="button" class="btn btn-primary btn-sm" onclick="FinanceiroPage.openSection('secWithdrawals')">Gerenciar saques</button>
        </div>
        <div class="table-wrap"><table class="data-table"><thead><tr>
          <th>Funcionário</th><th>Valor</th><th>Status</th><th>Data</th>
        </tr></thead><tbody>
        ${rows.map(w => `<tr>
          <td>${esc(empCache[w.employee_id]?.name || '—')}</td>
          <td>${fmtMoney(w.amount)}</td>
          <td>${esc(w.status || '—')}</td>
          <td>${fmtDt(w.created_at || w.createdAt)}</td>
        </tr>`).join('')}
        </tbody></table></div>
        ${pixPending.length > 6 ? `<p style="margin:10px 0 0;font-size:12px;color:var(--color-text-muted);">+ ${pixPending.length - 6} saque(s) — abra Saque PIX para ver todos.</p>` : ''}
      </div>`;
    } else {
      alerts.innerHTML = `<div class="card card-padded" style="margin-bottom:16px;border-left:4px solid var(--color-success);background:#ecfdf5;">
        <strong style="display:block;">Nenhum saque PIX pendente</strong>
        <span style="font-size:13px;color:var(--color-text-muted);">Todos os saques foram processados ou não há solicitações.</span>
      </div>`;
    }
  }

  async function waitForDb() {
    if (typeof _requireDB === 'function') return _requireDB();
    const deadline = Date.now() + 9000;
    while (Date.now() < deadline) {
      if (window.DB?.init) return window.DB;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error('Scripts da camada de dados não carregaram (js/db.js).');
  }

  const FinanceiroPage = {
    async openSection(section, tab) {
      if (!section) {
        if (window.FinanceiroBoot) FinanceiroBoot.showInicioPanel();
        await renderDashboard();
        return;
      }
      if (window.FinanceiroBoot) await FinanceiroBoot.openSection(section, tab);
    },

    refreshDashboard() {
      return renderDashboard();
    },

    async boot() {
      let redirected = false;
      try {
        const db = await waitForDb();
        await db.init();

        if (!(await Auth.isLoggedIn())) {
          redirected = true;
          window.location.replace(Auth.loginPageHref());
          return;
        }
        await Auth.syncSessionFromDb();
        const session = Auth.getSession();
        if (!session) {
          redirected = true;
          window.location.replace(Auth.loginPageHref());
          return;
        }

        _sessionRole = String(session.role || '').toLowerCase();
        const allowed = ['master', 'fundador', 'financeiro', 'financial'].includes(_sessionRole);
        const user = await DB.getUser(session.id).catch(() => null);
        if (!allowed || user?.partner_root_id) {
          redirected = true;
          window.location.replace(Auth.adminPageHref());
          return;
        }

        const loader = document.getElementById('globalLoader');
        const app = document.getElementById('appLayout');
        if (loader) loader.style.display = 'none';
        if (app) app.style.display = 'flex';

        if (window.FinanceiroBoot) await FinanceiroBoot.init();
        if (window.FinanceiroBoot?.ensureFinanceiroSidebarVisible) {
          FinanceiroBoot.ensureFinanceiroSidebarVisible();
        }

        updateSidebarUser(session, user);

        const urlSec = new URLSearchParams(window.location.search).get('section');
        const urlTab = new URLSearchParams(window.location.search).get('tab');
        if (urlSec) {
          await FinanceiroPage.openSection(urlSec, urlTab || '');
        } else {
          await FinanceiroPage.openSection('');
        }
      } catch (e) {
        console.error('[FinanceiroPage]', e);
        const lt = document.querySelector('.loader-text');
        if (lt) lt.textContent = 'Erro ao carregar. Recarregue a página (Ctrl+F5).';
        showToast('Erro ao carregar o Financeiro. Verifique a conexão.', 'error');
      } finally {
        if (!redirected) {
          const loader = document.getElementById('globalLoader');
          const app = document.getElementById('appLayout');
          if (loader) loader.style.display = 'none';
          if (app) app.style.display = 'flex';
        }
      }
    },
  };

  window.FinanceiroPage = FinanceiroPage;
  document.addEventListener('DOMContentLoaded', () => FinanceiroPage.boot());
  window.addEventListener('pageshow', (ev) => {
    if (!ev.persisted) return;
    FinanceiroPage.boot().catch((e) => console.warn('[FinanceiroPage] pageshow:', e));
  });
})();
