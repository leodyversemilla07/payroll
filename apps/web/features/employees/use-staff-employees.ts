"use client";

import { trpc } from "@/lib/trpc";

export function useStaffEmployees() {
  const employees = trpc.employees.list.useQuery(undefined, { retry: false });
  return {
    employees: (employees.data ?? []).map((entry) => ({
      id: entry.id,
      firstName: entry.firstName,
      lastName: entry.lastName,
      employeeNumber: entry.employeeNumber,
      employmentStatus: entry.employmentStatus,
    })),
    employeeListFailed: employees.isError,
  };
}
