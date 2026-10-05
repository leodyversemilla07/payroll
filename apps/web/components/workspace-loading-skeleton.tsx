import { Card, CardContent, CardHeader } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Loader2 } from "lucide-react";

export function WorkspaceLoadingSkeleton({
  title = "Loading workspace page…",
  showMessage = true,
}: {
  title?: string;
  showMessage?: boolean;
}) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {showMessage && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground shadow-xs"
        >
          <Loader2 className="size-4 animate-spin text-primary shrink-0" />
          <span>{title}</span>
        </div>
      )}
      {!showMessage && (
        <p role="status" className="sr-only">
          {title}
        </p>
      )}

      {/* Page Header Skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-4 w-72 max-w-full rounded-md" />
      </div>

      {/* 4-Card KPI Metric Grid Skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="size-4 rounded-full" />
            </div>
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-40" />
          </Card>
        ))}
      </div>

      {/* Main Content / Table Skeleton Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3.5 w-60" />
          </div>
          <Skeleton className="h-9 w-24 rounded-md" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between border-b pb-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between py-2 border-b last:border-0"
            >
              <div className="space-y-1">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-8 w-16 rounded-md" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
