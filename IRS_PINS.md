# Pinned IRS repositories

Every IRS repository here is a squashed git subtree at one commit. Moving a pin is a
deliberate commit that names the new commit here and re-runs the build and the Virginia
acceptance test. Dates are the upstream commit dates.

| Folder | Upstream | Commit | Date | Role |
|---|---|---|---|---|
| `direct-file/` | IRS-Public/direct-file | e365f9f43446 | 2026-06-11 | the 2025 archive, the real federal application; the "before"; never modified. **Not vendored**: `make fetch-archive` puts it here (570 MB), git ignores it |
| `fact-graph/` | IRS-Public/fact-graph | 5599f75ba304 | 2026-09-01 | Fact Graph 3.1, the engine |
| `form-builder/` | IRS-Public/form-builder | c3396a683ea0 | 2026-09-01 | Flow XML + dictionary → static site |
| `taxpert/` | IRS-Public/taxpert | ce52fcc4e9f4 | 2026-09-02 | Fact Explorer, Browse All, Author Mode |
| `form-builder-examples/` | IRS-Public/form-builder-examples | 2eed6d4424f8 | 2026-09-02 | the IRS's reference applications; `direct-file/` inside it is the Virginia site, where the Virginia work lives |

The five sit as siblings at the repository root because that is the layout the IRS's
Makefiles, Dockerfiles and compose files resolve against (`../../fact-graph` from inside
an example application; `../../direct-file` for the port's transpiler). Four are vendored as
squashed subtrees. The archive is not: it is 570 MB the Virginia work never reads, so
`make fetch-archive` clones it at the pin when someone wants the "before" or the port's
`make transpile`, and `.gitignore` keeps it out of the repository.

To refresh one, `make bump-pin REPO=<repo> SHA=<40 characters>` (a dry run with a drift report;
`APPLY=1` does it): a `git subtree pull --squash` for the four vendored ones, and for the archive
only this table changes, after which `make fetch-archive` fetches the new commit.
