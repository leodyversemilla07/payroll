import { Module } from '@nestjs/common';
import { DoleReportService } from './dole-report.service';
import { MonthlyRemittanceService } from './monthly-remittance.service';
import { PriorEmploymentService } from './prior-employment.service';
import { WithholdingExportsService } from './withholding-exports.service';
import { YearEndTaxService } from './year-end-tax.service';

@Module({
  providers: [
    PriorEmploymentService,
    MonthlyRemittanceService,
    WithholdingExportsService,
    YearEndTaxService,
    DoleReportService,
  ],
  exports: [
    PriorEmploymentService,
    MonthlyRemittanceService,
    WithholdingExportsService,
    YearEndTaxService,
    DoleReportService,
  ],
})
export class ComplianceModule {}
