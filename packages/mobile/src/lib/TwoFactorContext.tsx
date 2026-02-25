/**
 * TwoFactorContext — React context for 2FA state, polling, and actions.
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
import { Account, RpcProvider } from "starknet";
import {
  DEFAULT_RPC,
  checkIfWardAccount,
  estimateWardInvokeFee,
  buildResourceBoundsFromEstimate,
} from "@cloak-wallet/sdk";
import { useWallet } from "./WalletContext";
import { useToast } from "../components/Toast";
import { isMockMode } from "../testing/runtimeConfig";
import {
  ApprovalRequest,
  getSecondaryPublicKey,
  getSecondaryPrivateKey,
  generateSecondaryKey,
  saveSecondaryPrivateKey,
  clearSecondaryKey,
  isBiometricsAvailable,
  promptBiometric,
  fetchPendingRequests,
  enableTwoFactorConfig,
  disableTwoFactorConfig,
  isTwoFactorConfigured,
  normalizeAddress,
  DualKeySigner,
} from "./twoFactor";
import { getApiConfig, saveApiConfig } from "./apiClient";

// ─── Types ───────────────────────────────────────────────────────────────────

export type TwoFAStep = "idle" | "auth" | "keygen" | "register" | "onchain" | "done" | "error";

type TwoFactorState = {
  isEnabled: boolean;
  isConfigured: boolean;
  hasBiometrics: boolean;
  pendingRequests: ApprovalRequest[];
  secondaryPublicKey: string | null;
  apiUrl: string;
  apiKey: string;
  isLoading: boolean;

  // Actions
  enable2FA: (onStep?: (step: TwoFAStep) => void) => Promise<void>;
  disable2FA: (onStep?: (step: TwoFAStep) => void) => Promise<void>;
  refresh: () => Promise<void>;
  saveConfig: (url: string, key: string) => Promise<void>;
};

const TwoFactorContext = createContext<TwoFactorState | null>(null);

export function useTwoFactor() {
  const ctx = useContext(TwoFactorContext);
  if (!ctx)
    throw new Error("useTwoFactor must be used within TwoFactorProvider");
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 3000;

export function TwoFactorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const wallet = useWallet();
  const { showToast } = useToast();

  const [isEnabled, setIsEnabled] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<ApprovalRequest[]>([]);
  const [secondaryPublicKey, setSecondaryPublicKey] = useState<string | null>(
    null,
  );
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // ── Initialize ──────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        // Load API config
        const config = await getApiConfig();
        setApiUrl(config.url);
        setApiKey(config.key);

        // Check biometrics
        const bioAvail = await isBiometricsAvailable();
        setHasBiometrics(bioAvail);

        // Load secondary key
        const pubKey = await getSecondaryPublicKey();
        setSecondaryPublicKey(pubKey);

        // Check if 2FA is configured via backend API
        if (wallet.keys?.starkAddress) {
          const { configured } = await isTwoFactorConfigured(
            normalizeAddress(wallet.keys.starkAddress),
          );
          setIsConfigured(configured);
          setIsEnabled(configured && !!pubKey);
        }
      } catch (e) {
        console.warn("[TwoFactorContext] Init error:", e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [wallet.keys?.starkAddress]);

  // ── Poll pending requests ──────────────────────────────────────────────

  const fetchPending = useCallback(async () => {
    if (!wallet.keys?.starkAddress || !isEnabled) return;
    try {
      const { data, error } = await fetchPendingRequests(
        normalizeAddress(wallet.keys.starkAddress),
      );
      if (!error && data) {
        setPendingRequests(data);
      }
    } catch (e) {
      // Silent — polling should not interrupt UX
      console.warn("[TwoFactorContext] Poll error:", e);
    }
  }, [wallet.keys?.starkAddress, isEnabled]);

  // Start/stop polling
  useEffect(() => {
    if (!isEnabled || !wallet.keys?.starkAddress) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      setPendingRequests([]);
      return;
    }

    // Initial fetch
    fetchPending();

    // Set up interval
    pollRef.current = setInterval(fetchPending, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isEnabled, wallet.keys?.starkAddress, fetchPending]);

  // Refresh on AppState focus
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (
          appStateRef.current.match(/inactive|background/) &&
          nextState === "active"
        ) {
          fetchPending();
        }
        appStateRef.current = nextState;
      },
    );
    return () => subscription.remove();
  }, [fetchPending]);

  // ── Actions ────────────────────────────────────────────────────────────

  const enable2FA = useCallback(async (onStep?: (step: TwoFAStep) => void) => {
    if (!wallet.keys?.starkAddress) {
      showToast("No wallet connected", "error");
      return;
    }

    // Gate: account must be deployed on-chain
    if (!wallet.isDeployed) {
      showToast("Deploy your account on-chain before enabling 2FA", "error");
      return;
    }

    // Step 1: Biometric authentication
    onStep?.("auth");
    const authed = await promptBiometric("Authenticate to enable 2FA");
    if (!authed) {
      onStep?.("error");
      showToast("Biometric authentication failed", "error");
      return;
    }

    try {
      if (isMockMode()) {
        onStep?.("keygen");
        const { privateKey, publicKey } = generateSecondaryKey();
        await saveSecondaryPrivateKey(privateKey);

        onStep?.("onchain");
        onStep?.("register");
        const { error } = await enableTwoFactorConfig(
          normalizeAddress(wallet.keys.starkAddress),
          publicKey,
        );
        if (error) {
          throw new Error(error);
        }

        onStep?.("done");
        setSecondaryPublicKey(publicKey);
        setIsConfigured(true);
        setIsEnabled(true);
        showToast("Two-Factor Authentication enabled", "success");
        return;
      }

      // Step 2: Generate new secondary key
      onStep?.("keygen");
      const { privateKey, publicKey } = generateSecondaryKey();
      await saveSecondaryPrivateKey(privateKey);

      // Step 3: On-chain set_secondary_key — MUST succeed before backend registration
      onStep?.("onchain");
      const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
      const account = new Account({
        provider,
        address: wallet.keys.starkAddress,
        signer: wallet.keys.starkPrivateKey,
      });

      // Ward accounts need manual resource bounds (estimateInvokeFee fails on CloakWard)
      const isWardAcct = await checkIfWardAccount(provider as any, wallet.keys.starkAddress);
      const enableCalls = [{
        contractAddress: wallet.keys.starkAddress,
        entrypoint: "set_secondary_key",
        calldata: [publicKey],
      }];
      let enableOpts: any = {};
      if (isWardAcct) {
        const estimate = await estimateWardInvokeFee(provider as any, wallet.keys.starkAddress, enableCalls);
        enableOpts = { tip: 0, resourceBounds: buildResourceBoundsFromEstimate(estimate) };
      }

      const tx = await account.execute(enableCalls, enableOpts);
      console.warn("[TwoFactorContext] set_secondary_key tx:", tx.transaction_hash);
      await provider.waitForTransaction(tx.transaction_hash);

      // Step 4: Register on backend (only after on-chain succeeds)
      onStep?.("register");
      const { error } = await enableTwoFactorConfig(
        normalizeAddress(wallet.keys.starkAddress),
        publicKey,
      );
      if (error) {
        // On-chain IS enforcing 2FA, but backend failed — warn but still mark enabled locally
        console.warn("[TwoFactorContext] Backend registration failed (on-chain is active):", error);
        showToast("2FA enabled on-chain, but config sync failed. Retrying may help.", "warning");
      }

      // Step 5: Done
      onStep?.("done");
      setSecondaryPublicKey(publicKey);
      setIsConfigured(true);
      setIsEnabled(true);
      showToast("Two-Factor Authentication enabled", "success");
    } catch (e: any) {
      // On-chain failed or other error — clean up saved key material
      await clearSecondaryKey();
      onStep?.("error");
      console.warn("[TwoFactorContext] enable2FA error:", e);
      showToast(`Error enabling 2FA: ${e.message}`, "error");
    }
  }, [wallet.keys?.starkAddress, wallet.isDeployed, showToast]);

  const disable2FA = useCallback(async (onStep?: (step: TwoFAStep) => void) => {
    if (!wallet.keys?.starkAddress) {
      showToast("No wallet connected", "error");
      return;
    }

    // Biometric gate
    onStep?.("auth");
    const authed = await promptBiometric("Authenticate to disable 2FA");
    if (!authed) {
      onStep?.("error");
      showToast("Biometric authentication failed", "error");
      return;
    }

    try {
      if (isMockMode()) {
        onStep?.("keygen");
        onStep?.("onchain");
        onStep?.("register");
        const { error } = await disableTwoFactorConfig(
          normalizeAddress(wallet.keys.starkAddress),
        );
        if (error) {
          throw new Error(error);
        }
        await clearSecondaryKey();
        setSecondaryPublicKey(null);
        setIsConfigured(false);
        setIsEnabled(false);
        setPendingRequests([]);
        onStep?.("done");
        showToast("Two-Factor Authentication disabled", "success");
        return;
      }

      // Step 1: Retrieve secondary key material
      onStep?.("keygen");
      const secondaryPk = await getSecondaryPrivateKey();

      // Step 2: On-chain remove_secondary_key — MUST succeed before anything else
      onStep?.("onchain");
      const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
      const calls = [{
        contractAddress: wallet.keys.starkAddress,
        entrypoint: "remove_secondary_key",
        calldata: [],
      }];

      // Dynamic estimation with SKIP_VALIDATE:
      // - CloakAccount with 2FA: normal estimateInvokeFee fails (__validate__ expects dual sigs)
      // - CloakWard: normal estimateInvokeFee fails (__execute__ deserialization)
      // SKIP_VALIDATE bypasses __validate__, runs __execute__ for accurate gas measurement
      const estimate = await estimateWardInvokeFee(provider as any, wallet.keys.starkAddress, calls);
      const executeOpts = { tip: 0, resourceBounds: buildResourceBoundsFromEstimate(estimate) };

      let txHash: string;
      if (secondaryPk) {
        // 2FA is active — use DualKeySigner (starknet.js handles hash + signing)
        const dualSigner = new DualKeySigner(
          wallet.keys.starkPrivateKey,
          secondaryPk,
        );
        const dualAccount = new Account({
          provider,
          address: wallet.keys.starkAddress,
          signer: dualSigner,
        });
        const tx = await dualAccount.execute(calls, executeOpts);
        txHash = tx.transaction_hash;
      } else {
        // No secondary key locally — try single-sig (2FA may not be active on-chain)
        const account = new Account({
          provider,
          address: wallet.keys.starkAddress,
          signer: wallet.keys.starkPrivateKey,
        });
        const tx = await account.execute(calls, executeOpts);
        txHash = tx.transaction_hash;
      }

      console.warn("[TwoFactorContext] remove_secondary_key tx:", txHash);
      await provider.waitForTransaction(txHash);

      // Step 2: Backend delete — only after on-chain succeeds
      onStep?.("register");
      const { error } = await disableTwoFactorConfig(
        normalizeAddress(wallet.keys.starkAddress),
      );
      if (error) {
        // On-chain already removed 2FA, but backend failed — warn but proceed with local cleanup
        console.warn("[TwoFactorContext] Backend disable failed (on-chain already removed):", error);
        showToast("2FA removed on-chain, but config sync failed", "warning");
      }

      // Step 3: Clean up local state
      await clearSecondaryKey();
      setSecondaryPublicKey(null);
      setIsConfigured(false);
      setIsEnabled(false);
      setPendingRequests([]);
      onStep?.("done");
      showToast("Two-Factor Authentication disabled", "success");
    } catch (e: any) {
      // On-chain failed — abort entirely, do NOT delete backend config or clear local keys
      onStep?.("error");
      console.warn("[TwoFactorContext] disable2FA error:", e);
      showToast(`Failed to disable 2FA: ${e.message}`, "error");
    }
  }, [wallet.keys?.starkAddress, showToast]);

  const refresh = useCallback(async () => {
    await fetchPending();
    if (wallet.keys?.starkAddress) {
      const { configured } = await isTwoFactorConfigured(
        normalizeAddress(wallet.keys.starkAddress),
      );
      setIsConfigured(configured);
      const pubKey = await getSecondaryPublicKey();
      setSecondaryPublicKey(pubKey);
      setIsEnabled(configured && !!pubKey);
    }
  }, [wallet.keys?.starkAddress, fetchPending]);

  const saveConfig = useCallback(
    async (url: string, key: string) => {
      await saveApiConfig(url, key);
      setApiUrl(url);
      setApiKey(key);
      showToast("API config saved", "success");
    },
    [showToast],
  );

  return (
    <TwoFactorContext.Provider
      value={{
        isEnabled,
        isConfigured,
        hasBiometrics,
        pendingRequests,
        secondaryPublicKey,
        apiUrl,
        apiKey,
        isLoading,
        enable2FA,
        disable2FA,
        refresh,
        saveConfig,
      }}
    >
      {children}
    </TwoFactorContext.Provider>
  );
}
