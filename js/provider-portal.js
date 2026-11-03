(function(){
  'use strict';
  const get=id=>document.getElementById(id),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),money=x=>Number(x||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  let busy=false;
  async function action(fn){if(busy)return;busy=true;try{await fn();get('providerMessage').textContent='Operação concluída.';}catch(e){get('providerMessage').textContent=e.message;}finally{busy=false;}}
  async function load(){
    const result=await FinanceAccess.request('portal');get('providerLogin').hidden=true;get('providerContent').hidden=false;
    get('providerName').textContent=result.supplier.name;get('providerBalance').textContent='Saldo: '+money(result.balance);
    get('providerStatement').innerHTML=result.lines.map(r=>`<p>${esc(r.created_at)} — ${esc(r.reason)} — ${r.type==='debit'?'-':'+'}${money(r.amount)}</p>`).join('')||'<p>Nenhuma movimentação.</p>';
    get('providerPayments').innerHTML=result.payments.map(r=>`<p>${esc(r.created_at)} — ${money(r.amount)} — ${esc(r.status)}</p>`).join('')||'<p>Nenhum pagamento registrado.</p>';
    get('providerRecords').innerHTML=result.records.map(r=>`<article><p>${esc(r.data.month||r.data.subject)} — ${esc(r.data.status)}</p>${r.kind==='nota_fiscal'?`<a href="../api/finance.php?action=invoice_file&id=${encodeURIComponent(r.id)}">Baixar nota fiscal</a>`:`<p>${esc(r.data.message)}</p>`}${r.data.response?`<p>Financeiro: ${esc(r.data.response)}</p>`:''}</article>`).join('')||'<p>Nenhum envio.</p>';
  }
  document.addEventListener('DOMContentLoaded',async()=>{
    let session;try{session=JSON.parse(sessionStorage.getItem('soublu_session')||localStorage.getItem('soublu_session')||'null');}catch{}
    if(session?.id)get('providerUser').value=session.id;
    get('providerLogin').onsubmit=e=>{e.preventDefault();action(async()=>{await FinanceAccess.login(get('providerUser').value.trim(),get('providerPassword').value);get('providerPassword').value='';await load();});};
    get('providerInvoice').onsubmit=e=>{e.preventDefault();const data=new FormData(e.target);action(async()=>{await FinanceAccess.request('invoice',data,true);e.target.reset();await load();});};
    get('providerTicket').onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));action(async()=>{await FinanceAccess.request('ticket',data);e.target.reset();await load();});};
    get('providerLogout').onclick=()=>action(async()=>{await FinanceAccess.request('logout',{});localStorage.removeItem('soublu_session');sessionStorage.removeItem('soublu_session');location.href='../index.html';});
    try{const server=await FinanceAccess.session();if(session && server.user_id!==session.id)throw Error('Entre com o usuário atual.');await load();}catch(e){get('providerMessage').textContent=e.message;}
  });
})();
