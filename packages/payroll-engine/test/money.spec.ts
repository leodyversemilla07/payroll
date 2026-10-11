import { describe, expect, it } from "vitest";
import { formatCentavosGrouped, formatCentavosToPesos } from "../src/index";

describe("Exact centavo formatting (no float)", () => {
  it("formats ordinary amounts with two fraction digits", () => {
    expect(formatCentavosToPesos(0n)).toBe("0.00");
    expect(formatCentavosToPesos(1n)).toBe("0.01");
    expect(formatCentavosToPesos(100n)).toBe("1.00");
    expect(formatCentavosToPesos(123450n)).toBe("1234.50");
    expect(formatCentavosToPesos(-250n)).toBe("-2.50");
  });

  it("groups thousands for human-readable documents", () => {
    expect(formatCentavosGrouped(0n)).toBe("0.00");
    expect(formatCentavosGrouped(123450n)).toBe("1,234.50");
    expect(formatCentavosGrouped(123456789n)).toBe("1,234,567.89");
    expect(formatCentavosGrouped(-123456789n)).toBe("-1,234,567.89");
  });

  it("stays exact beyond float precision (2^53 centavos)", () => {
    const huge = 9007199254740993n; // 2^53 + 1: not representable as float
    expect(formatCentavosToPesos(huge)).toBe("90071992547409.93");
    expect(formatCentavosGrouped(huge)).toBe("90,071,992,547,409.93");
    // The old float path collapses these two distinct values:
    expect(Number(huge) / 100).toBe(Number(huge - 1n) / 100);
    expect(formatCentavosToPesos(huge - 1n)).toBe("90071992547409.92");
  });

  it("matches float formatting inside the safe range", () => {
    const samples = [0n, 5n, 99n, 100n, 101n, 123456789n, 99999999999n];
    for (const cents of samples) {
      expect(formatCentavosToPesos(cents)).toBe(
        (Number(cents) / 100).toFixed(2),
      );
      expect(formatCentavosGrouped(cents)).toBe(
        (Number(cents) / 100).toLocaleString("en-PH", {
          minimumFractionDigits: 2,
        }),
      );
    }
  });
});
