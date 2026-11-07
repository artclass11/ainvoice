const PBKDF2_ITERATIONS = 310_000;
const HASH_LENGTH = 256;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function derivePinHash(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure browser cryptography is unavailable. Open AInvoice on HTTPS or localhost.");
  }

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const saltBuffer = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltBuffer).set(salt);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBuffer, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    HASH_LENGTH
  );
  return new Uint8Array(bits);
}

export async function createPinCredential(pin: string): Promise<{ salt: string; hash: string }> {
  if (!/^\d{4,6}$/.test(pin)) throw new Error("Choose a PIN with 4 to 6 digits.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePinHash(pin, salt);
  return { salt: toBase64(salt), hash: toBase64(hash) };
}

export async function verifyPin(pin: string, saltBase64: string, hashBase64: string): Promise<boolean> {
  if (!/^\d{4,6}$/.test(pin)) return false;
  const actual = await derivePinHash(pin, fromBase64(saltBase64));
  const expected = fromBase64(hashBase64);
  if (actual.length !== expected.length) return false;

  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual[index] ^ expected[index];
  }
  return difference === 0;
}
