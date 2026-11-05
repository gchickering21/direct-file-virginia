# Every field on the 2024 Virginia Form 760, and where it would come from

Read from the form itself (Virginia Department of Taxation, Form 760, Rev. 11/24, two
pages) and its instructions. The point of the table is the **Source** column: for a
prepopulated state return, each field is one of five kinds.

| Code | Source | Who supplies it today | In a prepopulated return |
|---|---|---|---|
| **F** | the federal return | the taxpayer, by copying from the 1040 | filled in from the federal export (MeF XML or the state-systems facts) |
| **W** | an information return the taxpayer holds | the taxpayer, by copying boxes | filled in from the W-2 or 1099 already on the federal return; corrected only as a whole document |
| **V** | Virginia Tax's own records | the taxpayer, from memory or last year's paperwork | filled in by the state, which already holds it |
| **Q** | only the taxpayer knows | the taxpayer | asked, and signed for |
| **D** | arithmetic on the lines above | the taxpayer, by hand | computed by the engine, never editable |

Prototype status: **built** means the rule is in one of the `facts/virginia*.xml` modules; **mockup** means it
is in the walkthrough mockup only; **gap** means neither.

## Page 1: who is filing

| Field | Source | Notes | Status |
|---|---|---|---|
| Your name, M.I., last name, suffix; spouse's | F | `/primaryFiler/firstName` etc., exported | built (gate), shown in mockup |
| Social Security numbers, you and spouse | F | exported to MeF and state systems | not displayed (prototype hides TINs) |
| First four letters of last name | D | from the name | gap |
| Street, city, state, ZIP; "address changed" oval | F | `/address`, exported | mockup only |
| **Locality code** | Q, confirmed | Virginia's 3-digit code; the address alone cannot settle it (a ZIP can span localities; the date is January 1) | built: `virginiaLocalities.xml`, asked |
| Birth dates, you and spouse | F | `/filers/*/dateOfBirth`, exported to state systems | built |
| Deceased ovals; dates | F | Form 1040 carries a date of death | gap |
| **Virginia driver's license number, issue date, customer ID** | V or Q | optional identity check; Virginia DMV already holds it | gap; a state could prefill from DMV with consent |
| Filing status 1, 2, 3 | F | from `/filingStatus`; federal HoH files as Status 1 with the "federal head of household" oval | built |
| "Federal head of household?" oval | F | `/filingStatus` = headOfHousehold | gap (one fact) |
| Spouse's name and SSN for Status 3 | F | exported | gap |
| Ovals: name or status changed; not filed last year; dependent on another's return; farmer/fisherman/seaman; amended, reason code; overseas on due date; Schedule C filed; federal EIC claimed, amount | F mostly, V for "not filed last year" | "dependent on another's return" is `/primaryFiler/canBeClaimed` (built; it also bars the Line 23 credits); the federal EIC amount is read for Line 23 (`/vaFederalEarnedIncomeCredit`, built) though the oval itself is not drawn; Schedule C is on the 1040; "not filed last year" is Virginia's own record | mostly gap |
| Exemptions Section A: you, spouse, dependents × $930 | F | built from `/filingStatus` and the exported dependents (`/vaPersonalExemptionCount`) | built |
| Exemptions Section B: 65 or over, blind, you and spouse × $800 | F | four boxes: `/filers/*/age65OrOlder` and `/filers/*/isBlind` for the primary filer and, on a joint return, for the spouse, found by the exported `isPrimaryFiler` flag (`/vaSpouse`); given up when a low-income credit is claimed | built, both filers |
| DMAS / VDSS / Health Benefit Exchange data-sharing consent | Q | a yes/no only the filer can give | gap; a pure Virginia-only question |

## Page 1: income to taxable income

