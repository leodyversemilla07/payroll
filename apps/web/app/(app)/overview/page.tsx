"use client";

import { SectionGate, SectionHeader } from "@/components/workspace-section";
import { DashboardSection } from "@/features/dashboard/dashboard-section";

export default function DashboardPage() {
  return (
    <>
      <SectionHeader sectionId="overview" />
      <SectionGate sectionId="overview">
        <DashboardSection />
      </SectionGate>
    </>
  );
}
