"use client";

import {
  Banknote,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  Clock,
  FileCheck,
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

export const portalNavigationGroups = [
  { label: "Workspace", items: portalSections.slice(0, 5) },
  { label: "Payroll operations", items: portalSections.slice(5, 8) },
  { label: "Self-service", items: portalSections.slice(8) },
];

const sectionMap = Object.fromEntries(
  portalSections.map((s) => [s.id, s]),
) as Record<PortalSection, (typeof portalSections)[number]>;

export function getNavigationGroupsForRole(role?: string) {
  if (role === "EMPLOYEE") {
    return [
      {
        label: "Self-service",
        items: [
          sectionMap["my-profile"],
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
  return [
    { label: "Workspace", items: portalSections.slice(0, 5) },
    { label: "Payroll operations", items: portalSections.slice(5, 8) },
    { label: "Self-service", items: portalSections.slice(8) },
  ];
}

export function usePortalSection() {
  const pathname = usePathname();
  return (
    portalSections.find((section) => section.href === pathname) ??
    portalSections[0]
  );
}
