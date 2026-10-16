"use client";

import Link from "next/link";
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { cn } from "@workspace/ui/lib/utils";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { EditEmployeeForm } from "./edit-employee-form";
import {
  formatEmploymentStatus,
  getStatusBadgeClassName,
} from "./employee-data-table";
import { EmployeeProfile } from "./employee-profile";

export function EmployeeDetails({
  id,
  canEdit,
  initialEditing,
  createdMessage,
}: {
  id: string;
  canEdit: boolean;
  initialEditing?: boolean;
  createdMessage?: string | null;
}) {
  const details = trpc.employees.getById.useQuery({ id }, { retry: false });
  const [isEditing, setIsEditing] = useState(
    canEdit && (initialEditing ?? false),
  );
  const employee = details.data;
  const initials = employee
    ? `${employee.firstName[0] ?? ""}${employee.lastName[0] ?? ""}`.toUpperCase()
    : "EM";
  const fullName = employee
    ? `${employee.firstName} ${employee.lastName}`
    : "Employee details";

  return (
    <section
      aria-label="Employee details"
      className="flex flex-col h-full min-h-0 bg-background"
    >
      <SheetHeader className="flex-none border-b bg-card/60 px-6 py-4 backdrop-blur-sm pr-12 text-left">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar className="size-10 shrink-0 rounded-full border border-border shadow-sm">
              <AvatarFallback className="font-semibold text-xs bg-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="text-base font-semibold tracking-tight text-foreground truncate">
                  {fullName}
                </SheetTitle>
                {employee?.employmentStatus && (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-tight",
                      getStatusBadgeClassName(employee.employmentStatus),
                    )}
                  >
                    {formatEmploymentStatus(employee.employmentStatus)}
                  </span>
                )}
              </div>
              <SheetDescription className="text-xs text-muted-foreground truncate">
                {employee?.employeeNumber && (
                  <span className="font-mono">{employee.employeeNumber}</span>
                )}
                {employee?.department && ` · ${employee.department.name}`}
                {employee?.branch && ` · ${employee.branch.name}`}
              </SheetDescription>
            </div>
          </div>

          {details.data && !isEditing && (
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href={`/attendance?employee=${details.data.id}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                View DTR
              </Link>
              {canEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  Edit employee
                </Button>
              )}
            </div>
          )}
        </div>
      </SheetHeader>

      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {createdMessage && (
          <p
            role="status"
            className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground break-words"
          >
            {createdMessage}
          </p>
        )}
        {details.isPending ? (
          <p role="status">Loading employee details…</p>
        ) : details.isError ? (
          <p role="alert">
            Could not load employee details.{" "}
            <Button
              type="button"
              variant="outline"
              onClick={() => void details.refetch()}
            >
              Retry
            </Button>
          </p>
        ) : !details.data ? (
          <p>Employee not found in this organization.</p>
        ) : isEditing && canEdit ? (
          <EditEmployeeForm
            employee={details.data}
            onCancel={() => setIsEditing(false)}
            onUpdated={() => setIsEditing(false)}
          />
        ) : (
          <EmployeeProfile employee={details.data} />
        )}
      </div>
    </section>
  );
}
