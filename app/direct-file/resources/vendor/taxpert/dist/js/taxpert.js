import { CONFIG_CHANGE_EVENT, configure, configureFromUrl, getBuildConfig, getConfig, getConfigOverrides, isOverridden, resetAllConfigOverrides, resetConfigOverride, setConfigOverride, setConfigOverrides } from "../../shared/js/config.js";
import { OUTCOME_KINDS, resolveOutcome, setDescriptorKey } from "../../shared/js/outcome-kinds.js";
import { windowFactGraphAdapter } from "../../shared/js/graph-adapter.js";

//#region src/shared/js/templates.js
const registry = /* @__PURE__ */ new Map();
const loads = /* @__PURE__ */ new Map();
const isTemplate = (node) => node?.tagName === "TEMPLATE" && node.content != null;
/** Parse a bundle's template file and register every `<template id="…">` in it. */
function register(html) {
	const holder = document.createElement("template");
	holder.innerHTML = html;
	for (const template of holder.content.querySelectorAll("template[id]")) registry.set(template.id, template);
}
/**
* Register a bundle's templates from markup already in hand, as though loadTemplates() had just
* fetched `url`. The ids go in the registry and that URL is marked resolved, so an element that
* awaits loadTemplates(url) on connect gets the memo rather than a request.
*
* The bundled build (scripts/build.mjs) inlines all fourteen template files and calls this for each
* one, so a bundled host fetches no templates at all. A host that would rather fetch them never
* calls this, and a host that overrides one with `templates-base` still fetches its own, because
* templateUrl() hands loadTemplates a different key.
* See ../../../../../docs/internals/bundled-build.md.
*
* @param {string|URL} url the URL this markup stands in for
* @param {string} html    the template file's contents
*/
function registerTemplates(url, html) {
	register(html);
	loads.set(String(url), Promise.resolve());
}
/**
* Fetch and register every `<template id="…">` in a bundle's template file. Memoized per URL, so
* modules can start it at import time and elements can await it again on connect.
* @param {string|URL} url
* @returns {Promise<void>}
*/
function loadTemplates(url) {
	const key = String(url);
	let load = loads.get(key);
	if (load) return load;
	load = fetch(key).then((response) => {
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return response.text();
	}).then(register).catch((error) => {
		loads.delete(key);
		throw new Error(`taxpert: could not load templates from ${key} — ${error.message}`, { cause: error });
	});
	loads.set(key, load);
	return load;
}
/**
* A fresh clone of the template registered (or hosted) under `id`.
* @param {string} id
* @returns {DocumentFragment}
*/
function getTemplate(id) {
	const hosted = document.getElementById(id);
	if (isTemplate(hosted)) return hosted.content.cloneNode(true);
	const registered = registry.get(id);
	if (registered) return registered.content.cloneNode(true);
	const loaded = [...loads.keys()];
	throw new Error(`taxpert: no <template id="${id}"> on the page or in any loaded bundle (loaded: ${loaded.length ? loaded.join(", ") : "none"}). Did the owning bundle await loadTemplates() before rendering?`);
}
/** Whether `id` would resolve, for optional templates a host may or may not supply. */
function hasTemplate(id) {
	return isTemplate(document.getElementById(id)) || registry.has(id);
}
/**
* Where an element loads `file` from: its `templates-base` attribute when it has one, otherwise the
* bundle's own `templates/` directory.
* @param {Element|null} element
* @param {string|URL} bundleUrl the bundle's default template URL
* @param {string} file the template file's basename, re-resolved against an override base
*/
function templateUrl(element, bundleUrl, file) {
	const override = element?.getAttribute?.("templates-base");
	if (!override) return String(bundleUrl);
	const base = override.endsWith("/") ? override : `${override}/`;
	return String(new URL(base + file, document.baseURI));
}

