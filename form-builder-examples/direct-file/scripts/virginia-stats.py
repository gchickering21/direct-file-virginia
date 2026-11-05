#!/usr/bin/env python3
"""The true counts for the Virginia module, so the prose never drifts from the code.

    python3 scripts/virginia-stats.py            text
    python3 scripts/virginia-stats.py --json     JSON
    python3 scripts/virginia-stats.py --check    scan the docs for stale numbers; exit 1 on a mismatch

What is counted, and how (the heuristics, stated so they can be argued with):
  modules                            the Virginia fact modules, facts/virginia*.xml
  facts_virginia, facts_localities   <Fact> elements in the modules other than virginiaLocalities.xml, and in it
  screens                            <page> elements in flow/your-taxes-virginia.xml
  routes                             the pages after the one-question-per-page split (what the a11y script walks)
  question_groups                    the "Question N of M" eyebrows on those pages (the questions no one reports)
  writable                           <Fact>s in the modules with a <Writable>
  records_standins                   those Writables whose <Description> says "record": Lines 20 to 22, which
                                     a state fills from its own books and the prototype only lets the filer edit
  filer_questions                    writable minus records_standins (includes the two flow-control answers)
  demos                              the households in website-static/data/virginia-demos.json
  households                         the `cases = {...}` dict in scripts/virginia-cases.py (via ast) plus the demos
  workbench_examples                 "examples" in workbench/examples/virginia.json

--check: a number (digits or a number word) followed within two words by facts / screens / households /
questions / modules / demo(s) is compared with the counts it could mean (e.g. "screens" may mean the pages
or the split routes). Numbers after the keyword ("Virginia Demo 2", "Household 1") and numbers over 500 (the
IRS's own totals) are left alone. And each demo's result ("owes $698", "refund $505") must read the same
wherever a doc names that household.
"""
import ast, json, pathlib, re, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / "lib"))
from vafacts import DEMOS, FLOW, LOCALITIES, PORT, ROOT, all_facts, module_files, virginia_routes  # noqa: E402


def counts():
    va = [f for f in all_facts() if f.module != LOCALITIES]
    writable = [f for f in va if f.writable]
    standins = [f for f in writable if re.search(r"\brecords?\b", f.description, re.I)]
    flow = FLOW.read_text()
    cases_src = (PORT / "scripts/virginia-cases.py").read_text()
    households = 0
    for n in ast.walk(ast.parse(cases_src)):
        if isinstance(n, ast.Assign) and isinstance(n.value, ast.Dict) \
                and any(isinstance(t, ast.Name) and t.id == "cases" for t in n.targets):
            households = len(n.value.keys)
    demos = json.loads(DEMOS.read_text())["demos"]
    wb = json.loads((PORT / "workbench/examples/virginia.json").read_text())
    c = {
        "modules": len(module_files()),
        "facts_virginia": len(va),
        "facts_localities": len([f for f in all_facts() if f.module == LOCALITIES]),
        "screens": len(re.findall(r"<page\b", flow)),
        "routes": len(virginia_routes()),
        "question_groups": len(re.findall(r"Question \d+ of \d+", flow)),
        "writable": len(writable),
        "records_standins": len(standins),
        "filer_questions": len(writable) - len(standins),
        "demos": len(demos),
        "households": households + len(demos),
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
PATTERN = re.compile(NUM + r"\s+(?:[\w'-]+\s+){0,2}?(facts|screens|households|questions|modules|demos?)\b", re.I)
RESULT = re.compile(r"\b(owes|refund)\s+\$([\d,]+)")
DOCS = ["README.md", "GETTING_STARTED.md", "CONTRIBUTING.md", "docs/surfaces.md", "docs/changing-the-return.md",
        "docs/archive-2025.md", "docs/macos-13.md", "handoff/README.md", "handoff/BRIEF.md", "handoff/POLICY_MAP.md",
        "form-builder-examples/direct-file/docs/virginia/README.md", "form-builder-examples/direct-file/workbench/README.md",
        "form-builder-examples/direct-file/docs/adr/003-the-layout-for-growth.md"]


def check(c):
    accept = {
        "facts": {c["facts_virginia"], c["facts_localities"], c["facts_total"]},
        "screens": {c["screens"], c["routes"]},
        "households": {c["households"], c["demos"]},
        "questions": {c["filer_questions"], c["writable"], c["question_groups"]},
        "modules": {c["modules"], c["modules"] - 1},
        "demo": {c["demos"]}, "demos": {c["demos"]},
    }
    demos = json.loads(DEMOS.read_text())["demos"]
    bad = 0
    for doc in DOCS:
        path = ROOT / doc
        if not path.exists():
            continue
        for i, line in enumerate(path.read_text().splitlines(), 1):
            for m in PATTERN.finditer(line):
                n, key = number(m.group(1)), m.group(2).lower()
                if n is None or n > 500 or n in accept[key] or "federal" in m.group(0).lower():
                    continue  # "36 federal modules" is the IRS's count, not ours
                print(f"{doc}:{i}: \"{m.group(0)}\" -- expected one of {sorted(accept[key])}")
                bad += 1
            for d in demos:
                if d["name"].split()[-1] not in line:
                    continue
                for m in RESULT.finditer(line):
                    kind, amount = m.group(1), int(m.group(2).replace(",", ""))
                    if kind != d["result"]["kind"] or amount != d["result"]["amount"]:
                        print(f"{doc}:{i}: \"{m.group(0)}\" for {d['name']} -- the manifest says {d['result']['kind']} ${d['result']['amount']:,}")
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
