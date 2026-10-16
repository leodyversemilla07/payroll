"use client";

import {
  ALL_ROLES,
  EMPLOYEE_RECORD_ROLES,
  PAYROLL_ROLES,
  roleIsIn,
  STAFF_ROLES,
} from "@workspace/db/role-matrix";
import {
  Banknote,
  Bell,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  Clock,
  FileCheck,
  Landmark,
  LayoutDashboard,
  ShieldCheck,
  UserCircle,
  Users,
} from "lucide-react";
import { usePathname } from "next/navigation";

export const workspaceSections = [
  {
    id: "dashboard",
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    description:
      "Monitor workforce, payroll, leave and loan metrics at a glance.",
  },
  {
    id: "employees",
    href: "/employees",
    label: "Employees",
    icon: Users,
    description: "View employee profiles and onboard new employees.",
  },
  {
    id: "attendance",
    href: "/attendance",
    label: "Attendance & DTR",
    icon: Clock,
    description: "Review and correct recorded attendance in Asia/Manila.",
  },
  {
    id: "leaves",
    href: "/leaves",
    label: "Leave management",
    icon: CalendarDays,
    description: "Manage recorded credits, requests and decisions.",
  },
  {
    id: "holidays",
    href: "/holidays",
    label: "Holiday calendar",
    icon: CalendarCheck,
    description:
      "Configure Philippine statutory regular holidays, special non-working days, and company holidays. Classifications determine statutory premiums during DTR processing and payroll calculation.",
  },
  {
    id: "loans",
    href: "/loans",
    label: "Loans & Advances",
    icon: Landmark,
    description:
      "Manage statutory government loans (SSS, Pag-IBIG) and company advances with automated payroll amortization.",
  },
  {
    id: "process-payroll",
    href: "/process-payroll",
    label: "Process payroll",
    icon: Banknote,
    description: "Calculate regular and 13th-month payroll runs.",
  },
  {
    id: "payroll-runs",
    href: "/payroll-runs",
    label: "Payroll runs & payslips",
    icon: ClipboardList,
    description: "Review runs, lifecycle actions and read-only payslips.",
  },
  {
    id: "year-end-tax",
    href: "/year-end-tax",
    label: "Year-end tax",
    icon: FileCheck,
    description: "Review annual reconciliation and recorded tax evidence.",
  },
  {
    id: "my-profile",
    href: "/profile",
    label: "My Profile",
    icon: UserCircle,
    description: "View personal details, compensation, leaves, and payslips.",
  },
  {
    id: "my-attendance",
    href: "/my-attendance",
    label: "My Attendance",
    icon: Clock,
    description: "Review your recorded daily time records and punch history.",
  },
  {
    id: "security",
    href: "/security",
    label: "Security",
    icon: ShieldCheck,
    description: "Manage two-factor authentication and account security.",
  },
  {
    id: "notifications",
    href: "/notifications",
    label: "Notifications",
    icon: Bell,
    description: "Leave decisions and payroll updates addressed to you.",
  },
] as const;

export type WorkspaceSection = (typeof workspaceSections)[number]["id"];

const sectionMap = Object.fromEntries(
  workspaceSections.map((s) => [s.id, s]),
) as Record<WorkspaceSection, (typeof workspaceSections)[number]>;

export const navigationGroups = [
  {
    label: "Workspace",
    items: [
      sectionMap.dashboard,
      sectionMap.employees,
      sectionMap.attendance,
      sectionMap.leaves,
      sectionMap.holidays,
    ],
  },
  {
    label: "Payroll operations",
    items: [
      sectionMap.loans,
      sectionMap["process-payroll"],
      sectionMap["payroll-runs"],
      sectionMap["year-end-tax"],
    ],
  },
];

// Role sets come from @workspace/db/src/role-matrix.ts — the same constants
// the API enforces with, so the portal cannot drift from server enforcement.
// These choose who sees a section in the portal at all; every read and
// mutation is still authorized server-side.
export const SECTION_PERMISSIONS: Record<WorkspaceSection, readonly string[]> =
  {
    dashboard: ALL_ROLES,
    employees: EMPLOYEE_RECORD_ROLES,
    // The portal shows attendance review only to employee-record staff even
    // though the API's TIMEKEEPING_WRITE_ROLES also cover department
    // managers: managers self-serve via my-attendance/self-service instead.
    attendance: EMPLOYEE_RECORD_ROLES,
    leaves: STAFF_ROLES,
    holidays: ALL_ROLES,
    loans: EMPLOYEE_RECORD_ROLES,
    "process-payroll": PAYROLL_ROLES,
    "payroll-runs": PAYROLL_ROLES,
    "year-end-tax": PAYROLL_ROLES,
    "my-profile": ALL_ROLES,
    "my-attendance": ALL_ROLES,
    security: ALL_ROLES,
    notifications: ALL_ROLES,
  };

export function isSectionAllowedForRole(
  sectionId: WorkspaceSection,
  role?: string,
): boolean {
  return roleIsIn(role, SECTION_PERMISSIONS[sectionId]);
}

export function getNavigationGroupsForRole(role?: string) {
  if (role === "EMPLOYEE") {
    return [
      {
        label: "Workspace",
        items: [
          {
            id: "dashboard" as const,
            href: "/dashboard",
            label: "Dashboard",
            icon: LayoutDashboard,
            description:
              "View your employee self-service dashboard, leave balances, and attendance summary.",
          },
          sectionMap.holidays,
        ],
      },
    ];
  }

  if (role === "DEPARTMENT_MANAGER") {
    return [
      {
        label: "Workspace",
        // NOTE: employees/attendance are intentionally omitted: SECTION_PERMISSIONS
        // denies DEPARTMENT_MANAGER on those sections, so linking them would
        // only land on "Access Restricted".
        items: [sectionMap.dashboard, sectionMap.leaves, sectionMap.holidays],
      },
    ];
  }

  // Staff roles: SUPER_ADMIN, HR_ADMIN, PAYROLL_SPECIALIST
  return navigationGroups;
}

export function useWorkspaceSection() {
  const pathname = usePathname();
  return (
    workspaceSections.find((section) => section.href === pathname) ??
    workspaceSections[0]
  );
}
