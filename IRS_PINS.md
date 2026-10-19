# Pinned IRS repositories

Every IRS repository here is a squashed git subtree at one commit. Moving a pin is a
deliberate commit that names the new commit here and re-runs the build and the Virginia
acceptance test. Dates are the upstream commit dates.

| Folder | Upstream | Commit | Date | Role |
|---|---|---|---|---|
| `direct-file/` | IRS-Public/direct-file | e365f9f43446 | 2026-06-11 | the archived 2025 application; the "before"; never modified |
| `fact-graph/` | IRS-Public/fact-graph | 5599f75ba304 | 2026-09-01 | Fact Graph 3.1, the engine |
| `form-builder/` | IRS-Public/form-builder | c3396a683ea0 | 2026-09-01 | Flow XML + dictionary → static site |
| `taxpert/` | IRS-Public/taxpert | ce52fcc4e9f4 | 2026-09-02 | Fact Explorer, Browse All, Author Mode |
| `form-builder-examples/` | IRS-Public/form-builder-examples | 2eed6d4424f8 | 2026-09-02 | the IRS's port of Direct File (`direct-file/`), where the Virginia work lives |

The five sit as siblings at the repository root because that is the layout the IRS's
Makefiles, Dockerfiles and compose files resolve against (`../../fact-graph` from inside
an example application; `../../direct-file` for the port's transpiler).

To refresh one, with the full 40-character commit hash:
`git subtree pull --prefix=<folder> https://github.com/IRS-Public/<repo>.git <commit> --squash`.
