"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { RpcProvider } from "starknet";
import { Account as TongoAccount } from "@fatsolutions/tongo-sdk";
import { useAccount } from "~~/hooks/useAccount";
import { getOrCreateTongoKey } from "~~/lib/tongo-key";
import { padAddress } from "~~/lib/address";
import { TOKENS, DEFAULT_TOKEN, type TokenKey } from "~~/lib/tokens";
import { getRpcUrl } from "~~/services/web3/provider";

interface TongoContextValue {
  tongoAccount: TongoAccount | null;
  isInitialized: boolean;
  tongoAddress: string;
  selectedToken: TokenKey;
  setSelectedToken: (token: TokenKey) => void;
  refreshState: () => Promise<void>;
  tongoPrivateKey: string;
}

const TongoContext = createContext<TongoContextValue>({
  tongoAccount: null,
  isInitialized: false,
  tongoAddress: "",
  selectedToken: DEFAULT_TOKEN,
  setSelectedToken: () => {},
  refreshState: async () => {},
  tongoPrivateKey: "",
});

export function useTongo() {
  return useContext(TongoContext);
}

export function TongoProvider({ children }: { children: React.ReactNode }) {
  const { account, address: walletAddress } = useAccount();
  const [tongoAccount, setTongoAccount] = useState<TongoAccount | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [tongoAddress, setTongoAddress] = useState("");
  const [selectedToken, setSelectedToken] = useState<TokenKey>(DEFAULT_TOKEN);
  const [tongoPrivateKey, setTongoPrivateKey] = useState("");

  // Initialize TongoAccount when wallet connects or token changes
  useEffect(() => {
    if (!walletAddress) {
      setTongoAccount(null);
      setIsInitialized(false);
      setTongoAddress("");
      return;
    }

    try {
      const pk = getOrCreateTongoKey();
      setTongoPrivateKey(pk);

      const tokenConfig = TOKENS[selectedToken];
      const rpcUrl = getRpcUrl("sepolia");
      const provider = new RpcProvider({ nodeUrl: rpcUrl });

      const tAccount = new TongoAccount(
        pk,
        padAddress(tokenConfig.tongoContract),
        provider as any,
      );

      setTongoAccount(tAccount);
      setTongoAddress(tAccount.tongoAddress());
      setIsInitialized(true);
    } catch (err) {
      console.error("Failed to initialize TongoAccount:", err);
      setIsInitialized(false);
    }
  }, [walletAddress, selectedToken]);

  const refreshState = useCallback(async () => {
    // Trigger re-render for hooks that depend on this
    if (!tongoAccount) return;
    // The actual state fetching happens in individual hooks
  }, [tongoAccount]);

  const value = useMemo(
    () => ({
      tongoAccount,
      isInitialized,
      tongoAddress,
      selectedToken,
      setSelectedToken,
      refreshState,
      tongoPrivateKey,
    }),
    [
      tongoAccount,
      isInitialized,
      tongoAddress,
      selectedToken,
      refreshState,
      tongoPrivateKey,
    ],
  );

  return (
    <TongoContext.Provider value={value}>{children}</TongoContext.Provider>
  );
}
