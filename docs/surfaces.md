# The surfaces: what each page and tool is for

Seven ways to look at or change the Virginia return. The start page and the Workbench are ours;
Scenario, Browse All, Author Mode and Fact Explorer are the IRS's developer workspace, shipped
with the site. All but Fact Explorer run from this repository.

| Surface | What it shows | Who it is for | How to open it |
|---|---|---|---|
| **The start page** | The front door: the four demo households as cards, what to look for, and links to Browse All, the fact dictionary and the Workbench. A static page in `website-static/start/`, drawn from the demo manifest, outside the flow. | everyone; the link to give someone | `make demo` prints it: http://localhost:3008/app/direct-file/resources/start/ (and the hosted site, `docs/hosting.md`) |
| **The proof page** | What the checks found for the build you are looking at: the households against the independent model, the axe pass, the test suite, each with the commit it ran on. A static page in `website-static/proof/`, reading the JSON that `make proof` writes beside it; a development build shows a note instead. | reviewers, the class | the start page, "The proof"; on the hosted site at `/resources/proof/` |
| **The site** | The interview itself: the federal screens, then the fourteen Virginia screens for a Virginia resident. One question per page. | everyone; the filer's view | `make demo` or `make dev`, then http://localhost:3008/app/direct-file/ |
| **Scenario** (top bar) | Load a saved household into the browser's Fact Graph, or copy the current one out. The four Virginia demos are under Existing scenarios. | anyone who wants a filled-in return | the Scenario button; or a `?demo=1` to `?demo=4` link, which loads the household without the menu |
| **Browse All** (top bar) | Every screen in the flow, federal and Virginia, grouped by section, with its conditions. The place to see where the Virginia screens sit and what gates them. | engineers, reviewers | the Browse All button; also `/all-screens/` |
| **Author Mode** | Edit the flow XML in place from the browser: the words, the order, the conditions on a screen. Saves to disk through its own API on port 3009. Works on the un-split pages, so it is off in the one-question-per-page builds. | engineers changing screens | `make author` (native toolchain), then the pencil in the top bar |
| **Fact Explorer** | The whole dictionary, federal and Virginia, drawn as one graph: every fact, what it reads and who reads it. The figure for "the federal rules carry over untouched". | engineers, the report | the Fact Explorer entry in the top bar, or the start page. Built beside the site by `make site-demo` and `make publish` (`stack/fact-explorer.sh`), so the hosted copy has it at `/fact-explorer/direct-file`; under `make dev` or `make up` it is the IRS's `taxpert/` stack on port 5180, which `make register-explorer` inside the Virginia site sets up |
| **The Workbench** | Form 760 line by line, with the statute beside each. Change a value by tax year, a rule in plain language, a question, or the words on a screen; watch fifteen worked examples rerun; send for a policy, an engineering and a translation approval; publish into the XML. Four read-only reports: coverage, the export contract, Spanish, history. | policy staff, with an engineer and a translator | `make workbench`, then http://localhost:3011. A read-only copy (no drafts, no approvals) is built into the hosted site at `/workbench/` (`docs/hosting.md`) |

## Which one when

- **"Show me the Virginia return."** The start page, then a household; or a demo link.
- **"Where does this screen appear, and why not for me?"** Browse All, then the conditions on
  the screen.
- **"Change the words on a screen."** The Workbench (Screens filers see), which also keeps the
  Spanish in step; or Author Mode for the raw XML.
- **"A figure changed for next year."** The Workbench (Values), which writes the new figure as
  a rule on the tax year with its source.
- **"Add a question the return does not ask."** The Workbench (Questions asked).
- **"What does this fact depend on?"** Fact Explorer, on the hosted site or a `make site-demo`
  build; otherwise the Workbench's rule editor shows one line's inputs.
- **"Does the change still compute right?"** The Workbench's worked examples as you edit, then
  `make check`, then `make cases` once at the end.

## The Workbench's roles

There is no sign-in. Pick who you are in the top right. Five fictional people stand for four
roles: a policy author, a policy reviewer, two engineers (the engineering approval must come
from an engineer who is not the author), and a translator. Publishing writes the files and
appends to `workbench/data/audit.jsonl`; with `WORKBENCH_GIT_COMMIT=1` it also commits, and
with `WORKBENCH_GIT_PR=1` it opens a pull request. `virginia/direct-file/workbench/README.md`
is the full record.
