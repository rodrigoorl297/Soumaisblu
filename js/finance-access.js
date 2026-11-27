(function(){
  'use strict';
  const endpoint=new URL('../api/finance.php',document.currentScript.src);
  window.FinanceAccess={
    csrf:'',
    async request(action,data,form=false){
      const url=new URL(endpoint);url.searchParams.set('action',action);
      const response=await fetch(url,{method:data?'POST':'GET',credentials:'same-origin',headers:data?{'X-Finance-CSRF':this.csrf,...(form?{}:{'Content-Type':'application/json'})}:{},body:data?(form?data:JSON.stringify(data)):undefined});
      const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.message||'Falha no módulo financeiro.');
      if(result.csrf)this.csrf=result.csrf;return result;
    },
    async session(){const result=await this.request('session');const session=window.Auth?.getSession?.();if(session && result.user_id!==session.id)throw new Error('Confirme o acesso com o usuário atual.');return result;},
    async login(id,password){return this.request('login',{id,password});},
    async ensure(){
      try{return await this.session();}catch(e){
        if(!window.Auth?.getSession()?.id)throw e;
        return new Promise((resolve,reject)=>{
          const overlay=document.createElement('div');overlay.className='modal-overlay active';overlay.style.cssText='display:flex;z-index:99999';
          overlay.innerHTML='<div class="modal"><h3>Confirmar acesso financeiro</h3><p>Informe sua senha para autorizar operações no servidor.</p><form><input type="password" class="form-control" autocomplete="current-password" required aria-label="Sua senha"><p role="status"></p><button>Entrar</button><button type="button" data-cancel>Cancelar</button></form></div>';
          document.body.append(overlay);overlay.querySelector('input').focus();
          overlay.querySelector('[data-cancel]').onclick=()=>{overlay.remove();reject(new Error('Operação cancelada.'));};
          overlay.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=overlay.querySelector('button');button.disabled=true;try{const result=await this.login(Auth.getSession().id,overlay.querySelector('input').value);overlay.querySelector('input').value='';overlay.remove();resolve(result);}catch(error){overlay.querySelector('[role=status]').textContent=error.message;}finally{button.disabled=false;}};
        });
      }
    }
  };
})();

(function () {
  'use strict';

  const endpoint = new URL('../api/mercantil-consultas.php', document.currentScript.src);

  function addCustomerLookup() {
    if (!window.SOUBLU_ADMIN_PROFILE) return;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.textContent = 'Consulte o cliente';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.style.cssText = 'position:fixed;right:32px;bottom:82px;z-index:1000;border:0;border-radius:999px;background:#0d4385;color:#fff;padding:12px 18px;font:inherit;font-size:14px;font-weight:600;box-shadow:0 2px 8px #0c254333;cursor:pointer';

    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-labelledby', 'mercantil-lookup-title');
    dialog.style.cssText = 'width:min(420px, calc(100% - 32px));border:1px solid #dbe4ef;border-radius:16px;padding:24px;color:#0c2543';
    dialog.innerHTML = `
      <h2 id="mercantil-lookup-title">Consulte o cliente</h2>
      <p>Pré-simulação de crédito pessoal no Banco Mercantil.</p>
      <form>
        <label for="mercantil-cpf">CPF</label>
        <input class="form-control" id="mercantil-cpf" inputmode="numeric" maxlength="14" required>
        <label for="mercantil-beneficio">Número do benefício (opcional)</label>
        <input class="form-control" id="mercantil-beneficio" inputmode="numeric" maxlength="15" pattern="[0-9]*">
        <p role="status"></p>
        <button type="submit" class="btn btn-primary">Consultar</button>
        <button type="button" class="btn" data-close>Fechar</button>
      </form>`;
    document.body.append(trigger, dialog);

    const form = dialog.querySelector('form');
    const cpf = form.querySelector('#mercantil-cpf');
    const beneficio = form.querySelector('#mercantil-beneficio');
    const status = form.querySelector('[role="status"]');
    const submit = form.querySelector('[type="submit"]');
    let lookupId = null;
    let pollTimer;

    async function request(action, data) {
      const url = new URL(endpoint);
      url.searchParams.set('action', action);
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Finance-CSRF': window.FinanceAccess.csrf },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Não foi possível consultar o Mercantil.');
      return result;
    }

    async function checkStatus(remaining) {
      try {
        const result = await request('status', { id: lookupId });
        if (!dialog.open) return;
        if (result.concluido) {
          lookupId = null;
          status.textContent = 'Pré-simulação concluída pelo Mercantil.';
          submit.textContent = 'Consultar';
          submit.disabled = false;
        } else if (remaining > 0) {
          pollTimer = window.setTimeout(() => checkStatus(remaining - 1), 5000);
        } else {
          status.textContent = 'Aguardando retorno do Mercantil. Você pode atualizar o status.';
          submit.textContent = 'Atualizar status';
          submit.disabled = false;
        }
      } catch (error) {
        status.textContent = error.message;
        submit.textContent = 'Atualizar status';
        submit.disabled = false;
      }
    }

    trigger.addEventListener('click', async () => {
      trigger.disabled = true;
      try {
        await window.FinanceAccess.ensure();
        dialog.showModal();
        if (lookupId) {
          submit.disabled = true;
          status.textContent = 'Aguardando retorno do Mercantil…';
          await checkStatus(11);
        } else {
          cpf.focus();
        }
      } catch (error) {
        window.alert(error.message);
      } finally {
        trigger.disabled = false;
      }
    });
    form.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      window.clearTimeout(pollTimer);
      trigger.focus();
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      submit.disabled = true;
      if (lookupId) {
        status.textContent = 'Aguardando retorno do Mercantil…';
        await checkStatus(11);
        return;
      }
      const digits = cpf.value.replace(/[.\-\s]/g, '');
      if (!/^\d{11}$/.test(digits)) {
        status.textContent = 'Informe um CPF com 11 dígitos.';
        submit.disabled = false;
        cpf.focus();
        return;
      }
      status.textContent = 'Enviando consulta…';
      try {
        const result = await request('start', { cpf: digits, beneficio: beneficio.value.trim() });
        lookupId = result.id;
        form.reset();
        status.textContent = 'Consulta enviada. Aguardando retorno do Mercantil…';
        if (dialog.open) await checkStatus(11);
      } catch (error) {
        status.textContent = error.message;
        submit.disabled = false;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addCustomerLookup, { once: true });
  } else {
    addCustomerLookup();
  }
})();
