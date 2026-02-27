import { Account, RpcProvider, Signer, ec, num, type Call } from "starknet";

export interface BasicProtocolExecutionRequest {
  agentType: string;
  action: string;
  params: Record<string, unknown>;
  operatorWallet: string;
  serviceWallet: string;
  protocol: string;
}

export interface BasicProtocolExecutionResult {
  provider: "basic-protocol";
  txHashes: string[];
  receipt: Record<string, unknown>;
}

interface AccountLike {
  execute(
    calls: Call | Call[],
    details?: unknown,
  ): Promise<{ transaction_hash?: string; transactionHash?: string } | string>;
}

interface ExecuteDeps {
  account?: AccountLike;
  provider?: RpcProvider;
}

interface TransferInput {
  token: string;
  to: string;
  amount: string;
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

const UINT128_MAX = (1n << 128n) - 1n;
const STRK_TOKEN_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const ETH_TOKEN_ADDRESS =
  "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
const USDC_TOKEN_ADDRESS =
  "0x053b40a647cedfca6ca84f542a0fe36736031905a9639a7f19a3c1e66bfd5080";
const DEFAULT_STAKING_CONTRACT =
  "0x03745ab04a431fc02871a139be6b93d9260b0ff3e779ad9c8b377183b23109f1";
const WEI_PER_STRK = 10n ** 18n;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function sanitizeEnvCredential(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const cleaned = raw
    .replace(/\\r/gi, "")
    .replace(/\\n/gi, "")
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

function parseAmount(value: unknown): bigint {
  const raw = asString(value);
  if (!raw) {
    throw new Error("amount must be a non-empty string");
  }
  if (!/^(0x[0-9a-fA-F]+|\d+)$/.test(raw)) {
    throw new Error(`amount must be bigint-compatible: ${raw}`);
  }
  return BigInt(raw);
}

function parseDecimalAmountToUnits(value: string, decimals: number): bigint {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`amount must be numeric: ${value}`);
  }
  const [whole, fractionRaw = ""] = normalized.split(".");
  if (fractionRaw.length > decimals) {
    throw new Error(`amount has too many decimal places for ${decimals}-decimals token`);
  }
  const wholePart = BigInt(whole || "0");
  const fractionPart = BigInt(
    `${fractionRaw}${"0".repeat(Math.max(0, decimals - fractionRaw.length))}` || "0",
  );
  return wholePart * 10n ** BigInt(decimals) + fractionPart;
}

function resolveTokenAddress(value: unknown, field: string): string {
  const raw = asString(value);
  if (!raw) {
    throw new Error(`${field} is required`);
  }
  if (/^0x[0-9a-fA-F]+$/.test(raw)) {
    return requireHexAddress(raw, field);
  }
  const symbol = raw.trim().toUpperCase();
  if (symbol === "STRK") return STRK_TOKEN_ADDRESS;
  if (symbol === "ETH") return ETH_TOKEN_ADDRESS;
  if (symbol === "USDC") return USDC_TOKEN_ADDRESS;
  throw new Error(`${field} must be a 0x-prefixed hex address or a supported token symbol`);
}

function resolveStakingAmountWei(params: Record<string, unknown>): bigint {
  const rawAmount = asString(params.amount);
  if (!rawAmount) {
    throw new Error("params.amount is required");
  }
  const unit = asString(params.amount_unit)?.toLowerCase() || "strk";
  if (unit === "wei") {
    return parseAmount(rawAmount);
  }
  if (unit === "strk") {
    return parseDecimalAmountToUnits(rawAmount, 18);
  }
  throw new Error("params.amount_unit must be either 'strk' or 'wei'");
}

function toUint256Calldata(amount: bigint): [string, string] {
  const low = amount & UINT128_MAX;
  const high = amount >> 128n;
  return [num.toHex(low), num.toHex(high)];
}

