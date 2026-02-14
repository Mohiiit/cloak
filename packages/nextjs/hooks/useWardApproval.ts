"use client";

import { useState, useRef } from "react";
import {
  requestWardApproval,
  checkWardApprovalNeeds,
  type WardApprovalResult,
  type WardApprovalNeeds,
} from "~~/lib/ward-approval";

export function useWardApproval() {
  const [isWaiting, setIsWaiting] = useState(false);
  const [status, setStatus] = useState("idle");
  const abortRef = useRef<AbortController | null>(null);

  const checkNeeds = async (
    wardAddress: string,
  ): Promise<WardApprovalNeeds | null> => {
    return checkWardApprovalNeeds(wardAddress);
  };

  const gate = async (params: {
    wardAddress: string;
    guardianAddress: string;
    action: string;
    token: string;
    amount?: string | null;
    recipient?: string | null;
    callsJson: string;
    wardSigJson: string;
    nonce: string;
    resourceBoundsJson: string;
    txHash: string;
    needsWard2fa: boolean;
    needsGuardian: boolean;
    needsGuardian2fa: boolean;
  }): Promise<WardApprovalResult> => {
    setIsWaiting(true);
    setStatus("pending");
    abortRef.current = new AbortController();
    try {
      return await requestWardApproval({
        ...params,
        amount: params.amount ?? null,
        recipient: params.recipient ?? null,
        onStatusChange: setStatus,
        signal: abortRef.current.signal,
      });
    } finally {
      setIsWaiting(false);
    }
  };

  const cancel = () => abortRef.current?.abort();

  return { checkNeeds, gate, isWaiting, status, cancel };
}
