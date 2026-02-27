export type StarkZapGatewayMode = "http" | "jsonrpc";

export interface StarkZapGatewayInput {
  agentType: string;
  action: string;
  params: Record<string, unknown>;
  operatorWallet: string;
  serviceWallet: string;
  protocol: string;
}

export interface StarkZapGatewayResult {
  txHashes: string[];
  receipt: Record<string, unknown>;
  mode: StarkZapGatewayMode;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseMode(raw: string | undefined): StarkZapGatewayMode {
  if (!raw) return "http";
  const normalized = raw
    .replace(/\\r/gi, "")
    .replace(/\\n/gi, "")
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .trim()
    .toLowerCase();
  if (normalized === "jsonrpc") return "jsonrpc";
  return "http";
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function extractTxHashes(payload: unknown): string[] {
  if (!isRecord(payload)) return [];

  if (Array.isArray(payload.tx_hashes)) {
    return payload.tx_hashes.filter((value): value is string => typeof value === "string");
  }
  if (Array.isArray(payload.txHashes)) {
    return payload.txHashes.filter((value): value is string => typeof value === "string");
  }

  const directHash =
    typeof payload.transaction_hash === "string"
      ? payload.transaction_hash
      : typeof payload.transactionHash === "string"
        ? payload.transactionHash
        : null;
  if (directHash) return [directHash];

  return [];
}

function extractReceipt(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) return {};
  if (isRecord(payload.receipt)) return payload.receipt;
  return payload;
}

export async function executeThroughStarkZapGateway(
  input: StarkZapGatewayInput,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: FetchLike,
): Promise<StarkZapGatewayResult> {
  const targetUrl = env.STARKZAP_LAYER_TARGET_URL?.trim();
  if (!targetUrl) {
    throw new Error("STARKZAP_LAYER_TARGET_URL is required");
  }

  const mode = parseMode(env.STARKZAP_LAYER_MODE);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const targetApiKey = env.STARKZAP_LAYER_TARGET_API_KEY?.trim();
  if (targetApiKey) {
    headers.Authorization = `Bearer ${targetApiKey}`;
  }

  const fetcher = fetchImpl || globalThis.fetch?.bind(globalThis);
  if (!fetcher) {
    throw new Error("fetch is not available in this runtime");
  }

  const body =
    mode === "jsonrpc"
      ? JSON.stringify({
          jsonrpc: "2.0",
          id: `cloak-${Date.now()}`,
          method: env.STARKZAP_LAYER_RPC_METHOD?.trim() || "starkzap_execute",
          params: [input],
        })
      : JSON.stringify(input);

  const response = await fetcher(targetUrl, {
    method: "POST",
    headers,
    body,
  });

  const text = await response.text();
  const payload = parseJson(text);
  if (!response.ok) {
    throw new Error(`starkzap layer target failed: ${response.status}`);
  }
  if (!isRecord(payload)) {
    throw new Error("starkzap layer returned invalid JSON response");
  }

  const parsedPayload =
    mode === "jsonrpc"
      ? (() => {
          if (isRecord(payload.error)) {
            const message =
              typeof payload.error.message === "string"
                ? payload.error.message
                : "unknown rpc error";
            throw new Error(`starkzap layer rpc error: ${message}`);
          }
          return payload.result;
        })()
      : payload;

  const txHashes = extractTxHashes(parsedPayload);
  if (txHashes.length === 0) {
    const keys = isRecord(parsedPayload) ? Object.keys(parsedPayload).join(", ") : "none";
    throw new Error(`starkzap layer returned no tx hashes (keys: ${keys})`);
  }

  return {
    txHashes,
    receipt: extractReceipt(parsedPayload),
    mode,
  };
}
