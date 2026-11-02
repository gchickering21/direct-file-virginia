#!/usr/bin/env python3
"""The integration rule from docs/adr/001-virginia-state-return.md, enforced.

Every federal fact the Virginia modules read must be one the federal return already
exports to a state: flagged stateSystems="true" (the state API's enriched JSON) or
mef="true" (the Form 1040 XML), both of which the state API delivered to a state's
software. The one exception is the residency answer, which gates the Virginia screens and
computes nothing. Exit 1 and name the offenders otherwise.

Scans facts/virginia.xml and facts/virginiaLocalities.xml. A federal read is a
<Dependency> that names a module. Its path is resolved the way the engine resolves it:
  /primaryFiler/x, /secondaryFiler/x and /vaSpouse/x are the filer's /filers/*/x;
  ../x inside a fact at /collection/*/y is /collection/*/x;
  a bare x inside <Find path="/c"> or <Filter path="/c"> is /c/*/x.
"""
import pathlib, re, sys

FACTS = pathlib.Path(__file__).resolve().parents[1] / "src/main/resources/direct-file/facts"
VIRGINIA = ["virginia.xml", "virginiaLocalities.xml"]
ALLOWED_GATES = {"/filerResidenceAndIncomeState"}
FILER_ALIASES = ("/primaryFiler/", "/secondaryFiler/", "/vaSpouse/")

FACT_RE = re.compile(r'<Fact path="([^"]+)"(.*?)</Fact>', re.S)
DEP_RE = re.compile(r'<Dependency module="([^"]+)" path="([^"]+)"')
SCOPE_RE = re.compile(r'<(Find|Filter) path="(/[^"]+)">(.*?)</\1>', re.S)

def exports():
    flags = {}
    for f in FACTS.glob("*.xml"):
        if f.name.startswith("virginia"):
            continue  # our own modules are not federal facts
        for m in FACT_RE.finditer(f.read_text()):
            ex = re.search(r"<Export([^/]*)/>", m.group(2))
            flags[(f.stem, m.group(1))] = ex.group(1) if ex else ""
    return flags

def resolve(fact_path, dep_path, body, dep_pos):
    """The absolute wildcard path a dependency reads."""
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

def main():
    flags = exports()
    bad, seen = [], {}
    for name in VIRGINIA:
        text = (FACTS / name).read_text()
        for fact in FACT_RE.finditer(text):
            fact_path, body = fact.group(1), fact.group(2)
            for dep in DEP_RE.finditer(body):
                module, path = dep.group(1), dep.group(2)
                if module.startswith("virginia"):
                    continue
                lookup = resolve(fact_path, path, body, dep.start())
                key = (module, lookup or path)
                if key in seen:
                    continue
                seen[key] = name
                if lookup is None:
                    bad.append(f"{module}:{path}  (relative path with no enclosing collection, in {fact_path})")
                    continue
                if lookup in ALLOWED_GATES:
                    continue
                attrs = flags.get((module, lookup))
                if attrs is None:
                    bad.append(f"{module}:{lookup}  (not found in the federal dictionary)")
                elif 'stateSystems="true"' not in attrs and 'mef="true"' not in attrs:
                    bad.append(f"{module}:{lookup}  (exported: {attrs.strip() or 'nothing'})")
    for name in VIRGINIA:
        reads = sorted(k for k, v in seen.items() if v == name)
        print(f"{len(reads)} federal facts read by facts/{name}")
        for s in reads:
            print(f"  {s[0]}:{s[1]}")
    if bad:
        print("\nNOT exported to states or MeF:")
        for b in bad:
            print("  " + b)
        return 1
    print("\nevery one is exported to state systems or to MeF (or is the residency gate)")
    return 0

if __name__ == "__main__":
    sys.exit(main())
