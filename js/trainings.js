/* SOU + BLU — Treinamentos (tutoriais, palestras, prova, penalidade, notas RH) */
(function () {
  function _isSouBluAdminPanel() {
    return !window.SOUBLU_FINANCEIRO_PAGE
      && !window.SOUBLU_TREINAMENTOS_PAGE
      && !document.querySelector('[data-tab="tab-catalog"]')
      && !!(document.getElementById('navManageProposals') || document.getElementById('secManageProposals'));
  }

  function _isSouBluTrainingsPage() {
    return !!window.SOUBLU_TREINAMENTOS_PAGE
      || !!document.querySelector('[data-tab="tab-catalog"]');
  }

  const VENDOR_ROLES = new Set(['vendedor', 'employee']);
  const MANAGE_ROLES = new Set([
    'master', 'fundador', 'desenvolvedor', 'gerente', 'gerencia', 'admin',
    'financeiro', 'financial', 'supervisor', 'sup_backoffice', 'parceiro',
    'rh', 'backoffice', 'operacional', 'juridico', 'diretoria', 'ouvidoria',
  ]);
  const RH_REPORT_ROLES = new Set(['master', 'fundador', 'rh', 'gerente', 'gerencia']);

  const CATEGORIES = [
    { id: 'mural', label: 'Mural / Comunicados', icon: '📢' },
    { id: 'obrigatorio', label: 'Treinamentos obrigatórios', icon: '⚠️' },
    { id: 'video_vendas', label: 'Vídeos técnicas de vendas', icon: '🎬' },
    { id: 'curso_institucional', label: 'Cursos institucionais', icon: '🏛️' },
    { id: 'regimento', label: 'Regimento interno', icon: '📋' },
  ];

  const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.filter(c => c.id !== 'mural').map(c => [c.id, c.label]));

  const MAX_QUESTIONS = 50;
  const QUIZ_DRAW = 5;

  function _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function _normQuestion(item) {
    if (!item || typeof item !== 'object') return null;
    const q = String(item.q || item.question || '').trim();
    const options = (item.options || []).map(o => String(o ?? '').trim()).filter(Boolean);
    if (!q || options.length < 2) return null;
    let correct = parseInt(item.correct ?? item.correctIndex ?? 0, 10);
    if (!Number.isFinite(correct) || correct < 0 || correct >= options.length) correct = 0;
    return { q, options, correct };
  }

  function _pickQuestionsForAttempt(allQs) {
    const pool = (allQs || []).map(_normQuestion).filter(Boolean);
    if (!pool.length) return [];
    if (pool.length <= QUIZ_DRAW) {
      return pool.map((q, i) => ({ ...q, origIndex: i }));
    }
    return _shuffle(pool.map((q, i) => ({ ...q, origIndex: i }))).slice(0, QUIZ_DRAW);
  }

  function _embedVideo(url) {
    const u = String(url || '').trim();
    if (!u) return '';
    let embed = u;
    const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/i);
    if (yt) embed = `https://www.youtube.com/embed/${yt[1]}`;
    else {
      const vm = u.match(/vimeo\.com\/(\d+)/i);
      if (vm) embed = `https://player.vimeo.com/video/${vm[1]}`;
    }
    if (/youtube\.com\/embed|player\.vimeo\.com/.test(embed)) {
      return `<div style="position:relative;padding-top:56.25%;margin:12px 0;border-radius:8px;overflow:hidden;background:#000;">
        <iframe src="${esc(embed)}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allowfullscreen loading="lazy"></iframe></div>`;
    }
    return `<p><a href="${esc(u)}" target="_blank" rel="noopener">▶ Assistir vídeo</a></p>`;
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDt(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR'); } catch { return '—'; }
  }

  function sessionRole() {
    return String(Auth.getSession()?.role || '').trim().toLowerCase();
  }

  function canManage(role) {
    const r = role || sessionRole();
    return MANAGE_ROLES.has(r) && !VENDOR_ROLES.has(r);
  }

  function canRhReport(role) {
    const r = role || sessionRole();
    return RH_REPORT_ROLES.has(r);
  }

  function audienceMatch(training, user) {
    const roles = training.audience_roles || ['*'];
    if (roles.includes('*')) return true;
    const ur = String(user?.role || '').trim().toLowerCase();
    return roles.map(x => String(x).trim().toLowerCase()).includes(ur);
  }

  async function partnerRootForUser(user) {
    if (!user?.id) return null;
    if (String(user.role || '').toLowerCase() === 'parceiro') return user.id;
    return DB.getPartnerRootForUser(user.id).catch(() => null);
  }

  async function trainingsForUser(user, category) {
    const root = await partnerRootForUser(user);
    const all = await DB.getTrainings({ partnerRootId: root, activeOnly: true, category });
    return all.filter(t => audienceMatch(t, user));
  }

  async function muralForUser(user) {
    const root = await partnerRootForUser(user);
    const all = await DB.getTrainingMuralPosts({ partnerRootId: root, activeOnly: true });
    return all.filter(p => audienceMatch(p, user));
  }

  function statusLabel(st, passed, deadline) {
    if (st === 'passed' || passed) return '<span class="badge badge-success">Aprovado</span>';
    if (st === 'penalized') return '<span class="badge badge-danger">Penalizado</span>';
    if (st === 'failed') return '<span class="badge badge-danger">Reprovado</span>';
    if (deadline && new Date(deadline) < new Date()) {
      return '<span class="badge badge-warning">Prazo expirado</span>';
    }
    return '<span class="badge badge-muted">Pendente</span>';
  }

  const Trainings = {
    canManage,
    canRhReport,

    /** Penaliza quem não concluiu no prazo (uma vez por treinamento). */
    async applyDeadlinesForUser(user) {
      if (!user?.id) return;
      const list = await trainingsForUser(user);
      const now = Date.now();
      for (const tr of list) {
        if (!tr.deadline_at || !tr.penalty_points) continue;
        if (new Date(tr.deadline_at).getTime() >= now) continue;
        const att = await DB.getTrainingAttempt(tr.id, user.id);
        if (att?.passed || att?.status === 'penalized') continue;
        if (att?.status === 'passed') continue;
        await DB.saveTrainingAttempt({
          ...(att || {}),
          training_id: tr.id,
          user_id: user.id,
          status: 'penalized',
          passed: false,
          score: att?.score ?? 0,
          penalized_at: new Date().toISOString(),
        });
        try {
          await DB.applyTrainingPenalty(user.id, tr.id, tr.penalty_points, tr.title);
          if (typeof showToast === 'function') {
            showToast(`Penalidade: −${tr.penalty_points} pts — treinamento "${tr.title}" (prazo vencido).`, 'warning', 9000);
          }
        } catch (e) {
          console.warn('[Trainings] penalidade', e);
        }
      }
    },

    async updateBadge() {
      const uid = Auth.getSession()?.id;
      if (!uid) return 0;
      const user = await DB.getUser(uid).catch(() => null);
      if (!user) return 0;
      await this.applyDeadlinesForUser(user);
      const list = await trainingsForUser(user);
      let pending = 0;
      for (const tr of list) {
        const att = await DB.getTrainingAttempt(tr.id, uid);
        if (!att?.passed) pending++;
      }
      document.querySelectorAll('#trainingsBadge, .trainings-badge').forEach(b => {
        b.textContent = pending;
        b.style.display = pending > 0 ? 'inline' : 'none';
      });
      return pending;
    },

    ensureUi() {
      if (_isSouBluTrainingsPage() || _isSouBluAdminPanel()) return;
      if (document.getElementById('secTrainings')) return;
      const nav = document.querySelector('.sidebar-nav');
      const main = document.querySelector('.page-content');
      if (!nav || !main) return;
      const profBtn = nav.querySelector('[data-section="secProfile"]');
      if (profBtn) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-item trainings-nav';
        btn.dataset.section = 'secTrainings';
        btn.innerHTML = `${navIconHtml('book')}<span class="nav-label">Treinamentos</span><span class="nav-badge trainings-badge" id="trainingsBadge" style="display:none;">0</span>`;
        profBtn.parentNode.insertBefore(btn, profBtn);
        const navCfg = window.__ADMIN_NAV_CFG__;
        if (navCfg && navCfg.canTreinamentos === false) btn.style.display = 'none';
      }
      const sec = document.createElement('section');
      sec.className = 'section';
      sec.id = 'secTrainings';
      sec.innerHTML = '<div id="trainingsRoot"></div>';
      const profSec = document.getElementById('secProfile');
      if (profSec) main.insertBefore(sec, profSec);
      else main.appendChild(sec);
    },

    _activeCategory: 'mural',

    async _renderTrainingCards(list, user) {
      if (!list.length) {
        return '<div class="empty-state" style="padding:24px;"><p class="text-muted">Nenhum conteúdo nesta categoria.</p></div>';
      }
      const cards = await Promise.all(list.map(async tr => {
        const att = await DB.getTrainingAttempt(tr.id, user.id);
        const dl = tr.deadline_at ? fmtDt(tr.deadline_at) : 'Sem prazo';
        const kind = tr.kind === 'palestra' ? 'Palestra' : 'Tutorial';
        const cat = CATEGORY_LABEL[tr.category] || tr.category || '';
        const isRegimento = tr.category === 'regimento';
        const btnLabel = att?.passed ? 'Rever' : (isRegimento && !(tr.questions || []).length ? 'Ler / Confirmar' : 'Iniciar / Prova');
        return `<div class="card card-padded" style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div><span class="badge badge-muted">${kind}</span>${cat ? ` <span class="badge badge-accent">${esc(cat)}</span>` : ''}
              <h4 style="margin:8px 0 4px;">${esc(tr.title)}</h4>
              <p style="font-size:13px;color:var(--color-text-muted);margin:0;">Prazo: ${dl}${!isRegimento ? ` · Nota mínima: ${tr.passing_score}% · Penalidade: ${tr.penalty_points || 0} pts` : ''}</p>
            </div>
            <div style="text-align:right;">${statusLabel(att?.status, att?.passed, tr.deadline_at)}
              ${att?.score != null ? `<div style="font-size:13px;margin-top:6px;">Nota: <strong>${att.score}%</strong></div>` : ''}
              <button type="button" class="btn btn-primary btn-sm" style="margin-top:8px;" onclick="Trainings.openTake('${esc(tr.id)}')">${btnLabel}</button>
            </div>
          </div>
        </div>`;
      }));
      return cards.join('');
    },

    async _renderMuralBlock(user) {
      const posts = await muralForUser(user);
      if (!posts.length) {
        return '<div class="empty-state" style="padding:24px;"><p class="text-muted">Nenhum comunicado no mural.</p></div>';
      }
      return posts.map(p => `<div class="card card-padded" style="margin-bottom:12px;${p.pinned ? 'border-left:4px solid var(--color-primary);' : ''}">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <h4 style="margin:0 0 8px;">${p.pinned ? '📌 ' : ''}${esc(p.title)}</h4>
          <small class="text-muted">${fmtDt(p.created_at)}</small>
        </div>
        <div style="white-space:pre-wrap;font-size:14px;line-height:1.6;">${esc(p.body || '')}</div>
      </div>`).join('');
    },

    _categoryTabsHtml(active) {
      return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">${
        CATEGORIES.map(c => `<button type="button" class="btn btn-sm ${active === c.id ? 'btn-primary' : 'btn-outline'}" onclick="Trainings.switchCategory('${c.id}')">${c.icon} ${esc(c.label)}</button>`).join('')
      }</div>`;
    },

    async switchCategory(catId) {
      this._activeCategory = catId || 'mural';
      await this.renderEmployee();
    },

    async renderEmployee() {
      this.ensureUi();
      const root = document.getElementById('trainingsRoot');
      if (!root) return;
      const user = await Auth.getCurrentUser();
      if (!user) return;
      const cat = this._activeCategory || 'mural';
      let bodyHtml = '';
      if (cat === 'mural') {
        bodyHtml = await this._renderMuralBlock(user);
      } else {
        const list = await trainingsForUser(user, cat);
        bodyHtml = await this._renderTrainingCards(list, user);
      }
      root.innerHTML = `<div class="page-header"><div class="page-header-text"><h2>Treinamentos</h2><p>Mural, conteúdos obrigatórios, vídeos, cursos e regimento interno</p></div></div>
        ${this._categoryTabsHtml(cat)}
        <div id="trainingsCategoryBody">${bodyHtml}</div>`;
      await this.updateBadge();
    },

    _adminTab: 'treinamentos',

    async switchAdminTab(tab) {
      this._adminTab = tab || 'treinamentos';
      await this.renderAdminManage();
    },

    async renderAdminManage() {
      const root = document.getElementById('trainingsAdminRoot');
      if (!root) return;
      const s = Auth.getSession();
      const partnerRoot = window.PARTNER_ROOT_ID || (s?.role === 'parceiro' ? s.id : await DB.getPartnerRootForUser(s.id));
      const tab = this._adminTab || 'treinamentos';
      root.innerHTML = `
        <div class="page-header">
          <div class="page-header-text"><h2>Gestão de Treinamentos</h2><p>Mural de comunicados, conteúdos por categoria e provas</p></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn btn-primary" onclick="Trainings.openEditor()">+ Treinamento</button>
            <button type="button" class="btn btn-outline" onclick="Trainings.openMuralEditor()">+ Comunicado mural</button>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:16px;">
          <button type="button" class="btn btn-sm ${tab === 'treinamentos' ? 'btn-primary' : 'btn-outline'}" onclick="Trainings.switchAdminTab('treinamentos')">Conteúdos</button>
          <button type="button" class="btn btn-sm ${tab === 'mural' ? 'btn-primary' : 'btn-outline'}" onclick="Trainings.switchAdminTab('mural')">Mural</button>
        </div>
        <div id="trainingsAdminTabBody"></div>`;
      const body = document.getElementById('trainingsAdminTabBody');
      if (tab === 'mural') {
        const posts = await DB.getTrainingMuralPosts({ partnerRootId: partnerRoot });
        body.innerHTML = `<div class="card card-padded"><div class="table-wrap"><table class="data-table"><thead><tr>
          <th>Título</th><th>Fixado</th><th>Ativo</th><th>Publicado</th><th></th>
        </tr></thead><tbody id="trainingsMuralTbody"></tbody></table></div></div>`;
        const tb = document.getElementById('trainingsMuralTbody');
        if (!posts.length) {
          tb.innerHTML = '<tr><td colspan="5" class="text-muted text-center">Nenhum comunicado.</td></tr>';
          return;
        }
        tb.innerHTML = posts.map(p => `<tr>
          <td><strong>${esc(p.title)}</strong></td>
          <td>${p.pinned ? 'Sim' : 'Não'}</td>
          <td>${p.active ? 'Sim' : 'Não'}</td>
          <td>${fmtDt(p.created_at)}</td>
          <td>
            <button type="button" class="btn btn-ghost btn-sm" onclick="Trainings.openMuralEditor('${esc(p.id)}')">Editar</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="Trainings.removeMural('${esc(p.id)}')">Excluir</button>
          </td>
        </tr>`).join('');
        return;
      }
      const list = await DB.getTrainings({ partnerRootId: partnerRoot });
      body.innerHTML = `<div class="card card-padded"><div class="table-wrap"><table class="data-table"><thead><tr>
        <th>Título</th><th>Categoria</th><th>Tipo</th><th>Prazo</th><th>Nota mín.</th><th>Penalidade</th><th>Ativo</th><th></th>
      </tr></thead><tbody id="trainingsAdminTbody"></tbody></table></div></div>`;
      const tb = document.getElementById('trainingsAdminTbody');
      if (!list.length) {
        tb.innerHTML = '<tr><td colspan="8" class="text-muted text-center">Nenhum treinamento cadastrado.</td></tr>';
        return;
      }
      tb.innerHTML = list.map(tr => `<tr>
        <td><strong>${esc(tr.title)}</strong></td>
        <td>${esc(CATEGORY_LABEL[tr.category] || tr.category || '—')}</td>
        <td>${tr.kind === 'palestra' ? 'Palestra' : 'Tutorial'}</td>
        <td>${fmtDt(tr.deadline_at)}</td>
        <td>${tr.passing_score}%</td>
        <td>${tr.penalty_points || 0} pts</td>
        <td>${tr.active ? 'Sim' : 'Não'}</td>
        <td>
          <button type="button" class="btn btn-ghost btn-sm" onclick="Trainings.openEditor('${esc(tr.id)}')">Editar</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="Trainings.remove('${esc(tr.id)}')">Excluir</button>
        </td>
      </tr>`).join('');
    },

    async renderRhReport() {
      const root = document.getElementById('trainingsRhRoot');
      if (!root) return;
      const partnerRoot = window.PARTNER_ROOT_ID || null;
      const trainings = await DB.getTrainings({ partnerRootId: partnerRoot });
      let attempts = await DB.getTrainingAttempts({});
      const users = await DB.getAllUsers().catch(() => []);
      if (partnerRoot) {
        const team = await DB.getPartnerTeam(partnerRoot).catch(() => []);
        const ids = new Set(team.map(u => u.id));
        ids.add(partnerRoot);
        attempts = attempts.filter(a => ids.has(a.user_id));
      }
      const byId = Object.fromEntries(users.map(u => [u.id, u]));
      root.innerHTML = `
        <div class="page-header"><div class="page-header-text"><h2>Notas — Treinamentos (RH)</h2><p>Controle de aproveitamento e penalidades</p></div></div>
        <div class="card card-padded"><div class="table-wrap"><table class="data-table"><thead><tr>
          <th>Colaborador</th><th>Treinamento</th><th>Nota</th><th>Status</th><th>Concluído em</th><th>Penalizado</th>
        </tr></thead><tbody id="trainingsRhTbody"></tbody></table></div></div>`;
      const tb = document.getElementById('trainingsRhTbody');
      const rows = attempts.map(a => {
        const u = byId[a.user_id];
        const tr = trainings.find(t => t.id === a.training_id);
        return { a, u, tr };
      }).filter(r => r.tr);
      if (!rows.length) {
        tb.innerHTML = '<tr><td colspan="6" class="text-muted text-center">Sem tentativas registradas.</td></tr>';
        return;
      }
      tb.innerHTML = rows.map(({ a, u, tr }) => `<tr>
        <td>${esc(u?.name || a.user_id)}<br><small class="text-muted">${esc(u?.role || '')}</small></td>
        <td>${esc(tr.title)}</td>
        <td><strong>${a.score ?? '—'}%</strong></td>
        <td>${statusLabel(a.status, a.passed, tr.deadline_at)}</td>
        <td>${fmtDt(a.completed_at)}</td>
        <td>${a.penalized_at ? fmtDt(a.penalized_at) : '—'}</td>
      </tr>`).join('');
    },

    openEditor(id) {
      const isEdit = !!id;
      document.getElementById('trainingModalTitle').textContent = isEdit ? 'Editar treinamento' : 'Novo treinamento';
      document.getElementById('trainingEditId').value = id || '';
      const resetForm = () => {
        document.getElementById('trnTitle').value = '';
        document.getElementById('trnKind').value = 'tutorial';
        document.getElementById('trnCategory').value = 'obrigatorio';
        document.getElementById('trnDesc').value = '';
        document.getElementById('trnContent').value = '';
        document.getElementById('trnVideo').value = '';
        document.getElementById('trnResource').value = '';
        document.getElementById('trnDeadline').value = '';
        document.getElementById('trnPassing').value = '70';
        document.getElementById('trnPenalty').value = '50';
        document.getElementById('trnAudience').value = '*';
        document.getElementById('trnActive').checked = true;
        this.renderQuestionEditor([]);
        openModal('trainingModal');
      };
      if (!isEdit) {
        resetForm();
        return;
      }
      DB.getTraining(id).then(tr => {
        if (!tr) return;
        document.getElementById('trnTitle').value = tr.title || '';
        document.getElementById('trnKind').value = tr.kind || 'tutorial';
        document.getElementById('trnCategory').value = tr.category || 'obrigatorio';
        document.getElementById('trnDesc').value = tr.description || '';
        document.getElementById('trnContent').value = tr.content_body || '';
        document.getElementById('trnVideo').value = tr.video_url || '';
        document.getElementById('trnResource').value = tr.resource_url || '';
        document.getElementById('trnDeadline').value = tr.deadline_at ? tr.deadline_at.slice(0, 16) : '';
        document.getElementById('trnPassing').value = String(tr.passing_score ?? 70);
        document.getElementById('trnPenalty').value = String(tr.penalty_points ?? 0);
        document.getElementById('trnAudience').value = (tr.audience_roles || ['*']).join(', ');
        document.getElementById('trnActive').checked = tr.active !== false;
        this.renderQuestionEditor(tr.questions || []);
        openModal('trainingModal');
      });
    },

    renderQuestionEditor(questions) {
      const box = document.getElementById('trnQuestionsEditor');
      if (!box) return;
      const list = (questions || []).map(_normQuestion).filter(Boolean).slice(0, MAX_QUESTIONS);
      if (!list.length) {
        box.innerHTML = '<p class="text-muted" style="font-size:13px;margin:0 0 10px;">Nenhuma pergunta. Adicione até 50 — na prova o sistema sorteia 5 para cada colaborador.</p>';
        return;
      }
      box.innerHTML = list.map((item, qi) => {
        const opts = item.options.map((o, oi) =>
          `<div style="display:flex;gap:8px;align-items:center;margin:4px 0;">
            <input type="radio" name="trnCorrect_${qi}" value="${oi}" ${item.correct === oi ? 'checked' : ''} title="Alternativa correta"/>
            <input type="text" class="form-control trn-opt-input" data-q="${qi}" data-o="${oi}" value="${esc(o)}" placeholder="Alternativa ${oi + 1}"/>
          </div>`
        ).join('');
        return `<div class="card card-padded" style="padding:12px;margin-bottom:10px;" data-trn-q="${qi}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <strong>Pergunta ${qi + 1}</strong>
            <button type="button" class="btn btn-ghost btn-sm" onclick="Trainings.removeQuestionRow(${qi})">Remover</button>
          </div>
          <input type="text" class="form-control trn-q-input" data-q="${qi}" value="${esc(item.q)}" placeholder="Enunciado da pergunta"/>
          <div style="margin-top:8px;font-size:12px;color:var(--color-text-muted);">Marque a alternativa correta:</div>
          ${opts}
          <button type="button" class="btn btn-ghost btn-sm" style="margin-top:6px;" onclick="Trainings.addOptionRow(${qi})">+ Alternativa</button>
        </div>`;
      }).join('');
    },

    collectQuestionsFromEditor() {
      const cards = document.querySelectorAll('[data-trn-q]');
      const out = [];
      cards.forEach(card => {
        const qi = card.getAttribute('data-trn-q');
        const qEl = card.querySelector(`.trn-q-input[data-q="${qi}"]`);
        const q = qEl?.value?.trim() || '';
        const options = [];
        card.querySelectorAll(`.trn-opt-input[data-q="${qi}"]`).forEach(inp => {
          const v = inp.value.trim();
          if (v) options.push(v);
        });
        const correctEl = card.querySelector(`input[name="trnCorrect_${qi}"]:checked`);
        const correct = correctEl ? parseInt(correctEl.value, 10) : 0;
        const norm = _normQuestion({ q, options, correct });
        if (norm) out.push(norm);
      });
      return out.slice(0, MAX_QUESTIONS);
    },

    addQuestionRow() {
      const current = this.collectQuestionsFromEditor();
      if (current.length >= MAX_QUESTIONS) {
        showToast(`Máximo de ${MAX_QUESTIONS} perguntas.`, 'warning');
        return;
      }
      current.push({ q: '', options: ['', ''], correct: 0 });
      this.renderQuestionEditor(current);
    },

    removeQuestionRow(idx) {
      const current = this.collectQuestionsFromEditor();
      current.splice(idx, 1);
      this.renderQuestionEditor(current);
    },

    addOptionRow(qIdx) {
      const current = this.collectQuestionsFromEditor();
      if (!current[qIdx]) return;
      if (current[qIdx].options.length >= 6) {
        showToast('Máximo de 6 alternativas por pergunta.', 'warning');
        return;
      }
      current[qIdx].options.push('');
      this.renderQuestionEditor(current);
    },

    async saveEditor() {
      const s = Auth.getSession();
      if (!canManage(s?.role)) { showToast('Sem permissão.', 'error'); return; }
      const questions = this.collectQuestionsFromEditor();
      const audRaw = document.getElementById('trnAudience').value.trim();
      const audience_roles = audRaw === '*' || !audRaw
        ? ['*']
        : audRaw.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
      const id = document.getElementById('trainingEditId').value || undefined;
      const partnerRoot = window.PARTNER_ROOT_ID || (s.role === 'parceiro' ? s.id : null);
      const row = {
        id,
        title: document.getElementById('trnTitle').value.trim(),
        kind: document.getElementById('trnKind').value,
        category: document.getElementById('trnCategory').value || 'obrigatorio',
        description: document.getElementById('trnDesc').value.trim(),
        content_body: document.getElementById('trnContent').value.trim(),
        video_url: document.getElementById('trnVideo').value.trim(),
        resource_url: document.getElementById('trnResource').value.trim(),
        deadline_at: document.getElementById('trnDeadline').value
          ? new Date(document.getElementById('trnDeadline').value).toISOString()
          : null,
        passing_score: parseInt(document.getElementById('trnPassing').value, 10) || 70,
        penalty_points: parseInt(document.getElementById('trnPenalty').value, 10) || 0,
        audience_roles,
        questions,
        active: document.getElementById('trnActive').checked,
        created_by: s.id,
        partner_root_id: partnerRoot || null,
      };
      if (!row.title) { showToast('Informe o título.', 'warning'); return; }
      showLoading('Salvando...');
      try {
        await DB.saveTraining(row);
        closeModal('trainingModal');
        showToast('Treinamento salvo!', 'success');
        await this.renderAdminManage();
        if (document.getElementById('trainingsRoot')) await this.renderEmployee();
      } catch (e) {
        alert('Erro ao salvar: ' + (e.message || e));
      } finally { hideLoading(); }
    },

    async remove(id) {
      if (!confirm('Excluir este treinamento e todas as notas?')) return;
      await DB.deleteTraining(id);
      showToast('Treinamento excluído.', 'success');
      await this.renderAdminManage();
    },

    openMuralEditor(id) {
      const isEdit = !!id;
      document.getElementById('muralModalTitle').textContent = isEdit ? 'Editar comunicado' : 'Novo comunicado no mural';
      document.getElementById('muralEditId').value = id || '';
      if (!isEdit) {
        document.getElementById('muralTitle').value = '';
        document.getElementById('muralBody').value = '';
        document.getElementById('muralPinned').checked = false;
        document.getElementById('muralActive').checked = true;
        document.getElementById('muralAudience').value = '*';
        openModal('muralModal');
        return;
      }
      DB.getTrainingMuralPost(id).then(p => {
        if (!p) return;
        document.getElementById('muralTitle').value = p.title || '';
        document.getElementById('muralBody').value = p.body || '';
        document.getElementById('muralPinned').checked = !!p.pinned;
        document.getElementById('muralActive').checked = p.active !== false;
        document.getElementById('muralAudience').value = (p.audience_roles || ['*']).join(', ');
        openModal('muralModal');
      });
    },

    async saveMuralEditor() {
      const s = Auth.getSession();
      if (!canManage(s?.role)) { showToast('Sem permissão.', 'error'); return; }
      const audRaw = document.getElementById('muralAudience').value.trim();
      const audience_roles = audRaw === '*' || !audRaw
        ? ['*']
        : audRaw.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
      const partnerRoot = window.PARTNER_ROOT_ID || (s.role === 'parceiro' ? s.id : null);
      const row = {
        id: document.getElementById('muralEditId').value || undefined,
        title: document.getElementById('muralTitle').value.trim(),
        body: document.getElementById('muralBody').value.trim(),
        pinned: document.getElementById('muralPinned').checked,
        active: document.getElementById('muralActive').checked,
        audience_roles,
        partner_root_id: partnerRoot || null,
        created_by: s.id,
      };
      if (!row.title) { showToast('Informe o título.', 'warning'); return; }
      showLoading('Salvando...');
      try {
        await DB.saveTrainingMuralPost(row);
        closeModal('muralModal');
        showToast('Comunicado publicado!', 'success');
        await this.renderAdminManage();
        if (document.getElementById('trainingsRoot')) await this.renderEmployee();
      } catch (e) {
        alert('Erro ao salvar: ' + (e.message || e));
      } finally { hideLoading(); }
    },

    async removeMural(id) {
      if (!confirm('Excluir este comunicado do mural?')) return;
      await DB.deleteTrainingMuralPost(id);
      showToast('Comunicado excluído.', 'success');
      await this.renderAdminManage();
    },

    async getPendingForUser(user) {
      if (!user?.id) return [];
      await this.applyDeadlinesForUser(user);
      const list = await trainingsForUser(user);
      const pending = [];
      for (const tr of list) {
        const att = await DB.getTrainingAttempt(tr.id, user.id);
        if (!att?.passed) pending.push({ tr, att });
      }
      return pending;
    },

    async checkPendingOnLogin() {
      const cfg = window.__ADMIN_NAV_CFG__;
      if (cfg && cfg.canTreinamentos === false) return;
      const flag = sessionStorage.getItem('soublu_trn_login_alert');
      if (flag === '1') return;
      const user = await Auth.getCurrentUser().catch(() => null);
      if (!user) return;
      const pending = await this.getPendingForUser(user);
      sessionStorage.setItem('soublu_trn_login_alert', '1');
      if (!pending.length) return;
      await this.updateBadge();
      const items = pending.slice(0, 8).map(({ tr }) =>
        `<li style="margin:6px 0;">${esc(tr.title)}${tr.category === 'obrigatorio' ? ' <span class="badge badge-warning">Obrigatório</span>' : ''}</li>`
      ).join('');
      const more = pending.length > 8 ? `<p class="text-muted" style="font-size:13px;margin-top:8px;">+ ${pending.length - 8} outro(s)</p>` : '';
      if (!document.getElementById('trainingPendingModal')) {
        document.body.insertAdjacentHTML('beforeend', `
<div class="modal-overlay" id="trainingPendingModal"><div class="modal" style="max-width:480px;"><div class="modal-header">
  <h3>Treinamentos pendentes</h3><button type="button" class="modal-close" onclick="closeModal('trainingPendingModal')"></button></div>
<div class="modal-body">
  <p style="font-size:14px;margin:0 0 12px;">Você tem <strong>${pending.length}</strong> treinamento(s) não concluído(s). Acesse a área de Treinamentos para realizar.</p>
  <ul id="trainingPendingList" style="padding-left:20px;margin:0;">${items}</ul>${more}
</div><div class="modal-footer">
  <button type="button" class="btn btn-ghost" onclick="closeModal('trainingPendingModal')">Depois</button>
  <button type="button" class="btn btn-primary" onclick="Trainings.goToTrainingsFromAlert()">Ir para Treinamentos</button>
</div></div></div>`);
      } else {
        const ul = document.getElementById('trainingPendingList');
        if (ul) ul.innerHTML = items;
      }
      openModal('trainingPendingModal');
      if (typeof showToast === 'function') {
        showToast(`${pending.length} treinamento(s) pendente(s).`, 'warning', 7000);
      }
    },

    goToTrainingsFromAlert() {
      closeModal('trainingPendingModal');
      if (typeof Auth !== 'undefined' && Auth.treinamentosPageHref) {
        window.location.href = Auth.treinamentosPageHref();
        return;
      }
      const btn = document.querySelector('[data-section="secTrainings"]');
      if (btn) btn.click();
      else this.renderEmployee();
    },

    applyNavVisibility(cfg) {
      if (_isSouBluTrainingsPage()) return;
      const show = cfg?.canTreinamentos !== false && !_isSouBluAdminPanel();
      document.querySelectorAll('.trainings-nav, .trainings-manage-nav, .trainings-rh-nav, .trainings-collab-nav').forEach(el => {
        el.style.display = show ? '' : 'none';
      });
    },

    async openTake(trainingId) {
      const tr = await DB.getTraining(trainingId);
      const user = await Auth.getCurrentUser();
      if (!tr || !user) return;
      const drawn = _pickQuestionsForAttempt(tr.questions || []);
      window.__trnTake = { training: tr, user, drawn };
      const body = document.getElementById('trainingTakeBody');
      const kind = tr.kind === 'palestra' ? 'Palestra' : 'Tutorial';
      let html = `<h3>${esc(tr.title)}</h3><p class="badge badge-muted">${kind}</p>`;
      if (tr.description) html += `<p>${esc(tr.description)}</p>`;
      if (tr.content_body) html += `<div style="margin:12px 0;padding:12px;background:var(--color-surface-2);border-radius:8px;white-space:pre-wrap;">${esc(tr.content_body)}</div>`;
      if (tr.video_url) html += _embedVideo(tr.video_url);
      if (tr.resource_url) html += `<p><a href="${esc(tr.resource_url)}" target="_blank" rel="noopener">📎 Material de apoio</a></p>`;
      if (drawn.length) {
        const total = (tr.questions || []).length;
        const note = total > QUIZ_DRAW
          ? `<p style="font-size:13px;color:var(--color-text-muted);">Prova com <strong>${drawn.length}</strong> perguntas sorteadas (banco de ${total}).</p>`
          : '';
        html += `<hr style="margin:20px 0;"><h4>Prova</h4>${note}`;
        drawn.forEach((item, i) => {
          const opts = (item.options || []).map((o, j) =>
            `<label style="display:block;margin:6px 0;"><input type="radio" name="trnQ${i}" value="${j}"/> ${esc(o)}</label>`
          ).join('');
          html += `<div class="form-group"><label><strong>${i + 1}.</strong> ${esc(item.q)}</label>${opts}</div>`;
        });
      } else {
        html += '<p class="text-muted">Sem prova — clique em concluir para registrar participação.</p>';
      }
      body.innerHTML = html;
      openModal('trainingTakeModal');
    },

    async submitTake() {
      const pack = window.__trnTake;
      if (!pack) return;
      const { training: tr, user, drawn } = pack;
      const qs = drawn || [];
      const answers = [];
      let correct = 0;
      qs.forEach((item, i) => {
        const picked = document.querySelector(`input[name="trnQ${i}"]:checked`);
        const idx = picked ? parseInt(picked.value, 10) : -1;
        answers.push({ picked: idx, origIndex: item.origIndex });
        const ok = parseInt(item.correct ?? 0, 10);
        if (idx === ok) correct++;
      });
      const score = qs.length ? Math.round((correct / qs.length) * 100) : 100;
      const passed = score >= (tr.passing_score || 70);
      const pastDeadline = tr.deadline_at && new Date(tr.deadline_at) < new Date();
      let status = passed ? 'passed' : 'failed';
      if (pastDeadline && !passed) status = 'failed';

      const wasPassedBefore = !!pack.att?.passed;
      await DB.saveTrainingAttempt({
        training_id: tr.id,
        user_id: user.id,
        score,
        passed,
        status,
        answers,
        completed_at: new Date().toISOString(),
      });

      if (passed && !wasPassedBefore && typeof DB.applyRouletteCriteriaReward === 'function') {
        const rw = await DB.applyRouletteCriteriaReward(user.id, 'treinamento_concluido', {
          training_id: tr.id,
          training_title: tr.title,
          by_user: 'sistema_treinamento',
        }).catch(() => null);
        if (rw?.ok) {
          showToast(`+${rw.coins} moeda(s) da roleta pelo treinamento concluído!`, 'success', 6000);
        }
      }

      if (!passed && tr.penalty_points > 0 && pastDeadline) {
        await DB.applyTrainingPenalty(user.id, tr.id, tr.penalty_points, tr.title);
        await DB.saveTrainingAttempt({
          training_id: tr.id,
          user_id: user.id,
          score,
          passed: false,
          status: 'penalized',
          answers,
          penalized_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        });
      } else if (!passed && tr.penalty_points > 0) {
        showToast(`Reprovado (${score}%). Você pode tentar novamente antes do prazo.`, 'warning', 8000);
      }

      closeModal('trainingTakeModal');
      if (passed) showToast(`Aprovado! Nota: ${score}%`, 'success');
      else if (status !== 'penalized') showToast(`Nota: ${score}% — mínimo ${tr.passing_score}%`, 'error');

      if (document.getElementById('trainingsRoot')) await this.renderEmployee();
      if (document.getElementById('trainingsAdminRoot')) await this.renderAdminManage();
      await this.updateBadge();
    },

    ensureAdminSections() {
      if (_isSouBluTrainingsPage() || document.getElementById('trainingsAdminRoot')) return;
      const main = document.querySelector('.page-content');
      if (!main || document.getElementById('secTrainingsManage')) return;
      const wrap = document.createElement('section');
      wrap.className = 'section';
      wrap.id = 'secTrainingsManage';
      wrap.innerHTML = '<div id="trainingsAdminRoot"></div>';
      main.appendChild(wrap);
      const rh = document.createElement('section');
      rh.className = 'section';
      rh.id = 'secTrainingsRh';
      rh.innerHTML = '<div id="trainingsRhRoot"></div>';
      main.appendChild(rh);
    },

    wireAdminNav() {
      if (_isSouBluAdminPanel() || _isSouBluTrainingsPage()) return;
      const nav = document.querySelector('.sidebar-nav');
      if (!nav || document.getElementById('navTrainingsManage')) return;
      const gestaoLabel = [...nav.querySelectorAll('.sidebar-section-label')].find(l => l.textContent.trim().toUpperCase() === 'GESTÃO');
      const insertAfter = gestaoLabel || nav.querySelector('#navManageProposals') || nav.firstChild;
      const mk = (id, sec, label, cls) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `nav-item ${cls}`;
        b.id = id;
        b.dataset.section = sec;
        b.innerHTML = `${navIconHtml('book')}<span class="nav-label">${label}</span>`;
        return b;
      };
      const manage = mk('navTrainingsManage', 'secTrainingsManage', 'Treinamentos', 'trainings-manage-nav');
      const rh = mk('navTrainingsRh', 'secTrainingsRh', 'Notas do RH', 'trainings-rh-nav');
      const mine = mk('navTrainingsCollab', 'secTrainings', 'Meus treinamentos', 'trainings-collab-nav');
      if (insertAfter?.nextSibling) {
        insertAfter.parentNode.insertBefore(manage, insertAfter.nextSibling);
        manage.after(rh);
        rh.after(mine);
      } else {
        nav.appendChild(manage);
        nav.appendChild(rh);
        nav.appendChild(mine);
      }
    },

    initAdmin() {
      this.init();
    },

    init() {
      ensureModals();
      const role = sessionRole();
      const onAdminPanel = _isSouBluAdminPanel();
      const onTrainingsPage = _isSouBluTrainingsPage();

      if (!onAdminPanel && !onTrainingsPage) {
        this.ensureUi();
      }
      if (!onAdminPanel && !onTrainingsPage && (canManage(role) || canRhReport(role))) {
        this.ensureAdminSections();
        this.wireAdminNav();
      }

      if (onTrainingsPage) {
        document.querySelectorAll('.trainings-manage-nav').forEach(el => {
          el.style.display = canManage(role) ? '' : 'none';
        });
        document.querySelectorAll('.trainings-rh-nav').forEach(el => {
          el.style.display = canRhReport(role) ? '' : 'none';
        });
        return;
      }

      document.querySelectorAll('.trainings-manage-nav').forEach(el => {
        el.style.display = (!onAdminPanel && canManage(role)) ? '' : 'none';
      });
      document.querySelectorAll('.trainings-rh-nav').forEach(el => {
        el.style.display = (!onAdminPanel && canRhReport(role)) ? '' : 'none';
      });
      document.querySelectorAll('.trainings-collab-nav').forEach(el => {
        el.style.display = onAdminPanel ? 'none' : '';
      });
      const cfg = window.__ADMIN_NAV_CFG__;
      if (cfg) this.applyNavVisibility(cfg);
    },
  };

  window.Trainings = Trainings;
  window.updateTrainingsBadge = () => Trainings.updateBadge();

  function ensureModals() {
    if (document.getElementById('trainingModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
<div class="modal-overlay" id="trainingModal"><div class="modal" style="max-width:640px;"><div class="modal-header">
  <h3 id="trainingModalTitle">Treinamento</h3><button type="button" class="modal-close" onclick="closeModal('trainingModal')"></button></div>
<div class="modal-body" style="max-height:70vh;overflow-y:auto;">
  <input type="hidden" id="trainingEditId"/>
  <div class="form-group"><label>Título *</label><input type="text" id="trnTitle" class="form-control"/></div>
  <div class="form-row"><div class="form-group"><label>Tipo</label>
    <select id="trnKind" class="form-control"><option value="tutorial">Tutorial</option><option value="palestra">Palestra</option></select></div>
  <div class="form-group"><label>Categoria</label>
    <select id="trnCategory" class="form-control">
      <option value="obrigatorio">Treinamentos obrigatórios</option>
      <option value="video_vendas">Vídeos técnicas de vendas</option>
      <option value="curso_institucional">Cursos institucionais</option>
      <option value="regimento">Regimento interno</option>
    </select></div></div>
  <div class="form-row"><div class="form-group"><label>Prazo final</label><input type="datetime-local" id="trnDeadline" class="form-control"/></div>
  <div class="form-group"></div></div>
  <div class="form-row"><div class="form-group"><label>Nota mínima (%)</label><input type="number" id="trnPassing" class="form-control" min="0" max="100" value="70"/></div>
  <div class="form-group"><label>Penalidade (pontos BLU)</label><input type="number" id="trnPenalty" class="form-control" min="0" value="50"/></div></div>
  <div class="form-group"><label>Público (papéis, vírgula ou * para todos)</label>
    <input type="text" id="trnAudience" class="form-control" placeholder="vendedor, backoffice ou *"/></div>
  <div class="form-group"><label>Resumo</label><textarea id="trnDesc" class="form-control" rows="2"></textarea></div>
  <div class="form-group"><label>Conteúdo / roteiro</label><textarea id="trnContent" class="form-control" rows="4"></textarea></div>
  <div class="form-group"><label>URL do vídeo (YouTube, Vimeo ou link)</label><input type="url" id="trnVideo" class="form-control" placeholder="https://..."/></div>
  <div class="form-group"><label>Link material (PDF/slide)</label><input type="url" id="trnResource" class="form-control"/></div>
  <div class="form-group">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <label style="margin:0;">Banco de perguntas (até ${MAX_QUESTIONS} — sorteia ${QUIZ_DRAW} na prova)</label>
      <button type="button" class="btn btn-outline btn-sm" onclick="Trainings.addQuestionRow()">+ Pergunta</button>
    </div>
    <div id="trnQuestionsEditor"></div>
  </div>
  <label><input type="checkbox" id="trnActive" checked/> Ativo</label>
</div><div class="modal-footer">
  <button type="button" class="btn btn-ghost" onclick="closeModal('trainingModal')">Cancelar</button>
  <button type="button" class="btn btn-primary" onclick="Trainings.saveEditor()">Salvar</button>
</div></div></div>
<div class="modal-overlay" id="trainingTakeModal"><div class="modal" style="max-width:600px;"><div class="modal-header">
  <h3>Treinamento</h3><button type="button" class="modal-close" onclick="closeModal('trainingTakeModal')"></button></div>
<div class="modal-body" id="trainingTakeBody" style="max-height:65vh;overflow-y:auto;"></div>
<div class="modal-footer">
  <button type="button" class="btn btn-ghost" onclick="closeModal('trainingTakeModal')">Fechar</button>
  <button type="button" class="btn btn-primary" onclick="Trainings.submitTake()">Enviar prova</button>
</div></div></div>
<div class="modal-overlay" id="muralModal"><div class="modal" style="max-width:560px;"><div class="modal-header">
  <h3 id="muralModalTitle">Comunicado no mural</h3><button type="button" class="modal-close" onclick="closeModal('muralModal')"></button></div>
<div class="modal-body">
  <input type="hidden" id="muralEditId"/>
  <div class="form-group"><label>Título *</label><input type="text" id="muralTitle" class="form-control"/></div>
  <div class="form-group"><label>Texto / comunicado</label><textarea id="muralBody" class="form-control" rows="6"></textarea></div>
  <div class="form-group"><label>Público (papéis, vírgula ou * para todos)</label>
    <input type="text" id="muralAudience" class="form-control" placeholder="vendedor, backoffice ou *"/></div>
  <label style="display:block;margin-bottom:8px;"><input type="checkbox" id="muralPinned"/> Fixar no topo do mural</label>
  <label><input type="checkbox" id="muralActive" checked/> Ativo</label>
</div><div class="modal-footer">
  <button type="button" class="btn btn-ghost" onclick="closeModal('muralModal')">Cancelar</button>
  <button type="button" class="btn btn-primary" onclick="Trainings.saveMuralEditor()">Publicar</button>
</div></div></div>`);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (window.SOUBLU_TREINAMENTOS_PAGE) return;
    setTimeout(() => { if (window.Trainings) Trainings.init(); }, 120);
  });
})();
