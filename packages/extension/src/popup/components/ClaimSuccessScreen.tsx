import React, { useState } from "react";
import { CheckCircle2, ExternalLink, Copy } from "lucide-react";
import { Header } from "./ShieldForm";

interface Props {
  txHash: string;
  onBack: () => void;
}

export function ClaimSuccessScreen({ txHash, onBack }: Props) {
  const [copied, setCopied] = useState(false);
  const explorerUrl = `https://sepolia.voyager.online/tx/${txHash}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(txHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-mono text-cloak-text break-all flex-1">{txHash}</p>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-cloak-primary hover:bg-cloak-primary/10 transition-colors shrink-0"
            >
              <Copy className="w-3 h-3" />
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-cloak-primary hover:text-cloak-primary-hover transition-colors"
        >
          View on Voyager
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
