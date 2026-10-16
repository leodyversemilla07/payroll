import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { manilaIsoDate, manilaYear } from "../src/manila-date";

describe("Manila civil-date helpers", () => {
  it.each([
    // 23:59:59 in Manila on the last day of a year.
    ["2025-12-31T15:59:59.000Z", "2025-12-31", 2025],
    // 00:00:00 Manila New Year: before midnight-8h in UTC the civil date and
    // year have already flipped while UTC still reads the previous day.
    ["2025-12-31T16:00:00.000Z", "2026-01-01", 2026],
    // 01:00 UTC = 09:00 Manila: a naive UTC-today would lag a whole day.
    ["2026-01-01T00:30:00.000Z", "2026-01-01", 2026],
    ["2026-08-25T01:00:00.000Z", "2026-08-25", 2026],
  ])(
    "%s is civil %s (year %s) in Manila",
    (iso, expectedDate, expectedYear) => {
      const instant = new Date(iso);
      expect(manilaIsoDate(instant)).toBe(expectedDate);
      expect(manilaYear(instant)).toBe(expectedYear);
    },
  );
});

describe("Manila helpers ignore the host timezone", () => {
  it.each(["UTC", "Asia/Manila", "America/New_York"])(
    "results are identical under TZ=%s",
    (timezone) => {
      const modulePath = fileURLToPath(
        new URL("../src/manila-date.ts", import.meta.url),
      );
      // Load the source as ESM without a build artifact or new dependency;
      // the package itself builds to CommonJS for API consumption.
      const script = `const source = require('node:module').stripTypeScriptTypes(require('node:fs').readFileSync(${JSON.stringify(modulePath)}, 'utf8')); import('data:text/javascript;base64,' + Buffer.from(source).toString('base64')).then(({manilaIsoDate, manilaYear}) => { console.log(JSON.stringify({ newYear: manilaIsoDate(new Date("2025-12-31T16:00:00.000Z")), lagged: manilaIsoDate(new Date("2026-01-01T00:30:00.000Z")), lastMinute: manilaYear(new Date("2025-12-31T15:59:59.000Z")) })); });`;
      const output = execFileSync(process.execPath, ["-e", script], {
        env: { ...process.env, TZ: timezone },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      expect(JSON.parse(output)).toEqual({
        newYear: "2026-01-01",
        lagged: "2026-01-01",
        lastMinute: 2025,
      });
    },
  );
});
