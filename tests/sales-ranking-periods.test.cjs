const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = {
  window: {}, console, Date, Intl,
  document: { getElementById() { return null; }, createElement() { return {}; }, head: { appendChild() {} } },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/sales-ranking.js', 'utf8'), context);
const rank = context.window.SalesRanking;
const range = (period, reference) => {
  const r = rank._periodRange(period, new Date(reference));
  return [r.start?.toISOString() ?? null, r.end?.toISOString() ?? null];
};
assert.deepEqual(range('all', '2026-11-24T15:00:00Z'), [null,null]);
assert.deepEqual(range('day', '2026-11-24T02:59:59Z'), ['2026-11-23T03:00:00.000Z','2026-11-24T03:00:00.000Z']);
assert.deepEqual(range('day', '2026-11-24T03:00:00Z'), ['2026-11-24T03:00:00.000Z','2026-11-25T03:00:00.000Z']);
assert.deepEqual(range('week', '2026-11-29T15:00:00Z'), ['2026-11-23T03:00:00.000Z','2026-11-30T03:00:00.000Z']);
assert.deepEqual(range('week', '2026-11-30T03:00:00Z'), ['2026-11-30T03:00:00.000Z','2026-12-07T03:00:00.000Z']);
assert.deepEqual(range('week', '2027-01-01T15:00:00Z'), ['2026-12-28T03:00:00.000Z','2027-01-04T03:00:00.000Z']);
assert.deepEqual(range('month', '2028-02-29T15:00:00Z'), ['2028-02-01T03:00:00.000Z','2028-03-01T03:00:00.000Z']);
assert.deepEqual(Array.from(rank.PERIOD_OPTIONS, p => p.l), ['Total','Mensal','Semanal','Diário']);
const html = rank._periodButtonsHtml('week');
assert.match(html, /data-period="week" aria-pressed="true"/);
assert.equal((html.match(/<button /g) || []).length, 4);
const actualRange = rank._periodRange.bind(rank);
rank._periodRange = key => actualRange(key, new Date('2026-11-24T15:00:00Z'));
const proposals = [
  { id:'old', created_at:'2026-10-31T23:00:00-03:00', status:'PAGO' },
  { id:'month', created_at:'2026-11-01T00:00:00-03:00', status:'PAGO' },
  { id:'week', created_at:'2026-11-23T00:00:00-03:00', status:'PAGO' },
  { id:'today', created_at:'2026-11-24T00:00:00-03:00', status:'PAGO' },
  { id:'tomorrow', created_at:'2026-11-25T00:00:00-03:00', status:'PAGO' },
];
rank._matchesBillingStatus = () => true;
context.window._dashBillingFilter = 'all';
context.window._dashBillingStatusFilter = 'total';
context.window._filterPropsForTeamBilling = () => { throw new Error('Must not inherit another dashboard period'); };
for (const [period, expected] of [['day',['today']],['week',['week','today','tomorrow']],['month',['month','week','today','tomorrow']]]) {
  rank._filters.period = period;
  assert.deepEqual(Array.from(rank._filterForDashboardSync(proposals), p => p.id),expected);
  assert.deepEqual(Array.from(rank._filterByPeriodOnly(proposals), p => p.id),expected);
}
// Public ranking uses the same period without exposing master filters or amounts.
rank._filters.period = 'day';
rank._loadAllRankingVendors = async () => [];
rank._buildVendorIndex = () => ({});
rank._loadProposals = async () => proposals;
rank._scopeProposals = rows => rows;
rank._aggregateByPaidAndProposals = (users,rows) => rows;
rank._renderList = (id,rows,options) => { assert.equal(options.showSalesAmount,false); assert.deepEqual(Array.from(rows,p=>p.id),['today']); };
rank._renderPublicRanking('rankingList').then(() => console.log('PASS: quatro períodos, horário de Brasília, semana civil, limites, cache do dashboard e ranking público.')).catch(e => { console.error(e); process.exitCode=1; });
