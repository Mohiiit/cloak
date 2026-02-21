import {
  convertAmount,
  type AmountUnit,
} from "@cloak-wallet/sdk";
import type { TokenKey } from "../tokens";

const TOKEN_SUFFIX_RE = /\s*(STRK|ETH|USDC)\s*$/i;

export const SHIELDED_TYPES = ["fund", "send", "transfer", "withdraw", "rollover"] as const;
export const WARD_ADMIN_TYPES = ["deploy_ward", "fund_ward", "configure_ward"] as const;
export const GUARDIAN_WARD_TYPES = [...SHIELDED_TYPES, "erc20_transfer"] as const;

function isAmountUnit(unit: unknown): unit is AmountUnit {
  return unit === "tongo_units" || unit === "erc20_wei" || unit === "erc20_display";
}

export function stripTokenSuffix(raw: string): string {
  return raw.replace(TOKEN_SUFFIX_RE, "").trim();
}

function sanitizeByUnit(raw: string, unit: AmountUnit): string {
  const stripped = stripTokenSuffix(raw || "").replace(/,/g, "").trim();
  if (!stripped) return "0";
  if (unit === "erc20_display") {
    return /^\d+(\.\d+)?$/.test(stripped) ? stripped : "0";
  }
  const digits = stripped.replace(/[^\d]/g, "");
  return digits || "0";
}

export function resolveAmountUnit(
  amount: string | null | undefined,
  amountUnit: AmountUnit | string | null | undefined,
  type?: string,
): AmountUnit | null {
  if (isAmountUnit(amountUnit)) return amountUnit;
  if (!amount) return null;
  const stripped = stripTokenSuffix(amount);
  if (type === "erc20_transfer") return "erc20_display";
  if (stripped.includes(".") || TOKEN_SUFFIX_RE.test(amount)) return "erc20_display";
  return "tongo_units";
}

export function toTongoUnitsFromAny(
  amount: string | null | undefined,
  amountUnit: AmountUnit | string | null | undefined,
  token: TokenKey,
  type?: string,
): string {
  if (!amount) return "0";
  const unit = resolveAmountUnit(amount, amountUnit, type);
  if (!unit) return "0";
  const value = sanitizeByUnit(amount, unit);
  try {
    return convertAmount({ value, unit, token }, "tongo_units");
  } catch {
    return "0";
  }
}

export function toDisplayAmountFromAny(
  amount: string | null | undefined,
  amountUnit: AmountUnit | string | null | undefined,
  token: TokenKey,
  type?: string,
): string {
  if (!amount) return "0";
  const unit = resolveAmountUnit(amount, amountUnit, type);
  if (!unit) return "0";
  const value = sanitizeByUnit(amount, unit);
  try {
    return convertAmount({ value, unit, token }, "erc20_display");
  } catch {
    return "0";
  }
}

export function hasAmountFromAny(
  amount: string | null | undefined,
  amountUnit: AmountUnit | string | null | undefined,
  token: TokenKey,
  type?: string,
): boolean {
  if (!amount) return false;
  return toDisplayAmountFromAny(amount, amountUnit, token, type) !== "0";
}
