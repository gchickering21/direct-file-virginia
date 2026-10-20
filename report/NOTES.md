# Working notes

Dated findings from standing the code up and reading it. Each one is a candidate
sentence in the report or a line in the contributor guide; move it there when used.

## 2026-10-19 standing up the stack

- **The archived repo needs a Docker newer than it says.** The compose file uses
  `additional_contexts` (Compose 2.17+, March 2023) and the Dockerfiles declare the
  `docker/dockerfile:1.7-labs` frontend. The IRS onboarding doc says only "make sure
  docker is up-to-date". On a 2017 Mac stuck on macOS 13, Docker Desktop 4.48.0
  (October 2025) is the last installable release and works; 4.49.0 requires macOS 14.
- **The state API no longer builds or runs as published.** Its development profile and
  its tests use a fake state's certificate, `fakestate.cer`, which expired on
  2025-08-30; a second fixture expired 2024-10-24. The unit test
  `CachedDataServiceTest.testRetrievePublicKeyFromCert_Success` fails with
  `E_CERTIFICATE_EXPIRED`, which fails `./mvnw package`, which fails the image build.
  Skipping tests (`MAVEN_OPTS=-DskipTests`) would build the image, but the development
  runtime reads the same expired certificate (`application-development.yaml`,
  `cert-location-override`), so the federal-to-state export would still refuse. This is
  the state integration path, the one states depended on. For the report: a public
  codebase with no maintainer decays on a schedule its fixtures set, and the first thing
  to rot was the part states used. For our build: not needed; the Virginia return lives
  inside the federal app, not behind the export.
- **The API and the login simulator build without changes.** Compose with
  `api csp-simulator` is the minimum stack for the pre-submit flows; `state-api` is
  optional and currently broken as above; the monitoring and email services are never
  needed for development.
- **The client pins Node 18.20.4** (`df-client/.nvmrc`); `npm install` is clean under
  it, with audit warnings only.
- **Resource footprint on the build machine:** the Docker VM needs several GB free for
  the Maven and sbt layers; the MDI stack's startup pinned a core while the build ran, so
  stop other stacks during a first build.
- **Two more things in the compose file have rotted, both fixed outside the IRS tree
  (`stack/overrides.yaml`, applied by the root `Makefile`).** (1) `localstack` is pulled
  by its floating `latest` tag; by October 2026 that image is a licensed product that
  exits with code 55 without a paid token. The newest 4.x community release runs the
  IRS init scripts unchanged. (2) Redis is published on the host at 6379 with no
  variable to move it, so it collides with any other Redis on the machine; the API only
  needs it on the compose network. For the report: an unpinned dependency is a promise
  someone else can break, and the IRS's own guide could not have warned about either.
- **Disk.** A first build of the API image left the Docker VM at 1.2 GB free (build
  cache for the Maven and sbt stages, plus two LocalStack images). `docker builder
  prune` reclaimed 2.3 GB afterwards. Budget 10 GB free for a first build.
- **One more rot item, in the client path.** The login simulator proxies to the Vite dev
  server on the host as `host.docker.internal`. Vite's January 2025 security fix
  (5.4.12) rejects any Host header it was not configured to allow, and the IRS config
  predates it. Vite allows every `*.localhost` name by default, so the override points
  the simulator at the host as `client.localhost` with a compose `extra_hosts` entry.
  Fourth item fixed outside the IRS tree; the tree is still byte-for-byte upstream.
- **The gate is passed (2026-10-19 evening).** Through the simulator: login with any
  email, the welcome page, the IRS data-import mock, the checklist, and the "About you"
  interview with facts saved to the API (the URL carries the primary filer's collection
  id). Driven by a Playwright script against `http://localhost:5000/df/file`; no server
  errors and no page errors. The federal app as published runs.
- **Trap: `docker compose up --build` after a cache prune rebuilds everything.** It
  re-ran the full Maven and sbt build and pushed the VM to 2.6 GB free before it was
  stopped. The Makefile's `stack-up` now builds only missing images; `stack-build`
  rebuilds on purpose.

## 2026-10-19 the engine was not archived with the app

Graham pointed at github.com/IRS-Public/fact-graph. It is the start of a thread that
changes the project's premise. As of October 2026 the IRS-Public organisation holds an
active ecosystem, all CC0, all citing the SHARE IT Act of 2024 (Pub. L. 118-187) as
authority:

