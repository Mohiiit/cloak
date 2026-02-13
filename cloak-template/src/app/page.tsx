"use client";

import { useState } from "react";
import Header from "@/components/Header";
import CoffeeCard from "@/components/CoffeeCard";
import BalanceBar from "@/components/BalanceBar";
import SuccessModal from "@/components/SuccessModal";
import CloakBadge from "@/components/CloakBadge";

export default function Home() {
  const [successTx, setSuccessTx] = useState<{
    hash: string;
    tier: string;
  } | null>(null);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        {/* Hero text */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Private on-chain tips
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-cloak-text mb-2">
            Support creators,{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">
              privately
            </span>
          </h1>
          <p className="text-cloak-text-dim text-sm sm:text-base max-w-md mx-auto">
            Send shielded tips on Starknet. No one can see how much you sent or
            to whom.
          </p>
        </div>

        {/* Balance bar */}
        <div className="mb-6">
          <BalanceBar />
        </div>

        {/* Main card */}
        <CoffeeCard
          onSuccess={(hash, tier) => setSuccessTx({ hash, tier })}
        />

        {/* Badge */}
        <div className="mt-8">
          <CloakBadge />
        </div>
      </div>

      {/* Success modal */}
      {successTx && (
        <SuccessModal
          txHash={successTx.hash}
          tierLabel={successTx.tier}
          onClose={() => setSuccessTx(null)}
        />
      )}
    </div>
  );
}
