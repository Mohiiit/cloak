import React, { useEffect, useState, useRef } from "react";
import { Smartphone, ShieldCheck } from "lucide-react";
import { FeeRetryModal } from "./FeeRetryModal";

interface Props {
  isOpen: boolean;
  status: string;
  onCancel: () => void;
  title?: string;
  subtitle?: string;
  isWard?: boolean;
}

export function TwoFactorWaiting({ isOpen, status, onCancel, title, subtitle, isWard }: Props) {
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

  // Color scheme: amber for ward, purple for 2FA
  const accent = isWard ? "#F59E0B" : "#8B5CF6";
  const accentDim = isWard ? "rgba(245, 158, 11, 0.08)" : "rgba(139, 92, 246, 0.08)";
  const borderAccent = isWard ? "rgba(245, 158, 11, 0.19)" : "rgba(59, 130, 246, 0.2)";
  const dotClass = isWard ? "ward" : "tfa";

  const displayTitle = title || (isWard
    ? "Guardian Approval\nRequired"
    : "Waiting for Mobile\nApproval");
  const displaySubtitle = subtitle || (isWard
    ? "Your guardian must approve this\ntransaction before it can proceed."
    : "Approve this transaction on your\nmobile device to continue.");
  const pollingLabel = isWard ? "Awaiting guardian..." : "Polling...";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(10, 15, 28, 0.92)" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="flex flex-col items-center border"
        style={{
          width: 310,
          borderRadius: 20,
          backgroundColor: "#1E293B",
          borderColor: borderAccent,
          padding: "32px 20px 20px 20px",
          gap: 16,
        }}
      >
        {/* Icon */}
        <div
          className="flex items-center justify-center"
          style={{
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: accentDim,
            border: `2px solid ${accent}`,
          }}
        >
          {isWard ? (
            <ShieldCheck style={{ width: 28, height: 28, color: accent }} />
          ) : (
            <Smartphone style={{ width: 28, height: 28, color: accent }} />
          )}
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
          <span
            style={{
              fontSize: 11,
              fontWeight: 400,
              color: "#64748B",
            }}
          >
            Action
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "#F8FAFC",
            }}
          >
            {status || "Initializing..."}
          </span>
        </div>

        {/* Polling dots */}
        <div className="flex items-center justify-center" style={{ gap: 6 }}>
          <span
            className={`animate-${dotClass}-dot-1`}
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: accent,
            }}
          />
          <span
            className={`animate-${dotClass}-dot-2`}
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: accent,
            }}
          />
          <span
            className={`animate-${dotClass}-dot-3`}
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: accent,
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 400,
              color: "#64748B",
              marginLeft: 2,
            }}
          >
            {pollingLabel}
          </span>
        </div>

        {/* Cancel button */}
        <button
          onClick={onCancel}
          className="w-full flex items-center justify-center border hover:bg-[#0F172A] transition-colors"
          style={{
            height: 36,
            borderRadius: 10,
            backgroundColor: "transparent",
            borderColor: borderAccent,
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

      {/* Polling dot animations */}
      <style>{`
        @keyframes pollingDot {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 1; }
        }
        .animate-tfa-dot-1, .animate-ward-dot-1 {
          animation: pollingDot 1.4s ease-in-out infinite;
        }
        .animate-tfa-dot-2, .animate-ward-dot-2 {
          animation: pollingDot 1.4s ease-in-out 0.2s infinite;
        }
        .animate-tfa-dot-3, .animate-ward-dot-3 {
          animation: pollingDot 1.4s ease-in-out 0.4s infinite;
        }
      `}</style>

      {/* Fee retry overlay — shown on top of the waiting modal */}
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
