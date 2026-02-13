"use client";

import React, { useEffect, useState } from "react";

interface TwoFactorWaitingProps {
  isOpen: boolean;
  status: string;
  onCancel: () => void;
}

export function TwoFactorWaiting({ isOpen, status, onCancel }: TwoFactorWaitingProps) {
  const [elapsed, setElapsed] = useState(0);

  // Countdown timer: 5 minutes = 300 seconds
  useEffect(() => {
    if (!isOpen) {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const remaining = Math.max(300 - elapsed, 0);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  const statusColor =
    status === "approved"
      ? "text-green-400"
      : status === "rejected"
        ? "text-red-400"
        : "text-yellow-400";

  const statusLabel =
    status === "approved"
      ? "Approved"
      : status === "rejected"
        ? "Rejected"
        : status === "timeout"
          ? "Timed out"
          : "Pending";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/95 backdrop-blur-sm px-4">
      <div className="bg-slate-800 rounded-2xl p-8 w-full max-w-sm border border-slate-700/50 flex flex-col items-center text-center gap-5">
        {/* Pulsing phone icon */}
        <div className="relative">
          <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-2xl animate-pulse" />
          <div
            className="relative text-5xl animate-2fa-pulse"
            role="img"
            aria-label="Mobile phone"
          >
            {"\uD83D\uDCF1"}
          </div>
        </div>

        {/* Title */}
        <div>
          <h3 className="text-lg font-semibold text-slate-50 mb-1">
            Waiting for mobile approval...
          </h3>
          <p className="text-sm text-slate-400">
            Open the Cloak mobile app to approve this transaction
          </p>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              status === "approved"
                ? "bg-green-400"
                : status === "rejected"
                  ? "bg-red-400"
                  : "bg-yellow-400 animate-pulse"
            }`}
          />
          <span className={`text-sm font-medium ${statusColor}`}>
            {statusLabel}
          </span>
        </div>

        {/* Countdown */}
        <div className="text-2xl font-mono text-slate-300 tabular-nums">
          {timeStr}
        </div>
        <p className="text-xs text-slate-500 -mt-3">
          Request expires in {minutes > 0 ? `${minutes}m ` : ""}{seconds}s
        </p>

        {/* Cancel button */}
        <button
          onClick={onCancel}
          className="w-full py-2.5 rounded-xl text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
        >
          Cancel
        </button>

        {/* Pulse animation keyframes via inline style tag */}
        <style>{`
          @keyframes twofa-pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
          }
          .animate-2fa-pulse {
            animation: twofa-pulse 2s ease-in-out infinite;
          }
        `}</style>
      </div>
    </div>
  );
}
