"use client";

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@workspace/ui/components/sidebar";
import Link from "next/link";
import type {
  getNavigationGroupsForRole,
  PortalSection,
} from "@/lib/portal-navigation";

type NavigationGroups = ReturnType<typeof getNavigationGroupsForRole>;

export function NavMain({
  groups,
  activeSection,
}: {
  groups: NavigationGroups;
  activeSection: PortalSection;
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <nav aria-label="Payroll navigation">
      <SidebarGroup>
        <SidebarMenu>
          {groups.flatMap((group) =>
            group.items.map((item) => (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  render={<Link href={item.href} />}
                  tooltip={item.label}
                  isActive={activeSection === item.id}
                  aria-current={activeSection === item.id ? "page" : undefined}
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
            )),
          )}
        </SidebarMenu>
      </SidebarGroup>
    </nav>
  );
}
