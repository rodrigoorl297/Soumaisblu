/**
 * "Solicite um Número" — estoque de chips de WhatsApp da empresa.
 * Vendedor pega um número disponível direto da lista (sem aprovação);
 * Supervisão / T.I. / Gerência cadastram, bloqueiam e liberam números.
 */
window.WaNumberRequests = {
  _actionsWired: false,
  _adminFilter: 'all',
  _adminSearch: '',
  _lastRows: [],

  /** Supervisão, T.I./Desenvolvimento e Gerência/Master administram o estoque. */
  canManage: function() {
    const s = typeof Auth !== 'undefined' && Auth.getSession ? Auth.getSession() : null;
    if (!s) return false;
    if (typeof Auth.isMaster === 'function' && Auth.isMaster()) return true;
    if (typeof Auth.hasMasterPanel === 'function' && Auth.hasMasterPanel()) return true;
    const role = String(s.role || '').toLowerCase();
    return [
      'supervisor', 'sup_backoffice', 'desenvolvedor',
      'gerencia', 'gerente', 'master', 'fundador', 'diretoria',
    ].includes(role);
  },

  _escAttr: function(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  },

  /** DDD + número, sem o 55 — mesma chave de deduplicação do api/chipeira_numbers.php. */
  _nationalDigits: function(raw) {
    let d = String(raw || '').replace(/\D+/g, '').replace(/^0+/, '');
    if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
    return d;
  },

  /** (11) 96273-0069 — mesmo formato que a Chipeira grava. */
  _formatNumber: function(national) {
    const split = national.length === 11 ? 7 : 6;
    return `(${national.slice(0, 2)}) ${national.slice(2, split)}-${national.slice(split)}`;
  },

  _statusMeta: function(status) {
    const s = String(status || 'disponivel').toLowerCase();
    if (s === 'em_uso') return { color: '#3b82f6', text: 'Em uso' };
    if (s === 'bloqueado') return { color: '#ef4444', text: 'Bloqueado' };
    return { color: '#10b981', text: 'Disponível' };
  },

  _norm: function(r) {
    if (!r) return r;
    return {
      ...r,
      number: r.number || '',
      status: r.status || 'disponivel',
      assignedTo: r.assignedTo || r.assigned_to || '',
      assignedToName: r.assignedToName || r.assigned_to_name || '',
      assignedAt: r.assignedAt || r.assigned_at || '',
      blockedReason: r.blockedReason || r.blocked_reason || '',
      note: r.note || '',
      createdAt: r.createdAt || r.created_at,
      updatedAt: r.updatedAt || r.updated_at,
    };
  },

  init: function() {
    this._applyNavVisibility();
  },

  _applyNavVisibility: function() {
    const nav = document.getElementById('navWaNumberRequests');
    if (nav) nav.style.display = this.canManage() ? '' : 'none';
  },

  _bindActions: function() {
    if (this._actionsWired) return;
    this._actionsWired = true;
    document.addEventListener('click', (ev) => {
      const registerBtn = ev.target.closest('[data-wanr-register]');
      if (registerBtn) { ev.preventDefault(); this.registerMine(); return; }
      const claimBtn = ev.target.closest('[data-wanr-claim]');
      if (claimBtn) { ev.preventDefault(); this.claim(claimBtn.getAttribute('data-wanr-claim')); return; }
      const releaseBtn = ev.target.closest('[data-wanr-release]');
      if (releaseBtn) { ev.preventDefault(); this.release(releaseBtn.getAttribute('data-wanr-release')); return; }
      const blockBtn = ev.target.closest('[data-wanr-block]');
      if (blockBtn) { ev.preventDefault(); this.block(blockBtn.getAttribute('data-wanr-block')); return; }
      const unblockBtn = ev.target.closest('[data-wanr-unblock]');
      if (unblockBtn) { ev.preventDefault(); this.unblock(unblockBtn.getAttribute('data-wanr-unblock')); return; }
      const delBtn = ev.target.closest('[data-wanr-delete]');
      if (delBtn) { ev.preventDefault(); this.remove(delBtn.getAttribute('data-wanr-delete')); return; }
      const filterBtn = ev.target.closest('[data-wanr-filter]');
      if (filterBtn) { ev.preventDefault(); this._setFilter(filterBtn.getAttribute('data-wanr-filter')); return; }
    }, true);
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && ev.target && ev.target.id === 'waMyNumberInput') {
        ev.preventDefault();
        this.registerMine();
      }
    });
    document.addEventListener('input', (ev) => {
      if (ev.target && ev.target.id === 'waNumberSearch') {
        this._adminSearch = ev.target.value || '';
        this._renderAdminTable(this._lastRows);
      }
    });
  },

  _setFilter: function(f) {
    this._adminFilter = f;
    document.querySelectorAll('[data-wanr-filter]').forEach((b) => {
      const active = b.getAttribute('data-wanr-filter') === f;
      b.classList.toggle('btn-primary', active);
      b.classList.toggle('btn-outline', !active);
    });
    this._renderAdminTable(this._lastRows);
  },

  async _fetchAll() {
    return ((await DB.list('wa_numbers')) || []).map((r) => this._norm(r));
  },

  _refreshAll: async function() {
    const jobs = [];
    if (document.getElementById('waMyNumberBox') || document.getElementById('waAvailableNumbersList')) {
      jobs.push(this.renderEmployeeList());
    }
    if (document.getElementById('waNumberRequestsTbody')) {
      jobs.push(this.renderAdminList());
    }
    await Promise.all(jobs);
  },

  /* ── Vendedor ── */

  renderEmployeeList: async function() {
    const box = document.getElementById('waMyNumberBox');
    const listEl = document.getElementById('waAvailableNumbersList');
    if (!box && !listEl) return;
    const user = typeof Auth !== 'undefined' && Auth.getSession ? Auth.getSession() : null;
    if (!user) return;

    let rows = [];
    try {
      rows = await this._fetchAll();
    } catch (e) {
      if (box) box.innerHTML = '<p style="color:var(--color-danger);">Erro ao carregar números.</p>';
      if (listEl) listEl.innerHTML = '';
      return;
    }

    const mine = rows.find((r) => r.status === 'em_uso' && String(r.assignedTo) === String(user.id));

    if (box) {
      const form = `
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:14px;">
          <input type="tel" id="waMyNumberInput" class="form-control" inputmode="tel" autocomplete="off" placeholder="(11) 96273-0069" style="max-width:240px;">
          <button type="button" class="btn btn-primary btn-sm" data-wanr-register>${mine ? 'Trocar número' : 'Estou usando este número'}</button>
        </div>
        <div style="font-size:12px;color:var(--color-text-muted);margin-top:6px;">Digite o WhatsApp que você está usando. Ele fica "Em uso" no seu nome e aparece na Chipeira.</div>`;
      if (mine) {
        box.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
            <div>
              <div style="font-size:20px; font-weight:800;">${this._escAttr(mine.number)} - ${this._escAttr(mine.assignedToName || user.name || '')}</div>
              <div style="font-size:12px;color:var(--color-text-muted);">Em uso desde ${mine.assignedAt ? formatDateTime(mine.assignedAt) : '—'}</div>
            </div>
            <button type="button" class="btn btn-outline btn-sm" data-wanr-release="${this._escAttr(mine.id)}">Liberar Número</button>
          </div>${form}`;
      } else {
        box.innerHTML = `<p>Você ainda não tem um número. Informe o que você já usa ou escolha um abaixo.</p>${form}`;
      }
    }

    if (listEl) {
      if (mine) {
        listEl.innerHTML = '<p style="color:var(--color-text-muted);">Você já tem um número em uso. Libere-o antes de pegar outro.</p>';
      } else {
        const available = rows.filter((r) => r.status === 'disponivel')
          .sort((a, b) => a.number.localeCompare(b.number));
        if (!available.length) {
          listEl.innerHTML = '<p>Nenhum número disponível no momento. Fale com Supervisão/T.I.</p>';
        } else {
          listEl.innerHTML = available.map((r) => `
            <div style="border:1px solid var(--color-border); border-radius: var(--radius-md); padding: 12px 15px; margin-bottom: 8px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
              <div>
                <strong>${this._escAttr(r.number)}</strong>
                ${r.note ? `<div style="font-size:12px;color:var(--color-text-muted);">${this._escAttr(r.note)}</div>` : ''}
              </div>
              <button type="button" class="btn btn-primary btn-sm" data-wanr-claim="${this._escAttr(r.id)}">Pegar</button>
            </div>`).join('');
        }
      }
    }
  },

  claim: async function(id) {
    const user = typeof Auth !== 'undefined' && Auth.getSession ? Auth.getSession() : null;
    if (!user) { alert('Sessão expirada. Faça login novamente.'); return; }
    try {
      const rows = await this._fetchAll();
      const already = rows.find((r) => r.status === 'em_uso' && String(r.assignedTo) === String(user.id));
      if (already) {
        alert('Você já tem um número em uso: ' + already.number + '. Libere-o antes de pegar outro.');
        return;
      }

      const raw = await DB.get('wa_numbers', id);
      const r = this._norm(raw);
      if (!r) { alert('Número não encontrado.'); return; }
      if (r.status !== 'disponivel') {
        alert('Esse número acabou de ser pego por outra pessoa. Escolha outro da lista.');
        await this._refreshAll();
        return;
      }

      const updated = {
        ...raw,
        status: 'em_uso',
        assigned_to: user.id,
        assigned_to_name: user.name,
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await DB.save('wa_numbers', updated);
      alert('Número ' + r.number + ' atribuído a você!');
      await this._refreshAll();
    } catch (e) {
      alert('Erro ao pegar número: ' + e.message);
    }
  },

  /**
   * Vincula um número a um vendedor: entra direto como "Em uso" no nome dele.
   * Número novo é cadastrado; número do estoque (ex: vindo da Chipeira) só é aceito se estiver disponível.
   * Se o vendedor já tinha outro número, o antigo volta pra "Disponível".
   * Retorna true quando vinculou.
   */
  _linkNumber: async function(rawNumber, target, opts = {}) {
    const national = this._nationalDigits(rawNumber);
    if (national.length < 10 || national.length > 11) {
      alert('Número inválido. Informe DDD + número, ex: (11) 96273-0069.');
      return false;
    }
    const number = this._formatNumber(national);
    const self = !!opts.self;
    const actor = opts.actor || target;

    try {
      const rows = await this._fetchAll();
      const current = rows.find((r) => r.status === 'em_uso' && (target.id
        ? String(r.assignedTo) === String(target.id)
        : !r.assignedTo && this._sameName(r.assignedToName, target.name)));
      const existing = rows.find((r) => this._nationalDigits(r.number) === national);

      if (existing && current && existing.id === current.id) {
        alert(self ? 'Esse já é o seu número.' : 'Esse número já está vinculado a ' + target.name + '.');
        return false;
      }
      if (existing && existing.status === 'bloqueado') {
        alert('Esse número está bloqueado. Fale com Supervisão/T.I.');
        return false;
      }
      if (existing && existing.status === 'em_uso') {
        alert('Esse número já está em uso por ' + (existing.assignedToName || 'outro vendedor') + '. Libere-o antes de vincular.');
        return false;
      }

      const now = new Date().toISOString();
      const assignment = {
        status: 'em_uso',
        assigned_to: target.id,
        assigned_to_name: target.name,
        assigned_at: now,
        updated_at: now,
      };

      // Atribui o novo antes de soltar o antigo — se falhar, o vendedor não fica sem número.
      if (existing) {
        const raw = await DB.get('wa_numbers', existing.id);
        const note = opts.note ? { note: opts.note } : {};
        await DB.save('wa_numbers', { ...raw, ...assignment, ...note });
      } else {
        await DB.save('wa_numbers', {
          id: 'WAN-' + Date.now(),
          number,
          note: opts.note || '',
          created_by: actor.id,
          created_by_name: actor.name,
          created_at: now,
          ...assignment,
        });
      }

      if (current) {
        const oldRaw = await DB.get('wa_numbers', current.id);
        if (oldRaw) {
          await DB.save('wa_numbers', {
            ...oldRaw,
            status: 'disponivel',
            assigned_to: '',
            assigned_to_name: '',
            assigned_at: null,
            updated_at: now,
          });
        }
      }

      alert(self
        ? 'Número ' + number + ' registrado como em uso por você!'
        : 'Número ' + number + ' vinculado a ' + target.name + '!');
      await this._refreshAll();
      return true;
    } catch (e) {
      const dup = /duplicad|23505|1062/i.test(e.message || '');
      alert(dup ? 'Esse número acabou de ser cadastrado por outra pessoa. Atualize a página.' : ('Erro ao vincular número: ' + e.message));
      return false;
    }
  },

  /** Vendedor informa o número que já está usando (painel do funcionário). */
  registerMine: async function() {
    const user = typeof Auth !== 'undefined' && Auth.getSession ? Auth.getSession() : null;
    if (!user) { alert('Sessão expirada. Faça login novamente.'); return; }
    const input = document.getElementById('waMyNumberInput');
    await this._linkNumber(input ? input.value : '', { id: user.id, name: user.name }, { self: true });
  },

  release: async function(id) {
    try {
      const raw = await DB.get('wa_numbers', id);
      if (!raw) return;
      const updated = {
        ...raw,
        status: 'disponivel',
        assigned_to: '',
        assigned_to_name: '',
        assigned_at: null,
        updated_at: new Date().toISOString(),
      };
      await DB.save('wa_numbers', updated);
      await this._refreshAll();
    } catch (e) {
      alert('Erro ao liberar número: ' + e.message);
    }
  },

  /* ── Admin (Supervisão / T.I. / Gerência) ── */

  /**
   * Vincular Número (admin): número + nome do vendedor digitado à mão.
   * Se o nome for o do próprio usuário logado, vincula pelo id dele (aparece no painel "Meu Número").
   */
  linkFromAdmin: async function() {
    const actor = typeof Auth !== 'undefined' && Auth.getSession ? Auth.getSession() : null;
    if (!actor) { alert('Sessão expirada. Faça login novamente.'); return; }
    const input = document.getElementById('waNewNumberInput');
    const nameInput = document.getElementById('waLinkUserName');
    const noteInput = document.getElementById('waNewNumberNote');
    const name = nameInput ? nameInput.value.trim().replace(/\s+/g, ' ') : '';
    if (!name) { alert('Informe o nome do vendedor.'); return; }
    const self = this._sameName(name, actor.name);
    const target = self ? { id: actor.id, name: actor.name } : { id: '', name };
    const ok = await this._linkNumber(input ? input.value : '', target, {
      actor: { id: actor.id, name: actor.name },
      self,
      note: noteInput ? noteInput.value.trim() : '',
    });
    if (ok) {
      if (input) input.value = '';
      if (nameInput) nameInput.value = '';
      if (noteInput) noteInput.value = '';
    }
  },

  _sameName: function(a, b) {
    const n = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return !!n(a) && n(a) === n(b);
  },

  block: async function(id) {
    const reason = window.prompt('Motivo do bloqueio (opcional):', '') || '';
    try {
      const raw = await DB.get('wa_numbers', id);
      if (!raw) return;
      const updated = {
        ...raw,
        status: 'bloqueado',
        blocked_reason: reason,
        assigned_to: '',
        assigned_to_name: '',
        assigned_at: null,
        updated_at: new Date().toISOString(),
      };
      await DB.save('wa_numbers', updated);
      await this.renderAdminList();
    } catch (e) {
      alert('Erro ao bloquear: ' + e.message);
    }
  },

  unblock: async function(id) {
    try {
      const raw = await DB.get('wa_numbers', id);
      if (!raw) return;
      const updated = { ...raw, status: 'disponivel', blocked_reason: '', updated_at: new Date().toISOString() };
      await DB.save('wa_numbers', updated);
      await this.renderAdminList();
    } catch (e) {
      alert('Erro ao desbloquear: ' + e.message);
    }
  },

  remove: async function(id) {
    try {
      const raw = await DB.get('wa_numbers', id);
      if (raw && String(raw.status) === 'em_uso') {
        alert('Esse número está em uso. Libere-o antes de remover.');
        return;
      }
      await DB.delete('wa_numbers', id);
      await this.renderAdminList();
    } catch (e) {
      alert('Erro ao remover: ' + e.message);
    }
  },

  renderAdminList: async function() {
    this._applyNavVisibility();
    const tbody = document.getElementById('waNumberRequestsTbody');
    if (!tbody || !this.canManage()) return;

    let rows = [];
    try {
      rows = await this._fetchAll();
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="5">Erro ao carregar números.</td></tr>';
      return;
    }
    rows.sort((a, b) => a.number.localeCompare(b.number));
    this._lastRows = rows;
    this._renderAdminTable(rows);
  },

  _renderSummary: function(rows) {
    const el = document.getElementById('waNumberSummary');
    if (!el) return;
    const count = (s) => rows.filter((r) => r.status === s).length;
    el.textContent = `${rows.length} número${rows.length === 1 ? '' : 's'} no total — `
      + `${count('disponivel')} disponível(is), ${count('em_uso')} em uso, ${count('bloqueado')} bloqueado(s)`;
  },

  _renderAdminTable: function(rows) {
    const tbody = document.getElementById('waNumberRequestsTbody');
    if (!tbody) return;
    this._renderSummary(rows);

    const filter = this._adminFilter || 'all';
    let filtered = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

    const q = String(this._adminSearch || '').trim().toLowerCase();
    if (q) {
      filtered = filtered.filter((r) =>
        r.number.toLowerCase().includes(q) || String(r.assignedToName || '').toLowerCase().includes(q)
      );
    }

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="5">Nenhum número encontrado.</td></tr>';
      return;
    }

    let html = '';
    filtered.forEach((r) => {
      const meta = this._statusMeta(r.status);
      // Sem Bloquear/Remover no painel. "Desbloquear" só aparece em números que já estavam bloqueados.
      let actions = '—';
      if (r.status === 'em_uso') {
        actions = `<button type="button" class="btn btn-outline btn-sm" data-wanr-release="${this._escAttr(r.id)}">Liberar</button>`;
      } else if (r.status === 'bloqueado') {
        actions = `<button type="button" class="btn btn-outline btn-sm" data-wanr-unblock="${this._escAttr(r.id)}">Desbloquear</button>`;
      }
      html += `
        <tr>
          <td>${this._escAttr(r.number)}</td>
          <td><span style="background:${meta.color}; color:white; padding: 2px 8px; border-radius: 12px; font-size: 12px;">${meta.text}</span></td>
          <td>${r.status === 'em_uso' ? this._escAttr(r.assignedToName || '—') : '—'}</td>
          <td>${this._escAttr(r.status === 'bloqueado' ? (r.blockedReason || r.note || '—') : (r.note || '—'))}</td>
          <td>${actions}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
  },
};

window.addEventListener('DOMContentLoaded', () => {
  WaNumberRequests.init();
  WaNumberRequests._bindActions();
  if (document.getElementById('waMyNumberBox') || document.getElementById('waAvailableNumbersList')) {
    WaNumberRequests.renderEmployeeList();
  }
  if (document.getElementById('waNumberRequestsTbody')) {
    WaNumberRequests.renderAdminList();
  }
});
