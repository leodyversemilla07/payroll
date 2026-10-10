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
import type { ReactNode } from "react";
import {
  isSectionAllowedForRole,
  type WorkspaceSection,
  workspaceSections,
} from "@/lib/workspace-navigation";
import { useWorkspaceUser } from "./user-context";

const EMPLOYEE_OVERVIEW_DESCRIPTION =
  "View your employee self-service dashboard, leave balances, attendance summary, and payslips.";

export function SectionHeader({ sectionId }: { sectionId: WorkspaceSection }) {
  const { isEmployee } = useWorkspaceUser();
  const section =
    workspaceSections.find((entry) => entry.id === sectionId) ??
    workspaceSections[0];
  const title = section.label;
  const description =
    isEmployee && sectionId === "dashboard"
      ? EMPLOYEE_OVERVIEW_DESCRIPTION
      : section.description;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div
        id="workspace-header-actions"
        className="flex items-center gap-2 shrink-0 empty:hidden"
      />
    </div>
  );
}

export function SectionGate({
  sectionId,
  children,
}: {
  sectionId: WorkspaceSection;
  children: ReactNode;
}) {
  const { user } = useWorkspaceUser();

  if (isSectionAllowedForRole(sectionId, user.role)) {
    return <>{children}</>;
  }

  const section =
    workspaceSections.find((entry) => entry.id === sectionId) ??
    workspaceSections[0];

  return (
    <Card role="region" aria-label="Access restricted">
      <CardHeader>
        <CardTitle>Access Restricted</CardTitle>
        <CardDescription>
          No staff records available. Your role (
          {user.role.replaceAll("_", " ")}) does not have permission to access
          the {section.label} workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          If you need access to this resource, please contact your system
          administrator or HR department.
        </p>
        <Link
          href="/dashboard"
          className={buttonVariants({ variant: "default" })}
        >
          Return to Dashboard
        </Link>
      </CardContent>
    </Card>
  );
}
