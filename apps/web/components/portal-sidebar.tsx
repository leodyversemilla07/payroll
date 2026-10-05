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
import { Skeleton } from "@workspace/ui/components/skeleton";
import { X } from "lucide-react";
import Link from "next/link";
import { NavUser } from "@/components/nav-user";
import {
  getNavigationGroupsForRole,
  type PortalSection,
} from "@/lib/portal-navigation";

export function PortalSidebar({
  user,
  activeSection,
}: {
  user: {
    name: string;
    role: string;
    email?: string;
    employeeId?: string;
    avatarUrl?: string | null;
  };
  activeSection: PortalSection;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const groups = getNavigationGroupsForRole(user.role);

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
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail aria-label="Collapse or expand navigation" />
    </Sidebar>
  );
}

export function PortalSidebarSkeleton() {
  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2 p-2">
            <Skeleton className="size-8 rounded-lg shrink-0" />
            <div className="grid flex-1 gap-1.5 leading-tight group-data-[collapsible=icon]:hidden">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <div className="px-2 py-1.5 group-data-[collapsible=icon]:hidden">
            <Skeleton className="h-3 w-20" />
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {[1, 2, 3, 4, 5].map((i) => (
                <SidebarMenuItem key={i}>
                  <div className="flex items-center gap-3 px-3 py-2">
                    <Skeleton className="size-4 shrink-0 rounded" />
                    <Skeleton className="h-4 flex-1 group-data-[collapsible=icon]:hidden" />
                  </div>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-3 p-2">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="grid flex-1 gap-1.5 group-data-[collapsible=icon]:hidden">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail aria-label="Collapse or expand navigation" />
    </Sidebar>
  );
}
