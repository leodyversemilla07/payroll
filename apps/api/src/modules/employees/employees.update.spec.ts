import { BadRequestException, NotFoundException } from '@nestjs/common';
import { prisma } from '@workspace/db';
import {
  EmployeesService,
  type UpdateEmployeeInput,
} from './employees.service';

jest.mock('@workspace/db', () => ({
  prisma: {
    branch: { findFirst: jest.fn() },
    department: { findFirst: jest.fn() },
    employee: { findFirst: jest.fn(), update: jest.fn() },
    compensation: { upsert: jest.fn(), update: jest.fn() },
  },
}));

const existingEmployee = {
  id: 'employee-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  departmentId: 'dept-1',
  employeeNumber: 'EMP-2026-0001',
  firstName: 'Ana',
  middleName: null,
  lastName: 'Santos',
  suffix: null,
  email: 'ana@test.invalid',
  contactNumber: '09170000000',
  residentialAddress: 'Makati City',
  gender: 'Female',
  civilStatus: 'Single',
  dateOfBirth: new Date('1995-01-01'),
  tin: '123-456-789-000',
  sssNo: '12-3456789-0',
  philhealthNo: '12-345678901-2',
  pagibigNo: '1234-5678-9012',
  hireDate: new Date('2026-01-01'),
  regularizationDate: null,
  resignationDate: null,
  employmentType: 'PROBATIONARY',
  employmentStatus: 'ACTIVE',
  payBasis: 'MONTHLY',
  bankName: 'Test Bank',
  bankAccountNumber: '1234567890',
  bankAccountName: 'Ana Santos',
  isManagerial: false,
  compensation: {
    id: 'comp-1',
    employeeId: 'employee-1',
    basicRateMonthlyCents: 3000000n,
    basicRateDailyCents: 1379310n,
    basicRateHourlyCents: 172413n,
    isTaxExempt: false,
  },
};

