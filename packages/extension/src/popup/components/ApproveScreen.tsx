import React, { useEffect, useState } from "react";

interface PendingRequest {
  id: string;
  method: string;
  params?: any;
  origin?: string;
}

interface ApprovalFlowMeta {
  is2FA: boolean;
  isWard: boolean;
  needsWard2FA: boolean;
  needsGuardian: boolean;
  needsGuardian2FA: boolean;
  shouldWaitForExternalApproval: boolean;
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

function getApprovalFlowMeta(params?: any): ApprovalFlowMeta {
  const fallback2FA = !!params?._is2FA;
  const legacyMeta: ApprovalFlowMeta = {
    is2FA: fallback2FA,
    isWard: !!params?._isWard,
    needsWard2FA: !!params?._needsWard2FA,
    needsGuardian: !!params?._needsGuardian,
    needsGuardian2FA: !!params?._needsGuardian2FA,
    shouldWaitForExternalApproval: !!params?._postApproveWait || fallback2FA,
  };

  const raw = params?._approvalFlow;
  if (!raw || typeof raw !== "object") return legacyMeta;
  return {
    is2FA: !!raw.is2FA,
    isWard: !!raw.isWard,
    needsWard2FA: !!raw.needsWard2FA,
    needsGuardian: !!raw.needsGuardian,
    needsGuardian2FA: !!raw.needsGuardian2FA,
    shouldWaitForExternalApproval: !!raw.shouldWaitForExternalApproval,
  };
}

function getInitialWaitingStatus(meta: ApprovalFlowMeta): string {
  if (meta.isWard) {
    if (meta.needsWard2FA) return "Waiting for ward mobile signature...";
    if (meta.needsGuardian) return "Waiting for guardian approval...";
    return "Submitting ward transaction...";
  }
  if (meta.is2FA) return "Waiting for mobile 2FA approval...";
  return "Submitting transaction...";
}

function getFlowNotice(meta: ApprovalFlowMeta): string | null {
  if (!meta.shouldWaitForExternalApproval) return null;
  if (meta.isWard) {
    if (meta.needsWard2FA && meta.needsGuardian) {
      return meta.needsGuardian2FA
        ? "After approving here, this request goes to ward mobile first, then guardian mobile (guardian 2FA enabled)."
        : "After approving here, this request goes to ward mobile first, then guardian mobile.";
    }
    if (meta.needsWard2FA) {
      return "After approving here, ward mobile signature is required before execution.";
    }
    if (meta.needsGuardian) {
      return meta.needsGuardian2FA
        ? "After approving here, guardian approval is required (guardian 2FA enabled)."
        : "After approving here, guardian approval is required on mobile.";
    }
    return "This transaction will continue in the approval flow.";
  }
  if (meta.is2FA) {
    return "Two-Factor Authentication is enabled. After approving here, confirm on your mobile device.";
  }
  return null;
}

function getWaitingTitle(meta: ApprovalFlowMeta): string {
  if (meta.isWard) return "Waiting for Ward/Guardian Approval";
  if (meta.is2FA) return "Waiting for 2FA Approval";
  return "Submitting Transaction";
}

function getWaitingSubtitle(meta: ApprovalFlowMeta): string {
  if (meta.isWard) {
    if (meta.needsWard2FA && meta.needsGuardian) return "Approval chain: ward mobile -> guardian mobile";
    if (meta.needsWard2FA) return "Approval chain: ward mobile";
    if (meta.needsGuardian) return "Approval chain: guardian mobile";
  }
  if (meta.is2FA) return "Approval chain: mobile 2FA";
  return "Please keep this window open";
}

export default function ApproveScreen() {
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const [loading, setLoading] = useState(true);

  const [waitingApproval, setWaitingApproval] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState("Preparing...");
  const [approvalComplete, setApprovalComplete] = useState(false);
  const [approvalApproved, setApprovalApproved] = useState(false);

  const flowMeta = getApprovalFlowMeta(request?.params);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_PENDING_APPROVAL" }, (response) => {
      if (response?.data) setRequest(response.data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!waitingApproval) return;

    const listener = (msg: any) => {
      if (msg.type === "2FA_STATUS_UPDATE") {
        setApprovalStatus(msg.status);
      }
      if (msg.type === "2FA_COMPLETE") {
        setApprovalComplete(true);
        setApprovalApproved(!!msg.approved);
        setApprovalStatus(msg.approved ? "Approved!" : (msg.error || "Rejected"));
        setTimeout(() => window.close(), 2000);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [waitingApproval]);

  const handleApprove = () => {
    if (!request) return;
    chrome.runtime.sendMessage({
      type: "RESOLVE_APPROVAL",
      id: request.id,
      approved: true,
    });

    if (flowMeta.shouldWaitForExternalApproval) {
      setWaitingApproval(true);
      setApprovalStatus(getInitialWaitingStatus(flowMeta));
      return;
    }
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

  if (waitingApproval) {
    return (
      <div className="flex flex-col h-screen bg-[#0F172A] text-white">
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
          <p className="text-xs text-gray-400">{getWaitingSubtitle(flowMeta)}</p>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6">
          {!approvalComplete && (
            <div className="relative mb-6">
              <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center animate-pulse">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-blue-400"
                >
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                  <line x1="12" y1="18" x2="12.01" y2="18" />
                </svg>
              </div>
              <div className="absolute inset-0 w-16 h-16 rounded-full bg-blue-500/10 animate-ping" />
            </div>
          )}

          {approvalComplete && (
            <div className="mb-6">
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center ${
                  approvalApproved ? "bg-green-500/20" : "bg-red-500/20"
                }`}
              >
                {approvalApproved ? (
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-green-400"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-red-400"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                )}
              </div>
            </div>
          )}

          <p className="text-sm font-medium text-white mb-2 text-center">
            {approvalComplete
              ? approvalApproved
                ? "Transaction Approved!"
                : "Transaction Failed"
              : getWaitingTitle(flowMeta)}
          </p>
          <p className="text-xs text-gray-400 mb-6 text-center break-words">{approvalStatus}</p>

          {!approvalComplete && (
            <button
              onClick={() => window.close()}
              className="px-6 py-2 rounded-xl text-sm font-medium bg-[#1E293B] border border-[#334155] text-gray-300 hover:bg-[#334155] transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  const label = METHOD_LABELS[request.method] || request.method;
  const isFundMethod = FUND_METHODS.includes(request.method);
  const token = request.params?.token || "STRK";
  const amount = request.params?.amount;
  const recipient = request.params?.to;
  const flowNotice = getFlowNotice(flowMeta);

  return (
    <div className="flex flex-col h-screen bg-[#0F172A] text-white">
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

      <div className="flex-1 px-5 py-4 overflow-y-auto">
        {request.origin && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-[#1E293B] border border-[#334155]">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">
              Requesting site
            </p>
            <p className="text-xs font-mono text-gray-300 truncate">{request.origin}</p>
          </div>
        )}

        <div className="mb-4 px-3 py-2 rounded-lg bg-[#1E293B] border border-[#334155]">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">
            Action
          </p>
          <p className="text-sm font-semibold text-white">{label}</p>
        </div>

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

        {flowNotice && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <p className="text-xs text-blue-400">{flowNotice}</p>
          </div>
        )}

        <div className="mt-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-xs text-amber-400">
            Only approve transactions from sites you trust. This action cannot
            be undone.
          </p>
        </div>
      </div>

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
