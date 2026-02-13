"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

// ─── Wallet context (lightweight, no starknet-react dependency) ──────

interface WalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  address: null,
  isConnected: false,
  isConnecting: false,
  connect: async () => {},
  disconnect: () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const connect = useCallback(async () => {
    const provider = (window as any).starknet_cloak;
    if (!provider) {
      window.open(
        "https://github.com/mohiiit/cloak",
        "_blank",
      );
      return;
    }

    setIsConnecting(true);
    try {
      const accounts = await provider.enable();
      if (accounts?.length) {
        setAddress(accounts[0]);
      }
    } catch (err) {
      console.warn("Failed to connect:", err);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    const provider = (window as any).starknet_cloak;
    if (provider) {
      provider.isConnected = false;
      provider.selectedAddress = "";
    }
  }, []);

  // Auto-reconnect if already authorized
  useEffect(() => {
    const provider = (window as any).starknet_cloak;
    if (provider?.isConnected && provider.selectedAddress) {
      setAddress(provider.selectedAddress);
    }
  }, []);

  return (
    <WalletContext.Provider
      value={{
        address,
        isConnected: !!address,
        isConnecting,
        connect,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