describe('EmployeesService updateEmployee', () => {
  const service = new EmployeesService();

  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .mocked(prisma.employee.findFirst)
      .mockResolvedValue(existingEmployee as never);
    jest
      .mocked(prisma.branch.findFirst)
      .mockResolvedValue({ id: 'branch-2' } as never);
    jest
      .mocked(prisma.department.findFirst)
      .mockResolvedValue({ id: 'dept-2' } as never);
    jest
      .mocked(prisma.compensation.upsert)
      .mockResolvedValue({ id: 'comp-1' } as never);
    jest
      .mocked(prisma.employee.update)
      .mockResolvedValue({ ...existingEmployee, firstName: 'Maria' } as never);
  });

  it('throws NotFoundException when the employee is not found in the organization', async () => {
    jest.mocked(prisma.employee.findFirst).mockResolvedValue(null);

    await expect(
      service.updateEmployee({
        id: 'employee-999',
        organizationId: 'org-1',
        firstName: 'Maria',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('validates that a newly assigned branch belongs to the organization', async () => {
    jest.mocked(prisma.branch.findFirst).mockResolvedValue(null);

    await expect(
      service.updateEmployee({
        id: 'employee-1',
        organizationId: 'org-1',
        branchId: 'branch-foreign',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates that a newly assigned department belongs to the organization', async () => {
    jest.mocked(prisma.department.findFirst).mockResolvedValue(null);

    await expect(
      service.updateEmployee({
        id: 'employee-1',
        organizationId: 'org-1',
        departmentId: 'dept-foreign',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects email change if another employee in the organization already has it', async () => {
    jest
      .mocked(prisma.employee.findFirst)
      .mockResolvedValueOnce(existingEmployee as never) // first call: lookup existing
      .mockResolvedValueOnce({ id: 'other-emp' } as never); // second call: email conflict check

    await expect(
      service.updateEmployee({
        id: 'employee-1',
        organizationId: 'org-1',
        email: 'taken@test.invalid',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects future date of birth', async () => {
    await expect(
      service.updateEmployee({
        id: 'employee-1',
        organizationId: 'org-1',
        dateOfBirth: '2099-01-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects hire date preceding date of birth', async () => {
    await expect(
      service.updateEmployee({
        id: 'employee-1',
        organizationId: 'org-1',
        hireDate: '1990-01-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recomputes daily and hourly rates when monthlyBasicRatePesos is updated', async () => {
    const input: UpdateEmployeeInput = {
      id: 'employee-1',
      organizationId: 'org-1',
      monthlyBasicRatePesos: 50000,
    };

    await service.updateEmployee(input);

    const expectedMonthly = 5000000n;
    const expectedDaily = (expectedMonthly * 12n) / 261n;
    const expectedHourly = expectedDaily / 8n;

    expect(prisma.compensation.upsert).toHaveBeenCalledWith({
      where: { employeeId: 'employee-1' },
      create: {
        employeeId: 'employee-1',
        basicRateMonthlyCents: expectedMonthly,
        basicRateDailyCents: expectedDaily,
        basicRateHourlyCents: expectedHourly,
        isTaxExempt: false,
      },
      update: {
        basicRateMonthlyCents: expectedMonthly,
        basicRateDailyCents: expectedDaily,
        basicRateHourlyCents: expectedHourly,
        isTaxExempt: false,
      },
    });
  });

  it('recomputes compensation when payBasis is changed to DAILY with dailyBasicRatePesos', async () => {
    const input: UpdateEmployeeInput = {
      id: 'employee-1',
      organizationId: 'org-1',
      payBasis: 'DAILY',
      dailyBasicRatePesos: 1000,
    };

    await service.updateEmployee(input);

    const expectedDaily = 100000n;
    const expectedMonthly = (expectedDaily * 261n) / 12n;
    const expectedHourly = expectedDaily / 8n;

    expect(prisma.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'employee-1' },
        data: expect.objectContaining({
          payBasis: 'DAILY',
        }),
      }),
    );
    expect(prisma.compensation.upsert).toHaveBeenCalledWith({
      where: { employeeId: 'employee-1' },
      create: {
        employeeId: 'employee-1',
        basicRateMonthlyCents: expectedMonthly,
        basicRateDailyCents: expectedDaily,
        basicRateHourlyCents: expectedHourly,
        isTaxExempt: false,
      },
      update: {
        basicRateMonthlyCents: expectedMonthly,
        basicRateDailyCents: expectedDaily,
        basicRateHourlyCents: expectedHourly,
        isTaxExempt: false,
      },
    });
  });

  it('recomputes compensation when payBasis is changed to HOURLY with hourlyBasicRatePesos', async () => {
    const input: UpdateEmployeeInput = {
      id: 'employee-1',
      organizationId: 'org-1',
      payBasis: 'HOURLY',
      hourlyBasicRatePesos: 200,
    };

    await service.updateEmployee(input);

    const expectedHourly = 20000n;
    const expectedDaily = 20000n * 8n;
    const expectedMonthly = (expectedDaily * 261n) / 12n;

    expect(prisma.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'employee-1' },
        data: expect.objectContaining({
          payBasis: 'HOURLY',
        }),
      }),
    );
    expect(prisma.compensation.upsert).toHaveBeenCalledWith({
      where: { employeeId: 'employee-1' },
      create: {
        employeeId: 'employee-1',
        basicRateMonthlyCents: expectedMonthly,
        basicRateDailyCents: expectedDaily,
        basicRateHourlyCents: expectedHourly,
        isTaxExempt: false,
      },
      update: {
        basicRateMonthlyCents: expectedMonthly,
        basicRateDailyCents: expectedDaily,
        basicRateHourlyCents: expectedHourly,
        isTaxExempt: false,
      },
    });
  });

  it('updates employee fields and returns previous and current states', async () => {
    const result = await service.updateEmployee({
      id: 'employee-1',
      organizationId: 'org-1',
      firstName: 'Maria',
      employmentStatus: 'RESIGNED',
      resignationDate: '2026-10-01',
    });

    expect(result.previous).toEqual(existingEmployee);
    expect(result.current.firstName).toBe('Maria');
    expect(prisma.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'employee-1' },
        data: expect.objectContaining({
          firstName: 'Maria',
          employmentStatus: 'RESIGNED',
          resignationDate: new Date('2026-10-01'),
        }),
      }),
    );
  });
});
