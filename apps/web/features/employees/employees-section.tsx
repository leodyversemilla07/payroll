"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@workspace/api";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Checkbox } from "@workspace/ui/components/checkbox";
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
import { Sheet, SheetContent } from "@workspace/ui/components/sheet";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@workspace/ui/components/table";
import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { trpc } from "@/lib/trpc";
import { EmployeeDataTable } from "./employee-data-table";

const EMPLOYMENT_TYPES = [
  "REGULAR",
  "PROBATIONARY",
  "CONTRACTUAL",
  "PROJECT_BASED",
  "PART_TIME",
].map((type) => ({ value: type, label: type.replaceAll("_", " ") }));

const EMPLOYMENT_STATUSES = [
  "ACTIVE",
  "ON_LEAVE",
  "SUSPENDED",
  "RESIGNED",
  "TERMINATED",
  "RETIRED",
].map((status) => ({ value: status, label: status.replaceAll("_", " ") }));

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
  const employees = trpc.employees.list.useQuery(undefined, { retry: false });
  const [showCreate, setShowCreate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createdNumber, setCreatedNumber] = useState<string | null>(null);

  return (
    <div className="min-w-0 space-y-6">
      <Card role="region" aria-label="Employees">
        <CardHeader>
          <CardTitle>Employees</CardTitle>
          {canCreate && (
            <Button
              type="button"
              variant="outline"
              aria-expanded={showCreate}
              aria-controls="employee-create-form"
              disabled={isCreating}
              onClick={() => {
                setShowCreate(true);
                setCreatedNumber(null);
              }}
            >
              Add employee
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {createdNumber && (
            <p role="status" className="mb-4 break-words">
              Employee {createdNumber} created. No login account was created.
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
            <p>No employees found.</p>
          ) : (
            <EmployeeDataTable
              data={employees.data}
              selectedId={selectedId}
              onSelectEmployee={(id) => setSelectedId(id)}
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
          showCloseButton={false}
          className="w-full sm:max-w-xl md:max-w-2xl overflow-y-auto p-0"
        >
          {canCreate && showCreate && (
            <CreateEmployeeForm
              isCreating={isCreating}
              onPendingChange={setIsCreating}
              onCancel={() => {
                setShowCreate(false);
                setCreatedNumber(null);
              }}
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
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-full sm:max-w-xl md:max-w-2xl overflow-y-auto p-0"
        >
          {selectedId && (
            <EmployeeDetails
              key={selectedId}
              id={selectedId}
              canEdit={canCreate}
              onClose={() => setSelectedId(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

const profileFields = [
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
  { name: "dateOfBirth", label: "Date of birth", type: "date" },
  { name: "gender", label: "Gender", maxLength: 50 },
  { name: "civilStatus", label: "Civil status", maxLength: 50 },
] as const;
const statutoryFields = [
  { name: "tin", label: "TIN", maxLength: 50 },
  { name: "sssNo", label: "SSS number", maxLength: 50 },
  { name: "philhealthNo", label: "PhilHealth number", maxLength: 50 },
  { name: "pagibigNo", label: "Pag-IBIG number", maxLength: 50 },
  { name: "bankName", label: "Bank name", maxLength: 100 },
  { name: "bankAccountNumber", label: "Bank account number", maxLength: 100 },
  { name: "bankAccountName", label: "Bank account name", maxLength: 200 },
] as const;

function TextFields({
  fields,
}: {
  fields: readonly {
    name: string;
    label: string;
    maxLength?: number;
    type?: string;
  }[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => (
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
      ))}
    </div>
  );
}

function CreateEmployeeForm({
  onCreated,
  onPendingChange,
  onCancel,
  isCreating,
}: {
  onCreated: (employee: { id: string; employeeNumber: string }) => void;
  onPendingChange: (pending: boolean) => void;
  onCancel: () => void;
  isCreating: boolean;
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
    <Card
      id="employee-create-form"
      role="region"
      aria-label="Create employee"
      className="border-0 shadow-none rounded-none bg-transparent"
    >
      <CardHeader className="border-b px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>Create employee</CardTitle>
            <CardDescription>
              HR/admin only. Creates an employee and compensation profile, not a
              login account. All profile fields are required; do not enter
              placeholder identifiers.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isCreating}
            onClick={onCancel}
          >
            Cancel employee creation
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-6">
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
                    { name: "hireDate", label: "Hire date", type: "date" },
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
      </CardContent>
    </Card>
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
  onClose,
}: {
  id: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const details = trpc.employees.getById.useQuery({ id }, { retry: false });
  const [isEditing, setIsEditing] = useState(false);

  return (
    <Card
      role="region"
      aria-label="Employee details"
      className="border-0 shadow-none rounded-none bg-transparent"
    >
      <CardHeader className="border-b px-6 py-5">
        <div className="flex flex-col gap-1">
          <CardTitle>Employee details</CardTitle>
          <CardDescription>
            {isEditing
              ? "Update personal, employment, and statutory information."
              : canEdit
                ? "View profile or edit employee details."
                : "Read-only profile."}
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {canEdit && details.data && !isEditing && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditing(true)}
            >
              Edit employee
            </Button>
          )}
          {isEditing && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditing(false)}
            >
              Cancel editing
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            Close employee details
          </Button>
        </div>
      </CardHeader>
      <CardContent>
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
        ) : isEditing ? (
          <EditEmployeeForm
            employee={details.data}
            onCancel={() => setIsEditing(false)}
            onUpdated={() => setIsEditing(false)}
          />
        ) : (
          <EmployeeProfile employee={details.data} />
        )}
      </CardContent>
    </Card>
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
              <Input
                id="edit-dob"
                name="dateOfBirth"
                type="date"
                defaultValue={formatDateInput(employee.dateOfBirth)}
                required
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
              <Input
                id="edit-hire-date"
                name="hireDate"
                type="date"
                defaultValue={formatDateInput(employee.hireDate)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-regularization-date">
                Regularization date
              </FieldLabel>
              <Input
                id="edit-regularization-date"
                name="regularizationDate"
                type="date"
                defaultValue={formatDateInput(employee.regularizationDate)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-resignation-date">
                Resignation / Exit date
              </FieldLabel>
              <Input
                id="edit-resignation-date"
                name="resignationDate"
                type="date"
                defaultValue={formatDateInput(employee.resignationDate)}
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

  const rows = [
    ["Name", fullName],
    ["Employee number", employee.employeeNumber],
    ["Email", employee.email],
    ["Contact number", employee.contactNumber],
    ["Residential address", employee.residentialAddress],
    ["Date of birth", date(employee.dateOfBirth)],
    ["Gender", employee.gender],
    ["Civil status", employee.civilStatus],
    ["Branch", employee.branch?.name ?? "Not recorded"],
    ["Department", employee.department?.name ?? "Not recorded"],
    ["Hire date", date(employee.hireDate)],
    [
      "Regularization date",
      employee.regularizationDate
        ? date(employee.regularizationDate)
        : "Not recorded",
    ],
    [
      "Resignation / Exit date",
      employee.resignationDate
        ? date(employee.resignationDate)
        : "Not recorded",
    ],
    ["Employment type", employee.employmentType?.replaceAll("_", " ")],
    ["Employment status", employee.employmentStatus?.replaceAll("_", " ")],
    ["Pay basis", employee.payBasis],
    [
      "Monthly basic rate",
      compensation ? pesos(compensation.basicRateMonthlyCents) : "Not recorded",
    ],
    [
      "Daily basic rate",
      compensation ? pesos(compensation.basicRateDailyCents) : "Not recorded",
    ],
    [
      "Hourly basic rate",
      compensation ? pesos(compensation.basicRateHourlyCents) : "Not recorded",
    ],
    ["Compensation effective date", date(compensation?.effectiveDate)],
    ["Managerial", employee.isManagerial ? "Yes" : "No"],
    [
      "Tax exempt",
      compensation ? (compensation.isTaxExempt ? "Yes" : "No") : "Not recorded",
    ],
    ["TIN", masked(employee.tin)],
    ["SSS number", masked(employee.sssNo)],
    ["PhilHealth number", masked(employee.philhealthNo)],
    ["Pag-IBIG number", masked(employee.pagibigNo)],
    ["Bank", employee.bankName],
    ["Bank account number", masked(employee.bankAccountNumber)],
    ["Bank account name", employee.bankAccountName],
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card">
        <Table>
          <TableBody>
            {rows.map(([label, value]) => (
              <TableRow key={label}>
                <TableCell className="w-1/3 font-medium text-muted-foreground text-sm py-2">
                  {label}
                </TableCell>
                <TableCell className="break-words py-2 font-normal">
                  {value || "Not recorded"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-sm text-muted-foreground">
        Government and bank identifiers are masked in this view. Stored
        identifiers and tax classifications still require verification.
      </p>
    </div>
  );
}
