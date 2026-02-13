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
import { useWallet } from "./WalletContext";
import { useToast } from "../components/Toast";
import {
  ApprovalRequest,
  getSupabaseConfig,
  saveSupabaseConfig,
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
} from "./twoFactor";

// ─── Types ───────────────────────────────────────────────────────────────────

type TwoFactorState = {
  isEnabled: boolean;
  isConfigured: boolean;
  hasBiometrics: boolean;
  pendingRequests: ApprovalRequest[];
  secondaryPublicKey: string | null;
  supabaseUrl: string;
  supabaseKey: string;
  isLoading: boolean;

  // Actions
  enable2FA: () => Promise<void>;
  disable2FA: () => Promise<void>;
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
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseKey, setSupabaseKey] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // ── Initialize ──────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        // Load Supabase config
        const config = await getSupabaseConfig();
        setSupabaseUrl(config.url);
        setSupabaseKey(config.key);

        // Check biometrics
        const bioAvail = await isBiometricsAvailable();
        setHasBiometrics(bioAvail);

        // Load secondary key
        const pubKey = await getSecondaryPublicKey();
        setSecondaryPublicKey(pubKey);

        // Check if 2FA is configured on Supabase
        if (wallet.keys?.starkAddress) {
          const { configured } = await isTwoFactorConfigured(
            wallet.keys.starkAddress,
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
        wallet.keys.starkAddress,
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

  const enable2FA = useCallback(async () => {
    if (!wallet.keys?.starkAddress) {
      showToast("No wallet connected", "error");
      return;
    }

    // Biometric gate
    const authed = await promptBiometric("Authenticate to enable 2FA");
    if (!authed) {
      showToast("Biometric authentication failed", "error");
      return;
    }

    try {
      // Generate new secondary key
      const { privateKey, publicKey } = generateSecondaryKey();
      await saveSecondaryPrivateKey(privateKey);

      // Register on Supabase
      const { error } = await enableTwoFactorConfig(
        wallet.keys.starkAddress,
        publicKey,
      );
      if (error) {
        showToast(`Failed to enable 2FA: ${error}`, "error");
        return;
      }

      setSecondaryPublicKey(publicKey);
      setIsConfigured(true);
      setIsEnabled(true);
      showToast("Two-Factor Authentication enabled", "success");
    } catch (e: any) {
      console.warn("[TwoFactorContext] enable2FA error:", e);
      showToast(`Error enabling 2FA: ${e.message}`, "error");
    }
  }, [wallet.keys?.starkAddress, showToast]);

  const disable2FA = useCallback(async () => {
    if (!wallet.keys?.starkAddress) {
      showToast("No wallet connected", "error");
      return;
    }

    // Biometric gate
    const authed = await promptBiometric("Authenticate to disable 2FA");
    if (!authed) {
      showToast("Biometric authentication failed", "error");
      return;
    }

    try {
      const { error } = await disableTwoFactorConfig(
        wallet.keys.starkAddress,
      );
      if (error) {
        showToast(`Failed to disable 2FA: ${error}`, "error");
        return;
      }

      await clearSecondaryKey();
      setSecondaryPublicKey(null);
      setIsConfigured(false);
      setIsEnabled(false);
      setPendingRequests([]);
      showToast("Two-Factor Authentication disabled", "success");
    } catch (e: any) {
      console.warn("[TwoFactorContext] disable2FA error:", e);
      showToast(`Error disabling 2FA: ${e.message}`, "error");
    }
  }, [wallet.keys?.starkAddress, showToast]);

  const refresh = useCallback(async () => {
    await fetchPending();
    if (wallet.keys?.starkAddress) {
      const { configured } = await isTwoFactorConfigured(
        wallet.keys.starkAddress,
      );
      setIsConfigured(configured);
      const pubKey = await getSecondaryPublicKey();
      setSecondaryPublicKey(pubKey);
      setIsEnabled(configured && !!pubKey);
    }
  }, [wallet.keys?.starkAddress, fetchPending]);

  const saveConfig = useCallback(
    async (url: string, key: string) => {
      await saveSupabaseConfig(url, key);
      setSupabaseUrl(url);
      setSupabaseKey(key);
      showToast("Supabase config saved", "success");
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
        supabaseUrl,
        supabaseKey,
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
