/**
 * WalletContext — Global wallet state for the app.
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useTongoBridge } from "../bridge/useTongoBridge";
import { WalletKeys, loadWalletKeys, saveWalletKeys, hasWallet } from "./keys";
import { TokenKey } from "./tokens";

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

  // Balance
  balance: string;
  pending: string;
  nonce: string;
  isRefreshing: boolean;

  // Actions
  createWallet: () => Promise<WalletKeys>;
  importWallet: (starkPrivateKey: string, starkAddress: string) => Promise<WalletKeys>;
  refreshBalance: () => Promise<void>;
  fund: (amount: string) => Promise<{ txHash: string }>;
  transfer: (amount: string, recipientBase58: string) => Promise<{ txHash: string }>;
  withdraw: (amount: string) => Promise<{ txHash: string }>;
  rollover: () => Promise<{ txHash: string }>;
};

const WalletContext = createContext<WalletState | null>(null);

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const bridge = useTongoBridge();

  const [isLoading, setIsLoading] = useState(true);
  const [isWalletCreated, setIsWalletCreated] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [keys, setKeys] = useState<WalletKeys | null>(null);
  const [selectedToken, setSelectedToken] = useState<TokenKey>("STRK");
  const [balance, setBalance] = useState("0");
  const [pending, setPending] = useState("0");
  const [nonce, setNonce] = useState("0");
  const [isRefreshing, setIsRefreshing] = useState(false);

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
        console.error("[WalletContext] Init error:", e);
      }
    })();
  }, [bridge.isReady, keys, isInitialized, selectedToken, bridge]);

  // Refresh balance when initialized
  useEffect(() => {
    if (isInitialized) {
      refreshBalance();
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
        } catch (e) {
          console.error("[WalletContext] Switch token error:", e);
        }
      }
    },
    [bridge, keys],
  );

  const refreshBalance = useCallback(async () => {
    if (!bridge.isReady || !isInitialized) return;
    setIsRefreshing(true);
    try {
      const state = await bridge.getState();
      setBalance(state.balance);
      setPending(state.pending);
      setNonce(state.nonce);
    } catch (e) {
      console.error("[WalletContext] Refresh error:", e);
    } finally {
      setIsRefreshing(false);
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
        isRefreshing,
        createWallet,
        importWallet,
        refreshBalance,
        fund,
        transfer,
        withdraw,
        rollover,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
