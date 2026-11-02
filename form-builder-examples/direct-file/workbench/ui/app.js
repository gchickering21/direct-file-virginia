// The Rules Workbench page. One module, no framework: state lives in `S`, every view is a function
// that returns HTML, and clicks are handled by delegation on data-act attributes.
//
// The flow it implements is docs/virginia/mockups/rules-workbench.html: find the line, change a
// value or a rule inside a draft, watch the worked examples, send it for review, two approvals,
// publish. Every edit is held in the draft as a precise edit to the XML text (lib/xml-edit.js) and
// saved to the server as you go.

import {
  buildModel, describePath, feedsLines, derivedTree, derivedXml, shortName, parseXmlFragment, clone, el, dep, lit,
  elementKids, literalLabel, formatResult, humanize,
} from './model.js'
import { applyChange, applyExampleEdits, applyBaselineEdits, valueLiteral } from '/lib/xml-edit.js'
import { writableFacts } from '/lib/sandbox.js'
import {
  lawDialog, proposalsPanel, viewYears, yearCell, viewQuestions, viewQuestionBuilder, questionAct, questionInput, clearQuestionState,
  viewScreens, viewScreen, textEdit, bindFigure, viewImpact, loadImpactRun, railFor, spanishPanel, saveSpanish, wideItem, setYear,
} from './extra.js'

export const S = {
  data: null,
  model: null,
  draftModel: null, // the model with the active draft applied: new questions show up in pickers
  me: localStorage.getItem('wb-me') || 'mt',
  year: Number(localStorage.getItem('wb-year')) || null,
  route: [],
  rule: {}, // path → { tree, because, tab, xmlText, xmlError }
  runs: new Map(),
  pending: new Map(),
  impact: null,
  impactFor: null,
  filter: 'all',
  hooks: {},
}

export const $ = sel => document.querySelector(sel)
export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
// Escaped text with each "§ 58.1-3xx" linked to the Code of Virginia. Chapter 3 of Title 58.1 is
// the income tax (§§ 58.1-300 to 58.1-3xx); other chapters are left as text.
const STATUTE_RE = /\b58\.1-(3\d\d(?:\.\d+)?)\b/g
export const cite = s => esc(s).replace(STATUTE_RE, (m, sec) => `<a class="statute" href="https://law.lis.virginia.gov/vacode/title58.1/chapter3/section58.1-${sec}/" target="_blank" rel="noopener">${m}</a>`)
export const me = () => S.data.people.find(p => p.id === S.me) || S.data.people[0]
export const personName = id => S.data.people.find(p => p.id === id)?.name || id
export const ROLE = { 'policy-author': 'Policy author', 'policy-reviewer': 'Policy reviewer', engineer: 'Engineer', translator: 'Translator' }
export const STATUS = { draft: ['Draft', 'warn'], review: ['In review', 'blue'], approved: ['Approved', 'ok'], published: ['Published', ''], discarded: ['Discarded', ''] }
export const canEdit = () => ['policy-author', 'engineer'].includes(me().role)

// ---------------------------------------------------------------------------------------------
// Server

export async function api (method, url, body) {
  // X-Workbench marks the call as the page's own; the server refuses a write without it.
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json', 'x-workbench': '1' }, body: body ? JSON.stringify({ by: S.me, ...body }) : undefined })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(json.error || res.statusText); e.extra = json; throw e }
  return json
}

export async function refresh () {
  S.data = await api('GET', '/api/state')
  if (!S.year) S.year = S.data.siteYear
  S.model = buildModel({ ...S.data, year: S.year })
  render()
}

export function toast (msg, bad) {
  const t = $('#toast')
  t.textContent = msg
  t.className = bad ? 'bad' : ''
  t.hidden = false
  clearTimeout(toast.t)
  toast.t = setTimeout(() => { t.hidden = true }, bad ? 7000 : 3500)
}

// ---------------------------------------------------------------------------------------------
// The active draft: the change the current person is editing.

const activeKey = () => `wb-active-${S.me}`
export function activeChange () {
  const id = Number(localStorage.getItem(activeKey()))
  const c = S.data.changes.find(x => x.id === id)
  if (c && c.status === 'draft' && (c.author === S.me || me().role === 'engineer')) return c
  return null
}
const setActive = id => { if (id) localStorage.setItem(activeKey(), id); else localStorage.removeItem(activeKey()) }

export async function ensureDraft () {
  const c = activeChange()
  if (c) return c
  if (!canEdit()) { toast('Reviewers review; switch to an author or engineer to make changes.', true); return null }
  const title = await askText('Start a change', 'What is this change? A short title the reviewer will see.', '')
  if (!title) return null
  const created = await api('POST', '/api/changes', { title })
  S.data.changes.push(created)
  setActive(created.id)
  toast(`Started draft #${created.id}`)
  return created
}

let saveTimer
export function saveSoon (c) {
  c.updated = new Date().toISOString()
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      const saved = await api('PUT', `/api/changes/${c.id}`, { change: { title: c.title, summary: c.summary, source: c.source, edits: c.edits, exampleEdits: c.exampleEdits, requestIds: c.requestIds, spanish: c.spanish || {} } })
      Object.assign(c, saved)
      renderStrip()
    } catch (e) { toast(e.message, true) }
  }, 400)
  renderStrip()
  scheduleImpact()
}

export const published = () => ({ virginia: S.data.virginia, localities: S.data.localities, flow: S.data.flow, es: S.data.es })
export function draftFiles (c) {
  try { return { files: applyChange(published(), c) } } catch (e) { return { files: published(), conflict: e.message } }
}
S.hooks.applyChange = applyChange

// ---------------------------------------------------------------------------------------------
// Running examples in the worker

const worker = new Worker('/ui/worker.js', { type: 'module' })
let runSeq = 0
worker.onmessage = ({ data }) => { const p = S.pending.get(data.id); if (p) { S.pending.delete(data.id); p(data) } }
// A worker that fails to load (the engine missing, a syntax error) never answers: settle every
// waiting run with the error, so the panels show it instead of "recalculating" for ever.
worker.onerror = e => {
  const error = `The example runner failed: ${e.message || 'the worker could not start'}${e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : ''}`
  for (const [id, p] of S.pending) { S.pending.delete(id); p({ id, error }) }
  S.runs.clear()
  if (e.preventDefault) e.preventDefault()
}

function outputsFor (files) {
  const m = buildModel({ ...files, federal: S.data.federal, year: S.year })
  return [...m.facts.values()].filter(f => f.line && f.kind !== 'asked' && f.kind !== 'options').map(f => f.path)
}

export function run (files, examples, baseline = S.data.examplesFile.baseline) {
  // The whole text is the key: a dozen entries of a 70 KB file is nothing, and a hash could collide.
  const key = `${files.virginia}\0${files.localities}\0${JSON.stringify(examples)}\0${JSON.stringify(baseline)}`
  if (S.runs.has(key)) return S.runs.get(key)
  const id = ++runSeq
  const schema = { federal: S.data.federal, questions: [...writableFacts(files.virginia), ...writableFacts(files.localities)] }
  const p = new Promise(resolve => {
    S.pending.set(id, resolve)
    worker.postMessage({ id, files: { virginia: files.virginia, localities: files.localities }, federal: S.data.federal, examples, baseline, schema, outputs: outputsFor(files) })
  })
  p.then(r => { if (r.error && !r.results) S.runs.delete(key) })
  S.runs.set(key, p)
  if (S.runs.size > 12) S.runs.delete(S.runs.keys().next().value)
  return p
}
S.hooks.run = run

let impactTimer
function scheduleImpact () {
  clearTimeout(impactTimer)
  impactTimer = setTimeout(computeImpact, 350)
}

export async function computeImpact () {
  const c = activeChange()
  const baseExamples = S.data.examplesFile.examples
  const base = await run(published(), baseExamples)
  if (!c) { S.impact = { base, change: null }; paintImpact(); return }
  const { files, conflict } = draftFiles(c)
  const examples = applyExampleEdits(baseExamples, c)
  S.impact = { base, change: c, conflict, pending: true, examples }
  paintImpact()
  const draft = await run(files, examples, applyBaselineEdits(S.data.examplesFile.baseline, c))
  if (S.impact.change !== c) return
  S.impact = { base, draft, change: c, conflict, examples }
  paintImpact()
}

