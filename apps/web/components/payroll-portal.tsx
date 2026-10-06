"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@workspace/api";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useEffect } from "react";
import {
  isSectionAllowedForRole,
  usePortalSection,
} from "@/lib/portal-navigation";
import {
  PrincipalQueryProvider,
  principalKey,
} from "@/lib/principal-query-provider";
import { trpc } from "@/lib/trpc";
import { AppSidebar, AppSidebarSkeleton } from "./app-sidebar";
import { WorkspaceLoadingSkeleton } from "./workspace-loading-skeleton";

const supportedRoles = [
  "SUPER_ADMIN",
  "HR_ADMIN",
  "PAYROLL_SPECIALIST",
  "DEPARTMENT_MANAGER",
  "EMPLOYEE",
];

type PortalUser = inferRouterOutputs<AppRouter>["auth"]["me"];
export interface PortalUserContextValue {
  user: PortalUser;
  canManageEmployees: boolean;
  canTriggerPayroll: boolean;
  canApprovePayroll: boolean;
  canManageHolidays: boolean;
  canManageLeavePolicies: boolean;
  canApproveLeaves: boolean;
  canViewStaffRecords: boolean;
  isManager: boolean;
  isStaff: boolean;
  isEmployee: boolean;
}

const PortalUserContext = createContext<PortalUserContextValue | null>(null);

export function usePortalUser() {
  const context = useContext(PortalUserContext);
  if (!context)
    throw new Error("Portal pages require an authenticated layout.");
  return context;
}

