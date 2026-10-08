"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@workspace/api";
import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
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
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@workspace/ui/components/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { cn } from "@workspace/ui/lib/utils";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useMemo, useState } from "react";

export type EmployeeListItem =
  inferRouterOutputs<AppRouter>["employees"]["list"][number];

interface EmployeeDataTableProps {
  data: EmployeeListItem[];
  selectedId: string | null;
  onSelectEmployee: (id: string) => void;
}

export function formatEmploymentStatus(status?: string | null): string {
  if (!status) return "—";
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "ON_LEAVE":
      return "On Leave";
    case "SUSPENDED":
      return "Suspended";
    case "RESIGNED":
      return "Resigned";
    case "TERMINATED":
      return "Terminated";
    case "RETIRED":
      return "Retired";
    default:
      return status.replaceAll("_", " ");
  }
}

export function formatEmploymentType(type?: string | null): string {
  if (!type) return "—";
  switch (type) {
    case "REGULAR":
      return "Regular";
    case "PROBATIONARY":
      return "Probationary";
    case "CONTRACTUAL":
      return "Contractual";
    case "PROJECT_BASED":
      return "Project-based";
    case "PART_TIME":
      return "Part-time";
    default:
      return type.replaceAll("_", " ");
  }
}

export function getStatusBadgeClassName(status?: string | null): string {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20";
    case "ON_LEAVE":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20";
    case "SUSPENDED":
      return "bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20";
    case "RESIGNED":
    case "TERMINATED":
      return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20";
    case "RETIRED":
      return "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20";
    default:
      return "bg-secondary text-secondary-foreground border border-transparent";
  }
}

const EMPLOYMENT_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "ON_LEAVE", label: "On Leave" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "RESIGNED", label: "Resigned" },
  { value: "TERMINATED", label: "Terminated" },
  { value: "RETIRED", label: "Retired" },
];

const STATUS_OPTIONS = [
  { value: "ALL", label: "All statuses" },
  ...EMPLOYMENT_STATUSES,
];

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50].map((size) => ({
  value: String(size),
  label: String(size),
}));

type PageItem =
  | { type: "page"; page: number; key: string }
  | { type: "ellipsis"; key: string };

function getVisiblePages(currentPage: number, pageCount: number): PageItem[] {
  if (pageCount <= 5) {
    return Array.from({ length: pageCount }, (_, i) => ({
      type: "page",
      page: i,
      key: `page-${i}`,
    }));
  }
  if (currentPage <= 2) {
    return [
      { type: "page", page: 0, key: "page-0" },
      { type: "page", page: 1, key: "page-1" },
      { type: "page", page: 2, key: "page-2" },
      { type: "ellipsis", key: "ellipsis-end" },
      { type: "page", page: pageCount - 1, key: `page-${pageCount - 1}` },
    ];
  }
  if (currentPage >= pageCount - 3) {
    return [
      { type: "page", page: 0, key: "page-0" },
      { type: "ellipsis", key: "ellipsis-start" },
      { type: "page", page: pageCount - 3, key: `page-${pageCount - 3}` },
      { type: "page", page: pageCount - 2, key: `page-${pageCount - 2}` },
      { type: "page", page: pageCount - 1, key: `page-${pageCount - 1}` },
    ];
  }
  return [
    { type: "page", page: 0, key: "page-0" },
    { type: "ellipsis", key: "ellipsis-start" },
    { type: "page", page: currentPage, key: `page-${currentPage}` },
    { type: "ellipsis", key: "ellipsis-end" },
    { type: "page", page: pageCount - 1, key: `page-${pageCount - 1}` },
  ];
}

