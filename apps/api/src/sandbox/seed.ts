import { Prisma, prisma } from '@workspace/db';
import {
  buildSandboxDataset,
  fixtureId,
  SANDBOX_EMPLOYEE_PREFIX,
  SANDBOX_SEED_VERSION,
  sandboxSeedOptions,
} from './fixtures';

export async function seedSandbox(env: NodeJS.ProcessEnv = process.env) {
  const options = sandboxSeedOptions(env);
  return prisma.$transaction(
    async (transaction) => {
      // This tenant marker and existing role-checked accounts deliberately make
      // the script unsuitable for an arbitrary development/production tenant.
      const organization = await transaction.organization.findUniqueOrThrow({
        where: { id: options.organizationId },
      });
      if (
        organization.name !== 'Payroll Browser Sandbox — Synthetic Records Only'
      ) {
        throw new Error(
          'Target organization is not the explicitly marked synthetic browser sandbox.',
        );
      }
      const admin = await transaction.user.findFirst({
        where: {
          organizationId: organization.id,
          email: 'admin@sandbox.test',
          role: 'SUPER_ADMIN',
          isActive: true,
        },
      });
      const maker = await transaction.user.findFirst({
        where: {
          organizationId: organization.id,
          email: 'payroll@sandbox.test',
          role: 'PAYROLL_SPECIALIST',
          isActive: true,
        },
      });
      if (!admin || !maker || admin.id === maker.id)
        throw new Error(
          'Existing sandbox administrator and separate payroll maker are required. No accounts will be modified.',
        );
      const markerId = fixtureId(organization.id, 'complete');
      const marker = await transaction.auditLog.findUnique({
        where: { id: markerId },
      });
      if (marker) {
        const stored = marker.newData as {
          employeeCount?: number;
          counts?: Prisma.JsonObject;
        } | null;
        if (stored?.employeeCount !== options.employeeCount)
          throw new Error(
            'This seed version was already applied with a different employee count. Existing fixtures will not be overwritten.',
          );
        return { alreadySeeded: true, counts: stored.counts };
      }
      if (
        await transaction.employee.count({
          where: {
            organizationId: organization.id,
            employeeNumber: { startsWith: SANDBOX_EMPLOYEE_PREFIX },
          },
        })
      ) {
        throw new Error(
          'Seed-owned employees exist without a completion marker. Refusing to overwrite partial or changed data.',
        );
      }
      const data = buildSandboxDataset({
        ...options,
        adminId: admin.id,
        adminEmail: admin.email,
        makerId: maker.id,
      });
      await transaction.branch.createMany({ data: data.branches });
      await transaction.department.createMany({ data: data.departments });
      await transaction.employee.createMany({ data: data.employees });
      await transaction.compensation.createMany({ data: data.compensations });
      await transaction.employeeAllowance.createMany({ data: data.allowances });
      // Bounded batches avoid PostgreSQL bind-parameter and payload limits.
      for (let offset = 0; offset < data.attendance.length; offset += 500) {
        await transaction.dailyTimeRecord.createMany({
          data: data.attendance.slice(offset, offset + 500),
        });
      }
      await transaction.leaveBalance.createMany({ data: data.balances });
      await transaction.leaveCreditChange.createMany({
        data: data.creditChanges,
      });
      await transaction.leaveRequest.createMany({ data: data.leaves });
      await transaction.overtimeRequest.createMany({ data: data.overtime });
      await transaction.employeeLoan.createMany({ data: data.loans });
      await transaction.payrollRun.createMany({ data: data.runs });
      for (let offset = 0; offset < data.payslips.length; offset += 200) {
        await transaction.payslip.createMany({
          data: data.payslips.slice(offset, offset + 200),
        });
      }
      await transaction.loanPayment.createMany({ data: data.payments });
      await transaction.priorEmployerDeclaration.createMany({
        data: data.declarations,
      });
      await transaction.monthlyTaxRemittanceEvidence.createMany({
        data: data.remittances,
      });
      await transaction.auditLog.createMany({ data: data.audits });
      const counts = Object.fromEntries(
        Object.entries(data).map(([key, rows]) => [key, rows.length]),
      );
      // Completion marker is committed atomically with the entire dataset. A
      // rerun is a no-op, even if users subsequently edit or cancel fixtures.
      await transaction.auditLog.create({
        data: {
          id: markerId,
          organizationId: organization.id,
          userId: admin.id,
          userEmail: admin.email,
          action: 'SANDBOX_SEED_COMPLETE',
          entityType: 'SandboxDataset',
          entityId: markerId,
          newData: {
            synthetic: true,
            seedVersion: SANDBOX_SEED_VERSION,
            employeeCount: options.employeeCount,
            counts,
            noBankPaymentSent: true,
          },
        },
      });
      return { alreadySeeded: false, counts };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10000,
      timeout: 180000,
    },
  );
}

if (require.main === module) {
  seedSandbox()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
