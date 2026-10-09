import { SectionGate, SectionHeader } from "@/components/workspace-section";
import { PayrollRunsSection } from "@/features/payroll/payroll-runs-section";

export default function PayrollRunsPage() {
  return (
    <>
      <SectionHeader sectionId="payroll-runs" />
      <SectionGate sectionId="payroll-runs">
        <PayrollRunsSection />
      </SectionGate>
    </>
  );
}
