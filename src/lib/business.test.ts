import { describe, expect, it } from "vitest";
import { calculateInvoiceTotals, getPaymentStatus } from "./billing";

describe("enterprise billing invariants", () => {
  it("applies line discount before tax", () => {
    const result = calculateInvoiceTotals([
      { description: "Part", quantity: 1, unitPriceMinor: 10000, discountMinor: 1000, taxRateBps: 1800 }
    ]);
    expect(result.subtotalMinor).toBe(10000);
    expect(result.discountMinor).toBe(1000);
    expect(result.taxMinor).toBe(1620);
    expect(result.totalMinor).toBe(10620);
  });

  it("rejects a discount greater than the line gross amount", () => {
    expect(() => calculateInvoiceTotals([
      { description: "Part", quantity: 1, unitPriceMinor: 10000, discountMinor: 10001, taxRateBps: 0 }
    ])).toThrow();
  });

  it("classifies unpaid, partial and paid invoices", () => {
    expect(getPaymentStatus(0, 10000)).toBe("due");
    expect(getPaymentStatus(3500, 10000)).toBe("partial");
    expect(getPaymentStatus(10000, 10000)).toBe("paid");
  });
});
