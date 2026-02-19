import React, { useEffect, useState, useRef } from "react";
import { Smartphone, ShieldCheck, CheckCircle, Loader } from "lucide-react";
import { FeeRetryModal } from "./FeeRetryModal";

interface Props {
  isOpen: boolean;
  status: string;
  onCancel: () => void;
  title?: string;
  subtitle?: string;
  isWard?: boolean;
  wardHas2fa?: boolean;
  amount?: string;
  token?: string;
  recipient?: string;
}

/** Determine ward approval phase from status string */
function getWardPhase(status: string): "init" | "2fa" | "guardian" | "done" {
  const s = status.toLowerCase();
  if (s.includes("approved!")) return "done";
  if (s.includes("guardian")) return "guardian";
  if (s.includes("ward mobile") || s.includes("ward signing")) return "2fa";
  return "init";
}

/** Truncate address for display: 0x04a3...8f2d */
function truncateAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr || "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/* ─── 2FA-only waiting (non-ward) ─── */
function TwoFAWaitingContent({ status, onCancel, title, subtitle }: {
  status: string; onCancel: () => void; title?: string; subtitle?: string;
}) {
  const displayTitle = title || "Waiting for Mobile\nApproval";
  const displaySubtitle = subtitle || "Approve this transaction on your\nmobile device to continue.";

  return (
    <div
      className="flex flex-col items-center border"
      style={{
        width: 310,
        borderRadius: 20,
        backgroundColor: "#1E293B",
        borderColor: "rgba(59, 130, 246, 0.2)",
        padding: "32px 20px 20px 20px",
        gap: 16,
      }}
    >
      {/* Phone icon */}
      <div
        className="flex items-center justify-center"
        style={{
          width: 60,
          height: 60,
          borderRadius: 30,
          backgroundColor: "rgba(139, 92, 246, 0.08)",
          border: "2px solid #8B5CF6",
        }}
      >
        <Smartphone style={{ width: 28, height: 28, color: "#8B5CF6" }} />
      </div>

      {/* Title */}
      <h3
        className="text-center"
        style={{
          fontSize: 16,
          fontWeight: 700,
          fontFamily: "'JetBrains Mono', monospace",
          color: "#F8FAFC",
          lineHeight: 1.3,
          margin: 0,
          whiteSpace: "pre-line",
        }}
      >
        {displayTitle}
      </h3>

      {/* Description */}
      <p
        className="text-center"
        style={{
          fontSize: 12,
          fontWeight: 400,
          fontFamily: "'Geist', sans-serif",
          color: "#94A3B8",
          lineHeight: 1.4,
          margin: 0,
          whiteSpace: "pre-line",
        }}
      >
        {displaySubtitle}
      </p>

      {/* Detail card */}
      <div
        className="w-full flex items-center justify-between"
        style={{
          borderRadius: 10,
          backgroundColor: "#0F172A",
          padding: 12,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 400, color: "#64748B" }}>Action</span>
        <span style={{ fontSize: 11, fontWeight: 500, color: "#F8FAFC" }}>
          {status || "Initializing..."}
        </span>
      </div>

      {/* Polling dots */}
      <div className="flex items-center justify-center" style={{ gap: 6 }}>
        <span className="animate-poll-dot-1" style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#8B5CF6" }} />
        <span className="animate-poll-dot-2" style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#8B5CF6" }} />
        <span className="animate-poll-dot-3" style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#8B5CF6" }} />
        <span style={{ fontSize: 10, fontWeight: 400, color: "#64748B", marginLeft: 2 }}>Polling...</span>
      </div>

      {/* Cancel */}
      <button
        onClick={onCancel}
        className="w-full flex items-center justify-center border hover:bg-[#0F172A] transition-colors"
        style={{
          height: 36,
          borderRadius: 10,
          backgroundColor: "transparent",
          borderColor: "rgba(59, 130, 246, 0.2)",
          fontSize: 12,
          fontWeight: 600,
          fontFamily: "'JetBrains Mono', monospace",
          color: "#94A3B8",
          cursor: "pointer",
        }}
      >
        Cancel
      </button>
    </div>
  );
}

