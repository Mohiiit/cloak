import React, { useState } from "react";
import { Eye, EyeOff, RefreshCw, Clock } from "lucide-react";
import { TOKENS, formatTokenAmount } from "@cloak/sdk";
import type { TokenKey } from "@cloak/sdk";
import type { ShieldedBalances } from "../hooks/useExtensionWallet";

interface Props {
  balances: ShieldedBalances;
  erc20Balance: bigint;
  selectedToken: TokenKey;
  onRefresh: () => Promise<void>;
  onRollover: () => Promise<string | null>;
  onClaimSuccess: (txHash: string) => void;
}

export function BalanceCard({ balances, erc20Balance, selectedToken, onRefresh, onRollover, onClaimSuccess }: Props) {
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const token = TOKENS[selectedToken];

  const shieldedErc20 = balances.balance * token.rate;
  const pendingErc20 = balances.pending * token.rate;

  const shieldedDisplay = formatTokenAmount(shieldedErc20, token.decimals);
  const pendingDisplay = formatTokenAmount(pendingErc20, token.decimals);
  const publicDisplay = formatTokenAmount(erc20Balance, token.decimals);

  return (
    <div className="relative overflow-hidden bg-cloak-card border border-cloak-border rounded-xl p-4">
      {/* Glow effects matching mobile */}
      <div className="absolute -top-10 -right-10 w-[120px] h-[120px] rounded-full bg-cloak-primary/[0.08]" />
      <div className="absolute -bottom-8 -left-8 w-[100px] h-[100px] rounded-full bg-cloak-secondary/[0.08]" />

      <div className="relative">
        {/* Shielded balance — primary */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-cloak-text-dim uppercase tracking-wider">Shielded Balance</span>
          <button
            onClick={() => setBalanceHidden(!balanceHidden)}
            className="text-cloak-text-dim hover:text-cloak-text transition-colors"
          >
            {balanceHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
        </div>

        {/* Hero balance */}
        <p className="text-2xl font-bold text-cloak-text">
          {balanceHidden ? "****" : `${balances.balance.toString()} units`}
        </p>
        <p className="text-[11px] text-cloak-text-dim mt-0.5">
          {balanceHidden ? "****" : `(${shieldedDisplay} ${selectedToken})`}
        </p>

        {/* Pending */}
        {balances.pending > 0n && (
          <div className="flex items-center justify-between mt-2 bg-cloak-warning/10 border border-cloak-warning/25 rounded-lg p-2">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cloak-warning" />
              <span className="text-[11px] text-cloak-warning">
                {balanceHidden ? "+**** pending" : `+${balances.pending.toString()} units (${pendingDisplay} ${selectedToken}) pending`}
              </span>
            </div>
            <button
              onClick={async () => {
                setClaiming(true);
                try {
                  const txHash = await onRollover();
                  if (txHash) {
                    onClaimSuccess(txHash);
                  }
                } finally {
                  setClaiming(false);
                }
              }}
              disabled={claiming}
              className="text-[11px] font-semibold text-cloak-warning hover:text-yellow-300 bg-cloak-warning/20 border border-cloak-warning/40 px-2.5 py-1 rounded-full transition-colors disabled:opacity-50"
            >
              {claiming ? "Claiming..." : "Claim"}
            </button>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-cloak-border-light my-3" />

        {/* Unshielded (On-chain) */}
        <span className="text-[10px] text-cloak-muted uppercase tracking-wider">Unshielded (On-chain)</span>
        <p className="text-sm font-medium text-cloak-text-dim mt-0.5">
          {balanceHidden ? "****" : publicDisplay} <span className="text-cloak-muted">{selectedToken}</span>
        </p>

        {/* Refresh button — small icon */}
        <button
          onClick={onRefresh}
          className="absolute top-0 right-6 text-cloak-text-dim hover:text-cloak-text transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
