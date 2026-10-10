"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@workspace/api";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
  Banknote,
  Bell,
  BellOff,
  CalendarDays,
  CheckCheck,
  ChevronRight,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeaderAction } from "@/components/page-header-action";
import { trpc } from "@/lib/trpc";

type NotificationItem =
  inferRouterOutputs<AppRouter>["notifications"]["list"][number];

function entityRoute(
  item: Pick<NotificationItem, "entityType" | "entityId">,
): string | null {
  if (!item.entityId) return null;
  if (item.entityType === "LeaveRequest") return "/leaves";
  if (item.entityType === "PayrollRun") return "/payroll-runs";
  return null;
}

function typeIcon(type: NotificationItem["type"]) {
  if (type.startsWith("LEAVE_")) {
    return <CalendarDays className="size-5 text-muted-foreground" />;
  }
  return <Banknote className="size-5 text-muted-foreground" />;
}

function formatRelativeTime(value: Date | string) {
  const date = new Date(value).getTime();
  const diffSeconds = Math.round((Date.now() - date) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return formatter.format(-diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return formatter.format(-diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return formatter.format(-diffDays, "day");
  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) return formatter.format(-diffMonths, "month");
  return formatter.format(-Math.round(diffMonths / 12), "year");
}

export function NotificationsSection() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const notificationsQuery = trpc.notifications.list.useQuery(
    { limit: 20 },
    { retry: false },
  );

  const invalidate = () => {
    void utils.notifications.list.invalidate();
    void utils.notifications.unreadCount.invalidate();
  };

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSettled: invalidate,
  });
  const markAllMutation = trpc.notifications.markAllRead.useMutation({
    onSettled: invalidate,
  });

  const notifications = notificationsQuery.data ?? [];
  const unreadCount = notifications.filter((item) => !item.isRead).length;

  function open(item: NotificationItem) {
    if (!item.isRead && !markReadMutation.isPending) {
      markReadMutation.mutate({ id: item.id });
    }
    const route = entityRoute(item);
    if (route) router.push(route);
  }

  return (
    <div className="min-w-0 space-y-6">
      <PageHeaderAction>
        <Button
          type="button"
          variant="outline"
          disabled={unreadCount === 0 || markAllMutation.isPending}
          onClick={() => markAllMutation.mutate()}
        >
          {markAllMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CheckCheck className="size-4" />
          )}
          Mark all read
        </Button>
      </PageHeaderAction>

      <Card role="region" aria-label="Notifications">
        <CardContent>
          {notificationsQuery.isPending ? (
            <div role="status" className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary shrink-0" />
                <span>Loading notifications…</span>
              </div>
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <Skeleton className="size-9 rounded-full" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-64 max-w-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : notificationsQuery.isError ? (
            <p role="alert">
              Could not load notifications.{" "}
              <Button
                type="button"
                variant="outline"
                onClick={() => void notificationsQuery.refetch()}
              >
                <RefreshCw className="size-4" />
                Retry
              </Button>
            </p>
          ) : notifications.length === 0 ? (
            <Empty className="my-6 rounded-2xl border border-dashed border-border/80 p-12">
              <EmptyMedia variant="icon">
                <BellOff className="size-5 text-muted-foreground" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>No notifications</EmptyTitle>
                <EmptyDescription>
                  Leave decisions and payroll updates addressed to you will
                  appear here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="space-y-2">
              {notifications.map((item) => {
                const route = entityRoute(item);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={!route}
                      onClick={() => open(item)}
                      aria-label={`${item.title}${item.isRead ? "" : " (unread)"}`}
                      className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <span
                        aria-hidden="true"
                        className={`size-2 shrink-0 rounded-full ${
                          item.isRead ? "bg-transparent" : "bg-primary"
                        }`}
                      />
                      <span className="shrink-0">{typeIcon(item.type)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {item.title}
                        </span>
                        {item.body && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {item.body}
                          </span>
                        )}
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </span>
                      {route ? (
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <Bell className="size-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
