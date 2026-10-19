# Project plan: a Virginia state filer built on IRS Direct File's public code

Course: Digital Public Infrastructure, Georgetown, fall 2026.
Assignment option: **(2) a clickable prototype or demo showcasing proposed changes to an
existing government product, and how it would benefit its users.** The report gives
case-study depth by answering the course's five key questions, but the submission is a
prototype of a proposed change, because Direct File itself was studied in class.

Due: end of semester, early to mid December 2026. A presentation also exists; Graham will
plan it later. Written 2026-10-19.

Repository: github.com/gchickering21/direct-file-virginia (private until handoff).

## 1. The argument

In one sentence (Graham, 2026-10-19): **we are not recreating federal filing; we are
leveraging what the federal government built, showing how Virginia could implement its
own state return on it and integrate with the federal filing system if it ever came
back, with a few pieces of Virginia tax code as prototype examples.**

**Government code published in the public domain is reusable public infrastructure, and
the IRS has shown it itself.** The IRS published Direct File's source (public domain in the
US, CC0 worldwide), suspended the service, and then kept the reusable part: the Fact Graph
rules engine became a standalone library (3.1), a declarative presentation layer (Form
Builder) grew out of it, two live irs.gov tools were rebuilt on it in 2026, and the IRS
ported Direct File's whole interview onto that stack as a reference application. A state
with an income tax and no free filing option could build its own filer on that maintained
toolchain today. We show it with Virginia: residents have no free state option, Virginia
never joined Direct File, and nothing in the code is Virginia's.

The proposed change to the existing product is a Virginia state return added to the
IRS's own port of Direct File on Form Builder: one Virginia fact module beside the 3,030
federal facts, one Virginia flow module beside the federal screens. The benefit to users
is a free, guided, plain-language way to file a Virginia return where none exists today.
The archived 2025 application, which we also run, is the "before" and the product history.

## 2. Deliverables

| Deliverable | What it is | Owner |
|---|---|---|
| Report | ~15 double-spaced pages organised around the five key questions, APA 7 citations | Questions 1–4: teammates. Question 5 and the build sections: Graham |
| Executive summary | One single-spaced page, written last | Whole group |
| The "before" | The real 2025 federal Direct File running locally from the archived code (done 2026-10-19), and the IRS's port of it on Form Builder | Graham |
| The "after" | The port with a Virginia return added: a Virginia fact module and flow module | Graham |
| The diff | The git difference on the port, plus screenshots at fixed points in the archived app and the port | Graham |
| The explainer | The IRS's own tools over the port: Browse All, Fact Explorer, Author Mode. They draw the federal and Virginia facts in one graph, which is the figure for the technology question | Graham |

## 3. The five questions and what answers them

1. **Objective and public need.** The Inflation Reduction Act §10301 feasibility study
   ($15M), the Free File Alliance history (2002 agreement, non-compete clause, removed
   2019), the cost of filing for simple returns. Research only.
2. **Users, accessibility, inclusivity.** Who was eligible and who was turned away. The
   repo's eligibility rules and knockout screens are the primary source; the pilot and
   2025 reports give the counts. Spanish-language support, screen-reader work, mobile.
3. **Technology, development, challenges.** The Fact Graph (declarative, Scala, compiled
   to JavaScript for the browser), the XML fact dictionary, the 727-screen interview as
   configuration, the in-house build with USDS and GSA. The explainer's rule explorer
   makes a figure here. Challenges from the IRS's own after-action report and ADRs in
   `direct-file/docs/`.
4. **Policy alignment and governance.** Permanence announced May 2024; suspension in
   2025; the GAO's Congressional Review Act decision; what a service that depends on
   executive priority rather than statute means for states that built on it.
5. **Effectiveness and improvements.** Adoption against the eligible population (TIGTA
   2025), satisfaction (Treasury 2024). Then our improvement: the Virginia filer, the
   before/after, what carried over from the federal code, what had to be written, and
   what a state could not do with the code alone (file federally, authenticate residents).

## 4. Three audiences, one repository

The same work has to serve three readers who want different things, and the layout is
chosen so that serving one never costs the others:

