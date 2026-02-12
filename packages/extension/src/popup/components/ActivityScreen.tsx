import React from "react";
import { ArrowLeft, ShieldPlus, ShieldOff, ArrowUpFromLine, RefreshCw, ExternalLink } from "lucide-react";
import { useTxHistory, type TxEvent } from "../hooks/useTxHistory";

interface Props {
  onBack: () => void;
}

function TxIcon({ type }: { type: string }) {
  switch (type) {
    case "fund": return <ShieldPlus className="w-[18px] h-[18px] text-green-400" />;
    case "transfer":
    case "transferOut":
    case "send": return <ArrowUpFromLine className="w-[18px] h-[18px] text-cloak-primary" />;
    case "withdraw": return <ShieldOff className="w-[18px] h-[18px] text-cloak-secondary" />;
    default: return <RefreshCw className="w-[18px] h-[18px] text-cloak-text-dim" />;
  }
}

function TxLabel({ type }: { type: string }) {
  switch (type) {
    case "fund": return "Shield";
    case "transfer":
    case "transferOut":
    case "send": return "Send";
    case "transferIn":
    case "receive": return "Receive";
    case "withdraw": return "Unshield";
    case "rollover": return "Claim";
    default: return type;
  }
}

export function ActivityScreen({ onBack }: Props) {
  const { events, isLoading, error, refresh } = useTxHistory();

  return (
    <div className="flex flex-col h-[580px] bg-cloak-bg animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 pt-6 pb-4">
        <button onClick={onBack} className="text-cloak-text-dim hover:text-cloak-text transition-colors">
          <ArrowLeft className="w-[18px] h-[18px]" />
        </button>
        <h2 className="text-cloak-text font-semibold flex-1">Activity</h2>
        <button onClick={refresh} className="text-cloak-text-dim hover:text-cloak-text transition-colors">
          <RefreshCw className={`w-[16px] h-[16px] ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6">
        {error && (
          <div className="p-3 bg-red-900/30 border border-red-800/50 rounded-lg mb-4">
            <p className="text-red-400 text-xs">{error}</p>
          </div>
        )}

        {events.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <p className="text-cloak-text-dim text-sm">No transactions yet</p>
            <p className="text-cloak-muted text-xs mt-1">Your activity will appear here</p>
          </div>
        )}

        {isLoading && events.length === 0 && (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-cloak-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        <div className="flex flex-col gap-2">
          {events.map((tx, i) => (
            <div key={tx.txHash || i} className="flex items-center gap-3 p-3 rounded-xl bg-cloak-card border border-cloak-border-light">
              <TxIcon type={tx.type} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-cloak-text capitalize">
                    <TxLabel type={tx.type} />
                  </span>
                  {tx.amount && (
                    <span className="text-sm text-cloak-text font-mono">{tx.amount} units</span>
                  )}
                </div>
                {tx.note && (
                  <p className="text-[11px] text-cloak-text-dim mt-0.5 truncate">{tx.note}</p>
                )}
                {tx.recipientName && (
                  <p className="text-[11px] text-cloak-text-dim mt-0.5">to {tx.recipientName}</p>
                )}
              </div>
              {tx.txHash && (
                <a
                  href={`https://sepolia.voyager.online/tx/${tx.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cloak-muted hover:text-cloak-primary transition-colors shrink-0"
                >
                  <ExternalLink className="w-[14px] h-[14px]" />
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
