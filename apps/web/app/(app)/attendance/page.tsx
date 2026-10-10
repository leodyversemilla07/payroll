"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useWorkspaceUser } from "@/components/user-context";
import { SectionGate, SectionHeader } from "@/components/workspace-section";
import { TimekeepingSection } from "@/features/attendance/timekeeping-section";
import { useStaffEmployees } from "@/features/employees/use-staff-employees";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function AttendanceContent() {
  const props = useStaffEmployees();
  const { user } = useWorkspaceUser();
  const searchParams = useSearchParams();
  const requested = searchParams.get("employee");
  // Preselect only well-formed ids (e.g. from an employee "View DTR" link).
  // The section clears unknown ids once the employee list loads, and the
  // server still enforces department scope when DTR is loaded.
  const initialEmployeeId =
    requested && UUID_PATTERN.test(requested) ? requested : undefined;

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
        <TimekeepingSection
          {...props}
          canImport={canImport}
          initialEmployeeId={initialEmployeeId}
        />
      </SectionGate>
    </>
  );
}

export default function AttendancePage() {
  return (
    <Suspense fallback={<p role="status">Loading attendance…</p>}>
      <AttendanceContent />
    </Suspense>
  );
}
