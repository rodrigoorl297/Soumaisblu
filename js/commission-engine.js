(function(){
  'use strict';
  const json=x=>{if(typeof x==='string'){try{return JSON.parse(x)||{};}catch{return {};}}return x||{};};
  const key=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase().replace(/\s+/g,' ');
  const bank=x=>key(x).replace(/^\d+\s*-\s*/,'').replace(/BANK$/,'');
  const month=x=>{const raw=String(x||'');if(/^\d{4}-\d{2}/.test(raw))return raw.slice(0,7);const m=key(raw).match(/^(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\/(\d{4})$/);return m?`${m[2]}-${String(['JANEIRO','FEVEREIRO','MARCO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'].indexOf(m[1])+1).padStart(2,'0')}`:null;};
  const E=window.CommissionEngine={
    zeroException(proposal){
      const wf=json(json(proposal.meta).workflow),table=key(wf.tabelaManual||proposal.tabela);
      const neo=bank(proposal.bancoDigitado||proposal.banco_digitado||proposal.banco).replace(/^BANCO /,'')==='NEO';
      const location=key(proposal.entidade||proposal.convenio);
      return table==='NCDT_096-999_EXCECAO' && neo && /^(GOV PR|GOVERNO PR|GOV DO PARANA - PR|GOVERNO DO PARANA - PR)$/.test(location);
    },
    calculate(proposal,records){
      const wf=json(json(proposal.meta).workflow),table=key(wf.tabelaManual||proposal.tabela),proposalBank=bank(proposal.bancoDigitado||proposal.banco_digitado||proposal.banco),base=Number(proposal.valorFinal??proposal.valor_final??proposal.valor);
      if(!table || !proposalBank)return {status:'incompleto',message:'Informe banco digitado e tabela para calcular a comissão da empresa.'};
      if(!Number.isFinite(base)||base<0)return {status:'incompleto',message:'Valor da proposta inválido.'};
      if(this.zeroException(proposal))return {status:'calculado',rule_id:'neo-govpr-ncdt-096-999-excecao',bank:'NEO',table:'NCDT_096-999_EXCECAO',rate:0,vendorRate:0,base:Math.round(base*100)/100,amount:0,vendorAmount:0,message:'Tabela de exceção: comissão da empresa e do vendedor em 0%.'};
      const product=key(wf.subproduto||proposal.subproduto||proposal.product),loan=['CNC','NOVO','REFIN','SAQUE COMPL','COMPRA DE DIVIDA'].includes(product)?'EMP':product;
      const convenio=key(proposal.convenio),entity=key(proposal.entidade),date=month(proposal.created_at||proposal.createdAt||new Date().toISOString());
      const matches=(records||[]).filter(r=>r.kind==='comissao').map(r=>({id:r.id,data:json(r.data)})).filter(r=>{
        const d=r.data;if(d.status==='inativo'||d.status==='cancelado'||key(d.tabela)!==table||bank(d.banco)!==proposalBank)return false;
        if(d.produto && key(d.produto)!==loan && key(d.produto)!==product)return false;
        if(d.convenio && !['GERAL',convenio,entity].includes(key(d.convenio)))return false;
        if(d.prazo && String(d.prazo)!==String(wf.prazo||proposal.prazo||''))return false;
        if(d.vigencia && (!month(d.vigencia)||month(d.vigencia)!==date))return false;
        return true;
      });
      if(matches.length!==1)return {status:matches.length?'conflito':'sem_regra',message:matches.length?'Há mais de uma regra aplicável. Revise os cadastros.':'Nenhuma tabela vigente corresponde aos dados desta proposta.'};
      const rule=matches[0],rate=Number(rule.data.empresa);
      if(!Number.isFinite(rate)||rate<0||rate>100)return {status:'invalido',message:'Percentual da empresa inválido.'};
      const baseCents=Math.round((base+Number.EPSILON)*100),amount=Math.round(baseCents*rate/100)/100;
      return {status:'calculado',rule_id:rule.id,bank:rule.data.banco,table:rule.data.tabela,rate,base:baseCents/100,amount,calculated_at:new Date().toISOString(),message:'Comissão prevista da empresa. O recebimento e o crédito dependem da baixa financeira.'};
    },
    async forProposal(proposal){return this.calculate(proposal,this.zeroException(proposal)?[]:await DB.listFinanceWorkbook());},
    async attach(proposal){
      const role=String(window.Auth?.getSession()?.role||'').toLowerCase();
      if(window.PARTNER_ROOT_ID || !['master','fundador','financeiro','financial'].includes(role))return proposal;
      if(DB.online)await FinanceAccess.ensure();
      const meta=json(proposal.meta);return {...proposal,meta:{...meta,company_commission:await this.forProposal(proposal)}};
    },
    async show(proposal,host){
      if(!host)return;
      let output=host.querySelector('[data-company-commission]');if(!output){output=document.createElement('p');output.dataset.companyCommission='1';output.setAttribute('role','status');host.prepend(output);}
      const id=String(proposal.id);output.dataset.proposal=id;
      try{const result=await this.forProposal(proposal);if(output.dataset.proposal!==id)return;output.textContent=result.status==='calculado'?`Comissão prevista da empresa: ${result.amount.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} (${result.rate}% de ${result.base.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}). ${result.message}`:result.message;}catch(e){output.textContent='Cálculo indisponível: '+e.message;}
    }
  };
})();
