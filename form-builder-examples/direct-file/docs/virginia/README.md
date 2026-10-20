# The Virginia return on this port

A Virginia resident return computed from the federal return, as a few prototype rules.
Decision record: [`../adr/001-virginia-state-return.md`](../adr/001-virginia-state-return.md).
Written for a state engineering team as much as for the class that built it.

## What is here

| File | What it is |
|---|---|
| `src/main/resources/direct-file/facts/virginia.xml` | 49 facts: Form 760 from Line 1 to Line 36 for a single W-2 filer, tax year 2024: the deductions and exemptions, the age deduction, the rate schedule, withholding, the payments Virginia Tax holds, the lottery subtraction, the Commonwealth Savers deduction, the use tax, and the amount owed or refunded. Every fact names its section of Va. Code Title 58.1 and its line of the 2024 Form 760 instructions. Tax-year figures sit in one block at the top. |
| `src/main/resources/direct-file/facts/virginiaLocalities.xml` | Virginia's 133 cities and counties with the 3-digit locality code and the consumer's use tax rate (5.3%, 6%, 6.3%, 7%) from the 2024 instructions. Virginia has no local income tax; locality enters the return only here. |
| `src/main/resources/direct-file/flow/your-taxes-virginia.xml` | Twelve screens, shown only to a filer who answered Virginia on the federal residence question: what the prototype is; what is already known, grouped by source (the federal return, the W-2s the employer filed with the IRS and with Virginia, Virginia Tax's own records); **a correction round** (is everything right? → what needs correcting → correct the date of birth or a whole W-2 → what it changed); the four questions no one reports (locality on January 1, lottery prizes under $600, Commonwealth Savers contributions, untaxed purchases); the return, Line 1 to Line 36, with the declaration language. |
| `templates/nodes/inputs/select.html` | This app's override of Form Builder's select input: the same `<select>` inside a USWDS combo box, so the 133-locality question is typed into and filtered. USWDS keeps the select in sync and fires `change` on it, which is what the runtime listens for. |
| `website-static/js/virginia-corrections.js` | The "here is what it changed" view: snapshots the Form 760 lines and the correctable facts when a correction screen opens, and on the corrections screen shows what you owe now versus before, each corrected item was → now, and the lines that moved. Presentation only; it writes no fact. |
| `facts/constants.xml`, `flow/you-and-your-family-about-you.xml` | The one federal touch: `va` added to `/scopedStateOptions` and to the residence question, the change the IRS made whenever a state joined. |
| `scenarios/virginia_demo_1_riley_rappahannock_single_33k.json`, `scenarios/virginia_demo_2_morgan_shenandoah_age_65_56k.json` | The two hand-checked households as fictional Virginians (names, addresses and employers invented) with their four answers, loadable from the Scenario menu as **Virginia Demo 1** and **Virginia Demo 2**. |
| `scripts/check-virginia-exports.py` | Fails if the Virginia module reads a federal fact the federal return does not export to a state (see "The integration rule"). |
| `locales/virginia_es.yaml`, `scripts/merge-virginia-es.py` | Spanish for the two Virginia screens, hand-written, merged into the generated `flow_es.yaml` (which `make transpile-es` reseeds from Direct File's Spanish and so would otherwise drop). Keys are content-addressed on the English text: change the English, re-copy the key. |

## See it

```bash
make bootstrap   # once
make dev         # http://localhost:3008/app/direct-file
```

1. Click **Scenario**, choose **Virginia Demo 1 Riley Rappahannock Single 33k** under
   Existing scenarios, **Load scenario**.
2. Open `/your-taxes/virginia/virginia-summary/`, or step forward to the "Your Virginia
   return" section. **Browse All** lists the two Virginia screens with the federal ones.
3. Load **Virginia Demo 2 Morgan Shenandoah Age 65 56k** to see the age deduction and its
   phase-out.

The Virginia screens are gated on `/vaIsResident`. With no scenario loaded, or a resident of
another state, the flow runtime skips them and you land on the next federal page. That is
the gate working, not a missing page.

## The two hand checks

| | Household 1 | Household 2 |
|---|---|---|
| Filer | Riley Rappahannock (fictional), Richmond City (locality 760); single, born 1997-10-03, wages $33,333, $300 withheld | Morgan Shenandoah (fictional), Charlottesville City (540); single, born 1955-05-05, wages $56,000, $300 withheld |
| Their answers | a $450 lottery prize; no 529; $400 of untaxed purchases | no prize; $3,000 into a Commonwealth Savers account; nothing untaxed |
| Line 1 federal AGI | $34,333 | $57,000 |
| Line 4 age deduction (§ 58.1-322.03(5)) | $0 | $12,000 − ($57,000 − $50,000) = $5,000 |
| Line 7 lottery prizes under $600 (§ 58.1-322.02(7)) | $450 | $0 |
| Line 9 Virginia AGI | $33,883 | $52,000 |
| Line 11 standard deduction (§ 58.1-322.03(1)(b)) | $8,500 | $8,500 |
| Line 12 exemptions (§ 58.1-322.03(2)) | $930 | $930 + $800 = $1,730 |
| Line 13 Commonwealth Savers deduction (§ 58.1-322.03(7)) | $0 | $3,000 (under the $4,000 cap) |
| Line 15 taxable income | $24,453 | $38,770 |
| Line 16 tax (§ 58.1-320) | $720 + 5.75% × $7,453 = $1,148.55 → **$1,149** | $720 + 5.75% × $21,770 = $1,971.78 → **$1,972** |
| Line 19a withheld (W-2 box 17) | $300 | $300 |
| Line 27 tax you owe | $849 | $1,672 |
| Line 33 use tax | $400 × 6% (Central Virginia region) = $24 | $0 |
| Line 35 amount you owe | **$873** | **$1,672** |

The engine returns exactly these on the summary page, in English and in Spanish.

## Corrections

A correction is made with ordinary `<fg-set>` inputs bound to the federal facts, so it reaches
both returns: the date of birth as one fact, a W-2 as a whole document (employer, boxes 1,
2, 16, 17), the way Direct File's own W-2 screen edits it. Calculated amounts are never
editable. The engine does not keep a "before", so `virginia-corrections.js` snapshots the
lines when a correction screen opens (once per round; a round starts on "Is everything
right?") and compares on the corrections screen. Try it: load Virginia Demo 1, answer "No,
something needs correcting", choose the date of birth, enter May 5, 1955, and the next
screen says "Now you owe $174. Before this correction, you owe $873", lists the item was →
now, and folds the seven lines that moved.

## The integration rule

The state API delivered two things to a state's software after a federal return was
accepted: the MeF Form 1040 XML, and an enriched JSON of facts flagged
`<Export stateSystems="true"/>` in this dictionary. The Virginia module reads federal
facts only from those two sets, so the same module would be fed by the export unchanged
if the federal service returned; today, inside this port, it reads them from the federal
graph directly. The residency answer is the one exception: it gates the screens and
computes nothing. `python3 scripts/check-virginia-exports.py` enforces this; it caught the
federal `/claimedDependentsCount`, which is derived internally and never exported, so
Virginia counts dependents from the exported per-dependent facts instead.

## Checks

```bash
make validate-xml                          # both XML files against the RELAX NG schemas
python3 scripts/check-virginia-exports.py  # the integration rule
make test                                  # the port's ScalaTest suite, including FlowSpec
python3 scripts/merge-virginia-es.py        # Spanish keys still match the English (and merge them)
python3 scripts/virginia-cases.py /tmp/va-cases && CASES=/tmp/va-cases node scripts/virginia-cases.cjs
                                           # 13 households against an independent model of the rules
                                           # (needs `make dev` running): below the threshold, each
                                           # rate band, the full and the phased-out age deduction,
                                           # Social Security, a claimable dependent, married filing
                                           # jointly, blind, a non-resident, and the two demos
```

## What a state would still have to build

In rough order of size:

1. **The rest of Form 760.** Itemized deductions and Virginia Schedule A; the Schedule ADJ
   additions, subtractions and deductions beyond the five here; every credit, including the
   Credit for Low-Income Individuals and the Virginia EITC, whose interaction with the age
   deduction the instructions describe; the spouse tax adjustment, a spouse's age deduction
   and exemptions, and Line 19b; married filing separately on a combined return; part-year
   (760PY) and nonresident (763) returns; the carryforward of excess 529 contributions;
   penalties and interest; voluntary contributions; direct deposit.
1a. **A live connection to Virginia Tax's records.** Lines 20 to 22 are the state's own
   figures; here they are writable placeholders at $0.
2. **Identity.** Direct File authenticated through ID.me and Login.gov. This port has no
   login at all; it is a static site with the engine in the browser.
3. **Submission.** Nothing here files anything. A state return has to enter the state's
   revenue system, and a federal return still has to reach the IRS's MeF system, which
   only the IRS or an authorized provider can transmit to.
4. **The federal data path.** If the federal service were running, the facts this module
   reads would arrive through the state API's export rather than from a shared graph; the
   module is written so that only the plumbing changes.
5. **Spanish.** The two Virginia screens carry Spanish (`locales/virginia_es.yaml`), written by
   the project, not reviewed by a translator; Virginia Tax's own Spanish wording would replace it.
6. **Accessibility verification** of the twelve screens, including the combo box and the
   correction view, and a review by Virginia Tax
   of every figure and citation against their own reading of the Code.
7. **Maintenance.** The IRS stack this sits on is labelled draft and changes weekly; this
   repository pins one commit of each library.

Nothing here is branded as, or endorsed by, the IRS or Virginia Tax. Every proposed screen
says on the screen that it is a demonstration.
