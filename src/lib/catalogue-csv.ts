import type { Product } from "./db";

export const PRODUCT_CSV_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_CSV_MAX_ROWS = 5000;
export const PRODUCT_CSV_HEADERS = [
  "name",
  "sku",
  "unit",
  "sale_price",
  "purchase_price",
  "tax_rate",
  "stock_quantity",
  "reorder_level",
  "track_stock",
  "active"
] as const;

export type ProductImportRecord = Omit<Product, "id" | "createdAt" | "updatedAt">;
export interface ProductCsvIssue {
  row: number;
  message: string;
  sku?: string;
}
export interface ProductCsvPreview {
  products: ProductImportRecord[];
  issues: ProductCsvIssue[];
  rowsRead: number;
}

type CsvRecord = { row: number; fields: string[] };

function parseCsvRecords(input: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let afterQuote = false;
  let row = 1;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (inQuotes) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (afterQuote) {
      if (character === ",") {
        fields.push(field);
        field = "";
        afterQuote = false;
      } else if (character === "\n" || character === "\r") {
        fields.push(field);
        records.push({ row, fields });
        fields = [];
        field = "";
        afterQuote = false;
        row += 1;
        if (character === "\r" && input[index + 1] === "\n") index += 1;
      } else if (character.trim() !== "") {
        throw new Error("CSV contains characters after a closing quote near row " + row + ".");
      }
      continue;
    }

    if (character === '"') {
      if (field.length !== 0) {
        throw new Error("CSV has a quote in an unquoted field near row " + row + ".");
      }
      inQuotes = true;
    } else if (character === ",") {
      fields.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      fields.push(field);
      records.push({ row, fields });
      fields = [];
      field = "";
      row += 1;
      if (character === "\r" && input[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }

  if (inQuotes) throw new Error("CSV has an unclosed quoted field.");
  if (field.length > 0 || fields.length > 0 || afterQuote) {
    fields.push(field);
    records.push({ row, fields });
  }
  return records;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function decimalToMinor(value: string, label: string): number {
  const normalized = value.trim();
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(label + " must be a non-negative amount with up to 2 decimal places.");
  }
  const [whole, fraction = ""] = normalized.split(".");
  const result = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  if (!Number.isSafeInteger(result)) throw new Error(label + " is outside the supported range.");
  return result;
}

function decimalToMilli(value: string, label: string): number {
  const normalized = value.trim();
  if (!/^\d{1,7}(?:\.\d{1,3})?$/.test(normalized)) {
    throw new Error(label + " must be between 0 and 10,000,000 with up to 3 decimal places.");
  }
  const [whole, fraction = ""] = normalized.split(".");
  const result = Number(whole) * 1000 + Number((fraction + "000").slice(0, 3));
  if (!Number.isSafeInteger(result) || result > 10_000_000_000) {
    throw new Error(label + " is outside the supported range.");
  }
  return result;
}

function percentToBasisPoints(value: string): number {
  const normalized = value.trim();
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Tax rate must be from 0 to 100 with up to 2 decimal places.");
  }
  const [whole, fraction = ""] = normalized.split(".");
  const result = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  if (result > 10_000) throw new Error("Tax rate cannot exceed 100%.");
  return result;
}

function parseBoolean(value: string, label: string, defaultValue: boolean): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (["true", "yes", "y", "1"].includes(normalized)) return true;
  if (["false", "no", "n", "0"].includes(normalized)) return false;
  throw new Error(label + " must be yes/no, true/false or 1/0.");
}

function cell(record: string[], columns: Map<string, number>, name: string): string {
  const index = columns.get(name);
  return index === undefined ? "" : (record[index] ?? "").trim();
}

