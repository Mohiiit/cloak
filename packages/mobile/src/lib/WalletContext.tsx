/**
 * WalletContext — Global wallet state for the app.
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useTongoBridge } from "../bridge/useTongoBridge";
import { WalletKeys, loadWalletKeys, saveWalletKeys, hasWallet } from "./keys";
import { TokenKey, TOKENS } from "./tokens";
import { useToast } from "../components/Toast";

const ALL_TOKENS: TokenKey[] = ["STRK", "ETH", "USDC"];

type WalletState = {
  // Status
  isLoading: boolean;
  isWalletCreated: boolean;
  isBridgeReady: boolean;
  isInitialized: boolean;

  // Keys
  keys: WalletKeys | null;

  // Token
  selectedToken: TokenKey;
  setSelectedToken: (token: TokenKey) => void;

  // Balance (single-token, backward compat)
  balance: string;
  pending: string;
  nonce: string;
  erc20Balance: string;
  isRefreshing: boolean;

  // Multi-token balances
  erc20Balances: Record<TokenKey, string>;
  tongoBalances: Record<TokenKey, { balance: string; pending: string }>;

  // Tx history
  txHistory: any[];
  refreshTxHistory: () => Promise<void>;

  // Actions
  createWallet: () => Promise<WalletKeys>;
  importWallet: (starkPrivateKey: string, starkAddress: string) => Promise<WalletKeys>;
  refreshBalance: () => Promise<void>;
  refreshAllBalances: () => Promise<void>;
  fund: (amount: string) => Promise<{ txHash: string }>;
  transfer: (amount: string, recipientBase58: string) => Promise<{ txHash: string }>;
  withdraw: (amount: string) => Promise<{ txHash: string }>;
  rollover: () => Promise<{ txHash: string }>;
  validateAddress: (base58: string) => Promise<boolean>;
};

const WalletContext = createContext<WalletState | null>(null);

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

const EMPTY_ERC20: Record<TokenKey, string> = { STRK: "0", ETH: "0", USDC: "0" };
const EMPTY_TONGO: Record<TokenKey, { balance: string; pending: string }> = {
  STRK: { balance: "0", pending: "0" },
  ETH: { balance: "0", pending: "0" },
  USDC: { balance: "0", pending: "0" },
};

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const bridge = useTongoBridge();
  const { showToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isWalletCreated, setIsWalletCreated] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [keys, setKeys] = useState<WalletKeys | null>(null);
  const [selectedToken, setSelectedToken] = useState<TokenKey>("STRK");
  const [balance, setBalance] = useState("0");
  const [pending, setPending] = useState("0");
  const [nonce, setNonce] = useState("0");
  const [erc20Balance, setErc20Balance] = useState("0");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [erc20Balances, setErc20Balances] = useState<Record<TokenKey, string>>({ ...EMPTY_ERC20 });
  const [tongoBalances, setTongoBalances] = useState<Record<TokenKey, { balance: string; pending: string }>>({ ...EMPTY_TONGO });
  const [txHistory, setTxHistory] = useState<any[]>([]);

  // Load existing wallet on mount
  useEffect(() => {
    (async () => {
      const exists = await hasWallet();
      if (exists) {
        const loaded = await loadWalletKeys();
        if (loaded) {
          setKeys(loaded);
          setIsWalletCreated(true);
        }
      }
      setIsLoading(false);
    })();
  }, []);

  // Initialize bridge when keys + bridge are ready
  useEffect(() => {
    if (!bridge.isReady || !keys || isInitialized) return;

    (async () => {
      try {
        await bridge.initialize({
          tongoPrivateKey: keys.tongoPrivateKey,
          token: selectedToken,
          starkAddress: keys.starkAddress,
          starkPrivateKey: keys.starkPrivateKey,
        });
        setIsInitialized(true);
      } catch (e) {
        console.warn("[WalletContext] Init error:", e);
        showToast("Wallet initialization failed", "error");
      }
    })();
  }, [bridge.isReady, keys, isInitialized, selectedToken, bridge, showToast]);

  // Refresh balance when initialized
  useEffect(() => {
    if (isInitialized) {
      refreshBalance();
      refreshAllBalances();
    }
  }, [isInitialized]);

  // Switch token
  const handleSetToken = useCallback(
    async (token: TokenKey) => {
      setSelectedToken(token);
      if (bridge.isReady && keys) {
        try {
          await bridge.switchToken(keys.tongoPrivateKey, token);
          setIsInitialized(true);
          const state = await bridge.getState();
          setBalance(state.balance);
          setPending(state.pending);
          setNonce(state.nonce);
          // Fetch on-chain ERC20 balance for new token
          try {
            const raw = await bridge.queryERC20Balance(token, keys.starkAddress);
            setErc20Balance(raw);
          } catch {
            setErc20Balance("0");
          }
        } catch (e) {
          console.warn("[WalletContext] Switch token error:", e);
          showToast("Could not switch token", "warning");
        }
      }
    },
    [bridge, keys, showToast],
  );

  const refreshBalance = useCallback(async () => {
    if (!bridge.isReady || !isInitialized) return;
    setIsRefreshing(true);
    try {
      const state = await bridge.getState();
      setBalance(state.balance);
      setPending(state.pending);
      setNonce(state.nonce);
      // Fetch on-chain ERC20 balance
      if (keys?.starkAddress) {
        try {
          const raw = await bridge.queryERC20Balance(selectedToken, keys.starkAddress);
          setErc20Balance(raw);
        } catch {
          // Non-critical — don't block refresh
        }
      }
    } catch (e) {
      console.warn("[WalletContext] Refresh error:", e);
    } finally {
      setIsRefreshing(false);
    }
  }, [bridge, isInitialized, keys, selectedToken]);

  const refreshAllBalances = useCallback(async () => {
    if (!bridge.isReady || !isInitialized || !keys?.starkAddress) return;
    try {
      // Fetch all 3 ERC20 balances in parallel
      const erc20Results = await Promise.allSettled(
        ALL_TOKENS.map((t) => bridge.queryERC20Balance(t, keys.starkAddress)),
      );
      const newErc20: Record<TokenKey, string> = { ...EMPTY_ERC20 };
      ALL_TOKENS.forEach((t, i) => {
        const r = erc20Results[i];
        if (r.status === "fulfilled") newErc20[t] = r.value;
      });
      setErc20Balances(newErc20);

      // For Tongo balances, we need to switch token to query each.
      // Only the currently selected token's Tongo state is available without switching.
      // Just set the current token's tongo balance from the existing state.
      const state = await bridge.getState();
      setTongoBalances((prev) => ({
        ...prev,
        [selectedToken]: { balance: state.balance, pending: state.pending },
      }));
    } catch (e) {
      console.warn("[WalletContext] refreshAllBalances error:", e);
      showToast("Could not refresh all balances", "warning");
    }
  }, [bridge, isInitialized, keys, selectedToken, showToast]);

  const refreshTxHistory = useCallback(async () => {
    if (!bridge.isReady || !isInitialized) return;
    try {
      const history = await bridge.getTxHistory(0);
      setTxHistory(history || []);
    } catch {
      // Silenced — on-chain getTxHistory fails in WebView bridge.
      // Will be replaced with Supabase reads.
    }
  }, [bridge, isInitialized]);

  const createWallet = useCallback(async (): Promise<WalletKeys> => {
    if (!bridge.isReady) throw new Error("Bridge not ready");

    // Generate Stark keypair
    const starkKeypair = await bridge.generateKeypair();

    // Use the same key as Tongo private key for simplicity
    // In production, derive separately
    const tongoPrivateKey = starkKeypair.privateKey;
    const tongoAddr = await bridge.initialize({
      tongoPrivateKey,
      token: "STRK",
      starkAddress: starkKeypair.publicKey, // placeholder, will compute real address
      starkPrivateKey: starkKeypair.privateKey,
    });

    const tongoAddress = await bridge.getTongoAddress();

    const newKeys: WalletKeys = {
      starkPrivateKey: starkKeypair.privateKey,
      starkAddress: "0x0", // Will be computed after account deployment
      starkPublicKey: starkKeypair.publicKey,
      tongoPrivateKey,
      tongoAddress,
    };

    await saveWalletKeys(newKeys);
    setKeys(newKeys);
    setIsWalletCreated(true);
    setIsInitialized(true);

    return newKeys;
  }, [bridge]);

  const importWallet = useCallback(
    async (starkPrivateKey: string, starkAddress: string): Promise<WalletKeys> => {
      if (!bridge.isReady) throw new Error("Bridge not ready");

      // Use the stark private key as the tongo private key too
      const tongoPrivateKey = starkPrivateKey;

      await bridge.initialize({
        tongoPrivateKey,
        token: "STRK",
        starkAddress,
        starkPrivateKey,
      });

      const tongoAddress = await bridge.getTongoAddress();
      const pubKey = await bridge.derivePublicKey(starkPrivateKey);

      const newKeys: WalletKeys = {
        starkPrivateKey,
        starkAddress,
        starkPublicKey: pubKey.x, // store x coordinate
        tongoPrivateKey,
        tongoAddress,
      };

      await saveWalletKeys(newKeys);
      setKeys(newKeys);
      setIsWalletCreated(true);
      setIsInitialized(true);

      // Refresh balance immediately
      const state = await bridge.getState();
      setBalance(state.balance);
      setPending(state.pending);
      setNonce(state.nonce);

      return newKeys;
    },
    [bridge],
  );

  const fund = useCallback(
    async (amount: string) => {
      if (!keys) throw new Error("No wallet");
      return bridge.fund(amount, keys.starkAddress);
    },
    [bridge, keys],
  );

  const transfer = useCallback(
    async (amount: string, recipientBase58: string) => {
      if (!keys) throw new Error("No wallet");
      return bridge.transfer(amount, recipientBase58, keys.starkAddress);
    },
    [bridge, keys],
  );

  const withdraw = useCallback(
    async (amount: string) => {
      if (!keys) throw new Error("No wallet");
      return bridge.withdraw(amount, keys.starkAddress, keys.starkAddress);
    },
    [bridge, keys],
  );

  const rollover = useCallback(async () => {
    if (!keys) throw new Error("No wallet");
    return bridge.rollover(keys.starkAddress);
  }, [bridge, keys]);

  const validateAddress = useCallback(
    async (base58: string): Promise<boolean> => {
      if (!bridge.isReady) return false;
      try {
        await bridge.send("base58ToPubKey", { base58 });
        return true;
      } catch {
        return false;
      }
    },
    [bridge],
  );

  return (
    <WalletContext.Provider
      value={{
        isLoading,
        isWalletCreated,
        isBridgeReady: bridge.isReady,
        isInitialized,
        keys,
        selectedToken,
        setSelectedToken: handleSetToken,
        balance,
        pending,
        nonce,
        erc20Balance,
        isRefreshing,
        erc20Balances,
        tongoBalances,
        txHistory,
        refreshTxHistory,
        createWallet,
        importWallet,
        refreshBalance,
        refreshAllBalances,
        fund,
        transfer,
        withdraw,
        rollover,
        validateAddress,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
