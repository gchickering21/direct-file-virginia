// The second set of views, docs/virginia/mockups/law-to-screen.html: a change that starts from the
// law and carries its tax years, values by year, a question builder that writes the fact, the
// screen and the words, the screens with their English and Spanish, the footprint of a change, and
// the publish rail. Shares state and helpers with app.js; nothing here runs at import time.

import {
  S, $, esc, cite, api, toast, me, personName, canEdit, activeChange, ensureDraft, saveSoon, published, draftFiles,
  lineName, askText, requestDialog, refresh, render, chipFor, STATUS, computeImpact, differences, ROLE,
} from './app.js'
import { literalLabel, formatResult, humanize, shortName, money } from './model.js'
import { valueSchedule, valueAt, scheduleDerived, scheduleLabel, translationNeeds, applyExampleEdits, applyBaselineEdits } from '/lib/xml-edit.js'
import { pages, keyFor, amountsIn, questionKeys, questionBlock } from '/lib/flow.js'
import { parseEs } from '/lib/locale.js'

const YEARS = () => { const y0 = S.data.siteYear; const set = new Set([y0, y0 + 1, y0 + 2, y0 + 3]); for (const f of S.model.facts.values()) for (const s of f.schedule?.steps || []) set.add(s.year); if (S.year) set.add(S.year); return [...set].sort() }
const yearLabel = y => `Tax year ${y}`
const seasonOf = y => `${y} season (opens Jan ${y + 1})`
const esMap = () => { try { return parseEs(S.data.es || '').keys } catch { return new Map() } }

// ---------------------------------------------------------------------------------------------
// 1. Start from the law

export function lawDialog () {
  const d = $('#dialog')
  d.style.width = 'min(860px, 96vw)'
  const y0 = S.data.siteYear
  d.innerHTML = `<form><div class="dh">Start a change <button class="x" type="button" data-close aria-label="Close">✕</button></div><div class="db">
    <p class="hint" style="margin-top:0">From the law, so the tool can propose what it touches. Or give it a title and start empty.</p>
    <div class="split" style="grid-template-columns:1fr 1fr">
      <div>
        <div class="field-row"><label for="law-kind">What changed?</label><select id="law-kind" style="width:100%"><option value="an Act of the General Assembly">Act of the General Assembly</option><option value="a Tax Bulletin">Tax Bulletin</option><option value="the Form 760 instructions">Form 760 instructions</option><option value="a court decision">Court decision</option><option value="a correction to our own rule">A correction to our own rule</option></select></div>
        <div class="field-row"><label for="law-cite">Citation</label><input type="text" id="law-cite" style="width:100%" placeholder="e.g. 2026 Acts of Assembly, ch. 412 · amends Va. Code § 58.1-322.03(7)"></div>
        <div class="field-row"><label for="law-year">Effective for taxable years beginning on or after January 1 of</label><div style="display:flex;gap:8px;align-items:center"><input type="text" id="law-year" value="${y0 + 2}" style="width:90px" inputmode="numeric"><span class="cite">Ends after tax year</span><input type="text" id="law-ends" style="width:90px" placeholder="never" inputmode="numeric"></div><div class="hint">Sets the column on the Values page, and which season's site carries the change.</div></div>
        <div class="field-row"><label for="law-title">Title (optional)</label><input type="text" id="law-title" style="width:100%" placeholder="Defaults to the citation"></div>
      </div>
      <div class="field-row"><label for="law-text">The text</label><textarea id="law-text" style="min-height:240px;font-family:var(--serif)" placeholder="Paste the section that changed. The tool reads the citation and the figures in it against the rules."></textarea></div>
    </div>
  </div><div class="df"><button class="btn sec" type="button" data-close>Cancel</button><button class="btn">Start the change →</button></div></form>`
  d.onclick = e => { if (e.target.closest('[data-close]')) { d.close() } }
  d.onclose = () => { d.style.width = '' }
  d.querySelector('form').onsubmit = async e => {
    e.preventDefault()
    const law = { kind: d.querySelector('#law-kind').value, citation: d.querySelector('#law-cite').value.trim(), text: d.querySelector('#law-text').value, effectiveYear: d.querySelector('#law-year').value.trim() || null, endsAfter: d.querySelector('#law-ends').value.trim() || null }
    const title = d.querySelector('#law-title').value.trim()
    if (!law.citation && !title && !law.text.trim()) { toast('Give it a citation, some text, or a title.', true); return }
    try {
      const body = { law: law.citation || law.text.trim() ? law : undefined }
      if (title) body.title = title
      const c = await api('POST', '/api/changes', body)
      d.close()
      localStorage.setItem(`wb-active-${S.me}`, c.id)
      if (law.effectiveYear) setYear(Number(law.effectiveYear))
      await refresh()
      location.hash = `#/change/${c.id}`
    } catch (x) { toast(x.message, true) }
  }
  d.showModal()
  d.querySelector('#law-cite').focus()
}

export function setYear (y) { S.year = y; localStorage.setItem('wb-year', y) }

/** The proposals panel on a change started from the law: what the text touches, as parts to open. */
export function proposalsPanel (c) {
  const p = c.proposals
  if (!p) return ''
  if (p.error) return `<div class="panel"><div class="panel-h">What this touches</div><div class="panel-b err">${esc(p.error)}</div></div>`
  const mine = activeChange()?.id === c.id && c.status === 'draft'
  const year = c.law?.effectiveYear || S.data.siteYear
  const rows = []
  for (const v of p.values) {
    const done = c.edits.find(e => (e.type === 'schedule' || e.type === 'value') && e.path === v.path)
    rows.push(`<div class="touch"><span class="box ${done ? 'on' : ''}">${done ? '✓' : ''}</span><div><b>Value: ${esc(v.name)}</b><span class="cite">now ${esc(literalLabel(v.tag, v.current))}${v.candidates.length ? ` · the text says ${v.candidates.map(x => esc(literalLabel(v.tag, x))).join(' or ')}` : ''} · ${esc(v.why)}</span>${mine ? `<span class="goes">${v.candidates.map(x => `<button class="btn quiet sm" data-act="propose-value" data-path="${esc(v.path)}" data-value="${esc(x)}" data-year="${year}">Set ${esc(literalLabel(v.tag, x))} from ${year}</button>`).join('')}<a href="#/values">Values table →</a></span>` : ''}</div><div class="tail"><span class="pill ok">Value</span><span class="who">You</span></div></div>`)
  }
  for (const w of p.words) {
    const done = c.edits.find(e => e.type === 'text' && e.route === w.route && e.before === w.inner)
    rows.push(`<div class="touch"><span class="box ${done ? 'on' : ''}">${done ? '✓' : ''}</span><div><b>Words: “${esc(w.title)}” says ${esc(w.figure)}</b><span class="cite">${esc(w.inner.replace(/<[^>]+>/g, '').slice(0, 140))}…</span><span class="goes"><a href="#/screen/${encodeURIComponent(w.route)}">Screen text →</a></span></div><div class="tail"><span class="pill blue">Words</span><span class="who">You · translator</span></div></div>`)
  }
  rows.push(`<div class="touch"><span class="box ${c.edits.some(e => e.type === 'question') ? 'on' : 'off'}">${c.edits.some(e => e.type === 'question') ? '✓' : ''}</span><div><b>An exception that needs something the return does not know?</b><span class="cite">If the law turns on something no federal fact says, add a question. The exception is written in the rule editor once it exists.</span>${mine ? '<span class="goes"><a href="#/question/new">Question builder →</a></span>' : ''}</div><div class="tail"><span class="pill warn">Rule + question</span><span class="who">You</span></div></div>`)
  rows.push(`<div class="touch off"><span class="box off"></span><div><b>Something the return cannot model yet?</b><span class="cite">A new federal fact, a carryforward, a collection: that is engineering's. Ask, and keep it out of this change so the rest can ship.</span>${mine ? '<span class="goes"><button class="btn quiet sm" data-act="new-request">Ask engineering →</button></span>' : ''}</div><div class="tail"><span class="pill">Out of scope</span><span class="who">Engineering</span></div></div>`)
  return `<div class="panel ai"><div class="panel-h ai-h"><span><span class="pill">Suggested by the tool · check it</span> What this touches</span><span class="cite">${p.cites.length ? 'from ' + p.cites.map(esc).join(', ') : 'no § in the citation'}${p.amounts.length ? ' · figures in the text: ' + p.amounts.map(a => money(a)).join(', ') : ''}</span></div>${rows.join('')}</div>`
}

