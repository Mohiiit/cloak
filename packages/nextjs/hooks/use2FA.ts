"use client";

import { useState, useRef } from "react";
import { request2FAApproval } from "~~/lib/two-factor";

export function use2FA() {
  const [isWaiting, setIsWaiting] = useState(false);
  const [status, setStatus] = useState("pending");
  const abortRef = useRef<AbortController | null>(null);

  const gate = async (params: {
    walletAddress: string;
    action: string;
    token: string;
    amount?: string;
    recipient?: string;
    callsJson: string;
    sig1Json: string;
    nonce: string;
    resourceBoundsJson: string;
    txHash: string;
  }) => {
    setIsWaiting(true);
    setStatus("pending");
    abortRef.current = new AbortController();
    try {
      return await request2FAApproval({
        ...params,
        onStatusChange: setStatus,
        signal: abortRef.current.signal,
      });
    } finally {
      setIsWaiting(false);
    }
  };

  const cancel = () => abortRef.current?.abort();

  return { gate, isWaiting, status, cancel };
}