/* ─── Ward multi-step approval ─── */
function WardWaitingContent({ status, onCancel, wardHas2fa, amount, token, recipient }: {
  status: string; onCancel: () => void; wardHas2fa?: boolean;
  amount?: string; token?: string; recipient?: string;
}) {
  const phase = getWardPhase(status);
  // 2FA step completed when we've moved past it
  const tfaDone = phase === "guardian" || phase === "done";
  // Guardian step active when in guardian phase
  const guardianActive = phase === "guardian";

  return (
    <div
      className="flex flex-col items-center border"
      style={{
        width: 310,
        borderRadius: 20,
        backgroundColor: "#1E293B",
        borderColor: "rgba(245, 158, 11, 0.19)",
        padding: "28px 20px 20px 20px",
        gap: 14,
      }}
    >
      {/* Title */}
      <h3
        className="text-center"
        style={{
          fontSize: 16,
          fontWeight: 700,
          fontFamily: "'JetBrains Mono', monospace",
          color: "#F8FAFC",
          lineHeight: 1.3,
          margin: 0,
        }}
      >
        {wardHas2fa ? "Approvals Required" : "Guardian Approval\nRequired"}
      </h3>

      {/* Subtitle */}
      <p
        className="text-center"
        style={{
          fontSize: 12,
          fontWeight: 400,
          fontFamily: "'Geist', sans-serif",
          color: "#94A3B8",
          lineHeight: 1.4,
          margin: 0,
        }}
      >
        {wardHas2fa
          ? "This ward transaction requires\nboth 2FA and guardian approval."
          : "Your guardian must approve this\ntransaction before it can proceed."}
      </p>

      {/* Step indicators */}
      <div className="w-full flex flex-col" style={{ gap: 8 }}>
        {/* 2FA step — only if ward has 2FA */}
        {wardHas2fa && (
          <div
            className="flex items-center"
            style={{
              borderRadius: 10,
              padding: "10px 12px",
              backgroundColor: tfaDone ? "rgba(16, 185, 129, 0.08)" : "rgba(139, 92, 246, 0.08)",
              border: `1px solid ${tfaDone ? "rgba(16, 185, 129, 0.25)" : "rgba(139, 92, 246, 0.2)"}`,
              gap: 10,
            }}
          >
            {tfaDone ? (
              <CheckCircle style={{ width: 20, height: 20, color: "#10B981", flexShrink: 0 }} />
            ) : (
              <Loader className="animate-spin" style={{ width: 20, height: 20, color: "#8B5CF6", flexShrink: 0 }} />
            )}
            <div className="flex flex-col" style={{ gap: 1 }}>
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace",
                color: tfaDone ? "#10B981" : "#C4B5FD",
              }}>
                {tfaDone ? "2FA Approved" : "2FA Approval"}
              </span>
              <span style={{ fontSize: 10, color: "#64748B" }}>
                {tfaDone ? "Biometric verified on mobile" : "Waiting for mobile verification..."}
              </span>
            </div>
          </div>
        )}

        {/* Guardian step */}
        <div
          className="flex items-center"
          style={{
            borderRadius: 10,
            padding: "10px 12px",
            backgroundColor: guardianActive || !wardHas2fa
              ? "rgba(245, 158, 11, 0.08)"
              : "rgba(100, 116, 139, 0.06)",
            border: `1px solid ${
              guardianActive || !wardHas2fa
                ? "rgba(245, 158, 11, 0.25)"
                : "rgba(100, 116, 139, 0.15)"
            }`,
            gap: 10,
          }}
        >
          {guardianActive || !wardHas2fa ? (
            <Loader className="animate-spin" style={{ width: 20, height: 20, color: "#F59E0B", flexShrink: 0 }} />
          ) : (
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                border: "1.5px solid #475569",
                flexShrink: 0,
              }}
            />
          )}
          <div className="flex flex-col" style={{ gap: 1 }}>
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "'JetBrains Mono', monospace",
              color: guardianActive || !wardHas2fa ? "#FBBF24" : "#64748B",
            }}>
              Guardian Approval
            </span>
            <span style={{ fontSize: 10, color: "#64748B" }}>
              {guardianActive || !wardHas2fa
                ? "Waiting for guardian to approve..."
                : "Pending previous step"}
            </span>
          </div>
        </div>
      </div>

      {/* Amount / To detail card */}
      {(amount || recipient) && (
        <div
          className="w-full flex flex-col"
          style={{
            borderRadius: 10,
            backgroundColor: "#0F172A",
            padding: "10px 12px",
            gap: 6,
          }}
        >
          {amount && (
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 11, fontWeight: 400, color: "#64748B" }}>Amount</span>
              <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: "#F8FAFC" }}>
                {amount} {token || "STRK"}
              </span>
            </div>
          )}
          {recipient && (
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 11, fontWeight: 400, color: "#64748B" }}>To</span>
              <span style={{ fontSize: 11, fontWeight: 500, fontFamily: "'JetBrains Mono', monospace", color: "#F8FAFC" }}>
                {truncateAddr(recipient)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Cancel */}
      <button
        onClick={onCancel}
        className="w-full flex items-center justify-center border hover:bg-[#0F172A] transition-colors"
        style={{
          height: 36,
          borderRadius: 10,
          backgroundColor: "transparent",
          borderColor: "rgba(245, 158, 11, 0.19)",
          fontSize: 12,
          fontWeight: 600,
          fontFamily: "'JetBrains Mono', monospace",
          color: "#94A3B8",
          cursor: "pointer",
        }}
      >
        Cancel Transaction
      </button>
    </div>
  );
}

