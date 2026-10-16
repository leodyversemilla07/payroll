import { describe, expect, it } from "vitest";
import {
  annualizeTax,
  calculatePagibigContribution,
  calculatePhilhealthContribution,
  calculateSssContribution,
  calculateWithholdingTax,
} from "../src/index.js";

/**
 * 2026 STATUTORY GOLDEN PINS.
 *
 * A frozen fixture set for every rate, bracket, cap, and threshold in force
 * for tax year 2026: SSS (RA 11199 schedule, 15% with WISP), PhilHealth
 * (5% premium, floor 10,000 / ceiling 100,000), Pag-IBIG/HDMF (1-2% with a
 * 10,000 base cap), and the BIR TRAIN withholding tables (RR 8-2018, in
 * force since 2023 and unchanged into 2026, monthly and semi-monthly plus
 * the annual graduated schedule used by year-end settlement).
 *
 * Unlike the micro-edge probes in statutory-boundaries.spec.ts, these pins
 * walk EVERY band of EVERY table at and around its fences, so editing any
 * single floor, fixed-excess, percent, or cap fails loudly on the exact
 * row instead of silently repricing 2026 payroll. House policy when a
 * schedule changes: add a new pinned year set with its own effective-date
 * semantics, and only then retire rows this file pins. Nothing here is
 * auto-derived at runtime between upgrades: the SSS ladder is generated
 * from golden constants below, which are themselves anchored by the
 * hand-written BigInt rows that follow.
 */

