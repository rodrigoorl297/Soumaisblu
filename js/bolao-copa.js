/* SOU+BLU — Bolão Copa do Mundo · Álbum Premiado (campanha interna) */
const BolaoCopa = (() => {
  'use strict';

  function _bolaoEnabled() {
    const cfg = (typeof window !== 'undefined' && window.SOUBLU_CONFIG) ? window.SOUBLU_CONFIG : {};
    if (cfg.BOLAO_COPA_ENABLED === false || cfg.BOLAO_COPA_ENABLED === 0 || cfg.BOLAO_COPA_ENABLED === '0') return false;
    if (typeof window !== 'undefined' && window.SOUBLU_BOLAO_ENABLED === false) return false;
    /* desligado por padrão até reativação explícita */
    return cfg.BOLAO_COPA_ENABLED === true || cfg.BOLAO_COPA_ENABLED === 1 || cfg.BOLAO_COPA_ENABLED === '1';
  }

  function _hideBolaoDom() {
    document.querySelectorAll('.bolao-copa-nav, #navBolaoCopa, #secBolaoCopa').forEach((el) => {
      el.style.display = 'none';
      el.setAttribute('hidden', 'hidden');
    });
  }

  if (!_bolaoEnabled()) {
    const api = {
      ensureDom() { _hideBolaoDom(); },
      applyNavVisibility() { _hideBolaoDom(); return Promise.resolve(false); },
      render() { _hideBolaoDom(); return Promise.resolve(); },
      renderWelcomeHtml() { return ''; },
      checkAndCelebrate() { return Promise.resolve(); },
      enabled: false,
    };
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _hideBolaoDom, { once: true });
      } else {
        _hideBolaoDom();
      }
    }
    return api;
  }

  const TZ = 'America/Sao_Paulo';
  const SECTION_ID = 'secBolaoCopa';
  const CAMPAIGN_ID = 'album-copa-2026';
  const PERFECT_BONUS = 150;
  const PICK_WINDOW_MS = 10 * 60 * 1000;

  /** Jogos do bolão — prazo = 10 min antes do horário de início (kickoff, America/Sao_Paulo). */
  const MATCHES = [
    { id: 'm01', home: { name: 'Brasil', code: 'br' }, away: { name: 'Japão', code: 'jp' }, date: '2026-06-29', kickoff: '14:00', sticker: 'patrocinador', stickerLabel: 'Figurinha patrocinador' },
    { id: 'm02', home: { name: 'Holanda', code: 'nl' }, away: { name: 'Marrocos', code: 'ma' }, date: '2026-06-29', kickoff: '22:00', sticker: 'gold', stickerLabel: 'Figurinha gold' },
    { id: 'm03', home: { name: 'França', code: 'fr' }, away: { name: 'Suécia', code: 'se' }, date: '2026-06-30', kickoff: '18:00', sticker: 'gold', stickerLabel: 'Figurinha gold' },
    { id: 'm04', home: { name: 'México', code: 'mx' }, away: { name: 'Equador', code: 'ec' }, date: '2026-06-30', kickoff: '22:00', sticker: 'patrocinador', stickerLabel: 'Figurinha patrocinador' },
    { id: 'm05', home: { name: 'Inglaterra', code: 'gb-eng' }, away: { name: 'RD Congo', code: 'cd' }, date: '2026-07-01', kickoff: '13:00', sticker: 'gold', stickerLabel: 'Figurinha gold' },
    { id: 'm06', home: { name: 'Bélgica', code: 'be' }, away: { name: 'Senegal', code: 'sn' }, date: '2026-07-01', kickoff: '17:00', sticker: 'silver', stickerLabel: 'Figurinha silver' },
    { id: 'm07', home: { name: 'Espanha', code: 'es' }, away: { name: 'Áustria', code: 'at' }, date: '2026-07-02', kickoff: '16:00', sticker: 'silver', stickerLabel: 'Figurinha silver' },
    { id: 'm08', home: { name: 'Portugal', code: 'pt' }, away: { name: 'Croácia', code: 'hr' }, date: '2026-07-02', kickoff: '20:00', sticker: 'gold', stickerLabel: 'Figurinha gold' },
    { id: 'm09', home: { name: 'Suíça', code: 'ch' }, away: { name: 'Argélia', code: 'dz' }, date: '2026-07-02', kickoff: '23:00', sticker: 'gold', stickerLabel: 'Figurinha gold' },
    { id: 'm10', home: { name: 'Argentina', code: 'ar' }, away: { name: 'Cabo Verde', code: 'cv' }, date: '2026-07-03', kickoff: '19:00', sticker: 'gold', stickerLabel: 'Figurinha gold' },
    { id: 'm11', home: { name: 'Colômbia', code: 'co' }, away: { name: 'Gana', code: 'gh' }, date: '2026-07-03', kickoff: '22:30', sticker: 'gold', stickerLabel: 'Figurinha gold' },
  ];

  const STICKER_EMOJI = { patrocinador: '🎴', gold: '🥇', silver: '🥈' };
  /** Campanha interna: equipe SOU+BLU + equipe SAK; outras redes parceiras ficam de fora. */
  const BOLAO_PARTNER_RAZOES = ['SAK SERVICOS CADASTRAIS LTDA'];
  const _saveInFlight = new Set();
  let _deadlineTimer = null;

  function normRazao(s) {
    return String(s || '').toUpperCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim();
  }

  function isMbSolucoesRazao(razao) {
    const n = normRazao(razao);
    return n.includes('MB') && n.includes('SOLUCOES');
  }

  function isBolaoAllowedPartnerRazao(razao) {
    const n = normRazao(razao);
    if (!n || isMbSolucoesRazao(n)) return false;
    if (BOLAO_PARTNER_RAZOES.some((r) => normRazao(r) === n)) return true;
    return n.includes('SAK') && n.includes('CADASTRAIS');
  }

  async function resolveBolaoPartnerRoot(user) {
    if (!user) return null;
    const role = String(user.role || '').toLowerCase();
    if (window.PARTNER_ROOT_ID) return String(window.PARTNER_ROOT_ID);
    if (typeof DB !== 'undefined' && typeof DB.getPartnerRootForUser === 'function') {
      try {
        const root = await DB.getPartnerRootForUser(user.id);
        if (root) return String(root);
      } catch (_) { /* noop */ }
    }
    if (user.partner_root_id && typeof DB !== 'undefined' && typeof DB.getUser === 'function') {
      try {
        const hinted = await DB.getUser(user.partner_root_id);
        if (String(hinted?.role || '').toLowerCase() === 'parceiro') return String(hinted.id);
      } catch (_) { /* noop */ }
    }
    if (window._PARTNER_ROOT_USER_IDS?.size && typeof DB !== 'undefined' && typeof DB.expandPartnerOrgIds === 'function') {
      try {
        const users = typeof DB.getAllUsers === 'function'
          ? await DB.getAllUsers().catch(() => [])
          : (typeof DB.getUsers === 'function' ? await DB.getUsers().catch(() => []) : []);
        for (const rid of window._PARTNER_ROOT_USER_IDS) {
          if (DB.expandPartnerOrgIds(rid, users).has(String(user.id))) return String(rid);
        }
      } catch (_) { /* noop */ }
    }
    if (role === 'parceiro') return String(user.id);
    if (user.admin_id && typeof DB !== 'undefined' && typeof DB.getUser === 'function') {
      try {
        const boss = await DB.getUser(user.admin_id);
        if (String(boss?.role || '').toLowerCase() === 'parceiro') return String(boss.id);
      } catch (_) { /* noop */ }
    }
    return null;
  }

  async function canAccessBolao(user) {
    if (!user) return false;
    if (typeof Auth !== 'undefined' && typeof Auth.isMaster === 'function' && Auth.isMaster()) return true;

    const role = String(user.role || '').toLowerCase();
    if (role === 'parceiro' || window.IS_PARCEIRO) return false;
    if (role === 'portaria') return true;

    if (typeof isSouBluInternalUser === 'function' && isSouBluInternalUser(user)) {
      return true;
    }

    if (window.PARTNER_RAZAO_SOCIAL && isBolaoAllowedPartnerRazao(window.PARTNER_RAZAO_SOCIAL)) {
      return true;
    }
    const rootId = await resolveBolaoPartnerRoot(user);
    if (!rootId || typeof DB === 'undefined' || typeof DB.getPartnerByUserId !== 'function') return false;
    try {
      const prt = await DB.getPartnerByUserId(rootId);
      const razao = prt?.razao_social || prt?.razaoSocial || '';
      const allowed = !!(prt && isBolaoAllowedPartnerRazao(razao));
      if (allowed) {
        if (!window.PARTNER_ROOT_ID) window.PARTNER_ROOT_ID = rootId;
        window.PARTNER_RAZAO_SOCIAL = razao;
        return true;
      }
    } catch (_) { /* noop */ }
    return false;
  }

  function parseScoreInput(val) {
    if (val === '' || val === null || val === undefined) return null;
    const n = Number(val);
    if (!Number.isInteger(n) || n < 0 || n > 20) return null;
    return n;
  }

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function flagImg(code) {
    const c = String(code || 'un').toLowerCase();
    return `https://flagcdn.com/w40/${c}.png`;
  }

  function flagImgFallback(code) {
    const c = String(code || 'un').toLowerCase();
    return `https://flagcdn.com/${c}.svg`;
  }

  function parseScore(str) {
    const m = String(str || '').trim().match(/^(\d{1,2})\s*[-xX×]\s*(\d{1,2})$/);
    if (!m) return null;
    const home = parseInt(m[1], 10);
    const away = parseInt(m[2], 10);
    if (home > 20 || away > 20) return null;
    return { home, away };
  }

  function formatScoreDisplay(str) {
    const s = parseScore(str);
    return s ? `${s.home} x ${s.away}` : String(str || '');
  }

  function toScorePick(home, away) {
    return `${home}-${away}`;
  }

  function hasScorePick(pick) {
    return !!parseScore(pick);
  }

  function normalizeKickoff(kickoff) {
    const parts = String(kickoff || '13:30').trim().split(':');
    const h = String(Math.max(0, parseInt(parts[0], 10) || 0)).padStart(2, '0');
    const m = String(Math.max(0, parseInt(parts[1], 10) || 0)).padStart(2, '0');
    return `${h}:${m}`;
  }

  function kickoffDate(match) {
    const t = normalizeKickoff(match.kickoff);
    return new Date(`${match.date}T${t}:00-03:00`);
  }

  function deadlineDate(match) {
    return new Date(kickoffDate(match).getTime() - PICK_WINDOW_MS);
  }

  function nowMs() {
    return Date.now();
  }

  /** true while now is strictly before kickoff minus 10 minutes (America/Sao_Paulo). */
  function isBeforeDeadline(match) {
    return nowMs() < deadlineDate(match).getTime();
  }

  function formatDeadline(match) {
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      }).format(deadlineDate(match));
    } catch (_) {
      return `${match.date} (10 min antes)`;
    }
  }

  function formatKickoff(match) {
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      }).format(kickoffDate(match));
    } catch (_) {
      return `${match.date} ${match.kickoff}`;
    }
  }

  function canPick(match) {
    return isBeforeDeadline(match);
  }

  function pickStatusLabel(match, hasPick) {
    if (!isBeforeDeadline(match)) return hasPick ? 'Placar registrado · prazo encerrado' : 'Prazo encerrado';
    return hasPick ? `Placar salvo · pode alterar até ${formatDeadline(match)}` : `Aberto até ${formatDeadline(match)}`;
  }

  function normalizeStoredPick(pick) {
    const s = parseScore(pick);
    return s ? toScorePick(s.home, s.away) : String(pick || '');
  }

  function deadlineClosedToast(match) {
    const msg = match
      ? `Prazo encerrado às ${formatDeadline(match)} (10 min antes do jogo).`
      : 'Prazo encerrado. Palpite até 10 min antes do jogo.';
    if (typeof showToast === 'function') showToast(msg, 'warning');
  }

  function isPartnerPickRow(p) {
    return !!(p && (p.is_partner === true || p.is_partner === 1 || p.is_partner === '1'));
  }

  async function isPartnerParticipant(user) {
    if (!user) return false;
    const role = String(user.role || '').toLowerCase();
    if (role === 'parceiro' || window.IS_PARCEIRO) return false;
    if (window.IS_PARTNER_STAFF) return true;
    if (window.__EMPLOYEE_PARTNER_ORG__ && role !== 'parceiro') return true;
    if (typeof isUserInPartnerOrg === 'function') {
      try {
        const inOrg = await isUserInPartnerOrg(user);
        if (inOrg && role !== 'parceiro' && !window.IS_PARCEIRO) return true;
      } catch (_) { /* noop */ }
    }
    if (user.admin_id && typeof DB !== 'undefined' && typeof DB.getUser === 'function') {
      try {
        const sup = await DB.getUser(user.admin_id);
        if (String(sup?.role || '').toLowerCase() === 'parceiro' && role !== 'parceiro') return true;
      } catch (_) { /* noop */ }
    }
    return false;
  }

  async function enrichPartnerFlags(picks) {
    const list = Array.isArray(picks) ? picks.slice() : [];
    let users = [];
    try {
      if (typeof DB !== 'undefined' && typeof DB.getUsers === 'function') {
        users = await DB.getUsers();
      }
    } catch (_) { /* noop */ }
    const partnerRoots = new Set(
      users.filter((u) => String(u.role || '').toLowerCase() === 'parceiro').map((u) => String(u.id))
    );
    return list.map((p) => {
      if (isPartnerPickRow(p)) return p;
      const u = users.find((x) => String(x.id) === String(p.user_id));
      if (!u) return p;
      const isP = String(u.role || '').toLowerCase() === 'parceiro'
        || (u.admin_id && partnerRoots.has(String(u.admin_id)));
      return isP ? { ...p, is_partner: 1 } : p;
    });
  }

  function eligible(role) {
    const r = String(role || '').trim().toLowerCase();
    return !!r;
  }

  function isMaster() {
    return typeof Auth !== 'undefined' && typeof Auth.isMaster === 'function' && Auth.isMaster();
  }

  function celebratedKey(userId, matchId) {
    return `soublu_bolao_celebrated_${userId}_${matchId}`;
  }

  function wasCelebrated(userId, matchId) {
    try { return localStorage.getItem(celebratedKey(userId, matchId)) === '1'; } catch (_) { return true; }
  }

  function markCelebrated(userId, matchId) {
    try { localStorage.setItem(celebratedKey(userId, matchId), '1'); } catch (_) {}
  }

  async function loadResults() {
    if (typeof DB !== 'undefined' && typeof DB.getBolaoResults === 'function') {
      return DB.getBolaoResults(CAMPAIGN_ID);
    }
    try {
      return JSON.parse(localStorage.getItem('soublu_bolao_results') || '{}');
    } catch (_) {
      return {};
    }
  }

  async function loadAllPicks() {
    if (typeof _cacheDel === 'function') _cacheDel('bolao_copa_picks');
    if (typeof DB !== 'undefined' && typeof DB.getBolaoPicks === 'function') {
      return DB.getBolaoPicks({ campaignId: CAMPAIGN_ID });
    }
    try {
      return JSON.parse(localStorage.getItem('soublu_bolao_picks') || '[]');
    } catch (_) {
      return [];
    }
  }

  async function loadUserPicks(userId) {
    const all = await loadAllPicks();
    const map = {};
    all
      .filter((p) => String(p.user_id) === String(userId))
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
      .forEach((p) => {
        if (!map[p.match_id] && hasScorePick(p.pick)) map[p.match_id] = p.pick;
      });
    return map;
  }

  function dbNow() {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }

  async function savePick(user, matchId, pick) {
    if (!user?.id || !matchId || !hasScorePick(pick)) {
      throw new Error('Palpite inválido');
    }
    const match = MATCHES.find((m) => m.id === matchId);
    if (match && !isBeforeDeadline(match)) {
      throw new Error(`Prazo encerrado às ${formatDeadline(match)} (10 min antes do jogo).`);
    }
    const isPartner = await isPartnerParticipant(user);
    const row = {
      id: `bp_${user.id}_${matchId}`,
      campaign_id: CAMPAIGN_ID,
      user_id: user.id,
      user_name: user.name || user.nome || '',
      match_id: matchId,
      pick,
      is_partner: isPartner ? 1 : 0,
      created_at: dbNow(),
      updated_at: dbNow(),
    };
    if (typeof DB !== 'undefined' && typeof DB.saveBolaoPick === 'function') {
      return DB.saveBolaoPick(row);
    }
    const list = await loadAllPicks();
    const idx = list.findIndex((p) => String(p.user_id) === String(user.id) && p.match_id === matchId);
    if (idx >= 0) list[idx] = { ...list[idx], ...row };
    else list.push(row);
    localStorage.setItem('soublu_bolao_picks', JSON.stringify(list));
    return row;
  }

  async function setMatchResult(matchId, result) {
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    const payload = {
      campaign_id: CAMPAIGN_ID,
      match_id: matchId,
      result,
      set_by: session?.id || null,
      set_at: dbNow(),
    };
    if (typeof DB !== 'undefined' && typeof DB.saveBolaoResult === 'function') {
      return DB.saveBolaoResult(payload);
    }
    const map = await loadResults();
    map[matchId] = payload;
    localStorage.setItem('soublu_bolao_results', JSON.stringify(map));
    return payload;
  }

  function pickCorrect(userPick, result) {
    const u = parseScore(userPick);
    const r = parseScore(result);
    if (!u || !r) return false;
    return u.home === r.home && u.away === r.away;
  }

  async function getUserWins(userId) {
    const results = await loadResults();
    const picks = await loadUserPicks(userId);
    const wins = [];
    MATCHES.forEach((m) => {
      const res = results[m.id]?.result;
      const pick = picks[m.id];
      if (res && pickCorrect(pick, res)) {
        wins.push({ match: m, pick, result: res });
      }
    });
    return wins;
  }

  function dedupePicks(picks) {
    const map = new Map();
    (picks || []).forEach((p) => {
      if (!p?.match_id || !hasScorePick(p.pick)) return;
      const key = `${p.user_id}_${p.match_id}`;
      const prev = map.get(key);
      if (!prev || new Date(p.updated_at || p.created_at || 0) > new Date(prev.updated_at || prev.created_at || 0)) {
        map.set(key, p);
      }
    });
    return [...map.values()];
  }

  async function getRecentWinners(limit = 5) {
    const results = await loadResults();
    const picks = dedupePicks(await loadAllPicks());
    const out = [];
    MATCHES.slice().reverse().forEach((m) => {
      const res = results[m.id]?.result;
      if (!res) return;
      picks.filter((p) => p.match_id === m.id && pickCorrect(p.pick, res)).forEach((p) => {
        out.push({
          userName: p.user_name || 'Colaborador',
          matchLabel: `${m.home.name} x ${m.away.name}`,
          sticker: m.stickerLabel,
          points: 15,
          at: results[m.id]?.set_at || p.updated_at,
        });
      });
    });
    return out.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, limit);
  }

  function showCelebration(match, pick) {
    const overlay = document.createElement('div');
    overlay.className = 'bolao-celebrate-overlay';
    overlay.innerHTML = `
      <div class="bolao-celebrate-card">
        <div class="bolao-celebrate-confetti" aria-hidden="true"></div>
        <div class="bolao-celebrate-icon">🎉</div>
        <h2>Placar certo!</h2>
        <p><strong>${esc(match.home.name)}</strong> ${esc(formatScoreDisplay(pick))} <strong>${esc(match.away.name)}</strong></p>
        <p class="bolao-celebrate-prize">15 pts + ${esc(match.stickerLabel)}</p>
        <p class="text-muted" style="font-size:13px;">O Master creditará os pontos e o pacote de figurinhas.</p>
        <button type="button" class="btn btn-primary" onclick="this.closest('.bolao-celebrate-overlay').remove()">Continuar</button>
      </div>`;
    document.body.appendChild(overlay);
    spawnConfetti(overlay.querySelector('.bolao-celebrate-confetti'));
  }

  function spawnConfetti(container) {
    if (!container) return;
    const colors = ['#FFD700', '#FF6B35', '#00A86B', '#1E90FF', '#FF1493'];
    for (let i = 0; i < 48; i++) {
      const el = document.createElement('span');
      el.className = 'bolao-confetti-piece';
      el.style.cssText = `left:${Math.random() * 100}%;animation-delay:${Math.random() * 0.8}s;background:${colors[i % colors.length]}`;
      container.appendChild(el);
    }
  }

  async function checkAndCelebrate(user) {
    if (!user?.id) return;
    const wins = await getUserWins(user.id);
    for (const w of wins) {
      if (!wasCelebrated(user.id, w.match.id)) {
        markCelebrated(user.id, w.match.id);
        showCelebration(w.match, w.pick);
        break;
      }
    }
  }

  function matchCardHtml(match, userPick, result, opts = {}) {
    const open = canPick(match);
    const scored = parseScore(userPick);
    const resultScored = parseScore(result);
    const correct = result && pickCorrect(userPick, result);
    const wrong = result && hasScorePick(userPick) && !correct;
    const statusCls = correct ? 'bolao-match--win' : (wrong ? 'bolao-match--lose' : '');
    const dis = open ? '' : ' disabled readonly';
    const homeVal = scored ? scored.home : '';
    const awayVal = scored ? scored.away : '';
    const saved = hasScorePick(userPick);
    const saveLabel = saved ? 'Atualizar palpite' : 'Salvar palpite';
    return `
      <article class="bolao-match ${statusCls}" data-match-id="${match.id}">
        <div class="bolao-match__head">
          <span class="bolao-match__date">${esc(formatKickoff(match))}</span>
          <span class="bolao-match__prize">${STICKER_EMOJI[match.sticker] || '🎁'} 15 pts + ${esc(match.stickerLabel)}</span>
        </div>
        ${saved ? `
        <div class="bolao-my-pick">
          <span class="bolao-my-pick__label">Seu palpite</span>
          <span class="bolao-my-pick__score">${esc(formatScoreDisplay(userPick))}</span>
          ${!open ? '<span class="bolao-my-pick__locked">· registrado</span>' : '<span class="bolao-my-pick__locked">· pode alterar até o prazo</span>'}
        </div>` : ''}
        <div class="bolao-match__teams">
          <div class="bolao-team">
            <img src="${flagImg(match.home.code)}" alt="" width="56" height="42" loading="lazy" referrerpolicy="no-referrer"
              onerror="this.onerror=null;this.src='${flagImgFallback(match.home.code)}'"/>
            <strong>${esc(match.home.name)}</strong>
          </div>
          <span class="bolao-match__vs">VS</span>
          <div class="bolao-team">
            <img src="${flagImg(match.away.code)}" alt="" width="56" height="42" loading="lazy" referrerpolicy="no-referrer"
              onerror="this.onerror=null;this.src='${flagImgFallback(match.away.code)}'"/>
            <strong>${esc(match.away.name)}</strong>
          </div>
        </div>
        <div class="bolao-score-pick">
          <input type="number" inputmode="numeric" min="0" max="20" class="bolao-score-input" data-match="${match.id}" data-side="home" value="${homeVal}" placeholder="—"${dis}/>
          <span class="bolao-score-sep">×</span>
          <input type="number" inputmode="numeric" min="0" max="20" class="bolao-score-input" data-match="${match.id}" data-side="away" value="${awayVal}" placeholder="—"${dis}/>
          <button type="button" class="btn btn-primary btn-sm bolao-save-pick" data-match="${match.id}"${open ? '' : ' disabled'}>${saveLabel}</button>
        </div>
        <div class="bolao-match__status ${open ? 'is-open' : 'is-closed'}">
          <span>${esc(pickStatusLabel(match, saved))}</span>
          ${!saved && open ? '<span> · Preencha os gols e clique em salvar · 1 palpite por jogo</span>' : ''}
          ${resultScored ? ` · Placar oficial: <strong>${esc(formatScoreDisplay(result))}</strong>` : ''}
          ${correct ? ' <span class="badge badge-success">Acertou!</span>' : ''}
        </div>
        ${opts.master ? _masterResultControls(match, result) : ''}
      </article>`;
  }

  function _masterResultControls(match, result) {
    const scored = parseScore(result);
    const homeVal = scored ? scored.home : '';
    const awayVal = scored ? scored.away : '';
    return `
      <div class="bolao-master-result">
        <label>Placar oficial (Master)</label>
        <div class="bolao-score-pick bolao-score-pick--master">
          <input type="number" inputmode="numeric" min="0" max="20" class="bolao-score-input bolao-master-score" data-match="${match.id}" data-side="home" value="${homeVal}" placeholder="0"/>
          <span class="bolao-score-sep">×</span>
          <input type="number" inputmode="numeric" min="0" max="20" class="bolao-score-input bolao-master-score" data-match="${match.id}" data-side="away" value="${awayVal}" placeholder="0"/>
          <button type="button" class="btn btn-outline btn-sm bolao-save-result" data-match="${match.id}">Registrar</button>
        </div>
      </div>`;
  }

  function winnerBadgeHtml(p) {
    const partner = isPartnerPickRow(p);
    const cls = partner ? 'bolao-badge-partner' : 'badge-info';
    const label = partner ? `${esc(p.user_name)} · parceiro` : esc(p.user_name);
    return `<span class="badge ${cls}" style="margin:2px;">${label}</span>`;
  }

  async function renderMasterReport(root) {
    const results = await loadResults();
    const picks = await enrichPartnerFlags(await loadAllPicks());
    const byMatch = {};
    MATCHES.forEach((m) => { byMatch[m.id] = []; });
    picks.forEach((p) => {
      if (byMatch[p.match_id]) byMatch[p.match_id].push(p);
    });

    let rows = '';
    MATCHES.forEach((m) => {
      const res = results[m.id]?.result;
      const list = dedupePicks(byMatch[m.id] || []);
      const winners = res ? list.filter((p) => pickCorrect(p.pick, res)) : [];
      rows += `<tr>
        <td><strong>${esc(m.home.name)}</strong> x <strong>${esc(m.away.name)}</strong><br><small class="text-muted">${esc(formatKickoff(m))}</small></td>
        <td>${res ? `<span class="badge badge-success">${esc(formatScoreDisplay(res))}</span>` : '<span class="badge badge-muted">Pendente</span>'}</td>
        <td>${list.length}</td>
        <td>${winners.length ? winners.map((w) => winnerBadgeHtml(w)).join(' ') : '<span class="text-muted">—</span>'}</td>
        <td>15 pts + ${esc(m.stickerLabel)}</td>
      </tr>`;
    });

    const perfect = [];
    if (Object.keys(results).length >= MATCHES.length) {
      const userIds = [...new Set(picks.map((p) => p.user_id))];
      userIds.forEach((uid) => {
        const userPicks = picks.filter((p) => String(p.user_id) === String(uid));
        if (userPicks.length < MATCHES.length) return;
        const allCorrect = MATCHES.every((m) => {
          const res = results[m.id]?.result;
          const pick = userPicks.find((p) => p.match_id === m.id)?.pick;
          return res && pickCorrect(pick, res);
        });
        if (allCorrect) {
          perfect.push(userPicks[0]?.user_name || uid);
        }
      });
    }

    root.insertAdjacentHTML('beforeend', `
      <div class="card card-padded bolao-master-report" style="margin-top:20px;">
        <h3 style="margin:0 0 8px;">Painel Master — acertos e premiação</h3>
        <p class="text-muted" style="font-size:13px;margin:0 0 16px;">Registre o placar oficial de cada jogo. Quem acertar o placar exato recebe <strong>15 pts + figurinha</strong>. Acertar <strong>todos</strong>: <strong>+${PERFECT_BONUS} pts</strong>. <span class="bolao-legend-partner">Laranja = equipe parceira</span></p>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Jogo</th><th>Placar</th><th>Palpites</th><th>Acertaram</th><th>Prêmio</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        ${perfect.length ? `<div class="bolao-perfect-banner">🏆 Placar perfeito (+${PERFECT_BONUS} pts): <strong>${perfect.map(esc).join(', ')}</strong></div>` : ''}
      </div>`);
  }

  function renderMasterAllPicks(root, picks, results) {
    const valid = dedupePicks(picks);
    const byUser = {};
    valid.forEach((p) => {
      const key = String(p.user_id);
      if (!byUser[key]) {
        byUser[key] = { name: p.user_name || 'Colaborador', picks: {}, isPartner: isPartnerPickRow(p) };
      }
      if (!byUser[key].picks[p.match_id]) byUser[key].picks[p.match_id] = p.pick;
      if (isPartnerPickRow(p)) byUser[key].isPartner = true;
    });

    const matchOptions = MATCHES.map((m) =>
      `<option value="${m.id}">${esc(m.home.name)} x ${esc(m.away.name)}</option>`
    ).join('');

    let rows = '';
    valid
      .sort((a, b) => {
        const ma = MATCHES.findIndex((m) => m.id === a.match_id);
        const mb = MATCHES.findIndex((m) => m.id === b.match_id);
        if (ma !== mb) return ma - mb;
        return String(a.user_name || '').localeCompare(String(b.user_name || ''), 'pt-BR');
      })
      .forEach((p) => {
        const m = MATCHES.find((x) => x.id === p.match_id);
        if (!m) return;
        const res = results[p.match_id]?.result;
        const hit = res && pickCorrect(p.pick, res);
        const partner = isPartnerPickRow(p);
        rows += `<tr${partner ? ' class="bolao-row-partner"' : ''} data-match-id="${esc(p.match_id)}">
          <td><strong>${esc(m.home.name)}</strong> x <strong>${esc(m.away.name)}</strong></td>
          <td>${partner ? `<span class="bolao-name-partner">${esc(p.user_name || 'Colaborador')}</span> <span class="bolao-tag-partner">Parceiro</span>` : esc(p.user_name || 'Colaborador')}</td>
          <td><span class="bolao-pick-chip${partner ? ' bolao-pick-partner' : ''}">${esc(formatScoreDisplay(p.pick))}</span></td>
          <td>${res ? (hit ? '<span class="badge badge-success">Acertou</span>' : '<span class="badge badge-muted">Errou</span>') : '<span class="text-muted">Aguardando jogo</span>'}</td>
        </tr>`;
      });

    const summary = Object.values(byUser).map((u) => {
      const count = Object.keys(u.picks).length;
      const cls = u.isPartner ? 'bolao-badge-partner' : 'badge-info';
      return `<span class="badge ${cls}" style="margin:2px;">${esc(u.name)} (${count}/${MATCHES.length})</span>`;
    }).join(' ') || '<span class="text-muted">Nenhum palpite ainda</span>';

    root.insertAdjacentHTML('beforeend', `
      <div class="card card-padded bolao-master-all-picks" style="margin-top:20px;">
        <h3 style="margin:0 0 8px;">Todos os palpites</h3>
        <p class="text-muted" style="font-size:13px;margin:0 0 12px;">Cada participante tem <strong>1 palpite por jogo</strong>. <span class="bolao-legend-partner">Laranja = equipe parceira</span>. Resumo: ${summary}</p>
        <div class="form-group" style="margin-bottom:12px;">
          <label style="font-size:12px;font-weight:700;">Filtrar por jogo</label>
          <select id="bolaoMasterPickFilter" class="form-control" style="max-width:360px;">
            <option value="">Todos os jogos</option>
            ${matchOptions}
          </select>
        </div>
        <div class="table-wrap"><table class="data-table bolao-all-picks-table">
          <thead><tr><th>Jogo</th><th>Colaborador</th><th>Palpite</th><th>Status</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4" class="text-muted text-center">Nenhum palpite registrado ainda.</td></tr>'}</tbody>
        </table></div>
      </div>`);

    const filter = document.getElementById('bolaoMasterPickFilter');
    if (filter) {
      filter.addEventListener('change', () => {
        const mid = filter.value;
        root.querySelectorAll('.bolao-all-picks-table tbody tr[data-match-id]').forEach((tr) => {
          tr.style.display = !mid || tr.dataset.matchId === mid ? '' : 'none';
        });
      });
    }
  }

  async function render(rootId = 'bolaoCopaRoot') {
    ensureDom();
    bindGridEventsOnce();
    const root = document.getElementById(rootId);
    if (!root) return;

    try {
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    if (!session) {
      root.innerHTML = '<div class="card card-padded text-muted text-center">Faça login para participar.</div>';
      return;
    }
    const user = typeof Auth.getCurrentUser === 'function' ? await Auth.getCurrentUser().catch(() => session) : session;
    if (!(await canAccessBolao(user))) {
      root.innerHTML = '<div class="card card-padded text-muted text-center">Bolão disponível para a equipe <strong>SOU+BLU</strong> e colaboradores <strong>SAK SERVIÇOS CADASTRAIS LTDA</strong>.</div>';
      return;
    }

    const [userPicks, results] = await Promise.all([
      loadUserPicks(user.id),
      loadResults(),
    ]);

    root.innerHTML = `
      <div class="bolao-wrap">
        <header class="bolao-hero">
          <div class="bolao-hero__badge">🏆 Álbum Premiado</div>
          <h1>Bolão Copa do Mundo</h1>
        </header>
        <div class="bolao-grid" id="bolaoMatchGrid"></div>
      </div>`;

    const grid = document.getElementById('bolaoMatchGrid');
    if (grid) {
      grid.innerHTML = MATCHES.map((m) => matchCardHtml(m, userPicks[m.id], results[m.id]?.result, { master: isMaster() })).join('');
    }

    if (isMaster()) {
      const allPicks = await enrichPartnerFlags(await loadAllPicks());
      await renderMasterReport(root);
      renderMasterAllPicks(root, allPicks, results);
    }

    await checkAndCelebrate(user);
    scheduleDeadlineRefresh();
    } catch (err) {
      console.error('[BolaoCopa] render:', err);
      if (root) {
        root.innerHTML = '<div class="card card-padded text-muted text-center">Erro ao carregar o bolão. Atualize a página.</div>';
      }
    }
  }

  async function submitScorePick(matchId, homeGoals, awayGoals) {
    if (_saveInFlight.has(matchId)) {
      if (typeof showToast === 'function') showToast('Aguarde, salvando palpite...', 'info');
      return;
    }
    const home = parseScoreInput(homeGoals);
    const away = parseScoreInput(awayGoals);
    if (home === null || away === null) {
      if (typeof showToast === 'function') showToast('Preencha os dois gols do placar (0 a 20).', 'warning');
      return;
    }
    const pick = toScorePick(home, away);
    const match = MATCHES.find((m) => m.id === matchId);
    if (!match) return;
    if (!isBeforeDeadline(match)) {
      deadlineClosedToast(match);
      refreshGridDeadlineState();
      return;
    }
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    if (!session?.id) {
      if (typeof showToast === 'function') showToast('Faça login para salvar seu palpite.', 'warning');
      return;
    }
    if (!eligible(session?.role)) {
      if (typeof showToast === 'function') showToast('Sem permissão para registrar palpite.', 'warning');
      return;
    }
    const user = await Auth.getCurrentUser().catch(() => session);
    _saveInFlight.add(matchId);
    try {
      if (typeof showLoading === 'function') showLoading('Salvando palpite...');
      const savedRow = await savePick(user, matchId, pick);
      if (normalizeStoredPick(savedRow?.pick) !== pick) {
        throw new Error('Palpite não confirmado. Tente novamente.');
      }
      if (typeof showToast === 'function') showToast(`Palpite ${formatScoreDisplay(pick)} salvo! (1 por jogo)`, 'success');
      await render();
    } catch (e) {
      console.error('[BolaoCopa] save:', e);
      if (typeof showToast === 'function') showToast(e?.message || 'Erro ao salvar palpite.', 'error');
    } finally {
      _saveInFlight.delete(matchId);
      if (typeof hideLoading === 'function') hideLoading();
    }
  }

  function refreshGridDeadlineState() {
    const grid = document.getElementById('bolaoMatchGrid');
    if (!grid) return;
    grid.querySelectorAll('.bolao-match[data-match-id]').forEach((card) => {
      const match = MATCHES.find((m) => m.id === card.dataset.matchId);
      if (!match) return;
      const open = isBeforeDeadline(match);
      card.querySelectorAll('.bolao-score-input:not(.bolao-master-score)').forEach((inp) => {
        inp.disabled = !open;
        inp.readOnly = !open;
      });
      const btn = card.querySelector('.bolao-save-pick');
      if (btn) btn.disabled = !open;
      const status = card.querySelector('.bolao-match__status');
      if (status) {
        status.classList.toggle('is-open', open);
        status.classList.toggle('is-closed', !open);
      }
    });
  }

  function scheduleDeadlineRefresh() {
    if (_deadlineTimer) {
      clearInterval(_deadlineTimer);
      _deadlineTimer = null;
    }
    if (!MATCHES.some(isBeforeDeadline)) return;
    _deadlineTimer = setInterval(() => {
      const sec = document.getElementById(SECTION_ID);
      if (!sec || sec.style.display === 'none') return;
      if (!MATCHES.some(isBeforeDeadline)) {
        clearInterval(_deadlineTimer);
        _deadlineTimer = null;
        void render();
        return;
      }
      refreshGridDeadlineState();
    }, 30000);
  }

  async function submitPick(matchId, pick) {
    const s = parseScore(pick);
    if (s) return submitScorePick(matchId, s.home, s.away);
  }

  async function masterSetScore(matchId, homeGoals, awayGoals) {
    if (!isMaster()) {
      if (typeof showToast === 'function') showToast('Somente Master pode registrar placares.', 'error');
      return;
    }
    const home = parseScoreInput(homeGoals);
    const away = parseScoreInput(awayGoals);
    if (home === null || away === null) {
      if (typeof showToast === 'function') showToast('Informe o placar oficial completo.', 'warning');
      return;
    }
    const result = toScorePick(home, away);
    try {
      if (typeof showLoading === 'function') showLoading('Salvando placar oficial...');
      await setMatchResult(matchId, result);
      if (typeof showToast === 'function') showToast(`Placar oficial ${formatScoreDisplay(result)} registrado.`, 'success');
      await render();
      if (typeof PainelSonhos !== 'undefined' && typeof PainelSonhos.render === 'function') {
        PainelSonhos.render('painelSonhosRoot').catch(() => {});
      }
    } catch (e) {
      console.error('[BolaoCopa] result:', e);
      if (typeof showToast === 'function') showToast('Erro ao salvar placar oficial.', 'error');
    } finally {
      if (typeof hideLoading === 'function') hideLoading();
    }
  }

  async function masterSetResult(matchId, result) {
    const s = parseScore(result);
    if (s) return masterSetScore(matchId, s.home, s.away);
  }

  async function renderWelcomeHtml() {
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    if (!session || !(await canAccessBolao(session))) return '';
    const winners = await getRecentWinners(4);
    if (!winners.length) return '';
    const items = winners.map((w) => `
      <div class="bolao-welcome-item">
        <span class="bolao-welcome-trophy">🏆</span>
        <span><strong>${esc(w.userName)}</strong> acertou o placar <em>${esc(w.matchLabel)}</em> — 15 pts + figurinha</span>
      </div>`).join('');
    return `
      <div class="bolao-welcome-banner" id="bolaoWelcomeBanner">
        <div class="bolao-welcome-banner__title">🎉 Ganhadores do Bolão · Álbum Premiado</div>
        <div class="bolao-welcome-banner__list">${items}</div>
        <button type="button" class="btn btn-outline btn-sm bolao-welcome-go">Ver bolão</button>
      </div>`;
  }

  function bindGridEventsOnce() {
    const root = document.getElementById('bolaoCopaRoot');
    if (!root || root.dataset.bolaoEventsBound === '1') return;
    root.dataset.bolaoEventsBound = '1';
    root.addEventListener('click', (e) => {
      const saveBtn = e.target.closest('.bolao-save-pick');
      if (saveBtn && !saveBtn.disabled) {
        const matchId = saveBtn.dataset.match;
        const card = saveBtn.closest('.bolao-match');
        const homeIn = card?.querySelector('.bolao-score-input[data-side="home"]:not(.bolao-master-score)');
        const awayIn = card?.querySelector('.bolao-score-input[data-side="away"]:not(.bolao-master-score)');
        if (matchId && homeIn && awayIn) void submitScorePick(matchId, homeIn.value, awayIn.value);
        return;
      }
      const resBtn = e.target.closest('.bolao-save-result');
      if (resBtn) {
        const matchId = resBtn.dataset.match;
        const wrap = resBtn.closest('.bolao-master-result');
        const homeIn = wrap?.querySelector('.bolao-master-score[data-side="home"]');
        const awayIn = wrap?.querySelector('.bolao-master-score[data-side="away"]');
        if (matchId && homeIn && awayIn) void masterSetScore(matchId, homeIn.value, awayIn.value);
      }
    });
  }

  function bolaoNavIconHtml() {
    return typeof navIconHtml === 'function' ? navIconHtml('soccer') : '⚽';
  }

  function refreshBolaoNavIcon(btn) {
    if (!btn) return;
    const label = btn.querySelector('.nav-label');
    const labelHtml = label ? label.outerHTML : '<span class="nav-label">Bolão Copa</span>';
    btn.innerHTML = `${bolaoNavIconHtml()}${labelHtml}`;
  }

  function wireBolaoNav(btn) {
    if (!btn || btn.dataset.bolaoNavWired === '1') return;
    btn.dataset.bolaoNavWired = '1';
    btn.dataset.navWiredUi = '1';
    btn.addEventListener('click', () => {
      if (typeof navigateTo === 'function') navigateTo(SECTION_ID);
      void render();
    });
  }

  function ensureStyles() {
    if (document.getElementById('bolaoCopaCss')) return;
    const link = document.createElement('link');
    link.id = 'bolaoCopaCss';
    link.rel = 'stylesheet';
    link.href = (typeof resolveAssetHref === 'function') ? resolveAssetHref('css/bolao-copa.css') : '../css/bolao-copa.css';
    document.head.appendChild(link);
  }

  function ensureDom() {
    ensureStyles();
    const existingNav = document.getElementById('navBolaoCopa');
    if (existingNav) {
      if (!window.IS_PORTARIA) existingNav.style.display = 'none';
      refreshBolaoNavIcon(existingNav);
      wireBolaoNav(existingNav);
    } else {
      const nav = document.querySelector('.sidebar-nav');
      const anchor = document.getElementById('navRoleta') || document.querySelector('[data-section="secInicio"]');
      if (nav && anchor) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'navBolaoCopa';
        btn.className = 'nav-item bolao-copa-nav';
        btn.dataset.section = SECTION_ID;
        btn.style.display = 'none';
        btn.innerHTML = `${bolaoNavIconHtml()}<span class="nav-label">Bolão Copa</span>`;
        nav.insertBefore(btn, anchor.nextSibling || anchor);
        wireBolaoNav(btn);
      }
    }
    if (!document.getElementById(SECTION_ID)) {
      const main = document.querySelector('.page-content') || document.getElementById('mainArea');
      if (main) {
        const sec = document.createElement('section');
        sec.className = 'section';
        sec.id = SECTION_ID;
        sec.innerHTML = '<div id="bolaoCopaRoot"></div>';
        main.appendChild(sec);
      }
    }
  }

  async function applyNavVisibility() {
    const session = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    const hide = () => {
      document.querySelectorAll('.bolao-copa-nav, #navBolaoCopa').forEach((el) => { el.style.display = 'none'; });
      const sec = document.getElementById(SECTION_ID);
      if (sec) sec.style.display = 'none';
    };
    if (!session) {
      hide();
      return;
    }
    let user = session;
    try {
      if (typeof Auth !== 'undefined' && typeof Auth.getCurrentUser === 'function') {
        user = await Auth.getCurrentUser() || session;
      }
    } catch (_) { /* noop */ }
    const role = String(user?.role || session?.role || '').toLowerCase();
    if (window.IS_PORTARIA || role === 'portaria') {
      document.querySelectorAll('.bolao-copa-nav, #navBolaoCopa').forEach((el) => { el.style.display = ''; });
      const sec = document.getElementById(SECTION_ID);
      if (sec) sec.style.display = '';
      return;
    }
    try {
      const show = await canAccessBolao(user);
      document.querySelectorAll('.bolao-copa-nav, #navBolaoCopa').forEach((el) => { el.style.display = show ? '' : 'none'; });
      const sec = document.getElementById(SECTION_ID);
      if (sec) sec.style.display = show ? '' : 'none';
    } catch (_) {
      hide();
    }
  }

  function bindWelcomeDelegation() {
    if (document.documentElement.dataset.bolaoWelcomeDelegated === '1') return;
    document.documentElement.dataset.bolaoWelcomeDelegated = '1';
    document.addEventListener('click', (e) => {
      const go = e.target.closest('.bolao-welcome-go');
      if (!go) return;
      if (typeof navigateTo === 'function') navigateTo(SECTION_ID);
      void render();
    });
  }

  function init() {
    ensureDom();
    applyNavVisibility();
    bindWelcomeDelegation();
    return render();
  }

  return {
    CAMPAIGN_ID,
    MATCHES,
    eligible,
    ensureDom,
    applyNavVisibility,
    init,
    render,
    renderWelcomeHtml,
    submitPick,
    submitScorePick,
    masterSetResult,
    masterSetScore,
    getRecentWinners,
    checkAndCelebrate,
    canPick,
    isBeforeDeadline,
    formatDeadline,
  };
})();

if (typeof window !== 'undefined') window.BolaoCopa = BolaoCopa;
