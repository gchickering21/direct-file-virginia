// Save and resume: the answers file.
//
// "Download your answers" on the summary writes the serialized Fact Graph, the same JSON the
// workspace's Scenario modal copies (factGraph.toJSON()), as a file. "Resume from a file" on the
// intro reads one back through the runtime's loadFactGraph(), which validates it against the
// dictionary, saves it and reloads the page. The words come from the locale through
// virginia-strings.js.
import { factGraph, loadFactGraph } from '../vendor/form-builder/flow-runtime/js/fg-fact-graph.js'
import { t } from './virginia-strings.js'

window.vaDownloadAnswers = function vaDownloadAnswers () {
  const blob = new Blob([factGraph.toJSON()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = t('save.filename')
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function status (text) {
  const button = document.querySelector('.va-resume button')
  if (!button) return
  let el = button.parentElement.querySelector('.va-resume__status')
  if (!el) {
    el = document.createElement('p')
    el.className = 'va-resume__status usa-error-message'
    el.setAttribute('role', 'status')
    button.insertAdjacentElement('afterend', el)
  }
  el.textContent = text
}

window.vaResumeFromFile = function vaResumeFromFile () {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,application/json'
  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      JSON.parse(text)
      loadFactGraph(text)
    } catch {
      status(t('save.resume-error'))
    }
  })
  input.click()
}
