import { SectionGate, SectionHeader } from "@/components/workspace-section";
import { NotificationsSection } from "@/features/notifications/notifications-section";

export default function NotificationsPage() {
  return (
    <>
      <SectionHeader sectionId="notifications" />
      <SectionGate sectionId="notifications">
        <NotificationsSection />
      </SectionGate>
    </>
  );
}
