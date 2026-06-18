/* Regras de saque (R$) + chave PIX salva (saque sempre via PIX) */

const WithdrawalRules = {
  MIN_BRL: 50,
  MAX_PER_MONTH: 3,
  IRPF_THRESHOLD: 5000,
  IRPF_RATE: 0.035,
  SPLIT_PARTS: 3,

  _moneyUser(u) {
    return typeof userUsesMoneyWallet === 'function' && userUsesMoneyWallet(u);
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
    if (p.pix_key_type) {
      const typeEl = document.getElementById('pixKeyType');
      if (typeEl) typeEl.value = p.pix_key_type;
      document.querySelectorAll('.pix-key-type-btn').forEach((b) => {
        b.classList.toggle('active', (b.getAttribute('onclick') || '').includes("'" + p.pix_key_type + "'"));
      });
      const labels = { cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', phone: 'Celular', random: 'Chave Aleatória' };
      const ph = { cpf: '000.000.000-00', cnpj: '00.000.000/0001-00', email: 'seu@email.com', phone: '+55 11 99999-9999', random: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' };
      const lb = document.getElementById('pixKeyLabel');
      const pk = document.getElementById('pixKey');
      if (lb) lb.textContent = labels[p.pix_key_type] || 'Chave PIX';
      if (pk) pk.placeholder = ph[p.pix_key_type] || '';
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
    return { ok: true };
  },

  async evaluate(empId, requestedAmount, emp) {
    const amt = typeof parseMoneyAmount === 'function'
      ? parseMoneyAmount(requestedAmount)
      : this._round(requestedAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return { ok: false, msg: 'Informe o valor em reais.' };
    }

    const money = this._moneyUser(emp);
    if (!money) {
      if (typeof VendorTierPoints !== 'undefined' && VendorTierPoints.usesTierWithdrawRules(emp)) {
        const wd = VendorTierPoints.canWithdrawToday(emp);
        if (!wd.ok) return { ok: false, msg: wd.msg };
      }
      return { ok: true, money: false, netAmount: Math.floor(amt), irpfTax: 0, totalDebit: Math.floor(amt) };
    }

    if (amt < this.MIN_BRL) {
      return { ok: false, msg: `Valor mínimo para saque: R$ ${this.MIN_BRL.toFixed(2).replace('.', ',')}.` };
    }

    const allWd = await DB.getWithdrawals(empId);
    const monthList = this._activeWithdrawals(allWd, empId);
    if (monthList.length >= this.MAX_PER_MONTH) {
      return { ok: false, msg: `Limite de ${this.MAX_PER_MONTH} saques por mês atingido.` };
    }

    let irpfTax = 0;
    let irpfReason = '';
    const pendingNext = !!(emp?.withdrawal_irpf_next || emp?.withdrawalIrpfNext);

    if (amt > this.IRPF_THRESHOLD) {
      irpfTax = this._round(amt * this.IRPF_RATE);
      irpfReason = 'irpf_acima_5000';
    } else if (pendingNext) {
      irpfTax = this._round(amt * this.IRPF_RATE);
      irpfReason = 'irpf_fracionamento_proximo';
    }

    const willBeThird = monthList.length >= this.MAX_PER_MONTH - 1;
    const allUnderThreshold = monthList.every((w) => Number(w.amount) < this.IRPF_THRESHOLD) && amt < this.IRPF_THRESHOLD;
    const monthSum = monthList.reduce((s, w) => s + Number(w.amount || 0), 0) + amt;
    let flagSplitNext = false;
    if (willBeThird && allUnderThreshold && monthSum >= this.IRPF_THRESHOLD) {
      flagSplitNext = true;
    }

    const totalDebit = this._round(amt + irpfTax);
    const bal = typeof userWalletBalance === 'function' ? userWalletBalance(emp) : Number(emp?.points ?? emp?.balance ?? 0);
    if (totalDebit > bal + 0.001) {
      const extra = irpfTax > 0 ? ` (valor + IRPF ${formatMoney(irpfTax)})` : '';
      return { ok: false, msg: `Saldo insuficiente${extra}. Disponível: ${formatMoney(bal)}.` };
    }

    const remaining = this.MAX_PER_MONTH - monthList.length - 1;

    return {
      ok: true,
      money: true,
      netAmount: amt,
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
    const raw = document.getElementById('withdrawAmount')?.value;
    const amt = typeof parseMoneyAmount === 'function' ? parseMoneyAmount(raw) : 0;
    if (!amt) {
      let hint = `Mín. R$ ${this.MIN_BRL.toFixed(2).replace('.', ',')} · máx. ${this.MAX_PER_MONTH} saques/mês · IRPF 3,5% acima de R$ 5.000,00`;
      if (typeof VendorTierPoints !== 'undefined' && VendorTierPoints.usesTierWithdrawRules(emp)) {
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
        <div>Valor do saque: <strong>${formatMoney(r.netAmount)}</strong></div>`;
      if (r.irpfTax > 0) {
        html += `<div style="color:var(--color-warning);">IRPF (3,5%): <strong>− ${formatMoney(r.irpfTax)}</strong></div>`;
      }
      html += `<div>Total debitado do saldo: <strong>${formatMoney(r.totalDebit)}</strong></div>
        <div style="color:var(--color-text-muted);margin-top:4px;">${r.remainingThisMonth} saque(s) restante(s) neste mês.</div>`;
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
    const hint = document.getElementById('wdRulesHint');
    if (hint) hint.style.display = money ? '' : 'none';
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
