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
  FieldLabel,
  FieldSet,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select";
import {
  CalendarDays,
  CheckCircle2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { trpc } from "@/lib/trpc";

type Holiday = inferRouterOutputs<AppRouter>["holidays"]["list"][number];

const holidayDayTypes = [
  {
    value: "REGULAR_HOLIDAY",
    label: "Regular Holiday (200% worked / 100% unworked)",
    badgeColor:
      "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30",
  },
  {
    value: "SPECIAL_NON_WORKING_HOLIDAY",
    label: "Special Non-Working Holiday (130% worked / 0% unworked)",
    badgeColor:
      "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30",
  },
  {
    value: "SPECIAL_WORKING_HOLIDAY",
    label: "Special Working Holiday (100% regular pay)",
    badgeColor:
      "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  },
  {
    value: "DOUBLE_HOLIDAY",
    label: "Double Holiday (300% worked / 200% unworked)",
    badgeColor:
      "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  },
] as const;

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
      <Card role="region" aria-label="Holiday calendar">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Holiday Calendar</CardTitle>
            <CardDescription>
              Configure Philippine statutory regular holidays, special
              non-working days, and company holidays. Classifications determine
              statutory premiums during DTR processing and payroll calculation.
            </CardDescription>
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
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
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-5 text-muted-foreground" />
              <label
                htmlFor="holiday-year-select"
                className="text-sm font-medium"
              >
                Calendar Year:
              </label>
              <NativeSelect
                id="holiday-year-select"
                value={String(selectedYear)}
                onChange={(e) => {
                  setSelectedYear(Number(e.target.value));
                  setStatusMessage(null);
                  setShowCreateForm(false);
                  setEditingHoliday(null);
                }}
                className="w-28 font-medium"
              >
                {[
                  currentYear - 1,
                  currentYear,
                  currentYear + 1,
                  currentYear + 2,
                ].map((year) => (
                  <NativeSelectOption key={year} value={String(year)}>
                    {year}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
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

          {showCreateForm && (
            <Card
              role="region"
              aria-label="Add holiday"
              className="border-primary/30 bg-muted/20"
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Add Holiday</CardTitle>
                <CardDescription>
                  Enter holiday details. Recurring holidays repeat every year on
                  the same calendar date.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateSubmit} className="space-y-4">
                  <FieldSet disabled={createMutation.isPending}>
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
                      </Field>
                    </div>

                    <Field>
                      <FieldLabel htmlFor="create-holiday-type">
                        Day type classification
                      </FieldLabel>
                      <NativeSelect
                        id="create-holiday-type"
                        name="dayType"
                        defaultValue="REGULAR_HOLIDAY"
                        required
                        className="w-full"
                      >
                        {holidayDayTypes.map((type) => (
                          <NativeSelectOption
                            key={type.value}
                            value={type.value}
                          >
                            {type.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
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

                    {formError && <FieldError>{formError}</FieldError>}

                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button type="submit" disabled={createMutation.isPending}>
                        {createMutation.isPending ? "Saving…" : "Save holiday"}
                      </Button>
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
                    </div>
                  </FieldSet>
                </form>
              </CardContent>
            </Card>
          )}

          {editingHoliday && (
            <Card
              role="region"
              aria-label="Edit holiday"
              className="border-primary/30 bg-muted/20"
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Edit Holiday: {editingHoliday.name} (
                  {formatHolidayDate(editingHoliday.date)})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdateSubmit} className="space-y-4">
                  <FieldSet disabled={updateMutation.isPending}>
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
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="edit-holiday-type">
                        Day type classification
                      </FieldLabel>
                      <NativeSelect
                        id="edit-holiday-type"
                        name="dayType"
                        defaultValue={editingHoliday.dayType}
                        required
                        className="w-full"
                      >
                        {holidayDayTypes.map((type) => (
                          <NativeSelectOption
                            key={type.value}
                            value={type.value}
                          >
                            {type.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
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

                    {formError && <FieldError>{formError}</FieldError>}

                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button type="submit" disabled={updateMutation.isPending}>
                        {updateMutation.isPending
                          ? "Saving changes…"
                          : "Save changes"}
                      </Button>
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
                    </div>
                  </FieldSet>
                </form>
              </CardContent>
            </Card>
          )}

          {holidaysQuery.isPending ? (
            <p role="status">Loading holidays…</p>
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
          ) : holidays.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center space-y-3">
              <CalendarDays className="mx-auto size-8 text-muted-foreground" />
              <p className="text-sm font-medium">
                No holidays configured for {selectedYear}.
              </p>
              <p className="text-xs text-muted-foreground">
                You can add individual company holidays or use the preset button
                to auto-populate Philippine statutory national holidays.
              </p>
              {canManage && (
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
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
                    <th className="p-3">Date</th>
                    <th className="p-3">Holiday Name</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Recurrence</th>
                    {canManage && <th className="p-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {holidays.map((holiday) => {
                    const typeConfig = holidayDayTypes.find(
                      (t) => t.value === holiday.dayType,
                    );
                    return (
                      <tr key={holiday.id} className="hover:bg-muted/30">
                        <td className="p-3 font-medium whitespace-nowrap">
                          {formatHolidayDate(holiday.date)}
                        </td>
                        <td className="p-3 font-medium">{holiday.name}</td>
                        <td className="p-3 whitespace-nowrap">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                              typeConfig?.badgeColor ?? "bg-muted"
                            }`}
                          >
                            {holiday.dayType.replaceAll("_", " ")}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                          {holiday.isRecurring ? (
                            <span className="inline-flex items-center text-foreground font-medium">
                              Annual
                            </span>
                          ) : (
                            "One-time"
                          )}
                        </td>
                        {canManage && (
                          <td className="p-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label={`Edit ${holiday.name}`}
                                onClick={() => {
                                  setEditingHoliday(holiday);
                                  setShowCreateForm(false);
                                  setFormError(null);
                                }}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label={`Delete ${holiday.name}`}
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => handleDelete(holiday)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