| Reader | Wants | Gets |
|---|---|---|
| The course | the report and a demo of the proposed change | `report/`, `demo/`, the before/after |
| Federal Data Sharing Watch (FDSW) | to embed the explainer on its homepage and link the running filer | the plug-in contract below |
| Virginia's Chief Transformation Officer (Graham has the contact) | to see whether the state could actually use this, and to hand it to their own engineers | the handoff package below |

```
direct-file/            IRS-Public/direct-file at e365f9f, squashed subtree. The archived 2025
                        app: the "before". Never modified.
fact-graph/             IRS-Public/fact-graph, squashed subtree at a pinned commit. The engine.
form-builder/           IRS-Public/form-builder, pinned. Flow XML + dictionary → static site.
taxpert/                IRS-Public/taxpert, pinned. Fact Explorer, Browse All, Author Mode.
form-builder-examples/  IRS-Public/form-builder-examples, pinned. Its direct-file/ is the
                        IRS's port of Direct File. ALL Virginia work is commits inside
                        form-builder-examples/direct-file/, so the change set is
                        `git diff <squash> -- form-builder-examples/direct-file`.
stack/ + Makefile       How we run the archived app (overrides outside its tree).
report/                 Course material only: this plan, notes, sources, figures, drafts.
handoff/                The state-facing package (§5G). Written for a state engineering team.
deploy/                 Later. What any host needs to serve each piece. Never FDSW-specific.
```

The five IRS repositories sit as siblings at the root because that is the layout the
IRS's own Makefiles, Dockerfiles and compose files resolve against (`../../fact-graph`
from inside an example application). Each is a squashed subtree at a pinned commit, so a
clean clone builds without network and the IRS's fast-moving `main` cannot change our
result underneath us. Moving a pin is a deliberate commit.

### The plug-in contract (FDSW)

- The Virginia filer on Form Builder is **static HTML plus the engine in the browser**:
  one output folder from one build, no API, no database, no login. That is what FDSW
  would serve, behind a path, from a Dockerfile stage that clones this repo at a pinned
  commit and runs the port's build. FDSW then holds a pin and a route.
- The archived 2025 app (Spring Boot, Postgres, Redis, the simulator) is never deployed;
  it is the local "before" only.
- The IRS's inspection tools (Fact Explorer, Browse All) can be served the same way or
  linked. `deploy/` is written only when that is decided.
- Nothing in this repo names or imports FDSW. The contract is one-directional: FDSW
  knows about this repo, this repo knows nothing about FDSW.

Decision taken 2026-10-19 (revised): the static Form Builder output is what gets embedded; the
archived app is never deployed; the static explainer in `demo/` was retired in favour of
the IRS's own tools.

### The handoff contract (Virginia)

The Virginia work must be separable from everything else here with no loss, so that a
state team receives the IRS's code plus a small, readable set of changes and nothing
about our course or our other project.

- **The change set is portable.** Every Virginia change is a commit under
  `form-builder-examples/direct-file/` on top of that subtree's squash commit, touching
  only the IRS tree. `handoff/export.sh` runs `git format-patch` over those commits so
  they apply to a fresh clone of IRS-Public/form-builder-examples at the pinned commit. A
  state team never needs our repository; they take the IRS repositories they would start
  from anyway (the five above, at the pins we record) and apply the patches. Better
  still, the Virginia fact module and flow module are two XML files a state could drop
  into an application generated from `form-builder-template`.
- **No entanglement.** The Virginia commits do not reference `report/`, `stack/` or
  FDSW.
- **Licence they can accept.** The IRS code is CC0. Everything we add is CC0 too, stated
  in `LICENSE` at the root and repeated in `handoff/README.md`, so a state attorney has
  nothing to negotiate.
- **No branding, no claims.** Nothing is styled as the IRS or Virginia Tax. Every proposed
  screen says on the screen that it is a demonstration. Figures are labelled with the tax
  year and the instructions they came from.
- **Runs in fifteen minutes from a clean clone**, with no secrets and no dependency on
  any of our machines: the IRS's own `make up` on the port, plus the patches. Static
  output; a state can open it from a file share. The hand-computed Form 760 check (§5C)
  ships with it as the acceptance test.
