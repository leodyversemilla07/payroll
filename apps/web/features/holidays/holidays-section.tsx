"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@workspace/api";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
  CalendarDays,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { PageHeaderAction } from "@/components/payroll-portal";
import { trpc } from "@/lib/trpc";
import { HolidaysDataTable, holidayDayTypes } from "./holidays-data-table";

type Holiday = inferRouterOutputs<AppRouter>["holidays"]["list"][number];

function formatHolidayDate(dateValue: Date | string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    dateStyle: "medium",
  }).format(new Date(dateValue));
}

export function HolidaysSection({ canManage = true }: { canManage?: boolean }) {
  const currentYear = new Date().getUTCFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const holidaysQuery = trpc.holidays.list.useQuery(
    { year: selectedYear },
    { retry: false },
  );

  const createMutation = trpc.holidays.create.useMutation({
    onSuccess: (created) => {
      void utils.holidays.list.invalidate();
      setShowCreateForm(false);
      setFormError(null);
      setStatusMessage(`Holiday "${created.name}" created successfully.`);
    },
    onError: (err) => {
      setFormError(err.message || "Failed to create holiday. Please retry.");
    },
  });

  const updateMutation = trpc.holidays.update.useMutation({
    onSuccess: (updated) => {
      void utils.holidays.list.invalidate();
      setEditingHoliday(null);
      setFormError(null);
      setStatusMessage(`Holiday "${updated.name}" updated successfully.`);
    },
    onError: (err) => {
      setFormError(err.message || "Failed to update holiday. Please retry.");
    },
  });

  const deleteMutation = trpc.holidays.delete.useMutation({
    onSuccess: (deleted) => {
      void utils.holidays.list.invalidate();
      setStatusMessage(`Holiday "${deleted.name}" deleted.`);
    },
    onError: (err) => {
      setStatusMessage(`Failed to delete holiday: ${err.message}`);
    },
  });

  const populateMutation = trpc.holidays.populatePresets.useMutation({
    onSuccess: (result) => {
      void utils.holidays.list.invalidate();
      setStatusMessage(
        `Added ${result.addedCount} Philippine statutory holiday(s) for ${selectedYear}. Existing holidays were preserved.`,
      );
    },
    onError: (err) => {
      setStatusMessage(`Failed to populate presets: ${err.message}`);
    },
  });

  function handleCreateSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (createMutation.isPending) return;
    const data = new FormData(e.currentTarget);
    const date = String(data.get("date") ?? "").trim();
    const name = String(data.get("name") ?? "").trim();
    const dayType = String(data.get("dayType") ?? "").trim() as
      | "REGULAR_HOLIDAY"
      | "SPECIAL_NON_WORKING_HOLIDAY"
      | "SPECIAL_WORKING_HOLIDAY"
      | "DOUBLE_HOLIDAY";
    const isRecurring = data.get("isRecurring") === "on";

    if (!date || !name || !dayType) {
      setFormError("All fields are required.");
      return;
    }

    setFormError(null);
    createMutation.mutate({
      date,
      name,
      dayType,
      isRecurring,
    });
  }

  function handleUpdateSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingHoliday || updateMutation.isPending) return;
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const dayType = String(data.get("dayType") ?? "").trim() as
      | "REGULAR_HOLIDAY"
      | "SPECIAL_NON_WORKING_HOLIDAY"
      | "SPECIAL_WORKING_HOLIDAY"
      | "DOUBLE_HOLIDAY";
    const isRecurring = data.get("isRecurring") === "on";

    if (!name || !dayType) {
      setFormError("Name and day type are required.");
      return;
    }

    setFormError(null);
    updateMutation.mutate({
      id: editingHoliday.id,
      name,
      dayType,
      isRecurring,
    });
  }

  function handleDelete(holiday: Holiday) {
    if (deleteMutation.isPending) return;
    if (
      window.confirm(
        `Are you sure you want to delete "${holiday.name}" on ${formatHolidayDate(holiday.date)}?`,
      )
    ) {
      deleteMutation.mutate({ id: holiday.id });
    }
  }

  const holidays = holidaysQuery.data ?? [];

  return (
    <div className="space-y-6">
      {canManage && (
        <PageHeaderAction>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={populateMutation.isPending}
              onClick={() => populateMutation.mutate({ year: selectedYear })}
            >
              <Sparkles className="mr-1.5 size-4 text-amber-500" />
              {populateMutation.isPending
                ? "Populating…"
                : `Populate ${selectedYear} Presets`}
            </Button>
            <Button
              type="button"
              size="sm"
              aria-expanded={showCreateForm}
              disabled={showCreateForm || !!editingHoliday}
              onClick={() => {
                setShowCreateForm(true);
                setEditingHoliday(null);
                setStatusMessage(null);
                setFormError(null);
              }}
            >
              <Plus className="mr-1.5 size-4" />
              Add holiday
            </Button>
          </div>
        </PageHeaderAction>
      )}

      <Card role="region" aria-label="Holiday calendar">
        <CardHeader>
          <CardTitle>Holiday Calendar</CardTitle>
          <CardDescription>
            Configure Philippine statutory regular holidays, special non-working
            days, and company holidays. Classifications determine statutory
            premiums during DTR processing and payroll calculation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-5 text-muted-foreground" />
              <label
                htmlFor="holiday-year-select"
                className="text-sm font-medium"
              >
                Calendar Year:
              </label>
              <Select
                items={[
                  currentYear - 1,
                  currentYear,
                  currentYear + 1,
                  currentYear + 2,
                ].map((year) => ({ value: String(year), label: String(year) }))}
                value={String(selectedYear)}
                onValueChange={(val) => {
                  if (!val) return;
                  setSelectedYear(Number(val));
                  setStatusMessage(null);
                  setShowCreateForm(false);
                  setEditingHoliday(null);
                }}
              >
                <SelectTrigger
                  id="holiday-year-select"
                  className="w-28 font-medium"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {[
                      currentYear - 1,
                      currentYear,
                      currentYear + 1,
                      currentYear + 2,
                    ].map((year) => (
                      <SelectItem key={year} value={String(year)}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="text-xs text-muted-foreground">
              {holidays.length} {holidays.length === 1 ? "holiday" : "holidays"}{" "}
              configured
            </div>
          </div>

          {statusMessage && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300"
            >
              <CheckCircle2 className="size-4 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {holidaysQuery.isPending ? (
            <div role="status" className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary shrink-0" />
                <span>Loading holidays…</span>
              </div>
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                    <Skeleton className="h-6 w-24 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          ) : holidaysQuery.isError ? (
            <div
              role="alert"
              className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
            >
              <span>Could not load holiday calendar.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void holidaysQuery.refetch()}
              >
                <RefreshCw className="mr-1.5 size-3.5" />
                Retry
              </Button>
            </div>
          ) : (
            <HolidaysDataTable
              data={holidays}
              canManage={canManage}
              onEdit={(holiday) => {
                setEditingHoliday(holiday);
                setShowCreateForm(false);
                setFormError(null);
              }}
              onDelete={handleDelete}
              emptyTitle={`No holidays configured for ${selectedYear}`}
              emptyDescription="You can add individual company holidays or use the preset button to auto-populate Philippine statutory national holidays."
              emptyAction={
                canManage ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={populateMutation.isPending}
                    onClick={() =>
                      populateMutation.mutate({ year: selectedYear })
                    }
                  >
                    <Sparkles className="mr-1.5 size-4 text-amber-500" />
                    Populate {selectedYear} Philippine Presets
                  </Button>
                ) : undefined
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Add Holiday Slide-over Sheet */}
      <Sheet
        open={showCreateForm}
        onOpenChange={(open) => {
          setShowCreateForm(open);
          if (!open) setFormError(null);
        }}
      >
        <SheetContent
          side="right"
          className="data-[side=right]:sm:max-w-xl data-[side=right]:lg:max-w-2xl p-0"
        >
          <section
            id="holiday-create-form"
            aria-label="Add holiday"
            className="flex flex-col h-full min-h-0 bg-background"
          >
            <SheetHeader className="flex-none border-b bg-card/60 px-6 py-5 backdrop-blur-sm pr-12 text-left">
              <div className="flex flex-col gap-1 text-left">
                <SheetTitle className="font-heading text-lg font-semibold tracking-tight text-foreground">
                  Add holiday
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground">
                  Configure a Philippine statutory regular holiday, special
                  non-working day, or company holiday.
                </SheetDescription>
              </div>
            </SheetHeader>
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
              <form onSubmit={handleCreateSubmit}>
                <FieldGroup>
                  <FieldSet disabled={createMutation.isPending}>
                    <FieldLegend>Holiday details</FieldLegend>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="create-holiday-date">
                          Holiday date
                        </FieldLabel>
                        <Input
                          id="create-holiday-date"
                          name="date"
                          type="date"
                          defaultValue={`${selectedYear}-01-01`}
                          required
                        />
                        <FieldDescription>
                          Calendar date in Asia/Manila.
                        </FieldDescription>
                      </Field>

                      <Field>
                        <FieldLabel htmlFor="create-holiday-name">
                          Holiday name
                        </FieldLabel>
                        <Input
                          id="create-holiday-name"
                          name="name"
                          placeholder="e.g. Independence Day"
                          minLength={2}
                          maxLength={100}
                          required
                        />
                        <FieldDescription>
                          Official statutory proclamation name.
                        </FieldDescription>
                      </Field>
                    </div>
                  </FieldSet>

                  <FieldSet disabled={createMutation.isPending}>
                    <FieldLegend>
                      Statutory classification & pay rules
                    </FieldLegend>
                    <Field>
                      <FieldLabel htmlFor="create-holiday-type">
                        Day type classification
                      </FieldLabel>
                      <Select
                        items={holidayDayTypes}
                        name="dayType"
                        defaultValue="REGULAR_HOLIDAY"
                        required
                      >
                        <SelectTrigger
                          id="create-holiday-type"
                          className="w-full"
                        >
                          <SelectValue placeholder="Select day type classification" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {holidayDayTypes.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        Regular holidays earn 100% pay if unworked, or 200% if
                        worked. Special non-working days earn 130% when worked.
                      </FieldDescription>
                    </Field>

                    <Field orientation="horizontal">
                      <Checkbox
                        id="create-holiday-recurring"
                        name="isRecurring"
                      />
                      <FieldLabel htmlFor="create-holiday-recurring">
                        Repeats annually on this month and day (Fixed-date
                        holiday)
                      </FieldLabel>
                    </Field>
                  </FieldSet>

                  {formError && <FieldError>{formError}</FieldError>}

                  <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={createMutation.isPending}
                      onClick={() => {
                        setShowCreateForm(false);
                        setFormError(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending}>
                      {createMutation.isPending
                        ? "Saving holiday…"
                        : "Save holiday"}
                    </Button>
                  </div>
                </FieldGroup>
              </form>
            </div>
          </section>
        </SheetContent>
      </Sheet>

      {/* Edit Holiday Slide-over Sheet */}
      <Sheet
        open={!!editingHoliday}
        onOpenChange={(open) => {
          if (!open) {
            setEditingHoliday(null);
            setFormError(null);
          }
        }}
      >
        <SheetContent
          side="right"
          className="data-[side=right]:sm:max-w-xl data-[side=right]:lg:max-w-2xl p-0"
        >
          {editingHoliday && (
            <section
              id="holiday-edit-form"
              aria-label="Edit holiday"
              className="flex flex-col h-full min-h-0 bg-background"
            >
              <SheetHeader className="flex-none border-b bg-card/60 px-6 py-5 backdrop-blur-sm pr-12 text-left">
                <div className="flex flex-col gap-1 text-left">
                  <SheetTitle className="font-heading text-lg font-semibold tracking-tight text-foreground truncate">
                    Edit holiday: {editingHoliday.name}
                  </SheetTitle>
                  <SheetDescription className="text-xs text-muted-foreground">
                    Modify classification or recurrence rule. Calendar date:{" "}
                    {formatHolidayDate(editingHoliday.date)}.
                  </SheetDescription>
                </div>
              </SheetHeader>
              <div className="flex-1 min-h-0 overflow-y-auto p-6">
                <form onSubmit={handleUpdateSubmit}>
                  <FieldGroup>
                    <FieldSet disabled={updateMutation.isPending}>
                      <FieldLegend>Holiday details</FieldLegend>
                      <Field>
                        <FieldLabel htmlFor="edit-holiday-name">
                          Holiday name
                        </FieldLabel>
                        <Input
                          id="edit-holiday-name"
                          name="name"
                          defaultValue={editingHoliday.name}
                          minLength={2}
                          maxLength={100}
                          required
                        />
                        <FieldDescription>
                          Official statutory title or company name.
                        </FieldDescription>
                      </Field>
                    </FieldSet>

                    <FieldSet disabled={updateMutation.isPending}>
                      <FieldLegend>
                        Statutory classification & pay rules
                      </FieldLegend>
                      <Field>
                        <FieldLabel htmlFor="edit-holiday-type">
                          Day type classification
                        </FieldLabel>
                        <Select
                          items={holidayDayTypes}
                          name="dayType"
                          defaultValue={editingHoliday.dayType}
                          required
                        >
                          <SelectTrigger
                            id="edit-holiday-type"
                            className="w-full"
                          >
                            <SelectValue placeholder="Select day type classification" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {holidayDayTypes.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <FieldDescription>
                          Determines statutory premiums during DTR processing
                          and payroll calculation.
                        </FieldDescription>
                      </Field>

                      <Field orientation="horizontal">
                        <Checkbox
                          id="edit-holiday-recurring"
                          name="isRecurring"
                          defaultChecked={editingHoliday.isRecurring}
                        />
                        <FieldLabel htmlFor="edit-holiday-recurring">
                          Repeats annually on this month and day
                        </FieldLabel>
                      </Field>
                    </FieldSet>

                    {formError && <FieldError>{formError}</FieldError>}

                    <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={updateMutation.isPending}
                        onClick={() => {
                          setEditingHoliday(null);
                          setFormError(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={updateMutation.isPending}>
                        {updateMutation.isPending
                          ? "Saving changes…"
                          : "Save changes"}
                      </Button>
                    </div>
                  </FieldGroup>
                </form>
              </div>
            </section>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
