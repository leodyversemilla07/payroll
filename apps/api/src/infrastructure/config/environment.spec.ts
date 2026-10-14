import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  it('applies safe development defaults', () => {
    expect(
      validateEnvironment({
        DATABASE_URL:
          'postgresql://postgres:password@localhost:5432/payroll_db',
      }),
    ).toEqual({
      NODE_ENV: 'development',
      PORT: 4000,
      DATABASE_URL: 'postgresql://postgres:password@localhost:5432/payroll_db',
      AUTH_COOKIE_NAME: 'sweldoph_session',
      AUTH_SESSION_TTL_HOURS: 8,
      ALLOW_DEV_LOGIN_BACKDOOR: false,
      CORS_ORIGIN: ['http://localhost:3000'],
      EMAIL_DRIVER: 'mock',
      EMAIL_FROM: 'SweldoPH Payroll <payroll@sweldoph.local>',
      SMTP_PORT: 587,
      SMTP_SECURE: false,
    });
  });

  it('parses a port and multiple CORS origins', () => {
    const environment = validateEnvironment({
      NODE_ENV: 'production',
      PORT: '8080',
      DATABASE_URL: 'postgresql://postgres:password@db:5432/payroll_db',
      CORS_ORIGIN: 'https://payroll.example.com,https://admin.example.com',
    });

    expect(environment.PORT).toBe(8080);
    expect(environment.AUTH_SESSION_TTL_HOURS).toBe(8);
    expect(environment.CORS_ORIGIN).toEqual([
      'https://payroll.example.com',
      'https://admin.example.com',
    ]);
  });

  it('rejects missing database configuration and invalid origins', () => {
    expect(() =>
      validateEnvironment({
        CORS_ORIGIN: 'https://payroll.example.com/path',
      }),
    ).toThrow(
      'Invalid environment configuration: DATABASE_URL: DATABASE_URL is required; CORS_ORIGIN: Invalid CORS origin: https://payroll.example.com/path',
    );
  });

  it.each([
    ['1', true],
    ['true', true],
    [true, true],
    ['0', false],
    ['false', false],
    [false, false],
    [undefined, false],
  ])(
    'parses ALLOW_DEV_LOGIN_BACKDOOR=%s as %s (never truthy-coerced)',
    (flag, expected) => {
      expect(
        validateEnvironment({
          DATABASE_URL:
            'postgresql://postgres:password@localhost:5432/payroll_db',
          ALLOW_DEV_LOGIN_BACKDOOR: flag,
        } as NodeJS.ProcessEnv).ALLOW_DEV_LOGIN_BACKDOOR,
      ).toBe(expected);
    },
  );
});
