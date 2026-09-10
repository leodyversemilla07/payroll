import { z } from 'zod';
import type { RouterContext } from './router-context';
import { assertEmployeeAccess, EMPLOYEE_RECORD_ROLES } from './router-context';

export function createEmployeesRouter(ctx: RouterContext) {
  const {
    trpc,
    protectedProcedure,
    employeeRecordProcedure,
    hrProcedure,
    employeesService,
    auditService,
  } = ctx;

  return trpc.router({
    list: employeeRecordProcedure.query(({ ctx }) =>
      employeesService.listEmployees(ctx.user.organizationId),
    ),

    getById: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(({ input, ctx }) => {
        assertEmployeeAccess(ctx.user, input.id, EMPLOYEE_RECORD_ROLES);
        return employeesService.getEmployeeById(
          input.id,
          ctx.user.organizationId,
        );
      }),

    create: hrProcedure
      .input(
        z.object({
          branchId: z.string().uuid().optional(),
          departmentId: z.string().uuid().optional(),
          firstName: z.string().trim().min(1).max(100),
          lastName: z.string().trim().min(1).max(100),
          email: z.string().email().max(320),
          contactNumber: z.string().max(50).optional(),
          residentialAddress: z.string().max(500).optional(),
          gender: z.string().max(50).optional(),
          civilStatus: z.string().max(50).optional(),
          dateOfBirth: z.string().date().optional(),
          tin: z.string().max(50).optional(),
          sssNo: z.string().max(50).optional(),
          philhealthNo: z.string().max(50).optional(),
          pagibigNo: z.string().max(50).optional(),
          hireDate: z.string().date().optional(),
          employmentType: z
            .enum([
              'REGULAR',
              'PROBATIONARY',
              'CONTRACTUAL',
              'PROJECT_BASED',
              'PART_TIME',
            ])
            .optional(),
          bankName: z.string().max(100).optional(),
          bankAccountNumber: z.string().max(100).optional(),
          bankAccountName: z.string().max(200).optional(),
          monthlyBasicRatePesos: z.number().positive().finite(),
          isTaxExempt: z.boolean().optional(),
          isManagerial: z.boolean().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const employee = await employeesService.registerEmployee({
          ...input,
          organizationId: ctx.user.organizationId,
        });
        await auditService.record({
          user: ctx.user,
          request: ctx.req,
          action: 'CREATE',
          entityType: 'Employee',
          entityId: employee.id,
          newValue: {
            employeeNumber: employee.employeeNumber,
            email: employee.email,
          },
        });
        return employee;
      }),

    calculateFinalPay: hrProcedure
      .input(
        z.object({
          employeeId: z.string().uuid(),
          separationType: z.enum([
            'RESIGNATION',
            'REDUNDANCY',
            'RETRENCHMENT',
            'CLOSURE_NON_BANKRUPT',
            'DISEASE',
            'RETIREMENT',
          ]),
          yearsOfService: z.number().nonnegative().optional(),
          unpaidDaysWorked: z.number().nonnegative().optional(),
          unusedLeaveDays: z.number().nonnegative().optional(),
          exitDate: z.string().date().optional(),
        }),
      )
      .query(({ input, ctx }) =>
        employeesService.calculateFinalPaySettlement({
          ...input,
          organizationId: ctx.user.organizationId,
          exitDate: input.exitDate ? new Date(input.exitDate) : undefined,
        }),
      ),
  });
}
