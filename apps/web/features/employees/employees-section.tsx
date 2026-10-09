"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@workspace/api";
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
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import { Loader2, Plus, Users } from "lucide-react";
import { type FormEvent, useState } from "react";
import { DatePicker } from "@/components/date-picker";
import { PageHeaderAction } from "@/components/payroll-portal";
import { trpc } from "@/lib/trpc";
import {
  EmployeeDataTable,
  formatEmploymentStatus,
  formatEmploymentType,
  getStatusBadgeClassName,
} from "./employee-data-table";

const EMPLOYMENT_TYPES = [
  "REGULAR",
  "PROBATIONARY",
  "CONTRACTUAL",
  "PROJECT_BASED",
  "PART_TIME",
].map((type) => ({ value: type, label: type.replaceAll("_", " ") }));

const EMPLOYMENT_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "ON_LEAVE", label: "On Leave" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "RESIGNED", label: "Resigned" },
  { value: "TERMINATED", label: "Terminated" },
  { value: "RETIRED", label: "Retired" },
];

const PAY_BASIS_ITEMS = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "DAILY", label: "Daily" },
  { value: "HOURLY", label: "Hourly" },
];

type EmployeeData = NonNullable<
  inferRouterOutputs<AppRouter>["employees"]["getById"]
>;

function pesos(value: bigint | number | string) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(value) / 100);
}

function date(value: Date | string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("en-PH", {
        timeZone: "UTC",
        dateStyle: "medium",
      }).format(new Date(value))
    : "Not recorded";
}

function masked(value: string | null | undefined) {
  return value ? `•••• ${value.slice(-4)}` : "Not recorded";
}

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

interface TextFieldConfig {
  name: string;
  label: string;
  maxLength?: number;
  type?: string;
  captionLayout?: "label" | "dropdown" | "dropdown-months" | "dropdown-years";
  min?: string;
  max?: string;
}

const todayIso = new Date().toISOString().slice(0, 10);

const profileFields: readonly TextFieldConfig[] = [
  { name: "firstName", label: "First name", maxLength: 100 },
  { name: "lastName", label: "Last name", maxLength: 100 },
  { name: "email", label: "Employee email", maxLength: 320, type: "email" },
  {
    name: "contactNumber",
    label: "Contact number",
    maxLength: 50,
    type: "tel",
  },
  { name: "residentialAddress", label: "Residential address", maxLength: 500 },
  {
    name: "dateOfBirth",
    label: "Date of birth",
    type: "date",
    captionLayout: "dropdown",
    min: "1900-01-01",
    max: todayIso,
  },
  { name: "gender", label: "Gender", maxLength: 50 },
  { name: "civilStatus", label: "Civil status", maxLength: 50 },
];
const statutoryFields: readonly TextFieldConfig[] = [
  { name: "tin", label: "TIN", maxLength: 50 },
  { name: "sssNo", label: "SSS number", maxLength: 50 },
  { name: "philhealthNo", label: "PhilHealth number", maxLength: 50 },
  { name: "pagibigNo", label: "Pag-IBIG number", maxLength: 50 },
  { name: "bankName", label: "Bank name", maxLength: 100 },
  { name: "bankAccountNumber", label: "Bank account number", maxLength: 100 },
  { name: "bankAccountName", label: "Bank account name", maxLength: 200 },
];

function TextFields({ fields }: { fields: readonly TextFieldConfig[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) =>
        field.type === "date" ? (
          <Field key={field.name}>
            <FieldLabel htmlFor={`employee-${field.name}`}>
              {field.label}
            </FieldLabel>
            <DatePicker
              id={`employee-${field.name}`}
              name={field.name}
              required
              captionLayout={field.captionLayout ?? "dropdown"}
              min={field.min}
              max={field.max}
            />
          </Field>
        ) : (
          <Field key={field.name}>
            <FieldLabel htmlFor={`employee-${field.name}`}>
              {field.label}
            </FieldLabel>
            <Input
              id={`employee-${field.name}`}
              name={field.name}
              type={field.type ?? "text"}
              maxLength={field.maxLength}
              required
            />
          </Field>
        ),
      )}
    </div>
  );
}

