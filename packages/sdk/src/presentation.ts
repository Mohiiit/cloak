import type { ActivityRecord } from "./activity";
import type { AmountUnit } from "./token-convert";
import { convertAmount } from "./token-convert";
import { TOKENS, formatTokenAmount } from "./tokens";
import type { TokenKey } from "./types";

const TOKEN_SUFFIX_RE = /\s*(STRK|ETH|USDC)\s*$/i;

export const SUPPORTED_TOKENS = ["STRK", "ETH", "USDC"] as const;

export interface TokenAmountView {
  token: TokenKey;
  originalValue: string;
  originalUnit: AmountUnit;
  tongoUnits: string;
  erc20Wei: string;
  erc20Display: string;
  erc20DisplayWithSymbol: string;
  isZero: boolean;
}

export interface ShieldedQuantizationView {
  token: TokenKey;
  requested: TokenAmountView;
  quantized: TokenAmountView;
  remainderWei: string;
  remainderDisplay: string;
  remainderDisplayWithSymbol: string;
  minimumShieldedUnitDisplay: string;
  canRepresentInShieldedUnits: boolean;
  hasRemainder: boolean;
}

export interface TokenBalanceInput {
  token: TokenKey;
  publicErc20Wei: string;
  shieldedAvailableTongoUnits: string;
  shieldedPendingTongoUnits?: string;
}

export interface TokenBalanceView {
  token: TokenKey;
  unitValueDisplay: string;
  public: TokenAmountView;
  shieldedAvailable: TokenAmountView;
  shieldedPending: TokenAmountView;
  shieldedTotal: TokenAmountView;
}

export interface PortfolioBalanceView {
  tokens: TokenBalanceView[];
  byToken: Record<TokenKey, TokenBalanceView>;
}

export interface ActivitySwapView {
  provider: string;
  sellToken: TokenKey;
  buyToken: TokenKey;
  sellAmount: TokenAmountView;
  estimatedBuyAmount: TokenAmountView;
  minBuyAmount: TokenAmountView;
  actualBuyAmount: TokenAmountView | null;
}

export interface ActivityRecordView {
  id: string;
  source: ActivityRecord["source"];
  txHash: string;
  type: ActivityRecord["type"];
  status: ActivityRecord["status"];
  statusDetail?: string;
  token: TokenKey;
  amount: TokenAmountView | null;
  recipient: string | null;
  recipientName: string | null;
  note: string | null;
  accountType: ActivityRecord["account_type"];
  wardAddress: string | null;
  fee: string | null;
  network: string;
  platform: string | null;
  createdAt?: string;
  respondedAt?: string | null;
  errorMessage: string | null;
  swap: ActivitySwapView | null;
  raw: ActivityRecord;
}

function trailingZerosBase10(value: bigint): number {
  if (value === 0n) return 0;
  let n = value;
  let count = 0;
  while (n % 10n === 0n) {
    count += 1;
    n /= 10n;
  }
  return count;
}

function displayPrecisionForToken(token: TokenKey): number {
  const cfg = TOKENS[token];
  const required =
    cfg.decimals - Math.min(cfg.decimals, trailingZerosBase10(cfg.rate));
  return Math.max(4, Math.min(8, required));
}

function toDisplayFromWei(erc20Wei: string, token: TokenKey): string {
  return formatTokenAmount(
    BigInt(erc20Wei || "0"),
    TOKENS[token].decimals,
    displayPrecisionForToken(token),
  );
}

export function isTokenKey(value: unknown): value is TokenKey {
  return value === "STRK" || value === "ETH" || value === "USDC";
}

export function normalizeTokenKey(
  value: string | null | undefined,
  fallback: TokenKey = "STRK",
): TokenKey {
  const upper = (value || "").toUpperCase();
  return isTokenKey(upper) ? upper : fallback;
}

export function isAmountUnit(value: unknown): value is AmountUnit {
  return value === "tongo_units" || value === "erc20_wei" || value === "erc20_display";
}

export function stripTokenSuffix(raw: string): string {
  return raw.replace(TOKEN_SUFFIX_RE, "").trim();
}

