// Requests to engineering: what the return cannot model yet, as a spec policy staff write.

import { humanize } from '../model.js'
import { activeChange } from '../draft.js'
import { refresh } from '../shell.js'
import { $, S, api, canEdit, cite, esc, me, personName, toast } from '../state.js'

export function viewRequests () {
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

export function requestDialog () {
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
