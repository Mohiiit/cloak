import React from "react";
import { Shield, Send, ArrowDownToLine } from "lucide-react";

interface Props {
  visible: boolean;
  action: "shield" | "send" | "withdraw" | "public send";
  token: string;
  amount: string;
  recipient?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const CONFIG = {
  shield: { title: "Confirm Shield", icon: Shield, verb: "Shield Tokens" },
  send: { title: "Confirm Transfer", icon: Send, verb: "Private Transfer" },
  "public send": { title: "Confirm Transfer", icon: Send, verb: "Public Transfer" },
  withdraw: { title: "Confirm Unshield", icon: ArrowDownToLine, verb: "Unshield Tokens" },
} as const;

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 16) return addr || "—";
  return `${addr.slice(0, 10)}...${addr.slice(-8)}`;
}

export function TxConfirmModal({ visible, action, token, amount, recipient, onConfirm, onCancel }: Props) {
  if (!visible) return null;

  const { title, icon: Icon, verb } = CONFIG[action];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-modal-overlay"
      onClick={onCancel}
    >
      <div
        className="w-[320px] bg-[#1E293B] border border-[#334155] rounded-2xl p-5 animate-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon + Title */}
        <div className="flex flex-col items-center mb-4">
          <div className="w-12 h-12 rounded-full bg-blue-500/15 flex items-center justify-center mb-3">
            <Icon className="w-6 h-6 text-blue-400" />
          </div>
          <h3 className="text-base font-semibold text-white">{title}</h3>
        </div>

        {/* Detail rows */}
        <div className="space-y-2 mb-4">
          <div className="px-3 py-2 rounded-lg bg-[#0F172A] border border-[#334155]">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Action</p>
            <p className="text-sm font-semibold text-white">{verb}</p>
          </div>

          <div className="px-3 py-2 rounded-lg bg-[#0F172A] border border-[#334155]">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Amount</p>
            <p className="text-sm font-semibold text-amber-400">{amount} {token}</p>
          </div>

          {recipient && (
            <div className="px-3 py-2 rounded-lg bg-[#0F172A] border border-[#334155]">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Recipient</p>
              <p className="text-xs font-mono text-gray-300">{truncateAddress(recipient)}</p>
            </div>
          )}
        </div>

        {/* Warning */}
        <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-5">
          <p className="text-xs text-amber-400">This action cannot be undone.</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[#0F172A] border border-[#334155] text-gray-300 hover:bg-[#334155] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
