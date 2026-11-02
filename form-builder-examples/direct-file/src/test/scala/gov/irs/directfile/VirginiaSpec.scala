package gov.irs.directfile

import gov.irs.factgraph.persisters.InMemoryPersister
import gov.irs.factgraph.types.*
import gov.irs.factgraph.Graph
import gov.irs.formbuilder.loadFactDictionary
import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers

/** The Virginia return's arithmetic (facts/virginia.xml), run through this port's full dictionary.
  *
  * Two corpora: the four demo households in `scenarios/virginia_demo_*.json`, whose Form 760 lines are pinned here (the
  * figures are the ones `docs/virginia/README.md` hand-checks and the Node sandbox computed), and the households
  * `scripts/virginia-cases.py` generates into `src/test/resources/virginia-cases/` (the same files the browser run,
  * `make virginia-cases`, compares with the independent model in `scripts/lib/virginia-model.cjs`). Over both, the
  * invariants that hold of any Form 760 this module can produce.
  *
  * Lines 20 to 22 (estimated payments, last year's overpayment, extension payments) come from the records stand-in on
  * the page, not from the scenario file, so here they are their $0 placeholders and the pinned amounts owed are stated
  * before those payments. A placeholder result carries a value, as it does on the page.
  */
class VirginiaSpec extends AnyFlatSpec with Matchers {

  private lazy val dictionary = loadFactDictionary(app).factDictionary

  private lazy val demos: Seq[os.Path] =
    os.list(app.scenariosDir).filter(p => p.ext == "json" && p.last.startsWith("virginia_demo_")).sorted

  private lazy val casesDir: os.Path = os.pwd / "src" / "test" / "resources" / "virginia-cases"

  private lazy val cases: Seq[os.Path] =
    if (os.exists(casesDir)) os.list(casesDir).filter(p => p.ext == "json" && p.last != "meta.json").sorted
    else Seq.empty

  /** A scenario file, loaded through this application's dictionary. */
  private def graphOf(scenario: os.Path): Graph =
    Graph(dictionary, InMemoryPersister(os.read(scenario)))

  private def dollar(graph: Graph, path: String): Option[Dollar] =
    graph.get(path).value.map(_.asInstanceOf[Dollar])

  private def boolean(graph: Graph, path: String): Option[Boolean] =
    graph.get(path).value.map(_.asInstanceOf[Boolean])

  private def string(graph: Graph, path: String): Option[String] =
    graph.get(path).value.map(_.toString)

  private def demo(n: Int): Graph = graphOf(demos.find(_.last.startsWith(s"virginia_demo_${n}_")).get)

  /** The Virginia resident returns of a corpus: the rest never reach a Virginia screen. */
  private def residents(corpus: Seq[os.Path]): Seq[(os.Path, Graph)] =
    corpus.map(p => (p, graphOf(p))).filter { case (_, g) => boolean(g, "/vaIsResident").contains(true) }

  "the Virginia corpora" should "not be empty" in {
    demos should have size 4
    cases should not be empty
  }

  it should "load every household against this dictionary" in {
    val unloadable = (demos ++ cases).flatMap { scenario =>
      scala.util.Try(graphOf(scenario)).failed.toOption.map(error => s"${scenario.last}: ${error.getMessage}")
    }
    unloadable shouldBe empty
  }

  "Virginia Demo 1 (Riley Rappahannock, single, $33k)" should "compute the lines the hand check lists" in {
    val g = demo(1)
    dollar(g, "/vaFederalAdjustedGrossIncome") shouldBe Some(Dollar(34333))
    dollar(g, "/vaAgeDeduction") shouldBe Some(Dollar(0))
    dollar(g, "/vaScheduleAdjSubtractions") shouldBe Some(Dollar(0))
    dollar(g, "/vaTotalSubtractions") shouldBe Some(Dollar(0))
    dollar(g, "/vaAdjustedGrossIncome") shouldBe Some(Dollar(34333))
    dollar(g, "/vaStandardDeduction") shouldBe Some(Dollar(8500))
    dollar(g, "/vaExemptions") shouldBe Some(Dollar(930))
    dollar(g, "/vaCommonwealthSaversDeduction") shouldBe Some(Dollar(0))
    dollar(g, "/vaTotalDeductions") shouldBe Some(Dollar(9430))
    dollar(g, "/vaTaxableIncome") shouldBe Some(Dollar(24903))
    dollar(g, "/vaTax") shouldBe Some(Dollar(1174))
    dollar(g, "/vaWithholding") shouldBe Some(Dollar(300))
    dollar(g, "/vaLowIncomeCredit") shouldBe Some(Dollar(0))
    boolean(g, "/vaClaimsLowIncomeCredit") shouldBe Some(false)
    dollar(g, "/vaUseTax") shouldBe Some(Dollar(24))
    // before the $200 of estimated payments the records stand-in adds on the page: $1,174 - $300 + $24
    dollar(g, "/vaTaxYouOwe") shouldBe Some(Dollar(874))
    dollar(g, "/vaAmountYouOwe") shouldBe Some(Dollar(898))
    dollar(g, "/vaRefund") shouldBe Some(Dollar(0))
  }

