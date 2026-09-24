/* =============================================
   Dashboard (admin) — números contando + gráfico suave
   Arquivo isolado: não altera admin.js. Sem ele, o dashboard funciona igual (só sem animação).
   ============================================= */
(function () {
  'use strict';

  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DURATION = 700;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const animating = new WeakSet(); // nós cujo texto está sendo escrito pela própria animação

  /**
   * Lê "210", "1.457", "R$ 1.716.914,95", "85%" → { prefix, value, decimals, suffix }.
   * Qualquer outro formato ("28 / 33", "Este Mês") volta null e não é animado.
   */
  function parseNumber(text) {
    const m = /^(\s*(?:R\$\s*)?)(-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?)(\s*%?\s*(?:pts)?\s*)$/.exec(text);
    if (!m) return null;
    const raw = m[2];
    const decimals = raw.includes(',') ? raw.split(',')[1].length : 0;
    const value = Number(raw.replace(/\./g, '').replace(',', '.'));
    if (!isFinite(value) || value === 0) return null;
    return { prefix: m[1], value, decimals, suffix: m[3] };
  }

  function format(n, decimals) {
    return n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  /** Anima o número de 0 até o valor final e termina com o texto EXATO original. */
  function countUp(el) {
    if (el.dataset.dmDone === el.textContent) return;
    const finalText = el.textContent;
    const parsed = parseNumber(finalText);
    if (!parsed) return;
    el.dataset.dmDone = finalText;
    animating.add(el);
    el.classList.add('dm-counting');
    const start = performance.now();
    const step = now => {
      if (!el.isConnected || el.dataset.dmDone !== finalText) { animating.delete(el); return; } // re-render no meio: desiste
      const t = Math.max(0, Math.min(1, (now - start) / DURATION)); // rAF pode trazer "now" < start
      if (t < 1) {
        el.textContent = parsed.prefix + format(parsed.value * easeOut(t), parsed.decimals) + parsed.suffix;
        requestAnimationFrame(step);
      } else {
        el.textContent = finalText;
        el.dataset.dmDone = finalText;
        animating.delete(el);
        el.classList.remove('dm-counting');
      }
    };
    el.textContent = parsed.prefix + format(0, parsed.decimals) + parsed.suffix;
    requestAnimationFrame(step);
  }

  /** Valores dos cards: .stat-value (statCardHtml) e o último <div> do statKpiHtml. */
  function valueNodes(root) {
    const out = [];
    root.querySelectorAll('.stat-card').forEach(card => {
      const v = card.querySelector('.stat-value') || card.lastElementChild;
      if (v && !v.children.length) out.push(v);
    });
    return out;
  }

  function animateCards(root) {
    if (REDUCED || !root) return;
    const sec = document.getElementById('secDashboard');
    if (!sec || !sec.classList.contains('active')) return;
    valueNodes(root).forEach(countUp);
  }

  /** Chart.js: crescimento suave das barras/linha. Só mexe se o gráfico ainda usar o padrão. */
  let chartPatched = false;
  function patchChart() {
    if (chartPatched || !window.Chart || !window.Chart.defaults) return;
    chartPatched = true;
    if (REDUCED) {
      window.Chart.defaults.animation = false;
      return;
    }
    const d = window.Chart.defaults;
    d.animation = Object.assign({}, d.animation, { duration: 900, easing: 'easeOutQuart' });
    if (d.transitions && d.transitions.active) {
      d.transitions.active.animation = Object.assign({}, d.transitions.active.animation, { duration: 250 });
    }
  }

  function init() {
    const sec = document.getElementById('secDashboard');
    if (!sec) return;
    const targets = ['dashStats', 'teamBillingKpis'].map(id => document.getElementById(id)).filter(Boolean);

    // Cards re-renderizados (filtro, período, status) → conta de novo
    let pending = null;
    const mo = new MutationObserver(records => {
      patchChart();
      // Ignora as escritas da própria contagem — senão cada quadro reinicia a animação
      // a partir do valor intermediário e o número final vira lixo (-1, R$ -0,01…).
      if (records.every(r => animating.has(r.target))) return;
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = null;
        targets.forEach(animateCards);
      });
    });
    targets.forEach(t => mo.observe(t, { childList: true, subtree: true }));
    const chartHost = document.getElementById('teamBillingChart');
    if (chartHost) mo.observe(chartHost, { childList: true });

    // Ao abrir a aba Dashboard (a section ganha .active)
    new MutationObserver(() => {
      if (sec.classList.contains('active')) {
        targets.forEach(t => valueNodes(t).forEach(v => { delete v.dataset.dmDone; }));
        targets.forEach(animateCards);
      }
    }).observe(sec, { attributes: true, attributeFilter: ['class'] });

    // Chart.js é carregado sob demanda — aplica o padrão assim que aparecer
    const poll = setInterval(() => {
      patchChart();
      if (chartPatched) clearInterval(poll);
    }, 400);
    setTimeout(() => clearInterval(poll), 120000);

    targets.forEach(animateCards);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
