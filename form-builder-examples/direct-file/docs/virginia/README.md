# The Virginia return on this port

A Virginia resident return computed from the federal return, as a few prototype rules.
Decision record: [`../adr/001-virginia-state-return.md`](../adr/001-virginia-state-return.md).
Written for a state engineering team as much as for the class that built it.

## What is here

| File | What it is |
|---|---|
| `src/main/resources/direct-file/facts/virginia.xml` | 27 facts: Form 760 lines 1–16 for a single W-2 filer, tax year 2024. Every fact names its section of Va. Code Title 58.1 and its line of the 2024 Form 760 instructions. Tax-year figures sit in one block at the top. |
| `src/main/resources/direct-file/flow/your-taxes-virginia.xml` | Two screens, shown only to a filer who answered Virginia on the federal residence question: what the prototype is, and the computed lines with their citations. |
| `facts/constants.xml`, `flow/you-and-your-family-about-you.xml` | The one federal touch: `va` added to `/scopedStateOptions` and to the residence question, the change the IRS made whenever a state joined. |
| `scenarios/virginia_demo_1_riley_rappahannock_single_33k.json`, `scenarios/virginia_demo_2_morgan_shenandoah_age_65_56k.json` | The two hand-checked households as fictional Virginians (names, addresses and employers invented), loadable from the Scenario menu as **Virginia Demo 1** and **Virginia Demo 2**. |
| `scripts/check-virginia-exports.py` | Fails if the Virginia module reads a federal fact the federal return does not export to a state (see "The integration rule"). |

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
| Filer | Riley Rappahannock (fictional), Richmond; single, born 1997-10-03, wages $33,333 | Morgan Shenandoah (fictional), Charlottesville; single, born 1955-05-05, wages $56,000 |
| Line 1 federal AGI | $34,333 | $57,000 |
| Line 4 age deduction (§ 58.1-322.03(5)) | $0 | $12,000 − ($57,000 − $50,000) = $5,000 |
| Line 9 Virginia AGI | $34,333 | $52,000 |
| Line 11 standard deduction (§ 58.1-322.03(1)(b)) | $8,500 | $8,500 |
| Line 12 exemptions (§ 58.1-322.03(2)) | $930 | $930 + $800 = $1,730 |
| Line 15 taxable income | $24,903 | $41,770 |
| Line 16 tax (§ 58.1-320) | $720 + 5.75% × $7,903 = **$1,174** | $720 + 5.75% × $24,770 = **$2,144** |

The engine returns exactly these on the summary page.

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
```

## What a state would still have to build

In rough order of size:

1. **The rest of Form 760.** Itemized deductions and Virginia Schedule A; every Schedule ADJ
   addition, subtraction and deduction beyond Social Security and the age deduction; every
   credit, including the Credit for Low-Income Individuals and the Virginia EITC, whose
   interaction with the age deduction the instructions describe; a spouse's age deduction
   and exemptions; married filing separately on a combined return; part-year (760PY) and
   nonresident (763) returns; withholding, estimated payments and the amount due or refund.
2. **Identity.** Direct File authenticated through ID.me and Login.gov. This port has no
   login at all; it is a static site with the engine in the browser.
3. **Submission.** Nothing here files anything. A state return has to enter the state's
   revenue system, and a federal return still has to reach the IRS's MeF system, which
   only the IRS or an authorized provider can transmit to.
4. **The federal data path.** If the federal service were running, the facts this module
   reads would arrive through the state API's export rather than from a shared graph; the
   module is written so that only the plumbing changes.
5. **Spanish.** The port generates Spanish pages, and Virginia's screens appear in them,
   but with the English strings; the Virginia wording has not been translated.
6. **Accessibility verification** of the two new screens, and a review by Virginia Tax
   of every figure and citation against their own reading of the Code.
7. **Maintenance.** The IRS stack this sits on is labelled draft and changes weekly; this
   repository pins one commit of each library.

Nothing here is branded as, or endorsed by, the IRS or Virginia Tax. Every proposed screen
says on the screen that it is a demonstration.
