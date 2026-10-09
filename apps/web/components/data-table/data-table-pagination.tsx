"use client";

import type { Table } from "@tanstack/react-table";
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  pageSizeOptions?: number[];
  itemLabel?: string;
}

function getVisiblePages(currentPage: number, pageCount: number) {
  if (pageCount <= 5) {
    return Array.from({ length: pageCount }, (_, i) => ({
      type: "page" as const,
      page: i,
      key: `page-${i}`,
    }));
  }

  if (currentPage <= 2) {
    return [
      { type: "page" as const, page: 0, key: "page-0" },
      { type: "page" as const, page: 1, key: "page-1" },
      { type: "page" as const, page: 2, key: "page-2" },
      { type: "ellipsis" as const, key: "ellipsis-end" },
      {
        type: "page" as const,
        page: pageCount - 1,
        key: `page-${pageCount - 1}`,
      },
    ];
  }

  if (currentPage >= pageCount - 3) {
    return [
      { type: "page" as const, page: 0, key: "page-0" },
      { type: "ellipsis" as const, key: "ellipsis-start" },
      {
        type: "page" as const,
        page: pageCount - 3,
        key: `page-${pageCount - 3}`,
      },
      {
        type: "page" as const,
        page: pageCount - 2,
        key: `page-${pageCount - 2}`,
      },
      {
        type: "page" as const,
        page: pageCount - 1,
        key: `page-${pageCount - 1}`,
      },
    ];
  }

  return [
    { type: "page" as const, page: 0, key: "page-0" },
    { type: "ellipsis" as const, key: "ellipsis-start" },
    { type: "page" as const, page: currentPage, key: `page-${currentPage}` },
    { type: "ellipsis" as const, key: "ellipsis-end" },
    {
      type: "page" as const,
      page: pageCount - 1,
      key: `page-${pageCount - 1}`,
    },
  ];
}

export function DataTablePagination<TData>({
  table,
  pageSizeOptions = [10, 20, 30, 50],
  itemLabel = "items",
}: DataTablePaginationProps<TData>) {
  const pageIndex = table.getState().pagination.pageIndex;
  const pageSize = table.getState().pagination.pageSize;
  const totalRows = table.getFilteredRowModel().rows.length;
  const startRow = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const endRow = Math.min((pageIndex + 1) * pageSize, totalRows);
  const selectedRows = table.getFilteredSelectedRowModel().rows.length;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground pt-1">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          {selectedRows > 0 ? (
            <span>
              {selectedRows} of {totalRows} row(s) selected
            </span>
          ) : (
            <span>
              Showing {startRow} to {endRow} of {totalRows} {itemLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span>Rows per page</span>
          <Select
            items={pageSizeOptions.map((n) => ({
              value: String(n),
              label: String(n),
            }))}
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
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
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
  );
}
