import { Module } from "@nestjs/common";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { TrpcModule } from "./trpc/trpc.module.js";
import { EmployeesService } from "./modules/employees/employees.service.js";
import { TimekeepingService } from "./modules/timekeeping/timekeeping.service.js";
import { PayrollService } from "./modules/payroll/payroll.service.js";
import { LoansService } from "./modules/loans/loans.service.js";

@Module({
  imports: [TrpcModule],
  controllers: [AppController],
  providers: [
    AppService,
    EmployeesService,
    TimekeepingService,
    PayrollService,
    LoansService,
  ],
  exports: [
    EmployeesService,
    TimekeepingService,
    PayrollService,
    LoansService,
  ],
})
export class AppModule {}
