// Form 760 line by line, with the statute beside each, and the cards for what the current person
// has to do.

import { derivedTree, describePath, elementKids, humanize, literalLabel, shortName } from '../model.js'
import { lineStatus } from '../chips.js'
import { S, STATUS, canEdit, cite, esc, me, personName } from '../state.js'

export function viewHome () {
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
    for (const c of open.filter(c => c.author === p.id)) cards.push(`<a class="${c.status === 'draft' ? '' : 'wait'}" href="#/change/${c.id}"><b>${c.status === 'draft' ? 'Your draft' : 'Your change'} #${c.id}</b><span class="cite">“${esc(c.title)}” · ${STATUS[c.status][0].toLowerCase()}${c.status === 'review' ? `, ${c.approvals.length} of ${c.edits.some(e => e.type === 'question' || e.type === 'text') ? 3 : 2} approvals` : ''}</span></a>`)
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
