import { TOKENS, type TokenKey } from "./tokens";

export const AVNU_QUOTES_URL = "https://sepolia.api.avnu.fi/swap/v3/quotes";

export type QuoteMeta = {
  sellWei: string;
  estimatedBuyWei: string;
  minBuyWei: string;
  avnuFeeWei?: string;
  avnuFeeToken?: TokenKey;
  gasFeeWei?: string;
};

export type QuoteBreakdown = {
  sentUnits: bigint;
  estimatedUnits: bigint;
  minimumUnits: bigint;
  dustUnits: bigint;
  meta: QuoteMeta;
  display: {
    input: string;
    estimated: string;
    minimum: string;
    protocolFee: string | null;
    protocolFeeToken: TokenKey | null;
    gasFeeEth: string | null;
    effectiveRate: string | null;
  };
};

export type BringRateInput = {
  walletAddress: string;
  fromToken: TokenKey;
  toToken: TokenKey;
  sentUnits: bigint;
  slippageBps: number;
  supabaseUrl: string;
  supabaseKey: string;
};

type SdkRuntime = {
  swaps: {
    quote(input: {
      walletAddress: string;
      pair: { sellToken: TokenKey; buyToken: TokenKey };
      sellAmount: { value: string; unit: "tongo_units" };
      slippageBps: number;
    }): Promise<{
      sellAmountWei: string;
      estimatedBuyAmountWei: string;
      minBuyAmountWei: string;
      route?: unknown;
    }>;
  };
};

type ResponseLike = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
};

type BringRateDeps = {
  quoteViaSdk?: (input: BringRateInput) => Promise<QuoteMeta>;
  fetchImpl?: (url: string) => Promise<ResponseLike>;
};

function padAddressSafe(value: string): string {
  if (!value) return value;
  const stripped = value.startsWith("0x") ? value.slice(2) : value;
  return `0x${stripped.padStart(64, "0")}`;
}

function toDecimalString(value: unknown): string | null {
  if (typeof value === "string") {
    if (/^\d+$/.test(value)) return value;
    if (/^0x[0-9a-f]+$/i.test(value)) return BigInt(value).toString();
  }
  return null;
}

function normalizeHexAddress(value: string): string {
  const stripped = value.startsWith("0x") ? value.slice(2) : value;
  const compact = stripped.replace(/^0+/, "");
  return `0x${compact || "0"}`.toLowerCase();
}

function tokenByAddress(address: string): TokenKey | null {
  const normalized = normalizeHexAddress(address);
  const token = (Object.keys(TOKENS) as TokenKey[]).find((key) => {
    return normalizeHexAddress(TOKENS[key].erc20Contract) === normalized;
  });
  return token ?? null;
}

export function formatQuoteError(raw: string, status?: number): string {
  try {
    const parsed = JSON.parse(raw) as { message?: string; error?: string };
    if (parsed.message) return parsed.message;
    if (parsed.error) return status ? `Quote API ${status}: ${parsed.error}` : parsed.error;
  } catch {
    // noop
  }
  if (status) return `Quote API ${status}: ${raw || "Request failed"}`;
  return raw || "Could not fetch quote. Try again.";
}

function parseFallbackQuote(raw: string): QuoteMeta | null {
  try {
    const payload = JSON.parse(raw) as unknown;
    const first = Array.isArray(payload) ? payload[0] : null;
    if (!first || typeof first !== "object") return null;
    const row = first as Record<string, unknown>;

    const sellWei = toDecimalString(row.sellAmount);
    const estimatedBuyWei = toDecimalString(row.buyAmount);
    const fee = row.fee as { avnuFees?: unknown; feeToken?: unknown } | undefined;
    const avnuFeeWei = toDecimalString(fee?.avnuFees) ?? undefined;
    const gasFeeWei = toDecimalString(row.gasFees) ?? undefined;
    const avnuFeeTokenAddress = typeof fee?.feeToken === "string" ? fee.feeToken : null;
    const avnuFeeToken = avnuFeeTokenAddress ? tokenByAddress(avnuFeeTokenAddress) ?? undefined : undefined;

    if (!sellWei || !estimatedBuyWei) return null;
    return {
      sellWei,
      estimatedBuyWei,
      minBuyWei: estimatedBuyWei,
      avnuFeeWei,
      avnuFeeToken,
      gasFeeWei,
    };
  } catch {
    return null;
  }
}

