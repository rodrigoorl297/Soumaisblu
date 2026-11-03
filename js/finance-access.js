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
