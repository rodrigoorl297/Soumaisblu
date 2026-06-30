/* withdrawal flow */
let _wdIsFirst  = false;   // é o 1º saque?
let _termFaceAlreadyDone = false; // 1º saque: face já feita antes do termo
let _docFrontB64 = '';
let _docBackB64  = '';
let _faceHashCapturado = '';

/* ── PIX key selector ── */
function selectPixType(type, btn) {
  document.querySelectorAll('.pix-key-type-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else {
    document.querySelectorAll('.pix-key-type-btn').forEach((b) => {
      const oc = b.getAttribute('onclick') || '';
      if (oc.includes("'" + type + "'") || oc.includes('\\\'' + type + '\\\'')) b.classList.add('active');
    });
  }
  const typeEl = document.getElementById('pixKeyType');
  if (typeEl) typeEl.value = type;
  const labels       = {cpf:'CPF',cnpj:'CNPJ',email:'E-mail',phone:'Celular',random:'Chave Aleatória'};
  const placeholders = {cpf:'000.000.000-00',cnpj:'00.000.000/0001-00',email:'seu@email.com',phone:'(11) 99999-9999 ou +5511999999999',random:'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'};
  const labelEl = document.getElementById('pixKeyLabel');
  const keyEl = document.getElementById('pixKey');
  if (labelEl) labelEl.textContent = labels[type] || 'Chave PIX';
  if (keyEl) {
    keyEl.placeholder = placeholders[type] || '';
    keyEl.inputMode = type === 'email' ? 'email' : ((type === 'cpf' || type === 'cnpj' || type === 'phone') ? 'tel' : 'text');
    keyEl.autocomplete = type === 'email' ? 'email' : 'off';
    keyEl.removeAttribute('maxlength');
    if (type === 'cpf') keyEl.setAttribute('maxlength', '14');
    if (type === 'cnpj') keyEl.setAttribute('maxlength', '18');
  }
}
window.selectPixType = selectPixType;

