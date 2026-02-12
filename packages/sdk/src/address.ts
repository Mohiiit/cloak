/**
 * Pad a Starknet address to the full 66-char format (0x + 64 hex digits).
 * Required for Tongo SDK ZK proofs.
 */
export function padAddress(address: string): string {
  if (!address) return address;
  const stripped = address.startsWith("0x") ? address.slice(2) : address;
  return "0x" + stripped.padStart(64, "0");
}

/**
 * Truncate an address for display: 0x1234...abcd
 */
export function truncateAddress(address: string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Truncate a Tongo base58 address for display.
 */
export function truncateTongoAddress(address: string, chars = 6): string {
  if (!address) return "";
  if (address.length <= chars * 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