//#endregion
//#region \0taxpert-bundle-templates
for (const [file, html] of Object.entries({
	"all-screens-toolbar.html": "<!--\n  Markup for <taxpert-screens-toolbar> — the sub-nav under the global nav, naming which of the\n  Experience Explorer's three destinations you are on: the Product Experience, Path Mode, or Browse\n  All.\n\n  Each is a separate destination in the global nav, not a checkbox on one page, so each names\n  itself. All three title blocks ship here and the element hides the two that aren't the current\n  mode — the copy is content, and content belongs in markup rather than in a MODES object in the JS.\n\n  Only the two screen listings have anything to filter. A path is one continuous scroll through a\n  single journey and the Product Experience is one screen at a time, so the tab strip is always\n  rendered and hidden — by `body.path-mode` and by `[mode=\"product\"]` on the host\n  (all-screens-toolbar.css) — rather than conditionally built.\n-->\n<template id=\"tst-toolbar\">\n  <!-- A <header> rather than role=\"toolbar\": it leads with the destination's <h1>, so it names the\n       page as much as it holds its section filter. -->\n  <header class=\"all-screens__toolbar\">\n    <div class=\"all-screens__toolbar-inner\">\n      <!-- On the Product Experience this block is the whole of the bar: there is no listing under\n           it to filter, and the <h1> is the workspace's name for the destination rather than the\n           page's own title — which is why the element does not sync document.title from it here. -->\n      <div class=\"all-screens__mode\" data-mode=\"product\">\n        <h1 class=\"all-screens__mode-title\">Product Experience</h1>\n        <p class=\"all-screens__mode-description\">The built user experience.</p>\n      </div>\n      <div class=\"all-screens__mode\" data-mode=\"path\">\n        <h1 class=\"all-screens__mode-title\">Path Mode</h1>\n        <p class=\"all-screens__mode-description\">Only what this Fact Graph&rsquo;s answers actually lead to, up to the next unanswered question.</p>\n      </div>\n      <div class=\"all-screens__mode\" data-mode=\"browse\">\n        <h1 class=\"all-screens__mode-title\">Browse All</h1>\n        <p class=\"all-screens__mode-description\">Every screen in the flow, unconditionally.</p>\n      </div>\n    </div>\n    <nav class=\"all-screens__section-tabs\" aria-label=\"Section\" role=\"tablist\">\n      <button class=\"all-screens__section-tab\" type=\"button\" role=\"tab\"\n              data-section=\"\" aria-selected=\"true\">All sections</button>\n    </nav>\n  </header>\n</template>\n\n<!-- One section tab. The element stamps the slug and the title. -->\n<template id=\"tst-section-tab\">\n  <button class=\"all-screens__section-tab\" type=\"button\" role=\"tab\" aria-selected=\"false\"></button>\n</template>\n",
	"audit-panel.html": "<!--\n  Markup for <taxpert-audit-panel> — the panel shell, its rail tabs, and the built-in section\n  bodies. Loaded by src/audit-panel/js/templates.js; see src/shared/js/templates.js for how a host\n  can override any of these by putting a <template> with the same id on the page (which is how\n  credit-assistant could server-render `#{...}`-translated copies later without touching this\n  package — the English literals below are what the ported Thymeleaf fragments' i18n keys became).\n\n  Every id here is a contract: the ported section modules query the document for them.\n-->\n\n<!-- ── Panel shell ──────────────────────────────────────────────────────────────────────────── -->\n\n<!--\n  The resizer handle, the content pane and the tab rail. Fixed shape — the sections that go inside\n  are cloned in separately, one per descriptor. aria-valuemin/max are re-set from JS as the\n  viewport changes; the values here are the defaults the panel starts from.\n-->\n<template id=\"tap-shell\">\n  <div class=\"audit-panel__resizer\"\n       id=\"audit-panel-resizer\"\n       role=\"separator\"\n       aria-label=\"Resize audit panel\"\n       aria-orientation=\"vertical\"\n       aria-valuemin=\"320\"\n       aria-valuemax=\"960\"\n       tabindex=\"0\"></div>\n  <div class=\"audit-panel__content\"></div>\n  <nav class=\"audit-panel__rail\" aria-label=\"Audit panel sections\">\n    <ul role=\"tablist\" aria-orientation=\"vertical\">\n      <li role=\"presentation\">\n        <button class=\"audit-panel__tab audit-panel__tab--toggle\"\n                id=\"toggle-audit-panel\"\n                type=\"button\"\n                aria-label=\"Toggle audit panel\"\n                aria-expanded=\"false\"\n                title=\"Toggle audit panel\">\n          <!-- USWDS navigate_far_before, inlined. One glyph, mirrored by CSS on\n               body.audit-panel-open (see panel-shell.css) to become navigate_far_next — rather\n               than swapping an <img src> at a credit-assistant-specific icon path, which 404s in\n               every other host. -->\n          <svg class=\"usa-icon audit-panel__tab-icon\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\">\n            <path fill=\"currentColor\" d=\"M18.41 16.59 13.82 12l4.59-4.59L17 6l-6 6 6 6zM6 6h2v12H6z\" />\n          </svg>\n        </button>\n      </li>\n    </ul>\n  </nav>\n</template>\n\n<!-- One rail tab. The panel stamps data-tab, aria-controls, the title and the two labels. -->\n<template id=\"tap-rail-tab\">\n  <li role=\"presentation\">\n    <button class=\"audit-panel__tab\" role=\"tab\" type=\"button\" aria-selected=\"false\">\n      <span class=\"audit-panel__tab-label\" aria-hidden=\"true\"></span>\n      <span class=\"usa-sr-only\"></span>\n    </button>\n  </li>\n</template>\n\n<!-- ── Section bodies ───────────────────────────────────────────────────────────────────────── -->\n\n<!--\n  Fact Inspector. `data-fact-path-input` / `data-track-selected-fact` / `data-clear-tracked-facts`\n  are the wiring contract audited-fact.js's wireFactInspector() binds listeners to — these carried\n  inline `onkeydown=`/`onclick=` attributes before, which need their handlers on `window` and are\n  blocked outright by any Content-Security-Policy worth having.\n-->\n<template id=\"tap-fact-inspector\">\n  <h2>Fact Inspector</h2>\n  <div id=\"audit-panel__fact-list\"></div>\n  <div class=\"usa-form-group\">\n    <label class=\"usa-label twe-question\" for=\"fact-select\">Fact Path</label>\n    <input list=\"fact-options\" class=\"usa-input\" id=\"fact-select\" data-fact-path-input>\n    <datalist id=\"fact-options\" aria-invalid=\"false\"></datalist>\n  </div>\n  <div class=\"usa-form-group\">\n    <label class=\"usa-label twe-question\" for=\"fact-collection-id\">Collection ID</label>\n    <input id=\"fact-collection-id\" class=\"usa-input\" type=\"text\" autocomplete=\"off\" aria-invalid=\"false\">\n  </div>\n  <button class=\"usa-button\" id=\"add-fact-button\" type=\"button\" data-track-selected-fact>Add fact</button>\n</template>\n\n<!-- Explain &amp; Analyze — the AI chat section (gated behind the ai-fact-explanation flag). -->\n<template id=\"tap-explain\">\n  <h2>Explain &amp; Analyze</h2>\n  <div id=\"chat-status\" class=\"chat-status\"></div>\n  <div id=\"chat-messages\" class=\"chat-messages\" role=\"log\" aria-live=\"polite\" aria-label=\"Chat conversation\"></div>\n  <div class=\"chat-input-row\">\n    <div class=\"usa-form-group\">\n      <label class=\"usa-label twe-question\" for=\"chat-fact-select\">Fact Path</label>\n      <div class=\"ap-fact-row\">\n        <input list=\"chat-fact-options\" class=\"usa-input\" id=\"chat-fact-select\" data-fact-path-input>\n        <button class=\"usa-button usa-button--unstyled\" type=\"button\"\n                title=\"Clear all tracked facts\" aria-label=\"Clear all tracked facts\"\n                data-clear-tracked-facts>Clear facts</button>\n      </div>\n      <datalist id=\"chat-fact-options\" aria-invalid=\"false\"></datalist>\n    </div>\n    <textarea class=\"chat-container__textarea\" placeholder=\"Ask about this application...\"\n              aria-label=\"Ask about this application\" rows=\"3\"></textarea>\n    <button id=\"chat-submit-btn\" class=\"chat-container__submit-btn\" type=\"button\"\n            aria-label=\"Submit question\">Send</button>\n  </div>\n</template>\n\n<!-- ── Fact Inspector card ──────────────────────────────────────────────────────────────────── -->\n\n<!--\n  The <audited-fact> shadow-root contents (formerly fragments/audit-panel/fact-template.html, then\n  a JS string in audited-fact.js). Cloned once per tracked fact; the `part=` names are the styling\n  contract a host page can reach the shadow root through.\n-->\n<template id=\"tap-fact\">\n  <h3 part=\"heading\" class=\"audit-panel__fact__path\"></h3>\n  <dl part=\"fact-data\">\n    <dt part=\"fact-term\">Fact Type:</dt>\n    <dd part=\"fact-definition\" class=\"audit-panel__fact__type\"></dd>\n  </dl>\n  <dl part=\"fact-data\">\n    <dt part=\"fact-term\">Value:</dt>\n    <dd part=\"fact-definition\" class=\"audit-panel__fact__value\"></dd>\n  </dl>\n  <div class=\"audit-panel__fact__definition\">\n    <pre part=\"code-block\"><code><slot name=\"definition\"></slot></code></pre>\n  </div>\n  <div class=\"audit-panel__fact__controls\">\n    <button part=\"remove-button\" class=\"usa-button audit-panel__fact__remove\" type=\"button\">Remove fact</button>\n  </div>\n</template>\n",
	"display-modal.html": "<!--\n  Body of the \"Display options\" modal (<taxpert-display-modal>). The <dialog> chrome around it is\n  the shared shell in ../../shared/templates/shared.html.\n\n  All three sections are present at all times; Layout is hidden where the destination does not offer\n  it rather than absent, so opening the modal never tears the dialog down and rebuilds it. The option\n  rows are per-entry clones of tdm-option-checkbox / tdm-option-radio — the only markup here that\n  varies, and it varies over a fixed list in display-modal.js.\n-->\n<template id=\"tdm-sections\">\n  <section class=\"tdm-section\">\n    <h2 class=\"tdm-section__title\">Visibility</h2>\n    <p class=\"tdm-section__hint\">Choose metadata and UI elements to make visible.</p>\n    <div class=\"tdm-section__options\" data-options=\"visibility\"></div>\n  </section>\n\n  <!-- The Product Experience shows one screen's worth of questions in a fixed reading order and\n       Path Mode reads one route through the flow, so neither has an arrangement to choose — Layout\n       belongs to Browse All. The element sets `hidden` on this section from its `mode`. -->\n  <section class=\"tdm-section\" data-section=\"layout\">\n    <h2 class=\"tdm-section__title\">Layout</h2>\n    <p class=\"tdm-section__hint\">Choose how items will be arranged in the workspace.</p>\n    <div class=\"tdm-section__options\" data-options=\"layout\"></div>\n  </section>\n\n  <!-- The language selector stays in the page viewport as well (it is part of the product, not the\n       workspace) — this is a second view of the same control, not a relocation of it. Hidden when\n       the host page has no selector to mirror. -->\n  <section class=\"tdm-section\" data-section=\"language\">\n    <h2 class=\"tdm-section__title\">Language</h2>\n    <p class=\"tdm-section__hint\">Choose language mode.</p>\n    <div class=\"usa-form-group tdm-form-group\">\n      <label class=\"usa-label usa-sr-only\" for=\"display-language-selector\">Select Language</label>\n      <select class=\"usa-select\" id=\"display-language-selector\" name=\"display-language-selector\"></select>\n    </div>\n  </section>\n\n  <!-- An optional host-supplied action, full width at the foot of the dialog — the workspace\n       settings modal's footer, same shape. It is a *command* rather than a preference, so it is\n       outside the sections: Fact Explorer puts \"Reset layout\" here. Hidden when no host sets one,\n       which is every host that only uses the built-in options. -->\n  <div class=\"tdm-footer\" data-footer hidden></div>\n</template>\n\n<!-- The footer's button. Cloned rather than constructed, so the classes live in markup. -->\n<template id=\"tdm-footer-button\">\n  <button class=\"usa-button usa-button--outline tdm-footer__button\" type=\"button\"></button>\n</template>\n\n<!-- One Visibility checkbox row: USWDS's own tile variant (`--tile` on the input), which draws the\n     box on the label itself — control art, checked and focus states, and the click target are all\n     USWDS's; display-modal.css only recolors the border and the selected fill. `.tdm-option` is\n     just the row hook. -->\n<template id=\"tdm-option-checkbox\">\n  <div class=\"tdm-option usa-checkbox\">\n    <input class=\"usa-checkbox__input usa-checkbox__input--tile\" type=\"checkbox\" name=\"display-visibility\">\n    <label class=\"usa-checkbox__label\"></label>\n  </div>\n</template>\n\n<!-- One Layout radio row, same tile treatment. -->\n<template id=\"tdm-option-radio\">\n  <div class=\"tdm-option usa-radio\">\n    <input class=\"usa-radio__input usa-radio__input--tile\" type=\"radio\" name=\"display-layout\">\n    <label class=\"usa-radio__label\"></label>\n  </div>\n</template>\n",
	"scenario-modal.html": "<!--\n  Body of the \"Manage scenario\" modal (<taxpert-scenario-modal>). The <dialog> chrome around it is\n  the shared shell in ../../shared/templates/shared.html.\n\n  One <section> per task, separated by a rule (see scenario-modal.css). Each leads with the task's\n  name and a one-line description of what pressing its button will do. Every id here is a\n  contract — fact-graph-io.js queries the document for them.\n-->\n<template id=\"tsm-sections\">\n  <section class=\"tsm-section tsm-section--inline\">\n    <div class=\"tsm-section__text\">\n      <h2 class=\"tsm-section__title\">Reset scenario</h2>\n      <p class=\"tsm-section__hint\">Clear all facts, responses, and progress.</p>\n    </div>\n    <fg-reset class=\"tsm-section__action\">\n      <button class=\"usa-button usa-button--outline\" type=\"reset\">Start over</button>\n    </fg-reset>\n  </section>\n\n  <section class=\"tsm-section tsm-section--inline\">\n    <div class=\"tsm-section__text\">\n      <h2 class=\"tsm-section__title\">Copy fact graph</h2>\n      <p class=\"tsm-section__hint\">Copy current fact graph to clipboard as JSON.</p>\n      <span id=\"copy-fg-status\" class=\"tsm-status\">Copied to clipboard!</span>\n    </div>\n    <button class=\"usa-button usa-button--outline tsm-section__action\" type=\"button\" id=\"copy-fact-graph-btn\">Copy fact graph</button>\n  </section>\n\n  <section class=\"tsm-section\">\n    <h2 class=\"tsm-section__title\">Paste fact graph</h2>\n    <p class=\"tsm-section__hint\">Paste and load JSON fact graph.</p>\n    <div class=\"usa-form-group tsm-section__row\">\n      <label class=\"usa-label usa-sr-only\" for=\"load-fact-graph\">Paste fact graph JSON</label>\n      <textarea id=\"load-fact-graph\" class=\"usa-textarea tsm-textarea\" rows=\"2\"></textarea>\n      <button class=\"usa-button usa-button--outline tsm-section__action\" type=\"button\" id=\"load-fact-graph-btn\">Load fact graph</button>\n    </div>\n  </section>\n\n  <!-- AI generation is an alpha feature: rendered always, revealed by\n       body.ff-ai-scenario-generation (shared/styles/feature-flags.css). -->\n  <section class=\"tsm-section\" id=\"scenario-gen-block\" data-ff=\"ai-scenario-generation\">\n    <h2 class=\"tsm-section__title\">\n      Generate a scenario\n      <span class=\"usa-tag tsm-tag\">Alpha</span>\n    </h2>\n    <p class=\"tsm-section__hint\">Generate and load a scenario with AI.</p>\n    <div class=\"usa-form-group tsm-section__row\">\n      <label class=\"usa-label usa-sr-only\" for=\"scenario-gen-prompt\">Describe the scenario you want</label>\n      <textarea class=\"usa-textarea tsm-textarea\" id=\"scenario-gen-prompt\" rows=\"2\"\n                placeholder=\"e.g. single filer, 2 qualifying children, 2024, ~$55k wages, disqualified\"></textarea>\n      <button class=\"usa-button usa-button--outline tsm-section__action\" type=\"button\" id=\"generate-scenario-btn\">Load AI scenario</button>\n    </div>\n    <div id=\"scenario-gen-status\" class=\"scenario-gen__status\" role=\"status\" aria-live=\"polite\"></div>\n    <div id=\"scenario-gen-result\" class=\"scenario-gen__result\" hidden=\"hidden\">\n      <p id=\"scenario-gen-description\" class=\"scenario-gen__description\"></p>\n      <button class=\"usa-button usa-button--outline\" type=\"button\" id=\"download-scenario-btn\">Download .json</button>\n    </div>\n  </section>\n\n  <section class=\"tsm-section\" id=\"scenario-library-block\">\n    <h2 class=\"tsm-section__title\">Load existing scenario</h2>\n    <p class=\"tsm-section__hint\">Select and load a scenario from the library.</p>\n    <div class=\"scenario-filters\"></div>\n    <div class=\"usa-form-group\">\n      <label class=\"usa-label\" for=\"scenario-select\">Existing scenarios</label>\n      <select class=\"usa-select\" id=\"scenario-select\">\n        <option value=\"\" disabled=\"disabled\" selected=\"selected\">- Select -</option>\n      </select>\n    </div>\n    <button class=\"usa-button usa-button--outline tsm-button--full\" type=\"button\" id=\"load-scenario-btn\">Load scenario</button>\n    <button type=\"button\" id=\"all-screens-clear-scenario\" class=\"usa-button usa-button--unstyled tsm-clear\">Clear scenario</button>\n  </section>\n</template>\n\n<!--\n  One host filter dropdown above the scenario <select>. The host owns the vocabulary (field\n  descriptors + parseFilename); the modal stamps the id, label and <option>s onto a clone of this.\n-->\n<template id=\"tsm-filter-field\">\n  <div class=\"usa-form-group\">\n    <label class=\"usa-label\"></label>\n    <select class=\"usa-select\"></select>\n  </div>\n</template>\n",
	"workspace-settings-modal.html": "<!--\n  Body of the \"Workspace settings\" modal (<taxpert-workspace-settings-modal>), opened from the\n  global nav's settings gear. The <dialog> chrome around it is the shared shell in\n  ../../shared/templates/shared.html.\n\n  WHAT IS IN HERE IS THE HOST'S, NOT OURS. Every row below is cloned per entry in the host's\n  configuration — one per `config.featureFlags`, one per tool in `config.tools` — rather than\n  hand-written here. The rows used to be two fixed checkboxes naming credit-assistant's AI features,\n  which meant a second host was shown another application's roadmap and could switch it on.\n\n  Changes are stored as *overrides* (config.js's third layer, in localStorage) and take effect\n  immediately: configure() and setConfigOverride() both dispatch the same event every element\n  already re-reads on. Nothing here writes to the page directly.\n\n  EVERY OVERRIDDEN THING SAYS SO. A section whose configuration has been edited shows `twsm-override`\n  with a Reset beside it, and the modal ends in a reset-everything button. Without that, a stale\n  localStorage record quietly reshapes the workspace and produces bug reports nobody can reproduce\n  from the source tree — which is the main hazard of making configuration editable at all.\n\n  EVERY SECTION IS A SHUT <details>. The modal opens as a list of titles with a disclosure arrow\n  each, and one is unfolded at a time. This is the same move the Outcomes rows already made for the\n  same reason: the sections are a stack of unrelated editors, and stacked open they ran to several\n  screens, so the shape of the thing could not be read without scrolling it. The <h2> stays inside\n  the <summary> — summary's content model allows heading content — so the modal keeps its document\n  outline. One consequence worth knowing: a `twsm-override` marker now sits inside a shut section,\n  so the footer's reset-everything button is the only always-visible sign that anything is\n  overridden.\n\n  Real USWDS component markup (.usa-checkbox, .usa-button, .usa-modal__*), same as the other two\n  modals — USWDS is the project's default for form controls, not a credit-assistant-only\n  convenience. This modal is also mounted in fact-explorer (via\n  taxpert/react/workspace-settings-modal), which vendors its own real USWDS (see its\n  src/styles/uswds.scss) specifically so this markup renders correctly there too.\n-->\n<template id=\"twsm-sections\">\n  <details class=\"twsm-section\" data-section=\"flags\">\n    <summary class=\"twsm-section__summary\">\n      <h2 class=\"twsm-section__title\">Feature Flags</h2>\n      <!-- The native disclosure marker is hidden (workspace-settings-modal.css) in favor of this\n           one, so it can sit at the row's trailing edge instead of leading the title — USWDS's own\n           `expand_more` glyph, the same path the tool panels' row chevrons already draw. -->\n      <svg class=\"twsm-section__chevron\" aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 24 24\">\n        <path fill=\"currentColor\" d=\"M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z\" />\n      </svg>\n    </summary>\n    <p class=\"twsm-section__hint\">\n      Enable feature flags to override the default build\n    </p>\n    <div class=\"twsm-options\" data-options=\"flags\"></div>\n    <p class=\"twsm-empty\" data-empty=\"flags\" hidden>This application declares no feature flags.</p>\n  </details>\n\n  <!--\n    The Outcome tracker's content. A determination is JSON end to end — that is what outcome-kinds.js\n    made true — so the whole list can be edited here and stored as a `determinations` override.\n\n    Fact paths are typed against a <datalist> of everything the graph knows rather than a combo box\n    per field: a determination carries up to fourteen paths, and fourteen ARIA comboboxes is a lot of\n    machinery for a field whose whole job is \"type, with suggestions\". The datalist is built once and\n    shared by every path input in the section.\n  -->\n  <details class=\"twsm-section\" data-section=\"outcomes\">\n    <summary class=\"twsm-section__summary\">\n      <h2 class=\"twsm-section__title\">Outcomes</h2>\n      <svg class=\"twsm-section__chevron\" aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 24 24\">\n        <path fill=\"currentColor\" d=\"M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z\" />\n      </svg>\n    </summary>\n    <p class=\"twsm-section__hint\">\n     Configure the Outcome tracker. Each outcome names the one fact that <em>is</em> the answer,\n      how that fact is spoken, and the facts that feed it.\n    </p>\n    <div class=\"twsm-outcomes\" data-options=\"outcomes\"></div>\n    <p class=\"twsm-empty\" data-empty=\"outcomes\" hidden>\n      This application tracks no outcomes.\n    </p>\n    <datalist id=\"twsm-fact-paths\"></datalist>\n    <button class=\"usa-button usa-button--outline twsm-add\" type=\"button\" data-add=\"outcome\">\n      Add outcome\n    </button>\n    <p class=\"twsm-override\" data-override=\"determinations\" hidden>\n      Changed from the build default.\n      <button class=\"usa-button usa-button--unstyled twsm-reset\" type=\"button\"\n              data-reset=\"determinations\">\n        Reset\n      </button>\n    </p>\n  </details>\n\n    <!--\n    Which tools this workspace *offers* — not which are currently open, which is the Tools modal's\n    question. Unticking one removes it from the Tools modal and from the dock, and writes a `tools`\n    override.\n  -->\n  <details class=\"twsm-section\" data-section=\"tools\">\n    <summary class=\"twsm-section__summary\">\n      <h2 class=\"twsm-section__title\">Tools</h2>\n      <svg class=\"twsm-section__chevron\" aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 24 24\">\n        <path fill=\"currentColor\" d=\"M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z\" />\n      </svg>\n    </summary>\n    <p class=\"twsm-section__hint\">\n      The tools this workspace offers. A tool switched off here is not listed in the Tools modal and\n      cannot be opened.\n    </p>\n    <div class=\"twsm-options\" data-options=\"tools\"></div>\n    <p class=\"twsm-empty\" data-empty=\"tools\" hidden>This workspace offers no tools.</p>\n    <p class=\"twsm-override\" data-override=\"tools\" hidden>\n      Changed from the build default.\n      <button class=\"usa-button usa-button--unstyled twsm-reset\" type=\"button\" data-reset=\"tools\">\n        Reset\n      </button>\n    </p>\n  </details>\n\n  <!--\n    Penultimate, and the only section that is not a setting in the same sense: it changes which\n    application the workspace is laid over rather than how this workspace behaves. It sits down here\n    with Advanced rather than at the top because it is a rare, deliberate act — the sections above\n    are what someone opens this modal for.\n\n    It replaced two controls that did the same job in two places and agreed with neither: a grid of\n    application cards on the landing page (which made a page whose whole point is to be empty), and\n    an \"App:\" <select> in fact-explorer's own header (which existed only there, so an application\n    could not be swapped from the application itself). Being a workspace setting means it is\n    reachable from the gear on every page of every host — which is the only place that is true.\n\n    SWITCHING KEEPS THE DESTINATION. Each row lists an application's modes, and choosing one goes to\n    the mode you are already on — Browse All to Browse All, Path Mode to Path Mode — falling back to\n    the application's first mode when it has no counterpart. See shared/js/apps.js.\n\n    The whole section is absent for a host that is the only application there is: one option is a\n    label, not a picker.\n  -->\n  <details class=\"twsm-section\" data-section=\"apps\" hidden>\n    <summary class=\"twsm-section__summary\">\n      <h2 class=\"twsm-section__title\">Applications</h2>\n      <svg class=\"twsm-section__chevron\" aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 24 24\">\n        <path fill=\"currentColor\" d=\"M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z\" />\n      </svg>\n    </summary>\n    <p class=\"twsm-section__hint\">\n      Available Applications\n    </p>\n    <div class=\"twsm-apps\" data-options=\"apps\" role=\"radiogroup\" aria-label=\"Application\"></div>\n  </details>\n\n  <!--\n    Last. Everything above is a switch or a list with its own words; this is raw configuration, and\n    two of its fields change where the workspace talks to the network. Endpoints in particular are\n    behind a disclosure on purpose: an editable apiBase points the chat and scenario-generation\n    backends at any origin, which should take a deliberate second click rather than sitting beside a\n    checkbox. It reads as one of the sections now because they are all disclosures — this one was\n    simply first, and is now last but one — Applications sits above it.\n  -->\n  <details class=\"twsm-section\" data-section=\"advanced\">\n    <summary class=\"twsm-section__summary\">\n      <h2 class=\"twsm-section__title\">Advanced</h2>\n      <svg class=\"twsm-section__chevron\" aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 24 24\">\n        <path fill=\"currentColor\" d=\"M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z\" />\n      </svg>\n    </summary>\n\n    <div class=\"twsm-field\">\n      <label class=\"usa-label twsm-field__label\" for=\"twsm-endpoints\">\n        Endpoints, one “name = value” per line\n      </label>\n      <textarea class=\"usa-textarea twsm-facts\" id=\"twsm-endpoints\" rows=\"3\"\n                data-field=\"endpoints\"></textarea>\n    </div>\n    <p class=\"twsm-override\" data-override=\"endpoints\" hidden>\n      Changed from the build default.\n      <button class=\"usa-button usa-button--unstyled twsm-reset\" type=\"button\"\n              data-reset=\"endpoints\">\n        Reset\n      </button>\n    </p>\n\n    <!--\n      The whole override record, as text. This is how a setup is shared: localStorage belongs to one\n      browser, and there is no server to keep it on. It is also the escape hatch for anything the\n      sections above do not offer a control for — the nav taxonomy, `strings` — without this modal\n      having to grow a bespoke editor per namespace.\n    -->\n    <div class=\"twsm-field\">\n      <label class=\"usa-label twsm-field__label\" for=\"twsm-import\">\n        All workspace overrides (JSON)\n      </label>\n      <textarea class=\"usa-textarea twsm-facts\" id=\"twsm-import\" rows=\"8\"\n                data-field=\"overrides\" spellcheck=\"false\"></textarea>\n    </div>\n    <p class=\"twsm-error\" data-error=\"import\" hidden></p>\n    <div class=\"twsm-outcome__actions\">\n      <button class=\"usa-button\" type=\"button\" data-action=\"import\">Apply JSON</button>\n      <button class=\"usa-button usa-button--unstyled\" type=\"button\" data-action=\"revert-import\">\n        Discard edits\n      </button>\n    </div>\n  </details>\n\n  <!--\n    Scoped to the configuration overrides, and says so. Feature flags keep their own record and\n    their own visible checkboxes with a build default each, so they are already resettable one at a\n    time and do not need sweeping up here.\n  -->\n  <div class=\"twsm-footer\" hidden>\n    <button class=\"usa-button usa-button--outline twsm-reset-all\" type=\"button\">\n      Reset configuration to the build defaults\n    </button>\n  </div>\n</template>\n\n<!--\n  One row: a feature flag, or a tool. `usa-checkbox__input--tile` is USWDS's tile variant — the\n  bordered box is the label, so the whole box is the click target and its selected fill follows from\n  `:checked` — no JS class mirror, and no bespoke box in workspace-settings-modal.css beyond\n  recoloring it.\n\n  The id, value, `data-flag`/`data-tool` and label text are stamped on per entry.\n-->\n<template id=\"twsm-option\">\n  <div class=\"twsm-option usa-checkbox\">\n    <input class=\"usa-checkbox__input usa-checkbox__input--tile\" type=\"checkbox\">\n    <label class=\"usa-checkbox__label\"></label>\n  </div>\n</template>\n\n<!--\n  One application. A radio rather than a checkbox because the workspace is over exactly one at a\n  time, and USWDS's tile variant for the same reason the flag and tool rows use it — the bordered\n  box is the label, so the whole row is the click target and its selected fill follows from\n  `:checked` with no JS class mirror.\n\n  The modes line is inside the <label> so it is part of that click target, and is filled with the\n  application's own destination labels — the host's words, not ours. A row is not a link: choosing\n  it navigates through the same resolution as the switch (see apps.js), which depends on where you\n  are now and so cannot be baked into an href here.\n-->\n<template id=\"twsm-app\">\n  <div class=\"twsm-app usa-radio\">\n    <input class=\"usa-radio__input usa-radio__input--tile\" type=\"radio\" name=\"workspace-settings-app\">\n    <label class=\"usa-radio__label\">\n      <span class=\"twsm-app__name\"></span>\n      <span class=\"twsm-app__modes\"></span>\n    </label>\n  </div>\n</template>\n\n<!--\n  One determination. Shut by default — the list is read far more often than it is edited, and an\n  accordion per row keeps the modal the same height whether a host tracks one outcome or six.\n-->\n<template id=\"twsm-outcome\">\n  <details class=\"twsm-outcome\">\n    <summary class=\"twsm-outcome__summary\">\n      <span class=\"twsm-outcome__label\"></span>\n    </summary>\n    <div class=\"twsm-outcome__body\">\n      <div class=\"twsm-field\">\n        <label class=\"usa-label twsm-field__label\" data-field=\"label-for\">Name</label>\n        <input class=\"usa-input\" type=\"text\" data-field=\"label\">\n      </div>\n      <div class=\"twsm-field\">\n        <label class=\"usa-label twsm-field__label\" data-field=\"rollup-for\">\n          Outcome fact\n        </label>\n        <input class=\"usa-input\" type=\"text\" list=\"twsm-fact-paths\" data-field=\"rollupPath\">\n      </div>\n      <div class=\"twsm-field\">\n        <label class=\"usa-label twsm-field__label\" data-field=\"kind-for\">Spoken as</label>\n        <select class=\"usa-select\" data-field=\"kind\"></select>\n      </div>\n      <div class=\"twsm-kind-fields\" data-field=\"kind-fields\"></div>\n\n      <div class=\"twsm-sections\" data-field=\"sections\"></div>\n      <div class=\"twsm-outcome__actions\">\n        <button class=\"usa-button usa-button--unstyled\" type=\"button\" data-action=\"add-section\">\n          Add group\n        </button>\n        <button class=\"usa-button usa-button--unstyled\" type=\"button\" data-action=\"move-up\">\n          Move up\n        </button>\n        <button class=\"usa-button usa-button--unstyled\" type=\"button\" data-action=\"move-down\">\n          Move down\n        </button>\n        <button class=\"usa-button usa-button--unstyled twsm-remove\" type=\"button\"\n                data-action=\"remove\">\n          Remove outcome\n        </button>\n      </div>\n    </div>\n  </details>\n</template>\n\n<!-- One group of facts inside a determination. The paths are a textarea, one per line: a group can\n     hold a dozen, and a row each would bury the heading it belongs to. -->\n<template id=\"twsm-outcome-section\">\n  <fieldset class=\"usa-fieldset twsm-outcome-section\">\n    <div class=\"twsm-field\">\n      <label class=\"usa-label twsm-field__label\" data-field=\"heading-for\">Group name</label>\n      <input class=\"usa-input\" type=\"text\" data-field=\"heading\">\n    </div>\n    <div class=\"twsm-field\">\n      <label class=\"usa-label twsm-field__label\" data-field=\"facts-for\">\n        Facts, one path per line\n      </label>\n      <textarea class=\"usa-textarea twsm-facts\" rows=\"4\" data-field=\"facts\"></textarea>\n    </div>\n    <button class=\"usa-button usa-button--unstyled twsm-remove\" type=\"button\"\n            data-action=\"remove-section\">\n      Remove group\n    </button>\n  </fieldset>\n</template>\n\n<!-- One labelled text field, cloned per property of whichever outcome kind is selected. -->\n<template id=\"twsm-kind-field\">\n  <div class=\"twsm-field\">\n    <label class=\"usa-label twsm-field__label\"></label>\n    <input class=\"usa-input\" type=\"text\">\n  </div>\n</template>\n",
	"global-nav.html": "<!--\n  Markup for <taxpert-global-nav> — the shared Taxpert app-switcher header.\n\n  Everything the nav can show is here and is built exactly once, on connect. State changes —\n  opening the menu, expanding a group, switching destination, turning the workspace on — move\n  attributes; global-nav.css decides what that means visually. Nothing is torn down and rebuilt,\n  which is what lets `.tgn-group:has(.tgn-item[aria-current])` mark the group you're in: its\n  children are always in the DOM, whether or not the group is expanded.\n-->\n\n<!--\n  The icon sprite. Inlined <symbol>s rather than a <use href> against the host's own sprite file so\n  the bundle stays self-contained: hosts without credit-assistant's vendored USWDS icons still get\n  icons. Appended to the document once, ahead of the bar.\n-->\n<template id=\"tgn-sprite\">\n  <svg class=\"tgn-sprite\" aria-hidden=\"true\" focusable=\"false\" width=\"0\" height=\"0\">\n    <symbol id=\"tgn-icon-settings\" viewBox=\"0 0 24 24\">\n      <path fill=\"currentColor\" d=\"M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z\" />\n    </symbol>\n    <symbol id=\"tgn-icon-tune\" viewBox=\"0 0 24 24\">\n      <path fill=\"currentColor\" d=\"M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z\" />\n    </symbol>\n    <symbol id=\"tgn-icon-visibility\" viewBox=\"0 0 24 24\">\n      <path fill=\"currentColor\" d=\"M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z\" />\n    </symbol>\n    <symbol id=\"tgn-icon-build\" viewBox=\"0 0 24 24\">\n      <path fill=\"currentColor\" d=\"m22.7 19-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z\" />\n    </symbol>\n    <symbol id=\"tgn-icon-expand_more\" viewBox=\"0 0 24 24\">\n      <path fill=\"currentColor\" d=\"M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z\" />\n    </symbol>\n  </svg>\n</template>\n\n<!--\n  The bar: waffle, breadcrumb, tool strip, dropdown. The dropdown is always in the DOM; the\n  waffle's aria-expanded is what shows it (`.tgn-waffle[aria-expanded=\"true\"] ~ .tgn-menu`), so\n  there is no second class saying the same thing.\n-->\n<template id=\"tgn-bar\">\n  <nav class=\"tgn-bar\" aria-label=\"Taxpert workspace\">\n    <button class=\"tgn-waffle\" type=\"button\" aria-haspopup=\"true\" aria-expanded=\"false\"\n            aria-label=\"Open Taxpert workspace menu\">\n      <span class=\"tgn-waffle__grid\" aria-hidden=\"true\">\n        <span class=\"tgn-waffle__dot\"></span>\n        <span class=\"tgn-waffle__dot\"></span>\n        <span class=\"tgn-waffle__dot\"></span>\n        <span class=\"tgn-waffle__dot\"></span>\n        <span class=\"tgn-waffle__dot\"></span>\n        <span class=\"tgn-waffle__dot\"></span>\n        <span class=\"tgn-waffle__dot\"></span>\n        <span class=\"tgn-waffle__dot\"></span>\n        <span class=\"tgn-waffle__dot\"></span>\n      </span>\n    </button>\n\n    <!-- Its accessible name is its own text: \"Taxpert\", then the context when there is one. (It\n         used to also carry an aria-label composing the two, which a <span> can't be named by —\n         a generic role takes no accessible name, so nothing ever read it.) -->\n    <span class=\"tgn-breadcrumb\">\n      <span class=\"tgn-breadcrumb__root\">Taxpert</span>\n      <!-- The workspace context (mode) only exists while the workspace is on; with it off the nav\n           reverts to its starting state — just the \"Taxpert\" root. -->\n      <span class=\"tgn-breadcrumb__sep\" aria-hidden=\"true\" hidden>|</span>\n      <span class=\"tgn-breadcrumb__ctx\" hidden></span>\n    </span>\n\n    <!-- The tool strip is a workspace feature and each tool picks its own destinations; every tool\n         is rendered and `hidden` when it doesn't apply, and the strip hides itself when none do\n         (see global-nav.css). -->\n    <div class=\"tgn-tools\" role=\"toolbar\" aria-label=\"Workspace tools\"></div>\n\n    <div class=\"tgn-menu\" role=\"menu\">\n      <div class=\"tgn-workspace\">\n        <span class=\"tgn-workspace__label\"></span>\n        <div class=\"tgn-workspace__controls\">\n          <button class=\"tgn-toggle\" type=\"button\" role=\"switch\" aria-checked=\"false\">\n            <span class=\"tgn-toggle__knob\"></span>\n          </button>\n          <!-- Workspace settings. Announces itself via nav-tool-select like the tool strip;\n               <taxpert-workspace-settings-modal> is the surface that listens and opens. -->\n          <button class=\"workplace-settings\" type=\"button\" aria-haspopup=\"dialog\"\n                  aria-label=\"Workspace settings\" title=\"Workspace settings\">\n            <svg class=\"workplace-settings__icon\" aria-hidden=\"true\" focusable=\"false\">\n              <use href=\"#tgn-icon-settings\"></use>\n            </svg>\n          </button>\n        </div>\n      </div>\n      <!-- The mode/nav taxonomy is appended here as further children of .tgn-menu, so the\n           `.tgn-menu > * + *` divider rule keeps applying to it. -->\n    </div>\n  </nav>\n</template>\n\n<!-- One tool button in the bar's strip. -->\n<template id=\"tgn-tool\">\n  <button class=\"tgn-tool\" type=\"button\" aria-haspopup=\"dialog\">\n    <svg class=\"tgn-tool__icon\" aria-hidden=\"true\" focusable=\"false\"><use></use></svg>\n    <span class=\"tgn-tool__label\"></span>\n  </button>\n</template>\n\n<!--\n  A group: an accordion header plus its children. The chevron is the only thing distinguishing a\n  group from a destination you can navigate to, now that a group can arrive collapsed.\n  aria-expanded on the header is what hides the items — the children are always built.\n-->\n<template id=\"tgn-group\">\n  <div class=\"tgn-group\">\n    <button class=\"tgn-group__header\" type=\"button\" aria-expanded=\"false\">\n      <span class=\"tgn-group__label\"></span>\n      <svg class=\"tgn-group__chevron\" aria-hidden=\"true\" focusable=\"false\">\n        <use href=\"#tgn-icon-expand_more\"></use>\n      </svg>\n    </button>\n    <div class=\"tgn-group__items\"></div>\n  </div>\n</template>\n\n<!-- A leaf: a destination. The check is present on every leaf and shown only on the one carrying\n     aria-current (global-nav.css), so \"you are here\" has a single representation. -->\n<template id=\"tgn-item\">\n  <a class=\"tgn-item\" role=\"menuitem\">\n    <span class=\"tgn-item__label\"></span>\n    <span class=\"tgn-item__check\" aria-hidden=\"true\">&#x2713;</span>\n  </a>\n</template>\n",
	"shared.html": "<!--\n  Cross-bundle markup. Loaded by src/shared/js/modal-shell.js; see src/shared/js/templates.js for\n  how a bundle's templates/ file is fetched and how a host can override any template by putting a\n  <template> with the same id on the page.\n-->\n\n<!--\n  The <dialog> chrome shared by the three workspace modals (Manage scenario, Display options,\n  Workspace settings). Each supplied its own byte-identical copy of this before; buildModalShell()\n  stamps the per-modal id, heading, and `tsm-`/`tdm-`/`twsm-` class prefix onto the clone.\n\n  Deliberately not `usa-modal--dialog`: that class is credit-assistant's flow-modal skin (30rem,\n  flex, its own close-button wiring in modals.js) and these dialogs are their own design. The USWDS\n  modal component classes inside still apply.\n\n  `closedby=\"any\"` gives light-dismiss (backdrop click / Escape) where the browser supports it.\n-->\n<template id=\"tms-shell\">\n  <dialog closedby=\"any\">\n    <div class=\"usa-modal__content\">\n      <div class=\"usa-modal__main\">\n        <button class=\"usa-button usa-modal__close\" type=\"button\" aria-label=\"Close this window\">\n          <svg viewBox=\"0 0 24 24\" class=\"usa-icon\" aria-hidden=\"true\" focusable=\"false\">\n            <path fill=\"currentColor\"\n                  d=\"M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z\" />\n          </svg>\n        </button>\n        <h1 class=\"usa-modal__heading\"></h1>\n      </div>\n    </div>\n  </dialog>\n</template>\n",
	"inspect.html": "<!--\n  Markup for the Inspect tool: the panel body (<taxpert-inspect>), the accordion rows it builds for\n  the selected rendered unit, and the two detail shapes those rows expand into.\n\n  Split out of tool-panel.html for the same reason watchlist.html and outcome-tracker.html are: it is\n  fetched only once the tool is actually switched on.\n\n  As everywhere in this package, ids here are a contract: getTemplate(id) checks\n  document.getElementById(id) first, so credit-assistant can server-render a translated\n  <template id=\"ttp-inspect\"> and it wins over this copy with no change to the JS.\n-->\n\n<!--\n  The panel body. Both states are always present and one of them is `hidden`, rather than the body\n  being torn down and rebuilt on every selection: the empty state is what the panel opens on and\n  what it returns to, and swapping an attribute is cheaper than re-cloning the illustration.\n-->\n<template id=\"ttp-inspect\">\n  <div class=\"ttp-inspect\">\n    <!-- Nothing selected yet. The heading is the panel's whole instruction; the illustration below\n         it is decorative but labelled, because it is the only thing in the panel a reader could\n         mistake for content. -->\n    <div class=\"ttp-inspect__empty\" data-region=\"empty\">\n      <h3 class=\"ttp-inspect__empty-title\">Select an item to get started</h3>\n      <p class=\"ttp-inspect__empty-hint\">\n        Click/hover on/over a screen, question, UI element or fact to view details here\n      </p>\n      <svg class=\"ttp-inspect__empty-art\" viewBox=\"0 0 176 240\" role=\"img\"\n           aria-label=\"A screen with one of its options being pointed at\">\n        <rect x=\"10\" y=\"10\" width=\"156\" height=\"220\" rx=\"10\"\n              fill=\"none\" stroke=\"currentColor\" stroke-width=\"5\" />\n        <rect x=\"34\" y=\"52\" width=\"108\" height=\"11\" rx=\"4\" class=\"ttp-inspect__empty-bar\" />\n        <rect x=\"34\" y=\"80\" width=\"108\" height=\"11\" rx=\"4\" class=\"ttp-inspect__empty-bar\" />\n        <rect x=\"34\" y=\"108\" width=\"108\" height=\"11\" rx=\"4\" class=\"ttp-inspect__empty-bar\" />\n        <circle cx=\"41\" cy=\"152\" r=\"8\" class=\"ttp-inspect__empty-dot\" />\n        <rect x=\"58\" y=\"145\" width=\"84\" height=\"14\" rx=\"4\" class=\"ttp-inspect__empty-bar\" />\n        <circle cx=\"41\" cy=\"184\" r=\"8\" class=\"ttp-inspect__empty-dot ttp-inspect__empty-dot--dim\" />\n        <rect x=\"58\" y=\"177\" width=\"60\" height=\"14\" rx=\"4\" class=\"ttp-inspect__empty-bar\" />\n        <path d=\"M108 138 L108 176 L118 166 L126 182 L134 178 L126 162 L140 160 Z\"\n              class=\"ttp-inspect__empty-cursor\" stroke-width=\"4\" stroke-linejoin=\"round\" />\n      </svg>\n    </div>\n\n    <!-- One rendered unit's objects. The title is the question as the page renders it, so it\n         carries whatever <fg-show> substitutions the copy contains. -->\n    <div class=\"ttp-inspect__selected\" data-region=\"selected\" hidden>\n      <h3 class=\"ttp-body__title\" data-field=\"title\"></h3>\n      <p class=\"ttp-body__hint\">\n        These objects define the data, visibility, and presentation of this item.\n      </p>\n      <div class=\"ttp-inspect__rows\"></div>\n    </div>\n  </div>\n</template>\n\n<!--\n  One object behind the selected unit — its fact, its flow condition, or a condition inside its copy.\n  A <details>, so expanding it is browser behaviour rather than a click handler with an aria-expanded\n  to keep in step; the chevron turn is `details[open]` in tool-panel.css.\n\n  The icon, label and path are written by the JS, and the expanded body is mounted into\n  `[data-region=\"detail\"]` from one of the two detail templates below.\n-->\n<template id=\"ttp-inspect-row\">\n  <details class=\"ttp-row ttp-inspect__row\">\n    <summary class=\"ttp-row__summary\">\n      <svg class=\"ttp-row__icon\" aria-hidden=\"true\" focusable=\"false\"><use href=\"#ttp-icon-info\"></use></svg>\n      <span class=\"ttp-row__text\">\n        <span class=\"ttp-row__label\" data-field=\"label\"></span>\n        <span class=\"ttp-row__path\" data-field=\"path\"></span>\n      </span>\n      <svg class=\"ttp-row__chevron\" aria-hidden=\"true\" focusable=\"false\"><use href=\"#ttp-icon-expand_more\"></use></svg>\n    </summary>\n    <div class=\"ttp-row__detail ttp-inspect__detail\" data-region=\"detail\"></div>\n  </details>\n</template>\n\n<!--\n  A fact row's body: what the fact is worth right now, what it is for, and — behind the Advanced\n  disclosure — the dictionary definition itself.\n\n  The Purpose section is hidden when the dictionary has no <Description> for the fact; a heading over\n  nothing reads as a missing value rather than an absent one.\n-->\n<template id=\"ttp-inspect-fact-detail\">\n  <div class=\"ttp-inspect__section\">\n    <h4 class=\"ttp-inspect__heading\">Current state</h4>\n    <dl class=\"ttp-inspect__data\">\n      <!-- <div> is valid inside a <dl> and keeps each term with its own definition, which is what\n           makes the two-column grid possible. -->\n      <div class=\"ttp-inspect__data-row\">\n        <dt>Current value</dt>\n        <dd data-field=\"value\"></dd>\n      </div>\n      <div class=\"ttp-inspect__data-row\">\n        <dt>Data type</dt>\n        <dd data-field=\"type\"></dd>\n      </div>\n    </dl>\n  </div>\n\n  <div class=\"ttp-inspect__section\" data-region=\"purpose\">\n    <h4 class=\"ttp-inspect__heading\">Purpose</h4>\n    <p class=\"ttp-inspect__prose\" data-field=\"purpose\"></p>\n  </div>\n\n  <div data-mount=\"advanced\"></div>\n</template>\n\n<!--\n  A condition row's body — used for both the flow condition and a condition inside the copy, because\n  the two answer the same two questions and differ only in wording, which the JS supplies.\n\n  The Dependencies table is hidden when the condition's fact has none (a <Writable> gate depends on\n  nothing but itself), as is the clause list when there is no <Derived> tree to unfold.\n-->\n<template id=\"ttp-inspect-condition-detail\">\n  <div class=\"ttp-inspect__section\">\n    <h4 class=\"ttp-inspect__heading\">How it&rsquo;s evaluated</h4>\n    <p class=\"ttp-inspect__prose\" data-field=\"lead\"></p>\n    <ul class=\"ttp-inspect__clauses\" data-region=\"clauses\" hidden></ul>\n  </div>\n\n  <div class=\"ttp-inspect__section\" data-region=\"dependencies\">\n    <h4 class=\"ttp-inspect__heading\">Dependencies</h4>\n    <p class=\"ttp-inspect__prose\" data-field=\"depends\"></p>\n    <table class=\"ttp-inspect__deps\">\n      <thead>\n        <tr>\n          <th scope=\"col\">Fact</th>\n          <th scope=\"col\">Current value</th>\n        </tr>\n      </thead>\n      <tbody data-region=\"dep-rows\"></tbody>\n    </table>\n  </div>\n\n  <div data-mount=\"advanced\"></div>\n</template>\n\n<!-- One plain-language clause under \"How it's evaluated\". Its words are appended as text and\n     <strong> nodes by the JS, so a negation is emphasis in the markup rather than a class. -->\n<template id=\"ttp-inspect-clause\">\n  <li class=\"ttp-inspect__clause\"></li>\n</template>\n\n<template id=\"ttp-inspect-clause-text\">\n  <span></span>\n</template>\n\n<template id=\"ttp-inspect-clause-strong\">\n  <strong></strong>\n</template>\n\n<!-- One dependency and what it is currently worth. -->\n<template id=\"ttp-inspect-dep\">\n  <tr class=\"ttp-inspect__dep\">\n    <th scope=\"row\" class=\"ttp-inspect__dep-path\" data-field=\"path\"></th>\n    <td class=\"ttp-inspect__dep-value\" data-field=\"value\"></td>\n  </tr>\n</template>\n\n<!--\n  The Advanced disclosure both detail shapes end in: the fact's raw dictionary XML with each\n  <Dependency> annotated with its current value — the readable form of factGraph.debugFact().\n\n  Closed until it is asked for. The sections above it are the answer; this is the working behind the\n  answer, and unfolding a screenful of XML under every row the reader opens buries the part they\n  came for. The \"Fact type\" line is hidden on a condition row, where the row's own wording has\n  already said what kind of fact it is.\n-->\n<template id=\"ttp-inspect-advanced\">\n  <details class=\"ttp-inspect__advanced\">\n    <summary class=\"ttp-inspect__advanced-summary\">\n      <span class=\"ttp-inspect__advanced-title\">Advanced</span>\n      <span class=\"ttp-inspect__advanced-note\">(technical details)</span>\n      <svg class=\"ttp-row__chevron\" aria-hidden=\"true\" focusable=\"false\"><use href=\"#ttp-icon-expand_more\"></use></svg>\n    </summary>\n    <p class=\"ttp-inspect__fact-type\" data-region=\"fact-type\">\n      <span class=\"ttp-inspect__fact-type-label\">Fact type:</span>\n      <span data-field=\"fact-type\"></span>\n    </p>\n    <pre class=\"ttp-inspect__xml\"><code data-field=\"xml\"></code></pre>\n  </details>\n</template>\n\n<!--\n  There is no template for what mounting this panel puts on the host page. It used to pin a cue\n  button to every <fg-set> and <fg-show>; the affordance is now the unit itself — hover it, click\n  it — which is a mark inspect-cues.js sets (on/off with this panel's own mount/unmount) and two\n  rules in inspect.css, with no markup of taxpert's own out in the flow at all.\n-->\n",
	"outcome-tracker.html": "<!--\n  Markup for the Outcome tracker tool: the panel body (<taxpert-outcome-tracker>), one determination\n  accordion, and the two pieces its expanded detail is built from — a section heading with its fact\n  count, and one fact row.\n\n  Split out of tool-panel.html for the same reason watchlist.html is: it is fetched only once that\n  tool is actually switched on.\n\n  As everywhere in this package, ids here are a contract: getTemplate(id) checks\n  document.getElementById(id) first, so credit-assistant can server-render a translated\n  <template id=\"ttp-outcome\"> and it wins over this copy with no change to the JS.\n-->\n\n<!--\n  The panel body: the standing explanation and the determination accordions, which\n  taxpert-outcome-tracker.js builds into the list and then refreshes in place.\n-->\n<template id=\"ttp-outcome\">\n  <p class=\"ttp-body__hint\">Track the outcomes this application determines.</p>\n  <div class=\"ttp-outcome__list\"></div>\n</template>\n\n<!--\n  What the panel shows when the host has configured no determinations — every consumer of this\n  package except one, since a determination is a statement about a particular application's rules.\n\n  It is a real empty state rather than the accordion list with nothing in it, because an empty list\n  reads as \"nothing has settled yet\" — a status — when the truth is that nothing is being tracked.\n-->\n<template id=\"ttp-outcome-empty\">\n  <p class=\"ttp-body__hint\">No outcomes are being tracked.</p>\n  <p class=\"ttp-body__hint\">\n    This application has not told the workspace which outcomes it determines.\n  </p>\n</template>\n\n<!--\n  One determination. A <details>, so expanding it is browser behaviour rather than a click handler\n  with an aria-expanded to keep in step — the chevron turn is `details[open]` in CSS.\n\n  `data-status` on the host is the row's whole visual state: 'settled' paints the status icon green,\n  'pending' leaves it the part-drawn ring. The JS sets the attribute and swaps the one <use href>\n  rather than rebuilding the row, which is what lets a row the user has expanded stay open across\n  the `fg-update` that fires on every keystroke in the flow.\n-->\n<template id=\"ttp-outcome-row\">\n  <details class=\"ttp-row ttp-outcome__row\">\n    <summary class=\"ttp-row__summary\">\n      <svg class=\"ttp-row__icon ttp-outcome__status\" aria-hidden=\"true\" focusable=\"false\">\n        <use href=\"#ttp-icon-pending\"></use>\n      </svg>\n      <span class=\"ttp-row__text\">\n        <span class=\"ttp-row__label\" data-field=\"label\"></span>\n        <span class=\"ttp-row__value\" data-field=\"value\"></span>\n        <span class=\"usa-sr-only\" data-field=\"status-label\"></span>\n      </span>\n      <svg class=\"ttp-row__chevron\" aria-hidden=\"true\" focusable=\"false\"><use href=\"#ttp-icon-expand_more\"></use></svg>\n    </summary>\n    <div class=\"ttp-row__detail ttp-outcome__detail\"></div>\n  </details>\n</template>\n\n<!--\n  A group of facts inside an expanded determination. The heading carries the count in its own\n  element so the JS writes two short strings rather than composing \"Marital status (6)\" by hand.\n-->\n<template id=\"ttp-outcome-section\">\n  <div class=\"ttp-outcome__section\">\n    <h4 class=\"ttp-outcome__heading\">\n      <span data-field=\"heading\"></span>\n      <span class=\"ttp-outcome__count\" data-field=\"count\"></span>\n    </h4>\n    <ul class=\"ttp-outcome__facts\"></ul>\n  </div>\n</template>\n\n<!--\n  One fact under a heading: its path, and what it is currently worth.\n\n  The icon ships `hidden` and the JS reveals it once it has a glyph to point at, which is every\n  status today — an unanswered fact wears the part-drawn ring, the same one the Watchlist gives it.\n  Its colour comes off the row's `data-status`, the same arrangement as the determination above.\n-->\n<template id=\"ttp-outcome-fact\">\n  <li class=\"ttp-outcome__fact\">\n    <span class=\"ttp-outcome__path\" data-field=\"path\"></span>\n    <span class=\"ttp-outcome__state\">\n      <svg class=\"ttp-outcome__fact-icon\" aria-hidden=\"true\" focusable=\"false\" hidden>\n        <use href=\"#ttp-icon-check_circle_outline\"></use>\n      </svg>\n      <span data-field=\"value\"></span>\n    </span>\n  </li>\n</template>\n",
	"overrides.html": "<!--\n  The Overrides tool's body (<taxpert-overrides>): a form over a handful of writable facts, so a\n  developer can put a value into the graph without walking the flow to the screen that asks for it.\n\n  The fact paths are the *host's*, through `config.tools`:\n\n      { id: 'overrides', label: 'Overrides', templateId: 'ttp-body-overrides',\n        facts: ['/overrideDate'] }\n\n  which is what makes this the generic answer to a host-specific control. The Tax Withholding\n  Estimator's legacy audit panel had a hand-built \"Override Date\" field wired to `/overrideDate`;\n  every host has one or two facts like it, and none of them is a reason for this package to grow a\n  bespoke panel.\n\n  Each row's input type comes from the dictionary's own type for that fact, so a Day is a date\n  picker and a Dollar is a number field, with no per-host mapping to keep.\n-->\n<template id=\"ttp-overrides\">\n  <div class=\"ttp-overrides\">\n    <p class=\"ttp-body__hint\">\n      Set a fact directly. Values are written to the fact graph as though the flow had asked for\n      them.\n    </p>\n    <div class=\"ttp-overrides__list\"></div>\n  </div>\n</template>\n\n<!-- Shown when the host configured the tool but named no facts — honest, like every other empty\n     state here, rather than a form with nothing in it. -->\n<template id=\"ttp-overrides-empty\">\n  <div class=\"ttp-overrides ttp-overrides--empty\">\n    <p class=\"ttp-body__hint\">This application declares no overridable facts.</p>\n    <p class=\"ttp-body__hint\">\n      Add fact paths to the tool’s <code>facts</code> list in Workspace settings, or in the host’s\n      configuration.\n    </p>\n  </div>\n</template>\n\n<!-- One fact. The `data-status` attribute carries what the graph currently says, and the stylesheet\n     draws it — there is no parallel class. -->\n<template id=\"ttp-overrides-row\">\n  <div class=\"ttp-overrides__row\">\n    <label class=\"usa-label ttp-overrides__label\"></label>\n    <div class=\"ttp-overrides__controls\">\n      <input class=\"usa-input ttp-overrides__input\">\n      <button class=\"usa-button usa-button--unstyled ttp-overrides__clear\" type=\"button\">\n        Clear\n      </button>\n    </div>\n    <p class=\"ttp-overrides__status\" data-field=\"status\"></p>\n  </div>\n</template>\n",
	"tool-dock.html": "<!--\n  Markup for <taxpert-tool-dock> — the right-side panel area and the floating layer above it.\n\n  The dock is a flex child of whatever the host lays its page out with, exactly as the audit panel\n  already is in credit-assistant (`.audit-mode` turns <body> into a flex row of .app-container plus\n  the panel). That is why nothing here is `position: fixed` except the float layer: a docked column\n  is ordinary flex layout, so the host's own content reflows next to it for free, with no inset\n  bookkeeping and no second source of truth about how wide the dock is.\n\n  Columns and stacks are all `flex: <ratio> 1 0`, so three panels with no stored ratio split the\n  height three ways on their own — the 100% / 50% / 33% in the designs is what equal flex already\n  does, not a number anyone computes.\n\n  Splitters and the dock's own edge are `role=\"separator\" tabindex=\"0\"`, so every resize has arrow-key\n  parity — the same contract as the audit panel's #audit-panel-resizer.\n-->\n\n<template id=\"ttd-dock\">\n  <div class=\"ttd-dock\" hidden>\n    <div class=\"ttd-dock__resizer\" role=\"separator\" aria-orientation=\"vertical\"\n         aria-label=\"Resize tool area\" tabindex=\"0\"></div>\n    <div class=\"ttd-dock__columns\"></div>\n  </div>\n</template>\n\n<!-- Floating panels and the drop indicator live here: one fixed, full-viewport, click-through layer\n     so an undocked panel is never clipped by a column's bounds. -->\n<template id=\"ttd-float-layer\">\n  <div class=\"ttd-float-layer\"></div>\n</template>\n\n<template id=\"ttd-column\">\n  <div class=\"ttd-column\"></div>\n</template>\n\n<!-- Between two columns. -->\n<template id=\"ttd-splitter-v\">\n  <div class=\"ttd-splitter ttd-splitter--v\" role=\"separator\" aria-orientation=\"vertical\"\n       aria-label=\"Resize column width\" tabindex=\"0\"></div>\n</template>\n\n<!-- Between two stacked panels. -->\n<template id=\"ttd-splitter-h\">\n  <div class=\"ttd-splitter ttd-splitter--h\" role=\"separator\" aria-orientation=\"horizontal\"\n       aria-label=\"Resize panel height\" tabindex=\"0\"></div>\n</template>\n\n<!-- Shown while dragging to mark where the panel would land. `hidden` is the whole of its state. -->\n<template id=\"ttd-dropzone\">\n  <div class=\"ttd-dropzone\" hidden aria-hidden=\"true\"></div>\n</template>\n",
	"tool-panel.html": "<!--\n  Markup for <taxpert-tool-panel> — the generic chrome every workspace tool wears — plus the three\n  stub bodies.\n\n  The chrome is built once, on connect, and never rebuilt. Docking, floating, dragging and resizing\n  all move attributes on the host element (`data-float`, `data-dragging`) or set custom properties;\n  tool-panel.css decides what that means visually. Nothing here is torn down.\n\n  None of the three bodies is markup any more: each is a custom element — <taxpert-inspect>,\n  <taxpert-outcome-tracker>, <taxpert-watchlist> — whose own markup lives in inspect.html,\n  outcome-tracker.html and watchlist.html, so a tool's templates are only fetched once that tool is\n  actually switched on. Because getTemplate(id) checks document.getElementById(id) first, a host can\n  still server-render any <template id=\"ttp-body-…\"> and it wins over the copy here.\n-->\n\n<!--\n  The icon sprite. Inlined <symbol>s rather than a <use href> against the host's own sprite file so\n  the bundle stays self-contained, matching global-nav.html's tgn-sprite. Appended to the document\n  once, by the dock.\n-->\n<template id=\"ttp-sprite\">\n  <svg class=\"ttp-sprite\" aria-hidden=\"true\" focusable=\"false\" width=\"0\" height=\"0\">\n    <!-- Six-dot drag grip. -->\n    <symbol id=\"ttp-icon-grip\" viewBox=\"0 0 24 24\">\n      <path fill=\"currentColor\" d=\"M9 5h2v2H9zM13 5h2v2h-2zM9 11h2v2H9zM13 11h2v2h-2zM9 17h2v2H9zM13 17h2v2h-2z\" />\n    </symbol>\n    <symbol id=\"ttp-icon-close\" viewBox=\"0 0 24 24\">\n      <path fill=\"currentColor\" d=\"M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z\" />\n    </symbol>\n    <symbol id=\"ttp-icon-expand_more\" viewBox=\"0 0 24 24\">\n      <path fill=\"currentColor\" d=\"M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z\" />\n    </symbol>\n    <symbol id=\"ttp-icon-more_vert\" viewBox=\"0 0 24 24\">\n      <path fill=\"currentColor\" d=\"M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z\" />\n    </symbol>\n    <symbol id=\"ttp-icon-add\" viewBox=\"0 0 24 24\">\n      <path fill=\"currentColor\" d=\"M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z\" />\n    </symbol>\n    <!-- The combo boxes' toggle. `unfold_more` rather than the `expand_more` USWDS's own combo box\n         ships, so the field reads as the same control as the workspace's other dropdowns. -->\n    <symbol id=\"ttp-icon-unfold_more\" viewBox=\"0 0 24 24\">\n      <path fill=\"currentColor\" d=\"M12 5.83 15.17 9l1.41-1.41L12 3 7.41 7.59 8.83 9zm0 12.34L8.83 15l-1.42 1.41L12 21l4.59-4.59L15.17 15z\" />\n    </symbol>\n    <symbol id=\"ttp-icon-delete\" viewBox=\"0 0 24 24\">\n      <path fill=\"currentColor\" d=\"M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z\" />\n    </symbol>\n    <!-- Row-kind icons: a fact, a conditional flow, conditional text. -->\n    <symbol id=\"ttp-icon-info\" viewBox=\"0 0 24 24\">\n      <path fill=\"currentColor\" d=\"M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z\" />\n    </symbol>\n    <symbol id=\"ttp-icon-flow\" viewBox=\"0 0 24 24\">\n      <path fill=\"currentColor\" d=\"M3 3h6v4H3zm12 0h6v4h-6zM3 17h6v4H3zm12 0h6v4h-6zM6 7h2v4h8V7h2v6H6z\" />\n    </symbol>\n    <symbol id=\"ttp-icon-text\" viewBox=\"0 0 24 24\">\n      <path fill=\"currentColor\" d=\"M3 5h10v2H9v12H7V7H3zm10 5h8v2h-3v7h-2v-7h-3z\" />\n    </symbol>\n    <!-- Outcome/watchlist status: settled true, settled false, still incomplete. -->\n    <symbol id=\"ttp-icon-check_circle\" viewBox=\"0 0 24 24\">\n      <path fill=\"currentColor\" d=\"M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8z\" />\n    </symbol>\n    <symbol id=\"ttp-icon-error_circle\" viewBox=\"0 0 24 24\">\n      <path fill=\"currentColor\" d=\"M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12z\" />\n    </symbol>\n    <!-- Outlined variants of the two above. The Outcome tracker draws a determination with the\n         filled mark and the facts underneath it with these, so the two levels stay apart. -->\n    <symbol id=\"ttp-icon-check_circle_outline\" viewBox=\"0 0 24 24\">\n      <path fill=\"currentColor\" d=\"M16.59 7.58 10 14.17l-3.59-3.58L5 12l5 5 8-8zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z\" />\n    </symbol>\n    <symbol id=\"ttp-icon-error_circle_outline\" viewBox=\"0 0 24 24\">\n      <path fill=\"currentColor\" d=\"M14.59 8 12 10.59 9.41 8 8 9.41 10.59 12 8 14.59 9.41 16 12 13.41 14.59 16 16 14.59 13.41 12 16 9.41zM12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z\" />\n    </symbol>\n    <symbol id=\"ttp-icon-pending\" viewBox=\"0 0 24 24\">\n      <path fill=\"currentColor\" d=\"M12 4a8 8 0 0 1 8 8h2A10 10 0 0 0 12 2zm0 16a8 8 0 0 1-8-8H2a10 10 0 0 0 10 10z\" />\n    </symbol>\n  </svg>\n</template>\n\n<!--\n  The panel itself. The grip is a real <button> so it is reachable and operable from the keyboard.\n\n  A floating panel resizes from all eight edges and corners, so it never has to be dragged to the\n  top of the page just to get at a handle. The four *edges* are `role=\"separator\" tabindex=\"0\"`, so\n  each axis is reachable from the keyboard; the four *corners* are `aria-hidden` mouse affordances,\n  because a corner is only ever the two edges it joins and eight tab stops per panel would bury the\n  panel's own controls in a screen reader's list. Corners take a higher z-index so they win the\n  overlap where they meet an edge strip.\n\n  All eight matter only while floating — a docked panel is resized by the dock's own splitters —\n  which `.ttp-panel:not([data-float]) .ttp-panel__grow { display: none }` takes care of.\n-->\n<template id=\"ttp-panel\">\n  <section class=\"ttp-panel\">\n    <header class=\"ttp-panel__bar\">\n      <button class=\"ttp-panel__grip\" type=\"button\">\n        <svg class=\"ttp-panel__grip-icon\" aria-hidden=\"true\" focusable=\"false\">\n          <use href=\"#ttp-icon-grip\"></use>\n        </svg>\n        <span class=\"usa-sr-only ttp-panel__grip-label\"></span>\n      </button>\n      <h2 class=\"ttp-panel__title\"></h2>\n      <button class=\"ttp-panel__close\" type=\"button\">\n        <svg class=\"ttp-panel__close-icon\" aria-hidden=\"true\" focusable=\"false\">\n          <use href=\"#ttp-icon-close\"></use>\n        </svg>\n        <span class=\"usa-sr-only ttp-panel__close-label\"></span>\n      </button>\n    </header>\n    <div class=\"ttp-panel__body\"></div>\n    <div class=\"ttp-panel__grow ttp-panel__grow--n\" data-edge=\"n\" role=\"separator\"\n         aria-orientation=\"horizontal\" aria-label=\"Resize panel from the top edge\" tabindex=\"0\"></div>\n    <div class=\"ttp-panel__grow ttp-panel__grow--s\" data-edge=\"s\" role=\"separator\"\n         aria-orientation=\"horizontal\" aria-label=\"Resize panel from the bottom edge\" tabindex=\"0\"></div>\n    <div class=\"ttp-panel__grow ttp-panel__grow--w\" data-edge=\"w\" role=\"separator\"\n         aria-orientation=\"vertical\" aria-label=\"Resize panel from the left edge\" tabindex=\"0\"></div>\n    <div class=\"ttp-panel__grow ttp-panel__grow--e\" data-edge=\"e\" role=\"separator\"\n         aria-orientation=\"vertical\" aria-label=\"Resize panel from the right edge\" tabindex=\"0\"></div>\n    <div class=\"ttp-panel__grow ttp-panel__grow--nw\" data-edge=\"nw\" aria-hidden=\"true\"></div>\n    <div class=\"ttp-panel__grow ttp-panel__grow--ne\" data-edge=\"ne\" aria-hidden=\"true\"></div>\n    <div class=\"ttp-panel__grow ttp-panel__grow--sw\" data-edge=\"sw\" aria-hidden=\"true\"></div>\n    <div class=\"ttp-panel__grow ttp-panel__grow--se\" data-edge=\"se\" aria-hidden=\"true\"></div>\n  </section>\n</template>\n\n<!-- ── Tool bodies ──────────────────────────────────────────────────────────── -->\n\n<!--\n  Inspect: the objects behind the rendered unit you have selected. Its body is <taxpert-inspect>,\n  whose markup lives in inspect.html so it is only fetched once the tool is switched on. Mounting\n  <taxpert-inspect> is also what turns the host page's hover/click cues on (inspect-cues.js, called\n  from the element's connectedCallback) — they fetch nothing themselves: what they put on the flow\n  is a mark and a stylesheet rule, not markup.\n-->\n<template id=\"ttp-body-inspect\">\n  <taxpert-inspect></taxpert-inspect>\n</template>\n\n<!--\n  Outcome tracker: the host's determinations and how close each is to settling. Like the Watchlist\n  below, its body is a custom element rather than static markup — <taxpert-outcome-tracker> builds\n  its accordions from config.determinations and keeps them in step with the fact graph, cloning its\n  own markup out of outcome-tracker.html. With nothing configured it draws its empty state.\n-->\n<template id=\"ttp-body-outcome-tracker\">\n  <taxpert-outcome-tracker></taxpert-outcome-tracker>\n</template>\n\n<!--\n  Watchlist: facts pinned by the user, with their current values. The first tool with real\n  behaviour, so unlike the two stubs above its body is a custom element rather than static markup —\n  <taxpert-watchlist> clones its own rows out of watchlist.html and keeps them in step with the\n  fact graph. Registered as a side effect of importing taxpert-tool-panel.js.\n-->\n<template id=\"ttp-body-watchlist\">\n  <taxpert-watchlist></taxpert-watchlist>\n</template>\n\n<!--\n  Overrides: set a fact directly, without walking the flow to the screen that asks for it. Its body\n  is <taxpert-overrides>, which builds a row per path in the tool's own `facts` list — the host's,\n  not ours — and clones its markup out of overrides.html. It is the one tool that *writes*, which is\n  why the fact-graph port has a set().\n\n  Not one of the three the library offers by default: a host has to name the facts before there is\n  anything to show, so it opts in through config.tools.\n-->\n<template id=\"ttp-body-overrides\">\n  <taxpert-overrides></taxpert-overrides>\n</template>\n",
	"tools-modal.html": "<!--\n  Body of the \"Tools\" modal (<taxpert-tools-modal>), opened from the global nav's Tools button. The\n  <dialog> chrome around it is the shared shell in ../../shared/templates/shared.html.\n\n  Unlike workspace-settings-modal.html — where each row is a hand-written flag with its own wording —\n  the rows here are per-entry clones of ttm-option over the configured tool list (tools() in\n  ../js/tool-registry.js), the display-modal.html pattern. A tool is data: it has a panel, a place in\n  the dock, and a checkbox, all keyed off the same id.\n\n  Real USWDS component markup (.usa-checkbox, .usa-button, .usa-modal__*), same as the other four\n  modals.\n-->\n<template id=\"ttm-sections\">\n  <section class=\"ttm-section\">\n    <div class=\"ttm-section__options\" data-options=\"tools\"></div>\n\n    <!-- Placement only: this puts every open panel back on the right side in canonical order and\n         clears stored sizes. It does not switch tools off, so the checkboxes above are untouched\n         by it. -->\n    <button class=\"usa-button usa-button--outline ttm-reset\" type=\"button\" data-action=\"reset\">\n      Reset tool layout\n    </button>\n  </section>\n</template>\n\n<!--\n  One tool row: a USWDS *tile* checkbox — the whole bordered box is the control, matching the option\n  rows in workspace-settings-modal.html. USWDS draws the box, its checked and focus states, and the\n  control art, so nothing in tools-modal.css or the JS mirrors `:checked`.\n\n  The description now sits *inside* the label, as USWDS's own `.usa-checkbox__label-description`.\n  It used to be a sibling <p>, so that clicking the description text would not toggle the box — but\n  a tile's whole point is that the entire box is one target, and a sibling would have rendered\n  outside the border with its own guessed indent instead of inside it. `.ttm-option__hint` stays on\n  the element as the JS's hook and the spec's.\n-->\n<template id=\"ttm-option\">\n  <div class=\"ttm-option usa-checkbox\">\n    <input class=\"usa-checkbox__input usa-checkbox__input--tile\" type=\"checkbox\" name=\"taxpert-tools[]\">\n    <label class=\"usa-checkbox__label\">\n      <span class=\"ttm-option__name\"></span>\n      <span class=\"usa-checkbox__label-description ttm-option__hint\"></span>\n    </label>\n  </div>\n</template>\n",
	"watchlist.html": "<!--\n  Markup for the Watchlist tool: the panel body (<taxpert-watchlist>), one pinned-fact row, the\n  \"Add fact\" dialog body (<taxpert-add-fact-modal>), and the combo box both of its fields are built\n  from.\n\n  Split out of tool-panel.html rather than added to it so the markup is fetched only when the\n  Watchlist is actually switched on — a panel body is the one part of this bundle a host is likely\n  never to open. The <dialog> chrome around the modal is the shared shell in\n  ../../shared/templates/shared.html, as with every other Taxpert modal.\n\n  As everywhere in this package, ids here are a contract: getTemplate(id) checks\n  document.getElementById(id) first, so credit-assistant can server-render a translated\n  <template id=\"ttp-watchlist\"> and it wins over this copy with no change to the JS.\n-->\n\n<!--\n  The panel body. Three parts in a fixed order — the standing explanation, the list of pinned facts,\n  and the button that adds one. The list is empty on first open, which is the whole of the design's\n  \"empty\" state: no separate empty-state markup, because the hint and the button already say what\n  the tool is for.\n-->\n<template id=\"ttp-watchlist\">\n  <p class=\"ttp-body__hint\">Track the value of one of more facts as you work or load scenarios.</p>\n\n  <!-- Plain container, not a list: each row is a <details>, whose own disclosure semantics are the\n       useful ones, and an ARIA list wrapped round them would override exactly that. -->\n  <div class=\"ttp-watch__list\"></div>\n\n  <button class=\"usa-button ttp-body__action ttp-watch__add\" type=\"button\">\n    <svg class=\"ttp-body__action-icon\" aria-hidden=\"true\" focusable=\"false\"><use href=\"#ttp-icon-add\"></use></svg>\n    Add fact\n  </button>\n</template>\n\n<!--\n  One pinned fact. A <details>, so expanding it is browser behaviour rather than a click handler and\n  a click handler's aria-expanded to keep in step — the chevron turn is `details[open]` in CSS.\n\n  Everything that changes as the fact graph settles is addressed by `data-field`, and the row's\n  status is the host element's `data-status` attribute: watchlist.css picks the icon colour off it,\n  and taxpert-watchlist.js swaps the one <use href> rather than rebuilding the row. That is what\n  lets an open row stay open across an `fg-update`.\n\n  The kebab is a real <button> inside the <summary> (phrasing content, so valid) rather than the\n  decorative <svg> the stub carried: it opens a menu, so it has to be operable. Its click handler\n  calls preventDefault(), which is what stops the summary underneath from toggling.\n-->\n<template id=\"ttp-watchlist-row\">\n  <details class=\"ttp-row ttp-watch__row\">\n    <summary class=\"ttp-row__summary\">\n      <svg class=\"ttp-row__icon ttp-watch__status\" aria-hidden=\"true\" focusable=\"false\">\n        <use href=\"#ttp-icon-pending\"></use>\n      </svg>\n      <span class=\"ttp-row__text\">\n        <span class=\"ttp-row__label\" data-field=\"path\"></span>\n        <span class=\"ttp-row__value\" data-field=\"value\"></span>\n        <span class=\"usa-sr-only\" data-field=\"status-label\"></span>\n      </span>\n      <span class=\"ttp-watch__menu\">\n        <button class=\"ttp-watch__kebab\" type=\"button\" aria-haspopup=\"true\" aria-expanded=\"false\">\n          <svg class=\"ttp-row__kebab\" aria-hidden=\"true\" focusable=\"false\"><use href=\"#ttp-icon-more_vert\"></use></svg>\n          <span class=\"usa-sr-only\" data-field=\"menu-label\"></span>\n        </button>\n        <span class=\"ttp-watch__menu-list\" role=\"menu\" hidden>\n          <button class=\"ttp-watch__menu-item\" type=\"button\" role=\"menuitem\" data-action=\"reveal\">\n            Reveal in canvas\n          </button>\n        </span>\n      </span>\n      <svg class=\"ttp-row__chevron\" aria-hidden=\"true\" focusable=\"false\"><use href=\"#ttp-icon-expand_more\"></use></svg>\n    </summary>\n\n    <div class=\"ttp-row__detail ttp-watch__detail\">\n      <!-- <div> is valid inside a <dl> and keeps each term with its own definition, which is what\n           makes the two-column grid possible. -->\n      <dl class=\"ttp-watch__data\">\n        <div class=\"ttp-watch__data-row\">\n          <dt>Current value</dt>\n          <dd data-field=\"detail-value\"></dd>\n        </div>\n        <div class=\"ttp-watch__data-row\">\n          <dt>Fact type</dt>\n          <dd data-field=\"detail-type\"></dd>\n        </div>\n        <div class=\"ttp-watch__data-row\">\n          <dt>Fact path</dt>\n          <dd class=\"ttp-watch__mono\" data-field=\"detail-path\"></dd>\n        </div>\n        <!-- Hidden for a fact that isn't in a collection; there is nothing to say about it. -->\n        <div class=\"ttp-watch__data-row\" data-field=\"detail-collection-row\" hidden>\n          <dt>Collection ID</dt>\n          <dd class=\"ttp-watch__mono\" data-field=\"detail-collection\"></dd>\n        </div>\n      </dl>\n\n      <div class=\"ttp-watch__actions\">\n        <button class=\"usa-button usa-button--unstyled ttp-watch__action\" type=\"button\" data-action=\"reveal\">\n          Reveal in canvas\n        </button>\n        <button class=\"usa-button usa-button--unstyled ttp-watch__action\" type=\"button\" data-action=\"remove\">\n          <svg class=\"ttp-watch__action-icon\" aria-hidden=\"true\" focusable=\"false\"><use href=\"#ttp-icon-delete\"></use></svg>\n          Remove fact\n        </button>\n      </div>\n    </div>\n  </details>\n</template>\n\n<!--\n  The \"Add fact\" dialog's body. Two fields and a submit, matching the Fact Inspector's own pair —\n  the difference is that the collection id is chosen from the ids actually in the graph rather than\n  typed out by hand from memory.\n\n  Each field's control is mounted into its `data-mount` slot at render time, because a combo box is\n  built by combo-box.js rather than declared here: the <label> needs the input's real id, and that\n  id is minted per instance.\n-->\n<template id=\"ttp-add-fact\">\n  <section class=\"ttp-add-fact\">\n    <div class=\"usa-form-group ttp-add-fact__group\">\n      <label class=\"usa-label ttp-add-fact__label\" data-label=\"path\">Fact path</label>\n      <div data-mount=\"path\"></div>\n    </div>\n\n    <div class=\"usa-form-group ttp-add-fact__group\">\n      <label class=\"usa-label ttp-add-fact__label\" data-label=\"collection\">Collection ID</label>\n      <div data-mount=\"collection\"></div>\n    </div>\n\n    <p class=\"usa-error-message ttp-add-fact__error\" data-field=\"error\" role=\"alert\" hidden></p>\n\n    <button class=\"usa-button ttp-add-fact__submit\" type=\"button\" data-action=\"add\">Add fact</button>\n  </section>\n</template>\n\n<!--\n  A combo box: a text input that filters a listbox, the USWDS component's behaviour without its JS.\n\n  Deliberately *not* USWDS's own `.usa-combo-box` markup. That component is enhanced and driven by\n  uswds.min.js through document-level delegated listeners, which fact-explorer doesn't load at\n  all and which would fight this file's handlers where it is loaded. The class names are ours, the\n  interaction contract is the ARIA combobox pattern, and the look is USWDS's — see watchlist.css.\n\n  The toggle carries `unfold_more` rather than the component's default `expand_more`, so the field\n  reads as the same kind of control as the workspace's other dropdowns.\n-->\n<template id=\"ttp-combo\">\n  <div class=\"ttp-combo\">\n    <input class=\"usa-input ttp-combo__input\"\n           type=\"text\"\n           role=\"combobox\"\n           placeholder=\"- Select -\"\n           aria-autocomplete=\"list\"\n           aria-expanded=\"false\"\n           autocomplete=\"off\"\n           autocapitalize=\"off\"\n           spellcheck=\"false\">\n    <span class=\"ttp-combo__separator\" aria-hidden=\"true\"></span>\n    <button class=\"ttp-combo__toggle\" type=\"button\" tabindex=\"-1\" aria-label=\"Toggle the dropdown list\">\n      <svg class=\"ttp-combo__toggle-icon\" aria-hidden=\"true\" focusable=\"false\"><use href=\"#ttp-icon-unfold_more\"></use></svg>\n    </button>\n    <!-- A combobox's popup is a listbox, not a select: the input above owns the value and the\n         typeahead, and this is the list aria-expanded and aria-activedescendant point at. A native\n         select would take away the filtering that is the whole point of the control. Same escape\n         hatch, and same reason, as the USWDS role=\"button\" link in credit-assistant's page.html. -->\n    <!-- [html-validate-disable-next prefer-native-element -- a combobox popup is a listbox] -->\n    <ul class=\"ttp-combo__list\" role=\"listbox\" hidden></ul>\n    <span class=\"ttp-combo__status usa-sr-only\" role=\"status\"></span>\n  </div>\n</template>\n\n<template id=\"ttp-combo-option\">\n  <li class=\"ttp-combo__option\" role=\"option\" aria-selected=\"false\"></li>\n</template>\n"
})) registerTemplates(new URL(`../templates/${file}`, import.meta.url), html);

