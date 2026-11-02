// An independent model of the Virginia resident return, tax year 2024, written from the Code of
// Virginia and the 2024 Form 760 instructions rather than from facts/virginia.xml, so that the two
// can disagree. scripts/virginia-cases.cjs runs it against the engine; the workbench's seed examples
// were checked against it too.
//
// Sources: Va. Code §§ 58.1-320 (rate schedule), 58.1-321 (filing threshold), 58.1-322.02(3) Social
// Security, (15) military basic pay, (18) military benefits, and the unemployment benefits
// subtraction (Schedule ADJ code 37); 58.1-322.03(1)(b) standard deduction, (2) exemptions, (5) age
// deduction, (7) Commonwealth Savers; 58.1-339.8 the low-income credits; the Line 33 use tax rates.
//
// model(inputs) -> lines. `inputs` is a plain object:
//   status        federal filing status: 'single' | 'marriedFilingJointly' | 'marriedFilingSeparately'
//                 | 'headOfHousehold' | 'qualifiedSurvivingSpouse'
//   agi           federal adjusted gross income (Form 1040 line 11)
//   ss            taxable Social Security benefits in AGI (line 6b)
//   fedEitc       federal earned income credit (line 27)
//   wages         W-2 box 1 total for the household
//   dob           primary filer's date of birth, 'YYYY-MM-DD'
//   blind         primary filer blind for federal purposes
//   claimable     primary filer can be claimed as someone else's dependent
//   spouse        null, or { dob, blind } for the spouse on a joint return
//   deps          number of dependents claimed
//   w2s           [{ withheld, state }]: box 17 and the box 15 state code ('VA', another code, or null)
//   unemployment  [{ amount, repaid }]: each 1099-G's box 1 and what was repaid in the same year
//   retirement1099R  sum of box 2a over the household's 1099-Rs
//   basicPay      null when not on extended active duty, else military basic pay received
//   retirement    military retirement and survivor benefits received (0 when none)
//   savers        Commonwealth Savers contributions
//   untaxed       purchases with no Virginia sales tax paid
//   locality      the /vaLocalityOptions value lived in on January 1, or null
//   estimated, prior, extension   Form 760 Lines 20, 21, 22
//
// `lines` names Form 760 lines: ageDed (4), adj (7), subtractions (8), vagi (9), below (the Line 9
// threshold notice), std (11), ex (12), savers (13), deductions (14), ti (15), tax (16), credit (23),
// withheld (19a), useTax (33), owe (27), overpayment (28), amountOwed (35), refund (36), and claims
// (the return claims a low-income credit).

const RATE6 = ['alexandria-city', 'fairfax-city', 'falls-church-city', 'manassas-city', 'manassas-park-city', 'arlington-county', 'fairfax-county', 'loudoun-county', 'prince-william-county', 'chesapeake-city', 'franklin-city', 'hampton-city', 'newport-news-city', 'norfolk-city', 'poquoson-city', 'portsmouth-city', 'suffolk-city', 'virginia-beach-city', 'isle-of-wight-county', 'southampton-county', 'charles-city-county', 'henrico-county', 'chesterfield-county', 'new-kent-county', 'goochland-county', 'powhatan-county', 'hanover-county', 'richmond-city'];
const RATE63 = ['danville-city', 'henry-county', 'charlotte-county', 'northampton-county', 'gloucester-county', 'patrick-county', 'halifax-county', 'pittsylvania-county'];
const RATE7 = ['james-city-county', 'york-county', 'williamsburg-city'];
function useTaxRate (loc) { return RATE7.includes(loc) ? 0.07 : RATE63.includes(loc) ? 0.063 : RATE6.includes(loc) ? 0.06 : 0.053; }

// § 58.1-320, as the cumulative schedule the instructions print; rounded to the dollar.
const tax760 = ti => Math.round(ti <= 3000 ? 0.02 * ti : ti <= 5000 ? 60 + 0.03 * (ti - 3000) : ti <= 17000 ? 120 + 0.05 * (ti - 5000) : 720 + 0.0575 * (ti - 17000));

const day = s => new Date(s + 'T00:00:00Z');
const AGE65_CUTOFF = day('1960-01-01');   // 65 on or before January 1, 2025 (Pub 554's rule, which Form 760 Section B follows)
const FULL_AGE_DEDUCTION_CUTOFF = day('1939-01-01'); // § 58.1-322.03(5)(a)
const AGE70_CUTOFF = day('1954-12-31');   // attained 70 during 2024, § 58.1-322.03(7)(b)