// ---------------------------------------------------------------------------------------------
// 2. Values by tax year

export function viewYears () {
  const c = activeChange()
  const years = YEARS()
  const values = [...S.model.facts.values()].filter(f => f.kind === 'value')
  const draft = c ? draftFiles(c).files : null
  let section = null
  const rows = values.map(f => {
    const e = c?.edits.find(x => (x.type === 'schedule' || x.type === 'value') && x.path === f.path)
    const sched = e ? scheduleFromEdit(e, f) : f.schedule
    const head = f.section !== section ? `<tr class="group"><td colspan="${years.length + 2}">${esc(f.section || 'Values')}</td></tr>` : ''
    section = f.section
    const cells = years.map((y, i) => {
      const v = valueAt(sched, y)
      const set = sched.steps.some(s => s.year === y) || (i === 0 && !sched.steps.some(s => s.year <= y))
      const setBefore = f.schedule.steps.some(s => s.year === y) || (i === 0)
      const changed = e && (valueAt(f.schedule, y) !== v || set !== setBefore)
      const prev = i > 0 ? valueAt(sched, years[i - 1]) : null
      const ends = prev !== null && Number(prev) !== 0 && Number(v) === 0 && set
      const label = literalLabel(sched.tag, v)
      return `<td class="num yr ${changed ? 'edited' : ''}">${canEdit() ? `<input class="val ${changed ? 'edited' : ''} ${set ? 'set' : 'carry'}" data-act="year-cell" data-path="${esc(f.path)}" data-year="${y}" data-tag="${sched.tag}" value="${esc(set ? v : '')}" placeholder="${esc(set ? '' : '→ ' + label)}" aria-label="${esc(f.name)}, ${y}" title="${set ? 'Set for ' + y : 'Carried forward from the year before; type to set it'}">` : `<span class="${set ? 'set' : 'carry'}">${esc(label)}</span>`}${ends ? '<span class="ends">ends</span>' : ''}</td>`
    }).join('')
    return `${head}<tr class="${e ? 'changed' : ''}">
      <td><b>${esc(f.name)}</b>${e ? `<br><button class="btn quiet sm" data-act="year-undo" data-path="${esc(f.path)}">undo</button>` : ''}<br><span class="cite">${cite(f.citation)} · <a href="#/rule/${encodeURIComponent(f.path)}">${esc(shortName(f.name)).slice(0, 0)}used by Line ${esc(feedsLabel(f))}</a></span></td>
      ${cells}
      <td class="cite">${esc(f.literal.tag === 'Rational' ? 'rate, as a fraction' : f.literal.tag === 'Dollar' ? 'dollars' : f.literal.tag.toLowerCase())}</td>
    </tr>`
  }).join('')
  const eff = c?.law?.effectiveYear
  return `
    <div class="toolbar"><div><h1>Values by tax year</h1>
      <p class="sub" style="margin:0">A solid figure is set by a law for that year; a grey arrow carries the year before forward. ${canEdit() ? 'Type into a year to set it there; the source for the change is on the right.' : 'You are reviewing, so these are read-only.'} Behind each row is one rule on the return's tax year, so a season's site picks its own figure.</p></div>
      <div class="acts">${eff ? `<span class="pill warn">This change: ${yearLabel(eff)} and after</span>` : ''}<span class="pill">Site is built for ${S.data.siteYear}</span></div></div>
    <div class="split">
      <div>
        <table class="grid years"><thead><tr><th>Value</th>${years.map(y => `<th class="num">${y}${y === S.data.siteYear ? '<br><span class="cite">live site</span>' : y === eff ? '<br><span class="cite">this change</span>' : ''}</th>`).join('')}<th>Kind</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="cite">Rates are stored as fractions (575/10000 is 5.75%). Type a fraction or a decimal. To end a value after a year, set the next year to 0.</p>
      </div>
      <div class="stack">
        ${c ? sourcePanelFor(c) : '<div class="panel"><div class="panel-h">No draft open</div><div class="panel-b">Edit any value to start a change, or <button class="btn quiet sm" data-act="new-change">start one from the law</button>. It goes nowhere until it is reviewed and published.</div></div>'}
        ${seasonPanel(c)}
        <div class="panel" id="impact-panel">${impactBody()}</div>
        ${c ? `<div class="panel"><div class="panel-h">What the XML tab shows <span class="pill">engineer's view</span></div><div class="panel-b">${c.edits.filter(e => e.type === 'schedule').slice(0, 1).map(e => `<p class="cite" style="margin:0 0 6px"><code>${esc(e.path)}</code></p><pre class="xml">${esc(scheduleDerived({ tag: e.tag, base: e.base, steps: e.steps }))}</pre>`).join('') || '<p class="cite" style="margin:0">A value set for one year stays a plain figure. The first value set for a later year shows its rule here: a switch on the return\'s tax year, newest first.</p>'}</div></div>` : ''}
      </div>
    </div>`
}

function feedsLabel (f) { const l = S.model.usedBy.get(f.path) || []; const lines = [...new Set(l.map(p => S.model.facts.get(p)?.line?.label).filter(Boolean))]; return lines.join(', ') || '—' }

function sourcePanelFor (c) {
  const needs = c.edits.some(e => e.type === 'value' || e.type === 'schedule')
  return `<div class="panel"><div class="panel-h">Source for this change ${needs && !c.source?.citation ? '<span class="pill warn">Required</span>' : ''}</div><div class="panel-b">
    <div class="field-row"><label for="src-cite" style="font-size:13px">Where do the new values come from?</label><input type="text" id="src-cite" data-act="source" data-key="citation" value="${esc(c.source?.citation)}" style="width:100%" placeholder="e.g. 2026 Acts of Assembly, ch. 412"></div>
    <div class="field-row" style="margin:0"><label for="src-eff" style="font-size:13px">Effective for</label><input type="text" id="src-eff" data-act="source" data-key="effective" value="${esc(c.source?.effective)}" style="width:100%" placeholder="e.g. taxable years beginning on or after January 1, 2026"></div>
  </div></div>`
}

