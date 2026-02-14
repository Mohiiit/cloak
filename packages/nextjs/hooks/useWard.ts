/**
 * useWard — Hook to detect if the connected wallet is a CloakWard account.
 *
 * Reads on-chain:
 * - get_account_type() → "WARD" (0x57415244) if ward
 * - get_guardian_address(), is_frozen(), get_spending_limit_per_tx(), etc.
 *
 * Also loads the guardian's ward list from Supabase (if the wallet is a guardian).
 */
import { useState, useEffect, useCallback } from "react";
import { RpcProvider } from "starknet";
import { useAccount } from "@starknet-react/core";
import {
  DEFAULT_RPC,
  checkIfWardAccount,
  fetchWardInfo,
  padAddress,
} from "@cloak-wallet/sdk";
import type { WardInfo } from "@cloak-wallet/sdk";
import { getSupabaseConfig } from "~~/lib/two-factor";

export type { WardInfo };

export interface WardEntry {
  wardAddress: string;
  wardPublicKey: string;
  status: string;
  spendingLimitPerTx: string | null;
  requireGuardianForAll: boolean;
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
      const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
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
    if (!address || !isWard) return;
    try {
      const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
      const info = await fetchWardInfo(provider, address);
      if (info) setWardInfo(info);
    } catch (err) {
      console.warn("[useWard] Failed to read ward info:", err);
    }
  }, [address, isWard]);

  const refreshWards = useCallback(async () => {
    if (!address) return;
    setIsLoadingWards(true);
    try {
      const { url, key } = getSupabaseConfig();
      const normalizedAddr = padAddress(address);
      const res = await fetch(
        `${url}/rest/v1/ward_configs?guardian_address=eq.${normalizedAddr}&status=neq.removed&order=created_at.desc`,
        {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
          },
        },
      );
      if (res.ok) {
        const rows = await res.json();
        const entries: WardEntry[] = (rows || []).map((r: any) => ({
          wardAddress: r.ward_address,
          wardPublicKey: r.ward_public_key,
          status: r.status,
          spendingLimitPerTx: r.spending_limit_per_tx,
          requireGuardianForAll: r.require_guardian_for_all ?? true,
        }));
        setWards(entries);
      }
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
