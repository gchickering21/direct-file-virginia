# ADR-001: A Virginia state return as prototype rules on the Direct File port

- Created: 2026-10-19
- Published: 2026-10-19
- Status: accepted (class project, Digital Public Infrastructure, Georgetown; not an IRS or Virginia Tax decision)

## Primary author(s)

Graham Chickering, with Claude (Anthropic) as the engineering assistant.

## Problem statement

Direct File filed federal returns and handed the taxpayer to a state's own software for
the state return, through the state API's export. Virginia never joined, and Virginia
residents have no free state filing tool. The IRS has since published the Fact Graph as a
standalone library, built Form Builder on it, and ported Direct File's interview onto that
stack: this application. The question this record answers is how a state would add its
own return to that port, and what that adds and leaves untouched.

## Decision

Add a Virginia resident return to this application as **two XML files beside the federal
ones**, plus the smallest federal touch that lets a Virginia resident through the door:

1. `facts/virginia.xml`: a fact module deriving Form 760 lines from federal facts.
2. `flow/virginia.xml`: a flow module of screens, registered in `flow/index.xml` after the
   federal modules and shown only to Virginia residents.
3. `va` added to the federal `/scopedStateOptions` enum in `facts/constants.xml` and to
   the residence question's options in the about-you flow. Without it the federal
   knockout `/flowKnockoutUnsupportedState` ends the interview for a Virginia resident.
   This is the same one-line change the IRS made each time a state joined, and it is the
   only edit to a federal file.

### Scope: prototype rules, not a return

A single resident filer with W-2 wages, tax year 2024, the year this dictionary models:

| Form 760 line | Rule | Law |
|---|---|---|
| 1, 3 | federal adjusted gross income | read from the federal graph |
| 4 | age deduction (the Virginia-specific example) | Va. Code § 58.1-322.03(5) |
| 9 | Virginia adjusted gross income; $0 tax below the filing threshold | § 58.1-321 |
| 11 | standard deduction, $8,500 single / $17,000 married | § 58.1-322.03(1)(b) |
| 12 | exemptions, $930 each, $800 more for 65-or-older or blind | § 58.1-322.03(2) |
| 15 | Virginia taxable income | |
| 16 | tax from the rate schedule, 2 / 3 / 5 / 5.75 % | § 58.1-320 |

Deliberately left out: itemized deductions, every other Schedule ADJ addition,
subtraction and deduction, credits (including the low-income credit and the Virginia
EITC), part-year and nonresident returns, married filing separately on a combined return,
Spanish wording unless it is generated, and submission of anything anywhere.

### The integration rule

The Virginia module may depend only on federal facts the federal return already exports
to states: the 57 facts flagged `<Export stateSystems="true"/>` in this dictionary, and
the facts that appear in the MeF Form 1040 XML (`mef="true"`), both of which the state
API sent to a state's software in 2024 and 2025. Running inside this port, those facts are
read from the federal graph directly. If the federal service returned, the same module
would be fed by the export unchanged. A test enforces the rule.

## Goals and non-goals

Goals: show that a state's rules fit the dictionary format without touching the engine;
show each rule traceable to the Virginia Code and the 2024 Form 760 instructions; show the
federal screens unchanged for every other state; leave a change set a state engineer can
read in one sitting and apply to a fresh clone of the IRS repositories.

Non-goals: a complete Virginia return; identity, submission, or anything a state's
revenue system would have to supply; any change to the Fact Graph or Form Builder
libraries.

## Consequences

- Every federal page in Browse All is byte-for-byte what it was, except the residence
  question gains one option.
- The Virginia facts appear in Fact Explorer as a module reading from `/agi`,
  `/filingStatus`, the filer's date of birth and the residency facts, which is the
  picture of the integration seam.
- Figures live in one block at the top of `facts/virginia.xml`, stamped with the tax year
  and their source, so a later year is one edit.
- The acceptance test is a hand-computed Form 760 for a saved scenario, compared line by
  line with the engine's values.

## Household

Primary: the saved scenario "Single 33k No Credits" (`scenarios/single_33k_no_credits.json`):
single, born 1997-10-03, W-2 wages $33,333, federal AGI $34,333, not claimable as a
dependent, not blind, no Social Security, loaded with the residence state changed to
Virginia. A second saved scenario of an elderly single filer exercises the age deduction.
