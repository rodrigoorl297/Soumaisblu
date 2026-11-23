const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ctx={window:{},console};vm.createContext(ctx);vm.runInContext(fs.readFileSync('js/commission-engine.js','utf8'),ctx);const engine=ctx.window.CommissionEngine;
const p={id:'p1',bancoDigitado:'643 - AMIGOZ',tabela:'T1',convenio:'ESTADUAL',entidade:'GOV MG',product:'NOVO',valor:1000,valorFinal:800,created_at:'2026-10-06',meta:{workflow:{}}};
const rule={id:'r1',kind:'comissao',data:{banco:'AMIGOZ',tabela:'T1',produto:'EMP',convenio:'GOV MG',vigencia:'2026-10',empresa:18}};
assert.equal(engine.calculate(p,[rule]).amount,144);assert.equal(engine.calculate(p,[rule]).base,800);
assert.equal(engine.calculate(p,[rule,{...rule,id:'r2'}]).status,'conflito');
assert.equal(engine.calculate(p,[{...rule,data:{...rule.data,vigencia:'Agosto/2026'}}]).status,'sem_regra');
assert.equal(engine.calculate({...p,entidade:'GOV SP'},[rule]).status,'sem_regra');
assert.equal(engine.calculate({...p,bancoDigitado:''},[rule]).status,'incompleto');
assert.equal(engine.calculate(p,[{...rule,data:{...rule.data,empresa:101}}]).status,'invalido');
assert.equal(engine.calculate({...p,valorFinal:0},[rule]).amount,0);
assert.equal(engine.calculate({...p,meta:{workflow:{subproduto:'RCC'}}},[rule]).status,'sem_regra');
assert.equal(engine.calculate(p,[{...rule,data:{...rule.data,prazo:36}}]).status,'sem_regra');
assert.equal(engine.calculate(p,[{...rule,data:{...rule.data,status:'inativo'}}]).status,'sem_regra');
assert.equal(engine.calculate(p,[rule]).retention,undefined);
console.log('PASS: cálculo empresa, base final, vigência, prazo, convênio, produto, conflito e ausência de retenção.');

const exception={...p,bancoDigitado:'Banco Neo',entidade:'GOVERNO DO PARANÁ - PR',tabela:'NCDT_096-999_EXCECAO',valorFinal:10000};
for(const entity of ['GOVERNO DO PARANÁ - PR','GOV DO PARANÁ - PR','GOV PR']){
 const result=engine.calculate({...exception,entidade:entity},[]);assert.equal(result.status,'calculado');assert.equal(result.rate,0);assert.equal(result.vendorRate,0);assert.equal(result.amount,0);assert.equal(result.vendorAmount,0);assert.equal(result.base,10000);
}
assert.equal(engine.zeroException({...exception,bancoDigitado:'AMIGOZ'}),true);
assert.equal(engine.zeroException({...exception,entidade:'GOV SP'}),true);
assert.equal(engine.calculate({...exception,bancoDigitado:'',entidade:''},[]).amount,0);
assert.equal(engine.zeroException({...exception,tabela:'OUTRA'}),false);
const catalogContext={window:{CommissionEngine:engine,addEventListener(){}},console,document:{readyState:"loading",addEventListener(){},createElement(){return {};},head:{appendChild(){}}}};vm.createContext(catalogContext);vm.runInContext(fs.readFileSync('js/proposals.js','utf8'),catalogContext);
const catalog=catalogContext.window.Proposals;
const entry=catalog._TABELA_GROUPS.find(g=>g.group==='EXCECAO').items.find(i=>i.value===exception.tabela);
assert.equal(entry.empresa,0);assert.equal(entry.vendedor,0);assert.equal(catalog._tabelaPct[exception.tabela],0);
const operation={valor:10000};catalog._applyTabelaToProposal(operation,exception.tabela);assert.equal(operation.valor,10000);assert.equal(operation.valorFinal,0);
console.log('PASS: exceção NEO Governo PR, empresa e vendedor 0%, valor da operação preservado e sem vínculo com banco ou governo.');

const groupsAfterExtensions=catalog._TABELA_GROUPS;groupsAfterExtensions.push({group:'Outro grupo',items:[]});const tableHtml=catalog._tabelaSelectHtml('');assert(tableHtml.lastIndexOf('label="EXCECAO"')>tableHtml.lastIndexOf('label="Outro grupo"'));

assert.equal(catalog._tabelaLabel('NCDT_096-999_EXCECAO'),'TABELA_EXCECAO — sem comissão');assert(entry.label.startsWith('TABELA_EXCECAO'));
