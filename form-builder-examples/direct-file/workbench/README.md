# Virginia Rules Workbench

A place where policy staff and engineers change the Virginia return together. Policy staff start a
change from the law, set values by tax year, change rules in plain language, add a question the
return does not ask yet, and change the words on a screen. The workbench writes the change into
`facts/virginia.xml`, `flow/your-taxes-virginia.xml` and `locales/virginia_es.yaml`, checks it
against worked examples, and publishes it only after a policy reviewer, an engineer and (when words
change) a translator have approved.

It is the working version of the two mockup sets, [rules-workbench.html](../docs/virginia/mockups/rules-workbench.html)
(values, rules, examples, review, requests) and [law-to-screen.html](../docs/virginia/mockups/law-to-screen.html)
(the law, tax years, the question builder, the words, the footprint, the publish rail). It is a
prototype: there is no sign-in, and the review workflow is stored in local files; a pull request per
publish is optional (`WORKBENCH_GIT_PR=1`).

```bash
make workbench          # http://localhost:3011   (or: node workbench/server.mjs)
make workbench-check    # every worked example against virginia.xml, from the command line
```

It needs Node 18 or later and nothing else: no build step, no `npm install`, no JVM. It uses the
same Fact Graph engine the site uses (`website-static/vendor/fact-graph/factgraph-3.1.0.js`). With
`xmllint` installed (it is on macOS and most Linux), the published file is also checked against
`facts/FactDictionaryModule.rng`; without it, that one check is skipped and the page says so.

The port is 3011 because 3008 is the site and 3009 is Author Mode (`AUTHOR_PORT` in the Makefile).
`PORT=…` overrides it.

## How it is used

Pick who you are in the top right, and the tax year you are looking at beside the title. Five
fictional people stand for the four roles ([data/people.json](data/people.json)):

| Role | Can |
|---|---|
| Policy author (Morgan T.) | Start a change (from the law or by title), set values by year, edit rules, add questions, edit screen text, write worked examples, ask engineering for what the return cannot model, send a draft for review |
| Policy reviewer (Jordan R.) | Give the policy approval: does it say what the law says? |
| Engineer (Alex K., Sam P.) | Edit too, give the engineering approval, publish, and build what was requested |
| Translator (Ana P.) | Enter the Spanish for the words a change adds or changes, and give the translation approval, on changes that touch words |

There are two engineers because the engineering approval must come from an engineer who is not the
author. With one, a change an engineer started could never be published.

The work goes like this:

0. **Start from the law** (optional). "Start a change from the law" takes what changed (an Act, a
   Tax Bulletin, the instructions, a correction), the citation, the pasted text and the tax year it
   takes effect. The tool proposes what it touches: the values whose citation the Act names (with
   the figures in the text as candidates), the screens that quote those figures, a question if the
   law turns on something the return does not know, and a request if it cannot be modelled. Each
   proposal is a suggestion the author opens or ignores; nothing is written from it.
1. **Find the line.** The home page is Form 760 line by line, with the statute for each. Every
   "§ 58.1-3xx" in the workbench is a link to that section of the Code of Virginia.
2. **Change a value** (the Values page) **or a rule** (click a line). The first edit starts a draft.
   - The Values page is **values by tax year**: a column per year, a figure either set by a law for
     that year or carried forward from the year before. Typing into a later year writes the value as
     a rule on the return's `/taxYear` (a `<Switch>`, newest year first, oldest figure as the
     "otherwise"), so the site built for a season picks its own figure and no build step has to know
     about years. Setting the next year to 0 ends a value. The panel beside the table says which
     season's site carries the change and that the live one is not rebuilt.
   - A value edit needs a source: where the new number comes from. When the change is published, the
     source becomes the last sentence of the fact's `<Description>` ("Source: …, effective … (workbench
     change #N, date; was X)."), replacing the sentence a previous change wrote, so the citation stays
     next to the number in the code and nothing accumulates.
   - A rule reads as *If … then … else if … otherwise*. Every blank is a choice from things the
     return already knows: a question the filer answers, a value, another line, or a federal fact.
     Amounts are typed in. You can add an exception (it is checked first), reorder cases, and add
     "no less than" or "no more than" limits. Each rule edit needs a "why". Switching a comparison
     keeps both sides; a new comparison gets a blank of the left side's own type (a date for a date,
     yes for a yes/no), and "is yes" is only offered for a yes/no fact.
   - The **XML** tab is the same rule as code. Engineers can edit it there, and the plain view
     updates from it. An operator the plain view has no sentence for is shown read-only with an
     "edit in XML" button.
