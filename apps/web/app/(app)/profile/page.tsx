import { ProfileSettingsShell } from "@/components/profile-settings-nav";
import { SectionGate, SectionHeader } from "@/components/workspace-section";
import { MyProfileSection } from "@/features/profile/my-profile-section";

export default function MyProfilePage() {
  return (
    <ProfileSettingsShell>
      <SectionHeader sectionId="my-profile" />
      <SectionGate sectionId="my-profile">
        <MyProfileSection />
      </SectionGate>
    </ProfileSettingsShell>
  );
}
