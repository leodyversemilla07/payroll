import { NestFactory } from '@nestjs/core';
import { TRPCError } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import { AppModule } from './app.module';
import { validateEnvironment } from './infrastructure/config/environment';
import { ApiRouterFactory } from './trpc/api-router.factory';

async function bootstrap() {
  const environment = validateEnvironment();
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: environment.CORS_ORIGIN,
    credentials: true,
  });

  const api = app.get(ApiRouterFactory);
  const appRouter = api.create();

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
          user: await api.authService.authenticate(req),
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
