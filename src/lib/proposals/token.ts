import { randomBytes } from "node:crypto";

/**
 * Bytes of randomness for a public proposal token. 24 bytes = 192 bits,
 * comfortably over the 128-bit minimum, base64url-encoded (no padding)
 * to exactly 32 URL-safe characters.
 */
const TOKEN_BYTES = 24;

/** Exact length generatePublicToken() always produces. */
export const PUBLIC_TOKEN_LENGTH = 32;

const PUBLIC_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

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

/**
 * Validates that a value has exactly the shape generatePublicToken()
 * produces — a string of exactly 32 base64url characters — before it is
 * ever used in a database query.
 *
 * This is a shape check only, not an existence check: it rejects
 * obviously-malformed input (wrong type, wrong length, disallowed
 * characters) cheaply and before any network round-trip, but a
 * well-formed, syntactically valid token that simply doesn't match any
 * row is indistinguishable from a malformed one to a caller of this
 * function — both cases must be treated identically by the code that
 * calls it (src/lib/proposals/public-data.ts and public-actions.ts),
 * so that malformed-vs-nonexistent tokens can never be told apart from
 * the outside. TypeScript's `Decision`-style union types provide no
 * runtime guarantee for values arriving through a public Server Action
 * call, which is exactly why this is a real runtime check rather than a
 * type annotation.
 */
export function isValidPublicToken(value: unknown): value is string {
  return typeof value === "string" && PUBLIC_TOKEN_PATTERN.test(value);
}
