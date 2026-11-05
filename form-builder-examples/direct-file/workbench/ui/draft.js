// The active draft: the change the current person is editing, held in localStorage per person, and
// how an edit gets into it (saveSoon) and how the draft's files are computed (applyChange over the
// published ones).

import { applyChange } from '/lib/xml-edit.js'
import { askText } from './dialogs.js'
import { scheduleImpact } from './runner.js'
import { renderStrip } from './shell.js'
import { S, api, canEdit, me, toast } from './state.js'

const activeKey = () => `wb-active-${S.me}`
export function activeChange () {
  const id = Number(localStorage.getItem(activeKey()))
  const c = S.data.changes.find(x => x.id === id)
  if (c && c.status === 'draft' && (c.author === S.me || me().role === 'engineer')) return c
  return null
}
export const setActive = id => { if (id) localStorage.setItem(activeKey(), id); else localStorage.removeItem(activeKey()) }

export async function ensureDraft () {
  const c = activeChange()
  if (c) return c
  if (!canEdit()) { toast('Reviewers review; switch to an author or engineer to make changes.', true); return null }
  const title = await askText('Start a change', 'What is this change? A short title the reviewer will see.', '')
  if (!title) return null
  const created = await api('POST', '/api/changes', { title })
  S.data.changes.push(created)
  setActive(created.id)
  toast(`Started draft #${created.id}`)
  return created
}

let saveTimer
/** Drop a pending autosave, before an action that saves the draft itself. */
export function cancelPendingSave () { clearTimeout(saveTimer) }
export function saveSoon (c) {
  c.updated = new Date().toISOString()
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      const saved = await api('PUT', `/api/changes/${c.id}`, { change: { title: c.title, summary: c.summary, source: c.source, edits: c.edits, exampleEdits: c.exampleEdits, requestIds: c.requestIds, spanish: c.spanish || {} } })
      Object.assign(c, saved)
      renderStrip()
    } catch (e) { toast(e.message, true) }
  }, 400)
  renderStrip()
  scheduleImpact()
}

export const published = () => ({ facts: S.data.facts, flow: S.data.flow, es: S.data.es })
export function draftFiles (c) {
  try { return { files: applyChange(published(), c) } } catch (e) { return { files: published(), conflict: e.message } }
}
