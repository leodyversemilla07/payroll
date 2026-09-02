import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { TrpcModule } from "./trpc/trpc.module";
import { EmployeesService } from "./modules/employees/employees.service";
import { TimekeepingService } from "./modules/timekeeping/timekeeping.service";
import { PayrollService } from "./modules/payroll/payroll.service";
import { LoansService } from "./modules/loans/loans.service";
import { ComplianceService } from "./modules/compliance/compliance.service";

@Module({
  imports: [TrpcModule],
  controllers: [AppController],
  providers: [
    AppService,
    EmployeesService,
    TimekeepingService,
    PayrollService,
    LoansService,
    ComplianceService,
  ],
  exports: [
    EmployeesService,
    TimekeepingService,
    PayrollService,
    LoansService,
    ComplianceService,
  ],
})
export class AppModule {}
