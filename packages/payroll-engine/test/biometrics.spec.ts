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
