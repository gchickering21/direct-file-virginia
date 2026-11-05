#!/usr/bin/env python3
"""The integration rule from docs/adr/001-virginia-state-return.md, enforced.

Every federal fact the Virginia modules read must be one the federal return already
exports to a state: flagged stateSystems="true" (the state API's enriched JSON) or
mef="true" (the Form 1040 XML), both of which the state API delivered to a state's
software. The one exception is the residency answer, which gates the Virginia screens and
computes nothing. Exit 1 and name the offenders otherwise.

Scans every facts/virginia*.xml. A federal read is a <Dependency> that names a federal
module; its path is resolved the way the engine resolves it (scripts/lib/vafacts.py).

Then the workbench's side of the same contract: workbench/federal-inputs.json stands each
federal fact in for the worked examples. Every federal fact read must have a stand-in, and
every stand-in must be read, so the two lists cannot drift apart. /taxYear is the
workbench's own (it writes year switches on it); /filers/*/isPrimaryFiler is how the sandbox
builds its two filers, not an input.
"""
import json, pathlib, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / "lib"))
from vafacts import FILER_ALIASES, PORT, all_facts, federal_exports, module_files  # noqa: E402

ALLOWED_GATES = {"/filerResidenceAndIncomeState"}
FEDERAL_INPUTS = PORT / "workbench/federal-inputs.json"
WORKBENCH_OWN = {"/taxYear"}
SANDBOX_IMPLICIT = {"/filers/*/isPrimaryFiler"}


def normalize(path):
    for alias in FILER_ALIASES:
        if path.startswith(alias):
            return "/filers/*/" + path[len(alias):]
    return path


def main():
    flags = federal_exports()
    bad, seen, readers = [], {}, {}
    for fact in all_facts():
        for module, path, lookup in fact.dependencies():
            if module is None or module.startswith("virginia"):
                continue
            key = (module, lookup or path)
            readers.setdefault(key, set()).add(fact.module)
            if key in seen:
                continue
            seen[key] = fact.module
            if lookup is None:
                bad.append(f"{module}:{path}  (relative path with no enclosing collection, in {fact.path})")
                continue
            if lookup in ALLOWED_GATES:
                continue
            attrs = flags.get((module, lookup))
            if attrs is None:
                bad.append(f"{module}:{lookup}  (not found in the federal dictionary)")
            elif 'stateSystems="true"' not in attrs and 'mef="true"' not in attrs:
                bad.append(f"{module}:{lookup}  (exported: {attrs.strip() or 'nothing'})")
    for file in module_files():
        reads = sorted(k for k, v in readers.items() if file.stem in v)
        if reads:
            print(f"{len(reads)} federal facts read by facts/{file.name}")
            for s in reads:
                print(f"  {s[0]}:{s[1]}")
    print(f"{len(seen)} federal facts read in all, by {len(module_files())} Virginia modules")
    if bad:
        print("\nNOT exported to states or MeF:")
        for b in bad:
            print("  " + b)
        return 1
    print("every one is exported to state systems or to MeF (or is the residency gate)")

    standins = {normalize(i["path"]): i for i in json.loads(FEDERAL_INPUTS.read_text())["inputs"]}
    read = {lookup for (_, lookup) in seen}
    missing = sorted(read - set(standins) - SANDBOX_IMPLICIT)
    stale = sorted(set(standins) - read - WORKBENCH_OWN)
    if missing or stale:
        for p in missing:
            print(f"workbench/federal-inputs.json has no stand-in for {p}: add it, with its type")
        for p in stale:
            print(f"workbench/federal-inputs.json stands in {p}, which no Virginia module reads: drop it")
        return 1
    print(f"workbench/federal-inputs.json stands in every one of them ({len(standins)} stand-ins), and nothing else")
    return 0


if __name__ == "__main__":
    sys.exit(main())
