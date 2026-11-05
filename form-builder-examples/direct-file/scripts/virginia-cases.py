#!/usr/bin/env python3
"""Builds the Virginia acceptance households from the IRS's saved scenarios.

Writes one fact-graph JSON per case plus meta.json (the inputs of the independent model in
scripts/lib/virginia-model.cjs, except the figures read from the page) into the directory given
as the first argument, and the same files into src/test/resources/virginia-cases/ for
VirginiaSpec. scripts/virginia-cases.cjs then loads each into the running dev server and
compares the Virginia lines with the model.
"""
import json, sys, pathlib, uuid
OUT = pathlib.Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
PORT = pathlib.Path(__file__).resolve().parents[1]
TEST_RES = PORT / "src/test/resources/virginia-cases"; TEST_RES.mkdir(parents=True, exist_ok=True)
SC = PORT / "src/main/resources/direct-file/scenarios"
def load(n): return json.load(open(SC / n))
def facts(d): return d.get("facts", d)
def filer_ids(f):
    ids = {k.split("/")[2].lstrip("#"): f[k]["item"] for k in f if k.startswith("/filers/#") and k.endswith("/isPrimaryFiler")}
    return [i for i, p in ids.items() if p][0], [i for i, p in ids.items() if not p]
def primary(f): return filer_ids(f)[0]
def enum(v, opts): return {"$type": "gov.irs.factgraph.persisters.EnumWrapper", "item": {"value": v, "enumOptionsPath": opts}}
def boolean(v): return {"$type": "gov.irs.factgraph.persisters.BooleanWrapper", "item": v}
def dollar(v): return {"$type": "gov.irs.factgraph.persisters.DollarWrapper", "item": f"{v:.2f}"}
def day(v): return {"$type": "gov.irs.factgraph.persisters.DayWrapper", "item": {"date": v}}
def w2_ids(f): return f["/formW2s"]["item"]["items"]
def mod(d, *, state="va", wages=None, dob=None, blind=None, claimable=None, locality=None, untaxed=None, estimated=None,
        basic_pay=None, retirement=None, savers=None, spouse_dob=None, spouse_blind=None, extra_w2=None):
    f = facts(d); pid, others = filer_ids(f)
    f["/filerResidenceAndIncomeState"]["item"]["value"] = state
    # Box 15 of every W-2 names the residence state unless a case says otherwise: a few IRS fixtures
    # leave it blank while filling box 17, which no W-2 does.
    for w in w2_ids(f):
        f.setdefault(f"/formW2s/#{w}/writableState", enum("sameState", "/incomeFormStateOptions"))
    # every Virginia question answered, No unless the case says otherwise, so the household is complete on its own
    f["/vaHasMilitaryIncome"] = boolean(basic_pay is not None or retirement is not None)
    for q in ("/vaHasCommonwealthSaversContributions", "/vaHasUntaxedPurchases"): f.setdefault(q, boolean(False))
    f.setdefault("/vaEverythingRight", boolean(True))
    if basic_pay is not None or retirement is not None:
        f["/vaHasMilitaryBasicPay"] = boolean(basic_pay is not None); f["/vaHasMilitaryRetirement"] = boolean(retirement is not None)
        if basic_pay is not None: f["/vaMilitaryBasicPay"] = dollar(basic_pay)
        if retirement is not None: f["/vaMilitaryRetirementIncome"] = dollar(retirement)
    if savers is not None: f["/vaHasCommonwealthSaversContributions"] = boolean(True); f["/vaCommonwealthSaversContributions"] = dollar(savers)
    if locality: f["/vaLocality"] = enum(locality, "/vaLocalityOptions")
    if untaxed is not None: f["/vaHasUntaxedPurchases"] = boolean(True); f["/vaUntaxedPurchases"] = dollar(untaxed)
    if estimated is not None:
        # A figure on Line 20 that the records stand-in did not put there is a correction the filer made,
        # and the page keeps it only while /vaRecordsKey names the same person (see virginia-records.js).
        f["/vaEstimatedPayments"] = dollar(estimated)
        key_last = f[f"/filers/#{pid}/lastName"]["item"]; key_dob = (dob or f[f"/filers/#{pid}/dateOfBirth"]["item"]["date"])
        f["/vaRecordsKey"] = {"$type": "gov.irs.factgraph.persisters.StringWrapper", "item": f"{key_last}|{key_dob}"}
    if wages is not None:
        w2 = [k for k in f if k.startswith("/formW2s/#") and k.endswith("/writableWages")]
        assert len(w2) == 1
        f[w2[0]]["item"] = f"{wages:.2f}"; f[w2[0].replace("writableWages", "writableStateWages")]["item"] = f"{wages:.2f}"
    if extra_w2:  # a second W-2, cloned from the first: wages, withheld, state ('sameState' or None for a blank box 15)
        src = w2_ids(f)[0]; new = str(uuid.uuid5(uuid.NAMESPACE_URL, "virginia-cases/extra-w2"))  # stable, so the committed case file does not churn
        for k in [k for k in f if k.startswith(f"/formW2s/#{src}/")]:
            f[k.replace(src, new)] = json.loads(json.dumps(f[k]))
        f["/formW2s"]["item"]["items"].append(new)
        f[f"/formW2s/#{new}/writableWages"] = dollar(extra_w2["wages"]); f[f"/formW2s/#{new}/writableStateWages"] = dollar(extra_w2["wages"])
        f[f"/formW2s/#{new}/writableStateWithholding"] = dollar(extra_w2["withheld"])
        if extra_w2.get("state"): f[f"/formW2s/#{new}/writableState"] = enum(extra_w2["state"], "/incomeFormStateOptions")
        else: f.pop(f"/formW2s/#{new}/writableState", None)
    if dob: f[f"/filers/#{pid}/dateOfBirth"]["item"]["date"] = dob
    if blind is not None: f[f"/filers/#{pid}/isBlind"]["item"] = blind
    if claimable is not None: f[f"/filers/#{pid}/canBeClaimed"]["item"] = claimable
    if spouse_dob or spouse_blind is not None:
        sid = others[0]
        if spouse_dob: f[f"/filers/#{sid}/dateOfBirth"] = day(spouse_dob)
        if spouse_blind is not None: f[f"/filers/#{sid}/isBlind"] = boolean(spouse_blind)
    return d
