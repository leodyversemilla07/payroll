import { SectionGate, SectionHeader } from "@/components/workspace-section";
import { LoansSection } from "@/features/loans/loans-section";

export default function LoansPage() {
  return (
    <>
      <SectionHeader sectionId="loans" />
      <SectionGate sectionId="loans">
        <LoansSection />
      </SectionGate>
    </>
  );
}
