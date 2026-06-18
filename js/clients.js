// Atualiza label com nome do arquivo e botão de visualização
function updateFileLabel(inputId, labelId) {
  const input = document.getElementById(inputId);
  const label = document.getElementById(labelId);
  if (!input || !label) return;
  const f = input.files && input.files[0];
  if (f) {
    const url = URL.createObjectURL(f);
    label.innerHTML =
      `<span style="color:var(--color-success);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px;display:inline-block;vertical-align:middle;" title="${f.name}">${f.name}</span>` +
      `<a href="${url}" target="_blank" title="Visualizar" style="margin-left:6px;font-size:18px;text-decoration:none;vertical-align:middle;">👁</a>`;
  } else {
    label.innerHTML = '<span style="color:#999;">-</span>';
  }
}

window.Clients = {
  _cpfLookupTimer: null,
  _cpfLookupBound: false,

  init: function() {
    this._bindCpfLookup();
  },

  _setCpfStatus: function(msg, type) {
    let el = document.getElementById('clientCpfStatus');
    if (!el) {
      const cpfInput = document.getElementById('clientCpf');
      if (!cpfInput?.parentNode) return;
      el = document.createElement('div');
      el.id = 'clientCpfStatus';
      el.style.cssText = 'font-size:12px;margin-top:6px;';
      cpfInput.parentNode.appendChild(el);
    }
    const colors = {
      muted: 'var(--color-text-muted)',
      success: 'var(--color-success)',
      warning: 'var(--color-warning)',
      error: 'var(--color-danger)',
    };
    el.style.color = colors[type] || colors.muted;
    el.textContent = msg || '';
  },

  _bindCpfLookup: function() {
    if (this._cpfLookupBound) return;
    const cpfEl = document.getElementById('clientCpf');
    if (!cpfEl) return;
    this._cpfLookupBound = true;

    const schedule = () => {
      clearTimeout(this._cpfLookupTimer);
      this._cpfLookupTimer = setTimeout(() => this._onCpfInput(), 500);
    };

    cpfEl.addEventListener('input', () => {
      const digits = cpfEl.value.replace(/\D/g, '');
      if (typeof formatPixKey === 'function' && digits.length <= 11) {
        cpfEl.value = formatPixKey('cpf', digits);
      }
      if (digits.length < 11) {
        this._setCpfStatus(digits.length ? 'Digite os 11 dígitos do CPF para buscar os dados.' : '', 'muted');
        return;
      }
      this._setCpfStatus('CPF completo — buscando dados…', 'muted');
      schedule();
    });
    cpfEl.addEventListener('blur', () => this._onCpfInput());
  },

  _applyFonteDataToForm: function(client, onlyEmpty) {
    if (!client) return;
    const map = {
      clientCpf: client.cpf,
      clientName: client.name,
      clientPhone1: client.phone1,
      clientPhone2: client.phone2,
      clientEmail: client.email,
      clientMother: client.motherName,
      clientFather: client.fatherName,
      clientAddress: client.address,
      clientCivil: client.civilState,
    };
    Object.keys(map).forEach(id => {
      const el = document.getElementById(id);
      const val = map[id];
      if (!el || val == null || String(val).trim() === '') return;
      if (onlyEmpty && String(el.value || '').trim() !== '') return;
      if (id === 'clientCpf' && typeof formatPixKey === 'function') {
        el.value = formatPixKey('cpf', String(val).replace(/\D/g, ''));
      } else {
        el.value = val;
      }
    });
  },

  _onCpfInput: async function() {
    const cpfEl = document.getElementById('clientCpf');
    if (!cpfEl || typeof FonteData === 'undefined') return;

    const cpf = cpfEl.value.replace(/\D/g, '');
    if (cpf.length !== 11) return;

    const modal = document.getElementById('clientModal');
    const onlyEmpty = !!modal?.dataset?.editCpf;

    try {
      const local = typeof DB.getClientByCpf === 'function'
        ? await DB.getClientByCpf(cpf).catch(() => null)
        : null;
      if (local?.name) {
        this._applyFonteDataToForm({
          cpf: local.cpf || cpf,
          name: local.name,
          phone1: local.phone1,
          phone2: local.phone2,
          email: local.email,
          motherName: local.motherName,
          fatherName: local.fatherName,
          address: local.address,
          civilState: local.civilState,
        }, onlyEmpty);
        if (!onlyEmpty) {
          const rgEl = document.getElementById('clientRg');
          if (rgEl && local.rg) rgEl.value = local.rg;
        }
        this._setCpfStatus('Cliente já cadastrado — dados carregados do sistema.', 'success');
        return;
      }
    } catch (_) { /* segue FonteData */ }

    this._setCpfStatus('Consultando FonteData…', 'muted');
    const res = await FonteData.lookupCpf(cpf);
    if (!res.ok) {
      this._setCpfStatus(res.error || 'Não foi possível consultar o CPF.', 'warning');
      return;
    }
    this._applyFonteDataToForm(res.client, onlyEmpty);
    this._setCpfStatus('Dados preenchidos automaticamente (FonteData). Revise antes de salvar.', 'success');
    if (typeof showToast === 'function') {
      showToast('Dados do CPF carregados. Confira nome, telefone e endereço.', 'success', 5000);
    }
  },

  openModal: function() {
    try {
      const fields = [
        'clientCpf', 'clientName', 'clientPhone1', 'clientPhone2', 
        'clientRg', 'clientCivil', 'clientAddress', 'clientEmail', 
        'clientMother', 'clientFather', 'clientRgFront', 'clientRgBack', 'clientAddressDoc'
      ];
      
      fields.forEach(f => {
        const el = document.getElementById(f);
        if (el) el.value = '';
      });

      ['clientRgFrontLabel', 'clientRgBackLabel', 'clientAddressDocLabel'].forEach(id => {
        const lbl = document.getElementById(id);
        if (lbl) { lbl.textContent = '-'; lbl.style.color = '#999'; }
      });

      this._setCpfStatus('Informe o CPF — os dados serão buscados automaticamente.', 'muted');

      const modal = document.getElementById('clientModal');
      if (modal) {
        delete modal.dataset.editCpf;
        modal.classList.add('open');
      } else {
        alert("Erro: O formulário de cliente não foi encontrado.");
      }
    } catch (e) {
      alert("Erro ao abrir formulário: " + e.message);
    }
  },

  _notify: function(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type || 'warning', 6000);
    else alert(msg);
  },

  _cpfDigits(cpf) {
    return String(cpf || '').replace(/\D/g, '');
  },

  _escCpf(cpf) {
    return this._cpfDigits(cpf).replace(/'/g, '');
  },

  /** Botões de ação em linha (ícones) — tabela admin e cards do vendedor */
  actionsRowHtml(cpf, opts = {}) {
    const k = this._escCpf(cpf);
    const employee = !!opts.employee;
    const onEdit = employee ? `Clients.edit('${k}')` : `editClientAdmin('${k}')`;
    const onView = employee ? '' : `viewClientDetails('${k}')`;
    const showDelete = this.mayDeleteClients();
    const onDelete = `Clients.deleteClient('${k}')`;
    const pen = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
    const eye = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const trash = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    const viewBtn = onView
      ? `<button type="button" class="client-actions__btn" title="Ver detalhes" aria-label="Ver cliente" onclick="${onView}">${eye}</button>`
      : '';
    const deleteBtn = showDelete
      ? `<button type="button" class="client-actions__btn client-actions__btn--danger" title="Excluir" aria-label="Excluir cliente" onclick="${onDelete}">${trash}</button>`
      : '';
    return `<div class="client-actions" role="group" aria-label="Ações do cliente">
      <button type="button" class="client-actions__btn" title="Editar" aria-label="Editar cliente" onclick="${onEdit}">${pen}</button>
      ${viewBtn}
      ${deleteBtn}
    </div>`;
  },

  /** Papéis que podem ver o botão excluir (validação fina em canDelete). */
  mayDeleteClients(user) {
    const u = user || (typeof Auth !== 'undefined' ? Auth.getSession() : null);
    if (!u?.id) return false;
    if (typeof Auth !== 'undefined' && typeof Auth.isMaster === 'function' && Auth.isMaster()) {
      return true;
    }
    const role = String(u.role || '').toLowerCase();
    return role === 'gerente' || role === 'gerencia' || role === 'sup_backoffice';
  },

  async canDelete(client, user) {
    const c = client;
    const u = user || (typeof Auth !== 'undefined' ? Auth.getSession() : null);
    if (!c || !u?.id) return false;
    if (typeof Auth !== 'undefined' && typeof Auth.isMaster === 'function' && Auth.isMaster()) {
      return true;
    }
    const role = String(u.role || '').toLowerCase();
    if (role === 'gerente' || role === 'gerencia') return true;
    const ownerId = String(c.supervisorId || c.supervisor_id || '');
    if (role === 'sup_backoffice') {
      if (ownerId === String(u.id)) return true;
      try {
        const team = typeof DB.getTeamMemberIds === 'function'
          ? await DB.getTeamMemberIds(u.id)
          : [];
        if (team.some(id => String(id) === ownerId)) return true;
      } catch (_) { /* noop */ }
    }
    if (typeof PARTNER_ROOT_ID !== 'undefined' && PARTNER_ROOT_ID && typeof DB.getPartnerTeamIds === 'function') {
      try {
        const set = await DB.getPartnerTeamIds(PARTNER_ROOT_ID);
        if (set.has(ownerId) && (role === 'parceiro' || u.role === 'parceiro')) return true;
      } catch (_) { /* noop */ }
    }
    return false;
  },

  async _proposalCountForCpf(cpf) {
    const digits = this._cpfDigits(cpf);
    if (!digits) return 0;
    let rows = [];
    try {
      if (typeof DB.listProposals === 'function') rows = await DB.listProposals();
      else if (typeof DB.list === 'function') rows = await DB.list('proposals');
    } catch (_) { rows = []; }
    return (rows || []).filter(p =>
      this._cpfDigits(p.clientCpf || p.client_cpf) === digits
    ).length;
  },

  async edit(cpf) {
    const digits = this._cpfDigits(cpf);
    if (digits.length !== 11) {
      this._notify('CPF inválido.', 'warning');
      return;
    }
    const client = typeof DB.getClientByCpf === 'function'
      ? await DB.getClientByCpf(digits)
      : await DB.get('clients', digits);
    if (!client) {
      this._notify('Cliente não encontrado.', 'error');
      return;
    }
    const me = typeof Auth !== 'undefined'
      ? ((await Auth.getCurrentUser()) || Auth.getSession())
      : null;
    if (!(await this.canDelete(client, me))) {
      this._notify('Sem permissão para editar este cliente.', 'warning');
      return;
    }
    const fields = [
      'clientCpf', 'clientName', 'clientPhone1', 'clientPhone2',
      'clientRg', 'clientCivil', 'clientAddress', 'clientEmail',
      'clientMother', 'clientFather',
    ];
    const values = {
      clientCpf: client.cpf || digits,
      clientName: client.name || '',
      clientPhone1: client.phone1 || '',
      clientPhone2: client.phone2 || '',
      clientRg: client.rg || '',
      clientCivil: client.civilState || '',
      clientAddress: client.address || '',
      clientEmail: client.email || '',
      clientMother: client.motherName || '',
      clientFather: client.fatherName || '',
    };
    fields.forEach(f => {
      const el = document.getElementById(f);
      if (el) el.value = values[f] || '';
    });
    ['clientRgFrontLabel', 'clientRgBackLabel', 'clientAddressDocLabel'].forEach(id => {
      const lbl = document.getElementById(id);
      if (lbl) {
        lbl.textContent = '— (mantém o anterior se não enviar novo)';
        lbl.style.color = 'var(--color-text-muted)';
      }
    });
    const modal = document.getElementById('clientModal');
    if (modal) {
      modal.dataset.editCpf = digits;
      modal.classList.add('open');
    }
    this._setCpfStatus('Edição — documentos só são obrigatórios em cadastro novo.', 'muted');
    this._bindCpfLookup();
  },

  async deleteClient(cpf) {
    const digits = this._cpfDigits(cpf);
    if (digits.length !== 11) {
      this._notify('CPF inválido.', 'warning');
      return;
    }
    const client = typeof DB.getClientByCpf === 'function'
      ? await DB.getClientByCpf(digits)
      : await DB.get('clients', digits);
    if (!client) {
      this._notify('Cliente não encontrado.', 'error');
      return;
    }
    const me = typeof Auth !== 'undefined'
      ? ((await Auth.getCurrentUser()) || Auth.getSession())
      : null;
    if (!(await this.canDelete(client, me))) {
      this._notify('Sem permissão para excluir este cliente.', 'warning');
      return;
    }
    const propCount = await this._proposalCountForCpf(digits);
    let msg = `Excluir o cliente ${client.name || ''} (CPF ${client.cpf || digits})? Esta ação não pode ser desfeita.`;
    if (propCount > 0) {
      msg += `\n\nAtenção: existem ${propCount} proposta(s) vinculadas a este CPF. O cadastro do cliente será removido; as propostas permanecem no sistema.`;
    }
    if (!confirm(msg)) return;

    if (typeof showLoading === 'function') showLoading('Excluindo cliente…');
    try {
      const deleteId = String(client.id || digits).replace(/\D/g, '') || digits;
      if (typeof DB.delete === 'function') {
        await DB.delete('clients', deleteId);
      }
      if (DB._lget && DB._lset && DB.LK?.clients) {
        const list = (DB._lget(DB.LK.clients) || []).filter(c => {
          const id = this._cpfDigits(c.id);
          const cp = this._cpfDigits(c.cpf);
          return id !== digits && cp !== digits;
        });
        DB._lset(DB.LK.clients, list);
      }
      if (typeof invalidateClientsListCache === 'function') invalidateClientsListCache();
      if (typeof renderClientsTable === 'function') await renderClientsTable(true);
      else await this.renderEmployeeList();
      if (typeof PartnerOps !== 'undefined' && PartnerOps.renderClientsTable) {
        try { await PartnerOps.renderClientsTable(); } catch (_) { /* noop */ }
      }
      this._notify('Cliente excluído.', 'success');
    } catch (e) {
      console.error('[Clients.deleteClient]', e);
      this._notify('Erro ao excluir: ' + (e.message || e), 'error');
    } finally {
      if (typeof hideLoading === 'function') hideLoading();
    }
  },

  readFileAsBase64: function(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  },

  save: async function() {
    try {
      const cpfStr = document.getElementById('clientCpf').value;
      const cpf = cpfStr.replace(/\D/g, '');
      const name = document.getElementById('clientName').value;

      if (!cpf || cpf.length !== 11) {
        alert("Por favor, digite um CPF válido com 11 dígitos.");
        return;
      }
      if (!name) {
        alert("Por favor, digite o nome completo.");
        return;
      }

      const modal = document.getElementById('clientModal');
      const editCpf = modal?.dataset?.editCpf
        ? String(modal.dataset.editCpf).replace(/\D/g, '')
        : '';
      const isEdit = !!editCpf && editCpf === cpf;

      let existing = null;
      if (typeof DB.findClientByCpf === 'function') {
        existing = await DB.findClientByCpf(cpf);
      } else if (typeof DB.getClientByCpf === 'function') {
        existing = await DB.getClientByCpf(cpf);
      }
      if (existing && !isEdit) {
        const quem = existing.name ? ` (${existing.name})` : '';
        this._notify(`Este cliente já está cadastrado${quem}. O CPF informado não pode ser cadastrado novamente.`, 'warning');
        return;
      }
      if (existing && editCpf && editCpf !== cpf) {
        this._notify('Este CPF já pertence a outro cliente cadastrado.', 'warning');
        return;
      }

      const rgFrontFile = document.getElementById('clientRgFront').files[0];
      const rgBackFile = document.getElementById('clientRgBack').files[0];
      const addressFile = document.getElementById('clientAddressDoc').files[0];

      if (!isEdit) {
        if (!rgFrontFile) {
          alert('⚠️ RG Frente é obrigatório!');
          return;
        }
        if (!rgBackFile) {
          alert('⚠️ RG Verso é obrigatório!');
          return;
        }
        if (!addressFile) {
          alert('⚠️ Comprovante de Endereço é obrigatório!');
          return;
        }
      }

      // Change button text
      const saveBtn = document.querySelector('#clientModal .btn-primary');
      let oldText = 'Salvar Cliente';
      if (saveBtn) {
        oldText = saveBtn.innerText;
        saveBtn.innerText = 'Salvando...';
        saveBtn.disabled = true;
      }

      let documents = existing?.documents || null;
      if (rgFrontFile || rgBackFile || addressFile) {
        documents = {
          rgFront: rgFrontFile ? { name: rgFrontFile.name, size: rgFrontFile.size, type: rgFrontFile.type } : (documents?.rgFront || null),
          rgBack: rgBackFile ? { name: rgBackFile.name, size: rgBackFile.size, type: rgBackFile.type } : (documents?.rgBack || null),
          address: addressFile ? { name: addressFile.name, size: addressFile.size, type: addressFile.type } : (documents?.address || null),
        };
      }

      const session = Auth.getSession();
      const supervisorId = session?.id || '';
      const clientData = {
        id: cpf,
        cpf: cpf,
        name: name,
        supervisorId,
        supervisor_id: supervisorId,
        phone1: document.getElementById('clientPhone1').value,
        phone2: document.getElementById('clientPhone2').value,
        rg: document.getElementById('clientRg').value,
        civilState: document.getElementById('clientCivil').value,
        civil_state: document.getElementById('clientCivil').value,
        address: document.getElementById('clientAddress').value,
        email: document.getElementById('clientEmail').value,
        motherName: document.getElementById('clientMother').value,
        mother_name: document.getElementById('clientMother').value,
        fatherName: document.getElementById('clientFather').value,
        father_name: document.getElementById('clientFather').value,
        documents: documents,
        updatedAt: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (!isEdit) {
        const now = new Date().toISOString();
        clientData.created_at = now;
      }

      if (editCpf && editCpf !== cpf) {
        try { await DB.delete('clients', editCpf); } catch(e) {}
      }
      if (modal) delete modal.dataset.editCpf;

      try {
        await DB.save('clients', clientData);
      } catch (e) {
        console.warn('Erro ao salvar em Supabase, tentando localStorage:', e.message);
        if (DB._lget && DB._lset) {
          const clients = DB._lget(DB.LK.clients) || [];
          const idx = clients.findIndex((c) => {
            const id = String(c.id || '').replace(/\D/g, '');
            const cp = String(c.cpf || '').replace(/\D/g, '');
            return id === cpf || cp === cpf;
          });
          if (!isEdit && idx >= 0) {
            if (saveBtn) { saveBtn.innerText = oldText; saveBtn.disabled = false; }
            this._notify('Este cliente já está cadastrado.', 'warning');
            return;
          }
          if (idx >= 0) clients[idx] = clientData;
          else clients.push(clientData);
          DB._lset(DB.LK.clients, clients);
        }
      }

      if (saveBtn) { saveBtn.innerText = oldText; saveBtn.disabled = false; }
      this._notify('Cliente salvo com sucesso!', 'success');
      document.getElementById('clientModal').classList.remove('open');
      if (typeof invalidateClientsListCache === 'function') invalidateClientsListCache();
      if (typeof renderClientsTable === 'function') await renderClientsTable(true);
      else await this.renderEmployeeList();
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar cliente: " + e.message);
      const saveBtn = document.querySelector('#clientModal .btn-primary');
      if (saveBtn) { saveBtn.innerText = 'Salvar Cliente'; saveBtn.disabled = false; }
    }
  },

  renderEmployeeList: async function() {
    try {
      const listEl = document.getElementById('clientsList');
      if (!listEl) return;

      const user = typeof Auth !== 'undefined' ? await Auth.getCurrentUser() : null;
      const clients = await DB.getClients({
        supervisorId: user?.id,
        pageSize: 500,
      }) || [];
      
      if (clients.length === 0) {
        listEl.innerHTML = '<p>Nenhum cliente cadastrado.</p>';
        return;
      }

      const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      let html = '';
      clients.forEach(c => {
        const cpfKey = this._escCpf(c.cpf || c.id);
        html += `
            <div class="card" style="padding: 16px; margin-bottom: 12px; display:flex; gap: 16px; align-items:center;">
               ${typeof avatarHtml === 'function' ? avatarHtml(c.name, 'avatar-md') : ''}
               <div style="flex:1;min-width:0;">
                 <div style="display:flex; justify-content: space-between; align-items:flex-start; gap:8px; margin-bottom: 4px;">
                    <strong style="font-size:16px; font-weight:700;">${esc(c.name)}</strong>
                    <div style="flex-shrink:0;">${this.actionsRowHtml(cpfKey, { employee: true })}</div>
                 </div>
                 <div style="font-size:14px; margin-bottom:2px;">CPF: ${esc(c.cpf)} &nbsp;|&nbsp; RG: ${esc(c.rg) || 'Não informado'}</div>
                 <div style="color: var(--color-text-muted); font-size: 13px;">Celular: ${esc(c.phone1) || 'Não informado'} &nbsp;|&nbsp; Email: ${esc(c.email) || 'Não informado'}</div>
               </div>
            </div>
          `;
      });
      listEl.innerHTML = html;
    } catch (e) {
      console.error("Erro ao listar clientes", e);
    }
  }
};

window.addEventListener('DOMContentLoaded', () => {
    if (typeof Clients.init === 'function') Clients.init();
    if (document.getElementById('clientsList')) {
        Clients.renderEmployeeList();
    }
});