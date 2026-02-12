import { InvalidKeyError } from "./errors";

/** Stark curve order for key validation */
export const CURVE_ORDER =
  3618502788666131213697322783095070105526743751716087489154079457884512865583n;

/**
 * Generate a random 32-byte private key as a hex string (0x-prefixed).
 * Valid for both Starknet signing and Tongo operations.
 */
export function generateKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  let n = BigInt("0x" + hex);
  if (n >= CURVE_ORDER) {
    n = (n % (CURVE_ORDER - 1n)) + 1n;
  }
  if (n < 1n) n = 1n;
  return "0x" + n.toString(16);
}

/**
 * Validate that a key is a valid Stark curve scalar.
 */
export function isValidKey(key: string): boolean {
  try {
    const n = BigInt(key);
    return n >= 1n && n < CURVE_ORDER;
  } catch {
    return false;
  }
}

/**
 * Assert that a key is valid, throwing InvalidKeyError if not.
 */
export function assertValidKey(key: string): void {
  if (!isValidKey(key)) {
    throw new InvalidKeyError();
  }
}