describe("2026 golden pins - SSS schedule", () => {
  // The published 2026 table as golden constants (centavos rule: 5% of m
  // pesos is 5*m centavos): MSC ladder 5,000..35,000 in 500-peso steps from
  // a starting salary of 5,250; 15% total split 5% EE / 10% ER on the full
  // MSC (regular capped at 20,000, WISP takes the excess at the same
  // split); EC is employer-only, 10 pesos up to MSC 14,500 and 30 above.
  const GOLDEN = {
    mscFloor: 5_000,
    stepCount: 60,
    step: 500,
    stepStartSalary: 5_250,
    regularCap: 20_000,
    employeeCentsPerPeso: 5,
    employerCentsPerPeso: 10,
    ecCents: {
      mscAtOrBelow14500: 1_000,
      mscAbove14500: 3_000,
    },
  } as const;

  const expectedForMsc = (msc: number) => ({
    eeCents: 5 * msc,
    erCents: 10 * msc + (msc <= 14_500 ? 1_000 : 3_000),
    wispMsc: Math.max(0, msc - 20_000),
  });

  // One probe per ladder row (61 rows) via its lower salary fence.
  const ladderProbes: Array<{ salary: bigint; msc: number }> = [
    { salary: 100_000n, msc: 5_000 }, // everything below the first step
    { salary: 524_999n, msc: 5_000 }, // one centavo below the 5,250 step start
    ...Array.from({ length: GOLDEN.stepCount }, (_, k) => ({
      salary: BigInt((GOLDEN.stepStartSalary + k * GOLDEN.step) * 100),
      msc: GOLDEN.mscFloor + (k + 1) * GOLDEN.step,
    })),
  ];

  it.each(ladderProbes)(
    "MSC $msc pays the pinned 5/10 split, WISP excess and EC seam",
    ({ salary, msc }) => {
      const sss = calculateSssContribution(salary);
      const expected = expectedForMsc(msc);
      expect(sss.employeeShareCents).toBe(BigInt(expected.eeCents));
      expect(sss.employerShareCents).toBe(BigInt(expected.erCents));
      expect(sss.wispEmployeeCents).toBe(
        BigInt(expected.wispMsc * GOLDEN.employeeCentsPerPeso),
      );
      expect(sss.wispEmployerCents).toBe(
        BigInt(expected.wispMsc * GOLDEN.employerCentsPerPeso),
      );
      expect(sss.ecShareCents).toBe(
        BigInt(
          msc <= 14_500
            ? GOLDEN.ecCents.mscAtOrBelow14500
            : GOLDEN.ecCents.mscAbove14500,
        ),
      );
      expect(sss.totalCents).toBe(
        sss.employeeShareCents + sss.employerShareCents,
      );
    },
  );

  it("treats in-step salaries identically to their row's lower fence", () => {
    for (const [lower, mid, msc] of [
      [5_250, 5_749.99, 5_500],
      [32_750, 33_249.99, 33_000],
      [34_750, 99_999, 35_000],
    ] as Array<[number, number, number]>) {
      expect(
        calculateSssContribution(BigInt(Math.round(mid * 100)))
          .employeeShareCents,
      ).toBe(calculateSssContribution(BigInt(lower * 100)).employeeShareCents);
      expect(
        calculateSssContribution(BigInt(msc * 100)).employeeShareCents,
      ).toBe(BigInt(5 * msc));
    }
  });

  // Hand-written anchors: the exact bigints of the head, EC seam, WISP
  // onset, and ceiling rows, independent of the golden constants above.
  it("pins literal centavos for the anchor rows", () => {
    expect(calculateSssContribution(520_000n)).toEqual({
      employeeShareCents: 25_000n,
      employerShareCents: 51_000n,
      ecShareCents: 1_000n,
      wispEmployeeCents: 0n,
      wispEmployerCents: 0n,
      totalCents: 76_000n,
    });
    // MSC 14,500 (salary 14,500.00): last row with the 10-peso EC.
    expect(calculateSssContribution(1_450_000n)).toEqual({
      employeeShareCents: 72_500n,
      employerShareCents: 146_000n,
      ecShareCents: 1_000n,
      wispEmployeeCents: 0n,
      wispEmployerCents: 0n,
      totalCents: 218_500n,
    });
    // MSC 15,000 (salary 14,750.00): first row with the 30-peso EC.
    expect(calculateSssContribution(1_475_000n)).toEqual({
      employeeShareCents: 75_000n,
      employerShareCents: 153_000n,
      ecShareCents: 3_000n,
      wispEmployeeCents: 0n,
      wispEmployerCents: 0n,
      totalCents: 228_000n,
    });
    // MSC 20,500 (salary 20,250.00): first WISP row - published row reads
    // EE 1,025 / ER 2,080 (regular 1,000+2,000 on 20,000; WISP 25+50 on 500).
    expect(calculateSssContribution(2_025_000n)).toEqual({
      employeeShareCents: 102_500n,
      employerShareCents: 208_000n,
      ecShareCents: 3_000n,
      wispEmployeeCents: 2_500n,
      wispEmployerCents: 5_000n,
      totalCents: 310_500n,
    });
    // The 35,000 ceiling row: published total 5,280 (1,750 EE + 3,530 ER incl. 30 EC).
    expect(calculateSssContribution(3_475_000n)).toEqual({
      employeeShareCents: 175_000n,
      employerShareCents: 353_000n,
      ecShareCents: 3_000n,
      wispEmployeeCents: 75_000n,
      wispEmployerCents: 150_000n,
      totalCents: 528_000n,
    });
    // Any far-above-cap salary stays on the ceiling row.
    expect(calculateSssContribution(100_000_000n)).toEqual({
      employeeShareCents: 175_000n,
      employerShareCents: 353_000n,
      ecShareCents: 3_000n,
      wispEmployeeCents: 75_000n,
      wispEmployerCents: 150_000n,
      totalCents: 528_000n,
    });
  });
});

describe("2026 golden pins - PhilHealth premium", () => {
  it.each([
    // [salary pesos, employee, employer, total] at 5% between the floor
    // (10,000 -> 500) and ceiling (100,000 -> 5,000), split 50/50.
    [1_000, 25_000, 25_000, 50_000], // floor ruling applies from below
    [10_000, 25_000, 25_000, 50_000],
    [20_001.23, 50_003, 50_003, 100_006], // per-share half-up; total lifts +1
    [25_000, 62_500, 62_500, 125_000],
    [99_999.99, 250_000, 250_000, 500_000], // per-share round lifts the total
    [100_000, 250_000, 250_000, 500_000],
    [150_000, 250_000, 250_000, 500_000], // ceiling holds arbitrarily above
  ] as Array<[number, number, number, number]>)(
    "salary %p peso-equivalent input -> (%s, %s, %s) centavos",
    (pesos, employee, employer, total) => {
      expect(
        calculatePhilhealthContribution(BigInt(Math.round(pesos * 100))),
      ).toEqual({
        employeeShareCents: BigInt(employee),
        employerShareCents: BigInt(employer),
        totalCents: BigInt(total),
      });
    },
  );
});

