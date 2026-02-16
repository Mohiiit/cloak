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
  deserializeCalls,
  DualSignSigner,
} from "./twoFactor";
import { isMockMode } from "../testing/runtimeConfig";

const STORAGE_KEY_IS_WARD = "cloak_is_ward";
const STORAGE_KEY_GUARDIAN_ADDR = "cloak_guardian_address";
const STORAGE_KEY_WARD_INFO = "cloak_ward_info_cache";
const STORAGE_KEY_PARTIAL_WARD = "cloak_partial_ward";
const MAX_GAS_RETRIES = 2;
const WARD_STRK_DECIMALS = 18n;
const DEFAULT_WARD_FUNDING_WEI = "0x" + (5n * 10n ** (WARD_STRK_DECIMALS - 1n)).toString(16);

const WARD_CREATION_TOTAL_STEPS = 6;

function formatWeiToStrk(wei: string): string {
  try {
    const value = BigInt(wei);
    const unit = 10n ** WARD_STRK_DECIMALS;
    const whole = value / unit;
    const fraction = value % unit;
    const fractionText = fraction
      .toString()
      .padStart(Number(WARD_STRK_DECIMALS), "0")
      .slice(0, 6)
      .replace(/0+$/, "");
    return fractionText ? `${whole}.${fractionText}` : `${whole}`;
  } catch {
    return "0";
  }
}

