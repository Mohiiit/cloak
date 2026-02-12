import React, { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { TOKENS, parseTokenAmount } from "@cloak/sdk";
import type { useExtensionWallet } from "../hooks/useExtensionWallet";

interface Props {
  wallet: ReturnType<typeof useExtensionWallet>;
  onBack: () => void;
}

export function ShieldForm({ wallet: w, onBack }: Props) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const token = TOKENS[w.selectedToken];

  const handleSubmit = async () => {
    if (!amount) return;
    setLoading(true);
    try {
      const erc20Amount = parseTokenAmount(amount, token.decimals);
      const tongoAmount = erc20Amount / token.rate;
      if (tongoAmount <= 0n) {
        w.setError("Amount too small");
        return;
      }
      const hash = await w.fund(tongoAmount);
      if (hash) setTxHash(hash);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[580px] bg-cloak-bg p-6 animate-fade-in">
      <Header title="Shield Funds" onBack={onBack} />

      <p className="text-cloak-text-dim text-xs mb-4">
        Move {w.selectedToken} from your public balance into a shielded account.
      </p>

      <div className="mb-4">
        <label className="text-xs text-cloak-text-dim mb-1.5 block">Amount ({w.selectedToken})</label>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="w-full px-4 py-3 rounded-xl bg-cloak-card border border-cloak-border text-cloak-text text-lg font-mono placeholder:text-cloak-muted focus:outline-none focus:border-cloak-primary/50"
        />
      </div>

      {txHash && <TxSuccess hash={txHash} />}

      {w.error && <ErrorBox message={w.error} onDismiss={() => w.setError(null)} />}

      <button
        onClick={handleSubmit}
        disabled={loading || !amount}
        className="mt-auto w-full py-3 rounded-xl bg-cloak-primary hover:bg-cloak-primary-hover text-white font-medium transition-colors disabled:opacity-50"
      >
        {loading ? "Shielding..." : `Shield ${w.selectedToken}`}
      </button>
    </div>
  );
}

// ─── Shared sub-components ──────────────────────────────────────────

export function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <button onClick={onBack} className="text-cloak-text-dim hover:text-cloak-text transition-colors">
        <ArrowLeft className="w-[18px] h-[18px]" />
      </button>
      <h2 className="text-cloak-text font-semibold">{title}</h2>
    </div>
  );
}

export function TxSuccess({ hash }: { hash: string }) {
  return (
    <div className="bg-green-900/20 border border-green-800/30 rounded-xl p-3 mb-4">
      <p className="text-green-400 text-xs font-medium">Transaction submitted!</p>
      <p className="text-green-400/70 text-[11px] font-mono mt-1 break-all">{hash}</p>
    </div>
  );
}

export function ErrorBox({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="p-3 bg-red-900/30 border border-red-800/50 rounded-lg mb-4">
      <p className="text-red-400 text-xs">{message}</p>
      <button onClick={onDismiss} className="text-red-500 text-xs underline mt-1">Dismiss</button>
    </div>
  );
}