/* ── PASSO 1 → próximo passo ── */
async function goToTermStep() {
  const rawAmt = document.getElementById('withdrawAmount').value;
  const moneyWallet = typeof userUsesMoneyWallet === 'function' && userUsesMoneyWallet(currentUser);
  const pay = typeof WithdrawalRules !== 'undefined'
    ? WithdrawalRules.readFormPayment()
    : { method: 'pix', pix: { pix_key_type: document.getElementById('pixKeyType')?.value, pix_key: document.getElementById('pixKey')?.value?.trim(), holder_name: document.getElementById('pixHolderName')?.value?.trim(), bank_name: document.getElementById('pixBankName')?.value?.trim() } };

  const formOk = typeof WithdrawalRules !== 'undefined'
    ? WithdrawalRules.validatePaymentForm(pay)
    : { ok: !!pay.pix?.pix_key && !!pay.pix?.holder_name };
  const amt = moneyWallet
    ? (typeof parseMoneyAmount === 'function' ? parseMoneyAmount(rawAmt) : parseFloat(rawAmt))
    : Math.max(0, Math.floor(Number(rawAmt)));
  // #region agent log
  fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'97c411',location:'withdrawal-flow.js:goToTermStep',message:'step1 validation',data:{rawAmt,amt,formOk,moneyWallet,pixKey:pay.pix?.pix_key||'',holderName:pay.pix?.holder_name||''},timestamp:Date.now(),hypothesisId:'H1-H3',runId:'post-fix'})}).catch(()=>{});
  // #endregion
  if (!formOk.ok) { showToast(formOk.msg || 'Dados de pagamento incompletos.', 'warning'); return; }

  if (!amt || amt <= 0) {
    showToast(moneyWallet ? 'Informe o valor em reais.' : 'Informe a quantidade de pontos.', 'warning');
    return;
  }

  window._wdPaymentDraft = pay;

  if (moneyWallet && typeof WithdrawalRules !== 'undefined') {
    const ev = await WithdrawalRules.evaluate(currentUser.id, amt, currentUser);
    // #region agent log
    fetch('http://127.0.0.1:7816/ingest/dedb3b14-4a31-406e-8669-bb6fd84699d1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'97c411',location:'withdrawal-flow.js:goToTermStep',message:'evaluate result',data:{amt,ok:ev.ok,msg:ev.msg||null,partnerFee:ev.partnerFee,irpjTax:ev.irpjTax,netAmount:ev.netAmount},timestamp:Date.now(),hypothesisId:'H4',runId:'post-fix'})}).catch(()=>{});
    // #endregion
    if (!ev.ok) { showToast(ev.msg, 'error', 6000); return; }
    window._wdCalc = ev;
  } else {
    if (typeof VendorTierPoints !== 'undefined' && VendorTierPoints.usesTierWithdrawRules(currentUser)) {
      const wd = VendorTierPoints.canWithdrawToday(currentUser);
      if (!wd.ok) { showToast(wd.msg, 'warning', 7000); return; }
    }
    const bal = typeof userWalletBalance === 'function' ? userWalletBalance(currentUser) : (currentUser.points || 0);
    const tol = moneyWallet ? 0.001 : 0;
    if (amt > bal + tol) {
      showToast(`Saldo insuficiente. Disponível: ${formatCurrency(bal, currentUser)}.`, 'error');
      return;
    }
    window._wdCalc = { netAmount: amt, irpfTax: 0, totalDebit: amt };
  }

  const pixKey = pay.pix?.pix_key;
  const holderName = pay.pix?.holder_name;
  const pixType = pay.pix?.pix_key_type || 'cpf';

  const skipFace = typeof withdrawalSkipsFacialVerification === 'function'
    && withdrawalSkipsFacialVerification(currentUser);

  if (currentUser.face_hash === 'SKIP') {
    _wdIsFirst = false;
    closeModal('withdrawalModal');
    openTermScreen(amt, pixType, pixKey, holderName);
    return;
  }

  try { _wdIsFirst = await DB.isFirstWithdrawal(currentUser.id); } catch { _wdIsFirst = false; }

  closeModal('withdrawalModal');

  if (skipFace && !_wdIsFirst) {
    _termFaceAlreadyDone = false;
    openTermScreen(amt, pixType, pixKey, holderName);
    return;
  }

  if (_wdIsFirst) {
    // 1º saque: vai para cadastro de documento primeiro
    _termFaceAlreadyDone = false;
    _docFrontB64 = '';
    _docBackB64  = '';
    document.getElementById('docFrontImg').style.display = 'none';
    document.getElementById('docFrontImg').src = '';
    document.getElementById('docFrontPlaceholder').style.display = '';
    document.getElementById('docFrontPreviewWrap').style.borderColor = 'var(--color-border)';
    document.getElementById('docFrontPreviewWrap').style.borderStyle = 'dashed';
    const fst = document.getElementById('docFrontStatus'); if(fst) fst.style.display='none';
    document.getElementById('docBackImg').style.display  = 'none';
    document.getElementById('docBackImg').src = '';
    document.getElementById('docBackPlaceholder').style.display  = '';
    document.getElementById('docBackPreviewWrap').style.borderColor = 'var(--color-border)';
    document.getElementById('docBackPreviewWrap').style.borderStyle = 'dashed';
    const bst = document.getElementById('docBackStatus'); if(bst) bst.style.display='none';
    // Scroll para o topo da área de documento
    const dc = document.getElementById('docContent'); if(dc) dc.scrollTop = 0;
    document.getElementById('docTypeValue').value = 'rg';
    selectDocType('rg');
    document.getElementById('docScreen').classList.add('open');
  } else {
    // Demais saques: vai direto para o termo
    _termFaceAlreadyDone = false;
    openTermScreen(amt, pixType, pixKey, holderName);
  }
}

/* ── Documento ── */
function selectDocType(type) {
  document.getElementById('docTypeValue').value = type;
  document.getElementById('docTypeRG').className  = type==='rg'  ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
  document.getElementById('docTypeCNH').className = type==='cnh' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
}

