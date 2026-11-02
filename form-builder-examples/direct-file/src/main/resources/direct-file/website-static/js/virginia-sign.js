// The sign screen: the declaration box and the Send to Virginia Tax button.
//
// The box is an ordinary <fg-set> on /vaDeclaration (a one-option multi-enum, the runtime's only
// checkbox). The button sets one fact and nothing else: /vaDeclarationSigned, true, once the box is
// checked; the flow shows a "nothing was sent" confirmation on that fact. Clearing the box clears
// the fact again. Demonstration only: nothing leaves the browser.
import { factGraph, saveFactGraph } from '../vendor/form-builder/flow-runtime/js/fg-fact-graph.js'
import { t } from './virginia-strings.js'

const declaration = () => document.querySelector('fg-set[path="/vaDeclaration"]')

function setSigned (value) {
  const current = factGraph.get('/vaDeclarationSigned')
  if (current.hasValue && current.get === value) return
  factGraph.set('/vaDeclarationSigned', value)
  saveFactGraph()
  document.dispatchEvent(new CustomEvent('fg-update'))
}

window.vaSendToVirginia = function vaSendToVirginia (event) {
  event?.preventDefault()
  const fgSet = declaration()
  if (!fgSet) return
  if (!fgSet.isComplete()) {
    fgSet.setValidationError(t('sign.need-declaration'))
    fgSet.querySelector('input[type="checkbox"]')?.focus()
    return
  }
  setSigned(true)
  const sent = document.querySelector('.va-sent')
  if (sent) {
    sent.setAttribute('tabindex', '-1')
    sent.focus()
    sent.addEventListener('blur', () => sent.removeAttribute('tabindex'), { once: true })
  }
}

document.addEventListener('change', (event) => {
  const box = event.target
  if (!(box instanceof HTMLInputElement) || box.type !== 'checkbox' || !box.closest('fg-set[path="/vaDeclaration"]')) return
  if (!box.checked) setSigned(false)
})
