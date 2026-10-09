"use client";

import { useWorkspaceUser } from "@/components/user-context";
import { SectionGate, SectionHeader } from "@/components/workspace-section";
import { HolidaysSection } from "@/features/holidays/holidays-section";

export default function HolidaysPage() {
  const { canManageHolidays } = useWorkspaceUser();
  return (
    <>
      <SectionHeader sectionId="holidays" />
      <SectionGate sectionId="holidays">
        <HolidaysSection canManage={canManageHolidays} />
      </SectionGate>
    </>
  );
}
