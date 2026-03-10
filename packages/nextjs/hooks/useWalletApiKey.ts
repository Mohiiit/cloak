"use client";

import { useEffect, useRef } from "react";
import { useAccount } from "@starknet-react/core";
import { saveApiConfig, getApiConfig } from "~~/lib/api-client";

const STORAGE_KEY_REGISTERED_WALLET = "cloak_api_registered_wallet";

/**
 * Auto-registers/rotates an API key for the connected wallet address.
 * Runs once per wallet address — re-runs if the wallet changes.
 * Stores the returned key in localStorage so all API calls use it.
 */
export function useWalletApiKey() {
  const { address, status } = useAccount();
  const inFlightRef = useRef<string | null>(null);

  useEffect(() => {
    if (status !== "connected" || !address) return;

    // Already registered for this wallet in this session
    const registeredFor =
      typeof window !== "undefined"
        ? localStorage.getItem(STORAGE_KEY_REGISTERED_WALLET)
        : null;
    if (registeredFor?.toLowerCase() === address.toLowerCase()) return;

    // Prevent duplicate in-flight calls
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
      .catch(() => { /* non-fatal — falls back to shared default key */ })
      .finally(() => { inFlightRef.current = null; });
  }, [address, status]);
}