/** Per example: the lines whose value differs between published and draft. */
export function differences (base, draft, examples) {
  const out = []
  for (const ex of examples) {
    const a = base.results?.[ex.id]?.values || {}
    const b = draft.results?.[ex.id]?.values || {}
    const lines = Object.keys(b).filter(p => ex.id in (base.results || {}) && String(a[p]) !== String(b[p]))
    if (lines.length || !(ex.id in (base.results || {}))) out.push({ ex, lines, before: a, after: b })
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Rendering: chrome

export function render () {
  const c = activeChange()
  S.draftModel = c ? buildModel({ ...draftFiles(c).files, federal: S.data.federal, year: S.year }) : null
  renderWho()
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

function renderStrip () {
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
  $('#file-info').innerHTML = `Reading <code title="${esc(S.data.paths.virginia)}">${esc(S.data.paths.virginia.split('/').pop())}</code>${S.data.paths.virginia.startsWith('/') ? ' (a copy: WORKBENCH_FACTS_DIR)' : ''} live. Edits here touch it only when a change is published.`
}

// ---------------------------------------------------------------------------------------------
// Shared bits

export function chipFor (path) { return chip(path) }
function chip (path, opts = {}) {
  if (!path) return `<button class="chip empty" data-act="pick" data-at="${opts.at}">choose… <span class="caret">▾</span></button>`
  let d = describePath(S.model, path)
  if (d.kind === 'missing' && S.draftModel?.facts.has(path)) d = { ...describePath(S.draftModel, path), draft: true }
  const req = S.data.requests.find(r => r.factPath === path && r.status === 'open')
  const kind = d.kind === 'missing' && req ? 'req' : d.kind
  const tag = kind === 'req' ? `Requested #${req.id}` : { asked: 'Asked', federal: 'Federal', calc: 'Calc', value: 'Value', missing: 'Unknown' }[kind]
  const label = kind === 'req' ? req.question : d.label
  const value = d.fact?.literal ? ` <b>${esc(literalLabel(d.fact.literal.tag, d.fact.literal.value))}</b>` : ''
  const inner = `<span class="ty ${kind}">${d.draft ? 'Asked · in draft' : tag}</span> ${esc(label)}${value}`
  if (opts.at !== undefined && opts.editable) return `<button class="chip ${kind === 'req' ? 'req' : kind === 'missing' ? 'missing' : ''}" data-act="pick" data-at="${opts.at}" title="${esc(path)}">${inner} <span class="caret">▾</span></button>`
  const href = d.fact && d.fact.kind !== 'value' ? `#/rule/${encodeURIComponent(path)}` : d.fact ? '#/values' : null
  return href ? `<a class="chip" href="${href}" title="${esc(path)}" style="text-decoration:none">${inner}</a>` : `<span class="chip ${kind === 'req' ? 'req' : ''}" title="${esc(path)}">${inner}</span>`
}

export function lineName (path) {
  const f = S.model.facts.get(path) || S.draftModel?.facts.get(path)
  return f?.line ? `Line ${f.line.label}` : f?.name || path
}

function lineStatus (path) {
  const c = S.data.changes.find(x => ['draft', 'review', 'approved'].includes(x.status) && x.edits.some(e => e.path === path))
  if (!c) return null
  return c
}

export function statusPill (c) {
  const [label, cls] = STATUS[c.status]
  return `<span class="pill ${cls}">${label}</span>`
}

function resultCell (r, path, expected) {
  if (!r) return '<span class="spin" title="running"></span>'
  if (r.error) return `<span class="res-bad" title="${esc(r.error)}">error</span>`
  const v = r.values?.[path]
  if (expected === undefined) return esc(formatResult(v))
  const ok = v !== null && v !== undefined && (typeof v === 'number' ? Math.abs(v - Number(expected)) < 0.005 : String(v) === String(expected))
  return `<span class="${ok ? 'res-ok' : 'res-bad'}">${esc(formatResult(v))} ${ok ? '✓' : '✗'}</span>`
}

// ---------------------------------------------------------------------------------------------
// 1. Home

function viewHome () {
  const p = me()
  const cards = []
  const open = S.data.changes.filter(c => ['draft', 'review', 'approved'].includes(c.status))
  if (p.role === 'policy-reviewer') {
    for (const c of open.filter(c => c.status === 'review' && !c.approvals.some(a => a.kind === 'policy'))) cards.push(`<a href="#/change/${c.id}"><b>Review change #${c.id}</b><span class="cite">“${esc(c.title)}” by ${esc(personName(c.author))} needs the policy approval</span></a>`)
  }
  if (p.role === 'engineer') {
    for (const c of open.filter(c => c.status === 'review' && c.author !== p.id && !c.approvals.some(a => a.kind === 'engineering'))) cards.push(`<a href="#/change/${c.id}"><b>Review change #${c.id}</b><span class="cite">“${esc(c.title)}” needs the engineering approval</span></a>`)
    for (const c of open.filter(c => c.status === 'approved')) cards.push(`<a class="ok" href="#/change/${c.id}"><b>Publish change #${c.id}</b><span class="cite">Both approvals are in.</span></a>`)
    for (const r of S.data.requests.filter(r => r.status === 'open')) cards.push(`<a class="wait" href="#/requests"><b>Request #${r.id}</b><span class="cite">${esc(r.question)}</span></a>`)
  }
  if (p.role === 'translator') {
    for (const c of open.filter(c => ['draft', 'review'].includes(c.status) && c.edits.some(e => e.type === 'question' || e.type === 'text') && !c.approvals.some(a => a.kind === 'translation'))) cards.push(`<a class="wait" href="#/change/${c.id}"><b>Spanish for change #${c.id}</b><span class="cite">“${esc(c.title)}” changes words on the screens</span></a>`)
  }
  if (p.role === 'policy-author') {
    for (const c of open.filter(c => c.author === p.id)) cards.push(`<a class="${c.status === 'draft' ? '' : 'wait'}" href="#/change/${c.id}"><b>${c.status === 'draft' ? 'Your draft' : 'Your change'} #${c.id}</b><span class="cite">“${esc(c.title)}” · ${STATUS[c.status][0].toLowerCase()}${c.status === 'review' ? `, ${c.approvals.length} of 2 approvals` : ''}</span></a>`)
    for (const r of S.data.requests.filter(r => r.status === 'open' && r.by === p.id)) cards.push(`<a class="wait" href="#/requests"><b>Request #${r.id} with engineering</b><span class="cite">${esc(r.question)}</span></a>`)
  }
  const lines = [...S.model.facts.values()].filter(f => f.line && f.kind !== 'options').sort((a, b) => a.line.sort - b.line.sort)
  return `
    <div class="toolbar">
      <div><h1>Form 760: resident return</h1>
      <p class="sub" style="margin:0">${lines.length} lines · ${[...S.model.facts.values()].filter(f => f.kind === 'value').length} values · ${S.data.examplesFile.examples.length} worked examples</p></div>
      <div class="acts"><input type="search" id="line-search" placeholder="Search rules, lines or § …" aria-label="Search" value="${esc(S.search || '')}" style="width:280px">${canEdit() ? '<button class="btn" data-act="new-change">+ Start a change from the law</button>' : ''}</div>
    </div>
    ${cards.length ? `<div class="attn">${cards.join('')}</div>` : ''}
    <div class="lines" id="line-list">${lines.map(f => {
      const c = lineStatus(f.path)
      const tree = f.kind === 'rule' ? derivedTree(f) : null
      const cases = tree?.tag === 'Switch' ? elementKids(tree).length : 0
      const asked = f.deps.filter(d => S.model.facts.get(d)?.kind === 'asked').length
      const kind = f.kind === 'asked' ? 'Asked of the filer' : f.kind === 'value' ? `Value: ${literalLabel(f.literal.tag, f.literal.value)}${f.schedule?.steps.length ? ' (by year)' : ''}` : [cases ? `Rule with ${cases} cases` : shape(tree), asked ? `${asked} question${asked > 1 ? 's' : ''} asked` : ''].filter(Boolean).join(' · ')
      return `<a class="line ${c ? 'busy' : ''}" href="#/rule/${encodeURIComponent(f.path)}" data-search="${esc((f.name + ' ' + f.citation + ' ' + f.path + ' line ' + f.line.label).toLowerCase())}">
        <span class="no">Line ${esc(f.line.label)}</span>
        <div><div class="t">${esc(shortName(f.name))}</div><div class="kind">${esc(kind)}</div></div>
        <span class="cite">${cite(f.citation)}</span>
        ${c ? `<span class="pill ${STATUS[c.status][1]}">${STATUS[c.status][0]} · #${c.id}</span>` : '<span class="pill ok">Published</span>'}
      </a>`
    }).join('')}</div>`
}

/** What kind of rule a line is, in a few words, for the home page. */
function shape (tree) {
  if (!tree) return 'Rule'
  const n = elementKids(tree).length
  switch (tree.tag) {
    case 'Dependency': return `Same as: ${describePath(S.model, tree.attrs.path).label}`
    case 'Add': return `Adds up ${n} amounts`
    case 'Subtract': return 'One amount minus others'
    case 'Multiply': return 'An amount times a rate'
    case 'GreaterOf': case 'LesserOf': return 'An amount with a limit'
    case 'Round': return 'Rounded to the dollar'
    case 'CollectionSum': return 'A total across forms'
    case 'Count': return 'A count'
    default: return humanize(tree.tag)
  }
}

// ---------------------------------------------------------------------------------------------
// 2. Values

function viewValues () {
  const c = activeChange()
  const values = [...S.model.facts.values()].filter(f => f.kind === 'value')
  let section = null
  const rows = values.map(f => {
    const e = c?.edits.find(x => x.type === 'value' && x.path === f.path)
    const head = f.section !== section ? `<tr class="group"><td colspan="5">${esc(f.section || 'Values')}</td></tr>` : ''
    section = f.section
    const lines = feedsLines(S.model, f.path)
    return `${head}<tr class="${e ? 'changed' : ''}">
      <td><b>${esc(f.name)}</b>${f.taxYear ? ` <span class="pill">TY ${f.taxYear}</span>` : ''}<br><span class="cite">${cite(f.description.slice(0, 160))}${f.description.length > 160 ? '…' : ''}</span></td>
      <td class="num">${esc(literalLabel(f.literal.tag, f.literal.value))}<br><span class="cite">${esc(f.literal.tag === 'Rational' ? f.literal.value : '')}</span></td>
      <td class="num"><input class="val ${e ? 'edited' : ''}" data-act="value" data-path="${esc(f.path)}" data-tag="${f.literal.tag}" value="${esc(e ? e.to : f.literal.value)}" aria-label="New value for ${esc(f.name)}" ${canEdit() ? '' : 'disabled'}>${e ? `<br><button class="btn quiet sm" data-act="value-undo" data-path="${esc(f.path)}">undo</button>` : ''}</td>
      <td class="cite">${cite(f.citation)}</td>
      <td class="cite">${lines.length ? 'Line ' + lines.join(', ') : '—'}</td>
    </tr>`
  }).join('')
  return `
    <div class="split">
      <div>
        <h1>Values</h1>
        <p class="sub">The dollar amounts, rates and limits the rules use. Change one here and every rule that uses it changes with it. ${canEdit() ? 'Typing in the right-hand column puts the change in your draft.' : 'You are reviewing, so these are read-only.'}</p>
        <table class="grid"><thead><tr><th>Value</th><th class="num">Now</th><th class="num">Proposed</th><th>Law</th><th>Used by</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="cite">Rates are stored as fractions (575/10000 is 5.75%). Type a fraction or a decimal.</p>
      </div>
      <div class="stack">
        ${c ? sourcePanel(c) : `<div class="panel"><div class="panel-h">No draft open</div><div class="panel-b">Edit any value to start a change. It goes nowhere until it is reviewed and published.</div></div>`}
        <div class="panel" id="impact-panel">${impactPanelBody()}</div>
      </div>
    </div>`
}

function sourcePanel (c) {
  const needs = c.edits.some(e => e.type === 'value')
  return `<div class="panel"><div class="panel-h">Source for this change ${needs && !c.source?.citation ? '<span class="pill warn">Required</span>' : ''}</div><div class="panel-b">
    <div class="field-row"><label for="src-cite" style="font-size:13px">Where do the new values come from?</label><input type="text" id="src-cite" data-act="source" data-key="citation" value="${esc(c.source?.citation)}" style="width:100%" placeholder="e.g. 2025 Appropriation Act, Item 3-5.xx"></div>
    <div class="field-row" style="margin:0"><label for="src-eff" style="font-size:13px">Effective for</label><input type="text" id="src-eff" data-act="source" data-key="effective" value="${esc(c.source?.effective)}" style="width:100%" placeholder="e.g. taxable years beginning on or after 1 Jan 2025"></div>
  </div></div>`
}

S.hooks.impactPanelBody = () => impactPanelBody()
function impactPanelBody () {
  const I = S.impact
  const c = activeChange()
  if (!c) return `<div class="panel-h">Worked examples</div><div class="panel-b">${I?.base ? baseSummary(I.base) : '<span class="spin"></span> Running…'}</div>`
  if (!I || I.change !== c || I.pending || !I.draft) return '<div class="panel-h">Effect on worked examples <span class="pill blue">Live</span></div><div class="panel-b"><span class="spin"></span> Recalculating with your draft…</div>'
  if (I.conflict) return `<div class="panel-h">Effect on worked examples</div><div class="panel-b err">${esc(I.conflict)}</div>`
  if (I.draft.error) {
    const req = (c.requestIds || []).map(id => S.data.requests.find(r => r.id === id)).filter(r => r && r.status === 'open')
    // A requested question is not in the files yet, so the sandbox reports it as unknown. Say why
    // in the author's terms, and keep the raw error only for anything else.
    const pendingPaths = new Set(req.map(r => r.factPath))
    const onlyPending = I.draft.missing?.length && I.draft.missing.every(p => pendingPaths.has(p))
    return `<div class="panel-h">Effect on worked examples</div><div class="panel-b">${req.length ? `<p>The examples can run once engineering builds <a href="#/requests">request #${req.map(r => r.id).join(', #')}</a>. Your draft uses it, and it isn't in the rules yet.</p>` : ''}${onlyPending ? '' : `<p class="err">${esc(I.draft.error)}</p>`}</div>`
  }
  const diffs = differences(I.base, I.draft, I.examples)
  const failing = I.examples.filter(x => !I.draft.results[x.id]?.pass)
  return `<div class="panel-h">Effect on worked examples <span class="pill blue">Live</span></div><div class="panel-b">
    <div class="big">${diffs.length} of ${I.examples.length}</div>
    <div class="cite" style="margin-bottom:8px">examples get a different result from your draft</div>
    ${diffs.slice(0, 8).map(d => `<div class="impact"><span>${esc(d.ex.title)}</span><span class="n">${d.lines.length} line${d.lines.length === 1 ? '' : 's'}</span><span class="d">${d.lines.slice(0, 3).map(p => `${esc(lineName(p))}: ${esc(formatResult(d.before[p]))} → ${esc(formatResult(d.after[p]))}`).join('<br>')}</span></div>`).join('')}
    <p style="margin:10px 0 0">${failing.length ? `<span class="res-bad">${failing.length} example${failing.length === 1 ? '' : 's'} no longer match${failing.length === 1 ? 'es' : ''} what the law says.</span> <a href="#/examples">Confirm or fix →</a>` : '<span class="res-ok">Every example still matches what the law says.</span>'}</p>
  </div>`
}

function baseSummary (base) {
  if (base.error) return `<span class="err">${esc(base.error)}</span>`
  const ex = S.data.examplesFile.examples
  const pass = ex.filter(x => base.results[x.id]?.pass).length
  return `<div class="big">${pass} of ${ex.length}</div><div class="cite">examples match the published rules</div>`
}

function paintImpact () {
  const p = $('#impact-panel')
  if (p) p.innerHTML = impactPanelBody()
  const t = $('#examples-table')
  if (t) t.outerHTML = examplesTable()
  const chk = $('#rule-checks')
  if (chk) chk.innerHTML = ruleChecksBody()
}

// ---------------------------------------------------------------------------------------------
// 3. Rule editor

function ruleState (fact) {
  if (!S.rule[fact.path]) {
    const c = activeChange()
    const e = c?.edits.find(x => x.type === 'rule' && x.path === fact.path)
    let tree = derivedTree(fact)
    if (e) { try { tree = derivedTree(e.derived) } catch { /* keep published */ } }
    S.rule[fact.path] = { tree, because: e?.because || '', tab: 'plain', xmlText: null, xmlError: null }
  }
  return S.rule[fact.path]
}

function viewRule (path) {
  const f = S.model.facts.get(path)
  if (!f) return `<p>No fact ${esc(path)}. <a href="#/">Back to Form 760</a></p>`
  if (f.kind === 'value') { location.hash = '#/values'; return '' }
  const c = activeChange()
  const st = f.kind === 'rule' ? ruleState(f) : null
  const editable = canEdit() && f.kind === 'rule'
  const other = lineStatus(f.path)
  const edited = c?.edits.some(e => e.path === f.path)
  let body
  if (f.kind === 'asked') {
    body = `<p>This is a question the filer answers${f.writable.type ? ` (${esc(humanize(f.writable.type))})` : ''}. Its wording is on <a href="#/screens">its screen</a>; a new question is added with the <a href="#/question/new">question builder</a>, and anything the return cannot model yet is a request to engineering.</p><button class="btn sec sm" data-act="new-request">Ask engineering →</button>`
  } else if (f.kind === 'options') {
    body = '<p>A fixed list of choices. Engineering maintains these.</p>'
  } else if (st.tab === 'xml') {
    const text = st.xmlText ?? stripMarks(derivedXml(st.tree))
    body = `<p class="cite">The same rule as code. ${editable ? 'Edit it here and apply; the plain-language view updates from it.' : ''}</p>
      <textarea class="code" id="xml-text" ${editable ? '' : 'readonly'} spellcheck="false" aria-label="Rule XML">${esc(text)}</textarea>
      ${st.xmlError ? `<p class="err">${esc(st.xmlError)}</p>` : ''}
      ${editable ? '<div class="add-row"><button class="btn sm" data-act="xml-apply">Apply XML</button><button class="btn quiet sm" data-act="xml-reset">Reset to the plain view</button></div>' : ''}`
  } else if (st.tab === 'used') {
    const users = (S.model.usedBy.get(f.path) || []).map(p => S.model.facts.get(p)).filter(Boolean)
    body = `<p>Feeds Form 760 ${feedsLines(S.model, f.path, 20).map(l => 'Line ' + l).join(', ') || '(no line directly)'}.</p>
      <p><b>Used directly by</b></p><div class="expr" style="display:grid;gap:6px">${users.map(u => chip(u.path)).join('') || '<span class="muted">Nothing</span>'}</div>`
  } else {
    body = `${renderRoot(st.tree, editable)}
      <div class="legend"><span><span class="ty asked">Asked</span> the filer answers it</span><span><span class="ty federal">Federal</span> from the federal return</span><span><span class="ty calc">Calc</span> another rule</span><span><span class="ty value">Value</span> from the values table</span><span><span class="ty req">Requested</span> engineering is adding it</span></div>`
  }
  return `
    <div class="crumb"><a href="#/">Form 760</a> › ${f.line ? `Line ${esc(f.line.label)}` : esc(f.name)}</div>
    ${other && other !== c ? `<p class="pill warn" style="display:inline-block;margin-bottom:10px">Change #${other.id} (${STATUS[other.status][0].toLowerCase()}) already edits this rule. <a href="#/change/${other.id}">Open it</a></p>` : ''}
    <div class="split">
      <div class="stack">
        <div class="card">
          <div class="card-h">
            <div><h2>${esc(f.name)}</h2>
              <div class="cite">${cite(f.description)}</div>
              <div class="cite" style="margin-top:2px"><code>${esc(f.path)}</code> in <code title="${esc(S.data.paths[f.file])}">${esc(S.data.paths[f.file].split('/').pop())}</code></div>
            </div>
            ${f.kind === 'rule' ? `<div class="tabs" role="tablist">${[['plain', 'Plain language'], ['xml', 'XML'], ['used', 'Used by']].map(([k, l]) => `<button role="tab" aria-selected="${st.tab === k}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}</div>` : ''}
          </div>
          <div class="card-b">${body}</div>
        </div>
        ${f.kind === 'rule' && editable && edited ? `<div class="panel"><div class="panel-h">Why this change <span class="req-mark">required</span></div><div class="panel-b"><input type="text" id="because" data-act="because" value="${esc(st.because)}" style="width:100%" placeholder="Say what the law requires, and cite it. The reviewer reads this first."></div></div>` : ''}
      </div>
      <div class="stack">
        ${f.kind === 'rule' ? `<div class="panel"><div class="panel-h">Checks</div><div class="panel-b" id="rule-checks">${ruleChecksBody()}</div></div>` : ''}
        <div class="panel" id="impact-panel">${impactPanelBody()}</div>
        ${editable ? `<div class="panel"><div class="panel-h">Need something the return doesn't know?</div><div class="panel-b"><p style="margin:0 0 8px">If the rule turns on something only the filer can say, add the question: the tool writes the fact, the screen and the words, and it is in the picker at once. If the return cannot model it at all, ask engineering.</p><div class="add-row"><a class="btn sm" href="#/question/new">+ Add a question</a><button class="btn sec sm" data-act="new-request">Ask engineering →</button></div></div></div>` : ''}
      </div>
    </div>`
}

function currentRuleFact () { return S.route[0] === 'rule' ? S.model.facts.get(decodeURIComponent(S.route[1])) : null }

/** What a path refers to, in the published rules or, failing that, in the active draft (a new question). */
export function describeAny (p) {
  const d = describePath(S.model, p)
  return d.kind === 'missing' && S.draftModel?.facts.has(p) ? { ...describePath(S.draftModel, p), draft: true } : d
}

function ruleChecksBody () {
  const f = currentRuleFact()
  if (!f || f.kind !== 'rule') return ''
  const st = ruleState(f)
  const all = []
  walk(st.tree, n => { if (n.tag === 'Dependency') all.push(n.attrs.path || '') })
  const blanks = all.filter(p => !p).length
  const unknown = all.filter(p => p && describeAny(p).kind === 'missing')
  const requested = unknown.filter(p => S.data.requests.some(r => r.factPath === p && r.status === 'open'))
  const bad = unknown.filter(p => !requested.includes(p))
  const self = reaches(all.filter(Boolean), f.path)
  const I = S.impact
  const c = activeChange()
  const edited = c?.edits.some(e => e.path === f.path)
  const li = (cls, sym, text) => `<li><span class="dot ${cls}">${sym}</span><span>${text}</span></li>`
  const rows = [
    blanks ? li('bad', '!', `${blanks} blank${blanks > 1 ? 's' : ''} to fill (“choose…”).`) : li('ok', '✓', 'Every blank is filled'),
    bad.length ? li('bad', '!', `Uses something that does not exist: ${bad.map(esc).join(', ')}`) : null,
    requested.length ? li('req', '#', `Uses something engineering is still building. You can save, but not send for review yet.`) : null,
    self ? li('bad', '!', 'This rule would depend on itself.') : li('ok', '✓', 'No rule depends on itself'),
    edited && !st.because.trim() ? li('bad', '!', 'Say why (below the rule).') : null,
  ].filter(Boolean)
  let ex = li('wait', '…', 'Worked examples: running')
  if (I?.draft && I.change === c && !I.draft.error) {
    const n = I.examples.length
    const pass = I.examples.filter(x => I.draft.results[x.id]?.pass).length
    ex = pass === n ? li('ok', '✓', `Worked examples: all ${n} pass`) : li('bad', '!', `Worked examples: ${pass} of ${n} pass. <a href="#/examples">See which</a>`)
  } else if (I?.draft?.error && requested.length) ex = li('req', '#', 'Worked examples run once the request is built.')
  else if (I?.draft?.error) ex = li('bad', '!', 'The rules do not load with this draft (see below).')
  else if (!c && I?.base) ex = li('ok', '✓', 'Worked examples: run on the published rules')
  return `<ul class="checks">${rows.join('')}${ex}</ul>`
}

function walk (n, fn) { if (!n) return; fn(n); for (const c of n.children || []) walk(c, fn) }

function reaches (starts, target) {
  const seen = new Set()
  const stack = [...starts]
  while (stack.length) {
    const p = stack.pop()
    if (p === target) return true
    if (seen.has(p)) continue
    seen.add(p)
    stack.push(...((S.model.facts.get(p) || S.draftModel?.facts.get(p))?.deps || []))
  }
  return false
}

// --- plain-language rendering of the tree ---

const CMP = { GreaterThan: 'is more than', GreaterThanOrEqual: 'is at least', LessThan: 'is less than', LessThanOrEqual: 'is at most', Equal: 'is', NotEqual: 'is not' }
const JOIN = { Add: 'plus', Multiply: 'times', All: 'and', Any: 'or' }

function renderRoot (tree, editable) {
  const ctx = { editable }
  if (tree.tag === 'Switch') return renderSwitch(tree, '', ctx)
  return `<div class="clause"><span class="kw">Equals</span><div class="body">${renderExpr(tree, '', ctx)}</div><span></span></div>${editable ? limitButtons('') : ''}`
}

const at = (base, i) => (base === '' ? String(i) : `${base}.${i}`)

function renderSwitch (sw, path, ctx) {
  const items = []
  let because = null
  sw.children.forEach((c, i) => {
    if (c.tag === '#comment') { because = { text: c.text, i }; return }
    if (c.tag !== 'Case') return
    items.push({ node: c, i, because })
    because = null
  })
  const last = items.length - 1
  const out = items.map((it, k) => {
    const [when, then] = elementKids(it.node)
    const whenExpr = elementKids(when)[0]
    const always = whenExpr?.tag === 'True'
    const kw = always ? (k === 0 ? 'Always' : 'Otherwise') : k === 0 ? 'If' : 'Else if'
    const isNew = it.node.attrs['data-new'] !== undefined
    const tools = ctx.editable ? `<span class="tools">${k > 0 && !always ? `<button class="x" title="Check earlier" aria-label="Move up" data-act="case-up" data-at="${at(path, it.i)}">↑</button>` : ''}${k < last && !(items[k + 1] && elementKids(elementKids(items[k + 1].node)[0])[0]?.tag === 'True') ? `<button class="x" title="Check later" aria-label="Move down" data-act="case-down" data-at="${at(path, it.i)}">↓</button>` : ''}${items.length > 1 && !always ? `<button class="x" title="Remove this case" aria-label="Remove case" data-act="case-rm" data-at="${at(path, it.i)}">✕</button>` : ''}</span>` : '<span></span>'
    const whenPath = at(at(path, it.i), it.node.children.indexOf(when))
    const thenPath = at(at(path, it.i), it.node.children.indexOf(then))
    const thenExpr = elementKids(then)[0]
    const thenAt = at(thenPath, then.children.indexOf(thenExpr))
    const note = it.because ? it.because.text.replace(/^Because:\s*/i, '') : ''
    return `<div class="clause ${isNew ? 'new' : ''}">
      <span class="kw">${kw}</span>
      <div class="body">${always ? '<span class="muted">(every other case)</span>' : renderCondition(whenExpr, at(whenPath, when.children.indexOf(whenExpr)), ctx)}</div>
      ${tools}
      <span class="kw" style="padding-top:2px">Then</span>
      <div class="body">→ ${renderExpr(thenExpr, thenAt, ctx)}</div>
      <span>${ctx.editable ? limitButtons(thenAt, true) : ''}</span>
      ${ctx.editable && (isNew || it.because) ? `<span class="kw" style="padding-top:2px">Because</span><div class="because"><input type="text" data-act="case-because" data-at="${at(path, it.i)}" value="${esc(note)}" placeholder="Why this case exists, with the law (becomes a comment in the code)"></div>` : note ? `<span class="kw" style="padding-top:2px">Because</span><div class="body muted">${esc(note)}</div><span></span>` : ''}
    </div>`
  })
  return out.join('') + (ctx.editable ? `<div class="add-row"><button class="btn sec sm" data-act="add-case" data-at="${path}">+ Add an exception (checked first)</button></div>` : '')
}

function limitButtons (p, small) {
  return `<span class="add-row" style="margin:0"><button class="btn quiet sm" data-act="limit" data-kind="GreaterOf" data-at="${p}" title="Wrap in: no less than">+ no less than</button><button class="btn quiet sm" data-act="limit" data-kind="LesserOf" data-at="${p}" title="Wrap in: no more than">+ no more than</button></span>`
}

function renderCondition (n, p, ctx) {
  if (!n) return '<span class="muted">—</span>'
  if (CMP[n.tag]) {
    const [l, r] = elementKids(n)
    const li = n.children.indexOf(l)
    const ri = n.children.indexOf(r)
    const L = elementKids(l)[0]
    const R = elementKids(r)[0]
    return `${renderExpr(L, at(at(p, li), l.children.indexOf(L)), ctx)} ${opSelect(n.tag, p, ctx)} ${renderExpr(R, at(at(p, ri), r.children.indexOf(R)), ctx)}`
  }
  if (n.tag === 'Dependency' || n.tag === 'True' || n.tag === 'False') {
    return `${renderExpr(n, p, ctx)} ${opSelect('IsYes', p, ctx)}`
  }
  return renderExpr(n, p, ctx)
}

function opSelect (tag, p, ctx) {
  const label = tag === 'IsYes' ? 'is yes' : CMP[tag]
  if (!ctx.editable) return `<span class="op">${label}</span>`
  const opts = [['IsYes', 'is yes'], ...Object.entries(CMP)]
  return `<select class="op-select" data-act="cmp" data-at="${p}" aria-label="Comparison">${opts.map(([k, l]) => `<option value="${k}" ${k === tag ? 'selected' : ''}>${l}</option>`).join('')}</select>`
}

function renderExpr (n, p, ctx) {
  if (!n) return '<span class="muted">—</span>'
  const kids = elementKids(n)
  const idx = c => at(p, n.children.indexOf(c))
  switch (n.tag) {
    case 'Dependency':
      return chip(n.attrs.path, { at: p, editable: ctx.editable })
    case 'Dollar': case 'Int': case 'Rational': case 'Decimal':
      return ctx.editable ? `<button class="chip num" data-act="pick" data-at="${p}"><span class="ty value">Amount</span> ${esc(literalLabel(n.tag, n.text))} <span class="caret">▾</span></button>` : `<span class="chip num">${esc(literalLabel(n.tag, n.text))}</span>`
    case 'True': return '<span class="op">yes</span>'
    case 'False': return '<span class="op">no</span>'
    case 'Enum': return `<span class="chip">“${esc(humanize(n.text))}”</span>`
    case 'String': return `<span class="chip">“${esc(n.text)}”</span>`
    case 'Day': return `<span class="chip">${esc(n.text)}</span>`
    case 'Switch': return `<div class="expr group" style="flex-basis:100%">${renderSwitch(n, p, ctx)}</div>`
    case 'Not': return `<span class="op">not</span> ${renderCondition(kids[0], idx(kids[0]), ctx)}`
    case 'Round': return `${renderExpr(kids[0], idx(kids[0]), ctx)} <span class="op">rounded to the dollar</span>`
    case 'Count': return `<span class="op">the number of</span> ${renderExpr(kids[0], idx(kids[0]), ctx)}`
    case 'CollectionSum': return `<span class="op">the total of every</span> ${renderExpr(kids[0], idx(kids[0]), ctx)}`
    case 'GreaterOf': case 'LesserOf': {
      const word = n.tag === 'GreaterOf' ? 'no less than' : 'no more than'
      if (kids.length === 2 && /^(Dollar|Int|Rational|Decimal)$/.test(kids[1].tag)) {
        return `<span class="expr">${renderExpr(kids[0], idx(kids[0]), ctx)} <span class="op">but ${word}</span> ${renderExpr(kids[1], idx(kids[1]), ctx)}${ctx.editable ? `<button class="x" title="Remove the limit" aria-label="Remove limit" data-act="unlimit" data-at="${p}">✕</button>` : ''}</span>`
      }
      return `<span class="op">the ${n.tag === 'GreaterOf' ? 'larger' : 'smaller'} of</span> ${operands(n, p, ctx, 'and')}`
    }
    case 'Add': case 'Multiply': case 'All': case 'Any':
      return operands(n, p, ctx, JOIN[n.tag], n.tag === 'All' ? 'all of:' : n.tag === 'Any' ? 'any of:' : '')
    case 'Subtract': {
      const min = kids.find(k => k.tag === 'Minuend')
      const subs = kids.find(k => k.tag === 'Subtrahends')
      const m0 = elementKids(min)[0]
      return `<span class="expr">${renderExpr(m0, at(idx(min), min.children.indexOf(m0)), ctx)} <span class="op">minus</span> ${operands(subs, idx(subs), ctx, 'minus')}</span>`
    }
    default: {
      if (CMP[n.tag]) return renderCondition(n, p, ctx)
      // An operator the plain view has no sentence for: show it, and its parts, read-only. Editing a
      // chip inside it would write a tree the plain view cannot check, so that goes through the XML tab.
      const ro = { ...ctx, editable: false }
      return `<span class="expr group"><span class="raw" title="${esc(n.tag)}: not editable in plain language">${esc(n.tag)}</span> ${kids.map(k => renderExpr(k, idx(k), ro)).join(' ')}${ctx.editable ? ' <button class="btn quiet sm" data-act="tab" data-tab="xml" title="This operator has no plain-language form">edit in XML</button>' : ''}</span>`
    }
  }
}

function operands (n, p, ctx, word, lead = '') {
  const kids = elementKids(n)
  const parts = kids.map(k => {
    const kp = at(p, n.children.indexOf(k))
    const rm = ctx.editable && kids.length > 1 ? `<button class="x" title="Remove" aria-label="Remove" data-act="rm" data-at="${kp}">✕</button>` : ''
    const inner = ['Add', 'Subtract', 'Multiply', 'All', 'Any', 'Switch', 'GreaterOf', 'LesserOf'].includes(k.tag) ? `<span class="expr group">${renderExpr(k, kp, ctx)}</span>` : (CMP[k.tag] || k.tag === 'Not') ? renderCondition(k, kp, ctx) : renderExpr(k, kp, ctx)
    return `${inner}${rm}`
  })
  const add = ctx.editable && ['Add', 'Subtrahends', 'All', 'Any'].includes(n.tag) ? ` <button class="btn quiet sm" data-act="add-operand" data-at="${p}">+ ${word === 'and' || word === 'or' ? 'condition' : word}</button>` : ''
  return `<span class="expr">${lead ? `<span class="op">${lead}</span> ` : ''}${parts.join(` <span class="op">${word}</span> `)}${add}</span>`
}

// --- what kind of thing an operand is, so a new comparison gets a literal of the right type ---

const NUMERIC = { Dollar: 'dollar', Int: 'int', Rational: 'rational', Decimal: 'decimal', Day: 'day', Enum: 'enum', String: 'string', True: 'boolean', False: 'boolean' }
const BOOL_OPS = new Set(['All', 'Any', 'Not', 'Equal', 'NotEqual', 'LessThan', 'LessThanOrEqual', 'GreaterThan', 'GreaterThanOrEqual', 'IsComplete'])
const DOLLAR_OPS = new Set(['Add', 'Subtract', 'Multiply', 'GreaterOf', 'LesserOf', 'Round', 'CollectionSum', 'TrimDollar'])

/** 'dollar' | 'int' | 'rational' | 'day' | 'enum' | 'boolean' | 'string' | null for an expression. */
function operandType (n, depth = 0) {
  if (!n || depth > 8) return null
  if (NUMERIC[n.tag]) return NUMERIC[n.tag]
  if (BOOL_OPS.has(n.tag)) return 'boolean'
  if (DOLLAR_OPS.has(n.tag)) return 'dollar'
  if (n.tag === 'Count') return 'int'
  if (n.tag === 'Switch') { const kase = elementKids(n)[0]; const then = kase && elementKids(kase)[1]; return operandType(then && elementKids(then)[0], depth + 1) }
  if (n.tag === 'Dependency') return pathType(n.attrs.path, depth + 1)
  return null
}

function pathType (path, depth = 0) {
  const f = S.model.facts.get(path) || S.draftModel?.facts.get(path)
  if (f) {
    if (f.writable) return f.writable.type
    if (f.literal) return NUMERIC[f.literal.tag] || null
    if (f.kind === 'rule') { try { return operandType(derivedTree(f), depth + 1) } catch { return null } }
    return null
  }
  const fed = S.model.federalByPath.get(path)
  if (fed) return { count: 'int', dollarList: 'dollar' }[fed.type] || fed.type
  const req = S.data.requests.find(r => r.factPath === path && r.status === 'open')
  return req ? req.answerType : null
}

/** A literal to compare an expression with: zero of its own type, today for a date, the first option for a list. */
function defaultLiteral (n) {
  const type = operandType(n)
  if (type === 'int') return lit('Int', 0)
  if (type === 'rational') return lit('Rational', '0/1')
  if (type === 'day') return lit('Day', new Date().toISOString().slice(0, 10))
  if (type === 'boolean') return el('True')
  if (type === 'enum') {
    const f = n?.tag === 'Dependency' ? S.model.facts.get(n.attrs.path) : null
    const opts = f?.writable?.optionsPath ? S.model.facts.get(f.writable.optionsPath) : null
    const first = opts?.derivedText?.match(/<String>([^<]+)<\/String>/)?.[1]
    const fed = n?.tag === 'Dependency' ? S.model.federalByPath.get(n.attrs.path) : null
    return lit('Enum', first || fed?.options?.[0] || '')
  }
  if (type === 'string') return lit('String', '')
  return lit('Dollar', 0)
}

// --- tree edits ---

function nodeAt (tree, p) {
  if (p === '') return { node: tree, parent: null, index: -1 }
  const idx = p.split('.').map(Number)
  let parent = null
  let node = tree
  for (const i of idx) { parent = node; node = node.children[i] }
  return { node, parent, index: idx[idx.length - 1] }
}

function replaceAt (st, p, fn) {
  if (p === '') { st.tree = fn(st.tree); return }
  const { parent, index } = nodeAt(st.tree, p)
  parent.children[index] = fn(parent.children[index])
}

async function treeChanged (fact) {
  const st = ruleState(fact)
  st.xmlText = null
  const c = await ensureDraft()
  if (!c) { delete S.rule[fact.path]; render(); return }
  const derived = derivedXml(st.tree)
  const same = stripMarks(derived).replace(/\s+/g, '') === derivedXml(derivedTree(fact)).replace(/\s+/g, '')
  c.edits = c.edits.filter(e => !(e.type === 'rule' && e.path === fact.path))
  if (!same) c.edits.push({ type: 'rule', file: fact.file, path: fact.path, before: fact.derivedText, derived: stripMarks(derived), because: st.because })
  // Requested facts the rule now uses.
  const used = []
  for (const e of c.edits.filter(x => x.type === 'rule')) for (const m of e.derived.matchAll(/path="([^"]+)"/g)) used.push(m[1])
  c.requestIds = S.data.requests.filter(r => r.status === 'open' && used.includes(r.factPath)).map(r => r.id)
  saveSoon(c)
  render()
}

const stripMarks = xml => xml.replace(/ data-new=""/g, '')

// ---------------------------------------------------------------------------------------------
// The picker: choose a fact or an amount for a blank.

function pickerDialog (current, { allowAmount = true } = {}) {
  return new Promise(resolve => {
    const d = $('#dialog')
    const facts = [...S.model.facts.values()].filter(f => f.kind !== 'options')
    const draftAsked = S.draftModel ? [...S.draftModel.facts.values()].filter(f => f.kind === 'asked' && !S.model.facts.has(f.path)) : []
    const groups = [
      ['Asked of the filer', [...draftAsked.map(f => ({ path: f.path, label: f.name, note: 'in your draft' })), ...facts.filter(f => f.kind === 'asked').map(f => ({ path: f.path, label: f.name, note: f.line ? 'Line ' + f.line.label : '' }))]],
      ['Values', facts.filter(f => f.kind === 'value').map(f => ({ path: f.path, label: f.name, note: literalLabel(f.literal.tag, f.literal.value) }))],
      ['Other rules and lines', facts.filter(f => f.kind === 'rule').map(f => ({ path: f.path, label: f.name, note: f.line ? 'Line ' + f.line.label : '' }))],
      ['From the federal return', S.data.federal.inputs.map(i => ({ path: i.path, label: i.label, note: i.source, module: i.module }))],
      ['Requested from engineering', S.data.requests.filter(r => r.status === 'open' && r.factPath).map(r => ({ path: r.factPath, label: r.question, note: `Request #${r.id}`, request: r.id }))],
    ]
    const lit0 = current && /^(Dollar|Int|Rational|Decimal)$/.test(current.tag) ? current : null
    d.innerHTML = `<div class="dh">Choose what goes here <button class="x" data-close aria-label="Close">✕</button></div>
      <div class="db">
        ${allowAmount ? `<div class="field-row"><label for="pick-amount">A fixed amount</label><div style="display:flex;gap:8px"><select id="pick-tag" aria-label="Kind of amount">${['Dollar', 'Int', 'Rational'].map(t => `<option ${lit0?.tag === t ? 'selected' : ''} value="${t}">${{ Dollar: 'Dollars', Int: 'Whole number', Rational: 'Rate (fraction)' }[t]}</option>`).join('')}</select><input type="text" id="pick-amount" value="${esc(lit0?.text ?? '')}" placeholder="e.g. 600 or 575/10000"><button class="btn sm" id="pick-use-amount">Use amount</button></div></div>` : ''}
        <label for="pick-q" style="font-weight:700">Or something the return knows</label>
        <input type="search" id="pick-q" placeholder="Search by name…" style="width:100%;margin-top:4px" autocomplete="off">
        <div id="pick-list"></div>
      </div>
      <div class="df"><a class="btn quiet" href="#/question/new" data-builder>Not here? Add a question →</a><button class="btn quiet" data-request>Ask engineering →</button></div>`
    const list = d.querySelector('#pick-list')
    const draw = q => {
      q = q.toLowerCase()
      list.innerHTML = groups.map(([g, items]) => {
        const hits = items.filter(i => !q || (i.label + ' ' + i.path).toLowerCase().includes(q)).slice(0, q ? 30 : 8)
        return hits.length ? `<div class="picker-group">${g}</div><div class="picker-list">${hits.map(i => `<button data-path="${esc(i.path)}" data-module="${esc(i.module || '')}" data-request="${i.request || ''}"><span>${esc(i.label)}</span><small>${esc(i.note || '')}</small></button>`).join('')}</div>` : ''
      }).join('') || '<p class="muted">Nothing matches. If the return needs to know this, ask engineering.</p>'
    }
    draw('')
    const done = v => { d.close(); resolve(v) }
    d.onclick = e => {
      if (e.target.closest('[data-builder]')) { done(null); return }
      const b = e.target.closest('button')
      if (!b) return
      if (b.hasAttribute('data-close')) done(null)
      else if (b.id === 'pick-use-amount') {
        const v = d.querySelector('#pick-amount').value.trim()
        const tag = d.querySelector('#pick-tag').value
        if (!validAmount(tag, v)) { toast(tag === 'Rational' ? 'Write a rate as a fraction like 575/10000, or a decimal like 0.0575.' : 'Write a number.', true); return }
        done({ amount: normalizeAmount(tag, v), tag })
      } else if (b.hasAttribute('data-request') && !b.dataset.path) done({ request: true })
      else if (b.dataset.path) done({ path: b.dataset.path, module: b.dataset.module, request: b.dataset.request ? Number(b.dataset.request) : null })
    }
    d.querySelector('#pick-q').oninput = e => draw(e.target.value)
    d.onclose = () => resolve(null)
    d.showModal()
    d.querySelector(lit0 ? '#pick-amount' : '#pick-q')?.focus()
  })
}

function validAmount (tag, v) {
  if (tag === 'Rational') return /^\d+\/\d+$/.test(v) || /^\d*\.?\d+$/.test(v)
  return /^-?\d+(\.\d+)?$/.test(v.replace(/[$,]/g, ''))
}
function normalizeAmount (tag, v) {
  v = v.replace(/[$,\s]/g, '')
  if (tag === 'Rational' && !v.includes('/')) {
    const dec = (v.split('.')[1] || '').length
    const den = 10 ** dec
    return `${Math.round(Number(v) * den)}/${den}`
  }
  if (tag === 'Int') return String(Math.round(Number(v)))
  return v
}

export function askText (title, label, value, { multiline } = {}) {
  return new Promise(resolve => {
    const d = $('#dialog')
    d.innerHTML = `<form method="dialog"><div class="dh">${esc(title)}</div><div class="db"><label for="ask" style="font-weight:700">${esc(label)}</label>${multiline ? `<textarea id="ask">${esc(value)}</textarea>` : `<input type="text" id="ask" value="${esc(value)}" style="width:100%;margin-top:6px">`}</div><div class="df"><button class="btn sec" value="cancel" type="button" data-cancel>Cancel</button><button class="btn" value="ok">OK</button></div></form>`
    const input = d.querySelector('#ask')
    d.querySelector('[data-cancel]').onclick = () => { d.close(); resolve(null) }
    d.querySelector('form').onsubmit = e => { e.preventDefault(); d.close(); resolve(input.value.trim() || null) }
    d.onclose = () => resolve(null)
    d.showModal()
    input.focus()
  })
}

// ---------------------------------------------------------------------------------------------
// 4. Worked examples

function viewExamples () {
  const c = activeChange()
  return `
    <div class="toolbar">
      <div><h1>Worked examples</h1>
      <p class="sub" style="margin:0">A household, and what the law says some of its lines must be. Every change reruns all of them. ${c ? `Showing results with draft #${c.id}.` : 'Showing results with the published rules.'}</p></div>
      <div class="acts">
        <select data-act="filter" aria-label="Show">${[['all', 'All examples'], ['fail', 'Only ones that differ']].map(([k, l]) => `<option value="${k}" ${S.filter === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        ${canEdit() ? '<button class="btn" data-act="example-new">+ New example</button>' : ''}
      </div>
    </div>
    ${examplesTable()}`
}

function examplesTable () {
  const c = activeChange()
  const I = S.impact
  const examples = c ? applyExampleEdits(S.data.examplesFile.examples, c) : S.data.examplesFile.examples
  const res = c ? (I?.change === c && I.draft ? I.draft : null) : I?.base
  const base = I?.base
  if (res?.error) return `<div id="examples-table" class="panel"><div class="panel-b err">${esc(res.error)}</div></div>`
  const rows = examples.map(ex => {
    const r = res?.results?.[ex.id]
    if (S.filter === 'fail' && r?.pass) return ''
    const edited = c?.exampleEdits.some(e => e.example?.id === ex.id)
    const expects = Object.entries(ex.expect || {})
    const baseOk = base?.results?.[ex.id]?.pass
    const offer = c && r && !r.pass && !r.error && baseOk && canEdit()
    return `<tr class="${r && !r.pass ? 'changed' : ''}">
      <td><b>${esc(ex.title)}</b>${edited ? ' <span class="pill warn">edited in draft</span>' : ''}<br><span class="cite">${esc(ex.author || '')}${ex.created ? ' · ' + esc(ex.created) : ''}</span></td>
      <td>${esc(ex.household)}</td>
      <td style="min-width:260px"><table class="expects">${expects.map(([p, v]) => `<tr><td>${esc(lineName(p))}</td><td class="num" style="text-align:right">${esc(formatResult(v))}</td><td class="num" style="text-align:right">${resultCell(r, p, v)}</td></tr>`).join('')}</table></td>
      <td>${offer ? `<button class="btn sm" data-act="accept" data-id="${esc(ex.id)}" title="The law now says what the draft says">Expected: update</button><br>` : ''}${canEdit() ? `<button class="btn quiet sm" data-act="example-edit" data-id="${esc(ex.id)}">Edit</button>` : ''}</td>
    </tr>`
  }).join('')
  return `<table class="grid" id="examples-table"><thead><tr><th>Example</th><th>The household</th><th><span style="display:flex;justify-content:space-between"><span>Line</span><span>Law says · ${c ? 'draft gives' : 'rules give'}</span></span></th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted">Nothing to show.</td></tr>'}</tbody></table>`
}

async function acceptExample (id) {
  const c = activeChange()
  const I = S.impact
  const ex = applyExampleEdits(S.data.examplesFile.examples, c).find(x => x.id === id)
  const r = I.draft.results[id]
  const updated = { ...ex, expect: Object.fromEntries(Object.keys(ex.expect).map(p => [p, r.values[p]])) }
  c.exampleEdits = c.exampleEdits.filter(e => e.example?.id !== id)
  c.exampleEdits.push({ op: S.data.examplesFile.examples.some(x => x.id === id) ? 'update' : 'add', example: updated })
  saveSoon(c)
  toast(`“${ex.title}” now expects what the draft gives. The reviewer will see this.`)
  render()
}

function exampleDialog (ex) {
  const isNew = !ex
  ex = ex ? clone(ex) : { id: '', title: '', household: '', author: S.me, created: new Date().toISOString().slice(0, 10), inputs: {}, expect: {} }
  const base = S.data.examplesFile.baseline
  const dq = activeChange() ? draftFiles(activeChange()).files : published()
  const questions = [...writableFacts(dq.virginia), ...writableFacts(dq.localities)].filter(q => !/Correction|Zip|Everything|FromAddress/.test(q.path))
  const field = (path, type, label, options) => {
    const v = path in ex.inputs ? ex.inputs[path] : ''
    const ph = base[path] === undefined ? '' : Array.isArray(base[path]) ? base[path].join(', ') : String(base[path])
    const id = 'in-' + path.replace(/\W/g, '_')
    let ctl
    if (type === 'boolean') ctl = `<select id="${id}" data-in="${esc(path)}" data-type="boolean"><option value="">${ph ? `(${ph === 'true' ? 'yes' : 'no'})` : '—'}</option><option value="true" ${v === true ? 'selected' : ''}>yes</option><option value="false" ${v === false ? 'selected' : ''}>no</option></select>`
    else if (type === 'enum') ctl = `<select id="${id}" data-in="${esc(path)}" data-type="enum"><option value="">${ph ? `(${esc(humanize(ph))})` : '—'}</option>${(options || []).map(o => `<option value="${esc(o)}" ${v === o ? 'selected' : ''}>${esc(humanize(o))}</option>`).join('')}</select>`
    else ctl = `<input type="text" id="${id}" data-in="${esc(path)}" data-type="${type}" value="${esc(Array.isArray(v) ? v.join(', ') : v)}" placeholder="${esc(ph)}">`
    return `<label for="${id}">${esc(label)}</label>${ctl}`
  }
  const locOptions = (S.data.localities.match(/<Fact path="\/vaLocalityOptions">[\s\S]*?<\/Fact>/) || [''])[0].match(/<String>([^<]+)<\/String>/g)?.map(s => s.replace(/<\/?String>/g, '')) || []
  const lineFacts = [...S.model.facts.values()].filter(f => f.line && f.kind === 'rule').sort((a, b) => a.line.sort - b.line.sort)
  const d = $('#dialog')
  d.style.width = 'min(860px, 96vw)'
  d.innerHTML = `<div class="dh">${isNew ? 'New worked example' : 'Edit worked example'} <button class="x" data-close aria-label="Close">✕</button></div>
    <div class="db">
      <div class="field-row"><label for="ex-title">Name</label><input type="text" id="ex-title" value="${esc(ex.title)}" style="width:100%" placeholder="e.g. Big win plus small wins"></div>
      <div class="field-row"><label for="ex-house">The household, in a sentence</label><textarea id="ex-house" placeholder="Who they are and what happened">${esc(ex.household)}</textarea></div>
      <h3 style="font-size:15px;margin:14px 0 4px">What's different from the starting household</h3>
      <p class="hint">Leave a field empty to keep the starting answer (in brackets). Amounts in dollars; W-2 withholding as a list, like “1600, 400”.</p>
      <div class="kv">${S.data.federal.inputs.map(i => field(i.path, i.type === 'count' ? 'int' : i.type === 'dollarList' ? 'list' : i.type, `${i.label} (federal)`, i.options)).join('')}
      ${questions.map(q => field(q.path, q.type, q.name, q.path === '/vaLocality' ? locOptions : null)).join('')}</div>
      <h3 style="font-size:15px;margin:18px 0 4px">What the law says the lines must be</h3>
      <div id="ex-expect">${Object.entries(ex.expect).map(([p, v]) => expectRow(lineFacts, p, v)).join('')}</div>
      <div class="add-row"><button class="btn sec sm" data-add-expect>+ Add a line to check</button><button class="btn quiet sm" data-fill>Fill empty answers from the rules as they stand</button></div>
      <p class="hint" id="ex-msg"></p>
    </div>
    <div class="df">${!isNew ? '<button class="btn danger" data-remove>Remove example</button>' : ''}<button class="btn sec" data-close>Cancel</button><button class="btn" data-save>Put in my draft</button></div>`
  const collect = () => {
    const inputs = {}
    for (const elx of d.querySelectorAll('[data-in]')) {
      const v = elx.value.trim()
      if (v === '') continue
      const t = elx.dataset.type
      inputs[elx.dataset.in] = t === 'boolean' ? v === 'true' : t === 'list' ? v.split(/[,\s]+/).filter(Boolean).map(Number) : t === 'int' || t === 'dollar' ? Number(v.replace(/[$,]/g, '')) : v
    }
    const expect = {}
    for (const row of d.querySelectorAll('[data-expect-row]')) {
      const p = row.querySelector('select').value
      const v = row.querySelector('input').value.trim()
      if (p) expect[p] = v === '' ? '' : /^(true|false)$/.test(v) ? v === 'true' : /^-?[\d,.$]+$/.test(v) ? Number(v.replace(/[$,]/g, '')) : v
    }
    return { ...ex, title: d.querySelector('#ex-title').value.trim(), household: d.querySelector('#ex-house').value.trim(), inputs, expect }
  }
  d.onclick = async e => {
    const b = e.target.closest('button')
    if (!b) return
    if (b.hasAttribute('data-close')) { d.close(); return }
    if (b.hasAttribute('data-add-expect')) { d.querySelector('#ex-expect').insertAdjacentHTML('beforeend', expectRow(lineFacts, '', '')); return }
    if (b.hasAttribute('data-rm-expect')) { b.closest('[data-expect-row]').remove(); return }
    if (b.hasAttribute('data-fill')) {
      const x = collect()
      d.querySelector('#ex-msg').innerHTML = '<span class="spin"></span> Running…'
      const c = activeChange()
      const files = c ? draftFiles(c).files : published()
      const r = await run(files, [{ ...x, id: '__try', expect: Object.fromEntries(Object.keys(x.expect).map(p => [p, 0])) }])
      const res = r.results?.__try
      if (!res || r.error || res.error) { d.querySelector('#ex-msg').innerHTML = `<span class="err">${esc(r.error || res?.error || 'Could not run')}</span>`; return }
      for (const row of d.querySelectorAll('[data-expect-row]')) {
        const p = row.querySelector('select').value
        const inp = row.querySelector('input')
        if (p && inp.value.trim() === '') inp.value = res.values[p] ?? ''
      }
      d.querySelector('#ex-msg').textContent = 'Filled from the rules. Check each one against the law before you keep it: that is the point of an example.'
      return
    }
    if (b.hasAttribute('data-save') || b.hasAttribute('data-remove')) {
      const x = collect()
      if (b.hasAttribute('data-save')) {
        if (!x.title || !x.household) { toast('Give it a name and a sentence about the household.', true); return }
        if (!Object.keys(x.expect).length || Object.values(x.expect).some(v => v === '')) { toast('Say what at least one line must be, and fill every expected value.', true); return }
      }
      const c = await ensureDraft()
      if (!c) return
      if (isNew) x.id = slug(x.title, applyExampleEdits(S.data.examplesFile.examples, c))
      c.exampleEdits = c.exampleEdits.filter(e2 => (e2.example?.id || e2.id) !== x.id)
      const existed = S.data.examplesFile.examples.some(y => y.id === x.id)
      if (b.hasAttribute('data-remove')) { if (existed) c.exampleEdits.push({ op: 'remove', id: x.id }) } else c.exampleEdits.push({ op: existed ? 'update' : 'add', example: x })
      d.close()
      d.style.width = ''
      saveSoon(c)
      render()
    }
  }
  d.onclose = () => { d.style.width = '' }
  d.showModal()
}

function expectRow (lineFacts, path, value) {
  return `<div data-expect-row style="display:flex;gap:8px;margin-bottom:6px;align-items:center"><select aria-label="Line" style="flex:1"><option value="">Choose a line…</option>${lineFacts.map(f => `<option value="${esc(f.path)}" ${f.path === path ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select><input type="text" aria-label="Expected value" value="${esc(value === undefined ? '' : value)}" style="width:130px" placeholder="e.g. 1500"><button class="x" data-rm-expect aria-label="Remove">✕</button></div>`
}

function slug (title, existing) {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'example'
  let s = base
  let i = 2
  while (existing.some(x => x.id === s)) s = `${base}-${i++}`
  return s
}

// ---------------------------------------------------------------------------------------------
// 5. Changes and review

function viewChanges () {
  const rows = [...S.data.changes].reverse().map(c => `<tr>
    <td>#${c.id}</td><td><a href="#/change/${c.id}"><b>${esc(c.title)}</b></a><br><span class="cite">${c.edits.length} edits · ${c.exampleEdits.length} example edits</span></td>
    <td>${esc(personName(c.author))}</td><td>${statusPill(c)}</td>
    <td>${['policy', 'engineering', ...(c.edits.some(e => e.type === 'question' || e.type === 'text') ? ['translation'] : [])].map(k => c.approvals.some(a => a.kind === k) ? `<span class="pill ok">${k} ✓</span>` : `<span class="pill">${k}</span>`).join(' ')}</td>
    <td class="cite">${new Date(c.updated).toLocaleString()}</td></tr>`).join('')
  return `<div class="toolbar"><div><h1>Changes</h1><p class="sub" style="margin:0">Every change goes draft → checks → approvals (policy, engineering, and Spanish when words change) → published into the right season's build.</p></div>${canEdit() ? '<div class="acts"><button class="btn" data-act="new-change">+ Start a change from the law</button></div>' : ''}</div>
    ${rows ? `<table class="grid"><thead><tr><th>#</th><th>Change</th><th>Author</th><th>Status</th><th>Approvals</th><th>Updated</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty-state">No changes yet. Edit a value or a rule to start one.</div>'}`
}

function viewChange (id) {
  const c = S.data.changes.find(x => x.id === Number(id))
  if (!c) return '<p>No such change.</p>'
  const p = me()
  const mine = c.author === p.id
  const items = []
  for (const e of c.edits) {
    const f = S.model.facts.get(e.path)
    if (['schedule', 'question', 'text', 'remove-question'].includes(e.type)) { items.push(wideItem(c, e)); continue }
    if (e.type === 'value') items.push(`<div class="diff-item"><span class="sym">~</span><div><p><b>${esc(f?.name || e.path)}</b>: <span class="was">${esc(literalLabel(f?.literal?.tag || 'Dollar', e.from))}</span><b>${esc(literalLabel(f?.literal?.tag || 'Dollar', e.to))}</b></p><span class="cite">${c.source?.citation ? 'Source: ' + cite(c.source.citation) : '<span class="err">No source given yet</span>'}${c.source?.effective ? ' · ' + esc(c.source.effective) : ''}</span></div></div>`)
    else {
      let after = ''
      try { after = renderRoot(derivedTree(e.derived), false) } catch (x) { after = `<span class="err">${esc(x.message)}</span>` }
      items.push(`<div class="diff-item"><span class="sym">~</span><div><p><b>${esc(f?.name || e.path)}</b>: the rule changes. <a href="#/rule/${encodeURIComponent(e.path)}">Open</a></p><p class="cite">${e.because ? 'Because: ' + esc(e.because) : '<span class="err">No “because” yet</span>'}</p><details><summary class="cite">The rule after this change</summary><div style="margin-top:8px">${after}</div></details></div></div>`)
    }
  }
  for (const e of c.exampleEdits) {
    const ex = e.example || S.data.examplesFile.examples.find(x => x.id === e.id)
    const old = S.data.examplesFile.examples.find(x => x.id === (e.example?.id || e.id))
    const exp = ex ? Object.entries(ex.expect).map(([pp, v]) => `${esc(lineName(pp))} ${old && old.expect[pp] !== undefined && String(old.expect[pp]) !== String(v) ? `<span class="was">${esc(formatResult(old.expect[pp]))}</span>` : ''}<b>${esc(formatResult(v))}</b>`).join(' · ') : ''
    items.push(`<div class="diff-item"><span class="sym ${e.op === 'remove' ? 'rm' : 'add'}">${e.op === 'remove' ? '−' : '+'}</span><div><p><b>Example “${esc(ex?.title || e.id)}”</b> ${e.op === 'add' ? 'added' : e.op === 'remove' ? 'removed' : 'updated'}</p><span class="cite">${exp}</span></div></div>`)
  }
  const needsTranslation = c.edits.some(e => e.type === 'question' || e.type === 'text')
  const approvalBox = kind => {
    const a = c.approvals.find(x => x.kind === kind)
    const role = { policy: 'policy-reviewer', engineering: 'engineer', translation: 'translator' }[kind]
    const canApprove = c.status === 'review' && p.role === role && !mine && !a
    return `<div class="appr ${a ? 'done' : ''}"><h4>${{ policy: 'Policy review', engineering: 'Engineering review', translation: 'Translation' }[kind]} ${a ? '<span class="pill ok">Approved</span>' : canApprove ? '<span class="pill">Your turn</span>' : ''}</h4>
      <p>${a ? `${esc(personName(a.by))}, ${new Date(a.at).toLocaleString()}${a.note ? `: “${esc(a.note)}”` : ''}` : kind === 'policy' ? 'Does it say what the law says?' : kind === 'translation' ? 'Does the Spanish say the same? (Enter it below first.)' : `Are the code, tests and screens sound?${mine && p.role === 'engineer' ? ' Another engineer gives this one: you wrote the change.' : ''}`}</p>
      ${canApprove ? `<div class="add-row" style="margin-top:8px"><button class="btn ok sm" data-act="approve" data-id="${c.id}">Approve</button><button class="btn sec sm" data-act="request-changes" data-id="${c.id}">Ask for changes</button></div>` : ''}</div>`
  }
  const actions = []
  if (c.status === 'draft' && mine) actions.push(`<button class="btn" data-act="submit" data-id="${c.id}">Send for review →</button>`)
  if (c.status === 'draft' && (mine || p.role === 'engineer') && activeChange()?.id !== c.id) actions.push(`<button class="btn sec" data-act="resume" data-id="${c.id}">Keep editing this draft</button>`)
  if (['review', 'approved'].includes(c.status) && mine) actions.push(`<button class="btn sec" data-act="withdraw" data-id="${c.id}">Take back to draft</button>`)
  if (c.status === 'draft' && mine) actions.push(`<button class="btn danger" data-act="discard" data-id="${c.id}">Discard</button>`)
  if (c.status === 'approved' && p.role === 'engineer') actions.push(`<button class="btn ok" data-act="publish" data-id="${c.id}">${S.data.tools?.gitPr ? 'Publish and open the pull request' : `Publish to ${esc(S.data.paths.virginia.split('/').pop())}${needsTranslation ? ' and the screens' : ''}`}</button>`)
  if (c.status === 'published' && canEdit()) actions.push(`<button class="btn danger" data-act="revert" data-id="${c.id}">Roll back…</button>`)
  if (c.status === 'approved' && p.role !== 'engineer' && !mine) actions.push(`<button class="btn sec" data-act="request-changes" data-id="${c.id}">Ask for changes</button>`)
  return `
    <div class="crumb"><a href="#/changes">Changes</a> › #${c.id}</div>
    <div class="toolbar"><div><h1>${esc(c.title)}</h1>
      <p class="sub" style="margin:0">Proposed by <b>${esc(personName(c.author))}</b> · ${c.edits.length} part${c.edits.length === 1 ? '' : 's'} · ${c.exampleEdits.length} example edit${c.exampleEdits.length === 1 ? '' : 's'} ${c.requestIds?.length ? `· waits on request #${c.requestIds.join(', #')}` : ''}${c.law?.citation ? ` · <span title="${esc(c.law.text || '')}">${cite(c.law.citation)}</span>` : ''}${c.law?.effectiveYear ? ` · tax year ${c.law.effectiveYear}${c.law.endsAfter ? ` to ${c.law.endsAfter}` : ' and after'}` : ''} · <a href="#/change/${c.id}/impact">what it touches</a>${c.revertOf ? ` · reverts <a href="#/change/${c.revertOf}">#${c.revertOf}</a>` : ''}</p></div>
      <div class="acts">${statusPill(c)} ${c.status === 'draft' && mine ? `<button class="btn quiet sm" data-act="rename" data-id="${c.id}">Rename</button>` : ''}</div></div>
    <div id="rail">${railFor(c, null)}</div>
    <div class="split">
      <div class="stack">
        ${c.law && c.status === 'draft' ? proposalsPanel(c) : ''}
        ${items.length ? `<div class="diff-plain">${items.join('')}</div>` : '<div class="empty-state">Nothing in this change yet. Set a value for a year, change a rule, add a question or edit a screen while it is your open draft.</div>'}
        ${c.law?.text ? `<details><summary style="font-weight:700;font-size:14px;cursor:pointer;margin-bottom:8px">The law, as pasted</summary><div class="lawbox">${esc(c.law.text)}</div></details>` : ''}
        <details ${p.role === 'engineer' ? 'open' : ''}><summary style="font-weight:700;font-size:14px;cursor:pointer;margin-bottom:8px">Code change</summary><div id="code-diff"><span class="spin"></span> Working it out…</div></details>
        <div id="spanish-panel">${spanishPanel(c, null)}</div>
        <div class="approvals ${needsTranslation ? 'three' : ''}">${approvalBox('policy')}${approvalBox('engineering')}${needsTranslation ? approvalBox('translation') : ''}</div>
        ${actions.length ? `<div class="add-row">${actions.join('')}</div>` : ''}
        ${c.status === 'published' ? `<p class="pill ok" style="display:inline-block;white-space:normal">Published ${new Date(c.published.at).toLocaleString()} by ${esc(personName(c.published.by))}: ${esc(c.published.files.join(', ') || 'examples only')}, ${c.published.examples} examples passing.${c.published.pr ? ` Pull request: <a href="${esc(c.published.pr)}" target="_blank" rel="noopener">${esc(c.published.pr)}</a>.` : c.published.commit ? ` Commit ${esc(c.published.commit.slice(0, 10))}.` : ''}${c.published.commitError ? ` <span class="err">Git: ${esc(c.published.commitError)}</span>` : ''}</p>` : ''}
        <h2>Conversation</h2>
        <div class="thread">${c.comments.map(m => { const who = S.data.people.find(x => x.id === m.by); return `<div class="msg"><span class="avatar ${who?.role}">${esc(who?.initials || '?')}</span><div class="b"><div class="who-l">${esc(who?.name)} · ${esc(ROLE[who?.role] || '')}</div>${esc(m.text)}</div></div>` }).join('') || '<p class="muted">No comments yet.</p>'}</div>
        <div style="display:flex;gap:8px;margin-top:8px"><input type="text" id="comment" placeholder="Ask a question or explain…" style="flex:1" aria-label="Comment"><button class="btn sec" data-act="comment" data-id="${c.id}">Comment</button></div>
      </div>
      <div class="stack">
        <div class="panel"><div class="panel-h">Checks <span id="verify-pill"></span></div><div class="panel-b" id="verify"><span class="spin"></span> Checking against the files as they are now…</div></div>
        <div class="panel"><div class="panel-h">History</div><div class="panel-b"><ul class="history">${c.history.map(h => `<li>${new Date(h.at).toLocaleString()}: ${esc(personName(h.by))} ${esc(h.what)}</li>`).join('')}</ul></div></div>
      </div>
    </div>`
}

async function loadVerify (id) {
  const c0 = S.data.changes.find(x => x.id === Number(id))
  if (c0?.status === 'published' || c0?.status === 'discarded') {
    // The files have moved on (this change is in them), so re-verifying would only report a conflict.
    $('#verify').innerHTML = c0.status === 'published' ? `<ul class="checks"><li><span class="dot ok">✓</span><span>Ran at publish, ${new Date(c0.published.at).toLocaleString()}: ${c0.published.examples} worked examples passed, and the files were written.</span></li></ul>` : '<p class="muted">Discarded.</p>'
    $('#verify-pill').innerHTML = ''
    const r = $('#rail'); if (r) r.innerHTML = railFor(c0, null)
    const sp = $('#spanish-panel'); if (sp) sp.innerHTML = ''
    $('#code-diff').innerHTML = '<p class="muted">Published; the diff is in the files (and in git, when publishes are committed).</p>'
    return
  }
  let v
  try { v = await api('GET', `/api/changes/${id}/verify`) } catch (e) { $('#verify').innerHTML = `<span class="err">${esc(e.message)}</span>`; return }
  const li = (cls, sym, text) => `<li><span class="dot ${cls}">${sym}</span><span>${text}</span></li>`
  const rows = []
  if (v.conflict) rows.push(li('bad', '!', `Conflict: ${esc(v.conflict)} Start a fresh draft from the current rules.`))
  else {
    if (!v.blocked?.length) rows.push(v.error ? li('bad', '!', esc(v.error)) : li('ok', '✓', 'The rules load in the engine'))
    rows.push(li('ok', '✓', 'Only Virginia files change; federal modules untouched'))
    if (v.blocked?.length) rows.push(li('req', '#', `Waits on request #${v.blocked.join(', #')}; the examples run once it is built`))
    if (!v.error) rows.push(v.failing.length ? li('bad', '!', `${v.count - v.failing.length} of ${v.count} worked examples pass:<br>${v.failing.map(f => `${esc(f.title)}${f.failures.map(x => `<br><span class="cite">${esc(lineName(x.path))}: law says ${esc(formatResult(x.expected))}, rules give ${esc(formatResult(x.actual))}</span>`).join('')}`).join('<br>')}`) : li('ok', '✓', `All ${v.count} worked examples pass`))
    if (!v.error) rows.push(v.schema ? li('ok', '✓', `The changed file fits <code>${esc(v.schema.split('/').pop())}</code> (xmllint)`) : li('wait', '?', 'Schema not checked: xmllint is not installed here'))
    if (!v.error && v.translations?.length) rows.push(v.flowSchema ? li('ok', '✓', `The flow fits <code>${esc(v.flowSchema.split('/').pop())}</code>; the Spanish file reads back`) : li('wait', '?', 'Flow schema not checked: xmllint is not installed here'))
    if (v.translations?.length) rows.push(v.untranslated?.length ? li('warn', '!', `${v.untranslated.length} of ${v.translations.length} string${v.translations.length === 1 ? '' : 's'} ha${v.untranslated.length === 1 ? 's' : 've'} no Spanish yet. Publishing waits for it.`) : li('ok', '✓', `Spanish in for all ${v.translations.length} string${v.translations.length === 1 ? '' : 's'}`))
    if (v.season) rows.push(li('ok', '→', v.season.effectiveYear && v.season.effectiveYear > v.season.siteYear ? `For the ${v.season.effectiveYear} season: the live ${v.season.siteYear} site is not rebuilt` : `For the live ${v.season.siteYear} season`))
    if (v.oracle?.available) {
      const w = v.oracle.warnings || []
      rows.push(w.length
        ? li('warn', '?', `The independent model disagrees on ${w.length} line${w.length === 1 ? '' : 's'} (a warning, not a failure: look before you trust either):<br>${w.slice(0, 8).map(x => `<span class="cite">${esc(x.title)}, ${esc(lineName(x.path))}: rules give ${esc(formatResult(x.engine))}, the model says ${esc(formatResult(x.model))}</span>`).join('<br>')}${w.length > 8 ? `<br><span class="cite">… and ${w.length - 8} more</span>` : ''}`)
        : v.oracle.error ? li('warn', '?', `The independent model could not run: ${esc(v.oracle.error)}`) : li('ok', '✓', 'The independent model (scripts/lib/virginia-model.cjs) agrees on every line it computes'))
    }
    if (v.overlaps?.length) rows.push(li('bad', '!', `Change${v.overlaps.length > 1 ? 's' : ''} ${v.overlaps.map(o => `<a href="#/change/${o.id}">#${o.id}</a> (${esc(o.status)})`).join(', ')} already edit${v.overlaps.length > 1 ? '' : 's'} a fact this draft edits. It cannot go to review until that is published or dropped.`))
  }
  $('#verify').innerHTML = `<ul class="checks">${rows.join('')}</ul><p class="cite" style="margin:8px 0 0">The server reruns these at publish, against the files as they are then, and writes nothing unless they pass. Same check from a terminal: <code>node workbench/check.mjs --change ${id}</code></p>`
  $('#verify-pill').innerHTML = v.ok ? '<span class="pill ok">pass</span>' : '<span class="pill bad">not yet</span>'
  if (c0) { const r = $('#rail'); if (r) r.innerHTML = railFor(c0, v); const sp = $('#spanish-panel'); if (sp) sp.innerHTML = spanishPanel(c0, v) }
  const d = []
  for (const [k, hunks] of Object.entries(v.diffs || {})) {
    if (!hunks.length) continue
    d.push(`<p class="cite" style="margin:6px 0"><code>${esc(S.data.paths[k] || k)}</code></p><pre class="xml">${hunks.map(h => `<span class="hunk">${esc(h.header)}</span>${h.lines.map(([op, t]) => op === '+' ? `<span class="add">+ ${esc(t)}</span>` : op === '-' ? `<span class="del">- ${esc(t)}</span>` : `  ${esc(t)}\n`).join('')}`).join('')}</pre>`)
  }
  const exEdits = S.data.changes.find(x => x.id === Number(id))?.exampleEdits.length
  $('#code-diff').innerHTML = d.join('') + (exEdits ? `<p class="cite">Plus ${exEdits} change${exEdits === 1 ? '' : 's'} to <code>${esc(S.data.paths.examples)}</code>.</p>` : '') || '<p class="muted">No change to the fact files.</p>'
}

// ---------------------------------------------------------------------------------------------
// 6. Requests to engineering

function viewRequests () {
  const rows = [...S.data.requests].reverse().map(r => `<div class="panel" style="margin-bottom:12px"><div class="panel-h"><span>Request #${r.id}: ${esc(r.question)}</span>${r.status === 'open' ? '<span class="pill req">Open</span>' : '<span class="pill ok">Built</span>'}</div>
    <div class="panel-b"><p style="margin:0 0 6px"><b>The law:</b> ${esc(r.law)}</p>
    <p style="margin:0 0 6px"><b>Answer:</b> ${esc(humanize(r.answerType))}${r.factPath ? ` · will be <code>${esc(r.factPath)}</code>` : ''}${r.forChange ? ` · for change <a href="#/change/${r.forChange}">#${r.forChange}</a>` : ''} · asked by ${esc(personName(r.by))}</p>
    ${r.examples ? `<p style="margin:0 0 6px"><b>Must get right:</b> ${esc(r.examples)}</p>` : ''}
    ${r.comments.map(m => `<p class="cite" style="margin:2px 0">${esc(personName(m.by))}: ${esc(m.text)}</p>`).join('')}
    ${me().role === 'engineer' ? `<div class="add-row">${r.status === 'open' ? `<button class="btn sm" data-act="req-done" data-id="${r.id}">Mark built</button>` : `<button class="btn quiet sm" data-act="req-reopen" data-id="${r.id}">Reopen</button>`}</div>` : ''}
    </div></div>`).join('')
  return `<div class="toolbar"><div><h1>Requests to engineering</h1><p class="sub" style="margin:0">When a rule needs the return to know something new (a new question, a new screen, Spanish wording), policy staff ask here, and engineering builds it.</p></div>${canEdit() ? '<div class="acts"><button class="btn" data-act="new-request">+ New request</button></div>' : ''}</div>
    ${rows || '<div class="empty-state">No requests yet.</div>'}`
}

function requestDialog () {
  const c = activeChange()
  const d = $('#dialog')
  d.innerHTML = `<form><div class="dh">Ask engineering for a new question <button class="x" type="button" data-close aria-label="Close">✕</button></div><div class="db">
    <div class="field-row"><label for="rq-law">What does the law say?</label><div class="hint">Paste the statute or the form instruction.</div><textarea id="rq-law" required></textarea></div>
    <div class="field-row"><label for="rq-q">What do we need to ask the filer?</label><div class="hint">In the words the filer would see.</div><textarea id="rq-q" required></textarea></div>
    <div class="field-row"><label for="rq-type">What kind of answer?</label><select id="rq-type"><option value="dollar">Dollar amount</option><option value="boolean">Yes / No</option><option value="enum">Pick from a list</option><option value="day">Date</option></select></div>
    <div class="field-row"><label for="rq-path">Name in the code</label><div class="hint">Engineering can change it. The rule editor offers it under this name until it is built.</div><input type="text" id="rq-path" style="width:100%" placeholder="/vaSomethingNew"></div>
    <div class="field-row"><label for="rq-ex">Examples the new question must get right</label><textarea id="rq-ex" placeholder="$2,000 on a W-2G plus $300 in small prizes → Line 7 = $300"></textarea></div>
    ${c ? `<p class="cite">Linked to your draft #${c.id}. It cannot go to review until this is built.</p>` : ''}
  </div><div class="df"><button class="btn sec" type="button" data-close>Cancel</button><button class="btn">Send to engineering</button></div></form>`
  const q = d.querySelector('#rq-q')
  const pth = d.querySelector('#rq-path')
  q.oninput = () => { if (!pth.dataset.touched) pth.value = '/va' + q.value.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(w => w.length > 2 && !/^(the|you|your|did|how|much|what|that|were|from|this|with|have)$/i.test(w)).slice(0, 4).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('') }
  pth.oninput = () => { pth.dataset.touched = '1' }
  d.onclick = e => { if (e.target.closest('[data-close]')) d.close() }
  d.querySelector('form').onsubmit = async e => {
    e.preventDefault()
    try {
      const r = await api('POST', '/api/requests', { law: d.querySelector('#rq-law').value, question: q.value, answerType: d.querySelector('#rq-type').value, factPath: pth.value.trim(), examples: d.querySelector('#rq-ex').value, forChange: c?.id })
      d.close()
      toast(`Request #${r.id} sent. It shows up in the rule editor's list as “Requested #${r.id}”.`)
      await refresh()
    } catch (x) { toast(x.message, true) }
  }
  d.showModal()
  d.querySelector('#rq-law').focus()
}

// ---------------------------------------------------------------------------------------------
// Read-only lists

function viewFederal () {
  return `<h1>Federal facts Virginia uses</h1><p class="sub">The Virginia rules may read only what the federal return hands to states (ADR-001). In the workbench each is a plain input, so a worked example can just say what it is. Adding one is an engineering change to <code>workbench/federal-inputs.json</code>.</p>
    <table class="grid"><thead><tr><th>Fact</th><th>From</th><th>Kind</th><th>Feeds</th></tr></thead><tbody>${S.data.federal.inputs.map(i => `<tr><td><b>${esc(i.label)}</b><br><code class="cite">${esc(i.path)}</code></td><td>${esc(i.source)}</td><td>${esc(humanize(i.type))}</td><td class="cite">${(feedsLines(S.model, i.path, 30).map(l => 'Line ' + l).join(', ')) || '—'}</td></tr>`).join('')}</tbody></table>`
}

function viewAll () {
  const facts = [...S.model.facts.values()]
  return `<div class="toolbar"><div><h1>Every fact</h1><p class="sub" style="margin:0">${facts.length} facts in the Virginia modules, in file order.</p></div><div class="acts"><input type="search" id="line-search" placeholder="Filter…" aria-label="Filter" value="${esc(S.search || '')}"></div></div>
    <table class="grid" id="line-list"><thead><tr><th>Fact</th><th>Kind</th><th>Section</th></tr></thead><tbody>${facts.map(f => `<tr data-search="${esc((f.name + ' ' + f.path + ' ' + f.section).toLowerCase())}"><td><a href="#/${f.kind === 'value' ? 'values' : 'rule/' + encodeURIComponent(f.path)}">${esc(f.name)}</a><br><code class="cite">${esc(f.path)}</code></td><td><span class="ty ${f.kind === 'rule' ? 'calc' : f.kind}">${esc(f.kind)}</span></td><td class="cite">${esc(f.section)}</td></tr>`).join('')}</tbody></table>`
}

// ---------------------------------------------------------------------------------------------
// Reports: computed by the server from the files as they are, fetched when the page opens.

const REPORTS = {
  coverage: ['Coverage', 'Every Form 760 line and Schedule ADJ item the rules name, how it is modelled, and which worked examples check it.'],
  exports: ['Export contract', 'Every federal fact the Virginia modules read: whether the federal dictionary exports it to states (ADR-001), and how the sandbox stands it in.'],
  spanish: ['Spanish', 'The Virginia screens\' English keys in flow_en.yaml against virginia_es.yaml: what has no Spanish yet, and what is stale.'],
  history: ['History', 'The last twenty publishes, from data/audit.jsonl.'],
}

function viewReport () {
  const [name] = S.route
  const [title, sub] = REPORTS[name]
  return `<h1>${title}</h1><p class="sub">${sub}</p><div id="report"><p class="muted"><span class="spin"></span> Reading the files…</p></div>`
}

async function loadReport (name) {
  const box = $('#report')
  let r
  try { r = await api('GET', `/api/reports/${name === 'history' ? 'audit' : name}`) } catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; return }
  if (!$('#report') || S.route[0] !== name) return
  box.innerHTML = { coverage: reportCoverage, exports: reportExports, spanish: reportSpanish, history: reportHistory }[name](r)
}

function reportCoverage (r) {
  const STATUSES = { modelled: ['Modelled', 'ok'], 'records stand-in': ['Records stand-in', 'blue'], 'filer question': ['Filer question', 'warn'], other: ['Other', ''] }
  const row = l => `<tr class="${l.examples.length === 0 && l.status === 'modelled' ? 'changed' : ''}"><td class="num">${esc(l.line)}</td><td><a href="#/rule/${encodeURIComponent(l.path)}">${esc(shortName(l.name))}</a><br><code class="cite">${esc(l.path)}</code></td><td><span class="pill ${STATUSES[l.status][1]}">${STATUSES[l.status][0]}</span></td><td class="cite">${cite(l.citation)}</td><td class="num">${l.examples.length ? `<b>${l.examples.length}</b>` : '<span class="res-bad">0</span>'}</td><td class="cite">${l.examples.map(esc).join(', ')}</td></tr>`
  const group = form => { const ls = r.lines.filter(l => l.form === form); return ls.length ? `<tr class="group"><td colspan="6">${form}</td></tr>${ls.map(row).join('')}` : '' }
  return `
    <div class="attn">
      <a href="#/coverage"><b>${r.counts.modelled || 0} modelled</b><span class="cite">Derived from other facts (a rule)</span></a>
      <a class="wait" href="#/coverage"><b>${r.counts['records stand-in'] || 0} records stand-ins</b><span class="cite">Writable with a placeholder: Virginia Tax's own records, which the prototype cannot reach</span></a>
      <a class="wait" href="#/coverage"><b>${r.counts['filer question'] || 0} filer questions</b><span class="cite">Writable: the filer answers</span></a>
      <a class="${r.uncovered.length ? '' : 'ok'}" href="#/coverage"><b>${r.uncovered.length} uncovered</b><span class="cite">Modelled lines no worked example asserts on, of ${r.examples} examples</span></a>
    </div>
    ${r.uncovered.length ? `<p><b>No worked example checks:</b> ${r.uncovered.map(p => `<a href="#/rule/${encodeURIComponent(p)}">${esc(lineName(p))}</a>`).join(', ')}. <a href="#/examples">Add one →</a></p>` : '<p class="res-ok">Every modelled line is asserted on by at least one worked example.</p>'}
    ${r.noFact.length ? `<p class="cite">Form 760 lines with no fact at all (not in this prototype's scope): ${r.noFact.join(', ')}.</p>` : ''}
    <table class="grid"><thead><tr><th class="num">Line</th><th>Fact</th><th>How</th><th>Law</th><th class="num">Examples</th><th>Which</th></tr></thead><tbody>${group('Form 760')}${group('Schedule ADJ')}</tbody></table>`
}

function reportExports (r) {
  const bad = r.rows.filter(x => x.problems.length)
  return `
    ${r.federalDictionary ? '' : '<p class="pill warn" style="display:inline-block">No federal dictionary beside this copy of the facts, so export flags are not checked; only the stand-ins are.</p>'}
    <p>${bad.length ? `<span class="res-bad">${bad.length} of ${r.rows.length} federal facts have a problem.</span>` : `<span class="res-ok">All ${r.rows.length} federal facts Virginia reads are exported to states (or are the residency gate) and have a stand-in of the right type.</span>`} Same check from a terminal: <code>python3 scripts/check-virginia-exports.py</code>.</p>
    <table class="grid"><thead><tr><th>Federal fact</th><th>Module</th><th>Exported</th><th>Type</th><th>Sandbox stand-in</th><th>Read by</th></tr></thead><tbody>${r.rows.map(x => `<tr class="${x.problems.length ? 'changed' : ''}">
      <td><code>${esc(x.path)}</code>${x.gate ? ' <span class="pill">gate</span>' : ''}${x.problems.length ? `<br><span class="res-bad">${x.problems.map(esc).join('; ')}</span>` : ''}</td>
      <td>${esc(x.module)}</td>
      <td>${!r.federalDictionary ? '<span class="muted">?</span>' : x.exported ? '<span class="res-ok">yes</span>' : x.gate ? '<span class="pill">gate, computes nothing</span>' : '<span class="res-bad">no</span>'}${x.exportAttrs !== null ? `<br><code class="cite">&lt;Export${esc(x.exportAttrs ? ' ' + x.exportAttrs : '')}/&gt;</code>` : ''}</td>
      <td class="cite">${esc(x.federalType || '—')}</td>
      <td>${x.standIn ? `${esc(x.standIn.label)}<br><span class="cite">${esc(x.standIn.type)} · ${esc(x.standIn.source)}</span>` : '<span class="res-bad">none</span>'}</td>
      <td class="cite">${x.files.join(', ')}</td></tr>`).join('')}</tbody></table>
    ${r.unused.length ? `<p class="cite" style="margin-top:10px">Stand-ins nothing reads any more (drop them from federal-inputs.json): ${r.unused.map(esc).join(', ')}</p>` : ''}`
}

function reportSpanish (r) {
  const pct = r.english ? Math.round((100 * r.translated) / r.english) : 0
  return `
    ${r.esMissing ? `<p class="pill warn" style="display:inline-block">${esc(r.files.es)} is not there.</p>` : ''}
    <div class="attn">
      <a class="${r.missing.length ? '' : 'ok'}" href="#/spanish"><b>${r.translated} of ${r.english} keys</b><span class="cite">${pct}% of the Virginia screens' English has Spanish</span></a>
      <a class="${r.missing.length ? '' : 'ok'}" href="#/spanish"><b>${r.missing.length} missing</b><span class="cite">English keys with no Spanish entry</span></a>
      <a class="${r.stale.length ? '' : 'ok'}" href="#/spanish"><b>${r.stale.length} stale</b><span class="cite">Spanish keys the English no longer has (the English changed, so the key did)</span></a>
    </div>
    <p class="cite">Keys are form-builder's, content-addressed on the English: <code>${esc(r.files.en)}</code> (generated by a build) against <code>${esc(r.files.es)}</code>. Same check, and the merge: <code>python3 scripts/merge-virginia-es.py</code>.</p>
    <table class="grid"><thead><tr><th>Screen</th><th class="num">Keys</th><th class="num">Spanish</th><th>Missing</th></tr></thead><tbody>${r.routes.map(x => `<tr class="${x.missing.length ? 'changed' : ''}"><td><code>${esc(x.route)}</code></td><td class="num">${x.keys}</td><td class="num">${x.translated === x.keys ? `<span class="res-ok">${x.translated}</span>` : `<span class="res-bad">${x.translated}</span>`}</td><td class="cite">${x.missing.map(k => `<code>${esc(k)}</code>`).join(' ') || '—'}</td></tr>`).join('')}</tbody></table>
    ${r.stale.length ? `<h2>Stale Spanish keys</h2><p class="cite">In virginia_es.yaml, not in flow_en.yaml. Find the new key for the same English and move the Spanish under it.</p><ul>${r.stale.map(k => `<li><code>${esc(k)}</code></li>`).join('')}</ul>` : ''}`
}

function reportHistory (r) {
  return `
    <p class="cite">Every publish appends a line to <code>${esc(r.file)}</code>, which is meant to be committed. ${r.gitCommit ? 'Each publish is also a git commit (WORKBENCH_GIT_COMMIT=1).' : 'Set <code>WORKBENCH_GIT_COMMIT=1</code> to have each publish commit the files it wrote, with the change number as a trailer.'}</p>
    ${r.entries.length ? `<table class="grid"><thead><tr><th>When</th><th>Change</th><th>By</th><th>Files</th><th>Commit</th></tr></thead><tbody>${r.entries.map(e => `<tr>
      <td class="cite">${esc(new Date(e.at).toLocaleString())}</td>
      <td><a href="#/change/${e.change}"><b>#${e.change}</b> ${esc(e.title)}</a><br><span class="cite">${(e.edits || []).map(x => `${x.type}: ${esc(lineName(x.path))}`).join(' · ')}${e.examples ? ` · ${e.examples} examples passing` : ''}</span></td>
      <td>${esc(e.name || personName(e.by))}</td>
      <td class="cite">${(e.files || []).map(f => `<code>${esc(f.split('/').pop())}</code>`).join(' ') || '—'}</td>
      <td class="cite">${e.commit ? `<code>${esc(e.commit.slice(0, 10))}</code>` : '—'}</td></tr>`).join('')}</tbody></table>` : '<div class="empty-state">Nothing has been published yet.</div>'}`
}

// ---------------------------------------------------------------------------------------------
// Events

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

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]')
  if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return
  const act = b.dataset.act
  const f = currentRuleFact()
  try {
    if (act === 'tab') { const st = ruleState(f); st.tab = b.dataset.tab; st.xmlError = null; render() } else if (act === 'pick') {
      const st = ruleState(f)
      const { node } = nodeAt(st.tree, b.dataset.at)
      const choice = await pickerDialog(node)
      if (!choice) return
      if (choice.request && !choice.path) { requestDialog(); return }
      replaceAt(st, b.dataset.at, () => choice.path ? dep(choice.path, choice.module || undefined) : lit(choice.tag, choice.amount))
      await treeChanged(f)
    } else if (act === 'add-case') {
      const st = ruleState(f)
      const { node: sw } = nodeAt(st.tree, b.dataset.at)
      const kase = el('Case', [el('When', [el('GreaterThan', [el('Left', [dep('')]), el('Right', [lit('Dollar', 0)])])]), el('Then', [lit('Dollar', 0)])], { 'data-new': '' })
      // The "because" comment is written once the author types one (case-because), not as an empty line.
      sw.children.unshift(kase)
      await treeChanged(f)
    } else if (['case-up', 'case-down', 'case-rm'].includes(act)) {
      const st = ruleState(f)
      const p = b.dataset.at.split('.')
      const i = Number(p.pop())
      const { node: sw } = nodeAt(st.tree, p.join('.'))
      // A case moves with the comment written just above it: group the children into units of
      // [comments…, Case], move or drop the unit, and flatten again.
      const units = []
      let pending = []
      sw.children.forEach((c, k) => {
        pending.push({ c, k })
        if (c.tag === 'Case') { units.push(pending); pending = [] }
      })
      const u = units.findIndex(unit => unit.some(x => x.k === i))
      if (act === 'case-rm') units.splice(u, 1)
      else {
        const v = act === 'case-up' ? u - 1 : u + 1
        if (v >= 0 && v < units.length) [units[u], units[v]] = [units[v], units[u]]
      }
      sw.children = [...units.flat().map(x => x.c), ...pending.map(x => x.c)]
      await treeChanged(f)
    } else if (act === 'limit') {
      const st = ruleState(f)
      replaceAt(st, b.dataset.at, n => el(b.dataset.kind, [n, lit('Dollar', 0)]))
      await treeChanged(f)
    } else if (act === 'unlimit') {
      const st = ruleState(f)
      replaceAt(st, b.dataset.at, n => elementKids(n)[0])
      await treeChanged(f)
    } else if (act === 'add-operand') {
      const st = ruleState(f)
      const { node } = nodeAt(st.tree, b.dataset.at)
      node.children.push(dep(''))
      await treeChanged(f)
    } else if (act === 'rm') {
      const st = ruleState(f)
      const p = b.dataset.at.split('.')
      const i = Number(p.pop())
      nodeAt(st.tree, p.join('.')).node.children.splice(i, 1)
      await treeChanged(f)
    } else if (act === 'xml-apply') {
      const st = ruleState(f)
      const text = $('#xml-text').value
      try {
        const nodes = parseXmlFragment(text).filter(n => n.tag !== '#comment')
        if (nodes.length !== 1 || nodes[0].tag !== 'Derived' || elementKids(nodes[0]).length !== 1) throw new Error('Write one <Derived> element holding one expression.')
        // The tree is the inside of <Derived>.
        st.tree = elementKids(nodes[0])[0]
        st.xmlError = null
        st.tab = 'plain'
        await treeChanged(f)
      } catch (x) { st.xmlText = text; st.xmlError = x.message; render() }
    } else if (act === 'xml-reset') { const st = ruleState(f); st.xmlText = null; st.xmlError = null; render() } else if (act === 'new-request') requestDialog()
    else if (act === 'new-change') lawDialog()
    else if (act.startsWith('q-')) await questionAct(act, b)
    else if (act === 'bind') await bindFigure(b)
    else if (act === 'spanish-save') await saveSpanish(b.dataset.id)
    else if (act === 'year-undo') { const c = activeChange(); c.edits = c.edits.filter(x => !((x.type === 'value' || x.type === 'schedule') && x.path === b.dataset.path)); saveSoon(c); render() } else if (act === 'text-undo') { const c = activeChange(); c.edits = c.edits.filter(x => !(x.type === 'text' && x.route === b.dataset.route && x.before === b.dataset.before)); saveSoon(c); render() } else if (act === 'propose-value') {
      const c = await ensureDraft()
      if (!c) return
      const f = S.model.facts.get(b.dataset.path)
      const year = Number(b.dataset.year)
      c.edits = c.edits.filter(x => !((x.type === 'value' || x.type === 'schedule') && x.path === f.path))
      if (year <= S.data.siteYear && !f.schedule.steps.length) c.edits.push({ type: 'value', file: f.file, path: f.path, from: f.schedule.base, to: b.dataset.value })
      else c.edits.push({ type: 'schedule', file: f.file, path: f.path, before: f.derivedText, tag: f.schedule.tag, base: f.schedule.base, steps: [...f.schedule.steps.filter(s => s.year !== year), { year, value: b.dataset.value }].sort((x, y) => y.year - x.year), fromBase: f.schedule.base, fromSteps: f.schedule.steps })
      saveSoon(c)
      toast(`${f.name}: ${b.dataset.value} from ${year}. See the Values page.`)
      render()
    } else if (act === 'revert') {
      if (!confirm('Draft a change that undoes this one? It goes through the same checks and approvals before anything is written.')) return
      const c = await api('POST', '/api/changes', { revertOf: Number(b.dataset.id) })
      setActive(c.id); await refresh(); location.hash = `#/change/${c.id}`
    } else if (act === 'leave-draft') { setActive(null); S.rule = {}; render(); toast('Draft set aside. Find it under Changes.') } else if (act === 'resume') { setActive(Number(b.dataset.id)); S.rule = {}; render() } else if (act === 'rename') {
      const c = S.data.changes.find(x => x.id === Number(b.dataset.id))
      const t = await askText('Rename', 'Title', c.title)
      if (t) { c.title = t; await api('PUT', `/api/changes/${c.id}`, { change: { title: t } }); render() }
    } else if (['submit', 'approve', 'request-changes', 'withdraw', 'discard', 'publish', 'comment'].includes(act)) {
      let note
      if (act === 'request-changes') { note = await askText('Ask for changes', 'What needs to change?', '', { multiline: true }); if (!note) return }
      if (act === 'approve') note = (await askText('Approve', 'Anything to say with your approval? (optional)', '')) || ''
      if (act === 'comment') { note = $('#comment').value.trim(); if (!note) return }
      if (act === 'discard' && !confirm('Discard this draft? It stays in the list as discarded.')) return
      if (act === 'publish' && !confirm('Publish? This writes the change into the fact files on disk, after rerunning every example.')) return
      if (act === 'submit') { clearTimeout(saveTimer); const c = activeChange(); if (c) await api('PUT', `/api/changes/${c.id}`, { change: { title: c.title, source: c.source, edits: c.edits, exampleEdits: c.exampleEdits, requestIds: c.requestIds } }) }
      b.disabled = true
      try {
        const c = await api('POST', `/api/changes/${b.dataset.id}/action`, { action: act === 'discard' ? 'withdraw' : act, discard: act === 'discard', note })
        if (act === 'submit' || act === 'discard') { setActive(null); S.rule = {} }
        if (act === 'withdraw') setActive(c.id)
        toast({ submit: 'Sent for review.', approve: 'Approved.', 'request-changes': 'Sent back to the author.', withdraw: 'Back to draft.', discard: 'Discarded.', publish: 'Published. The fact files on disk now carry this change.', comment: 'Comment added.' }[act])
        S.runs.clear()
        await refresh()
      } catch (x) {
        b.disabled = false
        const extra = x.extra?.failing?.length ? ` ${x.extra.failing.map(fl => fl.title).join(', ')}.` : ''
        toast(x.message + extra, true)
      }
    } else if (act === 'example-new') exampleDialog(null)
    else if (act === 'example-edit') { const c = activeChange(); exampleDialog((c ? applyExampleEdits(S.data.examplesFile.examples, c) : S.data.examplesFile.examples).find(x => x.id === b.dataset.id)) } else if (act === 'accept') await acceptExample(b.dataset.id)
    else if (act === 'value-undo') { const c = activeChange(); c.edits = c.edits.filter(x => !(x.type === 'value' && x.path === b.dataset.path)); saveSoon(c); render() } else if (act === 'req-done' || act === 'req-reopen') {
      await api('POST', `/api/requests/${b.dataset.id}/action`, { action: act === 'req-done' ? 'done' : 'reopen' })
      await refresh()
    }
  } catch (x) { toast(x.message, true) }
})

document.addEventListener('change', async e => {
  const t = e.target
  if (t.id === 'who-select') { S.me = t.value; localStorage.setItem('wb-me', S.me); S.rule = {}; render(); return }
  if (t.id === 'year-select') { setYear(Number(t.value)); S.model = buildModel({ ...S.data, year: S.year }); S.runs.clear(); render(); return }
  const act = t.dataset.act
  if (act === 'year-cell') { await yearCell(t); return }
  if (act === 'text-edit') { await textEdit(t); return }
  if (t.dataset.q !== undefined) { questionInput(t); return }
  if (act === 'value') {
    const f = S.model.facts.get(t.dataset.path)
    let v = t.value.trim()
    if (!validAmount(f.literal.tag, v)) { toast('That is not a number this value can hold.', true); t.value = f.literal.value; return }
    v = normalizeAmount(f.literal.tag, v)
    const c = await ensureDraft()
    if (!c) { t.value = f.literal.value; return }
    c.edits = c.edits.filter(x => !(x.type === 'value' && x.path === f.path))
    // The source goes into the fact's <Description> when the change is applied (lib/xml-edit.js).
    if (Number(eval_(v)) !== Number(eval_(f.literal.value))) c.edits.push({ type: 'value', file: f.file, path: f.path, from: f.literal.value, to: v })
    saveSoon(c)
    render()
  } else if (act === 'cmp') {
    const f = currentRuleFact()
    const st = ruleState(f)
    const op = t.value
    const { node: n } = nodeAt(st.tree, t.dataset.at)
    const cur = CMP[n.tag] ? elementKids(elementKids(n)[0])[0] : n
    if (op === 'IsYes' && CMP[n.tag]) {
      // "is yes" is for a yes/no fact. The right operand is kept aside, so switching back restores it.
      if (operandType(cur) !== 'boolean') { toast('“Is yes” works for a yes/no fact. Pick a yes/no fact on the left first, or keep a comparison.', true); t.value = n.tag; return }
      st.savedRight ??= {}
      st.savedRight[t.dataset.at] = elementKids(elementKids(n)[1])[0]
    }
    replaceAt(st, t.dataset.at, () => {
      if (op === 'IsYes') return cur
      // Switching between comparisons keeps both operands; from "is yes", the right operand is the one set
      // aside earlier or a literal of the left operand's own type, never a dollar amount for a date.
      const right = CMP[n.tag] ? elementKids(elementKids(n)[1])[0] : st.savedRight?.[t.dataset.at] || defaultLiteral(cur)
      return el(op, [el('Left', [cur]), el('Right', [right])])
    })
    await treeChanged(f)
  } else if (act === 'filter') { S.filter = t.value; paintImpact() }
})

document.addEventListener('input', e => {
  const t = e.target
  if (t.dataset.q !== undefined && t.tagName !== 'SELECT') { if (t.dataset.q !== 'question') questionInput(t); return }
  const act = t.dataset.act
  if (act === 'source') { const c = activeChange(); if (!c) return; c.source = { ...c.source, [t.dataset.key]: t.value }; saveSoon(c) } else if (act === 'because') {
    const f = currentRuleFact()
    const st = ruleState(f)
    st.because = t.value
    const c = activeChange()
    const ed = c?.edits.find(x => x.type === 'rule' && x.path === f.path)
    if (ed) { ed.because = t.value; saveSoon(c) }
  } else if (act === 'case-because') {
    const f = currentRuleFact()
    const st = ruleState(f)
    const p = t.dataset.at.split('.')
    const i = Number(p.pop())
    const { node: sw } = nodeAt(st.tree, p.join('.'))
    const prev = sw.children[i - 1]
    const text = t.value.trim()
    if (prev?.tag === '#comment') { if (text) prev.text = 'Because: ' + text; else sw.children.splice(i - 1, 1) } else if (text) sw.children.splice(i, 0, { tag: '#comment', text: 'Because: ' + text })
    const c = activeChange()
    const ed = c?.edits.find(x => x.type === 'rule' && x.path === f.path)
    if (ed) { ed.derived = stripMarks(derivedXml(st.tree)); saveSoon(c) }
  }
})

export { validAmount, normalizeAmount, requestDialog }
const eval_ = v => (String(v).includes('/') ? Number(v.split('/')[0]) / Number(v.split('/')[1]) : Number(v))

function route () {
  S.route = location.hash.replace(/^#\/?/, '').split('/')
  if (S.route[0] === 'question') S.route = ['question', ...S.route.slice(1)]
  if (S.route[0] !== 'rule') S.rule = Object.fromEntries(Object.entries(S.rule).filter(([p]) => activeChange()?.edits.some(e => e.path === p)))
  if (S.data) { render(); $('#main').focus({ preventScroll: true }); window.scrollTo(0, 0) }
}
window.addEventListener('hashchange', route)

route()
refresh().catch(e => { $('#main').innerHTML = `<p class="err">Could not load the rules: ${esc(e.message)}</p>` })
