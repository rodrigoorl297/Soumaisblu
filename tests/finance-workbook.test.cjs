const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const page=await browser.newPage();
  await page.route('**/finance-test',route=>route.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));
  await page.goto('http://127.0.0.1:8000/finance-test');
  await page.setContent('<nav id="finSidebarNav"></nav><main id="finPageContent"></main>');
  await page.addScriptTag({content:`window.session={id:'fin',role:'financeiro'};window.Auth={getSession:()=>session};window.records={};window.DB={getAllUsers:async()=>[{id:'u1',name:'João'}],getFinanceSuppliers:async()=>[{id:'p1',name:'Prestador'}],listFinanceWorkbook:async()=>Object.values(records),get:async(t,id)=>records[id],save:async(t,r)=>(records[r.id]=structuredClone(r)),createFinanceWorkbook:async r=>{if(records[r.id])throw Error('duplicado');return records[r.id]=structuredClone(r)}};`});
  await page.addScriptTag({path:path.resolve(__dirname,'../js/finance-workbook.js')});
  await page.evaluate(()=>FinanceWorkbook.init());
  assert.equal(await page.locator('#secFinanceWorkbook').count(),1);
  await page.evaluate(async()=>{document.getElementById('fwTax').value='3'; FinanceWorkbook.tax({preventDefault(){}});});
  await page.waitForFunction(()=>!FinanceWorkbook.busy);
  assert.equal(await page.evaluate(()=>records.settings.data.irpf),.03);
  await page.selectOption('#fwKind','clube');
  await page.selectOption('[name=usuario]','u1');await page.selectOption('[name=prestador]','p1');
  await page.fill('[name=mes]','2026-10');await page.fill('[name=valor]','125.35');await page.fill('[name=descricao]','Consulta');
  await page.locator('#fwForm button').click();await page.waitForFunction(()=>!FinanceWorkbook.busy);
  await page.fill('#fwMonth','2026-10');await page.locator('#fwClose').click();await page.waitForFunction(()=>!FinanceWorkbook.busy);
  assert.equal(await page.evaluate(()=>records['clube-2026-10-u1'].data.total),125.35);
  await page.locator('#fwClose').click();await page.waitForFunction(()=>!FinanceWorkbook.busy);
  assert.match(await page.locator('#fwMessage').innerText(),/Já existe/);
  await page.evaluate(async()=>{session.role='parceiro';try{await FinanceWorkbook.write('unauthorized','comissao',{});}catch(e){window.denied=e.message;}});
  assert.equal(await page.evaluate(()=>records.unauthorized),undefined);
  assert.equal(await page.evaluate(()=>denied),'Sem permissão.');
  console.log('PASS: parametrização, despesa, fechamento, duplicidade e permissão.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

