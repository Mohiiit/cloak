import { createHash } from "crypto";

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

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  const value = raw.trim().toLowerCase();
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return fallback;
}

function deterministicTxHash(input: StarkZapExecutionRequest): string {
  const payload = JSON.stringify({
    agentType: input.agentType,
    action: input.action,
    params: input.params,
    operatorWallet: input.operatorWallet,
    serviceWallet: input.serviceWallet,
    protocol: input.protocol,
  });
  const hash = createHash("sha256").update(payload).digest("hex");
  return `0x${hash}`;
}

export async function executeWithStarkZap(
  input: StarkZapExecutionRequest,
): Promise<StarkZapExecutionResult> {
  const executorUrl = process.env.STARKZAP_EXECUTOR_URL?.trim();
  const strictOnchain = parseBool(
    process.env.MARKETPLACE_STRICT_ONCHAIN_EXECUTION,
    false,
  );
  const allowSimulated = parseBool(
    process.env.STARKZAP_ALLOW_SIMULATED_EXECUTION,
    !strictOnchain,
  );

  if (executorUrl) {
    try {
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
      };
      const txHashes = json.tx_hashes || json.txHashes || [];
      if (!Array.isArray(txHashes) || txHashes.length === 0) {
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
    } catch (error) {
      if (!allowSimulated) {
        throw error;
      }
      const txHash = deterministicTxHash(input);
      return {
        provider: "starkzap",
        txHashes: [txHash],
        receipt: {
          protocol: input.protocol,
          action: input.action,
          params: input.params,
          operator_wallet: input.operatorWallet,
          service_wallet: input.serviceWallet,
          simulated: true,
          fallback_reason:
            error instanceof Error ? error.message : "starkzap executor failure",
          tx_hash: txHash,
        },
      };
    }
  }

  if (!allowSimulated) {
    throw new Error("starkzap executor URL is required in strict on-chain mode");
  }

  const txHash = deterministicTxHash(input);
  return {
    provider: "starkzap",
    txHashes: [txHash],
    receipt: {
      protocol: input.protocol,
      action: input.action,
      params: input.params,
      operator_wallet: input.operatorWallet,
      service_wallet: input.serviceWallet,
      simulated: true,
      tx_hash: txHash,
    },
  };
}
