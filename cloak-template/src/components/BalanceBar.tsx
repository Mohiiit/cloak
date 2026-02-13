"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/lib/providers";
import { getShieldedBalance } from "@/lib/cloak";
import { STRK_PER_UNIT } from "@/lib/constants";
import { RefreshCw } from "lucide-react";

export default function BalanceBar() {
  const { isConnected } = useWallet();
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    setLoading(true);
    try {
      const state = await getShieldedBalance("STRK");
      const units = parseInt(state.balance, 10) || 0;
      setBalance((units * STRK_PER_UNIT).toFixed(2));
    } catch {
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isConnected) fetchBalance();
  }, [isConnected, fetchBalance]);

  if (!isConnected || balance === null) return null;

  return (
    <div className="flex items-center justify-center gap-2 text-xs text-cloak-text-dim animate-fade-in">
      <span>
        Your shielded balance:{" "}
        <span className="font-semibold text-cloak-text">{balance} STRK</span>
      </span>
      <button
        onClick={fetchBalance}
        disabled={loading}
        className="p-1 rounded hover:bg-cloak-bg-light transition-colors"
        title="Refresh"
      >
        <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
      </button>
    </div>
  );
}
