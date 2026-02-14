/**
 * WardContext — React context for Guardian/Ward relationships.
 *
 * Manages:
 * - Detecting if the current wallet is a ward account (on-chain check)
 * - Guardian's ward list (from Supabase)
 * - Ward info display (read-only settings from on-chain)
 * - Ward creation flow (for guardians)
 * - Ward approval flow (reuses approval_requests infrastructure)
 */
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import { RpcProvider, Account, ec, CallData, hash, num, transaction } from "starknet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  SupabaseLite as SdkSupabaseLite,
  checkIfWardAccount as sdkCheckIfWardAccount,
  fetchWardApprovalNeeds as sdkFetchWardApprovalNeeds,
  fetchWardInfo as sdkFetchWardInfo,
  signHash,
  assembleWardSignature,
  estimateWardInvokeFee,
  buildResourceBoundsFromEstimate,
  parseInsufficientGasError,
  serializeResourceBounds,
  deserializeResourceBounds,
  requestWardApproval as sdkRequestWardApproval,
  serializeCalls,
  formatWardAmount,
  DEFAULT_RPC,
  CLOAK_WARD_CLASS_HASH,
  STRK_ADDRESS,
} from "@cloak-wallet/sdk";
import type {
  WardApprovalResult,
  WardInfo as SdkWardInfo,
  WardApprovalRequest as SdkWardApprovalRequest,
} from "@cloak-wallet/sdk";
import { useWallet } from "./WalletContext";
import { useToast } from "../components/Toast";
import {
  normalizeAddress,
  getSupabaseLite,
  getSupabaseConfig,
  getSecondaryPrivateKey,
  promptBiometric,
  deserializeCalls,
  DualSignSigner,
} from "./twoFactor";

const STORAGE_KEY_IS_WARD = "cloak_is_ward";
const STORAGE_KEY_GUARDIAN_ADDR = "cloak_guardian_address";
const STORAGE_KEY_WARD_INFO = "cloak_ward_info_cache";
const STORAGE_KEY_PARTIAL_WARD = "cloak_partial_ward";
const MAX_GAS_RETRIES = 2;

const WARD_CREATION_TOTAL_STEPS = 6;

// ─── Types ───────────────────────────────────────────────────────────────────

// Re-export SDK types for local use
export type WardInfo = SdkWardInfo;
export type WardApprovalRequest = SdkWardApprovalRequest;

export interface WardEntry {
  wardAddress: string;
  wardPublicKey: string;
  status: string;
  spendingLimitPerTx: string | null;
  requireGuardianForAll: boolean;
}

export type WardCreationProgress = (step: number, total: number, message: string) => void;

export interface PartialWardState {
  wardAddress: string;
  wardPrivateKey: string;
  wardPublicKey: string;
  guardianPublicKey: string;
  /** Which step failed (4 = funding, 5 = add token, 6 = register) */
  failedAtStep: number;
}

type WardContextState = {
  // Is the current wallet a ward account?
  isWard: boolean;
  isCheckingWard: boolean;
  wardInfo: WardInfo | null;

  // Guardian's ward list
  wards: WardEntry[];
  isLoadingWards: boolean;

  // Approval requests
  pendingWard2faRequests: WardApprovalRequest[];
  pendingGuardianRequests: WardApprovalRequest[];

  // Actions
  checkIfWard: () => Promise<boolean>;
  refreshWardInfo: () => Promise<void>;
  refreshWards: () => Promise<void>;
  createWard: (onProgress?: WardCreationProgress) => Promise<{
    wardAddress: string;
    wardPrivateKey: string;
    qrPayload: string;
  }>;
  retryPartialWard: (onProgress?: WardCreationProgress) => Promise<{
    wardAddress: string;
    wardPrivateKey: string;
    qrPayload: string;
  }>;
  clearPartialWard: () => Promise<void>;
  partialWard: PartialWardState | null;
  freezeWard: (wardAddress: string) => Promise<void>;
  unfreezeWard: (wardAddress: string) => Promise<void>;
  setWardSpendingLimit: (
    wardAddress: string,
    limitPerTx: string
  ) => Promise<void>;
  setWardRequireGuardian: (
    wardAddress: string,
    required: boolean
  ) => Promise<void>;
  approveAsWard: (request: WardApprovalRequest) => Promise<void>;
  approveAsGuardian: (request: WardApprovalRequest) => Promise<void>;
  rejectWardRequest: (requestId: string) => Promise<void>;
  initiateWardTransaction: (params: {
    action: string;
    token: string;
    amount?: string;
    recipient?: string;
    calls: any[];
  }) => Promise<WardApprovalResult>;
};

