import {
  ERC8004Client,
  type ERC8004AccountLike,
} from "@cloak-wallet/sdk";
import type { RegisterAgentRequest } from "@cloak-wallet/sdk";
import { Account, RpcProvider, Signer, ec, num } from "starknet";

export type OnchainRegistrationWriteStatus = "skipped" | "pending" | "confirmed" | "failed";

export interface OnchainRegistrationWriteOutcome {
  status: OnchainRegistrationWriteStatus;
  txHash: string | null;
  reason: string | null;
  checkedAt: string;
}

interface RegistrationWriteInput {
  agentId: string;
  operatorWallet: string;
  serviceWallet: string;
  onchainWrite?: RegisterAgentRequest["onchain_write"];
}

interface RegistrationWriteOptions {
  env?: Partial<NodeJS.ProcessEnv>;
  account?: ERC8004AccountLike;
  client?: Pick<ERC8004Client, "registerAgentOnchain" | "waitForTransaction">;
}

interface PendingWriteInput {
  status?: string | null;
  txHash?: string | null;
}

interface PendingWriteOptions {
  env?: Partial<NodeJS.ProcessEnv>;
  client?: Pick<ERC8004Client, "waitForTransaction">;
}

class DualKeySigner extends Signer {
  private secondaryPrivateKey: string;

  constructor(primaryPrivateKey: string, secondaryPrivateKey: string) {
    super(primaryPrivateKey);
    this.secondaryPrivateKey = secondaryPrivateKey;
  }