# Each case names the rule it exercises. Wages set AGI (the single_33k base adds $1,000 of interest; mfj_70_none
# adds $30,000 of unemployment and $1,499 more, so its Virginia AGI is wages + $1,499).
S33 = "single_33k_no_credits.json"; MFJ = "mfj_70_none.json"
cases = {
    "A_below_threshold": mod(load(S33), wages=9000),
    "B_band_2pct": mod(load(S33), wages=11000),
    "C_band_3pct": mod(load(S33), wages=12430),
    "D_band_5pct": mod(load(S33), wages=18430),
    "E_born_1935_90k": mod(load(S33), wages=90000, dob="1935-06-01"),
    "F_age_phased_out": mod(load(S33), wages=70000, dob="1955-05-05"),
    "G_social_security": mod(load("single_35k.json")),
    "H_claimable_dependent": mod(load(S33), wages=3000, claimable=True),
    "I_mfj_70k_with_unemployment": mod(load(MFJ)),
    "J_blind": mod(load(S33), blind=True),
    "K_nonresident_ca": mod(load(S33), state="ca"),
    "L_use_tax_6_3pct_halifax": mod(load(S33), locality="halifax-county", untaxed=1000),
    "M_use_tax_7pct_williamsburg": mod(load(S33), locality="williamsburg-city", untaxed=1000),
    "N_refund_after_estimated_payments": mod(load(S33), estimated=2000),
    "O_low_income_credit": mod(load(S33), wages=13000),
    "P_blind_credit_beats_exemption": mod(load(S33), wages=13000, blind=True),
    "Q_age_65_keeps_age_deduction": mod(load(S33), wages=13000, dob="1955-05-05"),
    "R_claimable_no_credit": mod(load(S33), wages=9000, claimable=True),
    "S_hoh_child_refundable_eitc": mod(load("hoh_20k.json")),
    "T_hoh_child_eitc_after_withholding_unemployment": mod(load("hoh_13k.json")),
    "U_military_basic_pay_phased": mod(load(S33), wages=27000, basic_pay=24000),
    "V_military_basic_pay_tie_keeps_subtraction": mod(load(S33), wages=14000, basic_pay=12000),
    "W_military_basic_pay_over_30k": mod(load(S33), basic_pay=31000),
    "X_military_benefits_without_a_1099r": mod(load(S33), retirement=40000),
    # the edges of every figure in the constants module
    "Y_taxable_income_3000": mod(load(S33), wages=11430),
    "Y2_taxable_income_5000": mod(load(S33), wages=13430),
    "Y3_taxable_income_17000": mod(load(S33), wages=25430),
    "Z_vagi_at_threshold_11950": mod(load(S33), wages=10950),
    "Z2_mfj_vagi_at_threshold_23900": mod(load(MFJ), wages=22401),
    "AA_afagi_50000_age_65": mod(load(S33), wages=49000, dob="1955-05-05"),
    "AB_afagi_62000_age_65": mod(load(S33), wages=61000, dob="1955-05-05"),
    "AC_mfj_afagi_75000_age_65": mod(load(MFJ), wages=43501, dob="1955-05-05"),
    "AG_basic_pay_15000": mod(load(S33), basic_pay=15000),
    "AH_basic_pay_30000": mod(load(S33), basic_pay=30000),
    "AI_savers_4000": mod(load(S33), savers=4000),
    "AJ_savers_5000_born_1954_12_31": mod(load(S33), savers=5000, dob="1954-12-31"),
    "AK_born_1960_01_01_age_65": mod(load(S33), dob="1960-01-01"),
    "AL_born_1939_01_01_full_age_deduction": mod(load(S33), wages=90000, dob="1939-01-01"),
    # the spouse's items on a joint return
    "AD_mfj_spouse_65_afagi_80000": mod(load(MFJ), wages=48501, spouse_dob="1955-05-05"),
    "AE_mfj_both_65_phased": mod(load(MFJ), wages=48501, dob="1955-05-05", spouse_dob="1956-06-06"),
    "AF_mfj_dependent_both_born_before_1939": mod(load("mfj_1dep_1nondep.json")),
    "AQ_mfj_spouse_blind": mod(load(MFJ), spouse_blind=True),
    "AM_blind_and_65": mod(load(S33), dob="1955-05-05", blind=True),
    # the federal forms Virginia reads
    "AN_w2_without_virginia_in_box_15": mod(load(S33), extra_w2=dict(wages=5000, withheld=100, state=None)),
    "AO_unemployment_1099g": mod(load("single_45k.json")),
    "AP_military_benefits_capped_by_1099r": mod(load("1099_r_optional_state_local_tax_group.json"), retirement=40000),
}
# the four demo households, from the manifest (website-static/data/virginia-demos.json)
for demo in json.load(open(PORT / "src/main/resources/direct-file/website-static/data/virginia-demos.json"))["demos"]:
    cases[demo["case"]] = load(demo["file"] + ".json")
