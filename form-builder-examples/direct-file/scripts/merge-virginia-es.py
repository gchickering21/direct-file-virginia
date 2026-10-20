#!/usr/bin/env python3
"""Merge locales/virginia_es.yaml into the generated locales/flow_es.yaml.

flow_es.yaml is reseeded from Direct File's Spanish by `make transpile-es`, which drops
anything Direct File never had. Run this after it (and after any change to the Virginia
screens' English, which changes the content-addressed keys). Idempotent; also checks that
every Virginia key exists in flow_en.yaml, so a stale key is caught here rather than as a
??placeholder?? on the Spanish page.
"""
import pathlib, sys, yaml

L = pathlib.Path(__file__).resolve().parents[1] / "src/main/resources/direct-file/locales"
en = yaml.safe_load((L / "flow_en.yaml").read_text())
es_path = L / "flow_es.yaml"
es_text = es_path.read_text()
es = yaml.safe_load(es_text) or {}
va = yaml.safe_load((L / "virginia_es.yaml").read_text())

def keys(d, prefix=""):
    for k, v in d.items():
        if isinstance(v, dict):
            yield from keys(v, f"{prefix}{k}.")
        else:
            yield f"{prefix}{k}"

stale = []
for route, block in va.items():
    if route not in en:
        stale.append(route); continue
    for k in keys(block):
        node = en[route]
        for part in k.split("."):
            node = node.get(part) if isinstance(node, dict) else None
        if node is None:
            stale.append(f"{route}.{k}")
if stale:
    print("keys in virginia_es.yaml that flow_en.yaml no longer has (English changed? re-copy the key):")
    for s in stale: print("  " + s)
    sys.exit(1)

header = "".join(line for line in es_text.splitlines(keepends=True) if line.startswith("#"))
es.update(va)
es_path.write_text(header + yaml.safe_dump(es, allow_unicode=True, width=120, sort_keys=False))
print(f"merged {len(va)} Virginia routes into flow_es.yaml")
