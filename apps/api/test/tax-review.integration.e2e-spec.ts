import { randomUUID } from 'node:crypto';
import { prisma, Role } from '@workspace/db';
import type { Request, Response } from 'express';
import { AuthService } from '../src/auth/auth.service';
import { AuditService } from '../src/infrastructure/audit/audit.service';
import { ComplianceService } from '../src/modules/compliance/compliance.service';
import { EmployeesService } from '../src/modules/employees/employees.service';
import { LeavesService } from '../src/modules/leaves/leaves.service';
import { LoansService } from '../src/modules/loans/loans.service';
import { PayrollService } from '../src/modules/payroll/payroll.service';
import { TimekeepingService } from '../src/modules/timekeeping/timekeeping.service';
import { createApiRouter } from '../src/trpc/app.router';
import { type Context, TrpcService } from '../src/trpc/trpc.service';

const audit = new AuditService();
const compliance = new ComplianceService();
const timekeeping = new TimekeepingService();
const router = createApiRouter(
  new TrpcService(),
  new EmployeesService(),
  timekeeping,
  new PayrollService(timekeeping),
  new LoansService(),
  compliance,
  new LeavesService(),
  new AuthService(),
  audit,
);
type User = NonNullable<Context['user']>;
const caller = (user: User) =>
  router.createCaller({
    user,
    req: {
      ip: '127.0.0.1',
      headers: {},
      get: () => 'synthetic-tax-review-test',
    } as unknown as Request,
    res: {} as Response,
  });