3. **Add a question** when a rule turns on something only the filer can say (Questions asked →
   "Ask the filer something new", or from the rule editor). Five answers: the wording (with a small
   style check: one question, under twenty words, spoken to "you", no legal words), the kind of
   answer (yes/no, dollars, a date, a number), who gets asked (everyone, or only filers who answered
   yes to an existing question: that becomes the screen's condition), where in the flow (a follow-up
   on an existing screen, or its own screen right after it, which renumbers "Question N of M" in
   English and Spanish), and the help text with the law. A preview draws the page as the filer sees
   it. Saving puts one `question` edit in the draft, which at publish writes the writable fact, the
   `df-screen` block with its `<fg-set>`, the Spanish keys (English, flagged "needs translation"),
   and a starting answer in the examples' baseline. The new fact is in the rule editor's picker at
   once, as *Asked · in draft*, so the exception can be written in the same draft.
4. **Change the words** (Screens filers see → a screen). Each paragraph and heading is editable in
   English with its Spanish beside it. A typed figure that matches a value ("$4,000") can be made
   live, which replaces it with `<fg-show>` of the value so the next change never leaves it stale;
   the panel on the right lists everywhere else the figure is typed. A changed English string gets a
   new content-addressed key; the Spanish is carried to the new key and marked out of date until the
   translator replaces it.
5. **Watch the worked examples.** Every edit reruns all of them in the browser and shows which
   households get a different result. If the law now says the new answer, "Expected: update" puts
   the new expected answer into the same change, so the reviewer sees it. An example for a later
   year sets `/taxYear` in its inputs. "What it touches" on the change page is the footprint on one
   page: values, rules, questions, strings (and how many await Spanish), examples that move, federal
   files (always zero), and the screen before and after.
6. **Send for review.** The server refuses if the examples do not pass, the rules do not load, a
   changed file would not fit its schema (the facts' `FactDictionaryModule.rng`, the flow's
   `FlowConfig.rng`), a value has no source, a new question has no law, the draft waits on a request,
   or another open change already edits one of the same facts (one change per fact at a time).
7. **Approvals.** The reviewer reads the plain summary; the engineer reads the code diff; when
   words change, the translator enters the Spanish on the change page and gives the third approval,
   which the server refuses while any string is still English. The author cannot approve their own
   change, whichever role they have. The rail across the top of the change shows where it is: draft,
   checks, approvals, publish (or pull request), built into which season's site, live when.
8. **Publish** (an engineer). The server applies the change to the files *as they are at that
   moment*, reruns every example, reads the files once more, and writes nothing unless all of that
   holds. If someone changed the same rule in the meantime, it reports a conflict instead of
   overwriting their work. Every publish is appended to `data/audit.jsonl` (who, when, which change,
   which files, the commit or pull request if any), which the History page shows and which is meant
   to be committed. **Roll back** on a published change drafts a new change that undoes it (values,
   rules, text, the question and its screen and words, the examples it added), through the same
   checks and approvals; nothing is edited in place.

When the return cannot model what the law needs (a federal fact it does not export, a carryforward,
a collection), the author **asks engineering** (Requests). The request is the spec: the law, the question's
wording, the answer type, and examples it must get right. It appears in the rule editor as
*Requested #N* straight away, so the author can write the rule. The draft cannot go to review until
an engineer has added the fact and its screen and marked the request built.

