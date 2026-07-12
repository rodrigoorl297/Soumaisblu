/* Regras de saque (R$) + chave PIX salva (saque sempre via PIX) */

const WithdrawalRules = {
  MIN_BRL: 50,
  MAX_PER_MONTH: 3,
  IRPF_THRESHOLD: 5000,
  IRPF_RATE: 0.035,
  SPLIT_PARTS: 3,
  PARTNER_FEE_DEFAULT: 10,

  _moneyUser(u) {
    return typeof userUsesMoneyWallet === 'function' && userUsesMoneyWallet(u);
  },

  _partnerWalletUser(u) {
    return this._moneyUser(u) && typeof DB !== 'undefined' && typeof DB._isPartnerWalletUser === 'function' && DB._isPartnerWalletUser(u);
  },

  async _partnerSacFee(emp) {
    if (!this._partnerWalletUser(emp) || typeof DB === 'undefined') return 0;
    try {
      let rootId = emp.role === 'parceiro' ? emp.id : null;
      if (!rootId && typeof DB.getPartnerRootForUser === 'function') {
        rootId = await DB.getPartnerRootForUser(emp.id);
      }
      if (!rootId) return this.PARTNER_FEE_DEFAULT;
      const prt = await DB.getPartnerByUserId(rootId);
      const fee = parseFloat(prt?.meta?.taxa_saque);
      return Number.isFinite(fee) && fee >= 0 ? fee : this.PARTNER_FEE_DEFAULT;
    } catch (_) {
      return this.PARTNER_FEE_DEFAULT;
    }
  },

  _parsePartnerMeta(prt) {
    const raw = prt?.meta;
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) || {}; } catch (_) { return {}; }
    }
    return {};
  },

  async _partnerIrpjRate(emp) {
    if (!this._partnerWalletUser(emp) || typeof DB === 'undefined') return 0;
    try {
      let rootId = emp.role === 'parceiro' ? emp.id : null;
      if (!rootId && typeof DB.getPartnerRootForUser === 'function') {
        rootId = await DB.getPartnerRootForUser(emp.id);
      }
      if (!rootId) return 0;
      const prt = await DB.getPartnerByUserId(rootId);
      const meta = this._parsePartnerMeta(prt);
      const rate = parseFloat(meta.retencao_irpj ?? meta.retencao_irrf);
      return Number.isFinite(rate) && rate > 0 ? rate : 0;
    } catch (_) {
      return 0;
    }
  },

  _round(n) {
    return Math.round(Number(n) * 100) / 100;
  },

  _monthKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  },

  _activeWithdrawals(list, empId) {
    const skip = new Set(['cancelado', 'rejeitado', 'estornado']);
    const mk = this._monthKey();
    return (list || []).filter((w) => {
      if (String(w.employee_id) !== String(empId)) return false;
      if (skip.has(String(w.status || '').toLowerCase())) return false;
      const raw = w.created_at || w.createdAt;
      if (!raw) return false;
      const d = new Date(raw);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === mk;
    });
  },

  _parseNotes(w) {
    try {
      const n = w?.notes;
      if (n && typeof n === 'object') return n;
      if (typeof n === 'string' && n.startsWith('{')) return JSON.parse(n);
    } catch (_) { /* noop */ }
    return {};
  },

  _paymentStorageKey(userId) {
    return `soublu_payment_${userId}`;
  },

  getSavedPayment(user) {
    const id = user?.id;
    if (!id) return { method: 'pix', pix: {}, bank: {} };
    let raw = user?.payment_saved || user?.paymentSaved;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (_) { raw = null; }
    }
    if (!raw || typeof raw !== 'object') {
      try {
        const loc = JSON.parse(localStorage.getItem(this._paymentStorageKey(id)) || '{}');
        raw = loc;
      } catch (_) {
        raw = {};
      }
    }
    const legacyPix = (() => {
      try { return JSON.parse(localStorage.getItem('soublu_pix_' + id) || '{}'); } catch (_) { return {}; }
    })();
    const pix = { ...legacyPix, ...(raw.pix || {}) };
    const bank = raw.bank || {};
    return { method: 'pix', pix, bank };
  },

  async savePaymentProfile(userId, data) {
    const payload = {
      preferred_method: data.method,
      pix: data.pix || {},
      bank: data.bank || {},
      updated_at: new Date().toISOString(),
    };
    try {
      localStorage.setItem(this._paymentStorageKey(userId), JSON.stringify(payload));
      if (data.pix) {
        localStorage.setItem('soublu_pix_' + userId, JSON.stringify(data.pix));
      }
    } catch (_) { /* noop */ }
    try {
      await DB.updateUser(userId, { payment_saved: payload });
    } catch (e) {
      console.warn('[WithdrawalRules] savePaymentProfile:', e?.message || e);
    }
  },

  _pixTypeAliases: {
    celular: 'phone', telefone: 'phone', 'e-mail': 'email', mail: 'email',
    aleatoria: 'random', chave_aleatoria: 'random', evp: 'random',
  },

  _normalizePixType(type) {
    const t = String(type || '').trim().toLowerCase();
    if (!t || t === 'pix') return '';
    return this._pixTypeAliases[t] || t;
  },

  /** Valida chave já normalizada (CPF/CNPJ só dígitos, celular +55…). */
  isValidPixKey(type, key) {
    const t = this._normalizePixType(type) || 'cpf';
    const k = String(key || '').trim();
    if (!k) return false;
    switch (t) {
      case 'cpf':
        return /^\d{11}$/.test(k);
      case 'cnpj':
        return /^\d{14}$/.test(k);
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k);
      case 'phone':
        return /^\+55\d{10,11}$/.test(k);
      case 'random':
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k);
      default:
        return k.length >= 3;
    }
  },

  pixKeyValidationMessage(type) {
    const labels = {
      cpf: 'CPF (11 dígitos)',
      cnpj: 'CNPJ (14 dígitos)',
      email: 'e-mail válido',
      phone: 'celular com DDD (+55…)',
      random: 'chave aleatória (UUID)',
    };
    const t = this._normalizePixType(type) || 'cpf';
    return `Selecione o tipo correto e informe ${labels[t] || 'uma chave PIX válida'}.`;
  },

  readFormPayment() {
    return {
      method: 'pix',
      bank: null,
      pix: {
        pix_key_type: document.getElementById('pixKeyType')?.value || 'cpf',
        pix_key: document.getElementById('pixKey')?.value?.trim() || '',
        holder_name: document.getElementById('pixHolderName')?.value?.trim() || '',
        bank_name: document.getElementById('pixBankName')?.value?.trim() || '',
      },
    };
  },

  applySavedToForm(saved) {
    const s = saved || { method: 'pix', pix: {}, bank: {} };
    this.setPayMethod();
    const p = s.pix || {};
    if (p.pix_key_type && typeof window.selectPixType === 'function') {
      const btn = Array.from(document.querySelectorAll('.pix-key-type-btn')).find((b) => {
        const oc = b.getAttribute('onclick') || '';
        return oc.includes("'" + p.pix_key_type + "'") || oc.includes('\\\'' + p.pix_key_type + '\\\'');
      }) || null;
      window.selectPixType(p.pix_key_type, btn);
    } else if (p.pix_key_type) {
      const typeEl = document.getElementById('pixKeyType');
      if (typeEl) typeEl.value = p.pix_key_type;
    }
    if (p.pix_key) document.getElementById('pixKey').value = p.pix_key;
    if (p.holder_name) document.getElementById('pixHolderName').value = p.holder_name;
    if (p.bank_name) document.getElementById('pixBankName').value = p.bank_name;
  },

  setPayMethod() {
    const hid = document.getElementById('wdPayMethod');
    if (hid) hid.value = 'pix';
    const pixBlock = document.getElementById('wdPixBlock');
    if (pixBlock) pixBlock.style.display = '';
    const title = document.getElementById('withdrawalModalTitle');
    if (title) title.textContent = 'Solicitar saque via PIX';
  },

  validatePaymentForm(pay) {
    if (!pay) return { ok: false, msg: 'Informe os dados de pagamento.' };
    const p = pay.pix || {};
    if (!p.pix_key) return { ok: false, msg: 'Informe sua chave PIX.' };
    if (!p.holder_name) return { ok: false, msg: 'Informe o nome do titular.' };
    if (typeof DB !== 'undefined' && typeof DB.normalizePixPayment === 'function') {
      const norm = DB.normalizePixPayment(p.pix_key_type, p.pix_key);
      if (!norm.pix_key) {
        return { ok: false, msg: 'Chave PIX inválida. Use CPF, CNPJ, e-mail, celular ou chave aleatória.' };
      }
      p.pix_key_type = norm.pix_key_type;
      p.pix_key = norm.pix_key;
    }
    return { ok: true, pix: p };
  },

  async evaluate(empId, requestedAmount, emp) {
    const amt = typeof parseMoneyAmount === 'function'
      ? parseMoneyAmount(requestedAmount)
      : this._round(requestedAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return { ok: false, msg: 'Informe o valor em reais.' };
    }

    const money = this._moneyUser(emp);
    const partnerWallet = this._partnerWalletUser(emp);
    const partnerFee = partnerWallet ? await this._partnerSacFee(emp) : 0;
    const irpjRate = partnerWallet ? await this._partnerIrpjRate(emp) : 0;
    const irpjTax = partnerWallet && irpjRate > 0 ? this._round(amt * irpjRate / 100) : 0;
    if (!money) {
      if (typeof VendorTierPoints !== 'undefined' && VendorTierPoints.usesTierWithdrawRules(emp)) {
        const wd = VendorTierPoints.canWithdrawToday(emp);
        if (!wd.ok) return { ok: false, msg: wd.msg };
      }
      return { ok: true, money: false, netAmount: Math.floor(amt), irpfTax: 0, totalDebit: Math.floor(amt), partnerFee: 0 };
    }

    if (!partnerWallet) {
      if (amt < this.MIN_BRL) {
        return { ok: false, msg: `Valor mínimo para saque: R$ ${this.MIN_BRL.toFixed(2).replace('.', ',')}.` };
      }
    } else if (partnerWallet && (partnerFee + irpjTax) > 0 && amt <= partnerFee + irpjTax) {
      return {
        ok: false,
        msg: `Informe um valor maior que as deduções (taxa + retenção IRPJ).`,
      };
    }

    const allWd = await DB.getWithdrawals(empId);
    const monthList = this._activeWithdrawals(allWd, empId);
    if (!partnerWallet && monthList.length >= this.MAX_PER_MONTH) {
      return { ok: false, msg: `Limite de ${this.MAX_PER_MONTH} saques por mês atingido.` };
    }

    let irpfTax = 0;
    let irpfReason = '';
    const pendingNext = !!(emp?.withdrawal_irpf_next || emp?.withdrawalIrpfNext);

    if (!partnerWallet) {
      if (amt > this.IRPF_THRESHOLD) {
        irpfTax = this._round(amt * this.IRPF_RATE);
        irpfReason = 'irpf_acima_5000';
      } else if (pendingNext) {
        irpfTax = this._round(amt * this.IRPF_RATE);
        irpfReason = 'irpf_fracionamento_proximo';
      }
    }

    const willBeThird = !partnerWallet && monthList.length >= this.MAX_PER_MONTH - 1;
    const allUnderThreshold = monthList.every((w) => Number(w.amount) < this.IRPF_THRESHOLD) && amt < this.IRPF_THRESHOLD;
    const monthSum = monthList.reduce((s, w) => s + Number(w.amount || 0), 0) + amt;
    let flagSplitNext = false;
    if (willBeThird && allUnderThreshold && monthSum >= this.IRPF_THRESHOLD) {
      flagSplitNext = true;
    }

    const netAmount = partnerWallet
      ? this._round(Math.max(0, amt - partnerFee - irpjTax))
      : amt;
    const totalDebit = this._round(amt + irpfTax);
    const bal = typeof userWalletBalance === 'function' ? userWalletBalance(emp) : Number(emp?.points ?? emp?.balance ?? 0);
    if (totalDebit > bal + 0.001) {
      const extra = irpfTax > 0 ? ` (valor + IRPF ${formatMoney(irpfTax)})` : '';
      return { ok: false, msg: `Saldo insuficiente${extra}. Disponível: ${formatMoney(bal)}.` };
    }

    const remaining = partnerWallet ? null : this.MAX_PER_MONTH - monthList.length - 1;

    return {
      ok: true,
      money: true,
      partnerWallet,
      partnerFee,
      irpjRate,
      irpjTax,
      requestedAmount: amt,
      netAmount,
      irpfTax,
      irpfReason,
      totalDebit,
      flagSplitNext,
      clearPendingIrpf: irpfReason === 'irpf_fracionamento_proximo',
      monthCount: monthList.length + 1,
      remainingThisMonth: remaining,
    };
  },

  updatePreview(emp) {
    const box = document.getElementById('wdRulesPreview');
    if (!box) return;
    if (!this._moneyUser(emp)) {
      box.style.display = 'none';
      return;
    }
    box.style.display = '';
    const partnerWallet = this._partnerWalletUser(emp);
    const raw = document.getElementById('withdrawAmount')?.value;
    const amt = typeof parseMoneyAmount === 'function' ? parseMoneyAmount(raw) : 0;
    if (!amt) {
      if (partnerWallet) {
        this._partnerSacFee(emp).then((fee) => {
          this._partnerIrpjRate(emp).then((rate) => {
            const irpjHint = rate > 0
              ? ` · retenção IRPJ de <strong>${String(rate).replace('.', ',')}%</strong> sobre o valor solicitado`
              : '';
            box.innerHTML = `<div style="font-size:12px;color:var(--color-text-muted);line-height:1.5;">Parceiro: sem limite de saques/mês · taxa administrativa de <strong>R$ ${fee.toFixed(2).replace('.', ',')}</strong>${irpjHint} · valor líquido via PIX.</div>`;
          });
        }).catch(() => {});
        return;
      }
      let hint = `Mín. R$ ${this.MIN_BRL.toFixed(2).replace('.', ',')} · máx. ${this.MAX_PER_MONTH} saques/mês · IRPF 3,5% acima de R$ 5.000,00`;
      if (!partnerWallet && typeof VendorTierPoints !== 'undefined' && VendorTierPoints.usesTierWithdrawRules(emp)) {
        const wd = VendorTierPoints.canWithdrawToday(emp);
        hint = `Saque de pontos: dias ${VendorTierPoints.WITHDRAW_DAY_MIN} a ${VendorTierPoints.WITHDRAW_DAY_MAX} · crédito de faixa todo dia ${VendorTierPoints.CREDIT_DAY}`;
        if (!wd.ok) hint += `<div style="color:var(--color-warning);margin-top:4px;">${wd.msg}</div>`;
      }
      box.innerHTML = `<div style="font-size:12px;color:var(--color-text-muted);line-height:1.5;">${hint}</div>`;
      return;
    }
    this.evaluate(emp?.id, amt, emp).then((r) => {
      if (!r.ok) {
        box.innerHTML = `<div style="font-size:12px;color:var(--color-danger);">${r.msg}</div>`;
        return;
      }
      let html = `<div style="font-size:12px;line-height:1.55;">
        <div>Valor solicitado: <strong>${formatMoney(r.requestedAmount ?? r.netAmount)}</strong></div>`;
      if (r.partnerFee > 0) {
        html += `<div style="color:var(--color-warning);">Taxa administrativa: <strong>− ${formatMoney(r.partnerFee)}</strong></div>`;
      }
      if (r.irpjTax > 0) {
        html += `<div style="color:var(--color-warning);">Retenção IRPJ (${String(r.irpjRate || '').replace('.', ',')}%): <strong>− ${formatMoney(r.irpjTax)}</strong></div>`;
      }
      if (r.partnerFee > 0 || r.irpjTax > 0) {
        html += `<div>Valor líquido PIX: <strong>${formatMoney(r.netAmount)}</strong></div>`;
      } else {
        html += `<div>Valor do saque: <strong>${formatMoney(r.netAmount)}</strong></div>`;
      }
      if (r.irpfTax > 0) {
        html += `<div style="color:var(--color-warning);">IRPF (3,5%): <strong>− ${formatMoney(r.irpfTax)}</strong></div>`;
      }
      html += `<div>Total debitado do saldo: <strong>${formatMoney(r.totalDebit)}</strong></div>`;
      if (r.remainingThisMonth != null) {
        html += `<div style="color:var(--color-text-muted);margin-top:4px;">${r.remainingThisMonth} saque(s) restante(s) neste mês.</div>`;
      }
      if (emp?.withdrawal_irpf_next && r.irpfReason === 'irpf_fracionamento_proximo') {
        html += `<div style="color:var(--color-warning);margin-top:4px;">Imposto aplicado por fracionamento em saques anteriores.</div>`;
      }
      html += '</div>';
      box.innerHTML = html;
    }).catch(() => {});
  },

  initModalUI() {
    const modal = document.getElementById('withdrawalModal');
    if (!modal || modal.dataset.wdRulesUi === '2') return;
    ['wdRulesHint', 'wdRulesPreview', 'wdPayMethod', 'wdBankBlock'].forEach((id) => {
      const el = modal.querySelector('#' + id);
      if (el) el.remove();
    });
    modal.querySelectorAll('.wd-pay-method-btn').forEach((el) => el.remove());
    modal.dataset.wdRulesUi = '2';

    const header = modal.querySelector('.modal-header h3');
    if (header) header.id = 'withdrawalModalTitle';

    const body = modal.querySelector('.modal-body');
    if (!body) return;

    const balEl = document.getElementById('withdrawBalance');
    const anchor = balEl?.closest('.alert') || body.querySelector('.alert') || body.firstElementChild;

    const rulesHtml = `
      <input type="hidden" id="wdPayMethod" value="pix"/>
      <div id="wdRulesHint" style="margin-bottom:12px;padding:10px 12px;background:var(--color-surface-2);border-radius:var(--radius-md);font-size:12px;line-height:1.5;color:var(--color-text-secondary);">
        <strong>Regras:</strong> mínimo R$ 50,00 · até 3 saques por mês · acima de R$ 5.000,00 retém 3,5% (IRPF).
        Fracionar valores para fugir do imposto gera retenção automática no próximo saque.
      </div>
      <div id="wdRulesPreview" style="margin-bottom:12px;padding:10px 12px;border:1px solid var(--color-border);border-radius:var(--radius-md);display:none;"></div>
      <p style="font-size:12px;color:var(--color-text-muted);margin:0 0 12px;line-height:1.45;">O saque é creditado na sua chave PIX. O saldo no perfil funciona como uma carteira digital — não é transferência para conta corrente.</p>
    `;

    if (anchor) anchor.insertAdjacentHTML('afterend', rulesHtml);

    body.querySelectorAll('div').forEach((div) => {
      if (!div.id && (div.textContent || '').includes('Dados da Chave PIX')) div.id = 'wdPixBlock';
    });

    const saveRow = document.createElement('label');
    saveRow.className = 'checkbox-label';
    saveRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13px;cursor:pointer;';
    saveRow.innerHTML = '<input type="checkbox" id="wdSavePayment" checked style="width:16px;height:16px;"/> Salvar chave PIX para não precisar digitar de novo';
    body.appendChild(saveRow);

    const amt = document.getElementById('withdrawAmount');
    if (amt) {
      amt.addEventListener('input', () => {
        if (typeof currentUser !== 'undefined' && currentUser) this.updatePreview(currentUser);
      });
    }
  },

  configureModalForUser(emp) {
    const money = this._moneyUser(emp);
    const partnerWallet = this._partnerWalletUser(emp);
    const hint = document.getElementById('wdRulesHint');
    if (hint) {
      hint.style.display = money ? '' : 'none';
      if (partnerWallet) {
        this._partnerSacFee(emp).then((fee) => {
          this._partnerIrpjRate(emp).then((rate) => {
            const irpjHint = rate > 0
              ? ` Retenção IRPJ de <strong>${String(rate).replace('.', ',')}%</strong> sobre o valor solicitado.`
              : '';
            hint.innerHTML = `<strong>Parceiro:</strong> sem limite de valor mínimo nem de saques por mês. Taxa administrativa de <strong>R$ ${fee.toFixed(2).replace('.', ',')}</strong>.${irpjHint} O PIX credita o valor líquido após as deduções.`;
          });
        }).catch(() => {});
      }
    }
    const amtLbl = document.getElementById('withdrawAmountLabel');
    if (amtLbl) amtLbl.textContent = money ? 'Valor a sacar (R$)' : 'Pontos a resgatar';
    const preview = document.getElementById('wdRulesPreview');
    if (preview) preview.style.display = '';
    this.updatePreview(emp);
  },
};

window.WithdrawalRules = WithdrawalRules;

document.addEventListener('DOMContentLoaded', () => {
  try { WithdrawalRules.initModalUI(); } catch (e) { console.warn('[WithdrawalRules] init:', e); }
});
