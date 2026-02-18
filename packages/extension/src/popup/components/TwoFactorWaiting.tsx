import React, { useEffect, useState, useRef } from "react";
import { Smartphone } from "lucide-react";
import { FeeRetryModal } from "./FeeRetryModal";

interface Props {
  isOpen: boolean;
  status: string;
  onCancel: () => void;
  title?: string;
  subtitle?: string;
}

export function TwoFactorWaiting({ isOpen, status, onCancel, title, subtitle }: Props) {
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
      <div
        className="flex flex-col items-center border border-[rgba(59,130,246,0.2)]"
        style={{
          width: 310,
          borderRadius: 20,
          backgroundColor: "#1E293B",
          padding: "32px 20px 20px 20px",
          gap: 16,
        }}
      >
        {/* Phone icon with purple ring */}
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
          <Smartphone className="text-[#8B5CF6]" style={{ width: 28, height: 28 }} />
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
          }}
        >
          {title || "Waiting for Mobile\nApproval"}
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
          {subtitle || "Approve this transaction on your\nmobile device to continue."}
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
            className="animate-polling-dot-1"
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: "#8B5CF6",
            }}
          />
          <span
            className="animate-polling-dot-2"
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: "#8B5CF6",
            }}
          />
          <span
            className="animate-polling-dot-3"
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: "#8B5CF6",
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
            Polling...
          </span>
        </div>

        {/* Cancel button */}
        <button
          onClick={onCancel}
          className="w-full flex items-center justify-center border border-[rgba(59,130,246,0.2)] hover:bg-[#0F172A] transition-colors"
          style={{
            height: 36,
            borderRadius: 10,
            backgroundColor: "transparent",
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
        .animate-polling-dot-1 {
          animation: pollingDot 1.4s ease-in-out infinite;
        }
        .animate-polling-dot-2 {
          animation: pollingDot 1.4s ease-in-out 0.2s infinite;
        }
        .animate-polling-dot-3 {
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
