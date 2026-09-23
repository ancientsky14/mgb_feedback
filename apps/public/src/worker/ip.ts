// The client IP is used only as a rate-limit key, and only as an HMAC with a secret that
// changes meaning every day — the address itself is never stored.

let cachedKey: { secret: string; key: CryptoKey } | undefined;

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (cachedKey?.secret === secret) return cachedKey.key;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  cachedKey = { secret, key };
  return key;
}

/** HMAC-SHA256(secret, ip|day) as 32 hex characters. The same IP on another day is a different key. */
export async function ipKey(secret: string, ip: string, day: string): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(`${ip}|${day}`));
  return [...new Uint8Array(mac)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** On Workers, CF-Connecting-IP is set by Cloudflare's edge and cannot be supplied by the client. */
export function clientIp(headers: Headers): string | null {
  return headers.get("CF-Connecting-IP");
}
