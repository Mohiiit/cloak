import React, { useState } from "react";
import { CheckCircle2, Copy, ExternalLink } from "lucide-react";

interface Props {
  visible: boolean;
  title: string;
  amount?: string;
  txHash: string;
  onDone: () => void;
}

function truncateHash(hash: string): string {
  if (!hash || hash.length < 20) return hash;
  return `${hash.slice(0, 14)}...${hash.slice(-10)}`;
}

export function TxSuccessModal({ visible, title, amount, txHash, onDone }: Props) {
  const [copied, setCopied] = useState(false);

  if (!visible) return null;

  const explorerUrl = `https://sepolia.voyager.online/tx/${txHash}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(txHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-modal-overlay">
      <div
        className="w-[320px] bg-[#1E293B] border border-green-800/40 rounded-2xl p-5 animate-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon + Title */}
        <div className="flex flex-col items-center mb-4">
          <CheckCircle2 className="w-14 h-14 text-green-500 mb-3" />
          <h3 className="text-base font-semibold text-white">{title}</h3>
          {amount && (
            <p className="text-sm text-amber-400 font-mono mt-1">{amount}</p>
          )}
        </div>

        {/* Tx hash section */}
        <div className="bg-[#0F172A] border border-[#334155] rounded-xl p-3 mb-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Transaction Hash</p>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-mono text-gray-300">{truncateHash(txHash)}</p>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-blue-400 hover:bg-blue-500/10 transition-colors"
            >
              <Copy className="w-3 h-3" />
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        {/* Explorer link */}
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors mb-5"
        >
          View on Voyager
          <ExternalLink className="w-3.5 h-3.5" />
        </a>

        {/* Done button */}
        <button
          onClick={onDone}
          className="w-full py-2.5 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
