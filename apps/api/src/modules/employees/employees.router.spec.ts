import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, prisma, Role } from '@workspace/db';
import type { Request, Response } from 'express';
import type { AuthService } from '../../auth/auth.service';
import type { AuditService } from '../../infrastructure/audit/audit.service';
import type { EmployeesService } from '../../modules/employees/employees.service';
import type { LeavesService } from '../../modules/leaves/leaves.service';
import type { LoansService } from '../../modules/loans/loans.service';
import type { PayrollService } from '../../modules/payroll/payroll.service';
import type { TimekeepingService } from '../../modules/timekeeping/timekeeping.service';
import { createApiRouter } from '../../trpc/app.router';
import { type Context, TrpcService } from '../../trpc/trpc.service';

jest.mock('@workspace/db', () => ({
  ...jest.requireActual('@workspace/db'),
  prisma: { $transaction: jest.fn() },
}));

const input = {
  branchId: '11111111-1111-4111-8111-111111111111',
  departmentId: '22222222-2222-4222-8222-222222222222',
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
  bankName: 'Test Bank',
  bankAccountNumber: '1234567890',
  bankAccountName: 'Ana Santos',
  payBasis: 'MONTHLY' as const,
  monthlyBasicRatePesos: 30000.25,
  employmentType: 'PROBATIONARY' as const,
};

function context(role: Role | null, employeeId?: string): Context {
  return {
    req: {
      ip: '127.0.0.1',
      get: () => 'test',
      headers: {},
    } as unknown as Request,
    res: {} as Response,
    user: role
      ? {
          id: 'user-1',
          organizationId: 'org-1',
          name: 'HR',
          email: 'hr@test.invalid',
          role,
          employeeId,
        }
      : null,
  };
}

