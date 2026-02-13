"use client";

import { EXPLORER_BASE } from "@/lib/constants";
import { ExternalLink, X, Check } from "lucide-react";

interface SuccessModalProps {
  txHash: string;
  tierLabel: string;
  onClose: () => void;
}

export default function SuccessModal({
  txHash,
  tierLabel,
  onClose,
}: SuccessModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-cloak-card border border-cloak-border rounded-2xl p-6 sm:p-8 max-w-sm w-full shadow-2xl animate-fade-in">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-cloak-muted hover:text-cloak-text transition-colors"
        >
          <X size={18} />
        </button>

        {/* Confetti dots */}
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} className={`confetti-dot confetti-${i}`} />
          ))}
        </div>

        {/* Content */}
        <div className="flex flex-col items-center text-center relative z-10">
          {/* Check circle */}
          <div className="w-16 h-16 rounded-full bg-cloak-success/10 border-2 border-cloak-success flex items-center justify-center mb-4 animate-bounce-in">
            <Check size={32} className="text-cloak-success" />
          </div>

          <h3 className="text-xl font-bold text-cloak-text mb-1">
            Thank you!
          </h3>
          <p className="text-sm text-cloak-text-dim mb-6">
            You sent {tierLabel} privately via Cloak
          </p>

          {/* Tx hash */}
          <a
            href={`${EXPLORER_BASE}${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs font-mono text-cloak-primary hover:text-cloak-primary-hover transition-colors bg-cloak-bg rounded-lg px-4 py-2.5 border border-cloak-border w-full justify-center"
          >
            <span className="truncate">
              {txHash.slice(0, 10)}...{txHash.slice(-8)}
            </span>
            <ExternalLink size={12} className="flex-shrink-0" />
          </a>

          <button
            onClick={onClose}
            className="mt-6 w-full py-2.5 rounded-xl text-sm font-medium bg-cloak-bg-light border border-cloak-border text-cloak-text hover:bg-cloak-card-hover transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
