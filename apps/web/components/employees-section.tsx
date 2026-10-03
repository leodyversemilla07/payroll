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
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select";
import { type FormEvent, useState } from "react";
import { trpc } from "@/lib/trpc";

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
                setShowCreate((value) => !value);
                setCreatedNumber(null);
              }}
            >
              {showCreate ? "Cancel employee creation" : "Add employee"}
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
            <p role="status">Loading employees…</p>
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
            <ul className="space-y-2">
              {employees.data.map((employee) => (
                <li key={employee.id}>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto w-full flex-col items-start whitespace-normal p-3 text-left"
                    aria-pressed={selectedId === employee.id}
                    onClick={() => setSelectedId(employee.id)}
                  >
                    <strong className="max-w-full break-words">
                      {employee.firstName} {employee.lastName}
                    </strong>
                    <span className="max-w-full break-words text-sm text-muted-foreground">
                      {employee.employeeNumber} ·{" "}
                      {employee.employmentStatus.replaceAll("_", " ")}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
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
      {selectedId && (
        <EmployeeDetails
          key={selectedId}
          id={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
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
}: {
  onCreated: (employee: { id: string; employeeNumber: string }) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const options = trpc.employees.getRegistrationOptions.useQuery(undefined, {
    retry: false,
  });
  const utils = trpc.useUtils();
  const [validationError, setValidationError] = useState<string | null>(null);
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
    const monthlyBasicRatePesos = Number(text("monthlyBasicRatePesos"));
    const birth = text("dateOfBirth");
    const hire = text("hireDate");
    if (birth > new Date().toISOString().slice(0, 10) || hire < birth) {
      setValidationError(
        "Date of birth cannot be in the future, and hire date cannot precede date of birth.",
      );
      return;
    }
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
      monthlyBasicRatePesos,
      isManagerial,
      isTaxExempt,
    });
  }

  return (
    <Card id="employee-create-form" role="region" aria-label="Create employee">
      <CardHeader>
        <CardTitle>Create employee</CardTitle>
        <CardDescription>
          HR/admin only. Creates a monthly-paid employee and compensation
          profile, not a login account. All profile fields are required; do not
          enter placeholder identifiers.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
                  <NativeSelect
                    id="employee-branch"
                    name="branchId"
                    defaultValue=""
                    className="w-full"
                    required
                  >
                    <NativeSelectOption value="">
                      Select a branch
                    </NativeSelectOption>
                    {options.data.branches.map((branch) => (
                      <NativeSelectOption key={branch.id} value={branch.id}>
                        {branch.name} · {branch.code}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="employee-department">
                    Department
                  </FieldLabel>
                  <NativeSelect
                    id="employee-department"
                    name="departmentId"
                    defaultValue=""
                    className="w-full"
                    required
                  >
                    <NativeSelectOption value="">
                      Select a department
                    </NativeSelectOption>
                    {options.data.departments.map((department) => (
                      <NativeSelectOption
                        key={department.id}
                        value={department.id}
                      >
                        {department.name} · {department.code}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
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
                  <NativeSelect
                    id="employee-employment-type"
                    name="employmentType"
                    defaultValue=""
                    className="w-full"
                    required
                  >
                    <NativeSelectOption value="">
                      Select employment type
                    </NativeSelectOption>
                    {[
                      "REGULAR",
                      "PROBATIONARY",
                      "CONTRACTUAL",
                      "PROJECT_BASED",
                      "PART_TIME",
                    ].map((type) => (
                      <NativeSelectOption key={type} value={type}>
                        {type.replaceAll("_", " ")}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
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
                    Current API derives the daily rate using 261 days/year and
                    the hourly rate using 8 hours/day. Daily/hourly hiring is
                    not supported by this form.
                  </FieldDescription>
                </Field>
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

function EmployeeDetails({ id, onClose }: { id: string; onClose: () => void }) {
  const details = trpc.employees.getById.useQuery({ id }, { retry: false });
  return (
    <Card role="region" aria-label="Employee details">
      <CardHeader>
        <CardTitle>Employee details</CardTitle>
        <CardDescription>
          Read-only profile. Editing and login account management are separate
          workflows.
        </CardDescription>
        <Button type="button" variant="outline" onClick={onClose}>
          Close employee details
        </Button>
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
        ) : (
          <EmployeeProfile employee={details.data} />
        )}
      </CardContent>
    </Card>
  );
}

function EmployeeProfile({ employee }: { employee: EmployeeData }) {
  const compensation = employee.compensation;
  const rows = [
    ["Name", `${employee.firstName} ${employee.lastName}`],
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
      <dl className="space-y-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="break-words">{value || "Not recorded"}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">
        Government and bank identifiers are masked in this view. Stored
        identifiers and tax classifications still require verification.
      </p>
    </div>
  );
}
