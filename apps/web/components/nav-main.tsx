"use client";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@workspace/ui/components/sidebar";
import Link from "next/link";
import type {
  getNavigationGroupsForRole,
  WorkspaceSection,
} from "@/lib/workspace-navigation";

type NavigationGroups = ReturnType<typeof getNavigationGroupsForRole>;

export function NavMain({
  groups,
  activeSection,
}: {
  groups: NavigationGroups;
  activeSection: WorkspaceSection;
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <nav aria-label="Payroll navigation">
      {groups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    tooltip={item.label}
                    isActive={activeSection === item.id}
                    aria-current={
                      activeSection === item.id ? "page" : undefined
                    }
                    onClick={(event) => {
                      if (
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey
                      ) {
                        return;
                      }
                      if (isMobile) setOpenMobile(false);
                    }}
                  >
                    <item.icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </nav>
  );
}
