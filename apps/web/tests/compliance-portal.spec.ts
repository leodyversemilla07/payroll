import { expect, test } from "@playwright/test";

const user = {
  id: "u1",
  organizationId: "o1",
  name: "HR Tester",
  email: "hr@example.com",
  role: "HR_ADMIN",
};
const employee = {
  id: "e1",
  firstName: "Ana",
  lastName: "Santos",
  employeeNumber: "EMP-001",
  employmentStatus: "ACTIVE",
};
const queueRow = {
  employeeId: "e1",
  employeeNumber: "EMP-001",
  name: "Ana Santos",
  status: "DEFICIENCY_REVIEW",
  grossCents: 70000000,
  taxableCents: 60000000,
  taxDueCents: 6250000,
  taxWithheldCents: 1000000,
  unsettledDifferenceCents: 5250000,
  remainingDifferenceCents: 5250000,
  settlementType: null,
  settledCents: null,
};
const queue = {
  taxYear: 2026,
  reviewOnly: true,
  employeeCount: 1,
  blockedCount: 0,
  balancedCount: 0,
  deficiencyReviewCount: 1,
  refundReviewCount: 0,
  settledCount: 0,
  missingRemittanceMonths: [],
  mismatchedRemittanceMonths: [],
  remittanceEvidenceIsUnverified: true,
  classifiedTaxDueCents: 6250000,
  classifiedTaxWithheldCents: 1000000,
  rows: [queueRow],
};
const evidence = {
  taxYear: 2026,
  selfReportedUnverified: true,
  declaration: {
    id: "decl-1",
    hasPriorEmployer: true,
    sourceReference: "HR-DECL-2026",
  },
  previousEmployers: [
    {
      id: "prior-1",
      employerName: "Prior Inc.",
      employerTin: "123-456-789",
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-05-31T00:00:00.000Z",
      grossCompensationCents: 20000000,
      taxableCompensationCents: 10000000,
      taxWithheldCents: 1000000,
      documentReference: "2316-1",
    },
  ],
  monthlyRemittances: [
    {
      id: "rem-12",
      month: 12,
      remittedCents: 1000000,
      documentReference: "1601C-12",
    },
  ],
  settlement: null,
  supersededHistory: {
    declarations: [],
    previousEmployers: [],
    monthlyRemittances: [],
    settlements: [],
  },
};
const preview = {
  certificate: {
    partIVA: {
      taxDueAnnualCents: 6250000,
      totalTaxWithheldCents: 1000000,
    },
  },
  reconciliationStatus: "DEFICIENCY_REVIEW",
  formattedDocument:
    "INTERNAL TAX RECONCILIATION WORKSHEET (NOT BIR FORM 2316)\nDEFICIENCY TO REVIEW",
  settlement: null,
  remainingDifferenceCents: 5250000,
  isSettled: false,
  priorEmployerTotals: {
    employerCount: 1,
    taxableCents: 10000000,
  },
};

// Exercise the year-end compliance UI against mocked tRPC: queue, evidence,
// worksheet preview, settlement posting and declaration correction.
test("review queue, preview, settlement and correction", async ({ page }) => {
  let signedIn = false;
  const mutations: string[] = [];
  await page.route("**/trpc/**", async (route) => {
    const paths = (
      new URL(route.request().url()).pathname.split("/trpc/")[1] ?? ""
    ).split(",");
    const isMutation = route.request().method() === "POST";
    const results = paths.map((path) => {
      if (path === "auth.login") {
        signedIn = true;
        return { result: { data: { json: { user } } } };
      }
      if (path === "auth.logout") {
        signedIn = false;
        return { result: { data: { json: { success: true } } } };
      }
      if (!signedIn)
        return {
          error: {
            json: {
              message: "Unauthorized",
              code: -32001,
              data: { code: "UNAUTHORIZED", httpStatus: 401 },
            },
          },
        };
      if (isMutation) mutations.push(path);
      const json =
        path === "auth.me"
          ? user
          : path === "employees.list"
            ? [employee]
            : path === "payroll.listRuns"
              ? []
              : path === "compliance.listYearEndReconciliations"
                ? queue
                : path === "compliance.getTaxEvidence"
                  ? evidence
                  : path === "compliance.previewBir2316Reconciliation"
                    ? preview
                    : path.startsWith("compliance.record") ||
                        path.startsWith("compliance.correct")
                      ? { id: "new-1" }
                      : null;
      return { result: { data: { json } } };
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(paths.length === 1 ? results[0] : results),
    });
  });

  await page.goto("/");
  await page.getByLabel("Email").fill("hr@example.com");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  const yearEnd = page.getByRole("region", { name: "Year-end tax" });
  await expect(yearEnd).toBeVisible();
  await expect(
    yearEnd.getByRole("button", { name: /Ana Santos/ }),
  ).toContainText("DEFICIENCY REVIEW");

  await yearEnd.getByRole("button", { name: /Ana Santos/ }).click();
  await expect(yearEnd.getByText("Prior-employer declaration:")).toContainText(
    "has prior employer",
  );
  await expect(yearEnd.getByText("Prior Inc.").first()).toBeVisible();

  await yearEnd.getByRole("button", { name: "Preview worksheet" }).click();
  await expect(yearEnd.getByText("INTERNAL TAX RECONCILIATION")).toBeVisible();

  const settlement = yearEnd.getByRole("region", { name: "Settlement" });
  await settlement.getByLabel("Settlement date").fill("2026-12-15");
  await settlement.getByLabel("Document reference").first().fill("DEC-2026");
  await settlement.getByRole("button", { name: "Post settlement" }).click();
  await expect(settlement.getByText("Settlement posted.")).toBeVisible();
  expect(mutations).toContain("compliance.recordYearEndSettlement");

  await yearEnd.getByRole("button", { name: "Correct declaration" }).click();
  await yearEnd.getByLabel("Source reference").nth(1).fill("HR-DECL-2026-v2");
  await yearEnd
    .getByLabel(/Correction reason/)
    .fill("Employee disclosed earlier employment omitted from the record");
  await yearEnd
    .getByLabel(/Reviewer user ID/)
    .fill("11111111-1111-4111-8111-111111111111");
  await yearEnd.getByRole("button", { name: "Record correction" }).click();
  await expect(yearEnd.getByText("Correction recorded.")).toBeVisible();
  expect(mutations).toContain("compliance.correctPriorEmployerDeclaration");
});
