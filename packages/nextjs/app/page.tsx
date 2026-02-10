"use client";

import { Shield, Send, ArrowDownToLine } from "lucide-react";
import Link from "next/link";
import { useAccount } from "@starknet-react/core";
import { useTongo } from "~~/components/providers/TongoProvider";
import { useTongoBalance } from "~~/hooks/useTongoBalance";
import { useTongoHistory, type TongoEvent } from "~~/hooks/useTongoHistory";

function HeroSection() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-6">
      <div className="relative">
        <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-3xl" />
        <Shield className="w-20 h-20 text-blue-500 relative" />
      </div>
      <div>
        <h1 className="text-4xl font-bold text-slate-50 mb-2">Cloak</h1>
        <p className="text-slate-400 text-lg">
          Social payments, cryptographically private.
        </p>
      </div>
      <p className="text-slate-500 text-sm max-w-xs">
        Connect your Starknet wallet to send shielded payments with notes and
        emojis — amounts always hidden.
      </p>
    </div>
  );
}

function FeedItem({ event }: { event: TongoEvent }) {
  const typeLabels: Record<string, string> = {
    fund: "Shielded funds",
    transferIn: "Received payment",
    transferOut: "Sent payment",
    withdraw: "Unshielded funds",
    rollover: "Claimed pending",
    ragequit: "Emergency withdrawal",
  };

  const typeIcons: Record<string, string> = {
    fund: "🛡️",
    transferIn: "📥",
    transferOut: "📤",
    withdraw: "🏦",
    rollover: "🔄",
    ragequit: "🚨",
  };

  const timeAgo = event.timestamp ? getRelativeTime(event.timestamp) : "";

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/30">
      <div className="text-xl mt-0.5">{typeIcons[event.type] || "🛡️"}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-200">
            {typeLabels[event.type] || event.type}
          </span>
          <span className="text-xs text-slate-500">{timeAgo}</span>
        </div>
        {event.note && (
          <p className="text-sm text-slate-400 mt-0.5 truncate">
            {event.note}
          </p>
        )}
        {event.counterpartyName && (
          <p className="text-xs text-slate-500 mt-0.5">
            {event.counterpartyName}
          </p>
        )}
      </div>
      <div className="flex items-center">
        <Shield className="w-3.5 h-3.5 text-violet-400" />
      </div>
    </div>
  );
}

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

function ConnectedHome() {
  const { selectedToken } = useTongo();
  const { shieldedDisplay, pending } = useTongoBalance();
  const { events, isLoading } = useTongoHistory();

  return (
    <div className="flex flex-col gap-5">
      {/* Balance hero card */}
      <Link
        href="/wallet"
        className="relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-blue-600/20 via-slate-800 to-violet-600/20 border border-blue-500/20 hover:border-blue-500/40 transition-all group"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -translate-y-8 translate-x-8" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-violet-500/10 rounded-full blur-2xl translate-y-6 -translate-x-6" />
        <div className="relative">
          <div className="flex items-center gap-1.5 mb-2">
            <Shield className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">
              Shielded Balance
            </span>
          </div>
          <div className="text-3xl font-bold text-slate-50 mb-1">
            {shieldedDisplay}{" "}
            <span className="text-lg text-slate-400">{selectedToken}</span>
          </div>
          {pending > 0n && (
            <div className="flex items-center gap-1.5 mt-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-xs text-amber-400/80">
                Pending funds available to claim
              </span>
            </div>
          )}
        </div>
      </Link>

      {/* Quick actions */}
      <div className="flex gap-3">
        <Link
          href="/send"
          className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 px-4 font-medium transition-colors"
        >
          <Send className="w-4 h-4" />
          Send
        </Link>
        <Link
          href="/wallet"
          className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl py-3 px-4 font-medium border border-slate-700/50 transition-colors"
        >
          <ArrowDownToLine className="w-4 h-4" />
          Wallet
        </Link>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-sm font-medium text-slate-400 mb-3">
          Recent Activity
        </h2>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
          </div>
        ) : events.length > 0 ? (
          <div className="flex flex-col gap-2">
            {events.slice(0, 10).map((event, i) => (
              <FeedItem key={event.txHash || i} event={event} />
            ))}
          </div>
        ) : (
          <div className="text-center py-10">
            <div className="relative inline-block mb-4">
              <div className="absolute inset-0 bg-blue-500/15 rounded-full blur-xl" />
              <Shield className="w-12 h-12 text-slate-600 relative" />
            </div>
            <p className="text-sm text-slate-400 mb-1">No transactions yet</p>
            <p className="text-xs text-slate-500">
              Head to <span className="text-blue-400">Wallet</span> to shield
              funds and start sending
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const { status } = useAccount();
  const isConnected = status === "connected";

  return isConnected ? <ConnectedHome /> : <HeroSection />;
}