describe("2026 golden pins - Pag-IBIG contributions", () => {
  it.each([
    // [salary pesos, employee, employer, total]; 1% EE below/at 1,500,
    // 2% EE above, 2% EE always, base capped at 10,000 (200/200 max).
    [800, 800, 1_600, 2_400],
    [1_500, 1_500, 3_000, 4_500],
    [1_500.01, 3_000, 3_000, 6_000],
    [8_000, 16_000, 16_000, 32_000],
    [10_000, 20_000, 20_000, 40_000],
    [10_000.01, 20_000, 20_000, 40_000],
    [50_000, 20_000, 20_000, 40_000],
  ] as Array<[number, number, number, number]>)(
    "salary %p peso-equivalent input -> (%s, %s, %s) centavos",
    (pesos, employee, employer, total) => {
      expect(
        calculatePagibigContribution(BigInt(Math.round(pesos * 100))),
      ).toEqual({
        employeeShareCents: BigInt(employee),
        employerShareCents: BigInt(employer),
        totalCents: BigInt(total),
      });
    },
  );

  it("pins the voluntary/custom override: member share honored, standard 200 employer match", () => {
    expect(calculatePagibigContribution(10_000_000n, 50_000n)).toEqual({
      employeeShareCents: 50_000n,
      employerShareCents: 20_000n,
      totalCents: 70_000n,
    });
    // Custom shares below 200 pesos still draw the standard employer match.
    expect(calculatePagibigContribution(10_000_000n, 10_000n)).toEqual({
      employeeShareCents: 10_000n,
      employerShareCents: 20_000n,
      totalCents: 30_000n,
    });
    // A zero override falls through to the standard table.
    expect(calculatePagibigContribution(10_000_000n, 0n)).toEqual({
      employeeShareCents: 20_000n,
      employerShareCents: 20_000n,
      totalCents: 40_000n,
    });
  });
});

describe("2026 golden pins - BIR monthly withholding table", () => {
  it.each([
    // Every fence probed from both sides plus a mid-band point; the fence
    // value itself belongs to the upper band and must equal that band's
    // fixed tax exactly (the table is arithmetic-continuous).
    ["end of 0% band", 2_083_200n, 0n],
    ["fence 20,833.00 (upper band, zero fixed)", 2_083_300n, 0n],
    ["first peso of 15% band", 2_083_400n, 15n],
    ["mid 15% band", 2_500_000n, 62_505n],
    ["fence 33,333.00 equals 1,875 fixed of 20%", 3_333_300n, 187_500n],
    ["first centavo of 20% band rounds the tie down", 3_333_301n, 187_500n],
    ["first peso of 20% band", 3_333_400n, 187_520n],
    ["mid 20% band", 4_000_000n, 320_840n],
    ["fence 66,667.00 equals 8,541.80 fixed of 25%", 6_666_700n, 854_180n],
    ["first peso of 25% band", 6_666_800n, 854_205n],
    ["mid 25% band", 10_000_000n, 1_687_505n],
    ["fence 166,667.00 equals 33,541.80 fixed of 30%", 16_666_700n, 3_354_180n],
    ["first peso of 30% band", 16_666_800n, 3_354_210n],
    ["mid 30% band", 25_000_000n, 5_854_170n],
    [
      "fence 666,667.00 equals 183,541.80 fixed of 35%",
      66_666_700n,
      18_354_180n,
    ],
    ["first peso of 35% band", 66_666_800n, 18_354_215n],
    ["mid 35% band", 75_000_000n, 21_270_835n],
  ] as Array<[string, bigint, bigint]>)(
    "monthly tax on %s",
    (_label, taxableCents, expectedCents) => {
      expect(calculateWithholdingTax(taxableCents, false, false)).toBe(
        expectedCents,
      );
    },
  );
});

