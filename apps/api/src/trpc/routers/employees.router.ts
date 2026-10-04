import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import { Prisma, prisma, Role } from '@workspace/db';
import { z } from 'zod';
import { finalPayPreviewSchema } from '../../modules/employees/final-pay.inputs';
import type { RouterContext } from './router-context';
import { EMPLOYEE_RECORD_ROLES } from './router-context';

export function createEmployeesRouter(ctx: RouterContext) {
  const {
    trpc,
    protectedProcedure,
    hrProcedure,
    staffProcedure,
    employeesService,
    auditService,
  } = ctx;

  return trpc.router({
    list: staffProcedure.query(async ({ ctx }) => {
      let departmentId: string | undefined;
      if (ctx.user.role === Role.DEPARTMENT_MANAGER) {
        const managed = await prisma.department.findFirst({
          where: {
            organizationId: ctx.user.organizationId,
            OR: [
              { managerId: ctx.user.id },
              ...(ctx.user.employeeId
                ? [{ managerId: ctx.user.employeeId }]
                : []),
            ],
          },
          select: { id: true },
        });
        if (managed) {
          departmentId = managed.id;
        } else if (ctx.user.employeeId) {
          const emp = await prisma.employee.findUnique({
            where: { id: ctx.user.employeeId },
            select: { departmentId: true },
          });
          departmentId = emp?.departmentId;
        }
        if (!departmentId) {
          return [];
        }
      }
      return departmentId
        ? employeesService.listEmployees(ctx.user.organizationId, departmentId)
        : employeesService.listEmployees(ctx.user.organizationId);
    }),

    getMyProfile: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.employeeId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No employee profile is linked to your user account.',
        });
      }
      const employee = await employeesService.getEmployeeById(
        ctx.user.employeeId,
        ctx.user.organizationId,
      );
      if (!employee) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Employee record not found.',
        });
      }
      return employee;
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ input, ctx }) => {
        const isOwn = Boolean(
          ctx.user.employeeId && ctx.user.employeeId === input.id,
        );
        if (
          !isOwn &&
          !(EMPLOYEE_RECORD_ROLES as readonly Role[]).includes(ctx.user.role)
        ) {
          if (ctx.user.role === Role.DEPARTMENT_MANAGER) {
            const target = await prisma.employee.findFirst({
              where: { id: input.id, organizationId: ctx.user.organizationId },
              select: { departmentId: true },
            });
            if (!target) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Employee not found',
              });
            }
            let managerDeptId: string | undefined;
            const managed = await prisma.department.findFirst({
              where: {
                organizationId: ctx.user.organizationId,
                OR: [
                  { managerId: ctx.user.id },
                  ...(ctx.user.employeeId
                    ? [{ managerId: ctx.user.employeeId }]
                    : []),
                ],
              },
              select: { id: true },
            });
            if (managed) {
              managerDeptId = managed.id;
            } else if (ctx.user.employeeId) {
              const emp = await prisma.employee.findUnique({
                where: { id: ctx.user.employeeId },
                select: { departmentId: true },
              });
              managerDeptId = emp?.departmentId;
            }
            if (!managerDeptId || target.departmentId !== managerDeptId) {
              throw new TRPCError({
                code: 'FORBIDDEN',
                message:
                  'You do not have permission to access employees outside your department',
              });
            }
          } else {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message:
                'You do not have permission to access this employee record',
            });
          }
        }
        return employeesService.getEmployeeById(
          input.id,
          ctx.user.organizationId,
        );
      }),

    getRegistrationOptions: hrProcedure.query(({ ctx }) =>
      employeesService.getRegistrationOptions(ctx.user.organizationId),
    ),

    create: hrProcedure
      .input(
        z
          .object({
            branchId: z.string().uuid(),
            departmentId: z.string().uuid(),
            firstName: z.string().trim().min(1).max(100),
            lastName: z.string().trim().min(1).max(100),
            email: z.string().trim().email().max(320),
            contactNumber: z.string().trim().min(1).max(50),
            residentialAddress: z.string().trim().min(1).max(500),
            gender: z.string().trim().min(1).max(50),
            civilStatus: z.string().trim().min(1).max(50),
            dateOfBirth: z.string().date(),
            tin: z.string().trim().min(1).max(50),
            sssNo: z.string().trim().min(1).max(50),
            philhealthNo: z.string().trim().min(1).max(50),
            pagibigNo: z.string().trim().min(1).max(50),
            hireDate: z.string().date(),
            employmentType: z.enum([
              'REGULAR',
              'PROBATIONARY',
              'CONTRACTUAL',
              'PROJECT_BASED',
              'PART_TIME',
            ]),
            bankName: z.string().trim().min(1).max(100),
            bankAccountNumber: z.string().trim().min(1).max(100),
            bankAccountName: z.string().trim().min(1).max(200),
            payBasis: z.enum(['MONTHLY', 'DAILY', 'HOURLY']).default('MONTHLY'),
            monthlyBasicRatePesos: z
              .number()
              .positive()
              .finite()
              .max(Number.MAX_SAFE_INTEGER / 100)
              .multipleOf(0.01)
              .optional(),
            dailyBasicRatePesos: z
              .number()
              .positive()
              .finite()
              .max(Number.MAX_SAFE_INTEGER / 100)
              .multipleOf(0.01)
              .optional(),
            hourlyBasicRatePesos: z
              .number()
              .positive()
              .finite()
              .max(Number.MAX_SAFE_INTEGER / 100)
              .multipleOf(0.01)
              .optional(),
            isTaxExempt: z.boolean().optional(),
            isManagerial: z.boolean().optional(),
          })
          .superRefine((input, context) => {
            if (
              input.payBasis === 'MONTHLY' &&
              input.monthlyBasicRatePesos === undefined
            ) {
              context.addIssue({
                code: 'custom',
                path: ['monthlyBasicRatePesos'],
                message: 'Monthly basic rate is required for monthly pay basis',
              });
            }
            if (
              input.payBasis === 'DAILY' &&
              input.dailyBasicRatePesos === undefined &&
              input.monthlyBasicRatePesos === undefined
            ) {
              context.addIssue({
                code: 'custom',
                path: ['dailyBasicRatePesos'],
                message: 'Daily basic rate is required for daily pay basis',
              });
            }
            if (
              input.payBasis === 'HOURLY' &&
              input.hourlyBasicRatePesos === undefined &&
              input.monthlyBasicRatePesos === undefined
            ) {
              context.addIssue({
                code: 'custom',
                path: ['hourlyBasicRatePesos'],
                message: 'Hourly basic rate is required for hourly pay basis',
              });
            }
            if (input.dateOfBirth > new Date().toISOString().slice(0, 10)) {
              context.addIssue({
                code: 'custom',
                path: ['dateOfBirth'],
                message: 'Date of birth cannot be in the future',
              });
            }
            if (input.hireDate < input.dateOfBirth) {
              context.addIssue({
                code: 'custom',
                path: ['hireDate'],
                message: 'Hire date cannot precede date of birth',
              });
            }
          }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          // Employee + compensation + provenance must commit or roll back together.
          return await prisma.$transaction(async (transaction) => {
            const employee = await employeesService.registerEmployee(
              {
                ...input,
                organizationId: ctx.user.organizationId,
              },
              transaction,
            );
            await auditService.record(
              {
                user: ctx.user,
                request: ctx.req,
                action: 'CREATE',
                entityType: 'Employee',
                entityId: employee.id,
                newValue: {
                  employeeNumber: employee.employeeNumber,
                  email: employee.email,
                },
              },
              transaction,
            );
            return employee;
          });
        } catch (error) {
          if (error instanceof BadRequestException) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: error.message,
              cause: error,
            });
          }
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            throw new TRPCError({
              code: 'CONFLICT',
              message:
                'An employee record already exists. Check the email and retry.',
              cause: error,
            });
          }
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Employee creation failed. Please retry.',
            cause: error,
          });
        }
      }),

    update: hrProcedure
      .input(
        z
          .object({
            id: z.string().uuid(),
            branchId: z.string().uuid().optional(),
            departmentId: z.string().uuid().optional(),
            firstName: z.string().trim().min(1).max(100).optional(),
            middleName: z.string().trim().max(100).nullable().optional(),
            lastName: z.string().trim().min(1).max(100).optional(),
            suffix: z.string().trim().max(20).nullable().optional(),
            email: z.string().trim().email().max(320).optional(),
            contactNumber: z.string().trim().min(1).max(50).optional(),
            residentialAddress: z.string().trim().min(1).max(500).optional(),
            gender: z.string().trim().min(1).max(50).optional(),
            civilStatus: z.string().trim().min(1).max(50).optional(),
            dateOfBirth: z.string().date().optional(),
            tin: z.string().trim().min(1).max(50).optional(),
            sssNo: z.string().trim().min(1).max(50).optional(),
            philhealthNo: z.string().trim().min(1).max(50).optional(),
            pagibigNo: z.string().trim().min(1).max(50).optional(),
            hireDate: z.string().date().optional(),
            regularizationDate: z.string().date().nullable().optional(),
            resignationDate: z.string().date().nullable().optional(),
            employmentType: z
              .enum([
                'REGULAR',
                'PROBATIONARY',
                'CONTRACTUAL',
                'PROJECT_BASED',
                'PART_TIME',
              ])
              .optional(),
            employmentStatus: z
              .enum([
                'ACTIVE',
                'ON_LEAVE',
                'SUSPENDED',
                'RESIGNED',
                'TERMINATED',
                'RETIRED',
              ])
              .optional(),
            bankName: z.string().trim().min(1).max(100).optional(),
            bankAccountNumber: z.string().trim().min(1).max(100).optional(),
            bankAccountName: z.string().trim().min(1).max(200).optional(),
            payBasis: z.enum(['MONTHLY', 'DAILY', 'HOURLY']).optional(),
            monthlyBasicRatePesos: z
              .number()
              .positive()
              .finite()
              .max(Number.MAX_SAFE_INTEGER / 100)
              .multipleOf(0.01)
              .optional(),
            dailyBasicRatePesos: z
              .number()
              .positive()
              .finite()
              .max(Number.MAX_SAFE_INTEGER / 100)
              .multipleOf(0.01)
              .optional(),
            hourlyBasicRatePesos: z
              .number()
              .positive()
              .finite()
              .max(Number.MAX_SAFE_INTEGER / 100)
              .multipleOf(0.01)
              .optional(),
            isTaxExempt: z.boolean().optional(),
            isManagerial: z.boolean().optional(),
          })
          .superRefine((input, context) => {
            if (
              input.dateOfBirth &&
              input.dateOfBirth > new Date().toISOString().slice(0, 10)
            ) {
              context.addIssue({
                code: 'custom',
                path: ['dateOfBirth'],
                message: 'Date of birth cannot be in the future',
              });
            }
            if (
              input.hireDate &&
              input.dateOfBirth &&
              input.hireDate < input.dateOfBirth
            ) {
              context.addIssue({
                code: 'custom',
                path: ['hireDate'],
                message: 'Hire date cannot precede date of birth',
              });
            }
            if (
              input.regularizationDate &&
              input.hireDate &&
              input.regularizationDate < input.hireDate
            ) {
              context.addIssue({
                code: 'custom',
                path: ['regularizationDate'],
                message: 'Regularization date cannot precede hire date',
              });
            }
            if (
              input.resignationDate &&
              input.hireDate &&
              input.resignationDate < input.hireDate
            ) {
              context.addIssue({
                code: 'custom',
                path: ['resignationDate'],
                message: 'Resignation date cannot precede hire date',
              });
            }
          }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          return await prisma.$transaction(async (transaction) => {
            const { previous, current } = await employeesService.updateEmployee(
              {
                ...input,
                organizationId: ctx.user.organizationId,
              },
              transaction,
            );
            await auditService.record(
              {
                user: ctx.user,
                request: ctx.req,
                action: 'UPDATE',
                entityType: 'Employee',
                entityId: current.id,
                previousValue: {
                  employeeNumber: previous.employeeNumber,
                  email: previous.email,
                  employmentStatus: previous.employmentStatus,
                  payBasis: previous.payBasis,
                  branchId: previous.branchId,
                  departmentId: previous.departmentId,
                },
                newValue: {
                  employeeNumber: current.employeeNumber,
                  email: current.email,
                  employmentStatus: current.employmentStatus,
                  payBasis: current.payBasis,
                  branchId: current.branchId,
                  departmentId: current.departmentId,
                },
              },
              transaction,
            );
            return current;
          });
        } catch (error) {
          if (
            error instanceof BadRequestException ||
            error instanceof NotFoundException
          ) {
            throw new TRPCError({
              code:
                error instanceof NotFoundException
                  ? 'NOT_FOUND'
                  : 'BAD_REQUEST',
              message: error.message,
              cause: error,
            });
          }
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'An employee record already exists with this email.',
              cause: error,
            });
          }
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Employee update failed. Please retry.',
            cause: error,
          });
        }
      }),

    calculateFinalPay: hrProcedure
      .input(finalPayPreviewSchema)
      .query(async ({ input, ctx }) => {
        try {
          return await employeesService.calculateFinalPaySettlement({
            ...input,
            organizationId: ctx.user.organizationId,
            exitDate: new Date(input.exitDate),
          });
        } catch (error) {
          if (
            error instanceof BadRequestException ||
            error instanceof NotFoundException ||
            error instanceof UnprocessableEntityException
          ) {
            throw new TRPCError({
              code:
                error instanceof NotFoundException
                  ? 'NOT_FOUND'
                  : error instanceof BadRequestException
                    ? 'BAD_REQUEST'
                    : 'UNPROCESSABLE_CONTENT',
              message: error.message,
              cause: error,
            });
          }
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Final-pay preview failed. Please retry.',
            cause: error,
          });
        }
      }),
  });
}
