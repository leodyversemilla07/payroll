import { BadRequestException } from '@nestjs/common';
import { prisma } from '@workspace/db';
import {
  EmployeesService,
  type RegisterEmployeeInput,
} from './employees.service';

jest.mock('@workspace/db', () => ({
  prisma: {
    organization: { findUnique: jest.fn() },
    branch: { findFirst: jest.fn(), findMany: jest.fn() },
    department: { findFirst: jest.fn(), findMany: jest.fn() },
    employee: { create: jest.fn(), findFirst: jest.fn() },
  },
}));

const input: RegisterEmployeeInput = {
  organizationId: 'org-1',
  branchId: 'branch-1',
  departmentId: 'department-1',
  firstName: 'Ana',
  lastName: 'Santos',
  email: 'ana@test.invalid',
  contactNumber: '09170000000',
  residentialAddress: 'Makati City',
  gender: 'Female',
  civilStatus: 'Single',
  dateOfBirth: '1995-01-01',
  tin: '123-456-789-000',
  sssNo: '12-3456789-0',
  philhealthNo: '12-345678901-2',
  pagibigNo: '1234-5678-9012',
  hireDate: '2026-01-01',
  employmentType: 'PROBATIONARY',
  bankName: 'Test Bank',
  bankAccountNumber: '1234567890',
  bankAccountName: 'Ana Santos',
  monthlyBasicRatePesos: 30000.25,
  isTaxExempt: false,
  isManagerial: false,
};

describe('EmployeesService registration and details', () => {
  const service = new EmployeesService();
  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .mocked(prisma.organization.findUnique)
      .mockResolvedValue({ id: 'org-1' } as never);
    jest
      .mocked(prisma.branch.findFirst)
      .mockResolvedValue({ id: 'branch-1' } as never);
    jest
      .mocked(prisma.department.findFirst)
      .mockResolvedValue({ id: 'department-1' } as never);
    jest
      .mocked(prisma.employee.create)
      .mockResolvedValue({ id: 'employee-1' } as never);
  });

  it('lists only branch and department choices from the authenticated tenant', async () => {
    jest.mocked(prisma.branch.findMany).mockResolvedValue([]);
    jest.mocked(prisma.department.findMany).mockResolvedValue([]);
    expect(await service.getRegistrationOptions('org-1')).toEqual({
      branches: [],
      departments: [],
    });
    for (const model of [prisma.branch, prisma.department]) {
      expect(model.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      });
    }
  });

  it('stores explicitly supplied profile data and compensation without fictional defaults', async () => {
    await service.registerEmployee(input);
    expect(prisma.branch.findFirst).toHaveBeenCalledWith({
      where: { id: 'branch-1', organizationId: 'org-1' },
    });
    expect(prisma.department.findFirst).toHaveBeenCalledWith({
      where: { id: 'department-1', organizationId: 'org-1' },
    });
    expect(prisma.employee.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          branchId: 'branch-1',
          departmentId: 'department-1',
          employeeNumber: expect.stringMatching(/^EMP-\d{4}-[0-9a-f-]{36}$/),
          tin: input.tin,
          bankName: input.bankName,
          bankAccountNumber: input.bankAccountNumber,
          dateOfBirth: new Date(input.dateOfBirth),
          hireDate: new Date(input.hireDate),
          compensation: {
            create: {
              basicRateMonthlyCents: 3000025n,
              basicRateDailyCents: (3000025n * 12n) / 261n,
              basicRateHourlyCents: (3000025n * 12n) / 261n / 8n,
              isTaxExempt: false,
            },
          },
        }),
      }),
    );
  });

  it.each(['branch', 'department'] as const)(
    'rejects a missing or foreign %s instead of silently choosing a default',
    async (model) => {
      jest.mocked(prisma[model].findFirst).mockResolvedValue(null);
      await expect(service.registerEmployee(input)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.employee.create).not.toHaveBeenCalled();
    },
  );

  it('does not reuse a count-based reference for concurrent registrations', async () => {
    await Promise.all([
      service.registerEmployee(input),
      service.registerEmployee({ ...input, email: 'other@test.invalid' }),
    ]);
    const numbers = jest
      .mocked(prisma.employee.create)
      .mock.calls.map(([args]) => args.data.employeeNumber);
    expect(new Set(numbers).size).toBe(2);
  });

  it('scopes detail retrieval to the tenant and returns null for an inaccessible record', async () => {
    jest.mocked(prisma.employee.findFirst).mockResolvedValue(null);
    expect(
      await service.getEmployeeById('employee-foreign', 'org-1'),
    ).toBeNull();
    expect(prisma.employee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'employee-foreign', organizationId: 'org-1' },
      }),
    );
  });
});
