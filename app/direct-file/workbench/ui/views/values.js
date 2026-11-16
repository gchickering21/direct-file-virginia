// Values by tax year: a column per year, a figure set by a law for that year or carried forward;
// the source panel, the season panel, and the worked-examples impact panel the other views share.

import { formatResult, literalLabel } from '../model.js'
import { scheduleDerived, valueAt } from '../../lib/xml-edit.js'
import { lineName } from '../chips.js'
import { activeChange, draftFiles, ensureDraft, published, saveSoon } from '../draft.js'
import { differences, run } from '../runner.js'
import { render } from '../shell.js'
import { S, canEdit, cite, esc, normalizeAmount, toast, validAmount } from '../state.js'

const YEARS = () => { const y0 = S.data.siteYear; const set = new Set([y0, y0 + 1, y0 + 2, y0 + 3]); for (const f of S.model.facts.values()) for (const s of f.schedule?.steps || []) set.add(s.year); if (S.year) set.add(S.year); return [...set].sort() }
const yearLabel = y => `Tax year ${y}`
const seasonOf = y => `${y} season (opens Jan ${y + 1})`

export function impactPanelBody () {
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
      <td><b>${esc(f.name)}</b>${e ? `<br><button class="btn quiet sm" data-act="year-undo" data-path="${esc(f.path)}">undo</button>` : ''}<br><span class="cite">${cite(f.citation)} · <a href="#/rule/${encodeURIComponent(f.path)}">used by Line ${esc(feedsLabel(f))}</a></span></td>
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
        <div class="panel" id="impact-panel">${impactPanelBody()}</div>
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
