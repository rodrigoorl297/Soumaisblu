/* SOU+BLU — Painel dos Sonhos (colaboradores: visão + fotos) */
const PainelSonhos = (() => {
  const TZ = 'America/Sao_Paulo';
  const EXCLUDED = new Set([]);
  const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
  let _viewFilter = 'all';
  let _pendingPhotoFile = null;
  let _pendingPhotoPreview = '';
  let _editingDreamId = null;
  const MAX_AVISO_IMG_BYTES = 3 * 1024 * 1024;
  let _avisoImageFile = null;
  let _avisoImagePreview = '';
  let _avisoImageCurrent = '';
  let _cachedUser = null;
  let _userFetchPromise = null;
  const _photoSrcCache = new Map();
  /** @type {Record<string, {reads:any[], likes:any[], comments:any[]}>} */
  let _muralEngByPost = {};
  /** @type {any[]} */
  let _lastAvisosPosts = [];
  /** @type {Set<string>} */
  const _expandedComments = new Set();
  /** @type {Set<string>} */
  const _expandedReaders = new Set();

  function localKey(userId) {
    return `soublu_sonhos_${userId}`;
  }

  function eligible(role) {
    const r = String(role || '').trim().toLowerCase();
    const ok = !!(r && !EXCLUDED.has(r));
    return ok;
  }

  /** Roles with Admin master/dashboard access — skip sonhos on Financeiro/RH hubs. */
  const HUB_MASTER_ROLES = new Set([
    'master', 'fundador', 'digi_master', 'desenvolvedor', 'diretoria',
    'gerente', 'gerencia', 'admin', 'financeiro', 'financial', 'rh',
  ]);

  function hasMasterPanelAccess(role, opts = {}) {
    if (opts.canMasterPanel || opts.canPartnerDashboard || opts.canDashboard) return true;
    const r = String(role || '').trim().toLowerCase();
    if (HUB_MASTER_ROLES.has(r)) return true;
    try {
      if (typeof Auth !== 'undefined') {
        if (typeof Auth.hasMasterPanel === 'function' && Auth.hasMasterPanel()) return true;
        if (typeof Auth.isMaster === 'function' && Auth.isMaster()) return true;
        const s = typeof Auth.getSession === 'function' ? Auth.getSession() : null;
        if (s?.permissions?.canMasterPanel) return true;
      }
    } catch (_) { /* noop */ }
    return false;
  }

  /** True when the mural should appear as home on secondary hubs (Financeiro/RH). */
  function eligibleOnHub(role, opts = {}) {
    if (!eligible(role)) return false;
    if (hasMasterPanelAccess(role, opts)) return false;
    return true;
  }

  function shouldShowOnSecondaryHub(role, opts = {}) {
    return eligibleOnHub(role, opts);
  }

  /**
   * Mural da empresa (Painel Inicial): master/fundador gerenciam tudo.
   */
  function canManageAvisos(role, user) {
    try {
      if (typeof window !== 'undefined' && window.PARTNER_ROOT_ID) return false;
      if (typeof Auth !== 'undefined' && typeof Auth.isMaster === 'function' && Auth.isMaster()) return true;
    } catch (_) { /* noop */ }
    const r = String(role || user?.role || '').trim().toLowerCase();
    if (r === 'parceiro') return false;
    return r === 'master' || r === 'fundador';
  }

  /** Publicar aviso: todos acima de vendedor (RH, supervisor, financeiro, gerência etc.). */
  function canPostAvisos(role, user) {
    if (canManageAvisos(role, user)) return true;
    try {
      if (typeof window !== 'undefined' && window.PARTNER_ROOT_ID) return false;
    } catch (_) { /* noop */ }
    const r = String(role || user?.role || '').trim().toLowerCase();
    if (!r) return false;
    return !['vendedor', 'parceiro', 'portaria'].includes(r);
  }

  /** Editar/excluir: master/fundador qualquer aviso; demais só o próprio. */
  function canEditAviso(user, post) {
    if (canManageAvisos(user?.role, user)) return true;
    if (!canPostAvisos(user?.role, user)) return false;
    return !!(post?.created_by && user?.id && String(post.created_by) === String(user.id));
  }

  /** Avisos/comunicados: só equipe interna SOU+BLU — parceiros (Eleva etc.) não veem. */
  function shouldShowAvisos(user) {
    try {
      if (typeof window !== 'undefined' && window.PARTNER_ROOT_ID) return false;
    } catch (_) { /* noop */ }
    const r = String(user?.role || '').trim().toLowerCase();
    if (r === 'parceiro') return false;
    return true;
  }

  function avisoAuthorLabel(post) {
    const channel = String(post?.channel || post?.author_department || '').trim();
    const name = String(post?.author_name || '').trim();
    if (channel && name) return `${channel} · ${name}`;
    if (channel) return channel;
    if (name) return name;
    return 'Comunicados';
  }

  function fmtAvisoDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('pt-BR', {
        timeZone: TZ,
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return String(iso);
    }
  }

  function avisoAudienceMatch(post, user) {
    const roles = post?.audience_roles || ['*'];
    if (roles.includes('*')) return true;
    const ur = String(user?.role || '').trim().toLowerCase();
    return roles.map(x => String(x).trim().toLowerCase()).includes(ur);
  }

  function parseAvisoTitle(rawTitle) {
    const raw = String(rawTitle || '').trim();
    const m = raw.match(/^\[([^\]]{1,80})\]\s*(.*)$/s);
    if (!m) return { channel: '', title: raw };
    return { channel: m[1].trim(), title: (m[2] || '').trim() || m[1].trim() };
  }

  function formatAvisoTitle(channel, title) {
    const t = String(title || '').trim();
    const c = String(channel || '').trim();
    if (!t) return '';
    return c ? `[${c}] ${t}` : t;
  }

  async function enrichAvisoPosts(posts) {
    const list = posts || [];
    const authorIds = [...new Set(list.map((p) => p.created_by).filter(Boolean))];
    const authorMap = {};
    await Promise.all(authorIds.map(async (id) => {
      try {
        if (typeof DB !== 'undefined' && typeof DB.getUser === 'function') {
          authorMap[id] = await DB.getUser(id);
        }
      } catch (_) { /* noop */ }
    }));
    return list.map((p) => {
      const parsed = parseAvisoTitle(p.title);
      const author = authorMap[p.created_by] || {};
      return {
        ...p,
        channel: String(p.channel || parsed.channel || author.department || '').trim(),
        title: parsed.title || p.title || '',
        author_name: String(p.author_name || author.name || '').trim(),
        author_department: String(p.author_department || author.department || parsed.channel || '').trim(),
        author_photo_url: p.author_photo_url || author.photo_url || '',
      };
    });
  }

  const AVISO_TTL_MS = 24 * 60 * 60 * 1000;

  /** Parse MySQL/ISO timestamps reliably (space or T separator). */
  function parseAvisoCreatedAt(iso) {
    if (!iso) return NaN;
    const s = String(iso).trim();
    if (!s) return NaN;
    const normalized = /T/.test(s) ? s : s.replace(' ', 'T');
    const t = new Date(normalized).getTime();
    return Number.isFinite(t) ? t : NaN;
  }

  function isAvisoExpired(post) {
    if (!post) return false;
    const t = parseAvisoCreatedAt(post.created_at);
    if (!Number.isFinite(t) || t <= 0) return false;
    return (Date.now() - t) > AVISO_TTL_MS;
  }

  async function loadAvisos(user) {
    if (typeof DB === 'undefined' || typeof DB.getTrainingMuralPosts !== 'function') return [];
    try {
      const all = await DB.getTrainingMuralPosts({ companyOnly: true, activeOnly: true });
      const expired = (all || []).filter(p => p?.id && isAvisoExpired(p) && p.active !== false);
      /* Desativa no banco avisos já expirados (incl. fixados), para não voltarem via cache. */
      if (expired.length && typeof DB.saveTrainingMuralPost === 'function') {
        await Promise.all(expired.map((p) =>
          DB.saveTrainingMuralPost({
            id: p.id,
            active: false,
            created_at: p.created_at,
            pinned: !!p.pinned,
          }).catch(() => null)
        ));
      }
      const filtered = (all || [])
        // Pedidos do Clube não são avisos da empresa — aparecem só como notas para master/financeiro
        .filter(p => !String(p?.title || '').includes('Novo pedido ZS-'))
        .filter(p => avisoAudienceMatch(p, user))
        .filter(p => !isAvisoExpired(p))
        .sort((a, b) => {
          if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
          return parseAvisoCreatedAt(b.created_at) - parseAvisoCreatedAt(a.created_at);
        });
      const posts = await enrichAvisoPosts(filtered);
      await loadMuralEngagement(posts);
      _lastAvisosPosts = posts;
      return posts;
    } catch (e) {
      console.warn('[PainelSonhos] avisos:', e?.message || e);
      return [];
    }
  }

  async function loadMuralEngagement(posts) {
    const ids = (posts || []).map(p => p?.id).filter(Boolean);
    if (!ids.length || typeof DB === 'undefined' || typeof DB.getMuralEngagement !== 'function') {
      _muralEngByPost = {};
      return;
    }
    try {
      const data = await DB.getMuralEngagement(ids);
      _muralEngByPost = data?.byPost || {};
    } catch (e) {
      console.warn('[PainelSonhos] engagement:', e?.message || e);
      _muralEngByPost = {};
    }
  }

  function engFor(postId) {
    return _muralEngByPost[String(postId)] || { reads: [], likes: [], comments: [] };
  }

  function canDeleteMuralComment(user, comment) {
    if (!comment) return false;
    if (canManageAvisos(user?.role, user)) return true;
    return !!(comment.user_id && user?.id && String(comment.user_id) === String(user.id));
  }

  function fmtEngTime(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('pt-BR', {
        timeZone: TZ,
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return '';
    }
  }

  function postExigeCiencia(post) {
    return !!(post?.exige_ciencia || post?.exigeCiencia || post?.require_ack);
  }

  function renderAvisoEngage(post, user) {
    const id = escAttr(post.id);
    const eng = engFor(post.id);
    const uid = String(user?.id || '');
    const liked = (eng.likes || []).some(l => String(l.user_id) === uid);
    const ack = (eng.reads || []).some(r => String(r.user_id) === uid);
    const likeCount = (eng.likes || []).length;
    const ackCount = (eng.reads || []).length;
    const commentCount = (eng.comments || []).length;
    const showComments = _expandedComments.has(String(post.id));
    const showReaders = _expandedReaders.has(String(post.id));
    const exigeCiencia = postExigeCiencia(post);

    const readersList = (exigeCiencia && showReaders)
      ? `<div class="mural-feed__readers" id="muralReaders_${id}">
          ${(eng.reads || []).length
            ? (eng.reads || []).map(r =>
                `<div class="mural-feed__reader">
                  <span class="mural-feed__reader-name">${esc(r.user_name || 'Colaborador')}</span>
                  <time class="mural-feed__reader-time">${esc(fmtEngTime(r.read_at))}</time>
                </div>`
              ).join('')
            : '<p class="mural-feed__engage-empty">Ninguém deu ciência ainda.</p>'}
        </div>`
      : '';

    const commentsList = showComments
      ? `<div class="mural-feed__comments" id="muralComments_${id}">
          <div class="mural-feed__comments-list">
            ${(eng.comments || []).length
              ? (eng.comments || []).map(c => {
                  const canDel = canDeleteMuralComment(user, c);
                  const delBtn = canDel
                    ? `<button type="button" class="mural-feed__comment-del" title="Excluir"
                        onclick="PainelSonhos.removeMuralComment('${escAttr(c.id)}','${id}')">×</button>`
                    : '';
                  return `<div class="mural-feed__comment" data-comment-id="${escAttr(c.id)}">
                    <div class="mural-feed__comment-head">
                      <strong>${esc(c.user_name || 'Colaborador')}</strong>
                      <time>${esc(fmtEngTime(c.created_at))}</time>
                      ${delBtn}
                    </div>
                    <p class="mural-feed__comment-body">${esc(c.body || '')}</p>
                  </div>`;
                }).join('')
              : '<p class="mural-feed__engage-empty">Nenhum comentário ainda.</p>'}
          </div>
          <div class="mural-feed__comment-form">
            <input type="text" class="form-control mural-feed__comment-input" id="muralCommentInput_${id}"
              maxlength="500" placeholder="Escreva um comentário…"
              onkeydown="if(event.key==='Enter'){event.preventDefault();PainelSonhos.submitMuralComment('${id}');}"/>
            <button type="button" class="btn btn-primary btn-sm" onclick="PainelSonhos.submitMuralComment('${id}')">Enviar</button>
          </div>
        </div>`
      : '';

    const cienciaBtns = exigeCiencia
      ? `${ack
          ? `<span class="mural-feed__engage-read is-done" title="Ciência registrada">✓ Ciência registrada</span>`
          : `<button type="button" class="mural-feed__engage-btn" onclick="PainelSonhos.markMuralRead('${id}')">Marcar ciência</button>`}
        <button type="button" class="mural-feed__engage-btn${showReaders ? ' is-open' : ''}"
          onclick="PainelSonhos.toggleMuralReaders('${id}')" title="Quem deu ciência">
          Quem deu ciência (${ackCount})
        </button>`
      : '';

    return `<div class="mural-feed__engage">
        <button type="button" class="mural-feed__engage-btn${liked ? ' is-active' : ''}"
          onclick="PainelSonhos.toggleMuralLike('${id}')" title="Curtir">
          ${liked ? '♥' : '♡'} Curtir${likeCount ? ` (${likeCount})` : ''}
        </button>
        <button type="button" class="mural-feed__engage-btn${showComments ? ' is-open' : ''}"
          onclick="PainelSonhos.toggleMuralComments('${id}')" title="Comentar">
          💬 Comentar${commentCount ? ` (${commentCount})` : ''}
        </button>
        ${cienciaBtns}
      </div>
      ${readersList}
      ${commentsList}`;
  }

  function renderAvisosSection(posts, canManage, user) {
    const list = posts || [];
    const composer = canManage
      ? `<button type="button" class="mural-feed__composer" onclick="PainelSonhos.openAvisoEditor()">
          <span class="mural-feed__composer-avatar">${typeof avatarHtml === 'function' ? avatarHtml(user?.name || 'A', 'avatar-sm', user?.photo_url || '') : '💬'}</span>
          <span class="mural-feed__composer-text">Publicar aviso para toda a empresa…</span>
        </button>`
      : '';

    const items = list.length
      ? list.map(p => {
          const id = escAttr(p.id);
          const author = avisoAuthorLabel(p);
          const avatar = typeof avatarHtml === 'function'
            ? avatarHtml(p.author_name || author, 'avatar-sm', p.author_photo_url || '')
            : '<span class="mural-feed__avatar-fallback" aria-hidden="true">📢</span>';
          const manageBtns = canEditAviso(user, p)
            ? `<div class="mural-feed__actions">
                <button type="button" class="btn btn-outline btn-sm" onclick="PainelSonhos.openAvisoEditor('${id}')">Editar</button>
                <button type="button" class="btn btn-outline btn-sm" onclick="PainelSonhos.removeAviso('${id}')">Excluir</button>
              </div>`
            : '';
          const titleHtml = p.title
            ? `<h4 class="mural-feed__title">${esc(p.title)}</h4>`
            : '';
          const cienciaBadge = postExigeCiencia(p)
            ? '<span class="mural-feed__ciencia-badge" title="Todos devem marcar ciência">Ciência obrigatória</span>'
            : '';
          const imgSrc = p.image_url ? avisoImageSrc(p.image_url) : '';
          const imageHtml = imgSrc
            ? `<button type="button" class="mural-feed__image" data-img-src="${escAttr(imgSrc)}" data-img-caption="${escAttr(p.title || '')}"
                onclick="PainelSonhos.openAvisoImage(this)" title="Ampliar imagem">
                <img src="${escAttr(imgSrc)}" alt="${escAttr(p.title || 'Imagem do aviso')}" loading="lazy" decoding="async"/>
              </button>`
            : '';
          return `<article class="mural-feed__post mural-note${p.pinned ? ' is-pinned' : ''}${postExigeCiencia(p) ? ' exige-ciencia' : ''}" data-aviso-id="${id}">
            <span class="mural-note__pin${p.pinned ? ' mural-note__pin--big' : ''}" aria-hidden="true"></span>
            <div class="mural-feed__post-head">
              ${avatar}
              <div class="mural-feed__meta">
                <div class="mural-feed__author">${esc(author)}</div>
                <time class="mural-feed__date">${esc(fmtAvisoDate(p.created_at))}</time>
              </div>
              ${cienciaBadge}
            </div>
            ${titleHtml}
            <div class="mural-feed__body">${esc(p.body || '')}</div>
            ${imageHtml}
            ${renderAvisoEngage(p, user)}
            ${manageBtns}
          </article>`;
        }).join('')
      : '<p class="mural-feed__empty">Nenhum aviso publicado no mural da empresa.</p>';

    const manageHead = canManage
      ? '<button type="button" class="btn btn-primary btn-sm" onclick="PainelSonhos.openAvisoEditor()">+ Novo aviso</button>'
      : '';

    return `<div class="mural-feed" id="painelSonhosAvisos">
      <div class="mural-feed__head">
        <div>
          <h3 class="mural-feed__heading">Mural da Empresa</h3>
          <p class="mural-feed__sub">Avisos, comunicados e atualizações · somem em 24h</p>
        </div>
        ${manageHead}
      </div>
      ${composer}
      <div class="mural-feed__list" id="painelSonhosAvisosList">${items}</div>
    </div>`;
  }

  function ensureAvisoModal() {
    if (document.getElementById('painelSonhosAvisoModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
<div class="modal-overlay" id="painelSonhosAvisoModal">
  <div class="modal painel-sonhos-modal" style="max-width:520px;">
    <div class="modal-header">
      <h3 id="painelSonhosAvisoModalTitle">Novo aviso</h3>
      <button type="button" class="modal-close" onclick="PainelSonhos.closeAvisoEditor()"></button>
    </div>
    <div class="modal-body">
      <input type="hidden" id="psAvisoEditId"/>
      <div class="form-group">
        <label for="psAvisoChannel">Área / setor</label>
        <input type="text" id="psAvisoChannel" class="form-control" maxlength="80" placeholder="Ex: Marketing, RH, Diretoria"/>
      </div>
      <div class="form-group">
        <label for="psAvisoTitle">Título</label>
        <input type="text" id="psAvisoTitle" class="form-control" maxlength="120" placeholder="Ex: Comunicado importante"/>
      </div>
      <div class="form-group">
        <label for="psAvisoBody">Mensagem</label>
        <textarea id="psAvisoBody" class="form-control" rows="5" placeholder="Texto do aviso / comunicado"></textarea>
      </div>
      <div class="form-group">
        <label for="psAvisoImage">Imagem (opcional)</label>
        <input type="file" id="psAvisoImage" class="form-control" accept="image/*" onchange="PainelSonhos.onAvisoImagePick(this)"/>
        <div id="psAvisoImagePreviewWrap" class="ps-aviso-img-preview" hidden>
          <img id="psAvisoImagePreview" alt="Prévia da imagem do aviso"/>
          <button type="button" class="btn btn-outline btn-sm" onclick="PainelSonhos.clearAvisoImage()">Remover imagem</button>
        </div>
      </div>
      <div class="painel-sonhos-aviso-checks">
        <label class="painel-sonhos-aviso-check">
          <input type="checkbox" id="psAvisoPinned"/> Fixar no topo
        </label>
        <label class="painel-sonhos-aviso-check">
          <input type="checkbox" id="psAvisoExigeCiencia"/> Exigir ciência de todos
        </label>
      </div>
    </div>
    <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:12px 20px 20px;">
      <button type="button" class="btn btn-outline" onclick="PainelSonhos.closeAvisoEditor()">Cancelar</button>
      <button type="button" class="btn btn-primary" onclick="PainelSonhos.saveAviso()">Publicar</button>
    </div>
  </div>
</div>`);
  }

  async function openAvisoEditor(id) {
    const user = await getUser();
    if (!canPostAvisos(user?.role, user)) {
      showToast('Vendedores não publicam no mural — peça ao seu supervisor.', 'error');
      return;
    }
    ensureAvisoModal();
    const titleEl = document.getElementById('painelSonhosAvisoModalTitle');
    document.getElementById('psAvisoEditId').value = id || '';
    const channelEl = document.getElementById('psAvisoChannel');
    if (!id) {
      if (titleEl) titleEl.textContent = 'Novo aviso no mural';
      if (channelEl) channelEl.value = user?.department || '';
      document.getElementById('psAvisoTitle').value = '';
      document.getElementById('psAvisoBody').value = '';
      document.getElementById('psAvisoPinned').checked = false;
      const exigeEl = document.getElementById('psAvisoExigeCiencia');
      if (exigeEl) exigeEl.checked = false;
      _resetAvisoImageState('');
      _syncAvisoImagePreview();
      if (typeof openModal === 'function') openModal('painelSonhosAvisoModal');
      else document.getElementById('painelSonhosAvisoModal')?.classList.add('open');
      return;
    }
    if (titleEl) titleEl.textContent = 'Editar aviso';
    try {
      const p = await DB.getTrainingMuralPost(id);
      if (!p) { showToast('Aviso não encontrado.', 'warning'); return; }
      if (!canEditAviso(user, p)) {
        showToast('Você só pode editar avisos publicados por você.', 'error');
        return;
      }
      const parsed = parseAvisoTitle(p.title);
      if (channelEl) channelEl.value = p.channel || parsed.channel || '';
      document.getElementById('psAvisoTitle').value = parsed.title || p.title || '';
      document.getElementById('psAvisoBody').value = p.body || '';
      document.getElementById('psAvisoPinned').checked = !!p.pinned;
      const exigeEl = document.getElementById('psAvisoExigeCiencia');
      if (exigeEl) exigeEl.checked = postExigeCiencia(p);
      _resetAvisoImageState(p.image_url || '');
      _syncAvisoImagePreview();
      if (typeof openModal === 'function') openModal('painelSonhosAvisoModal');
      else document.getElementById('painelSonhosAvisoModal')?.classList.add('open');
    } catch (e) {
      showToast('Não foi possível abrir o aviso.', 'error');
    }
  }

  function closeAvisoEditor() {
    if (typeof closeModal === 'function') closeModal('painelSonhosAvisoModal');
    else document.getElementById('painelSonhosAvisoModal')?.classList.remove('open');
  }

  function _syncAvisoImagePreview() {
    const wrap = document.getElementById('psAvisoImagePreviewWrap');
    const img = document.getElementById('psAvisoImagePreview');
    if (!wrap || !img) return;
    const src = _avisoImagePreview || (_avisoImageCurrent ? avisoImageSrc(_avisoImageCurrent) : '');
    if (src) {
      img.src = src;
      wrap.hidden = false;
    } else {
      img.removeAttribute('src');
      wrap.hidden = true;
    }
  }

  function _resetAvisoImageState(currentUrl) {
    _avisoImageFile = null;
    _avisoImagePreview = '';
    _avisoImageCurrent = String(currentUrl || '').trim();
    const input = document.getElementById('psAvisoImage');
    if (input) input.value = '';
  }

  async function onAvisoImagePick(input) {
    const file = input?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Envie uma imagem (JPG, PNG ou WebP).', 'warning');
      input.value = '';
      return;
    }
    if (file.size > MAX_AVISO_IMG_BYTES) {
      showToast('A imagem do aviso deve ter no máximo 3 MB.', 'warning');
      input.value = '';
      return;
    }
    _avisoImageFile = file;
    try {
      _avisoImagePreview = typeof fileToBase64 === 'function'
        ? await fileToBase64(file)
        : await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
    } catch (_) {
      _avisoImagePreview = '';
    }
    _syncAvisoImagePreview();
  }

  function clearAvisoImage() {
    _resetAvisoImageState('');
    _syncAvisoImagePreview();
  }

  async function _uploadAvisoImage(file, userId) {
    if (typeof uploadImage !== 'function') return null;
    try {
      /* Sem fallback base64: image_url é VARCHAR(500) no MySQL. */
      const url = await uploadImage(file, 'mural', String(userId || 'user').replace(/[^a-zA-Z0-9_-]/g, '_'));
      if (url && String(url).length <= 500) return String(url);
    } catch (e) {
      console.warn('[PainelSonhos] upload aviso:', e?.message || e);
    }
    return null;
  }

  function avisoImageSrc(raw) {
    const url = String(raw || '').trim();
    if (!url) return '';
    if (/^data:image\/|^blob:/i.test(url)) return url;
    if (/^https?:\/\//i.test(url)) {
      if (typeof resolvePhotoUrl === 'function') {
        const resolved = resolvePhotoUrl(url);
        if (resolved) return resolved;
      }
      return url;
    }
    const path = ensureUploadsPath(url);
    if (typeof resolvePhotoUrl === 'function') {
      const resolved = resolvePhotoUrl(path);
      if (resolved) return resolved;
    }
    return `${apiBaseUrl()}/${path.replace(/^\/+/, '')}`;
  }

  function openAvisoImage(el) {
    const src = el?.getAttribute ? el.getAttribute('data-img-src') : '';
    const caption = el?.getAttribute ? (el.getAttribute('data-img-caption') || '') : '';
    if (!src) return;
    const box = document.getElementById('painelSonhosLightbox');
    const img = document.getElementById('painelSonhosLightboxImg');
    if (box && img) {
      img.src = src;
      img.alt = caption || 'Imagem do aviso';
      const cap = document.getElementById('painelSonhosLightboxCaption');
      if (cap) cap.textContent = caption;
      box.hidden = false;
      document.body.style.overflow = 'hidden';
      return;
    }
    try { window.open(src, '_blank', 'noopener'); } catch (_) { /* noop */ }
  }

  async function saveAviso() {
    const user = await getUser();
    if (!user?.id || !canPostAvisos(user.role, user)) {
      showToast('Vendedores não publicam no mural — peça ao seu supervisor.', 'error');
      return;
    }
    const editId = document.getElementById('psAvisoEditId')?.value || '';
    let existingPost = null;
    if (editId) {
      try { existingPost = await DB.getTrainingMuralPost(editId); } catch (_) { /* noop */ }
      if (existingPost && !canEditAviso(user, existingPost)) {
        showToast('Você só pode editar avisos publicados por você.', 'error');
        return;
      }
    }
    const title = document.getElementById('psAvisoTitle')?.value?.trim();
    const body = document.getElementById('psAvisoBody')?.value?.trim() || '';
    const channel = document.getElementById('psAvisoChannel')?.value?.trim()
      || user.department
      || 'Comunicados';
    if (!title) {
      showToast('Informe o título do aviso.', 'warning');
      return;
    }
    let imageUrl = _avisoImageCurrent || '';
    if (_avisoImageFile) {
      showLoading('Enviando imagem...');
      try {
        const uploaded = await _uploadAvisoImage(_avisoImageFile, user.id);
        if (!uploaded) {
          showToast('Não foi possível enviar a imagem do aviso.', 'error');
          return;
        }
        imageUrl = uploaded;
      } finally {
        hideLoading();
      }
    }
    const row = {
      id: editId || undefined,
      title: formatAvisoTitle(channel, title),
      body,
      pinned: !!document.getElementById('psAvisoPinned')?.checked,
      exige_ciencia: !!document.getElementById('psAvisoExigeCiencia')?.checked,
      active: true,
      audience_roles: ['*'],
      partner_root_id: null,
      /* Edição não troca o autor original do aviso. */
      created_by: existingPost?.created_by || user.id,
      /* Preserva created_at para o TTL de 24h não reiniciar em edições. */
      created_at: existingPost?.created_at,
      image_url: imageUrl || null,
    };
    showLoading('Publicando aviso...');
    try {
      await DB.saveTrainingMuralPost(row);
      closeAvisoEditor();
      _resetAvisoImageState('');
      showToast('Aviso publicado!', 'success');
      await render(undefined, { avisosOnly: true });
    } catch (e) {
      alert('Erro ao salvar aviso: ' + (e?.message || e));
    } finally {
      hideLoading();
    }
  }

  async function removeAviso(id) {
    const user = await getUser();
    if (!canPostAvisos(user?.role, user)) {
      showToast('Sem permissão para excluir avisos do mural.', 'error');
      return;
    }
    if (!canManageAvisos(user?.role, user)) {
      let post = null;
      try { post = await DB.getTrainingMuralPost(id); } catch (_) { /* noop */ }
      if (post && !canEditAviso(user, post)) {
        showToast('Você só pode excluir avisos publicados por você.', 'error');
        return;
      }
    }
    if (!id || !confirm('Excluir este aviso/comunicado?')) return;
    try {
      if (typeof _cacheDel === 'function') {
        try { _cacheDel('training_mural'); } catch (_) { /* noop */ }
      }
      await DB.deleteTrainingMuralPost(id);
      showToast('Aviso excluído.', 'success');
      await render(undefined, { avisosOnly: true });
    } catch (e) {
      alert('Erro ao excluir: ' + (e?.message || e));
    }
  }

  async function toggleMuralLike(postId) {
    const user = await getUser();
    if (!shouldShowAvisos(user) || !user?.id) return;
    if (typeof DB === 'undefined' || typeof DB.toggleMuralLike !== 'function') return;
    try {
      await DB.toggleMuralLike(postId, user);
      await render(undefined, { avisosOnly: true });
    } catch (e) {
      showToast('Não foi possível curtir: ' + (e?.message || e), 'error');
    }
  }

  async function markMuralRead(postId) {
    const user = await getUser();
    if (!shouldShowAvisos(user) || !user?.id) return;
    if (typeof DB === 'undefined' || typeof DB.markMuralRead !== 'function') return;
    try {
      await DB.markMuralRead(postId, user);
      await render(undefined, { avisosOnly: true });
    } catch (e) {
      showToast('Não foi possível registrar ciência: ' + (e?.message || e), 'error');
    }
  }

  function toggleMuralComments(postId) {
    const id = String(postId || '');
    if (!id) return;
    if (_expandedComments.has(id)) _expandedComments.delete(id);
    else _expandedComments.add(id);
    _refreshAvisosInPlace();
  }

  function toggleMuralReaders(postId) {
    const id = String(postId || '');
    if (!id) return;
    if (_expandedReaders.has(id)) _expandedReaders.delete(id);
    else _expandedReaders.add(id);
    _refreshAvisosInPlace();
  }

  async function _refreshAvisosInPlace() {
    const user = await getUser();
    if (!user) return;
    await _updateAvisosSection(user, { skipReload: true });
  }

  async function submitMuralComment(postId) {
    const user = await getUser();
    if (!shouldShowAvisos(user) || !user?.id) return;
    const input = document.getElementById(`muralCommentInput_${postId}`);
    const body = String(input?.value || '').trim();
    if (!body) {
      showToast('Escreva um comentário antes de enviar.', 'error');
      return;
    }
    if (typeof DB === 'undefined' || typeof DB.addMuralComment !== 'function') return;
    try {
      await DB.addMuralComment(postId, user, body);
      _expandedComments.add(String(postId));
      if (input) input.value = '';
      await render(undefined, { avisosOnly: true });
    } catch (e) {
      showToast('Não foi possível comentar: ' + (e?.message || e), 'error');
    }
  }

  async function removeMuralComment(commentId, postId) {
    const user = await getUser();
    if (!user?.id) return;
    const eng = engFor(postId);
    const comment = (eng.comments || []).find(c => String(c.id) === String(commentId));
    if (!comment) {
      showToast('Comentário não encontrado.', 'error');
      return;
    }
    if (!canDeleteMuralComment(user, comment)) {
      showToast('Sem permissão para excluir este comentário.', 'error');
      return;
    }
    if (!confirm('Excluir este comentário?')) return;
    if (typeof DB === 'undefined' || typeof DB.deactivateMuralComment !== 'function') return;
    try {
      await DB.deactivateMuralComment(commentId);
      await render(undefined, { avisosOnly: true });
    } catch (e) {
      showToast('Não foi possível excluir: ' + (e?.message || e), 'error');
    }
  }

  async function _updateAvisosSection(user, opts = {}) {
    const host = document.getElementById('painelSonhosAvisos');
    if (!host) return false;
    const posts = opts.skipReload && _lastAvisosPosts.length
      ? _lastAvisosPosts
      : await loadAvisos(user);
    const html = renderAvisosSection(posts, canPostAvisos(user?.role, user), user);
    host.outerHTML = html;
    return true;
  }

  function firstName(name) {
    const n = String(name || '').trim();
    if (!n) return 'colaborador';
    return n.split(/\s+/)[0];
  }

  function greeting() {
    const hour = Number(new Intl.DateTimeFormat('pt-BR', {
      timeZone: TZ,
      hour: 'numeric',
      hour12: false,
    }).format(new Date()));
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  function formatLongDate() {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: TZ,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
  }

  const MOTIVATIONAL = [
    'Sonhe grande, execute com foco e celebre cada passo da sua jornada.',
    'Suas metas de hoje constroem o futuro que você merece viver.',
    'Disciplina diária transforma sonhos em conquistas reais.',
    'Acredite no processo: cada registro aqui é um compromisso com você.',
    'O sucesso é a soma de pequenas vitórias bem vividas.',
    'Visualize, planeje e avance — você está mais perto do que imagina.',
    'Grandes resultados começam com clareza sobre o que você deseja.',
  ];

  function motivationalPhrase() {
    const idx = Number(new Intl.DateTimeFormat('pt-BR', {
      timeZone: TZ,
      day: 'numeric',
    }).format(new Date())) % MOTIVATIONAL.length;
    return MOTIVATIONAL[idx];
  }

  function parseList(user) {
    let raw = user?.sonhos_data ?? user?.sonhos;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (_) { raw = []; }
    }
    if (Array.isArray(raw)) return raw.filter(Boolean).map(normalizeItem).filter(Boolean);
    if (raw && typeof raw === 'object' && Array.isArray(raw.items)) {
      return raw.items.map(normalizeItem).filter(Boolean);
    }
    try {
      const loc = localStorage.getItem(localKey(user?.id));
      if (loc) return JSON.parse(loc).map(normalizeItem).filter(Boolean);
    } catch (_) { /* noop */ }
    return [];
  }

  function normalizePhotoPath(ref) {
    let raw = String(ref || '').trim();
    if (!raw || /^data:|^blob:/i.test(raw)) return raw;
    if (/attachment-proxy\.php/i.test(raw)) {
      try {
        const p = new URL(raw, location.origin).searchParams.get('path');
        if (p) raw = decodeURIComponent(p);
      } catch (_) { /* noop */ }
    } else if (/^https?:\/\//i.test(raw)) {
      const m = raw.match(/\/uploads\/(.+?)(?:\?|#|$)/i);
      if (m) raw = m[1];
      else return raw;
    }
    raw = raw.replace(/^uploads\//i, '').replace(/^\/+/, '');
    if (raw && !/^sonhos\//i.test(raw) && /^[a-zA-Z0-9_-]+\/img_\d+\.[a-z0-9]+$/i.test(raw)) {
      raw = `sonhos/${raw}`;
    }
    return raw;
  }

  function normalizeItem(item) {
    if (!item || typeof item !== 'object') return null;
    const title = String(item.title || item.description || '').trim();
    if (!title) return null;
    const photoRaw = String(item.photoUrl || item.photo_url || item.photo || '').trim();
    const photoUrl = photoRaw ? (normalizePhotoPath(photoRaw) || photoRaw) : null;
    const description = String(item.description || '').trim();
    return {
      id: String(item.id || `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
      title: item.title ? title : title.slice(0, 120),
      description: item.title ? description : '',
      targetDate: item.targetDate || item.target_date || null,
      photoUrl,
      done: !!item.done,
      createdAt: item.createdAt || item.created_at || new Date().toISOString(),
    };
  }

  function writeLocal(userId, list) {
    try { localStorage.setItem(localKey(userId), JSON.stringify(list)); } catch (_) { /* noop */ }
  }

  async function saveList(user, list) {
    if (!user?.id) return false;
    const clean = (list || []).map(normalizeItem).filter(Boolean);
    writeLocal(user.id, clean);
    const payload = { sonhos_data: { items: clean, updated_at: new Date().toISOString() } };
    try {
      await DB.updateUser(user.id, payload);
      if (typeof currentUser !== 'undefined' && currentUser?.id === user.id) {
        currentUser = { ...currentUser, sonhos_data: payload.sonhos_data };
      }
      if (_cachedUser?.id === user.id) {
        _cachedUser = { ..._cachedUser, sonhos_data: payload.sonhos_data };
      }
      _photoSrcCache.clear();
      return true;
    } catch (e) {
      console.warn('[PainelSonhos] save remoto:', e?.message || e);
      return false;
    }
  }

  function invalidateUserCache() {
    _cachedUser = null;
    _userFetchPromise = null;
    _photoSrcCache.clear();
  }

  async function getUser(forceRefresh = false) {
    if (!forceRefresh) {
      if (_cachedUser?.id) return _cachedUser;
      if (typeof currentUser !== 'undefined' && currentUser?.id) {
        _cachedUser = currentUser;
        return _cachedUser;
      }
    }
    if (_userFetchPromise && !forceRefresh) return _userFetchPromise;
    _userFetchPromise = (async () => {
      try {
        const u = typeof resolveEmployeeUser === 'function'
          ? await resolveEmployeeUser()
          : await Auth.getCurrentUser();
        if (u) _cachedUser = u;
        return u;
      } finally {
        _userFetchPromise = null;
      }
    })();
    return _userFetchPromise;
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escAttr(s) {
    return esc(s).replace(/`/g, '&#96;');
  }

  function imgSrcAttr(src) {
    if (!src) return '';
    if (/^(data:image\/|blob:)/i.test(src)) return String(src).replace(/"/g, '&quot;');
    return escAttr(src);
  }

  function ensureUploadsPath(path) {
    const p = String(path || '').trim().replace(/^\/+/, '');
    if (!p || /^data:|^blob:|^https?:\/\//i.test(p)) return p;
    return /^uploads\//i.test(p) ? p : `uploads/${p}`;
  }

  function apiBaseUrl() {
    return String(
      (['localhost', '127.0.0.1'].includes(String(location.hostname || '').toLowerCase())
        ? location.origin
        : ((window.SOUBLU_CONFIG && (window.SOUBLU_CONFIG.API_BASE_URL || window.SOUBLU_CONFIG.SITE_URL)) || location.origin))
      || ''
    ).replace(/\/+$/, '');
  }

  function fmtTargetDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(`${iso}T12:00:00`);
      return d.toLocaleDateString('pt-BR', { timeZone: TZ });
    } catch (_) {
      return iso;
    }
  }

  function photoSrc(dream) {
    const id = dream?.id;
    const rawKey = String(dream?.photoUrl || '').trim();
    if (id && _photoSrcCache.has(id) && _photoSrcCache.get(`${id}:raw`) === rawKey) {
      return _photoSrcCache.get(id) || '';
    }
    const raw = rawKey;
    if (!raw) return '';
    if (/^data:image\//i.test(raw)) return raw;
    if (/^blob:/i.test(raw)) return raw;
    let path = normalizePhotoPath(raw);
    if (/^https?:\/\//i.test(path)) {
      if (typeof resolvePhotoUrl === 'function') {
        const resolved = resolvePhotoUrl(path);
        if (resolved) return resolved;
      }
      return path;
    }
    path = ensureUploadsPath(path);
    if (typeof resolvePhotoUrl === 'function') {
      const resolved = resolvePhotoUrl(path) || resolvePhotoUrl(ensureUploadsPath(raw));
      if (resolved) return resolved;
    }
    const src = `${apiBaseUrl()}/${path.replace(/^\/+/, '')}`;
    if (id) {
      _photoSrcCache.set(id, src);
      _photoSrcCache.set(`${id}:raw`, rawKey);
    }
    return src;
  }

  function onDreamImageError(img, dreamId) {
    if (!img) return;
    if (!img.dataset.psRetry) {
      img.dataset.psRetry = '1';
      const raw = img.getAttribute('data-photo-ref') || '';
      if (raw) {
        const retry = photoSrc({ id: dreamId, photoUrl: raw });
        const current = img.getAttribute('src') || '';
        if (retry && retry !== current) {
          img.src = /^data:image\//i.test(retry) ? retry : escAttr(retry);
          return;
        }
      }
    }
    const media = img?.closest('.painel-sonho-vision-card__media');
    if (media) media.classList.add('is-broken');
    img.style.display = 'none';
    const ph = media?.querySelector('.painel-sonho-vision-card__placeholder');
    if (ph) ph.hidden = false;
    const card = media?.closest('.painel-sonho-vision-card');
    if (card) card.classList.remove('has-photo');
  }

  function openDreamModal() {
    _renderDreamModal().then(() => {
      const modal = document.getElementById('painelSonhosModal');
      if (!modal) return;
      if (typeof openModal === 'function') openModal('painelSonhosModal');
      else modal.classList.add('open');
      document.body.style.overflow = 'hidden';
      setTimeout(() => document.getElementById('sonhoTitulo')?.focus(), 50);
    });
  }

  function closeDreamModal() {
    const modal = document.getElementById('painelSonhosModal');
    if (modal) {
      if (typeof closeModal === 'function') closeModal('painelSonhosModal');
      else modal.classList.remove('open');
    }
    const lb = document.getElementById('painelSonhosLightbox');
    if (!lb || lb.hidden) document.body.style.overflow = '';
    _editingDreamId = null;
    _pendingPhotoFile = null;
    _pendingPhotoPreview = '';
  }

  function openDreamPhotoCadastro(dreamId) {
    if (!dreamId) return;
    _editingDreamId = dreamId;
    _pendingPhotoFile = null;
    _pendingPhotoPreview = '';
    openDreamModal();
  }

  function cancelDreamEdit() {
    closeDreamModal();
  }

  function focusNewDreamForm() {
    _editingDreamId = null;
    _pendingPhotoFile = null;
    _pendingPhotoPreview = '';
    openDreamModal();
  }

  function progressPct(dream) {
    if (!dream?.targetDate) return null;
    const created = new Date(dream.createdAt || Date.now()).getTime();
    const target = new Date(`${dream.targetDate}T12:00:00`).getTime();
    const now = Date.now();
    if (target <= created) return dream.done ? 100 : Math.min(99, Math.round(((now - created) / 86400000) * 2));
    const pct = ((now - created) / (target - created)) * 100;
    return Math.min(100, Math.max(0, Math.round(pct)));
  }

  function daysUntil(iso) {
    if (!iso) return null;
    const target = new Date(`${iso}T12:00:00`);
    const diff = Math.ceil((target - Date.now()) / 86400000);
    return diff;
  }

  function filterDreams(list) {
    if (_viewFilter === 'open') return list.filter(d => !d.done);
    if (_viewFilter === 'done') return list.filter(d => d.done);
    return list;
  }

  function sortDreams(list) {
    return [...list].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const ap = a.photoUrl ? 1 : 0;
      const bp = b.photoUrl ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }

  function renderProgressBar(dream) {
    const pct = progressPct(dream);
    if (pct == null) return '';
    const days = daysUntil(dream.targetDate);
    let label = `${pct}% da jornada`;
    if (days != null && !dream.done) {
      label = days > 0 ? `${days} dia(s) para a meta` : (days === 0 ? 'Meta é hoje!' : `${Math.abs(days)} dia(s) após a meta`);
    }
    if (dream.done) label = 'Sonho realizado!';
    return `
      <div class="painel-sonho-progress">
        <div class="painel-sonho-progress__track">
          <div class="painel-sonho-progress__fill${dream.done ? ' is-complete' : ''}" style="width:${dream.done ? 100 : pct}%"></div>
        </div>
        <span class="painel-sonho-progress__label">${esc(label)}</span>
      </div>`;
  }

  function renderVisionCard(dream) {
    const src = photoSrc(dream);
    const id = escAttr(dream.id);
    const meta = dream.targetDate
      ? `<span class="painel-sonho-vision-card__date">Meta: ${esc(fmtTargetDate(dream.targetDate))}</span>`
      : '';
    const desc = dream.description
      ? `<p class="painel-sonho-vision-card__desc">${esc(dream.description)}</p>`
      : '';
    const media = src
      ? `<div class="painel-sonho-vision-card__media has-photo" role="button" tabindex="0"
          onclick="if(!this.classList.contains('is-broken'))PainelSonhos.openLightbox('${id}')"
          onkeydown="if(event.key==='Enter'&&!this.classList.contains('is-broken'))PainelSonhos.openLightbox('${id}')">
          <img src="${imgSrcAttr(src)}" alt="${escAttr(dream.title)}" class="painel-sonho-vision-card__img" loading="lazy" decoding="async"
            data-photo-ref="${escAttr(dream.photoUrl || '')}"
            onerror="PainelSonhos.onDreamImageError(this,'${id}')"/>
          <div class="painel-sonho-vision-card__placeholder" hidden aria-hidden="true">
            <button type="button" class="painel-sonho-photo-btn"
              onclick="event.stopPropagation(); PainelSonhos.openDreamPhotoCadastro('${id}')">
              <span class="painel-sonho-photo-btn__icon" aria-hidden="true">📷</span>
              <span>Cadastrar foto</span>
            </button>
          </div>
          ${dream.done ? '<span class="painel-sonho-vision-card__badge">Realizado</span>' : ''}
        </div>`
      : `<button type="button" class="painel-sonho-vision-card__upload"
          onclick="PainelSonhos.openDreamPhotoCadastro('${id}')">
          <span class="painel-sonho-vision-card__upload-icon">📷</span>
          <span>Cadastrar foto</span>
        </button>`;

    return `
      <article class="painel-sonho-vision-card${dream.done ? ' is-done' : ''}${src ? ' has-photo' : ''}" data-id="${id}">
        ${media}
        <div class="painel-sonho-vision-card__body">
          <div class="painel-sonho-vision-card__head">
            <label class="painel-sonho-check-wrap" title="Marcar como realizado">
              <input type="checkbox" class="painel-sonho-card__check" ${dream.done ? 'checked' : ''}
                onchange="PainelSonhos.toggleDone('${id}', this.checked)"/>
              <span class="painel-sonho-check-wrap__box"></span>
            </label>
            <h4 class="painel-sonho-vision-card__title">${esc(dream.title)}</h4>
            <button type="button" class="painel-sonho-vision-card__remove" title="Excluir"
              onclick="PainelSonhos.removeDream('${id}')">✕</button>
          </div>
          ${desc}
          ${meta}
          ${renderProgressBar(dream)}
        </div>
      </article>`;
  }

  function renderCompactCard(dream) {
    const id = escAttr(dream.id);
    const meta = dream.targetDate ? `<div class="painel-sonho-card__meta">Meta: ${esc(fmtTargetDate(dream.targetDate))}</div>` : '';
    const desc = dream.description ? `<p class="painel-sonho-card__desc">${esc(dream.description)}</p>` : '';
    const thumbSrc = photoSrc(dream);
    const thumb = thumbSrc
      ? `<button type="button" class="painel-sonho-card__thumb" onclick="PainelSonhos.openLightbox('${id}')">
          <img src="${imgSrcAttr(thumbSrc)}" alt="" data-photo-ref="${escAttr(dream.photoUrl || '')}"
            onerror="PainelSonhos.onDreamImageError(this,'${id}')"/>
        </button>`
      : `<label class="painel-sonho-card__thumb painel-sonho-card__thumb--empty" for="sonhoAddPhoto_${id}" title="Adicionar foto">
          <span>📷</span>
          <input type="file" id="sonhoAddPhoto_${id}" accept="image/*" class="sr-only"
            onchange="PainelSonhos.attachPhoto('${id}', this)"/>
        </label>`;

    return `
      <article class="painel-sonho-card${dream.done ? ' is-done' : ''}" data-id="${id}">
        ${thumb}
        <input type="checkbox" class="painel-sonho-card__check" ${dream.done ? 'checked' : ''}
          aria-label="Marcar como realizado" onchange="PainelSonhos.toggleDone('${id}', this.checked)"/>
        <div class="painel-sonho-card__body">
          <h4 class="painel-sonho-card__title">${esc(dream.title)}</h4>
          ${desc}
          ${meta}
          ${renderProgressBar(dream)}
        </div>
        <div class="painel-sonho-card__actions">
          <button type="button" class="btn btn-ghost btn-sm" title="Excluir"
            onclick="PainelSonhos.removeDream('${id}')">✕</button>
        </div>
      </article>`;
  }

  function renderDreamsSection(dreams) {
    const filtered = sortDreams(filterDreams(dreams));
    const withPhoto = filtered.filter(d => d.photoUrl);
    const withoutPhoto = filtered.filter(d => !d.photoUrl);

    if (!filtered.length) {
      return `<div class="painel-sonhos-empty">
        <div class="painel-sonhos-empty__icon">🌟</div>
        <p style="margin:0;font-weight:800;font-size:16px;color:var(--ps-text, #0f172a);">Seu mural está pronto para brilhar</p>
        <p style="margin:10px 0 0;font-size:14px;color:var(--ps-text-muted, #64748b);">Adicione fotos de viagens, carros, bônus ou metas pessoais — visualize o futuro que você está conquistando.</p>
      </div>`;
    }

    let html = '';
    if (withPhoto.length) {
      html += `<div class="painel-sonhos-vision-grid">${withPhoto.map(renderVisionCard).join('')}</div>`;
    }
    if (withoutPhoto.length) {
      html += `<div class="painel-sonhos-list${withPhoto.length ? ' painel-sonhos-list--after-grid' : ''}">
        ${withoutPhoto.map(d => withPhoto.length ? renderCompactCard(d) : renderVisionCard(d)).join('')}
      </div>`;
    }
    return html;
  }

  function renderFilterTabs() {
    const tabs = [
      { id: 'all', label: 'Todos' },
      { id: 'open', label: 'Em andamento' },
      { id: 'done', label: 'Realizados' },
    ];
    return `<div class="painel-sonhos-filters" role="tablist">
      ${tabs.map(t => `
        <button type="button" class="painel-sonhos-filter${_viewFilter === t.id ? ' active' : ''}"
          role="tab" aria-selected="${_viewFilter === t.id}"
          onclick="PainelSonhos.setFilter('${t.id}')">${t.label}</button>`).join('')}
      <button type="button" class="btn btn-outline btn-sm painel-sonhos-cadastrar-btn" onclick="PainelSonhos.focusNewDreamForm()">+ Novo sonho</button>
    </div>`;
  }

  const DROPZONE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/><path d="M21 15l-5-5L5 21"/></svg>`;

  function renderPhotoDropzone() {
    const preview = _pendingPhotoPreview
      ? `<div class="painel-sonhos-dropzone__preview">
          <img src="${escAttr(_pendingPhotoPreview)}" alt="Prévia"/>
          <button type="button" class="painel-sonhos-dropzone__clear" onclick="event.stopPropagation();PainelSonhos.clearPhotoPreview()">Remover foto</button>
        </div>`
      : `<div class="painel-sonhos-dropzone__placeholder">
          <span class="painel-sonhos-dropzone__icon">${DROPZONE_ICON_SVG}</span>
          <strong>Visualize seu sonho</strong>
          <span>Clique ou arraste uma foto inspiradora</span>
          <span class="painel-sonhos-dropzone__hint">JPG, PNG ou WebP · até 5 MB</span>
        </div>`;

    return `
      <div class="form-group">
        <label class="painel-sonhos-form-label" for="sonhoFoto">Foto do sonho <span class="painel-sonhos-optional">(opcional)</span></label>
        <div class="painel-sonhos-dropzone" id="sonhoDropzone"
          onclick="document.getElementById('sonhoFoto')?.click()">
          ${preview}
          <input type="file" id="sonhoFoto" accept="image/jpeg,image/png,image/webp,image/gif" class="sr-only"
            onchange="PainelSonhos.onPhotoPick(this)"/>
        </div>
      </div>`;
  }

  function buildHeroKpisHtml(open, done, withPhotos, journeyPct) {
    return `
      <div class="painel-sonhos-kpi">
        <strong>${open}</strong>
        <span>Em andamento</span>
      </div>
      <div class="painel-sonhos-kpi painel-sonhos-kpi--gold">
        <strong>${done}</strong>
        <span>Realizados</span>
      </div>
      <div class="painel-sonhos-kpi">
        <strong>${withPhotos}</strong>
        <span>Com visão</span>
      </div>
      <div class="painel-sonhos-kpi">
        <strong>${journeyPct}%</strong>
        <span>Jornada</span>
      </div>`;
  }

  function buildDreamModalHtml(editingDream) {
    const submitLabel = editingDream ? 'Salvar foto no mural' : 'Adicionar ao mural';
    const title = editingDream ? 'Cadastrar foto do sonho' : 'Novo sonho';
    return `
      <div class="modal-overlay" id="painelSonhosModal" onclick="if(event.target===this)PainelSonhos.closeDreamModal()">
        <div class="modal painel-sonhos-modal">
          <div class="modal-header">
            <h3 id="painelSonhosModalTitle">${title}</h3>
            <button type="button" class="modal-close" onclick="PainelSonhos.closeDreamModal()" aria-label="Fechar"></button>
          </div>
          <div class="modal-body">
            ${editingDream ? `<p class="painel-sonhos-form-card__edit-hint">Atualizando: <strong>${esc(editingDream.title)}</strong></p>` : ''}
            <form id="form-sonho" class="painel-sonhos-form" onsubmit="PainelSonhos.addDream(event)">
              ${renderPhotoDropzone()}
              <div class="form-group">
                <label class="painel-sonhos-form-label" for="sonhoTitulo">O que você sonha?</label>
                <input type="text" id="sonhoTitulo" class="form-control" placeholder="Ex.: Comprar minha casa" maxlength="120" required
                  value="${editingDream ? escAttr(editingDream.title) : ''}"${editingDream ? ' readonly' : ''}/>
              </div>
              <div class="form-group">
                <label class="painel-sonhos-form-label" for="sonhoDescricao">Detalhes <span class="painel-sonhos-optional">(opcional)</span></label>
                <textarea id="sonhoDescricao" class="form-control" rows="3" placeholder="Por que esse sonho é importante para você?" maxlength="500">${editingDream ? esc(editingDream.description || '') : ''}</textarea>
              </div>
              <div class="form-group">
                <label class="painel-sonhos-form-label" for="sonhoDataMeta">Data meta <span class="painel-sonhos-optional">(opcional)</span></label>
                <div class="painel-sonhos-date-wrap${editingDream?.targetDate ? ' has-value' : ''}">
                  <input type="date" id="sonhoDataMeta" class="form-control painel-sonhos-date-input"
                    value="${editingDream?.targetDate ? escAttr(editingDream.targetDate) : ''}"/>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="PainelSonhos.closeDreamModal()">Cancelar</button>
            <button type="submit" form="form-sonho" class="btn btn-primary">${submitLabel}</button>
          </div>
        </div>
      </div>`;
  }

  async function _renderDreamModal() {
    let root = document.getElementById('painelSonhosModalRoot');
    if (!root) {
      root = document.createElement('div');
      root.id = 'painelSonhosModalRoot';
      document.body.appendChild(root);
    }
    const user = await getUser();
    if (!user) return;
    const dreams = parseList(user);
    const editingDream = _editingDreamId
      ? dreams.find(d => d.id === _editingDreamId)
      : null;
    if (_editingDreamId && !editingDream) _editingDreamId = null;
    root.innerHTML = buildDreamModalHtml(editingDream);
    _bindDropzone();
    _bindDateField();
  }

  function _updateFilterTabs() {
    document.querySelectorAll('.painel-sonhos-filter').forEach((btn) => {
      const match = btn.getAttribute('onclick')?.match(/setFilter\('([^']+)'\)/);
      const id = match ? match[1] : '';
      const active = id === _viewFilter;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function _refreshDropzoneOnly() {
    const zone = document.getElementById('sonhoDropzone');
    if (!zone) return false;
    const group = zone.closest('.form-group');
    if (!group) return false;
    group.outerHTML = renderPhotoDropzone();
    _bindDropzone();
    return true;
  }

  function _updateBoardSection(dreams) {
    const body = document.getElementById('painelSonhosBoardBody');
    if (!body) return false;
    body.innerHTML = renderDreamsSection(dreams);
    _updateFilterTabs();
    return true;
  }

  function _updateHeroKpis(dreams) {
    const el = document.getElementById('painelSonhosHeroKpis');
    if (!el) return;
    const done = dreams.filter(d => d.done).length;
    const open = dreams.length - done;
    const withPhotos = dreams.filter(d => d.photoUrl).length;
    const journeyPct = dreams.length ? Math.round((done / dreams.length) * 100) : 0;
    el.innerHTML = buildHeroKpisHtml(open, done, withPhotos, journeyPct);
  }

  async function render(rootId = 'painelSonhosRoot', opts = {}) {
    const { forceUser = false } = opts;
    const root = document.getElementById(rootId);
    if (!root) return;

    const user = await getUser(forceUser);
    if (!user) {
      root.innerHTML = '<div class="card card-padded text-muted text-center">Faça login para ver seu painel.</div>';
      return;
    }
    if (!eligible(user.role)) {
      root.innerHTML = '';
      return;
    }

    const dreams = parseList(user);
    const done = dreams.filter(d => d.done).length;
    const open = dreams.length - done;
    const withPhotos = dreams.filter(d => d.photoUrl).length;
    const manageAvisos = canPostAvisos(user.role, user);
    const showAvisos = shouldShowAvisos(user);
    const bolaoWelcome = (typeof BolaoCopa !== 'undefined' && typeof BolaoCopa.renderWelcomeHtml === 'function')
      ? await Promise.race([
        BolaoCopa.renderWelcomeHtml(),
        new Promise((resolve) => setTimeout(() => resolve(''), 6000)),
      ]).catch(() => '')
      : '';
    const level = Math.min(99, Math.max(1, 1 + Math.floor(done * 1.5) + Math.floor(withPhotos / 3)));
    const journeyPct = dreams.length ? Math.round((done / dreams.length) * 100) : 0;
    const editingDream = _editingDreamId
      ? dreams.find(d => d.id === _editingDreamId)
      : null;
    if (_editingDreamId && !editingDream) _editingDreamId = null;

    const shellExists = !!root.querySelector('.painel-sonhos-wrap');
    if (shellExists && opts.avisosOnly) {
      if (!showAvisos) {
        const wrap = root.querySelector('.mural-feed-wrap, #painelSonhosAvisos')?.closest('.card, .mural-feed-wrap')
          || root.querySelector('.mural-feed-wrap');
        if (wrap) wrap.remove();
        return true;
      }
      if (await _updateAvisosSection(user)) return;
    }
    if (shellExists && opts.boardOnly) {
      _updateBoardSection(dreams);
      _updateHeroKpis(dreams);
      return;
    }
    if (shellExists && opts.formOnly) {
      await _renderDreamModal();
      return;
    }

    const avisos = showAvisos ? await loadAvisos(user) : [];
    const avisosBlock = showAvisos
      ? `<div class="card card-padded mural-feed-wrap">
          ${renderAvisosSection(avisos, manageAvisos, user)}
        </div>`
      : '';

    root.innerHTML = `
      <div class="painel-sonhos-wrap">
        <div class="painel-sonhos-hero">
          <div class="painel-sonhos-hero__content">
            <div class="painel-sonhos-hero__top">
              <div>
                <p class="painel-sonhos-hero__eyebrow">Painel dos Sonhos</p>
                <h1 class="painel-sonhos-hero__greeting">${greeting()}, ${esc(firstName(user.name))}!</h1>
              </div>
              <div class="painel-sonhos-hero__badge" title="Nível de conquistas">
                <span class="painel-sonhos-hero__badge-icon">🏆</span>
                Nível ${level}
              </div>
            </div>
            <p class="painel-sonhos-hero__sub">${esc(motivationalPhrase())}</p>
            ${bolaoWelcome}
            <p class="painel-sonhos-hero__sub painel-sonhos-hero__sub--muted">Visualize suas metas com imagens inspiradoras — viagens, conquistas e o estilo de vida que você está construindo.</p>
            <div class="painel-sonhos-hero__kpis" id="painelSonhosHeroKpis">
              ${buildHeroKpisHtml(open, done, withPhotos, journeyPct)}
            </div>
            <div class="painel-sonhos-hero__meta">
              <span>${esc(formatLongDate())}</span>
            </div>
          </div>
        </div>

        ${avisosBlock}

        <div class="painel-sonhos-board-wrap">
          <div class="card card-padded painel-sonhos-board">
            <div class="painel-sonhos-board__head">
              <div>
                <h3 class="painel-sonhos-board__title">Mural de conquistas</h3>
                <p class="painel-sonhos-board__sub">${dreams.length} ${dreams.length === 1 ? 'meta registrada' : 'metas registradas'} · sonhos com foto ganham destaque</p>
              </div>
              ${renderFilterTabs()}
            </div>
            <div id="painelSonhosBoardBody">${renderDreamsSection(dreams)}</div>
          </div>
        </div>
      </div>

      <div id="painelSonhosModalRoot"></div>

      <div class="painel-sonhos-lightbox" id="painelSonhosLightbox" hidden onclick="PainelSonhos.closeLightbox(event)">
        <div class="painel-sonhos-lightbox__inner" onclick="event.stopPropagation()">
          <button type="button" class="painel-sonhos-lightbox__close" onclick="PainelSonhos.closeLightbox()">✕</button>
          <img id="painelSonhosLightboxImg" alt="" loading="lazy" decoding="async"/>
          <p id="painelSonhosLightboxCaption"></p>
        </div>
      </div>`;

    if (typeof BolaoCopa !== 'undefined' && typeof BolaoCopa.checkAndCelebrate === 'function') {
      BolaoCopa.checkAndCelebrate(user).catch(() => {});
    }
  }

  function _bindDateField() {
    const input = document.getElementById('sonhoDataMeta');
    const wrap = input?.closest('.painel-sonhos-date-wrap');
    if (!input || !wrap) return;
    const sync = () => wrap.classList.toggle('has-value', !!input.value);
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
    input.addEventListener('focus', () => wrap.classList.add('is-focused'));
    input.addEventListener('blur', () => wrap.classList.remove('is-focused'));
    sync();
  }

  function _bindDropzone() {
    const zone = document.getElementById('sonhoDropzone');
    const input = document.getElementById('sonhoFoto');
    if (!zone || !input) return;

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('is-dragover');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('is-dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) {
        _setPendingPhoto(file);
      }
    });
  }

  async function _setPendingPhoto(file) {
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      showToast('A foto deve ter no máximo 5 MB.', 'warning');
      return;
    }
    if (!file.type.startsWith('image/')) {
      showToast('Envie uma imagem (JPG, PNG ou WebP).', 'warning');
      return;
    }
    _pendingPhotoFile = file;
    try {
      _pendingPhotoPreview = typeof fileToBase64 === 'function'
        ? await fileToBase64(file)
        : await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
    } catch (_) {
      _pendingPhotoPreview = '';
    }
    if (_refreshDropzoneOnly()) return;
    const modal = document.getElementById('painelSonhosModal');
    if (modal?.classList.contains('open')) {
      await _renderDreamModal();
      if (typeof openModal === 'function') openModal('painelSonhosModal');
      else document.getElementById('painelSonhosModal')?.classList.add('open');
      return;
    }
    await render(undefined, { formOnly: true });
  }

  function onPhotoPick(input) {
    const file = input?.files?.[0];
    if (file) _setPendingPhoto(file);
  }

  async function clearPhotoPreview() {
    _pendingPhotoFile = null;
    _pendingPhotoPreview = '';
    const input = document.getElementById('sonhoFoto');
    if (input) input.value = '';
    if (_refreshDropzoneOnly()) return;
    const modal = document.getElementById('painelSonhosModal');
    if (modal?.classList.contains('open')) {
      await _renderDreamModal();
      if (typeof openModal === 'function') openModal('painelSonhosModal');
      else document.getElementById('painelSonhosModal')?.classList.add('open');
      return;
    }
    render(undefined, { formOnly: true });
  }

  function _storePhotoRef(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    if (/^data:/i.test(raw)) return raw;
    const path = normalizePhotoPath(raw) || raw;
    if (/^https?:\/\//i.test(path)) return path;
    return ensureUploadsPath(path);
  }

  async function _uploadPhoto(file, userId) {
    if (typeof uploadImage === 'function') {
      try {
        const url = await uploadImage(file, 'sonhos', String(userId || 'user').replace(/[^a-zA-Z0-9_-]/g, '_'));
        if (url) return _storePhotoRef(url);
      } catch (e) {
        console.warn('[PainelSonhos] upload:', e?.message || e);
      }
    }
    if (typeof fileToBase64 === 'function') return fileToBase64(file);
    return null;
  }

  async function addDream(ev) {
    ev?.preventDefault();
    const user = await getUser();
    if (!user?.id) return;

    const title = document.getElementById('sonhoTitulo')?.value?.trim();
    if (!title) {
      showToast('Informe o título do sonho.', 'warning');
      return;
    }
    const description = document.getElementById('sonhoDescricao')?.value?.trim() || '';
    const targetDate = document.getElementById('sonhoDataMeta')?.value || null;

    let photoUrl = null;
    const file = _pendingPhotoFile || document.getElementById('sonhoFoto')?.files?.[0];
    if (file) {
      showLoading('Enviando foto...');
      try {
        photoUrl = await _uploadPhoto(file, user.id);
      } finally {
        hideLoading();
      }
    }

    const list = parseList(user);
    const editingId = _editingDreamId;

    if (editingId) {
      const existing = list.find(d => d.id === editingId);
      if (!existing) {
        showToast('Sonho não encontrado.', 'error');
        _editingDreamId = null;
        return;
      }
      if (!photoUrl) {
        showToast('Selecione uma foto para cadastrar.', 'warning');
        document.getElementById('sonhoFoto')?.click();
        return;
      }
      const updated = list.map(d => (d.id === editingId ? {
        ...d,
        title,
        description,
        targetDate,
        photoUrl,
      } : d));
      _editingDreamId = null;
      _pendingPhotoFile = null;
      _pendingPhotoPreview = '';
      showLoading('Salvando...');
      try {
        await saveList(user, updated);
        closeDreamModal();
        const fresh = parseList(_cachedUser || user);
        if (!_updateBoardSection(fresh)) await render();
        else _updateHeroKpis(fresh);
        showToast('Foto cadastrada no mural!', 'success');
        _celebrate();
      } catch (e) {
        showToast('Erro ao salvar.', 'error');
      } finally {
        hideLoading();
      }
      return;
    }

    list.unshift({
      id: `s_${Date.now()}`,
      title,
      description,
      targetDate,
      photoUrl,
      done: false,
      createdAt: new Date().toISOString(),
    });

    _pendingPhotoFile = null;
    _pendingPhotoPreview = '';

    showLoading('Salvando...');
    try {
      await saveList(user, list);
      _editingDreamId = null;
      closeDreamModal();
      const fresh = parseList(_cachedUser || user);
      if (!_updateBoardSection(fresh)) await render();
      else _updateHeroKpis(fresh);
      showToast(photoUrl ? 'Sonho adicionado ao mural!' : 'Sonho adicionado!', 'success');
      _celebrate();
    } catch (e) {
      showToast('Erro ao salvar.', 'error');
    } finally {
      hideLoading();
    }
  }

  async function attachPhoto(id, input) {
    const file = input?.files?.[0];
    if (!file) return;
    const user = await getUser();
    if (!user?.id) return;

    if (file.size > MAX_PHOTO_BYTES) {
      showToast('A foto deve ter no máximo 5 MB.', 'warning');
      input.value = '';
      return;
    }

    showLoading('Enviando foto...');
    try {
      const photoUrl = await _uploadPhoto(file, user.id);
      if (!photoUrl) throw new Error('upload');
      const list = parseList(user).map(d => (d.id === id ? { ...d, photoUrl } : d));
      await saveList(user, list);
      if (_updateBoardSection(parseList(_cachedUser || user))) {
        _updateHeroKpis(parseList(_cachedUser || user));
      } else {
        await render();
      }
      showToast('Foto adicionada ao sonho!', 'success');
    } catch (e) {
      showToast('Não foi possível enviar a foto.', 'error');
    } finally {
      hideLoading();
      if (input) input.value = '';
    }
  }

  function _celebrate() {
    const wrap = document.querySelector('.painel-sonhos-wrap');
    if (!wrap) return;
    wrap.classList.add('is-celebrating');
    setTimeout(() => wrap.classList.remove('is-celebrating'), 2200);
  }

  async function toggleDone(id, checked) {
    const user = await getUser();
    if (!user?.id) return;
    const list = parseList(user).map(d => (d.id === id ? { ...d, done: !!checked } : d));
    await saveList(user, list);
    if (_updateBoardSection(parseList(_cachedUser || user))) {
      _updateHeroKpis(parseList(_cachedUser || user));
    } else {
      await render();
    }
    if (checked) {
      showToast('Parabéns! Sonho realizado! 🎉', 'success', 4000);
      _celebrate();
      const card = document.querySelector(`[data-id="${id}"]`);
      card?.classList.add('just-completed');
    }
  }

  async function removeDream(id) {
    const user = await getUser();
    if (!user?.id) return;
    const list = parseList(user).filter(d => d.id !== id);
    await saveList(user, list);
    if (_updateBoardSection(parseList(_cachedUser || user))) {
      _updateHeroKpis(parseList(_cachedUser || user));
    } else {
      await render();
    }
    showToast('Sonho removido.', 'info');
  }

  function setFilter(filter) {
    _viewFilter = filter || 'all';
    const user = _cachedUser || (typeof currentUser !== 'undefined' ? currentUser : null);
    if (user && _updateBoardSection(parseList(user))) return;
    render();
  }

  async function openLightbox(dreamId) {
    const user = _cachedUser || (typeof currentUser !== 'undefined' ? currentUser : await getUser());
    const dream = parseList(user).find(d => d.id === dreamId);
    const src = photoSrc(dream);
    if (!src) return;
    const box = document.getElementById('painelSonhosLightbox');
    const img = document.getElementById('painelSonhosLightboxImg');
    const cap = document.getElementById('painelSonhosLightboxCaption');
    if (!box || !img) return;
    img.src = src;
    img.alt = dream?.title || 'Sonho';
    if (cap) cap.textContent = dream?.title || '';
    box.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox(ev) {
    if (ev && ev.target && !ev.target.classList.contains('painel-sonhos-lightbox') && !ev.target.classList.contains('painel-sonhos-lightbox__close')) return;
    const box = document.getElementById('painelSonhosLightbox');
    if (box) box.hidden = true;
    document.body.style.overflow = '';
  }

  function applyEmployeeNav(role) {
    const show = eligible(role);
    document.querySelectorAll('.nav-inicio, .nav-item[data-section="secInicio"]').forEach(el => {
      el.style.display = show ? '' : 'none';
    });
    document.querySelectorAll('.nav-inicio-label, .sidebar-section-label.nav-inicio-label').forEach(el => {
      el.style.display = show ? '' : 'none';
    });
    const sec = document.getElementById('secInicio');
    if (sec) {
      if (!show) {
        sec.style.display = 'none';
        sec.classList.remove('active');
      } else {
        sec.style.display = '';
      }
    }
  }

  function applyAdminNav(role) {
    const show = eligible(role);
    document.querySelectorAll('.nav-inicio, .nav-item[data-section="secInicio"]').forEach(el => {
      el.style.display = show ? '' : 'none';
    });
    document.querySelectorAll('.nav-inicio-label, .sidebar-section-label.nav-inicio-label').forEach(el => {
      el.style.display = show ? '' : 'none';
    });
    const sec = document.getElementById('secInicio');
    if (sec) sec.style.display = show ? '' : 'none';
  }

  function shouldLandOnInicio(role, opts = {}) {
    let result = true;
    let reason = 'eligible';
    if (!eligible(role)) { result = false; reason = 'not_eligible'; }
    else if (opts.lojaMode || opts.perfilMode || opts.previewMode) { result = false; reason = 'mode_flag'; }
    else if (opts.partnerOrg || opts.partnerLanding) { result = false; reason = 'partner'; }
    else if (opts.canMasterPanel || opts.canPartnerDashboard || opts.canDashboard) { result = false; reason = 'master_or_dash'; }
    return result;
  }

  function renderProfileTeaser() {
    const header = document.getElementById('profileHeader');
    if (!header?.parentNode) return;
    let el = document.getElementById('painelSonhosProfileTeaser');
    const user = currentUser;
    if (!user || !eligible(user.role)) {
      el?.remove();
      return;
    }
    const dreams = parseList(user);
    const open = dreams.filter(d => !d.done).length;
    const thumbs = dreams.filter(d => photoSrc(d)).slice(0, 3);
    const thumbsHtml = thumbs.length
      ? `<div class="painel-sonhos-teaser__thumbs">${thumbs.map(d => `<img src="${escAttr(photoSrc(d))}" alt=""/>`).join('')}</div>`
      : '<span class="painel-sonhos-teaser__emoji">✨</span>';

    if (!el) {
      el = document.createElement('div');
      el.id = 'painelSonhosProfileTeaser';
      header.parentNode.insertBefore(el, header);
    }
    el.innerHTML = `
      <div class="card card-padded painel-sonhos-teaser">
        <div class="painel-sonhos-teaser__row">
          ${thumbsHtml}
          <div class="painel-sonhos-teaser__text">
            <div class="painel-sonhos-teaser__title">Painel dos Sonhos</div>
            <div class="painel-sonhos-teaser__sub">${greeting()}, ${esc(firstName(user.name))}! ${open} ${open === 1 ? 'sonho' : 'sonhos'} em andamento.</div>
          </div>
          <button type="button" class="btn btn-primary btn-sm" onclick="navigateTo('secInicio'); if(window.PainelSonhos) PainelSonhos.render('painelSonhosRoot');">Ver mural</button>
        </div>
      </div>`;
  }

  function renderAll(rootId = 'painelSonhosRoot') {
    return render(rootId);
  }

  function init() {
    return renderAll();
  }

  async function deleteDream(id) {
    return removeDream(id);
  }

  return {
    eligible,
    eligibleOnHub,
    shouldShowOnSecondaryHub,
    hasMasterPanelAccess,
    canManageAvisos,
    canPostAvisos,
    shouldShowAvisos,
    greeting,
    render,
    renderAll,
    init,
    renderProfileTeaser,
    addDream,
    toggleDone,
    removeDream,
    deleteDream,
    attachPhoto,
    onPhotoPick,
    clearPhotoPreview,
    setFilter,
    openLightbox,
    closeLightbox,
    onDreamImageError,
    openDreamModal,
    closeDreamModal,
    openDreamPhotoCadastro,
    cancelDreamEdit,
    focusNewDreamForm,
    openAvisoEditor,
    closeAvisoEditor,
    saveAviso,
    removeAviso,
    toggleMuralLike,
    markMuralRead,
    toggleMuralComments,
    toggleMuralReaders,
    submitMuralComment,
    removeMuralComment,
    onAvisoImagePick,
    clearAvisoImage,
    openAvisoImage,
    applyEmployeeNav,
    applyAdminNav,
    shouldLandOnInicio,
  };
})();

window.PainelSonhos = PainelSonhos;
