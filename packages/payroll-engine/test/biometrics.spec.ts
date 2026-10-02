import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_STANDARD_SHIFT,
  parseBiometricCsv,
  processBiometricLogs,
} from "../src/index";

describe("Biometric Clock Ingestion & DOLE Shift Engine", () => {
  it("should parse standard CSV biometric logs into chronological punch events", () => {
    const csvData = `
Employee_ID,Timestamp,Punch_Type
EMP-2026-001,2026-08-25 08:55:00,CHECK_IN
EMP-2026-001,2026-08-25 18:05:00,CHECK_OUT
EMP-2026-002,2026-08-25 09:20:00,CHECK_IN
EMP-2026-002,2026-08-25 20:30:00,CHECK_OUT
    `.trim();

    const parsed = parseBiometricCsv(csvData);
    expect(parsed).toHaveLength(4);
    expect(parsed[0]?.employeeNumber).toBe("EMP-2026-001");
    expect(parsed[0]?.punchType).toBe("CHECK_IN");
    expect(parsed[0]?.timestamp.toISOString()).toBe("2026-08-25T00:55:00.000Z");
  });

  it("should pair daily punches and compute standard 8-hour workday with 1-hour lunch break", () => {
    const csvData = `
EMP-2026-001,2026-08-25 09:00:00,CHECK_IN
EMP-2026-001,2026-08-25 18:00:00,CHECK_OUT
    `.trim();

    const logs = parseBiometricCsv(csvData);
    const processed = processBiometricLogs(logs, DEFAULT_STANDARD_SHIFT);

    expect(processed).toHaveLength(1);
    const day = processed[0];
    expect(day?.employeeNumber).toBe("EMP-2026-001");
    expect(day?.dateStr).toBe("2026-08-25");
    // 9 hours total span - 60 min lunch = 480 mins (8 hours)
    expect(day?.actualWorkedMinutes).toBe(480);
    expect(day?.tardinessMinutes).toBe(0);
    expect(day?.undertimeMinutes).toBe(0);
    expect(day?.overtimeMinutes).toBe(0);
    expect(day?.nightDiffMinutes).toBe(0);
    expect(day?.hasMissingPunch).toBe(false);
  });

  it("should detect tardiness and calculate overtime & night shift differentials", () => {
    const csvData = `
EMP-2026-003,2026-08-25 09:30:00,CHECK_IN
EMP-2026-003,2026-08-25 23:00:00,CHECK_OUT
    `.trim();

    const logs = parseBiometricCsv(csvData);
    const processed = processBiometricLogs(logs, DEFAULT_STANDARD_SHIFT);

    expect(processed).toHaveLength(1);
    const day = processed[0];
    // 9:30 AM arrival with 9:00 AM shift start -> 30 mins late
    expect(day?.tardinessMinutes).toBe(30);

    // 18:00 to 23:00 = 5 hours (300 mins) overtime
    expect(day?.overtimeMinutes).toBe(300);

    // 22:00 (10 PM) to 23:00 = 1 hour (60 mins) night shift differential
    expect(day?.nightDiffMinutes).toBe(60);
    expect(day?.hasMissingPunch).toBe(false);
  });

  it("should flag missing clock-out punch as anomaly", () => {
    const csvData = `
EMP-2026-004,2026-08-25 08:50:00,CHECK_IN
    `.trim();

    const logs = parseBiometricCsv(csvData);
    const processed = processBiometricLogs(logs, DEFAULT_STANDARD_SHIFT);

    expect(processed).toHaveLength(1);
    const day = processed[0];
    expect(day?.hasMissingPunch).toBe(true);
    expect(day?.remarks).toContain("Missing Clock-Out Punch");
  });
});