| Repository | What it is | State |
|---|---|---|
| `direct-file` | the 2025 application | README: archived, not maintained; last push 2026-06-11 |
| `fact-graph` | Fact Graph 3.1, the rules engine as a standalone library (JVM + Scala.js), with a Fact Dictionary 3.1 specification and an ADR (June–Aug 2025) | created 2025-09-19, pushed 2026-09-01, IRS staff maintained ("development occurs in a private repository and approved changes are pushed in real time"); external PRs not accepted |
| `tax-withholding-estimator` | TWE 2.0, live on irs.gov 2026-02-27, rebuilt on the Fact Graph | maintained |
| `eitc-assistant` | live 2026-04-29, rebuilt on the Fact Graph | pushed today |
| `form-builder` | a Scala library: Flow XML + a fact dictionary + YAML locales → a static multi-language questionnaire site; the generalisation of TWE's and the EITC Assistant's presentation layer | active |
| `form-builder-template` | a cookiecutter that generates a new Form Builder application | active |
| `form-builder-examples` | Credit Assistant, TWE, a SNAP/Medicaid benefits-enrollment demo, and **a port of Direct File's entire `df-client-app` interview onto Form Builder, fact dictionary carried over unchanged, Flow XML generated by a transpiler** | active |
| `taxpert` | inspection tooling: Fact Explorer, Browse All, Author Mode, scenario mode | active; "experimentation over maintainability", not for production |

What this means:

- **The reusable part was extracted and kept.** The Fact Graph 3.1 ADR says in its own
  words that the engine "cannot currently be leveraged to support applications beyond its
  original consumer, Direct File" and sets out to fix that; TWE and the EITC Assistant are
  the proof. The IRS's own position, in the Taxpert ADR, is that the stack applies to "any
  application or government agency (federal, state, local, etc.) building questionnaire
  applications". The thesis "public code is reusable infrastructure" is no longer our
  claim alone; it is the IRS's stated practice, with a maintained toolchain behind it.
- **The archived app is now a historical artefact, and the IRS has re-expressed its
  interview on the maintained stack.** A state deciding today would not start from
  `direct-file`; it would start from `form-builder-template` or the ported Direct File,
  which needs no Spring Boot, no Postgres, no identity provider to run: it is static HTML
  plus the engine in the browser.
- **For the report:** question 3 gains the whole ecosystem; question 4 gains the SHARE IT
  Act as the primary legal source; question 5's "future developments" is now documented by
  the IRS itself. The repositories disclose that "artificial intelligence was used in
  generating portions of this codebase". The stack is labelled draft, not for production.
- **For the build, a decision (see PLAN):** keep the Virginia return inside the archived
  app as planned, move it onto the maintained stack (the ported Direct File plus a Virginia
  fact module and flow module), or do the fact module once and run it in both.

