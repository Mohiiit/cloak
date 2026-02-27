export interface StarkZapExecutionRequest {
  agentType: string;
  action: string;
  params: Record<string, unknown>;
  operatorWallet: string;
  serviceWallet: string;
  protocol: string;
}

export interface StarkZapExecutionResult {
  provider: "starkzap";
  txHashes: string[];
  receipt: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function executeWithStarkZap(
  input: StarkZapExecutionRequest,
): Promise<StarkZapExecutionResult> {
  const executorUrl = process.env.STARKZAP_EXECUTOR_URL?.trim();
  if (!executorUrl) {
    throw new Error("STARKZAP_EXECUTOR_URL is required");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey = process.env.STARKZAP_EXECUTOR_API_KEY?.trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const res = await fetch(executorUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`starkzap executor failed: ${res.status}`);
  }

  const json = (await res.json()) as {
    tx_hashes?: string[];
    txHashes?: string[];
    receipt?: Record<string, unknown>;
    error?: unknown;
  };
  const txHashes = json.tx_hashes || json.txHashes || [];
  if (!Array.isArray(txHashes) || txHashes.length === 0) {
    const rpcError = isRecord(json.error) ? json.error : null;
    if (rpcError && typeof rpcError.message === "string") {
      throw new Error(
        `starkzap executor returned rpc error: ${rpcError.message}`,
      );
    }
    throw new Error("starkzap executor returned no tx hashes");
  }

  return {
    provider: "starkzap",
    txHashes,
    receipt: {
      protocol: input.protocol,
      action: input.action,
      params: input.params,
      operator_wallet: input.operatorWallet,
      service_wallet: input.serviceWallet,
      simulated: false,
      ...(json.receipt || {}),
    },
  };
}
