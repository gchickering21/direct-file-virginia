// The "here is what it changed" view for the Virginia correction screens.
//
// A correction is made on the correct-* pages with ordinary <fg-set> inputs bound to the federal
// facts (or, for Lines 20 to 22, the records facts), so both returns change. What the engine does
// not keep is the "before": this module snapshots the Form 760 lines and the correctable facts when
// a correct-* page opens (once per round; the round starts on the "Is everything right?" page) and,
// on the corrections page, compares them with the graph as it now stands. Presentation only; no
// fact is written here.
//
// The snapshot is tagged with the identity on the return (last name and date of birth) and the
// graph it came from (the filer and W-2 ids, which a loaded scenario replaces), and is dropped when
// either differs: a "before" from someone else's return is worse than none. Every word shown comes
// from the locale through virginia-strings.js; amounts and dates are formatted for the page's
// language, cents kept.
import { factGraph } from '../vendor/form-builder/flow-runtime/js/fg-fact-graph.js'
import { t, lang, esc } from './virginia-strings.js'

const KEY = 'virginia:correction-snapshot'
const LINES = [
  ['/vaFederalAdjustedGrossIncome', 'line.1'],
  ['/vaAgeDeduction', 'line.4'],
  ['/vaAdjustedGrossIncome', 'line.9'],
  ['/vaStandardDeduction', 'line.11'],
  ['/vaExemptions', 'line.12'],
  ['/vaTaxableIncome', 'line.15'],
  ['/vaTax', 'line.16'],
  ['/vaWithholding', 'line.19a'],
  ['/vaEstimatedPayments', 'line.20'],
  ['/vaPriorYearOverpaymentApplied', 'line.21'],
  ['/vaExtensionPayments', 'line.22'],
  ['/vaLowIncomeCredit', 'line.23'],
  ['/vaTaxYouOwe', 'line.27'],
  ['/vaOverpayment', 'line.28'],
  ['/vaAmountYouOwe', 'line.35'],
  ['/vaRefund', 'line.36']
]
const RECORDS = [['/vaEstimatedPayments', 'records.20'], ['/vaPriorYearOverpaymentApplied', 'records.21'], ['/vaExtensionPayments', 'records.22']]
const W2_BOXES = [['employerName', 'w2.employer'], ['writableWages', 'w2.box1'], ['writableFederalWithholding', 'w2.box2'], ['writableStateWages', 'w2.box16'], ['writableStateWithholding', 'w2.box17']]
const FEDERAL_BOXES = new Set(['writableWages', 'writableFederalWithholding'])

