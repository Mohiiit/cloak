/**
 * Token conversion mid-layer.
 *
 * Provides a unified API to convert between three unit formats:
 *   - tongo_units  : Integer Tongo units (e.g. "1" = 1 shielded unit)
 *   - erc20_wei    : Raw ERC-20 token amount in smallest unit (e.g. "50000000000000000" for 0.05 STRK)
 *   - erc20_display: Human-readable display string (e.g. "0.05")
 *
 * All display code should call `toDisplayString()` instead of doing ad-hoc math.
 */

import { TOKENS, formatTokenAmount, parseTokenAmount } from "./tokens";
import type { TokenKey } from "./types";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AmountUnit = "tongo_units" | "erc20_wei" | "erc20_display";

export interface TokenAmount {
  /** Raw stored value (integer string for tongo_units/erc20_wei, decimal string for erc20_display) */
  value: string;
  /** What unit the value is in */
  unit: AmountUnit;
  /** Which token (STRK, ETH, USDC) */
  token: TokenKey;
}

// ─── Core conversion ────────────────────────────────────────────────────────

/**
 * Convert a TokenAmount to any target unit.
 * Returns the value as a string in the target unit.
 */
export function convertAmount(amount: TokenAmount, targetUnit: AmountUnit): string {
  if (amount.unit === targetUnit) return amount.value;

  const cfg = TOKENS[amount.token];

  // First normalize to erc20_wei (our intermediate representation)
  let weiValue: bigint;

  switch (amount.unit) {
    case "tongo_units": {
      const units = BigInt(amount.value || "0");
      weiValue = units * cfg.rate;
      break;
    }
    case "erc20_wei": {
      weiValue = BigInt(amount.value || "0");
      break;
    }
    case "erc20_display": {
      weiValue = parseTokenAmount(amount.value || "0", cfg.decimals);
      break;
    }
  }

  // Then convert from erc20_wei to target
  switch (targetUnit) {
    case "tongo_units": {
      if (cfg.rate === 0n) return "0";
      return (weiValue / cfg.rate).toString();
    }
    case "erc20_wei": {
      return weiValue.toString();
    }
    case "erc20_display": {
      return formatTokenAmount(weiValue, cfg.decimals);
    }
  }
}

// ─── Convenience helpers ────────────────────────────────────────────────────

/** Get human-readable display string like "0.05 STRK" */
export function toDisplayString(amount: TokenAmount): string {
  const display = convertAmount(amount, "erc20_display");
  return `${display} ${amount.token}`;
}

/** Get Tongo units as bigint */
export function toTongoUnits(amount: TokenAmount): bigint {
  return BigInt(convertAmount(amount, "tongo_units"));
}

/** Get ERC20 wei as bigint */
export function toErc20Wei(amount: TokenAmount): bigint {
  return BigInt(convertAmount(amount, "erc20_wei"));
}
