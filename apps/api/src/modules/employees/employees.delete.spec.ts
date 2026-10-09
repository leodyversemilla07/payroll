import { BadRequestException, NotFoundException } from '@nestjs/common';
import { prisma } from '@workspace/db';
import { EmployeesService } from './employees.service';

jest.mock('@workspace/db', () => ({
  prisma: {
    employee: { findFirst: jest.fn(), delete: jest.fn() },
    payslip: { count: jest.fn() },
  },
}));

const existingEmployee = {
  id: 'employee-1',
  employeeNumber: 'EMP-2026-0001',
  firstName: 'Ana',
  lastName: 'Santos',
  email: 'ana@test.invalid',
  user: null,
};

describe('EmployeesService deleteEmployee', () => {
  const service = new EmployeesService();

  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .mocked(prisma.employee.findFirst)
      .mockResolvedValue(existingEmployee as never);
    jest.mocked(prisma.payslip.count).mockResolvedValue(0);
    jest
      .mocked(prisma.employee.delete)
      .mockResolvedValue(existingEmployee as never);
  });

  it('throws NotFoundException when the employee is not found in the organization', async () => {
    jest.mocked(prisma.employee.findFirst).mockResolvedValue(null);

    await expect(
      service.deleteEmployee('org-1', 'employee-999'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.employee.delete).not.toHaveBeenCalled();
  });

  it('refuses employees linked to a login account', async () => {
    jest.mocked(prisma.employee.findFirst).mockResolvedValue({
      ...existingEmployee,
      user: { id: 'user-1' },
    } as never);

    await expect(
      service.deleteEmployee('org-1', 'employee-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.employee.delete).not.toHaveBeenCalled();
  });

  it('refuses employees with generated payslips', async () => {
    jest.mocked(prisma.payslip.count).mockResolvedValue(2);

    await expect(
      service.deleteEmployee('org-1', 'employee-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.employee.delete).not.toHaveBeenCalled();
  });

  it('deletes a bare record and returns the summary', async () => {
    const result = await service.deleteEmployee('org-1', 'employee-1');

    expect(prisma.employee.delete).toHaveBeenCalledWith({
      where: { id: 'employee-1' },
    });
    expect(result).toEqual({
      id: 'employee-1',
      employeeNumber: 'EMP-2026-0001',
      firstName: 'Ana',
      lastName: 'Santos',
      email: 'ana@test.invalid',
    });
  });
});
