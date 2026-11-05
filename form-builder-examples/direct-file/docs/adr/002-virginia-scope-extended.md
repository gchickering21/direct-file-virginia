# ADR-002: The Virginia scope, extended: the credits, the military and unemployment subtractions, the spouse; the lottery subtraction removed

Licence: the Virginia additions are CC0 1.0, public domain, like the IRS code they sit on (the repository's `LICENSE`).

- Created: 2026-11-02
- Published: 2026-11-02
- Status: accepted (class project, Digital Public Infrastructure, Georgetown; not an IRS or Virginia Tax decision)
- Amends: [ADR-001](001-virginia-state-return.md), whose decision, integration rule and non-goals stand
- Amended by: [ADR-003](003-the-layout-for-growth.md), which split `virginia.xml` into the `facts/virginia*.xml` modules and made the constants block the `virginiaConstants.xml` module; the file names in this record are as of its date

## Primary author(s)

Graham Chickering, with Claude (Anthropic) as the engineering assistant.

## Problem statement

ADR-001 scoped the Virginia return to a single W-2 filer and seven Form 760 lines, and left
out the credits, the spouse, and every Schedule ADJ item. Building the rest of Lines 1 to
36 raised questions ADR-001 did not answer: which of the left-out rules the federal export
can actually feed; what to do when a credit and a deduction exclude each other and the
engine has no cycles; what a second filer looks like to a state that is handed only the
exported facts; and which of the IRS's own files the change set may touch. This record
answers them and fixes the scope as it now stands.

## Decisions

1. **The three low-income credits are in** (Va. Code § 58.1-339.8; Form 760 Line 23;
   Schedule ADJ Lines 10 to 17): the Credit for Low-Income Individuals, the Virginia
   Earned Income Credit (20% of the federal one) and the Refundable Virginia Earned Income
   Credit (15% for 2024). All three come from facts the federal return exports (the
   federal EIC, the exemption count, AGI), so nothing is asked. Because § 58.1-339.8(D)
   bars every one of them when the filer or the spouse claims the age deduction, a Section
   B exemption or the military basic pay subtraction, and the instructions tell the filer
   to take whichever helps more, `virginia.xml` computes Lines 4 to 16 both ways
   (`/vaWithoutCredit…`, `/vaWithCredit…`) and `/vaClaimsLowIncomeCredit` picks the way
   with less tax. The Form 760 line facts (`/vaTotalSubtractions`, `/vaTotalDeductions`,
   `/vaIsBelowFilingThreshold`, `/vaTax` and the rest) are Switches over the two, so Line 9
   is Line 1 minus Line 8 by construction whichever way the return files. The summary names
   what the credit replaced, or the credit passed over.

2. **The military subtractions are in**, asked behind one gate question: basic pay (code
   38, § 58.1-322.02(15)), capped at the exported household `/wages` because the per-filer
   wage facts are not exported; and military benefits (code 60, § 58.1-322.02(18)), capped
   at the sum of the return's exported 1099-R taxable amounts (`/vaForm1099RTaxableAmounts`),
   since the subtraction is of an amount in federal AGI. Both are asked because neither
   basic pay nor the federal "military retirement plan" answer is identifiable in the
   export.

3. **The unemployment subtraction is in** (Schedule ADJ code 37), with no question: Direct
   File exports each 1099-G's amount and the amount repaid in the year to states, and the
   subtraction is their difference. The subdivision of § 58.1-322.02 is cited only by
   section; Virginia Tax should confirm it.

4. **The lottery subtraction is removed** (code 24, § 58.1-322.02(7)). The Code subtracts
   an amount "included therein", in federal AGI, from a prize under $600. Direct File has
   no gambling or other-income fact, so no prize is ever on Line 1, and a filer with one is
   outside Direct File's scope; the question built in October could only subtract what
   was never added. The facts, the screen, the demo answer and the Spanish are gone; a
   comment at the subtractions block in `virginia.xml` records why. The question count on
   the Virginia screens is four again: locality, military service, Commonwealth Savers,
   untaxed purchases.

5. **The spouse on a joint return is in** for Line 4 and Line 12. The federal
   `/secondaryFiler` pointer is not exported, so `/vaSpouse` finds the filer whose exported
   `isPrimaryFiler` is false. The spouse's 65-or-older, blind and date-of-birth facts give
   the four Section B boxes and the spouse's half of the age deduction
   (`/vaSpouseAgeDeductionAllowed`). Assumption, documented in that fact: each spouse's
   $12,000 is reduced by the same joint excess over $75,000, the Code's per-individual
   text; if Virginia Tax's worksheet reduces the combined $24,000 once, that one fact
   changes. The credit comparison weighs both filers' items.

6. **Withholding counts only the W-2s whose box 15 names Virginia.** The box 15 answer is
   not exported, but the W-2's MeF state code (`/formW2s/*/xmlStateCd`) is, and Direct File
   sets it from the residence answer whenever box 15 is filled in (a W-2 from another
   state is a federal knockout). So `/formW2s/*/vaStateIsVirginia` is "a resident return
   and a state code present"; the ScalaTest asserts the strict `"VA"`. Line 19b is not
   split out: which filer a W-2 belongs to is not exported.

7. **Lines 20 to 22 come from a stand-in for Virginia Tax's records**
   (`website-static/data/virginia-records.json`, keyed by last name and date of birth,
   applied on any Virginia screen). The facts stay writable so the filer can correct them.
   A state-run filer fills these from its books; the scenario files carry $0, so the
   ScalaTest pins the demos before those payments.

8. **The locality is looked up from the federal ZIP code**
   (`website-static/js/virginia-locality.js` over a table built from the Census Bureau's
   2020 ZCTA-to-county file). When the ZIP lies in one city or county the answer is filled
   in and confirmed; when it crosses a line the screen names the localities and asks. A
   state would geocode the street address.

9. **Two rules of shape, enforced by `scripts/check-virginia-constants.py`.** Every
   tax-year figure, date and rate-schedule amount sits between the `constants:begin` and
   `constants:end` markers in `virginia.xml`, one fact each with a `<TaxYear>`; a `<Day>`
   or non-zero `<Dollar>` literal anywhere else fails. The two locality switches
   (`/vaLocalityCode`, `/vaUseTaxRate`) list every option of `/vaLocalityOptions` exactly
   once and have no default, so an unlisted locality fails loudly rather than taking `""`
   or 5.3%.

10. **The workbench is the policy-staff tool** (`workbench/`, `make workbench`, port 3011).
    Policy staff change a value or a rule in plain language, with a source for every
    number; the worked examples rerun on every edit; a policy reviewer and an engineer who
    is not the author approve; publishing splices the change into `virginia.xml` and
    reruns everything. Engineering owns the screens, through the workbench's requests.
    `workbench/README.md` is its record.

## The federal-file touch list

ADR-001 said the only edit to a federal file was `va` in `/scopedStateOptions`. The honest
list is longer. These are the files of the IRS's own that the Virginia commits change
(derived from `git log --name-only` since the subtree squash plus the working tree); every
other Virginia file is new. Nothing in the engine or the libraries (`fact-graph/`,
`form-builder/`, `taxpert/`) is touched.

| File | What changed | Why |
|---|---|---|
| `facts/constants.xml` | `va` in `/scopedStateOptions` | the one-line change the IRS made whenever a state joined |
| `flow/you-and-your-family-about-you.xml` | `<option value="va">Virginia</option>` on the residence question | the same change on the screen |
| `flow/index.xml` | `<module src="./your-taxes-virginia.xml"/>` | registers the Virginia flow module |
| `codemod/emit.ts` | hand-written flow modules (those without the GENERATED banner) survive `make transpile` and keep their place in `index.xml`; `PORT_STATES` adds the residence option | so regenerating the federal flow cannot drop the state return |
| `codemod/export-scenarios.ts` | `virginia_*.json` scenarios are not deleted on regeneration | the demo households share the scenarios directory |
| `locales/en.yaml`, `locales/es.yaml` | the "Your Virginia return" section title; the `virginia:` strings for the masthead, the demonstration strip and the five-step track | the Virginia chrome's text, in both languages |
| `locales/flow_en.yaml`, `locales/flow_es.yaml` | the Virginia screens' generated keys; the Spanish merged in by `scripts/merge-virginia-es.py` | generated files, committed as the IRS commits them |
| `templates/fragments/usa-step-indicator.html` | on `/your-taxes/virginia/` routes, five labelled Virginia steps in place of the 25 federal segments | the Virginia track |
| `website-static/js/fg-components.js` | one import, `virginia.js`, which imports the Virginia scripts (`virginia-demo-link.js`, `virginia-corrections.js`, `virginia-records.js`, `virginia-locality.js`, `virginia-combo-box.js`, `virginia-sign.js`, `virginia-save.js`, `virginia-chrome.js`) | the Virginia behaviour loads with the runtime and the IRS's file carries one line for the state; each script does one thing and none writes a fact except sign and save |
| `website-static/styles/main.css` | `@import "components/virginia.css"` | the Virginia look on its routes |
| `src/main/scala/gov/irs/directfile/Main.scala` | `basePath` and `outSubdir` read `-Dsite.basePath`, default `/app/direct-file` | the hosted copy of the demo site sits under a static host's own prefix (`docs/hosting.md`); every local build is unchanged |
| `tests/smoke.spec.js` | the step indicator counts 26 sections, not 25 | one Virginia section joins the five federal categories |
| `Makefile` | `workbench` and `workbench-check` targets; `transpile-es` re-merges the Virginia Spanish; `copy-fg` keeps the vendored engine bundle when a fresh build only reorders it | the tool, the reseed, and no four-megabyte no-op diffs |

## The test layers

From cheap to dear, each one a Makefile target at the repository root:

1. **Fast checks, no JVM** (`make check`): the Virginia XML modules against the IRS schemas;
   the export rule (`check-virginia-exports.py`, 17 federal facts read, and the workbench's
   stand-ins kept in step); the constants module and the locality listing
   (`check-virginia-constants.py`); the Spanish keys (`merge-virginia-es.py --check`); the
   counts and demo results in the prose (`virginia-stats.py --check`); the fact paths the docs
   cite (`check-virginia-docs.py`); the demo scenario files against their manifest
   (`virginia-demos.py check`); and the workbench's worked examples (`workbench/check.mjs`,
   fifteen examples, each also run through the independent model).