function requireHexAddress(value: unknown, field: string): string {
  const raw = asString(value);
  if (!raw || !/^0x[0-9a-fA-F]+$/.test(raw)) {
    throw new Error(`${field} must be a 0x-prefixed hex address`);
  }
  return raw;
}

function parseCallsArray(value: unknown): Call[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("params.calls must be a non-empty array");
  }
  return value.map((item, index) => {
    const row = asRecord(item);
    if (!row) {
      throw new Error(`params.calls[${index}] must be an object`);
    }
    const contractAddress = requireHexAddress(row.contractAddress, `params.calls[${index}].contractAddress`);
    const entrypoint = asString(row.entrypoint);
    if (!entrypoint) {
      throw new Error(`params.calls[${index}].entrypoint is required`);
    }
    const calldata = Array.isArray(row.calldata)
      ? row.calldata.map((entry, calldataIndex) => {
          const asCalldata = asString(entry);
          if (!asCalldata) {
            throw new Error(
              `params.calls[${index}].calldata[${calldataIndex}] must be a non-empty string`,
            );
          }
          return asCalldata;
        })
      : [];
    return {
      contractAddress,
      entrypoint,
      calldata,
    };
  });
}

function parseTransfer(value: unknown, index: number): TransferInput {
  const row = asRecord(value);
  if (!row) {
    throw new Error(`transfers[${index}] must be an object`);
  }
  const recipient = row.to ?? row.recipient;
  return {
    token: resolveTokenAddress(row.token, `transfers[${index}].token`),
    to: requireHexAddress(recipient, `transfers[${index}].to`),
    amount: parseAmount(row.amount).toString(),
  };
}

function resolveTreasuryCalls(input: BasicProtocolExecutionRequest): Call[] {
  if (input.action === "dispatch_batch") {
    const transfersRaw = input.params.transfers;
    if (!Array.isArray(transfersRaw) || transfersRaw.length === 0) {
      throw new Error("dispatch_batch requires non-empty params.transfers");
    }
    return transfersRaw.map((row, index) => {
      const transfer = parseTransfer(row, index);
      const [low, high] = toUint256Calldata(BigInt(transfer.amount));
      return {
        contractAddress: transfer.token,
        entrypoint: "transfer",
        calldata: [transfer.to, low, high],
      };
    });
  }

  if (input.action === "sweep_idle") {
    const token = resolveTokenAddress(input.params.token, "params.token");
    const targetVault = requireHexAddress(input.params.target_vault, "params.target_vault");
    const amount = parseAmount(input.params.amount);
    const [low, high] = toUint256Calldata(amount);
    return [
      {
        contractAddress: token,
        entrypoint: "transfer",
        calldata: [targetVault, low, high],
      },
    ];
  }

  throw new Error(`Unsupported treasury action: ${input.action}`);
}

function resolveStakingContractAddress(
  input: BasicProtocolExecutionRequest,
  env: NodeJS.ProcessEnv,
): string {
  const configured = asString(input.params.staking_contract);
  const fallback = asString(env.BASIC_PROTOCOL_STAKING_CONTRACT);
  return requireHexAddress(
    configured || fallback || DEFAULT_STAKING_CONTRACT,
    "params.staking_contract",
  );
}

async function hasExistingStakerPosition(
  provider: RpcProvider | undefined,
  stakingContract: string,
  stakerAddress: string,
): Promise<boolean> {
  if (!provider) return false;
  try {
    const result = await provider.callContract({
      contractAddress: stakingContract,
      entrypoint: "staker_info_v1",
      calldata: [stakerAddress],
    });
    if (!Array.isArray(result) || result.length === 0) return false;
    return BigInt(result[0] || "0") !== 0n;
  } catch {
    return false;
  }
}

