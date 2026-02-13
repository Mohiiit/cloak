"use client";

import { useState } from "react";
import { useWallet } from "@/lib/providers";
import { shieldedTransfer } from "@/lib/cloak";
import { COFFEE_TIERS, RECIPIENT_TONGO_ADDRESS } from "@/lib/constants";
import { Send, Loader2 } from "lucide-react";

type CoffeeTier = (typeof COFFEE_TIERS)[number];

interface CoffeeCardProps {
  onSuccess: (txHash: string, tierLabel: string) => void;
}

export default function CoffeeCard({ onSuccess }: CoffeeCardProps) {
  const { isConnected, connect } = useWallet();
  const [selectedTier, setSelectedTier] = useState<CoffeeTier>(COFFEE_TIERS[0]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    if (!isConnected) {
      connect();
      return;
    }

    setError(null);
    setSending(true);

    try {
      const result = await shieldedTransfer(
        RECIPIENT_TONGO_ADDRESS,
        "STRK",
        selectedTier.units,
      );
      setMessage("");
      onSuccess(result.transaction_hash, selectedTier.label);
    } catch (err: any) {
      setError(err.message || "Transaction failed. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Card */}
      <div className="bg-cloak-card border border-cloak-border rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/20 animate-fade-in">
        {/* Steam animation + cup */}
        <div className="flex flex-col items-center mb-6">
          <div className="relative mb-2">
            <div className="text-6xl">☕</div>
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex gap-1">
              <span className="steam-line delay-0" />
              <span className="steam-line delay-1" />
              <span className="steam-line delay-2" />
            </div>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-cloak-text text-center">
            Buy me a coffee
          </h2>
          <p className="text-sm text-cloak-text-dim mt-1 text-center">
            Support my work with a private tip
          </p>
        </div>

        {/* Tier buttons */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {COFFEE_TIERS.map((tier) => {
            const isActive = selectedTier.id === tier.id;
            return (
              <button
                key={tier.id}
                onClick={() => setSelectedTier(tier)}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                  isActive
                    ? "border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/10"
                    : "border-cloak-border hover:border-cloak-border-light bg-cloak-bg hover:bg-cloak-bg-light"
                }`}
              >
                <span className="text-2xl">{tier.emoji}</span>
                <span
                  className={`text-xs font-semibold ${isActive ? "text-amber-400" : "text-cloak-text-dim"}`}
                >
                  {tier.label}
                </span>
                <span
                  className={`text-[11px] ${isActive ? "text-amber-500/70" : "text-cloak-muted"}`}
                >
                  {tier.strk} STRK
                </span>
              </button>
            );
          })}
        </div>

        {/* Optional message */}
        <div className="mb-6">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Leave a message (optional)"
            maxLength={200}
            rows={2}
            className="w-full bg-cloak-bg border border-cloak-border rounded-xl px-4 py-3 text-sm text-cloak-text placeholder:text-cloak-muted focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 resize-none transition-colors"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-cloak-error/10 border border-cloak-error/20 text-cloak-error text-sm">
            {error}
          </div>
        )}

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={sending}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm transition-all bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
        >
          {sending ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Sending privately...
            </>
          ) : isConnected ? (
            <>
              <Send size={18} />
              Send {selectedTier.strk} STRK
            </>
          ) : (
            "Connect Cloak Wallet"
          )}
        </button>
      </div>
    </div>
  );
}
