# How the pieces fit

One page for anyone who wants to understand the machine before, or instead of, reading the
code. Two diagrams: the layers, and the path from an edit to a screen. GitHub draws them;
in an editor that does not, the text under each says the same thing.

## 1. The layers

Four IRS libraries stacked, and the Virginia work as one thin layer on top, beside the federal
rules rather than inside them.

```mermaid
flowchart TB
    subgraph VA["Virginia (ours): form-builder-examples/direct-file/, the Virginia commits"]
        direction LR
        rules["facts/virginia*.xml<br/>10 rule modules, 176 facts<br/>every figure in virginiaConstants.xml"]
        screens["flow/your-taxes-virginia.xml<br/>14 screens, English and Spanish"]
        js["website-static/js/virginia-*.js<br/>records stand-in, ZIP to locality,<br/>corrections, sign, demo links"]
        wb["workbench/<br/>the Rules Workbench, Node only, port 3011"]
        checks["scripts/, VirginiaSpec.scala<br/>export rule, constants rule, 50 households, axe"]
    end
    subgraph PORT["The port (IRS): form-builder-examples/direct-file/"]
        fed["Direct File's federal interview, transpiled:<br/>facts/*.xml (3,030 facts), flow/*.xml (727 screens), locales, scenarios"]
    end
    subgraph LIBS["The libraries (IRS)"]
        fb["form-builder<br/>Scala: Flow XML + fact dictionary + YAML → static HTML (Thymeleaf),<br/>plus the flow runtime that runs in the browser"]
        fg["fact-graph 3.1<br/>Scala, cross-compiled: a JVM jar for the tests,<br/>a Scala.js bundle (factgraph-3.1.0.js) for the browser"]
        tp["taxpert<br/>the developer workspace: Scenario, Browse All,<br/>Author Mode, Fact Explorer"]
    end
    rules -. "reads only facts the federal return<br/>exports to states (17 paths), enforced by<br/>scripts/check-virginia-exports.py" .-> fed
    screens --> fed
    VA --> PORT
    PORT --> fb
    PORT -. "optional, built in with --auditMode" .-> tp
    fb --> fg
```

In words, bottom to top:

- **Fact Graph** is the rules engine. A fact dictionary is XML: each fact is a path like
  `/vaTax`, a type, and either a question (`<Writable>`) or a formula over other facts
  (`<Derived>`). The engine evaluates the graph lazily and tracks what is complete. It is
  written in Scala and compiled twice: to a jar the tests run, and to JavaScript the browser
  runs. The same rules give the same answers in both.
- **Form Builder** turns Flow XML (pages, questions, conditions), the fact dictionary and the
  YAML locale files into a static site, one HTML file per page per language. It also ships the
  flow runtime: the JavaScript that loads the engine in the browser, shows or hides blocks as
  conditions change, writes answers into the graph, and keeps the graph in session storage
  between pages.
- **Taxpert** is the developer workspace the IRS wraps around a built site: the Scenario menu
  that loads a saved household, Browse All, Author Mode and Fact Explorer. It is built in only
  when the generator is asked for it, so a production build has none of it.
- **The port** is the IRS's own reference application: Direct File's whole interview,
  transpiled from the 2025 service onto Form Builder. It is where the federal rules and screens
  live, untouched by the Virginia work.
- **Virginia** is ten rule modules, fourteen screens, a handful of browser scripts, the
  Workbench and the checks, all inside the port's folder as ordinary commits. The dotted line
  is the one design rule: a Virginia fact may read a federal fact only if the federal return
  already exports it to states, so the same module would be fed by the federal state API if
  that service came back.

## 2. From an edit to a screen

What happens when someone changes a figure, and what happens when a filer loads a page.
There is no server at runtime: the site is files, and the engine runs in the browser.

```mermaid
flowchart LR
    subgraph EDIT["Change (one of three ways)"]
        direction TB
        wbx["the Workbench<br/>a value, a rule, a question or a sentence,<br/>in plain language, with approvals"]
        xml["an editor<br/>facts/virginia*.xml, flow/your-taxes-virginia.xml,<br/>locales/virginia_es.yaml"]
        am["Author Mode<br/>the flow XML, from the browser"]
    end
    src[("the source tree<br/>src/main/resources/direct-file/")]
    gen["the generator<br/>sbt run, inside Form Builder:<br/>parse the flow and the dictionary,<br/>render every page in every language,<br/>copy website-static/ and the scenarios"]
    out[("out/app/direct-file/<br/>static HTML + resources/:<br/>the engine bundle, the merged<br/>fact-dictionary.xml, the scripts, the data")]
    serve["served as files<br/>make dev: the in-process server<br/>make demo: nginx in Docker<br/>hosted: GitHub Pages or any static host"]
    browser["the browser<br/>loads the page, the engine and the dictionary;<br/>restores the graph from sessionStorage;<br/>evaluates conditions and shows the blocks that apply;<br/>a ?demo=N link seeds the graph from a scenario file"]
    wbx --> src
    xml --> src
    am --> src
    src --> gen --> out --> serve --> browser
    browser -- "an answer" --> browser
```

In words:

1. **A change is written into the source tree** by one of three hands: the Workbench (which
   writes the XML and the Spanish and runs the worked examples first), an editor, or Author
   Mode. Every tax-year figure goes into `virginiaConstants.xml`; every rule names its law.
2. **The generator rebuilds the site.** `make dev` keeps a watcher running and regenerates in
   about twenty seconds; `make demo` does the same inside Docker; `make site` builds once. The
   output is a folder of HTML and a `resources/` folder with the engine bundle, the merged
   dictionary, the scripts and the data files.
3. **Something serves the folder.** Locally the generator's own server or nginx; publicly any
   static host, since nothing runs on the server side (`docs/hosting.md`).
4. **The browser does the rest.** It loads the engine and the dictionary, restores the filer's
   graph from session storage, evaluates every condition, and renders the page. Each answer
   is written into the graph and the page updates. The Virginia scripts add the parts a state
   would get from its own systems: the records stand-in fills Lines 20 to 22, the ZIP lookup
   proposes the locality, and the demo link seeds a household from a scenario file.

## 3. What checks what

| Check | Runs where | Proves |
|---|---|---|
| `make check` | no JVM, a minute | the XML parses against the IRS schemas; Virginia reads only exported federal facts; every figure sits in the constants module with a tax year; every locality is listed in both switches; the Spanish keys match the English; the counts and fact paths quoted in the docs are true; the demo scenario files match their manifest; the Workbench's worked examples pass |
| `make test` | the JVM, the port's ScalaTest suite | the four demos' lines pinned exactly; 50 households through the full dictionary; the invariants of any Form 760 this module can produce; the federal suites unchanged |
| `make cases` | the browser, with the site running | the same 50 households, loaded into the real pages, every line compared with an independent model of the rules written from the Code rather than from the XML |
| `make a11y` | the browser | axe over every Virginia screen in both languages, the start page, the error states |

## Where to read more

- The IRS's own architecture page for the stack, with the build pipeline and the browser
  runtime in detail: `taxpert/docs/architecture.md`. Its ADR on what each of the three
  libraries owns: `taxpert/docs/adr/taxpert-form-builder-fact-graph.md`.
- The decisions behind the Virginia layer: `form-builder-examples/direct-file/docs/adr/`.
- What each Virginia file is: the "What is here" section of
  `form-builder-examples/direct-file/docs/virginia/README.md`.
- To change X, go here: `docs/changing-the-return.md`. The admin pages: `docs/surfaces.md`.
