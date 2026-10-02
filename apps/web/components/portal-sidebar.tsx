"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@workspace/ui/components/sidebar";
import { X } from "lucide-react";
import Link from "next/link";
import {
  type PortalSection,
  portalNavigationGroups,
} from "@/lib/portal-navigation";

export function PortalSidebar({
  user,
  activeSection,
}: {
  user: { name: string; role: string };
  activeSection: PortalSection;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const initials =
    user.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "U";

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              size="lg"
              render={<Link href="/portal" />}
              tooltip="Payroll workspace"
              aria-label="Payroll workspace"
              onClick={() => {
                if (isMobile) setOpenMobile(false);
              }}
            >
              <div
                aria-hidden="true"
                className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground"
              >
                PH
              </div>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-medium">Payroll workspace</span>
                <span className="truncate text-xs text-sidebar-foreground/70">
                  API-backed records
                </span>
              </div>
            </SidebarMenuButton>
            {isMobile && (
              <Button
                type="button"
                aria-label="Close navigation"
                variant="ghost"
                size="icon"
                onClick={() => setOpenMobile(false)}
              >
                <X aria-hidden="true" />
              </Button>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <nav aria-label="Payroll navigation">
          {portalNavigationGroups.map((group) => (
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
                          )
                            return;
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
      </SidebarContent>
      <SidebarFooter>
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/portal" />}
              aria-label={`Account: ${user.name}`}
              tooltip={`${user.name} · ${user.role.replaceAll("_", " ")}`}
              onClick={() => {
                if (isMobile) setOpenMobile(false);
              }}
            >
              <div
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-xs font-medium text-sidebar-accent-foreground"
              >
                {initials}
              </div>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-sidebar-foreground/70">
                  {user.role.replaceAll("_", " ")}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail aria-label="Collapse or expand navigation" />
    </Sidebar>
  );
}
