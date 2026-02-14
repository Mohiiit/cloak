import React, { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";

interface Props {
  isOpen: boolean;
  status: string;
  onCancel: () => void;
  title?: string;
  subtitle?: string;
}

const TIMEOUT_SECONDS = 5 * 60; // 5 minutes

export function TwoFactorWaiting({ isOpen, status, onCancel, title, subtitle }: Props) {
  const [countdown, setCountdown] = useState(TIMEOUT_SECONDS);

  useEffect(() => {
    if (!isOpen) {
      setCountdown(TIMEOUT_SECONDS);
      return;
    }

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 0) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  // Determine status color
  const isApproved = status.toLowerCase().includes("approved");
  const isRejected = status.toLowerCase().includes("rejected") || status.toLowerCase().includes("timed out");
  const statusColor = isApproved
    ? "text-green-400"
    : isRejected
      ? "text-red-400"
      : "text-blue-400";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 animate-modal-overlay"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-[320px] bg-[#1E293B] border border-[#334155] rounded-2xl p-6 animate-modal-card">
        {/* Pulsing phone icon */}
        <div className="flex flex-col items-center mb-5">
          <div className="relative mb-4">
            <div className="absolute inset-0 w-16 h-16 rounded-full bg-blue-500/20 animate-ping" />
            <div className="relative w-16 h-16 rounded-full bg-blue-500/15 flex items-center justify-center">
              <Smartphone className="w-8 h-8 text-blue-400" />
            </div>
          </div>
          <h3 className="text-base font-semibold text-white mb-1">
            {title || "Mobile Approval Required"}
          </h3>
          <p className="text-xs text-gray-400 text-center">
            {subtitle || "Open the Cloak mobile app to approve this transaction"}
          </p>
        </div>

        {/* Status */}
        <div className="bg-[#0F172A] border border-[#334155] rounded-xl p-3 mb-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
            Status
          </p>
          <p className={`text-sm font-medium ${statusColor} transition-colors duration-300`}>
            {status || "Initializing..."}
          </p>
        </div>

        {/* Countdown */}
        <div className="bg-[#0F172A] border border-[#334155] rounded-xl p-3 mb-5">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
            Time Remaining
          </p>
          <p className="text-lg font-mono text-white">{timeStr}</p>
          {/* Progress bar */}
          <div className="mt-2 h-1 bg-[#334155] rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-linear"
              style={{
                width: `${(countdown / TIMEOUT_SECONDS) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Cancel button */}
        <button
          onClick={onCancel}
          className="w-full py-2.5 rounded-xl text-sm font-medium bg-[#0F172A] border border-[#334155] text-gray-300 hover:bg-[#334155] transition-colors flex items-center justify-center gap-2"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
      </div>
    </div>
  );
}