- **Honest about the gap.** `handoff/README.md` says plainly what a state would still have
  to build: identity for residents, submission into the state's revenue system, the rest
  of Form 760, Spanish, accessibility verification, and that filing the federal return
  would still need the IRS. That list is the most useful page in the package.

## 5. Workstreams

### A. Research and writing (teammates, runs throughout)

- Fix the citation style (APA 7) and a shared source list in `report/SOURCES.md` first.
- Primary sources to pull, each replacing a number we currently hold from memory:
  - Treasury / IRS 2024 pilot after-action report: ~140,800 filers, 90% excellent/above average.
  - TIGTA 2025 audit: ~751,000 registrations, 59% did not submit, 32M estimated eligible.
  - GAO decision that the suspension was not a rule under the Congressional Review Act.
  - IRA §10301 appropriation text; the 2019 Free File Alliance MOU change.
  - The 25 states in 2025 and which used Code for America's FileYourStateTaxes.
  - Virginia: when and why it ended its own free online filing tool; what residents use now.
  - Virginia Form 760 instructions, tax year 2024: standard deduction, rate schedule,
    personal exemption, age deduction thresholds.
- Draft questions 1–4 in parallel with the build; they do not depend on it.

### B. Stand up the real service (Graham, the gate)

From `direct-file/direct-file/`: `docker compose up -d --build`, then `npm install` and
`npm run start` in `df-client`. Login through the bundled CSP simulator with any email.
The MeF submit and status services are excluded by the IRS, so returns compute but do not
transmit. First build compiles Java 21 and Scala in Docker; check Docker VM disk first
(want >10 GB free). Done when one backend test scenario can be entered end to end.

Fallback if the pinned commit no longer builds: the static explainer becomes both before
and after. Weaker diff argument, project still whole.

### C. The Virginia return (Graham)

Scope, fixed now: **a few prototype rules, not a return.** A single filer with W-2
wages, tax year 2024 (the year the dictionary models). Form 760 from federal adjusted
gross income to Virginia tax owed: filing status, Virginia AGI, the standard deduction,
the personal exemption, the rate schedule, and one Virginia-specific subtraction or
deduction chosen because it shows state policy expressed in rules (candidates: the age
deduction, or the subtraction for Virginia lottery prizes under $600). Each rule is an
example; together they are not a filing.

**The integration half.** The federal dictionary already marks which facts leave the
federal return for a state: 57 facts in 9 modules carry `<Export stateSystems="true"/>`,
and the state API sent exactly those (plus the MeF XML) to a state's software in 2024 and
2025. The Virginia module therefore **depends only on exported federal facts**. That is
the whole integration argument in one design rule: if Direct File came back, the state
API's existing export would feed this module unchanged; and today, running inside the
port, the same facts are read from the federal graph directly. A test enforces the rule
(every `<Dependency>` in `virginia.xml` that crosses into a federal module names a fact
with `stateSystems="true"`), and the policy map's "source" column says which export each
Virginia line consumes.

Mechanically, all inside `form-builder-examples/direct-file/`:

