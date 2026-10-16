import type { Role } from "@prisma/client";

/**
 * Authority matrix: the single source of truth for who is allowed to do
 * what. Both consumers derive their checks from these constants:
 *
 * - `apps/api/src/trpc/router-context.ts` re-exports them and feeds
 *   `procedureForRoles`, so a role addition/demotion changes API enforcement
 *   in exactly one place.
 * - `apps/web/lib/workspace-navigation.ts` and
 *   `apps/web/components/user-context.tsx` render navigation and capability
 *   flags from the same constants, so the portal can never disagree with the
 *   server about what a role may see.
 *
 * Semantics of each set (server side is what actually enforces):
 *
 * | Set                   | Meaning                                                     |
 * | --------------------- | ----------------------------------------------------------- |
 * | EMPLOYEE_RECORD_ROLES | HR/payroll staff that may read employee records             |
 * | TIMEKEEPING_READ_ROLES| Employee-record staff + managers reading team attendance     |
 * | TIMEKEEPING_WRITE_ROLES| Staff that may record/adjust/correct attendance            |
 * | HR_ROLES              | Organization administration (holidays, users, policies)     |
 * | PAYROLL_ROLES         | Payroll staff that may view runs and payslips               |
 * | PAYROLL_TRIGGER_ROLES | Makers: may trigger/execute runs                            |
 * | PAYROLL_APPROVAL_ROLES| Checkers: may approve runs + forbid self-approval elsewhere |
 * | LEAVE_APPROVAL_ROLES  | May approve/reject leave requests                           |
 * | STAFF_ROLES           | Any non-employee portal staff, incl. department managers    |
 * | ALL_ROLES             | Every portal user, incl. EMPLOYEE self-service              |
 *
 * Separation of duties (maker-checker): trigger and approval sets overlap
 * *only* on SUPER_ADMIN. A specialist can never approve and an HR admin can
 * never trigger; a SUPER_ADMIN could do both in principle, which the payroll
 * service additionally prevents by rejecting self-approval
 * (`apps/api/src/modules/payroll/payroll.service.ts`).
 *
 * Client-bundle note: this module must stay free of runtime imports so the
 * web portal can import it in browser code. `Role` is only ever a type here —
 * role values are plain string literals narrowed to `Role` by the readonly
 * annotations. Runtime `Role` access stays in `index.ts` (server only).
 *
 * NOTE the type alias import below is intentionally `import type`.
 */
export const EMPLOYEE_RECORD_ROLES: readonly Role[] = [
  "SUPER_ADMIN",
  "HR_ADMIN",
  "PAYROLL_SPECIALIST",
];

export const TIMEKEEPING_READ_ROLES: readonly Role[] = [
  ...EMPLOYEE_RECORD_ROLES,
  "DEPARTMENT_MANAGER",
];

export const HR_ROLES: readonly Role[] = ["SUPER_ADMIN", "HR_ADMIN"];

export const TIMEKEEPING_WRITE_ROLES: readonly Role[] = [
  ...EMPLOYEE_RECORD_ROLES,
  "DEPARTMENT_MANAGER",
];

export const PAYROLL_ROLES: readonly Role[] = [
  "SUPER_ADMIN",
  "HR_ADMIN",
  "PAYROLL_SPECIALIST",
];

export const PAYROLL_TRIGGER_ROLES: readonly Role[] = [
  "SUPER_ADMIN",
  "PAYROLL_SPECIALIST",
];

export const PAYROLL_APPROVAL_ROLES: readonly Role[] = [
  "SUPER_ADMIN",
  "HR_ADMIN",
];

export const LEAVE_APPROVAL_ROLES: readonly Role[] = [
  "SUPER_ADMIN",
  "HR_ADMIN",
  "DEPARTMENT_MANAGER",
];

export const STAFF_ROLES: readonly Role[] = [
  "SUPER_ADMIN",
  "HR_ADMIN",
  "PAYROLL_SPECIALIST",
  "DEPARTMENT_MANAGER",
];

export const ALL_ROLES: readonly Role[] = [...STAFF_ROLES, "EMPLOYEE"];

/**
 * Membership for portal/UI code: the role always arrives as a plain string
 * (tRPC output, form field), and section tables are typed `readonly string[]`
 * so browser consumers never need the prisma-generated `Role` type. Role-
 * typed arrays (`readonly Role[]`) are assignable to this parameter, so
 * server-side callers may reuse it directly.
 */
export function roleIsIn(
  role: string | undefined,
  roles: readonly string[],
): boolean {
  if (!role) {
    return false;
  }
  return roles.includes(role);
}
