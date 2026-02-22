import { convertAmount } from "../token-convert";
import { TOKENS } from "../tokens";
import type { RouterCall } from "../router";
import type { Network } from "../types";
import type {
  ShieldedSwapPlan,
  SwapBuildRequest,
  SwapExecutionInput,
  SwapExecutionResult,
  SwapQuote,
  SwapQuoteRequest,
} from "./types";
import type { CloakSwapModuleAdapter } from "./module";

export const AVNU_BASE_URL = "https://starknet.api.avnu.fi";
export const AVNU_BASE_URL_BY_NETWORK: Record<Network, string> = {
  mainnet: "https://starknet.api.avnu.fi",
  sepolia: "https://sepolia.api.avnu.fi",
};
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 200;

interface AvnuQuoteItem {
  quoteId?: string;
  id?: string;
  buyAmount?: string;
  buyTokenAmount?: string;
  buy_amount?: string;
  buy_token_amount?: string;
  expiration?: string;
  expiresAt?: string;
  validUntil?: string;
  [key: string]: unknown;
}

interface AvnuBuildResponse {
  calls?: Array<{
    contractAddress?: string;
    to?: string;
    entrypoint?: string;
    selector?: string;
    calldata?: Array<string | number | bigint>;
  }>;
  [key: string]: unknown;
}

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export interface AvnuSwapApiConfig {
  baseUrl?: string;
  network?: Network;
  fetch?: FetchLike;
  maxRetries?: number;
  retryDelayMs?: number;
  now?: () => number;
}

export class AvnuSwapApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string, message?: string) {
    super(message ?? `AVNU API request failed (${status})`);
    this.name = "AvnuSwapApiError";
    this.status = status;
    this.body = body;
  }
}

export class AvnuSwapStaleQuoteError extends Error {
  constructor(expiresAt: string) {
    super(`AVNU quote is stale (expiresAt=${expiresAt})`);
    this.name = "AvnuSwapStaleQuoteError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveFetch(config?: AvnuSwapApiConfig): FetchLike {
  const fromConfig = config?.fetch;
  if (fromConfig) return fromConfig;
  const f = (globalThis as any).fetch;
  if (!f) throw new Error("fetch is not available in this runtime");
  return f.bind(globalThis);
}

function toDecimalString(value: unknown): string | null {
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value).toString();
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" && /^0x[0-9a-f]+$/i.test(value)) {
    return BigInt(value).toString();
  }
  return null;
}

function parseJsonSafe<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function extractQuoteItems(payload: unknown): AvnuQuoteItem[] {
  if (Array.isArray(payload)) return payload as AvnuQuoteItem[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.quotes)) return obj.quotes as AvnuQuoteItem[];
    if (Array.isArray(obj.data)) return obj.data as AvnuQuoteItem[];
  }
  return [];
}

function extractQuoteId(quote: AvnuQuoteItem): string | null {
  if (typeof quote.quoteId === "string" && quote.quoteId.length > 0) return quote.quoteId;
  if (typeof quote.id === "string" && quote.id.length > 0) return quote.id;
  return null;
}

function extractBuyAmountWei(quote: AvnuQuoteItem): string | null {
  return (
    toDecimalString(quote.buyAmount)
    || toDecimalString(quote.buyTokenAmount)
    || toDecimalString(quote.buy_amount)
    || toDecimalString(quote.buy_token_amount)
  );
}

function extractExpiryIso(quote: AvnuQuoteItem): string | null {
  const raw =
    quote.expiresAt
    || quote.expiration
    || quote.validUntil;
  if (typeof raw !== "string" || raw.length === 0) return null;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

async function fetchWithRetries(
  fetchImpl: FetchLike,
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string },
  retries: number,
  retryDelayMs: number,
): Promise<{ ok: boolean; status: number; text(): Promise<string> }> {
  let attempt = 0;
  let lastErr: unknown;

  while (attempt <= retries) {
    try {
      const res = await fetchImpl(url, init);
      if (!res.ok && isRetryableStatus(res.status) && attempt < retries) {
        attempt += 1;
        await sleep(retryDelayMs);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt >= retries) break;
      attempt += 1;
      await sleep(retryDelayMs);
    }
  }

  if (lastErr instanceof Error) throw lastErr;
  throw new Error("AVNU request failed");
}

function normalizeCall(call: any): RouterCall {
  return {
    contractAddress: call.contractAddress || call.to,
    entrypoint: call.entrypoint || call.selector,
    calldata: Array.isArray(call.calldata) ? call.calldata.map((v: unknown) => String(v)) : [],
  };
}

function minOutFromSlippage(estimatedBuyWei: bigint, slippageBps: number): bigint {
  const bounded = Math.max(1, Math.min(5000, slippageBps));
  return (estimatedBuyWei * BigInt(10_000 - bounded)) / 10_000n;
}

