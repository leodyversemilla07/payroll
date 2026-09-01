import { NestFactory } from "@nestjs/core";
import * as trpcExpress from "@trpc/server/adapters/express";
import { AppModule } from "./app.module.js";
import { TrpcService } from "./trpc/trpc.service.js";
import { createApiRouter } from "./trpc/routers/app.router.js";
import { EmployeesService } from "./modules/employees/employees.service.js";
import { TimekeepingService } from "./modules/timekeeping/timekeeping.service.js";
import { PayrollService } from "./modules/payroll/payroll.service.js";
import { LoansService } from "./modules/loans/loans.service.js";

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

  const appRouter = createApiRouter(
    trpcService,
    employeesService,
    timekeepingService,
    payrollService,
    loansService
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
