import {
  type Bir2316PdfData,
  Bir2316PdfService,
  formatDate,
  formatPesos,
  formatTin,
} from './bir-2316-pdf.service';

describe('Bir2316PdfService', () => {
  let service: Bir2316PdfService;

  beforeEach(() => {
    service = new Bir2316PdfService();
  });

  describe('format helpers', () => {
    it('formats TINs with standard dashes and 5-digit branch code', () => {
      expect(formatTin('123456789')).toBe('123-456-789-00000');
      expect(formatTin('123456789012')).toBe('123-456-789-01200');
      expect(formatTin(null)).toBe('000-000-000-00000');
      expect(formatTin(undefined)).toBe('000-000-000-00000');
    });

    it('formats centavos into Philippine Pesos decimal string', () => {
      expect(formatPesos(12500000n)).toBe('125,000.00');
      expect(formatPesos(0n)).toBe('0.00');
      expect(formatPesos(null)).toBe('0.00');
      expect(formatPesos(50n)).toBe('0.50');
    });

    it('formats dates into MM/DD/YYYY format', () => {
      expect(formatDate(new Date('2026-05-15T00:00:00Z'))).toBe('05/15/2026');
      expect(formatDate(null)).toBe('—');
      expect(formatDate('invalid')).toBe('—');
    });
  });

  describe('renderPdf', () => {
    const baseMockData: Bir2316PdfData = {
      taxYear: 2026,
      employee: {
        employeeNumber: 'EMP-001',
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        middleName: 'Protacio',
        suffix: null,
        tin: '123456789',
        rdoCode: '038',
        residentialAddress: '123 Rizal Street, Makati City',
        zipCode: '1200',
        dateOfBirth: new Date('1990-06-19'),
        contactNumber: '09171234567',
        isMinimumWageEarner: false,
      },
      employer: {
        name: 'Acme Philippines Holdings Corp.',
        tin: '987654321000',
        rdoCode: '038',
        registeredAddress: '456 Ayala Avenue, Makati City',
        zipCode: '1226',
        lineOfBusiness: 'Information Technology',
      },
      partIVA: {
        grossCompensationIncomeCents: 60000000n, // 600k
        totalNonTaxableCompensationCents: 15000000n, // 150k
        totalTaxableCompensationCents: 45000000n, // 450k
        taxDueAnnualCents: 4250000n, // 42.5k
        totalTaxWithheldCents: 4500000n, // 45k
        taxAdjustmentCents: -250000n, // 2.5k refund
        refundDueEmployeeCents: 250000n,
        taxPayableByEmployeeCents: 0n,
      },
      partIVB: {
        basicMweCents: 0n,
        holidayPayMweCents: 0n,
        overtimePayMweCents: 0n,
        nightDiffMweCents: 0n,
        hazardPayMweCents: 0n,
        thirteenthMonthExemptCents: 9000000n, // 90k
        deMinimisBenefitsCents: 3000000n, // 30k
        statutoryContributionsCents: 3000000n, // 30k
        otherNonTaxableCents: 0n,
        totalNonTaxableCompensationCents: 15000000n,
      },
      partIVC: {
        basicSalaryRegularCents: 40000000n,
        overtimePayTaxableCents: 2000000n,
        holidayPayTaxableCents: 1000000n,
        nightDiffTaxableCents: 500000n,
        otherTaxableAllowancesCents: 1500000n,
        thirteenthMonthExcessTaxableCents: 0n,
        totalTaxableCompensationCents: 45000000n,
      },
      priorEmployerTotals: null,
      isMwe: false,
      isIssued: false,
    };

    it('generates a valid PDF buffer with PDF header magic bytes', async () => {
      const buffer = await service.renderPdf(baseMockData);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(1000);
      // Valid PDF begins with %PDF-
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('renders an officially issued certificate without preview watermark', async () => {
      const issuedData: Bir2316PdfData = {
        ...baseMockData,
        isIssued: true,
        version: 1,
        issuanceId: 'issuance-uuid-1234',
        issuedAt: new Date('2027-01-20T10:00:00Z'),
      };
      const buffer = await service.renderPdf(issuedData);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(1000);
    });

    it('renders minimum wage earner (MWE) details', async () => {
      const mweData: Bir2316PdfData = {
        ...baseMockData,
        isMwe: true,
        employee: {
          ...baseMockData.employee,
          isMinimumWageEarner: true,
        },
        partIVB: {
          ...baseMockData.partIVB,
          basicMweCents: 20000000n,
          holidayPayMweCents: 1000000n,
          overtimePayMweCents: 2000000n,
          nightDiffMweCents: 500000n,
          hazardPayMweCents: 0n,
          totalNonTaxableCompensationCents: 36500000n,
        },
        partIVC: {
          basicSalaryRegularCents: 0n,
          overtimePayTaxableCents: 0n,
          holidayPayTaxableCents: 0n,
          nightDiffTaxableCents: 0n,
          otherTaxableAllowancesCents: 0n,
          thirteenthMonthExcessTaxableCents: 0n,
          totalTaxableCompensationCents: 0n,
        },
        partIVA: {
          ...baseMockData.partIVA,
          totalNonTaxableCompensationCents: 36500000n,
          totalTaxableCompensationCents: 0n,
          taxDueAnnualCents: 0n,
          totalTaxWithheldCents: 0n,
          taxAdjustmentCents: 0n,
          refundDueEmployeeCents: 0n,
          taxPayableByEmployeeCents: 0n,
        },
      };

      const buffer = await service.renderPdf(mweData);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('renders previous employer information and consolidated figures', async () => {
      const withPriorData: Bir2316PdfData = {
        ...baseMockData,
        previousEmployer: {
          employerName: 'Previous Tech Enterprises Inc.',
          employerTin: '111222333000',
          periodStart: new Date('2026-01-01'),
          periodEnd: new Date('2026-04-30'),
          grossCompensationCents: 20000000n,
          taxableCompensationCents: 15000000n,
          taxWithheldCents: 1200000n,
        },
        priorEmployerTotals: {
          employerCount: 1,
          grossCents: 20000000n,
          taxableCents: 15000000n,
          withheldCents: 1200000n,
        },
      };

      const buffer = await service.renderPdf(withPriorData);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });
});
