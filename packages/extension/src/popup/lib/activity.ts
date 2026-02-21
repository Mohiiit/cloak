import { convertAmount, type AmountUnit, type TokenKey } from "@cloak-wallet/sdk";
import type { TxEvent } from "../hooks/useTxHistory";

const TOKEN_SUFFIX_RE = /\s*(STRK|ETH|USDC)\s*$/i;

export const SHIELDED_TYPES = ["fund", "send", "transfer", "withdraw", "rollover"] as const;
export const GUARDIAN_WARD_TYPES = [...SHIELDED_TYPES, "erc20_transfer"] as const;

function isAmountUnit(unit: unknown): unit is AmountUnit {
  return unit === "tongo_units" || unit === "erc20_wei" || unit === "erc20_display";
}

function stripTokenSuffix(raw: string): string {
  return raw.replace(TOKEN_SUFFIX_RE, "").trim();
}

function sanitizeValue(raw: string, unit: AmountUnit): string {
  const stripped = stripTokenSuffix(raw || "").replace(/,/g, "").trim();
  if (!stripped) return "0";
  if (unit === "erc20_display") {
    return /^\d+(\.\d+)?$/.test(stripped) ? stripped : "0";
  }
  const digits = stripped.replace(/[^\d]/g, "");
  return digits || "0";
}

function resolveAmountUnit(tx: TxEvent): AmountUnit | null {
  if (isAmountUnit(tx.amount_unit)) return tx.amount_unit;
  if (!tx.amount) return null;
  const stripped = stripTokenSuffix(tx.amount);
  if (tx.type === "erc20_transfer") return "erc20_display";
  if (stripped.includes(".") || TOKEN_SUFFIX_RE.test(tx.amount)) return "erc20_display";
  return "tongo_units";
}

export function toDisplayAmount(tx: TxEvent, token: TokenKey): string {
  if (!tx.amount) return "0";
  const unit = resolveAmountUnit(tx);
  if (!unit) return "0";
  try {
    return convertAmount(
      { value: sanitizeValue(tx.amount, unit), unit, token },
      "erc20_display",
    );
  } catch {
    return "0";
  }
}

export function toUnitAmount(tx: TxEvent, token: TokenKey): string {
  if (!tx.amount) return "0";
  const unit = resolveAmountUnit(tx);
  if (!unit) return "0";
  try {
    return convertAmount(
      { value: sanitizeValue(tx.amount, unit), unit, token },
      "tongo_units",
    );
  } catch {
    return "0";
  }
}

export function statusLabel(tx: TxEvent): string | null {
  if (tx.statusDetail === "pending_ward_sig") return "Awaiting ward";
  if (tx.statusDetail === "pending_guardian") return "Awaiting guardian";
  if (tx.status === "rejected") return "Rejected";
  if (tx.status === "gas_error") return "Gas retry";
  if (tx.status === "expired") return "Expired";
  if (tx.status === "failed") return "Failed";
  if (tx.status === "pending") return "Pending";
  if (tx.status === "confirmed") return "Confirmed";
  return null;
}
