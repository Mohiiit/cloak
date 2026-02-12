import React, { useState } from "react";
import { truncateTongoAddress, truncateAddress } from "@cloak/sdk";
import type { WalletInfo } from "@cloak/sdk";
import { Header } from "./ShieldForm";

interface Props {
  wallet: WalletInfo;
  onBack: () => void;
}

export function ReceiveScreen({ wallet, onBack }: Props) {
  const [copiedTongo, setCopiedTongo] = useState(false);
  const [copiedStark, setCopiedStark] = useState(false);

  const copyTongo = () => {
    navigator.clipboard.writeText(wallet.tongoAddress);
    setCopiedTongo(true);
    setTimeout(() => setCopiedTongo(false), 2000);
  };

  const copyStark = () => {
    navigator.clipboard.writeText(wallet.starkAddress);
    setCopiedStark(true);
    setTimeout(() => setCopiedStark(false), 2000);
  };

  return (
    <div className="flex flex-col h-[580px] bg-cloak-bg p-6 animate-fade-in">
      <Header title="Receive" onBack={onBack} />

      {/* Tongo address — primary */}
      <div className="bg-cloak-card border border-cloak-border rounded-xl p-4 mb-4">
        <div className="flex items-center gap-1.5 mb-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cloak-primary">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span className="text-[11px] text-cloak-text-dim uppercase tracking-wider">Tongo Address (Private)</span>
        </div>
        <p className="text-sm font-mono text-cloak-text break-all mb-3">{wallet.tongoAddress}</p>
        <button
          onClick={copyTongo}
          className="w-full py-2 rounded-lg bg-cloak-primary/10 border border-cloak-primary/30 text-cloak-primary text-xs font-medium hover:bg-cloak-primary/20 transition-colors"
        >
          {copiedTongo ? "Copied!" : "Copy Tongo Address"}
        </button>
      </div>

      {/* Starknet address — secondary */}
      <div className="bg-cloak-card border border-cloak-border rounded-xl p-4">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[11px] text-cloak-text-dim uppercase tracking-wider">Starknet Address (Public)</span>
        </div>
        <p className="text-xs font-mono text-cloak-text-dim break-all mb-3">{wallet.starkAddress}</p>
        <button
          onClick={copyStark}
          className="w-full py-2 rounded-lg bg-cloak-card border border-cloak-border text-cloak-text-dim text-xs font-medium hover:border-cloak-primary/30 transition-colors"
        >
          {copiedStark ? "Copied!" : "Copy Starknet Address"}
        </button>
      </div>

      <div className="mt-4 bg-blue-900/20 border border-blue-800/30 rounded-xl p-3">
        <p className="text-blue-400 text-[11px]">
          Share your <b>Tongo address</b> to receive private transfers. Share your <b>Starknet address</b> to receive public tokens.
        </p>
      </div>
    </div>
  );
}