2. **The 50-household harness** (`make cases`, site running): `virginia-cases.py`
   generates the households, `virginia-cases.cjs` drives the site and compares every Form
   760 line with `scripts/lib/virginia-model.cjs`, a model of the rules written from the
   Code rather than from the XML. Thresholds and caps are hit exactly, both sides of each.
3. **VirginiaSpec** (`make test`): the four demos' lines pinned, the same 50
   households through the full dictionary in the engine, and the invariants of any Form
   760 this module can produce.
4. **axe** (`make a11y`): WCAG 2.0 and 2.1 A and AA over every Virginia screen,
   with a correction round open and the military questions answered yes.
5. **The port's own suite and `make handoff-verify`**, which clones the IRS repository at
   the pin, applies the patch series and runs layer 1 inside it.

## Consequences

- The Virginia screens ask four questions; everything else on the return is federal, from
  a document, from Virginia's records, or arithmetic.
- The Virginia modules other than the localities are 167 facts and `virginiaLocalities.xml` 9. Half of the first are
  the both-ways computation; a state that accepted a cycle-free engine could not avoid it.
- Two readings of the law are flagged for Virginia Tax rather than settled here: the
  joint-return phase-out of the age deduction (decision 5) and the subdivision for the
  unemployment subtraction (decision 3).
- The federal-file touch list above is the honest cost of a state return on this port:
  three one-line registrations, two codemod guards so regeneration keeps the state's
  files, and the chrome. ADR-001's claim of one federal edit is superseded by it.
