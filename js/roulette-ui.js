/* =============================================
   SOU + BLU – Roleta Premiada (seção dedicada)
   Visível para todos os perfis em employee + admin
   ============================================= */

const RouletteUI = (() => {
  const SECTION_ID = 'secRoleta';

  function _isEnabled() {
    const c = window.SOUBLU_CONFIG || {};
    return c.ROULETTE_ENABLED !== false;
  }

  function _hideRouletteUi() {
    const nav = document.getElementById('navRoleta');
    const sec = document.getElementById(SECTION_ID);
    const panel = document.getElementById('roulettePanel');
    if (nav) nav.style.display = 'none';
    if (sec) {
      sec.style.display = 'none';
      sec.classList.remove('active');
    }
    if (panel) panel.remove();
  }

  function _fmtCurrency(n, user) {
    return typeof formatCurrency === 'function'
      ? formatCurrency(n, user)
      : `+${Number(n || 0).toLocaleString('pt-BR')} pts`;
  }

  function _fmtDateTime(iso) {
    if (typeof formatDateTime === 'function') return formatDateTime(iso);
    try {
      return new Date(iso).toLocaleString('pt-BR');
    } catch (_) {
      return String(iso || '–');
    }
  }

  function _ensureStyles() {
    if (document.getElementById('rouletteCssLink')) return;
    const link = document.createElement('link');
    link.id = 'rouletteCssLink';
    link.rel = 'stylesheet';
    link.href = (typeof resolveAssetHref === 'function')
      ? resolveAssetHref('css/roulette.css')
      : '../css/roulette.css';
    document.head.appendChild(link);
  }

  function ensureRouletteDOM() {
    if (!_isEnabled()) {
      _hideRouletteUi();
      return;
    }
    _ensureStyles();
    if (!document.getElementById('navRoleta')) {
      const nav = document.querySelector('.sidebar-nav');
      const anchor = nav?.querySelector('[data-section="secProfile"], [data-section="secMyProfile"]');
      if (nav && anchor) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'navRoleta';
        btn.className = 'nav-item';
        btn.dataset.section = SECTION_ID;
        btn.innerHTML = `${navIconHtml('roulette')}<span class="nav-label">Roleta</span>`;
        nav.insertBefore(btn, anchor);
      }
    }
    if (!document.getElementById(SECTION_ID)) {
      const refSec = document.getElementById('secProfile') || document.getElementById('secMyProfile') || document.querySelector('.section');
      const main = refSec?.parentElement || document.querySelector('.page-content') || document.getElementById('mainArea');
      if (!main) return;
      const sec = document.createElement('section');
      sec.id = SECTION_ID;
      sec.className = 'section';
      sec.innerHTML = `
        <div class="page-header">
          <div>
            <h2 class="page-title">Roleta Premiada</h2>
            <p class="page-subtitle">Gire com moedas e ganhe pontos no seu saldo</p>
          </div>
        </div>
        <div id="roulettePageRoot" class="roulette-page"></div>`;
      main.appendChild(sec);
    }
  }

  function _rulesForUser(user) {
    if (!user || typeof DB?.getRouletteRulesForUser !== 'function') {
      return { departmentLabel: 'Geral', intro: '', rules: [] };
    }
    return DB.getRouletteRulesForUser(user);
  }

  async function updateRouletteVisibility(user) {
    if (!_isEnabled()) {
      _hideRouletteUi();
      return false;
    }
    const u = user || (typeof currentUser !== 'undefined' ? currentUser : null)
      || (typeof Auth !== 'undefined' ? await Auth.getCurrentUser().catch(() => null) : null);
    const can = u?.id && typeof DB?.canAccessRoulette === 'function'
      ? await DB.canAccessRoulette(u)
      : true;
    const nav = document.getElementById('navRoleta');
    const sec = document.getElementById(SECTION_ID);
    const panel = document.getElementById('roulettePanel');
    if (nav) nav.style.display = can ? '' : 'none';
    if (sec && !can) sec.classList.remove('active');
    if (panel && !can) panel.remove();
    return can;
  }

  function _wheelSegments() {
    if (typeof DB?.rouletteWheelSegments === 'function') {
      return DB.rouletteWheelSegments();
    }
    return [];
  }

  function _polar(cx, cy, r, deg) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function _escapeSvgText(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _radialTextRotation(midDeg) {
    const a = ((midDeg % 360) + 360) % 360;
    let rot = a - 90;
    if (a > 90 && a < 270) rot += 180;
    return rot;
  }

  function _wheelLabelLines(label) {
    const name = String(label || '').trim();
    if (!name || name.length <= 14) return [name || ''];
    const words = name.split(/\s+/);
    const lines = [];
    let line = '';
    words.forEach((w) => {
      const next = line ? `${line} ${w}` : w;
      if (next.length > 12 && line) {
        lines.push(line);
        line = w;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    return lines.slice(0, 2);
  }

  let confettiAnim = null;
  let kickSpinRaf = null;
  let kickSpinLastTs = 0;

  function _ensureConfettiCanvas() {
    let canvas = document.getElementById('rouletteConfettiCanvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'rouletteConfettiCanvas';
      canvas.className = 'roulette-confetti-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.appendChild(canvas);
    }
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    return canvas;
  }

  function _launchConfetti() {
    const canvas = _ensureConfettiCanvas();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const wheel = document.querySelector('.roulette-wheel-outer');
    const rect = wheel ? wheel.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const colors = ['#256eb0', '#ffd60a', '#ffffff', '#1c5f9a', '#4cc9f0', '#0a2d52', '#ffb347'];
    const particles = Array.from({ length: 220 }, () => ({
      x: cx + (Math.random() - 0.5) * 120,
      y: cy + (Math.random() - 0.5) * 60,
      vx: (Math.random() - 0.5) * 18,
      vy: -(Math.random() * 16 + 6),
      g: 0.22 + Math.random() * 0.28,
      w: 5 + Math.random() * 7,
      h: 8 + Math.random() * 8,
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 16,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 0.9 + Math.random() * 0.1,
    }));
    let frame = 0;
    if (confettiAnim) cancelAnimationFrame(confettiAnim);
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.vy += p.g;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life -= 0.005;
        if (p.life <= 0) return;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      frame += 1;
      if (frame < 260 && particles.some((p) => p.life > 0 && p.y < canvas.height + 40)) {
        confettiAnim = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        confettiAnim = null;
      }
    };
    tick();
  }

  function _hideWinOverlay() {
    const el = document.getElementById('rouletteWinOverlay');
    if (el) {
      el.classList.remove('is-visible');
      el.setAttribute('hidden', '');
    }
  }

  function _showWinOverlay(reward, newBalance, user) {
    const el = document.getElementById('rouletteWinOverlay');
    const amt = document.getElementById('rouletteWinAmount');
    const bal = document.getElementById('rouletteWinBalance');
    if (!el || !amt) return;
    amt.textContent = _fmtCurrency(reward, user);
    if (bal) {
      bal.textContent = newBalance != null ? `Novo saldo: ${_fmtCurrency(newBalance, user)}` : '';
    }
    el.removeAttribute('hidden');
    requestAnimationFrame(() => el.classList.add('is-visible'));
    _launchConfetti();
  }

  function dismissWinOverlay() {
    _hideWinOverlay();
  }

  function _spinLayerEl() {
    return document.getElementById('rouletteWheelSpinLayer') || document.getElementById('rouletteWheel');
  }

  function _applySpinTransform(el, deg) {
    if (!el) return;
    el.style.transform = `rotate(${deg}deg)`;
  }

  function _pieSlice(cx, cy, r, startDeg, endDeg) {
    const s = _polar(cx, cy, r, startDeg);
    const e = _polar(cx, cy, r, endDeg);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${cx.toFixed(2)} ${cy.toFixed(2)} L ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)} Z`;
  }

  function _buildWheelSvgMarkup(segments) {
    const cx = 200;
    const cy = 200;
    const r = 196;
    const n = segments.length || 1;
    const step = 360 / n;
    let slices = '';
    let labels = '';
    segments.forEach((seg, i) => {
      const start = i * step;
      const end = (i + 1) * step;
      const midDeg = start + step / 2;
      slices += `<path class="roulette-slice" d="${_pieSlice(cx, cy, r, start, end)}" fill="${seg.color}" stroke="#fff" stroke-width="2.5"/>`;
      const labelR = r * 0.6;
      const pos = _polar(cx, cy, labelR, midDeg);
      const lines = _wheelLabelLines(seg.label || seg.wheelLabel);
      const rot = _radialTextRotation(midDeg);
      const fs = lines.some((l) => l.length > 10) ? 11 : 13;
      const lh = fs + 3;
      const blockH = (lines.length - 1) * lh;
      const anchorY = pos.y - blockH / 2;
      const tspans = lines.map((ln, li) => {
        const dy = li === 0 ? 0 : lh;
        return `<tspan x="${pos.x.toFixed(1)}" dy="${dy}">${_escapeSvgText(ln)}</tspan>`;
      }).join('');
      labels += `<text class="roulette-slice-text" fill="${seg.textFill || '#fff'}" font-size="${fs}" x="${pos.x.toFixed(1)}" y="${anchorY.toFixed(1)}" transform="rotate(${rot.toFixed(2)} ${pos.x.toFixed(1)} ${pos.y.toFixed(1)})" text-anchor="middle">${tspans}</text>`;
    });
    return `<svg class="roulette-wheel-svg" viewBox="0 0 400 400" role="img" aria-label="Roleta premiada">
      <g id="rouletteWheelDisc">${slices}${labels}</g>
    </svg>`;
  }

  function _bindWheelTap() {
    const tap = document.getElementById('rouletteTapSpin');
    if (!tap || tap.dataset.bound) return;
    tap.dataset.bound = '1';
    tap.addEventListener('click', (e) => {
      e.preventDefault();
      spin();
    });
  }

  function _paintWheel(segments) {
    const el = document.getElementById('rouletteWheel');
    if (!el || !segments?.length) return;
    el.innerHTML = _buildWheelSvgMarkup(segments);
    _setWheelRotation(wheelBaseRotation, false);
    _bindWheelTap();
  }

  function _buildWheelHtml(unlimited = false) {
    return `
      <div class="roulette-wheel-card">
        <div class="roulette-wheel-wrap" id="rouletteWheelWrap">
          <div class="roulette-spin-status" id="rouletteSpinStatus">Girando...</div>
          <div class="roulette-wheel-stage">
            <div class="roulette-wheel-pointer-side" aria-hidden="true"></div>
            <div class="roulette-wheel-outer">
              <div id="rouletteWheelSpinLayer" class="roulette-wheel-spin-layer">
                <div id="rouletteWheel" class="roulette-wheel"></div>
              </div>
              <button type="button" class="roulette-wheel-hub" id="rouletteTapSpin" aria-label="Toque para girar a roleta">
                <span class="roulette-wheel-hub__text">Toque para girar</span>
              </button>
              <div id="rouletteWinOverlay" class="roulette-win-overlay" hidden>
                <div class="roulette-win-overlay__card">
                  <div class="roulette-win-overlay__emoji">🎉</div>
                  <div class="roulette-win-overlay__title">Você ganhou!</div>
                  <div class="roulette-win-overlay__amount" id="rouletteWinAmount">+0 pts</div>
                  <div class="roulette-win-overlay__balance" id="rouletteWinBalance"></div>
                  <button type="button" class="btn btn-primary btn-sm" onclick="RouletteUI.dismissWinOverlay()">Continuar</button>
                </div>
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-primary btn-full" id="rouletteSpinBtn" onclick="RouletteUI.spin()">
            ${unlimited ? 'Girar agora (modo ilimitado)' : 'Girar roleta — 1 moeda'}
          </button>
        </div>
      </div>`;
  }

  function _prizesPanelHtml() {
    const segs = _wheelSegments();
    if (!segs.length) return '';
    const rows = segs.map((s) => `
      <tr>
        <td><span class="roulette-wheel-legend__dot" style="background:${s.color};vertical-align:middle;display:inline-block;"></span> ${s.label}</td>
        <td><strong>${s.probability || '—'}</strong></td>
      </tr>`).join('');
    return `
      <table class="roulette-prizes-table">
        <thead><tr><th>Prêmio</th><th>Chance</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="roulette-wheel-equal-note">As 4 fatias têm o mesmo tamanho na roleta; o sorteio usa as probabilidades acima.</p>`;
  }

  function _rulesCardsHtml(rules) {
    if (!rules.length) {
      return '<p class="text-muted">Nenhuma regra de moedas configurada para seu departamento. Fale com a gestão.</p>';
    }
    return `<div class="roulette-rules-grid">${rules.map((r) => `
      <article class="roulette-rule-card">
        <div class="roulette-rule-card__coins">+${r.coins}</div>
        <div class="roulette-rule-card__title">${r.label}</div>
        <div class="roulette-rule-card__desc">${r.description}</div>
        <div class="roulette-rule-card__period">${r.periodLabel || ''}</div>
      </article>`).join('')}</div>`;
  }

  function _setSpinBusy(busy, message = 'Girando...') {
    const wrap = document.getElementById('rouletteWheelWrap');
    const status = document.getElementById('rouletteSpinStatus');
    if (wrap) wrap.classList.toggle('is-busy', !!busy);
    if (status && message) status.textContent = message;
  }

  function _showPrizeResult(reward, newBalance, user) {
    const ptsNum = Number(reward || 0);
    const last = document.getElementById('rouletteLastPrize');
    if (last) last.textContent = `+${ptsNum.toLocaleString('pt-BR')} pts`;
    _showWinOverlay(ptsNum, newBalance, user);
  }

  function _hidePrizeResult() {
    _hideWinOverlay();
  }

  function _animateWheelTo(targetDeg, durationMs = 4500) {
    return new Promise((resolve) => {
      const layer = _spinLayerEl();
      if (!layer) {
        wheelBaseRotation = targetDeg;
        resolve();
        return;
      }
      layer.classList.remove('is-spinning');
      layer.style.transition = 'none';
      _applySpinTransform(layer, wheelBaseRotation);
      void layer.offsetHeight;
      const easing = 'cubic-bezier(0.12, 0.85, 0.18, 1)';
      layer.style.transition = `transform ${durationMs}ms ${easing}`;
      layer.classList.add('is-spinning');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          _applySpinTransform(layer, targetDeg);
        });
      });
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        layer.removeEventListener('transitionend', onEnd);
        clearTimeout(fallback);
        wheelBaseRotation = targetDeg;
        layer.classList.remove('is-spinning');
        layer.style.transition = 'none';
        resolve();
      };
      const onEnd = (e) => {
        if (e.target === layer && e.propertyName === 'transform') finish();
      };
      layer.addEventListener('transitionend', onEnd);
      const fallback = setTimeout(finish, durationMs + 200);
    });
  }

  function _startKickSpin() {
    const layer = _spinLayerEl();
    if (!layer) return;
    layer.classList.remove('is-spinning');
    layer.style.transition = 'none';
    _applySpinTransform(layer, wheelBaseRotation);
    kickSpinLastTs = performance.now();
    const step = (ts) => {
      const dt = Math.min(32, ts - kickSpinLastTs);
      kickSpinLastTs = ts;
      wheelBaseRotation += dt * 0.75;
      _applySpinTransform(layer, wheelBaseRotation);
      kickSpinRaf = requestAnimationFrame(step);
    };
    kickSpinRaf = requestAnimationFrame(step);
    const hubTxt = document.querySelector('.roulette-wheel-hub__text');
    if (hubTxt) hubTxt.textContent = 'Girando...';
  }

  function _stopKickSpin() {
    if (kickSpinRaf) cancelAnimationFrame(kickSpinRaf);
    kickSpinRaf = null;
    const layer = _spinLayerEl();
    if (layer) {
      layer.style.transition = 'none';
      _applySpinTransform(layer, wheelBaseRotation);
    }
    const hubTxt = document.querySelector('.roulette-wheel-hub__text');
    if (hubTxt) hubTxt.textContent = 'Toque para girar';
  }

  function _setWheelRotation(deg, animate) {
    const layer = _spinLayerEl();
    if (!layer) return Promise.resolve();
    if (animate) {
      return _animateWheelTo(deg);
    }
    layer.classList.remove('is-spinning');
    layer.style.transition = 'none';
    _applySpinTransform(layer, deg);
    wheelBaseRotation = deg;
    return Promise.resolve();
  }

  let wheelSegmentsForDisplay = [];
  let wheelBaseRotation = 0;

  async function renderRoulettePage() {
    if (!_isEnabled()) {
      _hideRouletteUi();
      return;
    }
    ensureRouletteDOM();
    const root = document.getElementById('roulettePageRoot');
    if (!root || typeof DB?.getRouletteCoinsBalance !== 'function') return;

    const user = typeof resolveEmployeeUser === 'function'
      ? await resolveEmployeeUser()
      : (currentUser || await Auth.getCurrentUser());
    if (!user?.id) {
      root.innerHTML = '<p class="text-muted">Faça login para usar a roleta.</p>';
      return;
    }
    if (typeof currentUser !== 'undefined') currentUser = user;

    const canUse = typeof DB.canAccessRoulette === 'function'
      ? await DB.canAccessRoulette(user)
      : true;
    await updateRouletteVisibility(user);
    if (!canUse) {
      const blockedPack = _rulesForUser(user);
      const role = String(user.role || '').toLowerCase();
      let blockedMsg = blockedPack.intro
        || 'Seu perfil não participa da roleta premiada. Vendedores precisam estar vinculados a um supervisor de vendas.';
      if (['vendedor', 'employee'].includes(role) && user.admin_id && (blockedPack.rules || []).length) {
        blockedMsg = 'Você não está vinculado a um supervisor de vendas válido. A roleta premiada não está disponível para o seu perfil.';
      }
      root.innerHTML = `
        <div class="card card-padded" style="max-width:640px;margin:0 auto;text-align:center;">
          <h3 style="margin:0 0 12px;">Roleta não disponível</h3>
          <p class="text-muted" style="margin:0;font-size:14px;line-height:1.5;">${blockedMsg}</p>
        </div>`;
      return;
    }

    if (typeof _cacheDel === 'function') _cacheDel('transactions');
    const [coins, txs] = await Promise.all([
      DB.getRouletteCoinsBalance(user.id).catch(() => 0),
      DB.getTransactions(user.id).catch(() => []),
    ]);
    const canGrantTest = typeof Auth !== 'undefined' && Auth.isMaster && Auth.isMaster();
    const unlimited = typeof DB.rouletteUnlimitedCoins === 'function' && DB.rouletteUnlimitedCoins();
    const coinsLabel = typeof DB.formatRouletteCoinsDisplay === 'function'
      ? DB.formatRouletteCoinsDisplay(coins)
      : Number(coins).toLocaleString('pt-BR');
    wheelSegmentsForDisplay = _wheelSegments();
    const walletBal = typeof userWalletBalance === 'function'
      ? userWalletBalance(user)
      : (user.points ?? user.balance ?? 0);
    const rulesPack = _rulesForUser(user);
    const rules = rulesPack.rules || [];

    const spinHistory = (txs || [])
      .filter((t) => {
        const meta = typeof t.meta === 'string' ? (() => { try { return JSON.parse(t.meta); } catch { return null; } })() : t.meta;
        const r = String(t.reason || '');
        return meta?.kind === 'roleta_premiada' || meta?.kind === 'roleta_giro_custo' || meta?.kind === 'roleta_moeda_credit'
          || /\[ROULETTE_COIN\]|\[ROULETTE_SPIN\]|roleta premiada|giro da roleta/i.test(r);
      })
      .slice(0, 15);

    root.innerHTML = `
      <div class="roulette-hero-banner">
        <div>
          <h3>Roleta Premiada SOU+BLU</h3>
          <p>${rulesPack.intro || 'Ganhe moedas com as metas do seu departamento e troque por pontos na roleta.'}</p>
        </div>
        <div class="roulette-dept-badge">
          <span>Departamento:</span>
          <strong>${rulesPack.departmentLabel}</strong>
        </div>
      </div>

      <div class="roulette-page__hero">
        ${_buildWheelHtml(unlimited)}
        <div class="roulette-stats-panel">
          <div class="roulette-stats">
            <div class="roulette-stat roulette-stat--highlight">
              <div class="roulette-stat__label">Moedas disponíveis</div>
              <div class="roulette-stat__value" id="rouletteCoinsDisplay">${coinsLabel}</div>
              ${unlimited ? '<div class="roulette-stat__hint roulette-stat__hint--ok">Modo ilimitado ativo</div>' : '<div class="roulette-stat__hint">1 moeda = 1 giro</div>'}
            </div>
            <div class="roulette-stat">
              <div class="roulette-stat__label">Saldo de pontos</div>
              <div class="roulette-stat__value" id="rouletteWalletBalance">${_fmtCurrency(walletBal, user)}</div>
            </div>
            <div class="roulette-stat">
              <div class="roulette-stat__label">Último prêmio</div>
              <div class="roulette-stat__value" id="rouletteLastPrize">—</div>
            </div>
          </div>
          ${canGrantTest ? `<div class="roulette-admin-tools">
            <div class="roulette-section-title" style="font-size:14px;margin-bottom:10px;">Ferramentas Master (teste)</div>
            <label class="roulette-admin-tools__label">
              <input type="checkbox" id="rouletteUnlimitedToggle" ${unlimited ? 'checked' : ''} onchange="RouletteUI.setUnlimitedMode(this.checked)"/>
              Modo ilimitado
            </label>
            <div class="roulette-admin-tools__actions">
              <button type="button" class="btn btn-outline btn-sm" onclick="RouletteUI.grantTestCoins(10, false)">+10 moedas (eu)</button>
              <button type="button" class="btn btn-outline btn-sm" onclick="RouletteUI.grantTestCoins(10, true)">+10 moedas (todos)</button>
              <button type="button" class="btn btn-outline btn-sm" style="border-color:#f59e0b;color:#b45309;" onclick="RouletteUI.resetRouletteCampaign()">Zerar roleta (pontos + moedas)</button>
            </div>
          </div>` : ''}
        </div>
      </div>

      <div class="card card-padded">
        <h4 class="roulette-section-title">Prêmios da roleta</h4>
        <p style="font-size:13px;color:var(--color-text-muted);margin:-6px 0 12px;">Probabilidades oficiais de cada sorteio.</p>
        ${_prizesPanelHtml()}
      </div>

      <div class="card card-padded">
        <h4 class="roulette-section-title">Como ganhar moedas — ${rulesPack.departmentLabel}</h4>
        <p style="font-size:13px;color:var(--color-text-muted);margin:-6px 0 16px;">Regras do seu departamento. Cada ação concede moedas automaticamente quando validada pelo sistema.</p>
        ${_rulesCardsHtml(rules)}
      </div>

      <div class="card card-padded">
        <h4 class="roulette-section-title">Histórico</h4>
        <div class="roulette-history" id="rouletteHistoryList">
          ${spinHistory.length
            ? spinHistory.map((t) => {
              const meta = typeof t.meta === 'string' ? (() => { try { return JSON.parse(t.meta); } catch { return {}; } })() : (t.meta || {});
              const kind = meta.kind || '';
              let detail = t.reason || '–';
              if (kind === 'roleta_premiada' || /roleta premiada/i.test(detail)) detail = `Prêmio: +${meta.reward_points || t.amount} pts`;
              if (kind === 'roleta_giro_custo' || /\[ROULETTE_SPIN\]/i.test(detail)) detail = 'Giro (−1 moeda)';
              if (kind === 'roleta_moeda_credit' || /\[ROULETTE_COIN\]/i.test(detail)) detail = `Moeda ganha (+${meta.coins || t.amount})`;
              const sign = t.type === 'credit' ? '+' : '−';
              return `<div class="roulette-history-item"><div><strong>${detail}</strong><div style="font-size:11px;color:var(--color-text-muted);">${_fmtDateTime(t.created_at || t.date)}</div></div><span>${sign}${Number(t.amount || 0).toLocaleString('pt-BR')}</span></div>`;
            }).join('')
            : '<p class="text-muted" style="padding:12px 0;">Nenhuma movimentação de roleta ainda.</p>'}
        </div>
      </div>`;

    const spinBtn = document.getElementById('rouletteSpinBtn');
    const tapBtn = document.getElementById('rouletteTapSpin');
    const canSpinNow = unlimited || coins >= 1;
    if (spinBtn) spinBtn.disabled = !canSpinNow;
    if (tapBtn) {
      tapBtn.disabled = !canSpinNow;
      tapBtn.classList.toggle('roulette-wheel-hub--disabled', !canSpinNow);
    }
    _setWheelRotation(wheelBaseRotation, false);
    requestAnimationFrame(() => {
      _paintWheel(wheelSegmentsForDisplay);
    });
    const sec = document.getElementById(SECTION_ID);
    const sub = sec?.querySelector('.page-subtitle');
    if (sub) sub.textContent = 'Gire com moedas e ganhe pontos no seu saldo';
    const title = sec?.querySelector('.page-title');
    if (title) title.textContent = 'Roleta';
  }

  async function spin() {
    if (typeof hideLoading === 'function') hideLoading();

    const user = typeof resolveEmployeeUser === 'function'
      ? await resolveEmployeeUser()
      : (currentUser || await Auth.getCurrentUser());
    if (!user?.id) return;

    if (typeof DB.canAccessRoulette === 'function' && !(await DB.canAccessRoulette(user))) {
      showToast('Roleta não disponível para o seu perfil.', 'warning');
      return;
    }

    const unlimited = typeof DB.rouletteUnlimitedCoins === 'function' && DB.rouletteUnlimitedCoins();
    const coins = await DB.getRouletteCoinsBalance(user.id).catch(() => 0);
    if (!unlimited && coins < 1) {
      showToast('Você precisa de pelo menos 1 moeda para girar.', 'warning');
      return;
    }

    const segments = _wheelSegments();
    if (!segments.length) {
      showToast('Roleta não configurada.', 'error');
      return;
    }

    const spinBtn = document.getElementById('rouletteSpinBtn');
    const tapBtn = document.getElementById('rouletteTapSpin');
    if (spinBtn) spinBtn.disabled = true;
    if (tapBtn) tapBtn.disabled = true;
    _hidePrizeResult();
    _setSpinBusy(true, 'Girando...');
    _startKickSpin();

    let reward = 0;
    let newBalance = null;

    try {
      const r = await DB.applyRouletteSpin(user.id, { origem: 'sec_roleta' }, { consume_coin: true });
      _stopKickSpin();
      if (!r?.ok) {
        showToast(r?.msg || 'Não foi possível girar a roleta.', 'warning');
        if (typeof _cacheDel === 'function') _cacheDel('transactions');
        const coinsElFail = document.getElementById('rouletteCoinsDisplay');
        if (coinsElFail && typeof DB.formatRouletteCoinsDisplay === 'function') {
          const refreshed = await DB.getRouletteCoinsBalance(user.id).catch(() => coins);
          coinsElFail.textContent = DB.formatRouletteCoinsDisplay(refreshed);
        }
        return;
      }

      reward = Number(r.reward_points || 0);
      newBalance = r.new_balance;
      const prizeLabel = r.reward_label || '';

      const drawRef = { id: r.reward_segment_id, points: reward };
      const segIndex = typeof DB.rouletteSegmentIndexForDraw === 'function'
        ? DB.rouletteSegmentIndexForDraw(drawRef)
        : segments.findIndex((s) => !s.joke && s.points === reward);
      const target = typeof DB.rouletteRotationForSegment === 'function'
        ? DB.rouletteRotationForSegment(segIndex >= 0 ? segIndex : 0, wheelBaseRotation)
        : wheelBaseRotation + 2160;

      await _animateWheelTo(target, 4500);

      const fresh = await DB.getUser(user.id).catch(() => null);
      if (fresh) {
        currentUser = fresh;
        newBalance = typeof userWalletBalance === 'function'
          ? userWalletBalance(fresh)
          : (fresh.points ?? fresh.balance ?? newBalance);
      }

      _showPrizeResult(reward, newBalance, fresh || user);
      showToast(`Prêmio: +${reward.toLocaleString('pt-BR')} pontos${prizeLabel ? ` (${prizeLabel})` : ''}!`, 'success', 6000);

      if (typeof _cacheDel === 'function') _cacheDel('transactions');
      const coinsEl = document.getElementById('rouletteCoinsDisplay');
      if (coinsEl && typeof DB.formatRouletteCoinsDisplay === 'function') {
        const newCoins = await DB.getRouletteCoinsBalance(user.id).catch(() => coins);
        coinsEl.textContent = DB.formatRouletteCoinsDisplay(newCoins);
      }
      const balEl = document.getElementById('rouletteWalletBalance');
      if (balEl && newBalance != null) {
        balEl.textContent = _fmtCurrency(newBalance, fresh || user);
      }

      const histBox = document.getElementById('rouletteHistoryList');
      if (histBox && typeof _cacheDel === 'function') {
        const txs = await DB.getTransactions(user.id).catch(() => []);
        const spinHistory = (txs || [])
          .filter((t) => {
            const meta = typeof t.meta === 'string' ? (() => { try { return JSON.parse(t.meta); } catch { return null; } })() : t.meta;
            return meta?.kind === 'roleta_premiada' || meta?.kind === 'roleta_giro_custo' || meta?.kind === 'roleta_moeda_credit'
              || /\[ROULETTE_COIN\]|\[ROULETTE_SPIN\]|roleta premiada|giro da roleta/i.test(String(t.reason || ''));
          })
          .slice(0, 15);
        if (spinHistory.length) {
          histBox.innerHTML = spinHistory.map((t) => {
            const meta = typeof t.meta === 'string' ? (() => { try { return JSON.parse(t.meta); } catch { return {}; } })() : (t.meta || {});
            const kind = meta.kind || '';
            let detail = t.reason || '–';
            if (kind === 'roleta_premiada' || /roleta premiada/i.test(detail)) {
              detail = `Prêmio: +${meta.reward_points || t.amount} pts`;
            }
            if (kind === 'roleta_giro_custo' || /\[ROULETTE_SPIN\]/i.test(detail)) detail = 'Giro da roleta (−1 moeda)';
            if (kind === 'roleta_moeda_credit' || /\[ROULETTE_COIN\]/i.test(detail)) detail = `Moeda ganha (+${meta.coins || t.amount})`;
            const sign = t.type === 'credit' ? '+' : '−';
            return `<div class="roulette-history-item"><div><strong>${detail}</strong><div style="font-size:11px;color:var(--color-text-muted);">${_fmtDateTime(t.created_at || t.date)}</div></div><span>${sign}${Number(t.amount || 0).toLocaleString('pt-BR')}</span></div>`;
          }).join('');
        }
      }

      if (typeof renderProfile === 'function') await renderProfile().catch(() => {});
      if (typeof renderBalance === 'function') await renderBalance().catch(() => {});
    } catch (e) {
      _stopKickSpin();
      showToast(e?.message || 'Erro ao girar roleta.', 'error');
    } finally {
      _stopKickSpin();
      _setSpinBusy(false);
      if (typeof hideLoading === 'function') hideLoading();
      const canSpin = unlimited || (await DB.getRouletteCoinsBalance(user.id).catch(() => 0)) >= 1;
      if (spinBtn) spinBtn.disabled = !canSpin;
      const tapAfter = document.getElementById('rouletteTapSpin');
      if (tapAfter) {
        tapAfter.disabled = !canSpin;
        tapAfter.classList.toggle('roulette-wheel-hub--disabled', !canSpin);
      }
    }
  }

  function setUnlimitedMode(on) {
    const local = typeof SouBluSecurity !== 'undefined' && SouBluSecurity.isLocalDev
      ? SouBluSecurity.isLocalDev()
      : (typeof DB !== 'undefined' && DB._isLocalDevHost && DB._isLocalDevHost());
    if (!local) {
      showToast('Modo ilimitado só em ambiente local de desenvolvimento.', 'warning');
      return;
    }
    if (typeof Auth === 'undefined' || !Auth.isMaster || !Auth.isMaster()) {
      showToast('Apenas Master pode ativar modo ilimitado.', 'warning');
      return;
    }
    if (window.SOUBLU_CONFIG) window.SOUBLU_CONFIG.ROULETTE_UNLIMITED_MASTER = !!on;
    renderRoulettePage();
    showToast(on ? 'Roleta ilimitada (dev local).' : 'Modo ilimitado desligado.', 'success');
  }

  async function resetRouletteCampaign() {
    if (typeof Auth === 'undefined' || !Auth.isMaster || !Auth.isMaster()) {
      showToast('Apenas Master pode zerar a campanha da roleta.', 'warning');
      return;
    }
    if (typeof DB?.resetRouletteCampaign !== 'function') {
      showToast('Atualize js/db.js no servidor.', 'error');
      return;
    }
    const ok = confirm(
      'Zerar campanha da roleta?\n\n'
      + '• Remove APENAS os pontos ganhos na roleta (prêmios sorteados)\n'
      + '• Mantém pontos que a pessoa já tinha (propostas, bônus, etc.)\n'
      + '• Zera as moedas de roleta de TODOS\n\n'
      + 'Esta ação não pode ser desfeita automaticamente.'
    );
    if (!ok) return;
    showLoading('Zerando moedas e estornando prêmios da roleta...');
    try {
      const session = Auth.getSession();
      const r = await DB.resetRouletteCampaign({
        by_user: session?.email || session?.name || 'master',
      });
      const pts = r.points?.totalPts || 0;
      const usersPts = r.points?.usersAffected || 0;
      const coins = r.coins?.totalCoins || 0;
      const usersCoins = r.coins?.usersAffected || 0;
      showToast(
        `Roleta zerada: ${usersPts} pessoa(s) com −${pts} pts da roleta; ${usersCoins} com ${coins} moeda(s) removidas.`,
        'success',
        9000
      );
      if (typeof _cacheDel === 'function') _cacheDel('transactions');
      if (typeof invalidateSouBluCaches === 'function') invalidateSouBluCaches();
      await renderRoulettePage();
    } catch (e) {
      showToast(e?.message || 'Erro ao zerar roleta.', 'error');
    } finally {
      hideLoading();
    }
  }

  async function grantTestCoins(amount = 10, allUsers = false) {
    if (typeof Auth === 'undefined' || !Auth.isMaster || !Auth.isMaster()) {
      showToast('Apenas Master pode creditar moedas de teste.', 'warning');
      return;
    }
    const n = Math.max(1, Math.round(Number(amount) || 10));
    if (allUsers) {
      if (typeof masterGrantTestRouletteCoins === 'function') {
        return masterGrantTestRouletteCoins(n);
      }
      if (typeof DB?.grantRouletteCoinsToAll !== 'function') {
        showToast('Atualize js/db.js no servidor.', 'error');
        return;
      }
      const ok = confirm(`Creditar ${n} moedas da roleta para todos os usuários ativos?`);
      if (!ok) return;
      showLoading('Creditando moedas...');
      try {
        const r = await DB.grantRouletteCoinsToAll(n, { criteria_key: 'teste_massa' });
        showToast(`+${n} moedas para ${r.granted} usuários.`, 'success', 5000);
        await renderRoulettePage();
      } finally {
        hideLoading();
      }
      return;
    }
    const user = typeof resolveEmployeeUser === 'function'
      ? await resolveEmployeeUser()
      : (currentUser || await Auth.getCurrentUser());
    if (!user?.id) return;
    showLoading('Creditando moedas...');
    try {
      await DB.grantRouletteCoins(user.id, n, { reason: `Teste — ${n} moedas roleta`, criteria_key: 'teste_self' });
      if (typeof _cacheDel === 'function') _cacheDel('transactions');
      showToast(`+${n} moedas creditadas para você.`, 'success');
      await renderRoulettePage();
    } catch (e) {
      showToast(e?.message || 'Erro ao creditar.', 'error');
    } finally {
      hideLoading();
    }
  }

  function init() {
    if (!_isEnabled()) {
      _hideRouletteUi();
      return;
    }
    ensureRouletteDOM();
    const u = typeof currentUser !== 'undefined' ? currentUser : null;
    if (u?.id) updateRouletteVisibility(u).catch(() => {});
  }

  return {
    init,
    ensureRouletteDOM,
    updateRouletteVisibility,
    renderRoulettePage,
    spin,
    grantTestCoins,
    resetRouletteCampaign,
    setUnlimitedMode,
    dismissWinOverlay,
    SECTION_ID,
  };
})();

window.RouletteUI = RouletteUI;

async function spinRouletteNow() {
  if ((window.SOUBLU_CONFIG || {}).ROULETTE_ENABLED === false) return;
  if (document.getElementById('secRoleta')?.classList.contains('active')) {
    return RouletteUI.spin();
  }
  if (typeof navigateTo === 'function') navigateTo(RouletteUI.SECTION_ID);
  await RouletteUI.renderRoulettePage();
  return RouletteUI.spin();
}
window.spinRouletteNow = spinRouletteNow;

document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('.sidebar-nav')) {
    RouletteUI.init();
  }
});