//#endregion
//#region src/shared/js/favicon.js
/** Resolved against this module's own URL, so it works from the vendored mirror and from a bundler. */
const FAVICON_URL = new URL("../img/favicon.png", import.meta.url).href;
/** Marks the link this module owns, so a second import is a no-op rather than a second link. */
const MARKER = "data-taxpert-favicon";
/**
* Make the workspace's icon the page's only `rel="icon"`.
*
* @param {string} [href] The icon to install. Defaults to the one this package ships.
* @returns {HTMLLinkElement|null} The installed link, or null with no document to install into.
*/
function installFavicon(href = FAVICON_URL) {
	if (typeof document === "undefined" || !document.head) return null;
	const already = document.head.querySelector(`link[${MARKER}]`);
	if (already) return already;
	for (const link of document.querySelectorAll("link[rel~=\"icon\"]")) link.remove();
	const link = document.createElement("link");
	link.rel = "icon";
	link.type = "image/png";
	link.href = href;
	link.setAttribute(MARKER, "");
	document.head.appendChild(link);
	return link;
}
installFavicon();

//#endregion
//#region src/global-nav/js/nav-menu-data.js
/** The configured taxonomy. Empty until a host registers one. */
function navMenu() {
	return getConfig().nav.menu;
}
/**
* The part after "<brand> |". A leaf inside a group reads as the group's label, a top-level item as
* its own. An unknown or absent id is null.
*/
function contextLabel(activeId, menu = navMenu()) {
	if (!activeId) return null;
	for (const item of menu) {
		if (item.id === activeId) return item.label;
		if (item.children?.some((c) => c.id === activeId)) return item.label;
	}
	return null;
}

//#endregion
//#region src/global-nav/js/templates.js
const FILE = "global-nav.html";
const DEFAULT_URL = new URL(`../templates/${FILE}`, import.meta.url);
/**
* Every template id <taxpert-global-nav> clones, in the order the render reaches them. All five have
* to resolve, because the render throws on the first one missing, so a host that supplies four of
* them has supplied none. This list says that in one place rather than at five call sites.
*/
const NAV_TEMPLATE_IDS = Object.freeze([
	"tgn-sprite",
	"tgn-bar",
	"tgn-tool",
	"tgn-group",
	"tgn-item"
]);
/** Whether the page already carries every template the bar clones. */
function navTemplatesHosted() {
	return NAV_TEMPLATE_IDS.every(hasTemplate);
}
if (!navTemplatesHosted()) loadTemplates(DEFAULT_URL).catch(() => {});
/**
* Resolve the bar's markup. A host that server-renders every template wins outright, including over
* its own `templates-base`, because the copy already on the page is the one getTemplate() returns.
*/
function loadNavTemplates(element) {
	if (navTemplatesHosted()) return Promise.resolve();
	return loadTemplates(templateUrl(element, DEFAULT_URL, FILE));
}

//#endregion
//#region src/shared/js/embedded.js
const EMBEDDED_CLASS = "taxpert-embedded";
const OVERRIDE_PARAM = "taxpert-embed";
/**
* Whether this page is being rendered inside another page's frame. `?taxpert-embed=0|1` forces
* either answer on the page that carries it.
*
* @param {Window} [view] the window to test. Defaults to the ambient one.
* @returns {boolean}
*/
function isEmbedded(view = globalThis) {
	const override = new URLSearchParams(view.location?.search ?? "").get(OVERRIDE_PARAM);
	if (override === "1" || override === "true") return true;
	if (override === "0" || override === "false") return false;
	try {
		return view.self !== view.top;
	} catch {
		return true;
	}
}
/**
* Mark the document when it is embedded, so the stylesheet can stand the chrome down. Idempotent;
* called at import time by the global nav, which every workspace host loads.
*
* @param {Document} [doc]
* @param {Window} [view]
*/
function applyEmbedded(doc = globalThis.document, view = globalThis) {
	const root = doc?.documentElement;
	if (!root) return false;
	const embedded = isEmbedded(view);
	root.classList.toggle(EMBEDDED_CLASS, embedded);
	return embedded;
}

//#endregion
//#region src/global-nav/js/taxpert-global-nav.js
applyEmbedded();
const groupHoldsActive = (group, active) => !!active && group.children?.some((child) => child.id === active) === true;
var TaxpertGlobalNav = class extends HTMLElement {
	constructor() {
		super();
		this._open = false;
		this._menu = null;
		this._groupOpen = /* @__PURE__ */ new Map();
		this._connected = false;
		this._rendered = false;
		this._degraded = false;
		/** Resolves once the bar's DOM has been cloned in. */
		this.ready = Promise.resolve();
		this._onDocClick = (event) => {
			if (this._open && !this.contains(event.target)) this._close();
		};
		this._onKeydown = (event) => {
			if (event.key === "Escape" && this._open) {
				this._close();
				this._button?.focus();
			}
		};
		this._onConfigChange = () => {
			if (this._rendered) this._renderFromConfig();
		};
	}
	connectedCallback() {
		document.addEventListener("click", this._onDocClick);
		document.addEventListener("keydown", this._onKeydown);
		document.addEventListener(CONFIG_CHANGE_EVENT, this._onConfigChange);
		if (this._connected) return;
		this._connected = true;
		for (const name of [
			"menu",
			"active",
			"workspaceOn"
		]) this._upgradeProperty(name);
		this.ready = loadNavTemplates(this).then(() => this._renderOnce(), (error) => {
			console.error(error);
			this._renderOnce();
		});
	}
	_upgradeProperty(name) {
		if (!Object.hasOwn(this, name)) return;
		const value = Reflect.get(this, name);
		Reflect.deleteProperty(this, name);
		Reflect.set(this, name, value);
	}
	disconnectedCallback() {
		document.removeEventListener("click", this._onDocClick);
		document.removeEventListener("keydown", this._onKeydown);
		document.removeEventListener(CONFIG_CHANGE_EVENT, this._onConfigChange);
	}
	/** The host application's id: markup first, then the configured one. */
	get app() {
		return this.getAttribute("app") || getConfig().app.id;
	}
	set app(value) {
		if (value === null || value === void 0) this.removeAttribute("app");
		else this.setAttribute("app", value);
	}
	get menu() {
		if (this._menu) return this._menu;
		const json = this.getAttribute("menu-json");
		if (json) try {
			return JSON.parse(json);
		} catch (error) {
			console.warn("taxpert-global-nav: invalid menu-json attribute", error);
		}
		return navMenu();
	}
	set menu(value) {
		this._menu = value;
		if (this._rendered) this._renderTaxonomy();
	}
	get active() {
		return this.getAttribute("active");
	}
	set active(value) {
		if (value === null || value === void 0) this.removeAttribute("active");
		else this.setAttribute("active", value);
		if (this._rendered) this._syncActive();
	}
	get workspaceOn() {
		return this.workspaceLocked || this.getAttribute("workspace-on") === "true";
	}
	set workspaceOn(value) {
		if (this.workspaceLocked) return;
		this.setAttribute("workspace-on", String(Boolean(value)));
		if (this._rendered) this._syncWorkspace();
	}
	get workspaceLocked() {
		return this.getAttribute("workspace-locked") === "true";
	}
	_toggle() {
		this._open ? this._close() : this._openMenu();
	}
	_openMenu() {
		this._open = true;
		this._syncOpen();
	}
	_close() {
		if (!this._open) return;
		this._open = false;
		this._syncOpen();
	}
	_isGroupOpen(group, active) {
		const chosen = this._groupOpen.get(group.id);
		return typeof chosen === "boolean" ? chosen : groupHoldsActive(group, active);
	}
	_toggleGroup(groupId, header) {
		const open = header.getAttribute("aria-expanded") === "true";
		this._groupOpen.set(groupId, !open);
		header.setAttribute("aria-expanded", String(!open));
	}
	_toggleWorkspace() {
		if (this.workspaceLocked) return;
		const next = !this.workspaceOn;
		this.workspaceOn = next;
		this.dispatchEvent(new CustomEvent("workspace-toggle", {
			bubbles: true,
			composed: true,
			detail: { on: next }
		}));
	}
	_emitToolSelect(id) {
		this.dispatchEvent(new CustomEvent("nav-tool-select", {
			bubbles: true,
			composed: true,
			cancelable: true,
			detail: { id }
		}));
	}
	_onItemClick(event, item) {
		if (item.disabled) {
			event.preventDefault();
			return;
		}
		const selectEvent = new CustomEvent("nav-select", {
			bubbles: true,
			composed: true,
			cancelable: true,
			detail: {
				id: item.id,
				href: item.href,
				action: item.action
			}
		});
		if (!this.dispatchEvent(selectEvent) || item.action) event.preventDefault();
		this._close();
	}
	_renderOnce() {
		if (!this.isConnected || this._rendered) return;
		try {
			this.render();
		} catch (error) {
			console.error("taxpert-global-nav: could not build the bar from its templates", error);
			this._renderDegraded();
		}
	}
	_renderDegraded() {
		this.classList.add("tgn-host");
		this._degraded = true;
		const el = (tag, className, attrs = {}) => {
			const node = document.createElement(tag);
			if (className) node.className = className;
			for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
			return node;
		};
		const bar = el("nav", "tgn-bar", { "aria-label": "Taxpert workspace" });
		const button = el("button", "tgn-waffle", {
			type: "button",
			"aria-haspopup": "true",
			"aria-expanded": "false",
			"aria-label": "Open Taxpert workspace menu"
		});
		const grid = el("span", "tgn-waffle__grid", { "aria-hidden": "true" });
		for (let i = 0; i < 9; i++) grid.appendChild(el("span", "tgn-waffle__dot"));
		button.appendChild(grid);
		button.addEventListener("click", (event) => {
			event.stopPropagation();
			this._toggle();
		});
		bar.appendChild(button);
		const crumb = el("span", "tgn-breadcrumb");
		const root = el("span", "tgn-breadcrumb__root");
		root.textContent = "Taxpert";
		const separator = el("span", "tgn-breadcrumb__sep", { "aria-hidden": "true" });
		separator.hidden = true;
		const context = el("span", "tgn-breadcrumb__ctx");
		context.hidden = true;
		crumb.append(root, separator, context);
		bar.appendChild(crumb);
		const menu = el("div", "tgn-menu", { role: "menu" });
		menu.addEventListener("click", (event) => event.stopPropagation());
		const label = el("span", "tgn-workspace__label");
		label.textContent = this.getAttribute("workspace-label") || "TAXPERT WORKSPACE";
		const toggle = el("button", "tgn-toggle", {
			type: "button",
			role: "switch",
			"aria-checked": "false",
			"aria-label": label.textContent
		});
		if (this.workspaceLocked) {
			toggle.disabled = true;
			toggle.title = "Always on here";
		}
		toggle.appendChild(el("span", "tgn-toggle__knob"));
		toggle.addEventListener("click", (event) => {
			event.stopPropagation();
			this._toggleWorkspace();
		});
		const controls = el("div", "tgn-workspace__controls");
		controls.appendChild(toggle);
		const row = el("div", "tgn-workspace");
		row.append(label, controls);
		menu.appendChild(row);
		bar.appendChild(menu);
		this.replaceChildren(bar);
		this._button = button;
		this._menuPanel = menu;
		this._rendered = true;
		this._syncOpen();
		this._syncWorkspace();
	}
	render() {
		this.classList.add("tgn-host");
		if (!document.querySelector(".tgn-sprite")) document.body.insertBefore(getTemplate("tgn-sprite"), document.body.firstChild);
		this.replaceChildren(getTemplate("tgn-bar"));
		this._button = this.querySelector(".tgn-waffle");
		this._button.addEventListener("click", (event) => {
			event.stopPropagation();
			this._toggle();
		});
		this._menuPanel = this.querySelector(".tgn-menu");
		this._menuPanel.addEventListener("click", (event) => event.stopPropagation());
		this._renderWorkspaceRow();
		this._renderFromConfig();
		this._rendered = true;
		this._syncOpen();
		this._syncWorkspace();
		this._syncActive();
	}
	_renderFromConfig() {
		if (this._degraded) return;
		this.dataset.app = this.app;
		this._renderTools();
		this._renderTaxonomy();
	}
	_renderTools() {
		const strip = this.querySelector(".tgn-tools");
		strip.replaceChildren();
		for (const tool of getConfig().nav.toolsByDestination) {
			const fragment = getTemplate("tgn-tool");
			const button = fragment.querySelector("button");
			button.dataset.tool = tool.id;
			button.dataset.destinations = (tool.destinations ?? []).join(" ");
			fragment.querySelector("use").setAttribute("href", `#tgn-icon-${tool.icon}`);
			fragment.querySelector(".tgn-tool__label").textContent = tool.label;
			button.addEventListener("click", (event) => {
				event.stopPropagation();
				this._emitToolSelect(tool.id);
			});
			strip.appendChild(fragment);
		}
	}
	_renderWorkspaceRow() {
		const label = this.getAttribute("workspace-label") || "TAXPERT WORKSPACE";
		this.querySelector(".tgn-workspace__label").textContent = label;
		const toggle = this.querySelector(".tgn-toggle");
		toggle.setAttribute("aria-label", label);
		if (this.workspaceLocked) {
			toggle.disabled = true;
			toggle.title = "Always on here";
		}
		toggle.addEventListener("click", (event) => {
			event.stopPropagation();
			this._toggleWorkspace();
		});
		this.querySelector(".workplace-settings").addEventListener("click", (event) => {
			event.stopPropagation();
			this._emitToolSelect("workspace-settings");
			this._close();
		});
	}
	_renderTaxonomy() {
		for (const row of this._menuPanel.querySelectorAll(":scope > .tgn-group, :scope > .tgn-item")) row.remove();
		const active = this.active;
		for (const item of this.menu) if (item.children?.length) this._menuPanel.appendChild(this._renderGroup(item, active));
		else this._menuPanel.appendChild(this._renderLeaf(item));
		if (this._rendered) this._syncActive();
	}
	_renderGroup(group, active) {
		const fragment = getTemplate("tgn-group");
		fragment.querySelector(".tgn-group").dataset.id = group.id;
		fragment.querySelector(".tgn-group__label").textContent = group.label;
		const header = fragment.querySelector(".tgn-group__header");
		header.setAttribute("aria-expanded", String(this._isGroupOpen(group, active)));
		header.addEventListener("click", (event) => {
			event.stopPropagation();
			this._toggleGroup(group.id, header);
		});
		const items = fragment.querySelector(".tgn-group__items");
		for (const child of group.children) items.appendChild(this._renderLeaf(child));
		return fragment;
	}
	_renderLeaf(item) {
		const fragment = getTemplate("tgn-item");
		const link = fragment.querySelector("a");
		link.dataset.id = item.id;
		fragment.querySelector(".tgn-item__label").textContent = item.label;
		if (item.ff) link.dataset.ff = item.ff;
		if (item.disabled) link.setAttribute("aria-disabled", "true");
		else link.href = item.href || "#";
		link.addEventListener("click", (event) => this._onItemClick(event, item));
		return fragment;
	}
	_syncOpen() {
		this._button?.setAttribute("aria-expanded", String(this._open));
	}
	_syncWorkspace() {
		const on = this.workspaceOn;
		this.toggleAttribute("data-workspace-on", on);
		this.querySelector(".tgn-toggle")?.setAttribute("aria-checked", String(on));
		this._syncBreadcrumb();
	}
	_syncActive() {
		const active = this.active;
		for (const link of this.querySelectorAll(".tgn-item")) if (link.dataset.id === active) link.setAttribute("aria-current", "page");
		else link.removeAttribute("aria-current");
		for (const item of this.menu) {
			if (!item.children?.length) continue;
			const header = this.querySelector(`.tgn-group[data-id="${item.id}"] .tgn-group__header`);
			if (header) header.setAttribute("aria-expanded", String(this._isGroupOpen(item, active)));
		}
		for (const button of this.querySelectorAll(".tgn-tool")) button.hidden = !button.dataset.destinations.split(" ").includes(active ?? "");
		this._syncBreadcrumb();
	}
	_syncBreadcrumb() {
		const crumb = this.querySelector(".tgn-breadcrumb");
		if (!crumb) return;
		const ctx = this.workspaceOn ? this.getAttribute("context-label") || contextLabel(this.active, this.menu) : null;
		const sep = crumb.querySelector(".tgn-breadcrumb__sep");
		const label = crumb.querySelector(".tgn-breadcrumb__ctx");
		sep.hidden = !ctx;
		label.hidden = !ctx;
		label.textContent = ctx ?? "";
	}
};
customElements.define("taxpert-global-nav", TaxpertGlobalNav);

//#endregion
//#region src/audit-panel/js/sections.js
const BUILT_IN_SECTIONS = [{
	sectionId: "audit-panel-fact-graph-section",
	dataTab: "fact-graph",
	label: "Fact",
	title: "Fact Inspector",
	order: 20,
	templateId: "tap-fact-inspector"
}, {
	sectionId: "audit-panel-explain-section",
	dataTab: "chat-explain",
	label: "Explain",
	title: "Explain",
	order: 50,
	wrapperClass: "audit-panel__section--chat",
	ff: "ai-fact-explanation",
	templateId: "tap-explain"
}];

//#endregion
//#region src/shared/js/dom.js
/**
* The host page's own language selector, a `<select>` whose every `<option>` carries the route for
* one locale. Named here because two bundles read it and neither owns it. <taxpert-display-modal>
* mirrors its options into the Display dialog, and <taxpert-screens-toolbar> rewrites those routes
* to carry `?mode=`.
*/
const HOST_LANGUAGE_SELECT = "#language-selector";
/**
* `document.createElement` with an optional class.
* @param {string} tag
* @param {string} [className]
* @returns {HTMLElement}
*/
function el(tag, className) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	return node;
}

//#endregion
//#region src/shared/js/modal-shell.js
const SHARED_TEMPLATES = new URL("../templates/shared.html", import.meta.url);
const BODY_MODAL_CLASS = "usa-js-modal--active";
/** Fetch (once) the shared template file. Awaited by every modal before it renders. */
function loadModalShell() {
	return loadTemplates(SHARED_TEMPLATES);
}
/**
* Clone the shared shell into `host`, replacing whatever it held.
* @param {HTMLElement} host the custom element
* @param {{ id: string, prefix: string, heading: string }} options
*   `prefix` is the modal's BEM-ish namespace ('tsm', 'tdm' or 'twsm'). It names the dialog's
*   `-dialog`, `-main`, `-close` and `-heading` classes, and the heading id aria-labelledby
*   points at.
* @returns {{ dialog: HTMLDialogElement, main: HTMLElement }}
*/
function buildModalShell(host, { id, prefix, heading }) {
	const fragment = getTemplate("tms-shell");
	const dialog = fragment.querySelector("dialog");
	dialog.id = id;
	dialog.classList.add(`${prefix}-dialog`);
	dialog.setAttribute("aria-labelledby", `${prefix}-heading`);
	dialog.addEventListener("close", () => document.body.classList.remove(BODY_MODAL_CLASS));
	const main = fragment.querySelector(".usa-modal__main");
	main.classList.add(`${prefix}-main`);
	const closeBtn = fragment.querySelector(".usa-modal__close");
	closeBtn.classList.add(`${prefix}-close`);
	closeBtn.addEventListener("click", () => closeDialog(dialog));
	const title = fragment.querySelector(".usa-modal__heading");
	title.id = `${prefix}-heading`;
	title.classList.add(`${prefix}-heading`);
	title.textContent = heading;
	host.replaceChildren(fragment);
	return {
		dialog,
		main
	};
}
/** Show `dialog` modally. Answers whether it opened, false when absent or already open. */
function openDialog(dialog) {
	if (!dialog || dialog.open) return false;
	if (typeof dialog.showModal === "function") dialog.showModal();
	else dialog.setAttribute("open", "");
	document.body.classList.add(BODY_MODAL_CLASS);
	return true;
}
function closeDialog(dialog) {
	if (!dialog) return;
	if (typeof dialog.close === "function") dialog.close();
	else dialog.removeAttribute("open");
	document.body.classList.remove(BODY_MODAL_CLASS);
}

//#endregion
//#region src/audit-panel/js/templates.js
const DEFAULT_URLS$1 = new Map([
	"audit-panel.html",
	"scenario-modal.html",
	"display-modal.html",
	"workspace-settings-modal.html",
	"all-screens-toolbar.html"
].map((file) => [file, new URL(`../templates/${file}`, import.meta.url)]));
/**
* Fetch (once) one of the bundle's template files, honouring a `templates-base` override on
* `element`. Called from connectedCallback, which follows module evaluation closely enough that a
* separate eager kickoff buys nothing. The global nav differs: it ships in production and preloads
* its one file from the host's <head>.
* @param {string} file basename from FILES
* @param {Element} [element] the custom element asking, if it may carry templates-base
*/
function loadBundleTemplates$1(file, element) {
	const fallback = DEFAULT_URLS$1.get(file);
	if (!fallback) return Promise.reject(/* @__PURE__ */ new Error(`taxpert: unknown template file ${file}`));
	return loadTemplates(templateUrl(element, fallback, file));
}
/** The panel shell + rail + built-in section bodies + the <audited-fact> card. */
const loadPanelTemplates = (element) => loadBundleTemplates$1("audit-panel.html", element);
/** A modal's own markup plus the shared <dialog> shell it clones. */
const loadModalTemplates = (file, element) => Promise.all([loadBundleTemplates$1(file, element), loadModalShell()]);
const loadToolbarTemplates = (element) => loadBundleTemplates$1("all-screens-toolbar.html", element);

//#endregion
//#region src/shared/js/storage-keys.js
/**
* The namespaced key for `name`, which is the bare key a module wants ('watchlist', 'toolLayout',
* 'display', 'auditPanel', 'allScreens', 'featureFlags') without a prefix.
*
* One key does not come through here. '<prefix>:configOverrides' cannot, because this function
* reads the config that key helps build. See _overridesKey() in config.js.
*
* @param {string} name
* @returns {string} e.g. 'taxpert:watchlist', or 'twe:watchlist' under a configured prefix
*/
function storageKey(name) {
	return `${getConfig().app.storagePrefix || "taxpert"}:${name}`;
}

//#endregion
//#region src/audit-panel/js/storage.js
/** The namespaced sessionStorage key this module reads and writes. Call it; never cache it. */
function auditPanelStorageKey() {
	return storageKey("auditPanel");
}
const AUDIT_PANEL_STORAGE_FIELDS = /* @__PURE__ */ new Set([
	"isOpen",
	"trackedFacts",
	"width",
	"activeTab"
]);
function getAuditPanelStorage() {
	const storage = sessionStorage.getItem(auditPanelStorageKey());
	if (storage) return JSON.parse(storage);
	else return {};
}
function setAuditPanelStorage(key, value) {
	if (!AUDIT_PANEL_STORAGE_FIELDS.has(key)) throw new Error(`Unsupported audit panel storage key: ${key}`);
	const storage = getAuditPanelStorage();
	if (key === "trackedFacts") {
		const uniqueFacts = [];
		const seen = /* @__PURE__ */ new Set();
		for (const fact of value) {
			const factId = `${fact.path}#${fact.collectionId}`;
			if (!seen.has(factId)) {
				uniqueFacts.push(fact);
				seen.add(factId);
			}
		}
		storage.trackedFacts = uniqueFacts;
	} else if (key === "isOpen") storage.isOpen = value;
	else if (key === "width") storage.width = value;
	else if (key === "activeTab") storage.activeTab = value;
	sessionStorage.setItem(auditPanelStorageKey(), JSON.stringify(storage));
}

//#endregion
//#region src/audit-panel/js/tab-state.js
let lastActiveTabButton = null;
function getLastActiveTabButton() {
	return lastActiveTabButton;
}
function setLastActiveTabButton(button) {
	lastActiveTabButton = button;
}

//#endregion
//#region src/shared/js/collection-utils.js
/**
* Substitute a collection item's concrete id into an abstract collection path, e.g.
* `("/familyAndHousehold/*\/firstName", "abc")` → `/familyAndHousehold/#abc/firstName`.
* @param {string} abstractPath the abstract path containing a `*` collection wildcard
* @param {string} id the collection item id to splice in
* @returns {string} the concrete path
*/
function makeCollectionIdPath(abstractPath, id) {
	return abstractPath.replace("*", `#${id}`);
}

//#endregion
//#region src/audit-panel/js/fact-dictionary.js
let serializer = null;
/** Serialize a fact-dictionary node back to XML text. */
function serializeXml(node) {
	serializer ??= new XMLSerializer();
	return serializer.serializeToString(node);
}
/**
* The parsed fact-dictionary.xml Document. `null` until `loadFactDictionaryXml()` resolves
* (called from the audit panel's enable()). Consumers read it as a live binding.
* @type {Document | null}
*/
let factDictionaryXml = null;
let factDictionaryXmlPromise = null;
/**
* Lazily fetch + parse the fact dictionary XML exactly once (memoized: concurrent and repeat
* calls share the same fetch). Invoked from enable() so that, per ADR-004, production page
* loads with audit mode OFF never fetch the dictionary.
* @param {string} url the fact-dictionary.xml URL (from the panel's fact-dictionary-url attribute)
* @returns {Promise<Document>} the parsed fact-dictionary XML document
*/
function loadFactDictionaryXml(url) {
	if (!factDictionaryXmlPromise) factDictionaryXmlPromise = fetch(url).then((res) => res.text()).then((text) => {
		factDictionaryXml = new DOMParser().parseFromString(text, "application/xml");
		return factDictionaryXml;
	});
	return factDictionaryXmlPromise;
}

