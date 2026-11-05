// The page's events, by delegation on data-act attributes: one click handler, one change handler,
// one input handler. Each dispatches to the view that owns the action. Nothing here draws HTML.

import { buildModel, dep, derivedXml, el, elementKids, lit, parseXmlFragment } from './model.js'
import { applyExampleEdits } from '../lib/xml-edit.js'
import { askText, pickerDialog } from './dialogs.js'
import { activeChange, cancelPendingSave, ensureDraft, saveSoon, setActive } from './draft.js'
import { paintImpact } from './runner.js'
import { refresh, render } from './shell.js'
import { $, S, api, fractionValue, me, normalizeAmount, setYear, toast, validAmount } from './state.js'
import { saveSpanish } from './views/changes.js'
import { acceptExample, exampleDialog } from './views/examples.js'
import { lawDialog } from './views/law.js'
import { questionAct, questionInput } from './views/questions.js'
import { requestDialog } from './views/requests.js'
import { CMP, currentRuleFact, defaultLiteral, nodeAt, operandType, replaceAt, ruleState, stripMarks, treeChanged } from './views/rule.js'
import { bindFigure, textEdit } from './views/screens.js'
import { yearCell } from './views/values.js'

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]')
  if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return
  const act = b.dataset.act
  const f = currentRuleFact()
  try {
    if (act === 'tab') { const st = ruleState(f); st.tab = b.dataset.tab; st.xmlError = null; render() } else if (act === 'pick') {
      const st = ruleState(f)
      const { node } = nodeAt(st.tree, b.dataset.at)
      const choice = await pickerDialog(node)
      if (!choice) return
      if (choice.request && !choice.path) { requestDialog(); return }
      replaceAt(st, b.dataset.at, () => choice.path ? dep(choice.path, choice.module && choice.module !== f.file ? choice.module : undefined) : lit(choice.tag, choice.amount))
      await treeChanged(f)
    } else if (act === 'add-case') {
      const st = ruleState(f)
      const { node: sw } = nodeAt(st.tree, b.dataset.at)
      const kase = el('Case', [el('When', [el('GreaterThan', [el('Left', [dep('')]), el('Right', [lit('Dollar', 0)])])]), el('Then', [lit('Dollar', 0)])], { 'data-new': '' })
      // The "because" comment is written once the author types one (case-because), not as an empty line.
      sw.children.unshift(kase)
      await treeChanged(f)
    } else if (['case-up', 'case-down', 'case-rm'].includes(act)) {
      const st = ruleState(f)
      const p = b.dataset.at.split('.')
      const i = Number(p.pop())
      const { node: sw } = nodeAt(st.tree, p.join('.'))
      // A case moves with the comment written just above it: group the children into units of
      // [comments…, Case], move or drop the unit, and flatten again.
      const units = []
      let pending = []
      sw.children.forEach((c, k) => {
        pending.push({ c, k })
        if (c.tag === 'Case') { units.push(pending); pending = [] }
      })
      const u = units.findIndex(unit => unit.some(x => x.k === i))
      if (act === 'case-rm') units.splice(u, 1)
      else {
        const v = act === 'case-up' ? u - 1 : u + 1
        if (v >= 0 && v < units.length) [units[u], units[v]] = [units[v], units[u]]
      }
      sw.children = [...units.flat().map(x => x.c), ...pending.map(x => x.c)]
      await treeChanged(f)
    } else if (act === 'limit') {
      const st = ruleState(f)
      replaceAt(st, b.dataset.at, n => el(b.dataset.kind, [n, lit('Dollar', 0)]))
      await treeChanged(f)
    } else if (act === 'unlimit') {
      const st = ruleState(f)
      replaceAt(st, b.dataset.at, n => elementKids(n)[0])
      await treeChanged(f)
    } else if (act === 'add-operand') {
      const st = ruleState(f)
      const { node } = nodeAt(st.tree, b.dataset.at)
      node.children.push(dep(''))
      await treeChanged(f)
    } else if (act === 'rm') {
      const st = ruleState(f)
      const p = b.dataset.at.split('.')
      const i = Number(p.pop())
      nodeAt(st.tree, p.join('.')).node.children.splice(i, 1)
      await treeChanged(f)
    } else if (act === 'xml-apply') {
      const st = ruleState(f)
      const text = $('#xml-text').value
      try {
        const nodes = parseXmlFragment(text).filter(n => n.tag !== '#comment')
        if (nodes.length !== 1 || nodes[0].tag !== 'Derived' || elementKids(nodes[0]).length !== 1) throw new Error('Write one <Derived> element holding one expression.')
        // The tree is the inside of <Derived>.
        st.tree = elementKids(nodes[0])[0]
        st.xmlError = null
        st.tab = 'plain'
        await treeChanged(f)
      } catch (x) { st.xmlText = text; st.xmlError = x.message; render() }
    } else if (act === 'xml-reset') { const st = ruleState(f); st.xmlText = null; st.xmlError = null; render() } else if (act === 'new-request') requestDialog()
    else if (act === 'new-change') lawDialog()
    else if (act.startsWith('q-')) await questionAct(act, b)
    else if (act === 'bind') await bindFigure(b)
    else if (act === 'spanish-save') await saveSpanish(b.dataset.id)
    else if (act === 'year-undo') { const c = activeChange(); c.edits = c.edits.filter(x => !((x.type === 'value' || x.type === 'schedule') && x.path === b.dataset.path)); saveSoon(c); render() } else if (act === 'text-undo') { const c = activeChange(); c.edits = c.edits.filter(x => !(x.type === 'text' && x.route === b.dataset.route && x.before === b.dataset.before)); saveSoon(c); render() } else if (act === 'propose-value') {
      const c = await ensureDraft()
      if (!c) return
      const f = S.model.facts.get(b.dataset.path)
      const year = Number(b.dataset.year)
      c.edits = c.edits.filter(x => !((x.type === 'value' || x.type === 'schedule') && x.path === f.path))
      if (year <= S.data.siteYear && !f.schedule.steps.length) c.edits.push({ type: 'value', file: f.file, path: f.path, from: f.schedule.base, to: b.dataset.value })
      else c.edits.push({ type: 'schedule', file: f.file, path: f.path, before: f.derivedText, tag: f.schedule.tag, base: f.schedule.base, steps: [...f.schedule.steps.filter(s => s.year !== year), { year, value: b.dataset.value }].sort((x, y) => y.year - x.year), fromBase: f.schedule.base, fromSteps: f.schedule.steps })
      saveSoon(c)
      toast(`${f.name}: ${b.dataset.value} from ${year}. See the Values page.`)
      render()
    } else if (act === 'revert') {
      if (!confirm('Draft a change that undoes this one? It goes through the same checks and approvals before anything is written.')) return
      const c = await api('POST', '/api/changes', { revertOf: Number(b.dataset.id) })
      setActive(c.id); await refresh(); location.hash = `#/change/${c.id}`
    } else if (act === 'leave-draft') { setActive(null); S.rule = {}; render(); toast('Draft set aside. Find it under Changes.') } else if (act === 'resume') { setActive(Number(b.dataset.id)); S.rule = {}; render() } else if (act === 'rename') {
      const c = S.data.changes.find(x => x.id === Number(b.dataset.id))
      const t = await askText('Rename', 'Title', c.title)
      if (t) { c.title = t; await api('PUT', `/api/changes/${c.id}`, { change: { title: t } }); render() }
    } else if (['submit', 'approve', 'request-changes', 'withdraw', 'discard', 'publish', 'comment'].includes(act)) {
      let note
      if (act === 'request-changes') { note = await askText('Ask for changes', 'What needs to change?', '', { multiline: true }); if (!note) return }
      if (act === 'approve') note = (await askText('Approve', 'Anything to say with your approval? (optional)', '')) || ''
      if (act === 'comment') { note = $('#comment').value.trim(); if (!note) return }
      if (act === 'discard' && !confirm('Discard this draft? It stays in the list as discarded.')) return
      if (act === 'publish' && !confirm('Publish? This writes the change into the fact files on disk, after rerunning every example.')) return
      if (act === 'submit') { cancelPendingSave(); const c = activeChange(); if (c) await api('PUT', `/api/changes/${c.id}`, { change: { title: c.title, source: c.source, edits: c.edits, exampleEdits: c.exampleEdits, requestIds: c.requestIds } }) }
      b.disabled = true
      try {
        const c = await api('POST', `/api/changes/${b.dataset.id}/action`, { action: act === 'discard' ? 'withdraw' : act, discard: act === 'discard', note })
        if (act === 'submit' || act === 'discard') { setActive(null); S.rule = {} }
        if (act === 'withdraw') setActive(c.id)
        toast({ submit: 'Sent for review.', approve: 'Approved.', 'request-changes': 'Sent back to the author.', withdraw: 'Back to draft.', discard: 'Discarded.', publish: 'Published. The fact files on disk now carry this change.', comment: 'Comment added.' }[act])
        S.runs.clear()
        await refresh()
      } catch (x) {
        b.disabled = false
        const extra = x.extra?.failing?.length ? ` ${x.extra.failing.map(fl => fl.title).join(', ')}.` : ''
        toast(x.message + extra, true)
      }
    } else if (act === 'example-new') exampleDialog(null)
    else if (act === 'example-edit') { const c = activeChange(); exampleDialog((c ? applyExampleEdits(S.data.examplesFile.examples, c) : S.data.examplesFile.examples).find(x => x.id === b.dataset.id)) } else if (act === 'accept') await acceptExample(b.dataset.id)
    else if (act === 'value-undo') { const c = activeChange(); c.edits = c.edits.filter(x => !(x.type === 'value' && x.path === b.dataset.path)); saveSoon(c); render() } else if (act === 'req-done' || act === 'req-reopen') {
      await api('POST', `/api/requests/${b.dataset.id}/action`, { action: act === 'req-done' ? 'done' : 'reopen' })
      await refresh()
    }
  } catch (x) { toast(x.message, true) }
})

