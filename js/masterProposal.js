/* ==========================================================
   SOU + BLU – Master Proposal Manager v3 [OTIMIZADO]
   ========================================================== */

// Reuso do utilitário de CPF (idealmente centralizado em utils.js, mas mantido aqui para independência do módulo)
const CPFUtils = {
  isValid(cpf) {
    cpf = cpf.replace(/\D/g, '');
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
    let sum = 0, rest;
    for (let i = 1; i <= 9; i++) sum += parseInt(cpf.substring(i-1, i)) * (11 - i);
    rest = (sum * 10) % 11;
    if (rest === 10 || rest === 11) rest = 0;
    if (rest !== parseInt(cpf.substring(9, 10))) return false;
    sum = 0;
    for (let i = 1; i <= 10; i++) sum += parseInt(cpf.substring(i-1, i)) * (12 - i);
    rest = (sum * 10) % 11;
    if (rest === 10 || rest === 11) rest = 0;
    return rest === parseInt(cpf.substring(10, 11));
  }
};

window.masterProposalManager = {
  init() {
    // Reset da Interface — o formulário inteiro (CPF + dados da proposta) já fica visível
    // de uma vez; a busca do CPF só preenche os dados do cliente automaticamente.
    const fields = [
      'masterPropCpf', 'masterPropProduct', 'masterPropConvenio',
      'masterPropEntidade', 'masterPropObs', 'masterPropClientName'
    ];

    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    const summary = document.getElementById('masterPropClientSummary');
    if (summary) {
      summary.style.color = 'var(--color-text-muted)';
      summary.innerHTML = 'Digite o CPF acima para buscar os dados do cliente.';
    }

    const popup = document.getElementById('masterPropCpfPopup');
    if (popup) popup.style.display = 'none';
  },

  // Abre o pop-up (modal) de "Nova Proposta", igual ao de "Novo Cliente"
  openModal() {
    this.init();
    if (typeof openModal === 'function') openModal('masterProposalModal');
    else document.getElementById('masterProposalModal')?.classList.add('open');
  },

  closeModal() {
    if (typeof closeModal === 'function') closeModal('masterProposalModal');
    else document.getElementById('masterProposalModal')?.classList.remove('open');
  },

  // Dispara a busca automaticamente enquanto o usuário digita o CPF.
  // Assim que completar 11 dígitos, o pop-up aparece sozinho (sem precisar clicar em "Buscar Cliente").
  _cpfPopupTimer: null,

  onCpfInput() {
    const input = document.getElementById('masterPropCpf');
    const popup = document.getElementById('masterPropCpfPopup');
    if (!input) return;

    const cpf = input.value.replace(/\D/g, '');
    clearTimeout(this._cpfPopupTimer);

    // CPF incompleto/alterado: some com o pop-up e invalida o cliente já encontrado
    // (evita enviar a proposta com o nome de um cliente de outro CPF).
    const nameField = document.getElementById('masterPropClientName');
    if (nameField) nameField.value = '';
    const summary = document.getElementById('masterPropClientSummary');
    if (summary) {
      summary.style.color = 'var(--color-text-muted)';
      summary.innerHTML = 'Digite o CPF acima para buscar os dados do cliente.';
    }

    if (cpf.length !== 11) {
      if (popup) popup.style.display = 'none';
      return;
    }

    // pequeno debounce para não buscar a cada tecla enquanto ainda digita
    this._cpfPopupTimer = setTimeout(() => {
      this.searchCpf({ silent: true });
    }, 350);
  },

  async _findClientByCpf(cpf) {
    if (typeof DB.getClientByCpf === 'function') {
      const hit = await DB.getClientByCpf(cpf).catch(() => null);
      if (hit) return hit;
    }
    if (typeof DB.findClientByCpf === 'function') {
      const hit = await DB.findClientByCpf(cpf).catch(() => null);
      if (hit) return hit;
    }
    return DB.get('clients', cpf).catch(() => null);
  },

  async searchCpf(opts) {
    opts = opts || {};
    const cpfInput = document.getElementById('masterPropCpf');
    const cpf = cpfInput.value.replace(/\D/g, '');
    const popup = document.getElementById('masterPropCpfPopup');

    if (!CPFUtils.isValid(cpf)) {
      if (!opts.silent) showToast("Por favor, digite um CPF válido.", 'warning');
      return;
    }

    let btn = null;
    let oldText = '';
    if (opts.silent) {
      if (popup) {
        popup.className = 'prop-cpf-popup';
        popup.style.display = 'block';
        popup.innerHTML = '<span style="color:var(--color-text-muted);">Buscando cliente...</span>';
      }
    } else {
      btn = (typeof event !== 'undefined' && event && event.target) || document.querySelector('#masterProposalModal .btn-primary');
      oldText = btn ? btn.innerText : 'Buscar Cliente';
      if (btn) { btn.innerText = 'Buscando...'; btn.disabled = true; }
    }

    try {
      const client = await this._findClientByCpf(cpf);
      const summary = document.getElementById('masterPropClientSummary');

      if (client) {
        if (summary) {
          summary.style.color = '';
          summary.innerHTML = `
            <strong>Nome:</strong> ${client.name}<br>
            <strong>Celular:</strong> ${client.phone1 || 'Não informado'}<br>
            <strong>Email:</strong> ${client.email || 'Não informado'}
          `;
        }
        document.getElementById('masterPropClientName').value = client.name;

        if (popup) {
          popup.className = 'prop-cpf-popup prop-cpf-popup--found';
          popup.innerHTML = `✓ Cliente encontrado: <strong>${client.name}</strong>`;
          setTimeout(() => { popup.style.display = 'none'; }, 1800);
        }
        if (!opts.silent) showToast("Cliente encontrado!", 'success');
      } else {
        document.getElementById('masterPropClientName').value = '';
        if (summary) {
          summary.style.color = 'var(--color-danger)';
          summary.innerHTML = "Cliente não encontrado. Vá em 'Clientes' e cadastre primeiro.";
        }
        if (popup) {
          popup.className = 'prop-cpf-popup prop-cpf-popup--notfound';
          popup.innerHTML = "Cliente não encontrado. Vá em 'Clientes' e cadastre primeiro.";
        }
        if (!opts.silent) showToast("Cliente não encontrado. Cadastre-o primeiro.", 'warning');
      }
    } catch (e) {
      console.error(e);
      if (popup && opts.silent) {
        popup.className = 'prop-cpf-popup prop-cpf-popup--notfound';
        popup.innerHTML = "Erro ao buscar cliente.";
      } else if (!opts.silent) {
        showToast("Erro ao buscar cliente: " + e.message, 'error');
      }
    } finally {
      if (btn) {
        btn.innerText = oldText;
        btn.disabled = false;
      }
    }
  },

  async submit() {
    const user = Auth.getSession();
    if (!user) return showToast("Erro de autenticação. Faça login novamente.", 'error');

    const cpf = document.getElementById('masterPropCpf').value.replace(/\D/g, '');
    const name = document.getElementById('masterPropClientName').value;
    const product = document.getElementById('masterPropProduct').value;
    const convenio = document.getElementById('masterPropConvenio').value;
    const entidade = document.getElementById('masterPropEntidade').value;
    const obs = document.getElementById('masterPropObs').value;
    
    if (!cpf || !name || !product) {
      return showToast("Preencha os campos obrigatórios (CPF, Cliente, Produto).", 'warning');
    }

    const saveBtn = document.getElementById('masterPropSubmitBtn');
    const oldText = saveBtn.innerText;
    
    saveBtn.innerText = 'Enviando...';
    saveBtn.disabled = true;

    try {
      const proposal = {
        id: `PROP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
        vendorId: user.id,
        vendorName: user.name,
        clientCpf: cpf,
        client_cpf: cpf,
        clientName: name,
        client_name: name,
        vendor_id: user.id,
        vendor_name: user.name,
        employee_id: user.id,
        product,
        convenio,
        entidade,
        obs,
        attachments: {},
        status: 'Em Andamento',
        history: [{
          date: new Date().toISOString(),
          actorName: user.name,
          action: 'Proposta Criada pelo Master',
          note: obs
        }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await DB.save('proposals', proposal);
      try {
        if (window.Proposals?._ensureClientRecordForProposal) {
          await Proposals._ensureClientRecordForProposal(proposal, null);
        }
      } catch (syncErr) {
        console.warn('[masterProposal] sync client:', syncErr);
      }
      
      showToast(`Proposta cadastrada! ID: ${proposal.id}`, 'success');
      this.closeModal();
      this.init();

      // Atualiza a lista na UI se o objeto Proposals existir
      if (window.Proposals?.renderAdminList) {
        await window.Proposals.renderAdminList();
      }
    } catch(e) {
      console.error(e);
      showToast("Erro ao enviar proposta: " + e.message, 'error');
    } finally {
      if (saveBtn) { 
        saveBtn.innerText = oldText; 
        saveBtn.disabled = false; 
      }
    }
  }
};

window.addEventListener('DOMContentLoaded', () => {
  if (window.masterProposalManager) {
    window.masterProposalManager.init();
  }
});