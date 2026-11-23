const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const select = { value: 'todos', dataset: {}, classList: { add() {}, remove() {} } };
const rows = [
  { id: 'active', status: 'Proposta digitada' },
  { id: 'cancelled', status: 'Cancelado' },
  { id: 'legacy', status: 'Pendente', status_op: 'CANCELADA' },
  { id: 'paid', status: 'Pago' },
];
const context = {
  console,
  window: { CommissionEngine: {}, addEventListener() {} },
  document: {
    readyState: 'loading', addEventListener() {}, createElement() { return {}; },
    head: { appendChild() {} },
    getElementById(id) { return id === 'proposalStatusFilterHeader' ? select : null; },
  },
  Auth: { getSession() { return { id: 'admin', role: 'master' }; } },
  DB: {
    async getProposals() { return rows; },
    isCancelledProposal(p) { return [p.status, p.statusOp, p.status_op].some(v => /cancel/i.test(v || '')); },
  },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/proposals.js', 'utf8'), context);
const p = context.window.Proposals;
p._fillAdminStatusFilterSelect();
assert.match(select.innerHTML, /value="todos">TODAS</);
assert.match(select.innerHTML, /value="sem_canceladas">TODAS, EXCETO CANCELADAS</);
assert.equal(p._getAdminStatusFilter(), 'todos');
Object.assign(p, {
  _getProposalSearchQuery() { return ''; }, _getAdminVendorFilter() { return ''; },
  _getAdminDateFilter() { return {}; }, _initAdminProposalFilters() {},
  _normProposal(row) { return row; },
  async _filterProposalsToSupervisorTeam(list) { return list; },
  _canSeePartnerProposalsInAdminList() { return true; },
  _matchesDateFilter() { return true; },
  _sortProposalsNewestFirst(list) { return list; },
  _updateAdminVendorSortHeader() {}, _propPerfLog() {},
});
(async () => {
  const ids = result => Array.from(result.proposals, row => row.id);
  assert.deepEqual(ids(await p._fetchAdminProposalsFiltered()), ['active', 'cancelled', 'legacy', 'paid']);
  select.value = 'sem_canceladas';
  assert.deepEqual(ids(await p._fetchAdminProposalsFiltered()), ['active', 'paid']);
  select.value = 'todos';
  assert.deepEqual(ids(await p._fetchAdminProposalsFiltered({ fromCache: true })), ['active', 'cancelled', 'legacy', 'paid']);
  select.value = 'Pago';
  assert.deepEqual(ids(await p._fetchAdminProposalsFiltered()), ['paid']);
  select.value = '';
  assert.deepEqual(ids(await p._fetchAdminProposalsFiltered()), ['active', 'paid']);
  console.log('PASS: Todas inclui canceladas; opção sem canceladas exclui status e fase legados; cache e status específico preservados.');
})().catch(error => { console.error(error); process.exitCode = 1; });
