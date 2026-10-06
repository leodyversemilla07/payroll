import { prisma } from '@workspace/db';
import { EmployeesService } from './employees.service';

jest.mock('@workspace/db', () => ({
  prisma: {
    employee: {
      findMany: jest.fn(),
    },
  },
}));

describe('EmployeesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a minimized employee list projection without sensitive fields', async () => {
    const service = new EmployeesService();
    (prisma.employee.findMany as jest.Mock).mockResolvedValue([]);

    await service.listEmployees('org-1', 'department-1');

    expect(prisma.employee.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        departmentId: 'department-1',
      },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        middleName: true,
        lastName: true,
        suffix: true,
        email: true,
        employmentType: true,
        employmentStatus: true,
        department: {
          select: { id: true, name: true, code: true },
        },
        branch: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy: { lastName: 'asc' },
    });
  });
});
