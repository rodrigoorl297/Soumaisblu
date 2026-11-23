(function(){if(document.getElementById('soublu-ranking-standings-style'))return;const style=document.createElement('style');style.id='soublu-ranking-standings-style';style.textContent="/* Ranking local: classificação abaixo do pódio. */\n.rk-standings-card { background:var(--color-surface); border:1px solid var(--color-border); border-radius:16px; overflow:hidden; }\n.rk-standings-heading { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:20px 22px; border-bottom:1px solid var(--color-border); }\n.rk-standings-heading h3 { margin:0 0 4px; font-size:17px; color:#102d50; }\n.rk-standings-heading p { margin:0; font-size:12px; color:#64748b; }\n.rk-standings-heading>span { border-radius:20px; background:#f1f5f9; padding:6px 12px; font-size:11px; color:#52657c; white-space:nowrap; }\n.rk-standings { width:100%; border-collapse:collapse; font-size:13px; }\n.rk-standings th { padding:13px 18px; background:#f7f9fc; color:#64748b; font-size:10px; text-transform:uppercase; letter-spacing:.06em; font-weight:700; text-align:left; }\n.rk-standings td { padding:13px 18px; border-top:1px solid #edf1f6; vertical-align:middle; }\n.rk-standings tbody tr:hover { background:#f8fafc; }\n.rk-standings tbody tr.is-me { background:#f6fce9; box-shadow:inset 3px 0 #79a600; }\n.rk-standings__position { width:76px; color:#64748b; font-weight:800; font-size:15px; font-variant-numeric:tabular-nums; }\n.rk-standings__position span { font-size:11px; margin-left:1px; }\n.rk-standings__identity { display:flex; align-items:center; gap:12px; }\n.rk-standings__identity>div:last-child { min-width:0; }\n.rk-standings__identity .avatar { width:38px; height:38px; flex-shrink:0; font-size:13px; }\n.rk-standings .rk-row__name { white-space:normal; line-height:1.35; font-size:12px; }\n.rk-standings .rk-row__dept { margin-top:3px; font-size:11px; color:#7a8ba1; }\n.rk-standings :is(td,th).rk-standings__number { text-align:right; width:110px; font-variant-numeric:tabular-nums; }\n.rk-standings__number strong { font-size:17px; color:#14385d; }\n.rk-standings__total { color:#52657c; }\n.rk-standings__conversion { width:150px; }\n.rk-standings__conversion strong { font-size:12px; font-variant-numeric:tabular-nums; color:#4f6b00; }\n.rk-conversion-track { display:block; height:5px; max-width:110px; margin-top:7px; border-radius:8px; overflow:hidden; background:#edf2e4; }\n.rk-conversion-track i { display:block; height:100%; background:#83b500; border-radius:inherit; }\n.rk-standings__sales { text-align:right; white-space:nowrap; font-weight:700; color:#14385d; font-variant-numeric:tabular-nums; }\n.rk-standings__sales small { display:block; font-size:10px; font-weight:400; }\n.rk-standings .rk-row__ahead { margin-top:5px; font-size:11px; }\n.rk-standings .rk-add { white-space:nowrap; }\n@media(max-width:1000px) { .rk-standings :is(th,td) { padding:12px 10px; } .rk-standings__tier { display:none; } .rk-standings th:has(+th:last-child) { white-space:normal; } }\n@media(max-width:760px) {\n  .rk-standings, .rk-standings tbody { display:block; }\n  .rk-standings thead { display:none; }\n  .rk-standings tbody tr { display:grid; grid-template-columns:45px repeat(3,minmax(0,1fr)); align-items:center; gap:14px 12px; padding:16px; border-top:1px solid #edf1f6; }\n  .rk-standings td { border:0; padding:0; width:auto!important; min-width:0; }\n  .rk-standings__person { grid-column:2/-1; }\n  .rk-standings__number { text-align:left!important; }\n  .rk-standings td::before { content:attr(data-label); display:block; margin-bottom:6px; font-size:10px; color:#64748b; font-weight:500; }\n  .rk-standings__position::before, .rk-standings__person::before { display:none!important; }\n  .rk-standings td[data-label=\"Pagas\"] { grid-column:2; }\n  .rk-standings__sales { grid-column:2/4; text-align:left; }\n  .rk-standings-heading { padding:16px; }\n  .rk-standings__conversion { min-width:0; }\n  .rk-conversion-track { width:100%; }\n}\n";document.head.appendChild(style);})();
(function(){if(document.getElementById('soublu-ranking-local-style'))return;const style=document.createElement('style');style.id='soublu-ranking-local-style';style.textContent="/* ===== RANKING DE VENDAS — pódio + lista compacta ===== */\n.ranking-list.rk { gap: 0; }\n\n.rk-empty {\n  padding: 28px 16px;\n  text-align: center;\n  color: var(--color-text-muted);\n}\n\n.rk-kpis {\n  display: grid;\n  grid-template-columns: repeat(4, minmax(0, 1fr));\n  gap: 12px;\n  margin-bottom: 20px;\n}\n.rk-kpi {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  padding: 12px 14px;\n  background: var(--color-surface-2);\n  border-radius: var(--radius-md);\n}\n.rk-kpi span {\n  font-size: 11px;\n  font-weight: 700;\n  letter-spacing: 0.04em;\n  text-transform: uppercase;\n  color: var(--color-text-muted);\n}\n.rk-kpi strong {\n  font-family: var(--font-display);\n  font-size: 20px;\n  font-weight: 900;\n  color: var(--color-text);\n  font-variant-numeric: tabular-nums;\n}\n\n/* Pódio: 2º · 1º · 3º */\n.rk-podium {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  align-items: end;\n  gap: 14px;\n  margin-bottom: 20px;\n}\n.rk-podium__card {\n  --rk-medal: #8c9aa8;\n  --rk-tint: rgba(140, 154, 168, 0.10);\n  position: relative;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  text-align: center;\n  min-width: 0;\n  padding: 22px 14px 16px;\n  background: linear-gradient(180deg, var(--rk-tint) 0%, var(--color-surface) 70%);\n  border: 1.5px solid var(--color-border);\n  border-top: 4px solid var(--rk-medal);\n  border-radius: var(--radius-lg);\n  transition: box-shadow var(--transition), transform var(--transition);\n}\n.rk-podium__card:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }\n.rk-podium__card--1 { order: 2; --rk-medal: #F5B301; --rk-tint: rgba(245, 179, 1, 0.14); padding-top: 30px; padding-bottom: 24px; }\n.rk-podium__card--2 { order: 1; }\n.rk-podium__card--3 { order: 3; --rk-medal: #c17f5a; --rk-tint: rgba(193, 127, 90, 0.12); }\n.rk-podium__card.is-me { border-color: var(--color-accent); }\n\n.rk-podium__medal {\n  position: absolute;\n  top: -14px;\n  left: 50%;\n  transform: translateX(-50%);\n  min-width: 34px;\n  height: 28px;\n  padding: 0 10px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  border-radius: 999px;\n  background: var(--rk-medal);\n  color: #fff;\n  font-family: var(--font-display);\n  font-size: 13px;\n  font-weight: 900;\n  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);\n}\n.rk-podium__avatar .avatar {\n  box-shadow: 0 0 0 3px var(--color-surface), 0 0 0 5px var(--rk-medal);\n}\n.rk-podium__avatar .avatar { width: 80px; height: 80px; font-size: 26px; }\n.rk-podium__card--1 .rk-podium__avatar .avatar { width: 96px; height: 96px; font-size: 32px; }\n\n/* Fotos do ranking: maiores, rosto enquadrado (retratos costumam ter o rosto no topo) */\n.rk img.avatar {\n  object-fit: cover;\n  object-position: center 25%;\n  background: var(--color-surface-2);\n  image-rendering: auto;\n}\n.rk-row .avatar { width: 42px; height: 42px; font-size: 14px; }\n.rk-row img.avatar { box-shadow: 0 0 0 1px var(--color-border); }\n.rk-podium__name {\n  margin-top: 12px;\n  max-width: 100%;\n  font-size: 13px;\n  font-weight: 800;\n  line-height: 1.3;\n  color: var(--color-text);\n  display: -webkit-box;\n  -webkit-line-clamp: 2;\n  -webkit-box-orient: vertical;\n  overflow: hidden;\n}\n.rk-podium__dept { margin-top: 2px; font-size: 11px; color: var(--color-text-muted); }\n.rk-podium__value {\n  margin-top: 12px;\n  font-family: var(--font-display);\n  font-size: 30px;\n  font-weight: 900;\n  line-height: 1;\n  color: var(--color-primary);\n  font-variant-numeric: tabular-nums;\n}\n.rk-podium__card--1 .rk-podium__value { font-size: 46px; color: #B98600; }\n.rk-podium__card--3 .rk-podium__value { font-size: 26px; }\n.rk-podium__card--2 .rk-podium__avatar .avatar,\n.rk-podium__card--3 .rk-podium__avatar .avatar { width: 72px; height: 72px; font-size: 24px; }\n.rk-podium__card--2, .rk-podium__card--3 { opacity: 0.97; }\n.rk-podium__card--1 { box-shadow: 0 10px 30px -12px rgba(245, 179, 1, 0.45); }\n.rk-podium__card--1 .rk-podium__name { font-size: 15px; }\n.rk-podium__value small { display: block; margin-top: 4px; font-size: 11px; font-weight: 600; color: var(--color-text-muted); }\n.rk-podium__label { margin-top: 4px; font-size: 12px; color: var(--color-text-muted); }\n.rk-podium__conv {\n  margin-top: 10px;\n  padding: 3px 10px;\n  border-radius: 999px;\n  background: rgba(16, 185, 129, 0.12);\n  color: var(--color-success);\n  font-size: 11px;\n  font-weight: 800;\n}\n.rk-podium__tier { margin-top: 10px; }\n.rk-podium__card .rk-add { margin-top: 12px; }\n\n/* Lista (4º em diante) */\n.rk-rows {\n  border: 1px solid var(--color-border);\n  border-radius: var(--radius-lg);\n  overflow: hidden;\n}\n.rk-row {\n  display: grid;\n  grid-template-columns: 32px 42px minmax(0, 1fr) minmax(0, 1.2fr) auto auto auto;\n  align-items: center;\n  gap: 14px;\n  padding: 10px 16px;\n  background: var(--color-surface);\n  border-bottom: 1px solid var(--color-border);\n  transition: background var(--transition);\n}\n.rk-row:last-child { border-bottom: none; }\n.rk-row:hover { background: var(--color-surface-2); }\n.rk-row.is-me { background: var(--color-primary-light); box-shadow: inset 3px 0 0 var(--color-accent); }\n\n.rk-row__pos {\n  font-family: var(--font-display);\n  font-size: 15px;\n  font-weight: 900;\n  text-align: center;\n  color: var(--color-text-muted);\n  font-variant-numeric: tabular-nums;\n}\n.rk-row__pos--1 { color: #F5B301; }\n.rk-row__pos--2 { color: #8c9aa8; }\n.rk-row__pos--3 { color: #c17f5a; }\n.rk-row__who { min-width: 0; }\n.rk-row__name {\n  font-size: 13px;\n  font-weight: 700;\n  color: var(--color-text);\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.rk-row__dept { font-size: 11px; color: var(--color-text-muted); }\n.rk-row__ahead {\n  font-size: 13px;\n  color: var(--color-text-muted);\n  line-height: 1.35;\n  min-width: 0;\n}\n.rk-row__ahead strong { font-weight: 900; color: var(--color-text); }\n.rk-row__conv {\n  min-width: 48px;\n  text-align: right;\n  font-size: 13px;\n  font-weight: 800;\n  color: var(--color-success);\n  font-variant-numeric: tabular-nums;\n}\n.rk-row__conv small { display: block; font-size: 10px; font-weight: 600; color: var(--color-text-muted); }\n.rk-row__metric { min-width: 90px; text-align: right; }\n.rk-row__metric strong {\n  display: block;\n  font-family: var(--font-display);\n  font-size: 16px;\n  font-weight: 900;\n  color: var(--color-text);\n  font-variant-numeric: tabular-nums;\n}\n.rk-row__metric strong small { font-size: 10px; font-weight: 600; color: var(--color-text-muted); }\n.rk-row__metric span { font-size: 11px; color: var(--color-text-muted); }\n\n.rk-me-badge {\n  display: inline-block;\n  margin-left: 4px;\n  padding: 1px 7px;\n  border-radius: 999px;\n  background: var(--color-accent);\n  color: #1a1a1a;\n  font-size: 10px;\n  font-weight: 800;\n  vertical-align: middle;\n}\n\n@media (max-width: 900px) {\n  .rk-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n}\n@media (max-width: 640px) {\n  .rk-podium { grid-template-columns: 1fr; align-items: stretch; }\n  .rk-podium__card--1, .rk-podium__card--2, .rk-podium__card--3 { order: 0; }\n  .rk-row {\n    grid-template-columns: 26px 42px minmax(0, 1fr) auto;\n    gap: 10px;\n    padding: 10px 12px;\n  }\n  .rk-row__conv, .rk-row__tier { display: none; }\n  .rk-row__ahead { grid-column: 3 / -1; grid-row: 2; }\n  .rk-row .rk-add { grid-column: 3 / -1; justify-self: start; }\n}\n\n/* Coroa + brilho do líder */\n.rk-podium__avatar { position: relative; }\n.rk-crown {\n  position: absolute;\n  top: -20px;\n  left: 50%;\n  width: 34px;\n  height: 22px;\n  transform: translateX(-50%) rotate(-8deg);\n  fill: #F5B301;\n  filter: drop-shadow(0 2px 3px rgba(185, 134, 0, 0.45));\n  z-index: 1;\n}\n.rk-podium__card--1 .rk-podium__avatar .avatar {\n  box-shadow: 0 0 0 3px var(--color-surface), 0 0 0 5px #F5B301, 0 0 22px 4px rgba(245, 179, 1, 0.45);\n  animation: rkGlow 3.2s ease-in-out infinite;\n}\n@keyframes rkGlow {\n  0%, 100% { box-shadow: 0 0 0 3px var(--color-surface), 0 0 0 5px #F5B301, 0 0 16px 2px rgba(245, 179, 1, 0.30); }\n  50%      { box-shadow: 0 0 0 3px var(--color-surface), 0 0 0 5px #F5B301, 0 0 26px 6px rgba(245, 179, 1, 0.55); }\n}\n.rk-podium__card--1 { padding-top: 38px; }\n\n/* \"Faltam X\" do vendedor logado */\n.rk-gap {\n  display: inline-block;\n  margin-top: 6px;\n  padding: 3px 10px;\n  border-radius: 999px;\n  background: rgba(74, 127, 255, 0.12);\n  color: var(--color-accent-dark);\n  font-size: 11px;\n  font-weight: 700;\n  white-space: normal;\n}\n.rk-gap strong { font-weight: 900; }\n.rk-gap--lead { background: rgba(245, 179, 1, 0.16); color: #B98600; }\n.rk-podium__card .rk-gap { margin-top: 10px; }\n\n/* Animação só na primeira abertura */\n.rk--anim .rk-kpi { animation: rkFade 0.4s ease both; }\n.rk--anim .rk-podium__card { animation: rkRise 0.55s cubic-bezier(.2, .8, .2, 1) backwards; }\n.rk--anim .rk-podium__card--3 { animation-delay: 0.05s; }\n.rk--anim .rk-podium__card--2 { animation-delay: 0.15s; }\n.rk--anim .rk-podium__card--1 { animation-delay: 0.28s; }\n.rk--anim .rk-podium__card--1 .rk-crown { animation: rkCrown 0.5s 0.75s cubic-bezier(.3, 1.6, .5, 1) backwards; }\n.rk--anim .rk-rows { animation: rkFade 0.4s 0.3s ease both; }\n@keyframes rkFade { from { opacity: 0; } to { opacity: 1; } }\n@keyframes rkRise { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }\n@keyframes rkCrown {\n  from { opacity: 0; transform: translateX(-50%) translateY(-10px) rotate(-30deg) scale(0.4); }\n  to   { opacity: 1; transform: translateX(-50%) rotate(-8deg) scale(1); }\n}\n@media (prefers-reduced-motion: reduce) {\n  .rk *, .rk--anim * { animation: none !important; }\n}\n\n/* Período em botões (segmentado) */\n.rk-seg {\n  display: inline-flex;\n  padding: 3px;\n  gap: 2px;\n  background: var(--color-surface-2);\n  border: 1px solid var(--color-border);\n  border-radius: 10px;\n  min-height: 40px;\n}\n.rk-seg__btn {\n  padding: 0 14px;\n  border: 0;\n  border-radius: 8px;\n  background: transparent;\n  color: var(--color-text-muted);\n  font: inherit;\n  font-size: 13px;\n  font-weight: 700;\n  cursor: pointer;\n  white-space: nowrap;\n  transition: background var(--transition), color var(--transition), box-shadow var(--transition);\n}\n.rk-seg__btn:hover { color: var(--color-text); }\n.rk-seg__btn.is-active {\n  background: var(--color-surface);\n  color: var(--color-primary);\n  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);\n}\n.rk-seg__btn:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }\n@media (max-width: 640px) {\n  .rk-seg { display: flex; }\n  .rk-seg__btn { flex: 1; padding: 0 8px; }\n}\n";document.head.appendChild(style);})();
/* Ranking de vendas — classificação (faixas) + filtros Status e Fase */

