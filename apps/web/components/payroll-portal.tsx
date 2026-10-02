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
import { Button } from "@workspace/ui/components/button";
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
import { usePortalSection } from "@/lib/portal-navigation";
import { trpc } from "@/lib/trpc";
import { PortalSidebar } from "./portal-sidebar";

const staffRoles = ["SUPER_ADMIN", "HR_ADMIN", "PAYROLL_SPECIALIST"];

type PortalUser = inferRouterOutputs<AppRouter>["auth"]["me"];
const PortalUserContext = createContext<{
  user: PortalUser;
  canManageEmployees: boolean;
} | null>(null);

export function usePortalUser() {
  const context = useContext(PortalUserContext);
  if (!context)
    throw new Error("Portal pages require an authenticated staff layout.");
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
  const hasStaffNavigation =
    !!me.data && !signedOut && staffRoles.includes(me.data.role);
  const activeSection = usePortalSection();
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
        {hasStaffNavigation && me.data && (
          <PortalSidebar
            key={me.data.id}
            user={me.data}
            activeSection={activeSection.id}
          />
        )}
        <SidebarInset className="min-w-0">
          <a
            href="#workspace-content"
            className="sr-only focus:not-sr-only focus:absolute focus:z-30 focus:rounded-md focus:bg-background focus:p-3 focus:text-foreground"
          >
            Skip to workspace content
          </a>
          <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-2 border-b bg-background px-4 transition-[height] ease-linear md:rounded-t-2xl md:group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <div className="flex min-w-0 items-center gap-2">
              {hasStaffNavigation && (
                <>
                  <SidebarTrigger
                    aria-label="Toggle navigation"
                    className="-ml-1"
                  />
                  <Separator
                    orientation="vertical"
                    className="mr-2 data-vertical:h-4 data-vertical:self-auto"
                  />
                </>
              )}
              <span
                className={
                  hasStaffNavigation ? "sr-only" : "text-base font-semibold"
                }
              >
                Payroll
              </span>
              {hasStaffNavigation && (
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
                        {activeSection.label}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              )}
            </div>
            <div className="flex items-center gap-4">
              {me.data && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={logout.isPending}
                  onClick={() => logout.mutate()}
                >
                  {logout.isPending ? "Signing out…" : "Sign out"}
                </Button>
              )}
            </div>
          </header>
          <div
            id="workspace-content"
            tabIndex={-1}
            className="mx-auto w-full max-w-6xl scroll-mt-24 space-y-6 p-4 outline-none md:p-6"
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
              <p role="status">Checking your session…</p>
            ) : me.data ? (
              <>
                {logout.isError && (
                  <p role="alert">Sign out failed. Please retry.</p>
                )}
                {staffRoles.includes(me.data.role) ? (
                  <PortalUserContext.Provider
                    key={me.data.id}
                    value={{
                      user: me.data,
                      canManageEmployees:
                        me.data.role === "SUPER_ADMIN" ||
                        me.data.role === "HR_ADMIN",
                    }}
                  >
                    <div className="space-y-6">
                      <div className="space-y-1">
                        <h1 className="text-2xl font-semibold tracking-tight">
                          {activeSection.label}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                          {activeSection.description}
                        </p>
                      </div>
                      {children}
                    </div>
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
