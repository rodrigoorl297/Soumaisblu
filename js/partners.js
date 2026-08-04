/* ==========================================================
   SOU + BLU – Permissões de Parceiros (módulos do portal)
   ========================================================== */

/** Faixas de comissão do parceiro (valor líquido = valor bruto × rate). */
const PARTNER_COMMISSION_TIERS = {
  diamante: { label: 'Diamante', rate: 0.925, pct: 92.5 },
  gold: { label: 'Gold', rate: 0.85, pct: 85 },
  silver: { label: 'Silver', rate: 0.75, pct: 75 },
  bronze: { label: 'Bronze', rate: 0.60, pct: 60 },
};
const PARTNER_COMMISSION_TIER_DEFAULT = 'bronze';

const PartnerPerms = {
  PARTNER_COMMISSION_TIERS,
  DEFAULT_COMMISSION_TIER: PARTNER_COMMISSION_TIER_DEFAULT,
  DEFAULT: {
    contestacao: true,
    cadastrar_funcionario: true,
    atendimento_leads: false,
    clientes: true,
    cadastrar_cliente: true,
    treinamentos: false,
    gestao_chamados: true,
    abrir_chamados_operacional: true,
    dashboard: true,
    indicacao_tim: false,
    esteira_indicacao_tim: false,
    chat_whatsapp: false,
    marketplace_blu: false,
    fechamento_financeiro: true,
    dados_nota_fiscal: false,
    upload_nota_fiscal: false,
    cadastrar_proposta: true,
    visualizar_propostas: true,
    simulador: true,
    sacar_pix: true,
    equipe_sacar_pix: true,
    conta_credito_proposta: false,
    conta_debito_proposta: false,
    conta_adiantamento_motivo: false,
  },

  LABELS: {
    contestacao: 'Contestação',
    cadastrar_funcionario: 'Funcionários (cadastrar equipe)',
    atendimento_leads: 'Atendimento de leads',
    clientes: 'Clientes',
    cadastrar_cliente: 'Clientes (legado)',
    treinamentos: 'Treinamentos',
    gestao_chamados: 'Gestão de chamados',
    abrir_chamados_operacional: 'Chamados operacional (legado)',
    dashboard: 'Dashboard',
    indicacao_tim: 'Indicação proposta TIM',
    esteira_indicacao_tim: 'Esteira indicação TIM',
    chat_whatsapp: 'Chat WhatsApp (opcional — marque para liberar na rede)',
    marketplace_blu: 'Marketplace BLU — resgate de serviços com pontos',
    fechamento_financeiro: 'Fiscal — fechamento enviado pelo financeiro',
    dados_nota_fiscal: 'Fiscal — dados para emissão NF (CNPJ/API)',
    upload_nota_fiscal: 'Fiscal — upload nota fiscal',
    cadastrar_proposta: 'Cadastrar proposta',
    visualizar_propostas: 'Visualizar propostas',
    simulador: 'Simulador',
    sacar_pix: 'Gestor parceiro — sacar via PIX',
    equipe_sacar_pix: 'Equipe — sacar via PIX (vendedor / backoffice)',
    conta_credito_proposta: 'Conta corrente — crédito proposta',
    conta_debito_proposta: 'Conta corrente — débito proposta',
    conta_adiantamento_motivo: 'Conta corrente — adiantamento (motivo)',
  },

  /** Módulos marcáveis no cadastro do parceiro (planilha) */
  MODULE_GROUPS: [
    {
      title: 'Operação',
      keys: ['contestacao', 'cadastrar_funcionario', 'atendimento_leads', 'clientes', 'treinamentos', 'marketplace_blu', 'gestao_chamados', 'dashboard', 'chat_whatsapp'],
    },
    {
      title: 'TIM',
      keys: ['indicacao_tim', 'esteira_indicacao_tim'],
    },
    {
      title: 'Em desenvolvimento',
      keys: [],
      disabled: true,
    },
    {
      title: 'Fiscal',
      keys: ['fechamento_financeiro', 'dados_nota_fiscal', 'upload_nota_fiscal'],
    },
    {
      title: 'Propostas e financeiro',
      keys: ['cadastrar_proposta', 'visualizar_propostas', 'simulador', 'sacar_pix', 'equipe_sacar_pix', 'conta_credito_proposta', 'conta_debito_proposta', 'conta_adiantamento_motivo'],
    },
  ],

  /** Permissões configuráveis por cargo da equipe do parceiro */
  TEAM_PERM_KEYS: [
    'dashboard', 'clientes', 'cadastrar_proposta', 'visualizar_propostas', 'simulador', 'chat_whatsapp',
    'gestao_chamados', 'contestacao', 'treinamentos', 'marketplace_blu', 'atendimento_leads',
    'cadastrar_funcionario', 'sacar_pix', 'conta_credito_proposta', 'conta_debito_proposta',
    'conta_adiantamento_motivo', 'fechamento_financeiro', 'dados_nota_fiscal', 'upload_nota_fiscal',
  ],

  TEAM_LABELS: {
    sacar_pix: 'Sacar via PIX (colaborador)',
  },

  /** Cargos da equipe parceira que podem solicitar saque PIX (saldo individual). */
  PARTNER_TEAM_SACAR_ROLES: ['vendedor', 'backoffice', 'operacional', 'sup_backoffice'],

  _parseJsonField(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) || {}; } catch (_) { return {}; }
    }
    return {};
  },

  normalizeCommissionTier(tier) {
    const t = String(tier || '').toLowerCase().trim();
    return PARTNER_COMMISSION_TIERS[t] ? t : PARTNER_COMMISSION_TIER_DEFAULT;
  },

  commissionRate(partnerOrTier) {
    const tier = typeof partnerOrTier === 'string'
      ? this.normalizeCommissionTier(partnerOrTier)
      : this.tierFromPartner(partnerOrTier);
    return PARTNER_COMMISSION_TIERS[tier].rate;
  },

  tierFromPartner(partner) {
    const meta = this._parseJsonField(partner?.meta);
    return this.normalizeCommissionTier(meta.commission_tier);
  },

  tierLabel(partnerOrTier) {
    const tier = typeof partnerOrTier === 'string'
      ? this.normalizeCommissionTier(partnerOrTier)
      : this.tierFromPartner(partnerOrTier);
    return PARTNER_COMMISSION_TIERS[tier];
  },

  /**
   * Comissão líquida do parceiro sobre valor bruto da proposta.
   * Usado em: FinPropostas (baixa comissão), ContaCorrente (sugestão de crédito).
   */
  calcPartnerCommission(valorBruto, partnerOrTier) {
    const v = parseFloat(valorBruto) || 0;
    if (v <= 0) return 0;
    const rate = typeof partnerOrTier === 'number'
      ? partnerOrTier
      : this.commissionRate(partnerOrTier);
    return Math.round(v * rate * 100) / 100;
  },

  commissionTierSelectHtml(selectedTier) {
    const tier = this.normalizeCommissionTier(selectedTier);
    return Object.entries(PARTNER_COMMISSION_TIERS).map(([key, t]) => {
      const pct = String(t.pct).replace('.', ',');
      return `<option value="${key}"${key === tier ? ' selected' : ''}>${t.label.toUpperCase()} — ${pct}%</option>`;
    }).join('');
  },

  updateCommissionTierHint() {
    const sel = document.getElementById('partnerCommissionTier');
    const hint = document.getElementById('partnerCommissionTierHint');
    if (!sel || !hint) return;
    const t = PARTNER_COMMISSION_TIERS[this.normalizeCommissionTier(sel.value)];
    const pct = String(t.pct).replace('.', ',');
    const desc = String((100 - t.pct).toFixed(1)).replace('.', ',');
    hint.textContent = `Comissão líquida: ${pct}% do valor bruto da proposta (desconto automático de ${desc}%).`;
  },

  fillCommissionTierForm(meta) {
    const sel = document.getElementById('partnerCommissionTier');
    if (!sel) return;
    const tier = this.normalizeCommissionTier(meta?.commission_tier);
    sel.innerHTML = this.commissionTierSelectHtml(tier);
    sel.value = tier;
    this.updateCommissionTierHint();
  },

  readCommissionTierMeta(existingMeta) {
    const sel = document.getElementById('partnerCommissionTier');
    const tier = this.normalizeCommissionTier(sel?.value || existingMeta?.commission_tier);
    return {
      commission_tier: tier,
      commission_rate: PARTNER_COMMISSION_TIERS[tier].rate,
    };
  },

  tierBadgeHtml(partner) {
    const t = this.tierLabel(partner);
    const pct = String(t.pct).replace('.', ',');
    return `<span class="badge badge-primary" style="font-size:10px;" title="Faixa de comissão do parceiro">${t.label.toUpperCase()} ${pct}%</span>`;
  },

  teamSacarEnabled(perms, meta) {
    const p = this.merge(perms);
    const m = this._parseJsonField(meta);
    return !!p.equipe_sacar_pix || !!m.equipe_sacar_pix;
  },

  /** Alinha team_perms.*.sacar_pix com o interruptor org equipe_sacar_pix. */
  syncTeamSacarRoleFlags(perms, enabled) {
    const p = this.merge(perms);
    const tp = { ...(p.team_perms || {}) };
    this.PARTNER_TEAM_SACAR_ROLES.forEach((role) => {
      tp[role] = { ...(tp[role] || this._defaultTeamRolePerms(role)), sacar_pix: !!enabled };
    });
    return { ...p, equipe_sacar_pix: !!enabled, team_perms: tp };
  },

  /** Libera saque da equipe deste parceiro quando colaborador já tem saldo (ex.: após distribuição). */
  async ensureTeamSacarForFundedMember(user, partnerRow) {
    if (!user?.id || !partnerRow || typeof DB === 'undefined' || typeof DB.savePartner !== 'function') return partnerRow;
    const r = String(user.role || '').toLowerCase();
    if (!this.PARTNER_TEAM_SACAR_ROLES.includes(r)) return partnerRow;
    const bal = typeof userWalletBalance === 'function'
      ? userWalletBalance(user)
      : (parseFloat(user.points ?? user.balance ?? 0) || 0);
    if (bal <= 0) return partnerRow;
    const perms = this.merge(partnerRow.permissions);
    const meta = this._parseJsonField(partnerRow.meta);
    const orgOn = this.teamSacarEnabled(perms, meta);
    const roleOn = !!(perms.team_perms?.[r]?.sacar_pix);
    if (orgOn && roleOn) return partnerRow;
    const updatedPerms = this.syncTeamSacarRoleFlags(perms, true);
    const updatedMeta = { ...meta, equipe_sacar_pix: true, equipe_sacar_auto: true };
    try {
      const saved = await DB.savePartner({
        ...partnerRow,
        permissions: updatedPerms,
        meta: updatedMeta,
      });
      if (typeof window !== 'undefined' && window.PARTNER_ROOT_ID === partnerRow.user_id) {
        window._PARTNER_PERMS = updatedPerms;
      }
      if (typeof PartnerOps !== 'undefined') PartnerOps.invalidate();
      return saved || { ...partnerRow, permissions: updatedPerms, meta: updatedMeta };
    } catch (e) {
      console.warn('[PartnerPerms] ensureTeamSacarForFundedMember:', e);
      return partnerRow;
    }
  },

  _defaultTeamRolePerms(role) {
    const r = String(role || '').toLowerCase();
    const base = {
      dashboard: true,
      clientes: true,
      cadastrar_proposta: false,
      visualizar_propostas: true,
      simulador: true,
      chat_whatsapp: false,
      gestao_chamados: false,
      contestacao: false,
      treinamentos: false,
      marketplace_blu: false,
      atendimento_leads: false,
      cadastrar_funcionario: false,
      sacar_pix: false,
      conta_credito_proposta: false,
      conta_debito_proposta: false,
      conta_adiantamento_motivo: false,
      fechamento_financeiro: false,
      dados_nota_fiscal: false,
      upload_nota_fiscal: false,
    };
    if (r === 'vendedor') {
      return { ...base, cadastrar_proposta: true, simulador: true, sacar_pix: true };
    }
    if (r === 'backoffice' || r === 'operacional') {
      return { ...base, cadastrar_proposta: true, visualizar_propostas: true, gestao_chamados: true, simulador: true, sacar_pix: true };
    }
    if (r === 'sup_backoffice') {
      return { ...base, cadastrar_proposta: true, visualizar_propostas: true, gestao_chamados: true, cadastrar_funcionario: true, simulador: true, sacar_pix: true };
    }
    if (r === 'rh') {
      return { ...base, cadastrar_funcionario: true, gestao_chamados: true };
    }
    if (r === 'financeiro' || r === 'financial') {
      return {
        ...base,
        visualizar_propostas: true,
        fechamento_financeiro: true,
        dados_nota_fiscal: true,
        upload_nota_fiscal: true,
        conta_credito_proposta: true,
        conta_debito_proposta: true,
        conta_adiantamento_motivo: true,
      };
    }
    return base;
  },

  mergeTeamPerms(raw) {
    const out = {};
    this.TEAM_ROLES.forEach((tr) => {
      const role = tr.value;
      out[role] = { ...this._defaultTeamRolePerms(role), ...(raw?.[role] || {}) };
    });
    return out;
  },

  merge(perms) {
    const src = perms || {};
    const { team_perms, ...rest } = src;
    const m = { ...this.DEFAULT, ...rest };
    if (m.clientes != null) m.cadastrar_cliente = !!m.clientes;
    else if (m.cadastrar_cliente != null) m.clientes = !!m.cadastrar_cliente;
    if (m.gestao_chamados != null) m.abrir_chamados_operacional = !!m.gestao_chamados;
    else if (m.abrir_chamados_operacional != null) m.gestao_chamados = !!m.abrir_chamados_operacional;
    m.team_perms = this.mergeTeamPerms(team_perms);
    return m;
  },

  can(perms, key) {
    const p = this.merge(perms);
    if (key === 'cadastrar_cliente') return !!p.clientes || !!p.cadastrar_cliente;
    if (key === 'abrir_chamados_operacional') return !!p.gestao_chamados || !!p.abrir_chamados_operacional;
    return !!p[key];
  },

  /** Equipe do parceiro: exige módulo ativo na organização + permissão do cargo. */
  canForStaff(perms, role, key, meta) {
    const p = this.merge(perms);
    const r = String(role || '').toLowerCase();
    const rolePerms = p.team_perms?.[r] || this._defaultTeamRolePerms(r);
    if (key === 'cadastrar_cliente') {
      if (!this.can(p, 'clientes') && !this.can(p, 'cadastrar_cliente')) return false;
      return !!rolePerms.clientes || !!rolePerms.cadastrar_cliente;
    }
    if (key === 'sacar_pix') {
      if (!this.PARTNER_TEAM_SACAR_ROLES.includes(r)) return false;
      /* Interruptor org "Liberar saque equipe" é a fonte da verdade — não bloquear
         por team_perms.vendedor.sacar_pix=false residual de formulário antigo. */
      if (this.teamSacarEnabled(perms, meta)) return true;
      if (!this.can(p, 'sacar_pix')) return false;
      return !!rolePerms.sacar_pix;
    }
    if (key === 'cadastrar_proposta') {
      if (!this.can(p, 'cadastrar_proposta')) return false;
      if (['backoffice', 'operacional', 'sup_backoffice'].includes(r)) return true;
    }
    if (key === 'visualizar_propostas') {
      if (!this.can(p, 'visualizar_propostas') && !this.can(p, 'cadastrar_proposta')) return false;
      if (['backoffice', 'operacional', 'sup_backoffice'].includes(r)) return true;
    }
    if (key === 'chat_whatsapp') {
      if (!this.can(p, 'chat_whatsapp')) return false;
      return !!rolePerms.chat_whatsapp;
    }
    if (!this.can(p, key)) return false;
    return !!rolePerms[key];
  },

  readForm(containerId) {
    const root = document.getElementById(containerId);
    const out = { ...this.DEFAULT };
    if (!root) return this.merge(out);
    root.querySelectorAll('[data-partner-perm]').forEach(el => {
      const key = el.dataset.partnerPerm;
      if (key && key in out && !el.disabled) out[key] = el.checked;
    });
    out.team_perms = this.readTeamForm('partnerTeamPermsCheckboxes');
    return this.merge(out);
  },

  readTeamForm(containerId = 'partnerTeamPermsCheckboxes') {
    const root = document.getElementById(containerId);
    const out = this.mergeTeamPerms(null);
    if (!root) return out;
    root.querySelectorAll('[data-partner-team-role][data-partner-team-perm]').forEach((el) => {
      const role = el.dataset.partnerTeamRole;
      const key = el.dataset.partnerTeamPerm;
      if (role && key && out[role]) out[role][key] = !!el.checked;
    });
    return out;
  },

  fillForm(containerId, perms) {
    const root = document.getElementById(containerId);
    if (!root) return;
    const p = this.merge(perms);
    root.querySelectorAll('[data-partner-perm]').forEach(el => {
      const key = el.dataset.partnerPerm;
      if (key && key in p) el.checked = !!p[key];
    });
    this.fillTeamForm('partnerTeamPermsCheckboxes', p);
  },

  fillTeamForm(containerId = 'partnerTeamPermsCheckboxes', perms) {
    const root = document.getElementById(containerId);
    if (!root) return;
    const p = this.merge(perms);
    root.querySelectorAll('[data-partner-team-role][data-partner-team-perm]').forEach((el) => {
      const role = el.dataset.partnerTeamRole;
      const key = el.dataset.partnerTeamPerm;
      if (role && key) el.checked = !!p.team_perms?.[role]?.[key];
    });
  },

  ensureTeamPermsUi(containerId = 'partnerTeamPermsCheckboxes') {
    const root = document.getElementById(containerId);
    if (!root || root.dataset.filled === '1') return;
    root.innerHTML = this.renderTeamPermsHtml();
    root.dataset.filled = '1';
  },

  TEAM_ROLES: [
    { value: 'vendedor', label: 'Vendedor', dept: 'Vendas' },
    { value: 'backoffice', label: 'Backoffice / Operacional', dept: 'Operacional' },
    { value: 'operacional', label: 'Operacional', dept: 'Operacional' },
    { value: 'sup_backoffice', label: 'Supervisor Backoffice (equipe)', dept: 'Operacional' },
    { value: 'rh', label: 'RH', dept: 'RH' },
    { value: 'financeiro', label: 'Financeiro', dept: 'Financeiro' },
  ],

  fillTeamRoleSelect(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = this.TEAM_ROLES.map(r => `<option value="${r.value}">${r.label}</option>`).join('');
  },

  roleDept(role) {
    return this.TEAM_ROLES.find(x => x.value === role)?.dept || 'Vendas';
  },

  renderCheckboxesHtml() {
    return this.MODULE_GROUPS.map((g) => `
      <div style="margin-top:${g.title === 'Operação' ? '0' : '16px'};">
        <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--color-text-muted);margin-bottom:8px;">${g.title}</div>
        <div class="partner-perms-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;">
          ${g.keys.map(k => `
            <label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;cursor:${g.disabled ? 'not-allowed' : 'pointer'};opacity:${g.disabled ? '.65' : '1'};">
              <input type="checkbox" data-partner-perm="${k}" ${g.disabled ? 'disabled' : ''} style="margin-top:3px;"/>
              <span>${this.LABELS[k] || k}</span>
            </label>`).join('')}
        </div>
      </div>`).join('');
  },

  renderTeamPermsHtml() {
    const label = (k) => this.TEAM_LABELS[k] || this.LABELS[k] || k;
    return `<p style="font-size:12px;color:var(--color-text-muted);margin:0 0 10px;">Marque o que cada cargo da equipe pode fazer. Só vale se o módulo estiver ativo em &quot;Funções da organização&quot; acima.</p>`
      + this.TEAM_ROLES.map((role) => `
      <details class="partner-team-role-perms" style="margin-top:10px;border:1px solid var(--color-border);border-radius:var(--radius-md);padding:8px 12px;">
        <summary style="font-weight:800;font-size:13px;cursor:pointer;list-style:none;">${role.label}</summary>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;margin-top:10px;">
          ${this.TEAM_PERM_KEYS.map((k) => `
            <label style="display:flex;align-items:flex-start;gap:6px;font-size:12px;cursor:pointer;">
              <input type="checkbox" data-partner-team-role="${role.value}" data-partner-team-perm="${k}" style="margin-top:2px;"/>
              <span>${label(k)}</span>
            </label>`).join('')}
        </div>
      </details>`).join('');
  },
};

window.PartnerPerms = PartnerPerms;
window.PARTNER_COMMISSION_TIERS = PARTNER_COMMISSION_TIERS;
