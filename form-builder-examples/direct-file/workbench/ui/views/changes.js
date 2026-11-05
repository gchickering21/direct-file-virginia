// Changes and review: the list, one change with its plain summary, code diff, approvals and
// conversation; the verify panel; the publish rail; the Spanish panel; and the footprint page.

import { derivedTree, formatResult, literalLabel } from '../model.js'
import { pages } from '../../lib/flow.js'
import { applyBaselineEdits, applyChange, applyExampleEdits, translationNeeds } from '../../lib/xml-edit.js'
import { chipName, lineName, statusPill } from '../chips.js'
import { activeChange, published } from '../draft.js'
import { computeImpact, differences, run } from '../runner.js'
import { refresh, render } from '../shell.js'
import { $, ROLE, S, api, canEdit, cite, esc, me, personName, toast } from '../state.js'
import { proposalsPanel } from './law.js'
import { ANSWERS, renderPagePreview } from './questions.js'
import { at, renderRoot } from './rule.js'

export function viewChanges () {
  const rows = [...S.data.changes].reverse().map(c => `<tr>
    <td>#${c.id}</td><td><a href="#/change/${c.id}"><b>${esc(c.title)}</b></a><br><span class="cite">${c.edits.length} edits · ${c.exampleEdits.length} example edits</span></td>
    <td>${esc(personName(c.author))}</td><td>${statusPill(c)}</td>
    <td>${['policy', 'engineering', ...(c.edits.some(e => e.type === 'question' || e.type === 'text') ? ['translation'] : [])].map(k => c.approvals.some(a => a.kind === k) ? `<span class="pill ok">${k} ✓</span>` : `<span class="pill">${k}</span>`).join(' ')}</td>
    <td class="cite">${new Date(c.updated).toLocaleString()}</td></tr>`).join('')
  return `<div class="toolbar"><div><h1>Changes</h1><p class="sub" style="margin:0">Every change goes draft → checks → approvals (policy, engineering, and Spanish when words change) → published into the right season's build.</p></div>${canEdit() ? '<div class="acts"><button class="btn" data-act="new-change">+ Start a change from the law</button></div>' : ''}</div>
    ${rows ? `<table class="grid"><thead><tr><th>#</th><th>Change</th><th>Author</th><th>Status</th><th>Approvals</th><th>Updated</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty-state">No changes yet. Edit a value or a rule to start one.</div>'}`
}

export function viewChange (id) {
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
  if (c.status === 'approved' && p.role === 'engineer') actions.push(`<button class="btn ok" data-act="publish" data-id="${c.id}">${S.data.tools?.gitPr ? 'Publish and open the pull request' : `Publish to the fact modules${needsTranslation ? ' and the screens' : ''}`}</button>`)
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

export async function loadVerify (id) {
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
    d.push(`<p class="cite" style="margin:6px 0"><code>${esc(S.data.paths.facts[k] || S.data.paths[k] || k)}</code></p><pre class="xml">${hunks.map(h => `<span class="hunk">${esc(h.header)}</span>${h.lines.map(([op, t]) => op === '+' ? `<span class="add">+ ${esc(t)}</span>` : op === '-' ? `<span class="del">- ${esc(t)}</span>` : `  ${esc(t)}\n`).join('')}`).join('')}</pre>`)
  }
  const exEdits = S.data.changes.find(x => x.id === Number(id))?.exampleEdits.length
  $('#code-diff').innerHTML = d.join('') + (exEdits ? `<p class="cite">Plus ${exEdits} change${exEdits === 1 ? '' : 's'} to <code>${esc(S.data.paths.examples)}</code>.</p>` : '') || '<p class="muted">No change to the fact files.</p>'
}

export function viewImpact (id) {
  const c = S.data.changes.find(x => x.id === Number(id))
  if (!c) return '<p>No such change.</p>'
  const I = S.impact
  const files = (() => { try { return { files: applyChange(published(), c) } } catch (e) { return { files: published(), conflict: e.message } } })()
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
  const key = `${c.id}:${c.updated}:${Object.values(S.data.facts).reduce((n, x) => n + x.length, 0)}`
  if (S.impactFor?.key === key) return
  let files
  try { files = applyChange(published(), c) } catch { return }
  const examples = applyExampleEdits(S.data.examplesFile.examples, c)
  const baseline = applyBaselineEdits(S.data.examplesFile.baseline, c)
  if (!S.impact?.base) await computeImpact()
  const r = await run(files, examples, baseline)
  S.impactFor = { id: c.id, key, run: r }
  if (S.route[0] === 'change' && S.route[2] === 'impact' && Number(S.route[1]) === c.id) render()
}


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