document.addEventListener('change', async e => {
  const t = e.target
  if (t.id === 'who-select') { S.me = t.value; localStorage.setItem('wb-me', S.me); S.rule = {}; render(); return }
  if (t.id === 'year-select') { setYear(Number(t.value)); S.model = buildModel({ ...S.data, year: S.year }); S.runs.clear(); render(); return }
  const act = t.dataset.act
  if (act === 'year-cell') { await yearCell(t); return }
  if (act === 'text-edit') { await textEdit(t); return }
  if (t.dataset.q !== undefined) { questionInput(t); return }
  if (act === 'value') {
    const f = S.model.facts.get(t.dataset.path)
    let v = t.value.trim()
    if (!validAmount(f.literal.tag, v)) { toast('That is not a number this value can hold.', true); t.value = f.literal.value; return }
    v = normalizeAmount(f.literal.tag, v)
    const c = await ensureDraft()
    if (!c) { t.value = f.literal.value; return }
    c.edits = c.edits.filter(x => !(x.type === 'value' && x.path === f.path))
    // The source goes into the fact's <Description> when the change is applied (lib/xml-edit.js).
    if (Number(fractionValue(v)) !== Number(fractionValue(f.literal.value))) c.edits.push({ type: 'value', file: f.file, path: f.path, from: f.literal.value, to: v })
    saveSoon(c)
    render()
  } else if (act === 'cmp') {
    const f = currentRuleFact()
    const st = ruleState(f)
    const op = t.value
    const { node: n } = nodeAt(st.tree, t.dataset.at)
    const cur = CMP[n.tag] ? elementKids(elementKids(n)[0])[0] : n
    if (op === 'IsYes' && CMP[n.tag]) {
      // "is yes" is for a yes/no fact. The right operand is kept aside, so switching back restores it.
      if (operandType(cur) !== 'boolean') { toast('“Is yes” works for a yes/no fact. Pick a yes/no fact on the left first, or keep a comparison.', true); t.value = n.tag; return }
      st.savedRight ??= {}
      st.savedRight[t.dataset.at] = elementKids(elementKids(n)[1])[0]
    }
    replaceAt(st, t.dataset.at, () => {
      if (op === 'IsYes') return cur
      // Switching between comparisons keeps both operands; from "is yes", the right operand is the one set
      // aside earlier or a literal of the left operand's own type, never a dollar amount for a date.
      const right = CMP[n.tag] ? elementKids(elementKids(n)[1])[0] : st.savedRight?.[t.dataset.at] || defaultLiteral(cur)
      return el(op, [el('Left', [cur]), el('Right', [right])])
    })
    await treeChanged(f)
  } else if (act === 'filter') { S.filter = t.value; paintImpact() }
})

