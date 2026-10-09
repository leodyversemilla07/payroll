import { SectionGate, SectionHeader } from "@/components/workspace-section";
import { TriggerRunForms } from "@/features/payroll/payroll-run-actions";

export default function ProcessPayrollPage() {
  return (
    <>
      <SectionHeader sectionId="process-payroll" />
      <SectionGate sectionId="process-payroll">
        <TriggerRunForms />
      </SectionGate>
    </>
  );
}
