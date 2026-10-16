"use client";

import { Button } from "@workspace/ui/components/button";
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
import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { type FormEvent, useState } from "react";
import { DatePicker } from "@/components/date-picker";
import { manilaToday } from "@/lib/attendance-time";
import { trpc } from "@/lib/trpc";
import {
  EMPLOYMENT_TYPES,
  PAY_BASIS_ITEMS,
  type TextFieldConfig,
  todayIso,
} from "./employees-shared";

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

export function CreateEmployeeForm({
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
    if (birth > manilaToday() || hire < birth) {
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