window.SalesRanking = {
  _cache: { proposals: null, at: 0 },
  // Padrão alinhado ao dashboard: Este mês + Fatura Total + valor final.
  _filters: { period: 'month', status: '', fase: '', billing: 'total' },

  BILLING_OPTIONS: [
    { v: 'total', l: 'Fatura Total' },
    { v: 'cadastradas', l: 'Cadastradas' },
    { v: 'pagas', l: 'Pagas' },
    { v: 'digitadas', l: 'Digitadas' },
    { v: 'canceladas', l: 'Canceladas' },
  ],

  STATUS_OPTIONS: [
    'Em Andamento', 'AG. BOLETO', 'Digitação', 'PROPOSTA DIGITADA', 'AG. ASS TERMO',
    'AG. VÍDEO', 'AG. DOCS GARANTIA', 'AG. ASS PROPOSTA', 'BOLETO VALIDADO', 'AG. QUITAÇÃO', 'BOLETO QUITADO',
    'AG. LIBERAÇÃO MARGEM', 'AVERBADO', 'PAGO', 'Pendenciado', 'Cancelado',
  ],

  FASE_OPTIONS: (window.Proposals && Proposals._VENDOR_SITUACOES)
    ? Proposals._VENDOR_SITUACOES.map(o => o.v)
    : [
        'Em Andamento', 'Digitação', 'AG. BOLETO', 'PROPOSTA DIGITADA', 'AG. ASS TERMO',
        'AG. VÍDEO', 'AG. DOCS GARANTIA', 'AG. ASS PROPOSTA', 'BOLETO VALIDADO', 'AG. QUITAÇÃO', 'BOLETO QUITADO',
        'AG. LIBERAÇÃO MARGEM', 'AVERBADO', 'PAGO', 'Pendenciado', 'Cancelado',
      ],

  _norm(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  },

  _proposalStatus(p) {
    return String(p.status || '').trim();
  },

  _proposalFase(p) {
    return String(p.statusOp || p.status_op || '').trim();
  },

  _matchesFilter(fieldVal, want) {
    if (window.Proposals && typeof Proposals._matchesStatusFilter === 'function') {
      return Proposals._matchesStatusFilter({ status: fieldVal, statusOp: fieldVal }, want);
    }
    const wantNorm = this._norm(want);
    if (!wantNorm || wantNorm === 'todos') return true;
    const val = this._norm(fieldVal);
    if (!val) return false;
    if (val === wantNorm) return true;
    if (wantNorm === 'ag. boleto' && (val === 'ag. boleto' || val.includes('aguardando boleto'))) return true;
    if (wantNorm === 'ag. ass termo' && val.includes('ass termo')) return true;
    if (wantNorm === 'ag. video' && (val.includes('video') || val.includes('vídeo'))) return true;
    if (wantNorm === 'ag. ass proposta' && val.includes('ass proposta')) return true;
    if (wantNorm === 'ag. quitacao' && (val.includes('quitacao') || val.includes('quitação'))) return true;
    if (wantNorm === 'ag. liberacao margem' && val.includes('liberacao') && val.includes('margem')) return true;
    if (wantNorm === 'digitacao' && (val === 'digitacao' || val === 'digitação')) return true;
    if (wantNorm === 'pendenciado' && (val === 'pendenciado' || val === 'pendente')) return true;
    return false;
  },

  _periodRange(periodKey) {
    const now = new Date();
    if (periodKey === 'all') return { start: null, end: null };
    if (periodKey === 'last_month') {
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        end: new Date(now.getFullYear(), now.getMonth(), 1),
      };
    }
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  },

  _periodLabel(periodKey) {
    return { month: 'Este mês', last_month: 'Mês anterior', all: 'Todo o período' }[periodKey] || 'Período';
  },

  _billingLabel(billingKey) {
    const hit = (this.BILLING_OPTIONS || []).find((o) => o.v === billingKey);
    return hit?.l || 'Fatura Total';
  },

  _matchesBillingStatus(p, billingKey) {
    if (typeof DB !== 'undefined' && typeof DB.proposalMatchesBillingStatus === 'function') {
      return DB.proposalMatchesBillingStatus(p, billingKey || 'total');
    }
    const f = String(billingKey || 'total').toLowerCase().trim();
    if (f === 'total' || f === 'todas' || f === 'all' || !f) return true;
    if (f === 'cadastradas' || f === 'cadastrada') return true;
    if (f === 'pagas') return this._isPaidProposal(p);
    if (f === 'canceladas') return this._isCancelledProposal(p);
    if (f === 'digitadas') {
      if (typeof DB !== 'undefined' && typeof DB.proposalDigitacaoAt === 'function') {
        return !!DB.proposalDigitacaoAt(p);
      }
      return false;
    }
    return true;
  },

  _proposalBillingDate(p, billingKey) {
    const sk = billingKey || this._filters?.billing || 'total';
    if (typeof DB !== 'undefined' && typeof DB.proposalBillingDate === 'function') {
      return DB.proposalBillingDate(p, sk);
    }
    if (typeof DB !== 'undefined' && typeof DB.proposalCreatedDate === 'function') {
      return DB.proposalCreatedDate(p);
    }
    const raw = p.createdAt || p.created_at || p.updatedAt || p.updated_at;
    const d = raw ? new Date(raw) : new Date(0);
    return Number.isNaN(d.getTime()) ? new Date(0) : d;
  },

  _proposalDate(p) {
    if (typeof DB !== 'undefined' && typeof DB.proposalDate === 'function') {
      return DB.proposalDate(p);
    }
    const raw = p.updatedAt || p.updated_at || p.createdAt || p.created_at;
    const d = raw ? new Date(raw) : new Date(0);
    return Number.isNaN(d.getTime()) ? new Date(0) : d;
  },

  _proposalAmount(p) {
    if (typeof DB !== 'undefined' && typeof DB.proposalAmount === 'function') {
      return DB.proposalAmount(p);
    }
    const vf = parseFloat(p?.valorFinal ?? p?.valor_final ?? 0);
    const v = parseFloat(p?.valor ?? 0);
    if (Number.isFinite(vf) && vf > 0) return vf;
    if (Number.isFinite(v) && v > 0) return v;
    return 0;
  },

  _proposalGrossAmount(p) {
    if (typeof DB !== 'undefined' && typeof DB.proposalGrossAmount === 'function') {
      return DB.proposalGrossAmount(p);
    }
    const v = parseFloat(p?.valor ?? 0);
    return Number.isFinite(v) && v > 0 ? v : 0;
  },

  _proposalChartAmount(p, billingKey) {
    const billing = billingKey || this._filters.billing || 'total';
    if (typeof DB !== 'undefined' && typeof DB.proposalChartBillingAmount === 'function') {
      return DB.proposalChartBillingAmount(p, billing);
    }
    return billing === 'pagas' ? this._proposalAmount(p) : this._proposalGrossAmount(p);
  },

  _vendorId(p) {
    if (typeof DB !== 'undefined' && typeof DB.proposalVendorId === 'function') {
      return DB.proposalVendorId(p);
    }
    return String(p.vendorId || p.vendor_id || p.employee_id || '').trim();
  },

  _buildVendorIndex(users) {
    const byId = new Map();
    const byName = new Map();
    (users || []).forEach((u) => {
      if (u?.id) byId.set(String(u.id), String(u.id));
      const n = this._norm(u.name);
      if (n) byName.set(n, String(u.id));
    });
    return { byId, byName };
  },

  async _getUsersByVendorName() {
    if (this._vendorNameMap) return this._vendorNameMap;
    let users = [];
    try { users = await DB.getAllUsers(); } catch (_) { /* noop */ }
    const map = {};
    (users || []).forEach((u) => {
      const n = this._norm(u.name);
      if (n && u?.id) map[n] = String(u.id);
    });
    this._vendorNameMap = map;
    return map;
  },

  _resolveVendorId(p, vendorIndex, usersByName, masterMode = false) {
    if (!masterMode) {
      const id = this._vendorId(p);
      if (id && vendorIndex?.byId?.has(id)) return id;
      if (!vendorIndex) return id || '';
      const vn = this._norm(p.vendorName || p.vendor_name);
      if (vn && vendorIndex.byName.has(vn)) return vendorIndex.byName.get(vn);
      return '';
    }
    const nameMap = usersByName
      || (vendorIndex?.byName ? Object.fromEntries(vendorIndex.byName) : null);
    if (typeof DB !== 'undefined' && typeof DB.resolveProposalVendorId === 'function') {
      return DB.resolveProposalVendorId(p, nameMap || {});
    }
    const id = this._vendorId(p);
    if (id) return id;
    if (!vendorIndex) return '';
    const vn = this._norm(p.vendorName || p.vendor_name);
    if (vn && vendorIndex.byName.has(vn)) return vendorIndex.byName.get(vn);
    return '';
  },

  async _loadProposals(opts = {}) {
    const force = !!opts.force;
    const ttl = 45000;
    if (!force && this._cache.proposals && Date.now() - this._cache.at < ttl) {
      return this._cache.proposals;
    }
    if (!force && !opts.skipDashCache && Array.isArray(window._dashProposalsCache) && window._dashProposalsCache.length) {
      const fromDash = (window.Proposals && Proposals._normProposal)
        ? window._dashProposalsCache.map((p) => Proposals._normProposal(p))
        : window._dashProposalsCache;
      this._cache.proposals = fromDash;
      this._cache.at = Date.now();
      return fromDash;
    }
    if (force && typeof DB !== 'undefined' && typeof DB._invalidateProposalsCache === 'function') {
      try { DB._invalidateProposalsCache(); } catch (_) { /* noop */ }
    }
    let rows = [];
    try {
      if (opts.fullList && typeof DB.listProposals === 'function') {
        rows = await DB.listProposals();
      } else if (typeof DB.listProposalsLite === 'function') {
        // Mesma base do dashboard (listProposalsLite) para os totais baterem no relatório.
        rows = await DB.listProposalsLite({ all: true });
      } else if (typeof DB.listProposals === 'function') rows = await DB.listProposals();
      else if (typeof DB.list === 'function') rows = await DB.list('proposals');
      else if (typeof DB.getProposals === 'function') rows = await DB.getProposals();
    } catch (e) {
      console.warn('[SalesRanking] propostas:', e);
    }
    const norm = (window.Proposals && Proposals._normProposal)
      ? (rows || []).map(p => Proposals._normProposal(p))
      : rows || [];
    this._cache.proposals = norm;
    this._cache.at = Date.now();
    return norm;
  },

  invalidateCache() {
    this._cache.proposals = null;
    this._cache.at = 0;
    if (typeof DB !== 'undefined' && typeof DB._invalidateProposalsCache === 'function') {
      try { DB._invalidateProposalsCache(); } catch (_) { /* noop */ }
    }
  },

  _scopeProposals(proposals, userIds, vendorIndex, usersByName, masterMode = false) {
    const set = new Set((userIds || []).map(String));
    if (!set.size) return proposals || [];
    return (proposals || []).filter((p) => {
      const vid = this._resolveVendorId(p, vendorIndex, usersByName, masterMode);
      return vid && set.has(String(vid));
    });
  },

  _isCancelledProposal(p) {
    if (typeof DB !== 'undefined' && typeof DB.isCancelledProposal === 'function') {
      return DB.isCancelledProposal(p);
    }
    const st = this._norm(this._proposalStatus(p));
    const fase = this._norm(this._proposalFase(p));
    return st.includes('cancel') || fase.includes('cancel');
  },

  _funnelBucket(p) {
    if (typeof DB !== 'undefined' && typeof DB.proposalFunnelBucket === 'function') {
      return DB.proposalFunnelBucket(p);
    }
    if (this._isCancelledProposal(p)) return 'cancelado';
    if (this._isPaidProposal(p)) return 'efetivado';
    return 'cobranca';
  },

  /** Funil por período (sem Status/Fase): bruto / efetivado / cobrança / cancelado. */
  _aggregateFunnel(users, proposals, vendorIndex, usersByName, masterMode = true) {
    const byVendor = {};
    (proposals || []).forEach((p) => {
      const vid = this._resolveVendorId(p, vendorIndex, usersByName, masterMode);
      if (!vid) return;
      if (!byVendor[vid]) {
        byVendor[vid] = { count: 0, bruto: 0, efetivado: 0, cobranca: 0, cancelado: 0 };
      }
      const amtFinal = this._proposalAmount(p);
      const amtGross = this._proposalGrossAmount(p);
      byVendor[vid].count += 1;
      byVendor[vid].bruto += amtGross;
      const bucket = this._funnelBucket(p);
      byVendor[vid][bucket] += amtFinal;
    });
    const map = {};
    (users || []).forEach((u) => {
      map[u.id] = byVendor[u.id] || { count: 0, bruto: 0, efetivado: 0, cobranca: 0, cancelado: 0 };
    });
    return map;
  },

  _filterByPeriodOnly(proposals) {
    const { start, end } = this._periodRange(this._filters.period);
    const billingWant = this._filters.billing || 'total';
    return (proposals || []).filter((p) => {
      if (!p || !p.id) return false;
      const d = this._proposalBillingDate(p, billingWant);
      if (start && d < start) return false;
      if (end && d >= end) return false;
      return true;
    });
  },

  _fmtMoneyPlain(v) {
    return (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  _escHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  _downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 800);
  },

  _reportStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  },

  _filtersSubtitle() {
    const parts = [this._periodLabel(this._filters.period)];
    parts.push(this._billingLabel(this._filters.billing || 'total'));
    if (this._filters.status) parts.push(`Status: ${this._filters.status}`);
    if (this._filters.fase) parts.push(`Fase: ${this._filters.fase}`);
    return parts.join(' · ');
  },

  async _buildReportRows(viewer) {
    if (!this._canViewSalesAmount(viewer)) {
      throw new Error('Sem permissão para baixar valores do ranking.');
    }
    const users = await this._loadAllRankingVendors();
    const usersByName = await this._getUsersByVendorName();
    const vendorIndex = this._buildVendorIndex(users);
    const { filtered, scoped, rows, dashTotal, rankedTotal } = await this._prepareRankingData({ force: true });
    const funnel = this._aggregateFunnel(users, scoped, vendorIndex, usersByName);
    const reportTotal = dashTotal;
    const orphanRow = this._buildOrphanReportRow(filtered, users, vendorIndex, usersByName);
const reportRows = rows.map((row, i) => {
      const f = funnel[row.user.id] || { count: 0, bruto: 0, efetivado: 0, cobranca: 0, cancelado: 0 };
      return {
        pos: i + 1,
        name: (row.user.name || '—') + (row.user.active === false || row.user.active === 0 ? ' (inativo)' : ''),
        department: row.user.department || '—',
        matricula: row.user.matricula || '—',
        inactive: row.user.active === false || row.user.active === 0,
        tier: row.tier?.label || 'Abaixo FAIXA1',
        qtd: row.count || 0,
        faturamento: row.total || 0,
        qtdPeriodo: f.count,
        bruto: f.bruto,
        efetivado: f.efetivado,
        cobranca: f.cobranca,
        cancelado: f.cancelado,
      };
    });
    if (orphanRow) {
      orphanRow.pos = reportRows.length + 1;
      reportRows.push(orphanRow);
    }
    reportRows._meta = { reportTotal, rankedTotal, filters: this._filtersSubtitle() };
    return reportRows;
  },

  _buildReportHtml(reportRows) {
    const generated = new Date().toLocaleString('pt-BR');
    const meta = reportRows?._meta || {};
    const filters = meta.filters || this._filtersSubtitle();
    const reportTotal = meta.reportTotal ?? (reportRows || []).reduce((s, r) => s + (r.faturamento || 0), 0);
    const totalQtd = (reportRows || []).reduce((s, r) => s + (r.qtd || 0), 0);
    const totalBruto = (reportRows || []).reduce((s, r) => s + (r.bruto || 0), 0);
    const totalEfet = (reportRows || []).reduce((s, r) => s + (r.efetivado || 0), 0);
    const totalCob = (reportRows || []).reduce((s, r) => s + (r.cobranca || 0), 0);
    const totalCanc = (reportRows || []).reduce((s, r) => s + (r.cancelado || 0), 0);
    const body = (reportRows || []).filter((r) => !r._meta).map((r) => `<tr>
      <td style="text-align:center">${r.pos}</td>
      <td>${this._escHtml(r.name)}</td>
      <td style="text-align:center">${this._escHtml(r.tier)}</td>
      <td>${r.qtd}</td>
      <td class="efetivado">${this._fmtMoneyPlain(r.faturamento)}</td>
      <td>${this._fmtMoneyPlain(r.bruto)}</td>
      <td class="efetivado">${this._fmtMoneyPlain(r.efetivado)}</td>
      <td class="cobranca">${this._fmtMoneyPlain(r.cobranca)}</td>
      <td class="cancelado">${this._fmtMoneyPlain(r.cancelado)}</td>
    </tr>`).join('\n');

    return `<!DOCTYPE html>
<html lang='pt-BR'>
<head>
<meta charset='UTF-8'>
<title>Relatório Ranking de Vendas</title>
<style>
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #fff; color: #333; padding: 40px; }
  h1 { text-align: center; color: #1a73e8; margin-bottom: 8px; }
  .meta { text-align: center; color: #555; font-size: 13px; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
  th, td { border: 1px solid #ddd; padding: 10px; text-align: right; }
  th { background-color: #f1f3f4; color: #333; font-weight: 600; text-align: center; }
  td:nth-child(2) { text-align: left; font-weight: 500; }
  .efetivado { color: #0d652d; font-weight: bold; }
  .cobranca { color: #b06000; }
  .cancelado { color: #c5221f; }
  .footer { margin-top: 30px; font-size: 12px; color: #777; text-align: center; }
  .hint { font-size: 12px; color: #666; text-align: center; max-width: 820px; margin: 0 auto 12px; }
  @media print {
    body { padding: 0; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <div class='no-print' style='background: #e8f0fe; padding: 15px; text-align: center; margin-bottom: 20px; border-radius: 8px;'>
    <strong>Dica:</strong> Para salvar como PDF, pressione <code>Ctrl + P</code> e escolha 'Salvar como PDF'.
  </div>
  <h1>Ranking de Vendas — Relatório</h1>
  <div class='meta'>Filtros: ${this._escHtml(filters)}</div>
  <p class='hint'>
    <strong>Faturamento</strong> = valor final · mesmos filtros do dashboard
    (<strong>período + Fatura Total / Cadastradas / Pagas / Digitadas / Canceladas</strong>).
    Todas as colunas usam o <strong>mesmo conjunto de propostas</strong> do Painel Master.
  </p>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Vendedor</th>
        <th>Classificação</th>
        <th>Qtd (filtros)</th>
        <th>Faturamento (R$)</th>
        <th>Valor Bruto (R$)</th>
        <th>Efetivado / Faturado (R$)</th>
        <th>Em Cobrança (R$)</th>
        <th>Cancelado (R$)</th>
      </tr>
    </thead>
    <tbody>
${body || '<tr><td colspan="9" style="text-align:center">Nenhum dado</td></tr>'}
    </tbody>
    <tfoot>
      <tr style="font-weight:800;background:#f8fafc;">
        <td colspan="3" style="text-align:left">TOTAL GERAL</td>
        <td>${totalQtd}</td>
        <td class="efetivado">${this._fmtMoneyPlain(reportTotal)}</td>
        <td>${this._fmtMoneyPlain(totalBruto)}</td>
        <td class="efetivado">${this._fmtMoneyPlain(totalEfet)}</td>
        <td class="cobranca">${this._fmtMoneyPlain(totalCob)}</td>
        <td class="cancelado">${this._fmtMoneyPlain(totalCanc)}</td>
      </tr>
    </tfoot>
  </table>
  <div class='footer'>Gerado em: ${this._escHtml(generated)} · SOU + BLU</div>
</body>
</html>`;
  },

  _buildReportAoA(reportRows) {
    const headers = [
      '#', 'Vendedor', 'Departamento', 'Matrícula', 'Classificação',
      'Qtd (filtros)', 'Faturamento (R$)',
      'Qtd período', 'Valor Bruto (R$)', 'Efetivado / Faturado (R$)',
      'Em Cobrança (R$)', 'Cancelado (R$)',
    ];
    const rows = (reportRows || []).filter((r) => r && !r._meta);
    const data = rows.map((r) => [
      r.pos, r.name, r.department, r.matricula, r.tier,
      r.qtd, Number(r.faturamento) || 0,
      r.qtdPeriodo, Number(r.bruto) || 0, Number(r.efetivado) || 0,
      Number(r.cobranca) || 0, Number(r.cancelado) || 0,
    ]);
    const meta = reportRows?._meta || {};
    const reportTotal = meta.reportTotal ?? rows.reduce((s, r) => s + (Number(r.faturamento) || 0), 0);
    const totalRow = [
      '', 'TOTAL GERAL', '', '', '',
      rows.reduce((s, r) => s + (r.qtd || 0), 0),
      reportTotal,
      rows.reduce((s, r) => s + (r.qtdPeriodo || 0), 0),
      rows.reduce((s, r) => s + (Number(r.bruto) || 0), 0),
      rows.reduce((s, r) => s + (Number(r.efetivado) || 0), 0),
      rows.reduce((s, r) => s + (Number(r.cobranca) || 0), 0),
      rows.reduce((s, r) => s + (Number(r.cancelado) || 0), 0),
    ];
    return [headers, ...data, totalRow];
  },

  async exportReport(format, opts = {}) {
    const viewer = opts.viewer
      || (typeof Auth !== 'undefined' ? Auth.getSession() : null)
      || window.currentUser
      || null;
    if (!this._canViewSalesAmount(viewer)) {
      if (typeof showToast === 'function') showToast('Sem permissão para baixar o relatório de valores.', 'error');
      return;
    }
    const prefix = opts.prefix || 'Admin';
    this._readFilters(prefix);
    if (typeof showToast === 'function') showToast('Gerando relatório…', 'info');
    let reportRows;
    try {
      reportRows = await this._buildReportRows(viewer);
    } catch (e) {
      console.warn('[SalesRanking] export:', e);
      if (typeof showToast === 'function') showToast(e.message || 'Falha ao gerar relatório.', 'error');
      return;
    }
    if (!reportRows.length) {
      if (typeof showToast === 'function') showToast('Nenhum vendedor neste filtro para exportar.', 'warning');
      return;
    }
    const stamp = this._reportStamp();
    const base = `Relatorio_Ranking_${stamp}`;
    try {
      if (format === 'html') {
        const html = this._buildReportHtml(reportRows);
        this._downloadBlob(`${base}.html`, new Blob([html], { type: 'text/html;charset=utf-8' }));
      } else if (format === 'csv') {
        const aoa = this._buildReportAoA(reportRows);
        const lines = aoa.map((row) => row.map((c) => {
          if (typeof c === 'number') {
            return String(c).replace('.', ',');
          }
          return `"${String(c ?? '').replace(/"/g, '""')}"`;
        }).join(';'));
        this._downloadBlob(
          `${base}.csv`,
          new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
        );
      } else if (format === 'xlsx') {
        if (typeof window.ensureXlsx === 'function') {
          await window.ensureXlsx();
        } else if (typeof XLSX === 'undefined') {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Falha ao carregar SheetJS'));
            document.head.appendChild(s);
          });
        }
        if (typeof XLSX === 'undefined') throw new Error('Excel (SheetJS) não carregou.');
        const aoa = this._buildReportAoA(reportRows);
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Ranking');
        XLSX.writeFile(wb, `${base}.xlsx`);
      } else {
        throw new Error('Formato inválido.');
      }
      if (typeof showToast === 'function') showToast('Relatório baixado.', 'success');
    } catch (e) {
      console.warn('[SalesRanking] download:', e);
      if (typeof showToast === 'function') showToast(e.message || 'Falha no download.', 'error');
    }
  },

  _filterProposals(proposals) {
    const { start, end } = this._periodRange(this._filters.period);
    const statusWant = this._filters.status;
    const faseWant = this._filters.fase;
    const billingWant = this._filters.billing || 'total';

    return (proposals || []).filter(p => {
      if (!p || !p.id) return false;

      const d = this._proposalBillingDate(p, billingWant);
      if (start && d < start) return false;
      if (end && d >= end) return false;

      if (!this._matchesBillingStatus(p, billingWant)) return false;

      const st = this._proposalStatus(p);
      const fase = this._proposalFase(p);

      if (statusWant) {
        const stHit = this._matchesFilter(st, statusWant);
        const fallbackHit = !st && this._matchesFilter(fase, statusWant);
        if (!stHit && !fallbackHit) return false;
      }
      if (faseWant && !this._matchesFilter(fase, faseWant)) return false;
      return true;
    });
  },

  /** Mesmo filtro do gráfico do dashboard (período + faturamento), quando não há Status/Fase extra. */
  _filterForDashboardSync(proposals) {
    const period = this._filters.period || 'month';
    const billing = this._filters.billing || 'total';
    const hasExtra = !!(this._filters.status || this._filters.fase);
    const dashFilter = typeof window._dashBillingFilter === 'string' ? window._dashBillingFilter : null;
    const dashBilling = typeof window._dashBillingStatusFilter === 'string' ? window._dashBillingStatusFilter : null;
    const filterKey = (!hasExtra && dashFilter && dashBilling === billing) ? dashFilter : period;
    if (!hasExtra && typeof window._filterPropsForTeamBilling === 'function'
      && (filterKey === 'month' || filterKey === 'all' || filterKey === 'custom' || filterKey === 'day' || filterKey === 'year')) {
      return window._filterPropsForTeamBilling(proposals, filterKey, billing);
    }
    return this._filterProposals(proposals);
  },

  async _prepareRankingData(opts = {}) {
    const users = await this._loadAllRankingVendors();
    const usersByName = await this._getUsersByVendorName();
    const vendorIndex = this._buildVendorIndex(users);
    const userIds = users.map((u) => u.id);
    const rawProps = await this._loadProposals(opts);
    const filtered = this._filterForDashboardSync(rawProps);
    const scoped = this._scopeProposals(filtered, userIds, vendorIndex, usersByName, true);
    const rows = this._aggregate(users, scoped, vendorIndex, usersByName, true);
    const dashTotal = filtered.reduce((s, p) => s + this._proposalChartAmount(p), 0);
    const dashTotalBruto = filtered.reduce((s, p) => s + this._proposalGrossAmount(p), 0);
    const rankedTotal = rows.reduce((s, r) => s + (r.total || 0), 0);
    const rankedIds = new Set(userIds.map(String));
    let orphanCount = 0;
    let orphanTotal = 0;
    filtered.forEach((p) => {
      const vid = this._resolveVendorId(p, vendorIndex, usersByName, true);
      if (!vid || !rankedIds.has(String(vid))) {
        orphanCount += 1;
        orphanTotal += this._proposalChartAmount(p);
      }
    });
return { users, vendorIndex, usersByName, userIds, rawProps, filtered, scoped, rows, dashTotal, dashTotalBruto, rankedTotal, orphanCount, orphanTotal };
  },

  _buildOrphanReportRow(filtered, users, vendorIndex, usersByName) {
    const rankedIds = new Set((users || []).map((u) => String(u.id)));
    let count = 0;
    let total = 0;
    let bruto = 0;
    let efetivado = 0;
    let cobranca = 0;
    let cancelado = 0;
    (filtered || []).forEach((p) => {
      const vid = this._resolveVendorId(p, vendorIndex, usersByName, true);
      if (vid && rankedIds.has(String(vid))) return;
      count += 1;
      const amt = this._proposalChartAmount(p);
      total += amt;
      bruto += this._proposalGrossAmount(p);
      const bucket = this._funnelBucket(p);
      if (bucket === 'efetivado') efetivado += amt;
      else if (bucket === 'cancelado') cancelado += amt;
      else cobranca += amt;
    });
    if (!count) return null;
    return {
      pos: 0,
      name: 'Parceiros / Sem vendedor',
      department: '—',
      matricula: '—',
      tier: '—',
      qtd: count,
      faturamento: total,
      qtdPeriodo: count,
      bruto,
      efetivado,
      cobranca,
      cancelado,
      _orphan: true,
    };
  },

  /** Ranking dos funcionários (employee.html) — sem filtros master nem valores em R$. */
  async _renderPublicRanking(listId, opts = {}) {
    const users = await this._loadAllRankingVendors();
    const vendorIndex = this._buildVendorIndex(users);
    const userIds = users.map((u) => u.id);
    const rawProps = await this._loadProposals({ force: true, skipDashCache: true, fullList: true });
    const allProps = this._scopeProposals(rawProps, userIds, vendorIndex, null, false);
    const rows = this._aggregateByPaidAndProposals(users, allProps, vendorIndex, null, false);
this._renderList(listId, rows, {
      viewerId: opts.viewerId || '',
      viewer: opts.viewer || null,
      showSalesAmount: false,
      rankMode: 'public',
      allowAddPoints: false,
    });
    return { users, rows, allProps };
  },

  _tierForSales(total) {
    if (typeof VendorTierPoints !== 'undefined' && VendorTierPoints.tierForSales) {
      return VendorTierPoints.tierForSales(total);
    }
    return null;
  },

  _canViewSalesAmount(viewer) {
    return typeof canViewRankingSalesValues === 'function'
      ? canViewRankingSalesValues(viewer)
      : false;
  },

  /** Master/fundador/gerência: filtros + faturamento. Demais: lista global por pagas e propostas. */
  _isMasterRankingMode(viewer) {
    return this._canViewSalesAmount(viewer);
  },

  _rankingToolbarCard(filtersId, summaryId) {
    const filters = document.getElementById(filtersId);
    const summary = document.getElementById(summaryId);
    return filters?.closest('.card') || summary?.closest('.card') || null;
  },

  _showRankingToolbar(filtersId, summaryId) {
    const card = this._rankingToolbarCard(filtersId, summaryId);
    if (card) card.style.display = '';
    const filters = document.getElementById(filtersId);
    const summary = document.getElementById(summaryId);
    if (filters) filters.style.display = '';
    if (summary) summary.style.display = '';
  },

  /** Esconde filtros/resumo e o card vazio na página (filtros ficam no modal Configurações). */
  _hideRankingToolbar(filtersId, summaryId) {
    const filters = document.getElementById(filtersId);
    const summary = document.getElementById(summaryId);
    if (filters) {
      filters.innerHTML = '';
      filters.style.display = 'none';
    }
    if (summary) {
      summary.textContent = '';
      summary.style.display = 'none';
    }
    const card = this._rankingToolbarCard(filtersId, summaryId);
    if (card) card.style.display = 'none';
  },

  async _loadAllRankingVendors() {
    let users = [];
    try {
      users = await DB.getAllUsers();
    } catch (e) {
      console.warn('[SalesRanking] users:', e);
    }
    /* Inclui inativos: vendas já feitas devem entrar no fechamento/ranking. */
    return (users || [])
      .filter(u => {
        const role=this._norm(u.role),department=this._norm(u.department);
        return !['desenvolvedor','desenvolvimento','developer','dev','ti'].includes(role)
          && !['desenvolvimento','ti','t.i.','tecnologia','tecnologia da informacao'].includes(department);
      })
      .filter(u => typeof isRankingParticipant === 'function' && isRankingParticipant(u, { includeInactive: true }))
      .filter(u => typeof isUserInPartnerNetworkSync !== 'function' || !isUserInPartnerNetworkSync(u));
  },

  _isPaidProposal(p) {
    if (typeof DB !== 'undefined' && typeof DB.isPaidProposal === 'function') {
      return DB.isPaidProposal(p);
    }
    const st = this._norm(this._proposalStatus(p));
    const fase = this._norm(this._proposalFase(p));
    return st === 'pago' || st.includes('pago') || fase === 'pago' || fase.includes('pago');
  },

  _fmtSales(v) {
    if (typeof VendorTierPoints !== 'undefined' && VendorTierPoints.fmtSales) {
      return VendorTierPoints.fmtSales(v);
    }
    return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  _aggregate(users, proposals, vendorIndex, usersByName, masterMode = true) {
    const billing = this._filters.billing || 'total';
    const byVendor = {};
    proposals.forEach(p => {
      const vid = this._resolveVendorId(p, vendorIndex, usersByName, masterMode);
      if (!vid) return;
      if (!byVendor[vid]) byVendor[vid] = { total: 0, bruto: 0, count: 0, paidCount: 0 };
      const amt = this._proposalChartAmount(p, billing);
      const bruto = this._proposalGrossAmount(p);
      byVendor[vid].total += amt;
      byVendor[vid].bruto += bruto;
      byVendor[vid].count += 1;
      if (this._isPaidProposal(p)) byVendor[vid].paidCount += 1;
    });
return (users || [])
      .map(u => {
        const agg = byVendor[u.id] || { total: 0, bruto: 0, count: 0, paidCount: 0 };
        return {
          user: u,
          total: agg.total,
          bruto: agg.bruto,
          count: agg.count,
          paidCount: agg.paidCount,
          tier: this._tierForSales(agg.total),
        };
      })
      .filter(r => r.count > 0)
      .sort((a, b) => b.total - a.total || b.count - a.count);
  },

  /** Ranking público: pagas + total de propostas (sem R$, pontos ou faixas). */
  _aggregateByPaidAndProposals(users, proposals, vendorIndex, usersByName, masterMode = false) {
    const byVendor = {};
    (proposals || []).forEach(p => {
      const vid = this._resolveVendorId(p, vendorIndex, usersByName, masterMode);
      if (!vid) return;
      if (!byVendor[vid]) byVendor[vid] = { paidCount: 0, count: 0 };
      byVendor[vid].count += 1;
      if (this._isPaidProposal(p)) byVendor[vid].paidCount += 1;
    });

    return (users || [])
      .map(u => {
        const agg = byVendor[u.id] || { paidCount: 0, count: 0 };
        return {
          user: u,
          total: 0,
          count: agg.count,
          paidCount: agg.paidCount,
          tier: null,
        };
      })
      .filter(r => r.count > 0)
      .sort((a, b) => b.paidCount - a.paidCount || b.count - a.count);
  },

  _prefixForList(listId) {
    return listId === 'adminRankingList' ? 'Admin' : 'Emp';
  },

  _readFilters(prefix) {
    this._filters.period = document.getElementById(`salesRankPeriod${prefix}`)?.value || this._filters.period;
    this._filters.billing = document.getElementById(`salesRankBilling${prefix}`)?.value || this._filters.billing || 'total';
    this._filters.status = document.getElementById(`salesRankStatus${prefix}`)?.value || '';
    this._filters.fase = document.getElementById(`salesRankFase${prefix}`)?.value || '';
  },

  /**
   * _renderFiltersUI — filtros/exportação só no modal Configurações (topbar).
   * Não monta mais a toolbar duplicada na página.
   */
  _renderFiltersUI(containerId, listId, opts = {}) {
    const box = document.getElementById(containerId);
    if (!box) return;
    const viewer = opts.viewer || (typeof Auth !== 'undefined' ? Auth.getSession() : null);
    const showMasterDetails = this._canViewSalesAmount(viewer);
    const prefix = this._prefixForList(listId);
    const period = this._filters.period || 'month';
    const billing = this._filters.billing || 'total';
    const status = this._filters.status || '';
    const fase = this._filters.fase || '';

    const sel = (opts, cur) => opts.map(o => {
      const v = typeof o === 'string' ? o : o.v;
      const label = typeof o === 'string' ? o : (o.l || o.v);
      return `<option value="${v}"${v === cur ? ' selected' : ''}>${label}</option>`;
    }).join('');

    const billingOpts = sel(this.BILLING_OPTIONS, billing);
    const statusOpts = sel([{ v: '', l: 'Todos os status' }, ...this.STATUS_OPTIONS.map(s => ({ v: s, l: s }))], status);
    const faseOpts = sel([{ v: '', l: 'Todas as fases' }, ...this.FASE_OPTIONS.map(s => ({ v: s, l: s }))], fase);

    box.innerHTML = `
<div class="sales-ranking-toolbar">
  <div class="sales-ranking-filter-group">
    <span class="sales-ranking-filter-label">PERÍODO</span>
    <input type="hidden" id="salesRankPeriod${prefix}" value="${period}">
    <div class="rk-seg" role="group" aria-label="Período">
      ${[['month', 'Este mês'], ['last_month', 'Mês anterior'], ['all', 'Tudo']].map(([v, l]) =>
        `<button type="button" class="rk-seg__btn${period === v ? ' is-active' : ''}" data-period="${v}" aria-pressed="${period === v}">${l}</button>`).join('')}
    </div>
  </div>
  <div class="sales-ranking-filter-group">
    <span class="sales-ranking-filter-label">FATURAMENTO</span>
    <select id="salesRankBilling${prefix}" class="form-control sales-ranking-select">${billingOpts}</select>
  </div>
  <div class="sales-ranking-filter-group">
    <span class="sales-ranking-filter-label">STATUS</span>
    <select id="salesRankStatus${prefix}" class="form-control sales-ranking-select">${statusOpts}</select>
  </div>
  <div class="sales-ranking-filter-group">
    <span class="sales-ranking-filter-label">FASE</span>
    <select id="salesRankFase${prefix}" class="form-control sales-ranking-select">${faseOpts}</select>
  </div>
  ${showMasterDetails ? `<div class="sales-ranking-filter-group sales-ranking-export-group">
    <span class="sales-ranking-filter-label">RELATÓRIO</span>
    <div class="sales-ranking-export-btns">
      <button type="button" class="btn btn-primary btn-sm" id="salesRankExportHtml${prefix}" title="Baixar HTML (como Relatorio_Vendedores)">Gerar relatório</button>
      <button type="button" class="btn btn-outline btn-sm" id="salesRankExportCsv${prefix}">CSV</button>
      <button type="button" class="btn btn-outline btn-sm" id="salesRankExportXlsx${prefix}">Excel</button>
    </div>
  </div>` : ''}
</div>
${showMasterDetails ? `<p class="form-hint" style="margin:12px 0 0;font-size:12px;">
  <strong>Faturamento</strong> = mesmo filtro do dashboard (valor final · data de criação).
  Padrão: <strong>Este mês + Fatura Total</strong> — o total geral bate com o Painel Master.
  <strong>Status/Fase</strong> refinam além do faturamento. Classificação <strong>FAIXA1–FAIXA18</strong> pelo total filtrado.
  Use <strong>Gerar relatório</strong> para baixar com os mesmos números exibidos aqui.
</p>` : ''}`;

    const rerender = () => {
      this._readFilters(prefix);
      if (listId === 'adminRankingList' && typeof renderAdminRanking === 'function') {
        renderAdminRanking();
      } else if (listId === 'rankingList' && typeof renderRanking === 'function') {
        renderRanking();
      }
    };

    box.querySelectorAll('.rk-seg__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(`salesRankPeriod${prefix}`);
        if (!input || input.value === btn.dataset.period) return;
        input.value = btn.dataset.period;
        box.querySelectorAll('.rk-seg__btn').forEach(b => {
          const on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', String(on));
        });
        rerender();
      });
    });

    [`salesRankBilling${prefix}`, `salesRankStatus${prefix}`, `salesRankFase${prefix}`].forEach(id => {
      document.getElementById(id)?.addEventListener('change', rerender);
    });

    if (showMasterDetails) {
      const exportOpts = { viewer, prefix };
      document.getElementById(`salesRankExportHtml${prefix}`)?.addEventListener('click', () => {
        this.exportReport('html', exportOpts);
      });
      document.getElementById(`salesRankExportCsv${prefix}`)?.addEventListener('click', () => {
        this.exportReport('csv', exportOpts);
      });
      document.getElementById(`salesRankExportXlsx${prefix}`)?.addEventListener('click', () => {
        this.exportReport('xlsx', exportOpts);
      });
    }
  },

  /**
   * _renderSummary — não exibe mais resumo na página (só no modal/relatório).
   */
  _renderSummary(summaryId, rows, proposals, opts = {}) {
    const el = document.getElementById(summaryId);
    if (!el) return;
    const showMasterDetails = opts.showSalesAmount !== false && this._canViewSalesAmount(opts.viewer);
    if (!showMasterDetails) {
      el.textContent = '';
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    const billing = this._filters.billing || 'total';
    const isPagas = billing === 'pagas';
    const totalBilling = proposals.reduce((s, p) => s + this._proposalChartAmount(p, billing), 0);
    const totalBruto = proposals.reduce((s, p) => s + this._proposalGrossAmount(p), 0);
    const rankedBilling = rows.reduce((s, r) => s + (r.total || 0), 0);
    const rankedBruto = rows.reduce((s, r) => s + (r.bruto || 0), 0);
    const rankedCount = rows.reduce((s, r) => s + (r.count || 0), 0);
    const vendorIndex = opts.vendorIndex;
    const unassigned = vendorIndex
      ? (proposals || []).filter((p) => !this._resolveVendorId(p, vendorIndex, opts.usersByName)).length
      : 0;
    const parts = [
      this._periodLabel(this._filters.period),
      this._billingLabel(billing),
      `${rows.length} no ranking`,
      `${proposals.length} proposta(s)`,
      `Bruto: ${this._fmtSales(totalBruto)}`,
    ];
    if (isPagas) parts.push(`Pago (final): ${this._fmtSales(totalBilling)}`);
    else parts.push(`Faturamento: ${this._fmtSales(totalBilling)}`);
    if (Math.abs(rankedBilling - totalBilling) > 0.01) {
      parts.push(`Atribuído: ${this._fmtSales(rankedBilling)} (${rankedCount} prop.)`);
    }
    if (isPagas && Math.abs(rankedBruto - totalBruto) > 0.01) {
      parts.push(`Bruto atribuído: ${this._fmtSales(rankedBruto)}`);
    }
    if (unassigned > 0) parts.push(`${unassigned} sem vendedor`);
    if (this._filters.status) parts.push(`Status: ${this._filters.status}`);
    if (this._filters.fase) parts.push(`Fase: ${this._filters.fase}`);
    el.textContent = parts.join(' · ');
  },

  /**
   * _ensureRankingTopbarConfig — botão Configurações no topbar (atalho de exportação).
   */
  _ensureRankingTopbarConfig(opts = {}) {
    const topbarActions = document.querySelector('.topbar .topbar-actions, header.topbar .topbar-actions');
    if (!topbarActions) return;

    let tools = document.getElementById('rankManageTopbarTools');
    if (!tools) {
      tools = document.createElement('div');
      tools.id = 'rankManageTopbarTools';
      tools.className = 'rank-manage-header-actions';
      const cfgBtn = document.createElement('button');
      cfgBtn.type = 'button';
      cfgBtn.id = 'btnRankManageConfig';
      cfgBtn.className = 'btn btn-outline btn-sm';
      cfgBtn.textContent = '⚙ Configurações';
      cfgBtn.title = 'Filtros e relatório do ranking';
      cfgBtn.onclick = () => this.openRankingConfigModal();
      tools.appendChild(cfgBtn);
      const anchor = topbarActions.querySelector('.minha-conta-topbar')
        || topbarActions.querySelector('button[onclick*="openMinhaConta"]')
        || topbarActions.querySelector('button[onclick*="Auth.logout"]');
      if (anchor) topbarActions.insertBefore(tools, anchor);
      else topbarActions.prepend(tools);
    }

    const show = !!opts.showMasterDetails && !!document.getElementById('secRanking')?.classList.contains('active');
    tools.hidden = !show;
    tools.style.display = show ? '' : 'none';
    document.body.classList.toggle('rank-manage-tools-active', show);

    this._rankExportCtx = {
      viewer: opts.viewer,
      prefix: opts.prefix || 'Admin',
      listId: opts.listId || 'adminRankingList',
    };
    this._ensureRankingConfigModal();
  },

  /** Modal Configurações do ranking — filtros + exportação (visual sóbrio). */
  _ensureRankingConfigModal() {
    let modal = document.getElementById('rankConfigModal');
    /* Troca layout antigo (hero/cards) pelo modal profissional. */
    if (modal && modal.dataset.ui !== 'pro1') {
      modal.remove();
      modal = null;
    }
    if (modal) return;

    const billingOpts = (this.BILLING_OPTIONS || [])
      .map((o) => `<option value="${o.v}">${o.l || o.v}</option>`).join('');
    const statusOpts = ['', ...(this.STATUS_OPTIONS || [])]
      .map((s) => `<option value="${s}">${s || 'Todos os status'}</option>`).join('');

    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'rankConfigModal';
    modal.dataset.ui = 'pro1';
    modal.innerHTML = `
      <div class="modal rank-config-modal">
        <div class="modal-header">
          <h3>Configurações do ranking</h3>
          <button type="button" class="modal-close" onclick="SalesRanking.closeRankingConfigModal()" aria-label="Fechar"></button>
        </div>
        <div class="modal-body">
          <p class="rank-config-lead">Defina os filtros e baixe o relatório com os mesmos números do ranking.</p>
          <div class="rank-config-grid">
            <div class="form-group">
              <label for="rankCfgPeriod">Período</label>
              <select id="rankCfgPeriod" class="form-control">
                <option value="month">Este mês</option>
                <option value="last_month">Mês anterior</option>
                <option value="all">Todo o período</option>
              </select>
            </div>
            <div class="form-group">
              <label for="rankCfgBilling">Faturamento</label>
              <select id="rankCfgBilling" class="form-control">${billingOpts}</select>
            </div>
            <div class="form-group">
              <label for="rankCfgStatus">Status</label>
              <select id="rankCfgStatus" class="form-control">${statusOpts}</select>
            </div>
          </div>
          <div class="rank-config-actions">
            <button type="button" class="btn btn-outline btn-sm" id="rankCfgApplyFilters">Aplicar filtros</button>
          </div>
          <hr class="rank-config-sep"/>
          <div class="form-group" style="margin-bottom:8px;">
            <label>Exportar relatório</label>
          </div>
          <div class="rank-config-exports">
            <button type="button" class="btn btn-primary btn-sm" id="rankCfgExportHtml">Gerar relatório (HTML)</button>
            <button type="button" class="btn btn-outline btn-sm" id="rankCfgExportCsv">CSV</button>
            <button type="button" class="btn btn-outline btn-sm" id="rankCfgExportXlsx">Excel</button>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" onclick="SalesRanking.closeRankingConfigModal()">Fechar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    document.getElementById('rankCfgApplyFilters')?.addEventListener('click', () => {
      this.applyRankingConfigFilters({ close: false });
    });
    const run = (fmt) => {
      /* Aplica filtros no estado; exportReport recalcula os dados. */
      this.applyRankingConfigFilters({ close: false, skipRender: true });
      const ctx = this._rankExportCtx || {};
      this.exportReport(fmt, { viewer: ctx.viewer, prefix: ctx.prefix || 'Admin' });
      this.closeRankingConfigModal();
      /* Atualiza a lista na tela com os filtros usados no relatório. */
      this.applyRankingConfigFilters({ close: false });
    };
    document.getElementById('rankCfgExportHtml')?.addEventListener('click', () => run('html'));
    document.getElementById('rankCfgExportCsv')?.addEventListener('click', () => run('csv'));
    document.getElementById('rankCfgExportXlsx')?.addEventListener('click', () => run('xlsx'));
  },

  /**
   * _fillRankingConfigModal — preenche selects do modal com this._filters.
   */
  _fillRankingConfigModal() {
    const f = this._filters || {};
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v == null ? '' : String(v);
    };
    set('rankCfgPeriod', f.period || 'month');
    set('rankCfgBilling', f.billing || 'total');
    set('rankCfgStatus', f.status || '');
  },

  /**
   * applyRankingConfigFilters — lê filtros do modal, sincroniza a página e atualiza o ranking.
   */
  applyRankingConfigFilters(opts = {}) {
    const period = document.getElementById('rankCfgPeriod')?.value || 'month';
    const billing = document.getElementById('rankCfgBilling')?.value || 'total';
    const status = document.getElementById('rankCfgStatus')?.value || '';
    const fase = document.getElementById('rankCfgFase')?.value || '';
    this._filters.period = period;
    this._filters.billing = billing;
    this._filters.status = status;
    this._filters.fase = fase;

    const ctx = this._rankExportCtx || {};
    const prefix = ctx.prefix || 'Admin';
    const listId = ctx.listId || 'adminRankingList';
    const syncSel = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v;
    };
    syncSel(`salesRankPeriod${prefix}`, period);
    syncSel(`salesRankBilling${prefix}`, billing);
    syncSel(`salesRankStatus${prefix}`, status);
if (!opts.skipRender) {
      if (listId === 'adminRankingList' && typeof renderAdminRanking === 'function') {
        renderAdminRanking();
      } else if (listId === 'rankingList' && typeof renderRanking === 'function') {
        renderRanking();
      } else if (typeof this.renderAdmin === 'function' && listId === 'adminRankingList') {
        void this.renderAdmin();
      }
    }
    if (opts.close) this.closeRankingConfigModal();
  },

  openRankingConfigModal() {
    this._ensureRankingConfigModal();
    this._fillRankingConfigModal();
if (typeof openModal === 'function') openModal('rankConfigModal');
    else document.getElementById('rankConfigModal')?.classList.add('open');
  },

  closeRankingConfigModal() {
    if (typeof closeModal === 'function') closeModal('rankConfigModal');
    else document.getElementById('rankConfigModal')?.classList.remove('open');
  },

  /** Atualiza visibilidade do botão Configurações do ranking no topbar. */
  syncRankingTopbarVisibility() {
    const tools = document.getElementById('rankManageTopbarTools');
    if (!tools) return;
    const active = !!document.getElementById('secRanking')?.classList.contains('active');
    const can = this._canViewSalesAmount(typeof Auth !== 'undefined' ? Auth.getSession() : null);
    const show = active && can;
    tools.hidden = !show;
    tools.style.display = show ? '' : 'none';
    document.body.classList.toggle('rank-manage-tools-active', show);
  },

  _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  _setRankingSubtitle(listId, publicRank) {
    const p = document.getElementById(listId)?.closest('.section')?.querySelector('.page-header p');
    if (!p) return;
    if (!p.dataset.defaultText) p.dataset.defaultText = p.textContent;
    p.textContent = publicRank
      ? 'Classificação por propostas pagas — desempate pelo total de propostas'
      : p.dataset.defaultText;
  },

  _renderList(listId, rows, opts = {}) {
    rows=rows.filter(r=>String(r.user?.id||'')!=='umt7ab7yqx1yf4' && !['desenvolvedor','desenvolvimento','developer','dev','ti'].includes(this._norm(r.user?.role)));
    const box = document.getElementById(listId);
    if (!box) return;
    const viewerId = opts.viewerId || '';
    const publicRank = opts.rankMode === 'public';
    const showSales = !publicRank && opts.showSalesAmount !== false && this._canViewSalesAmount(opts.viewer);
    const billing = this._filters.billing || 'total';
    const isPagasBilling = billing === 'pagas';
    const esc = (s) => this._esc(s);
    this._setRankingSubtitle(listId, publicRank);
    box.classList.add('rk');
    this._rankAnimated = this._rankAnimated || {};
    box.classList.toggle('rk--anim', !this._rankAnimated[listId] && rows.length > 0);
    if (rows.length) this._rankAnimated[listId] = true;

    if (!rows.length) {
      box.innerHTML = publicRank
        ? `<div class="rk-empty">Nenhum vendedor com propostas registradas.</div>`
        : `<div class="rk-empty">
        Nenhum vendedor com propostas neste filtro.<br>
        <span style="font-size:12px;">Tente <strong>Todo o período</strong> ou limpe Status/Fase.</span>
      </div>`;
      return;
    }

    const metric = (r) => (showSales ? (r.total || 0) : publicRank ? (r.paidCount || 0) : (r.count || 0));
    const totalPaid = rows.reduce((s, r) => s + (r.paidCount || 0), 0);
    const totalCount = rows.reduce((s, r) => s + (r.count || 0), 0);
    const totalSales = rows.reduce((s, r) => s + (r.total || 0), 0);
    const conv = (r) => (r.count ? Math.round(((r.paidCount || 0) / r.count) * 100) : 0);
    const avatar = (e, size) => (typeof avatarHtml === 'function' ? avatarHtml(e.name, size, e.photo_url || '') : '');
    const dept = (e) => `${esc(e.department || '—')} · ${esc(e.matricula || '—')}`;
    const meBadge = '<span class="rk-me-badge">Você</span>';

    const tierBadge = (r) => (r.tier
      ? `<span class="badge badge-primary sales-ranking-tier" title="Classificação por faturamento no período">${esc(r.tier.label)}</span>`
      : `<span class="badge badge-muted sales-ranking-tier">Abaixo FAIXA1</span>`);

    const salesText = (r) => (isPagasBilling && r.bruto > 0 && Math.abs(r.bruto - r.total) > 0.01
      ? `${this._fmtSales(r.total)} <small>(bruto ${this._fmtSales(r.bruto)})</small>`
      : this._fmtSales(r.total));

    const addBtn = (e) => {
      const show = !publicRank && opts.allowAddPoints
        && (typeof canSouBluManagePoints !== 'function' || canSouBluManagePoints(e));
      return show
        ? `<button type="button" class="btn btn-outline btn-sm rk-add" onclick="navigateTo('secBalance');setTimeout(function(){var el=document.getElementById('balanceEmployee');if(el)el.value='${esc(e.id)}'},100)">+ Pontos</button>`
        : '';
    };

    // Valor principal + legenda de cada vendedor
    const main = (r) => {
      if (showSales) return { value: salesText(r), label: `${r.count} proposta(s)` };
      if (publicRank) return { value: String(r.paidCount || 0), label: `${r.paidCount || 0} paga(s) de ${r.count || 0} proposta(s)` };
      return { value: String(r.count || 0), label: 'proposta(s)' };
    };

    // Quanto falta para passar quem está logo acima (ou vantagem do líder)
    const fmtGap = (v) => {
      if (showSales) return this._fmtSales(v);
      const n = Math.max(1, Math.ceil(v));
      return `${n} proposta${n === 1 ? '' : 's'}`;
    };
    const gapHint = (i) => {
      const r = rows[i];
      if (i === 0) {
        if (rows.length < 2) return '';
        const lead = metric(r) - metric(rows[1]);
        return lead > 0
          ? `<div class="rk-gap rk-gap--lead">Você lidera com ${fmtGap(lead)} de vantagem</div>`
          : `<div class="rk-gap">Empatado com o 2º lugar — não deixe passar!</div>`;
      }
      const diff = metric(rows[i - 1]) - metric(r);
      const need = showSales ? Math.max(diff, 0.01) : diff + 1;
      return `<div class="rk-gap">Faltam <strong>${fmtGap(need)}</strong> para passar o ${i}º lugar</div>`;
    };

    // Linhas 4º+: "Faltam X para o Nº lugar" (mesma métrica que ordena o ranking)
    const aheadHint = (i) => {
      const r = rows[i];
      const up = rows[i - 1];
      if (!up) return '';
      const diff = metric(up) - metric(r);
      const need = showSales ? Math.max(diff, 0.01) : diff + 1;
      return `<div class="rk-row__ahead">Faltam <strong>${fmtGap(need)}</strong> para o ${i}º lugar</div>`;
    };

    const kpi = (label, value) => `<div class="rk-kpi"><span>${label}</span><strong>${value}</strong></div>`;
    const summaryHtml = publicRank
      ? `<div class="rk-kpis">
          ${kpi('Vendedores', rows.length)}
          ${kpi('Total de propostas', totalCount)}
          ${kpi('Propostas pagas', `${totalPaid} de ${totalCount}`)}
          ${kpi('Conversão geral', `${totalCount ? Math.round((totalPaid / totalCount) * 100) : 0}%`)}
        </div>`
      : showSales
        ? `<div class="rk-kpis">
          ${kpi('Vendedores', rows.length)}
          ${kpi('Faturamento', this._fmtSales(totalSales))}
          ${kpi('Propostas', totalCount)}
          ${kpi('Média por vendedor', this._fmtSales(rows.length ? totalSales / rows.length : 0))}
        </div>`
        : '';

    // Pódio (top 3)
    const podiumCount = rows.length >= 3 ? 3 : 0;
    const podiumHtml = podiumCount
      ? `<div class="rk-podium">${rows.slice(0, 3).map((r, i) => {
        const e = r.user;
        const isMe = viewerId && e.id === viewerId;
        const m = main(r);
        return `<div class="rk-podium__card rk-podium__card--${i + 1}${isMe ? ' is-me' : ''}">
          <div class="rk-podium__medal">${i + 1}º</div>
          <div class="rk-podium__avatar">${i === 0 ? '<svg class="rk-crown" viewBox="0 0 24 16" aria-hidden="true"><path d="M2 14 L0.5 3 L7 8 L12 0.5 L17 8 L23.5 3 L22 14 Z"/><circle cx="0.9" cy="3" r="1.3"/><circle cx="12" cy="0.9" r="1.3"/><circle cx="23.1" cy="3" r="1.3"/></svg>' : ''}${avatar(e, 'avatar-lg')}</div>
          <div class="rk-podium__name" title="${esc(e.name)}">${esc(e.name)}</div>
          <div class="rk-podium__dept">${dept(e)}${isMe ? ' ' + meBadge : ''}</div>
          <div class="rk-podium__value">${m.value}</div>
          <div class="rk-podium__label">${m.label}</div>
          ${publicRank ? `<div class="rk-podium__conv">${conv(r)}% de conversão</div>` : ''}
          ${showSales ? `<div class="rk-podium__tier">${tierBadge(r)}</div>` : ''}
          ${isMe ? gapHint(i) : ''}
          ${addBtn(e)}
        </div>`;
      }).join('')}</div>`
      : '';

    // Classificação abaixo do pódio: colunas alinhadas e comparação direta.
    const hasActions = !publicRank && opts.allowAddPoints;
    const restHtml = rows.slice(podiumCount).map((r, idx) => {
      const i = idx + podiumCount, e = r.user, isMe = viewerId && e.id === viewerId;
      const percentage = Math.max(0, Math.min(100, conv(r)));
      return `<tr class="${isMe ? 'is-me' : ''}">
        <td class="rk-standings__position" data-label="Posição">${i + 1}<span>º</span></td>
        <td class="rk-standings__person" data-label="Vendedor"><div class="rk-standings__identity">${avatar(e, 'avatar-sm')}<div><div class="rk-row__name" title="${esc(e.name)}">${esc(e.name)}${isMe ? ' ' + meBadge : ''}</div><div class="rk-row__dept">${dept(e)}</div>${isMe ? aheadHint(i) : ''}</div></div></td>
        <td class="rk-standings__number" data-label="Pagas"><strong>${r.paidCount || 0}</strong></td>
        <td class="rk-standings__number rk-standings__total" data-label="Total de propostas">${r.count || 0}</td>
        <td class="rk-standings__conversion" data-label="Conversão"><strong>${percentage}%</strong><span class="rk-conversion-track" role="meter" aria-label="Conversão de ${esc(e.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}"><i style="width:${percentage}%"></i></span></td>
        ${showSales ? `<td class="rk-standings__sales" data-label="Faturamento">${salesText(r)}</td><td class="rk-standings__tier" data-label="Faixa">${tierBadge(r)}</td>` : ''}
        ${hasActions ? `<td class="rk-standings__actions" data-label="Ações">${addBtn(e)}</td>` : ''}
      </tr>`;
    }).join('');
    const standings = restHtml ? `<div class="rk-standings-card"><div class="rk-standings-heading"><div><h3>Classificação geral</h3><p>${podiumCount ? 'Do 4º lugar em diante' : 'Resultados dos vendedores'}</p></div><span>${rows.length - podiumCount} vendedores</span></div><table class="rk-standings"><thead><tr><th scope="col">Posição</th><th scope="col">Vendedor</th><th scope="col" class="rk-standings__number">Pagas</th><th scope="col" class="rk-standings__number">Total de propostas</th><th scope="col">Conversão</th>${showSales ? '<th scope="col" class="rk-standings__number">Faturamento</th><th scope="col" class="rk-standings__tier">Faixa</th>' : ''}${hasActions ? '<th scope="col">Ações</th>' : ''}</tr></thead><tbody>${restHtml}</tbody></table></div>` : '';
    box.innerHTML = `${summaryHtml}${podiumHtml}${standings}`;
  },

  async renderAdmin() {
    const listId = 'adminRankingList';
    const prefix = this._prefixForList(listId);
    const viewer = typeof Auth !== 'undefined' ? Auth.getSession() : null;
    const masterMode = this._isMasterRankingMode(viewer);
    const showSalesAmount = masterMode;
    const box = document.getElementById(listId);
    if (box) {
      box.innerHTML = '<div class="text-muted text-center" style="padding:24px;">Carregando ranking...</div>';
    }

    if (masterMode) {
      this._showRankingToolbar('salesRankingFiltersAdmin', 'salesRankingSummaryAdmin');
      this._renderFiltersUI('salesRankingFiltersAdmin', listId, { viewer, showSalesAmount });
      this._readFilters(prefix);
      const { filtered, rows, vendorIndex, usersByName } = await this._prepareRankingData({ force: true });
      this._renderSummary('salesRankingSummaryAdmin', rows, filtered, { viewer, showSalesAmount, vendorIndex, usersByName });
      const allowAddPoints = typeof IS_SUPERVISOR !== 'undefined' && typeof CAN_EMPLOYEES_PANEL !== 'undefined'
        && !IS_SUPERVISOR && CAN_EMPLOYEES_PANEL;
      this._renderList(listId, rows, {
        allowAddPoints,
        viewer,
        showSalesAmount,
        rankMode: 'master',
      });
return;
    }

    this._filters = { period: 'all', status: '', fase: '', billing: 'total' };
    this._hideRankingToolbar('salesRankingFiltersAdmin', 'salesRankingSummaryAdmin');
    await this._renderPublicRanking(listId, { viewer });
  },

  async renderEmployee(viewer) {
    const listId = 'rankingList';
    const prefix = this._prefixForList(listId);
    const cu = viewer || window.currentUser || {};
    const masterMode = this._isMasterRankingMode(cu);
    const showSalesAmount = masterMode;
    const box = document.getElementById(listId);
    if (box) {
      box.innerHTML = '<div class="text-muted text-center" style="padding:24px;">Carregando ranking...</div>';
    }

    if (masterMode) {
      this._showRankingToolbar('salesRankingFiltersEmployee', 'salesRankingSummaryEmployee');
      this._renderFiltersUI('salesRankingFiltersEmployee', listId, { viewer: cu, showSalesAmount });
      this._readFilters(prefix);
      const { filtered, rows, vendorIndex, usersByName } = await this._prepareRankingData({ force: true });
      this._renderSummary('salesRankingSummaryEmployee', rows, filtered, { viewer: cu, showSalesAmount, vendorIndex, usersByName });
      this._renderList(listId, rows, {
        viewerId: cu.id,
        viewer: cu,
        showSalesAmount,
        rankMode: 'master',
      });
      return;
    }

    this._filters = { period: 'all', status: '', fase: '', billing: 'total' };
    this._hideRankingToolbar('salesRankingFiltersEmployee', 'salesRankingSummaryEmployee');
    await this._renderPublicRanking(listId, { viewerId: cu.id, viewer: cu });
  },
};