export function EmployeeDataTable({
  data,
  selectedId,
  onSelectEmployee,
}: EmployeeDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const columns = useMemo<ColumnDef<EmployeeListItem>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => `${row.firstName} ${row.lastName}`,
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 data-[state=open]:bg-accent"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            <span>Employee</span>
            {column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 size-3.5" />
            ) : column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 size-3.5" />
            ) : (
              <ArrowUpDown className="ml-2 size-3.5" />
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const employee = row.original;
          return (
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full flex-col items-start whitespace-normal p-0 text-left justify-start hover:bg-transparent"
              aria-pressed={selectedId === employee.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelectEmployee(employee.id);
              }}
            >
              <strong className="max-w-full break-words text-foreground">
                {employee.firstName} {employee.lastName}
              </strong>
              <span className="max-w-full break-words text-xs text-muted-foreground sm:hidden">
                {employee.employeeNumber} ·{" "}
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-1.5 py-0.2 text-[10px] font-medium tracking-tight",
                    getStatusBadgeClassName(employee.employmentStatus),
                  )}
                >
                  {formatEmploymentStatus(employee.employmentStatus)}
                </span>
              </span>
            </Button>
          );
        },
      },
      {
        accessorKey: "employeeNumber",
        id: "employeeNumber",
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 data-[state=open]:bg-accent"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            <span>ID</span>
            {column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 size-3.5" />
            ) : column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 size-3.5" />
            ) : (
              <ArrowUpDown className="ml-2 size-3.5" />
            )}
          </Button>
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.employeeNumber}
          </span>
        ),
      },
      {
        id: "department",
        accessorFn: (row) => row.department?.name ?? "—",
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 data-[state=open]:bg-accent"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            <span>Department</span>
            {column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 size-3.5" />
            ) : column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 size-3.5" />
            ) : (
              <ArrowUpDown className="ml-2 size-3.5" />
            )}
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.department?.name ?? "—"}
          </span>
        ),
      },
      {
        id: "employmentType",
        accessorFn: (row) => row.employmentType,
        header: () => <span>Employment Type</span>,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatEmploymentType(row.original.employmentType)}
          </span>
        ),
      },
      {
        accessorKey: "employmentStatus",
        id: "employmentStatus",
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 data-[state=open]:bg-accent"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            <span>Status</span>
            {column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 size-3.5" />
            ) : column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 size-3.5" />
            ) : (
              <ArrowUpDown className="ml-2 size-3.5" />
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const status = row.original.employmentStatus;
          return (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium tracking-tight",
                getStatusBadgeClassName(status),
              )}
            >
              {formatEmploymentStatus(status)}
            </span>
          );
        },
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const employee = row.original;
          return (
            <div className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      className="size-8 p-0"
                      onClick={(e) => e.stopPropagation()}
                    />
                  }
                >
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        if (employee.employeeNumber) {
                          void navigator.clipboard?.writeText(
                            employee.employeeNumber,
                          );
                        }
                      }}
                    >
                      Copy employee ID
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEmployee(employee.id);
                      }}
                    >
                      View details
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [selectedId, onSelectEmployee],
  );

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
    globalFilterFn: (row, _columnId, filterValue) => {
      const search = String(filterValue).toLowerCase().trim();
      if (!search) return true;
      const emp = row.original;
      const name = `${emp.firstName} ${emp.lastName}`.toLowerCase();
      const num = (emp.employeeNumber ?? "").toLowerCase();
      const dept = (emp.department?.name ?? "").toLowerCase();
      const email = (emp.email ?? "").toLowerCase();
      return (
        name.includes(search) ||
        num.includes(search) ||
        dept.includes(search) ||
        email.includes(search)
      );
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
    },
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  const columnClassMap: Record<string, string> = {
    department: "hidden md:table-cell",
    employmentType: "hidden sm:table-cell",
    actions: "text-right",
  };

  const totalRows = table.getFilteredRowModel().rows.length;
  const pageIndex = table.getState().pagination.pageIndex;
  const pageSize = table.getState().pagination.pageSize;
  const startRow = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const endRow = Math.min((pageIndex + 1) * pageSize, totalRows);

  return (
    <div className="space-y-4">
      {/* Controls Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs min-w-[200px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search employees..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>

          <Select
            items={STATUS_OPTIONS}
            value={statusFilter}
            onValueChange={(val) => {
              if (val) {
                setStatusFilter(val);
                table
                  .getColumn("employmentStatus")
                  ?.setFilterValue(val === "ALL" ? undefined : val);
              }
            }}
          >
            <SelectTrigger
              size="sm"
              className="h-8 gap-1.5 min-w-[130px] text-xs"
              aria-label="Filter by employment status"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} side="bottom">
              <SelectGroup>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" className="h-8 gap-1.5" />
              }
            >
              <SlidersHorizontal className="size-3.5" />
              <span>Columns</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {table
                  .getAllColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(Boolean(value))
                      }
                    >
                      {column.id === "employeeNumber"
                        ? "ID"
                        : column.id === "employmentType"
                          ? "Employment Type"
                          : column.id === "employmentStatus"
                            ? "Status"
                            : column.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table Container */}
      <div className="w-full min-w-0 overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
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
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={
                    selectedId === row.original.id ? "selected" : undefined
                  }
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  onClick={() => onSelectEmployee(row.original.id)}
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
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No employees found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            Showing {startRow} to {endRow} of {totalRows} employees
          </div>
          <div className="flex items-center gap-1.5">
            <span>Rows per page</span>
            <Select
              items={PAGE_SIZE_OPTIONS}
              value={String(pageSize)}
              onValueChange={(val) => {
                if (val) table.setPageSize(Number(val));
              }}
            >
              <SelectTrigger
                size="sm"
                className="h-7 w-[68px] text-xs"
                aria-label="Rows per page"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} side="top">
                <SelectGroup>
                  {PAGE_SIZE_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="self-center sm:self-auto">
          <Pagination className="mx-0 w-auto">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (table.getCanPreviousPage()) {
                      table.previousPage();
                    }
                  }}
                  aria-disabled={!table.getCanPreviousPage()}
                  className={
                    !table.getCanPreviousPage()
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>

              {getVisiblePages(pageIndex, table.getPageCount()).map((item) =>
                item.type === "ellipsis" ? (
                  <PaginationItem key={item.key}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={item.key}>
                    <PaginationLink
                      href="#"
                      isActive={item.page === pageIndex}
                      onClick={(e) => {
                        e.preventDefault();
                        table.setPageIndex(item.page);
                      }}
                      className="cursor-pointer"
                    >
                      {item.page + 1}
                    </PaginationLink>
                  </PaginationItem>
                ),
              )}

              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (table.getCanNextPage()) {
                      table.nextPage();
                    }
                  }}
                  aria-disabled={!table.getCanNextPage()}
                  className={
                    !table.getCanNextPage()
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>
    </div>
  );
}
