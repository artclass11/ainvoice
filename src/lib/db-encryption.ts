import type Dexie from "dexie";
import nacl from "./vendor/nacl-fast.js";

export const RECOVERY_KEY_HEX_LENGTH = 64;
const encoder = new TextEncoder();
const KEY_CHECK_TEXT = "AInvoice live database key check v1";

export type EncryptedEnvelope = {
  version: 1;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
};

function randomBytes(length: number): Uint8Array {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Secure random number generation is unavailable. Use HTTPS or a supported app build.");
  }
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

export function createRecoveryKey(): string {
  return bytesToHex(randomBytes(nacl.secretbox.keyLength));
}

export function parseRecoveryKey(value: string): Uint8Array {
  const normalized = value.trim().replace(/\s+/g, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("Enter the complete 64-character hexadecimal recovery key.");
  }
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(value: Uint8Array): string {
  return Array.from(value, byte => byte.toString(16).padStart(2, "0")).join("");
}

function requireKey(key: Uint8Array): void {
  if (!(key instanceof Uint8Array) || key.length !== nacl.secretbox.keyLength) {
    throw new Error("AInvoice database recovery key is unavailable.");
  }
}

export function createKeyCheck(key: Uint8Array): EncryptedEnvelope {
  requireKey(key);
  const nonce = randomBytes(nacl.secretbox.nonceLength);
  return { version: 1, nonce, ciphertext: nacl.secretbox(encoder.encode(KEY_CHECK_TEXT), nonce, key) };
}

export function verifyKeyCheck(envelope: EncryptedEnvelope, key: Uint8Array): void {
  requireKey(key);
  if (!envelope || envelope.version !== 1 ||
      !(envelope.nonce instanceof Uint8Array) || envelope.nonce.length !== nacl.secretbox.nonceLength ||
      !(envelope.ciphertext instanceof Uint8Array)) {
    throw new Error("The encrypted database key verifier is malformed.");
  }
  const plaintext = nacl.secretbox.open(envelope.ciphertext, envelope.nonce, key);
  if (!plaintext || new TextDecoder().decode(plaintext) !== KEY_CHECK_TEXT) {
    throw new Error("The recovery key is incorrect or the encrypted database verifier has been altered.");
  }
  plaintext.fill(0);
}

type EncryptedPayload = {
  version: 1;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
};

function encryptRecord(
  tableName: string,
  schema: any,
  value: Record<string, unknown>,
  key: Uint8Array
): Record<string, unknown> {
  requireKey(key);
  if (Object.prototype.hasOwnProperty.call(value, "__encryptedData")) {
    throw new Error("A reserved encryption field was supplied by application data.");
  }
  const primaryKey = schema.primaryKey?.keyPath ?? schema.primKey?.keyPath;
  if (typeof primaryKey !== "string") throw new Error("Encrypted table has an unsupported primary key schema.");
  const indexedFields = new Set<string>([primaryKey]);
  for (const index of schema.indexes ?? []) {
    if (typeof index.keyPath === "string") indexedFields.add(index.keyPath);
    else throw new Error("Encrypted table cannot use compound indexes.");
  }

  const visible: Record<string, unknown> = {};
  const secret: Record<string, unknown> = {};
  for (const [field, fieldValue] of Object.entries(value)) {
    if (indexedFields.has(field)) visible[field] = fieldValue;
    else secret[field] = fieldValue;
  }

  const payload = encoder.encode(JSON.stringify({ version: 1, table: tableName, fields: secret }));
  const nonce = randomBytes(nacl.secretbox.nonceLength);
  const ciphertext = nacl.secretbox(payload, nonce, key);
  payload.fill(0);
  visible.__encryptedData = { version: 1, nonce, ciphertext } satisfies EncryptedPayload;
  return visible;
}

function decryptRecord(
  tableName: string,
  value: Record<string, unknown> | undefined,
  key: Uint8Array
): Record<string, unknown> | undefined {
  if (!value) return value;
  requireKey(key);
  const envelope = value.__encryptedData as EncryptedPayload | undefined;
  if (!envelope) throw new Error("Unencrypted business record found in the encrypted database; refusing plaintext fallback.");
  if (envelope.version !== 1 || !(envelope.nonce instanceof Uint8Array) ||
      envelope.nonce.length !== nacl.secretbox.nonceLength ||
      !(envelope.ciphertext instanceof Uint8Array)) {
    throw new Error("Encrypted business record has a malformed envelope.");
  }
  const plaintext = nacl.secretbox.open(envelope.ciphertext, envelope.nonce, key);
  if (!plaintext) throw new Error("Encrypted business record failed authentication.");
  try {
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as {
      version?: number;
      table?: string;
      fields?: Record<string, unknown>;
    };
    if (parsed.version !== 1 || parsed.table !== tableName ||
        !parsed.fields || typeof parsed.fields !== "object" || Array.isArray(parsed.fields)) {
      throw new Error("Encrypted business record has invalid authenticated content.");
    }
    const { __encryptedData: _discard, ...indexedFields } = value;
    return { ...indexedFields, ...parsed.fields };
  } finally {
    plaintext.fill(0);
  }
}

/**
 * Synchronous authenticated record encryption. IndexedDB transactions cannot
 * safely await WebCrypto operations mid-transaction, so this uses TweetNaCl's
 * XSalsa20-Poly1305 secretbox with a fresh 192-bit nonce per record write.
 * Only schema index values remain visible; callers must keep those indexes
 * free of customer, supplier, product, invoice-number and other identifying text.
 */
export function installRecordEncryption(
  database: Dexie,
  keyProvider: () => Uint8Array,
  encryptedTableNames: readonly string[]
): void {
  const encryptedTables = new Set(encryptedTableNames);
  database.use({
    name: "ainvoice-record-encryption",
    stack: "dbcore",
    level: 0,
    create(downlevelDatabase: any) {
      return {
        ...downlevelDatabase,
        table(tableName: string) {
          const table = downlevelDatabase.table(tableName);
          if (!encryptedTables.has(tableName)) return table;
          const key = () => keyProvider();
          const decrypt = (value: Record<string, unknown> | undefined) =>
            decryptRecord(tableName, value, key());

          return {
            ...table,
            get(request: any) {
              return table.get(request).then(decrypt);
            },
            getMany(request: any) {
              return table.getMany(request).then((values: Array<Record<string, unknown> | undefined>) =>
                values.map(decrypt)
              );
            },
            query(request: any) {
              return table.query(request).then((result: any) => {
                // Key-only requests (for counts and key operations) are not
                // record values and must never be passed to the decryptor.
                if (request.values === false) return result;
                return { ...result, result: result.result.map(decrypt) };
              });
            },
            openCursor(request: any) {
              return table.openCursor(request).then((cursor: any) => {
                if (!cursor || request.values === false) return cursor;
                return Object.create(cursor, {
                  continue: { get: () => cursor.continue },
                  continuePrimaryKey: { get: () => cursor.continuePrimaryKey },
                  key: { get: () => cursor.key },
                  primaryKey: { get: () => cursor.primaryKey },
                  value: { get: () => decrypt(cursor.value) }
                });
              });
            },
            mutate(request: any) {
              if (request.type !== "add" && request.type !== "put") return table.mutate(request);
              const values = request.values.map((value: Record<string, unknown>) =>
                encryptRecord(tableName, table.schema, value, key())
              );
              return table.mutate({ ...request, values });
            }
          };
        }
      };
    }
  });
}
