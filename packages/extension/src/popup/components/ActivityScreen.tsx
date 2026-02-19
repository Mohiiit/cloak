import React from "react";
import { ArrowLeft, ShieldPlus, ShieldOff, ArrowUpFromLine, RefreshCw, ExternalLink, Shield, Wallet, Settings } from "lucide-react";
import { toDisplayString } from "@cloak-wallet/sdk";
import { useTxHistory, type TxEvent } from "../hooks/useTxHistory";

interface Props {
  onBack: () => void;
  walletAddress?: string;
}

/** Check if this is a guardian-submitted ward operation (not the guardian's own tx) */
function isGuardianWardOp(tx: TxEvent): boolean {
  return tx.accountType === "guardian" && ["fund", "transfer", "withdraw", "rollover"].includes(tx.type);
}

/** Check if the amount is stored in ERC-20 display format */
function isErc20Display(tx: TxEvent): boolean {
  return tx.amount_unit === "erc20_display" || tx.type === "erc20_transfer" ||
    tx.type === "fund_ward" || tx.type === "configure_ward" || tx.type === "deploy_ward";
}

function TxIcon({ type }: { type: string }) {
  switch (type) {
    case "fund": return <ShieldPlus className="w-[18px] h-[18px] text-green-400" />;
    case "transfer":
    case "transferOut":
    case "send": return <ArrowUpFromLine className="w-[18px] h-[18px] text-cloak-primary" />;
    case "erc20_transfer": return <ArrowUpFromLine className="w-[18px] h-[18px] text-orange-400" />;
    case "withdraw": return <ShieldOff className="w-[18px] h-[18px] text-cloak-secondary" />;
    case "deploy_ward": return <Shield className="w-[18px] h-[18px] text-cloak-secondary" />;
    case "fund_ward": return <Wallet className="w-[18px] h-[18px] text-cloak-secondary" />;
    case "configure_ward": return <Settings className="w-[18px] h-[18px] text-cloak-secondary" />;
    default: return <RefreshCw className="w-[18px] h-[18px] text-cloak-text-dim" />;
  }
}

function TxLabel({ tx }: { tx: TxEvent }) {
  if (isGuardianWardOp(tx)) {
    switch (tx.type) {
      case "fund": return "Ward: Shield";
      case "transfer": return "Ward: Send";
      case "withdraw": return "Ward: Unshield";
      case "rollover": return "Ward: Claim";
    }
  }
  switch (tx.type) {
    case "fund": return "Shield";
    case "transfer":
    case "transferOut":
    case "send": return "Send";
    case "erc20_transfer": return "Public Send";
    case "transferIn":
    case "receive": return "Receive";
    case "withdraw": return "Unshield";
    case "rollover": return "Claim";
    case "deploy_ward": return "Deploy Ward";
    case "fund_ward": return "Fund Ward";
    case "configure_ward": return "Configure Ward";
    default: return tx.type;
  }
}

export function ActivityScreen({ onBack, walletAddress }: Props) {
  const { events, isLoading, error, refresh } = useTxHistory(walletAddress);

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
          {events.map((tx, i) => {
            const token = (tx.token || "STRK") as any;
            const hasAmount = !!tx.amount && tx.amount !== "0";
            const erc20 = isErc20Display(tx);
            const isWardAdmin = ["deploy_ward", "fund_ward", "configure_ward"].includes(tx.type);
            let amountDisplay = "";
            if (hasAmount && tx.amount) {
              if (erc20) {
                amountDisplay = `${tx.amount} ${token}`;
              } else {
                amountDisplay = `${tx.amount} units`;
              }
            } else if (isWardAdmin) {
              amountDisplay = "";
            }
            return (
              <div key={tx.txHash || i} className="flex items-center gap-3 p-3 rounded-xl bg-cloak-card border border-cloak-border-light">
                <TxIcon type={tx.type} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-cloak-text capitalize">
                      <TxLabel tx={tx} />
                    </span>
                    {amountDisplay && (
                      <span className="text-sm text-cloak-text font-mono">
                        {amountDisplay}
                      </span>
                    )}
                  </div>
                  {isGuardianWardOp(tx) && (
                    <span className="text-[10px] text-yellow-400 mt-0.5">Ward operation</span>
                  )}
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
            );
          })}
        </div>
      </div>
    </div>
  );
}