  "Virginia Demo 2 (Morgan Shenandoah, 65, $56k)" should "phase the age deduction out against AFAGI" in {
    val g = demo(2)
    dollar(g, "/vaFederalAdjustedGrossIncome") shouldBe Some(Dollar(57000))
    dollar(g, "/vaAgeDeduction") shouldBe Some(Dollar(5000))
    dollar(g, "/vaTotalSubtractions") shouldBe Some(Dollar(5000))
    dollar(g, "/vaAdjustedGrossIncome") shouldBe Some(Dollar(52000))
    dollar(g, "/vaExemptions") shouldBe Some(Dollar(1730))
    dollar(g, "/vaCommonwealthSaversDeduction") shouldBe Some(Dollar(3000))
    dollar(g, "/vaTotalDeductions") shouldBe Some(Dollar(13230))
    dollar(g, "/vaTaxableIncome") shouldBe Some(Dollar(38770))
    dollar(g, "/vaTax") shouldBe Some(Dollar(1972))
    dollar(g, "/vaWithholding") shouldBe Some(Dollar(300))
    dollar(g, "/vaTaxYouOwe") shouldBe Some(Dollar(1672)) // $1,522 on the page, after the $150 the records add
  }

  "Virginia Demo 3 (Jordan Elizabeth, head of household, $20k, EITC)" should "subtract the unemployment and claim the refundable credit" in {
    val g = demo(3)
    dollar(g, "/vaFederalAdjustedGrossIncome") shouldBe Some(Dollar(21500))
    dollar(g, "/vaUnemploymentCompensationSubtraction") shouldBe Some(Dollar(2000))
    dollar(g, "/vaScheduleAdjSubtractions") shouldBe Some(Dollar(2000))
    dollar(g, "/vaAdjustedGrossIncome") shouldBe Some(Dollar(19500))
    dollar(g, "/vaExemptions") shouldBe Some(Dollar(1860)) // the $800 blind exemption given up for the credit
    dollar(g, "/vaTaxableIncome") shouldBe Some(Dollar(9140))
    dollar(g, "/vaTax") shouldBe Some(Dollar(327))
    boolean(g, "/vaClaimsLowIncomeCredit") shouldBe Some(true)
    boolean(g, "/vaClaimsRefundableEarnedIncomeCredit") shouldBe Some(true)
    dollar(g, "/vaLowIncomeCredit") shouldBe Some(Dollar(632))
    dollar(g, "/vaWithholding") shouldBe Some(Dollar(200))
    dollar(g, "/vaRefund") shouldBe Some(Dollar(505))
  }

  "Virginia Demo 4 (Taylor York, single, $27k, military)" should "phase the basic pay subtraction" in {
    val g = demo(4)
    dollar(g, "/vaFederalAdjustedGrossIncome") shouldBe Some(Dollar(28000))
    dollar(g, "/vaMilitaryBasicPaySubtraction") shouldBe Some(Dollar(6000))
    dollar(g, "/vaScheduleAdjSubtractions") shouldBe Some(Dollar(6000))
    dollar(g, "/vaAdjustedGrossIncome") shouldBe Some(Dollar(22000))
    dollar(g, "/vaTaxableIncome") shouldBe Some(Dollar(12570))
    dollar(g, "/vaTax") shouldBe Some(Dollar(499))
    dollar(g, "/vaWithholding") shouldBe Some(Dollar(650))
    dollar(g, "/vaRefund") shouldBe Some(Dollar(151))
  }

  "every Virginia resident household" should "owe or be refunded, never both" in {
    val violations = residents(demos ++ cases).flatMap { case (scenario, g) =>
      for {
        owed <- dollar(g, "/vaAmountYouOwe")
        refund <- dollar(g, "/vaRefund")
        if owed > Dollar(0) && refund > Dollar(0)
      } yield s"${scenario.last}: owes $owed and is refunded $refund"
    }
    violations shouldBe empty
  }

  it should "have a tax that is never negative" in {
    val violations = residents(demos ++ cases).flatMap { case (scenario, g) =>
      dollar(g, "/vaTax").filter(_ < Dollar(0)).map(tax => s"${scenario.last}: tax $tax")
    }
    violations shouldBe empty
  }

