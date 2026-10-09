import { ProfileSettingsShell } from "@/components/profile-settings-nav";
import { SecuritySection } from "@/features/profile/security-section";

export default function SecurityPage() {
  return (
    <ProfileSettingsShell>
      <SecuritySection />
    </ProfileSettingsShell>
  );
}