  protected async signRaw(msgHash: string): Promise<string[]> {
    const sig1 = ec.starkCurve.sign(msgHash, this.pk);
    const sig2 = ec.starkCurve.sign(msgHash, this.secondaryPrivateKey);
    return [
      num.toHex(sig1.r),
      num.toHex(sig1.s),
      num.toHex(sig2.r),
      num.toHex(sig2.s),
    ];
  }
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  const normalized = value
    .replace(/\\r/gi, "")
    .replace(/\\n/gi, "")
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .trim()
    .toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function parseCairoVersion(
  value: string | undefined,
  fallback: "0" | "1" = "1",
): "0" | "1" {
  const normalized = value
    ?.replace(/\\r/gi, "")
    ?.replace(/\\n/gi, "")
    ?.replace(/\r/g, "")
    ?.replace(/\n/g, "")
    ?.trim();
  if (normalized === "0") return "0";
  if (normalized === "1") return "1";
  return fallback;
}

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value
    .replace(/\\r/gi, "")
    .replace(/\\n/gi, "")
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeReason(value: unknown): string {
  const raw = value instanceof Error ? value.message : typeof value === "string" ? value : String(value);
  return raw.slice(0, 240);
}

function isTimeoutError(err: unknown): boolean {
  const record = asRecord(err);
  const code = typeof record?.code === "string" ? record.code : null;
  const name = typeof record?.name === "string" ? record.name : null;
  return code === "TX_TIMEOUT" || name === "ERC8004TransactionTimeoutError";
}

function isHexOrDecimal(value: string): boolean {
  return /^(0x[0-9a-fA-F]+|[0-9]+)$/.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isReceiptFailure(receipt: unknown): boolean {
  const record = asRecord(receipt);
  if (!record) return false;
  const executionStatus =
    (record.execution_status as string | undefined) ||
    (record.executionStatus as string | undefined);
  if (!executionStatus) return false;
  const normalized = executionStatus.trim().toUpperCase();
  return normalized === "REVERTED" || normalized === "FAILED";
}

function resolveNetwork(
  env: Partial<NodeJS.ProcessEnv>,
): "mainnet" | "sepolia" {
  return env.AGENTIC_MARKETPLACE_NETWORK === "mainnet" ? "mainnet" : "sepolia";
}

function resolveRpcUrl(env: Partial<NodeJS.ProcessEnv>): string | null {
  return (
    trimToNull(env.CLOAK_SEPOLIA_RPC_URL) ||
    trimToNull(env.NEXT_PUBLIC_SEPOLIA_PROVIDER_URL)
  );
}

function resolveWriteEntrypoint(
  env: Partial<NodeJS.ProcessEnv>,
  input: RegisterAgentRequest["onchain_write"] | undefined,
): string {
  return trimToNull(input?.entrypoint) || trimToNull(env.ERC8004_WRITE_ENTRYPOINT) || "register_agent";
}

function resolveWriteWaitForConfirmation(
  env: Partial<NodeJS.ProcessEnv>,
  input: RegisterAgentRequest["onchain_write"] | undefined,
): boolean {
  if (typeof input?.wait_for_confirmation === "boolean") {
    return input.wait_for_confirmation;
  }
  return parseBoolean(env.ERC8004_WRITE_WAIT_FOR_CONFIRMATION, true);
}

function resolveWaitTimeoutMs(
  env: Partial<NodeJS.ProcessEnv>,
  input: RegisterAgentRequest["onchain_write"] | undefined,
): number {
  if (typeof input?.timeout_ms === "number" && input.timeout_ms > 0) {
    return Math.floor(input.timeout_ms);
  }
  return parsePositiveInt(env.ERC8004_WRITE_CONFIRM_TIMEOUT_MS, 45_000);
}

function resolveCalldata(input: RegistrationWriteInput): string[] | null {
  const provided = input.onchainWrite?.calldata;
  if (Array.isArray(provided) && provided.length > 0) {
    const calldata = provided.map((value) => String(value).trim()).filter(Boolean);
    if (calldata.length === 0 || calldata.some((value) => !isHexOrDecimal(value))) {
      return null;
    }
    return calldata;
  }

  if (!isHexOrDecimal(input.agentId)) {
    return null;
  }

  return [input.agentId, input.operatorWallet, input.serviceWallet];
}

async function isTwoFactorAccountEnabled(
  provider: RpcProvider,
  accountAddress: string,
): Promise<boolean> {
  try {
    const result = await provider.callContract({
      contractAddress: accountAddress,
      entrypoint: "is_2fa_enabled",
      calldata: [],
    });
    if (!Array.isArray(result) || result.length === 0) return false;
    return BigInt(result[0] || "0") !== 0n;
  } catch {
    return false;
  }
}

async function buildSignerAccount(
  env: Partial<NodeJS.ProcessEnv>,
): Promise<{ account: ERC8004AccountLike; rpcUrl: string }> {
  const rpcUrl = resolveRpcUrl(env);
  const signerAddress = trimToNull(env.ERC8004_SIGNER_ADDRESS);
  const signerPrivateKey = trimToNull(env.ERC8004_SIGNER_PRIVATE_KEY);
  const signerSecondaryPrivateKey = trimToNull(env.ERC8004_SIGNER_SECONDARY_PRIVATE_KEY);
  const signerCairoVersion = parseCairoVersion(env.ERC8004_SIGNER_CAIRO_VERSION, "1");

  if (!rpcUrl) {
    throw new Error("erc8004_write_rpc_missing");
  }
  if (!signerAddress || !signerPrivateKey) {
    throw new Error("erc8004_write_signer_missing");
  }

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const requiresTwoFactor = await isTwoFactorAccountEnabled(provider, signerAddress);
  if (requiresTwoFactor && !signerSecondaryPrivateKey) {
    throw new Error("erc8004_write_secondary_signer_missing");
  }

  const signer =
    requiresTwoFactor && signerSecondaryPrivateKey
      ? new DualKeySigner(signerPrivateKey, signerSecondaryPrivateKey)
      : signerPrivateKey;

  const account = new Account({
    provider,
    address: signerAddress,
    signer,
    cairoVersion: signerCairoVersion,
  }) as unknown as ERC8004AccountLike;

  return {
    account,
    rpcUrl,
  };
}

export function isOnchainRegistrationWriteEnabled(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): boolean {
  return parseBoolean(env.ERC8004_WRITE_ENABLED, false);
}

function classifyWriteWaitError(
  err: unknown,
  txHash: string,
  checkedAt: string,
): OnchainRegistrationWriteOutcome {
  if (isTimeoutError(err)) {
    return {
      status: "pending",
      txHash,
      reason: "tx_pending_confirmation",
      checkedAt,
    };
  }
  return {
    status: "failed",
    txHash,
    reason: sanitizeReason(err),
    checkedAt,
  };
}

export async function submitAgentRegistrationOnchain(
  input: RegistrationWriteInput,
  options: RegistrationWriteOptions = {},
): Promise<OnchainRegistrationWriteOutcome> {
  const env = options.env ?? process.env;
  const checkedAt = new Date().toISOString();

  if (!isOnchainRegistrationWriteEnabled(env)) {
    return {
      status: "skipped",
      txHash: null,
      reason: "write_disabled",
      checkedAt,
    };
  }

  const calldata = resolveCalldata(input);
  if (!calldata) {
    return {
      status: "failed",
      txHash: null,
      reason: "calldata_unavailable",
      checkedAt,
    };
  }

  try {
    const network = resolveNetwork(env);
    const waitForConfirmation = resolveWriteWaitForConfirmation(env, input.onchainWrite);
    const timeoutMs = resolveWaitTimeoutMs(env, input.onchainWrite);
    const entrypoint = resolveWriteEntrypoint(env, input.onchainWrite);
    const clientToUse =
      options.client ||
      (await (async () => {
        const { account, rpcUrl } = options.account
          ? { account: options.account, rpcUrl: resolveRpcUrl(env) }
          : await buildSignerAccount(env);
        return new ERC8004Client({
          network,
          rpcUrl: rpcUrl || undefined,
          account,
        });
      })());

    const invoke = await clientToUse.registerAgentOnchain({
      entrypoint,
      calldata,
    });

    if (!waitForConfirmation) {
      return {
        status: "pending",
        txHash: invoke.transactionHash,
        reason: "awaiting_confirmation",
        checkedAt,
      };
    }

    try {
      const receipt = await clientToUse.waitForTransaction(invoke.transactionHash, {
        timeoutMs,
      });
      if (isReceiptFailure(receipt)) {
        return {
          status: "failed",
          txHash: invoke.transactionHash,
          reason: "tx_execution_failed",
          checkedAt,
        };
      }
      return {
        status: "confirmed",
        txHash: invoke.transactionHash,
        reason: null,
        checkedAt,
      };
    } catch (waitErr) {
      return classifyWriteWaitError(waitErr, invoke.transactionHash, checkedAt);
    }
  } catch (err) {
    return {
      status: "failed",
      txHash: null,
      reason: sanitizeReason(err),
      checkedAt,
    };
  }
}

export async function reconcilePendingAgentRegistrationWrite(
  input: PendingWriteInput,
  options: PendingWriteOptions = {},
): Promise<OnchainRegistrationWriteOutcome | null> {
  const env = options.env ?? process.env;
  const txHash = trimToNull(input.txHash ?? undefined);
  if (!isOnchainRegistrationWriteEnabled(env)) return null;
  if (input.status !== "pending" || !txHash) return null;

  const checkedAt = new Date().toISOString();
  try {
    const network = resolveNetwork(env);
    const timeoutMs = parsePositiveInt(env.ERC8004_WRITE_CONFIRM_TIMEOUT_MS, 20_000);
    const client =
      options.client ||
      new ERC8004Client({
        network,
        rpcUrl: resolveRpcUrl(env) || undefined,
      });

    const receipt = await client.waitForTransaction(txHash, {
      timeoutMs,
    });

    if (isReceiptFailure(receipt)) {
      return {
        status: "failed",
        txHash,
        reason: "tx_execution_failed",
        checkedAt,
      };
    }

    return {
      status: "confirmed",
      txHash,
      reason: null,
      checkedAt,
    };
  } catch (err) {
    if (isTimeoutError(err)) {
      return {
        status: "pending",
        txHash,
        reason: "tx_pending_confirmation",
        checkedAt,
      };
    }

    return {
      status: "failed",
      txHash,
      reason: sanitizeReason(err),
      checkedAt,
    };
  }
}