function read (path) {
  try { const r = factGraph.get(path); return r.hasValue ? r.get.toString() : null } catch { return null }
}
function ids (collection) {
  try { return Array.from(factGraph.getCollectionIds(collection)).map(String) } catch { return [] }
}
function money (s) {
  if (s === null || s === undefined) return t('corrections.none')
  const n = Number(s)
  if (Number.isNaN(n)) return String(s)
  const cents = Math.abs(n * 100) % 100 !== 0
  return new Intl.NumberFormat(lang(), { style: 'currency', currency: 'USD', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 }).format(n)
}
function date (s) {
  if (!s) return t('corrections.none')
  const d = new Date(s + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString(lang(), { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' })
}
function tag () {
  return { identity: `${read('/primaryFiler/lastName')}|${read('/primaryFiler/dateOfBirth')}`, graph: [...ids('/filers'), ...ids('/formW2s')].join(',') }
}
function snapshot () {
  const facts = {}
  LINES.forEach(([p]) => { facts[p] = read(p) })
  facts['/primaryFiler/dateOfBirth'] = read('/primaryFiler/dateOfBirth')
  const w2s = {}
  for (const id of ids('/formW2s')) {
    w2s[id] = {}
    W2_BOXES.forEach(([b]) => { w2s[id][b] = read(`/formW2s/#${id}/${b}`) })
  }
  return { ...tag(), facts, w2s }
}
function stored () {
  let before = null
  try { before = JSON.parse(sessionStorage.getItem(KEY) || 'null') } catch {}
  if (!before) return null
  const now = tag()
  if (before.identity !== now.identity || before.graph !== now.graph) { forget(); return null }
  return before
}
function forget () { try { sessionStorage.removeItem(KEY) } catch {} }

function describe (n) {
  return n > 0 ? t('corrections.owe', money(n)) : n < 0 ? t('corrections.refund', money(-n)) : t('corrections.nothing')
}

function render (box, before) {
  const after = snapshot()
  const balance = s => Number(s.facts['/vaAmountYouOwe'] ?? 0) - Number(s.facts['/vaRefund'] ?? 0)
  const owedB = balance(before)
  const owedA = balance(after)
  let html = `<p class="usa-intro">${esc(owedA === owedB ? t('corrections.same', describe(owedA)) : t('corrections.changed', describe(owedA), describe(owedB)))}</p>`

  const corrected = []
  if (before.facts['/primaryFiler/dateOfBirth'] !== after.facts['/primaryFiler/dateOfBirth']) {
    corrected.push([t('corrections.dob'), date(before.facts['/primaryFiler/dateOfBirth']), date(after.facts['/primaryFiler/dateOfBirth']), t('corrections.dob-note')])
  }
  for (const [path, key] of RECORDS) {
    if ((before.facts[path] ?? null) !== (after.facts[path] ?? null)) corrected.push([t(key), money(before.facts[path]), money(after.facts[path]), t('corrections.records-note')])
  }
  for (const id of Object.keys(after.w2s)) {
    const b = Object.hasOwn(before.w2s, id) ? before.w2s[id] : {}
    const a = after.w2s[id]
    for (const [k, key] of W2_BOXES) {
      if ((b[k] ?? null) === (a[k] ?? null)) continue
      const label = t('corrections.w2-from', a.employerName || t('corrections.your-employer')) + ': ' + t(key)
      const format = k === 'employerName' ? v => v ?? t('corrections.none') : money
      corrected.push([label, format(b[k]), format(a[k]), t(FEDERAL_BOXES.has(k) ? 'corrections.w2-federal-note' : 'corrections.w2-note')])
    }
  }
  html += `<table class="usa-table usa-table--borderless va-corrections"><caption>${esc(t('corrections.caption'))}</caption><thead><tr><th scope="col">${esc(t('corrections.col-item'))}</th><th scope="col">${esc(t('corrections.col-was'))}</th><th scope="col">${esc(t('corrections.col-now'))}</th></tr></thead><tbody>`
  html += corrected.length
    ? corrected.map(([l, b, a, note]) => `<tr><th scope="row">${esc(l)}<br><small>${esc(note)}</small></th><td>${esc(b)}</td><td><strong>${esc(a)}</strong></td></tr>`).join('')
    : `<tr><td colspan="3">${esc(t('corrections.nothing-changed'))}</td></tr>`
  html += '</tbody></table>'

  const moved = LINES.filter(([p]) => (before.facts[p] ?? null) !== (after.facts[p] ?? null))
  if (moved.length) {
    html += `<details class="va-corrections__lines"><summary>${esc(moved.length === 1 ? t('corrections.lines-one') : t('corrections.lines-many', moved.length))}</summary><table class="usa-table usa-table--borderless"><tbody>`
    html += moved.map(([p, key]) => `<tr><th scope="row">${esc(t(key))}</th><td>${esc(money(before.facts[p]))} <span class="usa-sr-only">${esc(t('corrections.to'))}</span><span class="va-op va-op--arrow"></span> <strong>${esc(money(after.facts[p]))}</strong></td></tr>`).join('')
    html += '</tbody></table></details>'
  } else {
    html += `<p>${esc(t('corrections.no-line-changed'))}</p>`
  }
  // Built from locale strings and escaped fact values; nothing a filer typed reaches this unescaped.
  box.innerHTML = html
}

function onPage () {
  const path = location.pathname
  if (/\/virginia-check\/?$/.test(path)) forget()
  if (/\/virginia-correct-(dob|w2|records)\/?$/.test(path) && !stored()) {
    try { sessionStorage.setItem(KEY, JSON.stringify(snapshot())) } catch {}
  }
  const box = document.querySelector('.va-corrections-diff')
  if (!box) return
  const before = stored()
  if (!before) {
    box.textContent = ''
    const p = document.createElement('p')
    p.textContent = t('corrections.no-round')
    box.appendChild(p)
    return
  }
  render(box, before)
}
onPage()
