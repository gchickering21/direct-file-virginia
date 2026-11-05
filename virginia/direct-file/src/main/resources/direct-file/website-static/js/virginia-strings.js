// The words this application's Virginia scripts show, read from the page rather than written here.
//
// website-static/ never passes through Thymeleaf, so a string in a script would be English on the
// Spanish site. fragments/js-templates.html renders a <template id="va-strings"> per language from
// the virginia.ui.* keys in locales/{en,es}.yaml; this reads it. A missing key returns the key
// itself, so a forgotten string shows up as its name rather than as nothing.
const strings = new Map()
let loaded = false

function load () {
  if (loaded) return
  loaded = true
  const template = document.getElementById('va-strings')
  if (!template) return
  for (const el of template.content.querySelectorAll('[data-va]')) strings.set(el.getAttribute('data-va'), el.textContent)
}

/** The string under `key`, with `{0}`, `{1}`… replaced by the arguments. */
export function t (key, ...args) {
  load()
  const text = strings.has(key) ? strings.get(key) : key
  return text.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? ''))
}

/** The page's language, which is what the generator stamps on <html lang>. */
export function lang () {
  return document.documentElement.lang || 'en'
}

/** Text to HTML, so a name a filer typed is never markup. */
export function esc (s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}
