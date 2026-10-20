# Taking the Virginia work

Written for an engineering team at the Commonwealth of Virginia, or anyone else who wants
the Virginia return without the course project around it.

## What you are taking

A Virginia resident income tax return, Form 760 from Line 1 to Line 36 for a single W-2
filer in tax year 2024, built as a few prototype rules on the IRS's own port of Direct File
onto its maintained Fact Graph and Form Builder stack. It is:

- **Two fact modules** of XML rules, 53 facts, each citing its section of Va. Code Title
  58.1 and its line of the 2024 Form 760 instructions, with every tax-year figure in one
  block at the top.
- **Twelve screens** in English and Spanish: what is already known, grouped by where it came
  from; a correction round; the four questions no one reports for the filer; the return.
- **A stand-in for your own records** (Lines 20 to 22), keyed by name and date of birth.
- **Checks**: the schemas, a test that the module reads only federal facts the state API
  exported, sixteen households against an independent model of the rules, an accessibility
  pass, and the port's own test suite.

What it is not: a complete return, a filing system, or anything with identity in it. The
gap list in `form-builder-examples/direct-file/docs/virginia/README.md` says exactly what a
state would still build, in order of size.

## The one design rule

The Virginia module reads federal facts only through what the federal return already
exports to a state: the facts flagged for state systems in the IRS dictionary, and the
Form 1040 XML the state API delivered. `scripts/check-virginia-exports.py` enforces it. So
the module would be fed by the federal export unchanged if the federal service returned,
and today, inside the port, it reads the same facts from the shared graph. The residency
answer is the one exception: it gates the screens and computes nothing.

## How to take it

You do not need this repository. The change set is a series of ordinary commits on top of
the IRS's `form-builder-examples` repository at one pinned commit, and `export.sh` turns
them into patches:

```bash
# in this repository
handoff/export.sh                     # writes handoff/patches/*.patch

# in a fresh clone of the IRS repository
git clone https://github.com/IRS-Public/form-builder-examples.git
cd form-builder-examples
git checkout 2eed6d4424f89680f48cb19290ddcb2a0147b09b   # the pin; see IRS_PINS.md
git am ../path/to/handoff/patches/*.patch
```

That was done on 2026-10-20 against a fresh clone: the series applies cleanly, the two
XML files validate against the IRS schemas, and the checks run. The other IRS
repositories the port builds against (`fact-graph`, `form-builder`, `taxpert`) are
cloned beside it at the commits in `IRS_PINS.md`; the IRS's own quickstart in the
`taxpert` repository covers the layout and the toolchain.

Then, from `form-builder-examples/direct-file/`:

```bash
make bootstrap        # once
make dev              # http://localhost:3008/app/direct-file
```

Scenario → Virginia Demo 1 → Load scenario → step to "Your Virginia return". The
Virginia README in that folder has the hand checks and every command.

## Reading order

1. `form-builder-examples/direct-file/docs/adr/001-virginia-state-return.md`: what was
   added and left out, and why. One page.
2. `handoff/POLICY_MAP.md`: one row per rule: Form 760 line, Virginia Code section, the
   facts, what federal facts they read and how those are exported, the hand-check values.
3. `handoff/FORM_760_FIELD_MAP.md`: every field on the 2024 form and where it would come
   from in a prepopulated return: the federal return, a document, your own records, the
   filer, or arithmetic. The local-tax section explains why the only locality effects are
   the locality code and the use-tax rate.
4. The commit messages, in order. Each names the rule, the law and the figure.
5. `form-builder-examples/direct-file/docs/virginia/README.md`: how to see it, the checks,
   the gap list.

## Licence and provenance

The IRS code is a work of the United States government, public domain in the US and CC0
worldwide. Everything added here is CC0 as well (`LICENSE`), so there is nothing to
negotiate. Nothing is branded as, or endorsed by, the IRS or Virginia Tax; every Virginia
screen says on the screen that it is a demonstration, and the two households are invented.
The Virginia figures were read from the Code at law.lis.virginia.gov and the 2024 Form 760
instructions on 2026-10-19 and 2026-10-20; `report/SOURCES.md` lists each with its URL.
Virginia Tax's own reading of every figure and citation is the review this needs.

## Who to ask

Graham Chickering, Georgetown University, Digital Public Infrastructure, fall 2026.
