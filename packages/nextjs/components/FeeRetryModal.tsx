"use client";

import React from "react";
import { parseInsufficientGasError } from "@cloak-wallet/sdk";

interface FeeRetryModalProps {
  isOpen: boolean;
  errorMessage: string;
  retryCount: number;
  maxRetries?: number;
  isRetrying?: boolean;
  onRetry: () => void;
  onCancel: () => void;
}

export function FeeRetryModal({
  isOpen,
  errorMessage,
  retryCount,
  maxRetries = 3,
  isRetrying = false,
  onRetry,
  onCancel,
}: FeeRetryModalProps) {
  if (!isOpen) return null;

  const gasInfo = parseInsufficientGasError(errorMessage);
  const canRetry = retryCount < maxRetries;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/95 backdrop-blur-sm px-4">
      <div className="bg-slate-800 rounded-2xl p-8 w-full max-w-sm border border-amber-500/30 flex flex-col items-center text-center gap-5">
        {/* Warning icon */}
        <div className="w-14 h-14 rounded-full bg-amber-500/20 border-2 border-amber-500/40 flex items-center justify-center">
          <span className="text-3xl text-amber-400">&#x26A0;</span>
        </div>

        {/* Title */}
        <div>
          <h3 className="text-lg font-semibold text-slate-50 mb-1">
            Insufficient Gas
          </h3>
          <p className="text-sm text-slate-400">
            {canRetry
              ? "The transaction failed because the gas estimate was too low. Would you like to retry with a higher gas limit?"
              : "Maximum retries reached. The network may be congested. Please try again later."}
          </p>
        </div>

        {/* Gas details */}
        {gasInfo && (
          <div className="w-full bg-slate-900/60 rounded-xl p-4 text-left space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Estimated gas:</span>
              <span className="text-slate-300 font-mono">
                {gasInfo.maxAmount.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Actual needed:</span>
              <span className="text-red-400 font-mono">
                {gasInfo.actualUsed.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Safety multiplier:</span>
              <span className="text-amber-400 font-mono">
                {gasInfo.suggestedMultiplier}x
              </span>
            </div>
          </div>
        )}

        {/* Retry count */}
        {retryCount > 0 && (
          <p className="text-xs text-slate-500">
            Attempt {retryCount} of {maxRetries}
          </p>
        )}

        {/* Buttons */}
        <div className="flex gap-3 w-full">
          <button
            onClick={onCancel}
            disabled={isRetrying}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          {canRetry && (
            <button
              onClick={onRetry}
              disabled={isRetrying}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-amber-500 hover:bg-amber-400 text-white transition-colors disabled:opacity-60"
            >
              {isRetrying ? (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Retry with Higher Gas"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
