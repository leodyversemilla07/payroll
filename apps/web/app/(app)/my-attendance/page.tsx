import { ProfileSettingsShell } from "@/components/profile-settings-nav";
import { MyAttendanceSection } from "@/features/attendance/my-attendance-section";

export default function MyAttendancePage() {
  return (
    <ProfileSettingsShell>
      <MyAttendanceSection />
    </ProfileSettingsShell>
  );
}
