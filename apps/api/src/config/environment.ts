import { resolve } from 'node:path';
import { config as loadDotEnv } from 'dotenv';
import { z } from 'zod';

loadDotEnv({
  path: [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
    resolve(__dirname, '../../../../.env'),
  ],
  quiet: true,
});

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  DATABASE_URL: z
    .string({ required_error: 'DATABASE_URL is required' })
    .min(1, 'DATABASE_URL is required'),
  AUTH_COOKIE_NAME: z
    .string()
    .regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/, 'Invalid cookie name')
    .default('sweldoph_session'),
  AUTH_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(8),
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:3000')
    .transform((value, context) => {
      const origins = value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

      if (origins.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'CORS_ORIGIN must contain at least one origin',
        });
        return z.NEVER;
      }

      for (const origin of origins) {
        try {
          const url = new URL(origin);
          if (url.origin !== origin) {
            throw new Error('Origin must not include a path');
          }
        } catch {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid CORS origin: ${origin}`,
          });
          return z.NEVER;
        }
      }

      return origins;
    }),
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): Environment {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    const details = result.error.issues
      .map(
        (issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`,
      )
      .join('; ');

    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return result.data;
}