function previewDoc(side, input) {
  const file = input.files[0]; if (!file) return;
  if (file.size > 5*1024*1024) { showToast('Imagem muito grande. Máx 5MB.','warning'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const b64 = e.target.result;
    if (side === 'front') {
      _docFrontB64 = b64;
      document.getElementById('docFrontImg').src = b64;
      document.getElementById('docFrontImg').style.display = '';
      document.getElementById('docFrontPlaceholder').style.display = 'none';
      const st = document.getElementById('docFrontStatus');
      if (st) st.style.display = '';
      // Borda verde para indicar sucesso
      document.getElementById('docFrontPreviewWrap').style.borderColor = 'var(--color-success)';
      document.getElementById('docFrontPreviewWrap').style.borderStyle = 'solid';
    } else {
      _docBackB64 = b64;
      document.getElementById('docBackImg').src = b64;
      document.getElementById('docBackImg').style.display = '';
      document.getElementById('docBackPlaceholder').style.display = 'none';
      const st = document.getElementById('docBackStatus');
      if (st) st.style.display = '';
      document.getElementById('docBackPreviewWrap').style.borderColor = 'var(--color-success)';
      document.getElementById('docBackPreviewWrap').style.borderStyle = 'solid';
    }
  };
  reader.readAsDataURL(file);
}

function closeDocScreen() {
  document.getElementById('docScreen').classList.remove('open');
  openModal('withdrawalModal');
}

function goToFaceStepFromDoc() {
  if (!_docFrontB64) { showToast('Envie a frente do documento.','warning'); return; }
  if (!_docBackB64)  { showToast('Envie o verso do documento.','warning'); return; }
  document.getElementById('docScreen').classList.remove('open');
  if (typeof withdrawalSkipsFacialVerification === 'function' && withdrawalSkipsFacialVerification(currentUser)) {
    _termFaceAlreadyDone = true;
    const rawAmt = document.getElementById('withdrawAmount').value;
    const amount = typeof parseMoneyAmount === 'function' ? parseMoneyAmount(rawAmt) : parseFloat(rawAmt);
    const pixType = document.getElementById('pixKeyType').value;
    const pixKey = document.getElementById('pixKey').value.trim();
    const holderName = document.getElementById('pixHolderName').value.trim();
    openTermScreen(amount, pixType, pixKey, holderName);
    return;
  }
  // Documento OK — reconhecimento facial (demais perfis)
  // Atualizar título do face screen para indicar cadastro
  document.querySelector('#faceScreen .term-header h2').textContent = '📸 Cadastro de Biometria Facial';
  document.querySelector('#faceScreen .term-header p').textContent  = 'Esta é sua biometria de segurança. Será usada para verificar sua identidade em todos os saques futuros.';
  _faceHashCapturado = '';
  document.getElementById('faceScreen').classList.add('open');
  _faceDone = false;
  resetFaceUI();
  startCamera();
}

/* ── Termo ── */
function openTermScreen(amount, pixType, pixKey, holderName) {
  const calc = window._wdCalc || {};
  const requested = calc.requestedAmount != null ? calc.requestedAmount : (typeof parseMoneyAmount === 'function' ? parseMoneyAmount(amount) : amount);
  const amtDisp = calc.netAmount != null ? calc.netAmount : requested;
  document.getElementById('termAmount').textContent = formatCurrency(amtDisp, currentUser);
  const pay = window._wdPaymentDraft || {};
  const payLabel = pay.method === 'conta' ? 'Conta corrente' : `PIX ${String(pixType || '').toUpperCase()}`;
  document.getElementById('termPixSummary').textContent = `${payLabel} — ${pixKey}`;
  const clause2 = document.getElementById('termClauseTransfer');
  if (clause2) {
    clause2.innerHTML = pay.method === 'conta'
      ? 'O pagamento será realizado via <strong>transferência para conta corrente</strong> (dados informados nesta solicitação). É de responsabilidade exclusiva do solicitante garantir que banco, agência, conta e titular estão corretos e atualizados.'
      : 'O pagamento será realizado via <strong>transferência PIX</strong> para a chave informada nesta solicitação. É de responsabilidade exclusiva do solicitante garantir que os dados bancários estão corretos e atualizados.';
  }
  let feeClause = document.getElementById('termClausePartnerFee');
  const scrollArea = document.getElementById('termScrollArea');
  if (calc.partnerFee > 0) {
    const feeTxt = typeof formatMoney === 'function' ? formatMoney(calc.partnerFee) : `R$ ${calc.partnerFee}`;
    const reqTxt = typeof formatMoney === 'function' ? formatMoney(requested) : String(requested);
    if (!feeClause && scrollArea) {
      const block = document.createElement('div');
      block.id = 'termClausePartnerFee';
      block.style.cssText = 'border-left:3px solid var(--color-warning);padding-left:16px;margin-bottom:20px;';
      block.innerHTML = `<p style="font-weight:700;margin-bottom:8px;color:var(--color-text);">Cláusula — Taxa administrativa (parceiro)</p>
        <p style="font-size:13px;line-height:1.8;color:var(--color-text-secondary);">Sobre o valor solicitado de <strong>${reqTxt}</strong>, será descontada taxa administrativa de <strong>${feeTxt}</strong>. O crédito via PIX será do valor líquido após essa dedução.</p>`;
      const transfer = document.getElementById('termClauseTransfer');
      if (transfer && transfer.parentElement) {
        transfer.parentElement.insertAdjacentElement('afterend', block);
      } else {
        scrollArea.querySelector('div[style*="max-width"]')?.appendChild(block);
      }
      feeClause = block;
    } else if (feeClause) {
      feeClause.style.display = '';
      feeClause.querySelector('p:last-child').innerHTML = `Sobre o valor solicitado de <strong>${reqTxt}</strong>, será descontada taxa administrativa de <strong>${feeTxt}</strong>. O crédito via PIX será do valor líquido após essa dedução.`;
    }
  } else if (feeClause) {
    feeClause.style.display = 'none';
  }
  let holderHtml = `Titular: <strong>${holderName}</strong>`;
  if (calc.partnerFee > 0 || calc.irpjTax > 0) {
    holderHtml += `<div style="margin-top:8px;font-size:13px;color:var(--color-warning);">
      Valor solicitado: <strong>${typeof formatMoney === 'function' ? formatMoney(requested) : requested}</strong><br>`;
    if (calc.partnerFee > 0) {
      holderHtml += `Taxa administrativa: <strong>− ${typeof formatMoney === 'function' ? formatMoney(calc.partnerFee) : calc.partnerFee}</strong><br>`;
    }
    if (calc.irpjTax > 0) {
      const rateLbl = calc.irpjRate ? ` (${String(calc.irpjRate).replace('.', ',')}%)` : '';
      holderHtml += `Retenção IRPJ${rateLbl}: <strong>− ${typeof formatMoney === 'function' ? formatMoney(calc.irpjTax) : calc.irpjTax}</strong><br>`;
    }
    holderHtml += `Valor líquido PIX: <strong>${formatCurrency(amtDisp, currentUser)}</strong>
    </div>`;
  }
  if (calc.irpfTax > 0) {
    holderHtml += `<div style="margin-top:8px;font-size:13px;color:var(--color-warning);">
      Retenção IRPF (3,5%): <strong>${formatMoney(calc.irpfTax)}</strong><br>
      Total debitado do saldo: <strong>${formatMoney(calc.totalDebit)}</strong>
    </div>`;
  }
  document.getElementById('termHolder').innerHTML = holderHtml;
  document.getElementById('termFinalCheck').checked    = false;
  document.getElementById('termFinalCheck').disabled   = true;
  document.getElementById('termConfirmBtn').disabled   = true;
  document.getElementById('termProgressFill').style.width = '0%';
  document.getElementById('termScrollHint').classList.remove('hidden');
  document.getElementById('termCheckLabel').classList.remove('unlocked');
  document.getElementById('termScrollArea').scrollTop = 0;
  const confirmBtn = document.getElementById('termConfirmBtn');
  const skipFace = typeof withdrawalSkipsFacialVerification === 'function'
    && withdrawalSkipsFacialVerification(currentUser);
  if (_termFaceAlreadyDone || skipFace) {
    confirmBtn.textContent = 'Confirmar e Enviar Saque ✓';
  } else {
    confirmBtn.textContent = 'Confirmar e Verificar Identidade 📸';
  }
  if (skipFace) {
    document.querySelectorAll('#termScrollArea > div > div').forEach(el => {
      const t = el.textContent || '';
      if (/reconhecimento facial|biometria facial|verifica[cç][aã]o facial/i.test(t)) el.style.display = 'none';
    });
  }
  document.getElementById('termFullscreen').classList.add('open');
  setupTermScroll();
}

function confirmTermStep() {
  const skipFace = typeof withdrawalSkipsFacialVerification === 'function'
    && withdrawalSkipsFacialVerification(currentUser);
  if (_termFaceAlreadyDone || skipFace) {
    document.getElementById('termFullscreen').classList.remove('open');
    executeWithdrawal();
    return;
  }
  goToFaceStep();
}

// Controle de scroll do termo — sem clonar DOM
let _termScrollUnlocked = false;
let _termScrollHandler  = null;
let _termCheckHandler   = null;

function setupTermScroll() {
  const area       = document.getElementById('termScrollArea');
  const fill       = document.getElementById('termProgressFill');
  const hint       = document.getElementById('termScrollHint');
  const checkLbl   = document.getElementById('termCheckLabel');
  const checkInp   = document.getElementById('termFinalCheck');
  const confirmBtn = document.getElementById('termConfirmBtn');

  // Remover listeners anteriores sem clonar DOM
  if (_termScrollHandler) area.removeEventListener('scroll', _termScrollHandler);
  if (_termCheckHandler)  checkInp.removeEventListener('change', _termCheckHandler);

  _termScrollUnlocked = false;

  _termScrollHandler = function() {
    const { scrollTop, scrollHeight, clientHeight } = area;
    // Evitar divisão por zero quando conteúdo não é maior que container
    const scrollable = scrollHeight - clientHeight;
    const pct = scrollable <= 0
      ? 100
      : Math.min(100, Math.round((scrollTop / scrollable) * 100));
    fill.style.width = pct + '%';
    if (pct >= 95 && !_termScrollUnlocked) {
      _termScrollUnlocked = true;
      hint.classList.add('hidden');
      checkLbl.classList.add('unlocked');
      checkInp.disabled = false;
      checkInp.focus();
    }
  };

  _termCheckHandler = function() {
    confirmBtn.disabled = !checkInp.checked;
  };

  area.addEventListener('scroll', _termScrollHandler, { passive: true });
  checkInp.addEventListener('change', _termCheckHandler);

  // Se o conteúdo cabe inteiro na tela (sem necessidade de scroll), desbloquear imediatamente
  requestAnimationFrame(() => {
    const { scrollHeight, clientHeight } = area;
    if (scrollHeight <= clientHeight) {
      _termScrollUnlocked = true;
      hint.classList.add('hidden');
      checkLbl.classList.add('unlocked');
      checkInp.disabled = false;
    }
  });
}

function termCheckClick() {
  const inp = document.getElementById('termFinalCheck');
  if (inp.disabled) return;
  inp.checked = !inp.checked;
  inp.dispatchEvent(new Event('change'));
}

function closeTermFullscreen() {
  _termFaceAlreadyDone = false;
  document.getElementById('termFullscreen').classList.remove('open');
  openModal('withdrawalModal');
}

/* ── Face após termo (demais saques) ── */
function goToFaceStep() {
  if (currentUser.face_hash === 'SKIP'
    || (typeof withdrawalSkipsFacialVerification === 'function' && withdrawalSkipsFacialVerification(currentUser))) {
    document.getElementById('termFullscreen').classList.remove('open');
    _faceHashCapturado = currentUser.face_hash === 'SKIP' ? 'SKIP' : '';
    executeWithdrawal();
    return;
  }
  document.getElementById('termFullscreen').classList.remove('open');
  document.querySelector('#faceScreen .term-header h2').textContent = '📸 Verificação de Identidade';
  document.querySelector('#faceScreen .term-header p').textContent  = 'Posicione seu rosto no centro da câmera';
  _faceHashCapturado = '';
  document.getElementById('faceScreen').classList.add('open');
  _faceDone = false;
  resetFaceUI();
  startCamera();
}

/* ── Câmera ── */
let _faceStream = null;
let _faceDone   = false;

function resetFaceUI() {
  document.getElementById('faceStepScanning').style.display = '';
  // Esconder e resetar animação do ok
  const okEl = document.getElementById('faceStepOk');
  okEl.style.display = 'none';
  // Forçar reflow para resetar animação CSS
  const check = okEl.querySelector('.face-big-check');
  if (check) { check.style.animation = 'none'; check.offsetHeight; check.style.animation = ''; }
  document.getElementById('faceStepError').style.display    = 'none';
  document.getElementById('faceVideoWrap').className        = 'face-video-wrap';
  document.getElementById('faceStatus').textContent         = 'Iniciando câmera...';
  document.getElementById('faceStatus').className           = 'face-status';
  document.getElementById('faceProgressFill').style.width   = '0%';
}

async function startCamera() {
  try {
    _faceStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'user', width:640 }, audio:false });
    const video = document.getElementById('faceVideo');
    video.srcObject = _faceStream;
    await video.play();
    setTimeout(startScan, 800);
  } catch(err) {
    console.warn('Câmera indisponível:', err);
    document.getElementById('faceStepScanning').style.display = 'none';
    document.getElementById('faceStepError').style.display    = '';
  }
}