export function PayrollPortal({
  defaultSidebarOpen = true,
  children,
}: {
  defaultSidebarOpen?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const signedOut = me.error?.data?.code === "UNAUTHORIZED";
  const hasNavigation =
    !!me.data && !signedOut && supportedRoles.includes(me.data.role);
  const activeSection = usePortalSection();
  const isEmployee = me.data?.role === "EMPLOYEE";
  const scope = me.data ? principalKey(me.data) : "";
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      queryClient.clear();
      void router.replace("/");
    },
  });

  useEffect(() => {
    if (signedOut) {
      void router.replace("/");
    }
  }, [router, signedOut]);

  return (
    <TooltipProvider delay={150}>
      <SidebarProvider
        defaultOpen={defaultSidebarOpen}
        className="text-foreground"
      >
        {hasNavigation && me.data ? (
          <AppSidebar
            key={scope}
            user={me.data}
            activeSection={activeSection.id}
          />
        ) : me.isPending ? (
          <AppSidebarSkeleton />
        ) : null}
        <SidebarInset className="min-w-0">
          <a
            href="#workspace-content"
            className="sr-only focus:not-sr-only focus:absolute focus:z-30 focus:rounded-md focus:bg-background focus:p-3 focus:text-foreground"
          >
            Skip to workspace content
          </a>
          <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-2 border-b bg-background px-4 transition-[height] ease-linear md:group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:rounded-t-2xl">
            <div className="flex min-w-0 items-center gap-2">
              {(hasNavigation || me.isPending) && (
                <>
                  <SidebarTrigger
                    aria-label="Toggle navigation"
                    className="-ml-1"
                    disabled={me.isPending}
                  />
                  <Separator
                    orientation="vertical"
                    className="mr-2 data-vertical:h-4 data-vertical:self-auto"
                  />
                </>
              )}
              <span
                className={
                  hasNavigation || me.isPending
                    ? "sr-only"
                    : "text-base font-semibold"
                }
              >
                Payroll
              </span>
              {(hasNavigation || me.isPending) && (
                <Breadcrumb className="min-w-0">
                  <BreadcrumbList className="flex-nowrap">
                    <BreadcrumbItem className="hidden md:inline-flex">
                      <BreadcrumbLink render={<Link href="/portal" />}>
                        Payroll
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className="hidden md:block" />
                    <BreadcrumbItem className="min-w-0">
                      <BreadcrumbPage className="truncate">
                        {isEmployee && activeSection.id === "overview"
                          ? "Dashboard"
                          : activeSection.label}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              )}
            </div>
            {!hasNavigation && me.data && (
              <div className="flex items-center gap-4">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={logout.isPending}
                  onClick={() => logout.mutate()}
                >
                  {logout.isPending ? "Signing out…" : "Sign out"}
                </Button>
              </div>
            )}
          </header>
          <div
            id="workspace-content"
            tabIndex={-1}
            className="w-full scroll-mt-24 space-y-6 p-3 outline-none sm:p-4 lg:p-5"
          >
            <div className="space-y-4">
              <p
                role="note"
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200"
              >
                Not validated for live payroll. Regulatory, annual-tax/BIR 2316
                and bank-file checks remain outstanding.
              </p>
              {me.data && !signedOut && (
                <p className="text-sm text-muted-foreground">
                  Signed in as{" "}
                  <strong className="font-medium text-foreground">
                    {me.data.name}
                  </strong>{" "}
                  ({me.data.role.replaceAll("_", " ")})
                </p>
              )}
            </div>
            {me.isPending || signedOut ? (
              <WorkspaceLoadingSkeleton
                title={
                  signedOut
                    ? "Redirecting to sign-in…"
                    : "Checking your session…"
                }
              />
            ) : me.data ? (
              <>
                {logout.isError && (
                  <p role="alert">Sign out failed. Please retry.</p>
                )}
                {supportedRoles.includes(me.data.role) ? (
                  <PortalUserContext.Provider
                    key={scope}
                    value={{
                      user: me.data,
                      canManageEmployees:
                        me.data.role === "SUPER_ADMIN" ||
                        me.data.role === "HR_ADMIN",
                      canTriggerPayroll:
                        me.data.role === "SUPER_ADMIN" ||
                        me.data.role === "PAYROLL_SPECIALIST",
                      canApprovePayroll:
                        me.data.role === "SUPER_ADMIN" ||
                        me.data.role === "HR_ADMIN",
                      canManageHolidays:
                        me.data.role === "SUPER_ADMIN" ||
                        me.data.role === "HR_ADMIN",
                      canManageLeavePolicies:
                        me.data.role === "SUPER_ADMIN" ||
                        me.data.role === "HR_ADMIN",
                      canApproveLeaves:
                        me.data.role === "SUPER_ADMIN" ||
                        me.data.role === "HR_ADMIN" ||
                        me.data.role === "DEPARTMENT_MANAGER",
                      canViewStaffRecords:
                        me.data.role === "SUPER_ADMIN" ||
                        me.data.role === "HR_ADMIN" ||
                        me.data.role === "PAYROLL_SPECIALIST" ||
                        me.data.role === "DEPARTMENT_MANAGER",
                      isManager: me.data.role === "DEPARTMENT_MANAGER",
                      isStaff:
                        me.data.role === "SUPER_ADMIN" ||
                        me.data.role === "HR_ADMIN" ||
                        me.data.role === "PAYROLL_SPECIALIST",
                      isEmployee: me.data.role === "EMPLOYEE",
                    }}
                  >
                    <PrincipalQueryProvider scope={scope}>
                      <div className="space-y-6">
                        <div className="space-y-1">
                          <h1 className="text-2xl font-semibold tracking-tight">
                            {isEmployee && activeSection.id === "overview"
                              ? "Dashboard"
                              : activeSection.label}
                          </h1>
                          <p className="text-sm text-muted-foreground">
                            {isEmployee && activeSection.id === "overview"
                              ? "View your employee self-service dashboard, leave balances, attendance summary, and payslips."
                              : activeSection.description}
                          </p>
                        </div>
                        {isSectionAllowedForRole(
                          activeSection.id,
                          me.data.role,
                        ) ? (
                          children
                        ) : (
                          <Card role="region" aria-label="Access restricted">
                            <CardHeader>
                              <CardTitle>Access Restricted</CardTitle>
                              <CardDescription>
                                No staff records available. Your role (
                                {me.data.role.replaceAll("_", " ")}) does not
                                have permission to access the{" "}
                                {activeSection.label} workspace.
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <p className="text-sm text-muted-foreground">
                                If you need access to this resource, please
                                contact your system administrator or HR
                                department.
                              </p>
                              <Link
                                href="/portal"
                                className={buttonVariants({
                                  variant: "default",
                                })}
                              >
                                Return to Overview
                              </Link>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    </PrincipalQueryProvider>
                  </PortalUserContext.Provider>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle>No staff records available</CardTitle>
                      <CardDescription>
                        Employee and payroll-run lists require a payroll or HR
                        staff role.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="pt-5">
                  <p role="alert">
                    Could not reach the payroll API. Check that it is running,
                    then retry.
                  </p>
                  <Link
                    className="mt-3 inline-block text-primary underline"
                    href="/"
                  >
                    Return to sign in
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