export function seasonPanel (c) {
  const y0 = S.data.siteYear
  const eff = c?.law?.effectiveYear || null
  const years = c ? [...new Set(c.edits.flatMap(e => e.type === 'schedule' ? e.steps.map(s => s.year) : []))].sort() : []
  const first = eff || years[0] || null
  return `<div class="panel"><div class="panel-h">When filers see it</div><div class="panel-b">
    <div class="seasons">
      <div class="season ${first && first <= y0 ? 'hot' : ''}"><b>${seasonOf(y0)} · live now</b>${first && first <= y0 ? 'This change is for the season that is live: publishing rebuilds the live site.' : `Filers doing ${y0} returns. ${c ? 'Unchanged by this change.' : ''}`}</div>
      <div class="season ${first && first > y0 ? 'hot' : ''}"><b>${first && first > y0 ? seasonOf(first) : seasonOf(y0 + 1)}</b>${first && first > y0 ? `Built from the ${first} column. This change goes in that build, whenever it is approved.` : 'Built from the next column when the season turns.'}</div>
    </div>
    <p class="cite" style="margin:8px 0 0">The site's year is <code>/taxYear</code> in <code>constants.xml</code> (${y0}). A value set for a later year is a rule on it, so no build step has to know about years.</p>
  </div></div>`
}

/** The schedule a draft edit means for a fact (the published one with the edit applied). */
function scheduleFromEdit (e, f) {
  if (e.type === 'schedule') return { tag: e.tag, base: e.base, steps: e.steps }
  return { tag: f.schedule.tag, base: e.to, steps: f.schedule.steps }
}

export async function yearCell (t) {
  const f = S.model.facts.get(t.dataset.path)
  const year = Number(t.dataset.year)
  let v = t.value.trim()
  const { validAmount, normalizeAmount } = await import('./app.js')
  if (v && !validAmount(f.schedule.tag, v)) { toast('That is not a number this value can hold.', true); render(); return }
  if (v) v = normalizeAmount(f.schedule.tag, v)
  const c = await ensureDraft()
  if (!c) { render(); return }
  const prev = c.edits.find(x => (x.type === 'schedule' || x.type === 'value') && x.path === f.path)
  const cur = prev ? scheduleFromEdit(prev, f) : f.schedule
  const steps = cur.steps.filter(s => s.year !== year)
  let base = cur.base
  const firstYear = YEARS()[0]
  if (v === '') { /* cleared: carry forward */ } else if (year <= firstYear && !steps.some(s => s.year <= year)) base = v
  else steps.push({ year, value: v })
  c.edits = c.edits.filter(x => !((x.type === 'schedule' || x.type === 'value') && x.path === f.path))
  const same = base === f.schedule.base && steps.length === f.schedule.steps.length && steps.every(s => f.schedule.steps.some(o => o.year === s.year && o.value === s.value))
  if (!same) {
    if (!steps.length && !f.schedule.steps.length) c.edits.push({ type: 'value', file: f.file, path: f.path, from: f.schedule.base, to: base })
    else c.edits.push({ type: 'schedule', file: f.file, path: f.path, before: f.derivedText, tag: f.schedule.tag, base, steps: steps.sort((a, b) => b.year - a.year), fromBase: f.schedule.base, fromSteps: f.schedule.steps })
  }
  saveSoon(c)
  render()
}

function impactBody () { const { impactPanelBody } = S.hooks; return impactPanelBody() }

// ---------------------------------------------------------------------------------------------
// 3. The question builder

const ANSWERS = [['boolean', 'Yes / No', 'a true-or-false fact the rule editor can test'], ['dollar', 'Dollar amount', 'an amount it can add or compare'], ['day', 'Date', 'a date'], ['int', 'Number', 'a whole number']]

export function viewQuestions () {
  const c = activeChange()
  const flow = (c ? draftFiles(c).files.flow : S.data.flow) || ''
  const ps = pages(flow)
  const facts = [...S.model.facts.values()].filter(f => f.kind === 'asked')
  const draftQ = new Set(c?.edits.filter(e => e.type === 'question').map(e => e.path) || [])
  const rows = ps.flatMap(p => p.questions.map(q => `<tr class="${draftQ.has(q.path) ? 'changed' : ''}"><td><b>${esc(q.question)}</b><br><code class="cite">${esc(q.path)}</code></td><td>${esc(humanize(q.type))}</td><td><a href="#/screen/${encodeURIComponent(p.route)}">${esc(p.title)}</a>${q.screen?.condition && q.screen.condition.path !== '/vaIsResident' ? `<br><span class="cite">only when ${esc(chipName(q.screen.condition.path))} is yes</span>` : ''}</td><td>${draftQ.has(q.path) ? `<span class="pill warn">In your draft</span> <a class="btn quiet sm" href="#/question/edit/${encodeURIComponent(q.path)}">Edit</a>` : facts.find(f => f.path === q.path) ? '<span class="pill ok">Published</span>' : '<span class="pill">On the screen only</span>'}</td></tr>`))
  return `<div class="toolbar"><div><h1>Questions asked of the filer</h1><p class="sub" style="margin:0">Everything the Virginia screens ask that no federal fact answers. ${canEdit() ? 'A new rule that needs something the return does not know starts here.' : ''}</p></div>${canEdit() ? '<div class="acts"><a class="btn" href="#/question/new">+ Ask the filer something new</a></div>' : ''}</div>
    <table class="grid"><thead><tr><th>Question</th><th>Answer</th><th>Screen</th><th></th></tr></thead><tbody>${rows.join('') || '<tr><td colspan="4" class="muted">No questions.</td></tr>'}</tbody></table>`
}

function chipName (path) { const d = S.model.facts.get(path); return d ? shortName(d.name) : path }

