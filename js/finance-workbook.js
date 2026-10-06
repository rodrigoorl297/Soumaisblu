/* Cadastros financeiros previstos na planilha. Lançamentos futuros não alteram saldo. */
(function () {
  'use strict';
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = x => Number(x || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const schemas = {
    comissao: {label:'Comissionamento', fields:{banco:'Banco',produto:'Produto',convenio:'Convênio',vigencia:'Vigência',tabela:'Tabela',prazo:'Prazo',empresa:'% Empresa'}},
    enquadramento: {label:'Enquadramentos',fields:{cnpj:'CNPJ',empresa_nome:'Empresa',banco:'Banco',tabela:'Tabela (opcional: regra específica)',enquadramento:'Enquadramento (%)',reter:'Retenção (%)'}},
    futuro: {label:'Lançamentos futuros',fields:{usuario:'Usuário',data:'Data',tipo:'Crédito ou débito',valor:'Valor',descricao:'Descrição'}},
    clube: {label:'Despesas do clube',fields:{usuario:'Colaborador',prestador:'Prestador',mes:'Mês',valor:'Valor',descricao:'Descrição'}}
  };
  const W = window.FinanceWorkbook = {
    rows: [], busy:false,
    allowed() { return !window.PARTNER_ROOT_ID && ['master','fundador','financeiro','financial'].includes(String(Auth.getSession()?.role).toLowerCase()); },
    async init() {
      if (!this.allowed() || document.getElementById('secFinanceWorkbook')) return;
      const nav=document.getElementById('finSidebarNav'), host=document.getElementById('finPageContent');
      if (!nav || !host) return;
      const a=document.createElement('a'); a.className='nav-item'; a.href='#'; a.dataset.section='secFinanceWorkbook'; a.textContent='Cadastros e parâmetros'; nav.append(a);
      const section=document.createElement('section'); section.id='secFinanceWorkbook'; section.className='section';
      section.innerHTML=`<h2>Cadastros e parâmetros financeiros</h2><p id="fwMessage" role="status"></p><label>Cadastro <select id="fwKind">${Object.entries(schemas).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select></label><form id="fwForm"></form><div id="fwList"></div><hr><h3>Retenção de saque de funcionários</h3><form id="fwTaxForm"><label>IRPF (%) <input id="fwTax" type="number" min="0" max="100" step="0.01" value="1.89" required></label><button>Salvar parâmetro</button></form><p>A parametrização de parceiros permanece no cadastro do parceiro.</p><button id="fwImport">Importar tabelas de agosto da planilha</button><hr><h3>Conferência mensal do clube</h3><label>Mês <input type="month" id="fwMonth"></label><button id="fwClose">Registrar fechamento</button><div id="fwInvoices"></div><p>A emissão de boleto EFI depende da integração de cobrança. Este fechamento registra a conferência, sem emitir boleto.</p>`;
      host.append(section);
      section.querySelector('#fwKind').onchange=()=>{this.editId=null;this.form();};
      section.querySelector('#fwList').onclick=e=>{const b=e.target.closest('[data-edit],[data-cancel]');if(b?.dataset.edit)this.edit(b.dataset.edit);if(b?.dataset.cancel)this.cancel(b.dataset.cancel);};
      section.querySelector('#fwTaxForm').onsubmit=e=>this.tax(e);
      section.querySelector('#fwImport').onclick=()=>this.importSeed();
      section.querySelector('#fwClose').onclick=()=>this.closeMonth();
      try { this.users=await DB.getAllUsers(); this.suppliers=await DB.getFinanceSuppliers(); await this.load(); this.form(); }
      catch(e) { this.message(e.message); }
    },
    message(text) { document.getElementById('fwMessage').textContent=text; },
    async load() {
      this.rows=(await DB.listFinanceWorkbook() || []).map(r=>({...r,data:typeof r.data==='string'?JSON.parse(r.data):r.data}));
      const setting=await DB.get('finance_workbook','settings');
      if(setting) document.getElementById('fwTax').value=Number((typeof setting.data==='string'?JSON.parse(setting.data):setting.data).irpf)*100;
      this.render();
    },
    form() {
      const kind=document.getElementById('fwKind').value, schema=schemas[kind];
      document.getElementById('fwForm').innerHTML=Object.entries(schema.fields).map(([key,label])=>{
        let control;
        if(key==='usuario'||key==='prestador') {
          const items=key==='usuario'?this.users:this.suppliers;
          control=`<select name="${key}" required><option value="">Selecione</option>${(items||[]).map(u=>`<option value="${esc(u.id)}">${esc(u.name||u.nome)}</option>`).join('')}</select>`;
        } else if(key==='tipo') control='<select name="tipo"><option value="credito">Crédito</option><option value="debito">Débito</option></select>';
        else { const numeric=['valor','empresa','reter','enquadramento'].includes(key); control=`<input name="${key}" type="${numeric?'number':key==='data'?'date':key==='mes'?'month':'text'}" ${numeric?'min="0" step="0.01"':''} ${['valor','empresa','reter','enquadramento'].includes(key)&&key!=='valor'?'max="100"':''} ${['tabela','vigencia','prazo'].includes(key)?'':'required'} ${key==='reter'?'value="2"':''}>`; }
        return `<label style="display:inline-block;margin:8px">${label}<br>${control}</label>`;
      }).join('')+'<button>Salvar cadastro</button>';
      document.getElementById('fwForm').onsubmit=e=>this.save(e); this.render();
    },
    async write(id,kind,data) {
      if(!this.allowed()) throw new Error('Sem permissão.');
      const record={id,kind,data:{...data,actor:Auth.getSession().id},updated_at:new Date().toISOString()};
      return kind==='fechamento'? DB.createFinanceWorkbook(record):DB.save('finance_workbook',record);
    },
    async action(fn) { if(this.busy) return; this.busy=true; try { await fn(); await this.load(); this.message('Registro salvo.'); } catch(e) { this.message(e.message); } finally {this.busy=false;} },
    save(e) {
      e.preventDefault(); const kind=document.getElementById('fwKind').value, data=Object.fromEntries(new FormData(e.target));
      if('valor' in data && !(Number(data.valor)>0)) return this.message('Informe um valor maior que zero.');
      if(kind==='enquadramento' && data.cnpj.replace(/\D/g,'').length!==14) return this.message('Informe um CNPJ com 14 dígitos.');
      data.status=kind==='futuro'?'programado':'aberto';
      this.action(async()=>{
        if(kind==='clube' && await DB.get('finance_workbook','clube-'+data.mes+'-'+data.usuario)) throw new Error('Mês já fechado para este colaborador.');
        await this.write(this.editId || crypto.randomUUID(),kind,data); this.editId=null; e.target.reset();
      });
    },
    tax(e) { e.preventDefault(); const rate=Number(document.getElementById('fwTax').value)/100; if(!Number.isFinite(rate)||rate<0||rate>1) return; this.action(()=>this.write('settings','settings',{irpf:rate})); },
    render() {
      const kind=document.getElementById('fwKind').value, fields=schemas[kind].fields;
      document.getElementById('fwList').innerHTML=`<p>${kind==='futuro'?'Agenda para conferência. O saldo só muda por um lançamento efetivo na conta corrente.':''}</p><div style="overflow:auto"><table class="table"><thead><tr>${Object.values(fields).map(l=>`<th>${esc(l)}</th>`).join('')}<th>Situação</th><th>Ações</th></tr></thead><tbody>${this.rows.filter(r=>r.kind===kind).map(r=>`<tr>${Object.keys(fields).map(k=>`<td>${esc(k==='valor'?money(r.data[k]):k==='usuario'?(this.users||[]).find(u=>u.id===r.data[k])?.name||r.data[k]:k==='prestador'?(this.suppliers||[]).find(u=>u.id===r.data[k])?.name||r.data[k]:r.data[k])}</td>`).join('')}<td>${esc(r.data.status)}</td><td>${r.data.status==='cancelado'?'':`<button type="button" data-edit="${esc(r.id)}">Editar</button>${kind==='futuro'?`<button type="button" data-cancel="${esc(r.id)}">Cancelar</button>`:''}`}</td></tr>`).join('')}</tbody></table></div>`;
      document.getElementById('fwInvoices').innerHTML=this.rows.filter(r=>r.kind==='fechamento').map(r=>`<p>${esc(r.data.mes)} — ${esc((this.users||[]).find(u=>u.id===r.data.usuario)?.name||r.data.usuario)} — ${money(r.data.total)} — Aguardando emissão EFI</p>`).join('');
    },
    async edit(id) {
      if(!this.allowed() || this.busy) return;
      const row=await DB.get('finance_workbook',id); if(!row) return;
      const data=typeof row.data==='string'?JSON.parse(row.data):row.data;
      if(row.kind==='clube' && await DB.get('finance_workbook','clube-'+data.mes+'-'+data.usuario)) return this.message('Despesa de mês fechado não pode ser alterada.');
      document.getElementById('fwKind').value=row.kind; this.form(); this.editId=id;
      for(const [key,value] of Object.entries(data)){const input=document.getElementById('fwForm').elements.namedItem(key);if(input)input.value=value;}
      this.message('Editando cadastro.');
    },
    cancel(id) { this.action(async()=>{const row=await DB.get('finance_workbook',id);if(!row || row.kind!=='futuro')throw new Error('Registro inválido.');const data=typeof row.data==='string'?JSON.parse(row.data):row.data;await this.write(id,row.kind,{...data,status:'cancelado'});}); },
    importSeed() { this.action(async()=>{ const res=await fetch('../js/commission-seed.json'); if(!res.ok) throw new Error('Não foi possível carregar a planilha.'); const seed=await res.json(); for(let i=0;i<seed.length;i++){const id='agosto2026-'+i; if(!await DB.get('finance_workbook',id)) await this.write(id,'comissao',{...seed[i],vigencia:'Agosto/2026',status:'aberto'});} }); },
    closeMonth() {
      const mes=document.getElementById('fwMonth').value; if(!/^\d{4}-\d{2}$/.test(mes)) return this.message('Selecione o mês.');
      this.action(async()=>{
        await this.load(); const expenses=this.rows.filter(r=>r.kind==='clube'&&r.data.mes===mes);
        if(!expenses.length) throw new Error('Nenhuma despesa neste mês.');
        for(const usuario of new Set(expenses.map(r=>r.data.usuario))) {
          const id='clube-'+mes+'-'+usuario;
          if(await DB.get('finance_workbook',id)) throw new Error('Já existe fechamento para este colaborador neste mês.');
          const lines=expenses.filter(r=>r.data.usuario===usuario);
          await this.write(id,'fechamento',{usuario,mes,total:lines.reduce((s,r)=>s+Math.round(Number(r.data.valor)*100),0)/100,despesas:lines.map(r=>({id:r.id,...r.data})),status:'aguardando_efi'});
        }
      });
    }
  };
})();
