import { NestFactory } from "@nestjs/core";
import * as trpcExpress from "@trpc/server/adapters/express";
import { AppModule } from "./app.module";
import { TrpcService } from "./trpc/trpc.service";
import { createApiRouter } from "./trpc/routers/app.router";
import { EmployeesService } from "./modules/employees/employees.service";
import { TimekeepingService } from "./modules/timekeeping/timekeeping.service";
import { PayrollService } from "./modules/payroll/payroll.service";
import { LoansService } from "./modules/loans/loans.service";
import { ComplianceService } from "./modules/compliance/compliance.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  });

  const trpcService = app.get(TrpcService);
  const employeesService = app.get(EmployeesService);
  const timekeepingService = app.get(TimekeepingService);
  const payrollService = app.get(PayrollService);
  const loansService = app.get(LoansService);
  const complianceService = app.get(ComplianceService);

  const appRouter = createApiRouter(
    trpcService,
    employeesService,
    timekeepingService,
    payrollService,
    loansService,
    complianceService
  );

  app.use(
    "/trpc",
    trpcExpress.createExpressMiddleware({
      router: appRouter,
      createContext: ({ req, res }) => ({ req, res }),
    })
  );

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`🚀 Payroll API running on http://localhost:${port}/trpc`);
}
bootstrap();
