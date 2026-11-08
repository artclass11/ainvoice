import { describe, expect, it } from "vitest";
import {
  calculateInvoiceTotals,
  getPaymentStatus,
  parseMoneyToMinor,
  quantityToMilli
} from "./billing";

describe("money and quantity boundaries", () => {
  it("converts rupees to integer paise without floating-point drift", () => {
    expect(parseMoneyToMinor("125.50")).toBe(12550);
    expect(parseMoneyToMinor("1.2")).toBe(120);
    expect(parseMoneyToMinor("0001.09")).toBe(109);
    expect(parseMoneyToMinor("0")).toBe(0);
  });

  it("rejects malformed, negative, over-precision and unsafe currency amounts", () => {
    for (const value of ["-1", "1.999", "1,000", ".50", "1.", "1e5", "NaN"]) {
      expect(() => parseMoneyToMinor(value)).toThrow();
    }
    expect(() => parseMoneyToMinor("90071992547409.92")).toThrow();
  });

  it("stores quantities in exact thousandths", () => {
    expect(quantityToMilli(1)).toBe(1000);
    expect(quantityToMilli(1.25)).toBe(1250);
    expect(quantityToMilli(0.001)).toBe(1);
    expect(() => quantityToMilli(1.0005)).toThrow(/3 decimal places/);
    expect(() => quantityToMilli(0)).toThrow();
    expect(() => quantityToMilli(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("calculates tax and discounts on exact integer minor units", () => {
    const result = calculateInvoiceTotals([
      { description: "Part", quantity: 1, unitPriceMinor: 10000, discountMinor: 1000, taxRateBps: 1800 },
      { description: "Cable", quantity: 2, unitPriceMinor: 500, taxRateBps: 500 }
    ]);
    expect(result.subtotalMinor).toBe(11000);
    expect(result.discountMinor).toBe(1000);
    expect(result.taxMinor).toBe(1670);
    expect(result.totalMinor).toBe(11670);
  });

  it("rounds fractional quantities deterministically", () => {
    const result = calculateInvoiceTotals([
      { description: "Rice", quantity: 1.125, unitPriceMinor: 101, taxRateBps: 0 }
    ]);
    expect(result.lines[0].quantity).toBe(1.125);
    expect(result.subtotalMinor).toBe(114);
  });

  it("rejects zero, negative and over-precision quantities", () => {
    for (const quantity of [0, -1, 1.0005, 1_000_001]) {
      expect(() => calculateInvoiceTotals([
        { description: "Invalid", quantity, unitPriceMinor: 100, taxRateBps: 0 }
      ])).toThrow();
    }
  });

  it("rejects invalid discounts, tax rates and unsafe totals", () => {
    expect(() => calculateInvoiceTotals([
      { description: "Part", quantity: 1, unitPriceMinor: 100, discountMinor: 101, taxRateBps: 0 }
    ])).toThrow(/Discount/);
    expect(() => calculateInvoiceTotals([
      { description: "Part", quantity: 1, unitPriceMinor: 100, taxRateBps: 10001 }
    ])).toThrow(/tax rate/);
    expect(() => calculateInvoiceTotals([
      { description: "Huge", quantity: 1_000_000, unitPriceMinor: Number.MAX_SAFE_INTEGER, taxRateBps: 0 }
    ])).toThrow(/too large/);
  });

  it("classifies due, partial, paid and zero-value bills", () => {
    expect(getPaymentStatus(0, 10000)).toBe("due");
    expect(getPaymentStatus(3500, 10000)).toBe("partial");
    expect(getPaymentStatus(10000, 10000)).toBe("paid");
    expect(getPaymentStatus(0, 0)).toBe("paid");
    expect(() => getPaymentStatus(10001, 10000)).toThrow(/exceed/);
    expect(() => getPaymentStatus(-1, 10000)).toThrow();
  });
});
