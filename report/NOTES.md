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
