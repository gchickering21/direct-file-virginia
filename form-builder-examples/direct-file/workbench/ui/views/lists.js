// The read-only lists: the federal facts Virginia uses, and every fact.

import { feedsLines, humanize } from '../model.js'
import { S, cite, esc } from '../state.js'

export function viewFederal () {
  return `<h1>Federal facts Virginia uses</h1><p class="sub">The Virginia rules may read only what the federal return hands to states (ADR-001). In the workbench each is a plain input, so a worked example can just say what it is. Adding one is an engineering change to <code>workbench/federal-inputs.json</code>.</p>
    <table class="grid"><thead><tr><th>Fact</th><th>From</th><th>Kind</th><th>Feeds</th></tr></thead><tbody>${S.data.federal.inputs.map(i => `<tr><td><b>${esc(i.label)}</b><br><code class="cite">${esc(i.path)}</code></td><td>${esc(i.source)}</td><td>${esc(humanize(i.type))}</td><td class="cite">${(feedsLines(S.model, i.path, 30).map(l => 'Line ' + l).join(', ')) || '—'}</td></tr>`).join('')}</tbody></table>`
}

export function viewAll () {
  const facts = [...S.model.facts.values()]
  return `<div class="toolbar"><div><h1>Every fact</h1><p class="sub" style="margin:0">${facts.length} facts in the Virginia modules, in file order.</p></div><div class="acts"><input type="search" id="line-search" placeholder="Filter…" aria-label="Filter" value="${esc(S.search || '')}"></div></div>
    <table class="grid" id="line-list"><thead><tr><th>Fact</th><th>Kind</th><th>Section</th></tr></thead><tbody>${facts.map(f => `<tr data-search="${esc((f.name + ' ' + f.path + ' ' + f.section).toLowerCase())}"><td><a href="#/${f.kind === 'value' ? 'values' : 'rule/' + encodeURIComponent(f.path)}">${esc(f.name)}</a><br><code class="cite">${esc(f.path)}</code></td><td><span class="ty ${f.kind === 'rule' ? 'calc' : f.kind}">${esc(f.kind)}</span></td><td class="cite">${esc(f.section)}</td></tr>`).join('')}</tbody></table>`
}
