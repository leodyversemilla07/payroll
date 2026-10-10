"use client";

import { Button } from "@workspace/ui/components/button";
import { Calendar } from "@workspace/ui/components/calendar";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import { cn } from "@workspace/ui/lib/utils";
import { Calendar as CalendarIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { parseIsoDate, toIsoDate } from "./date-picker";

export interface DateRangeValue {
  from: string;
  to: string;
}

export interface DateRangePreset extends DateRangeValue {
  label: string;
}

/** Month-aligned presets for DTR-style reporting filters. */
export function monthPresets(todayIso: string): DateRangePreset[] {
  const year = Number(todayIso.slice(0, 4));
  const month = Number(todayIso.slice(5, 7));
  const thisMonth: DateRangePreset = {
    label: "This month",
    from: `${todayIso.slice(0, 8)}01`,
    to: todayIso,
  };
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const lastDay = new Date(prevYear, prevMonth, 0).getDate();
  const mm = String(prevMonth).padStart(2, "0");
  return [
    thisMonth,
    {
      label: "Last month",
      from: `${prevYear}-${mm}-01`,
      to: `${prevYear}-${mm}-${String(lastDay).padStart(2, "0")}`,
    },
  ];
}

function IsoTextInput({
  id,
  value,
  onCommit,
  disabled,
}: {
  id: string;
  value: string;
  onCommit: (isoDate: string) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      value={text}
      placeholder="YYYY-MM-DD"
      disabled={disabled}
      onChange={(event) => {
        const nextText = event.currentTarget.value;
        setText(nextText);
        const trimmed = nextText.trim();
        if (!trimmed) {
          onCommit("");
          return;
        }
        if (parseIsoDate(trimmed)) onCommit(trimmed);
      }}
      onBlur={() => {
        setText(value);
      }}
    />
  );
}

interface DateRangePickerProps {
  fromId: string;
  toId: string;
  fromLabel: string;
  toLabel: string;
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  presets?: DateRangePreset[];
  className?: string;
}

export function DateRangePicker({
  fromId,
  toId,
  fromLabel,
  toLabel,
  value,
  onChange,
  min,
  max,
  disabled,
  presets = [],
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [twoMonths, setTwoMonths] = useState(true);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const apply = () => setTwoMonths(!query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  const fromDate = parseIsoDate(value.from);
  const toDate = parseIsoDate(value.to);
  const minDate = min ? parseIsoDate(min) : undefined;
  const maxDate = max ? parseIsoDate(max) : undefined;

  function handleSelect(range: { from?: Date; to?: Date } | undefined) {
    if (!range?.from) return;
    onChange({
      from: toIsoDate(range.from),
      to: range.to ? toIsoDate(range.to) : value.to,
    });
    if (range.to) setOpen(false);
  }

  return (
    <div
      className={cn(
        "grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]",
        className,
      )}
    >
      <Field>
        <FieldLabel htmlFor={fromId}>{fromLabel}</FieldLabel>
        <IsoTextInput
          id={fromId}
          value={value.from}
          disabled={disabled}
          onCommit={(from) => onChange({ ...value, from })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={toId}>{toLabel}</FieldLabel>
        <IsoTextInput
          id={toId}
          value={value.to}
          disabled={disabled}
          onCommit={(to) => onChange({ from: value.from, to })}
        />
      </Field>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled}
              aria-label="Pick a date range"
            />
          }
        >
          <CalendarIcon className="size-4 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          {presets.length > 0 && (
            <div className="flex flex-wrap gap-1 border-b p-2">
              {presets.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange({ from: preset.from, to: preset.to })}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          )}
          <Calendar
            mode="range"
            selected={
              fromDate || toDate ? { from: fromDate, to: toDate } : undefined
            }
            defaultMonth={fromDate}
            numberOfMonths={twoMonths ? 2 : 1}
            disabled={
              minDate || maxDate
                ? [
                    ...(minDate ? [{ before: minDate }] : []),
                    ...(maxDate ? [{ after: maxDate }] : []),
                  ]
                : undefined
            }
            startMonth={
              minDate
                ? new Date(minDate.getFullYear(), minDate.getMonth(), 1)
                : undefined
            }
            endMonth={
              maxDate
                ? new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0)
                : undefined
            }
            onSelect={handleSelect}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
