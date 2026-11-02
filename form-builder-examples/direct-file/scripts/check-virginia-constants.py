#!/usr/bin/env python3
"""Two shape checks on the Virginia fact modules. Exit 1 and say what is wrong.

1. facts/virginia.xml keeps every tax-year figure between the `<!-- constants:begin -->` and
   `<!-- constants:end -->` markers, one fact each with a <TaxYear>. Outside the block, no <Day>
   literal and no <Dollar> literal other than 0 may appear: a rule refers to a figure by
   <Dependency>, so that one edit a year is one edit.

2. facts/virginiaLocalities.xml lists every option of /vaLocalityOptions exactly once in the
   /vaLocalityCode switch and exactly once in the /vaUseTaxRate switch, names nothing that is not
   an option, and has no default case in either: an unlisted locality fails loudly (an incomplete
   code or rate) rather than silently taking "" or 5.3%.
"""
import pathlib, re, sys

FACTS = pathlib.Path(__file__).resolve().parents[1] / "src/main/resources/direct-file/facts"
BEGIN, END = "<!-- constants:begin -->", "<!-- constants:end -->"

def check_constants(problems):
    path = FACTS / "virginia.xml"
    text = path.read_text()
    if text.count(BEGIN) != 1 or text.count(END) != 1 or text.index(BEGIN) > text.index(END):
        problems.append(f"{path.name}: expected exactly one {BEGIN} before one {END}")
        return
    a, b = text.index(BEGIN), text.index(END)
    block = text[a:b]
    for m in re.finditer(r'<Fact path="([^"]+)"(.*?)</Fact>', block, re.S):
        if "<TaxYear>" not in m.group(2):
            problems.append(f"{path.name}: constant {m.group(1)} has no <TaxYear>")
        if "<Derived>" not in m.group(2):
            problems.append(f"{path.name}: constant {m.group(1)} is not a derived literal")
    for span_start, span in ((0, text[:a]), (b, text[b:])):
        for m in re.finditer(r"<Day>[^<]*</Day>", span):
            line = text.count("\n", 0, span_start + m.start()) + 1
            problems.append(f"{path.name}:{line}: date literal outside the constants block: {m.group(0)}")
        for m in re.finditer(r"<Dollar>\s*([^<]*?)\s*</Dollar>", span):
            value = m.group(1)
            if re.fullmatch(r"0+(\.0+)?", value):
                continue
            line = text.count("\n", 0, span_start + m.start()) + 1
            problems.append(f"{path.name}:{line}: dollar literal outside the constants block: <Dollar>{value}</Dollar>")

def check_localities(problems):
    path = FACTS / "virginiaLocalities.xml"
    text = path.read_text()
    options_body = re.search(r'<Fact path="/vaLocalityOptions">(.*?)</Fact>', text, re.S)
    if not options_body:
        problems.append(f"{path.name}: /vaLocalityOptions not found")
        return
    options = re.findall(r"<String>([^<]+)</String>", options_body.group(1))
    for fact in ("/vaLocalityCode", "/vaUseTaxRate"):
        m = re.search(rf'<Fact path="{re.escape(fact)}">(.*?)</Fact>', text, re.S)
        if not m:
            problems.append(f"{path.name}: {fact} not found")
            continue
        body = m.group(1)
        if re.search(r"<When>\s*<True\s*/>\s*</When>", body):
            problems.append(f"{path.name}: {fact} has a default case; every locality must be listed")
        named = re.findall(r'<Enum optionsPath="/vaLocalityOptions">([^<]+)</Enum>', body)
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
    print("virginia.xml: no date or dollar literal outside the constants block")
    return 0

if __name__ == "__main__":
    sys.exit(main())