describe("2026 golden pins - BIR semi-monthly withholding table", () => {
  it.each([
    ["end of 0% band", 1_041_600n, 0n],
    ["fence 10,417.00", 1_041_700n, 0n],
    ["first centavo rounds below the half-centavo tie", 1_041_701n, 0n],
    ["first peso of 15% band", 1_041_800n, 15n],
    ["mid 15% band", 1_200_000n, 23_745n],
    ["fence 16,667.00 equals 937.50 fixed of 20%", 1_666_700n, 93_750n],
    ["first peso of 20% band", 1_666_800n, 93_770n],
    ["mid 20% band", 2_500_000n, 260_410n],
    ["mid 25% band", 5_000_000n, 843_745n],
    ["fence 83,333.00 equals 16,770.70 fixed of 30%", 8_333_300n, 1_677_070n],
    ["first peso of 30% band", 8_333_400n, 1_677_100n],
    ["mid 30% band", 15_000_000n, 3_677_080n],
    ["fence 333,333.00 equals 91,770.70 fixed of 35%", 33_333_300n, 9_177_070n],
    ["first peso of 35% band", 33_333_400n, 9_177_105n],
    ["mid 35% band", 40_000_000n, 11_510_415n],
  ] as Array<[string, bigint, bigint]>)(
    "semi-monthly tax on %s",
    (_label, taxableCents, expectedCents) => {
      expect(calculateWithholdingTax(taxableCents, true, false)).toBe(
        expectedCents,
      );
    },
  );

  it("exempts minimum wage earners and non-positive bases", () => {
    expect(calculateWithholdingTax(5_000_000n, true, true)).toBe(0n);
    expect(calculateWithholdingTax(5_000_000n, false, true)).toBe(0n);
    expect(calculateWithholdingTax(0n, true, false)).toBe(0n);
  });
});

describe("2026 golden pins - annual withholding schedule", () => {
  it.each([
    // Fences advance into the next band's fixed exactly; the schedule is
    // the TRAIN annual table: 0 under 250k; 15% of excess over 250k;
    // 22,500 + 20% over 400k; 102,500 + 25% over 800k; 402,500 + 30% over
    // 2M; 2,202,500 + 35% over 8M (fractional centavos round half up once).
    [
      "exemption fence at 250,000 refunds everything",
      25_000_000n,
      123_456n,
      0n,
      -123_456n,
    ],
    ["early 15% band", 25_010_000n, 0n, 1_500n, 1_500n],
    [
      "fence 400,000 equals 22,500 fixed of 20%",
      40_000_000n,
      0n,
      2_250_000n,
      2_250_000n,
    ],
    ["early 20% band", 40_010_000n, 0n, 2_252_000n, 2_252_000n],
    [
      "fence 800,000 equals 102,500 fixed of 25%",
      80_000_000n,
      0n,
      10_250_000n,
      10_250_000n,
    ],
    ["early 25% band", 80_010_000n, 0n, 10_252_500n, 10_252_500n],
    [
      "fence 2,000,000 equals 402,500 fixed of 30%",
      200_000_000n,
      0n,
      40_250_000n,
      40_250_000n,
    ],
    ["early 30% band", 200_010_000n, 0n, 40_253_000n, 40_253_000n],
    [
      "fence 8,000,000 equals 2,202,500 fixed of 35%",
      800_000_000n,
      0n,
      220_250_000n,
      220_250_000n,
    ],
    ["early 35% band", 800_010_000n, 0n, 220_253_500n, 220_253_500n],
    ["deep 35% band", 1_000_000_000n, 0n, 290_250_000n, 290_250_000n],
    [
      "over-withholding settles as a refund",
      40_010_000n,
      5_000_000n,
      2_252_000n,
      -2_748_000n,
    ],
  ] as Array<[string, bigint, bigint, bigint, bigint]>)(
    "annual tax: %s",
    (_label, taxableCents, withheldCents, dueCents, adjustmentCents) => {
      expect(annualizeTax(taxableCents, withheldCents, false)).toEqual({
        totalAnnualTaxDueCents: dueCents,
        taxAdjustmentCents: adjustmentCents,
      });
    },
  );
});
