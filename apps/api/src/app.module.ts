import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditService } from './audit/audit.service';
import { AuthService } from './auth/auth.service';
import { ComplianceService } from './modules/compliance/compliance.service';
import { DashboardService } from './modules/dashboard/dashboard.service';
import { EmployeesService } from './modules/employees/employees.service';
import { HolidaysService } from './modules/holidays/holidays.service';
import { LeavesService } from './modules/leaves/leaves.service';
import { LoansService } from './modules/loans/loans.service';
import { PayrollService } from './modules/payroll/payroll.service';
import { PayslipPdfService } from './modules/payroll/payslip-pdf.service';
import { TimekeepingService } from './modules/timekeeping/timekeeping.service';
import { StorageService } from './storage/storage.service';
import { TrpcModule } from './trpc/trpc.module';

@Module({
  imports: [TrpcModule],
  controllers: [AppController],
  providers: [
    AppService,
    AuthService,
    AuditService,
    EmployeesService,
    TimekeepingService,
    PayrollService,
    LoansService,
    ComplianceService,
    LeavesService,
    DashboardService,
    HolidaysService,
    StorageService,
    PayslipPdfService,
  ],
  exports: [
    AuthService,
    AuditService,
    EmployeesService,
    TimekeepingService,
    PayrollService,
    LoansService,
    ComplianceService,
    LeavesService,
    DashboardService,
    HolidaysService,
    StorageService,
    PayslipPdfService,
  ],
})
export class AppModule {}