//#endregion
//#region src/audit-panel/js/audited-fact.js
const getFactSelect = () => document.querySelector("#fact-select");
var FactLink = class extends HTMLElement {
	connectedCallback() {
		this.path = this.getAttribute("path");
		this.collectionId = this.getAttribute("collectionId");
		const link = document.createElement("a");
		link.href = `#${this.path}`;
		while (this.firstChild) link.appendChild(this.firstChild);
		link.onclick = () => {
			const factGraphTabBtn = document.querySelector(".audit-panel__tab[data-tab=\"fact-graph\"]");
			if (factGraphTabBtn) {
				setLastActiveTabButton(factGraphTabBtn);
				factGraphTabBtn.click();
			} else {
				document.body.classList.add("audit-panel-open");
				setAuditPanelStorage("isOpen", true);
			}
			trackFact(this.path, this.collectionId);
			return false;
		};
		this.replaceChildren(link);
	}
};
customElements.define("fact-link", FactLink);
var AuditedFact = class extends HTMLElement {
	constructor() {
		super();
		this.deleteListener = () => {
			const newTrackedFacts = (getAuditPanelStorage().trackedFacts || []).filter((fact) => fact.path !== this.abstractPath && fact.collectionId !== this.collectionId);
			setAuditPanelStorage("trackedFacts", newTrackedFacts);
			this.remove();
		};
		this.renderListener = () => this.render();
		this.attachShadow({ mode: "open" });
		this.shadowRoot.append(getTemplate("tap-fact"));
		this.factPathElem = this.shadowRoot.querySelector(".audit-panel__fact__path");
		this.factTypeElem = this.shadowRoot.querySelector(".audit-panel__fact__type");
		this.factValueElem = this.shadowRoot.querySelector(".audit-panel__fact__value");
		this.factDefinitionElem = this.shadowRoot.querySelector(".audit-panel__fact__definition");
		this.removeButton = this.shadowRoot.querySelector(".audit-panel__fact__remove");
	}
	connectedCallback() {
		this.abstractPath = this.getAttribute("path");
		this.collectionId = this.getAttribute("collectionid");
		this.factPath = makeCollectionIdPath(this.abstractPath, this.collectionId);
		this.removeButton.addEventListener("click", this.deleteListener);
		this.addEventListener("click", this.handleLinksListener);
		document.addEventListener("fg-update", this.renderListener);
		this.render();
	}
	disconnectedCallback() {
		this.removeButton.removeEventListener("click", this.deleteListener);
		this.removeEventListener("click", this.handleLinksListener);
		document.removeEventListener("fg-update", this.renderListener);
		getFactSelect()?.focus();
	}
	render() {
		const definition = window.factGraph.dictionary.getDefinition(this.factPath);
		const fact = window.factGraph.get(this.factPath);
		this.factPathElem.innerText = this.factPath;
		this.factTypeElem.innerText = definition.typeNode;
		const factValueString = fact.hasValue ? fact.get.toString() + " " : "";
		const factCompleteString = fact.complete ? "[Complete]" : "[Incomplete]";
		this.factValueElem.innerText = `${factValueString} ${factCompleteString}`;
		const xmlDefinition = factDictionaryXml.querySelector(`Fact[path="${this.abstractPath}"]`);
		const stringDefinition = serializeXml(xmlDefinition).replace(/</g, "&lt;").replace(/>/g, "&gt;").split("\n").map((line, index) => index === 0 ? line : line.replace(/^ {4}/, "")).join("\n");
		const fullDefinition = Array.from(xmlDefinition.querySelectorAll("Dependency")).reduce((result, dependencyNode) => {
			const rawPath = dependencyNode.getAttribute("path");
			if (rawPath.includes("*")) return result;
			const link = `<fact-link path="${rawPath.replace("..", this.abstractPath.replace(/\*\/.*/, "*"))}" collectionId="${this.collectionId}">${rawPath}</fact-link>`;
			return result.replace(`path="${rawPath}"`, `path="${link}"`);
		}, stringDefinition);
		const definitionElement = document.createElement("div");
		definitionElement.setAttribute("slot", "definition");
		definitionElement.innerHTML = fullDefinition;
		this.querySelector("[slot=\"definition\"]")?.remove();
		this.append(definitionElement);
	}
};
customElements.define("audited-fact", AuditedFact);
function trackSelectedFact() {
	const factSelect = getFactSelect();
	const factPath = factSelect.value;
	const collectionId = document.querySelector("#fact-collection-id").value;
	if (factPath) {
		trackFact(factPath, collectionId);
		factSelect.value = "";
	}
}
/**
* Add a fact to the fact-inspector's tracked list (and persist it to session storage so it survives
* forward/back navigation). No-op beyond scrolling if the concrete fact is already tracked.
* @param {string} path the abstract fact path
* @param {string} collectionId collection item id to resolve a `*` wildcard, or '' for non-collection facts
* @param {boolean} [setFocus=true] move focus to the newly added fact (skip when restoring on load)
*/
function trackFact(path, collectionId, setFocus = true) {
	const factPath = makeCollectionIdPath(path, collectionId);
	const auditedFactsList = document.querySelector("#audit-panel__fact-list");
	const existingFact = auditedFactsList.querySelector(`audited-fact[path="${factPath}"]`);
	if (existingFact) return existingFact.scrollIntoView();
	console.debug(`Tracking ${factPath}`);
	const trackedFacts = getAuditPanelStorage().trackedFacts || [];
	trackedFacts.push({
		path,
		collectionId
	});
	setAuditPanelStorage("trackedFacts", trackedFacts);
	const auditedFact = document.createElement("audited-fact");
	auditedFact.setAttribute("path", path);
	auditedFact.setAttribute("collectionId", collectionId);
	auditedFactsList.appendChild(auditedFact);
	auditedFact.scrollIntoView();
	if (setFocus) {
		auditedFact.setAttribute("tabindex", "-1");
		auditedFact.focus();
		auditedFact.addEventListener("focusout", () => {
			auditedFact.removeAttribute("tabindex");
		}, { once: true });
	}
}
/**
* Drop every tracked fact, which is what the Explain section's "Clear facts" button does. Its inline
* `onclick="clearTrackedFacts()"` named a function that existed nowhere in the package, so the
* button has been inert since the panel moved here; this is that function.
*/
function clearTrackedFacts() {
	setAuditPanelStorage("trackedFacts", []);
	document.querySelector("#audit-panel__fact-list")?.replaceChildren();
}
/**
* Populate both fact-path datalists (fact-inspector `#fact-options` and chat `#chat-fact-options`)
* with every path the fact graph knows about. Called once the graph is available.
*/
function setFactOptions() {
	const paths = window.factGraph.paths().sort();
	for (const list of document.querySelectorAll("#fact-options, #chat-fact-options")) list.replaceChildren(...paths.map((path) => {
		const option = document.createElement("option");
		option.value = path;
		option.textContent = path;
		return option;
	}));
}
function onFactPathKeydown(event) {
	if (event.key !== "Enter") return;
	const factPath = event.target.value;
	const collectionId = document.querySelector("#fact-collection-id")?.value ?? "";
	if (factPath) {
		trackFact(factPath, collectionId);
		event.target.value = "";
	}
}
/**
* Bind the Fact Inspector's controls inside a freshly cloned section. Replaces the inline
* `onkeydown=`/`onclick=` attributes the templates used to carry: those need their handlers hung
* on `window`, and are blocked outright by any Content-Security-Policy worth having.
* @param {ParentNode} root the panel (or any container holding the cloned sections)
*/
function wireFactInspector(root) {
	for (const input of root.querySelectorAll("[data-fact-path-input]")) input.addEventListener("keydown", onFactPathKeydown);
	root.querySelector("[data-track-selected-fact]")?.addEventListener("click", trackSelectedFact);
	root.querySelector("[data-clear-tracked-facts]")?.addEventListener("click", clearTrackedFacts);
}
window.trackSelectedFact = trackSelectedFact;
window.clearTrackedFacts = clearTrackedFacts;

//#endregion
//#region src/audit-panel/js/feature-flags.js
const FLAG_CHANGE_EVENT = "taxpert:feature-flags-changed";
/**
* Where the runtime overrides live. Invoked at each read and write, never captured.
*
* THIS KEY MUST NOT MOVE for the hosts that exist today. credit-assistant and Fact Explorer both
* configure `storagePrefix: 'taxpert'`, so both still resolve to the literal 'taxpert:featureFlags'.
* Fact Explorer reads it by convention rather than by import, so a prefix change here would quietly
* decouple the two.
*/
const featureFlagsKey = () => storageKey("featureFlags");
/**
* Every flag this host understands. A flag is a statement about a host's roadmap, so the list is
* the host's and defaults to empty. Read late, never captured.
*
* Each entry carries `name` (camelCase, the storage key and what getFlag/setFlag take), `kebab`
* (the data-ff value, the body class, and the stem of the build-default attribute), and `label`.
*/
function flags() {
	return getConfig().featureFlags;
}
const defaultAttr = (flag) => `${flag.kebab}-default`;
function _readOverrides() {
	try {
		const parsed = JSON.parse(localStorage.getItem(featureFlagsKey()) ?? "{}");
		return new Map(Object.entries(parsed));
	} catch {
		return /* @__PURE__ */ new Map();
	}
}
function _writeOverrides(overrides) {
	try {
		localStorage.setItem(featureFlagsKey(), JSON.stringify(Object.fromEntries(overrides)));
	} catch {}
}
function _buildDefaults() {
	const panel = document.querySelector("taxpert-audit-panel");
	return new Map(flags().map((flag) => [flag.name, panel?.getAttribute(defaultAttr(flag)) === "true"]));
}
function getFlag(name) {
	const overrides = _readOverrides();
	const defaults = _buildDefaults();
	return overrides.has(name) ? overrides.get(name) : defaults.get(name) ?? false;
}
function setFlag(name, value) {
	const overrides = _readOverrides();
	const next = Boolean(value);
	overrides.set(name, next);
	_writeOverrides(overrides);
	document.dispatchEvent(new CustomEvent(FLAG_CHANGE_EVENT, { detail: {
		name,
		value: next
	} }));
}
/**
* Set the body class one flag's `[data-ff]` surfaces key off. Takes the flag's *kebab* spelling.
* Exported so <taxpert-scenario-modal>'s setAiScenarioGeneration(), the React adapter's entry
* point that drives the flag from fact-explorer's own state rather than from localStorage,
* writes the same one place.
*/
function setFlagClass(kebab, on) {
	document.body.classList.toggle(`ff-${kebab}`, Boolean(on));
}
const LEGACY_RAIL_FLAG = "legacyAuditPanel";
function applyFlags() {
	for (const flag of flags()) setFlagClass(flag.kebab, getFlag(flag.name));
	if (!getFlag("legacyAuditPanel")) document.querySelector("taxpert-audit-panel")?.closePanel();
}