const qState = {}
export function viewQuestionBuilder (arg) {
  if (!canEdit()) return '<p>Reviewers review; switch to an author or engineer to add a question.</p>'
  if (S.data.flow === undefined) return `<p class="err">The flow file is not beside the rules (${esc(S.data.paths.flow)}), so questions cannot be added here.</p>`
  const c = activeChange()
  const editing = arg && arg.startsWith('edit/') ? decodeURIComponent(arg.slice(5)) : null
  const existing = editing ? c?.edits.find(e => e.type === 'question' && e.path === editing) : null
  const ps = pages(S.data.flow)
  const qpages = ps.filter(p => p.questions.length && !/correct/.test(p.route))
  const st = qState.cur ??= existing ? { ...existing } : { question: '', answerType: 'boolean', condition: '/vaIsResident', route: qpages[qpages.length - 1]?.route || ps[0].route, placement: 'follow-up', help: '', law: c?.law?.citation || '', yes: 'Yes', no: 'No', pageTitle: '', pageRoute: '' }
  if (existing && qState.for !== editing) { Object.assign(st, existing); qState.for = editing }
  const path = st.path || pathFor(st.question)
  const askedFacts = [...S.model.facts.values()].filter(f => f.kind === 'asked' && f.writable?.type === 'boolean')
  const lint = lintQuestion(st.question)
  const page = ps.find(p => p.route === st.route) || ps[0]
  const preview = renderPagePreview(previewFlow(st, path), st.placement === 'own-screen' ? st.pageRoute || '/your-taxes/virginia/virginia-new' : st.route, S.data.flow)
  const files = [
    [S.data.paths.virginia, `<b>+ 1 fact</b> <code>${esc(path)}</code>, writable, ${esc(ANSWERS.find(a => a[0] === st.answerType)?.[1].toLowerCase() || '')}, with the question as its name and the law as its description`],
    [S.data.paths.flow, st.placement === 'own-screen' ? `<b>+ 1 page</b> after “${esc(page?.title || '')}”, with the question, and the “Question N of M” counts renumbered` : `<b>+ 1 screen block</b> on “${esc(page?.title || '')}”, <code>condition="${esc(st.condition)}"</code>, with the <code>&lt;fg-set&gt;</code> and the help text`],
    ['flow_en.yaml', `<b>+ ${questionKeys({ ...st, path }).length} keys</b> when the site is next built, generated from the English`],
    [S.data.paths.es, `<b>+ ${questionKeys({ ...st, path }).length} keys</b>, flagged “needs translation”, holding the English until the translator replaces it (on the change page)`],
    [S.data.paths.examples, `<b>+ 1 starting answer</b> (${st.answerType === 'boolean' ? 'No' : '0'}) so every worked example still runs; an example that says otherwise sets it`],
  ]
  return `
    <div class="crumb"><a href="#/questions">Questions asked</a> › ${existing ? 'Edit' : 'New'}</div>
    <h1>Ask the filer something new</h1>
    <p class="sub">Five answers. The tool writes the fact, the screen and the words. ${c ? `Goes into draft #${c.id}.` : 'Saving starts a draft.'}</p>
    <div class="qb">
      <div>
        <div class="field-row"><label for="q-text"><span class="step-n">1</span>What do you need to know?</label><input type="text" id="q-text" data-q="question" value="${esc(st.question)}" style="width:100%" placeholder="Is the person this account is for someone with a disability?"><div class="lint">${lint.map(l => `<span class="${l.ok ? '' : 'w'}">${esc(l.text)}</span>`).join('')}</div><div class="hint">Name in the code: <code>${esc(path)}</code> <button class="btn quiet sm" data-act="q-path">change</button></div></div>
        <div class="field-row"><span class="lbl"><span class="step-n">2</span>What kind of answer?</span>${ANSWERS.map(([k, l, why]) => `<button type="button" class="choice ${st.answerType === k ? 'on' : ''}" data-act="q-answer" data-value="${k}" title="${esc(why)}">${l}</button>`).join('')}<div class="hint">${esc(ANSWERS.find(a => a[0] === st.answerType)?.[2] || '')}.</div>${st.answerType === 'boolean' ? `<div style="display:flex;gap:8px;margin-top:6px"><input type="text" data-q="yes" value="${esc(st.yes)}" style="width:160px" aria-label="Wording for yes"><input type="text" data-q="no" value="${esc(st.no)}" style="width:200px" aria-label="Wording for no"></div>` : ''}</div>
        <div class="field-row"><label for="q-cond"><span class="step-n">3</span>Who gets asked?</label><select id="q-cond" data-q="condition" style="width:100%"><option value="/vaIsResident" ${st.condition === '/vaIsResident' ? 'selected' : ''}>Every Virginia resident</option>${askedFacts.map(f => `<option value="${esc(f.path)}" ${st.condition === f.path ? 'selected' : ''}>Only filers who answered Yes to: ${esc(f.name)}</option>`).join('')}</select><div class="hint">Everyone else never sees it. The same choice becomes the screen's condition and keeps a rule from reading an answer that was never given.</div></div>
        <div class="field-row"><label for="q-route"><span class="step-n">4</span>Where in the flow?</label><select id="q-route" data-q="route" style="width:100%">${ps.filter(p => !/correct/.test(p.route) || p.route === st.route).map(p => `<option value="${esc(p.route)}" ${st.route === p.route ? 'selected' : ''}>${esc(p.title)}${p.questions.length ? ` (${p.questions.length} question${p.questions.length > 1 ? 's' : ''})` : ''}</option>`).join('')}</select>
          <div style="margin-top:6px"><button type="button" class="choice ${st.placement === 'follow-up' ? 'on' : ''}" data-act="q-place" data-value="follow-up">Follow-up on that screen</button><button type="button" class="choice ${st.placement === 'own-screen' ? 'on' : ''}" data-act="q-place" data-value="own-screen">Its own screen, right after it</button></div>
          ${st.placement === 'own-screen' ? `<div style="display:grid;gap:6px;margin-top:6px"><input type="text" data-q="pageTitle" value="${esc(st.pageTitle)}" placeholder="Screen title, e.g. Account beneficiary" aria-label="Screen title"><input type="text" data-q="pageRoute" value="${esc(st.pageRoute)}" placeholder="/your-taxes/virginia/virginia-beneficiary" aria-label="Route"></div><div class="hint">A new screen joins the “Question N of M” count; the others are renumbered, in English and Spanish.</div>` : '<div class="hint">A follow-up keeps “Question N of M” as it is.</div>'}</div>
        <div class="field-row"><label for="q-help"><span class="step-n">5</span>Help the filer</label><textarea id="q-help" data-q="help" placeholder="Shown under the question. Say what the answer changes, and cite the law.">${esc(st.help)}</textarea><input type="text" data-q="law" value="${esc(st.law)}" style="width:100%;margin-top:6px" placeholder="The law this comes from (becomes the fact's description)" aria-label="The law"></div>
        <div class="add-row"><button class="btn" data-act="q-save">${existing ? 'Update in my draft' : 'Put in my draft'}</button>${existing ? `<button class="btn danger" data-act="q-remove" data-path="${esc(existing.path)}">Remove from draft</button>` : ''}<a class="btn quiet" href="#/questions">Cancel</a></div>
      </div>
      <div class="stack">
        <div><div class="cap">Preview · as the filer sees it</div>${preview}<p class="cite" style="margin:6px 0 0">A rendering of the page by the workbench; dashed outline marks what this adds. The site build is the real page.</p></div>
        <div class="panel"><div class="panel-h">Files it writes <span class="pill">engineer's view</span></div><div class="panel-b files">${files.map(([f, w]) => `<div><code>${esc(f.split('/').pop())}</code><span class="what">${w}</span></div>`).join('')}</div></div>
      </div>
    </div>`
}

function pathFor (q) {
  const words = String(q || '').replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(w => w.length > 2 && !/^(the|you|your|did|how|much|what|that|were|from|this|with|have|for|someone|any|are|was|does)$/i.test(w)).slice(0, 4)
  return '/va' + (words.map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('') || 'NewQuestion')
}

function lintQuestion (q) {
  const s = String(q || '').trim()
  const words = s ? s.split(/\s+/).length : 0
  const out = [{ ok: (s.match(/\?/g) || []).length <= 1 && !/\band\b.*\?.*\?/.test(s), text: 'One question' }, { ok: words > 0 && words <= 20, text: `${words} word${words === 1 ? '' : 's'}` }, { ok: !s || /\byou\b|\byour\b/i.test(s) || /^(is|are|does|do|did|was|were|how)\b/i.test(s), text: 'Spoken to “you”' }]
  const jargon = ['beneficiary', 'taxpayer', 'pursuant', 'subdivision', 'designated', 'aforementioned']
  const hit = jargon.find(j => new RegExp(`\\b${j}\\b`, 'i').test(s))
  out.push(hit ? { ok: false, text: `“${hit}” is a legal word; the style guide prefers a plain one` } : { ok: true, text: 'No jargon' })
  return out
}

function previewFlow (st, path) {
  try {
    const { applyChange } = S.hooks
    const e = { ...st, type: 'question', path, default: st.answerType === 'boolean' ? false : 0, pageRoute: st.pageRoute || '/your-taxes/virginia/virginia-new', pageTitle: st.pageTitle || st.question }
    return applyChange({ virginia: S.data.virginia, localities: S.data.localities, flow: S.data.flow, es: undefined }, { id: activeChange()?.id ?? 0, edits: [e], spanish: {} }).flow
  } catch (x) { return S.data.flow }
}

/** A page of the flow, drawn as the filer would see it. Elements not on `baseFlow`'s page are outlined. */
export function renderPagePreview (flow, route, baseFlow) {
  let page
  try { page = pages(flow).find(p => p.route === route) } catch (e) { return `<div class="scr"><div class="scr-b err">${esc(e.message)}</div></div>` }
  if (!page) return `<div class="scr"><div class="scr-b muted">No page ${esc(route)}.</div></div>`
  let baseKeys = new Set()
  let baseQ = new Set()
  if (baseFlow) { try { const b = pages(baseFlow).find(p => p.route === route); baseKeys = new Set(b?.texts.map(t => t.key)); baseQ = new Set(b?.questions.map(q => q.path)) } catch { /* no base */ } }
  const show = html => esc(html).replace(/&lt;fg-show path=&quot;([^&]+)&quot;\/&gt;/g, (m, p) => `<span class="fg">${esc(demoValue(p))}</span>`).replace(/&lt;(\/?)(strong|em|span|b|i|code|br)(?: [^&]*)?&gt;/g, '<$1$2>').replace(/&lt;a [^&]*&gt;/g, '<u>').replace(/&lt;\/a&gt;/g, '</u>')
  const parts = []
  for (const sc of page.screens) {
    const items = []
    for (const t of sc.texts) {
      const isNew = baseFlow && !baseKeys.has(t.key)
      const tag = t.tag === 'h2' ? 'h2' : t.tag === 'h3' ? 'h3' : 'p'
      items.push(`<${tag} class="${/va-eyebrow/.test(t.class) ? 'eyebrow' : ''} ${isNew ? 'new' : ''}">${show(t.inner)}</${tag}>`)
    }
    for (const q of sc.questions) {
      const isNew = baseFlow && !baseQ.has(q.path)
      const ctl = q.type === 'boolean' ? '<div class="radio"><i class="on"></i> Yes</div><div class="radio"><i></i> No</div>' : q.type === 'dollar' ? '<span class="box-in">$ 0</span>' : q.type === 'date' ? '<span class="box-in">mm / dd / yyyy</span>' : q.type === 'enum' ? '<span class="box-in">Choose ▾</span>' : '<span class="box-in">0</span>'
      items.push(`<div class="q ${isNew ? 'new' : ''}"><div class="qlabel">${esc(q.question)}</div>${ctl}</div>`)
    }
    const cond = sc.condition && sc.condition.path !== '/vaIsResident' ? `<div class="cond">shown when ${esc(chipName(sc.condition.path))} is ${sc.condition.operator === 'isFalse' ? 'no' : 'yes'}</div>` : ''
    parts.push(`<div class="screen">${cond}${items.join('')}</div>`)
  }
  return `<div class="scr"><div class="scr-top"><span>Commonwealth of Virginia · File your Virginia return</span><i>Demonstration</i></div><div class="scr-b"><div class="ptitle">${esc(page.title)}</div>${parts.join('')}<span class="go">Continue</span></div></div>`
}

function demoValue (p) {
  const f = S.model.facts.get(p)
  if (f?.kind === 'value') return literalLabel(f.literal.tag, f.literal.value)
  if (p === '/taxYear') return String(S.year || S.data.siteYear)
  if (p === '/primaryFiler/firstName') return 'Morgan'
  if (/postalCode/.test(p)) return '22901'
  return f ? `[${shortName(f.name)}]` : `[${p.split('/').pop()}]`
}

export async function questionAct (act, b) {
  const st = qState.cur
  if (!st) return
  if (act === 'q-answer') { st.answerType = b.dataset.value; render(); return }
  if (act === 'q-place') { st.placement = b.dataset.value; render(); return }
  if (act === 'q-path') { const p = await askText('Name in the code', 'A path like /vaSomethingNew', st.path || pathFor(st.question)); if (p) st.path = p; render(); return }
  if (act === 'q-remove') { const c = activeChange(); if (!c) return; c.edits = c.edits.filter(e => !(e.type === 'question' && e.path === b.dataset.path)); c.edits = c.edits.filter(e => !(e.type === 'rule' && e.derived.includes(`path="${b.dataset.path}"`))); delete qState.cur; delete qState.for; saveSoon(c); toast('Removed from your draft, with any rule that used it.'); location.hash = '#/questions'; return }
  if (act === 'q-save') {
    if (!st.question.trim()) { toast('Write the question first.', true); return }
    if (st.placement === 'own-screen' && !/^\/your-taxes\/virginia\/[a-z0-9-]+$/.test(st.pageRoute)) { toast('Give the new screen a route like /your-taxes/virginia/virginia-something.', true); return }
    if (!st.law.trim()) { toast('Say which law this question comes from.', true); return }
    const path = st.path || pathFor(st.question)
    if (S.model.facts.has(path) && !activeChange()?.edits.some(e => e.type === 'question' && e.path === path)) { toast(`${path} already exists. Change the name in the code.`, true); return }
    const c = await ensureDraft()
    if (!c) return
    const e = { type: 'question', path, name: st.name || st.question, law: st.law, answerType: st.answerType, question: st.question.trim(), help: st.help.trim(), condition: st.condition, route: st.route, placement: st.placement, pageTitle: st.pageTitle, pageRoute: st.placement === 'own-screen' ? st.pageRoute : '', yes: st.yes || 'Yes', no: st.no || 'No', default: st.answerType === 'boolean' ? false : st.answerType === 'day' ? '' : 0 }
    if (e.default === '') delete e.default
    c.edits = c.edits.filter(x => !(x.type === 'question' && x.path === (qState.for || path)))
    c.edits.push(e)
    delete qState.cur; delete qState.for
    saveSoon(c)
    toast(`${path} is in your draft. It is in the rule editor's picker now as “Asked”.`)
    location.hash = '#/questions'
  }
}

