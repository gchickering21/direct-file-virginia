# ADR-003: The layout for growth: the rules in modules, one list of everything, the archive fetched

Licence: the Virginia additions are CC0 1.0, public domain, like the IRS code they sit on (the repository's `LICENSE`).

- Created: 2026-11-02
- Published: 2026-11-02
- Status: accepted (class project, Digital Public Infrastructure, Georgetown; not an IRS or Virginia Tax decision)
- Amends: [ADR-002](002-virginia-scope-extended.md), whose decisions stand; this record is about the shape of the files, not the rules

## Primary author(s)

Graham Chickering, with Claude (Anthropic) as the engineering assistant.

## Problem statement

By the end of the second round the Virginia work was 4 MB of files on 1.4 GB of vendored IRS
code, and the 4 MB had grown the way prototypes grow: one 2,600-line fact file, the four demo
households described in eight places, three hand-kept route lists, four scripts each parsing
the same XML, a 1,500-line page script talking to a 560-line one through a bag of hooks, and a
600-line server mixing HTTP with the review workflow and git. Every one of these works. Each
makes the next change cost more than it should: a fifth demo was 580 lines, a new question
meant editing a route list by hand, a new tax year meant finding a block inside a file by its
comment markers. This record fixes the layout so the prototype can keep growing, and says what
was deliberately not generalised.

## Decisions

1. **The rules are modules, one per section of the return.** `facts/virginia.xml` is now ten
   files, `facts/virginia*.xml`, cut along the section banners it already had: constants,
   filer, income (Lines 1 to 9), deductions (11 to 15), tax (16), credits (23), payments (19a to
   28), result (33, 35, 36), screens, and the localities module that already existed. Form
   Builder merges every file in `facts/` into one dictionary, so the engine sees no difference;
   the schema is checked per file. A dependency that reaches into another module names it
   (`<Dependency module="virginiaConstants" …>`), as the IRS's own modules do and as the
   locality references already did. The both-ways computation of Lines 4 to 16
   (`/vaWithCredit…`, `/vaWithoutCredit…`) stays with its lines rather than in the credits
   module: moving it would have reordered facts for no gain, and the credits module holds the
   one switch they all turn on.

2. **The constants are a module, not a block.** `virginiaConstants.xml` replaces the
   `constants:begin` / `constants:end` markers: every fact in it carries a `<TaxYear>` and a
   derived literal, and no `<Day>` or non-zero `<Dollar>` literal may appear in any other
   module. `scripts/check-virginia-constants.py` enforces the same rule by file instead of by
   marker, so a new tax year is one edit in one file whose name says so.

3. **The workbench reads any number of modules.** It discovers `facts/virginia*.xml`, loads them
   into one sandbox, and applies each edit to whichever module holds the fact by path (the
   `file` an edit carries is a hint for the reader, not an address), so a fact that moves
   between modules is still found. A new question's fact goes to the module that holds the fact
   gating it, else the module of a question already on the same screen, else the screens
   module. The page is split into state, shell, draft, runner, chips, dialogs, events and one
   module per view, and the server into the HTTP layer, the workflow, the store and git; the
   hooks object that let two files avoid importing each other is gone, because they can.

4. **One list of the demo households.** `website-static/data/virginia-demos.json` is the one
   place the four demos are described: the IRS scenario each starts from, the dozen keys that
   change (a Virginian's name, address, employer, the residence answer, the Virginia answers),
   the lines the engine alone computes (which `VirginiaSpec` pins), and the result the page
   shows. `scripts/virginia-demos.py build` writes the scenario files from it and `check` fails
   if one drifts; the `?demo=N` link, `make demo-links`, the 50-household harness and the axe
   pass all read it. A fifth demo is a dozen lines.

5. **The routes come from the flow.** The axe pass reads `flow/your-taxes-virginia.xml` and cuts
   it the way Form Builder's `PageSplitter` does under `--singleQuestionPerScreen` (a page whose
   top-level blocks are all `df-screen` divs, more than one, becomes one route per block, named
   by the first four words of its heading); `virginia-stats.py` counts the same way. The
   hand-kept list is gone, so a new screen is scanned without anyone remembering it.

6. **One library under the checks.** `scripts/lib/vafacts.py` reads the modules once: the files,
   every fact with where it sits, each dependency resolved the way the engine resolves it, the
   federal export flags. The four check scripts are each their rule and nothing else. The
   independent model in `scripts/lib/virginia-model.cjs` is deliberately not on it.

7. **The two lists of federal reads check each other.** `check-virginia-exports.py` now also
   reads `workbench/federal-inputs.json`: every federal fact the modules read must have a
   stand-in, and every stand-in must be read (`/taxYear` is the workbench's own; the filers'
   `isPrimaryFiler` is how the sandbox builds its two filers). Neither list is derived from the
   other, because the stand-in's type cannot be read off a derived federal fact; the check keeps
   them in step instead.

8. **One line in the IRS's file for the browser.** `website-static/js/virginia.js` imports the
   Virginia scripts; `fg-components.js` imports it once. `virginia-graph.js` holds the two
   helpers four of them had copied (read a fact as a string; save and announce an update).

9. **The 2025 archive is fetched, not vendored.** `direct-file/` was 570 MB nothing in the
   Virginia work reads; `make fetch-archive` (`stack/fetch-archive.sh`) clones it at the pin in
   `IRS_PINS.md` when someone wants the "before" or the port's `make transpile`, and git ignores
   the folder. `make bump-pin` moves its row without a subtree pull.

10. **A reorder of the engine bundle is never copied.** `make copy-fg` compares the sorted lines
    of the fresh Scala.js build with the vendored copy and keeps the vendored one when only the
    order differs, so the four-megabyte no-op diff cannot ride along in a commit.
    `stack/check-vendor-drift.sh` and the doctor warning that pointed at it are gone.

11. **The mockups are course material.** The three HTML mockups moved from the port's docs to
    `report/mockups/`; the workbench is the working version of two of them, and the theme
    mockup is design history. Nothing in the port links to them any more, so the handoff
    carries no stale pictures.

12. **Not a second state, yet.** Every script, module and path says Virginia (`va`,
    `virginia*`). A `STATE=` parameter and a `states/va/` layout would be the next shape if a
    second state were added, and this layout makes that a mechanical move: the modules, the
    manifest, the library and the workbench each have one place that names the state. With one
    state it would be speculation, so it is recorded here and not done.

## Consequences

- `make check` runs the demo manifest check beside the others; `make demo-links` prints from
  the manifest; `make workbench-check` and the workbench read ten modules.
- The federal-file touch list in ADR-002 shrinks by the lines of `fg-components.js` and gains
  nothing: the modules, the manifest, the entry point and the library are all new files.
- A clone is about 150 MB instead of 700 MB, and `make fetch-archive` is one more command for
  the few who want the archive.
- `docs/changing-the-return.md` has a row for "a new module of rules" and no longer tells
  anyone to edit a route list.
- Stored workbench changes from before this record carry `file: "virginia"`; they still apply,
  because the edit finds its module by path.
