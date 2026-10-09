"use client";

import { SectionGate, SectionHeader } from "@/components/workspace-section";
import { OverviewSection } from "@/features/dashboard/overview-section";

export default function OverviewPage() {
  return (
    <>
      <SectionHeader sectionId="overview" />
      <SectionGate sectionId="overview">
        <OverviewSection />
      </SectionGate>
    </>
  );
}
