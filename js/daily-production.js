(function(){
  'use strict';
  if(window.DailyProduction)return;
  const scriptUrl=new URL(document.currentScript.src),endpoint=new URL('../api/daily-production.php',scriptUrl);
  const managers=['master','fundador','desenvolvedor','admin','gerente','gerencia','diretoria','rh','financeiro','financial','supervisor','sup_backoffice','parceiro'];
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const session=()=>typeof Auth!=='undefined'?Auth.getSession():null;
  const eligible=()=>String(session()?.role||'').toLowerCase()==='vendedor';
  const allowed=()=>eligible()||managers.includes(String(session()?.role||'').toLowerCase());
  const weekdays=(from,to)=>{const rows=[];for(let d=new Date(from+'T12:00:00Z');d.toISOString().slice(0,10)<=to;d.setUTCDate(d.getUTCDate()+1)){if(![0,6].includes(d.getUTCDay()))rows.push(d.toISOString().slice(0,10));if(rows.length>3000)break;}return rows;};
  const labelDate=date=>date.split('-').reverse().join('/');
  let deadlineTimer=null,connecting=null;
  let csrf='',state=null,view=null,gate=null,page=null,timer=null,reportRows=[],reportSummary=[],reportContext=null,reportPage=1,busy=false,recordToken=0,lastFocus=null;
  const tableColumns=[['work_date','Dia','date'],['supervisor_name','Supervisor','text'],['user_name','Pessoa','text'],['boletos_solicitados','Boletos solicitados','number'],['propostas_digitadas','Propostas digitadas','number'],['contratos_pagos','Contratos pagos','number'],['detalhes_boletos','Detalhes dos boletos','text'],['detalhes_propostas','Detalhes das propostas','text'],['justificativa_boletos','Justificativa dos boletos','text'],['justificativa_propostas','Justificativa das propostas','text'],['status','Situação','status']];
  const normalized=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
  let columnFilters={},tableSort={key:'work_date',direction:'asc'},columnFilterTimer=null;
  function filterAndSort(source,filters,sort){
    const filtered=source.filter(row=>tableColumns.every(([key,label,type])=>{const query=filters[key];if(query==null||String(query).trim()==='')return true;const value=row[key];if(type==='number')return value!=null&&value!==''&&Number(value)===Number(query);if(type==='date'||type==='status')return String(value??'')===String(query);return normalized(value).includes(normalized(query));}));
    const col=tableColumns.find(([key])=>key===sort.key)||tableColumns[0];
    return filtered.sort((a,b)=>{const av=a[col[0]],bv=b[col[0]],emptyA=av==null||av==='',emptyB=bv==null||bv==='';if(emptyA||emptyB)return emptyA===emptyB?0:emptyA?1:-1;const compared=col[2]==='number'?Number(av)-Number(bv):String(av).localeCompare(String(bv),'pt-BR',{sensitivity:'base',numeric:true});return sort.direction==='desc'?-compared:compared;});
  }
  function excelDate(value,time=false){
    if(!value)return '';
    let raw=String(value);
    if(time&&/[zZ]|[+-]\d\d:\d\d$/.test(raw)){
      const date=new Date(raw);if(Number.isNaN(date.getTime()))return '';
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
      raw=`${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
    }
    const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);if(!match)return '';
    return (Date.UTC(+match[1],+match[2]-1,+match[3],time?+(match[4]||0):0,time?+(match[5]||0):0,time?+(match[6]||0):0)-Date.UTC(1899,11,30))/86400000;
  }
  function buildExport(source,context,X){
    const book=X.utils.book_new(),layouts=[];
    const rows=context.preserveOrder?source.slice():source.slice().sort((a,b)=>a.work_date.localeCompare(b.work_date)||a.supervisor_name.localeCompare(b.supervisor_name,'pt-BR')||a.user_name.localeCompare(b.user_name,'pt-BR'));
    const filter=context.filters||{},labels=context.filterLabels||{};
    const filters=[filter.user_id?`Pessoa: ${labels.person||filter.user_id}`:'',filter.supervisor_id?`Supervisor: ${labels.supervisor||filter.supervisor_id}`:'',filter.status?`Situação: ${filter.status}`:'',filter.q?`Busca: ${filter.q}`:'',context.columnFilterText||'',context.sortLabel||''].filter(Boolean).join(' | ')||'Todos os registros do período';
    function sheet(name,headers,data,widths,options){
      const grid=[[name],[`Período: ${labelDate(context.from)} a ${labelDate(context.to)}`],[filters],headers,...data];
      const ws=X.utils.aoa_to_sheet(grid);ws['!cols']=widths.map(wch=>({wch}));ws['!merges']=[0,1,2].map(r=>({s:{r,c:0},e:{r,c:headers.length-1}}));
      ws['!autofilter']={ref:X.utils.encode_range({s:{r:3,c:0},e:{r:Math.max(3,3+data.length),c:headers.length-1}})};
      const totalIndex=4+data.length;
      if(data.length){X.utils.sheet_add_aoa(ws,[['TOTAL']],{origin:{r:totalIndex,c:0}});for(const col of options.sum){const letter=X.utils.encode_col(col);ws[letter+(totalIndex+1)]={t:'n',f:`SUM(${letter}5:${letter}${totalIndex})`,v:data.reduce((sum,row)=>sum+(typeof row[col]==='number'?row[col]:0),0)};}ws['!ref']=X.utils.encode_range({s:{r:0,c:0},e:{r:totalIndex,c:headers.length-1}});}
      X.utils.book_append_sheet(book,ws,name);layouts.push({name,header:4,total:data.length?totalIndex+1:0,integers:options.integers,dates:options.dates||[],timestamps:[],percentages:[],status:options.status??-1});
    }
    const groups=new Map();
    for(const row of rows){const id=JSON.stringify([row.user_id||row.user_name,row.supervisor_id||row.supervisor_name]);if(!groups.has(id))groups.set(id,{supervisor:row.supervisor_name||'Não vinculado',person:row.user_name,boletos:0,propostas:0,pagos:0,preenchidos:0,pendentes:0});const g=groups.get(id);g.boletos+=Number(row.boletos_solicitados)||0;g.propostas+=Number(row.propostas_digitadas)||0;g.pagos+=Number(row.contratos_pagos)||0;if(['Preenchido','Justificado'].includes(row.status))g.preenchidos++;if(row.status==='Pendente')g.pendentes++;}
    const summary=[...groups.values()].sort((a,b)=>a.supervisor.localeCompare(b.supervisor,'pt-BR')||a.person.localeCompare(b.person,'pt-BR'));
    sheet('Resumo geral',['Supervisor','Pessoa','Boletos solicitados','Propostas digitadas','Contratos pagos','Dias preenchidos','Dias pendentes'],summary.map(g=>[g.supervisor,g.person,g.boletos,g.propostas,g.pagos,g.preenchidos,g.pendentes]),[32,36,21,21,19,21,20],{integers:[2,3,4,5,6],sum:[2,3,4,5,6]});
    const info=(row,kind)=>row['justificativa_'+kind]?`Justificativa: ${row['justificativa_'+kind]}`:(row['detalhes_'+kind]||'');
    sheet('Produção diária',['Dia','Supervisor','Pessoa','Boletos solicitados','Propostas digitadas','Contratos pagos','Informações dos boletos','Informações das propostas','Situação'],rows.map(r=>[excelDate(r.work_date),r.supervisor_name||'Não vinculado',r.user_name,r.boletos_solicitados==null?'':Number(r.boletos_solicitados),r.propostas_digitadas==null?'':Number(r.propostas_digitadas),r.contratos_pagos==null?'':Number(r.contratos_pagos),info(r,'boletos'),info(r,'propostas'),r.status]),[16,32,36,20,20,19,64,64,19],{dates:[0],integers:[3,4,5],sum:[3,4,5],status:8});
    book.Props={Title:'Produção diária SOU+BLU',Subject:`Período ${context.from} a ${context.to}`,Author:'SOU+BLU',CreatedDate:new Date()};
    return {book,layouts};
  }
  function formatExport({book,layouts},X){
    const packed=X.CFB.read(new Uint8Array(X.write(book,{type:'array',bookType:'xlsx',cellStyles:true})),{type:'array'}),encoder=new TextEncoder(),decoder=new TextDecoder('utf-8');
    const entry=name=>packed.FileIndex[packed.FullPaths.findIndex(path=>path.endsWith('/'+name))];
    const replace=(name,xml)=>{const file=entry(name);if(!file)throw new Error('Estrutura da planilha inválida.');file.content=encoder.encode(xml);file.size=file.content.length;};
    const font=(color,bold=false,size=11)=>`<font><sz val="${size}"/><color rgb="FF${color}"/><name val="Calibri"/>${bold?'<b/>':''}</font>`;
    const fill=color=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`;
    const xf=(fontId=0,fillId=0,numFmtId=0,align='left',borderId=1)=>`<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="${align}" vertical="center" wrapText="1"/></xf>`;
    const styles=[xf(0,0,0,'left',0),xf(1,2,0,'left',0),xf(2,0,0,'left',0),xf(3,2),xf(),xf(0,3),xf(0,0,3,'right'),xf(0,3,3,'right'),xf(0,0,164),xf(0,3,164),xf(0,0,165),xf(0,3,165),xf(4,4,3,'right'),xf(0,0,166,'right'),xf(0,3,166,'right'),xf(5,5),xf(6,6),xf(7,7)];
    replace('xl/styles.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy hh:mm"/><numFmt numFmtId="166" formatCode="0.0%"/></numFmts><fonts count="8">${font('172B4D')}${font('FFFFFF',true,18)}${font('526477',false,10)}${font('FFFFFF',true)}${font('163D66',true)}${font('9C2020')}${font('865C00')}${font('17643B')}</fonts><fills count="8"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${['173B63','F1F5FA','DDE9F5','FDE9E7','FFF2CC','E3F2E8'].map(fill).join('')}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${['left','right','top','bottom'].map(side=>`<${side} style="thin"><color rgb="FFD7DFE8"/></${side}>`).join('')}<diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${styles.length}">${styles.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
    layouts.forEach((layout,index)=>{
      const name=`xl/worksheets/sheet${index+1}.xml`;let xml=decoder.decode(entry(name).content);
      const frozen=layout.freeze??layout.header;
      xml=xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/,`<sheetViews><sheetView workbookViewId="0" showGridLines="0">${frozen?`<pane ySplit="${frozen}" topLeftCell="A${frozen+1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${frozen+1}" sqref="A${frozen+1}"/>`:''}</sheetView></sheetViews>`);
      xml=xml.replace(/<row\b([^>]*\br="(\d+)"[^>]*)>/g,(match,attrs,row)=>{
        let height=24;
        if(+row===1)height=32;else if(+row===layout.header)height=36;else if(+row<layout.header)height=+row===3?32:24;
        else if(+row>layout.header){const sheet=book.Sheets[layout.name];for(let col=0;col<sheet['!cols'].length;col++){const value=sheet[X.utils.encode_col(col)+row]?.v;if(typeof value==='string'){const width=Math.max(10,sheet['!cols'][col].wch-3),lines=value.split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/width)),0);height=Math.max(height,Math.min(409,lines*15+8));}}}
        return `<row${attrs.replace(/\s(?:ht|customHeight)="[^"]*"/g,'')} ht="${height}" customHeight="1">`;
      });
      xml=xml.replace(/<c\b([^>]*\br="([A-Z]+)(\d+)"[^>]*)>/g,(match,attrs,letter,row)=>{
        row=+row;const col=X.utils.decode_col(letter),alternate=(row-layout.header)%2===0;let style=alternate?5:4;
        if(row===1)style=1;else if(row<layout.header)style=2;else if(row===layout.header)style=3;else if(row===layout.total)style=12;
        else if(layout.percentCells?.includes(letter+row)||layout.percentages.includes(col))style=alternate?14:13;
        else if(layout.dates.includes(col))style=alternate?9:8;else if(layout.timestamps.includes(col))style=alternate?11:10;else if(layout.integers.includes(col))style=alternate?7:6;
        if(row>layout.header&&row!==layout.total&&col===layout.status){const value=book.Sheets[layout.name][letter+row]?.v;if(value==='Pendente')style=15;else if(value==='Justificado')style=16;else if(value==='Preenchido')style=17;}
        return `<c${attrs.replace(/\s+s="\d+"/g,'')} s="${style}">`;
      });
      xml=xml.replace(/<ignoredErrors>[\s\S]*?<\/ignoredErrors>/g,'').replace('</worksheet>','<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>');replace(name,xml);
    });
    return X.CFB.write(packed,{fileType:'zip',type:'array',compression:true});
  }
  const D=window.DailyProduction={
    async api(action,data,query={},retry=true){
      const url=new URL(endpoint);url.searchParams.set('action',action);for(const [key,value]of Object.entries(query))if(value!==''&&value!=null)url.searchParams.set(key,value);
      const headers={};if(session()?.id)headers['X-Daily-User']=session().id;
      if(action==='resume'){headers['X-Daily-User']=data.id;headers['X-API-Key']=String(window.SOUBLU_CONFIG?.API_KEY||'');}
      if(data){headers['Content-Type']='application/json';headers['X-Daily-CSRF']=csrf;}
      const response=await fetch(url,{method:data?'POST':'GET',headers,credentials:'same-origin',cache:'no-store',keepalive:action==='logout',body:data?JSON.stringify(data):undefined});
      let result;try{result=await response.json();}catch{throw new Error('A produção diária está indisponível. Tente novamente.');}
      if(response.status===401&&retry&&!['resume','login','logout'].includes(action)&&session()?.id){await this.connect();return this.api(action,data,query,false);}
      if(!response.ok||!result.ok){const error=new Error(result.message||'Não foi possível acessar a produção diária.');error.status=response.status;throw error;}
      if(result.csrf)csrf=result.csrf;return result;
    },
    async connect(id=session()?.id){
      if(!id)throw new Error('Sessão do SOU+BLU indisponível.');
      if(!connecting)connecting=this.api('resume',{id}, {},false).then(result=>{state=result;return result;}).finally(()=>{connecting=null;});
      return connecting;
    },
    async authenticate(id){return this.connect(id);},
    async logout(){csrf='';state=null;await this.api('logout',{}).catch(()=>{});},
    ensureMenu(){
      if(!session()||!allowed()||document.getElementById('dailyProductionNav'))return;
      const nav=document.querySelector('.sidebar-nav')||document.getElementById('finSidebarNav');if(!nav)return;
      const button=document.createElement('button');button.type='button';button.id='dailyProductionNav';button.className='nav-item';button.dataset.section='secDailyProduction';
      button.innerHTML='<span class="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3h8l4 4v14H4V3h4M14 3v5h6M8 12h8M8 16h8"/></svg></span><span class="nav-label">Produção diária</span>';
      button.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();this.open();},true);
      const proposal=nav.querySelector('[data-section="secManageProposals"]')||nav.querySelector('[data-section="secProposals"]');
      if(proposal)proposal.after(button);else nav.append(button);
    },
    ensurePage(){
      if(page?.isConnected)return page;
      const host=document.getElementById('finPageContent')||document.querySelector('main.page-content')||document.querySelector('.page-content')||document.querySelector('main');
      if(!host)return null;
      page=document.createElement('section');page.id='secDailyProduction';page.className='section tab-content dp-page';host.append(page);return page;
    },
    async open(){
      if(!allowed())return;
      const host=this.ensurePage();if(!host)return;
      document.querySelectorAll('.section.active,.tab-content.active').forEach(el=>{if(!el.contains(host))el.classList.remove('active');});
      const financeTabs=document.getElementById('tab-modulos');if(host.closest('#finPageContent')&&financeTabs){financeTabs.style.display='block';financeTabs.classList.add('active');const home=document.getElementById('tab-inicio');if(home){home.style.display='none';home.classList.remove('active');}}
      host.classList.add('active');document.querySelectorAll('.sidebar-nav .nav-item.active').forEach(el=>el.classList.remove('active'));document.getElementById('dailyProductionNav')?.classList.add('active');
      const title=document.getElementById('topbarTitle')||document.getElementById('pageTitle');if(title)title.textContent='Produção diária';
      host.innerHTML='<div class="dp-panel"><h2>Produção diária</h2><p>Carregando…</p></div>';
      try{state=await this.api('status');this.render(host);}catch(error){this.authView(host,error);}
    },
    message(text){const node=view?.querySelector('[data-message]');if(node)node.textContent=text;},
    lock(){
      if(gate?.isConnected)return;
      lastFocus=document.activeElement;gate=document.createElement('div');gate.id='dailyProductionGate';gate.className='dp-overlay';gate.setAttribute('role','dialog');gate.setAttribute('aria-modal','true');gate.setAttribute('aria-label','Regularizar produção diária');
      document.body.append(gate);this.inert(true);
      gate.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();}if(e.key==='Tab'){const controls=[...gate.querySelectorAll('button,input,select,textarea,a[href]')].filter(n=>!n.disabled&&n.getClientRects().length);if(!controls.length)return;if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0].focus();}}},true);
    },
    inert(locked){
      for(const node of document.body.children){if(node===gate||node.tagName==='SCRIPT')continue;if(locked&&!node.inert){node.dataset.dpInert='1';node.inert=true;}else if(!locked&&node.dataset.dpInert){node.inert=false;delete node.dataset.dpInert;}}
    },
    unlock(){if(!gate)return;gate.remove();gate=null;this.inert(false);if(lastFocus?.isConnected)lastFocus.focus();},
    async refresh(){
      if(!eligible()){if(gate)this.unlock();return;}
      if(document.getElementById('loginForm'))return;
      try{
        const result=await this.api('status');
        if(String(result.user.id)!==String(session()?.id))throw Object.assign(new Error('Confirme o acesso com o usuário atual.'),{status:401});
        state=result;
        clearTimeout(deadlineTimer);const boundary=new Date(state.today+'T16:40:00-03:00').getTime()-new Date(state.server_time).getTime();if(Number.isFinite(boundary)&&boundary>0)deadlineTimer=setTimeout(()=>this.refresh(),Math.min(boundary+100,2147483647));
        if(state.blocked){this.lock();if(!busy&&!gate.querySelector('form[data-daily-form]'))this.render(gate);}else if(gate)this.unlock();
      }catch(error){this.lock();if(!busy&&!gate.querySelector('form'))this.authView(gate,error);}
    },
    authView(host,error){
      view=host;
      host.innerHTML=`<div class="dp-panel"><header class="dp-hero"><div><span class="dp-eyebrow">PRODUÇÃO DIÁRIA</span><h2>Não foi possível carregar os dados</h2><p>${esc(error.message)}</p></div></header><div class="dp-row"><button type="button" data-retry>Tentar novamente</button></div><p class="dp-message" data-message role="status"></p></div>`;
      host.querySelector('[data-retry]').onclick=()=>{if(host===gate){host.innerHTML='';this.refresh();}else this.open();};
    },
    render(host){
      view=host;
      const locked=host===gate,formAllowed=state?.eligible;
      host.innerHTML=`<div class="dp-panel"><header class="dp-hero"><div><span class="dp-eyebrow">${locked?'REGULARIZAÇÃO':formAllowed?'SEU DIA EM NÚMEROS':'ACOMPANHAMENTO DA EQUIPE'}</span><h2>Produção diária</h2><p>${formAllowed?'Registre seus resultados e mantenha sua produção em dia.':'Uma visão clara dos resultados, registros e pendências da equipe.'}</p></div><div class="dp-deadline"><span class="dp-clock" aria-hidden="true">◷</span><div><span>Prazo de preenchimento</span><strong>16h40</strong><small>Segunda a sexta · Brasília</small></div></div></header>${locked?`<p class="dp-warning">Seu acesso está restrito até preencher os dias pendentes: ${state.pending.map(labelDate).join(', ')}.</p>`:''}<div class="dp-row dp-tabs">${formAllowed?'<button type="button" data-tab="form" aria-pressed="true">Preencher o dia</button>':''}${!locked?`<button type="button" data-tab="report" aria-pressed="${!formAllowed}">${formAllowed?'Meus registros':'Visão geral e exportação'}</button>`:''}</div><p class="dp-message" data-message role="status"></p><div data-content></div></div>`;
      host.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{host.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',b===button?'true':'false'));if(button.dataset.tab==='form')this.form(host);else this.report(host);});
      if(formAllowed)this.form(host);else this.report(host);
    },
    confirmSaved(date){
      document.getElementById('dailySavedConfirmation')?.remove();
      const notice=document.createElement('div');notice.id='dailySavedConfirmation';notice.className='dp-save-confirmation';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
      notice.innerHTML='<span class="dp-confirm-check" aria-hidden="true">✓</span><div><strong>Dia salvo com sucesso!</strong><span data-saved-date></span></div><button type="button" aria-label="Fechar confirmação">×</button>';
      notice.querySelector('[data-saved-date]').textContent=`Produção de ${labelDate(date)} registrada.`;
      notice.querySelector('button').onclick=()=>notice.remove();(gate||document.body).append(notice);setTimeout(()=>notice.remove(),6500);
    },
    async form(host,selectedDate=null){
      const box=host.querySelector('[data-content]'),dates=weekdays(state.start_date,state.today).reverse(),pending=state.pending||[],defaultDate=selectedDate||pending[0]||dates[0];
      if(!defaultDate){box.innerHTML='<p>Não há dia útil disponível para preencher. O formulário é obrigatório de segunda a sexta.</p>';return;}
      box.innerHTML=`<form data-daily-form><div class="dp-section-heading"><div><h3>Registro do dia</h3><p>Confira os dados e informe as quantidades abaixo.</p></div></div><div class="dp-grid"><label>Nome da pessoa<input value="${esc(state.user.name)}" disabled></label><label>Dia<input type="date" name="work_date" value="${defaultDate}" min="${state.start_date}" max="${state.today}" required></label><label>Nome do supervisor<select name="supervisor_id" required><option value="">Selecione o supervisor</option>${state.supervisors.options.map(s=>`<option value="${esc(s.id)}"${s.id===state.supervisors.preferred?' selected':''}>${esc(s.name)}</option>`).join('')}</select></label>${[['boletos_solicitados','Boletos solicitados','justificativa_boletos'],['propostas_digitadas','Propostas digitadas','justificativa_propostas'],['contratos_pagos','Contratos pagos',null]].map(([name,label,why],index)=>`<div class="dp-metric-card"><span class="dp-metric-index">0${index+1}</span><label>${label}<input type="number" name="${name}" min="0" max="1000000" step="1" required></label>${why?`<label data-why="${name}" hidden>Justificativa quando não houve produção<textarea name="${why}" maxlength="2000"></textarea></label><label data-details="${name}" hidden>${name==='boletos_solicitados'?'Boletos':'Propostas'} — nomes, IDs ou outras informações<textarea name="${name==='boletos_solicitados'?'detalhes_boletos':'detalhes_propostas'}" maxlength="2000" placeholder="Informe nomes, IDs ou referências, um por linha"></textarea></label>`:''}</div>`).join('')}</div><p>Boletos solicitados e propostas digitadas exigem justificativa individual quando a quantidade for zero.</p><div class="dp-row dp-save-row"><span>Seu registro pode ser atualizado depois.</span><button data-save>Salvar o dia</button></div></form>`;
      const form=box.querySelector('form');
      const update=()=>{for(const [name,why]of [['boletos_solicitados','justificativa_boletos'],['propostas_digitadas','justificativa_propostas']]){const required=form.elements[name].value!==''&&Number(form.elements[name].value)===0;form.querySelector(`[data-why="${name}"]`).hidden=!required;form.elements[why].required=required;form.querySelector(`[data-details="${name}"]`).hidden=!(Number(form.elements[name].value)>0);}};
      form.addEventListener('input',update);
      const read=async()=>{const token=++recordToken;const day=form.elements.work_date;day.setCustomValidity('');if(day.value&&[0,6].includes(new Date(day.value+'T12:00:00Z').getUTCDay()))day.setCustomValidity('Escolha um dia de segunda a sexta.');if(!day.checkValidity()){day.reportValidity();return;}const button=form.querySelector('[data-save]');button.disabled=true;this.message('');try{const result=await this.api('record',null,{date:form.elements.work_date.value});if(token!==recordToken||!form.isConnected)return;for(const name of ['boletos_solicitados','propostas_digitadas','contratos_pagos','justificativa_boletos','justificativa_propostas','detalhes_boletos','detalhes_propostas'])form.elements[name].value=result.record?.[name]??'';form.elements.supervisor_id.value=result.record?.supervisor_id||state.supervisors.preferred||'';update();}catch(error){this.message(error.message);}finally{if(token===recordToken)button.disabled=false;}};
      form.elements.work_date.onchange=read;
      form.onsubmit=async e=>{e.preventDefault();if(busy)return;update();if(!form.reportValidity())return;document.getElementById('dailySavedConfirmation')?.remove();busy=true;form.querySelector('[data-save]').disabled=true;try{const result=await this.api('save',Object.fromEntries(new FormData(form)));state=result;if(host===gate){if(!state.blocked){this.unlock();if(page?.classList.contains('active'))this.render(page);}else{this.render(host);this.message('Dia salvo. Regularize o próximo dia pendente.');}}else{this.message('Produção do dia salva.');}this.confirmSaved(result.record?.work_date||form.elements.work_date.value);}catch(error){this.message(error.message);}finally{busy=false;if(form.isConnected)form.querySelector('[data-save]').disabled=false;}};
      await read();if(host===gate)form.elements.work_date.focus();
    },
    report(host){
      columnFilters={};tableSort={key:'work_date',direction:'asc'};
      const box=host.querySelector('[data-content]'),month=state.today.slice(0,7);
      box.innerHTML=`<form data-report class="dp-filter-card"><div class="dp-section-heading"><div><h3>Encontre os registros</h3><p>Escolha o período e refine a consulta.</p></div><span class="dp-filter-tag">Filtros</span></div><div class="dp-report-filters"><label>Mês<input type="month" name="month" value="${month}" required></label><label>De<input type="date" name="from"></label><label>Até<input type="date" name="to"></label><label>Buscar pessoa ou supervisor<input name="q" type="search" placeholder="Digite um nome"></label><label>Pessoa<select name="user_id"><option value="">Todas</option></select></label><label>Supervisor<select name="supervisor_id"><option value="">Todos</option></select></label><label>Situação<select name="status"><option value="">Todas</option><option>Pendente</option><option>Em aberto</option><option>Preenchido</option><option>Justificado</option></select></label></div><div class="dp-row"><button>Buscar</button><button type="button" class="dp-secondary" data-export>Exportar planilha geral</button></div></form><div class="dp-period-bar"><div><h3>Resumo da produção</h3><p data-period-caption>Totais do período consultado</p></div><div class="dp-period-controls"><label>Data de referência<input type="date" data-period-date value="${state.today}"></label><div class="dp-period-switch" role="group" aria-label="Período do resumo"><button type="button" data-period="day" aria-pressed="false">Diário</button><button type="button" data-period="week" aria-pressed="false">Semanal</button><button type="button" data-period="month" aria-pressed="true">Mensal</button></div></div></div><div class="dp-totals" data-totals></div><div class="dp-records-card"><div class="dp-section-heading"><div><h3>Registros da produção</h3><p>Quantidades, referências e justificativas em um só lugar.</p></div><div class="dp-table-tools"><button type="button" class="dp-secondary" data-clear-columns hidden>Limpar filtros da tabela</button><span class="dp-result-count" data-result-count></span></div></div><div class="dp-table-wrap" data-table></div><div class="dp-row dp-pagination" data-pagination></div></div>`;
      const form=box.querySelector('form');form.elements.month.onchange=()=>{form.elements.from.value='';form.elements.to.value='';form.elements.user_id.value='';form.elements.supervisor_id.value='';};
      const applyPeriod=async period=>{
        if(busy)return;const input=box.querySelector('[data-period-date]');if(!input.reportValidity()||!input.value)return;
        const date=new Date(input.value+'T12:00:00Z');if(Number.isNaN(date.getTime()))return;let from=new Date(date),to=new Date(date);
        if(period==='week'){const offset=(date.getUTCDay()+6)%7;from.setUTCDate(date.getUTCDate()-offset);to=new Date(from);to.setUTCDate(from.getUTCDate()+6);}
        if(period==='month'){from.setUTCDate(1);to=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0,12));}
        const iso=d=>d.toISOString().slice(0,10);form.elements.month.value=iso(from).slice(0,7);form.elements.from.value=iso(from);form.elements.to.value=iso(to);
        if(await this.loadReport(host)){host.dataset.summaryPeriod=period;box.querySelectorAll('[data-period]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.period===period)));}
      };
      host.dataset.summaryPeriod='month';box.querySelectorAll('[data-period]').forEach(button=>button.onclick=()=>applyPeriod(button.dataset.period));box.querySelector('[data-period-date]').onchange=()=>applyPeriod(host.dataset.summaryPeriod||'day');
      form.onsubmit=e=>{e.preventDefault();host.dataset.summaryPeriod='';box.querySelectorAll('[data-period]').forEach(b=>b.setAttribute('aria-pressed','false'));this.loadReport(host);};form.querySelector('[data-export]').onclick=()=>this.export(host);
      this.loadReport(host);
    },
    async loadReport(host){
      if(busy)return false;const form=host.querySelector('[data-report]');if(!form||!form.reportValidity())return false;busy=true;this.message('Carregando relatório…');
      try{const result=await this.api('report',null,Object.fromEntries(new FormData(form)));reportRows=result.rows;reportSummary=result.summary;reportContext={from:result.from,to:result.to,filters:Object.fromEntries(new FormData(form)),filterLabels:{person:form.elements.user_id.selectedOptions[0]?.textContent||'Todas',supervisor:form.elements.supervisor_id.selectedOptions[0]?.textContent||'Todos'}};reportPage=1;host.dataset.reportFilters=JSON.stringify(Object.fromEntries(new FormData(form)));
        for(const [name,items,label]of [['user_id',result.people,'Todas'],['supervisor_id',result.supervisors,'Todos']]){const select=form.elements[name],old=select.value;const entries=Object.entries(items);if(old&&!entries.some(([id])=>id===old)){const option=select.selectedOptions[0];if(option)entries.push([old,option.textContent]);}select.innerHTML=`<option value="">${label}</option>`+entries.sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')).map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');select.value=old;}
host.querySelector('[data-period-caption]').textContent=`${labelDate(result.from)} a ${labelDate(result.to)} • conforme os filtros aplicados`;this.reportTable(host);this.message(`${reportRows.length} registros no período de ${labelDate(result.from)} a ${labelDate(result.to)}.`);return true;
      }catch(error){this.message(error.message);return false;}finally{busy=false;}
    },
    renderTableTotals(host,rows){
      const totals=rows.reduce((t,r)=>{t.boletos_solicitados+=Number(r.boletos_solicitados)||0;t.propostas_digitadas+=Number(r.propostas_digitadas)||0;t.contratos_pagos+=Number(r.contratos_pagos)||0;t.preenchidos+=['Preenchido','Justificado'].includes(r.status)?1:0;t.pendentes+=r.status==='Pendente'?1:0;return t;},{boletos_solicitados:0,propostas_digitadas:0,contratos_pagos:0,preenchidos:0,pendentes:0});
        host.querySelector('[data-totals]').innerHTML=[['Boletos solicitados',totals.boletos_solicitados,'↗','blue'],['Propostas digitadas',totals.propostas_digitadas,'≡','purple'],['Contratos pagos',totals.contratos_pagos,'✓','green'],['Dias preenchidos',totals.preenchidos,'▦','blue'],['Dias pendentes',totals.pendentes,'!','amber']].map(([label,number,icon,tone])=>`<div class="dp-kpi dp-kpi-${tone}"><span class="dp-kpi-icon" aria-hidden="true">${icon}</span><span class="dp-kpi-label">${label}</span><strong>${Number(number).toLocaleString('pt-BR')}</strong><small>Nos registros filtrados</small></div>`).join('');    },
    reportTable(host){
      const visible=filterAndSort(reportRows,columnFilters,tableSort),count=Math.max(1,Math.ceil(visible.length/50)),canManage=!!state?.eligible;reportPage=Math.min(reportPage,count);const rows=visible.slice((reportPage-1)*50,reportPage*50);this.renderTableTotals(host,visible);host.querySelector('[data-result-count]').textContent=`${visible.length} de ${reportRows.length} registros`;const clear=host.querySelector('[data-clear-columns]');clear.hidden=!Object.values(columnFilters).some(v=>String(v).trim());clear.onclick=()=>{columnFilters={};reportPage=1;this.reportTable(host);};
      host.querySelector('[data-table]').innerHTML=`${visible.length?'':'<p class="dp-no-results">Nenhum registro corresponde aos filtros. Ajuste os campos ou limpe os filtros da tabela.</p>'}<table data-own-actions="${canManage}"><thead><tr>${tableColumns.map(([key,label])=>`<th scope="col" aria-sort="${tableSort.key===key?(tableSort.direction==='asc'?'ascending':'descending'):'none'}"><button type="button" class="dp-sort-button" data-sort-column="${key}" aria-label="Ordenar por ${label}"><span>${label}</span><span aria-hidden="true">${tableSort.key===key?(tableSort.direction==='asc'?'↑':'↓'):'↕'}</span></button></th>`).join('')}${canManage?'<th scope="col">Ações</th>':''}</tr><tr class="dp-column-filters">${tableColumns.map(([key,label,type])=>`<th>${type==='status'?`<select data-column-filter="${key}" aria-label="Filtrar ${label}"><option value="">Todas</option>${['Pendente','Em aberto','Preenchido','Justificado'].map(v=>`<option${columnFilters[key]===v?' selected':''}>${v}</option>`).join('')}</select>`:`<input data-column-filter="${key}" aria-label="Filtrar ${label}" type="${type==='number'?'number':type==='date'?'date':'search'}" ${type==='number'?'min="0" step="1"':''} placeholder="Filtrar…" value="${esc(columnFilters[key]||'')}">`}</th>`).join('')}${canManage?'<th></th>':''}</tr></thead><tbody>${rows.map(r=>`<tr><td>${labelDate(r.work_date)}</td><td>${esc(r.supervisor_name)}</td><td>${esc(r.user_name)}</td><td>${r.boletos_solicitados??'—'}</td><td>${r.propostas_digitadas??'—'}</td><td>${r.contratos_pagos??'—'}</td><td class="dp-justification">${esc(r.detalhes_boletos||'')}</td><td class="dp-justification">${esc(r.detalhes_propostas||'')}</td><td class="dp-justification">${esc(r.justificativa_boletos)}</td><td class="dp-justification">${esc(r.justificativa_propostas)}</td><td><span class="dp-status" data-status="${esc(r.status)}">${esc(r.status)}</span></td>${canManage?`<td><div class="dp-record-actions">${String(r.user_id)===String(state.user.id)&&['Preenchido','Justificado'].includes(r.status)?`<button type="button" class="dp-secondary" data-edit-day="${esc(r.work_date)}" aria-label="Editar produção de ${labelDate(r.work_date)}">Editar</button><button type="button" class="dp-secondary dp-delete" data-delete-day="${esc(r.work_date)}" aria-label="Excluir produção de ${labelDate(r.work_date)}">Excluir</button>`:'—'}</div></td>`:''}</tr>`).join('')||'<tr><td colspan="${canManage?12:11}" class="dp-empty"><span class="dp-empty-symbol" aria-hidden="true">▦</span><h3>Nenhum registro neste período</h3><p>Ajuste os filtros ou aguarde o preenchimento da equipe.</p></td></tr>'}</tbody></table>`;
      const wrapper=host.querySelector('[data-table]');wrapper.oninput=event=>{const input=event.target.closest('[data-column-filter]');if(!input)return;const key=input.dataset.columnFilter;if(!tableColumns.some(c=>c[0]===key))return;columnFilters[key]=input.value;const caret=input.selectionStart;clearTimeout(columnFilterTimer);columnFilterTimer=setTimeout(()=>{reportPage=1;const left=wrapper.scrollLeft,top=wrapper.scrollTop;this.reportTable(host);wrapper.scrollLeft=left;wrapper.scrollTop=top;const next=wrapper.querySelector(`[data-column-filter="${key}"]`);next?.focus({preventScroll:true});if(caret!=null)try{next.setSelectionRange(caret,caret);}catch{}},180);};
      host.querySelector('[data-table]').onclick=event=>{
        const sort=event.target.closest('[data-sort-column]');if(sort){const key=sort.dataset.sortColumn;if(tableColumns.some(c=>c[0]===key)){tableSort={key,direction:tableSort.key===key&&tableSort.direction==='asc'?'desc':'asc'};reportPage=1;const left=wrapper.scrollLeft;this.reportTable(host);wrapper.scrollLeft=left;}return;}
        const edit=event.target.closest('[data-edit-day]'),remove=event.target.closest('[data-delete-day]');
        if(edit){host.querySelectorAll('[data-tab]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.tab==='form'?'true':'false'));this.form(host,edit.dataset.editDay);}
        if(remove)this.deleteDay(host,remove.dataset.deleteDay);
      };
      const pagination=host.querySelector('[data-pagination]');pagination.innerHTML=`<div class="dp-scroll-nav" data-scroll-tools><span>Colunas</span><button type="button" class="dp-secondary" data-scroll-left aria-label="Ver colunas anteriores">‹</button><button type="button" class="dp-secondary" data-scroll-right aria-label="Ver próximas colunas">›</button></div><div class="dp-page-buttons"><button type="button" class="dp-secondary" data-prev ${reportPage<=1?'disabled':''}>Anterior</button><span>Página ${reportPage} de ${count}</span><button type="button" class="dp-secondary" data-next ${reportPage>=count?'disabled':''}>Próxima</button></div>`;
      const syncScroll=()=>{const tools=pagination.querySelector('[data-scroll-tools]');tools.hidden=wrapper.scrollWidth<=wrapper.clientWidth+2;pagination.querySelector('[data-scroll-left]').disabled=wrapper.scrollLeft<=2;pagination.querySelector('[data-scroll-right]').disabled=wrapper.scrollLeft+wrapper.clientWidth>=wrapper.scrollWidth-2;};
      pagination.querySelector('[data-scroll-left]').onclick=()=>wrapper.scrollBy({left:-Math.max(240,wrapper.clientWidth*.75),behavior:'smooth'});
      pagination.querySelector('[data-scroll-right]').onclick=()=>wrapper.scrollBy({left:Math.max(240,wrapper.clientWidth*.75),behavior:'smooth'});
      wrapper.onscroll=syncScroll;wrapper._dpColumnResize?.disconnect();if(typeof ResizeObserver!=='undefined'){wrapper._dpColumnResize=new ResizeObserver(syncScroll);wrapper._dpColumnResize.observe(wrapper);}requestAnimationFrame(syncScroll);
      pagination.querySelector('[data-prev]').onclick=()=>{reportPage--;this.reportTable(host);};pagination.querySelector('[data-next]').onclick=()=>{reportPage++;this.reportTable(host);};
    },
    async deleteDay(host,date){
      if(busy||!state?.eligible)return;
      const row=reportRows.find(r=>r.work_date===date&&String(r.user_id)===String(state.user.id));if(!row)return;
      if(!window.confirm(`Excluir sua produção de ${labelDate(date)}? Se o prazo já venceu, o dia ficará pendente e precisará ser preenchido novamente para liberar o acesso.`))return;
      busy=true;
      try{
        const payload={work_date:date};if(row.updated_at)payload.expected_updated_at=row.updated_at;
        state=await this.api('delete',payload);busy=false;
        if(state.blocked){this.lock();this.render(gate);this.message('Registro excluído. Preencha o dia pendente para liberar o acesso.');}
        else{await this.loadReport(host);this.message(`Produção de ${labelDate(date)} excluída.`);}
      }catch(error){this.message(error.message);}finally{busy=false;}
    },
    async export(host){
      if(busy)return;
      const current=JSON.stringify(Object.fromEntries(new FormData(host.querySelector('[data-report]'))));if(current!==host.dataset.reportFilters && !await this.loadReport(host))return;
      const exportRows=filterAndSort(reportRows,columnFilters,tableSort).map(row=>({...row})),exportContext={...reportContext,preserveOrder:true,columnFilterText:tableColumns.filter(([key])=>columnFilters[key]).map(([key,label,type])=>`${label}: ${type==='date'?labelDate(columnFilters[key]):columnFilters[key]}`).join(' | '),sortLabel:`Ordenação: ${tableColumns.find(c=>c[0]===tableSort.key)?.[1]||'Dia'} (${tableSort.direction==='asc'?'crescente':'decrescente'})`,filters:{...reportContext.filters},filterLabels:{...reportContext.filterLabels}};
      const button=host.querySelector('[data-export]');button.disabled=true;
      try{if(!window.XLSX)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('vendor/xlsx.full.min.js',scriptUrl);script.onload=resolve;script.onerror=()=>reject(new Error('Não foi possível carregar o exportador de planilhas.'));document.head.append(script);});
        const built=this.buildExport(exportRows,exportContext,XLSX);
        const bytes=this.formatExport(built,XLSX);
        const link=document.createElement('a');const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));link.href=url;link.download=`producao-diaria-${exportContext.from}-a-${exportContext.to}.xlsx`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
        this.message(`Planilha exportada com ${exportRows.length} registros em duas abas: resumo geral e produção diária.`);
      }catch(error){this.message(error.message);}finally{button.disabled=false;}
    },
    init(){
      if(!document.getElementById('dailyProductionStyle')){const link=document.createElement('link');link.id='dailyProductionStyle';link.rel='stylesheet';link.href=new URL('../css/daily-production.css?v=20261103-periods',scriptUrl);document.head.append(link);}
      if(!session()||!allowed()||document.getElementById('loginForm'))return;
      this.ensureMenu();this.refresh();clearInterval(timer);timer=setInterval(()=>this.refresh(),30000);
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.refresh();});window.addEventListener('focus',()=>this.refresh());
      let scheduled;new MutationObserver(()=>{clearTimeout(scheduled);scheduled=setTimeout(()=>{this.ensureMenu();if(gate)this.inert(true);},150);}).observe(document.body,{childList:true,subtree:true});
      document.addEventListener('click',event=>{const nav=event.target.closest('.sidebar-nav .nav-item');if(nav&&nav.id!=='dailyProductionNav'&&!gate)page?.classList.remove('active');},true);
    }
  };
  D.filterAndSort=filterAndSort;D.buildExport=buildExport;D.formatExport=formatExport;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>D.init(),{once:true});else D.init();
})();
