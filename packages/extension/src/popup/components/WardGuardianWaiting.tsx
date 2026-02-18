import React from "react";
import { Check } from "lucide-react";

export type WardApprovalStep = "2fa_pending" | "2fa_done_guardian_pending" | "both_done";

interface TxDetails {
  amount: string;
  to: string;
}

interface Props {
  isOpen: boolean;
  step: WardApprovalStep;
  txDetails?: TxDetails;
  onCancel: () => void;
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 16) return addr || "--";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function WardGuardianWaiting({ isOpen, step, txDetails, onCancel }: Props) {
  if (!isOpen) return null;

  const is2FADone = step === "2fa_done_guardian_pending" || step === "both_done";
  const isGuardianDone = step === "both_done";

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
          borderColor: "rgba(59, 130, 246, 0.2)",
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
          Approvals Required
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
          {"This ward transaction requires\nboth 2FA and guardian approval."}
        </p>

        {/* Step 1 - 2FA */}
        <div
          className="w-full flex items-center"
          style={{
            borderRadius: 12,
            backgroundColor: is2FADone ? "rgba(16, 185, 129, 0.063)" : "rgba(139, 92, 246, 0.063)",
            border: is2FADone
              ? "1px solid rgba(16, 185, 129, 0.25)"
              : "1px solid rgba(139, 92, 246, 0.25)",
            padding: "12px 14px",
            gap: 12,
          }}
        >
          {/* Icon circle */}
          {is2FADone ? (
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: "#10B981",
              }}
            >
              <Check style={{ width: 16, height: 16, color: "#FFFFFF" }} />
            </div>
          ) : (
            <div
              className="flex items-center justify-center flex-shrink-0 ward-spinner"
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                border: "2px solid rgba(59, 130, 246, 0.2)",
                borderTopColor: "#8B5CF6",
              }}
            />
          )}

          {/* Text column */}
          <div className="flex flex-col" style={{ gap: 2 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: is2FADone ? "#10B981" : "#8B5CF6",
                fontFamily: "'Geist', sans-serif",
              }}
            >
              {is2FADone ? "2FA Approved" : "2FA Approval"}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 400,
                color: "#64748B",
                fontFamily: "'Geist', sans-serif",
              }}
            >
              {is2FADone ? "Biometric verified on mobile" : "Waiting for mobile approval..."}
            </span>
          </div>
        </div>

        {/* Step 2 - Guardian */}
        <div
          className="w-full flex items-center"
          style={{
            borderRadius: 12,
            backgroundColor: isGuardianDone
              ? "rgba(16, 185, 129, 0.063)"
              : "rgba(245, 158, 11, 0.063)",
            border: isGuardianDone
              ? "1px solid rgba(16, 185, 129, 0.25)"
              : "1px solid rgba(245, 158, 11, 0.25)",
            padding: "12px 14px",
            gap: 12,
          }}
        >
          {/* Icon circle */}
          {isGuardianDone ? (
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: "#10B981",
              }}
            >
              <Check style={{ width: 16, height: 16, color: "#FFFFFF" }} />
            </div>
          ) : (
            <div
              className="flex items-center justify-center flex-shrink-0 ward-spinner"
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                border: "2px solid rgba(59, 130, 246, 0.2)",
                borderTopColor: "#F59E0B",
              }}
            />
          )}

          {/* Text column */}
          <div className="flex flex-col" style={{ gap: 2 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: isGuardianDone ? "#10B981" : "#F59E0B",
                fontFamily: "'Geist', sans-serif",
              }}
            >
              {isGuardianDone ? "Guardian Approved" : "Guardian Approval"}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 400,
                color: "#64748B",
                fontFamily: "'Geist', sans-serif",
              }}
            >
              {isGuardianDone
                ? "Guardian signed the transaction"
                : "Waiting for guardian to approve..."}
            </span>
          </div>
        </div>

        {/* Transaction Details */}
        {txDetails && (
          <div
            className="w-full flex flex-col"
            style={{
              borderRadius: 10,
              backgroundColor: "#0F172A",
              border: "1px solid rgba(59, 130, 246, 0.2)",
              padding: "12px 14px",
              gap: 8,
            }}
          >
            <div className="flex items-center justify-between">
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 400,
                  color: "#64748B",
                  fontFamily: "'Geist', sans-serif",
                }}
              >
                Amount
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#F8FAFC",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {txDetails.amount}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 400,
                  color: "#64748B",
                  fontFamily: "'Geist', sans-serif",
                }}
              >
                To
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#F8FAFC",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {truncateAddress(txDetails.to)}
              </span>
            </div>
          </div>
        )}

        {/* Cancel Button */}
        <button
          onClick={onCancel}
          className="w-full flex items-center justify-center border hover:bg-[#0F172A] transition-colors"
          style={{
            height: 38,
            borderRadius: 10,
            backgroundColor: "transparent",
            borderColor: "rgba(59, 130, 246, 0.2)",
            fontSize: 13,
            fontWeight: 500,
            fontFamily: "'Geist', sans-serif",
            color: "#94A3B8",
            cursor: "pointer",
          }}
        >
          Cancel Transaction
        </button>
      </div>

      {/* Spinner animation */}
      <style>{`
        @keyframes wardSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .ward-spinner {
          animation: wardSpin 1s linear infinite;
        }
      `}</style>
    </div>
  );
}
