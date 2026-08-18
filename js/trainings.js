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

  /* Employee catalog: courses only. Company avisos (training_mural) live on Painel Inicial. */
  const CATEGORIES = [
    { id: 'obrigatorio', label: 'Treinamentos obrigatórios', icon: '' },
    { id: 'video_vendas', label: 'Vídeos técnicas de vendas', icon: '' },
    { id: 'curso_institucional', label: 'Cursos institucionais', icon: '' },
    { id: 'regimento', label: 'Regimento interno', icon: '' },
  ];

  const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.id, c.label]));

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

  /**
   * Mesma prova para todos os usuários (ordem fixa do banco).
   * Não sorteia — o sorteio aleatório fazia a nota variar entre pessoas.
   */
  function _pickQuestionsForAttempt(allQs) {
    const pool = (allQs || []).map(_normQuestion).filter(Boolean);
    if (!pool.length) return [];
    return pool.map((q, i) => ({ ...q, origIndex: i }));
  }

  function _embedVideo(url) {
    const u = String(url || '').trim();
    if (!u) return '';

    // Arquivo de vídeo direto (MP4, WebM, MOV, AVI, etc.) ou via upload
    if (/\.(mp4|webm|mov|mkv|avi)(\?.*)?$/i.test(u) || u.includes('/file.php') || u.includes('/storage/v1/object/public/')) {
      return `
        <div style="margin:14px 0;border-radius:12px;overflow:hidden;background:#000;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
          <video controls src="${esc(u)}" style="width:100%;max-height:480px;display:block;" controlsList="nodownload"></video>
        </div>
      `;
    }

    // Google Drive vídeo (view/edit -> preview embed)
    const gd = u.match(/drive\.google\.com\/file\/d\/([^\/]+)/i);
    if (gd) {
      return `
        <div style="position:relative;padding-top:56.25%;margin:14px 0;border-radius:12px;overflow:hidden;background:#000;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
          <iframe src="https://drive.google.com/file/d/${gd[1]}/preview" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allowfullscreen></iframe>
        </div>
      `;
    }

    // YouTube (watch, shorts, embed, youtu.be)
    const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]+)/i);
    if (yt) {
      return `
        <div style="position:relative;padding-top:56.25%;margin:14px 0;border-radius:12px;overflow:hidden;background:#000;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
          <iframe src="https://www.youtube.com/embed/${yt[1]}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allowfullscreen loading="lazy"></iframe>
        </div>
      `;
    }

    // Loom
    const lm = u.match(/loom\.com\/(?:share|embed)\/([\w-]+)/i);
    if (lm) {
      return `
        <div style="position:relative;padding-top:56.25%;margin:14px 0;border-radius:12px;overflow:hidden;background:#000;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
          <iframe src="https://www.loom.com/embed/${lm[1]}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allowfullscreen></iframe>
        </div>
      `;
    }

    // Vimeo
    const vm = u.match(/vimeo\.com\/(\d+)/i);
    if (vm) {
      return `
        <div style="position:relative;padding-top:56.25%;margin:14px 0;border-radius:12px;overflow:hidden;background:#000;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
          <iframe src="https://player.vimeo.com/video/${vm[1]}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allowfullscreen loading="lazy"></iframe>
        </div>
      `;
    }

    return `
      <div style="margin:12px 0;padding:12px 16px;background:var(--color-surface-2);border-radius:8px;border:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between;">
        <span>▶ Assistir Vídeo do Treinamento</span>
        <a href="${esc(u)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">▶ Abrir Vídeo</a>
      </div>
    `;
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

  function statusLabel(st, passed, deadline) {
    if (st === 'passed' || passed) return '<span class="badge badge-success">Aprovado</span>';
    if (st === 'penalized') return '<span class="badge badge-danger">Penalizado</span>';
    if (st === 'failed') return '<span class="badge badge-danger">Reprovado</span>';
    if (deadline && new Date(deadline) < new Date()) {
      return '<span class="badge badge-warning">Prazo expirado</span>';
    }
    return '<span class="badge badge-muted">Pendente</span>';
  }

  /** Já enviou a prova — apenas 1 tentativa. */
  function _attemptFinished(att) {
    if (!att) return false;
    if (att.completed_at) return true;
    if (['passed', 'failed', 'penalized'].includes(String(att.status || ''))) return true;
    if (att.score != null && att.score !== '') return true;
    return false;
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
        btn.innerHTML = `${navIconHtml('book')}<span class="nav-label">Treinamentos</span><span class="nav-badge trainings-badge" id="trainingsBadge" style="display:none;">0</span>`;
        btn.onclick = () => {
          const href = typeof Auth !== 'undefined' && Auth.treinamentosPageHrefFresh
            ? Auth.treinamentosPageHrefFresh()
            : (typeof Auth !== 'undefined' && Auth.treinamentosPageHref
              ? Auth.treinamentosPageHref()
              : 'pages/treinamentos.html');
          window.location.href = href;
        };
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

    _activeCategory: 'obrigatorio',

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
        let btnLabel = isRegimento && !(tr.questions || []).length ? 'Ler / Confirmar' : 'Iniciar / Prova';
        let disabledAttr = '';
        const hasQuiz = (tr.questions || []).length > 0;
        if (hasQuiz && _attemptFinished(att)) {
          btnLabel = 'Prova Concluída (1x)';
          disabledAttr = 'disabled title="Apenas 1 tentativa permitida." style="opacity:0.6; cursor:not-allowed;"';
        } else if (att && !hasQuiz) {
          btnLabel = 'Rever Material';
        }
        return `<div class="card card-padded" style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div><span class="badge badge-muted">${kind}</span>${cat ? ` <span class="badge badge-accent">${esc(cat)}</span>` : ''}
              <h4 style="margin:8px 0 4px;">${esc(tr.title)}</h4>
              <p style="font-size:13px;color:var(--color-text-muted);margin:0;">Prazo: ${dl}${!isRegimento ? ` · Nota mínima: ${tr.passing_score}% · Penalidade: ${tr.penalty_points || 0} pts` : ''}</p>
            </div>
            <div style="text-align:right;">${statusLabel(att?.status, att?.passed, tr.deadline_at)}
              ${att?.score != null ? `<div style="font-size:13px;margin-top:6px;">Nota: <strong>${att.score}%</strong></div>` : ''}
              <button type="button" class="btn btn-primary btn-sm" style="margin-top:8px;" ${disabledAttr} onclick="Trainings.openTake('${esc(tr.id)}')">${btnLabel}</button>
            </div>
          </div>
        </div>`;
      }));
      return cards.join('');
    },

    _categoryTabsHtml(active) {
      return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">${
        CATEGORIES.map(c => `<button type="button" class="btn btn-sm ${active === c.id ? 'btn-primary' : 'btn-outline'}" onclick="Trainings.switchCategory('${c.id}')">${esc(c.label)}</button>`).join('')
      }</div>`;
    },

    async switchCategory(catId) {
      this._activeCategory = catId === 'mural' ? 'obrigatorio' : (catId || 'obrigatorio');
      await this.renderEmployee();
    },

    async renderEmployee() {
      this.ensureUi();
      const root = document.getElementById('trainingsRoot');
      if (!root) return;
      const user = await Auth.getCurrentUser();
      if (!user) return;
      let cat = this._activeCategory || 'obrigatorio';
      if (cat === 'mural') cat = 'obrigatorio';
      this._activeCategory = cat;
      const list = await trainingsForUser(user, cat);
      const bodyHtml = await this._renderTrainingCards(list, user);
      root.innerHTML = `<div class="page-header"><div class="page-header-text"><h2>Treinamentos</h2><p>Conteúdos obrigatórios, vídeos, cursos e regimento interno</p></div></div>
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
      this.ensureModals();
      const root = document.getElementById('trainingsAdminRoot');
      if (!root) return;
      const s = Auth.getSession();
      const partnerRoot = window.PARTNER_ROOT_ID || (s?.role === 'parceiro' ? s.id : await DB.getPartnerRootForUser(s.id));
      // #region agent log
      fetch('http://127.0.0.1:7585/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'post-fix',hypothesisId:'E',location:'trainings.js:renderAdminManage:beforePurge',message:'before legacy purge',data:{href:String(location.href||'')},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (window.TrainingTracks?.purgeLegacySeedCourses) {
        await TrainingTracks.purgeLegacySeedCourses().catch(() => null);
      }
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
          <button type="button" class="btn btn-sm ${tab === 'trilhas' ? 'btn-primary' : 'btn-outline'}" onclick="Trainings.switchAdminTab('trilhas')">Trilhas</button>
          <button type="button" class="btn btn-sm ${tab === 'mural' ? 'btn-primary' : 'btn-outline'}" onclick="Trainings.switchAdminTab('mural')">Mural</button>
        </div>
        <div id="trainingsAdminTabBody"></div>`;
      const body = document.getElementById('trainingsAdminTabBody');
      if (tab === 'trilhas') {
        if (window.TrainingTracks && typeof TrainingTracks.renderAdminTracksTable === 'function') {
          await TrainingTracks.renderAdminTracksTable(body);
        } else {
          body.innerHTML = '<p class="text-muted">Módulo de trilhas não carregado. Abra a página Treinamentos e atualize (Ctrl+F5).</p>';
        }
        return;
      }
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
      this._allTrainings = list || [];
      // #region agent log
      fetch('http://127.0.0.1:7585/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'pre-fix',hypothesisId:'D',location:'trainings.js:renderAdminManage:list',message:'admin conteúdos list',data:{n:(list||[]).length,ids:(list||[]).slice(0,10).map(t=>({id:t.id,title:t.title})),online:!!(typeof DB!=='undefined'&&DB.online),partnerRoot:partnerRoot||null},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
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

    async generateCourseWithAI() {
      const existingTitle = document.getElementById('trnTitle')?.value?.trim() || '';
      const defaultTopic = existingTitle ? existingTitle : 'Curso de Vendas de Consórcio: Prospecção, Negociação e Fechamento';
      const topic = prompt('🤖 Descreva o assunto para a IA estruturar este treinamento em Módulos, Aulas e Provas:\n\nExemplo: ' + defaultTopic, defaultTopic);
      if (!topic || !topic.trim()) return;

      if (typeof showLoading === 'function') showLoading('🤖 A IA está estruturando o treinamento em módulos, aulas e provas...');
      
      try {
        const promptTopic = topic.trim();
        const generatedTitle = promptTopic.length > 60 ? promptTopic.slice(0, 60) + '...' : promptTopic;
        
        if (!existingTitle) {
          document.getElementById('trnTitle').value = generatedTitle;
        }
        document.getElementById('trnDesc').value = `Treinamento completo sobre ${promptTopic}. Cobrindo conceitos fundamentais, técnicas práticas de atendimento e avaliação de conhecimento.`;
        document.getElementById('trnPassing').value = '70';
        document.getElementById('trnPenalty').value = '50';

        const currentVideo = document.getElementById('trnVideo')?.value?.trim() || '';
        const currentVideo2 = document.getElementById('trnVideo2')?.value?.trim() || '';
        const currentPdf = document.getElementById('trnResource')?.value?.trim() || '';

        const aiModules = [
          {
            title: `Módulo 1: Introdução a ${generatedTitle}`,
            lessons: [
              { id: 'les_' + Date.now() + '_1', title: 'Aula 1: Conceitos Iniciais e Objetivos', type: 'video', url: currentVideo, duration: '10 min' },
              { id: 'les_' + Date.now() + '_2', title: 'Aula 2: Guia Prático e Boas Práticas', type: 'pdf', url: currentPdf, duration: '15 min' }
            ],
            questions: [
              {
                q: `Qual é o objetivo principal abordado no Módulo 1 sobre ${generatedTitle}?`,
                options: ['Compreender os fundamentos e seguir as boas práticas recomendadas', 'Ignorar o processo de atendimento', 'Realizar procedimentos sem checagem de dados', 'Nenhuma das alternativas'],
                correct: 0
              },
              {
                q: 'Como deve ser iniciada a primeira abordagem ao cliente?',
                options: ['Com uma saudação profissional e escuta ativa das necessidades', 'Apenas enviando a tabela de preços sem explicar', 'Aguardando o cliente adivinhar as regras', 'Sem identificação do atendente'],
                correct: 0
              }
            ]
          },
          {
            title: `Módulo 2: Técnicas Avançadas e Operacional`,
            lessons: [
              { id: 'les_' + Date.now() + '_3', title: 'Aula 1: Passo a Passo da Operação e Atendimento', type: 'video', url: currentVideo2, duration: '15 min' },
              { id: 'les_' + Date.now() + '_4', title: 'Aula 2: Contorno de Objeções e Casos Práticos', type: 'video', url: '', duration: '20 min' }
            ],
            questions: [
              {
                q: 'Ao identificar uma objeção do cliente durante o atendimento, qual a conduta correta?',
                options: ['Escutar com atenção, esclarecer as dúvidas com dados claros e apresentar a solução adequada', 'Encerrar o atendimento imediatamente', 'Discutir com o cliente', 'Transferir sem avisar'],
                correct: 0
              },
              {
                q: 'O que garante a qualidade no fechamento da proposta?',
                options: ['A verificação rigorosa da documentação e confirmação dos dados com o cliente', 'Fazer o cadastro com informações incompletas', 'Não informar os valores reais ao cliente', 'Omitir taxas e prazos'],
                correct: 0
              }
            ]
          },
          {
            title: `Módulo 3: Fechamento, Conformidade e Pós-Atendimento`,
            lessons: [
              { id: 'les_' + Date.now() + '_5', title: 'Aula 1: Checklist de Fechamento e Contrato', type: 'pdf', url: '', duration: '12 min' },
              { id: 'les_' + Date.now() + '_6', title: 'Aula 2: Acompanhamento e Fidelização', type: 'video', url: '', duration: '10 min' }
            ],
            questions: [
              {
                q: 'Qual o passo final após a emissão da proposta?',
                options: ['Realizar o pós-atendimento e confirmar o recebimento do comprovante com o cliente', 'Descartar o histórico de mensagens', 'Não responder mais ao cliente', 'Apagar os registros'],
                correct: 0
              }
            ]
          }
        ];

        this.renderModulesEditor(aiModules);

        const aiCourseQuestions = [
          {
            q: `Sobre ${generatedTitle}, qual o fator determinante para o sucesso do atendimento?`,
            options: ['Conhecimento do produto, escuta ativa e transparência nas informações', 'Rapidez extrema sem conferir os documentos', 'Focar apenas no volume sem atenção às regras', 'Não tirar dúvidas do cliente'],
            correct: 0
          },
          {
            q: 'Qual documento deve ser sempre conferido antes da finalização?',
            options: ['Documento oficial com foto e comprovante válido', 'Qualquer rascunho sem assinatura', 'Comprovante antigo de terceiros', 'Nenhum documento é necessário'],
            correct: 0
          },
          {
            q: 'Em caso de inconsistência de dados no cadastro, qual deve ser a postura?',
            options: ['Solicitar a correção antes do envio da proposta', 'Aprovar o cadastro com dados incorretos', 'Ignorar os alertas do sistema', 'Preencher com dados aleatórios'],
            correct: 0
          }
        ];

        this.renderQuestionEditor(aiCourseQuestions);

        if (typeof showToast === 'function') {
          showToast('🤖 Treinamento estruturado em módulos e provas com sucesso pela IA!', 'success', 6000);
        } else {
          alert('🤖 Treinamento estruturado em módulos e provas com sucesso pela IA!');
        }
      } catch (e) {
        alert('Erro ao gerar com IA: ' + (e.message || e));
      } finally {
        if (typeof hideLoading === 'function') hideLoading();
      }
    },

    async openEditor(id) {
      if (typeof ensureModals === 'function') ensureModals();
      const isEdit = !!id;
      const titleEl = document.getElementById('trainingModalTitle');
      if (titleEl) titleEl.textContent = isEdit ? 'Editar treinamento' : 'Novo treinamento';
      const idEl = document.getElementById('trainingEditId');
      if (idEl) idEl.value = id || '';

      const resetForm = () => {
        if (document.getElementById('trnTitle')) document.getElementById('trnTitle').value = '';
        if (document.getElementById('trnImage')) document.getElementById('trnImage').value = '';
        if (document.getElementById('trnKind')) document.getElementById('trnKind').value = 'tutorial';
        if (document.getElementById('trnCategory')) document.getElementById('trnCategory').value = 'obrigatorio';
        if (document.getElementById('trnDesc')) document.getElementById('trnDesc').value = '';
        if (document.getElementById('trnContent')) document.getElementById('trnContent').value = '';
        if (document.getElementById('trnVideo')) document.getElementById('trnVideo').value = '';
        if (document.getElementById('trnVideo2')) document.getElementById('trnVideo2').value = '';
        if (document.getElementById('trnResource')) document.getElementById('trnResource').value = '';
        if (document.getElementById('trnDeadline')) document.getElementById('trnDeadline').value = '';
        if (document.getElementById('trnPassing')) document.getElementById('trnPassing').value = '70';
        if (document.getElementById('trnPenalty')) document.getElementById('trnPenalty').value = '50';
        if (document.getElementById('trnAudience')) document.getElementById('trnAudience').value = '*';
        if (document.getElementById('trnActive')) document.getElementById('trnActive').checked = true;
        this.renderModulesEditor([]);
        this.renderQuestionEditor([]);
      };

      resetForm();

      if (!isEdit) {
        openModal('trainingModal');
        return;
      }

      if (typeof showLoading === 'function') showLoading('Carregando treinamento...');
      try {
        let tr = (this._allTrainings || []).find(t => String(t.id) === String(id));
        if (!tr && typeof DB !== 'undefined' && DB.getTrainings) {
          const fresh = await DB.getTrainings({ limit: 500 }).catch(() => []);
          if (Array.isArray(fresh) && fresh.length) {
            this._allTrainings = fresh;
            tr = fresh.find(t => String(t.id) === String(id));
          }
        }
        if (!tr && typeof DB !== 'undefined' && DB.getTraining) {
          tr = await DB.getTraining(id).catch(() => null);
        }
        if (!tr) {
          throw new Error('Não foi possível carregar os dados do treinamento #' + id);
        }

        if (document.getElementById('trnTitle')) document.getElementById('trnTitle').value = tr.title || '';
        if (document.getElementById('trnKind')) document.getElementById('trnKind').value = tr.kind || 'tutorial';
        if (document.getElementById('trnCategory')) document.getElementById('trnCategory').value = tr.category || 'obrigatorio';
        if (document.getElementById('trnDesc')) document.getElementById('trnDesc').value = tr.description || '';
        if (document.getElementById('trnImage')) document.getElementById('trnImage').value = tr.image_url || tr.cover_url || '';
        let bodyText = '';
        if (typeof tr.content_body === 'string') {
          bodyText = tr.content_body;
        } else if (typeof tr.content_body === 'object' && tr.content_body !== null) {
          bodyText = JSON.stringify(tr.content_body);
        }

        if (document.getElementById('trnContent')) {
          document.getElementById('trnContent').value = (bodyText && !bodyText.trim().startsWith('{')) ? bodyText : '';
        }

        if (document.getElementById('trnVideo')) document.getElementById('trnVideo').value = tr.video_url || '';
        if (document.getElementById('trnVideo2')) document.getElementById('trnVideo2').value = tr.video_url_2 || '';
        if (document.getElementById('trnResource')) document.getElementById('trnResource').value = tr.resource_url || '';
        if (document.getElementById('trnDeadline')) document.getElementById('trnDeadline').value = tr.deadline_at ? tr.deadline_at.slice(0, 16) : '';
        if (document.getElementById('trnPassing')) document.getElementById('trnPassing').value = String(tr.passing_score ?? 70);
        if (document.getElementById('trnPenalty')) document.getElementById('trnPenalty').value = String(tr.penalty_points ?? 0);
        if (document.getElementById('trnAudience')) document.getElementById('trnAudience').value = Array.isArray(tr.audience_roles) ? tr.audience_roles.join(', ') : (tr.audience_roles || '*');
        if (document.getElementById('trnActive')) document.getElementById('trnActive').checked = tr.active !== false;

        let courseJson = null;
        try {
          if (typeof tr.content_body === 'object' && tr.content_body !== null) {
            courseJson = tr.content_body;
          } else if (typeof tr.content_body === 'string' && tr.content_body.trim().startsWith('{')) {
            courseJson = JSON.parse(tr.content_body);
          }
        } catch (_) {}

        if (courseJson && courseJson.type === 'course' && Array.isArray(courseJson.modules) && courseJson.modules.length) {
          this.renderModulesEditor(courseJson.modules);
        } else {
          const legacyLessons = [];
          if (tr.video_url) legacyLessons.push({ id: 'les_v1', title: 'Aula 1: Vídeo', type: 'video', url: tr.video_url, duration: '10 min' });
          if (tr.video_url_2) legacyLessons.push({ id: 'les_v2', title: 'Aula 2: Vídeo Secundário', type: 'video', url: tr.video_url_2, duration: '10 min' });
          if (tr.resource_url) legacyLessons.push({ id: 'les_r1', title: 'Aula 3: Material PDF', type: 'pdf', url: tr.resource_url, duration: '15 min' });
          this.renderModulesEditor(legacyLessons.length ? [{ title: tr.title || 'Módulo 1: Introdução', lessons: legacyLessons }] : []);
        }

        this.renderQuestionEditor(tr.questions || []);
        openModal('trainingModal');
      } catch (e) {
        alert('Erro ao carregar treinamento: ' + (e.message || e));
      } finally {
        if (typeof hideLoading === 'function') hideLoading();
      }
    },

    _currentModules: [],

    renderModulesEditor(modulesList) {
      this._currentModules = Array.isArray(modulesList) && modulesList.length
        ? JSON.parse(JSON.stringify(modulesList))
        : [{
            title: 'Módulo 1: Introdução',
            lessons: [{ id: 'les_' + Date.now(), title: 'Aula 1: Apresentação', type: 'video', url: '', duration: '10 min' }]
          }];
      this._drawModulesUI();
    },

    _dragSourceType: null,
    _dragSourceModIdx: null,
    _dragSourceLesIdx: null,

    handleModDragStart(e, mIdx) {
      this._syncModuleData();
      this._dragSourceType = 'module';
      this._dragSourceModIdx = mIdx;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'mod_' + mIdx);
      e.currentTarget.style.opacity = '0.5';
    },
    handleModDragEnd(e) {
      e.currentTarget.style.opacity = '1';
      this._dragSourceType = null;
      this._dragSourceModIdx = null;
    },
    handleModDragOver(e) {
      if (this._dragSourceType === 'module') {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }
    },
    handleModDrop(e, targetModIdx) {
      e.preventDefault();
      if (this._dragSourceType !== 'module' || this._dragSourceModIdx === null) return;
      const srcIdx = this._dragSourceModIdx;
      if (srcIdx === targetModIdx) return;
      this._syncModuleData();
      const moved = this._currentModules.splice(srcIdx, 1)[0];
      this._currentModules.splice(targetModIdx, 0, moved);
      this._drawModulesUI();
      if (typeof showToast === 'function') showToast(`Módulo reordenado para a posição ${targetModIdx + 1}!`, 'success');
    },

    handleLesDragStart(e, mIdx, lIdx) {
      e.stopPropagation();
      this._syncModuleData();
      this._dragSourceType = 'lesson';
      this._dragSourceModIdx = mIdx;
      this._dragSourceLesIdx = lIdx;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `les_${mIdx}_${lIdx}`);
      e.currentTarget.style.opacity = '0.5';
    },
    handleLesDragEnd(e) {
      e.currentTarget.style.opacity = '1';
      this._dragSourceType = null;
      this._dragSourceModIdx = null;
      this._dragSourceLesIdx = null;
    },
    handleLesDragOver(e) {
      if (this._dragSourceType === 'lesson') {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }
    },
    handleLesDrop(e, targetModIdx, targetLesIdx) {
      e.preventDefault();
      e.stopPropagation();
      if (this._dragSourceType !== 'lesson' || this._dragSourceModIdx === null || this._dragSourceLesIdx === null) return;
      const srcModIdx = this._dragSourceModIdx;
      const srcLesIdx = this._dragSourceLesIdx;
      this._syncModuleData();
      if (this._currentModules[srcModIdx] && this._currentModules[srcModIdx].lessons) {
        const moved = this._currentModules[srcModIdx].lessons.splice(srcLesIdx, 1)[0];
        if (moved) {
          if (!this._currentModules[targetModIdx].lessons) this._currentModules[targetModIdx].lessons = [];
          this._currentModules[targetModIdx].lessons.splice(targetLesIdx, 0, moved);
          this._drawModulesUI();
          if (typeof showToast === 'function') showToast(`Aula movida com sucesso!`, 'success');
        }
      }
    },

    _drawModulesUI() {
      const box = document.getElementById('trnModulesEditor');
      if (!box) return;

      if (!this._currentModules || !this._currentModules.length) {
        box.innerHTML = `
          <div style="padding:14px;background:var(--color-surface-2);border-radius:10px;text-align:center;">
            <p class="text-muted" style="margin:0 0 10px;font-size:13px;">Nenhum módulo criado ainda neste curso.</p>
            <button type="button" class="btn btn-accent btn-sm" onclick="Trainings.addModuleRow()">+ Criar 1º Módulo</button>
          </div>
        `;
        return;
      }

      box.innerHTML = this._currentModules.map((mod, mIdx) => {
        const lessonsHtml = (mod.lessons || []).map((les, lIdx) => `
          <div class="card card-padded" draggable="true" ondragstart="Trainings.handleLesDragStart(event, ${mIdx}, ${lIdx})" ondragend="Trainings.handleLesDragEnd(event)" ondragover="Trainings.handleLesDragOver(event)" ondrop="Trainings.handleLesDrop(event, ${mIdx}, ${lIdx})" style="padding:12px;margin:8px 0;background:var(--color-surface-1);border:1px solid var(--color-border);border-radius:8px;cursor:grab;" data-les-m="${mIdx}" data-les-l="${lIdx}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;">
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:16px;cursor:grab;user-select:none;color:var(--color-accent);" title="Arraste para mover esta aula">⋮⋮</span>
                <span style="font-weight:700;font-size:13px;color:var(--color-accent);">Aula ${lIdx + 1}</span>
              </div>
              <button type="button" class="btn btn-ghost btn-sm" style="color:var(--color-danger);padding:2px 6px;" onclick="Trainings.removeLessonRow(${mIdx}, ${lIdx})">🗑️ Remover Aula</button>
            </div>
            
            <div class="form-row" style="margin-bottom:8px;">
              <div class="form-group mb-0" style="flex:2;">
                <label style="font-size:12px;">Título da Aula *</label>
                <input type="text" class="form-control form-control-sm les-title" value="${esc(les.title || '')}" placeholder="Ex: Aula 1 - Boas-Vindas" oninput="Trainings._syncModuleData()"/>
              </div>
              <div class="form-group mb-0" style="flex:1;">
                <label style="font-size:12px;">Tipo de Conteúdo</label>
                <select class="form-control form-control-sm les-type" onchange="Trainings._syncModuleData()">
                  <option value="video" ${les.type === 'video' ? 'selected' : ''}>📹 Vídeo</option>
                  <option value="pdf" ${les.type === 'pdf' ? 'selected' : ''}>📄 PDF / Documento</option>
                  <option value="text" ${les.type === 'text' ? 'selected' : ''}>📝 Texto</option>
                </select>
              </div>
              <div class="form-group mb-0" style="flex:1;">
                <label style="font-size:12px;">Duração Estimada</label>
                <input type="text" class="form-control form-control-sm les-duration" value="${esc(les.duration || '10 min')}" placeholder="Ex: 15 min" oninput="Trainings._syncModuleData()"/>
              </div>
            </div>

            <div class="form-group mb-0">
              <label style="font-size:12px;">Link / URL do Vídeo ou PDF da Aula</label>
              <div style="display:flex;gap:6px;">
                <input type="url" class="form-control form-control-sm les-url" value="${esc(les.url || '')}" placeholder="https://youtube.com/watch?v=... ou https://drive.google.com/..." oninput="Trainings._syncModuleData()"/>
                <input type="file" id="fileLesMedia_${mIdx}_${lIdx}" accept="video/*,.mp4,.pdf,.doc,.docx" style="display:none;" onchange="Trainings.uploadFileToLessonInput(this, ${mIdx}, ${lIdx})"/>
                <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('fileLesMedia_${mIdx}_${lIdx}').click()" style="white-space:nowrap;font-size:11px;">📁 Upload Vídeo/PDF</button>
              </div>
            </div>
          </div>
        `).join('');

        const modQuestionsHtml = (mod.questions || []).map((qItem, qIdx) => {
          const optsHtml = (qItem.options || ['', '']).map((opt, oIdx) => `
            <div style="display:flex;gap:6px;align-items:center;margin:3px 0;">
              <input type="radio" name="modQCorrect_${mIdx}_${qIdx}" value="${oIdx}" ${qItem.correct === oIdx ? 'checked' : ''} class="mod-q-correct" title="Alternativa correta"/>
              <input type="text" class="form-control form-control-sm mod-q-opt" value="${esc(opt)}" placeholder="Alternativa ${oIdx + 1}" oninput="Trainings._syncModuleData()"/>
            </div>
          `).join('');

          return `
            <div class="card card-padded" style="padding:10px;margin:6px 0;background:var(--color-surface-1);border:1px dashed var(--color-border);border-radius:8px;" data-mod-q-m="${mIdx}" data-mod-q-i="${qIdx}">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <strong style="font-size:12px;">Pergunta ${qIdx + 1} do Módulo</strong>
                <button type="button" class="btn btn-ghost btn-sm" style="color:var(--color-danger);padding:1px 4px;font-size:11px;" onclick="Trainings.removeModuleQuestionRow(${mIdx}, ${qIdx})">🗑️ Remover Pergunta</button>
              </div>
              <input type="text" class="form-control form-control-sm mod-q-title" value="${esc(qItem.q || '')}" placeholder="Enunciado da Pergunta do Módulo..." oninput="Trainings._syncModuleData()"/>
              <div style="margin-top:6px;font-size:11px;color:var(--color-text-muted);">Alternativas (marque a correta):</div>
              ${optsHtml}
              <button type="button" class="btn btn-ghost btn-sm" style="font-size:11px;margin-top:4px;" onclick="Trainings.addModuleQuestionOptionRow(${mIdx}, ${qIdx})">+ Alternativa</button>
            </div>
          `;
        }).join('');

        return `
          <div class="card card-padded" draggable="true" ondragstart="Trainings.handleModDragStart(event, ${mIdx})" ondragend="Trainings.handleModDragEnd(event)" ondragover="Trainings.handleModDragOver(event)" ondrop="Trainings.handleModDrop(event, ${mIdx})" style="padding:14px;margin-bottom:14px;border:1px solid var(--color-border);background:var(--color-surface-2);cursor:grab;" data-mod-idx="${mIdx}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;">
              <div style="display:flex;align-items:center;gap:8px;flex:1;">
                <span style="font-size:18px;cursor:grab;user-select:none;color:var(--color-accent);" title="Clique e arraste para reordenar o módulo">☰</span>
                <span style="font-weight:800;font-size:14px;">Módulo ${mIdx + 1}:</span>
                <input type="text" class="form-control mod-title" value="${esc(mod.title || '')}" placeholder="Nome do Módulo (ex: Módulo 1 - Introdução)" style="font-weight:700;" oninput="Trainings._syncModuleData()"/>
              </div>
              <button type="button" class="btn btn-outline btn-sm" style="color:var(--color-danger);" onclick="Trainings.removeModuleRow(${mIdx})">🗑️ Excluir Módulo</button>
            </div>

            <div style="margin-left:8px;padding-left:12px;border-left:2px solid var(--color-border);">
              <div style="font-weight:700;font-size:13px;margin-bottom:6px;">Aulas do Módulo:</div>
              ${lessonsHtml}
              <button type="button" class="btn btn-accent btn-sm mt-xs" onclick="Trainings.addLessonRow(${mIdx})">+ Adicionar Aula neste Módulo</button>
            </div>

            <div style="margin-top:14px;margin-left:8px;padding-left:12px;border-left:2px dashed var(--color-border);">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-weight:700;font-size:13px;color:var(--color-accent);">❓ Perguntas de Fixação deste Módulo (Prova do Módulo)</span>
                <button type="button" class="btn btn-outline btn-sm" onclick="Trainings.addModuleQuestionRow(${mIdx})" style="font-size:11px;">+ Pergunta neste Módulo</button>
              </div>
              ${modQuestionsHtml}
            </div>
          </div>
        `;
      }).join('');
    },

    _syncModuleData() {
      const modEls = document.querySelectorAll('[data-mod-idx]');
      const modules = [];

      modEls.forEach(mEl => {
        const mIdx = parseInt(mEl.getAttribute('data-mod-idx'), 10);
        const title = mEl.querySelector('.mod-title')?.value?.trim() || `Módulo ${mIdx + 1}`;
        const lesEls = mEl.querySelectorAll('[data-les-m]');
        const lessons = [];

        lesEls.forEach(lEl => {
          const lTitle = lEl.querySelector('.les-title')?.value?.trim() || 'Aula';
          const lType = lEl.querySelector('.les-type')?.value || 'video';
          const lDuration = lEl.querySelector('.les-duration')?.value?.trim() || '10 min';
          const lUrl = lEl.querySelector('.les-url')?.value?.trim() || '';

          lessons.push({
            id: 'les_' + Math.random().toString(36).substr(2, 9),
            title: lTitle,
            type: lType,
            duration: lDuration,
            url: lUrl,
          });
        });

        const qEls = mEl.querySelectorAll('[data-mod-q-i]');
        const questions = [];
        qEls.forEach(qEl => {
          const qText = qEl.querySelector('.mod-q-title')?.value?.trim() || '';
          const options = [];
          qEl.querySelectorAll('.mod-q-opt').forEach(optInp => {
            const v = optInp.value.trim();
            if (v) options.push(v);
          });
          const correctRadio = qEl.querySelector('.mod-q-correct:checked');
          const correct = correctRadio ? parseInt(correctRadio.value, 10) : 0;
          if (qText && options.length >= 2) {
            questions.push({ q: qText, options, correct });
          }
        });

        modules.push({ title, lessons, questions });
      });

      this._currentModules = modules;
    },

    addModuleRow() {
      this._syncModuleData();
      this._currentModules.push({
        title: `Módulo ${this._currentModules.length + 1}: `,
        lessons: [{ id: 'les_' + Date.now(), title: 'Aula 1: ', type: 'video', url: '', duration: '10 min' }]
      });
      this._drawModulesUI();
    },

    removeModuleRow(mIdx) {
      this._syncModuleData();
      this._currentModules.splice(mIdx, 1);
      this._drawModulesUI();
    },

    addLessonRow(mIdx) {
      this._syncModuleData();
      if (!this._currentModules[mIdx]) return;
      const count = (this._currentModules[mIdx].lessons || []).length + 1;
      this._currentModules[mIdx].lessons.push({
        id: 'les_' + Date.now(),
        title: `Aula ${count}: `,
        type: 'video',
        url: '',
        duration: '10 min'
      });
      this._drawModulesUI();
    },

    removeLessonRow(mIdx, lIdx) {
      this._syncModuleData();
      if (this._currentModules[mIdx] && this._currentModules[mIdx].lessons) {
        this._currentModules[mIdx].lessons.splice(lIdx, 1);
      }
      this._drawModulesUI();
    },

    addModuleQuestionRow(mIdx) {
      this._syncModuleData();
      if (!this._currentModules[mIdx]) return;
      if (!this._currentModules[mIdx].questions) this._currentModules[mIdx].questions = [];
      this._currentModules[mIdx].questions.push({
        q: '',
        options: ['', ''],
        correct: 0,
      });
      this._drawModulesUI();
    },

    removeModuleQuestionRow(mIdx, qIdx) {
      this._syncModuleData();
      if (this._currentModules[mIdx] && this._currentModules[mIdx].questions) {
        this._currentModules[mIdx].questions.splice(qIdx, 1);
      }
      this._drawModulesUI();
    },

    addModuleQuestionOptionRow(mIdx, qIdx) {
      this._syncModuleData();
      if (this._currentModules[mIdx]?.questions?.[qIdx]) {
        const q = this._currentModules[mIdx].questions[qIdx];
        if (!q.options) q.options = [];
        if (q.options.length < 6) q.options.push('');
      }
      this._drawModulesUI();
    },

    _currentQuestions: [],

    renderQuestionEditor(questionsList) {
      this._currentQuestions = Array.isArray(questionsList) ? JSON.parse(JSON.stringify(questionsList)) : [];
      this._drawQuestionsUI();
    },

    _drawQuestionsUI() {
      const box = document.getElementById('trnQuestionsEditor');
      if (!box) return;

      if (!this._currentQuestions || !this._currentQuestions.length) {
        box.innerHTML = `<p class="text-muted" style="font-size:12px;margin:4px 0;">Nenhuma pergunta cadastrada para a prova final do curso.</p>`;
        return;
      }

      box.innerHTML = this._currentQuestions.map((qItem, qIdx) => {
        const optsHtml = (qItem.options || ['', '']).map((opt, oIdx) => `
          <div style="display:flex;gap:6px;align-items:center;margin:3px 0;">
            <input type="radio" name="mainQCorrect_${qIdx}" value="${oIdx}" ${qItem.correct === oIdx ? 'checked' : ''} class="main-q-correct" title="Alternativa correta"/>
            <input type="text" class="form-control form-control-sm main-q-opt" value="${esc(opt)}" placeholder="Alternativa ${oIdx + 1}" oninput="Trainings._syncQuestionData()"/>
          </div>
        `).join('');

        return `
          <div class="card card-padded" style="padding:10px;margin:8px 0;background:var(--color-surface-1);border:1px solid var(--color-border);border-radius:8px;" data-main-q-i="${qIdx}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <strong style="font-size:12px;color:var(--color-accent);">Pergunta ${qIdx + 1} da Prova Final</strong>
              <button type="button" class="btn btn-ghost btn-sm" style="color:var(--color-danger);padding:1px 4px;font-size:11px;" onclick="Trainings.removeQuestionRow(${qIdx})">🗑️ Remover</button>
            </div>
            <input type="text" class="form-control form-control-sm main-q-title" value="${esc(qItem.q || '')}" placeholder="Enunciado da pergunta final..." oninput="Trainings._syncQuestionData()"/>
            <div style="margin-top:6px;font-size:11px;color:var(--color-text-muted);">Alternativas (marque a correta):</div>
            ${optsHtml}
            <button type="button" class="btn btn-ghost btn-sm" style="font-size:11px;margin-top:4px;" onclick="Trainings.addQuestionOptionRow(${qIdx})">+ Alternativa</button>
          </div>
        `;
      }).join('');
    },

    _syncQuestionData() {
      const qEls = document.querySelectorAll('[data-main-q-i]');
      const questions = [];

      qEls.forEach(qEl => {
        const qText = qEl.querySelector('.main-q-title')?.value?.trim() || '';
        const optInputs = qEl.querySelectorAll('.main-q-opt');
        const options = [];
        optInputs.forEach(i => options.push(i.value.trim()));
        const correctRadio = qEl.querySelector('.main-q-correct:checked');
        const correct = correctRadio ? parseInt(correctRadio.value, 10) : 0;
        if (qText) {
          questions.push({ q: qText, options, correct });
        }
      });

      this._currentQuestions = questions;
    },

    addQuestionRow() {
      this._syncQuestionData();
      if (!this._currentQuestions) this._currentQuestions = [];
      this._currentQuestions.push({
        q: '',
        options: ['', '', '', ''],
        correct: 0
      });
      this._drawQuestionsUI();
    },

    removeQuestionRow(qIdx) {
      this._syncQuestionData();
      if (this._currentQuestions && this._currentQuestions[qIdx]) {
        this._currentQuestions.splice(qIdx, 1);
        this._drawQuestionsUI();
      }
    },

    addQuestionOptionRow(qIdx) {
      this._syncQuestionData();
      if (this._currentQuestions && this._currentQuestions[qIdx]) {
        if (!this._currentQuestions[qIdx].options) this._currentQuestions[qIdx].options = [];
        if (this._currentQuestions[qIdx].options.length < 6) {
          this._currentQuestions[qIdx].options.push('');
          this._drawQuestionsUI();
        }
      }
    },

    collectQuestionsFromEditor() {
      this._syncQuestionData();
      return this._currentQuestions || [];
    },

    async uploadFileToInput(fileEl, targetInputId) {
      const file = fileEl.files?.[0];
      if (!file) return;

      if (typeof showLoading === 'function') showLoading('Enviando imagem...');
      try {
        const formData = new FormData();
        formData.append('file', file);
        const headers = {};
        if (typeof API_KEY !== 'undefined' && API_KEY) headers['X-API-Key'] = API_KEY;

        const res = await fetch(`${API_BASE_URL}/api/upload.php?bucket=trainings`, {
          method: 'POST',
          headers,
          body: formData,
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Falha ao enviar arquivo.');
        }

        const fileUrl = data.url || data.path;
        const targetEl = document.getElementById(targetInputId);
        if (targetEl) {
            targetEl.value = fileUrl;
        }
        if (typeof showToast === 'function') showToast('Imagem enviada com sucesso!', 'success');
      } catch (e) {
        alert('Erro no envio: ' + (e.message || e));
      } finally {
        if (typeof hideLoading === 'function') hideLoading();
        fileEl.value = '';
      }
    },

    async uploadFileToLessonInput(fileEl, mIdx, lIdx) {
      const file = fileEl.files?.[0];
      if (!file) return;

      if (typeof showLoading === 'function') showLoading('Enviando arquivo da aula...');
      try {
        const formData = new FormData();
        formData.append('file', file);
        const headers = {};
        if (typeof API_KEY !== 'undefined' && API_KEY) headers['X-API-Key'] = API_KEY;

        const res = await fetch(`${API_BASE_URL}/api/upload.php?bucket=trainings`, {
          method: 'POST',
          headers,
          body: formData,
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Falha ao enviar arquivo.');
        }

        const fileUrl = data.url || data.path;
        this._syncModuleData();
        if (this._currentModules[mIdx]?.lessons?.[lIdx]) {
          this._currentModules[mIdx].lessons[lIdx].url = fileUrl;
          if (/\.pdf$/i.test(fileUrl)) this._currentModules[mIdx].lessons[lIdx].type = 'pdf';
          else if (/\.(mp4|webm|mov)$/i.test(fileUrl)) this._currentModules[mIdx].lessons[lIdx].type = 'video';
        }
        this._drawModulesUI();
        if (typeof showToast === 'function') showToast('Arquivo enviado com sucesso para a aula!', 'success');
      } catch (e) {
        alert('Erro no envio: ' + (e.message || e));
      } finally {
        if (typeof hideLoading === 'function') hideLoading();
        fileEl.value = '';
      }
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

      this._syncModuleData();
      const modules = this._currentModules || [];

      let firstVideo = '';
      let firstPdf = '';
      modules.forEach(m => {
        (m.lessons || []).forEach(l => {
          if (!firstVideo && l.type === 'video' && l.url) firstVideo = l.url;
          if (!firstPdf && (l.type === 'pdf' || /\.pdf$/i.test(l.url)) && l.url) firstPdf = l.url;
        });
      });

      const coursePayload = {
        type: 'course',
        title: document.getElementById('trnTitle').value.trim(),
        modules: modules,
      };

      const row = {
        id,
        title: document.getElementById('trnTitle').value.trim(),
        kind: document.getElementById('trnKind').value,
        category: document.getElementById('trnCategory').value || 'obrigatorio',
        description: document.getElementById('trnDesc').value.trim(),
        image_url: document.getElementById('trnImage')?.value?.trim() || '',
        content_body: JSON.stringify(coursePayload),
        video_url: firstVideo || document.getElementById('trnVideo')?.value?.trim() || '',
        video_url_2: document.getElementById('trnVideo2')?.value?.trim() || '',
        resource_url: firstPdf || document.getElementById('trnResource')?.value?.trim() || '',
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
      // #region agent log
      fetch('http://127.0.0.1:7585/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'pre-fix',hypothesisId:'A',location:'trainings.js:remove:entry',message:'remove called',data:{id:String(id||''),hasDB:typeof DB!=='undefined',hasDelete:typeof DB?.deleteTraining==='function',scriptProbe:(document.querySelector('script[src*=\"trainings.js\"]')||{}).src||''},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (!id) {
        showToast('ID do treinamento inválido.', 'error');
        return;
      }
      const okConfirm = confirm('Excluir este treinamento e todas as notas?');
      // #region agent log
      fetch('http://127.0.0.1:7585/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'pre-fix',hypothesisId:'B',location:'trainings.js:remove:confirm',message:'confirm result',data:{id:String(id),okConfirm:!!okConfirm},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (!okConfirm) return;
      showLoading('Excluindo...');
      try {
        await DB.deleteTraining(id);
        // #region agent log
        fetch('http://127.0.0.1:7585/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'pre-fix',hypothesisId:'C',location:'trainings.js:remove:afterDelete',message:'deleteTraining returned',data:{id:String(id)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        const still = await DB.getTraining(id, { bypassCache: true }).catch(() => null);
        // #region agent log
        fetch('http://127.0.0.1:7585/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'pre-fix',hypothesisId:'D',location:'trainings.js:remove:verify',message:'post-delete getTraining',data:{id:String(id),stillExists:!!still,stillTitle:still?.title||null},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        if (still) {
          throw new Error('O servidor não removeu o registro. Tente novamente ou avise o suporte.');
        }
        showToast('Treinamento excluído.', 'success');
        await this.renderAdminManage();
        // #region agent log
        const rows = [...document.querySelectorAll('#trainingsAdminTabBody tr')].map(tr => (tr.querySelector('td')||{}).textContent||'').slice(0,8);
        fetch('http://127.0.0.1:7585/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'pre-fix',hypothesisId:'E',location:'trainings.js:remove:afterRender',message:'list after renderAdminManage',data:{id:String(id),rowTitles:rows},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        if (document.getElementById('trainingsRoot')) await this.renderEmployee();
        if (document.getElementById('catalogRoot') && window.LMS?.renderCatalog) {
          await LMS.renderCatalog().catch(() => null);
        }
        if (document.getElementById('tracksRoot') && window.TrainingTracks?.renderTracks) {
          await TrainingTracks.renderTracks('tracksRoot').catch(() => null);
        }
      } catch (e) {
        // #region agent log
        fetch('http://127.0.0.1:7585/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'pre-fix',hypothesisId:'C',location:'trainings.js:remove:catch',message:'remove error',data:{id:String(id),err:String(e&&e.message||e)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        console.error('[Trainings] remove:', e);
        showToast('Erro ao excluir: ' + (e.message || e), 'error');
      } finally {
        hideLoading();
      }
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
      const editId = document.getElementById('muralEditId').value || '';
      let existing = null;
      if (editId) {
        try { existing = await DB.getTrainingMuralPost(editId); } catch (_) { /* noop */ }
      }
      const row = {
        id: editId || undefined,
        title: document.getElementById('muralTitle').value.trim(),
        body: document.getElementById('muralBody').value.trim(),
        pinned: document.getElementById('muralPinned').checked,
        active: document.getElementById('muralActive').checked,
        audience_roles,
        partner_root_id: partnerRoot || null,
        created_by: existing?.created_by || s.id,
        created_at: existing?.created_at,
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
      if (!id) {
        showToast('ID do comunicado inválido.', 'error');
        return;
      }
      if (!confirm('Excluir este comunicado do mural?')) return;
      showLoading('Excluindo...');
      try {
        await DB.deleteTrainingMuralPost(id);
        showToast('Comunicado excluído.', 'success');
        await this.renderAdminManage();
      } catch (e) {
        console.error('[Trainings] removeMural:', e);
        showToast('Erro ao excluir: ' + (e.message || e), 'error');
      } finally {
        hideLoading();
      }
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
      const att = await DB.getTrainingAttempt(tr.id, user.id);
      const hasQuiz = (tr.questions || []).length > 0;
      if (hasQuiz && _attemptFinished(att)) {
        if (typeof showToast === 'function') {
          showToast('Você já realizou esta prova. É permitida apenas 1 tentativa.', 'warning', 6000);
        } else {
          alert('Você já realizou esta prova. É permitida apenas 1 tentativa.');
        }
        return;
      }
      const drawn = _pickQuestionsForAttempt(tr.questions || []);
      window.__trnTake = { training: tr, user, drawn, att };
      const body = document.getElementById('trainingTakeBody');
      const kind = tr.kind === 'palestra' ? 'Palestra' : 'Tutorial';
      let html = `<h3>${esc(tr.title)}</h3><p class="badge badge-muted">${kind}</p>`;

      if (tr.image_url) {
        html += `<div style="margin:14px 0;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.12);"><img src="${esc(tr.image_url)}" style="width:100%;max-height:380px;object-fit:cover;display:block;"/></div>`;
      }

      if (tr.description) html += `<p style="font-size:15px;color:var(--color-text-muted);margin:10px 0;">${esc(tr.description)}</p>`;
      
      if (tr.video_url) html += _embedVideo(tr.video_url);

      if (tr.content_body) {
        let contentHtml = esc(tr.content_body)
          .replace(/(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s]*)?)/gi, (match, url) => {
            return `\n<div style="margin:14px 0;text-align:center;"><img src="${url}" style="max-width:100%;border-radius:12px;box-shadow:0 4px 14px rgba(0,0,0,0.12);display:block;margin:0 auto;" /></div>\n`;
          })
          .replace(/(https?:\/\/[^\s]+\.pdf(?:\?[^\s]*)?)/gi, (match, url) => {
            return `\n<div style="margin:16px 0;height:600px;border-radius:12px;overflow:hidden;border:1px solid var(--color-border);box-shadow:0 4px 14px rgba(0,0,0,0.1);"><iframe src="${url}" width="100%" height="100%" style="border:0;" allowfullscreen></iframe></div>\n`;
          });
        html += `<div style="margin:14px 0;padding:16px;background:var(--color-surface-2);border-radius:12px;white-space:pre-wrap;line-height:1.6;font-size:15px;">${contentHtml}</div>`;
      }
      
      if (tr.resource_url) {
        const rUrl = esc(tr.resource_url);
        const isPdf = /\.pdf(\?.*)?$/i.test(tr.resource_url) || tr.resource_url.includes('/file.php') || tr.resource_url.includes('/docs/');
        if (isPdf) {
          html += `
            <div style="margin:18px 0;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
                <strong style="font-size:15px;">📄 Documento / PDF do Treinamento</strong>
                <a href="${rUrl}" target="_blank" rel="noopener" class="btn btn-primary btn-sm" style="font-weight:700;">↗️ Abrir PDF em Nova Aba</a>
              </div>
              <div style="width:100%;height:650px;border-radius:12px;overflow:hidden;border:1px solid var(--color-border);background:#525659;box-shadow:0 4px 16px rgba(0,0,0,0.15);">
                <iframe src="${rUrl}" width="100%" height="100%" style="border:0;" allowfullscreen></iframe>
              </div>
            </div>
          `;
        } else {
          html += `
            <div style="margin:14px 0;padding:14px 16px;background:var(--color-surface-2);border-radius:10px;border:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:24px;">📄</span>
                <div>
                  <div style="font-weight:700;font-size:14px;">Material de Apoio / Documento</div>
                  <div style="font-size:12px;color:var(--color-text-muted);">Clique no botão para abrir ou baixar o material</div>
                </div>
              </div>
              <a href="${rUrl}" target="_blank" rel="noopener" class="btn btn-primary btn-sm" style="font-weight:700;">📄 Abrir Material</a>
            </div>
          `;
        }
      }
      
      if (tr.video_url_2) html += _embedVideo(tr.video_url_2);
      if (drawn.length) {
        const total = (tr.questions || []).length;
        const note = total > 0
          ? `<p style="font-size:13px;color:var(--color-text-muted);">Prova com <strong>${drawn.length}</strong> pergunta(s) — mesma para todos os colaboradores.</p>`
          : '';
        html += `<hr style="margin:20px 0;">`;
        html += `<div id="antiCheatLayer" style="-webkit-touch-callout:none; -webkit-user-select:none; -khtml-user-select:none; -moz-user-select:none; -ms-user-select:none; user-select:none; position:relative;">`;
        html += `<div id="antiCheatOverlay" style="display:none; position:absolute; top:-20px; left:-20px; width:calc(100% + 40px); height:calc(100% + 40px); background:rgba(0,0,0,0.95); color:white; z-index:9999; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding:20px; border-radius:12px;">
          <h3 style="color:#ff4444; margin-bottom:10px;">⚠️ TELA OCULTADA</h3>
          <p>Você perdeu o foco da janela. Volte para continuar a prova.</p>
        </div>`;
        html += `<h4>Prova</h4>${note}`;
        drawn.forEach((item, i) => {
          const opts = (item.options || []).map((o, j) =>
            `<label style="display:block;margin:6px 0;cursor:pointer;"><input type="radio" name="trnQ${i}" value="${j}"/> ${esc(o)}</label>`
          ).join('');
          html += `<div class="form-group"><label style="user-select:none;"><strong>${i + 1}.</strong> ${esc(item.q)}</label>${opts}</div>`;
        });
        html += `</div>`; // Fechar antiCheatLayer
        html += `<div style="text-align:right;margin-top:24px;"><button type="button" class="btn btn-primary" onclick="Trainings.submitTake()">Concluir / Enviar Prova</button></div>`;
      } else {
        html += '<p class="text-muted">Sem prova — clique em concluir para registrar participação.</p>';
      }
      body.innerHTML = html;

      const layer = document.getElementById('antiCheatLayer');
      if (layer) {
        layer.oncontextmenu = (e) => e.preventDefault();
        layer.addEventListener('copy', (e) => { e.preventDefault(); return false; });
        layer.addEventListener('cut', (e) => { e.preventDefault(); return false; });
        layer.addEventListener('dragstart', (e) => { e.preventDefault(); return false; });
        const overlay = document.getElementById('antiCheatOverlay');
        const handleKeyDown = (e) => {
          if (e.key === 'PrintScreen' || e.keyCode === 44) {
            e.preventDefault();
            if(typeof showToast === 'function') showToast('Captura de tela bloqueada!', 'error');
            overlay.style.display = 'flex';
            setTimeout(() => { overlay.style.display = 'none'; }, 3000);
          }
          if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
            e.preventDefault();
            if(typeof showToast === 'function') showToast('Cópia de texto não permitida!', 'warning');
          }
        };
        const handleBlur = () => { overlay.style.display = 'flex'; };
        const handleFocus = () => { overlay.style.display = 'none'; };
        
        window.removeEventListener('keydown', window.__antiCheatKeydown);
        window.removeEventListener('blur', window.__antiCheatBlur);
        window.removeEventListener('focus', window.__antiCheatFocus);
        
        window.__antiCheatKeydown = handleKeyDown;
        window.__antiCheatBlur = handleBlur;
        window.__antiCheatFocus = handleFocus;
        
        window.addEventListener('keydown', window.__antiCheatKeydown);
        window.addEventListener('blur', window.__antiCheatBlur);
        window.addEventListener('focus', window.__antiCheatFocus);
      }

      openModal('trainingTakeModal');
    },

    async submitTake() {
      window.removeEventListener('keydown', window.__antiCheatKeydown);
      window.removeEventListener('blur', window.__antiCheatBlur);
      window.removeEventListener('focus', window.__antiCheatFocus);
      const pack = window.__trnTake;
      if (!pack) return;
      const { training: tr, user, drawn } = pack;
      const qs = drawn || [];

      // Trava no servidor/local: 1 tentativa por usuário
      if (qs.length) {
        const existing = await DB.getTrainingAttempt(tr.id, user.id);
        if (_attemptFinished(existing)) {
          if (typeof showToast === 'function') {
            showToast('Prova já enviada. Apenas 1 tentativa é permitida.', 'warning', 6000);
          } else {
            alert('Prova já enviada. Apenas 1 tentativa é permitida.');
          }
          closeModal('trainingTakeModal');
          return;
        }
      }

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
      } else if (!passed) {
        showToast(`Reprovado (${score}%). Tentativa única — não é possível refazer.`, 'warning', 8000);
      }

      closeModal('trainingTakeModal');
      if (passed) showToast(`Aprovado! Nota: ${score}%`, 'success');
      else if (status !== 'penalized' && !(tr.penalty_points > 0 && !pastDeadline)) {
        /* toast de reprovação já exibido acima quando aplicável */
      } else if (status !== 'penalized') {
        showToast(`Nota: ${score}% — mínimo ${tr.passing_score}%`, 'error');
      }

      if (document.getElementById('trainingsRoot')) await this.renderEmployee();
      if (document.getElementById('trainingsAdminRoot')) await this.renderAdminManage();
      if (typeof LMS !== 'undefined' && typeof LMS.renderCatalog === 'function' && document.getElementById('catalogRoot')) {
        try { await LMS.renderCatalog(); } catch (_) { /* noop */ }
      }
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

    ensureModals() {
      if (typeof ensureModals === 'function') ensureModals();
    },
  };

  window.Trainings = Trainings;
  window.updateTrainingsBadge = () => Trainings.updateBadge();

  function ensureModals() {
    if (document.getElementById('trainingModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
<div class="modal-overlay" id="trainingModal"><div class="modal" style="max-width:680px;"><div class="modal-header">
  <h3 id="trainingModalTitle">Treinamento</h3><button type="button" class="modal-close" onclick="closeModal('trainingModal')"></button></div>
<div class="modal-body" style="max-height:75vh;overflow-y:auto;">
  <input type="hidden" id="trainingEditId"/>
  <div style="background:linear-gradient(135deg, #1E1B4B, #312E81);padding:12px 16px;border-radius:10px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
    <div>
      <div style="font-weight:800;font-size:14px;display:flex;align-items:center;gap:6px;">🤖 Assistente de IA de Treinamentos</div>
      <div style="font-size:12px;opacity:0.85;">Gere a estrutura completa de módulos, aulas e provas com IA.</div>
    </div>
    <button type="button" class="btn btn-accent btn-sm" onclick="Trainings.generateCourseWithAI()" style="white-space:nowrap;font-weight:800;background:#6366F1;color:#fff;border:0;padding:8px 14px;">✨ Gerar com IA</button>
  </div>
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
  <div class="form-group">
    <label>URL ou Upload da Imagem de Capa / Banner (JPG, PNG)</label>
    <div style="display:flex;gap:8px;">
      <input type="url" id="trnImage" class="form-control" placeholder="https://..."/>
      <input type="file" id="fileTrnImage" accept="image/*,.png,.jpg,.jpeg,.webp" style="display:none;" onchange="Trainings.uploadFileToInput(this, 'trnImage')"/>
      <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('fileTrnImage').click()" style="white-space:nowrap;">🖼️ Upload Capa</button>
    </div>
  </div>
  <div class="form-group">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <label style="margin:0;">Conteúdo / Roteiro Geral da Aula (Texto ou Imagens)</label>
      <div>
        <input type="file" id="fileTrnInlineImg" accept="image/*,.png,.jpg,.jpeg,.webp" style="display:none;" onchange="Trainings.insertInlineImage(this)"/>
        <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('fileTrnInlineImg').click()" style="font-size:12px;">🖼️ Inserir Imagem no Texto</button>
      </div>
    </div>
    <textarea id="trnContent" class="form-control" rows="4" placeholder="Escreva o texto descritivo do treinamento ou cole observações gerais..."></textarea>
  </div>
  <div class="form-group" style="margin-top:16px;padding-top:16px;border-top:2px dashed var(--color-border);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <label style="margin:0;font-weight:800;font-size:15px;color:var(--color-accent);">📚 Módulos e Aulas do Curso (Vídeos, PDFs e Textos)</label>
      <button type="button" class="btn btn-accent btn-sm" onclick="Trainings.addModuleRow()">+ Adicionar Módulo</button>
    </div>
    <p class="text-muted" style="font-size:13px;margin:0 0 12px;">Monte os módulos do curso e adicione as aulas com links de vídeo/PDF e perguntas de fixação.</p>
    <div id="trnModulesEditor"></div>
  </div>
  <div style="display:none;">
    <input type="url" id="trnVideo"/>
    <input type="url" id="trnVideo2"/>
    <input type="url" id="trnResource"/>
  </div>
  <div class="form-group">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <label style="margin:0;">Banco de perguntas (até ${MAX_QUESTIONS} — todas entram na prova, mesma ordem para todos)</label>
      <button type="button" class="btn btn-outline btn-sm" onclick="Trainings.addQuestionRow()">+ Pergunta</button>
    </div>
    <div id="trnQuestionsEditor"></div>
  </div>
  <label><input type="checkbox" id="trnActive" checked/> Ativo</label>
</div><div class="modal-footer">
  <button type="button" class="btn btn-ghost" onclick="closeModal('trainingModal')">Cancelar</button>
  <button type="button" class="btn btn-primary" onclick="Trainings.saveEditor()">Salvar</button>
</div></div></div>
<div class="modal-overlay" id="trainingTakeModal"><div class="modal" style="max-width:680px;"><div class="modal-header">
  <h3>Treinamento</h3><button type="button" class="modal-close" onclick="closeModal('trainingTakeModal')"></button></div>
<div class="modal-body" id="trainingTakeBody" style="max-height:75vh;overflow-y:auto;"></div>
<div class="modal-footer">
  <button type="button" class="btn btn-ghost" onclick="closeModal('trainingTakeModal')">Fechar</button>
  <button type="button" class="btn btn-primary" onclick="Trainings.submitTake()">Enviar prova</button>
</div></div></div>
<div class="modal-overlay" id="muralModal"><div class="modal" style="max-width:580px;"><div class="modal-header">
  <h3 id="muralModalTitle">Comunicado no mural</h3><button type="button" class="modal-close" onclick="closeModal('muralModal')"></button></div>
<div class="modal-body">
  <input type="hidden" id="muralEditId"/>
  <div class="form-group"><label>Título *</label><input type="text" id="muralTitle" class="form-control"/></div>
  <div class="form-group"><label>Texto / comunicado</label><textarea id="muralBody" class="form-control" rows="5"></textarea></div>
  <div class="form-group">
    <label>Imagem ou Anexo PDF do Comunicado</label>
    <div style="display:flex;gap:8px;">
      <input type="url" id="muralImage" class="form-control" placeholder="https://..."/>
      <input type="file" id="fileMuralImage" accept="image/*,.pdf,.png,.jpg,.jpeg,.webp" style="display:none;" onchange="Trainings.uploadFileToInput(this, 'muralImage')"/>
      <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('fileMuralImage').click()" style="white-space:nowrap;">📎 Anexar Imagem / PDF</button>
    </div>
  </div>
  <div class="form-group"><label>Público (papéis, vírgula ou * para todos)</label>
    <input type="text" id="muralAudience" class="form-control" placeholder="vendedor, backoffice ou *"/></div>
  <label style="display:block;margin-bottom:8px;"><input type="checkbox" id="muralPinned"/> Fixar no topo do mural</label>
  <label><input type="checkbox" id="muralActive" checked/> Ativo</label>
</div><div class="modal-footer">
  <button type="button" class="btn btn-ghost" onclick="closeModal('muralModal')">Cancelar</button>
  <button type="button" class="btn btn-primary" onclick="Trainings.saveMuralEditor()">Publicar</button>
</div></div></div>`);
  }

  const _runEnsureModals = () => {
    try { ensureModals(); } catch (_) {}
  };

  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    _runEnsureModals();
  } else {
    document.addEventListener('DOMContentLoaded', _runEnsureModals);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (window.SOUBLU_TREINAMENTOS_PAGE) return;
    setTimeout(() => { if (window.Trainings) Trainings.init(); }, 120);
  });
})();
