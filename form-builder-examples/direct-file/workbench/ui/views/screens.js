// Screens filers see: the Virginia pages with their English and Spanish, edited in place; a typed
// figure made live.

import { money, shortName } from '../model.js'
import { amountsIn, pages } from '/lib/flow.js'
import { parseEs } from '/lib/locale.js'
import { chipName } from '../chips.js'
import { activeChange, draftFiles, ensureDraft, published, saveSoon } from '../draft.js'
import { render, route } from '../shell.js'
import { S, canEdit, cite, esc, toast } from '../state.js'
import { renderPagePreview } from './questions.js'
import { impactPanelBody } from './values.js'

const esMap = () => { try { return parseEs(S.data.es || '').keys } catch { return new Map() } }

export function viewScreens () {
  if (S.data.flow === undefined) return `<p class="err">The flow file is not beside the rules (${esc(S.data.paths.flow)}).</p>`
  const c = activeChange()
  const es = esMap()
  const ps = pages(S.data.flow)
  const rows = ps.map(p => {
    const keys = [...p.texts.map(t => `${p.route}.${t.key}`), ...p.questions.map(q => `${p.route}.${q.key}.question`)]
    const have = keys.filter(k => es.has(k)).length
    const edits = c?.edits.filter(e => (e.type === 'text' && e.route === p.route) || (e.type === 'question' && (e.route === p.route || e.pageRoute === p.route))).length || 0
    return `<tr class="${edits ? 'changed' : ''}"><td><a href="#/screen/${encodeURIComponent(p.route)}"><b>${esc(p.title)}</b></a><br><code class="cite">${esc(p.route)}</code></td><td class="num">${p.texts.length}</td><td class="num">${p.questions.length}</td><td>${have === keys.length ? `<span class="res-ok">${have} / ${keys.length}</span>` : `<span class="res-bad">${have} / ${keys.length}</span>`}</td><td>${edits ? `<span class="pill warn">${edits} edit${edits > 1 ? 's' : ''} in your draft</span>` : ''}</td></tr>`
  })
  return `<div class="toolbar"><div><h1>Screens filers see</h1><p class="sub" style="margin:0">The Virginia pages of the flow, with their English and how much of it has Spanish. Open one to change its words.</p></div></div>
    <table class="grid"><thead><tr><th>Screen</th><th class="num">Texts</th><th class="num">Questions</th><th>Spanish</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table>`
}

