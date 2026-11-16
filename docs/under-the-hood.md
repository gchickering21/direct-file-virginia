# Under the hood: what is behind each link

For anyone who scanned the poster and opened the links. Each section below is one link on that
page, in the same order: what you are looking at, what builds it, and where it lives in this
repository. The diagrams are in [architecture.md](architecture.md); this page is the walk-through.

**The one idea.** The IRS published the code behind Direct File, and then three
smaller pieces of it as libraries anyone can build on: **Fact Graph**, the rules engine; **Form
Builder**, which turns rules and screens written as XML into a static website; and **Taxpert**, a
developer workspace. It also published Direct File's own federal return rebuilt on those pieces.
This project adds a Virginia return (Form 760) as a thin layer beside that federal return, edits
no IRS file, and publishes the result as a website with no server behind it. Everything that
computes runs in your browser.

## 1. The return: "Pick a household" and "Riley's return"

**What you see.** A start page with four invented Virginia filers, and behind each one the
federal screens followed by the Virginia ones, one question per page, in English or Spanish.
Riley Rappahannock, single, Richmond, owes $698; Jordan Elizabeth, head of household, Norfolk,
gets a $505 refund.

**What builds it.**

- **Every screen is a file.** Form Builder (Scala, in [form-builder/](../form-builder/)) reads
  the Flow XML (the pages, the questions, the condition that shows or hides each block), the fact
  dictionary and the locale files, and writes one HTML page per screen per language. The hosted
  build splits each page to one question. There is no application server: GitHub Pages serves
  the folder.
- **The rules run in your browser.** Fact Graph ([fact-graph/](../fact-graph/)) is a Scala
  rules engine compiled twice: to a Java jar for the tests and to JavaScript for the browser.
  Every page loads that bundle and the merged dictionary, `fact-dictionary.xml`, in which each
  fact is a path like `/vaTax` with either a question behind it or a formula over other facts.
  An answer is written into the graph, the graph is kept in the browser's session storage from
  page to page, and the next page evaluates its conditions against it. Nothing is sent anywhere.
- **A household is a saved scenario.** A link ending in `?demo=1` seeds the graph from a JSON
  file: one of the IRS's own saved scenarios with a dozen values changed (a Virginia name and
  address, the answers to the Virginia questions). The manifest of the four is
  [virginia-demos.json](../virginia/direct-file/src/main/resources/direct-file/website-static/data/virginia-demos.json);
  the start page's cards are drawn from it.
- **The Virginia layer** is the whole of what was written for this project inside the site:
  ten rule modules ([facts/virginia*.xml](../virginia/direct-file/src/main/resources/direct-file/facts/),
  176 facts, every tax-year figure in `virginiaConstants.xml` with its tax year and the section
  of the Code of Virginia it comes from), fourteen screens in
  [flow/your-taxes-virginia.xml](../virginia/direct-file/src/main/resources/direct-file/flow/your-taxes-virginia.xml),
  the Spanish in `locales/virginia_es.yaml`, and a dozen browser scripts under
  [website-static/js/](../virginia/direct-file/src/main/resources/direct-file/website-static/js/)
  that stand in for what a state would get from its own systems: a records stand-in for the
  withholding lines, a ZIP code to locality lookup, the corrections and signing pages.
- **The one design rule.** A Virginia fact may read a federal fact only if the federal return
  already exports it to states; a script fails the build otherwise. That is what makes the layer
  portable: the same module would be fed by the federal state API if that service came back.
  The decision records in [virginia/direct-file/docs/adr/](../virginia/direct-file/docs/adr/) say why.

**Where.** [virginia/direct-file/](../virginia/direct-file/), a copy of the IRS's reference
application from [form-builder-examples/](../form-builder-examples/) changed beside it. The
difference between the two folders is the whole change set.

## 2. The Rules Workbench

**What you see.** Form 760 line by line with the statute beside each line, the values by tax
year, the questions the return asks, the screens, fifteen worked examples, and four reports.
On the hosted site it is read-only.

