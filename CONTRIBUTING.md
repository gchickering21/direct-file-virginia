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