async function readStakerInfo(
  provider: RpcProvider,
  stakingContract: string,
  stakerAddress: string,
): Promise<{ staked: bigint; unclaimed: bigint }> {
  const result = await provider.callContract({
    contractAddress: stakingContract,
    entrypoint: "staker_info_v1",
    calldata: [stakerAddress],
  });
  if (!Array.isArray(result) || result.length < 2) {
    throw new Error("staker_info_v1 returned unexpected format");
  }
  // result[0] = staked amount, result[1] = unclaimed rewards
  return {
    staked: BigInt(result[0] || "0"),
    unclaimed: BigInt(result[1] || "0"),
  };
}

async function resolveCompoundCalls(
  input: BasicProtocolExecutionRequest,
  env: NodeJS.ProcessEnv,
  provider?: RpcProvider,
): Promise<Call[]> {
  if (!provider) {
    throw new Error("compound requires an RPC provider to read staker_info");
  }
  const stakingContract = resolveStakingContractAddress(input, env);
  const operatorWallet = requireHexAddress(input.operatorWallet, "operatorWallet");
  const stakerInfo = await readStakerInfo(provider, stakingContract, operatorWallet);

  if (stakerInfo.staked === 0n) {
    throw new Error("No existing staking position found");
  }
  if (stakerInfo.unclaimed === 0n) {
    throw new Error("No unclaimed rewards to compound");
  }

  const rewardAmount = stakerInfo.unclaimed;
  const [low, high] = toUint256Calldata(rewardAmount);

  // Multicall: claim_rewards → approve STRK → increase_stake
  return [
    {
      contractAddress: stakingContract,
      entrypoint: "claim_rewards",
      calldata: [operatorWallet],
    },
    {
      contractAddress: STRK_TOKEN_ADDRESS,
      entrypoint: "approve",
      calldata: [stakingContract, low, high],
    },
    {
      contractAddress: stakingContract,
      entrypoint: "increase_stake",
      calldata: [operatorWallet, num.toHex(rewardAmount)],
    },
  ];
}

async function resolveStakingCalls(
  input: BasicProtocolExecutionRequest,
  env: NodeJS.ProcessEnv,
  provider?: RpcProvider,
): Promise<Call[]> {
  const stakingContract = resolveStakingContractAddress(input, env);
  if (input.action === "stake") {
    const tokenAddress = resolveTokenAddress(input.params.token || "STRK", "params.token");
    const amountWei = resolveStakingAmountWei(input.params);
    if (amountWei > UINT128_MAX) {
      throw new Error("staking amount exceeds u128 limit");
    }
    const rewardAddress = requireHexAddress(
      input.params.reward_address || input.operatorWallet,
      "params.reward_address",
    );
    const operationalAddress = requireHexAddress(
      input.params.operational_address || input.serviceWallet,
      "params.operational_address",
    );
    const [low, high] = toUint256Calldata(amountWei);
    const existingStaker = await hasExistingStakerPosition(
      provider,
      stakingContract,
      input.operatorWallet,
    );
    const stakingEntrypoint = existingStaker ? "increase_stake" : "stake";

    return [
      {
        contractAddress: tokenAddress,
        entrypoint: "approve",
        calldata: [stakingContract, low, high],
      },
      {
        contractAddress: stakingContract,
        entrypoint: stakingEntrypoint,
        calldata:
          stakingEntrypoint === "stake"
            ? [rewardAddress, operationalAddress, num.toHex(amountWei)]
            : [requireHexAddress(input.operatorWallet, "operatorWallet"), num.toHex(amountWei)],
      },
    ];
  }

  if (input.action === "unstake") {
    return [
      {
        contractAddress: stakingContract,
        entrypoint: "unstake_intent",
        calldata: [],
      },
    ];
  }

  if (input.action === "rebalance") {
    throw new Error(
      "rebalance is not supported in basic on-chain mode; provide explicit params.calls",
    );
  }

  if (input.action === "compound") {
    return resolveCompoundCalls(input, env, provider);
  }

  throw new Error(`Unsupported staking action: ${input.action}`);
}

