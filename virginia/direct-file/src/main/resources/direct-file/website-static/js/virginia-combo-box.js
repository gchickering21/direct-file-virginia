// The USWDS combo box (templates/nodes/inputs/select.html) and the runtime, made to agree.
//
// Two things the runtime cannot see once USWDS has enhanced the <select>:
//
// 1. THE VISIBLE TEXT. USWDS builds a text input beside the select and fills it from the select's
//    selected option once, when it enhances (and it clears the select's own value as it does so).
//    After that, nothing in USWDS watches the select: a value the runtime or virginia-locality.js
//    writes later lands in the hidden select and the input stays blank. And in the other order, a
//    value the runtime wrote first is cleared by the enhancement. So on every fg-update, and the
//    moment the enhancement happens (its data-enhanced attribute), the select is set from the fact
//    and the input's text from the selected option, the way USWDS's own option click does it.
//    Never while the filer is typing in the input.
//
// 2. THE ERROR. fg-set's setValidationError() puts aria-invalid and aria-describedby on the
//    `.usa-select`, which USWDS has made aria-hidden and sr-only, and fg-validation focuses it. A
//    screen reader hears nothing and the focus lands on an invisible control. The attributes are
//    mirrored onto the visible input as they change, and focus moves there if it was sent to the
//    select. Reasoned from fg-set.js and fg-validation.js; see the hand check in
//    docs/virginia/README.md.
//
// Also marks the locality screen's callout and ZIP notes as polite live regions: the flow's grammar
// has no aria-live attribute for a paragraph.

import { read } from './virginia-graph.js'
function syncText (box) {
  const select = box.querySelector('select')
  const input = box.querySelector('.usa-combo-box__input')
  const fgSet = box.closest('fg-set')
  if (!select || !fgSet) return
  const value = read(fgSet.getAttribute('path')) ?? ''
  if (select.value !== value) select.value = value
  if (!input || document.activeElement === input) return
  const option = select.selectedOptions[0]
  const text = option && option.value ? option.text : ''
  if (input.value !== text) input.value = text
  box.classList.toggle('usa-combo-box--pristine', text !== '')
}

function mirrorError (box) {
  const select = box.querySelector('select')
  const input = box.querySelector('.usa-combo-box__input')
  if (!select || !input) return
  const invalid = select.getAttribute('aria-invalid') === 'true'
  input.setAttribute('aria-invalid', invalid ? 'true' : 'false')
  const describedBy = select.getAttribute('aria-describedby')
  if (describedBy) input.setAttribute('aria-describedby', describedBy)
  else input.removeAttribute('aria-describedby')
  input.classList.toggle('usa-input--error', invalid)
  if (invalid && (document.activeElement === select || document.activeElement === document.body)) input.focus()
}

function watch (box) {
  if (box.dataset.vaWatched) return
  box.dataset.vaWatched = 'true'
  const select = box.querySelector('select')
  if (!select) return
  new MutationObserver(() => mirrorError(box)).observe(select, { attributes: true, attributeFilter: ['aria-invalid', 'aria-describedby'] })
  new MutationObserver(() => { syncText(box); mirrorError(box) }).observe(box, { attributes: true, attributeFilter: ['data-enhanced'] })
  syncText(box)
  mirrorError(box)
}

function start () {
  document.querySelectorAll('.usa-combo-box').forEach(watch)
  document.querySelectorAll('.va-callout, .va-zip-note').forEach(el => el.setAttribute('aria-live', 'polite'))
}

start()
document.addEventListener('fg-update', () => document.querySelectorAll('.usa-combo-box').forEach(box => { watch(box); syncText(box) }))
