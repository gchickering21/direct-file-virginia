#!/usr/bin/env python3
"""The four demo households, from one manifest: website-static/data/virginia-demos.json.

    python3 scripts/virginia-demos.py build            write scenarios/<file>.json for each demo: its base
                                                       IRS scenario with the manifest's overrides applied
    python3 scripts/virginia-demos.py check            exit 1 if a committed scenario file differs from what
                                                       build would write (for `make check`)
    python3 scripts/virginia-demos.py links [BASE]     print the demo links `make demo-links` prints

A demo is an IRS scenario (base) with a dozen keys changed (overrides): a Virginian's name, address
and employer, the residence state, the answers to the Virginia questions. Keeping the overrides rather
than the 580-line file makes a fifth demo a dozen lines, and the committed file a generated artifact
the check keeps honest. The manifest's other fields (expect, result, the one-line description) are read
by VirginiaSpec, virginia-stats.py --check, virginia-cases.py, virginia-a11y.cjs and the ?demo= link.
"""
import json, pathlib, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / "lib"))
from vafacts import DEMOS, SCENARIOS  # noqa: E402


def manifest():
    return json.loads(DEMOS.read_text())["demos"]


def household(d):
    base = json.loads((SCENARIOS / d["base"]).read_text())
    base.update(d["overrides"])
    return base


def text(d):
    return json.dumps(household(d), indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def build():
    for d in manifest():
        (SCENARIOS / f"{d['file']}.json").write_text(text(d))
        print(f"wrote scenarios/{d['file']}.json: {d['base']} with {len(d['overrides'])} keys changed")


def check():
    bad = 0
    for d in manifest():
        p = SCENARIOS / f"{d['file']}.json"
        if not p.exists():
            print(f"scenarios/{d['file']}.json is missing: run python3 scripts/virginia-demos.py build"); bad += 1
        elif json.loads(p.read_text()) != household(d):
            print(f"scenarios/{d['file']}.json differs from the manifest: edit website-static/data/virginia-demos.json, then build"); bad += 1
    print(f"{len(manifest())} demo households match the manifest" if not bad else f"{bad} demo household(s) out of step")
    return 1 if bad else 0


def links(base):
    print(f"Start here: {base}/resources/start/   (the four households, what to look for, the admin pages)")
    print(f"The Virginia site: {base}/")
    for d in manifest():
        print(f"  {d['n']}  {d['line']:<64} {base}/your-taxes/virginia/virginia-intro/?demo={d['n']}")
    print("Any file in resources/scenarios/ loads the same way: ?scenario=<name without .json>")
    print("The admin pages (Scenario, Browse All, Author Mode, the Workbench): docs/surfaces.md")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    if cmd == "build":
        build()
    elif cmd == "links":
        links(sys.argv[2] if len(sys.argv) > 2 else "http://localhost:3008/app/direct-file")
    elif cmd == "check":
        sys.exit(check())
    else:
        sys.exit(__doc__)
