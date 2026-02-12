import React from "react";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { Header } from "./ShieldForm";

interface Props {
  txHash: string;
  onBack: () => void;
}

export function ClaimSuccessScreen({ txHash, onBack }: Props) {
  const explorerUrl = `https://sepolia.starkscan.co/tx/${txHash}`;

  return (
    <div className="flex flex-col h-[580px] bg-cloak-bg p-6 animate-fade-in">
      <Header title="Claim Successful" onBack={onBack} />

      <div className="flex flex-col items-center justify-center flex-1">
        <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
        <h3 className="text-lg font-semibold text-cloak-text mb-2">Pending Funds Claimed!</h3>
        <p className="text-sm text-cloak-text-dim text-center mb-6">
          Your pending funds have been successfully added to your balance.
        </p>

        <div className="w-full bg-cloak-card border border-cloak-border rounded-xl p-4 mb-6">
          <p className="text-xs text-cloak-text-dim mb-1">Transaction Hash</p>
          <p className="text-xs font-mono text-cloak-text break-all">{txHash}</p>
        </div>

        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-cloak-primary hover:text-cloak-primary-hover transition-colors"
        >
          View on Explorer
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      <button
        onClick={onBack}
        className="w-full py-3 rounded-xl bg-cloak-primary hover:bg-cloak-primary-hover text-white font-medium transition-colors"
      >
        Done
      </button>
    </div>
  );
}
