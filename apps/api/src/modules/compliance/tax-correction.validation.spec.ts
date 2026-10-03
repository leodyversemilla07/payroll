import {
  declarationCorrection,
  incomeCorrection,
  remittanceCorrection,
  settlementCorrection,
} from './tax-correction.validation';
import { sourceFingerprint } from './tax-source-fingerprint';

const employeeId = '1941a12f-26c4-4a48-8e7e-d574f2109800';
const base = {
  employeeId,
  taxYear: 2026,
  correctionReason: 'Corrected against signed source evidence',
};
const income = {
  ...base,
  employerName: 'Synthetic prior',
  employerTin: '123456789',
  periodStart: '2026-01-01',
  periodEnd: '2026-02-28',
  grossCompensationCents: '900719925474099',
  taxableCompensationCents: '900719925474098',
  taxWithheldCents: '1',
  documentReference: 'Synthetic evidence',
};

describe('tax correction proposals and source fingerprints', () => {
  it('rejects client-supplied reviewer/provenance on every proposal type', () => {
    const proposals = [
      [
        declarationCorrection,
        { ...base, hasPriorEmployer: false, sourceReference: 'Synthetic' },
      ],
      [incomeCorrection, income],
      [
        remittanceCorrection,
        {
          taxYear: 2026,
          month: 12,
          remittedCents: '123',
          documentReference: 'Synthetic',
          correctionReason: base.correctionReason,
        },
      ],
      [
        settlementCorrection,
        {
          ...base,
          settlementDate: '2026-12-31',
          documentReference: 'Synthetic',
        },
      ],
    ] as const;
    for (const [schema, payload] of proposals) {
      expect(schema.safeParse(payload).success).toBe(true);
      expect(
        schema.safeParse({ ...payload, reviewerId: employeeId }).success,
      ).toBe(false);
      expect(
        schema.safeParse({ ...payload, recordedById: employeeId }).success,
      ).toBe(false);
    }
  });

  it('preserves large exact decimal centavo strings in stored proposals', () => {
    expect(incomeCorrection.parse(income).grossCompensationCents).toBe(
      '900719925474099',
    );
  });

  it.each(['abc', '-1', '1.5', '1e5', '9999999999999999'])(
    'rejects malformed cents %s without throwing outside validation',
    (amount) => {
      expect(
        incomeCorrection.safeParse({
          ...income,
          grossCompensationCents: amount,
        }).success,
      ).toBe(false);
    },
  );

  it.each([
    { periodEnd: '2025-12-31' },
    { periodStart: '2026-03-01' },
    {
      taxableCompensationCents: '900719925474099',
      grossCompensationCents: '1',
    },
  ])(
    'rejects inconsistent prior-document periods or compensation %j',
    (change) => {
      expect(incomeCorrection.safeParse({ ...income, ...change }).success).toBe(
        false,
      );
    },
  );

  it('fingerprints dates and bigint amounts losslessly and ignores object property order', () => {
    expect(
      sourceFingerprint({
        amount: 9007199254740993n,
        date: new Date('2026-01-01'),
        nested: { b: 2, a: 1 },
      }),
    ).toBe(
      sourceFingerprint({
        nested: { a: 1, b: 2 },
        date: new Date('2026-01-01'),
        amount: 9007199254740993n,
      }),
    );
    expect(sourceFingerprint({ amount: 9007199254740993n })).not.toBe(
      sourceFingerprint({ amount: 9007199254740992n }),
    );
    expect(sourceFingerprint({ version: 1, cents: 0n })).not.toBe(
      sourceFingerprint({ version: 2, cents: 0n }),
    );
  });
});
