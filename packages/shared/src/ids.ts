// Public reference codes: what a client keeps to check on a concern. Random, never
// sequential, so one code reveals nothing about any other. 12 Crockford base32
// characters = 60 bits, shown as XXXX-XXXX-XXXX.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // no I, L, O or U
const LENGTH = 12;

export type RandomBytes = (length: number) => Uint8Array;

const cryptoRandomBytes: RandomBytes = (length) => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

export function generatePublicRef(randomBytes: RandomBytes = cryptoRandomBytes): string {
  const bytes = randomBytes(LENGTH);
  let raw = "";
  // 256 is a multiple of 32, so the low five bits of each byte are uniform.
  for (let i = 0; i < LENGTH; i++) raw += ALPHABET[(bytes[i] ?? 0) & 31];
  return format(raw);
}

/** Reads what a person might type: any case, spaces or no hyphens, O for 0, I or L for 1. */
export function normalizePublicRef(input: string): string | null {
  const raw = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (raw.length !== LENGTH) return null;
  for (const ch of raw) if (!ALPHABET.includes(ch)) return null;
  return format(raw);
}

function format(raw: string): string {
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

/** Service-point codes printed in QR URLs: short, opaque, unambiguous. */
export function generateServicePointCode(randomBytes: RandomBytes = cryptoRandomBytes): string {
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) code += ALPHABET[(bytes[i] ?? 0) & 31];
  return code;
}

export function isServicePointCode(value: string): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{6}$/.test(value);
}
