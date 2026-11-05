"""The Virginia fact modules, read once, for the check scripts.

Every `facts/virginia*.xml` is a Virginia module (the federal dictionary is every other file in
`facts/`). The scripts that check them (`check-virginia-constants.py`, `check-virginia-exports.py`,
`check-virginia-docs.py`, `virginia-stats.py`) all need the same things: the list of modules, every
<Fact> with where it sits, its dependencies resolved the way the engine resolves them. They are here
so a new module, or a fact moving between modules, is seen by every check without any of them
changing.

The dictionary files are regular enough that a `<Fact path="…"> … </Fact>` scan is exact (facts do
not nest), and a text scan keeps the line numbers the messages print.
"""
from __future__ import annotations

import pathlib
import re
from dataclasses import dataclass
from functools import lru_cache

PORT = pathlib.Path(__file__).resolve().parents[2]
ROOT = PORT.parents[1]
RESOURCES = PORT / "src/main/resources/direct-file"
FACTS_DIR = RESOURCES / "facts"
FLOW = RESOURCES / "flow/your-taxes-virginia.xml"
SCENARIOS = RESOURCES / "scenarios"
DATA = RESOURCES / "website-static/data"
DEMOS = DATA / "virginia-demos.json"

CONSTANTS = "virginiaConstants"    # every tax-year figure, date and rate; nothing else may carry one
LOCALITIES = "virginiaLocalities"  # the 133 localities, their codes and use-tax rates

FACT_RE = re.compile(r'<Fact path="([^"]+)"(.*?)</Fact>', re.S)
DEP_RE = re.compile(r'<Dependency (?:module="([^"]*)" )?path="([^"]+)"')
SCOPE_RE = re.compile(r'<(Find|Filter) path="(/[^"]+)">(.*?)</\1>', re.S)
FILER_ALIASES = ("/primaryFiler/", "/secondaryFiler/", "/vaSpouse/")


@dataclass
class Fact:
    path: str
    body: str          # everything between the opening <Fact …> tag and </Fact>
    file: pathlib.Path
    start: int         # offset of the <Fact in the file's text
    end: int

    @property
    def module(self) -> str:
        return self.file.stem

    @property
    def line(self) -> int:
        return read_text(self.file).count("\n", 0, self.start) + 1

    def tag(self, name: str) -> str | None:
        m = re.search(rf"<{name}>(.*?)</{name}>", self.body, re.S)
        return " ".join(m.group(1).split()) if m else None

    @property
    def name(self) -> str:
        return self.tag("Name") or ""

    @property
    def description(self) -> str:
        return self.tag("Description") or ""

    @property
    def writable(self) -> bool:
        return "<Writable>" in self.body

    @property
    def derived(self) -> bool:
        return "<Derived>" in self.body

    def dependencies(self):
        """(module or None, path as written, resolved absolute wildcard path or None) for each <Dependency>."""
        for m in DEP_RE.finditer(self.body):
            yield m.group(1), m.group(2), resolve(self.path, m.group(2), self.body, m.start())

    def line_of(self, offset: int) -> int:
        """The file line of an offset into `body`."""
        text = read_text(self.file)
        head = len(f'<Fact path="{self.path}"')
        return text.count("\n", 0, self.start + head + offset) + 1


@lru_cache(maxsize=None)
def read_text(file: pathlib.Path) -> str:
    return file.read_text()


def module_files() -> list[pathlib.Path]:
    return sorted(FACTS_DIR.glob("virginia*.xml"))


def federal_files() -> list[pathlib.Path]:
    return sorted(f for f in FACTS_DIR.glob("*.xml") if not f.name.startswith("virginia"))


def facts(file: pathlib.Path) -> list[Fact]:
    text = read_text(file)
    return [Fact(m.group(1), m.group(2), file, m.start(), m.end()) for m in FACT_RE.finditer(text)]


def all_facts() -> list[Fact]:
    return [f for file in module_files() for f in facts(file)]


def by_path() -> dict[str, Fact]:
    return {f.path: f for f in all_facts()}


def resolve(fact_path: str, dep_path: str, body: str, dep_pos: int) -> str | None:
    """The absolute wildcard path a dependency reads, the way the engine resolves it:
    /primaryFiler/x, /secondaryFiler/x and /vaSpouse/x are the filer's /filers/*/x; ../x inside a
    fact at /collection/*/y is /collection/*/x; a bare x inside <Find path="/c"> or <Filter path="/c">
    is /c/*/x. None for a relative path with no enclosing collection."""
    if dep_path.startswith("/"):
        for alias in FILER_ALIASES:
            if dep_path.startswith(alias):
                return "/filers/*/" + dep_path[len(alias):]
        return dep_path
    if dep_path.startswith("../"):
        parent = fact_path.rsplit("/", 1)[0]  # /formW2s/*/vaWithholding -> /formW2s/*
        return f"{parent}/{dep_path[3:]}"
    for m in SCOPE_RE.finditer(body):
        if m.start() <= dep_pos < m.end():
            return f"{m.group(2)}/*/{dep_path}"
    return None


def federal_exports() -> dict[tuple[str, str], str]:
    """(module, path) -> the <Export …/> attributes of every federal fact ('' when it has none)."""
    flags = {}
    for f in federal_files():
        for m in FACT_RE.finditer(read_text(f)):
            ex = re.search(r"<Export([^/]*)/>", m.group(2))
            flags[(f.stem, m.group(1))] = ex.group(1) if ex else ""
    return flags


def virginia_routes() -> list[str]:
    """The routes the one-question-per-page build gives the Virginia flow, as Form Builder's
    PageSplitter cuts them: a page whose top-level units (seeing through <section>) are all
    df-screen blocks, and more than one, becomes one route per block; any other page keeps its
    route. Only the count matters here (the a11y script spells the block slugs), so a block's route
    is its ordinal."""
    import xml.etree.ElementTree as ET

    def units(node):
        out = []
        for c in node:
            if c.tag == "section":
                out.extend(units(c))
            elif c.tag != "modal":
                out.append(c)
        return out

    out = []
    for page in ET.parse(FLOW).getroot().iter("page"):
        blocks = units(page)
        if len(blocks) > 1 and all(b.tag == "div" and "df-screen" in (b.get("class") or "") for b in blocks):
            out.extend(f"{page.get('route')}/{i + 1}" for i in range(len(blocks)))
        else:
            out.append(page.get("route"))
    return out
