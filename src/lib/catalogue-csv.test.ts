import { describe, expect, it } from "vitest";
import {
  createProductCsvTemplate,
  exportProductsCsv,
  previewProductCsv,
  PRODUCT_CSV_MAX_ROWS
} from "./catalogue-csv";
import type { Product } from "./db";

const header = "name,sku,unit,sale_price,purchase_price,tax_rate,stock_quantity,reorder_level,track_stock,active";

describe("product catalogue CSV", () => {
  it("creates a header-only template that can be parsed", () => {
    expect(createProductCsvTemplate().trim()).toBe(header);
    expect(previewProductCsv(createProductCsvTemplate())).toEqual({
      products: [],
      issues: [],
      rowsRead: 0
    });
  });

  it("parses quoted commas, escaped quotes and multiline product names", () => {
    const csv = header + '\n"Tea, premium","TEA-01","box",125.50,80,5,4.250,1,true,true\n' +
      '"Tea ""special""\nblend","TEA-02","kg",200,120,12.5,3.5,1,false,true\n';
    const preview = previewProductCsv(csv);
    expect(preview.issues).toHaveLength(0);
    expect(preview.products).toHaveLength(2);
    expect(preview.products[0]).toMatchObject({
      name: "Tea, premium",
      sku: "TEA-01",
      salePriceMinor: 12550,
      purchasePriceMinor: 8000,
      taxRateBps: 500,
      stockQuantityMilli: 4250,
      reorderLevelMilli: 1000,
      trackStock: true,
      active: true
    });
    expect(preview.products[1].name).toBe('Tea "special"\nblend');
    expect(preview.products[1].taxRateBps).toBe(1250);
    expect(preview.products[1].stockQuantityMilli).toBe(3500);
  });

  it("normalizes SKUs and rejects existing and repeated SKUs without dropping valid rows", () => {
    const csv = header + "\nCoffee,cof-1,pcs,10\nTea,TEA-1,pcs,15\n" +
      "Coffee duplicate,COF-1,pcs,20\nCoffee existing,OLD-1,pcs,30\n";
    const preview = previewProductCsv(csv, [{ sku: "old-1" }]);
    expect(preview.products.map(product => product.sku)).toEqual(["COF-1", "TEA-1"]);
    expect(preview.issues).toHaveLength(2);
    expect(preview.issues[0].message).toMatch(/already exists or is repeated/);
    expect(preview.issues[1].message).toMatch(/already exists or is repeated/);
  });

  it("reports invalid rows separately and converts missing optional fields to safe defaults", () => {
    const csv = header + "\nGood,GOOD-1,pcs,10.25\nBad,BAD-1,pcs,-10\n";
    const preview = previewProductCsv(csv);
    expect(preview.products).toHaveLength(1);
    expect(preview.products[0]).toMatchObject({
      purchasePriceMinor: 0,
      taxRateBps: 0,
      stockQuantityMilli: 0,
      reorderLevelMilli: 0,
      trackStock: true,
      active: true
    });
    expect(preview.issues).toHaveLength(1);
    expect(preview.issues[0].row).toBe(3);
  });

  it("rejects missing, duplicate and unsupported headers", () => {
    expect(() => previewProductCsv("name,sku\nItem,I-1")).toThrow(/missing the required column/);
    expect(() => previewProductCsv("name,sku,sku,sale_price\nItem,I-1,I-1,10")).toThrow(/duplicate column/);
    expect(() => previewProductCsv("name,sku,sale_price,unknown\nItem,I-1,10,x")).toThrow(/unsupported column/);
  });

  it("rejects malformed quoting, invalid booleans, excess precision and tax above 100%", () => {
    expect(() => previewProductCsv(header + '\n"Unclosed,SKU,pcs,10')).toThrow(/unclosed quoted field/);
    const preview = previewProductCsv(header + "\nBad bool,B-1,pcs,10,,,,,maybe,true\n" +
      "Bad tax,T-1,pcs,10,,,,,true,true\n");
    expect(preview.products).toHaveLength(0);
    expect(preview.issues[0].message).toMatch(/Track stock/);
    expect(preview.issues[1].message).toMatch(/Tax rate/);
  });

  it("enforces file and row limits", () => {
    expect(() => previewProductCsv("x".repeat(5 * 1024 * 1024 + 1))).toThrow(/5 MB/);
    const rows = Array.from({ length: PRODUCT_CSV_MAX_ROWS + 1 }, (_, index) =>
      "Item " + index + ",SKU-" + index + ",pcs,1"
    );
    expect(() => previewProductCsv("name,sku,unit,sale_price\n" + rows.join("\n"))).toThrow(/row import limit/);
  });

  it("exports an importable CSV and neutralizes spreadsheet formulas", () => {
    const product: Product = {
      id: 1,
      name: "=HYPERLINK(\"https://unsafe.example\")",
      sku: "ITEM-01",
      unit: "pcs",
      salePriceMinor: 12550,
      purchasePriceMinor: 8000,
      taxRateBps: 500,
      stockQuantityMilli: 4250,
      reorderLevelMilli: 1000,
      trackStock: true,
      active: false,
      createdAt: 1,
      updatedAt: 1
    };
    const csv = exportProductsCsv([product]);
    expect(csv).toContain("'=HYPERLINK");
    const roundTrip = previewProductCsv(csv);
    expect(roundTrip.issues).toHaveLength(0);
    expect(roundTrip.products[0]).toMatchObject({
      sku: "ITEM-01",
      salePriceMinor: 12550,
      stockQuantityMilli: 4250,
      active: false
    });
  });
});