export function sanitizeAmountValue(raw: string, unit: AmountUnit): string {
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

function toBigIntSafe(value: string | undefined): bigint {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function zeroAmountView(token: TokenKey, unit: AmountUnit): TokenAmountView {
  return {
    token,
    originalValue: "0",
    originalUnit: unit,
    tongoUnits: "0",
    erc20Wei: "0",
    erc20Display: "0",
    erc20DisplayWithSymbol: `0 ${token}`,
    isZero: true,
  };
}

export function toTokenAmountView(
  token: TokenKey,
  value: string,
  unit: AmountUnit,
): TokenAmountView {
  const sanitized = sanitizeAmountValue(value, unit);

  try {
    const erc20Wei = convertAmount({ value: sanitized, unit, token }, "erc20_wei");
    const tongoUnits = convertAmount({ value: sanitized, unit, token }, "tongo_units");
    const erc20Display = toDisplayFromWei(erc20Wei, token);

    return {
      token,
      originalValue: sanitized,
      originalUnit: unit,
      tongoUnits,
      erc20Wei,
      erc20Display,
      erc20DisplayWithSymbol: `${erc20Display} ${token}`,
      isZero: BigInt(erc20Wei) === 0n,
    };
  } catch {
    return zeroAmountView(token, unit);
  }
}

export function quantizeToShieldedUnits(
  token: TokenKey,
  value: string,
  unit: AmountUnit,
): ShieldedQuantizationView {
  const requested = toTokenAmountView(token, value, unit);
  const quantized = toTokenAmountView(token, requested.tongoUnits, "tongo_units");

  const requestedWei = toBigIntSafe(requested.erc20Wei);
  const quantizedWei = toBigIntSafe(quantized.erc20Wei);
  const remainderWei = requestedWei > quantizedWei ? requestedWei - quantizedWei : 0n;
  const remainderDisplay = toDisplayFromWei(remainderWei.toString(), token);
  const unitValueDisplay = toTokenAmountView(token, "1", "tongo_units").erc20DisplayWithSymbol;

  return {
    token,
    requested,
    quantized,
    remainderWei: remainderWei.toString(),
    remainderDisplay,
    remainderDisplayWithSymbol: `${remainderDisplay} ${token}`,
    minimumShieldedUnitDisplay: unitValueDisplay,
    canRepresentInShieldedUnits: BigInt(quantized.tongoUnits) > 0n,
    hasRemainder: remainderWei > 0n,
  };
}

export function buildTokenBalanceView(input: TokenBalanceInput): TokenBalanceView {
  const pendingUnits = input.shieldedPendingTongoUnits || "0";
  const totalUnits = (
    toBigIntSafe(input.shieldedAvailableTongoUnits)
    + toBigIntSafe(pendingUnits)
  ).toString();

  return {
    token: input.token,
    unitValueDisplay: toTokenAmountView(input.token, "1", "tongo_units").erc20DisplayWithSymbol,
    public: toTokenAmountView(input.token, input.publicErc20Wei, "erc20_wei"),
    shieldedAvailable: toTokenAmountView(
      input.token,
      input.shieldedAvailableTongoUnits,
      "tongo_units",
    ),
    shieldedPending: toTokenAmountView(input.token, pendingUnits, "tongo_units"),
    shieldedTotal: toTokenAmountView(input.token, totalUnits, "tongo_units"),
  };
}

export function buildPortfolioBalanceView(
  inputs: Partial<Record<TokenKey, TokenBalanceInput>>,
): PortfolioBalanceView {
  const byToken = {} as Record<TokenKey, TokenBalanceView>;
  const tokens: TokenBalanceView[] = [];

  for (const token of SUPPORTED_TOKENS) {
    const view = buildTokenBalanceView(
      inputs[token] || {
        token,
        publicErc20Wei: "0",
        shieldedAvailableTongoUnits: "0",
        shieldedPendingTongoUnits: "0",
      },
    );
    byToken[token] = view;
    tokens.push(view);
  }

  return { tokens, byToken };
}

function toActivitySwapView(record: ActivityRecord): ActivitySwapView | null {
  if (!record.swap) return null;
  const sellToken = normalizeTokenKey(record.swap.sell_token, normalizeTokenKey(record.token));
  const buyToken = normalizeTokenKey(record.swap.buy_token, normalizeTokenKey(record.token));

  return {
    provider: record.swap.provider,
    sellToken,
    buyToken,
    sellAmount: toTokenAmountView(sellToken, record.swap.sell_amount_wei, "erc20_wei"),
    estimatedBuyAmount: toTokenAmountView(
      buyToken,
      record.swap.estimated_buy_amount_wei,
      "erc20_wei",
    ),
    minBuyAmount: toTokenAmountView(buyToken, record.swap.min_buy_amount_wei, "erc20_wei"),
    actualBuyAmount: record.swap.buy_actual_amount_wei
      ? toTokenAmountView(buyToken, record.swap.buy_actual_amount_wei, "erc20_wei")
      : null,
  };
}

export function toActivityRecordView(record: ActivityRecord): ActivityRecordView {
  const token = normalizeTokenKey(record.token);
  const amountUnit = resolveAmountUnit(record.amount ?? null, record.amount_unit, record.type);
  const amount =
    record.amount && amountUnit
      ? toTokenAmountView(token, record.amount, amountUnit)
      : null;

  return {
    id: record.id,
    source: record.source,
    txHash: record.tx_hash,
    type: record.type,
    status: record.status,
    statusDetail: record.status_detail,
    token,
    amount,
    recipient: record.recipient ?? null,
    recipientName: record.recipient_name ?? null,
    note: record.note ?? null,
    accountType: record.account_type,
    wardAddress: record.ward_address ?? null,
    fee: record.fee ?? null,
    network: record.network,
    platform: record.platform ?? null,
    createdAt: record.created_at,
    respondedAt: record.responded_at ?? null,
    errorMessage: record.error_message ?? null,
    swap: toActivitySwapView(record),
    raw: record,
  };
}

export function toActivityRecordViews(records: ActivityRecord[]): ActivityRecordView[] {
  return records.map(toActivityRecordView);
}
