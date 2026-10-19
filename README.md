# A Virginia state return on IRS Direct File's public code

The IRS built Direct File, a free way to file a federal return directly with the IRS,
ran it in 25 states, published its source code into the public domain, and then
suspended the service in 2025. This repository asks one question of that code: could a
state with an income tax and no free filing option take it and stand up its own filer?

We answer with Virginia. Virginia never joined Direct File and offers residents no
free state filing tool. Here, a Virginia return is added to the IRS's own port of Direct File onto its
maintained Fact Graph and Form Builder stack, as a small, readable set of changes on top
of the IRS's code, with every rule traced to the Virginia Code and Form 760.

It is a class project for Digital Public Infrastructure at Georgetown, fall 2026, and it
is written so that a state engineering team could take the Virginia change set without
taking anything else here.

## Layout

| Folder | What it is |
|---|---|
| `direct-file/` | IRS-Public/direct-file at commit e365f9f, a squashed subtree. The archived 2025 application: the "before". Never modified. |
| `fact-graph/`, `form-builder/`, `taxpert/`, `form-builder-examples/` | The IRS's maintained stack, each a squashed subtree at the commit in `IRS_PINS.md`. The IRS's port of Direct File is `form-builder-examples/direct-file/`, and every Virginia change is an ordinary commit inside it. |
| `stack/`, `Makefile` | How we run the archived application locally (see `CONTRIBUTING.md`). |
| `report/` | Course material: the plan, notes, sources, figures, drafts. |
| `handoff/` | The package for a state: how to take the change set, the policy map, the gap list. Written when the Virginia work lands. |

## Running the real application

Docker Desktop 4.18 or newer and Node (the version in `direct-file/direct-file/df-client/.nvmrc`).

```bash
cd direct-file/direct-file
docker compose up -d --build api csp-simulator state-api   # the backend, the login simulator, the state API
cd df-client && nvm use && npm install && npm run start      # http://localhost:3000, log in with any email
```

The IRS's own onboarding guide is `direct-file/ONBOARDING.md`. The two services that
transmit returns to the IRS's e-file system are not part of the public stack, so a
return computes but is never filed.

## Running the Virginia filer

From `form-builder-examples/direct-file/`, the IRS's own instructions apply: `make up`
for Docker, or `make bootstrap && make dev` natively. See that folder's README.

## Taking the Virginia change set

See `handoff/README.md` once it exists. In short: the changes are commits on top of
the `form-builder-examples` subtree's squash commit, exportable with `git format-patch`
onto a fresh clone of IRS-Public/form-builder-examples at the pinned commit, and the two
Virginia XML files drop into any application generated from the IRS's template.

## Licence

The IRS code, all five repositories, is a work of the United States government, public
domain in the US and CC0 worldwide. Everything added here is CC0 as well (`LICENSE`). Nothing here is
branded as, or endorsed by, the IRS or Virginia Tax; every proposed screen says on the
screen that it is a demonstration.