const WardContext = createContext<WardContextState | null>(null);

export function useWardContext() {
  const ctx = useContext(WardContext);
  if (!ctx) throw new Error("useWardContext must be used within WardProvider");
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function WardProvider({ children }: { children: React.ReactNode }) {
  const wallet = useWallet();
  const { showToast } = useToast();

  const [isWard, setIsWard] = useState(false);
  const [isCheckingWard, setIsCheckingWard] = useState(false);
  const [wardInfo, setWardInfo] = useState<WardInfo | null>(null);
  const [wards, setWards] = useState<WardEntry[]>([]);
  const [isLoadingWards, setIsLoadingWards] = useState(false);
  const [pendingWard2faRequests, setPendingWard2faRequests] = useState<WardApprovalRequest[]>([]);
  const [pendingGuardianRequests, setPendingGuardianRequests] = useState<WardApprovalRequest[]>([]);
  const [partialWard, setPartialWard] = useState<PartialWardState | null>(null);

  const wardPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const guardianPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // ── Check if current wallet is a ward (on-chain) ──

  const checkIfWard = useCallback(async (): Promise<boolean> => {
    if (!wallet.keys?.starkAddress) return false;
    setIsCheckingWard(true);
    try {
      const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
      const isWardAccount = await sdkCheckIfWardAccount(provider as any, wallet.keys.starkAddress);
      setIsWard(isWardAccount);
      await AsyncStorage.setItem(STORAGE_KEY_IS_WARD, isWardAccount ? "true" : "false");
      return isWardAccount;
    } catch {
      setIsWard(false);
      await AsyncStorage.setItem(STORAGE_KEY_IS_WARD, "false");
      return false;
    } finally {
      setIsCheckingWard(false);
    }
  }, [wallet.keys?.starkAddress]);

  // ── Read ward info from on-chain (for ward accounts) ──

  const wardInfoRef = useRef<WardInfo | null>(null);

  const refreshWardInfo = useCallback(async () => {
    if (!wallet.keys?.starkAddress) return;
    try {
      const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
      const info = await sdkFetchWardInfo(provider as any, wallet.keys.starkAddress);
      if (info) {
        setWardInfo(info);
        wardInfoRef.current = info;
        await AsyncStorage.setItem(STORAGE_KEY_GUARDIAN_ADDR, info.guardianAddress);
        await AsyncStorage.setItem(STORAGE_KEY_WARD_INFO, JSON.stringify(info));
      }
    } catch (err) {
      console.warn("[WardContext] Failed to read ward info:", err);
    }
  }, [wallet.keys?.starkAddress]);

  // ── Load guardian's ward list from Supabase ──

  const refreshWards = useCallback(async () => {
    if (!wallet.keys?.starkAddress) return;
    setIsLoadingWards(true);
    try {
      const sb = await getSupabaseLite();
      const normalizedAddr = normalizeAddress(wallet.keys.starkAddress);
      const data = await sb.select(
        "ward_configs",
        `guardian_address=eq.${normalizedAddr}&status=neq.removed&order=created_at.desc`
      );
      const entries: WardEntry[] = (data || []).map((r: any) => ({
        wardAddress: r.ward_address,
        wardPublicKey: r.ward_public_key,
        status: r.status,
        spendingLimitPerTx: r.spending_limit_per_tx,
        requireGuardianForAll: r.require_guardian_for_all ?? true,
      }));
      setWards(entries);
    } catch (err) {
      console.warn("[WardContext] Failed to load wards:", err);
    } finally {
      setIsLoadingWards(false);
    }
  }, [wallet.keys?.starkAddress]);

  // ── Create a new ward (guardian action) ──

  /** Complete the post-deploy steps (fund, add token, register) for a ward */
  const finishWardCreation = useCallback(async (
    provider: RpcProvider,
    guardianAccount: Account,
    paddedWardAddress: string,
    wardPrivateKey: string,
    wardPublicKey: string,
    guardianPublicKey: string,
    startFromStep: number,
    onProgress?: WardCreationProgress,
  ) => {
    // Step 4: Fund ward with 0.5 STRK for gas
    if (startFromStep <= 4) {
      onProgress?.(4, WARD_CREATION_TOTAL_STEPS, "Funding ward with 0.5 STRK...");
      try {
        const fundingAmount = "0x" + (5n * 10n ** 17n).toString(16);
        const fundTx = await guardianAccount.execute([
          {
            contractAddress: STRK_ADDRESS,
            entrypoint: "transfer",
            calldata: [paddedWardAddress, fundingAmount, "0x0"],
          },
        ]);
        await provider.waitForTransaction(fundTx.transaction_hash);
      } catch (err) {
        await AsyncStorage.setItem(STORAGE_KEY_PARTIAL_WARD, JSON.stringify({
          wardAddress: paddedWardAddress,
          wardPrivateKey,
          wardPublicKey,
          guardianPublicKey,
          failedAtStep: 4,
        }));
        setPartialWard({ wardAddress: paddedWardAddress, wardPrivateKey, wardPublicKey, guardianPublicKey, failedAtStep: 4 });
        throw err;
      }
    }

    // Step 5: Add STRK as known token
    if (startFromStep <= 5) {
      onProgress?.(5, WARD_CREATION_TOTAL_STEPS, "Adding STRK as known token...");
      try {
        const addTokenTx = await guardianAccount.execute([
          {
            contractAddress: paddedWardAddress,
            entrypoint: "add_known_token",
            calldata: [STRK_ADDRESS],
          },
        ]);
        await provider.waitForTransaction(addTokenTx.transaction_hash);
      } catch (err) {
        await AsyncStorage.setItem(STORAGE_KEY_PARTIAL_WARD, JSON.stringify({
          wardAddress: paddedWardAddress,
          wardPrivateKey,
          wardPublicKey,
          guardianPublicKey,
          failedAtStep: 5,
        }));
        setPartialWard({ wardAddress: paddedWardAddress, wardPrivateKey, wardPublicKey, guardianPublicKey, failedAtStep: 5 });
        throw err;
      }
    }

    // Step 6: Register in Supabase
    if (startFromStep <= 6) {
      onProgress?.(6, WARD_CREATION_TOTAL_STEPS, "Registering ward in database...");
      try {
        const sb = await getSupabaseLite();
        await sb.insert("ward_configs", {
          ward_address: normalizeAddress(paddedWardAddress),
          guardian_address: normalizeAddress(wallet.keys!.starkAddress),
          ward_public_key: wardPublicKey,
          guardian_public_key: guardianPublicKey,
          status: "active",
          require_guardian_for_all: true,
        });
      } catch (err) {
        await AsyncStorage.setItem(STORAGE_KEY_PARTIAL_WARD, JSON.stringify({
          wardAddress: paddedWardAddress,
          wardPrivateKey,
          wardPublicKey,
          guardianPublicKey,
          failedAtStep: 6,
        }));
        setPartialWard({ wardAddress: paddedWardAddress, wardPrivateKey, wardPublicKey, guardianPublicKey, failedAtStep: 6 });
        throw err;
      }
    }

    // All done — clear partial state
    await AsyncStorage.removeItem(STORAGE_KEY_PARTIAL_WARD);
    setPartialWard(null);

    // Generate QR payload
    const qrPayload = JSON.stringify({
      type: "cloak_ward_invite",
      wardAddress: paddedWardAddress,
      wardPrivateKey,
      guardianAddress: wallet.keys!.starkAddress,
      network: "sepolia",
    });

    await refreshWards();
    return { wardAddress: paddedWardAddress, wardPrivateKey, qrPayload };
  }, [wallet.keys, refreshWards]);

  const createWard = useCallback(async (onProgress?: WardCreationProgress) => {
    if (!wallet.keys) throw new Error("No wallet keys");

    const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });

    // Step 1: Generate ward keypair
    onProgress?.(1, WARD_CREATION_TOTAL_STEPS, "Generating ward keys...");
    const wardPrivateKeyBytes = ec.starkCurve.utils.randomPrivateKey();
    const wardPrivateKey =
      "0x" +
      Array.from(wardPrivateKeyBytes)
        .map((b: number) => b.toString(16).padStart(2, "0"))
        .join("");
    const wardPublicKey = ec.starkCurve.getStarkKey(wardPrivateKey);
    const guardianPublicKey = wallet.keys.starkPublicKey;

    // Step 2: Deploy CloakWard via UDC
    onProgress?.(2, WARD_CREATION_TOTAL_STEPS, "Deploying ward contract...");
    const guardianAccount = new Account({
      provider,
      address: wallet.keys.starkAddress,
      signer: wallet.keys.starkPrivateKey,
    });

    const constructorCalldata = CallData.compile({
      public_key: wardPublicKey,
      guardian_address: wallet.keys.starkAddress,
      guardian_public_key: guardianPublicKey,
    });

    const deployResult = await guardianAccount.deploy({
      classHash: CLOAK_WARD_CLASS_HASH,
      constructorCalldata,
      salt: wardPublicKey,
      unique: true,
    });

    // Step 3: Wait for deployment confirmation
    onProgress?.(3, WARD_CREATION_TOTAL_STEPS, "Waiting for deployment confirmation...");
    await provider.waitForTransaction(deployResult.transaction_hash);

    const wardAddress =
      deployResult.contract_address && deployResult.contract_address.length > 0
        ? deployResult.contract_address[0]
        : null;

    if (!wardAddress) throw new Error("Failed to get ward address from deploy");

    const paddedWardAddress =
      "0x" + wardAddress.replace(/^0x/, "").padStart(64, "0");

    // Steps 4-6: Fund, add token, register (with recovery)
    return finishWardCreation(
      provider, guardianAccount, paddedWardAddress,
      wardPrivateKey, wardPublicKey, guardianPublicKey,
      4, onProgress,
    );
  }, [wallet.keys, finishWardCreation]);

  /** Retry a partially-created ward from where it left off */
  const retryPartialWard = useCallback(async (onProgress?: WardCreationProgress) => {
    if (!wallet.keys) throw new Error("No wallet keys");
    const raw = await AsyncStorage.getItem(STORAGE_KEY_PARTIAL_WARD);
    if (!raw) throw new Error("No partial ward state found");

    const partial: PartialWardState = JSON.parse(raw);
    const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
    const guardianAccount = new Account({
      provider,
      address: wallet.keys.starkAddress,
      signer: wallet.keys.starkPrivateKey,
    });

    // Mark steps 1-3 as already done
    onProgress?.(partial.failedAtStep, WARD_CREATION_TOTAL_STEPS,
      partial.failedAtStep === 4 ? "Retrying: Funding ward with 0.5 STRK..." :
      partial.failedAtStep === 5 ? "Retrying: Adding STRK as known token..." :
      "Retrying: Registering ward in database...");

    return finishWardCreation(
      provider, guardianAccount, partial.wardAddress,
      partial.wardPrivateKey, partial.wardPublicKey, partial.guardianPublicKey,
      partial.failedAtStep, onProgress,
    );
  }, [wallet.keys, finishWardCreation]);

  const clearPartialWard = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY_PARTIAL_WARD);
    setPartialWard(null);
  }, []);

  // ── Guardian actions on ward contracts ──

  const executeGuardianAction = useCallback(
    async (wardAddress: string, entrypoint: string, calldata: string[]) => {
      if (!wallet.keys) throw new Error("No wallet keys");
      const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
      const guardianAccount = new Account({
        provider,
        address: wallet.keys.starkAddress,
        signer: wallet.keys.starkPrivateKey,
      });
      const tx = await guardianAccount.execute([
        { contractAddress: wardAddress, entrypoint, calldata },
      ]);
      await provider.waitForTransaction(tx.transaction_hash);
      return tx.transaction_hash;
    },
    [wallet.keys]
  );

  const freezeWard = useCallback(
    async (wardAddress: string) => {
      await executeGuardianAction(wardAddress, "freeze", []);
      showToast("Ward account frozen", "warning");
      await refreshWards();
    },
    [executeGuardianAction, showToast, refreshWards]
  );

  const unfreezeWard = useCallback(
    async (wardAddress: string) => {
      await executeGuardianAction(wardAddress, "unfreeze", []);
      showToast("Ward account unfrozen", "success");
      await refreshWards();
    },
    [executeGuardianAction, showToast, refreshWards]
  );

  const setWardSpendingLimit = useCallback(
    async (wardAddress: string, limitPerTx: string) => {
      await executeGuardianAction(wardAddress, "set_spending_limit", [
        limitPerTx,
      ]);
      // Update Supabase
      try {
        const sb = await getSupabaseLite();
        await sb.update(
          "ward_configs",
          `ward_address=eq.${normalizeAddress(wardAddress)}`,
          { spending_limit_per_tx: limitPerTx }
        );
      } catch {
        // Non-critical
      }
      showToast("Spending limit updated", "success");
    },
    [executeGuardianAction, showToast]
  );

  const setWardRequireGuardian = useCallback(
    async (wardAddress: string, required: boolean) => {
      await executeGuardianAction(
        wardAddress,
        "set_require_guardian_for_all",
        [required ? "0x1" : "0x0"]
      );
      // Update Supabase
      try {
        const sb = await getSupabaseLite();
        await sb.update(
          "ward_configs",
          `ward_address=eq.${normalizeAddress(wardAddress)}`,
          { require_guardian_for_all: required }
        );
      } catch {
        // Non-critical
      }
      showToast(
        required ? "Guardian required for all txs" : "Guardian only above limit",
        "success"
      );
      await refreshWards();
    },
    [executeGuardianAction, showToast, refreshWards]
  );

  // signHash and assembleWardSignature are imported from @cloak-wallet/sdk

  // ── Poll ward signing requests ──
  // Ward mobile polls for pending_ward_sig (always) — every ward tx starts here.
  // The ward mobile computes nonce/fees/txHash, signs with ward key (+2FA if enabled).

  const fetchWardSignRequests = useCallback(async () => {
    if (!wallet.keys?.starkAddress || !isWard) return;
    try {
      const sb = await getSupabaseLite();
      const myAddr = normalizeAddress(wallet.keys.starkAddress);
      const now = new Date().toISOString();
      const data = await sb.select(
        "ward_approval_requests",
        `ward_address=eq.${myAddr}&status=eq.pending_ward_sig&expires_at=gt.${now}&order=created_at.desc`,
      );
      if (data) {
        setPendingWard2faRequests(data);
      }
    } catch (e) {
      console.warn("[WardContext] Ward sign poll error:", e);
    }
  }, [wallet.keys?.starkAddress, isWard]);

  const fetchGuardianRequests = useCallback(async () => {
    if (!wallet.keys?.starkAddress || isWard || wards.length === 0) return;
    try {
      const sb = await getSupabaseLite();
      const myAddr = normalizeAddress(wallet.keys.starkAddress);
      const now = new Date().toISOString();
      const data = await sb.select(
        "ward_approval_requests",
        `guardian_address=eq.${myAddr}&status=eq.pending_guardian&expires_at=gt.${now}&order=created_at.desc`,
      );
      if (data) {
        setPendingGuardianRequests(data);
      }
    } catch (e) {
      console.warn("[WardContext] Guardian poll error:", e);
    }
  }, [wallet.keys?.starkAddress, isWard, wards.length]);

  // Ward signing polling — always poll when device is a ward
  useEffect(() => {
    if (!isWard || !wallet.keys?.starkAddress) {
      if (wardPollRef.current) {
        clearInterval(wardPollRef.current);
        wardPollRef.current = null;
      }
      setPendingWard2faRequests([]);
      return;
    }
    fetchWardSignRequests();
    wardPollRef.current = setInterval(fetchWardSignRequests, 3000);
    return () => {
      if (wardPollRef.current) {
        clearInterval(wardPollRef.current);
        wardPollRef.current = null;
      }
    };
  }, [isWard, wallet.keys?.starkAddress, fetchWardSignRequests]);

  // Guardian polling
  useEffect(() => {
    if (isWard || wards.length === 0 || !wallet.keys?.starkAddress) {
      if (guardianPollRef.current) {
        clearInterval(guardianPollRef.current);
        guardianPollRef.current = null;
      }
      setPendingGuardianRequests([]);
      return;
    }
    fetchGuardianRequests();
    guardianPollRef.current = setInterval(fetchGuardianRequests, 3000);
    return () => {
      if (guardianPollRef.current) {
        clearInterval(guardianPollRef.current);
        guardianPollRef.current = null;
      }
    };
  }, [isWard, wards.length, wallet.keys?.starkAddress, fetchGuardianRequests]);

  // Refresh on AppState focus
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (
          appStateRef.current.match(/inactive|background/) &&
          nextState === "active"
        ) {
          fetchWardSignRequests();
          fetchGuardianRequests();
        }
        appStateRef.current = nextState;
      },
    );
    return () => subscription.remove();
  }, [fetchWardSignRequests, fetchGuardianRequests]);

  // ── Ward Approval Actions ──

  const approveAsWard = useCallback(async (request: WardApprovalRequest) => {
    if (!wallet.keys) throw new Error("No wallet keys");

    const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
    const calls = deserializeCalls(request.calls_json);
    const wardPk = wallet.keys.starkPrivateKey;

    // Get 2FA key upfront (before retry loop) so we only prompt biometrics once
    let secondaryPk: string | null = null;
    if (request.needs_ward_2fa) {
      secondaryPk = await getSecondaryPrivateKey();
      if (!secondaryPk) throw new Error("Ward 2FA key not found");
    }

    const sb = await getSupabaseLite();
    const chainId = await provider.getChainId();
    let safetyMultiplier = 1.5;

    for (let attempt = 0; attempt <= MAX_GAS_RETRIES; attempt++) {
      // 1. Dynamic fee estimation with SKIP_VALIDATE
      const estimate = await estimateWardInvokeFee(provider as any, request.ward_address, calls);
      const resourceBounds = buildResourceBoundsFromEstimate(estimate, safetyMultiplier);

      // 2. Get nonce from chain (fresh each attempt — nonce doesn't change if tx wasn't sent)
      const nonce = await provider.getNonceForAddress(request.ward_address);

      // 3. Compute invoke v3 tx hash
      const compiledCalldata = transaction.getExecuteCalldata(calls, "1");
      const txHash = num.toHex(hash.calculateInvokeTransactionHash({
        senderAddress: request.ward_address,
        version: "0x3",
        compiledCalldata,
        chainId,
        nonce,
        accountDeploymentData: [],
        nonceDataAvailabilityMode: 0,
        feeDataAvailabilityMode: 0,
        resourceBounds,
        tip: 0,
        paymasterData: [],
      }));

      // 4. Sign with ward primary key
      const wardSig = signHash(txHash, wardPk);

      // 5. Sign with ward 2FA key if needed
      let ward2faSig: [string, string] | undefined;
      if (secondaryPk) {
        ward2faSig = signHash(txHash, secondaryPk);
      }

      // Serialize resource bounds (BigInt → hex strings) via SDK
      const rbJson = serializeResourceBounds(resourceBounds);

      if (!request.needs_guardian) {
        // Ward can finalize and submit on-chain
        const fullSig = [...wardSig];
        if (ward2faSig) fullSig.push(...ward2faSig);

        const account = new Account({
          provider,
          address: request.ward_address,
          signer: new DualSignSigner(fullSig),
        });

        try {
          const txResponse = await account.execute(calls, { nonce, resourceBounds, tip: 0 });

          // Wait for on-chain confirmation and check for revert
          const receipt = await provider.waitForTransaction(txResponse.transaction_hash);
          if ((receipt as any).execution_status === "REVERTED") {
            const revertReason = (receipt as any).revert_reason || "Transaction reverted on-chain";
            await sb.update("ward_approval_requests", `id=eq.${request.id}`, {
              status: "failed",
              error_message: revertReason,
              final_tx_hash: txResponse.transaction_hash,
              responded_at: new Date().toISOString(),
            });
            throw new Error(`Transaction reverted: ${revertReason}`);
          }

          await sb.update("ward_approval_requests", `id=eq.${request.id}`, {
            nonce: nonce.toString(),
            resource_bounds_json: rbJson,
            tx_hash: txHash,
            ward_sig_json: JSON.stringify(wardSig),
            ward_2fa_sig_json: ward2faSig ? JSON.stringify(ward2faSig) : null,
            status: "approved",
            final_tx_hash: txResponse.transaction_hash,
            responded_at: new Date().toISOString(),
          });

          await fetchWardSignRequests();
          showToast("Ward transaction confirmed on-chain", "success");
          return;
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          const gasInfo = parseInsufficientGasError(errMsg);
          if (gasInfo && attempt < MAX_GAS_RETRIES) {
            safetyMultiplier = gasInfo.suggestedMultiplier;
            showToast(
              `Gas too low (used ${gasInfo.actualUsed}, had ${gasInfo.maxAmount}). Re-estimating...`,
              "warning",
            );
            continue;
          }
          throw err;
        }
      } else {
        // Needs guardian — save sigs + computed values, advance to pending_guardian
        const updateBody: any = {
          nonce: nonce.toString(),
          resource_bounds_json: rbJson,
          tx_hash: txHash,
          ward_sig_json: JSON.stringify(wardSig),
          status: "pending_guardian",
          responded_at: new Date().toISOString(),
        };
        if (ward2faSig) {
          updateBody.ward_2fa_sig_json = JSON.stringify(ward2faSig);
        }
        await sb.update("ward_approval_requests", `id=eq.${request.id}`, updateBody);

        await fetchWardSignRequests();
        showToast("Ward signature submitted", "success");
        return;
      }
    }

    throw new Error("Max gas retries exceeded");
  }, [wallet.keys, fetchWardSignRequests, showToast]);

  const approveAsGuardian = useCallback(async (request: WardApprovalRequest) => {
    if (!wallet.keys) throw new Error("No wallet keys");

    const guardianSig = signHash(request.tx_hash, wallet.keys.starkPrivateKey);

    let guardian2faSig: [string, string] | undefined;
    if (request.needs_guardian_2fa) {
      const secondaryPk = await getSecondaryPrivateKey();
      if (!secondaryPk) throw new Error("Guardian secondary key not found");
      guardian2faSig = signHash(request.tx_hash, secondaryPk);
    }

    const fullSig = assembleWardSignature(request, guardianSig, guardian2faSig);

    const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
    const account = new Account({
      provider,
      address: request.ward_address,
      signer: new DualSignSigner(fullSig),
    });

    const calls = deserializeCalls(request.calls_json);

    // Parse resource bounds via SDK (hex strings → BigInt)
    const resourceBounds = deserializeResourceBounds(request.resource_bounds_json);

    const sb = await getSupabaseLite();

    try {
      const txResponse = await account.execute(calls, {
        nonce: request.nonce,
        resourceBounds,
        tip: 0,
      });

      // Wait for on-chain confirmation and check for revert
      const receipt = await provider.waitForTransaction(txResponse.transaction_hash);
      if ((receipt as any).execution_status === "REVERTED") {
        const revertReason = (receipt as any).revert_reason || "Transaction reverted on-chain";
        await sb.update("ward_approval_requests", `id=eq.${request.id}`, {
          guardian_sig_json: JSON.stringify(guardianSig),
          guardian_2fa_sig_json: guardian2faSig ? JSON.stringify(guardian2faSig) : null,
          status: "failed",
          error_message: revertReason,
          final_tx_hash: txResponse.transaction_hash,
          responded_at: new Date().toISOString(),
        });
        await fetchGuardianRequests();
        throw new Error(`Transaction reverted: ${revertReason}`);
      }

      const updateBody: any = {
        guardian_sig_json: JSON.stringify(guardianSig),
        status: "approved",
        final_tx_hash: txResponse.transaction_hash,
        responded_at: new Date().toISOString(),
      };
      if (guardian2faSig) {
        updateBody.guardian_2fa_sig_json = JSON.stringify(guardian2faSig);
      }
      await sb.update("ward_approval_requests", `id=eq.${request.id}`, updateBody);

      await fetchGuardianRequests();
      showToast("Guardian approval confirmed on-chain", "success");
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const gasInfo = parseInsufficientGasError(errMsg);

      if (gasInfo) {
        // Gas error — set status to gas_error so the extension can auto-retry
        await sb.update("ward_approval_requests", `id=eq.${request.id}`, {
          guardian_sig_json: JSON.stringify(guardianSig),
          guardian_2fa_sig_json: guardian2faSig ? JSON.stringify(guardian2faSig) : null,
          status: "gas_error",
          error_message: errMsg,
          responded_at: new Date().toISOString(),
        });

        await fetchGuardianRequests();
        showToast(
          `Gas too low (used ${gasInfo.actualUsed}, had ${gasInfo.maxAmount}). Extension will retry automatically.`,
          "warning",
        );
        return;
      }

      // Non-gas error — mark as failed (if not already marked by revert check)
      if (!errMsg.includes("Transaction reverted:")) {
        await sb.update("ward_approval_requests", `id=eq.${request.id}`, {
          status: "failed",
          error_message: errMsg,
          responded_at: new Date().toISOString(),
        });
      }

      await fetchGuardianRequests();
      throw err;
    }
  }, [wallet.keys, fetchGuardianRequests, showToast]);

  // ── Initiate a ward transaction (for ward users on mobile) ──
  // Inserts a request into Supabase, then polls for completion.
  // The WardApprovalModal auto-detects pending_ward_sig and prompts the user.

  const initiateWardTransaction = useCallback(async (params: {
    action: string;
    token: string;
    amount?: string;
    recipient?: string;
    calls: any[];
  }): Promise<WardApprovalResult> => {
    if (!wallet.keys?.starkAddress) {
      throw new Error("No wallet connected");
    }
    // Auto-refresh wardInfo if not yet loaded (race condition fix)
    if (!wardInfoRef.current) {
      await refreshWardInfo();
    }
    if (!wardInfoRef.current) {
      throw new Error("Ward info not loaded — please try again");
    }

    const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });

    // Read ward on-chain config
    const needs = await sdkFetchWardApprovalNeeds(provider as any, wallet.keys.starkAddress);
    if (!needs) throw new Error("Failed to read ward config from chain");

    // Serialize calls for Supabase
    const callsJson = serializeCalls(params.calls);

    // Construct SDK SupabaseLite from mobile's stored config
    const { url, key } = await getSupabaseConfig();
    const sdkSb = new SdkSupabaseLite(url, key);

    // Format amount for human-readable display on guardian side
    const formattedAmount = formatWardAmount(params.amount || null, params.token, params.action);

    return sdkRequestWardApproval(sdkSb, {
      wardAddress: wallet.keys.starkAddress,
      guardianAddress: needs.guardianAddress,
      action: params.action,
      token: params.token,
      amount: formattedAmount,
      recipient: params.recipient || null,
      callsJson,
      wardSigJson: "[]",
      nonce: "",
      resourceBoundsJson: "{}",
      txHash: "",
      needsWard2fa: needs.wardHas2fa,
      needsGuardian: needs.needsGuardian,
      needsGuardian2fa: needs.guardianHas2fa,
    });
  }, [wallet.keys?.starkAddress, refreshWardInfo]);

  const rejectWardRequest = useCallback(async (requestId: string) => {
    const sb = await getSupabaseLite();
    await sb.update("ward_approval_requests", `id=eq.${requestId}`, {
      status: "rejected",
      responded_at: new Date().toISOString(),
    });
    await fetchWardSignRequests();
    await fetchGuardianRequests();
    showToast("Request rejected", "info");
  }, [fetchWardSignRequests, fetchGuardianRequests, showToast]);

  // ── Auto-check on wallet load ──

  useEffect(() => {
    if (wallet.isWalletCreated && wallet.isDeployed && wallet.keys?.starkAddress) {
      // Restore cached wardInfo for instant UI
      AsyncStorage.getItem(STORAGE_KEY_IS_WARD).then((cached) => {
        if (cached === "true") {
          setIsWard(true);
          // Also restore cached wardInfo
          AsyncStorage.getItem(STORAGE_KEY_WARD_INFO).then((infoJson) => {
            if (infoJson) {
              try {
                const info = JSON.parse(infoJson) as WardInfo;
                setWardInfo(info);
                wardInfoRef.current = info;
              } catch {}
            }
          });
        }
      });
      // Restore partial ward state if any
      AsyncStorage.getItem(STORAGE_KEY_PARTIAL_WARD).then((raw) => {
        if (raw) {
          try {
            setPartialWard(JSON.parse(raw));
          } catch {}
        }
      });
      // Then verify on-chain and refresh
      checkIfWard().then(async (result) => {
        if (result) await refreshWardInfo();
      });
      // Also load wards (in case this is a guardian)
      refreshWards();
    }
  }, [wallet.isWalletCreated, wallet.isDeployed, wallet.keys?.starkAddress]);

  return (
    <WardContext.Provider
      value={{
        isWard,
        isCheckingWard,
        wardInfo,
        wards,
        isLoadingWards,
        pendingWard2faRequests,
        pendingGuardianRequests,
        checkIfWard,
        refreshWardInfo,
        refreshWards,
        createWard,
        retryPartialWard,
        clearPartialWard,
        partialWard,
        freezeWard,
        unfreezeWard,
        setWardSpendingLimit,
        setWardRequireGuardian,
        approveAsWard,
        approveAsGuardian,
        rejectWardRequest,
        initiateWardTransaction,
      }}
    >
      {children}
    </WardContext.Provider>
  );
}
