// The chrome around the views: the router, render(), the header (who you are, the tax year), the
// draft strip, the side navigation with its counts, and what runs after a render (search, the
// fetches a page starts). Each view is a function that returns HTML; this picks one by the route.

import { buildModel } from './model.js'
import { activeChange, draftFiles, published } from './draft.js'
import { scheduleImpact } from './runner.js'
import { $, ROLE, S, STATIC, api, esc, me } from './state.js'
import { loadImpactRun, loadVerify, viewChange, viewChanges, viewImpact } from './views/changes.js'
import { viewExamples } from './views/examples.js'
import { viewHome } from './views/home.js'
import { viewAll, viewFederal } from './views/lists.js'
import { clearQuestionState, viewQuestionBuilder, viewQuestions } from './views/questions.js'
import { REPORTS, loadReport, viewReport } from './views/reports.js'
import { viewRequests } from './views/requests.js'
import { viewRule } from './views/rule.js'
import { viewScreen, viewScreens } from './views/screens.js'
import { viewYears } from './views/values.js'

export async function refresh () {
  S.data = await api('GET', '/api/state')
  if (!S.year) S.year = S.data.siteYear
  S.model = buildModel({ ...S.data, year: S.year })
  render()
}

export function render () {
  const c = activeChange()
  S.draftModel = c ? buildModel({ ...draftFiles(c).files, federal: S.data.federal, year: S.year }) : null
  renderWho()
  renderStaticStrip()
  renderStrip()
  renderNav()
  const [view, arg] = S.route
  const views = { '': viewHome, values: viewYears, rule: viewRule, examples: viewExamples, changes: viewChanges, change: viewChange, requests: viewRequests, federal: viewFederal, all: viewAll, coverage: viewReport, exports: viewReport, spanish: viewReport, history: viewReport, questions: viewQuestions, question: viewQuestionBuilder, screens: viewScreens, screen: viewScreen }
  let fn = views[view] || viewHome
  if (view === 'change' && S.route[2] === 'impact') fn = viewImpact
  if (view !== 'question') clearQuestionState()
  const argText = view === 'question' ? S.route.slice(1).join('/') : arg ? decodeURIComponent(arg) : undefined
  $('#main').innerHTML = fn(argText)
  afterRender()
  scheduleImpact()
}

function renderWho () {
  const sel = $('#who-select')
  sel.innerHTML = S.data.people.map(p => `<option value="${p.id}" ${p.id === S.me ? 'selected' : ''}>${esc(p.name)}</option>`).join('')
  const p = me()
  $('#who-role').textContent = ROLE[p.role]
  $('#who-role').className = `role ${p.role}`
  $('#who-avatar').textContent = p.initials
  $('#who-avatar').className = `avatar ${p.role}`
  const ys = $('#year-select')
  if (ys) {
    const years = new Set([S.data.siteYear, S.data.siteYear + 1, S.data.siteYear + 2, S.data.siteYear + 3, S.year])
    for (const f of S.model.facts.values()) for (const s of f.schedule?.steps || []) years.add(s.year)
    ys.innerHTML = [...years].sort().map(y => `<option value="${y}" ${y === S.year ? 'selected' : ''}>Tax year ${y}${y === S.data.siteYear ? ' (live site)' : ''}</option>`).join('')
  }
}

function renderStaticStrip () {
  const strip = $('#static-strip')
  if (!strip) return
  if (!STATIC) { strip.hidden = true; return }
  strip.hidden = false
  strip.innerHTML = `<span><b>Read-only copy.</b> Built from the rules at commit ${esc(STATIC.commit || '?')} on ${esc(STATIC.built || '?')}. Browse the lines, the values, the worked examples and the reports; pick a person to see their view. To change anything, run the Workbench on your own machine: <code>make workbench</code>.</span>`
}

export function renderStrip () {
  const strip = $('#draft-strip')
  const c = activeChange()
  if (!c) { strip.hidden = true; return }
  const n = c.edits.length
  const x = c.exampleEdits.length
  strip.hidden = false
  strip.innerHTML = `<span><b>Draft #${c.id}:</b> “${esc(c.title)}” · ${n} rule/value edit${n === 1 ? '' : 's'}${x ? ` · ${x} example edit${x === 1 ? '' : 's'}` : ''}${c.requestIds?.length ? ` · waits on request #${c.requestIds.join(', #')}` : ''}</span>
    <span class="acts"><a class="btn sec sm" href="#/change/${c.id}">Open draft</a><button class="btn quiet sm" data-act="leave-draft">Set aside</button><button class="btn sm" data-act="submit" data-id="${c.id}">Send for review →</button></span>`
}

function renderNav () {
  const [view] = S.route
  for (const a of document.querySelectorAll('[data-nav]')) a.classList.toggle('on', (a.dataset.nav === 'home' && !view) || a.dataset.nav === view || (view === 'rule' && a.dataset.nav === 'home') || (view === 'change' && a.dataset.nav === 'changes'))
  const facts = [...S.model.facts.values()]
  $('#n-values').textContent = facts.filter(f => f.kind === 'value').length
  $('#n-examples').textContent = S.data.examplesFile.examples.length
  $('#n-changes').textContent = S.data.changes.filter(c => ['draft', 'review', 'approved'].includes(c.status)).length
  $('#n-requests').textContent = S.data.requests.filter(r => r.status === 'open').length
  $('#n-federal').textContent = S.data.federal.inputs.length
  $('#n-all').textContent = facts.length
  const nq = $('#n-questions'); if (nq) nq.textContent = facts.filter(f => f.kind === 'asked').length
  const ns = $('#n-screens'); if (ns) { let n = 0; try { n = (S.data.flow.match(/<page /g) || []).length } catch { n = 0 }; ns.textContent = n }
  const stems = Object.keys(S.data.paths.facts)
  const first = S.data.paths.facts[stems[0]] || ''
  $('#file-info').innerHTML = STATIC
    ? `A read-only copy of the ${stems.length} Virginia modules in <code title="${esc(stems.map(k => S.data.paths.facts[k]).join('\n'))}">${esc(first.replace(/\/[^/]*$/, '').split('/').pop() || 'facts')}/</code>, as they were at commit ${esc(STATIC.commit || '?')}. Nothing here is live.`
    : `Reading the ${stems.length} Virginia modules in <code title="${esc(stems.map(k => S.data.paths.facts[k]).join('\n'))}">${esc(first.replace(/\/[^/]*$/, '').split('/').pop() || 'facts')}/</code>${first.startsWith('/') ? ' (a copy: WORKBENCH_FACTS_DIR)' : ''} live. Edits here touch them only when a change is published.`
}

function afterRender () {
  const s = $('#line-search')
  if (s) { s.oninput = () => { S.search = s.value; filterLines() }; filterLines() }
  if (S.route[0] === 'change' && S.route[2] === 'impact') loadImpactRun(S.route[1])
  else if (S.route[0] === 'change') loadVerify(S.route[1])
  if (REPORTS[S.route[0]]) loadReport(S.route[0])
}

function filterLines () {
  const q = (S.search || '').toLowerCase().trim()
  for (const row of document.querySelectorAll('#line-list [data-search]')) row.hidden = q && !row.dataset.search.includes(q)
}

export function route () {
  S.route = location.hash.replace(/^#\/?/, '').split('/')
  if (S.route[0] !== 'rule') S.rule = Object.fromEntries(Object.entries(S.rule).filter(([p]) => activeChange()?.edits.some(e => e.path === p)))
  if (S.data) { render(); $('#main').focus({ preventScroll: true }); window.scrollTo(0, 0) }
}
