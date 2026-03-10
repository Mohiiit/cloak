"use client";

import { useEffect, useRef } from "react";
import { useAccount } from "@starknet-react/core";
import { saveApiConfig, getApiConfig } from "~~/lib/api-client";

const STORAGE_KEY_REGISTERED_WALLET = "cloak_api_registered_wallet";
const CLOAK_ADDRESS_KEY = "cloak_active_address";

/**
 * Auto-registers/rotates an API key for the connected wallet address.
 * Runs once per wallet address -- re-runs if the wallet changes.
 * Stores the returned key in localStorage so all API calls use it.
 *
 * Falls back to the direct cloak_active_address in localStorage when
 * starknet-react has not yet synced (bypassed connect flow).
 */
export function useWalletApiKey() {
  const { address: starknetAddress, status } = useAccount();
  const inFlightRef = useRef<string | null>(null);

  useEffect(() => {
    // Use starknet-react address if available, else fall back to direct cloak address
    const address =
      (status === "connected" && starknetAddress) ||
      (typeof window !== "undefined" ? localStorage.getItem(CLOAK_ADDRESS_KEY) : null);

    if (!address) return;

    const registeredFor =
      typeof window !== "undefined"
        ? localStorage.getItem(STORAGE_KEY_REGISTERED_WALLET)
        : null;
    if (registeredFor?.toLowerCase() === address.toLowerCase()) return;

    if (inFlightRef.current === address) return;
    inFlightRef.current = address;

    fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet_address: address }),
    })
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then((data: { api_key?: string }) => {
        if (typeof data.api_key === "string" && data.api_key.length > 0) {
          const { url } = getApiConfig();
          saveApiConfig(url, data.api_key);
          localStorage.setItem(STORAGE_KEY_REGISTERED_WALLET, address.toLowerCase());
        }
      })
      .catch(() => { /* non-fatal -- falls back to shared default key */ })
      .finally(() => { inFlightRef.current = null; });
  }, [starknetAddress, status]);

  // Also re-run when cloak_active_address changes (storage event from other tabs)
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === CLOAK_ADDRESS_KEY && e.newValue) {
        // Clear registered flag so main effect re-runs on next render
        const registered = localStorage.getItem(STORAGE_KEY_REGISTERED_WALLET);
        if (registered?.toLowerCase() !== e.newValue.toLowerCase()) {
          localStorage.removeItem(STORAGE_KEY_REGISTERED_WALLET);
        }
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
}
