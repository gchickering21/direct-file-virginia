# Sources

Citation style: APA 7. Every figure in the build and the report traces to a row here.
"Verified" means read in the primary source on the date given, not taken from a summary.

## Virginia tax law (primary)

| What | Source | Figure / text | Verified |
|---|---|---|---|
| Rate schedule | Va. Code § 58.1-320, https://law.lis.virginia.gov/vacode/title58.1/chapter3/section58.1-320/ | 2% on income not exceeding $3,000; 3% over $3,000 to $5,000; 5% over $5,000 to $17,000; 5.75% over $17,000 (taxable years from 1990 on). History ends 1987, c. 9. | 2026-10-19 (web) |
| Standard deduction, TY2024 | Va. Code § 58.1-322.03(1)(b), https://law.lis.virginia.gov/vacode/title58.1/chapter3/section58.1-322.03/ | $8,500 single, $17,000 married (taxable years beginning 2024-01-01 to before 2025-01-01); married filing separately one-half; $8,750 / $17,500 for 2025–2026; reverts to $3,000 / $6,000 from 2030. Only if not itemizing federally. | 2026-10-19 (web) |
| Personal exemption | Va. Code § 58.1-322.03(2)(a) | $930 per federal personal exemption | 2026-10-19 (web) |
| Aged / blind exemption | Va. Code § 58.1-322.03(2)(b) | additional $800 for taxpayers aged or blind per IRC § 63(f) | 2026-10-19 (web) |
| Age deduction | Va. Code § 58.1-322.03(5) | $12,000 if born on or before 1939-01-01 (5.a); $12,000 if born after that date and aged 65, reduced $1 for each $1 of adjusted federal AGI over $50,000 single / $75,000 married (5.b); "adjusted federal AGI" = federal AGI minus Title II Social Security and § 86 benefits | 2026-10-19 (web) |
| Social Security subtraction | Va. Code § 58.1-322.02(3), https://law.lis.virginia.gov/vacode/title58.1/chapter3/section58.1-322.02/ | Title II benefits and other benefits taxable solely under IRC § 86 | 2026-10-19 (web) |
| Virginia Lottery subtraction | Va. Code § 58.1-322.02(7) | "Any amount included therein less than $600 from a prize awarded by the Virginia Lottery." | 2026-10-19 (web) |
| State refund subtraction | Va. Code § 58.1-322.02(5) | refunds or credits of income taxes from the Commonwealth or any other taxing jurisdiction | 2026-10-19 (web) |
| Form 760 and instructions, TY2024 | Virginia Department of Taxation, 2024 Form 760 Resident Individual Income Tax Instructions, https://www.tax.virginia.gov/sites/default/files/vatax-pdf/2024-760-instructions.pdf; the form: https://www.tax.virginia.gov/sites/default/files/taxforms/individual-income-tax/2024/760-2024.pdf | line numbers and the worksheet for each rule above; pages with the figures: 5, 7, 15–17, 41 | PDFs saved 2026-10-19; line map pending |

Note: a third-party guide gives $8,750 / $17,500 for 2024. That is the 2025 figure; the Code
and the 2024 instructions agree on $8,500 / $17,000 for 2024.

## Form 760 (TY2024) line map, from the instructions (pages 15–17)

| Line | What | Our rule |
|---|---|---|
| 1 | Federal adjusted gross income | read from the federal graph (`/agi`, exported) |
| 2 | Additions (Schedule ADJ) | out of scope: 0 |
| 3 | Line 1 + Line 2 | derived |
| 4 | Age deduction | § 58.1-322.03(5): born on or before 1939-01-01 → $12,000; born 1939-01-02 to 1960-01-01 → $12,000 reduced $1 per $1 of AFAGI over $50,000 (single); AFAGI = FAGI − taxable Social Security | the Virginia-specific example rule |
| 5 | Taxable Social Security / Tier 1 benefits | § 58.1-322.02(3); our household has none: 0 |
| 6 | State income tax refund included federally | § 58.1-322.02(5); 0 |
| 7 | Other subtractions (Schedule ADJ) | out of scope: 0 |
| 8 | Lines 4 + 5 + 6 + 7 | derived |
| 9 | Virginia adjusted gross income = Line 3 − Line 8 | derived; if below the filing threshold (§ 58.1-321: $11,950 single, $23,900 married) the tax is $0 |
| 10 | Itemized deductions | out of scope (federal standard-deduction filers only) |
| 11 | Standard deduction | § 58.1-322.03(1)(b): $8,500 FS1 and FS3, $17,000 FS2; limited to earned income if claimable as a dependent |
| 12 | Exemptions | § 58.1-322.03(2): $930 × exemptions + $800 × (65-or-older + blind); 65 or older means age 65 on or before 2025-01-01 |
| 13 | Deductions (Schedule ADJ) | out of scope: 0 |
| 14 | Lines 10 + 11 + 12 + 13 | derived |
| 15 | Virginia taxable income = Line 9 − Line 14 | derived |
| 16 | Tax from the rate schedule | § 58.1-320 |

## Direct File and the IRS ecosystem (primary)

| What | Source |
|---|---|
| Direct File source, archived | IRS-Public/direct-file, commit e365f9f (2026-06-11), README "This repository has been archived and is no longer maintained" |
| Fact Graph 3.1 | IRS-Public/fact-graph; `docs/fact-graph-3.1-adr.md` (created 2025-06-05, published 2025-08-15, author @petrosgov); `docs/fact-dictionary-specification-3.1.md` |
| TWE 2.0 | IRS-Public/tax-withholding-estimator, README: live 2026-02-27; `docs/adr/001-twe-architecture.md` (2025-08-27) |
| EITC Assistant | IRS-Public/eitc-assistant, README: live 2026-04-29, releases from v26.1.1 on the Fact Graph |
| Form Builder, template, examples, Taxpert | IRS-Public/form-builder, form-builder-template, form-builder-examples, taxpert; `taxpert/docs/adr/taxpert-form-builder-fact-graph.md`, `taxpert/docs/release-status.md`, `taxpert/docs/why-taxpert.md` (August 2026) |
| The port of Direct File | form-builder-examples/direct-file/README.md and `docs/FLOW_TRANSPILATION.md` |
| Legal authority cited by every IRS repository | Source Code Harmonization And Reuse in Information Technology (SHARE IT) Act of 2024, Pub. L. 118-187; OMB M-16-21 (2016) |
| Federal → state export set | the 57 facts carrying `<Export stateSystems="true"/>` in the Direct File fact dictionary |

## Still to pull from primary sources (held from memory until then)

- Treasury / IRS 2024 pilot after-action report: filer count and satisfaction figures.
- TIGTA 2025 audit: registrations, non-submission rate, eligible population.
- GAO decision on the suspension and the Congressional Review Act.
- IRA § 10301 text; the 2019 Free File MOU amendment.
- The 25 states in 2025 and which used Code for America's tool.
- Virginia's own free-file history.
