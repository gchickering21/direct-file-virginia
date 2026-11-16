// The four read-only reports the server computes from the files: coverage, the export contract,
// Spanish, history.

import { shortName } from '../model.js'
import { lineName } from '../chips.js'
import { published } from '../draft.js'
import { $, S, api, cite, esc, personName } from '../state.js'
import { at } from './rule.js'

export const REPORTS = {
  coverage: ['Coverage', 'Every Form 760 line and Schedule ADJ item the rules name, how it is modelled, and which worked examples check it.'],
  exports: ['Export contract', 'Every federal fact the Virginia modules read: whether the federal dictionary exports it to states (ADR-001), and how the sandbox stands it in.'],
  spanish: ['Spanish', 'The Virginia screens\' English keys in flow_en.yaml against virginia_es.yaml: what has no Spanish yet, and what is stale.'],
  history: ['History', 'The last twenty publishes, from data/audit.jsonl.'],
}

export function viewReport () {
  const [name] = S.route
  const [title, sub] = REPORTS[name]
  return `<h1>${title}</h1><p class="sub">${sub}</p><div id="report"><p class="muted"><span class="spin"></span> Reading the files…</p></div>`
}

export async function loadReport (name) {
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
