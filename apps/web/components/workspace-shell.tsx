"use client";

import { useQueryClient } from "@tanstack/react-query";
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
import { type ReactNode, useEffect } from "react";
import {
  PrincipalQueryProvider,
  principalKey,
} from "@/lib/principal-query-provider";
import { trpc } from "@/lib/trpc";
import { useWorkspaceSection } from "@/lib/workspace-navigation";
import { AppSidebar, AppSidebarSkeleton } from "./app-sidebar";
import { UserProvider } from "./user-context";
import { WorkspaceLoadingSkeleton } from "./workspace-loading-skeleton";

const supportedRoles = [
  "SUPER_ADMIN",
  "HR_ADMIN",
  "PAYROLL_SPECIALIST",
  "DEPARTMENT_MANAGER",
  "EMPLOYEE",
];

export function WorkspaceShell({
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
  const activeSection = useWorkspaceSection();
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
                      <BreadcrumbLink render={<Link href="/overview" />}>
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
                <p className="sr-only">
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
                  <UserProvider key={scope} user={me.data}>
                    <PrincipalQueryProvider scope={scope}>
                      {children}
                    </PrincipalQueryProvider>
                  </UserProvider>
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
