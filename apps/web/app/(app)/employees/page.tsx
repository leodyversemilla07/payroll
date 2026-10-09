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
import { EmployeesSection } from "@/features/employees/employees-section";

export default function EmployeesPage() {
  const { canManageEmployees, isStaff } = useWorkspaceUser();

  if (!isStaff) {
    return (
      <>
        <SectionHeader sectionId="employees" />
        <Card role="region" aria-label="Employee directory restricted">
          <CardHeader>
            <CardTitle>No staff records available</CardTitle>
            <CardDescription>
              Employee and payroll-run lists require a payroll or HR staff role.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              You can review your personal records, compensation, leave
              balances, and payslips in your profile.
            </p>
            <Link
              href="/profile"
              className={buttonVariants({ variant: "default" })}
            >
              Go to My Profile
            </Link>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <SectionHeader sectionId="employees" />
      <SectionGate sectionId="employees">
        <EmployeesSection canCreate={canManageEmployees} />
      </SectionGate>
    </>
  );
}
