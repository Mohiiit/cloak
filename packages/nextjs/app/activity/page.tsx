"use client";

import React from "react";
import {
  Shield,
  ShieldPlus,
  Download,
  Upload,
  ShieldOff,
  RotateCw,
  AlertTriangle,
  Clock,
  RefreshCw,
} from "lucide-react";
import { useAccount } from "@starknet-react/core";
import { useTongoHistory, type TongoEvent } from "~~/hooks/useTongoHistory";

function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp * 1000;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

function ActivityItem({ event }: { event: TongoEvent }) {
  const typeLabels: Record<string, string> = {
    fund: "Shielded funds",
    transferIn: "Received payment",
    transferOut: "Sent payment",
    withdraw: "Unshielded funds",
    rollover: "Claimed pending",
    ragequit: "Emergency withdrawal",
  };

  const typeIcons: Record<string, React.ReactNode> = {
    fund: <ShieldPlus className="w-5 h-5 text-emerald-400" />,
    transferIn: <Download className="w-5 h-5 text-blue-400" />,
    transferOut: <Upload className="w-5 h-5 text-violet-400" />,
    withdraw: <ShieldOff className="w-5 h-5 text-amber-400" />,
    rollover: <RotateCw className="w-5 h-5 text-blue-300" />,
    ragequit: <AlertTriangle className="w-5 h-5 text-red-400" />,
  };

  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-800/50 border border-slate-700/30">
      <div className="mt-0.5">{typeIcons[event.type] || <Shield className="w-5 h-5 text-blue-400" />}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-sm font-medium text-slate-200">
            {typeLabels[event.type] || event.type}
          </span>
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {event.timestamp ? getRelativeTime(event.timestamp) : "—"}
          </span>
        </div>
        {event.note && (
          <p className="text-sm text-slate-400 mt-0.5">{event.note}</p>
        )}
        {event.counterpartyName && (
          <p className="text-xs text-slate-500 mt-1">
            {event.type === "transferOut" ? "To: " : "From: "}
            {event.counterpartyName}
          </p>
        )}
        {event.txHash && (
          <p className="text-xs text-slate-600 mt-1 font-mono truncate">
            tx: {event.txHash}
          </p>
        )}
      </div>
      <Shield className="w-4 h-4 text-violet-400 mt-1 shrink-0" />
    </div>
  );
}

export default function ActivityPage() {
  const { status } = useAccount();
  const { events, isLoading, refresh } = useTongoHistory();

  if (status !== "connected") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <Clock className="w-12 h-12 text-slate-600 mb-4" />
        <p className="text-slate-400">
          Connect your wallet to view activity
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-50">Activity</h1>
        <button
          onClick={refresh}
          disabled={isLoading}
          className="text-slate-400 hover:text-slate-200 transition-colors"
        >
          <RefreshCw
            className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {isLoading && events.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
        </div>
      ) : events.length > 0 ? (
        <div className="flex flex-col gap-2">
          {events.map((event, i) => (
            <ActivityItem key={event.txHash || i} event={event} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-slate-500">
          <Shield className="w-10 h-10 mx-auto mb-3 text-slate-600" />
          <p className="text-sm">No activity yet</p>
          <p className="text-xs mt-1">
            Your shielded transactions will appear here
          </p>
        </div>
      )}
    </div>
  );
}
