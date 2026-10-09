import { ProfileSettingsShell } from "@/components/profile-settings-nav";
import { SectionGate, SectionHeader } from "@/components/workspace-section";
import { MyAttendanceSection } from "@/features/attendance/my-attendance-section";

export default function MyAttendancePage() {
  return (
    <ProfileSettingsShell>
      <SectionHeader sectionId="my-attendance" />
      <SectionGate sectionId="my-attendance">
        <MyAttendanceSection />
      </SectionGate>
    </ProfileSettingsShell>
  );
}
