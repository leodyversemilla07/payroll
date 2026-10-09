"use client";

import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { Button } from "@workspace/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { Input } from "@workspace/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { Search, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { DataTablePagination } from "./data-table-pagination";
import { DataTableViewOptions } from "./data-table-view-options";

export interface DataTableFilter {
  id: string;
  label: string;
  options: { label: string; value: string }[];
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  searchPlaceholder?: string;
  filters?: DataTableFilter[];
  columnLabels?: Record<string, string>;
  columnClassMap?: Record<string, string>;
  onRowClick?: (row: TData) => void;
  selectedRowId?: string | null;
  getRowId?: (row: TData) => string;
  itemLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  toolbarActions?: ReactNode;
  pageSizeOptions?: number[];
  defaultPageSize?: number;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder = "Search records…",
  filters = [],
  columnLabels,
  columnClassMap = {},
  onRowClick,
  selectedRowId,
  getRowId,
  itemLabel = "records",
  emptyTitle = "No records found",
  emptyDescription = "No data matches your current criteria.",
  emptyAction,
  toolbarActions,
  pageSizeOptions = [10, 20, 30, 50],
  defaultPageSize = 10,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "auto",
    initialState: {
      pagination: {
        pageSize: defaultPageSize,
      },
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
    },
  });

  const searchValue = searchKey
    ? ((table.getColumn(searchKey)?.getFilterValue() as string) ?? "")
    : globalFilter;

  const handleSearchChange = (value: string) => {
    if (searchKey) {
      table.getColumn(searchKey)?.setFilterValue(value || undefined);
    } else {
      setGlobalFilter(value);
    }
  };

  const isFiltered =
    Boolean(globalFilter) ||
    Boolean(columnFilters.length > 0) ||
    Boolean(searchKey && table.getColumn(searchKey)?.getFilterValue());

  return (
    <div className="w-full space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Search input */}
          <div className="relative w-full sm:w-64 md:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="h-8 pl-8 pr-8 text-xs"
            />
            {searchValue && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => handleSearchChange("")}
              >
                <X className="size-3.5" />
                <span className="sr-only">Clear search</span>
              </Button>
            )}
          </div>

          {/* Faceted Filter dropdowns */}
          {filters.map((filter) => {
            const column = table.getColumn(filter.id);
            if (!column) return null;
            const currentValue = (column.getFilterValue() as string) ?? "ALL";

            return (
              <div key={filter.id} className="w-full sm:w-auto">
                <Select
                  items={[
                    { value: "ALL", label: `All ${filter.label}` },
                    ...filter.options,
                  ]}
                  value={currentValue}
                  onValueChange={(val) => {
                    column.setFilterValue(val === "ALL" ? undefined : val);
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className="h-8 text-xs w-full sm:w-auto min-w-[130px]"
                  >
                    <SelectValue placeholder={`All ${filter.label}`} />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false} side="bottom">
                    <SelectGroup>
                      <SelectItem value="ALL">All {filter.label}</SelectItem>
                      {filter.options.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            );
          })}

          {isFiltered && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setGlobalFilter("");
                table.resetColumnFilters();
              }}
              className="h-8 px-2.5 text-xs"
            >
              Reset
              <X className="ml-1 size-3" />
            </Button>
          )}
        </div>

        {/* Right side toolbar actions */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {toolbarActions}
          <DataTableViewOptions table={table} columnLabels={columnLabels} />
        </div>
      </div>

      {/* Table Container */}
      <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-border/80 bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="bg-muted/40 hover:bg-muted/40"
              >
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={columnClassMap[header.column.id]}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const id = getRowId ? getRowId(row.original) : row.id;
                const isSelected = selectedRowId === id;

                return (
                  <TableRow
                    key={row.id}
                    data-state={isSelected ? "selected" : undefined}
                    className={
                      onRowClick
                        ? "cursor-pointer transition-colors hover:bg-muted/40"
                        : "hover:bg-muted/30"
                    }
                    onClick={() => onRowClick?.(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={columnClassMap[cell.column.id]}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-8 text-center">
                  <Empty className="rounded-2xl border border-dashed border-border/80 p-8">
                    <EmptyMedia variant="icon">
                      <Search className="size-5 text-muted-foreground" />
                    </EmptyMedia>
                    <EmptyHeader>
                      <EmptyTitle>{emptyTitle}</EmptyTitle>
                      <EmptyDescription>{emptyDescription}</EmptyDescription>
                    </EmptyHeader>
                    {isFiltered ? (
                      <EmptyContent>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setGlobalFilter("");
                            table.resetColumnFilters();
                          }}
                        >
                          Clear filters
                        </Button>
                      </EmptyContent>
                    ) : (
                      emptyAction && <EmptyContent>{emptyAction}</EmptyContent>
                    )}
                  </Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      <DataTablePagination
        table={table}
        pageSizeOptions={pageSizeOptions}
        itemLabel={itemLabel}
      />
    </div>
  );
}
