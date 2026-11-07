import { describe, expect, it } from "vitest";
import { calculateInvoiceTotals, parseMoneyToMinor } from "./billing";

describe("billing money calculations", () => {
  it("converts rupees to integer paise", () => {
    expect(parseMoneyToMinor("125.50")).toBe(12550);
    expect(parseMoneyToMinor("0")).toBe(0);
  });

  it("rejects malformed currency input", () => {
    expect(() => parseMoneyToMinor("-1")).toThrow();
    expect(() => parseMoneyToMinor("1.999")).toThrow();
    expect(() => parseMoneyToMinor("1,000")).toThrow();
  });

  it("calculates an 18 percent tax on the line subtotal", () => {
    const result = calculateInvoiceTotals([
      { description: "Sample item", quantity: 2, unitPriceMinor: 10000, taxRateBps: 1800 }
    ]);
    expect(result.subtotalMinor).toBe(20000);
    expect(result.taxMinor).toBe(3600);
    expect(result.totalMinor).toBe(23600);
  });

  it("rounds tax to the nearest minor unit per line", () => {
    const result = calculateInvoiceTotals([
      { description: "Small item", quantity: 1, unitPriceMinor: 1, taxRateBps: 500 }
    ]);
    expect(result.taxMinor).toBe(0);
    expect(result.totalMinor).toBe(1);
  });

  it("rejects zero or negative quantities", () => {
    expect(() =>
      calculateInvoiceTotals([
        { description: "Invalid", quantity: 0, unitPriceMinor: 100, taxRateBps: 0 }
      ])
    ).toThrow();
  });
});