function formatWeiForQuote(wei: string, token: TokenKey): string {
  const n = BigInt(wei);
  if (n === 0n) return "0";
  const cfg = TOKENS[token];
  const divisor = 10n ** BigInt(cfg.decimals);
  const whole = n / divisor;
  const frac = n % divisor;
  if (frac === 0n) return whole.toString();

  const fracStr = frac.toString().padStart(cfg.decimals, "0");
  const maxDecimals = token === "ETH" ? 6 : 4;
  const short = fracStr.slice(0, maxDecimals).replace(/0+$/, "");
  if (!short) return whole.toString();
  return `${whole}.${short}`;
}

function computeEffectiveRate(
  sellWei: string,
  buyWei: string,
  fromToken: TokenKey,
  toToken: TokenKey,
): string | null {
  const sell = BigInt(sellWei);
  const buy = BigInt(buyWei);
  if (sell <= 0n || buy <= 0n) return null;

  const fromDecimals = BigInt(TOKENS[fromToken].decimals);
  const toDecimals = BigInt(TOKENS[toToken].decimals);
  const scaled = (buy * 10n ** fromDecimals * 1_000_000n) / (sell * 10n ** toDecimals);
  const whole = scaled / 1_000_000n;
  const frac = (scaled % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac.length > 0 ? `${whole}.${frac}` : whole.toString();
}

function buildBreakdown(
  fromToken: TokenKey,
  toToken: TokenKey,
  sentUnits: bigint,
  slippageBps: number,
  meta: QuoteMeta,
): QuoteBreakdown {
  const boundedBps = Math.max(1, Math.min(5000, slippageBps));
  const computedMinWei = (BigInt(meta.estimatedBuyWei) * BigInt(10_000 - boundedBps)) / 10_000n;
  const minBuyWei = meta.minBuyWei ? BigInt(meta.minBuyWei) : computedMinWei;

  const estimatedUnits = BigInt(meta.estimatedBuyWei) / TOKENS[toToken].rate;
  const minimumUnits = minBuyWei / TOKENS[toToken].rate;
  const dustUnits = estimatedUnits > minimumUnits ? estimatedUnits - minimumUnits : 0n;

  const protocolFeeToken = meta.avnuFeeToken ?? toToken;
  const protocolFeeWei = (() => {
    if (!meta.avnuFeeWei) return null;
    const raw = BigInt(meta.avnuFeeWei);
    if (raw <= 0n) return null;
    const tokenDecimals = TOKENS[protocolFeeToken].decimals;
    if (tokenDecimals >= 18) return raw.toString();

    // AVNU may return fee values scaled with 18 decimals even for low-decimal tokens (e.g. USDC).
    // If fee is clearly outsized vs expected output, downscale to token-minimal units.
    const estimatedBuy = BigInt(meta.estimatedBuyWei);
    if (estimatedBuy > 0n && raw > estimatedBuy * 100n) {
      const scale = 10n ** BigInt(18 - tokenDecimals);
      const normalized = raw / scale;
      if (normalized > 0n) return normalized.toString();
      return null;
    }
    return raw.toString();
  })();

  return {
    sentUnits,
    estimatedUnits,
    minimumUnits,
    dustUnits,
    meta: {
      ...meta,
      minBuyWei: minBuyWei.toString(),
    },
    display: {
      input: formatWeiForQuote(meta.sellWei, fromToken),
      estimated: formatWeiForQuote(meta.estimatedBuyWei, toToken),
      minimum: formatWeiForQuote(minBuyWei.toString(), toToken),
      protocolFee: protocolFeeWei ? formatWeiForQuote(protocolFeeWei, protocolFeeToken) : null,
      protocolFeeToken: protocolFeeWei ? protocolFeeToken : null,
      gasFeeEth: meta.gasFeeWei ? formatWeiForQuote(meta.gasFeeWei, "ETH") : null,
      effectiveRate: computeEffectiveRate(meta.sellWei, meta.estimatedBuyWei, fromToken, toToken),
    },
  };
}

async function quoteViaSdkDefault(input: BringRateInput): Promise<QuoteMeta> {
  const sdk = require("@cloak-wallet/sdk") as {
    createCloakRuntime: (config: unknown) => SdkRuntime;
    DEFAULT_RPC: { sepolia: string };
    SupabaseLite: new (url: string, key: string) => unknown;
    padAddress: (value: string) => string;
  };
  const starknet = require("starknet") as {
    RpcProvider: new (config: { nodeUrl: string }) => unknown;
  };

  const provider = new starknet.RpcProvider({ nodeUrl: sdk.DEFAULT_RPC.sepolia });
  const supabase = new sdk.SupabaseLite(input.supabaseUrl, input.supabaseKey);
  const runtime = sdk.createCloakRuntime({
    network: "sepolia",
    provider,
    supabase,
  });

  const swapQuote = await runtime.swaps.quote({
    walletAddress: sdk.padAddress(input.walletAddress),
    pair: { sellToken: input.fromToken, buyToken: input.toToken },
    sellAmount: { value: input.sentUnits.toString(), unit: "tongo_units" },
    slippageBps: input.slippageBps,
  });

  const route = (swapQuote.route ?? {}) as { fee?: { avnuFees?: string }; gasFees?: string };
  const feeTokenRaw = (route as { fee?: { feeToken?: unknown } }).fee?.feeToken;
  const avnuFeeToken = typeof feeTokenRaw === "string" ? tokenByAddress(feeTokenRaw) ?? undefined : undefined;
  return {
    sellWei: swapQuote.sellAmountWei,
    estimatedBuyWei: swapQuote.estimatedBuyAmountWei,
    minBuyWei: swapQuote.minBuyAmountWei,
    avnuFeeWei: route.fee?.avnuFees,
    avnuFeeToken,
    gasFeeWei: route.gasFees,
  };
}

async function fallbackQuote(input: BringRateInput, fetchImpl: (url: string) => Promise<ResponseLike>): Promise<QuoteMeta> {
  const sellAmountWei = (input.sentUnits * TOKENS[input.fromToken].rate).toString();
  const params = new URLSearchParams({
    sellTokenAddress: TOKENS[input.fromToken].erc20Contract,
    buyTokenAddress: TOKENS[input.toToken].erc20Contract,
    sellAmount: `0x${BigInt(sellAmountWei).toString(16)}`,
    takerAddress: padAddressSafe(input.walletAddress),
  });

  const res = await fetchImpl(`${AVNU_QUOTES_URL}?${params.toString()}`);
  const body = await res.text();
  if (!res.ok) {
    throw new Error(formatQuoteError(body, res.status));
  }

  const parsed = parseFallbackQuote(body);
  if (!parsed) {
    throw new Error("Fallback quote response missing expected fields");
  }
  return parsed;
}

export async function bringRateAndQuote(input: BringRateInput, deps: BringRateDeps = {}): Promise<QuoteBreakdown> {
  const quoteViaSdk = deps.quoteViaSdk ?? quoteViaSdkDefault;
  const fetchImpl = deps.fetchImpl ?? ((url: string) => fetch(url) as unknown as Promise<ResponseLike>);

  try {
    const meta = await quoteViaSdk(input);
    return buildBreakdown(input.fromToken, input.toToken, input.sentUnits, input.slippageBps, meta);
  } catch (error) {
    let reason = error instanceof Error ? error.message : "Could not fetch quote. Try again.";
    const rawBody = (error as { body?: unknown })?.body;
    if (typeof rawBody === "string") {
      reason = formatQuoteError(rawBody);
    }

    if (reason.trim().toLowerCase() !== "not found") {
      throw new Error(reason);
    }

    const meta = await fallbackQuote(input, fetchImpl);
    return buildBreakdown(input.fromToken, input.toToken, input.sentUnits, input.slippageBps, meta);
  }
}
