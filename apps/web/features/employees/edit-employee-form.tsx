"use client";

import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Field,
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
import { type FormEvent, useState } from "react";
import { DatePicker } from "@/components/date-picker";
import { manilaToday } from "@/lib/attendance-time";
import { trpc } from "@/lib/trpc";
import {
  EMPLOYMENT_STATUSES,
  EMPLOYMENT_TYPES,
  type EmployeeData,
  PAY_BASIS_ITEMS,
  todayIso,
} from "./employees-shared";

function formatDateInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function EditEmployeeForm({
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

    if (birth > manilaToday() || hire < birth) {
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
