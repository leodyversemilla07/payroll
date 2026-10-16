"use client";

import { cn } from "@workspace/ui/lib/utils";
import {
  formatEmploymentStatus,
  formatEmploymentType,
  getStatusBadgeClassName,
} from "./employee-data-table";
import { date, type EmployeeData, masked, pesos } from "./employees-shared";

export function EmployeeProfile({ employee }: { employee: EmployeeData }) {
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
