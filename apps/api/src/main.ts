import { validateEnvironment } from './config/environment';
import { NestFactory } from '@nestjs/core';
import { TRPCError } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import { AppModule } from './app.module';
import { TrpcService } from './trpc/trpc.service';
import { createApiRouter } from './trpc/routers/app.router';
import { EmployeesService } from './modules/employees/employees.service';
import { TimekeepingService } from './modules/timekeeping/timekeeping.service';
import { PayrollService } from './modules/payroll/payroll.service';
import { LoansService } from './modules/loans/loans.service';
import { ComplianceService } from './modules/compliance/compliance.service';
import { LeavesService } from './modules/leaves/leaves.service';
import { AuthService } from './auth/auth.service';
import { AuditService } from './audit/audit.service';

async function bootstrap() {
  const environment = validateEnvironment();
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: environment.CORS_ORIGIN,
    credentials: true,
  });

  const trpcService = app.get(TrpcService);
  const authService = app.get(AuthService);
  const auditService = app.get(AuditService);
  const employeesService = app.get(EmployeesService);
  const timekeepingService = app.get(TimekeepingService);
  const payrollService = app.get(PayrollService);
  const loansService = app.get(LoansService);
  const complianceService = app.get(ComplianceService);
  const leavesService = app.get(LeavesService);

  const appRouter = createApiRouter(
    trpcService,
    employeesService,
    timekeepingService,
    payrollService,
    loansService,
    complianceService,
    leavesService,
    authService,
    auditService,
  );

  app.use(
    '/trpc',
    trpcExpress.createExpressMiddleware({
      router: appRouter,
      createContext: async ({ req, res }) => {
        const origin = req.get('origin');
        if (origin && !environment.CORS_ORIGIN.includes(origin)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Request origin is not trusted',
          });
        }

        return {
          req,
          res,
          user: await authService.authenticate(req),
        };
      },
    }),
  );

  await app.listen(environment.PORT);
  console.log(
    `🚀 Payroll API running on http://localhost:${environment.PORT}/trpc`,
  );
}

void bootstrap().catch((error: unknown) => {
  console.error('Failed to start Payroll API', error);
  process.exitCode = 1;
});