describe("Manila biometric civil dates and instants", () => {
  it.each(["UTC", "Asia/Manila", "America/New_York"])(
    "is independent of the host timezone %s",
    (timezone) => {
      const modulePath = fileURLToPath(
        new URL("../src/biometrics.ts", import.meta.url),
      );
      // Load the source as ESM without a build artifact or new dependency;
      // the package itself builds to CommonJS for API consumption.
      const csv = [
        "EMP_001,2026-08-25T01:00:00Z,CHECK_IN",
        "EMP_001,2026-08-25T10:00:00Z,CHECK_OUT",
        "EMP_001,2026-08-26 09:00:00,CHECK_IN",
        "EMP_001,2026-08-26 18:00:00,CHECK_OUT",
      ].join("\n");
      const script = `const source = require('node:module').stripTypeScriptTypes(require('node:fs').readFileSync(${JSON.stringify(modulePath)}, 'utf8')); import('data:text/javascript;base64,' + Buffer.from(source).toString('base64')).then(({parseBiometricCsv, processBiometricLogs}) => { const rows = processBiometricLogs(parseBiometricCsv(${JSON.stringify(csv)})); console.log(JSON.stringify(rows)); });`;
      const output = execFileSync(process.execPath, ["-e", script], {
        env: { ...process.env, TZ: timezone },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      expect(JSON.parse(output)[0]).toMatchObject({
        employeeNumber: "EMP_001",
        dateStr: "2026-08-25",
        timeIn: "2026-08-25T01:00:00.000Z",
        timeOut: "2026-08-25T10:00:00.000Z",
        actualWorkedMinutes: 480,
        tardinessMinutes: 0,
        undertimeMinutes: 0,
        overtimeMinutes: 0,
        nightDiffMinutes: 0,
        hasMissingPunch: false,
      });
      expect(JSON.parse(output)[1]).toMatchObject({
        dateStr: "2026-08-26",
        timeIn: "2026-08-26T01:00:00.000Z",
        timeOut: "2026-08-26T10:00:00.000Z",
        actualWorkedMinutes: 480,
        undertimeMinutes: 0,
        nightDiffMinutes: 0,
      });
    },
  );

  it.each([
    "2026-08-25 09:00:00",
    "2026-08-25T09:00",
    "2026-08-25T09:00:00+08:00",
    "2026-08-25T01:00:00Z",
    "2026-08-24T21:00:00-04:00",
  ])("normalizes %s to the same instant", (timestamp) => {
    expect(
      parseBiometricCsv(
        `EMP001,${timestamp},CHECK_IN`,
      )[0]?.timestamp.toISOString(),
    ).toBe("2026-08-25T01:00:00.000Z");
  });

  it("handles separate date/time columns instead of importing date-only midnight", () => {
    const rows = parseBiometricCsv(
      "ID,Date,Time,Type\nID001,2026-08-25,09:00:00,1\nID001,2026-08-25,18:00:00,2",
    );
    expect(rows[0]?.timestamp.toISOString()).toBe("2026-08-25T01:00:00.000Z");
    expect(rows[1]?.punchType).toBe("CHECK_OUT");
    expect(processBiometricLogs(rows)[0]?.actualWorkedMinutes).toBe(480);
  });

  it("keeps early Manila punches on the correct date despite a previous UTC date", () => {
    const logs = parseBiometricCsv(
      "EMP_001,2026-08-24T21:00:00Z,CHECK_IN\nEMP_001,2026-08-25T06:00:00Z,CHECK_OUT",
    );
    expect(
      processBiometricLogs(logs, {
        ...DEFAULT_STANDARD_SHIFT,
        expectedTimeIn: "05:00",
        expectedTimeOut: "14:00",
      })[0],
    ).toMatchObject({
      employeeNumber: "EMP_001",
      dateStr: "2026-08-25",
      actualWorkedMinutes: 480,
      tardinessMinutes: 0,
      undertimeMinutes: 0,
      overtimeMinutes: 0,
      nightDiffMinutes: 60,
    });
  });

  it("sorts unsorted direct logs without mutating the caller's array", () => {
    const logs = parseBiometricCsv(
      "EMP001,2026-08-25 09:00,CHECK_IN\nEMP001,2026-08-25 18:00,CHECK_OUT",
    ).reverse();
    const first = logs[0];
    expect(processBiometricLogs(logs)[0]?.actualWorkedMinutes).toBe(480);
    expect(logs[0]).toBe(first);
  });

  it.each([
    "2026-02-30 09:00:00",
    "2026-08-25 25:00:00",
    "2026-08-25 09:61:00",
    "08/25/2026 09:00:00",
    "2026-08-25",
    "2026-08-25T09:00:00+15:00",
  ])("rejects malformed or ambiguous timestamp %s", (timestamp) => {
    expect(() => parseBiometricCsv(`EMP001,${timestamp},CHECK_IN`)).toThrow(
      "Biometric CSV line 1",
    );
  });

  it("rejects an invalid row after valid rows instead of silently dropping it", () => {
    expect(() =>
      parseBiometricCsv(
        "EMP001,2026-08-25 09:00,CHECK_IN\nEMP001,invalid,CHECK_OUT",
      ),
    ).toThrow("Biometric CSV line 2");
    expect(() => parseBiometricCsv("EMP001,2026-08-25 09:00,UNKNOWN")).toThrow(
      "Biometric CSV line 1",
    );
  });

  it.each([
    "EMP001,2026-08-25 09:00,CHECK_OUT\nEMP001,2026-08-25 18:00,CHECK_IN",
    "EMP001,2026-08-25 09:00,CHECK_IN\nEMP001,2026-08-25 09:00,CHECK_OUT",
    "EMP001,2026-08-25 09:00,CHECK_IN\nEMP001,2026-08-25 12:00,CHECK_OUT\nEMP001,2026-08-25 13:00,CHECK_IN\nEMP001,2026-08-25 18:00,CHECK_OUT",
  ])("flags ambiguous punch pairings without inventing worked time", (csv) => {
    expect(processBiometricLogs(parseBiometricCsv(csv))[0]).toMatchObject({
      actualWorkedMinutes: 0,
      hasMissingPunch: true,
    });
  });

  it("does not invent an overnight shift pairing", () => {
    const rows = processBiometricLogs(
      parseBiometricCsv(
        "EMP001,2026-08-25 22:00,CHECK_IN\nEMP001,2026-08-26 06:00,CHECK_OUT",
      ),
    );
    expect(rows).toHaveLength(2);
    expect(
      rows.every((row) => row.hasMissingPunch && row.actualWorkedMinutes === 0),
    ).toBe(true);
    expect(() =>
      processBiometricLogs([], {
        ...DEFAULT_STANDARD_SHIFT,
        expectedTimeIn: "22:00",
        expectedTimeOut: "06:00",
      }),
    ).toThrow("Overnight shifts require explicit shift-date pairing");
  });

  it("floors partial night minutes rather than rounding them up", () => {
    const row = processBiometricLogs(
      parseBiometricCsv(
        "EMP001,2026-08-25 21:59:30,CHECK_IN\nEMP001,2026-08-25 22:00:30,CHECK_OUT",
      ),
    )[0];
    expect(row?.nightDiffMinutes).toBe(0);
  });
});
