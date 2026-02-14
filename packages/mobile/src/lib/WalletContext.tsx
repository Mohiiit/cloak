/**
 * WalletContext — Global wallet state for the app.
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { hash, CallData, Account, RpcProvider } from "starknet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTongoBridge } from "../bridge/useTongoBridge";
import { WalletKeys, loadWalletKeys, saveWalletKeys, hasWallet } from "./keys";
import { TokenKey, TOKENS } from "./tokens";
import { useToast } from "../components/Toast";
import { DEFAULT_RPC, CLOAK_ACCOUNT_CLASS_HASH } from "@cloak-wallet/sdk";
import { isMockMode } from "../testing/runtimeConfig";

const ALL_TOKENS: TokenKey[] = ["STRK", "ETH", "USDC"];
const MOCK_DEPLOY_FLAG_KEY = "cloak_mock_deployed";

type WalletState = {
  // Status
  isLoading: boolean;
  isWalletCreated: boolean;
  isBridgeReady: boolean;
  isInitialized: boolean;
  isDeployed: boolean;
  isCheckingDeployment: boolean;

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

  // Deploy
  checkDeployment: () => Promise<boolean>;
  deployAccount: () => Promise<string>;

  // Actions
  createWallet: () => Promise<WalletKeys>;
  importWallet: (starkPrivateKey: string, starkAddress: string) => Promise<WalletKeys>;
  refreshBalance: () => Promise<void>;
  refreshAllBalances: () => Promise<void>;
  fund: (amount: string) => Promise<{ txHash: string }>;
  transfer: (amount: string, recipientBase58: string) => Promise<{ txHash: string }>;
  withdraw: (amount: string) => Promise<{ txHash: string }>;
  rollover: () => Promise<{ txHash: string }>;
  prepareFund: (amount: string) => Promise<{ calls: any[] }>;
  prepareTransfer: (amount: string, recipientBase58: string) => Promise<{ calls: any[] }>;
  prepareWithdraw: (amount: string) => Promise<{ calls: any[] }>;
  prepareRollover: () => Promise<{ calls: any[] }>;
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
  const [isDeployed, setIsDeployed] = useState(false);
  const [isCheckingDeployment, setIsCheckingDeployment] = useState(false);
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

  // ── Deployment ────────────────────────────────────────────────────────

  const checkDeployment = useCallback(async (): Promise<boolean> => {
    if (!keys?.starkAddress) return false;
    setIsCheckingDeployment(true);
    try {
      if (isMockMode()) {
        const deployed = (await AsyncStorage.getItem(MOCK_DEPLOY_FLAG_KEY)) === "true";
        setIsDeployed(deployed);
        return deployed;
      }

      const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
      await provider.getNonceForAddress(keys.starkAddress);
      setIsDeployed(true);
      return true;
    } catch {
      setIsDeployed(false);
      return false;
    } finally {
      setIsCheckingDeployment(false);
    }
  }, [keys?.starkAddress]);

  const deployAccount = useCallback(async (): Promise<string> => {
    if (!keys) throw new Error("No wallet keys");

    if (isMockMode()) {
      const txHash = `0xmockdeploy${Date.now().toString(16)}`;
      await AsyncStorage.setItem(MOCK_DEPLOY_FLAG_KEY, "true");
      setIsDeployed(true);
      return txHash;
    }

    const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
    const constructorCalldata = CallData.compile({ publicKey: keys.starkPublicKey });
    const account = new Account({
      provider,
      address: keys.starkAddress,
      signer: keys.starkPrivateKey,
    });
    const { transaction_hash } = await account.deployAccount({
      classHash: CLOAK_ACCOUNT_CLASS_HASH,
      constructorCalldata,
      addressSalt: keys.starkPublicKey,
    });
    await provider.waitForTransaction(transaction_hash);
    setIsDeployed(true);
    return transaction_hash;
  }, [keys]);

  // Check deployment status when wallet keys load
  useEffect(() => {
    if (keys?.starkAddress && isWalletCreated) {
      checkDeployment();
    }
  }, [keys?.starkAddress, isWalletCreated, checkDeployment]);

  const createWallet = useCallback(async (): Promise<WalletKeys> => {
    if (!bridge.isReady) throw new Error("Bridge not ready");

    // Generate Stark keypair
    const starkKeypair = await bridge.generateKeypair();

    // Compute counterfactual CloakAccount address from the public key
    const constructorCalldata = CallData.compile({ publicKey: starkKeypair.publicKey });
    const starkAddress = hash.calculateContractAddressFromHash(
      starkKeypair.publicKey, // salt
      CLOAK_ACCOUNT_CLASS_HASH,
      constructorCalldata,
      0, // deployer = 0 (counterfactual)
    );

    // Use the same key as Tongo private key for simplicity
    const tongoPrivateKey = starkKeypair.privateKey;
    await bridge.initialize({
      tongoPrivateKey,
      token: "STRK",
      starkAddress,
      starkPrivateKey: starkKeypair.privateKey,
    });

    const tongoAddress = await bridge.getTongoAddress();

    const newKeys: WalletKeys = {
      starkPrivateKey: starkKeypair.privateKey,
      starkAddress,
      starkPublicKey: starkKeypair.publicKey,
      tongoPrivateKey,
      tongoAddress,
    };

    await saveWalletKeys(newKeys);
    await AsyncStorage.setItem(MOCK_DEPLOY_FLAG_KEY, "false");
    setKeys(newKeys);
    setIsWalletCreated(true);
    setIsInitialized(true);
    setIsDeployed(false);

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
      await AsyncStorage.setItem(MOCK_DEPLOY_FLAG_KEY, "false");
      setKeys(newKeys);
      setIsWalletCreated(true);
      setIsInitialized(true);
      setIsDeployed(false);

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

  const prepareFund = useCallback(
    async (amount: string) => {
      if (!keys) throw new Error("No wallet");
      return bridge.prepareFund(amount, keys.starkAddress);
    },
    [bridge, keys],
  );

  const prepareTransfer = useCallback(
    async (amount: string, recipientBase58: string) => {
      if (!keys) throw new Error("No wallet");
      return bridge.prepareTransfer(amount, recipientBase58, keys.starkAddress);
    },
    [bridge, keys],
  );

  const prepareWithdraw = useCallback(
    async (amount: string) => {
      if (!keys) throw new Error("No wallet");
      return bridge.prepareWithdraw(amount, keys.starkAddress, keys.starkAddress);
    },
    [bridge, keys],
  );

  const prepareRollover = useCallback(async () => {
    if (!keys) throw new Error("No wallet");
    return bridge.prepareRollover(keys.starkAddress);
  }, [bridge, keys]);

  const validateAddress = useCallback(
    async (base58: string): Promise<boolean> => {
      if (!bridge.isReady) return false;
      return bridge.validateBase58(base58);
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
        isDeployed,
        isCheckingDeployment,
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
        checkDeployment,
        deployAccount,
        createWallet,
        importWallet,
        refreshBalance,
        refreshAllBalances,
        fund,
        transfer,
        withdraw,
        rollover,
        prepareFund,
        prepareTransfer,
        prepareWithdraw,
        prepareRollover,
        validateAddress,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