export function createAvnuSwapAdapter(config: AvnuSwapApiConfig = {}): CloakSwapModuleAdapter {
  const fetchImpl = resolveFetch(config);
  const selectedBaseUrl =
    config.baseUrl || AVNU_BASE_URL_BY_NETWORK[config.network || "mainnet"] || AVNU_BASE_URL;
  const baseUrl = selectedBaseUrl.replace(/\/$/, "");
  const retries = config.maxRetries ?? DEFAULT_RETRIES;
  const retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const now = config.now ?? (() => Date.now());

  async function quote(params: SwapQuoteRequest): Promise<SwapQuote> {
    const sellTokenAddress = TOKENS[params.pair.sellToken].erc20Address;
    const buyTokenAddress = TOKENS[params.pair.buyToken].erc20Address;
    const sellAmountWei = convertAmount(
      {
        value: params.sellAmount.value,
        unit: params.sellAmount.unit,
        token: params.pair.sellToken,
      },
      "erc20_wei",
    );

    const url = new URL(`${baseUrl}/swap/v3/quotes`);
    url.searchParams.set("sellTokenAddress", sellTokenAddress);
    url.searchParams.set("buyTokenAddress", buyTokenAddress);
    url.searchParams.set("sellAmount", `0x${BigInt(sellAmountWei).toString(16)}`);
    url.searchParams.set("takerAddress", params.walletAddress);

    const res = await fetchWithRetries(
      fetchImpl,
      url.toString(),
      { method: "GET" },
      retries,
      retryDelayMs,
    );
    const text = await res.text();
    if (!res.ok) throw new AvnuSwapApiError(res.status, text, "Failed to fetch AVNU quote");

    const payload = parseJsonSafe<unknown>(text);
    const quotes = extractQuoteItems(payload);
    const selected = quotes[0];
    if (!selected) {
      throw new Error("AVNU quote response is empty");
    }

    const quoteId = extractQuoteId(selected);
    if (!quoteId) throw new Error("AVNU quote id missing");

    const buyAmountWei = extractBuyAmountWei(selected);
    if (!buyAmountWei) throw new Error("AVNU buy amount missing");

    const expiresAt = extractExpiryIso(selected);
    if (expiresAt && Date.parse(expiresAt) <= now()) {
      throw new AvnuSwapStaleQuoteError(expiresAt);
    }

    const slippageBps = params.slippageBps ?? 100;
    const minBuyAmountWei = minOutFromSlippage(BigInt(buyAmountWei), slippageBps);

    return {
      id: quoteId,
      provider: "avnu",
      pair: params.pair,
      mode: "exact_in",
      sellAmountWei,
      estimatedBuyAmountWei: buyAmountWei,
      minBuyAmountWei: minBuyAmountWei.toString(),
      expiresAt,
      route: selected,
      meta: {
        slippageBps,
      },
    };
  }

  async function build(params: SwapBuildRequest): Promise<ShieldedSwapPlan> {
    const slippageBps =
      typeof params.quote.meta?.slippageBps === "number"
        ? params.quote.meta.slippageBps
        : 100;
    const slippagePct = slippageBps / 100;

    const body = {
      quoteId: params.quote.id,
      takerAddress: params.walletAddress,
      receiverAddress: params.receiverAddress || params.walletAddress,
      // Always include sell-token approval in the built route so composed execution
      // works for fresh wallets that do not have prior allowance configured.
      includeApprove: true,
      slippage: slippagePct,
    };

    const res = await fetchWithRetries(
      fetchImpl,
      `${baseUrl}/swap/v3/build`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      retries,
      retryDelayMs,
    );
    const text = await res.text();
    if (!res.ok) throw new AvnuSwapApiError(res.status, text, "Failed to build AVNU route");

    const payload = parseJsonSafe<AvnuBuildResponse>(text);
    const rawCalls = payload?.calls;
    if (!Array.isArray(rawCalls) || rawCalls.length === 0) {
      throw new Error("AVNU build response did not include calls");
    }
    const dexCalls = rawCalls.map(normalizeCall);

    return {
      provider: "avnu",
      pair: params.pair,
      mode: "exact_in",
      quoteId: params.quote.id,
      calls: dexCalls,
      dexCalls,
      sellAmount: {
        value: params.quote.sellAmountWei,
        unit: "erc20_wei",
      },
      estimatedBuyAmountWei: params.quote.estimatedBuyAmountWei,
      minBuyAmountWei: params.quote.minBuyAmountWei,
      meta: {
        avnuBuild: payload ?? null,
      },
    };
  }

  async function execute(_params: SwapExecutionInput): Promise<SwapExecutionResult> {
    throw new Error("AVNU adapter does not implement execute(); use runtime swap executor");
  }

  return {
    quote,
    build,
    execute,
  };
}
