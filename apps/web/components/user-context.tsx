"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@workspace/api";
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
        canManageEmployees:
          user.role === "SUPER_ADMIN" || user.role === "HR_ADMIN",
        canTriggerPayroll:
          user.role === "SUPER_ADMIN" || user.role === "PAYROLL_SPECIALIST",
        canApprovePayroll:
          user.role === "SUPER_ADMIN" || user.role === "HR_ADMIN",
        canManageHolidays:
          user.role === "SUPER_ADMIN" || user.role === "HR_ADMIN",
        canManageLeavePolicies:
          user.role === "SUPER_ADMIN" || user.role === "HR_ADMIN",
        canApproveLeaves:
          user.role === "SUPER_ADMIN" ||
          user.role === "HR_ADMIN" ||
          user.role === "DEPARTMENT_MANAGER",
        isStaff:
          user.role === "SUPER_ADMIN" ||
          user.role === "HR_ADMIN" ||
          user.role === "PAYROLL_SPECIALIST",
        isEmployee: user.role === "EMPLOYEE",
      }}
    >
      {children}
    </WorkspaceUserContext.Provider>
  );
}
