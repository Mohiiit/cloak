/**
 * useWard — Detect if the current extension wallet is a CloakWard account.
 *
 * Reads on-chain:
 * - get_account_type() → 0x57415244 ("WARD") if ward
 * - get_guardian_address(), is_frozen(), etc.
 */
import { useState, useEffect, useCallback } from "react";
import { RpcProvider } from "starknet";
import {
  DEFAULT_RPC,
  checkIfWardAccount as sdkCheckIfWardAccount,
  fetchWardInfo as sdkFetchWardInfo,
} from "@cloak-wallet/sdk";
import type { WardInfo } from "@cloak-wallet/sdk";

export type { WardInfo };

export function useWard(starkAddress: string | undefined) {
  const [isWard, setIsWard] = useState(false);
  const [isCheckingWard, setIsCheckingWard] = useState(false);
  const [wardInfo, setWardInfo] = useState<WardInfo | null>(null);

  const checkIfWard = useCallback(async (): Promise<boolean> => {
    if (!starkAddress) return false;
    setIsCheckingWard(true);
    try {
      const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
      const isWardAccount = await sdkCheckIfWardAccount(provider, starkAddress);
      setIsWard(isWardAccount);
      return isWardAccount;
    } catch {
      setIsWard(false);
      return false;
    } finally {
      setIsCheckingWard(false);
    }
  }, [starkAddress]);

  const refreshWardInfo = useCallback(async () => {
    if (!starkAddress || !isWard) return;
    try {
      const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
      const info = await sdkFetchWardInfo(provider, starkAddress);
      setWardInfo(info);
    } catch (err) {
      console.warn("[useWard] Failed to read ward info:", err);
    }
  }, [starkAddress, isWard]);

  useEffect(() => {
    if (starkAddress) {
      checkIfWard().then((result) => {
        if (result) refreshWardInfo();
      });
    } else {
      setIsWard(false);
      setWardInfo(null);
    }
  }, [starkAddress, checkIfWard, refreshWardInfo]);

  return { isWard, isCheckingWard, wardInfo, checkIfWard, refreshWardInfo };
}