### Reports

Four read-only pages, each computed from the files as they are when you open it:

| Page | What it shows |
|---|---|
| **Coverage** | Every Form 760 line and Schedule ADJ item the rules name (found by the `Form 760 Line N` / `Schedule ADJ Line N` pattern in `<Name>`): whether it is modelled (`<Derived>`), a records stand-in (`<Writable>` with a `<Placeholder>`, Lines 20 to 22), or a filer question (`<Writable>`), and how many worked examples assert on it. Modelled lines no example checks are called out |
| **Export contract** | Every federal fact the Virginia modules read, whether the federal dictionary exports it to states (`stateSystems="true"` or `mef="true"`, the rule in ADR-001 and `scripts/check-virginia-exports.py`), the stand-in in `federal-inputs.json` and its type, with mismatches flagged |
| **Spanish** | The Virginia screens' English keys in `locales/flow_en.yaml` (generated by a build) with no entry in `locales/virginia_es.yaml`, and stale Spanish keys the English no longer has. The same key logic as `scripts/merge-virginia-es.py` |
| **History** | The last twenty publishes from `data/audit.jsonl` |

They are at `/api/reports/coverage`, `exports`, `spanish` and `audit` as JSON, for scripts.

### Committing each publish, or opening a pull request

Off by default, so the workbench's writes do not get in the way of whoever is committing the
checkout. With `WORKBENCH_GIT_COMMIT=1`, a publish also runs `git add` and `git commit` on the files
it wrote (the fact files, the flow, the Spanish and the examples, those that changed), in the
repository that holds them. The message is the change's title and plain summary with a
`Workbench-Change: #N` trailer, and the commit hash is recorded in the change and in the audit log.
Files outside any repository are written and not committed.

With `WORKBENCH_GIT_PR=1` instead, a publish makes a branch `workbench/change-N`, commits the files
on it, pushes it, opens a pull request with `gh pr create` (the plain summary, the law, the
approvals and the publisher as its body), records the URL, and returns the checkout to the branch
it was on. It needs `git`, a signed-in `gh` and a remote; the publish succeeds and reports the git
error otherwise. The pull request is the audit trail a real deployment would use, and nobody on the
policy side has to open it.

```bash
WORKBENCH_GIT_COMMIT=1 make workbench
WORKBENCH_GIT_PR=1 make workbench
```

### A second opinion at verify

When `scripts/lib/virginia-model.cjs` exists (the independent model of the rules written from the
Code of Virginia, exporting `model(inputs) -> lines`), verify and `check.mjs` also run every
example's inputs through it and report the lines where the engine and the model disagree. These are
warnings, not failures: the model's inputs need not match the sandbox's one for one. The workbench
maps what it can (AGI, status, date of birth, 65 or older, blind, dependents, wages, Social
Security, the federal EIC, withholding, locality, untaxed purchases, military pay and benefits,
Commonwealth Savers, unemployment, payments) under the names `scripts/virginia-cases.cjs` uses, and
compares whatever the model returns under a fact path, a line number, or those short names. Without
the file, or if it throws, verify goes on as before. `WORKBENCH_MODEL=…` points at another file.

## What is where

