// The two generic dialogs: ask for a line of text, and pick what goes into a blank in a rule (a fact
// the return knows, or a fixed amount).

import { literalLabel } from './model.js'
import { $, S, esc, normalizeAmount, toast, validAmount } from './state.js'

export function pickerDialog (current, { allowAmount = true } = {}) {
  return new Promise(resolve => {
    const d = $('#dialog')
    const facts = [...S.model.facts.values()].filter(f => f.kind !== 'options')
    const draftAsked = S.draftModel ? [...S.draftModel.facts.values()].filter(f => f.kind === 'asked' && !S.model.facts.has(f.path)) : []
    const groups = [
      // A Virginia fact carries its module, so a rule that reaches into another module writes module="…" as the files do.
      ['Asked of the filer', [...draftAsked.map(f => ({ path: f.path, label: f.name, note: 'in your draft', module: f.file })), ...facts.filter(f => f.kind === 'asked').map(f => ({ path: f.path, label: f.name, note: f.line ? 'Line ' + f.line.label : '', module: f.file }))]],
      ['Values', facts.filter(f => f.kind === 'value').map(f => ({ path: f.path, label: f.name, note: literalLabel(f.literal.tag, f.literal.value), module: f.file }))],
      ['Other rules and lines', facts.filter(f => f.kind === 'rule').map(f => ({ path: f.path, label: f.name, note: f.line ? 'Line ' + f.line.label : '', module: f.file }))],
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

export function askText (title, label, value, { multiline } = {}) {
  return new Promise(resolve => {
    const d = $('#dialog')
    d.innerHTML = `<form method="dialog"><div class="dh">${esc(title)}</div><div class="db"><label for="ask" style="font-weight:700">${esc(label)}</label>${multiline ? `<textarea id="ask">${esc(value)}</textarea>` : `<input type="text" id="ask" value="${esc(value)}" style="width:100%;margin-top:6px">`}</div><div class="df"><button class="btn sec" value="cancel" type="button" data-cancel>Cancel</button><button class="btn" value="ok">OK</button></div></form>`
    const input = d.querySelector('#ask')
    d.querySelector('[data-cancel]').onclick = () => { d.close(); resolve(null) }
    // OK resolves the text ('' when empty); Cancel and Escape resolve null, so a caller can tell the two apart.
    d.querySelector('form').onsubmit = e => { e.preventDefault(); d.close(); resolve(input.value.trim()) }
    d.onclose = () => resolve(null)
    d.showModal()
    input.focus()
  })
}
