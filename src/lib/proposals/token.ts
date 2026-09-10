import { randomBytes } from "node:crypto";

/**
 * Bytes of randomness for a public proposal token. 24 bytes = 192 bits,
 * comfortably over the 128-bit minimum, base64url-encoded (no padding)
 * to ~32 URL-safe characters.
 */
const TOKEN_BYTES = 24;

/**
 * Generates a cryptographically strong, URL-safe public token for a
 * proposal's public link (/p/[token]). Always called server-side
 * (src/lib/proposals/actions.ts, in a "use server" module) — this is
 * the only place a proposal's public identity is minted; it is never
 * derived from the proposal's row id, business name, customer name, or
 * any other guessable/sequential value.
 */
export function generatePublicToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}
