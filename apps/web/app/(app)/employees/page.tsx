"use client";

import { useWorkspaceUser } from "@/components/user-context";
import { SectionGate, SectionHeader } from "@/components/workspace-section";
import { EmployeesSection } from "@/features/employees/employees-section";

export default function EmployeesPage() {
  const { canManageEmployees } = useWorkspaceUser();

  return (
    <>
      <SectionHeader sectionId="employees" />
      <SectionGate sectionId="employees">
        <EmployeesSection canCreate={canManageEmployees} />
      </SectionGate>
    </>
  );
}