  it should "have taxable income no greater than Virginia adjusted gross income" in {
    val violations = residents(demos ++ cases).flatMap { case (scenario, g) =>
      for {
        taxable <- dollar(g, "/vaTaxableIncome")
        vagi <- dollar(g, "/vaAdjustedGrossIncome")
        if taxable > vagi && taxable > Dollar(0)
      } yield s"${scenario.last}: taxable $taxable over VAGI $vagi"
    }
    violations shouldBe empty
  }

  it should "compute Line 9 as Line 1 minus Line 8" in {
    // Line 2 (additions) is out of scope and $0, so Line 3 is Line 1. Line 8 is the with- or without-credit total,
    // whichever way the return files, and this is the identity the selector Switches exist to keep.
    val violations = residents(demos ++ cases).flatMap { case (scenario, g) =>
      for {
        fagi <- dollar(g, "/vaFederalAdjustedGrossIncome")
        subtractions <- dollar(g, "/vaTotalSubtractions")
        vagi <- dollar(g, "/vaAdjustedGrossIncome")
        if vagi != fagi - subtractions
      } yield s"${scenario.last}: $vagi != $fagi - $subtractions"
    }
    violations shouldBe empty
  }

  it should "add Line 14 up from Lines 11 to 13 and take Line 15 from Lines 9 and 14" in {
    val violations = residents(demos ++ cases).flatMap { case (scenario, g) =>
      for {
        std <- dollar(g, "/vaStandardDeduction")
        exemptions <- dollar(g, "/vaExemptions")
        savers <- dollar(g, "/vaCommonwealthSaversDeduction")
        deductions <- dollar(g, "/vaTotalDeductions")
        vagi <- dollar(g, "/vaAdjustedGrossIncome")
        taxable <- dollar(g, "/vaTaxableIncome")
        expected = if (vagi - deductions > Dollar(0)) vagi - deductions else Dollar(0)
        if deductions != std + exemptions + savers || taxable != expected
      } yield s"${scenario.last}: Line 14 $deductions (11 $std, 12 $exemptions, 13 $savers), Line 15 $taxable of VAGI $vagi"
    }
    violations shouldBe empty
  }

  it should "claim a low-income credit only when it beats keeping the deductions" in {
    // Va. Code § 58.1-339.8(D): the tax less the credit against the tax keeping the age deduction, the Section B
    // exemptions and the basic pay subtraction, for the filer and the spouse alike.
    val violations = residents(demos ++ cases).flatMap { case (scenario, g) =>
      for {
        claims <- boolean(g, "/vaClaimsLowIncomeCredit")
        afterCredit <- dollar(g, "/vaWithCreditTaxAfterCredit")
        keeping <- dollar(g, "/vaWithoutCreditTax")
        if claims && afterCredit > keeping
      } yield s"${scenario.last}: claims a credit leaving $afterCredit against $keeping without it"
    }
    violations shouldBe empty
  }

  it should "withhold exactly box 17 of the W-2s whose MeF state code is VA" in {
    // The stricter form of /formW2s/*/vaStateIsVirginia, which tests for a state code being present: on a Virginia
    // resident return Direct File writes VA whenever box 15 is filled in, so the two agree.
    val violations = residents(demos ++ cases).flatMap { case (scenario, g) =>
      val w2s = g.get("/formW2s").value.map(_.asInstanceOf[Collection].items).getOrElse(Vector.empty)
      val expected = w2s.foldLeft(Dollar(0)) { (sum, id) =>
        val code = string(g, s"/formW2s/#$id/xmlStateCd")
        val box17 = dollar(g, s"/formW2s/#$id/stateWithholding").getOrElse(Dollar(0))
        if (code.contains("VA")) sum + box17 else sum
      }
      dollar(g, "/vaWithholding")
        .filter(_ != expected)
        .map(got => s"${scenario.last}: Line 19a $got, box 17 of the VA W-2s $expected")
    }
    violations shouldBe empty
  }

  it should "give the spouse's items only on a joint return" in {
    val violations = residents(demos ++ cases).flatMap { case (scenario, g) =>
      for {
        joint <- boolean(g, "/vaIsFilingStatus2")
        spouse65 <- boolean(g, "/vaSpouseAge65OrOlder")
        spouseBlind <- boolean(g, "/vaSpouseIsBlind")
        spouseAge <- dollar(g, "/vaSpouseAgeDeductionAllowed")
        if !joint && (spouse65 || spouseBlind || spouseAge > Dollar(0))
      } yield s"${scenario.last}: spouse items on a non-joint return"
    }
    violations shouldBe empty
  }

  "a generated case" should "reach a Virginia screen or be a non-resident" in {
    val stuck = cases.flatMap { scenario =>
      val g = graphOf(scenario)
      if (boolean(g, "/vaIsResident").isEmpty) Some(s"${scenario.last}: /vaIsResident is incomplete") else None
    }
    stuck shouldBe empty
  }
}
