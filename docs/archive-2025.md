# The 2025 archive: the real federal Direct File, as published

Optional, and not in the repository: `make fetch-archive` clones IRS-Public/direct-file at the
commit in `IRS_PINS.md` into `direct-file/`, which git ignores (570 MB; `stack/fetch-archive.sh`).
Byte for byte the IRS's, never modified. It is the "before" and the product history: the Spring Boot API, three
Postgres databases, Redis, a LocalStack standing in for AWS, a simulator standing in for ID.me
and Login.gov, and the React client. The two services that transmit to the IRS e-file system
are not in the public stack, so a return computes but is never filed. Nothing in the Virginia
work needs it.

## Run it

Docker Desktop (any release from 4.18 on, 8 GB for the VM, 10 GB of disk free) and Node 18 on
the host, through nvm:

```bash
make fetch-archive      # once: the IRS repository at the pin, into direct-file/
cd direct-file/direct-file/df-client && nvm install "$(cat .nvmrc)" && cd -
make stack-build        # 15 to 30 minutes the first time: Maven and sbt inside Docker
make stack-up           # the API, its databases, LocalStack, Redis, the login simulator
make client             # the React client on port 3000; leave it running
```

Open http://localhost:5000/df/file (the simulator, which fronts the client), log in with any
email, choose IAL2, click "Start my 2024 federal tax return". Opening port 3000 directly skips
authentication and the app will not load a return.

| Piece | Where | Notes |
|---|---|---|
| API (Spring Boot) | http://localhost:8080/df/file/api | health at `/actuator/health`; about a minute to start, Liquibase first |
| Login simulator | http://localhost:5000 | proxies to the client and the API |
| Client (Vite) | http://localhost:3000 | hot reload; reach it through port 5000 |
| Postgres, Redis, LocalStack | compose network | LocalStack stands in for S3, SQS, KMS |

`make stack-down` stops it keeping its data; `make stack-logs` follows the API; `make stack-ps`
lists what is running. Not started: the state API (its development certificate expired on
2025-08-30, so it neither builds nor runs as published), the MeF submit and status services
(not in the public stack), the email service and the monitoring stack. None is needed for the
interview.

## Why the stack differs from the IRS's compose file

Four things in the IRS compose and client setup had rotted in the year since the IRS archived
the code. Each is corrected in `stack/overrides.yaml`, which the root Makefile passes as a
second compose file, so the IRS tree stays byte for byte upstream:

1. **LocalStack** is pulled by its floating `latest` tag, which is now a licensed product that
   exits with code 55 without a paid token. Pinned to the newest 4.x community image, which
   runs the IRS init scripts unchanged.
2. **Redis** is published on host port 6379 with no variable to move it, so it collides with
   any other Redis on the machine. Unpublished; the API reaches it on the compose network.
3. **The login simulator** reaches the client's Vite dev server on the host as
   `host.docker.internal`, which Vite's 2025 security fix rejects ("Blocked request. This host
   is not allowed"). Vite allows every `*.localhost` name, so the simulator now reaches the
   host as `client.localhost` through a compose `extra_hosts` entry.
4. **The state API** does not build or run: its development certificate expired and a unit
   test fails on it. It is the federal-to-state export path, the part states depended on.
   `make stack-up` starts only the API and the simulator.

For the report: a public codebase with no maintainer decays on a schedule its fixtures set, and
the first thing to rot was the part states used.

The Virginia site's `make transpile`, which regenerates the federal flow from Direct File's
client, reads `../../direct-file` and so wants this fetched too.

## Reading it

The IRS's own guides: `direct-file/ONBOARDING.md`, then the README in each service folder,
then `direct-file/docs/`. The fact dictionary the Virginia site's own dictionary was transpiled
from is XML in `direct-file/direct-file/backend/src/main/resources/tax/`; the client generates
its TypeScript view of it with `npm run generate-fact-dictionary`. Read it; do not edit it. The
client's own tests run from `direct-file/direct-file/df-client` with `npm test`.

## When something is wrong

| You see | It means | Do |
|---|---|---|
| blank page or "Blocked request" after login | the client is not running, or the simulator is still booting | `make client`; wait ten seconds and reload |
| LocalStack exits with code 55 | the override is not applied | run through `make`, not `docker compose` in the IRS folder |
| "Blocked request. This host (host.docker.internal)" | the simulator is not using `client.localhost` | pull `stack/overrides.yaml`; `make stack-up` recreates the simulator |
| "port is already allocated" | another stack holds 5432, 6379, 8080 or 3000 | the IRS compose takes `DF_API_PORT`, `DF_DB_PORT`, `DF_FE_PORT` |
| the API never reports started | migrations still running | `make stack-logs`; about a minute |
| the Docker VM is out of disk | the build cache | `docker builder prune -af`; never `docker volume prune` |

The scripted walk that passed on 2026-10-19: login, the welcome page, the IRS data-import mock,
the checklist, the first interview screens saving facts to the API, no errors.
