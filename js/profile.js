/* =============================================
   SOU + BLU – Perfil do colaborador (compartilhado)
   Usado em employee.html e admin.html (Meu Perfil)
   ============================================= */

var currentUser = null;

/** Usuário da área do colaborador (respeita ?preview= para admin visualizando vendedor). */
async function resolveEmployeeUser() {
  if (window.__PREVIEW_USER_ID__) {
    return await DB.getUser(window.__PREVIEW_USER_ID__);
  }
  return await Auth.getCurrentUser();
}
window.resolveEmployeeUser = resolveEmployeeUser;

function _profileRoleLabel(role) {
  const map = {
    fundador: 'Fundador', master: 'Master', desenvolvedor: 'Desenvolvimento / TI',
    gerente: 'Gerente', financeiro: 'Financeiro', financial: 'Financeiro',
    supervisor: 'Supervisor', sup_backoffice: 'Sup. Backoffice', backoffice: 'Backoffice',
    rh: 'RH', operacional: 'Operacional', parceiro: 'Parceiro',
    vendedor: 'Vendas', employee: 'Funcionário',
  };
  return map[role] || '';
}

const _PROFILE_MENU_SVG = {
  dots: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.75"/><circle cx="12" cy="12" r="1.75"/><circle cx="12" cy="19" r="1.75"/></svg>',
  user: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  mail: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z" opacity="0"/><path d="m4 8 8 5 8-5"/><rect x="4" y="4" width="16" height="16" rx="2"/></svg>',
  lock: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  camera: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
};

function _profileMenuHtml() {
  return `
    <div class="profile-menu-wrap">
      <button type="button" id="profileMenuTrigger" class="profile-menu-trigger" aria-label="Opções da conta" aria-expanded="false" aria-haspopup="true" onclick="toggleProfileMenu(event)">${_PROFILE_MENU_SVG.dots}</button>
      <div id="profileMenuDropdown" class="profile-menu-dropdown" role="menu" onclick="event.stopPropagation()">
        <button type="button" class="profile-menu-item" role="menuitem" onclick="profileMenuAction('name')">${_PROFILE_MENU_SVG.user}<span>Alterar nome</span></button>
        <button type="button" class="profile-menu-item" role="menuitem" onclick="profileMenuAction('email')">${_PROFILE_MENU_SVG.mail}<span>Alterar e-mail</span></button>
        <button type="button" class="profile-menu-item" role="menuitem" onclick="profileMenuAction('password')">${_PROFILE_MENU_SVG.lock}<span>Alterar senha</span></button>
        <div class="profile-menu-divider"></div>
        <button type="button" class="profile-menu-item" role="menuitem" onclick="profileMenuAction('photo')">${_PROFILE_MENU_SVG.camera}<span>Alterar foto</span></button>
      </div>
    </div>`;
}

function ensureProfileEditModals() {
  if (!document.getElementById('changePasswordModal')) {
    const pw = document.createElement('div');
    pw.innerHTML = `
<div class="modal-overlay" id="changePasswordModal">
  <div class="modal" style="max-width:420px;">
    <div class="modal-header"><h3>Alterar senha</h3><button type="button" class="modal-close" onclick="closeModal('changePasswordModal')"></button></div>
    <div class="modal-body">
      <div class="form-group"><label>Senha atual</label><input type="password" id="profilePwdCurrent" class="form-control" placeholder="Senha atual" autocomplete="current-password"/></div>
      <div class="form-group"><label>Nova senha</label><input type="password" id="profilePwdNew" class="form-control" placeholder="Nova senha" autocomplete="new-password"/></div>
      <div class="form-group"><label>Confirmar nova senha</label><input type="password" id="profilePwdConfirm" class="form-control" placeholder="Repita a nova senha" autocomplete="new-password"/></div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal('changePasswordModal')">Cancelar</button>
      <button type="button" class="btn btn-primary" onclick="saveProfilePassword()">Salvar</button>
    </div>
  </div>
</div>`;
    document.body.appendChild(pw.firstElementChild);
  }
  if (document.getElementById('editProfileNameModal')) return;
  const host = document.createElement('div');
  host.innerHTML = `
<div class="modal-overlay" id="editProfileNameModal">
  <div class="modal" style="max-width:420px;">
    <div class="modal-header"><h3>Alterar nome</h3><button type="button" class="modal-close" onclick="closeModal('editProfileNameModal')"></button></div>
    <div class="modal-body">
      <div class="form-group"><label>Nome completo</label><input type="text" id="editProfileNameInput" class="form-control" placeholder="Seu nome" autocomplete="name"/></div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal('editProfileNameModal')">Cancelar</button>
      <button type="button" class="btn btn-primary" onclick="saveProfileName()">Salvar</button>
    </div>
  </div>
</div>
<div class="modal-overlay" id="editProfileEmailModal">
  <div class="modal" style="max-width:420px;">
    <div class="modal-header"><h3>Alterar e-mail</h3><button type="button" class="modal-close" onclick="closeModal('editProfileEmailModal')"></button></div>
    <div class="modal-body">
      <div class="form-group"><label>Novo e-mail</label><input type="email" id="editProfileEmailInput" class="form-control" placeholder="email@empresa.com" autocomplete="email"/></div>
      <p style="font-size:12px;color:var(--color-text-muted);margin:0;">Use o mesmo e-mail para fazer login na plataforma.</p>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal('editProfileEmailModal')">Cancelar</button>
      <button type="button" class="btn btn-primary" onclick="saveProfileEmail()">Salvar</button>
    </div>
  </div>
</div>`;
  while (host.firstElementChild) document.body.appendChild(host.firstElementChild);
}

