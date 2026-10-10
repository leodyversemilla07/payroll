"use client";

import { useWorkspaceUser } from "@/components/user-context";
import { SectionGate, SectionHeader } from "@/components/workspace-section";
import { TimekeepingSection } from "@/features/attendance/timekeeping-section";
import { useStaffEmployees } from "@/features/employees/use-staff-employees";

export default function AttendancePage() {
  const props = useStaffEmployees();
  const { user } = useWorkspaceUser();

  const canImport = [
    "SUPER_ADMIN",
    "HR_ADMIN",
    "PAYROLL_SPECIALIST",
    "DEPARTMENT_MANAGER",
  ].includes(user.role);
  return (
    <>
      <SectionHeader sectionId="attendance" />
      <SectionGate sectionId="attendance">
        <TimekeepingSection {...props} canImport={canImport} />
      </SectionGate>
    </>
  );
}