- **The federal-to-state contract is in the dictionary.** 57 facts across 9 modules carry
  `<Export stateSystems="true"/>` (names, dates of birth, relationships, residency
  durations, dependents' status, educator expenses, and so on); the state API exported
  those plus the MeF XML to a state's filing software. A Virginia module that depends only
  on those facts is one that the real export would have fed. That is the design rule for
  the integration half of the project, and a test can enforce it.

## 2026-10-19 standing up the IRS port of Direct File (Form Builder)

- **Homebrew is the wrong way to get a JDK on this Mac.** On macOS 13 Homebrew has no
  prebuilt bottles left, so `brew install openjdk@21` compiles the JDK and OpenSSL from
  source, hours on a 2017 machine. Prebuilt Temurin 21 and the sbt launcher zip, unpacked
  under `~/.dpi-toolchain`, took two minutes (`stack/toolchain.sh`). The IRS's own
  onboarding suggests coursier or SDKMAN for the same reason.
- **The port's bootstrap compiles in under a minute each** for fact-graph (JVM + Scala.js)
  and form-builder once sbt has its own dependencies. Far lighter than the archived app's
  Maven build.
- **One gap in the IRS quickstart:** the port's `make bootstrap` runs the Taxpert UI's
  build script, which imports `rolldown`, a dev dependency of the Taxpert package; a
  `file:` npm dependency does not install the dependency's dev dependencies, so the step
  fails on a fresh clone until `npm install` has been run inside `taxpert/packages/ui`.
  Our `make port-bootstrap` does that first.
- **Gate B3 passed (2026-10-19, late).** The IRS's port runs natively (`make port-dev`,
  http://localhost:3008/app/direct-file) with the Taxpert workspace: Product Experience,
  Path Mode, Browse All, Scenario modal (161 saved fact graphs, filterable by filing
  status, topic and source), Fact Inspector. Loading "Single 33k No Credits" and opening
  the amount pages shows the engine computing in the browser: AGI $34,333, standard
  deduction $14,600, taxable income $19,733, tentative tax $2,135, balance due $901. No
  page errors. That scenario is the candidate Virginia household.
- **Port build times:** fact-graph 13 s, form-builder 23 s, the port's own compile and
  727-screen site generation 30 s, all with sbt warm. The watcher regenerates on edit.

## 2026-10-19 the first Virginia rules compute

- **Hand check, household 1 ("Single 33k No Credits" as a Virginia resident):** federal AGI
  $34,333; no age deduction (born 1997); no Social Security; Line 9 VAGI $34,333, above
  the $11,950 threshold; Line 11 standard deduction $8,500; Line 12 exemptions 1 × $930;
  Line 15 taxable $24,903; Line 16 tax = $720 + 5.75% × ($24,903 − $17,000) = $720 +
  $454.42 = $1,174.42 → **$1,174**. The engine, through the port's summary page: AGI
  $34,333, age deduction $0, VAGI $34,333, standard deduction $8,500, exemptions $930,
  taxable $24,903, **tax $1,174**. Line for line.
- **What it took:** one fact module (`facts/virginia.xml`, 27 facts, every one citing its
  section of Va. Code Title 58.1), one flow module of two pages, `va` added to the federal
  state enum and the residence question, one line in `flow/index.xml`. Both XML files
  validate against the IRS's RELAX NG schemas unchanged. The engine, Form Builder and the
  federal facts were not touched. The watcher regenerated the 140-page site in 22 s.
- **The port's generated `locales/flow_en.yaml` picks up the Virginia strings** on its own;
  it is build output the IRS commits, so we commit it too.
- **Hand check, household 2** (same scenario, born 1955-05-05, wages $56,000): federal AGI
  $57,000; AFAGI $57,000; age deduction $12,000 − ($57,000 − $50,000) = $5,000; VAGI
  $52,000; standard deduction $8,500; exemptions $930 + $800 = $1,730; taxable $41,770;
  tax $720 + 5.75% × $24,770 = $2,144.28 → **$2,144**. Engine: $5,000 / $52,000 / $8,500 /
  $1,730 / $41,770 / **$2,144**.
- **The export check caught a real violation on its first run:** `/claimedDependentsCount`
  is derived inside the federal dictionary and not exported, so a state would never have
  received it. Virginia must count dependents from the per-dependent facts the export does
  carry. The rule is worth having precisely because it is easy to break by reaching for
  the convenient federal fact.

## 2026-10-20 what else was checked

- **Eleven edge households against an independent model of the rules** (a 30-line
  JavaScript oracle written from the Code, not from the XML), through the port's Scenario
  modal: below the filing threshold ($0 and the notice shown); each rate band ($51, $90,
  $370); born 1935 on $90,000 (the full $12,000 regardless of income); 65 on $70,000 (phased
  out to exactly $0); a Social Security filer from the IRS's own corpus (benefits
  subtracted on Line 5 and excluded from AFAGI); a claimable dependent on $3,000 of wages
  (standard deduction limited to $3,000); married filing jointly on $101,499 ($17,000,
  two exemptions, $4,494); blind ($1,128); and a California resident, who is sent past
  the Virginia pages whether loading the URL directly or clicking Next. All pass. Now in
  the port as `scripts/virginia-cases.py` and `scripts/virginia-cases.cjs`.
- **The Spanish site** generates the Virginia pages (English text) without breaking.
- **The port's parity check against Direct File passes with the Virginia module in place**
  (`make transpile-verify`): declaration order is navigation order across 175 scenarios and
  25,733 steps with 0 violations; every federal screen shows for exactly the taxpayers it
  shows for upstream across 161 scenarios and 89,329 decisions, 0 unexpected differences
  (the 7 known ones are the IRS's own list). Adding a module after the federal ones
  disturbed nothing.
- **The port's browser smoke suite cannot run on this Mac:** its Playwright (1.62) has no
  Chromium build for macOS 13 ("Playwright does not support chromium on mac13"), so all
  nine tests fail before opening a page. A teammate on macOS 14 or newer runs `make site &&
  make smoke` as written. On this machine the same checks were repeated by hand with
  Playwright 1.58 against the production build (below).
- **Smoke checks repeated with Playwright 1.58 against the dev build:** the engine boots with
  no page errors, both filers seed, typed answers read back, a required question blocks
  Continue, the first ten pages walk, the Spanish intro carries Direct File's Spanish. Two
  findings: the step indicator now counts 26 sections, so the port's smoke spec (which
  hard-codes 25) is updated in our change set; and the Spanish Virginia page was empty,
  because the generated Spanish locale file only knows federal keys. The two Virginia screens
  now carry hand-written Spanish, merged by a script that also fails if the English (and so
  the content-addressed keys) changed underneath it. The Spanish summary computes $1,174.

