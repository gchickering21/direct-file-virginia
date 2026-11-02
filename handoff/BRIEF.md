# A Virginia state return on the IRS's published code

One page for the Office of the Chief Transformation Officer, Commonwealth of Virginia.
From a Georgetown graduate course project, fall 2026. Demonstration only; files nothing.

**The question.** Virginia has an income tax and no free state filing tool. The IRS built
Direct File, ran it in 25 states, published its code into the public domain, and suspended
it in 2025. It then kept the reusable part: the rules engine became a standalone library,
a presentation layer grew on it, two irs.gov tools were rebuilt on it in 2026, and the IRS
ported Direct File's whole interview onto that stack as a reference application. Could
Virginia build its own return on that?

**What we did.** Added a Virginia return to the IRS's port, as prototype rules rather than a
full form: Form 760 from Line 1 to Line 36 for a W-2 filer, single or joint, tax year 2024.
Two XML rule files and fourteen screens, in English and Spanish. Every rule cites its
section of Title 58.1 and its line of the instructions. Nothing in the IRS's engine or
libraries was changed. The change set is ordinary commits that apply to a fresh clone of
the IRS repository.

**What a resident sees.** Most of the return is already filled in: name, filing status,
date of birth and income from the federal return; wages and Virginia withholding from the
W-2s the employer also filed with Virginia (only those whose box 15 names Virginia count);
unemployment benefits subtracted, and the low-income credits claimed, with no question
asked; estimated and carried-over payments from the state's own records. The resident
corrects anything wrong, and sees exactly what the correction changed. Then four questions
nobody reports for them: the locality they lived in on January 1 (proposed from their ZIP
code), military service, Commonwealth Savers contributions, and untaxed purchases. Then
the return, signed under the usual declaration.

**What it proves.**

- The federal rules, engine and screens carry over untouched; Virginia is 176 facts beside
  the IRS's 3,030, and every tax-year figure sits in one block a policy analyst can read.
- Virginia reads only what the federal return already exports to states, enforced by a
  test, so the same module would be fed by the federal state API if it returned.
- Virginia has no local income tax; locality affects the return in exactly two places, the
  locality code and the use-tax rate, both built, with the locality looked up from the ZIP.
- The three low-income credits and the deductions they bar are weighed both ways, so the
  return claims whichever leaves the filer better off, without asking.
- Fifty households match an independent model of the rules line for line, and are pinned in
  a ScalaTest the port's own suite runs; an accessibility pass finds no violations.

**What it does not do.** Itemized deductions, the Schedule ADJ items beyond unemployment,
military pay and the Commonwealth Savers deduction, the credits beyond the three low-income
ones, the spouse tax adjustment and the spouse's share of withholding, part-year and
nonresident returns, identity, submission, or a live connection to Virginia Tax's records.
The lottery subtraction was built and then removed: Direct File never puts a prize in
federal income, so there was nothing to subtract. The gap list is in the code, in order of
size. The IRS labels the stack draft and changes it weekly; this work pins one commit.

**What it would take to use.** The rules and screens are the small part. The large parts
are the rest of Form 760, residents' identity, filing into Virginia's revenue system, and
Virginia Tax's own review of every figure. The IRS's template generates a new application
of this kind in an afternoon; the Virginia files drop into it. A rules workbench in the
repository lets policy staff change a figure or a rule in plain language, against worked
examples, with a policy and an engineering approval before it is published.

**Where it is.** github.com/gchickering21/direct-file-virginia, private until shared;
`handoff/README.md` there says how to take the change set without the course project.
Public domain, CC0, no branding, no endorsement claimed.

Graham Chickering, Georgetown University.