RECORDS = {k: v for k, v in json.load(open(PORT / "src/main/resources/direct-file/website-static/data/virginia-records.json")).items() if not k.startswith("_")}
def money(f, k, default=0): return float(f[k]["item"]) if k in f else default
meta = {}
for name, d in cases.items():
    f = facts(d); pid, others = filer_ids(f)
    status = f["/filingStatus"]["item"]["value"]; state = f["/filerResidenceAndIncomeState"]["item"]["value"]
    spouse = None
    if status == "marriedFilingJointly" and others and f"/filers/#{others[0]}/dateOfBirth" in f:
        spouse = dict(dob=f[f"/filers/#{others[0]}/dateOfBirth"]["item"]["date"], blind=bool(f.get(f"/filers/#{others[0]}/isBlind", {}).get("item")))
    meta[name] = dict(
        status=status, state=state,
        dob=f[f"/filers/#{pid}/dateOfBirth"]["item"]["date"], blind=bool(f[f"/filers/#{pid}/isBlind"]["item"]),
        claimable=bool(f[f"/filers/#{pid}/canBeClaimed"]["item"]), spouse=spouse,
        wages=sum(money(f, f"/formW2s/#{w}/writableWages") for w in w2_ids(f)),
        # isClaimedDependent is derived, so most scenarios store only the filer's tpClaims answer
        deps=sum(1 for k in f if k.startswith("/familyAndHousehold/#") and k.endswith("/tpClaims") and f.get(k.replace("tpClaims", "isClaimedDependent"), f[k])["item"]),
        # box 17, and box 15 as the state receives it in the MeF W-2: the residence state's code when box 15 is filled in
        w2s=[dict(withheld=money(f, f"/formW2s/#{w}/writableStateWithholding"), state=state.upper() if f"/formW2s/#{w}/writableState" in f else None) for w in w2_ids(f)],
        unemployment=[dict(amount=money(f, f"/form1099Gs/#{g}/amount"), repaid=money(f, f"/form1099Gs/#{g}/writableAmountPaidBackForBenefitsInTaxYear")) for g in f.get("/form1099Gs", {"item": {"items": []}})["item"]["items"]],
        retirement1099R=sum(round(money(f, f"/form1099Rs/#{r}/writableTaxableAmount")) for r in f.get("/form1099Rs", {"item": {"items": []}})["item"]["items"]),
        locality=(f.get("/vaLocality") or {}).get("item", {}).get("value"),
        savers=money(f, "/vaCommonwealthSaversContributions") if f.get("/vaHasCommonwealthSaversContributions", {}).get("item") else 0,
        untaxed=money(f, "/vaUntaxedPurchases") if f.get("/vaHasUntaxedPurchases", {}).get("item") else 0,
        estimated=money(f, "/vaEstimatedPayments"), prior=money(f, "/vaPriorYearOverpaymentApplied"), extension=money(f, "/vaExtensionPayments"),
        basicPay=money(f, "/vaMilitaryBasicPay") if f.get("/vaHasMilitaryIncome", {}).get("item") and f.get("/vaHasMilitaryBasicPay", {}).get("item") else None,
        retirement=money(f, "/vaMilitaryRetirementIncome") if f.get("/vaHasMilitaryIncome", {}).get("item") and f.get("/vaHasMilitaryRetirement", {}).get("item") else 0)
    # what the records stand-in (website-static/data/virginia-records.json) will fill in on the page
    last = [v["item"] for k, v in f.items() if k.startswith("/filers/#") and k.endswith("/lastName")]
    rec = RECORDS.get(f"{last[0] if last else ''}|{meta[name]['dob']}")
    if rec:
        meta[name]["estimated"] = float(rec.get("estimatedPayments", 0)); meta[name]["prior"] = float(rec.get("priorYearOverpaymentApplied", 0)); meta[name]["extension"] = float(rec.get("extensionPayments", 0))
    for where in (OUT, TEST_RES):
        json.dump(d, open(where / f"{name}.json", "w"))
for where in (OUT, TEST_RES):
    for stale in where.glob("*.json"):
        if stale.stem != "meta" and stale.stem not in cases: stale.unlink()
    json.dump(meta, open(where / "meta.json", "w"), indent=1)
print(f"{len(cases)} cases written to {OUT} and {TEST_RES}")
