import { prisma } from '@workspace/db';
import { PayrollService } from './payroll.service';

jest.mock('@workspace/db', () => ({
  prisma: { payrollRun: { findFirst: jest.fn() } },
}));

describe('payroll run detail projection', () => {
  it('scopes the run to the tenant and excludes PDF secrets and bank details', async () => {
    const service = new PayrollService(
      {} as ConstructorParameters<typeof PayrollService>[0],
    );
    await service.getPayrollRunDetails('run-1', 'tenant-1');
    const query = jest.mocked(prisma.payrollRun.findFirst).mock.calls[0]?.[0];
    expect(query?.where).toEqual({ id: 'run-1', organizationId: 'tenant-1' });
    expect(query?.select?.payslips).toBeDefined();
    const projection = JSON.stringify(query?.select);
    expect(projection).toContain('"netPayCents":true');
    expect(projection).not.toMatch(
      /pdfPasswordHash|pdfStoragePath|bankAccountNumber|dateOfBirth/,
    );
  });
});
