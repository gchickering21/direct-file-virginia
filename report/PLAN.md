# Project plan: a Virginia state filer built on IRS Direct File's public code

Course: Digital Public Infrastructure, Georgetown, fall 2026.
Assignment option: **(2) a clickable prototype or demo showcasing proposed changes to an
existing government product, and how it would benefit its users.** The report gives
case-study depth by answering the course's five key questions, but the submission is a
prototype of a proposed change, because Direct File itself was studied in class.

Due: end of semester, early to mid December 2026. Written 2026-10-19.

## 1. The argument

**Government code published in the public domain is reusable public infrastructure.**
The IRS published Direct File's source (public domain in the US, CC0 worldwide) and then
suspended the service. A state with an income tax and no free filing option could take
that code and stand up its own filer. We show it with Virginia: residents have no free
state option, Virginia never joined Direct File, and nothing in the code is Virginia's.

The proposed change to the existing product is a Virginia state return computed inside
Direct File's own interview and rules engine. The benefit to users is a free, guided,
plain-language way to file a Virginia return where none exists today.

## 2. Deliverables

| Deliverable | What it is | Owner |
|---|---|---|
| Report | ~15 double-spaced pages organised around the five key questions, APA 7 citations | Questions 1–4: teammates. Question 5 and the build sections: Graham |
| Executive summary | One single-spaced page, written last | Whole group |
| The "before" | The real 2025 federal Direct File running locally from the public code | Graham |
| The "after" | The same app with a Virginia return added, in the same codebase | Graham |
| The diff | The git difference between the two, plus screenshots at fixed points | Graham |
| The explainer | The static demo (`demo/`) with its rule explorer, used for figures and for the technology question | Graham |

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

## 4. Repository layout and the plug-in contract

```
direct-file/   IRS-Public/direct-file at e365f9f, squashed subtree. The real app.
               Virginia changes are ordinary commits here, so `git diff a469349 -- direct-file`
               is the change set.
demo/          The static explainer. Builds from ../direct-file into demo/site/.
report/        This plan, the source list, figures, drafts.
deploy/        Later. What a host needs to serve each piece.
```

The contract that keeps a later Federal Data Sharing Watch (FDSW) integration cheap:

- `demo/site/` is one static folder, relative URLs, no assumed root, built by one command
  from a clean clone with no network. FDSW today builds the demo from sources inside its
  own repo; the future shape is a Dockerfile stage that clones this repo at a pinned
  commit, runs that command, and copies `demo/site/`. FDSW then holds a pin and a route.
- The full Virginia filer (Spring Boot API, three Postgres databases, Redis, the client) is
  a separately deployable stack. If it goes live it is its own service, linked from the
  explainer, never embedded. `deploy/` is written only when that is decided.

Decision taken: static explainer embedded, full app linked.

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

Scope, fixed now: **a single filer with W-2 wages only. Form 760 from federal adjusted
gross income to Virginia tax owed: filing status, Virginia AGI, standard deduction,
personal exemption, the rate schedule.** No credits, no itemizing, no dependents, tax
year 2024 (the year the repo's rules model: `CURRENT_TAX_YEAR = '2024'`).

Mechanically:

1. One new fact module `virginia.xml` beside the federal modules in
   `direct-file/direct-file/backend/src/main/resources/tax/` (symlinked into the client
   as `fact-dictionary/generate-src/xml-src/`). It reads federal AGI and filing status
   and derives the Virginia lines.
2. One flow chunk of screens in `df-client/df-client-app/src/flow/flow-chunks/`,
   gated so it appears after the federal review for Virginia residents.
3. Wording in `locales/en.yaml` (Spanish deferred; note it as a gap).
4. A Virginia summary screen showing the computed lines.
5. One hand-computed Form 760 for the chosen test scenario, checked against the engine.
   This is the acceptance test.

Findings to write up regardless of how far the build gets: Virginia must consume the
federal computation (why states depended on the federal export); identity and
submission are the two layers a state must supply itself; the engine and interview are
tax-agnostic and carried over untouched.

### D. The explainer (Graham, small, alongside B)

Repoint `demo/scripts/paths.mjs` at `../direct-file`, drop the fetch script and the
`vendor/` ignore, confirm `npm run build` and `npm test` pass in the new home. Later, if
C lands early, load `virginia.xml` into the rule explorer so one figure shows federal and
state facts in a single dependency graph.

### E. Before and after capture (Graham)

A scripted walkthrough of one backend test scenario through the stock app, then the same
through the Virginia build. Screenshots at the same fixed points; the diff; a short
screen recording if there is a presentation.

### F. Deployment (deferred)

Only after the report is drafted and only if the group wants it reachable from FDSW.

## 6. Sequence

| Weeks of | Build (Graham) | Report (teammates) |
|---|---|---|
| Oct 20 | B: stack up. D: explainer repointed | Source list, citation style, outline |
| Oct 27 | C1–C2: fact module and screens | Questions 1 and 2 drafted |
| Nov 3 | C3–C5: wording, summary, hand check | Questions 3 and 4 drafted |
| Nov 10 | E: capture, diff, figures | Figures for Q3 from the explainer |
| Nov 17 | Question 5 drafted | Full draft assembled, peer read |
| Nov 24 | Revisions | Revisions |
| Dec 1 | Executive summary, final read | Executive summary, final read |

## 7. Decisions taken and assumptions

- Option 2, prototype of proposed changes. Direct File was studied in class, so option 1
  is out.
- State: Virginia (over Maryland, which had a 2025 integration to reconstruct, and
  Massachusetts, which already runs its own state filer; New Hampshire has no individual
  income tax since its interest-and-dividends tax ended).
- Demo form: the real app modified in place. The diff is the evidence.
- Scope: the minimal slice above. Smaller is better; the claim is reuse, not completeness.
- Tax year 2024, matching the repo.
- Citation style APA 7 (assumption; change in `report/SOURCES.md` if the group prefers).
- Licence for what we write: CC0, matching the IRS code (assumption).
- Nothing is branded as the IRS or Virginia Tax; "proposed" screens say so on the screen.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Archived repo fails to build on current toolchains | Fallback in B; try early |
| Docker VM disk exhaustion mid-build | Check free space first; reclaim anonymous volumes only |
| A Virginia figure wrong on a slide | Hand-computed Form 760 as the acceptance test |
| Scope creep into a full state return | Scope is fixed in §5C; anything beyond goes in a "future work" list |
| Numbers cited from memory | Every figure in §5A has a primary source before it enters a draft |
