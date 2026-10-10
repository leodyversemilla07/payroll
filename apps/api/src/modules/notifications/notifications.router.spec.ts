import { NotFoundException } from '@nestjs/common';
import { Role } from '@workspace/db';
import type { Request, Response } from 'express';
import {
  createRouterContext,
  type RouterServices,
} from '../../trpc/router-context';
import { type Context, TrpcService } from '../../trpc/trpc.service';
import { createNotificationsRouter } from './notifications.router';

function context(role: Role | null): Context {
  return {
    req: {
      ip: '127.0.0.1',
      get: () => 'test',
      headers: {},
    } as unknown as Request,
    res: {} as Response,
    user: role
      ? {
          id: 'user-1',
          organizationId: 'org-1',
          name: 'Reader',
          email: 'reader@test.invalid',
          role,
        }
      : null,
  };
}

describe('notifications tRPC self-scoping', () => {
  const listForUser = jest.fn();
  const countUnread = jest.fn();
  const markRead = jest.fn();
  const markAllRead = jest.fn();
  const router = createNotificationsRouter(
    createRouterContext(new TrpcService(), {
      notificationService: {
        listForUser,
        countUnread,
        markRead,
        markAllRead,
      },
    } as unknown as RouterServices),
  );

  beforeEach(() => {
    jest.resetAllMocks();
    listForUser.mockResolvedValue([]);
    countUnread.mockResolvedValue(0);
  });

  it('denies anonymous reads and writes', async () => {
    const caller = router.createCaller(context(null));
    await expect(caller.list({})).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(caller.unreadCount()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(
      caller.markRead({ id: '11111111-1111-4111-8111-111111111111' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller.markAllRead()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(listForUser).not.toHaveBeenCalled();
  });

  it.each([
    Role.SUPER_ADMIN,
    Role.HR_ADMIN,
    Role.PAYROLL_SPECIALIST,
    Role.DEPARTMENT_MANAGER,
    Role.EMPLOYEE,
  ])('scopes %s reads to their own user id and organization', async (role) => {
    const caller = router.createCaller(context(role));
    await caller.list({ unreadOnly: true, limit: 10 });
    expect(listForUser).toHaveBeenCalledWith('user-1', 'org-1', {
      unreadOnly: true,
      limit: 10,
    });
    await caller.unreadCount();
    expect(countUnread).toHaveBeenCalledWith('user-1', 'org-1');
  });

  it('marks only own rows read and maps strangers to NOT_FOUND', async () => {
    const caller = router.createCaller(context(Role.EMPLOYEE));
    const row = { id: '33333333-3333-4333-8333-333333333333', isRead: true };
    markRead.mockResolvedValue(row);

    await expect(
      caller.markRead({ id: '33333333-3333-4333-8333-333333333333' }),
    ).resolves.toEqual(row);
    expect(markRead).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      '33333333-3333-4333-8333-333333333333',
    );

    markRead.mockRejectedValue(new NotFoundException('Notification not found'));
    await expect(
      caller.markRead({ id: '22222222-2222-4222-8222-222222222222' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('marks all own rows read without a target id', async () => {
    markAllRead.mockResolvedValue(3);
    const caller = router.createCaller(context(Role.HR_ADMIN));

    await expect(caller.markAllRead()).resolves.toBe(3);
    expect(markAllRead).toHaveBeenCalledWith('user-1', 'org-1');
  });
});