| Path | What |
|---|---|
| `server.mjs` | Static files, the API, and the workflow rules. Reads the fact files fresh on every request |
| `check.mjs` | The command-line check: `node workbench/check.mjs [--change <id>]` |
| `lib/sandbox.js` | The Virginia sandbox and the example runner. Runs in the browser and in Node |
| `lib/xml-edit.js` | Applying a change to the files (values, schedules by year, rules, questions, text, their reversal), the source sentence, conflict detection, the translation needs, the line diff |
| `lib/flow.js` | The Virginia flow file: its pages, screens, texts and questions, each with the locale key form-builder gives it; inserting a screen, replacing a text, renumbering eyebrows |
| `lib/locale.js` | `locales/virginia_es.yaml` read and edited as text: set, rename and remove a key, keep the translator's formatting |
| `lib/md5.js` | MD5, because the locale keys are `tag-` plus six hex digits of the MD5 of the element's inner markup |
| `lib/law.mjs` | What a pasted law seems to touch: values by citation and figure, screens by figure |
| `lib/validate.mjs` | What the server accepts: the shape of a change, each literal type, a rule's XML (one `<Derived>`, known operators only), the schema through xmllint |
| `lib/reports.mjs` | Coverage, the export contract, the Spanish status, and the small YAML key reader they use |
| `lib/oracle.mjs` | The hook for `scripts/lib/virginia-model.cjs` |
| `lib/node.mjs` | Where the files are; loading the engine in Node |
| `ui/` | The page: `app.js` (the first set of views and events), `extra.js` (the law, values by year, the question builder, screens, the footprint, the rail, the Spanish panel), `model.js` (rules as trees, plain language ⇄ XML; values by year), `worker.js` (runs examples off the main thread) |
| `federal-inputs.json` | The federal facts Virginia reads, and how the sandbox stands each one in |
| `examples/virginia.json` | The worked examples. Authored here, not in `scenarios/`, which `make export-scenarios` regenerates |
| `data/people.json` | Who can act, and in which role |
| `data/audit.jsonl` | One line per publish. Committed |
| `data/changes/`, `data/requests/` | The workflow state, one JSON file each. Not committed |

## How it works

**The sandbox.** The workbench does not load the 36 federal modules. It loads `virginia.xml` and
`virginiaLocalities.xml` beside one writable stand-in for each federal fact they read, listed in
[federal-inputs.json](federal-inputs.json). That makes a worked example a short list of answers
("federal AGI is $40,000") instead of a whole federal return, and it is ADR-001's integration rule
made concrete: Virginia may read only what the federal return hands to states. If `virginia.xml`
starts reading a federal fact that is not on the list, `check.mjs` fails and names it.

One consequence: in the sandbox, *65 or older* and *date of birth* are separate inputs (in the real
return one is derived from the other), so an example has to keep them consistent.

Per-filer facts are mapped onto the two filer items the sandbox always carries: `/primaryFiler/x` is
the primary filer's `/filers/*/x`, and `/vaSpouse/x` (or `/secondaryFiler/x`) is the second
filer's, the one `virginia.xml`'s `/vaSpouse` finds by the exported `isPrimaryFiler` flag. So a joint
example can say `"/vaSpouse/dateOfBirth": "1958-03-03"` and `"/vaSpouse/age65OrOlder": true`, and
the spouse's age deduction and Section B exemption follow.

**Edits are text splices.** A value edit replaces one number and rewrites the source sentence of
the fact's `<Description>`. A rule edit replaces that one fact's `<Derived>` block, written in the
file's own style; a schedule edit writes the year switch the same way. A question edit inserts one
`<Fact>` (after the fact that gates it) and one screen block (or page) in the flow, each behind a
`<!-- workbench change #N: /path -->` marker the reversal finds; a text edit replaces one element's
inner markup on one page, which must occur exactly once there. Nothing else in the files is touched,
so the diff is exactly the change. Each edit remembers what it expected to find (compared as a
value, so `20/100` and `1/5` are the same rate), and that is how conflicts are caught.

**Tax years are rules, not a build flag.** The site's year is `/taxYear` in `constants.xml`
(exported to MeF, so the export rule allows reading it). A value set for a later year becomes a
`<Switch>` on it, and the sandbox stands `/taxYear` in as an int an example can set. The `<TaxYear>`
tag the dictionary spec offers is left as documentation: nothing in Form Builder or the engine reads
it. The Values page recognises the switch shape and shows it as columns; any other rule stays a rule.

**Locale keys are reproduced, not read back.** form-builder keys the flow locale files by
`tag-<md5 of the element's inner markup, as scala-xml re-serialises it>`, nested under `tag-N`
levels for tables and lists and under the fact path for `<fg-set>`. `lib/flow.js` computes the same
keys from the flow source (168 of the Virginia screens' 169 keys matched when it was written; the
one that did not was a quoted string, which is why text is canonicalised first), so the workbench
can write the Spanish for a screen that has not been built yet and move Spanish when the English
changes. "Question N of M" is the one string it translates itself.

