#!/usr/bin/env python3
"""Two shape checks on the Virginia fact modules. Exit 1 and say what is wrong.

1. facts/virginiaConstants.xml holds every tax-year figure, one fact each with a <TaxYear> and a
   derived literal. In every other Virginia module no <Day> literal and no <Dollar> literal other
   than 0 may appear: a rule refers to a figure by <Dependency>, so that one edit a year is one
   edit in one file.

2. facts/virginiaLocalities.xml lists every option of /vaLocalityOptions exactly once in the
   /vaLocalityCode switch and exactly once in the /vaUseTaxRate switch, names nothing that is not
   an option, and has no default case in either: an unlisted locality fails loudly (an incomplete
   code or rate) rather than silently taking "" or 5.3%.
"""
import pathlib, re, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / "lib"))
from vafacts import CONSTANTS, LOCALITIES, FACTS_DIR, all_facts, facts, module_files  # noqa: E402


def check_constants(problems):
    if not (FACTS_DIR / f"{CONSTANTS}.xml").exists():
        problems.append(f"{CONSTANTS}.xml: the constants module is missing")
        return
    n = 0
    for f in all_facts():
        if f.module == CONSTANTS:
            n += 1
            if "<TaxYear>" not in f.body:
                problems.append(f"{f.file.name}:{f.line}: constant {f.path} has no <TaxYear>")
            if "<Derived>" not in f.body:
                problems.append(f"{f.file.name}:{f.line}: constant {f.path} is not a derived literal")
            continue
        for m in re.finditer(r"<Day>[^<]*</Day>", f.body):
            problems.append(f"{f.file.name}:{f.line_of(m.start())}: date literal outside {CONSTANTS}.xml: {m.group(0)}")
        for m in re.finditer(r"<Dollar>\s*([^<]*?)\s*</Dollar>", f.body):
            if re.fullmatch(r"0+(\.0+)?", m.group(1)):
                continue
            problems.append(f"{f.file.name}:{f.line_of(m.start())}: dollar literal outside {CONSTANTS}.xml: <Dollar>{m.group(1)}</Dollar>")
    print(f"{n} tax-year figures in {CONSTANTS}.xml; no date or dollar literal in the other {len(module_files()) - 1} modules")


def check_localities(problems):
    path = FACTS_DIR / f"{LOCALITIES}.xml"
    by = {f.path: f for f in facts(path)}
    options_fact = by.get("/vaLocalityOptions")
    if not options_fact:
        problems.append(f"{path.name}: /vaLocalityOptions not found")
        return
    options = re.findall(r"<String>([^<]+)</String>", options_fact.body)
    for fact in ("/vaLocalityCode", "/vaUseTaxRate"):
        f = by.get(fact)
        if not f:
            problems.append(f"{path.name}: {fact} not found")
            continue
        if re.search(r"<When>\s*<True\s*/>\s*</When>", f.body):
            problems.append(f"{path.name}: {fact} has a default case; every locality must be listed")
        named = re.findall(r'<Enum optionsPath="/vaLocalityOptions">([^<]+)</Enum>', f.body)
        counts = {}
        for n in named:
            counts[n] = counts.get(n, 0) + 1
        for o in options:
            if counts.get(o, 0) != 1:
                problems.append(f"{path.name}: {fact} names {o} {counts.get(o, 0)} times (expected once)")
        for n in counts:
            if n not in options:
                problems.append(f"{path.name}: {fact} names {n}, which is not in /vaLocalityOptions")
    print(f"{len(options)} localities, each in /vaLocalityCode and /vaUseTaxRate once")


def main():
    problems = []
    check_constants(problems)
    check_localities(problems)
    if problems:
        for p in problems:
            print(p)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
