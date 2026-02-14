import React from "react";
import { AlertTriangle, RotateCw, X } from "lucide-react";
import { parseInsufficientGasError } from "@cloak-wallet/sdk";

interface Props {
  isOpen: boolean;
  onRetry: () => void;
  onCancel: () => void;
  errorMessage: string;
  retryCount: number;
}

const MAX_RETRIES = 3;

export function FeeRetryModal({ isOpen, onRetry, onCancel, errorMessage, retryCount }: Props) {
  if (!isOpen) return null;

  const gasInfo = parseInsufficientGasError(errorMessage);
  const maxRetriesReached = retryCount >= MAX_RETRIES;

  return (
    <div
      className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 animate-modal-overlay"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-[300px] bg-[#1E293B] border border-[#334155] rounded-2xl p-5 animate-modal-card">
        {/* Warning icon */}
        <div className="flex flex-col items-center mb-4">
          <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center mb-3">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
          </div>
          <h3 className="text-sm font-semibold text-white text-center">
            {maxRetriesReached
              ? "Transaction Failed"
              : "Insufficient Gas"}
          </h3>
        </div>

        {/* Gas details */}
        {gasInfo && (
          <div className="bg-[#0F172A] border border-[#334155] rounded-xl p-3 mb-3">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-gray-500">Estimated</span>
              <span className="text-gray-300 font-mono">
                {gasInfo.maxAmount.toLocaleString()} {gasInfo.resource}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Actually needed</span>
              <span className="text-amber-400 font-mono">
                {gasInfo.actualUsed.toLocaleString()} {gasInfo.resource}
              </span>
            </div>
          </div>
        )}

        {/* Status message */}
        <div className="bg-[#0F172A] border border-[#334155] rounded-xl p-3 mb-4">
          {maxRetriesReached ? (
            <p className="text-xs text-red-400 text-center">
              Maximum retries reached. Please try again later.
            </p>
          ) : (
            <p className="text-xs text-gray-400 text-center">
              Retry with higher gas?{" "}
              <span className="text-gray-300">
                (attempt {retryCount + 1} of {MAX_RETRIES})
              </span>
            </p>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-[#0F172A] border border-[#334155] text-gray-300 hover:bg-[#334155] transition-colors flex items-center justify-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
          {!maxRetriesReached && (
            <button
              onClick={onRetry}
              className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors flex items-center justify-center gap-1.5"
            >
              <RotateCw className="w-3.5 h-3.5" />
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
