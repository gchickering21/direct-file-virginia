# Policy map: Virginia Form 760 lines → law → facts → screens → checks

Written for a Virginia policy analyst or engineer. One row per rule the prototype
implements. Tax year 2024. Fact paths are in
`form-builder-examples/direct-file/src/main/resources/direct-file/facts/virginia.xml`;
the Virginia screens are in `flow/virginia.xml` beside it. "Federal facts read" names what
the rule consumes from the federal return, and how the federal return exports it to a
state: **MeF** (in the Form 1040 XML) or **state systems** (the state API's enriched JSON).

| Form 760 line | Rule | Law | Fact(s) | Federal facts read | Hand check |
|---|---|---|---|---|---|
| Gate | Resident of Virginia for the whole year | Form 760 is the resident return; 760PY and 763 are out of scope | `/vaIsResident` | `/filerResidenceAndIncomeState` (gate only; a state knows its residents) | both households |
| Filing status | Federal joint return → Filing Status 2; single and head of household → Status 1; married filing separately → Status 3 | 2024 Form 760 instructions, Filing Status | `/vaIsFilingStatus2` | `/filingStatus` (MeF) | both: Status 1 |
| 1, 3 | Federal adjusted gross income; additions out of scope | Va. Code § 58.1-322 | `/vaFederalAdjustedGrossIncome` | `/agi` (MeF, 1040 line 11) | $34,333; $57,000 |
| 4 | Age deduction | § 58.1-322.03(5)(a), (b); instructions Line 4 and the Age Deduction Worksheet | `/vaAgeDeduction`, `/vaPrimaryFilerBornOnOrBefore1939`, `/vaPrimaryFilerQualifiesForIncomeBasedAgeDeduction`, `/vaAgeDeductionIncomeThreshold`, `/vaAgeDeductionReduction`, `/vaAdjustedFederalAdjustedGrossIncome` | `/primaryFiler/dateOfBirth` (MeF, state systems), `/primaryFiler/age65OrOlder` (MeF), `/agi`, `/taxableSocialSecurityBenefits` (MeF) | $0 (born 1997); $5,000 (born 1955, AFAGI $57,000 − $50,000 = $7,000 reduction) |
| 5 | Taxable Social Security subtracted | § 58.1-322.02(3) | `/vaTaxableSocialSecurityBenefits` | `/taxableSocialSecurityBenefits` (MeF, 1040 line 6b) | $0; $0 |
| 6, 7 | State refund and other subtractions | § 58.1-322.02(5) and the rest | not implemented, taken as $0 | | |
| 8, 9 | Total subtractions; Virginia AGI | § 58.1-322 | `/vaTotalSubtractions`, `/vaAdjustedGrossIncome` | | $34,333; $52,000 |
| 9 note | No tax below the filing threshold | § 58.1-321(A): $11,950 single, $23,900 married | `/vaFilingThreshold`, `/vaIsBelowFilingThreshold` | `/filingStatus` | not below; not below |
| 10 | Itemized deductions | § 58.1-322.03(1)(a) | not implemented (federal itemizers out of scope) | | |
| 11 | Standard deduction, $8,500 single / $17,000 married; limited to earned income if claimable as a dependent | § 58.1-322.03(1)(b); instructions Line 11 | `/vaStandardDeduction`, `/vaStandardDeductionForFilingStatus` | `/filingStatus`, `/primaryFiler/canBeClaimed` (MeF), `/wages` (MeF) | $8,500; $8,500 |
| 12 | Exemptions: $930 each for self, spouse, dependents; $800 each for 65-or-older and blind | § 58.1-322.03(2)(a), (b); instructions Exemptions A and B | `/vaExemptions`, `/vaPersonalExemptionCount`, `/vaAgedOrBlindExemptionCount` | `/filingStatus`, the dependents' `isClaimedDependent` (state systems), `/primaryFiler/age65OrOlder`, `/primaryFiler/isBlind` (MeF) | $930; $1,730 |
| 13 | Schedule ADJ deductions | § 58.1-322.03(3) onward | not implemented, $0 | | |
| 14, 15 | Total deductions; Virginia taxable income | | `/vaTotalDeductions`, `/vaTaxableIncome` | | $24,903; $41,770 |
| 16 | Tax: 2% to $3,000; 3% to $5,000; 5% to $17,000; 5.75% above | § 58.1-320 | `/vaTaxFromRateSchedule`, `/vaTax` | | **$1,174**; **$2,144** |
| 17 on | Credits, withholding, payments, refund or amount due | | not implemented | | |

## The two hand checks

**Household 1**, the IRS's saved scenario "Single 33k No Credits" loaded with the residence
answer changed to Virginia: single, born 1997-10-03, wages $33,333, federal AGI $34,333.
Line 9 $34,333 → Line 11 $8,500 → Line 12 $930 → Line 15 $24,903 → Line 16: $720 +
5.75% × ($24,903 − $17,000) = $720 + $454.42 = $1,174.42, rounded **$1,174**.

**Household 2**, the same scenario with the birth date 1955-05-05 and wages $56,000:
federal AGI $57,000; 65 or older; AFAGI $57,000, $7,000 over the $50,000 threshold, so
the age deduction is $12,000 − $7,000 = $5,000; Line 9 $52,000; Line 11 $8,500; Line 12
$930 + $800 = $1,730; Line 15 $41,770; Line 16: $720 + 5.75% × $24,770 = $2,144.28,
rounded **$2,144**.

The engine gives exactly these values on the Virginia summary page (recorded in
`report/NOTES.md`, 2026-10-19).

## What is deliberately not here

Itemized deductions and Virginia Schedule A; every Schedule ADJ addition, subtraction and
deduction other than Social Security and the age deduction; every credit, including the
Credit for Low-Income Individuals and the Virginia EITC, whose interaction with the age
deduction the instructions describe; a spouse's age deduction and exemptions; part-year
and nonresident returns; withholding, payments and the amount due; Spanish wording beyond
what the port generates; and anything to do with identity or submission.
