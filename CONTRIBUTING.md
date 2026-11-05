# Contributing

How to change the Virginia return. `GETTING_STARTED.md` gets the site running first. The 2025
archive (`direct-file/`) is never modified; it is the "before", and `docs/archive-2025.md` says
how to run it if you want to see it.

## Where things are

Everything Virginia lives in the Virginia site, `virginia/direct-file/`: the IRS's `direct-file`
application, copied out of `form-builder-examples/` and changed here. Nothing under
`form-builder-examples/`, `fact-graph/`, `form-builder/` or `taxpert/` is ever edited (ADR-004). Paths below are relative to its
`src/main/resources/direct-file/` unless they start with `scripts/`, `workbench/` or `docs/`.

The inventory, one row per file with what it is, is the "What is here" section of the Virginia
README, `docs/virginia/README.md` (it ships in the handoff, so it is the one copy). In short:
the rules are ten modules, `facts/virginia*.xml`, one per section of the return, with every
tax-year figure in `virginiaConstants.xml` and the localities in `virginiaLocalities.xml`; the
screens are `flow/your-taxes-virginia.xml` with their Spanish in `locales/virginia_es.yaml`; the
browser scripts are `website-static/js/virginia-*.js` behind the one entry point `virginia.js`;
the demo households are one manifest, `website-static/data/virginia-demos.json`; the Workbench is
`workbench/`; the checks are `scripts/` on the shared `scripts/lib/vafacts.py`, and the
independent model of the rules is `scripts/lib/virginia-model.cjs`, written from the Code and
deliberately not on that library; the tests are `VirginiaSpec.scala` and the browser checks; the
decisions are `docs/adr/`; the maps a state reads are `handoff/POLICY_MAP.md` and
`handoff/FORM_760_FIELD_MAP.md`.

`docs/changing-the-return.md` turns this into "to change X, go here, then run Y".
`docs/surfaces.md` says what the admin pages are: the Scenario menu, Browse All, Author Mode,
Fact Explorer and the Workbench.

## Three rules the code keeps

1. **Virginia reads only what the federal return exports to states.** The facts flagged for
   state systems in the IRS dictionary, and the Form 1040 XML the state API delivered.
   `scripts/check-virginia-exports.py` fails on anything else. The residency answer is the one
   exception: it gates the screens and computes nothing.
2. **Every tax-year figure sits in the constants module**, `facts/virginiaConstants.xml`, each
   with a tax year, and no date or dollar literal appears in any other module. Every locality is listed exactly once in each locality
   switch, with no default, so an unlisted locality fails loudly. `scripts/check-virginia-constants.py`
   enforces both.
3. **Every rule names its law.** A fact that computes a line or a figure cites its section of
   Va. Code Title 58.1 and its line of the Form 760 instructions in its `<Description>`; a helper
   (a rate as a percent for a sentence, a screen's gate) says which rule or screen it serves.
   A fact with no `<Description>` at all fails `scripts/check-virginia-constants.py`.

## Making a change

- One policy concept per commit, on a branch, rebased onto `main` before merging; never
  force-push `main`. The subject names the rule and the body cites the law, the form line, the
  figure and its source, and what the test proves. The commit log becomes the handoff's changelog,
  the document a state engineer reads first, so it has to read as a narrative. `report/PLAN.md` §9 is the full
  statement of what "done" means.
- A new fact gets a `<Name>`, a `<Description>` with its citation, and a row in
  `handoff/POLICY_MAP.md`. A changed figure gets a source. A changed sentence on a screen gets
  its Spanish re-keyed (the merge script names the stale key).
- The federal screens stay what they were. The one federal touch on the rules is `va` in the
  residence question; ADR-002 lists every other IRS file the change set touches, and a change
  to any of them is a reason to pause.
- Before committing anything that touched the Virginia site:

```bash
make check                          # the no-JVM checks, about a minute
```

- Once at the end of a round, not after every edit: `make test`, and with the site
  running, `make cases` and `make a11y`. Then `make stats STATS=--check` if
  a count in the prose may have moved.
- `make handoff-verify` proves the series still applies to a fresh clone of the IRS repository
  at the pin; run it before sharing the handoff package. `make bump-pin` moves one IRS pin with
  a drift report of the IRS files the Virginia commits also touched.

## Things that cost time, so you do not pay them again

- **The watcher regenerates on every save**, including saves our own scripts make. A browser
  check that starts during a regeneration sees half a site; wait for `[success]`.
- **USWDS radios are visually hidden inputs.** In Playwright, click the label, not the input.
  The combo box is driven by typing into `.usa-combo-box__input` and clicking a list option.
- **`page.waitForURL` and `networkidle` never settle** on the dev server because of live
  reload; wait for an element or a fixed delay.
- **The port's own Playwright (1.62) has no Chromium build for macOS 13.** The Virginia checks
  carry a pinned Playwright in `stack/browser-tools/` for that reason.
- **Form Builder content-addresses locale keys on the English text.** Change a sentence and
  its Spanish key changes; the merge script fails naming the stale key so no page shows
  `??placeholder??`.
- **FlowSpec wants `{category}-{subcategory}.xml` and matching routes**, and counts the five
  federal categories. A new module goes under one of them, and the step indicator then counts
  26 sections, which `tests/smoke.spec.js` says.
- **A Scala.js build reorders the engine bundle.** Every `make dev` and `make site` rebuilds
  `vendor/fact-graph/factgraph-3.1.0.js` in a different order with no change of meaning, so
  `make copy-fg` keeps the vendored copy when only the order differs. A diff in that file is a
  real rebuild.
- **The counts in the prose are checked.** `make check` fails on a stale "N facts" or "N
  households" sentence, on a demo's result quoted wrong, and on a `/va…` path the docs cite
  that the XML no longer has.
- **The demo households are generated.** Edit `website-static/data/virginia-demos.json`, then
  `python3 scripts/virginia-demos.py build`; `make check` fails if a scenario file drifts from it.