//#endregion
//#region src/audit-panel/js/display-options.js
/** The namespaced sessionStorage key this module reads and writes. Call it, never cache it. */
function displayStorageKey() {
	return storageKey("display");
}
const LAYOUTS = ["stack", "wrap"];
const DEFAULTS$1 = {
	validationText: false,
	modalsInline: false,
	expandAccordions: null,
	layout: "stack"
};
const FIELDS = new Set(Object.keys(DEFAULTS$1));
function getDisplayOptions() {
	try {
		const raw = sessionStorage.getItem(displayStorageKey());
		return raw ? {
			...DEFAULTS$1,
			...JSON.parse(raw)
		} : { ...DEFAULTS$1 };
	} catch {
		return { ...DEFAULTS$1 };
	}
}
const MODE_OPTIONS = /* @__PURE__ */ new Map([["product", [
	"validationText",
	"modalsInline",
	"expandAccordions"
]], ["path", ["validationText", "modalsInline"]]]);
/**
* The destination being displayed. Read off the screens toolbar, the only element that knows, since
* one generated page serves both Browse All and Path Mode. Read at call time, never cached, because
* applyDisplayOptions() runs from the toolbar's own init once the element has upgraded.
*
* @returns {'product'|'browse'|'path'}
*/
function displayMode() {
	const toolbar = document.querySelector("taxpert-screens-toolbar");
	if (!toolbar) return "product";
	return toolbar.mode ?? "browse";
}
/** Whether `key` is one of the options this destination offers a control for. */
function offersDisplayOption(key, mode = displayMode()) {
	const offered = MODE_OPTIONS.get(mode);
	return !offered || offered.includes(key);
}
function setDisplayOption(key, value) {
	if (!FIELDS.has(key)) throw new Error(`Unsupported display option: ${key}`);
	const next = {
		...getDisplayOptions(),
		[key]: value
	};
	try {
		sessionStorage.setItem(displayStorageKey(), JSON.stringify(next));
	} catch {}
	return next;
}
function resolveExpandAccordions(stored) {
	if (typeof stored === "boolean") return stored;
	return displayMode() !== "product";
}
function applyValidationText(on) {
	document.querySelectorAll(getConfig().flowDom.questionTag).forEach((question) => {
		try {
			if (on) {
				if (!question.classList.contains("hidden")) question.validateRequiredFields?.();
			} else question.clearValidationError?.();
		} catch {}
	});
}
/** The inline copies on the page, which restoring deletes outright. */
const modalCopies = /* @__PURE__ */ new Set();
/** Links already placed, so a re-run does not stack a second copy under the same question. */
let placedLinks = /* @__PURE__ */ new WeakSet();
function modalFor(link, flowDom) {
	const id = link.getAttribute(flowDom.modalLinkAttr);
	if (!id) return null;
	const scope = link.closest(flowDom.screenSelector) ?? document;
	const escaped = globalThis.CSS?.escape ? globalThis.CSS.escape(id) : id.replace(/["\\]/g, "\\$&");
	return scope.querySelector(`${flowDom.modalTag}[id="${escaped}"]`);
}
function copyOf(modal) {
	const copy = modal.cloneNode(true);
	copy.removeAttribute("id");
	copy.removeAttribute("open");
	for (const el of copy.querySelectorAll("[id]")) el.removeAttribute("id");
	copy.dataset.taxpertModalInline = "true";
	return copy;
}
function relocateModals() {
	const flowDom = getConfig().flowDom;
	const selector = `${flowDom.modalLinkSelector}[${flowDom.modalLinkAttr}]`;
	for (const link of document.querySelectorAll(selector)) {
		if (placedLinks.has(link)) continue;
		const modal = modalFor(link, flowDom);
		if (!modal) continue;
		if (modal.contains(link)) continue;
		const anchor = link.closest(flowDom.questionTag) ?? link.parentElement;
		if (!anchor?.parentNode) continue;
		placedLinks.add(link);
		const copy = copyOf(modal);
		anchor.after(copy);
		modalCopies.add(copy);
	}
}
function restoreModals() {
	for (const copy of modalCopies) copy.remove();
	modalCopies.clear();
	placedLinks = /* @__PURE__ */ new WeakSet();
}
function bindCollectionAdds() {
	document.querySelectorAll(getConfig().flowDom.collectionAddSelector).forEach((element) => {
		if (element.dataset.modalsInlineBound === "true") return;
		element.dataset.modalsInlineBound = "true";
		element.addEventListener("click", () => {
			setTimeout(() => {
				if (getDisplayOptions().modalsInline) relocateModals();
			}, 0);
		});
	});
}
function applyModalsInline(on) {
	document.body.classList.toggle("display-modals-inline", on);
	if (on) {
		relocateModals();
		bindCollectionAdds();
	} else restoreModals();
}
function applyExpandAccordions(on) {
	document.querySelectorAll("details").forEach((d) => {
		d.open = on;
	});
}
function applyLayout(layout) {
	document.body.classList.toggle("layout--horizontal", layout === "wrap");
}
/**
* Push the stored options onto the host page. Safe to call repeatedly, every effect being a
* set-to-current-state rather than a toggle. Call it once the page's flow elements exist.
*/
function applyDisplayOptions(options = getDisplayOptions()) {
	const mode = displayMode();
	applyLayout(offersDisplayOption("layout", mode) ? options.layout : DEFAULTS$1.layout);
	applyExpandAccordions(resolveExpandAccordions(offersDisplayOption("expandAccordions", mode) ? options.expandAccordions : DEFAULTS$1.expandAccordions));
	applyModalsInline(offersDisplayOption("modalsInline", mode) ? options.modalsInline : DEFAULTS$1.modalsInline);
	applyValidationText(offersDisplayOption("validationText", mode) ? options.validationText : DEFAULTS$1.validationText);
}
/** Store one option and apply just that option's effect. Used by the modal's controls. */
function updateDisplayOption(key, value) {
	setDisplayOption(key, value);
	if (key === "layout") applyLayout(value);
	else if (key === "expandAccordions") applyExpandAccordions(value);
	else if (key === "modalsInline") applyModalsInline(value);
	else if (key === "validationText") applyValidationText(value);
}
/** The effective value of expandAccordions, with the per-destination default resolved. */
function expandAccordionsEnabled(options = getDisplayOptions()) {
	return resolveExpandAccordions(options.expandAccordions);
}

//#endregion
//#region src/audit-panel/js/chat.js
const chatStorageKey = () => storageKey("auditPanelChat");
const CHAT_TIMEOUT_MS = 9e4;
function _chatApiUrl() {
	return `${document.querySelector("taxpert-audit-panel")?.getAttribute("api-base") || getConfig().endpoints.apiBase}/chat`;
}
const FACT_TREE_MAX_DEPTH = 4;
const FACT_TREE_MAX_NODES = 50;
function _factValue(concretePath) {
	try {
		const fact = getConfig().graph.get(concretePath);
		if (fact?.hasValue) return {
			value: fact.get.toString(),
			complete: fact.complete
		};
	} catch {}
	return {
		value: null,
		complete: false
	};
}
function _factDependencyPaths(abstractPath) {
	const factDef = factDictionaryXml.querySelector(`Fact[path="${abstractPath}"]`);
	if (!factDef) return [];
	return Array.from(factDef.querySelectorAll("Dependency")).map((dep) => dep.getAttribute("path")).filter(Boolean);
}
function _abstractOf(concretePath) {
	return concretePath.replace(/#[^/]+/g, "*");
}
function _collectionIdOf(concretePath) {
	const match = concretePath.match(/#([^/]+)/);
	return match ? match[1] : null;
}
function _resolveDependencyConcrete(rawPath, parentAbstract, collectionId) {
	let abstractPath = rawPath.startsWith("..") ? rawPath.replace("..", parentAbstract.replace(/\*\/.*/, "*")) : rawPath;
	if (abstractPath.includes("*")) {
		if (!collectionId) return null;
		abstractPath = abstractPath.replace("*", `#${collectionId}`);
		if (abstractPath.includes("*")) return null;
	}
	return abstractPath;
}
function _buildFactTree(concretePath, depth, counter, seen) {
	if (depth > FACT_TREE_MAX_DEPTH || counter.n >= FACT_TREE_MAX_NODES) return null;
	if (seen.has(concretePath)) return {
		path: concretePath,
		repeated: true
	};
	seen.add(concretePath);
	counter.n++;
	const { value, complete } = _factValue(concretePath);
	const node = {
		path: concretePath,
		value,
		complete
	};
	const abstractPath = _abstractOf(concretePath);
	const collectionId = _collectionIdOf(concretePath);
	const children = [];
	for (const rawPath of _factDependencyPaths(abstractPath)) {
		if (counter.n >= FACT_TREE_MAX_NODES) break;
		const depConcrete = _resolveDependencyConcrete(rawPath, abstractPath, collectionId);
		if (!depConcrete) continue;
		const child = _buildFactTree(depConcrete, depth + 1, counter, seen);
		if (child) children.push(child);
	}
	if (children.length) node.dependencies = children;
	return node;
}
function _getTrackedFacts() {
	return (getAuditPanelStorage().trackedFacts || []).map(({ path, collectionId }) => {
		const factPath = makeCollectionIdPath(path, collectionId);
		const { value, complete } = _factValue(factPath);
		return {
			path: factPath,
			value,
			complete,
			dependencies: _buildFactTree(factPath, 0, { n: 0 }, /* @__PURE__ */ new Set())?.dependencies ?? []
		};
	});
}
function _escapeHtml(text) {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function _renderMarkdown(text) {
	const lines = text.split("\n");
	const output = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (line.trimStart().startsWith("```")) {
			const fenceLines = [];
			i++;
			while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
				fenceLines.push(_escapeHtml(lines[i]));
				i++;
			}
			output.push("<pre><code>" + fenceLines.join("\n") + "</code></pre>");
			i++;
			continue;
		}
		const h3Match = line.match(/^##\s+(.+)$/);
		const h4Match = line.match(/^###\s+(.+)$/);
		if (h4Match) {
			output.push("<h4>" + _renderInline(h4Match[1]) + "</h4>");
			i++;
			continue;
		}
		if (h3Match) {
			output.push("<h3>" + _renderInline(h3Match[1]) + "</h3>");
			i++;
			continue;
		}
		if (/^[-*]\s/.test(line)) {
			const items = [];
			while (i < lines.length && /^[-*]\s/.test(lines[i])) {
				items.push("<li>" + _renderInline(lines[i].replace(/^[-*]\s+/, "")) + "</li>");
				i++;
			}
			output.push("<ul>" + items.join("") + "</ul>");
			continue;
		}
		if (/^\d+\.\s/.test(line)) {
			const items = [];
			while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
				items.push("<li>" + _renderInline(lines[i].replace(/^\d+\.\s+/, "")) + "</li>");
				i++;
			}
			output.push("<ol>" + items.join("") + "</ol>");
			continue;
		}
		if (line.trim() === "") {
			output.push("<br>");
			i++;
			continue;
		}
		output.push(_renderInline(line) + "<br>");
		i++;
	}
	let result = output.join("");
	result = result.replace(/(<br>)+$/, "");
	return result;
}
function _renderInline(text) {
	return _escapeHtml(text).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}
function _appendChatMessage(role, content) {
	const container = document.getElementById("chat-messages");
	if (!container) return;
	const msg = document.createElement("div");
	msg.className = `chat-message chat-message--${role}`;
	msg.innerHTML = _renderMarkdown(content);
	container.appendChild(msg);
	container.scrollTop = container.scrollHeight;
	try {
		const history = JSON.parse(sessionStorage.getItem(chatStorageKey()) || "[]");
		history.push({
			role,
			content
		});
		sessionStorage.setItem(chatStorageKey(), JSON.stringify(history));
	} catch (_) {}
}
function _setChatStatus(text) {
	const el = document.getElementById("chat-status");
	if (el) el.textContent = text;
}
function _startThinkingAnimation() {
	const dots = [
		"",
		".",
		"..",
		"..."
	];
	let dotIdx = 0;
	let elapsed = 0;
	const id = setInterval(() => {
		elapsed++;
		dotIdx = (dotIdx + 1) % dots.length;
		_setChatStatus(`Thinking${dots[dotIdx]} (${elapsed}s)`);
	}, 1e3);
	return () => clearInterval(id);
}
async function _sendChatMessage() {
	const textarea = document.querySelector(".chat-container__textarea");
	const prompt = textarea?.value.trim();
	if (!prompt) return;
	_appendChatMessage("user", prompt);
	textarea.value = "";
	document.querySelector(".chat-container__submit-btn")?.setAttribute("disabled", "true");
	_setChatStatus("Thinking…");
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
	const stopAnimation = _startThinkingAnimation();
	try {
		const res = await fetch(_chatApiUrl(), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				prompt,
				tracked_facts: _getTrackedFacts()
			}),
			signal: controller.signal
		});
		if (!res.ok) {
			_setChatStatus(`Error: ${(await res.json().catch(() => ({}))).detail ?? res.statusText}`);
			return;
		}
		_appendChatMessage("assistant", (await res.json()).content);
		_setChatStatus("");
	} catch (err) {
		if (err.name === "AbortError") _setChatStatus("Request timed out — the backend took too long to respond.");
		else _setChatStatus(`Error: ${err.message ?? "Request failed"}`);
	} finally {
		clearTimeout(timeoutId);
		stopAnimation();
		document.querySelector(".chat-container__submit-btn")?.removeAttribute("disabled");
	}
}
/**
* Wire the chat submit button + textarea and restore history from sessionStorage. Called from
* the panel's enable() once the panel DOM exists (idempotent guard via a dataset flag).
*/
function initChat() {
	const submitBtn = document.querySelector("#chat-submit-btn");
	const textarea = document.querySelector(".chat-container__textarea");
	if (!submitBtn || !textarea) return;
	if (submitBtn.dataset.chatInitialized === "true") return;
	submitBtn.dataset.chatInitialized = "true";
	submitBtn.addEventListener("click", _sendChatMessage);
	textarea.addEventListener("keydown", (e) => {
		if (e.key === "Enter" && e.ctrlKey) {
			e.preventDefault();
			_sendChatMessage();
		}
	});
	const saved = sessionStorage.getItem(chatStorageKey());
	if (saved) try {
		JSON.parse(saved).forEach(({ role, content }) => _appendChatMessage(role, content));
	} catch (_) {}
}

//#endregion
//#region src/audit-panel/js/fact-graph-io.js
function _panel() {
	return document.querySelector("taxpert-audit-panel");
}
function _apiBase() {
	return _panel()?.getAttribute("api-base") || getConfig().endpoints.apiBase;
}
/** The directory a host serves its scenario JSONs from, e.g. /resources/scenarios. */
function _scenariosBase() {
	return _panel()?.getAttribute("scenarios-base") || getConfig().endpoints.scenariosBase;
}
/**
* Copy the serialized fact graph JSON to the clipboard and flash the `#copy-fg-status` element's
* success animation. Logs to console.error on clipboard failure.
* @returns {Promise<void>}
*/
async function copyFactGraphToClipboard() {
	const fg = getConfig().graph.toJson();
	const status = document.getElementById("copy-fg-status");
	try {
		await navigator.clipboard.writeText(fg);
		status.classList.add("animate-success");
		status.onanimationend = () => {
			status.classList.remove("animate-success");
		};
	} catch (err) {
		console.error(`Failed to copy: ${err}`);
	}
}
window.copyFactGraphToClipboard = copyFactGraphToClipboard;
function loadFactGraphFromAuditPanel() {
	const textarea = document.querySelector("#load-fact-graph");
	const formGroup = textarea.closest(".usa-form-group");
	const label = formGroup.querySelector(".usa-label");
	let errorMessage = formGroup.querySelector("#load-fact-graph-error");
	try {
		getConfig().graph.load(textarea.value);
		if (errorMessage) {
			errorMessage.remove();
			textarea.classList.remove("usa-input--error");
			textarea.removeAttribute("aria-describedby");
			label.classList.remove("usa-label--error");
			formGroup.classList.remove("usa-form-group--error");
		}
	} catch (error) {
		const errorMessageId = "load-fact-graph-error";
		if (!errorMessage) {
			errorMessage = document.createElement("span");
			errorMessage.id = errorMessageId;
			errorMessage.className = "usa-error-message";
			label.after(errorMessage);
			errorMessage.innerText = "Enter a valid JSON";
			label.classList.add("usa-label--error");
			textarea.classList.add("usa-input--error");
			textarea.setAttribute("aria-describedby", errorMessageId);
			formGroup.classList.add("usa-form-group--error");
			textarea.focus();
		}
	}
}
window.loadFactGraphFromAuditPanel = loadFactGraphFromAuditPanel;
function loadScenarioFromAuditPanel() {
	const select = document.querySelector("#scenario-select");
	if (!select || !select.value) return;
	fetch(`${_scenariosBase()}/${select.value}`).then((res) => {
		if (!res.ok) throw new Error(res.statusText);
		return res.text();
	}).then((json) => getConfig().graph.load(json)).catch((err) => console.error("Failed to load scenario:", err));
}
window.loadScenarioFromAuditPanel = loadScenarioFromAuditPanel;
const SCENARIO_TIMEOUT_MS = 9e4;
const generatedScenarioKey = () => storageKey("generatedScenario");
function _setGenStatus(text) {
	const el = document.getElementById("scenario-gen-status");
	if (el) el.textContent = text;
}
function _startGeneratingAnimation() {
	const dots = [
		"",
		".",
		"..",
		"..."
	];
	let dotIdx = 0;
	let elapsed = 0;
	const id = setInterval(() => {
		elapsed++;
		dotIdx = (dotIdx + 1) % dots.length;
		_setGenStatus(`Generating${dots[dotIdx]} (${elapsed}s)`);
	}, 1e3);
	return () => clearInterval(id);
}
/**
* POST the user's description to the scenario-generation backend, then load the returned
* draft Fact Graph. loadFactGraph() validates synchronously via GraphFactory.fromJSON
* (throwing before its deferred reload), so an invalid draft is caught here and nothing is
* persisted. On success the draft is stashed so renderGeneratedScenarioResult() can show the
* description + Download button after the page reload.
*/
async function generateScenarioFromPrompt() {
	const prompt = document.querySelector("#scenario-gen-prompt")?.value.trim();
	if (!prompt) return;
	const btn = document.querySelector("#generate-scenario-btn");
	const result = document.getElementById("scenario-gen-result");
	if (result) result.hidden = true;
	sessionStorage.removeItem(generatedScenarioKey());
	btn?.setAttribute("disabled", "true");
	_setGenStatus("Generating…");
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), SCENARIO_TIMEOUT_MS);
	const stopAnimation = _startGeneratingAnimation();
	try {
		const res = await fetch(`${_apiBase()}/scenario/generate`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ prompt }),
			signal: controller.signal
		});
		if (!res.ok) {
			_setGenStatus(`Error: ${(await res.json().catch(() => ({}))).detail ?? res.statusText}`);
			return;
		}
		const data = await res.json();
		const serialized = JSON.stringify(data.scenario_json);
		sessionStorage.setItem(generatedScenarioKey(), JSON.stringify({
			serialized,
			filename: data.filename,
			description: data.description
		}));
		try {
			getConfig().graph.load(serialized);
		} catch (err) {
			sessionStorage.removeItem(generatedScenarioKey());
			_setGenStatus(`The generated scenario could not be loaded: ${err.message ?? "invalid graph"}`);
		}
	} catch (err) {
		if (err.name === "AbortError") _setGenStatus("Request timed out — the backend took too long to respond.");
		else _setGenStatus(`Error: ${err.message ?? "Request failed"}`);
	} finally {
		clearTimeout(timeoutId);
		stopAnimation();
		btn?.removeAttribute("disabled");
	}
}
function _downloadJson(filename, text) {
	const blob = new Blob([text], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}
/**
* After loadFactGraph()'s reload, surface the generated scenario's description and wire the
* Download button. No-op when there's no generated scenario in this session.
*/
function renderGeneratedScenarioResult() {
	const raw = sessionStorage.getItem(generatedScenarioKey());
	if (!raw) return;
	let stashed;
	try {
		stashed = JSON.parse(raw);
	} catch {
		sessionStorage.removeItem(generatedScenarioKey());
		return;
	}
	const result = document.getElementById("scenario-gen-result");
	const description = document.getElementById("scenario-gen-description");
	const downloadBtn = document.getElementById("download-scenario-btn");
	if (!result || !description || !downloadBtn) return;
	description.textContent = stashed.description || "";
	result.hidden = false;
	_setGenStatus("Scenario generated and loaded.");
	downloadBtn.onclick = () => _downloadJson(stashed.filename || "scenario.json", stashed.serialized || "");
}
function clearGeneratedScenario() {
	sessionStorage.removeItem(generatedScenarioKey());
	const result = document.getElementById("scenario-gen-result");
	if (result) result.hidden = true;
}
/**
* Unload whatever scenario the page is holding: throw the facts away, put the library <select>
* back to its placeholder, and forget any AI-generated scenario.
*
* This is what "Clear scenario" always meant and never did. The button was wired to
* clearGeneratedScenario(), which only hides the AI section's result, so pressing it left every
* loaded fact in place.
*
* Clearing goes through the port's load() with an empty graph rather than deleting the host's
* storage key: taxpert namespaces its own keys and deliberately does not know the flow runtime's
* prefix (see storage-keys.js), so removing '<prefix>:factGraph' from here would clear nothing. An
* empty JSON object is a graph with no facts, and load() persists it and reloads the page, the
* same path a loaded scenario takes.
*/
function clearScenario() {
	clearGeneratedScenario();
	const select = document.querySelector("#scenario-select");
	if (select) select.selectedIndex = 0;
	try {
		getConfig().graph.load("{}");
	} catch (err) {
		console.error("Failed to clear scenario:", err);
	}
}

//#endregion
//#region src/audit-panel/js/scenario-modal.js
function parseOptions(html) {
	return new DOMParser().parseFromString(`<select>${html}</select>`, "text/html").querySelectorAll("option");
}
var TaxpertScenarioModal = class extends HTMLElement {
	constructor() {
		super();
		this._scenarioOptions = null;
		this._scenarioFilters = null;
		this._connected = false;
		this._rendered = false;
		this.ready = Promise.resolve();
		this._onNavTool = (event) => {
			if (event.detail?.id === "scenario") this.open();
		};
	}
	connectedCallback() {
		document.addEventListener("nav-tool-select", this._onNavTool);
		if (this._connected) return;
		this._connected = true;
		this.ready = loadModalTemplates("scenario-modal.html", this).then(() => {
			if (this.isConnected && !this._rendered) this.render();
			if (this._openWhenReady) {
				this._openWhenReady = false;
				this.open();
			}
		});
	}
	disconnectedCallback() {
		document.removeEventListener("nav-tool-select", this._onNavTool);
	}
	/** The host's scenario library as nodes: an array, NodeList, or DocumentFragment. */
	set scenarioOptions(options) {
		this._scenarioOptions = null;
		if (options) {
			const fragment = document.createDocumentFragment();
			for (const option of options.childNodes ?? options) fragment.appendChild(option.cloneNode(true));
			if (fragment.childNodes.length) this._scenarioOptions = fragment;
		}
		if (this._rendered) this._applyScenarioOptions();
	}
	get scenarioOptions() {
		return this._scenarioOptions;
	}
	get scenarioOptionsHtml() {
		if (!this._scenarioOptions) return "";
		return [...this._scenarioOptions.children].map((option) => option.outerHTML).join("");
	}
	set scenarioOptionsHtml(html) {
		this.scenarioOptions = html ? parseOptions(html) : null;
	}
	/**
	* Inject host filter dropdowns above the scenario <select>. `fields` is an array of
	* { id, groupId?, key, label, options:[{value,label}], showFor?:{ filter, values } };
	* `parseFilename` maps a scenario filename to an object keyed by each field's `key`. A value may
	* be a string or an array of them — an array matches if it contains the selected option.
	*/
	registerScenarioFilters(fields, parseFilename) {
		this._scenarioFilters = {
			fields: fields ?? [],
			parseFilename
		};
		if (this._rendered) this._renderScenarioFilters();
	}
	setAiScenarioGeneration(on) {
		setFlagClass("ai-scenario-generation", on);
	}
	open() {
		if (!this._rendered) {
			this._openWhenReady = true;
			return;
		}
		if (!openDialog(this._dialog)) return;
		this.setAiScenarioGeneration(getFlag("aiScenarioGeneration"));
		renderGeneratedScenarioResult();
	}
	close() {
		closeDialog(this._dialog);
	}
	render() {
		const { dialog, main } = buildModalShell(this, {
			id: "manage-scenario-modal",
			prefix: "tsm",
			heading: "Manage scenario"
		});
		main.appendChild(getTemplate("tsm-sections"));
		this._dialog = dialog;
		this._rendered = true;
		this._applyScenarioOptions();
		this._renderScenarioFilters();
		this._wire();
		this.setAiScenarioGeneration(getFlag("aiScenarioGeneration"));
	}
	_applyScenarioOptions() {
		const select = this.querySelector("#scenario-select");
		const block = this.querySelector("#scenario-library-block");
		if (!select || !block) return;
		while (select.options.length > 1) select.remove(1);
		if (this._scenarioOptions) select.appendChild(this._scenarioOptions.cloneNode(true));
		block.hidden = !this._scenarioOptions;
	}
	_renderScenarioFilters() {
		if (!this._scenarioFilters) return;
		const container = this.querySelector(".scenario-filters");
		if (!container) return;
		container.textContent = "";
		for (const field of this._scenarioFilters.fields) {
			const fragment = getTemplate("tsm-filter-field");
			const group = fragment.querySelector(".usa-form-group");
			if (field.groupId) group.id = field.groupId;
			const label = fragment.querySelector("label");
			label.htmlFor = field.id;
			label.textContent = field.label;
			const select = fragment.querySelector("select");
			select.id = field.id;
			for (const option of field.options) {
				const node = document.createElement("option");
				node.value = option.value;
				node.textContent = option.label;
				select.appendChild(node);
			}
			select.addEventListener("change", () => this._filterScenarios());
			container.appendChild(fragment);
		}
	}
	_filterScenarios() {
		if (!this._scenarioFilters) return;
		const { fields, parseFilename } = this._scenarioFilters;
		const values = {};
		for (const field of fields) values[field.id] = this.querySelector(`#${field.id}`)?.value ?? "";
		for (const field of fields) {
			if (!field.showFor || !field.groupId) continue;
			const group = this.querySelector(`#${field.groupId}`);
			if (group) group.hidden = !field.showFor.values.includes(values[field.showFor.filter]);
		}
		const select = this.querySelector("#scenario-select");
		if (!select) return;
		for (const option of select.options) {
			if (!option.value) continue;
			const parsed = parseFilename(option.value);
			option.hidden = fields.some((field) => {
				const v = values[field.id];
				if (!v) return false;
				const parsedValue = parsed[field.key];
				return Array.isArray(parsedValue) ? !parsedValue.includes(v) : parsedValue !== v;
			});
		}
		const selectedOption = select.options[select.selectedIndex];
		if (selectedOption && selectedOption.hidden) select.value = "";
	}
	_wire() {
		this.querySelector("#copy-fact-graph-btn")?.addEventListener("click", copyFactGraphToClipboard);
		this.querySelector("#load-fact-graph-btn")?.addEventListener("click", loadFactGraphFromAuditPanel);
		this.querySelector("#load-fact-graph")?.addEventListener("change", (event) => event.target.setCustomValidity(""));
		this.querySelector("#load-scenario-btn")?.addEventListener("click", loadScenarioFromAuditPanel);
		this.querySelector("#generate-scenario-btn")?.addEventListener("click", generateScenarioFromPrompt);
		this.querySelector("#all-screens-clear-scenario")?.addEventListener("click", clearScenario);
	}
};
customElements.define("taxpert-scenario-modal", TaxpertScenarioModal);

//#endregion
//#region src/audit-panel/js/display-modal.js
const VISIBILITY_OPTIONS = [
	{
		key: "validationText",
		id: "display-validation-text",
		label: "Show validation text"
	},
	{
		key: "modalsInline",
		id: "display-modals-inline",
		label: "Show modals inline"
	},
	{
		key: "expandAccordions",
		id: "display-expand-accordions",
		label: "Expand all accordions"
	}
];
const LAYOUT_LABELS = /* @__PURE__ */ new Map([["stack", "Stack (default)"], ["wrap", "Wrap"]]);
/** A descriptor's current state, which may be given as a value or as a function of one. */
const resolve = (state) => typeof state === "function" ? state() : state;
/** The input id a Visibility row gets: the descriptor's own, or its position. */
const visibilityRowId = (option, index) => option.id ?? `display-visibility-${index}`;
const visibilityIds = (options) => options.map(visibilityRowId).join("\0");
const layoutChoices = (descriptor) => (descriptor?.options ?? []).map((option) => `${option.value} ${option.label}`).join("");
/** The built-in Visibility rows, filtered to the options this destination offers. */
function builtInVisibilityOptions(mode) {
	return VISIBILITY_OPTIONS.filter((option) => offersDisplayOption(option.key, mode)).map((option) => ({
		id: option.id,
		label: option.label,
		checked: () => option.key === "expandAccordions" ? expandAccordionsEnabled() : !!getDisplayOptions()[option.key],
		onChange: (checked) => updateDisplayOption(option.key, checked)
	}));
}
/** The built-in Layout radios: how a screen's questions are arranged. */
function builtInLayoutOptions() {
	return {
		options: LAYOUTS.map((value) => ({
			value,
			label: LAYOUT_LABELS.get(value) ?? value
		})),
		value: () => {
			const stored = getDisplayOptions().layout;
			return LAYOUTS.includes(stored) ? stored : LAYOUTS[0];
		},
		onChange: (value) => updateDisplayOption("layout", value)
	};
}
var TaxpertDisplayModal = class extends HTMLElement {
	constructor() {
		super();
		this._languageOptionsHtml = null;
		this._visibilityOptions = null;
		this._layoutOptions = null;
		this._footerAction = null;
		this._visibilityRows = [];
		this._layoutRows = [];
		this._connected = false;
		this._rendered = false;
		this.ready = Promise.resolve();
		this._onNavTool = (event) => {
			if (event.detail?.id === "display") this.open();
		};
	}
	connectedCallback() {
		document.addEventListener("nav-tool-select", this._onNavTool);
		if (this._connected) return;
		this._connected = true;
		this.ready = loadModalTemplates("display-modal.html", this).then(() => {
			if (this.isConnected && !this._rendered) this.render();
			if (this._openWhenReady) {
				this._openWhenReady = false;
				this.open();
			}
		});
	}
	disconnectedCallback() {
		document.removeEventListener("nav-tool-select", this._onNavTool);
	}
	get mode() {
		const attr = this.getAttribute("mode");
		if (attr === "product" || attr === "browse" || attr === "path") return attr;
		const toolbar = document.querySelector("taxpert-screens-toolbar");
		return toolbar ? toolbar.mode ?? "browse" : "product";
	}
	set mode(value) {
		this.setAttribute("mode", value);
		if (!this._rendered) return;
		if (!this._visibilityOptions) this._renderVisibilityOptions();
		this._syncSectionVisibility();
	}
	get visibilityOptions() {
		return this._visibilityOptions ?? builtInVisibilityOptions(this.mode);
	}
	set visibilityOptions(options) {
		this._visibilityOptions = Array.isArray(options) ? options : null;
		if (!this._rendered) return;
		const next = this.visibilityOptions;
		const onScreen = this._visibilityRows.map((row) => ({ id: row.input.id }));
		if (visibilityIds(onScreen) === visibilityIds(next)) {
			const incoming = next[Symbol.iterator]();
			for (const row of this._visibilityRows) row.option = incoming.next().value;
			this._syncOptionState();
		} else this._renderVisibilityOptions();
	}
	get layoutOptions() {
		return this._layoutOptions ?? builtInLayoutOptions();
	}
	set layoutOptions(options) {
		const previous = this._layoutOptions;
		this._layoutOptions = options?.options?.length ? options : null;
		if (!this._rendered) return;
		if (layoutChoices(previous) === layoutChoices(this._layoutOptions)) this._syncOptionState();
		else this._renderLayoutOptions();
		this._syncSectionVisibility();
	}
	get footerAction() {
		return this._footerAction;
	}
	set footerAction(action) {
		const previous = this._footerAction;
		this._footerAction = action?.label ? action : null;
		if (this._rendered && previous?.label !== this._footerAction?.label) this._renderFooterAction();
	}
	get languageOptionsHtml() {
		if (this._languageOptionsHtml !== null) return this._languageOptionsHtml;
		const host = document.querySelector(HOST_LANGUAGE_SELECT);
		if (!host) return "";
		return Array.from(host.options).map((option) => option.outerHTML).join("");
	}
	set languageOptionsHtml(html) {
		this._languageOptionsHtml = html || "";
		if (this._rendered) this._renderLanguageOptions();
	}
	open() {
		if (!this._rendered) {
			this._openWhenReady = true;
			return;
		}
		this._syncSectionVisibility();
		this._syncOptionState();
		this._renderLanguageOptions();
		openDialog(this._dialog);
	}
	close() {
		closeDialog(this._dialog);
	}
	render() {
		const { dialog, main } = buildModalShell(this, {
			id: "display-options-modal",
			prefix: "tdm",
			heading: "Display options"
		});
		main.appendChild(getTemplate("tdm-sections"));
		this._dialog = dialog;
		this._rendered = true;
		this._renderVisibilityOptions();
		this._renderLayoutOptions();
		this._renderFooterAction();
		this._renderLanguageOptions();
		this._syncSectionVisibility();
	}
	_renderVisibilityOptions() {
		const container = this.querySelector("[data-options=\"visibility\"]");
		const rows = [];
		container.replaceChildren();
		this.visibilityOptions.forEach((option, index) => {
			const fragment = getTemplate("tdm-option-checkbox");
			const input = fragment.querySelector("input");
			input.id = visibilityRowId(option, index);
			input.value = input.id;
			const label = fragment.querySelector("label");
			label.htmlFor = input.id;
			label.textContent = option.label;
			const row = {
				option,
				input
			};
			input.addEventListener("change", () => row.option.onChange?.(input.checked));
			rows.push(row);
			container.appendChild(fragment);
		});
		this._visibilityRows = rows;
		this._syncOptionState();
	}
	_renderLayoutOptions() {
		const container = this.querySelector("[data-options=\"layout\"]");
		const rows = [];
		container.replaceChildren();
		for (const layout of this.layoutOptions.options) {
			const fragment = getTemplate("tdm-option-radio");
			const input = fragment.querySelector("input");
			input.id = `display-layout-${layout.value}`;
			input.value = layout.value;
			input.addEventListener("change", () => {
				if (input.checked) this.layoutOptions.onChange?.(layout.value);
			});
			const label = fragment.querySelector("label");
			label.htmlFor = input.id;
			label.textContent = layout.label;
			rows.push({
				layout,
				input
			});
			container.appendChild(fragment);
		}
		this._layoutRows = rows;
		this._syncOptionState();
	}
	_renderFooterAction() {
		const footer = this.querySelector("[data-footer]");
		if (!footer) return;
		footer.replaceChildren();
		footer.hidden = !this._footerAction;
		if (!this._footerAction) return;
		const fragment = getTemplate("tdm-footer-button");
		const button = fragment.querySelector("button");
		button.textContent = this._footerAction.label;
		button.addEventListener("click", () => this._footerAction?.onSelect?.());
		footer.appendChild(fragment);
	}
	_syncOptionState() {
		for (const { option, input } of this._visibilityRows) input.checked = !!resolve(option.checked);
		const current = resolve(this.layoutOptions.value);
		for (const { layout, input } of this._layoutRows) input.checked = layout.value === current;
	}
	_renderLanguageOptions() {
		const select = this.querySelector("#display-language-selector");
		const section = this.querySelector("[data-section=\"language\"]");
		if (!select || !section) return;
		const optionsHtml = this.languageOptionsHtml;
		section.hidden = !optionsHtml;
		if (!optionsHtml) {
			select.replaceChildren();
			return;
		}
		if (select.options.length && this._languageHtmlRendered === optionsHtml) return;
		const parsed = new DOMParser().parseFromString(`<select>${optionsHtml}</select>`, "text/html");
		select.replaceChildren(...[...parsed.querySelectorAll("option")].map((o) => o.cloneNode(true)));
		this._languageHtmlRendered = optionsHtml;
		const here = document.location?.pathname ?? "";
		const currentOption = Array.from(select.options).find((option) => option.value.split("?")[0] === here);
		if (currentOption) currentOption.selected = true;
		if (!this._languageWired) {
			select.addEventListener("change", () => {
				if (select.value) document.location.href = select.value;
			});
			this._languageWired = true;
		}
	}
	_syncSectionVisibility() {
		const layout = this.querySelector("[data-section=\"layout\"]");
		if (layout) layout.hidden = !this._layoutOptions && !offersDisplayOption("layout", this.mode);
	}
};
customElements.define("taxpert-display-modal", TaxpertDisplayModal);

//#endregion
//#region src/shared/js/apps.js
/** The event a host may intercept to switch application in-app instead of navigating. */
const APP_SELECT_EVENT = "taxpert:app-select";
const items = (apps) => Array.isArray(apps?.items) ? apps.items : [];
/**
* The applications a host declared, or an empty list.
*
* @param {object} apps the `apps` namespace of a configuration
* @returns {Array<{id: string, label?: string, destinations?: Array<{id: string, label?: string, href?: string}>}>}
*/
function appItems(apps) {
	return items(apps).filter((app) => typeof app?.id === "string" && app.id.length > 0);
}
/** Whether there is a choice to offer. Below two, the Applications section hides itself. */
function hasAppChoice(apps) {
	return appItems(apps).length > 1;
}
/** An application's destinations, as `[{id, label, href}]`. */
function destinationsOf(app) {
	return Array.isArray(app?.destinations) ? app.destinations.filter((d) => d?.id) : [];
}
/**
* Where selecting `targetId` goes from the destination you are on now: the same destination in the
* target application when it has one, otherwise its first. `null` when the target declares none.
*
* @param {object} apps the `apps` namespace
* @param {string} targetId the application being switched to
* @param {string|null} destinationId the nav destination currently active
* @returns {{app: object, destination: object}|null}
*/
function switchTarget(apps, targetId, destinationId) {
	const app = appItems(apps).find((candidate) => candidate.id === targetId);
	if (!app) return null;
	const destinations = destinationsOf(app);
	if (!destinations.length) return null;
	return {
		app,
		destination: destinations.find((d) => d.id === destinationId) ?? destinations[0]
	};
}
/**
* The destination the page is on, read from the mounted nav's `active` attribute rather than from
* configuration, because the page knows where it is and the configuration does not.
*
* @returns {string|null}
*/
function activeDestination(root = document) {
	return root.querySelector("taxpert-global-nav")?.getAttribute("active") || null;
}

//#endregion
//#region src/audit-panel/js/outcomes-editor.js
/**
* The editable properties of each outcome kind: the descriptor key, and the words on its field.
* `value` has none, meaning "show the fact's own formatted value", which needs no wording.
*
* `{abs}` is spelled out in the signed labels because a template without it silently drops the
* amount, and this is the only place a person would find that out.
*/
const KIND_FIELDS = /* @__PURE__ */ new Map([
	["boolean", [{
		key: "true",
		label: "When true, say"
	}, {
		key: "false",
		label: "When false, say"
	}]],
	["map", []],
	["signed", [
		{
			key: "positive",
			label: "When positive, say (use {abs} for the amount)"
		},
		{
			key: "negative",
			label: "When negative, say (use {abs} for the amount)"
		},
		{
			key: "zero",
			label: "When zero, say"
		}
	]],
	["value", []]
]);
/** What each kind is called in the "Spoken as" menu. */
const KIND_LABELS = /* @__PURE__ */ new Map([
	["boolean", "Yes / no fact"],
	["map", "One of a set of options"],
	["signed", "Amount, with a direction"],
	["value", "The value itself"]
]);
/** A blank determination, so "Add outcome" produces something the validator accepts. */
function blankDetermination(index) {
	return {
		id: `outcome-${index + 1}`,
		label: "New outcome",
		rollupPath: "/",
		outcome: { kind: "value" },
		sections: [{
			heading: "Facts",
			facts: []
		}]
	};
}
const linesToFacts = (text) => text.split("\n").map((line) => line.trim()).filter(Boolean);
/** `values` as "option = label" lines, which is the shortest thing to type and to read back. */
function valuesToLines(values) {
	return Object.entries(values ?? {}).map(([option, label]) => `${option} = ${label}`).join("\n");
}
function linesToValues(text) {
	const values = {};
	for (const line of text.split("\n")) {
		const at = line.indexOf("=");
		if (at === -1) continue;
		const option = line.slice(0, at).trim();
		if (option) setDescriptorKey(values, option, line.slice(at + 1).trim());
	}
	return values;
}
/**
* Build the Outcomes section into `host` (the settings modal).
*
* @param {HTMLElement} host
* @returns {{ render: () => void }} render() rebuilds from the current config
*/
function createOutcomesEditor(host) {
	const list = host.querySelector("[data-options=\"outcomes\"]");
	const empty = host.querySelector("[data-empty=\"outcomes\"]");
	const paths = host.querySelector("#twsm-fact-paths");
	function commit(determinations) {
		const result = setConfigOverride("determinations", determinations);
		if (!result.ok) {
			console.warn(`taxpert: could not save outcomes — ${result.errors.join("; ")}`);
			render();
		}
		return result;
	}
	const current = () => structuredClone(getConfig().determinations);
	function update(index, mutate) {
		const next = current();
		mutate(next[index], next);
		commit(next);
	}
	function updateSection(index, sectionIndex, mutate) {
		update(index, (determination) => mutate(determination.sections[sectionIndex], determination));
	}
	function renderPathOptions() {
		const known = getConfig().graph.paths() ?? [];
		paths.replaceChildren();
		for (const path of known) {
			const option = document.createElement("option");
			option.value = path;
			paths.appendChild(option);
		}
	}
	function renderKindFields(container, determination, index) {
		container.replaceChildren();
		const kind = determination.outcome?.kind ?? "value";
		if (kind === "map") {
			const field = getTemplate("twsm-kind-field").firstElementChild;
			const input = field.querySelector("input");
			const area = document.createElement("textarea");
			area.className = "usa-textarea";
			area.rows = 4;
			area.value = valuesToLines(determination.outcome?.values);
			input.replaceWith(area);
			const label = field.querySelector("label");
			label.textContent = "Options, one “name = wording” per line";
			label.htmlFor = area.id = `twsm-outcome-${index}-values`;
			area.addEventListener("change", () => {
				update(index, (d) => {
					d.outcome = {
						kind: "map",
						values: linesToValues(area.value)
					};
				});
			});
			container.appendChild(field);
			return;
		}
		for (const { key, label: wording } of KIND_FIELDS.get(kind) ?? []) {
			const field = getTemplate("twsm-kind-field").firstElementChild;
			const input = field.querySelector("input");
			input.id = `twsm-outcome-${index}-${key}`;
			input.value = Object.getOwnPropertyDescriptor(determination.outcome ?? {}, key)?.value ?? "";
			const label = field.querySelector("label");
			label.htmlFor = input.id;
			label.textContent = wording;
			input.addEventListener("change", () => {
				update(index, (d) => {
					d.outcome = setDescriptorKey({
						...d.outcome,
						kind
					}, key, input.value);
				});
			});
			container.appendChild(field);
		}
	}
	function renderSections(container, determination, index) {
		container.replaceChildren();
		determination.sections.forEach((section, sectionIndex) => {
			const node = getTemplate("twsm-outcome-section").firstElementChild;
			const heading = node.querySelector("[data-field=\"heading\"]");
			heading.id = `twsm-outcome-${index}-section-${sectionIndex}-heading`;
			heading.value = section.heading ?? "";
			node.querySelector("[data-field=\"heading-for\"]").htmlFor = heading.id;
			heading.addEventListener("change", () => {
				updateSection(index, sectionIndex, (s) => {
					s.heading = heading.value.trim();
				});
			});
			const facts = node.querySelector("[data-field=\"facts\"]");
			facts.id = `twsm-outcome-${index}-section-${sectionIndex}-facts`;
			facts.value = (section.facts ?? []).join("\n");
			node.querySelector("[data-field=\"facts-for\"]").htmlFor = facts.id;
			facts.addEventListener("change", () => {
				updateSection(index, sectionIndex, (s) => {
					s.facts = linesToFacts(facts.value);
				});
			});
			node.querySelector("[data-action=\"remove-section\"]").addEventListener("click", () => {
				update(index, (d) => {
					d.sections.splice(sectionIndex, 1);
				});
			});
			container.appendChild(node);
		});
	}
	function renderDetermination(determination, index, total) {
		const node = getTemplate("twsm-outcome").firstElementChild;
		node.querySelector(".twsm-outcome__label").textContent = determination.label || determination.id;
		const label = node.querySelector("[data-field=\"label\"]");
		label.id = `twsm-outcome-${index}-label`;
		label.value = determination.label ?? "";
		node.querySelector("[data-field=\"label-for\"]").htmlFor = label.id;
		label.addEventListener("change", () => {
			update(index, (d) => {
				d.label = label.value.trim();
			});
		});
		const rollup = node.querySelector("[data-field=\"rollupPath\"]");
		rollup.id = `twsm-outcome-${index}-rollup`;
		rollup.value = determination.rollupPath ?? "";
		node.querySelector("[data-field=\"rollup-for\"]").htmlFor = rollup.id;
		rollup.addEventListener("change", () => {
			update(index, (d) => {
				d.rollupPath = rollup.value.trim();
			});
		});
		const kindFields = node.querySelector("[data-field=\"kind-fields\"]");
		const kind = node.querySelector("[data-field=\"kind\"]");
		kind.id = `twsm-outcome-${index}-kind`;
		node.querySelector("[data-field=\"kind-for\"]").htmlFor = kind.id;
		for (const name of OUTCOME_KINDS) {
			const option = document.createElement("option");
			option.value = name;
			option.textContent = KIND_LABELS.get(name) ?? name;
			kind.appendChild(option);
		}
		const isFunction = typeof determination.outcome === "function";
		kind.value = isFunction ? "value" : determination.outcome?.kind ?? "value";
		if (isFunction) kind.insertAdjacentElement("afterend", functionNote());
		kind.addEventListener("change", () => {
			update(index, (d) => {
				d.outcome = { kind: kind.value };
			});
		});
		renderKindFields(kindFields, determination, index);
		renderSections(node.querySelector("[data-field=\"sections\"]"), determination, index);
		node.querySelector("[data-action=\"add-section\"]").addEventListener("click", () => {
			update(index, (d) => {
				d.sections.push({
					heading: "Facts",
					facts: []
				});
			});
		});
		const up = node.querySelector("[data-action=\"move-up\"]");
		up.disabled = index === 0;
		up.addEventListener("click", () => move(index, -1));
		const down = node.querySelector("[data-action=\"move-down\"]");
		down.disabled = index === total - 1;
		down.addEventListener("click", () => move(index, 1));
		node.querySelector("[data-action=\"remove\"]").addEventListener("click", () => {
			const next = current();
			next.splice(index, 1);
			commit(next);
		});
		return node;
	}
	function functionNote() {
		const note = document.createElement("p");
		note.className = "twsm-note";
		note.textContent = "This outcome is spoken by host code, which cannot be edited here. Choosing a kind above replaces it.";
		return note;
	}
	function move(index, by) {
		const next = current();
		const to = index + by;
		if (to < 0 || to >= next.length) return;
		const [moved] = next.splice(index, 1);
		next.splice(to, 0, moved);
		commit(next);
	}
	function render() {
		const determinations = getConfig().determinations;
		renderPathOptions();
		list.replaceChildren();
		determinations.forEach((determination, index) => {
			list.appendChild(renderDetermination(determination, index, determinations.length));
		});
		empty.hidden = determinations.length > 0;
	}
	host.querySelector("[data-add=\"outcome\"]").addEventListener("click", () => {
		const next = current();
		next.push(blankDetermination(next.length));
		commit(next);
	});
	return { render };
}

//#endregion
//#region src/audit-panel/js/workspace-settings-modal.js
var TaxpertWorkspaceSettingsModal = class extends HTMLElement {
	constructor() {
		super();
		this._connected = false;
		this._rendered = false;
		this.ready = Promise.resolve();
		this._onNavTool = (event) => {
			if (event.detail?.id === "workspace-settings") this.open();
		};
		this._onConfigChange = () => {
			if (this._rendered) this._renderFromConfig();
		};
	}
	connectedCallback() {
		document.addEventListener("nav-tool-select", this._onNavTool);
		document.addEventListener(CONFIG_CHANGE_EVENT, this._onConfigChange);
		if (this._connected) return;
		this._connected = true;
		this.ready = loadModalTemplates("workspace-settings-modal.html", this).then(() => {
			if (this.isConnected && !this._rendered) this.render();
			if (this._openWhenReady) {
				this._openWhenReady = false;
				this.open();
			}
		});
	}
	disconnectedCallback() {
		document.removeEventListener("nav-tool-select", this._onNavTool);
		document.removeEventListener(CONFIG_CHANGE_EVENT, this._onConfigChange);
	}
	open() {
		if (!this._rendered) {
			this._openWhenReady = true;
			return;
		}
		this._syncCheckboxes();
		this._syncOverrideControls();
		this._collapseSections();
		openDialog(this._dialog);
	}
	/**
	* Every section shut, every time the modal opens.
	*
	* The markup ships them shut, but a <details> keeps whatever state it was left in, and this
	* element is built once and reopened. Without this the second open shows whichever sections the
	* last visit unfolded, so the modal has two shapes depending on history nobody can see.
	*/
	_collapseSections() {
		for (const section of this.querySelectorAll(".twsm-section, .twsm-outcome")) section.open = false;
	}
	close() {
		closeDialog(this._dialog);
	}
	render() {
		const { dialog, main } = buildModalShell(this, {
			id: "workspace-settings-modal",
			prefix: "twsm",
			heading: "Workspace settings"
		});
		main.appendChild(getTemplate("twsm-sections"));
		this._dialog = dialog;
		this._rendered = true;
		this.querySelector(".twsm-reset-all").addEventListener("click", () => {
			resetAllConfigOverrides();
			this._syncOverrideControls();
		});
		for (const button of this.querySelectorAll("[data-reset]")) button.addEventListener("click", () => resetConfigOverride(button.dataset.reset));
		this._outcomes = createOutcomesEditor(this);
		this._wireAdvanced();
		this._renderFromConfig();
	}
	_wireAdvanced() {
		this._endpoints = this.querySelector("[data-field=\"endpoints\"]");
		this._overridesJson = this.querySelector("[data-field=\"overrides\"]");
		this._importError = this.querySelector("[data-error=\"import\"]");
		this._endpoints.addEventListener("change", () => {
			if (!setConfigOverride("endpoints", parseSettings(this._endpoints.value)).ok) this._renderAdvanced();
		});
		this.querySelector("[data-action=\"import\"]").addEventListener("click", () => this._import());
		this.querySelector("[data-action=\"revert-import\"]").addEventListener("click", () => this._renderAdvanced());
	}
	_renderAdvanced() {
		this._endpoints.value = formatSettings(getConfig().endpoints);
		this._overridesJson.value = JSON.stringify(getConfigOverrides(), null, 2);
		this._showImportError(null);
	}
	_showImportError(message) {
		this._importError.hidden = !message;
		this._importError.textContent = message ?? "";
	}
	/**
	* Replace the whole override record with what was pasted.
	*
	* Two failure modes read differently to whoever typed them: JSON that will not parse, and JSON
	* that parses into a configuration the schema refuses. Both leave what is stored alone.
	*/
	_import() {
		let parsed;
		try {
			parsed = JSON.parse(this._overridesJson.value || "{}");
		} catch (error) {
			return this._showImportError(`That is not valid JSON — ${error.message}`);
		}
		const { ok, errors } = setConfigOverrides(parsed);
		if (!ok) return this._showImportError(errors.join("; "));
		this._showImportError(null);
	}
	_renderFromConfig() {
		this._renderApps();
		this._renderFlags();
		this._renderTools();
		this._outcomes?.render();
		this._renderAdvanced();
		this._syncOverrideControls();
	}
	_section(name) {
		return {
			options: this.querySelector(`[data-options="${name}"]`),
			empty: this.querySelector(`[data-empty="${name}"]`)
		};
	}
	/**
	* One row per application the host declared, with that application's modes under its name.
	*
	* The section removes itself when there is nothing to choose between, a single-application host
	* otherwise getting a radio group of one.
	*
	* Selecting does not perform the navigation. It announces it, cancelably, and navigates only if
	* nobody objected. Fact Explorer is the host that objects, swapping the graph on its canvas in
	* place. Every other host gets the plain link behaviour by doing nothing.
	*/
	_renderApps() {
		const apps = getConfig().apps;
		const section = this.querySelector("[data-section=\"apps\"]");
		const container = this.querySelector("[data-options=\"apps\"]");
		if (!section || !container) return;
		section.hidden = !hasAppChoice(apps);
		container.replaceChildren();
		if (section.hidden) return;
		for (const app of appItems(apps)) {
			const fragment = getTemplate("twsm-app");
			const input = fragment.querySelector("input");
			input.id = `twsm-app-${app.id}`;
			input.value = app.id;
			input.checked = app.id === apps.current;
			input.addEventListener("change", () => {
				if (input.checked) this._selectApp(apps, app.id);
			});
			const label = fragment.querySelector("label");
			label.htmlFor = input.id;
			fragment.querySelector(".twsm-app__name").textContent = app.label ?? app.id;
			const modes = destinationsOf(app).map((d) => d.label ?? d.id);
			fragment.querySelector(".twsm-app__modes").textContent = modes.length ? modes.join(" · ") : "No modes declared";
			container.appendChild(fragment);
		}
	}
	_selectApp(apps, id) {
		if (id === apps.current) return;
		const target = switchTarget(apps, id, activeDestination());
		if (!target) return;
		const event = new CustomEvent(APP_SELECT_EVENT, {
			bubbles: true,
			cancelable: true,
			detail: {
				id,
				app: target.app,
				destination: target.destination,
				href: target.destination.href
			}
		});
		if (!document.dispatchEvent(event)) return;
		this.close();
		globalThis.location?.assign?.(target.destination.href);
	}
	_renderOptions(name, entries, { idFor, labelFor, checkedFor, onToggle }) {
		const { options, empty } = this._section(name);
		options.replaceChildren();
		const rows = [];
		for (const entry of entries) {
			const fragment = getTemplate("twsm-option");
			const input = fragment.querySelector("input");
			input.id = idFor(entry);
			input.value = input.id;
			input.name = `workspace-settings-${name}[]`;
			input.checked = checkedFor(entry);
			input.addEventListener("change", () => onToggle(entry, input));
			const label = fragment.querySelector("label");
			label.htmlFor = input.id;
			label.textContent = labelFor(entry);
			options.appendChild(fragment);
			rows.push({
				entry,
				input
			});
		}
		if (empty) empty.hidden = entries.length > 0;
		return rows;
	}
	_renderFlags() {
		const rows = this._renderOptions("flags", flags(), {
			idFor: (flag) => `twsm-ff-${flag.kebab}`,
			labelFor: (flag) => flag.label ?? flag.name,
			checkedFor: (flag) => getFlag(flag.name),
			onToggle: (flag, input) => {
				setFlag(flag.name, input.checked);
				applyFlags();
			}
		});
		for (const { entry, input } of rows) input.dataset.flag = entry.name;
		this._checkboxes = rows.map(({ input }) => input);
	}
	/**
	* One row per tool *the build offers*, ticked when it is in the effective list.
	*
	* The rows come from getBuildConfig() rather than getConfig(). A tool switched off is absent
	* from the effective `config.tools`, so reading the effective list would take its own row away
	* with it, leaving no way to switch it back on.
	*/
	_renderTools() {
		const buildTools = getBuildConfig().tools ?? [];
		const enabled = new Set(getConfig().tools.map((tool) => tool.id));
		this._renderOptions("tools", buildTools, {
			idFor: (tool) => `twsm-tool-${tool.id}`,
			labelFor: (tool) => tool.label ?? tool.id,
			checkedFor: (tool) => enabled.has(tool.id),
			onToggle: (tool, input) => {
				const next = new Set(enabled);
				if (input.checked) next.add(tool.id);
				else next.delete(tool.id);
				const kept = buildTools.filter((candidate) => next.has(candidate.id));
				const result = setConfigOverride("tools", kept);
				if (!result.ok) {
					console.warn(`taxpert: could not save tools — ${result.errors.join("; ")}`);
					input.checked = !input.checked;
				}
			}
		});
	}
	_syncCheckboxes() {
		for (const checkbox of this._checkboxes ?? []) checkbox.checked = getFlag(checkbox.dataset.flag);
	}
	_syncOverrideControls() {
		let any = false;
		for (const marker of this.querySelectorAll("[data-override]")) {
			const overridden = isOverridden(marker.dataset.override);
			marker.hidden = !overridden;
			any ||= overridden;
		}
		this.querySelector(".twsm-footer").hidden = !any;
	}
};
customElements.define("taxpert-workspace-settings-modal", TaxpertWorkspaceSettingsModal);
/**
* Mount this dialog on demand for a host that has the gear but no audit panel.
*
* The gear lives in the nav's workspace row, which is on every page of every host; the element that
* answers it was only ever created by <taxpert-audit-panel>. Author Mode is the page where those
* two facts collide — form-builder's author-mode.html renders the nav alone, deliberately ("a
* chrome-free editing shell"), so the gear dispatched into a document with nothing listening and
* the click did nothing at all.
*
* At module scope rather than in the nav, which "owns no tool UI of its own" and should keep
* emitting nav-tool-select without knowing who answers. The panel still mounts this eagerly on
* connect, and its _mountModal() reuses whatever is already on the page, so on a host with a panel
* this listener finds the element and leaves it to its own handler.
*
* The instance created here misses the event that created it — its connectedCallback registers
* after this dispatch — so it is opened directly. open() before the templates land is expected and
* handled: it records the ask and honours it on render.
*/
document.addEventListener("nav-tool-select", (event) => {
	if (event.detail?.id !== "workspace-settings") return;
	if (document.querySelector("taxpert-workspace-settings-modal")) return;
	document.body.appendChild(document.createElement("taxpert-workspace-settings-modal")).open();
});
function formatSettings(object) {
	return Object.entries(object ?? {}).map(([key, value]) => `${key} = ${value}`).join("\n");
}
function parseSettings(text) {
	const parsed = {};
	for (const line of text.split("\n")) {
		const at = line.indexOf("=");
		if (at === -1) continue;
		const key = line.slice(0, at).trim();
		if (key) Object.defineProperty(parsed, key, {
			value: line.slice(at + 1).trim(),
			writable: true,
			enumerable: true,
			configurable: true
		});
	}
	return parsed;
}

//#endregion
//#region src/audit-panel/js/taxpert-audit-panel.js
const AUDIT_PANEL_DEFAULT_WIDTH = 38;
const AUDIT_PANEL_MIN_WIDTH = 320;
const AUDIT_PANEL_MAX_WIDTH_RATIO = .7;
const AUDIT_PANEL_KEYBOARD_STEP = 24;
const AUDIT_PANEL_WIDTH_PROPERTY = "--audit-panel-width";
var TaxpertAuditPanel = class extends HTMLElement {
	constructor() {
		super();
		this._sections = BUILT_IN_SECTIONS.map((s) => ({ ...s }));
		this._scenarioFilters = null;
		this._scenarioOptions = null;
		this._connected = false;
		this._rendered = false;
		this._syncWidth = () => {};
		/** Resolves once the panel's DOM has been cloned in. */
		this.ready = Promise.resolve();
	}
	connectedCallback() {
		if (this._connected) return;
		this._connected = true;
		this._scenarioOptions = this._readScenarioOptions();
		this.ready = this._connect();
	}
	_readScenarioOptions() {
		const tpl = this.querySelector("template");
		const options = (tpl ? tpl.content : this).querySelectorAll("option");
		if (!options.length) return null;
		const fragment = document.createDocumentFragment();
		for (const option of options) fragment.appendChild(option.cloneNode(true));
		return fragment;
	}
	async _connect() {
		await loadPanelTemplates(this);
		if (!this.isConnected) return;
		this.render();
		this._mountScenarioModal();
		this._mountDisplayModal();
		this._mountWorkspaceSettingsModal();
	}
	_mountModal(tagName) {
		let modal = document.querySelector(tagName);
		if (!modal) {
			modal = document.createElement(tagName);
			document.body.appendChild(modal);
		}
		return modal;
	}
	_mountScenarioModal() {
		const modal = this._mountModal("taxpert-scenario-modal");
		modal.scenarioOptions = this._scenarioOptions;
		if (this._scenarioFilters) modal.registerScenarioFilters(this._scenarioFilters.fields, this._scenarioFilters.parseFilename);
		this._scenarioModal = modal;
	}
	_mountDisplayModal() {
		this._displayModal = this._mountModal("taxpert-display-modal");
	}
	_mountWorkspaceSettingsModal() {
		this._workspaceSettingsModal = this._mountModal("taxpert-workspace-settings-modal");
	}
	get scenarioModal() {
		return this._scenarioModal ?? document.querySelector("taxpert-scenario-modal");
	}
	get displayModal() {
		return this._displayModal ?? document.querySelector("taxpert-display-modal");
	}
	get workspaceSettingsModal() {
		return this._workspaceSettingsModal ?? document.querySelector("taxpert-workspace-settings-modal");
	}
	openScenarioModal() {
		this.scenarioModal?.open();
	}
	openDisplayModal() {
		this.displayModal?.open();
	}
	openWorkspaceSettingsModal() {
		this.workspaceSettingsModal?.open();
	}
	get _sectionContext() {
		return {
			factGraph: () => window.factGraph,
			factDictionaryXml,
			trackFact: (path, collectionId, setFocus) => this.trackFact(path, collectionId, setFocus)
		};
	}
	/**
	* Register a host-owned section. Descriptor: { sectionId, dataTab, label, title, order,
	* wrapperClass?, ff?, eager?, render(container, ctx) | buildBody(container) }.
	*/
	registerSection(descriptor) {
		if (!descriptor || !descriptor.dataTab) return;
		const existingIdx = this._sections.findIndex((s) => s.dataTab === descriptor.dataTab);
		if (existingIdx !== -1) this._sections.splice(existingIdx, 1);
		this._sections.push(descriptor);
		this._sections.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
		if (this._rendered) this._renderSections();
	}
	/**
	* Inject host filter dropdowns into the Manage scenario modal's library section.
	* @param {Array<{id: string, groupId?: string, key: string, label: string, options: Array<{value: string, label: string}>, showFor?: {filter: string, values: string[]}}>} fields
	* @param {(filename: string) => Record<string, string>} parseFilename
	*/
	registerScenarioFilters(fields, parseFilename) {
		this._scenarioFilters = {
			fields: fields ?? [],
			parseFilename
		};
		this.scenarioModal?.registerScenarioFilters(this._scenarioFilters.fields, parseFilename);
	}
	render() {
		this.classList.add("audit-panel", "hidden");
		this.setAttribute("aria-label", "Audit Panel");
		this.replaceChildren(getTemplate("tap-shell"));
		this._content = this.querySelector(".audit-panel__content");
		this._rail = this.querySelector(".audit-panel__rail ul");
		this.querySelector("#audit-panel-resizer")?.setAttribute("aria-controls", this.id || "audit-panel");
		this._rendered = true;
		this._renderSections();
	}
	_renderSections() {
		this._content.replaceChildren();
		for (const li of this._rail.querySelectorAll("li:not(:first-child)")) li.remove();
		for (const section of this._sections) {
			this._content.appendChild(this._renderSectionBody(section));
			this._rail.appendChild(this._renderRailTab(section));
		}
		wireFactInspector(this._content);
		this._syncSectionVisibility();
	}
	_renderSectionBody(section) {
		const body = el("div", `audit-panel__section${section.wrapperClass ? " " + section.wrapperClass : ""}`);
		if (section.sectionId) body.id = section.sectionId;
		body.dataset.tab = section.dataTab;
		if (section.templateId) body.appendChild(getTemplate(section.templateId));
		else if (typeof section.render === "function") section.render(body, this._sectionContext);
		else if (typeof section.buildBody === "function") section.buildBody(body);
		return body;
	}
	_renderRailTab(section) {
		const fragment = getTemplate("tap-rail-tab");
		const li = fragment.querySelector("li");
		if (section.ff) li.dataset.ff = section.ff;
		const button = fragment.querySelector("button");
		button.dataset.tab = section.dataTab;
		button.setAttribute("aria-controls", section.sectionId || "");
		button.title = section.title || section.label;
		const [label, srLabel] = fragment.querySelectorAll("span");
		label.textContent = section.label;
		srLabel.textContent = section.title || section.label;
		return fragment;
	}
	_syncSectionVisibility() {
		const active = this.dataset.activeTab;
		for (const section of this._content?.children ?? []) section.hidden = section.dataset.tab !== active;
	}
	openTab(tabId) {
		this.dataset.activeTab = tabId;
		document.body.classList.add("audit-panel-open");
		this._tabButtons?.forEach((btn) => {
			btn.setAttribute("aria-selected", String(btn.dataset.tab === tabId));
		});
		this.querySelector("#toggle-audit-panel")?.setAttribute("aria-expanded", "true");
		setAuditPanelStorage("isOpen", true);
		setAuditPanelStorage("activeTab", tabId);
		this._syncSectionVisibility();
		this._syncWidth();
	}
	closePanel() {
		document.body.classList.remove("audit-panel-open");
		delete this.dataset.activeTab;
		this._tabButtons?.forEach((btn) => btn.setAttribute("aria-selected", "false"));
		this.querySelector("#toggle-audit-panel")?.setAttribute("aria-expanded", "false");
		setAuditPanelStorage("isOpen", false);
		setAuditPanelStorage("activeTab", null);
		this._syncSectionVisibility();
		(getLastActiveTabButton() ?? this._tabButtons?.[0])?.focus();
	}
	trackFact(path, collectionId, setFocus = true) {
		trackFact(path, collectionId, setFocus);
	}
	/**
	* Enable audit mode: reveal the panel, restore persisted state, fetch the fact dictionary, and
	* wire the controls.
	*
	* The document keydown, window resize and fg-load listeners added here are NOT removed by
	* disable(); the data-*Initialized flags keep re-enabling idempotent instead.
	*/
	async enable() {
		await this.ready;
		document.documentElement.tabIndex = -1;
		document.documentElement.focus();
		document.documentElement.addEventListener("focusout", () => document.documentElement.removeAttribute("tabindex"), { once: true });
		const styles = document.querySelector("#audit-panel-styles");
		if (styles) styles.disabled = false;
		this.classList.remove("hidden");
		await loadFactDictionaryXml(this.getAttribute("fact-dictionary-url"));
		const resizer = this.querySelector("#audit-panel-resizer");
		this._tabButtons = this.querySelectorAll(".audit-panel__tab[role=\"tab\"]");
		this._syncWidth = this._setupWidthControls(resizer);
		this._syncWidth();
		if (this.dataset.visibilityControlsInitialized !== "true") {
			this.querySelector("#toggle-audit-panel")?.addEventListener("click", () => {
				if (document.body.classList.contains("audit-panel-open")) this.closePanel();
				else {
					const tabId = getLastActiveTabButton()?.dataset.tab ?? this._tabButtons[0]?.dataset.tab;
					if (tabId) this.openTab(tabId);
				}
			});
			this._tabButtons.forEach((btn) => {
				btn.addEventListener("click", () => {
					const tabId = btn.dataset.tab;
					setLastActiveTabButton(btn);
					if (this.dataset.activeTab === tabId && document.body.classList.contains("audit-panel-open")) this.closePanel();
					else this.openTab(tabId);
				});
			});
			document.addEventListener("keydown", (event) => this._handleKeydown(event));
			this.dataset.visibilityControlsInitialized = "true";
		}
		applyFlags();
		initChat();
		const savedStorage = getAuditPanelStorage();
		if (savedStorage.isOpen) {
			const savedTab = savedStorage.activeTab;
			if (savedTab) this.openTab(savedTab);
			else {
				document.body.classList.add("audit-panel-open");
				this.querySelector("#toggle-audit-panel")?.setAttribute("aria-expanded", "true");
			}
		}
		const storage = getAuditPanelStorage();
		if (storage.trackedFacts) for (const fact of storage.trackedFacts) this.trackFact(fact.path, fact.collectionId, false);
		const fgShows = document.querySelectorAll("fg-show");
		for (const fgShow of fgShows) {
			const factLink = document.createElement("fact-link");
			factLink.setAttribute("path", fgShow.path);
			factLink.append(fgShow.cloneNode());
			fgShow.parentElement.replaceChild(factLink, fgShow);
		}
		if (!window.factGraph) document.addEventListener("fg-load", setFactOptions);
		else setFactOptions();
		applyDisplayOptions();
		renderGeneratedScenarioResult();
	}
	/**
	* Disable audit mode: hide the panel, clear its session storage, close the dialogs, and unwrap
	* the <fact-link>s added in enable().
	*/
	disable() {
		this.scenarioModal?.close();
		this.displayModal?.close();
		this.workspaceSettingsModal?.close();
		const styles = document.querySelector("#audit-panel-styles");
		if (styles) styles.disabled = true;
		this.classList.add("hidden");
		document.body.classList.remove("audit-panel-open");
		document.documentElement.style.removeProperty(AUDIT_PANEL_WIDTH_PROPERTY);
		delete this.dataset.activeTab;
		this.querySelectorAll(".audit-panel__tab[role=\"tab\"]").forEach((btn) => btn.setAttribute("aria-selected", "false"));
		this.querySelector("#toggle-audit-panel")?.setAttribute("aria-expanded", "false");
		this._syncSectionVisibility();
		sessionStorage.removeItem(auditPanelStorageKey());
		const fgShows = document.querySelectorAll("fg-show");
		for (const fgShow of fgShows) {
			const link = fgShow.parentElement;
			link.parentElement.replaceChild(fgShow, link);
		}
	}
	_handleKeydown(event) {
		if (event.key === "Escape" && document.body.classList.contains("audit-panel-open")) {
			event.preventDefault();
			this.closePanel();
			return;
		}
		if (!event.target.matches?.(".audit-panel__tab")) return;
		const tabs = Array.from(this._tabButtons);
		const idx = tabs.indexOf(event.target);
		if (idx === -1) return;
		if (event.key === "ArrowDown" || event.key === "ArrowRight") {
			event.preventDefault();
			tabs[(idx + 1) % tabs.length].focus();
		} else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
			event.preventDefault();
			tabs[(idx - 1 + tabs.length) % tabs.length].focus();
		} else if (event.key === "Home") {
			event.preventDefault();
			tabs[0].focus();
		} else if (event.key === "End") {
			event.preventDefault();
			tabs[tabs.length - 1].focus();
		}
	}
	_setupWidthControls(resizer) {
		if (this.dataset.widthControlsInitialized === "true" && typeof this._syncWidthFn === "function") return this._syncWidthFn;
		const panel = this;
		const getMax = () => Math.max(AUDIT_PANEL_MIN_WIDTH, Math.floor(window.innerWidth * AUDIT_PANEL_MAX_WIDTH_RATIO));
		const clamp = (width) => Math.min(Math.max(width, AUDIT_PANEL_MIN_WIDTH), getMax());
		const updateResizerA11y = (width) => {
			if (!resizer) return;
			resizer.setAttribute("aria-valuemin", String(AUDIT_PANEL_MIN_WIDTH));
			resizer.setAttribute("aria-valuemax", String(getMax()));
			resizer.setAttribute("aria-valuenow", String(width));
			resizer.setAttribute("aria-valuetext", `${width}px wide`);
		};
		const applyWidth = (width, persist = true) => {
			const next = clamp(width);
			document.documentElement.style.setProperty(AUDIT_PANEL_WIDTH_PROPERTY, `${next}px`);
			updateResizerA11y(next);
			if (persist) setAuditPanelStorage("width", next);
			return next;
		};
		const applyDefaultWidth = () => {
			document.documentElement.style.setProperty(AUDIT_PANEL_WIDTH_PROPERTY, `${AUDIT_PANEL_DEFAULT_WIDTH}vw`);
			const fallbackWidth = Math.round(window.innerWidth * AUDIT_PANEL_DEFAULT_WIDTH / 100);
			const renderedWidth = document.body.classList.contains("audit-panel-open") ? Math.round(panel.getBoundingClientRect().width) || fallbackWidth : fallbackWidth;
			updateResizerA11y(clamp(renderedWidth));
		};
		const resizeBy = (delta) => {
			const current = Math.round(panel.getBoundingClientRect().width);
			return applyWidth(current + delta);
		};
		const onResizeKeydown = (event) => {
			if (event.key === "ArrowRight") {
				event.preventDefault();
				resizeBy(-24);
			} else if (event.key === "ArrowLeft") {
				event.preventDefault();
				resizeBy(AUDIT_PANEL_KEYBOARD_STEP);
			}
		};
		const onPointerDown = (event) => {
			if (event.button !== 0 || !resizer) return;
			event.preventDefault();
			resizer.setPointerCapture(event.pointerId);
			document.body.classList.add("audit-panel-resizing");
			const onMove = (moveEvent) => applyWidth(window.innerWidth - moveEvent.clientX);
			const onUp = () => {
				resizer.releasePointerCapture(event.pointerId);
				document.body.classList.remove("audit-panel-resizing");
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
			};
			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
		};
		const syncWidth = () => {
			const storage = getAuditPanelStorage();
			if (typeof storage.width === "number") applyWidth(storage.width);
			else applyDefaultWidth();
		};
		resizer?.addEventListener("pointerdown", onPointerDown);
		resizer?.addEventListener("keydown", onResizeKeydown);
		window.addEventListener("resize", syncWidth);
		this.dataset.widthControlsInitialized = "true";
		this._syncWidthFn = syncWidth;
		return syncWidth;
	}
};
customElements.define("taxpert-audit-panel", TaxpertAuditPanel);
function enable(panelEl) {
	return (panelEl || document.querySelector("taxpert-audit-panel"))?.enable();
}
function disable(panelEl) {
	return (panelEl || document.querySelector("taxpert-audit-panel"))?.disable();
}
window.enableAuditMode = enable;
window.disableAuditMode = disable;