function startScan() {
  const wrap   = document.getElementById('faceVideoWrap');
  const status = document.getElementById('faceStatus');
  const prog   = document.getElementById('faceProgressFill');
  wrap.classList.add('scanning');
  status.classList.add('scanning');
  const messages = [
    { t:0,    txt:'Detectando rosto...',      pct:0   },
    { t:1200, txt:'Analisando biometria...',  pct:30  },
    { t:2400, txt:'Verificando identidade...', pct:60 },
    { t:3600, txt:'Confirmando dados...',     pct:85  },
    { t:4500, txt:'Biometria confirmada!',    pct:100 },
  ];
  messages.forEach(m => setTimeout(() => {
    if (_faceDone) return;
    status.textContent = m.txt;
    prog.style.width   = m.pct + '%';
  }, m.t));

  setTimeout(() => {
    if (_faceDone) return;
    _faceDone = true;

    // Hash simulado por usuário — em produção substituir por ML real
    _faceHashCapturado = 'face_' + currentUser.id;

    wrap.classList.remove('scanning'); wrap.classList.add('ok');
    status.classList.remove('scanning'); status.classList.add('ok');
    stopCamera();
    setTimeout(showFaceSuccess, 400);
  }, 5200);
}

function showFaceSuccess() {
  document.getElementById('faceStepScanning').style.display = 'none';
  document.getElementById('faceStepOk').style.display       = '';

  if (_wdIsFirst) {
    // 1º saque: face cadastrada → fecha face screen e vai pro termo (último passo antes de enviar)
    setTimeout(() => {
      document.getElementById('faceScreen').classList.remove('open');
      resetFaceUI(); // resetar para próximo uso
      _termFaceAlreadyDone = true;
      const rawAmt     = document.getElementById('withdrawAmount').value;
      const amount     = typeof parseMoneyAmount === 'function' ? parseMoneyAmount(rawAmt) : parseFloat(rawAmt);
      const pixType    = document.getElementById('pixKeyType').value;
      const pixKey     = document.getElementById('pixKey').value.trim();
      const holderName = document.getElementById('pixHolderName').value.trim();
      openTermScreen(amount, pixType, pixKey, holderName);
    }, 1600);
  } else {
    // Demais saques: executar saque (fecha telas dentro do executeWithdrawal)
    setTimeout(async () => {
      await executeWithdrawal();
      resetFaceUI(); // resetar após uso
    }, 1600);
  }
}

