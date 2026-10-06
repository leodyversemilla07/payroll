import { prisma } from '@workspace/db';
import type { AuthenticatedUser } from '../../auth/auth.service';

export async function findDepartmentManagerDepartmentId(
  user: Pick<AuthenticatedUser, 'id' | 'organizationId' | 'employeeId'>,
): Promise<string | null> {
  const managedDepartment = await prisma.department.findFirst({
    where: {
      organizationId: user.organizationId,
      OR: [
        { managerId: user.id },
        ...(user.employeeId ? [{ managerId: user.employeeId }] : []),
      ],
    },
    select: { id: true },
  });
  if (managedDepartment) {
    return managedDepartment.id;
  }

  if (!user.employeeId) {
    return null;
  }

  const managerEmployee = await prisma.employee.findFirst({
    where: {
      id: user.employeeId,
      organizationId: user.organizationId,
    },
    select: { departmentId: true },
  });
  return managerEmployee?.departmentId ?? null;
}