export function questionInput (t) {
  const st = qState.cur
  if (!st) return
  st[t.dataset.q] = t.value
  if (t.dataset.q === 'question' && !st.path) { /* path follows the question */ }
  if (t.tagName === 'SELECT' || t.dataset.q === 'question') render()
  else { const pv = $('.qb .scr'); if (pv) pv.outerHTML = renderPagePreview(previewFlow(st, st.path || pathFor(st.question)), st.placement === 'own-screen' ? st.pageRoute || '/your-taxes/virginia/virginia-new' : st.route, S.data.flow) }
}

export function clearQuestionState () { delete qState.cur; delete qState.for }

// ---------------------------------------------------------------------------------------------
// 4. Screens and their words

export function viewScreens () {
  if (S.data.flow === undefined) return `<p class="err">The flow file is not beside the rules (${esc(S.data.paths.flow)}).</p>`
  const c = activeChange()
  const es = esMap()
  const ps = pages(S.data.flow)
  const rows = ps.map(p => {
    const keys = [...p.texts.map(t => `${p.route}.${t.key}`), ...p.questions.map(q => `${p.route}.${q.key}.question`)]
    const have = keys.filter(k => es.has(k)).length
    const edits = c?.edits.filter(e => (e.type === 'text' && e.route === p.route) || (e.type === 'question' && (e.route === p.route || e.pageRoute === p.route))).length || 0
    return `<tr class="${edits ? 'changed' : ''}"><td><a href="#/screen/${encodeURIComponent(p.route)}"><b>${esc(p.title)}</b></a><br><code class="cite">${esc(p.route)}</code></td><td class="num">${p.texts.length}</td><td class="num">${p.questions.length}</td><td>${have === keys.length ? `<span class="res-ok">${have} / ${keys.length}</span>` : `<span class="res-bad">${have} / ${keys.length}</span>`}</td><td>${edits ? `<span class="pill warn">${edits} edit${edits > 1 ? 's' : ''} in your draft</span>` : ''}</td></tr>`
  })
  return `<div class="toolbar"><div><h1>Screens filers see</h1><p class="sub" style="margin:0">The Virginia pages of the flow, with their English and how much of it has Spanish. Open one to change its words.</p></div></div>
    <table class="grid"><thead><tr><th>Screen</th><th class="num">Texts</th><th class="num">Questions</th><th>Spanish</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table>`
}

