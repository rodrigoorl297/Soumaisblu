/* SOU+BLU — Trilhas de Desenvolvimento (Universidade Corporativa) */
(function (g) {
  'use strict';

  const SECTOR_DEFAULTS = [
    {
      id: 'trktrk_consultor_vendas',
      title: 'Trilha Consultor de Vendas',
      sector: 'Consultor de Vendas',
      level: 'Base',
      description: 'Formação essencial do consultor: produtos e abordagens comerciais.',
      sort_order: 10,
      // Cursos NÃO são mais auto-criados (Excluir era revertido pelo seed).
      courses: [],
    },
    {
      id: 'trktrk_lideranca',
      title: 'Trilha Liderança',
      sector: 'Liderança',
      level: 'Gestão',
      description: 'Desenvolvimento de líderes: pessoas e gestão do tempo.',
      sort_order: 20,
      courses: [],
    },
  ];

  /** IDs legados do seed antigo — nunca recriar automaticamente. */
  const LEGACY_SEED_COURSE_IDS = [
    'trn_track_produtos',
    'trn_track_abordagens',
    'trn_track_gestao_pessoas',
    'trn_track_gestao_tempo',
  ];

  /** Os que o admin já tentou excluir dezenas de vezes e o seed trazia de volta. */
  const FORCE_PURGE_COURSE_IDS = [
    'trn_track_gestao_pessoas',
    'trn_track_gestao_tempo',
  ];

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sessionUser() {
    try {
      return (typeof Auth !== 'undefined' && Auth.getSession) ? (Auth.getSession() || {}) : {};
    } catch (_) {
      return {};
    }
  }

  function canManage(user) {
    const role = String(user?.role || '').toLowerCase();
    return ['master', 'dev', 'desenvolvedor', 'supervisor', 'gerente', 'gerencia', 'rh', 'financeiro', 'backoffice', 'admin', 'fundador', 'parceiro'].includes(role);
  }

  function audienceOk(track, user) {
    const roles = track?.audience_roles || ['*'];
    if (roles.includes('*')) return true;
    const ur = String(user?.role || '').toLowerCase();
    return roles.map((x) => String(x).toLowerCase()).includes(ur);
  }

  const SEED_FLAG_KEY = 'soublu_uc_tracks_seeded_v2';
  const BLOCKED_SEED_KEY = 'soublu_blocked_seed_trainings';

  function seedCourseIds() {
    return LEGACY_SEED_COURSE_IDS.slice();
  }

  function readBlockedSeedIds() {
    try {
      const raw = localStorage.getItem(BLOCKED_SEED_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch (_) {
      return new Set();
    }
  }

  function blockSeedCourseId(id) {
    if (!id) return;
    const known = new Set(seedCourseIds());
    if (!known.has(String(id))) return;
    const set = readBlockedSeedIds();
    set.add(String(id));
    try {
      localStorage.setItem(BLOCKED_SEED_KEY, JSON.stringify([...set]));
    } catch (_) { /* noop */ }
  }

  function blockAllLegacySeedCourses() {
    LEGACY_SEED_COURSE_IDS.forEach((id) => blockSeedCourseId(id));
  }

  /** Remove cursos do seed antigo que o Excluir não “grudava”. */
  async function purgeLegacySeedCourses() {
    blockAllLegacySeedCourses();
    if (typeof DB === 'undefined' || typeof DB.deleteTraining !== 'function') return;
    // #region agent log
    fetch('http://127.0.0.1:7585/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'post-fix',hypothesisId:'E',location:'training-tracks.js:purgeLegacySeedCourses',message:'purging force seed courses',data:{ids:FORCE_PURGE_COURSE_IDS},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    for (const id of FORCE_PURGE_COURSE_IDS) {
      try {
        const row = await DB.getTraining(id, { bypassCache: true }).catch(() => null);
        if (row) await DB.deleteTraining(id);
      } catch (e) {
        console.warn('[Trilhas] purge seed course', id, e?.message || e);
      }
    }
  }

  function markTracksSeeded() {
    try { localStorage.setItem(SEED_FLAG_KEY, '1'); } catch (_) { /* noop */ }
  }

  function tracksAlreadySeeded() {
    try { return localStorage.getItem(SEED_FLAG_KEY) === '1'; } catch (_) { return false; }
  }

  /**
   * One-shot seed for empty installs only — cria só as TRILHAS vazias.
   * Nunca recria cursos (isso fazia Excluir “não funcionar”).
   */
  async function ensureSeedTracks() {
    // #region agent log
    fetch('http://127.0.0.1:7585/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a80a8'},body:JSON.stringify({sessionId:'7a80a8',runId:'post-fix',hypothesisId:'E',location:'training-tracks.js:ensureSeedTracks:entry',message:'ensureSeedTracks called',data:{},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (typeof DB === 'undefined') return;
    blockAllLegacySeedCourses();
    await DB.ensureTrainingTracksOnline(true).catch(() => null);
    await purgeLegacySeedCourses().catch(() => null);

    let existing;
    try {
      existing = await DB.getTrainingTracks({ activeOnly: false, limit: 100, throwOnError: true });
    } catch (e) {
      console.warn('[Trilhas] skip seed (tracks read failed):', e?.message || e);
      return;
    }

    if ((existing || []).length > 0) {
      markTracksSeeded();
      return;
    }

    if (tracksAlreadySeeded()) {
      return;
    }

    for (const def of SECTOR_DEFAULTS) {
      await DB.saveTrainingTrack({
        id: def.id,
        title: def.title,
        description: def.description,
        sector: def.sector,
        level: def.level,
        training_ids: [],
        audience_roles: ['*'],
        sort_order: def.sort_order,
        active: true,
        created_by: sessionUser().id || null,
      }).catch((e) => console.warn('[Trilhas] seed track:', e));
    }

    markTracksSeeded();
  }

  async function computeTrackProgress(track, userId, attemptsByTraining) {
    const ids = track.training_ids || [];
    let done = 0;
    const items = ids.map((tid) => {
      const att = attemptsByTraining.get(String(tid));
      const passed = !!(att && (att.passed || att.status === 'passed'));
      if (passed) done += 1;
      return { training_id: tid, passed, score: att?.score ?? null };
    });
    const total = ids.length || 0;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { done, total, pct, complete: total > 0 && done >= total, items };
  }

  async function loadAttemptsMap(userId) {
    const map = new Map();
    if (!userId || typeof DB.getTrainingAttempts !== 'function') return map;
    const rows = await DB.getTrainingAttempts({ userId, limit: 500 }).catch(() => []);
    (rows || []).forEach((a) => {
      if (a?.training_id) map.set(String(a.training_id), a);
    });
    return map;
  }

  async function maybeCompleteTrack(track, progress, user) {
    if (!progress.complete || !user?.id) return null;
    const existing = await DB.getTrackCompletions({ userId: user.id, trackId: track.id, limit: 1 });
    if (existing[0]?.certificate_code) return existing[0];
    const code = 'CERT-' + String(track.id).slice(-6).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
    return DB.saveTrackCompletion({
      track_id: track.id,
      user_id: user.id,
      completed_at: existing[0]?.completed_at || new Date().toISOString(),
      certificate_code: code,
      certificate_issued_at: new Date().toISOString(),
    });
  }

  function groupBySector(tracks) {
    const map = new Map();
    (tracks || []).forEach((t) => {
      const key = t.sector || 'Geral';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    });
    return [...map.entries()];
  }

  async function renderTracks(rootId) {
    const root = document.getElementById(rootId || 'tracksRoot');
    if (!root) return;
    const user = sessionUser();
    root.innerHTML = '<div class="lms-empty"><div class="lms-empty-text">Carregando trilhas...</div></div>';

    try {
      await ensureSeedTracks();
      const partnerRoot = window.PARTNER_ROOT_ID || (user.role === 'parceiro' ? user.id : null);
      let tracks = await DB.getTrainingTracks({ partnerRootId: partnerRoot, activeOnly: true });
      tracks = (tracks || []).filter((t) => audienceOk(t, user));
      const attempts = await loadAttemptsMap(user.id);
      const trainings = await DB.getTrainings({ activeOnly: false, limit: 500 }).catch(() => []);
      const trById = new Map((trainings || []).map((t) => [t.id, t]));

      if (!tracks.length) {
        root.innerHTML = `
          <div class="tt-hero card card-padded">
            <h2 class="tt-hero__title">Universidade Corporativa</h2>
            <p class="tt-hero__sub">Nenhuma trilha disponível para o seu perfil ainda.</p>
          </div>`;
        return;
      }

      const sectors = groupBySector(tracks);
      let html = `
        <div class="tt-hero card card-padded mb-3">
          <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
            <div>
              <h2 class="tt-hero__title mb-1">Universidade Corporativa</h2>
              <p class="tt-hero__sub mb-0">Trilhas por setor e nível · progresso salvo no banco · certificado ao concluir</p>
            </div>
            ${canManage(user) ? '<button type="button" class="btn btn-outline-primary btn-sm" onclick="TrainingTracks.openAdminEditor()">+ Nova trilha</button>' : ''}
          </div>
        </div>`;

      for (const [sector, list] of sectors) {
        html += `<section class="tt-sector mb-4">
          <h3 class="tt-sector__title">${esc(sector)}</h3>
          <div class="row g-3">`;

        for (const track of list) {
          const progress = await computeTrackProgress(track, user.id, attempts);
          let completion = null;
          if (progress.complete) {
            completion = await maybeCompleteTrack(track, progress, user).catch(() => null);
          }
          const lessons = (track.training_ids || []).map((tid) => {
            const tr = trById.get(tid);
            const att = attempts.get(String(tid));
            const ok = !!(att && (att.passed || att.status === 'passed'));
            return `<li class="tt-lesson ${ok ? 'is-done' : ''}">
              <span class="tt-lesson__mark">${ok ? '✓' : '○'}</span>
              <button type="button" class="tt-lesson__link" onclick="TrainingTracks.openCourse('${esc(tid)}')">${esc(tr?.title || tid)}</button>
            </li>`;
          }).join('');

          html += `
            <div class="col-12 col-md-6">
              <article class="tt-card card h-100">
                <div class="card-body d-flex flex-column">
                  <div class="d-flex justify-content-between gap-2 mb-2">
                    <span class="badge text-bg-primary">${esc(track.level || 'Base')}</span>
                    <span class="tt-pct">${progress.pct}%</span>
                  </div>
                  <h4 class="tt-card__title">${esc(track.title)}</h4>
                  <p class="tt-card__desc text-muted">${esc(track.description || '')}</p>
                  <div class="progress tt-progress mb-2" role="progressbar" aria-valuenow="${progress.pct}" aria-valuemin="0" aria-valuemax="100">
                    <div class="progress-bar" style="width:${progress.pct}%"></div>
                  </div>
                  <p class="small text-muted mb-2">${progress.done}/${progress.total} treinamentos concluídos</p>
                  <ul class="tt-lessons list-unstyled flex-grow-1">${lessons || '<li class="text-muted">Sem cursos vinculados.</li>'}</ul>
                  <div class="mt-2 d-flex gap-2 flex-wrap">
                    ${progress.complete
                      ? `<button type="button" class="btn btn-primary btn-sm" onclick="TrainingTracks.openCertificate('${esc(track.id)}')">Emitir certificado</button>`
                      : `<button type="button" class="btn btn-outline-primary btn-sm" onclick="TrainingTracks.openCourse('${esc((track.training_ids || [])[0] || '')}')">Continuar trilha</button>`}
                    ${completion?.certificate_code ? `<span class="small text-muted align-self-center">Cód: ${esc(completion.certificate_code)}</span>` : ''}
                  </div>
                </div>
              </article>
            </div>`;
        }
        html += '</div></section>';
      }

      root.innerHTML = html;
    } catch (e) {
      console.error('[Trilhas] render:', e);
      root.innerHTML = `<div class="alert alert-warning">Não foi possível carregar as trilhas. ${esc(e.message || e)}</div>`;
    }
  }

  function openCourse(trainingId) {
    if (!trainingId) return;
    if (typeof g.LMS !== 'undefined' && typeof LMS.openCourse === 'function') {
      LMS.openCourse(trainingId);
      return;
    }
    if (typeof g.Trainings !== 'undefined' && typeof Trainings.openTake === 'function') {
      Trainings.openTake(trainingId);
    }
  }

  async function openCertificate(trackId) {
    const user = sessionUser();
    const track = await DB.getTrainingTrack(trackId);
    if (!track) {
      alert('Trilha não encontrada.');
      return;
    }
    const attempts = await loadAttemptsMap(user.id);
    const progress = await computeTrackProgress(track, user.id, attempts);
    if (!progress.complete) {
      alert('Conclua todos os treinamentos da trilha para emitir o certificado.');
      return;
    }
    const completion = await maybeCompleteTrack(track, progress, user);
    const issued = completion?.certificate_issued_at || completion?.completed_at || new Date().toISOString();
    const dateLabel = new Date(issued).toLocaleDateString('pt-BR');
    const code = completion?.certificate_code || '—';

    let modal = document.getElementById('ttCertificateModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'ttCertificateModal';
      modal.className = 'modal fade';
      modal.tabIndex = -1;
      modal.innerHTML = `
        <div class="modal-dialog modal-lg modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Certificado</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body" id="ttCertificateBody"></div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Fechar</button>
              <button type="button" class="btn btn-primary" onclick="window.print()">Imprimir / PDF</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }

    const body = document.getElementById('ttCertificateBody');
    body.innerHTML = `
      <div class="tt-cert" id="ttCertPrint">
        <div class="tt-cert__brand">SOU+BLU · Universidade Corporativa</div>
        <h2 class="tt-cert__heading">Certificado de Conclusão</h2>
        <p class="tt-cert__text">Certificamos que</p>
        <p class="tt-cert__name">${esc(user.name || 'Colaborador')}</p>
        <p class="tt-cert__text">concluiu com êxito a trilha</p>
        <p class="tt-cert__track">${esc(track.title)}</p>
        <p class="tt-cert__meta">Setor: <strong>${esc(track.sector)}</strong> · Nível: <strong>${esc(track.level)}</strong></p>
        <p class="tt-cert__meta">Emitido em ${esc(dateLabel)} · Código ${esc(code)}</p>
      </div>`;

    if (g.bootstrap?.Modal) {
      g.bootstrap.Modal.getOrCreateInstance(modal).show();
    } else {
      modal.style.display = 'block';
      modal.classList.add('show');
    }
  }

  async function openAdminEditor(trackId) {
    const user = sessionUser();
    if (!canManage(user)) {
      alert('Sem permissão para gerenciar trilhas.');
      return;
    }
    const trainings = await DB.getTrainings({ activeOnly: true, limit: 500 }).catch(() => []);
    const track = trackId ? await DB.getTrainingTrack(trackId) : null;
    const selected = new Set((track?.training_ids || []).map(String));

    let modal = document.getElementById('ttTrackEditorModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'ttTrackEditorModal';
      modal.className = 'modal fade';
      modal.tabIndex = -1;
      modal.innerHTML = `
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="ttTrackEditorTitle">Nova trilha</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <input type="hidden" id="ttTrackId"/>
              <div class="mb-3">
                <label class="form-label">Título</label>
                <input class="form-control" id="ttTrackTitle" placeholder="Ex: Trilha Consultor de Vendas"/>
              </div>
              <div class="row g-2 mb-3">
                <div class="col-md-6">
                  <label class="form-label">Setor</label>
                  <input class="form-control" id="ttTrackSector" list="ttSectorList" placeholder="Consultor de Vendas"/>
                  <datalist id="ttSectorList">
                    <option value="Consultor de Vendas"></option>
                    <option value="Liderança"></option>
                    <option value="Operacional"></option>
                    <option value="Backoffice"></option>
                  </datalist>
                </div>
                <div class="col-md-6">
                  <label class="form-label">Nível</label>
                  <input class="form-control" id="ttTrackLevel" placeholder="Base / Gestão / Avançado"/>
                </div>
              </div>
              <div class="mb-3">
                <label class="form-label">Descrição</label>
                <textarea class="form-control" id="ttTrackDesc" rows="2"></textarea>
              </div>
              <div class="mb-2 fw-semibold">Treinamentos da trilha (ordem de seleção)</div>
              <div id="ttTrackCourses" class="tt-course-pick"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="button" class="btn btn-primary" onclick="TrainingTracks.saveAdminEditor()">Salvar trilha</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }

    document.getElementById('ttTrackEditorTitle').textContent = track ? 'Editar trilha' : 'Nova trilha';
    document.getElementById('ttTrackId').value = track?.id || '';
    document.getElementById('ttTrackTitle').value = track?.title || '';
    document.getElementById('ttTrackSector').value = track?.sector || '';
    document.getElementById('ttTrackLevel').value = track?.level || 'Base';
    document.getElementById('ttTrackDesc').value = track?.description || '';
    document.getElementById('ttTrackCourses').innerHTML = (trainings || []).map((t) => `
      <label class="tt-course-pick__item">
        <input type="checkbox" value="${esc(t.id)}" ${selected.has(String(t.id)) ? 'checked' : ''}/>
        <span>${esc(t.title)}</span>
      </label>`).join('') || '<p class="text-muted">Cadastre cursos em Gestão de Cursos primeiro.</p>';

    if (g.bootstrap?.Modal) {
      g.bootstrap.Modal.getOrCreateInstance(modal).show();
    } else {
      modal.style.display = 'block';
      modal.classList.add('show');
    }
  }

  async function saveAdminEditor() {
    const title = document.getElementById('ttTrackTitle')?.value?.trim();
    const sector = document.getElementById('ttTrackSector')?.value?.trim();
    if (!title || !sector) {
      alert('Informe título e setor.');
      return;
    }
    const ids = [...document.querySelectorAll('#ttTrackCourses input[type=checkbox]:checked')].map((el) => el.value);
    const id = document.getElementById('ttTrackId')?.value || undefined;
    try {
      await DB.saveTrainingTrack({
        id,
        title,
        sector,
        level: document.getElementById('ttTrackLevel')?.value?.trim() || 'Base',
        description: document.getElementById('ttTrackDesc')?.value?.trim() || '',
        training_ids: ids,
        audience_roles: ['*'],
        active: true,
        sort_order: 100,
        created_by: sessionUser().id || null,
      });
      const modal = document.getElementById('ttTrackEditorModal');
      if (modal && g.bootstrap?.Modal) g.bootstrap.Modal.getOrCreateInstance(modal).hide();
      await renderTracks('tracksRoot');
      if (typeof g.Trainings !== 'undefined' && Trainings._adminTab === 'trilhas') {
        await Trainings.renderAdminManage();
      }
      alert('Trilha salva no banco!');
    } catch (e) {
      alert('Erro ao salvar trilha: ' + (e.message || e));
    }
  }

  async function renderAdminTracksTable(bodyEl) {
    if (!bodyEl) return;
    await ensureSeedTracks();
    const tracks = await DB.getTrainingTracks({ activeOnly: false, limit: 200 });
    bodyEl.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <p class="mb-0 text-muted">Trilhas por setor · vinculadas a treinamentos do catálogo</p>
        <button type="button" class="btn btn-primary btn-sm" onclick="TrainingTracks.openAdminEditor()">+ Trilha</button>
      </div>
      <div class="table-responsive card card-padded">
        <table class="table table-sm align-middle mb-0">
          <thead><tr><th>Setor</th><th>Trilha</th><th>Nível</th><th>Cursos</th><th>Ativa</th><th></th></tr></thead>
          <tbody>
            ${(tracks || []).map((t) => `<tr>
              <td>${esc(t.sector)}</td>
              <td><strong>${esc(t.title)}</strong></td>
              <td>${esc(t.level)}</td>
              <td>${(t.training_ids || []).length}</td>
              <td>${t.active ? 'Sim' : 'Não'}</td>
              <td class="text-nowrap">
                <button type="button" class="btn btn-ghost btn-sm" onclick="TrainingTracks.openAdminEditor('${esc(t.id)}')">Editar</button>
                <button type="button" class="btn btn-ghost btn-sm" onclick="TrainingTracks.removeTrack('${esc(t.id)}')">Excluir</button>
              </td>
            </tr>`).join('') || '<tr><td colspan="6" class="text-center text-muted">Nenhuma trilha.</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }

  async function removeTrack(id) {
    if (!id || !confirm('Excluir esta trilha?')) return;
    try {
      if (typeof showLoading === 'function') showLoading('Excluindo...');
      await DB.deleteTrainingTrack(id);
      if (typeof showToast === 'function') showToast('Trilha excluída.', 'success');
      else alert('Trilha excluída.');
      const tracksRoot = document.getElementById('tracksRoot');
      if (tracksRoot) await renderTracks('tracksRoot');
      if (typeof g.Trainings !== 'undefined') await Trainings.renderAdminManage();
    } catch (e) {
      const msg = e?.message || String(e);
      if (typeof showToast === 'function') showToast('Erro ao excluir trilha: ' + msg, 'error');
      else alert('Erro ao excluir trilha: ' + msg);
    } finally {
      if (typeof hideLoading === 'function') hideLoading();
    }
  }

  g.TrainingTracks = {
    renderTracks,
    openCourse,
    openCertificate,
    openAdminEditor,
    saveAdminEditor,
    renderAdminTracksTable,
    removeTrack,
    ensureSeedTracks,
    blockSeedCourseId,
    purgeLegacySeedCourses,
  };
})(typeof window !== 'undefined' ? window : globalThis);