function CreateEmployeeForm({
  onCreated,
  onPendingChange,
}: {
  onCreated: (employee: { id: string; employeeNumber: string }) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const options = trpc.employees.getRegistrationOptions.useQuery(undefined, {
    retry: false,
  });
  const utils = trpc.useUtils();
  const [validationError, setValidationError] = useState<string | null>(null);
  const [payBasis, setPayBasis] = useState<"MONTHLY" | "DAILY" | "HOURLY">(
    "MONTHLY",
  );
  const [isManagerial, setIsManagerial] = useState(false);
  const [isTaxExempt, setIsTaxExempt] = useState(false);
  const create = trpc.employees.create.useMutation({
    onMutate: () => onPendingChange(true),
    onSettled: () => onPendingChange(false),
    onSuccess: (employee) => {
      void utils.employees.list.invalidate();
      onCreated(employee);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (create.isPending) return;
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    const birth = text("dateOfBirth");
    const hire = text("hireDate");
    if (birth > new Date().toISOString().slice(0, 10) || hire < birth) {
      setValidationError(
        "Date of birth cannot be in the future, and hire date cannot precede date of birth.",
      );
      return;
    }

    let monthlyBasicRatePesos: number | undefined;
    let dailyBasicRatePesos: number | undefined;
    let hourlyBasicRatePesos: number | undefined;

    if (payBasis === "MONTHLY") {
      monthlyBasicRatePesos = Number(text("monthlyBasicRatePesos"));
      if (
        !/^\d+(?:\.\d{1,2})?$/.test(text("monthlyBasicRatePesos")) ||
        !Number.isFinite(monthlyBasicRatePesos) ||
        monthlyBasicRatePesos <= 0 ||
        !Number.isSafeInteger(Math.round(monthlyBasicRatePesos * 100))
      ) {
        setValidationError(
          "Enter a positive monthly basic rate with at most two decimal places.",
        );
        return;
      }
    } else if (payBasis === "DAILY") {
      dailyBasicRatePesos = Number(text("dailyBasicRatePesos"));
      if (
        !/^\d+(?:\.\d{1,2})?$/.test(text("dailyBasicRatePesos")) ||
        !Number.isFinite(dailyBasicRatePesos) ||
        dailyBasicRatePesos <= 0 ||
        !Number.isSafeInteger(Math.round(dailyBasicRatePesos * 100))
      ) {
        setValidationError(
          "Enter a positive daily basic rate with at most two decimal places.",
        );
        return;
      }
    } else if (payBasis === "HOURLY") {
      hourlyBasicRatePesos = Number(text("hourlyBasicRatePesos"));
      if (
        !/^\d+(?:\.\d{1,2})?$/.test(text("hourlyBasicRatePesos")) ||
        !Number.isFinite(hourlyBasicRatePesos) ||
        hourlyBasicRatePesos <= 0 ||
        !Number.isSafeInteger(Math.round(hourlyBasicRatePesos * 100))
      ) {
        setValidationError(
          "Enter a positive hourly basic rate with at most two decimal places.",
        );
        return;
      }
    }

    const requiredNames = [...profileFields, ...statutoryFields].map(
      (field) => field.name,
    );
    if (
      requiredNames.some((name) => !text(name)) ||
      !text("branchId") ||
      !text("departmentId")
    ) {
      setValidationError(
        "Complete the required fields and select a branch and department.",
      );
      return;
    }
    setValidationError(null);
    create.mutate({
      branchId: text("branchId"),
      departmentId: text("departmentId"),
      firstName: text("firstName"),
      lastName: text("lastName"),
      email: text("email"),
      contactNumber: text("contactNumber"),
      residentialAddress: text("residentialAddress"),
      dateOfBirth: birth,
      gender: text("gender"),
      civilStatus: text("civilStatus"),
      tin: text("tin"),
      sssNo: text("sssNo"),
      philhealthNo: text("philhealthNo"),
      pagibigNo: text("pagibigNo"),
      bankName: text("bankName"),
      bankAccountNumber: text("bankAccountNumber"),
      bankAccountName: text("bankAccountName"),
      hireDate: hire,
      employmentType: text("employmentType") as
        | "REGULAR"
        | "PROBATIONARY"
        | "CONTRACTUAL"
        | "PROJECT_BASED"
        | "PART_TIME",
      payBasis,
      monthlyBasicRatePesos,
      dailyBasicRatePesos,
      hourlyBasicRatePesos,
      isManagerial,
      isTaxExempt,
    });
  }

  return (
    <section
      id="employee-create-form"
      aria-label="Create employee"
      className="flex flex-col h-full min-h-0 bg-background"
    >
      <SheetHeader className="flex-none border-b bg-card/60 px-6 py-5 backdrop-blur-sm pr-12 text-left">
        <div className="flex flex-col gap-1 text-left">
          <SheetTitle className="font-heading text-lg font-semibold tracking-tight text-foreground">
            Create employee
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            HR/admin only. Creates an employee and compensation profile, not a
            login account. All profile fields are required; do not enter
            placeholder identifiers.
          </SheetDescription>
        </div>
      </SheetHeader>
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {options.isPending ? (
          <p role="status">Loading branches and departments…</p>
        ) : options.isError && !options.data ? (
          <p role="alert">
            Could not load branches and departments.{" "}
            <Button
              type="button"
              variant="outline"
              onClick={() => void options.refetch()}
            >
              Retry
            </Button>
          </p>
        ) : !options.data?.branches.length ||
          !options.data.departments.length ? (
          <p role="alert">
            A branch and department must be configured for this organization
            before creating employees.
          </p>
        ) : (
          <form onSubmit={submit}>
            {options.isError && (
              <p role="alert" className="mb-4">
                Could not refresh branches and departments. Previously loaded
                choices and your draft have been kept; the API still validates
                the selected organization choices when saving.{" "}
                <Button
                  type="button"
                  variant="outline"
                  disabled={create.isPending}
                  onClick={() => void options.refetch()}
                >
                  Retry choices
                </Button>
              </p>
            )}
            <FieldGroup>
              <FieldSet disabled={create.isPending}>
                <FieldLegend>Personal information</FieldLegend>
                <TextFields fields={profileFields} />
              </FieldSet>
              <FieldSet disabled={create.isPending}>
                <FieldLegend>Employment and compensation</FieldLegend>
                <Field>
                  <FieldLabel htmlFor="employee-branch">Branch</FieldLabel>
                  <Select
                    name="branchId"
                    items={options.data.branches.map((b) => ({
                      value: b.id,
                      label: `${b.name} · ${b.code}`,
                    }))}
                    required
                  >
                    <SelectTrigger id="employee-branch" className="w-full">
                      <SelectValue placeholder="Select a branch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {options.data.branches.map((branch) => (
                          <SelectItem key={branch.id} value={branch.id}>
                            {branch.name} · {branch.code}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="employee-department">
                    Department
                  </FieldLabel>
                  <Select
                    name="departmentId"
                    items={options.data.departments.map((d) => ({
                      value: d.id,
                      label: `${d.name} · ${d.code}`,
                    }))}
                    required
                  >
                    <SelectTrigger id="employee-department" className="w-full">
                      <SelectValue placeholder="Select a department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {options.data.departments.map((department) => (
                          <SelectItem key={department.id} value={department.id}>
                            {department.name} · {department.code}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <TextFields
                  fields={[
                    {
                      name: "hireDate",
                      label: "Hire date",
                      type: "date",
                      captionLayout: "dropdown",
                    },
                  ]}
                />
                <Field>
                  <FieldLabel htmlFor="employee-employment-type">
                    Employment type
                  </FieldLabel>
                  <Select
                    name="employmentType"
                    items={EMPLOYMENT_TYPES}
                    required
                  >
                    <SelectTrigger
                      id="employee-employment-type"
                      className="w-full"
                    >
                      <SelectValue placeholder="Select employment type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {EMPLOYMENT_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="employee-pay-basis">
                    Pay basis
                  </FieldLabel>
                  <Select
                    name="payBasis"
                    items={PAY_BASIS_ITEMS}
                    value={payBasis}
                    onValueChange={(val) => {
                      if (val)
                        setPayBasis(val as "MONTHLY" | "DAILY" | "HOURLY");
                    }}
                    required
                  >
                    <SelectTrigger id="employee-pay-basis" className="w-full">
                      <SelectValue placeholder="Select pay basis" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {PAY_BASIS_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                {payBasis === "MONTHLY" && (
                  <Field>
                    <FieldLabel htmlFor="employee-monthly-rate">
                      Monthly basic rate (PHP)
                    </FieldLabel>
                    <Input
                      id="employee-monthly-rate"
                      name="monthlyBasicRatePesos"
                      type="number"
                      min="0.01"
                      max={Number.MAX_SAFE_INTEGER / 100}
                      step="0.01"
                      required
                    />
                    <FieldDescription>
                      Daily rate is derived using 261 days/year and hourly rate
                      using 8 hours/day.
                    </FieldDescription>
                  </Field>
                )}
                {payBasis === "DAILY" && (
                  <Field>
                    <FieldLabel htmlFor="employee-daily-rate">
                      Daily basic rate (PHP)
                    </FieldLabel>
                    <Input
                      id="employee-daily-rate"
                      name="dailyBasicRatePesos"
                      type="number"
                      min="0.01"
                      max={Number.MAX_SAFE_INTEGER / 100}
                      step="0.01"
                      required
                    />
                    <FieldDescription>
                      Monthly equivalent is derived using 261 days/year and
                      hourly rate using 8 hours/day.
                    </FieldDescription>
                  </Field>
                )}
                {payBasis === "HOURLY" && (
                  <Field>
                    <FieldLabel htmlFor="employee-hourly-rate">
                      Hourly basic rate (PHP)
                    </FieldLabel>
                    <Input
                      id="employee-hourly-rate"
                      name="hourlyBasicRatePesos"
                      type="number"
                      min="0.01"
                      max={Number.MAX_SAFE_INTEGER / 100}
                      step="0.01"
                      required
                    />
                    <FieldDescription>
                      Daily rate is derived using 8 hours/day and monthly
                      equivalent using 261 days/year.
                    </FieldDescription>
                  </Field>
                )}
                <Field orientation="horizontal">
                  <Checkbox
                    id="employee-managerial"
                    checked={isManagerial}
                    onCheckedChange={setIsManagerial}
                  />
                  <FieldLabel htmlFor="employee-managerial">
                    Managerial employee (PD 851 exclusion)
                  </FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <Checkbox
                    id="employee-tax-exempt"
                    checked={isTaxExempt}
                    onCheckedChange={setIsTaxExempt}
                  />
                  <FieldLabel htmlFor="employee-tax-exempt">
                    Tax exempt (requires verified eligibility)
                  </FieldLabel>
                </Field>
                <FieldDescription>
                  These are legal classifications, not inferred from job title
                  or salary. Verify eligibility before selecting either flag.
                </FieldDescription>
              </FieldSet>
              <FieldSet disabled={create.isPending}>
                <FieldLegend>Statutory and bank information</FieldLegend>
                <TextFields fields={statutoryFields} />
                <FieldDescription>
                  Identifiers are recorded as entered, not independently
                  verified. This does not enable bank transfers.
                </FieldDescription>
              </FieldSet>
              {validationError && <FieldError>{validationError}</FieldError>}
              {create.isError && (
                <FieldError>
                  {create.error.data?.code === "CONFLICT"
                    ? "An employee record already exists. Check the email and retry."
                    : create.error.data?.code === "BAD_REQUEST"
                      ? "Employee details were rejected. Check all fields, branch, department and dates, then retry."
                      : "Could not create employee. Your entries have been kept; please retry."}
                </FieldError>
              )}
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Creating employee…" : "Create employee"}
              </Button>
            </FieldGroup>
          </form>
        )}
      </div>
    </section>
  );
}

function formatDateInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function EmployeeDetails({
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

          {canEdit && details.data && !isEditing && (
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                Edit employee
              </Button>
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

function EditEmployeeForm({
  employee,
  onCancel,
  onUpdated,
}: {
  employee: EmployeeData;
  onCancel: () => void;
  onUpdated: () => void;
}) {
  const options = trpc.employees.getRegistrationOptions.useQuery(undefined, {
    retry: false,
  });
  const utils = trpc.useUtils();
  const [validationError, setValidationError] = useState<string | null>(null);
  const [payBasis, setPayBasis] = useState<"MONTHLY" | "DAILY" | "HOURLY">(
    employee.payBasis ?? "MONTHLY",
  );
  const [isManagerial, setIsManagerial] = useState(
    employee.isManagerial ?? false,
  );
  const [isTaxExempt, setIsTaxExempt] = useState(
    employee.compensation?.isTaxExempt ?? false,
  );

  const update = trpc.employees.update.useMutation({
    onSuccess: () => {
      void utils.employees.list.invalidate();
      void utils.employees.getById.invalidate({ id: employee.id });
      onUpdated();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (update.isPending) return;
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    const birth = text("dateOfBirth");
    const hire = text("hireDate");
    const regularization = text("regularizationDate") || null;
    const resignation = text("resignationDate") || null;

    if (birth > new Date().toISOString().slice(0, 10) || hire < birth) {
      setValidationError(
        "Date of birth cannot be in the future, and hire date cannot precede date of birth.",
      );
      return;
    }
    if (regularization && regularization < hire) {
      setValidationError("Regularization date cannot precede hire date.");
      return;
    }
    if (resignation && resignation < hire) {
      setValidationError("Resignation date cannot precede hire date.");
      return;
    }

    let monthlyBasicRatePesos: number | undefined;
    let dailyBasicRatePesos: number | undefined;
    let hourlyBasicRatePesos: number | undefined;

    if (payBasis === "MONTHLY") {
      monthlyBasicRatePesos = Number(text("monthlyBasicRatePesos"));
      if (
        !/^\d+(?:\.\d{1,2})?$/.test(text("monthlyBasicRatePesos")) ||
        !Number.isFinite(monthlyBasicRatePesos) ||
        monthlyBasicRatePesos <= 0 ||
        !Number.isSafeInteger(Math.round(monthlyBasicRatePesos * 100))
      ) {
        setValidationError(
          "Enter a positive monthly basic rate with at most two decimal places.",
        );
        return;
      }
    } else if (payBasis === "DAILY") {
      dailyBasicRatePesos = Number(text("dailyBasicRatePesos"));
      if (
        !/^\d+(?:\.\d{1,2})?$/.test(text("dailyBasicRatePesos")) ||
        !Number.isFinite(dailyBasicRatePesos) ||
        dailyBasicRatePesos <= 0 ||
        !Number.isSafeInteger(Math.round(dailyBasicRatePesos * 100))
      ) {
        setValidationError(
          "Enter a positive daily basic rate with at most two decimal places.",
        );
        return;
      }
    } else if (payBasis === "HOURLY") {
      hourlyBasicRatePesos = Number(text("hourlyBasicRatePesos"));
      if (
        !/^\d+(?:\.\d{1,2})?$/.test(text("hourlyBasicRatePesos")) ||
        !Number.isFinite(hourlyBasicRatePesos) ||
        hourlyBasicRatePesos <= 0 ||
        !Number.isSafeInteger(Math.round(hourlyBasicRatePesos * 100))
      ) {
        setValidationError(
          "Enter a positive hourly basic rate with at most two decimal places.",
        );
        return;
      }
    }

    if (
      !text("firstName") ||
      !text("lastName") ||
      !text("email") ||
      !text("contactNumber") ||
      !text("residentialAddress") ||
      !text("branchId") ||
      !text("departmentId") ||
      !text("tin") ||
      !text("sssNo") ||
      !text("philhealthNo") ||
      !text("pagibigNo") ||
      !text("bankName") ||
      !text("bankAccountNumber") ||
      !text("bankAccountName")
    ) {
      setValidationError(
        "Complete all required fields and select a branch and department.",
      );
      return;
    }

    setValidationError(null);
    update.mutate({
      id: employee.id,
      branchId: text("branchId"),
      departmentId: text("departmentId"),
      firstName: text("firstName"),
      middleName: text("middleName") || null,
      lastName: text("lastName"),
      suffix: text("suffix") || null,
      email: text("email"),
      contactNumber: text("contactNumber"),
      residentialAddress: text("residentialAddress"),
      dateOfBirth: birth,
      gender: text("gender"),
      civilStatus: text("civilStatus"),
      tin: text("tin"),
      sssNo: text("sssNo"),
      philhealthNo: text("philhealthNo"),
      pagibigNo: text("pagibigNo"),
      bankName: text("bankName"),
      bankAccountNumber: text("bankAccountNumber"),
      bankAccountName: text("bankAccountName"),
      hireDate: hire,
      regularizationDate: regularization,
      resignationDate: resignation,
      employmentType: text("employmentType") as
        | "REGULAR"
        | "PROBATIONARY"
        | "CONTRACTUAL"
        | "PROJECT_BASED"
        | "PART_TIME",
      employmentStatus: text("employmentStatus") as
        | "ACTIVE"
        | "ON_LEAVE"
        | "SUSPENDED"
        | "RESIGNED"
        | "TERMINATED"
        | "RETIRED",
      payBasis,
      monthlyBasicRatePesos,
      dailyBasicRatePesos,
      hourlyBasicRatePesos,
      isManagerial,
      isTaxExempt,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {options.isError && (
        <p role="alert" className="text-sm text-destructive">
          Could not refresh branches and departments. Loaded choices have been
          kept.
        </p>
      )}
      <FieldGroup>
        <FieldSet disabled={update.isPending}>
          <FieldLegend>Personal information</FieldLegend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="edit-first-name">First name</FieldLabel>
              <Input
                id="edit-first-name"
                name="firstName"
                defaultValue={employee.firstName}
                maxLength={100}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-middle-name">Middle name</FieldLabel>
              <Input
                id="edit-middle-name"
                name="middleName"
                defaultValue={employee.middleName ?? ""}
                maxLength={100}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-last-name">Last name</FieldLabel>
              <Input
                id="edit-last-name"
                name="lastName"
                defaultValue={employee.lastName}
                maxLength={100}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-suffix">Suffix</FieldLabel>
              <Input
                id="edit-suffix"
                name="suffix"
                defaultValue={employee.suffix ?? ""}
                maxLength={20}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-email">Employee email</FieldLabel>
              <Input
                id="edit-email"
                name="email"
                type="email"
                defaultValue={employee.email}
                maxLength={320}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-contact-number">
                Contact number
              </FieldLabel>
              <Input
                id="edit-contact-number"
                name="contactNumber"
                type="tel"
                defaultValue={employee.contactNumber}
                maxLength={50}
                required
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="edit-address">
                Residential address
              </FieldLabel>
              <Input
                id="edit-address"
                name="residentialAddress"
                defaultValue={employee.residentialAddress}
                maxLength={500}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-dob">Date of birth</FieldLabel>
              <DatePicker
                id="edit-dob"
                name="dateOfBirth"
                defaultValue={formatDateInput(employee.dateOfBirth)}
                required
                captionLayout="dropdown"
                min="1900-01-01"
                max={todayIso}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-gender">Gender</FieldLabel>
              <Input
                id="edit-gender"
                name="gender"
                defaultValue={employee.gender}
                maxLength={50}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-civil-status">Civil status</FieldLabel>
              <Input
                id="edit-civil-status"
                name="civilStatus"
                defaultValue={employee.civilStatus}
                maxLength={50}
                required
              />
            </Field>
          </div>
        </FieldSet>

        <FieldSet disabled={update.isPending}>
          <FieldLegend>Employment and compensation</FieldLegend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="edit-branch">Branch</FieldLabel>
              <Select
                name="branchId"
                defaultValue={employee.branchId ?? employee.branch?.id}
                items={options.data?.branches?.map((b) => ({
                  value: b.id,
                  label: `${b.name} · ${b.code}`,
                }))}
                required
              >
                <SelectTrigger id="edit-branch" className="w-full">
                  <SelectValue placeholder="Select a branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {options.data?.branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} · {b.code}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-department">Department</FieldLabel>
              <Select
                name="departmentId"
                defaultValue={employee.departmentId ?? employee.department?.id}
                items={options.data?.departments?.map((d) => ({
                  value: d.id,
                  label: `${d.name} · ${d.code}`,
                }))}
                required
              >
                <SelectTrigger id="edit-department" className="w-full">
                  <SelectValue placeholder="Select a department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {options.data?.departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name} · {d.code}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-hire-date">Hire date</FieldLabel>
              <DatePicker
                id="edit-hire-date"
                name="hireDate"
                defaultValue={formatDateInput(employee.hireDate)}
                required
                captionLayout="dropdown"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-regularization-date">
                Regularization date
              </FieldLabel>
              <DatePicker
                id="edit-regularization-date"
                name="regularizationDate"
                defaultValue={formatDateInput(employee.regularizationDate)}
                captionLayout="dropdown"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-resignation-date">
                Resignation / Exit date
              </FieldLabel>
              <DatePicker
                id="edit-resignation-date"
                name="resignationDate"
                defaultValue={formatDateInput(employee.resignationDate)}
                captionLayout="dropdown"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-employment-type">
                Employment type
              </FieldLabel>
              <Select
                name="employmentType"
                defaultValue={employee.employmentType}
                items={EMPLOYMENT_TYPES}
                required
              >
                <SelectTrigger id="edit-employment-type" className="w-full">
                  <SelectValue placeholder="Select employment type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {EMPLOYMENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-employment-status">
                Employment status
              </FieldLabel>
              <Select
                name="employmentStatus"
                defaultValue={employee.employmentStatus}
                items={EMPLOYMENT_STATUSES}
                required
              >
                <SelectTrigger id="edit-employment-status" className="w-full">
                  <SelectValue placeholder="Select employment status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {EMPLOYMENT_STATUSES.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-pay-basis">Pay basis</FieldLabel>
              <Select
                name="payBasis"
                items={PAY_BASIS_ITEMS}
                value={payBasis}
                onValueChange={(val) => {
                  if (val) setPayBasis(val as "MONTHLY" | "DAILY" | "HOURLY");
                }}
                required
              >
                <SelectTrigger id="edit-pay-basis" className="w-full">
                  <SelectValue placeholder="Select pay basis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {PAY_BASIS_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {payBasis === "MONTHLY" && (
              <Field>
                <FieldLabel htmlFor="edit-monthly-rate">
                  Monthly basic rate (PHP)
                </FieldLabel>
                <Input
                  id="edit-monthly-rate"
                  name="monthlyBasicRatePesos"
                  type="number"
                  min="0.01"
                  max={Number.MAX_SAFE_INTEGER / 100}
                  step="0.01"
                  defaultValue={
                    employee.compensation
                      ? (
                          Number(employee.compensation.basicRateMonthlyCents) /
                          100
                        ).toFixed(2)
                      : ""
                  }
                  required
                />
              </Field>
            )}
            {payBasis === "DAILY" && (
              <Field>
                <FieldLabel htmlFor="edit-daily-rate">
                  Daily basic rate (PHP)
                </FieldLabel>
                <Input
                  id="edit-daily-rate"
                  name="dailyBasicRatePesos"
                  type="number"
                  min="0.01"
                  max={Number.MAX_SAFE_INTEGER / 100}
                  step="0.01"
                  defaultValue={
                    employee.compensation
                      ? (
                          Number(employee.compensation.basicRateDailyCents) /
                          100
                        ).toFixed(2)
                      : ""
                  }
                  required
                />
              </Field>
            )}
            {payBasis === "HOURLY" && (
              <Field>
                <FieldLabel htmlFor="edit-hourly-rate">
                  Hourly basic rate (PHP)
                </FieldLabel>
                <Input
                  id="edit-hourly-rate"
                  name="hourlyBasicRatePesos"
                  type="number"
                  min="0.01"
                  max={Number.MAX_SAFE_INTEGER / 100}
                  step="0.01"
                  defaultValue={
                    employee.compensation
                      ? (
                          Number(employee.compensation.basicRateHourlyCents) /
                          100
                        ).toFixed(2)
                      : ""
                  }
                  required
                />
              </Field>
            )}
          </div>
          <div className="space-y-2 pt-2">
            <Field orientation="horizontal">
              <Checkbox
                id="edit-managerial"
                checked={isManagerial}
                onCheckedChange={setIsManagerial}
              />
              <FieldLabel htmlFor="edit-managerial">
                Managerial employee (PD 851 exclusion)
              </FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="edit-tax-exempt"
                checked={isTaxExempt}
                onCheckedChange={setIsTaxExempt}
              />
              <FieldLabel htmlFor="edit-tax-exempt">
                Tax exempt (requires verified eligibility)
              </FieldLabel>
            </Field>
          </div>
        </FieldSet>

        <FieldSet disabled={update.isPending}>
          <FieldLegend>Statutory and bank information</FieldLegend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="edit-tin">TIN</FieldLabel>
              <Input
                id="edit-tin"
                name="tin"
                defaultValue={employee.tin}
                maxLength={50}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-sss">SSS number</FieldLabel>
              <Input
                id="edit-sss"
                name="sssNo"
                defaultValue={employee.sssNo}
                maxLength={50}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-philhealth">
                PhilHealth number
              </FieldLabel>
              <Input
                id="edit-philhealth"
                name="philhealthNo"
                defaultValue={employee.philhealthNo}
                maxLength={50}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-pagibig">Pag-IBIG number</FieldLabel>
              <Input
                id="edit-pagibig"
                name="pagibigNo"
                defaultValue={employee.pagibigNo}
                maxLength={50}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-bank-name">Bank name</FieldLabel>
              <Input
                id="edit-bank-name"
                name="bankName"
                defaultValue={employee.bankName}
                maxLength={100}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-bank-account-number">
                Bank account number
              </FieldLabel>
              <Input
                id="edit-bank-account-number"
                name="bankAccountNumber"
                defaultValue={employee.bankAccountNumber}
                maxLength={100}
                required
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="edit-bank-account-name">
                Bank account name
              </FieldLabel>
              <Input
                id="edit-bank-account-name"
                name="bankAccountName"
                defaultValue={employee.bankAccountName}
                maxLength={200}
                required
              />
            </Field>
          </div>
        </FieldSet>

        {validationError && <FieldError>{validationError}</FieldError>}
        {update.isError && (
          <FieldError>
            {update.error.data?.code === "CONFLICT"
              ? "An employee record already exists with this email."
              : update.error.data?.code === "BAD_REQUEST"
                ? update.error.message ||
                  "Employee details were rejected. Please review fields and dates."
                : "Could not update employee. Please retry."}
          </FieldError>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? "Saving changes…" : "Save changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={update.isPending}
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function EmployeeProfile({ employee }: { employee: EmployeeData }) {
  const compensation = employee.compensation;
  const fullName = [
    employee.firstName,
    employee.middleName,
    employee.lastName,
    employee.suffix,
  ]
    .filter(Boolean)
    .join(" ");

  const primaryRate = compensation
    ? employee.payBasis === "DAILY"
      ? pesos(compensation.basicRateDailyCents)
      : employee.payBasis === "HOURLY"
        ? pesos(compensation.basicRateHourlyCents)
        : pesos(compensation.basicRateMonthlyCents)
    : "Not recorded";

  const primaryRateUnit =
    employee.payBasis === "DAILY"
      ? "Per day"
      : employee.payBasis === "HOURLY"
        ? "Per hour"
        : "Per month";

  return (
    <div className="space-y-6">
      {/* Quick KPI Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="text-xs font-medium text-muted-foreground">
            Basic Rate ({employee.payBasis})
          </div>
          <div className="mt-1 text-xl font-bold tracking-tight text-foreground">
            {primaryRate}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {primaryRateUnit}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="text-xs font-medium text-muted-foreground">
            Computed Equivalent
          </div>
          <div className="mt-1 text-sm font-semibold text-foreground">
            {compensation ? pesos(compensation.basicRateDailyCents) : "—"} / day
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {compensation ? pesos(compensation.basicRateHourlyCents) : "—"} / hr
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="text-xs font-medium text-muted-foreground">
            Status & Role
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span
              className={cn(
                "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium tracking-tight",
                getStatusBadgeClassName(employee.employmentStatus ?? "ACTIVE"),
              )}
            >
              {formatEmploymentStatus(employee.employmentStatus ?? "ACTIVE")}
            </span>
            <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
              {employee.isManagerial ? "Managerial" : "Rank-and-file"}
            </span>
          </div>
        </div>
      </div>

      {/* Section 1: Employment Details */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="border-b bg-muted/30 px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Employment Details
          </h3>
        </div>
        <div className="divide-y divide-border/50 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Employee number</span>
            <span className="sm:col-span-2 font-mono font-medium text-foreground">
              {employee.employeeNumber}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Branch</span>
            <span className="sm:col-span-2 font-medium text-foreground">
              {employee.branch?.name ?? "Not recorded"}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Department</span>
            <span className="sm:col-span-2 font-medium text-foreground">
              {employee.department?.name ?? "Not recorded"}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Employment type</span>
            <span className="sm:col-span-2 font-medium text-foreground">
              {formatEmploymentType(employee.employmentType)}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Employment status</span>
            <span className="sm:col-span-2 font-medium text-foreground">
              {formatEmploymentStatus(employee.employmentStatus)}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Hire date</span>
            <span className="sm:col-span-2 font-medium text-foreground">
              {date(employee.hireDate)}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Regularization date</span>
            <span className="sm:col-span-2 font-medium text-foreground">
              {employee.regularizationDate
                ? date(employee.regularizationDate)
                : "Not recorded"}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">
              Resignation / Exit date
            </span>
            <span className="sm:col-span-2 font-medium text-foreground">
              {employee.resignationDate
                ? date(employee.resignationDate)
                : "Not recorded"}
            </span>
          </div>
        </div>
      </div>

      {/* Section 2: Compensation & Statutory Classification */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="border-b bg-muted/30 px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Compensation & Statutory Profile
          </h3>
        </div>
        <div className="divide-y divide-border/50 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Pay basis</span>
            <span className="sm:col-span-2 font-medium text-foreground capitalize">
              {employee.payBasis?.toLowerCase()}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Monthly basic rate</span>
            <span className="sm:col-span-2 font-semibold text-foreground">
              {compensation
                ? pesos(compensation.basicRateMonthlyCents)
                : "Not recorded"}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Daily basic rate</span>
            <span className="sm:col-span-2 font-medium text-foreground">
              {compensation
                ? pesos(compensation.basicRateDailyCents)
                : "Not recorded"}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Hourly basic rate</span>
            <span className="sm:col-span-2 font-medium text-foreground">
              {compensation
                ? pesos(compensation.basicRateHourlyCents)
                : "Not recorded"}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">
              Compensation effective date
            </span>
            <span className="sm:col-span-2 font-medium text-foreground">
              {date(compensation?.effectiveDate)}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Managerial</span>
            <span className="sm:col-span-2 font-medium text-foreground">
              {employee.isManagerial ? "Yes" : "No"}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Tax exempt</span>
            <span className="sm:col-span-2 font-medium text-foreground">
              {compensation
                ? compensation.isTaxExempt
                  ? "Yes"
                  : "No"
                : "Not recorded"}
            </span>
          </div>
        </div>
      </div>

      {/* Section 3: Personal Information */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="border-b bg-muted/30 px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Personal Information
          </h3>
        </div>
        <div className="divide-y divide-border/50 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Name</span>
            <span className="sm:col-span-2 font-medium text-foreground">
              {fullName}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Email</span>
            <span className="sm:col-span-2 font-medium text-foreground break-all">
              {employee.email}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Contact number</span>
            <span className="sm:col-span-2 font-medium text-foreground">
              {employee.contactNumber}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Residential address</span>
            <span className="sm:col-span-2 font-medium text-foreground break-words">
              {employee.residentialAddress}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Date of birth</span>
            <span className="sm:col-span-2 font-medium text-foreground">
              {date(employee.dateOfBirth)}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Gender</span>
            <span className="sm:col-span-2 font-medium text-foreground">
              {employee.gender}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Civil status</span>
            <span className="sm:col-span-2 font-medium text-foreground">
              {employee.civilStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Section 4: Government Statutory Identifiers & Banking */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="border-b bg-muted/30 px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Government Identifiers & Disbursement Bank
          </h3>
        </div>
        <div className="divide-y divide-border/50 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">TIN</span>
            <span className="sm:col-span-2 font-mono font-medium text-foreground">
              {masked(employee.tin)}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">SSS number</span>
            <span className="sm:col-span-2 font-mono font-medium text-foreground">
              {masked(employee.sssNo)}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">PhilHealth number</span>
            <span className="sm:col-span-2 font-mono font-medium text-foreground">
              {masked(employee.philhealthNo)}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Pag-IBIG number</span>
            <span className="sm:col-span-2 font-mono font-medium text-foreground">
              {masked(employee.pagibigNo)}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Bank</span>
            <span className="sm:col-span-2 font-medium text-foreground">
              {employee.bankName}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Bank account number</span>
            <span className="sm:col-span-2 font-mono font-medium text-foreground">
              {masked(employee.bankAccountNumber)}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 p-3 sm:px-4 gap-1 items-center">
            <span className="text-muted-foreground">Bank account name</span>
            <span className="sm:col-span-2 font-medium text-foreground">
              {employee.bankAccountName}
            </span>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground px-1 leading-relaxed">
        Government and bank identifiers are masked in this view. Stored
        identifiers and tax classifications still require verification.
      </p>
    </div>
  );
}
