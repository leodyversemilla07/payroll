import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace-shell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  return (
    <WorkspaceShell
      defaultSidebarOpen={cookieStore.get("sidebar_state")?.value !== "false"}
    >
      {children}
    </WorkspaceShell>
  );
}
