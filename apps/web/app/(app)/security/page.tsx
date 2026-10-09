import { ProfileSettingsShell } from "@/components/profile-settings-nav";
import { SectionGate, SectionHeader } from "@/components/workspace-section";
import { SecuritySection } from "@/features/profile/security-section";

export default function SecurityPage() {
  return (
    <ProfileSettingsShell>
      <SectionHeader sectionId="security" />
      <SectionGate sectionId="security">
        <SecuritySection />
      </SectionGate>
    </ProfileSettingsShell>
  );
}
