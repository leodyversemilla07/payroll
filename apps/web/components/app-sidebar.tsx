"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
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
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  getNavigationGroupsForRole,
  type WorkspaceSection,
} from "@/lib/workspace-navigation";

export function AppSidebar({
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
  activeSection: WorkspaceSection;
}) {
  const groups = getNavigationGroupsForRole(user.role);
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center justify-between">
            <SidebarMenuButton
              render={<Link href="/dashboard" />}
              size="lg"
              tooltip="Payroll workspace"
              aria-label="Payroll workspace"
            >
              <div
                aria-hidden="true"
                className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground"
              >
                PH
              </div>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Payroll workspace</span>
                <span className="truncate text-xs text-sidebar-foreground/70">
                  HR & payroll operations
                </span>
              </div>
            </SidebarMenuButton>
            {isMobile && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close navigation"
                className="size-8 shrink-0 text-sidebar-foreground"
                onClick={() => setOpenMobile(false)}
              >
                <X className="size-4" />
              </Button>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={groups} activeSection={activeSection} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail aria-label="Collapse or expand navigation" />
    </Sidebar>
  );
}

export function AppSidebarSkeleton() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2 p-2">
            <Skeleton className="size-8 shrink-0 rounded-lg" />
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
