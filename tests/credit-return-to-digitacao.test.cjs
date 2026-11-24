const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function main() {
  const user = { id: 'vendor', role: 'vendedor', name: 'Vendedor' };
  const pending = {
    id: 'proposal', vendor_id: user.id, entidade: 'COMPRA_DIVIDA',
    product: 'Crédito Pessoal', status: 'PENDENTE', updated_at: '2026-11-24 17:00:00',
    history: '[{"action":"Pendência registrada"}]',
  };
  let proposal = pending;
  let update;
  let updateResult = true;
  const toasts = [];
  const context = {
    window: {},
    document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } },
    Auth: { getSession: () => user },
    DB: {
      getProposal: async () => proposal,
      updateProposal: async (...args) => { update = args; return updateResult; },
    },
    setTimeout() {},
    showToast: (...args) => toasts.push(args),
  };
  vm.runInNewContext(fs.readFileSync('js/esteira-compra-divida.js', 'utf8'), context);
  const button = { dataset: { cdReturnId: pending.id }, disabled: false };
  const returnToDigitacao = () => context.window.EsteiraCompraDivida.returnToDigitacao(button);

  await returnToDigitacao();
  assert.equal(update[0], pending.id);
  assert.equal(update[1].status, 'AGUARDANDO DIGITAÇÃO');
  assert.equal(update[1].history[0].action, 'Pendência registrada');
  assert.match(update[1].history[1].action, /PENDENTE.*AGUARDANDO DIGITAÇÃO/);
  assert.equal(update[2].expectedUpdatedAt, pending.updated_at);
  assert.equal(toasts.at(-1)[1], 'success');

  for (const ineligible of [{ vendor_id: 'other' }, { product: 'REFIN PORT' }, { status: 'PAGO' }]) {
    proposal = { ...pending, ...ineligible };
    update = undefined;
    await returnToDigitacao();
    assert.equal(update, undefined);
    assert.equal(toasts.at(-1)[1], 'error');
  }

  proposal = { ...pending, product: 'CP', status: 'Pendenciado' };
  updateResult = null;
  await returnToDigitacao();
  assert.equal(update[1].status, 'AGUARDANDO DIGITAÇÃO');
  assert.equal(toasts.at(-1)[1], 'error');
  assert.equal(button.disabled, false);
  console.log('PASS: retorno de CP, histórico, permissão e conflito.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
