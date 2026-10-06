import { prisma } from '@workspace/db';
import { findDepartmentManagerDepartmentId } from './department-scope';

jest.mock('@workspace/db', () => ({
  prisma: {
    department: { findFirst: jest.fn() },
    employee: { findFirst: jest.fn() },
  },
}));

describe('findDepartmentManagerDepartmentId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves a department managed by the user or linked employee', async () => {
    (prisma.department.findFirst as jest.Mock).mockResolvedValue({
      id: 'department-1',
    });

    await expect(
      findDepartmentManagerDepartmentId({
        id: 'user-1',
        employeeId: 'employee-1',
        organizationId: 'org-1',
      }),
    ).resolves.toBe('department-1');
    expect(prisma.employee.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to the linked employee department', async () => {
    (prisma.department.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.employee.findFirst as jest.Mock).mockResolvedValue({
      departmentId: 'department-2',
    });

    await expect(
      findDepartmentManagerDepartmentId({
        id: 'user-1',
        employeeId: 'employee-1',
        organizationId: 'org-1',
      }),
    ).resolves.toBe('department-2');
  });

  it('returns null when the manager has no resolvable department', async () => {
    (prisma.department.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      findDepartmentManagerDepartmentId({
        id: 'user-1',
        employeeId: undefined,
        organizationId: 'org-1',
      }),
    ).resolves.toBeNull();
    expect(prisma.employee.findFirst).not.toHaveBeenCalled();
  });
});
