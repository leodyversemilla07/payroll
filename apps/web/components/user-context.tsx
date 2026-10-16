"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@workspace/api";
import {
  EMPLOYEE_RECORD_ROLES,
  HR_ROLES,
  LEAVE_APPROVAL_ROLES,
  PAYROLL_APPROVAL_ROLES,
  PAYROLL_TRIGGER_ROLES,
  roleIsIn,
} from "@workspace/db/role-matrix";
import { createContext, type ReactNode, useContext } from "react";

type WorkspaceUser = inferRouterOutputs<AppRouter>["auth"]["me"];

export interface WorkspaceUserContextValue {
  user: WorkspaceUser;
  canManageEmployees: boolean;
  canTriggerPayroll: boolean;
  canApprovePayroll: boolean;
  canManageHolidays: boolean;
  canManageLeavePolicies: boolean;
  canApproveLeaves: boolean;
  isStaff: boolean;
  isEmployee: boolean;
}

const WorkspaceUserContext = createContext<WorkspaceUserContextValue | null>(
  null,
);

export function useWorkspaceUser() {
  const context = useContext(WorkspaceUserContext);
  if (!context)
    throw new Error("Portal pages require an authenticated layout.");
  return context;
}

export function UserProvider({
  user,
  children,
}: {
  user: WorkspaceUser;
  children: ReactNode;
}) {
  return (
    <WorkspaceUserContext.Provider
      value={{
        user,
        // Capability sets come from @workspace/db/src/role-matrix.ts — the
        // same constants the API enforces with. They drive display only;
        // the server re-checks every procedure.
        canManageEmployees: roleIsIn(user.role, HR_ROLES),
        canTriggerPayroll: roleIsIn(user.role, PAYROLL_TRIGGER_ROLES),
        canApprovePayroll: roleIsIn(user.role, PAYROLL_APPROVAL_ROLES),
        canManageHolidays: roleIsIn(user.role, HR_ROLES),
        canManageLeavePolicies: roleIsIn(user.role, HR_ROLES),
        canApproveLeaves: roleIsIn(user.role, LEAVE_APPROVAL_ROLES),
        // Mirrors EMPLOYEE_RECORD_ROLES today: department managers are portal
        // staff but reach their powers through leave approvals and
        // department-scoped endpoints, not through this flag.
        isStaff: roleIsIn(user.role, EMPLOYEE_RECORD_ROLES),
        isEmployee: user.role === "EMPLOYEE",
      }}
    >
      {children}
    </WorkspaceUserContext.Provider>
  );
}
