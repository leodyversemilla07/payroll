"use client";

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

export const SECTION_PERMISSIONS: Record<WorkspaceSection, readonly string[]> =
  {
    dashboard: [
      "SUPER_ADMIN",
      "HR_ADMIN",
      "PAYROLL_SPECIALIST",
      "DEPARTMENT_MANAGER",
      "EMPLOYEE",
    ],
    employees: ["SUPER_ADMIN", "HR_ADMIN", "PAYROLL_SPECIALIST"],
    attendance: ["SUPER_ADMIN", "HR_ADMIN", "PAYROLL_SPECIALIST"],
    leaves: [
      "SUPER_ADMIN",
      "HR_ADMIN",
      "PAYROLL_SPECIALIST",
      "DEPARTMENT_MANAGER",
    ],
    holidays: [
      "SUPER_ADMIN",
      "HR_ADMIN",
      "PAYROLL_SPECIALIST",
      "DEPARTMENT_MANAGER",
      "EMPLOYEE",
    ],
    loans: ["SUPER_ADMIN", "HR_ADMIN", "PAYROLL_SPECIALIST"],
    "process-payroll": ["SUPER_ADMIN", "HR_ADMIN", "PAYROLL_SPECIALIST"],
    "payroll-runs": ["SUPER_ADMIN", "HR_ADMIN", "PAYROLL_SPECIALIST"],
    "year-end-tax": ["SUPER_ADMIN", "HR_ADMIN", "PAYROLL_SPECIALIST"],
    "my-profile": [
      "SUPER_ADMIN",
      "HR_ADMIN",
      "PAYROLL_SPECIALIST",
      "DEPARTMENT_MANAGER",
      "EMPLOYEE",
    ],
    "my-attendance": [
      "SUPER_ADMIN",
      "HR_ADMIN",
      "PAYROLL_SPECIALIST",
      "DEPARTMENT_MANAGER",
      "EMPLOYEE",
    ],
    security: [
      "SUPER_ADMIN",
      "HR_ADMIN",
      "PAYROLL_SPECIALIST",
      "DEPARTMENT_MANAGER",
      "EMPLOYEE",
    ],
    notifications: [
      "SUPER_ADMIN",
      "HR_ADMIN",
      "PAYROLL_SPECIALIST",
      "DEPARTMENT_MANAGER",
      "EMPLOYEE",
    ],
  };

export function isSectionAllowedForRole(
  sectionId: WorkspaceSection,
  role?: string,
): boolean {
  if (!role) return false;
  const allowed = SECTION_PERMISSIONS[sectionId];
  return allowed ? allowed.includes(role) : false;
}

export function getNavigationGroupsForRole(role?: string) {
  if (role === "EMPLOYEE") {
    return [
      {
        label: "Self-service",
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