describe('employee registration tRPC workflow', () => {
  const registerEmployee = jest.fn();
  const updateEmployee = jest.fn();
  const deleteEmployee = jest.fn();
  const getRegistrationOptions = jest.fn();
  const listEmployees = jest.fn();
  const getEmployeeById = jest.fn();
  const record = jest.fn();
  const transaction = {} as Prisma.TransactionClient;
  const router = createApiRouter(
    new TrpcService(),
    {
      registerEmployee,
      updateEmployee,
      deleteEmployee,
      getRegistrationOptions,
      listEmployees,
      getEmployeeById,
    } as unknown as EmployeesService,
    {} as TimekeepingService,
    {} as PayrollService,
    {} as LoansService,
    {} as LeavesService,
    {} as AuthService,
    { record } as unknown as AuditService,
  );
  const employee = {
    id: 'employee-1',
    employeeNumber: 'EMP-test',
    email: input.email,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .mocked(prisma.$transaction)
      .mockImplementation(async (callback: unknown) =>
        (callback as (tx: Prisma.TransactionClient) => Promise<unknown>)(
          transaction,
        ),
      );
    registerEmployee.mockResolvedValue(employee);
    updateEmployee.mockResolvedValue({
      previous: {
        ...employee,
        branchId: input.branchId,
        departmentId: input.departmentId,
        employmentStatus: 'ACTIVE',
      },
      current: {
        ...employee,
        firstName: 'Maria',
        branchId: input.branchId,
        departmentId: input.departmentId,
        employmentStatus: 'RESIGNED',
      },
    });
    record.mockResolvedValue(undefined);
    getRegistrationOptions.mockResolvedValue({ branches: [], departments: [] });
  });

  it.each([
    null,
    Role.EMPLOYEE,
    Role.DEPARTMENT_MANAGER,
    Role.PAYROLL_SPECIALIST,
  ])('denies registration and HR choices to %s', async (role) => {
    const caller = router.createCaller(context(role));
    const code = role ? 'FORBIDDEN' : 'UNAUTHORIZED';
    await expect(caller.employees.create(input)).rejects.toMatchObject({
      code,
    });
    await expect(
      caller.employees.getRegistrationOptions(),
    ).rejects.toMatchObject({ code });
    expect(registerEmployee).not.toHaveBeenCalled();
    expect(getRegistrationOptions).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([Role.HR_ADMIN, Role.SUPER_ADMIN])(
    'derives tenant and audit actor from the %s session',
    async (role) => {
      const caller = router.createCaller(context(role));
      await caller.employees.getRegistrationOptions();
      expect(getRegistrationOptions).toHaveBeenCalledWith('org-1');
      await caller.employees.create({
        ...input,
        firstName: ' Ana ',
        email: ' ana@test.invalid ',
        organizationId: 'foreign-org',
      } as typeof input);
      expect(registerEmployee).toHaveBeenCalledWith(
        { ...input, organizationId: 'org-1' },
        transaction,
      );
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            id: 'user-1',
            organizationId: 'org-1',
          }),
          action: 'CREATE',
          entityType: 'Employee',
          entityId: employee.id,
          newValue: {
            employeeNumber: employee.employeeNumber,
            email: input.email,
          },
        }),
        transaction,
      );
    },
  );

  it.each([
    { monthlyBasicRatePesos: 0 },
    { monthlyBasicRatePesos: -1 },
    { monthlyBasicRatePesos: 0.001 },
    { monthlyBasicRatePesos: 30000.123 },
    { monthlyBasicRatePesos: Number.MAX_SAFE_INTEGER },
    { tin: ' ' },
    { branchId: '' },
    { bankAccountNumber: '' },
    { dateOfBirth: '2100-01-01' },
    { hireDate: '1990-01-01' },
  ])('rejects invalid profile data before writing: %j', async (override) => {
    await expect(
      router
        .createCaller(context(Role.HR_ADMIN))
        .employees.create({ ...input, ...override }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('maps foreign organization choices to a safe validation error', async () => {
    registerEmployee.mockRejectedValue(
      new BadRequestException(
        'A branch belonging to the organization is required',
      ),
    );
    await expect(
      router.createCaller(context(Role.HR_ADMIN)).employees.create(input),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(record).not.toHaveBeenCalled();
  });

  it('maps uniqueness conflicts without exposing database internals', async () => {
    registerEmployee.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('private database details', {
        code: 'P2002',
        clientVersion: '6',
      }),
    );
    await expect(
      router.createCaller(context(Role.HR_ADMIN)).employees.create(input),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'An employee record already exists. Check the email and retry.',
    });
    expect(record).not.toHaveBeenCalled();
  });

  it('rejects the transactional workflow when audit persistence fails', async () => {
    record.mockRejectedValue(new Error('private audit details'));
    await expect(
      router.createCaller(context(Role.HR_ADMIN)).employees.create(input),
    ).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Employee creation failed. Please retry.',
    });
    expect(record).toHaveBeenCalledWith(expect.anything(), transaction);
  });

  describe('employee update tRPC workflow', () => {
    const updateInput = {
      id: '11111111-1111-4111-8111-111111111111',
      firstName: 'Maria',
      employmentStatus: 'RESIGNED' as const,
      monthlyBasicRatePesos: 45000,
    };

    it.each([
      null,
      Role.EMPLOYEE,
      Role.DEPARTMENT_MANAGER,
      Role.PAYROLL_SPECIALIST,
    ])('denies update to %s', async (role) => {
      const caller = router.createCaller(context(role));
      const code = role ? 'FORBIDDEN' : 'UNAUTHORIZED';
      await expect(caller.employees.update(updateInput)).rejects.toMatchObject({
        code,
      });
      expect(updateEmployee).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it.each([Role.HR_ADMIN, Role.SUPER_ADMIN])(
      'derives tenant and audit actor from the %s session on update',
      async (role) => {
        const caller = router.createCaller(context(role));
        await caller.employees.update(updateInput);
        expect(updateEmployee).toHaveBeenCalledWith(
          { ...updateInput, organizationId: 'org-1' },
          transaction,
        );
        expect(record).toHaveBeenCalledWith(
          expect.objectContaining({
            user: expect.objectContaining({
              id: 'user-1',
              organizationId: 'org-1',
            }),
            action: 'UPDATE',
            entityType: 'Employee',
            entityId: employee.id,
            previousValue: expect.objectContaining({
              employmentStatus: 'ACTIVE',
            }),
            newValue: expect.objectContaining({
              employmentStatus: 'RESIGNED',
            }),
          }),
          transaction,
        );
      },
    );

    it('rejects invalid update data before writing', async () => {
      await expect(
        router
          .createCaller(context(Role.HR_ADMIN))
          .employees.update({ ...updateInput, monthlyBasicRatePesos: -100 }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('maps employee not found to NOT_FOUND', async () => {
      updateEmployee.mockRejectedValue(
        new NotFoundException('Employee not found'),
      );
      await expect(
        router
          .createCaller(context(Role.HR_ADMIN))
          .employees.update(updateInput),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Employee not found',
      });
      expect(record).not.toHaveBeenCalled();
    });

    it('maps uniqueness conflicts without exposing database internals on update', async () => {
      updateEmployee.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('private database details', {
          code: 'P2002',
          clientVersion: '6',
        }),
      );
      await expect(
        router
          .createCaller(context(Role.HR_ADMIN))
          .employees.update(updateInput),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'An employee record already exists with this email.',
      });
      expect(record).not.toHaveBeenCalled();
    });
  });

  describe('getMyProfile', () => {
    it('returns the profile for the linked employee', async () => {
      const profile = {
        id: 'emp-123',
        firstName: 'Juan',
        lastName: 'Dela Cruz',
      };
      getEmployeeById.mockResolvedValue(profile);

      const result = await router
        .createCaller(context(Role.EMPLOYEE, 'emp-123'))
        .employees.getMyProfile();

      expect(getEmployeeById).toHaveBeenCalledWith('emp-123', 'org-1');
      expect(result).toEqual(profile);
    });

    it('throws NOT_FOUND when the user has no employeeId', async () => {
      await expect(
        router.createCaller(context(Role.EMPLOYEE)).employees.getMyProfile(),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'No employee profile is linked to your user account.',
      });
      expect(getEmployeeById).not.toHaveBeenCalled();
    });

    it('throws NOT_FOUND when the employee record is not found in the database', async () => {
      getEmployeeById.mockResolvedValue(null);

      await expect(
        router
          .createCaller(context(Role.EMPLOYEE, 'emp-missing'))
          .employees.getMyProfile(),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Employee record not found.',
      });
    });
  });

  describe('employee delete tRPC workflow', () => {
    const deleteInput = { id: '33333333-3333-4333-8333-333333333333' };
    const deleted = {
      id: deleteInput.id,
      employeeNumber: 'EMP-test',
      email: input.email,
    };

    it.each([
      null,
      Role.EMPLOYEE,
      Role.DEPARTMENT_MANAGER,
      Role.PAYROLL_SPECIALIST,
    ])('denies deletion to %s', async (role) => {
      const caller = router.createCaller(context(role));
      const code = role ? 'FORBIDDEN' : 'UNAUTHORIZED';
      await expect(caller.employees.delete(deleteInput)).rejects.toMatchObject({
        code,
      });
      expect(deleteEmployee).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it.each([Role.HR_ADMIN, Role.SUPER_ADMIN])(
      'deletes the employee and records audit for %s',
      async (role) => {
        deleteEmployee.mockResolvedValue(deleted);
        const caller = router.createCaller(context(role));
        const result = await caller.employees.delete(deleteInput);
        expect(deleteEmployee).toHaveBeenCalledWith(
          'org-1',
          deleteInput.id,
          transaction,
        );
        expect(record).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'DELETE',
            entityType: 'Employee',
            entityId: deleted.id,
            previousValue: {
              employeeNumber: deleted.employeeNumber,
              email: deleted.email,
            },
          }),
          transaction,
        );
        expect(result).toEqual(deleted);
      },
    );

    it('maps missing records to NOT_FOUND without auditing', async () => {
      deleteEmployee.mockRejectedValue(
        new NotFoundException('Employee not found'),
      );
      await expect(
        router
          .createCaller(context(Role.HR_ADMIN))
          .employees.delete(deleteInput),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(record).not.toHaveBeenCalled();
    });

    it('maps guarded records to BAD_REQUEST without auditing', async () => {
      deleteEmployee.mockRejectedValue(
        new BadRequestException(
          'This employee has payroll records and cannot be deleted.',
        ),
      );
      await expect(
        router
          .createCaller(context(Role.HR_ADMIN))
          .employees.delete(deleteInput),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(record).not.toHaveBeenCalled();
    });

    it('maps unexpected failures without exposing database internals', async () => {
      deleteEmployee.mockRejectedValue(new Error('private database details'));
      await expect(
        router
          .createCaller(context(Role.HR_ADMIN))
          .employees.delete(deleteInput),
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Employee deletion failed. Please retry.',
      });
      expect(record).not.toHaveBeenCalled();
    });
  });
});