function resolveSwapCalls(input: BasicProtocolExecutionRequest): Call[] {
  if (input.action === "swap") {
    const router = requireHexAddress(input.params.router, "params.router");
    const calldata = Array.isArray(input.params.calldata)
      ? (input.params.calldata as unknown[]).map((value, index) => {
          const item = asString(value);
          if (!item) {
            throw new Error(`params.calldata[${index}] must be a non-empty string`);
          }
          return item;
        })
      : null;
    if (!calldata || calldata.length === 0) {
      throw new Error("swap requires params.calldata for basic protocol execution");
    }
    const entrypoint = asString(input.params.entrypoint) || "swap";
    return [
      {
        contractAddress: router,
        entrypoint,
        calldata,
      },
    ];
  }

  if (input.action === "dca_tick") {
    const strategyContract = requireHexAddress(
      input.params.strategy_contract,
      "params.strategy_contract",
    );
    const strategyId = asString(input.params.strategy_id);
    if (!strategyId) {
      throw new Error("dca_tick requires params.strategy_id");
    }
    const entrypoint = asString(input.params.entrypoint) || "tick";
    return [
      {
        contractAddress: strategyContract,
        entrypoint,
        calldata: [strategyId],
      },
    ];
  }

  throw new Error(`Unsupported swap action: ${input.action}`);
}

async function resolveCalls(
  input: BasicProtocolExecutionRequest,
  env: NodeJS.ProcessEnv,
  provider?: RpcProvider,
): Promise<Call[]> {
  if (Array.isArray(input.params.calls) && input.params.calls.length > 0) {
    return parseCallsArray(input.params.calls);
  }

  if (input.agentType === "treasury_dispatcher") {
    return resolveTreasuryCalls(input);
  }
  if (input.agentType === "staking_steward") {
    return resolveStakingCalls(input, env, provider);
  }
  if (input.agentType === "swap_runner") {
    return resolveSwapCalls(input);
  }

  throw new Error(`Unsupported agent type for basic protocol execution: ${input.agentType}`);
}

function resolveSignerConfig(env: NodeJS.ProcessEnv): {
  rpcUrl: string;
  signerAddress: string;
  signerPrivateKey: string;
  signerSecondaryPrivateKey?: string;
  signerCairoVersion: "0" | "1";
} {
  const rpcUrl = env.CLOAK_SEPOLIA_RPC_URL || env.NEXT_PUBLIC_SEPOLIA_PROVIDER_URL;
  if (!rpcUrl) {
    throw new Error("CLOAK_SEPOLIA_RPC_URL is required");
  }

  const signerAddress =
    sanitizeEnvCredential(env.BASIC_PROTOCOL_SIGNER_ADDRESS) ||
    sanitizeEnvCredential(env.ERC8004_SIGNER_ADDRESS);
  const signerPrivateKey =
    sanitizeEnvCredential(env.BASIC_PROTOCOL_SIGNER_PRIVATE_KEY) ||
    sanitizeEnvCredential(env.ERC8004_SIGNER_PRIVATE_KEY);
  const signerSecondaryPrivateKey =
    sanitizeEnvCredential(env.BASIC_PROTOCOL_SIGNER_SECONDARY_PRIVATE_KEY) ||
    sanitizeEnvCredential(env.ERC8004_SIGNER_SECONDARY_PRIVATE_KEY) ||
    undefined;
  const signerCairoVersion =
    env.BASIC_PROTOCOL_SIGNER_CAIRO_VERSION === "0" ||
    env.ERC8004_SIGNER_CAIRO_VERSION === "0"
      ? "0"
      : "1";

  if (!signerAddress || !signerPrivateKey) {
    throw new Error(
      "Basic protocol signer is not configured (set BASIC_PROTOCOL_SIGNER_ADDRESS/BASIC_PROTOCOL_SIGNER_PRIVATE_KEY or ERC8004_SIGNER_ADDRESS/ERC8004_SIGNER_PRIVATE_KEY)",
    );
  }

  return {
    rpcUrl,
    signerAddress,
    signerPrivateKey,
    signerSecondaryPrivateKey,
    signerCairoVersion,
  };
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
    // Not all accounts expose is_2fa_enabled; treat as single-sig by default.
    return false;
  }
}

