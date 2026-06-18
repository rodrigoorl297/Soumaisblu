const fs = require('fs');

const COMISSAO_BLOCK = `</div><!-- Comissão vendedor --><div class="card card-padded" id="managePropComissaoSection" style="margin:16px 0;background:var(--color-surface-2);border:1px solid var(--color-border);"><h4 style="margin:0 0 12px;color:var(--color-primary);">Receber e pagar comissão</h4><p style="font-size:12px;color:var(--color-text-muted);margin:0 0 12px;">Elegibilidade e pagamento da comissão do vendedor (CPF, nº da proposta e nome do cliente estão acima).</p><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;"><div class="form-group"><label>Elegível comissão?</label><select id="managePropComissaoElegivel" class="form-control"><option value="">—</option><option value="SIM">SIM</option><option value="NÃO">NÃO</option></select></div><div class="form-group"><label>Recebeu comissão?</label><select id="managePropComissaoRecebida" class="form-control"><option value="">—</option><option value="SIM">SIM</option><option value="NÃO">NÃO</option></select></div><div class="form-group"><label>Valor recebido CMS (R$)</label><input type="number" id="managePropValorComissao" class="form-control" step="0.01" min="0" placeholder="0,00"/></div></div></div><!-- Operacional -->`;

const TABLE_HEAD_OLD = '<th>Valor Final</th><th>Data</th>';
const TABLE_HEAD_NEW = '<th>Valor Final</th><th>Eleg. CMS</th><th>Recebeu CMS</th><th>Vlr CMS</th><th>Data</th>';

function patchAdminModal(file) {
  if (!fs.existsSync(file)) return;
  let h = fs.readFileSync(file, 'utf8');
  if (h.includes('managePropComissaoElegivel')) {
    console.log('modal ok', file);
    return;
  }
  if (!h.includes('<!-- Operacional -->')) {
    console.log('skip modal', file);
    return;
  }
  h = h.replace('</div><!-- Operacional -->', COMISSAO_BLOCK);
  if (h.includes(TABLE_HEAD_OLD) && !h.includes('Eleg. CMS')) {
    h = h.replace(TABLE_HEAD_OLD, TABLE_HEAD_NEW);
  }
  fs.writeFileSync(file, h);
  console.log('patched modal', file);
}

function patchFinanceiroSections(file) {
  if (!fs.existsSync(file)) return;
  let h = fs.readFileSync(file, 'utf8');
  let changed = false;
  if (h.includes(TABLE_HEAD_OLD) && !h.includes('Eleg. CMS')) {
    h = h.replace(TABLE_HEAD_OLD, TABLE_HEAD_NEW);
    changed = true;
  }
  if (!h.includes('manageProposalModal')) {
    const admin = fs.readFileSync('pages/admin.html', 'utf8');
    const start = admin.indexOf('<!-- MODAL: GESTÃO PROPOSTA -->');
    const end = admin.indexOf('<!-- MODAL: GESTÃO DE PARCEIROS', start);
    if (start > -1 && end > start) {
      let modal = admin.slice(start, end);
      if (!modal.includes('managePropComissaoElegivel') && modal.includes('<!-- Operacional -->')) {
        modal = modal.replace('</div><!-- Operacional -->', COMISSAO_BLOCK);
      }
      h += '\n' + modal;
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(file, h);
    console.log('patched sections', file);
  }
}

['admin.html', 'pages/admin.html'].forEach(patchAdminModal);
['pages/financeiro-sections.html', 'financeiro-sections.html'].forEach(patchFinanceiroSections);
