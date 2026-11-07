import { db } from "./db";

const BACKUP_FORMAT = "AINVOICE-ENCRYPTED-BACKUP";
const BACKUP_VERSION = 1;
const ITERATIONS = 600_000;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  if (password.length < 12) throw new Error("Use a backup password with at least 12 characters.");
  if (!globalThis.crypto?.subtle) throw new Error("Secure cryptography requires HTTPS or a native app.");
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: toArrayBuffer(salt), iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function createEncryptedBackup(password: string): Promise<Blob> {
  const data = await db.transaction(
    "r",
    [db.settings, db.invoices, db.products, db.customers, db.payments, db.stockMovements, db.auditEvents],
    async () => ({
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      tables: {
        settings: await db.settings.toArray(),
        invoices: await db.invoices.toArray(),
        products: await db.products.toArray(),
        customers: await db.customers.toArray(),
        payments: await db.payments.toArray(),
        stockMovements: await db.stockMovements.toArray(),
        auditEvents: await db.auditEvents.toArray()
      }
    })
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    plaintext
  );
  const envelope = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    kdf: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    cipher: "AES-256-GCM",
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted))
  };
  return new Blob([JSON.stringify(envelope, null, 2)], { type: "application/vnd.ainvoice.backup+json" });
}

export async function restoreEncryptedBackup(file: File, password: string): Promise<void> {
  if (file.size > 250 * 1024 * 1024) throw new Error("Backup file is larger than the 250 MB restore limit.");
  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(await file.text()) as Record<string, unknown>;
  } catch {
    throw new Error("Backup file is not valid JSON.");
  }
  if (
    envelope.format !== BACKUP_FORMAT ||
    envelope.version !== BACKUP_VERSION ||
    envelope.kdf !== "PBKDF2-SHA256" ||
    envelope.iterations !== ITERATIONS ||
    envelope.cipher !== "AES-256-GCM" ||
    typeof envelope.salt !== "string" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.ciphertext !== "string"
  ) throw new Error("This is not a supported AInvoice encrypted backup.");

  let clear: ArrayBuffer;
  try {
    const salt = fromBase64(envelope.salt);
    const iv = fromBase64(envelope.iv);
    const ciphertext = fromBase64(envelope.ciphertext);
    const key = await deriveKey(password, salt);
    clear = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(ciphertext)
    );
  } catch {
    throw new Error("Backup could not be decrypted. Check the password and file.");
  }

  let parsed: {
    format?: string;
    schemaVersion?: number;
    tables?: Record<string, unknown>;
  };
  try {
    parsed = JSON.parse(new TextDecoder().decode(clear)) as typeof parsed;
  } catch {
    throw new Error("Decrypted backup contents are not valid JSON.");
  }
  if (parsed.format !== BACKUP_FORMAT || parsed.schemaVersion !== BACKUP_VERSION || !parsed.tables) {
    throw new Error("Backup contents are invalid or incomplete.");
  }
  const tableNames = ["settings", "invoices", "products", "customers", "payments", "stockMovements", "auditEvents"] as const;
  for (const name of tableNames) {
    if (!Array.isArray(parsed.tables[name])) throw new Error("Backup is missing the " + name + " table.");
  }
  const settings = parsed.tables.settings as Array<Record<string, unknown>>;
  if (!settings.some((entry) => entry.id === "main" && typeof entry.businessName === "string")) {
    throw new Error("Backup does not contain a valid business profile.");
  }

  await db.transaction(
    "rw",
    [db.settings, db.invoices, db.products, db.customers, db.payments, db.stockMovements, db.auditEvents],
    async () => {
      for (const name of tableNames) {
        await db.table(name).clear();
        const records = parsed.tables![name] as object[];
        if (records.length > 0) await db.table(name).bulkPut(records);
      }
    }
  );
}