function closeProfileMenu() {
  const dd = document.getElementById('profileMenuDropdown');
  const btn = document.getElementById('profileMenuTrigger');
  if (dd) dd.classList.remove('is-open');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function toggleProfileMenu(ev) {
  ev?.stopPropagation();
  const dd = document.getElementById('profileMenuDropdown');
  const btn = document.getElementById('profileMenuTrigger');
  if (!dd || !btn) return;
  const open = dd.classList.toggle('is-open');
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function profileMenuAction(action) {
  closeProfileMenu();
  if (action === 'name') openEditProfileNameModal();
  else if (action === 'email') openEditProfileEmailModal();
  else if (action === 'password') openChangePasswordModal();
  else if (action === 'photo') document.getElementById('profilePhotoInput')?.click();
}

function openEditProfileNameModal() {
  ensureProfileEditModals();
  const u = currentUser;
  const el = document.getElementById('editProfileNameInput');
  if (el) el.value = u?.name || '';
  openModal('editProfileNameModal');
  setTimeout(() => el?.focus(), 120);
}

function openEditProfileEmailModal() {
  ensureProfileEditModals();
  const u = currentUser;
  const el = document.getElementById('editProfileEmailInput');
  if (el) el.value = u?.email || '';
  openModal('editProfileEmailModal');
  setTimeout(() => el?.focus(), 120);
}

async function _updateProfileSession(partial) {
  const s = Auth.getSession();
  if (!s) return;
  const next = { ...s, ...partial };
  const data = JSON.stringify(next);
  localStorage.setItem(Auth.SESSION_KEY, data);
  sessionStorage.setItem(Auth.SESSION_KEY, data);
}

async function saveProfileName() {
  const name = document.getElementById('editProfileNameInput')?.value?.trim();
  if (!name) { showToast('Informe o nome.', 'warning'); return; }
  const me = currentUser || await resolveEmployeeUser();
  if (!me?.id) { showToast('Sessão expirada.', 'error'); return; }
  showLoading('Salvando...');
  try {
    await DB.updateUser(me.id, { name });
    await _updateProfileSession({ name });
    currentUser = { ...me, name };
    if (typeof renderAdminSidebar === 'function') renderAdminSidebar(currentUser);
    if (typeof renderSidebar === 'function') renderSidebar();
    closeModal('editProfileNameModal');
    await renderProfile();
    if (typeof renderMyProfile === 'function') await renderMyProfile();
    showToast('Nome atualizado.', 'success');
  } catch (e) {
    console.error(e);
    showToast('Erro ao salvar nome.', 'error');
  } finally { hideLoading(); }
}

async function saveProfileEmail() {
  const email = document.getElementById('editProfileEmailInput')?.value?.trim().toLowerCase();
  if (!email) { showToast('Informe o e-mail.', 'warning'); return; }
  const me = currentUser || await resolveEmployeeUser();
  if (!me?.id) { showToast('Sessão expirada.', 'error'); return; }
  showLoading('Salvando...');
  try {
    await DB.updateUser(me.id, { email });
    await _updateProfileSession({ email });
    currentUser = { ...me, email };
    if (typeof renderAdminSidebar === 'function') renderAdminSidebar(currentUser);
    closeModal('editProfileEmailModal');
    await renderProfile();
    if (typeof renderMyProfile === 'function') await renderMyProfile();
    showToast('E-mail atualizado.', 'success');
  } catch (e) {
    console.error(e);
    showToast('Erro ao salvar e-mail.', 'error');
  } finally { hideLoading(); }
}

if (!window.__profileMenuDocBound) {
  window.__profileMenuDocBound = true;
  document.addEventListener('click', (e) => {
    const wrap = document.querySelector('.profile-menu-wrap');
    if (wrap && wrap.contains(e.target)) return;
    closeProfileMenu();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeProfileMenu(); });
}

window.toggleProfileMenu = toggleProfileMenu;
window.closeProfileMenu = closeProfileMenu;
window.profileMenuAction = profileMenuAction;
window.openEditProfileNameModal = openEditProfileNameModal;
window.openEditProfileEmailModal = openEditProfileEmailModal;
window.saveProfileName = saveProfileName;
window.saveProfileEmail = saveProfileEmail;

async function openWithdrawalModal() {
  if (typeof ensureWithdrawalFlowDom === 'function') await ensureWithdrawalFlowDom();
  currentUser = await resolveEmployeeUser();
  if (typeof userCanSacarPix === 'function') {
    const ok = await userCanSacarPix(currentUser);
    if (!ok) {
      const msg = currentUser?.role === 'parceiro'
        ? 'Saque PIX não liberado para este perfil. Verifique as permissões do parceiro ou contate o administrador.'
        : 'Saque PIX não liberado para este parceiro. O gestor SOU+BLU precisa ativar em Gestão de Parceiros → Liberar saque equipe.';
      showToast(msg, 'warning');
      return;
    }
  }
  if (typeof VendorTierPoints !== 'undefined' && VendorTierPoints.usesTierWithdrawRules(currentUser)) {
    const wd = VendorTierPoints.canWithdrawToday(currentUser);
    if (!wd.ok) {
      showToast(wd.msg, 'warning', 7000);
      return;
    }
  }
  const bal = typeof userWalletBalance === 'function'
    ? userWalletBalance(currentUser)
    : (currentUser.points || currentUser.balance || 0);
  const balEl = document.getElementById('withdrawBalance');
  if (balEl) balEl.textContent = formatCurrency(bal, currentUser);
  const moneyWallet = typeof userUsesMoneyWallet === 'function' && userUsesMoneyWallet(currentUser);
  const partnerWallet = typeof WithdrawalRules !== 'undefined' && WithdrawalRules._partnerWalletUser(currentUser);
  if (typeof WithdrawalRules !== 'undefined') {
    WithdrawalRules.initModalUI();
    const saved = WithdrawalRules.getSavedPayment(currentUser);
    WithdrawalRules.applySavedToForm(saved);
  } else {
    const saved = JSON.parse(localStorage.getItem('soublu_pix_' + currentUser.id) || '{}');
    if (saved.pix_key_type) {
      const typeEl = document.getElementById('pixKeyType');
      if (typeEl) typeEl.value = saved.pix_key_type;
      document.querySelectorAll('.pix-key-type-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('onclick')?.includes("'" + saved.pix_key_type + "'"));
      });
    }
    if (saved.pix_key)     document.getElementById('pixKey').value = saved.pix_key;
    if (saved.holder_name) document.getElementById('pixHolderName').value = saved.holder_name;
    if (saved.bank_name)   document.getElementById('pixBankName').value = saved.bank_name;
  }
  const amtEl = document.getElementById('withdrawAmount');
  if (amtEl) {
    if (moneyWallet) {
      amtEl.type = 'text';
      amtEl.inputMode = 'decimal';
      amtEl.autocomplete = 'off';
      amtEl.removeAttribute('min');
      amtEl.removeAttribute('step');
      if (partnerWallet) {
        amtEl.placeholder = 'Valor a sacar (taxa R$ 10 descontada)';
        amtEl.value = bal > 0 ? bal.toFixed(2).replace('.', ',') : '';
      } else {
        amtEl.placeholder = 'Mín. R$ 50,00';
        amtEl.value = '';
      }
    } else {
      amtEl.type = 'number';
      amtEl.min = '1';
      amtEl.step = '1';
      amtEl.placeholder = 'Ex: 1000';
      amtEl.value = '';
    }
  }
  if (typeof WithdrawalRules !== 'undefined') {
    WithdrawalRules.configureModalForUser(currentUser);
  }
  // #region agent log
  fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'97c411',location:'profile.js:openWithdrawalModal',message:'modal amount prepared',data:{bal,partnerWallet,moneyWallet,rawAmount:amtEl?.value||'',parsedAmount:typeof parseMoneyAmount==='function'?parseMoneyAmount(amtEl?.value):null},timestamp:Date.now(),hypothesisId:'H1',runId:'post-fix'})}).catch(()=>{});
  // #endregion
  openModal('withdrawalModal');
}

