# Running and changing this project

Written for teammates on Macs. Everything here was done on a 2017 Intel MacBook Pro on
macOS 13 on 2026-10-19; a newer Mac only has it easier.

## One-time setup

1. **Docker Desktop.** Any release from 4.18 (March 2023) on. On macOS 13, 4.48.0 is
   the last one that installs; on macOS 14 or newer, the current release. In its
   Settings, give the VM at least 8 GB of memory and leave 10 GB of disk free before the
   first build.
2. **Node through nvm.** `brew install nvm`, then the version the client pins:
   ```bash
   cd direct-file/direct-file/df-client && nvm install "$(cat .nvmrc)"
   ```
3. **Clone and build:**
   ```bash
   git clone git@github.com:gchickering21/direct-file-virginia.git
   cd direct-file-virginia
   make stack-build        # 15–30 minutes the first time: Maven and sbt inside Docker
   make stack-up
   make client             # leave this terminal running
   ```
4. Open **http://localhost:5000/df/file**. That is the login simulator, which fronts the
   client; log in with any email and pick IAL2. Opening port 3000 directly skips
   authentication and the app will not load a return.

`make` alone lists every target.

## What is running

| Piece | Where | Notes |
|---|---|---|
| API (Spring Boot) | http://localhost:8080/df/file/api | health at `/actuator/health` |
| Login simulator | http://localhost:5000 | stands in for ID.me / Login.gov; proxies to the client and the API |
| Client (Vite dev server) | http://localhost:3000 | hot reload; reach it through port 5000 |
| Postgres, Redis, LocalStack | compose network | LocalStack stands in for S3, SQS, KMS |

Not started: the state API (its development certificate expired 2025-08-30, so it
neither builds nor runs as published), the MeF submit and status services (not in the
public stack), the email service, and the monitoring stack. None are needed for the
interview or for the Virginia return.

## Why the stack differs from the IRS's compose file

The IRS tree under `direct-file/` is byte-for-byte upstream and must stay that way (see
`report/PLAN.md` §4). Four things in the IRS compose and client setup no longer work as
published; each is corrected in `stack/overrides.yaml`, which the Makefile passes as a
second compose file:

1. LocalStack's floating `latest` tag now needs a paid licence; pinned to 4.12.
2. Redis is published on host port 6379, colliding with any other Redis; unpublished.
3. The simulator reached the client as `host.docker.internal`, which Vite's 2025
   security fix rejects; it now uses `client.localhost`, which Vite allows.
4. `up --build` rebuilt everything after a cache prune; `stack-up` builds only what is
   missing and `stack-build` rebuilds on purpose.

## Making a change

- Virginia changes go under `direct-file/`, one policy concept per commit, following
  `report/PLAN.md` §9 (what "done" means, commit messages, the policy map).
- The IRS's own guides for the code: `direct-file/ONBOARDING.md`, then the README in
  each service folder, then `direct-file/docs/`.
- The fact dictionary is XML in `backend/src/main/resources/tax/` and is symlinked into
  the client. After editing it, in `df-client/df-client-app`:
  `npm run generate-fact-dictionary`, or `npm run watch-fact-dictionary` while you work.
- The client's own tests, from `df-client`: `npm test`. The fact-dictionary and flow
  tests are under `df-client-app/src/test/`.
- Branch per concept, rebase onto `main` before merging, never force-push `main`.

## If something is wrong

- **Blank page or "Blocked request" after login:** the client is not running (`make
  client`) or the simulator is still booting; wait ten seconds and reload.
- **LocalStack exits with code 55:** the override is not being applied. Run through
  `make`, not `docker compose` directly in the IRS folder.
- **Port already allocated:** another stack holds 5432, 6379, 8080 or 3000. The IRS
  compose accepts `DF_API_PORT`, `DF_DB_PORT` and `DF_FE_PORT` as environment variables.
- **Docker VM out of disk:** `docker builder prune -af` reclaims the build cache
  (several GB); never `docker volume prune`.
- **API never reports started:** `make stack-logs`. It takes about a minute, running
  Liquibase migrations first.

## The IRS port on Form Builder, where the Virginia work lives

