# To change X, go here

Paths are inside the Virginia site, `virginia/direct-file/`, relative to `src/main/resources/direct-file/` unless they start with
`scripts/` or `workbench/`. Every row ends with `make check` at the root, about a minute.

| To change | Go to | Then |
|---|---|---|
| A tax-year figure: a deduction amount, a threshold, a rate, a date | the Workbench, Values page (by tax year, with a source); or `facts/virginiaConstants.xml` | the constants check fails on a figure in any other module or without a tax year |
| A rule: how a line is computed | the Workbench, click the line (plain language or the XML tab, which names the module); or the fact in its module, `facts/virginia*.xml`, one per section of the return | a worked example in `workbench/examples/virginia.json` and a household in `scripts/virginia-cases.py` for the new case; the row in `handoff/POLICY_MAP.md` |
| A question the filer is asked | the Workbench, Questions asked, "Ask the filer something new"; or a writable fact in the module of the rule that reads it plus a screen in `flow/your-taxes-virginia.xml` | the Spanish in `locales/virginia_es.yaml`; nothing else: the a11y pass reads its routes from the flow |
| The words on a Virginia screen | the Workbench, Screens filers see (keeps the Spanish key in step); or the screen in `flow/your-taxes-virginia.xml` | `python3 scripts/merge-virginia-es.py` names the stale Spanish key; re-copy it |
| The Spanish | `locales/virginia_es.yaml`, keyed on the English text; the Workbench's translator role for words a change added | `make check` checks the keys match |
| The words the Virginia scripts show (buttons, statuses, the chrome) | `virginia.ui.*` in `locales/en.yaml` and `locales/es.yaml` | |
| A locality's code or use-tax rate, or a new locality | `facts/virginiaLocalities.xml`, both switches, no default | the constants check fails if a locality is missing from either switch |
| Which ZIP codes map to which locality | `scripts/build-virginia-zip-localities.py` over the Census ZCTA-to-county file, which writes `website-static/data/virginia-zip-localities.json` | |
| A demo household | `website-static/data/virginia-demos.json`: the IRS scenario it starts from, the keys that change, the lines the engine must compute, the result the page shows; then `python3 scripts/virginia-demos.py build` writes the scenario file | the hand checks in `docs/virginia/README.md`; `VirginiaSpec`, the links, the harness and the axe pass all read the manifest |
| What Virginia's records hold for a demo (Lines 20 to 22) | `website-static/data/virginia-records.json`, keyed by last name and date of birth | |
| The start page, the front door with the four households | `website-static/start/index.html`, a static page outside the flow; the cards are drawn from `website-static/data/virginia-demos.json`, so a new demo appears without an edit | `make a11y` scans it with the screens |
| The Virginia look: masthead, footer, step track, colours | `templates/fragments/va-masthead.html`, `usa-banner.html`, `usa-step-indicator.html`, `js-templates.html`; `website-static/styles/components/virginia.css` | `make a11y` once at the end |
| How a Virginia screen behaves in the browser | `website-static/js/virginia-*.js`, each one thing: records, locality, corrections, the combo box, sign, save, chrome, the demo link; a new one is one import in `virginia.js` | `make -C virginia/direct-file validate-js` |
| A new section of rules | a new `facts/virginiaSomething.xml` module beside the others, with the shared preamble; refer to another module's fact with `module="…"` | nothing else: the checks, the stats and the Workbench find every `facts/virginia*.xml` |
| The independent model the households are checked against | `scripts/lib/virginia-model.cjs`, written from the Code, not from the XML | `make cases` with the site running |
| Which federal facts Virginia may read | nothing: only facts the federal return exports to states, enforced by `scripts/check-virginia-exports.py` | if the fact is not exported, the Workbench's Requests page is where a policy author asks for it |
| Anything federal: a federal screen, a federal rule | do not. The federal behaviour is unchanged and the tests prove it. The one federal touch is `va` in the residence question, added by `PORT_STATES` in `codemod/emit.ts` | ADR-002 lists the IRS files the change set touches |
| Which commit of an IRS library is used | `make bump-pin REPO=… SHA=…` (dry run with a drift report; `APPLY=1` to do it), then `IRS_PINS.md` | `make bootstrap`, `make test`, `make handoff-verify` |

Once at the end of a round, not after every edit: `make test`, and with the site running,
`make cases` and `make a11y`. If a sentence in the docs carries a count
(facts, screens, households, questions), `make stats STATS=--check` says whether it still holds.
