import React from "react";
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
  const token = TOKENS[selectedToken];

  const shieldedErc20 = balances.balance * token.rate;
  const pendingErc20 = balances.pending * token.rate;

  const shieldedDisplay = formatTokenAmount(shieldedErc20, token.decimals);
  const pendingDisplay = formatTokenAmount(pendingErc20, token.decimals);
  const publicDisplay = formatTokenAmount(erc20Balance, token.decimals);

  return (
    <div className="bg-cloak-card border border-cloak-border rounded-xl p-4">
      {/* Shielded balance — primary */}
      <div className="mb-3">
        <div className="flex items-center gap-1.5 mb-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cloak-primary">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span className="text-[11px] text-cloak-text-dim uppercase tracking-wider">Shielded</span>
        </div>
        <p className="text-2xl font-bold text-cloak-text">
          {shieldedDisplay} <span className="text-sm text-cloak-text-dim font-normal">{selectedToken}</span>
        </p>
        <p className="text-[11px] text-cloak-muted">{balances.balance.toString()} Tongo units</p>
      </div>

      {/* Pending + Public row */}
      <div className="flex gap-3 mb-3">
        <div className="flex-1 bg-cloak-bg/50 rounded-lg p-2.5">
          <p className="text-[10px] text-cloak-muted uppercase tracking-wider mb-0.5">Pending</p>
          <p className="text-sm font-medium text-yellow-400">{pendingDisplay} {selectedToken}</p>
        </div>
        <div className="flex-1 bg-cloak-bg/50 rounded-lg p-2.5">
          <p className="text-[10px] text-cloak-muted uppercase tracking-wider mb-0.5">Public</p>
          <p className="text-sm font-medium text-cloak-text">{publicDisplay} {selectedToken}</p>
        </div>
      </div>

      {/* Actions row */}
      <div className="flex gap-2">
        <button
          onClick={onRefresh}
          className="flex-1 py-1.5 text-[11px] text-cloak-text-dim hover:text-cloak-text border border-cloak-border rounded-lg transition-colors"
        >
          Refresh
        </button>
        {balances.pending > 0n && (
          <button
            onClick={onRollover}
            className="flex-1 py-1.5 text-[11px] text-cloak-accent hover:text-green-300 border border-cloak-accent/30 rounded-lg transition-colors"
          >
            Claim Pending
          </button>
        )}
      </div>
    </div>
  );
}