describe('PostgreSQL authenticated tax correction and issuance safeguards', () => {
  jest.setTimeout(30_000);
  let organizationId: string;
  let employeeId: string;
  let slipId: string;
  let maker: User;
  let checker: User;
  let employeeUser: User;
  let specialist: User;
  const taxYear = 2026;
  const reason = 'Synthetic reviewed source document correction';
  const proposal = () => ({
    employeeId,
    taxYear,
    hasPriorEmployer: false,
    sourceReference: 'Synthetic declaration v2',
    correctionReason: reason,
  });
  const review = (id: string, decision: 'APPROVE' | 'REJECT' = 'APPROVE') => ({
    id,
    decision,
    reviewReason: reason,
  });
  const issue = () =>
    caller(checker).compliance.issueBir2316({ employeeId, taxYear });
  const issuance = () =>
    caller(checker).compliance.getBir2316Issuance({ employeeId, taxYear });

  beforeEach(async () => {
    if (process.env.NODE_ENV !== 'test' || !process.env.DATABASE_URL)
      throw new Error('A migrated disposable test DATABASE_URL is required');
    const org = await prisma.organization.create({
      data: {
        name: `Synthetic tax review ${randomUUID()}`,
        tin: '123456789',
        rdoCode: '047',
        registeredAddress: 'Test address',
      },
    });
    organizationId = org.id;
    const branch = await prisma.branch.create({
      data: { organizationId, name: 'HQ', code: 'HQ', address: 'Test address' },
    });
    const department = await prisma.department.create({
      data: { organizationId, name: 'Test', code: 'TEST' },
    });
    const emp = await prisma.employee.create({
      data: {
        organizationId,
        branchId: branch.id,
        departmentId: department.id,
        employeeNumber: `TEST-${randomUUID()}`,
        firstName: 'Synthetic',
        lastName: 'Employee',
        email: `${randomUUID()}@test.invalid`,
        dateOfBirth: new Date('1995-01-01'),
        gender: 'Other',
        civilStatus: 'Single',
        contactNumber: 'Test',
        residentialAddress: 'Test address',
        tin: '123456789',
        sssNo: '1234567890',
        philhealthNo: '123456789012',
        pagibigNo: '123456789012',
        hireDate: new Date('2026-01-01'),
        bankName: 'Test',
        bankAccountNumber: '1234567890',
        bankAccountName: 'Synthetic Employee',
        compensation: {
          create: {
            basicRateMonthlyCents: 1500000n,
            basicRateDailyCents: 68965n,
            basicRateHourlyCents: 8620n,
          },
        },
      },
    });
    employeeId = emp.id;
    async function user(role: Role): Promise<User> {
      const stored = await prisma.user.create({
        data: {
          organizationId,
          role,
          name: role,
          email: `${randomUUID()}@test.invalid`,
          passwordHash: 'test-no-login',
        },
      });
      return {
        id: stored.id,
        organizationId,
        role,
        name: stored.name,
        email: stored.email,
      };
    }
    maker = await user(Role.HR_ADMIN);
    checker = await user(Role.HR_ADMIN);
    employeeUser = await user(Role.EMPLOYEE);
    specialist = await user(Role.PAYROLL_SPECIALIST);
    const run = await prisma.payrollRun.create({
      data: {
        organizationId,
        cutoffSequence: 'SECOND_CUTOFF',
        cutoffStartDate: new Date('2026-12-16'),
        cutoffEndDate: new Date('2026-12-31'),
        paymentDate: new Date('2026-12-31'),
        status: 'DISBURSED',
      },
    });
    const slip = await prisma.payslip.create({
      data: {
        payrollRunId: run.id,
        employeeId,
        basicPayCents: 1500000n,
        grossPayCents: 1500000n,
        totalDeductionsCents: 0n,
        netPayCents: 1500000n,
      },
    });
    slipId = slip.id;
    await caller(maker).compliance.recordPriorEmployerDeclaration({
      employeeId,
      taxYear,
      hasPriorEmployer: false,
      sourceReference: 'Synthetic declaration v1',
    });
    await caller(maker).compliance.recordMonthlyTaxRemittance({
      taxYear,
      month: 12,
      remittedCents: '0',
      documentReference: 'Synthetic December evidence',
    });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    if (!organizationId) return;
    await prisma.loanPayment.deleteMany({
      where: { loan: { employee: { organizationId } } },
    });
    await prisma.payslip.deleteMany({
      where: { payrollRun: { organizationId } },
    });
    await prisma.payrollRun.deleteMany({ where: { organizationId } });
    // Supersession links use RESTRICT: remove newest versions first.
    for (const model of [
      prisma.priorEmployerDeclaration,
      prisma.previousEmployerIncome,
      prisma.monthlyTaxRemittanceEvidence,
      prisma.yearEndTaxSettlement,
      prisma.bir2316Issuance,
    ]) {
      const rows = await (
        model.findMany as typeof prisma.priorEmployerDeclaration.findMany
      )({ where: { organizationId }, orderBy: { version: 'desc' } });
      for (const row of rows)
        await (model.delete as typeof prisma.priorEmployerDeclaration.delete)({
          where: { id: row.id },
        });
    }
    await prisma.employee.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
  });
  afterAll(async () => prisma.$disconnect());

  it('keeps proposals ineffective until a second authenticated HR/admin approves', async () => {
    const request = await caller(
      maker,
    ).compliance.correctPriorEmployerDeclaration(proposal());
    expect(request.status).toBe('PENDING');
    expect(
      (await caller(checker).compliance.getTaxEvidence({ employeeId, taxYear }))
        .declaration?.version,
    ).toBe(1);
    await expect(
      caller(maker).compliance.reviewTaxCorrection(review(request.id)),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('different signed-in'),
    });
    const approved = await caller(checker).compliance.reviewTaxCorrection(
      review(request.id),
    );
    expect(approved).toMatchObject({
      status: 'APPROVED',
      requestedById: maker.id,
      reviewedById: checker.id,
    });
    const evidence = await caller(checker).compliance.getTaxEvidence({
      employeeId,
      taxYear,
    });
    expect(evidence.declaration).toMatchObject({
      version: 2,
      sourceReference: proposal().sourceReference,
      recordedById: maker.id,
      reviewedById: checker.id,
    });
    expect(evidence.supersededHistory.declarations).toHaveLength(1);
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: request.id, action: 'UPDATE' },
    });
    expect(log.userId).toBe(checker.id);
    await expect(
      caller(checker).compliance.reviewTaxCorrection(review(request.id)),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects caller-supplied reviewer identity and duplicate pending requests', async () => {
    await expect(
      caller(maker).compliance.correctPriorEmployerDeclaration({
        ...proposal(),
        reviewerId: checker.id,
      } as ReturnType<typeof proposal>),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await caller(maker).compliance.correctPriorEmployerDeclaration(proposal());
    await expect(
      caller(maker).compliance.correctPriorEmployerDeclaration(proposal()),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(
      await prisma.priorEmployerDeclaration.count({ where: { employeeId } }),
    ).toBe(1);
  });

  it.each([
    'EMPLOYEE',
    'PAYROLL_SPECIALIST',
    'FOREIGN',
    'INACTIVE',
    'DEMOTED',
  ] as const)('blocks unauthorized reviewer %s', async (kind) => {
    const request = await caller(
      maker,
    ).compliance.correctPriorEmployerDeclaration(proposal());
    let actor = checker;
    if (kind === 'EMPLOYEE') actor = employeeUser;
    if (kind === 'PAYROLL_SPECIALIST') actor = specialist;
    if (kind === 'FOREIGN')
      actor = { ...checker, organizationId: randomUUID() };
    if (kind === 'INACTIVE')
      await prisma.user.update({
        where: { id: checker.id },
        data: { isActive: false },
      });
    if (kind === 'DEMOTED')
      await prisma.user.update({
        where: { id: checker.id },
        data: { role: Role.EMPLOYEE },
      });
    await expect(
      caller(actor).compliance.reviewTaxCorrection(review(request.id)),
    ).rejects.toBeDefined();
    expect(
      (
        await prisma.taxEvidenceCorrection.findUniqueOrThrow({
          where: { id: request.id },
        })
      ).status,
    ).toBe('PENDING');
    expect(
      await prisma.priorEmployerDeclaration.count({ where: { employeeId } }),
    ).toBe(1);
  });

  it('isolates pending reads and rejects foreign targets without leaking evidence', async () => {
    const request = await caller(
      maker,
    ).compliance.correctPriorEmployerDeclaration(proposal());
    const foreign = { ...checker, organizationId: randomUUID() };
    expect(
      await caller(foreign).compliance.listTaxCorrections({ taxYear }),
    ).toEqual([]);
    await expect(
      caller(foreign).compliance.correctPriorEmployerDeclaration(proposal()),
    ).rejects.toBeDefined();
    expect(
      (await caller(checker).compliance.listTaxCorrections({ taxYear }))[0]?.id,
    ).toBe(request.id);
  });

  it('rejects without publishing evidence and permits a new proposal', async () => {
    const request = await caller(
      maker,
    ).compliance.correctPriorEmployerDeclaration(proposal());
    expect(
      (
        await caller(checker).compliance.reviewTaxCorrection(
          review(request.id, 'REJECT'),
        )
      ).status,
    ).toBe('REJECTED');
    expect(
      await prisma.priorEmployerDeclaration.count({ where: { employeeId } }),
    ).toBe(1);
    expect(
      await caller(checker).compliance.listTaxCorrections({ taxYear }),
    ).toEqual([]);
    await expect(
      caller(maker).compliance.correctPriorEmployerDeclaration(proposal()),
    ).resolves.toMatchObject({ status: 'PENDING' });
  });

  it('rejects approval against changed source evidence', async () => {
    const request = await caller(
      maker,
    ).compliance.correctPriorEmployerDeclaration(proposal());
    await prisma.priorEmployerDeclaration.update({
      where: { id: request.targetId },
      data: { sourceReference: 'Synthetic external legacy change' },
    });
    await expect(
      caller(checker).compliance.reviewTaxCorrection(review(request.id)),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('Evidence changed'),
    });
    expect(
      await prisma.priorEmployerDeclaration.count({ where: { employeeId } }),
    ).toBe(1);
  });

  it('publishes exactly once under concurrent approvals', async () => {
    const request = await caller(
      maker,
    ).compliance.correctPriorEmployerDeclaration(proposal());
    const results = await Promise.allSettled([
      caller(checker).compliance.reviewTaxCorrection(review(request.id)),
      caller(checker).compliance.reviewTaxCorrection(review(request.id)),
    ]);
    expect(
      results.filter((entry) => entry.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await prisma.priorEmployerDeclaration.count({ where: { employeeId } }),
    ).toBe(2);
    expect(
      await prisma.auditLog.count({
        where: { entityId: request.id, action: 'UPDATE' },
      }),
    ).toBe(1);
  });

  it.each(['SUBMIT', 'APPROVE', 'ISSUE', 'VOID'] as const)(
    'rolls back %s and its audit on audit failure',
    async (operation) => {
      const request =
        operation === 'APPROVE'
          ? await caller(maker).compliance.correctPriorEmployerDeclaration(
              proposal(),
            )
          : null;
      const frozen = operation === 'VOID' ? await issue() : null;
      const before = await prisma.auditLog.count({ where: { organizationId } });
      const original = audit.record.bind(audit);
      jest
        .spyOn(audit, 'record')
        .mockImplementationOnce(async (entry, database) => {
          await original(entry, database);
          throw new Error('Synthetic audit rollback');
        });
      const action =
        operation === 'SUBMIT'
          ? caller(maker).compliance.correctPriorEmployerDeclaration(proposal())
          : operation === 'APPROVE'
            ? caller(checker).compliance.reviewTaxCorrection(
                review(request?.id ?? ''),
              )
            : operation === 'VOID'
              ? caller(checker).compliance.voidBir2316Issuance({
                  employeeId,
                  taxYear,
                  voidReason: reason,
                })
              : issue();
      await expect(action).rejects.toBeDefined();
      expect(await prisma.auditLog.count({ where: { organizationId } })).toBe(
        before,
      );
      expect(
        await prisma.priorEmployerDeclaration.count({ where: { employeeId } }),
      ).toBe(1);
      expect(
        await prisma.bir2316Issuance.count({ where: { employeeId } }),
      ).toBe(frozen ? 1 : 0);
      if (frozen) expect((await issuance())?.status).toBe('ISSUED');
      if (request)
        expect(
          (
            await prisma.taxEvidenceCorrection.findUniqueOrThrow({
              where: { id: request.id },
            })
          ).status,
        ).toBe('PENDING');
      else
        expect(
          await prisma.taxEvidenceCorrection.count({
            where: { organizationId },
          }),
        ).toBe(0);
    },
  );

  it('publishes prior-income and remittance corrections only after signed-in review', async () => {
    const declaration = await caller(
      maker,
    ).compliance.correctPriorEmployerDeclaration({
      ...proposal(),
      hasPriorEmployer: true,
    });
    await caller(checker).compliance.reviewTaxCorrection(
      review(declaration.id),
    );
    const income = {
      employeeId,
      taxYear,
      employerName: 'Synthetic Previous',
      employerTin: '987654321',
      periodStart: '2026-01-01',
      periodEnd: '2026-02-28',
      grossCompensationCents: '100000',
      taxableCompensationCents: '100000',
      taxWithheldCents: '0',
      documentReference: 'Synthetic prior v1',
    };
    await caller(maker).compliance.recordPreviousEmployerIncome(income);
    const pending = await caller(
      maker,
    ).compliance.correctPreviousEmployerIncome({
      ...income,
      taxableCompensationCents: '90000',
      documentReference: 'Synthetic prior v2',
      correctionReason: reason,
    });
    expect(
      await prisma.previousEmployerIncome.count({ where: { employeeId } }),
    ).toBe(1);
    await caller(checker).compliance.reviewTaxCorrection(review(pending.id));
    expect(
      await prisma.previousEmployerIncome.findFirst({
        where: { employeeId },
        orderBy: { version: 'desc' },
      }),
    ).toMatchObject({
      version: 2,
      taxableCompensationCents: 90000n,
      reviewedById: checker.id,
    });
    const rem = await caller(maker).compliance.correctMonthlyTaxRemittance({
      taxYear,
      month: 12,
      remittedCents: '1',
      documentReference: 'Synthetic corrected remittance',
      correctionReason: reason,
    });
    await caller(checker).compliance.reviewTaxCorrection(review(rem.id));
    expect(
      await prisma.monthlyTaxRemittanceEvidence.findFirst({
        where: { organizationId },
        orderBy: { version: 'desc' },
      }),
    ).toMatchObject({
      version: 2,
      remittedCents: 1n,
      reviewedById: checker.id,
    });
  });

  it('blocks issuance while corrections are pending', async () => {
    await caller(maker).compliance.correctMonthlyTaxRemittance({
      taxYear,
      month: 12,
      remittedCents: '0',
      documentReference: 'Synthetic corrected reference',
      correctionReason: reason,
    });
    await expect(issue()).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('pending'),
    });
    expect(await prisma.bir2316Issuance.count({ where: { employeeId } })).toBe(
      0,
    );
  });

  it.each(['IDENTITY', 'PAYSLIP', 'EVIDENCE', 'REMITTANCE'] as const)(
    'flags %s changes without rewriting the frozen certificate',
    async (kind) => {
      const frozen = await issue();
      expect((await issuance())?.freshness).toBe('CURRENT');
      if (kind === 'IDENTITY')
        await prisma.employee.update({
          where: { id: employeeId },
          data: { tin: '234567890' },
        });
      if (kind === 'PAYSLIP')
        await prisma.payslip.update({
          where: { id: slipId },
          data: { basicPayCents: 1500001n, grossPayCents: 1500001n },
        });
      if (kind === 'EVIDENCE') {
        const pending = await caller(
          maker,
        ).compliance.correctPriorEmployerDeclaration(proposal());
        expect((await issuance())?.freshness).toBe('CURRENT');
        await caller(checker).compliance.reviewTaxCorrection(
          review(pending.id),
        );
      }
      if (kind === 'REMITTANCE') {
        const pending = await caller(
          maker,
        ).compliance.correctMonthlyTaxRemittance({
          taxYear,
          month: 12,
          remittedCents: '0',
          documentReference: 'Synthetic newer remittance reference',
          correctionReason: reason,
        });
        await caller(checker).compliance.reviewTaxCorrection(
          review(pending.id),
        );
      }
      expect(await issuance()).toMatchObject({
        freshness: 'STALE',
        snapshot: frozen.snapshot,
      });
      const queue = await caller(checker).compliance.listYearEndReconciliations(
        { taxYear },
      );
      expect(queue.staleIssuanceCount).toBe(1);
      expect(queue.rows[0]?.issuanceFreshness).toBe('STALE');
      await expect(issue()).rejects.toMatchObject({ code: 'CONFLICT' });
      await caller(checker).compliance.voidBir2316Issuance({
        employeeId,
        taxYear,
        voidReason: reason,
      });
      expect((await issuance())?.freshness).toBe('VOIDED');
      await expect(issue()).resolves.toMatchObject({
        version: 2,
        supersedesId: frozen.id,
      });
      expect((await issuance())?.freshness).toBe('CURRENT');
    },
  );

  it('marks legacy snapshots unverifiable rather than declaring them current', async () => {
    const frozen = await issue();
    await prisma.bir2316Issuance.update({
      where: { id: frozen.id },
      data: { snapshot: { grossCents: '1500000' } },
    });
    expect((await issuance())?.freshness).toBe('UNVERIFIABLE');
  });

  it('reviews settlement proposals against frozen payroll/evidence sources without mutating payslips', async () => {
    await prisma.payslip.update({
      where: { id: slipId },
      data: {
        withholdingTaxCents: 10000n,
        totalDeductionsCents: 10000n,
        netPayCents: 1490000n,
      },
    });
    await caller(specialist).compliance.recordYearEndSettlement({
      employeeId,
      taxYear,
      settlementDate: '2026-12-31',
      documentReference: 'Synthetic refund evidence',
    });
    await prisma.payslip.update({
      where: { id: slipId },
      data: {
        withholdingTaxCents: 20000n,
        totalDeductionsCents: 20000n,
        netPayCents: 1480000n,
      },
    });
    const before = await prisma.payslip.findUniqueOrThrow({
      where: { id: slipId },
    });
    const request = await caller(
      specialist,
    ).compliance.correctYearEndSettlement({
      employeeId,
      taxYear,
      settlementDate: '2026-12-31',
      documentReference: 'Synthetic refund re-attestation',
      correctionReason: reason,
    });
    const queued = await caller(checker).compliance.listTaxCorrections({
      taxYear,
    });
    expect(queued[0]?.settlementPreview).toMatchObject({
      computedDifferenceCents: '-20000',
      sourceChanged: false,
    });
    await caller(checker).compliance.reviewTaxCorrection(review(request.id));
    expect(
      await prisma.yearEndTaxSettlement.findFirst({
        where: { employeeId },
        orderBy: { version: 'desc' },
      }),
    ).toMatchObject({
      version: 2,
      settledCents: 20000n,
      recordedById: specialist.id,
      reviewedById: checker.id,
    });
    expect(
      await prisma.payslip.findUniqueOrThrow({ where: { id: slipId } }),
    ).toEqual(before);
  });

  it('rejects settlement approval if payroll changes after the proposal', async () => {
    await prisma.payslip.update({
      where: { id: slipId },
      data: { withholdingTaxCents: 10000n },
    });
    await caller(specialist).compliance.recordYearEndSettlement({
      employeeId,
      taxYear,
      settlementDate: '2026-12-31',
      documentReference: 'Synthetic initial refund',
    });
    await prisma.payslip.update({
      where: { id: slipId },
      data: { withholdingTaxCents: 20000n },
    });
    const request = await caller(
      specialist,
    ).compliance.correctYearEndSettlement({
      employeeId,
      taxYear,
      settlementDate: '2026-12-31',
      documentReference: 'Synthetic proposed refund',
      correctionReason: reason,
    });
    await prisma.payslip.update({
      where: { id: slipId },
      data: { withholdingTaxCents: 30000n },
    });
    expect(
      (await caller(checker).compliance.listTaxCorrections({ taxYear }))[0]
        ?.settlementPreview,
    ).toMatchObject({ sourceChanged: true });
    await expect(
      caller(checker).compliance.reviewTaxCorrection(review(request.id)),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(
      await prisma.yearEndTaxSettlement.count({ where: { employeeId } }),
    ).toBe(1);
  });

  it('allows only one decision under an approve/reject race', async () => {
    const request = await caller(
      maker,
    ).compliance.correctPriorEmployerDeclaration(proposal());
    const results = await Promise.allSettled([
      caller(checker).compliance.reviewTaxCorrection(review(request.id)),
      caller(checker).compliance.reviewTaxCorrection(
        review(request.id, 'REJECT'),
      ),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const final = await prisma.taxEvidenceCorrection.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(
      await prisma.priorEmployerDeclaration.count({ where: { employeeId } }),
    ).toBe(final.status === 'APPROVED' ? 2 : 1);
    expect(
      await prisma.auditLog.count({
        where: { entityId: request.id, action: 'UPDATE' },
      }),
    ).toBe(1);
  });

  it('creates one certificate and audit under concurrent issuance', async () => {
    const results = await Promise.allSettled([issue(), issue()]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(await prisma.bir2316Issuance.count({ where: { employeeId } })).toBe(
      1,
    );
    expect(
      await prisma.auditLog.count({
        where: { organizationId, entityType: 'Bir2316Issuance' },
      }),
    ).toBe(1);
  });

  it('refuses to publish a proposal from a subsequently deactivated maker', async () => {
    const request = await caller(
      maker,
    ).compliance.correctPriorEmployerDeclaration(proposal());
    await prisma.user.update({
      where: { id: maker.id },
      data: { isActive: false },
    });
    await expect(
      caller(checker).compliance.reviewTaxCorrection(review(request.id)),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      caller(checker).compliance.reviewTaxCorrection(
        review(request.id, 'REJECT'),
      ),
    ).resolves.toMatchObject({ status: 'REJECTED' });
  });
  const finalPayInput = () => ({
    employeeId,
    separationType: 'RESIGNATION' as const,
    exitDate: '2026-12-31',
    unpaidDaysWorked: 0,
    unusedLeaveDays: 0,
    authorizedLoanDeductionsCents: '0',
  });
  const finalPay = () =>
    caller(checker).employees.calculateFinalPay(finalPayInput());

  it('previews final pay from stored sources without assuming credits or writing payments', async () => {
    const auditCount = await prisma.auditLog.count({
      where: { organizationId },
    });
    expect(await finalPay()).toMatchObject({
      previewOnly: true,
      proratedThirteenthMonthCents: 125000n,
      monetizedLeaveCents: 0n,
      outstandingLoanDeductionsCents: 0n,
    });
    expect(await prisma.auditLog.count({ where: { organizationId } })).toBe(
      auditCount,
    );
    expect(await prisma.leaveBalance.count({ where: { employeeId } })).toBe(0);
    await expect(
      caller(checker).employees.calculateFinalPay({
        ...finalPayInput(),
        unusedLeaveDays: 1,
        priorMonetizedLeaveDaysInYear: 0,
      }),
    ).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
      message: expect.stringContaining('recorded SIL'),
    });
  });

  it('uses effective prior income and withholding in final pay without reclassifying it', async () => {
    const request = await caller(
      maker,
    ).compliance.correctPriorEmployerDeclaration({
      ...proposal(),
      hasPriorEmployer: true,
    });
    await caller(checker).compliance.reviewTaxCorrection(review(request.id));
    await prisma.previousEmployerIncome.create({
      data: {
        organizationId,
        employeeId,
        taxYear,
        employerName: 'Synthetic prior employer',
        employerTin: '987654321',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-01-31'),
        grossCompensationCents: 40000000n,
        taxableCompensationCents: 30000000n,
        taxWithheldCents: 100000n,
        documentReference: 'Synthetic prior income',
        recordedById: maker.id,
      },
    });
    expect(await finalPay()).toMatchObject({
      totalAnnualTaxableCompensationCents: 31500000n,
      annualTaxAdjustmentCents: 875000n,
      signedNetFinalPayCents: -750000n,
      unfundedDeductionsCents: 750000n,
      netFinalPayCents: 0n,
    });
  });

  it('does not re-propose a recorded year-end refund', async () => {
    await prisma.payslip.update({
      where: { id: slipId },
      data: {
        withholdingTaxCents: 10000n,
        totalDeductionsCents: 10000n,
        netPayCents: 1490000n,
      },
    });
    expect((await finalPay()).taxAdjustmentCents).toBe(-10000n);
    await caller(specialist).compliance.recordYearEndSettlement({
      employeeId,
      taxYear,
      settlementDate: '2026-12-31',
      documentReference: 'Synthetic refund already paid',
    });
    expect(await finalPay()).toMatchObject({
      annualTaxAdjustmentCents: -10000n,
      settledTaxAdjustmentCents: -10000n,
      taxAdjustmentCents: 0n,
      netFinalPayCents: 125000n,
    });
  });

  it('blocks final pay during pending correction and resumes after rejection', async () => {
    const pending = await caller(
      maker,
    ).compliance.correctPriorEmployerDeclaration(proposal());
    await expect(finalPay()).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
      message: expect.stringContaining('pending tax evidence'),
    });
    await caller(checker).compliance.reviewTaxCorrection(
      review(pending.id, 'REJECT'),
    );
    await expect(finalPay()).resolves.toMatchObject({ previewOnly: true });
  });

  it.each(['DRAFT', 'PROCESSING', 'AUDITED', 'APPROVED'] as const)(
    'does not mistake %s payroll reservations for paid wages/debt',
    async (status) => {
      const pending = await prisma.payrollRun.create({
        data: {
          organizationId,
          cutoffSequence: 'FIRST_CUTOFF',
          cutoffStartDate: new Date('2026-12-01'),
          cutoffEndDate: new Date('2026-12-15'),
          paymentDate: new Date('2026-12-15'),
          status,
          payslips: {
            create: {
              employeeId,
              basicPayCents: 100000n,
              grossPayCents: 100000n,
              totalDeductionsCents: 0n,
              netPayCents: 100000n,
            },
          },
        },
      });
      await expect(finalPay()).rejects.toMatchObject({
        code: 'UNPROCESSABLE_CONTENT',
        message: expect.stringContaining('non-disbursed payroll'),
      });
      await prisma.payrollRun.update({
        where: { id: pending.id },
        data: { status: 'CANCELLED' },
      });
      await expect(finalPay()).resolves.toMatchObject({
        proratedThirteenthMonthCents: 125000n,
      });
    },
  );

  it('proposes only authorized debt and monetization without debiting stored balances', async () => {
    await caller(maker).leaves.setCredits({
      employeeId,
      year: taxYear,
      leaveType: 'SIL',
      totalCredits: 5,
      expectedRevision: null,
      operationId: randomUUID(),
      sourceReference: 'Synthetic policy credits',
      reason,
    });
    const loan = await prisma.employeeLoan.create({
      data: {
        employeeId,
        loanType: 'COMPANY_CASH_ADVANCE',
        principalCents: 500000n,
        totalAmountCents: 500000n,
        amortizationCents: 10000n,
        balanceCents: 500000n,
        startDate: new Date('2026-01-01'),
        isActive: false,
      },
    });
    const balance = await prisma.leaveBalance.findFirstOrThrow({
      where: { employeeId, year: taxYear, leaveType: 'SIL' },
    });
    const before = await prisma.auditLog.count({ where: { organizationId } });
    expect(await finalPay()).toMatchObject({
      recordedLoanBalanceCents: 500000n,
      outstandingLoanDeductionsCents: 0n,
    });
    expect(
      await caller(checker).employees.calculateFinalPay({
        ...finalPayInput(),
        unusedLeaveDays: 2,
        priorMonetizedLeaveDaysInYear: 11.5,
        authorizedLoanDeductionsCents: '100000',
        loanAuthorizationReference: 'Synthetic written permission',
      }),
    ).toMatchObject({
      monetizedLeaveCents: 137930n,
      monetizedLeaveExemptCents: 34482n,
      monetizedLeaveTaxableCents: 103448n,
      outstandingLoanDeductionsCents: 100000n,
    });
    expect(
      await prisma.leaveBalance.findUniqueOrThrow({
        where: { id: balance.id },
      }),
    ).toEqual(balance);
    expect(
      await prisma.employeeLoan.findUniqueOrThrow({ where: { id: loan.id } }),
    ).toEqual(loan);
    expect(await prisma.loanPayment.count({ where: { loanId: loan.id } })).toBe(
      0,
    );
    expect(await prisma.auditLog.count({ where: { organizationId } })).toBe(
      before,
    );
  });

  it('calculates statutory anniversary boundaries only with explicit retirement review inputs', async () => {
    await prisma.employee.update({
      where: { id: employeeId },
      data: {
        hireDate: new Date('2021-12-31'),
        dateOfBirth: new Date('1966-12-31'),
      },
    });
    const input = {
      ...finalPayInput(),
      separationType: 'RETIREMENT' as const,
      retirementBenefitTaxTreatment: 'EXEMPT' as const,
      isRepeatRetirementClaim: false,
      retirementTaxSourceReference:
        'Synthetic reviewed retirement classification',
    };
    expect(
      await caller(checker).employees.calculateFinalPay(input),
    ).toMatchObject({ yearsOfService: 5, isSeparationPayTaxExempt: true });
    await prisma.employee.update({
      where: { id: employeeId },
      data: { dateOfBirth: new Date('1967-01-01') },
    });
    await expect(
      caller(checker).employees.calculateFinalPay(input),
    ).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
      message: expect.stringContaining('manual review'),
    });
  });
});