export function previewProductCsv(
  source: string,
  existingProducts: readonly Pick<Product, "sku">[] = []
): ProductCsvPreview {
  if (typeof source !== "string" || source.trim().length === 0) {
    throw new Error("Choose a non-empty CSV file.");
  }
  if (new TextEncoder().encode(source).byteLength > PRODUCT_CSV_MAX_BYTES) {
    throw new Error("CSV is larger than the 5 MB import limit.");
  }

  const records = parseCsvRecords(source.replace(/^\uFEFF/, ""));
  const nonBlank = records.filter(record => record.fields.some(value => value.trim() !== ""));
  if (nonBlank.length === 0) throw new Error("CSV does not contain a header row.");

  const headerRecord = nonBlank[0];
  const headers = headerRecord.fields.map(normalizeHeader);
  const allowed = new Set<string>(PRODUCT_CSV_HEADERS);
  const columns = new Map<string, number>();
  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index];
    if (!header) throw new Error("CSV contains an empty column name.");
    if (!allowed.has(header)) throw new Error("CSV contains an unsupported column: " + header + ".");
    if (columns.has(header)) throw new Error("CSV contains a duplicate column: " + header + ".");
    columns.set(header, index);
  }
  for (const required of ["name", "sku", "sale_price"]) {
    if (!columns.has(required)) throw new Error("CSV is missing the required column: " + required + ".");
  }

  const dataRecords = nonBlank.slice(1);
  if (dataRecords.length > PRODUCT_CSV_MAX_ROWS) {
    throw new Error("CSV exceeds the " + PRODUCT_CSV_MAX_ROWS + " row import limit.");
  }

  const seenSkus = new Set(existingProducts.map(product => product.sku.trim().toUpperCase()));
  const products: ProductImportRecord[] = [];
  const issues: ProductCsvIssue[] = [];

  for (const record of dataRecords) {
    try {
      if (record.fields.length > headers.length) {
        throw new Error("Expected no more than " + headers.length + " columns but found " + record.fields.length + ".");
      }
      // Spreadsheet exports often omit empty cells at the end of a row.
      // Pad only missing trailing cells; required-column checks still apply.
      const rowFields = [...record.fields, ...Array(headers.length - record.fields.length).fill("")];
      const name = cell(rowFields, columns, "name");
      const sku = cell(rowFields, columns, "sku").toUpperCase();
      const unit = cell(rowFields, columns, "unit") || "pcs";
      if (!name || name.length > 160) throw new Error("Item name is required and must be 160 characters or fewer.");
      if (!sku || sku.length > 64) throw new Error("SKU is required and must be 64 characters or fewer.");
      if (unit.length > 24) throw new Error("Unit must be 24 characters or fewer.");
      if (seenSkus.has(sku)) throw new Error("SKU " + sku + " already exists or is repeated in this file.");

      const salePriceMinor = decimalToMinor(cell(rowFields, columns, "sale_price"), "Sale price");
      const purchaseText = cell(rowFields, columns, "purchase_price");
      const purchasePriceMinor = purchaseText ? decimalToMinor(purchaseText, "Purchase price") : 0;
      const taxText = cell(rowFields, columns, "tax_rate");
      const taxRateBps = taxText ? percentToBasisPoints(taxText) : 0;
      const stockText = cell(rowFields, columns, "stock_quantity");
      const reorderText = cell(rowFields, columns, "reorder_level");
      const stockQuantityMilli = stockText ? decimalToMilli(stockText, "Stock quantity") : 0;
      const reorderLevelMilli = reorderText ? decimalToMilli(reorderText, "Reorder level") : 0;
      const trackStock = parseBoolean(cell(rowFields, columns, "track_stock"), "Track stock", true);
      const active = parseBoolean(cell(rowFields, columns, "active"), "Active", true);

      products.push({
        name,
        sku,
        unit,
        salePriceMinor,
        purchasePriceMinor,
        taxRateBps,
        stockQuantityMilli,
        reorderLevelMilli,
        trackStock,
        active
      });
      seenSkus.add(sku);
    } catch (error) {
      issues.push({
        row: record.row,
        message: error instanceof Error ? error.message : "Invalid product row."
      });
    }
  }

  return { products, issues, rowsRead: dataRecords.length };
}

function safeSpreadsheetCell(value: string): string {
  return /^[\s]*[=+@-]/.test(value) ? "'" + value : value;
}

function csvCell(value: string | number | boolean): string {
  const stringValue = safeSpreadsheetCell(String(value));
  return '"' + stringValue.replace(/"/g, '""') + '"';
}

function amountFromMinor(value: number): string {
  return (value / 100).toFixed(2);
}

function quantityFromMilli(value: number): string {
  return (value / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "") || "0";
}

function csvDocument(rows: readonly (readonly (string | number | boolean)[])[]): string {
  return rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function exportProductsCsv(products: readonly Product[]): string {
  const rows: (string | number | boolean)[][] = [PRODUCT_CSV_HEADERS.slice()];
  for (const product of products) {
    rows.push([
      product.name,
      product.sku,
      product.unit,
      amountFromMinor(product.salePriceMinor),
      amountFromMinor(product.purchasePriceMinor),
      (product.taxRateBps / 100).toFixed(2).replace(/0+$/, "").replace(/\.$/, ""),
      quantityFromMilli(product.stockQuantityMilli),
      quantityFromMilli(product.reorderLevelMilli),
      product.trackStock,
      product.active
    ]);
  }
  return csvDocument(rows);
}

export function createProductCsvTemplate(): string {
  // Header names are simple identifiers, so leave them unquoted for easier
  // inspection and editing in spreadsheet applications.
  return PRODUCT_CSV_HEADERS.join(",") + "\\r\\n";
}