export function viewScreen (route) {
  if (S.data.flow === undefined) return `<p class="err">The flow file is not beside the rules.</p>`
  const c = activeChange()
  const files = c ? draftFiles(c).files : published()
  const page = pages(files.flow).find(p => p.route === route)
  const basePage = pages(S.data.flow).find(p => p.route === route)
  if (!page) return `<p>No screen ${esc(route)}. <a href="#/screens">Screens</a></p>`
  const es = esMap()
  let draftEs = new Map()
  try { draftEs = parseEs(files.es || '').keys } catch { /* shown as missing */ }
  const values = [...S.model.facts.values()].filter(f => f.kind === 'value' && f.literal.tag === 'Dollar')
  const items = page.texts.map((t, i) => {
    const edit = c?.edits.find(e => e.type === 'text' && e.route === route && e.after === t.inner)
    const baseInner = edit ? edit.before : t.inner
    const key = `${route}.${t.key}`
    const esNow = draftEs.get(key)?.value ?? es.get(key)?.value
    const stale = edit && !(c.spanish || {})[`${route}|${t.key}`]
    const quoted = amountsIn(t.inner).map(a => ({ ...a, fact: values.find(f => Number(f.literal.value) === a.value) })).filter(a => a.fact && !/fg-show/.test(t.inner.slice(Math.max(0, a.index - 40), a.index)))
    return `<div class="word ${edit ? 'edited' : ''}">
      <div class="lang"><div class="lang-h"><span>English <span class="cite">&lt;${esc(t.tag)}&gt;${/va-eyebrow/.test(t.class) ? ' · eyebrow' : ''}</span></span><span class="cite">${esc(t.key)}</span></div><div class="lang-b">
        ${canEdit() && !/va-eyebrow/.test(t.class) ? `<textarea data-act="text-edit" data-route="${esc(route)}" data-tag="${esc(t.tag)}" data-before="${esc(baseInner)}" aria-label="English">${esc(t.inner)}</textarea>` : `<div class="ed ro">${esc(t.inner)}</div>`}
        ${quoted.length ? `<div class="add-row">${quoted.map(a => `<button class="btn quiet sm" data-act="bind" data-route="${esc(route)}" data-tag="${esc(t.tag)}" data-before="${esc(baseInner)}" data-inner="${esc(t.inner)}" data-figure="${esc(a.text)}" data-path="${esc(a.fact.path)}" data-index="${a.index}" title="Replace the typed figure with the value itself, so the next change never leaves it stale">Make ${esc(a.text)} live: ${esc(shortName(a.fact.name))}</button>`).join('')}</div>` : ''}
        ${edit ? `<div class="cite">Was: ${esc(edit.before)} <button class="btn quiet sm" data-act="text-undo" data-route="${esc(route)}" data-before="${esc(edit.before)}">undo</button></div>` : ''}
      </div></div>
      <div class="lang"><div class="lang-h"><span>Español ${esNow === undefined ? '<span class="pill bad">Missing</span>' : stale ? '<span class="pill warn">Out of date</span>' : '<span class="pill ok">In</span>'}</span><span class="cite">${esc(S.data.paths.es.split('/').pop())}</span></div><div class="lang-b"><div class="${stale ? 'stale' : 'ed ro'}">${esc(esNow ?? '—')}</div>${stale ? `<p class="cite" style="margin:6px 0 0">The English changed. The Spanish is carried to the new key and marked; the translator replaces it on the <a href="#/change/${c.id}">change page</a>.</p>` : ''}</div></div>
    </div>`
  })
  const qs = page.questions.map(q => `<div class="word"><div class="lang"><div class="lang-h"><span>Question <span class="cite">${esc(q.path)}</span></span></div><div class="lang-b"><div class="ed ro">${esc(q.question)}</div><p class="cite" style="margin:6px 0 0">${basePage?.questions.some(x => x.path === q.path) ? 'Question wording and its options are edited in the flow by engineering.' : `Added by your draft. <a href="#/question/edit/${encodeURIComponent(q.path)}">Edit it</a>.`}</p></div></div><div class="lang"><div class="lang-h"><span>Español ${draftEs.get(`${route}.${q.key}.question`) || es.get(`${route}.${q.key}.question`) ? '<span class="pill ok">In</span>' : '<span class="pill bad">Missing</span>'}</span></div><div class="lang-b"><div class="ed ro">${esc(draftEs.get(`${route}.${q.key}.question`)?.value ?? es.get(`${route}.${q.key}.question`)?.value ?? '—')}</div></div></div></div>`)
  // Everywhere a value quoted on this page is typed elsewhere.
  const quotedPaths = [...new Set(page.texts.flatMap(t => amountsIn(t.inner).map(a => values.find(f => Number(f.literal.value) === a.value)?.path).filter(Boolean)))]
  const elsewhere = quotedPaths.flatMap(p => { const f = S.model.facts.get(p); const needle = money(f.literal.value); return pages(files.flow).flatMap(pg => pg.texts.filter(t => t.inner.includes(needle)).map(t => ({ path: p, name: shortName(f.name), route: pg.route, title: pg.title, bound: /fg-show[^>]*path="[^"]*"/.test(t.inner.slice(Math.max(0, t.inner.indexOf(needle) - 60), t.inner.indexOf(needle))) }))) })
  return `
    <div class="crumb"><a href="#/screens">Screens filers see</a> › ${esc(page.title)}</div>
    <div class="toolbar"><div><h1>${esc(page.title)}</h1><p class="sub" style="margin:0"><code>${esc(route)}</code> · ${page.texts.length} texts · ${page.questions.length} questions${page.screens[0]?.condition ? ` · shown when ${esc(chipName(page.screens[0].condition.path))}` : ''}</p></div><div class="acts">${canEdit() ? `<a class="btn sec sm" href="#/question/new">+ Add a question here</a>` : ''}</div></div>
    <div class="split">
      <div class="stack">${items.join('')}${qs.join('')}</div>
      <div class="stack">
        <div>${renderPagePreview(files.flow, route, S.data.flow)}</div>
        ${elsewhere.length ? `<div class="panel"><div class="panel-h">Everywhere these figures are written</div><div class="panel-b uses">${elsewhere.map(x => `<div><span>${esc(x.title)}: ${esc(x.name)}</span>${x.bound ? '<span class="pill ok">live value</span>' : `<span class="pill warn">typed · <a href="#/screen/${encodeURIComponent(x.route)}">bind it</a></span>`}</div>`).join('')}<p class="cite" style="margin:8px 0 0">A typed figure goes stale when the value changes; a live one is <code>&lt;fg-show&gt;</code> of the value and never does.</p></div></div>` : ''}
        <div class="panel" id="impact-panel">${impactPanelBody()}</div>
      </div>
    </div>`
}

export async function textEdit (t) {
  const after = t.value.trim()
  const before = t.dataset.before
  if (!after) { toast('A paragraph cannot be empty.', true); render(); return }
  const c = await ensureDraft()
  if (!c) { render(); return }
  c.edits = c.edits.filter(e => !(e.type === 'text' && e.route === t.dataset.route && e.before === before))
  if (after !== before.trim()) c.edits.push({ type: 'text', route: t.dataset.route, tag: t.dataset.tag, before, after })
  saveSoon(c)
  render()
}

export async function bindFigure (b) {
  const c = await ensureDraft()
  if (!c) return
  const inner = b.dataset.inner
  const i = Number(b.dataset.index)
  const after = inner.slice(0, i) + `<fg-show path="${b.dataset.path}"/>` + inner.slice(i + b.dataset.figure.length)
  c.edits = c.edits.filter(e => !(e.type === 'text' && e.route === b.dataset.route && e.before === b.dataset.before))
  if (after !== b.dataset.before) c.edits.push({ type: 'text', route: b.dataset.route, tag: b.dataset.tag, before: b.dataset.before, after })
  saveSoon(c)
  toast('The figure is now the value itself. The Spanish needs the same change; the translator sees it.')
  render()
}
