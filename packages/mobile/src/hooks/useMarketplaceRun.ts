import { useState, useCallback, useRef } from "react";
import { Account, RpcProvider, num } from "starknet";
import {
  createMarketplaceDelegation,
  executeMarketplacePaidRun,
  type ExecuteMarketplacePaidRunPaymentInput,
} from "../lib/marketplaceApi";
import type { AgentRunResponse, SpendAuthorization } from "@cloak-wallet/sdk";
import {
  DEFAULT_RPC,
  STRK_ADDRESS,
  CLOAK_DELEGATION_ADDRESS,
} from "@cloak-wallet/sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RunStep {
  key: string;
  label: string;
  status: "pending" | "running" | "success" | "failed";
  /** tx hash, error message, run id, etc. */
  detail?: string;
}

export interface RunExecuteParams {
  hireId: string;
  agentId: string;
  agentType?: string;
  action: string;
  params?: Record<string, unknown>;
  payerTongoAddress: string;
  token?: string;
}

export type X402PayFn = (
  amount: string,
  recipient: string,
  token?: string,
  /** Base58 Tongo address for shielded transfer mode. */
  recipientBase58?: string,
) => Promise<{
  txHash: string;
  tongoProof: any;
  payerTongoAddress: string;
}>;

/** Wallet keys needed for on-chain delegation multicall. */
export interface OnChainSignerKeys {
  starkPrivateKey: string;
  starkAddress: string;
}

