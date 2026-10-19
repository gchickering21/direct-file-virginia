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
