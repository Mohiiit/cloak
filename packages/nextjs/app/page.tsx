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
  const { shieldedDisplay, pending, nonce } = useTongoBalance();
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

      {/* Quick actions — 3 colored-border row buttons */}
      <div className="flex flex-col gap-2">
        <Link
          href="/send"
          className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/30 border-l-[3px] border-l-blue-500 hover:border-blue-500/50 transition-all"
        >
          <Send className="w-5 h-5 text-blue-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-200">Send</p>
            <p className="text-[11px] text-slate-500">Private shielded payment</p>
          </div>
        </Link>

        <Link
          href="/wallet?mode=shield"
          className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/30 border-l-[3px] border-l-emerald-500 hover:border-emerald-500/50 transition-all"
        >
          <Shield className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-200">Shield</p>
            <p className="text-[11px] text-slate-500">Deposit into private pool</p>
          </div>
        </Link>

        <Link
          href="/wallet?mode=unshield"
          className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/30 border-l-[3px] border-l-violet-500 hover:border-violet-500/50 transition-all"
        >
          <ArrowDownToLine className="w-5 h-5 text-violet-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-200">Unshield</p>
            <p className="text-[11px] text-slate-500">Withdraw to public wallet</p>
          </div>
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

      {/* Status footer */}
      <div className="flex items-center justify-center gap-2 py-2">
        <div className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="text-xs text-slate-500">Sepolia</span>
        <span className="text-xs text-slate-500 opacity-50">|</span>
        <span className="text-xs text-slate-500">Nonce: {nonce.toString()}</span>
      </div>
    </div>
  );
}

export default function Home() {
  const { status } = useAccount();
  const isConnected = status === "connected";

  return isConnected ? <ConnectedHome /> : <HeroSection />;
}
