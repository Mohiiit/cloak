import React, { useEffect, useState, useRef, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────────────────
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

type TerminalState = "success" | "rejected" | "expired" | null;

// ─── Constants ──────────────────────────────────────────────────────
const APPROVAL_TIMEOUT_SECONDS = 600; // 10 minutes

const METHOD_LABELS: Record<string, string> = {
  cloak_fund: "Shield Tokens",
  cloak_transfer: "Private Transfer",
  cloak_withdraw: "Unshield Tokens",
  cloak_rollover: "Claim Pending",
  wallet_addInvokeTransaction: "Execute Transaction",
  wallet_signTypedData: "Sign Message",
};

const FUND_METHODS = ["cloak_fund", "cloak_transfer", "cloak_withdraw"];

// ─── Helpers ────────────────────────────────────────────────────────
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

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
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

/** Info notice text for the initial approval screen */
function getFlowNotice(meta: ApprovalFlowMeta): string {
  if (meta.isWard) {
    if (meta.needsWard2FA) return "Next: a 10:00 approval window starts for 2FA + guardian.";
    if (meta.needsGuardian) return "Next: a 10:00 approval window starts for guardian approval.";
  }
  if (meta.is2FA) return "Next: a 10:00 approval window starts for mobile 2FA.";
  return "Next: a 10:00 approval window starts.";
}

// ─── Shared Sub-Components ──────────────────────────────────────────

/** Cloak Wallet header bar */
function WalletHeader({ subtitle, iconColor }: { subtitle: string; iconColor?: string }) {
  const color = iconColor || "#3B82F6";
  return (
    <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #1E293B" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: `linear-gradient(135deg, ${color}, #7C3AED)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#F8FAFC" }}>Cloak Wallet</span>
      </div>
      <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>{subtitle}</p>
    </div>
  );
}

/** Transaction detail card (dark bg, labeled rows) */
function TxDetailCard({ origin, action, amount, token, recipient }: {
  origin?: string; action: string; amount?: string; token: string; recipient?: string;
}) {
  return (
    <div style={{
      borderRadius: 10, backgroundColor: "#0F172A", border: "1px solid #1E293B",
      padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10,
    }}>
      {origin && (
        <div>
          <p style={{ fontSize: 9, fontWeight: 600, color: "#64748B", letterSpacing: "1.2px", textTransform: "uppercase", margin: 0 }}>Requesting Site</p>
          <p style={{ fontSize: 12, color: "#CBD5E1", fontFamily: "'JetBrains Mono', monospace", margin: "2px 0 0" }}>{origin}</p>
        </div>
      )}
      <div>
        <p style={{ fontSize: 9, fontWeight: 600, color: "#64748B", letterSpacing: "1.2px", textTransform: "uppercase", margin: 0 }}>Action</p>
        <p style={{ fontSize: 14, fontWeight: 600, color: "#F8FAFC", margin: "2px 0 0" }}>{action}</p>
      </div>
      {amount && (
        <div>
          <p style={{ fontSize: 9, fontWeight: 600, color: "#64748B", letterSpacing: "1.2px", textTransform: "uppercase", margin: 0 }}>Amount</p>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#F59E0B", fontFamily: "'JetBrains Mono', monospace", margin: "2px 0 0" }}>
            {formatAmount(amount, token)}
          </p>
        </div>
      )}
      {recipient && (
        <div>
          <p style={{ fontSize: 9, fontWeight: 600, color: "#64748B", letterSpacing: "1.2px", textTransform: "uppercase", margin: 0 }}>Recipient</p>
          <p style={{ fontSize: 12, color: "#CBD5E1", fontFamily: "'JetBrains Mono', monospace", margin: "2px 0 0" }}>{truncateAddress(recipient)}</p>
        </div>
      )}
    </div>
  );
}

/** Colored info box */
function InfoBox({ children, color }: { children: React.ReactNode; color: "blue" | "amber" | "green" | "red" | "gray" }) {
  const styles: Record<string, { bg: string; border: string; text: string }> = {
    blue: { bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.2)", text: "#60A5FA" },
    amber: { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)", text: "#FBBF24" },
    green: { bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.2)", text: "#34D399" },
    red: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.2)", text: "#F87171" },
    gray: { bg: "rgba(100,116,139,0.06)", border: "rgba(100,116,139,0.15)", text: "#94A3B8" },
  };
  const s = styles[color];
  return (
    <div style={{ borderRadius: 8, backgroundColor: s.bg, border: `1px solid ${s.border}`, padding: "8px 12px" }}>
      <p style={{ fontSize: 12, color: s.text, margin: 0, lineHeight: 1.4 }}>{children}</p>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────
export default function ApproveScreen() {
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const [loading, setLoading] = useState(true);

  const [waitingApproval, setWaitingApproval] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState("Preparing...");
  const [terminal, setTerminal] = useState<TerminalState>(null);

  // Countdown timer
  const [timeLeft, setTimeLeft] = useState(APPROVAL_TIMEOUT_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flowMeta = getApprovalFlowMeta(request?.params);
  const token = request?.params?.token || "STRK";
  const amount = request?.params?.amount;
  const recipient = request?.params?.to;
  const label = request ? (METHOD_LABELS[request.method] || request.method) : "";
  const isFundMethod = request ? FUND_METHODS.includes(request.method) : false;

  // Start countdown timer
  const startTimer = useCallback(() => {
    setTimeLeft(APPROVAL_TIMEOUT_SECONDS);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setTerminal("expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Fetch pending request
  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_PENDING_APPROVAL" }, (response) => {
      if (response?.data) setRequest(response.data);
      setLoading(false);
    });
  }, []);

  // Listen for status updates
  useEffect(() => {
    if (!waitingApproval) return;
    const listener = (msg: any) => {
      if (msg.type === "2FA_STATUS_UPDATE") {
        setApprovalStatus(msg.status);
      }
      if (msg.type === "2FA_COMPLETE") {
        if (timerRef.current) clearInterval(timerRef.current);
        if (msg.approved) {
          setTerminal("success");
        } else {
          setTerminal("rejected");
          setApprovalStatus(msg.error || "Rejected");
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [waitingApproval]);

  // Auto-close on success, rejected, and expired — unless it's a chain error
  useEffect(() => {
    if (terminal === "success" || terminal === "expired") {
      const t = setTimeout(() => window.close(), 3000);
      return () => clearTimeout(t);
    }
    if (terminal === "rejected") {
      const s = (approvalStatus || "").toLowerCase();
      // Chain errors contain technical details — keep window open for those
      const isChainError = s.includes("execution_reverted") || s.includes("revert") ||
        s.includes("insufficient") || s.includes("nonce") || s.includes("gas") ||
        s.includes("0x") || s.includes("error:") || s.includes("failed to");
      if (!isChainError) {
        const t = setTimeout(() => window.close(), 3000);
        return () => clearTimeout(t);
      }
    }
  }, [terminal, approvalStatus]);

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
      startTimer();
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

  // ─── Loading ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0A0F1C]">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0A0F1C] text-white p-6">
        <p className="text-sm text-gray-400">No pending transaction.</p>
        <button onClick={() => window.close()} className="mt-4 text-xs text-blue-400 hover:text-blue-300">Close</button>
      </div>
    );
  }

  // ─── Terminal: Success (NAnyN) ──────────────────────────────────
  if (terminal === "success") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#0A0F1C", color: "#F8FAFC" }}>
        <WalletHeader subtitle="Transaction submitted" iconColor="#10B981" />
        <div style={{ flex: 1, padding: "16px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <TxDetailCard origin={request.origin} action={label} amount={isFundMethod ? amount : undefined} token={token} recipient={recipient} />
          <InfoBox color="green">Transaction submitted successfully.</InfoBox>
          <InfoBox color="gray">This window will close automatically in a few seconds.</InfoBox>
        </div>
        <div style={{ padding: "12px 20px 20px", borderTop: "1px solid #1E293B", display: "flex", justifyContent: "center" }}>
          <button onClick={() => window.close()} style={{
            width: "100%", height: 40, borderRadius: 12, backgroundColor: "#1E293B", border: "1px solid #334155",
            color: "#94A3B8", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>Close</button>
        </div>
      </div>
    );
  }

  // ─── Terminal: Rejected (mdt3i) ─────────────────────────────────
  if (terminal === "rejected") {
    const s = (approvalStatus || "").toLowerCase();
    const isChainError = s.includes("execution_reverted") || s.includes("revert") ||
      s.includes("insufficient") || s.includes("nonce") || s.includes("gas") ||
      s.includes("0x") || s.includes("error:") || s.includes("failed to");
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#0A0F1C", color: "#F8FAFC" }}>
        <WalletHeader subtitle={isChainError ? "Transaction failed" : "Request rejected"} iconColor="#EF4444" />
        <div style={{ flex: 1, padding: "16px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <TxDetailCard origin={request.origin} action={label} amount={isFundMethod ? amount : undefined} token={token} recipient={recipient} />
          {isChainError ? (
            <>
              <InfoBox color="red">Transaction failed on-chain.</InfoBox>
              <div style={{
                borderRadius: 8, backgroundColor: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
                padding: "8px 12px", maxHeight: 120, overflowY: "auto",
              }}>
                <p style={{ fontSize: 11, color: "#F87171", margin: 0, lineHeight: 1.5, fontFamily: "'JetBrains Mono', monospace", wordBreak: "break-all" }}>
                  {approvalStatus}
                </p>
              </div>
            </>
          ) : (
            <>
              <InfoBox color="red">This transfer was rejected. No on-chain action was taken.</InfoBox>
              <InfoBox color="gray">This window will close automatically.</InfoBox>
            </>
          )}
        </div>
        <div style={{ padding: "12px 20px 20px", borderTop: "1px solid #1E293B", display: "flex", justifyContent: "center" }}>
          <button onClick={() => window.close()} style={{
            width: "100%", height: 40, borderRadius: 12, backgroundColor: "#1E293B", border: "1px solid #334155",
            color: "#94A3B8", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>Close</button>
        </div>
      </div>
    );
  }

  // ─── Terminal: Expired (ULAlQ) ──────────────────────────────────
  if (terminal === "expired") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#0A0F1C", color: "#F8FAFC" }}>
        <WalletHeader subtitle="Request expired" iconColor="#F59E0B" />
        <div style={{ flex: 1, padding: "16px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <TxDetailCard origin={request.origin} action={label} amount={isFundMethod ? amount : undefined} token={token} recipient={recipient} />
          <InfoBox color="amber">This approval request expired.</InfoBox>
          <InfoBox color="gray">This window will close automatically.</InfoBox>
        </div>
        <div style={{ padding: "12px 20px 20px", borderTop: "1px solid #1E293B", display: "flex", justifyContent: "center" }}>
          <button onClick={() => window.close()} style={{
            width: "100%", height: 40, borderRadius: 12, backgroundColor: "#1E293B", border: "1px solid #334155",
            color: "#94A3B8", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>Close</button>
        </div>
      </div>
    );
  }

  // ─── Waiting Screen (eX8pN / I0KJN / OwfM3) ───────────────────
  if (waitingApproval) {
    const statusLower = approvalStatus.toLowerCase();
    const phase: "init" | "2fa" | "guardian" | "done" =
      statusLower.includes("guardian") ? "guardian"
      : statusLower.includes("ward mobile") || statusLower.includes("ward signing") ? "2fa"
      : "init";
    const tfaDone = phase === "guardian";
    const guardianActive = phase === "guardian" || (!flowMeta.needsWard2FA);
    const showWardSteps = flowMeta.isWard;
    const show2FAStep = flowMeta.needsWard2FA;

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#0A0F1C", color: "#F8FAFC" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 20px", gap: 14 }}>
          {/* Title */}
          <h3 style={{ fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: "#F8FAFC", textAlign: "center", margin: 0, whiteSpace: "pre-line" }}>
            {showWardSteps
              ? (show2FAStep ? "Approvals Required" : "Guardian Approval\nRequired")
              : "Waiting for Mobile\nApproval"}
          </h3>

          {/* Subtitle */}
          <p style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", margin: 0, lineHeight: 1.4, whiteSpace: "pre-line" }}>
            {showWardSteps
              ? (show2FAStep
                ? "This ward transaction requires\nboth 2FA and guardian approval."
                : "This request needs guardian approval only.")
              : "Approve this transaction on your\nmobile device to continue."}
          </p>

          {/* Timer pill — shown on all waiting screens */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            borderRadius: 20, padding: "6px 14px",
            backgroundColor: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.25)",
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: "#FBBF24" }}>
              Time left: {formatTime(timeLeft)}
            </span>
          </div>

          {showWardSteps ? (
            /* ── Ward step indicators ── */
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
              {/* 2FA step (only if ward has 2FA) */}
              {show2FAStep && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  borderRadius: 10, padding: "10px 12px",
                  backgroundColor: tfaDone ? "rgba(16, 185, 129, 0.08)" : "rgba(139, 92, 246, 0.08)",
                  border: `1px solid ${tfaDone ? "rgba(16, 185, 129, 0.25)" : "rgba(139, 92, 246, 0.2)"}`,
                }}>
                  {tfaDone ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="waiting-spin" style={{ flexShrink: 0 }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                  )}
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: tfaDone ? "#10B981" : "#C4B5FD", margin: 0 }}>
                      {tfaDone ? "2FA Approved" : "2FA Approval"}
                    </p>
                    <p style={{ fontSize: 10, color: "#64748B", margin: 0 }}>
                      {tfaDone ? "Biometric verified on mobile" : "Waiting for mobile verification..."}
                    </p>
                  </div>
                </div>
              )}

              {/* Guardian step */}
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                borderRadius: 10, padding: "10px 12px",
                backgroundColor: guardianActive ? "rgba(245, 158, 11, 0.08)" : "rgba(100, 116, 139, 0.06)",
                border: `1px solid ${guardianActive ? "rgba(245, 158, 11, 0.25)" : "rgba(100, 116, 139, 0.15)"}`,
              }}>
                {guardianActive ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="waiting-spin" style={{ flexShrink: 0 }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                ) : (
                  <div style={{ width: 20, height: 20, borderRadius: 10, border: "1.5px solid #475569", flexShrink: 0 }} />
                )}
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: guardianActive ? "#FBBF24" : "#64748B", margin: 0 }}>
                    Guardian Approval
                  </p>
                  <p style={{ fontSize: 10, color: "#64748B", margin: 0 }}>
                    {guardianActive ? "Waiting for guardian to approve..." : "Pending previous step"}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* ── 2FA-only: action card + polling dots ── */
            <>
              <div style={{ width: "100%", borderRadius: 10, backgroundColor: "#0F172A", padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#64748B" }}>Action</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: "#F8FAFC" }}>{approvalStatus}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="animate-poll-dot-1" style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#8B5CF6" }} />
                <span className="animate-poll-dot-2" style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#8B5CF6" }} />
                <span className="animate-poll-dot-3" style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#8B5CF6" }} />
                <span style={{ fontSize: 10, color: "#64748B", marginLeft: 2 }}>Polling...</span>
              </div>
            </>
          )}

          {/* Detail card with Amount / To / Time left */}
          <div style={{
            width: "100%", borderRadius: 10, backgroundColor: "#0F172A",
            padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6,
          }}>
            {amount && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#64748B" }}>Amount</span>
                <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: "#F8FAFC" }}>
                  {formatAmount(amount, token)}
                </span>
              </div>
            )}
            {recipient && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#64748B" }}>To</span>
                <span style={{ fontSize: 11, fontWeight: 500, fontFamily: "'JetBrains Mono', monospace", color: "#F8FAFC" }}>
                  {truncateAddress(recipient)}
                </span>
              </div>
            )}
          </div>

          {/* Cancel */}
          <button
            onClick={() => window.close()}
            style={{
              width: "100%", height: 40, borderRadius: 10,
              backgroundColor: "transparent", border: "1px solid #334155",
              fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
              color: "#94A3B8", cursor: "pointer",
            }}
          >
            Cancel Request
          </button>
        </div>

        <style>{`
          @keyframes pollingDot { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }
          .animate-poll-dot-1 { animation: pollingDot 1.4s ease-in-out infinite; }
          .animate-poll-dot-2 { animation: pollingDot 1.4s ease-in-out 0.2s infinite; }
          .animate-poll-dot-3 { animation: pollingDot 1.4s ease-in-out 0.4s infinite; }
          @keyframes waiting-spin { to { transform: rotate(360deg); } }
          .waiting-spin { animation: waiting-spin 1.5s linear infinite; }
        `}</style>
      </div>
    );
  }

  // ─── Initial Approval Screen (zba54) ────────────────────────────
  const flowNotice = getFlowNotice(flowMeta);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#0A0F1C", color: "#F8FAFC" }}>
      <WalletHeader subtitle={`Transaction approval required (${formatTime(APPROVAL_TIMEOUT_SECONDS)} expiry)`} />

      <div style={{ flex: 1, padding: "16px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        <TxDetailCard
          origin={request.origin}
          action={label}
          amount={isFundMethod ? amount : undefined}
          token={token}
          recipient={recipient}
        />

        {flowMeta.shouldWaitForExternalApproval && (
          <InfoBox color="blue">{flowNotice}</InfoBox>
        )}

        <InfoBox color="amber">Only approve requests from sites you trust. This action cannot be undone.</InfoBox>
      </div>

      <div style={{ padding: "12px 20px 20px", borderTop: "1px solid #1E293B", display: "flex", gap: 12 }}>
        <button
          onClick={handleReject}
          style={{
            flex: 1, height: 40, borderRadius: 12, backgroundColor: "#1E293B", border: "1px solid #334155",
            color: "#94A3B8", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          Reject
        </button>
        <button
          onClick={handleApprove}
          style={{
            flex: 1, height: 40, borderRadius: 12, backgroundColor: "#3B82F6", border: "none",
            color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          Approve & Next
        </button>
      </div>
    </div>
  );
}
