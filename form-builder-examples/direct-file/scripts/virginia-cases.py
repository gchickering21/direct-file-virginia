#!/usr/bin/env python3
"""Builds the Virginia acceptance households from the IRS's saved scenarios.

Writes one fact-graph JSON per case plus meta.json into the directory given as the first
argument. scripts/virginia-cases.cjs then loads each into the running dev server and
compares the Virginia lines with an independent model of the rules.
"""
import json, sys, pathlib
OUT = pathlib.Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
SC = pathlib.Path(__file__).resolve().parents[1] / "src/main/resources/direct-file/scenarios"
def load(n): return json.load(open(SC / n))
def facts(d): return d.get("facts", d)
def primary(f):
    return [k.split("/")[2].lstrip("#") for k in f if k.startswith("/filers/#") and k.endswith("/isPrimaryFiler") and f[k]["item"]][0]
def enum(v, opts): return {"$type": "gov.irs.factgraph.persisters.EnumWrapper", "item": {"value": v, "enumOptionsPath": opts}}
def boolean(v): return {"$type": "gov.irs.factgraph.persisters.BooleanWrapper", "item": v}
def dollar(v): return {"$type": "gov.irs.factgraph.persisters.DollarWrapper", "item": f"{v:.2f}"}
def mod(d, *, state="va", wages=None, dob=None, blind=None, claimable=None, locality=None, untaxed=None, estimated=None):
    f = facts(d); pid = primary(f)
    f["/filerResidenceAndIncomeState"]["item"]["value"] = state
    if locality: f["/vaLocality"] = enum(locality, "/vaLocalityOptions")
    if untaxed is not None: f["/vaHasUntaxedPurchases"] = boolean(True); f["/vaUntaxedPurchases"] = dollar(untaxed)
    if estimated is not None: f["/vaEstimatedPayments"] = dollar(estimated)
    if wages is not None:
        w2 = [k for k in f if k.startswith("/formW2s/#") and k.endswith("/writableWages")]
        assert len(w2) == 1
        f[w2[0]]["item"] = f"{wages:.2f}"; f[w2[0].replace("writableWages", "writableStateWages")]["item"] = f"{wages:.2f}"
    if dob: f[f"/filers/#{pid}/dateOfBirth"]["item"]["date"] = dob
    if blind is not None: f[f"/filers/#{pid}/isBlind"]["item"] = blind
    if claimable is not None: f[f"/filers/#{pid}/canBeClaimed"]["item"] = claimable
    return d
# Each case names the rule it exercises. Wages set AGI (the base scenario adds $1,000 of interest).
cases = {
    "A_below_threshold": mod(load("single_33k_no_credits.json"), wages=9000),
    "B_band_2pct": mod(load("single_33k_no_credits.json"), wages=11000),
    "C_band_3pct": mod(load("single_33k_no_credits.json"), wages=12430),
    "D_band_5pct": mod(load("single_33k_no_credits.json"), wages=18430),
    "E_born_1935_90k": mod(load("single_33k_no_credits.json"), wages=90000, dob="1935-06-01"),
    "F_age_phased_out": mod(load("single_33k_no_credits.json"), wages=70000, dob="1955-05-05"),
    "G_social_security": mod(load("single_35k.json")),
    "H_claimable_dependent": mod(load("single_33k_no_credits.json"), wages=3000, claimable=True),
    "I_mfj_70k": mod(load("mfj_70_none.json")),
    "J_blind": mod(load("single_33k_no_credits.json"), blind=True),
    "K_nonresident_ca": mod(load("single_33k_no_credits.json"), state="ca"),
    "L_use_tax_6_3pct_halifax": mod(load("single_33k_no_credits.json"), locality="halifax-county", untaxed=1000),
    "M_use_tax_7pct_williamsburg": mod(load("single_33k_no_credits.json"), locality="williamsburg-city", untaxed=1000),
    "N_refund_after_estimated_payments": mod(load("single_33k_no_credits.json"), estimated=2000),
    "demo_1_riley": load("virginia_demo_1_riley_rappahannock_single_33k.json"),
    "demo_2_morgan": load("virginia_demo_2_morgan_shenandoah_age_65_56k.json"),
}
RECORDS = {k: v for k, v in json.load(open(pathlib.Path(__file__).resolve().parents[1] / "src/main/resources/direct-file/website-static/data/virginia-records.json")).items() if not k.startswith("_")}
meta = {}
for name, d in cases.items():
    f = facts(d); pid = primary(f)
    meta[name] = dict(
        status=f["/filingStatus"]["item"]["value"], state=f["/filerResidenceAndIncomeState"]["item"]["value"],
        dob=f[f"/filers/#{pid}/dateOfBirth"]["item"]["date"], blind=bool(f[f"/filers/#{pid}/isBlind"]["item"]),
        claimable=bool(f[f"/filers/#{pid}/canBeClaimed"]["item"]),
        wages=sum(float(f[k]["item"]) for k in f if k.startswith("/formW2s/#") and k.endswith("/writableWages")),
        deps=sum(1 for k in f if k.startswith("/familyAndHousehold/#") and k.endswith("/isClaimedDependent") and f[k]["item"]),
        withheld=sum(float(f[k]["item"]) for k in f if k.startswith("/formW2s/#") and k.endswith("/writableStateWithholding")),
        locality=(f.get("/vaLocality") or {}).get("item", {}).get("value"),
        lottery=float(f["/vaLotteryPrizesUnder600"]["item"]) if f.get("/vaHasLotteryPrizesUnder600", {}).get("item") else 0,
        savers=float(f["/vaCommonwealthSaversContributions"]["item"]) if f.get("/vaHasCommonwealthSaversContributions", {}).get("item") else 0,
        untaxed=float(f["/vaUntaxedPurchases"]["item"]) if f.get("/vaHasUntaxedPurchases", {}).get("item") else 0,
        estimated=float(f.get("/vaEstimatedPayments", {}).get("item", 0) or 0),
        prior=float(f.get("/vaPriorYearOverpaymentApplied", {}).get("item", 0) or 0),
        extension=float(f.get("/vaExtensionPayments", {}).get("item", 0) or 0))
    # what the records stand-in (website-static/data/virginia-records.json) will fill in on the page
    last = [v["item"] for k, v in f.items() if k.startswith("/filers/#") and k.endswith("/lastName")]
    rec = RECORDS.get(f"{last[0] if last else ''}|{meta[name]['dob']}")
    if rec:
        meta[name]["estimated"] = float(rec.get("estimatedPayments", 0)); meta[name]["prior"] = float(rec.get("priorYearOverpaymentApplied", 0)); meta[name]["extension"] = float(rec.get("extensionPayments", 0))
    json.dump(d, open(OUT / f"{name}.json", "w"))
json.dump(meta, open(OUT / "meta.json", "w"), indent=1)
print(f"{len(cases)} cases written to {OUT}")
