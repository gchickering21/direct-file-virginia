// A second opinion at verify time. When scripts/lib/virginia-model.cjs exists (the independent model
// of the rules written from the Code of Virginia, `model(inputs) -> lines`), every worked example's
// inputs are run through it too, and lines where the engine and the model disagree are reported as
// warnings. Warnings, not failures: the model's input shape need not match the sandbox's one for
// one, so a disagreement is something to look at, not proof of a wrong rule. Without the file,
// or if it throws, verify goes on as before.

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { APP } from './node.mjs'
import { lineFacts } from './reports.mjs'

export const MODEL_FILE = process.env.WORKBENCH_MODEL || path.join(APP, 'scripts/lib/virginia-model.cjs')

let loaded
function model () {
  if (loaded !== undefined) return loaded
  loaded = null
  try {
    if (fs.existsSync(MODEL_FILE)) {
      const mod = createRequire(import.meta.url)(MODEL_FILE)
      const fn = typeof mod === 'function' ? mod : mod.model || mod.default
      if (typeof fn === 'function') loaded = fn
    }
  } catch (e) {
    loaded = null
    const rel = path.relative(APP, MODEL_FILE)
    MODEL_ERROR.message = `${rel.startsWith('..') ? MODEL_FILE : rel} did not load: ${e.message}`
  }
  return loaded
}
const MODEL_ERROR = { message: null }

export const oracleAvailable = () => !!model()

/** The sandbox's inputs, named the way the model (and scripts/virginia-cases.cjs) names them. */
export function modelInputs (inputs) {
  const num = v => (v === undefined || v === null || v === '' ? 0 : Number(v))
  const list = p => (Array.isArray(inputs[p]) ? inputs[p].map(Number) : [])
  const w2 = list('/formW2s/*/stateWithholding')
  const on = (flag, value) => (inputs[flag] === true || inputs[flag] === 'true' ? num(inputs[value]) : 0)
  // the sandbox's stand-ins, in the model's shape (scripts/lib/virginia-model.cjs documents it): the first
  // N W-2s carry a state code (VA on a resident return), each 1099-G pairs with its same-year repayment, and
  // the spouse is the second filer's facts (/vaSpouse/…) on a joint return, else null
  const coded = inputs['/formW2s/*/xmlStateCd'] === undefined || inputs['/formW2s/*/xmlStateCd'] === '' ? w2.length : num(inputs['/formW2s/*/xmlStateCd'])
  const repaid = list('/form1099Gs/*/amountPaidBackForBenefitsInTaxYear')
  return {
    w2s: w2.map((withheld, i) => ({ withheld, state: i < coded ? 'VA' : null })),
    unemployment: list('/form1099Gs/*/amount').map((amount, i) => ({ amount, repaid: repaid[i] || 0 })),
    retirement1099R: list('/form1099Rs/*/taxableAmount').reduce((a, b) => a + b, 0),
    spouse: (inputs['/filingStatus'] === 'marriedFilingJointly' && inputs['/vaSpouse/dateOfBirth'])
      ? { dob: inputs['/vaSpouse/dateOfBirth'], blind: inputs['/vaSpouse/isBlind'] === true || inputs['/vaSpouse/isBlind'] === 'true' }
      : null,
    agi: num(inputs['/agi']),
    status: inputs['/filingStatus'] || 'single',
    filingStatus: inputs['/filingStatus'] || 'single',
    state: inputs['/filerResidenceAndIncomeState'] || 'va',
    dob: inputs['/primaryFiler/dateOfBirth'] || null,
    age65: inputs['/primaryFiler/age65OrOlder'] === true || inputs['/primaryFiler/age65OrOlder'] === 'true',
    blind: inputs['/primaryFiler/isBlind'] === true || inputs['/primaryFiler/isBlind'] === 'true',
    claimable: inputs['/primaryFiler/canBeClaimed'] === true || inputs['/primaryFiler/canBeClaimed'] === 'true',
    deps: num(inputs['/familyAndHousehold/*/isClaimedDependent']),
    wages: num(inputs['/wages']),
    ss: num(inputs['/taxableSocialSecurityBenefits']),
    fedEitc: num(inputs['/earnedIncomeCredit']),
    withheld: w2.reduce((a, b) => a + b, 0),
    w2: w2,
    locality: inputs['/vaLocality'] || null,
    untaxed: on('/vaHasUntaxedPurchases', '/vaUntaxedPurchases'),
    basicPay: inputs['/vaHasMilitaryBasicPay'] === true || inputs['/vaHasMilitaryBasicPay'] === 'true' ? num(inputs['/vaMilitaryBasicPay']) : null,
    military: inputs['/vaHasMilitaryIncome'] === true || inputs['/vaHasMilitaryIncome'] === 'true',
    retirement: on('/vaHasMilitaryRetirement', '/vaMilitaryRetirementIncome'),
    savers: on('/vaHasCommonwealthSaversContributions', '/vaCommonwealthSaversContributions'),
    lottery: on('/vaHasLotteryPrizesUnder600', '/vaLotteryPrizesUnder600'),
    estimated: num(inputs['/vaEstimatedPayments']),
    prior: num(inputs['/vaPriorYearOverpaymentApplied']),
    extension: num(inputs['/vaExtensionPayments']),
    raw: inputs,
  }
}