function normalizeFundingAmount(wei: string | undefined): string | undefined {
  if (!wei) return undefined;
  const normalized = wei.trim();
  if (!normalized.toLowerCase().startsWith("0x")) {
    throw new Error("Funding amount must be a hex value (0x...)");
  }
  if (!/^0x[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error("Funding amount must be a valid hex value (0x...)");
  }
  const amount = BigInt(normalized);
  if (amount <= 0n) throw new Error("Funding amount must be greater than 0");
  return "0x" + amount.toString(16);
}

function normalizeWardCreationOptions(options?: WardCreationOptions): WardCreationOptions {
  if (!options) return {};
  return {
    pseudoName: options.pseudoName?.trim() || undefined,
    fundingAmountWei: normalizeFundingAmount(options.fundingAmountWei),
  };
}

function getFundingAmountWei(options?: WardCreationOptions): string {
  return normalizeFundingAmount(normalizeWardCreationOptions(options).fundingAmountWei) || DEFAULT_WARD_FUNDING_WEI;
}

function createDeterministicHex(seed: string, length = 64): string {
  let out = "";
  for (let i = 0; out.length < length; i += 1) {
    const charCode = seed.charCodeAt(i % seed.length);
    const mixed = (charCode + i * 13 + seed.length * 29) & 0xff;
    out += mixed.toString(16).padStart(2, "0");
  }
  return `0x${out.slice(0, length)}`;
}

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

export type WardCreationOptions = {
  pseudoName?: string;
  fundingAmountWei?: string;
};

export interface PartialWardState {
  wardAddress: string;
  wardPrivateKey: string;
  wardPublicKey: string;
  guardianPublicKey: string;
  /** Which step failed (4 = funding, 5 = add token, 6 = register) */
  failedAtStep: number;
  pseudoName?: string;
  fundingAmountWei?: string;
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
  createWard: (
    onProgress?: WardCreationProgress,
    options?: WardCreationOptions
  ) => Promise<{
    wardAddress: string;
    wardPrivateKey: string;
    qrPayload: string;
  }>;
  retryPartialWard: (
    onProgress?: WardCreationProgress,
    options?: WardCreationOptions
  ) => Promise<{
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
  const suppressWardPromptIdsRef = useRef<Set<string>>(new Set());

  // ── Check if current wallet is a ward (on-chain) ──

  const checkIfWard = useCallback(async (): Promise<boolean> => {
    if (!wallet.keys?.starkAddress) return false;
    setIsCheckingWard(true);
    try {
      if (isMockMode()) {
        const [cachedFlag, guardianAddr] = await AsyncStorage.multiGet([
          STORAGE_KEY_IS_WARD,
          STORAGE_KEY_GUARDIAN_ADDR,
        ]);
        const isWardAccount = cachedFlag[1] === "true" || !!guardianAddr[1];
        setIsWard(isWardAccount);
        await AsyncStorage.setItem(
          STORAGE_KEY_IS_WARD,
          isWardAccount ? "true" : "false",
        );
        return isWardAccount;
      }

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
      if (isMockMode()) {
        const [cachedGuardian, cachedWardInfo] = await AsyncStorage.multiGet([
          STORAGE_KEY_GUARDIAN_ADDR,
          STORAGE_KEY_WARD_INFO,
        ]);

        if (cachedWardInfo[1]) {
          const parsed = JSON.parse(cachedWardInfo[1]) as WardInfo;
          setWardInfo(parsed);
          wardInfoRef.current = parsed;
          return;
        }

        if (cachedGuardian[1]) {
          const mockInfo: WardInfo = {
            guardianAddress: cachedGuardian[1],
            guardianPublicKey: createDeterministicHex("guardian_pubkey"),
            isGuardian2faEnabled: false,
            is2faEnabled: false,
            isFrozen: false,
            spendingLimitPerTx: "0",
            requireGuardianForAll: true,
          };
          setWardInfo(mockInfo);
          wardInfoRef.current = mockInfo;
          await AsyncStorage.setItem(STORAGE_KEY_WARD_INFO, JSON.stringify(mockInfo));
        }
        return;
      }

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

      // Overlay on-chain frozen state as source-of-truth.
      // Supabase status can be stale if updates fail or devices are out of sync.
      try {
        const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
        const frozenFlags = await Promise.all(
          entries.map(async (w) => {
            try {
              const result = await provider.callContract({
                contractAddress: w.wardAddress,
                entrypoint: "is_frozen",
                calldata: [],
              });
              const v = result?.[0];
              return v !== "0x0" && v !== "0";
            } catch {
              return null;
            }
          }),
        );
        const merged = entries.map((w, idx) => {
          const flag = frozenFlags[idx];
          if (flag === null) return w;
          return { ...w, status: flag ? "frozen" : "active" };
        });
        setWards(merged);
      } catch (err) {
        console.warn("[WardContext] Failed to overlay on-chain frozen flags:", err);
        setWards(entries);
      }
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
    wardOptions: WardCreationOptions,
    startFromStep: number,
    onProgress?: WardCreationProgress,
  ) => {
    const normalizedOptions = normalizeWardCreationOptions(wardOptions);
    const fundingAmountWei = getFundingAmountWei(normalizedOptions);
    const fundingAmountDisplay = formatWeiToStrk(fundingAmountWei);
    // Step 4: Fund ward with 0.5 STRK for gas
    if (startFromStep <= 4) {
      onProgress?.(4, WARD_CREATION_TOTAL_STEPS, `Funding ward with ${fundingAmountDisplay} STRK...`);
      try {
        const fundingAmount = fundingAmountWei;
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
          pseudoName: normalizedOptions.pseudoName,
          fundingAmountWei,
        }));
        setPartialWard({
          wardAddress: paddedWardAddress,
          wardPrivateKey,
          wardPublicKey,
          guardianPublicKey,
          failedAtStep: 4,
          pseudoName: normalizedOptions.pseudoName,
          fundingAmountWei,
        });
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
          pseudoName: normalizedOptions.pseudoName,
          fundingAmountWei,
        }));
        setPartialWard({
          wardAddress: paddedWardAddress,
          wardPrivateKey,
          wardPublicKey,
          guardianPublicKey,
          failedAtStep: 5,
          pseudoName: normalizedOptions.pseudoName,
          fundingAmountWei,
        });
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
          pseudoName: normalizedOptions.pseudoName,
          fundingAmountWei,
        }));
        setPartialWard({
          wardAddress: paddedWardAddress,
          wardPrivateKey,
          wardPublicKey,
          guardianPublicKey,
          failedAtStep: 6,
          pseudoName: normalizedOptions.pseudoName,
          fundingAmountWei,
        });
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
      pseudoName: normalizedOptions.pseudoName,
      initialFundingAmountWei: fundingAmountWei,
    });

    await refreshWards();
    return { wardAddress: paddedWardAddress, wardPrivateKey, qrPayload };
  }, [wallet.keys, refreshWards]);

  const createWard = useCallback(async (onProgress?: WardCreationProgress, options: WardCreationOptions = {}) => {
    const normalizedOptions = normalizeWardCreationOptions(options);
    const fundingAmountWei = getFundingAmountWei(normalizedOptions);
    const fundingAmountDisplay = formatWeiToStrk(fundingAmountWei);
    if (!wallet.keys) throw new Error("No wallet keys");

    if (isMockMode()) {
      const counterRaw = await AsyncStorage.getItem("cloak_mock_ward_counter");
      const counter = Number(counterRaw || "0") + 1;
      await AsyncStorage.setItem("cloak_mock_ward_counter", String(counter));

      const wardPrivateKey = createDeterministicHex(`ward_pk_${counter}`);
      const wardPublicKey = createDeterministicHex(`ward_pub_${counter}`);
      const wardAddress = createDeterministicHex(`ward_addr_${counter}`);
      const guardianPublicKey = wallet.keys.starkPublicKey;

      for (const step of [1, 2, 3, 4, 5, 6]) {
        const stepMessage =
          step === 1
            ? "Generating ward keys..."
            : step === 2
                  ? "Deploying ward contract..."
                  : step === 3
                    ? "Waiting for deployment confirmation..."
                    : step === 4
                      ? `Funding ward with ${fundingAmountDisplay} STRK...`
                      : step === 5
                        ? "Adding STRK as known token..."
                        : "Registering ward in database...";
        onProgress?.(step, WARD_CREATION_TOTAL_STEPS, stepMessage);
      }

      const sb = await getSupabaseLite();
      await sb.insert("ward_configs", {
        ward_address: normalizeAddress(wardAddress),
        guardian_address: normalizeAddress(wallet.keys.starkAddress),
        ward_public_key: wardPublicKey,
        guardian_public_key: guardianPublicKey,
        status: "active",
        require_guardian_for_all: true,
      });

      await AsyncStorage.removeItem(STORAGE_KEY_PARTIAL_WARD);
      setPartialWard(null);

      const qrPayload = JSON.stringify({
        type: "cloak_ward_invite",
        wardAddress,
        wardPrivateKey,
        guardianAddress: wallet.keys.starkAddress,
        network: "sepolia",
        pseudoName: normalizedOptions.pseudoName,
        initialFundingAmountWei: fundingAmountWei,
      });

      await refreshWards();
      return { wardAddress, wardPrivateKey, qrPayload };
    }

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
      wardPrivateKey, wardPublicKey, guardianPublicKey, normalizedOptions,
      4, onProgress,
    );
  }, [wallet.keys, finishWardCreation, refreshWards]);

  /** Retry a partially-created ward from where it left off */
  const retryPartialWard = useCallback(async (onProgress?: WardCreationProgress, options?: WardCreationOptions) => {
    if (!wallet.keys) throw new Error("No wallet keys");
    if (isMockMode()) {
      return createWard(onProgress, options);
    }
    const raw = await AsyncStorage.getItem(STORAGE_KEY_PARTIAL_WARD);
    if (!raw) throw new Error("No partial ward state found");

    const partial: PartialWardState = JSON.parse(raw);
    const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
    const guardianAccount = new Account({
      provider,
      address: wallet.keys.starkAddress,
      signer: wallet.keys.starkPrivateKey,
    });
    const normalizedRetryFunding = getFundingAmountWei({
      ...normalizeWardCreationOptions(options),
      fundingAmountWei: options?.fundingAmountWei || partial.fundingAmountWei,
    });
    const retryFundingDisplay = formatWeiToStrk(normalizedRetryFunding);
    const retryPseudoName = partial.pseudoName || normalizeWardCreationOptions(options).pseudoName;

    // Mark steps 1-3 as already done
    onProgress?.(partial.failedAtStep, WARD_CREATION_TOTAL_STEPS,
      partial.failedAtStep === 4 ? `Retrying: Funding ward with ${retryFundingDisplay} STRK...` :
      partial.failedAtStep === 5 ? "Retrying: Adding STRK as known token..." :
      "Retrying: Registering ward in database...");

    return finishWardCreation(
      provider, guardianAccount, partial.wardAddress,
      partial.wardPrivateKey, partial.wardPublicKey, partial.guardianPublicKey,
      {
        pseudoName: retryPseudoName,
        fundingAmountWei: normalizedRetryFunding,
      },
      partial.failedAtStep, onProgress,
    );
  }, [wallet.keys, finishWardCreation, createWard]);

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
      // Keep Supabase status in sync so guardian UI can reliably show Unfreeze.
      try {
        const sb = await getSupabaseLite();
        await sb.update(
          "ward_configs",
          `ward_address=eq.${normalizeAddress(wardAddress)}`,
          { status: "frozen" },
        );
      } catch (err) {
        console.warn("[WardContext] Failed to update ward status=frozen in Supabase:", err);
      }

      // Optimistic local update (avoids UI flip-flop while refreshWards is in-flight).
      setWards((prev) =>
        prev.map((w) =>
          normalizeAddress(w.wardAddress) === normalizeAddress(wardAddress)
            ? { ...w, status: "frozen" }
            : w,
        ),
      );

      showToast("Ward account frozen", "warning");
      await refreshWards();
    },
    [executeGuardianAction, showToast, refreshWards]
  );

  const unfreezeWard = useCallback(
    async (wardAddress: string) => {
      await executeGuardianAction(wardAddress, "unfreeze", []);
      // Keep Supabase status in sync so guardian UI can reliably show Freeze/Unfreeze.
      try {
        const sb = await getSupabaseLite();
        await sb.update(
          "ward_configs",
          `ward_address=eq.${normalizeAddress(wardAddress)}`,
          { status: "active" },
        );
      } catch (err) {
        console.warn("[WardContext] Failed to update ward status=active in Supabase:", err);
      }

      // Optimistic local update (avoids UI flip-flop while refreshWards is in-flight).
      setWards((prev) =>
        prev.map((w) =>
          normalizeAddress(w.wardAddress) === normalizeAddress(wardAddress)
            ? { ...w, status: "active" }
            : w,
        ),
      );

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
        const filtered = data.filter(
          (row: any) => !suppressWardPromptIdsRef.current.has(row.id),
        );
        setPendingWard2faRequests(filtered);
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
          // Ward on-chain config can change while the app is backgrounded (freeze/2FA/etc).
          // Refresh so Home banner reflects current status without requiring manual pull-to-refresh.
          if (isWard) {
            refreshWardInfo();
          }
        }
        appStateRef.current = nextState;
      },
    );
    return () => subscription.remove();
  }, [fetchWardSignRequests, fetchGuardianRequests, isWard, refreshWardInfo]);

  // ── Ward Approval Actions ──

  const approveAsWard = useCallback(async (request: WardApprovalRequest) => {
    if (!wallet.keys) throw new Error("No wallet keys");
    if (isMockMode()) {
      const sb = await getSupabaseLite();
      const txHash = createDeterministicHex(`ward_tx_${Date.now()}`);
      const updateBody: Record<string, any> = {
        nonce: "1",
        resource_bounds_json: "{}",
        tx_hash: txHash,
        ward_sig_json: JSON.stringify(["0x1", "0x2"]),
        status: request.needs_guardian ? "pending_guardian" : "approved",
        responded_at: new Date().toISOString(),
      };

      if (!request.needs_guardian) {
        updateBody.final_tx_hash = txHash;
      }
      if (request.needs_ward_2fa) {
        updateBody.ward_2fa_sig_json = JSON.stringify(["0x3", "0x4"]);
      }

      await sb.update("ward_approval_requests", `id=eq.${request.id}`, updateBody);
      await fetchWardSignRequests();
      await fetchGuardianRequests();
      showToast(
        request.needs_guardian
          ? "Ward signature submitted"
          : "Ward transaction confirmed",
        "success",
      );
      return;
    }

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
  }, [wallet.keys, fetchWardSignRequests, fetchGuardianRequests, showToast]);

  const approveAsGuardian = useCallback(async (request: WardApprovalRequest) => {
    if (!wallet.keys) throw new Error("No wallet keys");
    if (isMockMode()) {
      const sb = await getSupabaseLite();
      const txHash = createDeterministicHex(`guardian_tx_${Date.now()}`);
      await sb.update("ward_approval_requests", `id=eq.${request.id}`, {
        guardian_sig_json: JSON.stringify(["0x5", "0x6"]),
        guardian_2fa_sig_json: request.needs_guardian_2fa
          ? JSON.stringify(["0x7", "0x8"])
          : null,
        status: "approved",
        final_tx_hash: txHash,
        responded_at: new Date().toISOString(),
      });
      await fetchGuardianRequests();
      showToast("Guardian approval confirmed", "success");
      return;
    }

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
    if (isMockMode()) {
      const sb = await getSupabaseLite();
      const now = new Date();
      const txHash = createDeterministicHex(`mock_ward_request_${now.getTime()}`);
      const requestId = `mock-ward-${now.getTime()}`;
      const secondaryPk = await getSecondaryPrivateKey();
      const needsWard2fa = !!secondaryPk;
      // Ward requests always start at ward-sign stage, independent of 2FA state.
      const status = "pending_ward_sig";
      const guardianAddress =
        wardInfoRef.current?.guardianAddress ||
        (await AsyncStorage.getItem(STORAGE_KEY_GUARDIAN_ADDR)) ||
        wallet.keys.starkAddress;

      await sb.insert("ward_approval_requests", {
        id: requestId,
        ward_address: normalizeAddress(wallet.keys.starkAddress),
        guardian_address: normalizeAddress(guardianAddress),
        action: params.action,
        token: params.token,
        amount: params.amount || null,
        recipient: params.recipient || null,
        calls_json: serializeCalls(params.calls),
        nonce: "1",
        resource_bounds_json: "{}",
        tx_hash: txHash,
        ward_sig_json: "[]",
        ward_2fa_sig_json: null,
        guardian_sig_json: null,
        guardian_2fa_sig_json: null,
        needs_ward_2fa: needsWard2fa,
        needs_guardian: true,
        needs_guardian_2fa: false,
        status,
        final_tx_hash: null,
        error_message: null,
        created_at: now.toISOString(),
        expires_at: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
        responded_at: null,
      });

      await fetchWardSignRequests();
      await fetchGuardianRequests();
      return { approved: true, txHash };
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
    const formattedAmount = formatWardAmount(
      params.amount || null,
      params.token,
      params.action,
    );

    return sdkRequestWardApproval(
      sdkSb,
      {
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
      },
      undefined,
      undefined,
      {
        // Ward txs initiated from THIS mobile app should not bounce back into the
        // ward signing modal when ward 2FA is disabled. We sign immediately and
        // move the request forward to guardian (or submit directly if guardian not needed).
        onRequestCreated: async (request) => {
          if (request.needs_ward_2fa) return;
          suppressWardPromptIdsRef.current.add(request.id);
          try {
            await approveAsWard(request);
          } finally {
            suppressWardPromptIdsRef.current.delete(request.id);
            await fetchWardSignRequests();
          }
        },
      },
    );
  }, [
    wallet.keys?.starkAddress,
    refreshWardInfo,
    fetchWardSignRequests,
    fetchGuardianRequests,
    approveAsWard,
  ]);

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
  }, [
    wallet.isWalletCreated,
    wallet.isDeployed,
    wallet.keys?.starkAddress,
    checkIfWard,
    refreshWardInfo,
    refreshWards,
  ]);

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
