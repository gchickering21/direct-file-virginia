// The "here is what it changed" view for the Virginia correction screens.
//
// A correction is made on the correct-* pages with ordinary <fg-set> inputs bound to the federal
// facts, so both returns change. What the engine does not keep is the "before": this module
// snapshots the Form 760 lines and the correctable facts when a correct-* page opens (once per
// round; the round starts on the "Is everything right?" page) and, on the corrections page,
// compares them with the graph as it now stands. Presentation only; no fact is written here.
const KEY = 'virginia:correction-snapshot'
const LINES = [
  ['/vaFederalAdjustedGrossIncome', 'Line 1, federal adjusted gross income'],
  ['/vaAgeDeduction', 'Line 4, age deduction'],
  ['/vaAdjustedGrossIncome', 'Line 9, Virginia adjusted gross income'],
  ['/vaStandardDeduction', 'Line 11, standard deduction'],
  ['/vaExemptions', 'Line 12, exemptions'],
  ['/vaTaxableIncome', 'Line 15, Virginia taxable income'],
  ['/vaTax', 'Line 16, Virginia income tax'],
  ['/vaWithholding', 'Line 19a, Virginia tax withheld'],
  ['/vaTaxYouOwe', 'Line 27, tax you owe before use tax'],
  ['/vaOverpayment', 'Line 28, your overpayment'],
  ['/vaAmountYouOwe', 'Line 35, amount you owe'],
  ['/vaRefund', 'Line 36, your refund']
]
const W2_BOXES = [['employerName', 'Employer'], ['writableWages', 'Box 1, wages'], ['writableFederalWithholding', 'Box 2, federal tax withheld'], ['writableStateWages', 'Box 16, Virginia wages'], ['writableStateWithholding', 'Box 17, Virginia tax withheld']]

const graph = () => globalThis.factGraph
function read (path) {
  try { const r = graph().get(path); return r.hasValue ? r.get.toString() : null } catch { return null }
}
function money (s) {
  const n = Number(s); if (s === null || Number.isNaN(n)) return s === null ? '—' : s
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}
function date (s) {
  if (!s) return '—'; const d = new Date(s + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' })
}
function snapshot () {
  const facts = {}
  LINES.forEach(([p]) => { facts[p] = read(p) })
  facts['/primaryFiler/dateOfBirth'] = read('/primaryFiler/dateOfBirth')
  const w2s = {}
  try { for (const id of graph().getCollectionIds('/formW2s')) { w2s[id] = {}; W2_BOXES.forEach(([b]) => { w2s[id][b] = read(`/formW2s/#${id}/${b}`) }) } } catch {}
  return { facts, w2s }
}
function render (box, before) {
  const after = snapshot()
  const owedB = Number(before.facts['/vaAmountYouOwe'] ?? 0) - Number(before.facts['/vaRefund'] ?? 0)
  const owedA = Number(after.facts['/vaAmountYouOwe'] ?? 0) - Number(after.facts['/vaRefund'] ?? 0)
  const describe = n => n > 0 ? `you owe ${money(n)}` : n < 0 ? `your refund is ${money(-n)}` : 'you owe nothing'
  let html = ''
  html += owedA === owedB
    ? `<p class="usa-intro">What you owe did not change: ${describe(owedA)}.</p>`
    : `<p class="usa-intro">Now ${describe(owedA)}. Before this correction, ${describe(owedB)}.</p>`
  const corrected = []
  if (before.facts['/primaryFiler/dateOfBirth'] !== after.facts['/primaryFiler/dateOfBirth']) corrected.push(['Date of birth', date(before.facts['/primaryFiler/dateOfBirth']), date(after.facts['/primaryFiler/dateOfBirth']), 'Also corrected on your federal return.'])
  for (const id of Object.keys(after.w2s)) {
    const b = before.w2s[id] || {}, a = after.w2s[id]
    W2_BOXES.forEach(([k, label]) => { if ((b[k] ?? null) !== (a[k] ?? null)) corrected.push([`W-2 from ${a.employerName || 'your employer'}: ${label}`, k === 'employerName' ? (b[k] ?? '—') : money(b[k]), k === 'employerName' ? (a[k] ?? '—') : money(a[k]), ['writableWages', 'writableFederalWithholding'].includes(k) ? 'Also corrected on your federal return. Virginia will compare this with the W-2 your employer filed.' : 'Virginia will compare this with the W-2 your employer filed.']) })
  }
  html += '<table class="usa-table usa-table--borderless"><caption>What you corrected</caption><thead><tr><th scope="col">Item</th><th scope="col">Was</th><th scope="col">Now</th></tr></thead><tbody>'
  html += corrected.length ? corrected.map(([l, b, a, note]) => `<tr><th scope="row">${l}<br><small>${note}</small></th><td>${b}</td><td><strong>${a}</strong></td></tr>`).join('') : '<tr><td colspan="3">Nothing changed. The values you saved are the ones we already had.</td></tr>'
  html += '</tbody></table>'
  const moved = LINES.filter(([p]) => (before.facts[p] ?? null) !== (after.facts[p] ?? null))
  if (moved.length) {
    html += `<details><summary>${moved.length === 1 ? 'One line' : moved.length + ' lines'} on Form 760 changed</summary><table class="usa-table usa-table--borderless"><tbody>`
    html += moved.map(([p, l]) => `<tr><th scope="row">${l}</th><td>${money(before.facts[p])} → <strong>${money(after.facts[p])}</strong></td></tr>`).join('')
    html += '</tbody></table></details>'
  } else html += '<p>No line on Form 760 changed.</p>'
  box.innerHTML = html
}
function onPage () {
  const path = location.pathname
  if (/\/virginia-check\/?$/.test(path)) { try { sessionStorage.removeItem(KEY) } catch {} }
  if (/\/virginia-correct-(dob|w2)\//.test(path)) {
    try { if (!sessionStorage.getItem(KEY)) sessionStorage.setItem(KEY, JSON.stringify(snapshot())) } catch {}
  }
  const box = document.querySelector('.va-corrections-diff')
  if (box) {
    let before = null; try { before = JSON.parse(sessionStorage.getItem(KEY) || 'null') } catch {}
    if (!before) { box.innerHTML = '<p>No correction was made in this round, so there is nothing to compare.</p>'; return }
    render(box, before)
  }
}
if (graph()) onPage(); else document.addEventListener('fg-load', onPage, { once: true })
