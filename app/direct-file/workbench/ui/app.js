// The Rules Workbench page: the entry point index.html loads. No framework: state lives in `S`
// (state.js), every view is a function that returns HTML (views/), the router and chrome are
// shell.js, clicks are handled by delegation on data-act attributes (events.js). Every edit is held
// in the draft as a precise edit to the XML text (lib/xml-edit.js) and saved to the server as you go.
//
// The order of imports matters only here: events.js registers the page's listeners when it loads,
// and the last two lines start the page.
import './events.js'
import { $, esc } from './state.js'
import { refresh, route } from './shell.js'

window.addEventListener('hashchange', route)
route()
refresh().catch(e => { $('#main').innerHTML = `<p class="err">Could not load the rules: ${esc(e.message)}</p>` })
