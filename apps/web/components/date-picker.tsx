"use client";

import { Button } from "@workspace/ui/components/button";
import { Calendar } from "@workspace/ui/components/calendar";
import { Input } from "@workspace/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import { Calendar as CalendarIcon } from "lucide-react";
import { useEffect, useState } from "react";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDate(value: string): Date | undefined {
  if (!ISO_DATE_PATTERN.test(value)) return undefined;
  const parts = value.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return undefined;
  }
  const date = new Date(year, month - 1, day, 12);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  return date;
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDisplayDate(iso: string): string {
  const date = parseIsoDate(iso);
  if (!date) return iso;
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(date);
}

interface DatePickerProps {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (isoDate: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  captionLayout?: "label" | "dropdown" | "dropdown-months" | "dropdown-years";
}

export function DatePicker({
  id,
  name,
  value,
  defaultValue = "",
  onChange,
  min,
  max,
  required,
  disabled,
  placeholder = "YYYY-MM-DD",
  captionLayout = "label",
}: DatePickerProps) {
  const [innerValue, setInnerValue] = useState(defaultValue);
  const iso = value ?? innerValue;
  const [text, setText] = useState(() => (iso ? formatDisplayDate(iso) : ""));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setText(iso ? formatDisplayDate(iso) : "");
  }, [iso]);

  function commit(next: string) {
    if (value === undefined) setInnerValue(next);
    onChange?.(next);
  }

  const selected = parseIsoDate(iso);
  const minDate = min ? parseIsoDate(min) : undefined;
  const maxDate = max ? parseIsoDate(max) : undefined;

  return (
    <div className="relative">
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        value={text}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        onChange={(event) => {
          const nextText = event.currentTarget.value;
          setText(nextText);
          const trimmed = nextText.trim();
          if (!trimmed) {
            commit("");
            return;
          }
          if (parseIsoDate(trimmed)) commit(trimmed);
        }}
        onBlur={() => {
          setText(iso ? formatDisplayDate(iso) : "");
        }}
      />
      {name && <input type="hidden" name={name} value={iso} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label="Pick a date"
              className="absolute top-1/2 right-1 -translate-y-1/2"
            />
          }
        >
          <CalendarIcon className="size-4 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={selected}
            captionLayout={captionLayout}
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
            onSelect={(date) => {
              if (!date) return;
              commit(toIsoDate(date));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