function faceSkip() {
  // Reconhecimento facial obrigatório em todos os saques — não permitir pular
  showToast('⛔ O reconhecimento facial é obrigatório para garantir a segurança do seu saque.', 'error', 5000);
}

function stopCamera() {
  if (_faceStream) { _faceStream.getTracks().forEach(t=>t.stop()); _faceStream=null; }
  const v = document.getElementById('faceVideo'); if(v) v.srcObject=null;
}

function cancelFaceStep() {
  stopCamera(); _faceDone=false; _faceHashCapturado='';
  document.getElementById('faceScreen').classList.remove('open');
  if (_wdIsFirst) {
    // Voltar para o documento
    document.getElementById('docScreen').classList.add('open');
  } else {
    // Voltar para o termo
    document.getElementById('termFullscreen').classList.add('open');
  }
}

/* ── Executar o saque ── */
async function executeWithdrawal() {
  const amountEl = document.getElementById('withdrawAmount');
  const pixKeyTypeEl = document.getElementById('pixKeyType');
  const pixKeyEl = document.getElementById('pixKey');
  const holderEl = document.getElementById('pixHolderName');
  const bankEl = document.getElementById('pixBankName');

  if (!amountEl || !currentUser?.id) {
    showToast('Formulário de saque incompleto. Recarregue a página (Ctrl+F5).', 'error');
    return;
  }

  const moneyWallet = typeof userUsesMoneyWallet === 'function' && userUsesMoneyWallet(currentUser);
  const calc = window._wdCalc || {};

  const payDraft = window._wdPaymentDraft || (typeof WithdrawalRules !== 'undefined'
    ? WithdrawalRules.readFormPayment()
    : null);
  if (!pixKeyTypeEl || !pixKeyEl || !holderEl) {
    showToast('Formulário de saque incompleto. Recarregue a página (Ctrl+F5).', 'error');
    return;
  }

  const amount = moneyWallet
    ? (typeof parseMoneyAmount === 'function'
      ? parseMoneyAmount(amountEl.value)
      : Math.round(Number(amountEl.value) * 100) / 100)
    : Math.max(0, Math.floor(Number(amountEl.value) || calc.netAmount || 0));
  const pixKeyType = pixKeyTypeEl.value;
  const pixKey     = pixKeyEl.value.trim();
  const holderName = holderEl.value.trim();
  const bankName   = bankEl?.value?.trim() || '';

  if (!Number.isFinite(amount) || amount <= 0) {
    showToast(moneyWallet ? 'Informe o valor em reais.' : 'Informe a quantidade de pontos.', 'warning');
    return;
  }

  const formOk = typeof WithdrawalRules !== 'undefined'
    ? WithdrawalRules.validatePaymentForm(payDraft)
    : { ok: !!pixKey && !!holderName };
  if (!formOk.ok) { showToast(formOk.msg, 'warning'); return; }

  const skipFace = typeof withdrawalSkipsFacialVerification === 'function'
    && withdrawalSkipsFacialVerification(currentUser);
  const savedHash = currentUser.face_hash || '';
  if (!skipFace && !_wdIsFirst && savedHash && savedHash !== 'SKIP' && _faceHashCapturado && savedHash !== _faceHashCapturado) {
    document.getElementById('faceScreen')?.classList.remove('open');
    showToast('⛔ Biometria não reconhecida. Por segurança, o saque foi bloqueado. Procure o RH.','error', 8000);
    return;
  }

  let withdrawalOk = false;
  try {
    const savePay = document.getElementById('wdSavePayment')?.checked !== false;
    if (savePay && typeof WithdrawalRules !== 'undefined') {
      const toSave = payDraft || WithdrawalRules.readFormPayment();
      await WithdrawalRules.savePaymentProfile(currentUser.id, {
        method: toSave.method,
        pix: toSave.pix || {},
        bank: toSave.bank || {},
      });
    } else {
      localStorage.setItem('soublu_pix_' + currentUser.id,
        JSON.stringify({ pix_key_type:pixKeyType, pix_key:pixKey, holder_name:holderName, bank_name:bankName }));
    }

    const reqPayload = {
      method: 'pix',
      pix_key_type: pixKeyType,
      pix_key: pixKey,
      holder_name: holderName,
      bank_name: bankName,
      bank: null,
      face_hash:   _faceHashCapturado,
      doc_verified: _wdIsFirst ? true : (currentUser.doc_verified||false),
      doc_front:   _docFrontB64 || '',
      doc_back:    _docBackB64  || '',
    };
    if (typeof DB !== 'undefined' && typeof DB.normalizePixPayment === 'function') {
      const norm = DB.normalizePixPayment(reqPayload.pix_key_type, reqPayload.pix_key);
      reqPayload.pix_key_type = norm.pix_key_type;
      reqPayload.pix_key = norm.pix_key;
      if (!reqPayload.pix_key) {
        showToast('Chave PIX inválida para o tipo selecionado.', 'warning');
        return;
      }
    }

    const r = await DB.requestWithdrawal(currentUser.id, amount, reqPayload);

    document.getElementById('faceScreen')?.classList.remove('open');
    document.getElementById('termFullscreen')?.classList.remove('open');

    if (!r.ok) { showToast(r.msg || 'Não foi possível registrar o saque.', 'error'); return; }

    if (_wdIsFirst && !skipFace && _faceHashCapturado) {
      await DB.updateUser(currentUser.id, { face_hash: _faceHashCapturado, doc_verified: true });
      currentUser.face_hash = _faceHashCapturado;
      currentUser.doc_verified = true;
    }
    if (_wdIsFirst && skipFace && (_docFrontB64 || _docBackB64)) {
      await DB.updateUser(currentUser.id, { doc_verified: true }).catch(() => {});
      currentUser.doc_verified = true;
    }
    _termFaceAlreadyDone = false;
    window._wdCalc = null;
    window._wdPaymentDraft = null;
    withdrawalOk = true;

    if (r.irpf_tax > 0 && typeof showToast === 'function') {
      showToast(`Saque registrado. Retenção IRPF: ${formatMoney(r.irpf_tax)}.`, 'info', 5000);
    } else if (r.partner_fee > 0 && typeof showToast === 'function') {
      showToast(`Saque registrado. Taxa administrativa: ${formatMoney(r.partner_fee)}. Valor líquido PIX: ${formatMoney(r.withdrawal?.amount)}.`, 'info', 6000);
    }

    const isBank = payDraft?.method === 'conta';
    if (isBank) {
      showToast('Saque registrado! Aguardando aprovação para transferência em conta corrente.','info', 8000);
    } else if (r.pix?.ok) {
      showToast('PIX enviado! Aguarde a confirmação no app do banco.','success', 6000);
    } else if (r.pix && !r.pix.skipped && r.pix.error) {
      showToast('Saque registrado, mas o PIX falhou: ' + (r.pix.error || 'erro'),'warning', 8000);
    } else {
      showToast('Saque registrado! Aguardando aprovação do Master e do Financeiro.','info', 8000);
    }
  } catch(err) {
    console.error('[executeWithdrawal]', err);
    document.getElementById('faceScreen')?.classList.remove('open');
    showToast(err.message || 'Erro ao processar saque. Tente novamente.','error');
    return;
  }

  document.getElementById('faceScreen')?.classList.remove('open');
  document.getElementById('termFullscreen')?.classList.remove('open');
  document.getElementById('docScreen')?.classList.remove('open');

  if (!withdrawalOk) return;

  try {
    const _freshWd = await DB.getUser(currentUser.id);
    if (_freshWd) currentUser = _freshWd;
    if (typeof renderBalance === 'function' && document.getElementById('bannerPoints')) await renderBalance();
    if (typeof renderProfile === 'function') await renderProfile();
    if (typeof renderMyProfile === 'function' && document.getElementById('myProfileEmployee')) await renderMyProfile();
  } catch (uiErr) {
    console.warn('[executeWithdrawal] atualização da tela após saque:', uiErr);
  }
}

