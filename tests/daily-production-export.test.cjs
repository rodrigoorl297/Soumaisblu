const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');const X=require('../js/vendor/xlsx.full.min.js');
const ctx={window:{},document:{currentScript:{src:'http://local/js/daily-production.js'},readyState:'loading',addEventListener(){}},URL,Date,Intl,TextEncoder,TextDecoder,console};vm.createContext(ctx);vm.runInContext(fs.readFileSync('js/daily-production.js','utf8'),ctx);
const sortSource=[{boletos_solicitados:2,user_name:'João',work_date:'2026-11-03',status:'Preenchido'},{boletos_solicitados:10,user_name:'Maria',work_date:'2026-11-04',status:'Preenchido'},{boletos_solicitados:0,user_name:'José',work_date:'2026-11-03',status:'Justificado'},{boletos_solicitados:null,user_name:'Clara',work_date:'2026-11-03',status:'Pendente'}];
const sortRows=(filters,direction)=>Array.from(ctx.window.DailyProduction.filterAndSort(sortSource,filters,{key:'boletos_solicitados',direction}));
assert.deepEqual(sortRows({},'asc').map(r=>r.boletos_solicitados),[0,2,10,null]);assert.deepEqual(sortRows({},'desc').map(r=>r.boletos_solicitados),[10,2,0,null]);assert.equal(sortRows({user_name:'joao'},'asc').length,1);assert.equal(sortRows({boletos_solicitados:'0'},'asc').length,1);assert.equal(sortRows({work_date:'2026-11-03',status:'Pendente'},'asc')[0].user_name,'Clara');
const rows=[
{user_id:'u1',user_name:'Vendedor um',supervisor_id:'s1',supervisor_name:'Supervisor um',work_date:'2026-11-03',boletos_solicitados:2,propostas_digitadas:3,contratos_pagos:1,status:'Preenchido',detalhes_boletos:'Maria — boleto B-123',detalhes_propostas:'José — proposta P-987',justificativa_boletos:'',justificativa_propostas:'',updated_at:'2026-11-03T20:41:00Z'},
{user_id:'u1',user_name:'Vendedor um',supervisor_id:'s1',supervisor_name:'Supervisor um',work_date:'2026-11-04',boletos_solicitados:0,propostas_digitadas:0,contratos_pagos:0,status:'Justificado',justificativa_boletos:'Aguardando banco\nSegunda linha',justificativa_propostas:'Aguardando documentos',updated_at:'2026-11-04 16:41:00'},
{user_id:'u2',user_name:'=HYPERLINK("https://example.invalid")',supervisor_id:'s1',supervisor_name:'Supervisor um',work_date:'2026-11-03',boletos_solicitados:null,propostas_digitadas:null,contratos_pagos:null,status:'Pendente',justificativa_boletos:'',justificativa_propostas:'',updated_at:null},
{user_id:'u3',user_name:'Vendedor três',supervisor_id:'s2',supervisor_name:'Supervisor dois',work_date:'2026-11-03',boletos_solicitados:null,propostas_digitadas:null,contratos_pagos:null,status:'Em aberto',justificativa_boletos:'',justificativa_propostas:'',updated_at:null}
];
const built=ctx.window.DailyProduction.buildExport(rows,{from:'2026-11-03',to:'2026-11-04',filters:{q:'teste'},filterLabels:{}},X);const b=built.book;
assert.deepEqual(b.SheetNames,['Resumo geral','Produção diária']);
assert.equal(b.Sheets['Resumo geral']['!ref'],'A1:G8');assert.equal(b.Sheets['Produção diária']['!ref'],'A1:I9');
const strings=Object.values(b.Sheets['Produção diária']).filter(v=>v?.v===rows[2].user_name);assert.equal(strings.length,1);assert.equal(strings[0].t,'s');assert.equal(strings[0].f,undefined);
assert.equal(b.Sheets['Produção diária'].D9.f,'SUM(D5:D8)');assert.equal(b.Sheets['Produção diária'].D9.v,2);
const out=ctx.window.DailyProduction.formatExport(built,X);fs.mkdirSync('scratch/daily-production',{recursive:true});fs.writeFileSync('scratch/daily-production/export-formatted-test.xlsx',Buffer.from(out));
const check=require('node:child_process').spawnSync(process.env.TEST_PYTHON||'python',['-c',`import zipfile,xml.etree.ElementTree as E,sys
z=zipfile.ZipFile(sys.argv[1]); ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
a=E.fromstring(z.read('xl/styles.xml')); assert int(a.find('s:cellXfs',ns).attrib['count'])>=18
s=E.fromstring(z.read('xl/worksheets/sheet2.xml')); assert s.find('s:sheetViews/s:sheetView/s:pane',ns).attrib['ySplit']=='4'
assert s.find('s:autoFilter',ns).attrib['ref']=='A4:I8'
import openpyxl
w=openpyxl.load_workbook(sys.argv[1],data_only=False)
assert w.sheetnames==['Resumo geral','Produção diária']
d=w['Produção diária']; assert d.freeze_panes=='A5' and d.auto_filter.ref=='A4:I8'
assert d['A5'].number_format=='dd/mm/yyyy'
assert d['A1'].fill.fgColor.rgb=='FF173B63'
assert d['D9'].value=='=SUM(D5:D8)'
assert any(d.cell(r,3).value.startswith('=HYPERLINK') and d.cell(r,3).data_type=='s' for r in range(5,9))
assert any(d.cell(r,4).value is None for r in range(5,9))
assert any(d.cell(r,7).value=='Maria — boleto B-123' for r in range(5,9))
assert any(d.cell(r,8).value=='José — proposta P-987' for r in range(5,9))
assert any(str(d.cell(r,7).value).startswith('Justificativa: Aguardando banco') for r in range(5,9))
assert d['A5'].value.year==2026
w2=openpyxl.load_workbook(sys.argv[1],data_only=True); assert w2['Produção diária']['D9'].value==2
`, 'scratch/daily-production/export-formatted-test.xlsx'],{encoding:'utf8'});assert.equal(check.status,0,check.stderr);
console.log('PASS: duas abas simples, totais, dados ausentes, datas Excel, detalhes e justificativas preservados, filtros e texto seguro.');