1. One new fact module `facts/virginia.xml` beside the federal modules (the port carries
   Direct File's dictionary over unchanged: 3,030 facts in 36 modules). It reads federal
   AGI and filing status and derives the Virginia lines. It is written to the Fact
   Dictionary 3.1 specification (`fact-graph/docs/fact-dictionary-specification-3.1.md`)
   and validates against the `FactDictionaryModule.rng` schema the port ships.
2. One flow module `flow/virginia.xml` in Flow XML, registered in `flow/index.xml` after
   the federal modules and gated on Virginia residency with the residency facts the
   dictionary already has. The port's generated flow is transpiler output and is never
   hand-edited; our module is hand-written and sits beside it, which the port's own docs
   say is the intended next step.
3. Wording in the locale YAML (English; Spanish is a build-time generated file in the
   port, so it may come for free: check, and note it either way).
4. A Virginia summary page showing the computed lines, plus the lines in Browse All.
5. One hand-computed Form 760 for the chosen test scenario, checked against the engine
   through the port's scenario mode. This is the acceptance test.

Findings to write up regardless of how far the build gets: Virginia must consume the
federal computation (why states depended on the federal export); identity and
submission are the two layers a state must supply itself, and the IRS's port leaves them
out on purpose; the engine, the dictionary format and the flow format are tax-agnostic
(the IRS's own SNAP/Medicaid example proves it) and carried over untouched.

Done 2026-10-19: the archived app runs end to end (`make stack-up`, `make client`,
login at http://localhost:5000/df/file). Four rotted pieces are fixed in
`stack/overrides.yaml`; see `report/NOTES.md` and `CONTRIBUTING.md`.

### B3. Stand up the IRS's port of Direct File on Form Builder (Graham, the new gate)

From `form-builder-examples/direct-file/`: `make up` (Docker; builds fact-graph and
form-builder inside the image, generates the site, serves it with a regenerating watcher)
or the native path (JDK 21, sbt 1.11, Node 22, xmllint; `make bootstrap && make dev`).
Four surfaces: the flow at `/app/direct-file/`, Browse All at `/all-screens/`, Author
Mode at `/author/`, and Fact Explorer from the taxpert stack. Done when one federal
scenario walks through the port and Fact Explorer shows the federal facts. The Docker
path needs the Docker VM enlarged first (it was at 4 GB free after the archived app's
build); the native path needs a JDK 21 and sbt on the Mac. Decide which on the day.

### B2. Contributor setup (Graham, right after B)

Teammates run the full stack, all on Macs. `CONTRIBUTING.md` at the root: the IRS
onboarding steps that actually mattered on this machine, the three compose services to
start (`api`, `csp-simulator`, `state-api`; the monitoring and email services are not
needed), the Node version from `df-client/.nvmrc`, how to log in through the simulator,
how to load a test scenario, and the branch convention (one branch per policy concept,
rebased onto main before merge, §9.4). Checked by one teammate on a clean Mac before
week 2.

### D. The explainer (retired 2026-10-19)

The static explainer in `demo/` was built, moved here and verified, then retired the same
day when the IRS's own tools turned out to do its job better: Browse All shows every
screen, Fact Explorer draws the dependency graph, Author Mode edits the flow in place.
The published page stays at its artifact link as history
(https://claude.ai/artifact/TsyR5k7s8uc4DmyWQZrkHZ). Figures for question 3 come from
Fact Explorer with the Virginia module loaded.

### E. Before and after capture (Graham)

A scripted walkthrough (Playwright) of one scenario through the archived 2025 app, the
same through the IRS's port, and the same through the port with Virginia. Screenshots at
the same fixed points; the diff on the port; a short screen recording, since there is a
presentation and a recording is the fallback for a live demo.

### G. The handoff package (Graham, after E)

`handoff/README.md` written for a state engineering team, not for the course: what this
is, what it proves, how to run it, the acceptance test, and the gap list. `handoff/export.sh`
producing the patch series. A one-page brief for the Chief Transformation Officer sits in
`handoff/BRIEF.md` and borrows from the executive summary without the course framing. The
package is reviewed by one teammate pretending to be a state engineer who has never seen
our repo.

### F. Deployment (deferred)

Only after the report is drafted and only if the group wants it reachable from FDSW.

## 6. Sequence

| Weeks of | Build (Graham) | Report (teammates) |
|---|---|---|
| Oct 20 | B3: the IRS port running; B2: contributor guide extended for it | Source list, citation style, outline; one teammate checks B2 on a clean Mac |
| Oct 27 | C1–C2: fact module and Flow XML module | Questions 1 and 2 drafted |
| Nov 3 | C3–C5: wording, summary, hand check | Questions 3 and 4 drafted |
| Nov 10 | E: capture, diff, figures | Figures for Q3 from the explainer |
| Nov 17 | Question 5 drafted; G: handoff package | Full draft assembled, peer read |
| Nov 24 | Revisions | Revisions |
| Dec 1 | Executive summary, final read | Executive summary, final read |

## 7. Decisions taken and assumptions

- Option 2, prototype of proposed changes. Direct File was studied in class, so option 1
  is out.
- State: Virginia (over Maryland, which had a 2025 integration to reconstruct, and
  Massachusetts, which already runs its own state filer; New Hampshire has no individual
  income tax since its interest-and-dividends tax ended).
- Demo form (revised 2026-10-19): the IRS's own port of Direct File on its maintained
  Form Builder stack, modified in place. The diff is the evidence. The archived 2025 app
  is the "before". Chosen over the archived app because the IRS itself has moved the
  interview there, a state would start there today, and the result is static HTML a
  state can run anywhere.
- The static explainer is retired; the IRS's inspection tools replace it.
- The four ecosystem repositories are pinned subtrees; moving a pin is a deliberate
  commit, recorded in `IRS_PINS.md`.
- Scope: the minimal slice above. Smaller is better; the claim is reuse, not completeness.
- Tax year 2024, matching the repo.
- Citation style APA 7 (assumption; change in `report/SOURCES.md` if the group prefers).
- Licence for what we write: CC0, matching the IRS code (assumption).
- Nothing is branded as the IRS or Virginia Tax; "proposed" screens say so on the screen.
- The Virginia change set must stay portable to a bare IRS clone (§4). A change that
  needs `demo/` or `report/` to work is in the wrong place.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Archived repo fails to build on current toolchains | Fallback in B; try early |
| Docker VM disk exhaustion mid-build | Check free space first; reclaim anonymous volumes only |
| A Virginia figure wrong on a slide | Hand-computed Form 760 as the acceptance test |
| Scope creep into a full state return | Scope is fixed in §5C; anything beyond goes in a "future work" list |
| Numbers cited from memory | Every figure in §5A has a primary source before it enters a draft |
| The IRS stack is "draft and under-development", pushed weekly, with AI-generated portions disclosed | Pinned subtrees; we build against one commit; the report says what the IRS says about maturity (taxpert `docs/release-status.md`) |
| The Docker path builds two Scala libraries inside the image and the VM is nearly full | Enlarge the Docker VM disk first, or take the native path (JDK 21, sbt) |
| Virginia changes drift into course-only files and stop being portable | `handoff/export.sh` runs in the acceptance check; patches must apply to a bare IRS clone |

## 9. Engineering process for the Virginia work

The Virginia change set is written for a state engineering team as its first reader. The
course and FDSW get what they need from the same work; the state is the one who would run
it. Everything below exists so that a Virginia engineer can, in one sitting, read what we
changed, see which law each line of it comes from, run the proof, and decide.

### 9.1 Principles

1. **The IRS's conventions are our conventions.** The Fact Dictionary 3.1 specification,
   the RELAX NG schemas for both XML formats, the port's `make validate-xml` and
   `make ci`, Flow XML as the examples write it, the ADR format of the ecosystem's own
   ADRs. A state engineer who has read the IRS repo should find nothing new
   to learn in ours. If we are tempted to do something the IRS tree does not already do,
   we write down why in an ADR first.
2. **Every rule names its law.** No Virginia fact exists without a citation. A number
   with no source is a bug, not a placeholder.
3. **Build on what the IRS already modelled for states.** The dictionary already has
   `/filerResidenceAndIncomeState`, `/hasStateFilingIntegration`,
   `/hasNoStateIncomeTax`, the state knockouts, and the 57 facts flagged
   `stateSystems="true"` for export. Virginia hooks into those and reads only exported
   facts; it does not invent a second notion of residency or reach into federal
   internals the state API would never have sent.
4. **Federal behaviour is unchanged, and we prove it.** The IRS's own test suites run
   green before and after every Virginia commit. The Virginia work only adds.
5. **Nothing is specific to us.** No path, host, name or dependency that belongs to our
   machines, the course or FDSW appears in the IRS tree.

### 9.2 Policy traceability

`handoff/POLICY_MAP.md` is the table a Virginia policy analyst reads. One row per
Virginia rule we implement:

| Form 760 line | Virginia Code / instruction | Fact path | Screen | Test |
|---|---|---|---|---|
| e.g. Line 11, standard deduction | Va. Code § 58.1-322.03(1)(b); 2024 Form 760 instructions p. N | `/va/standardDeduction` | `va-deductions` | `virginia.test.ts: standard deduction by filing status` |

Each fact in `virginia.xml` repeats the citation in its `<Description>` so the source
travels with the code, not only with the table. Dollar figures and rates live in one
constants block at the top of the module, stamped with the tax year and the instructions
they came from, the way the federal `constants.xml` does. Changing a figure for a later
year is one edit in one place.

### 9.3 What "done" means for a Virginia change

A commit is done when all of these hold:

- **Traceable.** Every new fact has a `<Name>`, a `<Description>` with its citation, and
  a row in `POLICY_MAP.md`.
- **Tested the IRS's ways.** Both XML files validate against their schemas
  (`make validate-xml`); a ScalaTest for each derived Virginia fact in the port's test
  tree, the way TWE and the EITC Assistant test theirs; one saved scenario for the chosen
  household, loaded through scenario mode, with expected Virginia lines from the
  hand-computed Form 760; the port's Playwright smoke (`make smoke`) still passes.
- **Regression-clean.** The port's own build, validators and tests pass unchanged, and
  every federal screen in Browse All is what it was.
- **Gated correctly.** The Virginia screens appear only for a Virginia resident and only
  after the federal review; every other state's path is byte-for-byte what it was.
- **Honest on screen.** Every Virginia screen says it is a demonstration. Nothing is
  styled as Virginia Tax.
- **Portable.** `handoff/export.sh` produces patches that apply cleanly to a bare clone of
  IRS-Public/direct-file at e365f9f and the tests pass there.
- **Reviewed cold.** One teammate reviews the diff and `POLICY_MAP.md` with no context
  from Graham, checking only: can I tell what this does, where it comes from, and how I
  would know if it were wrong.

### 9.4 Commit discipline

The patch series is the document a state engineer reads first, so it must read as a
narrative:

- One policy concept per commit. Residency gate; Virginia AGI; standard deduction;
  personal exemption; rate schedule; the summary screen. Never a commit that mixes two.
- The subject names the rule; the body cites the law and the form line, states the figure
  and its source, and says what the test proves. Conventional Commits:
  `feat(virginia): standard deduction by filing status (Va. Code § 58.1-322.03, 760 line 11)`.
- No fix-up commits in the series. History is rewritten before export so each patch is
  the finished form of one idea.
- The first commit in the series is an ADR in the ecosystem's own format, under the
  port's `docs/`, saying what we are adding, the scope, the gating choice, and what we
  deliberately left out. The decision travels with the code.

### 9.5 Documentation that ships with the patches

Inside the IRS tree, so the state receives it without our repo:

- `docs/virginia/README.md` in the port: what the two modules do, how to run the
  scenario, the gap list (identity, submission into Virginia's system, the rest of Form
  760, Spanish if not generated, accessibility verification, federal filing still needs
  the IRS).
- The ADR above.
- `POLICY_MAP.md` is mirrored there from `handoff/` at export time.

Outside the IRS tree, for the handoff itself: `handoff/README.md` (how to take this),
`handoff/BRIEF.md` (one page for the Chief Transformation Officer), `handoff/export.sh`.

### 9.6 Confidence for the state

- **The acceptance test is a tax return a person can check by hand.** One household, one
  Form 760 filled from the 2024 instructions on paper, every line compared with the
  engine's. The worked form ships in `handoff/` as a PDF or image beside the scenario.
- **A second check against Virginia's own numbers** where one exists: Virginia Tax
  publishes a tax calculator and rate tables; the scenario is run through those too and
  the match recorded. (Verify that the calculator covers tax year 2024.)
- **The explainer's rule explorer** is the walkthrough for a non-engineer at the state: it
  shows the Virginia lines, which federal facts feed them, and the law behind each.

### 9.7 Working with Virginia along the way

The assignment allows collaboration with a public agency. An early, short conversation
with the Chief Transformation Officer's office would tell us what Virginia would need to
see to take this seriously (their identity provider, how returns enter their system, which
Form 760 lines matter most to them) and would make the gap list theirs rather than ours.
It also turns §9.6 from our checks into theirs.

Decision for Graham: reach out before the build (shapes scope), after the first working
slice (something to show), or at handoff only. The plan assumes after the first slice,
around the week of November 3.
