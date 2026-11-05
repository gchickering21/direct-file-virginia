// Starting a change from the law: the dialog, and the panel of what the pasted text seems to touch.

import { literalLabel, money } from '../model.js'
import { activeChange } from '../draft.js'
import { refresh } from '../shell.js'
import { $, S, api, cite, esc, setYear, toast } from '../state.js'

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
