import { NestFactory } from '@nestjs/core';
import { TRPCError } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';
import { AuditService } from './infrastructure/audit/audit.service';
import { validateEnvironment } from './infrastructure/config/environment';
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
import { PayrollService } from './modules/payroll/payroll.service';
import { TimekeepingService } from './modules/timekeeping/timekeeping.service';
import { createApiRouter } from './trpc/app.router';
import { TrpcService } from './trpc/trpc.service';

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
  const priorEmploymentService = app.get(PriorEmploymentService);
  const monthlyRemittanceService = app.get(MonthlyRemittanceService);
  const withholdingExportsService = app.get(WithholdingExportsService);
  const yearEndTaxService = app.get(YearEndTaxService);
  const doleReportService = app.get(DoleReportService);
  const leavesService = app.get(LeavesService);
  const dashboardService = app.get(DashboardService);
  const holidaysService = app.get(HolidaysService);
  const notificationService = app.get(NotificationService);

  const appRouter = createApiRouter(
    trpcService,
    employeesService,
    timekeepingService,
    payrollService,
    loansService,
    leavesService,
    authService,
    auditService,
    dashboardService,
    holidaysService,
    notificationService,
    priorEmploymentService,
    monthlyRemittanceService,
    withholdingExportsService,
    yearEndTaxService,
    doleReportService,
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
