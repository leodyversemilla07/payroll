import { MfaSettingsCard } from "@/components/mfa-settings-card";

export function SecuritySection() {
  return (
    <section aria-label="Security" className="space-y-6">
      <MfaSettingsCard />
    </section>
  );
}