This is the second stack in the repository and the one the Virginia return is built on:
`form-builder-examples/direct-file/`, the IRS's port of Direct File's interview onto Fact
Graph 3.1 and Form Builder. It is a static site with the engine in the browser: no API, no
database, no login. Everything below was done on the same 2017 Mac.

### Toolchain

JDK 21, sbt 1.11 and Node 22. On a current Mac, `brew install openjdk@21 sbt` and
`nvm install 22`. On macOS 13 Homebrew compiles the JDK from source (hours), so take
prebuilt binaries instead: Temurin 21 and the sbt zip unpacked under `~/.dpi-toolchain`,
which `stack/toolchain.sh` puts on the path and every `make port-*` target sources. The
file says where to download them.

### Running it

```bash
make port-bootstrap    # once: publish fact-graph and form-builder to ~/.ivy2/local, npm installs, vendor assets
make port-dev          # http://localhost:3008/app/direct-file, regenerating on every edit
```

The first bootstrap takes a few minutes while sbt fetches itself; the two libraries then
compile in under a minute each, and the port regenerates its 140-page site in about 20
seconds after an edit. To see the Virginia screens: Scenario → Virginia Demo 1 or 2 →
Load scenario → step to "Your Virginia return" near the end, or open
`/your-taxes/virginia/virginia-summary/` directly once a Virginia household is loaded.
With no Virginia resident loaded the runtime skips the Virginia pages, which is the gate
working.

### Where things are

| What | Where |
|---|---|
| The Virginia rules | `src/main/resources/direct-file/facts/virginia.xml`, `facts/virginiaLocalities.xml` |
| The Virginia screens | `flow/your-taxes-virginia.xml`; Spanish in `locales/virginia_es.yaml`, merged into the generated `flow_es.yaml` by `scripts/merge-virginia-es.py` |
| The two demo households | `scenarios/virginia_demo_*.json` |
| The records stand-in | `website-static/data/virginia-records.json`, applied by `website-static/js/virginia-records.js` |
| The correction view | `website-static/js/virginia-corrections.js` |
| The searchable select | `templates/nodes/inputs/select.html` |
| The checks | `make virginia-check` (schemas, the export rule, the Spanish keys), `make port-test` (the port's ScalaTest suite), `scripts/virginia-cases.py` + `scripts/virginia-cases.cjs` (sixteen households against an independent model, needs `make port-dev` running) |

### Things that cost time, so you do not pay them again

- **The watcher regenerates on every save**, including saves our own scripts make (the
  Spanish merge rewrites `flow_es.yaml`). A browser check that starts during a regeneration
  sees half a site. Wait for the `[success]` line in the watcher's output, or poll a page for
  text your change added, before driving the site.
- **USWDS radios are visually hidden inputs.** In Playwright, `check()` times out and
  `force` fails with "outside of the viewport". Click the label instead:
  `label[for="<input id>"]`. The combo box is driven by typing into
  `.usa-combo-box__input` and clicking a `.usa-combo-box__list-option`; USWDS then sets the
  underlying select and fires `change` on it.
- **`page.waitForURL` / `networkidle` never settle** on the dev server because of Vite-style
  live reload; wait for an element or a fixed delay.
- **The port's own Playwright (1.62) has no Chromium build for macOS 13**, so `make smoke`
  fails before opening a page here. `scripts/virginia-cases.cjs` takes
  `PLAYWRIGHT_MODULE=<path to another playwright-core>` for that reason. On macOS 14 or
  newer `make site && make smoke` runs as the IRS wrote it.
- **Form Builder content-addresses locale keys on the English text.** Change a sentence on a
  Virginia screen and its Spanish key changes; `scripts/merge-virginia-es.py` fails naming
  the stale key so the page never shows `??placeholder??`.
- **FlowSpec wants `{category}-{subcategory}.xml` and matching routes**, and counts the five
  federal categories. A new module goes under one of them (`your-taxes-virginia.xml` →
  `/your-taxes/virginia/...`), and the step indicator then counts 26 sections, which
  `tests/smoke.spec.js` says.
- **`make up --build`-style rebuilds after a cache prune** recompile everything. The root
  Makefile's `stack-up` and `port-*` targets never force a rebuild.