## 2026-10-20 the prepopulate-and-ask design, built

- Form 760 now runs Line 1 to Line 36 in the port: withholding from the W-2s (box 17),
  the three lines that are Virginia Tax's own records (writable placeholders here),
  the two Schedule ADJ items a filer must be asked about (lottery prizes under $600,
  Commonwealth Savers contributions with the $4,000 cap and the age-70 rule), the locality
  code (133 cities and counties, asked and confirmed) and the consumer's use tax at the
  locality's rate (5.3 / 6 / 6.3 / 7%). Facts: 49 in `virginia.xml`, 4 in
  `virginiaLocalities.xml`. Seven screens, in English and Spanish. Riley owes $873; Morgan
  owes $1,672; both match the hand math line for line, and all thirteen harness households
  pass against the extended independent model.
- **Design rule confirmed in code:** every federal fact the Virginia module reads is
  exported (the W-2's state withholding is in the MeF W-2), and the export check now treats
  our own modules as ours. The one thing a state would plug in is the three Virginia-records
  lines.
- **The mockup's correction screens are built (later the same day).** A correction round:
  "Is everything right?" → what needs correcting → correct the date of birth, or a W-2 as a
  whole document → "Your correction is saved. Here is what it changed", with what you owe now
  versus before, each item was → now, and the lines that moved. The inputs are ordinary
  fg-sets bound to the federal facts, so both returns change; the before/after view is a
  40-line app script that snapshots the lines when a correction screen opens. Verified on the
  real screens: Riley's date of birth to 1955 takes what he owes from $873 to $174, seven
  lines moved.
- **The 133-radio locality question became a searchable combo box** without touching Form
  Builder: Flow XML already has a `<select>` input and the runtime already handles it; this
  app overrides the select template to wrap it in a USWDS combo box, which filters as you
  type and fires `change` on the select. Typing "Charlottes" offers Charlottesville City, and
  the locality code on the summary follows.
- **Click-through verified on the real screens (2026-10-20):** load the IRS's "Single 33k No
  Credits", answer Virginia on the federal residence question, then Next through the
  Virginia intro, what-is-known, locality (Richmond City), lottery yes and $450, savers no,
  untaxed purchases yes and $400, to the summary: locality 760, Line 7 $450, tax $1,149,
  withheld $300, use tax $24, amount owed $873. No page errors. Each yes/no question's
  amount appears as its own screen only after a yes, which is the port's
  one-question-per-screen splitting doing the right thing. The Spanish pages carry the
  Spanish with no missing keys and the same $873. Port tests 12 of 12.

## 2026-10-20 evening: the state-side stub, more households, accessibility

- **Lines 20 to 22 now come from a stand-in for Virginia Tax's records**, a JSON file keyed
  by last name and date of birth, applied by a 30-line script on any Virginia screen. It is
  the state-side half of "the government already knows": Riley's $200 of estimated payments
  and Morgan's $150 carried-over overpayment appear before either sees the screen, and the
  amounts owed fall to $673 and $1,522. The facts stay correctable. In a state-run service
  the file is the state's own database.
- **Sixteen households pass** against the independent model: the 6.3% (Halifax, $63) and 7%
  (Williamsburg, $70) use-tax tiers and a refund after $2,000 of estimated payments joined
  the thirteen. The model accounts for the records stand-in the way the page does.
- **Accessibility: zero axe violations** (WCAG 2.0 and 2.1, A and AA) across the fourteen
  Virginia screens with a correction round open, main content scoped. The combo box and the
  correction view are USWDS markup and a plain table, which is why. Kept as
  `scripts/virginia-a11y.cjs`.
- **CONTRIBUTING** gained the port section: toolchain, targets, where things are, and the
  six things that cost time (the watcher, USWDS radios, the combo box, Playwright on macOS
  13, content-addressed locale keys, FlowSpec's naming rule).
