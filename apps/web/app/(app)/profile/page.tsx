import { ProfileSettingsShell } from "@/components/profile-settings-nav";
import { MyProfileSection } from "@/features/profile/my-profile-section";

export default function MyProfilePage() {
  return (
    <ProfileSettingsShell>
      <MyProfileSection />
    </ProfileSettingsShell>
  );
}
