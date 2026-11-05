// Worked examples: the households and what the law says their lines must be, rerun against the
// published rules or the draft; the dialog that writes one.

import { clone, formatResult, humanize } from '../model.js'
import { writableFacts } from '/lib/sandbox.js'
import { applyExampleEdits } from '/lib/xml-edit.js'
import { lineName, resultCell } from '../chips.js'
import { activeChange, draftFiles, ensureDraft, published, saveSoon } from '../draft.js'
import { run } from '../runner.js'
import { render } from '../shell.js'
import { $, S, canEdit, cite, esc, toast } from '../state.js'
import { at } from './rule.js'

export function viewExamples () {
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

export function examplesTable () {
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

export async function acceptExample (id) {
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

export function exampleDialog (ex) {
  const isNew = !ex
  ex = ex ? clone(ex) : { id: '', title: '', household: '', author: S.me, created: new Date().toISOString().slice(0, 10), inputs: {}, expect: {} }
  const base = S.data.examplesFile.baseline
  const dq = activeChange() ? draftFiles(activeChange()).files : published()
  const questions = Object.values(dq.facts).flatMap(writableFacts).filter(q => !/Correction|Zip|Everything|FromAddress/.test(q.path))
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
  const locOptions = (S.model.facts.get('/vaLocalityOptions')?.derivedText || '').match(/<String>([^<]+)<\/String>/g)?.map(s => s.replace(/<\/?String>/g, '')) || []
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
