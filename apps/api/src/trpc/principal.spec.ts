import { Role } from '@workspace/db';
import type { Request, Response } from 'express';
import { type Context, TrpcService } from './trpc.service';

const user: NonNullable<Context['user']> = {
  id: 'user-a',
  organizationId: 'org-a',
  role: Role.HR_ADMIN,
  name: 'Alpha',
  email: 'alpha@test.invalid',
};
const key = (u: NonNullable<Context['user']> = user) =>
  JSON.stringify([u.id, u.organizationId, u.role, u.employeeId ?? null]);
const ctx = (
  header?: string | string[],
  actor: Context['user'] = user,
): Context => ({
  req: {
    headers: header === undefined ? {} : { 'x-payroll-principal': header },
  } as unknown as Request,
  res: {} as Response,
  user: actor,
});
const service = new TrpcService();
const read = jest.fn();
const write = jest.fn();
const router = service.router({
  read: service.protectedProcedure.query(() => read()),
  write: service.protectedProcedure.mutation(() => write()),
  hr: service.procedureForRoles([Role.HR_ADMIN]).mutation(() => write()),
});

describe('Optional session principal freshness guard', () => {
  beforeEach(() => jest.resetAllMocks());
  it.each([undefined, key()])(
    'accepts authenticated requests with compatible metadata: %s',
    async (header) => {
      await router.createCaller(ctx(header)).read();
      await router.createCaller(ctx(header)).write();
      expect(read).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    JSON.stringify(['user-b', 'org-a', 'HR_ADMIN', null]),
    JSON.stringify(['user-a', 'org-b', 'HR_ADMIN', null]),
    JSON.stringify(['user-a', 'org-a', 'PAYROLL_SPECIALIST', null]),
    JSON.stringify(['user-a', 'org-a', 'HR_ADMIN', 'employee-a']),
    '',
    'malformed',
    [key(), key()],
  ])(
    'denies stale/malformed metadata before any read or write: %j',
    async (header) => {
      await expect(
        router.createCaller(ctx(header)).read(),
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        message: expect.stringContaining('Session changed'),
      });
      await expect(
        router.createCaller(ctx(header)).write(),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      expect(read).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
    },
  );
  it('does not authenticate an anonymous caller who supplies matching metadata', async () => {
    await expect(
      router.createCaller(ctx(key(), null)).write(),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Authentication is required',
    });
    expect(write).not.toHaveBeenCalled();
  });
  it('still enforces roles when the header matches a lower-privileged session', async () => {
    const employee = { ...user, role: Role.EMPLOYEE };
    await expect(
      router.createCaller(ctx(key(employee), employee)).hr(),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(write).not.toHaveBeenCalled();
  });
  it('does not confuse display-name/email changes with authorization scope', async () => {
    await router
      .createCaller(
        ctx(key(), {
          ...user,
          name: 'Updated name',
          email: 'updated@test.invalid',
        }),
      )
      .read();
    expect(read).toHaveBeenCalledTimes(1);
  });
});
