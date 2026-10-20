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

Prototype status: **built** means the rule is in `facts/virginia.xml`; **mockup** means it
is in the walkthrough mockup only; **gap** means neither.

## Page 1: who is filing

| Field | Source | Notes | Status |
|---|---|---|---|
| Your name, M.I., last name, suffix; spouse's | F | `/primaryFiler/firstName` etc., exported | built (gate), shown in mockup |
| Social Security numbers, you and spouse | F | exported to MeF and state systems | not displayed (prototype hides TINs) |
| First four letters of last name | D | from the name | gap |
| Street, city, state, ZIP; "address changed" oval | F | `/address`, exported | mockup only |
| **Locality code** | D from address, or Q | Virginia's county/city code; derivable from the address, but a ZIP can span localities, so confirm | gap, and a good Virginia-only question |
| Birth dates, you and spouse | F | `/filers/*/dateOfBirth`, exported to state systems | built |
| Deceased ovals; dates | F | Form 1040 carries a date of death | gap |
| **Virginia driver's license number, issue date, customer ID** | V or Q | optional identity check; Virginia DMV already holds it | gap; a state could prefill from DMV with consent |
| Filing status 1, 2, 3 | F | from `/filingStatus`; federal HoH files as Status 1 with the "federal head of household" oval | built |
| "Federal head of household?" oval | F | `/filingStatus` = headOfHousehold | gap (one fact) |
| Spouse's name and SSN for Status 3 | F | exported | gap |
| Ovals: name or status changed; not filed last year; dependent on another's return; farmer/fisherman/seaman; amended, reason code; overseas on due date; Schedule C filed; federal EIC claimed, amount | F mostly, V for "not filed last year" | "dependent on another's return" is `/primaryFiler/canBeClaimed` (built); Schedule C and EIC amount are on the 1040; "not filed last year" is Virginia's own record | mostly gap |
| Exemptions Section A: you, spouse, dependents × $930 | F | built from `/filingStatus` and the exported dependents | built |
| Exemptions Section B: 65 or over, blind, you and spouse × $800 | F | `/filers/*/age65OrOlder`, `/filers/*/isBlind` | built for the primary filer; spouse gap |
| DMAS / VDSS / Health Benefit Exchange data-sharing consent | Q | a yes/no only the filer can give | gap; a pure Virginia-only question |

## Page 1: income to taxable income

| Line | Field | Source | Notes | Status |
|---|---|---|---|---|
| 1 | Federal adjusted gross income | F | `/agi` | built |
| 2 | Additions, Schedule ADJ line 3 | Q and F | interest on other states' bonds, certain federal deductions added back | gap |
| 3 | Lines 1 + 2 | D | | built (as Line 1) |
| 4 | Age deduction | D from F | date of birth, filing status, AFAGI | built |
| 5 | Taxable Social Security and Tier 1 Railroad | F | 1040 line 6b | built |
| 6 | State income tax refund reported as income | F | 1040 Schedule 1 line 1 | gap (one fact) |
| 7 | Subtractions, Schedule ADJ line 7 | Q, some F | lottery prizes under $600 (Q, mockup); disability income; military pay; others | mockup for the lottery; rest gap |
| 8 | Lines 4 + 5 + 6 + 7 | D | | built |
| 9 | Virginia AGI; the $11,950 / $23,900 threshold | D | | built |
| 10 | Itemized deductions, Virginia Schedule A | F, then Q | federal itemizers must itemize in Virginia, starting from federal Schedule A | gap, out of scope |
| 11 | Standard deduction | D from F | $8,500 / $17,000; limited for a claimable dependent | built |
| 12 | Exemptions | D from F | | built |
| 13 | Deductions, Schedule ADJ line 9 | Q | Virginia529 contributions (mockup), child and dependent care, teacher expenses, others | mockup for 529; rest gap |
| 14 | Lines 10 + 11 + 12 + 13 | D | | built |
| 15 | Virginia taxable income | D | | built |

## Page 2: tax, payments, the result

| Line | Field | Source | Notes | Status |
|---|---|---|---|---|
| 16 | Tax from the rate schedule | D | § 58.1-320 | built |
| 17 | Spouse tax adjustment, Status 2 only | D from F | needs each spouse's share of VAGI, which the federal return carries per filer | gap |
| 18 | Net tax | D | | gap (trivial) |
| 19a, 19b | **Virginia income tax withheld**, you and spouse | W | W-2 box 17, 1099 and W-2G state withholding; the employer also files these with Virginia | mockup (W-2 box 17) |
| 20 | **Estimated payments made for 2024** | V | Virginia Tax received them | gap; the clearest "state already knows" line |
| 21 | **Last year's overpayment applied** | V | Virginia Tax's own record | gap; same |
| 22 | **Extension payments** | V | same | gap; same |
| 23 | Low-income credit or Virginia EIC, Schedule ADJ | D from F and Q | needs family VAGI and federal EIC | gap, out of scope |
| 24 | Credit for tax paid to another state, Schedule OSC | Q | needs the other state's return | gap |
| 25 | Credits, Schedule CR | Q | | gap |
| 26 | Lines 19a to 25 | D | | gap (trivial) |
| 27 / 28 | Tax you owe / overpayment | D | | mockup ("you owe" line) |
| 29 | Overpayment to apply to next year | Q | a choice | gap |
| 30 | Commonwealth Savers (529 and ABLE) contributions, Schedule VAC | Q | a voluntary contribution of the refund, distinct from the Line 13 deduction | gap |
| 31 | Other voluntary contributions, Schedule VAC | Q | | gap |
| 32 | Addition to tax, penalty, interest | D and V | underpayment computed from Lines 20–21 and the federal AGI; Virginia knows the payment dates | gap |
| 33 | **Consumer's use tax** on untaxed purchases; "none due" oval | Q | only the filer knows | gap; a pure Virginia-only question every filer must answer |
| 34, 35, 36 | Totals, amount you owe, your refund | D | | mockup |
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
3. **The questions only the filer can answer** are few and specific: locality code (confirm),
   Schedule ADJ items (lottery prizes, 529 contributions, the other subtractions and
   deductions), consumer's use tax, the DMAS data-sharing consent, voluntary contributions,
   what to do with an overpayment, and the declaration. Everything else is federal, from a
   document, Virginia's own, or arithmetic.
4. **Consumer's use tax (Line 33) is the one question every Virginian must answer** and has
   no source anywhere; a prepopulated return still has to ask it.
