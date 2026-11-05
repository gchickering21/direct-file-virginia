# The Virginia return on this port

A Virginia resident return computed from the federal return, as a few prototype rules.
Decision records: [`../adr/001-virginia-state-return.md`](../adr/001-virginia-state-return.md)
(the scope and the integration rule) and
[`../adr/002-virginia-scope-extended.md`](../adr/002-virginia-scope-extended.md) (the credits,
the spouse, the military and unemployment subtractions, what was removed, and the IRS files the
change set touches) and [`../adr/003-the-layout-for-growth.md`](../adr/003-the-layout-for-growth.md)
(why the rules are modules, the single manifest of the demo households, what was not generalised). Written
for a state engineering team as much as for the class that built it.

## What is here

One section per file or group of files, in the order a reader meets them: the rules, the screens,
the chrome, the browser scripts, the data, the Spanish, then the checks and the tests. Paths are
under `src/main/resources/direct-file/` unless they start with `scripts/`, `src/test/` or `workbench/`.

### `facts/virginia*.xml`: the rules

Ten modules, 176 facts, one module per section of the return, loaded as one dictionary with the federal modules. Nine of them hold the return (167 facts): `virginiaConstants` (every tax-year figure), `virginiaFiler` (the gate, the filing status, the spouse), `virginiaIncome` (Lines 1 to 9), `virginiaDeductions` (11 to 15), `virginiaTax` (16), `virginiaCredits` (23), `virginiaPayments` (19a to 28), `virginiaResult` (33, 35, 36), `virginiaScreens` (what the screens need and the return does not); the tenth, `virginiaLocalities`, is the next section; a dependency into another module names it with `module="…"` ([ADR-003](../adr/003-the-layout-for-growth.md)). Together: Form 760 from Line 1 to Line 36 for a W-2 filer, single or joint, tax year 2024: the deductions and exemptions for both filers (the spouse's 65-or-older, blind and date-of-birth items on a joint return, found from the exported `isPrimaryFiler` because `/secondaryFiler` is not exported), the age deduction in two halves, the rate schedule, withholding from the W-2s whose MeF state code names Virginia, the payments Virginia Tax holds, the unemployment and military subtractions, the Commonwealth Savers deduction, **the low-income credits** (Schedule ADJ Lines 10 to 17), the use tax, the amount owed or refunded, and the few facts the screens need (`/vaDeclarationSigned`, `/vaRecordsKey`, `/vaRecordsMatched`, the correction target). Lines 4 to 16 are computed twice, keeping the deductions the credits bar and giving them up, and the Form 760 line facts are Switches over the two, so the return claims whichever leaves less tax and Line 9 is Line 1 minus Line 8 either way (see "The low-income credits"). Every fact names its section of Va. Code Title 58.1 and its line of the 2024 Form 760 instructions. Every tax-year figure, date and rate-schedule amount sits in `virginiaConstants.xml`, and no other module may carry a date or a dollar literal (see "Two rules of shape").

### `facts/virginiaLocalities.xml`: the localities

9 facts: Virginia's 133 cities and counties with the 3-digit locality code and the consumer's use tax rate (5.3%, 6%, 6.3%, 7%) from the 2024 instructions, each listed explicitly in both switches with no default case, so an unlisted locality leaves the code and the rate incomplete rather than silently taking `""` or 5.3%. Virginia has no local income tax; locality enters the return only here.

### `flow/your-taxes-virginia.xml`: the screens

Fourteen screens, shown only to a filer who answered Virginia on the federal residence question: the handoff from the federal answers to Virginia (the scope paragraph behind a disclosure, a "Start my Virginia return" lead, and "Resume from a file"); what Virginia already has, as cards by source (Virginia Tax's own records first, with a card saying whether the records stand-in found a match, then the W-2s the employer filed with Virginia and the IRS, then the federal return); **a correction round** (is everything right? → what needs correcting → correct the date of birth, a whole W-2, or a payment Virginia's records show on Lines 20 to 22 → what it changed); the four questions no one reports, counted 1 to 4, each amount question with a hint and a note when the entry exceeds its cap, and a running estimate panel on every question screen (locality on January 1, filled in from the ZIP code when it lies in one locality, with its name, code and use-tax rate confirmed; military basic pay and retirement; Commonwealth Savers contributions; untaxed purchases, priced at the rate for the named locality); the return, the amount owed or refunded first (only the row that applies), the four answers each with a Change link, a federal-versus-Virginia side-by-side, Line 1 to Line 36, a "why this number" disclosure for Lines 4, 7, 12, 16, 23 and 33 with the live sub-amounts, and Print and Download buttons; and signing to the Commonwealth, the declaration on a required checkbox and a "Send to Virginia Tax" button that sets `/vaDeclarationSigned` and shows that nothing was transmitted.

### The Virginia chrome: `templates/fragments/usa-banner.html`, `templates/fragments/va-masthead.html`, `templates/fragments/usa-step-indicator.html`, `templates/fragments/js-templates.html`, `website-static/styles/components/virginia.css`, `website-static/js/virginia-chrome.js`

Virginia's own chrome on `/your-taxes/virginia/` routes: a navy footer that says the prototype is not Virginia Tax's, in place of the IRS identifier (drawn from `js-templates.html`, the first overridable fragment after the scaffold's inline footer, which also renders the `<template id="va-strings">` the Virginia scripts read their words from, per language); a navy masthead ("Commonwealth of Virginia", a dogwood emblem drawn for the prototype, not the seal), a standing demonstration strip, a translated language switcher, and a five-step Virginia track in place of the U.S. government banner, the IRS logo band and the 25-segment federal step indicator. `virginia-chrome.js` gives the scaffold's hidden page `<h1>` the masthead's name on these routes. Navy carries the page and orange only punctuates it; the stylesheet also stacks the handoff under 480px, wraps the track at 320px, and carries the print rules that make the summary a readable return. Design: the virginia-theme mockup in the repository's `report/mockups/`, course material outside the handoff.

### The locality picker: `templates/nodes/inputs/select.html`, `website-static/js/virginia-combo-box.js`

This app's override of Form Builder's select input: the same `<select>` inside a USWDS combo box, so the 133-locality question is typed into and filtered. USWDS keeps the select in sync and fires `change` on it, which is what the runtime listens for. The script covers the two things USWDS and the runtime cannot see in each other: it sets the visible text from the fact after USWDS enhances the select and on every `fg-update` (so a value filled in from the ZIP code shows without a reload), mirrors the runtime's `aria-invalid` and `aria-describedby` from the hidden select onto the visible input and moves focus there, and marks the locality callout and ZIP notes `aria-live="polite"`.

### Corrections: `website-static/js/virginia-corrections.js`, `website-static/js/virginia-strings.js`

The "here is what it changed" view: snapshots the Form 760 lines and the correctable facts when a correction screen opens (tagged with the identity and the graph it came from, and dropped when either changes), and on the corrections screen shows what you owe now versus before, each corrected item was → now (cents kept, names escaped), and the lines that moved. Every word comes from the `virginia.ui.*` locale keys through `virginia-strings.js`, and amounts and dates are formatted for the page's language. Presentation only; it writes no fact.

### The one federal touch: `facts/constants.xml`, `flow/you-and-your-family-about-you.xml`

The one federal touch on the rules: `va` added to `/scopedStateOptions` and to the residence question, the change the IRS made whenever a state joined. The residence question is transpiler output, so the option is added by `PORT_STATES` in `codemod/emit.ts` and survives `make transpile`; that run also keeps `flow/your-taxes-virginia.xml` (any flow module without the GENERATED banner) and its place in `index.xml`, and `make export-scenarios` keeps `scenarios/virginia_*.json`. The full list of the IRS's own files the change set touches (the chrome, the locales, the smoke test's section count) is in ADR-002.

### The demo households: `website-static/data/virginia-demos.json`, `scripts/virginia-demos.py`, `scenarios/virginia_demo_1_…` to `scenarios/virginia_demo_4_…`

The four hand-checked households, described once in the manifest (the IRS scenario each starts from, the dozen keys that change, the lines the engine must compute, the result the page shows) and written out as scenario files by `virginia-demos.py build` (`check` fails if one drifts). Fictional Virginians (names, addresses and employers invented), loadable from the Scenario menu as **Virginia Demo 1** to **Virginia Demo 4**. Demos 3 and 4 leave the locality unanswered, so the ZIP code fills it in (Demo 3) or the screen asks (Demo 4). Lines 20 to 22 are $0 in the files; the records stand-in fills them on the page.

### ZIP code to locality: `website-static/js/virginia-locality.js`, `website-static/data/virginia-zip-localities.json`, `scripts/build-virginia-zip-localities.py`

The locality from the federal ZIP code (`/address/postalCode`, exported to MeF). 907 Virginia ZIPs from the Census Bureau's 2020 ZCTA-to-county relationship file; Form 760's locality codes are the FIPS codes, so the join is direct. 619 ZIPs lie in one city or county and fill the answer in (and its name, for the "your address now points to…" note when a confirmed answer no longer matches); 288 cross a line by at least 1% of their land, and the screen names the localities and asks. The filer confirms either way; an answer already given is never overwritten. A state would geocode the street address instead.

### The records stand-in: `website-static/data/virginia-records.json`, `website-static/js/virginia-records.js`

A stand-in for Virginia Tax's own records: Lines 20 to 22 (estimated payments, last year's overpayment, extension payments) filled on any Virginia screen, matched by last name and date of birth. The state-side half of "the government already knows". Applied once per identity: `/vaRecordsKey` remembers who the stand-in was last applied for, and the lines are written (the record, or $0 when there is none) only when that changes, so a correction the filer makes on the correct-records screen is kept; `/vaRecordsMatched` drives the card on the what-is-known screen.

