"use client";

import { buttonVariants } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import Link from "next/link";
import { useWorkspaceUser } from "@/components/user-context";
import { SectionGate, SectionHeader } from "@/components/workspace-section";
import { TimekeepingSection } from "@/features/attendance/timekeeping-section";
import { useStaffEmployees } from "@/features/employees/use-staff-employees";

export default function AttendancePage() {
  const props = useStaffEmployees();
  const { user, isStaff } = useWorkspaceUser();

  if (!isStaff) {
    return (
      <>
        <SectionHeader sectionId="attendance" />
        <Card role="region" aria-label="Attendance restricted">
          <CardHeader>
            <CardTitle>No staff records available</CardTitle>
            <CardDescription>
              Employee and payroll-run lists require a payroll or HR staff role.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              You can view your daily time records and punch history in your
              personal attendance page.
            </p>
            <Link
              href="/my-attendance"
              className={buttonVariants({ variant: "default" })}
            >
              Go to My Attendance
            </Link>
          </CardContent>
        </Card>
      </>
    );
  }

  const canImport = [
    "SUPER_ADMIN",
    "HR_ADMIN",
    "PAYROLL_SPECIALIST",
    "DEPARTMENT_MANAGER",
  ].includes(user.role);
  return (
    <>
      <SectionHeader sectionId="attendance" />
      <SectionGate sectionId="attendance">
        <TimekeepingSection {...props} canImport={canImport} />
      </SectionGate>
    </>
  );
}