//#endregion
//#region src/audit-panel/js/path-cursor.js
const OFF_PATH_CLASS = "off-path";
function tagNames(flowDom) {
	return {
		QUESTION: flowDom.questionTag.toUpperCase(),
		ALERT: flowDom.alertTag.toUpperCase(),
		MODAL: flowDom.modalTag.toUpperCase()
	};
}
function clearPathCursor(root = document) {
	root.querySelectorAll(`.${OFF_PATH_CLASS}`).forEach((el) => el.classList.remove(OFF_PATH_CLASS));
}
function markAfter(node, stopAt, MODAL) {
	let current = node;
	while (current && current !== stopAt) {
		let sibling = current.nextElementSibling;
		while (sibling) {
			if (sibling.tagName !== MODAL) sibling.classList.add(OFF_PATH_CLASS);
			sibling = sibling.nextElementSibling;
		}
		current = current.parentElement;
	}
}
function applyPathCursor(root = document, { checkCondition, isAnswered } = {}) {
	clearPathCursor(root);
	const flowDom = getConfig().flowDom;
	const { QUESTION, ALERT, MODAL } = tagNames(flowDom);
	const evaluate = typeof checkCondition === "function" ? checkCondition : flowDom.checkCondition;
	const answered = typeof isAnswered === "function" ? isAnswered : flowDom.isAnswered;
	const onPath = (el) => {
		const condition = el.getAttribute(flowDom.conditionAttr);
		const operator = el.getAttribute(flowDom.operatorAttr);
		if (!condition || !operator) return true;
		return evaluate(condition, operator);
	};
	let cursor = null;
	let terminal = "end";
	const walk = (parent) => {
		for (const el of parent.children) {
			if (el.tagName === MODAL) continue;
			if (!onPath(el)) continue;
			if (el.tagName === QUESTION) {
				if (el.getAttribute(flowDom.optionalAttr) === "true" || answered(el)) continue;
				cursor = el;
				terminal = "question";
				return true;
			}
			if (el.tagName === ALERT && el.getAttribute(flowDom.knockoutAttr) === "true") {
				cursor = el;
				terminal = "knockout";
				return true;
			}
			if (el.children.length > 0 && walk(el)) return true;
		}
		return false;
	};
	const screens = Array.from(root.querySelectorAll(flowDom.screenSelector));
	for (const [index, screen] of screens.entries()) {
		const gate = screen.dataset.gateCondition;
		const gateOperator = screen.dataset.gateOperator;
		if (gate && gateOperator && !evaluate(gate, gateOperator)) continue;
		if (!walk(screen)) continue;
		markAfter(cursor, screen, MODAL);
		for (const later of screens.slice(index + 1)) later.classList.add(OFF_PATH_CLASS);
		return {
			cursor,
			terminal
		};
	}
	return {
		cursor,
		terminal
	};
}

//#endregion
//#region src/audit-panel/js/all-screens-toolbar.js
const DEFAULTS = {
	section: "",
	scenarioFilename: ""
};
const MODES = /* @__PURE__ */ new Map([
	["product", {
		navId: "product-experience",
		listing: false
	}],
	["path", {
		navId: "path-mode",
		listing: true
	}],
	["browse", {
		navId: "browse-all",
		listing: true
	}]
]);
const defaultIsAnswered = (el) => {
	try {
		if (typeof el?.isComplete === "function") return el.isComplete() === true;
	} catch (e) {
		return true;
	}
	return getConfig().flowDom.isAnswered(el);
};
/** The destination the current URL asks for. Exported so hosts can align other chrome with it. */
function currentMode(search = globalThis.location?.search ?? "") {
	return new URLSearchParams(search).get("mode") === "path" ? "path" : "browse";
}
function readStorage() {
	try {
		const raw = sessionStorage.getItem(storageKey("allScreens"));
		return raw ? {
			...DEFAULTS,
			...JSON.parse(raw)
		} : { ...DEFAULTS };
	} catch (e) {
		return { ...DEFAULTS };
	}
}
function writeStorage(patch) {
	sessionStorage.setItem(storageKey("allScreens"), JSON.stringify({
		...readStorage(),
		...patch
	}));
}
var TaxpertScreensToolbar = class extends HTMLElement {
	constructor() {
		super();
		this._sections = [];
		this._mode = null;
		this._checkConditionFn = null;
		this._isAnsweredFn = defaultIsAnswered;
		this._warnedNoCheckCondition = false;
		this._connected = false;
		this._rendered = false;
		/** Resolves once the toolbar's DOM has been cloned in. */
		this.ready = Promise.resolve();
		this._fgUpdateHandler = null;
	}
	connectedCallback() {
		if (this._connected) return;
		this._connected = true;
		this.ready = loadToolbarTemplates(this).then(() => {
			if (this.isConnected) this.render();
		});
	}
	get sections() {
		return this._sections;
	}
	set sections(value) {
		this._sections = Array.isArray(value) ? value : [];
		if (this._rendered) this.render();
	}
	get mode() {
		const attr = this.getAttribute("mode");
		return this._mode ?? (MODES.has(attr) ? attr : currentMode());
	}
	set mode(value) {
		this._mode = MODES.has(value) ? value : null;
		if (this._mode) this.setAttribute("mode", this._mode);
		if (this._rendered) this.render();
	}
	get checkConditionFn() {
		return this._checkConditionFn ?? getConfig().flowDom.checkCondition;
	}
	set checkConditionFn(fn) {
		this._checkConditionFn = typeof fn === "function" ? fn : null;
	}
	get isAnsweredFn() {
		return this._isAnsweredFn;
	}
	set isAnsweredFn(fn) {
		this._isAnsweredFn = typeof fn === "function" ? fn : defaultIsAnswered;
	}
	_emit(name, detail) {
		this.dispatchEvent(new CustomEvent(name, {
			bubbles: true,
			composed: true,
			detail
		}));
	}
	_showSection(slug) {
		document.querySelectorAll("main .all-screens__section").forEach((section) => {
			section.hidden = !!slug && section.dataset.section !== slug;
		});
	}
	_selectSection(slug, { scroll = false, persist = false, emit = false } = {}) {
		for (const tab of this.querySelectorAll(".all-screens__section-tab")) tab.setAttribute("aria-selected", String(tab.dataset.section === slug));
		this._showSection(slug);
		if (persist) writeStorage({ section: slug });
		if (scroll && slug) document.getElementById(slug)?.scrollIntoView({
			behavior: "smooth",
			block: "start"
		});
		if (emit) this._emit("section-select", { slug });
	}
	_applyMode(mode) {
		const enabled = mode === "path";
		document.body.classList.toggle("path-mode", enabled);
		if (!enabled) clearPathCursor(document);
		if (enabled && !this._checkConditionFn && !this._warnedNoCheckCondition) {
			console.warn("taxpert-screens-toolbar: no checkConditionFn set — Path Mode is evaluating gates with getConfig().flowDom.checkCondition.");
			this._warnedNoCheckCondition = true;
		}
		const checkCondition = this.checkConditionFn;
		const screenSelector = getConfig().flowDom.screenSelector;
		document.querySelectorAll(`${screenSelector}[data-gate-condition]`).forEach((screen) => {
			const condition = screen.dataset.gateCondition;
			const operator = screen.dataset.gateOperator;
			screen.hidden = enabled && !checkCondition(condition, operator);
		});
		if (enabled) applyPathCursor(document, {
			checkCondition,
			isAnswered: this._isAnsweredFn
		});
	}
	render() {
		this.replaceChildren(getTemplate("tst-toolbar"));
		const mode = this.mode;
		for (const block of this.querySelectorAll(".all-screens__mode")) block.hidden = block.dataset.mode !== mode;
		this.setAttribute("mode", mode);
		this._syncNavActive(mode);
		this._syncLanguageLinks(mode);
		if (MODES.get(mode)?.listing) this._syncDocumentTitle(mode);
		const nav = this.querySelector(".all-screens__section-tabs");
		for (const section of this._sections) {
			const tab = getTemplate("tst-section-tab").querySelector("button");
			tab.dataset.section = section.slug;
			tab.textContent = section.title;
			nav.appendChild(tab);
		}
		this._rendered = true;
		this._init();
	}
	_syncNavActive(mode) {
		const navId = MODES.get(mode)?.navId;
		if (!navId) return;
		const bar = document.querySelector("taxpert-global-nav");
		if (bar) bar.active = navId;
	}
	_syncLanguageLinks(mode) {
		if (mode !== "path") return;
		for (const option of document.querySelectorAll(`${HOST_LANGUAGE_SELECT} option`)) if (option.value && !option.value.includes("?")) option.value = `${option.value}?mode=path`;
	}
	_syncDocumentTitle(mode) {
		const text = this.querySelector(`.all-screens__mode[data-mode="${mode}"] .all-screens__mode-title`)?.textContent?.trim();
		if (text) document.title = text;
	}
	_init() {
		if (this._fgUpdateHandler) {
			document.removeEventListener("fg-update", this._fgUpdateHandler);
			this._fgUpdateHandler = null;
		}
		const mode = this.mode;
		if (!MODES.get(mode)?.listing) return;
		setTimeout(() => {
			applyDisplayOptions();
			this._applyMode(mode);
		}, 100);
		const questionTag = getConfig().flowDom.questionTag;
		if (questionTag.includes("-")) globalThis.customElements?.whenDefined(questionTag).then(() => {
			if (this.isConnected) this._applyMode(this.mode);
		});
		this._selectSection(mode === "path" ? "" : readStorage().section);
		this._fgUpdateHandler = () => this._applyMode(mode);
		document.addEventListener("fg-update", this._fgUpdateHandler);
		for (const tab of this.querySelectorAll(".all-screens__section-tab")) tab.addEventListener("click", () => this._selectSection(tab.dataset.section, {
			scroll: true,
			persist: true,
			emit: true
		}));
	}
};
customElements.define("taxpert-screens-toolbar", TaxpertScreensToolbar);

//#endregion
//#region src/tool-panels/js/tool-registry.js
/** Every tool, in canonical order. */
function tools() {
	return getConfig().tools;
}
/** Every tool id, in canonical order. */
function toolIds() {
	return tools().map((tool) => tool.id);
}
/** The descriptor for `id`, or undefined. */
function getTool(id) {
	return tools().find((tool) => tool.id === id);
}
/** A tool's position in the canonical order; -1 for an unknown id. */
function canonicalIndex(id) {
	return toolIds().indexOf(id);
}
/** `ids` sorted back into canonical order, unknown ids dropped. */
function inCanonicalOrder(ids) {
	return toolIds().filter((id) => ids.includes(id));
}

//#endregion
//#region src/tool-panels/js/tool-layout.js
const TOOL_LAYOUT_CHANGE_EVENT = "taxpert:tool-layout-changed";
/** Panel and column minimum, in px. Mirrors --ttp-min-width in tool-panel.css. */
const PANEL_MIN_WIDTH = 300;
/** The host content area never narrows past this, the USWDS tablet breakpoint. */
const HOST_MIN_WIDTH = 640;
/** Floating panels only. Mirrors --ttp-min-height in tool-panel.css. */
const PANEL_MIN_HEIGHT = 300;
const DEFAULT_DOCK_WIDTH = 480;
let state = null;
let revivedUnder = null;
function emptyState() {
	return {
		on: /* @__PURE__ */ new Set(),
		columns: [],
		floating: /* @__PURE__ */ new Map(),
		width: null,
		heights: /* @__PURE__ */ new Map()
	};
}
function reviveState(raw) {
	const next = emptyState();
	if (!raw || typeof raw !== "object") return next;
	for (const id of Array.isArray(raw.on) ? raw.on : []) if (toolIds().includes(id)) next.on.add(id);
	const placed = /* @__PURE__ */ new Set();
	for (const column of Array.isArray(raw.columns) ? raw.columns : []) {
		const ids = (Array.isArray(column?.ids) ? column.ids : []).filter((id) => next.on.has(id) && !placed.has(id));
		for (const id of ids) placed.add(id);
		if (ids.length) next.columns.push({
			flex: numberOr(column?.flex, 1),
			ids
		});
	}
	for (const [id, rect] of Object.entries(raw.floating ?? {})) {
		if (!next.on.has(id) || placed.has(id) || !rect) continue;
		placed.add(id);
		next.floating.set(id, {
			x: numberOr(rect.x, 0),
			y: numberOr(rect.y, 0),
			w: Math.max(numberOr(rect.w, 300), 300),
			h: Math.max(numberOr(rect.h, 300), 300)
		});
	}
	for (const [id, flex] of Object.entries(raw.heights ?? {})) if (placed.has(id)) next.heights.set(id, numberOr(flex, 1));
	next.width = raw.width === null || raw.width === void 0 ? null : numberOr(raw.width, null);
	for (const id of toolIds()) if (next.on.has(id) && !placed.has(id)) insertDocked(next, id);
	return next;
}
function numberOr(value, fallback) {
	return Number.isFinite(value) ? value : fallback;
}
function serialize(value) {
	return {
		on: [...value.on],
		columns: value.columns,
		floating: Object.fromEntries(value.floating),
		width: value.width,
		heights: Object.fromEntries(value.heights)
	};
}
function load$1() {
	const signature = toolIds().join(" ");
	if (state && revivedUnder === signature) return state;
	revivedUnder = signature;
	try {
		state = reviveState(JSON.parse(localStorage.getItem(storageKey("toolLayout")) ?? "null"));
	} catch {
		state = emptyState();
	}
	return state;
}
function commit$1() {
	try {
		localStorage.setItem(storageKey("toolLayout"), JSON.stringify(serialize(state)));
	} catch {}
	document.dispatchEvent(new CustomEvent(TOOL_LAYOUT_CHANGE_EVENT, { detail: getLayout() }));
}
/** Put `id` in the last docked column at its canonical position among the panels already there. */
function insertDocked(value, id) {
	const column = value.columns.at(-1);
	if (!column) {
		value.columns.push({
			flex: 1,
			ids: [id]
		});
		return;
	}
	const index = canonicalIndex(id);
	const at = column.ids.filter((other) => canonicalIndex(other) < index).length;
	column.ids.splice(at, 0, id);
}
/** Take `id` out of wherever it is, pruning a column left empty. */
function detach(value, id) {
	value.floating.delete(id);
	for (const [index, column] of value.columns.entries()) {
		const at = column.ids.indexOf(id);
		if (at === -1) continue;
		column.ids.splice(at, 1);
		if (!column.ids.length) value.columns.splice(index, 1);
		return;
	}
}
/**
* A structural snapshot for the dock to render from. Sizes are flex ratios with 1 as the default.
* @returns {{ columns: {flex:number, ids:string[], panels:{id:string,flex:number}[]}[],
*             floating: {id:string, x:number, y:number, w:number, h:number}[],
*             width: number|null, on: string[] }}
*/
function getLayout() {
	const value = load$1();
	return {
		on: inCanonicalOrder([...value.on]),
		width: value.width,
		columns: value.columns.map((column) => ({
			flex: column.flex,
			ids: [...column.ids],
			panels: column.ids.map((id) => ({
				id,
				flex: value.heights.get(id) ?? 1
			}))
		})),
		floating: [...value.floating].map(([id, rect]) => ({
			id,
			...rect
		}))
	};
}
function isToolOn(id) {
	return load$1().on.has(id);
}
function dockWidth() {
	return load$1().width ?? DEFAULT_DOCK_WIDTH;
}
/**
* The widest the dock may get: whatever is left after the host content area keeps HOST_MIN_WIDTH,
* but never less than one panel's minimum.
*/
function maxDockWidth(viewport = window.innerWidth) {
	return Math.max(300, viewport - 640);
}
/** Whether the dock can hold `count` side-by-side columns at the current viewport. */
function fitsColumns(count, viewport = window.innerWidth) {
	return maxDockWidth(viewport) >= count * 300;
}
function setToolOn(id, on) {
	const value = load$1();
	if (!toolIds().includes(id) || value.on.has(id) === Boolean(on)) return;
	if (on) {
		value.on.add(id);
		insertDocked(value, id);
	} else {
		value.on.delete(id);
		detach(value, id);
		value.heights.delete(id);
	}
	commit$1();
}
/**
* Dock `id` into column `columnIndex` at stack position `index`. A columnIndex one past the end, or
* `newColumn`, opens a fresh column.
*/
function dockTool(id, { columnIndex, index = 0, newColumn = false } = {}) {
	const value = load$1();
	if (!value.on.has(id)) return;
	detach(value, id);
	if (newColumn || columnIndex === void 0 || columnIndex >= value.columns.length) {
		const at = Math.min(Math.max(columnIndex ?? value.columns.length, 0), value.columns.length);
		value.columns.splice(at, 0, {
			flex: 1,
			ids: [id]
		});
	} else {
		const column = value.columns.at(Math.max(columnIndex, 0));
		column.ids.splice(Math.min(Math.max(index, 0), column.ids.length), 0, id);
	}
	commit$1();
}
/** Undock `id` to a free-floating box at viewport coordinates. */
function floatTool(id, { x, y, w, h }) {
	const value = load$1();
	if (!value.on.has(id)) return;
	detach(value, id);
	value.heights.delete(id);
	value.floating.set(id, {
		x: Math.max(Math.round(x), 0),
		y: Math.max(Math.round(y), 0),
		w: Math.max(Math.round(w), 300),
		h: Math.max(Math.round(h), 300)
	});
	commit$1();
}
function setDockWidth(px) {
	const value = load$1();
	value.width = Math.min(Math.max(Math.round(px), 300), maxDockWidth());
	commit$1();
}
function setColumnFlexPair(columnIndex, before, after) {
	const value = load$1();
	const first = value.columns.at(columnIndex - 1);
	const second = value.columns.at(columnIndex);
	if (!first || !second) return;
	first.flex = Math.max(before, .05);
	second.flex = Math.max(after, .05);
	commit$1();
}
function setPanelFlexPair(firstId, secondId, before, after) {
	const value = load$1();
	value.heights.set(firstId, Math.max(before, .05));
	value.heights.set(secondId, Math.max(after, .05));
	commit$1();
}
/**
* Send every open panel back to the default arrangement: one column, canonical order, nothing
* floating, no stored sizes. Which tools are on is left alone.
*/
function resetToolLayout() {
	const value = load$1();
	value.columns = [];
	value.floating.clear();
	value.heights.clear();
	value.width = null;
	for (const id of inCanonicalOrder([...value.on])) insertDocked(value, id);
	commit$1();
}

//#endregion
//#region src/tool-panels/js/inspect-selection.js
const INSPECT_SELECT_EVENT = "taxpert:inspect-select";
/**
* A rendered unit: one <fg-set> or <fg-show> and the objects behind it. Every field but `title` is
* nullable: a question with no gate has no `flow`, and copy with no <span condition> has no `text`.
* @typedef {{
*   title: string,
*   fact: {path: string} | null,
*   flow: {path: string, operator: string} | null,
*   text: {path: string, operator: string} | null,
* }} RenderedUnit
*/
let selection = null;
/** The selected unit, or null. @returns {RenderedUnit | null} */
function getInspectSelection() {
	return selection;
}
/**
* Point Inspect at a rendered unit and open the tool.
* @param {RenderedUnit | null} unit
*/
function selectRenderedUnit(unit) {
	selection = unit ?? null;
	setToolOn("inspect", true);
	document.dispatchEvent(new CustomEvent(INSPECT_SELECT_EVENT, { detail: selection }));
}

//#endregion
//#region src/tool-panels/js/watchlist-store.js
const WATCHLIST_CHANGE_EVENT = "taxpert:watchlist-changed";
let entries = null;
/** The identity of an entry, and the key rows are reconciled by. */
function watchKey(path, collectionId) {
	return `${path}#${collectionId ?? ""}`;
}
/** The concrete fact-graph path an entry points at. */
function watchPath(entry) {
	return entry.collectionId ? makeCollectionIdPath(entry.path, entry.collectionId) : entry.path;
}
function revive(raw) {
	if (!Array.isArray(raw)) return [];
	const seen = /* @__PURE__ */ new Set();
	const revived = [];
	for (const item of raw) {
		if (!item || typeof item.path !== "string" || !item.path) continue;
		const collectionId = typeof item.collectionId === "string" ? item.collectionId : "";
		const key = watchKey(item.path, collectionId);
		if (seen.has(key)) continue;
		seen.add(key);
		revived.push({
			path: item.path,
			collectionId
		});
	}
	return revived;
}
function load() {
	if (entries) return entries;
	try {
		entries = revive(JSON.parse(sessionStorage.getItem(storageKey("watchlist")) ?? "null"));
	} catch {
		entries = [];
	}
	return entries;
}
function commit() {
	try {
		sessionStorage.setItem(storageKey("watchlist"), JSON.stringify(entries));
	} catch {}
	document.dispatchEvent(new CustomEvent(WATCHLIST_CHANGE_EVENT, { detail: getWatchlist() }));
}
/** Every pinned fact, oldest first. A copy: callers can't mutate the stored list through it. */
function getWatchlist() {
	return load().map((entry) => ({ ...entry }));
}
function isWatched(path, collectionId = "") {
	const key = watchKey(path, collectionId);
	return load().some((entry) => watchKey(entry.path, entry.collectionId) === key);
}
/**
* Pin a fact. Returns false if it was already pinned, which tells the caller to point at
* the existing row rather than report an addition.
* @param {string} path abstract fact path, `*` wildcard and all
* @param {string} [collectionId] collection item id resolving that wildcard, '' for a plain fact
* @returns {boolean} whether it was added
*/
function addToWatchlist(path, collectionId = "") {
	if (!path || isWatched(path, collectionId)) return false;
	load().push({
		path,
		collectionId
	});
	commit();
	return true;
}
function removeFromWatchlist(path, collectionId = "") {
	const key = watchKey(path, collectionId);
	const value = load();
	const at = value.findIndex((entry) => watchKey(entry.path, entry.collectionId) === key);
	if (at === -1) return false;
	value.splice(at, 1);
	commit();
	return true;
}

//#endregion
//#region src/tool-panels/js/fact-values.js
/** The document events that mean "a fact may have changed". Read late, from the host's adapter. */
function factChangeEvents() {
	return getConfig().graph.changeEvents;
}
/**
* Subscribe `handler` to those events on `document`, and answer the unsubscribe. The event list is
* read once and closed over, so a configure() in between cannot strand the listeners.
*/
function onFactChange(handler) {
	const types = factChangeEvents();
	for (const type of types) document.addEventListener(type, handler);
	return () => {
		for (const type of types) document.removeEventListener(type, handler);
	};
}
/** The host's fact-graph port. Read through a function so it is never captured at import time. */
function graphPort() {
	return getConfig().graph;
}
/** Every abstract fact path the dictionary knows, sorted. Empty until the graph loads. */
function factPaths() {
	return safely(() => graphPort().paths()) ?? [];
}
/**
* Every collection item id currently in the graph, sorted and deduped. The graph exposes ids one
* collection at a time, so the roots are recovered from the dictionary's own wildcard paths:
* `/household/*\/firstName` names the root `/household`.
*/
function collectionIds() {
	const graph = graphPort();
	const roots = /* @__PURE__ */ new Set();
	for (const path of factPaths()) {
		const at = path.indexOf("/*");
		if (at > 0) roots.add(path.slice(0, at));
	}
	const ids = /* @__PURE__ */ new Set();
	for (const root of roots) for (const id of safely(() => graph.getCollectionIds(root)) ?? []) ids.add(id);
	return [...ids].sort();
}
/**
* A fact's current state, in the shape a tool row renders from.
*
* `status` is one of 'complete', 'false' (settled and negative, which the designs draw apart from
* missing), 'incomplete' or 'unknown'. `raw` is the graph's own undecorated value, or null.
* `value` is the reading-copy form (Yes/No, $500) and `literal` the fact graph's own
* (true/false, 500.00), which is what Inspect prints.
*
* @param {{path: string, collectionId: string}} entry
* @returns {{path: string, collectionId: string, concretePath: string, status: string,
*            value: string, literal: string, raw: *, typeLabel: string}}
*/
function readFact(entry) {
	const concretePath = watchPath(entry);
	const base = {
		...entry,
		concretePath,
		status: "unknown",
		value: "Unavailable",
		literal: "Unavailable",
		raw: null,
		typeLabel: ""
	};
	const graph = graphPort();
	const definition = safely(() => graph.getDefinition(entry.path));
	const typeLabel = humanizeType(definition?.typeNode);
	const fact = safely(() => graph.get(concretePath));
	if (!fact) return {
		...base,
		typeLabel
	};
	if (!fact.complete) return {
		...base,
		typeLabel,
		status: "incomplete",
		value: "Incomplete",
		literal: "Incomplete"
	};
	const raw = fact.hasValue ? safely(() => fact.get) : null;
	return {
		...base,
		typeLabel,
		raw: raw ?? null,
		status: raw === false ? "false" : "complete",
		value: formatValue(raw, definition?.typeNode),
		literal: formatLiteral(raw)
	};
}
function safely(read) {
	try {
		return read();
	} catch {
		return;
	}
}
/**
* A fact value in reading copy: booleans as Yes/No, dollars with their sign and without the trailing
* cents the fact graph always carries ("500.00" becomes "$500"). Anything else uses its toString.
*/
function formatValue(raw, typeNode) {
	if (raw === null || raw === void 0) return "—";
	if (typeof raw === "boolean") return raw ? "Yes" : "No";
	const text = safely(() => String(raw)) ?? "—";
	if (typeNode?.startsWith("Dollar")) {
		const negative = text.startsWith("-");
		const digits = (negative ? text.slice(1) : text).replace(/\.00$/, "");
		return `${negative ? "-" : ""}$${digits}`;
	}
	return text;
}
/**
* A fact value exactly as the fact graph holds it: a boolean is true/false, a dollar keeps its cents,
* an enum is its own option string. The undecorated counterpart to formatValue.
*/
function formatLiteral(raw) {
	if (raw === null || raw === void 0) return "—";
	if (typeof raw === "boolean") return String(raw);
	return safely(() => String(raw)) ?? "—";
}
/** Cut `text` to `limit` characters, ending in an ellipsis. */
function truncate(text, limit = 40) {
	const value = String(text ?? "");
	return value.length > limit ? `${value.slice(0, limit - 1).trimEnd()}…` : value;
}
const TYPE_ALIASES = /* @__PURE__ */ new Map([["Int", "Integer"]]);
/** 'DollarNode' → 'Dollar'. The dictionary's node names are the only type the graph exposes. */
function humanizeType(typeNode) {
	if (!typeNode) return "";
	const name = typeNode.replace(/Node$/, "");
	return TYPE_ALIASES.get(name) ?? name;
}

