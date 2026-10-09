import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { PayrollPortal } from "@/components/payroll-portal";

export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  return (
    <PayrollPortal
      defaultSidebarOpen={cookieStore.get("sidebar_state")?.value !== "false"}
    >
      {children}
    </PayrollPortal>
  );
}