async function renderProfile() {
  const profileHeader = document.getElementById('profileHeader');
  if (!profileHeader) return;

  try {
    currentUser = await resolveEmployeeUser();
    if (!currentUser) return;

    const needProposals = !!document.getElementById('propDashboard');
    const txLimit = 20;
    const proposalQuery = needProposals && typeof DB.getProposals === 'function'
      ? DB.getProposals(currentUser.id, currentUser).catch(() => [])
      : Promise.resolve([]);
    const [txs, orders, proposalRows] = await Promise.all([
      DB.getTransactions(currentUser.id).catch(() => []),
      DB.getOrders(currentUser.id).catch(() => []),
      proposalQuery,
    ]);
    const normProp = (p) => (window.Proposals && typeof Proposals._normProposal === 'function')
      ? Proposals._normProposal(p)
      : p;
    const allProposals = (Array.isArray(proposalRows) ? proposalRows : (proposalRows?.items || []))
      .map(normProp);
    const myProposals = (allProposals || []).filter(p =>
      typeof DB._matchProposalToVendor === 'function'
        ? DB._matchProposalToVendor(p, currentUser)
        : String(p.vendorId || p.vendor_id || p.employee_id) === String(currentUser.id)
    );
    const txList = (txs || []).slice(0, txLimit);
    const earned = txList
      .filter(t => (typeof txIsCredit === 'function' ? txIsCredit(t) : t.type === 'credit'))
      .reduce((s, t) => s + (typeof txAmount === 'function' ? txAmount(t) : Number(t.amount) || 0), 0);
    const spent = txList
      .filter(t => !(typeof txIsCredit === 'function' ? txIsCredit(t) : t.type === 'credit'))
      .reduce((s, t) => s + (typeof txAmount === 'function' ? txAmount(t) : Number(t.amount) || 0), 0);
    const canSacar = typeof userCanSacarPix === 'function'
      ? await userCanSacarPix(currentUser)
      : true;
    let partnerSacarBlockedHint = '';
    if (!canSacar) {
      if (currentUser.role === 'parceiro') {
        partnerSacarBlockedHint = 'Saque PIX não está liberado neste cadastro de parceiro. O RH/Master pode ativar em Cadastrar Parceiro → Propostas e financeiro → Gestor parceiro — sacar via PIX.';
      } else if (typeof DB !== 'undefined' && typeof DB.getPartnerRootForUser === 'function') {
        try {
          const rootId = await DB.getPartnerRootForUser(currentUser.id);
          if (rootId) {
            partnerSacarBlockedHint = 'Saque PIX desta rede ainda não foi liberado pelo gestor SOU+BLU para este parceiro.';
          }
        } catch (_) { /* noop */ }
      }
    }
    const walletBal = typeof userWalletBalance === 'function'
      ? userWalletBalance(currentUser)
      : (currentUser.points ?? currentUser.balance ?? 0);
    const moneyWallet = typeof userUsesMoneyWallet === 'function' && userUsesMoneyWallet(currentUser);
    const walletLabel = moneyWallet ? 'saldo disponível (R$)' : 'pontos disponíveis';
    const fmtBal = formatCurrency(walletBal, currentUser);
    const photoClick = "document.getElementById('profilePhotoInput').click()";
    const photoHtml = typeof profileAvatarHtml === 'function'
      ? profileAvatarHtml(currentUser.name, currentUser.photo_url || currentUser.photo || '', '', photoClick)
      : (() => {
        const photo = typeof resolvePhotoUrl === 'function'
          ? resolvePhotoUrl(currentUser.photo_url || currentUser.photo || '')
          : (currentUser.photo_url || currentUser.photo || '');
        return photo
          ? `<img src="${String(photo).replace(/"/g, '&quot;')}" class="profile-avatar" style="object-fit:cover;cursor:pointer;" onclick="${photoClick}">`
          : `<div class="profile-avatar" style="cursor:pointer;" onclick="${photoClick}" title="Alterar foto">${getInitials(currentUser.name)}</div>`;
      })();
    ensureProfileEditModals();
    const roleLabel = _profileRoleLabel(currentUser.role) || currentUser.department || '';
    const metaLine = [roleLabel || currentUser.department, currentUser.matricula ? `Matrícula ${currentUser.matricula}` : ''].filter(Boolean).join(' · ');

    profileHeader.innerHTML = `
    ${_profileMenuHtml()}
    <div style="position:relative;flex-shrink:0;">${photoHtml}</div>
    <div style="flex:1;min-width:0;">
      <div class="profile-name">${currentUser.name}</div>
      <div class="profile-meta">${metaLine}</div>
      <div class="profile-meta">${currentUser.email}</div>
      <input type="file" id="profilePhotoInput" accept="image/*" style="display:none" onchange="uploadProfilePhoto(this)">
    </div>
    <div class="profile-coins profile-wallet-bank">
      <div class="profile-wallet-bank__top">
        <span class="profile-wallet-bank__brand">SOU+BLU</span>
        <span class="profile-wallet-bank__tag">Carteira digital</span>
      </div>
      <div class="big-points">${fmtBal}</div>
      <p class="profile-wallet-bank__label">${walletLabel}</p>
      <div class="profile-wallet-actions">
        ${canSacar ? `<button type="button" class="btn btn-primary btn-sm" onclick="openWithdrawalModal()">Sacar via PIX</button>` : ''}
      </div>
      ${canSacar ? '<p class="profile-wallet-hint">Transferência para sua chave PIX após aprovação Master e Financeiro. O extrato abaixo mostra entradas e saídas da carteira.</p>' : ''}
      ${partnerSacarBlockedHint ? `<p class="profile-wallet-hint">${partnerSacarBlockedHint}</p>` : ''}
    </div>`;

    let tierEl = document.getElementById('vendorTierProfileCard');
    if (!tierEl && profileHeader.parentNode) {
      tierEl = document.createElement('div');
      tierEl.id = 'vendorTierProfileCard';
      profileHeader.parentNode.insertBefore(tierEl, profileHeader.nextSibling);
    }
    if (tierEl) {
      const viewer = typeof Auth !== 'undefined' ? Auth.getSession() : null;
      const showTierBilling = typeof canViewRankingSalesValues === 'function'
        && canViewRankingSalesValues(viewer);
      if (
        showTierBilling
        && typeof VendorTierPoints !== 'undefined'
        && VendorTierPoints.appliesTo(currentUser)
      ) {
        const tierData = VendorTierPoints.normalizeData(currentUser);
        const paidProps = await VendorTierPoints.loadPaidProposals();
        const summary = VendorTierPoints.summaryForUser(currentUser, tierData, paidProps);
        tierEl.innerHTML = VendorTierPoints.renderProfileCard(summary);
        tierEl.style.display = '';
      } else {
        tierEl.innerHTML = '';
        tierEl.style.display = 'none';
      }
    }

    const toggleBlock = document.getElementById('ptsToggleBlock');
    if (toggleBlock) {
      toggleBlock.innerHTML = '';
      toggleBlock.style.display = 'none';
    }

    const txBox = document.getElementById('txList');
    if (txBox) {
      txBox.innerHTML = !(txs || []).length
        ? '<div class="text-muted text-center" style="padding:20px;">Nenhuma movimentação.</div>'
        : txList.map(t => {
          const isCr = t.type === 'credit';
          const txMetaLine = typeof formatTransactionMetaLine === 'function' ? formatTransactionMetaLine(t.meta) : '';
          const fmtTx = formatCurrency(typeof txAmount === 'function' ? txAmount(t) : t.amount, currentUser);
          return `<div class="tx-item"><div class="tx-icon ${isCr ? 'earn' : 'spend'}">${txTypeIcon(t.type)}</div><div class="tx-info"><div class="tx-title">${t.reason || '–'}</div>${txMetaLine ? `<div class="tx-date" style="font-size:12px;color:var(--color-text-muted);">${txMetaLine}</div>` : ''}<div class="tx-date">${formatDateTime(t.created_at || t.date)}</div></div><div class="tx-amount ${isCr ? 'earn' : 'spend'}">${isCr ? '+' : '−'}${fmtTx}</div></div>`;
        }).join('');
    }

    const profileStats = document.getElementById('profileStats');
    if (profileStats) {
      profileStats.innerHTML = `
    ${statCardHtml({ icon: 'trendUp', color: 'green', label: 'Total Recebido', value: formatCurrency(earned, currentUser), valueStyle: 'font-size:18px;' })}
    ${statCardHtml({ icon: 'trendDown', color: 'orange', label: 'Total Utilizado', value: formatCurrency(spent, currentUser), valueStyle: 'font-size:18px;' })}
    ${statCardHtml({ icon: 'orders', color: 'yellow', label: 'Pedidos', value: (orders || []).length, valueStyle: 'font-size:18px;' })}`;
    }

    const propDash = document.getElementById('propDashboard');
    const roles = ['vendedor', 'backoffice', 'supervisor', 'master', 'admin', 'operacional'];
    if (propDash && roles.includes(currentUser.role) && myProposals.length >= 0) {
      propDash.style.display = 'block';
      await _renderPropDashboard(myProposals);
    }

    await renderRoulettePanel();
  } catch (err) {
    console.error('[renderProfile]', err);
    showToast('Erro ao carregar perfil: ' + (err.message || 'tente novamente'), 'error');
  }
}

