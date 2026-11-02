#!/usr/bin/env python3
"""The true counts for the Virginia module, so the prose never drifts from the code.

    python3 scripts/virginia-stats.py            text
    python3 scripts/virginia-stats.py --json     JSON
    python3 scripts/virginia-stats.py --check    scan the docs for stale numbers; exit 1 on a mismatch

What is counted, and how (the heuristics, stated so they can be argued with):
  facts_virginia, facts_localities   <Fact> elements in facts/virginia.xml and facts/virginiaLocalities.xml
  screens                            <page> elements in flow/your-taxes-virginia.xml (one route each)
  question_groups                    the "Question N of M" eyebrows on those pages (the questions no one reports)
  writable                           <Fact>s in virginia.xml with a <Writable>
  records_standins                   those Writables whose <Description> says "record": Lines 20 to 22, which
                                     a state fills from its own books and the prototype only lets the filer edit
  filer_questions                    writable minus records_standins (includes the two flow-control answers)
  demos                              scenarios/virginia_demo_*.json
  households                         entries of the `cases = {...}` dict in scripts/virginia-cases.py (via ast)
  a11y_routes                        entries of PAGES in scripts/virginia-a11y.cjs
  workbench_examples                 "examples" in workbench/examples/virginia.json

--check: a number (digits or a number word) followed within two words by facts / screens / households /
questions / demo(s) is compared with the counts it could mean (e.g. "screens" may mean the pages or the
a11y routes). Numbers after the keyword ("Virginia Demo 2", "Household 1") and numbers over 500 (the
IRS's own totals) are left alone.
"""
import ast, glob, json, pathlib, re, sys
import xml.etree.ElementTree as ET

PORT = pathlib.Path(__file__).resolve().parents[1]
ROOT = PORT.parents[1]
RES = PORT / "src/main/resources/direct-file"

def facts(name):
    return list(ET.parse(RES / "facts" / name).getroot().iter("Fact"))

def counts():
    va = facts("virginia.xml")
    writable = [f for f in va if f.find("Writable") is not None]
    standins = [f for f in writable if re.search(r"\brecords?\b", f.findtext("Description") or "", re.I)]
    flow = (RES / "flow/your-taxes-virginia.xml").read_text()
    cases_src = (PORT / "scripts/virginia-cases.py").read_text()
    households = 0
    for n in ast.walk(ast.parse(cases_src)):
        if isinstance(n, ast.Assign) and isinstance(n.value, ast.Dict) \
                and any(isinstance(t, ast.Name) and t.id == "cases" for t in n.targets):
            households = len(n.value.keys)
    a11y = (PORT / "scripts/virginia-a11y.cjs").read_text()
    pages = re.search(r"const PAGES = \[(.*?)\];", a11y, re.S)
    wb = json.loads((PORT / "workbench/examples/virginia.json").read_text())
    c = {
        "facts_virginia": len(va),
        "facts_localities": len(facts("virginiaLocalities.xml")),
        "screens": len(re.findall(r"<page\b", flow)),
        "question_groups": len(re.findall(r"Question \d+ of \d+", flow)),
        "writable": len(writable),
        "records_standins": len(standins),
        "filer_questions": len(writable) - len(standins),
        "demos": len(glob.glob(str(RES / "scenarios/virginia_demo_*.json"))),
        "households": households,
        "a11y_routes": len(re.findall(r"'[^']+'", pages.group(1))) if pages else 0,
        "workbench_examples": len(wb.get("examples", [])),
    }
    c["facts_total"] = c["facts_virginia"] + c["facts_localities"]
    return c

WORDS = {w: i for i, w in enumerate("zero one two three four five six seven eight nine ten eleven twelve "
    "thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split())}
WORDS.update(thirty=30, forty=40, fifty=50, sixty=60, seventy=70, eighty=80, ninety=90)

def number(tok):
    tok = tok.lower().replace(",", "")
    if tok.isdigit():
        return int(tok)
    parts = tok.split("-")
    return sum(WORDS[p] for p in parts) if all(p in WORDS for p in parts) else None

NUM = r"(\d[\d,]*|(?:" + "|".join(WORDS) + r")(?:-(?:" + "|".join(WORDS) + r"))?)"
PATTERN = re.compile(NUM + r"\s+(?:[\w'-]+\s+){0,2}?(facts|screens|households|questions|demos?)\b", re.I)
DOCS = ["README.md", "DEVELOPERS.md", "CONTRIBUTING.md", "handoff/README.md", "handoff/BRIEF.md",
        "form-builder-examples/direct-file/docs/virginia/README.md", "form-builder-examples/direct-file/CONTRIBUTING.md"]

def check(c):
    accept = {
        "facts": {c["facts_virginia"], c["facts_localities"], c["facts_total"]},
        "screens": {c["screens"], c["a11y_routes"]},
        "households": {c["households"], c["demos"]},
        "questions": {c["filer_questions"], c["writable"], c["question_groups"]},
        "demo": {c["demos"]}, "demos": {c["demos"]},
    }
    bad = 0
    for doc in DOCS:
        path = ROOT / doc
        if not path.exists():
            continue
        for i, line in enumerate(path.read_text().splitlines(), 1):
            for m in PATTERN.finditer(line):
                n, key = number(m.group(1)), m.group(2).lower()
                if n is None or n > 500 or n in accept[key]:
                    continue
                print(f"{doc}:{i}: \"{m.group(0)}\" -- expected one of {sorted(accept[key])}")
                bad += 1
    print(f"{bad} stale number(s) in the docs" if bad else "the docs agree with the code")
    return 1 if bad else 0

if __name__ == "__main__":
    c = counts()
    if "--json" in sys.argv:
        print(json.dumps(c, indent=2))
    elif "--check" not in sys.argv:
        for k, v in c.items():
            print(f"{k:20} {v}")
    sys.exit(check(c) if "--check" in sys.argv else 0)
