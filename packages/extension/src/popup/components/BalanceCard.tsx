import React, { useState } from "react";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { TOKENS, formatTokenAmount } from "@cloak-wallet/sdk";
import type { TokenKey } from "@cloak-wallet/sdk";
import type { ShieldedBalances } from "../hooks/useExtensionWallet";

interface Props {
  balances: ShieldedBalances;
  erc20Balance: bigint;
  selectedToken: TokenKey;
  onRefresh: () => Promise<void>;
}

export function BalanceCard({ balances, erc20Balance, selectedToken, onRefresh }: Props) {
  const [balanceHidden, setBalanceHidden] = useState(false);
  const token = TOKENS[selectedToken];

  const shieldedErc20 = balances.balance * token.rate;
  const shieldedDisplay = formatTokenAmount(shieldedErc20, token.decimals, 2);
  const publicDisplay = formatTokenAmount(erc20Balance, token.decimals, 2);

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
