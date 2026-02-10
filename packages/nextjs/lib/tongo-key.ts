import { CURVE_ORDER, STORAGE_KEYS } from "./constants";

/**
 * Get or create the Tongo private key from localStorage.
 * Tongo uses its own keypair separate from the Starknet wallet.
 */
export function getOrCreateTongoKey(): string {
  if (typeof window === "undefined") return "";

  const stored = localStorage.getItem(STORAGE_KEYS.TONGO_PK);
  if (stored && isValidTongoKey(stored)) {
    return stored;
  }

  const newKey = generateRandomKey();
  localStorage.setItem(STORAGE_KEYS.TONGO_PK, newKey);
  return newKey;
}

/**
 * Validate that a key is a valid Stark curve scalar.
 */
export function isValidTongoKey(key: string): boolean {
  try {
    const n = BigInt(key);
    return n >= 1n && n < CURVE_ORDER;
  } catch {
    return false;
  }
}

/**
 * Generate a random 32-byte key as a hex string (0x-prefixed).
 */
function generateRandomKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Ensure key is in valid range
  let n = BigInt("0x" + hex);
  if (n >= CURVE_ORDER) {
    n = n % (CURVE_ORDER - 1n) + 1n;
  }
  if (n < 1n) n = 1n;
  return "0x" + n.toString(16);
}

/**
 * Get the stored Tongo key without creating a new one.
 */
export function getStoredTongoKey(): string | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEYS.TONGO_PK);
  if (stored && isValidTongoKey(stored)) return stored;
  return null;
}

/**
 * Clear the stored Tongo key.
 */
export function clearTongoKey(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEYS.TONGO_PK);
}
