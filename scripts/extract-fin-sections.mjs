import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminPath = path.join(__dirname, '../pages/admin.html');
const outPath = path.join(__dirname, '../pages/financeiro-sections.html');
const html = fs.readFileSync(adminPath, 'utf8');

const sectionIds = [
  'secMarketplaceManage',
  'secContaCorrenteGestao',
  'secWithdrawals',
  'secBalance',
  'secFornecedorFinanceiro',
  'secFiscalParceiro',
  'secContaCorrente',
  'secEsteiraCredito',
];

const parts = [];
for (const id of sectionIds) {
  const re = new RegExp(`<(section|div)[^>]*id="${id}"[^>]*>[\\s\\S]*?</\\1>`, 'i');
  const m = html.match(re);
  if (m) {
    let block = m[0];
    if (/^<section/i.test(block)) {
      block = block.replace(/^<section/i, '<div').replace(/<\/section>$/i, '</div>');
    }
    if (/class="section"/.test(block)) {
      block = block.replace(/class="section"/, 'class="section fin-section"');
    } else {
      block = block.replace(/^<div/i, '<div class="section fin-section"');
    }
    block = block.replace(/\sclass="section"(?=\s|>)/, '');
    parts.push(block);
    console.log('OK', id, m[0].length);
  } else {
    console.log('MISSING', id);
  }
}

const modalIds = [
  'withdrawalModal',
];
for (const id of modalIds) {
  const re = new RegExp(`<div class="modal-overlay" id="${id}"[\\s\\S]*?</div></div></div>`, 'i');
  const m = html.match(re);
  if (m) { parts.push(m[0]); console.log('MODAL', id, m[0].length); }
  else console.log('MODAL MISSING', id);
}

const scripts = [...html.matchAll(/src="\.\.\/js\/[^"]+"/g)].map(m => m[0].slice(5, -1));
console.log('\nScripts:', [...new Set(scripts)].join('\n'));

fs.writeFileSync(outPath, parts.join('\n\n'), 'utf8');
console.log('\nWrote', outPath, parts.join('').length, 'chars');
