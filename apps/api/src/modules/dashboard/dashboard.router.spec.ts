import { Role } from '@workspace/db';
import type { Request, Response } from 'express';
import type {
  DashboardOverview,
  DashboardService,
} from '../../modules/dashboard/dashboard.service';
import {
  createRouterContext,
  type RouterServices,
} from '../../trpc/router-context';
import { type Context, TrpcService } from '../../trpc/trpc.service';
import { createDashboardRouter } from './dashboard.router';

function createContext(role: Role | null): Context {
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
          name: 'Staff User',
          email: 'staff@test.invalid',
          role,
        }
      : null,
  };
}

describe('DashboardRouter', () => {
  const getOverview = jest.fn();
  const dashboardService = {
    getOverview,
  } as unknown as DashboardService;

  const trpc = new TrpcService();
  const routerContext = createRouterContext(trpc, {
    dashboardService,
  } as RouterServices);
  const router = createDashboardRouter(routerContext);

  const mockOverview: DashboardOverview = {
    employees: {
      total: 10,
      active: 8,
      onLeave: 1,
      resigned: 1,
      terminated: 0,
      other: 0,
    },
    payroll: {
      latestRun: null,
      recentRuns: [],
    },
    leaves: {
      pendingCount: 2,
    },
    loans: {
      activeCount: 1,
      totalOutstandingCents: 500000n,
    },
    audit: [],
  };

  beforeEach(() => {
    jest.resetAllMocks();
    getOverview.mockResolvedValue(mockOverview);
  });

  it.each([
    Role.SUPER_ADMIN,
    Role.HR_ADMIN,
    Role.PAYROLL_SPECIALIST,
    Role.DEPARTMENT_MANAGER,
  ])('permits %s to read organizational overview', async (role) => {
    const caller = router.createCaller(createContext(role));
    const result = await caller.getOverview();

    expect(getOverview).toHaveBeenCalledWith('org-1');
    expect(result).toEqual(mockOverview);
  });

  it('denies EMPLOYEE from reading organizational overview', async () => {
    const caller = router.createCaller(createContext(Role.EMPLOYEE));
    await expect(caller.getOverview()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(getOverview).not.toHaveBeenCalled();
  });

  it('denies unauthenticated requests', async () => {
    const caller = router.createCaller(createContext(null));
    await expect(caller.getOverview()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(getOverview).not.toHaveBeenCalled();
  });
});
