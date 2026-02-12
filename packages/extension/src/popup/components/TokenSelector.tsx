import React from "react";
import type { TokenKey } from "@cloak/sdk";

const TOKEN_INFO: Record<TokenKey, { color: string; label: string }> = {
  STRK: { color: "bg-purple-500", label: "STRK" },
  ETH: { color: "bg-blue-500", label: "ETH" },
  USDC: { color: "bg-green-500", label: "USDC" },
};

interface Props {
  selected: TokenKey;
  onSelect: (token: TokenKey) => void;
}

export function TokenSelector({ selected, onSelect }: Props) {
  return (
    <div className="flex gap-1.5 bg-cloak-card rounded-xl p-1 border border-cloak-border">
      {(["STRK", "ETH", "USDC"] as TokenKey[]).map((token) => (
        <button
          key={token}
          onClick={() => onSelect(token)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
            selected === token
              ? "bg-cloak-primary/20 text-cloak-primary border border-cloak-primary/30"
              : "text-cloak-text-dim hover:text-cloak-text"
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${TOKEN_INFO[token].color}`} />
          {TOKEN_INFO[token].label}
        </button>
      ))}
    </div>
  );
}