// § 58.1-322.03(5): one person's age deduction. `excess` is the return's AFAGI over its threshold.
function ageDeductionFor (dob, excess) {
  if (!dob) return 0;
  const d = day(dob);
  if (d <= FULL_AGE_DEDUCTION_CUTOFF) return 12000;
  if (d <= AGE65_CUTOFF) return Math.max(0, 12000 - excess);
  return 0;
}

function model (m) {
  const mfj = m.status === 'marriedFilingJointly';
  const spouse = mfj && m.spouse ? m.spouse : null;
  const age65 = day(m.dob) <= AGE65_CUTOFF; const age70 = day(m.dob) <= AGE70_CUTOFF;
  const spouse65 = spouse ? day(spouse.dob) <= AGE65_CUTOFF : false;

  // Line 4: each spouse's $12,000, reduced by the same excess of the joint AFAGI over $75,000
  // ($50,000 single). The Code's text, read per individual; see /vaSpouseAgeDeductionAllowed.
  const afagi = m.agi - m.ss; const excess = Math.max(0, afagi - (mfj ? 75000 : 50000));
  const ageAllowed = ageDeductionFor(m.dob, excess) + (spouse ? ageDeductionFor(spouse.dob, excess) : 0);

  // Line 7: unemployment benefits in AGI (code 37), basic pay (code 38), military benefits (code 60)
  const unemployment = Math.round((m.unemployment || []).reduce((s, g) => s + (g.amount || 0) - (g.repaid || 0), 0));
  const basicAllowed = m.basicPay == null ? 0 : Math.min(m.wages, m.basicPay <= 15000 ? m.basicPay : Math.max(0, 30000 - m.basicPay));
  const benefits = Math.min(m.retirement || 0, 30000, m.retirement1099R || 0);

  const threshold = mfj ? 23900 : 11950;
  let std = mfj ? 17000 : 8500; if (m.claimable) std = Math.min(std, m.wages);
  const n = 1 + (mfj ? 1 : 0) + (m.deps || 0); const exA = 930 * n;
  const exB = 800 * ((age65 ? 1 : 0) + (m.blind ? 1 : 0) + (spouse65 ? 1 : 0) + (spouse && spouse.blind ? 1 : 0));
  const savers = m.savers ? (age70 ? m.savers : Math.min(4000, m.savers)) : 0;

  // The two ways to file (§ 58.1-339.8(D)): keep the age deduction, Section B exemptions and basic
  // pay, or give them up, for the filer and the spouse alike, for a credit.
  const eitherWay = m.ss + unemployment + benefits;
  const vagiKeep = m.agi - eitherWay - ageAllowed - basicAllowed; const vagiCredit = m.agi - eitherWay;
  const taxKeep = vagiKeep < threshold ? 0 : tax760(Math.max(0, vagiKeep - std - exA - exB - savers));
  const taxCredit = vagiCredit < threshold ? 0 : tax760(Math.max(0, vagiCredit - std - exA - savers));
  const eitc = m.claimable ? 0 : (m.fedEitc || 0);
  const cli = !m.claimable && vagiCredit <= 15060 + 5380 * (n - 1) ? 300 * n : 0;
  const best = Math.max(Math.min(Math.max(cli, Math.round(0.20 * eitc)), taxCredit), Math.round(0.15 * eitc));
  const claims = best > 0 && taxCredit - best < taxKeep;

  const ageDed = claims ? 0 : ageAllowed; const vagi = claims ? vagiCredit : vagiKeep; const below = vagi < threshold;
  const ex = claims ? exA : exA + exB; const deductions = std + ex + savers;
  const ti = Math.max(0, vagi - deductions); const tax = claims ? taxCredit : taxKeep;
  const credit = claims ? best : 0; const adj = unemployment + benefits + (claims ? 0 : basicAllowed);
  const subtractions = ageDed + m.ss + adj;

  // Line 19a: box 17 of the W-2s whose box 15 is Virginia
  const withheld = (m.w2s || []).reduce((s, w) => s + (w.state === 'VA' ? (w.withheld || 0) : 0), 0);
  const payments = withheld + (m.estimated || 0) + (m.prior || 0) + (m.extension || 0) + credit;
  const owe = Math.max(0, tax - payments); const overpayment = Math.max(0, payments - tax);
  const useTax = m.untaxed ? Math.round(m.untaxed * useTaxRate(m.locality)) : 0;
  const amountOwed = Math.max(0, owe + useTax - overpayment); const refund = Math.max(0, overpayment - useTax);
  return { ageDed, adj, subtractions, vagi, below, std, ex, savers, deductions, ti, tax, credit, withheld, useTax, owe, overpayment, amountOwed, refund, claims };
}

module.exports = { model, useTaxRate, tax760 };
