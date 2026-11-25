const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function main() {
  const values = {
    cd_cpf: '12345678901', cd_nome: 'Cliente Teste', cd_produto: 'CREDITO PESSOAL',
    cd_convenio: 'INSS', cd_banco: 'MERCANTIL', cd_tabela: 'MERCANTIL_PESSOAL_12X', cd_valor: '1000',
    cd_banco_conta: '001 - Banco do Brasil', cd_agencia: '0001-2', cd_conta: '0000123-4',
    cd_tipo_conta: 'poupanca', cd_endereco_logradouro: 'Rua de Teste', cd_endereco_numero: '1',
    cd_endereco_complemento: 'Apto 2', cd_endereco_bairro: 'Centro', cd_endereco_cidade: 'Goiânia',
    cd_endereco_uf: 'go', cd_endereco_cep: '74000-000',
  };
  let saved;
  let role = 'vendedor';
  const context = {
    window: {},
    document: {
      readyState: 'loading', addEventListener() {},
      getElementById: id => Object.hasOwn(values, id) ? { value: values[id] } : null,
    },
    Auth: { getSession: () => ({ id: 'test-user', name: 'Teste', role }) },
    DB: { saveProposal: async proposal => { saved = JSON.parse(JSON.stringify(proposal)); } },
    setTimeout() {}, nowBrazilSql: () => '2026-11-24 21:35:00', showToast() {}, console,
  };
  const script = fs.readFileSync('js/esteira-compra-divida.js', 'utf8');
  vm.runInNewContext(script.replace('  const EsteiraCompraDivida = {',
    '  window.renderCreditFields = formFieldsHtml;\n  const EsteiraCompraDivida = {'), context);
  const credit = context.window.EsteiraCompraDivida;
  credit.resetVendorForm = () => {};
  credit.closeNova = () => {};

  const vendorFields = context.window.renderCreditFields();
  assert.doesNotMatch(vendorFields, /id="cd_tabela"/);
  assert.match(context.window.renderCreditFields({ showTabela: true }), /id="cd_tabela"/);
  for (const field of ['cep', 'uf', 'cidade', 'bairro', 'logradouro', 'numero', 'complemento']) {
    assert.ok(vendorFields.includes('id="cd_endereco_' + field + '"'));
  }
  assert.equal((vendorFields.match(/class="cd-field cd-attachment"/g) || []).length, 2);

  await credit.submitVendor();
  assert.ok(saved, 'O formulário do vendedor deve salvar sem definir tabela');
  assert.equal(saved.tabela, '');
  assert.equal(saved.credito_esteira.tabela, '');
  assert.equal(saved.created_at, '2026-11-24 21:35:00');
  assert.match(saved.protocolo, /^CD-20261124-/);
  assert.equal(saved.credito_esteira.banco, 'MERCANTIL');
  assert.equal(saved.credito_esteira.endereco_campos.numero, '1');
  assert.equal(saved.credito_esteira.endereco_campos.complemento, 'Apto 2');
  assert.equal(saved.meta.client_bank.tipo_conta, 'poupanca');
  assert.ok(!Object.hasOwn(saved, 'tipo_conta'));

  const proposals = fs.readFileSync('js/proposals.js', 'utf8');
  const start = proposals.indexOf('_proposalClientFallback: function(');
  const end = proposals.indexOf('\n  },', start) + 6;
  const object = vm.runInNewContext('({' + proposals.slice(start, end) + '})');
  const loaded = object._proposalClientFallback(null, {
    client_cpf: saved.client_cpf,
    credito_esteira: JSON.stringify(saved.credito_esteira),
  });
  assert.equal(loaded.banco, values.cd_banco_conta);
  assert.equal(loaded.agencia, '0001-2');
  assert.equal(loaded.conta, '0000123-4');
  assert.equal(loaded.tipo_conta, 'poupanca');
  assert.equal(loaded.address, 'Estado: GO Município: Goiânia Rua: Rua de Teste, 1, Apto 2 Bairro: Centro Cep: 74000-000');

  role = 'backoffice';
  await credit.submitVendor();
  assert.equal(saved.tabela, values.cd_tabela);
  console.log('PASS: endereço, anexos, tabela por perfil e conta recuperada do payload.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
