import { TRPCError } from '@trpc/server';
import { prisma, Role } from '@workspace/db';
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

/**
 * Fail-closed department boundary for DEPARTMENT_MANAGER callers. Every other
 * role passes through untouched; managers may only act on records whose
 * owning employee sits in their managed department. Throws TRPCError directly
 * so callers must invoke it outside error-mapping wrappers (which would
 * convert it to INTERNAL_SERVER_ERROR).
 */
export async function assertManagerDepartmentScope(
  user: Pick<
    AuthenticatedUser,
    'id' | 'organizationId' | 'employeeId' | 'role'
  >,
  targetDepartmentId: string | null | undefined,
): Promise<void> {
  if (user.role !== Role.DEPARTMENT_MANAGER) return;
  const managerDepartmentId = await findDepartmentManagerDepartmentId(user);
  if (!managerDepartmentId || targetDepartmentId !== managerDepartmentId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        'You do not have permission to manage records outside your department',
    });
  }
}
