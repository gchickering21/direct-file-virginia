# The macOS 13 detours

This project was first built on a 2017 Intel MacBook Pro stuck on macOS 13 (Ventura). On
macOS 14 or newer every tool installs the normal way and none of this applies. Check:

```bash
sw_vers -productVersion     # macOS version
uname -m                    # arm64 (Apple silicon) or x86_64 (Intel)
```

## Docker Desktop: 4.48.0 exactly

The current Docker Desktop refuses to install on 13 ("requires macOS 14.0 or later"). The last
release for 13 is 4.48.0 (October 2025), Intel installer
https://desktop.docker.com/mac/main/amd64/207573/Docker.dmg (Apple silicon: replace `amd64`
with `arm64`). It warns on first launch that it cannot update further; that is fine. Turn off
automatic updates in its settings so it stops trying.

Older than 4.18 will not do: the IRS compose files use `additional_contexts` (Compose 2.17,
March 2023) and the Dockerfiles declare the `docker/dockerfile:1.7-labs` frontend. A newer
Compose plugin alone does not help; it wants a newer buildx too. `make doctor` checks the
Compose version.

## The JDK and sbt: prebuilt binaries, not Homebrew

On 13 `brew install openjdk@21` compiles the JDK and OpenSSL from source, which was stopped
after half an hour with no end in sight. Take prebuilt binaries instead:

```bash
mkdir -p ~/.dpi-toolchain && cd ~/.dpi-toolchain
# JDK: the Temurin 21 build for your chip, from https://github.com/adoptium/temurin21-binaries/releases
curl -fsSLo jdk.tar.gz "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jdk_x64_mac_hotspot_21.0.12.1_1.tar.gz"
tar -xzf jdk.tar.gz && rm jdk.tar.gz && ln -sfn jdk-21*/Contents/Home jdk21
# sbt launcher, plain Java, nothing to compile
curl -fsSLo sbt.zip https://github.com/sbt/sbt/releases/download/v1.11.4/sbt-1.11.4.zip && unzip -qo sbt.zip && rm sbt.zip
nvm install 22
```

`stack/toolchain.sh` puts `~/.dpi-toolchain` on the path and selects Node 22; every
native target at the root (`make dev`, `make test`, `make check`, …) sources it. On a newer Mac the file finds nothing there and leaves
Homebrew's tools in charge.

## Playwright: no Chromium for 13

The Virginia site's own Playwright (1.62) has no Chromium build for macOS 13, so the IRS's
`make site && make smoke` fails before opening a page. The Virginia browser checks
(`make cases`, `make a11y`) carry a Playwright and axe-core pinned in
`stack/browser-tools/` that still run on 13. The IRS's smoke suite wants a newer Mac.

## The Fact Explorer: sass-embedded wants 14

The Fact Explorer (`stack/fact-explorer.sh`, run by `make site-demo`) is a Vite app that compiles its
styles with `sass-embedded`, whose Dart VM refuses macOS 13 ("Current Mac OS X version 13.0 is lower
than minimum supported version 14.0") and then hangs the build with no further output. The
pure-JavaScript `sass` compiles the same files and Vite takes it when `sass-embedded` is absent.
Machine-local, under `node_modules` only, so the IRS tree stays as pinned:

```bash
cd taxpert && npm install --no-save sass && rm -rf node_modules/sass-embedded node_modules/sass-embedded-darwin-* packages/fact-explorer/node_modules/sass-embedded
```

`npm install` in `taxpert/` puts `sass-embedded` back; repeat after one.

## The 2025 archive on 13

Node 18 for its client installs through nvm without trouble. The Docker build wants 10 GB free
inside the Docker VM; `docker system df` shows it and `docker builder prune -af` reclaims the
build cache. Never `docker volume prune`.