const WITHDRAWAL_FLOW_DOM_IDS = ['withdrawalModal', 'termFullscreen', 'docScreen', 'faceScreen'];

async function ensureWithdrawalFlowDom() {
  if (WITHDRAWAL_FLOW_DOM_IDS.every(id => document.getElementById(id))) return;
  if (window.__wdDomInjecting) {
    await window.__wdDomInjecting;
    return;
  }
  const run = (async () => {
    try {
      const base = typeof document !== 'undefined' && document.querySelector('base[data-soublu]')?.href;
      const pageUrl = base
        ? new URL('pages/employee.html', base).href
        : new URL('pages/employee.html', window.location.href).href;
      const html = await fetch(pageUrl, { credentials: 'same-origin' }).then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      });
      const doc = new DOMParser().parseFromString(html, 'text/html');
      WITHDRAWAL_FLOW_DOM_IDS.forEach(id => {
        if (document.getElementById(id)) return;
        const el = doc.getElementById(id);
        if (el) document.body.appendChild(el.cloneNode(true));
      });
    } catch (e) {
      console.warn('[withdrawal] não foi possível carregar modais de saque:', e);
    }
  })();
  window.__wdDomInjecting = run;
  try {
    await run;
  } finally {
    window.__wdDomInjecting = null;
  }
}
window.ensureWithdrawalFlowDom = ensureWithdrawalFlowDom;

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('profileHeader') || document.getElementById('secProfile')) {
      ensureWithdrawalFlowDom();
    }
  });
}