function resolveTxHash(
  value: Awaited<ReturnType<AccountLike["execute"]>>,
): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (value && typeof value === "object") {
    const txHash = value.transaction_hash || value.transactionHash;
    if (typeof txHash === "string" && txHash.length > 0) {
      return txHash;
    }
  }
  throw new Error("basic protocol executor did not return a transaction hash");
}

export async function executeWithBasicProtocols(
  input: BasicProtocolExecutionRequest,
  env: NodeJS.ProcessEnv = process.env,
  deps: ExecuteDeps = {},
): Promise<BasicProtocolExecutionResult> {
  let provider: RpcProvider | undefined = deps.provider;
  const account =
    deps.account ||
    (await (async () => {
      const signer = resolveSignerConfig(env);
      provider = new RpcProvider({
        nodeUrl: signer.rpcUrl,
      });
      const requiresTwoFactor = await isTwoFactorAccountEnabled(
        provider,
        signer.signerAddress,
      );
      if (requiresTwoFactor && !signer.signerSecondaryPrivateKey) {
        throw new Error(
          "Signer account has 2FA enabled; set BASIC_PROTOCOL_SIGNER_SECONDARY_PRIVATE_KEY or ERC8004_SIGNER_SECONDARY_PRIVATE_KEY",
        );
      }
      const signerKeyOrDualSigner =
        requiresTwoFactor && signer.signerSecondaryPrivateKey
          ? new DualKeySigner(
              signer.signerPrivateKey,
              signer.signerSecondaryPrivateKey,
            )
          : signer.signerPrivateKey;
      return new Account({
        provider,
        address: signer.signerAddress,
        signer: signerKeyOrDualSigner,
        cairoVersion: signer.signerCairoVersion,
      });
    })());
  const calls = await resolveCalls(input, env, provider);

  // For compound, read staker info before and after to build rich metadata
  let compoundMeta: Record<string, unknown> | undefined;
  if (input.action === "compound" && provider) {
    const stakingContract = resolveStakingContractAddress(input, env);
    try {
      const pre = await readStakerInfo(provider, stakingContract, input.operatorWallet);
      compoundMeta = {
        unclaimed_rewards_wei: pre.unclaimed.toString(),
        compounded_amount_wei: pre.unclaimed.toString(),
        pre_staked_wei: pre.staked.toString(),
        // total_staked_after_wei computed after tx below
      };
    } catch {
      // Non-fatal — metadata is best-effort
    }
  }

  const execution = await account.execute(calls);
  const txHash = resolveTxHash(execution);

  // After compound tx, read final staked amount
  if (compoundMeta && provider) {
    const stakingContract = resolveStakingContractAddress(input, env);
    try {
      const post = await readStakerInfo(provider, stakingContract, input.operatorWallet);
      compoundMeta.total_staked_after_wei = post.staked.toString();
      const rewardWei = BigInt(compoundMeta.compounded_amount_wei as string);
      const divisor = WEI_PER_STRK;
      const whole = rewardWei / divisor;
      const frac = rewardWei % divisor;
      const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "").slice(0, 4);
      compoundMeta.compounded_display = fracStr ? `${whole}.${fracStr}` : whole.toString();
    } catch {
      // Non-fatal
    }
  }

  return {
    provider: "basic-protocol",
    txHashes: [txHash],
    receipt: {
      protocol: input.protocol,
      action: input.action,
      calls_count: calls.length,
      operator_wallet: input.operatorWallet,
      service_wallet: input.serviceWallet,
      mode: "basic",
      tx_hash: txHash,
      ...(compoundMeta || {}),
    },
  };
}
