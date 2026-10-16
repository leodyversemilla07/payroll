import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthService } from './auth/auth.service';
import { AuditService } from './infrastructure/audit/audit.service';
import { EmailModule } from './infrastructure/email/email.module';
import { StorageService } from './infrastructure/storage/storage.service';
import { DoleReportService } from './modules/compliance/dole-report.service';
import { MonthlyRemittanceService } from './modules/compliance/monthly-remittance.service';
import { PriorEmploymentService } from './modules/compliance/prior-employment.service';
import { WithholdingExportsService } from './modules/compliance/withholding-exports.service';
import { YearEndTaxService } from './modules/compliance/year-end-tax.service';
import { DashboardService } from './modules/dashboard/dashboard.service';
import { EmployeesService } from './modules/employees/employees.service';
import { HolidaysService } from './modules/holidays/holidays.service';
import { LeavesService } from './modules/leaves/leaves.service';
import { LoansService } from './modules/loans/loans.service';
import { NotificationService } from './modules/notifications/notifications.service';
import { CutoffSchedulerService } from './modules/payroll/cutoff-scheduler.service';
import { PayrollService } from './modules/payroll/payroll.service';
import { PayslipPdfService } from './modules/payroll/payslip-pdf.service';
import { TimekeepingService } from './modules/timekeeping/timekeeping.service';
import { ApiRouterFactory } from './trpc/api-router.factory';
import { TrpcModule } from './trpc/trpc.module';

@Module({
  imports: [TrpcModule, EmailModule],
  controllers: [AppController],
  providers: [
    AppService,
    AuthService,
    AuditService,
    EmployeesService,
    TimekeepingService,
    PayrollService,
    CutoffSchedulerService,
    LoansService,
    PriorEmploymentService,
    MonthlyRemittanceService,
    WithholdingExportsService,
    YearEndTaxService,
    DoleReportService,
    LeavesService,
    DashboardService,
    HolidaysService,
    NotificationService,
    StorageService,
    PayslipPdfService,
    ApiRouterFactory,
  ],
  exports: [
    AuthService,
    AuditService,
    EmployeesService,
    TimekeepingService,
    PayrollService,
    CutoffSchedulerService,
    LoansService,
    PriorEmploymentService,
    MonthlyRemittanceService,
    WithholdingExportsService,
    YearEndTaxService,
    DoleReportService,
    LeavesService,
    DashboardService,
    HolidaysService,
    NotificationService,
    StorageService,
    PayslipPdfService,
    EmailModule,
  ],
})
export class AppModule {}