async function renderRoulettePanel() {
  if (!currentUser?.id || typeof DB?.getRouletteCoinsBalance !== 'function') return;
  if (typeof DB.canAccessRoulette === 'function' && !(await DB.canAccessRoulette(currentUser))) {
    document.getElementById('roulettePanel')?.remove();
    return;
  }
  const anchor = document.getElementById('profileStats') || document.getElementById('profileHeader');
  if (!anchor) return;

  let panel = document.getElementById('roulettePanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'roulettePanel';
    panel.className = 'card card-padded';
    panel.style.marginTop = '12px';
    if (anchor.parentNode) {
      anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    }
  }

  const coins = await DB.getRouletteCoinsBalance(currentUser.id).catch(() => 0);
  const unlimited = typeof DB.rouletteUnlimitedCoins === 'function' && DB.rouletteUnlimitedCoins();
  const coinsLabel = typeof DB.formatRouletteCoinsDisplay === 'function'
    ? DB.formatRouletteCoinsDisplay(coins)
    : Number(coins || 0).toLocaleString('pt-BR');
  const rulesPack = typeof DB.getRouletteRulesForUser === 'function'
    ? DB.getRouletteRulesForUser(currentUser)
    : { departmentLabel: currentUser.department || 'Geral', rules: [] };
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
      <div>
        <div style="font-family:var(--font-display);font-weight:800;font-size:18px;">🎰 Roleta Premiada</div>
        <div style="font-size:13px;color:var(--color-text-muted);">${rulesPack.departmentLabel} · ${rulesPack.rules?.length || 0} formas de ganhar moedas${unlimited ? ' · <strong>ilimitado</strong>' : ''}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:12px;color:var(--color-text-muted);">Moedas disponíveis</div>
        <div style="font-family:var(--font-display);font-size:28px;font-weight:900;color:var(--color-primary);">${coinsLabel}</div>
      </div>
    </div>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-primary btn-sm" onclick="spinRouletteNow()" ${!unlimited && coins < 1 ? 'disabled' : ''}>Girar roleta</button>
      <button class="btn btn-outline btn-sm" type="button" onclick="navigateTo('secRoleta'); if(window.RouletteUI) RouletteUI.renderRoulettePage();">Ver roleta completa</button>
      <div style="font-size:12px;color:var(--color-text-muted);align-self:center;">Critérios de moedas são por perfil/ação.</div>
    </div>
  `;
}

/* spinRouletteNow — definido em js/roulette-ui.js */

async function _renderPropDashboard(proposals) {
  const propKpisEl = document.getElementById('propKpis');
  if (propKpisEl) {
    propKpisEl.innerHTML = '<div class="text-muted text-center" style="padding:12px;grid-column:1/-1;">Carregando propostas…</div>';
  }
  const fmtR = v => v != null ? 'R$ ' + parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : 'R$ 0,00';
  const now = new Date();
  const mesAtual = now.getMonth();
  const anoAtual = now.getFullYear();

  const propAmt = (p) => (typeof DB !== 'undefined' && typeof DB.proposalAmount === 'function'
    ? DB.proposalAmount(p)
    : (parseFloat(p?.valorFinal ?? p?.valor_final ?? p?.valor) || 0));
  const isPaid = (p) => (typeof DB !== 'undefined' && typeof DB.isPaidProposal === 'function'
    ? DB.isPaidProposal(p)
    : String(p?.statusOp || p?.status || '').toUpperCase().includes('PAGO'));
  const billingDate = (p) => (typeof DB !== 'undefined' && typeof DB.proposalBillingDate === 'function'
    ? DB.proposalBillingDate(p)
    : new Date(p.createdAt || p.created_at || 0));

  const doMes = proposals.filter(p => {
    const d = billingDate(p);
    return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
  });
  const pagasMes = doMes.filter(isPaid);
  const pagasGeral = proposals.filter(isPaid);

  const totalFinalMes = pagasMes.reduce((s, p) => s + propAmt(p), 0);
  const totalGeral = pagasGeral.reduce((s, p) => s + propAmt(p), 0);

  const meRef = currentUser || await resolveEmployeeUser();
  const meUser = meRef || (Auth.getSession()?.id ? await DB.getUser(Auth.getSession().id).catch(() => null) : null);
  const meusPontos = meUser ? (meUser.points || meUser.balance || 0) : 0;

  const propKpis = document.getElementById('propKpis');
  if (propKpis && typeof statKpiHtml === 'function') {
    propKpis.innerHTML = [
      statKpiHtml({ icon: 'proposals', colorClass: 'blue', label: 'Propostas no Mês', value: doMes.length, valueColor: '#3b82f6' }),
      statKpiHtml({ icon: 'billing', colorClass: 'green', label: 'Valor Final Mês', value: fmtR(totalFinalMes), valueColor: '#10b981' }),
      statKpiHtml({ icon: 'chart', colorClass: 'teal', label: 'Total Faturado', value: fmtR(totalGeral), valueColor: '#06b6d4' }),
      statKpiHtml({ icon: 'trophy', colorClass: 'yellow', label: 'Meus Pontos', value: meusPontos.toLocaleString('pt-BR'), valueColor: '#f59e0b' }),
    ].join('');
  }

  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(anoAtual, mesAtual - i, 1);
    months.push({ label: d.toLocaleString('pt-BR', { month: 'short' }), m: d.getMonth(), y: d.getFullYear() });
  }
  const countByMonth = months.map(m => ({
    ...m,
    count: proposals.filter(p => {
      const d = new Date(p.createdAt || p.created_at || 0);
      return d.getMonth() === m.m && d.getFullYear() === m.y;
    }).length,
  }));
  const maxCount = Math.max(...countByMonth.map(m => m.count), 1);
  const chartMes = document.getElementById('chartMes');
  if (chartMes) {
    chartMes.innerHTML = countByMonth.map(m => {
      const pct = Math.round((m.count / maxCount) * 100);
      const isNow = m.m === mesAtual && m.y === anoAtual;
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
      <div style="font-size:11px;font-weight:700;color:${isNow ? 'var(--color-primary)' : 'var(--color-text-muted)'};">${m.count || ''}</div>
      <div style="width:100%;background:var(--color-surface-2);border-radius:6px 6px 0 0;height:120px;display:flex;align-items:flex-end;">
        <div style="width:100%;height:${Math.max(pct, 4)}%;background:${isNow ? 'var(--color-primary)' : 'var(--color-border)'};border-radius:6px 6px 0 0;transition:height .4s;"></div>
      </div>
      <div style="font-size:10px;color:var(--color-text-muted);text-transform:uppercase;">${m.label}</div>
    </div>`;
    }).join('');
  }

  const statusColors = {
    'Em Andamento': '#3b82f6', 'AG. BOLETO': '#f59e0b', 'AG. VÍDEO': '#8b5cf6',
    'PROPOSTA DIGITADA': '#06b6d4', 'AVERBADO': '#10b981', 'PAGO': '#22c55e',
    'Cancelado': '#ef4444', 'Pendenciado': '#f97316', 'AG. ASS TERMO': '#6366f1',
    'AG. QUITAÇÃO': '#14b8a6', 'BOLETO QUITADO': '#84cc16', 'AG. LIBERAÇÃO MARGEM': '#a855f7',
  };
  const statusCount = {};
  proposals.forEach(p => {
    const s = p.statusOp || p.status || 'Em Andamento';
    statusCount[s] = (statusCount[s] || 0) + 1;
  });
  const totalProp = proposals.length || 1;
  const chartStatus = document.getElementById('chartStatus');
  if (chartStatus) {
    chartStatus.innerHTML = !proposals.length
      ? '<div style="color:var(--color-text-muted);font-size:13px;padding:20px 0;">Nenhuma proposta ainda.</div>'
      : Object.entries(statusCount).sort((a, b) => b[1] - a[1]).map(([s, n]) => {
        const pct = Math.round((n / totalProp) * 100);
        const cor = statusColors[s] || '#64748b';
        return `<div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
            <span style="font-weight:600;">${s}</span>
            <span style="color:var(--color-text-muted);">${n} (${pct}%)</span>
          </div>
          <div style="background:var(--color-surface-2);border-radius:4px;height:8px;overflow:hidden;">
            <div style="height:8px;width:${pct}%;background:${cor};border-radius:4px;transition:width .4s;"></div>
          </div>
        </div>`;
      }).join('');
  }

  const mesNome = now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
  const listTitle = document.getElementById('propListTitle');
  if (listTitle) listTitle.textContent = `Propostas de ${mesNome} (${doMes.length})`;

  const listEl = document.getElementById('propListMes');
  if (!listEl) return;
  if (!doMes.length) {
    listEl.innerHTML = '<div style="color:var(--color-text-muted);font-size:13px;padding:16px 0;text-align:center;">Nenhuma proposta este mês.</div>';
    return;
  }
  doMes.sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at));
  listEl.innerHTML = doMes.map(p => {
    const statusCor = { PAGO: '#22c55e', AVERBADO: '#10b981', Cancelado: '#ef4444', Pendenciado: '#f97316' }[p.statusOp || p.status] || '#3b82f6';
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--color-border);">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:13px;">${p.numero || p.id}</div>
        <div style="font-size:12px;color:var(--color-text-muted);">${p.clientName || '—'} · ${p.product || '—'} / ${p.convenio || '—'}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-size:13px;font-weight:800;color:var(--color-success);">${fmtR(typeof DB !== 'undefined' && typeof DB.proposalAmount === 'function' ? DB.proposalAmount(p) : 0)}</div>
        <div style="font-size:11px;color:var(--color-text-muted);">${fmtR(p.valor)} ${parseFloat(p.desconto || 0) > 0 ? '- desc.' : ''}</div>
      </div>
      <div style="background:${statusCor}18;color:${statusCor};padding:3px 9px;border-radius:99px;font-size:11px;font-weight:700;white-space:nowrap;">${p.statusOp || p.status || '—'}</div>
    </div>`;
  }).join('');
}

async function saveShowPoints(val) {
  if (typeof isUserInPartnerNetworkSync === 'function' && isUserInPartnerNetworkSync(currentUser)) return;
  const role = currentUser?.role || Auth.getSession()?.role || '';
  if (typeof participatesInVendorRanking === 'function' && !participatesInVendorRanking(role)) return;
  await DB.updateUser(currentUser.id, { show_points: val });
  currentUser = await resolveEmployeeUser();
  if (currentUser) currentUser.show_points = val;

  const checkbox = document.getElementById('toggleShowPoints');
  if (checkbox) checkbox.checked = val;

  const slider = document.querySelector('.pts-toggle-slider');
  if (slider) {
    slider.style.background = val ? 'var(--color-primary)' : 'var(--color-border)';
    const knob = slider.querySelector('span');
    if (knob) knob.style.left = val ? '26px' : '4px';
  }

  if (document.getElementById('rankingList') && typeof renderRanking === 'function') {
    await renderRanking();
  }
  showToast(val ? '🏆 Seus pontos agora aparecem no ranking.' : '🔒 Seus pontos estão ocultos no ranking.', 'info');
}

function openChangePasswordModal() {
  ensureProfileEditModals();
  ['profilePwdCurrent', 'profilePwdNew', 'profilePwdConfirm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  openModal('changePasswordModal');
}

async function uploadProfilePhoto(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) { showToast('Imagem muito grande. Máx: 3MB.', 'warning'); return; }
  showLoading('Salvando foto...');
  try {
    const url = await uploadImage(file, 'profile-photos', currentUser.id);
    const updated = await DB.updateUser(currentUser.id, { photo_url: url });
    currentUser = updated || await DB.getUser(currentUser.id) || currentUser;
    if (typeof renderAdminSidebar === 'function') renderAdminSidebar(currentUser);
    if (typeof renderSidebar === 'function') renderSidebar();
    await renderProfile();
    showToast('Foto atualizada.', 'success');
  } catch (e) {
    console.error(e);
    showToast('Erro ao salvar foto.', 'error');
  } finally {
    hideLoading();
  }
}

async function saveProfilePassword() {
  const current = document.getElementById('profilePwdCurrent')?.value || '';
  const pwd = document.getElementById('profilePwdNew')?.value || '';
  const pwd2 = document.getElementById('profilePwdConfirm')?.value || '';
  if (!current) { showToast('Informe sua senha atual.', 'warning'); return; }
  if (!pwd) { showToast('Informe a nova senha.', 'warning'); return; }
  if (pwd.length < 4) { showToast('Nova senha: mínimo 4 caracteres.', 'warning'); return; }
  if (pwd !== pwd2) { showToast('As senhas não coincidem.', 'error'); return; }

  const me = await Auth.getCurrentUser();
  if (!me) { showToast('Sessão expirada. Faça login novamente.', 'error'); return; }
  if (!(await DB.verifyCurrentPassword(me.id, current))) { showToast('Senha atual incorreta.', 'error'); return; }

  showLoading('Alterando senha...');
  try {
    await DB.updateUser(me.id, { password: pwd });
    document.getElementById('profilePwdCurrent').value = '';
    document.getElementById('profilePwdNew').value = '';
    document.getElementById('profilePwdConfirm').value = '';
    closeModal('changePasswordModal');
    showToast('Senha alterada com sucesso!', 'success');
  } catch (e) {
    console.error(e);
    showToast('Erro ao alterar senha.', 'error');
  } finally {
    hideLoading();
  }
}
