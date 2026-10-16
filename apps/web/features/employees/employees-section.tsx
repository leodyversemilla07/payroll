"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { Sheet, SheetContent } from "@workspace/ui/components/sheet";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Loader2, Plus, Users } from "lucide-react";
import { useState } from "react";
import { PageHeaderAction } from "@/components/page-header-action";
import { trpc } from "@/lib/trpc";
import { CreateEmployeeForm } from "./create-employee-form";
import { EmployeeDataTable } from "./employee-data-table";
import { EmployeeDetails } from "./employee-details";

export function EmployeesSection({ canCreate }: { canCreate: boolean }) {
  const utils = trpc.useUtils();
  const employees = trpc.employees.list.useQuery(undefined, { retry: false });
  const [showCreate, setShowCreate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editOnOpen, setEditOnOpen] = useState(false);
  const [createdNumber, setCreatedNumber] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const pendingDeleteEmployee =
    employees.data?.find((item) => item.id === pendingDeleteId) ?? null;

  const deleteEmployee = trpc.employees.delete.useMutation({
    onSuccess: (deleted) => {
      void utils.employees.list.invalidate();
      setPendingDeleteId(null);
      if (selectedId === deleted.id) {
        setSelectedId(null);
        setEditOnOpen(false);
      }
      setNotice(`Employee ${deleted.employeeNumber} deleted.`);
    },
    onError: (err) => {
      setPendingDeleteId(null);
      setNotice(err.message || "Failed to delete employee. Please retry.");
    },
  });

  return (
    <div className="min-w-0 space-y-6">
      {canCreate && (
        <PageHeaderAction>
          <Button
            type="button"
            variant="default"
            aria-expanded={showCreate}
            aria-controls="employee-create-form"
            disabled={isCreating}
            onClick={() => {
              setShowCreate(true);
              setCreatedNumber(null);
            }}
          >
            <Plus className="size-4" />
            Add employee
          </Button>
        </PageHeaderAction>
      )}
      <Card role="region" aria-label="Employees">
        <CardContent>
          {createdNumber && !selectedId && (
            <p role="status" className="mb-4 break-words">
              Employee {createdNumber} created. No login account was created.
            </p>
          )}
          {notice && !selectedId && (
            <p role="status" className="mb-4 break-words">
              {notice}
            </p>
          )}
          {employees.isPending ? (
            <div role="status" className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary shrink-0" />
                <span>Loading employees…</span>
              </div>
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-9 rounded-full" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          ) : employees.isError ? (
            <p role="alert">
              Could not load employees.{" "}
              <Button
                type="button"
                variant="outline"
                onClick={() => void employees.refetch()}
              >
                Retry
              </Button>
            </p>
          ) : employees.data.length === 0 ? (
            <Empty className="my-6 rounded-2xl border border-dashed border-border/80 p-12">
              <EmptyMedia variant="icon">
                <Users className="size-5 text-muted-foreground" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No employees yet</EmptyTitle>
                <EmptyDescription>
                  Start building your organization staff directory and
                  compensation profiles by onboarding your first employee.
                </EmptyDescription>
              </EmptyHeader>
              {canCreate && (
                <EmptyContent>
                  <Button
                    type="button"
                    onClick={() => {
                      setShowCreate(true);
                      setCreatedNumber(null);
                    }}
                  >
                    <Plus className="size-4" />
                    Onboard first employee
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          ) : (
            <EmployeeDataTable
              data={employees.data}
              selectedId={selectedId}
              onSelectEmployee={(id) => {
                setEditOnOpen(false);
                setSelectedId(id);
              }}
              onEditEmployee={(id) => {
                setEditOnOpen(true);
                setSelectedId(id);
              }}
              onDeleteEmployee={(id) => {
                if (!deleteEmployee.isPending) setPendingDeleteId(id);
              }}
              canManage={canCreate}
            />
          )}
        </CardContent>
      </Card>
      <Sheet
        open={canCreate && showCreate}
        onOpenChange={(open) => {
          if (!isCreating) {
            setShowCreate(open);
            if (!open) setCreatedNumber(null);
          }
        }}
      >
        <SheetContent
          side="right"
          className="data-[side=right]:sm:max-w-2xl data-[side=right]:lg:max-w-3xl"
        >
          {canCreate && showCreate && (
            <CreateEmployeeForm
              onPendingChange={setIsCreating}
              onCreated={(employee) => {
                setCreatedNumber(employee.employeeNumber);
                setSelectedId(employee.id);
                setShowCreate(false);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
      <Sheet
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            setEditOnOpen(false);
          }
        }}
      >
        <SheetContent
          side="right"
          className="data-[side=right]:sm:max-w-2xl data-[side=right]:lg:max-w-3xl"
        >
          {selectedId && (
            <EmployeeDetails
              key={selectedId}
              id={selectedId}
              canEdit={canCreate}
              initialEditing={editOnOpen}
              createdMessage={
                createdNumber
                  ? `Employee ${createdNumber} created. No login account was created.`
                  : null
              }
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Employee Confirmation Dialog */}
      <AlertDialog
        open={!!pendingDeleteEmployee}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete employee?</AlertDialogTitle>
            {pendingDeleteEmployee && (
              <AlertDialogDescription>
                This permanently removes {pendingDeleteEmployee.firstName}{" "}
                {pendingDeleteEmployee.lastName} (
                {pendingDeleteEmployee.employeeNumber}) and their compensation
                profile. This action cannot be undone.
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteEmployee.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={deleteEmployee.isPending}
              onClick={() => {
                if (pendingDeleteEmployee) {
                  deleteEmployee.mutate({ id: pendingDeleteEmployee.id });
                }
              }}
            >
              {deleteEmployee.isPending ? "Deleting…" : "Delete employee"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
