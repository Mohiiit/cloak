/**
 * useWard — Hook to detect if the connected wallet is a CloakWard account.
 *
 * Reads on-chain:
 * - get_account_type() → "WARD" (0x57415244) if ward
 * - get_guardian_address(), is_frozen(), get_spending_limit_per_tx(), etc.
 *
 * Also loads the guardian's ward list from the backend API (if the wallet is a guardian).
 */
import { useState, useEffect, useCallback } from "react";
import { useAccount } from "@starknet-react/core";
import {
  checkIfWardAccount,
  fetchWardInfo,
  normalizeAddress,
  getProvider,
} from "@cloak-wallet/sdk";
import type { WardInfo } from "@cloak-wallet/sdk";
import { getClient } from "~~/lib/api-client";

export type { WardInfo };

export interface WardEntry {
  wardAddress: string;
  wardPublicKey: string;
  tongoAddress?: string;
  status: string;
  spendingLimitPerTx: string | null;
  requireGuardianForAll: boolean;
  pseudoName?: string;
}

export function useWard() {
  const { address, status } = useAccount();
  const isConnected = status === "connected";

  const [isWard, setIsWard] = useState(false);
  const [isCheckingWard, setIsCheckingWard] = useState(false);
  const [wardInfo, setWardInfo] = useState<WardInfo | null>(null);
  const [wards, setWards] = useState<WardEntry[]>([]);
  const [isLoadingWards, setIsLoadingWards] = useState(false);

  const checkIfWard = useCallback(async (): Promise<boolean> => {
    if (!address) return false;
    setIsCheckingWard(true);
    try {
      const provider = getProvider();
      const isWardAccount = await checkIfWardAccount(provider, address);
      setIsWard(isWardAccount);
      return isWardAccount;
    } catch {
      setIsWard(false);
      return false;
    } finally {
      setIsCheckingWard(false);
    }
  }, [address]);

  const refreshWardInfo = useCallback(async () => {
    if (!address) return;
    try {
      const provider = getProvider();
      const info = await fetchWardInfo(provider, address);
      if (info) setWardInfo(info);
    } catch (err) {
      console.warn("[useWard] Failed to read ward info:", err);
    }
  }, [address]);

  const refreshWards = useCallback(async () => {
    if (!address) return;
    setIsLoadingWards(true);
    try {
      const client = getClient();
      const normalizedAddr = normalizeAddress(address);
      const rows = await client.listWards(normalizedAddr);
      const entries: WardEntry[] = (rows || [])
        .filter((r) => r.status !== "removed")
        .map((r) => ({
          wardAddress: r.ward_address,
          wardPublicKey: r.ward_public_key,
          tongoAddress: undefined,
          status: r.status,
          spendingLimitPerTx: r.spending_limit_per_tx,
          requireGuardianForAll: r.require_guardian_for_all ?? true,
          pseudoName: r.pseudo_name || undefined,
        }));
      setWards(entries);
    } catch (err) {
      console.warn("[useWard] Failed to load wards:", err);
    } finally {
      setIsLoadingWards(false);
    }
  }, [address]);

  // Auto-check on connection
  useEffect(() => {
    if (isConnected && address) {
      checkIfWard().then((result) => {
        if (result) refreshWardInfo();
      });
      refreshWards();
    } else {
      setIsWard(false);
      setWardInfo(null);
      setWards([]);
    }
  }, [isConnected, address, checkIfWard, refreshWardInfo, refreshWards]);

  return {
    isWard,
    isCheckingWard,
    wardInfo,
    wards,
    isLoadingWards,
    checkIfWard,
    refreshWardInfo,
    refreshWards,
  };
}
