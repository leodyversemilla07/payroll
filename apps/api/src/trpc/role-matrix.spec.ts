import {
  ALL_ROLES,
  EMPLOYEE_RECORD_ROLES,
  HR_ROLES,
  LEAVE_APPROVAL_ROLES,
  PAYROLL_APPROVAL_ROLES,
  PAYROLL_ROLES,
  PAYROLL_TRIGGER_ROLES,
  roleIsIn,
  STAFF_ROLES,
  TIMEKEEPING_READ_ROLES,
  TIMEKEEPING_WRITE_ROLES,
} from '@workspace/db';

describe('role matrix', () => {
  it('ALL_ROLES enumerates exactly the portal roles', () => {
    expect([...ALL_ROLES]).toEqual([
      'SUPER_ADMIN',
      'HR_ADMIN',
      'PAYROLL_SPECIALIST',
      'DEPARTMENT_MANAGER',
      'EMPLOYEE',
    ]);
  });

  it('every named set only contains declared roles', () => {
    const declared = new Set<string>(ALL_ROLES);
    const sets = [
      EMPLOYEE_RECORD_ROLES,
      TIMEKEEPING_READ_ROLES,
      TIMEKEEPING_WRITE_ROLES,
      HR_ROLES,
      PAYROLL_ROLES,
      PAYROLL_TRIGGER_ROLES,
      PAYROLL_APPROVAL_ROLES,
      LEAVE_APPROVAL_ROLES,
      STAFF_ROLES,
    ];
    for (const set of sets) {
      for (const role of set) {
        expect(declared.has(role)).toBe(true);
      }
    }
  });

  it('staff sets extend employee-record staff with DEPARTMENT_MANAGER', () => {
    const withManager = new Set<string>([
      ...EMPLOYEE_RECORD_ROLES,
      'DEPARTMENT_MANAGER',
    ]);

    expect(new Set(STAFF_ROLES)).toEqual(withManager);
    expect(new Set(TIMEKEEPING_READ_ROLES)).toEqual(withManager);
    expect(new Set(TIMEKEEPING_WRITE_ROLES)).toEqual(withManager);
  });

  it('payroll viewer roles match employee-record staff', () => {
    expect(new Set(PAYROLL_ROLES)).toEqual(new Set(EMPLOYEE_RECORD_ROLES));
  });

  it('maker and checker sets separate duties (specialists trigger, HR approves)', () => {
    expect([...PAYROLL_TRIGGER_ROLES]).toEqual([
      'SUPER_ADMIN',
      'PAYROLL_SPECIALIST',
    ]);
    expect([...PAYROLL_APPROVAL_ROLES]).toEqual(['SUPER_ADMIN', 'HR_ADMIN']);

    const overlap = PAYROLL_TRIGGER_ROLES.filter((role) =>
      PAYROLL_APPROVAL_ROLES.includes(role),
    );
    // The shared role is SUPER_ADMIN alone. No single *person* can both run
    // and approve either way, because the payroll service rejects
    // self-approval (processedById === approvedById).
    expect(overlap).toEqual(['SUPER_ADMIN']);
  });

  it('leave approvals are a subset of staff roles', () => {
    for (const role of LEAVE_APPROVAL_ROLES) {
      expect(STAFF_ROLES.includes(role)).toBe(true);
    }
  });

  describe('roleIsIn', () => {
    it('matches exact role names', () => {
      expect(roleIsIn('SUPER_ADMIN', HR_ROLES)).toBe(true);
      expect(roleIsIn('HR_ADMIN', HR_ROLES)).toBe(true);
      expect(roleIsIn('EMPLOYEE', STAFF_ROLES)).toBe(false);
    });

    it('never matches case variants or fragments', () => {
      expect(roleIsIn('super_admin', HR_ROLES)).toBe(false);
      expect(roleIsIn('SUPER', HR_ROLES)).toBe(false);
    });

    it('treats missing roles as denied', () => {
      expect(roleIsIn(undefined, ALL_ROLES)).toBe(false);
      expect(roleIsIn('', ALL_ROLES)).toBe(false);
    });
  });
});
