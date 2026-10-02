"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import Link from "next/link";
import { portalSections } from "@/lib/portal-navigation";
import { trpc } from "@/lib/trpc";
import { EmployeesSection } from "./employees-section";
import { LeavesSection } from "./leaves-section";
import { usePortalUser } from "./payroll-portal";
import { TimekeepingSection } from "./timekeeping-section";
import { YearEndTaxSection } from "./year-end-tax";

function useStaffEmployees() {
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

export function PortalOverview() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {portalSections
        .filter((section) => section.id !== "overview")
        .map((section) => (
          <Card key={section.id}>
            <CardHeader>
              <section.icon
                className="mb-2 size-5 text-muted-foreground"
                aria-hidden="true"
              />
              <CardTitle>{section.label}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                className="text-sm font-medium text-primary underline underline-offset-4"
                href={section.href}
              >
                Open {section.label}
              </Link>
            </CardContent>
          </Card>
        ))}
    </div>
  );
}

export function PortalEmployees() {
  const { canManageEmployees } = usePortalUser();
  return <EmployeesSection canCreate={canManageEmployees} />;
}

export function PortalAttendance() {
  const props = useStaffEmployees();
  return <TimekeepingSection {...props} />;
}

export function PortalLeaves() {
  const props = useStaffEmployees();
  const { user, canManageEmployees } = usePortalUser();
  return (
    <LeavesSection
      {...props}
      canDecide={canManageEmployees}
      actorEmployeeId={user.employeeId}
    />
  );
}

export function PortalYearEndTax() {
  const { employees } = useStaffEmployees();
  return <YearEndTaxSection employees={employees} />;
}