document.addEventListener('input', e => {
  const t = e.target
  if (t.dataset.q !== undefined && t.tagName !== 'SELECT') { if (t.dataset.q !== 'question') questionInput(t); return }
  const act = t.dataset.act
  if (act === 'source') { const c = activeChange(); if (!c) return; c.source = { ...c.source, [t.dataset.key]: t.value }; saveSoon(c) } else if (act === 'because') {
    const f = currentRuleFact()
    const st = ruleState(f)
    st.because = t.value
    const c = activeChange()
    const ed = c?.edits.find(x => x.type === 'rule' && x.path === f.path)
    if (ed) { ed.because = t.value; saveSoon(c) }
  } else if (act === 'case-because') {
    const f = currentRuleFact()
    const st = ruleState(f)
    const p = t.dataset.at.split('.')
    const i = Number(p.pop())
    const { node: sw } = nodeAt(st.tree, p.join('.'))
    const prev = sw.children[i - 1]
    const text = t.value.trim()
    if (prev?.tag === '#comment') { if (text) prev.text = 'Because: ' + text; else sw.children.splice(i - 1, 1) } else if (text) sw.children.splice(i, 0, { tag: '#comment', text: 'Because: ' + text })
    const c = activeChange()
    const ed = c?.edits.find(x => x.type === 'rule' && x.path === f.path)
    if (ed) { ed.derived = stripMarks(derivedXml(st.tree)); saveSoon(c) }
  }
})