export function TwoFactorWaiting({ isOpen, status, onCancel, title, subtitle, isWard, wardHas2fa, amount, token, recipient }: Props) {
  const [showGasRetry, setShowGasRetry] = useState(false);
  const [gasErrorMessage, setGasErrorMessage] = useState("");
  const gasRetryCount = useRef(0);

  useEffect(() => {
    if (!isOpen) {
      gasRetryCount.current = 0;
      setShowGasRetry(false);
      return;
    }
  }, [isOpen]);

  // Detect gas errors in status messages
  useEffect(() => {
    if (!status) return;

    if (status.toLowerCase().includes("gas too low")) {
      gasRetryCount.current += 1;
      setGasErrorMessage(status);
      setShowGasRetry(true);
    } else if (showGasRetry && !status.toLowerCase().includes("gas")) {
      setShowGasRetry(false);
    }
  }, [status]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(10, 15, 28, 0.92)" }}
      onClick={(e) => e.stopPropagation()}
    >
      {isWard ? (
        <WardWaitingContent
          status={status}
          onCancel={onCancel}
          wardHas2fa={wardHas2fa}
          amount={amount}
          token={token}
          recipient={recipient}
        />
      ) : (
        <TwoFAWaitingContent
          status={status}
          onCancel={onCancel}
          title={title}
          subtitle={subtitle}
        />
      )}

      {/* Polling dot animations */}
      <style>{`
        @keyframes pollingDot {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 1; }
        }
        .animate-poll-dot-1 {
          animation: pollingDot 1.4s ease-in-out infinite;
        }
        .animate-poll-dot-2 {
          animation: pollingDot 1.4s ease-in-out 0.2s infinite;
        }
        .animate-poll-dot-3 {
          animation: pollingDot 1.4s ease-in-out 0.4s infinite;
        }
      `}</style>

      {/* Fee retry overlay */}
      <FeeRetryModal
        isOpen={showGasRetry}
        errorMessage={gasErrorMessage}
        retryCount={gasRetryCount.current}
        onRetry={() => {
          setShowGasRetry(false);
        }}
        onCancel={onCancel}
      />
    </div>
  );
}
