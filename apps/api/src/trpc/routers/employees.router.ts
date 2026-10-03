import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import { Prisma, prisma } from '@workspace/db';
import { z } from 'zod';
import { finalPayPreviewSchema } from '../../modules/employees/final-pay.inputs';
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
            monthlyBasicRatePesos: z
              .number()
              .positive()
              .finite()
              .max(Number.MAX_SAFE_INTEGER / 100)
              .multipleOf(0.01),
            isTaxExempt: z.boolean().optional(),
            isManagerial: z.boolean().optional(),
          })
          .superRefine((input, context) => {
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
