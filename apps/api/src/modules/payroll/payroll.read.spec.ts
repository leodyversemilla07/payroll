import { prisma } from '@workspace/db';
import { PayrollService } from './payroll.service';

jest.mock('@workspace/db', () => ({
  prisma: {
    payrollRun: { findFirst: jest.fn() },
    payslip: { findMany: jest.fn(), findFirst: jest.fn() },
  },
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

  it('scopes getEmployeePayslips to employee, organization, and completed runs', async () => {
    const service = new PayrollService(
      {} as ConstructorParameters<typeof PayrollService>[0],
    );
    await service.getEmployeePayslips('emp-1', 'tenant-1');
    const query = jest.mocked(prisma.payslip.findMany).mock.calls[0]?.[0];
    expect(query?.where).toEqual({
      employeeId: 'emp-1',
      payrollRun: {
        organizationId: 'tenant-1',
        status: { in: ['APPROVED', 'DISBURSED'] },
      },
    });
    expect(query?.orderBy).toEqual({ payrollRun: { paymentDate: 'desc' } });
  });

  it('scopes getEmployeePayslipById to specific payslip, employee, and organization', async () => {
    const service = new PayrollService(
      {} as ConstructorParameters<typeof PayrollService>[0],
    );
    await service.getEmployeePayslipById('slip-1', 'emp-1', 'tenant-1');
    const query = jest.mocked(prisma.payslip.findFirst).mock.calls[0]?.[0];
    expect(query?.where).toEqual({
      id: 'slip-1',
      employeeId: 'emp-1',
      payrollRun: {
        organizationId: 'tenant-1',
        status: { in: ['APPROVED', 'DISBURSED'] },
      },
    });
  });
});
