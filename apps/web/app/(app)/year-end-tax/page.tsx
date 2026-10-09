"use client";

import { SectionGate, SectionHeader } from "@/components/workspace-section";
import { YearEndTaxSection } from "@/features/compliance/year-end-tax";
import { useStaffEmployees } from "@/features/employees/use-staff-employees";

export default function YearEndTaxPage() {
  const { employees } = useStaffEmployees();
  return (
    <>
      <SectionHeader sectionId="year-end-tax" />
      <SectionGate sectionId="year-end-tax">
        <YearEndTaxSection employees={employees} />
      </SectionGate>
    </>
  );
}
