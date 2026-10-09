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
import { LoansSection } from "@/features/loans/loans-section";

export default function LoansPage() {
  const { isStaff } = useWorkspaceUser();

  if (!isStaff) {
    return (
      <>
        <SectionHeader sectionId="loans" />
        <Card role="region" aria-label="Loans management restricted">
          <CardHeader>
            <CardTitle className="text-destructive">
              Access Restricted
            </CardTitle>
            <CardDescription>
              Managing employee loans requires payroll or HR staff privileges.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              You can view your personal loan deductions and advances in your
              profile.
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
      <SectionHeader sectionId="loans" />
      <SectionGate sectionId="loans">
        <LoansSection />
      </SectionGate>
    </>
  );
}