export function viewScreen (route) {
  if (S.data.flow === undefined) return `<p class="err">The flow file is not beside the rules.</p>`
  const c = activeChange()
  const files = c ? draftFiles(c).files : published()
  const page = pages(files.flow).find(p => p.route === route)
  const basePage = pages(S.data.flow).find(p => p.route === route)
  if (!page) return `<p>No screen ${esc(route)}. <a href="#/screens">Screens</a></p>`
  const es = esMap()
  let draftEs = new Map()
  try { draftEs = parseEs(files.es || '').keys } catch { /* shown as missing */ }
  const values = [...S.model.facts.values()].filter(f => f.kind === 'value' && f.literal.tag === 'Dollar')
  const items = page.texts.map((t, i) => {
    const edit = c?.edits.find(e => e.type === 'text' && e.route === route && e.after === t.inner)
    const baseInner = edit ? edit.before : t.inner
    const key = `${route}.${t.key}`
    const esNow = draftEs.get(key)?.value ?? es.get(key)?.value
    const stale = edit && !(c.spanish || {})[`${route}|${t.key}`]
    const quoted = amountsIn(t.inner).map(a => ({ ...a, fact: values.find(f => Number(f.literal.value) === a.value) })).filter(a => a.fact && !/fg-show/.test(t.inner.slice(Math.max(0, a.index - 40), a.index)))
    return `<div class="word ${edit ? 'edited' : ''}">
      <div class="lang"><div class="lang-h"><span>English <span class="cite">&lt;${esc(t.tag)}&gt;${/va-eyebrow/.test(t.class) ? ' · eyebrow' : ''}</span></span><span class="cite">${esc(t.key)}</span></div><div class="lang-b">
        ${canEdit() && !/va-eyebrow/.test(t.class) ? `<textarea data-act="text-edit" data-route="${esc(route)}" data-tag="${esc(t.tag)}" data-before="${esc(baseInner)}" aria-label="English">${esc(t.inner)}</textarea>` : `<div class="ed ro">${esc(t.inner)}</div>`}
        ${quoted.length ? `<div class="add-row">${quoted.map(a => `<button class="btn quiet sm" data-act="bind" data-route="${esc(route)}" data-tag="${esc(t.tag)}" data-before="${esc(baseInner)}" data-inner="${esc(t.inner)}" data-figure="${esc(a.text)}" data-path="${esc(a.fact.path)}" data-index="${a.index}" title="Replace the typed figure with the value itself, so the next change never leaves it stale">Make ${esc(a.text)} live: ${esc(shortName(a.fact.name))}</button>`).join('')}</div>` : ''}
        ${edit ? `<div class="cite">Was: ${esc(edit.before)} <button class="btn quiet sm" data-act="text-undo" data-route="${esc(route)}" data-before="${esc(edit.before)}">undo</button></div>` : ''}
      </div></div>
      <div class="lang"><div class="lang-h"><span>Español ${esNow === undefined ? '<span class="pill bad">Missing</span>' : stale ? '<span class="pill warn">Out of date</span>' : '<span class="pill ok">In</span>'}</span><span class="cite">${esc(S.data.paths.es.split('/').pop())}</span></div><div class="lang-b"><div class="${stale ? 'stale' : 'ed ro'}">${esc(esNow ?? '—')}</div>${stale ? `<p class="cite" style="margin:6px 0 0">The English changed. The Spanish is carried to the new key and marked; the translator replaces it on the <a href="#/change/${c.id}">change page</a>.</p>` : ''}</div></div>
    </div>`
  })
  const qs = page.questions.map(q => `<div class="word"><div class="lang"><div class="lang-h"><span>Question <span class="cite">${esc(q.path)}</span></span></div><div class="lang-b"><div class="ed ro">${esc(q.question)}</div><p class="cite" style="margin:6px 0 0">${basePage?.questions.some(x => x.path === q.path) ? 'Question wording and its options are edited in the flow by engineering.' : `Added by your draft. <a href="#/question/edit/${encodeURIComponent(q.path)}">Edit it</a>.`}</p></div></div><div class="lang"><div class="lang-h"><span>Español ${draftEs.get(`${route}.${q.key}.question`) || es.get(`${route}.${q.key}.question`) ? '<span class="pill ok">In</span>' : '<span class="pill bad">Missing</span>'}</span></div><div class="lang-b"><div class="ed ro">${esc(draftEs.get(`${route}.${q.key}.question`)?.value ?? es.get(`${route}.${q.key}.question`)?.value ?? '—')}</div></div></div></div>`)
  // Everywhere a value quoted on this page is typed elsewhere.
  const quotedPaths = [...new Set(page.texts.flatMap(t => amountsIn(t.inner).map(a => values.find(f => Number(f.literal.value) === a.value)?.path).filter(Boolean)))]
  const elsewhere = quotedPaths.flatMap(p => { const f = S.model.facts.get(p); const needle = money(f.literal.value); return pages(files.flow).flatMap(pg => pg.texts.filter(t => t.inner.includes(needle)).map(t => ({ path: p, name: shortName(f.name), route: pg.route, title: pg.title, bound: /fg-show[^>]*path="[^"]*"/.test(t.inner.slice(Math.max(0, t.inner.indexOf(needle) - 60), t.inner.indexOf(needle))) }))) })
  return `
    <div class="crumb"><a href="#/screens">Screens filers see</a> › ${esc(page.title)}</div>
    <div class="toolbar"><div><h1>${esc(page.title)}</h1><p class="sub" style="margin:0"><code>${esc(route)}</code> · ${page.texts.length} texts · ${page.questions.length} questions${page.screens[0]?.condition ? ` · shown when ${esc(chipName(page.screens[0].condition.path))}` : ''}</p></div><div class="acts">${canEdit() ? `<a class="btn sec sm" href="#/question/new">+ Add a question here</a>` : ''}</div></div>
    <div class="split">
      <div class="stack">${items.join('')}${qs.join('')}</div>
      <div class="stack">
        <div>${renderPagePreview(files.flow, route, S.data.flow)}</div>
        ${elsewhere.length ? `<div class="panel"><div class="panel-h">Everywhere these figures are written</div><div class="panel-b uses">${elsewhere.map(x => `<div><span>${esc(x.title)}: ${esc(x.name)}</span>${x.bound ? '<span class="pill ok">live value</span>' : `<span class="pill warn">typed · <a href="#/screen/${encodeURIComponent(x.route)}">bind it</a></span>`}</div>`).join('')}<p class="cite" style="margin:8px 0 0">A typed figure goes stale when the value changes; a live one is <code>&lt;fg-show&gt;</code> of the value and never does.</p></div></div>` : ''}
        <div class="panel" id="impact-panel">${impactBody()}</div>
      </div>
    </div>`
}

export async function textEdit (t) {
  const after = t.value.trim()
  const before = t.dataset.before
  if (!after) { toast('A paragraph cannot be empty.', true); render(); return }
  const c = await ensureDraft()
  if (!c) { render(); return }
  c.edits = c.edits.filter(e => !(e.type === 'text' && e.route === t.dataset.route && e.before === before))
  if (after !== before.trim()) c.edits.push({ type: 'text', route: t.dataset.route, tag: t.dataset.tag, before, after })
  saveSoon(c)
  render()
}

export async function bindFigure (b) {
  const c = await ensureDraft()
  if (!c) return
  const inner = b.dataset.inner
  const i = Number(b.dataset.index)
  const after = inner.slice(0, i) + `<fg-show path="${b.dataset.path}"/>` + inner.slice(i + b.dataset.figure.length)
  c.edits = c.edits.filter(e => !(e.type === 'text' && e.route === b.dataset.route && e.before === b.dataset.before))
  if (after !== b.dataset.before) c.edits.push({ type: 'text', route: b.dataset.route, tag: b.dataset.tag, before: b.dataset.before, after })
  saveSoon(c)
  toast('The figure is now the value itself. The Spanish needs the same change; the translator sees it.')
  render()
}

// ---------------------------------------------------------------------------------------------
// 5. The footprint of a change

export function viewImpact (id) {
  const c = S.data.changes.find(x => x.id === Number(id))
  if (!c) return '<p>No such change.</p>'
  const I = S.impact
  const files = (() => { try { return { files: S.hooks.applyChange(published(), c) } } catch (e) { return { files: published(), conflict: e.message } } })()
  const examples = applyExampleEdits(S.data.examplesFile.examples, c)
  const counts = { value: 0, schedule: 0, rule: 0, question: 0, text: 0, remove: 0 }
  for (const e of c.edits) counts[e.type === 'remove-question' ? 'remove' : e.type] = (counts[e.type === 'remove-question' ? 'remove' : e.type] || 0) + 1
  const needs = translationNeeds(c, published())
  const untranslated = needs.filter(n => !n.es).length
  const routes = [...new Set(c.edits.flatMap(e => e.type === 'text' ? [e.route] : e.type === 'question' ? [e.placement === 'own-screen' ? e.pageRoute : e.route] : []))]
  const draftRun = S.impactFor?.id === c.id ? S.impactFor.run : null
  const diffs = draftRun && I?.base ? differences(I.base, draftRun, examples) : null
  const lineFact = p => S.model.facts.get(p)
  const rows = (diffs || []).map(d => `<tr class="changed"><td><b>${esc(d.ex.title)}</b><br><span class="cite">${esc(d.ex.household)}</span></td><td>${d.lines.map(p => `${esc(lineName(p))}: ${esc(formatResult(d.before[p]))} → <b>${esc(formatResult(d.after[p]))}</b>`).join('<br>') || '<span class="cite">new example</span>'}</td><td>${draftRun.results?.[d.ex.id]?.pass ? '<span class="pill ok">matches what the law says</span>' : '<span class="pill warn">Confirm</span>'}</td></tr>`)
  void lineFact
  return `
    <div class="crumb"><a href="#/changes">Changes</a> › <a href="#/change/${c.id}">#${c.id}</a> › What it touches</div>
    <h1>${esc(c.title)}</h1>
    <p class="sub">${c.law?.effectiveYear ? `Tax year ${c.law.effectiveYear} and after · ` : ''}${c.edits.length} part${c.edits.length === 1 ? '' : 's'} · ${c.law ? `opened from ${esc(c.law.kind || 'the law')}` : 'opened by hand'} on ${new Date(c.created).toLocaleDateString()}</p>
    <div class="kpis">
      <div class="kpi ${counts.value + counts.schedule ? 'warn' : ''}"><b>${counts.value + counts.schedule}</b><span>value${counts.value + counts.schedule === 1 ? '' : 's'} changed</span></div>
      <div class="kpi ${counts.rule ? 'warn' : ''}"><b>${counts.rule}</b><span>rule${counts.rule === 1 ? '' : 's'} changed</span></div>
      <div class="kpi ${counts.question ? 'warn' : ''}"><b>${counts.question}</b><span>new question${counts.question === 1 ? '' : 's'}, ${routes.length} screen${routes.length === 1 ? '' : 's'}</span></div>
      <div class="kpi ${untranslated ? 'bad' : needs.length ? 'ok' : ''}"><b>${needs.length}</b><span>string${needs.length === 1 ? '' : 's'} changed, ${untranslated} await Spanish</span></div>
      <div class="kpi ${diffs?.length ? 'warn' : ''}"><b>${diffs ? `${diffs.length} / ${examples.length}` : '…'}</b><span>worked examples differ</span></div>
      <div class="kpi ok"><b>0</b><span>federal files touched</span></div>
    </div>
    ${files.conflict ? `<p class="err">${esc(files.conflict)}</p>` : ''}
    <h2>Worked examples that move</h2>
    ${diffs ? (rows.length ? `<table class="grid"><thead><tr><th>Example</th><th>Lines</th><th>Expected?</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : '<p class="res-ok">No example gets a different result.</p>') : '<p class="muted"><span class="spin"></span> Running every example with this change…</p>'}
    <p class="cite">All ${examples.length} run in the browser. The server reruns them, and the independent model, before anything is written.</p>
    ${routes.length ? `<h2>Before and after</h2><div class="sbs">${routes.slice(0, 2).map(r => `<div><div class="cap">Live · ${S.data.siteYear} season</div>${renderPagePreview(S.data.flow, r, null)}</div><div><div class="cap">With this change${c.law?.effectiveYear ? ` · ${c.law.effectiveYear} season` : ''}</div>${renderPagePreview(files.files.flow, r, S.data.flow)}</div>`).join('')}</div>` : ''}`
}

export async function loadImpactRun (id) {
  const c = S.data.changes.find(x => x.id === Number(id))
  if (!c) return
  // Once per version of the change: the page renders itself when the run lands, and must not ask again.
  const key = `${c.id}:${c.updated}:${S.data.virginia.length}`
  if (S.impactFor?.key === key) return
  const { run } = S.hooks
  let files
  try { files = S.hooks.applyChange(published(), c) } catch { return }
  const examples = applyExampleEdits(S.data.examplesFile.examples, c)
  const baseline = applyBaselineEdits(S.data.examplesFile.baseline, c)
  if (!S.impact?.base) await computeImpact()
  const r = await run(files, examples, baseline)
  S.impactFor = { id: c.id, key, run: r }
  if (S.route[0] === 'change' && S.route[2] === 'impact' && Number(S.route[1]) === c.id) render()
}

// ---------------------------------------------------------------------------------------------
// 6. The publish rail and the Spanish panel, on the change page

export function railFor (c, v) {
  const req = v?.required || ['policy', 'engineering', ...(c.edits.some(e => e.type === 'question' || e.type === 'text') ? ['translation'] : [])]
  const has = k => c.approvals.some(a => a.kind === k)
  const n = req.filter(has).length
  const checksOk = v && v.ok
  const stage = (cls, title, body) => `<div class="stage ${cls}"><b>${title}</b>${body}</div>`
  const st = c.status
  const y = v?.season?.effectiveYear || c.law?.effectiveYear
  const y0 = v?.season?.siteYear || S.data.siteYear
  return `<div class="rail">
    ${stage(st === 'draft' ? 'now' : 'done', 'Draft', `${esc(personName(c.author))}, ${c.edits.length} part${c.edits.length === 1 ? '' : 's'}${c.law ? ', from the law' : ''}`)}
    ${st === 'published' ? stage('done', 'Checks', `<ul><li>${c.published?.examples ?? '?'} examples passed at publish</li><li>Federal unchanged</li></ul>`) : stage(!v ? 'todo' : checksOk ? 'done' : st === 'draft' ? 'todo' : 'now', 'Checks', v && !v.conflict ? `<ul>${[v.error ? null : 'Rules load, no cycles', v.failing?.length ? `${v.count - v.failing.length} / ${v.count} examples` : `${v.count} / ${v.count} examples`, 'Federal unchanged', v.flowSchema && c.edits.some(e => e.type === 'question' || e.type === 'text') ? 'Flow fits its schema' : null, v.translations?.length ? (v.untranslated?.length ? `${v.untranslated.length} string${v.untranslated.length === 1 ? '' : 's'} await Spanish` : 'Spanish in') : null].filter(Boolean).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : v?.conflict ? `<ul><li>${esc(v.conflict)}</li></ul>` : '')}
    ${stage(st === 'approved' || st === 'published' ? 'done' : st === 'review' ? 'now' : 'todo', `Approvals ${n} / ${req.length}`, `<ul>${req.map(k => `<li>${{ policy: 'Policy', engineering: 'Engineering', translation: 'Spanish' }[k]}${has(k) ? ' ✓' : ''}</li>`).join('')}</ul>`)}
    ${stage(st === 'published' ? 'done' : st === 'approved' ? 'now' : 'todo', S.data.tools?.gitPr ? 'Pull request' : 'Publish', st === 'published' ? (c.published?.pr ? `<a href="${esc(c.published.pr)}" target="_blank" rel="noopener">${esc(c.published.pr.replace(/^https?:\/\/(www\.)?/, ''))}</a>` : c.published?.commit ? `commit ${esc(c.published.commit.slice(0, 10))}` : `written to ${esc((c.published?.files || []).map(f => f.split('/').pop()).join(', ') || 'the files')}`) : S.data.tools?.gitPr ? 'Opened by the tool, with the plain summary as its description' : 'An engineer writes the files')}
    ${stage(st === 'published' ? 'done' : 'todo', 'Built', y && y > y0 ? `Into the ${y} season site` : `Into the ${y0} season site`)}
    ${stage('todo', 'Live', y && y > y0 ? `When the ${y} season opens, Jan ${y + 1}. The ${y0} site is not rebuilt.` : `On the next build of the live ${y0} site.`)}
  </div>`
}

export function spanishPanel (c, v) {
  const needs = v?.translations || translationNeeds(c, published())
  if (!needs.length) return ''
  const p = me()
  const may = ['draft', 'review'].includes(c.status) && (p.role === 'translator' || p.id === c.author || p.role === 'engineer')
  const rows = needs.map(n => `<div class="tr-row"><div><span class="cite">${esc(n.route.split('/').pop())} · ${esc(n.key)}</span><div class="en">${esc(n.en)}</div></div><div>${may && !n.auto ? `<textarea data-es="${esc(n.route)}|${esc(n.key)}" aria-label="Spanish" placeholder="Español">${esc(n.es || '')}</textarea>` : `<div class="ed ro ${n.es ? '' : 'missing'}">${esc(n.es || 'no Spanish yet')}</div>`}${n.auto ? '<span class="cite">translated by the tool</span>' : ''}</div></div>`)
  return `<div class="panel"><div class="panel-h">Spanish ${needs.every(n => n.es) ? '<span class="pill ok">complete</span>' : `<span class="pill warn">${needs.filter(n => !n.es).length} to go</span>`}</div><div class="panel-b">
    <p class="cite" style="margin:0 0 8px">${esc(needs.length)} string${needs.length === 1 ? '' : 's'} this change adds or changes. ${p.role === 'translator' ? 'Enter the Spanish, save, then approve.' : 'The translator (Ana P.) enters it and gives the translation approval; the author may draft it.'}</p>
    ${rows.join('')}
    ${may ? `<div class="add-row"><button class="btn sm" data-act="spanish-save" data-id="${c.id}">Save Spanish</button></div>` : ''}
  </div></div>`
}

export async function saveSpanish (id) {
  const spanish = {}
  for (const t of document.querySelectorAll('[data-es]')) spanish[t.dataset.es] = t.value
  await api('POST', `/api/changes/${id}/action`, { action: 'spanish', spanish })
  toast('Spanish saved.')
  await refresh()
}

export function changeKindLabel (e) {
  return { value: 'value', schedule: 'value by year', rule: 'rule', question: 'new question', text: 'words', 'remove-question': 'question removed' }[e.type] || e.type
}

/** The plain-language item for the new edit kinds on the change page. */
export function wideItem (c, e) {
  if (e.type === 'schedule') {
    const f = S.model.facts.get(e.path)
    return `<div class="diff-item"><span class="sym">~</span><div><p><b>${esc(f?.name || e.path)}</b>: <span class="was">${esc(scheduleWords(e.tag, { base: e.fromBase ?? e.base, steps: e.fromSteps || [] }))}</span><b>${esc(scheduleWords(e.tag, e))}</b></p><span class="cite">${c.source?.citation ? 'Source: ' + cite(c.source.citation) : '<span class="err">No source given yet</span>'}${c.source?.effective ? ' · ' + esc(c.source.effective) : ''}</span></div></div>`
  }
  if (e.type === 'question') return `<div class="diff-item"><span class="sym add">+</span><div><p><b>New question</b>: “${esc(e.question)}” (${esc(ANSWERS.find(a => a[0] === e.answerType)?.[1] || e.answerType)}), ${e.condition === '/vaIsResident' ? 'asked of every resident' : `only when ${esc(chipName(e.condition))} is yes`}, ${e.placement === 'own-screen' ? `on a new screen “${esc(e.pageTitle || e.question)}”` : `as a follow-up on <a href="#/screen/${encodeURIComponent(e.route)}">${esc(pages(S.data.flow || '').find(p => p.route === e.route)?.title || e.route)}</a>`}. <a href="#/question/edit/${encodeURIComponent(e.path)}">Open</a></p><p class="cite">${e.law ? 'Law: ' + cite(e.law) : '<span class="err">No law given yet</span>'} · <code>${esc(e.path)}</code></p></div></div>`
  if (e.type === 'text') return `<div class="diff-item"><span class="sym">~</span><div><p><b>Words on <a href="#/screen/${encodeURIComponent(e.route)}">${esc(pages(S.data.flow || '').find(p => p.route === e.route)?.title || e.route)}</a></b></p><p class="cite"><span class="was">${esc(e.before)}</span></p><p>${esc(e.after)}</p></div></div>`
  if (e.type === 'remove-question') return `<div class="diff-item"><span class="sym rm">−</span><div><p><b>Question removed</b>: <code>${esc(e.path)}</code>, its screen block and its words.</p></div></div>`
  return ''
}

function scheduleWords (tag, s) {
  const steps = [...(s.steps || [])].sort((a, b) => a.year - b.year)
  return [literalLabel(tag, s.base), ...steps.map(x => `from ${x.year} ${literalLabel(tag, x.value)}`)].join('; ')
}

export const ANSWER_LABEL = k => ANSWERS.find(a => a[0] === k)?.[1] || k
export { scheduleLabel, keyFor, chipFor as _chip, STATUS as _status, ROLE as _role }
