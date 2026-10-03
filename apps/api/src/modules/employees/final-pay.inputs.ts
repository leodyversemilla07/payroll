import { z } from 'zod';

const days = z.number().finite().min(0).max(366).multipleOf(0.5);
const reference = z.string().trim().min(3).max(200);
/** Read-only scenario inputs, not authorization to post payments or collect debt. */
export const finalPayPreviewSchema = z
  .object({
    employeeId: z.string().uuid(),
    separationType: z.enum([
      'RESIGNATION',
      'REDUNDANCY',
      'RETRENCHMENT',
      'CLOSURE_NON_BANKRUPT',
      'DISEASE',
      'RETIREMENT',
    ]),
    exitDate: z.string().date(),
    yearsOfService: z.number().finite().min(0).max(100).optional(),
    unpaidDaysWorked: days.max(31),
    unusedLeaveDays: days,
    priorMonetizedLeaveDaysInYear: days.optional(),
    authorizedLoanDeductionsCents: z
      .string()
      .regex(/^\d{1,15}$/)
      .transform(BigInt),
    loanAuthorizationReference: reference.optional(),
    retirementBenefitTaxTreatment: z.enum(['EXEMPT', 'TAXABLE']).optional(),
    isRepeatRetirementClaim: z.boolean().optional(),
    retirementTaxSourceReference: reference.optional(),
  })
  .superRefine((input, ctx) => {
    if (
      input.unusedLeaveDays > 0 &&
      input.priorMonetizedLeaveDaysInYear === undefined
    )
      ctx.addIssue({
        code: 'custom',
        path: ['priorMonetizedLeaveDaysInYear'],
        message:
          'Record prior monetization history explicitly, including verified zero usage',
      });
    if (
      input.authorizedLoanDeductionsCents > 0n &&
      !input.loanAuthorizationReference
    )
      ctx.addIssue({
        code: 'custom',
        path: ['loanAuthorizationReference'],
        message:
          'An explicit loan deduction authorization reference is required',
      });
    if (input.separationType === 'RETIREMENT') {
      if (
        !input.retirementBenefitTaxTreatment ||
        input.isRepeatRetirementClaim === undefined ||
        !input.retirementTaxSourceReference
      )
        ctx.addIssue({
          code: 'custom',
          path: ['retirementBenefitTaxTreatment'],
          message:
            'Retirement requires explicit reviewed tax treatment, claim history and source reference',
        });
      if (
        input.retirementBenefitTaxTreatment === 'EXEMPT' &&
        input.isRepeatRetirementClaim !== false
      )
        ctx.addIssue({
          code: 'custom',
          path: ['isRepeatRetirementClaim'],
          message: 'Exemption cannot assume this is the first retirement claim',
        });
    } else if (
      input.retirementBenefitTaxTreatment !== undefined ||
      input.isRepeatRetirementClaim !== undefined ||
      input.retirementTaxSourceReference !== undefined
    )
      ctx.addIssue({
        code: 'custom',
        path: ['retirementBenefitTaxTreatment'],
        message: 'Retirement inputs apply only to retirement scenarios',
      });
  });

export type FinalPayPreviewInput = Omit<
  z.output<typeof finalPayPreviewSchema>,
  'exitDate'
> & { organizationId: string; exitDate: Date };
