import React from "react";
import { Sparkles } from "lucide-react";
import { Header } from "./ShieldForm";

interface Props {
  onBack: () => void;
}

export function MarketplaceScreen({ onBack }: Props) {
  return (
    <div className="flex flex-col h-[580px] bg-cloak-bg p-6 animate-fade-in overflow-y-auto">
      <Header title="Agent Marketplace" onBack={onBack} />

      <div className="rounded-xl border border-cloak-border bg-cloak-card p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-cloak-primary" />
          <p className="text-sm font-semibold text-cloak-text">Extension integration enabled</p>
        </div>
        <p className="text-xs text-cloak-text-dim leading-relaxed">
          Marketplace routing is active in the extension popup. Discover, hire, and paid run
          controls are added in the next phases on top of this screen.
        </p>
      </div>

      <div className="mt-auto text-[10px] text-cloak-muted">
        Cloak x402 + ERC-8004 operator surface (phase 68 baseline)
      </div>
    </div>
  );
}
