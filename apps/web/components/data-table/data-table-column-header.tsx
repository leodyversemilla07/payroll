"use client";

import type { Column } from "@tanstack/react-table";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { HTMLAttributes } from "react";

interface DataTableColumnHeaderProps<TData, TValue>
  extends HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title: string;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return (
      <div className={cn("text-xs font-semibold", className)}>{title}</div>
    );
  }

  const isSorted = column.getIsSorted();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        "-ml-3 h-8 data-[state=open]:bg-accent font-semibold text-xs tracking-tight",
        className,
      )}
      onClick={() => column.toggleSorting(isSorted === "asc")}
    >
      <span>{title}</span>
      {isSorted === "desc" ? (
        <ArrowDown className="ml-2 size-3.5" />
      ) : isSorted === "asc" ? (
        <ArrowUp className="ml-2 size-3.5" />
      ) : (
        <ArrowUpDown className="ml-2 size-3.5 opacity-60" />
      )}
    </Button>
  );
}
