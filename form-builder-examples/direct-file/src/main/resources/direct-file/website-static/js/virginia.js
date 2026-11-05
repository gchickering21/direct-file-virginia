// Everything Virginia that runs in the browser, imported once by fg-components.js so the IRS's file
// carries one line for the state. Each script does one thing, on /your-taxes/virginia/ routes only,
// and none writes a fact except sign (the declaration) and save (resume from a file); their words
// come from the locale through virginia-strings.js (the <template id="va-strings"> in
// fragments/js-templates.html), never from these files.

// A `?demo=N` or `?scenario=<name>` link: fetch the household into sessionStorage and reload, so the
// runtime starts from it. Nothing it does depends on the runtime, so it may run after it.
import './virginia-demo-link.js'
// The correction screens' before/after view. Presentation only; reads the graph, writes nothing.
import './virginia-corrections.js'
// Lines 20 to 22 from a stand-in for Virginia Tax's records (resources/data/virginia-records.json), once per identity.
import './virginia-records.js'
// The locality screen filled in from the federal ZIP code (resources/data/virginia-zip-localities.json).
import './virginia-locality.js'
// The USWDS combo box kept in step with the fact and with the runtime's validation errors.
import './virginia-combo-box.js'
// The sign screen's Send button and declaration box.
import './virginia-sign.js'
// Download your answers on the summary; resume from a file on the intro.
import './virginia-save.js'
// The page h1 on Virginia routes.
import './virginia-chrome.js'