**Nothing from the page is trusted.** The server checks every edit before it is saved and again
before it is applied: a fact path is letters, digits and slashes; a dollar amount, a fraction, a
whole number or a date fits its type; a rule is one well-formed `<Derived>` element made of known
Fact Graph operators (the common ones plus any the files already use) with no processing
instructions, doctype, CDATA or unknown attributes; and the spliced file must fit the RELAX NG
schema. The value is written with a function replacement, so `$&` in it cannot expand.

**One thing at a time.** Each change has its own lock around load → check → save, and publishes
take one more, so two clicks cannot interleave and two publishes cannot race for the file.

**The seed examples** were checked two ways when they were written: by the engine, and by the
independent model of the rules in `scripts/virginia-cases.cjs`, which is written from the Code of
Virginia rather than from `virginia.xml`. The two agreed on every line.

**Trying it without touching the real files.** Point it at copies:

```bash
WORKBENCH_FACTS_DIR=/tmp/wb/facts WORKBENCH_FLOW_DIR=/tmp/wb/flow WORKBENCH_LOCALES_DIR=/tmp/wb/locales \
WORKBENCH_EXAMPLES=/tmp/wb/examples.json WORKBENCH_DATA_DIR=/tmp/wb/data PORT=3019 node workbench/server.mjs
```

Without `WORKBENCH_FLOW_DIR` and `WORKBENCH_LOCALES_DIR` the copy edits the real flow and Spanish
files; without a flow file beside the rules at all, questions and words cannot be edited and the page
says so.

The copy of the facts directory may carry its own `FactDictionaryModule.rng`; otherwise the real one
is used. The export contract reads the federal modules from the real directory when the copy holds
only the Virginia files. `WORKBENCH_LOCALES_DIR` does the same for the Spanish page.

## What it does not do yet

- **Sign-in.** The person is picked in the page. The server listens on 127.0.0.1 only, and accepts a
  write only when `Host` is this server, `Origin` (if the browser sends one) is this server, and the
  page's own `X-Workbench: 1` header is there, so a page on another site cannot post to it while it
  is open. That is all the protection there is: do not put this on a network.
- **Required reviews on the pull request.** With `WORKBENCH_GIT_PR=1` a publish opens the pull
  request, but the three approvals are still the workbench's own; a real deployment would make them
  the PR's required reviews and drop the JSON files in `data/`.
- **The real preview.** The page previews on the question builder, the screen page and the
  footprint are drawn by the workbench from the flow source. The site build (`make site`) is the
  real page, and `make virginia-a11y` the accessibility check; neither runs from here.
- **Rolling the tax year.** Values by year are in; the rest of a rollover is not: the flow's own
  "in 2024" wording, the records stand-in, and `constants.xml`'s `/taxYear` move by hand.
- **Question wording and options** of an existing question, and `<fg-collection>` screens, are
  edited in the flow by engineering; the screen page shows them read-only.
- **A locality rate editor.** The use-tax rate by locality lives in `virginiaLocalities.xml` as one
  long `<Switch>` over the locality code. Editing it would take a table view of locality → rate with
  the same source rule as a value, writing that one `<Switch>` back in the file's style, and the
  build script that regenerates the locality list (`scripts/build-virginia-zip-localities.py`) kept
  in step.
- **Every operator in plain language.** If/else, comparisons, plus and minus, limits, counts and
  totals render and edit in the plain view. Anything else shows as a labelled block, read-only, to be
  edited in the XML tab.
- **Merging the Spanish.** Publishing writes `virginia_es.yaml`; the generated `flow_en.yaml` and
  the merge into `flow_es.yaml` happen at the next build (`make site`, then
  `scripts/merge-virginia-es.py`), as for any hand edit to that file.
