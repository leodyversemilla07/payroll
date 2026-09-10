import { ConflictException } from '@nestjs/common';
import {
  assertValidPayrollTransition,
  type PayrollRunAction,
} from './payroll.service';

jest.mock('@workspace/db', () => ({
  prisma: {},
}));

describe('assertValidPayrollTransition', () => {
  it.each([
    ['AUDITED', 'APPROVE'],
    ['APPROVED', 'DISBURSE'],
    ['DRAFT', 'CANCEL'],
    ['PROCESSING', 'CANCEL'],
    ['AUDITED', 'CANCEL'],
    ['APPROVED', 'CANCEL'],
  ] as [string, PayrollRunAction][])('allows %s from %s', (status, action) => {
    expect(() => assertValidPayrollTransition(status, action)).not.toThrow();
  });

  it.each([
    ['DRAFT', 'APPROVE'],
    ['PROCESSING', 'APPROVE'],
    ['APPROVED', 'APPROVE'],
    ['DISBURSED', 'APPROVE'],
    ['AUDITED', 'DISBURSE'],
    ['DISBURSED', 'DISBURSE'],
    ['DRAFT', 'DISBURSE'],
    ['DISBURSED', 'CANCEL'],
  ] as [string, PayrollRunAction][])('rejects %s from %s', (status, action) => {
    expect(() => assertValidPayrollTransition(status, action)).toThrow(
      ConflictException,
    );
  });
});