**What builds it.** The live Workbench is a small Node application with no build step and no
database ([virginia/direct-file/workbench/](../virginia/direct-file/workbench/), port 3011 on a
developer's machine). Policy staff change a figure for a tax year, a rule in plain language, a
question or the words on a screen; the worked examples rerun in the browser against the real
engine as they type; a policy reviewer, an engineer and (when words change) a translator approve;
and only then does it write the change into the XML modules above. Drafts, approvals and the
audit trail are JSON files on disk, and a publish can open a pull request.

**The hosted copy** is a snapshot. At build time
[workbench/snapshot.mjs](../virginia/direct-file/workbench/snapshot.mjs) writes the page, its
scripts, the engine and every answer the live server would give to a read as static files. The
same interface scripts serve both, with every save refused on the copy, so what you see is the
real tool minus the ability to write. Its full description is the
[Workbench README](../virginia/direct-file/workbench/README.md).

## 3. Test results: the proof page

**What you see.** What the checks found for the build you are looking at, with the commit it ran
on: the households, the accessibility scans and the test suite, each green or red.

**What builds it.** The page is static and reads four JSON files that `make proof`
([stack/proof.sh](../stack/proof.sh)) writes beside it every time the site is published:

- **The households** (`cases.json`). Fifty filers, the four demos among them, built from the
  IRS's saved scenarios by [virginia-cases.py](../virginia/direct-file/scripts/virginia-cases.py).
  A headless Chromium driven by Playwright loads each one into the real pages and reads every
  Virginia line off the summary screen, then compares it with an independent model of the return
  in [virginia-model.cjs](../virginia/direct-file/scripts/lib/virginia-model.cjs), written from the
  Code of Virginia and the Form 760 instructions rather than from the XML, so that the two can
  disagree.
- **The screens** (`a11y.json`). axe-core, checking WCAG 2.1 A and AA, over every Virginia route
  in English and in Spanish, plus an error state.
- **The test suite** (`tests.json`). The ScalaTest suite on the JVM: the same households through
  the full dictionary, each demo's lines pinned to the cent, and the IRS's federal suites,
  unchanged.

A fourth set of checks needs no built site and runs in a minute (`make check`): the XML against
the IRS schemas, the export rule, every figure in the constants module with a tax year, the
Spanish keys matching the English, and the counts quoted in these documents matching the code.

## 4. The Fact Explorer

**What you see.** The whole dictionary, federal and Virginia, drawn as one graph: every question,
every fact, what it reads and who reads it. Search for `va` to find the Virginia facts, or open
`/vaTax` and follow its inputs down to the federal income it starts from. It is a large page.

**What builds it.** This is the IRS's own tool, unmodified: a React and Vite single-page
application in [taxpert/packages/fact-explorer/](../taxpert/packages/fact-explorer/). Its generator
parses the Flow XML and the fact dictionary into a graph of nodes and edges, with no Scala
involved. For the hosted site, [stack/fact-explorer.sh](../stack/fact-explorer.sh) points that
generator at the Virginia site's flow and dictionary, builds the page, rewrites the handful of
paths the build writes against the domain root so they work under the site's prefix, and places
the result beside the site. The IRS files stay byte for byte at their pinned commit.

## 5. The design mockups

**What you see.** Three static pages: *law to screen*, a change followed from an Act of the
General Assembly to the filer's screen; *the rules workbench*, the design the Workbench was built
from; and *the Virginia theme*, the look of the state's screens. Course material, not part of the
handoff.

**What builds it.** Plain HTML files in [report/mockups/](../report/mockups/), copied into the site
at publish time. The Workbench above is the built version of the first two.

## 6. How the site is hosted

One command, `make publish` ([stack/publish-pages.sh](../stack/publish-pages.sh)), generates the
site with every link prefixed for a GitHub Pages project site, builds the Explorer and the
Workbench snapshot beside it, runs the checks into the proof page, and pushes the whole folder as
one commit to a branch called `gh-pages`. GitHub Pages serves that branch as files. There is no
server-side code, no database, no account and no cost; the filer's answers never leave the
browser. [hosting.md](hosting.md) has the details, and what the hosted copy lacks: the live
Workbench and Author Mode, both of which write to disk.

## 7. The code

The repository holds the IRS's four published trees at pinned commits, never edited
([IRS_PINS.md](../IRS_PINS.md)): the engine, the site generator, the workspace and the reference
applications. The Virginia work is the one application copied out and changed beside them, the
Makefile and the scripts that build and check it, and the write-up. The [README](../README.md)
says where to start by who you are; [handoff/BRIEF.md](../handoff/BRIEF.md) is the one-page
argument for a state; [surfaces.md](surfaces.md) is the admin pages for someone running it
locally. Everything written here is public domain, CC0; the IRS's code carries its own licence.
