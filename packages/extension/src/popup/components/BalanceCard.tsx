import React, { useState } from "react";
import { TOKENS, formatTokenAmount } from "@cloak/sdk";
import type { TokenKey } from "@cloak/sdk";
import type { ShieldedBalances } from "../hooks/useExtensionWallet";

interface Props {
  balances: ShieldedBalances;
  erc20Balance: bigint;
  selectedToken: TokenKey;
  onRefresh: () => Promise<void>;
  onRollover: () => Promise<string | null>;
}

export function BalanceCard({ balances, erc20Balance, selectedToken, onRefresh, onRollover }: Props) {
  const [balanceHidden, setBalanceHidden] = useState(false);
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
            {balanceHidden ? "👁" : "👁‍🗨"}
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
              <div className="w-2 h-2 rounded-full bg-cloak-warning animate-pulse" />
              <span className="text-[11px] text-cloak-warning">
                {balanceHidden ? "+**** pending" : `+${balances.pending.toString()} units (${pendingDisplay} ${selectedToken}) pending`}
              </span>
            </div>
            <button
              onClick={onRollover}
              className="text-[11px] font-semibold text-cloak-warning hover:text-yellow-300 bg-cloak-warning/20 border border-cloak-warning/40 px-2.5 py-1 rounded-full transition-colors"
            >
              Claim
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>
    </div>
  );
}
