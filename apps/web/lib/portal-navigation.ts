"use client";

import {
  Banknote,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  Clock,
  FileCheck,
  Landmark,
  LayoutDashboard,
  UserCircle,
  Users,
} from "lucide-react";
import { usePathname } from "next/navigation";

export const portalSections = [
  {
    id: "overview",
    href: "/portal",
    label: "Overview",
    icon: LayoutDashboard,
    description: "Choose a workspace or payroll operation.",
  },
  {
    id: "employees",
    href: "/portal/employees",
    label: "Employees",
    icon: Users,
    description: "View employee profiles and onboard new employees.",
  },
  {
    id: "attendance",
    href: "/portal/attendance",
    label: "Attendance & DTR",
    icon: Clock,
    description: "Review and correct recorded attendance in Asia/Manila.",
  },
  {
    id: "leaves",
    href: "/portal/leaves",
    label: "Leave management",
    icon: CalendarDays,
    description: "Manage recorded credits, requests and decisions.",
  },
  {
    id: "holidays",
    href: "/portal/holidays",
    label: "Holiday calendar",
    icon: CalendarCheck,
    description: "Configure Philippine statutory and company holidays.",
  },
  {
    id: "loans",
    href: "/portal/loans",
    label: "Loans & advances",
    icon: Landmark,
    description: "Track employee loans, amortization, and ledger settlements.",
  },
  {
    id: "process-payroll",
    href: "/portal/process-payroll",
    label: "Process payroll",
    icon: Banknote,
    description: "Calculate regular and 13th-month payroll runs.",
  },
  {
    id: "payroll-runs",
    href: "/portal/payroll-runs",
    label: "Payroll runs & payslips",
    icon: ClipboardList,
    description: "Review runs, lifecycle actions and read-only payslips.",
  },
  {
    id: "year-end-tax",
    href: "/portal/year-end-tax",
    label: "Year-end tax",
    icon: FileCheck,
    description: "Review annual reconciliation and recorded tax evidence.",
  },
  {
    id: "my-profile",
    href: "/portal/my-profile",
    label: "My Profile",
    icon: UserCircle,
    description: "View personal details, compensation, leaves, and payslips.",
  },
  {
    id: "my-attendance",
    href: "/portal/my-attendance",
    label: "My Attendance",
    icon: Clock,
    description: "Review your recorded daily time records and punch history.",
  },
] as const;

export type PortalSection = (typeof portalSections)[number]["id"];

const sectionMap = Object.fromEntries(
  portalSections.map((s) => [s.id, s]),
) as Record<PortalSection, (typeof portalSections)[number]>;

export const portalNavigationGroups = [
  {
    label: "Workspace",
    items: [
      sectionMap.overview,
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
  {
    label: "Self-service",
    items: [sectionMap["my-profile"], sectionMap["my-attendance"]],
  },
];

export const SECTION_PERMISSIONS: Record<PortalSection, readonly string[]> = {
  overview: [
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
};

export function isSectionAllowedForRole(
  sectionId: PortalSection,
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
            id: "overview" as const,
            href: "/portal",
            label: "Dashboard",
            icon: LayoutDashboard,
            description:
              "View your employee self-service dashboard, leave balances, and attendance summary.",
          },
          sectionMap["my-attendance"],
          sectionMap.holidays,
        ],
      },
    ];
  }

  if (role === "DEPARTMENT_MANAGER") {
    return [
      {
        label: "Workspace",
        items: [
          sectionMap.overview,
          sectionMap.employees,
          sectionMap.attendance,
          sectionMap.leaves,
          sectionMap.holidays,
        ],
      },
      {
        label: "Self-service",
        items: [sectionMap["my-profile"], sectionMap["my-attendance"]],
      },
    ];
  }

  // Staff roles: SUPER_ADMIN, HR_ADMIN, PAYROLL_SPECIALIST
  return portalNavigationGroups;
}

export function usePortalSection() {
  const pathname = usePathname();
  return (
    portalSections.find((section) => section.href === pathname) ??
    portalSections[0]
  );
}