//#endregion
//#region src/tool-panels/js/fact-definitions.js
/** '/familyAndHousehold/#abc/firstName' → '/familyAndHousehold/*\/firstName'. */
function abstractPathOf(path) {
	return String(path ?? "").replace(/#[^/]+/g, "*");
}
/** The collection item id a concrete path carries, or '' for a plain fact. */
function collectionIdOf(path) {
	const found = /#([^/]+)/.exec(String(path ?? ""));
	return found ? found[1] : "";
}
/** The <Fact> element for an abstract path, or null, including before the dictionary lands. */
function getFactDefinition(abstractPath) {
	if (!factDictionaryXml || !abstractPath) return null;
	return factDictionaryXml.querySelector(`Fact[path="${abstractPath}"]`);
}
/**
* How the dictionary produces the fact: 'Writable' (a person answers it), 'Derived' (computed from
* other facts), 'Constant', or '' when unknown. The "Fact type:" line under Advanced.
*/
function factTypeLabel(definition) {
	if (!definition) return "";
	for (const kind of [
		"Writable",
		"Derived",
		"Constant"
	]) if (definition.querySelector(`:scope > ${kind}`)) return kind;
	return "";
}
/** The fact's <Description>, which is what the Purpose section shows. '' when it has none. */
function factPurpose(definition) {
	return definition?.querySelector(":scope > Description")?.textContent?.trim() ?? "";
}
/**
* A fact's human name: its <Name> when the dictionary gives one, otherwise its last path segment
* un-camel-cased. The same fallback condition-detail.js uses, so the two surfaces agree.
*/
function factLabel(abstractPath) {
	const name = getFactDefinition(abstractPath)?.querySelector(":scope > Name")?.textContent?.trim();
	if (name) return name;
	const segment = String(abstractPath ?? "").split("/").filter(Boolean).pop() ?? abstractPath;
	return String(segment).replace(/([A-Z])/g, " $1").toLowerCase().trim();
}
/**
* Resolve a <Dependency path> written relative to its own collection ('../foo') against the fact it
* appears in. Absolute paths come back untouched.
*/
function resolveDependencyPath(rawPath, abstractPath) {
	if (!rawPath?.startsWith("..")) return rawPath ?? "";
	return rawPath.replace("..", String(abstractPath ?? "").replace(/\*\/.*/, "*"));
}
/**
* Every fact the definition depends on, as abstract paths in document order and deduped. The
* collection id that resolves a wildcard travels alongside these, and is not spliced in here.
* @returns {string[]}
*/
function dependenciesOf(abstractPath) {
	const definition = getFactDefinition(abstractPath);
	if (!definition) return [];
	const seen = /* @__PURE__ */ new Set();
	for (const node of definition.querySelectorAll("Dependency")) {
		const resolved = resolveDependencyPath(node.getAttribute("path"), abstractPath);
		if (resolved) seen.add(resolved);
	}
	return [...seen];
}
const CONNECTIVE = /* @__PURE__ */ new Map([
	["All", "all of the following are true"],
	["Any", "any of the following are true"],
	["", "the following is true"]
]);
const SUBJECT = /* @__PURE__ */ new Map([["flow", "This question"], ["text", "This text"]]);
const DEPENDS_ON = /* @__PURE__ */ new Map([["flow", "This flow condition depends on:"], ["text", "This text conditional depends on:"]]);
/** The wording introducing the Dependencies table for a condition of this kind. */
function dependsOnLead(kind) {
	return DEPENDS_ON.get(kind) ?? "This condition depends on:";
}
/**
* A flow or text condition, said in plain language. The lead names what the condition gates and
* under what circumstance; the clauses unfold the fact's <Derived> tree one bullet at a time. A
* condition on a <Writable> fact has no tree, so it gets a lead and no clauses.
*
* @param {{path: string, operator: string, kind: string}} condition as read off the flow element
* @returns {{lead: string, clauses: {text: string, strong: boolean}[][]}}
*/
function describeCondition({ path, operator, kind }) {
	const abstractPath = abstractPathOf(path);
	const subject = SUBJECT.get(kind) ?? "This item";
	const label = factLabel(abstractPath);
	const { connective, clauses } = unfold(getFactDefinition(abstractPath)?.querySelector(":scope > Derived"), abstractPath);
	if (operator === "isFalse") {
		const lead = `${subject} is shown when ${label} is not true.`;
		if (!clauses.length) return {
			lead,
			clauses
		};
		return {
			lead: `${lead} That fact is true when ${CONNECTIVE.get(connective)}:`,
			clauses
		};
	}
	if (!clauses.length) return {
		lead: `${subject} is shown when ${label} is true.`,
		clauses
	};
	return {
		lead: `${subject} is shown when ${CONNECTIVE.get(connective)}:`,
		clauses
	};
}
/**
* Flatten a <Derived> tree one level: an All/Any becomes its connective plus a clause per child,
* anything else becomes a single clause. Deliberately shallow.
*/
function unfold(derived, abstractPath) {
	const root = derived?.firstElementChild;
	if (!root) return {
		connective: "",
		clauses: []
	};
	if (root.tagName === "All" || root.tagName === "Any") return {
		connective: root.tagName,
		clauses: [...root.children].map((child) => clauseFor(child, abstractPath))
	};
	return {
		connective: "",
		clauses: [clauseFor(root, abstractPath)]
	};
}
/** One bullet, as the parts that make it: plain text, and the words set in bold. */
function clauseFor(node, abstractPath) {
	if (!node) return [{
		text: "an unnamed condition",
		strong: false
	}];
	switch (node.tagName) {
		case "Dependency": return [...named(node, abstractPath), {
			text: " is true",
			strong: false
		}];
		case "IsComplete": return [...named(node.firstElementChild, abstractPath), {
			text: " has been determined",
			strong: false
		}];
		case "Not": {
			const child = node.firstElementChild;
			if (child?.tagName === "Dependency") return [
				...named(child, abstractPath),
				{
					text: " is ",
					strong: false
				},
				{
					text: "not",
					strong: true
				},
				{
					text: " true",
					strong: false
				}
			];
			if (child?.tagName === "IsComplete") return [
				...named(child.firstElementChild, abstractPath),
				{
					text: " has ",
					strong: false
				},
				{
					text: "not",
					strong: true
				},
				{
					text: " been determined",
					strong: false
				}
			];
			return [{
				text: "the opposite of ",
				strong: false
			}, ...clauseFor(child, abstractPath)];
		}
		case "True": return [{
			text: "always true",
			strong: false
		}];
		default: return [{
			text: `a ${node.tagName} expression — see the XML below`,
			strong: false
		}];
	}
}
/** The clause's opening: the depended-on fact's human name. */
function named(node, abstractPath) {
	const resolved = resolveDependencyPath(node?.getAttribute?.("path"), abstractPath);
	if (!resolved) return [{
		text: "an unnamed fact",
		strong: false
	}];
	return [{
		text: factLabel(resolved),
		strong: false
	}];
}
/**
* The fact's dictionary XML with every resolvable <Dependency> annotated with its current value.
* Returned as plain text, so <taxpert-inspect> can write it into a <pre> with textContent and there
* is no way for a dictionary <Description> to become HTML.
*/
function factXml(abstractPath, collectionId = "") {
	const definition = getFactDefinition(abstractPath);
	if (!definition) return factDictionaryXml ? "(fact not found in the dictionary)" : "(the fact dictionary has not loaded yet)";
	let xml = serializeXml(definition).split("\n").map((line, index) => index === 0 ? line : line.replace(/^ {4}/, "")).join("\n");
	const graph = graphPort();
	for (const node of definition.querySelectorAll("Dependency")) {
		const rawPath = node.getAttribute("path");
		if (!rawPath) continue;
		const resolved = resolveDependencyPath(rawPath, abstractPath);
		const concrete = collectionId ? resolved.replace("*", `#${collectionId}`) : resolved;
		if (concrete.includes("*")) continue;
		const annotation = annotate(graph, concrete);
		if (!annotation) continue;
		xml = xml.replace(`path="${rawPath}"`, `path="${rawPath}"${annotation}`);
	}
	return xml;
}
function annotate(graph, concretePath) {
	const fact = graph.get(concretePath);
	if (!fact) return "";
	try {
		if (!fact.hasValue) return " ⮕ (no value)";
		return ` ⮕ ${formatLiteral(fact.get)} (${fact.complete ? "complete" : "incomplete"})`;
	} catch {
		return "";
	}
}

//#endregion
//#region src/shared/js/flow-dom.js
/** True when `el` is a unit whose display fact is not worth a cue. */
function isUncued(flowDom, el) {
	if (!el) return false;
	if (el.tagName?.toLowerCase() !== flowDom.displayTag) return false;
	return flowDom.uncuedPaths.includes(el.getAttribute(flowDom.pathAttr));
}

//#endregion
//#region src/tool-panels/js/inspect-cues.js
/**
* Marks a unit currently on offer to inspect: what the hover treatment hangs off, what the click
* listener looks for, and what hideInspectCues() cleans up. Background and outline only, per
* constraint 1 above.
*/
const UNIT_ATTR = "data-inspect-unit";
/** Marks the one unit Inspect is currently pointed at, so it can keep the heavier selected outline. */
const SELECTED_ATTR = "data-inspect-selected";
let wanted = false;
let selectedUnit = null;
/**
* Turn the highlight on: adds the body class, marks every unit the host is showing, and keeps that
* in step with the flow. Idempotent.
*/
function showInspectCues() {
	wanted = true;
	document.body.classList.add("inspect-rendered-units");
	syncCues();
	watchHost();
	listen();
}
/** Reverse showInspectCues(): drops the body class, the listeners and every mark left on the host. */
function hideInspectCues() {
	wanted = false;
	unwatchHost();
	unlisten();
	document.body.classList.remove("inspect-rendered-units");
	for (const unit of document.querySelectorAll(`[${UNIT_ATTR}]`)) unit.removeAttribute(UNIT_ATTR);
	clearSelectedUnit();
}
/**
* Bring the marks in line with what the page is rendering right now: one on every visible unit, none
* on a unit the flow has hidden or removed. Idempotent, so it serves both as the first pass and as
* the observer's callback.
*/
function syncCues() {
	const flowDom = getConfig().flowDom;
	for (const unit of document.querySelectorAll(`[${UNIT_ATTR}]`)) {
		if (unit.matches(flowDom.unitSelector) && shouldCue(unit, flowDom)) continue;
		unit.removeAttribute(UNIT_ATTR);
		if (unit === selectedUnit) clearSelectedUnit();
	}
	for (const unit of document.querySelectorAll(flowDom.unitSelector)) {
		if (!shouldCue(unit, flowDom)) continue;
		unit.setAttribute(UNIT_ATTR, "");
	}
}
/**
* Whether this unit should offer itself for inspection: worth it at all, and currently on screen.
*
* "Worth it" is flowDom.uncuedPaths, applied by isUncued(). Some facts are constants a host splices
* into copy all over the flow, so highlighting every occurrence would litter the page with boxes
* that all lead to the same unconditional fact. It applies to display units only. A question
* writing one of those paths is still worth inspecting.
*/
function shouldCue(unit, flowDom) {
	return !isUncued(flowDom, unit) && isRendered(unit);
}
/**
* Whether the host is actually showing this unit. A question whose condition is false stays in the
* document and is hidden, so "in the DOM" is not "on the page", and marking one arms a click target
* over nothing.
*
* This asks the host's cascade a question, so nothing the option puts on the page may take part in
* answering it. That is the reason for constraint 1: a mark that set `display` would report every
* unit it had ever marked as still on screen.
*
* Read through the document's own view rather than the ambient `window`, these elements belonging
* to the page the marks are drawn on rather than necessarily the global one.
*/
function isRendered(unit) {
	if (!unit.isConnected) return false;
	if (typeof unit.checkVisibility === "function") return unit.checkVisibility();
	const view = document.defaultView;
	if (!view) return true;
	for (let node = unit; node; node = node.parentElement) {
		if (node.hidden) return false;
		if (view.getComputedStyle(node).display === "none") return false;
	}
	return true;
}
let listening = false;
function listen() {
	if (listening) return;
	listening = true;
	document.addEventListener("click", onClick);
	document.addEventListener(INSPECT_SELECT_EVENT, onSelectionChange);
	document.addEventListener(TOOL_LAYOUT_CHANGE_EVENT, onLayoutChange);
}
function unlisten() {
	if (!listening) return;
	listening = false;
	document.removeEventListener("click", onClick);
	document.removeEventListener(INSPECT_SELECT_EVENT, onSelectionChange);
	document.removeEventListener(TOOL_LAYOUT_CHANGE_EVENT, onLayoutChange);
}
/**
* A click anywhere inside a marked unit selects it. Delegated, so a unit the flow reveals later is
* live the moment it is marked; `closest()` from the target picks the innermost unit, which is what
* an <fg-show> inside an <fg-set> needs.
*
* Nothing is prevented or stopped: the click is also the taxpayer choosing a radio, opening the
* question's help accordion, or following a link, and inspection must not take that away.
*/
function onClick(event) {
	if (!wanted) return;
	const unit = event.target?.closest?.(`[${UNIT_ATTR}]`);
	if (!unit) return;
	markSelectedUnit(unit);
	selectRenderedUnit(describeRenderedUnit(unit));
}
/**
* The panel can be emptied without a click, through clearInspectSelection() or a host selecting
* from its own UI, so the mark follows the selection rather than only the pointer.
*/
function onSelectionChange(event) {
	if (!event.detail) clearSelectedUnit();
}
/** Closing the Inspect tool takes the selected outline with it: it points at a panel that is gone. */
function onLayoutChange() {
	if (!getLayout().on.includes("inspect")) clearSelectedUnit();
}
function markSelectedUnit(unit) {
	if (selectedUnit === unit) return;
	selectedUnit?.removeAttribute(SELECTED_ATTR);
	selectedUnit = unit;
	unit.setAttribute(SELECTED_ATTR, "");
}
function clearSelectedUnit() {
	selectedUnit?.removeAttribute(SELECTED_ATTR);
	selectedUnit = null;
}
let observer = null;
function watchHost() {
	const view = document.defaultView;
	if (observer || !view?.MutationObserver) return;
	observer = new view.MutationObserver(() => {
		observer.disconnect();
		try {
			syncCues();
		} finally {
			observeHost();
		}
	});
	observeHost();
}
function observeHost() {
	observer?.observe(document.body, {
		subtree: true,
		childList: true,
		attributes: true,
		attributeFilter: [
			"class",
			"hidden",
			"style",
			"open"
		]
	});
}
function unwatchHost() {
	observer?.disconnect();
	observer = null;
}
/**
* Read the objects behind one rendered unit off its markup.
*
* The three come from three different places: the fact is the element's own path attribute, the flow
* condition is its condition/operator pair, and a text condition is a <span> carrying that same pair
* inside its copy, which is exactly what the designs' three accordion rows are. Which attributes
* those are is flowDom's to say.
*
* @param {Element} element a question or display unit, per flowDom.unitSelector
* @returns {import('./inspect-selection.js').RenderedUnit}
*/
function describeRenderedUnit(element) {
	const flowDom = getConfig().flowDom;
	const path = element.getAttribute(flowDom.pathAttr) ?? "";
	const condition = element.getAttribute(flowDom.conditionAttr);
	const operator = element.getAttribute(flowDom.operatorAttr);
	const text = element.querySelector(`span[${flowDom.conditionAttr}][${flowDom.operatorAttr}]`);
	return {
		title: unitTitle(element, path, flowDom),
		fact: path ? { path } : null,
		flow: condition && operator ? {
			path: condition,
			operator
		} : null,
		text: text ? {
			path: text.getAttribute(flowDom.conditionAttr),
			operator: text.getAttribute(flowDom.operatorAttr)
		} : null
	};
}
/**
* The unit's title: the question exactly as the page renders it, so it carries whatever display-unit
* substitutions the copy contains, which is why this is read from the DOM rather than composed from
* the dictionary. Where that copy lives, and what counts as chrome rather than content, are
* flowDom.titleSelector and flowDom.notTitleSelector. A display unit has no question of its own, so
* it falls back to the fact's name.
*/
function unitTitle(element, path, flowDom) {
	const question = element.querySelector(flowDom.titleSelector);
	if (question) {
		const copy = question.cloneNode(true);
		for (const chrome of copy.querySelectorAll(flowDom.notTitleSelector)) chrome.remove();
		const text = copy.textContent.replace(/\s+/g, " ").trim();
		if (text) return text;
	}
	if (path) return factLabel(abstractPathOf(path));
	return element.tagName.toLowerCase();
}

//#endregion
//#region src/tool-panels/js/templates.js
const DEFAULT_URLS = new Map([
	"tools-modal.html",
	"tool-panel.html",
	"tool-dock.html",
	"watchlist.html",
	"outcome-tracker.html",
	"inspect.html",
	"overrides.html"
].map((file) => [file, new URL(`../templates/${file}`, import.meta.url)]));
/**
* Fetch (once) one of the bundle's template files, honouring a `templates-base` override on
* `element`.
* @param {string} file basename from FILES
* @param {Element} [element] the custom element asking, if it may carry templates-base
*/
function loadBundleTemplates(file, element) {
	const fallback = DEFAULT_URLS.get(file);
	if (!fallback) return Promise.reject(/* @__PURE__ */ new Error(`taxpert: unknown template file ${file}`));
	return loadTemplates(templateUrl(element, fallback, file));
}
/** The Tools modal's own markup plus the shared <dialog> shell it clones. */
const loadToolsModalTemplates = (element) => Promise.all([loadBundleTemplates("tools-modal.html", element), loadModalShell()]);
/** The panel chrome and the three stub tool bodies. */
const loadToolPanelTemplates = (element) => loadBundleTemplates("tool-panel.html", element);
/** The dock, its columns, splitters and drop indicator, plus the panel markup it fills them with. */
const loadToolDockTemplates = (element) => Promise.all([loadBundleTemplates("tool-dock.html", element), loadToolPanelTemplates(element)]);
/** The Inspect body: its empty state, accordion rows and the two detail shapes. */
const loadInspectTemplates = (element) => loadBundleTemplates("inspect.html", element);
/** The Outcome tracker body: its determination accordions, section headings and fact rows. */
const loadOutcomeTrackerTemplates = (element) => loadBundleTemplates("outcome-tracker.html", element);
/** The Watchlist body, its rows, and the combo box its Add fact dialog is built from. */
const loadWatchlistTemplates = (element) => loadBundleTemplates("watchlist.html", element);
/** The Add fact dialog: the Watchlist's own markup plus the shared <dialog> shell. */
const loadAddFactModalTemplates = (element) => Promise.all([loadWatchlistTemplates(element), loadModalShell()]);
/** The Overrides tool's body: its rows, its empty state, and the hint above them. */
const loadOverridesTemplates = (element) => loadBundleTemplates("overrides.html", element);

//#endregion
//#region src/tool-panels/js/taxpert-inspect.js
const ROW_KINDS = /* @__PURE__ */ new Map([
	["fact", {
		label: "Fact",
		icon: "#ttp-icon-info"
	}],
	["flow", {
		label: "Conditional flow",
		icon: "#ttp-icon-flow"
	}],
	["text", {
		label: "Conditional text",
		icon: "#ttp-icon-text"
	}]
]);
var TaxpertInspect = class extends HTMLElement {
	constructor() {
		super();
		this._connected = false;
		this._rendered = false;
		this._refreshers = [];
		this.ready = new Promise((resolve, reject) => {
			this._bodyReady = resolve;
			this._bodyFailed = reject;
		});
		this._onSelect = () => this._show(getInspectSelection());
		this._onFactChange = () => this._refresh();
	}
	connectedCallback() {
		document.addEventListener(INSPECT_SELECT_EVENT, this._onSelect);
		this._offFactChange = onFactChange(this._onFactChange);
		showInspectCues();
		if (this._connected) return;
		this._connected = true;
		loadInspectTemplates(this).then(() => {
			if (this.isConnected && !this._rendered) this.render();
			this._bodyReady();
		}, this._bodyFailed);
	}
	disconnectedCallback() {
		document.removeEventListener(INSPECT_SELECT_EVENT, this._onSelect);
		this._offFactChange?.();
		hideInspectCues();
	}
	render() {
		this.replaceChildren(getTemplate("ttp-inspect"));
		this._empty = this.querySelector("[data-region=\"empty\"]");
		this._selectedRegion = this.querySelector("[data-region=\"selected\"]");
		this._list = this.querySelector(".ttp-inspect__rows");
		this._rendered = true;
		this._show(getInspectSelection());
	}
	/** Swap between the empty state and one unit's rows. @param {object|null} unit */
	_show(unit) {
		if (!this._rendered) return;
		this._empty.hidden = !!unit;
		this._selectedRegion.hidden = !unit;
		this._list.replaceChildren();
		this._refreshers = [];
		if (!unit) return;
		this.querySelector("[data-field=\"title\"]").textContent = unit.title;
		if (unit.fact) this._list.appendChild(this._buildFactRow(unit.fact));
		if (unit.flow) this._list.appendChild(this._buildConditionRow(unit.flow, "flow"));
		if (unit.text) this._list.appendChild(this._buildConditionRow(unit.text, "text"));
		this._refresh();
	}
	/** The row chrome every kind shares: icon, label, path, and an empty detail to fill. */
	_buildRow(kind, path) {
		const { label, icon } = ROW_KINDS.get(kind);
		const row = getTemplate("ttp-inspect-row").firstElementChild;
		row.dataset.kind = kind;
		row.querySelector(".ttp-row__icon use").setAttribute("href", icon);
		row.querySelector("[data-field=\"label\"]").textContent = label;
		row.querySelector("[data-field=\"path\"]").textContent = path;
		return row;
	}
	_buildFactRow({ path }) {
		const row = this._buildRow("fact", path);
		const detail = row.querySelector("[data-region=\"detail\"]");
		detail.appendChild(getTemplate("ttp-inspect-fact-detail"));
		const abstractPath = abstractPathOf(path);
		const collectionId = collectionIdOf(path);
		const definition = getFactDefinition(abstractPath);
		const purpose = factPurpose(definition);
		detail.querySelector("[data-region=\"purpose\"]").hidden = !purpose;
		detail.querySelector("[data-field=\"purpose\"]").textContent = purpose;
		this._mountAdvanced(detail, {
			abstractPath,
			collectionId,
			typeLabel: factTypeLabel(definition)
		});
		const value = detail.querySelector("[data-field=\"value\"]");
		const type = detail.querySelector("[data-field=\"type\"]");
		this._refreshers.push(() => {
			const state = readFact({
				path: abstractPath,
				collectionId
			});
			value.textContent = truncate(state.literal);
			value.title = state.literal;
			type.textContent = state.typeLabel || "Unknown";
		});
		return row;
	}
	_buildConditionRow(condition, kind) {
		const row = this._buildRow(kind, condition.path);
		const detail = row.querySelector("[data-region=\"detail\"]");
		detail.appendChild(getTemplate("ttp-inspect-condition-detail"));
		const abstractPath = abstractPathOf(condition.path);
		const collectionId = collectionIdOf(condition.path);
		const { lead, clauses } = describeCondition({
			...condition,
			kind
		});
		detail.querySelector("[data-field=\"lead\"]").textContent = lead;
		const clauseList = detail.querySelector("[data-region=\"clauses\"]");
		clauseList.hidden = !clauses.length;
		for (const parts of clauses) clauseList.appendChild(buildClause(parts));
		const dependencies = dependenciesOf(abstractPath);
		detail.querySelector("[data-region=\"dependencies\"]").hidden = !dependencies.length;
		detail.querySelector("[data-field=\"depends\"]").textContent = dependsOnLead(kind);
		const rows = detail.querySelector("[data-region=\"dep-rows\"]");
		const values = [];
		for (const dependencyPath of dependencies) {
			const dependencyRow = getTemplate("ttp-inspect-dep").firstElementChild;
			dependencyRow.querySelector("[data-field=\"path\"]").textContent = dependencyPath;
			values.push({
				cell: dependencyRow.querySelector("[data-field=\"value\"]"),
				entry: {
					path: dependencyPath,
					collectionId
				}
			});
			rows.appendChild(dependencyRow);
		}
		this._mountAdvanced(detail, {
			abstractPath,
			collectionId
		});
		this._refreshers.push(() => {
			for (const { cell, entry } of values) cell.textContent = readFact(entry).literal;
		});
		return row;
	}
	/** The shared Advanced disclosure, and the refresher that keeps its annotated XML current. */
	_mountAdvanced(detail, { abstractPath, collectionId, typeLabel }) {
		const advanced = getTemplate("ttp-inspect-advanced").firstElementChild;
		const typeRow = advanced.querySelector("[data-region=\"fact-type\"]");
		typeRow.hidden = !typeLabel;
		advanced.querySelector("[data-field=\"fact-type\"]").textContent = typeLabel ?? "";
		const xml = advanced.querySelector("[data-field=\"xml\"]");
		this._refreshers.push(() => {
			xml.textContent = factXml(abstractPath, collectionId);
		});
		detail.querySelector("[data-mount=\"advanced\"]").appendChild(advanced);
	}
	_refresh() {
		for (const refresher of this._refreshers) refresher();
	}
};
/** One plain-language bullet, built as text and <strong> nodes rather than a markup string. */
function buildClause(parts) {
	const clause = getTemplate("ttp-inspect-clause").firstElementChild;
	for (const part of parts) {
		const node = getTemplate(part.strong ? "ttp-inspect-clause-strong" : "ttp-inspect-clause-text").firstElementChild;
		node.textContent = part.text;
		clause.appendChild(node);
	}
	return clause;
}
customElements.define("taxpert-inspect", TaxpertInspect);

//#endregion
//#region src/tool-panels/js/taxpert-outcome-tracker.js
const FACT_STATE = /* @__PURE__ */ new Map([
	["complete", {
		icon: "#ttp-icon-check_circle_outline",
		label: "True"
	}],
	["false", {
		icon: "#ttp-icon-error_circle_outline",
		label: "False"
	}],
	["incomplete", {
		icon: "#ttp-icon-pending",
		label: "Incomplete"
	}],
	["unknown", {
		icon: "#ttp-icon-pending",
		label: "Unavailable"
	}]
]);
/** A fact still waiting on an answer, which is what the summary counts with no outcome to show. */
const isUnanswered = (state) => state.status !== "complete" && state.status !== "false";
var TaxpertOutcomeTracker = class extends HTMLElement {
	constructor() {
		super();
		this._connected = false;
		this._rendered = false;
		this._rows = [];
		this.ready = new Promise((resolve, reject) => {
			this._bodyReady = resolve;
			this._bodyFailed = reject;
		});
		this._onFactChange = () => this._refresh();
		this._onConfigChange = () => {
			if (this._rendered) this.render();
		};
	}
	connectedCallback() {
		this._offFactChange = onFactChange(this._onFactChange);
		document.addEventListener(CONFIG_CHANGE_EVENT, this._onConfigChange);
		if (this._connected) return;
		this._connected = true;
		loadOutcomeTrackerTemplates(this).then(() => {
			if (this.isConnected && !this._rendered) this.render();
			this._bodyReady();
		}, this._bodyFailed);
	}
	disconnectedCallback() {
		this._offFactChange?.();
		document.removeEventListener(CONFIG_CHANGE_EVENT, this._onConfigChange);
	}
	render() {
		const determinations = getConfig().determinations;
		this._rows = [];
		this._rendered = true;
		if (!determinations.length) {
			this.replaceChildren(getTemplate("ttp-outcome-empty"));
			return;
		}
		this.replaceChildren(getTemplate("ttp-outcome"));
		const list = this.querySelector(".ttp-outcome__list");
		for (const determination of determinations) {
			const built = this._buildRow(determination);
			this._rows.push(built);
			list.appendChild(built.row);
		}
		this._refresh();
	}
	_buildRow(determination) {
		const row = getTemplate("ttp-outcome-row").firstElementChild;
		row.dataset.determination = determination.id;
		row.querySelector("[data-field=\"label\"]").textContent = determination.label;
		const detail = row.querySelector(".ttp-outcome__detail");
		const facts = [];
		for (const section of determination.sections) {
			const element = getTemplate("ttp-outcome-section").firstElementChild;
			element.querySelector("[data-field=\"heading\"]").textContent = section.heading;
			element.querySelector("[data-field=\"count\"]").textContent = `(${section.facts.length})`;
			const factList = element.querySelector(".ttp-outcome__facts");
			for (const path of section.facts) {
				const factRow = getTemplate("ttp-outcome-fact").firstElementChild;
				factRow.querySelector("[data-field=\"path\"]").textContent = path;
				factList.appendChild(factRow);
				facts.push({
					path,
					element: factRow
				});
			}
			detail.appendChild(element);
		}
		return {
			determination,
			row,
			facts,
			outcome: resolveOutcome(determination.outcome)
		};
	}
	_refresh() {
		if (!this._rendered) return;
		for (const entry of this._rows) this._refreshRow(entry);
	}
	_refreshRow({ determination, row, facts, outcome }) {
		const states = /* @__PURE__ */ new Map();
		for (const { path, element } of facts) {
			const state = readFact({
				path,
				collectionId: ""
			});
			states.set(path, state);
			this._refreshFact(element, state);
		}
		const rollup = states.get(determination.rollupPath) ?? readFact({
			path: determination.rollupPath,
			collectionId: ""
		});
		const settled = !isUnanswered(rollup);
		row.dataset.status = settled ? "settled" : "pending";
		row.querySelector(".ttp-outcome__status use").setAttribute("href", settled ? "#ttp-icon-check_circle" : "#ttp-icon-pending");
		const value = settled ? outcome?.(rollup.raw, rollup.value) ?? rollup.value : unansweredLabel([...states.values()].filter(isUnanswered).length);
		row.querySelector("[data-field=\"value\"]").textContent = value;
		row.querySelector("[data-field=\"status-label\"]").textContent = settled ? "Status: Complete." : "Status: Incomplete.";
	}
	_refreshFact(element, state) {
		const display = FACT_STATE.get(state.status) ?? FACT_STATE.get("unknown");
		const isBoolean = state.raw === true || state.raw === false;
		const label = display.label === "True" && !isBoolean ? state.value : display.label;
		element.dataset.status = state.status;
		element.querySelector("[data-field=\"value\"]").textContent = label;
		const icon = element.querySelector(".ttp-outcome__fact-icon");
		icon.toggleAttribute("hidden", !display.icon);
		if (display.icon) icon.querySelector("use").setAttribute("href", display.icon);
	}
};
/** "2 unanswered facts", and "1 unanswered fact", because the panel is read rather than scanned. */
function unansweredLabel(count) {
	return `${count} unanswered fact${count === 1 ? "" : "s"}`;
}
customElements.define("taxpert-outcome-tracker", TaxpertOutcomeTracker);

//#endregion
//#region src/tool-panels/js/combo-box.js
let sequence = 0;
/**
* Build a combo box.
* @param {object} options
* @param {string} options.id base id for the input (its list gets `<id>--list`)
* @param {string} [options.placeholder] replaces the template's "- Select -"
* @param {(value: string) => void} [options.onChange] called when the committed value changes
* @returns {{ element: HTMLElement, input: HTMLInputElement, setOptions: Function, value: string,
*             label: string, clear: Function, focus: Function, destroy: Function }}
*/
function createComboBox({ id, placeholder, onChange } = {}) {
	const element = getTemplate("ttp-combo").firstElementChild;
	const input = element.querySelector(".ttp-combo__input");
	const list = element.querySelector(".ttp-combo__list");
	const toggle = element.querySelector(".ttp-combo__toggle");
	const status = element.querySelector(".ttp-combo__status");
	const inputId = id || `ttp-combo-${++sequence}`;
	input.id = inputId;
	list.id = `${inputId}--list`;
	input.setAttribute("aria-controls", list.id);
	if (placeholder) input.placeholder = placeholder;
	/** @type {{value: string, label: string}[]} */
	let options = [];
	/** @type {{value: string, label: string} | null} */
	let selected = null;
	let active = -1;
	const matches = (query) => {
		const needle = query.trim().toLowerCase();
		if (!needle) return options;
		return options.filter((option) => option.label.toLowerCase().includes(needle));
	};
	function renderList(visible) {
		list.replaceChildren();
		for (const [index, option] of visible.entries()) {
			const item = getTemplate("ttp-combo-option").firstElementChild;
			item.id = `${list.id}-option-${index}`;
			item.dataset.value = option.value;
			item.textContent = option.label;
			list.appendChild(item);
		}
		status.textContent = visible.length ? `${visible.length} result${visible.length === 1 ? "" : "s"} available.` : "No results found.";
	}
	function open(query = input.value) {
		const visible = matches(query);
		renderList(visible);
		list.hidden = false;
		input.setAttribute("aria-expanded", "true");
		const at = selected ? visible.findIndex((option) => option.value === selected.value) : -1;
		setActive(at === -1 ? visible.length ? 0 : -1 : at);
	}
	function close() {
		list.hidden = true;
		input.setAttribute("aria-expanded", "false");
		input.removeAttribute("aria-activedescendant");
		active = -1;
	}
	const isOpen = () => !list.hidden;
	function setActive(index) {
		const items = [...list.children];
		active = index;
		for (const [at, item] of items.entries()) item.setAttribute("aria-selected", String(at === index));
		const current = items.at(index);
		if (index >= 0 && current) {
			input.setAttribute("aria-activedescendant", current.id);
			current.scrollIntoView?.({ block: "nearest" });
		} else input.removeAttribute("aria-activedescendant");
	}
	function move(step) {
		const count = list.children.length;
		if (!count) return;
		if (!isOpen()) return open();
		setActive((active + step + count) % count);
	}
	function commit(option) {
		const changed = (selected?.value ?? null) !== (option?.value ?? null);
		selected = option ?? null;
		input.value = option?.label ?? "";
		close();
		if (changed) onChange?.(selected?.value ?? "");
	}
	function commitActive() {
		const item = list.children.item(active);
		if (!item) return false;
		commit(options.find((option) => option.value === item.dataset.value) ?? null);
		return true;
	}
	function reconcileText() {
		const typed = input.value.trim().toLowerCase();
		const exact = options.find((option) => option.label.toLowerCase() === typed);
		if (exact) commit(exact);
		else input.value = selected?.label ?? "";
	}
	input.addEventListener("input", () => open());
	input.addEventListener("keydown", (event) => {
		switch (event.key) {
			case "ArrowDown":
				event.preventDefault();
				move(1);
				break;
			case "ArrowUp":
				event.preventDefault();
				move(-1);
				break;
			case "Enter":
				if (isOpen() && commitActive()) event.preventDefault();
				break;
			case "Escape":
				if (isOpen()) {
					event.stopPropagation();
					close();
				}
				break;
			case "Tab": reconcileText();
		}
	});
	list.addEventListener("mousedown", (event) => {
		const item = event.target.closest(".ttp-combo__option");
		if (!item) return;
		event.preventDefault();
		commit(options.find((option) => option.value === item.dataset.value) ?? null);
		input.focus();
	});
	toggle.addEventListener("click", () => {
		if (isOpen()) close();
		else open("");
		input.focus();
	});
	element.addEventListener("focusout", (event) => {
		if (element.contains(event.relatedTarget)) return;
		reconcileText();
		close();
	});
	return {
		element,
		input,
		/**
		* Replace the offered options, keeping the current selection if it is still among them.
		* @param {{value: string, label: string}[]} next
		*/
		setOptions(next) {
			options = next ?? [];
			selected = (selected && options.find((option) => option.value === selected.value)) ?? null;
			input.value = selected?.label ?? "";
			if (isOpen()) open();
		},
		get value() {
			return selected?.value ?? "";
		},
		get label() {
			return selected?.label ?? "";
		},
		/** Select `value` if it is on offer; pass '' to select nothing. */
		set value(value) {
			commit(options.find((option) => option.value === value) ?? null);
		},
		clear() {
			commit(null);
		},
		focus() {
			input.focus();
		}
	};
}

//#endregion
//#region src/tool-panels/js/taxpert-add-fact-modal.js
/** Ask the (single) Add fact dialog to open. Dispatched by every watchlist panel's + button. */
const OPEN_ADD_FACT_EVENT = "taxpert:open-add-fact";
/** The label the Collection ID field offers for "this fact isn't in a collection". */
const NO_COLLECTION = "None";
var TaxpertAddFactModal = class extends HTMLElement {
	constructor() {
		super();
		this._connected = false;
		this._rendered = false;
		this._openWhenReady = false;
		this.ready = Promise.resolve();
		this._onOpenRequest = () => this.open();
	}
	connectedCallback() {
		document.addEventListener(OPEN_ADD_FACT_EVENT, this._onOpenRequest);
		if (this._connected) return;
		this._connected = true;
		this.ready = loadAddFactModalTemplates(this).then(() => {
			if (this.isConnected && !this._rendered) this.render();
			if (this._openWhenReady) {
				this._openWhenReady = false;
				this.open();
			}
		});
	}
	disconnectedCallback() {
		document.removeEventListener(OPEN_ADD_FACT_EVENT, this._onOpenRequest);
	}
	open() {
		if (!this._rendered) {
			this._openWhenReady = true;
			return;
		}
		this._refreshOptions();
		this._clearError();
		if (openDialog(this._dialog)) this._path.focus();
	}
	close() {
		closeDialog(this._dialog);
	}
	render() {
		const { dialog, main } = buildModalShell(this, {
			id: "add-fact-modal",
			prefix: "taf",
			heading: "Add fact"
		});
		main.appendChild(getTemplate("ttp-add-fact"));
		this._dialog = dialog;
		this._error = this.querySelector("[data-field=\"error\"]");
		this._path = this._mountField("path", "add-fact-path", () => this._clearError());
		this._collection = this._mountField("collection", "add-fact-collection", () => this._clearError());
		this.querySelector("[data-action=\"add\"]").addEventListener("click", () => this._submit());
		this._rendered = true;
		this._refreshOptions();
	}
	_mountField(name, id, onChange) {
		const combo = createComboBox({
			id,
			onChange
		});
		this.querySelector(`[data-mount="${name}"]`).appendChild(combo.element);
		this.querySelector(`[data-label="${name}"]`).htmlFor = combo.input.id;
		return combo;
	}
	_refreshOptions() {
		this._path.setOptions(factPaths().map((path) => ({
			value: path,
			label: path
		})));
		this._collection.setOptions([{
			value: "",
			label: NO_COLLECTION
		}, ...collectionIds().map((id) => ({
			value: id,
			label: `#${id}`
		}))]);
	}
	_submit() {
		const path = this._path.value;
		const collectionId = this._collection.value;
		if (!path) return this._showError("Choose a fact path to add.");
		if (path.includes("*") && !collectionId) return this._showError("This fact is inside a collection — choose a collection ID for it.");
		if (isWatched(path, collectionId)) return this._showError("That fact is already on the watchlist.");
		addToWatchlist(path, collectionId);
		this._path.clear();
		this._collection.clear();
		this.close();
	}
	_showError(message) {
		this._error.textContent = message;
		this._error.hidden = false;
	}
	_clearError() {
		this._error.hidden = true;
		this._error.textContent = "";
	}
};
customElements.define("taxpert-add-fact-modal", TaxpertAddFactModal);

//#endregion
//#region src/tool-panels/js/taxpert-watchlist.js
/**
* Asked for by "Reveal in canvas". Stubbed on purpose: the canvas is fact-explorer's, and this
* bundle has no handle on it, so the row says what it wants and leaves the host to answer.
* detail: { path, collectionId, concretePath }
*/
const REVEAL_FACT_EVENT = "taxpert:reveal-fact";
const STATUS = /* @__PURE__ */ new Map([
	["complete", {
		icon: "#ttp-icon-check_circle",
		label: "Complete"
	}],
	["false", {
		icon: "#ttp-icon-error_circle",
		label: "Complete"
	}],
	["incomplete", {
		icon: "#ttp-icon-pending",
		label: "Incomplete"
	}],
	["unknown", {
		icon: "#ttp-icon-pending",
		label: "Unavailable"
	}]
]);
var TaxpertWatchlist = class extends HTMLElement {
	constructor() {
		super();
		this._connected = false;
		this._rendered = false;
		this._rows = /* @__PURE__ */ new Map();
		this.ready = new Promise((resolve, reject) => {
			this._bodyReady = resolve;
			this._bodyFailed = reject;
		});
		this._onWatchlistChange = () => this._syncRows();
		this._onFactChange = () => this._refreshRows();
		this._onDocumentPointerDown = (event) => {
			if (!this._openMenu || this._openMenu.contains(event.target)) return;
			this._closeMenu();
		};
		this._onDocumentKeydown = (event) => {
			if (event.key === "Escape") this._closeMenu({ restoreFocus: true });
		};
	}
	connectedCallback() {
		document.addEventListener(WATCHLIST_CHANGE_EVENT, this._onWatchlistChange);
		this._offFactChange = onFactChange(this._onFactChange);
		document.addEventListener("pointerdown", this._onDocumentPointerDown);
		document.addEventListener("keydown", this._onDocumentKeydown);
		if (this._connected) return;
		this._connected = true;
		loadWatchlistTemplates(this).then(() => {
			if (this.isConnected && !this._rendered) this.render();
			this._bodyReady();
		}, this._bodyFailed);
	}
	disconnectedCallback() {
		document.removeEventListener(WATCHLIST_CHANGE_EVENT, this._onWatchlistChange);
		this._offFactChange?.();
		document.removeEventListener("pointerdown", this._onDocumentPointerDown);
		document.removeEventListener("keydown", this._onDocumentKeydown);
	}
	render() {
		this.replaceChildren(getTemplate("ttp-watchlist"));
		this._list = this.querySelector(".ttp-watch__list");
		this._addButton = this.querySelector(".ttp-watch__add");
		if (!document.querySelector("taxpert-add-fact-modal")) document.body.appendChild(document.createElement("taxpert-add-fact-modal"));
		this._addButton.addEventListener("click", () => {
			document.dispatchEvent(new CustomEvent(OPEN_ADD_FACT_EVENT));
		});
		this._rendered = true;
		this._syncRows();
	}
	/**
	* Reconcile the rows with the stored watchlist: drop what has gone, build what is new, and put
	* what stayed back in the stored order. Existing row elements are *reused*, so an expanded row
	* stays expanded when a fact is added above it.
	*/
	_syncRows() {
		if (!this._rendered) return;
		const entries = getWatchlist();
		const wanted = new Set(entries.map((entry) => watchKey(entry.path, entry.collectionId)));
		for (const [key, row] of this._rows) {
			if (wanted.has(key)) continue;
			row.remove();
			this._rows.delete(key);
		}
		for (const entry of entries) {
			const key = watchKey(entry.path, entry.collectionId);
			let row = this._rows.get(key);
			if (!row) {
				row = this._buildRow(entry);
				this._rows.set(key, row);
			}
			this._list.appendChild(row);
		}
		this._refreshRows();
	}
	_buildRow(entry) {
		const row = getTemplate("ttp-watchlist-row").firstElementChild;
		row.dataset.path = entry.path;
		row.dataset.collectionId = entry.collectionId;
		const kebab = row.querySelector(".ttp-watch__kebab");
		const menu = row.querySelector(".ttp-watch__menu-list");
		kebab.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (menu.hidden) this._openMenuFor(row);
			else this._closeMenu({ restoreFocus: true });
		});
		for (const button of row.querySelectorAll("[data-action]")) button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this._closeMenu();
			if (button.dataset.action === "remove") this._remove(entry, row);
			else this._reveal(entry);
		});
		return row;
	}
	_refreshRows() {
		for (const row of this._rows.values()) this._refreshRow(row);
	}
	_refreshRow(row) {
		const state = readFact({
			path: row.dataset.path,
			collectionId: row.dataset.collectionId ?? ""
		});
		const status = STATUS.get(state.status) ?? STATUS.get("unknown");
		row.dataset.status = state.status;
		row.querySelector(".ttp-watch__status use").setAttribute("href", status.icon);
		const field = (name) => row.querySelector(`[data-field="${name}"]`);
		field("path").textContent = state.path;
		field("value").textContent = state.value;
		field("status-label").textContent = `Status: ${status.label}.`;
		field("menu-label").textContent = `Actions for ${state.path}`;
		field("detail-value").textContent = state.value;
		field("detail-type").textContent = state.typeLabel || "Unknown";
		field("detail-path").textContent = state.concretePath;
		const collectionRow = field("detail-collection-row");
		collectionRow.hidden = !state.collectionId;
		field("detail-collection").textContent = state.collectionId ? `#${state.collectionId}` : "";
	}
	_remove(entry, row) {
		if (row.contains(document.activeElement)) this._addButton.focus();
		removeFromWatchlist(entry.path, entry.collectionId);
	}
	_reveal(entry) {
		const detail = {
			...entry,
			concretePath: readFact(entry).concretePath
		};
		console.debug("Reveal in canvas is not implemented yet", detail);
		document.dispatchEvent(new CustomEvent(REVEAL_FACT_EVENT, {
			detail,
			bubbles: true
		}));
	}
	_openMenuFor(row) {
		this._closeMenu();
		row.querySelector(".ttp-watch__menu-list").hidden = false;
		row.querySelector(".ttp-watch__kebab").setAttribute("aria-expanded", "true");
		this._openMenu = row.querySelector(".ttp-watch__menu");
		row.querySelector(".ttp-watch__menu-item").focus();
	}
	_closeMenu({ restoreFocus = false } = {}) {
		const menu = this._openMenu;
		if (!menu) return;
		this._openMenu = null;
		menu.querySelector(".ttp-watch__menu-list").hidden = true;
		const kebab = menu.querySelector(".ttp-watch__kebab");
		kebab.setAttribute("aria-expanded", "false");
		if (restoreFocus) kebab.focus();
	}
};
customElements.define("taxpert-watchlist", TaxpertWatchlist);

