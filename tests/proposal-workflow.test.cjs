const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ timezoneId: 'America/Sao_Paulo' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let html = fs.readFileSync(path.join(root, 'pages/admin.html'), 'utf8');
    html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
    await page.setContent(html);
    await page.addScriptTag({ content: `
      window.user = {id:'vendor1',name:'Vendedor',role:'vendedor'};
      window.Auth = {getSession:()=>user,isMaster:()=>user.role==='master'};
      window.messages=[];window.showToast=(m)=>messages.push(m);window.alert=showToast;
      window.showLoading=()=>{};window.hideLoading=()=>{};
      window.formatCPF=v=>v;window.formatPhone=v=>v;window.formatDate=v=>v;window.formatRG=v=>v;
      window.SOUBLU_CONFIG={};
      window.rows={};window.DB={
        getProposal:async id=>structuredClone(rows[id]),
        getProposalAttachments:async id=>({attachments:rows[id]?.attachments||{}}),
        getVendorsForSelect:async()=>[{id:'vendor1',name:'Vendedor'}],
        getUser:async()=>user,
        saveProposal:async p=>(rows[p.id]=structuredClone(p)),
        addProposal:async p=>(rows[p.id]=structuredClone(p)),
        isPaidProposal:p=>p.status==='PAGO'||p.statusOp==='PAGO'
      };
    ` });
    await page.addScriptTag({ path: path.join(root, 'js/proposals.js') });
    await page.addScriptTag({ path: path.join(root, 'js/proposal-workflow.js') });
    await page.evaluate(() => {
      Proposals._lookupClientByCpf = async () => null;
      Proposals._saveProposalClientData = async () => {};
      Proposals._loadProposalAttachments = async () => {};
      Proposals._notifyBoletoValidadoWebhook = async () => {};
      Proposals._patchAdminTableRow = () => true;
      Proposals._filterProposalsToSupervisorTeam = async list => list.filter(p => p.vendorId === 'vendor1');
      Proposals._proposalVendorScopeForSession = async () => null;
      window.base = {id:'p1',product:'COMPRA DE DÍVIDA',vendorId:'vendor1',vendorName:'Vendedor',clientCpf:'12345678901',clientName:'Cliente',numero:'100',valor:1000,status:'Em Andamento',statusOp:'Em Andamento',tabela:'',history:[],attachments:{},meta:{legacy:'preservar',workflow:{protocolosCentral:[{numero:'CENTRAL-1',data:'2026-10-01'}]}}};
      rows.p1=structuredClone(base);
    });
    assert.equal(await page.evaluate(() => ProposalWorkflow.expiry('2026-12-25',240)), '2027-01-04');
    assert.equal(await page.evaluate(() => ProposalWorkflow.expiry('2026-10-06T10:30',72)), '2026-10-09T13:30:00.000Z');
    await page.evaluate(() => Proposals.openAdminModal('p1'));
    assert.equal(await page.locator('#managePropTabela').isDisabled(), true, JSON.stringify(await page.evaluate(() => messages)));
    assert.equal(await page.locator('#managePropStatus').isDisabled(), true);
    await page.locator('#workflow_contato').fill('11999999999');
    await page.evaluate(() => { document.getElementById('managePropStatus').value='Cancelado'; document.getElementById('managePropTabela').value=''; });
    await page.evaluate(() => Proposals.adminSave());
    const seller = await page.evaluate(() => rows.p1);
    assert.equal(seller.status, 'Em Andamento');
    assert.equal(seller.meta.workflow.contato, '11999999999');
    assert.equal(seller.meta.legacy, 'preservar');
    assert.equal(seller.history.at(-1).actorId, 'vendor1');
    assert.ok(seller.history.at(-1).changes.meta);
    await page.evaluate(() => { user={id:'bo1',name:'Backoffice',role:'backoffice'}; });
    await page.evaluate(() => Proposals.openAdminModal('p1'));
    assert.equal(await page.locator('#workflow_contato').isDisabled(), true);
    await page.locator('#workflowAddProtocol').click();
    const protocols = page.locator('[data-protocol-row]');
    assert.equal(await protocols.count(), 2);
    await protocols.nth(1).locator('[data-number]').fill('CENTRAL-2');
    await protocols.nth(1).locator('[data-date]').fill('2026-10-06');
    await page.evaluate(() => Proposals.adminSave());
    assert.equal(await page.evaluate(() => rows.p1.meta.workflow.protocolosCentral[1].expiraEm), '2026-10-16');
    await page.evaluate(() => {
      rows.p2={...structuredClone(base),id:'p2',product:'NOVO',meta:{workflow:{deflator:10}}};
      user={id:'fin1',name:'Financeiro',role:'financeiro'};
    });
    await page.evaluate(() => Proposals.openAdminModal('p2'));
    await page.locator('#workflow_deflator').fill('25');
    await page.evaluate(() => Proposals.adminSave());
    assert.equal(await page.evaluate(() => rows.p2.meta.workflow.valorProducao), 750);
    assert.equal(await page.evaluate(() => rows.p2.meta.workflow.deflator), 25);
    assert.equal(await page.evaluate(() => rows.p2.valorFinal), 750);
    assert.equal(await page.evaluate(() => rows.p1.meta.workflow.protocolosCentral.length), 2);
    await page.evaluate(() => { user={id:'vendor2',name:'Outro',role:'vendedor'}; });
    await page.evaluate(() => Proposals.openAdminModal('p1'));
    assert.equal(await page.locator('button[onclick="Proposals.adminSave()"]', {hasText:'Salvar'}).isVisible(), false);
    await page.evaluate(() => { user={id:'vendor1',name:'Vendedor',role:'vendedor'}; rows.p1.status='PAGO'; });
    assert.equal(await page.evaluate(() => ProposalWorkflow.canEdit(rows.p1,user)), false);
    await page.evaluate(() => ProposalWorkflow.create());
    await page.locator('#workflowProduct').selectOption('TIM');
    assert.ok(await page.locator('#workflow_numero').inputValue());
    assert.equal(await page.locator('#workflow_cnpj').count(), 1);
    assert.equal(await page.locator('#workflowProtocols').count(), 0);
    await page.locator('#workflow_clientName').fill('Empresa TIM');
    await page.locator('#workflow_cnpj').fill('12345678000190');
    await page.locator('#workflow_produtoTim').fill('Plano empresarial');
    await page.locator('#workflow_quantidadeAcessos').fill('3');
    const createdId = await page.evaluate(() => {
      Proposals._workflowDraft.attachments={identidade_frente:'https://example.test/rg.pdf',contrato_social_1:'https://example.test/contrato.pdf'};
      return Proposals._workflowDraft.id;
    });
    await page.evaluate(() => Proposals.adminSave());
    const created = await page.evaluate(id => rows[id], createdId);
    assert.equal(created.product, 'TIM');
    assert.equal(created.clientCpf, '12345678000190');
    assert.equal(created.meta.workflow.quantidadeAcessos, 3);
    assert.ok(created.attachments.contrato_social_1);
    assert.equal(created.history.at(-1).action, 'Proposta criada');
    assert.equal(await page.evaluate(() => Proposals._workflowDraft), null);
    const attachmentChecks = await page.evaluate(() => {
      const fails=[];
      for (const product of ['COMPRA DE DÍVIDA','NOVO','TIM','OSJ','C6 PJ']) {
        try { ProposalWorkflow.validateAttachments({product,attachments:{}}); } catch (_) { fails.push(product); }
      }
      return fails;
    });
    assert.equal(attachmentChecks.length, 5);
    await page.evaluate(async () => {
      user={id:'bo1',name:'Backoffice',role:'backoffice'};
      for (const [product, expected] of [['OSJ','workflow_numeroAcao'],['C6 PJ','workflow_numeroPropostaBanco'],['TIM','workflow_numeroRadar']]) {
        rows.layout={...structuredClone(base),id:'layout',product};
        await Proposals.openAdminModal('layout');
        if (!document.getElementById(expected)) throw new Error('Campo ausente: '+expected);
        if (document.getElementById('managePropBacen').closest('.form-group').style.display !== 'none') throw new Error('BACEN indevido em '+product);
      }
      const original = DB.getProposal;
      DB.getProposal = async id => { if (id==='p1') await new Promise(r=>setTimeout(r,80)); return original(id); };
      await Promise.all([Proposals.openAdminModal('p1'),Proposals.openAdminModal('p2')]);
      if (document.getElementById('managePropId').value !== 'p2') throw new Error('Clique antigo substituiu proposta atual.');
      DB.getProposal=original;
    });
    await page.evaluate(() => {
      window.PARTNER_ROOT_ID='partner1';
      window.partnerOrgCan=()=>true;
      DB.getPartnerTeamIds=async root=>new Set(root==='partner1' ? ['partner1','partnerSeller','partnerBo'] : ['partner2']);
      DB.getPartnerRootForUser=async id=>['partner1','partnerSeller','partnerBo'].includes(id) ? 'partner1' : null;
      user={id:'partnerSeller',name:'Vendedor parceiro',role:'vendedor'};
      rows.partner={...structuredClone(base),id:'partner',vendorId:'partnerSeller',vendorName:user.name,protocoloBacen:'BACEN-OLD',dataSolicitacaoBacen:'2026-10-01',meta:{workflow:{partnerRootId:'partner1',protocoloConsumidor:'GOV-OLD',dataConsumidor:'2026-10-01'}}};
    });
    await page.evaluate(() => Proposals.openAdminModal('partner'));
    assert.equal(await page.locator('#workflow_senhaGov').getAttribute('type'), 'password');
    assert.equal(await page.locator('#managePropProtBacen').isDisabled(), true);
    assert.equal(await page.locator('#workflow_protocoloConsumidor').isDisabled(), true);
    assert.equal(await page.locator('#workflow_tabelaManual').isDisabled(), true);
    assert.equal(await page.locator('#managePropAnexosFolders [data-folder-key="boleto"]').count(), 0);
    await page.locator('#workflow_senhaGov').fill('segredo-gov');
    await page.locator('#workflow_emailPessoal').fill('cliente@example.test');
    await page.evaluate(() => {
      document.getElementById('managePropProtBacen').value='ALTERACAO-NEGADA';
      document.getElementById('workflow_protocoloConsumidor').value='NEGADO';
    });
    await page.evaluate(() => Proposals.adminSave());
    assert.equal(await page.evaluate(() => rows.partner.protocoloBacen), 'BACEN-OLD');
    assert.equal(await page.evaluate(() => rows.partner.meta.workflow.protocoloConsumidor), 'GOV-OLD');
    assert.equal(await page.evaluate(() => rows.partner.meta.workflow.senhaGov), 'segredo-gov');
    assert.equal(await page.evaluate(() => JSON.stringify(rows.partner.history).includes('segredo-gov')), false);
    // Backoffice interno identifica a rede pelo vendedor, inclusive propostas legadas sem meta.
    await page.evaluate(() => {
      delete window.PARTNER_ROOT_ID;
      user={id:'internalBo',name:'Backoffice interno',role:'backoffice'};
      delete rows.partner.meta.workflow.partnerRootId;
    });
    await page.evaluate(() => Proposals.openAdminModal('partner'));
    assert.equal(await page.locator('#workflow_tabelaManual').isDisabled(), false);
    assert.equal(await page.locator('#managePropProtBacen').isDisabled(), false);
    assert.equal(await page.locator('#workflow_senhaGov').isDisabled(), true);
    assert.equal(await page.locator('#managePropAnexosFolders [data-folder-key="boleto"]').count(), 1);
    await page.locator('#workflow_tabelaManual').fill('Tabela parceira personalizada');
    await page.locator('#managePropProtBacen').fill('BACEN-NOVO');
    await page.locator('#managePropDataBacen').fill('2026-10-06');
    await page.locator('#workflow_protocoloConsumidor').fill('GOV-NOVO');
    await page.locator('#workflow_dataConsumidor').fill('2026-10-07');
    await page.evaluate(() => Proposals.adminSave());
    assert.equal(await page.evaluate(() => rows.partner.tabela), 'Tabela parceira personalizada');
    assert.equal(await page.evaluate(() => rows.partner.meta.workflow.expiraBacen), '2026-10-16');
    assert.equal(await page.evaluate(() => rows.partner.meta.workflow.expiraConsumidor), '2026-10-17');
    await page.evaluate(() => { window.PARTNER_ROOT_ID='partner1'; user={id:'partnerSeller',name:'Vendedor parceiro',role:'vendedor'}; });
    await page.evaluate(() => ProposalWorkflow.create());
    await page.locator('#workflow_clientCpf').fill('12345678901');
    await page.locator('#workflow_clientName').fill('Cliente parceiro');
    await page.locator('#workflow_numero').fill('PARCEIRO-100');
    await page.locator('#workflow_valor').fill('2000');
    const partnerCreatedId=await page.evaluate(() => {
      Proposals._workflowDraft.attachments={identidade_frente:'https://example.test/frente.pdf',identidade_verso:'https://example.test/verso.pdf',contracheque_1:'https://example.test/cc.pdf',extrato_1:'https://example.test/ext.pdf'};
      return Proposals._workflowDraft.id;
    });
    await page.evaluate(() => Proposals.adminSave());
    const partnerCreated=await page.evaluate(id=>rows[id],partnerCreatedId);
    assert.ok(partnerCreated, JSON.stringify(await page.evaluate(()=>messages)));
    assert.equal(partnerCreated.meta.workflow.partnerRootId,'partner1');
    assert.equal(partnerCreated.protocoloBacen || '', '');
    await page.evaluate(() => {
      rows.otherPartner={...structuredClone(base),id:'otherPartner',vendorId:'partner2'};
      window.partnerOrgCan=key=>key==='visualizar_propostas';
    });
    assert.equal(await page.evaluate(() => ProposalWorkflow.canEdit(rows.partner,user)), false);
    await page.evaluate(() => { window.partnerOrgCan=()=>true; });
    assert.equal(await page.evaluate(() => ProposalWorkflow.canEdit(rows.otherPartner,user)), false);
    const sectionsHtml=fs.readFileSync(path.join(root,'pages/financeiro-sections.html'),'utf8');
    await page.evaluate(html => {
      document.getElementById('manageProposalModal').remove();
      window.fetch=async()=>({ok:true,text:async()=>html});
      window.user={id:'partnerSeller',name:'Vendedor parceiro',role:'vendedor'};
    }, sectionsHtml);
    await page.evaluate(()=>ProposalWorkflow.openPartnerEmployee('partner',false));
    assert.equal(await page.locator('#manageProposalModal').count(),1);
    assert.equal(await page.locator('#workflow_senhaGov').count(),1);
    assert.equal(await page.locator('#managePropId').inputValue(),'partner');
    await page.selectOption('#workflow_convenio','FEDERAL');
    assert.deepEqual(await page.locator('#workflow_entidade option').allTextContents(),['Selecione o órgão / entidade','SIAPE']);
    await page.selectOption('#workflow_entidade','SIAPE');
    await page.selectOption('#workflow_convenio','INSS');
    assert.equal(await page.locator('#workflow_entidade').inputValue(),'');
    assert.ok((await page.locator('#workflow_entidade option').allTextContents()).includes('APOSENTADO'));
    assert.ok(!(await page.locator('#workflow_entidade option').allTextContents()).includes('SIAPE'));
    await page.selectOption('#workflow_convenio','CLT');
    assert.ok((await page.locator('#workflow_entidade option').allTextContents()).includes('CLT - DATAPREV'));
    await page.selectOption('#workflow_convenio','');
    assert.equal(await page.locator('#workflow_entidade').isVisible(),false);
    assert.deepEqual(errors, []);
    console.log('OK: fluxos internos e parceiro, perfis, cadastro sem BACEN, tabela manual, prazos, sigilo no histórico e isolamento entre redes.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