// The model's short names (scripts/virginia-cases.cjs) to fact paths. A model that returns fact
// paths, or "Line 16" / "line16" keys, is mapped through the file's own line names instead.
const SHORT = {
  ageDed: '/vaAgeDeduction', vagi: '/vaAdjustedGrossIncome', std: '/vaStandardDeduction', ex: '/vaExemptions',
  adj: '/vaScheduleAdjSubtractions', savers: '/vaCommonwealthSaversDeduction', ti: '/vaTaxableIncome', tax: '/vaTax',
  credit: '/vaLowIncomeCredit', withheld: '/vaWithholding', useTax: '/vaUseTax', amountOwed: '/vaAmountYouOwe', refund: '/vaRefund',
  below: '/vaIsBelowFilingThreshold', subtractions: '/vaTotalSubtractions', deductions: '/vaTotalDeductions',
  owe: '/vaTaxYouOwe', overpayment: '/vaOverpayment', claims: '/vaClaimsLowIncomeCredit',
}

function pathFor (key, linesByLabel) {
  if (key.startsWith('/')) return key
  if (SHORT[key]) return SHORT[key]
  const m = String(key).match(/^(?:form760[_ -]?)?line[_ -]?(\d+[a-z]?)$/i) || String(key).match(/^(\d+[a-z]?)$/)
  return m ? linesByLabel.get(m[1].toLowerCase()) || null : null
}

/**
 * Run every example through the model and compare with what the engine gave (`results` from
 * runExamples, which must have read the line paths). Returns { available, error, warnings }.
 */
export function oracleWarnings ({ facts, examples, baseline, results }) {
  const fn = model()
  if (!fn) return { available: false, error: MODEL_ERROR.message, warnings: [] }
  const lines = lineFacts(facts).filter(l => l.form === 'Form 760')
  const linesByLabel = new Map()
  for (const l of lines) if (!linesByLabel.has(l.line.toLowerCase())) linesByLabel.set(l.line.toLowerCase(), l.path)
  const warnings = []
  let error = null
  for (const ex of examples) {
    const r = results[ex.id]
    if (!r || r.error) continue
    let out
    try { out = fn(modelInputs({ ...baseline, ...ex.inputs })) } catch (e) { error = `${ex.title}: the model threw: ${e.message}`; continue }
    if (!out || typeof out !== 'object') continue
    for (const [key, expected] of Object.entries(out)) {
      const p = pathFor(key, linesByLabel)
      if (!p || !(p in r.values)) continue
      const actual = r.values[p]
      if (expected === null || expected === undefined || typeof expected === 'object') continue
      const same = typeof expected === 'number' && typeof actual === 'number' ? Math.abs(expected - actual) < 0.005 : String(expected) === String(actual)
      if (!same) warnings.push({ example: ex.id, title: ex.title, path: p, key, engine: actual, model: expected })
    }
  }
  return { available: true, error, warnings }
}
