import { z } from 'zod';

const year = z.number().int().min(2023).max(2100);
const reference = z.string().trim().min(1).max(160);
const reason = z.string().trim().min(10).max(500);
const cents = z.string().regex(/^\d{1,15}$/);
const employee = { employeeId: z.string().uuid(), taxYear: year };

export const declarationCorrection = z
  .object({
    ...employee,
    hasPriorEmployer: z.boolean(),
    sourceReference: reference,
    correctionReason: reason,
  })
  .strict();
export const incomeCorrection = z
  .object({
    ...employee,
    employerName: z.string().trim().min(1).max(200),
    employerTin: z
      .string()
      .trim()
      .regex(/^[0-9-]{9,20}$/),
    periodStart: z.string().date(),
    periodEnd: z.string().date(),
    grossCompensationCents: cents,
    taxableCompensationCents: cents,
    taxWithheldCents: cents,
    documentReference: reference,
    correctionReason: reason,
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.periodStart > input.periodEnd ||
      !input.periodStart.startsWith(`${input.taxYear}-`) ||
      !input.periodEnd.startsWith(`${input.taxYear}-`)
    )
      context.addIssue({
        code: 'custom',
        path: ['periodEnd'],
        message: 'Document period must be ordered within the tax year',
      });
    if (
      /^\d{1,15}$/.test(input.taxableCompensationCents) &&
      /^\d{1,15}$/.test(input.grossCompensationCents) &&
      BigInt(input.taxableCompensationCents) >
        BigInt(input.grossCompensationCents)
    )
      context.addIssue({
        code: 'custom',
        path: ['taxableCompensationCents'],
        message: 'Taxable compensation cannot exceed gross compensation',
      });
  });
export const remittanceCorrection = z
  .object({
    taxYear: year,
    month: z.number().int().min(1).max(12),
    remittedCents: cents,
    documentReference: reference,
    correctionReason: reason,
  })
  .strict();
export const settlementCorrection = z
  .object({
    ...employee,
    settlementDate: z.string().date(),
    documentReference: reference,
    correctionReason: reason,
  })
  .strict();
export type CorrectionKind =
  | 'DECLARATION'
  | 'PREVIOUS_INCOME'
  | 'REMITTANCE'
  | 'SETTLEMENT';
export type CorrectionPayload =
  | z.infer<typeof declarationCorrection>
  | z.infer<typeof incomeCorrection>
  | z.infer<typeof remittanceCorrection>
  | z.infer<typeof settlementCorrection>;

export function parseCorrection(
  kind: CorrectionKind,
  payload: unknown,
): CorrectionPayload {
  switch (kind) {
    case 'DECLARATION':
      return declarationCorrection.parse(payload);
    case 'PREVIOUS_INCOME':
      return incomeCorrection.parse(payload);
    case 'REMITTANCE':
      return remittanceCorrection.parse(payload);
    case 'SETTLEMENT':
      return settlementCorrection.parse(payload);
  }
}