| Line | Field | Source | Notes | Status |
|---|---|---|---|---|
| 1 | Federal adjusted gross income | F | `/agi` | built |
| 2 | Additions, Schedule ADJ line 3 | Q and F | interest on other states' bonds, certain federal deductions added back | gap |
| 3 | Lines 1 + 2 | D | | built (as Line 1) |
| 4 | Age deduction | D from F | date of birth, 65 or older, filing status, AFAGI; the primary filer's half (`/vaPrimaryFilerAgeDeductionAllowed`) plus the spouse's on a joint return (`/vaSpouseAgeDeductionAllowed`, each $12,000 reduced by the same joint excess over $75,000: an assumption the fact documents); $0 when a low-income credit is claimed instead | built, both filers |
| 5 | Taxable Social Security and Tier 1 Railroad | F | 1040 line 6b | built |
| 6 | State income tax refund reported as income | F | 1040 Schedule 1 line 1; Direct File has no fact for it | gap |
| 7 | Subtractions, Schedule ADJ line 7 | F and Q | unemployment benefits, code 37 (F: each 1099-G's box 1 less what was repaid, both exported; no question); military basic pay, code 38 (Q, behind one gate question, capped at the exported W-2 wages); military retirement and survivor benefits, code 60 (Q, capped at the exported 1099-R taxable total). The lottery subtraction is deliberately absent: no prize is ever in Direct File's AGI (see `POLICY_MAP.md`). Disability income, the National Guard and government-employee subtractions, others: gap | built for codes 37, 38 and 60; rest gap |
| 8 | Lines 4 + 5 + 6 + 7 | D | computed with and without the items a low-income credit replaces; the claimed way is selected | built |
| 9 | Virginia AGI; the $11,950 / $23,900 threshold | D | | built |
| 10 | Itemized deductions, Virginia Schedule A | F, then Q | federal itemizers must itemize in Virginia, starting from federal Schedule A | gap, out of scope |
| 11 | Standard deduction | D from F | $8,500 / $17,000; limited for a claimable dependent | built |
| 12 | Exemptions | D from F | Section A plus Section B's four boxes (`/vaAgedOrBlindExemptionCount`), or Section A alone when a low-income credit is claimed | built, both filers |
| 13 | Deductions, Schedule ADJ line 9 | Q | Commonwealth Savers contributions (built, capped, age-70 rule), child and dependent care, teacher expenses, others | built for 529; rest gap |
| 14 | Lines 10 + 11 + 12 + 13 | D | | built |
| 15 | Virginia taxable income | D | | built |

## Page 2: tax, payments, the result

| Line | Field | Source | Notes | Status |
|---|---|---|---|---|
| 16 | Tax from the rate schedule | D | § 58.1-320 | built |
| 17 | Spouse tax adjustment, Status 2 only | D from F | needs each spouse's share of VAGI, which the federal return carries per filer | gap |
| 18 | Net tax | D | | gap (trivial) |
| 19a, 19b | **Virginia income tax withheld**, you and spouse | W | W-2 box 17, counted only where box 15 names Virginia: the federal return exports each W-2's MeF state code (`/formW2s/*/xmlStateCd`), so `/formW2s/*/vaWithholding` is box 17 or $0 per W-2 and `/vaWithholding` the sum; 1099 and W-2G state withholding are not read. 19b cannot be split out: which filer a W-2 belongs to is not exported; a state would match the W-2's employee TIN | built (19a, both filers' W-2s folded in; 19b gap) |
| 20 | **Estimated payments made for 2024** | V | Virginia Tax received them | built: filled from a records stand-in (`website-static/data/virginia-records.json`, keyed by last name and date of birth) on any Virginia screen; still correctable; the clearest "state already knows" line. The ScalaTest pins the demos before these payments, since the stand-in runs on the page |
| 21 | **Last year's overpayment applied** | V | Virginia Tax's own record | built: from the records stand-in |
| 22 | **Extension payments** | V | same | built: from the records stand-in |
| 23 | Low-income credit or Virginia EIC, Schedule ADJ | D from F | the three credits from family VAGI, the exemption count and the exported federal EIC (`/vaCreditForLowIncomeIndividuals`, `/vaEarnedIncomeCredit`, `/vaRefundableEarnedIncomeCredit`); the § 58.1-339.8(D) bar; the election computed both ways (`/vaClaimsLowIncomeCredit`), the summary naming what the credit replaced | built; nothing asked |
| 24 | Credit for tax paid to another state, Schedule OSC | Q | needs the other state's return | gap |
| 25 | Credits, Schedule CR | Q | | gap |
| 26 | Lines 19a to 25 | D | | built |
| 27 / 28 | Tax you owe / overpayment | D | | built |
| 29 | Overpayment to apply to next year | Q | a choice | gap |
| 30 | Commonwealth Savers (529 and ABLE) contributions, Schedule VAC | Q | a voluntary contribution of the refund, distinct from the Line 13 deduction | gap |
| 31 | Other voluntary contributions, Schedule VAC | Q | | gap |
| 32 | Addition to tax, penalty, interest | D and V | underpayment computed from Lines 20–21 and the federal AGI; Virginia knows the payment dates | gap |
| 33 | **Consumer's use tax** on untaxed purchases; "none due" oval | Q | only the filer knows; the rate comes from the locality | built; the question every filer must answer |
| 34, 35, 36 | Totals, amount you owe, your refund | D | | built (34 is the use tax alone) |
| Direct deposit: routing, account, checking/savings | F or Q | the federal return's refund account can be offered; the filer may want a different one | gap |
| Signatures, date, phones; preparer; ID theft PIN; 1099-G election; discuss-with-preparer consent | Q and V | the declaration under penalty of law is the filer's; the ID theft PIN is issued by Virginia | mockup (declaration) |

## What the inventory says

1. **Four lines come from Virginia's own records**, 20, 21, 22 and the penalty computation on
   32, plus the identity fields a DMV holds. A state-run filer prepopulates those itself,
   which the federal service never could. That is the state's version of "the government
   already knows".
2. **The W-2 matters to Virginia for exactly two boxes**, 16 and 17 (state wages and state
   withholding), and the employer files the same W-2 with Virginia. A correction is to the
   document, and Virginia can compare.
3. **The questions only the filer can answer** are few and specific: locality code (confirm,
   proposed from the ZIP), Schedule ADJ items (military basic pay and benefits, 529
   contributions, the other subtractions and deductions), consumer's use tax, the DMAS
   data-sharing consent, voluntary contributions, what to do with an overpayment, and the
   declaration. Everything else is federal, from a document, Virginia's own, or arithmetic:
   the unemployment subtraction and the three low-income credits are computed without a
   question.
4. **Consumer's use tax (Line 33) is the one question every Virginian must answer** and has
   no source anywhere; a prepopulated return still has to ask it.

## Local taxes: what a Virginia filer actually meets

**Virginia has no local income tax.** Its cities and counties cannot levy one; the Tax
Foundation's census of local income taxes (17 states, led by Maryland, Ohio and
Pennsylvania) does not include Virginia. Local revenue comes from real estate and
personal property taxes, the 1% local share of the sales tax, and business license
taxes, none of which appear on an income return. So a Virginia state return has no
local income tax line, unlike Maryland's, and a state filer built on the federal return
needs no county rate schedule for income.

Locality still enters the return in exactly two places, both already on Form 760:

| Where | What locality does | Source | Rule for a prepopulated return |
|---|---|---|---|
| **Locality code** (page 1 header) | the 3-digit code of the city or county where the filer lived on **January 1, 2025**, from the list in the instructions (page 45 on); used in part to allocate local school funding | the filer; derivable from the address but a ZIP can straddle localities and the date is the day after the tax year, not the year itself | derive from the address, show it, ask the filer to confirm |
| **Consumer's use tax** (Line 33) | the rate on untaxed purchases depends on where the filer lives | the filer's answer × the locality's rate | derive the rate from the locality; ask for the purchase total |

The use-tax rates for 2024, from the 2024 Form 760 instructions (page 20), which match
Virginia Tax's own rate table:

| Rate | Where | Why |
|---|---|---|
| **5.3%** | every other city and county | 4.3% state + 1% local |
| **6%** | Northern Virginia: Alexandria, Fairfax City, Falls Church, Manassas, Manassas Park; Arlington, Fairfax, Loudoun, Prince William counties. Hampton Roads: Chesapeake, Franklin, Hampton, Newport News, Norfolk, Poquoson, Portsmouth, Suffolk, Virginia Beach; Isle of Wight, Southampton counties. Central Virginia: Richmond City; Charles City, Chesterfield, Goochland, Hanover, Henrico, New Kent, Powhatan counties | + 0.7% regional transportation tax |
| **6.3%** | Danville; Charlotte, Gloucester, Halifax, Henry, Northampton, Patrick, Pittsylvania counties | + 1% additional local option tax |
| **7%** | Historic Triangle: Williamsburg; James City, York counties | Hampton Roads 6% + 1% Historic Triangle tax |
| 1% | food for home consumption and personal hygiene products, everywhere | state-exempt, local 1% only |

Riley lives in Richmond City, so the mockup's 6% is right. The instructions also offer a
lookup table for purchases under $1,000 and a worksheet above that.

**What this means for the state-level filer.** One small fact module, `virginiaLocalities.xml`:
the list of Virginia's 133 cities and counties with their 3-digit code and their use-tax
rate, `/vaLocalityCode` from the locality the filer confirms (proposed from the federal ZIP
by a Census ZCTA-to-county lookup when the ZIP lies in one locality), and `/vaUseTaxRate`.
Every locality is listed in exactly one rate tier and the switches have no default, so an
unlisted locality fails loudly rather than taking 5.3%. That is the whole of "local tax"
for an individual income return in Virginia. The regional lists change by act of the
General Assembly (Central Virginia's 0.7% began October 2020, the 6.3% localities were
added one by one), so the table carries a tax year like every other figure.

Not on the return, and not the state filer's job: real estate tax and the car tax
(personal property), both billed by the locality; the vehicle license fee; local meals and
lodging taxes; BPOL business licenses. A filer's "local taxes" question is answered by
pointing at those, not by adding lines to Form 760.