### The entry point: `website-static/js/virginia.js`, `website-static/js/virginia-graph.js`

The one entry point `fg-components.js` imports, which imports the scripts below in order; and the two helpers they share (read a fact as a string, save and announce an update).

### Demo links: `website-static/js/virginia-demo-link.js`

A `?demo=1` to `?demo=4` (from the manifest) or `?scenario=<file name>` link: fetches that file from `resources/scenarios/`, stores it where the runtime keeps the graph (`sessionStorage`, as the browser checks seed it) and reloads without the parameter. The links `make demo-links` prints. Presentation only; writes no fact.

### Sign, save, resume: `website-static/js/virginia-sign.js`, `website-static/js/virginia-save.js`

The sign screen's "Send to Virginia Tax" button: it refuses without the declaration box checked and otherwise sets `/vaDeclarationSigned`, the one fact it writes; nothing leaves the browser. "Download your answers" on the summary writes the serialized Fact Graph (what the Scenario modal copies) as a file, and "Resume from a file" on the intro loads one back through the runtime's `loadFactGraph()`.

### The Spanish: `locales/virginia_es.yaml`, `scripts/merge-virginia-es.py`, `locales/en.yaml` and `locales/es.yaml` (`virginia.*`)

Spanish for the fourteen Virginia screens, hand-written, merged into the generated `flow_es.yaml` (which `make transpile-es` reseeds from Direct File's Spanish, then re-merges this file as its last step). Keys are content-addressed on the English text: change the English, re-copy the key. The chrome's words and everything the Virginia scripts show (`virginia.ui.*`) live in the app's own `en.yaml` and `es.yaml` instead.

### The library under the checks: `scripts/lib/vafacts.py`

The library under the four check scripts: the modules, every fact with where it sits, each dependency resolved the way the engine resolves it, the federal export flags, the split routes. Each script is then only its rule.

### The export rule: `scripts/check-virginia-exports.py`

Fails if a Virginia module reads a federal fact the federal return does not export to a state (see "The integration rule"), following relative (`../x`), Find and Filter dependencies; and fails if `workbench/federal-inputs.json` lacks a stand-in for one of them or stands in one nothing reads.

### The two rules of shape: `scripts/check-virginia-constants.py`

The two rules of shape: every tax-year figure in `virginiaConstants.xml`, each with a `<TaxYear>`, and no `<Day>` or non-zero `<Dollar>` literal in any other module; every locality listed exactly once in each locality switch, with no default (see "Two rules of shape").

### The docs against the code: `scripts/check-virginia-docs.py`, `scripts/virginia-stats.py`

The docs against the code. The first fails if a fact path a document cites (this README, the ADRs, the handoff policy map, field map, README and brief) is not a fact in either module, and warns if a Form 760 line a fact names has no row in the policy map. The second prints the true counts (facts, screens, questions, demos, households, axe routes, workbench examples) and with `--check` fails on any number in the prose that disagrees; `make stats` and `make stats STATS=--check` at the repository root.

### The 50 households: `scripts/virginia-cases.py`, `scripts/virginia-cases.cjs`, `scripts/lib/virginia-model.cjs`, `src/test/resources/virginia-cases/`

The 50 households. The generator writes each as a scenario file (and `meta.json` with the model's inputs); the Playwright driver loads each into the site and compares every Form 760 line with `virginia-model.cjs`, a model of the rules written from the Code and the instructions rather than from the XML, so the two can disagree. The same files are committed under `src/test/resources` for VirginiaSpec.

### The ScalaTest: `src/test/scala/gov/irs/directfile/VirginiaSpec.scala`

ScalaTest, run by `make test`: the four demos' lines as the manifest's `expect` pins them (before the records stand-in's payments, which the scenario files do not carry), every generated household loaded through the port's full dictionary, and the invariants of any Form 760 this module can produce: owe or refund but never both, tax never negative, Line 9 = Line 1 − Line 8, Line 15 from Lines 9 and 14, a credit claimed only when it beats keeping the deductions, withholding exactly box 17 of the W-2s whose MeF state code is `VA`, the spouse's items only on a joint return.

### The axe pass: `scripts/virginia-a11y.cjs`

axe-core, WCAG 2.0 and 2.1 A and AA, over the twenty Virginia screens (read from the flow and cut the way the one-question-per-page build cuts them, so a new screen is scanned without a list to edit) in English and in Spanish (`/es/`), with a correction round open and every amount question answered yes, plus the locality page in its error state (Continue with nothing chosen) and the sign page after an unsigned Send. The whole document is scanned; violations inside the IRS scaffold's or the workspace's own chrome (the `OUTSIDE` list in the script) are reported separately and do not count. Run it against `make dev` (which serves the split routes the script lists).

### The Workbench: `workbench/`

The rules workbench for policy staff; see "The workbench" below and [`../../workbench/README.md`](../../workbench/README.md).

## See it

```bash
make bootstrap   # once
make dev         # http://localhost:3008/app/direct-file
```

1. Open `/your-taxes/virginia/virginia-intro/?demo=1`, which loads Riley's household and lands on
   the Virginia intro (`?demo=2` to `?demo=4` for the others; `?scenario=<file name>` for any file in
   `scenarios/`). Or click **Scenario**, choose **Virginia Demo 1 Riley Rappahannock Single 33k**
   under Existing scenarios, **Load scenario**.
2. Open `/your-taxes/virginia/virginia-summary/`, or step forward to the "Your Virginia
   return" section. **Browse All** lists the fourteen Virginia screens with the federal ones.
3. Load **Virginia Demo 2 Morgan Shenandoah Age 65 56k** to see the age deduction and its
   phase-out.
4. Load **Virginia Demo 3 Jordan Elizabeth Hoh 20k Eitc** to see the unemployment benefits
   subtracted and the Refundable Virginia Earned Income Credit claimed, neither asked for, and
   the locality filled in from ZIP 23504.
5. Load **Virginia Demo 4 Taylor York Single 27k Military** for the military basic pay
   subtraction, and a ZIP (23185) that crosses three localities, so the screen asks.

The Virginia screens are gated on `/vaIsResident`. With no scenario loaded, or a resident of
another state, the flow runtime skips them and you land on the next federal page. That is
the gate working, not a missing page.

## The four hand checks

| | Household 1 | Household 2 | Household 3 | Household 4 |
|---|---|---|---|---|
| Filer | Riley Rappahannock (fictional), Richmond City (locality 760); single, born 1997-10-03, wages $33,333 and $1,000 of interest, $300 withheld; Virginia's records show $200 of estimated payments | Morgan Shenandoah (fictional), Charlottesville City (540); single, born 1955-05-05, wages $56,000 and $1,000 of interest, $300 withheld; Virginia's records show $150 of last year's overpayment applied | Jordan Elizabeth (fictional), Norfolk City (710, from ZIP 23504); head of household, born 1975-07-19, blind, one foster child claimed; wages $20,000, $200 withheld; two 1099-Gs of $1,000 each for unemployment benefits; $500 of student loan interest; a $4,213 federal earned income credit | Taylor York (fictional), Williamsburg ZIP 23185 (crosses three localities; Taylor chooses); single, born 1997-10-03, on active duty; wages $27,000 from DFAS and $1,000 of interest, $650 withheld |
| Their answers | no military pay; no 529; $400 of untaxed purchases | no military pay; $3,000 into a Commonwealth Savers account; nothing untaxed | no to all four | $24,000 of basic pay; no to the rest |
| Line 1 federal AGI | $34,333 | $57,000 | $21,500 | $28,000 |
| Line 4 age deduction (§ 58.1-322.03(5)) | $0 | $12,000 − ($57,000 − $50,000) = $5,000 | $0 | $0 |
| Line 7 Schedule ADJ subtractions (codes 37, 38; § 58.1-322.02) | $0 | $0 | $2,000 unemployment benefits (code 37, from the 1099-Gs on the federal return) | $15,000 − ($24,000 − $15,000) = $6,000 basic pay (code 38) |
| Line 9 Virginia AGI | $34,333 | $52,000 | $19,500 | $22,000 |
| Line 11 standard deduction (§ 58.1-322.03(1)(b)) | $8,500 | $8,500 | $8,500 | $8,500 |
| Line 12 exemptions (§ 58.1-322.03(2)) | $930 | $930 + $800 = $1,730 | $930 × 2 = $1,860 (the $800 blind exemption given up for the credit) | $930 |
| Line 13 Commonwealth Savers deduction (§ 58.1-322.03(7)) | $0 | $3,000 (under the $4,000 cap) | $0 | $0 |
| Line 15 taxable income | $24,903 | $38,770 | $9,140 | $12,570 |
| Line 16 tax (§ 58.1-320) | $720 + 5.75% × $7,903 = $1,174.42 → **$1,174** | $720 + 5.75% × $21,770 = $1,971.78 → **$1,972** | $120 + 5% × $4,140 = **$327** | $120 + 5% × $7,570 = $498.50 → **$499** |
| Line 19a withheld (W-2 box 17, box 15 Virginia) | $300 | $300 | $200 | $650 |
| Lines 20, 21, from Virginia's records | $200 estimated | $150 overpayment applied | — | — |
| Line 23 low-income credit (§ 58.1-339.8) | $0 | $0 | **$632** refundable (below) | $0 |
| Line 27 tax you owe, or Line 28 overpayment | owe $674 | owe $1,522 | overpaid $505 | overpaid $151 |
| Line 33 use tax | $400 × 6% (Central Virginia region) = $24 | $0 | $0 | $0 |
| Line 35 amount you owe, or Line 36 refund | **owe $698** | **owe $1,522** | **refund $505** | **refund $151** |

Household 3's credit, Schedule ADJ Lines 10 to 17: family VAGI $19,500 is under the $20,440 poverty
guideline for two, so the Credit for Low-Income Individuals is $300 × 2 = $600, nonrefundable; 20% of
$4,213 is $843, nonrefundable and so worth only the $327 of tax; 15% of $4,213 is $632, refundable.
$632 wins. Claiming any of the three gives up the blind exemption (Va. Code § 58.1-339.8(D)(4)), which
would have made the tax $287: $287 against $327 − $632 = −$305, so the return claims the credit.

The engine returns exactly these on the summary page. VirginiaSpec pins the same lines before the
records stand-in's payments (Household 1 owes $898 and Household 2 $1,672 in the engine alone).

## The low-income credits

Form 760 has three credits for people with low incomes, and a filer may claim one (Va. Code
§ 58.1-339.8, Schedule ADJ Lines 10 to 17): the Credit for Low-Income Individuals, $300 a person
when family VAGI is at or under the poverty guideline; the Virginia Earned Income Credit, 20% of
the federal one; and the Refundable Virginia Earned Income Credit, 15% of the federal one, paid
even past the tax. The first two cannot exceed the tax. All three come from the federal return
(the EITC from Form 1040 line 27, exported to MeF), so the filer is asked nothing; the summary
says which one was claimed and why.

The catch is § 58.1-339.8(D): a return that claims the age deduction, the 65 or older or blind
exemption, or the military basic pay subtraction, for either filer, cannot claim any of them, and
the instructions tell the filer to take whichever helps more. Fact graphs have no cycles, so
the income, deductions and tax modules compute Lines 4 to 16 both ways (`/vaWithoutCredit…`, `/vaWithCredit…`), the credits module compares
the tax less the credit with the tax keeping the deductions (`/vaClaimsLowIncomeCredit`), and the
Form 760 lines (`/vaTotalSubtractions`, `/vaTotalDeductions`, `/vaIsBelowFilingThreshold`, `/vaTax`
and the rest) are Switches over the two, so each line is the winner's and the arithmetic between
lines holds whichever way the return files. The summary names what was given up, or, when keeping
a deduction was worth more, the credit that was passed over. Out of scope: a dependent's own
income in family VAGI (taken as $0), married filing separately, and the National Guard and federal
and state employee subtractions, which bar the credits too.

## The spouse on a joint return

The federal `/secondaryFiler` pointer is not exported to states, so `/vaSpouse` finds the filer
whose exported `isPrimaryFiler` is false, and the spouse's exported date of birth, 65-or-older and
blind facts give the four Section B boxes on Line 12 (`/vaSpouseAge65OrOlder`, `/vaSpouseIsBlind`)
and the spouse's half of Line 4 (`/vaSpouseAgeDeductionAllowed` beside
`/vaPrimaryFilerAgeDeductionAllowed`; `/vaAgeDeductionAllowed` is their sum). One reading of the
law is assumed and written into that fact: each spouse's $12,000 is reduced by the same joint
excess over $75,000, the Code's per-individual text. If Virginia Tax's Age Deduction Worksheet
instead reduces the couple's combined $24,000 once, `/vaSpouseAgeDeductionAllowed` is the one fact
to change. The credit comparison weighs both filers' items. Not built for the spouse: the spouse
tax adjustment (Line 17) and the spouse's share of withholding (Line 19b), both in the gap list.

## What the federal return feeds without a question

Two Schedule ADJ amounts come straight from exported federal documents:

- **Withholding, Line 19a.** The sum of box 17 across the W-2s whose box 15 names Virginia. The
  box 15 answer itself (`/formW2s/*/state`) is not exported, but the W-2's MeF state code
  (`/formW2s/*/xmlStateCd`, the StateAbbreviationCd a state receives) is, and Direct File sets it
  from the residence answer whenever box 15 is filled in, knocking the return out when a W-2 is
  from another state. So `/formW2s/*/vaStateIsVirginia` tests "a resident return and a state code
  present", which equals "the code is VA" on every return this module can see; VirginiaSpec asserts
  the strict form. A W-2 with box 15 blank and an amount in box 17 (three of the IRS's own fixtures
  do this) is excluded.
- **Unemployment benefits, Schedule ADJ code 37.** Direct File exports each 1099-G's amount and
  the amount repaid in the year, and `/vaUnemploymentCompensationSubtraction` is their difference,
  rounded as the federal `/unemploymentCompensation` is. The subdivision of § 58.1-322.02 is cited
  by section only; Virginia Tax should confirm it.

The lottery subtraction (code 24, § 58.1-322.02(7)) was built in October and removed: the Code
subtracts only an amount "included therein", in federal AGI, from a prize under $600, and Direct
File has no gambling or other-income fact, so no prize is ever on Line 1 and the question could
only subtract what was never added. A comment at the subtractions block in `virginiaIncome.xml` records
this.

## Military pay

Two Schedule ADJ subtractions, asked behind one gate question: up to $15,000 of basic pay for
extended active duty, phased out dollar for dollar between $15,000 and $30,000 (code 38,
§ 58.1-322.02(15)), capped at the household's exported `/wages` because the per-filer wage facts
are not exported; and up to $30,000 of military retirement and survivor benefits for 2024
(code 60, § 58.1-322.02(18)), capped at the sum of the return's exported 1099-R taxable amounts
(`/vaForm1099RTaxableAmounts`), since the subtraction is of an amount in federal AGI. Both have to
be asked. A military W-2 reports box 1, which includes special pays, not basic pay; and the federal
1099-R screen already asks "is this distribution from a military retirement plan"
(`/form1099Rs/*/writableIsDistributionFromMilitaryRetirementPlan`), but does not export the
answer to states. Exporting that one flag would retire the second question. The basic pay
subtraction is one of the deductions a low-income credit replaces.

## Corrections

A correction is made with ordinary `<fg-set>` inputs bound to the facts, so it reaches both
returns where the fact is federal: the date of birth as one fact, a W-2 as a whole document
(employer, boxes 1, 2, 16, 17), the way Direct File's own W-2 screen edits it, or one of the
three payments Virginia's records show on Lines 20 to 22 (the records stand-in does not overwrite
a correction). Calculated amounts are never editable. The engine does not keep a "before", so
`virginia-corrections.js` snapshots the lines when a correction screen opens (once per round; a
round starts on "Is everything right?") and compares on the corrections screen. Try it: load
Virginia Demo 1, answer "No, something needs correcting", choose the date of birth, enter May 5,
1955, and the next screen says what you owe now versus before, lists the item was → now, and
folds the lines that moved.

## The integration rule

The state API delivered two things to a state's software after a federal return was
accepted: the MeF Form 1040 XML, and an enriched JSON of facts flagged
`<Export stateSystems="true"/>` in this dictionary. The Virginia module reads federal
facts only from those two sets, so the same module would be fed by the export unchanged
if the federal service returned; today, inside this port, it reads them from the federal
graph directly. The residency answer is the one exception: it gates the screens and
computes nothing. `python3 scripts/check-virginia-exports.py` enforces this (17 exported
federal paths read today); it caught the federal `/claimedDependentsCount`, which is derived
internally and never exported, so Virginia counts dependents from the exported
per-dependent facts instead, and it is why the spouse is found rather than pointed to and
why Line 19b is not split out.

## Two rules of shape

`scripts/check-virginia-constants.py` enforces two rules the policy-staff tool depends on.
Every tax-year figure, date and rate-schedule amount sits in `virginiaConstants.xml`, one fact
each with a `<TaxYear>`, and a rule in another module refers to it by
`<Dependency module="virginiaConstants" …>`; a `<Day>` or a non-zero `<Dollar>` literal in any
other module fails, so a new year is one edit in one file. And the two locality
switches in `virginiaLocalities.xml` (`/vaLocalityCode`, `/vaUseTaxRate`) list every option of
`/vaLocalityOptions` exactly once and have no default case, so an unlisted locality fails loudly.

## The workbench

`workbench/` (`make workbench` in this folder, http://localhost:3011; Node only, no build, no
JVM) is where policy staff and engineers change the return together: a change starts from the
law or from a line, values are set by tax year with a source for every figure, rules change in
plain language, the worked examples (15, each also run through the independent model) rerun on
every edit, and publishing writes the module that holds each fact, the flow and the Spanish only after a policy
reviewer and an engineer who is not the author approve, with a translator's approval when words
change. What the return cannot model becomes a request to engineering. Its own record is
[`../../workbench/README.md`](../../workbench/README.md); `make workbench-check` runs its
examples from the command line.

## Checks

From this folder unless marked; `make check` at the repository root runs everything that
needs no built site, in one run, and `make stats` prints the counts the prose is checked
against.

```bash
make validate-xml                          # every XML module against the RELAX NG schemas
python3 scripts/check-virginia-exports.py  # the integration rule
python3 scripts/check-virginia-constants.py # the constants module and the locality listing
python3 scripts/virginia-demos.py check    # the demo scenario files match website-static/data/virginia-demos.json
python3 scripts/merge-virginia-es.py --check # Spanish keys still match the English (without --check, merge them)
python3 scripts/virginia-stats.py --check  # the counts in the docs against the code
python3 scripts/check-virginia-docs.py     # the fact paths the docs cite exist
make workbench-check                       # the workbench's worked examples
make test                                  # the port's ScalaTest suite, including FlowSpec and VirginiaSpec
make -C ../.. cases                        # 50 households against an independent model of the rules
                                           # (needs the site running: make dev or make up): below the threshold, each
                                           # rate band and the top of each bracket exactly, the full and the
                                           # phased-out age deduction and both edges of the phase-out, the
                                           # 1939 and 1960 birth-date cutoffs, Social Security, a claimable
                                           # dependent, married filing jointly with a spouse 65 or blind and
                                           # with both spouses born before 1939, blind, blind and 65, a
                                           # non-resident, the 6.3% and 7% use-tax tiers, a refund after
                                           # estimated payments; the Credit for Low-Income Individuals at the
                                           # guideline exactly, a blind filer trading the exemption for it, a
                                           # 65-year-old keeping the age deduction instead, the refundable
                                           # EITC with a child; basic pay at $15,000 and $30,000 exactly,
                                           # phased, tied (kept), military benefits capped by the 1099-R;
                                           # Commonwealth Savers at the cap and uncapped at 70; a 1099-G;
                                           # a second W-2 with a blank box 15; and the four demos
make -C ../.. a11y                         # axe over the twenty Virginia screens, English and Spanish (site running)
python3 scripts/build-virginia-zip-localities.py <tab20_zcta520_county20_natl.txt>   # rebuild the ZIP lookup
```

The two browser checks run from the repository root with Node from `stack/toolchain.sh` and a
Playwright and axe-core pinned in `stack/browser-tools/`, installed with Chromium on first use. The
scripts still run on their own (`CASES=… node scripts/virginia-cases.cjs`, with `PLAYWRIGHT_MODULE`
and `AXE_PATH` naming any other Playwright and axe). `make handoff-verify` at the root clones the
IRS repository at the pin, applies the change set as patches and runs the no-JVM checks inside it.

## What a state would still have to build

In rough order of size:

1. **The rest of Form 760.** Itemized deductions and Virginia Schedule A; the Schedule ADJ
   additions, subtractions and deductions beyond the ones here (the subtraction for interest on
   U.S. obligations, code 20, is the next to take: `/interestReports/*/interestOnGovernmentBonds`
   is exported); Line 2, the additions; the Schedule CR credits and the credit for tax paid to
   another state; Line 17, the spouse tax adjustment; Line 19b, the spouse's share of withholding,
   which needs a per-filer W-2 link the export does not carry (a state would match each W-2's
   `/formW2s/*/usedTin` to the filers' TINs); married filing separately on a combined return;
   part-year (760PY) and nonresident (763) returns; the carryforward of excess 529 contributions;
   penalties and interest; voluntary contributions; direct deposit.
1a. **A live connection to Virginia Tax's records.** Lines 20 to 22 are the state's own
   figures; here they come from a JSON stand-in keyed by name and date of birth.
2. **Identity.** Direct File authenticated through ID.me and Login.gov. This port has no
   login at all; it is a static site with the engine in the browser.
3. **Submission.** Nothing here files anything: the Send button sets one fact and says so. A
   state return has to enter the state's revenue system, and a federal return still has to reach
   the IRS's MeF system, which only the IRS or an authorized provider can transmit to.
4. **The federal data path.** If the federal service were running, the facts this module
   reads would arrive through the state API's export rather than from a shared graph; the
   module is written so that only the plumbing changes.
5. **Spanish.** The fourteen Virginia screens carry Spanish (`locales/virginia_es.yaml`), written
   by the project, not reviewed by a translator; Virginia Tax's own Spanish wording would replace it.
6. **Accessibility verification** by people. axe covers the fourteen screens in both languages,
   the combo box, the correction view, the locality error state and the unsigned Send, and finds
   nothing; a screen-reader and keyboard review is still owed. And a review by Virginia Tax of
   every figure and citation against their own reading of the Code, starting with the two
   readings flagged above: the joint-return age deduction and the unemployment subdivision.
7. **Maintenance.** The IRS stack this sits on is labelled draft and changes weekly; this
   repository pins one commit of each library (`make bump-pin` moves one, with a drift report).

Nothing here is branded as, or endorsed by, the IRS or Virginia Tax. Every proposed screen
says on the screen that it is a demonstration.
