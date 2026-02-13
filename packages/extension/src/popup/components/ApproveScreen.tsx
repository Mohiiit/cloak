import React, { useEffect, useState } from "react";

interface PendingRequest {
  id: string;
  method: string;
  params?: any;
  origin?: string;
}

/** Human-readable labels for RPC methods */
const METHOD_LABELS: Record<string, string> = {
  cloak_fund: "Shield Tokens",
  cloak_transfer: "Private Transfer",
  cloak_withdraw: "Unshield Tokens",
  cloak_rollover: "Claim Pending",
  wallet_addInvokeTransaction: "Execute Transaction",
  wallet_signTypedData: "Sign Message",
};

/** Methods that move funds — show amount/recipient */
const FUND_METHODS = ["cloak_fund", "cloak_transfer", "cloak_withdraw"];

function formatAmount(units: string, token: string): string {
  const n = parseInt(units, 10);
  if (isNaN(n)) return `${units} ${token}`;
  const strk = (n * 0.05).toFixed(2);
  return `${strk} ${token} (${n} unit${n !== 1 ? "s" : ""})`;
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr || "—";
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

export default function ApproveScreen() {
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get the pending request from background
    chrome.runtime.sendMessage({ type: "GET_PENDING_APPROVAL" }, (response) => {
      if (response?.data) {
        setRequest(response.data);
      }
      setLoading(false);
    });
  }, []);

  const handleApprove = () => {
    if (!request) return;
    chrome.runtime.sendMessage({
      type: "RESOLVE_APPROVAL",
      id: request.id,
      approved: true,
    });
    window.close();
  };

  const handleReject = () => {
    if (!request) return;
    chrome.runtime.sendMessage({
      type: "RESOLVE_APPROVAL",
      id: request.id,
      approved: false,
    });
    window.close();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0F172A]">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0F172A] text-white p-6">
        <p className="text-sm text-gray-400">No pending transaction.</p>
        <button
          onClick={() => window.close()}
          className="mt-4 text-xs text-blue-400 hover:text-blue-300"
        >
          Close
        </button>
      </div>
    );
  }

  const label = METHOD_LABELS[request.method] || request.method;
  const isFundMethod = FUND_METHODS.includes(request.method);
  const token = request.params?.token || "STRK";
  const amount = request.params?.amount;
  const recipient = request.params?.to;

  return (
    <div className="flex flex-col h-screen bg-[#0F172A] text-white">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 border-b border-[#334155]">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 512 512" fill="none">
              <path
                d="M256 52C220 52 186 72 164 104L96 208C80 232 72 260 72 290L72 360C72 380 80 398 96 410L144 448C152 454 162 456 172 454L196 444C204 442 210 436 214 428L232 384C240 368 256 360 256 360C256 360 272 368 280 384L298 428C302 436 308 442 316 444L340 454C350 456 360 454 368 448L416 410C432 398 440 380 440 360L440 290C440 260 432 232 416 208L348 104C326 72 292 52 256 52Z"
                fill="white"
              />
            </svg>
          </div>
          <span className="text-sm font-semibold">Cloak Wallet</span>
        </div>
        <p className="text-xs text-gray-400">Transaction approval required</p>
      </div>

      {/* Body */}
      <div className="flex-1 px-5 py-4 overflow-y-auto">
        {/* Origin */}
        {request.origin && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-[#1E293B] border border-[#334155]">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">
              Requesting site
            </p>
            <p className="text-xs font-mono text-gray-300 truncate">
              {request.origin}
            </p>
          </div>
        )}

        {/* Action */}
        <div className="mb-4 px-3 py-2 rounded-lg bg-[#1E293B] border border-[#334155]">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">
            Action
          </p>
          <p className="text-sm font-semibold text-white">{label}</p>
        </div>

        {/* Amount */}
        {isFundMethod && amount && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-[#1E293B] border border-[#334155]">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">
              Amount
            </p>
            <p className="text-sm font-semibold text-amber-400">
              {formatAmount(amount, token)}
            </p>
          </div>
        )}

        {/* Recipient */}
        {recipient && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-[#1E293B] border border-[#334155]">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">
              Recipient
            </p>
            <p className="text-xs font-mono text-gray-300">
              {truncateAddress(recipient)}
            </p>
          </div>
        )}

        {/* Warning */}
        <div className="mt-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-xs text-amber-400">
            Only approve transactions from sites you trust. This action cannot
            be undone.
          </p>
        </div>
      </div>

      {/* Buttons */}
      <div className="px-5 pb-5 pt-3 border-t border-[#334155] flex gap-3">
        <button
          onClick={handleReject}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[#1E293B] border border-[#334155] text-gray-300 hover:bg-[#334155] transition-colors"
        >
          Reject
        </button>
        <button
          onClick={handleApprove}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          Approve
        </button>
      </div>
    </div>
  );
}