//#endregion
//#region src/tool-panels/js/taxpert-overrides.js
/**
* The `<input type>` each fact-graph type is edited with.
*
* Read from the dictionary's own `typeNode`, so a Day is a date picker and a Dollar a number field
* with no per-host mapping to keep in step. A type not listed here is edited as text, which is what
* the graph will parse anyway.
*/
const INPUT_TYPES = /* @__PURE__ */ new Map([
	["DayNode", "date"],
	["DollarNode", "number"],
	["IntNode", "number"],
	["RationalNode", "text"],
	["BooleanNode", "checkbox"]
]);
const inputTypeFor = (typeNode) => INPUT_TYPES.get(typeNode) ?? "text";
var TaxpertOverrides = class extends HTMLElement {
	constructor() {
		super();
		this._connected = false;
		this._rendered = false;
		this._rows = [];
		this.ready = new Promise((resolve, reject) => {
			this._bodyReady = resolve;
			this._bodyFailed = reject;
		});
		this._onFactChange = () => this._refresh();
		this._onConfigChange = () => {
			if (this._rendered) this.render();
		};
	}
	connectedCallback() {
		this._offFactChange = onFactChange(this._onFactChange);
		document.addEventListener(CONFIG_CHANGE_EVENT, this._onConfigChange);
		if (this._connected) return;
		this._connected = true;
		loadOverridesTemplates(this).then(() => {
			if (this.isConnected && !this._rendered) this.render();
			this._bodyReady();
		}, this._bodyFailed);
	}
	disconnectedCallback() {
		this._offFactChange?.();
		document.removeEventListener(CONFIG_CHANGE_EVENT, this._onConfigChange);
	}
	/** The fact paths this host made overridable. `getTool` reads the live config, so this is late. */
	get facts() {
		return getTool("overrides")?.facts ?? [];
	}
	render() {
		this._rows = [];
		this._rendered = true;
		const facts = this.facts;
		if (!facts.length) {
			this.replaceChildren(getTemplate("ttp-overrides-empty"));
			return;
		}
		this.replaceChildren(getTemplate("ttp-overrides"));
		const list = this.querySelector(".ttp-overrides__list");
		for (const path of facts) list.appendChild(this._buildRow(path));
		this._refresh();
	}
	_buildRow(path) {
		const node = getTemplate("ttp-overrides-row").firstElementChild;
		const state = readFact({
			path,
			collectionId: ""
		});
		const input = node.querySelector(".ttp-overrides__input");
		input.id = `ttp-override-${path.replace(/\W+/g, "-")}`;
		input.type = inputTypeFor(graphPort().getDefinition(path)?.typeNode);
		const label = node.querySelector(".ttp-overrides__label");
		label.htmlFor = input.id;
		label.textContent = path;
		input.addEventListener("change", () => this._write(path, input));
		node.querySelector(".ttp-overrides__clear").addEventListener("click", () => {
			input.value = "";
			this._write(path, input);
		});
		const row = {
			path,
			node,
			input,
			status: node.querySelector("[data-field=\"status\"]")
		};
		this._rows.push(row);
		this._fillInput(row, state);
		return node;
	}
	_write(path, input) {
		const value = input.type === "checkbox" ? String(input.checked) : input.value;
		if (!graphPort().set(path, value)) {
			const row = this._rows.find((candidate) => candidate.path === path);
			if (row) this._setStatus(row, "error", "Could not write this fact.");
		}
	}
	_refresh() {
		if (!this._rendered) return;
		for (const row of this._rows) {
			const state = readFact({
				path: row.path,
				collectionId: ""
			});
			if (document.activeElement !== row.input) this._fillInput(row, state);
			this._setStatus(row, state.status, state.value);
		}
	}
	_fillInput(row, state) {
		if (row.input.type === "checkbox") row.input.checked = state.raw === true;
		else row.input.value = state.raw === null || state.raw === void 0 ? "" : String(state.raw);
	}
	_setStatus(row, status, text) {
		row.node.dataset.status = status;
		row.status.textContent = status === "incomplete" ? "Not set" : text;
	}
};
customElements.define("taxpert-overrides", TaxpertOverrides);

//#endregion
//#region src/tool-panels/js/taxpert-tool-panel.js
var TaxpertToolPanel = class extends HTMLElement {
	constructor() {
		super();
		this._connected = false;
		this._rendered = false;
		this.ready = new Promise((resolve, reject) => {
			this._chromeReady = resolve;
			this._chromeFailed = reject;
		});
	}
	connectedCallback() {
		if (this._connected) return;
		this._connected = true;
		loadToolPanelTemplates(this).then(() => {
			if (this.isConnected && !this._rendered) this.render();
			this._chromeReady();
		}, this._chromeFailed);
	}
	get tool() {
		return this.getAttribute("tool");
	}
	get grip() {
		return this.querySelector(".ttp-panel__grip");
	}
	get growHandles() {
		return [...this.querySelectorAll(".ttp-panel__grow[data-edge]")];
	}
	render() {
		const tool = getTool(this.tool);
		if (!tool) return;
		this.replaceChildren(getTemplate("ttp-panel"));
		this.querySelector(".ttp-panel__title").textContent = tool.label;
		this.querySelector(".ttp-panel__grip-label").textContent = `Move ${tool.label}`;
		this.querySelector(".ttp-panel__close-label").textContent = `Close ${tool.label}`;
		const body = this.querySelector(".ttp-panel__body");
		try {
			body.appendChild(getTemplate(tool.templateId));
		} catch {}
		this.querySelector(".ttp-panel__close").addEventListener("click", () => {
			setToolOn(tool.id, false);
		});
		this._rendered = true;
	}
};
customElements.define("taxpert-tool-panel", TaxpertToolPanel);

//#endregion
//#region src/tool-panels/js/taxpert-tools-modal.js
var TaxpertToolsModal = class extends HTMLElement {
	constructor() {
		super();
		this._connected = false;
		this._rendered = false;
		this.ready = Promise.resolve();
		this._onNavTool = (event) => {
			if (event.detail?.id === "tools") this.open();
		};
		this._onLayoutChange = () => this._syncCheckboxes();
		this._onConfigChange = () => {
			if (this._rendered) this._renderOptions();
		};
	}
	connectedCallback() {
		document.addEventListener("nav-tool-select", this._onNavTool);
		document.addEventListener(TOOL_LAYOUT_CHANGE_EVENT, this._onLayoutChange);
		document.addEventListener(CONFIG_CHANGE_EVENT, this._onConfigChange);
		if (this._connected) return;
		this._connected = true;
		this.ready = loadToolsModalTemplates(this).then(() => {
			if (this.isConnected && !this._rendered) this.render();
			if (this._openWhenReady) {
				this._openWhenReady = false;
				this.open();
			}
		});
	}
	disconnectedCallback() {
		document.removeEventListener("nav-tool-select", this._onNavTool);
		document.removeEventListener(TOOL_LAYOUT_CHANGE_EVENT, this._onLayoutChange);
		document.removeEventListener(CONFIG_CHANGE_EVENT, this._onConfigChange);
	}
	open() {
		if (!this._rendered) {
			this._openWhenReady = true;
			return;
		}
		this._syncCheckboxes();
		openDialog(this._dialog);
	}
	close() {
		closeDialog(this._dialog);
	}
	render() {
		const { dialog, main } = buildModalShell(this, {
			id: "tools-modal",
			prefix: "ttm",
			heading: "Tools"
		});
		main.appendChild(getTemplate("ttm-sections"));
		this._dialog = dialog;
		this._rendered = true;
		this._renderOptions();
		this.querySelector("[data-action=\"reset\"]").addEventListener("click", () => resetToolLayout());
		this._syncCheckboxes();
	}
	_renderOptions() {
		const container = this.querySelector("[data-options=\"tools\"]");
		container.replaceChildren();
		for (const tool of tools()) {
			const fragment = getTemplate("ttm-option");
			const input = fragment.querySelector("input");
			input.id = `ttm-tool-${tool.id}`;
			input.value = tool.id;
			input.dataset.tool = tool.id;
			input.addEventListener("change", () => setToolOn(tool.id, input.checked));
			const label = fragment.querySelector("label");
			label.htmlFor = input.id;
			fragment.querySelector(".ttm-option__name").textContent = tool.label;
			fragment.querySelector(".ttm-option__hint").textContent = tool.description;
			container.appendChild(fragment);
		}
		this._checkboxes = [...this.querySelectorAll("input[data-tool]")];
		this._syncCheckboxes();
	}
	_syncCheckboxes() {
		for (const checkbox of this._checkboxes ?? []) checkbox.checked = isToolOn(checkbox.dataset.tool);
	}
};
customElements.define("taxpert-tools-modal", TaxpertToolsModal);

//#endregion
//#region src/tool-panels/js/drop-target.js
/** How close to a column edge counts as "make a new column here", in px. */
const EDGE_ZONE = 48;
function within(rect, point) {
	return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}
function nearestColumn(columns, x) {
	let best = 0;
	let bestDistance = Infinity;
	for (const [index, column] of columns.entries()) {
		const { left, right } = column.rect;
		const distance = x < left ? left - x : x > right ? x - right : 0;
		if (distance < bestDistance) {
			best = index;
			bestDistance = distance;
		}
	}
	return best;
}
/**
* @typedef {{left:number, right:number, top:number, bottom:number, height:number}} Rect
* @typedef {{ rect: Rect, panels: { id: string, rect: Rect }[] }} ColumnGeometry
*
* @param {{x:number, y:number}} point the pointer, in viewport coordinates
* @param {{ dock: Rect|null, columns: ColumnGeometry[], canAddColumn: boolean }} geometry
*   `columns` must already exclude the panel being dragged. It is out of flow, so its rectangle
*   says where the cursor is rather than where a drop would put it.
* @returns {{kind:'float'} | {kind:'column', columnIndex:number, index:number}
*           | {kind:'new-column', columnIndex:number}}
*/
function resolveDropTarget(point, { dock, columns = [], canAddColumn = false } = {}) {
	if (!dock || !within(dock, point)) return { kind: "float" };
	if (!columns.length) return {
		kind: "new-column",
		columnIndex: 0
	};
	if (canAddColumn) {
		for (const [index, column] of columns.entries()) if (Math.abs(point.x - column.rect.left) <= 48) return {
			kind: "new-column",
			columnIndex: index
		};
		if (Math.abs(point.x - columns.at(-1).rect.right) <= 48) return {
			kind: "new-column",
			columnIndex: columns.length
		};
	}
	const columnIndex = nearestColumn(columns, point.x);
	return {
		kind: "column",
		columnIndex,
		index: columns.at(columnIndex).panels.filter((panel) => point.y > panel.rect.top + panel.rect.height / 2).length
	};
}

//#endregion
//#region src/tool-panels/js/drag-resize.js
const KEYBOARD_STEP = 24;
/**
* Turn `handle` into a pointer-drag source. `onMove` receives deltas from the press point, not the
* previous frame, so a handler never accumulates rounding drift.
*
* @param {Element} handle
* @param {object} options
* @param {string} [options.bodyClass] class set on <body> for the duration (cursor + user-select)
* @param {(event: PointerEvent) => any} [options.onStart] its return value is passed back as `start`
* @param {(delta: {dx:number, dy:number, x:number, y:number}, start:any, event:PointerEvent) => void} options.onMove
* @param {(start:any, event:PointerEvent) => void} [options.onEnd]
* @returns {() => void} unbind
*/
function onPointerDrag(handle, { bodyClass, onStart, onMove, onEnd }) {
	const onPointerDown = (event) => {
		if (event.button !== 0) return;
		event.preventDefault();
		const origin = {
			x: event.clientX,
			y: event.clientY
		};
		const start = onStart?.(event);
		if (start === false) return;
		try {
			handle.setPointerCapture(event.pointerId);
		} catch {}
		if (bodyClass) document.body.classList.add(bodyClass);
		const move = (moveEvent) => {
			onMove({
				dx: moveEvent.clientX - origin.x,
				dy: moveEvent.clientY - origin.y,
				x: moveEvent.clientX,
				y: moveEvent.clientY
			}, start, moveEvent);
		};
		const up = (upEvent) => {
			try {
				handle.releasePointerCapture(event.pointerId);
			} catch {}
			if (bodyClass) document.body.classList.remove(bodyClass);
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", up);
			onEnd?.(start, upEvent);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
		window.addEventListener("pointercancel", up);
	};
	handle.addEventListener("pointerdown", onPointerDown);
	return () => handle.removeEventListener("pointerdown", onPointerDown);
}
/**
* Arrow-key parity for a resize handle: the keyboard equivalent of dragging it one step.
* Horizontal handles (`aria-orientation="horizontal"`) take Up/Down, vertical ones Left/Right.
* @param {Element} handle
* @param {(delta: {dx:number, dy:number}) => void} onStep
* @param {number} [step]
*/
function onKeyResize(handle, onStep, step = KEYBOARD_STEP) {
	handle.addEventListener("keydown", (event) => {
		const horizontal = handle.getAttribute("aria-orientation") === "horizontal";
		const delta = {
			dx: 0,
			dy: 0
		};
		if (!horizontal && event.key === "ArrowLeft") delta.dx = -step;
		else if (!horizontal && event.key === "ArrowRight") delta.dx = step;
		else if (horizontal && event.key === "ArrowUp") delta.dy = -step;
		else if (horizontal && event.key === "ArrowDown") delta.dy = step;
		else return;
		event.preventDefault();
		onStep(delta);
	});
}
/**
* Split a pair of flex ratios by where their shared edge was dragged to. The pair keeps its combined
* share of the parent, so dragging one splitter never disturbs a third sibling.
*
* @param {{flex:number, size:number}} first  ratio and current px size of the leading box
* @param {{flex:number, size:number}} second ratio and current px size of the trailing box
* @param {number} delta px the shared edge moved (positive grows `first`)
* @param {number} min minimum px for either box
* @returns {[number, number]} the new ratios
*/
function resizePair(first, second, delta, min) {
	const total = first.size + second.size;
	const sum = first.flex + second.flex;
	if (total <= 0 || sum <= 0) return [first.flex, second.flex];
	const firstSize = Math.min(Math.max(first.size + delta, min), total - min);
	if (!Number.isFinite(firstSize) || firstSize <= 0) return [first.flex, second.flex];
	const firstFlex = firstSize / total * sum;
	return [firstFlex, sum - firstFlex];
}
/** Keep a `role="separator"` handle's aria-value* in step, as a percentage of the pair it splits. */
function updateSeparator(handle, ratio) {
	const now = Math.round(ratio * 100);
	handle.setAttribute("aria-valuemin", "0");
	handle.setAttribute("aria-valuemax", "100");
	handle.setAttribute("aria-valuenow", String(now));
	handle.setAttribute("aria-valuetext", `${now}%`);
}

//#endregion
//#region src/tool-panels/js/taxpert-tool-dock.js
/** Thickness of the drop indicator bar, in px. */
const DROP_BAR = 4;
const RESIZE_EDGES = /* @__PURE__ */ new Map([
	["n", { top: true }],
	["s", { bottom: true }],
	["e", { right: true }],
	["w", { left: true }],
	["ne", {
		top: true,
		right: true
	}],
	["nw", {
		top: true,
		left: true
	}],
	["se", {
		bottom: true,
		right: true
	}],
	["sw", {
		bottom: true,
		left: true
	}]
]);
const RESIZE_CURSOR = /* @__PURE__ */ new Map([
	["n", "ttd-resizing--y"],
	["s", "ttd-resizing--y"],
	["e", "ttd-resizing--x"],
	["w", "ttd-resizing--x"],
	["nw", "ttd-resizing--nwse"],
	["se", "ttd-resizing--nwse"],
	["ne", "ttd-resizing--nesw"],
	["sw", "ttd-resizing--nesw"]
]);
/**
* Where a floating panel's box lands when `edge` is dragged by `delta` from `start`. Growing north
* or west moves the origin as well as the size, so that the ungrabbed side stays put.
*
* @param {{x:number, y:number, w:number, h:number}} start the box when the drag began
* @param {{dx:number, dy:number}} delta pointer movement since the press
* @param {string} edge one of RESIZE_EDGES' keys
*/
function resizeBox(start, { dx, dy }, edge) {
	const sides = RESIZE_EDGES.get(edge) ?? {};
	const next = { ...start };
	if (sides.right) next.w = Math.max(start.w + dx, 300);
	if (sides.left) {
		next.w = Math.max(start.w - dx, 300);
		next.x = start.x + (start.w - next.w);
	}
	if (sides.bottom) next.h = Math.max(start.h + dy, 300);
	if (sides.top) {
		next.h = Math.max(start.h - dy, 300);
		next.y = start.y + (start.h - next.h);
	}
	return next;
}
var TaxpertToolDock = class extends HTMLElement {
	constructor() {
		super();
		this._connected = false;
		this._rendered = false;
		this._panels = /* @__PURE__ */ new Map();
		this.ready = Promise.resolve();
		this._onLayoutChange = () => this._syncLayout();
		this._onWindowResize = () => this._applyDockWidth(dockWidth());
	}
	connectedCallback() {
		document.addEventListener(TOOL_LAYOUT_CHANGE_EVENT, this._onLayoutChange);
		window.addEventListener("resize", this._onWindowResize);
		if (this._connected) return;
		this._connected = true;
		this.ready = loadToolDockTemplates(this).then(() => {
			if (this.isConnected && !this._rendered) this.render();
		});
	}
	disconnectedCallback() {
		document.removeEventListener(TOOL_LAYOUT_CHANGE_EVENT, this._onLayoutChange);
		window.removeEventListener("resize", this._onWindowResize);
	}
	get toolsModal() {
		return this._toolsModal;
	}
	render() {
		if (!document.querySelector(".ttp-sprite")) document.body.insertBefore(getTemplate("ttp-sprite"), document.body.firstChild);
		const dock = getTemplate("ttd-dock");
		const floatLayer = getTemplate("ttd-float-layer");
		this.replaceChildren(dock, floatLayer);
		this._dock = this.querySelector(".ttd-dock");
		this._columnsEl = this.querySelector(".ttd-dock__columns");
		this._floatLayer = this.querySelector(".ttd-float-layer");
		this._dropzone = getTemplate("ttd-dropzone").firstElementChild;
		this._floatLayer.appendChild(this._dropzone);
		this._wireDockResizer(this.querySelector(".ttd-dock__resizer"));
		if (!document.querySelector("taxpert-tools-modal")) this._toolsModal = document.body.appendChild(document.createElement("taxpert-tools-modal"));
		this._rendered = true;
		this._syncLayout();
	}
	/**
	* Reconcile the DOM with the stored layout. Panel elements are moved, never rebuilt, so a panel
	* keeps its scroll position and its open <details> when it changes column or floats.
	*/
	_syncLayout() {
		if (!this._rendered) return;
		const layout = getLayout();
		const wanted = /* @__PURE__ */ new Set([...layout.columns.flatMap((column) => column.ids), ...layout.floating.map((item) => item.id)]);
		for (const [id, element] of this._panels) {
			if (wanted.has(id)) continue;
			element.remove();
			this._panels.delete(id);
		}
		for (const id of wanted) if (!this._panels.has(id)) this._panels.set(id, this._createPanel(id));
		this._renderColumns(layout);
		this._renderFloating(layout);
		this.toggleAttribute("data-open", wanted.size > 0);
		this.toggleAttribute("data-docked", layout.columns.length > 0);
		this._dock.hidden = layout.columns.length === 0;
		this._applyDockWidth(dockWidth());
	}
	_createPanel(id) {
		const panel = document.createElement("taxpert-tool-panel");
		panel.setAttribute("tool", id);
		panel.ready.then(() => {
			if (panel.grip) this._wirePanelDrag(panel);
			for (const handle of panel.growHandles) this._wireFloatResize(panel, handle);
		});
		return panel;
	}
	_renderColumns(layout) {
		this._columnsEl.replaceChildren();
		for (const [index, column] of layout.columns.entries()) {
			if (index) this._columnsEl.appendChild(this._columnSplitter(index));
			const columnEl = getTemplate("ttd-column").firstElementChild;
			columnEl.style.setProperty("--ttd-column-flex", column.flex);
			for (const [position, panel] of column.panels.entries()) {
				if (position) columnEl.appendChild(this._panelSplitter(column, position));
				const element = this._panels.get(panel.id);
				element.removeAttribute("data-float");
				element.style.setProperty("--ttp-flex", panel.flex);
				columnEl.appendChild(element);
			}
			this._columnsEl.appendChild(columnEl);
		}
	}
	_renderFloating(layout) {
		for (const item of layout.floating) {
			const element = this._panels.get(item.id);
			element.setAttribute("data-float", "");
			this._setBox(element, item);
			this._floatLayer.appendChild(element);
		}
	}
	_setBox(element, { x, y, w, h }) {
		element.style.setProperty("--ttp-x", `${Math.round(x)}px`);
		element.style.setProperty("--ttp-y", `${Math.round(y)}px`);
		element.style.setProperty("--ttp-w", `${Math.round(w)}px`);
		element.style.setProperty("--ttp-h", `${Math.round(h)}px`);
	}
	_applyDockWidth(px) {
		const next = Math.min(Math.max(Math.round(px), 300), maxDockWidth());
		this.style.setProperty("--ttd-width", `${next}px`);
		const resizer = this.querySelector(".ttd-dock__resizer");
		if (resizer) updateSeparator(resizer, next / Math.max(window.innerWidth, 1));
		return next;
	}
	_wireDockResizer(resizer) {
		let preview = dockWidth();
		onPointerDrag(resizer, {
			bodyClass: "ttd-resizing--x",
			onStart: () => dockWidth(),
			onMove: ({ x }) => {
				preview = this._applyDockWidth(window.innerWidth - x);
			},
			onEnd: () => setDockWidth(preview)
		});
		onKeyResize(resizer, ({ dx }) => setDockWidth(dockWidth() - dx));
	}
	/** Between columns `index - 1` and `index`. */
	_columnSplitter(index) {
		const splitter = getTemplate("ttd-splitter-v").firstElementChild;
		const columns = () => [...this._columnsEl.querySelectorAll(".ttd-column")];
		const pair = () => {
			const all = columns();
			return [all.at(index - 1), all.at(index)];
		};
		this._wirePairResize(splitter, {
			axis: "x",
			min: 300,
			property: "--ttd-column-flex",
			pair,
			measure: (element) => element.getBoundingClientRect().width,
			commit: (before, after) => setColumnFlexPair(index, before, after)
		});
		return splitter;
	}
	/** Between the panels at `position - 1` and `position` in `column`. */
	_panelSplitter(column, position) {
		const splitter = getTemplate("ttd-splitter-h").firstElementChild;
		const first = column.panels.at(position - 1);
		const second = column.panels.at(position);
		const pair = () => [this._panels.get(first.id), this._panels.get(second.id)];
		this._wirePairResize(splitter, {
			axis: "y",
			min: 300,
			property: "--ttp-flex",
			pair,
			measure: (element) => element.getBoundingClientRect().height,
			commit: (before, after) => setPanelFlexPair(first.id, second.id, before, after)
		});
		return splitter;
	}
	/**
	* The shared body of both splitters: preview by writing the two flex ratios onto the DOM, commit
	* once at the end. Committing per frame would re-render the splitter out from under the pointer.
	*/
	_wirePairResize(splitter, { axis, min, property, pair, measure, commit }) {
		const ratios = () => {
			const [a, b] = pair();
			if (!a || !b) return null;
			return {
				a,
				b,
				first: {
					flex: Number(a.style.getPropertyValue(property)) || 1,
					size: measure(a)
				},
				second: {
					flex: Number(b.style.getPropertyValue(property)) || 1,
					size: measure(b)
				}
			};
		};
		const step = (state, delta) => {
			const [before, after] = resizePair(state.first, state.second, delta, min);
			state.a.style.setProperty(property, before);
			state.b.style.setProperty(property, after);
			updateSeparator(splitter, before / (before + after));
			return [before, after];
		};
		let last = null;
		onPointerDrag(splitter, {
			bodyClass: axis === "x" ? "ttd-resizing--x" : "ttd-resizing--y",
			onStart: () => ratios() ?? false,
			onMove: (delta, state) => {
				last = step(state, axis === "x" ? delta.dx : delta.dy);
			},
			onEnd: () => last && commit(...last)
		});
		onKeyResize(splitter, (delta) => {
			const state = ratios();
			if (!state) return;
			commit(...step(state, axis === "x" ? delta.dx : delta.dy));
		});
	}
	/**
	* One of a floating panel's eight resize handles. CSS hides these on a docked panel, which is
	* sized by the dock's splitters instead, so this never has to ask which the panel is.
	*/
	_wireFloatResize(panel, handle) {
		const edge = handle.dataset.edge;
		const box = () => {
			const rect = panel.getBoundingClientRect();
			return {
				x: rect.left,
				y: rect.top,
				w: rect.width,
				h: rect.height
			};
		};
		const resized = (start, delta) => resizeBox(start, delta, edge);
		let preview = null;
		onPointerDrag(handle, {
			bodyClass: RESIZE_CURSOR.get(edge),
			onStart: box,
			onMove: (delta, start) => {
				preview = resized(start, delta);
				this._setBox(panel, preview);
			},
			onEnd: () => preview && floatTool(panel.tool, preview)
		});
		onKeyResize(handle, (delta) => floatTool(panel.tool, resized(box(), delta)));
	}
	_wirePanelDrag(panel) {
		let target = { kind: "float" };
		onPointerDrag(panel.grip, {
			bodyClass: "ttd-dragging",
			onStart: (event) => {
				const rect = panel.getBoundingClientRect();
				panel.setAttribute("data-float", "");
				panel.setAttribute("data-dragging", "");
				this._setBox(panel, {
					x: rect.left,
					y: rect.top,
					w: rect.width,
					h: rect.height
				});
				this._floatLayer.appendChild(panel);
				return {
					rect,
					grab: {
						x: event.clientX - rect.left,
						y: event.clientY - rect.top
					}
				};
			},
			onMove: ({ x, y }, start) => {
				this._setBox(panel, {
					x: x - start.grab.x,
					y: y - start.grab.y,
					w: start.rect.width,
					h: start.rect.height
				});
				target = resolveDropTarget({
					x,
					y
				}, this._geometry(panel));
				this._showDropzone(target);
			},
			onEnd: ({ rect, grab }, event) => {
				this._dropzone.hidden = true;
				panel.removeAttribute("data-dragging");
				if (target.kind === "float") floatTool(panel.tool, {
					x: event.clientX - grab.x,
					y: event.clientY - grab.y,
					w: rect.width,
					h: rect.height
				});
				else dockTool(panel.tool, {
					columnIndex: target.columnIndex,
					index: target.index ?? 0,
					newColumn: target.kind === "new-column"
				});
			}
		});
	}
	/**
	* The rectangles a drop decision is made against, measured fresh each frame. The dragged panel is
	* excluded: it is out of flow, so its rectangle says where the cursor is, not where a drop lands.
	*/
	_geometry(dragged) {
		const columns = [...this._columnsEl.querySelectorAll(".ttd-column")].map((column) => ({
			rect: column.getBoundingClientRect(),
			panels: [...column.querySelectorAll("taxpert-tool-panel")].filter((panel) => panel !== dragged).map((panel) => ({
				id: panel.tool,
				rect: panel.getBoundingClientRect()
			}))
		}));
		return {
			dock: this._dockRect(),
			columns: columns.filter((column) => column.panels.length),
			canAddColumn: fitsColumns(columns.length + 1)
		};
	}
	/**
	* The area a drop counts as docked. With nothing docked the element has collapsed to no width, so
	* this offers the strip the dock would occupy instead. Without that, a floating panel could never
	* be dragged back and only "Reset tool layout" would rescue it.
	*/
	_dockRect() {
		if (!this._dock.hidden) return this._dock.getBoundingClientRect();
		const width = Math.min(dockWidth(), maxDockWidth());
		return {
			left: window.innerWidth - width,
			right: window.innerWidth,
			top: 0,
			bottom: window.innerHeight,
			width,
			height: window.innerHeight
		};
	}
	_showDropzone(target) {
		if (target.kind === "float") {
			this._dropzone.hidden = true;
			return;
		}
		const columnEls = [...this._columnsEl.querySelectorAll(".ttd-column")];
		const dock = this._dockRect();
		if (target.kind === "new-column") {
			const at = columnEls.at(target.columnIndex);
			const x = at ? at.getBoundingClientRect().left : dock.right;
			this._setBox(this._dropzone, {
				x: x - DROP_BAR / 2,
				y: dock.top,
				w: DROP_BAR,
				h: dock.height
			});
		} else {
			const column = columnEls.at(target.columnIndex);
			if (!column) return;
			const rect = column.getBoundingClientRect();
			const at = [...column.querySelectorAll("taxpert-tool-panel:not([data-dragging])")].at(target.index);
			const y = at ? at.getBoundingClientRect().top : rect.bottom;
			this._setBox(this._dropzone, {
				x: rect.left,
				y: y - DROP_BAR / 2,
				w: rect.width,
				h: DROP_BAR
			});
		}
		this._dropzone.hidden = false;
	}
};
customElements.define("taxpert-tool-dock", TaxpertToolDock);

//#endregion
export { NAV_TEMPLATE_IDS, configure, configureFromUrl, disable, enable, navTemplatesHosted, windowFactGraphAdapter };