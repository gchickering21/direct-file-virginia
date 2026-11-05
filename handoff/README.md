# Taking the Virginia work

Licence: everything added for Virginia is CC0 1.0, public domain, like the IRS code it sits on (`LICENSE`).

Written for an engineering team at the Commonwealth of Virginia, or anyone else who wants
the Virginia return without the course project around it.

## What you are taking

A Virginia resident income tax return, Form 760 from Line 1 to Line 36 for a W-2 filer,
single or joint, in tax year 2024, built as prototype rules on the IRS's own port of Direct
File onto its maintained Fact Graph and Form Builder stack. It is:

- **Ten fact modules** of XML rules (`facts/virginia*.xml`, one per section of the return),
  176 facts, each citing its section of Va. Code Title 58.1 and its line of the 2024 Form 760
  instructions, with every tax-year figure in one of them, `virginiaConstants.xml`: the deductions and exemptions for both filers, the rate schedule, the
  unemployment and military subtractions, the Commonwealth Savers deduction, the three
  low-income credits weighed against the deductions they bar, withholding from the W-2s
  that name Virginia, the use tax by locality, and the amount owed or refunded.
- **Fourteen screens** in English and Spanish: what is already known, grouped by where it
  came from; a correction round; the four questions no one reports for the filer
  (locality, military service, Commonwealth Savers, untaxed purchases); the return, with a
  Change link on every answer and print and download; the signing.
- **A stand-in for your own records** (Lines 20 to 22), keyed by last name and date of birth.
- **A lookup from the federal ZIP code to the locality**, so the locality question is
  confirmed rather than answered when the ZIP lies in one city or county.
- **A rules workbench** (`virginia/direct-file/workbench/`, `make workbench`,
  port 3011): policy staff change a figure or a rule in plain language, with a source for
  every number, watch fifteen worked examples rerun, and send the change for a policy and
  an engineering approval; publishing writes the XML. Node only, no build.
- **Checks**, in layers: the schemas, the export rule, the constants module, the locality
  listing, the Spanish keys, the doc counts and the fact paths the docs cite (no JVM, a
  minute); the workbench's worked examples; 50 households against an independent model of
  the rules in the browser; a ScalaTest that pins the four demos and runs the same households
  through the engine; an axe pass over every Virginia screen; and the port's own suite.

What it is not: a complete return, a filing system, or anything with identity in it. The
gap list in `virginia/direct-file/docs/virginia/README.md` says exactly what a
state would still build, in order of size.

## The one design rule

The Virginia module reads federal facts only through what the federal return already
exports to a state: the facts flagged for state systems in the IRS dictionary, and the
Form 1040 XML the state API delivered. `scripts/check-virginia-exports.py` enforces it
(today the module reads 17 of the federal dictionary's exported paths). So the module
would be fed by the federal export unchanged if
the federal service returned, and today, inside the port, it reads the same facts from the
shared graph. The residency answer is the one exception: it gates the screens and computes
nothing.

Two rules of the same kind inside the modules: every tax-year figure, date and rate sits
in `virginiaConstants.xml`, so a new year is one edit in one file; and
the locality switches list every city and county with no default, so an unlisted locality
fails loudly. `scripts/check-virginia-constants.py` enforces both.

## How to take it

You do not need this repository. The change set is the difference between the IRS's
`direct-file` application at one pinned commit of `form-builder-examples` and the Virginia
site, and `export.sh` writes it as one patch, with the commits that built it as a changelog
beside it:

```bash
# in this repository
handoff/export.sh                     # writes handoff/patches/virginia.patch and CHANGELOG.md

# in a fresh clone of the IRS repository
git clone https://github.com/IRS-Public/form-builder-examples.git
cd form-builder-examples
git checkout 2eed6d4424f89680f48cb19290ddcb2a0147b09b   # the pin; see IRS_PINS.md
git apply --directory=direct-file --index ../path/to/handoff/patches/virginia.patch
```

`make handoff-verify` does exactly that against a fresh clone and runs the no-JVM checks
inside it. It ran clean on 2026-11-05.
The other IRS repositories the port builds against (`fact-graph`, `form-builder`,
`taxpert`) are cloned beside it at the commits in `IRS_PINS.md`; the IRS's own quickstart
in the `taxpert` repository covers the layout and the toolchain.

Then, from `direct-file/` in that clone:

```bash
make bootstrap        # once
make dev              # http://localhost:3008/app/direct-file
```

Open `/your-taxes/virginia/virginia-intro/?demo=1` (or Scenario → Virginia Demo 1 → Load
scenario) and step through to the return. Riley owes $698. The Virginia README in that folder has the four hand checks and every command.

## Reading order

1. `virginia/direct-file/docs/adr/001-virginia-state-return.md`: what was
   added and left out, and why. One page. Then `002-virginia-scope-extended.md`: the
   credits, the military and unemployment subtractions, the spouse, what was removed, and
   the files of the IRS's own that the change set touches. Then `003-the-layout-for-growth.md`:
   why the rules are ten modules, where the single manifest of the demo households is, and what was
   deliberately not generalised.
2. `handoff/POLICY_MAP.md`: one row per rule: Form 760 line, Virginia Code section, the
   facts, what federal facts they read and how those are exported, the hand-check values;
   and what is not modelled, with the reason.
3. `handoff/FORM_760_FIELD_MAP.md`: every field on the 2024 form and where it would come
   from in a prepopulated return: the federal return, a document, your own records, the
   filer, or arithmetic. The local-tax section explains why the only locality effects are
   the locality code and the use-tax rate.
4. `CHANGELOG.md` beside the patch: the commits that built the site, oldest first. Each names
   the rule, the law and the figure.
5. `virginia/direct-file/docs/virginia/README.md`: how to see it, the checks,
   the gap list. `workbench/README.md` beside it for the policy-staff tool.

## Licence and provenance

The IRS code is a work of the United States government, public domain in the US and CC0
worldwide. Everything added here is CC0 as well (`LICENSE`), so there is nothing to
negotiate. Nothing is branded as, or endorsed by, the IRS or Virginia Tax; every Virginia
screen says on the screen that it is a demonstration, and the four demo households are
invented. The Virginia figures were read from the Code at law.lis.virginia.gov and the
2024 Form 760 instructions on 2026-10-19 and 2026-10-20; `SOURCES.md` here (written by
`export.sh` from `report/SOURCES.md`) lists each with its URL. Virginia Tax's own reading of every figure
and citation is the review this needs; the unemployment subtraction's subdivision of
§ 58.1-322.02 and the joint-return reading of the age deduction phase-out are the two
places the policy map flags for it.

## Who to ask

Graham Chickering, Georgetown University, Digital Public Infrastructure, fall 2026.
