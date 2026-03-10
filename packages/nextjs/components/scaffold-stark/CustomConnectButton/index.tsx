"use client";
import { useEffect, useState } from "react";
import { useConnect } from "@starknet-react/core";
import ConnectModal from "./ConnectModal";
import { useAutoConnect } from "~~/hooks/scaffold-stark";
import { LAST_CONNECTED_TIME_LOCALSTORAGE_KEY } from "~~/utils/Constants";

const CLOAK_ADDRESS_KEY = "cloak_active_address";

export const CustomConnectButton = () => {
  useAutoConnect();
  const { connectors, connect } = useConnect();
  const [cloakAddress, setCloakAddress] = useState<string | null>(null);

  // Auto-detect if already connected on mount
  useEffect(() => {
    const provider = (window as any).starknet_cloak;
    if (provider?.isConnected && provider.selectedAddress) {
      handleConnected(provider.selectedAddress);
    } else {
      const stored = localStorage.getItem(CLOAK_ADDRESS_KEY);
      if (stored) setCloakAddress(stored);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleConnected(address: string) {
    setCloakAddress(address);
    localStorage.setItem(CLOAK_ADDRESS_KEY, address);
    // Auto-register wallet to get a user-specific API key tied to this address
    fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet_address: address }),
    })
      .then(res => res.ok ? res.json() : null)
      .then(json => { if (json?.api_key) localStorage.setItem("cloak_api_key", json.api_key); })
      .catch(() => {/* non-fatal */});
    // Try syncing starknet-react in background (for wallet operations)
    const cloakConnector = connectors.find((c) => c.id === "cloak");
    if (cloakConnector) {
      connect({ connector: cloakConnector });
      localStorage.setItem("lastUsedConnector", JSON.stringify({ id: cloakConnector.id }));
      localStorage.setItem(LAST_CONNECTED_TIME_LOCALSTORAGE_KEY, String(Date.now()));
    }
  }

  function handleDisconnect() {
    setCloakAddress(null);
    localStorage.removeItem(CLOAK_ADDRESS_KEY);
    const provider = (window as any).starknet_cloak;
    if (provider) {
      provider.isConnected = false;
      provider.selectedAddress = "";
    }
  }

  if (!cloakAddress) {
    return <ConnectModal onConnected={handleConnected} />;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-mono text-slate-300 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
        {cloakAddress.slice(0, 6)}...{cloakAddress.slice(-4)}
      </span>
      <button
        onClick={handleDisconnect}
        className="text-xs text-slate-500 hover:text-red-400 transition-colors px-2 py-1.5"
        title="Disconnect"
      >
        &#x2715;
      </button>
    </div>
  );
};