export interface UseMarketplaceRunReturn {
  steps: RunStep[];
  isRunning: boolean;
  currentStep: string | null;
  error: string | null;
  result: AgentRunResponse | null;
  execute: (params: RunExecuteParams) => Promise<void>;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INITIAL_STEPS: RunStep[] = [
  { key: "delegation", label: "Create Delegation", status: "pending" },
  { key: "challenge", label: "Request x402 Challenge", status: "pending" },
  { key: "payment", label: "Pay Agent Fee", status: "pending" },
  { key: "verify", label: "Verify Payment", status: "pending" },
  { key: "execute", label: "Execute Agent Run", status: "pending" },
  { key: "complete", label: "Complete", status: "pending" },
];

/** ERC-20 decimals for supported tokens. */
const TOKEN_DECIMALS: Record<string, number> = {
  STRK: 18,
  ETH: 18,
  USDC: 6,
};

/** Return a fresh copy of the initial steps (avoids shared-reference mutation). */
function freshSteps(): RunStep[] {
  return INITIAL_STEPS.map((s) => ({ ...s }));
}

/** Truncate a hash/id for display: "0x1a2b3c…" */
function truncate(value: string, len = 10): string {
  if (value.length <= len) return value;
  return `${value.slice(0, len)}…`;
}

/** Convert a human-readable token amount (e.g. "10") to wei string. */
function toWei(amount: string, token: string): string {
  const decimals = TOKEN_DECIMALS[token] ?? 18;
  return (BigInt(amount) * 10n ** BigInt(decimals)).toString();
}

/** Split a BigInt into u256 calldata [low, high]. */
function toUint256Calldata(val: bigint): [string, string] {
  const low = val & ((1n << 128n) - 1n);
  const high = val >> 128n;
  return [num.toHex(low), num.toHex(high)];
}

/** Get gas prices from latest block for resource bounds. */
async function getGasPrices(provider: RpcProvider) {
  const block = await provider.getBlockWithTxHashes("latest");
  const l1 = BigInt((block as any).l1_gas_price?.price_in_fri || "0");
  const l1Data = BigInt((block as any).l1_data_gas_price?.price_in_fri || "0");
  const l2 = BigInt((block as any).l2_gas_price?.price_in_fri || "0");
  return { l1, l1Data, l2 };
}

/** Build resource bounds with safety margins for delegation multicall. */
function buildResourceBounds(prices: { l1: bigint; l1Data: bigint; l2: bigint }) {
  return {
    l1_gas: { max_amount: 5000n, max_price_per_unit: prices.l1 * 3n },
    l2_gas: {
      max_amount: 3000000n,
      max_price_per_unit: prices.l2 * 3n || 30000000000n,
    },
    l1_data_gas: {
      max_amount: 3000n,
      max_price_per_unit:
        prices.l1Data > 0n ? prices.l1Data * 3n : prices.l1 * 3n,
    },
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Orchestrates a multi-step marketplace agent run with step-by-step progress.
 *
 * @param x402Pay     Callback that performs the actual x402 payment via the Tongo
 *                    bridge. The hook invokes this when the server presents a
 *                    payment challenge.
 * @param signerKeys  Wallet keys for signing the on-chain delegation multicall.
 *                    When provided, the delegation step creates a real on-chain
 *                    delegation via approve + create_delegation. When absent,
 *                    falls back to the REST-only delegation path.
 */
export function useMarketplaceRun(
  x402Pay: X402PayFn,
  signerKeys?: OnChainSignerKeys | null,
): UseMarketplaceRunReturn {
  const [steps, setSteps] = useState<RunStep[]>(freshSteps);
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgentRunResponse | null>(null);

  // Guard against concurrent executions.
  const runningRef = useRef(false);

  const updateStep = useCallback(
    (key: string, update: Partial<RunStep>) => {
      setSteps((prev) =>
        prev.map((s) => (s.key === key ? { ...s, ...update } : s)),
      );
    },
    [],
  );

  const markCurrentFailed = useCallback(
    (msg: string) => {
      setSteps((prev) =>
        prev.map((s) =>
          s.status === "running"
            ? { ...s, status: "failed" as const, detail: msg }
            : s,
        ),
      );
    },
    [],
  );

  // -----------------------------------------------------------------------
  // execute
  // -----------------------------------------------------------------------

  const execute = useCallback(
    async (params: RunExecuteParams) => {
      if (runningRef.current) {
        console.warn(
          "[useMarketplaceRun] execute called while already running — ignoring",
        );
        return;
      }
      runningRef.current = true;
      setIsRunning(true);
      setError(null);
      setResult(null);
      setSteps(freshSteps());

      try {
        // Step 0 — Create Delegation (on-chain + off-chain registration)
        setCurrentStep("delegation");
        updateStep("delegation", { status: "running" });

        const amount = String(params.params?.amount ?? "25");
        const token = params.token ?? "STRK";
        const amountWei = toWei(amount, token);
        const now = new Date();
        const validUntil = new Date(now.getTime() + 30 * 60 * 1000); // 30 min
        const validFromTs = Math.floor(now.getTime() / 1000) - 60; // 1 min ago for clock skew
        const validUntilTs = Math.floor(validUntil.getTime() / 1000);

        let spendAuth: SpendAuthorization | undefined;
        try {
          let onchainTxHash: string | undefined;
          let onchainDelegationId: string | undefined;

          // ── On-chain delegation multicall ──────────────────────────
          if (signerKeys) {
            const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
            const account = new Account({
              provider,
              address: signerKeys.starkAddress,
              signer: signerKeys.starkPrivateKey,
            });

            const amountBig = BigInt(amountWei);
            const [amountLow, amountHigh] = toUint256Calldata(amountBig);

            // Encode agent_id as felt252 (short string, no Buffer in RN)
            const idBytes = params.agentId.slice(0, 31);
            let hexStr = "";
            for (let i = 0; i < idBytes.length; i++) {
              hexStr += idBytes.charCodeAt(i).toString(16).padStart(2, "0");
            }
            const agentIdFelt = num.toHex(BigInt("0x" + hexStr));

            const calls = [
              // Call 1: STRK.approve(delegation_contract, total_allowance)
              {
                contractAddress: STRK_ADDRESS,
                entrypoint: "approve",
                calldata: [CLOAK_DELEGATION_ADDRESS, amountLow, amountHigh],
              },
              // Call 2: CloakDelegation.create_delegation — felt252 params
              {
                contractAddress: CLOAK_DELEGATION_ADDRESS,
                entrypoint: "create_delegation",
                calldata: [
                  signerKeys.starkAddress,        // operator
                  agentIdFelt,                     // agent_id (felt252)
                  STRK_ADDRESS,                    // token
                  num.toHex(amountBig),            // max_per_run (felt252)
                  num.toHex(amountBig),            // total_allowance (felt252)
                  "0x" + validFromTs.toString(16), // valid_from (u64)
                  "0x" + validUntilTs.toString(16), // valid_until (u64)
                ],
              },
            ];

            const gasPrices = await getGasPrices(provider);
            const resourceBounds = buildResourceBounds(gasPrices);

            const createResult = await account.execute(calls, {
              resourceBounds,
              tip: 0n,
            });

            onchainTxHash =
              typeof createResult === "string"
                ? createResult
                : createResult.transaction_hash ||
                  (createResult as any).transactionHash;

            if (!onchainTxHash) {
              throw new Error("On-chain delegation did not return a tx hash");
            }

            // Wait for confirmation
            const receipt = await provider.waitForTransaction(onchainTxHash);
            if (
              receipt &&
              typeof receipt === "object" &&
              "execution_status" in receipt &&
              (receipt as any).execution_status === "REVERTED"
            ) {
              throw new Error(
                `On-chain delegation reverted: ${(receipt as any).revert_reason || onchainTxHash}`,
              );
            }

            // Get the on-chain delegation ID (sequential counter)
            const countResult = await provider.callContract({
              contractAddress: CLOAK_DELEGATION_ADDRESS,
              entrypoint: "get_delegation_count",
              calldata: [],
            });
            onchainDelegationId = String(Number(countResult[0]));
          }

          // ── Register delegation off-chain via REST API ─────────────
          const delegation = await createMarketplaceDelegation({
            agent_id: params.agentId,
            agent_type: (params.agentType ?? "staking_steward") as any,
            allowed_actions: [params.action],
            token,
            max_per_run: amountWei,
            total_allowance: amountWei,
            valid_from: now.toISOString(),
            valid_until: validUntil.toISOString(),
            onchain_tx_hash: onchainTxHash,
            onchain_delegation_id: onchainDelegationId,
            delegation_contract: signerKeys
              ? CLOAK_DELEGATION_ADDRESS
              : undefined,
          });

          spendAuth = {
            delegation_id: delegation.id,
            onchain_delegation_id: onchainDelegationId,
            run_id: `pre_${Date.now()}`,
            agent_id: params.agentId,
            action: params.action,
            amount: amountWei,
            token,
            expires_at: validUntil.toISOString(),
            nonce: String(delegation.nonce),
          };

          updateStep("delegation", {
            status: "success",
            detail: onchainTxHash
              ? `tx: ${truncate(onchainTxHash)}`
              : `dlg: ${truncate(delegation.id)}`,
          });
        } catch (dlgErr: any) {
          const errMsg = dlgErr?.message ?? "Unknown delegation error";
          console.warn("[useMarketplaceRun] delegation creation failed:", errMsg);

          // 403 = feature disabled on server → skip gracefully.
          // Any other error (401, 500, network) → fail the step visibly
          // but still attempt the run (server will reject if spend_auth is required).
          const is403 = errMsg.includes("403");
          updateStep("delegation", {
            status: is403 ? "success" : "failed",
            detail: is403
              ? "Skipped — delegation not enabled on server"
              : `Failed: ${errMsg}`,
          });
        }

        // Step 1 — Challenge
        setCurrentStep("challenge");
        updateStep("challenge", { status: "running" });

        const runResult = await executeMarketplacePaidRun({
          hireId: params.hireId,
          agentId: params.agentId,
          action: params.action,
          params: params.params,
          payerTongoAddress: params.payerTongoAddress,
          token: params.token,
          spend_authorization: spendAuth,

          x402PaymentExecutor: async (
            paymentInput: ExecuteMarketplacePaidRunPaymentInput,
          ) => {
            // The server responded with a challenge — mark challenge complete.
            updateStep("challenge", { status: "success" });

            // Step 2 — Payment
            setCurrentStep("payment");
            updateStep("payment", { status: "running" });

            // Use shielded transfer (base58) when tongoRecipient is available,
            // otherwise fall back to withdraw (hex Starknet address).
            const tongoRecipient = (paymentInput.challenge as any).tongoRecipient as string | undefined;
            const payResult = await x402Pay(
              paymentInput.amount,
              paymentInput.challenge.recipient,
              undefined, // token — use default
              tongoRecipient, // base58 for shielded transfer
            );

            updateStep("payment", {
              status: "success",
              detail: payResult.txHash
                ? `tx: ${truncate(payResult.txHash)}`
                : undefined,
            });

            // Step 3 — Verify (happens server-side once we return the proof)
            setCurrentStep("verify");
            updateStep("verify", { status: "running" });

            return {
              settlementTxHash: payResult.txHash,
              tongoProof: payResult.tongoProof,
            };
          },
        });

        // Verification + execution completed on the server side.
        updateStep("verify", { status: "success" });

        // Step 4 — Execute
        setCurrentStep("execute");
        updateStep("execute", { status: "running" });

        // Brief pause so the UI can render the "running" state before
        // immediately flipping to success.
        await new Promise<void>((r) => setTimeout(r, 300));

        updateStep("execute", {
          status: "success",
          detail: runResult.id
            ? `run: ${truncate(runResult.id)}`
            : undefined,
        });

        // Step 5 — Complete
        setCurrentStep("complete");
        updateStep("complete", {
          status: "success",
          detail: "Run completed successfully",
        });
        setResult(runResult);
      } catch (err: any) {
        const msg =
          typeof err?.message === "string" ? err.message : "Unknown error";
        setError(msg);
        markCurrentFailed(msg);
      } finally {
        setIsRunning(false);
        setCurrentStep(null);
        runningRef.current = false;
      }
    },
    [x402Pay, signerKeys, updateStep, markCurrentFailed],
  );

  // -----------------------------------------------------------------------
  // reset
  // -----------------------------------------------------------------------

  const reset = useCallback(() => {
    setSteps(freshSteps());
    setIsRunning(false);
    setCurrentStep(null);
    setError(null);
    setResult(null);
    runningRef.current = false;
  }, []);

  return { steps, isRunning, currentStep, error, result, execute, reset };
}
